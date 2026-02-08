// multi_move_hierarchy.js
// Массовое перемещение выделенных (.row.multi) между уровнями (только один родитель):
// Shift + ArrowRight  → indent (вложить в предыдущий элемент)
// Shift + ArrowLeft   → outdent (вынуть на уровень выше)
//
// ВАЖНО: использует shiftSubtreeLevel/canHaveChild из app.js, чтобы уровни и дефолтные имена обновлялись.

(function () {
    if (typeof window === "undefined") return;
  
    const HOST_ID = "tree";
  
    function host() {
      return document.getElementById(HOST_ID);
    }
  
    function isEditingNow() {
      const ae = document.activeElement;
      if (!ae) return false;
      if (ae.tagName === "INPUT" && ae.classList?.contains("edit")) return true;
      if (ae.tagName === "TEXTAREA" && ae.classList?.contains("tg-export")) return true;
      return false;
    }
  
    function getMultiIds() {
      const h = host();
      if (!h) return [];
      // DOM-order
      return Array.from(h.querySelectorAll(".row.multi"))
        .map(r => r.dataset?.id)
        .filter(Boolean);
    }
  
    function allSameParent(ids) {
      const parents = new Set(ids.map(id => parentOf(id) || "ROOT"));
      return parents.size === 1 ? parents.values().next().value : null;
    }
  
    function uniqueInOrder(arr) {
      const seen = new Set();
      const out = [];
      for (const x of arr) {
        if (!seen.has(x)) { seen.add(x); out.push(x); }
      }
      return out;
    }
  
    function indentMany(ids, parentId) {
      ids = uniqueInOrder(ids);
      if (!ids.length) return false;
  
      const parentInfo = findWithParent(root, parentId);
      if (!parentInfo) return false;
  
      const parentNode = parentInfo.node;
      const siblings = parentNode.children || [];
      if (siblings.length < 2) return false;
  
      // индексы выбранных в siblings
      const selectedSet = new Set(ids);
      const idxs = siblings
        .map((n, i) => (selectedSet.has(n.id) ? i : -1))
        .filter(i => i >= 0);
  
      if (!idxs.length) return false;
  
      const firstIdx = Math.min(...idxs);
      if (firstIdx <= 0) return false;
  
      const newParent = siblings[firstIdx - 1];
      if (!newParent) return false;
  
      // нельзя вложить в узел без детей (ROLE)
      if (typeof canHaveChild === "function" && !canHaveChild(newParent)) return false;
  
      // собираем переносимые узлы в порядке siblings (чтобы блок не перемешивался)
      const moving = siblings.filter(n => selectedSet.has(n.id));
      if (!moving.length) return false;
  
      // precheck: shiftSubtreeLevel должен пройти для всех
      if (typeof shiftSubtreeLevel === "function") {
        // проверим на копиях (минимально): просто убедимся, что delta не выходит за пределы
        // (shiftSubtreeLevel сам валидирует, но он мутирует; поэтому делаем проверку "в лоб"
        // через уровни: если какой-то узел уже на ROLE — indent нельзя)
        for (const n of moving) {
          if (typeof n.level === "number" && typeof LEVEL === "object") {
            // если уже ROLE — canHaveChild не даст, но на всякий
            if (n.level >= LEVEL.ROLE) return false;
          }
        }
      }
  
      pushHistory(); // 1 undo на всю пачку
  
      // 1) сдвинуть уровни (+1) с обновлением дефолтных имён
      if (typeof shiftSubtreeLevel === "function") {
        for (const n of moving) {
          const ok = shiftSubtreeLevel(n, +1);
          if (!ok) {
            // откат невозможен без второго snapshot — но shiftSubtreeLevel редко вернёт false,
            // так как мы проверили границы. Если всё же вернул — просто рендерим обратно через undo.
            undo();
            return false;
          }
        }
      } else {
        // если по какой-то причине функции нет — хотя бы уровень сместим
        for (const n of moving) {
          if (typeof n.level === "number") n.level += 1;
        }
      }
  
      // 2) убрать из текущего родителя
      parentNode.children = siblings.filter(n => !selectedSet.has(n.id));
  
      // 3) добавить в нового родителя (в конец, как indentNode)
      newParent.children ||= [];
      newParent.children.push(...moving);
  
      selectedId = moving[0].id;
      treeHasFocus = true;
      render();
      return true;
    }
  
    function outdentMany(ids) {
      ids = uniqueInOrder(ids);
      if (!ids.length) return false;
  
      const parentId = parentOf(ids[0]);
      if (!parentId) return false;
  
      // все должны быть у одного родителя
      const pAll = allSameParent(ids);
      if (!pAll || pAll !== parentId) return false;
  
      const parentInfo = findWithParent(root, parentId);
      if (!parentInfo || !parentInfo.parent) return false;
  
      const parentNode = parentInfo.node;
      const gp = parentInfo.parent; // grandparent node
  
      const siblings = parentNode.children || [];
      const selectedSet = new Set(ids);
  
      const moving = siblings.filter(n => selectedSet.has(n.id));
      if (!moving.length) return false;
  
      const pIdx = (gp.children || []).findIndex(n => n.id === parentId);
      if (pIdx < 0) return false;
  
      pushHistory(); // 1 undo
  
      // 1) сдвинуть уровни (-1) с обновлением дефолтных имён
      if (typeof shiftSubtreeLevel === "function") {
        for (const n of moving) {
          const ok = shiftSubtreeLevel(n, -1);
          if (!ok) {
            undo();
            return false;
          }
        }
      } else {
        for (const n of moving) {
          if (typeof n.level === "number") n.level -= 1;
        }
      }
  
      // 2) удалить из текущего родителя
      parentNode.children = siblings.filter(n => !selectedSet.has(n.id));
  
      // 3) вставить после родителя в grandparent (сохраняя порядок блока)
      gp.children ||= [];
      gp.children.splice(pIdx + 1, 0, ...moving);
  
      selectedId = moving[0].id;
      treeHasFocus = true;
      render();
      return true;
    }
  
    function onKeyDown(e) {
      if (window.hotkeysMode === "custom") return;
      if (isEditingNow()) return;
  
      if (
        !e.shiftKey ||
        e.ctrlKey || e.metaKey || e.altKey ||
        (e.key !== "ArrowLeft" && e.key !== "ArrowRight")
      ) return;
  
      const ids = getMultiIds();
      if (!ids.length) return;
  
      // жёстко перехватываем, чтобы app.js не делал indent/outdent для одного selectedId
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  
      const parentId = allSameParent(ids);
      if (!parentId) return;
  
      if (e.key === "ArrowRight") {
        indentMany(ids, parentId);
        return;
      }
  
      if (e.key === "ArrowLeft") {
        outdentMany(ids);
        return;
      }
    }
  
    window.addEventListener("keydown", onKeyDown, true);
  
    // API (на будущее)
    window.multiMoveHierarchy = {
      indent() {
        const ids = getMultiIds();
        const parentId = allSameParent(ids);
        if (!parentId) return false;
        return indentMany(ids, parentId);
      },
      outdent() {
        return outdentMany(getMultiIds());
      },
    };
  })();
  