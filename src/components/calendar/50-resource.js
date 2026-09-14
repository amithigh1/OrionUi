/* ============================================================================
 * calendar: resource timeline (resource-day | resource-week | resource-month)
 * Rows = resources (grouped, collapsible), columns = time. Sticky resource
 * column + time header, horizontally virtualised bars and ticks, lane stacking,
 * conflict (overlap) and over-capacity highlighting, 5 zoom levels.
 * ========================================================================== */

const CAL_TL = {
  day: { px: [48, 64, 88, 120, 176], tick: [60, 60, 30, 30, 15], label: [120, 60, 60, 60, 30] },
  week: { px: [6, 9, 12, 18, 28], tick: [360, 180, 180, 120, 60], label: [720, 360, 180, 180, 120] },
  month: { dayW: [28, 36, 48, 64, 96] },
};

class CalTimeline extends CalView {
  constructor(cal, type) {
    super(cal, type);
    this.kind = type.split('-')[1] || 'day';
    this._onScroll = rafThrottle(() => this._maybePaint());
    this.el.addEventListener('click', e => {
      const g = e.target.closest('.o-calendar-tl-gtoggle');
      if (g) { const k = g.dataset.group, s = this.cal._collapsed; s.has(k) ? s.delete(k) : s.add(k); this._keepFocus = k; this.cal._render(); }
    });
    this.el.addEventListener('wheel', e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      this.cal.zoomBy(e.deltaY < 0 ? 1 : -1, e.clientX);
    }, { passive: false });
  }
  range(d) {
    const s = calD.sod(d);
    if (this.kind === 'week') { const ws = calD.weekStart(s, this.cal._ws); return { start: ws, end: calD.add(ws, 7) }; }
    if (this.kind === 'month') { const m = calD.monthStart(s); return { start: m, end: new Date(m.getFullYear(), m.getMonth() + 1, 1) }; }
    return { start: s, end: calD.add(s, 1) };
  }
  title(r) {
    const loc = this.cal._loc;
    if (this.kind === 'day') return calF(r.start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, loc);
    if (this.kind === 'month') return calF(r.start, { month: 'long', year: 'numeric' }, loc);
    return calFmtRange(r.start, calD.add(r.end, -1), { day: 'numeric', month: 'short', year: 'numeric' }, loc);
  }
  _geom(r) {
    const cal = this.cal, z = clamp(Math.round(cal.zoom ?? 2), 0, 4), g = { z, n: calD.days(r.start, r.end) };
    if (this.kind === 'month') Object.assign(g, { lo: 0, hi: 1440, dayW: CAL_TL.month.dayW[z], tick: 1440, label: 1440, snap: 1440 });
    else {
      const c = CAL_TL[this.kind], pxm = c.px[z] / 60;
      Object.assign(g, { lo: cal._lo, hi: cal._hi, pxm, tick: c.tick[z], label: c.label[z], snap: this.kind === 'day' ? cal._snap : Math.max(cal._snap, z >= 3 ? 30 : 60) });
      g.dayW = (g.hi - g.lo) * pxm;
    }
    g.pxm = g.dayW / (g.hi - g.lo);
    g.W = g.n * g.dayW;
    return g;
  }
  /** date -> px from the start of the range (logical, RTL-agnostic) */
  x(d) { const g = this.g; return calD.days(this.r.start, d) * g.dayW + (clamp(calD.mins(d), g.lo, g.hi) - g.lo) * g.pxm; }
  _xs(o) {
    if (this.kind === 'month' || o.ev.allDay) {
      const s = calD.sod(o.start), last = calD.sod(new Date(+o.end - 1));
      return [calD.days(this.r.start, s) * this.g.dayW, (calD.days(this.r.start, last) + 1) * this.g.dayW];
    }
    return [this.x(o.start), this.x(o.end)];
  }
  _rows(occs) {
    const cal = this.cal, res = toArr(cal.resources).filter(isObj).map(r => ({ ...r, id: String(r.id) }));
    const ids = new Set(res.map(r => r.id));
    if (occs.some(o => o.ev.resourceId == null || !ids.has(o.ev.resourceId))) res.push({ id: '__none', title: cal.t('calendar.unassigned', { default: 'Unassigned' }), _none: true });
    const byRes = new Map(res.map(r => [r.id, []]));
    for (const o of occs) byRes.get(o.ev.resourceId != null && ids.has(o.ev.resourceId) ? o.ev.resourceId : '__none')?.push(o);
    const rows = [], groups = new Map();
    for (const r of res) { const gk = r.group ?? ''; if (!groups.has(gk)) groups.set(gk, []); groups.get(gk).push(r); }
    for (const [gk, list] of groups) {
      if (gk !== '') rows.push({ group: gk, count: list.length, collapsed: cal._collapsed.has(gk) });
      if (gk !== '' && cal._collapsed.has(gk)) continue;
      for (const r of list) {
        const items = byRes.get(r.id).map(o => { const [xs, xe] = this._xs(o); return { o, xs, xe: Math.max(xe, xs + 6) }; });
        items.sort((a, b) => a.xs - b.xs || (b.xe - b.xs) - (a.xe - a.xs));
        const lanes = calLanes(items, (a, b) => a.xs < b.xe - 0.5 && b.xs < a.xe - 0.5);
        if (cal.conflicts !== false) for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
          const a = items[i].o, b = items[j].o;
          if (a.start < b.end && b.start < a.end) { items[i].conflict = items[j].conflict = true; }
        }
        const cap = +r.capacity;
        if (cap) items.forEach(it => { const n = Array.isArray(it.o.ev.attendees) ? it.o.ev.attendees.length : +it.o.ev.attendees || +it.o.ev.guests || 0; if (n > cap) { it.over = n; } });
        rows.push({ res: r, items, lanes: Math.max(1, lanes) });
      }
    }
    return rows;
  }
  render(occs, r) {
    const cal = this.cal, loc = cal._loc, prev = this.scroll ? { left: Math.abs(this.scroll.scrollLeft), top: this.scroll.scrollTop, same: this.r && +this.r.start === +r.start && this.g?.z === clamp(Math.round(cal.zoom ?? 2), 0, 4) } : null;
    this.r = r;
    this.g = this._geom(r);
    this.rows = this._rows(occs);
    const g = this.g;
    const root = h('div', { class: ['o-calendar-tl', 'is-' + this.kind] });
    root.style.setProperty('--tl-w', g.W + 'px');
    root.style.setProperty('--tl-day', g.dayW + 'px');
    root.style.setProperty('--tl-tick', (this.kind === 'month' ? g.dayW : g.tick * g.pxm) + 'px');
    this.scroll = h('div', { class: 'o-calendar-tl-scroll o-scroll' });
    this.scroll.addEventListener('scroll', this._onScroll, { passive: true });
    this.t1 = h('div', { class: 'o-calendar-tl-t1' });
    this.t2 = h('div', { class: 'o-calendar-tl-t2' });
    const head = h('div', { class: 'o-calendar-tl-head', 'aria-hidden': 'true' }, h('div', { class: 'o-calendar-tl-corner' }, cal.t('calendar.resources')), h('div', { class: 'o-calendar-tl-scale' }, this.t1, this.t2));
    this.bg = h('div', { class: 'o-calendar-tl-bg', 'aria-hidden': 'true' });
    const body = h('div', { class: 'o-calendar-tl-body', role: 'rowgroup' }, this.bg);
    this.lanes = [];
    for (const row of this.rows) {
      if (row.group != null && !row.res) {
        const lbl = cal.t(row.collapsed ? 'calendar.expand' : 'calendar.collapse', { group: row.group });
        body.append(h('div', { class: 'o-calendar-tl-row is-group', role: 'row' },
          h('div', { class: 'o-calendar-tl-rh', role: 'rowheader' }, h('button', { type: 'button', class: 'o-calendar-tl-gtoggle', 'data-group': row.group, 'aria-expanded': String(!row.collapsed), 'aria-label': lbl, title: lbl }, icon(row.collapsed ? 'chevron-right' : 'chevron-down'), h('span', { class: 'o-calendar-tl-gname' }, row.group), h('span', { class: 'o-badge o-badge-sm' }, String(row.count)))),
          h('div', { class: 'o-calendar-tl-lane is-group' })));
        continue;
      }
      const res = row.res, lane = h('div', { class: 'o-calendar-tl-lane', role: 'gridcell', 'data-res': res.id });
      lane.style.setProperty('--lanes', String(row.lanes));
      lane.__row = row;
      this.lanes.push(lane);
      body.append(h('div', { class: ['o-calendar-tl-row', res._none && 'is-none'], role: 'row', 'data-res': res.id }, this._rh(res, row), lane));
    }
    const grid = h('div', { class: 'o-calendar-tl-grid', role: 'grid', 'aria-label': this.title(r), 'aria-describedby': cal._kbdId }, head, body);
    this.scroll.append(grid);
    root.append(this.scroll);
    this.el.replaceChildren(root);
    this.root = root;
    this._win = null;
    // scroll position
    const rtl = isRTL(cal), set = v => { this.scroll.scrollLeft = rtl ? -v : v; };
    if (prev && prev.same) { set(prev.left); this.scroll.scrollTop = prev.top; }
    else if (this._anchor) { const a = this._anchor; this._anchor = null; set(Math.max(0, this.x(a.date) - a.offset)); this.scroll.scrollTop = prev?.top || 0; }
    else if (this.kind === 'day') set(Math.max(0, this.x(calD.at(r.start, calTimeMin(cal.scrollTime, 480))) - 16));
    else { const now = new Date(); set(now >= r.start && now < r.end ? Math.max(0, calD.days(r.start, now) * g.dayW - 24) : 0); }
    this._paint();
    if (this._keepFocus) { this.el.querySelector(`.o-calendar-tl-gtoggle[data-group="${CSS.escape(this._keepFocus)}"]`)?.focus(); this._keepFocus = null; }
  }
  _rh(res, row) {
    const cal = this.cal;
    let av = null;
    if (res.avatar && /[/.:]/.test(res.avatar)) av = h('span', { class: 'o-avatar o-avatar-sm' }, h('img', { src: res.avatar, alt: '' }));
    else if (res.avatar !== false && !res._none) {
      if (customElements.get('o-avatar')) { av = h('o-avatar', { name: res.avatar || res.title, size: 'sm' }); if (res.color && CAL_TOKENS.test(res.color)) av.setAttribute('color', res.color); }
      else av = h('span', { class: 'o-avatar o-avatar-sm' }, String(res.avatar || res.title || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());
    }
    const dot = h('span', { class: 'o-calendar-tl-rdot', 'aria-hidden': 'true' });
    const c = calColor(res.color); if (c) dot.style.background = c;
    const sub = res.capacity ? cal.t('calendar.seats', { count: +res.capacity }) : res.subtitle || '';
    return h('div', { class: 'o-calendar-tl-rh', role: 'rowheader', title: res.title },
      c ? dot : null, av,
      h('span', { class: 'o-calendar-tl-rinfo' }, h('span', { class: 'o-calendar-tl-rtitle' }, res.title ?? res.id), sub ? h('span', { class: 'o-calendar-tl-rsub' }, sub) : null),
      row.items.some(i => i.conflict) ? h('span', { class: 'o-calendar-tl-rwarn', title: cal.t('calendar.conflict') }, icon('alert-triangle', { label: cal.t('calendar.conflict') })) : null);
  }
  _window() {
    const sc = this.scroll, vx = Math.abs(sc.scrollLeft), vw = Math.max(200, sc.clientWidth);
    return [vx - vw, vx + vw * 2];
  }
  _maybePaint() {
    if (!this.scroll?.isConnected) return;
    const vx = Math.abs(this.scroll.scrollLeft), vw = this.scroll.clientWidth;
    if (!this._win || vx < this._win[0] + vw * 0.25 || vx + vw > this._win[1] - vw * 0.25) this._paint();
  }
  /** paint ticks, background and bars inside the virtual window */
  _paint() {
    const cal = this.cal, g = this.g, r = this.r, loc = cal._loc, [a, b] = this._window();
    this._win = [a, b];
    const inWin = (x0, x1) => x1 >= a && x0 <= b;
    const t1 = [], t2 = [], bg = [];
    for (let i = 0; i < g.n; i++) {
      const d = calD.add(r.start, i), x0 = i * g.dayW;
      if (!inWin(x0, x0 + g.dayW)) continue;
      const today = calD.same(d, new Date()), we = d.getDay() === 0 || d.getDay() === 6;
      if (this.kind === 'month') {
        t2.push(h('span', { class: ['o-calendar-tl-tick is-day', today && 'is-today', we && 'is-weekend'], style: `inset-inline-start:${x0}px;width:${g.dayW}px` }, h('small', null, calF(d, { weekday: 'narrow' }, loc)), String(d.getDate())));
        if (d.getDay() === cal._ws || i === 0) t1.push(h('span', { class: 'o-calendar-tl-tick is-week', style: `inset-inline-start:${x0}px` }, cal.t('calendar.weekShort', { n: date.weekNumber(calD.add(d, 3)) })));
      } else {
        t1.push(h('span', { class: ['o-calendar-tl-tick is-day', today && 'is-today'], style: `inset-inline-start:${x0}px;width:${g.dayW}px` }, this.kind === 'day' ? calF(d, { weekday: 'long', day: 'numeric', month: 'long' }, loc) : calF(d, { weekday: 'short', day: 'numeric' }, loc)));
        for (let m = Math.ceil(g.lo / g.label) * g.label; m < g.hi; m += g.label) {
          const x = x0 + (m - g.lo) * g.pxm;
          if (inWin(x, x + 60)) t2.push(h('span', { class: 'o-calendar-tl-tick', style: `inset-inline-start:${x}px` }, calTime(calD.at(d, m), cal._h12, loc, true)));
        }
      }
      if (today && this.kind !== 'day') bg.push(h('div', { class: 'o-calendar-tl-today', style: `inset-inline-start:${x0}px;width:${g.dayW}px` }));
      if (this.kind === 'month') { if (cal._biz && !calBizRanges(cal._biz, d).length) bg.push(h('div', { class: 'o-calendar-tl-off', style: `inset-inline-start:${x0}px;width:${g.dayW}px` })); }
      else for (const [s, e] of calOffRanges(cal._biz, d, g.lo, g.hi)) bg.push(h('div', { class: 'o-calendar-tl-off', style: `inset-inline-start:${x0 + (s - g.lo) * g.pxm}px;width:${(e - s) * g.pxm}px` }));
    }
    const now = new Date();
    if (cal.nowIndicator && this.kind !== 'month' && now >= r.start && now < r.end) { const m = calD.mins(now); if (m >= g.lo && m <= g.hi) bg.push(h('div', { class: 'o-calendar-tl-now', style: `inset-inline-start:${this.x(now)}px`, title: cal.t('calendar.now') })); }
    this.t1.replaceChildren(...t1);
    this.t2.replaceChildren(...t2);
    this.bg.replaceChildren(...bg);
    const focused = doc.activeElement?.closest?.('.o-calendar-ev')?.dataset.key;
    for (const lane of this.lanes) {
      const row = lane.__row;
      lane.querySelectorAll('.o-calendar-ev:not(.is-mirror)').forEach(x => x.remove());
      for (const it of row.items) {
        if (!inWin(it.xs, it.xe) && it.o.key !== focused) continue;
        const o = it.o, cs = o.start < r.start, ce = o.end > r.end;
        const el = calEvEl(cal, o, { cls: ['is-tl', it.conflict && 'is-conflict', it.over && 'is-over', cs && 'is-cont-start', ce && 'is-cont-end', it.xe - it.xs < 40 && 'is-narrow'], timeText: this.kind !== 'month' && !o.ev.allDay ? calTimeText(cal, o, true) : '', resize: 'x', startHandle: !cs && !o.ev.allDay, endHandle: !ce });
        const extra = [row.res.title, it.conflict && cal.t('calendar.conflict'), it.over && cal.t('calendar.overCapacity', { count: it.over, capacity: row.res.capacity })].filter(Boolean).join(', ');
        el.setAttribute('aria-label', el.getAttribute('aria-label') + ', ' + extra);
        if (it.conflict || it.over) { el.title = [it.conflict && cal.t('calendar.conflict'), it.over && cal.t('calendar.overCapacity', { count: it.over, capacity: row.res.capacity })].filter(Boolean).join(' · '); el.prepend(h('span', { class: 'o-calendar-ev-warn', 'aria-hidden': 'true' }, icon('alert-triangle'))); }
        el.style.insetInlineStart = it.xs + 'px';
        el.style.width = Math.max(6, it.xe - it.xs - 2) + 'px';
        el.style.setProperty('--lane', String(it.lane));
        lane.append(el);
      }
    }
    if (focused) this.focusEvent(focused);
  }
  tick() { if (this.cal.nowIndicator) this._paint(); }
  scrollToTime(min) { if (!this.scroll) return; const v = Math.max(0, this.x(calD.at(this.r.start, min)) - 16); this.scroll.scrollLeft = isRTL(this.cal) ? -v : v; }
  /** zoom keeping the time under clientX (or the viewport centre) in place */
  anchorZoom(clientX) {
    if (!this.scroll || !this.lanes.length) return;
    const lr = this.lanes[0].getBoundingClientRect(), sr = this.scroll.getBoundingClientRect(), rtl = isRTL(this.cal), g = this.g;
    const cx = clientX ?? (sr.left + sr.right) / 2;
    const px = clamp(rtl ? lr.right - cx : cx - lr.left, 0, g.W - 1), di = Math.floor(px / g.dayW);
    const d = calD.at(calD.add(this.r.start, di), g.lo + (px - di * g.dayW) / g.pxm);
    this._anchor = { date: d, offset: px - Math.abs(this.scroll.scrollLeft) };
  }
  hit(x, y) {
    if (!this.lanes?.length) return null;
    const sr = this.scroll.getBoundingClientRect();
    if (x < sr.left - 60 || x > sr.right + 60 || y < sr.top - 60 || y > sr.bottom + 60) return null;
    let lane = this.lanes.find(l => { const r = l.getBoundingClientRect(); return y >= r.top && y < r.bottom; });
    if (!lane) lane = y < this.lanes[0].getBoundingClientRect().top ? this.lanes[0] : this.lanes[this.lanes.length - 1];
    const g = this.g, r = lane.getBoundingClientRect(), rtl = isRTL(this.cal);
    const px = clamp(rtl ? r.right - x : x - r.left, 0, g.W - 1), di = Math.floor(px / g.dayW), day = calD.add(this.r.start, di);
    const res = lane.__row.res, rid = res._none ? null : res.id;
    if (this.kind === 'month') return { date: day, day: true, resourceId: rid, lane };
    let m = g.lo + (px - di * g.dayW) / g.pxm;
    m = clamp(g.lo + Math.floor((m - g.lo) / g.snap) * g.snap, g.lo, g.hi - g.snap);
    return { date: calD.at(day, m), day: false, resourceId: rid, lane, snap: g.snap };
  }
  mirror(p) {
    this.clearMirror();
    if (!p) return;
    const lane = this.lanes.find(l => (l.__row.res._none ? null : l.__row.res.id) === (p.resourceId ?? null)) || this.lanes[0];
    if (!lane) return;
    const [xs, xe] = this._xs({ start: p.start, end: p.end, ev: { allDay: p.allDay } });
    const el = p.kind === 'select' ? h('div', { class: 'o-calendar-selbox is-tl' }) : h('div', { class: 'o-calendar-ev is-tl is-mirror' }, h('span', { class: 'o-calendar-ev-main' }, h('span', { class: 'o-calendar-ev-title' }, p.ev?.title || '')));
    if (p.ev) calPaint(el, p.ev, this.cal.eventColor);
    if (p.kind !== 'select' && !p.allDay && this.kind !== 'month') el.querySelector('.o-calendar-ev-main').prepend(h('span', { class: 'o-calendar-ev-time' }, calTime(p.start, this.cal._h12, this.cal._loc, true) + ' – ' + calTime(p.end, this.cal._h12, this.cal._loc, true)));
    el.style.insetInlineStart = xs + 'px';
    el.style.width = Math.max(6, xe - xs - 2) + 'px';
    lane.append(el);
  }
  clearMirror() { this.el.querySelectorAll('.o-calendar-selbox, .o-calendar-ev.is-mirror').forEach(x => x.remove()); }
  destroy() { super.destroy(); this._onScroll.cancel(); }
}
