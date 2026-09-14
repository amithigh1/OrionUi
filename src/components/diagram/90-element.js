/* ============================================================================
 * <o-diagram> — diagram builder / flowchart editor / read-only viewer.
 *   <o-diagram grid="20" snap minimap palette properties toolbar></o-diagram>
 *   el.value = { nodes: [...], edges: [...] }
 * ========================================================================== */

let __dgClip = null;

class ODiagram extends OElement {
  static props = {
    grid: { type: Number, default: 20 },
    snap: Boolean,
    minimap: Boolean,
    readonly: { type: Boolean, reflect: true },
    palette: Any,
    properties: Boolean,
    toolbar: Boolean,
    guides: { type: Boolean, default: true },
    edgeType: { type: String, default: 'orthogonal' },
    arrow: { type: String, default: 'end' },
    wheel: { type: String, default: 'zoom' },
    minZoom: { type: Number, default: 0.1 },
    maxZoom: { type: Number, default: 3 },
    autoFit: { type: Boolean, default: true },
    createOnDblclick: { type: Boolean, default: true },
    panOnDrag: Boolean,
    cornerRadius: { type: Number, default: 8 },
    canConnect: Function,
    renderNode: Function,
    shapes: { type: Object, attr: false },
    label: String,
    texts: Object,
    value: { type: Object, attr: 'value' },
  };
  /** value: { nodes, edges } — reading returns a fresh copy; assigning replaces the diagram. */
  get value() { return this._setupDone ? this.getValue() : this._p.value; }
  set value(v) { this._p.value = isStr(v) ? parseJSON(v, {}) : v; this.requestUpdate('value'); }

  setup() {
    this.classList.add('o-diagram');
    const data = this.querySelector(':scope > script[type="application/json"]');
    if (data && this._p.value == null) this._p.value = parseJSON(data.textContent, null);
    this._nodes = []; this._edges = []; this._nm = new Map(); this._em = new Map(); this._inc = new Map();
    this._sel = new Set(); this._selE = new Set(); this._nEls = new Map(); this._eEls = new Map();
    this._dirtyN = new Set(); this._dirtyE = new Set();
    this._hist = new DgHistory(100);
    this._router = new DgRouter();
    this._buildStage();
    this._top = h('div', { class: 'o-dg-toolbar', role: 'toolbar', hidden: true });
    this._paletteEl = h('aside', { class: 'o-dg-palette o-scroll', hidden: true });
    this._propsEl = h('aside', { class: 'o-dg-props o-scroll', hidden: true });
    this._body = h('div', { class: 'o-dg-body' }, this._paletteEl, this._stage, this._propsEl);
    this.replaceChildren(this._top, this._body, this._srList);
    this._vp = new DgViewport(this._stage, { min: this.minZoom, max: this.maxZoom, apply: (x, y, k) => this._applyVp(x, y, k), onChange: () => this.emit('viewport', { x: this._vp.x, y: this._vp.y, zoom: this._vp.k }, { bubbles: false }) });
    this._bind();
    this._bindPalette();
    this.focusTarget = this._stage;
  }
  connected() {
    this.addCleanup(observeResize(this, r => this._resized(r)));
    this.listen(document, 'o-theme', () => { this._mmDirty(); });
  }
  disconnected() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    clearInterval(this._apT); clearTimeout(this._mmT); clearTimeout(this._a11yT);
    this._menuOv?.close('api');
    this._vp?.stop();
    if (this._editing) this._commitEdit(false);
    this._cancelDrag?.();
  }
  update(changed) {
    const init = changed.has('init');
    if (changed.has('minZoom') || changed.has('maxZoom')) { this._vp.o.min = this.minZoom; this._vp.o.max = this.maxZoom; }
    if (changed.has('value')) {
      const v = dgNormValue(this._p.value, this.shapes, { type: this.edgeType, arrow: this.arrow });
      if (init || JSON.stringify(v) !== this._json()) this._load(v, { fit: this.autoFit });
    }
    if (changed.has('shapes') || changed.has('renderNode') || changed.has('locale')) { for (const rec of this._nEls.values()) rec.sig = ''; this._invalidate(true, true); }
    if (init || changed.has('locale') || changed.has('texts')) this._texts();
    this.classList.toggle('is-readonly', !!this.readonly);
    if (init || changed.has('grid') || changed.has('snap')) this._applyVp(this._vp.x, this._vp.y, this._vp.k);
    if (init || changed.has('minimap')) { this._mm.hidden = !this.minimap; this._renderMinimap(); }
    if (init || changed.has('palette') || changed.has('shapes') || changed.has('readonly') || changed.has('locale')) this._renderPalette();
    if (init || changed.has('toolbar') || changed.has('readonly') || changed.has('locale')) this._renderToolbar();
    if (init || changed.has('properties') || changed.has('readonly') || changed.has('locale') || changed.has('grid') || changed.has('snap') || changed.has('minimap')) this._renderProps(true);
    if (changed.has('readonly')) { this._overlayDirty = true; this._schedule(); }
    this.classList.toggle('has-palette', !this._paletteEl.hidden);
    this.classList.toggle('has-props', !this._propsEl.hidden);
  }

  /* ── model ────────────────────────────────────────────────────────── */
  _json() { return JSON.stringify({ nodes: this._nodes || [], edges: this._edges || [] }); }
  _load(v, { resetHistory = true, fit = false } = {}) {
    const val = v && Array.isArray(v.nodes) && Array.isArray(v.edges) && v.nodes.every(n => n && n.width) ? v : dgNormValue(v, this.shapes, { type: this.edgeType, arrow: this.arrow });
    this._nodes = val.nodes; this._edges = val.edges;
    this._reindex();
    this._sel = new Set([...this._sel].filter(id => this._nm.has(id)));
    this._selE = new Set([...this._selE].filter(id => this._em.has(id)));
    this._invalidate(true, true);
    if (resetHistory) this._hist.reset(this._json());
    if (fit) this._fitPending = true;
    this._flushSoon();
    this._updateToolbar(); this._renderProps(true);
  }
  _flushSoon() { this._schedule(); if (this._fitPending) requestAnimationFrame(() => this._tryFit()); }
  _tryFit() { if (!this._fitPending || !this._stage.clientWidth) return; this._fitPending = false; this._paint(); this.fit(); }
  _reindex() {
    this._nm = new Map(this._nodes.map(n => [n.id, n]));
    this._em = new Map(this._edges.map(e => [e.id, e]));
    this._inc = new Map();
    for (const e of this._edges) for (const id of [e.from, e.to]) { let s = this._inc.get(id); if (!s) this._inc.set(id, (s = new Set())); s.add(e.id); }
  }
  _resized(r) {
    this.classList.toggle('is-narrow', r.width < 760);
    if (this._fitPending) this._tryFit();
    else this._mmApply();
  }
  /** Record a history step and notify (o-change). */
  _commit(action, opts = {}) {
    if (!this._hist.push(this._json(), action, opts.key)) return;
    this._afterChange(action);
  }
  _afterChange(action) {
    this._updateToolbar();
    this._renderProps();
    this._mmDirty(); this._a11yDirty();
    this.emit('change', { value: this.getValue(), action });
  }
  /** Current value (deep copy). */
  getValue() { this.flush(); return JSON.parse(this._json()); }
  /** Replace the diagram programmatically (no o-change). { history: true } keeps undo history and records a step. */
  setValue(v, { history = false } = {}) {
    this.flush(); this._p.value = v;
    this._load(dgNormValue(v, this.shapes, { type: this.edgeType, arrow: this.arrow }), { resetHistory: !history, fit: this.autoFit });
    if (history) this._commit('set');
  }
  /** Load a value as an undoable user action (fires o-change). */
  import(v) { this._load(dgNormValue(v, this.shapes, { type: this.edgeType, arrow: this.arrow }), { resetHistory: false, fit: true }); this._commit('import'); }
  toJSON() { return this.getValue(); }
  getNode(id) { const n = this._nm.get(String(id)); return n ? clone(n) : null; }
  getEdge(id) { const e = this._em.get(String(id)); return e ? clone(e) : null; }
  getNodes() { return clone(this._nodes); }
  getEdges() { return clone(this._edges); }

  addNode(node, opts = {}) {
    this.flush();
    const n = dgNormNode(node, this.shapes);
    if (this._nm.has(n.id)) n.id = dgId('n');
    this._nodes.push(n); this._nm.set(n.id, n);
    this._invalidate([n.id]);
    if (!opts.silent) this._commit('add');
    return clone(n);
  }
  updateNode(id, patch, opts = {}) {
    const n = this._nm.get(String(id)); if (!n) return null;
    const p = isFn(patch) ? patch(clone(n)) : { ...patch };
    delete p.id;
    Object.assign(n, p);
    if (p.style === null) delete n.style;
    this._invalidate([n.id]);
    if (opts.commit !== false) this._commit('update', { key: opts.key });
    return clone(n);
  }
  _patchNodes(nodes, patch) { nodes.forEach(n => this.updateNode(n.id, isFn(patch) ? patch(n) : patch, { commit: false })); this._commit('style'); this._renderProps(true); }
  removeNode(id) { return this._remove([String(id)], []); }
  addEdge(edge, opts = {}) {
    this.flush();
    const e = dgNormEdge(edge, { type: this.edgeType, arrow: this.arrow });
    if (!this._nm.has(e.from) || !this._nm.has(e.to)) return null;
    if (this._em.has(e.id)) e.id = dgId('e');
    this._edges.push(e); this._em.set(e.id, e);
    for (const id of [e.from, e.to]) { let s = this._inc.get(id); if (!s) this._inc.set(id, (s = new Set())); s.add(e.id); }
    this._invalidate(null, [e.id]);
    if (!opts.silent) this._commit('add-edge');
    return clone(e);
  }
  updateEdge(id, patch, opts = {}) {
    const e = this._em.get(String(id)); if (!e) return null;
    const p = isFn(patch) ? patch(clone(e)) : { ...patch };
    delete p.id;
    Object.assign(e, p);
    for (const k of Object.keys(p)) if (p[k] === undefined || (k === 'label' && p[k] === '')) delete e[k];
    if ('from' in p || 'to' in p) this._reindex();
    this._invalidate(null, [e.id]);
    if (opts.commit !== false) this._commit('update-edge', { key: opts.key });
    return clone(e);
  }
  _patchEdges(edges, patch) { edges.forEach(e => this.updateEdge(e.id, isFn(patch) ? patch(e) : patch, { commit: false })); this._commit('style'); this._renderProps(true); this._overlayDirty = true; }
  removeEdge(id) { return this._remove([], [String(id)]); }
  /** Connect two nodes as a user action: validates (canConnect), fires cancelable o-connect, records history. */
  connect(from, to, { fromPort, toPort, label, user = false, ...extra } = {}) {
    from = String(from); to = String(to);
    if (!this._canConnect(from, to, fromPort, toPort)) { if (user) announce(this.t('diagram.notAllowed')); return null; }
    if (this._edges.some(e => e.from === from && e.to === to && (e.fromPort ?? null) === (fromPort ?? null) && (e.toPort ?? null) === (toPort ?? null))) return null;
    const detail = { edge: { from, to, fromPort, toPort, label, type: this.edgeType, arrow: this.arrow, ...extra }, from: this.getNode(from), to: this.getNode(to) };
    if (!detail.edge.label) delete detail.edge.label;
    this._connectHook?.(detail);
    if (!this.emit('connect', detail)) return null;
    const e = this.addEdge(detail.edge, { silent: true });
    if (!e) return null;
    this._commit('connect');
    if (user) announce(this.t('diagram.connected', { from: detail.from.label || this.t('diagram.untitled'), to: detail.to.label || this.t('diagram.untitled') }));
    return e;
  }
  _canConnect(from, to, fromPort, toPort, existing) {
    const a = this._nm.get(from), b = this._nm.get(to);
    if (!a || !b) return false;
    const pa = fromPort != null ? dgPort(a, this._def(a), fromPort) : null, pb = toPort != null ? dgPort(b, this._def(b), toPort) : null;
    if ((pa && pa.kind === 'in') || (pb && pb.kind === 'out')) return false;
    const count = (node, port, key) => this._edges.filter(e => e !== existing && e[key] === node && e[key + 'Port'] === port).length;
    if (pa && pa.max != null && count(from, fromPort, 'from') >= pa.max) return false;
    if (pb && pb.max != null && count(to, toPort, 'to') >= pb.max) return false;
    if (isFn(this.canConnect)) {
      try { if (this.canConnect(clone(a), clone(b), { fromPort, toPort, edge: existing ? clone(existing) : null }) === false) return false; }
      catch (err) { console.error('[Orion] diagram canConnect failed:', err); return false; }
    }
    return true;
  }
  _remove(nodeIds, edgeIds, action = 'delete') {
    const ns = new Set(nodeIds.filter(id => this._nm.has(id)));
    const es = new Set(edgeIds.filter(id => this._em.has(id)));
    for (const e of this._edges) if (ns.has(e.from) || ns.has(e.to)) es.add(e.id);
    if (!ns.size && !es.size) return false;
    if (!this.emit('delete', { nodes: [...ns].map(id => clone(this._nm.get(id))), edges: [...es].map(id => clone(this._em.get(id))) })) return false;
    this._nodes = this._nodes.filter(n => !ns.has(n.id));
    this._edges = this._edges.filter(e => !es.has(e.id));
    this._reindex();
    ns.forEach(id => this._sel.delete(id)); es.forEach(id => this._selE.delete(id));
    this._invalidate(true, true);
    this._commit(action);
    this._setSel(this._sel, this._selE, { force: true });
    announce(this.t('diagram.deleted', { count: ns.size + es.size }));
    return true;
  }
  deleteSelection() { return this._remove([...this._sel], [...this._selE]); }
  moveSelection(dx, dy) {
    const nodes = this._selNodes().filter(n => !n.locked);
    if (!nodes.length) return;
    const old = dgBounds(nodes);
    for (const n of nodes) { n.x += dx; n.y += dy; }
    this._invalidate(nodes.map(n => n.id));
    this._rerouteAround(old, dgBounds(nodes));
    this._commit('move', { key: 'kbmove' });
    const n = nodes[0];
    this._vp.ensureVisible(dgNodeRect(n, 8), 40);
  }

  /* ── selection ────────────────────────────────────────────────────── */
  _selNodes() { return this._nodes.filter(n => this._sel.has(n.id)); }
  _expandGroups(ids) {
    const groups = new Set(ids.map(id => this._nm.get(id)?.group).filter(Boolean));
    if (!groups.size) return ids;
    return [...new Set([...ids, ...this._nodes.filter(n => groups.has(n.group)).map(n => n.id)])];
  }
  _setSel(nodes, edges, { silent = false, force = false } = {}) {
    const pn = this._sel, pe = this._selE;
    const nn = new Set([...nodes].filter(id => this._nm.has(id))), ne = new Set([...edges].filter(id => this._em.has(id)));
    const changed = force || nn.size !== pn.size || ne.size !== pe.size || [...nn].some(id => !pn.has(id)) || [...ne].some(id => !pe.has(id));
    this._sel = nn; this._selE = ne;
    for (const id of new Set([...pn, ...nn])) { const rec = this._nEls.get(id); if (rec) { const s = nn.has(id); rec.g.classList.toggle('is-selected', s); rec.g.setAttribute('aria-selected', String(s)); } }
    for (const id of new Set([...pe, ...ne])) { const rec = this._eEls.get(id); if (rec) { const s = ne.has(id); rec.g.classList.toggle('is-selected', s); rec.lg.classList.toggle('is-selected', s); } }
    this._overlayDirty = true; this._schedule(); this._mmDirty();
    if (!changed) return;
    this._updateToolbar(); this._renderProps();
    if (!silent) this.emit('select', this.getSelection());
  }
  /** Select nodes (and edges) by id. Grouped nodes select their whole group. */
  select(nodeIds = [], edgeIds = []) { this.flush(); this._setSel(this._expandGroups(toArr(nodeIds).map(String)), toArr(edgeIds).map(String)); }
  selectAll() { this._setSel(this._nodes.map(n => n.id), this._edges.map(e => e.id)); announce(this.t('diagram.selected', { count: this._sel.size + this._selE.size })); }
  clearSelection() { this._setSel([], []); }
  _toggleNode(id) { const s = new Set(this._sel); const ids = this._expandGroups([id]); if (s.has(id)) ids.forEach(x => s.delete(x)); else ids.forEach(x => s.add(x)); this._setSel(s, this._selE); }
  _toggleEdge(id) { const s = new Set(this._selE); if (s.has(id)) s.delete(id); else s.add(id); this._setSel(this._sel, s); }
  /** { items, nodes, edges } — items mixes both kinds as { kind, id, ...data }. */
  getSelection() {
    const nodes = this._selNodes().map(n => clone(n)), edges = [...this._selE].map(id => clone(this._em.get(id))).filter(Boolean);
    return { items: [...nodes.map(n => ({ kind: 'node', ...n })), ...edges.map(e => ({ kind: 'edge', ...e }))], nodes, edges };
  }

  /* ── structure ────────────────────────────────────────────────────── */
  group() {
    const nodes = this._selNodes(); if (nodes.length < 2) return null;
    const gid = dgId('g');
    nodes.forEach(n => { n.group = gid; });
    this._commit('group'); announce(this.t('diagram.grouped'));
    this._overlayDirty = true; this._schedule(); this._updateToolbar();
    return gid;
  }
  ungroup() {
    const groups = new Set(this._selNodes().map(n => n.group).filter(Boolean)); if (!groups.size) return;
    this._nodes.forEach(n => { if (groups.has(n.group)) delete n.group; });
    this._commit('ungroup'); announce(this.t('diagram.ungrouped'));
    this._overlayDirty = true; this._schedule(); this._updateToolbar();
  }
  bringToFront() { this._zorder(true); }
  sendToBack() { this._zorder(false); }
  _zorder(front) {
    const sel = this._selNodes(); if (!sel.length) return;
    const rest = this._nodes.filter(n => !this._sel.has(n.id));
    this._nodes = front ? [...rest, ...sel] : [...sel, ...rest];
    this._invalidate(true);
    this._commit(front ? 'front' : 'back');
  }

  /* ── clipboard ────────────────────────────────────────────────────── */
  _clipOf() {
    const nodes = this._selNodes(); if (!nodes.length) return null;
    const ids = new Set(nodes.map(n => n.id));
    return JSON.stringify({ nodes, edges: this._edges.filter(e => ids.has(e.from) && ids.has(e.to)) });
  }
  copy() {
    const c = this._clipOf(); if (!c) return false;
    __dgClip = c; this._pasteN = 0;
    try { navigator.clipboard?.writeText(c).catch(noop); } catch {}
    const n = JSON.parse(c).nodes.length;
    announce(this.t('diagram.copied', { count: n }));
    return true;
  }
  cut() { if (this.copy()) this.deleteSelection(); }
  paste(at) { if (__dgClip) this._pasteData(__dgClip, at, 20 * (++this._pasteN || (this._pasteN = 1))); }
  duplicate() { const c = this._clipOf(); if (c) this._pasteData(c, null, 20, 'duplicate'); }
  _pasteData(json, at, offset, action = 'paste') {
    const v = parseJSON(json, null); if (!v || !v.nodes?.length) return;
    const b = dgBounds(v.nodes), map = new Map();
    const dx = at ? Math.round(at.x - b.x) : offset, dy = at ? Math.round(at.y - b.y) : offset;
    const gmap = new Map();
    const nodes = v.nodes.map(n => {
      const id = dgId('n'); map.set(n.id, id);
      const out = { ...n, id, x: n.x + dx, y: n.y + dy };
      if (n.group) { if (!gmap.has(n.group)) gmap.set(n.group, dgId('g')); out.group = gmap.get(n.group); }
      return dgNormNode(out, this.shapes);
    });
    const edges = v.edges.map(e => dgNormEdge({ ...e, id: dgId('e'), from: map.get(e.from), to: map.get(e.to) }));
    this._nodes.push(...nodes); this._edges.push(...edges);
    this._reindex();
    this._invalidate(nodes.map(n => n.id), edges.map(e => e.id));
    this._commit(action);
    this._setSel(nodes.map(n => n.id), []);
    announce(this.t('diagram.pasted', { count: nodes.length }));
  }

  /* ── history ──────────────────────────────────────────────────────── */
  undo() {
    if (this._editing) this._commitEdit(false);
    const r = this._hist.undo();
    if (!r) { announce(this.t('diagram.nothing')); return false; }
    this._restore(r.snap, 'undo');
    announce(this.t('diagram.undone', { action: r.label }));
    return true;
  }
  redo() {
    const r = this._hist.redo(); if (!r) return false;
    this._restore(r.snap, 'redo');
    announce(this.t('diagram.redone', { action: r.label }));
    return true;
  }
  get canUndo() { return this._hist.canUndo; }
  get canRedo() { return this._hist.canRedo; }
  _restore(snap, action) {
    const v = JSON.parse(snap);
    this._nodes = v.nodes; this._edges = v.edges;
    this._reindex();
    this._invalidate(true, true);
    this._setSel([...this._sel].filter(id => this._nm.has(id)), [...this._selE].filter(id => this._em.has(id)), { force: true, silent: true });
    this._afterChange(action);
  }

  /* ── view ─────────────────────────────────────────────────────────── */
  _contentBounds() {
    const b = dgBounds(this._nodes);
    if (!b) return null;
    let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;
    for (const rec of this._eEls.values()) if (rec.pts && rec.g.style.display !== 'none') for (const p of rec.pts) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  /** Zoom to fit the content. opts: { padding = 40, animate, maxZoom = 1 } */
  fit(opts = {}) {
    this.flush(); this._paint();
    const b = this._contentBounds();
    if (!b) return this._vp.set(40, 40, 1, opts);
    return this._vp.fit(b, { padding: opts.padding ?? 40, max: opts.maxZoom ?? 1, animate: opts.animate });
  }
  /** zoomTo(1.5) | zoomTo('fit') */
  zoomTo(k, opts = {}) { return k === 'fit' ? this.fit(opts) : this._vp.zoomTo(+k || 1, opts); }
  get zoom() { return this._vp ? this._vp.k : 1; }
  /** Center a node in the view and select it. */
  focusNode(id, { select = true, animate = true } = {}) {
    const n = this._nm.get(String(id)); if (!n) return;
    if (select) this.select([n.id]);
    this._vp.center(n.x + n.width / 2, n.y + n.height / 2, Math.max(this._vp.k, 0.8), { animate });
    this._nEls.get(n.id)?.g.focus({ preventScroll: true });
  }
  focus(opts) { this._stage?.focus(opts); }

  /** Auto layout: layout('layered' | 'tree', { direction: 'TB'|'LR'|'BT'|'RL', rankSep, nodeSep, animate, fit }) */
  async layout(type = 'layered', opts = {}) {
    this.flush();
    if (!this._nodes.length) return;
    const pos = type === 'tree' ? dgTreeLayout(this._nodes, this._edges, opts) : dgLayered(this._nodes, this._edges, opts);
    const old = dgBounds(this._nodes), g = this.snap && this.grid > 0 ? this.grid : 1;
    const ox = Math.round(old.x / g) * g, oy = Math.round(old.y / g) * g;
    const moves = this._nodes.filter(n => pos.has(n.id) && !n.locked).map(n => { const p = pos.get(n.id); return { n, x0: n.x, y0: n.y, x1: ox + p.x, y1: oy + p.y }; });
    const apply = t => { for (const m of moves) { m.n.x = Math.round(m.x0 + (m.x1 - m.x0) * t); m.n.y = Math.round(m.y0 + (m.y1 - m.y0) * t); } this._invalidate(moves.map(m => m.n.id)); };
    if (opts.animate && !reducedMotion() && moves.length <= 300) {
      await new Promise(res => {
        const t0 = performance.now();
        const step = now => { const p = Math.min(1, (now - t0) / 380); apply(1 - Math.pow(1 - p, 3)); if (p < 1) requestAnimationFrame(step); else res(); };
        requestAnimationFrame(step);
      });
    } else apply(1);
    this._invalidate(true, true);
    this._paint();
    this._commit('layout');
    if (opts.fit !== false) this.fit({ animate: opts.animate });
    announce(this.t('diagram.laidOut'));
    this.emit('layout', { type, direction: opts.direction || 'TB' });
  }

  /* ── export ───────────────────────────────────────────────────────── */
  /** Standalone SVG markup. opts: { background (color | false), padding } */
  exportSVG(opts = {}) {
    this.flush(); this._paint();
    const b = this._contentBounds() || { x: 0, y: 0, w: 200, h: 120 };
    const sn = [...this._sel], se = [...this._selE];
    this._setSel([], [], { silent: true });
    this.classList.add('is-exporting');
    try {
      const bg = opts.background === false ? null : opts.background || dgResolveColor(this, 'var(--o-dg-bg, var(--o-surface))');
      return dgExportSVG([this._lEdges, this._lNodes, this._lLabels], b, { padding: opts.padding ?? 24, background: bg, foreign: opts.foreign || 'keep', title: this.label || this.t('diagram.label') });
    } finally {
      this.classList.remove('is-exporting');
      this._setSel(sn, se, { silent: true });
    }
  }
  /** PNG Blob. opts: { scale = 2, background } */
  exportPNG(opts = {}) { return dgSvgToPNG(this.exportSVG({ ...opts, foreign: 'text' }), { scale: opts.scale || 2 }); }
  /** download('png' | 'svg' | 'json', filename?) */
  async download(format = 'png', filename) {
    const base = filename || String(this.label || 'diagram').trim().toLowerCase().replace(/[^\w-]+/g, '-') || 'diagram';
    const name = base.includes('.') ? base : base + '.' + format;
    if (format === 'json') download(JSON.stringify(this.getValue(), null, 2), name, 'application/json');
    else if (format === 'svg') download(this.exportSVG(), name, 'image/svg+xml');
    else download(await this.exportPNG(), name, 'image/png');
  }
}
dgMixin(ODiagram, DgRender, DgInteract, DgPanels);
define('o-diagram', ODiagram);
O.Diagram = ODiagram;
O.diagram.shapes = {
  /** Orion.diagram.shapes.register('star', { size: [80, 80], path: (w, h) => '...', text?: (w, h) => box, ports?: (w, h) => ({ t: [x, y], ... }) }) */
  register: (name, def) => dgShape(name, def),
  get: name => DG_SHAPES[name],
  list: () => Object.keys(DG_SHAPES),
};
