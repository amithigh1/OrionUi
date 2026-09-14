/* ============================================================================
 * core: date utilities (local time, immutable — every function returns a new Date)
 * Used by date/time pickers, calendar, scheduler, gantt, tables, formatting.
 * ========================================================================== */

const DAY_MS = 864e5;
const __dtf = (opts, loc) => __intl(Intl.DateTimeFormat, opts, loc);
const __unit = u => ({ ms: 'ms', millisecond: 'ms', milliseconds: 'ms', s: 's', second: 's', seconds: 's', m: 'm', minute: 'm', minutes: 'm', h: 'h', hour: 'h', hours: 'h', d: 'd', day: 'd', days: 'd', date: 'd', w: 'w', week: 'w', weeks: 'w', M: 'M', month: 'M', months: 'M', Q: 'Q', quarter: 'Q', y: 'y', year: 'y', years: 'y' }[u] || u);
const pad2 = n => String(n).padStart(2, '0');

const date = {
  /** parse(value, [format]) -> Date | null. 'YYYY-MM-DD' is parsed as LOCAL date (not UTC). */
  parse(v, format) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return Number.isNaN(+v) ? null : new Date(+v);
    if (isNum(v)) return new Date(v);
    const s = String(v).trim();
    if (format) return date.parseFormat(s, format);
    let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3})\d*)?)?)?$/);
    if (m) return new Date(+m[1], +m[2] - 1, +(m[3] || 1), +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), +((m[7] || '0').padEnd(3, '0')));
    m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i);
    if (m) { const t = new Date(); let hh = +m[1]; if (m[4]) { const pm = /p/i.test(m[4]); if (hh === 12) hh = pm ? 12 : 0; else if (pm) hh += 12; } t.setHours(hh, +m[2], +(m[3] || 0), 0); return t; }
    const d = new Date(s);
    return Number.isNaN(+d) ? null : d;
  },
  /** parseFormat('25/12/2024 14:30', 'DD/MM/YYYY HH:mm') -> Date | null */
  parseFormat(s, format, loc) {
    const tokens = [];
    const re = format.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|HH|H|hh|h|mm|m|ss|s|SSS|A|a|dddd|ddd|[.*+?^${}()|\\/]/g, (tok, lit) => {
      if (lit !== undefined) return lit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (/^[.*+?^${}()|\\/]$/.test(tok)) return '\\' + tok;
      tokens.push(tok);
      if (tok === 'YYYY') return '(\\d{4})';
      if (tok === 'SSS') return '(\\d{1,3})';
      if (tok === 'MMMM' || tok === 'MMM' || tok === 'dddd' || tok === 'ddd') return '([^\\d\\s,.]+)\\.?';
      if (tok === 'A' || tok === 'a') return '([ap]\\.?m\\.?)';
      return '(\\d{1,2})';
    });
    const m = String(s).trim().match(new RegExp('^' + re + '$', 'i'));
    if (!m) return null;
    let y = new Date().getFullYear(), mo = 0, d = 1, hh = 0, mi = 0, ss = 0, ms = 0, pm = null;
    tokens.forEach((tok, i) => {
      const v = m[i + 1];
      if (tok === 'YYYY') y = +v;
      else if (tok === 'YY') y = 2000 + +v;
      else if (tok === 'MM' || tok === 'M') mo = +v - 1;
      else if (tok === 'MMMM' || tok === 'MMM') { const names = [...date.monthNames('long', loc), ...date.monthNames('short', loc)].map(x => x.toLowerCase().replace('.', '')); const idx = names.indexOf(v.toLowerCase().replace('.', '')); mo = idx < 0 ? 0 : idx % 12; }
      else if (tok === 'DD' || tok === 'D') d = +v;
      else if (tok === 'HH' || tok === 'H' || tok === 'hh' || tok === 'h') hh = +v;
      else if (tok === 'mm' || tok === 'm') mi = +v;
      else if (tok === 'ss' || tok === 's') ss = +v;
      else if (tok === 'SSS') ms = +v.padEnd(3, '0');
      else if (tok === 'A' || tok === 'a') pm = /p/i.test(v);
    });
    if (pm !== null) { if (hh === 12) hh = pm ? 12 : 0; else if (pm) hh += 12; }
    const out = new Date(y, mo, d, hh, mi, ss, ms);
    return out.getMonth() === mo && out.getDate() === d ? out : null; // reject 31/02
  },
  /**
   * format(date, 'YYYY-MM-DD HH:mm', locale)
   * Tokens: YYYY YY Q MMMM MMM MM M DD D Do dddd ddd dd d HH H hh h mm m ss s SSS A a Z W X x  [literal]
   */
  format(v, format = 'YYYY-MM-DD', loc) {
    const d = date.parse(v);
    if (!d) return '';
    const y = d.getFullYear(), M = d.getMonth(), D = d.getDate(), wd = d.getDay(), H = d.getHours(), mi = d.getMinutes(), s = d.getSeconds();
    return format.replace(/\[([^\]]*)\]|YYYY|YY|Q|MMMM|MMM|MM|M|DD|Do|D|dddd|ddd|dd|d|HH|H|hh|h|mm|m|ss|s|SSS|A|a|ZZ|Z|WW|W|X|x/g, (tok, lit) => {
      if (lit !== undefined) return lit;
      switch (tok) {
        case 'YYYY': return String(y);
        case 'YY': return String(y).slice(-2);
        case 'Q': return String(Math.floor(M / 3) + 1);
        case 'MMMM': return __dtf({ month: 'long' }, loc).format(d);
        case 'MMM': return __dtf({ month: 'short' }, loc).format(d);
        case 'MM': return pad2(M + 1);
        case 'M': return String(M + 1);
        case 'DD': return pad2(D);
        case 'Do': return D + (['th', 'st', 'nd', 'rd'][(D % 100 > 10 && D % 100 < 14) ? 0 : D % 10 < 4 ? D % 10 : 0]);
        case 'D': return String(D);
        case 'dddd': return __dtf({ weekday: 'long' }, loc).format(d);
        case 'ddd': return __dtf({ weekday: 'short' }, loc).format(d);
        case 'dd': return __dtf({ weekday: 'narrow' }, loc).format(d);
        case 'd': return String(wd);
        case 'HH': return pad2(H);
        case 'H': return String(H);
        case 'hh': return pad2(H % 12 || 12);
        case 'h': return String(H % 12 || 12);
        case 'mm': return pad2(mi);
        case 'm': return String(mi);
        case 'ss': return pad2(s);
        case 's': return String(s);
        case 'SSS': return String(d.getMilliseconds()).padStart(3, '0');
        case 'A': return H < 12 ? 'AM' : 'PM';
        case 'a': return H < 12 ? 'am' : 'pm';
        case 'Z': case 'ZZ': { const o = -d.getTimezoneOffset(), sg = o >= 0 ? '+' : '-', a = Math.abs(o); return sg + pad2(Math.floor(a / 60)) + (tok === 'Z' ? ':' : '') + pad2(a % 60); }
        case 'W': return String(date.weekNumber(d));
        case 'WW': return pad2(date.weekNumber(d));
        case 'X': return String(Math.floor(+d / 1000));
        case 'x': return String(+d);
      }
      return tok;
    });
  },
  isValid: v => !!date.parse(v),
  /** Today at 00:00 */
  today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; },
  /** add(date, n, unit) — units: ms s m h d w M Q y (or long names) */
  add(v, n, unit = 'd') {
    const d = date.parse(v); if (!d) return null;
    const u = __unit(unit);
    switch (u) {
      case 'ms': d.setMilliseconds(d.getMilliseconds() + n); break;
      case 's': d.setSeconds(d.getSeconds() + n); break;
      case 'm': d.setMinutes(d.getMinutes() + n); break;
      case 'h': d.setHours(d.getHours() + n); break;
      case 'd': d.setDate(d.getDate() + n); break;
      case 'w': d.setDate(d.getDate() + n * 7); break;
      case 'M': case 'Q': case 'y': {
        const months = u === 'M' ? n : u === 'Q' ? n * 3 : n * 12;
        const day = d.getDate();
        d.setDate(1); d.setMonth(d.getMonth() + months);
        d.setDate(Math.min(day, date.daysInMonth(d.getFullYear(), d.getMonth())));
        break;
      }
    }
    return d;
  },
  sub: (v, n, unit) => date.add(v, -n, unit),
  /** startOf(date, 'day'|'week'|'month'|'quarter'|'year'|'hour'|'minute', weekStart) */
  startOf(v, unit = 'd', weekStart) {
    const d = date.parse(v); if (!d) return null;
    const u = __unit(unit);
    if (u === 's') d.setMilliseconds(0);
    else if (u === 'm') d.setSeconds(0, 0);
    else if (u === 'h') d.setMinutes(0, 0, 0);
    else {
      d.setHours(0, 0, 0, 0);
      if (u === 'w') { const ws = weekStart ?? date.weekStart(); d.setDate(d.getDate() - ((d.getDay() - ws + 7) % 7)); }
      else if (u === 'M') d.setDate(1);
      else if (u === 'Q') { d.setDate(1); d.setMonth(Math.floor(d.getMonth() / 3) * 3); }
      else if (u === 'y') { d.setMonth(0, 1); }
    }
    return d;
  },
  endOf(v, unit = 'd', weekStart) {
    const u = __unit(unit);
    const s = date.startOf(v, u, weekStart); if (!s) return null;
    const next = u === 'w' ? date.add(s, 7, 'd') : date.add(s, 1, u);
    return new Date(+next - 1);
  },
  isSame(a, b, unit = 'd', weekStart) {
    const x = date.parse(a), y = date.parse(b);
    if (!x || !y) return false;
    return +date.startOf(x, unit, weekStart) === +date.startOf(y, unit, weekStart);
  },
  isBefore(a, b, unit) { const x = date.parse(a), y = date.parse(b); if (!x || !y) return false; return unit ? +date.startOf(x, unit) < +date.startOf(y, unit) : +x < +y; },
  isAfter(a, b, unit) { const x = date.parse(a), y = date.parse(b); if (!x || !y) return false; return unit ? +date.startOf(x, unit) > +date.startOf(y, unit) : +x > +y; },
  /** isBetween(d, start, end, unit='d', inclusive=true) */
  isBetween(v, a, b, unit = 'd', inclusive = true) {
    const d = date.parse(v), s = date.parse(a), e = date.parse(b);
    if (!d || !s || !e) return false;
    const x = +date.startOf(d, unit), lo = +date.startOf(+s < +e ? s : e, unit), hi = +date.startOf(+s < +e ? e : s, unit);
    return inclusive ? x >= lo && x <= hi : x > lo && x < hi;
  },
  isToday: v => date.isSame(v, new Date()),
  isWeekend: v => { const d = date.parse(v); return !!d && (d.getDay() === 0 || d.getDay() === 6); },
  /** diff(a, b, unit) = a - b in whole units (truncated) */
  diff(a, b, unit = 'd', float = false) {
    const x = date.parse(a), y = date.parse(b); if (!x || !y) return NaN;
    const u = __unit(unit);
    let r;
    if (u === 'M' || u === 'Q' || u === 'y') {
      const months = (x.getFullYear() - y.getFullYear()) * 12 + (x.getMonth() - y.getMonth());
      const anchor = date.add(y, months, 'M');
      const frac = (+x - +anchor) / ((+date.add(anchor, 1, 'M')) - +anchor || 1);
      r = (months + frac) / (u === 'M' ? 1 : u === 'Q' ? 3 : 12);
    } else if (u === 'd' || u === 'w') {
      // DST-safe day diff
      const ux = Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) + (x.getHours() * 36e5 + x.getMinutes() * 6e4 + x.getSeconds() * 1e3 + x.getMilliseconds());
      const uy = Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) + (y.getHours() * 36e5 + y.getMinutes() * 6e4 + y.getSeconds() * 1e3 + y.getMilliseconds());
      r = (ux - uy) / (u === 'd' ? DAY_MS : DAY_MS * 7);
    } else r = (+x - +y) / ({ ms: 1, s: 1e3, m: 6e4, h: 36e5 }[u] || 1);
    return float ? r : Math.trunc(r);
  },
  daysInMonth: (y, m) => new Date(y, m + 1, 0).getDate(),
  /** First day of week for a locale: 0 = Sunday, 1 = Monday (config.weekStart overrides) */
  weekStart(loc) {
    if (O.config?.weekStart != null) return O.config.weekStart;
    const l = loc || i18n.locale;
    try {
      const L = new Intl.Locale(l);
      const info = L.getWeekInfo ? L.getWeekInfo() : L.weekInfo;
      if (info && info.firstDay) return info.firstDay % 7;
    } catch {}
    const region = (l.split('-')[1] || '').toUpperCase();
    return ['US', 'CA', 'JP', 'BR', 'MX', 'IL', 'PH', 'KR', 'TW', 'HK', 'IN', 'ZA', 'AU', 'SA'].includes(region) || l === 'en' ? 0 : 1;
  },
  /** ISO-8601 week number */
  weekNumber(v) {
    const d = date.parse(v); if (!d) return NaN;
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / DAY_MS + 1) / 7);
  },
  /** monthNames('long'|'short'|'narrow', locale) -> 12 names */
  monthNames(style = 'long', loc) { const f = __dtf({ month: style }, loc); return Array.from({ length: 12 }, (_, i) => f.format(new Date(2021, i, 1))); },
  /** weekdayNames('short', locale, weekStart) -> 7 names starting at weekStart */
  weekdayNames(style = 'short', loc, weekStart = 0) {
    const f = __dtf({ weekday: style }, loc);
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(2021, 7, 1 + ((i + weekStart) % 7)))); // 2021-08-01 is a Sunday
  },
  /** matrix(year, month, weekStart) -> 42 Dates for a 6-week month grid */
  matrix(year, month, weekStart) {
    const ws = weekStart ?? date.weekStart();
    const first = new Date(year, month, 1);
    const start = date.add(first, -((first.getDay() - ws + 7) % 7), 'd');
    return Array.from({ length: 42 }, (_, i) => date.add(start, i, 'd'));
  },
  /** range(start, end, unit='d', step=1) -> Date[] (inclusive) */
  range(a, b, unit = 'd', step = 1) {
    const out = []; let d = date.parse(a); const e = date.parse(b);
    if (!d || !e) return out;
    for (let guard = 0; +d <= +e && guard < 10000; guard++) { out.push(d); d = date.add(d, step, unit); }
    return out;
  },
  min: (...ds) => ds.flat().map(date.parse).filter(Boolean).reduce((a, b) => (+a < +b ? a : b), null),
  max: (...ds) => ds.flat().map(date.parse).filter(Boolean).reduce((a, b) => (+a > +b ? a : b), null),
  /** 'YYYY-MM-DD' */
  toISODate: v => date.format(v, 'YYYY-MM-DD'),
  /** 'HH:mm' */
  toISOTime: (v, seconds = false) => date.format(v, seconds ? 'HH:mm:ss' : 'HH:mm'),
  /** 'YYYY-MM-DDTHH:mm' (local, for <input type=datetime-local>) */
  toLocalISO: v => date.format(v, 'YYYY-MM-DDTHH:mm'),
  /** parseTime('2:30 pm') -> { h: 14, m: 30, s: 0 } | null */
  parseTime(s) { const d = date.parse(String(s ?? '')); return d ? { h: d.getHours(), m: d.getMinutes(), s: d.getSeconds() } : null; },
  /** setTime(date, 'HH:mm' | {h,m,s}) */
  setTime(v, time) { const d = date.parse(v); if (!d) return null; const tm = isStr(time) ? date.parseTime(time) : time; if (tm) d.setHours(tm.h || 0, tm.m || 0, tm.s || 0, 0); return d; },
  /** Localized date pattern for inputs, e.g. en-US -> 'MM/DD/YYYY', en-GB -> 'DD/MM/YYYY' */
  localePattern(loc) {
    const parts = __dtf({ year: 'numeric', month: '2-digit', day: '2-digit' }, loc).formatToParts(new Date(2021, 11, 31));
    return parts.map(p => (p.type === 'year' ? 'YYYY' : p.type === 'month' ? 'MM' : p.type === 'day' ? 'DD' : p.value)).join('');
  },
  /** Does the locale use a 12-hour clock? */
  uses12h(loc) { try { return __dtf({ hour: 'numeric' }, loc).resolvedOptions().hour12 === true; } catch { return false; } },
  fromNow: v => fmt.relative(v),
};
O.date = date;
