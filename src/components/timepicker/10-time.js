// @deps select
/* Time helpers + O.TimeColumns (scroll-spinner columns: hours / minutes / seconds / AM-PM), reused by
 * <o-timepicker> and the datetime mode of <o-datepicker> / <o-daterange>.
 *   O.pickers.time.parse('2:30 pm') -> { h: 14, m: 30, s: 0 }    .parse('1430') / ('14.30') / ('2p') also work
 *   O.pickers.time.format({ h: 14, m: 30 }, { hour12, seconds, locale }) -> '2:30 PM' | '14:30'
 *   O.pickers.time.toISO({ h, m, s }, seconds) -> '14:30[:00]'     .fromISO('14:30') -> { h, m, s }
 *   const tc = new O.TimeColumns(el, { hour12, step: 5, seconds: false, min: '08:00', max: '18:00', locale,
 *                                     onChange(time), onEnter() });
 *   tc.set({ h, m, s } | null)  tc.focus(column?)  tc.render()  tc.set opts: tc.configure({...})
 */
i18n.add('en', { timepicker: { hours: 'Hours', minutes: 'Minutes', seconds: 'Seconds', period: 'AM/PM' } });

const __tfCache = new Map();
const __tf = (loc, o) => {
  const k = (loc || i18n.locale) + JSON.stringify(o);
  let f = __tfCache.get(k);
  if (!f) { try { f = new Intl.DateTimeFormat(loc || i18n.locale, o); } catch { f = new Intl.DateTimeFormat('en', o); } __tfCache.set(k, f); }
  return f;
};
const __tpad = n => String(n).padStart(2, '0');
const timeUtil = {
  uses12h: loc => date.uses12h(loc),
  /** { am, pm } localized day-period labels */
  periods(loc) {
    const f = __tf(loc, { hour: 'numeric', hourCycle: 'h12' });
    const get = hh => f.formatToParts(new Date(2021, 0, 1, hh)).find(p => p.type === 'dayPeriod')?.value;
    return { am: get(9) || 'AM', pm: get(21) || 'PM' };
  },
  opts(hour12, seconds) { return { hour: hour12 ? 'numeric' : '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hourCycle: hour12 ? 'h12' : 'h23' }; },
  format(tm, { hour12 = false, seconds = false, locale } = {}) {
    if (!tm) return '';
    return __tf(locale, timeUtil.opts(hour12, seconds)).format(new Date(2021, 0, 1, tm.h, tm.m, tm.s || 0));
  },
  /** formatToParts with character offsets: [{ type: 'hour'|'minute'|'second'|'dayPeriod'|'literal', value, start, end }] */
  parts(tm, o = {}) {
    let pos = 0;
    return __tf(o.locale, timeUtil.opts(o.hour12, o.seconds)).formatToParts(new Date(2021, 0, 1, tm.h, tm.m, tm.s || 0))
      .map(p => { const r = { type: p.type, value: p.value, start: pos, end: pos + p.value.length }; pos = r.end; return r; });
  },
  toISO(tm, seconds = false) { return tm ? __tpad(tm.h) + ':' + __tpad(tm.m) + (seconds ? ':' + __tpad(tm.s || 0) : '') : ''; },
  fromISO(v) {
    if (v == null || v === '') return null;
    if (isObj(v) && 'h' in v) return { h: +v.h || 0, m: +v.m || 0, s: +v.s || 0 };
    if (v instanceof Date) return { h: v.getHours(), m: v.getMinutes(), s: v.getSeconds() };
    const m = String(v).match(/(?:T|^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    return m ? { h: +m[1] % 24, m: +m[2] % 60, s: +(m[3] || 0) % 60 } : null;
  },
  /** Lenient typed-time parser: '2:30 pm', '14:30', '1430', '930', '2p', '14.30.15', localized AM/PM markers. */
  parse(str, loc) {
    let s = String(str ?? '').trim().toLowerCase();
    if (!s) return null;
    const p = timeUtil.periods(loc), am = p.am.toLowerCase(), pm = p.pm.toLowerCase();
    let period = null;
    const strip = (re, val) => { if (re.test(s)) { period = val; s = s.replace(re, ' '); } };
    if (pm && s.includes(pm)) { period = 'pm'; s = s.replace(pm, ' '); } else if (am && s.includes(am)) { period = 'am'; s = s.replace(am, ' '); }
    if (!period) { strip(/p\.?\s*m\.?|(?<=\d\s*)p$/, 'pm'); if (!period) strip(/a\.?\s*m\.?|(?<=\d\s*)a$/, 'am'); }
    s = s.replace(/[‎‏  ]/g, ' ').trim();
    let hh, mm = 0, ss = 0, m;
    if ((m = s.match(/^(\d{1,2})(?:\s*[:.h]\s*(\d{1,2}))?(?:\s*[:.m]\s*(\d{1,2}))?\s*$/))) { hh = +m[1]; mm = +(m[2] || 0); ss = +(m[3] || 0); }
    else if ((m = s.match(/^(\d{3,6})$/))) {
      const d = m[1], hl = d.length % 2 ? 1 : 2;
      hh = +d.slice(0, hl); mm = +d.slice(hl, hl + 2); ss = +(d.slice(hl + 2, hl + 4) || 0);
    } else return null;
    if (period) { if (hh < 1 || hh > 12) return null; hh = hh === 12 ? (period === 'pm' ? 12 : 0) : period === 'pm' ? hh + 12 : hh; }
    if (hh > 23 || mm > 59 || ss > 59) return null;
    return { h: hh, m: mm, s: ss };
  },
  secs: tm => (tm ? tm.h * 3600 + tm.m * 60 + (tm.s || 0) : null),
};
O.pickers.time = timeUtil;

/* ── O.TimeColumns ───────────────────────────────────────────────────── */
class TimeColumns {
  constructor(el, o = {}) {
    this.el = el; this.o = { hour12: false, step: 1, secondStep: 1, seconds: false, ...o }; this.value = null;
    el.classList.add('o-tc');
    el.setAttribute('role', 'group');
    on(el, 'mousedown', '.o-tc-cell', e => e.preventDefault());
    on(el, 'click', '.o-tc-cell', (e, c) => {
      if (c.getAttribute('aria-disabled') === 'true') return;
      const col = c.closest('.o-tc-col');
      this._apply(col.dataset.col, +c.dataset.v);
      col.focus({ preventScroll: true });
    });
    on(el, 'keydown', '.o-tc-col', (e, col) => this._key(e, col));
    this.render();
  }
  configure(o) { Object.assign(this.o, o); this.render(); return this; }
  _cols() {
    const o = this.o, st = Math.max(1, Math.min(60, +o.step || 1)), sst = Math.max(1, +o.secondStep || 1);
    const range = (n, step) => Array.from({ length: Math.ceil(n / step) }, (_, i) => i * step);
    const cols = [
      { key: 'h', label: t('timepicker.hours'), vals: o.hour12 ? [12, ...range(12, 1).slice(1)] : range(24, 1) },
      { key: 'm', label: t('timepicker.minutes'), vals: range(60, st) },
    ];
    if (o.seconds) cols.push({ key: 's', label: t('timepicker.seconds'), vals: range(60, sst) });
    if (o.hour12) cols.push({ key: 'p', label: t('timepicker.period'), vals: [0, 1] });
    const v = this.value;
    if (v && !cols[1].vals.includes(v.m)) cols[1].vals = [...cols[1].vals, v.m].sort((a, b) => a - b);
    return cols;
  }
  render() {
    const per = timeUtil.periods(this.o.locale);
    let nf = null;
    try { nf = new Intl.NumberFormat(this.o.locale || i18n.locale, { minimumIntegerDigits: 2, useGrouping: false }); } catch {}
    const two = n => (nf ? nf.format(n) : __tpad(n));
    this._colsDef = this._cols();
    this.el.replaceChildren(...this._colsDef.map(c => {
      const col = h('div', { class: 'o-tc-col o-scroll', role: 'listbox', tabindex: '0', 'aria-label': c.label, dataset: { col: c.key } });
      c.vals.forEach(v => col.append(h('div', { class: 'o-tc-cell', role: 'option', id: uid('tc'), 'aria-selected': 'false', dataset: { v } },
        c.key === 'p' ? (v ? per.pm : per.am) : c.key === 'h' && this.o.hour12 ? String(v) : two(v))));
      return col;
    }));
    this.paint(false);
  }
  /** set({ h, m, s } | null) — programmatic, no onChange */
  set(tm, scroll = true) { this.value = tm ? { h: tm.h, m: tm.m, s: tm.s || 0 } : null; if (tm && !this._colsDef[1].vals.includes(tm.m)) this.render(); else this.paint(scroll); return this; }
  _sel(key) {
    const v = this.value; if (!v) return null;
    if (key === 'h') return this.o.hour12 ? (v.h % 12 || 12) : v.h;
    if (key === 'm') return v.m;
    if (key === 's') return v.s;
    return v.h >= 12 ? 1 : 0;
  }
  _compose(key, val, base) {
    const v = { ...(base || this.value || { h: new Date().getHours(), m: 0, s: 0 }) };
    if (key === 'h') v.h = this.o.hour12 ? (val % 12) + (v.h >= 12 ? 12 : 0) : val;
    else if (key === 'm') v.m = val;
    else if (key === 's') v.s = val;
    else if (key === 'p') v.h = (v.h % 12) + (val ? 12 : 0);
    return v;
  }
  _disabled(key, val) {
    const lo = timeUtil.secs(timeUtil.fromISO(this.o.min)), hi = timeUtil.secs(timeUtil.fromISO(this.o.max));
    if (lo == null && hi == null) return false;
    const cand = this._compose(key, val);
    // for hours / periods: disabled only if the whole block is out of range
    let a = timeUtil.secs(cand), b = a;
    if (key === 'h') { a = cand.h * 3600; b = a + 3599; }
    else if (key === 'p') { a = (cand.h >= 12 ? 12 : 0) * 3600; b = a + 12 * 3600 - 1; }
    else if (key === 'm') { a = cand.h * 3600 + cand.m * 60; b = a + 59; }
    return (hi != null && a > hi) || (lo != null && b < lo);
  }
  paint(scroll = true) {
    for (const col of this.el.children) {
      const key = col.dataset.col, sel = this._sel(key);
      let selEl = null;
      for (const c of col.children) {
        const v = +c.dataset.v, on_ = v === sel;
        c.setAttribute('aria-selected', String(on_));
        c.classList.toggle('is-selected', on_);
        if (this._disabled(key, v)) c.setAttribute('aria-disabled', 'true'); else c.removeAttribute('aria-disabled');
        if (on_) selEl = c;
      }
      if (selEl) col.setAttribute('aria-activedescendant', selEl.id); else col.removeAttribute('aria-activedescendant');
      if (scroll && selEl) this._scroll(col, selEl);
    }
  }
  _scroll(col, cell) {
    if (!col.clientHeight) return;
    const top = cell.offsetTop - (col.clientHeight - cell.offsetHeight) / 2;
    col.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() || !this._ready ? 'auto' : 'smooth' });
  }
  /** scroll every column to its selected cell (call after the columns become visible) */
  reveal() { this._ready = false; this.paint(true); this._ready = true; }
  focus(key) { const col = key ? this.el.querySelector(`[data-col="${key}"]`) : this.el.firstElementChild; col?.focus({ preventScroll: true }); }
  _apply(key, val) {
    const v = this._compose(key, val);
    this.value = v;
    this.paint(true);
    this.o.onChange?.({ ...v });
  }
  _key(e, col) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = col.dataset.col, def = this._colsDef.find(c => c.key === key), vals = def.vals;
    let k = e.key;
    if (isRTL(this.el) && (k === 'ArrowLeft' || k === 'ArrowRight')) k = k === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    const cur = vals.indexOf(this._sel(key));
    const go = i => { e.preventDefault(); this._apply(key, vals[(i + vals.length) % vals.length]); };
    if (k === 'ArrowDown') go(cur + 1);
    else if (k === 'ArrowUp') go(cur < 0 ? 0 : cur - 1);
    else if (k === 'PageDown') go(Math.min(vals.length - 1, cur + 5));
    else if (k === 'PageUp') go(Math.max(0, cur - 5));
    else if (k === 'Home') go(0);
    else if (k === 'End') go(vals.length - 1);
    else if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); (k === 'ArrowRight' ? col.nextElementSibling : col.previousElementSibling)?.focus({ preventScroll: true }); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); if (!this.value) this._apply(key, vals[Math.max(0, cur)]); this.o.onEnter?.(); }
    else if (key === 'p' && /^[ap]$/i.test(k)) { e.preventDefault(); this._apply('p', k.toLowerCase() === 'p' ? 1 : 0); }
    else if (/^\d$/.test(k)) {
      e.preventDefault();
      const now = Date.now();
      this._buf = (now - (this._bufT || 0) < 900 && col === this._bufCol ? this._buf : '') + k;
      this._bufT = now; this._bufCol = col;
      let n = +this._buf;
      if (!vals.includes(n)) { this._buf = k; n = +k; }
      if (vals.includes(n)) this._apply(key, n);
    }
  }
}
O.TimeColumns = TimeColumns;
