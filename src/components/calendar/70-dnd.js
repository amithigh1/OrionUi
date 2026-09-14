/* ============================================================================
 * calendar: pointer interactions — move, resize (end / start), range select,
 * external draggables ([data-o-calendar-draggable]), snapping, ghost preview,
 * auto-scroll, Escape to cancel, touch long-press; plus Alt+arrow keyboard moves.
 * ========================================================================== */

const CAL_NO_DRAG = '.o-calendar-toolbar, .o-calendar-nav, input, select, textarea, a, label, .o-calendar-more, .o-calendar-daynum, button.o-calendar-tg-dh, .o-calendar-tl-rh, .o-calendar-ym-title, .o-calendar-tl-head';

class CalDrag {
  constructor(cal) {
    this.cal = cal; this.s = null; this.ended = 0;
    this._move = e => this.move(e); this._up = e => this.up(e); this._key = e => this.key(e);
    this._block = e => { if (this.s?.started) e.preventDefault(); };
  }
  /** pointerdown on the calendar */
  down(e) {
    if (e.button !== 0 || e.isPrimary === false || this.s) return;
    const cal = this.cal, view = cal._view, t = e.target;
    if (!view || !view.el.contains(t) || t.closest(CAL_NO_DRAG) || view.type === 'list' || view.type === 'year') return;
    const evEl = t.closest('.o-calendar-ev:not(.is-mirror)');
    if (evEl) {
      const o = cal._occMap.get(evEl.dataset.key);
      if (!o || !cal._canEdit(o.ev)) return;
      const handle = t.closest('.o-calendar-resize');
      this.pend(e, { kind: handle ? 'resize' : 'move', edge: handle?.dataset.edge || 'end', o, el: evEl, view });
    } else if (cal.selectable && t.closest('.o-calendar-day, .o-calendar-col, .o-calendar-tg-adgrid, .o-calendar-tl-lane:not(.is-group)')) this.pend(e, { kind: 'select', view });
  }
  pend(e, info) {
    const s = { ...info, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType === 'touch', started: false };
    s.hit0 = s.view.hit(e.clientX, e.clientY);
    if (!s.hit0) return;
    this.s = s;
    this.offs = [on(doc, 'pointermove', this._move, { capture: true }), on(doc, 'pointerup pointercancel', this._up, { capture: true }), on(doc, 'keydown', this._key, { capture: true })];
    if (s.touch) {
      this.offs.push(on(doc, 'touchmove', this._block, { passive: false }));
      s.timer = setTimeout(() => { if (this.s === s) { s.armed = true; navigator.vibrate?.(8); this.start(); } }, 380);
    }
  }
  move(e) {
    const s = this.s;
    if (!s || e.pointerId !== s.id) return;
    s.x = e.clientX; s.y = e.clientY;
    if (!s.started) {
      const dist = Math.hypot(s.x - s.x0, s.y - s.y0);
      if (s.touch) { if (!s.armed && dist > 8) this.cleanup(); return; }
      if (dist < 5) return;
      this.start();
    }
    e.preventDefault();
    this.update();
  }
  start() {
    const s = this.s, cal = this.cal;
    s.started = true;
    cal.classList.add('is-dragging');
    cal._pop?.close('api'); cal._more?.close('api');
    if (s.el) {
      s.el.classList.add('is-drag-src');
      if (s.kind === 'move' && (s.hit0.day || s.view.type === 'month')) {
        const r = s.el.getBoundingClientRect();
        s.ghost = s.el.cloneNode(true);
        s.ghost.className += ' o-calendar-ghost';
        s.ghost.removeAttribute('aria-label');
        css(s.ghost, { width: Math.min(r.width, 240), height: r.height, left: 0, top: 0 });
        s.gdx = clamp(s.x0 - r.left, 0, Math.min(r.width, 240) - 8); s.gdy = s.y0 - r.top;
        portal(s.ghost, cal);
      }
      announce(cal.t('calendar.dragging', { title: s.o.ev.title }));
    }
    this.loop();
    this.update();
  }
  update() {
    const s = this.s;
    if (!s || !s.started) return;
    if (s.ghost) s.ghost.style.transform = `translate(${s.x - s.gdx}px, ${s.y - s.gdy}px)`;
    const hit = s.view.hit(s.x, s.y);
    if (!hit) { s.view.clearMirror(); s.prop = null; return; }
    const p = this.compute(hit);
    if (s.prop && +p.start === +s.prop.start && +p.end === +s.prop.end && p.allDay === s.prop.allDay && p.resourceId === s.prop.resourceId) return;
    s.prop = p;
    s.view.mirror({ ...p, ev: s.o?.ev, kind: s.kind === 'select' ? 'select' : 'move' });
  }
  compute(hit) {
    const s = this.s, cal = this.cal, h0 = s.hit0, snap = hit.snap || cal._snap;
    const rid = 'resourceId' in hit ? hit.resourceId : undefined;
    if (s.kind === 'select') {
      if (h0.day) { const a = calD.sod(h0.date), b = calD.sod(hit.date); return { start: a < b ? a : b, end: calD.add(a < b ? b : a, 1), allDay: true, resourceId: h0.resourceId }; }
      const a = h0.date, b = hit.date;
      return { start: a < b ? a : b, end: new Date(+(a < b ? b : a) + snap * CAL_MIN), allDay: false, resourceId: h0.resourceId };
    }
    const o = s.o, ev = o.ev, res = rid !== undefined ? rid : ev.resourceId ?? null;
    if (s.kind === 'move') {
      if (hit.allDay === true && !ev.allDay) { const st = calD.sod(hit.date); return { start: st, end: calD.add(st, 1), allDay: true, resourceId: res }; }
      if (hit.allDay === false && ev.allDay) return { start: hit.date, end: new Date(+hit.date + cal.defaultDuration * CAL_MIN), allDay: false, resourceId: res };
      if (hit.day || ev.allDay) { const dd = calD.days(h0.date, hit.date); return { start: calD.add(o.start, dd), end: calD.add(o.end, dd), allDay: ev.allDay, resourceId: res }; }
      const raw = new Date(+o.start + (+hit.date - +h0.date));
      const st = calD.at(raw, Math.round(calD.mins(raw) / snap) * snap);
      return { start: st, end: new Date(+st + (+o.end - +o.start)), allDay: false, resourceId: res };
    }
    // resize
    let { start, end } = o;
    if (s.edge === 'start') {
      if (hit.day || ev.allDay) { start = ev.allDay ? calD.sod(hit.date) : calD.at(hit.date, calD.mins(o.start)); if (ev.allDay && start >= end) start = calD.add(end, -1); }
      else start = hit.date;
      if (!ev.allDay && +end - +start < snap * CAL_MIN) start = new Date(+end - snap * CAL_MIN);
    } else {
      if (hit.day || ev.allDay) { end = ev.allDay ? calD.add(calD.sod(hit.date), 1) : calD.at(hit.date, calD.mins(o.end)); if (ev.allDay && end <= start) end = calD.add(calD.sod(start), 1); }
      else end = new Date(+hit.date + snap * CAL_MIN);
      if (!ev.allDay && +end - +start < snap * CAL_MIN) end = new Date(+start + snap * CAL_MIN);
    }
    return { start, end, allDay: ev.allDay, resourceId: ev.resourceId ?? null };
  }
  /** auto-scroll the view scroller (and the window) near the edges */
  loop() {
    const s = this.s;
    if (!s || !s.started) return;
    const sc = s.view.body || s.view.scroll, E = 36, sp = d => Math.min(24, Math.ceil(d / 3));
    let moved = false;
    if (sc) {
      const r = sc.getBoundingClientRect();
      if (s.y < r.top + E && s.y > r.top - 120 && sc.scrollTop > 0) { sc.scrollTop -= sp(r.top + E - s.y); moved = true; }
      else if (s.y > r.bottom - E && s.y < r.bottom + 120 && sc.scrollTop + sc.clientHeight < sc.scrollHeight) { sc.scrollTop += sp(s.y - (r.bottom - E)); moved = true; }
      if (sc.scrollWidth > sc.clientWidth) {
        if (s.x < r.left + E && s.x > r.left - 120) { sc.scrollLeft -= sp(r.left + E - s.x); moved = true; }
        else if (s.x > r.right - E && s.x < r.right + 120) { sc.scrollLeft += sp(s.x - (r.right - E)); moved = true; }
      }
    }
    if (s.y < 24) { win.scrollBy(0, -12); moved = true; } else if (s.y > win.innerHeight - 24) { win.scrollBy(0, 12); moved = true; }
    if (moved) { s.prop = null; this.update(); }
    s.raf = requestAnimationFrame(() => this.loop());
  }
  up(e) {
    const s = this.s;
    if (!s || e.pointerId !== s.id) return;
    const cal = this.cal, started = s.started, prop = s.prop;
    this.cleanup();
    if (e.type === 'pointercancel') { if (started) cal._render(); return; }
    if (!started) {
      if (s.kind !== 'select') return;
      const h0 = s.hit0, slot = h0.snap || (s.view.type.startsWith('resource') ? cal.slotMinutes : cal.slotMinutes);
      const p = h0.day ? { start: calD.sod(h0.date), end: calD.add(calD.sod(h0.date), 1), allDay: true } : { start: h0.date, end: new Date(+h0.date + slot * CAL_MIN), allDay: false };
      cal._select({ ...p, resourceId: h0.resourceId, anchor: { x: s.x, y: s.y }, source: 'click' });
      return;
    }
    this.ended = Date.now();
    if (!prop) { cal._render(); return; }
    if (s.kind === 'select') { cal._select({ ...prop, anchor: { x: s.x, y: s.y }, source: 'drag' }); return; }
    const o = s.o;
    if (+prop.start === +o.start && +prop.end === +o.end && prop.allDay === o.ev.allDay && (prop.resourceId ?? null) === (o.ev.resourceId ?? null)) { cal._render(); return; }
    cal._change(o, prop, { source: s.kind === 'move' ? 'drag' : 'resize' });
  }
  key(e) {
    if (e.key !== 'Escape' || !this.s) return;
    e.preventDefault(); e.stopPropagation();
    const started = this.s.started;
    this.cleanup();
    if (started) { this.ended = Date.now(); this.cal._render(); announce(this.cal.t('calendar.cancelled')); }
  }
  cleanup() {
    const s = this.s;
    if (!s) return;
    clearTimeout(s.timer);
    cancelAnimationFrame(s.raf);
    this.offs?.forEach(f => f()); this.offs = null;
    s.ghost?.remove();
    s.el?.classList.remove('is-drag-src');
    s.view.clearMirror();
    this.cal.classList.remove('is-dragging');
    this.s = null;
  }
}

/* ── external draggables ────────────────────────────────────────────── */
/** <div data-o-calendar-draggable='{"title":"Interview","duration":45,"color":"success"}'>Interview</div> */
function calExternalDown(e, el) {
  if (e.button !== 0 || e.isPrimary === false) return;
  const raw = el.getAttribute('data-o-calendar-draggable') || '';
  const data = /^\s*\{/.test(raw) ? parseJSON(raw, {}) || {} : { title: raw || el.textContent.trim() };
  if (!data.title) data.title = el.textContent.trim();
  const st = { x0: e.clientX, y0: e.clientY, id: e.pointerId, touch: e.pointerType === 'touch', started: false, cal: null, prop: null };
  let ghost = null;
  const drop = () => { if (st.cal) st.cal._view?.clearMirror(); };
  const pos = (x, y) => {
    if (ghost) ghost.style.transform = `translate(${x + 8}px, ${y + 6}px)`;
    const target = doc.elementFromPoint(x, y)?.closest('o-calendar');
    if (target !== st.cal) { drop(); st.cal = target && target.editable && target.droppable !== false ? target : null; st.prop = null; }
    const cal = st.cal, view = cal?._view;
    if (!view) return;
    const hit = view.hit(x, y);
    if (!hit) { view.clearMirror(); st.prop = null; return; }
    const dur = +data.duration || cal.defaultDuration, allDay = data.allDay != null ? !!data.allDay : !!hit.day;
    const start = allDay ? calD.sod(hit.date) : hit.date;
    const end = allDay ? calD.add(start, Math.max(1, Math.round((+data.days || 1)))) : new Date(+start + dur * CAL_MIN);
    st.prop = { start, end, allDay, resourceId: 'resourceId' in hit ? hit.resourceId : data.resourceId ?? null };
    view.mirror({ ...st.prop, ev: { ...data, allDay }, kind: 'move' });
  };
  const begin = () => {
    st.started = true;
    ghost = el.cloneNode(true);
    ghost.removeAttribute('data-o-calendar-draggable');
    ghost.classList.add('o-calendar-ghost', 'is-external');
    css(ghost, { left: 0, top: 0, width: Math.min(el.getBoundingClientRect().width, 240) });
    portal(ghost, el);
    doc.documentElement.classList.add('o-calendar-ext-dragging');
  };
  const offs = [];
  const end = ev => {
    if (ev && ev.pointerId !== st.id) return;
    clearTimeout(st.timer);
    offs.forEach(f => f());
    ghost?.remove();
    doc.documentElement.classList.remove('o-calendar-ext-dragging');
    drop();
    if (ev && ev.type === 'pointerup' && st.started && st.cal && st.prop) st.cal._receive(data, st.prop, el);
  };
  offs.push(on(doc, 'pointermove', ev => {
    if (ev.pointerId !== st.id) return;
    if (!st.started) {
      const dist = Math.hypot(ev.clientX - st.x0, ev.clientY - st.y0);
      if (st.touch) { if (!st.armed && dist > 8) end(); return; }
      if (dist < 5) return;
      begin();
    }
    ev.preventDefault();
    pos(ev.clientX, ev.clientY);
  }, { capture: true }), on(doc, 'pointerup pointercancel', end, { capture: true }), on(doc, 'keydown', ev => { if (ev.key === 'Escape' && st.started) { ev.preventDefault(); st.prop = null; end(); } }, { capture: true }));
  if (st.touch) {
    offs.push(on(doc, 'touchmove', ev => { if (st.started) ev.preventDefault(); }, { passive: false }));
    st.timer = setTimeout(() => { st.armed = true; begin(); pos(st.x0, st.y0); }, 380);
  }
}
behavior('data-o-calendar-draggable', el => {
  el.classList.add('o-calendar-draggable');
  const off = on(el, 'pointerdown', e => calExternalDown(e, el));
  return () => { off(); el.classList.remove('o-calendar-draggable'); };
});

/* ── keyboard: Alt+Arrows move, Alt+Shift+Arrows resize ─────────────── */
function calKeyMove(cal, e, evEl) {
  if (!e.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return false;
  const o = cal._occMap.get(evEl.dataset.key), view = cal._view;
  if (!o || !cal._canEdit(o.ev) || !view || view.type === 'list' || view.type === 'year') return false;
  e.preventDefault();
  let k = e.key;
  if (isRTL(cal) && (k === 'ArrowLeft' || k === 'ArrowRight')) k = k === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
  const ev = o.ev, tg = view.type === 'week' || view.type === 'day', tl = view instanceof CalTimeline;
  const snap = tl ? view.g?.snap || cal._snap : cal._snap, horiz = k === 'ArrowLeft' || k === 'ArrowRight', sign = k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1;
  let { start, end } = o, resourceId = ev.resourceId ?? null;
  const byDays = n => ({ s: calD.add(start, n), e: calD.add(end, n) }), byMin = n => ({ s: new Date(+start + n * CAL_MIN), e: new Date(+end + n * CAL_MIN) });
  if (!e.shiftKey) {
    let r;
    if (tl && !horiz) {
      const lanes = view.lanes.map(l => (l.__row.res._none ? null : l.__row.res.id)), i = lanes.indexOf(resourceId);
      resourceId = lanes[clamp(i + sign, 0, lanes.length - 1)] ?? resourceId;
      r = { s: start, e: end };
    } else if (tl) r = view.kind === 'month' || ev.allDay ? byDays(sign) : byMin(sign * snap);
    else if (tg && !horiz && !ev.allDay) r = byMin(sign * snap);
    else r = byDays(horiz ? sign : sign * 7);
    start = r.s; end = r.e;
  } else if (ev.allDay || (!tg && !tl) || (tl && view.kind === 'month')) {
    end = calD.add(end, horiz ? sign : sign * 7);
    if (end <= start) end = ev.allDay ? calD.add(calD.sod(start), 1) : new Date(+start + snap * CAL_MIN);
  } else {
    end = tg && horiz ? calD.add(end, sign) : new Date(+end + sign * snap * CAL_MIN);
    if (+end - +start < snap * CAL_MIN) end = new Date(+start + snap * CAL_MIN);
  }
  cal._change(o, { start, end, allDay: ev.allDay, resourceId }, { source: 'keyboard' }).then(key => {
    if (key && cal._view) { cal._view.focusEvent(key); const n = cal._occMap.get(key); if (n) announce(cal.t('calendar.moved', { title: n.ev.title, when: calLabel(cal, n) })); }
  });
  return true;
}
