# TT Tournament Manager

*[Читать на русском](README.md)*

A Google Apps Script application for running table tennis tournaments (and other racket sports) directly inside Google Sheets: participant registration through a Google Form, automatic draw generation (groups + single-elimination bracket), match and score tracking, age/gender categories with automatic merging of small categories, doubles support, reports and rating — with no external server or database. All tournament logic lives inside a single spreadsheet and is driven through a custom menu built into it.

This project is not part of the main Pingo web application (`/opt/pingo`) — it is a standalone tool for tournament organizers that runs on top of the Google ecosystem (Sheets, Forms, Drive, Apps Script).

## Features

- **Tournament setup wizard** (`wizard.gs`, `setup.gs`) — a step-by-step flow for creating a new tournament: name, format, number of courts, categories.
- **Participant registration** (`forms.gs`, `participants.gs`) — accepting entries via a Google Form, importing/exporting the participant list, handling singles and doubles entries.
- **Categories** (`categories.gs`) — splitting participants into age/gender categories (children/teens/adults × M/F) with automatic merging of small categories and a "mixed tournament" mode.
- **Draw generation** (`draw.gs`) — building groups and a single-elimination bracket, seeding participants.
- **Matches** (`matches.gs`) — recording results, computing rating, scheduling courts.
- **Teams/pairs** (`teams.gs`) — doubles support.
- **Theming** (`theme.gs`) — consistent visual styling across sheets.
- **Google Drive** (`drive.gs`) — creating a tournament folder and moving the spreadsheet into it.
- **Reports** (`reports.gs`) — final tournament reports.
- **Menu** (`menu.gs`) — a single entry point for the organizer: every function is available from the custom "🏓 TT Tournament Manager" menu inside the spreadsheet itself.
- **Logging and diagnostics** (`logging.gs`, `testing.gs`) — helper tools for debugging directly on a live spreadsheet.

## Repository structure

```
tournament/
├── categories.gs      # Age/gender categories
├── config.gs           # Storing and reading tournament settings
├── docs/                # Feature plans and specs (markdown)
├── draw.gs              # Draw generation: groups and bracket
├── drive.gs             # Google Drive integration
├── forms.gs             # Google Form registration
├── logging.gs           # Logging
├── matches.gs           # Matches, results, rating
├── menu.gs              # Custom Apps Script menu
├── participants.gs      # Participants: import/export, statuses
├── reports.gs           # Final reports
├── setup.gs             # Tournament creation orchestrator
├── teams.gs             # Teams/pairs
├── testing.gs           # Manual diagnostics inside the sheet
├── theme.gs             # Sheet styling
├── wizard.gs             # New tournament setup wizard
├── tests/                # Automated tests for pure logic (Node.js)
└── Pravila_nastolnogo_tennisa_*.pdf  # Official table tennis rules (reference)
```

## Tech stack

- **Google Apps Script** (V8 runtime, ES2020 classes). All `.gs` files share a single global scope — this is normal for Apps Script, not an architectural mistake.
- No external dependencies and no build step — the code deploys as-is through the Apps Script editor or [`clasp`](https://github.com/google/clasp).
- Automated tests exist only for the "pure" part of the business logic (e.g. `Categories.gs`) that does not touch `SpreadsheetApp`/`DocumentApp`. They run on the built-in `node:test` (Node 18+), with no extra npm packages.

## Installation and setup

Full instructions: [SETUP.en.md](SETUP.en.md).

Quick version:
1. Create a new Google Sheet.
2. Open "Extensions → Apps Script".
3. Copy all `*.gs` files from this repository into the Apps Script project (or deploy with `clasp push` after configuring your own `.clasp.json`, which is not stored in this repository).
4. Save and reload the spreadsheet — the "🏓 TT Tournament Manager" menu will appear.
5. Run the tournament setup wizard from the menu.

## Testing

```bash
node --test tournament/tests/
```

## License

Internal tool of the Pingo project. Usage and distribution by arrangement with the author.
