// multi_ops.js
// Массовое удаление выделенных multi (голубых).
// Горячие клавиши: Delete / Backspace
// Работает на macOS и Windows.
//
// Требования:
// - есть window.multiSelect.getIds() (из твоего multi_select_level.js)
// - строки в дереве имеют .row[data-id="..."]
// - у строки есть кнопка удаления "x" внутри .act (как в твоём app.js)

(function () {
    if (typeof window === "undefined") return;
  
    const HOST_ID = "tree";
  
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
  
    function isEditingNow() {
      const ae = document.activeElement;
      return !!(ae && ae.tagName === "INPUT" && ae.classList && ae.classList.contains("edit"));
    }
  
    function selectedPrimaryRow() {
      const h = host();
      if (!h) return null;
      return h.querySelector(".row.sel");
    }
  
    // Соседи в одном уровне: UL > LI > .row
    function siblingRowsForRow(row) {
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
  
    // Получить multi-строки в DOM-порядке (важно для удаления снизу вверх)
    function getMultiRowsOrdered() {
      const ids =
        window.multiSelect && typeof window.multiSelect.getIds === "function"
          ? window.multiSelect.getIds()
          : [];
  
      const rows = ids.map((id) => rowById(id)).filter(Boolean);
      if (!rows.length) return [];
  
      // пытаемся сортировать по порядку siblings текущего уровня
      const primary = selectedPrimaryRow() || rows[0];
      const sibs = siblingRowsForRow(primary);
      const idx = new Map(sibs.map((r, i) => [r.dataset.id, i]));
      rows.sort((a, b) => (idx.get(a.dataset.id) ?? 1e9) - (idx.get(b.dataset.id) ?? 1e9));
  
      return rows;
    }
  
    // кликнуть строку, чтобы app.js сделал её selected
    function clickRow(row) {
      if (!row) return;
      row.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    }
  
    // кликнуть кнопку удаления "x"
    function clickDeleteButton(row) {
      if (!row) return false;
      const act = row.querySelector(".act");
      if (!act) return false;
  
      const mids = Array.from(act.querySelectorAll(".btn .mid"));
      const delMid = mids.find((m) => m.textContent.trim() === "x");
      if (!delMid) return false;
  
      delMid
        .closest(".btn")
        .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    }
  
    // fallback: Delete key на row
    function keyDeleteOnRow(row) {
      if (!row) return;
      row.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Delete",
        })
      );
    }
  
    function deleteMulti() {
      const rows = getMultiRowsOrdered();
      if (rows.length <= 1) return false;
  
      // удаляем снизу вверх, чтобы список не "прыгал"
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        clickRow(r);
        const ok = clickDeleteButton(r);
        if (!ok) keyDeleteOnRow(r);
      }
  
      if (window.multiSelect && typeof window.multiSelect.clear === "function") {
        window.multiSelect.clear();
      }
      return true;
    }
  
    // Горячие клавиши: Delete / Backspace
    window.addEventListener(
      "keydown",
      (e) => {
        if (isEditingNow()) return;
  
        const hasMulti =
          window.multiSelect &&
          typeof window.multiSelect.size === "function" &&
          window.multiSelect.size() > 1;
  
        if (!hasMulti) return;
  
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          e.stopPropagation();
          deleteMulti();
        }
      },
      true
    );
  
    // API на будущее
    window.multiOps = {
      delete: deleteMulti,
    };
  })();
  