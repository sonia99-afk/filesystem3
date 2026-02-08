// // multi_move.js
// // Массовое перемещение выделенных (.row.multi)
// // Shift + ArrowUp / ArrowDown
// // Работает ТОЛЬКО внутри одного родителя

// (function () {
//     if (typeof window === "undefined") return;
  
//     const HOST_ID = "tree";
  
//     function host() {
//       return document.getElementById(HOST_ID);
//     }
  
//     function isEditingNow() {
//       const ae = document.activeElement;
//       if (!ae) return false;
//       if (ae.tagName === "INPUT" && ae.classList?.contains("edit")) return true;
//       if (ae.tagName === "TEXTAREA" && ae.classList?.contains("tg-export")) return true;
//       return false;
//     }
  
//     function getMultiIds() {
//       const h = host();
//       if (!h) return [];
//       return Array.from(h.querySelectorAll(".row.multi"))
//         .map(r => r.dataset?.id)
//         .filter(Boolean);
//     }
  
//     function allSameParent(ids) {
//       const parents = new Set(ids.map(id => parentOf(id) || "ROOT"));
//       return parents.size === 1 ? parents.values().next().value : null;
//     }
  
//     function moveBlock(ids, dir /* -1 | +1 */) {
//       if (!ids.length) return false;
  
//       const parentId = allSameParent(ids);
//       if (!parentId) return false;
  
//       const parentNode =
//         parentId === "ROOT"
//           ? root
//           : findWithParent(root, parentId)?.node;
  
//       if (!parentNode || !Array.isArray(parentNode.children)) return false;
  
//       const children = parentNode.children;
//       const selectedSet = new Set(ids);
  
//       const block = [];
//       const rest = [];
  
//       for (const n of children) {
//         if (selectedSet.has(n.id)) block.push(n);
//         else rest.push(n);
//       }
  
//       if (!block.length) return false;
  
//       const firstIndex = children.findIndex(n => selectedSet.has(n.id));
//       const lastIndex = firstIndex + block.length - 1;
  
//       if (dir < 0 && firstIndex === 0) return false;
//       if (dir > 0 && lastIndex === children.length - 1) return false;
  
//       const insertAt = dir < 0
//         ? firstIndex - 1
//         : firstIndex + 1;
  
//       pushHistory();
  
//       const next = [...children];
//       next.splice(firstIndex, block.length);
//       next.splice(insertAt, 0, ...block);
  
//       parentNode.children = next;
  
//       treeHasFocus = true;
//       render();
//       return true;
//     }
  
//     function onKeyDown(e) {
//       if (window.hotkeysMode === "custom") return;
//       if (isEditingNow()) return;
  
//       if (
//         !e.shiftKey ||
//         e.ctrlKey || e.metaKey || e.altKey ||
//         (e.key !== "ArrowUp" && e.key !== "ArrowDown")
//       ) return;
  
//       const ids = getMultiIds();
//       if (!ids.length) return;
  
//       // 🔒 ВАЖНО: всегда перехватываем
//       e.preventDefault();
//       e.stopPropagation();
  
//       const dir = e.key === "ArrowUp" ? -1 : +1;
//       moveBlock(ids, dir);
//     }
  
//     window.addEventListener("keydown", onKeyDown, true);
  
//     // API (на будущее)
//     window.multiMove = {
//       up() {
//         return moveBlock(getMultiIds(), -1);
//       },
//       down() {
//         return moveBlock(getMultiIds(), +1);
//       }
//     };
//   })();
  