/**
 * ==========================================================
 * TT Tournament Manager
 * Logging.gs
 * Версия 0.1
 * ----------------------------------------------------------
 * Единая точка записи событий в лист "📝 Логи". Остальные
 * модули просто вызывают AppLog.write(event, description) —
 * сами не думают, где лист и как он называется.
 * ==========================================================
 */

class AppLog {

  /**
   * Добавляет строку в лист "Логи": Дата, Пользователь, Событие, Описание.
   * Никогда не бросает исключение наружу — логирование не должно
   * ломать основную операцию, даже если сам лист "Логи" пропал.
   */
  static write(event, description) {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = Theme.findSheetByBaseName(ss, "Логи") || ss.getSheetByName("Логи");
      if (!sheet) return;

      let user = "неизвестно";
      try {
        user = Session.getActiveUser().getEmail() || "неизвестно";
      } catch (e) {
        // getActiveUser может быть недоступен в некоторых контекстах — не критично
      }

      sheet.appendRow([new Date(), user, event, description || ""]);
    } catch (e) {
      Logger.log("AppLog.write error: " + e);
    }
  }

}