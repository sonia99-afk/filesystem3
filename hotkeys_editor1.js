// hotkeys_editor.js
// Полный перезапуск логики редактора хоткеев без "залипания".
//
// Принципы:
// - Мы НЕ трекаем "нажатые клавиши" через Set/keyup (именно это липло на macOS).
// - Комбинация фиксируется СРАЗУ на keydown (Mod/Ctrl/Cmd + Alt + Shift + Key).
// - Mod = Ctrl (Windows/Linux) или Command (macOS).
// - Click-actions назначаются mousedown (с модификаторами).
// - Esc отменяет.
// - В режиме редактирования полностью глушим события, чтобы не ломать основное приложение.

(function () {
  if (typeof window === "undefined") return;

  const CLICK_ACTIONS = new Set(["rangeClick", "deepClick"]);

  let editingCell = null;

  function isEditingNow() {
    const ae = document.activeElement;
    if (!ae) return false;
    if (ae.tagName === "INPUT" && ae.classList?.contains("edit")) return true;
    if (ae.tagName === "TEXTAREA" && ae.classList?.contains("tg-export")) return true;
    return false;
  }

  function setCellText(cell, text) {
    if (!cell) return;
    const t = String(text ?? "");
    if (cell.textContent !== t) cell.textContent = t;
  }

  function updateConflicts() {
    const conflicts = window.hotkeys?.findConflicts?.() || new Set();

    document.querySelectorAll("td[data-action].conflict")
      .forEach(td => td.classList.remove("conflict"));

    document.querySelectorAll("td[data-action]").forEach(td => {
      const action = td.dataset.action;
      if (conflicts.has(action)) td.classList.add("conflict");
    });
  }

  function syncTableFromConfig() {
    document.querySelectorAll("td[data-action]").forEach(td => {
      const action = td.dataset.action;
      const v = window.hotkeys?.get?.(action) || "";
      if (v) setCellText(td, window.hotkeys.prettyCombo(v));
    });
    updateConflicts();
  }

  function clearEditing(cancelled) {
    if (!editingCell) return;

    const action = editingCell.dataset.action;
    editingCell.classList.remove("editing");
    editingCell.classList.remove("editing-click");

    if (cancelled) {
      const prev = editingCell.dataset.prevText;
      if (typeof prev === "string") {
        setCellText(editingCell, prev);
      } else {
        const v = window.hotkeys?.get?.(action) || "";
        setCellText(editingCell, window.hotkeys.prettyCombo(v));
      }
    }

    delete editingCell.dataset.prevText;
    editingCell = null;
  }

  function beginEditing(cell) {
    if (!cell) return;

    if (window.hotkeysMode !== "custom") {
      alert("Включите кастомный режим хоткеев, чтобы переназначать клавиши.");
      return;
    }

    if (editingCell) clearEditing(true);

    editingCell = cell;
    editingCell.dataset.prevText = editingCell.textContent;

    const action = editingCell.dataset.action;
    const isClickAction = CLICK_ACTIONS.has(action);

    editingCell.classList.add("editing");
    if (isClickAction) {
      editingCell.classList.add("editing-click");
      setCellText(editingCell, "Кликните мышью… (Esc — отмена)");
    } else {
      setCellText(editingCell, "Нажмите комбинацию… (Esc — отмена)");
    }
  }

  function comboFromMouseEvent(e) {
    // Mod = Ctrl on Win/Linux, Cmd on mac; but we store as "Mod".
    const keys = [];
    const isApple = !!window.hotkeys?._IS_APPLE;

    const modDown = isApple ? !!e.metaKey : !!e.ctrlKey;
    if (modDown) keys.push("Mod");
    if (e.altKey) keys.push("Alt");
    if (e.shiftKey) keys.push("Shift");

    keys.push("Click");
    return window.hotkeys.normalizeCombo(keys.join("+"));
  }

  function commitCombo(action, combo) {
    window.hotkeys?.set?.(action, combo);
    const normalized = window.hotkeys?.get?.(action) || combo;
    setCellText(editingCell, window.hotkeys.prettyCombo(normalized));
    clearEditing(false);
    updateConflicts();
  }

  function init() {
    syncTableFromConfig();

    document.addEventListener("dblclick", (e) => {
      const cell = e.target?.closest?.("td[data-action]");
      if (!cell) return;
      if (isEditingNow()) return;
      beginEditing(cell);
    });

    // Keyboard assignment: фиксируем на keydown (без keyup/Set).
    document.addEventListener("keydown", (e) => {
      if (!editingCell) return;

      // пока редактируем — блокируем всё, чтобы не стреляли хоткеи приложения
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();

      if (window.hotkeysMode !== "custom") {
        clearEditing(true);
        return;
      }

      const action = editingCell.dataset.action;
      if (CLICK_ACTIONS.has(action)) return; // click-actions ждут мышь

      // Esc — отмена
      if (e.key === "Escape" || e.key === "Esc") {
        clearEditing(true);
        updateConflicts();
        return;
      }

      // Tab — не уводим фокус
      if (e.key === "Tab") return;

      // Авто-repeat не нужен
      if (e.repeat) return;

      const combo = window.hotkeys?.normalizeCombo?.(window.hotkeys?.matchEvent ? window.hotkeys.normalizeCombo(window.hotkeys.comboFromKeyboardEvent?.(e) || "") : "");
      // comboFromKeyboardEvent мы не экспортировали; поэтому соберём так же, как matchEvent.

      const isApple = !!window.hotkeys?._IS_APPLE;
      const modDown = isApple ? !!e.metaKey : !!e.ctrlKey;

      // tokenFromKeyboardEvent — приватен в config, но его результат нужен тут.
      // Поэтому повторим минимум логики: через code для букв/цифр/стрелок/Backquote.
      const code = String(e.code || "");
      let keyToken = "";
      if (code.startsWith("Key") && code.length === 4) keyToken = code.slice(3).toUpperCase();
      else if (code.startsWith("Digit") && code.length === 6) keyToken = code.slice(5);
      else if (code.startsWith("Numpad") && code.length === 7 && /[0-9]/.test(code.slice(6))) keyToken = code.slice(6);
      else if (code === "Backquote") keyToken = "Backquote";
      else if (code.startsWith("Arrow")) keyToken = code;
      else if (code === "Enter") keyToken = "Enter";
      else if (code === "Backspace") keyToken = "Backspace";
      else if (code === "Delete") keyToken = "Delete";
      else if (code === "Escape") keyToken = "Escape";
      else if (code === "Space") keyToken = "Space";
      else if (code === "Tab") keyToken = "Tab";
      else {
        const key = String(e.key || "");
        if (!key || key === "Unidentified") keyToken = "";
        else if (key === " " || key === "Spacebar") keyToken = "Space";
        else if (key === "+") keyToken = "Plus";
        else if (key.length === 1) keyToken = key.toUpperCase();
        else keyToken = key;
      }

      // Не даём назначать "пустые" или чистые модификаторы.
      if (!keyToken) return;
      if (["Shift", "Alt", "Control", "Meta"].includes(keyToken)) return;

      const tokens = [];
      if (modDown) tokens.push("Mod");
      if (e.altKey) tokens.push("Alt");
      if (e.shiftKey) tokens.push("Shift");
      tokens.push(keyToken);

      const normalized = window.hotkeys.normalizeCombo(tokens.join("+"));
      commitCombo(action, normalized);
    }, true);

    // Mouse assignment for click-actions
    document.addEventListener("mousedown", (e) => {
      if (!editingCell) return;

      // блокируем клики в фоне
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();

      if (window.hotkeysMode !== "custom") {
        clearEditing(true);
        return;
      }

      const action = editingCell.dataset.action;
      if (!CLICK_ACTIONS.has(action)) return;

      const normalized = comboFromMouseEvent(e);
      commitCombo(action, normalized);
    }, true);

    // Hard exit: потеря фокуса / уход со вкладки
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

    // Reset button
    const btn = document.getElementById("hotkeysResetBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        window.hotkeys?.reset?.();
        if (editingCell) clearEditing(true);
        syncTableFromConfig();
      });
    }

    // initial conflicts
    updateConflicts();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

// Toggle custom/builtin
(function () {
  const el = document.getElementById("hkModeToggle");
  if (!el) return;

  el.checked = window.hotkeysMode === "custom";

  el.addEventListener("change", () => {
    window.hotkeysMode = el.checked ? "custom" : "builtin";
  });
})();
