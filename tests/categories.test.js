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
  const header = new Array(19).fill("");
  const rows = [header];
  specs.forEach((s, i) => {
    const row = new Array(19).fill("");
    row[0] = s.id !== undefined ? s.id : i + 1;               // ID
    row[1] = s.fio || `Игрок ${i + 1}`;                        // ФИО
    row[2] = s.age !== undefined ? birthDateForAge(s.age) : "";// Дата рождения
    row[10] = s.status || "Зарегистрирован";                   // Статус
    row[14] = s.participant1Id || "";                           // ID участника 1 (пара)
    row[16] = s.gender || "";                                   // Пол
    row[18] = s.override || "";                                 // Категория (вручную)
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
  // Не deepEqual целиком: объект создан в отдельном vm-контексте, у
  // него другой Object.prototype той же "формы" — сравниваем поля.
  assert.equal(resolved.age, 25);
  assert.equal(resolved.gender, "Мужской");
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

test('assignCategories: ребёнок и взрослый без подростков сливаются через пустую среднюю группу', () => {
  const entries = [
    { rowIndex: 1, age: 9, gender: "Мужской" },
    { rowIndex: 2, age: 30, gender: "Женский" }
  ];
  const result = Categories.assignCategories(entries);
  const labels = new Set(Array.from(result.values()));
  // Подростков в выборке нет вообще — соседняя корзина для ребёнка
  // не "Подростки" (её не существует), а "Взрослые" через одну группу.
  assert.equal(labels.size, 1);
  assert.equal(labels.has("Дети и взрослые"), true);
});

test('assign: ручное переопределение категории игнорирует автоматический расчёт', () => {
  const data = makeRows([
    { age: 16, gender: "Женский", override: "Взрослые (Ж)" }, // подросток, но вручную отнесена к взрослым
    { age: 30, gender: "Женский" },
    { age: 30, gender: "Женский" },
    { age: 30, gender: "Женский" }
  ]);
  const result = Categories.assign(data, false);
  assert.equal(result.get(1), "Взрослые (Ж)");
  // Остальные 3 взрослые женщины — ниже порога (3 < 4), без переопределённой
  // 16-летней их корзина сливается сама по себе (Взрослые, без гендера)
  assert.equal(result.get(2), "Взрослые");
  assert.equal(result.get(3), "Взрослые");
  assert.equal(result.get(4), "Взрослые");
});

test('assign: переопределение у строки-пары резолвится через участника 1', () => {
  const data = makeRows([
    { id: 101, age: 16, gender: "Женский", status: "В паре", override: "Взрослые (Ж)" },
    { id: 102, age: 40, gender: "Мужской", status: "В паре" },
    { id: 200, participant1Id: 101, status: "Зарегистрирован" } // строка-пара, свой override пустой
  ]);
  const result = Categories.assign(data, false);
  assert.equal(result.get(3), "Взрослые (Ж)");
});

test('assignCategories: настоящее тройное слияние (по одному в каждой возрастной группе) даёт "Все"', () => {
  const entries = [
    { rowIndex: 1, age: 9, gender: "Мужской" },
    { rowIndex: 2, age: 15, gender: "Женский" },
    { rowIndex: 3, age: 30, gender: "Мужской" }
  ];
  const result = Categories.assignCategories(entries);
  const labels = new Set(Array.from(result.values()));
  assert.equal(labels.size, 1);
  assert.equal(labels.has("Все"), true);
});

// ============================================================
// parseLabel / matchExistingLabel — для опоздавшего игрока
// (Draw.addLatePlayer), см. tournament/draw.gs
// ============================================================

// Set-ы, созданные внутри загруженного .gs-файла, живут в отдельном vm-контексте
// и не reference-equal со Set из этого файла — сравниваем через отсортированный массив.
function agesOf(parsed) {
  return Array.from(parsed.ages).sort();
}

test('parseLabel: разбирает гендерную категорию', () => {
  const a = Categories.parseLabel("Взрослые (М)");
  assert.deepEqual(agesOf(a), ["ADULT"]);
  assert.equal(a.gender, "Мужской");

  const b = Categories.parseLabel("Дети (Ж)");
  assert.deepEqual(agesOf(b), ["CHILD"]);
  assert.equal(b.gender, "Женский");
});

test('parseLabel: разбирает объединённую категорию без пола', () => {
  const parsed = Categories.parseLabel("Дети и подростки");
  assert.deepEqual(agesOf(parsed), ["CHILD", "TEEN"]);
  assert.equal(parsed.gender, null);
});

test('parseLabel: "Все" покрывает все возрастные группы', () => {
  const parsed = Categories.parseLabel("Все");
  assert.deepEqual(agesOf(parsed), ["ADULT", "CHILD", "TEEN"]);
  assert.equal(parsed.gender, null);
});

test('parseLabel: нестандартная метка (ручной override) не распознаётся', () => {
  assert.equal(Categories.parseLabel("Ветераны 50+"), null);
});

test('matchExistingLabel: находит гендерную категорию по возрасту и полу', () => {
  const labels = ["Взрослые (М)", "Взрослые (Ж)"];
  assert.equal(Categories.matchExistingLabel(labels, 30, "Женский"), "Взрослые (Ж)");
});

test('matchExistingLabel: если гендерной нет — берёт объединённую категорию того же возраста', () => {
  const labels = ["Дети и подростки", "Взрослые (М)", "Взрослые (Ж)"];
  assert.equal(Categories.matchExistingLabel(labels, 10, "Женский"), "Дети и подростки");
});

test('matchExistingLabel: ничего не подходит по возрасту — null', () => {
  const labels = ["Взрослые (М)", "Взрослые (Ж)"];
  assert.equal(Categories.matchExistingLabel(labels, 10, "Мужской"), null);
});
