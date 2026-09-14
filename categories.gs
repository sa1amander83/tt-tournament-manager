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

  // Строка, из которой реально берутся возраст/пол/переопределение
  // категории: своя собственная, а для строки-пары — участник 1
  // (сама строка пары эти данные не хранит).
  static resolveSourceRow(data, rowIndex) {
    const row = data[rowIndex];
    const participant1Id = row[14];
    if (participant1Id === "" || participant1Id === null || participant1Id === undefined) {
      return row;
    }
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(participant1Id)) return data[i];
    }
    return row;
  }

  // Возраст/пол для строки: свои собственные, а для строки-пары —
  // взятые у участника 1 (сама строка пары дату рождения/пол не хранит).
  static resolveAgeGender(data, rowIndex) {
    const sourceRow = this.resolveSourceRow(data, rowIndex);
    const birthDate = sourceRow[2];
    const gender = sourceRow[16];
    const age = Participants.calcAge(birthDate);
    if (age === "" || !gender) return null;

    return { age, gender };
  }

  // Ручное переопределение категории (столбец "Категория (вручную)") —
  // организатор может явно указать категорию для пограничных случаев
  // (например, 16-летнюю отнести к "Взрослые (Ж)", а не к "Подростки"),
  // не трогая сам алгоритм слияния. Пустое значение — override не задан.
  // Для строки-пары читается так же, из участника 1.
  static resolveCategoryOverride(data, rowIndex) {
    const sourceRow = this.resolveSourceRow(data, rowIndex);
    const value = String(sourceRow[18] || "").trim();
    return value || null;
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

    const result = new Map();
    const entries = [];
    eligible.forEach(i => {
      const override = this.resolveCategoryOverride(data, i);
      if (override) { result.set(i, override); return; }

      const resolved = this.resolveAgeGender(data, i);
      if (resolved) entries.push({ rowIndex: i, age: resolved.age, gender: resolved.gender });
    });

    this.assignCategories(entries).forEach((label, rowIndex) => result.set(rowIndex, label));
    return result;
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

        // Ближайший СТАРШИЙ сосед по возрасту (не обязательно соседний
        // индекс — промежуточная возрастная группа может быть пустой,
        // если в ней вообще нет участников); если такого нет — ближайший
        // младший.
        let targetIdx = -1;
        let bestDist = Infinity;
        cells.forEach((c, j) => {
          if (j === i) return;
          const cMin = Math.min.apply(null, c.ages);
          if (cMin > maxAge && (cMin - maxAge) < bestDist) {
            bestDist = cMin - maxAge;
            targetIdx = j;
          }
        });
        if (targetIdx === -1) {
          bestDist = Infinity;
          cells.forEach((c, j) => {
            if (j === i) return;
            const cMax = Math.max.apply(null, c.ages);
            if (cMax < minAge && (minAge - cMax) < bestDist) {
              bestDist = minAge - cMax;
              targetIdx = j;
            }
          });
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
   * Разбирает метку категории (как её строит labelFor в assignCategories)
   * обратно в набор возрастных групп и пол — нужно, чтобы для
   * опоздавшего игрока найти, в какую из УЖЕ СУЩЕСТВУЮЩИХ категорий
   * он попадает, не пересчитывая категории всех остальных участников
   * (это раскидало бы уже сформированные группы).
   * Возвращает { ages: Set<"CHILD"|"TEEN"|"ADULT">, gender: "Мужской"|"Женский"|null }
   * или null, если метка не распознана (нестандартная "Категория (вручную)").
   */
  static parseLabel(label) {
    let base = String(label || "").trim();
    let gender = null;
    if (base.endsWith("(М)")) { gender = "Мужской"; base = base.slice(0, -3).trim(); }
    else if (base.endsWith("(Ж)")) { gender = "Женский"; base = base.slice(0, -3).trim(); }

    if (base === "Все") {
      return { ages: new Set(AGE_ORDER), gender };
    }

    const names = base.indexOf(" и ") !== -1 ? base.split(" и ") : [base];
    const ages = new Set();
    for (const rawName of names) {
      const name = rawName.trim();
      const key = AGE_ORDER.find(k => AGE_KEYS_TO_LABEL[k].toLowerCase() === name.toLowerCase());
      if (!key) return null; // нестандартное имя — не распознали
      ages.add(key);
    }
    return { ages, gender };
  }

  /**
   * Находит среди уже существующих меток категорий ту, которая
   * покрывает возраст/пол опоздавшего игрока. Предпочитает метку с
   * точным совпадением пола (гендерная категория), иначе — метку без
   * пола (объединённая). Возвращает null, если подходящей нет.
   */
  static matchExistingLabel(existingLabels, age, gender) {
    const ageGroup = this.ageGroupOf(age);
    let fallback = null;

    for (const label of existingLabels) {
      const parsed = this.parseLabel(label);
      if (!parsed || !parsed.ages.has(ageGroup)) continue;
      if (parsed.gender === gender) return label;
      if (parsed.gender === null) fallback = label;
    }
    return fallback;
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
