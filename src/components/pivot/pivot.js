// @deps exporter
/* <o-pivot> — pivot table with a drag & drop field list (data package).
 *
 *   <o-pivot id="pv"></o-pivot>
 *   pv.data = records;                     // array of objects
 *   pv.config = { rows: ['region', 'country'], columns: ['year'], values: [{ field: 'sales', agg: 'sum', format: 'currency' }],
 *                 filters: { channel: ['Online'] }, sort: { rows: { by: 'label' | 'value', dir: 'asc' | 'desc', value: 0, col: [] } },
 *                 showTotals: true, showSubtotals: true, heatmap: true, collapsed: { rows: [[..path]], columns: [] } };
 *   Props: data, config, fields ([{ key, label, type, get(record), format }]), field-list (true), editable (true), view ('table'|'chart'),
 *          max-rows (2000 rendered rows), texts
 *   agg: 'sum' | 'count' | 'avg' | 'min' | 'max' | 'distinct' | fn(values, records) ; format: 'number' | 'integer' | 'currency' |
 *        'percent' | 'compact' | Intl.NumberFormat options | fn(value). Date fields also offer 'field:year' | ':quarter' | ':month'.
 *   Events: o-change { config } (user changed the layout) · o-cell-click { row, column, value, valueField, records }
 *   Methods: setData(data), setConfig(config), getConfig(), getResult(), export('csv' | 'xlsx', opts) -> Promise<Blob>,
 *            refresh(), expandAll(), collapseAll(), toggleFieldList(force)
 *   Engine: O.pivot.compute(data, config, fields) -> result (pure, no DOM)  — 100k records aggregate in well under 300 ms.
 * Keyboard: field chips — Enter/Space opens the move menu (Rows / Columns / Values / Filters / up / down / remove),
 *   Alt+ArrowUp/Down reorders, Delete removes; group toggles and sort headers are buttons.
 */

i18n.add('en', {
  pivot: {
    fields: 'Fields', rows: 'Rows', columns: 'Columns', values: 'Values', filters: 'Filters', searchFields: 'Search fields…',
    dropHere: 'Drag fields here', total: 'Total', grandTotal: 'Grand total', subtotal: '{label} total', blank: '(blank)', valueLabel: '{agg} of {field}',
    agg: { sum: 'Sum', count: 'Count', avg: 'Average', min: 'Min', max: 'Max', distinct: 'Distinct count', custom: 'Custom' },
    moveTo: 'Move to {zone}', addTo: 'Add to {zone}', moveUp: 'Move up', moveDown: 'Move down', remove: 'Remove', filter: 'Filter…',
    filterBy: 'Filter {field}', selectAll: 'Select all', noValues: 'No matching values', moreValues: '{count} more — refine the search',
    filterSummary: '{selected} of {total}', table: 'Table', chart: 'Chart', expandAll: 'Expand all', collapseAll: 'Collapse all',
    export: 'Export', csv: 'CSV', xlsx: 'Excel', expand: 'Expand {label}', collapse: 'Collapse {label}', sortBy: 'Sort by {label}',
    empty: 'Drag a field to Rows, Columns or Values to build the pivot table.', noData: 'No records match the current filters.',
    low: 'Low', high: 'High', showFields: 'Show fields', hideFields: 'Hide fields', aggregation: 'Aggregation for {field}',
    truncated: 'Showing the first {count} rows. Collapse groups or add filters to see more.', fieldMenu: '{field} options', moved: '{field} moved to {zone}',
    year: 'Year', quarter: 'Quarter', month: 'Month', day: 'Day', options: 'Field options',
  },
});

const ZONES = ['filters', 'columns', 'rows', 'values'];
const AGGS = ['sum', 'count', 'avg', 'min', 'max', 'distinct'];
const SEP = '\u{1}';
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const humanize = k => (O.export?.humanize ? O.export.humanize(k) : String(k));

/* ── engine ───────────────────────────────────────────────────────────── */
function fieldDefs(data, fields) {
  const defs = new Map();
  if (fields?.length) fields.forEach(f => { const d = isStr(f) ? { key: f } : { ...f }; defs.set(d.key, { label: humanize(d.key), ...d }); });
  const sample = toArr(data).slice(0, 300);
  const keys = new Set();
  sample.forEach(r => isObj(r) && Object.keys(r).forEach(k => keys.add(k)));
  for (const k of keys) {
    if (defs.has(k) && defs.get(k).type) continue;
    let type = null;
    for (const r of sample) {
      const v = r?.[k];
      if (v == null || v === '') continue;
      const tv = v instanceof Date ? 'date' : typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v)) ? 'date' : 'string';
      type = type == null || type === tv ? tv : 'string';
      if (type === 'string') break;
    }
    if (!fields?.length || defs.has(k)) defs.set(k, { label: humanize(k), ...(defs.get(k) || {}), key: k, type: defs.get(k)?.type || type || 'string' });
  }
  for (const d of [...defs.values()]) {
    if (d.type !== 'date' || d.derived) continue;
    for (const part of ['year', 'quarter', 'month']) {
      const key = `${d.key}:${part}`;
      if (!defs.has(key)) defs.set(key, { key, label: `${d.label} (${t('pivot.' + part)})`, type: part === 'year' ? 'number' : 'string', derived: part, base: d.key });
    }
  }
  return defs;
}
function getter(key, defs) {
  const d = defs.get(key);
  if (d?.get) return d.get;
  if (d?.derived) {
    const base = d.base, part = d.derived;
    return r => {
      const v = r[base], dt = v instanceof Date ? v : v == null || v === '' ? null : date.parse(v);
      if (!dt) return null;
      if (part === 'year') return dt.getFullYear();
      if (part === 'quarter') return 'Q' + (Math.floor(dt.getMonth() / 3) + 1);
      return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
    };
  }
  return key.includes('.') ? r => getPath(r, key) : r => r[key];
}
const dimKey = v => (v == null || v === '' ? '' : v instanceof Date ? date.toISODate(v) : String(v));
function normConfig(c = {}) {
  const val = v => (isStr(v) ? { field: v, agg: 'sum' } : { agg: 'sum', ...v });
  return {
    rows: toArr(c.rows).map(r => (isObj(r) ? r.field : r)), columns: toArr(c.columns).map(r => (isObj(r) ? r.field : r)),
    values: toArr(c.values).map(val), filters: { ...(c.filters || {}) }, sort: { ...(c.sort || {}) },
    showTotals: c.showTotals !== false, showSubtotals: c.showSubtotals !== false, heatmap: !!c.heatmap,
    collapsed: { rows: toArr(c.collapsed?.rows), columns: toArr(c.collapsed?.columns) },
  };
}
/** compute(data, config, fields) -> { rowRoot, colRoot, value(rNode, cNode, vi), config, fields, count } */
function compute(data, config, fields) {
  const cfg = normConfig(config), defs = fields instanceof Map ? fields : fieldDefs(data, fields);
  const rf = cfg.rows.map(k => getter(k, defs)), cf = cfg.columns.map(k => getter(k, defs));
  const vals = cfg.values, V = vals.length, vf = vals.map(v => (v.field && v.field !== '*' ? getter(v.field, defs) : null));
  const filters = Object.entries(cfg.filters).filter(([, a]) => Array.isArray(a)).map(([k, a]) => [getter(k, defs), new Set(a.map(dimKey))]);
  const extra = isFn(config?.filter) ? config.filter : null;
  let nid = 0;
  const node = (key, raw, parent, depth) => ({ id: nid++, key, raw, parent, depth, children: new Map(), n: 0 });
  const rowRoot = node('', null, null, 0), colRoot = node('', null, null, 0);
  const cells = new Map(), distinct = vals.some(v => v.agg === 'distinct') ? new Map() : null, custom = vals.some(v => isFn(v.agg)) ? new Map() : null;
  const KEEP = custom ? new Map() : null;
  const rChain = new Array(rf.length + 1), cChain = new Array(cf.length + 1);
  const list = toArr(data), vnum = new Float64Array(V), vok = new Uint8Array(V), vraw = new Array(V);
  let count = 0;
  for (let i = 0; i < list.length; i++) {
    const rec = list[i];
    if (rec == null) continue;
    let skip = false;
    for (let f = 0; f < filters.length; f++) if (!filters[f][1].has(dimKey(filters[f][0](rec)))) { skip = true; break; }
    if (skip || (extra && !extra(rec))) continue;
    count++;
    let n = rowRoot; rChain[0] = n; n.n++;
    for (let d = 0; d < rf.length; d++) { const raw = rf[d](rec), k = dimKey(raw); let ch = n.children.get(k); if (!ch) { ch = node(k, raw, n, d + 1); n.children.set(k, ch); } n = ch; n.n++; rChain[d + 1] = n; }
    n = colRoot; cChain[0] = n;
    for (let d = 0; d < cf.length; d++) { const raw = cf[d](rec), k = dimKey(raw); let ch = n.children.get(k); if (!ch) { ch = node(k, raw, n, d + 1); n.children.set(k, ch); } n = ch; cChain[d + 1] = n; }
    for (let v = 0; v < V; v++) {
      const x = vf[v] ? vf[v](rec) : 1;
      vraw[v] = x;
      const num = typeof x === 'number' ? x : x == null || x === '' || typeof x === 'boolean' ? NaN : +x;
      vnum[v] = num; vok[v] = Number.isFinite(num) ? 1 : 0;
    }
    for (let a = 0; a <= rf.length; a++) {
      const base = rChain[a].id * 1048576;
      for (let b = 0; b <= cf.length; b++) {
        const key = base + cChain[b].id;
        let acc = cells.get(key);
        if (!acc) { acc = new Float64Array(V * 5); for (let v = 0; v < V; v++) { acc[v * 5 + 2] = Infinity; acc[v * 5 + 3] = -Infinity; } cells.set(key, acc); }
        for (let v = 0; v < V; v++) {
          const o5 = v * 5, x = vraw[v];
          if (vok[v]) { const num = vnum[v]; acc[o5] += num; acc[o5 + 1]++; if (num < acc[o5 + 2]) acc[o5 + 2] = num; if (num > acc[o5 + 3]) acc[o5 + 3] = num; }
          if (x != null && x !== '') acc[o5 + 4]++;
          if (distinct && vals[v].agg === 'distinct') { const dk = key * 64 + v; let s = distinct.get(dk); if (!s) distinct.set(dk, (s = new Set())); s.add(dimKey(x)); }
          if (custom && isFn(vals[v].agg)) { const dk = key * 64 + v; let s = custom.get(dk); if (!s) { custom.set(dk, (s = [])); KEEP.set(dk, []); } s.push(x); KEEP.get(dk).push(rec); }
        }
      }
    }
  }
  const value = (r, c, v) => {
    const acc = cells.get(r.id * 1048576 + c.id);
    if (!acc) return null;
    const o5 = v * 5, agg = vals[v].agg;
    if (isFn(agg)) { const dk = (r.id * 1048576 + c.id) * 64 + v; return agg(custom.get(dk) || [], KEEP.get(dk) || []); }
    switch (agg) {
      case 'count': return acc[o5 + 4];
      case 'distinct': return distinct.get((r.id * 1048576 + c.id) * 64 + v)?.size ?? 0;
      case 'avg': return acc[o5 + 1] ? acc[o5] / acc[o5 + 1] : null;
      case 'min': return acc[o5 + 1] ? acc[o5 + 2] : null;
      case 'max': return acc[o5 + 1] ? acc[o5 + 3] : null;
      default: return acc[o5 + 1] ? acc[o5] : null;
    }
  };
  return { rowRoot, colRoot, value, config: cfg, fields: defs, count, total: list.length };
}
function labelOf(nodeRaw, key, def) {
  if (key === '') return t('pivot.blank');
  if (def?.derived === 'month') { const [y, m] = key.split('-'); return fmt.date(new Date(+y, +m - 1, 1), { year: 'numeric', month: 'short' }); }
  if (isFn(def?.format)) return String(def.format(nodeRaw));
  if (nodeRaw instanceof Date) return fmt.date(nodeRaw);
  if (typeof nodeRaw === 'boolean') return nodeRaw ? t('common.yes') : t('common.no');
  return key;
}
function sortChildren(nodeObj, level, res, fieldsArr, isRows) {
  const cfg = res.config, s = isRows ? cfg.sort.rows : cfg.sort.columns;
  const list = [...nodeObj.children.values()];
  const def = res.fields.get(fieldsArr[level]);
  const byLabel = (a, b) => {
    if (a.key === '' || b.key === '') return (a.key === '') - (b.key === '');
    if (typeof a.raw === 'number' && typeof b.raw === 'number') return a.raw - b.raw;
    if (a.raw instanceof Date && b.raw instanceof Date) return a.raw - b.raw;
    return collator.compare(a.key, b.key);
  };
  if (isRows && s?.by === 'value') {
    const col = findCol(res.colRoot, s.col || []);
    list.sort((a, b) => ((res.value(a, col, s.value || 0) ?? -Infinity) - (res.value(b, col, s.value || 0) ?? -Infinity)) || byLabel(a, b));
    if (s.dir !== 'asc') list.reverse();
  } else {
    list.sort(byLabel);
    if (s?.dir === 'desc' && (s.by !== 'label' || s.level == null || s.level === level)) list.reverse();
  }
  void def;
  return list;
}
const filterZone = c => Object.keys(c.filters).filter(k => !c.rows.includes(k) && !c.columns.includes(k));
function findCol(root, path) { let n = root; for (const k of path) { const c = n.children.get(k); if (!c) return root; n = c; } return n; }
const pathOf = n => { const p = []; for (let x = n; x && x.parent; x = x.parent) p.unshift(x.key); return p; };
const pathKey = p => p.join(SEP);

/** Visible rows and columns of a computed result (respects collapsed groups, sorting, totals). */
function layout(res) {
  const cfg = res.config, cr = new Set(cfg.collapsed.rows.map(p => pathKey(toArr(p)))), cc = new Set(cfg.collapsed.columns.map(p => pathKey(toArr(p))));
  const rows = [];
  const walkR = n => {
    for (const ch of sortChildren(n, n.depth, res, cfg.rows, true)) {
      const has = ch.depth < cfg.rows.length && ch.children.size > 0, pk = pathKey(pathOf(ch)), collapsed = has && cr.has(pk);
      rows.push({ node: ch, depth: ch.depth, has, collapsed, type: has ? 'group' : 'leaf', key: pk });
      if (has && !collapsed) walkR(ch);
    }
  };
  if (cfg.rows.length) walkR(res.rowRoot);
  if (cfg.showTotals || !cfg.rows.length) rows.push({ node: res.rowRoot, depth: 0, has: false, type: 'grand', key: '' });
  const cols = [];
  const walkC = n => {
    for (const ch of sortChildren(n, n.depth, res, cfg.columns, false)) {
      const has = ch.depth < cfg.columns.length && ch.children.size > 0, pk = pathKey(pathOf(ch)), collapsed = has && cc.has(pk);
      if (has && !collapsed) { walkC(ch); if (cfg.showSubtotals) cols.push({ node: ch, depth: ch.depth, type: 'subtotal', key: pk, has }); }
      else cols.push({ node: ch, depth: ch.depth, type: collapsed ? 'collapsed' : 'leaf', key: pk, has, collapsed });
    }
  };
  if (cfg.columns.length) walkC(res.colRoot);
  if (!cfg.columns.length || cfg.showTotals) cols.push({ node: res.colRoot, depth: 0, type: cfg.columns.length ? 'grand' : 'all', key: '' });
  return { rows, cols };
}

/* ── value formatting ─────────────────────────────────────────────────── */
function formatter(spec, agg) {
  if (isFn(spec)) return spec;
  if (isObj(spec)) return v => fmt.number(v, spec);
  switch (spec) {
    case 'currency': return v => fmt.currency(v);
    case 'percent': return v => fmt.percent(v, 1);
    case 'integer': return v => fmt.number(v, 0);
    case 'compact': return v => fmt.compact(v);
    case 'number': return v => fmt.number(v, { maximumFractionDigits: 2 });
  }
  if (isStr(spec) && /^[A-Z]{3}$/.test(spec)) return v => fmt.currency(v, spec);
  return agg === 'count' || agg === 'distinct' ? v => fmt.number(v, 0) : v => fmt.number(v, { maximumFractionDigits: 2 });
}

/* ── element ──────────────────────────────────────────────────────────── */
class OPivot extends OElement {
  static props = {
    data: { type: Array, default: () => [] }, config: { type: Object, default: () => ({}) }, fields: { type: Array, default: () => [] },
    fieldList: { type: Boolean, default: true, reflect: true }, editable: { type: Boolean, default: true }, view: { type: String, default: 'table' },
    maxRows: { type: Number, default: 2000 }, texts: { type: Object, attr: false },
  };
  setup() {
    this.classList.add('o-pivot');
    this._id = uid('pivot');
    const tb = (name, label, extra = {}) => h('button', { type: 'button', class: 'o-btn o-btn-sm o-btn-ghost', 'data-act': name, ...extra }, raw(String(icon(extra.icon || name, { size: 16 }))), h('span', { class: 'o-pivot-btn-text' }, label));
    this._fieldsBtn = h('button', { type: 'button', class: 'o-btn o-btn-sm o-btn-ghost', 'data-act': 'fields', 'aria-expanded': 'true', 'aria-controls': this._id + '-fields' }, raw(String(icon('columns', { size: 16 }))), h('span', { class: 'o-pivot-btn-text' }));
    this._viewSeg = h('div', { class: 'o-segmented o-pivot-view', role: 'group', hidden: true },
      h('button', { type: 'button', 'data-view': 'table', 'aria-pressed': 'true' }), h('button', { type: 'button', 'data-view': 'chart', 'aria-pressed': 'false' }));
    this._expandBtn = tb('expand', '', { icon: 'chevrons-up-down' });
    this._collapseBtn = tb('collapse', '', { icon: 'minimize' });
    this._exportBtn = tb('export', '', { icon: 'download', 'aria-haspopup': 'menu' });
    this._toolbar = h('div', { class: 'o-pivot-toolbar' }, this._fieldsBtn, this._viewSeg, h('span', { class: 'o-spacer' }), this._expandBtn, this._collapseBtn, this._exportBtn);
    this._search = h('input', { type: 'search', class: 'o-input o-input-sm o-pivot-search' });
    this._avail = h('div', { class: 'o-pivot-zone o-pivot-available', 'data-zone': 'available', role: 'list' });
    this._zones = {};
    const zoneEls = ZONES.map(z => {
      const list = h('div', { class: 'o-pivot-zone-list', role: 'list' });
      const el = h('div', { class: 'o-pivot-zone', 'data-zone': z }, h('div', { class: 'o-pivot-zone-title' }, raw(String(icon({ filters: 'filter', columns: 'columns', rows: 'menu', values: 'plus' }[z], { size: 14 }))), h('span')), list);
      this._zones[z] = { el, list };
      return el;
    });
    this._panel = h('aside', { class: 'o-pivot-fields', id: this._id + '-fields' },
      h('div', { class: 'o-pivot-fields-head' }, h('span', { class: 'o-pivot-fields-title' }), this._search), h('div', { class: 'o-pivot-available-wrap o-scroll' }, this._avail),
      h('div', { class: 'o-pivot-zones' }, ...zoneEls));
    this._scroll = h('div', { class: 'o-pivot-scroll o-scroll', tabindex: '0', role: 'region' });
    this._chartEl = h('div', { class: 'o-pivot-chart', hidden: true });
    this._legend = h('div', { class: 'o-pivot-legend', hidden: true, 'aria-hidden': 'true' });
    this._note = h('div', { class: 'o-pivot-note', role: 'status' });
    this._main = h('div', { class: 'o-pivot-main' }, this._scroll, this._chartEl, h('div', { class: 'o-pivot-foot' }, this._note, this._legend));
    this.replaceChildren(this._toolbar, h('div', { class: 'o-pivot-layout' }, this._panel, this._main));
    // events
    on(this._toolbar, 'click', '[data-act]', (e, b) => this._action(b.dataset.act, b));
    on(this._viewSeg, 'click', 'button[data-view]', (e, b) => { this.view = b.dataset.view; });
    on(this._search, 'input', () => this._renderAvailable());
    on(this._scroll, 'click', 'button[data-toggle]', (e, b) => this._toggle(b.dataset.toggle, b.dataset.key));
    on(this._scroll, 'click', 'button[data-sort]', (e, b) => this._sortClick(b));
    on(this._scroll, 'click', 'td[data-r]', (e, td) => this._cellClick(td));
    on(this._panel, 'change', 'select[data-agg]', (e, sel) => { const c = this._cfg(); c.values[+sel.dataset.agg].agg = sel.value; this._commit(c); });
    on(this._panel, 'click', '[data-filter]', (e, b) => this._openFilter(b.dataset.filter, b));
    on(this._panel, 'click', '.o-pivot-chip-main', (e, b) => { if (!this._dragged) this._openMenu(b); });
    on(this._panel, 'keydown', '.o-pivot-chip-main', (e, b) => this._chipKey(e, b));
    on(this._panel, 'pointerdown', '.o-pivot-chip', (e, chip) => this._pointerDown(e, chip));
    this._res = null;
  }
  connected() {
    this.listen(doc, 'o-theme', () => this._chart && this._renderChart());
  }
  disconnected() { this._menu?.close?.('api'); this._filterOv?.close?.('api'); this._dragCancel?.(); this._destroyChart(); }
  update(changed) {
    if (changed.has('init') || changed.has('locale') || changed.has('texts')) this._renderStatic();
    if (changed.has('fieldList') || changed.has('init')) { this._panel.hidden = !this.fieldList; this._fieldsBtn.setAttribute('aria-expanded', String(this.fieldList)); this._fieldsBtn.querySelector('.o-pivot-btn-text').textContent = this.t(this.fieldList ? 'pivot.hideFields' : 'pivot.showFields'); }
    if (changed.has('data') || changed.has('fields') || changed.has('init')) this._defs = fieldDefs(this.data, this.fields);
    if (['data', 'config', 'fields', 'init', 'locale', 'maxRows', 'editable', 'texts'].some(k => changed.has(k))) this._recompute();
    if (changed.has('view') || changed.has('init')) this._applyView();
  }
  /* ── public API ── */
  setData(data) { this.data = toArr(data); return this; }
  setConfig(config) { this.config = { ...config }; return this; }
  getConfig() { return clone(normConfig(this.config)); }
  refresh() { this._defs = fieldDefs(this.data, this.fields); this._recompute(); return this; }
  toggleFieldList(force) { this.fieldList = force ?? !this.fieldList; return this; }
  expandAll() { const c = this._cfg(); c.collapsed = { rows: [], columns: [] }; this._commit(c); return this; }
  collapseAll() {
    const c = this._cfg(), res = this._res;
    if (!res) return this;
    const groups = (root, levels) => { const out = []; const walk = (n) => { for (const ch of n.children.values()) if (ch.depth < levels && ch.children.size) { out.push(pathOf(ch)); walk(ch); } }; walk(root); return out; };
    c.collapsed = { rows: groups(res.rowRoot, c.rows.length).filter(p => p.length === 1), columns: groups(res.colRoot, c.columns.length).filter(p => p.length === 1) };
    this._commit(c); return this;
  }
  /** getResult() -> { rows: [{ path, labels, depth, type }], columns: [{ path, labels, type, value }], values: (number|null)[][], count } */
  getResult() {
    if (!this._res) this._recompute();
    const res = this._res, { rows, cols } = this._layout, V = res.config.values.length;
    const labelsOf = (n, fieldsArr) => pathOf(n).map((k, i) => labelOf(this._rawAt(n, i + 1), k, res.fields.get(fieldsArr[i])));
    const dataCols = cols.flatMap(c => res.config.values.map((v, vi) => ({ c, vi })));
    return {
      rows: rows.map(r => ({ path: pathOf(r.node), labels: labelsOf(r.node, res.config.rows), depth: r.depth, type: r.type })),
      columns: dataCols.map(({ c, vi }) => ({ path: pathOf(c.node), labels: labelsOf(c.node, res.config.columns), type: c.type, value: this._valueLabel(vi) })),
      values: rows.map(r => dataCols.map(({ c, vi }) => res.value(r.node, c.node, vi))), count: res.count, valueCount: V,
    };
  }
  /** export('csv' | 'xlsx' | 'json', { filename, download }) -> Promise<Blob> */
  async export(format = 'csv', opts = {}) {
    const m = this._matrix();
    const name = opts.filename || 'pivot';
    if (format === 'xlsx' || format === 'excel') {
      const blob = await O.xlsx.write([{ name: opts.sheetName || 'Pivot', rows: [...m.head, ...m.body], headerRows: m.head.length, merges: m.merges, freeze: { rows: m.head.length, cols: m.labelCols }, autoFilter: false, columns: null }], { creator: 'Orion Admin', title: opts.title });
      if (opts.download !== false) download(blob, name.replace(/\.xlsx$/i, '') + '.xlsx');
      return blob;
    }
    const flatHead = m.head.length ? m.flatHead : [];
    return O.export.to(format, m.body, { columns: flatHead.map((title, i) => ({ key: i, title })), filename: name, ...opts });
  }
  /* ── internals ── */
  /** Working copy of the config for UI-driven edits. clone() (structuredClone/JSON) cannot carry function
   * values, so custom `values[].agg`, `values[].format` and top-level `filter` are re-attached by reference
   * from the live (un-cloned) config after cloning — otherwise the first drag/sort/filter interaction would
   * silently revert a custom aggregator to 'sum' (or drop the filter predicate). */
  _cfg() {
    const c = normConfig(clone(this.config));
    const src = this.config || {};
    toArr(src.values).forEach((v, i) => {
      if (!c.values[i]) return;
      if (isFn(v?.agg)) c.values[i].agg = v.agg;
      if (isFn(v?.format)) c.values[i].format = v.format;
    });
    if (isFn(src.filter)) c.filter = src.filter;
    return c;
  }
  _commit(c) { this.config = c; this.emit('change', { config: this.getConfig() }); }
  _rawAt(n, depth) { let x = n; while (x && x.depth > depth) x = x.parent; return x?.raw; }
  _valueLabel(vi) {
    const v = this._res.config.values[vi], def = this._res.fields.get(v.field);
    if (v.label) return v.label;
    const agg = isFn(v.agg) ? this.t('pivot.agg.custom') : this.t('pivot.agg.' + v.agg);
    return !v.field || v.field === '*' ? agg : this.t('pivot.valueLabel', { agg, field: def?.label || humanize(v.field) });
  }
  _renderStatic() {
    const zt = { filters: 'pivot.filters', columns: 'pivot.columns', rows: 'pivot.rows', values: 'pivot.values' };
    ZONES.forEach(z => { const title = this._zones[z].el.querySelector('.o-pivot-zone-title span'); title.textContent = this.t(zt[z]); this._zones[z].list.setAttribute('aria-label', this.t(zt[z])); });
    this._panel.querySelector('.o-pivot-fields-title').textContent = this.t('pivot.fields');
    this._panel.setAttribute('aria-label', this.t('pivot.fields'));
    this._avail.setAttribute('aria-label', this.t('pivot.fields'));
    this._search.placeholder = this.t('pivot.searchFields');
    this._search.setAttribute('aria-label', this.t('pivot.searchFields'));
    const [tv, cv] = this._viewSeg.children;
    tv.textContent = this.t('pivot.table'); cv.textContent = this.t('pivot.chart');
    this._viewSeg.setAttribute('aria-label', this.t('pivot.table') + ' / ' + this.t('pivot.chart'));
    this._expandBtn.querySelector('.o-pivot-btn-text').textContent = this.t('pivot.expandAll');
    this._collapseBtn.querySelector('.o-pivot-btn-text').textContent = this.t('pivot.collapseAll');
    this._exportBtn.querySelector('.o-pivot-btn-text').textContent = this.t('pivot.export');
    this._legend.replaceChildren(h('span', null, this.t('pivot.low')), h('span', { class: 'o-pivot-legend-bar' }), h('span', null, this.t('pivot.high')));
    this._scroll.setAttribute('aria-label', this.t('pivot.table'));
  }
  _recompute() {
    if (!this._defs) this._defs = fieldDefs(this.data, this.fields);
    const t0 = isBrowser ? performance.now() : 0;
    this._res = compute(this.data, this.config, this._defs);
    this._layout = layout(this._res);
    this.lastComputeMs = isBrowser ? performance.now() - t0 : 0;
    this._renderFields();
    this._renderTable();
    if (this.view === 'chart') this._renderChart();
  }
  /* field list */
  _chip(key, zone, idx) {
    const def = this._defs.get(key) || { key, label: humanize(key) }, cfg = this._res.config;
    const vs = zone === 'values' ? cfg.values[idx] : null;
    const label = vs ? this._valueLabel(idx) : def.label;
    const main = h('button', { type: 'button', class: 'o-pivot-chip-main', 'data-key': key, 'data-zone': zone, 'data-idx': idx ?? '', 'aria-haspopup': 'menu', disabled: !this.editable, title: label },
      raw(String(icon('grip-vertical', { size: 14, class: 'o-pivot-grip' }))), h('bdi', { class: 'o-pivot-chip-label' }, label));
    const chip = h('div', { class: cls('o-pivot-chip', 'is-' + (def.type || 'string')), role: 'listitem', 'data-key': key, 'data-zone': zone, 'data-idx': idx ?? '' }, main);
    if (zone === 'available') {
      const used = cfg.rows.includes(key) || cfg.columns.includes(key) || cfg.values.some(v => v.field === key) || key in cfg.filters;
      chip.classList.toggle('is-used', used);
      if (def.derived) chip.classList.add('is-derived');
    }
    if (vs && this.editable) {
      const sel = h('select', { class: 'o-pivot-agg', 'data-agg': String(idx), 'aria-label': this.t('pivot.aggregation', { field: def.label }) },
        (isFn(vs.agg) ? ['custom'] : AGGS).map(a => h('option', { value: a, selected: vs.agg === a }, this.t('pivot.agg.' + a))));
      chip.append(sel);
    }
    if ((zone === 'rows' || zone === 'columns' || zone === 'filters') && this.editable) {
      const f = cfg.filters[key], active = Array.isArray(f);
      const fb = h('button', { type: 'button', class: cls('o-pivot-chip-tool', active && 'is-active'), 'data-filter': key, 'aria-label': this.t('pivot.filterBy', { field: def.label }), 'aria-haspopup': 'dialog' }, raw(String(icon('filter', { size: 13 }))));
      if (zone === 'filters' && active) chip.append(h('span', { class: 'o-pivot-chip-meta' }, this.t('pivot.filterSummary', { selected: f.length, total: this._distinct(key).length })));
      chip.append(fb);
    }
    return chip;
  }
  _renderFields() {
    const cfg = this._res.config;
    const lists = { filters: filterZone(cfg), columns: cfg.columns, rows: cfg.rows, values: cfg.values.map(v => v.field) };
    ZONES.forEach(z => {
      const list = this._zones[z].list;
      list.replaceChildren(...lists[z].map((k, i) => this._chip(k, z, i)));
      if (!lists[z].length) list.append(h('div', { class: 'o-pivot-zone-empty' }, this.t('pivot.dropHere')));
    });
    this._renderAvailable();
  }
  _renderAvailable() {
    const q = this._search.value.trim();
    const keys = [...this._defs.keys()].filter(k => !q || fuzzy(q, this._defs.get(k).label));
    this._avail.replaceChildren(...keys.map(k => this._chip(k, 'available')));
  }
  /* table */
  _distinct(key) {
    const g = getter(key, this._defs), m = new Map();
    for (const r of toArr(this.data)) { if (r == null) continue; const raw = g(r), k = dimKey(raw); const e = m.get(k); if (e) e.count++; else m.set(k, { key: k, raw, count: 1 }); }
    const def = this._defs.get(key);
    return [...m.values()].sort((a, b) => (a.key === '') - (b.key === '') || (typeof a.raw === 'number' && typeof b.raw === 'number' ? a.raw - b.raw : collator.compare(a.key, b.key))).map(e => ({ ...e, label: labelOf(e.raw, e.key, def) }));
  }
  _renderTable() {
    const res = this._res, cfg = res.config, { rows, cols } = this._layout, V = cfg.values.length, T = k => this.t(k);
    this._legend.hidden = !cfg.heatmap || !V;
    if (!V && !cfg.rows.length && !cfg.columns.length) { this._scroll.innerHTML = `<div class="o-empty o-empty-sm"><div class="o-empty-icon">${icon('columns')}</div><p class="o-empty-text">${esc(T('pivot.empty'))}</p></div>`; this._note.textContent = ''; return; }
    if (!res.count) { this._scroll.innerHTML = `<div class="o-empty o-empty-sm"><div class="o-empty-icon">${icon('filter')}</div><p class="o-empty-text">${esc(T('pivot.noData'))}</p></div>`; this._note.textContent = ''; return; }
    const fmts = cfg.values.map(v => formatter(v.format, v.agg));
    const H = Math.max(cfg.columns.length, 1), valueRow = V > 1 || !cfg.columns.length, headRows = cfg.columns.length ? H + (V > 1 ? 1 : 0) : 1;
    const sortS = cfg.sort.rows || {};
    // header
    let thead = '<thead>';
    const rowFieldsHtml = cfg.rows.map((k, i) => {
      const def = this._defs.get(k), active = sortS.by !== 'value' && (sortS.level ?? 0) === i && sortS.dir;
      return `<button type="button" class="o-pivot-sort${active ? ' is-active' : ''}" data-sort="label" data-level="${i}" aria-label="${esc(this.t('pivot.sortBy', { label: def?.label || k }))}">${esc(def?.label || k)}${active ? icon(sortS.dir === 'desc' ? 'arrow-down' : 'arrow-up', { size: 12 }) : ''}</button>`;
    }).join('<span class="o-pivot-sep">/</span>');
    const corner = `<th class="o-pivot-corner" rowspan="${headRows}" scope="col">${rowFieldsHtml || (V === 1 && cfg.columns.length ? esc(this._valueLabel(0)) : '')}</th>`;
    const slot = (c, level) => {
      if (c.type === 'grand' || c.type === 'all') return level === 0 ? { key: 'g', c, span: H - level } : null;
      if (level < c.depth - 1) { let n = c.node; while (n.depth > level + 1) n = n.parent; return { key: 'n' + n.id, n }; }
      if (level === c.depth - 1) return { key: (c.type === 'subtotal' ? 's' : 'n') + c.node.id, c, n: c.node, span: H - level };
      return null;
    };
    const colLabel = n => labelOf(n.raw, n.key, this._defs.get(cfg.columns[n.depth - 1]));
    if (cfg.columns.length) {
      for (let level = 0; level < H; level++) {
        thead += '<tr>' + (level === 0 ? corner : '');
        for (let i = 0; i < cols.length;) {
          const s = slot(cols[i], level);
          if (!s) { i++; continue; }
          let j = i + 1;
          while (j < cols.length && slot(cols[j], level)?.key === s.key) j++;
          const span = (j - i) * V;
          const n = s.n, c = s.c;
          let label, toggle = '';
          if (c && (c.type === 'grand')) label = T('pivot.grandTotal');
          else if (c && c.type === 'subtotal') label = this.t('pivot.subtotal', { label: colLabel(n) });
          else {
            label = colLabel(n);
            const pk = pathKey(pathOf(n)), isGroup = n.depth < cfg.columns.length && n.children.size > 0;
            if (isGroup) { const collapsed = c && c.type === 'collapsed'; toggle = `<button type="button" class="o-pivot-toggle" data-toggle="col" data-key="${esc(pk)}" aria-expanded="${!collapsed}" aria-label="${esc(this.t(collapsed ? 'pivot.expand' : 'pivot.collapse', { label }))}">${icon(collapsed ? 'chevron-right' : 'chevron-down', { size: 14 })}</button>`; }
          }
          const rs = c && s.span > 1 ? ` rowspan="${s.span}"` : '';
          const sortBtn = c && V === 1 ? this._sortBtn(c, 0, label) : null;
          thead += `<th scope="col" colspan="${span}"${rs} class="${cls('o-pivot-ch', c && c.type !== 'leaf' && c.type !== 'collapsed' && 'is-total')}"${sortBtn ? ` aria-sort="${sortBtn.aria}"` : ''}><span class="o-pivot-ch-inner">${toggle}${sortBtn ? sortBtn.html : `<bdi class="o-pivot-ch-label">${esc(label)}</bdi>`}</span></th>`;
          i = j;
        }
        thead += '</tr>';
      }
    }
    if (valueRow) {
      thead += '<tr>' + (cfg.columns.length ? '' : corner);
      for (const c of cols) for (let vi = 0; vi < V; vi++) { const sb = this._sortBtn(c, vi, this._valueLabel(vi)); thead += `<th scope="col" class="${cls('o-pivot-vh', (c.type === 'grand' || c.type === 'subtotal') && 'is-total')}" aria-sort="${sb.aria}">${sb.html}</th>`; }
      thead += '</tr>';
    }
    thead += '</thead>';
    // heat scale
    let heat = null;
    if (cfg.heatmap && V) {
      heat = cfg.values.map(() => ({ min: Infinity, max: -Infinity }));
      const leafRows = rows.filter(r => r.type === 'leaf' || (r.type !== 'grand' && !cfg.rows.length)), leafCols = cols.filter(c => c.type === 'leaf' || c.type === 'all');
      for (const r of leafRows) for (const c of leafCols) for (let vi = 0; vi < V; vi++) { const v = res.value(r.node, c.node, vi); if (v != null && Number.isFinite(v)) { if (v < heat[vi].min) heat[vi].min = v; if (v > heat[vi].max) heat[vi].max = v; } }
    }
    // body
    const max = Math.max(1, this.maxRows);
    let body = '<tbody>', foot = '';
    const renderRow = (r, ri) => {
      const isGrand = r.type === 'grand', n = r.node;
      let label = isGrand ? T('pivot.grandTotal') : labelOf(n.raw, n.key, this._defs.get(cfg.rows[n.depth - 1]));
      let toggle = '';
      if (r.has) toggle = `<button type="button" class="o-pivot-toggle" data-toggle="row" data-key="${esc(r.key)}" aria-expanded="${!r.collapsed}" aria-label="${esc(this.t(r.collapsed ? 'pivot.expand' : 'pivot.collapse', { label }))}">${icon(r.collapsed ? 'chevron-right' : 'chevron-down', { size: 14 })}</button>`;
      const showVals = isGrand || r.type === 'leaf' || cfg.showSubtotals || r.collapsed;
      let tr = `<tr class="${cls('o-pivot-r', 'is-' + r.type, r.collapsed && 'is-collapsed')}" data-depth="${r.depth}"><th scope="row" class="o-pivot-rh" style="--o-pivot-depth:${Math.max(0, r.depth - 1)}"><span class="o-pivot-rh-inner">${toggle || (cfg.rows.length > 1 && !isGrand ? '<span class="o-pivot-toggle-space"></span>' : '')}<bdi class="o-pivot-rh-label">${esc(label)}</bdi></span></th>`;
      cols.forEach((c, ci) => {
        for (let vi = 0; vi < V; vi++) {
          const v = showVals ? res.value(n, c.node, vi) : null;
          let hc = '';
          if (heat && v != null && (r.type === 'leaf' || !cfg.rows.length) && (c.type === 'leaf' || c.type === 'all') && !isGrand) {
            const { min, max: mx } = heat[vi];
            const k = mx > min ? Math.min(6, Math.floor(((v - min) / (mx - min)) * 7)) : 3;
            hc = ' o-pivot-heat-' + (k + 1);
          }
          tr += `<td class="${cls('o-pivot-cell', (c.type === 'grand' || c.type === 'subtotal') && 'is-total') + hc}" data-r="${ri}" data-c="${ci}" data-v="${vi}">${v == null || (typeof v === 'number' && !Number.isFinite(v)) ? '' : '<bdi>' + esc(fmts[vi](v)) + '</bdi>'}</td>`;
        }
      });
      return tr + '</tr>';
    };
    let shownN = 0, grandIdx = -1;
    rows.forEach((r, ri) => { if (r.type === 'grand') grandIdx = ri; else if (shownN++ < max) body += renderRow(r, ri); });
    if (grandIdx >= 0 && !cfg.rows.length) body += renderRow(rows[grandIdx], grandIdx);
    body += '</tbody>';
    if (grandIdx >= 0 && cfg.rows.length) foot = '<tfoot>' + renderRow(rows[grandIdx], grandIdx) + '</tfoot>';
    const sl = this._scroll.scrollLeft, st = this._scroll.scrollTop;
    this._scroll.innerHTML = `<table class="${cls('o-pivot-table', cfg.heatmap && 'has-heatmap')}" aria-rowcount="${rows.length + headRows}">${thead}${body}${foot}</table>`;
    this._scroll.scrollLeft = sl; this._scroll.scrollTop = st;
    const truncated = rows.filter(r => r.type !== 'grand').length > max;
    this._note.textContent = truncated ? this.t('pivot.truncated', { count: fmt.number(max) }) : '';
  }
  _sortBtn(c, vi, label) {
    const s = this._res.config.sort.rows || {}, path = c ? pathOf(c.node) : [];
    const active = s.by === 'value' && (s.value || 0) === vi && pathKey(s.col || []) === pathKey(path);
    const dir = active ? s.dir || 'desc' : null;
    return {
      aria: dir ? (dir === 'asc' ? 'ascending' : 'descending') : 'none',
      html: `<button type="button" class="o-pivot-sort${active ? ' is-active' : ''}" data-sort="value" data-v="${vi}" data-path="${esc(JSON.stringify(path))}" aria-label="${esc(this.t('pivot.sortBy', { label }))}"><bdi class="o-pivot-ch-label">${esc(label)}</bdi>${dir ? icon(dir === 'asc' ? 'arrow-up' : 'arrow-down', { size: 12 }) : ''}</button>`,
    };
  }
  _sortClick(b) {
    if (!this.editable) return;
    const c = this._cfg(), s = c.sort.rows || {};
    if (b.dataset.sort === 'label') {
      const level = +b.dataset.level;
      c.sort.rows = { by: 'label', level, dir: s.by !== 'value' && (s.level ?? 0) === level && s.dir !== 'desc' ? 'desc' : 'asc' };
    } else {
      const path = JSON.parse(b.dataset.path || '[]'), vi = +b.dataset.v;
      const same = s.by === 'value' && (s.value || 0) === vi && pathKey(s.col || []) === pathKey(path);
      c.sort.rows = !same ? { by: 'value', value: vi, col: path, dir: 'desc' } : s.dir === 'desc' ? { by: 'value', value: vi, col: path, dir: 'asc' } : { by: 'label', dir: 'asc' };
    }
    this._commit(c);
  }
  _toggle(kind, key) {
    const c = this._cfg(), list = kind === 'row' ? c.collapsed.rows : c.collapsed.columns;
    const i = list.findIndex(p => pathKey(toArr(p)) === key);
    if (i >= 0) list.splice(i, 1); else list.push(key.split(SEP));
    this._commit(c);
    requestAnimationFrame(() => this._scroll.querySelector(`button[data-toggle="${kind}"][data-key="${CSS.escape(key)}"]`)?.focus());
  }
  _cellClick(td) {
    const { rows, cols } = this._layout, r = rows[+td.dataset.r], c = cols[+td.dataset.c], vi = +td.dataset.v;
    if (!r || !c) return;
    const res = this._res, cfg = res.config, rp = pathOf(r.node), cp = pathOf(c.node);
    const rg = cfg.rows.slice(0, rp.length).map(k => getter(k, this._defs)), cg = cfg.columns.slice(0, cp.length).map(k => getter(k, this._defs));
    const filters = Object.entries(cfg.filters).filter(([, a]) => Array.isArray(a)).map(([k, a]) => [getter(k, this._defs), new Set(a.map(dimKey))]);
    const records = toArr(this.data).filter(rec => rec && rg.every((g, i) => dimKey(g(rec)) === rp[i]) && cg.every((g, i) => dimKey(g(rec)) === cp[i]) && filters.every(([g, s]) => s.has(dimKey(g(rec)))));
    this.emit('cell-click', { row: rp, column: cp, value: res.value(r.node, c.node, vi), valueField: cfg.values[vi], records });
  }
  /* matrix for export: tabular layout (one label column per row field) */
  _matrix() {
    const res = this._res || (this._recompute(), this._res), cfg = res.config, { rows, cols } = this._layout, V = cfg.values.length;
    const L = Math.max(1, cfg.rows.length), H = cfg.columns.length ? cfg.columns.length + (V > 1 ? 1 : 0) : 1;
    const head = Array.from({ length: H }, () => new Array(L).fill(''));
    cfg.rows.forEach((k, i) => { head[H - 1][i] = this._defs.get(k)?.label || k; });
    const merges = [], flatHead = [...head[H - 1]];
    let col = L;
    for (const c of cols) {
      const labels = pathOf(c.node).map((k, i) => labelOf(this._rawAt(c.node, i + 1), k, this._defs.get(cfg.columns[i])));
      if (c.type === 'subtotal') labels[labels.length - 1] = this.t('pivot.subtotal', { label: labels[labels.length - 1] });
      if (c.type === 'grand') labels.push(this.t('pivot.grandTotal'));
      for (let vi = 0; vi < V; vi++) {
        const parts = [...labels];
        if (V > 1 || !cfg.columns.length) parts.push(this._valueLabel(vi));
        for (let lvl = 0; lvl < H; lvl++) head[lvl][col] = lvl < parts.length ? parts[lvl] : '';
        flatHead.push(parts.join(' · ') || this._valueLabel(vi));
        col++;
      }
    }
    for (let lvl = 0; lvl < H - 1; lvl++) {
      for (let c0 = L; c0 < col;) {
        let c1 = c0 + 1;
        const same = cc => head[lvl][cc] === head[lvl][c0] && (lvl === 0 || head[lvl - 1][cc] === head[lvl - 1][c0]);
        while (c1 < col && head[lvl][c0] && same(c1)) c1++;
        if (c1 - c0 > 1) { merges.push(`${O.xlsx.colName(c0)}${lvl + 1}:${O.xlsx.colName(c1 - 1)}${lvl + 1}`); for (let x = c0 + 1; x < c1; x++) head[lvl][x] = ''; }
        c0 = c1;
      }
    }
    const body = rows.map(r => {
      const line = new Array(L).fill('');
      if (r.type === 'grand') line[0] = this.t('pivot.grandTotal');
      else pathOf(r.node).forEach((k, i) => { line[i] = labelOf(this._rawAt(r.node, i + 1), k, this._defs.get(cfg.rows[i])); });
      if (r.type === 'group') line[r.depth - 1] = this.t('pivot.subtotal', { label: line[r.depth - 1] });
      for (const c of cols) for (let vi = 0; vi < V; vi++) { const v = res.value(r.node, c.node, vi); line.push(v == null || !Number.isFinite(v) ? null : v); }
      return line;
    });
    return { head, body, merges, labelCols: L, flatHead };
  }
  /* chart */
  _applyView() {
    const hasChart = isFn(O.chart);
    this._viewSeg.hidden = !hasChart;
    const chart = hasChart && this.view === 'chart';
    [...this._viewSeg.children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === (chart ? 'chart' : 'table'))));
    this._scroll.hidden = chart; this._chartEl.hidden = !chart;
    if (chart) this._renderChart(); else this._destroyChart();
  }
  _destroyChart() { try { this._chart?.destroy?.(); } catch {} this._chart = null; this._chartEl?.replaceChildren(); }
  _renderChart() {
    if (!isFn(O.chart) || !this._res) return;
    const res = this._res, cfg = res.config, { rows, cols } = this._layout;
    const lr = rows.filter(r => r.type === 'leaf' || r.collapsed || (!cfg.rows.length && r.type === 'grand')).slice(0, 50);
    const lc = cols.filter(c => c.type === 'leaf' || c.type === 'collapsed' || c.type === 'all').slice(0, 12);
    const labels = lr.map(r => (r.type === 'grand' ? this.t('pivot.grandTotal') : pathOf(r.node).map((k, i) => labelOf(this._rawAt(r.node, i + 1), k, this._defs.get(cfg.rows[i]))).join(' / ')));
    const series = cfg.columns.length ? lc.map(c => ({ name: pathOf(c.node).map((k, i) => labelOf(this._rawAt(c.node, i + 1), k, this._defs.get(cfg.columns[i]))).join(' / '), data: lr.map(r => res.value(r.node, c.node, 0)) }))
      : cfg.values.map((v, vi) => ({ name: this._valueLabel(vi), data: lr.map(r => res.value(r.node, res.colRoot, vi)) }));
    const config = { type: 'bar', labels, series, data: { labels, datasets: series.map(s => ({ label: s.name, data: s.data })) }, height: 360 };
    this._destroyChart();
    const host = h('div', { class: 'o-pivot-chart-host' });
    this._chartEl.append(host);
    try { this._chart = O.chart(host, config); }
    catch (e) { console.warn('[Orion] o-pivot: chart view failed', e); this._chartEl.innerHTML = `<div class="o-empty o-empty-sm"><p class="o-empty-text">${esc(this.t('common.noData'))}</p></div>`; }
  }
  /* toolbar actions */
  _action(name, btn) {
    if (name === 'fields') return this.toggleFieldList();
    if (name === 'expand') return this.expandAll();
    if (name === 'collapse') return this.collapseAll();
    if (name === 'export') return this._popupMenu(btn, [
      { label: this.t('pivot.csv'), icon: 'file', run: () => this.export('csv') },
      { label: this.t('pivot.xlsx'), icon: 'file', run: () => this.export('xlsx') },
    ]);
  }
  /* menus (move chips, export) */
  _popupMenu(anchor, items) {
    this._menu?.close('api');
    const menu = h('div', { class: 'o-floating o-pivot-menu', role: 'menu' }, items.map(it => h('button', { type: 'button', role: 'menuitem', class: 'o-pivot-menu-item', tabindex: '-1', disabled: it.disabled }, it.icon ? raw(String(icon(it.icon, { size: 16 }))) : null, h('span', null, it.label))));
    portal(menu, this);
    const unplace = autoPlace(menu, anchor, { placement: 'bottom-start', offset: 4, flip: true });
    const nav = new ListNav(menu, { items: '[role=menuitem]:not([disabled])', onSelect: el => pick(el) });
    const pick = el => { const i = [...menu.children].indexOf(el); ov.close('api'); items[i]?.run(); };
    menu.addEventListener('click', e => { const b = e.target.closest('[role=menuitem]'); if (b) pick(b); });
    menu.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); ov.close('api'); } else nav.handle(e); });
    const ov = overlays.open({ el: menu, owner: anchor, onClose: () => { unplace(); menu.remove(); this._menu = null; anchor.setAttribute('aria-expanded', 'false'); } });
    this._menu = ov;
    anchor.setAttribute('aria-expanded', 'true');
    animate(menu, 'zoomIn', { duration: 120 });
    nav.first();
  }
  _openMenu(main) {
    if (!this.editable) return;
    const key = main.dataset.key, zone = main.dataset.zone, idx = main.dataset.idx === '' ? -1 : +main.dataset.idx;
    const def = this._defs.get(key), cfg = this._res.config;
    const lists = { rows: cfg.rows, columns: cfg.columns, filters: filterZone(cfg), values: cfg.values.map(v => v.field) };
    const zl = { rows: 'pivot.rows', columns: 'pivot.columns', values: 'pivot.values', filters: 'pivot.filters' };
    const items = ['rows', 'columns', 'values', 'filters'].filter(z => z !== zone).map(z => ({ label: this.t(zone === 'available' ? 'pivot.addTo' : 'pivot.moveTo', { zone: this.t(zl[z]) }), icon: 'arrow-right', run: () => this._move(key, zone, idx, z, lists[z].length) }));
    if (zone !== 'available') {
      items.push({ label: this.t('pivot.moveUp'), icon: 'arrow-up', disabled: idx <= 0, run: () => this._move(key, zone, idx, zone, idx - 1) });
      items.push({ label: this.t('pivot.moveDown'), icon: 'arrow-down', disabled: idx >= lists[zone].length - 1, run: () => this._move(key, zone, idx, zone, idx + 2) });
      if (zone !== 'values') items.push({ label: this.t('pivot.filter'), icon: 'filter', run: () => this._openFilter(key, main) });
      items.push({ label: this.t('pivot.remove'), icon: 'trash', run: () => this._move(key, zone, idx, 'available', 0) });
    }
    void def;
    this._popupMenu(main, items);
  }
  _chipKey(e, main) {
    const zone = main.dataset.zone, idx = +main.dataset.idx, key = main.dataset.key;
    if (zone === 'available' || !this.editable) return;
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); this._move(key, zone, idx, zone, e.key === 'ArrowUp' ? idx - 1 : idx + 2, true); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this._move(key, zone, idx, 'available', 0, true); }
  }
  /** Move a field between zones. `at` is an insertion index in the target list (before removal). */
  _move(key, from, idx, to, at, keepFocus = false) {
    const c = this._cfg();
    let vspec = null;
    if (from === 'rows' || from === 'columns') c[from].splice(idx, 1);
    else if (from === 'values') vspec = c.values.splice(idx, 1)[0];
    if (from !== to && (to === 'available' || to === 'values' || from === 'filters' && to !== 'rows' && to !== 'columns')) delete c.filters[key];
    if (from === to && at > idx) at--;
    if (to === 'rows' || to === 'columns') {
      const other = to === 'rows' ? 'columns' : 'rows';
      if (c[other].includes(key)) c[other].splice(c[other].indexOf(key), 1);
      if (c[to].includes(key)) c[to].splice(c[to].indexOf(key), 1);
      c[to].splice(clamp(at, 0, c[to].length), 0, key);
    } else if (to === 'values') {
      const def = this._defs.get(key);
      c.values.splice(clamp(at, 0, c.values.length), 0, vspec || { field: key, agg: def?.type === 'number' ? 'sum' : 'count' });
    } else if (to === 'filters') {
      const zoneKeys = filterZone(c).filter(k => k !== key), rest = Object.keys(c.filters).filter(k => !zoneKeys.includes(k) && k !== key);
      const val = c.filters[key] ?? null;
      if (c.rows.includes(key)) c.rows.splice(c.rows.indexOf(key), 1);
      if (c.columns.includes(key)) c.columns.splice(c.columns.indexOf(key), 1);
      zoneKeys.splice(clamp(at, 0, zoneKeys.length), 0, key);
      const nf = {};
      [...zoneKeys, ...rest].forEach(k => { nf[k] = k === key ? val : c.filters[k]; });
      c.filters = nf;
    }
    this._commit(c);
    const zl = { rows: 'pivot.rows', columns: 'pivot.columns', values: 'pivot.values', filters: 'pivot.filters', available: 'pivot.fields' };
    announce(this.t('pivot.moved', { field: this._defs.get(key)?.label || key, zone: this.t(zl[to]) }));
    if (keepFocus) requestAnimationFrame(() => (this._panel.querySelector(`.o-pivot-chip-main[data-zone="${to}"][data-key="${CSS.escape(key)}"]`) || this._panel.querySelector(`.o-pivot-chip-main[data-key="${CSS.escape(key)}"]`))?.focus());
  }
  /* pointer drag & drop */
  _pointerDown(e, chip) {
    if (!this.editable || e.button !== 0 || e.target.closest('select, .o-pivot-chip-tool')) return;
    const start = { x: e.clientX, y: e.clientY };
    let drag = null;
    const move = ev => {
      if (!drag) { if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return; drag = this._dragStart(chip, ev); }
      ev.preventDefault();
      this._dragMove(drag, ev);
    };
    const end = (ev, drop) => { offs.forEach(f => f()); this._dragCancel = null; if (drag) this._dragEnd(drag, drop ? ev : null); };
    const offs = [on(doc, 'pointermove', move), on(doc, 'pointerup', ev => end(ev, true)), on(doc, 'pointercancel', ev => end(ev, false)),
      on(doc, 'keydown', ev => { if (ev.key === 'Escape' && drag) { ev.preventDefault(); ev.stopPropagation(); end(ev, false); } }, true)];
    this._dragCancel = () => end(null, false);
  }
  _dragStart(chip, ev) {
    const r = chip.getBoundingClientRect();
    const ghost = chip.cloneNode(true);
    ghost.classList.add('o-pivot-ghost');
    ghost.style.width = r.width + 'px';
    portal(ghost, this);
    ghost.style.zIndex = String(Z.tooltip);
    chip.classList.add('is-dragging');
    this.classList.add('is-dragging');
    const marker = h('div', { class: 'o-pivot-marker', 'aria-hidden': 'true' });
    return { chip, ghost, marker, dx: ev.clientX - r.left, dy: ev.clientY - r.top, zone: null, index: 0 };
  }
  _dragMove(d, ev) {
    d.ghost.style.transform = `translate(${ev.clientX - d.dx}px, ${ev.clientY - d.dy}px)`;
    const hit = doc.elementFromPoint(ev.clientX, ev.clientY);
    const zoneEl = hit?.closest('.o-pivot-zone');
    const zone = zoneEl && this.contains(zoneEl) ? zoneEl.dataset.zone : null;
    this.querySelectorAll('.o-pivot-zone.is-over').forEach(z => z !== zoneEl && z.classList.remove('is-over'));
    d.zone = zone;
    if (!zone) { d.marker.remove(); return; }
    zoneEl.classList.add('is-over');
    if (zone === 'available') { d.marker.remove(); d.index = 0; return; }
    const list = this._zones[zone].list, chips = [...list.querySelectorAll('.o-pivot-chip')].filter(c => c !== d.chip);
    let index = chips.length;
    for (let i = 0; i < chips.length; i++) { const cr = chips[i].getBoundingClientRect(); if (ev.clientY < cr.top + cr.height / 2) { index = i; break; } }
    d.index = index;
    const ref = chips[index] || null;
    if (d.marker.parentElement !== list || d.marker.nextElementSibling !== ref) list.insertBefore(d.marker, ref);
  }
  _dragEnd(d, ev) {
    d.ghost.remove(); d.marker.remove();
    d.chip.classList.remove('is-dragging');
    this.classList.remove('is-dragging');
    this.querySelectorAll('.o-pivot-zone.is-over').forEach(z => z.classList.remove('is-over'));
    this._dragged = true;
    setTimeout(() => { this._dragged = false; }, 0);
    if (!ev || !d.zone) return;
    const key = d.chip.dataset.key, from = d.chip.dataset.zone, idx = d.chip.dataset.idx === '' ? -1 : +d.chip.dataset.idx;
    if (d.zone === from && from === 'available') return;
    let at = d.index;
    if (d.zone === from) { const all = [...this._zones[from].list.querySelectorAll('.o-pivot-chip')]; const ordered = all.filter(c => c !== d.chip); at = d.index >= ordered.length ? all.length : all.indexOf(ordered[d.index]); if (at === idx || at === idx + 1) return; }
    if (d.zone === 'available') { if (from !== 'available') this._move(key, from, idx, 'available', 0); return; }
    this._move(key, from, idx, d.zone, at);
  }
  /* filter popover */
  _openFilter(key, anchor) {
    this._filterOv?.close('api');
    this._menu?.close('api');
    const all = this._distinct(key), def = this._defs.get(key), cur = this._res.config.filters[key];
    const selected = new Set(Array.isArray(cur) ? cur.map(dimKey) : all.map(v => v.key));
    const search = h('input', { type: 'search', class: 'o-input o-input-sm', placeholder: t('common.searchPlaceholder'), 'aria-label': t('common.search') });
    const allBox = h('input', { type: 'checkbox' });
    const list = h('div', { class: 'o-pivot-filter-list o-scroll', role: 'group', 'aria-label': def?.label || key });
    const ok = h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm' }, t('common.apply'));
    const cancel = h('button', { type: 'button', class: 'o-btn o-btn-sm' }, t('common.cancel'));
    const titleId = uid('pvf');
    const panel = h('div', { class: 'o-floating o-pivot-filter', role: 'dialog', 'aria-labelledby': titleId },
      h('div', { class: 'o-pivot-filter-title', id: titleId }, this.t('pivot.filterBy', { field: def?.label || key })), search,
      h('label', { class: 'o-check o-pivot-filter-all' }, allBox, h('span', null, this.t('pivot.selectAll'))), list, h('div', { class: 'o-pivot-filter-actions' }, cancel, ok));
    const LIMIT = 300;
    let visible = all;
    const paint = () => {
      const q = search.value.trim();
      visible = q ? all.filter(v => fuzzy(q, v.label)) : all;
      const on2 = visible.filter(v => selected.has(v.key)).length;
      allBox.checked = on2 === visible.length && visible.length > 0; allBox.indeterminate = on2 > 0 && on2 < visible.length;
      list.replaceChildren(...visible.slice(0, LIMIT).map(v => {
        const cb = h('input', { type: 'checkbox', checked: selected.has(v.key), value: v.key });
        cb.addEventListener('change', () => { if (cb.checked) selected.add(v.key); else selected.delete(v.key); paintAll(); });
        return h('label', { class: 'o-check o-pivot-filter-item' }, cb, h('bdi', { class: 'o-pivot-filter-label' }, v.label), h('span', { class: 'o-pivot-filter-count' }, fmt.number(v.count)));
      }));
      if (!visible.length) list.append(h('div', { class: 'o-pivot-filter-empty' }, this.t('pivot.noValues')));
      if (visible.length > LIMIT) list.append(h('div', { class: 'o-pivot-filter-empty' }, this.t('pivot.moreValues', { count: fmt.number(visible.length - LIMIT) })));
      ok.disabled = !selected.size;
    };
    const paintAll = () => { const on2 = visible.filter(v => selected.has(v.key)).length; allBox.checked = on2 === visible.length && visible.length > 0; allBox.indeterminate = on2 > 0 && on2 < visible.length; ok.disabled = !selected.size; };
    allBox.addEventListener('change', () => { visible.forEach(v => (allBox.checked ? selected.add(v.key) : selected.delete(v.key))); paint(); });
    search.addEventListener('input', paint);
    search.addEventListener('keydown', e => { if (e.key === 'Escape' && search.value) { e.preventDefault(); search.value = ''; paint(); } });
    portal(panel, this);
    const unplace = autoPlace(panel, anchor, { placement: 'bottom-start', offset: 4, flip: true, size: true });
    const ov = overlays.open({ el: panel, owner: anchor, trap: true, onClose: () => { unplace(); panel.remove(); this._filterOv = null; } });
    this._filterOv = ov;
    cancel.addEventListener('click', () => ov.close('api'));
    ok.addEventListener('click', () => {
      const c = this._cfg();
      c.filters[key] = selected.size === all.length ? null : all.filter(v => selected.has(v.key)).map(v => v.key);
      if (c.filters[key] == null && (c.rows.includes(key) || c.columns.includes(key) || !Object.prototype.hasOwnProperty.call(this._res.config.filters, key))) delete c.filters[key];
      ov.close('api');
      this._commit(c);
    });
    paint();
    animate(panel, 'zoomIn', { duration: 120 });
    requestAnimationFrame(() => search.focus());
  }
}
define('o-pivot', OPivot);
O.Pivot = OPivot;
O.pivot = { compute, layout, fields: fieldDefs, normalize: normConfig };
