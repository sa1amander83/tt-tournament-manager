
/**
 * ==========================================================
 * TT Tournament Manager
 * Reports.gs
 * Версия 0.1
 * ----------------------------------------------------------
 * Отвечает ТОЛЬКО за итоговые документы турнира:
 *  - итоговый протокол (Google Doc: таблица результатов + матчи)
 *  - дипломы призёрам (Google Doc -> PDF, по одному на игрока)
 *  - экспорт произвольного листа таблицы в PDF
 *
 * Все файлы сохраняются в папку турнира на Drive (Drive.gs),
 * если она была создана; иначе — в корень Google Drive
 * пользователя с предупреждением.
 * ==========================================================
 */

class Reports {

  // ========================================================
  // ИТОГОВЫЙ ПРОТОКОЛ
  // ========================================================

  static generateFinalProtocol() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const config = ConfigService.load();
    const standings = this.getStandings(ss);
    const results = Matches.getResults();

    const categories = [];
    standings.forEach(r => { if (categories.indexOf(r.category) === -1) categories.push(r.category); });
    results.forEach(m => { const c = m.category || ""; if (categories.indexOf(c) === -1) categories.push(c); });
    if (categories.length === 0) categories.push("");

    const doc = DocumentApp.create(`Итоговый протокол — ${config.name || "Турнир"}`);
    const body = doc.getBody();

    body.appendParagraph(config.name || "Турнир")
      .setHeading(DocumentApp.ParagraphHeading.TITLE);
    body.appendParagraph([config.date, config.place].filter(Boolean).join("  •  "));
    body.appendParagraph(" ");

    categories.forEach(category => {
      if (category) {
        body.appendParagraph(category).setHeading(DocumentApp.ParagraphHeading.HEADING1);
      }

      const catStandings = standings.filter(r => r.category === category);
      body.appendParagraph("Итоговая таблица").setHeading(DocumentApp.ParagraphHeading.HEADING2);
      if (catStandings.length > 0) {
        const table1 = [["Место", "Игрок", "Очки", "Победы", "Поражения"]];
        catStandings.forEach((r, i) => table1.push([i + 1, r.fio, r.points, r.wins, r.losses]));
        body.appendTable(table1);
      } else {
        body.appendParagraph("Рейтинг пока пуст — матчи ещё не завершены.");
      }

      body.appendParagraph(" ");
      const catResults = results.filter(m => (m.category || "") === category);
      body.appendParagraph("Результаты матчей").setHeading(DocumentApp.ParagraphHeading.HEADING2);
      if (catResults.length > 0) {
        const table2 = [["№", "Раунд", "Игрок 1", "Игрок 2", "Счёт", "Победитель"]];
        catResults.forEach(m => table2.push([m.id, m.round, m.player1, m.player2, m.score, m.winner]));
        body.appendTable(table2);
      } else {
        body.appendParagraph("Сыгранных матчей пока нет.");
      }
      body.appendParagraph(" ");
    });

    doc.saveAndClose();
    this.moveToTournamentFolder(doc.getId(), config.driveFolderId, "Отчёты");

    config.finalProtocolUrl = doc.getUrl();
    ConfigService.save(config);

    AppLog.write("Итоговый протокол создан", doc.getUrl());

    return { docId: doc.getId(), url: doc.getUrl() };
  }

  static getStandings(ss) {
    const sheet = Theme.findSheetByBaseName(ss, "Рейтинг") || ss.getSheetByName("Рейтинг");
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    const rows = [];
    let currentCategory = "";

    for (let i = 1; i < data.length; i++) {
      const col0 = String(data[i][0] || "");
      const col1 = data[i][1];
      if (col0.indexOf("═══") === 0) {
        currentCategory = col0.replace(/═══/g, "").trim();
        continue;
      }
      if (!col1) continue;
      rows.push({ id: data[i][0], fio: col1, points: data[i][2], wins: data[i][3], losses: data[i][4], category: currentCategory });
    }
    return rows;
  }

  // ========================================================
  // ДИПЛОМЫ
  // ========================================================

  /**
   * Создаёт дипломы для топ-N игроков по текущему рейтингу
   * (по умолчанию 3), сразу экспортирует в PDF.
   */
  static generateDiplomas(topN) {
    topN = topN || 3;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const config = ConfigService.load();
    const standings = this.getStandings(ss);

    if (standings.length === 0) {
      throw new ReportsError(
        "Рейтинг пуст. Сначала сыграйте и внесите результаты матчей (Проведение → Результаты)."
      );
    }

    const categories = [];
    standings.forEach(r => { if (categories.indexOf(r.category) === -1) categories.push(r.category); });

    const placeLabels = ["🥇 1 место", "🥈 2 место", "🥉 3 место"];
    const created = [];

    categories.forEach(category => {
      const catStandings = standings.filter(r => r.category === category);

      catStandings.slice(0, topN).forEach((player, i) => {
        const doc = DocumentApp.create(`Диплом — ${player.fio}`);
        const body = doc.getBody();

        body.appendParagraph("ДИПЛОМ")
          .setHeading(DocumentApp.ParagraphHeading.TITLE)
          .setAlignment(DocumentApp.HorizontalAlignment.CENTER);

        body.appendParagraph(placeLabels[i] || `${i + 1} место`)
          .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
          .setFontSize(20);

        if (category) {
          body.appendParagraph(category)
            .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
            .setFontSize(14);
        }

        body.appendParagraph(" ");

        body.appendParagraph(player.fio)
          .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
          .setFontSize(24)
          .setBold(true);

        body.appendParagraph(" ");

        const reason = i === 0 ? "победу" : "призовое место";
        const eventLine = `награждается за ${reason}` +
          (category ? ` в категории «${category}»` : "") +
          ` турнира «${config.name || ""}»` +
          (config.date ? `, ${config.date}` : "") +
          (config.place ? `, ${config.place}` : "");

        body.appendParagraph(eventLine).setAlignment(DocumentApp.HorizontalAlignment.CENTER);

        doc.saveAndClose();

        const pdfFile = this.convertDocToPdf(doc.getId(), config.driveFolderId, "Дипломы");
        created.push({ fio: player.fio, place: i + 1, category, pdfUrl: pdfFile.getUrl() });
      });
    });

    AppLog.write("Дипломы созданы", created.map(d => `${d.category ? d.category + ": " : ""}${d.place} место — ${d.fio}`).join("; "));

    return created;
  }

  // ========================================================
  // ЭКСПОРТ ЛИСТА В PDF
  // ========================================================

  static exportSheetAsPdf(sheetName) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const config = ConfigService.load();
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      throw new ReportsError(`Лист «${sheetName}» не найден. Проверьте точное название вкладки (с эмодзи).`);
    }

    const url = `https://docs.google.com/spreadsheets/d/${ss.getId()}/export` +
      `?format=pdf&gid=${sheet.getSheetId()}&size=A4&portrait=true&fitw=true&gridlines=false`;

    const token = ScriptApp.getOAuthToken();
    const response = UrlFetchApp.fetch(url, { headers: { Authorization: "Bearer " + token } });
    const blob = response.getBlob().setName(`${sheetName} — ${config.name || "Турнир"}.pdf`);

    const folder = this.getTargetFolder(config.driveFolderId, "Отчёты");
    const file = folder.createFile(blob);

    return file.getUrl();
  }

  // ========================================================
  // Вспомогательное
  // ========================================================

  static convertDocToPdf(docId, tournamentFolderId, subfolderName) {
    const docFile = DriveApp.getFileById(docId);
    const pdfBlob = docFile.getAs(MimeType.PDF);

    const folder = this.getTargetFolder(tournamentFolderId, subfolderName);
    const pdfFile = folder.createFile(pdfBlob).setName(docFile.getName() + ".pdf");

    // Исходный Google Doc тоже полезен (можно поправить текст) — кладём рядом
    try {
      folder.addFile(docFile);
      DriveApp.getRootFolder().removeFile(docFile);
    } catch (e) {
      Logger.log("convertDocToPdf move error: " + e);
    }

    return pdfFile;
  }

  static getTargetFolder(tournamentFolderId, subfolderName) {
    if (!tournamentFolderId) {
      return DriveApp.getRootFolder();
    }
    try {
      const tournamentFolder = DriveApp.getFolderById(tournamentFolderId);
      if (!subfolderName) return tournamentFolder;

      const sub = DriveService.ensureSubfolders(tournamentFolder, [subfolderName]);
      return sub[subfolderName];
    } catch (e) {
      Logger.log("getTargetFolder error: " + e);
      return DriveApp.getRootFolder();
    }
  }

  static moveToTournamentFolder(fileId, tournamentFolderId, subfolderName) {
    if (!tournamentFolderId) return;
    try {
      const file = DriveApp.getFileById(fileId);
      const folder = this.getTargetFolder(tournamentFolderId, subfolderName);
      folder.addFile(file);
      DriveApp.getRootFolder().removeFile(file);
    } catch (e) {
      Logger.log("moveToTournamentFolder error: " + e);
    }
  }

}


class ReportsError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReportsError";
  }
}