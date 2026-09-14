/* <o-dashboard> — customizable grid of <o-widget>s: per-breakpoint layouts, compaction, persistence.
 * Internal layout item: { id, x, y, w, h, H, collapsed, minW, minH, maxW, maxH, locked }
 *   h = rows occupied now (1 when collapsed), H = the real height in rows.
 * Widgets are placed with CSS grid (grid-column / grid-row), so RTL mirrors for free and DOM nodes are never moved.
 */

const DASH_MIN = { xxl: 1400, xl: 1100, lg: 840, md: 600, sm: 400, xs: 0, xxs: 0 };
const DASH_RANK = [840, 600, 400, 0];
const dashNum = (el, src, k) => {
  let v = src && src[k] != null ? src[k] : el ? el[k] : null;
  if (v == null && el) { const a = el.getAttribute(kebab(k)); if (a != null && a !== '') v = a; }
  return v == null || v === '' || Number.isNaN(+v) ? null : +v;
};

class ODashboard extends OElement {
  static props = {
    columns: { type: Number, default: 12 },
    rowHeight: { type: Number, default: 80 },
    gap: { type: Number, default: 16 },
    editable: { type: Boolean, reflect: true },
    locked: { type: Boolean, reflect: true },
    persist: String,
    breakpoints: Object,
    compact: { type: String, default: 'vertical' },
    float: Boolean,
    layout: Array,
    layouts: Object,
    catalog: Array,
    confirmRemove: { type: Any, default: true },
    label: String,
    texts: Object,
  };

  setup() {
    this.classList.add('o-dashboard');
    if (!this.hasAttribute('role')) this.setAttribute('role', 'region');
    this._layouts = {};
    this._removed = new Map();
    this._added = new Map();
    this._cur = [];
    this._bp = null;
    this._help = h('div', { class: 'o-sr-only o-dashboard-help', id: uid('dash-help') });
    this._ph = h('div', { class: 'o-dashboard-placeholder', hidden: true, 'aria-hidden': 'true' });
    this.append(this._help, this._ph);
    this._saveSoon = debounce(() => this.save(), 120);
    const st = this._readStore();
    this._restore = st;
    on(this, 'pointerdown', e => this._onPointerDown(e));
    on(this, 'keydown', e => this._onKey(e));
  }

  connected() {
    this.addCleanup(observeResize(this, rafThrottle(() => this._onResize())));
    const mo = this._mo = new MutationObserver(muts => {
      const hit = muts.some(m => [...m.addedNodes, ...m.removedNodes].some(n => n.localName === 'o-widget'));
      if (hit) this._sync();
    });
    mo.observe(this, { childList: true });
    this.addCleanup(() => { mo.disconnect(); this._mo = null; });
    if (this._setupDone && this._bp) this._sync();
  }

  /** Run DOM changes of our own without re-triggering the children observer. */
  _quiet(fn) { try { return fn(); } finally { this._mo?.takeRecords(); } }

  disconnected() { this._endGesture?.(true); this.closeCatalog(); }

  update(changed) {
    const init = changed.has('init');
    css(this, { '--o-dash-row': (this.rowHeight || 80) + 'px', '--o-dash-gap': (this.gap ?? 16) + 'px' });
    if (!this.getAttribute('aria-label') || this._autoLabel) { this._autoLabel = true; this.setAttribute('aria-label', this.label || this.t('dashboard.label')); }
    if (init || changed.has('layouts')) this._layouts = merge({}, this.layouts || {}, init ? this._restore?.layouts || {} : {});
    if (init || ['layout', 'catalog', 'breakpoints', 'columns', 'layouts', 'compact', 'float'].some(k => changed.has(k))) this._sync();
    if (init || changed.has('editable') || changed.has('locked') || changed.has('locale')) this._paintEdit(!init && (changed.has('editable') || changed.has('locked')));
    if (changed.has('locale')) this._catRender?.();
    if (changed.has('persist') && !init) { this._restore = this._readStore(); if (this._restore) { this._layouts = merge({}, this.layouts || {}, this._restore.layouts || {}); this._sync(); } }
  }

  /* ── breakpoints ───────────────────────────────────────────────── */
  _bpList() {
    const c = Math.max(1, this.columns || 12);
    const cfg = this.breakpoints && Object.keys(this.breakpoints).length ? this.breakpoints
      : { lg: c, md: Math.max(1, Math.round(c * 2 / 3)), sm: Math.max(1, Math.round(c / 3)), xs: 1 };
    const list = Object.entries(cfg).map(([name, v]) => ({
      name, cols: Math.max(1, Math.round(+(isObj(v) ? v.cols : v) || c)),
      min: isObj(v) && (v.width ?? v.minWidth) != null ? +(v.width ?? v.minWidth) : DASH_MIN[name],
    })).sort((a, b) => b.cols - a.cols);
    list.forEach((b, i) => { if (b.min == null) b.min = DASH_RANK[Math.min(i, DASH_RANK.length - 1)]; });
    list.sort((a, b) => b.min - a.min || b.cols - a.cols);
    list[list.length - 1].min = 0;
    return list;
  }
  _bpFor(width) { const l = this._bpList(); return l.find(b => width >= b.min) || l[l.length - 1]; }
  get breakpoint() { return this._bp?.name || null; }
  get cols() { return this._bp?.cols || this.columns || 12; }
  _base() { return this._bpList()[0]; }
  _mode() { return this.float || this.compact === 'none' ? 'none' : 'vertical'; }

  /* ── widgets ───────────────────────────────────────────────────── */
  _allWidgets() { return [...this.children].filter(el => el.localName === 'o-widget'); }
  _widgets() { return this._allWidgets().filter(el => !this._removed.has(el.id)); }
  get widgets() { return this._widgets(); }
  getWidget(id) { return this._widgets().find(w => w.id === id) || null; }
  _el(id) { return this._widgets().find(w => w.id === id); }
  _item(id) { return this._cur.find(i => i.id === id) || null; }
  _entry(id) { return (this.layout || []).find(e => e && e.id === id) || null; }
  _catalogDef(type) { return (this.catalog || []).find(c => c.type === type) || null; }
  _newId(type) { let i = 1, base = (type || 'widget').replace(/[^\w-]/g, '') || 'widget'; while (this.querySelector(`#${CSS.escape(base + '-' + i)}`) || this._added.has(base + '-' + i)) i++; return base + '-' + i; }

  _createWidget(spec) {
    const el = doc.createElement('o-widget');
    el.id = spec.id;
    el.__odash = true;
    const map = { heading: spec.heading ?? spec.title, subtitle: spec.subtitle, icon: spec.icon, type: spec.type, renderer: spec.renderer, data: spec.data };
    for (const k of ['collapsible', 'removable', 'refreshable', 'fullscreen', 'settings', 'locked', 'headerless', 'flushed', 'lazy', 'collapsed', 'minW', 'minH', 'maxW', 'maxH', 'x', 'y', 'w', 'h']) if (spec[k] != null) map[k] = spec[k];
    for (const [k, v] of Object.entries(map)) if (v != null) el[k] = v;
    return el;
  }

  /** Reconcile children, layout-prop widgets, persisted additions/removals, then lay out. */
  _sync() {
    if (!this._setupDone) return;
    this._quiet(() => {
      const have = new Set(this._allWidgets().map(w => w.id).filter(Boolean));
      for (const e of this.layout || []) {
        if (!e || !e.id || have.has(e.id)) continue;
        if (e.renderer || e.heading || e.title || e.type) { const def = e.type ? this._catalogDef(e.type) : null; this.append(this._createWidget({ ...(def || {}), ...e })); have.add(e.id); }
      }
      const r = this._restore;
      if (r && r.added) {
        r.added = r.added.filter(a => {
          if (have.has(a.id)) return false;
          const def = this._catalogDef(a.type);
          if (!def) return true;
          const el = this._createWidget({ removable: true, collapsible: true, ...def, ...a, renderer: def.renderer });
          this._added.set(a.id, { ...a });
          this.append(el); have.add(a.id);
          return false;
        });
      }
      this._allWidgets().forEach((w, i) => {
        if (!w.id) w.id = 'widget-' + (i + 1);
        if (w.__oInitCollapsed === undefined) w.__oInitCollapsed = !!w.collapsed || w.hasAttribute('collapsed');
      });
      if (r && r.removed) { for (const id of r.removed) { const w = this._allWidgets().find(x => x.id === id); if (w) this._hide(w); } r.removed = null; }
      if (r && r.collapsed) { for (const id of r.collapsed) { const w = this._el(id); if (w) { this._internal = true; w.collapsed = true; w.flush?.(); this._internal = false; } } r.collapsed = null; }
    });
    const width = this.clientWidth;
    this._bp = width ? this._bpFor(width) : (this._bp || this._base());
    this._cur = this._compute(this._bp);
    this._apply(this._cur, { animate: false });
    this._paintEdit(false);
  }

  _hide(w) { this._removed.set(w.id, w); w.hidden = true; w.setAttribute('data-removed', ''); }

  /* ── layout computation ────────────────────────────────────────── */
  _constraints(src, cols, baseCols) {
    const k = cols / baseCols, sc = v => (v == null ? null : clamp(Math.round(v * k), 1, cols));
    return cols === 1 ? { minW: 1, maxW: 1, minH: src.minH, maxH: src.maxH } : { minW: sc(src.minW), maxW: sc(src.maxW), minH: src.minH, maxH: src.maxH };
  }
  _norm(it, cols) {
    const H = it.H ?? it.h;
    const t = gridClamp({ ...it, h: H }, cols);
    t.H = t.h;
    if (t.collapsed) t.h = 1;
    return t;
  }
  _baseLayout() {
    const base = this._base(), cols = base.cols, mode = this._mode();
    const list = [], auto = [];
    for (const w of this._widgets()) {
      const e = this._entry(w.id);
      const g = k => dashNum(w, e, k);
      const it = { id: w.id, x: g('x'), y: g('y'), w: g('w') ?? 3, h: g('h') ?? 2, minW: g('minW'), minH: g('minH'), maxW: g('maxW'), maxH: g('maxH'), locked: !!(e?.locked ?? w.locked), collapsed: !!w.collapsed };
      (it.x == null || it.y == null ? auto : list).push(it);
    }
    const out = gridCompact(list.map(i => this._norm(i, cols)), mode);
    for (const a of auto) { const n = this._norm({ ...a, x: 0, y: 0 }, cols); Object.assign(n, gridFreeSpot(out, n.w, n.h, cols)); out.push(n); }
    return gridCompact(out, mode);
  }
  _compute(bp) {
    const base = this._baseLayout(), baseCols = this._base().cols, cols = bp.cols, mode = this._mode();
    const cons = it => ({ ...it, ...this._constraints(it, cols, baseCols) });
    const exp = this._layouts[bp.name];
    if (Array.isArray(exp) && exp.length) {
      const byId = new Map(exp.filter(Boolean).map(e => [e.id, e]));
      const list = [], missing = [];
      for (const b of base) {
        const e = byId.get(b.id);
        if (e) list.push(this._norm({ ...cons(b), x: +e.x || 0, y: +e.y || 0, w: +e.w || b.w, H: +e.h || b.H }, cols));
        else missing.push(b);
      }
      gridCompact(list, mode);
      for (const m of missing) {
        const n = this._norm({ ...cons(m), w: Math.round(m.w * cols / baseCols) || 1, x: 0, y: 0 }, cols);
        Object.assign(n, gridFreeSpot(list, n.w, n.h, cols)); list.push(n);
      }
      return gridCompact(list, mode);
    }
    if (cols === baseCols) return base;
    return gridCompact(gridDerive(base, baseCols, cols, mode).map(it => this._norm({ ...cons(it), H: it.H }, cols)), cols === 1 ? 'vertical' : mode);
  }

  /* ── rendering ─────────────────────────────────────────────────── */
  _apply(list, { animate: anim = true, skip = null } = {}) {
    const els = this._widgets();
    const first = anim && !reducedMotion() ? new Map(els.filter(w => w !== skip).map(w => [w, w.getBoundingClientRect()])) : null;
    for (const it of list) {
      const w = els.find(e => e.id === it.id);
      if (!w || w === skip) continue;
      w.style.gridColumn = `${it.x + 1} / span ${it.w}`;
      w.style.gridRow = `${it.y + 1} / span ${it.h}`;
      w.classList.toggle('is-locked', !!it.locked);
    }
    this._rows();
    if (first) for (const [w, a] of first) {
      const b = w.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) + Math.abs(dy) > 1 && a.width) animate(w, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 200 });
    }
  }
  _rows(extra = 0) {
    const rows = Math.max(gridBottom(this._cur), 1) + (this.editable ? 2 : 0) + extra;
    this.style.setProperty('--o-dash-rows', String(rows));
    this.style.setProperty('--o-dash-cols', String(this.cols));
  }
  _metrics() {
    const cols = this.cols, gap = this.gap ?? 16, W = this.clientWidth;
    const colW = (W - gap * (cols - 1)) / cols, rowH = this.rowHeight || 80;
    return { cols, gap, W, colW, rowH, px: colW + gap, py: rowH + gap, rtl: isRTL(this) };
  }
  _onResize() {
    const width = this.clientWidth;
    if (!width) return;
    const m = this._metrics();
    this.style.setProperty('--o-dash-colw', m.colW + 'px');
    this.style.setProperty('--o-dash-pitch', m.px + 'px');
    const bp = this._bpFor(width);
    if (this._bp && bp.name === this._bp.name) return;
    const prev = this._bp?.name;
    this._endGesture?.(true);
    this._bp = bp;
    this._cur = this._compute(bp);
    this._apply(this._cur, { animate: false });
    this.style.setProperty('--o-dash-colw', this._metrics().colW + 'px');
    this.style.setProperty('--o-dash-pitch', this._metrics().px + 'px');
    if (prev) {
      this.emit('breakpoint-change', { breakpoint: bp.name, previous: prev, columns: bp.cols });
      requestAnimationFrame(() => this._widgets().forEach(w => w._notifyResize?.(false)));
    }
  }

  _paintEdit(announceIt) {
    const on_ = !!this.editable && !this.locked;
    this.classList.toggle('is-editing', on_);
    this.classList.toggle('is-locked', !!this.locked);
    this._help.textContent = this.t('dashboard.editOn');
    for (const w of this._widgets()) {
      if (on_) { if (!w.hasAttribute('tabindex') || w.__oTab) { w.setAttribute('tabindex', '0'); w.__oTab = true; } w.setAttribute('aria-describedby', this._help.id); }
      else if (w.__oTab) { w.removeAttribute('tabindex'); w.__oTab = false; w.removeAttribute('aria-describedby'); }
      w._paintMenuBtn?.();
    }
    this._rows();
    if (this.id) $$(`[data-o-action="dashboard"][data-o-value="edit"][data-o-target="#${CSS.escape(this.id)}"]`).forEach(b => b.setAttribute('aria-pressed', String(on_)));
    if (announceIt) { announce(this.t(on_ ? 'dashboard.editOn' : 'dashboard.editOff')); this.emit('edit-change', { editable: on_ }); }
  }

  /* ── committing changes ────────────────────────────────────────── */
  _commit(reason, id) {
    this._layouts[this._bp.name] = this._cur.map(({ id: i, x, y, w, H }) => ({ id: i, x, y, w, h: H }));
    this._saveSoon();
    this.emit('layout-change', { reason, id, breakpoint: this._bp.name, layout: this.getLayout(), layouts: this.getLayouts() });
  }

  _widgetChanged(w, changed) {
    if (this._internal || !this._bp) return;
    const it = this._item(w.id);
    if (!it) return;
    const cols = this.cols, mode = this._mode();
    if (changed.has('collapsed')) {
      it.collapsed = !!w.collapsed; it.h = it.collapsed ? 1 : it.H;
      if (!it.collapsed) gridCascade(this._cur, it);
      gridCompact(this._cur, mode);
      this._apply(this._cur);
      this._saveSoon();
      this.emit('layout-change', { reason: 'collapse', id: w.id, breakpoint: this._bp.name, layout: this.getLayout(), layouts: this.getLayouts() });
      if (!it.collapsed) requestAnimationFrame(() => w._notifyResize(false));
      return;
    }
    for (const k of ['minW', 'minH', 'maxW', 'maxH']) if (changed.has(k)) it[k] = w[k];
    if (changed.has('locked')) it.locked = !!w.locked;
    const nx = changed.has('x') && w.x != null ? w.x : it.x, ny = changed.has('y') && w.y != null ? w.y : it.y;
    const nw = changed.has('w') && w.w != null ? w.w : it.w, nh = changed.has('h') && w.h != null ? w.h : it.H;
    Object.assign(it, this._norm({ ...it, w: nw, H: nh }, cols));
    this._cur = gridMove(this._cur, it.id, nx, ny, mode, cols);
    this._apply(this._cur);
    this._commit('api', w.id);
  }

  /* ── public API ────────────────────────────────────────────────── */
  toggleEdit(force) {
    const next = force == null ? !this.editable : !!force;
    if (this.locked && next) return false;
    this.editable = next;
    return next;
  }
  /** Current layout (or the one for breakpoint `bp`): [{ id, x, y, w, h, collapsed? }] */
  getLayout(bp) {
    const b = bp ? this._bpList().find(x => x.name === bp) : this._bp;
    const list = !b || b === this._bp ? this._cur : this._compute(b);
    return list.map(({ id, x, y, w, H, collapsed }) => (collapsed ? { id, x, y, w, h: H, collapsed: true } : { id, x, y, w, h: H }));
  }
  /** Every breakpoint's layout: { lg: [...], md: [...], ... } */
  getLayouts() { const out = {}; for (const b of this._bpList()) out[b.name] = this.getLayout(b.name); return out; }
  /** setLayout([{ id, x, y, w, h }], { breakpoint, silent }) */
  setLayout(layout, { breakpoint, silent = false } = {}) {
    const name = breakpoint || this._bp?.name || this._base().name;
    this._layouts[name] = toArr(layout).filter(i => i && i.id).map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
    if (this._bp && name === this._bp.name) { this._cur = this._compute(this._bp); this._apply(this._cur); }
    this._saveSoon();
    if (!silent) this.emit('layout-change', { reason: 'api', breakpoint: name, layout: this.getLayout(), layouts: this.getLayouts() });
  }
  setLayouts(map = {}) { for (const [bp, l] of Object.entries(map)) this.setLayout(l, { breakpoint: bp, silent: true }); this.emit('layout-change', { reason: 'api', breakpoint: this._bp?.name, layout: this.getLayout(), layouts: this.getLayouts() }); }
  /** Full state for server persistence: { v, layouts, removed, added, collapsed } */
  getState() {
    return {
      v: 1, layouts: clone(this._layouts), removed: [...this._removed.keys()],
      added: [...this._added.values()].map(a => ({ ...a })), collapsed: this._widgets().filter(w => w.collapsed).map(w => w.id),
    };
  }
  setState(state) {
    if (!isObj(state)) return;
    this._restoreDefaults();
    this._restore = clone(state);
    this._layouts = merge({}, this.layouts || {}, state.layouts || {});
    this._sync();
    this._saveSoon();
  }
  get _key() { return this.persist ? 'orion:dashboard:' + this.persist : null; }
  _readStore() { const s = this._key ? ls.get(this._key, null) : null; return isObj(s) && s.v === 1 ? clone(s) : null; }
  /** Persist to localStorage now (when `persist` is set). */
  save() { this._saveSoon?.cancel(); if (this._key) ls.set(this._key, this.getState()); }
  _restoreDefaults() {
    for (const w of this._removed.values()) { w.hidden = false; w.removeAttribute('data-removed'); }
    this._removed.clear();
    this._quiet(() => { for (const id of this._added.keys()) this._allWidgets().find(w => w.id === id)?.remove(); });
    this._added.clear();
    this._internal = true;
    for (const w of this._allWidgets()) { if (w.__oInitCollapsed !== undefined) { w.collapsed = w.__oInitCollapsed; w.flush?.(); } }
    this._internal = false;
  }
  /** Forget user changes: restores removed widgets, drops catalog-added ones, clears storage. */
  reset() {
    this._endGesture?.(true);
    if (this._key) ls.del(this._key);
    this._restoreDefaults();
    this._restore = null;
    this._layouts = merge({}, this.layouts || {});
    this._sync();
    announce(this.t('dashboard.reset'));
    this.emit('layout-change', { reason: 'reset', breakpoint: this._bp?.name, layout: this.getLayout(), layouts: this.getLayouts() });
  }
  /** Re-run compaction on the current layout. */
  compactLayout() { gridCompact(this._cur, 'vertical'); this._apply(this._cur); this._commit('compact'); }
  refreshAll() { return Promise.all(this._widgets().map(w => w.refresh?.())); }

  /** addWidget(typeOrSpec, { id, x, y, w, h, heading, focus }) -> the new <o-widget> */
  addWidget(spec, opts = {}) {
    const def = isStr(spec) ? this._catalogDef(spec) : spec;
    if (!def || !this._bp) return null;
    const item = { removable: true, collapsible: true, ...def, ...opts };
    if (!this.emit('before-widget-add', { item })) return null;
    const id = item.id || this._newId(item.type);
    const baseB = this._base(), bw = clamp(+item.w || 3, 1, baseB.cols), bh = Math.max(1, +item.h || 2);
    const baseList = this._compute(baseB);
    const bspot = gridFreeSpot(baseList, bw, bh, baseB.cols);
    const el = this._createWidget({ ...item, id, x: bspot.x, y: bspot.y, w: bw, h: bh, renderer: item.renderer });
    if (item.type) this._added.set(id, { id, type: item.type, heading: item.heading ?? item.title, icon: item.icon, subtitle: item.subtitle, w: bw, h: bh, data: item.data });
    this._quiet(() => this.append(el));
    const cols = this.cols, n = this._norm({ id, x: 0, y: 0, w: Math.max(1, Math.round(bw * cols / baseB.cols)), H: bh, minW: el.minW, minH: el.minH, maxW: el.maxW, maxH: el.maxH }, cols);
    if (opts.x != null && opts.y != null) { n.x = +opts.x; n.y = +opts.y; this._cur.push(n); this._cur = gridMove(this._cur, id, n.x, n.y, this._mode(), cols); }
    else { Object.assign(n, gridFreeSpot(this._cur, n.w, n.h, cols)); this._cur.push(n); gridCompact(this._cur, this._mode()); }
    for (const b of this._bpList()) if (b !== this._bp && Array.isArray(this._layouts[b.name])) this._layouts[b.name] = this._layouts[b.name].filter(e => e.id !== id);
    this._apply(this._cur);
    this._paintEdit(false);
    this._commit('add', id);
    this.emit('widget-add', { id, widget: el });
    announce(this.t('dashboard.added', { title: el.heading || id }));
    if (opts.focus !== false) requestAnimationFrame(() => { el.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }); animate(el, 'highlight', { duration: 900 }); });
    return el;
  }

  /** duplicateWidget(id) — for widgets that have a `type` or `renderer` function. */
  duplicateWidget(id) {
    const w = this.getWidget(id), it = this._item(id);
    if (!w || !(w.type || w.renderer)) return null;
    const def = w.type ? this._catalogDef(w.type) : null;
    const k = this._base().cols / this.cols;
    return this.addWidget({ ...(def || {}), type: w.type, heading: w.heading, subtitle: w.subtitle, icon: w.icon, renderer: w.renderer, data: w.data == null ? undefined : clone(w.data), refreshable: w.refreshable, fullscreen: w.fullscreen, settings: w.settings, flushed: w.flushed, headerless: w.headerless, w: Math.round((it?.w || 3) * k), h: it?.H || 2 });
  }

  /** removeWidget(id, { confirm }) -> Promise<boolean> */
  async removeWidget(id, { confirm = false } = {}) {
    const w = this.getWidget(id);
    if (!w || w.locked) return false;
    const cr = this.confirmRemove;
    if (confirm && cr !== false && cr !== 'false') {
      const title = w.heading || this.t('dashboard.widget');
      const ok = isFn(cr) ? await cr(w) : await dashConfirm(w, { title: this.t('dashboard.confirmTitle', { title }), text: this.t('dashboard.confirmText'), ok: this.t('dashboard.remove'), cancel: this.t('dashboard.cancel') });
      if (!ok) { if (this.editable) w.focus({ preventScroll: true }); return false; }
    }
    if (!this.emit('before-widget-remove', { id, widget: w })) return false;
    const idx = this._widgets().indexOf(w);
    if (w._max) w.maximize(false);
    this._quiet(() => { if (this._added.has(id)) { this._added.delete(id); w.remove(); } else this._hide(w); });
    this._cur = this._cur.filter(i => i.id !== id);
    gridCompact(this._cur, this._mode());
    this._apply(this._cur);
    this._commit('remove', id);
    this.emit('widget-remove', { id, widget: w });
    announce(this.t('dashboard.removed', { title: w.heading || id }));
    const rest = this._widgets();
    const next = rest[Math.min(idx, rest.length - 1)];
    if (next && this.editable) next.focus({ preventScroll: false }); else if (!next) this.focus?.();
    return true;
  }
}
O.Dashboard = ODashboard;
