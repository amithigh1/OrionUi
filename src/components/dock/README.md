# dock

IDE-style dockable panels: four regions (`start`, `center`, `end`, `bottom`), each a tab group built on
[`<o-split>`](../split/README.md) with resizable gutters, a minimize-to-rail state, floating windows, drag-and-drop
between regions, a per-region "Panel menu" (keyboard/menu alternative to dragging), layout persistence and a
responsive fallback that collapses every open panel into one tab strip below ~600px.

## Elements

### `<o-dock>`

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `layoutKey` | `layout-key` | `String` | — | Persistence key. When set, the layout (panel placement, order, closed/floating state, region sizes, minimized/maximized region) is saved to `localStorage` under `orion:dock:<layoutKey>` and restored on the next load. Omit to disable persistence. |
| `label` | `label` | `String` | — | Accessible label for the dock landmark; falls back to the localized "Panels". |
| `texts` | — | `Object` | — | Per-instance text overrides (see `t()` in ARCHITECTURE.md §5.11). |

Children: any number of `<o-dock-panel>`. Below ~600px wide the dock switches to a single stacked tab strip
listing every open panel (region, minimize, maximize and drag-to-move are unavailable in that mode; use the
panel menu's Close instead).

#### Methods

| Method | Description |
|---|---|
| `getLayout()` | Returns a JSON-serializable snapshot: `{ panels: [{id, region, order, closed}], outerSizes, colSizes, minimized: string[], maxRegion, floats: [{id, region, x, y, w, h}] }`. |
| `setLayout(layout)` | Applies a snapshot returned by `getLayout()`. |
| `reset()` | Discards the persisted layout (if any) and rebuilds purely from the declared `<o-dock-panel>` markup. |
| `movePanel(id, region, index?)` | Docks a panel into `'start'\|'center'\|'end'\|'bottom'`, optionally at a specific position in the dock's internal order. |
| `float(id, {x, y, w, h}?)` | Detaches a panel into a draggable/resizable floating window (position/size default to centered, clamped to the viewport). |
| `dockBack(id)` | Returns a floating panel to the region it was last docked in. |
| `minimize(region)` / `expand(region)` / `toggleMinimize(region)` | Collapse/restore a region (`start`, `end` or `bottom`) to its icon rail. Not available for `center`. |
| `maximize(region)` / `restore()` / `toggleMaximize(region)` | Hide every other region so `region` fills the dock; `restore()` (or `maximize(null)`) undoes it. |
| `close(id)` | Hides a panel (fires cancelable `o-close`); it stays listed (unchecked) in the Panels menu. |
| `open(id)` | Restores a panel closed with `close()`. |
| `getPanels()` | `[{id, title, icon, region, closed, floating, active}]` for every registered panel. |
| `openPanelsMenu(anchor?)` | Opens the "Panels" checklist menu (toggles each panel open/closed); anchored at `anchor` or the dock itself. |

#### Events

All bubble, are composed, and (where noted) cancelable.

| Event | Detail | Notes |
|---|---|---|
| `o-layout-change` | `{ layout }` | Fired after any structural change (move, float/dock, minimize/maximize, close/open, or a manual gutter drag). Same shape as `getLayout()`. |
| `o-close` | `{ id }` | **Cancelable.** Fired before a panel is closed (via the tab's close button, Delete, the panel menu, or the Panels menu); call `event.preventDefault()` to veto (e.g. unsaved changes). |
| `o-panel-move` | `{ id, from, to }` | Fired after a panel is docked into a different region (drag or `movePanel()`). |

### `<o-dock-panel>`

A panel's own element hosts its content (light DOM) and doubles as the ARIA `tabpanel`.

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `title` | `title` | `String` | — | Tab label (also the native tooltip). |
| `icon` | `icon` | `String` | — | Icon name shown on the tab and in the minimize rail. |
| `badge` | `badge` | `String` | — | Small badge rendered after the label. |
| `region` | `region` | `String` | `'center'` | Initial region: `'start'\|'center'\|'end'\|'bottom'`. Only read once, at first sync — move panels afterwards with `movePanel()` or by dragging. |
| `size` | `size` | `Number` | — | Desired initial weight (%) of the panel's *region* (the largest declared `size` among a region's panels seeds that region's starting split weight). |
| `closable` | `closable` | `Boolean` | `true` | Whether the tab shows a close button / accepts Delete / offers "Close" in its menu. |

Children are the panel's body content, read once and left in place (a `MutationObserver` is not required — frameworks
may append children after the element upgrades, per ARCHITECTURE.md §10).

## Interaction

* **Drag**: press and drag a tab — drop it on another region's tab strip (or an edge zone of the dock) to dock it
  there with a highlighted drop indicator; drop it *outside* the dock entirely to float it near the cursor; drop it
  back inside its own region's tab strip to reorder.
* **Keyboard**: arrow keys / Home / End move focus between tabs in a region (`Left`/`Right` follow RTL); `Delete`
  closes the focused tab; `Shift+F10` or the `ContextMenu` key (or the region's kebab button) opens the **panel
  menu**: Move to…, Float, Minimize/Expand, Maximize/Restore, Close, and Panels….
* **Rail**: minimizing a region (its kebab menu, or double-clicking/dragging its gutter fully closed — regions are
  `data-collapsible`) replaces its tab strip with a narrow icon rail; click an icon to expand the region and select
  that panel.
* **Floating window**: drag the title bar to move it (clamped to the viewport) and the bottom-corner handle to
  resize it (min 260×160); the dock icon in its title bar redocks it where it came from.

## CSS

Custom properties on `<o-dock>`: `--o-dock-rail` (rail thickness, default `2.5rem`), `--o-dock-tab-h` (tab strip
height, default `2.25rem`). `<o-dock>` needs a height from its container (a flex/grid cell, or an explicit
`height`/`block-size`).

## Notes

* Declares `// @deps split, tabs` — building with `--only=dock` alone still pulls in `split` (the region splitters)
  and `tabs` (the shared `OTabs.kit.menu()` used for the panel/Panels menus).
* Only one region can be maximized at a time; maximizing is a pure visual override (it does not touch split sizes
  or minimized state) and always restores every other region to its normal (non-minimized) size.
