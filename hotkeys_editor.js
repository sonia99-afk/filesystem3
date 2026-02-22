// hotkeys_editor.js
// Редактирование хоткеев по двойному клику на td[data-action].
// - Esc всегда корректно отменяет (возвращает прежний текст ячейки)
// - Click-actions (rangeClick/deepClick) назначаются кликом мыши
// - Конфликты подсвечиваются красным бордером

(function () {
  if (typeof window === "undefined") return;

  let editingCell = null;

  const MOD_KEYS = new Set(["Shift", "Alt", "Control", "Meta"]);
  const CLICK_ACTIONS = new Set(["rangeClick", "deepClick"]);

  function isModifierOnlyKey(key) {
    return MOD_KEYS.has(key);
  }

  function isEditingNow() {
    const ae = document.activeElement;
    if (!ae) return false;
    if (ae.tagName === "INPUT" && ae.classList?.contains("edit")) return true;
    if (ae.tagName === "TEXTAREA" && ae.classList?.contains("tg-export")) return true;
    return false;
  }

  function comboFromKeyboardEvent(e) {
    if (e.key === " ") {
      const parts = [];
      if (e.ctrlKey || e.metaKey) parts.push("Ctrl/Cmd");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      parts.push("Space");
      return parts.join("+");
    }

    // "+" показываем как "+"
    if (e.key === "+") {
      const onlyShift = e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
      return onlyShift ? "+" : [
        (e.ctrlKey || e.metaKey) ? "Ctrl/Cmd" : "",
        e.altKey ? "Alt" : "",
        e.shiftKey ? "Shift" : "",
        "+"
      ].filter(Boolean).join("+");
    }

    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push("Ctrl/Cmd");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");

    let key = e.key;
    if (!isModifierOnlyKey(key)) {
      if (key === "Esc") key = "Escape";
      if (key.length === 1) key = key.toUpperCase();
      parts.push(key);
    }
    return parts.join("+");
  }

  function comboFromMouseEvent(e) {
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push("Ctrl/Cmd");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    parts.push("Click");
    return parts.join("+");
  }

  function updateConflicts() {
    const conflicts = hotkeys.findConflicts();

    document.querySelectorAll("td[data-action].conflict").forEach(td => td.classList.remove("conflict"));
    document.querySelectorAll("td[data-action]").forEach(td => {
      const action = td.dataset.action;
      if (conflicts.has(action)) td.classList.add("conflict");
    });
  }

  function prettyHotkey(v) {
    if (typeof v !== "string") return v;
  
    return v
      .replace(/ArrowUp/g, "↑")
      .replace(/ArrowDown/g, "↓")
      .replace(/ArrowLeft/g, "←")
      .replace(/ArrowRight/g, "→");
  }

  function syncTableFromConfig() {
    document.querySelectorAll("td[data-action]").forEach(td => {
      const action = td.dataset.action;
      const v = hotkeys.get(action);
      if (typeof v === "string" && v.length) td.textContent = prettyHotkey(v);
    });
    updateConflicts();
  }

  

  // ✅ главное: всегда возвращаем прежний текст (prevText), а не hotkeys.get(...)
  function clearEditing(cancelled) {
    if (!editingCell) return;

    const action = editingCell.dataset.action;
    editingCell.classList.remove("editing");
    editingCell.classList.remove("editing-click");

    if (cancelled) {
      const prev = editingCell.dataset.prevText;
      if (typeof prev === "string") {
        editingCell.textContent = prev;
      } else {
        // fallback
        const v = hotkeys.get(action);
        if (typeof v === "string" && v.length) editingCell.textContent = v;
      }
    } else {
      // сохранить новое как "предыдущее" (чтобы следующий Esc возвращал его)
      editingCell.dataset.prevText = editingCell.textContent;
    }

    delete editingCell.dataset.prevText;
    editingCell = null;
  }

  function init() {

    // заполним из конфига, если есть
    syncTableFromConfig();

    document.addEventListener("dblclick", (e) => {
      const cell = e.target?.closest?.("td[data-action]");
      if (!cell) return;
      if (isEditingNow()) return;
      if (window.hotkeysMode !== "custom") {
        // опционально: короткое уведомление
        alert("Включите кастомный режим хоткеев, чтобы переназначать клавиши.");
        return;}

      // закрываем прошлый редактор
      if (editingCell) clearEditing(true);

      editingCell = cell;

      // ✅ запомнить прежний текст для Esc
      editingCell.dataset.prevText = editingCell.textContent;

      const action = editingCell.dataset.action;
      const isClickAction = CLICK_ACTIONS.has(action);

      editingCell.classList.add("editing");
      if (isClickAction) {
        editingCell.classList.add("editing-click");
        editingCell.textContent = "Кликните мышью с модификаторами… (Esc — отмена)";
      } else {
        editingCell.textContent = "Нажмите комбинацию… (Tab — сохранение, Esc — отмена)";
      }
    });

    // Клавиатура
    document.addEventListener("keydown", (e) => {
      if (!editingCell) return;
      if (window.hotkeysMode !== "custom") {
        // режим выключен — отменяем редактирование, возвращаем старое
        clearEditing(true);
        return;
      }

      const action = editingCell.dataset.action;
      const isClickAction = CLICK_ACTIONS.has(action);

      // Esc — отмена (✅ теперь всегда корректно)
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        clearEditing(true);
        updateConflicts();
        return;
      }



      
      // штука для работы соло шифт, альт и тд. почему-то сомнения есть 
      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      
        const action = editingCell.dataset.action;
        const pending = editingCell.dataset.pendingCombo;
      
        // ✅ если пользователь НИЧЕГО не вводил — просто отменяем и возвращаем старое значение
        if (!pending) {
          clearEditing(true);      // вернёт editingCell.dataset.prevText
          updateConflicts();
          return;
        }
      
        // ✅ иначе — сохраняем pendingCombo
        hotkeys.set(action, pending);
      
        const normalized = hotkeys.get(action) || pending;
        editingCell.textContent = prettyHotkey(normalized);
      
        delete editingCell.dataset.pendingCombo;
      
        clearEditing(false);
        updateConflicts();
        return;
      }




      // в режиме назначения клика игнорируем клавиатуру
      if (isClickAction) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        return;
      }

      // блокируем редакторские хоткеи
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();

      // чистые модификаторы не сохраняем
      if (isModifierOnlyKey(e.key)) {
        const mods = [];
        if (e.ctrlKey || e.metaKey) mods.push("Ctrl/Cmd");
        if (e.altKey) mods.push("Alt");
        if (e.shiftKey) mods.push("Shift");
        editingCell.textContent = (mods.length ? mods.join("+") + "+" : "") + "…";
        return;
      }

      const combo = comboFromKeyboardEvent(e);

// просто показать комбинацию, НЕ сохранять
editingCell.dataset.pendingCombo = combo;
editingCell.textContent = prettyHotkey(combo);
    }, true);

    // Мышь для click-actions
    document.addEventListener("mousedown", (e) => {
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
editingCell.textContent = prettyHotkey(normalized);

      clearEditing(false);
      updateConflicts();
    }, true);

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

  el.checked = (window.hotkeysMode === "custom");

  el.addEventListener("change", () => {
    window.hotkeysMode = el.checked ? "custom" : "builtin";
  });
})();
