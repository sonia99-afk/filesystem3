/* не пашет хеххехехе

  Multi-select patch for the org-structure editor.

  Adds range selection (ONLY within the same parent / same level):
  - Shift+Cmd+ArrowUp / Shift+Cmd+ArrowDown
  - Shift+Cmd+Click

  IMPORTANT:
  app.js keeps its state (root/selectedId/etc.) in top-level const/let,
  which are NOT exposed on window. Поэтому этот патч работает через DOM:
  он вычисляет "соседей" по текущему <ul data-level="..."> и выбирает
  диапазон ТОЛЬКО внутри этого списка.

  Visual highlight uses CSS class `.row.multi` (already present in style.css).
*/

(function () {
  if (typeof window === 'undefined') return;

  const HOST_ID = 'tree';

  // --- State (kept across renders) ---
  const state = {
    anchorId: null,
    contextKey: null,  // identifies one specific sibling-list (same parent + same level)
    ids: new Set(),
  };

  // for internal synthetic clicks so we don't reset state on our own actions
  let _synthClick = false;

  // --- Helpers ---
  function cssEscapeLocal(s) {
    const v = String(s);
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(v);
    return v.replace(/[^a-zA-Z0-9_\-]/g, '\\$&');
  }

  function hostEl() {
    return document.getElementById(HOST_ID);
  }

  function getRowById(id) {
    const host = hostEl();
    if (!host) return null;
    return host.querySelector(`.row[data-id="${cssEscapeLocal(id)}"]`);
  }

  function getSelectedRow() {
    const host = hostEl();
    if (!host) return null;
    // app.js marks the "primary" selection with .sel on the row
    return host.querySelector('.row.sel') || (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('row') ? document.activeElement : null);
  }

  // Rows are rendered as: ul[data-level] > li > span.row
  function getContextKeyForRow(row) {
    if (!row) return null;
    const li = row.closest('li');
    if (!li) return null;

    const ul = li.parentElement;
    if (!ul || ul.tagName !== 'UL') return null;

    const level = ul.dataset && ul.dataset.level ? String(ul.dataset.level) : '';

    // parent row id (the node that owns this <ul>) is the closest parent <li> above the <ul>
    const parentLi = ul.closest('li');
    const parentRow = parentLi ? parentLi.querySelector(':scope > .row') : null;
    const parentId = parentRow ? parentRow.dataset.id : 'ROOT';

    // unique enough key for "siblings in one level under one parent"
    return `${parentId}::${level}`;
  }

  function getSiblingRowsForRow(row) {
    if (!row) return [];
    const li = row.closest('li');
    if (!li) return [];
    const ul = li.parentElement;
    if (!ul) return [];
    // Only direct children of this UL
    const lis = Array.from(ul.children).filter(el => el.tagName === 'LI');
    const rows = [];
    for (const li2 of lis) {
      const r = li2.querySelector(':scope > .row');
      if (r) rows.push(r);
    }
    return rows;
  }

  function resetMulti() {
    state.anchorId = null;
    state.contextKey = null;
    state.ids.clear();
  }

  function setRangeByRows(anchorRow, activeRow) {
    if (!anchorRow || !activeRow) {
      resetMulti();
      return false;
    }

    const ctxA = getContextKeyForRow(anchorRow);
    const ctxB = getContextKeyForRow(activeRow);

    // Must be same parent + same level
    if (!ctxA || !ctxB || ctxA !== ctxB) {
      resetMulti();
      return false;
    }

    const sibs = getSiblingRowsForRow(anchorRow);
    const ia = sibs.indexOf(anchorRow);
    const ib = sibs.indexOf(activeRow);
    if (ia < 0 || ib < 0) {
      resetMulti();
      return false;
    }

    const from = Math.min(ia, ib);
    const to = Math.max(ia, ib);

    state.anchorId = anchorRow.dataset.id;
    state.contextKey = ctxA;
    state.ids = new Set(sibs.slice(from, to + 1).map(r => r.dataset.id));

    return true;
  }

  function applyMultiClasses() {
    const host = hostEl();
    if (!host) return;

    // remove previous
    host.querySelectorAll('.row.multi').forEach(el => el.classList.remove('multi'));

    // apply current
    if (!state.ids || state.ids.size === 0) return;

    for (const id of state.ids) {
      const el = getRowById(id);
      if (el) el.classList.add('multi');
    }
  }

  // --- Patch render() so multi-class persists across re-renders ---
  if (typeof window.render === 'function' && !window.render.__multiPatched) {
    const _render = window.render;
    function patchedRender() {
      _render();
      applyMultiClasses();
    }
    patchedRender.__multiPatched = true;
    window.render = patchedRender;
  }

  // --- Synthetic click helper (lets app.js update its internal selectedId) ---
  function synthClickRow(row) {
    if (!row) return;
    _synthClick = true;
    try {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      // app.js renders on click; our patched render reapplies .multi
    } finally {
      _synthClick = false;
    }
  }

  // --- Keyboard: Shift+Cmd+ArrowUp/Down (range within same UL only) ---
  function handleRangeKey(dir) {
    const curRow = getSelectedRow();
    if (!curRow) return;

    const sibs = getSiblingRowsForRow(curRow);
    if (!sibs.length) return;

    const idx = sibs.indexOf(curRow);
    if (idx < 0) return;

    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= sibs.length) return;

    const nextRow = sibs[nextIdx];

    // init / re-init anchor based on current context
    const ctxCur = getContextKeyForRow(curRow);
    if (!state.anchorId || state.contextKey !== ctxCur) {
      state.anchorId = curRow.dataset.id;
      state.contextKey = ctxCur;
      state.ids = new Set([curRow.dataset.id]);
    }

    // build range from anchorRow to nextRow
    const anchorRow = getRowById(state.anchorId);
    // if anchor row disappeared (shouldn't), restart from current
    const ok = setRangeByRows(anchorRow || curRow, nextRow);
    if (!ok) {
      // fallback to single
      state.anchorId = nextRow.dataset.id;
      state.contextKey = getContextKeyForRow(nextRow);
      state.ids = new Set([nextRow.dataset.id]);
    }

    // update primary selection using app.js click handler
    synthClickRow(nextRow);

    // in case render didn't happen (edge), ensure classes
    applyMultiClasses();
  }

  window.addEventListener('keydown', (e) => {
    // Our combo: Shift + Cmd + ArrowUp/Down
    if (!(e.shiftKey && e.metaKey)) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;

    // If editing text input, do nothing
    const active = document.activeElement;
    const isEditing = active && active.tagName === 'INPUT' && active.classList && active.classList.contains('edit');
    if (isEditing) return;

    e.preventDefault();
    e.stopPropagation();

    handleRangeKey(e.key === 'ArrowUp' ? -1 : 1);
  }, true);

  // --- Mouse: Shift+Cmd+Click ---
  const treeHost = hostEl();
  if (treeHost) {
    // capture to override row's own click handler (we'll trigger it ourselves)
    treeHost.addEventListener('click', (e) => {
      const row = e.target && e.target.closest ? e.target.closest('.row') : null;

      // click outside rows -> clear our range (let app.js blur logic run)
      if (!row) {
        if (!_synthClick) resetMulti();
        return;
      }

      // Ignore clicks on action buttons; let existing handlers work
      if (e.target.closest('.act')) return;

      // normal click (without Shift+Cmd) resets multi-range
      if (!(e.shiftKey && e.metaKey)) {
        if (!_synthClick) resetMulti();
        return;
      }

      // Our range click:
      e.preventDefault();
      e.stopPropagation();

      const clickedRow = row;
      const selectedRow = getSelectedRow();

      // anchor is current primary selection (if present), else clicked
      let anchorRow = selectedRow || clickedRow;

      // If we already have anchor in same context, reuse it; else set new anchor
      const ctxClicked = getContextKeyForRow(clickedRow);
      if (!state.anchorId || state.contextKey !== ctxClicked) {
        state.anchorId = anchorRow.dataset.id;
        state.contextKey = getContextKeyForRow(anchorRow);
        state.ids = new Set([state.anchorId]);
      }

      // ensure anchorRow is the stored anchor (if it still exists)
      const storedAnchorRow = getRowById(state.anchorId);
      if (storedAnchorRow) anchorRow = storedAnchorRow;

      const ok = setRangeByRows(anchorRow, clickedRow);
      if (!ok) {
        // can't range across levels/sections -> treat as single
        state.anchorId = clickedRow.dataset.id;
        state.contextKey = getContextKeyForRow(clickedRow);
        state.ids = new Set([clickedRow.dataset.id]);
      }

      // make clicked the primary selection using app.js internal logic
      synthClickRow(clickedRow);

      applyMultiClasses();
    }, true);
  }

  // Clear range on plain navigation arrows (without Cmd) so it doesn't "stick"
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey) return;
    if (e.shiftKey) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;

    const active = document.activeElement;
    const isEditing = active && active.tagName === 'INPUT' && active.classList && active.classList.contains('edit');
    if (isEditing) return;

    resetMulti();
  }, true);

  // After initial load (patch might load after render), apply classes once.
  try { applyMultiClasses(); } catch (_) {}
})();
