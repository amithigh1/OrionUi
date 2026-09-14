/* ── <o-datatable> element: props, lifecycle, update orchestration, core API ── */
class ODataTable extends OElement {
  static props = {
    rows: { type: Array, default: () => [] },
    columns: { type: Array, default: () => [] },
    source: Function,
    url: String,
    mapResponse: Function,
    fetchOptions: Object,
    rowKey: { type: String, default: 'id' },
    page: { type: Number, default: 1 },
    pageSize: { type: Number, default: 10 },
    pageSizes: { type: Array, default: () => [10, 25, 50, 100] },
    pagination: { type: Boolean, default: true },
    sort: { type: Array, default: () => [] },
    sortable: { type: Boolean, default: true },
    multiSort: { type: Boolean, default: true },
    search: { type: String, default: '' },
    searchable: { type: Boolean, default: true },
    searchDebounce: { type: Number, default: 250 },
    filters: { type: Object, default: () => ({}) },
    filterable: Boolean,
    filterRow: Boolean,
    filterFn: Function,
    selectable: { type: String, default: '' },
    selectOnClick: Boolean,
    bulkActions: { type: Array, attr: false, default: () => [] },
    rowActions: { type: Array, attr: false, default: () => [] },
    editable: Boolean,
    editMode: { type: String, default: 'cell' },
    onSave: Function,
    detail: Function,
    tree: Object,
    groupBy: { type: String, default: '' },
    virtual: Boolean,
    rowHeight: Number,
    height: String,
    infinite: Boolean,
    responsive: { type: String, default: 'scroll', reflect: true },
    density: { type: String, default: 'normal', reflect: true },
    striped: Boolean,
    hover: { type: Boolean, default: true },
    bordered: Boolean,
    stickyHeader: { type: Boolean, default: true },
    stickyOffset: { type: Number, default: 0 },
    resizable: { type: Boolean, default: true },
    reorderable: { type: Boolean, default: true },
    aggregates: { type: Boolean, default: true },
    stateKey: String,
    views: Array,
    toolbar: { type: Any, default: true },
    importable: Boolean,
    exportFilename: { type: String, default: 'export' },
    rowClass: Function,
    label: String,
    emptyText: String,
    loading: { type: Boolean, reflect: true },
    texts: Object,
  };

  constructor() {
    super();
    this._uidc = uid('o-dt');
    this._cols = []; this._vis = []; this._order = null; this._hidden = new Set(); this._widths = {}; this._colById = new Map();
    this._data = []; this._filtered = null; this._sorted = null; this._items = []; this._groups = null; this._tinfo = null; this._searchCols = [];
    this._blobs = new WeakMap(); this._autoKeys = new WeakMap(); this._autoKey = 0; this._byKey = new Map();
    this._sel = new Map(); this._open = new Set(); this._expanded = new Set(); this._collapsed = new Set(); this._details = new Map();
    this._dirty = new Map(); this._undo = []; this._lazyLoading = new Set();
    this._server = false; this._total = 0; this._reqId = 0; this._limit = 0; this._facets = null; this._aggs = null;
    this._active = { key: null, col: null };
    this._selCol = dtSpecial('__select', 44);
    this._expCol = dtSpecial('__expand', 40);
  }

  /** 'multi' | 'single' | '' */
  get _selMode() {
    const v = this.selectable;
    if (v === 'single') return 'single';
    if (v === 'multi' || v === 'true' || (v === '' && this.hasAttribute('selectable'))) return 'multi';
    return '';
  }
  get _ownScroll() { return !!(this.height || this.virtual); }

  setup() {
    this.classList.add('o-datatable', this._uidc);
    const slotted = [...this.children].filter(el => el.getAttribute('slot') === 'toolbar');
    this._style = h('style');
    this._toolbar = h('div', { class: 'o-dt-toolbar', role: 'toolbar' });
    this._bulk = h('div', { class: 'o-dt-bulk', role: 'region', hidden: true });
    this._chips = h('div', { class: 'o-dt-chips', hidden: true });
    this._bar = h('div', { class: 'o-dt-loadbar', hidden: true, role: 'progressbar', 'aria-label': this.t('table.loading') });
    this._colgroup = h('colgroup');
    this._thead = h('thead', { class: 'o-dt-thead' });
    this._tbody = h('tbody', { class: 'o-dt-tbody' });
    this._tfoot = h('tfoot', { class: 'o-dt-tfoot', hidden: true });
    this._table = h('table', { class: 'o-table o-dt-table', role: 'grid' }, this._colgroup, this._thead, this._tbody, this._tfoot);
    this._sentinel = h('div', { class: 'o-dt-sentinel', 'aria-hidden': 'true' });
    this._scroll = h('div', { class: 'o-dt-scroll o-scroll' }, this._table, this._sentinel);
    this._wrap = h('div', { class: 'o-dt-wrap' }, this._bar, this._scroll);
    this._info = h('div', { class: 'o-dt-info', 'aria-live': 'polite' });
    this._pagerSlot = h('div', { class: 'o-dt-pager' });
    this._footer = h('div', { class: 'o-dt-footer' }, this._info, this._pagerSlot);
    this.replaceChildren(this._style, this._toolbar, this._bulk, this._chips, this._wrap, this._footer);
    this._buildToolbar(slotted);
    this._bind();
  }

  connected() {
    this.addCleanup(observeResize(this._scroll, rafThrottle(r => { if (Math.abs((this._lastW || 0) - r.width) > 0.5) { this._lastW = r.width; this._onResize(); } })));
    this.listen(win, 'scroll', rafThrottle(() => this._pageSticky()), { passive: true, capture: true });
    this.listen(win, 'resize', rafThrottle(() => this._pageSticky()));
    const mo = new MutationObserver(muts => { for (const m of muts) m.addedNodes.forEach(n => { if (n.nodeType === 1 && n.getAttribute('slot') === 'toolbar') this._slot(n); }); });
    mo.observe(this, { childList: true });
    this.addCleanup(() => mo.disconnect());
    if (this.infinite) this._watchInfinite();
    if (this._needsFetch) this._fetch();
  }
  disconnected() { this._closePanel?.(); this._stopInfinite?.(); }

  update(changed) {
    const has = k => changed.has(k), init = has('init');
    if (init) this._restoreState();
    const cols = init || ['columns', 'rowActions', 'selectable', 'detail', 'editable', 'editMode', 'filterable', 'filterRow', 'sortable', 'multiSort', 'resizable', 'reorderable', 'locale', 'tree', 'responsive', 'texts'].some(has);
    const data = init || has('rows') || has('source') || has('url') || has('mapResponse');
    const filt = has('search') || has('filters') || has('filterFn');
    const sorted = has('sort'), grouped = has('groupBy');
    const paged = has('page') || has('pageSize') || has('pagination') || has('virtual') || has('infinite');
    if (has('locale')) this._blobs = new WeakMap();
    if (cols) this._initColumns();
    this._applyLook();
    if (init || has('toolbar') || has('searchable') || has('importable') || has('stateKey') || has('locale') || has('filterable') || has('columns') || has('source') || has('url') || has('texts')) this._syncToolbar();
    if (data) this._setSource();
    if (filt && !data && !has('page')) this._p.page = 1;
    if (data || filt || has('pageSize') || has('infinite')) this._limit = Math.max(1, +this.pageSize || 10);
    if (this._server) {
      if (data || filt || sorted || paged) this._fetch();
      else if (grouped || cols) this._run();
    } else if (data || cols || filt || has('tree')) this._run('filter');
    else if (sorted) this._run('sort');
    else if (grouped) this._run('items');
    if (cols || grouped) this._renderHead(); else if (sorted || filt) this._syncHead();
    this._layout();
    this._render();
    if (!init && (filt || sorted || grouped || cols || has('pageSize') || has('density'))) this._persist();
    if (has('infinite') && this.isConnected) this._watchInfinite();
    if (init) { this._inited = true; const q = this._readyQ; this._readyQ = null; q?.forEach(fn => { try { fn(); } catch (e) { console.error('[Orion] datatable', e); } }); }
  }
  /** Run fn now when initialised, otherwise right after the first update (API calls made before upgrade/connection). */
  _whenReady(fn) { if (this._inited) return fn(); (this._readyQ ||= []).push(fn); return undefined; }

  /* ── columns ── */
  _initColumns() {
    let defs = toArr(this.columns);
    if (!defs.length && Array.isArray(this.rows) && this.rows.length && isObj(this.rows[0])) {
      const r0 = this.rows[0];
      defs = Object.keys(r0).filter(k => !isObj(r0[k]) || r0[k] instanceof Date).map(k => ({ key: k, type: isNum(r0[k]) ? 'number' : r0[k] instanceof Date ? 'date' : typeof r0[k] === 'boolean' ? 'boolean' : 'text' }));
    }
    const cols = defs.map((d, i) => dtColumn(d, i, this));
    if ((toArr(this.rowActions).length || (this.editMode === 'row' && cols.some(c => c.editable))) && !cols.some(c => c.type === 'actions')) cols.push(dtColumn({ type: 'actions', title: '' }, cols.length, this));
    const fresh = !this._colsInit;
    this._colsInit = true;
    const prevIds = new Set(this._cols.map(c => c.id));
    this._cols = cols;
    this._colById = new Map(cols.map(c => [c.id, c]));
    for (const c of cols) if (c.hidden && (fresh || !prevIds.has(c.id)) && !this._userHidden) this._hidden.add(c.id);
    this._searchCols = cols.filter(c => c.searchable);
    this._blobs = new WeakMap();
    this._computeVisible();
  }
  /** Ordered visible columns incl. checkbox / expander: frozen-start, normal, frozen-end. */
  _computeVisible() {
    const ids = this._cols.map(c => c.id);
    const order = this._order ? [...this._order.filter(id => this._colById.has(id)), ...ids.filter(id => !this._order.includes(id))] : ids;
    const data = order.map(id => this._colById.get(id)).filter(c => !this._hidden.has(c.id) && !this._prio?.has(c.id));
    const start = data.filter(c => c.frozen === 'start'), end = data.filter(c => c.frozen === 'end'), mid = data.filter(c => !c.frozen);
    const sp = [];
    if (this._selMode) sp.push(this._selCol);
    if (this.detail || this._prio?.size) sp.push(this._expCol);
    sp.forEach(c => { c.frozen = start.length ? 'start' : null; });
    this._vis = [...sp, ...start, ...mid, ...end];
    this._dataVis = this._vis.filter(c => !c.special);
    this._treeCol = this.tree ? this._dataVis.find(c => c.type !== 'actions') : null;
  }
  /** Column order as ids (data columns only). */
  get columnOrder() { return this._order ? [...this._order] : this._cols.map(c => c.id); }

  _applyLook() {
    const rh = this.rowHeight || DT_ROW_H[this.density] || DT_ROW_H.normal;
    this.style.setProperty('--o-dt-row-h', rh + 'px');
    this.classList.toggle('is-striped', !!this.striped);
    this.classList.toggle('is-hover', !!this.hover);
    this.classList.toggle('is-bordered', !!this.bordered);
    this.classList.toggle('is-virtual', !!this.virtual);
    this.classList.toggle('is-tree', !!this.tree);
    this.classList.toggle('is-own-scroll', this._ownScroll);
    this.classList.toggle('is-sticky', !!this.stickyHeader);
    this._scroll.style.height = this.virtual ? (this.height || '30rem') : '';
    this._scroll.style.maxHeight = !this.virtual && this.height ? this.height : '';
    const tb = this._table;
    tb.setAttribute('role', this.tree ? 'treegrid' : 'grid');
    tb.setAttribute('aria-label', this.label || this.getAttribute('aria-label') || this.t('table.label'));
    if (this._selMode === 'multi') tb.setAttribute('aria-multiselectable', 'true'); else tb.removeAttribute('aria-multiselectable');
    if (!this.stickyHeader || this._ownScroll) this._table.style.removeProperty('--o-dt-sy');
  }

  /* ── data source ── */
  _setSource() {
    this._server = !!(this.source || this.url);
    this._filtered = this._sorted = null;
    this._blobs = new WeakMap();
    if (this._server) { this._data = this._data && this._wasServer ? this._data : []; this._wasServer = true; return; }
    this._wasServer = false;
    this._data = Array.isArray(this.rows) ? this.rows : [];
    this._reindex();
  }
  _reindex() {
    const m = new Map();
    for (const r of this.tree ? this._flatAll() : this._data) m.set(this.keyOf(r), r);
    this._byKey = m;
  }
  /** Row key (string): row[rowKey] or a stable generated key. */
  keyOf(row) {
    if (row == null) return null;
    const k = getPath(row, this.rowKey || 'id');
    if (k != null && k !== '') return String(k);
    let a = this._autoKeys.get(row);
    if (!a) this._autoKeys.set(row, (a = '~' + (++this._autoKey)));
    return a;
  }
  /** Find a row by key, row object or index in the current view. */
  rowOf(ref) {
    if (ref == null) return null;
    if (isObj(ref)) return ref;
    return this._byKey.get(String(ref)) || null;
  }

  /* ── public API ── */
  /** Replace client rows. */
  setRows(rows) { this.rows = toArr(rows); this.flush(); return this; }
  /** Re-run the pipeline (client) or re-fetch (server). */
  reload() { if (this._server) return this._fetch(); this._blobs = new WeakMap(); this._reindex(); this._run('filter'); this._render(); return Promise.resolve(); }
  /** Re-render after mutating row objects in place. */
  refresh() { return this.reload(); }
  /** getRows({ filtered, selected, page, sorted }) */
  getRows(o = {}) {
    if (o.selected) return this.getSelected();
    if (o.page) return this._pageItems().filter(r => !r.__group);
    if (o.filtered || o.sorted) return [...(this._sorted || this._filtered || [])];
    return this.tree ? this._flatAll() : [...this._data];
  }
  getSelected() { return [...this._sel.values()]; }
  /** Query sent to server sources: { page, pageSize, sort, search, filters } */
  getQuery() {
    const filters = {};
    for (const [k, v] of Object.entries(this.filters || {})) if (!dtFilterEmpty(v)) filters[k] = v;
    return { page: +this.page || 1, pageSize: +this.pageSize || 10, sort: toArr(this.sort).map(s => ({ key: s.key, dir: s.dir === 'desc' ? 'desc' : 'asc' })), search: this.search || '', filters };
  }
  setSearch(q) { q = String(q ?? ''); if (q === this.search) return; this.search = q; this.emit('search', { search: q }); }
  setFilter(key, value) {
    const f = { ...(this.filters || {}) };
    if (dtFilterEmpty(value)) delete f[key]; else f[key] = value;
    this.filters = f;
    this.emit('filter', { filters: f, key, value });
  }
  clearFilters({ search = true } = {}) { this.filters = {}; if (search) this.search = ''; this.emit('filter', { filters: {} }); }
  /** setSort('name', 'desc') | setSort([{ key, dir }]) | setSort(null) */
  setSort(key, dir = 'asc') {
    const s = Array.isArray(key) ? key : key ? [{ key, dir }] : [];
    this.sort = s;
    this.emit('sort', { sort: s });
  }
  goToPage(n) {
    const pages = this.pageCount;
    n = clamp(Math.round(+n || 1), 1, pages);
    if (n === this.page) return;
    this.page = n;
    this.emit('page', { page: n, pageSize: this.pageSize });
  }
  get pageCount() { return Math.max(1, Math.ceil((this._server ? this._total : (this._items || []).length) / Math.max(1, +this.pageSize || 10))); }
  /** addRow(row, { at: 'start' | 'end' | index }) — client mode */
  addRow(row, { at = 'end' } = {}) {
    const rows = [...this._data];
    if (at === 'start') rows.unshift(row); else if (isNum(at)) rows.splice(at, 0, row); else rows.push(row);
    this._mutate(rows);
    announce(this.t('table.showingRows', { total: fmt.number(rows.length) }));
    return row;
  }
  /** updateRow(keyOrRow, patch) — merges the patch into the row object and re-renders it */
  updateRow(ref, patch = {}) {
    const row = this.rowOf(ref); if (!row) return null;
    for (const [k, v] of Object.entries(patch)) setPath(row, k, v);
    this._blobs.delete(row);
    if (this._server) this._renderRows([row]); else { this._run('filter'); this._render(); }
    return row;
  }
  /** removeRow(keyOrRow | array) */
  removeRow(ref) {
    const kill = new Set(toArr(ref).map(r => this.keyOf(this.rowOf(r))).filter(Boolean));
    kill.forEach(k => { this._sel.delete(k); this._details.delete(k); this._dirty.delete(k); });
    if (this._server) { this._data = this._data.filter(r => !kill.has(this.keyOf(r))); this._total = Math.max(0, this._total - kill.size); this._reindex(); this._run(); this._render(); }
    else this._mutate(this._data.filter(r => !kill.has(this.keyOf(r))));
    this._emitSelect();
  }
  _mutate(rows) { this._p.rows = rows; this._data = rows; this._reindex(); this._blobs = new WeakMap(); this._run('filter'); this._render(); }
  focus(opts) { (this._tbody.querySelector('[tabindex="0"]') || this._thead.querySelector('[tabindex="0"]') || this._thead.querySelector('th'))?.focus(opts); }
}
