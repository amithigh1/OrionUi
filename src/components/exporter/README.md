# exporter — `O.export`

One-call "download rows as a file" helpers: CSV, TSV, Excel, a PDF report, JSON, standalone HTML
and clipboard. Pure JS, no custom elements. Single file: `exporter.js`, first line
`// @deps csv, xlsx, pdf` (uses `O.csv`, `O.xlsx` and `O.PDF` at call time).

## i18n
`i18n.add('en', { export: { ... } })`:

| Key | Default (en) | Params |
|---|---|---|
| `export.generated` | `Generated {date}` | `date` |
| `export.page` | `Page {page} of {pages}` | `page`, `pages` |
| `export.records` | `{count} record` / `{count} records` (plural) | `count` |
| `export.total` | `Total` | — |
| `export.report` | `Report` | — |
| `export.sheet` | `Sheet1` | — |
| `export.copied` | `{count} row copied` / `{count} rows copied` (plural) | `count` |

Also reads core keys `common.yes` / `common.no` (boolean display) via `t()`.

## Common concepts

**Columns** — every helper below accepts `opts.columns`; when omitted, columns are derived from
the union of keys across the first 100 rows (or, for array rows, `O.xlsx.colName(i)`/`i+1` as
titles). Normalized via `O.export.columns(rows, columns)`:
```ts
function columnsOf(rows: any[], columns?: ColumnOpt[]): NormalizedColumn[];
type ColumnOpt = string | {
  key?: string | number;                 // dot path ('user.email') or index; default from field/name/index
  field?: string; name?: string;         // alternative spellings for key
  title?: string; label?: string; header?: string;   // first defined wins; default = humanize(key) if key is a string
  type?: 'string'|'number'|'integer'|'currency'|'percent'|'date'|'datetime'|'time'|'boolean';
  format?: (value, row) => any;           // wins over type for display; for xlsx, a string is used as an Excel number format
  value?: (row) => any;                   // computed value instead of key
  currency?: string; decimals?: number; width?: number; align?: 'left'|'center'|'right'; wrap?: boolean;
  hidden?: boolean;                       // excluded from output
  export?: false;                          // excluded from output (alternate flag)
  total?: boolean;                         // include/force-include in O.export.pdf totals
};
```
A plain string/number entry becomes `{ key, title: humanize(key) }`.

**`humanize(key) → string`** — `O.export.humanize`. `'firstName'` → `'First name'`,
`'user.email_address'` → `'User email address'` (splits on `._-` and camelCase boundaries,
capitalizes only the first letter).

**`format(value, column?, row?) → string`** — `O.export.format`. Resolution order: `column.format`
(function; a returned `SafeHTML`/`html` result has its tags stripped) → `column.type`-specific
formatting via `fmt.*` (`number`, `integer`→0-decimal, `currency`, `percent`, `date`, `datetime`,
`time`, `boolean`→`common.yes`/`no`) → value-based fallback (`Date`, `number`, `boolean`, `Array`
joined with `', '`, plain object → `.label ?? .name ?? JSON.stringify(v)`, else `String(v)`).
`null`/`''` → `''`.

**Filenames** — `opts.filename` may contain the literal token `{date}`, replaced with
`O.date.toISODate(new Date())` (e.g. `'people-{date}'` → `'people-2026-09-12.csv'`); illegal
filename characters `\ / : * ? " < > |` are replaced with `-`. The extension is appended
automatically if missing.

**Triggering the download** — every helper resolves with the generated `Blob` (or, for
`clipboard`, the copied text) and, unless `opts.download === false`, calls the core `download()`
(creates an object URL, clicks a hidden `<a download>`, revokes after 4s). Pass
`{ download: false }` to only get the `Blob`/text (e.g. to `POST` it to a server) without saving a
file.

## `O.export.csv(rows, opts?) → Promise<Blob>`
```ts
function exportCSV(rows: any[], opts?: {
  columns?: ColumnOpt[]; filename?: string;        // default 'export.csv' ('export.tsv' via tsv())
  delimiter?: string; bom?: boolean; eol?: string; quote?: 'auto'|'all'; safe?: boolean; header?: boolean;
  raw?: boolean;                                    // true: write raw values, skip column.format() (boolean still humanized unless raw)
  onProgress?: (ratio: number) => void; download?: boolean;
}): Promise<Blob>;   // type 'text/csv;charset=utf-8' (or 'text/tab-separated-values;charset=utf-8' when delimiter is '\t')
```
Defaults differ slightly from `O.csv.stringify`: `bom: true` here (Excel-friendly UTF-8). Rows
are chunked 10,000 at a time and yield to the UI thread between chunks so large exports (the docs
demo tries 50,000 rows) don't freeze the page; `onProgress(ratio)` reports chunk progress.

## `O.export.tsv(rows, opts?) → Promise<Blob>`
`(rows, opts) => exportCSV(rows, { ...opts, delimiter: '\t' })` — same options as `csv`, default
filename extension `.tsv`, MIME `text/tab-separated-values;charset=utf-8`.

## `O.export.xlsx(input, opts?) → Promise<Blob>`
```ts
function exportXLSX(input: any[] | { name?, rows, columns? }[] | { sheets: [...] }, opts?: {
  columns?: ColumnOpt[]; filename?: string;          // default: opts.title || 'export'
  sheetName?: string;                                 // default: opts.title (≤31 chars) or t('export.sheet')
  author?: string; creator?: string;                  // default 'Orion Admin'
  download?: boolean;
  // ...plus every O.xlsx.write / per-sheet option (title, titleRow, subtitle, freeze, autoFilter,
  //    autoWidth, headerStyle, rtl, merges, orientation, compress, onProgress, etc. — see ../xlsx/README.md)
}): Promise<Blob>;
```
Multi-sheet input (`{ sheets: [{ name, rows, columns }] }` or an array of such objects) is
detected the same way `O.xlsx.write` does; each sheet's columns are passed through
`columnsOf`/`format` first so `column.format`/`type` behave identically to the other exporters
(numbers/dates/booleans stay **typed** in Excel — only columns with a plain `format` function and
no `type` get pre-formatted to a display string, unless `opts.raw` is set).

## `O.export.pdf(rows, opts?) → Promise<Blob>`
```ts
function exportPDF(rows: any[], opts?: {
  columns?: ColumnOpt[]; filename?: string;           // default: opts.title || 'report'
  title?: string; subtitle?: string; logo?: string | HTMLImageElement | HTMLCanvasElement;  // URL/data URL/element
  logoHeight?: number;                                  // default 30
  orientation?: 'auto' | 'portrait' | 'landscape';     // default 'auto' — measures header+sampled cell widths to decide
  size?: string;                                        // default 'A4' (any O.PDF.sizes key)
  margin?: number;                                       // pt, default 36
  fontSize?: number;                                     // default 8.5
  zebra?: boolean;                                       // default true
  borders?: 'horizontal' | ...;                          // default 'horizontal' (passed to pdf.tableAsync)
  totals?: boolean | Record<string, any>;                // true: sums number/integer/currency columns (or column.total===true), skipping column.total===false; object: explicit per-key totals
  headerStyle?: object; cellStyle?: (value, row) => object | null;
  footerText?: string;                                    // default: title
  author?: string; subject?: string; color?: string;      // accent color; default theme primary or '#4F46E5'
  compress?: boolean; onProgress?: (ratio) => void; download?: boolean;
}): Promise<Blob>;   // type 'application/pdf'
```
Report layout via `O.PDF` (see the `pdf` package): optional logo + title/subtitle block, a
generated-date and record-count line, a header rule in the accent color, a repeating table header
across pages (`repeatHeader: true`), an optional totals row (bold, shaded), and a footer with
`export.page` pagination plus `footerText`. `orientation: 'auto'` measures column header/label
widths (sampling every `⌈rows/200⌉`-th row) against the page's writable width to pick landscape
vs portrait.

## `O.export.json(rows, opts?) → Promise<Blob>`
```ts
function exportJSON(rows: any[], opts?: {
  columns?: ColumnOpt[]; filename?: string;    // default 'export'
  space?: number;                               // JSON.stringify indent, default 2
  raw?: boolean;                                 // default true — keep native values; false runs them through format()
  keys?: 'key' | 'title';                        // default 'key' — object property naming when columns is set
  ndjson?: boolean;                               // default false — one JSON object per line instead of a single array
  download?: boolean;
}): Promise<Blob>;   // type 'application/json' (or 'application/x-ndjson')
```
Without `columns`, rows are exported as-is (`JSON.stringify(rows, null, space)`). With `columns`,
each row becomes a plain object built via `setPath` (dot-path keys nest) unless `keys: 'title'`.

## `O.export.html(rows, opts?) → Promise<Blob>`
```ts
function exportHTML(rows: any[], opts?: { columns?: ColumnOpt[]; filename?: string /* default: opts.title || 'export' */; title?: string; subtitle?: string; download?: boolean }): Promise<Blob>;  // 'text/html;charset=utf-8'
```
A standalone, print-friendly HTML document (inlined CSS, zebra rows, sticky-style header,
`@media print` rules) built around `tableHTML()`.

## `O.export.clipboard(rows, opts?) → Promise<string>`
```ts
function clipboard(rows: any[], opts?: { columns?: ColumnOpt[]; raw?: boolean /* default false */; }): Promise<string>;
```
Copies tab-separated text (pastes cleanly into Excel/Sheets) via `navigator.clipboard.writeText`,
falling back to a hidden `<textarea>` + `execCommand('copy')`. Calls `announce(t('export.copied',
{ count }))` for screen readers and resolves with the copied text. Internally delimiter is `'\t'`,
`bom: false`, `safe: false`, `quote: 'auto'`.

## `O.export.to(format, rows, opts?) → Promise<Blob | string>`
```ts
function to(format: 'csv'|'tsv'|'xlsx'|'excel'|'pdf'|'json'|'html'|'clipboard', rows: any[], opts?): Promise<Blob | string>;
```
Case-insensitive dispatch to the helpers above (`'excel'` is an alias for `'xlsx'`). Throws
`` `export: unknown format "<format>"` `` for anything else.

`O.export.formats` → `['csv', 'tsv', 'xlsx', 'excel', 'pdf', 'json', 'html', 'clipboard']`.

## `O.export.tableHTML(rows, opts?) → string`
```ts
function tableHTML(rows: any[], opts?: { columns?: ColumnOpt[]; tableClass?: string /* default 'o-table' */ }): string;
```
Escaped `<table>` markup (numeric columns get `class="o-num"`, cell text wrapped in `<bdi>` for
bidi isolation, `\n` → `<br>`). Used by both `O.export.html` and the docs demo's live preview.

## `O.export.toCSV(rows, opts?) → Promise<string>`
The raw CSV text builder behind `O.export.csv` (same options, minus `filename`/`download`) —
useful to get the string without a `Blob`/download.

## Notes & limits
- All helpers are safe to call from React/Vue/Angular event handlers — nothing here is a custom
  element; call them directly and (optionally) pass `{ download: false }` to handle the `Blob`
  yourself (e.g. upload it).
- `O.export.pdf` depends on the `pdf` package (`O.PDF`) being in the bundle; `O.export.xlsx`
  depends on `xlsx`/`zip`; `O.export.csv`/`tsv` depend on `csv`. All three are declared via
  `// @deps csv, xlsx, pdf` at the top of `exporter.js`.
