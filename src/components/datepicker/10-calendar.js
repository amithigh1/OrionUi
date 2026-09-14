// @deps timepicker
/* O.MonthGrid — renders ONE month as an accessible ARIA grid (<table role="grid">). Rendering + pointer events only;
 * keyboard movement across months is done by O.Calendar (reuse MonthGrid.keyTarget(e, date, opts) in your own widgets).
 *   const g = new O.MonthGrid(container, { year: 2026, month: 8, onSelect: (d, e) => … });
 *   g.set({ month: 9 }).render();   g.refresh();   g.cell(date) -> <td>;   g.focus(date);   g.destroy();
 * Options: year, month (0-11), weekStart (0-6, default locale), locale, weekNumbers, outsideDays (true),
 *   fixedWeeks (true = always 6 rows), focusDate (gets tabindex=0), labelledBy (caption id),
 *   isDisabled(d) -> bool, dayState(d) -> { selected, rangeStart, rangeEnd, inRange, preview, previewStart, previewEnd, … }
 *   (truthy keys become .is-* classes), highlight(d) -> null | true | { color, label, badge },
 *   renderDay(d, td) -> string | Node (cell content; the day number by default), dayLabel(d) -> aria-label,
 *   onSelect(d, e), onHover(d | null, e), onFocus(d, e)
 *
 * O.Calendar — one or more months side by side with captions, prev/next, month & year quick-pick views
 * (click the title → months → years with 12-year paging) and full keyboard support (RTL aware).
 *   const cal = new O.Calendar(el, { months: 2, min, max, weekStart, weekNumbers, outsideDays, locale,
 *     isDisabled, dayState, highlight, renderDay, onSelect(d, e), onHover(d), onView(firstMonth) });
 *   cal.show(date, { focus })  cal.focus(date?)  cal.refresh()  cal.render()  cal.set(opts)  cal.first  cal.focusDate
 */
i18n.add('en', {
  datepicker: {
    choose: 'Choose date', chooseMonth: 'Choose month and year', chooseYear: 'Choose year',
    prevMonth: 'Previous month', nextMonth: 'Next month', prevYear: 'Previous year', nextYear: 'Next year',
    prevYears: 'Previous 12 years', nextYears: 'Next 12 years', months: 'Months', years: 'Years',
    wk: 'Wk', week: 'Week', weekN: 'Week {n}',
  },
});

const __dfCache = new Map();
const __df = (loc, o) => {
  const k = (loc || i18n.locale) + JSON.stringify(o);
  let f = __dfCache.get(k);
  if (!f) { try { f = new Intl.DateTimeFormat(loc || i18n.locale, o); } catch { f = new Intl.DateTimeFormat('en', o); } __dfCache.set(k, f); }
  return f;
};
const __nf = loc => { try { return new Intl.NumberFormat(loc || i18n.locale, { useGrouping: false }); } catch { return { format: String }; } };
const __semantic = ['primary', 'secondary', 'success', 'danger', 'warning', 'info'];
const __hlColor = c => (!c ? 'var(--o-primary)' : __semantic.includes(c) ? `var(--o-${c})` : /^--/.test(c) ? `var(${c})` : c);
const __safeColor = c => String(c).replace(/[;{}<>"]/g, '');

class MonthGrid {
  constructor(el, o = {}) {
    const td = date.today();
    this.el = el;
    this.o = { year: td.getFullYear(), month: td.getMonth(), outsideDays: true, fixedWeeks: true, ...o };
    this.table = h('table', { class: 'o-mg', role: 'grid' });
    el.append(this.table);
    this._offs = [
      on(this.table, 'click', 'td[data-date]', (e, c) => { if (c.getAttribute('aria-disabled') !== 'true') this.o.onSelect?.(date.parse(c.dataset.date), e); }),
      on(this.table, 'pointerover', 'td[data-date]', (e, c) => { if (this._hov !== c) { this._hov = c; this.o.onHover?.(date.parse(c.dataset.date), e); } }),
      on(this.table, 'pointerleave', e => { this._hov = null; this.o.onHover?.(null, e); }),
      on(this.table, 'focusin', 'td[data-date]', (e, c) => this.o.onFocus?.(date.parse(c.dataset.date), e)),
    ];
    this.render();
  }
  set(o) { Object.assign(this.o, o); return this; }
  get weekStart() { return this.o.weekStart ?? date.weekStart(this.o.locale); }
  /** Rebuild the table for o.year / o.month. */
  render() {
    const o = this.o, loc = o.locale, ws = this.weekStart;
    const days = date.matrix(o.year, o.month, ws);
    const rows = o.fixedWeeks ? 6 : Math.ceil(((new Date(o.year, o.month, 1).getDay() - ws + 7) % 7 + date.daysInMonth(o.year, o.month)) / 7);
    const long = date.weekdayNames('long', loc, ws), short = date.weekdayNames('short', loc, ws);
    const dayF = __df(loc, { day: 'numeric' }), nf = __nf(loc);
    let html = '<thead><tr>' + (o.weekNumbers ? `<th class="o-mg-wk" scope="col" aria-label="${esc(t('datepicker.week'))}">${esc(t('datepicker.wk'))}</th>` : '') +
      short.map((n, i) => `<th scope="col" aria-label="${esc(long[i])}" title="${esc(long[i])}">${esc(n)}</th>`).join('') + '</tr></thead><tbody>';
    for (let r = 0; r < rows; r++) {
      const week = days.slice(r * 7, r * 7 + 7);
      html += '<tr>';
      if (o.weekNumbers) { const wn = date.weekNumber(week[(4 - ws + 7) % 7] || week[0]); html += `<th class="o-mg-wk" scope="row" aria-label="${esc(t('datepicker.weekN', { n: wn }))}">${esc(nf.format(wn))}</th>`; }
      for (const d of week) {
        const out = d.getMonth() !== o.month;
        if (out && !o.outsideDays) { html += '<td class="o-mg-empty" role="presentation"></td>'; continue; }
        const key = date.toISODate(d);
        html += `<td data-date="${key}"${out ? ' data-outside=""' : ''} tabindex="-1"><span class="o-mg-day">${esc(dayF.format(d))}</span></td>`;
      }
      html += '</tr>';
    }
    this.table.innerHTML = html + '</tbody>';
    if (o.labelledBy) this.table.setAttribute('aria-labelledby', o.labelledBy); else this.table.removeAttribute('aria-labelledby');
    if (o.renderDay) for (const c of this.table.querySelectorAll('td[data-date]')) {
      const res = o.renderDay(date.parse(c.dataset.date), c);
      if (res instanceof Node) c.replaceChildren(res); else if (res != null) c.innerHTML = String(res);
    }
    this.refresh();
    return this;
  }
  /** Re-apply states (selection, range, hover preview, disabled, highlight, focus) without rebuilding. */
  refresh() {
    const o = this.o, focusKey = o.focusDate ? date.toISODate(o.focusDate) : null, todayKey = date.toISODate(new Date());
    const full = __df(o.locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    for (const c of this.table.querySelectorAll('td[data-date]')) {
      const key = c.dataset.date, d = date.parse(key);
      const dis = !!o.isDisabled?.(d), st = o.dayState?.(d) || {};
      const classes = ['o-mg-cell'];
      if (c.hasAttribute('data-outside')) classes.push('is-outside');
      if (key === todayKey) classes.push('is-today');
      if (dis) classes.push('is-disabled');
      const wd = d.getDay(); if (wd === 0 || wd === 6) classes.push('is-weekend');
      for (const k in st) if (st[k]) classes.push('is-' + kebab(k));
      const hl = o.highlight?.(d);
      if (hl) classes.push('is-highlighted');
      c.className = classes.join(' ');
      c.setAttribute('aria-selected', String(!!(st.selected || st.rangeStart || st.rangeEnd || st.inRange)));
      if (dis) c.setAttribute('aria-disabled', 'true'); else c.removeAttribute('aria-disabled');
      if (key === todayKey) c.setAttribute('aria-current', 'date'); else c.removeAttribute('aria-current');
      c.tabIndex = key === focusKey ? 0 : -1;
      const extra = hl && isObj(hl) && hl.label ? String(hl.label) : '';
      c.setAttribute('aria-label', (o.dayLabel ? o.dayLabel(d) : full.format(d)) + (extra ? ', ' + extra : ''));
      if (extra) c.title = extra; else c.removeAttribute('title');
      let mk = c.querySelector(':scope > .o-mg-mark');
      if (hl && !o.renderDay) {
        const color = __safeColor(__hlColor(isObj(hl) ? hl.color : null));
        const badge = isObj(hl) && hl.badge != null && hl.badge !== '' ? String(hl.badge) : '';
        if (!mk) { mk = h('span', { class: 'o-mg-mark', 'aria-hidden': 'true' }); c.append(mk); }
        mk.className = badge ? 'o-mg-mark o-mg-badge' : 'o-mg-mark o-mg-dot';
        mk.textContent = badge;
        mk.style.setProperty('--o-mg-mark', color);
      } else mk?.remove();
    }
    return this;
  }
  cell(d) { const k = date.toISODate(d); return k ? this.table.querySelector(`td[data-date="${k}"]`) : null; }
  focus(d) { const c = d ? this.cell(d) : this.table.querySelector('td[tabindex="0"]'); c?.focus({ preventScroll: true }); return c; }
  destroy() { this._offs.forEach(f => f()); this.table.remove(); }
  /** Target date for a navigation key (arrows, Home/End, PageUp/PageDown, Shift+Page = year) or null. */
  static keyTarget(e, d, { rtl = false, weekStart } = {}) {
    if (e.altKey || e.ctrlKey || e.metaKey) return null;
    let k = e.key;
    if (rtl && (k === 'ArrowLeft' || k === 'ArrowRight')) k = k === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    const ws = weekStart ?? date.weekStart();
    switch (k) {
      case 'ArrowLeft': return date.add(d, -1, 'd');
      case 'ArrowRight': return date.add(d, 1, 'd');
      case 'ArrowUp': return date.add(d, -7, 'd');
      case 'ArrowDown': return date.add(d, 7, 'd');
      case 'Home': return date.startOf(d, 'w', ws);
      case 'End': return date.add(date.startOf(d, 'w', ws), 6, 'd');
      case 'PageUp': return date.add(d, -1, e.shiftKey ? 'y' : 'M');
      case 'PageDown': return date.add(d, 1, e.shiftKey ? 'y' : 'M');
    }
    return null;
  }
}
O.MonthGrid = MonthGrid;

/* ── O.Calendar ──────────────────────────────────────────────────────── */
class Calendar {
  constructor(el, o = {}) {
    this.el = el;
    this.o = { months: 1, weekNumbers: false, ...o };
    this.view = 'days'; this.grids = [];
    this.focusDate = date.startOf(date.parse(o.focusDate) || date.today(), 'd');
    this.first = date.startOf(this.focusDate, 'M');
    el.classList.add('o-cal');
    this.daysEl = h('div', { class: 'o-cal-days' });
    this.pickEl = h('div', { class: 'o-cal-pick', hidden: true });
    el.append(this.daysEl, this.pickEl);
    on(el, 'click', '[data-nav]', (e, b) => this._nav(+b.dataset.nav));
    on(el, 'click', '.o-cal-title', (e, b) => this._title(b));
    on(this.pickEl, 'click', '.o-cal-cell', (e, b) => this._pickCell(b));
    on(this.daysEl, 'keydown', 'td[data-date]', (e, c) => this._keyDay(e, c));
    on(this.pickEl, 'keydown', e => this._keyPick(e));
    this.render();
  }
  set(o) { Object.assign(this.o, o); return this; }
  get count() { return clamp(Math.floor(+this.o.months || 1), 1, 12); }
  _ws() { return this.o.weekStart ?? date.weekStart(this.o.locale); }
  _min() { return this.o.min ? date.startOf(this.o.min, 'd') : null; }
  _max() { return this.o.max ? date.startOf(this.o.max, 'd') : null; }
  isDisabled(d) { const mn = this._min(), mx = this._max(); return !!((mn && +d < +mn) || (mx && +d > +mx) || this.o.isDisabled?.(d)); }
  _last() { return date.add(this.first, this.count - 1, 'M'); }
  _visible(d) { const m = +date.startOf(d, 'M'); return m >= +this.first && m <= +this._last(); }
  _clamp(d) { const mn = this._min(), mx = this._max(); if (mn && +d < +mn) return mn; if (mx && +d > +mx) return mx; return d; }

  /** Show the month containing `d` (keeps the current view when it is already visible). */
  show(d, { focus = false, force = false } = {}) {
    d = date.startOf(date.parse(d) || date.today(), 'd');
    this.focusDate = d;
    if (force || !this._visible(d)) this.first = date.startOf(d, 'M');
    this.view = 'days';
    this.render();
    if (focus) this.focus();
    return this;
  }
  render() {
    if (this.view === 'days') this._renderDays(); else this._renderPick();
    this.daysEl.hidden = this.view !== 'days';
    this.pickEl.hidden = this.view === 'days';
    this.el.dataset.view = this.view;
    return this;
  }
  refresh() { this.grids.forEach(x => x.g.refresh()); return this; }
  _navBtn(dir, label) { return h('button', { type: 'button', class: 'o-cal-nav', 'data-nav': dir, 'aria-label': label }, icon(dir < 0 ? 'chevron-left' : 'chevron-right')); }
  _renderDays() {
    const n = this.count, loc = this.o.locale;
    if (this.grids.length !== n) {
      this.daysEl.replaceChildren(); this.grids = [];
      for (let i = 0; i < n; i++) {
        const title = h('button', { type: 'button', class: 'o-cal-title', id: uid('cal-title') });
        const cap = h('div', { class: 'o-cal-caption' },
          i === 0 ? this._navBtn(-1, '') : h('span', { class: 'o-cal-nav-ph' }), title,
          i === n - 1 ? this._navBtn(1, '') : h('span', { class: 'o-cal-nav-ph' }));
        const gw = h('div', { class: 'o-cal-grid' });
        this.daysEl.append(h('div', { class: 'o-cal-month' }, cap, gw));
        const g = new MonthGrid(gw, {
          labelledBy: title.id,
          onSelect: (d, e) => this._select(d, e),
          onHover: d => this.o.onHover?.(d),
          onFocus: d => { this.focusDate = d; },
        });
        this.grids.push({ g, title });
      }
    }
    const tf = __df(loc, { month: 'long', year: 'numeric' });
    const outside = this.o.outsideDays ?? n === 1;
    this.grids.forEach(({ g, title }, i) => {
      const md = date.add(this.first, i, 'M');
      title.innerHTML = `<span>${esc(tf.format(md))}</span>${icon('chevron-down', { class: 'o-cal-caret' })}`;
      title.setAttribute('aria-label', tf.format(md) + ' – ' + t('datepicker.chooseMonth'));
      title.dataset.month = date.toISODate(md);
      g.set({
        year: md.getFullYear(), month: md.getMonth(), weekStart: this._ws(), locale: loc, weekNumbers: this.o.weekNumbers, outsideDays: outside,
        focusDate: date.isSame(this.focusDate, md, 'M') ? this.focusDate : null,
        isDisabled: d => this.isDisabled(d), dayState: this.o.dayState, highlight: this.o.highlight, renderDay: this.o.renderDay, dayLabel: this.o.dayLabel,
      }).render();
    });
    const prev = this.daysEl.querySelector('[data-nav="-1"]'), next = this.daysEl.querySelector('[data-nav="1"]');
    const mn = this._min(), mx = this._max();
    if (prev) { prev.setAttribute('aria-label', t('datepicker.prevMonth')); prev.disabled = !!mn && +this.first <= +date.startOf(mn, 'M'); }
    if (next) { next.setAttribute('aria-label', t('datepicker.nextMonth')); next.disabled = !!mx && +this._last() >= +date.startOf(mx, 'M'); }
    if (!this.daysEl.querySelector('td[tabindex="0"]')) {
      const c = this.daysEl.querySelector('td[data-date]:not([data-outside]):not([aria-disabled="true"])') || this.daysEl.querySelector('td[data-date]:not([data-outside])');
      if (c) c.tabIndex = 0;
    }
  }
  _announce() { const tf = __df(this.o.locale, { month: 'long', year: 'numeric' }); announce(this.grids.map((x, i) => tf.format(date.add(this.first, i, 'M'))).join(' – ')); }
  _animate(dir) {
    if (!dir) return;
    this._announce();
    const x = (isRTL(this.el) ? -dir : dir) * 10;
    animate(this.daysEl, [{ opacity: 0.35, transform: `translateX(${x}px)` }, { opacity: 1, transform: 'none' }], { duration: 180 });
  }
  _nav(dir) {
    if (this.view === 'days') {
      this.first = date.add(this.first, dir, 'M');
      const f = date.add(this.focusDate, dir, 'M');
      this.focusDate = this._visible(f) ? f : date.add(this.first, 0, 'd');
      this._renderDays(); this._animate(dir);
      this.o.onView?.(this.first);
    } else {
      this.pickYear += this.view === 'months' ? dir : dir * 12;
      this._renderPick();
    }
  }
  _title(b) {
    const m = date.parse(b.dataset.month);
    if (this.view === 'days') {
      this._titleIndex = this.grids.findIndex(x => x.title === b); this.pickYear = m.getFullYear(); this.view = 'months';
      css(this.pickEl, { minWidth: this.daysEl.offsetWidth + 'px', minHeight: this.daysEl.offsetHeight + 'px' });
    }
    else if (this.view === 'months') this.view = 'years';
    else return;
    this.render();
    this._focusPick();
  }
  _renderPick() {
    const loc = this.o.locale, nf = __nf(loc), y = this.pickYear, today = date.today(), mn = this._min(), mx = this._max();
    const months = this.view === 'months';
    let title, cells;
    if (months) {
      title = nf.format(y);
      const shortN = date.monthNames('short', loc), longN = date.monthNames('long', loc);
      const cur = date.add(this.first, this._titleIndex || 0, 'M');
      cells = shortN.map((nm, i) => ({
        v: i, label: nm, aria: longN[i] + ' ' + nf.format(y),
        current: y === today.getFullYear() && i === today.getMonth(), selected: y === cur.getFullYear() && i === cur.getMonth(),
        disabled: (mn && +new Date(y, i + 1, 0) < +mn) || (mx && +new Date(y, i, 1) > +mx),
      }));
    } else {
      const start = y - (((y % 12) + 12) % 12);
      title = nf.format(start) + ' – ' + nf.format(start + 11);
      cells = Array.from({ length: 12 }, (_, i) => {
        const yy = start + i;
        return { v: yy, label: nf.format(yy), aria: nf.format(yy), current: yy === today.getFullYear(), selected: yy === this.pickYear, disabled: (mn && yy < mn.getFullYear()) || (mx && yy > mx.getFullYear()) };
      });
    }
    const prevDis = months ? mn && y <= mn.getFullYear() : mn && cells[0].v <= mn.getFullYear();
    const nextDis = months ? mx && y >= mx.getFullYear() : mx && cells[11].v >= mx.getFullYear();
    this.pickEl.innerHTML = `<div class="o-cal-caption">
        <button type="button" class="o-cal-nav" data-nav="-1" aria-label="${esc(t(months ? 'datepicker.prevYear' : 'datepicker.prevYears'))}"${prevDis ? ' disabled' : ''}>${icon('chevron-left')}</button>
        <button type="button" class="o-cal-title${months ? '' : ' is-static'}" data-month="${y}-01-01" aria-live="polite"${months ? ` aria-label="${esc(title + ' – ' + t('datepicker.chooseYear'))}"` : ' tabindex="-1" aria-disabled="true"'}><span>${esc(title)}</span>${months ? icon('chevron-down', { class: 'o-cal-caret' }) : ''}</button>
        <button type="button" class="o-cal-nav" data-nav="1" aria-label="${esc(t(months ? 'datepicker.nextYear' : 'datepicker.nextYears'))}"${nextDis ? ' disabled' : ''}>${icon('chevron-right')}</button>
      </div>
      <div class="o-cal-cells" role="grid" aria-label="${esc(t(months ? 'datepicker.months' : 'datepicker.years'))}">${[0, 1, 2, 3].map(r => `<div role="row">${cells.slice(r * 3, r * 3 + 3).map(c =>
        `<button type="button" role="gridcell" class="o-cal-cell${c.current ? ' is-current' : ''}${c.selected ? ' is-selected' : ''}" data-v="${c.v}" tabindex="-1" aria-label="${esc(c.aria)}" aria-selected="${!!c.selected}"${c.disabled ? ' aria-disabled="true"' : ''}>${esc(c.label)}</button>`).join('')}</div>`).join('')}</div>`;
    this._pnav = new ListNav(this.pickEl.querySelector('.o-cal-cells'), { items: '.o-cal-cell', orientation: 'grid', columns: 3, loop: false, typeahead: false, onSelect: el => this._pickCell(el) });
    const sel = this.pickEl.querySelector('.o-cal-cell.is-selected') || this.pickEl.querySelector('.o-cal-cell.is-current') || this.pickEl.querySelector('.o-cal-cell');
    if (sel) sel.tabIndex = 0;
  }
  _focusPick() {
    const items = this._pnav?.items || [];
    const i = items.findIndex(x => x.tabIndex === 0);
    this._pnav?.set(i < 0 ? 0 : i, { scroll: false });
  }
  _pickCell(b) {
    if (b.getAttribute('aria-disabled') === 'true') return;
    const v = +b.dataset.v;
    if (this.view === 'years') { this.pickYear = v; this.view = 'months'; this.render(); this._focusPick(); return; }
    const idx = this._titleIndex || 0;
    const chosen = new Date(this.pickYear, v, 1);
    this.first = date.add(chosen, -idx, 'M');
    const day = Math.min(this.focusDate.getDate(), date.daysInMonth(chosen.getFullYear(), chosen.getMonth()));
    this.focusDate = this._clamp(new Date(chosen.getFullYear(), chosen.getMonth(), day));
    this.view = 'days';
    this.render();
    this.focus();
    this.o.onView?.(this.first);
  }
  _keyPick(e) {
    if (e.key === 'Escape') { e.preventDefault(); this.view = this.view === 'years' ? 'months' : 'days'; this.render(); this.view === 'days' ? this.focus() : this._focusPick(); return; }
    if (!e.target.closest('.o-cal-cells')) return;
    if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); this._nav(e.key === 'PageUp' ? -1 : 1); this._focusPick(); return; }
    this._pnav?.handle(e);
  }
  _keyDay(e, c) {
    const d = date.parse(c.dataset.date);
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!this.isDisabled(d)) this._select(d, e); return; }
    const tgt = MonthGrid.keyTarget(e, d, { rtl: isRTL(this.el), weekStart: this._ws() });
    if (!tgt) return;
    e.preventDefault();
    this.moveFocus(tgt);
    this.o.onHover?.(this.focusDate, e);
  }
  /** Move keyboard focus to `d`, paging the view when needed. */
  moveFocus(d) {
    d = this._clamp(date.startOf(d, 'd'));
    const dir = +d < +this.first ? -1 : +d > +date.endOf(this._last(), 'M') ? 1 : 0;
    this.focusDate = d;
    if (dir) {
      this.first = dir < 0 ? date.startOf(d, 'M') : date.add(date.startOf(d, 'M'), -(this.count - 1), 'M');
      this._renderDays(); this._animate(dir);
      this.o.onView?.(this.first);
    } else this.grids.forEach(({ g }) => { g.o.focusDate = date.isSame(d, new Date(g.o.year, g.o.month, 1), 'M') ? d : null; g.refresh(); });
    this.focus();
  }
  focus(d) {
    if (d) return this.moveFocus(date.parse(d));
    if (this.view !== 'days') return this._focusPick();
    (this.daysEl.querySelector('td[tabindex="0"]'))?.focus({ preventScroll: true });
  }
  _select(d, e) {
    if (this.isDisabled(d)) return;
    this.focusDate = d;
    if (!this._visible(d)) { const dir = +d < +this.first ? -1 : 1; this.first = dir < 0 ? date.startOf(d, 'M') : date.add(date.startOf(d, 'M'), -(this.count - 1), 'M'); this._renderDays(); this._animate(dir); this.o.onView?.(this.first); }
    this.o.onSelect?.(d, e);
  }
}
O.Calendar = Calendar;
