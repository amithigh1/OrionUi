# graph

`<o-graph>` — a force-directed network graph. Velocity-Verlet integration over a Barnes-Hut quadtree charge
approximation (repulsion), link springs, center gravity and spatial-hash collision. Reuses the shared
[`diagram`](../diagram/README.md) kit for pan/zoom/fit and SVG/PNG export (`Orion.diagram.Viewport`, `.bounds`,
`.exportSVG`, `.svgToPNG`) — it declares `// @deps diagram` and does not define any `Orion.diagram.*` export
itself.

## Files

| File | Contents |
|---|---|
| `00-graph.js` | i18n strings, the private icon fallback (`grIcon`), node/edge normalisation (`grNormNode`/`grNormEdge`), the Barnes-Hut quadtree (`GrQuad`/`grBuildTree`/`grInsert`/`grAccumulate`/`grApplyCharge`) and the simulation itself (`GrSimulation`: velocity-Verlet `step()`, spatial-hash `_collide()`). |
| `10-element.js` | `<o-graph>` (`OGraph`) — the whole element: model, the render/simulation loop, pointer interaction (drag to pin, hover to highlight neighbours), legend, zoom/pan, export. |
| `graph.css` | `.o-gr-*` — canvas, nodes, edges, legend, zoom bar, export menu, narrow-width layout. |

## Public API

| Export | Kind | Description |
|---|---|---|
| `<o-graph>` | element | Force-directed network graph. |
| `Orion.Graph` | class | `OGraph`, for `instanceof` checks / manual construction. |

## Data shape

```js
el.nodes = [{ id, label, group, size, data }];       // size: circle radius hint, default 10 (clamped 3–48)
el.edges = [{ source, target, weight, label }];       // also accepts { from, to } (mapped to source/target)
```
Edges referencing an unknown node, or a self-loop (`source === target`), are silently dropped from the simulation
(kept out of `getNeighbors`/rendering) but not mutated in the input arrays.

## Props / attributes

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `nodes` | — (property only) | Array | `[]` | See shape above. |
| `edges` | — (property only) | Array | `[]` | See shape above. |
| `legend` | `legend` | Boolean | `true` | Shows the group-color legend (only when at least one node has a `group`); click an entry to dim that group. |
| `toolbar` | `toolbar` | Boolean | `true` | Freeze/resume, restart-layout and export buttons. |
| `frozen` | `frozen` (reflects) | Boolean | `false` | Stops the simulation loop (nodes keep their last position; dragging still works and re-pins). |
| `linkDistance` | `link-distance` | Number | `70` | Target link length (log-scaled by `edge.weight`). |
| `charge` | `charge` | Number | `-220` | Node repulsion strength (negative repels; less negative = looser layout). |
| `minZoom` / `maxZoom` | `min-zoom` / `max-zoom` | Number | `0.05` / `6` | Zoom limits. |
| `label` | `label` | String | — | Accessible name; also the export title and default file name. |
| `texts` | — (property only) | Object | — | Per-instance string overrides (`graph.*` keys). |

Changing `linkDistance`/`charge` after the graph is built re-heats the simulation (`alpha` to `0.7`) instead of
requiring a full rebuild.

## Methods

| Method | Description |
|---|---|
| `select(id \| null)` / `getSelection()` | Selection (single). |
| `pin(id, x?, y?)` | Pins a node in place, optionally moving it first. |
| `unpin(id)` | Releases a pin and re-heats the layout. |
| `freeze()` / `unfreeze()` | Same as setting the `frozen` prop. |
| `reheat(alpha = 1)` | Restarts/boosts the simulation without changing pins. |
| `getValue()` | `{ nodes, edges }` deep copy of the current input data. |
| `getNode(id)` | Read one node. |
| `getNeighbors(id)` | Connected nodes (both directions), deep copies. |
| `fit(opts)` / `zoomTo(k \| 'fit')` / `zoom` (getter) | View control. |
| `exportSVG(opts)` / `exportPNG(opts)` / `download(format, name)` | Export (`'svg' \| 'png' \| 'json'`). |

## Events

All bubble & are composed except `o-settle` and `o-viewport` (do not bubble).

| Event | Detail |
|---|---|
| `o-node-click` | `{ node, originalEvent }` — click without drag. |
| `o-select` | `{ node }` |
| `o-pin` | `{ id, pinned }` — after a drag ends (pinned), a double-click releases (unpinned), or `pin()`/`unpin()`. |
| `o-settle` | `{}` — does not bubble; fired once when `alpha` drops below `alphaMin` (`0.001`) and the render loop stops. |
| `o-viewport` | `{ x, y, zoom }` — does not bubble. |

## Simulation notes

* `GrSimulation` runs to completion synchronously (capped at 700 steps) instead of animating when
  `reducedMotion()` is true, so the graph still appears fully laid out with no motion.
* Dense graphs (> 220 nodes) get `.is-dense`, which hides idle labels (shown again on hover/select) to keep the
  canvas legible; label visibility is also dropped below `k < 0.55` zoom (`.is-far`) independent of density.
* Dragging a node sets `vx`/`vy` to 0 and `pinned = true` immediately (no threshold), so a drag always pins even if
  released at the start point; a plain click (no movement) does not pin — it only selects.

## Keyboard & accessibility

The canvas is a focusable `role="application"` region with a live `aria-label` summary (node/edge counts).
Dragging, hover-to-highlight and double-click-to-unpin are pointer-only; there is no keyboard node-to-node
traversal (use `select(id)` / `pin(id)` / `getNeighbors(id)` from script for a custom keyboard UI).

| Keys | Action |
|---|---|
| + · − · 0 · 1 | Zoom in · zoom out · 100% · zoom to fit. |
| Drag, wheel / pinch | Pan / zoom (pointer only). |

## Limitations

* No keyboard node selection/traversal, no keyboard pin/unpin — script the equivalents via the public methods if
  needed.
* No multi-select.
* The simulation is 2D-only and does not persist positions across a `nodes`/`edges` reassignment beyond carrying
  over `x`/`y`/`vx`/`vy`/`pinned` for ids that still exist (new ids start from a deterministic spiral seed, not
  `(0,0)`, to avoid an initial explosion of overlapping nodes).
