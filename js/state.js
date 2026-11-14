// state.js — the ONE shared state. Everything connects through here.
//
//   import { state, setState, subscribe } from './state.js';
//   setState({ yi: 10 });                     // change something (keys, sliders, globe clicks/drags)
//   subscribe((state, changed) => { … });     // react to changes (globe, audio, screen reader)
//
//   state.yi         index into ds.years (which year)
//   state.needleLon  cursor longitude, -180..180 (west negative). The whole north–south line here is "strummed".
//   state.cursorLat  cursor latitude, -88..88 (south negative). This one spot plays louder and is read aloud.
//   state.zoom       0 = whole globe … 1 = closest

export const state = { yi: 0, needleLon: 0, cursorLat: 0, zoom: 0 };
const listeners = new Set();

export function setState(patch) {
  const changed = {};
  for (const k in patch) if (state[k] !== patch[k]) { state[k] = patch[k]; changed[k] = true; }
  if (Object.keys(changed).length) listeners.forEach(fn => fn(state, changed));
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// helpers
export const wrapLon = lon => ((lon + 180) % 360 + 360) % 360 - 180;
export const clampLat = lat => Math.max(-88, Math.min(88, lat));
export const clampZoom = z => Math.max(0, Math.min(1, z));
