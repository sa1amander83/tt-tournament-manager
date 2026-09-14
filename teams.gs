/**
 * ==========================================================
 * TT Tournament Manager
 * Teams.gs
 * Версия 0.1
 * ----------------------------------------------------------
 * Поддержка ПАРНОГО разряда (2×2). Подход намеренно простой:
 * вместо переделки Draw.gs/Matches.gs/Reports.gs под "команды
 * из двух человек" — пара регистрируется как ОДИН виртуальный
 * "составной" участник (ФИО вида "Иванов Иван / Петров Пётр")
 * прямо в листе "Участники". Вся остальная система (посев,
 * группы, сетки, рейтинг, отчёты) работает с этой строкой
 * ТОЧНО ТАК ЖЕ, как с обычным одиночным участником — никаких
 * изменений в Draw.gs/Matches.gs/Reports.gs не потребовалось.
 *
 * Двое исходных участников, из которых собрана пара, помечаются
 * статусом "В паре" — это исключает их из отдельного посева/
 * жеребьёвки как одиночек (они играют только как пара).
 *
 * ЧЕСТНО ОБ УПРОЩЕНИИ:
 *  - Рейтинг пары считается как среднее арифметическое рейтингов
 *    двух участников (только если у ОБОИХ рейтинг подтверждён) —
 *    это разумное, но не единственно возможное решение.
 *  - Форма регистрации по-прежнему регистрирует только отдельных
 *    людей. Пары собирает организатор вручную через меню, а не
 *    участники сами через форму — самостоятельная привязка
 *    "с кем я в паре" через Google Forms ненадёжна (нет способа
 *    сослаться на ещё не существующую анкету партнёра).
 * ==========================================================
 */

class Teams {

  /**
   * Создаёт пару из двух уже зарегистрированных участников (по ID).
   * Добавляет в "Участники" новую строку — виртуального
   * составного участника, помечает исходных двоих статусом "В паре".
   */
  static createTeam(id1, id2) {
    if (String(id1) === String(id2)) {
      throw new TeamsError("Нельзя создать пару из одного и того же участника дважды.");
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = Participants.getParticipantsSheet(ss);
    const data = sheet.getDataRange().getValues();

    const row1 = this.findParticipantRow(data, id1);
    const row2 = this.findParticipantRow(data, id2);

    if (row1 === -1 || row2 === -1) {
      throw new TeamsError("Один или оба участника с указанными ID не найдены.");
    }

    const p1 = data[row1];
    const p2 = data[row2];

    if (p1[10] === "В паре" || p2[10] === "В паре") {
      throw new TeamsError("Один из участников уже состоит в другой паре.");
    }

    const teamFio = `${p1[1]} / ${p2[1]}`;

    // Рейтинг команды — среднее, только если у ОБОИХ рейтинг подтверждён
    const rating1Confirmed = p1[11] === "Да" && p1[8] !== "" && !isNaN(Number(p1[8]));
    const rating2Confirmed = p2[11] === "Да" && p2[8] !== "" && !isNaN(Number(p2[8]));
    let teamRating = "";
    let teamRatingConfirmed = "Нет";
    if (rating1Confirmed && rating2Confirmed) {
      teamRating = Math.round((Number(p1[8]) + Number(p2[8])) / 2);
      teamRatingConfirmed = "Да";
    }

    const nextId = Participants.getNextId(sheet);

    const teamRow = [
      nextId,
      teamFio,
      "",                  // Дата рождения — неприменимо для пары
      "",                  // Возраст — неприменимо для пары
      p1[4] || p2[4],      // Город — берём у первого, если есть
      "",                  // Телефон — неприменимо для пары (контакты см. у исходных участников)
      "",                  // Telegram — аналогично
      p1[7],               // Уровень — берём уровень первого (упрощение; можно поправить вручную)
      teamRating,
      "",                  // Посев — заполняется на этапе жеребьёвки
      "Зарегистрирован",
      teamRatingConfirmed,
      "",                  // Ссылка на подтверждение рейтинга — неприменимо для составной записи
      "",                  // Согласие с положением — берётся у исходных участников по отдельности
      id1,
      id2,
      "",  // Пол — неприменимо для составной записи; категория пары
           // резолвится через участника 1 (см. Categories.resolveAgeGender)
      "",  // Категория — заполняется на этапе жеребьёвки
      ""   // Категория (вручную) — тоже резолвится через участника 1
    ];

    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, 1, teamRow.length).setValues([teamRow]);

    // Помечаем исходных участников как "В паре", чтобы они не
    // попали в жеребьёвку отдельно от своей пары
    sheet.getRange(row1 + 1, 11).setValue("В паре");
    sheet.getRange(row2 + 1, 11).setValue("В паре");

    AppLog.write("Пара создана", `${teamFio} (ID пары: ${nextId})`);

    return { id: nextId, fio: teamFio, rating: teamRating, ratingConfirmed: teamRatingConfirmed === "Да" };
  }

  /**
   * Расформировывает пару обратно на двух отдельных участников:
   * удаляет строку-команду, возвращает исходным двоим статус
   * "Зарегистрирован". Полезно, если пару создали по ошибке.
   */
  static dissolveTeam(teamId) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = Participants.getParticipantsSheet(ss);
    const data = sheet.getDataRange().getValues();

    const teamRow = this.findParticipantRow(data, teamId);
    if (teamRow === -1) {
      throw new TeamsError(`Пара с ID ${teamId} не найдена.`);
    }

    const id1 = data[teamRow][14];
    const id2 = data[teamRow][15];
    if (!id1 || !id2) {
      throw new TeamsError(`Участник с ID ${teamId} не является парой (нет привязанных ID участников).`);
    }

    sheet.deleteRow(teamRow + 1);

    const data2 = sheet.getDataRange().getValues();
    const row1 = this.findParticipantRow(data2, id1);
    const row2 = this.findParticipantRow(data2, id2);
    if (row1 !== -1) sheet.getRange(row1 + 1, 11).setValue("Зарегистрирован");
    if (row2 !== -1) sheet.getRange(row2 + 1, 11).setValue("Зарегистрирован");

    AppLog.write("Пара расформирована", `ID пары: ${teamId}`);

    return { dissolved: true };
  }

  static findParticipantRow(data, id) {
    for (let i = 1; i < data.length; i++) {
      if (Number(data[i][0]) === Number(id)) return i;
    }
    return -1;
  }

}


class TeamsError extends Error {
  constructor(message) {
    super(message);
    this.name = "TeamsError";
  }
}