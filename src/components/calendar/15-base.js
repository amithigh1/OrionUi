/* ============================================================================
 * calendar: shared view pieces — base class, event element, day-row segment
 * placement (month weeks / all-day rows), grid keyboard, floating panels, icons.
 * ========================================================================== */

const CAL_SVG = {
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  'align-left': '<path d="M21 6H3M15 12H3M17 18H3"/>',
  'calendar-days': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
};
/** icon from the registry, or the private fallback set */
function calIcon(name, opts = {}) {
  if (O.icons?.has?.(name) || !CAL_SVG[name]) return icon(name, opts);
  const size = opts.size ? ` width="${opts.size}" height="${opts.size}"` : '';
  return raw(`<svg class="o-icon o-icon-${name}${opts.class ? ' ' + esc(opts.class) : ''}" viewBox="0 0 24 24"${size} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${CAL_SVG[name]}</svg>`);
}

/** Base class for views. `cal` is the <o-calendar>. */
class CalView {
  constructor(cal, type) {
    this.cal = cal; this.type = type;
    this.el = h('div', { class: 'o-calendar-v o-calendar-v-' + type });
    this._offs = [];
  }
  range(d) { const s = calD.sod(d); return { start: s, end: calD.add(s, 1) }; }
  title() { return ''; }
  render() {}
  /** pointer -> { date, allDay, resourceId, day } | null */
  hit() { return null; }
  /** drag / selection preview: { start, end, allDay, resourceId, kind } */
  mirror() {}
  clearMirror() {}
  focusDate() {}
  focusEvent(key) { const el = key && this.el.querySelector(`.o-calendar-ev[data-key="${CSS.escape(key)}"]:not(.is-mirror)`); if (el) el.focus({ preventScroll: false }); return !!el; }
  scrollToTime() {}
  destroy() { this._offs.forEach(f => f()); this._offs = []; }
}

/** Accessible label: "Standup, Tuesday 15 September 2026, 9:00 – 9:15 AM, Room A, repeats" */
function calLabel(cal, o) {
  const ev = o.ev, loc = cal._loc;
  let when;
  if (ev.allDay) {
    const last = calD.add(o.end, -1);
    when = calD.same(o.start, last) ? calF(o.start, { dateStyle: 'full' }, loc) + ', ' + cal.t('calendar.allDay') : calFmtRange(o.start, last, { dateStyle: 'full' }, loc);
  } else when = calFmtRange(o.start, o.end, { dateStyle: 'full', timeStyle: 'short', hour12: cal._h12 }, loc);
  return [ev.title || cal.t('calendar.untitled'), when, ev.location, o.occ && cal.t('calendar.recurring')].filter(Boolean).join(', ');
}
/** time text for an occurrence ("09:00 – 10:30") */
function calTimeText(cal, o, compact) {
  if (o.ev.allDay) return cal.t('calendar.allDay');
  const a = calTime(o.start, cal._h12, cal._loc, compact), b = calTime(o.end, cal._h12, cal._loc, compact);
  return a + ' – ' + b;
}

/**
 * Event element. opts: cls, timeText, dot, location, resize ('x' | 'y' | false), startHandle, endHandle
 */
function calEvEl(cal, o, opts = {}) {
  const ev = o.ev;
  const el = h('button', {
    type: 'button', class: ['o-calendar-ev', opts.cls, ev.allDay && 'is-allday', o.occ && 'is-recurring', cal._canEdit(ev) && 'is-editable', cal._selKey === o.key && 'is-selected', ev.className],
    'data-key': o.key, 'aria-label': calLabel(cal, o), 'aria-describedby': cal._kbdId,
  });
  calPaint(el, ev, cal.eventColor);
  let custom = null;
  if (isFn(cal.eventContent)) { try { custom = cal.eventContent(calPub(ev, o), { view: cal._type, timeText: opts.timeText || '', el }); } catch (e) { console.error('[Orion] calendar eventContent failed:', e); } }
  if (custom != null && custom !== false) append(el, custom instanceof Node || custom instanceof SafeHTML ? custom : h('span', { class: 'o-calendar-ev-title' }, String(custom)));
  else {
    if (opts.dot) el.append(h('span', { class: 'o-calendar-ev-dot', 'aria-hidden': 'true' }));
    const main = h('span', { class: 'o-calendar-ev-main' });
    if (opts.timeText) main.append(h('span', { class: 'o-calendar-ev-time' }, opts.timeText));
    main.append(h('span', { class: 'o-calendar-ev-title' }, ev.title || cal.t('calendar.untitled')));
    if (opts.location && ev.location) main.append(h('span', { class: 'o-calendar-ev-loc' }, ev.location));
    el.append(main);
    if (o.occ && opts.icons !== false) el.append(h('span', { class: 'o-calendar-ev-icon', 'aria-hidden': 'true' }, calIcon('repeat')));
  }
  if (opts.resize && cal._canEdit(ev)) {
    if (opts.startHandle) el.append(h('span', { class: 'o-calendar-resize is-start', 'data-edge': 'start', 'aria-hidden': 'true' }));
    if (opts.endHandle) el.append(h('span', { class: 'o-calendar-resize is-end', 'data-edge': 'end', 'aria-hidden': 'true' }));
  }
  if (isFn(cal.eventDidMount)) { try { cal.eventDidMount({ el, event: calPub(ev, o), view: cal._type }); } catch (e) { console.error(e); } }
  return el;
}

/**
 * Split occurrences into segments for a row of `n` days starting at `start` (month week, all-day row).
 * Returns { segs:[{ o, s, e, lane, bar, cs, ce, vis }], hidden:[per day], per:[per day] }.
 * `limit` = rows available per day (a "+N more" link takes the last one when a day overflows).
 */
function calRowSegments(occs, start, n, { limit = Infinity, barsOnly = false } = {}) {
  const end = calD.add(start, n), segs = [];
  for (const o of occs) {
    if (o.end <= start || o.start >= end) continue;
    const bar = o.ev.allDay || !calD.same(o.start, new Date(+o.end - 1));
    if (barsOnly && !bar) continue;
    const s = o.start < start ? start : o.start, last = new Date(Math.min(+o.end, +end) - 1);
    segs.push({ o, s: calD.days(start, s), e: clamp(calD.days(start, last), 0, n - 1), bar, cs: o.start < start, ce: o.end > end });
  }
  segs.sort((a, b) => a.s - b.s || (b.bar - a.bar) || (b.e - b.s) - (a.e - a.s) || +a.o.start - +b.o.start);
  calLanes(segs);
  const per = Array(n).fill(0), hidden = Array(n).fill(0);
  segs.forEach(g => { for (let c = g.s; c <= g.e; c++) per[c]++; });
  const cap = c => (per[c] > limit ? limit - 1 : limit);
  for (const g of segs) {
    g.vis = true;
    for (let c = g.s; c <= g.e; c++) if (g.lane >= cap(c)) { g.vis = false; break; }
    if (!g.vis) for (let c = g.s; c <= g.e; c++) hidden[c]++;
  }
  return { segs, hidden, per };
}
/** Append visible segments + "+N more" buttons into a CSS-grid row (row 1 is reserved when headRow) */
function calPlaceSegments(cal, box, res, start, { rowOffset = 2, moreRow = null } = {}) {
  const { segs, hidden } = res;
  let lanes = 0;
  for (const g of segs) {
    if (!g.vis) continue;
    lanes = Math.max(lanes, g.lane + 1);
    const o = g.o, singleTimed = !g.bar;
    const el = calEvEl(cal, o, singleTimed
      ? { cls: 'is-dot', dot: true, timeText: calTime(o.start, cal._h12, cal._loc, true) }
      : { cls: ['is-bar', g.cs && 'is-cont-start', g.ce && 'is-cont-end'], timeText: !o.ev.allDay && !g.cs ? calTime(o.start, cal._h12, cal._loc, true) : '', resize: 'x', endHandle: !g.ce });
    el.style.gridColumn = `${g.s + 1} / span ${g.e - g.s + 1}`;
    el.style.gridRow = String(g.lane + rowOffset);
    box.append(el);
  }
  hidden.forEach((n, c) => {
    if (!n) return;
    const d = calD.add(start, c);
    const b = h('button', { type: 'button', class: 'o-calendar-more', 'data-date': calD.key(d), 'aria-label': cal.t('calendar.moreTitle', { count: n }) }, cal.t('calendar.more', { count: n }));
    b.style.gridColumn = String(c + 1);
    b.style.gridRow = String(moreRow ?? (lanes + rowOffset));
    box.append(b);
  });
  return lanes;
}

/** Arrow / Home / End / PageUp / PageDown on a day grid -> new day or null */
function calGridKey(e, d, ws, rtl) {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  let k = e.key;
  if (rtl && (k === 'ArrowLeft' || k === 'ArrowRight')) k = k === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
  switch (k) {
    case 'ArrowLeft': return calD.add(d, -1);
    case 'ArrowRight': return calD.add(d, 1);
    case 'ArrowUp': return calD.add(d, -7);
    case 'ArrowDown': return calD.add(d, 7);
    case 'Home': return calD.weekStart(d, ws);
    case 'End': return calD.add(calD.weekStart(d, ws), 6);
    case 'PageUp': return date.add(d, e.shiftKey ? -12 : -1, 'M');
    case 'PageDown': return date.add(d, e.shiftKey ? 12 : 1, 'M');
    default: return null;
  }
}

/**
 * Floating panel anchored to an element or a point (details popover, "+N more").
 * build(panel) returns the content. Returns the overlay handle.
 */
function calFloat(cal, anchor, build, { cls, label, placement = 'end-start', onClose, focus = true } = {}) {
  const panel = h('div', { class: ['o-floating o-calendar-pop', cls], role: 'dialog', 'aria-label': label || '', tabindex: '-1' });
  portal(panel, cal);
  append(panel, build(panel));
  const unplace = autoPlace(panel, anchor, { placement, offset: 8, flip: true, fallback: ['bottom', 'top'], padding: 8 });
  const ov = overlays.open({
    el: panel, owner: anchor instanceof Element ? anchor : cal, returnFocus: true,
    onClose: reason => { unplace(); panel.remove(); onClose?.(reason); },
  });
  panel.__ov = ov;
  animate(panel, 'zoomIn', { duration: 120 });
  if (focus) (panel.querySelector('[data-autofocus]') || focusables(panel)[0] || panel).focus({ preventScroll: true });
  return ov;
}
/** "+N more" popover listing a day's events */
function calMorePopover(cal, anchor, day) {
  const dayEnd = calD.add(day, 1);
  const list = (cal._occs || []).filter(o => o.start < dayEnd && o.end > day);
  const label = calF(day, { weekday: 'long', day: 'numeric', month: 'long' }, cal._loc);
  cal._more?.close('api');
  cal._more = calFloat(cal, anchor, panel => [
    void panel.addEventListener('click', e => { const el = e.target.closest('.o-calendar-ev'); if (el) cal._evClickEl(e, el); }),
    h('div', { class: 'o-calendar-pop-head' }, h('span', { class: 'o-calendar-pop-date' }, label),
      h('button', { type: 'button', class: 'o-btn-close o-btn-close-sm', 'aria-label': cal.t('calendar.close'), onClick: () => cal._more?.close('api') })),
    h('div', { class: 'o-calendar-more-list' }, list.map(o => calEvEl(cal, o, { cls: o.ev.allDay || !calD.same(o.start, new Date(+o.end - 1)) ? 'is-bar' : 'is-dot', dot: !o.ev.allDay, timeText: o.ev.allDay ? '' : calTime(o.start, cal._h12, cal._loc, true) }))),
  ], { cls: 'o-calendar-more-pop', label, placement: 'bottom-start', onClose: () => { cal._more = null; } });
}
