/* ── <o-gantt> element: props, state, history, public API ─────────────── */
const G_TIER_H = 26;
const G_HISTORY = 100;
const G_ICONS = {
  indent: '<path d="M3 5h18M11 10h10M11 14h10M3 19h18"/><path d="m3 9 4 3-4 3z"/>',
  outdent: '<path d="M3 5h18M11 10h10M11 14h10M3 19h18"/><path d="m7 9-4 3 4 3z"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  diamond: '<path d="M12 3.5 20.5 12 12 20.5 3.5 12z"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
};
/** Icon from the registry, falling back to the gantt's own glyphs. */
function gIcon(name, cls = '') {
  if (O.icons?.has?.(name) && !G_ICONS[name]) return icon(name, { class: cls });
  const body = G_ICONS[name] || '';
  return raw(`<svg class="o-icon o-icon-${esc(name)} ${esc(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`);
}
/** CSS color for a task color value: token names ('primary', 'chart-3', 'success') or any CSS color. */
function gColor(c) {
  if (!c) return '';
  const s = String(c).trim();
  if (/^(primary|secondary|success|danger|warning|info|light|dark)$/.test(s)) return `var(--o-${s})`;
  if (/^chart-[1-8]$/.test(s)) return `var(--o-${s})`;
  if (/^--[\w-]+$/.test(s)) return `var(${s})`;
  return /^[#\w\s(),.%/+-]+$/.test(s) ? s : '';
}

class OGantt extends OElement {
  static props = {
    tasks: { type: Array, default: () => [] },
    view: { type: String, default: 'week' },
    start: Any,
    end: Any,
    todayLine: Boolean,
    criticalPath: Boolean,
    readonly: { type: Boolean, reflect: true },
    columns: { type: Array, default: () => null },
    gridWidth: Number,
    rowHeight: { type: Number, default: 36 },
    workingDays: { type: Array, default: () => [1, 2, 3, 4, 5] },
    holidays: { type: Array, default: () => [] },
    autoSchedule: { type: Boolean, default: true },
    baselines: { type: Boolean, default: true },
    toolbar: { type: Boolean, default: true },
    dateFormat: { type: Any, default: 'medium' },
    height: String,
    label: String,
    tooltip: Function,
    texts: Object,
  };

  /* ── lifecycle ── */
  setup() {
    this._uid = uid('gantt');
    this._recs = [];
    this._hist = { stack: [], i: 0 };
    this._collapsed = new Set();
    this._sel = null;
    this._selLink = null;
    this._dw = G_VIEW_DW[this.view] || G_VIEW_DW.week;
    this._range = { d0: gToday() - 7, d1: gToday() + 60 };
    this._ext = null;
    this._gridShown = true;
    this._win = null;
    this._keyN = new Map();
    this._cal = new GanttCalendar({ workingDays: this.workingDays, holidays: this.holidays });
    this.classList.add('o-gantt');
    if (!this.hasAttribute('role')) this.setAttribute('role', 'group');
    this._build();
    this._bindGrid();
    this._bindChart();
    this._bindKeys();
    this._bindToolbar();
    this._firstScroll = true;
  }
  connected() {
    this.listen(this._chartEl, 'scroll', () => this._onChartScroll(), { passive: true });
    this.listen(this._gridEl, 'scroll', () => this._onGridScroll(), { passive: true });
    this.addCleanup(observeResize(this, () => this._onResize()));
    this.addCleanup(observeResize(this._chartEl, () => this._onResize()));
    const tick = setInterval(() => { if (this.todayLine) this._renderToday(); }, 60000);
    this.addCleanup(() => clearInterval(tick));
    this.addCleanup(() => { this._drag?.cancel?.(); this._hideTip(); this._closeMenu(); });
    if (this._setupDone && this._recs) requestAnimationFrame(() => this.isConnected && this._onResize());
  }
  disconnected() { this._hideTip(); this._closeMenu(); }

  update(changed) {
    const all = changed.has('init');
    if (all || changed.has('label') || changed.has('locale')) this.setAttribute('aria-label', this.label || this.t('gantt.label'));
    if (changed.has('height')) this.style.setProperty('--o-gantt-h', this.height || '');
    if (all || changed.has('workingDays') || changed.has('holidays')) {
      this._cal = new GanttCalendar({ workingDays: this.workingDays, holidays: this.holidays });
      if (!changed.has('tasks') && this._recs.length) this._recs = this._recs.map(r => (r.ms ? r : { ...r, dur: Math.max(1, this._cal.count(r.s, r.e)) }));
    }
    if (changed.has('tasks')) this._load(this.tasks);
    if (changed.has('view') && !this._viewSilent) {
      const dw = G_VIEW_DW[this.view];
      if (dw && !all) this._setDayWidth(dw, null, { silent: true });
      else if (dw) this._dw = dw;
    }
    if (all || changed.has('rowHeight')) this._rh = clamp(+this.rowHeight || 36, 24, 96);
    if (all || changed.has('columns') || changed.has('locale')) this._setupColumns();
    if (all || changed.has('toolbar') || changed.has('readonly') || changed.has('locale')) this._renderToolbar();
    this.classList.toggle('is-readonly', !!this.readonly);
    this.classList.toggle('has-baselines', !!this.baselines && this._recs.some(r => r.bs != null));
    this._gridEl.setAttribute('aria-readonly', String(!!this.readonly));
    if (changed.has('locale')) this._gridV = (this._gridV || 0) + 1;
    if (changed.has('tasks') || changed.has('criticalPath') || changed.has('workingDays') || changed.has('holidays') || all) this._recompute();
    this._layout();
    if (this._firstScroll && this._recs.length && this._chartW) { this._firstScroll = false; this._initialScroll(); }
    this._render(true);
  }

  /* ── model ── */
  _load(list) {
    this._recs = gNormalize(list, this._cal);
    this._hist = { stack: [], i: 0 };
    this._collapsed = new Set(this._recs.filter(r => r.collapsed).map(r => r.key));
    this._ext = null;
    if (this._sel && !this._recs.some(r => r.key === this._sel)) this._sel = null;
    this._firstScroll = true;
    this._syncToolbar?.();
  }
  _recompute() {
    const recs = this._recs, tree = this._tree = gTree(recs), cal = this._cal;
    this._pos = gRollup(recs, tree, cal);
    this._cp = this.criticalPath && recs.length ? gCritical(recs, tree, cal, this._pos) : null;
    for (const k of [...this._collapsed]) if (!tree.byKey.has(k)) this._collapsed.delete(k);
    const rows = [], rowIndex = new Map();
    for (let i = 0; i < recs.length;) {
      const r = recs[i];
      rowIndex.set(r.key, rows.length); rows.push(r.key);
      i = this._collapsed.has(r.key) && tree.isSum(r.key) ? tree.subtreeEnd(r.key) : i + 1;
    }
    this._rows = rows; this._rowIndex = rowIndex;
    // links drawn between visible rows (hidden ends attach to their collapsed ancestor)
    const vis = k => { for (let x = k, g = 0; x != null && g < 1000; x = tree.byKey.get(x)?.parent, g++) if (rowIndex.has(x)) { let top = x; for (let p = tree.byKey.get(x)?.parent; p != null; p = tree.byKey.get(p)?.parent) if (this._collapsed.has(p)) top = p; return rowIndex.has(top) ? top : x; } return null; };
    const links = [];
    for (const r of recs) for (const d of r.deps) {
      const a = vis(d.id), b = vis(r.key);
      if (a == null || b == null || a === b) continue;
      links.push({ p: d.id, t: r.key, a, b, type: d.type, lag: d.lag, key: d.id + '>' + r.key, direct: a === d.id && b === r.key });
    }
    this._links = links;
    this._computeRange();
    this._gridV = (this._gridV || 0) + 1;
    this._barSig = null;
  }
  _keyOf(id) { if (id == null) return null; const k = String(id); return this._tree?.byKey.has(k) ? k : null; }
  _rec(k) { return this._tree.byKey.get(k); }
  _isSum(k) { return this._tree.isSum(k); }
  _posOf(k) { return this._pos.get(k) || this._rec(k); }
  _idOf(k) { return this._tree.byKey.get(k)?.id ?? k; }
  _public(k) {
    const r = this._rec(k); if (!r) return null;
    const p = this._pos.get(k);
    return gPublic(r, { s: p?.s, e: p?.e, dur: p?.dur, progress: p?.progress, idOf: x => this._idOf(x), parentId: r.parent != null ? this._idOf(r.parent) : null, collapsed: this._collapsed.has(k) });
  }
  _computeRange() {
    const dw = this._dw, vw = this._chartW || 900, ws = date.weekStart();
    let mn = Infinity, mx = -Infinity;
    for (const r of this._recs) {
      if (r.s < mn) mn = r.s; if (r.e > mx) mx = r.e;
      if (r.bs != null) { if (r.bs < mn) mn = r.bs; if (r.be > mx) mx = r.be; }
    }
    if (mn === Infinity) { mn = gToday() - 3; mx = gToday() + 30; }
    const ps = gDay(this.start), pe = gDay(this.end);
    let d0 = Math.min(mn - Math.max(2, Math.ceil(48 / dw)), ps ?? Infinity);
    let d1 = Math.max(mx + Math.max(3, Math.ceil(220 / dw)), pe != null ? pe + 1 : -Infinity);
    if (this._ext) { d0 = Math.min(d0, this._ext.d0); d1 = Math.max(d1, this._ext.d1); }
    const unit = gTiers(dw)[1];
    d0 = gUnitStart(d0, unit, ws);
    if ((d1 - d0) * dw < vw) d1 = d0 + Math.ceil(vw / dw) + 1;
    d1 = gUnitNext(gUnitStart(d1 - 1, unit, ws), unit);
    const old = this._range;
    this._range = { d0, d1 };
    if (old && old.d0 !== d0 && this._chartEl && this._layoutDone) this._shiftScroll = (this._shiftScroll || 0) + (old.d0 - d0) * dw;
  }
  _x(day) { return (day - this._range.d0) * this._dw; }
  _dayAt(x) { return this._range.d0 + x / this._dw; }
  /** Make sure a day range is inside the timeline (grows the range). */
  _ensureDays(a, b) {
    if (a >= this._range.d0 + 1 && b <= this._range.d1 - 1) return false;
    this._ext = { d0: Math.min(this._ext?.d0 ?? Infinity, a - 7), d1: Math.max(this._ext?.d1 ?? -Infinity, b + 7) };
    this._computeRange(); this._layout();
    return true;
  }

  /* ── history & commits ── */
  /**
   * Commit a new record list as ONE undoable step.
   *   opts.schedule  Set of keys the auto-scheduler starts from
   *   opts.event     { name: 'task-change', key } → cancelable event before committing
   *   opts.reason    for o-change ; opts.announce  message
   */
  _commit(next, opts = {}) {
    let recs = next;
    let pushed = [];
    if (opts.schedule && this.autoSchedule) {
      const res = gPush(recs, gTree(recs), this._cal, opts.schedule);
      if (!res.cycle) { recs = res.recs; pushed = res.moved.filter(k => !opts.schedule.has(k)); }
    }
    const prev = this._recs;
    if (recs === prev) return null;
    const entry = { before: prev, after: recs, reason: opts.reason || 'edit' };
    if (opts.event && opts.user) {
      const detail = this._eventDetail(prev, recs, opts.event.key, entry);
      if (!this.emit(opts.event.name || 'task-change', { ...detail, ...(opts.event.detail || {}) })) { this._render(true); return null; }
    }
    const h = this._hist;
    h.stack.length = h.i;
    h.stack.push(entry);
    if (h.stack.length > G_HISTORY) h.stack.shift();
    h.i = h.stack.length;
    this._recs = recs;
    this._afterChange(opts.reason || 'edit', this._changedKeys(prev, recs));
    if (opts.announce) announce(opts.announce + (pushed.length ? ' ' + this.t('gantt.pushed', { count: pushed.length }) : ''));
    else if (pushed.length) announce(this.t('gantt.pushed', { count: pushed.length }));
    return entry;
  }
  _afterChange(reason, keys) {
    this._recompute();
    this.classList.toggle('has-baselines', !!this.baselines && this._recs.some(r => r.bs != null));
    this._layout();
    this._render(true);
    this._syncToolbar();
    if (this._sel && !this._tree.byKey.has(this._sel)) this._sel = null;
    this.emit('change', { reason, ids: keys.map(k => this._idOf(k) ?? k) }, { cancelable: false });
  }
  _changedKeys(a, b) {
    const m = new Map(a.map(r => [r.key, r])), out = [];
    for (const r of b) if (m.get(r.key) !== r) out.push(r.key);
    const bk = new Set(b.map(r => r.key));
    for (const r of a) if (!bk.has(r.key)) out.push(r.key);
    return out;
  }
  _eventDetail(prev, recs, key, entry) {
    const before = new Map(prev.map(r => [r.key, r]));
    const t2 = gTree(recs), pos2 = gRollup(recs, t2, this._cal);
    const pub = (r, tr, ps) => { const p = ps.get(r.key); return gPublic(r, { s: p?.s, e: p?.e, dur: p?.dur, progress: p?.progress, idOf: x => tr.byKey.get(x)?.id ?? x, parentId: r.parent != null ? (tr.byKey.get(r.parent)?.id ?? r.parent) : null }); };
    const diff = (a, b) => { const out = {}; for (const k of Object.keys(b)) if (!equal(a[k], b[k])) out[k] = b[k]; for (const k of Object.keys(a)) if (!(k in b)) out[k] = undefined; return out; };
    const oldPos = this._pos;
    const affected = [];
    let main = null;
    for (const r of recs) {
      const o = before.get(r.key);
      if (o === r) continue;
      const now = pub(r, t2, pos2), was = o ? pub(o, this._tree, oldPos) : {};
      const item = { task: now, changes: diff(was, now), previous: was };
      if (r.key === key) main = item; else affected.push(item);
    }
    if (!main && key != null && t2.byKey.has(key)) { const now = pub(t2.byKey.get(key), t2, pos2); main = { task: now, changes: {}, previous: now }; }
    return { ...(main || { task: null, changes: {}, previous: null }), affected, revert: () => this._revert(entry) };
  }
  _revert(entry) {
    const h = this._hist;
    const i = h.stack.indexOf(entry);
    if (i < 0) return false;
    if (i === h.i - 1) { h.i--; h.stack.splice(i, 1); this._recs = entry.before; this._afterChange('revert', this._changedKeys(entry.after, entry.before)); return true; }
    // not the latest step: restore the changed records only (as a new step)
    const old = new Map(entry.before.map(r => [r.key, r])), changed = new Set(this._changedKeys(entry.before, entry.after));
    this._commit(this._recs.map(r => (changed.has(r.key) && old.has(r.key) ? old.get(r.key) : r)), { reason: 'revert' });
    return true;
  }
  /** Undo the last edit. */
  undo() {
    const h = this._hist;
    if (!h.i) return false;
    const e = h.stack[--h.i];
    this._recs = e.before;
    this._afterChange('undo', this._changedKeys(e.after, e.before));
    announce(this.t('gantt.undone'));
    return true;
  }
  /** Redo the last undone edit. */
  redo() {
    const h = this._hist;
    if (h.i >= h.stack.length) return false;
    const e = h.stack[h.i++];
    this._recs = e.after;
    this._afterChange('redo', this._changedKeys(e.before, e.after));
    announce(this.t('gantt.redone'));
    return true;
  }
  get canUndo() { return !!this._hist && this._hist.i > 0; }
  get canRedo() { return !!this._hist && this._hist.i < this._hist.stack.length; }
  clearHistory() { this._hist = { stack: [], i: 0 }; this._syncToolbar(); }

  /* ── record edits ── */
  /** Apply public-format changes to a record (returns a new record). */
  _applyChanges(rec, ch) {
    const cal = this._cal;
    let r = { ...rec };
    if ('type' in ch && G_TYPES.includes(ch.type) && ch.type !== r.type) {
      r.type = ch.type;
      if (ch.type === 'milestone' && !r.ms) { r.ms = true; r.s = r.e = r.s + 1; r.dur = 0; }
      else if (ch.type !== 'milestone' && r.ms) { r.ms = false; r.s = r.s - 1; r.e = cal.endFor(r.s, 1); }
    }
    if ('name' in ch) r.name = ch.name == null ? '' : String(ch.name);
    const s = 'start' in ch ? gDay(ch.start) : null, e = 'end' in ch ? gDay(ch.end) : null;
    if (r.ms) { const d = s ?? e; if (d != null) r.s = r.e = d + 1; }
    else {
      if (s != null) { r.s = s; if (e == null && !('duration' in ch)) r.e = cal.endFor(s, r.dur); }
      if (e != null) r.e = Math.max(r.s + 1, e + 1);
      else if ('duration' in ch && ch.duration != null && ch.duration !== '') r.e = cal.endFor(r.s, Math.max(1, Math.round(+ch.duration) || 1));
      if (r.e <= r.s) r.e = r.s + 1;
      r.dur = Math.max(1, cal.count(r.s, r.e));
    }
    if ('progress' in ch) r.progress = clamp(Math.round((+ch.progress || 0) * 10) / 10, 0, 100);
    if ('assignees' in ch || 'assignee' in ch) {
      const list = gNormAssignees(ch.assignees ?? ch.assignee);
      r.assignees = list.map(a => (isStr(a) ? rec.assignees.find(x => isObj(x) && gAssigneeName(x) === a) || a : a));
    }
    if ('color' in ch) r.color = ch.color ? String(ch.color) : '';
    if ('dependencies' in ch) r.deps = gNormDeps(ch.dependencies).filter(d => d.id !== r.key && this._tree.byKey.has(d.id));
    if ('parent' in ch) { const p = ch.parent == null || ch.parent === '' ? null : String(ch.parent); r.parent = p != null && this._tree.byKey.has(p) && p !== r.key && !this._tree.isAncestor(r.key, p) ? p : null; }
    if ('baselineStart' in ch || 'baselineEnd' in ch) {
      const bs = gDay(ch.baselineStart ?? (r.bs != null ? gISO(r.ms ? r.bs - 1 : r.bs) : null)), be = gDay(ch.baselineEnd ?? (r.be != null ? gISO(r.ms ? r.be - 1 : r.be - 1) : null));
      if (bs == null && be == null) r.bs = r.be = null;
      else { const a = bs ?? be, b = be ?? bs; if (r.ms) r.bs = r.be = a + 1; else { r.bs = a; r.be = Math.max(a + 1, b + 1); } }
    }
    if ('data' in ch) r.data = ch.data;
    const extra = Object.keys(ch).filter(k => !G_KNOWN.has(k) && k !== 'id');
    if (extra.length) { r.extra = { ...r.extra }; for (const k of extra) { if (ch[k] === undefined) delete r.extra[k]; else r.extra[k] = ch[k]; } }
    return r;
  }
  _replace(map) { return this._recs.map(r => map.get(r.key) || r); }
  /** Keys of the subtree rooted at k (k included). */
  _subtree(k) { const t = this._tree, i = t.index.get(k), j = t.subtreeEnd(k); return this._recs.slice(i, j).map(r => r.key); }

  /** Move a task (and a summary's whole subtree) by delta days. User action → events + auto-schedule. */
  _moveBy(k, delta, { user = true, snap = true } = {}) {
    if (!delta) return null;
    const cal = this._cal, dir = Math.sign(delta), map = new Map(), keys = new Set();
    for (const key of this._subtree(k)) {
      const r = this._rec(key);
      const s = snap ? gSnapStart(r, r.s + delta, dir, cal) : r.s + delta;
      map.set(key, this._isSum(key) ? { ...r, s: r.s + delta, e: r.e + delta } : gMoveTo(r, s, cal));
      if (!this._isSum(key)) keys.add(key);
    }
    return this._commit(this._replace(map), {
      user, schedule: keys, reason: 'move', event: { name: 'task-change', key: k },
      announce: this._describeDates(k, map),
    });
  }
  /** Resize: edge 'end' | 'start' by delta days. */
  _resizeBy(k, edge, delta, { user = true } = {}) {
    if (!delta || this._isSum(k)) return null;
    const r = this._rec(k), cal = this._cal;
    if (r.ms) return null;
    let { s, e } = r;
    if (edge === 'start') {
      let ns = r.s + delta;
      ns = cal.isWorking(ns) ? ns : delta > 0 ? cal.next(ns) : cal.prev(ns);
      s = Math.min(ns, r.e - 1);
    } else {
      let last = r.e - 1 + delta;
      last = cal.isWorking(last) ? last : delta > 0 ? cal.next(last) : cal.prev(last);
      e = Math.max(r.s + 1, last + 1);
    }
    if (s === r.s && e === r.e) return null;
    const nr = { ...r, s, e, dur: Math.max(1, cal.count(s, e)) };
    const map = new Map([[k, nr]]);
    return this._commit(this._replace(map), { user, schedule: new Set([k]), reason: 'resize', event: { name: 'task-change', key: k }, announce: this._describeDates(k, map) });
  }
  _setProgress(k, p, { user = true } = {}) {
    const r = this._rec(k);
    if (!r || this._isSum(k)) return null;
    p = clamp(Math.round(p), 0, 100);
    if (p === r.progress) return null;
    return this._commit(this._replace(new Map([[k, { ...r, progress: p }]])), { user, reason: 'progress', event: { name: 'task-change', key: k }, announce: this.t('gantt.progressSet', { name: r.name, progress: fmt.percent(p / 100) }) });
  }
  /** Edit public fields of a task from the UI (grid editors). */
  _userUpdate(k, ch) {
    const r = this._rec(k);
    if (!r) return null;
    if (this._isSum(k) && ('start' in ch)) { const d = gDay(ch.start); return d == null ? null : this._moveBy(k, d - this._posOf(k).s); }
    const nr = this._applyChanges(r, ch);
    if (equal(nr, r)) return null;
    const dated = nr.s !== r.s || nr.e !== r.e;
    return this._commit(this._replace(new Map([[k, nr]])), { user: true, schedule: dated ? new Set([k]) : null, reason: 'edit', event: { name: 'task-change', key: k }, announce: this.t('gantt.edited', { name: nr.name }) });
  }
  _describeDates(k, map) {
    const r = map.get(k) || this._rec(k);
    const f = n => this._fmtDate(n);
    return this.t('gantt.moved', { name: r.name, start: f(r.ms ? r.s - 1 : r.s), end: f(r.ms ? r.s - 1 : r.e - 1) });
  }
  _fmtDate(n) {
    if (n == null) return '';
    const df = this.dateFormat;
    return fmt.date(gDate(n), isObj(df) || ['short', 'medium', 'long', 'full'].includes(df) ? df : (df || 'medium'));
  }

  /* ── structure edits ── */
  _insert(rec, { parent = null, after = null } = {}) {
    const recs = this._recs.slice();
    rec = { ...rec, parent };
    let at = recs.length;
    if (after != null && this._tree.byKey.has(after)) at = this._tree.subtreeEnd(after);
    else if (parent != null && this._tree.byKey.has(parent)) at = this._tree.subtreeEnd(parent);
    recs.splice(at, 0, rec);
    return gOrder(recs);
  }
  _newRecord(task = {}) {
    const k = this._tree?.byKey.has(String(task.id)) || task.id == null || task.id === '' ? gNewId() : String(task.id);
    const sel = this._sel && this._rec(this._sel);
    const base = { name: task.name ?? this.t(task.type === 'milestone' ? 'gantt.newMilestone' : 'gantt.newTask'), ...task };
    if (base.start == null && base.end == null) base.start = gISO(sel ? this._cal.next(sel.ms ? sel.s : sel.e) : this._cal.next(gToday()));
    const rec = gNormTask(base, this._cal, k);
    rec.deps = rec.deps.filter(d => this._tree.byKey.has(d.id));
    return rec;
  }
  _indent(k, { user = true } = {}) {
    const t = this._tree, r = this._rec(k);
    if (!r) return null;
    const i = t.index.get(k), lv = t.level.get(k);
    let prev = null;
    for (let j = i - 1; j >= 0; j--) { const lj = t.level.get(this._recs[j].key); if (lj === lv) { prev = this._recs[j].key; break; } if (lj < lv) break; }
    if (prev == null) return null;
    const pr = this._rec(prev);
    const map = new Map([[k, { ...r, parent: prev }]]);
    if (r.deps.some(d => d.id === prev) || pr.deps.some(d => d.id === k)) {
      map.set(k, { ...map.get(k), deps: r.deps.filter(d => d.id !== prev) });
      map.set(prev, { ...pr, deps: pr.deps.filter(d => d.id !== k) });
    }
    this._collapsed.delete(prev);
    const res = this._commit(gOrder(this._replace(map)), { user, reason: 'indent', event: { name: 'task-change', key: k }, announce: this.t('gantt.indented', { name: r.name }) });
    return res;
  }
  _outdent(k, { user = true } = {}) {
    const t = this._tree, r = this._rec(k);
    if (!r || r.parent == null) return null;
    const parent = this._rec(r.parent);
    const recs = this._recs.slice(), i = t.index.get(k), j = t.subtreeEnd(k);
    const block = recs.splice(i, j - i);
    block[0] = { ...r, parent: parent.parent };
    const tree2 = gTree(recs), at = tree2.subtreeEnd(parent.key);
    recs.splice(at, 0, ...block);
    return this._commit(gOrder(recs), { user, reason: 'outdent', event: { name: 'task-change', key: k }, announce: this.t('gantt.outdented', { name: r.name }) });
  }
  _remove(k, { user = true } = {}) {
    const r = this._rec(k);
    if (!r) return null;
    if (user && !this.emit('task-remove', { task: this._public(k) })) return null;
    const gone = new Set(this._subtree(k));
    const parent = r.parent != null ? this._rec(r.parent) : null;
    let recs = this._recs.filter(x => !gone.has(x.key)).map(x => (x.deps.some(d => gone.has(d.id)) ? { ...x, deps: x.deps.filter(d => !gone.has(d.id)) } : x));
    if (parent && !recs.some(x => x.parent === parent.key)) { const p = this._pos.get(parent.key); recs = recs.map(x => (x.key === parent.key ? { ...x, s: p.s, e: Math.max(p.s + 1, p.e), dur: Math.max(1, this._cal.count(p.s, p.e)) } : x)); }
    const rows = this._rows, idx = this._rowIndex.get(k);
    const res = this._commit(recs, { reason: 'remove', announce: this.t('gantt.deleted', { name: r.name }) });
    if (res && this._sel && gone.has(this._sel)) {
      const next = this._rows[Math.min(idx ?? 0, this._rows.length - 1)] ?? null;
      this._setSel(next, { scroll: true });
    }
    return res;
  }
  _link(from, to, type = 'FS', lag = 0, { user = true } = {}) {
    const problem = gLinkProblem(this._recs, this._tree, from, to);
    if (problem) {
      if (user && problem !== 'exists') announce(this.t(problem === 'cycle' ? 'gantt.linkCycle' : 'gantt.linkInvalid'), 'assertive');
      if (user && problem !== 'exists') this._flash(to);
      return null;
    }
    const r = this._rec(to), link = { from: this._idOf(from), to: this._idOf(to), type, lag };
    if (user && !this.emit('link-create', { link, from: this._public(from), to: this._public(to) })) return null;
    const nr = { ...r, deps: [...r.deps, { id: from, type, lag }] };
    return this._commit(this._replace(new Map([[to, nr]])), { schedule: new Set([to]), reason: 'link', announce: user ? this.t('gantt.linkCreated', { from: this._rec(from).name, to: r.name }) : null });
  }
  _unlink(from, to, { user = true } = {}) {
    const r = this._rec(to);
    if (!r || !r.deps.some(d => d.id === from)) return null;
    const dep = r.deps.find(d => d.id === from);
    const link = { from: this._idOf(from), to: this._idOf(to), type: dep.type, lag: dep.lag };
    if (user && !this.emit('link-delete', { link, from: this._public(from), to: this._public(to) })) return null;
    if (this._selLink === from + '>' + to) this._selLink = null;
    return this._commit(this._replace(new Map([[to, { ...r, deps: r.deps.filter(d => d.id !== from) }]])), { reason: 'unlink', announce: user ? this.t('gantt.linkDeleted', { from: this._rec(from)?.name, to: r.name }) : null });
  }

  /* ── selection & expansion ── */
  _setSel(k, { scroll = false, emit = true, focus = false, announce: say = false } = {}) {
    if (k != null && !this._tree.byKey.has(k)) k = null;
    const changed = k !== this._sel;
    const hadLink = this._selLink != null;
    this._sel = k;
    this._selLink = null;
    if (k != null && !this._rowIndex.has(k)) this._expandTo(k);
    if (this._act && k != null && this._act.k !== k) this._act = { k, c: this._act.c };
    this._renderSel();
    this._render(changed || hadLink);
    if (scroll && k != null) this._scrollRowIntoView(k);
    if (focus) this._focusGrid();
    this._syncToolbar();
    if (changed && emit) this.emit('select', { id: k == null ? null : this._idOf(k), task: k == null ? null : this._public(k) }, { cancelable: false });
    if (changed && say && k != null) announce(this._rowLabel(k));
  }
  _expandTo(k) {
    let changed = false;
    for (let p = this._rec(k)?.parent; p != null; p = this._rec(p)?.parent) if (this._collapsed.delete(p)) changed = true;
    if (changed) { this._recompute(); this._layout(); }
  }
  _toggle(k, force) {
    if (!this._isSum(k)) return;
    const collapse = force == null ? !this._collapsed.has(k) : !force;
    if (collapse === this._collapsed.has(k)) return;
    if (collapse) this._collapsed.add(k); else this._collapsed.delete(k);
    if (collapse && this._sel && this._tree.isAncestor(k, this._sel)) this._sel = k;
    this._recompute(); this._layout(); this._render(true);
    this.emit(collapse ? 'collapse' : 'expand', { id: this._idOf(k), task: this._public(k) }, { cancelable: false });
    announce(this.t(collapse ? 'gantt.collapsed' : 'gantt.expanded'));
  }
  _rowLabel(k) {
    const r = this._rec(k), p = this._posOf(k);
    if (r.ms) return this.t('gantt.milestoneLabel', { name: r.name, start: this._fmtDate(r.s - 1) });
    return this.t('gantt.rowLabel', { name: r.name, start: this._fmtDate(p.s), end: this._fmtDate(p.e - 1), progress: fmt.percent((p.progress || 0) / 100) })
      + (this._cp?.critical.has(k) ? ', ' + this.t('gantt.critical') : '');
  }
  _flash(k) {
    const el = this._barEls?.get(k)?.querySelector('.o-gantt-bar');
    if (el) animate(el, 'shake', { duration: 320 });
  }

  /* ── public API ── */
  /** getTasks() -> public task objects in tree order (dates as 'YYYY-MM-DD'). */
  getTasks() { return this._tree ? this._recs.map(r => this._public(r.key)) : O.gantt.normalize(this.tasks, { workingDays: this.workingDays, holidays: this.holidays }); }
  /** getTask(id) -> task | null */
  getTask(id) {
    if (!this._tree) return this.getTasks().find(t => String(t.id) === String(id)) || null;
    const k = this._keyOf(id);
    return k == null ? null : this._public(k);
  }
  /** addTask(task, { parent, after, select }) -> id (undoable, auto-scheduled). */
  addTask(task = {}, opts = {}) {
    const rec = this._newRecord(task);
    const parent = this._keyOf(opts.parent ?? task.parent);
    const after = this._keyOf(opts.after);
    const res = this._commit(this._insert(rec, { parent, after }), { schedule: new Set([rec.key]), reason: 'add', user: !!opts.user, announce: opts.user ? this.t('gantt.added', { name: rec.name }) : null });
    if (!res) return null;
    if (opts.select !== false) this._setSel(rec.key, { scroll: true, emit: !!opts.user });
    return rec.id;
  }
  /** updateTask(id, changes, { schedule = true }) -> boolean (undoable, no events). */
  updateTask(id, changes = {}, { schedule = true } = {}) {
    const k = this._keyOf(id);
    if (k == null) return false;
    if (this._isSum(k) && changes.start != null && Object.keys(changes).length === 1) return !!this._moveBy(k, gDay(changes.start) - this._posOf(k).s, { user: false });
    const r = this._rec(k), nr = this._applyChanges(r, changes);
    let recs = this._replace(new Map([[k, nr]]));
    if ('parent' in changes) recs = gOrder(recs);
    return !!this._commit(recs, { schedule: schedule && (nr.s !== r.s || nr.e !== r.e || 'dependencies' in changes) ? new Set([k]) : null, reason: 'update' });
  }
  /** removeTask(id) -> boolean (removes its subtask and links, undoable). */
  removeTask(id) { const k = this._keyOf(id); return k != null && !!this._remove(k, { user: false }); }
  /** addLink(from, to, type = 'FS', lag = 0) -> boolean */
  addLink(from, to, type = 'FS', lag = 0) { const a = this._keyOf(from), b = this._keyOf(to); return a != null && b != null && !!this._link(a, b, G_LINK_TYPES.includes(type) ? type : 'FS', +lag || 0, { user: false }); }
  /** removeLink(from, to) -> boolean */
  removeLink(from, to) { const a = this._keyOf(from), b = this._keyOf(to); return a != null && b != null && !!this._unlink(a, b, { user: false }); }
  indent(id) { const k = this._keyOf(id ?? this._idOf(this._sel)); return k != null && !!this._indent(k, { user: false }); }
  outdent(id) { const k = this._keyOf(id ?? this._idOf(this._sel)); return k != null && !!this._outdent(k, { user: false }); }
  /** Re-run auto-scheduling over every task (one undoable step). */
  schedule() {
    const res = gPush(this._recs, this._tree, this._cal, null);
    if (res.cycle) throw new Error('[Orion] o-gantt: dependency loop between ' + res.cycle.map(k => this._idOf(k)).join(', '));
    this._commit(res.recs, { reason: 'schedule' });
    return res.moved.map(k => this._idOf(k));
  }
  /** Ids of the tasks on the critical path (computed even when the highlight is off). */
  getCriticalPath() {
    if (!this._tree) return O.gantt.criticalPath(this.tasks, { workingDays: this.workingDays, holidays: this.holidays }).tasks;
    const cp = this._cp || gCritical(this._recs, this._tree, this._cal, this._pos);
    return this._recs.filter(r => cp.critical.has(r.key)).map(r => r.id);
  }
  select(id) { this._setSel(this._keyOf(id), { scroll: true, emit: false }); }
  getSelected() { return this._sel == null || !this._tree ? null : this._public(this._sel); }
  expand(id) { const k = this._keyOf(id); if (k != null) this._toggle(k, true); }
  collapse(id) { const k = this._keyOf(id); if (k != null) this._toggle(k, false); }
  toggle(id) { const k = this._keyOf(id); if (k != null) this._toggle(k); }
  expandAll() { this._collapsed.clear(); this._recompute(); this._layout(); this._render(true); }
  collapseAll() { for (const r of this._recs) if (this._isSum(r.key)) this._collapsed.add(r.key); if (this._sel && !this._rowIndex.has(this._sel)) this._sel = null; this._recompute(); this._layout(); this._render(true); }
  /** scrollToTask(id, { select = true }) — expands its group and scrolls the row and the bar into view. */
  scrollToTask(id, { select = true, behavior } = {}) {
    const k = this._keyOf(id);
    if (k == null) return false;
    this._expandTo(k);
    if (select) this._setSel(k, { emit: false });
    this._scrollRowIntoView(k, true);
    const p = this._posOf(k);
    this._scrollToX(this._x(p.s) - Math.min(120, this._chartW * 0.2), behavior);
    return true;
  }
  /** setView('day' | 'week' | 'month' | 'quarter' | 'year') */
  setView(view) { if (G_VIEW_DW[view]) { this.view = view; this._setDayWidth(G_VIEW_DW[view]); } }
  zoomIn() { const i = G_VIEWS.indexOf(gViewFor(this._dw)); const cur = G_VIEW_DW[G_VIEWS[i]]; this.setView(this._dw < cur * 0.97 ? G_VIEWS[i] : G_VIEWS[Math.max(0, i - 1)]); }
  zoomOut() { const i = G_VIEWS.indexOf(gViewFor(this._dw)); const cur = G_VIEW_DW[G_VIEWS[i]]; this.setView(this._dw > cur * 1.03 ? G_VIEWS[i] : G_VIEWS[Math.min(G_VIEWS.length - 1, i + 1)]); }
  /** Current pixels per day (continuous zoom level). */
  get zoom() { return this._dw ?? G_VIEW_DW[this.view] ?? G_VIEW_DW.week; }
  set zoom(v) { this._setDayWidth(+v); }
  scrollToToday(behavior) { this.scrollToDate(new Date(), behavior); }
  scrollToDate(d, behavior) {
    const n = gDay(d);
    if (n == null) return;
    this._ensureDays(n, n + 1);
    this._scrollToX(this._x(n) - this._chartW * 0.3, behavior);
  }
  /** Re-render everything (after changing CSS that affects sizes). */
  refresh() { this._recompute(); this._layout(); this._render(true); }
}
