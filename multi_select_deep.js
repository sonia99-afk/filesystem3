// multi_select_deep.js
// "Глубокое" мультивыделение (включая вложенные уровни) по Shift+Alt:
// - Shift+Alt+ArrowUp / Shift+Alt+ArrowDown: расширение диапазона по порядку видимых строк в ветке (включая вложенные)
//   (первое нажатие — выделяет только текущий, без прыжка)
// - Shift+Alt+Click: toggle (добавить/убрать) элемент, но только внутри одной верхнеуровневой ветки (block)
//
// Визуальная подсветка: та же .row.multi (голубая). Если стиль уже есть — повторно не вставится.
// Экспорт API: window.multiSelectDeep = { getIds, clear, size, has, debug }

(function () {
    if (typeof window === "undefined") return;
  
    const HOST_ID = "tree";
  
    // ---- style (если ещё не был вставлен другим файлом) ----
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
      ids: new Set(),
      anchorId: null,
      blockKey: null, // верхнеуровневая ветка (один child корня)
    };
  
    let synth = 0;
  
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
      return h.querySelector(".row.sel");
    }
  
    function isEditingNow() {
      const ae = document.activeElement;
      return !!(ae && ae.tagName === "INPUT" && ae.classList && ae.classList.contains("edit"));
    }
  
    // blockKey = id верхнеуровневого узла (child of root UL) или ROOT
    function blockKeyForRow(row) {
      if (!row) return null;
      const h = host();
      if (!h) return null;
  
      const li = row.closest("li");
      if (!li) return null;
  
      // корневой UL — это UL, который является первым UL внутри #tree
      const rootUl = h.querySelector(":scope > ul");
      if (!rootUl) return "ROOT";
  
      // найдём LI, который является прямым ребёнком rootUl и содержит наш row где-то внутри
      // идём вверх по LI: самый верхний LI, чей parentElement === rootUl
      let curLi = li;
      while (curLi && curLi.parentElement && curLi.parentElement !== rootUl) {
        curLi = curLi.parentElement.closest("li");
      }
  
      if (curLi && curLi.parentElement === rootUl) {
        const topRow = curLi.querySelector(":scope > .row");
        return topRow ? topRow.dataset.id : "ROOT";
      }
  
      // если по какой-то причине не нашли — считаем ROOT
      return "ROOT";
    }
  
    // Все строки (.row) внутри одной ветки в порядке DOM (включая вложенные)
    function rowsInBlock(blockKey) {
      const h = host();
      if (!h) return [];
      const rootUl = h.querySelector(":scope > ul");
      if (!rootUl) return Array.from(h.querySelectorAll(".row"));
  
      if (!blockKey || blockKey === "ROOT") {
        return Array.from(rootUl.querySelectorAll(".row"));
      }
  
      const topRow = rowById(blockKey);
      if (!topRow) return Array.from(rootUl.querySelectorAll(".row"));
  
      const topLi = topRow.closest("li");
      if (!topLi) return Array.from(rootUl.querySelectorAll(".row"));
  
      // только строки внутри этой LI (сам top + все потомки)
      return Array.from(topLi.querySelectorAll(".row"));
    }
  
    function reset() {
      state.ids.clear();
      state.anchorId = null;
      state.blockKey = null;
    }
  
    function applyClasses() {
      const h = host();
      if (!h) return;
      h.querySelectorAll(".row.multi").forEach((el) => el.classList.remove("multi"));
      for (const id of state.ids) {
        const r = rowById(id);
        if (r) r.classList.add("multi");
      }
    }
  
    function clickRow(row) {
      if (!row) return;
      synth++;
      try {
        row.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      } finally {
        synth--;
      }
    }
  
    // ---- keep highlight after render() ----
    if (typeof window.render === "function" && !window.render.__multiDeepPatched) {
      const _render = window.render;
      window.render = function patchedRenderDeep() {
        _render();
        applyClasses();
      };
      window.render.__multiDeepPatched = true;
    }
  
    // ---- Shift+Alt+ArrowUp/Down: range selection across nested ----
    function handleDeepRangeKey(dir /* -1 | +1 */) {
      const cur = selectedRow();
      if (!cur) return;
  
      const bk = blockKeyForRow(cur);
  
      // ✅ Первый раз (или другая ветка): выделить только текущий, без перехода
      if (!state.anchorId || state.blockKey !== bk) {
        state.blockKey = bk;
        state.anchorId = cur.dataset.id;
        state.ids = new Set([cur.dataset.id]);
        applyClasses();
        return;
      }
  
      const list = rowsInBlock(state.blockKey);
      const idx = list.indexOf(cur);
      if (idx < 0) return;
  
      const next = list[idx + dir];
      if (!next) return;
  
      const anchor = rowById(state.anchorId) || cur;
      const ia = list.indexOf(anchor);
      const ib = list.indexOf(next);
      if (ia < 0 || ib < 0) return;
  
      const from = Math.min(ia, ib);
      const to = Math.max(ia, ib);
  
      state.ids = new Set(list.slice(from, to + 1).map((r) => r.dataset.id));
  
      clickRow(next);
      applyClasses();
    }
  
    window.addEventListener(
      "keydown",
      (e) => {
        if (isEditingNow()) return;
  
        // Shift + Alt + ArrowUp/Down
        if (!(e.shiftKey && e.altKey)) return;
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  
        e.preventDefault();
        e.stopPropagation();
  
        handleDeepRangeKey(e.key === "ArrowUp" ? -1 : +1);
      },
      true
    );
  
    // ---- Shift+Alt+Click: toggle within one block ----
    function installClickHandler() {
      const h = host();
      if (!h || h.__multiDeepClickInstalled) return;
      h.__multiDeepClickInstalled = true;
  
      h.addEventListener(
        "click",
        (e) => {
          if (synth) return;
  
          const row = e.target && e.target.closest ? e.target.closest(".row") : null;
  
          // клики по кнопкам действий не трогаем
          if (e.target && e.target.closest && e.target.closest(".act")) return;
  
          // клик мимо строк — сброс
          if (!row) {
            reset();
            applyClasses();
            return;
          }
  
          // обычный клик без Shift+Alt — сброс "deep" выделения
          if (!(e.shiftKey && e.altKey)) {
            reset();
            applyClasses();
            return;
          }
  
          // Shift+Alt+click toggle
          e.preventDefault();
          e.stopPropagation();
  
          const clicked = row;
          const bk = blockKeyForRow(clicked);
  
          // если другая ветка — начать заново с кликнутого
          if (!state.blockKey || state.blockKey !== bk) {
            state.blockKey = bk;
            state.anchorId = clicked.dataset.id;
            state.ids = new Set([clicked.dataset.id]);
            clickRow(clicked);
            applyClasses();
            return;
          }
  
          const id = clicked.dataset.id;
  
          if (state.ids.has(id)) {
            state.ids.delete(id);
            if (state.anchorId === id) {
              state.anchorId = state.ids.values().next().value || null;
            }
          } else {
            state.ids.add(id);
            if (!state.anchorId) state.anchorId = id;
          }
  
          clickRow(clicked);
          applyClasses();
        },
        true
      );
    }
  
    installClickHandler();
  
    // ---- API ----
    window.multiSelectDeep = {
      getIds() {
        return Array.from(state.ids);
      },
      clear() {
        reset();
        applyClasses();
      },
      size() {
        return state.ids.size;
      },
      has(id) {
        return state.ids.has(id);
      },
      debug() {
        return {
          blockKey: state.blockKey,
          anchorId: state.anchorId,
          ids: Array.from(state.ids),
        };
      },
    };

    // Сброс deep-выделения при обычной навигации стрелками (без модификаторов)
    window.addEventListener(
        "keydown",
        (e) => {
        if (isEditingNow()) return;
    
        const noMods = !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
        if (
            noMods &&
            (e.key === "ArrowUp" ||
            e.key === "ArrowDown" ||
            e.key === "ArrowLeft" ||
            e.key === "ArrowRight")
        ) {
            reset();
            applyClasses();
            // НЕ preventDefault — чтобы app.js продолжал навигацию
        }
        },
        true
    );
  
  
    // первичная отрисовка подсветки
    try {
      applyClasses();
    } catch (_) {}
  })();
  