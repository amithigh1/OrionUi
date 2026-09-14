# datatable — `<o-datatable>` / `Orion.DataTable`

Full-featured data grid: client and server-side processing, sorting (incl. multi-sort), global
search, per-column filters (with faceted chips), row selection, bulk and row actions, inline
editing (cell and row modes), master-detail rows, tree grid, grouping with aggregates, virtual
and infinite scrolling, frozen/resizable/reorderable columns, saved views, CSV/JSON/print/import,
responsive stack & priority modes, and full ARIA grid keyboard support. No third-party code.

Docs: `docs/components/datatable*.html`. Depends on `pagination` (`// @deps pagination`) and,
optionally, `basics` (`<o-avatar>`, used by the `avatar` column type when defined).

## Files

| File | Contents |
|---|---|
| `00-base.js` | i18n strings (`table.*`), shared constants, comparison/sort-key helpers, text/highlight helpers, CSV read/write, clipboard copy |
| `10-columns.js` | column normalization (`dtColumn`), per-type formatters, cell markup by type, aggregate computation |
| `20-pipeline.js` | client filter → search → sort → group/tree → page pipeline; facet counts; `total` getter |
| `20-datatable-panels.css` | popovers, menus, dialogs, filter/column/export/import/views panel styles |
| `30-element.js` | `<o-datatable>` props, lifecycle, column setup, data source wiring, core public API |
| `35-server.js` | server-side `source(query)` / `url` fetching, response normalization, infinite loading |
| `40-layout.js` | header rendering, column widths, frozen columns, sticky header, footer aggregates, pager |
| `45-body.js` | keyed row patching, virtual-scroll windowing, group/detail/state rows |
| `50-events.js` | clicks, sorting, selection, expand/collapse, tree toggling, row actions |
| `55-keyboard.js` | ARIA grid keyboard navigation, column resize/reorder (pointer + keyboard), column API |
| `60-panels.js` | built-in popover/menu/confirm, per-column filter controls, column chooser, density menu, export panel |
| `70-toolbar.js` | toolbar, search box, filter chips, bulk-action bar, filter row |
| `80-edit.js` | inline editing (cell & row), validation, async `onSave`, dirty tracking, undo |
| `85-io.js` | export (CSV/JSON/clipboard + pluggable XLSX/PDF), CSV import with preview, print/print-preview |
| `90-state.js` | `getState`/`setState`, `localStorage` persistence, saved views |
| `95-plain.js` | `data-o-table` behavior: sort/search/paginate a plain `<table>` without the custom element |
| `99-define.js` | assembles the mixins onto `ODataTable.prototype`, defers API calls made before init, registers the element |
| `10-datatable.css` | tokens-only styles for the table itself (toolbar, head, rows, cells, states) |

## Usage

```html
<o-datatable
  columns='[{"key":"name","title":"Name"},{"key":"amount","type":"currency"}]'
  rows='[{"id":1,"name":"Ada","amount":420},{"id":2,"name":"Grace","amount":990}]'
  selectable="multi" editable></o-datatable>
```

```js
const dt = Orion.datatable('#panel', {
  columns: [...],
  source: async (query, { signal }) => {          // { page, pageSize, sort, search, filters }
    const res = await fetch(`/api/rows?${new URLSearchParams(query)}`, { signal });
    return res.json();                             // { rows, total }
  },
});
dt.addEventListener('o-cell-edit', e => console.log(e.detail));
```

`Orion.datatable(target, config)` configures `target` if it is already an `<o-datatable>`,
otherwise creates one inside `target` and assigns `config` as properties.

## `<o-datatable>` properties / attributes

Attribute names are the kebab-case form of the property (`pageSize` → `page-size`) unless noted.
Array/Object props accept a JSON string in markup; Function props resolve an attribute value to a
`window`-scoped function name (e.g. `filter-fn="myFilterFn"`); `bulkActions`/`rowActions` are
**property-only** (`attr: false`) because their entries are objects with functions.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `rows` | `object[]` | `[]` | Client-mode data. Ignored once `source`/`url` is set (server mode). |
| `columns` | `ColumnDef[]` | `[]` | See **Column definition** below. If empty and `rows` has objects, columns are inferred from the first row's own keys (type guessed: number/date/boolean/text). |
| `source` | `(query, {signal, table}) => Promise<Response \| any[]>` | – | Server-mode data function. Presence of `source` **or** `url` switches the table to server mode. |
| `url` | `string` | – | Server-mode REST endpoint; supports `{page}`/`{pageSize}`/`{search}`/`{sort}`/... template tokens, else query-string params + `filter[key]=`. |
| `mapResponse` | `(json, query) => Response` | – | Reshape a raw `fetch` JSON body before normalization (used with `url`). |
| `fetchOptions` | `RequestInit` | – | Extra options merged into the internal `fetch()` call (used with `url`). |
| `rowKey` | `string` | `'id'` | Dot-path to a stable row id (`getPath`). Rows without one get an internal generated key. |
| `page` | `number` | `1` | Current page (1-based). |
| `pageSize` | `number` | `10` | Rows per page. |
| `pageSizes` | `number[]` | `[10,25,50,100]` | Options shown in the pager's page-size select. |
| `pagination` | `boolean` | `true` | Client mode only; ignored when `virtual` or `infinite` is on. |
| `sort` | `SortSpec[]` | `[]` | `[{ key, dir }]`, `dir` is `'asc' \| 'desc'`. Multiple entries = multi-sort (priority = array order). |
| `sortable` | `boolean` | `true` | Table-level default for `column.sortable`. |
| `multiSort` | `boolean` | `true` | Shift-click a header to add a sort level instead of replacing. |
| `search` | `string` | `''` | Current global search text (also bound to the toolbar search box). |
| `searchable` | `boolean` | `true` | Shows the search box (client mode filters `column.searchable` columns; server mode just forwards `search` in the query). |
| `searchDebounce` | `number` | `250` | ms; server mode always debounces by this; client mode uses `min(searchDebounce, 150)`. |
| `filters` | `Record<string, any>` | `{}` | Active per-column filter values, keyed by column `key` (or `id`). Shape depends on the column's filter type (see below). |
| `filterable` | `boolean` | `false` | Table-level default: turns on a filter for every eligible column (a column can still opt out with `filterable: false` or opt in alone). |
| `filterRow` | `boolean` | `false` | Shows the inline per-column filter row instead of (in addition to) header filter buttons. |
| `filterFn` | `(row) => boolean` | – | Extra client-side predicate applied on top of column filters and search. |
| `selectable` | `''\|'single'\|'multi'` | `''` | `<o-datatable selectable>` (empty attribute) behaves as `'multi'`. |
| `selectOnClick` | `boolean` | `false` | Selects/deselects a row on any click, not just the checkbox. |
| `bulkActions` | `BulkAction[]` | `[]` | Property only. See **Actions** below. |
| `rowActions` | `RowAction[]` | `[]` | Property only. Auto-adds an `actions`-type column when non-empty (or when `editMode: 'row'` and a column is editable). |
| `editable` | `boolean` | `false` | Table-level default for `column.editable` (only editable-type columns qualify — see **Column definition**). |
| `editMode` | `'cell'\|'row'` | `'cell'` | `'row'` edits every editable cell of a row at once with Save/Cancel buttons. |
| `onSave` | `(row, changes, ctx) => any \| Promise<any>` | – | Called after an optimistic update; return `false` (or throw) to roll back. `ctx = { column, oldValue, table }` (cell mode) or `{ table, oldValues }` (row mode). |
| `detail` | `(row, {table}) => Node \| string \| SafeHTML \| Promise<...>` | – | Master-detail renderer; presence adds the expand column. |
| `tree` | `TreeConfig` | – | `{ childrenKey='children', hasChildren?(row), lazy?(row) => Promise<children[]> }`. Presence turns on tree-grid mode (`role="treegrid"`). |
| `groupBy` | `string` | `''` | Column key to group rows by (adds collapsible group header rows + per-column `aggregate`). |
| `virtual` | `boolean` | `false` | Virtual scrolling (windowed row rendering); disables `pagination`. |
| `rowHeight` | `number` | – | Fixed row height (px) for virtual scrolling; otherwise auto-measured from `density`. |
| `height` | `string` | – | With `virtual`: fixed scroll-container height (default `'30rem'`). Without: `max-height` (own internal scrollbar). |
| `infinite` | `boolean` | `false` | Infinite-scroll loading (client: reveals more of `_items`; server: fetches the next page) via an `IntersectionObserver` sentinel. |
| `responsive` | `'scroll'\|'stack'\|'priority'` | `'scroll'` | `'stack'` renders cards below ~480px; `'priority'` progressively hides low-`column.priority` columns (moved into the detail row) as width shrinks. Reflected attribute. |
| `density` | `'compact'\|'normal'\|'comfortable'` | `'normal'` | Row heights 34/44/56px. Reflected attribute. |
| `striped` | `boolean` | `false` | Zebra-striped rows. |
| `hover` | `boolean` | `true` | Row hover highlight. |
| `bordered` | `boolean` | `false` | Cell borders. |
| `stickyHeader` | `boolean` | `true` | Sticky header (own scroll container, or page-level sticky when the table scrolls with the page). |
| `stickyOffset` | `number` | `0` | px offset from the viewport top for page-level sticky header (e.g. a fixed site header). |
| `resizable` | `boolean` | `true` | Table-level default for `column.resizable`. |
| `reorderable` | `boolean` | `true` | Table-level default for `column.reorderable` (drag column headers, or Ctrl+Shift+Arrow). |
| `aggregates` | `boolean` | `true` | Shows the footer aggregate row when any column defines `aggregate`. |
| `stateKey` | `string` | – | Enables `localStorage` persistence of `getState()` under `orion:datatable:<stateKey>`, and saved views. |
| `views` | `View[]` | – | Preset saved views: `[{ name, state }]` (merged with any user-saved views under the same key). |
| `toolbar` | `boolean \| ToolbarConfig \| string[]` | `true` | `false` hides it; an array of keys (`['search','export']`) enables only those; an object overrides individual flags — see `_tbConf()`: `{ search, filters, columns, density, export, views, import, refresh, print, actions: Action[] }`. |
| `importable` | `boolean` | `false` | Shows the toolbar Import button (CSV, or XLSX when `Orion.xlsx.read` is registered). |
| `exportFilename` | `string` | `'export'` | Base filename (without extension) for exports/downloads. |
| `rowClass` | `(row) => string` | – | Extra class name(s) for a row's `<tr>`. |
| `label` | `string` | – | Accessible name for the grid/toolbar (`aria-label`); also used as the print/export title. |
| `emptyText` | `string` | – | Overrides the default "No data yet" message when there are no rows and no active search/filter. |
| `loading` | `boolean` (reflected) | `false` | Forces the busy indicator on (in addition to the automatic one during server fetches). |
| `texts` | `Record<string,string>` | – | Per-instance string overrides, read via `this.t('table.xxx')` (see `t()` on `OElement`). |

Additionally, `<o-datatable flush>` is a **plain CSS attribute** (not a reactive prop) that removes
the border/radius/shadow so the table can sit flush inside a card — set it in markup, not as a
JS property.

## Column definition

```ts
interface ColumnDef {
  key?: string;                     // dot-path into the row ('user.name'); omit for a computed/actions column
  id?: string;                      // defaults to key, or 'col<i>', or '__actions'
  title?: string;                   // defaults to a humanized key ('firstName' -> 'First Name')
  type?: 'text' | 'number' | 'currency' | 'percent' | 'date' | 'datetime' | 'boolean'
       | 'badge' | 'progress' | 'avatar' | 'link' | 'html' | 'actions';   // default 'text'
  value?: (row) => any;             // custom getter; overrides `key`
  format?: string | number | Intl.NumberFormatOptions | Intl.DateTimeFormatOptions
         | ((value, row) => string);
  align?: 'start' | 'center' | 'end';                // default: 'end' for number/currency/percent, 'center' for boolean, 'end' for actions, else 'start'
  width?: number | string; minWidth?: number /* 56 */; maxWidth?: number /* 1600 */;
  frozen?: true | 'start' | 'end';
  resizable?: boolean;   // default: table's `resizable`
  reorderable?: boolean; // default: table's `reorderable`
  priority?: number;     // responsive="priority": lower survives longer (default: 1 for the first 2 columns and `actions`, else 2+)
  sortable?: boolean;    // default: table's `sortable` (false when there's no `key`)
  sortFirst?: 'asc' | 'desc';           // direction of the first click (default 'asc')
  sortFn?: (a, b, rowA, rowB) => number;
  filterable?: boolean;
  filter?: 'text' | 'number-range' | 'date-range' | 'boolean' | 'select' | 'multiselect';
           // auto-picked from `type` (see table below) when `filterable` is on, or when `filterOptions` is set
  filterFn?: (value, filterValue, row) => boolean;    // fully custom column filter
  filterOptions?: Array<string | { value, label }> | ((table) => that[]);  // for select/multiselect
  searchable?: boolean;   // default true (participates in the global search text blob)
  exportable?: boolean;   // default true
  exportValue?: (row) => any;               // raw value override for export
  editable?: boolean | ((row) => boolean);  // default: table's `editable` AND type is in the editable set AND `key` is set AND no `render`
  editor?: 'text' | 'number' | 'date' | 'datetime' | 'checkbox' | 'select'
         | ((ctx: { value, row, column, commit(), cancel(), table }) => Node | { el?, input?, get(), focus() });
  options?: Array<string | { value, label }>;  // choices for a 'select' editor / badge-type columns
  required?: boolean; min?: number; max?: number; validate?: (value, row) => true | string | false;
  render?: (row, value, { column, table }) => Node | string | SafeHTML;  // full custom cell content
  html?: boolean;         // when using `render`/type:'html': treat the string as trusted (skip sanitize())
  wrap?: boolean;         // allow the cell to wrap instead of truncating
  headerTooltip?: string; headerClass?: string; className?: string;
  cellClass?: (row, value) => string;
  hidden?: boolean;       // initially hidden (still listed in the column chooser)
  aggregate?: 'sum' | 'avg' | 'count' | 'min' | 'max' | ((values, rows) => any);
  aggregateFormat?: (value) => string;

  // type: 'currency'
  currency?: string;      // ISO 4217 code; default Orion.config.currency ?? 'USD'
  // type: 'percent'      — value is a RATIO (0.42 -> "42%"); set `scale` if your data is 0-100
  scale?: number;         // divides the raw value before formatting (default 1)
  // type: 'progress'
  max?: number;           // full-bar value, default 100 (percent shown = value / max)
  color?: string | ((value, row) => string);   // bar/label color (color-context class, default 'primary')
  // type: 'boolean'
  trueLabel?: string; falseLabel?: string;      // default t('table.yes') / t('table.no')
  // type: 'badge'
  colors?: Record<string, string> | ((value, row) => string);  // label -> color name (see below); falls back to `color`, then 'secondary'
  // type: 'avatar'
  avatar?: string | ((row) => string);          // image src (dot-path or function)
  subtitle?: string | ((row) => string);        // secondary line under the name
  // type: 'link'
  href?: string | ((row) => string);            // '{token}' templates fill from the row (URI-encoded); falls back to the cell value
  target?: string;        // '_blank' automatically adds rel="noopener noreferrer"
}
```

Shorthand: a plain string in the `columns` array (`columns: ['name', 'email']`) is equivalent to
`{ key: 'name' }`.

**Badge colors**: for `type: 'badge'`, the value (or each array item for a multi-value badge) is
looked up in `column.colors` — an object keyed by the badge's label/name (`{ Active: 'success',
Pending: 'warning', Closed: 'secondary' }`) or a `(value, row) => colorName` function. If nothing
matches, `column.color` is used, then `'secondary'`. The color name maps directly to
`.o-badge-soft-{color}` (any `o-badge` color: `primary`, `secondary`, `success`, `danger`,
`warning`, `info`, or a custom `.o-c-*` context color).

**Default per-column filter type** (when `filterable` is on and `filter` isn't set explicitly):

| Column type | Filter |
|---|---|
| `number`, `currency`, `percent`, `progress` | `number-range` (`{ min, max }`) |
| `date`, `datetime` | `date-range` (`{ from, to }`, ISO date strings) |
| `boolean` | `boolean` (`true`/`false`/`null`) |
| `badge`, or any column with `filterOptions` | `multiselect` (`string[]` of option values) |
| everything else | `text` (case-insensitive substring, `string`) |

**Editable types**: `text`, `number`, `currency`, `percent`, `date`, `datetime`, `boolean`,
`badge`, `link`, `progress` (boolean columns without a custom `editor` toggle immediately on
click/Enter instead of opening an editor).

An `actions`-type column (no `key`) is auto-appended when `rowActions.length` or
(`editMode: 'row'` and any column is editable) and no explicit `actions` column exists.

### Actions

```ts
interface RowAction {
  label: string | ((row) => string); icon?: string; variant?: string; inline?: boolean;
  hidden?: boolean | ((row) => boolean); disabled?: boolean | ((row) => boolean);
  confirm?: boolean | string | ((row) => string);
  action(row, ctx: { table, event?, key }): any | Promise<any>;
}
interface BulkAction {
  label: string; icon?: string; variant?: string;
  confirm?: boolean | string | ((rows, ctx) => string);
  action(rows, ctx: { table, all: boolean, query, keys: string[], count: number }): any | Promise<any>;
}
```
Up to 2 row actions (or any flagged `inline: true`) render as buttons; the rest collapse into a
"⋯" menu.

## Server mode — `source(query)`

Server mode activates when `source` or `url` is set. Any change to `rows`/`source`/`url`,
`search`, `filters`, `sort`, `page` or `pageSize` triggers a fetch (stale in-flight requests are
aborted via `AbortController` and ignored on return).

**Request** (`getQuery()`; also what `source(query, ctx)` receives):
```ts
interface Query {
  page: number; pageSize: number;
  sort: Array<{ key: string; dir: 'asc' | 'desc' }>;
  search: string;
  filters: Record<string, any>;    // only non-empty filter values, keyed like `filters` prop
}
```
`source(query, { signal, table })` is called with an `AbortSignal` and the table instance.

**Response** — return (or resolve to) any of:
```ts
type Response =
  | any[]                                            // treated as { rows: array, total: array.length }
  | { rows | data | items | results | records: any[];
      total? | totalCount? | count? | recordsFiltered? | meta?: { total? }: number;
      facets?: Record<string, Record<string, number>>;   // per-column value counts, for filter option lists
      aggregates?: Record<string, number>;                // per-column footer aggregate values (keyed by column key)
    };
```
`mapResponse(json, query)` can reshape a raw `fetch` body before this normalization (used with
`url`, not `source`). With `url`, `{page}`, `{pageSize}`/`{size}`/`{limit}`, `{offset}`,
`{search}`/`{q}`, `{sort}` (`"key:dir,..."`), `{sortKey}`, `{dir}`, `{filters}` (JSON) template
tokens are substituted if the URL contains `{...}`; otherwise they're appended as query params
(`filter[key]=value`, JSON-stringified for arrays/objects).

## Events

All events bubble, are composed, and are dispatched as `o-<name>`. Cancelable ones are called via
`this.emit()`, so `e.preventDefault()` in a listener stops the action.

| Event | Cancelable | `detail` |
|---|---|---|
| `o-search` | | `{ search }` |
| `o-filter` | | `{ filters, key?, value? }` |
| `o-sort` | | `{ sort, column? }` — `column` present when triggered by a header click |
| `o-page` | | `{ page, pageSize }` |
| `o-row-click` | | `{ row, key, column, event }` |
| `o-row-dblclick` | | `{ row, key, column, event }` |
| `o-select` | | `{ rows, keys, count, all, query? }` — `query` is set when `all` (server "select all results") |
| `o-expand` | | `{ row, key, expanded }` (single row), `{ row, key, expanded, tree: true }` (tree node), or `{ all: true, expanded }` (expand/collapse-all) |
| `o-group` | | `{ groupBy }` |
| `o-column-resize` | | `{ column, width }` |
| `o-column-move` | | `{ column, order }` — `order` is the full new column-id order |
| `o-column-toggle` | | `{ column, visible }` |
| `o-load` | | `{ rows, total, query }` — server mode, after a successful fetch |
| `o-error` | | `{ error, query }` (server fetch) or `{ error, row }` (tree lazy-load) |
| `o-edit-start` | | `{ row, key, column }` (cell) or `{ row, key, mode: 'row' }` |
| `o-edit-cancel` | | `{ row, key, column }` |
| `o-cell-edit` | ✓ | `{ row, key, column, value, oldValue, undo }` — fired before applying; mutate `detail.value` to coerce it |
| `o-cell-change` | | `{ row, key, column, value, oldValue, undo }` (cell mode) or `{ row, key, changes, mode: 'row' }` (row mode) — fired after a successful save |
| `o-save-error` | | `{ row, key, column, value, oldValue, error }` |
| `o-row-edit` | ✓ | `{ row, key, changes }` — row mode, before saving |
| `o-export` | | `{ format, count, text? }` — `text` set for csv/tsv/json/clipboard |
| `o-import` | ✓ | `{ rows, replace }` |
| `o-state-change` | | `{ state, view }` — debounced 250ms; `state` = `getState()` shape |
| `o-view-save` | | `{ name, state }` |
| `o-view-change` | | `{ name, state }` |

## Methods

Calls to the API methods marked † made immediately after `document.createElement('o-datatable')`
(before it connects/initializes) are queued and run once ready, not lost.

**Data**
| Method | Returns | |
|---|---|---|
| `setRows(rows)` | `this` | Replace client rows. |
| `reload()` | `Promise<void>` | Re-run the pipeline (client) or re-fetch (server). |
| `refresh()` | `Promise<void>` | Alias of `reload()` — use after mutating row objects in place. |
| `getRows({ filtered?, selected?, page?, sorted? })` | `object[]` | No options = every row (tree: flattened). |
| `getSelected()` | `object[]` | |
| `getQuery()` | `Query` | The query that would be sent to `source`/`url` right now. |
| `getChanges()` | `{ key, row, columns: string[] }[]` | Dirty (edited, unsaved-elsewhere) cells. |
| `acceptChanges()` | `void` | Clears dirty markers and undo history. |
| `addRow(row, { at? })` †| `row` | `at`: `'start' \| 'end' \| number` (default `'end'`); client mode. |
| `updateRow(ref, patch)` †| `row \| null` | Deep-merges `patch` via `setPath` and re-renders the row. |
| `removeRow(ref \| ref[])` †| `void` | |

**Sort / filter / page**
| Method | Returns | |
|---|---|---|
| `setSearch(q)` | `void` | |
| `setFilter(key, value)` | `void` | `value == null` (or empty array/blank object) clears it. |
| `clearFilters({ search? = true })` | `void` | |
| `setSort(key, dir = 'asc')` / `setSort([{key,dir}, ...])` / `setSort(null)` | `void` | |
| `goToPage(n)` | `void` | Clamped to `1..pageCount`. |
| `pageCount` (getter) | `number` | |
| `total` (getter) | `number` | Row count after filtering (server: response `total`). |
| `columnOrder` (getter) | `string[]` | Current data-column id order. |

**Selection**
| Method | | |
|---|---|---|
| `select(refs, on = true)` †| `refs`: key, row or array of either. |
| `selectAll(scope = 'all')` †| `'all'` = every filtered row (server: flags "all results", see `o-select`'s `all`); `'page'` = current page only. |
| `clearSelection()` | |

**Expand / tree / groups**
| Method | | |
|---|---|---|
| `toggleExpand(ref, force?)` / `expand(ref)` / `collapse(ref)` †| Master-detail rows. |
| `expandAll()` / `collapseAll()` †| Detail rows, tree nodes, or groups depending on mode. |
| `toggleNode(ref, force?)` †| `Promise<void>` — tree grid; awaits `tree.lazy(row)` on first open. |

**Columns**
| Method | | |
|---|---|---|
| `setColumnWidth(id, px, announce?)` †| |
| `autofitColumn(id)` †| Fits to the widest rendered header/cell content. |
| `moveColumn(id, targetIdOrIndex, before = true)` †| |
| `setColumnVisible(id, visible)` †| |
| `resetColumns()` †| Restores original order/visibility/widths. |

**Editing**
| Method | Returns | |
|---|---|---|
| `editCell(ref, columnId)` †| `boolean` | Opens the cell editor. |
| `editRow(ref)` †| `boolean` | Opens row-edit mode. |
| `saveRowEdit()` | `Promise<boolean>` | |
| `cancelRowEdit(refocus? = true)` | `void` | |
| `undo()` | `Promise<boolean>` | Reverts the last committed edit (Ctrl+Z). |

**Export / import / print**
| Method | Returns | |
|---|---|---|
| `exportData({ rows?, columns?, formatted? })` | `{ columns, header, rows, objects, filename, title }` | `rows`: `'filtered'\|'selected'\|'page'\|'all'\|array` (default `'filtered'`); `columns`: `'visible'\|'all'`. |
| `export(format = 'csv', opts)` | `Promise<string \| void>` | `'csv'\|'tsv'\|'json'\|'clipboard'\|'xlsx'\|'pdf'\|'print'\|'preview'`; `{ download: false }` returns the text without saving/copying. `xlsx`/`pdf` defer to `Orion.export`/`Orion.xlsx.export`/`Orion.PDF.export` when registered (`ODataTable.exporters.<format>` also works), else fall back to preview/CSV. |
| `printHTML(opts)` | `string` | Standalone printable HTML document of the current view. |
| `print(opts)` | `string` | Prints via a hidden iframe; returns the HTML used. |
| `printPreview(opts)` | dialog handle | Uses `Orion.printPreview` when available, else a built-in preview dialog. |
| `importFile(opts)` | `void` | Opens a file picker for CSV (or XLSX with `Orion.xlsx.read`). |
| `importCSV(fileOrText, { preview? = true, replace? = false })` | `Promise<object[] \| null>` | |

**State / views**
| Method | Returns | |
|---|---|---|
| `getState()` / `setState(state, { persist? = true })` | `State` / `void` | See **State object**. |
| `getViews()` | `{ name, state, preset? }[]` | |
| `saveView(name, state = getState())` | `State` | |
| `applyView(name)` †| `boolean` | |
| `deleteView(name)` / `setDefaultView(name)` / `resetView()` †| `void` | |
| `scrollToRow(ref, { focus?, highlight? = true })` | `boolean` | Switches page / scrolls virtual list / flashes the row. |

**Misc**
| Method | | |
|---|---|---|
| `focus(opts)` | Focuses the active grid cell (ARIA grid roving tabindex). |

**Static**
| | |
|---|---|
| `ODataTable.exporters.<format> = async (data, opts) => any` | Register a pluggable export format (`data` = `exportData()` shape). |
| `ODataTable.csv.parse(text)` / `.stringify(rows)` | RFC 4180 CSV helpers (auto-delimiter detection on parse). |
| `Orion.datatable(target, config)` | Factory: configure or create an `<o-datatable>` in `target`. |

## State object

```ts
interface State {
  columns: { order: string[]; hidden: string[]; widths: Record<string, number> };
  sort: Array<{ key: string; dir: 'asc' | 'desc' }>;
  filters: Record<string, any>;
  search: string;
  pageSize: number;
  density: 'compact' | 'normal' | 'comfortable';
  groupBy: string;
  filterRow: boolean;
}
```
`getState()` returns a fresh snapshot; `setState(partial)` applies whichever keys are present
(others are left alone) and resets to page 1. With `stateKey` set, this shape is what's persisted
to `localStorage` (`orion:datatable:<stateKey>`) and stored per saved view.

## CSS variables

Set on `.o-datatable` (mostly JS-computed layout values; override the first group for styling):

| Variable | Default | Purpose |
|---|---|---|
| `--o-dt-py`, `--o-dt-px` | `.375rem` / `.875rem` (density-adjusted) | Cell padding. |
| `--o-dt-fs` | `--o-fs-base` (`--o-fs-sm` at `density="compact"`) | Cell font size. |
| `--o-dt-head-bg` | `--o-surface-2` | Header row background. |
| `--o-dt-shadow-s`, `--o-dt-shadow-e` | derived from `--o-dark` | Scroll shadows on frozen start/end columns (flip under `[dir="rtl"]`). |
| `--o-dt-row-h` | 34/44/56px by `density`, or `rowHeight` | Row height (virtual scrolling relies on this). |
| `--o-dt-sy` | *(computed)* | Page-level sticky header vertical offset while scrolling. |
| `--o-dt-vw` | *(computed)* | Visible scroll-container width (layout use). |
| `--o-dt-head-h` | *(computed)* | Measured header height. |
| `--o-dt-level` | *(computed, per row)* | Tree-grid indent level. |

Plus the global tokens all components share (surfaces, text, borders, semantic colors, radius,
shadow, focus ring — see `ARCHITECTURE.md` §8).

## Accessibility

- `role="grid"` (or `"treegrid"` when `tree` is set) with a full ARIA grid keyboard model:
  Arrow keys, Home/End (Ctrl = first/last cell in the table), PageUp/PageDown, Enter (sort /
  activate / open editor), F2 (edit), Space (select / sort), Ctrl+A (select all), Ctrl+Z (undo),
  Ctrl(+Shift)+Arrow on a header (resize / reorder a column).
- Sortable headers get `aria-sort`; selectable rows get `aria-selected` and the header checkbox
  drives `aria-multiselectable`; tree rows get `aria-level`/`aria-posinset`/`aria-setsize`/
  `aria-expanded`.
- Announces via `Orion.announce()`: sort changes, selection counts, column resize/move, row
  removal, undo, and search result counts.
- Horizontal arrow keys and column drag/resize follow `isRTL()`.

## Notes & limits

- `filterOptions` / `facetCounts` in server mode read the response's `facets` map instead of
  scanning local data — populate it if you want counts or auto-built select options.
- `virtual` and `pagination` are mutually exclusive (virtual wins); `infinite` also disables
  standard pagination.
- The `data-o-table` behavior (`95-plain.js`) gives a **plain** `<table class="o-table">` search/
  sort/paginate for free, without the custom element — useful for server-rendered tables. It's
  skipped automatically inside an `<o-datatable>`.
