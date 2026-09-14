/* ============================================================================
 * calendar: recurrence — RFC 5545 RRULE subset, written from scratch.
 *   Orion.rrule.parse('FREQ=MONTHLY;BYDAY=-1FR')          -> rule object
 *   Orion.rrule.toString(rule)                            -> 'FREQ=MONTHLY;BYDAY=-1FR'
 *   Orion.rrule.expand(rule, { dtstart, from, to, exdates, limit }) -> Date[]  (from/to inclusive)
 *   Orion.rrule.describe(rule, { dtstart, locale })       -> 'Monthly on the last Friday'
 * Supported: FREQ (YEARLY MONTHLY WEEKLY DAILY HOURLY), INTERVAL, COUNT, UNTIL, BYDAY (with ordinals),
 * BYMONTHDAY, BYMONTH, BYYEARDAY, BYSETPOS, BYHOUR, BYMINUTE, WKST, plus DTSTART / EXDATE lines.
 * Occurrences are computed in local wall-clock time (DST-safe: 09:00 stays 09:00).
 * ========================================================================== */

const RR_WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const RR_FREQ = ['YEARLY', 'MONTHLY', 'WEEKLY', 'DAILY', 'HOURLY'];
const rrIsDateOnly = v => isStr(v) && /^(\d{8}|\d{4}-\d{2}-\d{2})$/.test(v.trim());

/** '20261231' | '20261231T090000' | '20261231T090000Z' | ISO | Date -> Date */
function rrDate(v) {
  if (v instanceof Date) return new Date(+v);
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/i);
  if (!m) return date.parse(s);
  if (m[7]) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}
/** 'MO' | '2MO' | '-1FR' | 1 | { day, n } -> { day: 0..6, n } */
function rrDay(v) {
  if (v == null) return null;
  if (isObj(v)) { const d = isStr(v.day) ? RR_WD.indexOf(v.day.toUpperCase().slice(0, 2)) : +v.day; return d >= 0 && d < 7 ? { day: d, n: +(v.n || 0) } : null; }
  if (isNum(v)) return { day: ((v % 7) + 7) % 7, n: 0 };
  const m = String(v).trim().toUpperCase().match(/^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/);
  return m ? { day: RR_WD.indexOf(m[2]), n: +(m[1] || 0) } : null;
}
const rrInts = v => toArr(isStr(v) ? v.split(',') : v).map(x => parseInt(x, 10)).filter(n => !Number.isNaN(n));

function rrSet(r, key, v) {
  const k = String(key).trim().toLowerCase();
  if (v == null || v === '') return;
  switch (k) {
    case 'freq': r.freq = String(v).trim().toUpperCase(); if (!RR_FREQ.includes(r.freq)) throw new Error('RRULE: unsupported FREQ ' + v); break;
    case 'interval': r.interval = Math.max(1, parseInt(v, 10) || 1); break;
    case 'count': r.count = Math.max(1, parseInt(v, 10) || 1); break;
    case 'until': r.until = rrDate(v); r.untilDateOnly = rrIsDateOnly(isStr(v) ? v : ''); break;
    case 'untildateonly': r.untilDateOnly = !!v; break;
    case 'wkst': { const d = rrDay(v); if (d) r.wkst = d.day; break; }
    case 'byday': case 'byweekday': r.byday = toArr(isStr(v) ? v.split(',') : v).map(rrDay).filter(Boolean); break;
    case 'bymonthday': r.bymonthday = rrInts(v).filter(n => n && n >= -31 && n <= 31); break;
    case 'bymonth': r.bymonth = rrInts(v).filter(n => n >= 1 && n <= 12); break;
    case 'byyearday': r.byyearday = rrInts(v).filter(n => n && n >= -366 && n <= 366); break;
    case 'bysetpos': r.bysetpos = rrInts(v).filter(n => n); break;
    case 'byhour': r.byhour = rrInts(v).filter(n => n >= 0 && n <= 23); break;
    case 'byminute': r.byminute = rrInts(v).filter(n => n >= 0 && n <= 59); break;
    case 'dtstart': r.dtstart = rrDate(v); break;
    case 'exdate': case 'exdates': r.exdates = toArr(isStr(v) ? v.split(',') : v); break;
    default: break; // BYWEEKNO, BYSECOND, TZID… are ignored
  }
}
/** parse(string | object) -> normalised rule { freq, interval, count, until, untilDateOnly, wkst, byday:[{day,n}], bymonthday, bymonth, byyearday, bysetpos, byhour, byminute, dtstart, exdates } */
function rrParse(input) {
  if (input == null || input === '') return null;
  const r = { freq: null, interval: 1, count: null, until: null, untilDateOnly: false, wkst: 1, byday: [], bymonthday: [], bymonth: [], byyearday: [], bysetpos: [], byhour: [], byminute: [], dtstart: null, exdates: [] };
  const rule = s => s.split(';').forEach(part => { const i = part.indexOf('='); if (i > 0) rrSet(r, part.slice(0, i), part.slice(i + 1)); });
  if (isObj(input)) {
    const { untilDateOnly, ...rest } = input;
    for (const [k, v] of Object.entries(rest)) rrSet(r, k, v);
    if (untilDateOnly != null) r.untilDateOnly = !!untilDateOnly;
  } else {
    for (let line of String(input).split(/\r?\n/)) {
      line = line.trim();
      if (!line) continue;
      const m = line.match(/^(DTSTART|EXDATE|RRULE)(;[^:]*)?:(.*)$/i);
      if (!m) { rule(line); continue; }
      const name = m[1].toUpperCase();
      if (name === 'DTSTART') r.dtstart = rrDate(m[3]);
      else if (name === 'EXDATE') r.exdates.push(...m[3].split(',').map(x => x.trim()).filter(Boolean));
      else rule(m[3]);
    }
  }
  if (!r.freq) throw new Error('RRULE: FREQ is required');
  return r;
}
const rrFmtDate = (d, dateOnly) => d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + (dateOnly ? '' : 'T' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()));
/** toString(rule, { full }) — full adds DTSTART / EXDATE lines when present */
function rrToString(input, { full = false } = {}) {
  const r = rrParse(input);
  if (!r) return '';
  const p = ['FREQ=' + r.freq];
  if (r.interval > 1) p.push('INTERVAL=' + r.interval);
  if (r.count) p.push('COUNT=' + r.count);
  else if (r.until) p.push('UNTIL=' + rrFmtDate(r.until, r.untilDateOnly));
  if (r.bymonth.length) p.push('BYMONTH=' + r.bymonth.join(','));
  if (r.bymonthday.length) p.push('BYMONTHDAY=' + r.bymonthday.join(','));
  if (r.byyearday.length) p.push('BYYEARDAY=' + r.byyearday.join(','));
  if (r.byday.length) p.push('BYDAY=' + r.byday.map(b => (b.n ? b.n : '') + RR_WD[b.day]).join(','));
  if (r.byhour.length) p.push('BYHOUR=' + r.byhour.join(','));
  if (r.byminute.length) p.push('BYMINUTE=' + r.byminute.join(','));
  if (r.bysetpos.length) p.push('BYSETPOS=' + r.bysetpos.join(','));
  if (r.wkst !== 1) p.push('WKST=' + RR_WD[r.wkst]);
  let s = p.join(';');
  if (full) {
    if (r.dtstart) s = 'DTSTART:' + rrFmtDate(r.dtstart) + '\nRRULE:' + s;
    if (r.exdates.length) s += '\nEXDATE:' + r.exdates.map(x => (x instanceof Date ? rrFmtDate(x) : String(x).replace(/[-:]/g, ''))).join(',');
  }
  return s;
}

/* ── expansion ──────────────────────────────────────────────────────── */
/** nth weekdays inside [a, b): byday [{day, n}] (n=0 -> every such weekday) */
function rrNth(a, b, byday) {
  const res = new Map();
  for (const bd of byday) {
    const list = [];
    for (let d = calD.add(a, (bd.day - a.getDay() + 7) % 7); d < b; d = calD.add(d, 7)) list.push(d);
    const pick = bd.n === 0 ? list : [bd.n > 0 ? list[bd.n - 1] : list[list.length + bd.n]];
    pick.forEach(d => d && res.set(+d, d));
  }
  return [...res.values()].sort((x, y) => x - y);
}
const rrDim = (y, m) => new Date(y, m + 1, 0).getDate();
function rrMonthDays(r, y, mo, dt0) {
  const dim = rrDim(y, mo);
  if (r.bymonthday.length) {
    let out = r.bymonthday.map(n => (n > 0 ? n : dim + n + 1)).filter(d => d >= 1 && d <= dim).map(d => new Date(y, mo, d));
    if (r.byday.length) {
      const nth = new Set(rrNth(new Date(y, mo, 1), new Date(y, mo + 1, 1), r.byday.filter(b => b.n)).map(Number));
      out = out.filter(d => r.byday.some(b => (b.n ? nth.has(+d) : b.day === d.getDay())));
    }
    return out;
  }
  if (r.byday.length) return rrNth(new Date(y, mo, 1), new Date(y, mo + 1, 1), r.byday);
  return dt0.getDate() <= dim ? [new Date(y, mo, dt0.getDate())] : [];
}
function rrCandidates(r, p, dt0, hours, mins, sec) {
  const f = r.freq, y = p.getFullYear(), mo = p.getMonth();
  const inMonth = m => !r.bymonth.length || r.bymonth.includes(m + 1);
  const wdOk = d => !r.byday.length || r.byday.some(b => b.day === d.getDay());
  const mdOk = d => !r.bymonthday.length || r.bymonthday.some(n => d.getDate() === (n > 0 ? n : rrDim(d.getFullYear(), d.getMonth()) + n + 1));
  const ydOk = d => {
    if (!r.byyearday.length) return true;
    const doy = calD.days(new Date(d.getFullYear(), 0, 1), d) + 1, len = calD.days(new Date(d.getFullYear(), 0, 1), new Date(d.getFullYear() + 1, 0, 1));
    return r.byyearday.some(n => doy === (n > 0 ? n : len + n + 1));
  };
  let days = [];
  if (f === 'HOURLY') {
    if (!inMonth(mo) || !wdOk(p) || !mdOk(p) || !ydOk(p) || (r.byhour.length && !r.byhour.includes(p.getHours()))) return [];
    return mins.map(mi => new Date(y, mo, p.getDate(), p.getHours(), mi, sec));
  }
  if (f === 'DAILY') { if (inMonth(mo) && wdOk(p) && mdOk(p) && ydOk(p)) days = [p]; }
  else if (f === 'WEEKLY') {
    const wds = r.byday.length ? r.byday.map(b => b.day) : [dt0.getDay()];
    for (let i = 0; i < 7; i++) { const d = calD.add(p, i); if (wds.includes(d.getDay()) && inMonth(d.getMonth()) && mdOk(d)) days.push(d); }
  } else if (f === 'MONTHLY') { if (inMonth(mo)) days = rrMonthDays(r, y, mo, dt0); }
  else if (r.byyearday.length) {
    const len = calD.days(new Date(y, 0, 1), new Date(y + 1, 0, 1));
    days = r.byyearday.map(n => (n > 0 ? n : len + n + 1)).filter(n => n >= 1 && n <= len).map(n => calD.add(new Date(y, 0, 1), n - 1)).filter(d => inMonth(d.getMonth()) && mdOk(d) && wdOk(d));
  } else if (r.byday.length && !r.bymonthday.length) {
    if (r.bymonth.length) r.bymonth.forEach(m => days.push(...rrNth(new Date(y, m - 1, 1), new Date(y, m, 1), r.byday)));
    else days = rrNth(new Date(y, 0, 1), new Date(y + 1, 0, 1), r.byday);
  } else {
    const months = r.bymonth.length ? r.bymonth.map(m => m - 1) : r.bymonthday.length ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [dt0.getMonth()];
    const mdays = r.bymonthday.length ? r.bymonthday : [dt0.getDate()];
    for (const m of months) {
      const dim = rrDim(y, m);
      for (const n of mdays) { const dd = n > 0 ? n : dim + n + 1; if (dd >= 1 && dd <= dim) { const d = new Date(y, m, dd); if (wdOk(d)) days.push(d); } }
    }
  }
  const out = new Map();
  for (const d of days) for (const hh of hours) for (const mi of mins) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mi, sec); out.set(+x, x); }
  return [...out.values()].sort((a, b) => a - b);
}
function rrSetPos(list, pos) {
  const out = new Map();
  for (const sp of pos) { const d = sp > 0 ? list[sp - 1] : list[list.length + sp]; if (d) out.set(+d, d); }
  return [...out.values()].sort((a, b) => a - b);
}
/** EXDATE matcher: date-only entries exclude the whole day, others match to the minute */
function rrExSet(list) {
  const days = new Set(), times = new Set();
  for (const x of list) {
    if (x == null || x === '') continue;
    if (rrIsDateOnly(x)) { const d = rrDate(x); if (d) days.add(calD.key(d)); continue; }
    const d = rrDate(x);
    if (d) times.add(Math.floor(+d / 6e4));
  }
  return d => (days.size && days.has(calD.key(d))) || (times.size && times.has(Math.floor(+d / 6e4)));
}
/** expand(rule, { dtstart, from, to, exdates, limit=1000 }) -> Date[] (occurrences >= dtstart, from <= d <= to) */
function rrExpand(input, opts = {}) {
  const r = rrParse(input);
  if (!r) return [];
  const dt0 = date.parse(opts.dtstart ?? r.dtstart);
  if (!dt0) throw new Error('RRULE: dtstart is required');
  const from = opts.from != null ? date.parse(opts.from) : null, to = opts.to != null ? date.parse(opts.to) : null;
  const limit = opts.limit ?? 1000, out = [];
  const until = r.until ? (r.untilDateOnly ? new Date(r.until.getFullYear(), r.until.getMonth(), r.until.getDate(), 23, 59, 59, 999) : r.until) : null;
  if ((until && from && until < from) || (to && to < dt0)) return out;
  const isEx = rrExSet([...r.exdates, ...toArr(opts.exdates)]);
  const f = r.freq, iv = r.interval, sec = dt0.getSeconds();
  const hours = r.byhour.length ? [...r.byhour].sort((a, b) => a - b) : [dt0.getHours()];
  const mins = r.byminute.length ? [...r.byminute].sort((a, b) => a - b) : [dt0.getMinutes()];
  const base = f === 'YEARLY' ? new Date(dt0.getFullYear(), 0, 1) : f === 'MONTHLY' ? new Date(dt0.getFullYear(), dt0.getMonth(), 1)
    : f === 'WEEKLY' ? calD.weekStart(dt0, r.wkst) : f === 'DAILY' ? calD.sod(dt0) : new Date(dt0.getFullYear(), dt0.getMonth(), dt0.getDate(), dt0.getHours());
  const period = k => f === 'YEARLY' ? new Date(base.getFullYear() + k * iv, 0, 1) : f === 'MONTHLY' ? new Date(base.getFullYear(), base.getMonth() + k * iv, 1)
    : f === 'WEEKLY' ? calD.add(base, k * iv * 7) : f === 'DAILY' ? calD.add(base, k * iv) : new Date(+base + k * iv * 36e5);
  let k = 0;
  if (!r.count && from && from > dt0) { // jump close to `from` (only safe without COUNT)
    const units = f === 'YEARLY' ? from.getFullYear() - base.getFullYear() : f === 'MONTHLY' ? (from.getFullYear() - base.getFullYear()) * 12 + from.getMonth() - base.getMonth()
      : f === 'WEEKLY' ? Math.floor(calD.days(base, from) / 7) : f === 'DAILY' ? calD.days(base, from) : Math.floor((+from - +base) / 36e5);
    k = Math.max(0, Math.floor(units / iv) - 1);
  }
  let count = 0;
  for (let guard = 0; guard < 100000; guard++, k++) {
    const p = period(k);
    if ((to && p > to) || (until && p > until)) break;
    let c = rrCandidates(r, p, dt0, hours, mins, sec);
    if (r.bysetpos.length) c = rrSetPos(c, r.bysetpos);
    for (const d of c) {
      if (d < dt0) continue;
      if (until && d > until) return out;
      if (r.count && ++count > r.count) return out;
      if (isEx(d)) continue;
      if (from && d < from) continue;
      if (to && d > to) return out;
      out.push(d);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/* ── describe ───────────────────────────────────────────────────────── */
function rrDescribe(input, opts = {}) {
  let r;
  try { r = rrParse(input); } catch { return t('rrule.invalid', null, opts.locale); }
  if (!r) return t('rrule.none', null, opts.locale);
  const loc = opts.locale, tt = (k, p) => t('rrule.' + k, p, loc);
  const dt0 = date.parse(opts.dtstart ?? r.dtstart);
  const wd = (d, style = 'short') => calF(new Date(2021, 7, 1 + d), { weekday: style }, loc);
  const list = arr => fmt.list(arr, 'conjunction', loc);
  const nth = n => tt('nth.' + n, { default: Math.abs(n) + (n < 0 ? 'th-to-last' : 'th') });
  const month = m => calF(new Date(2021, m, 1), { month: 'long' }, loc);
  const iv = r.interval, unit = { HOURLY: 'hour', DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[r.freq];
  const plain = r.byday.filter(b => !b.n).map(b => b.day), ord = r.byday.filter(b => b.n);
  const isWk = plain.length === 5 && !ord.length && [1, 2, 3, 4, 5].every(d => plain.includes(d));
  const isWe = plain.length === 2 && !ord.length && plain.includes(0) && plain.includes(6);
  const daysText = () => (isWk ? tt('weekday') : isWe ? tt('weekendDay') : plain.length === 7 ? tt('day') : list(plain.map(d => wd(d))));
  let s = iv === 1 ? tt(r.freq.toLowerCase()) : tt('everyN', { count: iv, unit: tt('unit.' + unit, { count: iv }) });
  const bits = [];
  if ((r.freq === 'DAILY' || r.freq === 'WEEKLY') && isWk && iv === 1) s = tt('weekdays');
  else if (r.freq === 'DAILY' || r.freq === 'WEEKLY' || r.freq === 'HOURLY') {
    if (plain.length) bits.push(tt('onDays', { days: list(plain.map(d => wd(d))) }));
    else if (r.freq === 'WEEKLY' && dt0) bits.push(tt('onDays', { days: wd(dt0.getDay()) }));
  }
  if (r.freq === 'MONTHLY' || r.freq === 'YEARLY') {
    const pos = r.bymonthday.filter(n => n > 0), neg = r.bymonthday.filter(n => n < 0);
    const yearlySingle = r.freq === 'YEARLY' && r.bymonth.length === 1 && pos.length === 1 && !r.byday.length;
    if (yearlySingle) bits.push(tt('onDate', { date: calF(new Date(2020, r.bymonth[0] - 1, pos[0]), { month: 'long', day: 'numeric' }, loc) }));
    else {
      if (pos.length) bits.push(tt('onMonthDays', { days: list(pos.map(String)) }));
      if (neg.length) bits.push(tt('onThe', { what: list(neg.map(n => tt('ofMonth', { nth: nth(n), day: tt('day') }))) }));
      if (r.bysetpos.length && plain.length) bits.push(tt('onThe', { what: list(r.bysetpos.map(n => tt('ofMonth', { nth: nth(n), day: daysText() }))) }));
      else if (ord.length) bits.push(tt('onThe', { what: list(ord.map(b => tt('ofMonth', { nth: nth(b.n), day: wd(b.day, 'long') }))) }));
      else if (plain.length) bits.push(tt('onDays', { days: daysText() }));
      if (r.bymonth.length) bits.push(tt('inMonths', { months: list(r.bymonth.map(m => month(m - 1))) }));
      if (!r.bymonthday.length && !r.byday.length && !r.byyearday.length && dt0) {
        if (r.freq === 'MONTHLY') bits.push(tt('onMonthDays', { days: String(dt0.getDate()) }));
        else if (!r.bymonth.length) bits.push(tt('onDate', { date: calF(dt0, { month: 'long', day: 'numeric' }, loc) }));
      }
    }
  }
  if (r.count) s = [s, ...bits].join(' ') + ', ' + tt('times', { count: r.count });
  else {
    s = [s, ...bits].join(' ');
    if (r.until) {
      const sameYear = r.until.getFullYear() === new Date().getFullYear();
      s += ' ' + tt('until', { date: calF(r.until, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }, loc) });
    }
  }
  return s;
}

/* ── series helpers used by the calendar ────────────────────────────── */
/** rule ending just before `before` (keeps COUNT semantics when the rule used COUNT) */
function rrEndBefore(rule, dtstart, before) {
  const r = rrParse(rule);
  if (r.count) { r.count = rrExpand(r, { dtstart, to: new Date(+before - 1), limit: r.count }).length; if (!r.count) return null; }
  else { r.until = new Date(+before - 1000); r.untilDateOnly = false; }
  return rrToString(r);
}
/** remaining COUNT after `before` (or the rule unchanged) */
function rrRestFrom(rule, dtstart, before) {
  const r = rrParse(rule);
  if (r.count) { const used = rrExpand(r, { dtstart, to: new Date(+before - 1), limit: r.count }).length; r.count = Math.max(1, r.count - used); }
  return rrToString(r);
}
/** shift weekday / month-day parts by n days (moving a series to another day) */
function rrShiftDays(rule, n) {
  if (!n || !rule) return rule;
  const r = rrParse(rule);
  if (r.byday.length) r.byday = r.byday.map(b => ({ day: (((b.day + n) % 7) + 7) % 7, n: b.n }));
  if (r.bymonthday.length && r.freq !== 'WEEKLY') r.bymonthday = r.bymonthday.map(d => (d > 0 ? clamp(d + n, 1, 31) : clamp(d + n, -31, -1)));
  return rrToString(r);
}

O.rrule = {
  parse: rrParse,
  toString: rrToString,
  expand: rrExpand,
  describe: rrDescribe,
  /** between(rule, from, to, { dtstart, exdates, limit }) */
  between: (rule, from, to, opts = {}) => rrExpand(rule, { ...opts, from, to }),
  /** after(rule, date, { dtstart }) -> next occurrence strictly after date (or null) */
  after(rule, d, opts = {}) { const x = date.parse(d); return rrExpand(rule, { ...opts, from: new Date(+x + 1), limit: 1 })[0] || null; },
  weekdays: RR_WD,
};
