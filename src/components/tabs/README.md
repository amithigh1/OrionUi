# tabs

WAI-ARIA tabs. `<o-tabs>` builds a tablist either from `<o-tab-panel>` children ("generated" mode) or from
existing markup already inside it (a `.o-nav`/`[role=tablist]` element plus separate panes, "explicit" mode).
`toggle.js` separately implements the same tab-switching behavior for **plain markup** with no custom element
(`data-o-toggle="tab"`, Bootstrap-style). `kit.js` exposes a small internal-but-documented toolkit
(`Orion.Tabs.kit`) of menu / context-menu / drag-reorder / deep-link helpers shared by `<o-tabs>` and reused
by the [workspace](../workspace/README.md) and dock packages.

## Elements

### `<o-tabs>`

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `variant` | `variant` | `String` | `'line'` (reflects) | `'line' \| 'pills' \| 'boxed' \| 'enclosed'`. Generated mode only — ignored for layout in explicit mode (host still gets the `is-<variant>` class). |
| `orientation` | `orientation` | `String` | `'horizontal'` (reflects) | `'horizontal' \| 'vertical'`. A vertical `<o-tabs>` narrower than ~520px auto-switches to a horizontal "stacked" layout (`is-stacked`) until it's wide enough again. |
| `selected` | `selected` | `Any` (id `string` or index `number`) | — | Initial/active tab. Read `selectedId` / `selectedIndex` for the current value; assigning after ready calls `select()` internally. |
| `label` | `label` | `String` | — | `aria-label` for the generated tablist. No effect in explicit mode (the markup owns its own label). |
| `lazy` | `lazy` | `Boolean` | `false` | Panel content (`<template>` child, `renderer`, or `add({ html })`) is inserted on first show instead of eagerly. |
| `keepAlive` | `keep-alive` | `Boolean` | `false` | With `lazy`, keeps the inserted content in the DOM after the tab is deactivated instead of removing it (so it re-renders fresh next time). |
| `hash` | `hash` | `String` | — | Hash key for deep-linking: `"#<hash>=<id>"`. Selecting a tab updates the URL hash; `hashchange` re-selects. Checked before `query`/`persist`/`selected` on first sync. |
| `query` | `query` | `String` | — | Query-string key for deep-linking: `"?<query>=<id>"`. Checked after `hash`, before `persist`/`selected`. |
| `persist` | `persist` | `String` | — | `localStorage` key suffix: state is stored at `orion:tabs:<persist>`. Checked after `hash`/`query`, before `selected`. |
| `closable` | `closable` | `Boolean` | `false` | Show a close button on every tab. A panel's own `closable` attribute (generated mode) or `data-closable` (explicit mode) overrides this per-tab. |
| `addable` | `addable` | `Boolean` | `false` | Show a trailing "+" button. Generated mode only; clicking it only emits `o-tab-add` — you must call `add()` yourself. |
| `reorderable` | `reorderable` | `Boolean` | `false` | Enables pointer drag-to-reorder (long-press on touch) and `Alt+ArrowLeft/Right` (or `Alt+Up/Down` when vertical) on the focused tab. Generated mode only. |
| `fill` | `fill` | `Boolean` | `false` | Tabs stretch to fill the available width (`o-nav-fill`). |
| `overflow` | `overflow` | `String` | `'scroll'` | `'scroll'` (prev/next scroll buttons) \| `'menu'` (a single "more" overflow menu). Generated mode only. |
| `activation` | `activation` | `String` | `'auto'` | `'auto'` (arrow keys/typeahead activate immediately) \| `'manual'` (arrow keys move focus only; Enter/Space or click activates). |
| `texts` | — | `Object` | — | Per-instance text overrides (`t()`, ARCHITECTURE.md §5.11). |

Children in generated mode: any number of `<o-tab-panel>`. Explicit mode is detected automatically — if `<o-tabs>`
contains an element matching `[role=tablist], .o-nav` (that isn't inside an `<o-tab-panel>`), that element and its
tab children (`[role=tab]`, `.o-nav-link`, `[data-o-target]`, `a[href^="#"]`) are used as-is, and their panes are
resolved via `aria-controls` / `data-o-target` / `href`.

#### Properties (read-only)

| Property | Type | Description |
|---|---|---|
| `selectedId` | `string \| null` | Id of the active tab. |
| `selectedIndex` | `number` | Index of the active tab (`-1` if none). |

#### Methods

| Method | Returns | Description |
|---|---|---|
| `select(ref, { focus = false }?)` | `boolean` | `ref` is an id or index. `false` if the tab is unknown/disabled or `o-before-change` is vetoed. Before the element is ready, always returns `true` and queues `ref` into `selected`. |
| `add(descriptor)` | `string` (new id) | See descriptor shape below. |
| `remove(id \| index)` | `boolean` | Removes the tab and its panel with no `o-close`; selection moves to a neighbor if it was active. `false` if not found. |
| `close(id \| index)` | `boolean` | User-style close: emits cancelable `o-close`, then `remove()`. `false` if not found or vetoed. |
| `next()` | `boolean` | Selects the next non-disabled tab (wraps). |
| `prev()` | `boolean` | Selects the previous non-disabled tab (wraps). |
| `refresh()` | `void` | Re-scans the DOM and rebuilds the internal model. Rarely needed — a `MutationObserver` already does this automatically. |
| `getTabs()` | `{ id, label, index, disabled, closable }[]` | Snapshot of every tab. |

`add()` descriptor:

```ts
add({
  id?: string, label?: string, icon?: string, badge?: string,
  content?: Node | string,          // plain content
  html?: string,                    // trusted HTML, inserted as-is (or stored for later if `lazy`)
  render?: (panel: HTMLElement) => Node | string | void,
  closable?: boolean, disabled?: boolean,
  index?: number,                   // insert position (default: append)
  select?: boolean,                 // default true — activate the new tab
  focus?: boolean,                  // focus the new tab when selecting it
}) -> id: string
```

#### Events

All bubble, are composed, and (where noted) cancelable.

| Event | Detail | Notes |
|---|---|---|
| `o-before-change` | `{ id, index, previous, previousIndex }` | **Cancelable.** Fired by `select()` before the active tab changes. |
| `o-change` | `{ id, index, previous, previousIndex }` | Fired after the active tab changes. |
| `o-close` | `{ id, index, label }` | **Cancelable.** Fired by `close()` before the tab and panel are removed. |
| `o-tab-add` | `{}` | Fired when the built-in "+" button (`addable`) is clicked. Does not add anything itself — call `add()` in the handler. |
| `o-reorder` | `{ id, from, to, order }` | Fired after a drag (`reorderable`) or `Alt+Arrow` move actually changes the tab's position. `order` is the new array of tab ids. |
| `o-render` | `{ id, panel }` | Fired the first time a tab's lazy content (`<template>`, `renderer`, or `add({ html })`) is inserted into its panel. |

### `<o-tab-panel>`

Only meaningful in generated mode (a child of `<o-tabs>`).

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `label` | `label` | `String` | — | Tab label text. |
| `icon` | `icon` | `String` | — | Icon name shown on the tab. |
| `badge` | `badge` | `String` | — | Small badge rendered after the label. |
| `disabled` | `disabled` | `Boolean` (reflects) | `false` | Excludes the tab from selection and keyboard navigation. |
| `closable` | `closable` | `Boolean` (reflects) | `false` | Per-tab override of the host's `closable`. |
| `renderer` | `renderer` | `Function` | — | `(panel: HTMLElement) => Node \| string`. Alternative to a `<template>` child for lazy content; as an attribute it resolves a global function name. |

No public methods. No events of its own — content insertion fires `o-render` on the host `<o-tabs>` (see above).
If no `id` is set, one is generated (`uid('tabpanel')`); this id becomes the tab's identity for `select()`/`getTabs()`.

## Plain-markup tabs (`toggle.js`)

Bootstrap-style tabs with no custom element:

```html
<div class="o-nav o-nav-tabs" role="tablist">
  <button data-o-toggle="tab" data-o-target="#home" aria-selected="true">Home</button>
  <button data-o-toggle="tab" data-o-target="#more">More</button>
</div>
<div id="home">…</div>
<div id="more" hidden>…</div>
```

* Any element matching `[data-o-toggle="tab"]` is a trigger; its pane is resolved via `data-o-target` (or `href="#id"`) through `targetOf()`.
* Auto-initialized on `ready()` and on later DOM mutations: adds `role="tab"`/`"tablist"`, `aria-controls`/`aria-selected`/`aria-labelledby`, roving `tabindex`, and hides inactive panes (`hidden`).
* Arrow keys / Home / End move and activate focus between triggers in the same list (RTL-aware); `Alt`/`Ctrl`/`Meta` combinations are ignored.
* If a trigger is inside an `<o-tabs>` host, `tabShow()`/the `tab` action delegate to that host's `select()` instead.

| Function | Returns | Description |
|---|---|---|
| `Orion.tabShow(trigger, { focus = false }?)` | `boolean` | `trigger` is an element or selector. Activates the tab (no-op returning `true` if already active); `false` if disabled or not found. |

| Event (on the trigger) | Detail | Notes |
|---|---|---|
| `o-show` | `{ target, previous }` | **Cancelable.** Fired before the switch; `target`/`previous` are the pane elements (or `null`). |
| `o-shown` | `{ target, previous }` | Fired after the switch (and after a short fade-in animation starts). |

Action: `data-o-toggle="tab"` is registered as `action('tab', trigger => Orion.tabShow(trigger, { focus: true }))`.

## Shared kit (`Orion.Tabs.kit`)

Internal helpers, documented because [workspace](../workspace/README.md) and the dock package build their menus,
context menus and drag-reordering on top of them — useful for consumers building similar panel/tab UIs. Access via
`O.Tabs.kit` (or `OTabs.kit`) at runtime (not at file-load time — see ARCHITECTURE.md §2 on cross-component use).

| Function | Signature | Description |
|---|---|---|
| `menu` | `menu(anchor, items, opts?) -> { el: HTMLElement, close(reason?: string): void }` | Built-in popup menu. `anchor` is an `Element` (auto-placed against it) or a `{x, y}` point. `items`: `{ label, icon?, action?(item), disabled?, checked?, danger?, shortcut? }[]`, with `{ divider: true }` and `{ header: string }` entries allowed. `opts`: `{ owner?, placement?, label?, onClose?(reason) }`. |
| `contextMenu` | `contextMenu(point, items, opts?) -> same as menu()` | `point`: `{x, y}`. Delegates to `Orion.contextMenu` (another package) when present, else falls back to `menu()`. |
| `dragReorder` | `dragReorder(container, opts) -> off(): void` | Pointer-based reordering of `container`'s direct children (long-press to arm on touch). `opts`: `{ items: string (selector), axis?: 'x' \| 'y' (default 'x'), canDrag?(el, event), onStart?(el), onMove?(el, toIndex), onEnd?(el, from, to) }`. The consumer is responsible for actually moving the DOM/model in `onMove`. |
| `hashParams.get` | `get(key) -> string \| null` | Reads a `"#a=1&b=2"`-style hash param (plain `#anchor` segments are preserved). |
| `hashParams.set` | `set(key, value, push = false) -> void` | Writes/removes a hash param via `history.replaceState` (or `pushState` if `push`). |
| `queryParam.get` | `get(key) -> string \| null` | Reads a `?key=value` query param. |
| `queryParam.set` | `set(key, value) -> void` | Writes/removes a query param via `history.replaceState`. |

## Notes

* Storage key: `orion:tabs:<persist>` (the last-selected tab id, when `persist` is set).
* `<o-tabs>` has no `// @deps` of its own; `kit.js` is concatenated into the same package and is what other
  packages declare `// @deps tabs` for.
