# pdf — dependency-free PDF 1.4 generator

`src/components/pdf/pdf.js`. Zero dependencies. Works in the browser, Web Workers and Node 18+
(images require a DOM `<canvas>`/`Image`, except JPEG bytes/data-URLs which are embedded as-is
without decoding). Registers `O.PDF` (class) and `O.pdf(opts)` (factory) on `Orion`.

```js
O.PDF = PDF;               // class
O.pdf = opts => new PDF(opts);
PDF.sizes; PDF.units; PDF.encode; PDF.loadImage; PDF.measure;
```

## `new O.PDF(options?)`

```ts
new PDF({
  size?: 'A3'|'A4'|'A5'|'A6'|'Letter'|'Legal'|'Tabloid'|'Executive' | [width, height],  // default 'A4'
  orientation?: 'portrait' | 'landscape',   // default 'portrait'
  unit?: 'pt' | 'mm' | 'cm' | 'in' | 'px',  // default 'pt' — applies to every coordinate/size you pass in
  margin?: number | [v,h] | [top,right,bottom,left] | { top, right, bottom, left },  // default: min(40pt, 7% of page width)
  font?: 'Helvetica' | 'Arial' | 'Times' | 'Times New Roman' | 'Courier' | 'monospace' | ...,  // default 'Helvetica'; aliased to one of 3 families
  fontSize?: number,      // default 10
  lineHeight?: number,    // default 1.2 (multiplier)
  color?: string | [r,g,b] | number,  // default '#111827'
  compress?: boolean,     // default true — Flate-compress page content streams and images
  title?, author?, subject?, keywords?, creator?: string,  // document info dictionary
  header?(pdf: PDF, info: PageInfo): void,
  footer?(pdf: PDF, info: PageInfo): void,
})
```

`PageInfo = { page: number, pages: number, width: number, height: number, margin: {top,right,bottom,left} }`
(sizes in `unit`). `header`/`footer` run **once per page at output time** (inside `toBytes()`), so
`info.pages` and per-page geometry are always exact, including for pages added by `write()`/`table()`
overflow. A page is created automatically in the constructor; coordinates are measured from the
**top-left** of the page.

## Text

### `pdf.text(str, x?, y?, opts?) -> this`

Draws text at an absolute position (defaults to the current cursor `pdf.x`/`pdf.y` if `x`/`y`
omitted — call as `pdf.text(str, opts)` in that case). Sets `pdf.lastText = { width, height, lines }`
(in `unit`) after drawing.

| Option | Type | Notes |
|---|---|---|
| `size` | number | Default: current font size. |
| `font` | `'Helvetica'\|'Times'\|'Courier'` (+ aliases) | Default: current font. |
| `bold`, `italic` | boolean | Select the matching standard-14 variant. |
| `color` | string/array/number | Default: current text color. |
| `align` | `'left'\|'center'\|'right'\|'justify'` | `'justify'` only affects non-final wrapped lines. |
| `maxWidth` | number | Enables wrapping; required for `align` to have any visual effect beyond the first line. |
| `maxLines` | number | Truncates wrapped output with an ellipsis (`…`) on the last kept line, shrinking it to fit `maxWidth`. |
| `lineHeight` | number | Overrides the instance default for this call. |
| `baseline` | `'top'\|'middle'\|'bottom'\|'alphabetic'` | Default `'top'` — `y` is the top of the text block. |
| `underline`, `strike` | boolean | Drawn as a thin rule under/through each line (ignored when `angle` is set). |
| `link` | string \| `{ page: n }` | Adds a clickable link annotation the size of each line (ignored when `angle` is set). |
| `angle` | number (degrees) | Rotates the text (CCW); disables underline/strike/link decoration. |
| `opacity` | number 0–1 | Applies an `ExtGState` alpha to the whole text draw. |

### `pdf.write(str, opts?) -> this`

Flowing text at the cursor: wraps to `opts.width` (default: remaining content width from
`opts.x`/`pdf.x`), automatically breaks to a new/next page when a line would cross the bottom
margin, and advances `pdf.y` (and resets `pdf.x` to the left margin) after drawing. Extra options:
`x`, `width`, `indent` (added to the left margin for `x`'s default), `gapBefore` (space added
before, in `unit`), `gap` (space added after; default `lineHeight * 0.35`). Accepts the same text
styling options as `text()`.

### Measuring (no document mutation)

- `pdf.widthOf(str, opts?) -> number` — width of a single line in `unit`.
- `pdf.splitText(str, maxWidth, opts?) -> string[]` — wrapped lines (WinAnsi-encoded) for `maxWidth`.
- `pdf.heightOf(str, opts?) -> number` — total wrapped height in `unit` (`opts.maxLines` honored).
- `O.PDF.measure(str, { size?, bold?, font? }) -> number` — **static**, width in points with no
  `PDF` instance needed (used by `O.export.pdf` to decide portrait vs. landscape).

### Text encoding — WinAnsi only

`PDF.encode(str) -> string` runs the same conversion used internally (`winAnsi()`): ASCII and
Latin-1 pass through; a fixed set of "smart" typography and Windows-1252 characters
(curly quotes, dashes, €, †, ‰, …) map to their WinAnsi codes; some further symbols are
substituted with ASCII look-alikes (minus signs, arrows `→` → `->`, ≤/≥/≠, checkmarks, a handful
of currency abbreviations, `Ł/ł/Đ/đ/ı/Ħ/ħ/Ŧ/ŧ` etc. folded to plain Latin); a combining-mark strip
(NFD normalize + strip diacritics) is tried next for anything still unmapped (`ą → a`, `ő → o`);
**everything else — Greek, Cyrillic, Arabic, Hebrew, CJK, emoji — becomes `?`** per unmapped
character. Document **info dictionary** strings (`title`/`author`/`subject`/`keywords`) are
exempt: they're written as UTF-16BE hex strings and support full Unicode. For full-Unicode page
content, use `Orion.printPreview()`'s browser print-to-PDF path instead.

## Vector graphics (all accept `x, y` in `unit`, measured from the top-left)

- `pdf.line(x1, y1, x2, y2, opts?)` — `{ color, width, dash: number[] }`.
- `pdf.rect(x, y, w, h, opts?)` — `{ fill, stroke, radius, width, opacity }`; `fill`/`stroke` may be
  a color, `true` (use current fill/draw color), or omitted. Default (no `fill`/`stroke`/`color`
  given) strokes with the current draw color.
- `pdf.circle(cx, cy, r, opts?)`, `pdf.ellipse(cx, cy, rx, ry, opts?)` — same style options,
  approximated with 4 cubic Béziers.
- `pdf.polygon(points: [x,y][], opts?)` — `{ close: boolean = true, ...style }`.
- State setters (chainable): `setFont(name, style?)`, `setFontSize(n)`, `setTextColor(c)`,
  `setDrawColor(c)`, `setFillColor(c)`, `setLineWidth(n)`, `setProperties(metaPatch)`.

## Images

`pdf.image(src, x?, y?, opts?) -> this`

`src`: raw JPEG `Uint8Array`/`ArrayBuffer`, a `data:image/jpeg;base64,...` URL (embedded as-is,
`DCTDecode`, no re-encoding), any other URL string (fetched), a `Blob`, `HTMLCanvasElement`,
`OffscreenCanvas`, `HTMLImageElement`, `ImageBitmap`, or `ImageData` (rasterized to RGB + an
optional alpha soft-mask, `FlateDecode`). Sources that need fetching/decoding are resolved lazily
during `toBytes()`/`toBlob()` (so you can call `pdf.image()` synchronously any number of times
before awaiting output). `opts`: `{ width?, height?, fit?: 'contain'|'cover', opacity? }` — with
neither `width` nor `height`, the image is drawn at 96-DPI-equivalent size (`px * 0.75`); with one
given, the other keeps aspect ratio; `fit` requires both. Sets `pdf.lastImage = { width, height }`.
`O.PDF.loadImage(src) -> Promise<Uint8Array | ImageBitmap | HTMLImageElement>` is exposed
standalone (used by `O.export.pdf`'s `logo` option).

## Links

`pdf.link(x, y, w, h, target: string | { page: number }) -> this` — adds a rectangular link
annotation; `target` is a URI or an internal page-fit destination.

## Pages & cursor

- `pdf.addPage(opts?)` — `{ size?, orientation?, margin? }` (defaults to the constructor's),
  appends a page, makes it current, and resets the cursor to its top-left margin.
- `pdf.setPage(n)` — 1-based; clamped to the valid range; resets the cursor.
- `pdf.ensureSpace(h)` — breaks to a new/next page first if `h` (in `unit`) doesn't fit below the
  cursor before the bottom margin.
- `pdf.moveDown(lines = 1)` — advances `pdf.y` by `lines * fontSize * lineHeight`.
- Read-only getters: `page` (1-based current), `pageCount`, `width`, `height` (current page, in
  `unit`), `margin` (`{top,right,bottom,left}`, a copy), `contentWidth`, `contentHeight`, `bottom`
  (`height - margin.bottom`). Mutable cursor: `pdf.x`, `pdf.y`.

## Tables

```ts
pdf.table(opts) -> { y: number, page: number }
await pdf.tableAsync(opts) -> Promise<{ y: number, page: number }>   // yields every 256 rows; opts.onProgress(rowIndexOrRatio)
```

```ts
opts: {
  columns?: (string | { key, title?, width?: number | `${n}%` | 'auto' | '*', align?, format?(value,row), type?, hidden? })[],  // default: keys of the first object row
  rows: any[],
  x?, y?, width?,                       // default: left margin / cursor / contentWidth
  fontSize?: number,                    // default 9
  padding?: number | [v,h],             // default 4 (h = padding+1)
  lineHeight?: number,                  // default 1.25
  header?: boolean,                     // default true
  headerStyle?: { fill?, color?, bold?, fontSize? },  // default { fill:'#EEF2F7', color:'#0F172A', bold:true }
  zebra?: boolean | color,              // default true (uses '#F7F9FC' when `true`)
  borderColor?: string,                 // default '#DDE3EA'
  borders?: 'horizontal' | 'all' | 'none',  // default 'horizontal'
  columnWidths?: (number | string)[],   // alternative to per-column `width`
  repeatHeader?: boolean,               // default true — redraws the header row after a page break
  align?: 'left'|'center'|'right',      // fallback alignment for columns without one
  maxLines?: number,                    // truncates wrapped cell text per cell
  cellStyle?(value, row, column, index) -> { fill?, color?, bold? } | null,
}
```

- Column widths: explicit numeric/`%` widths are fixed; the rest ("auto") get a natural width from
  the header and a sampled subset of rows (every ~1-in-400 rows), shrunk proportionally if the
  natural total exceeds the available width (down to a computed minimum per column based on its
  longest unbreakable word) before all remaining space is distributed.
  Right-aligns a column automatically when its `type` is numeric or (untyped) its sampled values
  are numbers.
- Cell value formatting (`type`): `number`/`integer` via `fmt.number`, `currency` via
  `fmt.currency`, `percent` via `fmt.percent`, `date`/`datetime` via `fmt.date`/`fmt.datetime`,
  `boolean` → localized Yes/No; `column.format(value, row)` overrides all of that. Values that are
  `Date`/boolean/array/object are auto-formatted even without an explicit `type`.
  A row that overflows the bottom margin is bumped whole to a new page (rows are never split
  mid-row); the header is redrawn there when `repeatHeader` is true.

## Output

All async; render the entire document (running `header`/`footer` for every page, loading any
pending images, and Flate-compressing streams when `compress`).

- `await pdf.toBytes() -> Uint8Array` — the canonical PDF byte stream. Fixed prefix `%PDF-1.4\n` +
  a binary comment; ends with `...startxref\n<offset>\n%%EOF\n`. Every indirect object is preceded
  by its computed byte offset in a plain (non-cross-reference-stream) `xref` table, so the offsets
  are always exact for the bytes actually produced.
- `await pdf.toBlob() -> Blob` (`type: 'application/pdf'`).
- `await pdf.toDataURL() -> string` (`data:application/pdf;base64,...`).
- `await pdf.toObjectURL() -> string` (`URL.createObjectURL` of the Blob — caller should
  eventually `URL.revokeObjectURL` it).
- `await pdf.save(filename = 'document.pdf') -> Promise<Blob>` — also triggers a browser download
  via core `download()` (a `.pdf` extension is appended if missing) and resolves with the Blob.

## Errors thrown

- `pdf.image(src, ...)` throws `Error('pdf.image: no source')` for a falsy/unrecognized `src` with
  no pending-load path.
- Loading a pending image during output throws `Error('pdf.image: unsupported image data')` if
  fetched/decoded bytes aren't a JPEG and can't be rasterized.
- All drawing/measuring methods otherwise do not throw for out-of-range input; malformed colors
  fall back to a sane default (`rgb()` returns the fallback, `[0,0,0]` unless specified).

## Notes for TypeScript declarations

- `PDF` is a class; most drawing/state methods return `this` for chaining. `toBytes/toBlob/
  toDataURL/toObjectURL/save/tableAsync` are the only `Promise`-returning instance methods.
  `table()` is synchronous.
- `PDF.sizes: Record<string, [number, number]>` (points, lowercase keys `a3 a4 a5 a6 letter legal
  tabloid executive`), `PDF.units: Record<'pt'|'mm'|'cm'|'in'|'px', number>` (points-per-unit).
