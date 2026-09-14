/* ============================================================================
 * <o-map> — a self-contained slippy map (Web Mercator, own tile pyramid,
 * no third-party map library). This file: element skeleton, render loop,
 * pointer/wheel/keyboard interaction, view methods and chrome controls.
 * Markers/clustering/popups live in 30-markers.js, vector layers in
 * 40-vectors.js and the optional Google provider in 50-google.js (all three
 * extend OMap.prototype — same folder scope, concatenated after this file).
 * ========================================================================== */

function metersPerPixel(lat, zoom, tileSize) { return 156543.03392 * Math.cos(clampLat(lat) * Math.PI / 180) / Math.pow(2, zoom) * (256 / tileSize); }
function niceScaleNumber(v) { if (v <= 0 || !isFinite(v)) return 1; const pow = Math.pow(10, Math.floor(Math.log10(v))); const n = v / pow; return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * pow; }
const MARKER_PIN_SVG = '<svg viewBox="0 0 24 32" width="26" height="34" aria-hidden="true"><path d="M12 .5C5.7.5.5 5.7.5 12c0 8.6 11.5 19 11.5 19s11.5-10.4 11.5-19C23.5 5.7 18.3.5 12 .5z" fill="var(--o-map-marker-color, var(--o-primary))" stroke="rgba(0,0,0,.25)" stroke-width=".5"/><circle cx="12" cy="12" r="4.5" fill="#fff"/></svg>';

class OMap extends OElement {
  static props = {
    lat: { type: Number, default: 20, reflect: true },
    lng: { type: Number, default: 0, reflect: true },
    zoom: { type: Number, default: 3, reflect: true },
    minZoom: { type: Number, default: 1 },
    maxZoom: { type: Number, default: 19 },
    tiles: { type: Any, default: 'osm' },
    attribution: { type: String, default: '' },
    tileSize: { type: Number, default: 256 },
    retina: { type: Boolean, default: false },
    tileFilter: { type: String, default: '', attr: 'tile-filter' },
    controls: { type: String, default: 'zoom' },
    scrollZoom: { type: Boolean, default: true, attr: 'scroll-zoom' },
    height: { type: String, default: '' },
    label: { type: String, default: '' },
    markers: { type: Array, default: () => [] },
    cluster: { type: Boolean, default: true },
    clusterRadius: { type: Number, default: 60, attr: 'cluster-radius' },
    baseLayers: { type: Array, default: () => [] },
    provider: { type: String, default: '' },
    apiKey: { type: String, attr: 'api-key' },
    mapId: { type: String, attr: 'map-id' },
    texts: Object,
  };

  setup() {
    this.classList.add('o-map');
    if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
    this.setAttribute('role', 'region');
    this.setAttribute('aria-roledescription', 'map');

    this._zoom = clamp(this.zoom, this.minZoom, this.maxZoom);
    this._lat = clampLat(this.lat);
    this._lng = wrap180(this.lng);
    this._initial = { lat: this._lat, lng: this._lng, zoom: this._zoom };
    this._levels = new Map();
    this._layers = new Map();
    this._markersById = new Map();
    this._clusterEls = new Map();
    this._clusters = [];
    this._pointers = new Map();
    this._samples = [];
    this._size = { w: 0, h: 0 };
    this._scaleUnit = 'metric';
    this._tileCache = new TileCache(); // per-instance: see the note in 10-tiles.js

    this.viewport = h('div', { class: 'o-map-viewport' });
    this.tilesEl = h('div', { class: 'o-map-tiles' });
    this.svg = svg('svg', { class: 'o-map-svg', 'aria-hidden': 'true' });
    this.markersEl = h('div', { class: 'o-map-markers' });
    this.popupsEl = h('div', { class: 'o-map-popups' });
    this.viewport.append(this.tilesEl, this.svg, this.markersEl, this.popupsEl);

    this.zoomInBtn = h('button', { type: 'button', class: 'o-map-ctlbtn', 'data-ctl': 'zoom-in' }, icon('plus'));
    this.zoomOutBtn = h('button', { type: 'button', class: 'o-map-ctlbtn', 'data-ctl': 'zoom-out' }, icon('minus'));
    this.zoomGrp = h('div', { class: 'o-map-zoomctl', role: 'group' }, this.zoomInBtn, this.zoomOutBtn);
    this.locateBtn = h('button', { type: 'button', class: 'o-map-ctlbtn' }, icon('crosshair'));
    this.fsBtn = h('button', { type: 'button', class: 'o-map-ctlbtn' }, icon('maximize'));
    this.layersSel = h('select', { class: 'o-select o-input-sm o-map-layerselect' });
    this.listToggleBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm o-map-listtoggle', hidden: true });
    this.controlsEl = h('div', { class: 'o-map-controls' }, this.zoomGrp, this.locateBtn, this.fsBtn, this.layersSel, this.listToggleBtn);
    this.scaleEl = h('button', { type: 'button', class: 'o-map-scale' }, h('span'));
    this.viewport.append(this.scaleEl);
    this.attributionEl = h('div', { class: 'o-map-attribution' });
    this.hintEl = h('div', { class: 'o-sr-only' }, this.t('map.kbdHint'));
    this.listWrap = h('div', { class: 'o-map-list', hidden: true });
    this.append(this.viewport, this.controlsEl, this.attributionEl, this.hintEl, this.listWrap);

    on(this.zoomInBtn, 'click', () => this._animateZoomAt(Math.min(this.maxZoom, Math.round(this._zoom) + 1), 0, 0));
    on(this.zoomOutBtn, 'click', () => this._animateZoomAt(Math.max(this.minZoom, Math.round(this._zoom) - 1), 0, 0));
    on(this.locateBtn, 'click', () => this.locate());
    on(this.fsBtn, 'click', () => this._toggleFullscreen());
    on(this.layersSel, 'change', () => this._setBaseLayer(+this.layersSel.value));
    on(this.scaleEl, 'click', () => { this._scaleUnit = this._scaleUnit === 'imperial' ? 'metric' : 'imperial'; this._updateScale(); });
    on(this.listToggleBtn, 'click', () => { this.listWrap.hidden = !this.listWrap.hidden; if (!this.listWrap.hidden) focusFirst(this.listWrap); });

    on(this.viewport, 'pointerdown', e => this._onPointerDown(e));
    on(this.viewport, 'wheel', e => this._onWheel(e), { passive: false });
    on(this.viewport, 'dblclick', e => this._onDblClick(e));
    on(this.viewport, 'contextmenu', e => e.preventDefault());
    on(this, 'keydown', e => this._onKeyDown(e));

    this._render = rafThrottle(() => this._doRender());
  }

  connected() {
    this.addCleanup(observeResize(this, () => this.invalidateSize()));
    this.listen(doc, 'fullscreenchange', () => {
      const fs = doc.fullscreenElement === this;
      this.fsBtn.innerHTML = ''; this.fsBtn.append(iconEl(fs ? 'minimize' : 'maximize'));
      this.fsBtn.setAttribute('aria-label', this.t(fs ? 'map.exitFullscreen' : 'map.fullscreen'));
      this.invalidateSize();
    });
    this.listen(win, 'pointermove', e => this._onPointerMove(e));
    this.listen(win, 'pointerup', e => this._onPointerUp(e));
    this.listen(win, 'pointercancel', e => this._onPointerUp(e));
    nextFrame().then(() => this.isConnected && this.invalidateSize());
  }
  // Elements may be disconnected then reconnected (moved in the DOM) — the tile cache is left
  // alone here (not cleared) so a move doesn't force every visible tile to reload/redraw.
  disconnected() { this._stopInertia(); cancelAnimationFrame(this._flyId); }

  update(changed) {
    const init = changed.has('init');
    if (init || changed.has('label') || changed.has('locale') || changed.has('texts')) {
      this.setAttribute('aria-label', this.label || this.t('map.label'));
      this.hintEl.textContent = this.t('map.kbdHint');
      this.zoomInBtn.setAttribute('aria-label', this.t('map.zoomIn')); this.zoomInBtn.title = this.t('map.zoomIn');
      this.zoomOutBtn.setAttribute('aria-label', this.t('map.zoomOut')); this.zoomOutBtn.title = this.t('map.zoomOut');
      this.locateBtn.setAttribute('aria-label', this.t('map.locate')); this.locateBtn.title = this.t('map.locate');
      this.fsBtn.setAttribute('aria-label', this.t('map.fullscreen')); this.fsBtn.title = this.t('map.fullscreen');
      this.listToggleBtn.textContent = this.t('map.markerListToggle');
      this.scaleEl.setAttribute('aria-label', this.t('map.resetView') === this.label ? '' : 'Toggle scale units');
    }
    if (init || changed.has('controls') || changed.has('baseLayers')) this._renderControls();
    if ((init || changed.has('lat') || changed.has('lng') || changed.has('zoom')) && !this.__syncing) {
      this._zoom = clamp(this.zoom, this.minZoom, this.maxZoom);
      this._lat = clampLat(this.lat); this._lng = wrap180(this.lng);
      this._recluster();
      this._scheduleRender(true);
    }
    if (init || changed.has('tiles') || changed.has('retina') || changed.has('tileSize')) this._resetTiles();
    if (init || changed.has('tileFilter')) this.viewport.classList.toggle('is-dark-tiles', this.tileFilter === 'dark');
    if (init || changed.has('attribution') || changed.has('tiles')) this._renderAttribution();
    if (init || changed.has('markers')) this.setMarkers(this.markers);
    if (init || changed.has('height')) this.style.height = this.height || '';
    if (init || changed.has('provider') || changed.has('apiKey') || changed.has('mapId')) this._applyProvider();
  }

  /* ── controls ─────────────────────────────────────────────────────── */
  _renderControls() {
    const list = String(this.controls ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const has = k => list.includes(k);
    this.zoomGrp.hidden = !has('zoom');
    this.locateBtn.hidden = !has('locate') || !isBrowser || !navigator.geolocation;
    this.fsBtn.hidden = !has('fullscreen') || !doc.fullscreenEnabled;
    this.scaleEl.hidden = !has('scale');
    const layers = toArr(this.baseLayers);
    this.layersSel.hidden = !has('layers') || layers.length < 2;
    if (layers.length > 1) this.layersSel.innerHTML = layers.map((l, i) => `<option value="${i}">${esc(l.label || l.id || 'Layer ' + (i + 1))}</option>`).join('');
  }
  _setBaseLayer(i) {
    const l = toArr(this.baseLayers)[i]; if (!l) return;
    this.tiles = l.tiles; if (l.attribution != null) this.attribution = l.attribution;
  }
  _toggleFullscreen() { if (doc.fullscreenElement === this) doc.exitFullscreen?.(); else this.requestFullscreen?.().catch(noop); }
  async locate() {
    this.locateBtn.classList.add('is-loading'); this.locateBtn.disabled = true;
    try {
      const pos = await geo.current({ enableHighAccuracy: true, timeout: 8000 });
      this._locatePos = pos;
      if (!this._locateEl) { this._locateEl = h('div', { class: 'o-map-locate-dot', 'aria-hidden': 'true' }, h('div', { class: 'o-map-locate-accuracy' }), h('div', { class: 'o-map-locate-pulse' })); this.markersEl.appendChild(this._locateEl); }
      this._locateEl.hidden = false;
      this.flyTo(pos.lat, pos.lng, Math.max(this._zoom, 15));
      announce(this.t('map.you'));
      this.emit('locate', pos);
    } catch (err) { announce(this.t('map.locateError')); this.emit('locate-error', { error: err }); }
    finally { this.locateBtn.classList.remove('is-loading'); this.locateBtn.disabled = false; }
  }

  /* ── view methods ─────────────────────────────────────────────────── */
  setView(lat, lng, zoom, opts = {}) {
    this._lat = clampLat(lat); this._lng = wrap180(lng);
    if (zoom != null) this._zoom = clamp(zoom, this.minZoom, this.maxZoom);
    if (this.provider === 'google' && this._g) { this._g.setCenter({ lat: this._lat, lng: this._lng }); if (zoom != null) this._g.setZoom(this._zoom); return this; }
    this._stopInertia(); cancelAnimationFrame(this._flyId); this._flyId = null;
    this._recluster(); this._closePopup();
    this._commitMove(); this._commitZoom();
    this._scheduleRender(true);
    return this;
  }
  flyTo(lat, lng, zoom, opts = {}) {
    if (this.provider === 'google' && this._g) { this._g.panTo({ lat: clampLat(lat), lng: wrap180(lng) }); if (zoom != null) this._g.setZoom(clamp(zoom, this.minZoom, this.maxZoom)); return this; }
    if (reducedMotion()) return this.setView(lat, lng, zoom, opts);
    this._stopInertia(); cancelAnimationFrame(this._flyId);
    const from = { lat: this._lat, lng: this._lng, zoom: this._zoom };
    const to = { lat: clampLat(lat), lng: wrap180(lng), zoom: zoom != null ? clamp(zoom, this.minZoom, this.maxZoom) : this._zoom };
    const dur = opts.duration ?? 600, start = performance.now();
    const step = now => {
      const p = clamp((now - start) / dur, 0, 1), e = 1 - Math.pow(1 - p, 3);
      this._lat = from.lat + (to.lat - from.lat) * e; this._lng = from.lng + (to.lng - from.lng) * e; this._zoom = from.zoom + (to.zoom - from.zoom) * e;
      this._scheduleRender();
      if (p < 1) this._flyId = requestAnimationFrame(step);
      else { this._flyId = null; this._recluster(); this._commitMove(); this._commitZoom(); opts.onDone?.(); }
    };
    this._flyId = requestAnimationFrame(step);
    return this;
  }
  fitBounds(bounds, opts = {}) {
    const list = Array.isArray(bounds) ? bounds.map(p => Array.isArray(p) ? { lat: p[0], lng: p[1] } : p) : null;
    const b = list ? geo.bounds(list) : bounds;
    if (!b) return this;
    const pad = opts.padding ?? 32;
    const w = this._size.w || this.viewport.clientWidth || 300, hgt = this._size.h || this.viewport.clientHeight || 300;
    let z = this.maxZoom;
    for (; z > this.minZoom; z -= 0.1) {
      const p1 = geoToPixel(b.north, b.west, z, this.tileSize), p2 = geoToPixel(b.south, b.east, z, this.tileSize);
      if (Math.abs(p2.x - p1.x) <= w - pad * 2 && Math.abs(p2.y - p1.y) <= hgt - pad * 2) break;
    }
    const center = { lat: (b.north + b.south) / 2, lng: (b.east + b.west) / 2 };
    return opts.animate === false ? this.setView(center.lat, center.lng, z) : this.flyTo(center.lat, center.lng, z, opts);
  }
  project(latlng) {
    const c = geoToPixel(this._lat, this._lng, this._zoom, this.tileSize), p = geoToPixel(latlng.lat, latlng.lng, this._zoom, this.tileSize);
    const w = this._size.w || this.viewport.clientWidth, hh = this._size.h || this.viewport.clientHeight;
    return { x: w / 2 + (p.x - c.x), y: hh / 2 + (p.y - c.y) };
  }
  unproject(point) {
    const c = geoToPixel(this._lat, this._lng, this._zoom, this.tileSize);
    const w = this._size.w || this.viewport.clientWidth, hh = this._size.h || this.viewport.clientHeight;
    return pixelToGeo(c.x + (point.x - w / 2), c.y + (point.y - hh / 2), this._zoom, this.tileSize);
  }
  getCenter() { return { lat: this._lat, lng: this._lng }; }
  getZoom() { return this._zoom; }
  getBounds() {
    const w = this._size.w || this.viewport.clientWidth, hh = this._size.h || this.viewport.clientHeight;
    const nw = this.unproject({ x: 0, y: 0 }), se = this.unproject({ x: w, y: hh });
    return { north: nw.lat, south: se.lat, west: nw.lng, east: se.lng };
  }
  invalidateSize() {
    const r = this.viewport.getBoundingClientRect();
    if (r.width && r.height) this._size = { w: r.width, h: r.height };
    this._scheduleRender(true);
    return this;
  }
  _commitMove() { this.__syncing = true; this.lat = round(this._lat, 6); this.lng = round(this._lng, 6); this.__syncing = false; this.emit('move', { lat: this._lat, lng: this._lng }); }
  _commitZoom() { this.__syncing = true; this.zoom = round(this._zoom, 3); this.__syncing = false; this.emit('zoom', { zoom: this._zoom }); }

  /* ── pointer / wheel / keyboard interaction ──────────────────────────── */
  _pointFromEvent(e) { const r = this.viewport.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  _onPointerDown(e) {
    if (e.button != null && e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target.closest('.o-map-marker, .o-map-cluster, .o-map-popup, .o-map-controls')) return;
    this.focus({ preventScroll: true });
    try { this.viewport.setPointerCapture(e.pointerId); } catch {}
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this._stopInertia();
    if (this._pointers.size === 1) {
      this._dragStart = { x: e.clientX, y: e.clientY, lat: this._lat, lng: this._lng };
      this._dragMoved = 0;
      this._samples = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
      this._hadPinch = false; // start of a fresh gesture
    } else if (this._pointers.size === 2) {
      this._pinchStart = this._pinchInfo(); this._pinchPrevDist = this._pinchStart.dist; this._pinchPrevMid = this._pinchStart.mid;
      this._hadPinch = true; // survives the 2->1 pointerup below, unlike _pinchStart
    }
    this.viewport.classList.add('is-dragging');
  }
  _pinchInfo() { const [a, b] = [...this._pointers.values()]; return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }; }
  _onPointerMove(e) {
    if (!this._pointers.has(e.pointerId)) return;
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._pointers.size === 2) {
      const info = this._pinchInfo();
      const rect = this.viewport.getBoundingClientRect();
      const offX = info.mid.x - rect.left - rect.width / 2, offY = info.mid.y - rect.top - rect.height / 2;
      const ratio = info.dist / (this._pinchPrevDist || info.dist || 1);
      if (isFinite(ratio) && ratio > 0) this._zoomBy(Math.log2(ratio), offX, offY);
      const dx = info.mid.x - this._pinchPrevMid.x, dy = info.mid.y - this._pinchPrevMid.y;
      if (dx || dy) { const p = geoToPixel(this._lat, this._lng, this._zoom, this.tileSize); const g = pixelToGeo(p.x - dx, p.y - dy, this._zoom, this.tileSize); this._lat = clampLat(g.lat); this._lng = wrap180(g.lng); }
      this._pinchPrevDist = info.dist; this._pinchPrevMid = info.mid;
      this._scheduleRender();
      return;
    }
    if (this._pointers.size !== 1 || !this._dragStart) return;
    const dx = e.clientX - this._dragStart.x, dy = e.clientY - this._dragStart.y;
    this._dragMoved = Math.max(this._dragMoved, Math.hypot(dx, dy));
    const p = geoToPixel(this._dragStart.lat, this._dragStart.lng, this._zoom, this.tileSize);
    const g = pixelToGeo(p.x - dx, p.y - dy, this._zoom, this.tileSize);
    this._lat = clampLat(g.lat); this._lng = wrap180(g.lng);
    this._samples.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    if (this._samples.length > 6) this._samples.shift();
    this._scheduleRender();
  }
  _onPointerUp(e) {
    if (!this._pointers.has(e.pointerId)) return;
    this._pointers.delete(e.pointerId);
    if (this._pointers.size === 1) {
      const [left] = [...this._pointers.values()];
      this._dragStart = { x: left.x, y: left.y, lat: this._lat, lng: this._lng };
      this._samples = [{ x: left.x, y: left.y, t: performance.now() }];
      this._pinchStart = this._pinchPrevDist = this._pinchPrevMid = null;
      return;
    }
    if (this._pointers.size > 0) return;
    this.viewport.classList.remove('is-dragging');
    try { this.viewport.releasePointerCapture(e.pointerId); } catch {}
    // A pinch (2 pointers at once) always needs a real commit, even when the two pointers are
    // released one at a time (the common case) rather than in the same event: the 2->1 pointerup
    // below already clears _pinchStart to fall back to plain single-finger panning, so by the
    // final (1->0) pointerup _pinchStart looks empty and _dragMoved was never touched (moves are
    // tracked separately while 2 pointers are down) — without _hadPinch this reads as a small tap
    // and the pinch's zoom/pan change is applied internally but never committed to the reflected
    // lat/lng/zoom props or the o-move/o-zoom events.
    if ((this._dragMoved || 0) < 4 && !this._pinchStart && !this._hadPinch) {
      const g = this.unproject(this._pointFromEvent(e));
      this.emit('click', { lat: g.lat, lng: g.lng });
      this._closePopup();
      const now = Date.now();
      if (e.pointerType === 'touch' && this._lastTap && now - this._lastTap.t < 320 && Math.hypot(e.clientX - this._lastTap.x, e.clientY - this._lastTap.y) < 30) {
        this._lastTap = null;
        const rect = this.viewport.getBoundingClientRect();
        this._animateZoomAt(Math.min(this.maxZoom, Math.round(this._zoom) + 1), e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2);
      } else this._lastTap = { t: now, x: e.clientX, y: e.clientY };
    } else if (this._dragStart || this._hadPinch) {
      this._recluster();
      this._commitMove();
      if (this._hadPinch) this._commitZoom(); // a plain single-finger pan doesn't touch zoom
      const s = this._samples;
      if (s.length >= 2 && !reducedMotion()) {
        const first = s[0], last = s[s.length - 1], dt = last.t - first.t;
        if (dt > 0 && dt < 250) { const vx = (last.x - first.x) / dt, vy = (last.y - first.y) / dt; if (Math.hypot(vx, vy) > 0.08) this._startInertia(vx, vy); }
      }
    }
    this._dragStart = null; this._pinchStart = null; this._hadPinch = false;
  }
  _startInertia(vxPerMs, vyPerMs) {
    let vx = vxPerMs * 16, vy = vyPerMs * 16;
    const tick = () => {
      if (this._pointers.size || Math.hypot(vx, vy) < 0.05) { this._inertiaId = null; this._recluster(); this._commitMove(); return; }
      const p = geoToPixel(this._lat, this._lng, this._zoom, this.tileSize);
      const g = pixelToGeo(p.x - vx, p.y - vy, this._zoom, this.tileSize);
      this._lat = clampLat(g.lat); this._lng = wrap180(g.lng);
      vx *= 0.94; vy *= 0.94;
      this._scheduleRender();
      this._inertiaId = requestAnimationFrame(tick);
    };
    this._inertiaId = requestAnimationFrame(tick);
  }
  _stopInertia() { if (this._inertiaId) { cancelAnimationFrame(this._inertiaId); this._inertiaId = null; } }
  _zoomBy(dz, offX, offY) {
    const newZoom = clamp(this._zoom + dz, this.minZoom, this.maxZoom);
    if (newZoom === this._zoom) return;
    const centerPx = geoToPixel(this._lat, this._lng, this._zoom, this.tileSize);
    const cursorGeo = pixelToGeo(centerPx.x + offX, centerPx.y + offY, this._zoom, this.tileSize);
    this._zoom = newZoom;
    const newCursorPx = geoToPixel(cursorGeo.lat, cursorGeo.lng, this._zoom, this.tileSize);
    const g = pixelToGeo(newCursorPx.x - offX, newCursorPx.y - offY, this._zoom, this.tileSize);
    this._lat = clampLat(g.lat); this._lng = wrap180(g.lng);
  }
  _onWheel(e) {
    if (!this.scrollZoom || this.provider) return;
    e.preventDefault();
    const rect = this.viewport.getBoundingClientRect();
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 18; else if (e.deltaMode === 2) delta *= rect.height;
    this._zoomBy(clamp(-delta * 0.0022, -0.9, 0.9), e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2);
    this._scheduleRender();
    clearTimeout(this._wheelEndT);
    this._wheelEndT = setTimeout(() => { this._recluster(); this._commitZoom(); }, 200);
  }
  _onDblClick(e) {
    if (e.target.closest('.o-map-marker, .o-map-cluster, .o-map-controls, .o-map-popup')) return;
    e.preventDefault();
    const rect = this.viewport.getBoundingClientRect();
    this._animateZoomAt(Math.min(this.maxZoom, Math.round(this._zoom) + 1), e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2);
  }
  _animateZoomAt(targetZoom, offX, offY, duration = 250) {
    targetZoom = clamp(targetZoom, this.minZoom, this.maxZoom);
    if (reducedMotion()) { this._zoomBy(targetZoom - this._zoom, offX, offY); this._recluster(); this._commitZoom(); this._commitMove(); this._scheduleRender(true); return; }
    const startZoom = this._zoom, start = performance.now();
    const step = now => {
      const p = clamp((now - start) / duration, 0, 1), eased = 1 - Math.pow(1 - p, 3);
      this._zoomBy(startZoom + (targetZoom - startZoom) * eased - this._zoom, offX, offY);
      this._scheduleRender();
      if (p < 1) requestAnimationFrame(step); else { this._recluster(); this._commitZoom(); this._commitMove(); }
    };
    requestAnimationFrame(step);
  }
  _panBy(dx, dy) {
    const p = geoToPixel(this._lat, this._lng, this._zoom, this.tileSize);
    const g = pixelToGeo(p.x + dx, p.y + dy, this._zoom, this.tileSize);
    this._lat = clampLat(g.lat); this._lng = wrap180(g.lng);
  }
  _onKeyDown(e) {
    if (e.key === 'Escape' && this._popup) { this._closePopup(); e.preventDefault(); return; }
    if (e.target !== this) return;
    const step = 70;
    if (e.key === 'ArrowUp') this._panBy(0, -step);
    else if (e.key === 'ArrowDown') this._panBy(0, step);
    else if (e.key === 'ArrowLeft') this._panBy(isRTL(this) ? step : -step, 0);
    else if (e.key === 'ArrowRight') this._panBy(isRTL(this) ? -step : step, 0);
    else if (e.key === '+' || e.key === '=') { this._zoomBy(1, 0, 0); this._commitZoom(); }
    else if (e.key === '-' || e.key === '_') { this._zoomBy(-1, 0, 0); this._commitZoom(); }
    else if (e.key === 'Home') { this.setView(this._initial.lat, this._initial.lng, this._initial.zoom); return; }
    else return;
    e.preventDefault();
    this._recluster();
    this._commitMove();
    this._scheduleRender(true);
  }

  /* ── render loop & tiles ──────────────────────────────────────────── */
  _scheduleRender(force) { if (force) this._forceTiles = true; this._render(); }
  _doRender() {
    if (!this.isConnected) return;
    if (!this._size.w) { const r = this.viewport.getBoundingClientRect(); if (r.width) this._size = { w: r.width, h: r.height }; }
    if (!this._size.w) return;
    this._updateTiles();
    this._updateMarkers();
    this._updateVectors();
    this._updatePopups();
    this._updateScale();
  }
  _resetTiles() {
    this._src = resolveTileSource(this.tiles);
    this._levels.forEach(l => l.el.remove());
    this._levels.clear();
    this._scheduleRender(true);
  }
  _updateTiles() {
    if (!this._src) this._src = resolveTileSource(this.tiles);
    const z = this._zoom, tileZoom = clamp(Math.round(z), this.minZoom, this.maxZoom);
    if (!this._levels.has(tileZoom)) {
      const el = h('div', { class: 'o-map-level' });
      this.tilesEl.appendChild(el);
      this._levels.set(tileZoom, { el, tiles: new Map(), z: tileZoom, createdAt: performance.now() });
    }
    const w = this._size.w, hgt = this._size.h, dark = this.tileFilter === 'dark', isRetina = !!this.retina;
    for (const [lz, lvl] of this._levels) {
      const scale = Math.pow(2, z - lz);
      const centerPx = geoToPixel(this._lat, this._lng, lz, this.tileSize);
      const halfW = (w / 2) / scale + this.tileSize, halfH = (hgt / 2) / scale + this.tileSize;
      const n = Math.pow(2, lz);
      const minX = Math.floor((centerPx.x - halfW) / this.tileSize), maxX = Math.floor((centerPx.x + halfW) / this.tileSize);
      const minY = clamp(Math.floor((centerPx.y - halfH) / this.tileSize), 0, Math.max(0, n - 1));
      const maxY = clamp(Math.floor((centerPx.y + halfH) / this.tileSize), 0, Math.max(0, n - 1));
      const wanted = new Set();
      for (let tx = minX; tx <= maxX; tx++) {
        for (let ty = minY; ty <= maxY; ty++) {
          const key = tx + ',' + ty;
          wanted.add(key);
          let tile = lvl.tiles.get(key);
          if (!tile) {
            const wrappedX = ((tx % n) + n) % n;
            const cacheKey = this._src.sig + '|' + lz + '|' + wrappedX + '|' + ty + (isRetina ? '@2x' : '') + (dark ? '|dark' : '');
            let state = this._tileCache.get(cacheKey);
            if (!state) { state = loadTileElement(this._src, wrappedX, ty, lz, { size: this.tileSize, retina: isRetina, dark }); this._tileCache.set(cacheKey, state); }
            tile = { state };
            lvl.tiles.set(key, tile);
            const el = state.el;
            el.classList.add('o-map-tile');
            if (state.loaded) el.classList.add('is-loaded');
            else state.onload = () => { el.classList.add('is-loaded'); this._scheduleRender(); };
            if (!el.isConnected) lvl.el.appendChild(el);
          }
          const sx = w / 2 + (tx * this.tileSize - centerPx.x) * scale, sy = hgt / 2 + (ty * this.tileSize - centerPx.y) * scale;
          const el = tile.state.el;
          el.style.width = this.tileSize + 'px'; el.style.height = this.tileSize + 'px';
          el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) scale(${scale})`;
        }
      }
      for (const [key, tile] of [...lvl.tiles]) if (!wanted.has(key)) { tile.state.el.remove(); lvl.tiles.delete(key); }
      lvl.el.style.zIndex = String(lz);
    }
    const active = this._levels.get(tileZoom);
    const activeReady = active && (![...active.tiles.values()].length || [...active.tiles.values()].every(x => x.state.loaded));
    if (activeReady) for (const [lz, lvl] of [...this._levels]) if (lz !== tileZoom) { lvl.el.remove(); this._levels.delete(lz); }
  }
  _renderAttribution() {
    if (this.attribution) { this.attributionEl.textContent = this.attribution; this.attributionEl.hidden = false; return; }
    const src = this._src || resolveTileSource(this.tiles);
    const html = defaultAttribution(src, '');
    this.attributionEl.innerHTML = html || '';
    this.attributionEl.hidden = !html;
  }
  _updateScale() {
    if (this.scaleEl.hidden) return;
    const mpp = metersPerPixel(this._lat, this._zoom, this.tileSize);
    const maxPx = 100;
    let label, widthPx;
    if (this._scaleUnit === 'imperial') {
      const feet = maxPx * mpp / 0.3048;
      if (feet > 5280) { const mi = niceScaleNumber(feet / 5280); label = mi + ' mi'; widthPx = (mi * 5280 * 0.3048) / mpp; }
      else { const ft = niceScaleNumber(feet); label = ft + ' ft'; widthPx = (ft * 0.3048) / mpp; }
    } else {
      const meters = maxPx * mpp;
      if (meters > 1000) { const km = niceScaleNumber(meters / 1000); label = km + ' km'; widthPx = (km * 1000) / mpp; }
      else { const m = niceScaleNumber(meters); label = m + ' m'; widthPx = m / mpp; }
    }
    this.scaleEl.style.setProperty('--o-map-scale-w', Math.max(20, Math.round(widthPx)) + 'px');
    this.scaleEl.querySelector('span').textContent = label;
  }

  /* ── programmatic provider switch (google branch lives in 50-google.js) ── */
  _applyProvider() {
    if (this.provider === 'google') {
      this.viewport.hidden = true; this.controlsEl.hidden = true; this.attributionEl.hidden = true; this.listWrap.hidden = true;
      if (!this.gEl) { this.gEl = h('div', { class: 'o-map-google' }); this.insertBefore(this.gEl, this.viewport); }
      this.gEl.hidden = false;
      this._initGoogle?.();
    } else {
      this.viewport.hidden = false; this.controlsEl.hidden = false; this._renderAttribution();
      if (this.gEl) this.gEl.hidden = true;
    }
  }
}
define('o-map', OMap);
O.Map = OMap;
/** Orion.map(target, opts) -> mounts a new <o-map> into target (Element or selector). */
O.map = (target, opts = {}) => {
  const host = isStr(target) ? $(target) : target;
  const el = doc.createElement('o-map');
  Object.assign(el, opts);
  host.appendChild(el);
  return el;
};
