// tg_export_mode.js
// Режим Telegram: экспорт ASCII + ручное редактирование + импорт обратно в дерево.
// ВАЖНО: root из app.js не в window, но он в общем scope, его можно мутировать in-place.

(function () {
  let tgMode = false;
  let lastAscii = '';

  function getNodeLabelFromRow(row) {
    const clone = row.cloneNode(true);
    const act = clone.querySelector('.act');
    if (act) act.remove();
    return (clone.textContent || '').trim();
  }

  function buildTreeFromDom() {
    const host = document.getElementById('tree');
    if (!host) return null;

    const ul = host.querySelector('ul');
    if (!ul) return null;

    function walkLi(li) {
      const row = li.querySelector(':scope > .row');
      if (!row) return null;

      const node = { label: getNodeLabelFromRow(row), children: [] };

      const childUl = li.querySelector(':scope > ul');
      if (childUl) {
        const childLis = Array.from(childUl.children).filter(el => el.tagName === 'LI');
        for (const chLi of childLis) {
          const chNode = walkLi(chLi);
          if (chNode) node.children.push(chNode);
        }
      }
      return node;
    }

    const topLi = ul.querySelector(':scope > li') || ul.querySelector('li');
    if (!topLi) return null;

    return walkLi(topLi);
  }

  function dashByLevel(level) {
    switch (level) {
      case 1: return '- ';
      case 2: return '- - ';
      case 3: return '- - - ';
      default: return '';
    }
  }

  function asciiFromTree(tree) {
    const lines = [];
    function rec(node, depth) {
      lines.push(dashByLevel(depth) + node.label);
      (node.children || []).forEach(ch => rec(ch, depth + 1));
    }
    rec(tree, 0);
    return '```\n' + lines.join('\n') + '\n```';
  }

  function stripCodeFences(s) {
    const t = String(s || '').trim();
    if (t.startsWith('```') && t.endsWith('```')) {
      return t.replace(/^```[\s\r\n]*/, '').replace(/[\s\r\n]*```$/, '');
    }
    return t;
  }

  function treeFromAscii(text) {
    const clean = stripCodeFences(text);

    const lines = clean
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    const stack = [];
    let newRoot = null;

    for (const line of lines) {
      const m = line.match(/^((?:-\s*)*)\s*(.+)$/);
if (!m) continue;

// считаем количество '-' в префиксе (пробелы игнорируем)
const level = (m[1].match(/-/g) || []).length;

const name = m[2].trim();
if (!name) continue;

      const node = {
        id: Math.random().toString(36).slice(2),
        level: Math.max(0, Math.min(3, level)),
        name,
        children: []
      };

      if (node.level === 0) {
        // ✅ Разрешаем только ОДИН root (первую строку без '-')
        // Всё остальное без '-' считаем мусором и игнорируем при сохранении.
        if (newRoot) continue;
      
        newRoot = node;
        stack.length = 0;
        stack.push(node);
        continue;
      }

      while (stack.length > node.level) stack.pop();
      const parent = stack[stack.length - 1];
      if (!parent) continue;

      parent.children.push(node);
      stack.push(node);
    }

    return newRoot;
  }

  function renderTelegramView() {
    
    const host = document.getElementById('tree');
    if (!host) return;

    const tree = buildTreeFromDom();
    lastAscii = tree ? asciiFromTree(tree) : '```\n(дерево не найдено)\n```';

    host.innerHTML = '';

    const bar = document.createElement('div');
    bar.className = 'tgbar';

    const backBtn = document.createElement('button');
    backBtn.textContent = 'Сохранить';

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Копировать';

    const ta = document.createElement('textarea');
    ta.className = 'tg-export';
    ta.value = lastAscii;
    ta.style.width = '35%';
    ta.style.minHeight = '300px';

    const SAVE_TEXT = 'Сохранить';
const SAVED_TEXT = 'Сохранить ✓';

let isSaved = false;

function setSavedState(saved) {
  isSaved = saved;
  backBtn.textContent = saved ? SAVED_TEXT : SAVE_TEXT;
}

        // чтобы события из tg-UI не долетали до обработчика #tree.click в app.js
        const stop = (e) => e.stopPropagation();

        bar.addEventListener('pointerdown', stop);
        bar.addEventListener('mousedown', stop);
        bar.addEventListener('click', stop);
    
        ta.addEventListener('pointerdown', stop);
        ta.addEventListener('mousedown', stop);
        ta.addEventListener('click', stop);
    

    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(ta.value);
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Скопировано ✓';

        setTimeout(() => {
          copyBtn.textContent = originalText;
        }, 900);
      } catch (e) {
        alert('Не получилось скопировать. Попробуй выделить текст вручную и Ctrl+C.');
      }
    };

    ta.addEventListener('input', () => {
      if (isSaved) setSavedState(false);
    });

    backBtn.onclick = () => {
      const newTree = treeFromAscii(ta.value);
  if (!newTree) {
    alert('Не удалось распознать дерево. Проверь формат.');
    return;
  }

  // мутируем root in-place
  root.id = newTree.id;
  root.level = newTree.level;
  root.name = newTree.name;
  root.children = newTree.children;

  selectedId = root.id;

  // ✅ помечаем как сохранённое (и остаётся так)
  setSavedState(true);
      
    };
    

    bar.append(backBtn, copyBtn);
    host.append(bar, ta);
  }

  function patchRender() {
    if (typeof window.render !== 'function') return;
    if (window.render.__tgPatched) return;

    const _render = window.render;

    function patchedRender() {
      if (tgMode) {
        _render();           // чтобы DOM дерева был актуален
        renderTelegramView(); // потом заменяем на textarea
      } else {
        _render();
      }
    }

    updateToggleBtn();

    patchedRender.__tgPatched = true;
    window.render = patchedRender;
  }

  function updateToggleBtn() {
    const b = document.getElementById('tgToggle');
    if (!b) return;
    b.textContent = tgMode ? 'Стандартный режим' : 'Текстовый режим';
  }

  window.toggleTelegramMode = function () {
    tgMode = !tgMode;
    updateToggleBtn();
    window.render();
  };


  function installTelegramEventTrap() {
    const host = document.getElementById('tree');
    if (!host || host.__tgTrapInstalled) return;
    host.__tgTrapInstalled = true;

    function isTextareaTarget(e) {
      const t = e.target;
      return !!(t && t.closest && t.closest('textarea.tg-export'));
    }

    function trapKey(e) {
      if (!tgMode) return;
      if (!isTextareaTarget(e)) return;

      // важно: не preventDefault — чтобы ввод/курсор работали
      // но не даём событию долететь до обработчиков app.js
      e.stopPropagation();
      e.stopImmediatePropagation();
    }

    // Трапим ТОЛЬКО клавиатуру (стрелки/Del/Enter и т.п.)
    host.addEventListener('keydown', trapKey, true);
  }

  
  

  installTelegramEventTrap();
patchRender();


})();
