# virtuallist — `<o-virtual-list>` / `Orion.virtualList`

Windowed rendering for huge arrays: only the rows near the viewport (+ `overscan`) are ever created, recycled
from a small DOM node pool as you scroll, so 100,000+ rows scroll at 60fps. Fixed or auto-measured row heights,
horizontal strips, auto-fit grids, sticky group headers, and listbox keyboard selection — one dependency-free
element.

Docs: `docs/components/virtual-list.html`.

## Files

| File | Contents |
|---|---|
| `00-fenwick.js` | `VFenwick` — a Fenwick (binary-indexed) tree over row sizes: `offsetOf(i)` (offset of row i) and `indexAt(pos)` (row at scroll position) both resolve in O(log n), the two operations the virtualizer needs on every scroll frame even with 100k+ independently-measured rows. Also `vlBuildRows()` (flattens `items` + `groupBy` into item/group-header rows) and `vlDefaultKey()`. Folder-local only, no dependency on the rest of the library. |
| `10-virtuallist.js` | `<o-virtual-list>` and `Orion.virtualList()`. |
| `virtuallist.css` | Absolute-positioned row/cell layout, sticky group-header clone, selection/active states. Tokens only. |

## Usage

```html
<o-virtual-list id="list" item-height="44" style="block-size:24rem"></o-virtual-list>
```

```js
list.renderItem = (item, index) => { const el = document.createElement('div'); el.textContent = item.name; return el; };
list.items = hugeArray;                  // only the visible window is ever rendered
list.scrollToIndex(500, 'center');
Orion.virtualList('#list', { itemHeight: 'auto', groupBy: 'letter', renderGroup: k => k });
```

## Properties / attributes

| Property (attribute) | Type | Default | Description |
|---|---|---|---|
| `items` | Array | `[]` | The full dataset. Only the visible slice is ever rendered. |
| `itemHeight` (`item-height`) | number \| `'auto'` | 40 | Fixed row height in px, or `'auto'` to measure each row with `ResizeObserver` (list/vertical mode only). |
| `itemWidth` (`item-width`) | number | 220 | Row width in `horizontal` mode, or the fallback cell size in `grid` mode. |
| `overscan` | number | 6 | Extra rows rendered beyond each edge of the viewport, to absorb fast scrolls. |
| `horizontal` (reflects) | boolean | false | Virtualize a horizontal strip (`scrollLeft`, RTL-aware) instead of a vertical column. |
| `grid` (reflects) | boolean | false | Auto-fit column grid instead of one item per row. Requires a fixed `itemHeight`; no `groupBy`. |
| `columns` | number | 0 | `grid`: explicit column count. `0` = auto-fit from `minColumnWidth`. |
| `minColumnWidth` (`min-column-width`) | number | 180 | `grid` auto-fit floor, px. |
| `gap` | number | 0 | `grid` cell gap, px. |
| `groupBy` (`group-by`) | string (path) \| `(item) => key` | — | Insert a header row whenever the key changes. **Items must already be sorted** so each key's rows are contiguous. Vertical/list mode only (see Limitations). |
| `groupHeaderHeight` | number | 34 | Height of group-header rows and the sticky clone. |
| `renderGroup` | `(key, items) => Node \| string` | — | Custom header content; default is the key itself (escaped). |
| `renderItem` | `(item, index) => Node \| string` | — | Row content. `index` is the item's position in `items`, not the row's DOM position. Default is `esc(JSON.stringify(item))` — always supply your own for real data. |
| `keyFn` | `(item, index) => string \| number` | `item.id ?? item.key ?? index` | Stable identity, used for `selected` and to avoid unrelated rows re-rendering when `items` changes. |
| `selectable` | `'' \| 'single' \| 'multiple'` | `''` | Turns the list into a keyboard-operable `listbox`. |
| `selected` | array of keys | `[]` | Controlled selection, by `keyFn` key (not index). |
| `loading` (reflects) | boolean | false | Sets `aria-busy` and dims the list. |
| `emptyText` | string | "Nothing to show" | Shown when `items` is empty. |
| `label` | string | — | `aria-label` for the list. |
| `texts` | object | — | Per-instance string overrides (`listLabel`, `empty`, `loading`). |

## Events

| Event | Detail | Description |
|---|---|---|
| `range-change` | `{ start, end, total }` | The rendered row window moved (row space; equals item space when there is no `groupBy`). |
| `near-end` / `near-start` | `{ remaining }` / `{ index }` | Scrolled within `overscan` rows of either end — this is what `Orion.infiniteScroll` listens for when its `container` is a `<o-virtual-list>`. |
| `activate` | `{ index, item }` | The active item changed (click or arrow keys). |
| `select` | `{ selected, index, item }` | `selectable`: the selection changed. |

## Methods

| Method | Description |
|---|---|
| `scrollToIndex(index, align = 'auto')` | Scroll so item `index` is visible. `align`: `'auto' \| 'start' \| 'center' \| 'end'`. |
| `refresh()` | Clear measured heights and re-render (data unchanged) — use after something outside the list changes row sizes (e.g. a web font finishes loading). |
| `getVisibleRange()` | → `{ start, end }` currently rendered. |
| `appendItems(items)` | Append to the end — for "load more" infinite scroll. |
| `prependItems(items)` | Prepend to the start **preserving the visual scroll position** — for chat-style history loading (`Orion.infiniteScroll({ direction: 'up' })`). Anchors on whichever row was first visible before the prepend and re-applies the same scroll offset relative to it afterward; in `grid` mode the anchor is a simple row-count based `scrollTop` shift instead (uniform cell size makes that exact). |
| `select(keys)` / `clearSelection()` / `getSelected()` | Read or set the controlled selection. |

## `Orion.virtualList(container, options)`

Creates (or configures, if `container` already is one) the element. `options.on` attaches listeners (`o-`
prefix optional): `Orion.virtualList('#host', { itemHeight: 'auto', on: { 'range-change': fn } })`.

## Keyboard & accessibility

| Key | Action |
|---|---|
| ↓ / ↑ | Move the active row by one (by one grid row/column in `grid` mode). |
| ← / → | Move by one item — `grid` and `horizontal` modes. |
| Home / End | First / last item. |
| Page Down / Page Up | Move by one viewport's worth of rows. |
| Enter / Space | `selectable`: toggle the active item. |

The host is a `listbox` (or `grid` when `grid` is set) with `aria-activedescendant` pointing at the currently
active row's id — focus stays on the host itself rather than moving into recycled row nodes, which is the
correct pattern for a virtualized composite widget. Rows are `option`s with `aria-selected`; group headers are
`role="presentation"` (decorative dividers, not part of the option list).

## Limitations

* `groupBy` assumes vertical (non-`horizontal`, non-`grid`) mode: the sticky group-header clone is positioned
  with `transform: translateY(...)`, so combining `groupBy` with `horizontal` renders the row's own inline
  group headers but the sticky "pinned" clone will not track horizontal scroll correctly. Don't combine them.
* `grid` mode requires a fixed `itemHeight`/cell size (no `'auto'`) and does not support `groupBy`.
* `renderItem`/`renderGroup` results that are plain strings/`SafeHTML` are treated as trusted markup (same
  rule as every other render callback in this library) — `esc()` your own data first if it isn't developer
  literal markup.
* No built-in row animations (insert/remove transitions) — rows are recycled instantly. Combine with
  `prependItems`/`appendItems`, not direct `items` splicing, when the scroll position matters.
* `selected` is a flat array of keys, not a `Set`; very large controlled-selection sets pay an `includes()`
  scan per visible row (fine into the low thousands; for more, key selection off your own data model instead).
