# split

Two independent elements. `<o-split>` is a resizable, nestable split-pane container (WAI-ARIA window splitter
pattern) — draggable/keyboard-resizable gutters between any number of children, collapsible edge panes, and
persistence. `<o-split-view>` is a responsive list/detail (mail-client) layout that shows list and detail
side by side above a breakpoint and stacks them (with a slide transition and Back button) below it; it does not
build on `<o-split>` internally. The dock package reuses `<o-split>` for its resizable regions — see
[dock/README.md](../dock/README.md).

## Elements

### `<o-split>`

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `direction` | `direction` | `String` | `'horizontal'` (reflects) | `'horizontal' \| 'vertical'`. |
| `sizes` | `sizes` | `Array` | — | Initial pane weights, e.g. `sizes="30,70"` or `sizes="[30,70]"` (need not sum to 100). Overridden by any pane's own `data-size`. |
| `min` | `min` | `String` | — | Instance-wide minimum for every pane, e.g. `"15%"` or `"120px"`. A pane's `data-min` overrides it. |
| `max` | `max` | `String` | — | Instance-wide maximum per pane. A pane's `data-max` overrides it. |
| `collapsible` | `collapsible` | `Boolean` | `false` | Instance-wide default: panes can be dragged/snapped fully closed. A pane's `data-collapsible="false"` opts it out; any other `data-collapsible` value opts it in regardless of this default. |
| `collapsedSize` | `collapsed-size` | `Number` (px) | `0` | Instance-wide size a collapsed pane keeps (e.g. an icon rail). A pane's `data-collapsed-size` overrides it. |
| `gutterSize` | `gutter-size` | `Number` (px) | — (CSS default `8`) | Sets the `--o-split-gutter` custom property when provided. |
| `snap` | `snap` | `Number` | `0.5` | `0`–`1`. Fraction of a pane's min-size used as the drag/keyboard threshold for snapping it fully collapsed. |
| `step` | `step` | `Number` | `2` | Keyboard resize step, in % of the split's total size (`10%` with `Shift`). |
| `persist` | `persist` | `String` | — | `localStorage` key suffix: state stored at `orion:split:<persist>` (weights, collapsed set, collapse-restore ratios). |
| `texts` | — | `Object` | — | Per-instance text overrides. |

Children: any number of panes (every child except `.o-split-gutter`, `<template>`, `<script>`, `<style>`) — nest
`<o-split>` to build grids. A `.o-split-gutter` separator (`role="separator"`, focusable) is generated
automatically between each consecutive pair of panes.

Per-pane data attributes (set on the pane element itself, not via `static props`):

| Attribute | Type | Description |
|---|---|---|
| `data-size` | number | This pane's initial weight (same unit space as `sizes`). |
| `data-min` | px or % | Overrides the instance `min` for this pane. |
| `data-max` | px or % | Overrides the instance `max` for this pane. |
| `data-collapsible` | `"false"` or present | `"false"` opts the pane out of collapsing even if `collapsible` is set on the host; any other value (including empty) opts it in even if the host doesn't set `collapsible`. |
| `data-collapsed-size` | px | Overrides the instance `collapsedSize` for this pane. |

#### Properties (read-only)

| Property | Type | Description |
|---|---|---|
| `panes` | `HTMLElement[]` | Current pane elements, in DOM order. |

#### Methods

| Method | Returns | Description |
|---|---|---|
| `getSizes()` | `number[]` | Current sizes as % of free space (a collapsed pane reports `0`). |
| `setSizes(list, { silent = false }?)` | `void` | Sets absolute weights (`list[i]` per pane; need not sum to 100). Before ready, queues into the `sizes` prop. |
| `collapse(i, { silent = false }?)` | `boolean` | Collapses pane `i` against a neighbor. `false` if already collapsed, `i` out of range, or no expandable neighbor exists. |
| `expand(i, { silent = false }?)` | `boolean` | Restores a collapsed pane `i` (to its pre-collapse ratio, or an even share). `false` if it wasn't collapsed. |
| `toggle(i)` | `boolean` | `expand(i)` if collapsed, else `collapse(i)`. |
| `isCollapsed(i)` | `boolean` | |
| `reset()` | `void` | Clears any persisted state (if `persist`) and re-derives weights from `data-size`/`sizes`/equal split. |

`{ silent: true }` suppresses `o-collapse`/`o-expand`/`o-resize`/`o-resize-end` for that call only.

#### Events

| Event | Detail | Notes |
|---|---|---|
| `o-resize` | `{ sizes, dragging }` | Fired continuously while dragging a gutter (`dragging: true`), and once more with `dragging: false` after any resize (drag release, keyboard step, `setSizes()`, `collapse()`/`expand()`, `reset()`). |
| `o-resize-end` | `{ sizes }` | Fired once when a resize operation finishes; also persists state if `persist` is set. |
| `o-collapse` | `{ index }` | Fired when pane `index` becomes collapsed (via `collapse()`, `toggle()`, a drag past the snap threshold, or `Enter`/double-click on an adjacent gutter). |
| `o-expand` | `{ index }` | Fired when pane `index` becomes expanded again. |

None of `<o-split>`'s events are cancelable.

### `<o-split-view>`

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `breakpoint` | `breakpoint` | `String` | `'md'` | Named breakpoint — `'sm'` 576, `'md'` 768, `'lg'` 992, `'xl'` 1200, `'xxl'` 1400 — or a raw pixel number as a string. Compared against the host's **own** `getBoundingClientRect().width` (container-relative, not viewport). |
| `listWidth` | `list-width` | `String` | — | CSS length for the list pane's width in the wide (non-compact) layout (sets `--o-split-view-list`). |
| `hash` | `hash` | `String` | — | Hash key: `"#<hash>=<id>"`. Syncs selection with the URL; in compact mode, entering detail pushes a history entry so the browser Back button returns to the list. |
| `label` | `label` | `String` | — | Sets `aria-label` on the host. |
| `selected` | `selected` | `String` | — | Current selection id. **Note:** assigning this prop directly only visually marks the matching list item (`aria-current`/`.is-active`) — it does not show the detail pane, emit `o-select`, or touch the hash. Use `select(id)` for the full flow. |
| `items` | `items` | `String` | `'[data-o-item]'` | Selector (searched within the list slot) for clickable list entries. Each match's identity is its `data-o-item` attribute value, falling back to its `id`. |
| `texts` | — | `Object` | — | Per-instance text overrides. |

Children: `<div slot="list">` / `<div slot="detail">`, or — without `slot` attributes — the first two non-`<template>`/`<script>`/`<style>` children, in order.

#### Properties (read-only)

| Property | Type | Description |
|---|---|---|
| `compact` | `boolean` | `true` when the host's own width is below `breakpoint`. |
| `selectedItem` | `Element \| null` | The list element matching `selected`. |
| `view` | `'list' \| 'detail'` | Plain instance property (not attribute-reflected) — current visible pane in compact mode. Set only via the methods below. |

#### Methods

| Method | Returns | Description |
|---|---|---|
| `select(id, { user = false, fromHash = false }?)` | `boolean` | Marks `id` current and shows the detail pane. `false` if `id` is `null` or `o-select` is vetoed. |
| `showDetail(id?, { push = false, focus = true }?)` | `void` | With `id`, delegates to `select(id)`. Without it, just switches to the `'detail'` view for the already-selected item. |
| `showList({ focus = true }?)` | `void` | Switches to the `'list'` view. |
| `clear()` | `void` | Deselects, clears the hash entry (if `hash`), and returns to the list. |

#### Events

| Event | Detail | Notes |
|---|---|---|
| `o-select` | `{ id, item }` | **Cancelable.** Fired by `select()` before marking the item / showing the detail. `item` is the matched list element, or `null`. |
| `o-view` | `{ view, compact }` | Fired whenever the compact/wide breakpoint crosses, or the visible `view` changes. |

## Notes

* Storage key for `<o-split>`: `orion:split:<persist>` — `{ g: weights[], c: collapsedIndexes[], r: collapseRatios }`.
* `<o-split-view>` has no persistence prop; only the selection (via `hash`) is URL-synced.
