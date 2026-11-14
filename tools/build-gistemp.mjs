// Decoder: turns NASA's temperature-anomaly video (SVS #5207) back into numbers.
// Plain-language explanation: explained/01-decoder.md
// Source video (not in git, 114 MB):
//   https://svs.gsfc.nasa.gov/vis/a000000/a005200/a005207/2023GISTEMP_Map_SOS.mp4  →  source/gistemp/gistemp_sos.mp4
//
//   node tools/build-gistemp.mjs              (about 1 minute)
//   node tools/build-gistemp.mjs --skip-textures
//
// Needs Node 18+ and ffmpeg on PATH. No npm packages.
//
// Outputs:
//   data/gistemp.json            years, grid layout, units, global + zone averages per year
//   data/gistemp.bin             the decoded grid (Int8): [year][row][col], °C = byte * 0.02, -128 = no value
//   textures/gistemp/<year>.jpg  NASA's original frame per year (globe texture)
//   tools/preview/*.png          decoded maps re-coloured, for a visual check (magenta = no value)

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'source', 'gistemp');
const VIDEO = path.join(SRC, 'gistemp_sos.mp4');

// ---------- settings (from the recipe) ----------
const W = 720, H = 360;               // decode resolution: 0.5° per pixel
const COLS = 180, ROWS = 90, CELL = 4;// output grid: 2° cells = 4x4 pixels
const SKIP_BOTTOM_PX = 4;             // South Pole edge artifact
const VMIN = -2, VMAX = 2, NLUT = 201;// colorbar range, 0.02 °C steps
const CB_W = 314, CB_TOP = 36, CB_BOT = 636, CB_X0 = 145, CB_X1 = 170; // centre of the bar ONLY
const DARK_SUM = 40;                  // r+g+b below this = coastline line -> skip
const NEUTRAL_SAT = 16;               // max-min below this = gray/white -> 0
const MAX_HUE_DIST = 0.06;            // farther than this from every colorbar hue -> skip

// NASA's published GISTEMP annual global means (vs 1951–1980), for the automatic check
const NASA_MEANS = { 1910: -0.43, 1940: 0.13, 1980: 0.26, 2000: 0.39, 2020: 1.01, 2023: 1.17 };
const TOLERANCE = 0.15;

// climate zones for the mixer (latitude ranges)
const ZONES = [
  { id: 'arctic', name: 'Arctic', from: 66.5, to: 90 },
  { id: 'northMid', name: 'Northern mid-latitudes', from: 23.5, to: 66.5 },
  { id: 'tropics', name: 'Tropics', from: -23.5, to: 23.5 },
  { id: 'southMid', name: 'Southern mid-latitudes', from: -66.5, to: -23.5 },
  { id: 'antarctic', name: 'Antarctic', from: -90, to: -66.5 },
];

const raw = (file, args, fmt) => execFileSync('ffmpeg', ['-v', 'error', '-i', file, ...args, '-f', 'rawvideo', '-pix_fmt', fmt, '-'], { maxBuffer: 1 << 30 });

// ---------- step 2: colour table from the colorbar ----------
const cb = raw(path.join(SRC, 'colorbar.png'), [], 'rgba');
const lut = new Float32Array(NLUT * 3);   // average colour per value (for previews)
const lutHue = new Float32Array(NLUT * 2); // brightness-free colour (r/sum, g/sum) for matching
for (let i = 0; i < NLUT; i++) {
  const v = VMIN + (VMAX - VMIN) * i / (NLUT - 1);
  const y = Math.round(CB_BOT - (v - VMIN) / (VMAX - VMIN) * (CB_BOT - CB_TOP));
  let r = 0, g = 0, b = 0, n = 0;
  for (let x = CB_X0; x <= CB_X1; x++) { const o = (y * CB_W + x) * 4; r += cb[o]; g += cb[o + 1]; b += cb[o + 2]; n++; }
  r /= n; g /= n; b /= n;
  lut.set([r, g, b], i * 3);
  lutHue.set([r / (r + g + b), g / (r + g + b)], i * 2);
}
const valueOf = i => VMIN + (VMAX - VMIN) * i / (NLUT - 1);
const ZERO = (NLUT - 1) / 2;
// sanity check: the colour table must contain strong colours (the bug from the first run washed them out)
if (lut[0 * 3 + 2] < 60 || lut[(NLUT - 1) * 3 + 1] > 40) throw new Error('Colour table looks washed out: check CB_X0/CB_X1');

// ---------- step 3: one pixel -> colour-table index (or -1 = skip) ----------
function decodePixel(r, g, b) {
  const sum = r + g + b;
  if (sum < DARK_SUM) return -1;
  if (Math.max(r, g, b) - Math.min(r, g, b) < NEUTRAL_SAT) return ZERO;
  const hr = r / sum, hg = g / sum;
  let best = Infinity, bestI = -1;
  for (let i = 0; i < NLUT; i++) {
    const dr = hr - lutHue[i * 2], dg = hg - lutHue[i * 2 + 1], d = dr * dr + dg * dg;
    if (d < best) { best = d; bestI = i; }
  }
  return Math.sqrt(best) > MAX_HUE_DIST ? -1 : bestI;
}

// ---------- step 1: which frames (one per year) ----------
const labels = fs.readFileSync(path.join(SRC, 'time.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
const years = [], frameOf = [];
labels.forEach((y, n) => { if (n === 0 || labels[n - 1] !== y) { years.push(+y); frameOf.push(n + 5); } });
if (!frameOf.every((n, i) => n === 5 + 6 * i)) throw new Error('time.txt layout changed: expected 6 frames per year');
const yearOfFrame = new Map(frameOf.map((n, i) => [n, i]));
console.log(`${years.length} years, ${years[0]}–${years.at(-1)}`);

// ---------- step 4: decode a frame into the 2° grid ----------
const grid = new Int8Array(years.length * ROWS * COLS);
const globalMean = [], zoneMeans = Object.fromEntries(ZONES.map(z => [z.id, []]));
const latOfRow = r => 90 - (r + 0.5) * 2;

function decodeFrame(yi, frame) {
  const idx = new Int16Array(W * H);
  for (let p = 0; p < W * H; p++)
    idx[p] = (p / W | 0) >= H - SKIP_BOTTOM_PX ? -1 : decodePixel(frame[p * 3], frame[p * 3 + 1], frame[p * 3 + 2]);
  const cellVals = [];
  const acc = { all: [0, 0], ...Object.fromEntries(ZONES.map(z => [z.id, [0, 0]])) }; // [weighted sum, weight]
  for (let row = 0; row < ROWS; row++) {
    const lat = latOfRow(row), w = Math.cos(lat * Math.PI / 180);
    const zone = ZONES.find(z => lat >= z.from && lat < z.to);
    for (let col = 0; col < COLS; col++) {
      cellVals.length = 0;
      for (let dy = 0; dy < CELL; dy++) for (let dx = 0; dx < CELL; dx++) {
        const i = idx[(row * CELL + dy) * W + col * CELL + dx];
        if (i >= 0) cellVals.push(valueOf(i));
      }
      let byte = -128;
      if (cellVals.length >= 3) {
        cellVals.sort((a, b) => a - b);
        const v = cellVals[cellVals.length >> 1];
        byte = Math.round(v / 0.02);
        acc.all[0] += w * v; acc.all[1] += w;
        if (zone) { acc[zone.id][0] += w * v; acc[zone.id][1] += w; }
      }
      grid[(yi * ROWS + row) * COLS + col] = byte;
    }
  }
  globalMean[yi] = +(acc.all[0] / acc.all[1]).toFixed(3);
  for (const z of ZONES) zoneMeans[z.id][yi] = +(acc[z.id][0] / acc[z.id][1]).toFixed(3);
}

// stream all frames out of the video once, decode the ones we want
{
  const frameBytes = W * H * 3;
  const ff = spawn('ffmpeg', ['-v', 'error', '-i', VIDEO, '-vf', `scale=${W}:${H}:flags=neighbor`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  let buf = Buffer.alloc(0), n = 0;
  for await (const chunk of ff.stdout) {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= frameBytes) {
      if (yearOfFrame.has(n)) decodeFrame(yearOfFrame.get(n), buf.subarray(0, frameBytes));
      buf = buf.subarray(frameBytes); n++;
    }
  }
  if (globalMean.length !== years.length || globalMean.includes(undefined)) throw new Error('some years were not decoded');
}

// ---------- step 5: automatic check against NASA ----------
let ok = true;
console.log('\nCheck vs NASA published global means:');
for (const [y, nasa] of Object.entries(NASA_MEANS)) {
  const ours = globalMean[years.indexOf(+y)], diff = ours - nasa, pass = Math.abs(diff) <= TOLERANCE;
  ok &&= pass;
  console.log(`  ${y}: ours ${ours >= 0 ? '+' : ''}${ours.toFixed(2)}  NASA ${nasa >= 0 ? '+' : ''}${nasa.toFixed(2)}  ${pass ? 'OK' : 'FAIL'}`);
}
if (!ok) { console.error('\nDecoder check FAILED: not writing output.'); process.exit(1); }
const first = years.indexOf(1951), last = years.length - 1;
console.log('\nWarming per zone, 1951 → 2023 (°C):');
for (const z of ZONES) console.log(`  ${z.name.padEnd(24)} ${(zoneMeans[z.id][last] - zoneMeans[z.id][first]).toFixed(2)}`);

// ---------- step 6: save ----------
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'gistemp.bin'), grid);
fs.writeFileSync(path.join(ROOT, 'data', 'gistemp.json'), JSON.stringify({
  id: 'gistemp',
  title: 'Global Temperature Anomaly',
  source: 'NASA SVS #5207 – Global Temperature Anomalies from 1880 to 2023 (GISTEMP v4). https://svs.gsfc.nasa.gov/5207/',
  description: 'How much warmer or cooler each place was than its own 1951–1980 average (24-month running average).',
  units: '°C', min: VMIN, max: VMAX, baseline: 0,
  notes: [
    'Decoded from the colours of the NASA visualization.',
    'Clipped at ±2 °C: +2 means "+2 °C or more".',
    'Gray "no data" and white "normal" look identical in the video, so both decode as 0.',
    'The southernmost row (88–90°S) has no value.',
  ],
  grid: { cols: COLS, rows: ROWS, cellDeg: 2, row0: 'north edge (90°N)', col0: 'west edge (180°W)' },
  encoding: { file: 'gistemp.bin', type: 'Int8', layout: '[year][row][col]', scale: 0.02, noData: -128 },
  years,
  textures: years.map(y => `textures/gistemp/${y}.jpg`),
  globalMean,
  zones: ZONES.map(z => ({ ...z, mean: zoneMeans[z.id] })),
}, null, 1));

// textures: NASA's original frames for the globe
if (!process.argv.includes('--skip-textures')) {
  const dir = path.join(ROOT, 'textures', 'gistemp');
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', VIDEO, '-vf', `select='not(mod(n-5\\,6))*lte(n\\,${frameOf.at(-1)})',scale=2048:1024`,
    '-fps_mode', 'passthrough', '-q:v', '4', path.join(dir, 'tmp_%03d.jpg')]);
  years.forEach((y, i) => fs.renameSync(path.join(dir, `tmp_${String(i + 1).padStart(3, '0')}.jpg`), path.join(dir, `${y}.jpg`)));
}

// previews: decoded grid re-coloured with the colorbar
const prev = path.join(ROOT, 'tools', 'preview');
fs.mkdirSync(prev, { recursive: true });
for (const y of [years[0], 1910, 1950, 1980, 2000, years.at(-1)]) {
  const yi = years.indexOf(y), img = Buffer.alloc(ROWS * COLS * 3);
  for (let i = 0; i < ROWS * COLS; i++) {
    const b = grid[yi * ROWS * COLS + i];
    if (b === -128) { img.set([255, 0, 255], i * 3); continue; }
    const li = Math.round((b * 0.02 - VMIN) / (VMAX - VMIN) * (NLUT - 1));
    img.set([lut[li * 3], lut[li * 3 + 1], lut[li * 3 + 2]], i * 3);
  }
  const tmp = path.join(prev, 'tmp.rgb');
  fs.writeFileSync(tmp, img);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${COLS}x${ROWS}`, '-i', tmp, '-vf', 'scale=720:360:flags=neighbor', path.join(prev, `decoded_${y}.png`)]);
  fs.unlinkSync(tmp);
}
console.log('\nDone.');
