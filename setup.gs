/**
 * ==========================================================
 * TT Tournament Manager
 * Setup.gs
 * Версия 0.2
 * ----------------------------------------------------------
 * Дирижёр создания турнира. Сам не оформляет листы, не лезет
 * в Drive и не создаёт форму напрямую — только вызывает
 * соответствующие модули в нужном порядке:
 *
 *   1. Создать листы и их структуру (заголовки)
 *   2. Применить оформление               -> Theme.gs
 *   3. Создать папку турнира на Drive      -> Drive.gs
 *   4. Перенести таблицу в эту папку       -> Drive.gs
 *   5. Создать форму регистрации           -> Forms.gs
 *   6. Сохранить итоговые настройки        -> Config.gs
 * ==========================================================
 */
class Setup {

  /**
   * Главная функция создания турнира.
   * Вызывается из Menu.gs (menu_newTournament) после того,
   * как TournamentWizard.run() собрал config.
   */
  static createTournament(config) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ui = SpreadsheetApp.getUi();

    // 0. Если уже был турнир — архивируем его данные, ПРЕЖДЕ чем всё стереть
    const previousConfig = ConfigService.load();
    let archived = false;
    if (previousConfig.name) {
      archived = this.archiveCurrentTournament(ss, previousConfig);
    }

    // 1. Листы и их структура
    this.createSheets(ss);
    this.initializeSheets(ss);

    // 2. Оформление (цвета, ширина столбцов, списки, фильтры, эмодзи)
    Theme.applyAll(ss, config.theme || DEFAULT_THEME_NAME);

    // 3-4. Google Drive: папка турнира + перенос таблицы в неё
    let folderCreated = false;
    try {
      const folder = DriveService.createTournamentFolder(config);
      config.driveFolderId = folder.getId();
      DriveService.moveSpreadsheetToFolder(ss, folder);
      folderCreated = true;
    } catch (e) {
      Logger.log("Drive folder error: " + e);
    }

    // 5. Google Форма регистрации + автопривязка ответов к таблице
    let formInfo = null;
    try {
      formInfo = FormsService.createRegistrationForm(config, ss);
      config.formId = formInfo.formId;
      config.formUrl = formInfo.formUrl;
      config.formEditUrl = formInfo.editUrl;
    } catch (e) {
      Logger.log("Form creation error: " + e);
    }

    // 6. Настройки сохраняем последними — чтобы записать
    // финальные driveFolderId / formId / formUrl
    ConfigService.save(config);

    AppLog.write("Турнир создан", `«${config.name || ""}», ${config.date || ""}, ${config.place || ""}`);
    if (archived) {
      AppLog.write("Предыдущий турнир заархивирован", `«${previousConfig.name || ""}»`);
    }

    SpreadsheetApp.flush();

    this.showSummary(ui, config, folderCreated, formInfo, archived);
  }

  // --------------------------------------------------------
  // Архивация предыдущего турнира перед стиранием (см. п.0 выше)
  // --------------------------------------------------------
  static archiveCurrentTournament(ss, oldConfig) {
    const archiveSheet = Theme.findSheetByBaseName(ss, "Архив") || ss.getSheetByName("Архив");
    if (!archiveSheet) return false;

    let anyData = false;
    ["Участники", "Матчи", "Рейтинг", "Логи"].forEach(name => {
      const source = Theme.findSheetByBaseName(ss, name) || ss.getSheetByName(name);
      if (source && source.getLastRow() > 1) anyData = true;
    });
    if (!anyData) return false; // нечего архивировать (турнир только создан, пустой)

    const tz = Session.getScriptTimeZone() || "GMT";
    const timestamp = Utilities.formatDate(new Date(), tz, "dd.MM.yyyy HH:mm");
    const title = `═══ ${oldConfig.name || "Турнир без названия"} (${oldConfig.date || "без даты"}) — архивировано ${timestamp} ═══`;

    let row = archiveSheet.getLastRow() + 1;
    if (row > 1) row++; // пустая строка-разделитель перед новым блоком, если архив не пуст

    archiveSheet.getRange(row, 1).setValue(title)
      .setFontWeight("bold").setBackground("#757575").setFontColor("#FFFFFF");
    row += 2;

    row = this.archiveSheetSection(archiveSheet, ss, "Участники", row);
    row = this.archiveSheetSection(archiveSheet, ss, "Матчи", row);
    row = this.archiveSheetSection(archiveSheet, ss, "Рейтинг", row);
    row = this.archiveSheetSection(archiveSheet, ss, "Логи", row);

    return true;
  }

  // Копирует содержимое одного листа (если там есть данные, не только
  // заголовок) в лист "Архив", начиная со строки startRow
  static archiveSheetSection(archiveSheet, ss, baseName, startRow) {
    const source = Theme.findSheetByBaseName(ss, baseName) || ss.getSheetByName(baseName);
    if (!source) return startRow;

    const data = source.getDataRange().getValues();
    if (data.length < 2) return startRow; // только заголовок — нечего архивировать

    archiveSheet.getRange(startRow, 1).setValue(`— ${baseName} —`).setFontWeight("bold");
    startRow++;

    archiveSheet.getRange(startRow, 1, data.length, data[0].length).setValues(data);
    startRow += data.length + 1; // +1 пустая строка после блока

    return startRow;
  }

  // --------------------------------------------------------
  // Итоговое сообщение пользователю
  // --------------------------------------------------------
  static showSummary(ui, config, folderCreated, formInfo, archived) {
    let message = "";

    if (archived) {
      message += "🗜️ Данные предыдущего турнира сохранены в лист «Архив».\n";
    }

    message += folderCreated
      ? "📁 Папка турнира на Drive создана, таблица перенесена в неё.\n"
      : "⚠️ Не удалось создать папку на Drive (см. журнал выполнения).\n";

    message += formInfo
      ? `📝 Форма регистрации создана:\n${formInfo.formUrl}\n\nОтветы будут падать в лист «${formInfo.responseSheetName || "Ответы формы"}».`
      : "⚠️ Не удалось создать форму регистрации (см. журнал выполнения).";

    ui.alert("✅ Турнир успешно создан!", message, ui.ButtonSet.OK);
  }

  /**
   * Создание всех листов. Ищет по "чистому" имени И по имени
   * с эмодзи (Theme.findSheetByBaseName) — иначе повторный
   * запуск создаст дубли поверх уже переименованных листов.
   */
  static createSheets(ss) {
    const sheets = [
      "Настройки",
      "Участники",
      "Посев",
      "Группы",
      "Матчи",
      "Расписание",
      "Табло",
      "Плей-офф",
      "Рейтинг",
      "Архив",
      "Логи"
    ];
    sheets.forEach(name => {
      const existing = Theme.findSheetByBaseName(ss, name);
      if (!existing) {
        ss.insertSheet(name);
      }
    });
  }

  // Находит лист по чистому или эмодзи-имени; используется
  // всеми init*() методами ниже вместо прямого getSheetByName
  static findSheet(ss, baseName) {
    return Theme.findSheetByBaseName(ss, baseName) || ss.getSheetByName(baseName);
  }

  /**
   * Заголовки листов
   */
  static initializeSheets(ss) {
    this.initParticipants(ss);
    this.initGroups(ss);
    this.initMatches(ss);
    this.initSchedule(ss);
    this.initScoreboard(ss);
    this.initPlayoff(ss);
    this.initRating(ss);
    this.initLog(ss);
  }
  // ----------------------------------------------------
  static initParticipants(ss){
    const sh = this.findSheet(ss, "Участники");
    sh.clear();
    sh.getRange(1, 1, 1, PARTICIPANTS_HEADERS.length).setValues([PARTICIPANTS_HEADERS]);
    sh.setFrozenRows(1);
  }
  // ----------------------------------------------------
  static initGroups(ss){
    const sh = this.findSheet(ss, "Группы");
    sh.clear();
    sh.getRange("A1").setValue("Группы будут сформированы автоматически.");
  }
  // ----------------------------------------------------
  static initMatches(ss){
    const sh = this.findSheet(ss, "Матчи");
    sh.clear();
    sh.getRange(1,1,1,16).setValues([[
      "ID",
      "Раунд",
      "Стол",
      "Игрок 1",
      "Игрок 2",
      "Счет",
      "Победитель",
      "Статус",
      "Начало",
      "Окончание",
      "Примечание",
      "Счет матчей",
      "ID игрока 1",
      "ID игрока 2",
      "ID победителя",
      "Категория"
    ]]);
    sh.setFrozenRows(1);
    // Столбцы "Начало" (I) и "Окончание" (J) — формат времени,
    // чтобы отображалось время начала/окончания матча, а не дата целиком
    sh.getRange(2, 9, Math.max(sh.getMaxRows() - 1, 1), 2).setNumberFormat("HH:mm:ss");
    // Столбцы M:O (ID участников) — служебные, скрываем от глаз
    sh.hideColumns(13, 3);
  }
  // ----------------------------------------------------
  static initSchedule(ss){
    const sh = this.findSheet(ss, "Расписание");
    sh.clear();
    sh.getRange("A1").setValue("Расписание будет создано автоматически.");
  }
  // ----------------------------------------------------
  static initScoreboard(ss){
    const sh = this.findSheet(ss, "Табло");
    sh.clear();
    sh.getRange("A1").setValue("Табло обновляется через Проведение → Табло.");
  }
  // ----------------------------------------------------
  static initPlayoff(ss){
    const sh = this.findSheet(ss, "Плей-офф");
    sh.clear();
    sh.getRange("A1").setValue("Сетка плей-офф.");
  }
  // ----------------------------------------------------
  static initRating(ss){
    const sh = this.findSheet(ss, "Рейтинг");
    sh.clear();
    sh.getRange(1,1,1,9).setValues([[
      "ID",
      "Игрок",
      "Очки",
      "Победы",
      "Поражения",
      "Набрано очков",
      "Пропущено очков",
      "Партий выиграно",
      "Партий проиграно"
    ]]);
  }
  // ----------------------------------------------------
  static initLog(ss){
    const sh = this.findSheet(ss, "Логи");
    sh.clear();
    sh.getRange(1,1,1,4).setValues([[
      "Дата",
      "Пользователь",
      "Событие",
      "Описание"
    ]]);
  }
}