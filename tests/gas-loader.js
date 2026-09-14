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

  // Top-level `class`/`const` не становятся собственными свойствами
  // объекта контекста (в отличие от `var`) — они живут в лексическом
  // окружении, общем для всех runInContext-вызовов на этом контексте.
  // Прокси резолвит такие имена, вычисляя их прямо внутри контекста.
  return new Proxy(context, {
    get(target, prop) {
      if (typeof prop === "symbol" || prop in target) return target[prop];
      try {
        return vm.runInContext(String(prop), context);
      } catch (e) {
        return undefined;
      }
    }
  });
}

module.exports = { loadGasFiles };
