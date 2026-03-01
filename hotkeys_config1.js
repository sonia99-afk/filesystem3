(function () {
  if (typeof window === "undefined") return;

  // Public mode flag used by app/editor to lock interactions
  window.hotkeysMode = window.hotkeysMode || "builtin";

  // Detect Apple platforms (macOS / iOS / iPadOS). Used only for UI-pretty printing.
  const IS_APPLE = (() => {
    try {
      const p = String(navigator.platform || "");
      const ua = String(navigator.userAgent || "");
      return /Mac|iPhone|iPad|iPod/.test(p) || /Mac OS X|iPhone|iPad|iPod/.test(ua);
    } catch (_) {
      return false;
    }
  })();

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

  // Internal canonical mapping.
  // IMPORTANT:
  //  - We keep the internal canonical modifier name as "Control".
  //  - On macOS, the app/editor remaps ⌘ (Meta) -> "Control" at event-level.
  //  - Here, we normalize any textual aliases (Cmd/Meta/Command/OS/Ctrl) -> "Control".

  function normalizeKeyName(k) {
    if (!k) return "";

    // Some sources may pass non-string tokens
    const raw = String(k).trim();
    if (!raw) return "";

    // Drop garbage tokens that can appear on macOS (e.g. on CapsLock keyup)
    // If such token is kept, it can create non-releasable combos and break editing.
    if (raw === "Unidentified") return "";

    // Common aliases
    if (raw === "Esc") return "Escape";
    if (raw === "Del") return "Delete";
    if (raw === " " || raw === "Spacebar") return "Space";
    if (raw === "Space") return "Space";
    if (raw === "+") return "Plus";

    // Russian UI sometimes gives this
    if (raw === "Клик" || raw === "клик") return "Click";

    const up = raw.toUpperCase();

    // Canonicalize modifiers / platform keys
    // - "Control" is the canonical internal token.
    // - Cmd/Meta/OS/Win/Command are treated as the same modifier.
    if (
      up === "CTRL" ||
      up === "CONTROL" ||
      up === "CMD" ||
      up === "COMMAND" ||
      up === "META" ||
      up === "OS" ||
      up === "WIN" ||
      up === "WINDOWS"
    ) {
      return "Control";
    }

    // Option key on mac is Alt in KeyboardEvent (key="Alt").
    // If user types "Option", normalize to Alt.
    if (up === "OPTION") return "Alt";

    // Keep standard modifier names
    if (raw === "Shift") return "Shift";
    if (raw === "Alt") return "Alt";

    // Keep CapsLock stable as a named key
    if (up === "CAPSLOCK") return "CapsLock";

    // Single character keys: normalize to uppercase
    if (raw.length === 1) return raw.toUpperCase();

    return raw;
  }

  function normalizeCombo(comboRaw) {
    const raw = String(comboRaw || "").trim();
    if (!raw) return "";

    // Special-case: Shift + Plus -> "+"
    if (raw === "+") return "+";

    const parts = raw
      .split("+")
      .map((s) => s.trim())
      .filter(Boolean);

    const normalized = [];
    for (const p of parts) {
      const nk = normalizeKeyName(p);
      if (nk) normalized.push(nk);
    }

    // If everything got normalized away (e.g. only Unidentified)
    if (!normalized.length) return "";

    normalized.sort((a, b) => String(a).localeCompare(String(b)));

    if (normalized.length === 2 && normalized.includes("Shift") && normalized.includes("Plus")) {
      return "+";
    }

    return normalized.join("+");
  }

  function prettyKey(token) {
    // Purely for UI: does NOT affect matching.
    if (!token) return "";
    if (token === "Control") return IS_APPLE ? "Command" : "Ctrl";
    if (token === "Alt") return IS_APPLE ? "Option" : "Alt";
    return token;
  }

  function prettyCombo(comboRaw) {
    const c = normalizeCombo(comboRaw);
    if (!c) return "";
    if (c === "+") return "+";
    const parts = c.split("+").filter(Boolean);
    return parts.map(prettyKey).join("+");
  }

  let current = Object.fromEntries(
    Object.entries(DEFAULTS).map(([action, combo]) => [action, normalizeCombo(combo)])
  );

  function reset() {
    current = Object.fromEntries(
      Object.entries(DEFAULTS).map(([action, combo]) => [action, normalizeCombo(combo)])
    );
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
      if (!combo) continue;
      const arr = map.get(combo) || [];
      arr.push(action);
      map.set(combo, arr);
    }

    for (const actions of map.values()) {
      if (actions.length > 1) actions.forEach((a) => conflicts.add(a));
    }
    return conflicts;
  }

  window.hotkeys = {
    DEFAULTS,
    normalizeKeyName,
    normalizeCombo,
    prettyKey,
    prettyCombo,
    set,
    get,
    getAll,
    reset,
    findConflicts,
  };
})();
