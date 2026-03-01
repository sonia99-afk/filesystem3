// hotkeys_editor.js
// Редактирование хоткеев по двойному клику на td[data-action].
// Фиксы под macOS:
// - ⌘ Command не хранится как Meta: внутри системы это "Control" (чтобы совпадало с DEFAULTS),
//   а в UI показываем "Command".
// - CapsLock/Meta keyup на macOS иногда приходит как key="Unidentified" -> больше не ломает режим редактирования.
// - Режим редактирования никогда не "залипает": есть safety-clear на blur/visibilitychange.
//
// ВАЖНО: Shift/Alt/Ctrl/Meta — трактуем как обычные клавиши (аккорды), но на macOS:
//   Meta/OS -> Control (внутри), а визуально "Command".

(function () {
  if (typeof window === "undefined") return;

  const IS_APPLE = (() => {
    // navigator.platform устаревает, но тут норм для простого детекта.
    const p = String(navigator.platform || "");
    const ua = String(navigator.userAgent || "");
    return /Mac|iPhone|iPad|iPod/i.test(p) || /Mac OS X|iPhone|iPad|iPod/i.test(ua);
  })();

  let editingCell = null;
  let editingPressed = new Set(); // tokens currently held
  let safetyTimer = null;

  const CLICK_ACTIONS = new Set(["rangeClick", "deepClick"]);

  function isEditingNow() {
    const ae = document.activeElement;
    if (!ae) return false;
    if (ae.tagName === "INPUT" && ae.classList?.contains("edit")) return true;
    if (ae.tagName === "TEXTAREA" && ae.classList?.contains("tg-export")) return true;
    return false;
  }

  // Layout-independent tokens for letters/digits (RU layout safe):
  // KeyA -> A, Digit1 -> 1, Numpad1 -> 1
  // macOS quirks:
  // - CapsLock: keyup may be "Unidentified" => always use code when code==="CapsLock"
  // - Meta: treat as Control on Apple (Cmd)
  function normalizeKeyTokenFromEvent(e) {
    if (!e) return "";

    const code = String(e.code || "");
    const key = String(e.key || "");

    // --- Special stable-by-code keys first ---
    if (code === "CapsLock") return "CapsLock";

    // Meta by code (left/right)
    if (IS_APPLE && (code === "MetaLeft" || code === "MetaRight" || key === "Meta" || key === "OS")) {
      return "Control";
    }

    // Letters: KeyA..KeyZ
    if (code.startsWith("Key") && code.length === 4) {
      return code.slice(3).toUpperCase();
    }
    // Digits: Digit0..Digit9
    if (code.startsWith("Digit") && code.length === 6) {
      return code.slice(5);
    }
    // Numpad digits: Numpad0..Numpad9
    if (code.startsWith("Numpad") && code.length === 7 && /[0-9]/.test(code.slice(6))) {
      return code.slice(6);
    }

    // Unidentified on macOS: prefer code if it's meaningful, otherwise ignore.
    if (key === "Unidentified") {
      if (code) return code; // still stable enough to avoid "sticky" (and will be removed on keyup)
      return "";
    }

    if (!key) return "";

    if (key === " " || key === "Spacebar") return "Space";
    if (key === "Esc") return "Escape";

    // IMPORTANT: literal "+" breaks "A+B" serialization in our split("+") parsers
    if (key === "+") return "Plus";

    // Mod keys as normal keys
    if (key === "Shift") return "Shift";
    if (key === "Alt") return "Alt";
    if (key === "Control") return "Control";
    if (!IS_APPLE && (key === "Meta" || key === "OS")) return "Meta";

    if (key.length === 1) return key.toUpperCase();
    return key;
  }

  function buildChordComboFromSet(keysSet) {
    const keys = Array.from(keysSet).filter(Boolean);
    keys.sort((a, b) => String(a).localeCompare(String(b)));

    // Historical special-case: Shift + Plus stored as just "+"
    if (keys.length === 2 && keys.includes("Shift") && keys.includes("Plus")) return "+";

    return keys.join("+");
  }

  function comboFromMouseEvent(e) {
    // Click-actions: формируем как набор клавиш (Shift/Alt/Ctrl/Meta как обычные)
    const keys = [];
    if (e.shiftKey) keys.push("Shift");
    if (e.altKey) keys.push("Alt");
    // On macOS metaKey is Command => normalize to Control
    if (e.ctrlKey || e.metaKey) keys.push("Control");
    keys.push("Click");
    keys.sort((a, b) => String(a).localeCompare(String(b)));
    return keys.join("+");
  }

  function updateConflicts() {
    const conflicts = window.hotkeys?.findConflicts?.() || new Set();

    document
      .querySelectorAll("td[data-action].conflict")
      .forEach((td) => td.classList.remove("conflict"));

    document.querySelectorAll("td[data-action]").forEach((td) => {
      const action = td.dataset.action;
      if (conflicts.has(action)) td.classList.add("conflict");
    });
  }

  function prettyHotkey(v) {
    if (typeof v !== "string") return v;

    const s = v.trim();
    if (!s) return "";
    if (s === "+") return "+";

    const rawTokens = s.split("+").map(x => x.trim()).filter(Boolean);
    if (!rawTokens.length) return "";

    const prio = (t) => {
      if (t === "Control") return 1;
      if (t === "Alt") return 2;
      if (t === "Shift") return 3;
      return 4;
    };

    const tokens = [...rawTokens].sort((a, b) => {
      const pa = prio(a), pb = prio(b);
      if (pa !== pb) return pa - pb;
      return String(a).localeCompare(String(b));
    });

    const mapToken = (t) => {
      if (t === "Control") return IS_APPLE ? "Command" : "Ctrl";
      if (t === "Alt") return IS_APPLE ? "Option" : "Alt";
      if (t === "Plus") return "+";
      if (t === "ArrowUp") return "↑";
      if (t === "ArrowDown") return "↓";
      if (t === "ArrowLeft") return "←";
      if (t === "ArrowRight") return "→";
      // Click оставляем как есть
      return t;
    };

    return tokens.map(mapToken).join("+");
  }

  function setCellTextIfChanged(cell, text) {
    if (!cell) return;
    const t = String(text ?? "");
    if (cell.textContent !== t) cell.textContent = t;
  }

  function syncTableFromConfig() {
    document.querySelectorAll("td[data-action]").forEach((td) => {
      const action = td.dataset.action;
      const v = window.hotkeys?.get?.(action);
      if (typeof v === "string" && v.length) {
        const txt = prettyHotkey(v);
        if (td.textContent !== txt) td.textContent = txt;
      }
    });
    updateConflicts();
  }

  function stopSafetyTimer() {
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
  }

  function startSafetyTimer() {
    // Если по какой-то причине keyup не придёт (особенно с Cmd/CapsLock),
    // не даём UI умереть — через небольшой таймаут выйдем из режима редактирования,
    // сохранив последнюю pendingCombo (если она есть).
    stopSafetyTimer();
    safetyTimer = setTimeout(() => {
      if (!editingCell) return;
      const action = editingCell.dataset.action;
      const isClickAction = CLICK_ACTIONS.has(action);
      if (isClickAction) return;

      // Если set пуст — все ок, keyup уже обработал/обработает
      if (editingPressed.size === 0) return;

      // Safety flush: принудительно считаем "все отпущены"
      editingPressed.clear();

      const pending = editingCell.dataset.pendingCombo;
      if (pending) {
        window.hotkeys?.set?.(action, pending);
        const normalized = window.hotkeys?.get?.(action) || pending;
        setCellTextIfChanged(editingCell, prettyHotkey(normalized));
        delete editingCell.dataset.pendingCombo;
        clearEditing(false);
        updateConflicts();
      } else {
        // если ничего не нажали — просто отменим
        clearEditing(true);
        updateConflicts();
      }
    }, 1200);
  }

  function clearEditing(cancelled) {
    stopSafetyTimer();

    if (!editingCell) return;

    const action = editingCell.dataset.action;
    editingCell.classList.remove("editing");
    editingCell.classList.remove("editing-click");

    if (cancelled) {
      const prev = editingCell.dataset.prevText;
      if (typeof prev === "string") {
        setCellTextIfChanged(editingCell, prev);
      } else {
        const v = window.hotkeys?.get?.(action);
        if (typeof v === "string" && v.length) setCellTextIfChanged(editingCell, prettyHotkey(v));
      }
    }

    delete editingCell.dataset.prevText;
    delete editingCell.dataset.pendingCombo;

    editingPressed.clear();
    editingCell = null;
  }

  function init() {
    syncTableFromConfig();

    document.addEventListener("dblclick", (e) => {
      const cell = e.target?.closest?.("td[data-action]");
      if (!cell) return;
      if (isEditingNow()) return;

      if (window.hotkeysMode !== "custom") {
        alert("Включите кастомный режим хоткеев, чтобы переназначать клавиши.");
        return;
      }

      if (editingCell) clearEditing(true);

      editingCell = cell;
      editingPressed = new Set();
      delete editingCell.dataset.pendingCombo;

      editingCell.dataset.prevText = editingCell.textContent;

      const action = editingCell.dataset.action;
      const isClickAction = CLICK_ACTIONS.has(action);

      editingCell.classList.add("editing");
      if (isClickAction) {
        editingCell.classList.add("editing-click");
        setCellTextIfChanged(editingCell, "Кликните мышью… (Esc — отмена)");
      } else {
        setCellTextIfChanged(editingCell, "Нажмите комбинацию… (Esc — отмена)");
      }
    });

    // KeyDown: собираем set нажатых клавиш (включая Shift/Alt/Ctrl/Meta как обычные)
    document.addEventListener(
      "keydown",
      (e) => {
        if (!editingCell) return;

        if (window.hotkeysMode !== "custom") {
          clearEditing(true);
          return;
        }

        const action = editingCell.dataset.action;
        const isClickAction = CLICK_ACTIONS.has(action);

        // Esc — отмена
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          clearEditing(true);
          updateConflicts();
          return;
        }

        // Tab в режиме редактирования не даём уводить фокус
        if (e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          return;
        }

        // В режиме click-action игнорируем клавиатуру (чтобы не мешала клику)
        if (isClickAction) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          return;
        }

        // блокируем редакторские хоткеи/навигацию страницы
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();

        // авто-repeat нам не нужен (иначе будет “дребезг”)
        if (e.repeat) return;

        const token = normalizeKeyTokenFromEvent(e);
        if (!token) return;

        editingPressed.add(token);

        const combo = buildChordComboFromSet(editingPressed);

        // Всегда сохраняем pending (даже если это одна клавиша, включая Shift/Control/etc)
        editingCell.dataset.pendingCombo = combo;

        setCellTextIfChanged(editingCell, prettyHotkey(combo || "…"));

        // анти-залипание на маке: если keyup не придёт — спасёмся
        startSafetyTimer();
      },
      true
    );

    // Mouse for click-actions
    document.addEventListener(
      "mousedown",
      (e) => {
        if (!editingCell) return;

        if (window.hotkeysMode !== "custom") {
          clearEditing(true);
          return;
        }

        const action = editingCell.dataset.action;
        if (!CLICK_ACTIONS.has(action)) return;

        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();

        const combo = comboFromMouseEvent(e);

        window.hotkeys?.set?.(action, combo);
        const normalized = window.hotkeys?.get?.(action) || combo;
        setCellTextIfChanged(editingCell, prettyHotkey(normalized));

        clearEditing(false);
        updateConflicts();
      },
      true
    );

    // KeyUp: сохраняем, когда отпущены ВСЕ клавиши (set пуст)
    document.addEventListener(
      "keyup",
      (e) => {
        if (!editingCell) return;
        if (window.hotkeysMode !== "custom") return;

        const action = editingCell.dataset.action;
        if (CLICK_ACTIONS.has(action)) return;

        const token = normalizeKeyTokenFromEvent(e);

        // Если keyup пришёл как Unidentified, normalize мог вернуть code вроде "MetaLeft"/"CapsLock" —
        // это ок: мы удалим ровно то, что добавляли на keydown (по нашим правилам).
        if (token) editingPressed.delete(token);

        // Пока аккорд еще частично удерживается — ничего не делаем (нет мигания)
        if (editingPressed.size > 0) {
          startSafetyTimer();
          return;
        }

        stopSafetyTimer();

        const pending = editingCell.dataset.pendingCombo;
        if (pending) {
          window.hotkeys?.set?.(action, pending);
          const normalized = window.hotkeys?.get?.(action) || pending;
          setCellTextIfChanged(editingCell, prettyHotkey(normalized));

          delete editingCell.dataset.pendingCombo;
          clearEditing(false);
          updateConflicts();
          return;
        }

        // fallback: показать текущее значение
        const current = window.hotkeys?.get?.(action) || "";
        setCellTextIfChanged(editingCell, prettyHotkey(current));
      },
      true
    );

    // Anti-sticky: если браузер теряет фокус/уходит вкладка — выходим из режима редактирования,
    // чтобы не блокировать хоткеи всего приложения.
    if (!window.__hkEditorAntiStickyInstalled) {
      window.__hkEditorAntiStickyInstalled = true;

      window.addEventListener("blur", () => {
        if (!editingCell) return;
        clearEditing(true);
        updateConflicts();
      });

      document.addEventListener("visibilitychange", () => {
        if (!editingCell) return;
        if (document.hidden) {
          clearEditing(true);
          updateConflicts();
        }
      });
    }

    // Reset
    const btn = document.getElementById("hotkeysResetBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        window.hotkeys?.reset?.();
        if (editingCell) clearEditing(true);
        syncTableFromConfig();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

(function () {
  const el = document.getElementById("hkModeToggle");
  if (!el) return;

  el.checked = window.hotkeysMode === "custom";

  el.addEventListener("change", () => {
    window.hotkeysMode = el.checked ? "custom" : "builtin";
  });
})();
