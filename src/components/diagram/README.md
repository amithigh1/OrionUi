# diagram

Infinite-canvas diagram editor / viewer (`<o-diagram>`) and a workflow/approval-process designer built on top of
it (`<o-workflow>`). Everything is hand-written SVG: a shape registry, orthogonal edge routing that avoids node
boxes (A* over a sparse visibility grid, with cheap pattern routes tried first), two auto-layout algorithms
(Sugiyama layered, Reingold–Tilford tidy tree), pan/zoom/pinch, undo/redo, and SVG/PNG/JSON export. No
dependencies. `05-kit.js` (viewport, export, text measurement) is also the shared kit consumed by
[`orgchart`](../orgchart/README.md) and [`graph`](../graph/README.md) via `// @deps diagram`.

## Files

| File | Contents |
|---|---|
| `00-model.js` | i18n strings, id generation, port-side constants, the shape registry (`dgShape`/`DG_SHAPES`), style presets (`DG_PRESETS`), node/edge normalisation (`dgNormNode`/`dgNormEdge`/`dgNormValue`), undo/redo history (`DgHistory`), the `dgMixin` helper and the private icon set. |
| `05-kit.js` | `DgViewport` (pan/zoom/pinch/wheel/fit), text measurement + word wrap (`dgWrap`/`dgTextWidth`), SVG export (`dgExportSVG`, computed-style inlining) and PNG rasterisation (`dgSvgToPNG`). Published as `Orion.diagram.*` — this is the file other packages depend on. |
| `10-geometry.js` | Built-in shape paths (`rect`, `rounded`, `ellipse`, `circle`, `diamond`, …), label boxes, port position/auto-selection (`dgPorts`/`dgBestPorts`), boundary-ray clipping (`dgBoundary`) and polyline helpers (length, point-at-t, project, simplify, rounded-corner path, bezier sampling). |
| `20-render.js` | `DgRender` mixin: builds the SVG stage skeleton, keyed node/edge rendering, the selection/handles/ports/guides/marquee/ghost-edge overlay, the minimap and the screen-reader shape/edge list. |
| `30-interact.js` | `DgInteract` mixin: one pointer state machine (pan, marquee, move with alignment guides + snap, resize, connect, reconnect, label drag) for mouse/pen/touch, wheel zoom, keyboard shortcuts, inline label editing, minimap drag. |
| `40-routing.js` | `DgRouter` / `DgHeap` — orthogonal edge routing: stub off each port, try cheap pattern routes (straight/L/Z/U) against a spatial-hash obstacle index, fall back to A* over a sparse visibility grid, then the least-bad pattern. Published as `Orion.diagram.Router`. |
| `50-layout.js` | Pure layout functions: `dgLayered` (Sugiyama — cycle breaking, longest-path ranking, dummy nodes, barycenter crossing reduction + transpose, isotonic-regression coordinate assignment), `dgTidy` (contour-based tidy tree, variable sizes, optional stacked leaf columns), `dgTreeLayout` (BFS spanning forest of a graph, laid out with `dgTidy`). Published as `Orion.diagram.layout`. |
| `60-panels.js` | `DgPanels` mixin: toolbar, shape palette (pointer drag onto the canvas or Enter to add), properties inspector, context/dropdown menus and the keyboard "Connect to…" / "Disconnect from…" picker. |
| `90-element.js` | `<o-diagram>` (`ODiagram`) — combines the mixins above into the public element: model CRUD, selection, clipboard, history, view control, auto layout, export. |
| `95-workflow.js` | `<o-workflow>` (`OWorkflow`, extends `ODiagram`) — typed node palette with named ports, schema-driven per-node config panel, structural validation, vertical auto layout, a token "simulate" mode. |
| `diagram.css` | `.o-dg-*` — canvas, shapes, edges, overlay, toolbar, palette, properties panel, menus, minimap, zoom bar, narrow-width layout. |
| `95-workflow.css` | `.o-wf-*`, all scoped under `.o-workflow` — node cards, port labels, error badges, the simulate token, the schema-driven config panel. Never touches `.o-diagram` so a plain `<o-diagram>` elsewhere on the page is unaffected. |

## Public API

| Export | Kind | Description |
|---|---|---|
| `<o-diagram>` | element | Diagram builder / flowchart editor / read-only viewer. |
| `<o-workflow>` | element (extends `<o-diagram>`) | Workflow / approval-process designer: typed nodes, validation, simulate. |
| `Orion.Diagram` | class | `ODiagram`, for `instanceof` checks / manual construction. |
| `Orion.Workflow` | class | `OWorkflow`. |
| `Orion.diagram.Viewport` | class | `new Orion.diagram.Viewport(hostEl, opts)` — reusable pan/zoom/pinch/fit controller (also used standalone by `orgchart`/`graph`). |
| `Orion.diagram.Router` | class | `new Orion.diagram.Router(opts)` — the obstacle-avoiding orthogonal router. |
| `Orion.diagram.layout` | object | `{ layered(nodes, edges, opts), tree(nodes, edges, opts), tidy(roots, opts) }` — usable without a diagram element. |
| `Orion.diagram.shapes` | object | `{ register(name, def), get(name), list() }` — the global shape registry (`<o-workflow>` registers its own card shapes here as `wf-*`, separately from the model-layer `DG_SHAPES` used by `<o-diagram>`). |
| `Orion.diagram.exportSVG(layers, bounds, opts)` | function | Standalone SVG markup from live SVG layers, computed styles inlined. |
| `Orion.diagram.svgToPNG(markup, opts)` | function | `Promise<Blob>` — rasterises SVG markup. |
| `Orion.diagram.wrapText(text, maxW, font, maxLines)` | function | Cached canvas-based word wrap. |
| `Orion.diagram.textWidth(text, font)` | function | Cached canvas text measurement. |
| `Orion.diagram.resolveColor(scope, value)` | function | Resolves any CSS color expression (tokens, `color-mix`) to `rgb()`. |
| `Orion.diagram.bounds(items)` | function | Bounding box of `[{x,y,width\|w,height\|h}]`. |
| `Orion.diagram.presets` | object | Named style presets (`default primary success warning danger info secondary dark`) used by the properties panel swatches and available for scripting. |
| `Orion.workflow.types` | array | The 11 built-in workflow node type names (`wf-start` … `wf-end`). |
| `Orion.workflow.shapes` | object | The `Orion.diagram.shapes`-format definitions for those types (also registered globally under the same names). |
| `Orion.workflow.ports` | object | Named-port layout per workflow node type. |

### `<o-diagram>` — value shape

```js
{
  nodes: [{ id, type, x, y, width, height, label,
            style: { fill, stroke, textColor, fontSize, dashed, bold, strokeWidth, align },
            ports: [{ id, side: 'top'|'right'|'bottom'|'left', offset: 0..1, label, kind: 'in'|'out'|'both', max }],
            group, locked, image, html, data }],
  edges: [{ id, from, fromPort, to, toPort, label, labelPos, type: 'orthogonal'|'straight'|'curve',
            arrow: 'end'|'both'|'start'|'none', dashed, animated, style: { stroke, width }, data }],
}
```

Built-in shape types: `rect rounded terminator ellipse circle diamond parallelogram hexagon cylinder document note
text image html`. Register more with `Orion.diagram.shapes.register(name, { size, path(w,h,node), text?(w,h),
ports?(w,h), extra?(w,h), render?(node,g,ctx), boundary?: 'ellipse'|'diamond', ratio? })`.

### `<o-diagram>` — props / attributes

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` (JSON) | Object | `{nodes:[],edges:[]}` | The diagram. Reading returns a fresh deep copy. Also accepted as a child `<script type="application/json">`. |
| `grid` | `grid` | Number | `20` | Grid size in px; `0` hides the grid. |
| `snap` | `snap` | Boolean | `false` | Snap moves/resizes/palette-drops to the grid. |
| `guides` | `guides` | Boolean | `true` | Smart alignment guides while dragging. |
| `minimap` | `minimap` | Boolean | `false` | Minimap with a draggable viewport rectangle. |
| `readonly` | `readonly` (reflects) | Boolean | `false` | Viewer mode: select/pan/zoom/click only. |
| `palette` | `palette` | Boolean \| Array | — | Shape palette. Array items: type names or `{ type, label, width, height, style, icon }`. |
| `properties` | `properties` | Boolean | `false` | Properties inspector for the current selection. |
| `toolbar` | `toolbar` | Boolean | `false` | Toolbar (undo/redo, arrange, layout, export). |
| `edgeType` | `edge-type` | String | `'orthogonal'` | Default `type` for new connections. |
| `arrow` | `arrow` | String | `'end'` | Default `arrow` for new connections. |
| `wheel` | `wheel` | `'zoom'` \| `'pan'` | `'zoom'` | Wheel zooms, or pans (Ctrl/⌘+wheel zooms). |
| `minZoom` / `maxZoom` | `min-zoom` / `max-zoom` | Number | `0.1` / `3` | Zoom limits. |
| `autoFit` | `auto-fit` | Boolean | `true` | Fit the content whenever a new `value` is loaded. |
| `createOnDblclick` | `create-on-dblclick` | Boolean | `true` | Double-click on empty canvas creates a shape. |
| `panOnDrag` | `pan-on-drag` | Boolean | `false` | Dragging empty canvas pans instead of drawing a marquee. |
| `cornerRadius` | `corner-radius` | Number | `8` | Radius of orthogonal-edge corners. |
| `canConnect` | — (property only) | Function | — | `(from, to, { fromPort, toPort, edge }) => boolean` connection rule. |
| `renderNode` | — (property only) | Function | — | `(node) => html \| Element` for `type: 'html'` nodes. |
| `shapes` | — (property only) | Object | — | Per-instance custom/override shapes (same shape as `register`). |
| `label` | `label` | String | — | Accessible name; also the export title and default file name. |
| `texts` | — (property only) | Object | — | Per-instance string overrides (`diagram.*` keys, see ARCHITECTURE.md §5.11). |

### `<o-diagram>` — methods

`getValue()` / `setValue(v, {history})` · `import(v)` (undoable) · `getNode(id)` / `getEdge(id)` / `getNodes()` /
`getEdges()` · `addNode(node)` / `updateNode(id, patch)` / `removeNode(id)` · `addEdge(edge)` / `updateEdge(id,
patch)` / `removeEdge(id)` · `connect(from, to, {fromPort, toPort, label})` (runs `canConnect`, fires cancelable
`o-connect`) · `deleteSelection()` · `moveSelection(dx, dy)` · `select(nodeIds, edgeIds)` / `selectAll()` /
`clearSelection()` / `getSelection()` · `copy()` / `cut()` / `paste(at?)` / `duplicate()` · `group()` / `ungroup()`
/ `bringToFront()` / `sendToBack()` · `undo()` / `redo()` / `canUndo` / `canRedo` (getters) · `editLabel(id, 'node'
| 'edge')` · `layout(type, {direction, rankSep, nodeSep, animate, fit})` → Promise · `fit(opts)` / `zoomTo(k |
'fit')` / `focusNode(id)` / `zoom` (getter) · `exportSVG(opts)` / `exportPNG(opts)` / `download(format, name)`.

### `<o-diagram>` — events

All bubble & are composed; `o-connect` and `o-delete` are cancelable.

| Event | Detail |
|---|---|
| `o-change` | `{ value, action }` — after every committed change (move, connect, label, style, undo…). |
| `o-select` | `{ items, nodes, edges }` |
| `o-node-click` / `o-node-dblclick` | `{ node, originalEvent }` |
| `o-edge-click` | `{ edge, originalEvent }` |
| `o-connect` | `{ edge, from, to }` — cancelable; edit `detail.edge` to decorate the new edge. |
| `o-delete` | `{ nodes, edges }` — cancelable. |
| `o-layout` | `{ type, direction }` |
| `o-viewport` | `{ x, y, zoom }` — does not bubble. |

### `<o-workflow>` — additions over `<o-diagram>`

A typed node palette (`wf-start wf-task wf-approval wf-condition wf-split wf-join wf-delay wf-email wf-webhook
wf-script wf-end`, each with named ports and an icon-chip card renderer) replaces the shape palette; `properties`
and `toolbar` default **on**. `data` on a node holds its schema fields (see `Orion.workflow` above for the
type→ports map; the config schema per type lives in `WF_SCHEMA` and is not currently published — extend it via a
`renderNode`-free per-node `data` object and your own read of `el.getNode(id).data`).

| Extra method | Description |
|---|---|
| `validate()` | Recomputes and returns `boolean` (also fires `o-validate`). Rules: at most one `wf-start`; every `wf-end` must be reachable from `wf-start`; every port must have at least one wire (per-port if the type has more than one in/out port, e.g. `wf-condition`'s `yes`/`no`). |
| `autoLayout(opts?)` | `layout('layered', { direction: 'TB', ...opts })`. |
| `simulate()` / `stopSimulate()` / `toggleSimulate()` | Animates a token along one sampled path from `wf-start` to `wf-end` (first untried outgoing edge at each fork). |

| Extra event | Detail |
|---|---|
| `o-validate` | `{ valid, errors: { [nodeId]: string[] } }` — after load and after every committed change. |
| `o-simulate` | `{ running, path? }` — does not bubble. |

Per-node validation errors show as a small warning badge on the card (top-right) and, when that node is the only
selection, as a list at the top of the properties panel.

## Keyboard & accessibility

The canvas is a focusable `role="application"` region with a live-updated `aria-label` summary; shapes are options
of a multi-select `role="listbox"`, and a visually hidden shape/connection list (updated 300ms after the last
change) describes the diagram for screen readers. User actions are announced via `announce()`.

| Keys | Action |
|---|---|
| Tab / Shift+Tab | Move focus (and selection) between shapes. |
| Arrow keys | Move the selection one grid step (Shift ×5, Alt 1px). Without a selection: pan the canvas. |
| Enter / F2 | Edit the label of the selected shape or connection. |
| Shift+F10 / Menu key | Open the action menu (Connect to…, Disconnect from…, arrange, group, layout, export). |
| Delete / Backspace | Delete the selection. |
| Ctrl/⌘+Z · Ctrl/⌘+Shift+Z / Ctrl+Y | Undo · redo. |
| Ctrl/⌘+C · X · V · D | Copy · cut · paste · duplicate. |
| Ctrl/⌘+A | Select all. |
| Ctrl/⌘+G · Ctrl/⌘+Shift+G | Group · ungroup. |
| Ctrl/⌘+] · Ctrl/⌘+[ | Bring to front · send to back. |
| + · − · 0 · 1 | Zoom in · zoom out · 100% · zoom to fit. |
| Space+drag, middle-button drag, touch drag | Pan. Wheel / pinch zooms (or the reverse with `wheel="pan"`). |
| Esc | Cancel a drag in progress, then clear the selection. |

Connecting, resizing and reconnecting are pointer-only (mouse/pen/touch); use the Shift+F10 action menu's "Connect
to…"/"Disconnect from…" pickers as the keyboard-accessible equivalent.

## Limitations

* No server-side / SSR rendering of the canvas itself — it needs `isBrowser` (canvas 2D context for text
  measurement, SVG DOM). The bundle still loads under Node without crashing per ARCHITECTURE.md §2.
* Connecting two nodes, resizing, and reconnecting an edge endpoint are pointer-only; there is no keyboard
  alternative beyond the "Connect to…"/"Disconnect from…" menu pickers (no keyboard resize at all).
* `<o-workflow>`'s per-type config schema (`WF_SCHEMA`) is internal; there is no public API to add fields to a
  built-in node type or register a new workflow node type (only `Orion.diagram.shapes.register` for generic shapes,
  which will not automatically get a config-panel schema).
* Undo history is capped at 100 steps and is per-instance (not persisted).
* `exportPNG`/`download('png')` rasterises through an `<img>` decode of an SVG blob URL; very large diagrams
  (thousands of shapes) can hit browser canvas size limits (`maxSide` defaults to 8192px).
* The router treats every node as a rectangular obstacle (inflated by a margin); it does not route around
  non-rectangular shapes' actual silhouette (ellipse/diamond bounding boxes are used).
