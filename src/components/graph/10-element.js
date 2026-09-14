/* ============================================================================
 * <o-graph> element.
 * ========================================================================== */

class OGraph extends OElement {
  static props = {
    nodes: { type: Array, default: () => [] },
    edges: { type: Array, default: () => [] },
    legend: { type: Boolean, default: true },
    toolbar: { type: Boolean, default: true },
    frozen: { type: Boolean, reflect: true },
    linkDistance: { type: Number, default: 70 },
    charge: { type: Number, default: -220 },
    minZoom: { type: Number, default: 0.05 },
    maxZoom: { type: Number, default: 6 },
    label: String,
    texts: Object,
  };

  setup() {
    this.classList.add('o-graph');
    this._nodesData = []; this._edgesData = []; this._simNodes = []; this._simEdges = [];
    this._byIdData = new Map(); this._simById = new Map(); this._groups = new Map(); this._neighbors = new Map();
    this._nEls = new Map(); this._eEls = new Map(); this._sel = null; this._hoverId = null; this._dimmed = new Set();

    this._gEdges = svg('g', { class: 'o-gr-edges' });
    this._gEdgeLabels = svg('g', { class: 'o-gr-edge-labels' });
    this._gNodes = svg('g', { class: 'o-gr-nodes' });
    this._gOverlay = svg('g', { class: 'o-gr-overlay' });
    this._vpG = svg('g', { class: 'o-gr-viewport' }, this._gEdges, this._gEdgeLabels, this._gNodes, this._gOverlay);
    this._svg = svg('svg', { class: 'o-gr-svg', role: 'presentation' }, this._vpG);

    this._zoomLbl = h('button', { type: 'button', class: 'o-gr-zoom-pct', onClick: () => this.zoomTo(1, { animate: true }) }, '100%');
    this._zoomBar = h('div', { class: 'o-gr-zoom', role: 'toolbar' },
      this._btn('zoom-out', 'graph.zoomOut', () => this._vp.zoomBy(1 / 1.25, { animate: true })), this._zoomLbl,
      this._btn('zoom-in', 'graph.zoomIn', () => this._vp.zoomBy(1.25, { animate: true })), this._btn('fit', 'graph.fit', () => this.fit({ animate: true })));

    this._freezeBtn = this._btn('snowflake', 'graph.freeze', () => { this.frozen = !this.frozen; });
    this._reheatBtn = this._btn('play', 'graph.reheat', () => this.reheat(1));
    this._legendEl = h('div', { class: 'o-gr-legend', hidden: true });
    this._top = h('div', { class: 'o-gr-toolbar' }, this._freezeBtn, this._reheatBtn, h('span', { class: 'o-spacer' }), this._menuBtn());
    this._help = h('p', { class: 'o-sr-only', id: uid('gr-help') });
    this._stage = h('div', { class: 'o-gr-stage', tabindex: '0', role: 'application', 'aria-describedby': this._help.id }, this._svg, this._zoomBar, this._legendEl);
    this._body = h('div', { class: 'o-gr-body' }, this._stage);
    this.replaceChildren(this._top, this._body, this._help);

    this._vp = new O.diagram.Viewport(this._stage, {
      min: this.minZoom, max: this.maxZoom,
      apply: (x, y, k) => this._applyVp(x, y, k),
      onChange: () => this.emit('viewport', { x: this._vp.x, y: this._vp.y, zoom: this._vp.k }, { bubbles: false }),
    });
    this._bind();
    this.focusTarget = this._stage;
  }
  connected() {
    this.addCleanup(observeResize(this, r => this._resized(r)));
    this.addCleanup(this._vp.attach({ canPan: e => !e.target.closest('.o-gr-node, .o-gr-toolbar, .o-gr-zoom, .o-gr-legend, .o-gr-float'), wheel: 'zoom' }));
  }
  disconnected() { this._stopLoop(); clearTimeout(this._a11yT); this._vp?.stop(); }
  update(changed) {
    const init = changed.has('init');
    if (changed.has('minZoom') || changed.has('maxZoom')) { this._vp.o.min = this.minZoom; this._vp.o.max = this.maxZoom; }
    if (init || changed.has('nodes') || changed.has('edges')) this._rebuild();
    if (init || changed.has('locale') || changed.has('texts')) this._texts();
    if (init || changed.has('toolbar')) this._top.hidden = !this.toolbar;
    if (init || changed.has('legend')) this._renderLegend();
    if (changed.has('frozen')) { if (this.frozen) this._stopLoop(); else { this._sim?.reheat(0.4); this._startLoop(); } this._updateFreezeBtn(); }
    if (!init && (changed.has('linkDistance') || changed.has('charge')) && this._sim) { this._sim.o.linkDistance = this.linkDistance; this._sim.o.charge = this.charge; this.reheat(0.7); }
  }

  /* ── UI helpers ───────────────────────────────────────────────────── */
  _btn(iconName, key, onClick) { return h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': this.t(key), title: this.t(key), 'data-key': key, onClick }, grIcon(iconName)); }
  _updateFreezeBtn() {
    this._freezeBtn.replaceChildren(fromHTML(grIcon(this.frozen ? 'play' : 'snowflake')));
    const key = this.frozen ? 'graph.unfreeze' : 'graph.freeze';
    this._freezeBtn.dataset.key = key;
    this._freezeBtn.setAttribute('aria-label', this.t(key));
    this._freezeBtn.title = this.t(key);
    this._freezeBtn.classList.toggle('is-active', !!this.frozen);
  }
  _menuBtn() {
    const btn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm o-btn-icon', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': this.t('graph.export'), title: this.t('graph.export'), 'data-key': 'graph.export' }, grIcon('download'));
    btn.addEventListener('click', () => {
      if (this._menuOv) { this._menuOv.close('api'); return; }
      const r = btn.getBoundingClientRect();
      const panel = h('div', { class: 'o-floating o-gr-menu o-gr-float', role: 'menu', tabindex: '-1' },
        h('button', { type: 'button', class: 'o-gr-menu-item', role: 'menuitem', onClick: () => { this._menuOv?.close('api'); this.download('svg'); } }, this.t('graph.exportSVG')),
        h('button', { type: 'button', class: 'o-gr-menu-item', role: 'menuitem', onClick: () => { this._menuOv?.close('api'); this.download('png'); } }, this.t('graph.exportPNG')));
      portal(panel, this);
      place(panel, { x: isRTL(this) ? r.right : r.left, y: r.bottom + 2 }, { placement: 'bottom-start', offset: 2, rtl: isRTL(this) });
      const nav = new ListNav(panel, { items: '[role=menuitem]', onSelect: el => el.click() });
      on(panel, 'keydown', e => { if (nav.handle(e)) return; if (e.key === 'Tab') { e.preventDefault(); this._menuOv?.close('api'); } });
      btn.setAttribute('aria-expanded', 'true');
      this._menuOv = overlays.open({ el: panel, owner: btn, onClose: () => { panel.remove(); this._menuOv = null; btn.setAttribute('aria-expanded', 'false'); } });
      animate(panel, 'zoomIn', { duration: 120 });
      nav.first();
    });
    return btn;
  }
  _texts() {
    this.querySelectorAll('[data-key]').forEach(b => { const s = this.t(b.dataset.key); b.setAttribute('aria-label', s); b.title = s; });
    this._a11yDirty();
  }

  /* ── model / simulation ───────────────────────────────────────────── */
  _rebuild() {
    this._stopLoop();
    const prevPos = new Map();
    for (const n of this._simNodes) prevPos.set(n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy, pinned: n.pinned });
    this._nodesData = toArr(this._p.nodes).map((n, i) => grNormNode(n, i));
    this._edgesData = toArr(this._p.edges).map(grNormEdge);
    this._byIdData = new Map(this._nodesData.map(n => [n.id, n]));
    this._groups = new Map(); let gi = 0;
    for (const n of this._nodesData) if (n.group && !this._groups.has(n.group)) this._groups.set(n.group, ++gi);
    this._simNodes = this._nodesData.map((n, i) => {
      const prev = prevPos.get(n.id), r = clamp(n.size || 10, 3, 48);
      const angle = i * 2.399963, rad = 14 * Math.sqrt(i + 1);
      return { id: n.id, r, x: prev ? prev.x : Math.cos(angle) * rad, y: prev ? prev.y : Math.sin(angle) * rad, vx: prev ? prev.vx : 0, vy: prev ? prev.vy : 0, ax: 0, ay: 0, pinned: !!(prev && prev.pinned) };
    });
    this._simById = new Map(this._simNodes.map(n => [n.id, n]));
    this._simEdges = this._edgesData.filter(e => this._simById.has(e.source) && this._simById.has(e.target) && e.source !== e.target);
    this._sim = new GrSimulation(this._simNodes, this._simEdges, { linkDistance: this.linkDistance, charge: this.charge });
    this._neighbors = new Map();
    for (const e of this._simEdges) {
      if (!this._neighbors.has(e.source)) this._neighbors.set(e.source, new Set());
      if (!this._neighbors.has(e.target)) this._neighbors.set(e.target, new Set());
      this._neighbors.get(e.source).add(e.target); this._neighbors.get(e.target).add(e.source);
    }
    if (this._sel && !this._byIdData.has(this._sel)) this._sel = null;
    this._buildDom();
    this._renderLegend();
    this.classList.toggle('is-dense', this._nodesData.length > 220);
    if (reducedMotion()) { this._runToCompletion(); this._renderPositions(); this.fit(); }
    else if (!this.frozen) { this._startLoop(); }
    else this._renderPositions();
    this._a11yDirty();
  }
  _runToCompletion() { let i = 0; while (this._sim.alpha >= this._sim.o.alphaMin && i < 700) { this._sim.step(); i++; } }
  _startLoop() {
    if (this._loopRunning || this.frozen || !this._sim) return;
    this._loopRunning = true;
    let fitted = false;
    const step = () => {
      if (!this.isConnected || this.frozen || !this._sim) { this._loopRunning = false; return; }
      const alpha = this._sim.step();
      this._renderPositions();
      if (!fitted) { fitted = true; this.fit(); }
      if (alpha < this._sim.o.alphaMin) { this._loopRunning = false; this.fit({ animate: true }); this.emit('settle', {}, { bubbles: false }); return; }
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }
  _stopLoop() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = 0; this._loopRunning = false; }
  reheat(alpha = 1) { if (!this._sim) return; this._sim.reheat(alpha); if (!this.frozen) this._startLoop(); }

  /* ── rendering ────────────────────────────────────────────────────── */
  _groupColor(group) {
    if (!group) return 'var(--o-text-subtle)';
    const idx = this._groups.get(group);
    return !idx ? 'var(--o-text-subtle)' : idx <= 8 ? `var(--o-chart-${idx})` : 'var(--o-secondary)';
  }
  _buildDom() {
    const liveN = new Set();
    for (const n of this._simNodes) {
      liveN.add(n.id);
      let rec = this._nEls.get(n.id);
      if (!rec) {
        const c = svg('circle', { class: 'o-gr-dot' }), label = svg('text', { class: 'o-gr-label' });
        const g = svg('g', { class: 'o-gr-node', 'data-id': n.id }, c, label);
        rec = { g, c, label };
        this._nEls.set(n.id, rec);
      }
      if (!rec.g.parentNode) this._gNodes.append(rec.g);
      const data = this._byIdData.get(n.id);
      rec.c.setAttribute('r', n.r);
      rec.c.style.fill = this._groupColor(data.group);
      rec.label.textContent = data.label;
      rec.label.setAttribute('y', n.r + 12);
      rec.g.setAttribute('aria-label', data.label || this.t('graph.untitled'));
    }
    for (const [id, rec] of this._nEls) if (!liveN.has(id)) { rec.g.remove(); this._nEls.delete(id); }
    const liveE = new Set();
    this._simEdges.forEach((e, i) => {
      const key = e.source + '→' + e.target + '#' + i;
      liveE.add(key);
      let rec = this._eEls.get(key);
      if (!rec) { rec = { line: svg('line', { class: 'o-gr-edge' }), label: svg('text', { class: 'o-gr-edge-label' }) }; this._eEls.set(key, rec); }
      if (!rec.line.parentNode) this._gEdges.append(rec.line);
      rec.line.style.strokeWidth = Math.min(4, 0.75 + Math.sqrt(e.weight || 1)) + 'px';
      if (e.label) { if (rec.label.textContent !== e.label) rec.label.textContent = e.label; if (!rec.label.parentNode) this._gEdgeLabels.append(rec.label); }
      else if (rec.label.parentNode) rec.label.remove();
      rec.e = e;
    });
    for (const [key, rec] of this._eEls) if (!liveE.has(key)) { rec.line.remove(); rec.label.remove(); this._eEls.delete(key); }
    this._renderPositions();
  }
  _renderPositions() {
    for (const n of this._simNodes) { const rec = this._nEls.get(n.id); if (rec) rec.g.setAttribute('transform', `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`); }
    for (const rec of this._eEls.values()) {
      const a = this._simById.get(rec.e.source), b = this._simById.get(rec.e.target); if (!a || !b) continue;
      rec.line.setAttribute('x1', a.x.toFixed(1)); rec.line.setAttribute('y1', a.y.toFixed(1)); rec.line.setAttribute('x2', b.x.toFixed(1)); rec.line.setAttribute('y2', b.y.toFixed(1));
      if (rec.e.label) { rec.label.setAttribute('x', ((a.x + b.x) / 2).toFixed(1)); rec.label.setAttribute('y', ((a.y + b.y) / 2).toFixed(1)); }
    }
  }
  _renderLegend() {
    this._legendEl.hidden = !this.legend || !this._groups.size;
    if (this._legendEl.hidden) return;
    const counts = new Map();
    for (const n of this._nodesData) { const k = n.group || ''; counts.set(k, (counts.get(k) || 0) + 1); }
    const entries = [...this._groups.entries()].sort((a, b) => a[1] - b[1]);
    const items = []; let other = 0;
    for (const [g, idx] of entries) { if (idx <= 8) items.push({ key: g, color: `var(--o-chart-${idx})`, label: g, count: counts.get(g) || 0 }); else other += counts.get(g) || 0; }
    if (other) items.push({ key: '__other', color: 'var(--o-secondary)', label: this.t('graph.other'), count: other });
    this._legendEl.replaceChildren(...items.map(it => h('button', { type: 'button', class: cls('o-gr-legend-item', this._dimmed.has(it.key) && 'is-off'), onClick: () => this._toggleGroupDim(it.key) },
      h('span', { class: 'o-gr-legend-swatch', style: { background: it.color } }), h('span', { class: 'o-gr-legend-label' }, it.label || this.t('graph.untitled')), h('span', { class: 'o-gr-legend-count' }, String(it.count)))));
  }
  _toggleGroupDim(key) {
    if (this._dimmed.has(key)) this._dimmed.delete(key); else this._dimmed.add(key);
    this._renderLegend();
    const active = this._dimmed.size > 0;
    for (const n of this._nodesData) {
      const rec = this._nEls.get(n.id); if (!rec) continue;
      const gKey = (this._groups.get(n.group) > 8) ? '__other' : (n.group || '');
      rec.g.classList.toggle('is-dim', active && this._dimmed.has(gKey));
    }
  }

  /* ── interaction ──────────────────────────────────────────────────── */
  _bind() {
    on(this._stage, 'pointerdown', e => this._down(e));
    on(this._stage, 'pointermove', e => this._move(e));
    on(this._stage, 'pointerup', e => this._up(e, false));
    on(this._stage, 'pointercancel', e => this._up(e, true));
    on(this._stage, 'pointerleave', () => { if (!this._drag) this._setHover(null); });
    on(this._stage, 'dblclick', '.o-gr-node', (e, g) => { const n = this._simById.get(g.dataset.id); if (n && n.pinned) { n.pinned = false; this.reheat(0.5); this.emit('pin', { id: n.id, pinned: false }); } });
    on(this, 'keydown', e => this._key(e));
  }
  _down(e) {
    const g = e.target.closest && e.target.closest('.o-gr-node');
    if (!g || e.button !== 0) return;
    this._drag = { id: g.dataset.id, pid: e.pointerId, moved: false, sx: e.clientX, sy: e.clientY };
    try { this._stage.setPointerCapture(e.pointerId); } catch {}
  }
  _move(e) {
    if (this._drag && this._drag.pid === e.pointerId) { this._dragStep(e); return; }
    if (!this._drag) this._hoverMove(e);
  }
  _dragStep(e) {
    const d = this._drag;
    if (!d.moved) { if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return; d.moved = true; }
    const n = this._simById.get(d.id); if (!n) return;
    const w = this._vp.toWorld(e.clientX, e.clientY);
    n.x = w.x; n.y = w.y; n.vx = 0; n.vy = 0; n.pinned = true;
    this._renderPositions();
    this.reheat(0.35);
  }
  _up(e, cancel) {
    const d = this._drag; if (!d || d.pid !== e.pointerId) return;
    this._drag = null;
    try { this._stage.releasePointerCapture(e.pointerId); } catch {}
    if (!cancel) { if (!d.moved) this._clickNode(d.id, e); else this.emit('pin', { id: d.id, pinned: true }); }
  }
  _clickNode(id, e) { const n = this._byIdData.get(id); if (!n) return; this.select(id); this.emit('node-click', { node: clone(n), originalEvent: e }); }
  _hoverMove(e) {
    if (e.pointerType === 'touch') return;
    const g = e.target.closest && e.target.closest('.o-gr-node');
    this._setHover(g ? g.dataset.id : null);
  }
  _setHover(id) {
    if (this._hoverId === id) return; this._hoverId = id;
    const neigh = id ? (this._neighbors.get(id) || new Set()) : null;
    for (const [nid, rec] of this._nEls) { const hl = id != null && (nid === id || neigh.has(nid)); rec.g.classList.toggle('is-hl', hl); rec.g.classList.toggle('is-dim2', id != null && !hl); }
    for (const rec of this._eEls.values()) {
      const hl = id != null && (rec.e.source === id || rec.e.target === id);
      rec.line.classList.toggle('is-hl', hl); rec.line.classList.toggle('is-dim2', id != null && !hl);
      rec.label.classList.toggle('is-hl', hl); rec.label.classList.toggle('is-dim2', id != null && !hl);
    }
  }
  _key(e) {
    if (e.key === '+' || e.key === '=') { e.preventDefault(); this._vp.zoomBy(1.25, { animate: true }); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); this._vp.zoomBy(1 / 1.25, { animate: true }); }
    else if (e.key === '0') { e.preventDefault(); this.zoomTo(1, { animate: true }); }
    else if (e.key === '1') { e.preventDefault(); this.fit({ animate: true }); }
  }
  _resized(r) { this.classList.toggle('is-narrow', r.width < 480); }

  /* ── public API ───────────────────────────────────────────────────── */
  select(id) {
    id = id == null ? null : String(id);
    if (id === this._sel) return;
    this._sel = id && this._byIdData.has(id) ? id : null;
    for (const [nid, rec] of this._nEls) rec.g.classList.toggle('is-selected', nid === this._sel);
    this.emit('select', { node: this._sel ? clone(this._byIdData.get(this._sel)) : null });
  }
  getSelection() { return this._sel ? clone(this._byIdData.get(this._sel)) : null; }
  pin(id, x, y) { const n = this._simById.get(String(id)); if (!n) return false; n.pinned = true; if (isNum(x)) n.x = x; if (isNum(y)) n.y = y; this._renderPositions(); this.emit('pin', { id: n.id, pinned: true }); return true; }
  unpin(id) { const n = this._simById.get(String(id)); if (!n) return false; n.pinned = false; this.reheat(0.4); this.emit('pin', { id: n.id, pinned: false }); return true; }
  freeze() { this.frozen = true; }
  unfreeze() { this.frozen = false; }
  getValue() { return { nodes: clone(this._nodesData), edges: clone(this._edgesData) }; }
  getNode(id) { const n = this._byIdData.get(String(id)); return n ? clone(n) : null; }
  getNeighbors(id) { return [...(this._neighbors.get(String(id)) || [])].map(nid => clone(this._byIdData.get(nid))).filter(Boolean); }

  /* ── view ─────────────────────────────────────────────────────────── */
  _contentBounds() { return this._simNodes.length ? O.diagram.bounds(this._simNodes.map(n => ({ x: n.x - n.r, y: n.y - n.r, width: n.r * 2, height: n.r * 2 }))) : null; }
  fit(opts = {}) { const b = this._contentBounds(); if (!b) return this._vp.set(40, 40, 1, opts); return this._vp.fit(b, { padding: opts.padding ?? 40, max: opts.maxZoom ?? 1.4, animate: opts.animate }); }
  zoomTo(k, opts = {}) { return k === 'fit' ? this.fit(opts) : this._vp.zoomTo(+k || 1, opts); }
  get zoom() { return this._vp ? this._vp.k : 1; }
  _applyVp(x, y, k) { this._vpG.setAttribute('transform', `matrix(${k} 0 0 ${k} ${x} ${y})`); if (this._lastK !== k) { this._lastK = k; this.classList.toggle('is-far', k < 0.55); this._zoomLbl.textContent = Math.round(k * 100) + '%'; } }

  /* ── export ───────────────────────────────────────────────────────── */
  exportSVG(opts = {}) {
    const b = this._contentBounds() || { x: 0, y: 0, w: 200, h: 120 };
    const bg = opts.background === false ? null : opts.background || O.diagram.resolveColor(this, 'var(--o-gr-bg, var(--o-surface))');
    return O.diagram.exportSVG([this._gEdges, this._gEdgeLabels, this._gNodes], b, { padding: opts.padding ?? 24, background: bg, title: this.label || this.t('graph.label') });
  }
  exportPNG(opts = {}) { return O.diagram.svgToPNG(this.exportSVG(opts), { scale: opts.scale || 2 }); }
  async download(format = 'png', filename) {
    const base = filename || String(this.label || 'graph').trim().toLowerCase().replace(/[^\w-]+/g, '-') || 'graph';
    const name = base.includes('.') ? base : base + '.' + format;
    if (format === 'svg') download(this.exportSVG(), name, 'image/svg+xml');
    else if (format === 'json') download(JSON.stringify(this.getValue(), null, 2), name, 'application/json');
    else download(await this.exportPNG(), name, 'image/png');
  }

  /* ── a11y ─────────────────────────────────────────────────────────── */
  _a11yDirty() { clearTimeout(this._a11yT); this._a11yT = setTimeout(() => this._renderA11y(), 250); }
  _renderA11y() {
    if (!this.isConnected) return;
    this._help.textContent = this.t('graph.help');
    this._stage.setAttribute('aria-label', (this.label ? this.label + '. ' : '') + this.t('graph.summary', { nodes: this._nodesData.length, edges: this._edgesData.length }));
  }
}
define('o-graph', OGraph);
O.Graph = OGraph;
