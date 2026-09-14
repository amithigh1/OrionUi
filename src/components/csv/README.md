# csv — `O.csv`

RFC 4180 CSV/TSV parser and writer. Pure JS, no DOM required (works in Node, workers,
service workers). Single file: `csv.js`. No `// @deps` (no cross-folder references at
definition time; `O.date` is used opportunistically at call time by the writer if present).

No custom elements, no CSS, no i18n keys (all messages are structured `{ type, code, message, row }`
objects — see Errors below — the host application is responsible for presenting them).

## `O.csv.parse(text, opts?) → ParseResult`

Synchronous parse of a whole string.

```ts
function parse(text: string, opts?: ParseOptions): ParseResult;
```

### `ParseOptions`
| Option | Type | Default | Notes |
|---|---|---|---|
| `delimiter` | `',' \| ';' \| '\t' \| '\|' \| 'auto'` | `'auto'` | `'auto'` sniffs among `, ; \t \|` via `detect()`. |
| `header` | `boolean` | `true` | First non-empty row becomes field names; rows are objects keyed by field. `false` → rows are arrays. |
| `trim` | `boolean` | `false` | Trim whitespace around unquoted field values (leading space and trailing space/tab). |
| `skipEmpty` | `boolean \| 'greedy'` | `true` | `true` skips fully-blank unquoted lines (single empty field); `'greedy'` also skips rows where every field is blank/whitespace after trimming; `false` keeps them. |
| `quote` | `string` (1 char) | `'"'` | Quote character. |
| `comment` | `string \| true \| falsy` | `undefined` | Lines starting with this string (or `'#'` when `true`) are skipped entirely (not counted as rows). |
| `dynamicTyping` | `boolean \| Record<string, boolean> \| (field, index) => boolean` | `undefined` | Converts string values via `typed()` (see below). `true` = all fields; an object/function selects per field name (header mode) or per index (no-header mode). |
| `transform` | `(value: string, fieldOrIndex: string \| number) => any` | `undefined` | Runs before `dynamicTyping` on every raw field value. |
| `transformHeader` | `(name: string, index: number) => string` | `undefined` | Rewrites each header cell before de-duplication. |
| `maxRows` | `number` | `undefined` | Stop after this many data rows; sets `meta.truncated = true`. |
| `onChunk` | `(rows: object[] \| any[][], meta: ChunkMeta) => void \| false` | `undefined` | Called every `chunkSize` rows (and once more at the end). Return `false` to stop parsing (`meta.aborted = true`). |
| `chunkSize` | `number` | `1000` | Rows per `onChunk` call. |
| `collect` | `boolean` | `!onChunk` | Whether parsed rows accumulate into the returned `rows` array. **Defaults to `false` when `onChunk` is given** (streaming mode — read rows from the callback, not from the result, to keep memory flat) and to `true` otherwise. Pass `collect: true` explicitly to get both. |

`ChunkMeta = { fields: string[] | null, delimiter: string, rows: number, final: boolean }`.

### `ParseResult`
```ts
interface ParseResult {
  rows: Record<string, any>[] | any[][];   // objects when header:true, else arrays; [] when collect is false
  fields: string[];                        // [] when header:false
  errors: Array<{ type: string; code: string; message: string; row: number }>;
  meta: { delimiter: string | null; linebreak: string | null; truncated: boolean; aborted: boolean; rows: number; encoding?: string };
}
```
- Header names are de-duplicated (`name`, `name_2`, `name_3`, …) and blank headers become `field1`, `field2`, …
- A row with more raw fields than headers keeps the extras on `row.__extra` (array) and records a `FieldMismatch/TooManyFields` error; fewer fields records `FieldMismatch/TooFewFields` (missing cells become `''`).
- Malformed quoting records `Quotes/MissingQuotes` (unterminated quote, only at end of input) or `Quotes/InvalidQuotes` (text after a closing quote, which is absorbed into the field).
- Handles CRLF, LF and CR line breaks (mixed within one file), quoted fields containing delimiters/quotes (`""` = literal `"`) and newlines, and a leading UTF-8 BOM (stripped before delimiter sniffing).

### `typed(v: string) → string | number | boolean | Date | null`
Exported as `O.csv.typed`. Conversion rules applied by `dynamicTyping`:
- `''` → `null`.
- Matches `/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/` → `Number(v)`, **except** values matching `/^[-+]?0\d/` (e.g. `'007'`, `'0123'`) which stay strings (leading-zero codes).
- A digit-starting string of length ≥ 10 that isn't numeric is tried as an ISO date/datetime (`isoDate()`, validates the calendar date) — a `Date` on success, else left as text.
- Exactly `'true'` / `'false'` (case-insensitive, length 4 or 5) → `boolean`.
- Anything else is returned unchanged.

### `detect(text, candidates？, quote？) → ',' | ';' | '\t' | '\|'`
```ts
function detect(text: string, candidates?: string[] /* default DELIMITERS */, quote?: string /* default '"' */): string;
```
Exported as `O.csv.detect`. Quote-aware voting over up to the first 65,536 characters / 25 lines per
candidate delimiter: the delimiter whose per-line field count is most consistent (highest mode
frequency ⁄ line count, ties broken by higher field count) wins; falls back to `','` when nothing
scores ≥ 2 fields/line.

## `O.csv.parseAsync(input, opts?) → Promise<ParseResult>`
```ts
function parseAsync(input: string | Blob | File, opts?: ParseOptions & {
  encoding?: 'auto' | string;   // default 'auto'
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
  sliceSize?: number;           // string input only, default 1 << 19 (524288 chars)
}): Promise<ParseResult>;
```
Accepts every `ParseOptions` above plus:
- **Blob/File**: streamed via `input.stream()` in native chunks, decoded with `TextDecoder`. `encoding: 'auto'` (default) sniffs a UTF-16 BOM (`utf-16le`/`utf-16be`) from the first 4 bytes, otherwise tries strict UTF-8 (`fatal: true`) and falls back to `windows-1252` if that throws. `meta.encoding` reports what was used. Yields to the UI thread (`scheduler.yield()` or a `setTimeout(0)`) roughly every 1 MiB read, and reports `onProgress(bytesRead / blob.size)`.
- **string**: sliced into `sliceSize`-character pieces, yielding between slices; `onProgress(charsProcessed / length)`.
- Checks `signal.aborted` before each read/slice and throws `DOMException`-like `Error('Aborted')` with `name: 'AbortError'` when aborted (also stops if `onChunk` returns `false`, without throwing).

## `O.csv.stringify(rows, opts?) → string`
```ts
function stringify(rows: any[], opts?: StringifyOptions): string;
```
### `StringifyOptions`
| Option | Type | Default | Notes |
|---|---|---|---|
| `columns` | `Array<string \| number \| { key: string \| number \| ((row) => any); title?: string; format?: (value, row) => any }>` | derived | A plain string/number entry is used as both `key` and `title`. Without `columns`: if rows are plain objects, keys are collected from up to the first 100 rows (insertion order, first-seen); if rows are arrays and `fields` is given, that's the header. |
| `header` | `boolean` | `true` | Emit a header line (only used together with `columns` or `fields`). |
| `delimiter` | `string` | `','` | Any single (or multi-char) separator. |
| `eol` | `string` | `'\r\n'` | Line terminator. |
| `quote` | `'auto' \| 'all'` | `'auto'` | `'auto'` quotes only fields containing the delimiter, `"`, CR, LF, or leading/trailing whitespace; `'all'` quotes every field. |
| `bom` | `boolean` | `false` | Prefix the output with `﻿` (helps Excel detect UTF-8). |
| `safe` | `boolean` | `true` | **CSV formula-injection guard**: a string field starting with `= + - @ TAB CR` gets a leading `'` inserted, *unless* it also matches a plain-number-like pattern (e.g. `-12.5`, `-$5.00`, `+3%`) per `PLAIN_NUM_RE`. |
| `nullValue` | `string` | `''` | Text used for `null`/`undefined`. |
| `dateFormat` | `string` | `undefined` | Passed to `O.date.format(d, dateFormat)` when present; otherwise dates render as `YYYY-MM-DD` (or `YYYY-MM-DD HH:mm:ss` when the time isn't midnight), via local getters. |
| `fields` | `string[]` | `undefined` | Header row when rows are arrays and `columns` isn't given. |
| `trailingEol` | `boolean` | `false` | Append one more `eol` after the last line. |

Cell rendering: `number` → `String(v)` (or `''` if not finite); `boolean` → `'true'/'false'`; `Date` → per `dateFormat`; `Array` → items joined with `', '` (dates/objects stringified per-item); other objects → `JSON.stringify(v)`; everything else → `String(v)`. `column.format(value, row)` (if given) runs first and its result is stringified the same way. Numeric values are never subject to the `safe` prefix.

## `O.csv.Parser`
The incremental engine backing `parse`/`parseAsync` (`class CsvParser`), exported as `O.csv.Parser` for advanced streaming use (e.g. custom transport):
```ts
class Parser {
  constructor(opts?: ParseOptions);
  push(chunk: string, final?: boolean): this;   // feed text as it arrives; final=true flushes
  result(): ParseResult;
}
```

## `O.csv.DELIMITERS`
`[',', ';', '\t', '|']` — the candidate list `detect()` uses by default.

## Notes & limits
- No RFC 4180 "record separator inside header only" edge cases beyond what's described; multi-character delimiters are supported for `stringify` but `parse`/`detect` treat `delimiter` as a single character.
- `parse`/`parseAsync` never throw for malformed CSV; problems are reported in `errors` (aborts/cancellation are the only rejection paths for `parseAsync`).
- `stringify` is synchronous and holds the whole output string in memory; `O.export.csv` (exporter package) chunks large row sets and yields between chunks — use that instead of calling `stringify` directly for very large exports.
