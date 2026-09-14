/* Orion.draggable(el, opts) — free positioning (widgets, windows, pins) with bounds, axis, grid snap, keyboard.
 *   const d = Orion.draggable('#win', { handle: '.title', bounds: 'parent', grid: 8, onEnd: e => save(e.x, e.y) });
 * Orion.dropzone(el, opts) — target for Orion drags (sortable/draggable/dnd.start) AND native HTML5 drops
 *   Orion.dropzone('#trash', { accept: d => !!d.item, onDrop: d => d.item.remove() });
 *   Orion.dropzone('#upload', { accept: d => !d.native || d.hasFiles, onDrop: d => upload(d.files) });
 * Declarative: data-o-sortable (+ -group -handle -items -filter -direction -animation -clone -put -sort -controlled),
 *              data-o-draggable (+ -bounds -axis -handle -grid), data-o-dropzone (+ -accept="files|text").
 */

/* ── dropzone ─────────────────────────────────────────────────────────── */
const __editable = t => !!(t && t.closest && t.closest('input,textarea,[contenteditable]:not([contenteditable="false"])'));
function __nativeData(e, full) {
  const dt = e.dataTransfer;
  const types = [...(dt?.types || [])];
  const d = {
    native: true, types, items: [...(dt?.items || [])].map(i => ({ kind: i.kind, type: i.type })), hasFiles: types.includes('Files'),
    files: [], text: '', html: '', uri: '', uris: [], dataTransfer: dt,
  };
  if (full && dt) {
    d.files = [...(dt.files || [])];
    try { d.text = dt.getData('text/plain'); d.html = dt.getData('text/html'); } catch {}
    try { d.uris = (dt.getData('text/uri-list') || '').split(/\r?\n/).filter(l => l && !l.startsWith('#')); } catch {}
    d.uri = d.uris[0] || '';
    try { const j = dt.getData('application/json'); if (j) d.json = parseJSON(j, undefined); } catch {}
  }
  return d;
}
let __nativeRefs = 0, __nativeOffs = null, __nativeDepth = 0;
function __nativeDoc(delta) {
  __nativeRefs += delta;
  if (__nativeRefs > 0 && !__nativeOffs) {
    const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
    const activate = (onOff, e) => { for (const z of DND.zones) if (z.o.native !== false) z.el.classList.toggle(z.o.activeClass, !!onOff && z.accepts(__nativeData(e, false), { native: true, event: e })); };
    __nativeOffs = [
      on(doc, 'dragenter', e => { if (!DND.session && __nativeDepth++ === 0) activate(true, e); }),
      on(doc, 'dragleave', e => { if (DND.session) return; if (--__nativeDepth <= 0 || !e.relatedTarget) { __nativeDepth = 0; activate(false); } }),
      on(doc, 'drop dragend', () => { __nativeDepth = 0; activate(false); }),
      // a missed file drop must not navigate away from the app
      on(doc, 'dragover', e => { if (!e.__oZone && !DND.session && hasFiles(e) && !__editable(e.target)) { e.preventDefault(); e.dataTransfer.dropEffect = 'none'; } }),
      on(doc, 'drop', e => { if (!e.__oZone && hasFiles(e) && !__editable(e.target)) e.preventDefault(); }),
    ];
  } else if (__nativeRefs <= 0 && __nativeOffs) { __nativeOffs.forEach(f => f()); __nativeOffs = null; __nativeRefs = 0; }
}

class Dropzone {
  constructor(el, o = {}) {
    this.el = el;
    this.o = { accept: null, native: true, internal: true, overClass: 'is-over', activeClass: 'is-drop-active', dropEffect: 'copy', disabled: false, ...o };
    el.__oDrop = this;
    DND.zones.add(this);
    this._offs = [];
    this._native = this.o.native !== false;
    if (this._native) {
      this._offs.push(on(el, 'dragenter dragover', e => this._nOver(e)), on(el, 'dragleave', e => { if (!e.relatedTarget || !el.contains(e.relatedTarget)) this._nOut(e); }), on(el, 'drop', e => this._nDrop(e)));
      __nativeDoc(1);
    }
  }
  accepts(data, info) {
    if (this.o.disabled) return false;
    const a = this.o.accept;
    if (!a) return true;
    try { return !!a(data, info); } catch (e) { console.error('[Orion] dropzone accept', e); return false; }
  }
  _enter(data, e, native) { this.el.classList.add(this.o.overClass); this.o.onEnter?.(data, e); emit(this.el, 'o-drop-enter', { data, native }); }
  _leave(data, e, native) { this.el.classList.remove(this.o.overClass); this.o.onLeave?.(data, e); emit(this.el, 'o-drop-leave', { data, native }); }
  /* internal (pointer) drags — called by the drag session */
  _iEnter(s) { this._in = true; this._enter(s.data, s, false); }
  _iOver(s) { this.o.onOver?.(s.data, s); }
  _iLeave(s) { if (!this._in) return; this._in = false; this._leave(s.data, s, false); }
  _iDrop(s) { this.o.onDrop?.(s.data, s); emit(this.el, 'o-drop', { data: s.data, native: false }); }
  /* native HTML5 drags */
  _nOver(e) {
    if (DND.session) return;
    if (e.__oZone && e.__oZone !== this) { this._nOut(e); return; }
    const data = __nativeData(e, false);
    if (!this.accepts(data, { native: true, event: e })) return;
    e.__oZone = this;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = this.o.dropEffect;
    if (!this._nIn) { this._nIn = true; this._enter(data, e, true); }
    else if (e.type === 'dragover') this.o.onOver?.(data, e);
    clearTimeout(this._nT);
    this._nT = setTimeout(() => this._nOut(null), 300);
  }
  _nOut(e) { clearTimeout(this._nT); if (!this._nIn) return; this._nIn = false; this._leave(null, e, true); }
  _nDrop(e) {
    if (DND.session) return;
    if (e.__oZone && e.__oZone !== this) { this._nOut(e); return; }
    const data = __nativeData(e, true);
    if (!this.accepts(data, { native: true, event: e })) { this._nOut(e); return; }
    e.__oZone = this;
    e.preventDefault();
    this._nOut(e);
    try { this.o.onDrop?.(data, e); } catch (err) { console.error('[Orion] dropzone onDrop', err); }
    emit(this.el, 'o-drop', { data, native: true });
  }
  option(k, v) { if (v === undefined) return this.o[k]; this.o[k] = v; return this; }
  destroy() {
    clearTimeout(this._nT);
    this._offs.forEach(f => f()); this._offs = [];
    if (this._native) __nativeDoc(-1);
    this.el.classList.remove(this.o.overClass, this.o.activeClass);
    DND.zones.delete(this);
    delete this.el.__oDrop;
  }
}
O.dropzone = function (target, options = {}) {
  const el = $(target);
  if (!el) throw new Error('Orion.dropzone: element not found');
  if (el.__oDrop) { Object.entries(options).forEach(([k, v]) => el.__oDrop.option(k, v)); return el.__oDrop; }
  return new Dropzone(el, options);
};
O.Dropzone = Dropzone;

/* ── draggable (free positioning) ─────────────────────────────────────── */
class Draggable {
  constructor(el, o = {}) {
    this.el = el;
    this.o = { data: undefined, handle: null, axis: 'both', bounds: null, grid: null, helper: 'self', apply: 'transform', keyboard: true, step: 10, disabled: false, delayOnTouch: 200, threshold: 3, autoScroll: true, ignore: SORT_DEFAULTS.ignore, ...o };
    const cs = getComputedStyle(el);
    this.pos = this.o.apply === 'position' ? { x: parseFloat(cs.left) || 0, y: parseFloat(cs.top) || 0 } : { x: 0, y: 0 };
    if (o.position) this.pos = { x: +o.position.x || 0, y: +o.position.y || 0 };
    this.initial = { ...this.pos };
    el.__oDraggable = this;
    el.classList.add('o-draggable');
    this._offs = [on(el, 'pointerdown', e => this._down(e)), on(el, 'keydown', e => this._key(e)), touchGuard(el)];
    this._tab = [];
    this._prepare();
    if (o.position || this.o.apply === 'position') this._apply();
  }
  _prepare() {
    const kb = this.o.keyboard && !this.o.disabled;
    const targets = this.o.handle ? $$(this.o.handle, this.el) : [this.el];
    targets.forEach(t => {
      if (this.o.handle) t.classList.add('o-dnd-handle');
      if (kb && t.tabIndex < 0 && !t.hasAttribute('tabindex')) { t.tabIndex = 0; this._tab.push(t); }
    });
  }
  _frame() {
    const op = this.el.offsetParent;
    if (!op || getComputedStyle(this.el).position === 'fixed') return { kind: 'view' };
    if (op === doc.body || op === doc.documentElement) return { kind: 'doc', sx: win.scrollX, sy: win.scrollY };
    const r = op.getBoundingClientRect();
    return { kind: 'el', el: op, left: r.left, top: r.top, sl: op.scrollLeft, st: op.scrollTop };
  }
  _delta(s) {
    const f = this._f;
    if (f.kind === 'view') return [s.x - s.startX, s.y - s.startY];
    if (f.kind === 'doc') return [s.x + win.scrollX - s.startX - f.sx, s.y + win.scrollY - s.startY - f.sy];
    const r = f.el.getBoundingClientRect();
    return [(s.x - r.left + f.el.scrollLeft) - (s.startX - f.left + f.sl), (s.y - r.top + f.el.scrollTop) - (s.startY - f.top + f.st)];
  }
  _limits() {
    const b = this.o.bounds;
    if (!b) return null;
    if (isObj(b) && !(b instanceof Element)) return { minX: b.left ?? -Infinity, maxX: b.right ?? Infinity, minY: b.top ?? -Infinity, maxY: b.bottom ?? Infinity };
    let br;
    if (b === 'window') br = { left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight };
    else {
      const be = b === 'parent' ? this.el.parentElement : $(b);
      if (!be) return null;
      const r = be.getBoundingClientRect();
      br = { left: r.left + be.clientLeft, top: r.top + be.clientTop, right: r.left + be.clientLeft + be.clientWidth, bottom: r.top + be.clientTop + be.clientHeight };
    }
    const er = this.el.getBoundingClientRect(), p = this.pos;
    return { minX: p.x + br.left - er.left, maxX: p.x + Math.max(br.left, br.right - er.width) - er.left, minY: p.y + br.top - er.top, maxY: p.y + Math.max(br.top, br.bottom - er.height) - er.top };
  }
  _snap(x, y) {
    const g = this.o.grid;
    if (g) { const [gx, gy] = Array.isArray(g) ? g : [g, g]; if (gx) x = Math.round(x / gx) * gx; if (gy) y = Math.round(y / gy) * gy; }
    const l = this._lim;
    if (l) { x = clamp(x, l.minX, Math.max(l.minX, l.maxX)); y = clamp(y, l.minY, Math.max(l.minY, l.maxY)); }
    return [x, y];
  }
  _ev(extra) { return { x: this.pos.x, y: this.pos.y, dx: this.pos.x - (this.start?.x ?? this.pos.x), dy: this.pos.y - (this.start?.y ?? this.pos.y), el: this.el, data: this.o.data, dropzone: null, ...extra }; }
  _down(e) {
    if (e.__oDnd || this.o.disabled || DND.session || DND.pending) return;
    const tg = e.target.nodeType === 3 ? e.target.parentElement : e.target;
    let handle = null;
    if (this.o.handle) { handle = tg.closest(this.o.handle); if (!handle || !this.el.contains(handle)) return; }
    const ig = this.o.ignore && tg.closest(this.o.ignore);
    if (ig && ig !== this.el && this.el.contains(ig) && ig !== handle && !(handle && ig.contains(handle))) return;
    e.__oDnd = true;
    const o = this.o, clone = o.helper === 'clone';
    dragStart(e, {
      el: this.el, data: o.data, threshold: o.threshold, delayOnTouch: handle ? 0 : o.delayOnTouch,
      preview: clone ? (o.preview || 'clone') : 'none', previewClass: 'o-draggable-ghost', autoScroll: o.autoScroll,
      onStart: s => {
        this.start = { ...this.pos };
        if (o.onStart?.(this._ev({ session: s })) === false) return false;
        this._f = this._frame(); this._lim = clone ? null : this._limits();
        this.el.classList.add('is-dragging');
        emit(this.el, 'o-drag-start', this._ev());
      },
      onMove: s => {
        if (!clone) {
          let [dx, dy] = this._delta(s);
          if (o.axis === 'x') dy = 0; else if (o.axis === 'y') dx = 0;
          const [x, y] = this._snap(this.start.x + dx, this.start.y + dy);
          if (x !== this.pos.x || y !== this.pos.y) { this.pos = { x, y }; this._apply(); }
        }
        const ev = this._ev({ dropzone: s.dropzone, session: s });
        o.onDrag?.(ev);
        emit(this.el, 'o-drag-move', ev);
      },
      onDrop: s => this._end(s, false),
      onCancel: s => this._end(s, true),
    });
  }
  _end(s, cancelled) {
    const clone = this.o.helper === 'clone';
    if (clone) s.settle(cancelled || !s.dropzone ? this.el.getBoundingClientRect() : null, 200);
    else if (cancelled) this.setPosition(this.start.x, this.start.y, true);
    this.el.classList.remove('is-dragging');
    const ev = this._ev({ cancelled, dropzone: s.dropzone, session: s });
    this.o.onEnd?.(ev);
    emit(this.el, 'o-drag-end', ev);
  }
  _key(e) {
    if (!this.o.keyboard || this.o.disabled || this.o.helper === 'clone' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const tg = e.target;
    if (!(tg === this.el || (this.o.handle && tg.closest(this.o.handle) && this.el.contains(tg)))) return;
    const g = this.o.grid, gs = Array.isArray(g) ? g : [g, g];
    const sx = (gs[0] || this.o.step) * (e.shiftKey ? 5 : 1), sy = (gs[1] || this.o.step) * (e.shiftKey ? 5 : 1);
    const v = { ArrowLeft: [-sx, 0], ArrowRight: [sx, 0], ArrowUp: [0, -sy], ArrowDown: [0, sy] }[e.key];
    if (!v) return;
    if ((this.o.axis === 'x' && v[1]) || (this.o.axis === 'y' && v[0])) return;
    e.preventDefault();
    this.start = { ...this.pos };
    this._lim = this._limits();
    const [x, y] = this._snap(this.pos.x + v[0], this.pos.y + v[1]);
    this.pos = { x, y }; this._apply();
    const ev = this._ev({ keyboard: true });
    this.o.onDrag?.(ev); emit(this.el, 'o-drag-move', ev);
    this.o.onEnd?.(ev); emit(this.el, 'o-drag-end', ev);
  }
  _apply() {
    const { x, y } = this.pos, a = this.o.apply;
    if (a === 'transform') this.el.style.translate = `${x}px ${y}px`;
    else if (a === 'position') { this.el.style.left = x + 'px'; this.el.style.top = y + 'px'; }
  }
  position() { return { ...this.pos }; }
  setPosition(x, y, animate = false) {
    const old = this.el.getBoundingClientRect();
    this.pos = { x: +x || 0, y: +y || 0 };
    this._apply();
    if (animate && !reducedMotion()) {
      const r = this.el.getBoundingClientRect();
      this.el.animate([{ transform: `translate(${old.left - r.left}px,${old.top - r.top}px)` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }
  reset(animate = true) { this.setPosition(this.initial.x, this.initial.y, animate); }
  option(k, v) { if (v === undefined) return this.o[k]; this.o[k] = v; if (k === 'handle' || k === 'keyboard') this._prepare(); return this; }
  destroy() {
    this._offs.forEach(f => f()); this._offs = [];
    this._tab.forEach(t => t.removeAttribute('tabindex'));
    this.el.classList.remove('o-draggable', 'is-dragging');
    delete this.el.__oDraggable;
  }
}
O.draggable = function (target, options = {}) {
  const el = $(target);
  if (!el) throw new Error('Orion.draggable: element not found');
  if (el.__oDraggable) { Object.entries(options).forEach(([k, v]) => el.__oDraggable.option(k, v)); return el.__oDraggable; }
  return new Draggable(el, options);
};
O.Draggable = Draggable;

/* ── declarative behaviors ────────────────────────────────────────────── */
behavior('data-o-sortable', (el, value) => {
  const d = el.dataset, opt = isStr(value) && value.trim().startsWith('{') ? parseJSON(value, {}) : {};
  const clone = d.oSortableClone != null && d.oSortableClone !== 'false';
  if (d.oSortableGroup || clone) opt.group = { name: d.oSortableGroup || null, pull: clone ? 'clone' : true, put: d.oSortablePut !== 'false' };
  else if (d.oSortablePut === 'false') opt.group = { name: null, put: false };
  if (d.oSortableHandle) opt.handle = d.oSortableHandle;
  if (d.oSortableItems) opt.items = d.oSortableItems;
  if (d.oSortableFilter) opt.filter = d.oSortableFilter;
  if (d.oSortableDirection) opt.direction = d.oSortableDirection;
  if (d.oSortableAnimation != null) opt.animation = +d.oSortableAnimation || 0;
  if (d.oSortableSort === 'false') opt.sort = false;
  if (d.oSortableControlled != null) opt.controlled = d.oSortableControlled !== 'false';
  const s = O.sortable(el, opt);
  return () => s.destroy();
});
behavior('data-o-draggable', (el, value) => {
  const d = el.dataset, opt = isStr(value) && value.trim().startsWith('{') ? parseJSON(value, {}) : {};
  if (d.oDraggableBounds) opt.bounds = d.oDraggableBounds;
  if (d.oDraggableAxis) opt.axis = d.oDraggableAxis;
  if (d.oDraggableHandle) opt.handle = d.oDraggableHandle;
  if (d.oDraggableGrid) opt.grid = +d.oDraggableGrid || null;
  const dr = O.draggable(el, opt);
  return () => dr.destroy();
});
behavior('data-o-dropzone', (el) => {
  const acc = el.dataset.oDropzoneAccept;
  const accept = acc === 'files' ? dd => !dd.native || dd.hasFiles : acc === 'text' ? dd => !dd.native || dd.types.includes('text/plain') : null;
  const z = O.dropzone(el, { accept });
  return () => z.destroy();
});
