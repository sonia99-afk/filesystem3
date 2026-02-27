const LEVEL = { COMPANY: 0, PROJECT: 1, DEPT: 2, ROLE: 3 };
const DEFAULT_NAME = { 0: 'Компания', 1: 'Проект', 2: 'Отдел', 3: 'Должность' };

const uid = () => Math.random().toString(36).slice(2, 9) + '_' + Date.now().toString(36);

function makeNode(level, name) {
  return { id: uid(), level, name: (name || DEFAULT_NAME[level]), children: [] };
}

const root = makeNode(LEVEL.COMPANY, 'Компания');
let selectedId = root.id;
let treeHasFocus = true;




/* =========================
   Undo / Redo (Cmd+X = undo, Cmd+Z = redo)
   ========================= */
let undoStack = [];
let redoStack = [];

function snapshot() {
  return JSON.stringify({
    root,
    selectedId,
    treeHasFocus
  });
}

function restore(state) {
  const data = JSON.parse(state);

  // restore root in-place (keep reference)
  root.id = data.root.id;
  root.level = data.root.level;
  root.name = data.root.name;
  root.children = data.root.children || [];

  selectedId = data.selectedId || root.id;
  treeHasFocus = (typeof data.treeHasFocus === 'boolean') ? data.treeHasFocus : true;

  // if selectedId no longer exists -> fallback to root
  if (!findWithParent(root, selectedId)) selectedId = root.id;

  renamingId = null;
  try { resetHotkeyState(); } catch (_) {}
  render();
}

function pushHistory() {
  undoStack.push(snapshot());
  redoStack.length = 0;
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  const prev = undoStack.pop();
  restore(prev);
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  const next = redoStack.pop();
  restore(next);
}

// layout-independent hotkeys (works on RU layout too)
function isMod(e) { return (e.metaKey || e.ctrlKey) && !e.altKey; }

function isUndoHotkey(e) {
  if (!window.hotkeys?.get) return false;
  return isHotkey(e, "undo");
}

function isRedoHotkey(e) {
  if (!window.hotkeys?.get) return false;
  return isHotkey(e, "redo");
}

/* =========================
   Multi-key hotkeys (chords)
   - No "sticky" modifiers on macOS (Cmd/Ctrl/Alt/Shift are taken from event flags)
   - Still allows true multi-key chords like A+S+D (via a non-mod pressed set)
   - Allows assigning single modifier keys (Shift / Alt / Control(Cmd)) as standalone hotkeys:
     they fire on keyup if no other key was used while the modifier was held.
   - Layout-independent for letters/digits via e.code
   ========================= */

const pressedNonMods = new Set();   // letters/digits/arrows/etc (NO modifiers)
const downMods = new Set();         // {"Shift","Alt","Control"}
const soloEligibleMods = new Set(); // modifiers pressed without using any non-mod while held

function resetHotkeyState() {
  pressedNonMods.clear();
  downMods.clear();
  soloEligibleMods.clear();
}

function isTextEditingElement(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = String(el.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  return false;
}

function shouldTrackPressed(e) {
  const ae = document.activeElement;

  // В текстовых полях не собираем аккорды
  if (isTextEditingElement(ae)) return false;
  if (ae?.classList?.contains?.("edit")) return false;
  if (ae?.classList?.contains?.("tg-export")) return false;

  return true;
}

// Non-mod token from KeyboardEvent (modifiers return "")
function normalizeNonModTokenFromEvent(e) {
  if (!e) return "";
  const code = String(e.code || "");

  // Letters (layout-independent): KeyA..KeyZ -> A..Z
  if (code.startsWith("Key") && code.length === 4) return code.slice(3).toUpperCase();

  // Digits: Digit0..Digit9 -> 0..9
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);

  // Numpad digits: Numpad0..Numpad9 -> 0..9
  if (code.startsWith("Numpad") && code.length === 7 && /[0-9]/.test(code.slice(6))) return code.slice(6);

  const key = e.key;
  if (!key) return "";

  if (key === " " || key === "Spacebar") return "Space";
  if (key === "Esc") return "Escape";
  if (key === "+") return "Plus";

  // ❌ modifiers are not tracked as "pressed keys" (avoid sticky on macOS)
  if (key === "Shift" || key === "Alt" || key === "Control" || key === "Meta" || key === "OS") return "";

  if (key.length === 1) return key.toUpperCase();
  return key;
}

// Modifier token (Cmd/Meta normalized to Control)
function modTokenFromEvent(e) {
  const key = e?.key;
  if (key === "Shift") return "Shift";
  if (key === "Alt") return "Alt";
  if (key === "Control") return "Control";
  if (key === "Meta" || key === "OS") return "Control"; // Cmd -> Control
  return null;
}

// Build normalized combo from current event flags + pressedNonMods
function comboFromEvent(e) {
  const s = new Set(pressedNonMods);

  // modifiers from flags (robust against missed keyup on macOS)
  if (e?.shiftKey) s.add("Shift");
  if (e?.altKey) s.add("Alt");
  if (e?.ctrlKey || e?.metaKey) s.add("Control");

  const keys = Array.from(s);
  keys.sort((a, b) => String(a).localeCompare(String(b)));

  // special-case: Shift + Plus -> "+"
  if (keys.length === 2 && keys.includes("Shift") && keys.includes("Plus")) return "+";

  return keys.join("+");
}

function isHotkey(e, action) {
  const wantRaw = window.hotkeys?.get?.(action);
  if (!wantRaw) return false;

  if (e.repeat) return false;

  const haveRaw = comboFromEvent(e);

  const normalize = window.hotkeys?.normalizeCombo;
  const want = normalize ? normalize(wantRaw) : wantRaw;
  const have = normalize ? normalize(haveRaw) : haveRaw;

  // Single modifiers (Shift / Alt / Control) are handled on keyup (to not break combos).
  // So on keydown of a modifier key, do NOT match "Shift"/"Alt"/"Control".
  const mod = modTokenFromEvent(e);
  if (e.type === "keydown" && mod && pressedNonMods.size === 0 && have === mod) {
    return false;
  }

  return have === want;
}

// Deterministic order for "combo -> action" resolution (used for single-mod hotkeys)
const HOTKEY_ACTION_ORDER = [
  "undo","redo",
  "indent","outdent",
  "navLeft","navRight","navUp","navDown",
  "moveUp","moveDown",
  "rename","delete",
  "addChild","addSibling",
];

// Find first matching action for a given normalized combo string
function actionByCombo(combo) {
  if (!combo) return null;
  const normalize = window.hotkeys?.normalizeCombo;
  const needle = normalize ? normalize(combo) : combo;

  for (const action of HOTKEY_ACTION_ORDER) {
    const v = window.hotkeys?.get?.(action);
    if (!v) continue;
    const got = normalize ? normalize(v) : v;
    if (got === needle) return action;
  }
  return null;
}

window.addEventListener(
  "keydown",
  (e) => {
    if (!shouldTrackPressed(e)) {
      resetHotkeyState();
      return;
    }

    // не мешаем табу/эскейпу жить своей жизнью
    if (e.key === "Tab" || e.key === "Escape") return;

    if (e.repeat) return;

    const mod = modTokenFromEvent(e);
    if (mod) {
      downMods.add(mod);
      // если это "первый" модификатор без других клавиш — кандидат на solo-hotkey
      soloEligibleMods.add(mod);
      return;
    }

    const token = normalizeNonModTokenFromEvent(e);
    if (!token) return;

    // если во время удержания модификатора нажали что-то ещё — это уже не "solo"
    if (downMods.size > 0) soloEligibleMods.clear();

    pressedNonMods.add(token);
  },
  true
);

window.addEventListener(
  "keyup",
  (e) => {
    const mod = modTokenFromEvent(e);

    const token = normalizeNonModTokenFromEvent(e);
    if (token) pressedNonMods.delete(token);

    if (mod) {
      // if released alone (no non-mods used while held) -> trigger solo-mod hotkey on keyup
      const canSolo = soloEligibleMods.has(mod) && pressedNonMods.size === 0;

      // update mod state
      downMods.delete(mod);
      soloEligibleMods.delete(mod);

      // Only trigger if it's really alone (no other mods still held) and app can handle now
      if (canSolo && downMods.size === 0) {
        if (!isTreeLocked() && treeHasFocus && selectedId && shouldTrackPressed(e)) {
          const action = actionByCombo(mod);
          if (action) {
            // prevent page/system side-effects (e.g., Alt alone on some browsers)
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            // Run the action in the same way as normal hotkeys
            runHotkeyAction(action, selectedId);
          }
        }
      }
    }
  },
  true
);

window.addEventListener("blur", resetHotkeyState);
window.addEventListener("focus", resetHotkeyState);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) resetHotkeyState();
});

/* ========================= */

// Run an action by name (used by both keydown handlers and single-mod hotkeys)
function runHotkeyAction(action, contextId) {
  // contextId: the row id under cursor for row-level handlers; fallback to selectedId
  const id = contextId || selectedId;

  switch (action) {
    case "undo":
      undo();
      return true;
    case "redo":
      redo();
      return true;

    case "indent":
      selectedId = id;
      indentNode(id);
      return true;
    case "outdent":
      selectedId = id;
      outdentNode(id);
      return true;

    case "navLeft":
      goParent(id);
      return true;
    case "navRight":
      goDeeper(id);
      return true;
    case "navUp":
      selectedId = id;
      moveSelection(-1);
      return true;
    case "navDown":
      selectedId = id;
      moveSelection(+1);
      return true;

    case "moveUp":
      selectedId = id;
      moveWithinParent(-1);
      return true;
    case "moveDown":
      selectedId = id;
      moveWithinParent(+1);
      return true;

    case "rename":
      selectedId = id;
      treeHasFocus = true;
      render();
      startRename(id);
      return true;

    case "delete":
      selectedId = id;
      removeSelected();
      return true;

    case "addChild":
      selectedId = id;
      addChild(id);
      return true;

    case "addSibling":
      selectedId = id;
      addSibling(id);
      return true;
  }

  return false;
}

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function cssEscape(s) {
  const v = String(s);
  if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(v);
  return v.replace(/[^a-zA-Z0-9_\-]/g, '\\$&');
}

function findWithParent(node, id, parent = null) {
  if (node.id === id) return { node, parent };
  for (const ch of node.children) {
    const r = findWithParent(ch, id, node);
    if (r) return r;
  }
  return null;
}

function canHaveChild(node) {
  return node.level < LEVEL.ROLE;
}

function flatten() {
  const out = [];
  (function walk(n) {
    out.push(n.id);
    for (const ch of n.children) walk(ch);
  })(root);
  return out;
}

function flattenWithLevels() {
  const out = [];
  (function walk(n) {
    out.push({ id: n.id, level: n.level });
    for (const ch of n.children) walk(ch);
  })(root);
  return out;
}

function parentOf(id) {
  const r = findWithParent(root, id);
  return r && r.parent ? r.parent.id : null;
}

function firstChildOf(id) {
  const r = findWithParent(root, id);
  if (!r) return null;
  return (r.node.children && r.node.children.length) ? r.node.children[0].id : null;
}

function firstDeeperAfter(id) {
  const flat = flattenWithLevels();
  const idx = flat.findIndex(x => x.id === id);
  if (idx < 0) return null;
  const baseLevel = flat[idx].level;
  for (let i = idx + 1; i < flat.length; i++) {
    if (flat[i].level > baseLevel) return flat[i].id;
  }
  return null;
}

/* ======== Tree mutations (with history) ======== */

function addChild(parentId) {
  const r = findWithParent(root, parentId);
  if (!r) return;
  if (!canHaveChild(r.node)) return;

  pushHistory();

  const child = makeNode(r.node.level + 1);
  r.node.children.push(child);
  selectedId = child.id;
  treeHasFocus = true;
  render();
}

function addSibling(targetId) {
  if (targetId === root.id) {
    addChild(root.id);
    return;
  }

  const r = findWithParent(root, targetId);
  if (!r || !r.parent) return;

  pushHistory();

  const parent = r.parent;
  const idx = parent.children.findIndex(x => x.id === targetId);
  const sib = makeNode(r.node.level);

  const insertAt = (idx >= 0) ? idx + 1 : parent.children.length;
  parent.children.splice(insertAt, 0, sib);
  selectedId = sib.id;
  treeHasFocus = true;
  render();
}

function removeSelected() {
  if (!selectedId) return;
  if (selectedId === root.id) return;

  const r = findWithParent(root, selectedId);
  if (!r || !r.parent) return;

  const parent = r.parent;
  const arr = parent.children;
  const idx = arr.findIndex(x => x.id === selectedId);
  if (idx < 0) return;

  pushHistory();

  // запоминаем соседа ДО удаления
  let nextSelected = null;

  // сначала пробуем выбрать следующего
  if (idx + 1 < arr.length) {
    nextSelected = arr[idx + 1].id;
  }
  // если следующего нет — предыдущего
  else if (idx - 1 >= 0) {
    nextSelected = arr[idx - 1].id;
  }
  // если вообще нет соседей — родителя
  else {
    nextSelected = parent.id;
  }

  // удаляем
  parent.children.splice(idx, 1);

  selectedId = nextSelected;
  treeHasFocus = true;
  render();
}

function moveWithinParent(dir) {
  if (!selectedId) return;
  if (selectedId === root.id) return;

  const r = findWithParent(root, selectedId);
  if (!r || !r.parent) return;

  const arr = r.parent.children;
  const idx = arr.findIndex(x => x.id === selectedId);
  if (idx < 0) return;

  const j = idx + dir;
  if (j < 0 || j >= arr.length) return;

  pushHistory();

  const tmp = arr[idx];
  arr[idx] = arr[j];
  arr[j] = tmp;

  render();
}

// Shift+Right: indent (make child of previous sibling)
// Shift+Left: outdent (move after parent)
function indentNode(id) {
  if (!id || id === root.id) return;

  const r = findWithParent(root, id);
  if (!r || !r.parent) return;

  const siblings = r.parent.children;
  const idx = siblings.findIndex(x => x.id === id);
  if (idx <= 0) return;

  const newParent = siblings[idx - 1];
  if (!canHaveChild(newParent)) return;

  pushHistory();

  const maxL = getMaxLevelInSubtree(r.node);
if (maxL + 1 > LEVEL.ROLE) return; // запретить indent

  // при indent узел становится на уровень глубже
  if (!shiftSubtreeLevel(r.node, +1)) return;

  siblings.splice(idx, 1);
  newParent.children.push(r.node);

  selectedId = id;
  treeHasFocus = true;
  render();
}

function outdentNode(id) {
  if (!id || id === root.id) return;

  const r = findWithParent(root, id);
  if (!r || !r.parent) return;

  const parent = r.parent;
  const gp = findWithParent(root, parent.id)?.parent;
  if (!gp) return;

  pushHistory();

  // при outdent узел поднимается на уровень выше
  if (!shiftSubtreeLevel(r.node, -1)) return;

  parent.children = parent.children.filter(x => x.id !== id);

  const pIdx = gp.children.findIndex(x => x.id === parent.id);
  gp.children.splice(pIdx + 1, 0, r.node);

  selectedId = id;
  treeHasFocus = true;
  render();
}


function shiftSubtreeLevel(node, delta) {
  const oldLevel = node.level;
  const newLevel = oldLevel + delta;

  // защита: уровни не должны выходить за пределы
  if (newLevel < LEVEL.COMPANY || newLevel > LEVEL.ROLE) return false;

  // если имя было дефолтным для старого уровня — заменяем на дефолт нового
  if ((node.name || '').trim() === DEFAULT_NAME[oldLevel]) {
    node.name = DEFAULT_NAME[newLevel];
  }

  node.level = newLevel;

  for (const ch of (node.children || [])) {
    const ok = shiftSubtreeLevel(ch, delta);
    if (!ok) return false;
  }
  return true;
}

function getMaxLevelInSubtree(node) {
  let max = node.level;
  for (const ch of (node.children || [])) {
    max = Math.max(max, getMaxLevelInSubtree(ch));
  }
  return max;
}


/* ======== Navigation ======== */

function moveSelection(dir) {
  const flat = flatten();
  const idx = flat.indexOf(selectedId);
  if (idx < 0) return;
  const next = flat[idx + dir];
  if (!next) return;
  selectedId = next;
  treeHasFocus = true;
  render();
}

function goParent(fromId) {
  const p = parentOf(fromId);
  if (!p) return;
  selectedId = p;
  treeHasFocus = true;
  render();
}

function goDeeper(fromId) {
  const direct = firstChildOf(fromId);
  if (direct) {
    selectedId = direct;
    treeHasFocus = true;
    render();
    return;
  }
  const deeper = firstDeeperAfter(fromId);
  if (!deeper) return;
  selectedId = deeper;
  treeHasFocus = true;
  render();
}

/* ======== Render ======== */

function focusSelectedRow() {
  if (!treeHasFocus) return;
  const host = document.getElementById('tree');
  const r = host.querySelector(`.row[data-id="${cssEscape(selectedId)}"]`);
  if (!r) return;
  r.focus({ preventScroll: true });
}

function render() {
  const host = document.getElementById('tree');
  host.innerHTML = '';

  const ul = document.createElement('ul');
  ul.dataset.level = String(root.level);
  ul.appendChild(renderNode(root));
  host.appendChild(ul);

  layoutTrunks();

  if (treeHasFocus) focusSelectedRow();

  const rid = consumeRenameRequest?.();
if (rid) startRename(rid);
}

function isTreeLocked() {
  return window.hotkeysMode === "custom";
}

function makeBtn(midText, onClick) {
  const b = document.createElement('span');
  b.className = 'btn';

  const l = document.createElement('span');
  l.className = 'br';
  l.textContent = '[';

  const m = document.createElement('span');
  m.className = 'mid';
  m.textContent = midText;

  const r = document.createElement('span');
  r.className = 'br';
  r.textContent = ']';

  // ✅ ВАЖНО: собрать содержимое кнопки
  b.append(l, m, r);

  // ✅ перехват клика с учётом lock
  b.addEventListener('click', (e) => {
    if (isTreeLocked()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onClick(e);
  });

  // ✅ ВАЖНО: вернуть DOM-элемент
  return b;
}


function renderNode(n) {
  const li = document.createElement('li');
  if (n.id === root.id) li.classList.add('root');

  const anchor = document.createElement('span');
  anchor.className = 'anchor';
  li.appendChild(anchor);

  const row = document.createElement('span');
  row.dataset.id = n.id;
  row.className = 'row' + ((treeHasFocus && n.id === selectedId) ? ' sel' : '');
  row.tabIndex = 0;
  row.innerHTML = esc(n.name);

  const act = document.createElement('span');
  act.className = 'act';

  {
    const plus = makeBtn('+', (e) => { e.stopPropagation(); selectedId = n.id; addSibling(n.id); });
    act.appendChild(plus);
  }

  {
    const rename = makeBtn('..', (e) => {
      e.stopPropagation();
      selectedId = n.id;
      treeHasFocus = true;
      render();
      startRename(n.id);
    });
    act.appendChild(rename);
  }

  if (canHaveChild(n)) {
    const child = makeBtn('>', (e) => { e.stopPropagation(); selectedId = n.id; addChild(n.id); });
    act.appendChild(child);
  }

  if (n.id !== root.id) {
    const del = makeBtn('x', (e) => { e.stopPropagation(); selectedId = n.id; removeSelected(); });
    act.appendChild(del);
  } else {
    const lock = document.createElement('span');
    lock.className = 'mut';
    lock.textContent = ' (корень)';
    lock.style.marginLeft = '6px';
    act.appendChild(lock);
  }

  row.appendChild(act);

  row.addEventListener('click', () => {
    if (isTreeLocked()) return;
    selectedId = n.id;
    treeHasFocus = true;
    render();
  });

  // double click -> rename
  row.addEventListener('dblclick', (e) => {
    if (isTreeLocked()) return;
    if (e.target.closest('.act')) return; // not on buttons
    e.preventDefault();
    e.stopPropagation();
    selectedId = n.id;
    treeHasFocus = true;
    render();
    startRename(n.id);
  });

  row.addEventListener('keydown', (e) => {
    if (isTreeLocked()) {
      return;
    }

    for (const action of HOTKEY_ACTION_ORDER) {
      if (isHotkey(e, action)) {
        e.preventDefault();
        runHotkeyAction(action, n.id);
        return;
      }
    }
  });

  li.appendChild(row);

  if (n.children && n.children.length) {
    const ul = document.createElement('ul');
    ul.dataset.level = String(n.level + 1);
    for (const ch of n.children) ul.appendChild(renderNode(ch));
    li.appendChild(ul);
  }

  return li;
}

/* ======== layout lines ======== */

function layoutTrunks() {
  const uls = document.querySelectorAll('ul[data-level]');
  for (const ul of uls) {
    ul.querySelectorAll(':scope > .trunk').forEach(el => el.remove());
    const lvl = ul.dataset.level;
    if (lvl === '0') continue;

    const items = Array.from(ul.children).filter(el => el.tagName === 'LI');
    if (items.length === 0) continue;

    const first = items[0].querySelector(':scope > .anchor');
    const last = items[items.length - 1].querySelector(':scope > .anchor');
    if (!first || !last) continue;

    const ulBox = ul.getBoundingClientRect();
    const fBox = first.getBoundingClientRect();
    const lBox = last.getBoundingClientRect();

    const top = (fBox.top - ulBox.top);
    const height = (lBox.top - ulBox.top) - top;

    const trunk = document.createElement('div');
    trunk.className = 'trunk';
    trunk.style.top = top + 'px';
    trunk.style.height = Math.max(0, height) + 'px';
    ul.prepend(trunk);
  }

  document.querySelectorAll('.plink').forEach(el => el.remove());

  const lis = document.querySelectorAll('li');
  for (const li of lis) {
    const childUl = li.querySelector(':scope > ul[data-level]');
    if (!childUl) continue;

    const parentAnchor = li.querySelector(':scope > .anchor');
    if (!parentAnchor) continue;

    const items = Array.from(childUl.children).filter(el => el.tagName === 'LI');
    if (items.length === 0) continue;

    const firstChildAnchor = items[0].querySelector(':scope > .anchor');
    if (!firstChildAnchor) continue;

    const liBox = li.getBoundingClientRect();
    const pBox = parentAnchor.getBoundingClientRect();
    const cBox = firstChildAnchor.getBoundingClientRect();
    const ulBox = childUl.getBoundingClientRect();

    const cs = getComputedStyle(childUl);
    const trunkX = parseFloat(cs.getPropertyValue('--trunk-x')) || 0;
    const shift = parseFloat(cs.getPropertyValue('--trunk-shift')) || 0;
    const x = (ulBox.left - liBox.left) + trunkX + shift;

    const y1 = (pBox.top - liBox.top);
    const y2 = (cBox.top - liBox.top);

    const plink = document.createElement('div');
    plink.className = 'plink';
    plink.style.left = x + 'px';

    if (y2 >= y1) {
      plink.style.top = (y1 + 12) + 'px';
      plink.style.height = Math.max(0, y2 - y1 - 12) + 'px';
    } else {
      plink.style.top = (y2 + 12) + 'px';
      plink.style.height = Math.max(0, y1 - y2 - 12) + 'px';
    }

    li.prepend(plink);
  }
}

/* ======== focus / global hotkeys ======== */

document.getElementById('tree').addEventListener('click', (e) => {
  if (e.target.closest('.row')) return;
  treeHasFocus = false;
  const ae = document.activeElement;
  if (ae && ae.classList && ae.classList.contains('row')) ae.blur();
  render();
});

window.addEventListener('keydown', (e) => {
  if (isTreeLocked()) return;
  const active = document.activeElement;
  const isRow = active && active.classList && active.classList.contains('row');
  const isEditing = active && active.tagName === 'INPUT' && active.classList && active.classList.contains('edit');

  // If focus is on row or input — their handlers handle hotkeys
  if (isRow || isEditing) return;

  if (!treeHasFocus) return;
  if (!selectedId) return;

  for (const action of HOTKEY_ACTION_ORDER) {
    if (isHotkey(e, action)) {
      e.preventDefault();
      runHotkeyAction(action, selectedId);
      return;
    }
  }
});

/* ======== tests ======== */

function assert(cond, msg) {
  if (!cond) throw new Error('TEST FAIL: ' + msg);
}

function runTests() {
  const tRoot = makeNode(LEVEL.COMPANY, 'Компания');

  function tFind(id) { return findWithParent(tRoot, id); }

  function tAddChild(pid) {
    const r = tFind(pid);
    if (!r) return null;
    if (!canHaveChild(r.node)) return null;
    const child = makeNode(r.node.level + 1);
    r.node.children.push(child);
    return child.id;
  }

  function tAddSibling(tid) {
    if (tid === tRoot.id) return tAddChild(tRoot.id);
    const r = tFind(tid);
    if (!r || !r.parent) return null;
    const idx = r.parent.children.findIndex(x => x.id === tid);
    const sib = makeNode(r.node.level);
    r.parent.children.splice(idx + 1, 0, sib);
    return sib.id;
  }

  function tFlattenWL() {
    const out = [];
    (function walk(n) {
      out.push({ id: n.id, level: n.level });
      for (const ch of n.children) walk(ch);
    })(tRoot);
    return out;
  }

  function tFirstDeeperAfter(id) {
    const flat = tFlattenWL();
    const idx = flat.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const base = flat[idx].level;
    for (let i = idx + 1; i < flat.length; i++) {
      if (flat[i].level > base) return flat[i].id;
    }
    return null;
  }

  assert(tRoot.level === LEVEL.COMPANY, 'root is company');

  const p1 = tAddSibling(tRoot.id);
  assert(!!p1, 'project added under root');

  const p2 = tAddSibling(p1);
  assert(!!p2, 'project sibling added');

  const d1 = tAddChild(p1);
  assert(!!d1, 'dept child added');

  const r1 = tAddChild(d1);
  assert(!!r1, 'role child added');

  const before = findWithParent(tRoot, r1).node.children.length;
  const nope = tAddChild(r1);
  assert(nope === null, 'no children under role');
  assert(findWithParent(tRoot, r1).node.children.length === before, 'role still leaf');

  const tRoot2 = makeNode(LEVEL.COMPANY, 'Компания');
  const pA = makeNode(LEVEL.PROJECT, 'P1');
  const pB = makeNode(LEVEL.PROJECT, 'P2');
  const dB = makeNode(LEVEL.DEPT, 'D2');
  pB.children.push(dB);
  tRoot2.children.push(pA, pB);

  function tFlattenWL2() {
    const out = [];
    (function walk(n) {
      out.push({ id: n.id, level: n.level });
      for (const ch of n.children) walk(ch);
    })(tRoot2);
    return out;
  }

  function tFirstDeeperAfter2(id) {
    const flat = tFlattenWL2();
    const idx = flat.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const base = flat[idx].level;
    for (let i = idx + 1; i < flat.length; i++) {
      if (flat[i].level > base) return flat[i].id;
    }
    return null;
  }

  assert(tFirstDeeperAfter2(pA.id) === dB.id, 'arrow right deeper navigation skips to next subtree');
  assert(tFirstDeeperAfter(pA.id) === null, 'firstDeeperAfter is tree-specific');

  console.log('All tests passed');
}

render();

if (new URLSearchParams(location.search).get('test') === '1') {
  runTests();
}





