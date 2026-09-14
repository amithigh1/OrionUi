/* dnd — low-level drag engine shared by sortable, draggable, dropzone, kanban and tree.
 *   const s = Orion.dnd.start(pointerdownEvent, { el, data, preview: 'clone', onStart, onMove, onDrop, onCancel, onEnd });
 *   Orion.dnd.flip(elements, () => mutateDOM(), { duration: 180 });   // FLIP animation
 *   Orion.dnd.layoutRect(el)                                          // rect without running FLIP transforms
 * Mouse/pen start after `threshold` px; touch after a `delayOnTouch` long-press (moving first = native scroll).
 * One drag at a time. The session auto-scrolls, feeds dropzones and suppresses the click that follows a drop.
 */
i18n.add('en', {
  dnd: {
    instructions: 'Press Space or Enter to pick up. While dragging, use the arrow keys to move, Space or Enter to drop and Escape to cancel.',
    picked: 'Picked up {item}. Position {index} of {count}.',
    moved: 'Position {index} of {count}.',
    movedList: 'Moved to {list}, position {index} of {count}.',
    dropped: 'Dropped {item} at position {index} of {count}.',
    droppedList: 'Dropped {item} in {list}, position {index} of {count}.',
    cancelled: 'Move cancelled. {item} returned to position {index}.',
    blocked: 'Cannot move there.',
    item: 'item', list: 'list', handle: 'Drag handle', dropHere: 'Drop here',
  },
});

const DND = { session: null, pending: null, zones: new Set(), flips: new WeakMap(), sortables: new Set() };
const DRAG_Z = 1400;

/** Rect of el ignoring a running FLIP translate (stable hit-testing while items animate). */
function layoutRect(el) {
  const r = el.getBoundingClientRect(), a = DND.flips.get(el);
  if (!a || a.playState !== 'running') return r;
  const tr = getComputedStyle(el).transform;
  if (!tr || tr === 'none') return r;
  const m = new DOMMatrixReadOnly(tr);
  return new DOMRect(r.left - m.e, r.top - m.f, r.width, r.height);
}

/** FLIP: measure els, run mutate(), animate every moved element from its old place. */
function flip(els, mutate, { duration = 180, easing = 'cubic-bezier(.2,.8,.2,1)' } = {}) {
  if (!duration || reducedMotion() || !isBrowser) { mutate(); return; }
  const vh = win.innerHeight, vw = win.innerWidth, first = new Map();
  for (const el of els) {
    if (!el || !el.isConnected || first.has(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < -200 || r.top > vh + 200 || r.right < -200 || r.left > vw + 200) continue; // off-screen: skip
    first.set(el, r);
  }
  mutate();
  const moves = [];
  for (const [el, r0] of first) {
    if (!el.isConnected) continue;
    DND.flips.get(el)?.cancel();
    const r1 = el.getBoundingClientRect();
    const dx = r0.left - r1.left, dy = r0.top - r1.top;
    if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) moves.push([el, dx, dy]);
  }
  for (const [el, dx, dy] of moves) {
    const a = el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration, easing });
    DND.flips.set(el, a);
    const done = () => { if (DND.flips.get(el) === a) DND.flips.delete(el); };
    a.onfinish = done; a.oncancel = done;
  }
}

/** A running drag may cancel native touch scrolling inside el (registered up-front: Chrome needs it). */
function touchGuard(el) {
  const fn = e => { if (DND.session || DND.pending?.armed) { if (e.cancelable) e.preventDefault(); } };
  el.addEventListener('touchmove', fn, { passive: false });
  return () => el.removeEventListener('touchmove', fn, { passive: false });
}

const __canScroll = (el, axis) => {
  if (el === doc.scrollingElement) return axis === 'y' ? el.scrollHeight > win.innerHeight : el.scrollWidth > win.innerWidth;
  const s = getComputedStyle(el), ov = axis === 'y' ? s.overflowY : s.overflowX;
  return /(auto|scroll|overlay)/.test(ov) && (axis === 'y' ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1);
};
function __scrollers(from) {
  const out = [];
  for (let p = from; p && p.nodeType === 1 && p !== doc.body && p !== doc.documentElement; p = p.parentElement) {
    if (__canScroll(p, 'y') || __canScroll(p, 'x')) out.push(p);
  }
  if (doc.scrollingElement) out.push(doc.scrollingElement);
  return out;
}
const __edge = (p, lo, hi, sens, max) => {
  if (p < lo + sens) return -Math.ceil(max * Math.min(1, (lo + sens - p) / sens) ** 1.5);
  if (p > hi - sens) return Math.ceil(max * Math.min(1, (p - (hi - sens)) / sens) ** 1.5);
  return 0;
};

class DragSession {
  constructor(e, o) {
    this.o = { threshold: 4, delayOnTouch: 200, touchTolerance: 8, preview: 'clone', autoScroll: true, scrollSensitivity: 56, scrollSpeed: 22, ghostParent: 'body', ...o };
    this.el = o.el || e.currentTarget;
    this.pointerId = e.pointerId;
    this.pointerType = e.pointerType || 'mouse';
    this.startX = this.x = e.clientX; this.startY = this.y = e.clientY;
    this.dx = this.dy = 0;
    this.active = false; this.cancelled = false; this.armed = false;
    this.target = null; this.dropzone = null; this.preview = null;
    this.event = e;
    this._offs = [];
    this._tick = this._tick.bind(this);
    const d = this.o.data;
    this.data = isFn(d) ? undefined : d;
    this._dataFn = isFn(d) ? d : null;
  }
  _listen(t, ty, fn, opts) { t.addEventListener(ty, fn, opts); this._offs.push(() => t.removeEventListener(ty, fn, opts)); }
  _arm() {
    const touch = this.pointerType === 'touch';
    const delay = touch ? this.o.delayOnTouch : 0;
    this._listen(doc, 'pointermove', e => this._onMove(e), { passive: true });
    this._listen(doc, 'pointerup', e => this._onUp(e));
    this._listen(doc, 'pointercancel', e => { if (e.pointerId === this.pointerId) { this._up = true; this._abort(true); } });
    this._listen(win, 'blur', () => { this._up = true; this._abort(true); });
    this._listen(doc, 'touchmove', e => { if ((this.active || this.armed) && e.cancelable) e.preventDefault(); }, { passive: false });
    this._listen(doc, 'dragstart', e => e.preventDefault());
    if (touch) {
      this.el.classList.add('o-dnd-pressing');
      this._listen(doc, 'contextmenu', e => e.preventDefault());
      if (delay > 0) { this._timer = setTimeout(() => { this.armed = true; this._begin(); }, delay); this.o.onPending?.(this); }
      else { this.armed = true; }
    }
  }
  _onMove(e) {
    if (e.pointerId !== this.pointerId) return;
    this.x = e.clientX; this.y = e.clientY; this.event = e;
    this.dx = this.x - this.startX; this.dy = this.y - this.startY;
    if (this.active) { this._moved = true; return; }
    const dist = Math.hypot(this.dx, this.dy);
    if (this.pointerType === 'touch') {
      if (this.armed) { if (dist > 1) this._begin(); }
      else if (dist > this.o.touchTolerance) this._abort(false);  // finger moved first: native scroll wins
    } else if (dist >= this.o.threshold) this._begin();
  }
  _onUp(e) {
    if (e.pointerId !== this.pointerId) return;
    if (!this.active) { this._abort(false); return; }
    this._up = true;
    this.x = e.clientX; this.y = e.clientY; this.event = e;
    this._flushMove();
    this._finish(false);
  }
  _begin() {
    if (this.active || this._done) return;
    clearTimeout(this._timer);
    DND.pending = null;
    if (this._dataFn) this.data = this._dataFn(this.el, this);
    this.el.classList.remove('o-dnd-pressing');
    this._makePreview();   // before onStart, so consumer state classes (placeholder…) are not cloned
    if (this.o.onStart?.(this) === false) { this._cleanup(); return; }
    this.active = true;
    DND.session = this;
    doc.documentElement.classList.add('o-dnd-dragging');
    try { win.getSelection()?.removeAllRanges(); } catch {}
    this._listen(doc, 'keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.cancel(); } }, true);
    for (const z of DND.zones) if (z.o.internal !== false && z.accepts(this.data, { native: false, session: this })) z.el.classList.add(z.o.activeClass || 'is-drop-active');
    this._moved = true;
    this._raf = requestAnimationFrame(this._tick);
  }
  _makePreview() {
    const o = this.o, el = this.el;
    if (o.preview === 'none') return;
    const r = el.getBoundingClientRect();
    let g = isFn(o.preview) ? o.preview(el, this) : el.cloneNode(true);
    if (!g) return;
    if (!isFn(o.preview)) {
      const cs = getComputedStyle(el);
      css(g, { width: r.width + 'px', height: r.height + 'px', color: cs.color, font: cs.font, lineHeight: cs.lineHeight });
    }
    g.removeAttribute('id');
    g.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    g.querySelectorAll('[tabindex],a[href],button,input,select,textarea').forEach(n => n.setAttribute('tabindex', '-1'));
    g.classList.add('o-dnd-ghost', ...String(o.previewClass || '').split(/\s+/).filter(Boolean));
    g.setAttribute('aria-hidden', 'true');
    g.inert = true;
    css(g, { position: 'fixed', left: '0px', top: '0px', margin: '0', zIndex: DRAG_Z, pointerEvents: 'none', boxSizing: 'border-box' });
    const parent = o.ghostParent === 'parent' ? el.parentElement : o.ghostParent instanceof Element ? o.ghostParent : doc.body;
    parent.appendChild(g);
    if (parent === doc.body) inheritContext(g, el);
    const gr = g.getBoundingClientRect();
    // keep the grab point under the pointer (custom previews are centred when smaller)
    this.offX = isFn(o.preview) && gr.width < r.width ? gr.width / 2 : clamp(this.startX - r.left, 0, gr.width);
    this.offY = isFn(o.preview) && gr.height < r.height ? gr.height / 2 : clamp(this.startY - r.top, 0, gr.height);
    this.preview = g;
    this._place();
    requestAnimationFrame(() => g.classList.add('is-lifted'));
  }
  _place() { if (this.preview) this.preview.style.transform = `translate3d(${this.x - this.offX}px,${this.y - this.offY}px,0)`; }
  _tick() {
    if (!this.active) return;
    if (this.o.autoScroll !== false && this._autoScroll()) this._moved = true;
    this._flushMove();
    this._raf = requestAnimationFrame(this._tick);
  }
  _flushMove() {
    if (!this._moved) return;
    this._moved = false;
    this.dx = this.x - this.startX; this.dy = this.y - this.startY;
    this._place();
    const vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
    const t = this.x >= 0 && this.y >= 0 && this.x < vw && this.y < vh ? doc.elementFromPoint(this.x, this.y) : null;
    if (t !== this.target) { this.target = t; this._scrollCache = null; }
    this._updateZone();
    try { this.o.onMove?.(this); } catch (err) { console.error('[Orion] dnd onMove', err); }
  }
  _updateZone() {
    let zone = null;
    for (let n = this.target; n && n.nodeType === 1; n = n.parentElement) {
      if (this.o.stopZoneAt?.(n)) break;
      const z = n.__oDrop;
      if (z && z.o.internal !== false && !z.o.disabled && !(this.el.contains(n)) && z.accepts(this.data, { native: false, session: this })) { zone = z; break; }
    }
    const cur = this.dropzone?.__oDrop || null;
    if (zone === cur) { if (zone) zone._iOver(this); return; }
    if (cur) cur._iLeave(this);
    this.dropzone = zone ? zone.el : null;
    if (zone) zone._iEnter(this);
  }
  _autoScroll() {
    const sens = this.o.scrollSensitivity, max = this.o.scrollSpeed;
    const list = this._scrollCache || (this._scrollCache = __scrollers(this.target || this.el));
    for (const sc of list) {
      const isDoc = sc === doc.scrollingElement;
      const r = isDoc ? { left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight } : sc.getBoundingClientRect();
      if (!isDoc && (this.x < r.left - 4 || this.x > r.right + 4 || this.y < r.top - 4 || this.y > r.bottom + 4)) continue;
      const s = Math.min(sens, (r.bottom - r.top) / 3, (r.right - r.left) / 3);
      let vy = __canScroll(sc, 'y') ? __edge(this.y, r.top, r.bottom, s, max) : 0;
      let vx = __canScroll(sc, 'x') ? __edge(this.x, r.left, r.right, s, max) : 0;
      if (vy < 0 && sc.scrollTop <= 0) vy = 0;
      if (vy > 0 && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1 && !isDoc) vy = 0;
      if (vx) { const before = sc.scrollLeft; sc.scrollLeft += vx; if (sc.scrollLeft === before) vx = 0; }
      if (vy) { const before = sc.scrollTop; sc.scrollTop += vy; if (sc.scrollTop === before) vy = 0; }
      if (vx || vy) return true;
    }
    return false;
  }
  /** Animate the preview onto rect (or fade it), then remove it. */
  settle(rect, duration = 180) {
    const g = this.preview;
    this.preview = null;
    if (!g) return Promise.resolve();
    if (!rect || reducedMotion() || !duration) { g.remove(); return Promise.resolve(); }
    g.classList.remove('is-lifted');
    const from = g.style.transform;
    const to = `translate3d(${rect.left}px,${rect.top}px,0)`;
    const a = g.animate([{ transform: from, opacity: 1 }, { transform: to, opacity: 1 }], { duration, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    return a.finished.then(() => g.remove(), () => g.remove());
  }
  cancel() { if (this.active) this._finish(true); else this._abort(true); }
  _finish(cancelled) {
    if (this._done) return;
    this.cancelled = cancelled;
    const zone = this.dropzone?.__oDrop;
    try {
      if (cancelled) this.o.onCancel?.(this);
      else { if (zone) zone._iDrop(this); this.o.onDrop?.(this); }
    } catch (err) { console.error('[Orion] dnd drop', err); }
    if (zone) zone._iLeave(this, true);
    // a drop is not a click: swallow the click that follows the (possibly later) pointerup
    const stop = e => { e.preventDefault(); e.stopPropagation(); };
    win.addEventListener('click', stop, true);
    const release = () => setTimeout(() => win.removeEventListener('click', stop, true), 60);
    if (this._up) release();
    else { doc.addEventListener('pointerup', release, { once: true, capture: true }); setTimeout(() => win.removeEventListener('click', stop, true), 4000); }
    try { this.o.onEnd?.(this); } catch (err) { console.error('[Orion] dnd onEnd', err); }
    this._cleanup();
  }
  _abort(cancel) { if (this.active) { this._finish(true); return; } if (cancel) this.cancelled = true; this._cleanup(); }
  _cleanup() {
    if (this._done) return;
    this._done = true;
    clearTimeout(this._timer);
    cancelAnimationFrame(this._raf);
    this._offs.forEach(f => f()); this._offs = [];
    this.el.classList.remove('o-dnd-pressing');
    if (this.preview) { this.preview.remove(); this.preview = null; }
    for (const z of DND.zones) z.el.classList.remove(z.o.activeClass || 'is-drop-active');
    if (DND.session === this) DND.session = null;
    if (DND.pending === this) DND.pending = null;
    this.active = false;
    if (!DND.session) doc.documentElement.classList.remove('o-dnd-dragging');
  }
}

/** Start watching a pointerdown; the drag begins after the threshold / long-press. Returns the session or null. */
function dragStart(e, o = {}) {
  if (!isBrowser || DND.session || DND.pending) return null;
  if (e.pointerType === 'mouse' && e.button !== 0) return null;
  if (e.isPrimary === false) return null;
  const s = new DragSession(e, o);
  DND.pending = s;
  s._arm();
  return s;
}

O.dnd = {
  start: dragStart,
  get active() { return DND.session; },
  flip, layoutRect, touchGuard,
  sortables: DND.sortables,
  zones: DND.zones,
  Session: DragSession,
};
