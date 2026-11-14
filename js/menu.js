// menu.js — game-console style menus, fully usable without seeing the screen.
//   ↑ ↓  move between items (wraps)      ← →  change a setting      Enter / Space  choose
//   Home / End  first / last item        Esc  close                 the narrator reads every item
//
//   openMenu({ id, title, intro, items, onClose })
//   item: { label, help, kind: 'action' | 'toggle' | 'choice',
//           get(): current value, set(v), options: [{ value, label }]   (toggle/choice)
//           run()                                                        (action) }
//   isMenuOpen()   closeMenu()

import { speak, sayAfterPause } from './speech.js';

let current = null;   // { id, el, items, index, onClose, returnFocus }

const valueText = item => {
  if (item.kind === 'toggle') return item.get() ? 'on' : 'off';
  if (item.kind === 'choice') return item.options.find(o => o.value === item.get())?.label ?? '';
  return '';
};
const spoken = (item, i, n) => {
  const v = valueText(item);
  const how = item.kind === 'choice' ? 'Left and right to change.' : item.kind === 'toggle' ? 'Enter to switch.' : '';
  const end = !v && /[.?!]$/.test(item.label) ? ' ' : '. ';   // "What is Earth Jukebox?" — no extra full stop
  return `${item.label}${v ? ', ' + v : ''}${end}${item.help ?? ''} ${how} ${i + 1} of ${n}.`.replace(/\s+/g, ' ').trim();
};

export const isMenuOpen = () => !!current;

export function openMenu({ id, title, intro = '', items, onClose, sound = () => {} }) {
  if (current) closeMenu(false);
  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML = `
    <div class="menu" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
      <h2 id="${id}-title">${title}</h2>
      <ul role="menu" aria-labelledby="${id}-title"></ul>
      <p class="menu-keys" aria-hidden="true">↑↓ move · ←→ change · Enter choose · Esc close</p>
    </div>`;
  const ul = el.querySelector('ul');
  items.forEach((item, i) => {
    const li = document.createElement('li');
    li.tabIndex = -1;
    li.id = `${id}-item-${i}`;
    li.setAttribute('role', item.kind === 'toggle' ? 'menuitemcheckbox' : 'menuitem');
    li.addEventListener('click', () => { focusItem(i, false); activate(); });
    ul.append(li);
  });
  document.body.append(el);
  current = { id, el, ul, items, index: 0, onClose, sound, returnFocus: document.activeElement };
  el.addEventListener('keydown', onKey);
  el.addEventListener('click', e => { if (e.target === el) closeMenu(); });   // click outside the box closes
  renderAll();
  sound('open');
  focusItem(0, false);
  speak(`${title}. ${intro} ${spoken(items[0], 0, items.length)}`.replace(/\s+/g, ' '));
}

function renderAll() {
  current.items.forEach((item, i) => renderItem(i));
}
function renderItem(i) {
  const item = current.items[i], li = current.ul.children[i], v = valueText(item);
  li.innerHTML = `<span class="label">${item.label}</span>` +
    (item.kind === 'choice' ? `<span class="value">◀ ${v} ▶</span>` : item.kind === 'toggle' ? `<span class="value">${v}</span>` : '');
  if (item.kind === 'toggle') li.setAttribute('aria-checked', String(!!item.get()));
  li.setAttribute('aria-label', `${item.label}${v ? ', ' + v : ''}`);
  li.classList.toggle('active', i === current.index);
}

function focusItem(i, announce = true) {
  const n = current.items.length;
  current.index = (i + n) % n;
  [...current.ul.children].forEach((li, k) => {
    li.classList.toggle('active', k === current.index);
    li.tabIndex = k === current.index ? 0 : -1;        // "roving tab stop": the chosen item is the keyboard stop
  });
  current.ul.children[current.index].focus();
  if (announce) { current.sound('move'); sayAfterPause(spoken(current.items[current.index], current.index, n), 120); }
}

function change(dir) {
  const item = current.items[current.index];
  if (item.kind === 'toggle') item.set(!item.get());
  else if (item.kind === 'choice') {
    const opts = item.options, k = opts.findIndex(o => o.value === item.get());
    const next = Math.max(0, Math.min(opts.length - 1, k + dir));
    if (next === k) { current.sound('edge'); return; }
    item.set(opts[next].value);
  } else return;
  renderItem(current.index);
  current.sound('move');
  sayAfterPause(`${item.label}, ${valueText(item)}.`, 150);
}

function activate() {
  const item = current.items[current.index];
  if (item.kind === 'action') { current.sound('select'); item.run(); }
  else if (item.kind === 'toggle') change(1);
  else change(1);
}

function onKey(e) {
  if (!current) return;
  const keys = {
    ArrowDown: () => focusItem(current.index + 1), ArrowUp: () => focusItem(current.index - 1),
    Home: () => focusItem(0), End: () => focusItem(current.items.length - 1),
    ArrowRight: () => change(1), ArrowLeft: () => change(-1),
    Enter: activate, Space: activate, Escape: () => closeMenu(),
  };
  const fn = keys[e.code] ?? keys[e.key];
  e.stopPropagation();                         // the globe's keys don't act while a menu is open
  if (fn) { e.preventDefault(); fn(); return; }
  // the key that opened this menu also closes it (M for the menu, H for help)
  if ((current.id === 'settings' && e.code === 'KeyM') || (current.id === 'help' && e.code === 'KeyH')) { e.preventDefault(); closeMenu(); }
  if (e.code === 'Tab') { e.preventDefault(); focusItem(current.index + (e.shiftKey ? -1 : 1)); }   // keep focus inside
}

export function closeMenu(announce = true) {
  if (!current) return;
  const { el, onClose, returnFocus, sound } = current;
  current = null;
  el.remove();
  if (announce) sound('close');
  returnFocus?.focus?.();
  onClose?.(announce);
}
