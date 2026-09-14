# printpreview — paginated print preview + printing

`src/components/printpreview/printpreview.js` (+ `printpreview.css`). Declares
`// @deps exporter` (uses `O.export.pdf`/`O.export.tableHTML` at runtime for the "Download PDF"
button and dataset previews). Registers `Orion.printPreview`, `Orion.printTable`.

```js
printPreview.print = printDirect;
printPreview.paginate = paginate;         // exposed for advanced/test use
O.printPreview = printPreview;
O.printTable = (rows, columns, opts) => ...;
```

## `Orion.printPreview(target, options?) -> Handle`

```ts
type Target = Element | string /* CSS selector, or an HTML string if it starts with '<' */
            | { rows: any[], columns?, title?: string, subtitle?: string };

function printPreview(target: Target, options?: {
  title?: string,                          // default: target.title, or an element target's own title, or document.title
  orientation?: 'portrait' | 'landscape',  // default 'portrait'
  paper?: 'A4'|'Letter'|'Legal'|'A3'|'A5' | [widthMm, heightMm],  // default 'A4'
  margins?: 'default'|'narrow'|'wide'|'none' | number /* mm */ | { top, right, bottom, left },  // default 'default' (15mm; narrow=8, wide=25, none=0)
  scale?: number | 'fit',                  // default 1; 'fit' shrinks wide content to the page width
  background?: boolean,                    // default true — print background colors/images
  header?: HeaderFooterSpec, footer?: HeaderFooterSpec,
  showPageNumbers?: boolean,               // default true — only used to build the DEFAULT footer (ignored if `footer` is set)
  onPrint?(info: { pages: number, paper, orientation }) -> false | void,   // return false to cancel printing
  pdf?: boolean,                           // default true — show "Download PDF" when the source is tabular
  subtitle?: string, filename?: string,    // used by the PDF-download button
}): Handle

type HeaderFooterSpec = false | null | string | { left?, center?, right?: string | Node }
  | ((ctx: { page, pages, title, date, time, url }) => string | Node);

type Handle = {
  el: HTMLElement, pages: number,
  print(): Promise<void>,
  close(): void,
  update(next: Partial<{ paper, orientation, margins, scale, background }>): void,
  closed: Promise<string>,    // resolves with the overlay close reason when the dialog closes
};
```

Opens a modal dialog with a settings sidebar (paper, orientation, margins, scale, background
toggle) and a scrollable stage of **page sheets** rendered at true paper size (`96 CSS px / inch`
via the `MM` constant `96/25.4`), so what's on screen is what gets printed.

### Source resolution (`sourceFor`)

- `{ rows, columns, ... }` → builds a report block (`<h1>` title if given, a meta line, and
  `O.export.tableHTML(rows, { columns, tableClass: 'o-table o-table-sm o-table-bordered o-pp-table' })`).
- A DOM `Node` → previewed via `printable()` (see below).
- A string starting with `<` → treated as **trusted** HTML and inserted as-is (sanitize
  user-supplied content yourself with `O.sanitize()` first — this is documented as a caveat).
- Any other string → treated as a CSS selector; if it resolves to an element, that element is
  previewed; otherwise the (escaped) string itself becomes the preview content.

### Cloning for print (`printable(node)`)

Deep-clones the source node and: strips `<script>`/`<template>`/`<noscript>`; removes every `id`
(avoids collisions when the same content is later inserted into the print iframe); flattens any
custom element (`tag-name` containing a hyphen and registered via `customElements.get`) to a
plain `<div>`/`<span>` (based on its computed `display`) carrying its original attributes and
children — so components never re-run in the preview/print output; copies live form state
(checkbox/radio `checked`, `<select>` option `selected`, `<textarea>` text content, other inputs'
`value` attribute) from the live DOM onto the clone; converts every `<canvas>` to a `<img>` PNG
snapshot (`toDataURL`) at its rendered size.

### Pagination (`paginate(flow, pageHeightPx)`, exposed as `printPreview.paginate`)

A measure-then-place two-pass algorithm over the *live, rendered* flow element:
- Text nodes and elements are placed on the current page if they fit below the current page's
  top; otherwise a new page starts.
- `break-before/break-after: page|always` and legacy `page-break-before/after: always` force a new
  page (CSS `break-inside: avoid`/`avoid-page` or the legacy property is honored — such an element
  is never split, only pushed whole to the next page if it doesn't fit and isn't `ATOMIC`... see
  below).
- **Splittable containers**: a block/flow-root/list-item (or a column-direction flex/single-column
  grid) element with matching-display children that is taller than a page, or would otherwise
  straddle a page boundary in its lower 15%, has its **children** distributed across pages instead
  of being pushed whole (each page gets a shell clone of the container so styling like a bordered
  `<blockquote>` continues, and an `<ol>` clone gets a `start` attribute continuing the numbering).
- **`ATOMIC` elements** (`img svg canvas video audio iframe object embed picture pre tr thead
  tbody tfoot button input select textarea figure math hr`) are never split — placed whole.
- **Tables** are special-cased (`placeTable`): the header (`<thead>` or first row) height is
  measured once and reserved on every page after the first; rows are distributed across pages
  (never split), continuation table clones get `table-layout:fixed` and cloned `<colgroup>` widths
  so columns don't reflow; the caption/`<thead>` are only in the first part, `<tfoot>` only in the
  last.
- Returns `pages: PageEntry[][]` — an intermediate "plan" later materialized into real DOM by
  `buildEntries()`. Trailing fully-empty pages are dropped.

### Scaling & measuring

Content is first rendered off-screen at content-box width in a hidden `.o-pp-measure` element;
`scale: 'fit'` measures the natural content width (including any table/pre/img/svg overflow) and
computes a `<= 1` zoom factor so it exactly fits; any other `scale` (0.1–4, clamped) is applied via
CSS `zoom`. Re-render (`render()`) is triggered by every settings change; it fully rebuilds the
plan and pages, so header/footer templates always see the correct `pages` total.

### Header/footer

`header`/`footer` accept `false`/`null` (hidden), a template string with `{page} {pages} {title}
{date} {time} {url}` tokens (put in the `left` slot), `{ left, center, right }` (each a string
template or a `Node`), or a function `(ctx) => string | Node`. Defaults (only applied when the
option is `undefined`, not explicitly falsy): header = `{ left: '{title}', right: '{date}' }` (only
if there is a title); footer = `{ right: 'Page {page} of {pages}' }` when `showPageNumbers` is
true.

### Printing (`doPrint`)

Calls `onPrint({ pages, paper, orientation })` first (aborts if it returns exactly `false`), then
serializes the already-rendered page sheets' `outerHTML` into a **hidden `<iframe>`** with a
`srcdoc` document that: copies every `<style>`/`<link rel=stylesheet>` (and `adoptedStyleSheets`)
from the host document, sets `@page { size: <w>mm <h>mm; margin: 0 }` (margins are baked into the
page sheet layout instead, since the preview already reserves them), waits for images to decode
and fonts to be ready, then calls `.focus()` + `.print()` on the iframe's `contentWindow`. The
iframe is removed 400 ms after `afterprint` fires, or forcibly after a 60-second safety timeout.

### PDF download button

Shown when `pdf !== false` **and** the source resolves to tabular data — either the original
`{ rows, columns }` target, or (for an element/HTML target) exactly one `<table>` inside it
(`tableData()` extracts `{ rows, columns }` by reading cell text). Calls `O.export.pdf(rows, {
columns, title, subtitle, size: paper, orientation, margin: <derived from the current top/left
margin>, filename })` — i.e. it re-renders as a proper `O.PDF` report rather than printing the
preview's HTML.

### Keyboard

`Ctrl`/`Cmd`+`P` inside the dialog triggers `print()` (native browser print is prevented in favor
of this handler). The dialog is a focus-trapped modal overlay (Escape closes, like any
`overlays.open({ modal: true, trap: true })` surface).

## `Orion.printTable(rows, columns, options?) -> Handle | Promise<void>`

Convenience wrapper: `printPreview({ rows, columns, title: opts.title, subtitle: opts.subtitle },
opts)` — unless `opts.preview === false`, in which case it calls `printPreview.print(...)` instead
(see below) and returns that Promise.

## `Orion.printPreview.print(target, options?) -> Promise<void>`

Prints **directly with no preview dialog**, using the browser's native pagination but the *same*
`@page` margin settings (`margin: <top>mm <right>mm <bottom>mm <left>mm` built from `options.margins`)
and the same source resolution / cloning (`printable()`) as the preview. Adds
`thead { display: table-header-group }` and `tr { break-inside: avoid }` rules. Accepts the same
`target`/`paper`/`orientation`/`margins`/`background`/`title` options as `printPreview` (scale and
header/footer templates are **not** applied in direct-print mode — it's native pagination).

## Errors thrown

None of the exported functions throw synchronously for bad input; an unresolvable target string
falls back to being escaped and shown as plain text. Printing failures (e.g. the iframe never
loading) are not specially caught — a `srcdoc` load is awaited with no timeout other than the
overall 60-second cleanup.

## Notes for TypeScript declarations

- `printPreview()` and `printTable()` (preview mode) return the `Handle` object synchronously; the
  page content itself renders synchronously too (no async gap), but images inside the previewed
  content may still be loading.
- `printPreview.print()` / `printTable(..., { preview: false })` return a `Promise<void>` that
  resolves once printing has been dispatched (not once the user's print dialog closes — that's not
  observable from script).
