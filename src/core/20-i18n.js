/* ============================================================================
 * core: i18n (translations, plurals, RTL) + Intl formatting
 * ========================================================================== */

const RTL_LANGS = ['ar', 'arc', 'ckb', 'dv', 'fa', 'ha', 'he', 'iw', 'khw', 'ks', 'ku', 'ps', 'sd', 'ur', 'yi', 'ug'];
const __i18n = { locale: 'en', fallback: 'en', dicts: Object.create(null), names: Object.create(null) };
const PLURAL_KEYS = ['zero', 'one', 'two', 'few', 'many', 'other'];
const isPluralObj = v => isObj(v) && Object.keys(v).length > 0 && Object.keys(v).every(k => PLURAL_KEYS.includes(k));

function __flatten(obj, prefix = '', out = {}) {
  for (const k in obj) {
    const v = obj[k], key = prefix ? prefix + '.' + k : k;
    if (isPlainObj(v) && !isPluralObj(v)) __flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
const __lookup = (loc, key) => __i18n.dicts[loc]?.[key];
const __pluralRules = new Map();

const i18n = {
  get locale() { return __i18n.locale; },
  get fallback() { return __i18n.fallback; },
  set fallback(v) { __i18n.fallback = v; },
  /** Add/merge translations: i18n.add('fr', { common: { ok: 'OK' } }, 'Français') — nested or dotted keys. */
  add(locale, dict, name) {
    __i18n.dicts[locale] = Object.assign(__i18n.dicts[locale] || Object.create(null), __flatten(dict));
    if (name) __i18n.names[locale] = name;
    if (locale === __i18n.locale) bus.emit('i18n:update', locale);
    return i18n;
  },
  /** Translate: t('table.rows', { count: 5 }) — {param} interpolation, plural objects {one, other}. */
  t(key, params, locale) {
    const loc = locale || __i18n.locale, base = loc.split('-')[0];
    let v = __lookup(loc, key);
    if (v == null && base !== loc) v = __lookup(base, key);
    if (v == null) v = __lookup(__i18n.fallback, key);
    if (v == null) return params && params.default != null ? String(params.default) : key;
    if (isFn(v)) return v(params || {});
    if (isPluralObj(v)) {
      const n = Number(params?.count ?? 0);
      let pr = __pluralRules.get(loc);
      if (!pr) { try { pr = new Intl.PluralRules(loc); } catch { pr = new Intl.PluralRules('en'); } __pluralRules.set(loc, pr); }
      v = (n === 0 && v.zero) || v[pr.select(n)] || v.other || '';
    }
    if (!params) return String(v);
    return String(v).replace(/\{(\w+)\}/g, (m, p) => (params[p] == null ? m : p === 'count' && isNum(params[p]) ? fmt.number(params[p]) : params[p]));
  },
  has(key, locale) { return __lookup(locale || __i18n.locale, key) != null; },
  /** Switch language: sets <html lang> and (for RTL languages) <html dir>. */
  set(locale, { dir, persist = true } = {}) {
    __i18n.locale = locale;
    __fmtCache.clear();
    if (isBrowser) {
      doc.documentElement.lang = locale;
      if (O.config?.autoDir !== false) doc.documentElement.dir = dir || (i18n.isRTL(locale) ? 'rtl' : 'ltr');
      if (persist && O.config?.persist !== false) ls.set('orion:locale', locale);
      emit(doc, 'o-locale', { locale });
    }
    bus.emit('locale', locale);
    return i18n;
  },
  isRTL(locale = __i18n.locale) { return RTL_LANGS.includes(String(locale).split('-')[0].toLowerCase()); },
  dir() { return isBrowser ? dirOf(doc.documentElement) : 'ltr'; },
  /** Available locales: [{ code, name }] */
  locales() {
    return Object.keys(__i18n.dicts).map(code => {
      let name = __i18n.names[code];
      if (!name) { try { name = new Intl.DisplayNames([code], { type: 'language' }).of(code); } catch { name = code; } }
      return { code, name };
    });
  },
  /** Raw dictionary (flattened) */
  dict(locale = __i18n.locale) { return { ...(__i18n.dicts[locale] || {}) }; },
};
/** Shortcut used everywhere: t('common.cancel') */
const t = (key, params, locale) => i18n.t(key, params, locale);
O.i18n = i18n;
O.t = t;

/* ── Intl formatters ──────────────────────────────────────────────────── */
const __fmtCache = new Map();
function __intl(Ctor, opts, loc) {
  const l = loc || __i18n.locale;
  const key = Ctor.name + l + JSON.stringify(opts || {});
  let f = __fmtCache.get(key);
  if (!f) { try { f = new Ctor(l, opts); } catch { f = new Ctor('en', opts); } __fmtCache.set(key, f); }
  return f;
}
const fmt = {
  /** number(1234.5, { maximumFractionDigits: 2 }) | number(v, 2) */
  number(v, opts = {}, loc) {
    if (v == null || v === '' || Number.isNaN(+v)) return '';
    const o = isNum(opts) ? { minimumFractionDigits: opts, maximumFractionDigits: opts } : opts;
    return __intl(Intl.NumberFormat, o, loc).format(+v);
  },
  currency(v, currency, opts = {}, loc) {
    if (v == null || v === '' || Number.isNaN(+v)) return '';
    return __intl(Intl.NumberFormat, { style: 'currency', currency: currency || O.config?.currency || 'USD', ...opts }, loc).format(+v);
  },
  /** percent(0.256) -> "26%" ; percent(0.256, 1) -> "25.6%" */
  percent(v, digits = 0, loc) { if (v == null || Number.isNaN(+v)) return ''; return __intl(Intl.NumberFormat, { style: 'percent', maximumFractionDigits: digits, minimumFractionDigits: digits }, loc).format(+v); },
  /** compact(1234567) -> "1.2M" */
  compact(v, loc) { if (v == null || Number.isNaN(+v)) return ''; return __intl(Intl.NumberFormat, { notation: 'compact', maximumFractionDigits: 1 }, loc).format(+v); },
  bytes: (v, d) => formatBytes(v, d),
  /** date(v, 'medium' | 'short' | 'long' | 'full' | Intl options | 'YYYY-MM-DD' tokens) */
  date(v, style = 'medium', loc) {
    const d = O.date ? O.date.parse(v) : new Date(v);
    if (!d || Number.isNaN(+d)) return '';
    if (isStr(style) && !['short', 'medium', 'long', 'full'].includes(style)) return O.date.format(d, style, loc);
    return __intl(Intl.DateTimeFormat, isObj(style) ? style : { dateStyle: style }, loc).format(d);
  },
  time(v, style = 'short', loc) {
    const d = O.date ? O.date.parse(v) : new Date(v);
    if (!d || Number.isNaN(+d)) return '';
    return __intl(Intl.DateTimeFormat, isObj(style) ? style : { timeStyle: style }, loc).format(d);
  },
  datetime(v, dateStyle = 'medium', timeStyle = 'short', loc) {
    const d = O.date ? O.date.parse(v) : new Date(v);
    if (!d || Number.isNaN(+d)) return '';
    return __intl(Intl.DateTimeFormat, { dateStyle, timeStyle }, loc).format(d);
  },
  /** relative(date) -> "3 minutes ago" / "in 2 days" */
  relative(v, base = Date.now(), loc) {
    const d = O.date ? O.date.parse(v) : new Date(v);
    if (!d) return '';
    const diff = (+d - +base) / 1000, a = Math.abs(diff);
    const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
    const rtf = __intl(Intl.RelativeTimeFormat, { numeric: 'auto' }, loc);
    if (a < 45) return rtf.format(0, 'second');
    for (const [u, s] of units) if (a >= s) return rtf.format(Math.round(diff / s), u);
    return rtf.format(0, 'second');
  },
  /** duration(ms, 'short' | 'clock') -> "1h 5m" | "01:05:00" */
  duration(ms, style = 'short') {
    const neg = ms < 0; ms = Math.abs(+ms || 0);
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    if (style === 'clock') { const p = n => String(n).padStart(2, '0'); return (neg ? '-' : '') + (d ? d + ':' : '') + p(hh) + ':' + p(mm) + ':' + p(ss); }
    const parts = [];
    if (d) parts.push(d + 'd'); if (hh) parts.push(hh + 'h'); if (mm) parts.push(mm + 'm'); if (ss && !d) parts.push(ss + 's');
    return (neg ? '-' : '') + (parts.join(' ') || '0s');
  },
  list(arr, type = 'conjunction', loc) { try { return __intl(Intl.ListFormat, { type }, loc).format(arr.map(String)); } catch { return arr.join(', '); } },
  /** Parse a localized number string: parseNumber('1.234,5', 'de') -> 1234.5 */
  parseNumber(str, loc) {
    if (isNum(str)) return str;
    const parts = __intl(Intl.NumberFormat, {}, loc).formatToParts(12345.6);
    const group = parts.find(p => p.type === 'group')?.value || ',', dec = parts.find(p => p.type === 'decimal')?.value || '.';
    const s = String(str ?? '').replace(new RegExp('[\\s' + group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\u00a0\\u202f]', 'g'), '').replace(dec, '.').replace(/[^\d.+\-eE]/g, '');
    const n = parseFloat(s);
    return Number.isNaN(n) ? null : n;
  },
  /** Decimal and group separators for a locale */
  separators(loc) {
    const parts = __intl(Intl.NumberFormat, {}, loc).formatToParts(12345.6);
    return { group: parts.find(p => p.type === 'group')?.value || ',', decimal: parts.find(p => p.type === 'decimal')?.value || '.' };
  },
};
O.format = fmt;

/* ── Built-in English strings shared by many components ──────────────── */
i18n.add('en', {
  common: {
    ok: 'OK', cancel: 'Cancel', close: 'Close', confirm: 'Confirm', yes: 'Yes', no: 'No', save: 'Save', delete: 'Delete',
    edit: 'Edit', add: 'Add', remove: 'Remove', apply: 'Apply', reset: 'Reset', clear: 'Clear', search: 'Search',
    searchPlaceholder: 'Search…', loading: 'Loading…', noResults: 'No results found', noData: 'No data', retry: 'Retry',
    back: 'Back', next: 'Next', previous: 'Previous', finish: 'Finish', done: 'Done', select: 'Select', selectAll: 'Select all',
    all: 'All', none: 'None', more: 'More', less: 'Less', showMore: 'Show more', showLess: 'Show less', copy: 'Copy',
    copied: 'Copied!', download: 'Download', upload: 'Upload', print: 'Print', export: 'Export', import: 'Import',
    refresh: 'Refresh', settings: 'Settings', filter: 'Filter', sort: 'Sort', today: 'Today', now: 'Now', open: 'Open',
    menu: 'Menu', actions: 'Actions', required: 'Required', optional: 'Optional', error: 'Error', success: 'Success',
    warning: 'Warning', info: 'Info', fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen', expand: 'Expand',
    collapse: 'Collapse', dragHere: 'Drag here', or: 'or', of: 'of', to: 'to', from: 'From', page: 'Page', total: 'Total',
    selected: '{count} selected', items: { one: '{count} item', other: '{count} items' },
    theme: 'Theme', light: 'Light', dark: 'Dark', auto: 'Auto', language: 'Language', notifications: 'Notifications',
    somethingWrong: 'Something went wrong', offline: 'You are offline', online: 'Back online',
  },
  validation: {
    required: 'This field is required', email: 'Enter a valid email address', url: 'Enter a valid URL', number: 'Enter a valid number',
    min: 'Must be at least {min}', max: 'Must be at most {max}', minLength: 'Must be at least {min} characters',
    maxLength: 'Must be at most {max} characters', pattern: 'Invalid format', match: 'Values do not match', invalid: 'Invalid value',
  },
});
