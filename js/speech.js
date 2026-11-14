// speech.js — the narrator. Everything the app says goes through speak().
// Narrator voice logic by the audio team (navigator.js): newest sentence wins, no queue of old sentences,
// wait for a short pause while keys are held, and "when quiet" callbacks to start the music after speech.
//
//   speak(text)              say it now (cuts off the previous sentence)
//   sayAfterPause(text)      say it once the user stops pressing keys for a moment
//   whenQuiet(fn)            run fn after the narrator finishes (right away if it's off or silent)
//   stopSpeaking()           silence now
//
// ONE VOICE AT A TIME:
//   narrator ON  → the browser voice speaks; the screen-reader channel (aria-live) stays quiet
//   narrator OFF → screen readers (NVDA, VoiceOver…) get every message through aria-live
// Subtitles (optional) show the sentence on screen while it's being said.

const synth = window.speechSynthesis;
let narratorOn = true, rate = 1.1, subtitlesOn = true, duck = () => {};
let speechId = 0, waiting = false, safety, pauseTimer, subtitleTimer;
const quietFns = new Map();   // slot name → what to run when the narrator goes quiet (newest per slot wins)

const $ = id => document.getElementById(id);

// best available English voice: natural/online voices first, then any en-US, then any English
function pickVoice() {
  const voices = synth?.getVoices() ?? [];
  const en = voices.filter(v => v.lang?.toLowerCase().startsWith('en'));
  return en.find(v => /natural|neural|online/i.test(v.name) && /en-us/i.test(v.lang))
      || en.find(v => /google us english/i.test(v.name))
      || en.find(v => /en-us/i.test(v.lang))
      || en[0] || null;
}
let voice = null;
synth?.addEventListener?.('voiceschanged', () => { voice = pickVoice(); });

function quiet() {
  clearTimeout(safety);
  duck(false);
  const fns = [...quietFns.values()];
  quietFns.clear();
  fns.forEach(fn => fn());
}

function showSubtitle(text) {
  const el = $('caption');
  if (!el) return;
  clearTimeout(subtitleTimer);
  if (!subtitlesOn) { el.textContent = ''; return; }
  el.textContent = text;
  el.classList.add('speaking');
  subtitleTimer = setTimeout(() => { el.textContent = ''; el.classList.remove('speaking'); }, Math.max(3500, text.length * 75));
}

function toLiveRegion(text) {
  const el = $('announce');
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 30);   // re-set so identical messages are read again
}

export function speak(text, { subtitle = true } = {}) {
  clearTimeout(pauseTimer); waiting = false;
  if (subtitle) showSubtitle(text);
  if (!narratorOn || !synth) { toLiveRegion(text); return; }
  synth.cancel();
  const id = ++speechId;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  voice ??= pickVoice();
  if (voice) u.voice = voice;
  u.rate = rate;
  u.onstart = () => duck(true);
  u.onend = u.onerror = () => { if (id === speechId) quiet(); };   // ignore sentences that were cut off
  synth.speak(u);
}

// say it once the user pauses (no chatter while holding a key)
export function sayAfterPause(text, ms = 350, options = {}) {
  clearTimeout(pauseTimer);
  waiting = true;
  pauseTimer = setTimeout(() => { waiting = false; speak(text, options); }, ms);
}

// slot: separate jobs (e.g. 'music', 'welcome', 'feature') don't replace each other; within a slot the newest wins
export function whenQuiet(fn, slot = 'default') {
  if (!narratorOn || !synth) return fn();
  quietFns.set(slot, fn);
  clearTimeout(safety);
  safety = setTimeout(quiet, 12000);              // never wait forever if a browser forgets 'end'
  if (!waiting && !synth.speaking && !synth.pending) quiet();
}

export function stopSpeaking() {
  clearTimeout(pauseTimer); waiting = false;
  speechId++;                                     // the cut-off sentence must not trigger whenQuiet twice
  synth?.cancel();
  quiet();                                        // it IS quiet now: e.g. the music may resume (audio team's original behaviour)
}

export const speechSettings = {
  setNarrator(on) { narratorOn = on; if (!on) stopSpeaking(); },
  setRate(r) { rate = r; },
  setSubtitles(on) { subtitlesOn = on; if (!on) showSubtitle(''); },
  onDuck(fn) { duck = fn; },                      // audio.js lowers the music while the narrator talks
  get narratorOn() { return narratorOn; },
  get supported() { return !!synth; },
};
