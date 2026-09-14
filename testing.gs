/**
 * ==========================================================
 * TT Tournament Manager
 * Testing.gs
 * Версия 0.1
 * ----------------------------------------------------------
 * ТОЛЬКО для тестирования. Генерирует случайных участников
 * напрямую в лист "Участники", минуя форму регистрации —
 * чтобы не заполнять форму 64 раза руками.
 *
 * Запуск: в редакторе Apps Script выбрать в списке функций
 * "generateTestParticipants" и нажать ▶ Run. Никакого меню
 * не нужно — это функция для разработки/теста, не для
 * реальных турниров.
 * ==========================================================
 */

const TEST_FIRST_NAMES_M = ["Иван","Семён","Александр","Дмитрий","Максим","Сергей","Андрей","Алексей","Артём","Илья","Кирилл","Никита","Егор","Роман","Денис","Владимир","Павел","Тимур","Григорий","Матвей","Степан","Михаил","Николай","Фёдор","Виктор","Юрий","Олег","Константин","Игорь","Валентин","Арсений","Богдан","Вадим","Геннадий","Данила","Ефим","Захар","Леонид","Марк","Пётр","Руслан","Тихон","Ярослав"];
const TEST_FIRST_NAMES_F = ["Анна","Мария","Елена","Ольга","Наталья","Екатерина","Юлия","Дарья","Виктория","Софья","Полина","Алина","Кристина","Ксения","Вера","Марина","Татьяна","Ирина","Светлана","Валерия","Людмила","Галина","Нина","Оксана","Анастасия","Евгения","Инна","Лариса","Маргарита","Надежда","Раиса","Регина","Тамара","Ульяна","Элина","Яна","Алёна","Диана","Зоя","Клавдия","Лидия","Милана"];
const TEST_LAST_NAMES = ["Иванов","Петров","Сидоров","Смирнов","Кузнецов","Попов","Васильев","Соколов","Морозов","Волков","Алексеев","Лебедев","Семёнов","Егоров","Павлов","Козлов","Степанов","Николаев","Орлов","Андреев","Макаров","Никитин","Захаров","Зайцев","Соловьёв","Борисов","Яковлев","Григорьев","Романов","Воробьёв","Сергеев","Кузьмин","Фролов","Александров","Дмитриев","Королёв","Гусев","Киселёв","Ильин","Максимов","Поляков","Сорокин","Виноградов","Ковалёв","Белов","Медведев","Антонов","Тарасов","Жуков","Баранов","Филиппов","Комаров","Давыдов","Беляев","Герасимов","Богданов","Осипов","Сафонов","Никифоров","Власов","Мельников"];
const TEST_CITIES = ["Москва","Санкт-Петербург","Казань","Новосибирск","Екатеринбург","Нижний Новгород","Самара","Уфа","Красноярск","Пермь"];

class Testing {

  /**
   * Создаёт N случайных участников (по умолчанию 64) и пишет их
   * напрямую в лист "Участники". Возраст 10-80 лет, уровень игры
   * распределяется случайно по всем 6 категориям.
   */
  static generateTestParticipants(count) {
    count = count || 64;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = Theme.findSheetByBaseName(ss, "Участники") || ss.getSheetByName("Участники");

    if (!sheet) {
      throw new Error('Лист "Участники" не найден. Сначала создайте турнир (Турнир → Новый турнир).');
    }

    let nextId = Participants.getNextId(sheet);
    const usedKeys = Participants.loadExistingKeys(sheet);

    const rows = [];
    let attempts = 0;

    while (rows.length < count && attempts < count * 5) {
      attempts++;

      const isMale = Math.random() < 0.5;
      const firstName = this.pick(isMale ? TEST_FIRST_NAMES_M : TEST_FIRST_NAMES_F);
      const lastName = this.pick(TEST_LAST_NAMES) + (isMale ? "" : "а");
      const middleName = isMale ? "Александрович" : "Александровна";
      const fio = `${lastName} ${firstName} ${middleName}`;

      const phone = this.randomPhone();
      const key = Participants.buildKey(fio, phone);
      if (usedKeys.has(key)) continue; // на случай редкого совпадения — просто пробуем ещё раз
      usedKeys.add(key);

      const birthDate = this.randomBirthDate(10, 80);
      const city = this.pick(TEST_CITIES);
      const telegram = "@" + this.transliterate(firstName).toLowerCase() + Math.floor(Math.random() * 1000);
      const level = this.pick(FORM_LEVEL_OPTIONS);
      const rating = Math.random() < 0.7 ? Math.floor(400 + Math.random() * 1600) : ""; // 30% без рейтинга

      rows.push([
        nextId,
        fio,
        birthDate,
        Participants.calcAge(birthDate),
        city,
        phone,
        telegram,
        level,
        rating,
        "",                    // Посев — проставится через "Жеребьёвка → Посев"
        "Зарегистрирован",
        rating !== "" ? "Да" : "Нет",  // тестовым данным сразу подтверждаем рейтинг (если он есть),
                                        // чтобы посев можно было тестировать сразу без ручных правок
        "",                             // Ссылка на подтверждение — у тестовых данных её нет
        "Я ознакомился(-лась) и согласен(-на) с положением о турнире",  // тестовые данные — согласие всегда есть
        "",                             // ID участника 1 (пара) — тестовые участники создаются как одиночки
        "",                             // ID участника 2 (пара)
        isMale ? "Мужской" : "Женский", // Пол
        "",                             // Категория — заполняется на этапе жеребьёвки
        ""                              // Категория (вручную)
      ]);
      nextId++;
    }

    if (rows.length > 0) {
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
    }

    const message = `Добавлено тестовых участников: ${rows.length}`;
    Logger.log(message);

    // Если запущено из контекста с доступным UI (не гарантировано при
    // запуске кнопкой Run) — покажем алерт; если нет, тихо пишем в Logger
    try {
      SpreadsheetApp.getUi().alert("✅ Тестовые участники созданы", message, SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (e) {
      // запущено вручную из редактора без открытой таблицы — это нормально
    }

    return { added: rows.length };
  }

  /**
   * Полностью очищает лист "Участники" (оставляя заголовки) —
   * удобно перед повторным прогоном теста с нуля.
   */
  static clearParticipants() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = Theme.findSheetByBaseName(ss, "Участники") || ss.getSheetByName("Участники");
    if (!sheet) return;

    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    }

    Logger.log("Лист «Участники» очищен (заголовки сохранены).");
  }

  // --------------------------------------------------------
  // Вспомогательное
  // --------------------------------------------------------

  static pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  static randomPhone() {
    const part = () => String(Math.floor(100 + Math.random() * 900));
    const last = () => String(Math.floor(10 + Math.random() * 90));
    return `+7 9${Math.floor(10 + Math.random() * 90)} ${part()}-${last()}-${last()}`;
  }

  static randomBirthDate(minAge, maxAge) {
    const today = new Date();
    const age = minAge + Math.floor(Math.random() * (maxAge - minAge + 1));

    const year = today.getFullYear() - age;
    const month = Math.floor(Math.random() * 12);
    const day = 1 + Math.floor(Math.random() * 28); // 28, чтобы не попасть на несуществующие даты

    return new Date(year, month, day);
  }

  static transliterate(text) {
    const map = {
      "А":"A","Б":"B","В":"V","Г":"G","Д":"D","Е":"E","Ё":"E","Ж":"Zh","З":"Z","И":"I",
      "Й":"Y","К":"K","Л":"L","М":"M","Н":"N","О":"O","П":"P","Р":"R","С":"S","Т":"T",
      "У":"U","Ф":"F","Х":"H","Ц":"Ts","Ч":"Ch","Ш":"Sh","Щ":"Sch","Ъ":"","Ы":"Y","Ь":"",
      "Э":"E","Ю":"Yu","Я":"Ya"
    };
    return text.split("").map(ch => map[ch.toUpperCase()] || ch).join("");
  }

}

/**
 * Функции-обёртки верхнего уровня — их и нужно выбирать в
 * выпадающем списке редактора Apps Script для запуска кнопкой ▶ Run,
 * т.к. напрямую статический метод класса там не выбрать.
 */
function generateTestParticipants() {
  Testing.generateTestParticipants(64);
}

function clearTestParticipants() {
  Testing.clearParticipants();
}