/**
 * ==========================================================
 * TT Tournament Manager
 * Draw.gs
 * Версия 0.1
 * ----------------------------------------------------------
 * Отвечает ТОЛЬКО за жеребьёвку:
 *  - посев участников (по рейтингу)
 *  - формирование групп (змейкой, с учётом посева)
 *  - генерация матчей группового этапа (круговая внутри группы)
 *  - построение сетки плей-офф / олимпийской системы (раунд 1)
 *
 * ЧЕСТНО О ГРАНИЦАХ МОДУЛЯ:
 * Полноценная швейцарская система требует пересчёта пар после
 * каждого тура по текущим результатам — это делается в паре
 * с Matches.gs (учёт результатов), которого пока нет.
 * Поэтому startSwissRound1() строит только первый тур
 * (стандартная пара "верхняя половина vs нижняя половина"),
 * а расчёт последующих туров будет добавлен вместе с Matches.gs.
 * ==========================================================
 */

// Порядок уровней игры от сильного к слабому — используется при
// посеве для тех, у кого нет подтверждённого числового рейтинга
// (см. Draw.seedPlayers). Должен соответствовать FORM_LEVEL_OPTIONS
// из Forms.gs, только в обратном порядке.
const LEVEL_STRENGTH_ORDER = ["МС", "КМС", "Спортсмен", "Опытный любитель", "Любитель", "Новичок"];

class Draw {

  // ========================================================
  // ПОСЕВ
  // ========================================================

  /**
   * Сортирует участников по рейтингу (по убыванию, без рейтинга —
   * в конец, порядок между ними не меняется) и проставляет номер
   * посева в столбец "Посев" листа "Участники". Также заполняет
   * отдельный лист "Посев" читаемым списком.
   */
  static seedPlayers() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = Participants.getParticipantsSheet(ss);

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      throw new DrawError("В списке участников пока никого нет.");
    }

    const config = ConfigService.load();
    const categoryMap = Categories.assign(data, config.mixedTournament);

    const rows = [];
    for (let i = 1; i < data.length; i++) {
      const status = data[i][10];
      if (status === "Снят" || status === "Дисквалифицирован" || status === "В паре") continue;

      // Рейтинг участвует в посеве, ТОЛЬКО если организатор подтвердил
      // его в столбце "Рейтинг подтверждён" (значение "Да"). Иначе —
      // даже если участник сам вписал число через форму регистрации —
      // он считается непосеянным по рейтингу (уходит в конец списка,
      // как и вообще без рейтинга). Это защита от того, что кто-то
      // впишет себе рейтинг "от балды", чтобы попасть в верхний посев.
      const ratingConfirmed = data[i][11] === "Да";
      const rawRating = data[i][8];
      const hasRating = ratingConfirmed && rawRating !== "" && !isNaN(Number(rawRating));

      rows.push({
        rowIndex: i,          // индекс в data (для записи обратно)
        id: data[i][0],
        fio: data[i][1],
        level: data[i][7],
        rating: hasRating ? Number(rawRating) : 0,
        hasRating,
        category: categoryMap.get(i) || ""
      });
    }

    if (rows.length === 0) {
      throw new DrawError("Нет участников, доступных для посева (все имеют статус «Снят»/«Дисквалифицирован»).");
    }

    // Стабильная сортировка: с рейтингом — по убыванию рейтинга
    // (это и есть "посев" — верхних разводят по разным частям сетки).
    //
    // Без подтверждённого рейтинга — используем указанный при
    // регистрации "Уровень" (Новичок/Любитель/.../МС) как более
    // грубый, но всё же осмысленный сигнал: сначала группируем от
    // сильных к слабым по уровню, а НАСТОЯЩАЯ случайная жеребьёвка
    // (Fisher-Yates) идёт уже ВНУТРИ одной группы уровня — так
    // новичок не окажется в паре с опытным любителем только потому,
    // что оба "перемешались вместе" без разбора уровня.
    const withRating = rows.filter(r => r.hasRating).sort((a, b) => b.rating - a.rating);
    const withoutRating = rows.filter(r => !r.hasRating);

    const byLevel = {};
    const unknownLevel = [];
    withoutRating.forEach(r => {
      if (LEVEL_STRENGTH_ORDER.indexOf(r.level) === -1) {
        unknownLevel.push(r);
      } else {
        if (!byLevel[r.level]) byLevel[r.level] = [];
        byLevel[r.level].push(r);
      }
    });

    let shuffledWithoutRating = [];
    LEVEL_STRENGTH_ORDER.forEach(level => {
      if (byLevel[level]) shuffledWithoutRating = shuffledWithoutRating.concat(this.shuffle(byLevel[level]));
    });
    shuffledWithoutRating = shuffledWithoutRating.concat(this.shuffle(unknownLevel)); // не указан/нестандартный уровень — в конец, тоже честно перемешаны

    const ordered = withRating.concat(shuffledWithoutRating);

    ordered.forEach((r, i) => {
      data[r.rowIndex][9] = i + 1;         // столбец "Посев"
      data[r.rowIndex][17] = r.category;   // столбец "Категория"
    });

    sheet.getRange(1, 1, data.length, data[0].length).setValues(data);

    this.writeSeedSheet(ss, ordered);

    AppLog.write("Посев", `Расставлен посев для ${ordered.length} участников`);

    return { seeded: ordered.length };
  }

  static writeSeedSheet(ss, ordered) {
    const sheet = Theme.findSheetByBaseName(ss, "Посев") || ss.getSheetByName("Посев");
    if (!sheet) return;

    sheet.clear();
    sheet.getRange(1, 1, 1, 4).setValues([["Посев", "ФИО", "Рейтинг", "Категория"]]);

    const rows = ordered.map((r, i) => [i + 1, r.fio, r.hasRating ? r.rating : "—", r.category || ""]);
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 4).setValues(rows);
    }

    sheet.getRange(1, 1, 1, 4)
      .setFontWeight("bold")
      .setBackground("#8E24AA")
      .setFontColor("#FFFFFF");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 70);
    sheet.setColumnWidth(2, 250);
    sheet.setColumnWidth(3, 100);
    sheet.setColumnWidth(4, 160);
  }

  // ========================================================
  // ГРУППЫ
  // ========================================================

  /**
   * Распределяет посеянных участников по группам змейкой
   * (1-2-3-...-N-N-...-3-2-1-1-2-3-...), чтобы сила групп была
   * максимально ровной. Требует, чтобы seedPlayers() уже был
   * запущен (используется столбец "Посев").
   */
  static createGroups() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const config = ConfigService.load();
    const groupSize = Number(config.groupSize) || CONFIG.DEFAULT_GROUP_SIZE;

    const categories = Categories.activeLabels(ss);
    const byCategory = [];

    categories.forEach(category => {
      const seeded = this.getSeededParticipants(ss, category);
      if (seeded.length === 0) return; // категория без посеянных участников — пропускаем, не ошибка

      const groupsCount = Math.max(1, Math.ceil(seeded.length / groupSize));
      const groups = Array.from({ length: groupsCount }, () => []);

      let dir = 1;
      let g = 0;
      seeded.forEach(player => {
        groups[g].push(player);
        if (dir === 1 && g === groupsCount - 1) {
          dir = -1;
        } else if (dir === -1 && g === 0) {
          dir = 1;
        } else {
          g += dir;
        }
      });

      byCategory.push({ category, groups, groupsCount });
    });

    if (byCategory.length === 0) {
      throw new DrawError("Сначала выполните «Посев» (Жеребьёвка → Посев).");
    }

    this.removeGroupMatches(ss);
    this.writeGroupsSheet(ss, byCategory);

    let matchesAdded = 0;
    byCategory.forEach(entry => {
      matchesAdded += this.generateGroupMatches(ss, entry.groups, config, entry.category);
    });

    const summary = byCategory.map(e => ({ category: e.category, groupsCount: e.groupsCount }));
    AppLog.write(
      "Группы сформированы",
      summary.map(s => `${s.category || "Общий зачёт"}: групп ${s.groupsCount}`).join("; ") +
      `, матчей группового этапа: ${matchesAdded}`
    );

    return { byCategory: summary, matchesAdded };
  }

  static getSeededParticipants(ss, category) {
    const sheet = Participants.getParticipantsSheet(ss);
    const data = sheet.getDataRange().getValues();
    const players = [];

    for (let i = 1; i < data.length; i++) {
      const status = data[i][10];
      const seed = data[i][9];
      const rowCategory = data[i][17] || "";
      if (status === "Снят" || status === "Дисквалифицирован" || status === "В паре") continue;
      if (seed === "" || seed === null || isNaN(Number(seed))) continue;
      if (rowCategory !== (category || "")) continue;

      players.push({
        id: data[i][0],
        fio: data[i][1],
        seed: Number(seed)
      });
    }

    return players.sort((a, b) => a.seed - b.seed);
  }

  static writeGroupsSheet(ss, byCategory) {
    const sheet = Theme.findSheetByBaseName(ss, "Группы") || ss.getSheetByName("Группы");
    if (!sheet) return;

    const existingFilter = sheet.getFilter();
    if (existingFilter) existingFilter.remove();

    sheet.clear();

    let row = 1;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    byCategory.forEach(({ category, groups }) => {
      if (category) {
        sheet.getRange(row, 1).setValue(`═══ ${category} ═══`)
          .setFontWeight("bold").setBackground("#4527A0").setFontColor("#FFFFFF");
        sheet.getRange(row, 1, 1, 3).merge();
        row++;
      }

      groups.forEach((group, gi) => {
        sheet.getRange(row, 1).setValue(`Группа ${letters[gi] || gi + 1}`)
          .setFontWeight("bold")
          .setBackground("#8E24AA")
          .setFontColor("#FFFFFF");
        sheet.getRange(row, 1, 1, 3).merge();
        row++;

        sheet.getRange(row, 1, 1, 3).setValues([["Посев", "ФИО", "ID"]]).setFontWeight("bold");
        row++;

        group.forEach(player => {
          sheet.getRange(row, 1, 1, 3).setValues([[player.seed, player.fio, player.id]]);
          row++;
        });

        row++; // пустая строка-разделитель между группами
      });

      row++; // доп. пустая строка между категориями
    });

    sheet.setColumnWidth(1, 70);
    sheet.setColumnWidth(2, 250);
    sheet.setColumnWidth(3, 60);
  }

  /**
   * Читает лист "Группы" обратно в ту же структуру, которую пишет
   * writeGroupsSheet (byCategory: [{category, groups: [[player,...],...]}]).
   * Нужен, чтобы организатор мог вручную поправить состав групп прямо
   * на листе (перенести строку игрока в другую группу — например,
   * когда деление по groupSize оставило "лишнего" человека) и потом
   * пересчитать матчи именно по этому, а не по исходному автосоставу.
   * Понимает собственный формат листа: секции "═══ Категория ═══",
   * заголовки "Группа X", строка "Посев|ФИО|ID" и строки игроков
   * [seed, fio, id]. Пустая категория (без секции) — просто groups
   * без обёртки, category = "".
   */
  static readGroupsSheet(ss) {
    const sheet = Theme.findSheetByBaseName(ss, "Группы") || ss.getSheetByName("Группы");
    if (!sheet) return [];

    const lastRow = sheet.getLastRow();
    if (lastRow === 0) return [];
    const data = sheet.getRange(1, 1, lastRow, 3).getValues();

    const byCategory = [];
    let currentCategory = { category: "", groups: [] };
    let currentGroup = null;
    let hasCategorySection = false;

    const pushCurrentCategory = () => {
      if (currentGroup && currentGroup.length > 0) currentCategory.groups.push(currentGroup);
      currentGroup = null;
      if (currentCategory.groups.length > 0) byCategory.push(currentCategory);
    };

    data.forEach(row => {
      const a = String(row[0] || "").trim();
      const b = String(row[1] || "").trim();

      const categoryMatch = a.match(/^═══ (.+) ═══$/);
      if (categoryMatch) {
        pushCurrentCategory();
        currentCategory = { category: categoryMatch[1], groups: [] };
        hasCategorySection = true;
        return;
      }

      if (a.indexOf("Группа ") === 0) {
        if (currentGroup && currentGroup.length > 0) currentCategory.groups.push(currentGroup);
        currentGroup = [];
        return;
      }

      if (a === "Посев" && b === "ФИО") return; // строка-подзаголовок таблицы
      if (a === "" && b === "") return; // строка-разделитель

      if (currentGroup && row[2] !== "" && row[2] !== null) {
        currentGroup.push({ seed: Number(row[0]) || "", fio: b, id: row[2] });
      }
    });

    pushCurrentCategory();

    // Без единой секции "═══ Категория ═══" (смешанный турнир без
    // категорий) — единственная "категория" в списке уже собрана как
    // currentCategory с category === ""; hasCategorySection не влияет
    // на структуру результата, нужен только для читаемости выше.
    return byCategory;
  }

  /**
   * Пересчитывает матчи группового этапа ПО ТЕКУЩЕМУ СОСТОЯНИЮ листа
   * "Группы" (а не по исходному автоматическому разбиению) — используется
   * после того, как организатор вручную поправил состав групп на самом
   * листе. Старые матчи группового этапа удаляются и генерируются заново
   * (см. removeGroupMatches), остальные типы матчей (плей-офф/швейцария/DE)
   * не трогаются.
   */
  static regenerateGroupMatchesFromSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const config = ConfigService.load();

    const byCategory = this.readGroupsSheet(ss);
    if (byCategory.length === 0) {
      throw new DrawError('Лист «Группы» пуст. Сначала создайте группы (Жеребьёвка → Создать группы).');
    }

    this.removeGroupMatches(ss);

    let matchesAdded = 0;
    byCategory.forEach(entry => {
      matchesAdded += this.generateGroupMatches(ss, entry.groups, config, entry.category);
    });

    const summary = byCategory.map(e => ({ category: e.category, groupsCount: e.groups.length }));
    AppLog.write(
      "Матчи группового этапа пересчитаны по листу «Группы»",
      summary.map(s => `${s.category || "Общий зачёт"}: групп ${s.groupsCount}`).join("; ") +
      `, матчей: ${matchesAdded}`
    );

    return { byCategory: summary, matchesAdded };
  }

  /**
   * Круговая система внутри каждой группы — генерируется через
   * классический алгоритм "circle method": матчи разбиваются на
   * туры, внутри одного тура каждый игрок встречается только один
   * раз. Туры чередуются между группами (сначала туры №1 всех
   * групп, потом №2 и т.д.) — это гарантирует, что один и тот же
   * человек не окажется в двух матчах подряд по возрастанию ID.
   */
  static generateGroupMatches(ss, groups, config, category) {
    const matchesSheet = Theme.findSheetByBaseName(ss, "Матчи") || ss.getSheetByName("Матчи");
    if (!matchesSheet) return 0;

    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    // Для каждой группы считаем список туров (раундов) через circle method,
    // затем переставляем туры так, чтобы ПОСЛЕДНИМ шёл тот, где встречаются
    // кандидаты на решающие места (п. 5.2.5 правил — последний матч группы
    // должен решать, кто выходит дальше). Эвристика по посеву: если из
    // группы выходит N человек, ставим последним матч между #N и #(N+1)
    // по текущему посеву внутри группы.
    const groupRounds = groups.map(group => {
      const rounds = this.roundRobinRounds(group);
      this.reorderDecidingMatchLast(rounds, group, config.qualify);
      return rounds;
    });
    const maxRounds = Math.max(...groupRounds.map(r => r.length), 0);

    let nextId = this.getNextMatchId(matchesSheet);
    const rows = [];

    for (let roundIndex = 0; roundIndex < maxRounds; roundIndex++) {
      groupRounds.forEach((rounds, gi) => {
        const round = rounds[roundIndex];
        if (!round) return; // в этой группе туров меньше (не все группы одного размера)

        const groupLabel = `Группа ${letters[gi] || gi + 1}`;
        const roundLabel = `${groupLabel}, тур ${roundIndex + 1}`;

        round.forEach(pair => {
          // Стол НЕ назначаем заранее — он проставится автоматически
          // в момент реального старта матча (Matches.startNextMatch),
          // когда известно, какой стол физически свободен прямо сейчас
          rows.push([
            nextId, roundLabel, "", pair[0].fio, pair[1].fio,
            "", "", "Ожидает", "", "", "", "", pair[0].id, pair[1].id, "", category || ""
          ]);
          nextId++;
        });
      });
    }

    if (rows.length > 0) {
      const startRow = matchesSheet.getLastRow() + 1;
      matchesSheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
    }

    return rows.length;
  }

  /**
   * Классический circle method: возвращает массив туров, каждый —
   * массив пар [игрок, игрок], где внутри тура ни один игрок не
   * повторяется. При нечётном числе игроков добавляется "бай" —
   * в этот тур у одного игрока нет матча (пара просто пропускается).
   */
  static roundRobinRounds(players) {
    let list = players.slice();
    if (list.length % 2 !== 0) list.push(null); // "бай" при нечётном числе

    const n = list.length;
    if (n < 2) return [];

    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) {
        const a = list[i];
        const b = list[n - 1 - i];
        if (a && b) pairs.push([a, b]);
      }
      rounds.push(pairs);

      // Вращаем всех, кроме первого (стандартная схема circle method)
      const fixed = list[0];
      const rest = list.slice(1);
      rest.unshift(rest.pop());
      list = [fixed].concat(rest);
    }
    return rounds;
  }

  /**
   * П. 5.2.5 правил: последний матч в группе должен быть между теми,
   * кто реально решает вопрос выхода дальше. Точный расчёт по факту
   * текущих результатов недоступен на этапе генерации расписания
   * (результаты ещё не сыграны), поэтому используется эвристика по
   * посеву: если из группы выходит N участников, последней ставится
   * встреча между #N и #(N+1) по посеву внутри этой группы —
   * это те, кто по итогам с наибольшей вероятностью сыграют решающий
   * матч за место N/N+1.
   */
  static reorderDecidingMatchLast(rounds, group, qualify) {
    if (rounds.length < 2) return; // нечего переставлять
    const q = Math.max(1, Math.min(Number(qualify) || 1, group.length - 1));

    const bySeed = group.slice().sort((a, b) => a.seed - b.seed);
    const targetA = bySeed[q - 1];
    const targetB = bySeed[q];
    if (!targetA || !targetB) return;

    const targetIndex = rounds.findIndex(round =>
      round.some(pair =>
        (pair[0] === targetA && pair[1] === targetB) ||
        (pair[0] === targetB && pair[1] === targetA)
      )
    );

    const lastIndex = rounds.length - 1;
    if (targetIndex !== -1 && targetIndex !== lastIndex) {
      const tmp = rounds[lastIndex];
      rounds[lastIndex] = rounds[targetIndex];
      rounds[targetIndex] = tmp;
    }
  }

  // ========================================================
  // ОПОЗДАВШИЙ ИГРОК — добавление в уже сформированные группы
  // ========================================================

  /**
   * Добавляет игрока, уже занесённого в "Участники" (Participants.addLatePlayer),
   * в САМУЮ МАЛЕНЬКУЮ на данный момент группу его категории — независимо
   * от того, сколько всего групп (2, 3 или больше): правило одно и то же.
   * НЕ пересоздаёт группы и НЕ трогает уже сыгранные матчи — только
   * дописывает игрока в лист "Группы" и генерирует его недостающие пары
   * против остальных участников этой группы отдельным доп. туром.
   */
  static addLatePlayer(participantId) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const config = ConfigService.load();

    const sheet = Participants.getParticipantsSheet(ss);
    const data = sheet.getDataRange().getValues();
    const rowIndex = data.findIndex((row, i) => i > 0 && String(row[0]) === String(participantId));
    if (rowIndex === -1) {
      throw new DrawError(`Участник с ID ${participantId} не найден.`);
    }

    let category = "";
    if (!config.mixedTournament) {
      const header = data[0];
      const headerMismatch = [];
      if (String(header[2]).trim() !== "Дата рождения") headerMismatch.push(`столбец C: ожидался "Дата рождения", а там "${header[2]}"`);
      if (String(header[16]).trim() !== "Пол") headerMismatch.push(`столбец Q: ожидался "Пол", а там "${header[16]}"`);
      if (headerMismatch.length > 0) {
        throw new DrawError(
          "Заголовки листа «Участники» не совпадают с тем, что ожидает программа " +
          "(похоже, в таблицу вручную добавили/переставили столбец, и всё после него съехало): " +
          headerMismatch.join("; ") +
          ". Поправьте порядок столбцов или уберите лишний столбец, вставленный в середину."
        );
      }

      const resolved = Categories.resolveAgeGender(data, rowIndex);
      if (!resolved) {
        const rawBirthDate = data[rowIndex][2];
        const rawGender = data[rowIndex][16];
        throw new DrawError(
          "У игрока не заполнены дата рождения и/или пол — категорию определить нельзя.\n" +
          `Прочитано из таблицы: дата рождения = «${rawBirthDate}» (тип: ${typeof rawBirthDate}` +
          `${rawBirthDate instanceof Date ? ", валидная дата: " + !isNaN(rawBirthDate.getTime()) : ""}), ` +
          `пол = «${rawGender}» (столбец Q, заголовок «${header[16]}»).`
        );
      }
      const existingLabels = Categories.activeLabels(ss).filter(l => l !== "");
      if (existingLabels.length > 0) {
        category = Categories.matchExistingLabel(existingLabels, resolved.age, resolved.gender);
        if (!category) {
          throw new DrawError("Ни одна из существующих категорий не подходит этому игроку по возрасту/полу.");
        }
      }
    }

    const byCategory = this.readGroupsSheet(ss);
    const entry = byCategory.find(e => (e.category || "") === (category || ""));
    if (!entry || entry.groups.length === 0) {
      throw new DrawError(
        (category ? `Для категории «${category}»` : "Группы") +
        " ещё не сформированы. Сначала выполните «Жеребьёвка → Создать группы»."
      );
    }

    let targetIndex = 0;
    entry.groups.forEach((g, i) => {
      if (g.length < entry.groups[targetIndex].length) targetIndex = i;
    });
    const targetGroup = entry.groups[targetIndex];
    const opponents = targetGroup.slice();

    const allSeeds = data.slice(1).map(row => Number(row[9])).filter(n => !isNaN(n) && n !== 0);
    const newSeed = allSeeds.length > 0 ? Math.max(...allSeeds) + 1 : 1;

    data[rowIndex][9] = newSeed;
    data[rowIndex][17] = category;
    sheet.getRange(1, 1, data.length, data[0].length).setValues(data);

    const fio = data[rowIndex][1];
    const id = data[rowIndex][0];
    targetGroup.push({ seed: newSeed, fio, id });

    this.writeGroupsSheet(ss, byCategory);

    const matchesSheet = Theme.findSheetByBaseName(ss, "Матчи") || ss.getSheetByName("Матчи");
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const groupLabel = `Группа ${letters[targetIndex] || targetIndex + 1}`;
    const roundLabel = `${groupLabel}, опоздавший игрок`;

    let nextId = this.getNextMatchId(matchesSheet);
    const rows = opponents.map(opponent => {
      const row = [
        nextId, roundLabel, "", fio, opponent.fio,
        "", "", "Ожидает", "", "", "", "", id, opponent.id, "", category || ""
      ];
      nextId++;
      return row;
    });

    if (rows.length > 0 && matchesSheet) {
      const startRow = matchesSheet.getLastRow() + 1;
      matchesSheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
    }

    if (typeof Matches !== "undefined" && Matches.writeScheduleSheet) {
      Matches.writeScheduleSheet();
    }

    AppLog.write(
      "Опоздавший игрок добавлен в группу",
      `${fio} → ${groupLabel}${category ? " (" + category + ")" : ""}, сгенерировано матчей: ${rows.length}`
    );

    return { fio, category, group: groupLabel, groupSize: targetGroup.length, matchesAdded: rows.length };
  }

  // ========================================================
  // ОЛИМПИЙСКАЯ СИСТЕМА (сетка на выбывание)
  // ========================================================

  /**
   * Строит стандартную посевную сетку на выбывание. Если система
   * турнира "Группы → Плей-офф" и групповой этап уже игрался —
   * источник посева МЕНЯЕТСЯ: вместо общего исходного посева
   * участников берутся реальные квалифицировавшиеся по итогам
   * групп (Matches.getPlayoffQualifiers) — топ-N от каждой группы,
   * отсортированные "линиями мест" (все 1-е места, потом все 2-е...).
   * Если групп не было (обычная олимпийка без группового этапа) —
   * используется исходный столбец "Посев", как раньше.
   * Если число участников не равно степени двойки — старшие посевы
   * получают технический проход (бай) в 1 туре.
   */
  static startSingleElimination() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const config = ConfigService.load();
    const categories = Categories.activeLabels(ss);
    const useGroups = config.system === "GROUPS_PLAYOFF" && this.groupMatchesExist(ss);

    const matchesSheet = Theme.findSheetByBaseName(ss, "Матчи") || ss.getSheetByName("Матчи");
    const playoffSheet = Theme.findSheetByBaseName(ss, "Плей-офф") || ss.getSheetByName("Плей-офф");
    if (playoffSheet) playoffSheet.clear();

    let nextId = this.getNextMatchId(matchesSheet);
    const allRows = [];
    const summary = [];
    const skipped = [];

    categories.forEach(category => {
      const seeded = useGroups
        ? Matches.getPlayoffQualifiers(Number(config.qualify) || 1, category)
        : this.getSeededParticipants(ss, category);

      if (seeded.length < 2) {
        skipped.push(category || "Общий зачёт");
        return;
      }

      const bracketSize = this.nextPowerOfTwo(seeded.length);
      const seedOrder = this.buildSeedOrder(bracketSize); // [1, 8, 4, 5, 2, 7, 3, 6] и т.п.
      const bySeed = {};
      seeded.forEach(p => { bySeed[p.seed] = p; });

      const roundLabel = this.roundLabelForSize(bracketSize);
      const playoffRows = [];
      if (category) playoffRows.push([`═══ ${category} ═══`, "", "", ""]);
      playoffRows.push([useGroups ? "Сетка (по итогам групп)" : "Сетка", "", "", ""]);

      let matchesInCategory = 0;
      for (let i = 0; i < bracketSize / 2; i++) {
        const seedA = seedOrder[i * 2];
        const seedB = seedOrder[i * 2 + 1];
        const playerA = bySeed[seedA];
        const playerB = bySeed[seedB];

        if (playerA && playerB) {
          allRows.push([
            nextId, roundLabel, "", playerA.fio, playerB.fio,
            "", "", "Ожидает", "", "", "", "", playerA.id, playerB.id, "", category || ""
          ]);
          playoffRows.push([roundLabel, playerA.fio, "vs", playerB.fio]);
          nextId++; matchesInCategory++;
        } else if (playerA && !playerB) {
          // Бай: playerA автоматически проходит дальше
          allRows.push([
            nextId, roundLabel, "", playerA.fio, "БАЙ",
            "Тех. победа", playerA.fio, "Завершен", "", "", "Проход без игры", "", playerA.id, "", playerA.id, category || ""
          ]);
          playoffRows.push([roundLabel, playerA.fio, "БАЙ (проход)", ""]);
          nextId++; matchesInCategory++;
        } else if (playerB && !playerA) {
          allRows.push([
            nextId, roundLabel, "", "БАЙ", playerB.fio,
            "Тех. победа", playerB.fio, "Завершен", "", "", "Проход без игры", "", "", playerB.id, playerB.id, category || ""
          ]);
          playoffRows.push([roundLabel, playerB.fio, "БАЙ (проход)", ""]);
          nextId++; matchesInCategory++;
        }
      }

      if (playoffSheet) {
        const startRow = playoffSheet.getLastRow() + 1;
        playoffSheet.getRange(startRow, 1, playoffRows.length, 4).setValues(playoffRows);
      }

      summary.push({ category, round: roundLabel, matches: matchesInCategory, bracketSize, fromGroups: useGroups });
    });

    if (allRows.length > 0 && matchesSheet) {
      const startRow = matchesSheet.getLastRow() + 1;
      matchesSheet.getRange(startRow, 1, allRows.length, allRows[0].length).setValues(allRows);
    }

    if (playoffSheet) {
      playoffSheet.getRange(1, 1, 1, 4)
        .setFontWeight("bold").setBackground("#E53935").setFontColor("#FFFFFF");
      playoffSheet.setColumnWidths(1, 4, 180);
    }

    if (summary.length === 0) {
      throw new DrawError(useGroups
        ? "Недостаточно квалифицировавшихся из групп участников ни в одной категории — доиграйте групповой этап."
        : "Нужно минимум 2 участника с проставленным посевом (в каждой категории отдельно).");
    }

    AppLog.write(
      "Олимпийская сетка",
      summary.map(s => `${s.category || "Общий зачёт"}: ${s.round}, ${s.matches} матчей`).join("; ")
    );

    return { byCategory: summary, skipped };
  }

  // ========================================================
  // ШВЕЙЦАРСКАЯ СИСТЕМА — только первый тур (см. заголовок файла)
  // ========================================================

  /**
   * Стандартная пара 1 тура швейцарки: верхняя половина посева
   * встречается с нижней (1 vs N/2+1, 2 vs N/2+2, ...).
   * Пары следующих туров считаются по результатам — это будет
   * добавлено вместе с Matches.gs.
   */
  static startSwissRound1() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const categories = Categories.activeLabels(ss);

    const matchesSheet = Theme.findSheetByBaseName(ss, "Матчи") || ss.getSheetByName("Матчи");
    let nextId = this.getNextMatchId(matchesSheet);
    const allRows = [];
    const summary = [];
    const skipped = [];

    categories.forEach(category => {
      const seeded = this.getSeededParticipants(ss, category);
      if (seeded.length < 2) {
        skipped.push(category || "Общий зачёт");
        return;
      }

      const half = Math.ceil(seeded.length / 2);
      const top = seeded.slice(0, half);
      const bottom = seeded.slice(half);
      let created = 0;

      for (let i = 0; i < top.length; i++) {
        const playerA = top[i];
        const playerB = bottom[i]; // может не быть, если нечётное число участников

        allRows.push([
          nextId, "Швейцария, тур 1", "", playerA.fio, playerB ? playerB.fio : "БАЙ",
          playerB ? "" : "Тех. победа",
          playerB ? "" : playerA.fio,
          playerB ? "Ожидает" : "Завершен",
          "", "", playerB ? "" : "Проход без игры", "",
          playerA.id, playerB ? playerB.id : "", playerB ? "" : playerA.id,
          category || ""
        ]);
        nextId++; created++;
      }

      summary.push({ category, matches: created });
    });

    if (allRows.length > 0 && matchesSheet) {
      const startRow = matchesSheet.getLastRow() + 1;
      matchesSheet.getRange(startRow, 1, allRows.length, allRows[0].length).setValues(allRows);
    }

    if (summary.length === 0) {
      throw new DrawError("Нужно минимум 2 участника с проставленным посевом (в каждой категории отдельно).");
    }

    AppLog.write("Швейцария: тур 1", summary.map(s => `${s.category || "Общий зачёт"}: ${s.matches} матчей`).join("; "));

    return { byCategory: summary, skipped };
  }

  // ========================================================
  // Вспомогательное
  // ========================================================

  static getNextMatchId(matchesSheet) {
    if (!matchesSheet) return 1;
    const lastRow = matchesSheet.getLastRow();
    if (lastRow < 2) return 1;

    const ids = matchesSheet.getRange(2, 1, lastRow - 1, 1).getValues()
      .map(r => Number(r[0]))
      .filter(n => !isNaN(n));

    return ids.length > 0 ? Math.max(...ids) + 1 : 1;
  }

  // Настоящая случайная перетасовка (Fisher-Yates) — используется
  // для честной жеребьёвки непосеянных участников
  static shuffle(array) {
    const arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  static nextPowerOfTwo(n) {
    let size = 1;
    while (size < n) size *= 2;
    return size;
  }

  // Классический алгоритм посевной расстановки в сетке:
  // buildSeedOrder(8) -> [1, 8, 4, 5, 2, 7, 3, 6]
  static buildSeedOrder(size) {
    let seeds = [1];
    while (seeds.length < size) {
      const n = seeds.length * 2;
      const newSeeds = [];
      seeds.forEach(s => {
        newSeeds.push(s);
        newSeeds.push(n + 1 - s);
      });
      seeds = newSeeds;
    }
    return seeds;
  }

  static roundLabelForSize(bracketSize) {
    const labels = {
      2: "Финал",
      4: "1/2 финала",
      8: "1/4 финала",
      16: "1/8 финала",
      32: "1/16 финала",
      64: "1/32 финала"
    };
    return labels[bracketSize] || `Раунд на ${bracketSize}`;
  }

  // ========================================================
  // DOUBLE ELIMINATION (winners bracket + losers bracket)
  // ========================================================

  /**
   * Создаёт только 1-й раунд winners bracket ("DE WB Раунд 1").
   * Дальше вся сетка (WB, LB, гранд-финал, возможная переигровка)
   * достраивается автоматически, раунд за раундом, по мере
   * внесения результатов — см. Matches.tryGenerateNextDERounds().
   */
  static startDoubleElimination() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const categories = Categories.activeLabels(ss);

    const matchesSheet = Theme.findSheetByBaseName(ss, "Матчи") || ss.getSheetByName("Матчи");
    let nextId = this.getNextMatchId(matchesSheet);
    const roundLabel = "DE WB Раунд 1";
    const allRows = [];
    const summary = [];
    const skipped = [];

    categories.forEach(category => {
      const seeded = this.getSeededParticipants(ss, category);
      if (seeded.length < 3) {
        skipped.push(category || "Общий зачёт");
        return;
      }

      const bracketSize = this.nextPowerOfTwo(seeded.length);
      const seedOrder = this.buildSeedOrder(bracketSize);
      const bySeed = {};
      seeded.forEach(p => { bySeed[p.seed] = p; });

      let created = 0;
      for (let i = 0; i < bracketSize / 2; i++) {
        const seedA = seedOrder[i * 2];
        const seedB = seedOrder[i * 2 + 1];
        const playerA = bySeed[seedA];
        const playerB = bySeed[seedB];

        if (playerA && playerB) {
          allRows.push([nextId, roundLabel, "", playerA.fio, playerB.fio, "", "", "Ожидает", "", "", "", "", playerA.id, playerB.id, "", category || ""]);
          nextId++; created++;
        } else if (playerA && !playerB) {
          allRows.push([nextId, roundLabel, "", playerA.fio, "БАЙ", "Тех. победа", playerA.fio, "Завершен", "", "", "Проход без игры", "", playerA.id, "", playerA.id, category || ""]);
          nextId++; created++;
        } else if (playerB && !playerA) {
          allRows.push([nextId, roundLabel, "", "БАЙ", playerB.fio, "Тех. победа", playerB.fio, "Завершен", "", "", "Проход без игры", "", "", playerB.id, playerB.id, category || ""]);
          nextId++; created++;
        }
      }

      summary.push({ category, round: roundLabel, matches: created, bracketSize });
    });

    if (allRows.length > 0) {
      const startRow = matchesSheet.getLastRow() + 1;
      matchesSheet.getRange(startRow, 1, allRows.length, allRows[0].length).setValues(allRows);
    }

    if (summary.length === 0) {
      throw new DrawError("Нужно минимум 3 участника с проставленным посевом для double elimination (в каждой категории отдельно).");
    }

    AppLog.write("Double elimination запущен", summary.map(s => `${s.category || "Общий зачёт"}: сетка WB ${s.bracketSize}, ${s.matches} матчей`).join("; "));

    return { byCategory: summary, skipped };
  }

  /**
   * Строит статическую "карту" всех раундов double elimination для
   * заданного числа раундов winners bracket (k = log2(bracketSize)).
   * Это ЧИСТАЯ структура (какие раунды вообще будут и откуда берут
   * участников) — сама генерация матчей происходит в Matches.gs
   * по мере готовности источников каждого раунда.
   *
   * Схема (стандартная для double elimination):
   *  - LB Раунд 1 = проигравшие WB Раунда 1, парами между собой
   *  - для каждого следующего WB раунда r (2..k):
   *      "drop-in" LB раунд = победители предыдущего LB раунда
   *                            против проигравших WB раунда r
   *      если r < k — следом идёт "consolidation" LB раунд:
   *                    победители drop-in раунда парами между собой
   *  - последний drop-in раунд (r = k, проигравший WB Финала) — это LB Финал
   *  - Гранд-финал = победитель WB Финала против победителя LB Финала
   */
  static buildDoubleEliminationPlan(k) {
    const plan = [];

    for (let r = 1; r <= k; r++) {
      plan.push({ type: "WB", num: r, label: r === k ? "DE WB Финал" : `DE WB Раунд ${r}` });
    }

    plan.push({ type: "LB", num: 1, label: "DE LB Раунд 1", kind: "consolidation", sourceWBLosers: 1, sourceLB: null });

    let lbNum = 1;
    for (let r = 2; r <= k; r++) {
      lbNum++;
      const isFinal = r === k;
      plan.push({
        type: "LB", num: lbNum,
        label: isFinal ? "DE LB Финал" : `DE LB Раунд ${lbNum}`,
        kind: "dropin",
        sourceWBLosers: r,
        sourceLB: lbNum - 1
      });
      if (r < k) {
        lbNum++;
        plan.push({
          type: "LB", num: lbNum,
          label: `DE LB Раунд ${lbNum}`,
          kind: "consolidation",
          sourceLB: lbNum - 1
        });
      }
    }

    plan.push({ type: "GF", label: "DE Гранд-финал" });
    plan.push({ type: "GF2", label: "DE Гранд-финал (реванш)" });

    return plan;
  }

  // Есть ли уже матчи double elimination (для предупреждения о повторном запуске)
  static doubleEliminationMatchesExist(ss) {
    const sheet = Theme.findSheetByBaseName(ss, "Матчи") || ss.getSheetByName("Матчи");
    if (!sheet) return false;
    const data = sheet.getDataRange().getValues();
    return data.slice(1).some(row => String(row[1] || "").indexOf("DE ") === 0);
  }

  // ========================================================
  // ПРОВЕРКИ ПЕРЕД ПОВТОРНЫМ ЗАПУСКОМ (для предупреждений в Menu.gs)
  // ========================================================

  // Есть ли уже матчи группового этапа (Раунд начинается с "Группа ")
  static groupMatchesExist(ss) {
    const sheet = Theme.findSheetByBaseName(ss, "Матчи") || ss.getSheetByName("Матчи");
    if (!sheet) return false;
    const data = sheet.getDataRange().getValues();
    return data.slice(1).some(row => String(row[1] || "").startsWith("Группа "));
  }

  // Удаляет со листа "Матчи" все строки группового этапа (Раунд начинается
  // с "Группа "), не трогая остальные (плей-офф/швейцария/DE, если уже
  // есть) — вызывается перед generateGroupMatches, чтобы повторный запуск
  // "Создать группы" ПЕРЕСОЗДАВАЛ группы и матчи, а не дублировал их
  static removeGroupMatches(ss) {
    const sheet = Theme.findSheetByBaseName(ss, "Матчи") || ss.getSheetByName("Матчи");
    if (!sheet) return;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    const lastCol = sheet.getLastColumn();

    const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    const kept = data.filter(row => !String(row[1] || "").startsWith("Группа "));
    if (kept.length === data.length) return; // нечего удалять

    sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
    if (kept.length > 0) {
      sheet.getRange(2, 1, kept.length, lastCol).setValues(kept);
    }
  }

  // Есть ли уже посев (хотя бы у одного участника проставлен столбец "Посев")
  static seedingExists(ss) {
    const sheet = Participants.getParticipantsSheet(ss);
    const data = sheet.getDataRange().getValues();
    return data.slice(1).some(row => row[9] !== "" && row[9] !== null);
  }

  // Есть ли уже матчи плей-офф (Раунд входит в список раундов сетки)
  static playoffMatchesExist(ss) {
    const sheet = Theme.findSheetByBaseName(ss, "Матчи") || ss.getSheetByName("Матчи");
    if (!sheet) return false;
    const data = sheet.getDataRange().getValues();
    return data.slice(1).some(row => PLAYOFF_ROUND_ORDER.indexOf(row[1]) !== -1);
  }

  // Есть ли уже матчи швейцарской системы (Раунд начинается с "Швейцария")
  static swissMatchesExist(ss) {
    const sheet = Theme.findSheetByBaseName(ss, "Матчи") || ss.getSheetByName("Матчи");
    if (!sheet) return false;
    const data = sheet.getDataRange().getValues();
    return data.slice(1).some(row => String(row[1] || "").startsWith("Швейцария"));
  }

}


class DrawError extends Error {
  constructor(message) {
    super(message);
    this.name = "DrawError";
  }
}