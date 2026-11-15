// app.js — wires everything together.
//   data.js → numbers        audio.js → sound          globe.js → 3D globe        state.js → { yi, needleLon, cursorLat, zoom }
//   speech.js → narrator     menu.js → game menus      search.js → search bar     features.js → T C L R N D keys
//   places.js / regions.js → place names
//
// Two modes (chosen on the start screen, changeable in the menu):
//   Listening mode (default) — narrator on, keyboard first; each move is described, then the music resumes
//   Visual mode              — narrator off (screen readers still get everything), music follows the mouse instantly

import { loadDataset } from './data.js';
import { audio } from './audio.js';
import { initGlobe } from './globe.js';
import { placeAt } from './places.js';
import { regionName } from './regions.js';
import { speak, sayAfterPause, whenQuiet, stopSpeaking, speechSettings } from './speech.js';
import { createFeatures } from './features.js';
import { openMenu, closeMenu, isMenuOpen } from './menu.js';
import { initSearch } from './search.js';
import { state, setState, subscribe, wrapLon, clampLat, clampZoom } from './state.js';

const $ = id => document.getElementById(id);
const DEBUG = new URLSearchParams(location.search).has('debug');

const ds = await loadDataset('gistemp');
const lastYi = ds.years.length - 1;
const yi1951 = ds.years.indexOf(1951);

// ---------- words ----------
const lonLabel = lon => lon === 0 ? '0°' : Math.abs(lon) === 180 ? '180°' : `${Math.abs(lon)}° ${lon > 0 ? 'E' : 'W'}`;
const latLabel = lat => lat === 0 ? 'Equator' : `${Math.abs(lat)}° ${lat > 0 ? 'N' : 'S'}`;
const lonWords = lon => lon === 0 ? '0 degrees' : `${Math.abs(lon)} degrees ${lon > 0 ? 'east' : 'west'}`;
const latWords = lat => lat === 0 ? 'the equator' : `${Math.abs(lat)} degrees ${lat > 0 ? 'north' : 'south'}`;
const signed = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)} °C`;
const short = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}°`;
const words = v => v === null ? 'no measurement'
  : Math.abs(v) < 0.2 ? 'about normal'
  : `${Math.abs(v) >= 1.98 ? '2 degrees or more' : Math.abs(v).toFixed(1) + ' degrees'} ${v > 0 ? 'warmer' : 'colder'} than normal`;
const shortWords = v => v === null ? 'no data' : Math.abs(v) < 0.2 ? 'normal' : `${v > 0 ? 'plus' : 'minus'} ${Math.abs(v).toFixed(1)}`;
// NASA GISS: the 1951-1980 world average was about 14 °C (GISTEMP FAQ, "The Elusive Absolute Surface Air Temperature").
// Only the WORLD number can be turned into a real temperature; local baselines aren't in this dataset.
const WORLD_BASE_C = 14;
const worldTemp = v => `${(WORLD_BASE_C + v).toFixed(1)}°`;
const worldWords = v => `about ${(WORLD_BASE_C + v).toFixed(1)} degrees, ${words(v)}`;
const here = () => ds.getValue(state.yi, state.cursorLat, state.needleLon);
const placeName = () => placeAt(state.cursorLat, state.needleLon)?.name ?? regionName(state.cursorLat, state.needleLon, 'en');

// ---------- settings (remembered on this computer) ----------
const settings = Object.assign({
  mode: 'listening', narrator: true, narratorByMode: { listening: true, visual: false }, rate: 1.1, detailed: true, subtitles: true,
  volume: 0, hum: true, rhythm: true, strumSpeed: 3, exploreTouch: false, readableFont: false, bigText: false,
}, JSON.parse(localStorage.getItem('degrees-of-sound-settings') || '{}'));
const save = () => localStorage.setItem('degrees-of-sound-settings', JSON.stringify(settings));
const SPEEDS = { 1: 110, 2: 80, 3: 50, 4: 35, 5: 22 };
const BASE_DB = audio.CONFIG.masterDb;
function applySettings() {
  settings.narratorByMode[settings.mode] = settings.narrator;   // remember the choice for this mode
  speechSettings.setNarrator(settings.narrator);
  speechSettings.setRate(settings.rate);
  speechSettings.setSubtitles(settings.subtitles);
  audio.setVolume(BASE_DB + settings.volume);
  audio.setDroneOn(settings.hum);
  audio.setRhythmOn(settings.rhythm);
  audio.setStrumGap(SPEEDS[settings.strumSpeed]);
  document.body.classList.toggle('readable-font', settings.readableFont);
  document.body.classList.toggle('big-text', settings.bigText);
  save();
}

const describe = (full = settings.detailed) => full
  ? `${placeName()}. ${latWords(state.cursorLat)}, ${lonWords(state.needleLon)}. ${ds.years[state.yi]}: ${words(here())}. World average: ${worldWords(ds.globalMean[state.yi])}.`
  : `${placeName()}, ${ds.years[state.yi]}: ${shortWords(here())}.`;

const features = createFeatures({ ds, audio, signed, here, where: placeName, show: t => { $('caption').textContent = t; }, resume: () => startSpot() });

// ---------- music (S / Space / ▶ button) ----------
function renderPlay() {
  const on = audio.playing;
  $('playBtn').textContent = on ? '❚❚' : '▶';
  $('playBtn').setAttribute('aria-pressed', String(on));
  $('playBtn').setAttribute('aria-label', `Music ${on ? 'on' : 'off'}. Shortcut S.`);
  $('playLabel').textContent = `Music ${on ? 'on' : 'off'} · S`;
}
// play the current spot's tune (in listening mode, after the narrator has finished)
function startSpot() {
  if (!audio.playing) return;
  const go = () => {
    if (!audio.playing) return;
    audio.setDrone(ds.globalMean[state.yi]);
    if (here() === null) { audio.stopHold(); audio.earcon('nodata'); } else audio.hold(here());
    if (DEBUG) renderDebug(audio.plan(ds.getColumn(state.yi, state.needleLon), audio.bandOfLat(state.cursorLat)));
  };
  if (settings.mode === 'listening') whenQuiet(go, 'music'); else go();
}
function setMusic(on, announce = true) {
  if (!audio.ready) return;
  audio.setPlaying(on);
  renderPlay();
  if (announce) speak(on ? 'Music on.' : 'Music off.', { subtitle: false });
  if (on) startSpot();
}
const toggleMusic = () => setMusic(!audio.playing);
function playLine() {
  if (!audio.ready) return;
  stopSpeaking();
  const played = audio.strum(ds.getColumn(state.yi, state.needleLon), audio.bandOfLat(state.cursorLat));
  if (DEBUG) renderDebug(played);
}

// ---------- rings + readings ----------
const C = 2 * Math.PI * 42;
const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
const ringColor = v => v === null ? 'rgb(90,90,100)' : `rgb(${(v >= 0 ? mix([255, 214, 120], [255, 70, 40], Math.min(1, v / 2)) : mix([190, 230, 255], [40, 120, 255], Math.min(1, -v / 2))).join(',')})`;
function setRing(id, v, aria, label) {
  const el = $(id), arc = el.querySelector('.arc');
  arc.style.strokeDasharray = C;
  arc.style.strokeDashoffset = C * (1 - (v === null ? 0 : Math.min(1, Math.abs(v) / 2)));
  arc.style.stroke = ringColor(v);
  el.querySelector('.ring-value').textContent = v === null ? '—' : (label ?? short(v));
  el.querySelector('.ring-value').style.color = ringColor(v);
  el.setAttribute('aria-label', aria);
}
function render() {
  const year = ds.years[state.yi], v = here(), gm = ds.globalMean[state.yi];
  const then = ds.getValue(yi1951, state.cursorLat, state.needleLon);
  const change = v === null || then === null ? null : v - then;
  $('year').value = state.yi;
  $('year').setAttribute('aria-valuetext', String(year));
  $('yearOut').textContent = year;
  $('lonInput').value = state.needleLon;
  $('lonInput').setAttribute('aria-valuetext', lonWords(state.needleLon));
  $('latInput').value = state.cursorLat;
  $('latInput').setAttribute('aria-valuetext', latWords(state.cursorLat));
  $('placeName').textContent = placeName();
  $('coords').textContent = `${latLabel(state.cursorLat)} · ${lonLabel(state.needleLon)} · ${year}`;
  setRing('ringHere', v, `Here: ${words(v)}`);
  setRing('ringWorld', gm, `World average: ${worldWords(gm)}`, worldTemp(gm));
  setRing('ringChange', change, change === null ? 'Change since 1951: no data' : `Change since 1951: ${Math.abs(change).toFixed(1)} degrees ${change >= 0 ? 'warmer' : 'colder'}`);
}

// ---------- reacting to moves ----------
let prevLat = state.cursorLat, hints = 0, soundTimer, started = false;   // started: the user has left the start screen
subscribe((s, ch) => {
  render();
  if (!started || !(ch.yi || ch.needleLon || ch.cursorLat)) return;   // not started yet, or zoom only
  features.stop();
  if (ch.cursorLat && Math.sign(s.cursorLat) !== Math.sign(prevLat)) audio.earcon('equator');
  prevLat = s.cursorLat;
  let text = (ch.yi ? `${ds.years[s.yi]}. ` : '') + (settings.detailed ? `${placeName()}: ${words(here())}.` : `${placeName()}: ${shortWords(here())}.`);
  if (!audio.playing && hints < 2 && settings.mode === 'listening') { text += ' Press S for music.'; hints++; }
  if (settings.mode === 'listening') {
    if (audio.playing) audio.stopHold();                           // quiet while the narrator talks…
    sayAfterPause(text);
    startSpot();                                                   // …then the new spot's tune
  } else {
    sayAfterPause(text, 700, { subtitle: false });                 // screen readers only; the rings show it
    clearTimeout(soundTimer);
    soundTimer = setTimeout(startSpot, 150);
  }
});

// ---------- keyboard ----------
const onSlider = el => el?.tagName === 'INPUT' && el.type === 'range';
document.addEventListener('keydown', e => {
  if (!$('intro').hidden || isMenuOpen()) return;                  // the start screen and menus handle their own keys
  if (e.target.id === 'searchInput' || e.ctrlKey || e.metaKey || e.altKey) return;
  const slider = onSlider(e.target);
  const big = e.shiftKey ? 2 : 10, years = e.shiftKey ? 10 : 1;
  const onButton = e.target.tagName === 'BUTTON';
  const move = patch => { if (Object.keys(patch).every(k => patch[k] === state[k])) audio.earcon('edge'); else setState(patch); };
  switch (e.code) {
    case 'ArrowLeft':  if (slider) return; move({ needleLon: wrapLon(state.needleLon - big) }); break;
    case 'ArrowRight': if (slider) return; move({ needleLon: wrapLon(state.needleLon + big) }); break;
    case 'ArrowUp':    if (slider) return; move({ cursorLat: clampLat(state.cursorLat + big) }); break;
    case 'ArrowDown':  if (slider) return; move({ cursorLat: clampLat(state.cursorLat - big) }); break;
    case 'Comma': case 'PageDown': move({ yi: Math.max(0, state.yi - years) }); break;
    case 'Period': case 'PageUp':  move({ yi: Math.min(lastYi, state.yi + years) }); break;
    case 'Home': if (slider) return; move({ yi: 0 }); break;
    case 'End':  if (slider) return; move({ yi: lastYi }); break;
    case 'KeyS': toggleMusic(); break;
    case 'Space': if (onButton) return; toggleMusic(); break;      // on a button, Space presses the button
    case 'Enter': if (onButton) return; playLine(); break;
    case 'KeyM': openSettings(); break;
    case 'KeyH': case 'F1': openHelp(); break;
    case 'Slash': if (e.shiftKey) openHelp(); else search.focus(); break;   // Shift+/ is "?"
    case 'KeyV': setNarrator(!settings.narrator); break;
    case 'KeyW': speak(describe(true)); break;
    case 'KeyT': features.history(); break;
    case 'KeyC': features.compare(); break;
    case 'KeyL': features.guide(); break;
    case 'KeyR': features.radar(!e.shiftKey); break;
    case 'KeyG': features.goToFound(); break;
    case 'KeyN': features.nearby(); break;
    case 'KeyD': features.downloadCsv(); break;
    case 'Equal': case 'NumpadAdd':      setState({ zoom: clampZoom(state.zoom + 0.25) }); break;
    case 'Minus': case 'NumpadSubtract': setState({ zoom: clampZoom(state.zoom - 0.25) }); break;
    case 'Escape': features.stop(); stopSpeaking(); audio.scrub(null); startSpot(); break;   // stops talk + tours, not the music
    default: return;
  }
  e.preventDefault();
});
document.addEventListener('keyup', e => { if (e.key === 'Shift') audio.scrub(null); });

function setNarrator(on) {
  settings.narrator = on;
  applySettings();
  if (on) speak('Voice guide on.');
  else speak('Voice guide off. Screen readers will still hear everything.');   // goes to the screen reader now
}

// ---------- mouse controls ----------
$('year').max = lastYi;
$('year').oninput = e => setState({ yi: +e.target.value });
$('lonInput').oninput = e => setState({ needleLon: +e.target.value });
$('latInput').oninput = e => setState({ cursorLat: +e.target.value });
$('playBtn').onclick = toggleMusic;
$('lineBtn').onclick = playLine;
$('csvBtn').onclick = () => features.downloadCsv();
$('helpBtn').onclick = () => openHelp();
$('menuBtn').onclick = () => openSettings();

// ---------- search ----------
const search = initSearch({
  form: $('searchForm'), input: $('searchInput'), list: $('searchList'), clearBtn: $('searchClear'),
  sound: t => audio.earcon(t),
  onLeave: () => $('globe').focus(),
  onChoose: p => {
    $('globe').focus();
    if (p.world) { setState({ zoom: 0 }); speak('Whole world view.'); return; }
    const same = state.needleLon === p.lon && state.cursorLat === p.lat;
    setState({ needleLon: p.lon, cursorLat: p.lat, zoom: 0.65 });
    if (same) speak(describe());
  },
});

// ---------- menus ----------
const choice = (label, help, key, options, after) => ({
  kind: 'choice', label, help, options,
  get: () => settings[key], set: v => { settings[key] = v; applySettings(); after?.(v); },
});
const toggle = (label, help, key, after) => ({
  kind: 'toggle', label, help,
  get: () => settings[key], set: v => { settings[key] = v; applySettings(); after?.(v); },
});
const action = (label, help, run) => ({ kind: 'action', label, help, run });
const menuSound = t => audio.earcon(t);

function openSettings() {
  openMenu({
    id: 'settings', title: 'Menu', intro: 'Up and down to move, left and right to change, Escape to close.', sound: menuSound,
    items: [
      { kind: 'choice', label: 'Mode', help: 'Listening mode is guided by voice. Visual mode is for sighted users with a mouse.',
        options: [{ value: 'listening', label: 'Listening' }, { value: 'visual', label: 'Visual' }],
        get: () => settings.mode, set: m => setMode(m, false) },
      toggle('Voice guide', 'The narrator. Turn it off if you use your own screen reader.', 'narrator'),
      choice('Voice speed', '', 'rate', [{ value: 0.8, label: 'slow' }, { value: 1.1, label: 'normal' }, { value: 1.4, label: 'fast' }, { value: 1.8, label: 'very fast' }]),
      choice('Descriptions', 'How much the narrator says when you move.', 'detailed', [{ value: true, label: 'detailed' }, { value: false, label: 'short' }]),
      toggle('Subtitles', 'Show what the narrator says under the globe.', 'subtitles'),
      choice('Volume', '', 'volume', [-12, -9, -6, -3, 0, 3, 6, 9, 12].map(v => ({ value: v, label: `${v > 0 ? '+' : ''}${v} dB` }))),
      toggle('Background hum', 'A low sound that follows the world average.', 'hum'),
      toggle('Rhythm', 'Bass and soft drums under the tune.', 'rhythm'),
      choice('Line speed', 'How fast Enter plays the north to south line.', 'strumSpeed',
        [1, 2, 3, 4, 5].map(v => ({ value: v, label: ['very slow', 'slow', 'normal', 'fast', 'very fast'][v - 1] }))),
      toggle('Explore by touch', 'Dragging on the globe plays the spot under your finger.', 'exploreTouch'),
      toggle('Readable font', 'A plain font instead of the pixel font.', 'readableFont'),
      toggle('Bigger text', '', 'bigText'),
      action('Back to the start screen', '', () => { closeMenu(false); showIntro(); }),
      action('Close menu', '', () => closeMenu()),
    ],
  });
}

function openHelp() {
  const close = then => () => { closeMenu(false); then?.(); };
  openMenu({
    id: 'help', title: 'Help', intro: 'Every key, explained. Up and down to listen, Enter to try it, Escape to close.', sound: menuSound,
    items: [
      action('What is Degrees of Sound?', 'You explore NASA temperature maps from 1881 to 2023 by ear. Every sound compares a place with its normal temperature from 1951 to 1980. Higher, faster and brighter means warmer than normal.', () => {}),
      action('L: sound tour', 'One minute: hear what every sound means.', close(features.guide)),
      action('Arrow keys: move', 'Left and right go west and east, up and down go north and south, 10 degrees at a time. Hold Shift for small steps.', close()),
      action('Comma and period: travel in time', 'One year back or forward. With Shift, 10 years. Home and End jump to 1881 and 2023.', close()),
      action('S or Space: music on or off', 'Your spot plays a little tune. Warmer is higher and faster.', close(toggleMusic)),
      action('Enter: play the whole line', 'Plays from the North Pole to the South Pole through your spot. Your spot is the loudest note.', close(playLine)),
      action('W: where am I?', 'Place, coordinates, year, temperature, and the world average.', close(() => speak(describe(true)))),
      action('T: history of this spot', 'All 143 years as a ten second melody, then a summary of the trend.', close(features.history)),
      action('C: compare with 1951', 'Hear 1951 and the current year one after the other.', close(features.compare)),
      action('R: heat radar', 'A sound from the direction of the warmest place nearby. Shift R finds the coldest. Then G goes there.', close(() => features.radar(true))),
      action('N: nearby places', 'Countries and regions close to you, and which way they are.', close(features.nearby)),
      action('Slash: search', 'Type a country, region or ocean, like Greece or Arctic. Up and down choose, Enter goes there.', close(() => search.focus())),
      action('Plus and minus: zoom', 'Zoom the globe in and out.', close()),
      action('V: voice guide on or off', 'Turn the narrator off if you use your own screen reader.', close(() => setNarrator(!settings.narrator))),
      action('M: menu', 'Mode, voice speed, volume, fonts and more.', close(openSettings)),
      action('D: download data', 'Saves this spot\'s 143 years as a spreadsheet file.', close(features.downloadCsv)),
      action('Escape: stop', 'Stops the narrator and any tour, and closes menus.', close()),
      action('With a mouse', 'Click the globe to move there, drag to turn it, scroll to zoom. Hold Shift and move the mouse to hear what is under it.', close()),
      action('Close help', '', () => closeMenu()),
    ],
  });
}

// ---------- modes + start screen ----------
function setMode(mode, announce = true) {
  settings.mode = mode;
  settings.narrator = settings.narratorByMode[mode] ?? (mode === 'listening');
  applySettings();
  document.body.dataset.mode = mode;
  if (announce && mode === 'listening') speak('Listening mode.');
}

function showIntro() {
  audio.setPlaying(false); renderPlay();
  stopSpeaking(); features.stop();
  $('app').inert = true;
  $('intro').hidden = false;
  $('startListening').focus();
}

async function begin(mode) {
  $('intro-loading').textContent = 'Starting…';
  try { await audio.init(); }
  catch (err) { console.error(err); $('intro-loading').textContent = 'Sound could not start. Check your internet connection and try again.'; return; }
  $('intro-loading').textContent = '';
  setMode(mode, false);
  started = true;
  $('intro').hidden = true;
  $('app').inert = false;
  $('globe').focus();
  audio.setDrone(ds.globalMean[state.yi]);
  if (mode === 'listening') {
    speak(`Welcome to Degrees of Sound. You are on a globe of the Earth, at ${placeName()}, in ${ds.years[state.yi]}. ` +
      'Arrow keys move you around the world. Comma and period travel through the years. ' +
      'The music is off. Press S whenever you want to hear it: higher and faster means warmer than normal. ' +
      'Press L for a one minute sound tour, H for help, and M for the menu. ' +
      'If you use a screen reader, press V to turn this voice off.');
    // no music until the user presses S (the user decides when to listen)
  } else {
    speak('Visual mode. Click the globe to move. Press S or the play button for music, H for help.');
  }
}

$('startListening').onclick = () => begin('listening');
$('startVisual').onclick = () => begin('visual');
const introChoices = [$('startListening'), $('startVisual')];
const introSay = {
  startListening: 'Listening mode. Guided by voice, keyboard only. Made for blind and low vision people. Press Enter to start.',
  startVisual: 'Visual mode. See the globe and use the mouse. Press Enter to start.',
};
$('intro').addEventListener('keydown', e => {
  const i = introChoices.indexOf(document.activeElement);
  if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
    e.preventDefault();
    const next = introChoices[(Math.max(0, i) + (e.code === 'ArrowDown' ? 1 : introChoices.length - 1)) % introChoices.length];
    next.focus();
    speak(introSay[next.id], { subtitle: false });
  } else if (e.code === 'KeyH' || (e.code === 'Slash' && e.shiftKey)) {
    speak('Degrees of Sound lets you hear NASA temperature maps. Choose a mode with the up and down arrows, then press Enter. ' +
      'Listening mode is recommended if you cannot see the screen. Headphones give the best experience.', { subtitle: false });
  } else if (e.code !== 'Enter' && e.code !== 'Space' && e.code !== 'Tab' && !e.repeat && i >= 0) {
    speak(introSay[introChoices[i].id], { subtitle: false });   // any other key: say where we are
  }
});

// ---------- debug table for the sound designer: index.html?debug ----------
function renderDebug(played) {
  const d = audio.droneNote(ds.globalMean[state.yi]);
  $('debug').innerHTML = `<p>Drone: ${d.semis >= 0 ? '+' : ''}${d.semis} semitones · tune ${Math.round(audio.bpmFor(here() ?? 0))} BPM</p>` +
    '<table><tr><th>band</th><th>°C</th><th>note</th><th>dB</th></tr>' +
    played.map((p, i) => p ? `<tr><td>${i}${p.focused ? ' ◉' : ''}</td><td>${p.v.toFixed(2)}</td><td>${p.note}</td><td>${p.db.toFixed(1)}</td></tr>`
                           : `<tr><td>${i}</td><td colspan="3">silence</td></tr>`).join('') + '</table>';
}
$('debug').hidden = !DEBUG;

// ---------- start ----------
setState({ yi: lastYi, needleLon: 22, cursorLat: 39 });             // Greece, 2023
prevLat = state.cursorLat;
try {
  initGlobe($('globe'), ds, {
    isExploreByTouch: () => settings.exploreTouch,
    onExplore: p => {                                               // hear (and see) the value under the pointer
      if (!p) { audio.scrub(null); return; }
      const v = ds.getValue(state.yi, p.lat, p.lon);
      audio.scrub(v);
      $('caption').textContent = `${regionName(Math.round(p.lat), Math.round(p.lon), 'en')}: ${v === null ? 'no measurement' : signed(v)}`;
    },
  });
} catch (err) {
  console.error(err);
  $('globe').textContent = 'The 3D globe needs WebGL, which this browser has turned off. Sound and keyboard controls still work.';
}
speechSettings.onDuck(on => audio.duck(on));
applySettings();
render();
renderPlay();
