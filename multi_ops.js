// // multi_ops.js
// // Массовые операции над мультивыделением (.row.multi):
// // - Delete: удалить все выделенные синим элементы одним действием (1 шаг Undo)
// //
// // Работает через DOM (.row.multi), потому что range/deep патчи могут хранить state внутри себя.

// (function () {
//   if (typeof window === "undefined") return;

//   const HOST_ID = "tree";

//   function host() {
//     return document.getElementById(HOST_ID);
//   }

//   function isEditingNow() {
//     const ae = document.activeElement;
//     if (!ae) return false;
//     // редактирование имени в дереве
//     if (ae.tagName === "INPUT" && ae.classList && ae.classList.contains("edit")) return true;
//     // телеграм-режим: textarea
//     if (ae.tagName === "TEXTAREA" && ae.classList && ae.classList.contains("tg-export")) return true;
//     return false;
//   }

//   function getMultiIdsFromDom() {
//     const h = host();
//     if (!h) return [];
//     return Array.from(h.querySelectorAll(".row.multi"))
//       .map((r) => r?.dataset?.id)
//       .filter(Boolean);
//   }

//   // возвращает true если a является предком b (по данным дерева app.js)
//   function isAncestorId(a, b) {
//     if (!a || !b || a === b) return false;
//     let cur = b;
//     while (true) {
//       const p = parentOf(cur); // функция из app.js :contentReference[oaicite:1]{index=1}
//       if (!p) return false;
//       if (p === a) return true;
//       cur = p;
//     }
//   }

//   function filterTopmost(ids) {
//     // если выбран и родитель, и потомок — удаляем только родителя
//     const set = new Set(ids);
//     const out = [];
//     for (const id of ids) {
//       let hasSelectedAncestor = false;
//       let cur = id;
//       while (true) {
//         const p = parentOf(cur);
//         if (!p) break;
//         if (set.has(p)) { hasSelectedAncestor = true; break; }
//         cur = p;
//       }
//       if (!hasSelectedAncestor) out.push(id);
//     }
//     return out;
//   }

//   function deleteMany(ids) {
//     if (!ids || ids.length === 0) return false;

//     // safety: root нельзя удалять
//     const safe = ids.filter((id) => id && id !== root.id); // root из app.js :contentReference[oaicite:2]{index=2}
//     if (safe.length === 0) return false;

//     const topmost = filterTopmost(safe);

//     // 1 шаг undo на всю пачку
//     pushHistory(); // из app.js :contentReference[oaicite:3]{index=3}

//     // удаляем
//     for (const id of topmost) {
//       const r = findWithParent(root, id); // из app.js :contentReference[oaicite:4]{index=4}
//       if (!r || !r.parent) continue;
//       r.parent.children = (r.parent.children || []).filter((x) => x.id !== id);
//     }

//     // поправим selectedId, если его удалили (или он стал невалидным)
//     const stillExists = findWithParent(root, selectedId); // из app.js :contentReference[oaicite:5]{index=5}
//     if (!stillExists) {
//       // попробуем поставить на родителя первого удалённого
//       const p = parentOf(topmost[0]);
//       selectedId = p || root.id;
//     }

//     // попытка сбросить состояния патчей, если они экспортируют API
//     try { window.multiSelectDeep?.clear?.(); } catch (_) {}
//     try { window.multiSelectRange?.clear?.(); } catch (_) {}

//     // перерисовка
//     treeHasFocus = true; // из app.js :contentReference[oaicite:6]{index=6}
//     render();            // из app.js :contentReference[oaicite:7]{index=7}

//     // на всякий случай снять классы в DOM (если какой-то патч не сбросился)
//     try {
//       const h = host();
//       if (h) h.querySelectorAll(".row.multi").forEach((el) => el.classList.remove("multi"));
//     } catch (_) {}

//     return true;
//   }

//   function handleDeleteHotkey(e) {
//     if (isEditingNow()) return;

//     if (e.key !== "Delete") return;

//     const ids = getMultiIdsFromDom();
//     if (ids.length === 0) return; // пусть app.js удаляет одиночный

//     // если выделен только один — тоже считаем как multi (удаляем его пачкой, но это 1 шаг undo)
//     const did = deleteMany(ids);
//     if (!did) return;

//     e.preventDefault();
//     e.stopPropagation();
//   }

//   // В capture, чтобы сработать раньше обработчиков app.js (которые тоже слушают Delete)
//   window.addEventListener("keydown", handleDeleteHotkey, true);

//   // API на будущее (перемещение и т.п.)
//   window.multiOps = {
//     deleteSelected() {
//       return deleteMany(getMultiIdsFromDom());
//     },
//     getSelectedIds() {
//       return getMultiIdsFromDom();
//     },
//   };
// })();
