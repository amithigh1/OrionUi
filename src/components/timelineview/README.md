# timelineview — `<o-timeline-view>` / `Orion.TimelineView`

Interactive time axis: items (ranges, points, background bands) laid out on an adaptive,
localized scale (minutes to centuries) inside optional nested, collapsible lanes. Pan with a
mouse (inertia), wheel or touch pinch to zoom, shift-drag to zoom to a range, drag to move/resize
editable items, automatic stacking within a lane, clustering of dense points, a current-time
line, keyboard navigation, selection, and full RTL/dark-mode support. No third-party code.

Docs: `docs/components/timeline-view.html`. No dependencies on other component folders. Not to be
confused with `Orion.TimeColumns` (the hour/minute/second scroll-spinner in the unrelated
`timepicker` package) or the CSS-only `.o-timeline` classes documented on `docs/components/timeline.html`
("Timeline & Stats") — this package is the interactive data-driven `<o-timeline-view>` element.

## Files

| File | Contents |
|---|---|
| `00-i18n.js` | `timelineView.*` i18n strings |
| `10-scale.js` | adaptive axis: minor/major step selection, tick generation, localized tick labels, drag-snap unit |
| `20-model.js` | pure item/group normalization, tree order for nested groups, stacking (row assignment) + point clustering |
| `30-element.js` | `<o-timeline-view>` class: props, layout, rendering, selection, window (pan/zoom) API, public data API |
| `40-interact.js` | pointer interactions: pan (with inertia), pinch, wheel zoom, item drag move/resize, shift-drag-to-zoom brush, cluster zoom, keyboard |
| `99-define.js` | pre-connect API queuing, registration, `Orion.timelineView(target, config)` factory |
| `timelineview.css` | tokens-only styles (RTL via logical properties, dark mode via surface tokens) |

## Usage

```html
<o-timeline-view id="activity" now editable height="20rem"></o-timeline-view>
<script>
  const tv = document.getElementById('activity');
  tv.groups = [{ id: 'ops', content: 'Ops' }, { id: 'db', content: 'Database' }];
  tv.items = [
    { id: 1, group: 'ops', content: 'Deploy v2.4', start: '2026-09-12T14:00', end: '2026-09-12T15:30' },
    { id: 2, group: 'db', content: 'Backup', type: 'point', start: '2026-09-12T02:00' },
  ];
  tv.addEventListener('o-item-change', e => console.log(e.detail.item, e.detail.changes));
</script>
```

```js
const tv = Orion.timelineView('#panel', { items, groups, editable: true });
```

## `<o-timeline-view>` properties / attributes

Attribute names are the kebab-case form of the property. Array/Object props accept a JSON string
in markup; `itemTemplate`/`groupTemplate` are `Function` props (property-only in practice — set
them from script).

| Prop | Type | Default | Notes |
|---|---|---|---|
| `items` | `Item[]` | `[]` | The items on the axis (see **Item fields**). Reassigning it re-normalizes the model (unlike `<o-gantt>`'s `tasks`, there is no undo history to clear — this package has none; see **Limitations**). |
| `groups` | `Group[]` | `null` | Optional lanes (see **Group fields**). `null`/omitted renders a single implicit, unlabeled lane. |
| `start` / `end` | date | auto-fit | The current visible window. Read together as the live pan/zoom state. Setting only one property is ignored (both must resolve together, with `end` after `start`, in the same batched update); prefer `setWindow()` to change the window from script — unlike a raw property assignment, it also clamps the span to `[zoomMin, zoomMax]`. Auto-fits every item (+8% padding) on first render when neither is set. |
| `zoomMin` (`zoom-min`) | `number` (ms) | `60000` (1 minute) | Minimum window span, in milliseconds. |
| `zoomMax` (`zoom-max`) | `number` (ms) | ~20 years | Maximum window span, in milliseconds. |
| `stack` | `boolean` | `true` | Stack overlapping items into extra rows within a lane; `stack="false"` overlaps them instead (all at row 0). |
| `editable` | `boolean` | `false` | Default drag move/resize permission; a per-item `editable` field overrides it. Background items are never editable. |
| `selectable` | `boolean` | `true` | Default click/keyboard selection permission; a per-item `selectable` field overrides it. Background items are never selectable. |
| `now` | `boolean` | `false` | Vertical line at the current time (recomputed every 30s). |
| `toolbar` | `boolean` | `true` | Show the built-in zoom-out/zoom-in/fit/now toolbar. |
| `height` | CSS length | `22rem` | Component height (or set `--o-tv-h`). |
| `groupsWidth` (`groups-width`) | `number` | `160` | Lane-label column width in px, clamped to `[80, width - 160]`. |
| `label` | `string` | `"Timeline"` | Accessible name (`aria-label`). |
| `itemTemplate` (`item-template`) | `(item) => Node \| SafeHTML \| string` | item's `content` | Custom item content. |
| `groupTemplate` (`group-template`) | `(group) => Node \| SafeHTML \| string` | group's `content` | Custom lane-label content. |
| `texts` | `object` | – | Per-instance overrides of `timelineView.*` i18n strings (see `t()` on `OElement`). |

There is no `readonly` prop (unlike `<o-gantt>`): use `editable="false"` (the default) to disable
drag editing, and `selectable="false"` to also disable selection; zoom/pan and the toolbar keep
working either way, matching `<o-gantt>`'s `readonly` in spirit if both are turned off.

## Item fields

```ts
interface Item {
  id?: string | number;                          // generated when missing
  content?: string | Node | SafeHTML;             // overridden by itemTemplate when set
  start: string | Date | number;                  // required
  end?: string | Date | number;                   // present -> type 'range'; omitted -> 'point' (unless `type` overrides)
  type?: 'range' | 'point' | 'background';         // inferred from `end` when omitted
  group?: string | number;                        // a lane id; falls back to the ungrouped lane when unknown
  className?: string;
  color?: string;                                 // 'primary'|'success'|...|'chart-1'..'chart-8'|any CSS color
  editable?: boolean; selectable?: boolean;        // per-item override of the element's editable/selectable
  title?: string;                                  // native tooltip
  data?: any;                                      // your payload, returned untouched
  [extra: string]: any;                            // unrecognised fields are kept and returned by getItems()
}
```

`getItems()`/event details return `start`/`end` as real `Date` instances (unlike `<o-gantt>`,
which normalizes to `'YYYY-MM-DD'` strings — this package works at sub-day granularity, so a date
string would lose precision). A `point` item never has `end` in its public shape.

## Group fields

```ts
interface Group {
  id?: string | number;             // generated when missing
  content?: string | Node | SafeHTML;  // overridden by groupTemplate when set
  nested?: (string | number)[];     // child group ids, rendered as indented sub-lanes directly beneath
  collapsed?: boolean;              // initial state; ignored on a group with no nested children (no toggle)
  order?: number;                   // sort order among siblings (default: declaration order)
  visible?: boolean;                // default true; false hides the lane and its items entirely
  height?: number;                  // fixed lane height in px (default: sized to fit the stacked rows)
  className?: string;
  data?: any;
}
```

Groups render depth-first: a group's `nested` children appear immediately below it, indented one
level (`--o-tv-level`). Items whose `group` doesn't match any known group id fall back to the
implicit, italicized *Other* lane. `getGroups()`'s `collapsed` field reflects the *live* toggle
state (whether set initially or since changed by the user or `toggleGroup()`), not just the value
it was constructed with.

## Events

All events bubble, are composed, and are dispatched as `o-<name>`. `o-item-change` goes through
`this.emit()`, so `e.preventDefault()` in a listener vetoes the edit (the UI reverts).

| Event | Cancelable | `detail` |
|---|---|---|
| `o-item-change` | ✓ | `{ item, changes, previous, revert() }` — a user drag (move/resize) or the `Alt`+arrow keyboard nudge. `revert()` undoes just this change later (there is no multi-step undo history — see **Limitations**). |
| `o-item-click` | | `{ id, item, originalEvent }` |
| `o-item-dblclick` | | `{ id, item, originalEvent }` — no built-in default action (unlike `<o-gantt>`'s dblclick-to-edit); listen for this to open your own editor. Double-clicking a cluster zooms into it instead of firing this. |
| `o-select` | | `{ ids, items }` — selection changed via click, `Ctrl`/`Cmd`/`Shift`-click (multi-select) or `Enter`. Not fired by `setSelection()`. |
| `o-range-change` | | `{ start, end }` — the visible window changed (pan, zoom, or `setWindow`/`fit`/`moveTo` without `{ silent: true }`). This is the single place to persist the current view. |
| `o-group-collapse` / `o-group-expand` | | `{ id, group }` — a lane was toggled, by the built-in click **or** `toggleGroup()`/`collapseGroup()`/`expandGroup()`. |

There is no `o-change` equivalent to `<o-gantt>`'s catch-all commit event, no `o-item-add`/`o-item-remove`
(the silent data-API methods below don't emit anything), and no `o-view-change` (listen to
`o-range-change` — the window span implies the zoom level).

## Methods

| Method | Returns | |
|---|---|---|
| `getItems()` | `Item[]` | Every item, public field shapes (dates as `Date`). |
| `getItem(id)` | `Item \| null` | |
| `setItems(items)` | | Replace all items (silent — like `<o-gantt>`'s `updateTask`, no events, no undo). |
| `addItem(item)` | `id` | Silent. |
| `updateItem(id, changes)` | `boolean` | Silent; `changes` is a partial `Item`. |
| `removeItem(id)` | `boolean` | Silent. |
| `getGroups()` / `setGroups(groups)` | `Group[]` / | `getGroups()`'s `collapsed` reflects live state (see **Group fields**). |
| `getSelection()` | `id[]` | |
| `setSelection(ids)` | | Silent (does not emit `o-select`), like `<o-gantt>`'s `select()`. |
| `expandGroup(id)` / `collapseGroup(id)` / `toggleGroup(id)` | | Programmatic lane toggle; emits `o-group-expand`/`o-group-collapse` just like a user click (this is *not* a silent method — mirrors `<o-gantt>`'s `expand()`/`collapse()`/`toggle()`). No-op on a group with no `nested` children. |
| `setWindow(start, end, opts)` | | Sets the visible window in one step; the span is clamped to `[zoomMin, zoomMax]` and the window is re-centered around the clamped span if needed. `opts.silent` skips `o-range-change`. |
| `fit(opts)` | | `{ items?: id[] }` — zoom/pan so every item (or a given subset) is visible, +8% padding. |
| `moveTo(time, opts)` | | Recenter the window on `time` without changing its span. |
| `zoom(percentage, opts)` | | Positive zooms in, negative zooms out (`0.4` default step); `opts.anchor` (`0`–`1`, default `0.5`) keeps that fraction of the viewport fixed while zooming. |
| `zoomIn(percentage, opts)` / `zoomOut(percentage, opts)` | | `zoom(±percentage, opts)`. |
| `refresh()` | | Recompute layout and re-render (call after changing CSS that affects sizing). |

**Static / factory**

| | |
|---|---|
| `Orion.timelineView(target, config)` | Creates (or configures) an `<o-timeline-view>` in `target`. |
| `Orion.TimelineView` | The class (for `instanceof`). |

Unlike `<o-gantt>`, this package exposes no headless, DOM-free engine namespace (no `Orion.timelineView.schedule`-style
helpers) — the model (`tvNormalize`, stacking, clustering) is internal to the element; there is
nothing here that needs to run without a DOM.

## Keyboard

The chart is an independently focusable `role="region"`, described by a hidden keyboard-help
node. There is no separate grid to tab into (unlike `<o-gantt>`'s task list): focus and arrow keys
operate directly on the item nearest in time, chronologically across every lane.

| Keys | Action |
|---|---|
| `→` `←` | Move focus to the next/previous item (by start time, across all lanes) and recenter the view on it. With no items, pans the view instead. |
| `Home` / `End` | Focus the first/last item (by start time). |
| `Enter` | Toggle-select the focused item (single-select; does not add to a multi-selection). |
| `Alt` + `←`/`→` | Move the focused item one snap unit earlier/later (when it is editable). The snap unit adapts to the current zoom (minutes at fine zoom, days at coarse zoom). |
| `Delete` | Remove the focused item, when it is editable (checks the same per-item `editable` override as drag, not just the element's `editable` attribute). |
| `+` / `-` | Zoom in/out around the viewport center. |
| `0` | Fit all items. |
| `Escape` | Cancel an in-progress drag. |
| `Ctrl`/`Cmd` + wheel, or pinch (touch) | Continuous zoom around the pointer/pinch center. |
| `Shift` + drag (mouse) | Draw a box on the axis; releasing zooms straight to that range. |

Mouse-only: background drag pans (with inertia); touch has no single-finger pan (by design, so
vertical page/lane scrolling isn't hijacked) — use pinch, the toolbar, or the keyboard instead.

## CSS variables

Set on `.o-tv` (all tokens-only, dark mode and RTL come free):

| Variable | Default |
|---|---|
| `--o-tv-h` | `22rem` (component height) |
| `--o-tv-range` | `--o-chart-1` |
| `--o-tv-point` | `--o-chart-7` |
| `--o-tv-now` | `--o-primary` |
| `--o-tv-weekend` | mix of `--o-surface-3`/`--o-surface` |
| `--o-tv-sel` / `--o-tv-brush` | selection tint / shift-drag brush tint |

An item's own `color` (token name or CSS color) overrides `--o-tv-color` on that item only.

## Accessibility

- Lanes: each label row is a `role="row"`; a lane with nested children gets a toggle button
  (`aria-hidden`, decorative — the click target is the whole row via delegation) whose icon flips
  open/closed.
- Chart: an independently focusable `role="region"`, described by a hidden keyboard-help node.
  Items get `aria-selected`; clusters get a computed `aria-label` ("5 events from … to …. Press
  Enter to zoom in.").
- Selection changes, item moves/resizes and lane collapse/expand are announced via `Orion.announce()`.
- Horizontal drag/keyboard directions and the axis itself follow `isRTL()`.

## Notes & limits

- **Virtualization**: only lanes and items inside the viewport (plus a margin) exist in the DOM;
  dense point clusters keep large datasets readable and fast.
- **No undo/redo and no `o-change`/`o-task-add`-style catch-all event**, unlike `<o-gantt>`. Only
  `o-item-change` (the cancelable, drag/keyboard-nudge path) fires an event; `setItems()`/`addItem()`/
  `updateItem()`/`removeItem()`/`setGroups()`/`setSelection()` are silent, like `<o-gantt>`'s
  `updateTask()`/`select()`. Build your own undo stack from `o-item-change`'s `revert()` if you need one.
- **`start`/`end` are the live pan/zoom window, not a data range** — don't confuse them with a
  filter; to constrain which items exist, filter `items` yourself before assigning it. Prefer
  `setWindow(start, end)` over setting the properties directly: it also clamps the span to
  `[zoomMin, zoomMax]`, which a raw property assignment does not.
- **No resource/lane height algorithm beyond stacking + clustering**: `stack="false"` overlaps
  same-lane items instead of stacking rows; there's no swimlane "auto-row-per-resource" mode
  beyond the `group`/`nested` structure you provide.
- Not related to `Orion.TimeColumns` (the `timepicker` package's hour/minute/second spinner
  widget) or the static `.o-timeline` CSS classes ("Timeline & Stats") — see the note at the top.
