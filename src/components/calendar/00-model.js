/* ============================================================================
 * Orion calendar — model: strings, date helpers, event normalisation, colors,
 * business hours, lane / column layout and the event store (with recurrence).
 * Every file in this folder shares one function scope (ARCHITECTURE.md §2).
 * ========================================================================== */

i18n.add('en', {
  calendar: {
    calendar: 'Calendar', today: 'Today', prev: 'Previous', next: 'Next', views: 'Views',
    view: { month: 'Month', week: 'Week', day: 'Day', list: 'List', year: 'Year', 'resource-day': 'Timeline', 'resource-week': 'Week', 'resource-month': 'Month' },
    allDay: 'All day', more: '+{count} more', moreTitle: 'Show {count} more events', noEvents: 'No events in this period',
    week: 'Week {n}', weekShort: 'W{n}', newEvent: 'New event', editEvent: 'Edit event', untitled: '(No title)',
    title: 'Title', titlePh: 'Add a title', start: 'Starts', end: 'Ends', repeat: 'Repeat', color: 'Color',
    location: 'Location', description: 'Description', resource: 'Resource', attendees: 'Guests', openLink: 'Open link',
    save: 'Save', delete: 'Delete', edit: 'Edit', close: 'Close', cancel: 'Cancel',
    endBeforeStart: 'The end must be after the start', titleRequired: 'Enter a title',
    events: { one: '{count} event', other: '{count} events' },
    scopeEditTitle: 'Edit recurring event', scopeDeleteTitle: 'Delete recurring event',
    scopeThis: 'This event', scopeFollowing: 'This and following events', scopeAll: 'All events', ok: 'OK',
    deleteTitle: 'Delete event?', deleteText: '“{title}” will be removed from the calendar.',
    moved: '{title} moved to {when}', created: 'Created {title}', deleted: 'Deleted {title}', updated: 'Updated {title}',
    loading: 'Loading events…', loadError: 'Couldn’t load events.', retry: 'Retry',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', print: 'Print', add: 'New event',
    resources: 'Resources', unassigned: 'Unassigned', conflict: 'Overlaps another booking', overCapacity: '{count} guests, {capacity} seats',
    seats: { one: '{count} seat', other: '{count} seats' },
    now: 'Current time', recurring: 'Repeats', slotLabel: '{when}', dragging: 'Moving {title}. Release to drop, Escape to cancel.',
    keyboard: 'Arrow keys move between days or time slots, Enter creates an event. On an event: Enter opens it, Alt+Arrow keys move it, Alt+Shift+Arrow keys resize it, Delete removes it.',
    goToDay: 'Go to {date}', expand: 'Expand {group}', collapse: 'Collapse {group}', cancelled: 'Change cancelled',
  },
  rrule: {
    none: 'Does not repeat', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Annually', hourly: 'Hourly', custom: 'Custom',
    weekdays: 'Every weekday', everyN: 'Every {count} {unit}',
    unit: {
      hour: { one: 'hour', other: 'hours' }, day: { one: 'day', other: 'days' }, week: { one: 'week', other: 'weeks' },
      month: { one: 'month', other: 'months' }, year: { one: 'year', other: 'years' },
    },
    onDays: 'on {days}', onMonthDays: 'on day {days}', onThe: 'on the {what}', inMonths: 'in {months}', onDate: 'on {date}',
    until: 'until {date}', times: { one: 'once', other: '{count} times' }, ofMonth: '{nth} {day}',
    nth: { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', '-1': 'last', '-2': 'second-to-last', '-3': 'third-to-last' },
    weekday: 'weekday', weekendDay: 'weekend day', day: 'day',
    every: 'Every', repeatOn: 'Repeat on', ends: 'Ends', never: 'Never', on: 'On', after: 'After', occurrences: 'occurrences',
    monthlyDay: 'On day {day}', monthlyNth: 'On the {nth} {weekday}', nextDates: 'Upcoming', invalid: 'Invalid rule',
  },
});

const CAL_MIN = 6e4;
const CAL_VIEWS = ['month', 'week', 'day', 'list', 'year', 'resource-day', 'resource-week', 'resource-month'];

/** Local-time, DST-safe day helpers (all return new Dates). */
const calD = {
  sod(d) { const x = new Date(+d); x.setHours(0, 0, 0, 0); return x; },
  add(d, n) { const x = new Date(+d); x.setDate(x.getDate() + n); return x; },
  key(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); },
  /** whole calendar days from a to b */
  days(a, b) { return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5); },
  /** wall-clock minutes since midnight */
  mins(d) { return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; },
  /** day at wall-clock minute (1440 = next midnight) */
  at(day, min) { const x = calD.sod(day); x.setHours(0, Math.round(min), 0, 0); return x; },
  same(a, b) { return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); },
  weekStart(d, ws) { const x = calD.sod(d); return calD.add(x, -((x.getDay() - ws + 7) % 7)); },
  monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); },
  /** shift keeping the wall-clock time for all-day / multi-day math */
  shiftDays(d, n) { return calD.add(d, n); },
};
const calIsDateOnly = v => isStr(v) && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
/** 'HH:mm' | 9 | '9' -> minutes */
function calTimeMin(v, dflt = 0) {
  if (v == null || v === '') return dflt;
  if (isNum(v)) return v * 60;
  const m = String(v).trim().match(/^(\d{1,2})(?::(\d{2}))?/);
  return m ? +m[1] * 60 + +(m[2] || 0) : dflt;
}
/** Key used for EXDATE / recurrenceId: 'YYYY-MM-DD' (all-day) or 'YYYY-MM-DDTHH:mm' */
const calOccKey = (d, allDay) => allDay ? calD.key(d) : calD.key(d) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());

/* ── events ─────────────────────────────────────────────────────────── */
/** Normalise a raw event. End is EXCLUSIVE (all-day { start: '2026-09-14', end: '2026-09-16' } = 14th and 15th). */
function calNorm(raw, opt = {}) {
  if (!raw || typeof raw !== 'object') return null;
  let s = date.parse(raw.start);
  if (!s) return null;
  const allDay = raw.allDay != null ? !!raw.allDay && raw.allDay !== 'false' : calIsDateOnly(raw.start) && (raw.end == null || calIsDateOnly(raw.end));
  let e = date.parse(raw.end);
  if (allDay) { s = calD.sod(s); e = e ? calD.sod(e) : null; if (!e || e <= s) e = calD.add(s, 1); }
  else if (!e || e <= s) e = new Date(+s + (opt.duration || 60) * CAL_MIN);
  const ev = { ...raw, id: raw.id != null && raw.id !== '' ? String(raw.id) : uid('ev'), title: raw.title == null ? '' : String(raw.title), start: s, end: e, allDay };
  ev.exdates = toArr(raw.exdates).filter(x => x != null && x !== '');
  if (!ev.rrule) ev.rrule = null;
  if (ev.resourceId != null) ev.resourceId = String(ev.resourceId);
  delete ev._src;
  return ev;
}
/** Plain copy handed to user code (instances carry recurrenceId). */
function calPub(ev, o) {
  const p = { ...ev, start: new Date(+(o ? o.start : ev.start)), end: new Date(+(o ? o.end : ev.end)), exdates: [...(ev.exdates || [])] };
  delete p._src;
  if (o && o.occ) { p.recurrenceId = calOccKey(o.occ, ev.allDay); p.seriesStart = new Date(+ev.start); }
  return p;
}
const calCmp = (a, b) => (+a.start - +b.start) || (b.ev.allDay - a.ev.allDay) || ((+b.end - +b.start) - (+a.end - +a.start)) || String(a.ev.title).localeCompare(String(b.ev.title));

const CAL_TOKENS = /^(primary|secondary|success|danger|warning|info|light|dark)$/;
/** color: token name | chart-N | --css-var | hex / rgb() / hsl() / named -> CSS value (or null) */
function calColor(c) {
  if (c == null || c === '') return null;
  c = String(c).trim();
  if (CAL_TOKENS.test(c) || /^chart-[1-8]$/.test(c)) return `var(--o-${c})`;
  if (/^--[\w-]+$/.test(c)) return `var(${c})`;
  if (/^(#[0-9a-f]{3,8}|(rgb|hsl|oklch|oklab|lab|lch)a?\([\d\s.,%/+-]+\)|[a-z]{3,20})$/i.test(c)) return c;
  return null;
}
function calPaint(el, ev, fallback) {
  const c = calColor(ev.color) || calColor(fallback) || 'var(--o-primary)';
  el.style.setProperty('--ev', c);
  const tc = calColor(ev.textColor);
  if (tc) el.style.setProperty('--ev-fg', tc); else el.style.removeProperty('--ev-fg');
}

/* ── business hours ─────────────────────────────────────────────────── */
/** true | { days, start, end } | [...] -> [{ days:Set, start, end }] (minutes) */
function calBusiness(v) {
  if (v == null || v === false || v === 'false') return null;
  if (v === true || v === '' || v === 'true') v = {};
  const list = Array.isArray(v) ? v : [v];
  return list.filter(isObj).map(b => ({
    days: new Set(toArr(b.days ?? b.daysOfWeek ?? [1, 2, 3, 4, 5]).map(Number)),
    start: calTimeMin(b.start ?? b.startTime, 540), end: calTimeMin(b.end ?? b.endTime, 1020),
  }));
}
/** business intervals [[s,e]] (minutes) for a day, merged */
function calBizRanges(biz, day) {
  if (!biz) return null;
  const r = biz.filter(b => b.days.has(day.getDay())).map(b => [b.start, b.end]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const x of r) { const l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push([...x]); }
  return out;
}
/** complement of business hours inside [lo, hi] */
function calOffRanges(biz, day, lo, hi) {
  const on = calBizRanges(biz, day);
  if (!on) return [];
  const out = []; let cur = lo;
  for (const [s, e] of on) { if (s > cur) out.push([cur, Math.min(s, hi)]); cur = Math.max(cur, e); }
  if (cur < hi) out.push([cur, hi]);
  return out.filter(([s, e]) => e > s);
}

/* ── layout ─────────────────────────────────────────────────────────── */
/** Row segments (month / all-day / timeline): segs [{ s, e }] inclusive columns -> sets seg.lane, returns lane count */
function calLanes(segs, overlap = (a, b) => a.s <= b.e && a.e >= b.s) {
  const lanes = [];
  for (const seg of segs) {
    let l = 0;
    while (lanes[l] && lanes[l].some(o => overlap(o, seg))) l++;
    (lanes[l] || (lanes[l] = [])).push(seg);
    seg.lane = l;
  }
  return lanes.length;
}
/** Time-grid packing: items [{ top, bot }] -> sets col, cols, span (side-by-side clusters, expand right when free) */
function calColumns(items) {
  items.sort((a, b) => a.top - b.top || b.bot - a.bot);
  let cluster = [], cols = [], end = -Infinity;
  const flush = () => {
    const n = cols.length;
    for (const it of cluster) {
      it.cols = n; it.span = 1;
      for (let c = it.col + 1; c < n; c++) { if (cols[c].some(o => o.top < it.bot && o.bot > it.top)) break; it.span++; }
    }
    cluster = []; cols = [];
  };
  for (const it of items) {
    if (it.top >= end) { flush(); end = -Infinity; }
    let c = cols.findIndex(col => col[col.length - 1].bot <= it.top);
    if (c < 0) { c = cols.length; cols.push([]); }
    cols[c].push(it); it.col = c; cluster.push(it);
    end = Math.max(end, it.bot);
  }
  flush();
  return items;
}

/* ── formatting ─────────────────────────────────────────────────────── */
const __calFR = new Map();
function calFmtRange(a, b, opts, loc) {
  const l = loc || i18n.locale, k = l + JSON.stringify(opts);
  let f = __calFR.get(k);
  if (!f) { try { f = new Intl.DateTimeFormat(l, opts); } catch { f = new Intl.DateTimeFormat('en', opts); } __calFR.set(k, f); }
  try { return f.formatRange(a, b); } catch { return f.format(a) + ' – ' + f.format(b); }
}
const calF = (d, opts, loc) => fmt.date(d, opts, loc);
function calTime(d, h12, loc, compact) {
  if (!h12) return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  const o = { hour: 'numeric', hour12: true };
  if (!compact || d.getMinutes()) o.minute = '2-digit';
  const s = calF(d, o, loc);
  return compact && /^en\b/i.test(loc || i18n.locale) ? s.replace(/\s*([AP])\.?M\.?$/i, (m, p) => p.toLowerCase() + 'm') : s;
}

/* ── store ──────────────────────────────────────────────────────────── */
class CalStore {
  constructor() { this.map = new Map(); }
  /** replace events of one origin (src=false: `events` prop / API, src=true: remote source) */
  reset(list, opt, src = false) {
    for (const [id, ev] of this.map) if (!!ev._src === src) this.map.delete(id);
    toArr(list).forEach(r => this.upsert(r, opt, src));
  }
  upsert(raw, opt, src = false) {
    const ev = calNorm(raw, opt);
    if (!ev) return null;
    if (src) ev._src = true;
    const old = this.map.get(ev.id);
    if (old && old._src && !src) ev._src = true;
    this.map.set(ev.id, ev);
    return ev;
  }
  get(id) { return this.map.get(String(id)) || null; }
  remove(id) { const ev = this.get(id); if (ev) this.map.delete(ev.id); return ev; }
  all() { return [...this.map.values()]; }
  /** occurrences overlapping [start, end): [{ key, ev, start, end, occ }] */
  occurrences(start, end, filter) {
    const out = [];
    for (const ev of this.map.values()) {
      if (filter && !filter(ev)) continue;
      if (ev.rrule && O.rrule) {
        const dur = +ev.end - +ev.start, days = ev.allDay ? calD.days(ev.start, ev.end) : 0;
        let list = [];
        try { list = O.rrule.expand(ev.rrule, { dtstart: ev.start, from: new Date(+start - dur), to: new Date(+end - 1), exdates: ev.exdates, limit: 3000 }); }
        catch (e) { console.warn('[Orion] calendar: bad rrule on event', ev.id, e.message); }
        for (const s of list) {
          const e = ev.allDay ? calD.add(s, days) : new Date(+s + dur);
          if (e > start && s < end) out.push({ key: ev.id + '@' + calOccKey(s, ev.allDay), ev, start: s, end: e, occ: s });
        }
      } else if (ev.end > start && ev.start < end) out.push({ key: ev.id, ev, start: ev.start, end: ev.end, occ: null });
    }
    return out.sort(calCmp);
  }
}
