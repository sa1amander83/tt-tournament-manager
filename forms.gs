/**
 * ==========================================================
 * TT Tournament Manager
 * Forms.gs
 * Версия 0.1
 * ----------------------------------------------------------
 * Отвечает ТОЛЬКО за Google Формы:
 *  - создание формы регистрации участников
 *  - настройку полей формы
 *  - привязку ответов формы к текущей таблице
 *  - оформление автоматически созданного листа с ответами
 *
 * Сама форма физически создаётся в корне Google Drive
 * пользователя (так работает FormApp.create) — Setup.gs
 * дополнительно может перенести её в папку турнира.
 *
 * Импорт данных из листа с ответами в лист "Участники" —
 * отдельная задача (пункт меню "⬇️ Импорт из формы",
 * пока заглушка, будет реализован в модуле Participants.gs).
 * ==========================================================
 */

const FORM_LEVEL_OPTIONS = [
  "Новичок",
  "Любитель",
  "Опытный любитель",
  "Спортсмен",
  "КМС",
  "МС"
];

const FORM_RESPONSES_SHEET_NAME = "📩 Ответы формы";
const FORM_RESPONSES_TAB_COLOR = "#546E7A";


class FormsService {

  // --------------------------------------------------------
  // Создаёт форму регистрации, настраивает поля и связывает
  // её с текущей таблицей (ответы будут падать в отдельный лист)
  // --------------------------------------------------------
  static createRegistrationForm(config, ss) {
    const form = FormApp.create(`Регистрация — ${config.name || "Турнир"}`);

    form.setDescription(this.buildDescription(config));
    form.setCollectEmail(true);
    form.setConfirmationMessage("Спасибо! Ваша заявка на участие принята.");

    if (config.regulationsUrl) {
      form.addSectionHeaderItem()
        .setTitle("Положение о турнире")
        .setHelpText(`Перед регистрацией ознакомьтесь с положением: ${config.regulationsUrl}`);

      form.addCheckboxItem()
        .setTitle("Подтверждение")
        .setChoiceValues(["Я ознакомился(-лась) и согласен(-на) с положением о турнире"])
        .setRequired(true);
    }

    form.addTextItem()
      .setTitle("ФИО")
      .setRequired(true);

    form.addDateItem()
      .setTitle("Дата рождения")
      .setRequired(true);

    form.addListItem()
      .setTitle("Пол")
      .setChoiceValues(["Мужской", "Женский"])
      .setRequired(true);

    form.addTextItem()
      .setTitle("Город")
      .setRequired(false);

    form.addTextItem()
      .setTitle("Телефон")
      .setRequired(true);

    form.addTextItem()
      .setTitle("Telegram")
      .setRequired(false);

    form.addListItem()
      .setTitle("Уровень игры")
      .setChoiceValues(FORM_LEVEL_OPTIONS)
      .setRequired(true);

    form.addTextItem()
      .setTitle("Рейтинг (если есть)")
      .setHelpText(
        "Необязательно. Если у вас есть официальный рейтинг — укажите число. " +
        "Организатор проверит его перед посевом; самостоятельно вписанный рейтинг " +
        "не используется для расстановки посева, пока не будет подтверждён."
      )
      .setRequired(false)
      .setValidation(
        FormApp.createTextValidation()
          .setHelpText("Введите число от 0 до 3000")
          .requireNumberBetween(0, 3000)
          .build()
      );

    form.addTextItem()
      .setTitle("Подтверждение рейтинга (ссылка)")
      .setHelpText(
        "Если указали рейтинг выше — приложите, пожалуйста, ссылку, где его можно проверить " +
        "(профиль в рейтинг-системе, протокол турнира, страница результатов и т.п.). " +
        "Без подтверждения рейтинг не будет учтён при посеве."
      )
      .setRequired(false);

    // Привязываем ответы к текущей таблице.
    // Google сам создаёт новый лист под ответы — ищем и оформляем его ниже.
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

    const responseSheet = this.findAndStyleResponseSheet(ss);

    return {
      formId: form.getId(),
      formUrl: form.getPublishedUrl(),
      editUrl: form.getEditUrl(),
      responseSheetName: responseSheet ? responseSheet.getName() : null
    };
  }

  static buildDescription(config) {
    let text = `Регистрация участников турнира «${config.name || ""}».`;
    if (config.date) text += `\nДата: ${config.date}`;
    if (config.place) text += `\nМесто: ${config.place}`;
    if (config.regulationsUrl) text += `\n\nПоложение о турнире: ${config.regulationsUrl}`;
    return text;
  }

  // --------------------------------------------------------
  // После setDestination() Google добавляет новый лист с ответами.
  // Находим его (единственный лист, которого не было в нашей
  // стандартной структуре), переименовываем и оформляем.
  // --------------------------------------------------------
  static findAndStyleResponseSheet(ss) {
    const knownNames = this.getKnownSheetNames();

    const sheets = ss.getSheets();
    let responseSheet = null;

    // Идём с конца — только что добавленный лист Google обычно
    // последний в списке
    for (let i = sheets.length - 1; i >= 0; i--) {
      const name = sheets[i].getName();
      if (!knownNames.includes(name) && name !== FORM_RESPONSES_SHEET_NAME) {
        responseSheet = sheets[i];
        break;
      }
    }

    if (!responseSheet) return null;

    const uniqueName = this.buildUniqueResponseSheetName(ss);
    responseSheet.setName(uniqueName);
    responseSheet.setTabColor(FORM_RESPONSES_TAB_COLOR);
    responseSheet.setFrozenRows(1);

    const lastCol = responseSheet.getLastColumn();
    if (lastCol > 0) {
      responseSheet.getRange(1, 1, 1, lastCol)
        .setFontWeight("bold")
        .setBackground(FORM_RESPONSES_TAB_COLOR)
        .setFontColor("#FFFFFF")
        .setHorizontalAlignment("center");
    }

    return responseSheet;
  }

  // Если "📩 Ответы формы" уже занято (форма пересоздавалась) —
  // возвращает имя с порядковым номером, чтобы не было конфликта
  // и не терялись старые ответы
  static buildUniqueResponseSheetName(ss) {
    if (!ss.getSheetByName(FORM_RESPONSES_SHEET_NAME)) {
      return FORM_RESPONSES_SHEET_NAME;
    }
    let i = 2;
    while (ss.getSheetByName(`${FORM_RESPONSES_SHEET_NAME} (${i})`)) {
      i++;
    }
    return `${FORM_RESPONSES_SHEET_NAME} (${i})`;
  }

  // Список всех "наших" листов — и с эмодзи, и без —
  // чтобы не спутать их с автосозданным листом ответов формы
  static getKnownSheetNames() {
    const names = [];
    Object.keys(SHEET_META).forEach(baseName => {
      names.push(baseName);
      names.push(`${SHEET_META[baseName].emoji} ${baseName}`);
    });
    return names;
  }

}