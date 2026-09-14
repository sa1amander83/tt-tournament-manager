/**
 * ==========================================================
 * TT Tournament Manager
 * Config.gs
 * Версия 0.2
 * ==========================================================
 */

const APP = {

  NAME: "TT Tournament Manager",

  VERSION: "0.2.0",

  AUTHOR: "OpenAI + User"

};


// ----------------------------------------------------------
// Константы программы
// ----------------------------------------------------------

const CONFIG = {

  DEFAULT_TABLES: 3,

  DEFAULT_GROUP_SIZE: 4,

  DEFAULT_QUALIFY: 2,

  DEFAULT_MATCH: "BO5",

  DEFAULT_SYSTEM: "GROUPS_PLAYOFF",

  DEFAULT_MAX_PLAYERS: 64

};


// ----------------------------------------------------------
// Возрастные категории и порог слияния (см. Categories.gs)
// ----------------------------------------------------------

const AGE_CATEGORIES = {
  CHILD: { label: "Дети", maxAge: 12 },
  TEEN:  { label: "Подростки", maxAge: 17 },
  ADULT: { label: "Взрослые", maxAge: null }
};

const CATEGORY_MERGE_THRESHOLD = 4;


// ----------------------------------------------------------
// Системы проведения
// ----------------------------------------------------------

const SYSTEMS = {

  GROUPS_PLAYOFF: "Группы → Плей-офф",

  SWISS: "Швейцарская",

  SINGLE_ELIMINATION: "Олимпийская",

  ROUND_ROBIN: "Круговая"

};


// ----------------------------------------------------------
// Тип турнира
// ----------------------------------------------------------

const MATCH_TYPES = {

  SINGLES: "Одиночный (1×1)",

  DOUBLES: "Парный (2×2)"

};


// ----------------------------------------------------------
// Форматы матчей
// ----------------------------------------------------------

const MATCH_FORMATS = {

  BO5: "До 3 побед (5 партий)",

  BO3: "До 2 побед (3 партии)"

};


// ----------------------------------------------------------
// Размеры групп
// ----------------------------------------------------------

const GROUP_SIZES = [

  3,

  4,

  5

];


// ----------------------------------------------------------
// Настройки турнира
// ----------------------------------------------------------

class TournamentConfig {

  constructor() {

    this.name = "";

    this.date = "";

    this.place = "";

    this.tables = CONFIG.DEFAULT_TABLES;

    this.maxPlayers = CONFIG.DEFAULT_MAX_PLAYERS;

    this.system = CONFIG.DEFAULT_SYSTEM;

    this.groupSize = CONFIG.DEFAULT_GROUP_SIZE;

    this.qualify = CONFIG.DEFAULT_QUALIFY;

    // Формат матча в плей-офф (BO3/BO5)
    this.matchFormat = CONFIG.DEFAULT_MATCH;

    // Формат матча в группах (BO3/BO5) — отдельно от плей-офф
    this.groupMatchFormat = CONFIG.DEFAULT_MATCH;

    // Тип турнира: SINGLES (одиночный) или DOUBLES (парный)
    this.matchType = "SINGLES";

    // Смешанный турнир (true) или раздельные категории по возрасту/полу (false)
    this.mixedTournament = true;

    // Ссылка на положение о турнире (документ на Google Диске)
    this.regulationsUrl = "";

    // Ссылка на последний сгенерированный итоговый протокол
    this.finalProtocolUrl = "";

    // Оформление
    this.theme = DEFAULT_THEME_NAME;

    // Заполняются автоматически в Setup.gs при создании турнира —
    // руками их вводить не нужно, мастер (Wizard.gs) эти поля не спрашивает
    this.driveFolderId = "";

    this.formId = "";

    this.formUrl = "";

    this.formEditUrl = "";

  }
}


// ----------------------------------------------------------
// Работа с листом "Настройки"
// ----------------------------------------------------------

class ConfigService {

  static sheet() {

    const ss = SpreadsheetApp.getActive();

    if (typeof Theme !== "undefined" && Theme.findSheetByBaseName) {
      const found = Theme.findSheetByBaseName(ss, "Настройки");
      if (found) return found;
    }

    return ss.getSheetByName("Настройки");

  }


  static save(config) {

    const sheet = this.sheet();

    sheet.clear();

    sheet.getRange(1,1,20,2).setValues([

      ["Параметр","Значение"],

      ["Название",config.name],

      ["Дата",config.date],

      ["Место",config.place],

      ["Столы",config.tables],

      ["Тип турнира",config.matchType],

      ["Смешанный турнир", config.mixedTournament === false ? "Нет" : "Да"],

      ["Максимум участников",config.maxPlayers],

      ["Система",config.system],

      ["Размер группы",config.groupSize],

      ["Выходят",config.qualify],

      ["Матч",config.matchFormat],

      ["Формат в группах",config.groupMatchFormat],

      ["Ссылка на положение",config.regulationsUrl],

      ["Ссылка на итоговый протокол",config.finalProtocolUrl],

      ["Тема оформления",config.theme],

      ["ID папки Drive",config.driveFolderId],

      ["ID формы",config.formId],

      ["Ссылка на форму",config.formUrl],

      ["Ссылка на редактирование формы",config.formEditUrl]

    ]);

  }


  static load() {

    const sheet=this.sheet();

    if (!sheet) {
      // Лист "Настройки" ещё не создан — турнира в этой таблице
      // ещё не было, возвращаем конфиг по умолчанию
      return new TournamentConfig();
    }

    const values=sheet.getDataRange().getValues();

    let cfg=new TournamentConfig();

    values.forEach(row=>{

      switch(row[0]){

        case "Название":
          cfg.name=row[1];
          break;

        case "Дата":
          cfg.date=row[1];
          break;

        case "Место":
          cfg.place=row[1];
          break;

        case "Столы":
          cfg.tables=row[1];
          break;

        case "Тип турнира":
          cfg.matchType = (row[1] === "DOUBLES" || row[1] === "SINGLES") ? row[1] : "SINGLES";
          break;

        case "Смешанный турнир":
          cfg.mixedTournament = row[1] !== "Нет";
          break;

        case "Максимум участников":
          cfg.maxPlayers=row[1];
          break;

        case "Система":
          cfg.system=row[1];
          break;

        case "Размер группы":
          cfg.groupSize=row[1];
          break;

        case "Выходят":
          cfg.qualify=row[1];
          break;

        case "Матч":
          cfg.matchFormat=row[1];
          break;

        case "Формат в группах":
          cfg.groupMatchFormat=row[1] || CONFIG.DEFAULT_MATCH;
          break;

        case "Ссылка на положение":
          cfg.regulationsUrl=row[1];
          break;

        case "Ссылка на итоговый протокол":
          cfg.finalProtocolUrl=row[1];
          break;

        case "Тема оформления":
          cfg.theme=row[1] || DEFAULT_THEME_NAME;
          break;

        case "ID папки Drive":
          cfg.driveFolderId=row[1];
          break;

        case "ID формы":
          cfg.formId=row[1];
          break;

        case "Ссылка на форму":
          cfg.formUrl=row[1];
          break;

        case "Ссылка на редактирование формы":
          cfg.formEditUrl=row[1];
          break;

      }

    });

    return cfg;

  }

}