// multi_select_level.js
// Массовое выделение подряд ТОЛЬКО на одном уровне (внутри одного UL):
// - Shift+Cmd+ArrowUp / Shift+Cmd+ArrowDown
// - Shift+Cmd+Click
//
// Подсветка: голубым (инжектим CSS сами, чтобы не трогать style.css)
//
// Экспорт API для дальнейших операций (удалить/переместить):
// window.multiSelect = { getIds, clear, has, size, debug }
//
// ВАЖНО: app.js хранит selectedId внутри своего scope (не в window),
// поэтому "главное" выделение обновляем через синтетический click по .row.
// Диапазон строим по DOM-структуре: UL[data-level] > LI > .row
(function () {
  if (typeof window === "undefined") return;

  const HOST_ID = "tree";

  // ---- style injection (голубая подсветка) ----
  (function injectStyle() {
    const id = "multi-select-style";
    if (document.getElementById(id)) return;
    const st = document.createElement("style");
    st.id = id;
    st.textContent = `
      .row.multi{
        background:#bfe3ff !important;
        border-radius:2px;
      }
    `;
    document.head.appendChild(st);
  })();

  // ---- internal state ----
  const state = {
    anchorId: null,     // откуда тянем диапазон
    contextKey: null,   // "тот же список соседей" (родитель + уровень)
    ids: new Set(),     // выделенные id
  };

  let synth = 0; // чтобы наши синтетические клики не сбрасывали состояние

  // ---- helpers ----
  function host() {
    return document.getElementById(HOST_ID);
  }

  function cssEscapeLocal(s) {
    const v = String(s);
    if (window.CSS && typeof CSS.escape === "function") return CSS.escape(v);
    return v.replace(/[^a-zA-Z0-9_\-]/g, "\\$&");
  }

  function rowById(id) {
    const h = host();
    if (!h) return null;
    return h.querySelector(`.row[data-id="${cssEscapeLocal(id)}"]`);
  }

  function selectedRow() {
    const h = host();
    if (!h) return null;
    // app.js отмечает текущий выбор классом .sel :contentReference[oaicite:2]{index=2}
    return h.querySelector(".row.sel");
  }

  function isCmdLike(e) {
    // macOS: Cmd, Windows/Linux: Ctrl
    return e.metaKey || e.ctrlKey;
  }

  // Контекст = (родительский узел, под которым этот UL) + (data-level у UL)
  function contextKeyForRow(row) {
    if (!row) return null;
    const li = row.closest("li");
    if (!li) return null;
    const ul = li.parentElement;
    if (!ul || ul.tagName !== "UL") return null;

    const level = (ul.dataset && ul.dataset.level) ? String(ul.dataset.level) : "";

    // UL принадлежит либо корню (#tree > ul), либо какому-то LI (родителю)
    const parentLi = ul.closest("li");
    const parentRow = parentLi ? parentLi.querySelector(":scope > .row") : null;
    const parentId = parentRow ? parentRow.dataset.id : "ROOT";

    return `${parentId}::${level}`;
  }

  // Соседи = прямые дети UL: LI -> :scope > .row
  function siblingRows(row) {
    if (!row) return [];
    const li = row.closest("li");
    if (!li) return [];
    const ul = li.parentElement;
    if (!ul || ul.tagName !== "UL") return [];

    const lis = Array.from(ul.children).filter((x) => x.tagName === "LI");
    const out = [];
    for (const li2 of lis) {
      const r = li2.querySelector(":scope > .row");
      if (r) out.push(r);
    }
    return out;
  }

  function reset() {
    state.anchorId = null;
    state.contextKey = null;
    state.ids.clear();
  }

  function applyClasses() {
    const h = host();
    if (!h) return;
    h.querySelectorAll(".row.multi").forEach((el) => el.classList.remove("multi"));
    if (!state.ids.size) return;
    for (const id of state.ids) {
      const r = rowById(id);
      if (r) r.classList.add("multi");
    }
  }

  function setRange(anchorRow, activeRow) {
    if (!anchorRow || !activeRow) return false;

    const aCtx = contextKeyForRow(anchorRow);
    const bCtx = contextKeyForRow(activeRow);

    // только один уровень/родитель
    if (!aCtx || !bCtx || aCtx !== bCtx) return false;

    const sibs = siblingRows(anchorRow);
    const ia = sibs.indexOf(anchorRow);
    const ib = sibs.indexOf(activeRow);
    if (ia < 0 || ib < 0) return false;

    const from = Math.min(ia, ib);
    const to = Math.max(ia, ib);

    state.anchorId = anchorRow.dataset.id;
    state.contextKey = aCtx;
    state.ids = new Set(sibs.slice(from, to + 1).map((r) => r.dataset.id));
    return true;
  }

  // обновляем "основное" выделение app.js через клик
  function clickRow(row) {
    if (!row) return;
    synth++;
    try {
      row.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    } finally {
      synth--;
    }
  }

  function isEditingNow() {
    const ae = document.activeElement;
    return !!(ae && ae.tagName === "INPUT" && ae.classList && ae.classList.contains("edit"));
  }

  // ---- persist multi highlight across re-render ----
  // app.js вызывает render() после кликов/клавиш :contentReference[oaicite:3]{index=3}
  if (typeof window.render === "function" && !window.render.__multiLevelPatched) {
    const _render = window.render;
    window.render = function patchedRender() {
      _render();
      applyClasses();
    };
    window.render.__multiLevelPatched = true;
  }

  // ---- hotkeys: Shift+Cmd+Up/Down ----
  function handleRangeKey(dir /* -1 | +1 */) {
    const cur = selectedRow();
    if (!cur) return;
  
    const ctx = contextKeyForRow(cur);
  
    // ✅ ПЕРВОЕ нажатие: только текущий элемент, без перехода на next
    if (!state.anchorId || state.contextKey !== ctx) {
      state.anchorId = cur.dataset.id;
      state.contextKey = ctx;
      state.ids = new Set([cur.dataset.id]);
      applyClasses();
      return; // <-- ключевое
    }
  
    // дальше — расширяем диапазон как раньше
    const sibs = siblingRows(cur);
    const idx = sibs.indexOf(cur);
    const next = sibs[idx + dir];
    if (!next) return;
  
    const anchor = rowById(state.anchorId) || cur;
  
    const ok = setRange(anchor, next);
    if (!ok) {
      state.anchorId = next.dataset.id;
      state.contextKey = contextKeyForRow(next);
      state.ids = new Set([next.dataset.id]);
    }
  
    clickRow(next);
    applyClasses();
  }
  

  window.addEventListener(
    "keydown",
    (e) => {
      if (window.hotkeysMode === "custom") return;
      if (isEditingNow()) return;
  
      if (typeof isHotkey !== "function") return;
  
      if (isHotkey(e, "rangeUp")) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        handleRangeKey(-1);
        return;
      }
  
      if (isHotkey(e, "rangeDown")) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        handleRangeKey(+1);
        return;
      }
  
      // иначе — не трогаем событие
    },
    true
  );
  

  // ---- mouse: Shift+Cmd+Click ----
  function installClickHandler() {
    const h = host();
    if (!h || h.__multiLevelClickInstalled) return;
    h.__multiLevelClickInstalled = true;

    h.addEventListener(
      "click",
      (e) => {
        if (synth) return;
        const row = e.target && e.target.closest ? e.target.closest(".row") : null;

        // клики по кнопкам действий не трогаем (.act) :contentReference[oaicite:4]{index=4}
        if (e.target && e.target.closest && e.target.closest(".act")) return;

        // клик мимо строк — сброс
        if (!row) {
          if (!synth) reset();
          return;
        }

        // обычный клик (без Shift+Cmd) — сбрасывает мультивыделение
        if (!(e.shiftKey && isCmdLike(e))) {
          if (!synth) reset();
          return;
        }

        // наш range click
        e.preventDefault();
e.stopPropagation();

const clicked = row;
const ctxClicked = contextKeyForRow(clicked);

// если контекст другой (другой уровень/родитель) — начать заново
if (!state.contextKey || state.contextKey !== ctxClicked) {
  state.contextKey = ctxClicked;
  state.anchorId = clicked.dataset.id;     // якорь пригодится для shift+стрелок
  state.ids = new Set([clicked.dataset.id]);
  clickRow(clicked);                       // обновить основной курсор (.sel)
  applyClasses();
  return;
}

// тот же блок: toggle
const id = clicked.dataset.id;

if (state.ids.has(id)) {
  // убрать из выделения
  state.ids.delete(id);

  // если убрали якорь — перекинуть якорь на любой оставшийся (или null)
  if (state.anchorId === id) {
    const next = state.ids.values().next().value || null;
    state.anchorId = next;
  }
} else {
  // добавить
  state.ids.add(id);

  // если якоря не было — поставить
  if (!state.anchorId) state.anchorId = id;
}

// клик по строке — чтобы .sel перешёл туда (не сбрасывает multi, т.к. мы stopPropagation тут)
clickRow(clicked);
applyClasses();
      },
      true
    );
  }

  installClickHandler();

  // ---- API для следующих шагов (удалить/переместить пачкой) ----
  window.multiSelect = {
    getIds() {
      return Array.from(state.ids);
    },
    clear() {
      reset();
      applyClasses();
    },
    has(id) {
      return state.ids.has(id);
    },
    size() {
      return state.ids.size;
    },
    debug() {
      return {
        anchorId: state.anchorId,
        contextKey: state.contextKey,
        ids: Array.from(state.ids),
      };
    },
  };

  // Сброс мультивыделения при обычном перемещении курсора стрелками
window.addEventListener(
  "keydown",
  (e) => {
    if (isEditingNow && isEditingNow()) return;

    // обычные стрелки без модификаторов (и на mac, и на win)
    const noMods = !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
    if (noMods && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      if (window.multiSelect && typeof window.multiSelect.clear === "function") {
        window.multiSelect.clear(); // снимет голубое выделение
      }
      // важно: НЕ preventDefault, чтобы app.js продолжил двигать курсор
    }
  },
  true
);


  // первый прогон (если скрипт подцепился после render)
  try {
    applyClasses();
  } catch (_) {}
})();
