/* ============================================================================
 * <o-calendar> — full calendar: month | week | day | list | year | resource-day |
 * resource-week | resource-month. Events via `events`, async `source` (range based,
 * cached per month, loading bar) or a URL. See README.md for the complete API.
 * ========================================================================== */

class OCalendar extends OElement {
  static props = {
    view: { type: String, default: 'month', reflect: true },
    views: { type: Array, default: () => ['month', 'week', 'day', 'list'] },
    date: Any,
    weekStart: Number,
    firstHour: { type: Number, default: 0 },
    lastHour: { type: Number, default: 24 },
    scrollTime: { type: String, default: '08:00' },
    slotMinutes: { type: Number, default: 30 },
    snapMinutes: Number,
    defaultDuration: { type: Number, default: 60 },
    businessHours: Any,
    editable: Boolean,
    selectable: Boolean,
    nowIndicator: Boolean,
    weekNumbers: Boolean,
    fixedWeeks: Boolean,
    height: { type: String, default: 'auto' },
    events: { type: Array, default: () => [] },
    source: Any,
    resources: { type: Array, default: () => [] },
    toolbar: { type: Any, default: true },
    navigator: Boolean,
    dayMaxEvents: { type: Any, default: 'auto' },
    allDayMaxRows: { type: Number, default: 3 },
    listRange: { type: String, default: 'month' },
    responsive: { type: Boolean, default: true },
    locale: String,
    hour12: Any,
    eventColor: { type: String, default: 'primary' },
    zoom: { type: Number, default: 2 },
    conflicts: { type: Boolean, default: true },
    droppable: { type: Boolean, default: true },
    confirmDelete: { type: Boolean, default: true },
    shortcuts: { type: Boolean, default: true },
    popover: { type: Boolean, default: true },
    builtinDialogs: Boolean,
    eventContent: { type: Function, attr: false },
    eventDidMount: { type: Function, attr: false },
    texts: Object,
  };

  setup() {
    this.classList.add('o-calendar');
    this._store = new CalStore();
    this._occs = []; this._occMap = new Map(); this._collapsed = new Set(); this._cache = new Map(); this._ctrls = new Set();
    this._gen = 0; this._pending = 0; this._autoList = true; this._narrow = false;
    this._date = calD.sod(new Date());
    this._kbdId = uid('cal-kbd');
    this.titleEl = h('h2', { class: 'o-calendar-title', 'aria-live': 'polite' });
    this.tb = h('div', { class: 'o-calendar-toolbar', role: 'toolbar' });
    this.loadEl = h('div', { class: 'o-calendar-loading', role: 'progressbar', hidden: true }, h('span'));
    this.errEl = h('div', { class: 'o-alert o-alert-danger o-calendar-error', role: 'alert', hidden: true });
    this.navEl = h('aside', { class: 'o-calendar-nav', hidden: true });
    this.main = h('div', { class: 'o-calendar-main' });
    this.bodyEl = h('div', { class: 'o-calendar-body' }, this.loadEl, this.navEl, this.main);
    this.append(this.tb, this.errEl, this.bodyEl, h('div', { id: this._kbdId, class: 'o-sr-only' }));
    this._drag = new CalDrag(this);
    on(this, 'pointerdown', e => this._drag.down(e));
    on(this, 'click', '.o-calendar-ev', (e, el) => this._evClickEl(e, el));
    on(this, 'keydown', e => this._keydown(e));
    on(this.tb, 'click', '[data-act]', (e, b) => this._act(b.dataset.act, b));
    on(this.tb, 'change', 'select[data-act]', (e, s) => { e.stopPropagation(); this.changeView(s.value, null, true); });
    on(this.errEl, 'click', '[data-retry]', () => { for (const [k, v] of this._cache) if (v === 'error') this._cache.delete(k); this.errEl.hidden = true; this._render(); });
  }
  connected() {
    this.addCleanup(observeResize(this, debounce(rect => {
      const narrow = rect.width < 620;
      if (narrow !== this._narrow) { this._narrow = narrow; if (!narrow) this._autoList = true; this.classList.toggle('is-narrow', narrow); this._render(); }
      else if (this._view && (this._view.type === 'month' || this._view.type === 'week' || this._view.type === 'day') && Math.abs((this._lastH || 0) - rect.height) > 4) this._render();
      this._lastH = rect.height;
    }, 60)));
    const tick = setInterval(() => {
      if (this._dayKey && this._dayKey !== calD.key(new Date())) this._render(); else this._view?.tick?.();
    }, 60000);
    this.addCleanup(() => clearInterval(tick));
    if (this._setupDone && this._view) this._render();
  }
  disconnected() {
    this._pop?.close('api'); this._more?.close('api'); this._drag.cleanup();
    this._ctrls.forEach(c => c.abort()); this._ctrls.clear();
    if (this._pending) { this._pending = 0; this._gen++; for (const [k, v] of this._cache) if (v === 'loading') this._cache.delete(k); }
  }
  update(changed) {
    const init = changed.has('init'), opt = { duration: this.defaultDuration };
    if (init || changed.has('events')) this._store.reset(this.events, opt, false);
    if (changed.has('source') && !init) this._resetSource();
    if (init || changed.has('date')) { const d = date.parse(this.date); if (d || init) this._date = calD.sod(d || new Date()); }
    if (changed.has('view') && !CAL_VIEWS.includes(this.view)) { this.view = 'month'; return; }
    if (init || changed.has('height')) this._applyHeight();
    if (init || changed.has('navigator')) { this.navEl.hidden = !this.navigator; this.classList.toggle('has-nav', !!this.navigator); if (this.navigator && !this._mini) { this._mini = new CalMini(this); this.navEl.append(this._mini.el); } }
    if (init || changed.has('toolbar') || changed.has('views') || changed.has('locale') || changed.has('texts')) this._buildToolbar();
    this.querySelector('#' + this._kbdId).textContent = this.t('calendar.keyboard');
    this._render();
  }

  /* ── derived settings ─────────────────────────────────────────────── */
  _derive() {
    this._loc = this.locale || i18n.locale;
    const h12 = this.hour12;
    this._h12 = h12 == null ? date.uses12h(this._loc) : h12 === true || h12 === '' || h12 === 'true' || h12 === '12' || h12 === 12;
    this._ws = this.weekStart != null && !Number.isNaN(+this.weekStart) ? ((+this.weekStart % 7) + 7) % 7 : date.weekStart(this._loc);
    const fh = clamp(Math.floor(+this.firstHour || 0), 0, 23), lh = clamp(Math.ceil(+this.lastHour || 24), fh + 1, 24);
    this._lo = fh * 60; this._hi = lh * 60;
    this._snap = +this.snapMinutes > 0 ? +this.snapMinutes : Math.min(15, this.slotMinutes);
    this._biz = calBusiness(this.businessHours);
  }
  _applyHeight() {
    const v = String(this.height ?? 'auto').trim();
    const fixed = v && v !== 'auto';
    this.classList.toggle('has-height', fixed);
    this.style.setProperty('--o-calendar-h', fixed ? (/^\d+(\.\d+)?$/.test(v) ? v + 'px' : v) : '');
  }
  get _type() { return this._view?.type || this.view; }
  _effType() { return this.responsive && this._narrow && this._autoList && (this.view === 'month' || this.view === 'week') ? 'list' : this.view; }
  _hasView(v) { return toArr(this.views).includes(v); }
  _canEdit(ev) { return !!this.editable && ev.editable !== false; }
  _isPast() { return false; }
  _dragJustEnded() { return Date.now() - this._drag.ended < 350; }
  _makeView(type) {
    if (type === 'week' || type === 'day') return new CalTimeGrid(this, type);
    if (type === 'list') return new CalList(this);
    if (type === 'year') return new CalYear(this);
    if (type.startsWith('resource')) return new CalTimeline(this, type);
    return new CalMonth(this);
  }

  /* ── render ───────────────────────────────────────────────────────── */
  _render() {
    if (!this._setupDone) return;
    this._derive();
    const type = this._effType();
    const prevType = this._view?.type;
    const f = this._focusInfo();
    if (!this._view || this._view.type !== type) {
      this._view?.destroy();
      this._view = this._makeView(type);
      if (type === 'list') this._view.unit = this._narrow && this.view === 'week' ? 'week' : null;
      this.main.replaceChildren(this._view.el);
      this._range = null;
      this.dataset.view = type;
    }
    const view = this._view;
    const r = view.range(this._date);
    const moved = !this._range || +r.start !== +this._range.start || +r.end !== +this._range.end;
    this._range = r;
    this._dayKey = calD.key(new Date());
    this.titleEl.textContent = view.title(r);
    this._syncToolbar();
    this._fetch(r.start, r.end);
    this._occs = this._store.occurrences(r.start, r.end);
    this._occMap = new Map(this._occs.map(o => [o.key, o]));
    try { view.render(this._occs, r); } catch (e) { console.error('[Orion] calendar render failed:', e); }
    this._restoreFocus(f);
    this._mini?.render();
    if (prevType && prevType !== type) this.emit('view-change', { view: type, requested: this.view });
    if (moved) this.emit('dates-change', { start: new Date(+r.start), end: new Date(+r.end), view: type });
  }
  _focusInfo() {
    const a = doc.activeElement;
    if (!a || !this._view || !this._view.el.contains(a)) return null;
    return { key: a.closest('.o-calendar-ev')?.dataset.key, date: a.dataset?.date, min: a.dataset?.min, col: a.closest('.o-calendar-col')?.dataset.date, cls: a.className };
  }
  _restoreFocus(f) {
    if (!f || !this._view || this._drag.s) return;
    const v = this._view.el;
    let el = f.key ? v.querySelector(`.o-calendar-ev[data-key="${CSS.escape(f.key)}"]`) : null;
    if (!el && f.min && f.col) el = v.querySelector(`.o-calendar-col[data-date="${f.col}"] .o-calendar-slot[data-min="${f.min}"]`);
    if (!el && f.date) el = v.querySelector(`[data-date="${f.date}"][tabindex]`);
    el?.focus({ preventScroll: true });
  }

  /* ── toolbar ──────────────────────────────────────────────────────── */
  _buildToolbar() {
    const cfg = this.toolbar;
    if (cfg === false || cfg === 'false') { this.tb.hidden = true; return; }
    this.tb.hidden = false;
    this.tb.setAttribute('aria-label', this.t('calendar.calendar'));
    const c = isObj(cfg) ? { start: 'today prev,next title', end: 'zoom views', ...cfg } : { start: 'today prev,next title', end: 'zoom views' };
    const btn = (act, label, ic, cls = 'o-btn-ghost o-btn-icon') => h('button', { type: 'button', class: ['o-btn o-btn-sm', cls], 'data-act': act, 'aria-label': ic ? label : null, title: ic ? label : null }, ic ? icon(ic) : label);
    const token = tk => {
      switch (tk) {
        case 'today': return btn('today', this.t('calendar.today'), null, 'o-calendar-today');
        case 'prev': return btn('prev', this.t('calendar.prev'), 'chevron-left');
        case 'next': return btn('next', this.t('calendar.next'), 'chevron-right');
        case 'title': return this.titleEl;
        case 'print': return btn('print', this.t('calendar.print'), 'printer');
        case 'add': return h('button', { type: 'button', class: 'o-btn o-btn-sm o-btn-primary', 'data-act': 'add' }, icon('plus'), h('span', null, this.t('calendar.add')));
        case 'zoom': return h('div', { class: 'o-btn-group o-calendar-zoom', role: 'group' }, btn('zoom-out', this.t('calendar.zoomOut'), 'zoom-out', 'o-btn-icon'), btn('zoom-in', this.t('calendar.zoomIn'), 'zoom-in', 'o-btn-icon'));
        case 'views': {
          const vs = toArr(this.views).filter(v => CAL_VIEWS.includes(v));
          if (vs.length < 2) return null;
          const label = v => this.t('calendar.view.' + v);
          return [
            h('div', { class: 'o-segmented o-calendar-views', role: 'group', 'aria-label': this.t('calendar.views') }, vs.map(v => h('button', { type: 'button', 'data-act': 'view', 'data-view': v, 'aria-pressed': 'false' }, label(v)))),
            h('select', { class: 'o-select o-input-sm o-calendar-views-sel', 'data-act': 'view', 'aria-label': this.t('calendar.views') }, vs.map(v => h('option', { value: v }, label(v)))),
          ];
        }
        default: return null;
      }
    };
    const section = (spec, cls) => h('div', { class: cls }, String(spec || '').split(/\s+/).filter(Boolean).map(grp => {
      const parts = grp.split(',').map(token).filter(Boolean);
      return parts.length > 1 ? h('div', { class: 'o-btn-group o-calendar-nav-btns', role: 'group' }, parts) : parts[0];
    }));
    this.tb.replaceChildren(...[section(c.start, 'o-calendar-tb-start'), c.center ? section(c.center, 'o-calendar-tb-center') : null, section(c.end, 'o-calendar-tb-end')].filter(Boolean));
  }
  _syncToolbar() {
    const type = this._view?.type;
    this.tb.querySelectorAll('button[data-act=view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === type)));
    const sel = this.tb.querySelector('select[data-act=view]');
    if (sel) sel.value = type;
    const z = this.tb.querySelector('.o-calendar-zoom');
    if (z) {
      z.hidden = !type?.startsWith('resource');
      const zz = clamp(Math.round(this.zoom ?? 2), 0, 4);
      z.querySelector('[data-act=zoom-out]').disabled = zz <= 0;
      z.querySelector('[data-act=zoom-in]').disabled = zz >= 4;
    }
    const today = new Date(), r = this._range;
    const tb = this.tb.querySelector('[data-act=today]');
    if (tb && r) tb.classList.toggle('is-current', today >= r.start && today < r.end);
  }
  _act(act, b) {
    if (act === 'today') this.today();
    else if (act === 'prev') this.prev();
    else if (act === 'next') this.next();
    else if (act === 'view' && b.tagName === 'BUTTON') this.changeView(b.dataset.view, null, true);
    else if (act === 'zoom-in') this.zoomBy(1);
    else if (act === 'zoom-out') this.zoomBy(-1);
    else if (act === 'print') this.print();
    else if (act === 'add') this.openEditor();
  }

  /* ── navigation ───────────────────────────────────────────────────── */
  _shift(n) {
    const t = this._type, d = this._date;
    if (t === 'year') return date.add(d, n, 'y');
    if (t === 'month' || t === 'resource-month') return date.add(calD.monthStart(d), n, 'M');
    if (t === 'week' || t === 'resource-week') return calD.add(d, 7 * n);
    if (t === 'list') { const r = this._view.range(d); return r.unit === 'month' ? date.add(calD.monthStart(d), n, 'M') : calD.add(d, n * calD.days(r.start, r.end)); }
    return calD.add(d, n);
  }
  _goto(d) { this._date = calD.sod(d); this._render(); return Promise.resolve(); }
  /** gotoDate(date) */
  gotoDate(d) { const x = date.parse(d); if (x) this._goto(x); }
  next() { this._goto(this._shift(1)); }
  prev() { this._goto(this._shift(-1)); }
  today() { this._goto(new Date()); }
  /** changeView('week', date?) */
  changeView(v, d, user = false) {
    if (!CAL_VIEWS.includes(v)) return;
    if (d) { const x = date.parse(d); if (x) this._date = calD.sod(x); }
    if (user || this._narrow) this._autoList = !(this._narrow && (v === 'month' || v === 'week'));
    if (this.view !== v) this.view = v; else this._render();
  }
  scrollToTime(tm) { this._view?.scrollToTime(calTimeMin(tm, 480)); }
  zoomBy(n, clientX) {
    const z = clamp(Math.round(this.zoom ?? 2) + n, 0, 4);
    if (z === Math.round(this.zoom ?? 2)) return;
    this._view?.anchorZoom?.(clientX);
    this.zoom = z;
  }
  /** the current view: { type, start, end, title, date } */
  getView() { const r = this._range || {}; return { type: this._type, start: r.start && new Date(+r.start), end: r.end && new Date(+r.end), title: this.titleEl.textContent, date: new Date(+this._date) }; }
  get currentDate() { return new Date(+this._date); }

  /* ── events API ───────────────────────────────────────────────────── */
  addEvent(raw) { const ev = this._store.upsert(raw, { duration: this.defaultDuration }); this._render(); return ev ? calPub(ev) : null; }
  updateEvent(id, changes = {}) {
    const ev = this._store.get(id);
    if (!ev) return null;
    const n = this._store.upsert({ ...ev, ...changes, id: ev.id }, { duration: this.defaultDuration }, !!ev._src);
    this._render();
    return n ? calPub(n) : null;
  }
  removeEvent(id) { const ev = this._store.remove(id); if (ev) this._render(); return ev ? calPub(ev) : null; }
  getEventById(id) { const ev = this._store.get(id); return ev ? calPub(ev) : null; }
  /** getEvents() -> stored events ; getEvents({ start, end }) -> occurrences in range (recurrences expanded) */
  getEvents(range) {
    if (!range) return this._store.all().map(e => calPub(e));
    const s = date.parse(range.start), e = date.parse(range.end);
    return s && e ? this._store.occurrences(s, e).map(o => calPub(o.ev, o)) : [];
  }
  refetch() { this._resetSource(); this._render(); }
  _resetSource() {
    this._gen++; this._ctrls.forEach(c => c.abort()); this._ctrls.clear();
    this._cache.clear(); this._pending = 0; this._setLoading(false); this.errEl.hidden = true;
    this._store.reset([], {}, true);
  }
  _setLoading(on) { this.loadEl.hidden = !on; this.toggleAttribute('aria-busy', on); this.loadEl.setAttribute('aria-label', this.t('calendar.loading')); this.emit('loading', { loading: on }); }
  _fetch(start, end) {
    const src = this.source;
    if (!src || (!isFn(src) && !isStr(src))) return;
    const keys = [];
    for (let m = calD.monthStart(start); m < end; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) keys.push(m);
    let span = null;
    const flush = () => { if (span) this._load(span.s, span.e, span.keys); span = null; };
    for (const m of keys) {
      const k = calD.key(m);
      if (this._cache.has(k)) { flush(); continue; }
      const e = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      if (span) { span.e = e; span.keys.push(k); } else span = { s: m, e, keys: [k] };
    }
    flush();
  }
  async _load(s, e, keys) {
    const gen = this._gen, ctrl = isBrowser && win.AbortController ? new AbortController() : null;
    if (ctrl) this._ctrls.add(ctrl);
    keys.forEach(k => this._cache.set(k, 'loading'));
    if (!this._pending++) this._setLoading(true);
    let ok = false;
    try {
      let res;
      const range = { start: new Date(+s), end: new Date(+e), startStr: calD.key(s), endStr: calD.key(e), signal: ctrl?.signal, view: this._type };
      if (isFn(this.source)) res = await this.source(range);
      else {
        const u = new URL(String(this.source), location.href);
        u.searchParams.set('start', range.startStr); u.searchParams.set('end', range.endStr);
        const rsp = await fetch(u, { signal: ctrl?.signal, headers: { accept: 'application/json' } });
        if (!rsp.ok) throw new Error('HTTP ' + rsp.status);
        res = await rsp.json();
      }
      if (gen !== this._gen) return;
      const list = Array.isArray(res) ? res : res?.events || res?.data || [];
      list.forEach(r => this._store.upsert(r, { duration: this.defaultDuration }, true));
      keys.forEach(k => this._cache.set(k, 'done'));
      ok = true;
    } catch (err) {
      if (gen !== this._gen || err?.name === 'AbortError') return;
      keys.forEach(k => this._cache.set(k, 'error'));
      this.errEl.replaceChildren(iconEl('alert-circle'), h('div', { class: 'o-alert-content' }, this.t('calendar.loadError')), h('button', { type: 'button', class: 'o-btn o-btn-sm o-btn-outline-danger', 'data-retry': '' }, this.t('calendar.retry')));
      this.errEl.hidden = false;
      this.emit('source-error', { error: err, start: new Date(+s), end: new Date(+e) });
    } finally {
      if (ctrl) this._ctrls.delete(ctrl);
      if (gen === this._gen) {
        if (!--this._pending) this._setLoading(false);
        if (ok) { this.errEl.hidden = this.errEl.hidden || false; this._render(); }
      }
    }
  }

  /* ── interactions ─────────────────────────────────────────────────── */
  _setSel(key) {
    this._selKey = key;
    this.querySelectorAll('.o-calendar-ev.is-selected').forEach(x => x.classList.remove('is-selected'));
    if (key) this.querySelectorAll(`.o-calendar-ev[data-key="${CSS.escape(key)}"]`).forEach(x => x.classList.add('is-selected'));
  }
  _evClickEl(e, el) {
    if (el.classList.contains('is-mirror') || el.closest('.o-calendar-ghost')) return;
    if (this._dragJustEnded()) { e.preventDefault(); return; }
    const o = this._occMap.get(el.dataset.key);
    if (!o) return;
    this._setSel(o.key);
    if (!this.emit('event-click', { event: calPub(o.ev, o), el, originalEvent: e })) return;
    if (this.popover !== false) calDetails(this, o, el);
  }
  _keydown(e) {
    if (e.defaultPrevented || e.isComposing) return;
    const t = e.target;
    if (t.closest('input, select, textarea, [contenteditable=""], [contenteditable=true], .o-rrule')) return;
    const evEl = t.closest('.o-calendar-ev');
    if (evEl && !evEl.classList.contains('is-mirror')) {
      if (calKeyMove(this, e, evEl)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.altKey) {
        const o = this._occMap.get(evEl.dataset.key);
        if (o && this._canEdit(o.ev)) { e.preventDefault(); this._deleteFlow(o); }
        return;
      }
    }
    if (!this.shortcuts || e.altKey || e.ctrlKey || e.metaKey || e.key.length !== 1) return;
    const k = e.key.toLowerCase(), vmap = { m: 'month', w: 'week', d: 'day', a: 'list', l: 'list', y: 'year' };
    if (k === 't') this.today();
    else if (k === 'n' || k === 'j') this.next();
    else if (k === 'p' || k === 'k') this.prev();
    else if (vmap[k] && this._hasView(vmap[k])) this.changeView(vmap[k], this._focusDate(), true);
    else return;
    e.preventDefault();
    announce(this.titleEl.textContent);
  }
  _focusDate() { const a = doc.activeElement, c = a?.closest?.('[data-date]'); return c ? date.parse(c.dataset.date) : null; }
  /** selection -> o-select-range -> built-in create dialog (when editable) */
  _select({ start, end, allDay, resourceId = null, anchor, source }) {
    this._pop?.close('api');
    const detail = { start: new Date(+start), end: new Date(+end), allDay: !!allDay, resourceId, view: this._type, source };
    if (!this.emit('select-range', detail)) { this._view?.clearMirror(); return; }
    if (!this.editable) { this._view?.clearMirror(); return; }
    this._view?.mirror({ start, end, allDay, resourceId, kind: 'select' });
    this._createFlow({ start, end, allDay, resourceId });
  }
  /** openEditor(event?) — create (no argument / partial) or edit (id or event) */
  openEditor(arg) {
    if (arg != null) {
      const id = isObj(arg) ? arg.id : arg, ev = id != null && this._store.get(id);
      if (ev) return this._editFlow({ key: ev.id, ev, start: ev.start, end: ev.end, occ: null });
    }
    const s = isObj(arg) && arg.start ? date.parse(arg.start) : (() => { const d = new Date(this._date); const now = new Date(); d.setHours(now.getHours() + 1, 0, 0, 0); return d; })();
    const allDay = isObj(arg) ? !!arg.allDay : false;
    const e = isObj(arg) && arg.end ? date.parse(arg.end) : allDay ? calD.add(calD.sod(s), 1) : new Date(+s + this.defaultDuration * CAL_MIN);
    return this._createFlow({ ...(isObj(arg) ? arg : {}), start: allDay ? calD.sod(s) : s, end: e, allDay });
  }
  async _createFlow(init) {
    const res = await calEditor(this, { color: this.eventColor, ...init }, { mode: 'create' });
    this._view?.clearMirror();
    if (!res || res.action !== 'save') return null;
    const raw = { id: uid('ev'), ...res.data };
    const n = calNorm(raw, { duration: this.defaultDuration });
    if (!n || !this.emit('event-create', { event: calPub(n), source: 'dialog' })) return null;
    this._store.upsert(raw, { duration: this.defaultDuration });
    this._render();
    announce(this.t('calendar.created', { title: n.title }));
    this._view?.focusEvent(n.rrule ? n.id + '@' + calOccKey(n.start, n.allDay) : n.id);
    return calPub(n);
  }
  async _editFlow(o) {
    const ev = o.ev;
    const res = await calEditor(this, { title: ev.title, start: o.start, end: o.end, allDay: ev.allDay, color: ev.color, location: ev.location, description: ev.description, rrule: ev.rrule, resourceId: ev.resourceId }, { mode: 'edit' });
    if (!res) return;
    if (res.action === 'delete') { this._deleteFlow(o); return; }
    let scope = null;
    if (ev.rrule && o.occ) { scope = await calScope(this, 'edit'); if (!scope) return; }
    const key = this._applyChange(o, res.data, scope, 'dialog');
    if (key) this._view?.focusEvent(key);
  }
  async _deleteFlow(o) {
    let scope = null;
    if (o.ev.rrule && o.occ) { scope = await calScope(this, 'delete'); if (!scope) return; }
    else if (this.confirmDelete !== false && !(await calConfirmDelete(this, o.ev))) return;
    this._applyDelete(o, scope);
  }
  /** user move / resize (asks the recurring scope) -> Promise<new occurrence key | null> */
  async _change(o, prop, { source } = {}) {
    let scope = null;
    if (o.ev.rrule && o.occ) { scope = await calScope(this, 'edit'); if (!scope) { this._render(); return null; } }
    return this._applyChange(o, { start: prop.start, end: prop.end, allDay: prop.allDay, ...(prop.resourceId !== undefined ? { resourceId: prop.resourceId } : {}) }, scope, source);
  }
  _put(raw, src) { return this._store.upsert(raw, { duration: this.defaultDuration }, src); }
  /** apply changes with a recurrence scope, emit o-event-change (cancelable, revert()) */
  _applyChange(o, ch, scope, source) {
    const snap = new Map(this._store.map), ev = o.ev, src = !!ev._src, oldEvent = calPub(ev, o);
    const fields = { ...ch };
    let target, key;
    const occKey = n => (n.rrule ? n.id + '@' + calOccKey(n.start, n.allDay) : n.id);
    if (!ev.rrule || !o.occ) {
      target = this._put({ ...ev, ...fields }, src);
      key = target.rrule ? occKey(target) : target.id;
    } else if (scope === 'this') {
      const rid = calOccKey(o.occ, ev.allDay);
      this._put({ ...ev, exdates: [...ev.exdates, rid] }, src);
      const { rrule, exdates, id, ...rest } = ev;
      target = this._put({ ...rest, ...fields, id: uid('ev'), rrule: null, exdates: [], recurringEventId: ev.id, recurrenceId: rid }, src);
      key = target.id;
    } else {
      const dd = calD.days(o.start, fields.start), ad = fields.allDay ?? ev.allDay;
      const norm = r => { try { return r ? rrToString(r) : null; } catch { return String(r); } };
      const ruleChanged = 'rrule' in fields && norm(fields.rrule) !== norm(ev.rrule);
      const shiftEx = list => list.map(x => { const d = rrDate(x); if (!d) return x; return calOccKey(ad ? calD.add(calD.sod(d), dd) : calD.at(calD.add(calD.sod(d), dd), calD.mins(fields.start)), ad); });
      const first = scope === 'all' || +o.occ === +ev.start;
      const base = first ? ev.start : o.occ;
      const ns = ad ? calD.add(calD.sod(base), dd) : calD.at(calD.add(calD.sod(base), dd), calD.mins(fields.start));
      const ne = ad ? calD.add(ns, Math.max(1, calD.days(fields.start, fields.end))) : new Date(+ns + (+fields.end - +fields.start));
      if (first) {
        const rule = ruleChanged ? fields.rrule || null : rrShiftDays(ev.rrule, dd);
        target = this._put({ ...ev, ...fields, start: ns, end: ne, rrule: rule, exdates: rule ? shiftEx(ev.exdates) : [] }, src);
      } else {
        const head = rrEndBefore(ev.rrule, ev.start, o.occ);
        if (head) this._put({ ...ev, rrule: head }, src); else this._store.remove(ev.id);
        const rest = ruleChanged ? fields.rrule || null : rrShiftDays(rrRestFrom(ev.rrule, ev.start, o.occ), dd);
        const { id, ...copy } = ev;
        target = this._put({ ...copy, ...fields, id: uid('ev'), start: ns, end: ne, rrule: rest, exdates: shiftEx(ev.exdates.filter(x => { const d = rrDate(x); return d && d >= calD.sod(o.occ); })) }, src);
      }
      const moved = ad ? calD.add(calD.sod(o.occ), dd) : calD.at(calD.add(calD.sod(o.occ), dd), calD.mins(fields.start));
      key = target.rrule ? target.id + '@' + calOccKey(moved, ad) : target.id;
    }
    let reverted = false;
    const revert = () => { if (reverted) return; reverted = true; this._store.map = new Map(snap); this._render(); };
    const occ = target.rrule ? { start: fields.start, end: fields.end, occ: fields.start } : null;
    const ok = this.emit('event-change', { event: calPub(target, occ), oldEvent, revert, scope, source });
    if (!ok) { revert(); announce(this.t('calendar.cancelled')); return null; }
    this._render();
    announce(this.t(source === 'dialog' ? 'calendar.updated' : 'calendar.moved', { title: target.title, when: calLabel(this, { ev: target, start: fields.start, end: fields.end, occ: occ?.occ }) }));
    return key;
  }
  _applyDelete(o, scope) {
    const snap = new Map(this._store.map), ev = o.ev, src = !!ev._src;
    if (!scope || scope === 'all' || (scope === 'following' && +o.occ === +ev.start)) this._store.remove(ev.id);
    else if (scope === 'this') this._put({ ...ev, exdates: [...ev.exdates, calOccKey(o.occ, ev.allDay)] }, src);
    else { const head = rrEndBefore(ev.rrule, ev.start, o.occ); if (head) this._put({ ...ev, rrule: head }, src); else this._store.remove(ev.id); }
    let reverted = false;
    const revert = () => { if (reverted) return; reverted = true; this._store.map = new Map(snap); this._render(); };
    if (!this.emit('event-delete', { event: calPub(ev, o), scope, revert })) { revert(); return false; }
    this._render();
    announce(this.t('calendar.deleted', { title: ev.title }));
    return true;
  }
  /** external draggable dropped */
  _receive(data, prop, el) {
    const { duration, days, remove, ...rest } = data;
    const raw = { ...rest, id: rest.id != null && !this._store.get(rest.id) ? String(rest.id) : uid('ev'), start: prop.start, end: prop.end, allDay: prop.allDay, resourceId: prop.resourceId ?? rest.resourceId ?? null };
    const n = calNorm(raw, { duration: this.defaultDuration });
    if (!n || !this.emit('event-create', { event: calPub(n), source: 'external', draggedEl: el })) return;
    this._store.upsert(raw, { duration: this.defaultDuration });
    this._render();
    announce(this.t('calendar.created', { title: n.title }));
  }
  /** print only this calendar (print-friendly styles) */
  print() {
    const root = doc.documentElement;
    this.classList.add('o-calendar-print-target');
    root.classList.add('o-calendar-printing');
    const done = () => { this.classList.remove('o-calendar-print-target'); root.classList.remove('o-calendar-printing'); win.removeEventListener('afterprint', done); };
    win.addEventListener('afterprint', done);
    win.print();
  }
  /** iCalendar text of the stored events (RFC 5545) */
  toICS({ name = 'Calendar' } = {}) {
    const esc2 = s => String(s ?? '').replace(/[\\;,]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
    const fd = (d, ad) => ad ? rrFmtDate(d, true) : new Date(+d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const stamp = fd(new Date());
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Orion Admin//Calendar//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + esc2(name)];
    for (const ev of this._store.all()) {
      lines.push('BEGIN:VEVENT', 'UID:' + esc2(ev.id) + '@orion', 'DTSTAMP:' + stamp,
        ev.allDay ? 'DTSTART;VALUE=DATE:' + fd(ev.start, true) : 'DTSTART:' + fd(ev.start), ev.allDay ? 'DTEND;VALUE=DATE:' + fd(ev.end, true) : 'DTEND:' + fd(ev.end),
        'SUMMARY:' + esc2(ev.title));
      if (ev.rrule) { const r = rrParse(ev.rrule); if (r.until && !r.untilDateOnly) { r.until = new Date(+r.until); } lines.push('RRULE:' + rrToString(r).replace(/UNTIL=(\d{8}T\d{6})(?!Z)/, (m, u) => 'UNTIL=' + fd(rrDate(u)))); }
      if (ev.exdates.length) lines.push((ev.allDay ? 'EXDATE;VALUE=DATE:' : 'EXDATE:') + ev.exdates.map(x => fd(rrDate(x), ev.allDay)).join(','));
      if (ev.location) lines.push('LOCATION:' + esc2(ev.location));
      if (ev.description) lines.push('DESCRIPTION:' + esc2(ev.description));
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(l => { let out = ''; while (l.length > 74) { out += l.slice(0, 74) + '\r\n '; l = l.slice(74); } return out + l; }).join('\r\n') + '\r\n';
  }
}
define('o-calendar', OCalendar);
O.FullCalendar = OCalendar;
O.calendar = (el, config = {}) => { const host = $(el); const cal = host && host.localName === 'o-calendar' ? host : h('o-calendar'); Object.assign(cal, config); if (host && host !== cal) host.append(cal); return cal; };
