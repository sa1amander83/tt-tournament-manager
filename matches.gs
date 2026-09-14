/**
 * ==========================================================
 * TT Tournament Manager
 * Matches.gs
 * Версия 0.1
 * ----------------------------------------------------------
 * Отвечает за проведение турнира по уже готовой жеребьёвке:
 *  - выдачу следующего ожидающего матча
 *  - просмотр расписания и "табло" (что сейчас играется)
 *  - внесение результата матча
 *  - автоматический пересчёт "Рейтинга" по завершённым матчам
 *  - автопродвижение победителей по сетке плей-офф
 *    (Draw.gs генерирует раунд, Matches.gs продвигает дальше)
 *
 * ЧЕСТНО О ГРАНИЦАХ МОДУЛЯ:
 * Пары 2-го и последующих туров швейцарской системы здесь
 * ЕЩЁ НЕ считаются автоматически — это отдельная логика
 * (нужно распределять пары по текущим очкам, избегая повторных
 * встреч). Сейчас Matches.gs только пересчитывает очки после
 * завершённых швейцарских матчей; сама расстановка пар след.
 * тура — в одном из следующих обновлений.
 * ==========================================================
 */

const MATCH_COL = {
  ID: 1, ROUND: 2, TABLE: 3, PLAYER1: 4, PLAYER2: 5,
  SCORE: 6, WINNER: 7, STATUS: 8, START: 9, END: 10, NOTE: 11, PARTS: 12,
  PLAYER1_ID: 13, PLAYER2_ID: 14, WINNER_ID: 15, CATEGORY: 16
};

const PLAYOFF_ROUND_ORDER = ["1/32 финала", "1/16 финала", "1/8 финала", "1/4 финала", "1/2 финала", "Финал"];


class Matches {

  // ========================================================
  // СЛЕДУЮЩИЙ МАТЧ
  // ========================================================

  /**
   * Находит первый матч со статусом "Ожидает" (по возрастанию ID),
   * У КОТОРОГО ОБА игрока сейчас свободны (не участвуют в матче
   * со статусом "Играют" на другом столе) — иначе один и тот же
   * человек мог бы получить два матча одновременно.
   * Переводит найденный матч в статус "Играют", НАЗНАЧАЕТ ЕМУ СТОЛ
   * и проставляет время начала.
   *
   * СТОЛЫ. Их ровно столько, сколько указано в настройках турнира
   * (лист "Настройки", строка "Столы"). Стол занят, пока на нём идёт
   * матч со статусом "Играют"; как только матч переходит в "Завершен",
   * стол снова свободен, а номер в завершённой строке остаётся
   * как история — на каком столе играли.
   * Именно здесь Draw.gs ожидает назначение стола: при генерации
   * матчей столбец "Стол" намеренно оставляется пустым, потому что
   * заранее неизвестно, какой стол освободится первым.
   *
   * Возвращает:
   *   объект матча          — матч запущен, стол назначен;
   *   { noFreeTable: true } — все столы сейчас заняты;
   *   null                  — нет матчей, готовых к запуску.
   */
  static startNextMatch() {
    const sheet = this.getMatchesSheet();
    const data = sheet.getDataRange().getValues();

    const tablesCount = this.getTablesCount();

    const busyPlayers = new Set();
    const busyTables = new Set();
    let running = 0;

    for (let i = 1; i < data.length; i++) {
      if (data[i][MATCH_COL.STATUS - 1] !== "Играют") continue;

      running++;
      busyPlayers.add(data[i][MATCH_COL.PLAYER1 - 1]);
      busyPlayers.add(data[i][MATCH_COL.PLAYER2 - 1]);

      const table = Number(data[i][MATCH_COL.TABLE - 1]);
      if (table >= 1) busyTables.add(table);
    }

    // Считаем именно идущие матчи, а не различные номера столов:
    // у матчей, запущенных до появления распределения столов,
    // столбец "Стол" пуст, но стол они физически занимают.
    if (running >= tablesCount) return { noFreeTable: true };

    for (let i = 1; i < data.length; i++) {
      if (data[i][MATCH_COL.STATUS - 1] !== "Ожидает") continue;

      const p1 = data[i][MATCH_COL.PLAYER1 - 1];
      const p2 = data[i][MATCH_COL.PLAYER2 - 1];
      if (busyPlayers.has(p1) || busyPlayers.has(p2)) continue; // один из игроков уже на другом столе

      const table = this.pickTable(data[i][MATCH_COL.TABLE - 1], busyTables, tablesCount);
      if (table === null) return { noFreeTable: true };

      sheet.getRange(i + 1, MATCH_COL.TABLE).setValue(table);
      sheet.getRange(i + 1, MATCH_COL.STATUS).setValue("Играют");
      sheet.getRange(i + 1, MATCH_COL.START).setValue(new Date());

      return {
        id: data[i][MATCH_COL.ID - 1],
        round: data[i][MATCH_COL.ROUND - 1],
        table: table,
        player1: p1,
        player2: p2
      };
    }

    return null; // нет ожидающих матчей со свободными игроками
  }

  /**
   * Сколько столов в турнире. Берём из настроек; если турнир ещё
   * не настроен или в ячейке мусор — работаем на значении по умолчанию,
   * чтобы отсутствие настройки не блокировало проведение матчей.
   */
  static getTablesCount() {
    let count = 0;
    try {
      count = Number(ConfigService.load().tables);
    } catch (e) {
      Logger.log("Не удалось прочитать число столов из настроек: " + e);
    }
    if (!count || isNaN(count) || count < 1) count = CONFIG.DEFAULT_TABLES;
    return Math.floor(count);
  }

  /**
   * Выбирает свободный стол для матча.
   * Если организатор заранее вписал номер стола в строку матча руками —
   * уважаем его выбор, но только если этот стол сейчас действительно
   * свободен. Иначе берём наименьший свободный номер, чтобы столы
   * заполнялись по порядку, а не вразнобой.
   * Возвращает номер стола либо null, если свободных нет.
   */
  static pickTable(preferredValue, busyTables, tablesCount) {
    const preferred = Number(preferredValue);
    if (preferred >= 1 && preferred <= tablesCount && !busyTables.has(preferred)) {
      return preferred;
    }

    for (let table = 1; table <= tablesCount; table++) {
      if (!busyTables.has(table)) return table;
    }

    return null;
  }

  // ========================================================
  // РАСПИСАНИЕ / ТАБЛО
  // ========================================================

  static getSchedule() {
    const data = this.getMatchesData();
    return data
      .filter(m => m.status === "Ожидает")
      .sort((a, b) => (a.table || 0) - (b.table || 0));
  }

  /**
   * Пишет текущее расписание (все матчи со статусом "Ожидает")
   * в реальный лист "Расписание" — раньше он оставался пустым,
   * а список показывался только во всплывающем окне.
   */
  static writeScheduleSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = Theme.findSheetByBaseName(ss, "Расписание") || ss.getSheetByName("Расписание");
    if (!sheet) return 0;

    const schedule = this.getSchedule();

    const existingFilter = sheet.getFilter();
    if (existingFilter) existingFilter.remove();
    sheet.clear();

    sheet.getRange(1, 1, 1, 5).setValues([["ID", "Раунд", "Стол", "Игрок 1", "Игрок 2"]])
      .setFontWeight("bold").setBackground("#FDD835").setFontColor("#000000");
    sheet.setFrozenRows(1);

    if (schedule.length > 0) {
      const rows = schedule.map(m => [m.id, m.round, m.table || "", m.player1, m.player2]);
      sheet.getRange(2, 1, rows.length, 5).setValues(rows);
    }

    sheet.setColumnWidth(1, 50);
    sheet.setColumnWidth(2, 160);
    sheet.setColumnWidth(3, 60);
    sheet.setColumnWidth(4, 220);
    sheet.setColumnWidth(5, 220);

    return schedule.length;
  }

  static getScoreboard() {
    const data = this.getMatchesData();
    return data.filter(m => m.status === "Играют");
  }

  /**
   * Пишет текущее табло (все матчи со статусом "Играют") в реальный
   * лист "Табло" — раньше показывалось только во всплывающем окне.
   */
  static writeScoreboardSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = Theme.findSheetByBaseName(ss, "Табло") || ss.getSheetByName("Табло");
    if (!sheet) return 0;

    const live = this.getScoreboard();

    const existingFilter = sheet.getFilter();
    if (existingFilter) existingFilter.remove();
    sheet.clear();

    sheet.getRange(1, 1, 1, 5).setValues([["ID", "Стол", "Раунд", "Игрок 1", "Игрок 2"]])
      .setFontWeight("bold").setBackground("#FB8C00").setFontColor("#FFFFFF");
    sheet.setFrozenRows(1);

    if (live.length > 0) {
      const rows = live
        .sort((a, b) => (a.table || 0) - (b.table || 0))
        .map(m => [m.id, m.table || "", m.round, m.player1, m.player2]);
      sheet.getRange(2, 1, rows.length, 5).setValues(rows);
    } else {
      sheet.getRange(2, 1).setValue("Сейчас никто не играет.");
    }

    sheet.setColumnWidth(1, 50);
    sheet.setColumnWidth(2, 60);
    sheet.setColumnWidth(3, 160);
    sheet.setColumnWidth(4, 220);
    sheet.setColumnWidth(5, 220);

    return live.length;
  }

  static getResults() {
    const data = this.getMatchesData();
    return data.filter(m => m.status === "Завершен");
  }

  // ========================================================
  // ВНЕСЕНИЕ РЕЗУЛЬТАТА
  // ========================================================

  /**
   * Записывает результат матча по его ID. Принимает итоговый счёт
   * МАТЧА (сколько партий выиграла каждая сторона), например "3:1"
   * или "3-0" — проверяет его на соответствие формату матча
   * (BO3/BO5), помечает матч завершённым, пересчитывает рейтинг и,
   * если это матч плей-офф и раунд закрыт целиком — генерирует
   * следующий раунд сетки.
   */
  static recordResult(matchId, scoreText) {
    const sheet = this.getMatchesSheet();
    const data = sheet.getDataRange().getValues();
    const config = ConfigService.load();

    const rowIndex = this.findMatchRowIndex(data, matchId);
    if (rowIndex === -1) {
      throw new MatchesError(`Матч с ID ${matchId} не найден.`);
    }

    const row = data[rowIndex];
    const player1 = row[MATCH_COL.PLAYER1 - 1];
    const player2 = row[MATCH_COL.PLAYER2 - 1];
    const player1Id = row[MATCH_COL.PLAYER1_ID - 1];
    const player2Id = row[MATCH_COL.PLAYER2_ID - 1];

    const matchFormat = this.matchFormatForRound(row[MATCH_COL.ROUND - 1], config);
    const parsed = this.parseMatchScore(scoreText, matchFormat);
    const winner = parsed.gamesA > parsed.gamesB ? player1 : player2;
    const winnerId = parsed.gamesA > parsed.gamesB ? player1Id : player2Id;
    const matchScoreText = `${parsed.gamesA}:${parsed.gamesB}`;

    return this.finalizeMatch(sheet, rowIndex, row, winner, matchScoreText, "", "", winnerId);
  }

  /**
   * Разбирает и проверяет итоговый счёт матча, например "3:1" или "3-0"
   * (принимает и ":", и "-" как разделитель). Победитель должен набрать
   * ровно нужное число партий для формата матча (BO3 -> 2, BO5 -> 3),
   * а проигравший — меньше.
   */
  static parseMatchScore(text, matchFormat) {
    const needed = matchFormat === "BO3" ? 2 : 3;
    const m = String(text).trim().match(/^(\d+)\s*[:\-]\s*(\d+)$/);

    if (!m) {
      throw new MatchesError('Нужно ввести счёт матча, например "3:1" или "3-0".');
    }

    const gamesA = Number(m[1]);
    const gamesB = Number(m[2]);
    const winnerGames = Math.max(gamesA, gamesB);
    const loserGames = Math.min(gamesA, gamesB);

    if (winnerGames !== needed || loserGames >= needed) {
      throw new MatchesError(
        `Счёт "${text}" не соответствует формату "${MATCH_FORMATS[matchFormat] || matchFormat}": ` +
        `победитель должен набрать ровно ${needed} парти(и/й), проигравший — меньше.`
      );
    }

    return { gamesA, gamesB };
  }

  /**
   * Формат матча зависит от стадии: в группах играют по
   * config.groupMatchFormat, в плей-офф (и вне групповой стадии,
   * например Швейцария/DE/Олимпийская без групп) — по
   * config.matchFormat. Стадия группы определяется по раунду,
   * который начинается с "Группа " (см. Draw.gs).
   */
  static matchFormatForRound(round, config) {
    return String(round || "").indexOf("Группа ") === 0 ? config.groupMatchFormat : config.matchFormat;
  }

  /**
   * Фиксирует неявку одного из игроков (п. 5.2.7-5.2.8 правил):
   * сопернику засчитывается максимально возможный счёт по партиям
   * для текущего формата матча (например "3:0" для BO5), а
   * неявившийся при пересчёте рейтинга получит 0 очков вместо
   * обычного 1 очка за поражение.
   */
  static recordWalkover(matchId, noShowPlayerNumber) {
    const sheet = this.getMatchesSheet();
    const data = sheet.getDataRange().getValues();
    const config = ConfigService.load();

    const rowIndex = this.findMatchRowIndex(data, matchId);
    if (rowIndex === -1) {
      throw new MatchesError(`Матч с ID ${matchId} не найден.`);
    }

    const row = data[rowIndex];
    const player1 = row[MATCH_COL.PLAYER1 - 1];
    const player2 = row[MATCH_COL.PLAYER2 - 1];
    const player1Id = row[MATCH_COL.PLAYER1_ID - 1];
    const player2Id = row[MATCH_COL.PLAYER2_ID - 1];

    const noShowFio = Number(noShowPlayerNumber) === 1 ? player1 : player2;
    const winner = Number(noShowPlayerNumber) === 1 ? player2 : player1;
    const winnerId = Number(noShowPlayerNumber) === 1 ? player2Id : player1Id;

    const matchFormat = this.matchFormatForRound(row[MATCH_COL.ROUND - 1], config);
    const needed = matchFormat === "BO3" ? 2 : 3;
    const scoreText = `${needed}:0`;

    return this.finalizeMatch(sheet, rowIndex, row, winner, scoreText, `Неявка: ${noShowFio}`, "", winnerId);
  }

  static findMatchRowIndex(data, matchId) {
    for (let i = 1; i < data.length; i++) {
      if (Number(data[i][MATCH_COL.ID - 1]) === Number(matchId)) return i;
    }
    return -1;
  }

  /**
   * Возвращает текущее состояние матча по ID (для проверки перед
   * вводом результата — чтобы не перезаписать случайно уже
   * внесённые данные по неверному ID).
   */
  static findMatchById(matchId) {
    const sheet = this.getMatchesSheet();
    const data = sheet.getDataRange().getValues();
    const rowIndex = this.findMatchRowIndex(data, matchId);
    if (rowIndex === -1) return null;

    const row = data[rowIndex];
    return {
      id: row[MATCH_COL.ID - 1],
      round: row[MATCH_COL.ROUND - 1],
      player1: row[MATCH_COL.PLAYER1 - 1],
      player2: row[MATCH_COL.PLAYER2 - 1],
      score: row[MATCH_COL.SCORE - 1],
      winner: row[MATCH_COL.WINNER - 1],
      status: row[MATCH_COL.STATUS - 1],
      note: row[MATCH_COL.NOTE - 1]
    };
  }

  // Общая часть для обычного результата и неявки: запись в лист,
  // пересчёт рейтинга, автопродвижение по сетке плей-офф
  static finalizeMatch(sheet, rowIndex, row, winner, scoreText, note, gamesText, winnerId) {
    sheet.getRange(rowIndex + 1, MATCH_COL.SCORE).setValue(scoreText);
    sheet.getRange(rowIndex + 1, MATCH_COL.WINNER).setValue(winner);
    sheet.getRange(rowIndex + 1, MATCH_COL.STATUS).setValue("Завершен");
    sheet.getRange(rowIndex + 1, MATCH_COL.END).setValue(new Date());
    if (note) {
      sheet.getRange(rowIndex + 1, MATCH_COL.NOTE).setValue(note);
    }
    if (gamesText) {
      sheet.getRange(rowIndex + 1, MATCH_COL.PARTS).setValue(gamesText);
    }
    if (winnerId !== undefined && winnerId !== null && winnerId !== "") {
      sheet.getRange(rowIndex + 1, MATCH_COL.WINNER_ID).setValue(winnerId);
    }

    const category = row[MATCH_COL.CATEGORY - 1] || "";
    this.recalcRating();

    const round = row[MATCH_COL.ROUND - 1];
    let advanced = null;
    if (PLAYOFF_ROUND_ORDER.indexOf(round) !== -1) {
      advanced = this.advancePlayoffIfReady(round, category);
    } else if (String(round).indexOf("DE ") === 0) {
      advanced = this.tryGenerateNextDERounds(sheet, category);
    }

    AppLog.write(
      note ? "Неявка" : "Результат матча",
      `#${row[MATCH_COL.ID - 1]} (${round}): ${row[MATCH_COL.PLAYER1 - 1]} vs ${row[MATCH_COL.PLAYER2 - 1]}, счёт ${scoreText}, победитель — ${winner}${note ? ", " + note : ""}`
    );
    if (advanced && advanced.champion) {
      AppLog.write("Турнир завершён", `Чемпион: ${advanced.champion}`);
    } else if (advanced && advanced.nextRound) {
      AppLog.write("Раунд сетки сформирован", `${advanced.nextRound}: ${advanced.matchesCreated} матчей`);
    }

    return { winner, round, advanced };
  }

  // ========================================================
  // РЕЙТИНГ
  // ========================================================

  /**
   * Пересчитывает лист "Рейтинг" по всем завершённым матчам.
   * Очки: победа = 2, поражение = 1 (участие) — это официальная
   * методика ФНТР (п. 5.2.1 правил настольного тенниса), а не
   * наша самодеятельность.
   *
   * При РАВЕНСТВЕ очков расстановка идёт по официальной методике
   * (п. 5.2.2): сначала личная встреча между собой (если играли),
   * затем — соотношение выигранных/проигранных партий (games).
   * Упрощение: правила предписывают при частичном разрешении спора
   * пересчитывать оставшихся заново (п. 5.2.3) — этого рекурсивного
   * шага здесь нет, для клубного турнира одного прохода обычно
   * достаточно.
   */
  static recalcRating() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const results = this.getResults();

    const byCategory = {};
    results.forEach(m => {
      const cat = m.category || "";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(m);
    });

    const present = Object.keys(byCategory);
    const orderedCategories = Categories.activeLabels(ss).filter(c => present.indexOf(c) !== -1);
    present.forEach(c => { if (orderedCategories.indexOf(c) === -1) orderedCategories.push(c); });

    const sheet = Theme.findSheetByBaseName(ss, "Рейтинг") || ss.getSheetByName("Рейтинг");
    if (!sheet) return;
    sheet.clear();

    sheet.getRange(1, 1, 1, 9).setValues([[
      "ID", "Игрок", "Очки", "Победы", "Поражения", "Набрано очков", "Пропущено очков", "Партий выиграно", "Партий проиграно"
    ]]).setFontWeight("bold").setBackground("#00ACC1").setFontColor("#FFFFFF");
    sheet.setFrozenRows(1);

    let row = 2;
    orderedCategories.forEach(category => {
      const players = this.computeFullRatingStats(byCategory[category]);
      if (category) {
        sheet.getRange(row, 1).setValue(`═══ ${category} ═══`).setFontWeight("bold");
        sheet.getRange(row, 1, 1, 9).merge();
        row++;
      }
      const rows = players.map(p => [p.id, p.fio, p.points, p.wins, p.losses, p.pointsWon, p.pointsLost, p.gamesWon, p.gamesLost]);
      if (rows.length > 0) {
        sheet.getRange(row, 1, rows.length, 9).setValues(rows);
        row += rows.length;
      }
    });
  }

  /**
   * Пересчитывает очки/победы/поражения и сырые счётчики партий/очков
   * (методика ФНТР, п. 5.2.1-5.2.3 правил — см. прежний комментарий к
   * recalcRating()) по произвольному подмножеству завершённых матчей —
   * теперь по одной категории за раз, вызывается из recalcRating() в
   * цикле по всем активным категориям.
   */
  static computeFullRatingStats(matchList) {
    // Ключ статистики — ID участника, а не текст ФИО — так два
    // разных человека с одинаковым ФИО (тёзки) не сливаются в одну запись.
    const stats = {}; // id -> {fio, wins, losses, points, gamesWon, gamesLost, pointsWon, pointsLost, beats:Set<id>}

    matchList.forEach(m => {
      if (!m.player1 || !m.player2) return;
      if (m.player1 === "БАЙ" || m.player2 === "БАЙ") return; // техническая победа — не считаем игрой

      const id1 = m.player1Id;
      const id2 = m.player2Id;
      if (!id1 || !id2) return; // старые данные без ID (созданные до перехода) — пропускаем безопасно

      if (!stats[id1]) stats[id1] = { fio: m.player1, wins: 0, losses: 0, points: 0, gamesWon: 0, gamesLost: 0, pointsWon: 0, pointsLost: 0, beats: new Set() };
      if (!stats[id2]) stats[id2] = { fio: m.player2, wins: 0, losses: 0, points: 0, gamesWon: 0, gamesLost: 0, pointsWon: 0, pointsLost: 0, beats: new Set() };

      const scoreMatch = String(m.score || "").match(/^(\d+)\s*[:\-]\s*(\d+)$/);
      const g1 = scoreMatch ? Number(scoreMatch[1]) : 0;
      const g2 = scoreMatch ? Number(scoreMatch[2]) : 0;

      stats[id1].gamesWon += g1;
      stats[id1].gamesLost += g2;
      stats[id2].gamesWon += g2;
      stats[id2].gamesLost += g1;

      // Реальный счёт по очкам внутри партий (если был введён через
      // "Внести результат" — для неявок его нет, тогда пропускаем)
      if (m.parts) {
        String(m.parts).split(",").forEach(gamePair => {
          const gm = gamePair.trim().match(/^(\d+)\s*[:\-]\s*(\d+)$/);
          if (!gm) return;
          stats[id1].pointsWon += Number(gm[1]);
          stats[id1].pointsLost += Number(gm[2]);
          stats[id2].pointsWon += Number(gm[2]);
          stats[id2].pointsLost += Number(gm[1]);
        });
      }

      // Неявка (п. 5.2.1): неявившийся получает 0 очков вместо
      // обычного 1 очка за поражение. Определяем неявившегося по ID
      // победителя (m.winnerId), а не по тексту ФИО.
      const winnerId = m.winnerId;
      const isWalkover = String(m.note || "").indexOf("Неявка:") === 0;
      const loserPoints = isWalkover ? 0 : 1;

      if (winnerId === id1) {
        stats[id1].wins++;
        stats[id1].points += 2;
        stats[id2].losses++;
        stats[id2].points += loserPoints;
        stats[id1].beats.add(id2);
      } else if (winnerId === id2) {
        stats[id2].wins++;
        stats[id2].points += 2;
        stats[id1].losses++;
        stats[id1].points += loserPoints;
        stats[id2].beats.add(id1);
      }
    });

    const players = Object.keys(stats).map(id => {
      const s = stats[id];
      return {
        id,
        fio: s.fio,
        points: s.points,
        wins: s.wins,
        losses: s.losses,
        gamesWon: s.gamesWon,
        gamesLost: s.gamesLost,
        gamesRatio: s.gamesLost > 0 ? s.gamesWon / s.gamesLost : s.gamesWon,
        pointsRatio: s.pointsLost > 0 ? s.pointsWon / s.pointsLost : s.pointsWon,
        pointsWon: s.pointsWon,
        pointsLost: s.pointsLost,
        beats: s.beats
      };
    });

    players.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points; // 1. очки
      if (a.beats.has(b.id) && !b.beats.has(a.id)) return -1; // 2. личная встреча
      if (b.beats.has(a.id) && !a.beats.has(b.id)) return 1;
      if (b.gamesRatio !== a.gamesRatio) return b.gamesRatio - a.gamesRatio; // 3. соотношение партий
      return b.pointsRatio - a.pointsRatio; // 4. соотношение очков
    });

    return players;
  }

  // ========================================================
  // АВТОПРОДВИЖЕНИЕ ПО СЕТКЕ ПЛЕЙ-ОФФ
  // ========================================================

  /**
   * Если все матчи указанного раунда плей-офф завершены —
   * формирует пары следующего раунда из победителей (в порядке
   * следования матчей в таблице) и записывает их в "Матчи".
   * Если завершён раунд "Финал" — возвращает чемпиона, дальше
   * раундов не создаёт.
   */
  static advancePlayoffIfReady(round, category) {
    const sheet = this.getMatchesSheet();
    const data = sheet.getDataRange().getValues();

    const roundRows = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][MATCH_COL.ROUND - 1] === round && (data[i][MATCH_COL.CATEGORY - 1] || "") === (category || "")) {
        roundRows.push(data[i]);
      }
    }

    if (roundRows.length === 0) return null;
    const allDone = roundRows.every(r => r[MATCH_COL.STATUS - 1] === "Завершен");
    if (!allDone) return null;

    if (round === "Финал") {
      const champion = roundRows[0][MATCH_COL.WINNER - 1];
      return { champion };
    }

    const winners = roundRows
      .map(r => ({ fio: r[MATCH_COL.WINNER - 1], id: r[MATCH_COL.WINNER_ID - 1] }))
      .filter(w => w.fio);
    if (winners.length < 2) return null;

    const nextRoundLabel = Draw.roundLabelForSize(winners.length);
    let nextId = Draw.getNextMatchId(sheet);
    const rows = [];

    for (let i = 0; i < winners.length; i += 2) {
      const a = winners[i];
      const b = winners[i + 1];
      rows.push([
        nextId, nextRoundLabel, "", a.fio, b ? b.fio : "БАЙ",
        b ? "" : "Тех. победа",
        b ? "" : a.fio,
        b ? "Ожидает" : "Завершен",
        "", "", b ? "" : "Проход без игры", "",
        a.id, b ? b.id : "", b ? "" : a.id,
        category || ""
      ]);
      nextId++;
    }

    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);

    this.appendToPlayoffSheet(nextRoundLabel, winners.map(w => w.fio), category);

    return { nextRound: nextRoundLabel, matchesCreated: rows.length };
  }

  // ========================================================
  // DOUBLE ELIMINATION — генерация следующих раундов
  // ========================================================

  /**
   * Проверяет ВСЮ карту раундов double elimination (Draw.buildDoubleEliminationPlan)
   * и создаёт любой раунд, чьи источники (WB/LB раунды-предшественники)
   * уже полностью завершены, а сам раунд ещё не создан. За один вызов
   * может создать несколько раундов сразу (если несколько веток
   * одновременно готовы), либо ни одного (если пока рано).
   * Отдельно обрабатывает Гранд-финал и возможную переигровку.
   */
  static tryGenerateNextDERounds(sheet, category) {
    const data = sheet.getDataRange().getValues();
    const deRows = data.slice(1).filter(r =>
      String(r[MATCH_COL.ROUND - 1]).indexOf("DE ") === 0 &&
      (r[MATCH_COL.CATEGORY - 1] || "") === (category || "")
    );
    if (deRows.length === 0) return null;

    const wb1Rows = deRows.filter(r => r[MATCH_COL.ROUND - 1] === "DE WB Раунд 1");
    if (wb1Rows.length === 0) return null;

    const bracketSize = wb1Rows.length * 2;
    const k = Math.round(Math.log2(bracketSize));
    if (k < 2) return null;

    const plan = Draw.buildDoubleEliminationPlan(k);
    const rowsByLabel = label => deRows.filter(r => r[MATCH_COL.ROUND - 1] === label);
    const isRoundDone = label => {
      const rows = rowsByLabel(label);
      return rows.length > 0 && rows.every(r => r[MATCH_COL.STATUS - 1] === "Завершен");
    };
    const roundExists = label => rowsByLabel(label).length > 0;

    // Возвращают объекты {fio, id} — ID нужен, чтобы дальше по сетке
    // не спутать людей с одинаковым ФИО (тёзок)
    const getWinners = rows => rows
      .map(r => ({ fio: r[MATCH_COL.WINNER - 1], id: r[MATCH_COL.WINNER_ID - 1] }))
      .filter(w => w.fio);
    const getLosers = rows => rows.map(r => {
      const p1 = r[MATCH_COL.PLAYER1 - 1], p2 = r[MATCH_COL.PLAYER2 - 1];
      const p1Id = r[MATCH_COL.PLAYER1_ID - 1], p2Id = r[MATCH_COL.PLAYER2_ID - 1];
      const winnerId = r[MATCH_COL.WINNER_ID - 1];
      if (p1 === "БАЙ" || p2 === "БАЙ") return null; // бай не считается реальным проигравшим
      const loserIsP1 = winnerId === p2Id;
      return loserIsP1 ? { fio: p1, id: p1Id } : { fio: p2, id: p2Id };
    }).filter(Boolean);

    let nextId = Draw.getNextMatchId(sheet);
    const newRows = [];
    const createdLabels = [];

    const addRow = (label, a, b) => {
      if (a && b) {
        newRows.push([nextId, label, "", a.fio, b.fio, "", "", "Ожидает", "", "", "", "", a.id, b.id, "", category || ""]);
        nextId++;
        return true;
      } else if (a || b) {
        const w = a || b;
        newRows.push([nextId, label, "", w.fio, "БАЙ", "Тех. победа", w.fio, "Завершен", "", "", "Проход без игры", "", w.id, "", w.id, category || ""]);
        nextId++;
        return true;
      }
      return false;
    };

    plan.forEach(step => {
      if (step.type === "GF" || step.type === "GF2") return; // обрабатываются отдельно ниже
      if (roundExists(step.label)) return;

      if (step.type === "WB") {
        if (step.num === 1) return; // создаётся в Draw.startDoubleElimination
        const prevNum = step.num - 1;
        const prevLabel = prevNum === k ? "DE WB Финал" : `DE WB Раунд ${prevNum}`;
        if (!isRoundDone(prevLabel)) return;

        const winners = getWinners(rowsByLabel(prevLabel));
        let any = false;
        for (let i = 0; i < winners.length; i += 2) any = addRow(step.label, winners[i], winners[i + 1]) || any;
        if (any) createdLabels.push(step.label);
        return;
      }

      // step.type === "LB"
      if (step.kind === "consolidation" && step.sourceWBLosers) {
        // LB Раунд 1: проигравшие WB Раунда 1, парами между собой
        const wbLabel = "DE WB Раунд 1";
        if (!isRoundDone(wbLabel)) return;
        const losers = getLosers(rowsByLabel(wbLabel));
        let any = false;
        for (let i = 0; i < losers.length; i += 2) any = addRow(step.label, losers[i], losers[i + 1]) || any;
        if (any) createdLabels.push(step.label);
        return;
      }

      if (step.kind === "consolidation") {
        // Консолидация победителей предыдущего (drop-in) LB раунда
        const prevStep = plan.find(s => s.type === "LB" && s.num === step.sourceLB);
        if (!prevStep || !isRoundDone(prevStep.label)) return;
        const winners = getWinners(rowsByLabel(prevStep.label));
        if (winners.length < 2) return; // одному пока некого ждать в консолидации
        let any = false;
        for (let i = 0; i < winners.length; i += 2) any = addRow(step.label, winners[i], winners[i + 1]) || any;
        if (any) createdLabels.push(step.label);
        return;
      }

      if (step.kind === "dropin") {
        const wbLabel = step.sourceWBLosers === k ? "DE WB Финал" : `DE WB Раунд ${step.sourceWBLosers}`;
        const prevStep = plan.find(s => s.type === "LB" && s.num === step.sourceLB);
        if (!prevStep || !isRoundDone(wbLabel) || !isRoundDone(prevStep.label)) return;

        const losers = getLosers(rowsByLabel(wbLabel));
        const winners = getWinners(rowsByLabel(prevStep.label));
        let any = false;
        for (let i = 0; i < Math.max(losers.length, winners.length); i++) {
          any = addRow(step.label, winners[i], losers[i]) || any;
        }
        if (any) createdLabels.push(step.label);
      }
    });

    if (newRows.length > 0) {
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, newRows.length, newRows[0].length).setValues(newRows);
    }

    // Гранд-финал: как только WB Финал и LB Финал оба завершены
    const lbFinalStep = plan.slice().reverse().find(s => s.type === "LB");
    if (!roundExists("DE Гранд-финал") && isRoundDone("DE WB Финал") && isRoundDone(lbFinalStep.label)) {
      const wbWinner = getWinners(rowsByLabel("DE WB Финал"))[0];
      const lbWinner = getWinners(rowsByLabel(lbFinalStep.label))[0];
      const startRow2 = sheet.getLastRow() + 1;
      sheet.getRange(startRow2, 1, 1, 16).setValues([[
        Draw.getNextMatchId(sheet), "DE Гранд-финал", "", wbWinner.fio, lbWinner.fio, "", "", "Ожидает", "", "", "", "",
        wbWinner.id, lbWinner.id, "", category || ""
      ]]);
      return { nextRound: "DE Гранд-финал", matchesCreated: 1 };
    }

    // Итог гранд-финала: если победила сторона LB (у которой уже было
    // 1 поражение) — по правилам double elimination нужна переигровка,
    // т.к. у "чистого" WB-финалиста ещё не было ни одного поражения.
    // Сравниваем по ID, а не по ФИО — чтобы тёзки не сбивали логику.
    if (isRoundDone("DE Гранд-финал") && !roundExists("DE Гранд-финал (реванш)")) {
      const gfRows = rowsByLabel("DE Гранд-финал");
      const gfWinnerId = gfRows[0][MATCH_COL.WINNER_ID - 1];
      const gfWinnerFio = gfRows[0][MATCH_COL.WINNER - 1];
      const wbFinalWinner = getWinners(rowsByLabel("DE WB Финал"))[0];

      if (gfWinnerId !== wbFinalWinner.id) {
        const p1 = gfRows[0][MATCH_COL.PLAYER1 - 1];
        const p2 = gfRows[0][MATCH_COL.PLAYER2 - 1];
        const p1Id = gfRows[0][MATCH_COL.PLAYER1_ID - 1];
        const p2Id = gfRows[0][MATCH_COL.PLAYER2_ID - 1];
        const startRow3 = sheet.getLastRow() + 1;
        sheet.getRange(startRow3, 1, 1, 16).setValues([[
          Draw.getNextMatchId(sheet), "DE Гранд-финал (реванш)", "", p1, p2, "", "", "Ожидает", "", "", "", "",
          p1Id, p2Id, "", category || ""
        ]]);
        return { nextRound: "DE Гранд-финал (реванш)", matchesCreated: 1 };
      } else {
        return { champion: gfWinnerFio };
      }
    }

    if (isRoundDone("DE Гранд-финал (реванш)")) {
      const rows2 = rowsByLabel("DE Гранд-финал (реванш)");
      return { champion: rows2[0][MATCH_COL.WINNER - 1] };
    }

    if (createdLabels.length > 0) {
      return { nextRound: createdLabels.join(", "), matchesCreated: newRows.length };
    }

    return null;
  }

  // Дописывает новый раунд в лист "Плей-офф" (initial раунд туда
  // пишет Draw.startSingleElimination, дальше — эта функция при
  // каждом автопродвижении)
  static appendToPlayoffSheet(roundLabel, winners, category) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const playoffSheet = Theme.findSheetByBaseName(ss, "Плей-офф") || ss.getSheetByName("Плей-офф");
    if (!playoffSheet) return;

    const displayLabel = category ? `${category} — ${roundLabel}` : roundLabel;
    const rows = [["", "", "", ""], [displayLabel, "", "", ""]];
    for (let i = 0; i < winners.length; i += 2) {
      rows.push([displayLabel, winners[i], "vs", winners[i + 1] || "БАЙ"]);
    }

    const startRow = playoffSheet.getLastRow() + 1;
    playoffSheet.getRange(startRow, 1, rows.length, 4).setValues(rows);
  }

  // ========================================================
  // ШВЕЙЦАРСКАЯ СИСТЕМА — туры 2+
  // ----------------------------------------------------------
  // Draw.startSwissRound1() создаёт только 1-й тур (верхняя
  // половина посева против нижней). Дальше пары считаются здесь,
  // по текущим очкам (2 за победу, 1 за поражение — как в группах),
  // с избеганием повторных встреч.
  //
  // ЧЕСТНО ОБ УПРОЩЕНИИ: это не полноценный "оптимальный" swiss-
  // пейринг (как в шахматных программах с коэффициентом Бухгольца
  // и оптимизацией через паросочетания) — это классический жадный
  // алгоритм: сортировка по очкам, затем каждому по порядку
  // подбирается ближайший ещё не встречавшийся соперник. Для
  // клубного турнира на 15-60 человек этого достаточно и корректно
  // по духу правил, но в редких сложных случаях (много участников
  // с одинаковыми очками и уже сыгранными парами) возможны не
  // самые оптимальные, но всегда КОРРЕКТНЫЕ (без повторных встреч,
  // где это в принципе возможно) пары.
  // ========================================================

  /**
   * Генерирует следующий тур швейцарки. Требует, чтобы текущий
   * (последний созданный) тур был полностью завершён.
   */
  static startSwissNextRound() {
    const sheet = this.getMatchesSheet();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const categories = Categories.activeLabels(ss);
    const data = sheet.getDataRange().getValues();

    const roundNumOf = label => {
      const m = String(label).match(/тур (\d+)/);
      return m ? Number(m[1]) : 1;
    };

    const summary = [];
    const waiting = [];
    const notStarted = [];

    categories.forEach(category => {
      const swissRows = data.slice(1).filter(r =>
        String(r[MATCH_COL.ROUND - 1] || "").indexOf("Швейцария") === 0 &&
        (r[MATCH_COL.CATEGORY - 1] || "") === (category || "")
      );

      if (swissRows.length === 0) {
        notStarted.push(category || "Общий зачёт");
        return;
      }

      const currentRound = Math.max.apply(null, swissRows.map(r => roundNumOf(r[MATCH_COL.ROUND - 1])));
      const currentRoundRows = swissRows.filter(r => roundNumOf(r[MATCH_COL.ROUND - 1]) === currentRound);

      if (!currentRoundRows.every(r => r[MATCH_COL.STATUS - 1] === "Завершен")) {
        waiting.push(`${category || "Общий зачёт"} (тур ${currentRound})`);
        return;
      }

      const nextRoundLabel = `Швейцария, тур ${currentRound + 1}`;
      if (swissRows.some(r => r[MATCH_COL.ROUND - 1] === nextRoundLabel)) return; // уже создан ранее

      const players = this.getSwissPlayers(swissRows);
      if (players.length < 2) {
        waiting.push(`${category || "Общий зачёт"} (недостаточно участников)`);
        return;
      }

      const pairs = this.pairSwissRound(players);

      let nextId = Draw.getNextMatchId(sheet);
      const rows = [];
      pairs.forEach(pair => {
        if (pair.length === 1) {
          rows.push([nextId, nextRoundLabel, "", pair[0].fio, "БАЙ", "Тех. победа", pair[0].fio, "Завершен", "", "", "Проход без игры (бай)", "", pair[0].id, "", pair[0].id, category || ""]);
        } else {
          rows.push([nextId, nextRoundLabel, "", pair[0].fio, pair[1].fio, "", "", "Ожидает", "", "", "", "", pair[0].id, pair[1].id, "", category || ""]);
        }
        nextId++;
      });

      if (rows.length > 0) {
        const startRow = sheet.getLastRow() + 1;
        sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
      }

      summary.push({ category, round: nextRoundLabel, matches: rows.length });
    });

    if (summary.length === 0) {
      if (notStarted.length === categories.length) {
        throw new MatchesError('Швейцарская система ещё не запущена (Жеребьёвка → Швейцарская система).');
      }
      throw new MatchesError(`Новый тур пока не готов ни в одной категории. Ожидают завершения: ${waiting.join("; ") || "—"}.`);
    }

    AppLog.write("Швейцария: новый тур", summary.map(s => `${s.category || "Общий зачёт"}: ${s.round}, ${s.matches} матчей`).join("; "));

    return { byCategory: summary, waiting, notStarted };
  }

  // Собирает список участников швейцарки с текущими очками,
  // множеством ID уже сыгранных соперников (не ФИО — чтобы не
  // путать тёзок) и признаком "уже был бай". Ключ статистики — ID.
  static getSwissPlayers(swissRows) {
    const stats = {}; // id -> {fio, points, opponents:Set<id>, hadBye}
    const order = []; // сохраняем порядок первого появления как доп. tie-break

    swissRows.forEach(r => {
      const p1 = r[MATCH_COL.PLAYER1 - 1];
      const p2 = r[MATCH_COL.PLAYER2 - 1];
      const p1Id = r[MATCH_COL.PLAYER1_ID - 1];
      const p2Id = r[MATCH_COL.PLAYER2_ID - 1];
      const status = r[MATCH_COL.STATUS - 1];
      const winnerId = r[MATCH_COL.WINNER_ID - 1];

      [[p1, p1Id], [p2, p2Id]].forEach(([fio, id]) => {
        if (fio === "БАЙ" || !id) return;
        if (!stats[id]) { stats[id] = { fio, points: 0, opponents: new Set(), hadBye: false }; order.push(id); }
      });

      if (status !== "Завершен") return;

      if (p1 === "БАЙ" || p2 === "БАЙ") {
        const realId = p1 === "БАЙ" ? p2Id : p1Id;
        if (stats[realId]) { stats[realId].points += 2; stats[realId].hadBye = true; }
        return;
      }
      if (!p1Id || !p2Id) return; // старые данные без ID — пропускаем безопасно

      stats[p1Id].opponents.add(p2Id);
      stats[p2Id].opponents.add(p1Id);

      if (winnerId === p1Id) { stats[p1Id].points += 2; stats[p2Id].points += 1; }
      else if (winnerId === p2Id) { stats[p2Id].points += 2; stats[p1Id].points += 1; }
    });

    const players = order.map(id => ({
      id,
      fio: stats[id].fio,
      points: stats[id].points,
      opponents: stats[id].opponents,
      hadBye: stats[id].hadBye
    }));

    players.sort((a, b) => b.points - a.points || a.fio.localeCompare(b.fio));
    return players;
  }

  // Жадный алгоритм пар: сортировка по очкам уже сделана в
  // getSwissPlayers; при нечётном числе игроков бай уходит самому
  // слабому по текущим очкам, у кого его ещё не было (если такой есть).
  // Сравнение "уже играли между собой" — по ID, не по ФИО.
  static pairSwissRound(players) {
    let pool = players.slice();
    const pairs = [];

    if (pool.length % 2 !== 0) {
      let byeIndex = -1;
      for (let i = pool.length - 1; i >= 0; i--) {
        if (!pool[i].hadBye) { byeIndex = i; break; }
      }
      if (byeIndex === -1) byeIndex = pool.length - 1;
      const byePlayer = pool.splice(byeIndex, 1)[0];
      pairs.push([byePlayer]);
    }

    while (pool.length > 0) {
      const a = pool.shift();
      let idx = pool.findIndex(p => !a.opponents.has(p.id));
      if (idx === -1) idx = 0; // все оставшиеся уже игрались с a — берём ближайшего по очкам
      const b = pool.splice(idx, 1)[0];
      pairs.push([a, b]);
    }

    return pairs;
  }

  // ========================================================
  // ИТОГИ ГРУПП (для передачи квалифицировавшихся в плей-офф)
  // ========================================================

  /**
   * Считает места ВНУТРИ каждой группы отдельно — та же методика
   * тай-брейка, что и в общем recalcRating() (очки → личная встреча →
   * соотношение партий → соотношение очков), но результат не
   * записывается в лист, а возвращается для использования при
   * построении сетки плей-офф.
   * Возвращает { "Группа A": [{id, fio, points, wins, losses, gamesRatio, pointsRatio}, ...], ... }
   */
  static getGroupStandings(category) {
    const byGroup = {};

    this.getResults().forEach(m => {
      if ((m.category || "") !== (category || "")) return;
      const gm = String(m.round || "").match(/^(Группа [^,]+),/);
      if (!gm) return;
      const label = gm[1];
      if (!byGroup[label]) byGroup[label] = [];
      byGroup[label].push(m);
    });

    const standings = {};
    Object.keys(byGroup).forEach(label => {
      standings[label] = this.computeStandingsForMatches(byGroup[label]);
    });
    return standings;
  }

  // Общий расчёт мест по произвольному списку завершённых матчей
  // (используется и для итогов групп). Логика идентична recalcRating(),
  // но без побочного эффекта записи в лист.
  static computeStandingsForMatches(matchList) {
    const stats = {};

    matchList.forEach(m => {
      if (!m.player1 || !m.player2) return;
      if (m.player1 === "БАЙ" || m.player2 === "БАЙ") return;

      const id1 = m.player1Id, id2 = m.player2Id;
      if (!id1 || !id2) return;

      if (!stats[id1]) stats[id1] = { fio: m.player1, points: 0, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsWon: 0, pointsLost: 0, beats: new Set() };
      if (!stats[id2]) stats[id2] = { fio: m.player2, points: 0, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsWon: 0, pointsLost: 0, beats: new Set() };

      const scoreMatch = String(m.score || "").match(/^(\d+)\s*[:\-]\s*(\d+)$/);
      const g1 = scoreMatch ? Number(scoreMatch[1]) : 0;
      const g2 = scoreMatch ? Number(scoreMatch[2]) : 0;
      stats[id1].gamesWon += g1; stats[id1].gamesLost += g2;
      stats[id2].gamesWon += g2; stats[id2].gamesLost += g1;

      if (m.parts) {
        String(m.parts).split(",").forEach(gp => {
          const gg = gp.trim().match(/^(\d+)\s*[:\-]\s*(\d+)$/);
          if (!gg) return;
          stats[id1].pointsWon += Number(gg[1]); stats[id1].pointsLost += Number(gg[2]);
          stats[id2].pointsWon += Number(gg[2]); stats[id2].pointsLost += Number(gg[1]);
        });
      }

      const winnerId = m.winnerId;
      const isWalkover = String(m.note || "").indexOf("Неявка:") === 0;
      const loserPoints = isWalkover ? 0 : 1;

      if (winnerId === id1) {
        stats[id1].wins++; stats[id1].points += 2;
        stats[id2].losses++; stats[id2].points += loserPoints;
        stats[id1].beats.add(id2);
      } else if (winnerId === id2) {
        stats[id2].wins++; stats[id2].points += 2;
        stats[id1].losses++; stats[id1].points += loserPoints;
        stats[id2].beats.add(id1);
      }
    });

    const players = Object.keys(stats).map(id => {
      const s = stats[id];
      return {
        id, fio: s.fio, points: s.points, wins: s.wins, losses: s.losses,
        gamesRatio: s.gamesLost > 0 ? s.gamesWon / s.gamesLost : s.gamesWon,
        pointsRatio: s.pointsLost > 0 ? s.pointsWon / s.pointsLost : s.pointsWon,
        beats: s.beats
      };
    });

    players.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (a.beats.has(b.id) && !b.beats.has(a.id)) return -1;
      if (b.beats.has(a.id) && !a.beats.has(b.id)) return 1;
      if (b.gamesRatio !== a.gamesRatio) return b.gamesRatio - a.gamesRatio;
      return b.pointsRatio - a.pointsRatio;
    });

    return players;
  }

  /**
   * Собирает финалистов плей-офф по итогам групп: из каждой группы
   * берутся топ-N (N = qualifyCount) по занятому месту. Общий посев
   * для сетки строится "линиями мест" — сначала все 1-е места всех
   * групп (отсортированные между собой по очкам/коэффициентам, т.к.
   * друг с другом они не играли и личной встречи для сравнения нет),
   * затем все 2-е места, и т.д.
   */
  static getPlayoffQualifiers(qualifyCount, category) {
    const standings = this.getGroupStandings(category);
    const groupLabels = Object.keys(standings).sort();

    const byPlace = [];
    groupLabels.forEach(label => {
      const list = standings[label];
      for (let i = 0; i < qualifyCount && i < list.length; i++) {
        if (!byPlace[i]) byPlace[i] = [];
        byPlace[i].push(list[i]);
      }
    });

    byPlace.forEach(line => {
      line.sort((a, b) => b.points - a.points || b.gamesRatio - a.gamesRatio || b.pointsRatio - a.pointsRatio);
    });

    const qualifiers = [];
    byPlace.forEach(line => qualifiers.push(...line));

    return qualifiers.map((p, i) => ({ id: p.id, fio: p.fio, seed: i + 1 }));
  }

  // ========================================================
  // Вспомогательное
  // ========================================================

  static getMatchesSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = Theme.findSheetByBaseName(ss, "Матчи") || ss.getSheetByName("Матчи");
    if (!sheet) {
      throw new MatchesError('Лист "Матчи" не найден.');
    }
    return sheet;
  }

  static getMatchesData() {
    const sheet = this.getMatchesSheet();
    const data = sheet.getDataRange().getValues();
    const result = [];

    for (let i = 1; i < data.length; i++) {
      if (!data[i][MATCH_COL.ID - 1]) continue;
      result.push({
        id: data[i][MATCH_COL.ID - 1],
        round: data[i][MATCH_COL.ROUND - 1],
        table: data[i][MATCH_COL.TABLE - 1],
        player1: data[i][MATCH_COL.PLAYER1 - 1],
        player2: data[i][MATCH_COL.PLAYER2 - 1],
        score: data[i][MATCH_COL.SCORE - 1],
        winner: data[i][MATCH_COL.WINNER - 1],
        status: data[i][MATCH_COL.STATUS - 1],
        note: data[i][MATCH_COL.NOTE - 1],
        parts: data[i][MATCH_COL.PARTS - 1],
        player1Id: data[i][MATCH_COL.PLAYER1_ID - 1],
        player2Id: data[i][MATCH_COL.PLAYER2_ID - 1],
        winnerId: data[i][MATCH_COL.WINNER_ID - 1],
        category: data[i][MATCH_COL.CATEGORY - 1] || ""
      });
    }
    return result;
  }

}


class MatchesError extends Error {
  constructor(message) {
    super(message);
    this.name = "MatchesError";
  }
}