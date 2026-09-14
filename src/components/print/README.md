# print

`Orion.print()` prints the current page or renders a specific element/selector/HTML string into a hidden iframe
with the page's own stylesheets copied over (canvases rasterized to `<img>`, `<details>` forced open), so the
printed output matches the app while excluding chrome. Ships page-size/margin CSS helpers, `data-o-action="print"`,
and print-only utility classes. No custom element.

## `Orion.print(target?, options = {})`

→ `Promise<Boolean>`, resolving `true` once the print dialog has been dismissed (`afterprint`) or the safety
timeout elapses.

`target`: omitted / `null` / `document` / `window` / `'page'` → prints the whole page in place (adds a temporary
`<style media="print">`); a selector/`Element` → clones it into a hidden `srcdoc` iframe and prints just that; an
HTML string (starts with `<`) is used as the body verbatim.

| Option | Type | Default | Notes |
|---|---|---|---|
| `title` | `String` | current title | Temporary `document.title` override during print. |
| `landscape` | `Boolean` | — | |
| `margins` | `Number` (mm) / `String` / `{ top, right, bottom, left }` | — | |
| `pageSize` | `String` | — | e.g. `'A4'`, `'letter'`. |
| `styles` | `Boolean` | `true` | Copy `<style>`/`<link rel=stylesheet>`/adopted stylesheets. A stylesheet/style tag opts out with `data-o-print-ignore` or `media="screen"`. |
| `css` | `String` | — | Extra raw CSS appended after the copied styles. |
| `bodyClass` | `String` | — | Class added to the print body. |
| `beforePrint({ window, document, frame? })` | `Function` | — | May return a `Promise` (awaited before printing). |
| `afterPrint()` | `Function` | — | |
| `timeout` | `Number` | `4000` | Ms to wait for images/fonts to finish loading in the iframe before printing. |
| `cleanupAfter` | `Number` | `120000` | Safety-net ms if the iframe's `afterprint` never fires. |

### Static

| Member | Description |
|---|---|
| `print.html(target, options)` | → the full HTML document `String` that would be printed (previews/tests). |
| `print.pageCSS(options)` | → just the `@page { ... }` rule for the given `landscape`/`margins`/`pageSize`. |

## Bus events

| Event | Detail | Notes |
|---|---|---|
| `print:before` | `{ target, options }` | Before `window.print()`/iframe print is invoked (after `beforePrint` resolves). |
| `print:after` | `{ target, options }` | After the print dialog closes, or the safety timeout fires. |

No DOM `CustomEvent`s are dispatched.

## Behaviors

### `data-o-action="print"`

Applies to a button.

| Sub-attribute | Notes |
|---|---|
| `data-o-target` | Selector — print an element instead of the page. Sets `aria-busy="true"` and announces "Preparing to print…" while the iframe loads. |
| `data-o-print-title` | → `title` option. |
| `data-o-landscape` | Presence → `landscape: true`. |
| `data-o-print-margins` | → `margins` option. |
| `data-o-print-size` | → `pageSize` option. |

## Helper CSS classes

Apply to any element, work in both print modes:

| Class | Effect |
|---|---|
| `.o-print-hide` / `.o-no-print` | Hidden only while printing. |
| `.o-print-only` | Normally hidden, shown while printing (also auto-unhidden if `[hidden]` inside a cloned print target). |
| `.o-print-break` | Forces a page break before the element. |
