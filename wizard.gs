/**
 * ==========================================================
 * TT Tournament Manager
 * Wizard.gs
 * Версия 0.1
 * ----------------------------------------------------------
 * Пошаговый мастер настройки турнира на базе стандартных
 * диалогов ui.prompt(). Сделан так, чтобы меню "Новый турнир"
 * и "Настройки" работали уже сейчас, без HTML-формы.
 *
 * В будущем это легко заменить на HtmlService-сайдбар —
 * достаточно будет переписать только TournamentWizard.run(),
 * не трогая Menu.gs, Setup.gs и Config.gs.
 * ==========================================================
 */

class TournamentWizard {

  /**
   * Запускает мастер шаг за шагом.
   * Если передан existingConfig — поля предзаполняются
   * текущими значениями (режим редактирования настроек).
   * Возвращает TournamentConfig, либо null, если пользователь
   * отменил мастер на любом шаге.
   */
  static run(existingConfig) {
    const ui = SpreadsheetApp.getUi();
    const cfg = existingConfig || new TournamentConfig();

    const name = this.ask(ui, "Название турнира", cfg.name);
    if (name === null) return null;
    cfg.name = name;

    const date = this.ask(ui, "Дата турнира (ДД.ММ.ГГГГ)", cfg.date);
    if (date === null) return null;
    cfg.date = date;

    const place = this.ask(ui, "Место проведения", cfg.place);
    if (place === null) return null;
    cfg.place = place;

    const tables = this.askNumber(ui, "Количество столов", cfg.tables);
    if (tables === null) return null;
    cfg.tables = tables;

    const maxPlayers = this.askNumber(ui, "Максимум участников", cfg.maxPlayers);
    if (maxPlayers === null) return null;
    cfg.maxPlayers = maxPlayers;

    const matchType = this.askChoice(ui, "Тип турнира", MATCH_TYPES, cfg.matchType);
    if (matchType === null) return null;
    cfg.matchType = matchType;

    const mixedTournament = this.askChoice(
      ui,
      "Смешанный турнир?",
      { YES: "Да — общая сетка на всех", NO: "Нет — разделить по возрасту и полу" },
      cfg.mixedTournament === false ? "NO" : "YES"
    );
    if (mixedTournament === null) return null;
    cfg.mixedTournament = mixedTournament === "YES";

    const system = this.askChoice(ui, "Система проведения", SYSTEMS, cfg.system);
    if (system === null) return null;
    cfg.system = system;

    if (system === "GROUPS_PLAYOFF") {
      const groupSizeOptions = GROUP_SIZES.reduce((map, v) => {
        map[String(v)] = String(v);
        return map;
      }, {});

      const groupSize = this.askChoice(ui, "Размер группы", groupSizeOptions, String(cfg.groupSize));
      if (groupSize === null) return null;
      cfg.groupSize = Number(groupSize);

      const qualify = this.askNumber(ui, "Сколько игроков выходит из группы", cfg.qualify);
      if (qualify === null) return null;
      cfg.qualify = qualify;

      const groupMatchFormat = this.askChoice(ui, "Формат матча в группах", MATCH_FORMATS, cfg.groupMatchFormat);
      if (groupMatchFormat === null) return null;
      cfg.groupMatchFormat = groupMatchFormat;
    }

    const matchFormat = this.askChoice(ui, "Формат матча в плей-офф", MATCH_FORMATS, cfg.matchFormat);
    if (matchFormat === null) return null;
    cfg.matchFormat = matchFormat;

    const regulationsUrl = this.askOptional(
      ui,
      "Ссылка на Положение о турнире (документ на Google Диске). Можно оставить пустым и добавить позже через Настройки:",
      cfg.regulationsUrl
    );
    if (regulationsUrl === null) return null;
    cfg.regulationsUrl = regulationsUrl;

    return cfg;
  }

  // --------------------------------------------------------
  // Необязательный вопрос: пустой ответ = "" (не "оставить как есть",
  // а именно пусто — так можно убрать ранее введённую ссылку)
  // --------------------------------------------------------
  static askOptional(ui, label, defaultValue) {
    const hint = defaultValue
      ? `Текущее значение: ${defaultValue}\nВведите новое, оставьте как есть — просто OK, либо впишите "-" чтобы очистить:`
      : "Введите значение или оставьте пустым:";

    const result = ui.prompt(label, hint, ui.ButtonSet.OK_CANCEL);
    if (result.getSelectedButton() !== ui.Button.OK) return null;

    const text = result.getResponseText().trim();
    if (text === "-") return "";
    return text === "" ? (defaultValue || "") : text;
  }

  // --------------------------------------------------------
  // Текстовый вопрос. Пустой ответ = оставить текущее значение.
  // --------------------------------------------------------
  static ask(ui, label, defaultValue) {
    const hint = defaultValue
      ? `Текущее значение: ${defaultValue}\nВведите новое или оставьте пустым, чтобы не менять:`
      : "Введите значение:";

    const result = ui.prompt(label, hint, ui.ButtonSet.OK_CANCEL);
    if (result.getSelectedButton() !== ui.Button.OK) return null;

    const text = result.getResponseText().trim();
    return text === "" ? (defaultValue || "") : text;
  }

  // --------------------------------------------------------
  // Числовой вопрос с проверкой корректности
  // --------------------------------------------------------
  static askNumber(ui, label, defaultValue) {
    const text = this.ask(ui, label, defaultValue);
    if (text === null) return null;

    const num = Number(text);
    if (isNaN(num) || num <= 0) {
      ui.alert("Нужно ввести положительное число. Попробуйте ещё раз.");
      return this.askNumber(ui, label, defaultValue);
    }
    return num;
  }

  // --------------------------------------------------------
  // Вопрос с выбором из пронумерованного списка вариантов.
  // optionsMap: { ключ: "человекочитаемое название" }
  // Возвращает выбранный КЛЮЧ.
  // --------------------------------------------------------
  static askChoice(ui, label, optionsMap, defaultKey) {
    const keys = Object.keys(optionsMap);
    const listText = keys.map((k, i) => `${i + 1}. ${optionsMap[k]}`).join("\n");
    const currentLabel = optionsMap[defaultKey] || "—";

    const result = ui.prompt(
      label,
      `${listText}\n\nТекущее значение: ${currentLabel}.\nВведите НОМЕР пункта из списка выше (1, 2, 3...), или оставьте пустым, чтобы не менять:`,
      ui.ButtonSet.OK_CANCEL
    );
    if (result.getSelectedButton() !== ui.Button.OK) return null;

    const text = result.getResponseText().trim();
    if (text === "") return defaultKey;

    const index = Number(text) - 1;
    if (isNaN(index) || index < 0 || index >= keys.length) {
      ui.alert("Некорректный номер варианта. Попробуйте ещё раз.");
      return this.askChoice(ui, label, optionsMap, defaultKey);
    }
    return keys[index];
  }

}