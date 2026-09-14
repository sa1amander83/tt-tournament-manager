/**
 * ==========================================================
 * TT Tournament Manager
 * Menu.gs
 * Версия 0.1
 * ----------------------------------------------------------
 * Строит главное меню приложения в Google Таблицах.
 *
 * Пункты меню — это глобальные функции-обёртки:
 *   - если модуль уже реализован (Setup, Theme, ConfigService) —
 *     обёртка вызывает его напрямую;
 *   - если модуль ещё не готов (Жеребьёвка, Проведение, Отчёты,
 *     импорт/экспорт участников) — показывается заглушка
 *     "в разработке", чтобы меню уже сейчас выглядело и
 *     ощущалось как готовое приложение.
 *
 * ВАЖНО: Menu.gs не содержит бизнес-логики турнира —
 * только маршрутизацию. Это сделано специально, чтобы
 * дизайн меню не зависел от того, как реализована логика.
 * ==========================================================
 */

// ----------------------------------------------------------
// Триггер: строим меню при каждом открытии таблицы
// ----------------------------------------------------------
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu("🏓 TT Tournament Manager")

    .addSubMenu(ui.createMenu("📋 Турнир")
      .addItem("🆕 Новый турнир", "menu_newTournament")
      .addItem("⚙️ Настройки",   "menu_openSettings")
      .addItem("🗄️ Архив",       "menu_openArchive"))

    .addSeparator()

    .addSubMenu(ui.createMenu("👥 Участники")
      .addItem("📝 Создать форму регистрации", "menu_createRegistrationForm")
      .addItem("⬇️ Импорт из формы",           "menu_importFromForm")
      .addItem("📊 Импорт из Excel",           "menu_importFromExcel")
      .addItem("📤 Экспорт",                   "menu_exportParticipants")
      .addItem("🧪 Тестовые участники",        "menu_generateTestParticipants")
      .addItem("👫 Создать пару",              "menu_createTeam")
      .addItem("✂️ Расформировать пару",       "menu_dissolveTeam")
      .addItem("🏃 Добавить опоздавшего игрока", "menu_addLatePlayer"))

    .addSubMenu(ui.createMenu("🎲 Жеребьёвка")
      .addItem("🌱 Посев",              "menu_seedPlayers")
      .addItem("👥 Создать группы",      "menu_createGroups")
      .addItem("🔄 Пересчитать матчи по группам (после ручной правки)", "menu_regenerateGroupMatches")
      .addItem("♟️ Швейцарская система", "menu_startSwiss")
      .addItem("▶️ Следующий тур швейцарки", "menu_startSwissNextRound")
      .addItem("🏅 Олимпийская система", "menu_startSingleElimination")
      .addItem("🥊 Double elimination",  "menu_startDoubleElimination"))

    .addSubMenu(ui.createMenu("🏓 Проведение")
      .addItem("▶️ Следующий матч", "menu_nextMatch")
      .addItem("📅 Расписание",     "menu_openSchedule")
      .addItem("📺 Табло",          "menu_openScoreboard")
      .addItem("✅ Результаты",     "menu_openResults")
      .addItem("🚫 Неявка",         "menu_recordWalkover"))

    .addSubMenu(ui.createMenu("🏆 Отчёты")
      .addItem("📄 Итоговый протокол", "menu_finalProtocol")
      .addItem("🎖️ Дипломы",           "menu_generateDiplomas")
      .addItem("📑 PDF",                "menu_exportPdf"))

    .addSeparator()

    .addSubMenu(ui.createMenu("🎨 Оформление")
      .addItem("🔵 Синяя тема",   "menu_themeBlue")
      .addItem("🟢 Зелёная тема", "menu_themeGreen")
      .addItem("⚫ Тёмная тема",  "menu_themeDark"))

    .addToUi();
}


// ==========================================================
// 📋 ТУРНИР — уже полностью рабочее
// ==========================================================

function menu_newTournament() {
  const ui = SpreadsheetApp.getUi();
  const existing = ConfigService.load();

  if (existing.name) {
    const response = ui.alert(
      "⚠️ Турнир уже настроен",
      `В этой таблице уже есть турнир «${existing.name}».\n\n` +
      `Повторный запуск ПОЛНОСТЬЮ ОЧИСТИТ текущие данные: участников, матчи, рейтинг и логи ` +
      `(перед этим они автоматически сохранятся в лист «🗜️ Архив» — не потеряются, но текущая работа остановится).\n` +
      `Также создастся НОВАЯ форма регистрации и папка на Drive, старые останутся, но перестанут быть привязаны в настройках.\n\n` +
      `Продолжить?`,
      ui.ButtonSet.YES_NO
    );
    if (response !== ui.Button.YES) return;
  }

  const config = TournamentWizard.run();
  if (!config) return; // пользователь отменил мастер

  Setup.createTournament(config);
}

function menu_openSettings() {
  const ui = SpreadsheetApp.getUi();
  const current = ConfigService.load();

  const summary =
    `Название: ${current.name || "—"}\n` +
    `Дата: ${current.date || "—"}\n` +
    `Место: ${current.place || "—"}\n` +
    `Столы: ${current.tables}\n` +
    `Тип турнира: ${MATCH_TYPES[current.matchType] || current.matchType}\n` +
    `Максимум участников: ${current.maxPlayers}\n` +
    `Система: ${SYSTEMS[current.system] || current.system}\n` +
    `Размер группы: ${current.groupSize}\n` +
    `Выходят из группы: ${current.qualify}\n` +
    `Формат матча в плей-офф: ${MATCH_FORMATS[current.matchFormat] || current.matchFormat}\n` +
    `Формат матча в группах: ${MATCH_FORMATS[current.groupMatchFormat] || current.groupMatchFormat}\n` +
    `Положение о турнире: ${current.regulationsUrl || "— не указано"}`;

  const response = ui.alert(
    "⚙️ Текущие настройки",
    summary + "\n\nОткрыть мастер редактирования?",
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) return;

  const updated = TournamentWizard.run(current);
  if (!updated) return;

  ConfigService.save(updated);
  Theme.applyAll(SpreadsheetApp.getActiveSpreadsheet(), updated.theme || DEFAULT_THEME_NAME);
  ui.alert("✅ Настройки обновлены");
}

function menu_openArchive() {
  notImplemented("Архив турниров");
}


// ==========================================================
// 👥 УЧАСТНИКИ — уже рабочее (см. Participants.gs, Forms.gs)
// ==========================================================

function menu_createRegistrationForm() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = ConfigService.load();

  const response = ui.alert(
    "📝 Создать форму регистрации",
    config.formUrl
      ? `Форма уже создана:\n${config.formUrl}\n\nСоздать новую форму (старая останется рабочей, но перестанет быть привязанной в настройках)?`
      : "Создать форму регистрации участников и привязать её к таблице?",
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;

  try {
    const formInfo = FormsService.createRegistrationForm(config, ss);
    config.formId = formInfo.formId;
    config.formUrl = formInfo.formUrl;
    config.formEditUrl = formInfo.editUrl;
    ConfigService.save(config);

    AppLog.write("Форма регистрации пересоздана", formInfo.formUrl);

    ui.alert("✅ Форма создана", `Ссылка на форму:\n${formInfo.formUrl}`, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert("❌ Ошибка", "Не удалось создать форму: " + e.message, ui.ButtonSet.OK);
  }
}

function menu_importFromForm() {
  const ui = SpreadsheetApp.getUi();
  try {
    const result = Participants.importFromForm();
    ui.alert(
      "✅ Импорт из формы завершён",
      `Добавлено новых участников: ${result.added}\nПропущено (уже были в списке): ${result.skipped}`,
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert("❌ Ошибка импорта", e.message, ui.ButtonSet.OK);
  }
}

function menu_importFromExcel() {
  const ui = SpreadsheetApp.getUi();

  const promptResult = ui.prompt(
    "📊 Импорт из Excel",
    "Сначала вставьте скопированные из Excel данные (с заголовками ФИО, Дата рождения, Город, Телефон, Telegram, Уровень) на отдельный лист.\n\nВведите имя этого листа:",
    ui.ButtonSet.OK_CANCEL
  );
  if (promptResult.getSelectedButton() !== ui.Button.OK) return;

  const sheetName = promptResult.getResponseText().trim();
  if (!sheetName) return;

  try {
    const result = Participants.importFromExcelRange(sheetName);
    ui.alert(
      "✅ Импорт из Excel завершён",
      `Добавлено новых участников: ${result.added}\nПропущено (уже были в списке): ${result.skipped}`,
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert("❌ Ошибка импорта", e.message, ui.ButtonSet.OK);
  }
}

function menu_exportParticipants() {
  const ui = SpreadsheetApp.getUi();
  const config = ConfigService.load();

  try {
    const url = Participants.exportToNewSpreadsheet(config);
    ui.alert("✅ Экспорт готов", `Список участников сохранён отдельным файлом:\n${url}`, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert("❌ Ошибка экспорта", e.message, ui.ButtonSet.OK);
  }
}

function menu_generateTestParticipants() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.prompt(
    "🧪 Тестовые участники",
    "Сколько случайных тестовых участников создать? (только для теста, не для реального турнира)",
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;

  const text = response.getResponseText().trim();
  const count = Number(text);

  if (!text || isNaN(count) || count <= 0) {
    ui.alert("❌ Ошибка", "Нужно ввести положительное число.", ui.ButtonSet.OK);
    return;
  }
  if (count > 500) {
    ui.alert("❌ Ошибка", "Многовато для теста — максимум 500 за раз.", ui.ButtonSet.OK);
    return;
  }

  try {
    const result = Testing.generateTestParticipants(count);
    ui.alert("✅ Тестовые участники созданы", `Добавлено тестовых участников: ${result.added}`, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert("❌ Ошибка", e.message, ui.ButtonSet.OK);
  }
}

function menu_createTeam() {
  const ui = SpreadsheetApp.getUi();

  const id1Response = ui.prompt(
    "👫 Создать пару",
    "Введите ID первого участника (см. столбец ID на листе «Участники»):",
    ui.ButtonSet.OK_CANCEL
  );
  if (id1Response.getSelectedButton() !== ui.Button.OK) return;
  const id1 = id1Response.getResponseText().trim();
  if (!id1) return;

  const id2Response = ui.prompt(
    "👫 Создать пару",
    "Введите ID второго участника:",
    ui.ButtonSet.OK_CANCEL
  );
  if (id2Response.getSelectedButton() !== ui.Button.OK) return;
  const id2 = id2Response.getResponseText().trim();
  if (!id2) return;

  try {
    const result = Teams.createTeam(id1, id2);
    ui.alert(
      "✅ Пара создана",
      `«${result.fio}» (ID: ${result.id})\n` +
      (result.ratingConfirmed
        ? `Рейтинг пары: ${result.rating} (среднее — оба исходных рейтинга подтверждены)`
        : `Рейтинг пары не подтверждён — будет участвовать в случайной жеребьёвке, не в посеве`),
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert("❌ Ошибка", e.message, ui.ButtonSet.OK);
  }
}

function menu_addLatePlayer() {
  const ui = SpreadsheetApp.getUi();

  const fioResponse = ui.prompt("🏃 Добавить опоздавшего игрока", "ФИО:", ui.ButtonSet.OK_CANCEL);
  if (fioResponse.getSelectedButton() !== ui.Button.OK) return;
  const fio = fioResponse.getResponseText().trim();
  if (!fio) return;

  const birthResponse = ui.prompt(
    "🏃 Добавить опоздавшего игрока",
    "Дата рождения (дд.мм.гггг):",
    ui.ButtonSet.OK_CANCEL
  );
  if (birthResponse.getSelectedButton() !== ui.Button.OK) return;
  const birthDate = birthResponse.getResponseText().trim();
  if (!birthDate) {
    ui.alert("❌ Ошибка", "Дата рождения не может быть пустой (нужна для определения категории).", ui.ButtonSet.OK);
    return;
  }

  const genderResponse = ui.prompt(
    "🏃 Добавить опоздавшего игрока",
    "Пол (Мужской / Женский, можно сокращённо М / Ж):",
    ui.ButtonSet.OK_CANCEL
  );
  if (genderResponse.getSelectedButton() !== ui.Button.OK) return;
  const gender = genderResponse.getResponseText().trim();
  const genderNormalized = Participants.normalizeGender(gender);
  if (genderNormalized !== "Мужской" && genderNormalized !== "Женский") {
    ui.alert(
      "❌ Ошибка",
      `Не удалось распознать пол: получено «${gender}». Введите «Мужской»/«Женский» или сокращённо «М»/«Ж».`,
      ui.ButtonSet.OK
    );
    return;
  }

  const levelResponse = ui.prompt(
    "🏃 Добавить опоздавшего игрока",
    `Уровень (${FORM_LEVEL_OPTIONS.join(" / ")}) — можно оставить пустым:`,
    ui.ButtonSet.OK_CANCEL
  );
  if (levelResponse.getSelectedButton() !== ui.Button.OK) return;
  const level = levelResponse.getResponseText().trim();

  const ratingResponse = ui.prompt(
    "🏃 Добавить опоздавшего игрока",
    "Рейтинг (число) — можно оставить пустым:",
    ui.ButtonSet.OK_CANCEL
  );
  if (ratingResponse.getSelectedButton() !== ui.Button.OK) return;
  const rating = ratingResponse.getResponseText().trim();

  try {
    const player = Participants.addLatePlayer({ fio, birthDate, gender: genderNormalized, level, rating });
    const result = Draw.addLatePlayer(player.id);

    ui.alert(
      "✅ Игрок добавлен",
      `${result.fio} добавлен(а) в «${result.group}»${result.category ? ` (${result.category})` : ""}.\n` +
      `Сгенерировано матчей против остальных участников группы: ${result.matchesAdded}.\n` +
      `Расписание обновлено.`,
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert("❌ Ошибка", e.message, ui.ButtonSet.OK);
  }
}

function menu_dissolveTeam() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.prompt(
    "✂️ Расформировать пару",
    "Введите ID пары (составного участника), которую нужно расформировать:",
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const teamId = response.getResponseText().trim();
  if (!teamId) return;

  try {
    Teams.dissolveTeam(teamId);
    ui.alert("✅ Пара расформирована", "Оба участника возвращены в статус «Зарегистрирован».", ui.ButtonSet.OK);
  } catch (e) {
    ui.alert("❌ Ошибка", e.message, ui.ButtonSet.OK);
  }
}


// ==========================================================
// 🎲 ЖЕРЕБЬЁВКА — уже рабочее (см. Draw.gs)
// ==========================================================

function menu_seedPlayers() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (Draw.seedingExists(ss) && Draw.groupMatchesExist(ss)) {
    const confirm = ui.alert(
      "⚠️ Группы уже созданы",
      "Посев уже проводился, и по нему уже сформированы группы/матчи. " +
      "Повторный пересев изменит номера посева, но НЕ пересоздаст группы и матчи автоматически — " +
      "они рассинхронизируются со старым посевом.\n\nВсё равно пересеять?",
      ui.ButtonSet.YES_NO
    );
    if (confirm !== ui.Button.YES) return;
  }

  try {
    const result = Draw.seedPlayers();
    ui.alert("✅ Посев выполнен", `Расставлен посев для ${result.seeded} участников.`, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert("❌ Ошибка", e.message, ui.ButtonSet.OK);
  }
}

function menu_createGroups() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (Draw.groupMatchesExist(ss)) {
    const confirm = ui.alert(
      "⚠️ Группы уже созданы",
      "Существующие группы и матчи группового этапа (включая уже сыгранные результаты) будут " +
      "УДАЛЕНЫ и пересозданы заново по текущему посеву.\n\nПересоздать группы?",
      ui.ButtonSet.YES_NO
    );
    if (confirm !== ui.Button.YES) return;
  }

  try {
    const result = Draw.createGroups();
    const lines = result.byCategory.map(c => `${c.category || "Общий зачёт"}: групп ${c.groupsCount}`);
    ui.alert(
      "✅ Группы сформированы",
      `${lines.join("\n")}\nВсего матчей группового этапа: ${result.matchesAdded}`,
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert("❌ Ошибка", e.message, ui.ButtonSet.OK);
  }
}

function menu_regenerateGroupMatches() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const confirm = ui.alert(
    "🔄 Пересчитать матчи по группам",
    "Матчи группового этапа (включая уже сыгранные результаты) будут удалены и сгенерированы заново " +
    "ПО ТЕКУЩЕМУ СОСТАВУ групп на листе «Группы» — используйте это после того, как вручную перенесли " +
    "игрока из одной группы в другую.\n\nПересчитать?",
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  try {
    const result = Draw.regenerateGroupMatchesFromSheet();
    const lines = result.byCategory.map(c => `${c.category || "Общий зачёт"}: групп ${c.groupsCount}`);
    ui.alert(
      "✅ Матчи пересчитаны",
      `${lines.join("\n")}\nВсего матчей группового этапа: ${result.matchesAdded}`,
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert("❌ Ошибка", e.message, ui.ButtonSet.OK);
  }
}

function menu_startSwiss() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (Draw.swissMatchesExist(ss)) {
    const confirm = ui.alert(
      "⚠️ Тур 1 швейцарки уже создан",
      "На листе «Матчи» уже есть матчи швейцарской системы. Повторный запуск ДОБАВИТ ещё один " +
      "набор матчей поверх старых — получатся дубли.\n\nВсё равно продолжить?",
      ui.ButtonSet.YES_NO
    );
    if (confirm !== ui.Button.YES) return;
  }

  try {
    const result = Draw.startSwissRound1();
    const lines = result.byCategory.map(c => `${c.category || "Общий зачёт"}: ${c.matches} матчей`);
    let message = lines.join("\n") +
      "\n\nКогда все матчи тура завершены — запускайте «▶️ Следующий тур швейцарки» для генерации пар следующего тура.";
    if (result.skipped.length > 0) {
      message += `\n\n⚠️ Пропущено (меньше 2 участников): ${result.skipped.join(", ")}`;
    }
    ui.alert("✅ Швейцария: тур 1 создан", message, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert("❌ Ошибка", e.message, ui.ButtonSet.OK);
  }
}

function menu_startSwissNextRound() {
  const ui = SpreadsheetApp.getUi();
  try {
    const result = Matches.startSwissNextRound();
    const lines = result.byCategory.map(c => `${c.category || "Общий зачёт"}: ${c.round} — ${c.matches} матчей`);
    let message = lines.join("\n");
    if (result.waiting.length > 0) {
      message += `\n\n⏳ Ещё не готово: ${result.waiting.join("; ")}`;
    }
    ui.alert("✅ Новый тур создан", message, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert("❌ Ошибка", e.message, ui.ButtonSet.OK);
  }
}

function menu_startSingleElimination() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (Draw.playoffMatchesExist(ss)) {
    const confirm = ui.alert(
      "⚠️ Сетка плей-офф уже создана",
      "На листе «Матчи» уже есть матчи плей-офф. Повторный запуск ДОБАВИТ ещё один 1-й раунд " +
      "сетки поверх старого — получатся дубли.\n\nВсё равно продолжить?",
      ui.ButtonSet.YES_NO
    );
    if (confirm !== ui.Button.YES) return;
  }

  try {
    const result = Draw.startSingleElimination();
    const lines = result.byCategory.map(c =>
      `${c.category || "Общий зачёт"}: ${c.round}, сетка ${c.bracketSize}, матчей ${c.matches}` +
      ` (источник: ${c.fromGroups ? "итоги групп" : "общий посев"})`
    );
    let message = lines.join("\n");
    if (result.skipped.length > 0) {
      message += `\n\n⚠️ Пропущено (недостаточно участников): ${result.skipped.join(", ")}`;
    }
    ui.alert("✅ Сетка построена", message, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert("❌ Ошибка", e.message, ui.ButtonSet.OK);
  }
}

function menu_startDoubleElimination() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (Draw.doubleEliminationMatchesExist(ss)) {
    const confirm = ui.alert(
      "⚠️ Double elimination уже запущен",
      "На листе «Матчи» уже есть матчи double elimination. Повторный запуск ДОБАВИТ ещё один 1-й раунд " +
      "winners bracket поверх старого — получатся дубли.\n\nВсё равно продолжить?",
      ui.ButtonSet.YES_NO
    );
    if (confirm !== ui.Button.YES) return;
  }

  try {
    const result = Draw.startDoubleElimination();
    const lines = result.byCategory.map(c => `${c.category || "Общий зачёт"}: сетка WB ${c.bracketSize}, матчей ${c.matches}`);
    let message = lines.join("\n") +
      "\n\nДальше сетка (winners, losers, гранд-финал) достроится автоматически по мере внесения результатов.";
    if (result.skipped.length > 0) {
      message += `\n\n⚠️ Пропущено (меньше 3 участников): ${result.skipped.join(", ")}`;
    }
    ui.alert("✅ Double elimination запущен", message, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert("❌ Ошибка", e.message, ui.ButtonSet.OK);
  }
}


// ==========================================================
// 🏓 ПРОВЕДЕНИЕ — уже рабочее (см. Matches.gs)
// ==========================================================

function menu_nextMatch() {
  const ui = SpreadsheetApp.getUi();

  let match;
  try {
    match = Matches.startNextMatch();
  } catch (e) {
    ui.alert("❌ Ошибка", e.message, ui.ButtonSet.OK);
    return;
  }

  if (match && match.noFreeTable) {
    ui.alert(
      "Все столы заняты",
      `Сейчас играют на всех ${Matches.getTablesCount()} столах. Дождитесь окончания матча ` +
      `и внесите его результат («✅ Результаты») — стол освободится, и матч можно будет запустить.\n\n` +
      `Столов стало больше? Поменяйте их количество в «📋 Турнир → ⚙️ Настройки».`,
      ui.ButtonSet.OK
    );
    return;
  }

  if (!match) {
    const hasWaiting = Matches.getSchedule().length > 0;
    ui.alert(
      hasWaiting ? "Нет свободных матчей" : "Нет ожидающих матчей",
      hasWaiting
        ? "Есть матчи в очереди, но все их участники уже играют на других столах. Дождитесь завершения текущих матчей."
        : "Все матчи либо уже играются, либо завершены.",
      ui.ButtonSet.OK
    );
    return;
  }

  ui.alert(
    "▶️ Следующий матч",
    `Матч #${match.id} (${match.round})\n` +
    `Стол: ${match.table}\n\n` +
    `${match.player1}\nvs\n${match.player2}`,
    ui.ButtonSet.OK
  );
}

function menu_openSchedule() {
  const ui = SpreadsheetApp.getUi();
  const count = Matches.writeScheduleSheet();

  ui.alert(
    "📅 Расписание обновлено",
    count > 0
      ? `В лист «📅 Расписание» записано матчей: ${count}. Откройте вкладку, чтобы посмотреть/распечатать.`
      : "Ожидающих матчей нет — лист «📅 Расписание» очищен.",
    ui.ButtonSet.OK
  );
}

function menu_openScoreboard() {
  const ui = SpreadsheetApp.getUi();
  const count = Matches.writeScoreboardSheet();

  ui.alert(
    "📺 Табло обновлено",
    count > 0
      ? `В лист «📺 Табло» записано текущих матчей: ${count}. Откройте вкладку, чтобы посмотреть.`
      : "Сейчас никто не играет — лист «📺 Табло» обновлён.",
    ui.ButtonSet.OK
  );
}

function menu_openResults() {
  const ui = SpreadsheetApp.getUi();

  const idResponse = ui.prompt(
    "✅ Внести результат",
    "Введите ID матча (см. столбец ID на листе «Матчи»):",
    ui.ButtonSet.OK_CANCEL
  );
  if (idResponse.getSelectedButton() !== ui.Button.OK) return;

  const matchId = idResponse.getResponseText().trim();
  if (!matchId) return;

  const existing = Matches.findMatchById(matchId);
  if (!existing) {
    ui.alert("❌ Ошибка", `Матч с ID ${matchId} не найден.`, ui.ButtonSet.OK);
    return;
  }

  if (existing.status === "Завершен") {
    const confirm = ui.alert(
      "⚠️ По этому ID уже есть результат",
      `Матч #${existing.id} (${existing.round}): ${existing.player1} vs ${existing.player2}\n` +
      `Текущий счёт: ${existing.score || "—"}\n` +
      `Победитель: ${existing.winner || "—"}` +
      (existing.note ? `\nПримечание: ${existing.note}` : "") +
      `\n\nВы точно хотите ЗАМЕНИТЬ этот результат?`,
      ui.ButtonSet.YES_NO
    );
    if (confirm !== ui.Button.YES) return;
  } else {
    const confirm = ui.alert(
      "Проверьте матч",
      `Матч #${existing.id} (${existing.round}):\n${existing.player1}\nvs\n${existing.player2}\n\nЭто тот матч?`,
      ui.ButtonSet.YES_NO
    );
    if (confirm !== ui.Button.YES) return;
  }

  const scoreResponse = ui.prompt(
    "✅ Внести результат",
    'Введите счёт матча, например "3:1" или "3-0":',
    ui.ButtonSet.OK_CANCEL
  );
  if (scoreResponse.getSelectedButton() !== ui.Button.OK) return;

  const scoreText = scoreResponse.getResponseText().trim();

  try {
    const result = Matches.recordResult(matchId, scoreText);
    let message = `Победитель: ${result.winner}`;

    if (result.advanced && result.advanced.champion) {
      message += `\n\n🏆 Турнир завершён! Чемпион: ${result.advanced.champion}`;
    } else if (result.advanced && result.advanced.nextRound) {
      message += `\n\nСформирован следующий раунд: «${result.advanced.nextRound}» (${result.advanced.matchesCreated} матчей).`;
    }

    ui.alert("✅ Результат сохранён", message, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert("❌ Ошибка", e.message, ui.ButtonSet.OK);
  }
}

function menu_recordWalkover() {
  const ui = SpreadsheetApp.getUi();

  const idResponse = ui.prompt(
    "🚫 Зафиксировать неявку",
    "Введите ID матча (см. столбец ID на листе «Матчи»):",
    ui.ButtonSet.OK_CANCEL
  );
  if (idResponse.getSelectedButton() !== ui.Button.OK) return;

  const matchId = idResponse.getResponseText().trim();
  if (!matchId) return;

  const existing = Matches.findMatchById(matchId);
  if (!existing) {
    ui.alert("❌ Ошибка", `Матч с ID ${matchId} не найден.`, ui.ButtonSet.OK);
    return;
  }

  if (existing.status === "Завершен") {
    const confirm = ui.alert(
      "⚠️ По этому ID уже есть результат",
      `Матч #${existing.id} (${existing.round}): ${existing.player1} vs ${existing.player2}\n` +
      `Текущий счёт: ${existing.score || "—"}\n` +
      `Победитель: ${existing.winner || "—"}` +
      (existing.note ? `\nПримечание: ${existing.note}` : "") +
      `\n\nВы точно хотите ЗАМЕНИТЬ этот результат на неявку?`,
      ui.ButtonSet.YES_NO
    );
    if (confirm !== ui.Button.YES) return;
  } else {
    const confirm = ui.alert(
      "Проверьте матч",
      `Матч #${existing.id} (${existing.round}):\n${existing.player1}\nvs\n${existing.player2}\n\nЭто тот матч?`,
      ui.ButtonSet.YES_NO
    );
    if (confirm !== ui.Button.YES) return;
  }

  const whoResponse = ui.prompt(
    "🚫 Зафиксировать неявку",
    "Кто не явился — Игрок 1 или Игрок 2? Введите 1 или 2 (см. столбцы «Игрок 1»/«Игрок 2» на листе «Матчи»):",
    ui.ButtonSet.OK_CANCEL
  );
  if (whoResponse.getSelectedButton() !== ui.Button.OK) return;

  const playerNumber = whoResponse.getResponseText().trim();
  if (playerNumber !== "1" && playerNumber !== "2") {
    ui.alert("❌ Ошибка", "Нужно ввести 1 или 2.", ui.ButtonSet.OK);
    return;
  }

  try {
    const result = Matches.recordWalkover(matchId, playerNumber);
    let message = `Зафиксирована неявка. Победитель: ${result.winner}\n(неявившемуся засчитано 0 очков в рейтинге, согласно правилам)`;

    if (result.advanced && result.advanced.champion) {
      message += `\n\n🏆 Турнир завершён! Чемпион: ${result.advanced.champion}`;
    } else if (result.advanced && result.advanced.nextRound) {
      message += `\n\nСформирован следующий раунд: «${result.advanced.nextRound}» (${result.advanced.matchesCreated} матчей).`;
    }

    ui.alert("✅ Неявка зафиксирована", message, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert("❌ Ошибка", e.message, ui.ButtonSet.OK);
  }
}


// ==========================================================
// 🏆 ОТЧЁТЫ — уже рабочее (см. Reports.gs)
// ==========================================================

function menu_finalProtocol() {
  const ui = SpreadsheetApp.getUi();
  try {
    const result = Reports.generateFinalProtocol();
    ui.alert("✅ Итоговый протокол готов", `Документ создан:\n${result.url}`, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert("❌ Ошибка", e.message, ui.ButtonSet.OK);
  }
}

function menu_generateDiplomas() {
  const ui = SpreadsheetApp.getUi();
  try {
    const created = Reports.generateDiplomas(3);
    const lines = created.map(d => `${d.category ? d.category + " — " : ""}${d.place} место — ${d.fio}:\n${d.pdfUrl}`);
    ui.alert("✅ Дипломы созданы", lines.join("\n\n"), ui.ButtonSet.OK);
  } catch (e) {
    ui.alert("❌ Ошибка", e.message, ui.ButtonSet.OK);
  }
}

function menu_exportPdf() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.prompt(
    "📑 Экспорт в PDF",
    'Введите точное название вкладки для экспорта (например "📊 Рейтинг"). Оставьте пустым — экспортируется «📊 Рейтинг»:',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;

  const sheetName = response.getResponseText().trim() || "📊 Рейтинг";

  try {
    const url = Reports.exportSheetAsPdf(sheetName);
    ui.alert("✅ PDF готов", `Файл сохранён:\n${url}`, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert("❌ Ошибка", e.message, ui.ButtonSet.OK);
  }
}


// ==========================================================
// 🎨 ОФОРМЛЕНИЕ — уже полностью рабочее (см. Theme.gs)
// ==========================================================

function menu_themeBlue()  { Theme.switchTheme("BLUE"); }
function menu_themeGreen() { Theme.switchTheme("GREEN"); }
function menu_themeDark()  { Theme.switchTheme("DARK"); }


// ==========================================================
// Вспомогательное
// ==========================================================

function notImplemented(featureName) {
  SpreadsheetApp.getUi().alert(
    "🚧 В разработке",
    `«${featureName}» будет добавлено в одной из следующих версий.`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}