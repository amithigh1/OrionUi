// @deps pagination
/* <o-datatable> — data grid: client & server processing, sorting, filtering, faceted chips, selection, bulk and row actions,
 * inline editing, master-detail, tree grid, grouping, aggregates, virtual & infinite scrolling, frozen / resizable / reorderable
 * columns, saved views, export / import / print, responsive stack & priority modes and full ARIA grid keyboard support.
 * Files in this folder share one scope (concatenated in file-name order). */

i18n.add('en', {
  table: {
    label: 'Data table', search: 'Search…', searchLabel: 'Search table', clearSearch: 'Clear search',
    noData: 'No data yet', noResults: 'No matching records', noResultsHint: 'Try adjusting your search or filters.',
    error: 'Could not load data', retry: 'Retry', loading: 'Loading…', loadingMore: 'Loading more…', loadMore: 'Load more',
    showing: 'Showing {start}–{end} of {total}', showingRows: '{total} rows', loaded: '{count} of {total} loaded', filteredFrom: '(filtered from {total})',
    results: { one: '{count} result', other: '{count} results' },
    selected: { one: '{count} selected', other: '{count} selected' },
    selectAllResults: 'Select all {count} results', allSelected: 'All {count} results are selected',
    clearSelection: 'Clear', selectRow: 'Select row', selectAll: 'Select all rows on this page',
    expandRow: 'Expand row', collapseRow: 'Collapse row', expandAll: 'Expand all', collapseAll: 'Collapse all',
    sortedAsc: 'sorted ascending', sortedDesc: 'sorted descending', sortHint: 'Click to sort. Shift+click to add a sort level.',
    sortAnnounce: 'Sorted by {column}, {dir}', sortCleared: 'Sorting cleared',
    filter: 'Filter', filters: 'Filters', filterColumn: 'Filter {column}', clearFilter: 'Clear', clearAll: 'Clear all',
    any: 'Any', yes: 'Yes', no: 'No', min: 'Min', max: 'Max', from: 'From', to: 'To', contains: 'Contains…', searchOptions: 'Search…',
    searchChip: 'Search', filterRow: 'Filter row',
    columns: 'Columns', searchColumns: 'Find a column…', resetColumns: 'Reset columns', showAll: 'Show all',
    moveUp: 'Move up', moveDown: 'Move down', moveLeft: 'Move left', moveRight: 'Move right', groupBy: 'Group by', noGrouping: 'No grouping',
    columnMoved: '{column} moved to position {pos}', columnResized: '{column} is {width} pixels wide',
    density: 'Density', compact: 'Compact', normal: 'Normal', comfortable: 'Comfortable',
    export: 'Export', exportCsv: 'CSV', exportXlsx: 'Excel (.xlsx)', exportPdf: 'PDF', exportJson: 'JSON', copy: 'Copy to clipboard',
    copied: { one: 'Copied {count} row', other: 'Copied {count} rows' }, exported: 'Exported {count} rows',
    print: 'Print', printPreview: 'Print preview', scope: 'Rows', scopeAll: 'All rows', scopeFiltered: 'Filtered rows',
    scopeSelected: 'Selected rows', scopePage: 'Current page', visibleOnly: 'Visible columns only',
    import: 'Import', importTitle: 'Import data', importRows: { one: 'Import {count} row', other: 'Import {count} rows' },
    importPreview: 'Preview', importReplace: 'Replace existing rows', importDone: { one: 'Imported {count} row', other: 'Imported {count} rows' },
    importIgnore: '— skip —', importChoose: 'Choose a CSV file or drop it here', importEmpty: 'The file has no rows.',
    views: 'Views', saveView: 'Save current view', viewName: 'View name', viewSave: 'Save', setDefault: 'Set as default',
    isDefault: 'Default view', deleteView: 'Delete view "{name}"', resetView: 'Original layout', noViews: 'No saved views yet',
    viewSaved: 'View "{name}" saved', viewApplied: 'View "{name}" applied',
    actions: 'Actions', moreActions: 'More actions', edit: 'Edit', save: 'Save', cancel: 'Cancel', editCell: 'Edit {column}',
    saving: 'Saving…', saveFailed: 'Could not save the change', undone: 'Change undone', invalid: 'Invalid value',
    confirm: 'Are you sure?', confirmOk: 'Confirm', total: 'Total', refresh: 'Refresh', details: 'Details', close: 'Close',
    aggSum: 'Sum', aggAvg: 'Avg', aggCount: 'Count', aggMin: 'Min', aggMax: 'Max',
    groupRows: { one: '{count} row', other: '{count} rows' },
  },
});

const DT_NS = 'orion:datatable:';
const DT_TYPES_END = new Set(['number', 'currency', 'percent']);
const DT_NUMERIC = new Set(['number', 'currency', 'percent', 'progress']);
const DT_DATES = new Set(['date', 'datetime']);
const DT_DEFAULT_W = { text: 160, number: 110, currency: 130, percent: 100, date: 130, datetime: 180, boolean: 96, badge: 124, progress: 160, avatar: 240, link: 160, actions: 96, html: 180 };
const DT_ROW_H = { compact: 34, normal: 44, comfortable: 56 };
const DT_INTERACTIVE = 'a[href],button,input,select,textarea,label,summary,[contenteditable]:not([contenteditable="false"]),[data-dt-interactive],o-select,o-datepicker,o-daterange';

/* ── comparison ───────────────────────────────────────────────────────── */
const __collators = new Map();
function dtCollator() {
  const l = i18n.locale;
  let c = __collators.get(l);
  if (!c) { try { c = new Intl.Collator(l, { numeric: true, sensitivity: 'base' }); } catch { c = new Intl.Collator('en', { numeric: true, sensitivity: 'base' }); } __collators.set(l, c); }
  return c;
}
/** Normalize a value for sorting: numbers stay numbers, dates become timestamps, null stays null. */
function dtSortKey(v, type) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (v instanceof Date) return +v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (DT_DATES.has(type)) { const d = date.parse(v); return d ? +d : null; }
  if (DT_NUMERIC.has(type)) { const n = +v; return Number.isNaN(n) ? fmt.parseNumber(v) : n; }
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return String(v.label ?? v.name ?? v.title ?? JSON.stringify(v));
  return String(v);
}
/** Compare two normalized keys; null/empty always sorts last (in both directions — handled by caller). */
function dtCmp(a, b, coll) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return coll.compare(a, b);
}

/* ── text helpers ─────────────────────────────────────────────────────── */
/** Split a search query into lower-case words ("quoted phrases" stay together). */
function dtWords(q) {
  const out = [];
  String(q ?? '').toLowerCase().replace(/"([^"]+)"|(\S+)/g, (m, a, b) => { out.push(a || b); return m; });
  return out.filter(Boolean);
}
/** Escape text and wrap every occurrence of any word in <mark>. */
function dtHighlight(text, words) {
  const s = String(text ?? '');
  if (!words || !words.length || !s) return esc(s);
  const low = s.toLowerCase(), ranges = [];
  for (const w of words) { let i = low.indexOf(w); while (i >= 0 && w) { ranges.push([i, i + w.length]); i = low.indexOf(w, i + w.length); } }
  if (!ranges.length) return esc(s);
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) { const l = merged[merged.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else merged.push([...r]); }
  return highlight(s, merged);
}
const __stripTpl = isBrowser ? doc.createElement('template') : null;
/** Plain text of an HTML string (for search/export of rendered cells). */
function dtText(markup) {
  if (markup == null) return '';
  if (markup instanceof Node) return markup.textContent || '';
  const s = String(markup);
  if (!/[<&]/.test(s) || !__stripTpl) return s;
  __stripTpl.innerHTML = s;
  return __stripTpl.content.textContent || '';
}
/** Fill "{key}" placeholders from a row: tpl('/users/{id}', row) */
const dtTpl = (str, row) => String(str).replace(/\{([\w.]+)\}/g, (m, k) => encodeURIComponent(getPath(row, k) ?? ''));
const dtIsInteractive = (el, stop) => { const m = el?.closest?.(DT_INTERACTIVE); return !!(m && (!stop || stop.contains(m)) && m !== stop); };

/* ── CSV ──────────────────────────────────────────────────────────────── */
/** csvStringify([[...], ...], ',') — RFC 4180 quoting; cells starting with = + - @ are prefixed (formula-injection safe). */
function csvStringify(rows, delim = ',') {
  const cell = v => {
    let s = v == null ? '' : v instanceof Date ? date.format(v, 'YYYY-MM-DD HH:mm') : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /["\n\r]|^\s|\s$/.test(s) || s.includes(delim) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return rows.map(r => r.map(cell).join(delim)).join('\r\n');
}
/** csvParse(text) -> string[][] (auto-detects , ; tab |, handles quotes and CRLF, strips a BOM) */
function csvParse(text, delim) {
  const s = String(text ?? '').replace(/^\ufeff/, '');
  if (!delim) {
    const head = s.slice(0, s.search(/\r?\n/) >>> 0 || 2000);
    const counts = [',', ';', '\t', '|'].map(d => [d, head.split(d).length]);
    delim = counts.sort((a, b) => b[1] - a[1])[0][0];
  }
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"' && cur === '') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.length > 1 || r[0] !== '');
}
/** Convert an imported cell string to a typed value for a column type. */
function dtCoerce(v, type) {
  if (v == null) return v;
  const s = String(v).trim();
  if (DT_NUMERIC.has(type)) { if (s === '') return null; const n = +s; return Number.isNaN(n) ? fmt.parseNumber(s) : n; }
  if (type === 'boolean') return /^(true|yes|1|y|on|✓)$/i.test(s);
  if (DT_DATES.has(type)) return s ? date.parse(s) || s : null;
  return s;
}

/** Copy text to the clipboard (async API with a textarea fallback). */
async function dtCopy(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0;inset-inline-start:-9999px' }); ta.value = text; doc.body.append(ta); ta.select();
    let ok = false; try { ok = doc.execCommand('copy'); } catch {} ta.remove(); return ok;
  }
}
