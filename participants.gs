/**
 * ==========================================================
 * TT Tournament Manager
 * Participants.gs
 * Версия 0.1
 * ----------------------------------------------------------
 * Отвечает ТОЛЬКО за работу со списком участников:
 *  - импорт из листа "📩 Ответы формы" (создан в Forms.gs)
 *  - импорт из вставленного диапазона Excel/CSV
 *  - экспорт участников в новый Google Sheet файл
 *
 * Не занимается посевом/жеребьёвкой — это Draw.gs (будущий модуль).
 * ==========================================================
 */

const PARTICIPANTS_SHEET_BASE_NAME = "Участники";

// Единственный источник правды для шапки листа "Участники" —
// используется и при создании турнира (Setup.gs), и для
// самовосстановления перед импортом (см. ensureHeaderRow ниже)
const PARTICIPANTS_HEADERS = [
  "ID",
  "ФИО",
  "Дата рождения",
  "Возраст",
  "Город",
  "Телефон",
  "Telegram",
  "Уровень",
  "Рейтинг",
  "Посев",
  "Статус",
  "Рейтинг подтверждён",
  "Ссылка на подтверждение рейтинга",
  "Согласие с положением",
  "ID участника 1 (пара)",
  "ID участника 2 (пара)",
  "Пол",
  "Категория",
  "Категория (вручную)"
];

class Participants {

  // ========================================================
  // ИМПОРТ ИЗ ФОРМЫ
  // ========================================================

  /**
   * Переносит новые ответы из листа "📩 Ответы формы" в "Участники".
   * Не дублирует уже перенесённые строки (сверяет по ФИО+Телефону).
   * Возвращает количество добавленных участников.
   */
  static importFromForm() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const responseSheet = ss.getSheetByName(FORM_RESPONSES_SHEET_NAME);
    const participantsSheet = this.getParticipantsSheet(ss);
    this.ensureHeaderRow(participantsSheet);

    if (!responseSheet) {
      throw new ParticipantsError(
        "Лист «📩 Ответы формы» не найден. Сначала создайте форму регистрации (Участники → Создать форму регистрации)."
      );
    }

    const responseData = responseSheet.getDataRange().getValues();
    if (responseData.length < 2) {
      return { added: 0, skipped: 0 };
    }

    const responseHeaders = responseData[0];
    const col = this.mapFormColumns(responseHeaders);

    const existing = this.loadExistingKeys(participantsSheet);
    let nextId = this.getNextId(participantsSheet);

    const rowsToAdd = [];

    for (let i = 1; i < responseData.length; i++) {
      const row = responseData[i];

      const fio = col.fio >= 0 ? String(row[col.fio]).trim() : "";
      const phone = col.phone >= 0 ? String(row[col.phone]).trim() : "";
      if (!fio) continue;

      const key = this.buildKey(fio, phone);
      if (existing.has(key)) continue;

      const birthDate = col.birthDate >= 0 ? row[col.birthDate] : "";
      const gender = col.gender >= 0 ? this.normalizeGender(row[col.gender]) : "";
      const city = col.city >= 0 ? row[col.city] : "";
      const telegram = col.telegram >= 0 ? row[col.telegram] : "";
      const level = col.level >= 0 ? this.normalizeLevel(row[col.level]) : "";
      const ratingRaw = col.rating >= 0 ? row[col.rating] : "";
      const rating = (ratingRaw !== "" && !isNaN(Number(ratingRaw))) ? Number(ratingRaw) : "";
      const ratingProof = col.ratingProof >= 0 ? String(row[col.ratingProof] || "").trim() : "";
      const agreement = col.agreement >= 0 ? String(row[col.agreement] || "").trim() : "";

      rowsToAdd.push([
        nextId,
        fio,
        birthDate,
        this.calcAge(birthDate),
        city,
        phone,
        telegram,
        level,
        rating,           // Рейтинг — вписан самим участником через форму
        "",               // Посев — заполняется на этапе жеребьёвки
        "Зарегистрирован",
        "Нет",            // Рейтинг подтверждён — ТОЛЬКО организатор может подтвердить вручную;
                           // самостоятельно вписанный рейтинг НЕ используется для посева,
                           // пока это значение не станет "Да" (см. Draw.seedPlayers)
        ratingProof,
        agreement,        // Согласие с положением — что участник фактически отметил в форме
        "",               // ID участника 1 (пара) — заполняется отдельно через "Создать пару"
        "",               // ID участника 2 (пара)
        gender,           // Пол
        "",               // Категория — заполняется на этапе жеребьёвки
        ""                // Категория (вручную) — organiser заполняет сам при необходимости
      ]);

      existing.add(key);
      nextId++;
    }

    if (rowsToAdd.length > 0) {
      const startRow = participantsSheet.getLastRow() + 1;
      participantsSheet
        .getRange(startRow, 1, rowsToAdd.length, rowsToAdd[0].length)
        .setValues(rowsToAdd);
    }

    const result = {
      added: rowsToAdd.length,
      skipped: (responseData.length - 1) - rowsToAdd.length
    };
    AppLog.write("Импорт из формы", `Добавлено: ${result.added}, пропущено: ${result.skipped}`);
    return result;
  }

  // Определяем, в каком столбце листа ответов какое поле —
  // Google Forms называет столбцы по тексту вопроса, порядок
  // может отличаться, поэтому ищем по заголовку, а не по индексу
  static mapFormColumns(headers) {
    const find = (needle) => headers.findIndex(h =>
      String(h).toLowerCase().indexOf(needle.toLowerCase()) !== -1
    );
    // Точное совпадение — чтобы не перепутать с "Подтверждение рейтинга"
    // (там тоже есть слово "Подтверждение", но это другое поле)
    const findExact = (name) => headers.findIndex(h => String(h).trim() === name);

    return {
      fio: find("ФИО"),
      birthDate: find("Дата рождения"),
      gender: find("Пол"),
      city: find("Город"),
      phone: find("Телефон"),
      telegram: find("Telegram"),
      level: find("Уровень"),
      rating: find("Рейтинг ("),
      ratingProof: find("Подтверждение рейтинга"),
      agreement: findExact("Подтверждение")
    };
  }

  // ========================================================
  // ИМПОРТ ИЗ EXCEL
  // ========================================================

  /**
   * Импортирует участников из диапазона, который пользователь
   * заранее вставил на лист "Импорт" (простой и надёжный способ
   * без работы с бинарными .xlsx файлами внутри Apps Script).
   * Ожидаемые столбцы, в любом порядке, по заголовку первой строки:
   * ФИО, Дата рождения, Город, Телефон, Telegram, Уровень
   */
  static importFromExcelRange(importSheetName) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const importSheet = ss.getSheetByName(importSheetName);

    if (!importSheet) {
      throw new ParticipantsError(
        `Лист «${importSheetName}» не найден. Вставьте данные из Excel на лист с этим именем и запустите импорт снова.`
      );
    }

    const data = importSheet.getDataRange().getValues();
    if (data.length < 2) {
      return { added: 0, skipped: 0 };
    }

    const headers = data[0];
    const col = this.mapFormColumns(headers); // те же названия полей подходят

    if (col.fio < 0) {
      throw new ParticipantsError(
        'В импортируемых данных не найден столбец "ФИО". Проверьте заголовки первой строки.'
      );
    }

    const participantsSheet = this.getParticipantsSheet(ss);
    this.ensureHeaderRow(participantsSheet);
    const existing = this.loadExistingKeys(participantsSheet);
    let nextId = this.getNextId(participantsSheet);

    const rowsToAdd = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const fio = String(row[col.fio] || "").trim();
      if (!fio) continue;

      const phone = col.phone >= 0 ? String(row[col.phone] || "").trim() : "";
      const key = this.buildKey(fio, phone);
      if (existing.has(key)) continue;

      const birthDate = col.birthDate >= 0 ? row[col.birthDate] : "";
      const gender = col.gender >= 0 ? this.normalizeGender(row[col.gender]) : "";
      const ratingRaw = col.rating >= 0 ? row[col.rating] : "";
      const rating = (ratingRaw !== "" && !isNaN(Number(ratingRaw))) ? Number(ratingRaw) : "";
      const ratingProof = col.ratingProof >= 0 ? String(row[col.ratingProof] || "").trim() : "";

      rowsToAdd.push([
        nextId,
        fio,
        birthDate,
        this.calcAge(birthDate),
        col.city >= 0 ? row[col.city] : "",
        phone,
        col.telegram >= 0 ? row[col.telegram] : "",
        col.level >= 0 ? this.normalizeLevel(row[col.level]) : "",
        rating,
        "",
        "Зарегистрирован",
        "Нет",   // Рейтинг подтверждён — как и при импорте из формы, требует ручного подтверждения
        ratingProof,
        "",       // Согласие с положением — неприменимо при импорте из Excel (это не форма)
        "",       // ID участника 1 (пара)
        "",       // ID участника 2 (пара)
        gender,   // Пол
        "",       // Категория — заполняется на этапе жеребьёвки
        ""        // Категория (вручную)
      ]);

      existing.add(key);
      nextId++;
    }

    if (rowsToAdd.length > 0) {
      const startRow = participantsSheet.getLastRow() + 1;
      participantsSheet
        .getRange(startRow, 1, rowsToAdd.length, rowsToAdd[0].length)
        .setValues(rowsToAdd);
    }

    const result = {
      added: rowsToAdd.length,
      skipped: (data.length - 1) - rowsToAdd.length
    };
    AppLog.write("Импорт из Excel", `Лист «${importSheetName}». Добавлено: ${result.added}, пропущено: ${result.skipped}`);
    return result;
  }

  // ========================================================
  // ОПОЗДАВШИЙ ИГРОК
  // ========================================================

  /**
   * Добавляет одного участника вручную (организатор вбивает данные
   * прямо на месте, когда игрок подошёл после начала турнира) — та же
   * шапка "Участники", что и при импорте, но без листа-источника.
   * fields: { fio, birthDate (Date|string дд.мм.гггг), gender ("М"/"Ж"),
   * level, rating (number|"") }. Рейтинг, как и при импорте, попадает в
   * столбец "Рейтинг", но "Рейтинг подтверждён" = "Нет" — организатор
   * подтверждает его отдельно, если понадобится посев по рейтингу.
   * Возвращает добавленную строку в удобном виде (для Draw.addLatePlayer).
   */
  static addLatePlayer(fields) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = this.getParticipantsSheet(ss);
    this.ensureHeaderRow(sheet);

    const fio = String(fields.fio || "").trim();
    if (!fio) {
      throw new ParticipantsError("ФИО обязательно для заполнения.");
    }

    const birthDate = this.parseBirthDate(fields.birthDate);
    const gender = this.normalizeGender(fields.gender);
    if (gender !== "Мужской" && gender !== "Женский") {
      throw new ParticipantsError(`Не удалось распознать пол: получено «${fields.gender}».`);
    }
    const level = this.normalizeLevel(fields.level);
    const ratingRaw = fields.rating;
    const rating = (ratingRaw !== "" && ratingRaw !== undefined && ratingRaw !== null && !isNaN(Number(ratingRaw)))
      ? Number(ratingRaw) : "";

    const id = this.getNextId(sheet);

    const row = [
      id,
      fio,
      birthDate,
      this.calcAge(birthDate),
      "",              // Город
      "",              // Телефон
      "",              // Telegram
      level,
      rating,
      "",              // Посев — проставит Draw.addLatePlayer
      "Зарегистрирован",
      "Нет",           // Рейтинг подтверждён
      "",              // Ссылка на подтверждение рейтинга
      "",              // Согласие с положением
      "",              // ID участника 1 (пара)
      "",              // ID участника 2 (пара)
      gender,
      "",              // Категория — проставит Draw.addLatePlayer
      ""               // Категория (вручную)
    ];

    sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();
    AppLog.write("Опоздавший игрок добавлен", `${fio} (ID ${id})`);

    return { id, fio, birthDate, gender, level, rating };
  }

  // Принимает Date (как приходит из ui.prompt-парсинга в Menu.gs) или
  // строку "дд.мм.гггг"/"дд.мм.гг" — организатору проще вводить дату
  // руками в этом формате, чем в ISO.
  static parseBirthDate(value) {
    if (!value) return "";
    if (value instanceof Date) return value;

    const text = String(value).trim();
    const match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (!match) {
      throw new ParticipantsError('Дата рождения должна быть в формате дд.мм.гггг, например 15.03.1990.');
    }
    let [, day, month, year] = match;
    if (year.length === 2) year = "20" + year;

    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (isNaN(date.getTime())) {
      throw new ParticipantsError('Не удалось разобрать дату рождения — проверьте формат дд.мм.гггг.');
    }
    return date;
  }

  // ========================================================
  // ЭКСПОРТ
  // ========================================================

  /**
   * Создаёт отдельный Google Sheet файл со списком участников
   * (в папке турнира, если она известна) и возвращает ссылку на него.
   */
  static exportToNewSpreadsheet(config) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const participantsSheet = this.getParticipantsSheet(ss);

    const data = participantsSheet.getDataRange().getValues();

    const exportName = `Участники — ${config.name || "Турнир"}`;
    const newSs = SpreadsheetApp.create(exportName);
    const newSheet = newSs.getSheets()[0];
    newSheet.setName(PARTICIPANTS_SHEET_BASE_NAME);

    if (data.length > 0) {
      newSheet.getRange(1, 1, data.length, data[0].length).setValues(data);
      newSheet.getRange(1, 1, 1, data[0].length)
        .setFontWeight("bold")
        .setBackground("#1565C0")
        .setFontColor("#FFFFFF");
      newSheet.setFrozenRows(1);
    }

    // Если известна папка турнира — сразу кладём файл туда
    if (config.driveFolderId) {
      try {
        const folder = DriveApp.getFolderById(config.driveFolderId);
        const file = DriveApp.getFileById(newSs.getId());
        folder.addFile(file);
        DriveApp.getRootFolder().removeFile(file);
      } catch (e) {
        Logger.log("Export move to folder error: " + e);
      }
    }

    AppLog.write("Экспорт участников", newSs.getUrl());
    return newSs.getUrl();
  }

  // ========================================================
  // Вспомогательное
  // ========================================================

  static getParticipantsSheet(ss) {
    const sheet =
      Theme.findSheetByBaseName(ss, PARTICIPANTS_SHEET_BASE_NAME) ||
      ss.getSheetByName(PARTICIPANTS_SHEET_BASE_NAME);

    if (!sheet) {
      throw new ParticipantsError('Лист "Участники" не найден. Сначала создайте турнир (Турнир → Новый турнир).');
    }
    return sheet;
  }

  // Если шапку листа "Участники" случайно стёрли вручную (Ctrl+A → Delete
  // в Google Sheets), getLastRow() вернёт 0, и следующий импорт запишет
  // участников прямо в строку 1 поверх заголовков. Восстанавливаем шапку
  // перед импортом, если её нет или она повреждена — существующие строки
  // данных ниже не трогаем.
  // Также дописывает недостающие колонки в конце шапки — на случай,
  // если таблица создавалась до появления новых столбцов (например,
  // "Категория (вручную)") и в её шапке их ещё нет.
  static ensureHeaderRow(sheet) {
    const lastCol = sheet.getLastColumn();
    const firstCell = lastCol > 0 ? sheet.getRange(1, 1).getValue() : "";

    if (firstCell !== "ID") {
      sheet.getRange(1, 1, 1, PARTICIPANTS_HEADERS.length).setValues([PARTICIPANTS_HEADERS]);
      sheet.setFrozenRows(1);
      return;
    }

    if (lastCol < PARTICIPANTS_HEADERS.length) {
      const missing = PARTICIPANTS_HEADERS.slice(lastCol);
      sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
    }
  }

  static loadExistingKeys(participantsSheet) {
    const data = participantsSheet.getDataRange().getValues();
    const keys = new Set();
    // Столбцы: ID, ФИО(1), ..., Телефон(5) — индексы с 0
    for (let i = 1; i < data.length; i++) {
      const fio = String(data[i][1] || "").trim();
      const phone = String(data[i][5] || "").trim();
      if (fio) keys.add(this.buildKey(fio, phone));
    }
    return keys;
  }

  static buildKey(fio, phone) {
    return `${fio.toLowerCase()}|${phone.replace(/\D/g, "")}`;
  }

  // Организатор может переформулировать вопрос/варианты пола в самой
  // Google Форме ("Ваш пол" / "Мужчина" / "Женщина" и т.п.) — приводим
  // любой такой вариант к каноничным "Мужской"/"Женский", которые
  // ожидает Categories.gs при точном сравнении. Нераспознанное значение
  // возвращаем как есть (обрежется пробелами) — не роняем импорт, но
  // категоризация такого участника по полу не сработает.
  static normalizeGender(text) {
    const t = String(text || "").trim().toLowerCase();
    const firstLetter = t.charAt(0);
    if (firstLetter === "м") return "Мужской";
    if (firstLetter === "ж") return "Женский";
    return String(text || "").trim();
  }

  // Организатор может ввести уровень в любом регистре ("новичок",
  // "НОВИЧОК" и т.п.) — приводим к канонической форме из
  // FORM_LEVEL_OPTIONS (нужно для точного сравнения в
  // Draw.LEVEL_STRENGTH_ORDER при посеве). Нераспознанное значение
  // возвращаем как есть (обрежется пробелами), не роняем ввод.
  static normalizeLevel(text) {
    const t = String(text || "").trim();
    if (!t) return "";
    const match = FORM_LEVEL_OPTIONS.find(opt => opt.toLowerCase() === t.toLowerCase());
    return match || t;
  }

  static getNextId(participantsSheet) {
    const lastRow = participantsSheet.getLastRow();
    if (lastRow < 2) return 1;

    const ids = participantsSheet.getRange(2, 1, lastRow - 1, 1).getValues()
      .map(r => Number(r[0]))
      .filter(n => !isNaN(n));

    return ids.length > 0 ? Math.max(...ids) + 1 : 1;
  }

  static calcAge(birthDate) {
    if (!birthDate) return "";
    const date = (birthDate instanceof Date) ? birthDate : new Date(birthDate);
    if (isNaN(date.getTime())) return "";

    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
      age--;
    }
    return age;
  }

}


// Отдельный тип ошибки — чтобы в Menu.gs можно было показывать
// пользователю понятный alert вместо технического stack trace
class ParticipantsError extends Error {
  constructor(message) {
    super(message);
    this.name = "ParticipantsError";
  }
}