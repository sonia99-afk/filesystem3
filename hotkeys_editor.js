// hotkeys_editor.js
// Редактирование хоткеев по двойному клику на td[data-action].
// - Esc всегда корректно отменяет (возвращает прежний текст ячейки)
// - Click-actions (rangeClick/deepClick) назначаются кликом мыши
// - Конфликты подсвечиваются красным бордером

(function () {
  if (typeof window === "undefined") return;

  let editingCell = null;
  let editingPressed = new Set();

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

  function normalizeKeyTokenFromEventKey(key) {
    if (!key) return "";
    if (key === " ") return "Space";
    if (key === "Spacebar") return "Space";
    if (key === "Esc") return "Escape";
    // IMPORTANT: literal "+" breaks "A+B" serialization
    if (key === "+") return "Plus";
    if (key.length === 1) return key.toUpperCase();
    return key;
  }
  
  function buildChordCombo(e, keysSet) {
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push("Ctrl/Cmd");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
  
    const keys = Array.from(keysSet);
    keys.sort((a, b) => String(a).localeCompare(String(b)));
  
    // Historical special-case: Shift + "+" stored as just "+"
    const onlyShift = e.shiftKey && !(e.ctrlKey || e.metaKey) && !e.altKey;
    if (onlyShift && keys.length === 1 && keys[0] === "Plus") return "+";
  
    parts.push(...keys);
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
    .replace(/\bPlus\b/g, "+")
      .replace(/ArrowUp/g, "↑")
      .replace(/ArrowDown/g, "↓")
      .replace(/ArrowLeft/g, "←")
      .replace(/ArrowRight/g, "→");
  }

  function setCellTextIfChanged(cell, text) {
    if (!cell) return;
    const t = String(text ?? "");
    if (cell.textContent !== t) cell.textContent = t;
  }


  function syncTableFromConfig() {
    document.querySelectorAll("td[data-action]").forEach(td => {
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
        // fallback
        const v = hotkeys.get(action);
        if (typeof v === "string" && v.length) setCellTextIfChanged(editingCell, prettyHotkey(v));
      }
    }
  
    delete editingCell.dataset.prevText;
    editingPressed = new Set();
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

      editingPressed = new Set();
delete editingCell.dataset.pendingCombo;

      // ✅ запомнить прежний текст для Esc
      editingCell.dataset.prevText = editingCell.textContent;

      const action = editingCell.dataset.action;
      const isClickAction = CLICK_ACTIONS.has(action);

      editingCell.classList.add("editing");
      if (isClickAction) {
        editingCell.classList.add("editing-click");
        setCellTextIfChanged(editingCell, "Кликните мышью с модификаторами… (Esc — отмена)");
      } else {
        setCellTextIfChanged(editingCell, "Нажмите комбинацию… (Esc — отмена)");
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
        setCellTextIfChanged(editingCell, (mods.length ? mods.join("+") + "+" : "") + "…");
        return;
      }

      const token = normalizeKeyTokenFromEventKey(e.key);
if (token) editingPressed.add(token);

const combo = buildChordCombo(e, editingPressed);

// pendingCombo сохраняем только когда есть хотя бы одна немодификаторная клавиша
if (editingPressed.size > 0) {
  editingCell.dataset.pendingCombo = combo;
}
setCellTextIfChanged(editingCell, prettyHotkey(combo || "…"));
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
      setCellTextIfChanged(editingCell, prettyHotkey(normalized));

      clearEditing(false);
      updateConflicts();
    }, true);

// KeyUp — НЕ рисуем "сужающийся" аккорд, чтобы не было мигания.
// Обновляем текст только когда отпущены ВСЕ клавиши (set пуст).
document.addEventListener(
  "keyup",
  (e) => {
    if (!editingCell) return;
    if (window.hotkeysMode !== "custom") return;

    const action = editingCell.dataset.action;
    if (CLICK_ACTIONS.has(action)) return;

    const token = normalizeKeyTokenFromEventKey(e.key);
    if (token) editingPressed.delete(token);

    // Пока аккорд еще частично удерживается — ничего не перерисовываем.
    if (editingPressed.size > 0) return;

    // Когда отпущено всё — если есть pendingCombo, то сохраняем его.
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

    // Если pending нет — просто вернём текущее значение из конфига (на всякий случай)
    const current = window.hotkeys?.get?.(action) || "";
    setCellTextIfChanged(editingCell, prettyHotkey(current));
  },
  true
);

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
