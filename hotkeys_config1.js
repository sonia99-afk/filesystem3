(function () {
  if (typeof window === "undefined") return;

  // Mode: "builtin" (use DEFAULTS) or "custom" (table edits call set())
  window.hotkeysMode = window.hotkeysMode || "builtin";

  // macOS uses Meta (⌘) as the primary modifier; Windows/Linux uses Ctrl.
  const IS_APPLE = (() => {
    const p = String(navigator.platform || "");
    const ua = String(navigator.userAgent || "");
    return /Mac|iPhone|iPad|iPod/i.test(p) || /Mac OS X|iPhone|iPad|iPod/i.test(ua);
  })();

  // Canonical modifier name used *inside config strings*.
  // "Mod" means Ctrl on Windows/Linux and Command on macOS.
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
    rangeUp: "Shift+Alt+Mod+ArrowUp",
    rangeDown: "Shift+Alt+Mod+ArrowDown",
    rangeClick: "Mod+Alt+Shift+Click",

    // Глубокое выделение (ветка)
    deepUp: "Shift+Mod+ArrowUp",
    deepDown: "Shift+Mod+ArrowDown",
    deepClick: "Mod+Shift+Click",

    // Прочее
    rename: "Yo", // RU layout safe alias for the ё key (Backquote)
    delete: "Backspace",

    // Undo/Redo
    undo: "Mod+Z",
    redo: "Mod+Shift+Z",
  };

  // -------- Key token normalization --------

  function normalizeKeyTokenFromString(raw) {
    const k = String(raw || "").trim();
    if (!k) return "";

    // Common aliases
    const up = k.toUpperCase();

    // Mod aliases
    if (["MOD", "CMD", "COMMAND", "META", "OS", "WIN", "WINDOWS", "CONTROL", "CTRL"].includes(up)) return "Mod";

    // Modifier aliases
    if (up === "SHIFT") return "Shift";
    if (up === "ALT" || up === "OPTION" || up === "OPT") return "Alt";

    // Click alias
    if (up === "CLICK" || up === "КЛИК") return "Click";

    // Special keys
    if (up === "ESC" || up === "ESCAPE") return "Escape";
    if (up === "DEL" || up === "DELETE") return "Delete";
    if (up === "SPACE" || up === "SPACEBAR" || k === " ") return "Space";
    if (k === "+" || up === "PLUS") return "Plus";

    // RU ё key (safe): accept "ё", "Ё", "YO", "BACKQUOTE", "`"
    if (k === "ё" || k === "Ё" || up === "YO" || up === "BACKQUOTE" || k === "`") return "Backquote";

    // Arrows
    if (up === "ARROWUP") return "ArrowUp";
    if (up === "ARROWDOWN") return "ArrowDown";
    if (up === "ARROWLEFT") return "ArrowLeft";
    if (up === "ARROWRIGHT") return "ArrowRight";

    // Enter / Backspace etc
    if (up === "ENTER") return "Enter";
    if (up === "TAB") return "Tab";
    if (up === "BACKSPACE") return "Backspace";

    // Function keys pass through
    if (/^F\d{1,2}$/.test(up)) return up;

    // Single character -> uppercase
    if (k.length === 1) return k.toUpperCase();

    // Otherwise keep as-is (e.g. Home, End, PageUp)
    return k;
  }

  function normalizeCombo(comboRaw) {
    const raw = String(comboRaw || "").trim();
    if (!raw) return "";
    if (raw === "+") return "+";

    const parts = raw.split("+").map(s => s.trim()).filter(Boolean);
    const tokens = [];
    for (const p of parts) {
      const t = normalizeKeyTokenFromString(p);
      if (!t) continue;
      tokens.push(t);
    }

    // Special-case legacy Shift+Plus -> "+"
    if (tokens.length === 2 && tokens.includes("Shift") && tokens.includes("Plus")) return "+";

    // Deduplicate
    const uniq = Array.from(new Set(tokens));

    // Stable ordering for storage: Mod, Ctrl-like, Alt, Shift, then others alpha
    const prio = (t) => {
      if (t === "Mod") return 1;
      if (t === "Alt") return 2;
      if (t === "Shift") return 3;
      return 4;
    };

    uniq.sort((a, b) => {
      const pa = prio(a), pb = prio(b);
      if (pa !== pb) return pa - pb;
      return String(a).localeCompare(String(b));
    });

    return uniq.join("+");
  }

  // -------- Pretty printing (UI only) --------

  function prettyKey(t) {
    if (t === "Mod") return IS_APPLE ? "Command" : "Ctrl";
    if (t === "Alt") return IS_APPLE ? "Option" : "Alt";
    if (t === "Backquote") return "ё";
    if (t === "Plus") return "+";
    if (t === "ArrowUp") return "↑";
    if (t === "ArrowDown") return "↓";
    if (t === "ArrowLeft") return "←";
    if (t === "ArrowRight") return "→";
    return t;
  }

  function prettyCombo(comboRaw) {
    const c = normalizeCombo(comboRaw);
    if (!c) return "";
    if (c === "+") return "+";
    return c.split("+").map(prettyKey).join("+");
  }

  // -------- Matching against a KeyboardEvent --------

  function tokenFromKeyboardEvent(e) {
    if (!e) return "";

    // Prefer code for layout-independent letters/digits
    const code = String(e.code || "");

    // Letters
    if (code.startsWith("Key") && code.length === 4) return code.slice(3).toUpperCase();

    // Digits
    if (code.startsWith("Digit") && code.length === 6) return code.slice(5);

    // Numpad digits
    if (code.startsWith("Numpad") && code.length === 7 && /[0-9]/.test(code.slice(6))) return code.slice(6);

    // RU ё key: Backquote
    if (code === "Backquote") return "Backquote";

    // Stable by code
    if (code.startsWith("Arrow")) return code;
    if (code === "Enter") return "Enter";
    if (code === "Backspace") return "Backspace";
    if (code === "Delete") return "Delete";
    if (code === "Escape") return "Escape";
    if (code === "Space") return "Space";
    if (code === "Tab") return "Tab";

    // Fallback by key
    const key = String(e.key || "");
    if (!key || key === "Unidentified") return "";

    if (key === " " || key === "Spacebar") return "Space";
    if (key === "Esc") return "Escape";
    if (key === "+") return "Plus";

    if (key.length === 1) return key.toUpperCase();
    return key;
  }

  function comboFromKeyboardEvent(e) {
    // Ignore pure modifier presses — we want a meaningful chord.
    const keyToken = tokenFromKeyboardEvent(e);
    if (!keyToken) return "";

    // If the key itself is a modifier, do not create combos like "Mod" alone.
    if (keyToken === "Shift" || keyToken === "Alt" || keyToken === "Control" || keyToken === "Meta") return "";

    const tokens = [];

    const modDown = IS_APPLE ? !!e.metaKey : !!e.ctrlKey;
    if (modDown) tokens.push("Mod");
    if (e.altKey) tokens.push("Alt");
    if (e.shiftKey) tokens.push("Shift");

    tokens.push(keyToken);

    return normalizeCombo(tokens.join("+"));
  }

  function matchEvent(action, e) {
    const want = current[action];
    if (!want) return false;

    // Allow actions bound to single keys (e.g. ArrowUp)
    // We still treat Mod/Shift/Alt as modifiers, not chord members.
    const have = comboFromKeyboardEvent(e);
    if (!have) return false;

    return have === want;
  }

  // -------- Storage --------

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
    const map = new Map();
    const conflicts = new Set();

    for (const [action, comboRaw] of Object.entries(current)) {
      const combo = normalizeCombo(comboRaw);
      if (!combo) continue;
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
    prettyCombo,
    prettyKey,
    set,
    get,
    getAll,
    reset,
    findConflicts,
    matchEvent,
    // exposed for debugging
    _IS_APPLE: IS_APPLE,
  };
})();
