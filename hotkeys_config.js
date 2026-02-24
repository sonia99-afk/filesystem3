(function () {
  if (typeof window === "undefined") return;
  window.hotkeysMode = window.hotkeysMode || "builtin";

  const DEFAULTS = {
    // Добавления
    addSibling: "Enter",
    addChild: "Shift+Enter",

    // Навигация
    navUp: "ArrowUp",
    navDown: "ArrowDown",
    navLeft: "ArrowLeft",
    navRight: "ArrowRight",

    // Перемещение внутри уровня
    moveUp: "Shift+ArrowUp",
    moveDown: "Shift+ArrowDown",

    // Перемещение между уровнями
    indent: "Shift+ArrowRight",
    outdent: "Shift+ArrowLeft",

    // Диапазон (один уровень)
    rangeUp: "Shift+Alt+Control+ArrowUp",
    rangeDown: "Shift+Alt+Control+ArrowDown",
    rangeClick: "Control+Alt+Shift+Click",

    // Глубокое выделение (ветка)
    deepUp: "Shift+Control+ArrowUp",
    deepDown: "Shift+Control+ArrowDown",
    deepClick: "Control+Shift+Click",

    // Прочее
    rename: "ё",
    delete: "Backspace",

    // Undo/Redo
    undo: "Control+Z",
    redo: "Control+Shift+Z",
  };

  let current = Object.fromEntries(
    Object.entries(DEFAULTS).map(([action, combo]) => [action, normalizeCombo(combo)])
  );

  function reset() {
    current = Object.fromEntries(
      Object.entries(DEFAULTS).map(([action, combo]) => [action, normalizeCombo(combo)])
    );
  }

  function normalizeKeyName(k) {
    if (!k) return "";
    if (k === "Esc") return "Escape";
    if (k === "Del") return "Delete";
    if (k === " " || k === "Spacebar") return "Space";
    if (k === "Space") return "Space";
    if (k === "+") return "Plus";

    // ✅ Cmd/Meta/OS приравниваем к Control
    const up = String(k).toUpperCase();
    if (up === "CMD" || up === "META" || up === "OS" || up === "COMMAND") return "Control";
if (up === "CTRL" || up === "CONTROL") return "Control";
if (up === "OPTION") return "Alt";

    return k.length === 1 ? k.toUpperCase() : k;
  }

  function normalizeCombo(comboRaw) {
    const raw = String(comboRaw || "").trim();
    if (!raw) return "";
    if (raw === "+") return "+";

    const parts = raw.split("+").map(s => s.trim()).filter(Boolean);

    const normalized = parts.map((p) => {
      if (p === "Клик") return "Click";
      return normalizeKeyName(p);
    });

    normalized.sort((a, b) => String(a).localeCompare(String(b)));

    // Shift + Plus -> "+"
    if (normalized.length === 2 && normalized.includes("Shift") && normalized.includes("Plus")) {
      return "+";
    }

    return normalized.join("+");
  }

  function set(action, combo) {
    current[action] = normalizeCombo(combo);
  }

  function get(action) {
    return current[action];
  }

  function getAll() {
    return { ...current };
  }

  function findConflicts() {
    const map = new Map(); // combo -> actions[]
    const conflicts = new Set();

    for (const [action, comboRaw] of Object.entries(current)) {
      const combo = normalizeCombo(comboRaw);
      const arr = map.get(combo) || [];
      arr.push(action);
      map.set(combo, arr);
    }

    for (const actions of map.values()) {
      if (actions.length > 1) actions.forEach(a => conflicts.add(a));
    }
    return conflicts;
  }

  window.hotkeys = {
    DEFAULTS,
    normalizeCombo,
    set,
    get,
    getAll,
    reset,
    findConflicts,
  };
})();