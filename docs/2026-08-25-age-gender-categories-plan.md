# Возрастные/гендерные категории — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Разделить участников турнира (в `tournament/*.gs`, Google Apps Script) на возрастные/гендерные категории (дети/подростки/взрослые × М/Ж) с автослиянием малых категорий, и дать организатору переключатель «смешанный турнир» в мастере настройки.

**Architecture:** Один тег «Категория», используемый как фильтр в существующих листах (не отдельный комплект листов на категорию). Функции жеребьёвки/матчей, которые сейчас работают с плоским списком участников, обрастают параметром `category` и вызываются в цикле по активным категориям — цикл живёт ВНУТРИ функции, если она целиком перезаписывает лист (`clear()`), и может быть снаружи для функций, которые только добавляют строки.

**Tech Stack:** Google Apps Script (V8 runtime, ES2020 классы), без модулей — все `.gs`-файлы делят один глобальный scope. Автотесты — только для чистой логики `Categories.gs`, через встроенный `node:test` (Node 18+, без внешних зависимостей), команда `node --test tournament/tests/`.

**Spec:** `tournament/docs/2026-08-25-age-gender-categories-design.md`

## Global Constraints

- `tournament/` целиком вне git (`.gitignore` репозитория Pingo) — **ни в одном шаге плана нет `git add`/`git commit`**; каждая задача заканчивается сохранённым файлом и проверкой, коммитить нечего и некуда.
- Нет автотестового раннера для GAS-зависимого кода — только чистые функции `Categories.gs` покрыты реальными автотестами. Остальные задачи проверяются вручную в редакторе Apps Script / на тестовой таблице, по шагам, данным в самой задаче.
- Колонка «Категория» в «Матчи» — **последней** (16-й, `MATCH_COL.CATEGORY = 16`), не первой: остальные 15 констант `MATCH_COL` не меняются.
- «Группы» и «Плей-офф» — листы только для отображения (программно не читаются обратно по категориям), получают текстовые заголовки-секции, а не колонку.
- Функции, которые делают `sheet.clear()` перед записью (`Draw.createGroups`→«Группы», `Draw.startSingleElimination`→«Плей-офф», `Matches.recalcRating`→«Рейтинг»), цикл по категориям держат ВНУТРИ себя — один `clear()`, одна запись всех категорий подряд.
- `TournamentConfig.mixedTournament` по умолчанию `true` — уже существующие турниры (и таблицы без строки «Смешанный турнир» в «Настройках») ведут себя ровно как сегодня, пока организатор не переключит явно.
- Границы категорий (12/17) и порог слияния (4) — константы в `Config.gs`, не настраиваются через UI.

---

### Task 1: Config.gs — константы и `mixedTournament`

**Files:**
- Modify: `tournament/config.gs`

**Interfaces:**
- Produces: `AGE_CATEGORIES = { CHILD: {label, maxAge}, TEEN: {...}, ADULT: {...} }`, `CATEGORY_MERGE_THRESHOLD` (число), `TournamentConfig.mixedTournament: boolean`, `ConfigService.save/load` читают/пишут строку «Смешанный турнир».

- [x] **Step 1: Добавить константы возрастных категорий**

Вставить после блока `const CONFIG = { ... };` (после строки `};` на line 38 текущего файла) новый блок:

```js
// ----------------------------------------------------------
// Возрастные категории и порог слияния (см. Categories.gs)
// ----------------------------------------------------------

const AGE_CATEGORIES = {
  CHILD: { label: "Дети", maxAge: 12 },
  TEEN:  { label: "Подростки", maxAge: 17 },
  ADULT: { label: "Взрослые", maxAge: null }
};

const CATEGORY_MERGE_THRESHOLD = 4;
```

- [x] **Step 2: Добавить поле `mixedTournament` в `TournamentConfig`**

В конструкторе `TournamentConfig`, сразу после строки `this.matchType = "SINGLES";`, добавить:

```js
    // Смешанный турнир (true) или раздельные категории по возрасту/полу (false)
    this.mixedTournament = true;
```

- [x] **Step 3: Сохранение/загрузка в `ConfigService`**

В `ConfigService.save(config)` изменить диапазон `sheet.getRange(1,1,17,2)` на `sheet.getRange(1,1,18,2)` и добавить новую строку в массив значений сразу после `["Тип турнира",config.matchType],`:

```js
      ["Тип турнира",config.matchType],

      ["Смешанный турнир", config.mixedTournament === false ? "Нет" : "Да"],

      ["Максимум участников",config.maxPlayers],
```

В `ConfigService.load(sheet)`, в `switch(row[0])`, добавить новый `case` рядом с `case "Тип турнира":`:

```js
        case "Смешанный турнир":
          cfg.mixedTournament = row[1] !== "Нет";
          break;
```

(Строка отсутствует в старых таблицах → `cfg.mixedTournament` остаётся `true` из конструктора — обратная совместимость.)

- [ ] **Step 4: Ручная проверка**

В Apps Script редакторе выполнить `ConfigService.load()` на пустой/старой таблице без строки «Смешанный турнир» — убедиться, что `mixedTournament === true`. Затем `ConfigService.save({...cfg, mixedTournament: false})` и `ConfigService.load()` заново — убедиться, что вернулось `false`.

---

### Task 2: Categories.gs — алгоритм категоризации + автотесты

**Files:**
- Create: `tournament/categories.gs`
- Create: `tournament/tests/gas-loader.js`
- Create: `tournament/tests/categories.test.js`

**Interfaces:**
- Consumes: `AGE_CATEGORIES`, `CATEGORY_MERGE_THRESHOLD` (Task 1); `Participants.calcAge(birthDate)` (уже существует, чистая функция).
- Produces: `Categories.assign(data, mixed) → Map<rowIndex, categoryLabel>`, `Categories.eligibleRowIndices(data)`, `Categories.resolveAgeGender(data, rowIndex)`, `Categories.assignCategories(entries)`, `Categories.activeLabels(ss)` (GAS-only, не тестируется).

`data` везде — это полный массив `sheet.getDataRange().getValues()`, включая строку заголовка на индексе 0 (как уже принято в `Draw.gs`/`Matches.gs`); `rowIndex` — реальный индекс внутри этого массива (данные начинаются с 1).

- [x] **Step 1: Написать тестовый загрузчик GAS-файлов для Node**

`tournament/tests/gas-loader.js`:

```js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Загружает перечисленные .gs-файлы в общий vm-контекст — так же,
// как Apps Script делит один глобальный scope между всеми файлами
// проекта. Файлы, которые ТОЛЬКО объявляют классы/константы (не
// вызывают SpreadsheetApp/DocumentApp на верхнем уровне), загружаются
// без ошибок даже без доступного GAS-окружения.
function loadGasFiles(fileNames) {
  const context = { console };
  vm.createContext(context);
  fileNames.forEach(name => {
    const filePath = path.join(__dirname, '..', name);
    const code = fs.readFileSync(filePath, 'utf8');
    vm.runInContext(code, context, { filename: name });
  });
  return context;
}

module.exports = { loadGasFiles };
```

- [x] **Step 2: Написать падающие тесты**

`tournament/tests/categories.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGasFiles } = require('./gas-loader');

const ctx = loadGasFiles(['config.gs', 'participants.gs', 'categories.gs']);
const { Categories } = ctx;

// Возвращает дату рождения, дающую ровно `age` полных лет СЕГОДНЯ —
// не зависит от даты запуска тестов.
function birthDateForAge(age) {
  const now = new Date();
  return new Date(now.getFullYear() - age, now.getMonth(), now.getDate());
}

// Собирает `count` строк "Участники" (0-индексация как в реальном
// листе) с нужным возрастом/полом, остальные поля — минимально
// валидные заглушки. status по умолчанию "Зарегистрирован".
function makeRows(specs) {
  const header = new Array(18).fill("");
  const rows = [header];
  specs.forEach((s, i) => {
    const row = new Array(18).fill("");
    row[0] = s.id !== undefined ? s.id : i + 1;               // ID
    row[1] = s.fio || `Игрок ${i + 1}`;                        // ФИО
    row[2] = s.age !== undefined ? birthDateForAge(s.age) : "";// Дата рождения
    row[10] = s.status || "Зарегистрирован";                   // Статус
    row[14] = s.participant1Id || "";                           // ID участника 1 (пара)
    row[16] = s.gender || "";                                   // Пол
    rows.push(row);
  });
  return rows;
}

test('assign: mixed=true даёт всем пустую категорию', () => {
  const data = makeRows([{ age: 30, gender: "Мужской" }, { age: 9, gender: "Женский" }]);
  const result = Categories.assign(data, true);
  assert.equal(result.get(1), "");
  assert.equal(result.get(2), "");
});

test('assign: статусы Снят/Дисквалифицирован/В паре исключены', () => {
  const data = makeRows([
    { age: 30, gender: "Мужской", status: "Снят" },
    { age: 30, gender: "Мужской", status: "Дисквалифицирован" },
    { age: 30, gender: "Мужской", status: "В паре" },
    { age: 30, gender: "Мужской", status: "Зарегистрирован" }
  ]);
  const result = Categories.assign(data, true);
  assert.equal(result.size, 1);
  assert.equal(result.has(4), true);
});

test('resolveAgeGender: пара берёт возраст/пол участника 1', () => {
  const data = makeRows([
    { id: 101, age: 25, gender: "Мужской", status: "В паре" },
    { id: 102, age: 40, gender: "Женский", status: "В паре" },
    { id: 200, participant1Id: 101, status: "Зарегистрирован" } // строка-пара, свой возраст/пол пустые
  ]);
  const resolved = Categories.resolveAgeGender(data, 3);
  assert.deepEqual(resolved, { age: 25, gender: "Мужской" });
});

test('assignCategories: погранично 12/13 и 17/18 классифицируются верно', () => {
  const entries = [
    { rowIndex: 1, age: 12, gender: "Мужской" },
    { rowIndex: 2, age: 13, gender: "Мужской" },
    { rowIndex: 3, age: 17, gender: "Мужской" },
    { rowIndex: 4, age: 18, gender: "Мужской" }
  ];
  // Все в одной гендерной корзине разных возрастных групп — каждая
  // группа < порога (по 1 человеку), поэтому в итоге всё сольётся в
  // одну категорию "Все" (безгендерную). Проверяем именно факт слияния
  // всех, чтобы подтвердить, что 12 отделился от 13, а 17 от 18 на
  // уровне сырых корзин (иначе слияние пошло бы по другому пути).
  const result = Categories.assignCategories(entries);
  const labels = new Set(Array.from(result.values()));
  assert.equal(labels.size, 1);
  assert.equal(labels.has("Все"), true);
});

test('assignCategories: сценарий из реальных данных (3 ребёнка, 2 подростка, 14 взрослых 7М/7Ж)', () => {
  const entries = [];
  let rowIndex = 1;
  for (let i = 0; i < 2; i++) entries.push({ rowIndex: rowIndex++, age: 10, gender: "Мужской" });
  entries.push({ rowIndex: rowIndex++, age: 11, gender: "Женский" });
  entries.push({ rowIndex: rowIndex++, age: 16, gender: "Мужской" });
  entries.push({ rowIndex: rowIndex++, age: 16, gender: "Женский" });
  for (let i = 0; i < 7; i++) entries.push({ rowIndex: rowIndex++, age: 30, gender: "Мужской" });
  for (let i = 0; i < 7; i++) entries.push({ rowIndex: rowIndex++, age: 30, gender: "Женский" });

  const result = Categories.assignCategories(entries);
  const labels = new Set(Array.from(result.values()));

  assert.equal(labels.has("Дети и подростки"), true);
  assert.equal(labels.has("Взрослые (М)"), true);
  assert.equal(labels.has("Взрослые (Ж)"), true);
  assert.equal(labels.size, 3);
});

test('assignCategories: ровно 4 человека в корзине НЕ сливается, 3 — сливается', () => {
  const fourM = Array.from({ length: 4 }, (_, i) => ({ rowIndex: i + 1, age: 30, gender: "Мужской" }));
  const fourF = Array.from({ length: 4 }, (_, i) => ({ rowIndex: i + 5, age: 30, gender: "Женский" }));
  const result4 = Categories.assignCategories(fourM.concat(fourF));
  assert.equal(new Set(Array.from(result4.values())).size, 2); // осталось гендерное разделение

  const threeM = Array.from({ length: 3 }, (_, i) => ({ rowIndex: i + 1, age: 30, gender: "Мужской" }));
  const fourF2 = Array.from({ length: 4 }, (_, i) => ({ rowIndex: i + 4, age: 30, gender: "Женский" }));
  const result3 = Categories.assignCategories(threeM.concat(fourF2));
  const labels3 = new Set(Array.from(result3.values()));
  assert.equal(labels3.size, 1);
  assert.equal(labels3.has("Взрослые"), true); // гендер убран для всей возрастной группы
});

test('assignCategories: крайне маленький турнир схлопывается в "Все"', () => {
  const entries = [
    { rowIndex: 1, age: 9, gender: "Мужской" },
    { rowIndex: 2, age: 30, gender: "Женский" }
  ];
  const result = Categories.assignCategories(entries);
  const labels = new Set(Array.from(result.values()));
  assert.equal(labels.size, 1);
  assert.equal(labels.has("Все"), true);
});
```

- [x] **Step 3: Запустить тесты и убедиться, что падают с "Categories is not defined"**

Run: `node --test tournament/tests/`
Expected: FAIL — `categories.gs` ещё не создан.

- [x] **Step 4: Реализовать `Categories.gs`**

`tournament/categories.gs`:

```js
/**
 * ==========================================================
 * TT Tournament Manager
 * Categories.gs
 * Версия 0.1
 * ----------------------------------------------------------
 * Разбивка участников на возрастные/гендерные категории с
 * автослиянием малых категорий (см. спеку
 * tournament/docs/2026-08-25-age-gender-categories-design.md,
 * разделы 1 и 3).
 *
 * Чистая часть (eligibleRowIndices/resolveAgeGender/assign/
 * assignCategories) не трогает SpreadsheetApp и покрыта
 * автотестами в tournament/tests/categories.test.js. Только
 * activeLabels() читает лист — GAS-зависима, тестами не покрыта.
 * ==========================================================
 */

const AGE_ORDER = ["CHILD", "TEEN", "ADULT"];
const AGE_KEYS_TO_LABEL = {
  CHILD: AGE_CATEGORIES.CHILD.label,
  TEEN: AGE_CATEGORIES.TEEN.label,
  ADULT: AGE_CATEGORIES.ADULT.label
};

class Categories {

  // Те же статусы, что Draw.seedPlayers исключает из посева —
  // категория считается только для тех, кто реально будет играть.
  static eligibleRowIndices(data) {
    const indices = [];
    for (let i = 1; i < data.length; i++) {
      const status = data[i][10];
      if (status === "Снят" || status === "Дисквалифицирован" || status === "В паре") continue;
      indices.push(i);
    }
    return indices;
  }

  // Возраст/пол для строки: свои собственные, а для строки-пары —
  // взятые у участника 1 (сама строка пары дату рождения/пол не хранит).
  static resolveAgeGender(data, rowIndex) {
    const row = data[rowIndex];
    const participant1Id = row[14];
    let sourceRow = row;

    if (participant1Id !== "" && participant1Id !== null && participant1Id !== undefined) {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(participant1Id)) { sourceRow = data[i]; break; }
      }
    }

    const birthDate = sourceRow[2];
    const gender = sourceRow[16];
    const age = Participants.calcAge(birthDate);
    if (age === "" || !gender) return null;

    return { age, gender };
  }

  /**
   * Главная точка входа. data — полный getDataRange().getValues()
   * листа "Участники" (с заголовком). Возвращает
   * Map<rowIndex, categoryLabel> для каждой строки, доступной для
   * посева. При mixed=true категория у всех — "".
   */
  static assign(data, mixed) {
    const eligible = this.eligibleRowIndices(data);

    if (mixed) {
      const result = new Map();
      eligible.forEach(i => result.set(i, ""));
      return result;
    }

    const entries = [];
    eligible.forEach(i => {
      const resolved = this.resolveAgeGender(data, i);
      if (resolved) entries.push({ rowIndex: i, age: resolved.age, gender: resolved.gender });
    });

    return this.assignCategories(entries);
  }

  static ageGroupOf(age) {
    if (age <= AGE_CATEGORIES.CHILD.maxAge) return "CHILD";
    if (age <= AGE_CATEGORIES.TEEN.maxAge) return "TEEN";
    return "ADULT";
  }

  /**
   * Чистый алгоритм слияния (спека, раздел 3, шаги 1-5).
   * entries: [{rowIndex, age, gender}]. Возвращает Map<rowIndex, label>.
   */
  static assignCategories(entries) {
    // 1. Сырые 6 корзин
    const raw = {};
    entries.forEach(e => {
      const key = `${this.ageGroupOf(e.age)}|${e.gender}`;
      (raw[key] = raw[key] || []).push(e);
    });

    // 2. На каждую возрастную группу — гендерная или объединённая
    const ageBuckets = {};
    AGE_ORDER.forEach(ag => {
      const m = raw[`${ag}|Мужской`] || [];
      const f = raw[`${ag}|Женский`] || [];
      if (m.length === 0 && f.length === 0) {
        ageBuckets[ag] = null;
      } else if (m.length < CATEGORY_MERGE_THRESHOLD || f.length < CATEGORY_MERGE_THRESHOLD) {
        ageBuckets[ag] = { gendered: false, entries: m.concat(f) };
      } else {
        ageBuckets[ag] = { gendered: true, M: m, F: f };
      }
    });

    // 3. Плоский список "ячеек", каждая привязана к индексу(ам) в AGE_ORDER
    let cells = [];
    AGE_ORDER.forEach((ag, i) => {
      const b = ageBuckets[ag];
      if (!b) return;
      if (b.gendered) {
        cells.push({ ages: [i], gender: "Мужской", entries: b.M });
        cells.push({ ages: [i], gender: "Женский", entries: b.F });
      } else {
        cells.push({ ages: [i], gender: null, entries: b.entries });
      }
    });

    // 4. Слияние недобранных ячеек со старшим соседом (или младшим,
    // если старшего уже нет — см. спеку, раздел 3, шаг 4)
    let changed = true;
    while (changed && cells.length > 1) {
      changed = false;
      for (let i = 0; i < cells.length; i++) {
        if (cells[i].entries.length >= CATEGORY_MERGE_THRESHOLD) continue;

        const maxAge = Math.max.apply(null, cells[i].ages);
        const minAge = Math.min.apply(null, cells[i].ages);

        let targetIdx = cells.findIndex((c, j) => j !== i && Math.min.apply(null, c.ages) === maxAge + 1);
        if (targetIdx === -1) {
          targetIdx = cells.findIndex((c, j) => j !== i && Math.max.apply(null, c.ages) === minAge - 1);
        }
        if (targetIdx === -1) break;

        const merged = {
          ages: cells[i].ages.concat(cells[targetIdx].ages).sort((a, b) => a - b),
          gender: cells[i].gender === cells[targetIdx].gender ? cells[i].gender : null,
          entries: cells[i].entries.concat(cells[targetIdx].entries)
        };
        const toRemove = [i, targetIdx].sort((a, b) => b - a);
        cells.splice(toRemove[0], 1);
        cells.splice(toRemove[1], 1);
        cells.push(merged);
        changed = true;
        break;
      }
    }

    // 5. Метки
    const AGE_LABELS = AGE_ORDER.map(k => AGE_KEYS_TO_LABEL[k]);
    const labelFor = (cell) => {
      const names = cell.ages.map(i => AGE_LABELS[i]);
      let base;
      if (names.length === 3) base = "Все";
      else if (names.length === 2) base = `${names[0]} и ${names[1].toLowerCase()}`;
      else base = names[0];
      if (cell.gender === "Мужской") return `${base} (М)`;
      if (cell.gender === "Женский") return `${base} (Ж)`;
      return base;
    };

    const result = new Map();
    cells.forEach(cell => {
      const label = labelFor(cell);
      cell.entries.forEach(e => result.set(e.rowIndex, label));
    });
    return result;
  }

  /**
   * Уникальные активные категории на листе "Участники", в порядке
   * первого появления; [""], если категорий нет (смешанный турнир
   * или посев ещё не проводился). GAS-зависима — не тестируется в Node.
   */
  static activeLabels(ss) {
    const sheet = Participants.getParticipantsSheet(ss);
    const data = sheet.getDataRange().getValues();
    const labels = [];
    this.eligibleRowIndices(data).forEach(i => {
      const cat = data[i][17];
      if (cat === "" || cat === null || cat === undefined) return;
      if (labels.indexOf(cat) === -1) labels.push(cat);
    });
    return labels.length > 0 ? labels : [""];
  }

}
```

- [x] **Step 5: Запустить тесты и убедиться, что проходят**

Run: `node --test tournament/tests/`
Expected: PASS — все тесты из Step 2 зелёные.

---

### Task 3: Wizard.gs — шаг «Смешанный турнир?»

**Files:**
- Modify: `tournament/wizard.gs`

**Interfaces:**
- Consumes: `TournamentConfig.mixedTournament` (Task 1).

- [x] **Step 1: Добавить шаг мастера**

В `TournamentWizard.run(existingConfig)`, сразу после блока `matchType` (после строк, заканчивающихся `cfg.matchType = matchType;`) и перед блоком `system`, вставить:

```js
    const mixedTournament = this.askChoice(
      ui,
      "Смешанный турнир?",
      { YES: "Да — общая сетка на всех", NO: "Нет — разделить по возрасту и полу" },
      cfg.mixedTournament === false ? "NO" : "YES"
    );
    if (mixedTournament === null) return null;
    cfg.mixedTournament = mixedTournament === "YES";
```

- [ ] **Step 2: Ручная проверка**

В тестовой таблице запустить «Турнир → Новый турнир», убедиться, что появился новый шаг с двумя вариантами, выбрать «Нет», завершить мастер, открыть лист «Настройки» — убедиться, что строка «Смешанный турнир» = «Нет». Повторить мастер через «⚙️ Настройки» на этой же таблице — убедиться, что шаг предзаполнен текущим значением («Нет» → номер 2).

---

### Task 4: Setup.gs — колонки «Пол» и «Категория»

**Files:**
- Modify: `tournament/setup.gs`

**Interfaces:**
- Produces: лист «Участники» с 18 колонками (17 = «Пол», 18 = «Категория»).

- [x] **Step 1: Расширить `initParticipants`**

Заменить `sh.getRange(1,1,1,16).setValues([[...]])` на:

```js
    sh.getRange(1,1,1,18).setValues([[
      "ID",
      "ФИО",
      "Дата рождения",
      "Возраст",
      "Город",
      "Телефон",
      "Telegram",
      "Уровень",
      "Рейтинг",
      "Посев",
      "Статус",
      "Рейтинг подтверждён",
      "Ссылка на подтверждение рейтинга",
      "Согласие с положением",
      "ID участника 1 (пара)",
      "ID участника 2 (пара)",
      "Пол",
      "Категория"
    ]]);
```

- [ ] **Step 2: Ручная проверка**

«Турнир → Новый турнир» на тестовой таблице → открыть «Участники» → убедиться, что 18 колонок с заголовками «Пол» (17-я) и «Категория» (18-я).

---

### Task 5: Пол во всех путях создания строки участника

**Files:**
- Modify: `tournament/forms.gs`
- Modify: `tournament/participants.gs`
- Modify: `tournament/testing.gs`
- Modify: `tournament/teams.gs`

**Interfaces:**
- Consumes: 18-колоночный лист «Участники» (Task 4).
- Produces: каждый путь создания строки участника пишет корректную по длине (18 элементов) строку; «Пол» заполнен для формы/Excel/тестовых данных, пуст (не применимо) для строки-пары.

- [x] **Step 1: Поле «Пол» в форме регистрации (`forms.gs`)**

В `FormsService.createRegistrationForm`, сразу после блока `form.addDateItem().setTitle("Дата рождения")...`, добавить:

```js
    form.addListItem()
      .setTitle("Пол")
      .setChoiceValues(["Мужской", "Женский"])
      .setRequired(true);
```

- [x] **Step 2: Маппинг колонки «Пол» при импорте (`participants.gs`)**

В `Participants.mapFormColumns(headers)` добавить в возвращаемый объект:

```js
      gender: find("Пол"),
```

В `Participants.importFromForm()`, после строки `const agreement = ...`, добавить:

```js
      const gender = col.gender >= 0 ? String(row[col.gender] || "").trim() : "";
```

и в конце массива `rowsToAdd.push([...])` (после `""  // ID участника 2 (пара)`) добавить два новых элемента:

```js
        "",                // ID участника 2 (пара)
        gender,            // Пол
        ""                 // Категория — заполняется на этапе жеребьёвки
```

В `Participants.importFromExcelRange(importSheetName)` аналогично: после `const ratingProof = ...` добавить `const gender = col.gender >= 0 ? String(row[col.gender] || "").trim() : "";`, и в конце `rowsToAdd.push([...])` добавить те же два элемента (`gender`, `""`).

- [x] **Step 3: Тестовые данные пишут «Пол» (`testing.gs`)**

В `Testing.generateTestParticipants`, в конце массива, который пушится в `rows` (после `""  // ID участника 2 (пара)`), добавить:

```js
        "",                             // ID участника 2 (пара)
        isMale ? "Мужской" : "Женский", // Пол
        ""                              // Категория — заполняется на этапе жеребьёвки
```

(`isMale` уже вычислен выше в теле цикла.)

- [x] **Step 4: Строка-пара расширяется до 18 колонок (`teams.gs`)**

В `Teams.createTeam`, в конце массива `teamRow`, после `id2,` (последний текущий элемент) добавить:

```js
      id1,
      id2,
      "",  // Пол — неприменимо для составной записи; категория пары
           // резолвится через участника 1 (см. Categories.resolveAgeGender)
      ""   // Категория — заполняется на этапе жеребьёвки
```

- [ ] **Step 5: Ручная проверка**

Прогнать `Testing.generateTestParticipants(10)` на тестовой таблице → убедиться, что колонка «Пол» заполнена у всех 10 строк корректными значениями. Создать форму регистрации, заполнить её тестовым ответом с указанием пола, запустить «⬇️ Импорт из формы» → убедиться, что «Пол» перенёсся. Создать пару через «👫 Создать пару» → убедиться, что новая строка имеет ровно 18 заполненных/пустых колонок без сдвига (особенно что «Категория» — это 18-я колонка, а не «Пол» съехало в 18-ю).

---

### Task 6: Draw.seedPlayers — вычисление и запись категории

**Files:**
- Modify: `tournament/draw.gs`

**Interfaces:**
- Consumes: `Categories.assign(data, mixed)` (Task 2), `ConfigService.load()` (уже существует).
- Produces: `Draw.seedPlayers()` дополнительно пишет «Категория» (колонка 18, индекс 17) для каждой посеянной строки; `writeSeedSheet` показывает категорию 4-й колонкой.

- [x] **Step 1: Загрузить конфиг и вычислить категории**

В `Draw.seedPlayers()`, сразу после `const data = sheet.getDataRange().getValues();` и проверки `if (data.length < 2)`, добавить:

```js
    const config = ConfigService.load();
    const categoryMap = Categories.assign(data, config.mixedTournament);
```

- [x] **Step 2: Прокинуть категорию в объекты `rows` и записать в лист**

В цикле, который строит `rows.push({...})` (внутри `for (let i = 1; i < data.length; i++)`), добавить поле:

```js
      rows.push({
        rowIndex: i,
        id: data[i][0],
        fio: data[i][1],
        level: data[i][7],
        rating: hasRating ? Number(rawRating) : 0,
        hasRating,
        category: categoryMap.get(i) || ""
      });
```

После цикла `ordered.forEach((r, i) => { data[r.rowIndex][9] = i + 1; });` добавить рядом запись категории:

```js
    ordered.forEach((r, i) => {
      data[r.rowIndex][9] = i + 1;         // столбец "Посев"
      data[r.rowIndex][17] = r.category;   // столбец "Категория"
    });
```

- [x] **Step 3: Показать категорию в листе «Посев»**

В `Draw.writeSeedSheet(ss, ordered)` заменить диапазон из 3 колонок на 4:

```js
  static writeSeedSheet(ss, ordered) {
    const sheet = Theme.findSheetByBaseName(ss, "Посев") || ss.getSheetByName("Посев");
    if (!sheet) return;

    sheet.clear();
    sheet.getRange(1, 1, 1, 4).setValues([["Посев", "ФИО", "Рейтинг", "Категория"]]);

    const rows = ordered.map((r, i) => [i + 1, r.fio, r.hasRating ? r.rating : "—", r.category || ""]);
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 4).setValues(rows);
    }

    sheet.getRange(1, 1, 1, 4)
      .setFontWeight("bold")
      .setBackground("#8E24AA")
      .setFontColor("#FFFFFF");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 70);
    sheet.setColumnWidth(2, 250);
    sheet.setColumnWidth(3, 100);
    sheet.setColumnWidth(4, 160);
  }
```

- [ ] **Step 4: Ручная проверка**

На тестовой таблице: сгенерировать 19 тестовых участников с возрастами/полом, воспроизводящими сценарий из спеки (3 ребёнка, 2 подростка, 14 взрослых 7М/7Ж), включить «Смешанный турнир? Нет» в «⚙️ Настройки», запустить «Посев» → открыть «Участники» и «Посев», убедиться, что колонка «Категория» заполнена и содержит ожидаемые 3 категории («Дети и подростки», «Взрослые (М)», «Взрослые (Ж)»). Повторить с «Смешанный турнир? Да» → убедиться, что «Категория» у всех пустая.

---

### Task 7: Матчи — колонка «Категория» + группы по категориям

**Files:**
- Modify: `tournament/setup.gs`
- Modify: `tournament/matches.gs`
- Modify: `tournament/draw.gs`

**Interfaces:**
- Consumes: `Categories.activeLabels(ss)` (Task 2), «Категория» на «Участники» (Task 6).
- Produces: `MATCH_COL.CATEGORY = 16`; `Matches.getMatchesData()` возвращает `.category` в каждой записи; `Draw.getSeededParticipants(ss, category)` (новый параметр); `Draw.createGroups()` возвращает `{ byCategory: [{category, groupsCount}], matchesAdded }`.

- [x] **Step 1: Колонка «Категория» в `initMatches` (`setup.gs`)**

Заменить `sh.getRange(1,1,1,15).setValues([[...]])` на 16 колонок:

```js
    sh.getRange(1,1,1,16).setValues([[
      "ID",
      "Раунд",
      "Стол",
      "Игрок 1",
      "Игрок 2",
      "Счет",
      "Победитель",
      "Статус",
      "Начало",
      "Окончание",
      "Примечание",
      "Счет матчей",
      "ID игрока 1",
      "ID игрока 2",
      "ID победителя",
      "Категория"
    ]]);
```

(`sh.hideColumns(13, 3)` не трогать — по-прежнему скрывает только M:O, «Категория» в P остаётся видимой.)

- [x] **Step 2: `MATCH_COL.CATEGORY` и `.category` в `getMatchesData` (`matches.gs`)**

В константе `MATCH_COL` добавить:

```js
const MATCH_COL = {
  ID: 1, ROUND: 2, TABLE: 3, PLAYER1: 4, PLAYER2: 5,
  SCORE: 6, WINNER: 7, STATUS: 8, START: 9, END: 10, NOTE: 11, PARTS: 12,
  PLAYER1_ID: 13, PLAYER2_ID: 14, WINNER_ID: 15, CATEGORY: 16
};
```

В `Matches.getMatchesData()`, в объекте, который пушится в `result`, добавить:

```js
        winnerId: data[i][MATCH_COL.WINNER_ID - 1],
        category: data[i][MATCH_COL.CATEGORY - 1] || ""
```

- [x] **Step 3: `Draw.getSeededParticipants` — фильтр по категории (`draw.gs`)**

Заменить сигнатуру и тело:

```js
  static getSeededParticipants(ss, category) {
    const sheet = Participants.getParticipantsSheet(ss);
    const data = sheet.getDataRange().getValues();
    const players = [];

    for (let i = 1; i < data.length; i++) {
      const status = data[i][10];
      const seed = data[i][9];
      const rowCategory = data[i][17] || "";
      if (status === "Снят" || status === "Дисквалифицирован" || status === "В паре") continue;
      if (seed === "" || seed === null || isNaN(Number(seed))) continue;
      if (rowCategory !== (category || "")) continue;

      players.push({ id: data[i][0], fio: data[i][1], seed: Number(seed) });
    }

    return players.sort((a, b) => a.seed - b.seed);
  }
```

- [x] **Step 4: `Draw.createGroups` — цикл по категориям внутри функции**

Заменить `Draw.createGroups()` целиком:

```js
  static createGroups() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const config = ConfigService.load();
    const groupSize = Number(config.groupSize) || CONFIG.DEFAULT_GROUP_SIZE;

    const categories = Categories.activeLabels(ss);
    const byCategory = [];

    categories.forEach(category => {
      const seeded = this.getSeededParticipants(ss, category);
      if (seeded.length === 0) return;

      const groupsCount = Math.max(1, Math.ceil(seeded.length / groupSize));
      const groups = Array.from({ length: groupsCount }, () => []);

      let dir = 1;
      let g = 0;
      seeded.forEach(player => {
        groups[g].push(player);
        if (dir === 1 && g === groupsCount - 1) dir = -1;
        else if (dir === -1 && g === 0) dir = 1;
        else g += dir;
      });

      byCategory.push({ category, groups, groupsCount });
    });

    if (byCategory.length === 0) {
      throw new DrawError("Сначала выполните «Посев» (Жеребьёвка → Посев).");
    }

    this.writeGroupsSheet(ss, byCategory);

    let matchesAdded = 0;
    byCategory.forEach(entry => {
      matchesAdded += this.generateGroupMatches(ss, entry.groups, config, entry.category);
    });

    const summary = byCategory.map(e => ({ category: e.category, groupsCount: e.groupsCount }));
    AppLog.write(
      "Группы сформированы",
      summary.map(s => `${s.category || "Общий зачёт"}: групп ${s.groupsCount}`).join("; ") +
      `, матчей группового этапа: ${matchesAdded}`
    );

    return { byCategory: summary, matchesAdded };
  }
```

- [x] **Step 5: `Draw.writeGroupsSheet` — секции по категориям**

Заменить сигнатуру и тело:

```js
  static writeGroupsSheet(ss, byCategory) {
    const sheet = Theme.findSheetByBaseName(ss, "Группы") || ss.getSheetByName("Группы");
    if (!sheet) return;

    const existingFilter = sheet.getFilter();
    if (existingFilter) existingFilter.remove();

    sheet.clear();

    let row = 1;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    byCategory.forEach(({ category, groups }) => {
      if (category) {
        sheet.getRange(row, 1).setValue(`═══ ${category} ═══`)
          .setFontWeight("bold").setBackground("#4527A0").setFontColor("#FFFFFF");
        sheet.getRange(row, 1, 1, 3).merge();
        row++;
      }

      groups.forEach((group, gi) => {
        sheet.getRange(row, 1).setValue(`Группа ${letters[gi] || gi + 1}`)
          .setFontWeight("bold").setBackground("#8E24AA").setFontColor("#FFFFFF");
        sheet.getRange(row, 1, 1, 3).merge();
        row++;

        sheet.getRange(row, 1, 1, 3).setValues([["Посев", "ФИО", "ID"]]).setFontWeight("bold");
        row++;

        group.forEach(player => {
          sheet.getRange(row, 1, 1, 3).setValues([[player.seed, player.fio, player.id]]);
          row++;
        });

        row++;
      });

      row++;
    });

    sheet.setColumnWidth(1, 70);
    sheet.setColumnWidth(2, 250);
    sheet.setColumnWidth(3, 60);
  }
```

- [x] **Step 6: `Draw.generateGroupMatches` — параметр категории, запись в конец строки**

Заменить сигнатуру на `static generateGroupMatches(ss, groups, config, category)` и в теле, в блоке `round.forEach(pair => { rows.push([...]) })`, заменить массив на:

```js
          rows.push([
            nextId, roundLabel, "", pair[0].fio, pair[1].fio,
            "", "", "Ожидает", "", "", "", "", pair[0].id, pair[1].id, "", category || ""
          ]);
```

- [ ] **Step 7: Ручная проверка**

На тестовой таблице с категориями из Task 6: запустить «Группы» → открыть «Группы» — убедиться, что видны секции-заголовки по 3 категориям, каждая со своими группами A/B/…; открыть «Матчи» — убедиться, что колонка «Категория» (последняя) заполнена у сгенерированных матчей и совпадает с категорией обоих игроков.

---

### Task 8: Плей-офф по категориям (олимпийская сетка)

**Files:**
- Modify: `tournament/matches.gs`
- Modify: `tournament/draw.gs`

**Interfaces:**
- Consumes: `Categories.activeLabels`, `Draw.getSeededParticipants(ss, category)`, `MATCH_COL.CATEGORY`.
- Produces: `Matches.getGroupStandings(category)`, `Matches.getPlayoffQualifiers(qualifyCount, category)`, `Draw.startSingleElimination()` возвращает `{ byCategory: [{category, round, matches, bracketSize, fromGroups}], skipped: string[] }`.

- [x] **Step 1: `Matches.getGroupStandings` — фильтр по категории**

```js
  static getGroupStandings(category) {
    const byGroup = {};

    this.getResults().forEach(m => {
      if ((m.category || "") !== (category || "")) return;
      const gm = String(m.round || "").match(/^(Группа [^,]+),/);
      if (!gm) return;
      const label = gm[1];
      if (!byGroup[label]) byGroup[label] = [];
      byGroup[label].push(m);
    });

    const standings = {};
    Object.keys(byGroup).forEach(label => {
      standings[label] = this.computeStandingsForMatches(byGroup[label]);
    });
    return standings;
  }
```

- [x] **Step 2: `Matches.getPlayoffQualifiers` — параметр категории**

Заменить сигнатуру `static getPlayoffQualifiers(qualifyCount)` на `static getPlayoffQualifiers(qualifyCount, category)`, первую строку тела — на `const standings = this.getGroupStandings(category);`, остальное тело не меняется.

- [x] **Step 3: `Draw.startSingleElimination` — цикл по категориям**

Заменить функцию целиком:

```js
  static startSingleElimination() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const config = ConfigService.load();
    const categories = Categories.activeLabels(ss);
    const useGroups = config.system === "GROUPS_PLAYOFF" && this.groupMatchesExist(ss);

    const matchesSheet = Theme.findSheetByBaseName(ss, "Матчи") || ss.getSheetByName("Матчи");
    const playoffSheet = Theme.findSheetByBaseName(ss, "Плей-офф") || ss.getSheetByName("Плей-офф");
    if (playoffSheet) playoffSheet.clear();

    let nextId = this.getNextMatchId(matchesSheet);
    const allRows = [];
    const summary = [];
    const skipped = [];

    categories.forEach(category => {
      const seeded = useGroups
        ? Matches.getPlayoffQualifiers(Number(config.qualify) || 1, category)
        : this.getSeededParticipants(ss, category);

      if (seeded.length < 2) {
        skipped.push(category || "Общий зачёт");
        return;
      }

      const bracketSize = this.nextPowerOfTwo(seeded.length);
      const seedOrder = this.buildSeedOrder(bracketSize);
      const bySeed = {};
      seeded.forEach(p => { bySeed[p.seed] = p; });

      const roundLabel = this.roundLabelForSize(bracketSize);
      const playoffRows = [];
      if (category) playoffRows.push([`═══ ${category} ═══`, "", "", ""]);
      playoffRows.push([useGroups ? "Сетка (по итогам групп)" : "Сетка", "", "", ""]);

      let matchesInCategory = 0;
      for (let i = 0; i < bracketSize / 2; i++) {
        const seedA = seedOrder[i * 2];
        const seedB = seedOrder[i * 2 + 1];
        const playerA = bySeed[seedA];
        const playerB = bySeed[seedB];

        if (playerA && playerB) {
          allRows.push([nextId, roundLabel, "", playerA.fio, playerB.fio, "", "", "Ожидает", "", "", "", "", playerA.id, playerB.id, "", category || ""]);
          playoffRows.push([roundLabel, playerA.fio, "vs", playerB.fio]);
          nextId++; matchesInCategory++;
        } else if (playerA && !playerB) {
          allRows.push([nextId, roundLabel, "", playerA.fio, "БАЙ", "Тех. победа", playerA.fio, "Завершен", "", "", "Проход без игры", "", playerA.id, "", playerA.id, category || ""]);
          playoffRows.push([roundLabel, playerA.fio, "БАЙ (проход)", ""]);
          nextId++; matchesInCategory++;
        } else if (playerB && !playerA) {
          allRows.push([nextId, roundLabel, "", "БАЙ", playerB.fio, "Тех. победа", playerB.fio, "Завершен", "", "", "Проход без игры", "", "", playerB.id, playerB.id, category || ""]);
          playoffRows.push([roundLabel, playerB.fio, "БАЙ (проход)", ""]);
          nextId++; matchesInCategory++;
        }
      }

      if (playoffSheet) {
        const startRow = playoffSheet.getLastRow() + 1;
        playoffSheet.getRange(startRow, 1, playoffRows.length, 4).setValues(playoffRows);
      }

      summary.push({ category, round: roundLabel, matches: matchesInCategory, bracketSize, fromGroups: useGroups });
    });

    if (allRows.length > 0 && matchesSheet) {
      const startRow = matchesSheet.getLastRow() + 1;
      matchesSheet.getRange(startRow, 1, allRows.length, allRows[0].length).setValues(allRows);
    }

    if (playoffSheet) {
      playoffSheet.getRange(1, 1, 1, 4)
        .setFontWeight("bold").setBackground("#E53935").setFontColor("#FFFFFF");
      playoffSheet.setColumnWidths(1, 4, 180);
    }

    if (summary.length === 0) {
      throw new DrawError(useGroups
        ? "Недостаточно квалифицировавшихся из групп участников ни в одной категории — доиграйте групповой этап."
        : "Нужно минимум 2 участника с проставленным посевом (в каждой категории отдельно).");
    }

    AppLog.write(
      "Олимпийская сетка",
      summary.map(s => `${s.category || "Общий зачёт"}: ${s.round}, ${s.matches} матчей`).join("; ")
    );

    return { byCategory: summary, skipped };
  }
```

- [ ] **Step 4: Ручная проверка**

На таблице из Task 7, доиграть все матчи группового этапа во всех 3 категориях (можно вручную вносить произвольные корректные счета через «Внести результат»), затем запустить «Построить сетку → Олимпийская система» → открыть «Плей-офф» — убедиться, что там 3 отдельные секции с заголовками категорий и раздельными сетками.

---

### Task 9: Швейцарская система по категориям

**Files:**
- Modify: `tournament/draw.gs`
- Modify: `tournament/matches.gs`

**Interfaces:**
- Consumes: `Categories.activeLabels`, `Draw.getSeededParticipants(ss, category)`, `MATCH_COL.CATEGORY`.
- Produces: `Draw.startSwissRound1()` → `{ byCategory, skipped }`; `Matches.startSwissNextRound()` → `{ byCategory, waiting, notStarted }`. `getSwissPlayers`/`pairSwissRound` НЕ меняются (получают уже отфильтрованные по категории строки).

- [x] **Step 1: `Draw.startSwissRound1` — цикл по категориям**

```js
  static startSwissRound1() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const categories = Categories.activeLabels(ss);

    const matchesSheet = Theme.findSheetByBaseName(ss, "Матчи") || ss.getSheetByName("Матчи");
    let nextId = this.getNextMatchId(matchesSheet);
    const allRows = [];
    const summary = [];
    const skipped = [];

    categories.forEach(category => {
      const seeded = this.getSeededParticipants(ss, category);
      if (seeded.length < 2) {
        skipped.push(category || "Общий зачёт");
        return;
      }

      const half = Math.ceil(seeded.length / 2);
      const top = seeded.slice(0, half);
      const bottom = seeded.slice(half);
      let created = 0;

      for (let i = 0; i < top.length; i++) {
        const playerA = top[i];
        const playerB = bottom[i];

        allRows.push([
          nextId, "Швейцария, тур 1", "", playerA.fio, playerB ? playerB.fio : "БАЙ",
          playerB ? "" : "Тех. победа",
          playerB ? "" : playerA.fio,
          playerB ? "Ожидает" : "Завершен",
          "", "", playerB ? "" : "Проход без игры", "",
          playerA.id, playerB ? playerB.id : "", playerB ? "" : playerA.id,
          category || ""
        ]);
        nextId++; created++;
      }

      summary.push({ category, matches: created });
    });

    if (allRows.length > 0 && matchesSheet) {
      const startRow = matchesSheet.getLastRow() + 1;
      matchesSheet.getRange(startRow, 1, allRows.length, allRows[0].length).setValues(allRows);
    }

    if (summary.length === 0) {
      throw new DrawError("Нужно минимум 2 участника с проставленным посевом (в каждой категории отдельно).");
    }

    AppLog.write("Швейцария: тур 1", summary.map(s => `${s.category || "Общий зачёт"}: ${s.matches} матчей`).join("; "));

    return { byCategory: summary, skipped };
  }
```

- [x] **Step 2: `Matches.startSwissNextRound` — цикл по категориям**

```js
  static startSwissNextRound() {
    const sheet = this.getMatchesSheet();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const categories = Categories.activeLabels(ss);
    const data = sheet.getDataRange().getValues();

    const roundNumOf = label => {
      const m = String(label).match(/тур (\d+)/);
      return m ? Number(m[1]) : 1;
    };

    const summary = [];
    const waiting = [];
    const notStarted = [];

    categories.forEach(category => {
      const swissRows = data.slice(1).filter(r =>
        String(r[MATCH_COL.ROUND - 1] || "").indexOf("Швейцария") === 0 &&
        (r[MATCH_COL.CATEGORY - 1] || "") === (category || "")
      );

      if (swissRows.length === 0) {
        notStarted.push(category || "Общий зачёт");
        return;
      }

      const currentRound = Math.max.apply(null, swissRows.map(r => roundNumOf(r[MATCH_COL.ROUND - 1])));
      const currentRoundRows = swissRows.filter(r => roundNumOf(r[MATCH_COL.ROUND - 1]) === currentRound);

      if (!currentRoundRows.every(r => r[MATCH_COL.STATUS - 1] === "Завершен")) {
        waiting.push(`${category || "Общий зачёт"} (тур ${currentRound})`);
        return;
      }

      const nextRoundLabel = `Швейцария, тур ${currentRound + 1}`;
      if (swissRows.some(r => r[MATCH_COL.ROUND - 1] === nextRoundLabel)) return;

      const players = this.getSwissPlayers(swissRows);
      if (players.length < 2) {
        waiting.push(`${category || "Общий зачёт"} (недостаточно участников)`);
        return;
      }

      const pairs = this.pairSwissRound(players);

      let nextId = Draw.getNextMatchId(sheet);
      const rows = [];
      pairs.forEach(pair => {
        if (pair.length === 1) {
          rows.push([nextId, nextRoundLabel, "", pair[0].fio, "БАЙ", "Тех. победа", pair[0].fio, "Завершен", "", "", "Проход без игры (бай)", "", pair[0].id, "", pair[0].id, category || ""]);
        } else {
          rows.push([nextId, nextRoundLabel, "", pair[0].fio, pair[1].fio, "", "", "Ожидает", "", "", "", "", pair[0].id, pair[1].id, "", category || ""]);
        }
        nextId++;
      });

      if (rows.length > 0) {
        const startRow = sheet.getLastRow() + 1;
        sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
      }

      summary.push({ category, round: nextRoundLabel, matches: rows.length });
    });

    if (summary.length === 0) {
      if (notStarted.length === categories.length) {
        throw new MatchesError('Швейцарская система ещё не запущена (Жеребьёвка → Швейцарская система).');
      }
      throw new MatchesError(`Новый тур пока не готов ни в одной категории. Ожидают завершения: ${waiting.join("; ") || "—"}.`);
    }

    AppLog.write("Швейцария: новый тур", summary.map(s => `${s.category || "Общий зачёт"}: ${s.round}, ${s.matches} матчей`).join("; "));

    return { byCategory: summary, waiting, notStarted };
  }
```

`getSwissPlayers`/`pairSwissRound` — без изменений (получают уже отфильтрованный `swissRows`).

- [ ] **Step 3: Ручная проверка**

На новой тестовой таблице с 2+ категориями: запустить «Швейцарская система» → доиграть все матчи ОДНОЙ категории (не всех) → запустить «Следующий тур швейцарки» → убедиться, что новый тур создан только для завершённой категории, а в сообщении вторая категория указана в «Ещё не готово». Доиграть вторую → повторить → убедиться, что теперь продвинулись обе.

---

### Task 10: Double elimination по категориям

**Files:**
- Modify: `tournament/draw.gs`
- Modify: `tournament/matches.gs`

**Interfaces:**
- Produces: `Draw.startDoubleElimination()` → `{ byCategory, skipped }`; `Matches.tryGenerateNextDERounds(sheet, category)` (новый параметр).

- [x] **Step 1: `Draw.startDoubleElimination` — цикл по категориям**

```js
  static startDoubleElimination() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const categories = Categories.activeLabels(ss);

    const matchesSheet = Theme.findSheetByBaseName(ss, "Матчи") || ss.getSheetByName("Матчи");
    let nextId = this.getNextMatchId(matchesSheet);
    const roundLabel = "DE WB Раунд 1";
    const allRows = [];
    const summary = [];
    const skipped = [];

    categories.forEach(category => {
      const seeded = this.getSeededParticipants(ss, category);
      if (seeded.length < 3) {
        skipped.push(category || "Общий зачёт");
        return;
      }

      const bracketSize = this.nextPowerOfTwo(seeded.length);
      const seedOrder = this.buildSeedOrder(bracketSize);
      const bySeed = {};
      seeded.forEach(p => { bySeed[p.seed] = p; });

      let created = 0;
      for (let i = 0; i < bracketSize / 2; i++) {
        const seedA = seedOrder[i * 2];
        const seedB = seedOrder[i * 2 + 1];
        const playerA = bySeed[seedA];
        const playerB = bySeed[seedB];

        if (playerA && playerB) {
          allRows.push([nextId, roundLabel, "", playerA.fio, playerB.fio, "", "", "Ожидает", "", "", "", "", playerA.id, playerB.id, "", category || ""]);
          nextId++; created++;
        } else if (playerA && !playerB) {
          allRows.push([nextId, roundLabel, "", playerA.fio, "БАЙ", "Тех. победа", playerA.fio, "Завершен", "", "", "Проход без игры", "", playerA.id, "", playerA.id, category || ""]);
          nextId++; created++;
        } else if (playerB && !playerA) {
          allRows.push([nextId, roundLabel, "", "БАЙ", playerB.fio, "Тех. победа", playerB.fio, "Завершен", "", "", "Проход без игры", "", "", playerB.id, playerB.id, category || ""]);
          nextId++; created++;
        }
      }

      summary.push({ category, round: roundLabel, matches: created, bracketSize });
    });

    if (allRows.length > 0) {
      const startRow = matchesSheet.getLastRow() + 1;
      matchesSheet.getRange(startRow, 1, allRows.length, allRows[0].length).setValues(allRows);
    }

    if (summary.length === 0) {
      throw new DrawError("Нужно минимум 3 участника с проставленным посевом для double elimination (в каждой категории отдельно).");
    }

    AppLog.write("Double elimination запущен", summary.map(s => `${s.category || "Общий зачёт"}: сетка WB ${s.bracketSize}, ${s.matches} матчей`).join("; "));

    return { byCategory: summary, skipped };
  }
```

- [x] **Step 2: `Matches.tryGenerateNextDERounds` — параметр категории**

Заменить сигнатуру на `static tryGenerateNextDERounds(sheet, category)`. В первой строке тела заменить фильтр `deRows`:

```js
    const data = sheet.getDataRange().getValues();
    const deRows = data.slice(1).filter(r =>
      String(r[MATCH_COL.ROUND - 1]).indexOf("DE ") === 0 &&
      (r[MATCH_COL.CATEGORY - 1] || "") === (category || "")
    );
```

Дальше по телу функции — в локальной функции `addRow`, оба варианта `newRows.push([...])` получают `category || ""` последним элементом:

```js
    const addRow = (label, a, b) => {
      if (a && b) {
        newRows.push([nextId, label, "", a.fio, b.fio, "", "", "Ожидает", "", "", "", "", a.id, b.id, "", category || ""]);
        nextId++;
        return true;
      } else if (a || b) {
        const w = a || b;
        newRows.push([nextId, label, "", w.fio, "БАЙ", "Тех. победа", w.fio, "Завершен", "", "", "Проход без игры", "", w.id, "", w.id, category || ""]);
        nextId++;
        return true;
      }
      return false;
    };
```

В блоке Гранд-финала заменить `sheet.getRange(startRow2, 1, 1, 15).setValues([[...]])` на 16 колонок с категорией:

```js
      const startRow2 = sheet.getLastRow() + 1;
      sheet.getRange(startRow2, 1, 1, 16).setValues([[
        Draw.getNextMatchId(sheet), "DE Гранд-финал", "", wbWinner.fio, lbWinner.fio, "", "", "Ожидает", "", "", "", "",
        wbWinner.id, lbWinner.id, "", category || ""
      ]]);
```

В блоке переигровки — аналогично, `sheet.getRange(startRow3, 1, 1, 15)` → `1, 16`, значения:

```js
        const startRow3 = sheet.getLastRow() + 1;
        sheet.getRange(startRow3, 1, 1, 16).setValues([[
          Draw.getNextMatchId(sheet), "DE Гранд-финал (реванш)", "", p1, p2, "", "", "Ожидает", "", "", "", "",
          p1Id, p2Id, "", category || ""
        ]]);
```

- [ ] **Step 3: Ручная проверка**

Отложена до Task 11 (эта функция вызывается только из `finalizeMatch`, который меняется там) — проверить оба вместе.

---

### Task 11: finalizeMatch/advancePlayoffIfReady + recalcRating по категориям

**Files:**
- Modify: `tournament/matches.gs`

**Interfaces:**
- Consumes: `MATCH_COL.CATEGORY`, `Categories.activeLabels`.
- Produces: `Matches.advancePlayoffIfReady(round, category)` (новый параметр); `Matches.recalcRating()` пишет секционированный по категориям лист «Рейтинг»; новый `Matches.computeFullRatingStats(matchList)`.

- [x] **Step 1: `finalizeMatch` — прокинуть категорию**

В `Matches.finalizeMatch(...)`, после блока установки `WINNER_ID` и перед `this.recalcRating();`, добавить:

```js
    const category = row[MATCH_COL.CATEGORY - 1] || "";
```

Заменить вызовы:

```js
    if (PLAYOFF_ROUND_ORDER.indexOf(round) !== -1) {
      advanced = this.advancePlayoffIfReady(round, category);
    } else if (String(round).indexOf("DE ") === 0) {
      advanced = this.tryGenerateNextDERounds(sheet, category);
    }
```

- [x] **Step 2: `advancePlayoffIfReady` — параметр категории и `appendToPlayoffSheet`**

```js
  static advancePlayoffIfReady(round, category) {
    const sheet = this.getMatchesSheet();
    const data = sheet.getDataRange().getValues();

    const roundRows = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][MATCH_COL.ROUND - 1] === round && (data[i][MATCH_COL.CATEGORY - 1] || "") === (category || "")) {
        roundRows.push(data[i]);
      }
    }

    if (roundRows.length === 0) return null;
    const allDone = roundRows.every(r => r[MATCH_COL.STATUS - 1] === "Завершен");
    if (!allDone) return null;

    if (round === "Финал") {
      const champion = roundRows[0][MATCH_COL.WINNER - 1];
      return { champion };
    }

    const winners = roundRows
      .map(r => ({ fio: r[MATCH_COL.WINNER - 1], id: r[MATCH_COL.WINNER_ID - 1] }))
      .filter(w => w.fio);
    if (winners.length < 2) return null;

    const nextRoundLabel = Draw.roundLabelForSize(winners.length);
    let nextId = Draw.getNextMatchId(sheet);
    const rows = [];

    for (let i = 0; i < winners.length; i += 2) {
      const a = winners[i];
      const b = winners[i + 1];
      rows.push([
        nextId, nextRoundLabel, "", a.fio, b ? b.fio : "БАЙ",
        b ? "" : "Тех. победа",
        b ? "" : a.fio,
        b ? "Ожидает" : "Завершен",
        "", "", b ? "" : "Проход без игры", "",
        a.id, b ? b.id : "", b ? "" : a.id,
        category || ""
      ]);
      nextId++;
    }

    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);

    this.appendToPlayoffSheet(nextRoundLabel, winners.map(w => w.fio), category);

    return { nextRound: nextRoundLabel, matchesCreated: rows.length };
  }
```

- [x] **Step 3: `appendToPlayoffSheet` — метка категории на каждом добавленном раунде**

```js
  static appendToPlayoffSheet(roundLabel, winners, category) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const playoffSheet = Theme.findSheetByBaseName(ss, "Плей-офф") || ss.getSheetByName("Плей-офф");
    if (!playoffSheet) return;

    const displayLabel = category ? `${category} — ${roundLabel}` : roundLabel;
    const rows = [["", "", "", ""], [displayLabel, "", "", ""]];
    for (let i = 0; i < winners.length; i += 2) {
      rows.push([displayLabel, winners[i], "vs", winners[i + 1] || "БАЙ"]);
    }

    const startRow = playoffSheet.getLastRow() + 1;
    playoffSheet.getRange(startRow, 1, rows.length, 4).setValues(rows);
  }
```

(Категория здесь только в отображаемом тексте — на сопоставление раундов в `advancePlayoffIfReady`/`getGroupStandings` не влияет, они читают из «Матчи», не из «Плей-офф».)

- [x] **Step 4: `recalcRating` — секции по категориям + вынесенный `computeFullRatingStats`**

Заменить `Matches.recalcRating()` целиком, и добавить новый метод `computeFullRatingStats`:

```js
  static recalcRating() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const results = this.getResults();

    const byCategory = {};
    results.forEach(m => {
      const cat = m.category || "";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(m);
    });

    const present = Object.keys(byCategory);
    const orderedCategories = Categories.activeLabels(ss).filter(c => present.indexOf(c) !== -1);
    present.forEach(c => { if (orderedCategories.indexOf(c) === -1) orderedCategories.push(c); });

    const sheet = Theme.findSheetByBaseName(ss, "Рейтинг") || ss.getSheetByName("Рейтинг");
    if (!sheet) return;
    sheet.clear();

    sheet.getRange(1, 1, 1, 9).setValues([[
      "ID", "Игрок", "Очки", "Победы", "Поражения", "Набрано очков", "Пропущено очков", "Партий выиграно", "Партий проиграно"
    ]]).setFontWeight("bold").setBackground("#00ACC1").setFontColor("#FFFFFF");
    sheet.setFrozenRows(1);

    let row = 2;
    orderedCategories.forEach(category => {
      const players = this.computeFullRatingStats(byCategory[category]);
      if (category) {
        sheet.getRange(row, 1).setValue(`═══ ${category} ═══`).setFontWeight("bold");
        sheet.getRange(row, 1, 1, 9).merge();
        row++;
      }
      const rows = players.map(p => [p.id, p.fio, p.points, p.wins, p.losses, p.pointsWon, p.pointsLost, p.gamesWon, p.gamesLost]);
      if (rows.length > 0) {
        sheet.getRange(row, 1, rows.length, 9).setValues(rows);
        row += rows.length;
      }
    });
  }

  // Вынесено из прежнего тела recalcRating(): полный расчёт очков/побед/
  // поражений и сырых счётчиков партий/очков по произвольному
  // подмножеству завершённых матчей — теперь по одной категории за раз.
  static computeFullRatingStats(matchList) {
    const stats = {};

    matchList.forEach(m => {
      if (!m.player1 || !m.player2) return;
      if (m.player1 === "БАЙ" || m.player2 === "БАЙ") return;

      const id1 = m.player1Id, id2 = m.player2Id;
      if (!id1 || !id2) return;

      if (!stats[id1]) stats[id1] = { fio: m.player1, wins: 0, losses: 0, points: 0, gamesWon: 0, gamesLost: 0, pointsWon: 0, pointsLost: 0, beats: new Set() };
      if (!stats[id2]) stats[id2] = { fio: m.player2, wins: 0, losses: 0, points: 0, gamesWon: 0, gamesLost: 0, pointsWon: 0, pointsLost: 0, beats: new Set() };

      const scoreMatch = String(m.score || "").match(/^(\d+)\s*[:\-]\s*(\d+)$/);
      const g1 = scoreMatch ? Number(scoreMatch[1]) : 0;
      const g2 = scoreMatch ? Number(scoreMatch[2]) : 0;

      stats[id1].gamesWon += g1; stats[id1].gamesLost += g2;
      stats[id2].gamesWon += g2; stats[id2].gamesLost += g1;

      if (m.parts) {
        String(m.parts).split(",").forEach(gamePair => {
          const gm = gamePair.trim().match(/^(\d+)\s*[:\-]\s*(\d+)$/);
          if (!gm) return;
          stats[id1].pointsWon += Number(gm[1]); stats[id1].pointsLost += Number(gm[2]);
          stats[id2].pointsWon += Number(gm[2]); stats[id2].pointsLost += Number(gm[1]);
        });
      }

      const winnerId = m.winnerId;
      const isWalkover = String(m.note || "").indexOf("Неявка:") === 0;
      const loserPoints = isWalkover ? 0 : 1;

      if (winnerId === id1) {
        stats[id1].wins++; stats[id1].points += 2;
        stats[id2].losses++; stats[id2].points += loserPoints;
        stats[id1].beats.add(id2);
      } else if (winnerId === id2) {
        stats[id2].wins++; stats[id2].points += 2;
        stats[id1].losses++; stats[id1].points += loserPoints;
        stats[id2].beats.add(id1);
      }
    });

    const players = Object.keys(stats).map(id => {
      const s = stats[id];
      return {
        id, fio: s.fio, points: s.points, wins: s.wins, losses: s.losses,
        gamesWon: s.gamesWon, gamesLost: s.gamesLost,
        gamesRatio: s.gamesLost > 0 ? s.gamesWon / s.gamesLost : s.gamesWon,
        pointsRatio: s.pointsLost > 0 ? s.pointsWon / s.pointsLost : s.pointsWon,
        pointsWon: s.pointsWon, pointsLost: s.pointsLost,
        beats: s.beats
      };
    });

    players.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (a.beats.has(b.id) && !b.beats.has(a.id)) return -1;
      if (b.beats.has(a.id) && !a.beats.has(b.id)) return 1;
      if (b.gamesRatio !== a.gamesRatio) return b.gamesRatio - a.gamesRatio;
      return b.pointsRatio - a.pointsRatio;
    });

    return players;
  }
```

- [ ] **Step 5: Ручная проверка (объединяет проверку Task 10 и 11)**

На таблице с 2+ категориями: доиграть весь групповой этап и плей-офф в обеих категориях вперемешку (не завершая одну категорию до конца перед другой) → на каждом внесённом результате проверять, что автопродвижение (`advancePlayoffIfReady`) создаёт следующий раунд только внутри своей категории, не путая пары с другой. Открыть «Рейтинг» — убедиться, что там 2 секции с заголовками категорий, и внутри каждой — верно посчитанные очки/победы. Отдельно прогнать сценарий double elimination на 3-й тестовой таблице (Task 10) — довести до чемпиона в одной категории, убедиться, что вторая категория не затронута.

---

### Task 12: Menu.gs — обновить алерты под новые сводки по категориям

**Files:**
- Modify: `tournament/menu.gs`

**Interfaces:**
- Consumes: новые формы возврата `Draw.createGroups`/`Draw.startSwissRound1`/`Matches.startSwissNextRound`/`Draw.startSingleElimination`/`Draw.startDoubleElimination` (Tasks 7-10).

- [x] **Step 1: `menu_createGroups`**

Заменить тело `try { ... }`:

```js
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
```

- [x] **Step 2: `menu_startSwiss`**

```js
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
```

- [x] **Step 3: `menu_startSwissNextRound`**

```js
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
```

- [x] **Step 4: `menu_startSingleElimination`**

```js
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
```

- [x] **Step 5: `menu_startDoubleElimination`**

```js
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
```

- [ ] **Step 6: Ручная проверка**

Повторно прогнать все сценарии из Tasks 7-10 через реальные пункты меню (не прямые вызовы функций) — убедиться, что алерты показывают разбивку по категориям и не падают на `result.byCategory` / `result.skipped` / `result.waiting` (все поля существуют в возвращаемых объектах).

---

### Task 13: Reports.gs — протокол и дипломы по категориям

**Files:**
- Modify: `tournament/reports.gs`
- Modify: `tournament/menu.gs`

**Interfaces:**
- Consumes: секционированный лист «Рейтинг» (Task 11), `m.category` из `Matches.getResults()`.
- Produces: `Reports.getStandings(ss)` возвращает записи с полем `category`; `Reports.generateFinalProtocol()`/`generateDiplomas(topN)` — по категориям.

- [x] **Step 1: `Reports.getStandings` — парсинг секций**

```js
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
```

- [x] **Step 2: `Reports.generateFinalProtocol` — секции по категориям**

Заменить функцию целиком:

```js
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

    body.appendParagraph(config.name || "Турнир").setHeading(DocumentApp.ParagraphHeading.TITLE);
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

    AppLog.write("Итоговый протокол создан", doc.getUrl());
    return { docId: doc.getId(), url: doc.getUrl() };
  }
```

- [x] **Step 3: `Reports.generateDiplomas` — по категориям**

```js
  static generateDiplomas(topN) {
    topN = topN || 3;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const config = ConfigService.load();
    const standings = this.getStandings(ss);

    if (standings.length === 0) {
      throw new ReportsError("Рейтинг пуст. Сначала сыграйте и внесите результаты матчей (Проведение → Результаты).");
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
```

- [x] **Step 4: `menu_generateDiplomas` — категория в алерте**

```js
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
```

- [ ] **Step 5: Ручная проверка**

На таблице с завершённым турниром в 2+ категориях: «🏆 Итоговый протокол» → открыть созданный Google Doc, убедиться, что в нём отдельные разделы на каждую категорию с верными таблицами. «🏆 Дипломы призёрам» → убедиться, что создано по 3 диплома на КАЖДУЮ категорию (не 3 суммарно), и в тексте диплома указана категория.

---

## Self-Review

**Покрытие спеки:** раздел 1 (данные) → Tasks 1,4,5; раздел 2 (мастер) → Task 3; раздел 3 (алгоритм) → Task 2; раздел 4 (конвейер, листы, ограничение на clear()-функции, разрешение категории для пар) → Tasks 6-10; раздел 5 (отчёты) → Task 13; раздел 6 (пары) → Task 2 Step 4/`resolveAgeGender` + Task 5 Step 4. Всё покрыто.

**Плейсхолдеров нет** — каждый шаг либо содержит готовый код, либо конкретную процедуру ручной проверки с точными действиями и ожидаемым результатом.

**Согласованность типов:** `Categories.assign(data, mixed) → Map<rowIndex, label>` используется одинаково в Task 2 (тесты) и Task 6 (`Draw.seedPlayers`). `MATCH_COL.CATEGORY = 16` вводится в Task 7 и используется без изменений в Tasks 8-11. Сигнатуры `getSeededParticipants(ss, category)`, `getGroupStandings(category)`, `getPlayoffQualifiers(qualifyCount, category)`, `advancePlayoffIfReady(round, category)`, `tryGenerateNextDERounds(sheet, category)` — везде один и тот же порядок параметров и тип (`category: string`, `""` = без категории/смешанный).
