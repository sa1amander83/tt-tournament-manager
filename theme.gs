/**
 * ==========================================================
 * TT Tournament Manager
 * Theme.gs
 * Версия 0.1
 * ----------------------------------------------------------
 * Отвечает ТОЛЬКО за визуальное оформление таблицы:
 *  - цвета и темы оформления
 *  - оформление заголовков
 *  - ширину столбцов
 *  - выпадающие списки
 *  - условное форматирование (цветовую индикацию)
 *  - защиту служебных столбцов
 *  - эмодзи и цвета вкладок листов
 *
 * Setup.gs создаёт листы и данные.
 * Theme.gs делает их красивыми и удобными.
 * Логика турнира этот файл не трогает.
 * ==========================================================
 */

// ----------------------------------------------------------
// Палитры тем оформления
// ----------------------------------------------------------
const THEMES = {

  BLUE: {
    HEADER_BG: "#1565C0",
    HEADER_TEXT: "#FFFFFF",
    SUCCESS: "#43A047",
    WARNING: "#FB8C00",
    ERROR: "#E53935",
    INFO: "#29B6F6",
    NEUTRAL: "#9E9E9E",
    BACKGROUND: "#FFFFFF",
    GRID: "#DDDDDD"
  },

  GREEN: {
    HEADER_BG: "#2E7D32",
    HEADER_TEXT: "#FFFFFF",
    SUCCESS: "#66BB6A",
    WARNING: "#FFA726",
    ERROR: "#EF5350",
    INFO: "#26C6DA",
    NEUTRAL: "#9E9E9E",
    BACKGROUND: "#FFFFFF",
    GRID: "#DDDDDD"
  },

  DARK: {
    HEADER_BG: "#212121",
    HEADER_TEXT: "#FFFFFF",
    SUCCESS: "#4CAF50",
    WARNING: "#FF9800",
    ERROR: "#F44336",
    INFO: "#03A9F4",
    NEUTRAL: "#757575",
    BACKGROUND: "#303030",
    GRID: "#424242"
  }

};

// Тема по умолчанию (можно переопределить в листе "Настройки")
const DEFAULT_THEME_NAME = "BLUE";


// ----------------------------------------------------------
// Эмодзи и цвет вкладки для каждого листа
// Ключ — "чистое" имя листа, как в Setup.gs
// ----------------------------------------------------------
const SHEET_META = {

  "Настройки":  { emoji: "⚙️",  tabColor: "#1565C0" },
  "Участники":  { emoji: "👥",  tabColor: "#43A047" },
  "Посев":      { emoji: "🌱",  tabColor: "#8E24AA" },
  "Группы":     { emoji: "🎲",  tabColor: "#8E24AA" },
  "Матчи":      { emoji: "🏓",  tabColor: "#FB8C00" },
  "Расписание": { emoji: "📅",  tabColor: "#FDD835" },
  "Табло":      { emoji: "📺",  tabColor: "#FB8C00" },
  "Плей-офф":   { emoji: "🏆",  tabColor: "#E53935" },
  "Рейтинг":    { emoji: "📊",  tabColor: "#00ACC1" },
  "Архив":      { emoji: "🗄️", tabColor: "#757575" },
  "Логи":       { emoji: "📝",  tabColor: "#9E9E9E" }

};


// ----------------------------------------------------------
// Ширина столбцов по листам (имя листа -> [{header, width}])
// ----------------------------------------------------------
const COLUMN_WIDTHS = {

  "Участники": [
    { header: "ID",            width: 60  },
    { header: "ФИО",           width: 250 },
    { header: "Дата рождения", width: 120 },
    { header: "Возраст",       width: 70  },
    { header: "Город",         width: 140 },
    { header: "Телефон",       width: 140 },
    { header: "Telegram",      width: 140 },
    { header: "Уровень",       width: 160 },
    { header: "Рейтинг",       width: 90  },
    { header: "Посев",         width: 90  },
    { header: "Статус",        width: 120 },
    { header: "Рейтинг подтверждён", width: 150 },
    { header: "Ссылка на подтверждение рейтинга", width: 250 },
    { header: "Согласие с положением", width: 220 },
    { header: "ID участника 1 (пара)", width: 130 },
    { header: "ID участника 2 (пара)", width: 130 },
    { header: "Пол",                  width: 100 },
    { header: "Категория",            width: 160 },
    { header: "Категория (вручную)",  width: 160 }
  ],

  "Матчи": [
    { header: "ID",         width: 60  },
    { header: "Раунд",      width: 90  },
    { header: "Стол",       width: 70  },
    { header: "Игрок 1",    width: 200 },
    { header: "Игрок 2",    width: 200 },
    { header: "Счет",       width: 100 },
    { header: "Победитель", width: 200 },
    { header: "Статус",     width: 120 },
    { header: "Начало",     width: 130 },
    { header: "Окончание",  width: 130 },
    { header: "Примечание", width: 220 }
  ],

  "Рейтинг": [
    { header: "ID",        width: 60  },
    { header: "Игрок",     width: 220 },
    { header: "Очки",      width: 90  },
    { header: "Победы",    width: 90  },
    { header: "Поражения", width: 100 }
  ]

};


// ----------------------------------------------------------
// Выпадающие списки (имя листа -> {заголовок: [варианты]})
// ----------------------------------------------------------
const DROPDOWNS = {

  "Участники": {
    "Уровень": [
      "Новичок",
      "Любитель",
      "Опытный любитель",
      "Спортсмен",
      "КМС",
      "МС"
    ],
    "Статус": [
      "Зарегистрирован",
      "Явился",
      "Не явился",
      "Снят",
      "Дисквалифицирован",
      "В паре"
    ],
    "Рейтинг подтверждён": ["Да", "Нет"],
    // Пусто = категория считается автоматически (по умолчанию). Заданное
    // значение — организатор явно относит участника к этой категории,
    // минуя автоматический расчёт (см. Categories.resolveCategoryOverride)
    "Категория (вручную)": [
      "Дети", "Дети (М)", "Дети (Ж)",
      "Подростки", "Подростки (М)", "Подростки (Ж)",
      "Взрослые", "Взрослые (М)", "Взрослые (Ж)"
    ]
  },

  "Матчи": {
    "Статус": [
      "Ожидает",
      "Играют",
      "Завершен"
    ]
  }

};


// ----------------------------------------------------------
// Цветовая индикация статусов (значение -> ключ цвета в теме)
// ----------------------------------------------------------
const STATUS_COLORS = {

  "Участники": {
    column: "Статус",
    map: {
      "Явился":            "SUCCESS",
      "Зарегистрирован":   "WARNING",
      "Не явился":         "ERROR",
      "Снят":              "NEUTRAL",
      "Дисквалифицирован": "ERROR",
      "В паре":            "INFO"
    }
  },

  "Матчи": {
    column: "Статус",
    map: {
      "Ожидает":  "NEUTRAL",
      "Играют":   "WARNING",
      "Завершен": "SUCCESS"
    }
  }

};


// ----------------------------------------------------------
// Служебные столбцы, которые нельзя редактировать вручную
// (имя листа -> массив заголовков)
// ----------------------------------------------------------
const PROTECTED_COLUMNS = {

  "Участники": ["ID", "Рейтинг"],
  "Матчи":     ["ID"],
  "Рейтинг":   ["ID", "Очки", "Победы", "Поражения"]

};


// Листы со свободной раскладкой (объединённые ячейки, не таблица) —
// фильтр им не подходит и мешает объединению ячеек
const NO_FILTER_SHEETS = ["Группы", "Расписание", "Табло", "Плей-офф"];


class Theme {

  // --------------------------------------------------------
  // Точка входа: применить полное оформление ко всей таблице
  // Вызывается из Setup.gs после создания и заполнения листов
  // --------------------------------------------------------
  static applyAll(ss, themeName) {

    const theme = THEMES[themeName] || THEMES[DEFAULT_THEME_NAME];

    this.renameAndColorTabs(ss);

    Object.keys(SHEET_META).forEach(baseName => {
      const sheet = this.findSheetByBaseName(ss, baseName);
      if (!sheet) return;

      this.styleHeaderRow(sheet, theme);
      this.applyColumnWidths(sheet, baseName);
      this.applyDropdowns(sheet, baseName);
      this.applyStatusColors(sheet, baseName, theme);
      this.protectColumns(sheet, baseName);
      if (NO_FILTER_SHEETS.indexOf(baseName) === -1) {
        this.enableFilter(sheet);
      }
    });

    SpreadsheetApp.flush();
  }

  // --------------------------------------------------------
  // Переименование листов с эмодзи + цвет вкладки
  // --------------------------------------------------------
  static renameAndColorTabs(ss) {
    Object.keys(SHEET_META).forEach(baseName => {
      const meta = SHEET_META[baseName];
      const sheet = this.findSheetByBaseName(ss, baseName);
      if (!sheet) return;

      const newName = `${meta.emoji} ${baseName}`;
      if (sheet.getName() !== newName) {
        sheet.setName(newName);
      }
      sheet.setTabColor(meta.tabColor);
    });
  }

  // Находит лист либо по «чистому» имени, либо по имени с эмодзи
  // (нужно, чтобы применение темы можно было запускать повторно)
  static findSheetByBaseName(ss, baseName) {
    let sheet = ss.getSheetByName(baseName);
    if (sheet) return sheet;

    const meta = SHEET_META[baseName];
    if (meta) {
      sheet = ss.getSheetByName(`${meta.emoji} ${baseName}`);
      if (sheet) return sheet;
    }
    return null;
  }

  // --------------------------------------------------------
  // Оформление строки заголовков
  // --------------------------------------------------------
  static styleHeaderRow(sheet, theme) {
    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) return;

    const headerRange = sheet.getRange(1, 1, 1, lastCol);
    const values = headerRange.getValues()[0];

    // Листы-заглушки (типа "Группы будут сформированы автоматически")
    // без настоящей шапки — пропускаем
    if (values.every(v => v === "")) return;

    headerRange
      .setFontWeight("bold")
      .setFontColor(theme.HEADER_TEXT)
      .setBackground(theme.HEADER_BG)
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");

    sheet.setFrozenRows(1);
    sheet.setRowHeight(1, 32);
  }

  // --------------------------------------------------------
  // Заданная ширина столбцов по конфигу COLUMN_WIDTHS
  // --------------------------------------------------------
  static applyColumnWidths(sheet, baseName) {
    const config = COLUMN_WIDTHS[baseName];
    if (!config) return;

    const headers = this.getHeaderMap(sheet);

    config.forEach(col => {
      const colIndex = headers[col.header];
      if (colIndex) {
        sheet.setColumnWidth(colIndex, col.width);
      }
    });
  }

  // --------------------------------------------------------
  // Выпадающие списки (Data Validation)
  // --------------------------------------------------------
  static applyDropdowns(sheet, baseName) {
    const config = DROPDOWNS[baseName];
    if (!config) return;

    const headers = this.getHeaderMap(sheet);
    const lastRow = Math.max(sheet.getMaxRows(), 200);

    Object.keys(config).forEach(headerName => {
      const colIndex = headers[headerName];
      if (!colIndex) return;

      const rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(config[headerName], true)
        .setAllowInvalid(false)
        .build();

      sheet.getRange(2, colIndex, lastRow - 1, 1).setDataValidation(rule);
    });
  }

  // --------------------------------------------------------
  // Условное форматирование по статусам (цветовая индикация)
  // --------------------------------------------------------
  static applyStatusColors(sheet, baseName, theme) {
    const config = STATUS_COLORS[baseName];
    if (!config) return;

    const headers = this.getHeaderMap(sheet);
    const colIndex = headers[config.column];
    if (!colIndex) return;

    const lastRow = Math.max(sheet.getMaxRows(), 200);
    const range = sheet.getRange(2, colIndex, lastRow - 1, 1);

    // Убираем старые правила для этого же диапазона, чтобы не дублировались
    // при повторном применении темы
    const rules = sheet.getConditionalFormatRules()
      .filter(r => !r.getRanges().some(rg => rg.getA1Notation() === range.getA1Notation()));

    Object.keys(config.map).forEach(value => {
      const colorKey = config.map[value];
      const bg = theme[colorKey] || theme.NEUTRAL;

      const rule = SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(value)
        .setBackground(bg)
        .setFontColor(theme.HEADER_TEXT)
        .setRanges([range])
        .build();

      rules.push(rule);
    });

    sheet.setConditionalFormatRules(rules);
  }

  // --------------------------------------------------------
  // Защита служебных столбцов (ID, автосчитанные поля и т.д.)
  // --------------------------------------------------------
  static protectColumns(sheet, baseName) {
    const columns = PROTECTED_COLUMNS[baseName];
    if (!columns) return;

    const headers = this.getHeaderMap(sheet);
    const lastRow = Math.max(sheet.getMaxRows(), 200);
    const me = Session.getEffectiveUser();

    columns.forEach(headerName => {
      const colIndex = headers[headerName];
      if (!colIndex) return;

      const range = sheet.getRange(2, colIndex, lastRow - 1, 1);

      // Снимаем старую защиту этого же диапазона, если уже была
      const existing = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE)
        .filter(p => p.getRange().getA1Notation() === range.getA1Notation());
      existing.forEach(p => p.remove());

      const protection = range.protect()
        .setDescription(`Служебный столбец: ${headerName}`);

      protection.removeEditors(protection.getEditors());
      if (protection.canDomainEdit()) {
        protection.setDomainEdit(false);
      }
      protection.addEditor(me);
    });
  }

  // --------------------------------------------------------
  // Включение фильтра на листе
  // --------------------------------------------------------
  static enableFilter(sheet) {
    const lastCol = sheet.getLastColumn();
    const lastRow = sheet.getLastRow();
    if (lastCol === 0 || lastRow === 0) return;

    const existing = sheet.getFilter();
    if (existing) existing.remove();

    sheet.getRange(1, 1, Math.max(lastRow, 2), lastCol).createFilter();
  }

  // --------------------------------------------------------
  // Утилита: карта "заголовок -> номер столбца" для листа
  // --------------------------------------------------------
  static getHeaderMap(sheet) {
    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) return {};

    const values = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const map = {};
    values.forEach((header, i) => {
      if (header) map[header] = i + 1;
    });
    return map;
  }

  // --------------------------------------------------------
  // Смена темы оформления "на лету" (например, из меню)
  // --------------------------------------------------------
  static switchTheme(themeName) {
    if (!THEMES[themeName]) {
      SpreadsheetApp.getUi().alert("Неизвестная тема: " + themeName);
      return;
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    this.applyAll(ss, themeName);

    // Запоминаем выбор в "Настройках". Без этого следующий же вызов
    // Theme.applyAll(ss, config.theme) — из меню "Настройки" или при
    // создании турнира — молча вернул бы прежнюю тему.
    try {
      const config = ConfigService.load();
      config.theme = themeName;
      ConfigService.save(config);
    } catch (e) {
      Logger.log("Не удалось сохранить тему в настройки: " + e);
    }

    SpreadsheetApp.getUi().alert(`✅ Тема "${themeName}" применена`);
  }

}