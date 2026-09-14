# pivot — `<o-pivot>` drag & drop pivot table

`src/components/pivot/pivot.js` (+ `pivot.css`). Declares `// @deps exporter` (uses
`O.xlsx.write`/`O.export.to` at runtime for `export()`). Registers the custom element `<o-pivot>`
(class `O.Pivot`) and a headless engine namespace `O.pivot`.

```js
define('o-pivot', OPivot);
O.Pivot = OPivot;
O.pivot = { compute, layout, fields: fieldDefs, normalize: normConfig };
```

`<o-pivot>` extends `OElement` (light DOM, **not** form-associated). It renders its own toolbar,
a field-list side panel, and a table (or, when `O.chart` is loaded, a chart view).

## Properties / attributes

| Property | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `data` | `data` (JSON) | `object[]` | `[]` | Flat records. |
| `config` | `config` (JSON) | `Config` | `{}` | Layout — see below. **Assign a new object** to change it (it's normalized internally; mutating the existing object in place won't trigger an update). |
| `fields` | `fields` (JSON) | `FieldDef[]` | `[]` | Optional field metadata; auto-detected from `data` (up to the first 300 records) when omitted or incomplete. |
| `fieldList` | `field-list` | `boolean` | `true` | Shows/hides the drag & drop field panel. |
| `editable` | `editable` | `boolean` | `true` | Enables drag-and-drop, the field menu, sort clicks and filter buttons. |
| `view` | `view` | `'table' \| 'chart'` | `'table'` | Chart view only appears (segmented control shown) when `O.chart` exists. |
| `maxRows` | `max-rows` | `number` | `2000` | Cap on **rendered** body rows (grand-total row is always shown); collapse groups or filter to see more — this does not affect `getResult()`/`export()`, which are not capped. |
| `texts` | — (`attr: false`, property only) | `object` | — | Per-instance string overrides, read via `this.t('pivot.<key>')`. |

## `FieldDef`

```ts
type FieldDef = {
  key: string,                       // '.' allowed but not treated as a path unless you don't override `get`
  label?: string,                    // default: humanized key
  type?: 'string'|'number'|'date'|'boolean',   // auto-detected from up to 300 sampled records when omitted
  get?(record) -> any,               // custom accessor (default: dot-path getter, or a derived-field accessor — see below)
  format?(rawValue) -> string,       // used for row/column group labels of this field (not value formatting — see values[].format)
};
```

Every `date`-typed field (that isn't itself derived) automatically gets three **derived** virtual
fields registered alongside it: `'<key>:year'` (number), `'<key>:quarter'` (string `'Q1'`..`'Q4'`),
`'<key>:month'` (string `'YYYY-MM'`, displayed as e.g. "Jan 2026"). Use them directly in
`config.rows`/`config.columns`, e.g. `rows: ['date:year']`.

## `Config`

```ts
type Config = {
  rows?: (string | { field: string })[],       // row grouping fields, outer to inner
  columns?: (string | { field: string })[],    // column grouping fields, outer to inner
  values?: (string | ValueSpec)[],              // measures; a bare string means { field, agg: 'sum' }
  filters?: Record<string, any[] | null>,       // field -> allowed raw values (dimKey-compared) or null (kept in the Filters zone, unrestricted)
  filter?(record) -> boolean,                    // extra custom predicate, ANDed with `filters` (config-only, not surfaced in the UI)
  sort?: {
    rows?: { by: 'label'|'value', dir?: 'asc'|'desc', level?: number, value?: number, col?: string[] },
    columns?: { dir?: 'asc'|'desc' },            // column sort is label-only (by dir); no by:'value' for columns
  },
  showTotals?: boolean,       // default true — grand total row/column
  showSubtotals?: boolean,    // default true — per-group subtotal rows/columns for non-leaf levels
  heatmap?: boolean,          // default false — colors leaf value cells using --o-seq-100..700
  collapsed?: { rows?: string[][], columns?: string[][] },  // arrays of group key-paths (raw dimension keys, not labels)
};
type ValueSpec = {
  field: string | '*',        // '*' or omitted with agg:'count' counts records instead of reading a field
  agg?: 'sum'|'count'|'avg'|'min'|'max'|'distinct' | ((values: any[], records: any[]) => any),  // default 'sum'
  format?: 'number'|'integer'|'currency'|'percent'|'compact' | `${3-letter ISO code}` | Intl.NumberFormatOptions | ((value) => string),
  label?: string,              // overrides the auto-generated "{agg} of {field}" header label
};
```

`getConfig()`/internal use always work on a **normalized** config (`O.pivot.normalize`): string
row/column entries are unwrapped to plain keys, string `values` entries become `{ field, agg:
'sum' }`, missing `filters`/`sort`/`collapsed` become `{}`/`{ rows: [], columns: [] }`.

## `O.pivot.compute(data, config, fields?) -> Result` (pure, no DOM)

```ts
function compute(data: object[], config: Config, fields?: FieldDef[] | Map<string, FieldDef>): {
  rowRoot: PivotNode, colRoot: PivotNode,
  value(rowNode: PivotNode, colNode: PivotNode, valueIndex: number) -> number | null,
  config: NormalizedConfig, fields: Map<string, FieldDef>, count: number, total: number,
}
type PivotNode = { id: number, key: string, raw: any, parent: PivotNode | null, depth: number, children: Map<string, PivotNode>, n: number };
```

Single pass over `data`: for every record, walks/creates the row-dimension chain and
column-dimension chain (records failing any active `filters` entry or `config.filter` are
skipped), then for every `(rowAncestor × colAncestor)` combination (i.e. every prefix of both
chains, so subtotal/grand-total cells are pre-aggregated too — this is what makes subtotals O(1)
to read later) accumulates **sum, count, min, max, non-null-count** into a shared `Float64Array`
per cell, plus a `Set` per cell for `agg: 'distinct'` fields and an array of raw values *and*
matching records for a function `agg`. `value(rowNode, colNode, vi)` looks up the accumulator for
that exact node pair and applies the requested aggregation (`null` when there's no data, e.g. an
empty group). **Dates and other raw values are canonicalized** to a `dimKey` string (`Date` →
`toISODate`, everything else → `String(v)`, `null`/`''` → `''` which renders as the localized
"(blank)"). This engine has no DOM dependency and can run in a Worker.

**Performance**: uses typed arrays and integer node-id arithmetic (not object/Map churn per cell)
so aggregation stays fast at scale — the docs page benchmarks ~100,000 records with a 2-level row
group × 1-level column group and 2 measures in well under 300 ms in Chrome (a few dozen ms
typical); `<o-pivot>` records this as `pivotEl.lastComputeMs` after every recompute.

## `O.pivot.layout(result) -> { rows, cols }`

Turns the sparse tree into flat, ordered **visible** rows/columns respecting `collapsed`, sorting
(`sortChildren` — by label via `Intl.Collator` with numeric mode, or by a specific column's value
when `sort.rows.by === 'value'`), and totals/subtotals placement. Each row entry:
`{ node, depth, has: boolean /* has children */, collapsed, type: 'group'|'leaf'|'grand', key }`.
Each column entry additionally has type `'subtotal'` (an expanded group's own total column) or
`'collapsed'`/`'all'` (no column fields at all).

## `O.pivot.fields(data, fields?) -> Map<string, FieldDef>`

The field-detection routine described under `FieldDef` above, exposed standalone.

## `O.pivot.normalize(config) -> NormalizedConfig`

Fills every optional key with its default shape (see `Config` above), unwraps shorthand row/column
entries and string `values` entries.

## Element methods

| Method | Description |
|---|---|
| `setData(data)` | `this.data = toArr(data)`, chainable. |
| `setConfig(config)` | `this.config = { ...config }`, chainable. |
| `getConfig() -> Config` | A deep-cloned, normalized copy of the current config. |
| `refresh()` | Re-detects fields from `data`/`fields` and recomputes (use after mutating `data` in place, since prop setters compare by reference). |
| `expandAll()` | Clears `config.collapsed`. |
| `collapseAll()` | Collapses every **first-level** row and column group (deeper levels stay as they were, since they're hidden once their parent collapses). |
| `getResult() -> { rows, columns, values, count, valueCount }` | A flat, presentation-ready snapshot: `rows[].labels` are the display strings for that row's path, `columns[].value` is the measure's display label (e.g. "Sum of revenue"), `values` is a `rows.length × columns.length` matrix of raw numbers/`null` (already accounting for the current collapse/sort/filter state — **not** capped by `maxRows`). |
| `export(format?, opts?) -> Promise<Blob>` | `'csv'` (default) / `'xlsx'` (alias `'excel'`) / any other `O.export.to` format (`'json'`, `'html'`, `'pdf'`, …) applied to a flattened export **matrix** (`_matrix()`): one label column per row field, one data column per (column-path × value) combination, with merged header cells for repeated group labels. `xlsx` additionally freezes the header rows and the label columns and applies real merged cells; other formats go through `O.export.to` with the flattened header as column titles. `opts.filename` (default `'pivot'`), `opts.download` (default true), `opts.sheetName`/`opts.title` (xlsx only). |
| `toggleFieldList(force?)` | Shows/hides the field-list panel; toggles when `force` omitted. |

## Events

| Event | `detail` | When |
|---|---|---|
| `o-change` | `{ config: Config }` (normalized, cloned) | Any user-driven layout change: move/add/remove a field, change an aggregation, sort click, expand/collapse toggle, apply a filter. **Not** fired for `setConfig()`/property assignment (that's programmatic, not a user action) — matches the "user-initiated" convention from `FormElement.setValue`. |
| `o-cell-click` | `{ row: string[], column: string[], value: number\|null, valueField: ValueSpec, records: object[] }` | A value `<td>` is clicked; `row`/`column` are the raw dimension-key paths of that cell, `records` is every underlying record that rolls up into it (drill-down). |

## Keyboard

- **Enter/Space** on a field chip's main button opens the move menu (Rows / Columns / Values /
  Filters, minus the zone it's already in) plus Move up/down, Filter…, Remove.
- **Alt+ArrowUp / Alt+ArrowDown** on a focused chip reorders it within its current zone.
- **Delete/Backspace** on a focused chip removes it (moves it to Available).
- Group-expand toggles and sortable column/row headers are real `<button>`s, reachable by Tab.
- Filter popovers and the move/export menus are full `ListNav`-driven menus/dialogs (arrow keys,
  Home/End, Escape to close, focus returned to the opener).
- Dragging a chip with the mouse/pointer supports **Escape to cancel** mid-drag.

## Heatmap

When `config.heatmap` is true, every **leaf** value cell (row type `'leaf'` or no row grouping at
all; column type `'leaf'`/`'all'`) is colored on a 7-step scale (`--o-seq-100`…`--o-seq-700`, one
of 8 buckets via `o-pivot-heat-1`..`o-pivot-heat-7` CSS classes) relative to that measure's
min/max across all leaf cells (not including subtotal/grand-total cells). A low/high legend is
shown in the footer when any measure is present.

## Export matrix details (`_matrix()`)

Builds `head` (one row per column-header level; row-field titles fill the corner), `body` (rows of
label-columns + numeric-or-null value columns, subtotal/grand-total rows get their localized
label in the appropriate label column), `merges` (Excel range strings for repeated header labels
at the same level), and `flatHead` (a single-line, `·`-joined title per data column, used by
non-Excel export formats).

## Errors thrown

None from the public API directly; `export()`'s underlying `O.xlsx.write`/`O.export.to` calls can
throw whatever those throw (e.g. `O.zip` size limits for an enormous export). A custom function
`agg` or `validate`-like `format`/`get` callback that throws will propagate synchronously from
`_recompute()`/render (not caught).

## Notes for TypeScript declarations

- `<o-pivot>` is a custom element class (`OPivot extends OElement`); properties above map 1:1 to
  class fields via the `static props` prop system (JSON-parsed from attributes, or set directly as
  DOM properties from a framework).
- `O.pivot.compute`'s `value()` accessor closes over the `Result` it came from — don't mix
  `PivotNode`s from two different `compute()` calls.
