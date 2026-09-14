# importer — `O.importFile` / `Orion.importWizard` / `O.importer`

Reads CSV/TSV/Excel/JSON files into rows, and a guided modal wizard that uploads, maps columns,
validates and imports them. Pure JS + one dialog built with `h()`/`portal()`/`overlays` (**not**
an `OElement` — it's a factory function that returns a `Promise`, per ARCHITECTURE.md's
"Services (JS API)" layer). Files: `importer.js` (`// @deps csv, xlsx`), `importer.css` (styles
for the wizard dialog only — everything else in this package is DOM-free).

Because the wizard is a factory, not a custom element, it has **no `o-*` custom events** — hook
into it with the `onStep`/`onComplete`/`onImport` callbacks and the returned `Promise`.

## i18n
`i18n.add('en', { importer: { ... } })` — full key list (all under the `importer.` prefix):

`title, upload, sheet, map, review, import, done, stepOf{n,total,name}, dropTitle, dropOr, browse,
dropHint{size}, dropLabel, paste, pasteLabel, pastePlaceholder, usePasted, template, reading{name},
pasted, unsupported, tooLarge{size}, empty, xls, readError{message}, chooseSheet, sheetInfo{rows,cols},
fileInfo{name,rows}, rows{count} (plural), sourceColumn, sample, targetField, ignore, mapAs{name},
auto, unmapped{fields}, swapped{field,column}, validRows{count} (plural), errorsIn{errors,rows},
noErrors, onlyErrors, skipInvalid, showing{shown,total}, row, fixHint, edit, cellError{message},
maxRows{count}, blockInvalid, importRows{count} (plural), importing{done,total}, validating,
imported{count} (plural), skipped{count} (plural), allImported, downloadSkipped, another, failed,
cancelled, errorColumn, required, invalid{type}, notAllowed, duplicate, types.{number,integer,
currency,percent,boolean,date,datetime,email,url,phone}`.

Also uses core keys `common.back`, `common.next`, `common.cancel`, `common.close`, `common.done`,
`common.retry`, `validation.required`/`min`/`max`/`maxLength`/`pattern`/`invalid`. Per-call text
overrides: `opts.texts` (object) — keys may be the short form (`'upload'`) or fully qualified
(`'importer.upload'`); looked up before the dictionary, `{param}` tokens still substituted.

## `O.importFile(file, opts?) → Promise<ImportResult>`
```ts
function importFile(file: File | Blob | string, opts?: {
  columns?: ColumnDef[];              // see below; enables mapping + validation of the returned rows
  mapping?: Record<string, string | null>;   // force/seed the field→column mapping (else auto-mapped)
  sheet?: string | number;             // pick a workbook sheet by name or 0-based index
  header?: boolean;                    // default true
  delimiter?: string;                  // CSV only, default 'auto'
  encoding?: string;                    // CSV only, default 'auto' (see ../csv/README.md)
  dynamicTyping?: boolean | object | Function;   // CSV only
  trim?: boolean;                       // CSV only
  fillMerged?: boolean;                 // XLSX only
  maxRows?: number;
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
}): Promise<ImportResult>;

interface ImportResult {
  rows: Record<string, any>[];         // the selected sheet's rows (mapped+coerced when `columns` is given)
  fields: string[];                     // the selected sheet's column/field names
  sheets: Array<{ name: string; rows: any[]; fields: string[]; errors?: any[]; delimiter?: string; hidden?: boolean }>;
  sheet: string;                         // name of the selected sheet
  format: 'csv' | 'json' | 'xlsx';       // detected format ('xls' throws instead, see below)
  mapping: Record<string, string | null> | null;   // null unless `columns` was passed
  errors: Array<{ row: number; key: string; message: string }> | any[];   // parse errors (no columns) or validation errors (with columns)
}
```
**Format detection** (in order): a `string` input is `'json'` if it starts with `[`/`{` after
trimming, else `'csv'`. A `File`/`Blob` is sniffed from its first bytes — `PK\x03\x04` → `'xlsx'`,
the OLE2 signature `D0 CF 11 E0` → `'xls'` (see below), else by extension
(`json`/`ndjson`/`jsonl`, `xlsx`/`xlsm`, `xls`), else by peeking at the first 64 bytes for `[`/`{`
→ `'json'`, else `'csv'`.
- **`'xls'`** (legacy binary Excel) is not supported: throws an `Error` with `code: 'xls'` and the
  `importer.xls` message ("Save the file as .xlsx or CSV and try again").
- **`'xlsx'`** is read via `O.xlsx.read(file, { header, fillMerged })`; every sheet becomes
  `{ name, rows, fields: columns.map(c=>c.key), hidden }`.
- **`'json'`** accepts a JSON array/object or NDJSON (one object per line, tried as a fallback if
  `JSON.parse` fails on the whole text). A top-level object is searched for the first array among
  `data`, `rows`, `items`, `records`, `results`, then any of its own values, else it's wrapped as
  a single row. An array-of-arrays is treated as `[header, ...dataRows]`. Nested plain objects are
  flattened to dot-path keys up to 3 levels deep (`flatten()`), e.g. `{ user: { name: 'Ada' } }` →
  `{ 'user.name': 'Ada' }`.
- **CSV/TSV** (default) is parsed with `O.csv.parseAsync(file, { delimiter: 'auto', skipEmpty:
  'greedy', ... })` — see `../csv/README.md`.

**Sheet selection**: `opts.sheet` (index or case-insensitive name) if given and found; else the
first sheet with rows that isn't hidden; else the first sheet; else an empty synthetic sheet.

**With `opts.columns`**: fields are auto-mapped (`autoMap`, or `opts.mapping` merged in) and every
row is coerced/validated (`validateRows` — see below); `result.errors` becomes a flat
`{ row, key, message }[]` (one entry per invalid cell) instead of parser errors.

## `Orion.importWizard(opts?) → Promise<Row[] | null>`
```ts
function importWizard(opts?: WizardOptions): WizardPromise;   // WizardPromise = Promise<Row[] | null> & { close(): void }
```
Opens a modal dialog and resolves when the user finishes (`Row[]`, the imported rows — or the
skip-invalid-filtered subset, see Import step) or cancels/closes it (`null`). The returned promise
also has a `.close()` method that force-cancels it externally (resolves `null` unless already on
the "done" step, where the wizard's own close behavior applies).

### `WizardOptions`
| Option | Type | Default | Notes |
|---|---|---|---|
| `columns` | `ColumnDef[]` | `[]` | Target schema — see below. A bare string becomes `{ key: s, title: s }`. |
| `title` | `string` | `t('importer.title')` (`'Import data'`) | Dialog title. |
| `accept` | `string` | `'.csv,.tsv,.txt,.xlsx,.xlsm,.json'` | Comma-separated extensions and/or MIME patterns (`'image/*'`-style prefixes work), enforced client-side against the picked file's name/type. |
| `maxSize` | `number` (bytes) | `10 * 1024 * 1024` (10 MB) | Rejects larger files with `importer.tooLarge`. |
| `maxRows` | `number` | — | Truncates the sheet's rows before mapping; shows `importer.maxRows` on the Review step. |
| `onImport` | `(rows: Row[], ctx: { progress(ratio): void; signal: AbortSignal; index?: number; total: number }) => Promise<void>` | — | Your save function. Without `batchSize`, called once with all rows (call `ctx.progress(ratio)` yourself); with `batchSize`, called once per batch and the progress bar advances automatically. Throwing (or `ctx.signal` aborting, via the Cancel button) lands on the "failed"/"cancelled" Done screen. |
| `batchSize` | `number` | — | Splits `onImport` calls into chunks of this size. |
| `skipInvalid` | `boolean` | `true` | Initial state of the Review step's "Skip invalid rows" toggle (user can flip it before importing). When off, importing is blocked while any row has an error. |
| `allowPaste` | `boolean` | `true` | Shows a "Paste data instead" `<details>` on the Upload step (pasted text is parsed the same as a dropped file). |
| `template` | `boolean \| string` | `true` | `true` offers a "Download a CSV template" button generating one example row from `column.example` values (only shown when `columns.length`); a string is treated as a URL to download directly instead. |
| `templateName` | `string` | `'import-template'` | Filename (without extension) for the generated template. |
| `mapping` | `Record<string,string\|null>` | — | Seeds/forces initial column mapping (merged over the auto-map result), applied to every sheet choice. |
| `texts` | `Record<string,string \| (params) => string>` | — | Per-instance i18n overrides, see above. |
| `container` | `'auto' \| 'dialog'` | `'auto'` | `'auto'` uses `Orion.modal` when available (falls back to the built-in dialog if it can't be used); `'dialog'` always uses the built-in dialog. |
| `upload` | `boolean` | `true` | `false` opts out of using a registered `<o-upload>` element for the drop zone even when one is defined; the built-in drag/drop zone is used instead. |
| `fillMerged` | `boolean` | — | Forwarded to `O.xlsx.read` for `.xlsx` uploads. |
| `onStep` | `(step: 'upload'\|'sheet'\|'map'\|'review'\|'import'\|'done') => void` | — | Fires on every step change (including the initial `'upload'`). |
| `onComplete` | `(ctx: { rows: Row[]; skipped: Row[] }) => void` | — | Fires once, right before the "done" (success) screen renders; not called on failure/cancel. |

### `ColumnDef` (target schema)
```ts
interface ColumnDef {
  key: string;                          // required — supports dot paths via setPath/getPath
  title?: string;                        // display name, default = key
  label?: string;                        // alternate spelling of title
  required?: boolean;
  type?: 'string' | 'number' | 'integer' | 'currency' | 'percent' | 'decimal' | 'float'
       | 'boolean' | 'date' | 'datetime' | 'email' | 'url' | 'phone';   // default 'string'
  aliases?: string[];                    // extra names/synonyms considered when auto-mapping
  options?: Array<string | number | { value; label }>;   // restrict to an allow-list (case-insensitive match on value or label)
  unique?: boolean;                      // flags duplicate values (case-insensitive) across all rows as errors
  default?: any;                          // used for missing/blank values; also satisfies `required`
  format?: string;                        // date-only: a parse pattern like 'DD/MM/YYYY' (falls back to auto date parsing)
  min?: number; max?: number;             // numeric range
  maxLength?: number;                      // string length cap (checked after other conversions)
  pattern?: string;                        // RegExp source tested against the final string value
  example?: any;                           // used to build the CSV template row
  validate?: (value: any, row: Record<string, any>) => true | false | string;   // false/string = error
}
```

### Column-value coercion — `O.importer.coerce(value, column) → { value, error }`
```ts
function coerce(v: any, c: ColumnDef): { value: any; error: string | null };
```
- Blank (`null`/`undefined`/whitespace-only string) → `{ value: c.default ?? null, error: required && default==null ? importer.required : null }`.
- A value the CSV formula-injection guard had prefixed with `'` (e.g. `"'=SUM(...)"`) has that
  leading `'` stripped before conversion.
- `number`/`integer`/`currency`/`decimal`/`float`/`percent`: parses `(1,234.5)`-style parens as
  negative, a trailing `%` for `percent` divides by 100, otherwise uses `fmt.parseNumber`;
  `integer` additionally requires the result to be a whole number; out-of-range vs `min`/`max`
  returns a `validation.min`/`validation.max` error (value is still returned, not blanked).
- `boolean`: `true/yes/y/1/x/on/t/ja/si/oui/ya` → `true`; `false/no/n/0/off/f/nein/non/tidak` →
  `false` (case-insensitive); anything else is invalid.
- `date`/`datetime`: a `Date` passes through (invalid if `NaN`); a number is treated as an Excel
  serial when `20000 < n < 80000` and `O.xlsx` is present, else `new Date(n)`; a string tries
  `column.format` first (`date.parse(s, format)`), then locale-free ISO-ish parsing
  (`date.parse(s)`), then a `D/M` or `M/D` heuristic based on the current locale's date order for
  `dd.mm.yyyy`/`dd-mm-yyyy`/`dd/mm/yyyy`-shaped strings. `type: 'date'` additionally zeroes the
  time-of-day.
- `email`: trimmed, tested against `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`.
- `url`: trimmed, `https://` prefixed if no scheme is present, valid only if the parsed protocol
  is `http`/`https` and the hostname contains a `.`.
- `phone`: trimmed, `/^\+?[\d\s().-]{6,20}$/` and at least 6 digits.
- default (`string`/unrecognized type): `Date` → ISO date string; non-string → `String(v)`;
  string → trimmed.
- After type conversion: `options` (allow-list) rejects values with `importer.notAllowed` unless
  matched case-insensitively by value or label (and the value is normalized to the matched
  option's `value`); `maxLength`/`pattern` are checked last.

### Auto-mapping — `O.importer.autoMap(fields, columns) → Record<string, string | null>`
```ts
function autoMap(fields: string[], columns: ColumnDef[]): Record<string, string | null>;
```
Greedy best-match, each target column used at most once. For every `(field, column)` pair, scores
the best of `column.key`, `column.title`, and each `column.aliases[]` entry against the field name
(both sides normalized: NFD-folded, diacritics stripped, lowercased, non-alphanumerics removed):
exact match = 100; a ≥3-char substring either way = `70 + 20·(shorter/longer length)`; otherwise a
fuzzy subsequence match (`fuzzy()` from core) scores if `columnName.length / fieldName.length ≥ 0.3`,
capped at 60. Candidates scoring ≥ 45 are sorted by score (ties broken by field order) and
assigned first-come, first-served without reusing a column.

### Row validation — `O.importer.validate(raw, mapping, columns, opts?) → Promise<ValidateResult>`
(also exposed as internal `validateRows`, and driven automatically by the wizard's Review step)
```ts
function validateRows(raw: Record<string, any>[], mapping: Record<string,string|null>, columns: ColumnDef[], opts?: { onProgress?: (ratio) => void }): Promise<{
  rows: Record<string, any>[];                          // one converted row per input row, built via setPath(row, column.key, coerced value)
  errors: Map<number, Record<string, string>>;           // rowIndex -> { [columnKey]: message }
  invalid: Set<number>;                                    // rowIndex of every row with ≥ 1 error
}>;
```
Unmapped required columns (no `default`) add a `importer.required` error to every row;
`column.validate(value, row)` runs after built-in coercion (skipped if that cell already has an
error) — return `false` for a generic message or a string for a custom one; `unique` columns
flag the **second and later** occurrence of the same case-insensitive value as
`importer.duplicate` (the first occurrence is not flagged). Yields to the UI thread every 1024
rows.

## Wizard step machine
`upload → [sheet]* → map → review → import → done`, where `sheet` only appears when the uploaded
file has more than one non-empty sheet. Back goes to the previous step (or cancels from `upload`);
`done` can go Back to `review` only after a failed/cancelled import (not after success).

1. **Upload** — drag-and-drop / click-to-browse / paste (`Ctrl+V` anywhere in the dialog while on
   this step) a file, or paste rows into the textarea and click "Use pasted data". Validates
   extension/MIME (`accept`) and size (`maxSize`) before reading; shows a progress bar while
   `O.importFile` runs.
2. **Sheet** (workbooks only) — radio list of sheets with row/column counts and a field preview;
   selecting one re-runs auto-mapping for that sheet.
3. **Map columns** — one row per source field: sample values, a `<select>` of target columns (or
   "Don't import"), an "Auto" badge for fields the auto-mapper matched. Picking a column already
   assigned elsewhere unassigns it there (and announces the swap). Blocks Next until every
   `required` column (without a `default`) is mapped and at least one field is mapped.
4. **Review** — validates all rows (async, shown as a spinner first), then shows a scrollable
   table (first 200 matching rows) with invalid cells as clickable "fix" buttons
   (`title`/`aria-*` carry the error message); a summary of valid/invalid counts, an "Only rows
   with errors" filter, and the "Skip invalid rows" toggle. Editing a cell (see Keyboard) re-runs
   `validateRows` for just that row. Import is blocked while `skipInvalid` is off and any row is
   invalid.
5. **Import** — runs `onImport` (see `batchSize` above) with a progress bar (indeterminate unless
   batched) and a Cancel button that aborts `ctx.signal`; Escape is disabled during this step.
6. **Done** — success (`importer.imported`, plus a "Download skipped rows" CSV button — the
   original raw values plus an `Errors` column — when any were skipped), cancelled, or failed
   (with a Retry button that re-runs Import). "Import another file" resets to Upload.

## Keyboard & accessibility
- The dialog is `role="dialog" aria-modal="true" aria-labelledby="<id>-t"`, focus-trapped and
  scroll-locked via `overlays.open({ modal: true, trap: true, lockScroll: true, outside: false })`;
  each step's heading gets `tabindex="-1"` and receives focus, and the step change is announced
  (`announce(t('importer.stepOf', ...))`).
- Tab / Shift+Tab cycle within the dialog. Enter/Space activate the drop zone (opens the file
  picker); `Ctrl+V` pastes a copied file anywhere on the Upload step.
- On Review, Enter (via click or the fix button's native activation) opens an inline `<input>` for
  an invalid cell; Enter commits + re-validates, Escape cancels, blur commits.
- Escape closes/cancels the wizard except while the Import step is running (`shell.setEscape`
  toggles this).

## `O.importer`
```ts
const importer: {
  autoMap: typeof autoMap;
  coerce: typeof coerce;
  validate: typeof validateRows;
  read: typeof importFile;      // alias
  wizard: typeof importWizard;  // alias
};
```
`O.importFile` and `Orion.importWizard` are also attached directly on the root `O`/`Orion` object.

## CSS (`importer.css`)
Scoped under `.o-iw*` classes (`.o-iw-layer`, `.o-iw`, `.o-iw-header`, `.o-iw-steps`/`.o-iw-step`,
`.o-iw-body`, `.o-iw-footer`, plus per-step classes like `.o-iw-drop`, `.o-iw-map-row`,
`.o-iw-table`, `.o-iw-fix`, `.o-iw-importing`, `.o-iw-done`). Tokens only (surfaces, text, border,
`--o-primary`/`--o-danger` semantic colors, radius, shadow, motion durations); logical properties
throughout (`margin-inline-start`, `padding-inline`, `text-align: start`); the one physical
property (`box-shadow: inset 3px 0 ...` marking an invalid row) has an explicit `[dir="rtl"]`
override flipping it to `inset -3px 0 ...`. Below `576px` the dialog goes edge-to-edge
(`width/height: 100%`, no radius/border), the mapping grid collapses to one column, and only the
current step's label is shown in the stepper.

## Notes & limits
- No resumable/chunked upload — the whole file is read into memory before mapping (bounded only
  by `maxSize`).
- The Review table renders at most 200 rows at a time (`PREVIEW`); "Showing N of M" indicates
  when more exist. All rows are still validated and importable — only the preview is capped.
- `.xls` (pre-2007 binary Excel) is explicitly rejected; there is no BIFF reader in this codebase.
