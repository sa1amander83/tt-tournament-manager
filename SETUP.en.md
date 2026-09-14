# Installation and setup guide

*[Читать на русском](SETUP.md)*

## Requirements

- A Google account (for Sheets, Forms, Drive and Apps Script).
- For local development/testing: Node.js 18 or newer (only needed to run the `tests/` automated tests — not required for the application itself).
- (Optional) [`clasp`](https://github.com/google/clasp) — Google's CLI for syncing local files with an Apps Script project. Without it, you can copy files manually through the web editor.

## Option 1: without clasp, using the Apps Script web editor

1. Create a new Google Sheet (sheets.new).
2. In the sheet, open **Extensions → Apps Script**. This opens the code editor bound to that sheet.
3. Delete the default `Code.gs` stub file created by the editor.
4. For every `*.gs` file in this repository (`categories.gs`, `config.gs`, `draw.gs`, `drive.gs`, `forms.gs`, `logging.gs`, `matches.gs`, `menu.gs`, `participants.gs`, `reports.gs`, `setup.gs`, `teams.gs`, `testing.gs`, `theme.gs`, `wizard.gs`) create a new file with the same name in the editor ("+" button → "Script") and paste in the corresponding file's content.
5. Save the project (Ctrl+S / the disk icon).
6. Reload the spreadsheet tab in your browser — `onOpen()` in `menu.gs` will fire and the **🏓 TT Tournament Manager** menu will appear.
7. On first run, Google will ask you to grant the script permissions (access to the sheet, Google Drive, Google Forms on your behalf) — this is the standard OAuth prompt for scripts bound to your own account.

## Option 2: using clasp (recommended for development)

1. Install clasp globally:
   ```bash
   npm install -g @google/clasp
   ```
2. Log in:
   ```bash
   clasp login
   ```
3. Enable the Apps Script API for your account (one time): https://script.google.com/home/usersettings
4. Create a new Apps Script project bound to a new Google Sheet:
   ```bash
   clasp create --type sheets --title "TT Tournament Manager" --rootDir ./tournament
   ```
   This creates a `.clasp.json` file inside `tournament/` — it is **intentionally not committed to git** (see `.gitignore`), since it contains the identifier of your own personal Apps Script project.
5. Push the code to the project:
   ```bash
   cd tournament
   clasp push
   ```
6. Open the spreadsheet:
   ```bash
   clasp open --webapp
   ```
   or use the link printed by `clasp create`.
7. Reload the spreadsheet in your browser so the **🏓 TT Tournament Manager** menu appears.

## Running your first tournament

1. In the spreadsheet, open **🏓 TT Tournament Manager → New tournament** (or the equivalent wizard entry — see `wizard.gs`/`menu.gs`).
2. Go through the wizard: tournament name, format, number of courts, toggle "mixed tournament" mode on/off.
3. The wizard (`setup.gs`) automatically:
   - creates the required sheets with headers;
   - applies the visual theme (`theme.gs`);
   - creates a tournament folder on Google Drive and moves the spreadsheet into it (`drive.gs`);
   - creates a Google Form for participant registration (`forms.gs`);
   - saves the final settings (`config.gs`).
4. Share the registration form link with participants.
5. Once entries are collected, run category assignment (`categories.gs`) and draw generation (`draw.gs`) from the menu.
6. Track match results through the "Matches" sheet and `matches.gs` functions; generate final reports through `reports.gs`.

## Automated tests

The project includes automated tests for the "pure" logic (not dependent on `SpreadsheetApp`), primarily for `categories.gs`. They run locally, without a Google account:

```bash
cd tournament
node --test tests/
```

`tests/gas-loader.js` loads the required `.gs` files into a shared Node.js VM context, emulating how Apps Script shares a single global scope across all files in a project.

## Diagnostics

- `logging.gs` — simple logging to a dedicated sheet/the Apps Script execution log (**Executions** in the editor's left sidebar).
- `testing.gs` — a set of manual diagnostic functions you can run directly from the Apps Script editor (select the function → the ▶ "Run" button) to inspect the spreadsheet's state without re-running the whole wizard.
