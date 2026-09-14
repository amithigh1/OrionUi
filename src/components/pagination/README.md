# pagination — `<o-pagination>`

Standalone, accessible pager. It holds no data or list itself — only `total` / `page` / `page-size`
— and tells the host when the user navigates. Drives `<o-datatable>` internally (see
`datatable/40-layout.js` `_renderMeta()`) and works equally well driving a custom list/grid.

## Files

| File | Contents |
|---|---|
| `pagination.js` | `pageItems()` layout function, `OPagination` class, `<o-pagination>`, `Orion.pagination` |
| `pagination.css` | tokens-only styles, builds on the foundation `.o-pagination` / `.o-page-link` classes |

## Usage

```html
<o-pagination total="245" page="1" page-size="10" page-sizes="10,25,50,100" show-total></o-pagination>
```

```js
const pg = document.querySelector('o-pagination');
pg.addEventListener('o-change', e => render(e.detail.page, e.detail.pageSize));
pg.go('next');                 // or 'prev' | 'first' | 'last' | a 1-based number
pg.setPageSize(25, true);      // true = also fire o-change (as the built-in select does)
```

## `<o-pagination>` properties / attributes

| Prop | Attr | Type | Default | Reflect | Notes |
|---|---|---|---|---|---|
| `total` | `total` | `number` | `0` | – | Total item count. |
| `page` | `page` | `number` | `1` | – | Current page (1-based). Clamped to `[1, pages]` on every render; setting it programmatically does **not** fire events (use `go()` for user-style navigation with events). |
| `pageSize` | `page-size` | `number` | `10` | – | Items per page. |
| `pageSizes` | `page-sizes` | `number[]` (comma list or JSON array) | `[]` | – | Options for the rows-per-page `<select>`; the select is hidden when empty. The current `pageSize` is inserted (and the list re-sorted) if missing. |
| `siblings` | `siblings` | `number` | `1` | – | Page links shown on each side of the current page (`default`/`outline` variants). Forced to `0` when the host is narrower than 420px (auto, via `observeResize`). |
| `boundaries` | `boundaries` | `number` | `1` | – | Page links pinned at each end before an ellipsis appears. |
| `showTotal` | `show-total` | `boolean` | `false` | – | Render the "1–10 of 245" range (or `t('pagination.none')` when `total` is 0). |
| `showJump` | `show-jump` | `boolean` | `false` | – | Render a "Go to page" number input (Enter to jump). Hidden when `variant="compact"` (which already has an editable page number). |
| `edges` | `edges` | `boolean` | `false` | – | Render first/last (double-chevron) buttons. Hidden when `variant="simple"`. |
| `variant` | `variant` | `'default' \| 'outline' \| 'simple' \| 'compact'` | `'default'` | yes | Visual style. `simple` = "Page 3 of 24" text only; `compact` = an editable page-number input + "/ N". |
| `size` | `size` | `'' \| 'sm'` | `''` | – | Compact page-link sizing (adds `.o-pagination-sm`). |
| `align` | `align` | `'' \| 'start' \| 'center' \| 'end' \| 'between'` | `''` | – | Sets the host's `justify-content` (the host itself is `display:flex`). |
| `disabled` | `disabled` | `boolean` | `false` | yes | Disables every control (page links, size select, jump input) and sets `aria-disabled`. |
| `label` | `label` | `string` | – | – | Overrides the `<nav aria-label>` (falls back to `t('pagination.label')`). |
| `texts` | `texts` (JSON) | `Record<string,string>` | – | – | Per-instance i18n override, read via `this.t()`. Keys: `label, prev, next, first, last, page, pageOf, range, none, perPage, rowsPerPage, jump, jumpLabel, current`. Values may contain `{param}` placeholders (e.g. `range: '{start}-{end} / {total}'`). |
| `pages` | – | `number` (read-only getter) | – | – | `Math.max(1, Math.ceil(total / pageSize))`. |

## Events

Bubbling, composed, `o-` prefixed (`this.emit(name, detail)`).

| Event | Detail | Cancelable | Fired |
|---|---|---|---|
| `o-before-change` | `{ page, pageSize }` | yes | Before a user-initiated navigation (page button, jump box, compact input Enter, or the size `<select>`) is applied. `preventDefault()` (or `event.preventDefault()`) vetoes it — `page`/`pageSize` stay unchanged and no `o-change` follows. |
| `o-change` | `{ page, pageSize }` | no | After the page (or page size) actually changed because of user interaction, or a script calling `go()` / `setPageSize(n, true)`. Programmatic `pg.page = n` assignment does **not** fire this. |

## Methods

| Method | Returns | Description |
|---|---|---|
| `go(page)` | `boolean` | `page` is a 1-based number (rounded, clamped to `[1, pages]`) or one of `'prev' \| 'next' \| 'first' \| 'last'`. Fires `o-before-change` then, unless vetoed, applies `this.page = n` and fires `o-change`. Returns `false` when `disabled`, vetoed, or the page did not actually change (still re-renders in that last case); returns `true` on a successful change. |
| `next()` | `boolean` | Shortcut for `go('next')`. |
| `prev()` | `boolean` | Shortcut for `go('prev')`. |
| `setPageSize(n, user = false)` | `void` | Sets `pageSize = max(1, n)`, and recomputes `page` so the first item that was visible stays on screen (`page = floor(oldFirstIndex / n) + 1`). Pass `user: true` to also fire `o-change` (the built-in rows-per-page `<select>` always does this); omit/`false` for a silent programmatic resize. |

No `getState`/`setState` — the component is stateless beyond its own props; persist `page`/`pageSize` yourself if needed.

## JS / static API

| Name | Signature | Description |
|---|---|---|
| `Orion.pagination.items` | `pageItems(page, pages, siblings = 1, boundaries = 1) => (number \| 'gap' \| 'gap-end')[]` | Pure function that computes the page-button layout used internally (e.g. `[1, 'gap', 4, 5, 6, 'gap-end', 20]`). Useful for building a custom pager UI with the same ellipsis behavior. `'gap'` and `'gap-end'` are both rendered as an ellipsis; they are distinct tokens only so a caller can tell which side of the current page a gap sits on. |
| `Orion.Pagination` | class | The `OPagination` class (for `instanceof` checks or subclassing). |

There is no `Orion.pagination(el, config)` factory function (unlike `Orion.chart`/`Orion.datatable`) — construct `<o-pagination>` via `document.createElement('o-pagination')` or markup and set properties directly.

## Keyboard

Handled in `_key(e)`, bound on the `<ul class="o-pagination">`:

| Key | Action |
|---|---|
| `Tab` | Normal tab order lands on the current page's button (`aria-current="page"`, `is-active`), or the first enabled button if none is current. |
| `→` / `←` | Move focus to the next / previous **enabled** button in the pager (disabled buttons are skipped). Physical arrow meaning flips under `dir="rtl"` (`isRTL(this)`) so the key always moves focus in the visually-expected direction — flexbox already mirrors the DOM order under RTL, so this flip keeps arrow keys visually consistent. |
| `Home` / `End` | Focus the first / last enabled button. |
| `Page Down` / `Page Up` | `go('next')` / `go('prev')` from anywhere in the pager — a button does not need to be focused, since the listener is on the whole `<ul>`. |
| `Enter` | Native button activation; in the jump box or the `compact` variant's input, submits the typed page number (handled by a `change`/`keydown` listener on `.o-pager-current` / the jump input, not `_key`). |

ARIA: `<nav aria-label="Pagination">` (or `label`/`texts.label`); the current page button has `aria-current="page"`; every button has a descriptive `aria-label` (`t('pagination.page', {page})`, `t('pagination.current', {page})`, `t('pagination.next')`, …); the total/range text (`.o-pager-total`) is plain text that updates on render (not `aria-live`, since it's driven by prop changes the host controls).

## Notes & limits

- No dependency on `<o-datatable>` — `<o-datatable>` depends on `<o-pagination>` (`// @deps pagination` in `datatable/00-base.js`) and creates one internally in `_renderMeta()` when `customElements.get('o-pagination')` is available at build time; falls back to a bare prev/next `<div class="o-btn-group">` otherwise.
- `pageSizes` accepts a comma-separated attribute string (`"10,25,50"`) or a JSON array attribute (`"[10,25,50]"`); as a property, pass a plain `number[]`.
- Focus is preserved across re-renders: if a pager button had focus before a `render()` (e.g. after `total` changes), the button at the same `data-page` (or the current page, or the first enabled button) regains focus afterward.
