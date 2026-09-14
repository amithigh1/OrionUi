# dashboard — `<o-dashboard>` / `<o-widget>` / `Orion.gridLayout`

A customizable analytics/dashboard grid: draggable and resizable `<o-widget>` tiles laid out with plain CSS
Grid (`grid-column` / `grid-row` — RTL mirrors for free, DOM nodes are never moved), per-breakpoint layouts,
vertical compaction, a searchable widget catalog, and layout persistence to `localStorage` (or your own
backend via `getState()`/`setState()`).

Docs: `docs/components/dashboard.html` (also documents `Orion.gridLayout`).

## Files

| File | Contents |
|---|---|
| `00-engine.js` | `Orion.gridLayout` — pure grid math over plain layout arrays: collision, compaction, move, resize, free-spot search, breakpoint derivation, validation. No DOM, no dependency on the rest of the folder. |
| `10-menu.js` | `dashMenu()` (the widget action menu, a tiny floating menu built on `overlays`/`ListNav`, no dependency on the overlays *package*) and `dashConfirm()` (inline remove confirmation drawn over a widget); `i18n.add('en', { dashboard: {...} })`. |
| `20-widget.js` | `<o-widget>` — header (drag handle, icon, title, actions menu), body, resize handles, lazy content. |
| `30-dashboard.js` | `<o-dashboard>` — breakpoints, layout computation/compaction, rendering, persistence, public API (`addWidget`, `removeWidget`, `getLayout`, …). |
| `40-interact.js` | Pointer drag & resize (mouse/pen/touch), edge auto-scroll while dragging, and the arrow-key move/resize keyboard interaction — all added to `ODashboard.prototype` via `Object.assign`. |
| `50-catalog.js` | The "Add widget" catalog side panel (search, insert at first free spot). |
| `90-define.js` | `define('o-dashboard', …)`, the `dashboard` declarative action, `Orion.dashboard()` factory. |
| `dashboard.css` | Grid, widget chrome, edit-mode guides, resize handles, maximized widget, action menu, inline confirm, catalog panel. Tokens only. |

## Usage

```html
<o-dashboard id="dash" editable persist="my-dashboard" columns="12" row-height="80" gap="16">
  <o-widget id="kpis" heading="This month" x="0" y="0" w="12" h="2" locked headerless>
    <o-stat-group></o-stat-group>
  </o-widget>
  <o-widget id="chart" heading="Revenue" x="0" y="2" w="8" h="4" collapsible refreshable removable>
    <o-chart></o-chart>
  </o-widget>
</o-dashboard>
```

```js
Orion.dashboard('#dash', { columns: 12, catalog: [...], on: { 'layout-change': e => save(e.detail.layouts) } });
dash.addWidget('kpi');                 // from the catalog, by type
dash.setLayout(savedLayout);           // apply a layout loaded from your backend
Orion.gridLayout.valid(dash.getLayout(), dash.cols);   // pure grid-math helpers, usable standalone
```

## `Orion.gridLayout`

Pure functions over plain layout-item arrays (`{ id, x, y, w, h, minW, minH, maxW, maxH, locked }`, grid
units). Every function **mutates the items it is given** — pass `clone(list)` (or `gridLayout.clone(list)`) if
you need to keep the original. This is what `<o-dashboard>` itself is built on, and it is exported so you can
reuse the same collision/compaction logic in your own layout code (e.g. server-side layout validation).

| Function | Description |
|---|---|
| `clone(list)` | Deep-ish copy (`{ ...item }` per item) so callers can mutate safely. |
| `collides(a, b)` | `true` when two items overlap (also `false` for the same id). |
| `compact(list, mode, pinId?)` | Resolve overlaps; `mode: 'vertical'` floats every unlocked item up. `pinId` anchors one more item in place for this pass (used right after a drag/resize). |
| `move(list, id, x, y, mode, cols)` | Move an item, swapping/pushing colliding neighbours, then compact. |
| `resize(list, id, w, h, mode, cols)` | Resize an item (clamped to its min/max), pushing colliding items down, then compact. |
| `freeSpot(list, w, h, cols)` | First free `{ x, y }` for a `w`×`h` item (top-to-bottom, inline-start to inline-end). |
| `derive(src, srcCols, cols, mode?)` | Scale a layout designed for `srcCols` columns to `cols` columns (used for breakpoints without an explicit override). |
| `valid(list, cols)` | `true` when no two items overlap and all are inside `[0, cols)`. |
| `bottom(list)` | Highest occupied row + 1 (used to size the grid's row count). |

## `<o-dashboard>` — properties / attributes

| Property (attribute) | Type | Default | Description |
|---|---|---|---|
| `columns` | number | 12 | Columns at the widest breakpoint. |
| `rowHeight` (`row-height`) | number | 80 | Row height in px. |
| `gap` | number | 16 | Grid gap in px, both axes. |
| `editable` | boolean | false | Enables drag, resize, the catalog and remove/duplicate. |
| `locked` | boolean | false | Freezes the layout even while `editable` (a "view only" mode). |
| `persist` | string | — | When set, the layout, added/removed widgets and collapsed state are saved to `localStorage` under `orion:dashboard:<persist>`. |
| `breakpoints` | object | auto (lg/md/sm/xs from `columns`) | `{ lg: 12, md: { cols: 8, width: 900 }, sm: 4, xs: 1 }`. |
| `compact` | `'vertical' \| 'none'` | `'vertical'` | Whether widgets float up to fill gaps left by a move/remove. |
| `float` | boolean | false | Alias for `compact="none"`. |
| `layout` | array | — | Declare widgets from data instead of markup: `[{ id, x, y, w, h, heading, type, renderer }]`. |
| `layouts` | object | — | Initial per-breakpoint layouts (merged under anything restored from `persist`). |
| `catalog` | array | — | `[{ type, title, icon, description, w, h, renderer, ...widget props }]` offered by the catalog panel / `addWidget(type)`. |
| `confirmRemove` (`confirm-remove`) | boolean \| `(widget) => Promise<boolean>` | true | Confirmation before removing a widget; pass a function for a custom dialog. |
| `label` | string | "Dashboard" | `aria-label` for the grid. |
| `widgets` *(read-only)* | array | — | Live list of current (non-removed) `<o-widget>` elements. |
| `breakpoint` / `cols` *(read-only)* | string / number | — | Name and column count of the active breakpoint. |

## `<o-dashboard>` — methods

| Method | Description |
|---|---|
| `toggleEdit(force?)` | Enter/exit edit mode; returns the new state (`false` if `locked`). |
| `getLayout(bp?)` / `getLayouts()` | Current (or a named breakpoint's) layout as `[{ id, x, y, w, h, collapsed? }]`; every breakpoint. |
| `setLayout(layout, { breakpoint, silent })` / `setLayouts(map)` | Apply a layout you computed or loaded from your backend. |
| `getState()` / `setState(state)` | Full persisted shape (`{ v, layouts, removed, added, collapsed }`) — use instead of `persist` to save to your own backend. |
| `save()` / `reset()` | Write to `localStorage` now (normally debounced 120ms); forget all user changes and reload the original layout. |
| `compactLayout()` | Re-run vertical compaction over the current layout. |
| `addWidget(type \| spec, opts?)` | Add a catalog widget (by `type`) or an ad-hoc spec; returns the new `<o-widget>`. `opts`: `{ id, x, y, w, h, heading, focus }`. |
| `duplicateWidget(id)` | For widgets with a `type` or `renderer`. |
| `removeWidget(id, { confirm })` | Resolves `false` if the user cancels the confirmation. |
| `getWidget(id)` / `refreshAll()` | Look up a widget by id; call `refresh()` on every widget. |
| `openCatalog(trigger?)` / `closeCatalog()` / `catalogOpen` | Control the "Add widget" panel. |

## `<o-dashboard>` — events

All bubble, are composed and `o-`-prefixed on the DOM.

| Event | Detail | Description |
|---|---|---|
| `layout-change` | `{ reason, id?, breakpoint, layout, layouts }` | `reason`: move, resize, add, remove, collapse, compact, reset or api. |
| `edit-change` | `{ editable }` | Edit mode toggled. |
| `breakpoint-change` | `{ breakpoint, previous, columns }` | The active breakpoint changed (container resize). |
| `drag-start` / `drag-end` | `{ id, widget }` / `{ id, widget, changed, cancelled }` | A pointer or keyboard move. |
| `resize-start` / `resize-end` | same shape | A pointer or keyboard resize. |
| `before-widget-add` / `widget-add` | `{ item }` / `{ id, widget }` | Cancelable before / after a widget is added. |
| `before-widget-remove` / `widget-remove` | `{ id, widget }` | Cancelable before / after a widget is removed. |
| `catalog-open` / `catalog-close` / `catalog-select` | — / — / `{ type, widget }` | The catalog panel. |

## `<o-widget>` — properties / attributes

| Property (attribute) | Type | Default | Description |
|---|---|---|---|
| `heading`, `subtitle`, `icon` | string | — | Header content. |
| `type` | string | — | Matches a `catalog` entry; enables `duplicateWidget()` and re-adding after removal via the catalog. |
| `x`, `y`, `w`, `h` | number | auto / 3 / 2 | Initial grid position/size at the base (widest) breakpoint; omit `x`/`y` to auto-place. |
| `minW`, `minH`, `maxW`, `maxH` | number | — | Resize constraints, in grid units. |
| `collapsible`, `removable`, `refreshable`, `fullscreen`, `settings` | boolean | false | Which actions appear in the header menu. |
| `headerless` | boolean | false | A small floating toolbar instead of a full header row (shown on hover/focus, or while editing). |
| `flushed` (attribute `flush`) | boolean | false | No padding on the body — for a table/chart that should fill the tile. Named `flushed` because `flush` is a reserved `OElement` method. |
| `locked` | boolean | false | Can't be moved, resized or removed. |
| `collapsed` | boolean | false | Shows only the header. |
| `loading` | boolean | false | Sets `aria-busy` and a header spinner. |
| `lazy` | boolean | true | Defer rendering `renderer`/the `<template>` child until the widget scrolls into view. |
| `renderer` | `(body, widget) => Node \| string \| Promise` | — | Lazy content; a returned promise shows the loading state until it resolves. |
| `data` | any | — | Free-form payload for your own `renderer`/catalog logic. |
| `dashboard` *(read-only)* | `<o-dashboard> \| null` | — | The owning dashboard. |

## `<o-widget>` — methods & events

| Member | Description |
|---|---|
| `refresh()` | Fires `widget-refresh` (call `detail.waitUntil(promise)` to show the loading state) and re-runs `renderer`. |
| `toggleCollapse(force?)` / `maximize(force?)` | Programmatic collapse / full-screen. |
| `runAction(id)` | Run a header-menu action by id: `refresh`, `fullscreen`, `collapse`, `settings`, `duplicate`, `remove`. |
| `widget-refresh` | `{ id, widget, waitUntil }` |
| `widget-collapse` (and cancelable `before-widget-collapse`) | `{ id, collapsed }` |
| `widget-fullscreen` | `{ id, fullscreen }` |
| `widget-settings` | `{ id, widget }` — wire up your own settings panel. |
| `widget-resize` | `{ id, w, h, width, height, live }` — fired on resize-drag (`live: true`) and once more when it settles. |
| `widget-visible` | `{ id }` — the first time lazy content renders. |

## `Orion.dashboard()` & the `dashboard` action

`Orion.dashboard(el, options) -> <o-dashboard>` creates (or configures) a dashboard from any prop plus
`on: { 'layout-change': fn, ... }` (`o-` prefix optional).

`<button data-o-action="dashboard" data-o-value="edit|catalog|reset|save|compact" data-o-target="#dash">` wires
toolbar buttons with no JS.

## Keyboard & accessibility

| Key | Action |
|---|---|
| Tab | Focus the next widget (edit mode) or its controls. |
| Arrow keys | A focused widget: move by one column/row (respects RTL). |
| Shift + Arrow keys | Resize the focused widget by one column/row. |
| Delete / Backspace | Remove the focused widget (with confirmation, unless `confirm-remove="false"`). |
| Escape | Cancel an in-progress pointer/keyboard move or resize; exit a maximized widget. |
| ↓ / ↑ on the menu button | Open the widget's action menu. |

Every move/resize/collapse is announced (`Orion.announce`). The grid is `role="region"`; each widget is
`role="region"` labelled by its heading; the action menu is `role="menu"`. Drag/resize is available from mouse,
pen and touch pointers (`touch-action: none` on the handle/resize grips); the whole interaction can be
cancelled mid-gesture with Escape.

## Limitations

* Widgets resize only from the inline-end edge, block-end edge and end-end corner (`e`/`s`/`se`) — there is no
  start-edge or top-edge resize handle.
* `groupBy`-free: the grid has no concept of sections/groups; use a `headerless` locked widget spanning full
  width as a section header if you need visual separation.
* `layout`/`layouts` describe the **base** (widest) breakpoint; narrower breakpoints without an explicit
  `layouts[bp]` entry are *derived* (`gridLayout.derive`) by scaling column/width proportionally, which can
  differ from a hand-tuned layout — provide an explicit `layouts.sm`/`.xs` array if you need exact control.
* `getState()`/`setState()` (or `persist`) only remember layouts, added/removed widget ids and collapsed
  state — not each widget's own data (e.g. `renderer`/`data`); re-hydrate that yourself from `added` entries.
* A single non-`<template>` element child becomes the widget body **in place** (never cloned/moved) so
  framework-mounted content survives; several children are wrapped in a fresh `.o-widget-body` div instead.
