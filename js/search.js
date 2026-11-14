// search.js — country / region search with a suggestion list (accessible combobox).
//   type → matches appear (countries, regions, oceans)   ↑ ↓ choose (narrated)   Enter go   Esc clear / leave
//   After choosing, focus goes back to the globe so the arrow keys work straight away.

import { searchPlaces } from './places.js';
import { speak, sayAfterPause } from './speech.js';

export function initSearch({ form, input, list, clearBtn, onChoose, onLeave, sound = () => {} }) {
  let results = [], active = -1;
  const kind = p => p.world ? 'zoom out' : p.region ? 'region' : 'country';

  function render() {
    list.innerHTML = results.map((p, i) =>
      `<li role="option" id="search-opt-${i}" aria-selected="${i === active}" class="${i === active ? 'active' : ''}">` +
      `${p.name}<span class="kind">${kind(p)}</span></li>`).join('');
    const open = results.length > 0;
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    if (active >= 0) input.setAttribute('aria-activedescendant', `search-opt-${active}`);
    else input.removeAttribute('aria-activedescendant');
    clearBtn.hidden = !input.value;
  }

  function close() { results = []; active = -1; render(); }

  function choose(p) {
    if (!p) {
      sound('error');
      speak(input.value.trim() ? `Nothing found for ${input.value}. Try Greece, Japan, Kenya, or Arctic.` : 'Type a country or region first.');
      return;
    }
    input.value = p.world ? '' : p.name;
    close();
    sound('select');
    onChoose(p);
  }

  input.addEventListener('input', () => {
    results = searchPlaces(input.value);
    active = results.length ? 0 : -1;
    render();
    if (input.value.trim()) {
      sayAfterPause(results.length
        ? `${results.length} ${results.length === 1 ? 'match' : 'matches'}: ${results.map(p => p.name).join(', ')}. Up and down to choose, Enter to go.`
        : 'No matches.', 600);
    }
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!results.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      render();
      sound('move');
      sayAfterPause(`${results[active].name}, ${kind(results[active])}. ${active + 1} of ${results.length}.`, 100);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (results.length) close();
      else { input.value = ''; render(); onLeave(); }
    }
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    choose(results[active] ?? searchPlaces(input.value, 1)[0]);
  });
  list.addEventListener('mousedown', e => {          // mousedown so it fires before the input loses focus
    const li = e.target.closest('li');
    if (!li) return;
    e.preventDefault();
    choose(results[[...list.children].indexOf(li)]);
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('focus', () => speak('Search. Type a country, region or ocean, for example Greece or Arctic.', { subtitle: false }));
  clearBtn.addEventListener('click', () => { input.value = ''; close(); input.focus(); });

  render();
  return { focus: () => input.focus() };
}
