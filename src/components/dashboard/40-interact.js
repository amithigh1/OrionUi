/* <o-dashboard> interactions: pointer drag & resize (mouse, pen, touch), edge auto-scroll, keyboard. */

Object.assign(ODashboard.prototype, {
  _placePh(it) {
    if (!it) return;
    this._ph.style.gridColumn = `${it.x + 1} / span ${it.w}`;
    this._ph.style.gridRow = `${it.y + 1} / span ${it.h}`;
  },

  _onPointerDown(e) {
    if (!this.editable || this.locked || this._g || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const w = e.target.closest?.('o-widget');
    if (!w || w.parentElement !== this || w._max || this._removed.has(w.id) || e.target.closest('.o-widget-confirm')) return;
    const rz = e.target.closest('.o-widget-resize');
    const head = e.target.closest('.o-widget-header');
    if (w.locked) { if (rz || head) announce(this.t('dashboard.lockedMsg', { title: w.heading || w.id })); return; }
    if (rz) return this._gesture(e, w, 'resize', rz.dataset.dir);
    if (!head && !w.headerless) return;
    if (e.target.closest('button:not(.o-widget-handle), a[href], input, select, textarea, label, [contenteditable="true"], [contenteditable=""], [data-no-drag]')) return;
    this._gesture(e, w, 'move');
  },

  _gesture(e, w, kind, dir) {
    const it = this._item(w.id);
    if (!it || (kind === 'resize' && it.collapsed)) return;
    e.preventDefault();
    const hr = this.getBoundingClientRect(), wr = w.getBoundingClientRect();
    const g = this._g = {
      w, kind, dir: dir || '', id: w.id, it: { ...it }, start: gridClone(this._cur), last: null, m: this._metrics(), ev: e, pid: e.pointerId,
      sx: e.clientX - hr.left, sy: e.clientY - hr.top, gx0: e.clientX - wr.left, gy0: e.clientY - wr.top,
      ox: wr.left - hr.left, oy: wr.top - hr.top, ww: wr.width, wh: wr.height, active: false, gx: it.x, gy: it.y, gw: it.w, gh: it.h, autoId: 0, liveT: 0,
    };
    try { e.target.setPointerCapture?.(e.pointerId); } catch {}
    const move = ev => {
      if (ev.pointerId !== g.pid) return;
      g.ev = ev;
      if (!g.active) {
        const r = this.getBoundingClientRect();
        if (Math.hypot(ev.clientX - r.left - g.sx, ev.clientY - r.top - g.sy) < 4) return;
        if (!this._begin(g)) { this._endGesture(true); return; }
      }
      g.frame();
    };
    const up = ev => { if (ev.pointerId === g.pid) this._endGesture(ev.type === 'pointercancel'); };
    const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); this._endGesture(true); } };
    g.frame = rafThrottle(() => this._gestureMove());
    const offs = [on(win, 'pointermove', move), on(win, 'pointerup pointercancel', up), on(doc, 'keydown', key, true), on(win, 'blur', () => this._endGesture(true))];
    g.off = () => { offs.forEach(f => f()); g.frame.cancel(); cancelAnimationFrame(g.autoId); };
  },

  _begin(g) {
    if (!this.emit(g.kind === 'move' ? 'drag-start' : 'resize-start', { id: g.id, widget: g.w })) return false;
    g.active = true;
    g.w.classList.add(g.kind === 'move' ? 'is-dragging' : 'is-resizing');
    this.classList.add('is-gesture');
    this._ph.hidden = false;
    this._placePh(g.it);
    g.scroller = scrollParents(this)[0] || null;
    if (g.kind === 'move') announce(this.t('dashboard.grabbed', { title: g.w.heading || g.id }));
    return true;
  },

  _gestureMove() {
    const g = this._g;
    if (!g || !g.active) return;
    const e = g.ev, m = g.m, hr = this.getBoundingClientRect(), cols = m.cols, mode = this._mode();
    const px = e.clientX - hr.left, py = e.clientY - hr.top;
    let list = null;
    if (g.kind === 'move') {
      const L = px - g.gx0, T = py - g.gy0;
      g.w.style.transform = `translate(${Math.round(L - g.ox)}px, ${Math.round(T - g.oy)}px)`;
      const gx = clamp(Math.round((m.rtl ? m.W - L - g.ww : L) / m.px), 0, cols - g.it.w);
      const gy = Math.max(0, Math.round(T / m.py));
      if (gx !== g.gx || gy !== g.gy) { g.gx = gx; g.gy = gy; list = gridMove(gridClone(g.start), g.id, gx, gy, mode, cols); }
    } else {
      const dx = px - g.sx, dy = py - g.sy;
      const maxW = m.rtl ? g.ox + g.ww : m.W - g.ox;
      const W = g.dir.includes('e') ? clamp(g.ww + (m.rtl ? -dx : dx), m.colW, maxW) : g.ww;
      const H = g.dir.includes('s') ? Math.max(m.rowH, g.wh + dy) : g.wh;
      g.w.style.width = Math.round(W) + 'px';
      g.w.style.height = Math.round(H) + 'px';
      const nw = clamp(Math.round((W + m.gap) / m.px), 1, cols - g.it.x), nh = Math.max(1, Math.round((H + m.gap) / m.py));
      if (nw !== g.gw || nh !== g.gh) {
        g.gw = nw; g.gh = nh;
        list = gridResize(gridClone(g.start), g.id, nw, nh, mode, cols);
        const r = list.find(i => i.id === g.id); r.H = r.h;
      }
      const now = Date.now();
      if (now - g.liveT > 120) { g.liveT = now; g.w._notifyResize?.(true); }
    }
    if (list) {
      g.last = list;
      this._cur = list;
      this._apply(list, { skip: g.w });
      this._rows(1);
      this._placePh(list.find(i => i.id === g.id));
    }
    cancelAnimationFrame(g.autoId);
    g.autoId = this._edgeScroll(g) ? requestAnimationFrame(() => this._gestureMove()) : 0;
  },

  /** Scroll the page (or scroll parent) while the pointer is near its top/bottom edge. */
  _edgeScroll(g) {
    const e = g.ev, sc = g.scroller, edge = 48;
    const r = sc ? sc.getBoundingClientRect() : { top: 0, bottom: win.innerHeight };
    let v = 0;
    if (e.clientY < r.top + edge) v = -Math.ceil((r.top + edge - e.clientY) / 3);
    else if (e.clientY > r.bottom - edge) v = Math.ceil((e.clientY - r.bottom + edge) / 3);
    if (!v) return false;
    const el = sc || doc.scrollingElement || doc.documentElement;
    const before = el.scrollTop;
    (sc || win).scrollBy(0, clamp(v, -24, 24));
    return el.scrollTop !== before;
  },

  _endGesture(cancel) {
    const g = this._g;
    if (!g) return;
    this._g = null;
    g.off();
    if (!g.active) return;
    const w = g.w, first = w.getBoundingClientRect();
    w.classList.remove('is-dragging', 'is-resizing');
    this.classList.remove('is-gesture');
    w.style.transform = ''; w.style.width = ''; w.style.height = '';
    this._ph.hidden = true;
    const sig = l => l.map(i => `${i.id}:${i.x},${i.y},${i.w},${i.H}`).sort().join('|');
    const changed = !cancel && !!g.last && sig(g.last) !== sig(g.start);
    this._cur = changed ? g.last : g.start;
    this._apply(this._cur, { skip: w });
    const it = this._item(g.id);
    if (it) { w.style.gridColumn = `${it.x + 1} / span ${it.w}`; w.style.gridRow = `${it.y + 1} / span ${it.h}`; }
    this._rows();
    if (g.kind === 'move' && !reducedMotion()) {
      const last = w.getBoundingClientRect();
      animate(w, [{ transform: `translate(${first.left - last.left}px, ${first.top - last.top}px)` }, { transform: 'none' }], { duration: 180 });
    }
    this.emit(g.kind === 'move' ? 'drag-end' : 'resize-end', { id: g.id, widget: w, changed, cancelled: !!cancel });
    const title = w.heading || g.id;
    if (changed && it) {
      this._commit(g.kind === 'move' ? 'move' : 'resize', g.id);
      announce(g.kind === 'move' ? this.t('dashboard.dropped', { title, x: it.x + 1, y: it.y + 1 }) : this.t('dashboard.resized', { title, w: it.w, h: it.H }));
    } else if (cancel) announce(this.t('dashboard.cancelled'));
    if (g.kind === 'resize') requestAnimationFrame(() => w._notifyResize?.(false));
  },

  /* ── keyboard ──────────────────────────────────────────────────── */
  _onKey(e) {
    if (!this.editable || this.locked || this._g || e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
    const t = e.target;
    const w = t.localName === 'o-widget' ? t : t.classList?.contains('o-widget-handle') ? t.closest('o-widget') : null;
    if (!w || w.parentElement !== this || this._removed.has(w.id)) return;
    let k = e.key;
    if (k === 'Delete' || k === 'Backspace') {
      if (w.removable && !w.locked) { e.preventDefault(); this.removeWidget(w.id, { confirm: true }); }
      return;
    }
    if (isRTL(this) && (k === 'ArrowLeft' || k === 'ArrowRight')) k = k === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    if (!d) return;
    e.preventDefault();
    const title = w.heading || w.id;
    if (w.locked) { announce(this.t('dashboard.lockedMsg', { title })); return; }
    const it = this._item(w.id);
    if (!it) return;
    const before = `${it.x},${it.y},${it.w},${it.H}`;
    if (e.shiftKey) { if (!it.collapsed) this._keyResize(it, d[0], d[1]); } else this._keyMove(it, d[0], d[1]);
    const now = this._item(w.id);
    if (`${now.x},${now.y},${now.w},${now.H}` === before) { announce(this.t('dashboard.cantMove', { title })); return; }
    this._apply(this._cur);
    this._commit(e.shiftKey ? 'resize' : 'move', w.id);
    w.focus({ preventScroll: true });
    w.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (e.shiftKey) { announce(this.t('dashboard.resized', { title, w: now.w, h: now.H })); requestAnimationFrame(() => w._notifyResize?.(false)); }
    else announce(this.t('dashboard.moved', { title, x: now.x + 1, y: now.y + 1 }));
  },

  _keyMove(it, dx, dy) {
    const cols = this.cols, mode = this._mode();
    let list = gridClone(this._cur);
    const m = list.find(i => i.id === it.id);
    const overlapX = o => o.x < m.x + m.w && o.x + o.w > m.x;
    if (dx) {
      const nb = list.find(o => o !== m && !o.locked && o.y === m.y && o.h === m.h && (dx > 0 ? o.x === m.x + m.w : o.x + o.w === m.x));
      if (nb) {
        if (dx > 0) { nb.x = m.x; m.x += nb.w; } else { m.x = nb.x; nb.x += m.w; }
        list = gridCompact(list, mode);
      } else list = gridMove(list, m.id, m.x + dx, m.y, mode, cols);
    } else if (dy > 0) {
      const below = list.filter(o => o !== m && overlapX(o) && o.y >= m.y + m.h).sort((a, b) => a.y - b.y)[0];
      list = gridMove(list, m.id, m.x, below ? Math.max(m.y + 1, below.y + below.h - m.h) : m.y + 1, mode, cols);
    } else {
      const above = list.filter(o => o !== m && overlapX(o) && o.y + o.h <= m.y).sort((a, b) => (b.y + b.h) - (a.y + a.h))[0];
      if (!above && m.y === 0) return;
      list = gridMove(list, m.id, m.x, above ? above.y : m.y - 1, mode, cols);
    }
    this._cur = list;
  },

  _keyResize(it, dx, dy) {
    const list = gridResize(gridClone(this._cur), it.id, it.w + dx, it.H + dy, this._mode(), this.cols);
    const r = list.find(i => i.id === it.id); r.H = r.h;
    this._cur = list;
  },
});
