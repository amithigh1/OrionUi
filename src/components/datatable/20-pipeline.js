/* ── data pipeline: filter → search → sort → group / tree → page ───────── */
const dtFilterEmpty = v => v == null || v === '' || (Array.isArray(v) && !v.length) || (isPlainObj(v) && Object.values(v).every(x => x == null || x === ''));
const dtNum = v => (v == null || v === '' ? null : isNum(+v) ? +v : fmt.parseNumber(v));
const dtFacetKey = v => String(isObj(v) ? v.label ?? v.name ?? v.value ?? '' : v ?? '');

const DT_PIPE = {
  /** Column for a filter/sort key (matches column key first, then id). */
  _colFor(k) { return this._cols.find(c => c.key === k) || this._cols.find(c => c.id === k) || null; },
  _filterKey(col) { return isStr(col.key) ? col.key : col.id; },

  /** Build one predicate per active column filter (optionally skipping one key — used for facet counts). */
  _matchers(filters, skip) {
    const ms = [];
    for (const [k, fv] of Object.entries(filters || {})) {
      if (k === skip || dtFilterEmpty(fv)) continue;
      const col = this._colFor(k);
      const get = col ? col.get : row => getPath(row, k);
      if (col && isFn(col.filterFn)) { ms.push(row => col.filterFn(get(row), fv, row)); continue; }
      const type = col?.filter || (Array.isArray(fv) ? 'multiselect' : isPlainObj(fv) ? ('from' in fv || 'to' in fv ? 'date-range' : 'number-range') : typeof fv === 'boolean' ? 'boolean' : 'text');
      if (type === 'text') {
        const q = String(fv).toLowerCase();
        ms.push(row => { const v = get(row); return v != null && (String(v).toLowerCase().includes(q) || (!!col && dtFormat(col, v, row).toLowerCase().includes(q))); });
      } else if (type === 'select' || type === 'multiselect') {
        const set = new Set(toArr(fv).map(String));
        ms.push(row => toArr(get(row)).some(v => set.has(dtFacetKey(v))));
      } else if (type === 'number-range') {
        const min = dtNum(fv.min), max = dtNum(fv.max);
        ms.push(row => { const n = dtSortKey(get(row), 'number'); return isNum(n) && (min == null || n >= min) && (max == null || n <= max); });
      } else if (type === 'date-range') {
        const from = fv.from ? +date.startOf(fv.from, 'd') : null, to = fv.to ? +date.endOf(fv.to, 'd') : null;
        ms.push(row => { const d = date.parse(get(row)); return !!d && (from == null || +d >= from) && (to == null || +d <= to); });
      } else if (type === 'boolean') {
        const b = fv === true || fv === 'true';
        ms.push(row => !!get(row) === b);
      }
    }
    return ms;
  },

  /** Lower-case text blob of a row (raw + formatted values), cached per row object. */
  _blob(row) {
    let b = this._blobs.get(row);
    if (b === undefined) {
      let s = '';
      for (const c of this._searchCols) {
        const v = c.get(row);
        if (v == null || v === '') continue;
        const f = c.render && !c.format ? '' : dtFormat(c, v, row), r = isObj(v) || Array.isArray(v) ? f : String(v);
        s += '\n' + r + (f && f !== r ? '\n' + f : '');
      }
      b = s.toLowerCase();
      this._blobs.set(row, b);
    }
    return b;
  },
  _predicate(skipFilter) {
    const words = dtWords(this.search), ms = this._matchers(this.filters, skipFilter), ext = this.filterFn;
    if (!words.length && !ms.length && !isFn(ext)) return null;
    return row => {
      if (ext && !ext(row)) return false;
      for (let i = 0; i < ms.length; i++) if (!ms[i](row)) return false;
      if (words.length) { const b = this._blob(row); for (let i = 0; i < words.length; i++) if (!b.includes(words[i])) return false; }
      return true;
    };
  },

  /** Valid sort entries: [{ col, dir }] */
  _sortSpec() {
    return toArr(this.sort).map(s => ({ col: this._colFor(s.key), dir: s.dir === 'desc' ? 'desc' : 'asc' })).filter(s => s.col && (s.col.sortable || s.col.sortFn));
  },
  /** Stable decorate-sort-undecorate; empty values always last. */
  _sortRows(rows, spec = this._sortSpec()) {
    if (!spec.length || rows.length < 2) return rows;
    const coll = dtCollator(), n = rows.length, S = spec.length;
    const keys = spec.map(s => (s.col.sortFn ? null : rows.map(r => dtSortKey(s.col.get(r), s.col.type))));
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    const cmp = (a, b) => {
      for (let s = 0; s < S; s++) {
        const sp = spec[s]; let c;
        if (sp.col.sortFn) c = sp.col.sortFn(sp.col.get(rows[a]), sp.col.get(rows[b]), rows[a], rows[b]) || 0;
        else {
          const x = keys[s][a], y = keys[s][b];
          if (x === y) continue;
          if (x == null) return 1;
          if (y == null) return -1;
          c = dtCmp(x, y, coll);
        }
        if (c) return sp.dir === 'desc' ? -c : c;
      }
      return a - b;
    };
    const out = Array.from(idx).sort(cmp);
    return out.map(i => rows[i]);
  },

  /** Client pipeline. Levels: 'filter' (recompute everything) | 'sort' | 'items'. */
  _run(level = 'filter') {
    const t0 = performance.now();
    if (this._server) { this._filtered = this._data; this._sorted = this._data; this._buildItems(); this._perf = performance.now() - t0; return; }
    if (this.tree) { this._runTree(); this._perf = performance.now() - t0; return; }
    if (level === 'filter' || !this._filtered) {
      const p = this._predicate();
      this._filtered = p ? this._data.filter(p) : this._data;
      level = 'sort';
    }
    if (level === 'sort' || !this._sorted) this._sorted = this._sortRows(this._filtered);
    this._buildItems();
    this._perf = performance.now() - t0;
  },

  /** Display items (rows and group headers). */
  _buildItems() {
    const g = this.groupBy && this._colFor(this.groupBy);
    if (!g) { this._items = this._sorted; this._groups = null; return; }
    const map = new Map();
    for (const row of this._sorted) {
      const raw = g.get(row), k = dtFacetKey(Array.isArray(raw) ? raw[0] : raw);
      let grp = map.get(k);
      if (!grp) map.set(k, (grp = { __group: true, key: 'g:' + k, value: raw, label: dtFormat(g, raw, row) || '—', rows: [], col: g }));
      grp.rows.push(row);
    }
    const s = toArr(this.sort).find(x => x.key === this.groupBy);
    const coll = dtCollator(), groups = [...map.values()];
    if (s || !toArr(this.sort).length) groups.sort((a, b) => { const x = dtSortKey(a.value, g.type), y = dtSortKey(b.value, g.type); const c = x == null ? 1 : y == null ? -1 : dtCmp(x, y, coll); return s?.dir === 'desc' ? -c : c; });
    const items = [];
    for (const grp of groups) {
      grp.count = grp.rows.length;
      grp.collapsed = this._collapsed.has(grp.key);
      items.push(grp);
      if (!grp.collapsed) for (const r of grp.rows) items.push(r);
    }
    this._groups = groups;
    this._items = items;
  },

  /* ── tree grid ── */
  _kids(row) { const k = this.tree?.childrenKey || 'children'; const c = row?.[k]; return Array.isArray(c) ? c : null; },
  _hasKids(row) {
    const k = this.tree?.childrenKey || 'children', c = row?.[k];
    if (Array.isArray(c)) return c.length > 0;
    if (isFn(this.tree?.hasChildren)) return !!this.tree.hasChildren(row);
    return c === true || (!!this.tree?.lazy && row?.hasChildren === true);
  },
  _runTree() {
    const pred = this._predicate(), spec = this._sortSpec();
    const info = new Map(), items = [], matched = new Set();
    // mark nodes that match or have a matching descendant
    const mark = (row) => { let any = !pred || pred(row); for (const c of this._kids(row) || []) if (mark(c)) any = true; if (any) matched.add(row); return any; };
    if (pred) this._data.forEach(mark);
    const walk = (list, level, parent) => {
      const vis = pred ? list.filter(r => matched.has(r)) : list;
      const sorted = this._sortRows(vis, spec);
      sorted.forEach((row, i) => {
        const key = this.keyOf(row), hasKids = this._hasKids(row), open = hasKids && (this._open.has(key) || (!!pred && this._kids(row)?.some(c => matched.has(c))));
        info.set(row, { level, parent, hasKids, open, pos: i + 1, size: sorted.length });
        items.push(row);
        if (open && this._kids(row)) walk(this._kids(row), level + 1, row);
      });
    };
    walk(this._data, 1, null);
    this._tinfo = info;
    this._filtered = pred ? [...matched] : this._flatAll();
    this._sorted = items;
    this._items = items;
    this._groups = null;
  },
  /** Every node of the tree (depth first). */
  _flatAll(list = this._data, out = []) { for (const r of list) { out.push(r); const k = this._kids(r); if (k) this._flatAll(k, out); } return out; },
  /** Descendants of a tree node (loaded ones). */
  _descendants(row, out = []) { for (const c of this._kids(row) || []) { out.push(c); this._descendants(c, out); } return out; },

  /* ── facets (value counts, respecting every other filter) ── */
  facetCounts(key) {
    if (this._server) return new Map(Object.entries(this._facets?.[key] || {}).map(([k, v]) => [k, +v]));
    const col = this._colFor(key); if (!col) return new Map();
    const p = this._predicate(key), counts = new Map();
    for (const row of this.tree ? this._flatAll() : this._data) {
      if (p && !p(row)) continue;
      for (const v of toArr(col.get(row))) { const k = dtFacetKey(v); if (k !== '') counts.set(k, (counts.get(k) || 0) + 1); }
    }
    return counts;
  },
  /** Options for select / multiselect filters: [{ value, label }] */
  filterOptions(col) {
    let o = col.filterOptions;
    if (isFn(o)) o = o(this);
    if (Array.isArray(o)) return o.map(x => (isObj(x) ? { value: String(x.value ?? x.label), label: String(x.label ?? x.value) } : { value: String(x), label: String(x) }));
    const keys = new Set();
    if (isPlainObj(col.colors)) Object.keys(col.colors).forEach(k => keys.add(k));
    if (!this._server) for (const row of this.tree ? this._flatAll() : this._data) for (const v of toArr(col.get(row))) { const k = dtFacetKey(v); if (k !== '') keys.add(k); }
    else Object.keys(this._facets?.[this._filterKey(col)] || {}).forEach(k => keys.add(k));
    if (col.type === 'boolean') return [{ value: 'true', label: t('table.yes') }, { value: 'false', label: t('table.no') }];
    const coll = dtCollator();
    return [...keys].sort((a, b) => dtCmp(dtSortKey(a, col.type), dtSortKey(b, col.type), coll)).map(k => ({ value: k, label: DT_DATES.has(col.type) ? fmt.date(k) : k }));
  },

  /** Rows shown on the current page (display items). */
  _pageItems() {
    const items = this._items || [];
    if (this._server || this.virtual || !this.pagination) return items;
    if (this.infinite) return items.slice(0, this._limit);
    const size = Math.max(1, +this.pageSize || 10), pages = Math.max(1, Math.ceil(items.length / size));
    const page = clamp(+this.page || 1, 1, pages);
    if (page !== this.page) this._p.page = page;
    return items.slice((page - 1) * size, page * size);
  },
  /** Total number of rows after filtering (server: response total). */
  get total() { return this._server ? this._total : (this._filtered || []).length; },
};
