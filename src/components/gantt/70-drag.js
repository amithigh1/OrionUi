/* ── pointer interactions on the timeline ─────────────────────────────── */
Object.assign(OGantt.prototype, {
  _bindChart() {
    const cv = this._canvas, ce = this._chartEl;
    on(cv, 'pointerdown', e => this._onDown(e));
    on(cv, 'pointermove', e => this._onHoverMove(e));
    on(cv, 'pointerleave', () => { this._hover(null); this._scheduleTip(null); });
    on(cv, 'dblclick', e => {
      const bar = e.target.closest('.o-gantt-bar'), link = e.target.closest('.o-gantt-link');
      if (link && !this.readonly) { const L = this._links[+link.dataset.i]; if (L?.direct) this._unlink(L.p, L.t); return; }
      if (!bar) return;
      const k = bar.dataset.k;
      if (!this.emit('task-dblclick', { id: this._idOf(k), task: this._public(k), originalEvent: e })) return;
      const j = this._cols.findIndex(c => c.tree);
      if (!this.readonly) this._startEdit(k, j < 0 ? 0 : j);
    });
    on(cv, 'contextmenu', e => {
      const bar = e.target.closest('.o-gantt-bar');
      if (!bar) return;
      const k = bar.dataset.k;
      this._setSel(k);
      if (!this.emit('task-contextmenu', { id: this._idOf(k), task: this._public(k), originalEvent: e })) e.preventDefault();
    });
    on(ce, 'wheel', e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = ce.getBoundingClientRect(), rtl = isRTL(this);
      const ax = rtl ? r.right - e.clientX : e.clientX - r.left;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      this._setDayWidth(this._dw * Math.exp(-dy * 0.0022), ax);
    }, { passive: false });
    on(ce, 'focus', () => { this._tabRelease = false; });
  },
  /** Pointer x/y in canvas (logical) coordinates. */
  _pt(e, rtl = isRTL(this)) {
    const r = this._canvas.getBoundingClientRect();
    return { x: rtl ? r.right - e.clientX : e.clientX - r.left, y: e.clientY - r.top };
  },
  _rowAtY(y) { const i = Math.floor(y / this._rh); return i >= 0 && i < this._rows.length ? this._rows[i] : null; },

  _onDown(e) {
    if (e.button !== 0 || this._drag) return;
    this._hideTip();
    const t = e.target, rtl = isRTL(this);
    const linkEl = t.closest('.o-gantt-link');
    if (linkEl) {
      const L = this._links[+linkEl.dataset.i];
      if (L) { this._selLink = L.key; this._render(true); this._chartEl.focus({ preventScroll: true }); }
      return;
    }
    const bar = t.closest('.o-gantt-bar');
    const pt = this._pt(e, rtl);
    if (!bar) {
      if (e.pointerType === 'mouse') this._startPan(e, pt);
      else this._drag = { mode: 'tap', x0: e.clientX, y0: e.clientY, pt0: pt, pointerId: e.pointerId, started: false };
      if (this._drag) this._trackPointer(e);
      return;
    }
    const k = bar.dataset.k, r = this._rec(k);
    const dot = t.closest('[data-dot]'), handle = t.dataset.h;
    let mode = dot ? 'link' : handle === 'start' || handle === 'end' ? handle : handle === 'progress' ? 'progress' : 'move';
    if (this.readonly) mode = 'click';
    if (this._isSum(k) && (mode === 'start' || mode === 'end' || mode === 'progress')) mode = 'move';
    if (r.ms && (mode === 'start' || mode === 'end' || mode === 'progress')) mode = 'move';
    // touch: a bar must be selected before it can be dragged (so swipes still scroll the chart)
    if (e.pointerType !== 'mouse' && k !== this._sel && mode !== 'click') mode = 'tapsel';
    const g = this._geom(k, this._rowIndex.get(k));
    this._drag = { k, mode, x0: e.clientX, y0: e.clientY, pt0: pt, pointerId: e.pointerId, started: false, rtl, bar, g, delta: 0, fromStart: dot?.dataset.dot === 'start' };
    if (mode !== 'click' && mode !== 'tapsel') e.preventDefault();
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
      cancelAnimationFrame(this._autoRaf); this._autoRaf = 0;
    };
    this._drag.cancel = () => this._onDragEnd(null, true);
  },
  _onDragMove(e) {
    const D = this._drag;
    if (!D) return;
    D.last = e;
    if (!D.started) {
      if (Math.hypot(e.clientX - D.x0, e.clientY - D.y0) < 4) return;
      if (D.mode === 'click' || D.mode === 'tapsel' || D.mode === 'tap') { this._endDrag(); return; }
      D.started = true;
      this.classList.add('is-dragging', 'is-drag-' + D.mode);
      if (D.mode === 'pan') this._chartEl.classList.add('is-panning');
    }
    if (D.mode === 'pan') { this._panMove(e); return; }
    this._applyDrag(e);
    this._autoScroll(e);
  },
  _applyDrag(e) {
    const D = this._drag, pt = this._pt(e, D.rtl), cal = this._cal, r = this._rec(D.k);
    const dx = pt.x - D.pt0.x, step = gSnapDays(this._dw);
    if (D.mode === 'move') {
      const delta = Math.round(dx / this._dw / step) * step;
      if (delta !== D.delta || !this._preview) {
        D.delta = delta;
        this._preview = { mode: 'move', keys: new Set(this._subtree(D.k)), delta, k: D.k };
        this._paintPreview();
      }
    } else if (D.mode === 'start' || D.mode === 'end') {
      const delta = Math.round(dx / this._dw / step) * step;
      if (delta !== D.delta || !this._preview) {
        D.delta = delta;
        let { s, e: en } = r;
        if (D.mode === 'start') { let ns = r.s + delta; ns = cal.isWorking(ns) ? ns : delta > 0 ? cal.next(ns) : cal.prev(ns); s = Math.min(ns, r.e - 1); }
        else { let last = r.e - 1 + delta; last = cal.isWorking(last) ? last : delta > 0 ? cal.next(last) : cal.prev(last); en = Math.max(r.s + 1, last + 1); }
        this._preview = { mode: D.mode, k: D.k, pos: { s, e: en, progress: r.progress } };
        this._paintPreview();
      }
    } else if (D.mode === 'progress') {
      const g = D.g, p = clamp(Math.round((pt.x - g.x) / Math.max(1, g.w) * 100), 0, 100);
      if (p !== this._preview?.progress) { this._preview = { mode: 'progress', k: D.k, progress: p }; this._paintPreview(); }
    } else if (D.mode === 'link') this._linkMove(e, pt);
  },
  _paintPreview() {
    const P = this._preview, D = this._drag;
    if (P && (P.mode === 'move' || P.mode === 'start' || P.mode === 'end')) {
      const pos = this._previewPos(P.k);
      if (pos) this._ensureDays(pos.s, pos.e);
    }
    this._renderBars(this._win || this._calcWindow());
    this._renderLinks(this._win || this._calcWindow());
    if (!P || !D) { this._dragTip.hidden = true; return; }
    const pos = this._previewPos(P.k), r = this._rec(P.k);
    if (!pos) return;
    const g = this._geom(P.k, this._rowIndex.get(P.k));
    let txt;
    if (P.mode === 'progress') txt = fmt.percent(P.progress / 100);
    else if (r.ms) txt = this._fmtDate(pos.s - 1);
    else txt = this._fmtDate(pos.s) + ' – ' + this._fmtDate(pos.e - 1) + ' · ' + this.t('gantt.dayShort', { count: this._isSum(P.k) ? this._cal.count(pos.s, pos.e) : this._cal.count(pos.s, pos.e) });
    this._dragTip.textContent = txt;
    this._dragTip.hidden = false;
    this._dragTip.style.insetInlineStart = (g.ms ? g.cx : g.x) + 'px';
    this._dragTip.style.top = (g.y + g.top - 6) + 'px';
  },
  _autoScroll(e) {
    const ce = this._chartEl, r = ce.getBoundingClientRect(), edge = 36;
    const vx = e.clientX < r.left + edge ? -1 : e.clientX > r.right - edge ? 1 : 0;
    const vy = e.clientY < r.top + G_TIER_H * 2 + edge / 2 ? -1 : e.clientY > r.bottom - edge ? 1 : 0;
    this._autoV = { vx, vy };
    if ((vx || vy) && !this._autoRaf) {
      const tick = () => {
        const D = this._drag;
        if (!D || !this._autoV || (!this._autoV.vx && !this._autoV.vy)) { this._autoRaf = 0; return; }
        ce.scrollLeft += this._autoV.vx * 12;
        ce.scrollTop += this._autoV.vy * 10;
        if (D.last) D.mode === 'link' ? this._linkMove(D.last, this._pt(D.last, D.rtl)) : this._applyDrag(D.last);
        this._autoRaf = requestAnimationFrame(tick);
      };
      this._autoRaf = requestAnimationFrame(tick);
    }
  },
  _linkMove(e, pt) {
    const D = this._drag, from = D.k, A = this._anchor(from, this._rowIndex.get(from));
    const sx = D.fromStart ? A.xs : A.xe;
    const tgt = doc.elementFromPoint(e.clientX, e.clientY);
    const tb = tgt && this._canvas.contains(tgt) ? tgt.closest('.o-gantt-bar') : null;
    const tk = tb && tb.dataset.k !== from ? tb.dataset.k : null;
    const toEnd = !!(tk && tgt.closest('.o-gantt-dot.is-end'));
    if (D.target !== tk) { D.targetEl?.classList.remove('is-link-target'); D.target = tk; D.targetEl = tk ? tb : null; D.targetEl?.classList.add('is-link-target'); }
    D.toEnd = toEnd;
    let d;
    if (tk) {
      const B = this._anchor(tk, this._rowIndex.get(tk));
      d = gPathD(gRoute(sx, A.y, D.fromStart ? -1 : 1, toEnd ? B.xe : B.xs, B.y, toEnd ? -1 : 1, this._rh, 10), 5, 0);
    } else d = `M${sx},${A.y}L${pt.x},${pt.y}`;
    this._tempLink.setAttribute('d', d);
    this._tempLink.hidden = false;
  },
  _onDragEnd(e, cancelled) {
    const D = this._drag;
    if (!D) return;
    const started = D.started;
    this._endDrag();
    if (D.mode === 'pan') { if (!cancelled && started) this._panRelease(D); else if (!started && !cancelled && e) this._tapSelect(e); return; }
    if (D.mode === 'tap') { if (!cancelled && e) this._tapSelect(e); return; }
    if (cancelled) return;
    const k = D.k;
    if (!started) {
      this._setSel(k, { announce: true });
      this._act = { k, c: this._act?.k === k ? this._act.c : -1 };
      this._render(false);
      this.emit('task-click', { id: this._idOf(k), task: this._public(k), originalEvent: e }, { cancelable: false });
      return;
    }
    if (D.mode === 'move') this._moveBy(k, D.delta);
    else if (D.mode === 'start' || D.mode === 'end') this._resizeBy(k, D.mode, D.delta);
    else if (D.mode === 'progress') this._setProgress(k, D.progressVal ?? this._rec(k).progress);
    else if (D.mode === 'link' && D.target) {
      const type = (D.fromStart ? 'S' : 'F') + (D.toEnd ? 'F' : 'S');
      this._link(k, D.target, type, 0);
    }
  },
  _endDrag() {
    const D = this._drag;
    if (!D) return;
    if (D.mode === 'progress' && this._preview) D.progressVal = this._preview.progress;
    this._dragOff?.();
    this._dragOff = null;
    this._drag = null;
    this._preview = null;
    this._autoV = null;
    D.targetEl?.classList.remove('is-link-target');
    this._tempLink.hidden = true;
    this._dragTip.hidden = true;
    this._chartEl.classList.remove('is-panning');
    this.classList.remove('is-dragging', 'is-drag-move', 'is-drag-start', 'is-drag-end', 'is-drag-progress', 'is-drag-link', 'is-drag-pan');
    if (D.started && D.mode !== 'pan') this._render(true);
  },
  _tapSelect(e) {
    const k = this._rowAtY(this._pt(e).y);
    if (k != null) this._setSel(k, { announce: true });
  },

  /* ── background panning (mouse) with inertia ── */
  _startPan(e, pt) {
    cancelAnimationFrame(this._inertia);
    const ce = this._chartEl;
    this._drag = { mode: 'pan', x0: e.clientX, y0: e.clientY, sx: this._scrollX(), st: ce.scrollTop, rtl: isRTL(this), pointerId: e.pointerId, started: false, hist: [], pt0: pt };
  },
  _panMove(e) {
    const D = this._drag, dx = e.clientX - D.x0, dy = e.clientY - D.y0;
    this._setScrollX(D.sx - (D.rtl ? -dx : dx));
    this._chartEl.scrollTop = D.st - dy;
    D.hist.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    if (D.hist.length > 6) D.hist.shift();
  },
  _panRelease(D) {
    if (reducedMotion() || D.hist.length < 2) return;
    const a = D.hist[0], b = D.hist[D.hist.length - 1], dt = Math.max(1, b.t - a.t);
    if (performance.now() - b.t > 80) return;
    let vx = (b.x - a.x) / dt * 16, vy = (b.y - a.y) / dt * 16;
    const ce = this._chartEl;
    const step = () => {
      vx *= 0.93; vy *= 0.93;
      if (Math.abs(vx) < 0.4 && Math.abs(vy) < 0.4) return;
      this._setScrollX(this._scrollX() - (D.rtl ? -vx : vx));
      ce.scrollTop -= vy;
      this._inertia = requestAnimationFrame(step);
    };
    this._inertia = requestAnimationFrame(step);
  },

  /* ── hover: row band + tooltip ── */
  _onHoverMove(e) {
    if (this._drag) return;
    const pt = this._pt(e);
    this._hover(this._rowAtY(pt.y));
    if (e.pointerType !== 'mouse') return;
    const bar = e.target.closest('.o-gantt-bar');
    this._scheduleTip(bar ? bar.dataset.k : null, e);
  },
});
