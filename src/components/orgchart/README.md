# orgchart

`<o-orgchart>` — a tidy-tree organization chart built from a flat list of people (`{ id, parentId, ... }`). Layout,
pan/zoom/fit, SVG export and PNG rasterisation all reuse the shared [`diagram`](../diagram/README.md) kit
(`Orion.diagram.Viewport`, `.layout.tree`, `.bounds`, `.exportSVG`, `.svgToPNG`) — it declares `// @deps diagram`
and does not define any `Orion.diagram.*` export itself. It does not use `<o-diagram>`/`<o-workflow>` or their CSS.

## Files

| File | Contents |
|---|---|
| `00-orgchart.js` | i18n strings, the private icon fallback (`ocIcon`), the rounded-elbow connector path builder (`ocElbow`/`ocLink`), and flat-node normalisation (`ocNorm`). |
| `10-element.js` | `<o-orgchart>` (`OOrgChart`) — the whole element: model, tidy-tree layout, rendering, pointer interaction (click, drag-to-reassign), keyboard tree navigation, fuzzy search, export. |
| `orgchart.css` | `.o-org-*` — canvas, cards, connectors, collapse toggle, search box, zoom bar, export menu, narrow-width layout. |

## Public API

| Export | Kind | Description |
|---|---|---|
| `<o-orgchart>` | element | Organization chart from a flat list of people. |
| `Orion.OrgChart` | class | `OOrgChart`, for `instanceof` checks / manual construction. |

`orgchart` reuses `Orion.diagram.*` (see the diagram package) but does not add anything to it — the earlier
concern that `Orion.diagram` was assigned by both `diagram` and `orgchart` does not hold today: only
`src/components/diagram/05-kit.js` assigns `O.diagram = Object.assign(O.diagram || {}, {...})`; `orgchart` (and
`graph`) only *read* `O.diagram.Viewport` / `.layout.tree` / `.bounds` / `.exportSVG` / `.svgToPNG` /
`.resolveColor` at runtime, inside methods (never at file-load time), which is what `// @deps diagram` is for. This
folder assigns exactly one export: `Orion.OrgChart`. `node build/audit.mjs` confirms there are no `Orion.*` API
collisions anywhere in the project.

### `nodes` — input shape

```js
el.nodes = [
  { id, parentId, name, title, department, avatar, email, badge, color, data },
  // parentId: null/omitted for a root. Unknown ids are treated as roots. A cycle (a node listing
  // a descendant as its own ancestor) is broken by dropping that node's parentId when found.
];
```
Duplicate ids are suffixed (`id_<index>`) rather than dropped, so nothing silently disappears from a bad feed.

## Props / attributes

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `nodes` | — (property only) | Array | `[]` | The flat people list (see shape above). |
| `direction` | `direction` (reflects) | String | `'TB'` | `'TB' \| 'BT' \| 'LR' \| 'RL'`. |
| `compact` | `compact` (reflects) | Boolean | `false` | Smaller cards (name + department only), tighter spacing. |
| `collapsible` | `collapsible` | Boolean | `true` | Shows the +/− toggle on cards that have reports. |
| `searchable` | attribute **`search`** | Boolean | `false` | Shows the search box. **The property is `searchable`, not `search`** — `search(query)` is a public method (see below); a same-named prop would silently replace it the first time the attribute is set (ARCHITECTURE.md §5.2). The HTML attribute is still the natural `<o-orgchart search>`. |
| `draggable` | `draggable` | Boolean | `false` | Enables drag-to-reassign (drag a card onto a new manager). This intentionally shadows `HTMLElement.draggable` (native HTML5 drag-and-drop) for this element — `<o-orgchart>` does not use native DnD. |
| `toolbar` | `toolbar` | Boolean | `true` | Top bar (search box + export/expand-all/collapse-all menu). |
| `minZoom` / `maxZoom` | `min-zoom` / `max-zoom` | Number | `0.1` / `3` | Zoom limits. |
| `autoFit` | `auto-fit` | Boolean | `true` | Fit the content when `nodes` is (re)loaded. |
| `renderNode` | — (property only) | Function | — | `(node) => html-string \| Element` to fully replace the default card body (accent bar, avatar, name/title/department, badge, report count). String results are sanitized. |
| `label` | `label` | String | — | Accessible name; also the export title and default file name. |
| `texts` | — (property only) | Object | — | Per-instance string overrides (`orgchart.*` keys). |

## Methods

| Method | Description |
|---|---|
| `expand(id)` / `collapse(id)` / `toggle(id)` / `isExpanded(id)` | Per-node collapse state. |
| `expandAll()` / `collapseAll()` | Bulk collapse state. |
| `select(id \| null)` / `getSelection()` | Selection (single). |
| `search(query)` | Fuzzy-searches name/title/department, highlights matches, dims non-matches, and returns the match array (`{ id, name, ... }[]`, up to 8). Also fires `o-search`. |
| `focusPerson(id, {select, animate})` | Expands every ancestor as needed, centers and selects the node. |
| `reassign(id, newParentId)` | Programmatic re-parent (validated: no self/descendant cycles). Fires cancelable `o-reassign`. |
| `getValue()` / `getNodes()` | A deep copy of the current flat list (layout fields stripped). |
| `getNode(id)` / `getChildren(id)` / `getAncestors(id)` | Read helpers. |
| `fit(opts)` / `zoomTo(k \| 'fit')` / `zoom` (getter) | View control. |
| `exportSVG(opts)` / `exportPNG(opts)` / `download(format, name)` | Export (`'svg' \| 'png'`). |

## Events

All bubble & are composed; `o-reassign` is cancelable.

| Event | Detail |
|---|---|
| `o-node-click` | `{ node, originalEvent }` |
| `o-select` | `{ node }` |
| `o-toggle` | `{ id, expanded }` |
| `o-search` | `{ query, matches }` |
| `o-reassign` | `{ id, from, to, node }` — cancelable, before a drag-to-reassign (or `reassign()` call) is applied. |
| `o-change` | `{ nodes }` — after a reassignment is committed. |
| `o-viewport` | `{ x, y, zoom }` — does not bubble. |

## Keyboard & accessibility

Cards are a `role="tree"` / `role="treeitem"` structure with roving `tabindex` (root card is the initial stop),
`aria-expanded` on cards with reports, `aria-selected`, and a live `aria-label` summary on the canvas region.

| Keys | Action |
|---|---|
| Arrow Up/Down (TB/BT) or Left/Right (LR/RL) | Move focus to manager / first direct report. |
| Arrow Left/Right (TB/BT) or Up/Down (LR/RL) | Move focus to previous / next sibling. |
| Space | Toggle collapse of the focused card (if `collapsible` and it has reports). |
| Enter | Fire `o-node-click` for the focused card. |
| Ctrl/⌘+F | Focus the search box (when `searchable`). |
| Enter (in the search box) | Jump to (and select) the first match. |
| Esc (in the search box) | Clear the search. |
| + · − · 0 · 1 | Zoom in · zoom out · 100% · zoom to fit. |
| Drag, wheel / pinch | Pan / zoom (pointer only). |

## Limitations

* Drag-to-reassign is pointer-only; there is no keyboard equivalent (use `reassign(id, newParentId)` from script).
* `renderNode` string results go through `sanitize()`; script tags and event-handler attributes are stripped as
  usual (see ARCHITECTURE.md §5.5) — build interactive card content by returning a DOM `Element` instead.
* No built-in persistence; `nodes` is a plain in-memory array (round-trip via `getValue()`/re-assigning `nodes`).
* No multi-select — `select()`/`getSelection()` track a single focused/selected person.
