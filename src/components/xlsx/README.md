# xlsx — `O.xlsx`

Excel workbook (SpreadsheetML / ECMA-376) reader and writer, built directly on `O.zip`. Pure JS,
no DOM required. Single file: `xlsx.js`, first line `// @deps zip` (needs `O.zip` at call time;
concatenation order isn't actually load-bearing since the reference is inside functions, but the
declaration documents the runtime dependency).

No custom elements, no CSS, no i18n keys of its own (it reads `i18n.locale` to pick a currency
symbol/decimals via `Intl.NumberFormat` when a column's `currency` format is requested, and calls
into `O.date`/`fmt` for date parsing/number parsing — it does not register any dictionary keys).

## `O.xlsx.write(input, opts?) → Promise<Blob>`
```ts
function write(input: Row[] | Row[][] | SheetInput[] | { sheets: SheetInput[] } | { rows: Row[] }, opts?: WriteOptions): Promise<Blob>;
type Row = Record<string, any>;

interface SheetInput extends SheetOptions {
  name?: string;                    // sheet tab name
  rows: Row[] | any[][];
  columns?: ColumnDef[];
}
```
`input` forms:
- `Row[]` (array of plain objects) or `any[][]` (array of arrays) → one sheet.
- `SheetInput[]` → multiple sheets, in order.
- `{ sheets: SheetInput[] }` or `{ rows, ... }` → unwrapped the same way.
- A bare list is treated as *sheets* only when every item is an object with an array `rows` and
  either a string `name`, an array `columns`, or `sheet: true` — otherwise it's treated as the
  row list of a single sheet.

### `WriteOptions` (also apply per-sheet inside `SheetInput`, which override the workbook-level value)
| Option | Type | Default | Notes |
|---|---|---|---|
| `sheetName` | `string` | `'Sheet1'` (via `sheetName()`) | Used for the first/only sheet when `SheetInput.name` isn't set. |
| `columns` | `ColumnDef[]` | derived | See below. Falls back to array-of-arrays layout (no header) when rows are arrays and no `columns` are given. |
| `header` | `boolean` | `true` | Emit a bold header row from `columns[].title` (object rows only — array rows use `headerRows` instead). |
| `headerStyle` | `{ bold?, italic?, size?, color?, fill?, border?, align?, valign?, wrap? }` | `{ bold: true, fill: '#EEF2F7', color: '#0F172A', border: true, valign: 'center' }` | Colors accept anything `O.color.parse` understands. |
| `freeze` | `boolean \| { rows?: number; cols?: number }` | `true` | `true` freezes at/below the header row; an object sets explicit frozen rows/cols (0 = none). |
| `autoFilter` | `boolean` | `true` | Adds an Excel AutoFilter over the header + data range (only when there's a header and ≥ 1 data row). |
| `autoWidth` | `boolean` | `true` | Column widths sized from up to ~5,000 sampled rows (`displayLen()`), clamped to `[minWidth, maxWidth]`. |
| `minWidth` / `maxWidth` | `number` | `6` / `60` | Only used when `autoWidth` is on (or a column has no explicit `width`). |
| `rtl` | `boolean` | `false` | Sets the sheet view to right-to-left. |
| `title` | `string` | — | **Document property** (`dc:title` in `docProps/core.xml`) only — does **not** draw a banner row by itself. |
| `titleRow` | `boolean` | `false` | When `true` *and* the sheet doesn't set its own `title`, draws `title`/`subtitle` as merged banner row(s) at the top of **every** sheet, pushing the header/data down by 2 rows (title + subtitle) or 1 (title only), plus one blank spacer row. Combine with `title`/`subtitle` to get an in-sheet banner; **row-based `merges` you supply are not auto-offset for this**, so account for the extra row(s) yourself. |
| `subtitle` | `string` | — | Second banner line; only rendered when `titleRow` is set (see above). |
| `merges` | `Array<string \| { s: {r,c}, e: {r,c} }>` | `[]` | A1-notation strings (`'A1:C1'`) or 0-based `{r,c}` range objects; **not** adjusted for `titleRow`. |
| `headerRows` | `number` | `0` (arrays) / n·a (objects) | Array-of-arrays sheets only: how many leading rows are header rows (styled like the header, not counted as data). Ignored for object rows (use `header` instead). |
| `orientation` | `'portrait' \| 'landscape'` | auto (`'landscape'` when the column count > 8, else `'portrait'`) | Print page setup only — has no effect on on-screen layout. |
| `paper` | `'Letter' \| 'A4' \| ...` | `'A4'` (`9`) | Only `'Letter'` (`1`) is special-cased; anything else maps to A4. |
| `creator` / `author` | `string` | `'Orion Admin'` | Document `dc:creator` / `cp:lastModifiedBy`. |
| `company` | `string` | — | Document `Company` property. |
| `subject`, `keywords`, `description`, `docTitle` | `string` | — | Extra `docProps/core.xml` fields (`docTitle` overrides `title` for the property only). |
| `compress` | `boolean` | `true` | Passed through to the underlying `O.zip.create`. |
| `onProgress` | `(ratio: number) => void` | — | Called once near the very end of sheet building (not per-row) and via the underlying `O.zip.create`/row loop yielding every 2048 rows. |

### `ColumnDef`
```ts
interface ColumnDef {
  key?: string | number | ((row) => any);   // property name, dot-free key, or accessor; default = array index for array rows
  title?: string;                            // header text, default: humanized/raw key
  width?: number;                             // character width; overrides autoWidth for this column
  type?: 'string' | 'number' | 'integer' | 'currency' | 'percent' | 'date' | 'datetime' | 'time' | 'boolean';
  format?: string;                            // an Excel number-format code, e.g. '#,##0.00', 'dd/mm/yyyy', '0.0 "kg"'
  numFmt?: string;                            // alias of format
  currency?: string;                          // ISO 4217 code for type: 'currency', default O.config?.currency ?? 'USD'
  decimals?: number;                          // decimal places for number/currency/percent formats
  wrap?: boolean;                              // wrapText
  align?: 'left' | 'center' | 'right';
  hidden?: boolean;                            // hidden column
  value?: (row) => any;                        // computed value instead of key
}
```
- When `type`/`format` is omitted, the column's kind is **inferred** by sampling up to 200
  non-empty values (`string`, `number`, `boolean`, `date`, `datetime`, or `mixed` → treated as
  general/string).
- Cell value conversion (`convert()`): numeric types parse numbers out of formatted strings
  (`fmt.parseNumber`, percent signs divide by 100); `date`/`datetime`/`time` parse strings/numbers
  via `O.date.parse`; `boolean` accepts `'true'/'yes'/'y'/'1'` / `'false'/'no'/'n'/'0'` strings.
  `null`/`''` values are omitted from the sheet (blank cell).
- **Formula cells**: a value shaped like `{ f: 'SUM(B2:B9)', v: 12 }` (or `{ formula, value }`)
  writes a `<f>` element with the leading `=` stripped and a cached `<v>` — Excel recalculates on
  open (`fullCalcOnLoad` is set on the workbook when any formula is written); `O.xlsx.read` only
  ever returns the **cached value**, never the formula text.

Sheet name handling (`sheetName()`): strips `[ ] : * ? / \`, trims surrounding `'`, truncates to
31 chars, appends `' 1'` if the name is exactly `'history'` (case-insensitive, an Excel-reserved
name), and de-duplicates collisions by appending `' (2)'`, `' (3)'`, … (truncating to still fit 31
chars). Missing names default to `Sheet1`, `Sheet2`, ….

## `O.xlsx.read(input, opts?) → Promise<{ sheets: SheetResult[]; sheetNames: string[] }>`
```ts
function read(input: File | Blob | ArrayBuffer | ArrayBufferView, opts?: {
  header?: boolean;          // default true
  sheet?: string | number;   // filter to one sheet (case-insensitive name, or 0-based index); default: all sheets
  skipEmpty?: boolean;       // default true — drop fully-blank rows (leading blank rows before the first data are always kept if header:false and none seen yet)
  fillMerged?: boolean;      // default false — copy each merged range's top-left value into every covered cell before building rows
  maxRows?: number;          // cap parsed data rows (plus the header row when header !== false)
}): Promise<{ sheets: SheetResult[]; sheetNames: string[] }>;

interface SheetResult {
  name: string;
  rows: Record<string, any>[] | any[][];   // objects when header !== false, else dense arrays
  columns: Array<{ key: string | number; title: string; type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' }>;
  merges: string[];             // A1-notation ranges, e.g. 'A1:C1'
  range: string;                 // e.g. 'A1:F41'
  hidden: boolean;               // sheet visibility state (hidden / veryHidden)
}
```
- Throws `Error('xlsx: workbook not found — not an Excel .xlsx file')` if there's no
  `xl/workbook.xml` reachable from `_rels/.rels`; throws `` `xlsx: sheet "<sheet>" not found` ``
  when an explicit `sheet` filter matches nothing.
- Reads shared strings (`sharedStrings.xml`, including rich text runs and `_xNNNN_`/CDATA
  escapes) and inline strings; numbers/booleans/errors/dates (`t="d"`, ISO 8601) are parsed
  per-cell. A numeric cell whose style references a **date-shaped number format** (either a
  built-in date format id or a custom `numFmt` matching `O.xlsx.isDateFormat`) is converted with
  `O.xlsx.fromSerial`, honoring the workbook's 1900 vs **1904** date system
  (`workbookPr/@date1904`).
- With `header: false`, `columns` are `{ key: index, title: 'A' | 'B' | ..., type }` (type
  inferred over up to 500 sampled values per column) and `rows` are dense arrays padded to the
  widest row seen.
- With `header !== false` (default), the first row becomes de-duplicated object keys
  (`uniqueKeys()`; a header Date cell is converted with `O.date.toISODate` first); trailing
  all-blank columns (blank header **and** blank in every row) are dropped.
- Empty rows are skipped by default (`skipEmpty`) except that at least one row is always kept
  when nothing has been collected yet (so a fully-blank sheet still yields the header, not a
  crash).

## Helpers
```ts
function colName(i: number): string;                       // 0 -> 'A', 26 -> 'AA'
function colIndex(letters: string): number;                 // 'A' -> 0, 'AA' -> 26 (case-insensitive; stops at the first non-letter)
function toSerial(d: Date): number;                          // Excel 1900-system serial for a local Date (date+time)
function fromSerial(n: number, date1904?: boolean): Date;   // default date1904 = false; local Date for a serial number
function isDateFormat(code: string): boolean;                // true if an Excel number-format code renders a date/time (and isn't 'General')
```
`O.xlsx.MIME` = `'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'` (the Blob
type used by `write()`).

## Notes & limits
- Reading/writing covers cell values, shared/inline strings, number formats (including custom
  ones, id ≥ 164), fonts/fills/borders/alignment for the header + typed columns, freeze panes,
  autofilter, merges, column widths/visibility, sheet visibility, and formula **cached** values.
  It does not read/write charts, images, conditional formatting, data validation, comments,
  pivot tables, or defined names beyond the auto-filter/print-titles ones it writes itself.
- Legacy `.xls` (OLE/BIFF) files are not supported by this module — `O.importFile` (see
  `../importer/README.md`) detects the OLE signature and raises a dedicated "not supported" error
  before ever calling `O.xlsx.read`.
- Very long strings are truncated to 32,767 characters per cell (the SpreadsheetML limit) when
  written.
- `write()` depends on `O.zip.create` (native `CompressionStream` when available, otherwise
  stored/uncompressed) and on `O.color`/`O.date`/`fmt`/`i18n` being present in the bundle (all
  core services); `read()` depends only on `O.zip.read`.
