// rename.js
// Вынесено из app.js: состояние renamingId + функция startRename()

let renamingId = null;

// маленькие хелперы, чтобы app.js мог работать с состоянием rename
function requestRename(id) {
  renamingId = id;
}

function consumeRenameRequest() {
  const id = renamingId;
  renamingId = null;
  return id;
}

function startRename(id) {
    
  if (!id) return;
  const r = findWithParent(root, id);
  if (!r) return;

  // запоминаем, что мы в режиме переименования
  requestRename(id);

  const host = document.getElementById('tree');
  const row = host.querySelector(`.row[data-id="${cssEscape(id)}"]`);
  if (!row) return;

  const cur = r.node.name || '';
  row.innerHTML = '';

  const input = document.createElement('input');
  input.className = 'edit';
  input.type = 'text';
  input.value = cur;

  // чтобы клики по input не триггерили выбор строки/рендер
  const stopMouse = (e) => e.stopPropagation();
  input.addEventListener('pointerdown', stopMouse);
  input.addEventListener('pointerup', stopMouse);
  input.addEventListener('mousedown', stopMouse);
  input.addEventListener('mouseup', stopMouse);
  input.addEventListener('click', stopMouse);
  input.addEventListener('dblclick', stopMouse);

  input.style.width = Math.max(120, Math.min(520, (cur.length + 4) * 9)) + 'px';

  function commit() {
    const t = input.value.trim();
    if (t && t !== r.node.name) {
      pushHistory();
      r.node.name = t;
    }
    renamingId = null;
    render();
  }

  function cancel() {
    renamingId = null;
    render();
  }

  input.addEventListener('keydown', (e) => {
    stopBackspaceLeak(e);
    // undo/redo должны работать даже во время ввода
    if (isUndoHotkey(e)) {
      e.preventDefault();
      e.stopPropagation();
      undo();
      return;
    }
    if (isRedoHotkey(e)) {
      e.preventDefault();
      e.stopPropagation();
      redo();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      commit();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
      return;
    }

    // стрелки — не даём дереву ловить, но каретку пусть браузер двигает
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.stopPropagation();
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.stopPropagation();
      if (e.shiftKey) {
        e.preventDefault();
        const len = input.value.length;
        const a = input.selectionStart ?? 0;
        const b = input.selectionEnd ?? 0;
        const anchor = (input._selAnchor ?? (b > a ? a : a));
        input._selAnchor = anchor;

        if (e.key === 'ArrowUp') input.setSelectionRange(0, anchor);
        else input.setSelectionRange(anchor, len);
      } else {
        input._selAnchor = null;
      }
      return;
    }

    if (e.key === 'Delete') {
      e.stopPropagation();
      return;
    }
  });

  input.addEventListener('blur', () => { commit(); });

  row.appendChild(input);
  input.focus({ preventScroll: true });
  input.select();
}



// ===== MODAL LOCK while renaming =====
// Полностью блокирует работу "основной программы", пока активен input.edit.
// Реализовано один раз через capture event-trap.

(function installRenameModalLock() {
    if (typeof window === "undefined") return;
    if (window.__renameModalLockInstalled) return;
    window.__renameModalLockInstalled = true;
  
    // Какие события гасим
    const EVENTS = [
      "keydown",
      "keyup",
      "keypress",
      "pointerdown",
      "mousedown",
      "mouseup",
      "click",
      "dblclick",
      "contextmenu",
      "wheel",
      "touchstart",
      "touchend",
    ];
  
    function activeEditInput() {
      const ae = document.activeElement;
      if (ae && ae.tagName === "INPUT" && ae.classList && ae.classList.contains("edit")) return ae;
      return null;
    }
  
    function isRenamingActive() {
      // renamingId — локальная переменная этого файла
      return !!renamingId || !!activeEditInput();
    }
  
    function isAllowedTarget(e) {
      const t = e.target;
      if (!t || !t.closest) return false;
  
      // Разрешаем взаимодействие с самим инпутом (и только с ним)
      return !!t.closest("input.edit");
    }
  
    function trap(e) {
      if (!isRenamingActive()) return;
      if (isAllowedTarget(e)) return;
  
      // Жёсткая остановка: не даём событию дойти до app.js/multi_ops/других патчей
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    }
  
    // Важно: capture=true, чтобы перехватить РАНЬШЕ обработчиков приложения
    for (const ev of EVENTS) {
      window.addEventListener(ev, trap, true);
      document.addEventListener(ev, trap, true);
    }
  })();
  
  // Дополнительно: чтобы Backspace точно не удалял узел через hotkey delete=Backspace
  // (это "мягкая" страховка, даже при modal lock не помешает)
  function stopBackspaceLeak(e) {
    if (e.key === "Backspace") {
      e.stopPropagation();
      // preventDefault НЕ делаем: иначе символ не удалится в input
    }
  }
  