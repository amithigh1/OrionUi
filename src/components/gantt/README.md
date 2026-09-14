# gantt — `<o-gantt>` / `Orion.Gantt`

Project Gantt chart: a resizable, editable task tree-grid on the left and a virtualized,
zoomable timeline on the right. Dependencies (FS/SS/FF/SF + lag) with orthogonal routing,
auto-scheduling with cycle detection, critical-path analysis, working-day calendars (holidays,
custom week), baselines, drag-and-drop (move/resize/progress/link), full keyboard support,
undo/redo, and PNG/PDF/JSON export. No third-party code.

Docs: `docs/components/gantt.html`. No dependencies on other component folders (feature-detects
`Orion.PDF`/`Orion.pdf` for PDF export at call time).

## Files

| File | Contents |
|---|---|
| `00-i18n.js` | `gantt.*` i18n strings |
| `10-calendar.js` | day-number helpers (`gDay`, `gDate`, `gISO`, DST-safe) and `GanttCalendar` (working days + holidays) |
| `20-engine.js` | pure task-model engine: normalization, tree, summary roll-up, dependency graph, forward auto-scheduling, backward critical-path pass, cycle detection — exposed standalone as `Orion.gantt.*` |
| `30-scale.js` | zoom presets, two-tier header unit selection, day ↔ pixel helpers |
| `35-routes.js` | orthogonal dependency-arrow routing (SVG path + arrowhead generation) |
| `40-element.js` | `<o-gantt>` class: props, state, undo/redo history, record edits, public API |
| `45-layout.js` | DOM skeleton, sizing, virtualization window, scroll sync (grid ↔ chart), continuous zoom |
| `50-grid.js` | task tree-grid (`role=treegrid`), column setup, cell rendering, inline editing, splitter |
| `60-chart.js` | header/background/bar/link rendering for the virtualized render window |
| `70-drag.js` | pointer interactions: move, resize, progress, link-drag, pan with inertia, hover |
| `75-keys.js` | keyboard (shared by the grid and the timeline) |
| `80-ui.js` | toolbar, roving tabindex, export menu, hover card |
| `85-export.js` | canvas rendering shared by PNG/PDF export, JSON export |
| `99-define.js` | pre-connect API queuing, registration, `Orion.gantt(target, config)` factory |
| `gantt.css` | tokens-only styles (RTL via logical properties, dark mode via surface tokens) |

## Usage

```html
<o-gantt id="plan" view="week" today-line critical-path height="32rem"></o-gantt>
<script>
  const g = document.getElementById('plan');
  g.tasks = [
    { id: 'p1', name: 'Discovery', type: 'project' },
    { id: 't1', parent: 'p1', name: 'Kick-off', type: 'milestone', start: '2026-09-14' },
    { id: 't2', parent: 'p1', name: 'Research', start: '2026-09-14', duration: 5, dependencies: ['t1'] },
  ];
  g.addEventListener('o-task-change', e => console.log(e.detail.task, e.detail.changes));
</script>
```

```js
const g = Orion.gantt('#panel', { tasks, view: 'week', criticalPath: true });
// The engine also runs headless (server, tests, import validation):
const scheduled = Orion.gantt.schedule(tasks, { holidays: ['2026-12-25'] });
const { tasks: critical, slack, finish } = Orion.gantt.criticalPath(scheduled);
```

## `<o-gantt>` properties / attributes

Attribute names are the kebab-case form of the property. Array/Object props accept a JSON string
in markup; `tooltip` is a `Function` prop (property-only in practice — set it from script).

| Prop | Type | Default | Notes |
|---|---|---|---|
| `tasks` | `Task[]` | `[]` | The plan (see **Task fields**). Reassigning it reloads the model and clears undo history. |
| `view` | `'day'\|'week'\|'month'\|'quarter'\|'year'` | `'week'` | Zoom preset. See also the `zoom` property (continuous). |
| `start` / `end` | date | auto | Minimum visible range; the range always grows to fit every task. |
| `todayLine` (`today-line`) | `boolean` | `false` | Vertical line + header marker at the current time (updates every minute). |
| `criticalPath` (`critical-path`) | `boolean` | `false` | Highlight critical tasks (zero total slack) and their driving links. |
| `readonly` | `boolean` (reflected) | `false` | Disables every edit affordance (drag handles, dots, cell editors, toolbar edit actions). Selection, tooltips, zoom, export keep working. |
| `autoSchedule` (`auto-schedule`) | `boolean` | `true` | Push dependent tasks forward so every dependency (with its lag) still holds after an edit. |
| `workingDays` (`working-days`) | `number[]` | `[1,2,3,4,5]` | Worked weekdays, `0`=Sunday. Durations and lags are counted in working days. |
| `holidays` | `(string \| {date, name})[]` | `[]` | Non-working dates on top of `workingDays`. |
| `columns` | `(string \| Column)[]` | `name,start,end,duration,progress,assignee` | Task-list columns; see **Column definition**. |
| `gridWidth` (`grid-width`) | `number` | auto | Initial task-list width in px (px); the splitter can resize it afterwards (double-click/`Enter` toggles it away). |
| `rowHeight` (`row-height`) | `number` | `36` | Row height in px (clamped 24–96). |
| `baselines` | `boolean` | `true` | Draw a baseline bar under tasks that have `baselineStart`/`baselineEnd`. |
| `toolbar` | `boolean` | `true` | Show the built-in toolbar. |
| `dateFormat` (`date-format`) | `'short'\|'medium'\|'long'\|'full'` \| Intl options \| format tokens | `'medium'` | Date format in the task list, tooltips and announcements. |
| `height` | CSS length | `32rem` | Component height (or set `--o-gantt-h`). |
| `label` | `string` | `"Gantt chart"` | Accessible name (`aria-label`). |
| `tooltip` | `(task) => Node \| SafeHTML \| string` | built-in card | Custom hover-card content. |
| `texts` | `object` | – | Per-instance overrides of `gantt.*` i18n strings (see `t()` on `OElement`). |
| `zoom` | `number` | – | **Property only** (no attribute): current pixels-per-day. Settable for continuous zoom (`el.zoom = 6`), clamped to `[0.3, 120]`. |

## Task fields

```ts
interface Task {
  id?: string | number;                 // generated when missing
  name?: string;
  start?: string | Date;                // 'YYYY-MM-DD' (local). Give `end` or `duration`.
  end?: string | Date;                  // inclusive last day
  duration?: number;                    // working days, used when `end` is omitted (default 1)
  progress?: number;                    // 0-100; summaries show a duration-weighted roll-up
  parent?: string | number;             // a task with children is rendered as a summary bar
  type?: 'task' | 'milestone' | 'project';   // milestone = diamond at the END of its day; project marks a summary
  dependencies?: Array<string | number | { id, type?: 'FS'|'SS'|'FF'|'SF', lag?: number }>;
  assignees?: Array<string | { name, avatar? }>;
  color?: string;                       // 'primary'|'success'|...|'chart-1'..'chart-8'|any CSS color
  collapsed?: boolean;                  // initial state for a summary
  baselineStart?: string | Date; baselineEnd?: string | Date;
  data?: any;                           // your payload, returned untouched
  [extra: string]: any;                 // unrecognised fields are kept and returned by getTasks()
}
```

Every date returned by the component (`getTasks()`, event details) is a `'YYYY-MM-DD'` string in
local time — safe to store, diff and re-feed into `tasks`. `end` in events/`getTasks()` is
**inclusive** (a bar spanning Sep 1–Sep 3 has `start: '2026-09-01', end: '2026-09-03'`); internally
the engine tracks an exclusive end day number, but that never crosses the public API.

Dependency `type` semantics (defaults to `'FS'`, `lag` in working days, negative = lead):
`FS` successor starts after predecessor finishes · `SS` successor starts after predecessor starts ·
`FF` successor finishes after predecessor finishes · `SF` successor finishes after predecessor starts.
A link whose endpoint is a summary applies to every leaf task inside it.

## Column definition

```ts
interface Column {
  key: string;                 // built-in: 'name' | 'start' | 'end' | 'duration' | 'progress' | 'assignee', or any custom key
  label?: string;               // header text (defaults to a built-in label, or the key)
  width?: number; minWidth?: number;
  align?: 'start' | 'end';
  editable?: boolean;           // default: true for built-ins, false for custom columns (unless `set` is given)
  type?: 'text' | 'number' | 'date';   // editor type for custom columns
  value?: (task) => any;        // custom cell value/text getter
  render?: (task) => Node | SafeHTML | string;   // custom cell content (read-only unless `set` is also given)
  set?: (task, editedValue) => Partial<Task>;    // apply an edited value back onto the task
}
```

The first column (or the first with `key: 'name'`) becomes the tree column (toggle, milestone
icon, indent). A plain string in `columns` (`columns: ['name', 'duration']`) is shorthand for
`{ key }`. Unknown task fields (like a custom `status`) round-trip through `value`/`render`/`set`
and `getTasks()`.

## Events

All events bubble, are composed, and are dispatched as `o-<name>`. Cancelable ones go through
`this.emit()`, so `e.preventDefault()` in a listener vetoes the action (the UI reverts).

| Event | Cancelable | `detail` |
|---|---|---|
| `o-task-change` | ✓ | `{ task, changes, previous, affected: [{task,changes,previous}], revert() }` — any user edit: drag move/resize/progress, cell edit, keyboard move/resize, indent/outdent, link create/delete that changes dates. `affected` lists other tasks that auto-scheduling pushed. `revert()` undoes just this step later (e.g. after your server rejects it), even if more edits happened since. |
| `o-task-click` | | `{ id, task, originalEvent }` |
| `o-task-dblclick` | ✓ | `{ id, task, originalEvent }` — default action starts editing the name; prevent it to do your own thing. |
| `o-task-contextmenu` | ✓ | `{ id, task, originalEvent }` — prevent the default (nothing) to show your own menu. |
| `o-task-add` | ✓ | `{ task }` — toolbar "Add task/milestone" or the `Insert` key. |
| `o-task-remove` | ✓ | `{ task }` — toolbar "Delete" or the `Delete` key. |
| `o-link-create` | ✓ | `{ link: {from, to, type, lag}, from, to }` — a dependency was drawn by dragging between two bars. |
| `o-link-delete` | ✓ | `{ link, from, to }` — double-clicked, or selected + `Delete`. |
| `o-select` | | `{ id, task }` — selection changed (`id`/`task` are `null` when cleared). Only fired for user interaction (click, keyboard); the `select()` method does not emit it. |
| `o-change` | | `{ reason, ids }` — after **any** committed change (edits, undo, redo, and every API call), `reason` is one of `move\|resize\|progress\|edit\|add\|remove\|indent\|outdent\|link\|unlink\|schedule\|undo\|redo\|revert`. The single place to sync an external store. |
| `o-view-change` | | `{ view, dayWidth }` — the zoom level changed (preset or continuous). |
| `o-expand` / `o-collapse` | | `{ id, task }` — a summary was expanded/collapsed. |
| `o-grid-toggle` | | `{ visible }` — the task list was shown/hidden. |
| `o-column-resize` | | `{ key, width }` |
| `o-export` | | `{ format: 'png'\|'pdf'\|'json', blob? }` — after an export completes. |

## Methods

| Method | Returns | |
|---|---|---|
| `getTasks()` | `Task[]` | Every task, tree (depth-first) order, public field shapes. |
| `getTask(id)` | `Task \| null` | |
| `addTask(task, { parent?, after?, select? = true, user? = false })` | `id` | Undoable, auto-scheduled. Does **not** emit `o-task-add` (only the toolbar "Add task"/"Add milestone" buttons and the `Insert`/`Shift+Insert` keys do, which call a separate internal path). Emits `o-select` only when `select` stays `true` **and** `user: true`. |
| `updateTask(id, changes, { schedule? = true })` | `boolean` | Applies public-shape `changes` (same fields as `Task`); undoable, **does not** emit `o-task-change`/`o-select`. Moving a summary's `start` moves its whole subtree. |
| `removeTask(id)` | `boolean` | Removes the task, its subtasks and any links to them. |
| `addLink(from, to, type = 'FS', lag = 0)` / `removeLink(from, to)` | `boolean` | Programmatic dependency edits (loops are refused, returns `false`). |
| `indent(id?)` / `outdent(id?)` | `boolean` | Defaults to the current selection. |
| `schedule()` | `id[]` | Re-runs auto-scheduling over the whole plan as one undo step; throws if the dependency graph has a cycle. Returns the ids that moved. |
| `getCriticalPath()` | `id[]` | Works even when `criticalPath` (the highlight) is off. |
| `select(id)` / `getSelected()` | `void` / `Task \| null` | `select()` does not emit `o-select` (it's a programmatic setter, like `updateTask`). |
| `expand(id)` / `collapse(id)` / `toggle(id)` / `expandAll()` / `collapseAll()` | | Summary rows. |
| `scrollToTask(id, { select? = true })` | `boolean` | Expands ancestors and scrolls both axes. |
| `scrollToToday(behavior?)` / `scrollToDate(date, behavior?)` | | `behavior`: `'smooth'` or omitted. |
| `setView(view)` | | `'day'\|'week'\|'month'\|'quarter'\|'year'`. |
| `zoomIn()` / `zoomOut()` | | Steps between the five presets. |
| `undo()` / `redo()` | `boolean` | Also `canUndo`/`canRedo` getters and `clearHistory()`. History holds 100 steps. |
| `exportPNG(opts?)` | `Promise<Blob>` | `{ scale=2, grid=true, columns, range: 'all'\|'visible', rows: 'all'\|'visible', filename, download=true }`. |
| `exportPDF(opts?)` | `Promise<any>` | Same options + `{ orientation }`. Uses `Orion.PDF`/`Orion.pdf` when present (`.fromImage()` or a jsPDF-like constructor), otherwise opens the print dialog ("Save as PDF"). |
| `exportJSON(opts?)` | `string` | `{ space=2, filename, download=true }` — `JSON.stringify(getTasks())`. |
| `toCanvas(opts?)` | `HTMLCanvasElement` | The renderer shared by `exportPNG`/`exportPDF`, for custom use. |
| `refresh()` | | Recompute + re-render (call after changing CSS that affects sizing). |

**Static / factory**

| | |
|---|---|
| `Orion.gantt(target, config)` | Creates (or configures) an `<o-gantt>` in `target`. |
| `Orion.gantt.schedule(tasks, opts)` | Headless auto-scheduling. `opts`: `{ workingDays, holidays, calendar, changed: [ids] }`. Throws `Error` on a dependency loop. |
| `Orion.gantt.criticalPath(tasks, opts)` | `{ tasks: [ids], links: [[from,to]], slack: {id: days}, finish }`. |
| `Orion.gantt.findCycle(tasks, opts)` | `[ids] \| null`. |
| `Orion.gantt.normalize(tasks, opts)` | Tasks with computed dates/roll-ups, no scheduling. |
| `Orion.gantt.calendar(opts)` | `new GanttCalendar(opts)` — `.isWorking(day)`, `.add(day, k)`, `.count(a, b)`, `.endFor(start, dur)`, `.startFor(end, dur)` (all on integer day numbers; `Orion.gantt.day(v)`/`.iso(n)`/`.date(n)` convert). |
| `Orion.Gantt` | The class (for `instanceof`). |

All engine functions (`schedule`, `criticalPath`, `findCycle`, `normalize`) run without any DOM —
safe to use server-side or in a plain data pipeline.

## Keyboard

The task list is a WAI-ARIA `treegrid`; the timeline is independently focusable and shares the
same shortcuts (state is per selected task, not per focused element).

| Keys | Action |
|---|---|
| `↑` `↓`, `Page Up/Down` | Previous/next task. |
| `→` `←` | Task list: expand/collapse a summary, go to the parent, move between cells. Timeline: scroll. |
| `Home` / `End` | First/last cell (or task list row, with `Ctrl`). |
| `Enter` / `F2` | Edit the focused cell (`Enter` commits and moves down, `Escape` cancels, `Tab`/`Shift+Tab` moves to the next/previous editable cell). Typing a character also starts editing. |
| `Alt` + `←`/`→` | Move the task one snap unit earlier/later (a day, or a week at coarse zoom). |
| `Alt` + `Shift` + `←`/`→` | Shorten/lengthen the task by one snap unit. |
| `Tab` / `Shift+Tab` | Indent/outdent the task (when not possible, focus moves normally — press `Escape` first to leave the grid via `Tab`). |
| `Delete` / `Backspace` | Delete the selected task, or the selected dependency link. |
| `Insert` / `Shift+Insert` | Add a task / milestone below the selection. |
| `Space` | Expand/collapse a summary. |
| `Ctrl+Z` / `Ctrl+Y` (or `Ctrl+Shift+Z`) | Undo / redo. |
| `+` / `-` | Zoom in/out. `T` in the timeline scrolls to today. |
| `Escape` | Cancel an in-progress drag; clear a selected dependency. |
| `Ctrl`/`Cmd` + wheel (timeline) | Continuous zoom around the pointer. |

## CSS variables

Set on `.o-gantt` (all tokens-only, dark mode and RTL come free):

| Variable | Default |
|---|---|
| `--o-gantt-h` | `32rem` (component height) |
| `--o-gantt-task` | `--o-chart-1` |
| `--o-gantt-milestone` | `--o-chart-7` |
| `--o-gantt-summary` | mix of `--o-text`/`--o-surface` |
| `--o-gantt-critical` | `--o-danger` |
| `--o-gantt-today` | `--o-primary` |
| `--o-gantt-weekend` / `--o-gantt-holiday` | mixes of `--o-surface-3`/`--o-warning` |
| `--o-gantt-sel` / `--o-gantt-hover` | row highlight tints |

A task's own `color` (token name or CSS color) overrides `--o-gantt-bar` on that bar only.

## Accessibility

- Task list: `role="treegrid"` with `aria-level`/`aria-posinset`/`aria-setsize`/`aria-expanded`,
  roving `aria-activedescendant`, `aria-readonly` when `readonly`.
- Timeline: an independently focusable `role="region"`, described by a hidden keyboard-help node.
- Every commit (`move`, `resize`, `progress`, `add`, `remove`, `indent`, `outdent`, `expand`,
  `collapse`, `undo`, `redo`, a rejected link) is announced via `Orion.announce()`.
- Horizontal drag/keyboard directions follow `isRTL()`; SVG links mirror with the canvas.

## Notes & limits

- **Virtualization**: only task-list rows and timeline bars inside the viewport (plus a margin)
  exist in the DOM — 1,000+ tasks scroll, zoom and edit smoothly (see the docs page's 2,000-task
  demo). Dependency/roll-up/critical-path recomputation is O(tasks) and runs after every commit.
- **`updateTask()`/`select()`/`addTask()` (without `user:true`) do not emit user-facing events** —
  they're the "silent" programmatic API. Drag, click, keyboard and toolbar actions always emit.
- `autoSchedule` only ever pushes tasks **later**, never earlier; disable it (`auto-schedule=false`)
  to let a plan intentionally drift out of sync with its dependencies (dates you set stick).
- **Undo/redo** groups drag gestures, cell edits, structural edits and API calls into single steps
  and is reset whenever `tasks` is reassigned — keep the component as the edit source of truth
  while a user works, or use `updateTask()`/`addTask()` to apply your own changes without breaking
  the history chain.
- `exportPDF()` needs an `Orion.PDF`/`Orion.pdf` module (or a jsPDF-like global) to produce a real
  PDF; otherwise it falls back to the browser print dialog.
