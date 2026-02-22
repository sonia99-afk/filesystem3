// hotkeys_config.js
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
    rangeUp: "Shift+Alt+Ctrl/Cmd+ArrowUp",
    rangeDown: "Shift+Alt+Ctrl/Cmd+ArrowDown",
    rangeClick: "Ctrl/Cmd+Alt+Shift+Click",

    // Глубокое выделение (ветка)
    deepUp: "Shift+Ctrl/Cmd+ArrowUp",
    deepDown: "Shift+Ctrl/Cmd+ArrowDown",
    deepClick: "Ctrl/Cmd+Shift+Click",

    // Прочее
    rename: "ё",
    delete: "Backspace",

    undo: "Ctrl/Cmd+X",
    redo: "Ctrl/Cmd+Shift+X",
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
    if (k === "Backspace") return "Backspace";
    if (k === " " || k === "Spacebar") return "Space";
if (k === "Space") return "Space";
    return k.length === 1 ? k.toUpperCase() : k;
  }

  function normalizeCombo(comboRaw) {
    const raw = String(comboRaw || "").trim();
    if (!raw) return "";
    if (raw === "+") return "+";

    const parts = raw.split("+").map(s => s.trim()).filter(Boolean);

    const mods = { Ctrl: false, Cmd: false, Alt: false, Shift: false, CtrlCmd: false };
    const other = [];

    for (const p of parts) {
      const up = p.toUpperCase();
      if (up === "CTRL") mods.Ctrl = true;
      else if (up === "CMD" || up === "META") mods.Cmd = true;
      else if (up === "ALT") mods.Alt = true;
      else if (up === "SHIFT") mods.Shift = true;
      else if (up === "CTRL/CMD") mods.CtrlCmd = true;
      else other.push(p);
    }

    // Shift++ -> "+"
    if (other.length === 1 && other[0] === "+" && mods.Shift && !mods.Ctrl && !mods.Cmd && !mods.Alt && !mods.CtrlCmd) {
      return "+";
    }

    const normalizedOther = other.map((x) => {
      if (x === "Клик") return "Click";
      return normalizeKeyName(x);
    });

    const out = [];
    // Важно: Ctrl/Cmd как "общий" токен
    if (mods.CtrlCmd) out.push("Ctrl/Cmd");
    else {
      if (mods.Ctrl) out.push("Ctrl");
      if (mods.Cmd) out.push("Cmd");
    }
    if (mods.Alt) out.push("Alt");
    if (mods.Shift) out.push("Shift");
    out.push(...normalizedOther);

    return out.join("+");
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
