/**
 * ==========================================================
 * TT Tournament Manager
 * Drive.gs
 * Версия 0.1
 * ----------------------------------------------------------
 * Отвечает ТОЛЬКО за работу с Google Drive:
 *  - создание корневой папки приложения (один раз, для всех турниров)
 *  - создание папки конкретного турнира
 *  - перенос самой таблицы в эту папку
 *
 * Требует авторизации со scope Drive
 * (https://www.googleapis.com/auth/drive).
 * ==========================================================
 */

const DRIVE_ROOT_FOLDER_NAME = "TT Tournament Manager";


class DriveService {

  // --------------------------------------------------------
  // Находит или создаёт общую корневую папку приложения,
  // внутри которой лежат папки отдельных турниров
  // --------------------------------------------------------
  static getOrCreateRootFolder() {
    const folders = DriveApp.getFoldersByName(DRIVE_ROOT_FOLDER_NAME);
    if (folders.hasNext()) {
      return folders.next();
    }
    return DriveApp.createFolder(DRIVE_ROOT_FOLDER_NAME);
  }

  // --------------------------------------------------------
  // Создаёт (или находит уже существующую — на случай повторного
  // запуска мастера настроек) папку конкретного турнира
  // --------------------------------------------------------
  static createTournamentFolder(config) {
    const root = this.getOrCreateRootFolder();
    const folderName = this.buildFolderName(config);

    const existing = root.getFoldersByName(folderName);
    if (existing.hasNext()) {
      return existing.next();
    }

    return root.createFolder(folderName);
  }

  static buildFolderName(config) {
    const datePart = config.date ? ` (${config.date})` : "";
    const name = config.name ? config.name : "Турнир без названия";
    return `${name}${datePart}`;
  }

  // --------------------------------------------------------
  // Переносит текущую таблицу в указанную папку турнира.
  // Не копирует, а именно перемещает (убирает из старых родителей).
  // --------------------------------------------------------
  static moveSpreadsheetToFolder(ss, folder) {
    const file = DriveApp.getFileById(ss.getId());

    const oldParents = file.getParents();
    while (oldParents.hasNext()) {
      const parent = oldParents.next();
      // Не убираем из целевой папки, если таблица там уже лежит
      if (parent.getId() !== folder.getId()) {
        parent.removeFile(file);
      }
    }

    const alreadyThere = folder.getFilesByName(file.getName());
    let found = false;
    while (alreadyThere.hasNext()) {
      if (alreadyThere.next().getId() === file.getId()) found = true;
    }
    if (!found) {
      folder.addFile(file);
    }
  }

  // --------------------------------------------------------
  // Создаёт внутри папки турнира пару типовых подпапок
  // (например, для итоговых PDF-протоколов и дипломов —
  // пригодится модулю "Отчёты")
  // --------------------------------------------------------
  static ensureSubfolders(tournamentFolder, names) {
    const result = {};
    names.forEach(name => {
      const existing = tournamentFolder.getFoldersByName(name);
      result[name] = existing.hasNext() ? existing.next() : tournamentFolder.createFolder(name);
    });
    return result;
  }

}