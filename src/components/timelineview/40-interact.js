/* ── pointer (pan / zoom / drag / brush-to-zoom / pinch) + keyboard ───────── */
Object.assign(OTimelineView.prototype, {
  _bindChart() {
    const cv = this._canvas, ce = this._chartEl;
    this._touches = new Map();
    on(cv, 'pointerdown', e => this._onDown(e));
    on(cv, 'pointermove', e => this._onHoverMove(e));
    on(cv, 'dblclick', e => {
      const item = e.target.closest('.o-tv-item');
      if (!item) return;
      if (item.dataset.cluster) { this._zoomToCluster(item.dataset.cluster.split(',').filter(Boolean)); return; }
      const k = item.dataset.k, r = this._rec(k);
      if (!r) return;
      this.emit('item-dblclick', { id: this._idOf(k), item: tvPublicItem(r), originalEvent: e }, { cancelable: false });
    });
    on(ce, 'wheel', e => this._onWheel(e), { passive: false });
    on(this._groupsBody, 'click', '[data-toggle]', (e, t) => { e.stopPropagation(); const row = t.closest('.o-tv-glabel'); this._toggleGroup(row?.dataset.k || null); });
    // pinch (touch) — tracked alongside the single-pointer gesture started by _onDown
    on(cv, 'pointerdown', e => { if (e.pointerType === 'touch') { this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (this._touches.size === 2) this._startPinch(); } });
    on(cv, 'pointermove', e => { if (e.pointerType === 'touch' && this._touches.has(e.pointerId)) { this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (this._touches.size === 2) this._pinchMove(); } });
    on(cv, 'pointerup pointercancel', e => { if (e.pointerType === 'touch') { this._touches.delete(e.pointerId); if (this._pinch && this._touches.size < 2) { this._pinch = null; this._setWindowProps(this._start, this._end); } } });
  },
  _pt(e, rtl = isRTL(this)) { const r = this._canvas.getBoundingClientRect(); return { x: rtl ? r.right - e.clientX : e.clientX - r.left, y: e.clientY - r.top }; },

  _onDown(e) {
    if (e.button !== 0 || this._drag) return;
    const t = e.target, rtl = isRTL(this), pt = this._pt(e, rtl);
    const item = t.closest('.o-tv-item');
    if (item && item.dataset.cluster) { this._drag = { mode: 'cluster', el: item, x0: e.clientX, y0: e.clientY, pointerId: e.pointerId, started: false }; this._trackPointer(e); return; }
    if (item) {
      const k = item.dataset.k, r = this._rec(k);
      if (!r) return;
      const handle = t.dataset.h;
      let mode = (handle === 'start' || handle === 'end') && r.type === 'range' && this._canEdit(r) ? handle : 'move';
      if (e.pointerType !== 'mouse' && !this._sel.has(k)) mode = 'tapsel';
      if (mode !== 'move' && mode !== 'tapsel' && !this._canEdit(r)) mode = 'move';
      this._drag = { k, mode, x0: e.clientX, y0: e.clientY, pt0: pt, pointerId: e.pointerId, started: false, rtl };
      if (mode !== 'tapsel') e.preventDefault();
      this._trackPointer(e);
      return;
    }
    if (e.shiftKey && e.pointerType === 'mouse') this._drag = { mode: 'brush', x0: e.clientX, pt0: pt, pointerId: e.pointerId, started: false };
    else if (e.pointerType === 'mouse') this._drag = { mode: 'pan', x0: e.clientX, y0: e.clientY, s0: this._start, e0: this._end, pointerId: e.pointerId, started: false, rtl, hist: [] };
    else this._drag = { mode: 'tap', x0: e.clientX, y0: e.clientY, pointerId: e.pointerId, started: false };
    this._trackPointer(e);
  },
  _trackPointer(e) {
    const cv = this._canvas, id = e.pointerId;
    try { cv.setPointerCapture(id); } catch {}
    const move = ev => { if (ev.pointerId === id) this._onDragMove(ev); };
    const up = ev => { if (ev.pointerId === id) this._onDragEnd(ev, false); };
    const cancel = ev => { if (ev.pointerId === id) this._onDragEnd(ev, true); };
    const key = ev => { if (ev.key === 'Escape' && this._drag?.started) { ev.preventDefault(); ev.stopPropagation(); this._onDragEnd(ev, true); } };
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', cancel);
    doc.addEventListener('keydown', key, true);
    this._dragOff = () => {
      cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', cancel);
      doc.removeEventListener('keydown', key, true);
      try { cv.releasePointerCapture(id); } catch {}
      cancelAnimationFrame(this._inertia);
    };
    this._drag.cancel = () => this._onDragEnd(null, true);
  },
  _onDragMove(e) {
    const D = this._drag;
    if (!D) return;
    D.last = e;
    if (!D.started) {
      if (Math.hypot(e.clientX - D.x0, e.clientY - (D.y0 ?? e.clientY)) < 4) return;
      if (D.mode === 'tapsel' || D.mode === 'tap' || D.mode === 'cluster') { this._endDrag(); return; }
      D.started = true;
      this.classList.add('is-dragging', 'is-drag-' + D.mode);
      if (D.mode === 'pan') this._chartEl.classList.add('is-panning');
    }
    if (D.mode === 'pan') { this._panMove(e); return; }
    if (D.mode === 'brush') { this._brushMove(e); return; }
    this._applyItemDrag(e);
  },
  _applyItemDrag(e) {
    const D = this._drag, r = this._rec(D.k);
    if (!r) return;
    const pt = this._pt(e, D.rtl), dxMs = (pt.x - D.pt0.x) / this._pxPerMs;
    const mpp = 1 / this._pxPerMs, minor = tvStep(mpp), snapUnit = tvSnapUnit(minor, mpp);
    if (D.mode === 'move') {
      const snapped = tvSnap(r.start + dxMs, snapUnit);
      const delta = snapped - r.start;
      this._preview = { k: D.k, start: snapped, end: r.end == null ? null : r.end + delta };
    } else if (D.mode === 'start') {
      const ns = Math.min(tvSnap(r.start + dxMs, snapUnit), r.end - 60000);
      this._preview = { k: D.k, start: ns, end: r.end };
    } else if (D.mode === 'end') {
      const ne = Math.max(tvSnap(r.end + dxMs, snapUnit), r.start + 60000);
      this._preview = { k: D.k, start: r.start, end: ne };
    }
    this._render(false);
    this._paintDragTip(r);
  },
  _paintDragTip(r) {
    const P = this._preview; if (!P) return;
    const x = this._x(P.start);
    this._dragTip.hidden = false;
    this._dragTip.style.insetInlineStart = x + 'px';
    this._dragTip.textContent = r.type === 'point' ? fmt.datetime(P.start) : `${fmt.datetime(P.start)} – ${fmt.datetime(P.end)}`;
  },
  _panMove(e) {
    const D = this._drag, dxPx = e.clientX - D.x0, dxMs = (D.rtl ? -dxPx : dxPx) / this._pxPerMs;
    this._start = D.s0 - dxMs; this._end = D.e0 - dxMs;
    this.__winGuard = true; this.start = new Date(this._start); this.end = new Date(this._end); this.__winGuard = false;
    this._render(false);
    D.hist.push({ t: performance.now(), x: e.clientX });
    if (D.hist.length > 6) D.hist.shift();
  },
  _panRelease(D) {
    if (reducedMotion() || D.hist.length < 2 || performance.now() - D.hist[D.hist.length - 1].t > 80) { this._setWindowProps(this._start, this._end); return; }
    const a = D.hist[0], b = D.hist[D.hist.length - 1], dt = Math.max(1, b.t - a.t);
    let vx = (b.x - a.x) / dt * 16 * (D.rtl ? -1 : 1);
    const step = () => {
      vx *= 0.93;
      if (Math.abs(vx) < 0.5) { this._setWindowProps(this._start, this._end); return; }
      const dxMs = vx / this._pxPerMs;
      this._start -= dxMs; this._end -= dxMs;
      this.__winGuard = true; this.start = new Date(this._start); this.end = new Date(this._end); this.__winGuard = false;
      this._render(false);
      this._inertia = requestAnimationFrame(step);
    };
    this._inertia = requestAnimationFrame(step);
  },
  _brushMove(e) {
    const D = this._drag, pt = this._pt(e, false);
    const x0 = Math.min(D.pt0.x, pt.x), x1 = Math.max(D.pt0.x, pt.x);
    this._brush.hidden = false;
    this._brush.style.insetInlineStart = x0 + 'px';
    this._brush.style.width = Math.max(1, x1 - x0) + 'px';
    D.x1 = pt.x;
  },
  _brushEnd(D) {
    if (D.x1 == null) return;
    const a = this._timeAt(Math.min(D.pt0.x, D.x1)), b = this._timeAt(Math.max(D.pt0.x, D.x1));
    if (b - a > 1000) this.setWindow(a, b);
  },
  _startPinch() {
    const pts = [...this._touches.values()];
    this._pinch = { d0: Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)), s0: this._start, e0: this._end, cx: (pts[0].x + pts[1].x) / 2 };
    if (this._drag) this._endDrag();
  },
  _pinchMove() {
    if (!this._pinch) return;
    const pts = [...this._touches.values()];
    const d = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
    const rect = this._chartEl.getBoundingClientRect();
    const anchor = clamp((this._pinch.cx - rect.left) / Math.max(1, rect.width), 0, 1);
    const span0 = this._pinch.e0 - this._pinch.s0;
    const ns = clamp(span0 * (this._pinch.d0 / d), this.zoomMin, this.zoomMax);
    const t = this._pinch.s0 + span0 * anchor;
    this._start = t - ns * anchor; this._end = t + ns * (1 - anchor);
    this.__winGuard = true; this.start = new Date(this._start); this.end = new Date(this._end); this.__winGuard = false;
    this._layout(); this._render(false);
  },
  _onWheel(e) {
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
      const d = (e.shiftKey ? e.deltaY : e.deltaX) * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      const dxMs = d / this._pxPerMs;
      this._setWindowProps(this._start + dxMs, this._end + dxMs);
      this._layout(); this._render(false);
      return;
    }
    e.preventDefault();
    const rect = this._chartEl.getBoundingClientRect();
    const anchor = clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    const span = this._end - this._start, factor = Math.exp(dy * 0.0022);
    const ns = clamp(span * factor, this.zoomMin, this.zoomMax);
    const t = this._start + span * anchor;
    this.setWindow(t - ns * anchor, t + ns * (1 - anchor));
  },
  _zoomToCluster(keys) {
    const recs = keys.map(k => this._rec(k)).filter(Boolean);
    const ext = tvExtent(recs);
    if (!ext) return;
    const pad = Math.max((ext.max - ext.min) * 0.6, this.zoomMin / 2, TV_MS.h / 4);
    this.setWindow(ext.min - pad, ext.max + pad);
  },
  _endDrag() {
    const D = this._drag;
    if (!D) return;
    this._dragOff?.(); this._dragOff = null;
    this._drag = null; this._preview = null;
    this._brush.hidden = true; this._dragTip.hidden = true;
    this._chartEl.classList.remove('is-panning');
    this.classList.remove('is-dragging', 'is-drag-move', 'is-drag-start', 'is-drag-end', 'is-drag-pan', 'is-drag-brush', 'is-drag-tap', 'is-drag-tapsel', 'is-drag-cluster');
    if (D.started) this._render(true);
  },
  _onDragEnd(e, cancelled) {
    const D = this._drag;
    if (!D) return;
    const started = D.started;
    this._endDrag();
    if (cancelled) return;
    if (D.mode === 'cluster') { if (!started) this._zoomToCluster((D.el.dataset.cluster || '').split(',').filter(Boolean)); return; }
    if (D.mode === 'pan') { if (started) this._panRelease(D); else if (e) this._backgroundClick(); return; }
    if (D.mode === 'brush') { if (started) this._brushEnd(D); else if (e) this._backgroundClick(); return; }
    if (D.mode === 'tap' || D.mode === 'tapsel') { if (!started) this._backgroundClick(); return; }
    const k = D.k;
    if (!started) { this._itemClick(k, e); return; }
    const P = this._preview;
    if (!P) return;
    if (D.mode === 'move') this._commitItemChange(k, this._rec(k).type === 'point' ? { start: P.start } : { start: P.start, end: P.end });
    else if (D.mode === 'start') this._commitItemChange(k, { start: P.start });
    else if (D.mode === 'end') this._commitItemChange(k, { end: P.end });
  },
  _itemClick(k, e) {
    this._focusKey = k;
    const r = this._rec(k);
    if (!r) return;
    if (this._canSelect(r)) {
      const multi = e && (e.ctrlKey || e.metaKey || e.shiftKey);
      const next = multi ? (this._sel.has(k) ? [...this._sel].filter(x => x !== k) : [...this._sel, k]) : [k];
      this._setSelection(next);
    }
    this.emit('item-click', { id: this._idOf(k), item: tvPublicItem(r), originalEvent: e }, { cancelable: false });
  },
  _backgroundClick() { if (this._sel.size) this._setSelection([]); },
  /** Commit a user drag/keyboard edit: cancelable o-item-change with revert(), unlike the silent updateItem(). */
  _commitItemChange(k, changes) {
    const r = this._rec(k);
    if (!r) return null;
    const before = tvPublicItem(r);
    const raw = { id: r.id, content: r.content, start: r.start, end: r.type === 'point' ? undefined : r.end, group: r.group, type: r.type, className: r.className, color: r.color, editable: r.editable, selectable: r.selectable, title: r.title, data: r.data, ...r.extra, ...changes };
    const nr = tvNormItem(raw, k);
    if (equal(nr, r)) { this._render(true); return null; }
    const after = tvPublicItem(nr);
    const diff = {};
    for (const key2 of new Set([...Object.keys(before), ...Object.keys(after)])) if (!equal(before[key2], after[key2])) diff[key2] = after[key2];
    const prevRecs = this._recs;
    let reverted = false;
    const revert = () => { if (reverted) return; reverted = true; this._recs = prevRecs; this._layout(); this._render(true); };
    if (!this.emit('item-change', { item: after, changes: diff, previous: before, revert })) { this._render(true); return null; }
    this._recs = this._recs.map(x => (x.key === k ? nr : x));
    this._layout(); this._render(true);
    announce(this.t(nr.type === 'point' ? 'timelineView.moved' : 'timelineView.resized', { content: isStr(nr.content) ? nr.content : '', start: fmt.date(nr.start), end: nr.end != null ? fmt.date(nr.end) : '' }));
    return nr;
  },

  /* ── keyboard ── */
  _bindKeys() { on(this, 'keydown', e => this._onKey(e)); },
  _kbItemList() { return this._recs.filter(r => r.type !== 'background').sort((a, b) => a.start - b.start); },
  _onKey(e) {
    if (e.defaultPrevented || e.isComposing || e.target.closest('input,textarea,select')) return;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); this.zoom(0.35); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); this.zoom(-0.35); return; }
    if (e.key === '0') { e.preventDefault(); this.fit(); return; }
    const rtl = isRTL(this), fwd = e.key === (rtl ? 'ArrowLeft' : 'ArrowRight'), back = e.key === (rtl ? 'ArrowRight' : 'ArrowLeft');
    if (!fwd && !back && e.key !== 'Home' && e.key !== 'End' && e.key !== 'Enter' && e.key !== 'Delete') return;
    const list = this._kbItemList();
    if ((fwd || back) && e.altKey) {
      e.preventDefault();
      const r = this._focusKey != null ? this._rec(this._focusKey) : null;
      if (r && this._canEdit(r)) {
        const mpp = 1 / this._pxPerMs, minor = tvStep(mpp), snapUnit = tvSnapUnit(minor, mpp);
        const step = tvAdd(0, snapUnit[0], snapUnit[1]);
        const delta = (fwd ? 1 : -1) * step;
        this._commitItemChange(this._focusKey, r.type === 'point' ? { start: r.start + delta } : { start: r.start + delta, end: r.end + delta });
      }
      return;
    }
    if (fwd || back) {
      e.preventDefault();
      if (!list.length) { this.moveTo((this._start + this._end) / 2 + (fwd ? 1 : -1) * (this._end - this._start) * 0.15); return; }
      let i = list.findIndex(r => r.key === this._focusKey);
      i = i < 0 ? (fwd ? 0 : list.length - 1) : clamp(i + (fwd ? 1 : -1), 0, list.length - 1);
      this._focusKey = list[i].key;
      this.moveTo(list[i].start);
      announce(this._itemAnnounce(list[i]));
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      if (!list.length) return;
      e.preventDefault();
      const r = e.key === 'Home' ? list[0] : list[list.length - 1];
      this._focusKey = r.key;
      this.moveTo(r.start);
      return;
    }
    if (e.key === 'Enter') {
      if (this._focusKey == null || !this._rec(this._focusKey)) return;
      e.preventDefault();
      const already = this._sel.has(this._focusKey) && this._sel.size === 1;
      this._setSelection(already ? [] : [this._focusKey]);
      return;
    }
    if (e.key === 'Delete' && this._focusKey != null && this._rec(this._focusKey) && this._canEdit(this._rec(this._focusKey))) {
      e.preventDefault();
      const id = this._idOf(this._focusKey);
      this._focusKey = null;
      this.removeItem(id);
    }
  },
  _itemAnnounce(r) {
    const content = isStr(r.content) ? r.content : '';
    return r.type === 'point' ? this.t('timelineView.point', { content, time: fmt.date(r.start) }) : this.t('timelineView.rangeItem', { content, start: fmt.date(r.start), end: fmt.date(r.end) });
  },
});
