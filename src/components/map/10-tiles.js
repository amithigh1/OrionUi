/* ============================================================================
 * <o-map> — tile sources: URL templates (OSM / custom), an offline canvas
 * generator (deterministic, no network — used by default in docs & tests),
 * and a small LRU element cache (one per map instance — see 20-map.js setup()).
 * ========================================================================== */

/** Small LRU cache of tile DOM elements, keyed by "source|z|x|y".
 * One instance PER <o-map> (created in setup()), never a module-level singleton: a DOM
 * element can only be attached under one parent, so two different map instances that both
 * need the same z/x/y (very likely — e.g. two dashboard maps of the same city/zoom) must not
 * share cached elements, or whichever map renders second silently loses that tile (its
 * bookkeeping thinks it has the tile, but the shared element stays attached to the other map). */
class TileCache {
  constructor(max = 480) { this.max = max; this.map = new Map(); }
  get(k) { const v = this.map.get(k); if (v) { this.map.delete(k); this.map.set(k, v); } return v; }
  set(k, v) { this.map.delete(k); this.map.set(k, v); while (this.map.size > this.max) { const fk = this.map.keys().next().value; const old = this.map.get(fk); this.map.delete(fk); old?.el?.isConnected === false && old.abort?.(); } }
  clear() { this.map.forEach(v => v.abort?.()); this.map.clear(); }
}

/** mulberry32 seeded PRNG -> deterministic per-tile art (same tile always looks the same). */
function tileRand(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function tileSeed(x, y, z) { return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0; }

/**
 * Deterministic offline placeholder tile: a canvas with a water/land grid, a coastline-ish
 * blob and the z/x/y coordinate — enough visual variety for demos/screenshots without any
 * network access. Not real cartography.
 */
function drawOfflineTile(x, y, z, px, dark) {
  const c = doc.createElement('canvas');
  c.width = px; c.height = px;
  const ctx = c.getContext('2d');
  const r = tileRand(tileSeed(x, y, z));
  const water = dark ? '#132840' : '#cfe3f5';
  const land = dark ? ['#1d3a2c', '#20402f', '#173323'] : ['#dcebd2', '#cfe4c1', '#bfdcae'];
  const line = dark ? 'rgba(255,255,255,.06)' : 'rgba(15,23,42,.06)';
  ctx.fillStyle = water; ctx.fillRect(0, 0, px, px);
  // a handful of deterministic rounded "land" blobs
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const cx = r() * px, cy = r() * px, rad = px * (0.18 + r() * 0.28);
    ctx.fillStyle = land[i % land.length];
    ctx.beginPath();
    const pts = 8;
    for (let k = 0; k <= pts; k++) {
      const a = (k / pts) * Math.PI * 2;
      const rr = rad * (0.75 + r() * 0.5);
      const px2 = cx + Math.cos(a) * rr, py2 = cy + Math.sin(a) * rr;
      k === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
    }
    ctx.closePath(); ctx.fill();
  }
  // grid + coordinate label (also makes tiles trivially verifiable in screenshots)
  ctx.strokeStyle = line; ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, px - 1, px - 1);
  ctx.fillStyle = dark ? 'rgba(255,255,255,.55)' : 'rgba(15,23,42,.55)';
  ctx.font = `${Math.max(9, Math.round(px * 0.042))}px ui-monospace, monospace`;
  ctx.textBaseline = 'top';
  ctx.fillText(`${z}/${x}/${y}`, 4, 4);
  return c;
}
/** Neutral "failed to load" tile for real tile-source errors after retries are exhausted. */
function drawErrorTile(px, dark) {
  const c = doc.createElement('canvas');
  c.width = px; c.height = px;
  const ctx = c.getContext('2d');
  ctx.fillStyle = dark ? '#1a2338' : '#eef2f7'; ctx.fillRect(0, 0, px, px);
  ctx.strokeStyle = dark ? '#34435f' : '#cbd5e1'; ctx.setLineDash([4, 4]); ctx.strokeRect(4, 4, px - 8, px - 8);
  ctx.fillStyle = dark ? '#6b7a90' : '#94a3b8';
  ctx.font = `${Math.round(px * 0.09)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⚠', px / 2, px / 2 - px * 0.06);
  return c;
}

const OSM_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

/** Resolve the `tiles` prop to a normalized descriptor: { kind: 'offline'|'url'|'fn', template?, fn? } */
function resolveTileSource(tiles) {
  if (isFn(tiles)) return { kind: 'fn', fn: tiles, sig: 'fn:' + (tiles.__oid || (tiles.__oid = uid('src'))) };
  const s = String(tiles ?? 'osm').trim();
  if (!s || s === 'offline') return { kind: 'offline', sig: 'offline' };
  if (s === 'osm') return { kind: 'url', template: OSM_TEMPLATE, sig: OSM_TEMPLATE };
  return { kind: 'url', template: s, sig: s };
}
/** Default attribution text (as trusted HTML) for a resolved tile source. */
function defaultAttribution(src, custom) {
  if (custom) return custom;
  if (src.kind === 'offline') return t('map.attributionOffline');
  if (src.kind === 'url' && src.template === OSM_TEMPLATE) return OSM_ATTRIBUTION;
  return '';
}
function tileUrl(template, x, y, z, retina) {
  return template.replace(/\{z\}/g, z).replace(/\{x\}/g, x).replace(/\{y\}/g, y)
    .replace(/\{r\}/g, retina ? '@2x' : '').replace(/\{s\}/g, 'a');
}

/**
 * loadTileElement(src, x, y, z, opts) -> { el, abort(), promise }
 * x/y are already wrapped to the valid tile range for zoom z. Handles retry + a neutral
 * error placeholder for real tile sources; offline/function sources resolve synchronously.
 */
function loadTileElement(src, x, y, z, opts) {
  const { size, retina, dark } = opts;
  const px = size * (retina ? 2 : 1);
  if (src.kind === 'offline') {
    const el = drawOfflineTile(x, y, z, px, dark);
    return { el, loaded: true, abort: noop };
  }
  if (src.kind === 'fn') {
    let aborted = false;
    const el = doc.createElement('div');
    el.className = 'o-map-tile-fn';
    const state = { el, loaded: false, abort: () => { aborted = true; } };
    Promise.resolve(src.fn({ x, y, z, size: px })).then(res => {
      if (aborted) return;
      if (isStr(res)) { const img = new Image(); img.decoding = 'async'; img.alt = ''; img.src = res; img.onload = () => { state.loaded = true; state.onload?.(); }; el.appendChild(img); }
      else if (res instanceof Element) el.appendChild(res), (state.loaded = true, state.onload?.());
      else state.loaded = true;
    }).catch(() => { if (!aborted) { el.appendChild(drawErrorTile(px, dark)); state.loaded = true; state.onload?.(); } });
    return state;
  }
  // url template — real network image with retry + abort
  let tries = 0, aborted = false, img = null;
  const state = { el: null, loaded: false, abort: () => { aborted = true; if (img) img.src = ''; } };
  const start = () => {
    img = new Image();
    img.decoding = 'async'; img.alt = '';
    img.width = size; img.height = size;
    img.className = 'o-map-tile-img';
    img.onload = () => { if (aborted) return; state.loaded = true; state.onload?.(); };
    img.onerror = () => {
      if (aborted) return;
      tries++;
      if (tries <= 2) return void setTimeout(start, 300 * tries);
      const fallback = drawErrorTile(px, dark);
      fallback.className = img.className;
      state.el.replaceWith(fallback); state.el = fallback; state.loaded = true; state.onload?.();
    };
    img.src = tileUrl(src.template, x, y, z, retina);
  };
  state.el = doc.createElement('img');
  state.el.decoding = 'async'; state.el.alt = ''; state.el.className = 'o-map-tile-img';
  img = state.el;
  img.onload = () => { if (aborted) return; state.loaded = true; state.onload?.(); };
  img.onerror = () => {
    if (aborted) return;
    tries++;
    if (tries <= 2) { setTimeout(() => { if (!aborted) img.src = tileUrl(src.template, x, y, z, retina) + (tries ? '?r=' + tries : ''); }, 300 * tries); return; }
    const fallback = drawErrorTile(px, dark);
    fallback.className = img.className;
    img.replaceWith(fallback); state.el = fallback; state.loaded = true; state.onload?.();
  };
  img.src = tileUrl(src.template, x, y, z, retina);
  return state;
}
