// globe.js — 3D globe (three.js) with NASA's map, driven only by the shared state.
//   - turns so the cursor's longitude faces you, and tilts toward the cursor's latitude
//   - cursor = glowing ring on the surface
//   - drag = move the cursor (left/right = longitude, up/down = latitude); click = put the cursor there
// Look (blue grid lines, green equator, glow) follows the UI team's design.

import * as THREE from 'three';
import { state, setState, subscribe, wrapLon, clampLat, clampZoom } from './state.js';

const D = Math.PI / 180;
// direction of (lat, lon) on a three.js SphereGeometry with an equirectangular texture
const dir = (lat, lon) => new THREE.Vector3(Math.cos(lat * D) * Math.cos(lon * D), Math.sin(lat * D), -Math.cos(lat * D) * Math.sin(lon * D));

// options: { onExplore(latLon|null), isExploreByTouch() } — for hearing the spot under the pointer
export function initGlobe(container, ds, options = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 4.3);
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(-1, 1, 3);
  scene.add(sun);

  const tilt = new THREE.Group(); scene.add(tilt);   // leans toward the cursor's latitude
  const spin = new THREE.Group(); tilt.add(spin);    // turns to the cursor's longitude

  // the Earth
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), material);
  spin.add(earth);

  // grid lines (UI team style): meridians every 15°, green equator
  const gridMat = new THREE.LineBasicMaterial({ color: 0x00c3ff, transparent: true, opacity: 0.28 });
  for (let lon = -180; lon < 180; lon += 15) {
    const pts = []; for (let lat = -90; lat <= 90; lat += 3) pts.push(dir(lat, lon).multiplyScalar(1.003));
    spin.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
  }
  const eqPts = []; for (let lon = -180; lon <= 180; lon += 3) eqPts.push(dir(0, lon).multiplyScalar(1.004));
  spin.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(eqPts),
    new THREE.LineBasicMaterial({ color: 0x32ff96, transparent: true, opacity: 0.7 })));

  // glow
  for (const [r, o] of [[1.03, 0.22], [1.07, 0.1], [1.12, 0.05]])
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(r, 64, 32), new THREE.MeshBasicMaterial({
      color: 0x00c3ff, transparent: true, opacity: o, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false })));

  // cursor: glowing ring + dot, lying on the surface
  const cursor = new THREE.Group();
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  cursor.add(new THREE.Mesh(new THREE.RingGeometry(0.05, 0.068, 48), white));
  cursor.add(new THREE.Mesh(new THREE.CircleGeometry(0.014, 24), white));
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.068, 0.1, 48),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  cursor.add(halo);
  spin.add(cursor);
  function placeCursor() {
    const n = dir(state.cursorLat, state.needleLon);
    cursor.position.copy(n).multiplyScalar(1.006);
    cursor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  }

  // textures, one per year, cached
  const loader = new THREE.TextureLoader(), cache = new Map();
  function showYear(yi) {
    if (!cache.has(yi)) cache.set(yi, new Promise(res => loader.load(ds.texture(yi), t => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      res(t);
    })));
    cache.get(yi).then(t => { if (state.yi === yi) { material.map = t; material.needsUpdate = true; } });
  }

  // zoom: camera distance 4.3 (whole globe) → 1.75 (about one country). Zoomed in, the globe tilts fully
  // to the cursor so it sits in the centre; zoomed out it only leans partly, so the poles stay visible.
  const FAR = 4.3, NEAR = 1.75;
  const distFor = z => FAR + (NEAR - FAR) * z;
  const tiltFor = z => 0.6 + 0.4 * z;

  // smooth turning toward the cursor
  let targetLon = state.needleLon, curY = (-targetLon - 90) * D, curX = state.cursorLat * tiltFor(state.zoom) * D;
  let curDist = distFor(state.zoom);
  subscribe((s, changed) => {
    if (changed.needleLon) targetLon += wrapLon(s.needleLon - wrapLon(targetLon));  // shortest way round
    if (changed.yi) showYear(s.yi);
    if (changed.needleLon || changed.cursorLat) placeCursor();
  });

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setAnimationLoop(t => {
    const k = reduceMotion ? 1 : 0.15;
    curY += ((-targetLon - 90) * D - curY) * k;
    curX += (state.cursorLat * tiltFor(state.zoom) * D - curX) * k;
    curDist += (distFor(state.zoom) - curDist) * (reduceMotion ? 1 : 0.08);
    spin.rotation.y = curY;
    tilt.rotation.x = curX;
    camera.position.z = curDist * fit;
    cursor.scale.setScalar(0.2 + 0.8 * (curDist - NEAR) / (FAR - NEAR));   // smaller ring when zoomed in
    halo.material.opacity = 0.25 + 0.15 * Math.sin(t / 300);   // gentle pulse so the cursor is easy to spot
    renderer.render(scene, camera);
  });

  // size: fill the whole middle area (so a zoomed-in globe isn't cut off as a square)
  let fit = 1;   // pull the camera back on tall, narrow screens so the whole globe still fits
  new ResizeObserver(() => requestAnimationFrame(() => {   // next frame: avoids a resize feedback loop
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fit = Math.max(1, h / w);
  })).observe(container);

  // pointer: drag = move cursor, click = jump cursor to that spot
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', e => {
    down = { x: e.clientX, y: e.clientY, lon: state.needleLon, lat: state.cursorLat, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  // the (lat, lon) under a screen point, or null if it's off the globe
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    scene.updateMatrixWorld();                     // use the globe's position right now, not the last drawn frame
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(earth)[0];
    return hit ? { lat: clampLat(hit.uv.y * 180 - 90), lon: wrapLon(hit.uv.x * 360 - 180) } : null;
  }
  // explore-by-touch: Shift + move the mouse, or drag with the "Explore by touch" setting on
  const exploring = e => e.shiftKey || options.isExploreByTouch?.();

  canvas.addEventListener('pointermove', e => {
    if (!down) { if (e.shiftKey) options.onExplore?.(pick(e.clientX, e.clientY)); return; }
    if (exploring(e)) { options.onExplore?.(pick(e.clientX, e.clientY)); down.moved = true; return; }
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.hypot(dx, dy) > 5) down.moved = true;
    if (!down.moved) return;
    const degPerPx = 180 / Math.min(canvas.clientWidth, canvas.clientHeight) * (curDist - 1) / (FAR - 1);   // finer when zoomed in
    setState({ needleLon: Math.round(wrapLon(down.lon - dx * degPerPx)), cursorLat: Math.round(clampLat(down.lat + dy * degPerPx)) });
  });
  canvas.addEventListener('pointerup', e => {
    if (down && !down.moved) {
      const p = pick(e.clientX, e.clientY);
      if (p) setState({ needleLon: Math.round(p.lon), cursorLat: Math.round(p.lat) });
    }
    if (exploring(e)) options.onExplore?.(null);
    down = null;
  });
  canvas.addEventListener('pointerleave', () => options.onExplore?.(null));

  // mouse wheel / trackpad = zoom
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    setState({ zoom: clampZoom(state.zoom - e.deltaY * 0.0015) });
  }, { passive: false });

  showYear(state.yi);
  placeCursor();
}
