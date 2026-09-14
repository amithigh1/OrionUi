/* ── day numbers: integer days since 1970-01-01 in the LOCAL calendar (DST-safe) ── */
const G_DAY_MS = 864e5;
const G_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})/;

/** Anything date-like -> integer day number (null when invalid). */
function gDay(v) {
  if (v == null || v === '') return null;
  if (isNum(v) && Math.abs(v) < 1e6) return Math.floor(v);             // already a day number
  if (isStr(v)) { const m = v.match(G_ISO); if (m) return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / G_DAY_MS); }
  const d = date.parse(v);
  return d ? Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / G_DAY_MS) : null;
}
/** Day number with the time of day as a fraction (for the "now" line). */
function gDayF(v) {
  const d = date.parse(v); if (!d) return null;
  return gDay(d) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
}
/** Day number -> local Date at 00:00. */
function gDate(n) { const u = new Date(Math.floor(n) * G_DAY_MS); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()); }
/** Day number -> 'YYYY-MM-DD'. */
function gISO(n) { return n == null ? null : new Date(Math.floor(n) * G_DAY_MS).toISOString().slice(0, 10); }
/** 0 = Sunday … 6 = Saturday (1970-01-01 was a Thursday). */
const gWeekday = n => (((Math.floor(n) % 7) + 7) + 4) % 7;
const gToday = () => gDay(new Date());

/**
 * Working-day calendar. Durations and lags are counted in working days.
 *   new GanttCalendar({ workingDays: [1,2,3,4,5], holidays: ['2026-12-25', { date: '2026-12-26', name: 'Boxing Day' }] })
 */
class GanttCalendar {
  constructor({ workingDays, holidays } = {}) {
    const wd = toArr(workingDays == null ? [1, 2, 3, 4, 5] : workingDays).map(Number).filter(n => n >= 0 && n <= 6);
    this.wd = [0, 1, 2, 3, 4, 5, 6].map(d => wd.includes(d));
    if (!this.wd.some(Boolean)) this.wd.fill(true);
    this.perWeek = this.wd.filter(Boolean).length;
    this.hol = new Map();
    for (const hd of toArr(holidays)) {
      const n = gDay(isObj(hd) ? hd.date : hd);
      if (n != null) this.hol.set(n, isObj(hd) ? String(hd.name || '') : '');
    }
    this.all = this.perWeek === 7 && !this.hol.size;
  }
  isWorking(n) { return this.wd[gWeekday(n)] && !this.hol.has(n); }
  isWeekend(n) { return !this.wd[gWeekday(n)]; }
  holiday(n) { return this.hol.has(n) ? this.hol.get(n) : null; }
  /** First working day >= n. */
  next(n) { if (this.all) return n; for (let g = 0; g < 3700 && !this.isWorking(n); g++) n++; return n; }
  /** Last working day <= n. */
  prev(n) { if (this.all) return n; for (let g = 0; g < 3700 && !this.isWorking(n); g++) n--; return n; }
  /** Move k working days from day d (k may be negative). add(d, 0) === d. */
  add(d, k) {
    if (!k) return d;
    if (this.all) return d + k;
    const step = k > 0 ? 1 : -1;
    let n = d, left = Math.abs(k);
    const weeks = Math.floor(left / this.perWeek) - 1;            // jump whole weeks first (holidays re-checked below)
    if (weeks > 0 && !this.hol.size) { n += step * weeks * 7; left -= weeks * this.perWeek; }
    for (let g = 0; left > 0 && g < 40000; g++) { n += step; if (this.isWorking(n)) left--; }
    return n;
  }
  /** Working days in [a, b). Negative when b < a. */
  count(a, b) {
    if (b < a) return -this.count(b, a);
    if (this.all) return b - a;
    let c = 0, n = a;
    const weeks = Math.floor((b - a) / 7);
    if (weeks > 1) {
      c = weeks * this.perWeek;
      const end = a + weeks * 7;
      for (const hd of this.hol.keys()) if (hd >= a && hd < end && this.wd[gWeekday(hd)]) c--;
      n = end;
    }
    for (; n < b; n++) if (this.isWorking(n)) c++;
    return c;
  }
  /** Exclusive end day of a task that starts on s and lasts `dur` working days. */
  endFor(s, dur) {
    if (dur <= 0) return s;
    const first = this.next(s);
    return this.add(first, dur - 1) + 1;
  }
  /** Start day of a task that ends (exclusive) on e and lasts `dur` working days. */
  startFor(e, dur) {
    if (dur <= 0) return e;
    const last = this.prev(e - 1);
    return this.add(last, -(dur - 1));
  }
}
