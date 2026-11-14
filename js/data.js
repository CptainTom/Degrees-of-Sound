// data.js — the ONLY way the rest of the app reads temperature data.
//
//   import { loadDataset } from './js/data.js';
//   const ds = await loadDataset('gistemp');
//
//   ds.years                    [1881, …, 2023]            yi = index into this array
//   ds.getValue(yi, lat, lon)   °C vs 1951–1980, or null
//   ds.getColumn(yi, lon)       90 values north → south along one meridian (the playhead). NaN = no value
//   ds.getRow(yi, row)          180 values west → east along one latitude band. NaN = no value
//   ds.texture(yi)              URL of NASA's original frame (globe texture)
//   ds.globalMean[yi]           world average that year
//   ds.zones                    [{ id, name, from, to, mean: [...per year] }]  Arctic … Antarctic
//   ds.latOfRow(r), ds.lonOfCol(c)
//
// Grid: 180 cols × 90 rows of 2° cells. Row 0 = north edge (90°N). Col 0 = west edge (180°W).
// Same layout as the texture images, so it wraps onto a sphere directly.

export async function loadDataset(id, base = '.') {
  const meta = await (await fetch(`${base}/data/${id}.json`)).json();
  const bytes = new Int8Array(await (await fetch(`${base}/data/${meta.encoding.file}`)).arrayBuffer());
  const values = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) values[i] = bytes[i] === meta.encoding.noData ? NaN : bytes[i] * meta.encoding.scale;
  return wrap(meta, values, yi => `${base}/${meta.textures[yi]}`);
}

function wrap(meta, values, texture) {
  const { cols, rows } = meta.grid, cell = 180 / rows;
  const rowOf = lat => Math.min(rows - 1, Math.max(0, Math.floor((90 - lat) / cell)));
  const colOf = lon => ((Math.floor((lon + 180) / cell) % cols) + cols) % cols;
  const at = (yi, r, c) => values[(yi * rows + r) * cols + c];
  return {
    meta, years: meta.years, rows, cols, texture,
    globalMean: meta.globalMean, zones: meta.zones,
    getValue(yi, lat, lon) { const v = at(yi, rowOf(lat), colOf(lon)); return Number.isNaN(v) ? null : v; },
    getRow: (yi, row) => values.subarray((yi * rows + row) * cols, (yi * rows + row + 1) * cols),
    getColumn(yi, lon) { const c = colOf(lon), out = new Float32Array(rows); for (let r = 0; r < rows; r++) out[r] = at(yi, r, c); return out; },
    latOfRow: r => 90 - (r + 0.5) * cell,
    lonOfCol: c => -180 + (c + 0.5) * cell,
  };
}
