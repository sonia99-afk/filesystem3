// hotkeys_editor.js
// Редактирование хоткеев по двойному клику на td[data-action].
// - Esc всегда корректно отменяет (возвращает прежний текст ячейки)
// - Click-actions (rangeClick/deepClick) назначаются кликом мыши
// - Конфликты подсвечиваются красным бордером
// - Сохранение: на отпускание ВСЕХ клавиш (keyup когда set пуст)
// ВАЖНО: Shift/Alt/Ctrl/Meta — обычные клавиши, не "модификаторы".

(function () {
  if (typeof window === "undefined") return;

  let editingCell = null;
  let editingPressed = new Set();

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
  function normalizeKeyTokenFromEvent(e) {
    if (!e) return "";
    const code = String(e.code || "");

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

    // Fallback: use e.key for special keys / modifiers
    const key = e.key;
    if (!key) return "";

    if (key === " " || key === "Spacebar") return "Space";
    if (key === "Esc") return "Escape";

    // IMPORTANT: literal "+" breaks "A+B" serialization in our split("+") parsers
    if (key === "+") return "Plus";

    // Mod keys as normal keys
    if (key === "Shift") return "Shift";
    if (key === "Alt") return "Alt";
    if (key === "Control") return "Control";
    if (key === "Meta" || key === "OS") return "Control";

    if (key.length === 1) return key.toUpperCase();
    return key;
  }

  function buildChordComboFromSet(keysSet) {
    const keys = Array.from(keysSet);
    keys.sort((a, b) => String(a).localeCompare(String(b)));

    // Historical special-case: Shift + "+" stored as just "+"
    // Теперь Shift — обычная клавиша, но этот кейс оставим:
    // если хоткей ровно "Shift"+"Plus" -> сохраним как "+"
    if (keys.length === 2 && keys.includes("Shift") && keys.includes("Plus")) return "+";

    return keys.join("+");
  }

  function comboFromMouseEvent(e) {
    // Click-actions: формируем как набор клавиш (Shift/Control/Alt/Meta как обычные)
    const keys = [];
    if (e.shiftKey) keys.push("Shift");
    if (e.altKey) keys.push("Alt");
    if (e.ctrlKey || e.metaKey) keys.push("Control");
    keys.push("Click");
    keys.sort((a, b) => String(a).localeCompare(String(b)));
    return keys.join("+");
  }

  function updateConflicts() {
    const conflicts = hotkeys.findConflicts();

    document
      .querySelectorAll("td[data-action].conflict")
      .forEach((td) => td.classList.remove("conflict"));

    document.querySelectorAll("td[data-action]").forEach((td) => {
      const action = td.dataset.action;
      if (conflicts.has(action)) td.classList.add("conflict");
    });
  }

  // hotkeys_editor.js
// Заменить текущую prettyHotkey(v) на эту версию

function prettyHotkey(v) {
  if (typeof v !== "string") return v;

  // 1) Спец-кейс: исторический "+"
  // (у тебя уже есть логика, где Shift+Plus превращается в "+")
  // Если сюда пришло просто "+", оставляем как есть.
  if (v.trim() === "+") return "+";

  // 2) Разбиваем на токены (ожидаем формат "A+B+C")
  const rawTokens = v.split("+").map(s => s.trim()).filter(Boolean);
  if (!rawTokens.length) return "";

  // 3) Приоритет для отображения: Ctrl -> Alt -> Shift -> остальное
  const prio = (t) => {
    if (t === "Control") return 1;
    if (t === "Alt") return 2;
    if (t === "Shift") return 3;
    return 4;
  };

  // 4) Внутри "остального" можно оставить стабильную сортировку по алфавиту
  // (чтобы ArrowUp/Click/Enter и т.п. не прыгали)
  const tokens = [...rawTokens].sort((a, b) => {
    const pa = prio(a), pb = prio(b);
    if (pa !== pb) return pa - pb;
    return String(a).localeCompare(String(b));
  });

  // 5) Display-замены (ТОЛЬКО визуально)
  const mapToken = (t) => {
    if (t === "Control") return "Ctrl";   // как ты хочешь
    if (t === "Plus") return "+";         // на всякий случай
    if (t === "ArrowUp") return "↑";
    if (t === "ArrowDown") return "↓";
    if (t === "ArrowLeft") return "←";
    if (t === "ArrowRight") return "→";
    // Click оставляем "Click" как ты просил
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
      const v = hotkeys.get(action);
      if (typeof v === "string" && v.length) {
        const txt = prettyHotkey(v);
        if (td.textContent !== txt) td.textContent = txt;
      }
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
        setCellTextIfChanged(editingCell, prev);
      } else {
        const v = hotkeys.get(action);
        if (typeof v === "string" && v.length) setCellTextIfChanged(editingCell, prettyHotkey(v));
      }
    }

    delete editingCell.dataset.prevText;
    delete editingCell.dataset.pendingCombo;
    editingPressed = new Set();
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

        hotkeys.set(action, combo);
        const normalized = hotkeys.get(action) || combo;
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
        if (token) editingPressed.delete(token);

        // Пока аккорд еще частично удерживается — ничего не перерисовываем (нет мигания)
        if (editingPressed.size > 0) return;

        const pending = editingCell.dataset.pendingCombo;
        if (pending) {
          hotkeys.set(action, pending);
          const normalized = hotkeys.get(action) || pending;
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

    if (!window.__hkEditorAntiStickyInstalled) {
      window.__hkEditorAntiStickyInstalled = true;
    
      window.addEventListener("blur", () => {
        if (!editingCell) return;
        editingPressed.clear();
      });
    
      document.addEventListener("visibilitychange", () => {
        if (!editingCell) return;
        if (document.hidden) editingPressed.clear();
      });
    }

    // Reset
    const btn = document.getElementById("hotkeysResetBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        hotkeys.reset();
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