// audio.js — sound engine (audio team: instruments, groove, reverb; integrated with the accessibility sounds)
// Needs Tone.js loaded BEFORE this module:  <script src="https://unpkg.com/tone"></script>
//
//   import { audio } from './audio.js';
//   await audio.init()                       // call from a click or key press (browser rule)
//   audio.hold(value) / audio.stopHold()     // the cursor's groove: loops until stopped (hot = faster + higher)
//   audio.setPlaying(bool)                   // S / Space: start or stop the music (groove + background hum)
//   audio.strum(line, focusBand)             // Enter: the whole north→south line, once
//   audio.setDrone(globalMean)               // background hum follows the world average
//   audio.note(value) / ping(value, pan) / scrub(value|null) / earcon(type)   // accessibility sounds
//   audio.duck(bool)                         // lower the music while the narrator speaks
//   audio.CONFIG                             // the numbers the sound designer tunes by ear
//
// line = 90 values North→South (°C anomaly; NaN or null = no value)

const CONFIG = {
  bands: 10,                 // notes per strum (90 rows / 10 = 9 rows each)
  noteGapMs: 50,             // time between strum notes
  noteLength: 0.25,          // seconds each strum note rings
  // C pentatonic, C3..C5 (11 notes). Index 5 (C4) = 0 °C = normal.
  scale: ['C3', 'D3', 'E3', 'G3', 'A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5'],
  minTemp: -2, maxTemp: 2,   // −2 °C → first note, +2 °C → last note
  quietDb: -24,              // volume at 0 °C
  loudDb: -6,                // volume at ±2 °C
  masterDb: 8,               // overall loudness (volume only, pitch untouched); the limiter stops distortion
  focusBoostDb: 8,           // the cursor's spot plays this much louder than the rest of the strum
  limiterDb: -1,
  droneDb: -28,
  droneRoot: 'C2',
  droneSemisPerDegree: 7.5,  // world average → drone pitch, snapped to the pentatonic scale
  uiDb: -16,                 // navigation chimes and menu sounds
  // melodic groove for the circle's spot (hot = faster + higher, cold = slower + lower; NEVER flip)
  beat: {
    bpmCold: 72,             // tempo at −2 °C
    bpmHot: 120,             // tempo at +2 °C (0 °C = 96)
    // arpeggio: steps up the pentatonic scale FROM the temperature note (0 = the note itself),
    // one per 8th note; the lowest note of the tune is always the temperature note
    arp: [0, 2, 4, 2, 0, 2, 4, 5],
    arpLength: '8n',         // how long each arpeggio note rings
    busyAbove: 1,            // |°C| above this: the arpeggio doubles to 16th notes (more energy far from normal)
    bassDb: -14,             // soft bass: temperature note one octave lower, on beats 1 and 3
    kickDb: -20,             // very soft heartbeat kick
    shakerDb: -34,           // quiet shaker on the off-beats
    reverbWet: 0.35,         // room
    delayWet: 0.18,          // echo
  },
  hot: {                     // warm bell / electric piano (FM, gentle)
    harmonicity: 2, modulationIndex: 3.5,
    oscillator: { type: 'sine' }, modulation: { type: 'sine' },
    envelope: { attack: 0.005, decay: 1.2, sustain: 0, release: 1.2 },
    modulationEnvelope: { attack: 0.005, decay: 0.5, sustain: 0, release: 0.5 },
  },
  cold: {                    // soft marimba-like wood
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.002, decay: 0.45, sustain: 0, release: 0.3 },
  },
};

let Tone, master, ducker, reverb, hotSynth, coldSynth, drone, ready = false;
let uiSynth, airSynth, pingSynth, pingPanner, scrubSynth, scrubNote = null;
let droneOn = true, playing = false, rhythmOn = true;
const isValue = v => v !== null && v !== undefined && !Number.isNaN(v);

async function init() {
  if (ready) return;
  Tone = window.Tone;
  if (!Tone) throw new Error('Tone.js not loaded: add <script src="https://unpkg.com/tone"></script> before the app');
  await Tone.start();
  const limiter = new Tone.Limiter(CONFIG.limiterDb).toDestination();
  ducker = new Tone.Volume(0).connect(limiter);                  // lowered while the narrator speaks
  master = new Tone.Volume(CONFIG.masterDb).connect(ducker);
  // melody goes through echo + room, so it sounds soft and connected
  reverb = new Tone.Reverb({ decay: 3, wet: CONFIG.beat.reverbWet }).connect(master);
  // the reverb is computed in the background; never let a slow computer freeze the start screen on it
  await Promise.race([reverb.ready, new Promise(r => setTimeout(r, 2000))]);
  const echo = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.25, wet: CONFIG.beat.delayWet }).connect(reverb);
  hotSynth = new Tone.PolySynth(Tone.FMSynth, CONFIG.hot).connect(echo);
  coldSynth = new Tone.PolySynth(Tone.Synth, CONFIG.cold).connect(echo);
  hotSynth.maxPolyphony = coldSynth.maxPolyphony = 32;
  const droneFilter = new Tone.Filter(350, 'lowpass').connect(reverb);
  drone = new Tone.FatOscillator(CONFIG.droneRoot, 'triangle', 12).connect(droneFilter);   // soft pad, not buzzy
  drone.volume.value = CONFIG.droneDb;
  drone.mute = true;                                             // silent until the music is started (S)
  drone.start();

  // ---- accessibility sounds: soft, in the same room (reverb), clearly not temperature notes ----
  uiSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' }, envelope: { attack: 0.004, decay: 0.35, sustain: 0, release: 0.5 },
  }).connect(reverb);
  uiSynth.volume.value = CONFIG.uiDb;
  airSynth = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.04, decay: 0.3, sustain: 0, release: 0.2 } })
    .connect(new Tone.Filter(1200, 'bandpass').connect(reverb));
  airSynth.volume.value = CONFIG.uiDb - 6;
  pingPanner = new Tone.Panner(0).connect(reverb);               // radar: panned toward the target
  pingSynth = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.005, decay: 0.5, sustain: 0, release: 0.6 } }).connect(pingPanner);
  pingSynth.volume.value = -8;
  scrubSynth = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.06, decay: 0, sustain: 1, release: 0.25 } }).connect(reverb);
  scrubSynth.volume.value = -12;

  buildBeat();
  ready = true;
}

// ---------- user settings (menu) — safe to call before init ----------
function setVolume(db) { CONFIG.masterDb = db; if (master) master.volume.rampTo(db, 0.05); }
function setStrumGap(ms) { CONFIG.noteGapMs = ms; }
function setDroneOn(on) { droneOn = on; if (drone) drone.mute = !(on && playing); }
function setRhythmOn(on) { rhythmOn = on; }
function duck(on) { if (ducker) ducker.volume.rampTo(on ? -14 : 0, 0.15); }

// ---------- accessibility sounds ----------
// earcons — 'equator': two-note chime · 'edge': low soft thud (pole, first/last year) · 'nodata': a soft breath
//           menu: 'open' (rising), 'close' (falling), 'move' (tiny blip), 'select' (small chord), 'error'
function earcon(type) {
  if (!ready) return;
  const t = Tone.now() + 0.01;
  const chime = (notes, gap = 0.09, vel = 0.7) => notes.forEach((n, i) => uiSynth.triggerAttackRelease(n, 0.25, t + i * gap, vel));
  switch (type) {
    case 'equator': chime(['G5', 'C6'], 0.08, 0.6); break;
    case 'edge': chime(['C3', 'G2'], 0.07, 0.9); break;
    case 'nodata': airSynth.triggerAttackRelease(0.25, t, 0.6); break;
    case 'open': chime(['C5', 'E5', 'G5'], 0.05); break;
    case 'close': chime(['G5', 'E5', 'C5'], 0.05); break;
    case 'move': uiSynth.triggerAttackRelease('A5', 0.08, t, 0.35); break;
    case 'select': uiSynth.triggerAttackRelease(['C5', 'G5'], 0.3, t, 0.6); break;
    case 'error': chime(['E4', 'C4'], 0.1, 0.6); break;
  }
}

// radar ping: pitch = temperature (same rule as everywhere), pan = direction (-1 left/west … +1 right/east)
function ping(v, pan) {
  if (!ready || !isValue(v)) return;
  pingPanner.pan.value = Math.max(-1, Math.min(1, pan));
  pingSynth.triggerAttackRelease(tempToNote(v), 0.4, Tone.now() + 0.02, 0.8);
}

// explore-by-touch: continuous tone for the value under the pointer; scrub(null) stops it
function scrub(v) {
  if (!ready) return;
  if (!isValue(v)) { if (scrubNote) { scrubSynth.triggerRelease(); scrubNote = null; } return; }
  const note = tempToNote(v);
  if (!scrubNote) scrubSynth.triggerAttack(note);
  else if (note !== scrubNote) scrubSynth.setNote(note);
  scrubNote = note;
}

// ---------- temperature → sound ----------
// 90 values → CONFIG.bands averages (no-value cells ignored; all-empty band → null)
function toBands(line) {
  const size = Math.ceil(line.length / CONFIG.bands), out = [];
  for (let b = 0; b < CONFIG.bands; b++) {
    const vals = Array.from(line.slice(b * size, (b + 1) * size)).filter(isValue);
    out.push(vals.length ? vals.reduce((a, c) => a + c, 0) / vals.length : null);
  }
  return out;
}

// temperature → note (hot = high; NEVER flip this)
function tempToNote(v) {
  const n = CONFIG.scale.length - 1;
  const t = (v - CONFIG.minTemp) / (CONFIG.maxTemp - CONFIG.minTemp);
  return CONFIG.scale[Math.max(0, Math.min(n, Math.round(t * n)))];
}

// |temperature| → dB (0 °C quiet, ±2 °C loud)
function tempToDb(v) {
  const k = Math.min(Math.abs(v) / CONFIG.maxTemp, 1);
  return CONFIG.quietDb + k * (CONFIG.loudDb - CONFIG.quietDb);
}

// semitones → nearest pentatonic step (0,2,4,7,9 per octave), so the drone never clashes with the notes
function snapPentatonic(semis) {
  const oct = Math.floor(semis / 12), r = semis - oct * 12;
  const step = [0, 2, 4, 7, 9, 12].reduce((a, p) => Math.abs(p - r) < Math.abs(a - r) ? p : a);
  return oct * 12 + step;
}

// one note for a temperature; focused notes are louder (capped at 0 dB)
function noteFor(v, focused = false) {
  const db = Math.min(0, tempToDb(v) + (focused ? CONFIG.focusBoostDb : 0));
  return { v, note: tempToNote(v), db, instrument: v > 0 ? 'hot' : 'cold', focused };
}

// plan a strum without playing it (used by strum, and handy for tests / debug tables)
function plan(line, focusBand = null) {
  return toBands(line).map((v, i) => v === null ? null : noteFor(v, i === focusBand));
}

function play(p, when, length = CONFIG.noteLength) {
  const synth = p.instrument === 'hot' ? hotSynth : coldSynth;
  synth.triggerAttackRelease(p.note, length, when, Tone.dbToGain(p.db));
}

// Enter: the whole north → south line, once
function strum(line, focusBand = null) {
  const played = plan(line, focusBand);
  if (!ready) return played;
  const t0 = Tone.now() + 0.02;
  played.forEach((p, i) => { if (p) play(p, t0 + i * CONFIG.noteGapMs / 1000); });   // no value → silence
  return played;
}

// one note for one value (used by history, compare, the listening guide)
function note(v, focused = false) {
  if (!isValue(v)) return null;
  const p = noteFor(v, focused);
  if (ready) play(p, Tone.now() + 0.02, 0.6);
  return p;
}

// ---------- melodic groove: loops for the circle's spot until a new spot is chosen ----------
// C pentatonic over 5 octaves, so the arpeggio can climb above the temperature note
const PENTA = [2, 3, 4, 5, 6].flatMap(o => ['C', 'D', 'E', 'G', 'A'].map(n => n + o));
const stepUp = (note, k) => PENTA[Math.max(0, Math.min(PENTA.length - 1, PENTA.indexOf(note) + k))];

let bass, kick, shaker, beatLoop, step = 0, holdValue = null;

function buildBeat() {
  const b = CONFIG.beat;
  bass = new Tone.MonoSynth({
    oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 0.6, sustain: 0.3, release: 0.8 },
    filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.5, baseFrequency: 200, octaves: 2 },
  }).connect(master);
  bass.volume.value = b.bassDb;
  kick = new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 4, envelope: { attack: 0.002, decay: 0.3, sustain: 0 } }).connect(master);
  kick.volume.value = b.kickDb;
  shaker = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.005, decay: 0.06, sustain: 0 } })
    .connect(new Tone.Filter(6000, 'highpass').connect(master));
  shaker.volume.value = b.shakerDb;

  beatLoop = new Tone.Loop(time => {
    const v = holdValue;
    if (!isValue(v)) return;
    const s = step % 16, busy = Math.abs(v) > b.busyAbove;
    const base = noteFor(v, true);                       // temperature note, instrument, loudness
    // arpeggio: every 8th (or every 16th when far from normal)
    if (busy || s % 2 === 0) {
      const i = busy ? s : s / 2;
      const k = b.arp[i % b.arp.length];
      play({ ...base, note: stepUp(base.note, k), db: base.db - (k === 0 ? 0 : 3) }, time, b.arpLength);
    }
    if (rhythmOn && (s === 0 || s === 8)) {
      bass.triggerAttackRelease(stepUp(base.note, -5), '4n', time);   // same note, one octave lower
      kick.triggerAttackRelease('C1', '8n', time, 0.6);
    }
    if (rhythmOn && s % 4 === 2) shaker.triggerAttackRelease('32n', time, 0.5);
    step++;
  }, '16n');
}

const bpmFor = v => {
  const k = (Math.max(CONFIG.minTemp, Math.min(CONFIG.maxTemp, v)) - CONFIG.minTemp) / (CONFIG.maxTemp - CONFIG.minTemp);
  return CONFIG.beat.bpmCold + k * (CONFIG.beat.bpmHot - CONFIG.beat.bpmCold);
};

function stopHold() {
  holdValue = null;
  if (!ready) return;
  beatLoop.stop();
  Tone.getTransport().stop();
}

// start (or switch) the groove for a temperature; no measurement → silence
function hold(v) {
  if (!ready) return null;
  if (!isValue(v)) { stopHold(); return null; }
  const transport = Tone.getTransport();
  const wasPlaying = holdValue !== null;
  holdValue = v;
  transport.bpm.rampTo(bpmFor(v), wasPlaying ? 0.5 : 0.01);
  if (!wasPlaying) { step = 0; beatLoop.start(0); transport.start('+0.05'); }
  return { ...noteFor(v, true), bpm: Math.round(bpmFor(v)) };
}

// S / Space: music on (groove + hum) or off. Navigation chimes and the narrator are not affected.
function setPlaying(on) {
  playing = on;
  if (!ready) return;
  if (!on) { stopHold(); scrub(null); }
  drone.mute = !(on && droneOn);
}

function droneNote(globalMean) {
  return { semis: snapPentatonic(globalMean * CONFIG.droneSemisPerDegree) };
}

function setDrone(globalMean) {
  if (!ready || !isValue(globalMean)) return;
  const { semis } = droneNote(globalMean);
  drone.frequency.rampTo(Tone.Frequency(CONFIG.droneRoot).transpose(semis).toFrequency(), 0.3);
}

// which strum band a latitude falls in (0 = northernmost)
const bandOfLat = lat => Math.min(CONFIG.bands - 1, Math.max(0, Math.floor((90 - lat) / (180 / CONFIG.bands))));

export const audio = {
  CONFIG, init, hold, stopHold, setPlaying, strum, note, earcon, ping, scrub, setDrone, duck,
  setVolume, setStrumGap, setDroneOn, setRhythmOn,
  plan, toBands, tempToNote, tempToDb, noteFor, droneNote, bandOfLat, bpmFor,
  get ready() { return ready; }, get playing() { return playing; }, get holding() { return holdValue !== null; },
};
