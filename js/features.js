// features.js — listening features (keys in brackets). Each one is independent: delete freely.
//   [T] history at this spot   [C] compare with 1951   [L] sound tour
//   [R] / [Shift+R] heat radar (warmest / coldest nearby)   [G] go to the radar's find
//   [N] nearby places   [D] download this spot's data (CSV)
// Sequences wait for the narrator to finish each sentence, and [Esc] (or moving) cancels them.

import { PLACES } from './places.js';
import { speak, whenQuiet, speechSettings } from './speech.js';
import { state, setState, wrapLon } from './state.js';

export function createFeatures({ ds, audio, signed, here, where, show = () => {}, resume = null }) {
  // ---------- cancellable sequences ----------
  let token = 0;
  const stop = () => { token++; };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // say a sentence and wait until it has been said (narrator) or could have been read (screen reader)
  const say = text => {
    speak(text);
    return speechSettings.narratorOn ? new Promise(r => whenQuiet(r, 'feature')) : wait(Math.min(6000, 600 + text.length * 55));
  };
  // the spot's tune pauses while a sequence plays, and the right tune comes back afterwards
  const resumeTune = () => { if (audio.playing && here() !== null) audio.hold(here()); else audio.stopHold(); };
  async function sequence(fn) {
    const mine = ++token;
    const alive = () => mine === token;
    audio.stopHold();
    try { await fn(alive); } catch (err) { console.error(err); }
    if (alive()) (resume ?? resumeTune)();             // if cancelled by a move, the move restarts the music itself
  }
  const valuesHere = () => ds.years.map((_, yi) => ds.getValue(yi, state.cursorLat, state.needleLon));
  const playValue = (v, loud) => v === null ? audio.earcon('nodata') : audio.note(v, loud);

  // ---------- [T] history at this spot ----------
  function trendText(values) {
    const pts = values.map((v, i) => ({ v, y: ds.years[i] })).filter(p => p.v !== null);
    if (pts.length < 10) return 'Not enough measurements here to describe a trend.';
    const avg = a => a.reduce((s, p) => s + p.v, 0) / a.length;
    const early = avg(pts.slice(0, 20)), late = avg(pts.slice(-10));
    const min = pts.reduce((a, p) => p.v < a.v ? p : a), max = pts.reduce((a, p) => p.v > a.v ? p : a);
    const change = late - early;
    const dir = change > 0.3 ? 'Rising' : change < -0.3 ? 'Falling' : 'Fairly steady';
    return `${dir}: from about ${signed(early)} in the early years to about ${signed(late)} in the last ten years. ` +
      `Coldest year ${min.y}, warmest year ${max.y}${max.v >= 1.98 ? ' (the scale tops out at plus 2)' : ''}.`;
  }
  const history = () => sequence(async alive => {
    const values = valuesHere();
    await say(`History of ${where()}, ${ds.years[0]} to ${ds.years.at(-1)}. Low notes are colder, high notes warmer.`);
    for (let i = 0; i < values.length && alive(); i++) {
      playValue(values[i], false);
      if (ds.years[i] % 10 === 0) show(`♪ ${ds.years[i]}`);
      await wait(70);                                  // 143 years × 70 ms ≈ 10 seconds
    }
    if (!alive()) return;
    await wait(700);
    if (alive()) speak(trendText(values));
  });

  // ---------- [C] compare with 1951 (or with 2023 if you're at or before 1951) ----------
  const compare = () => sequence(async alive => {
    const baseYear = ds.years[state.yi] > 1951 ? 1951 : ds.years.at(-1);
    const a = ds.getValue(ds.years.indexOf(baseYear), state.cursorLat, state.needleLon), b = here();
    const [first, second] = baseYear < ds.years[state.yi] ? [[baseYear, a], [ds.years[state.yi], b]] : [[ds.years[state.yi], b], [baseYear, a]];
    let result;
    if (a === null || b === null) result = 'One of the two years has no measurement here.';
    else {
      const d = second[1] - first[1];
      result = Math.abs(d) < 0.1 ? `About the same in ${second[0]} as in ${first[0]}.`
        : `${second[0]} is ${Math.abs(d).toFixed(1)} degrees ${d > 0 ? 'warmer' : 'colder'} than ${first[0]} at ${where()}.`;
    }
    await say(`${first[0]}:`); if (!alive()) return;
    playValue(first[1], true); await wait(1100); if (!alive()) return;
    await say(`${second[0]}:`); if (!alive()) return;
    playValue(second[1], true); await wait(1100); if (!alive()) return;
    speak(result);
  });

  // ---------- [L] sound tour ----------
  const guide = () => sequence(async alive => {
    const steps = [
      ['Sound tour. Everything in Earth Jukebox is about temperature compared with normal. This is normal:', () => audio.note(0, true)],
      ['One degree warmer than normal. Higher notes mean warmer:', () => audio.note(1, true)],
      ['Two degrees warmer, the highest note. Warm places sound like a soft bell:', () => audio.note(2, true)],
      ['Two degrees colder, the lowest note. Cold places sound like wood:', () => audio.note(-2, true)],
      ['When the music is on, your spot plays a little tune. Hotter places play it faster and higher. Here is a cold place, then a hot one:',
        async () => { audio.hold(-1.5); await wait(2600); audio.hold(1.9); await wait(2600); audio.stopHold(); }],
      ['Press Enter to hear the whole line from the North Pole to the South Pole. The first notes are the Arctic:',
        () => audio.strum(ds.getColumn(state.yi, state.needleLon))],
      ['A chime means you crossed the equator:', () => audio.earcon('equator')],
      ['A low thud means you reached an edge, like a pole, or the first or last year:', () => audio.earcon('edge')],
      ['A soft breath means there is no measurement there:', () => audio.earcon('nodata')],
    ];
    for (const [text, sound] of steps) {
      if (!alive()) return;
      await say(text);
      if (!alive()) return;
      await sound();
      await wait(1300);
    }
    if (alive()) speak('That is the tour. The low hum underneath is the whole world\'s average, and it rises as the world warms. Press S to start the music, or H for help at any time.');
  });

  // ---------- [R] heat radar ----------
  let found = null;
  const D = Math.PI / 180;
  const distDeg = (lat1, lon1, lat2, lon2) =>
    Math.acos(Math.min(1, Math.sin(lat1 * D) * Math.sin(lat2 * D) + Math.cos(lat1 * D) * Math.cos(lat2 * D) * Math.cos((lon2 - lon1) * D))) / D;
  const direction = (dLat, dLon) => {
    const parts = [];
    if (Math.abs(dLat) >= 2) parts.push(`${Math.abs(Math.round(dLat))} degrees ${dLat > 0 ? 'north' : 'south'}`);
    if (Math.abs(dLon) >= 2) parts.push(`${Math.abs(Math.round(dLon))} degrees ${dLon > 0 ? 'east' : 'west'}`);
    return parts.length ? parts.join(' and ') : 'right here';
  };
  function radar(warmest = true, radius = 45) {
    stop();
    let best = null;
    for (let r = 0; r < ds.rows; r++) {
      const row = ds.getRow(state.yi, r), lat = ds.latOfRow(r);
      for (let c = 0; c < ds.cols; c++) {
        const v = row[c];
        if (Number.isNaN(v)) continue;
        const lon = ds.lonOfCol(c), d = distDeg(state.cursorLat, state.needleLon, lat, lon);
        if (d > radius) continue;
        const score = warmest ? v : -v;
        if (!best || score > best.score + 1e-6 || (Math.abs(score - best.score) <= 1e-6 && d < best.d)) best = { score, v, lat, lon, d };
      }
    }
    if (!best) return speak('Nothing measured nearby.');
    found = best;
    const dLat = best.lat - state.cursorLat, dLon = wrapLon(best.lon - state.needleLon);
    audio.ping(best.v, dLon / 45);
    const kind = warmest ? 'warmest' : 'coldest';
    if (best.d < 3) { found = null; speak(`You are on the ${kind} spot nearby: ${signed(best.v)}.`); }
    else speak(`${warmest ? 'Warmest' : 'Coldest'} nearby: ${signed(best.v)}, ${direction(dLat, dLon)}. Press G to go there.`);
    if (navigator.vibrate && best.v >= 1.5) navigator.vibrate(60);
  }
  function goToFound() {
    if (!found) return speak('Press R first to find the warmest place nearby, or Shift R for the coldest.');
    setState({ cursorLat: Math.round(found.lat), needleLon: Math.round(found.lon) });
    found = null;
  }

  // ---------- [N] nearby places ----------
  function nearby() {
    stop();
    const list = PLACES.filter(p => !p.world)
      .map(p => ({ p, d: distDeg(state.cursorLat, state.needleLon, p.lat, p.lon) }))
      .filter(x => x.d <= 40).sort((a, b) => a.d - b.d).slice(0, 4);
    if (!list.length) return speak('None of our listed places are within 40 degrees. Press slash to search for one.');
    speak('Nearby: ' + list.map(({ p }) => {
      const dir = direction(p.lat - state.cursorLat, wrapLon(p.lon - state.needleLon));
      return dir === 'right here' ? `${p.name}, right here` : `${p.name}, ${dir}`;
    }).join('. ') + '.');
  }

  // ---------- [D] download this spot's data ----------
  function downloadCsv() {
    const values = valuesHere();
    const rows = ['year,anomaly_celsius', ...ds.years.map((y, i) => `${y},${values[i] === null ? '' : values[i].toFixed(2)}`)];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `earth-jukebox_${state.cursorLat}_${state.needleLon}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
    speak(`Downloaded the temperature data for ${where()}, ${ds.years[0]} to ${ds.years.at(-1)}, as a spreadsheet file.`);
  }

  return { history, compare, guide, radar, goToFound, nearby, downloadCsv, stop, say };
}
