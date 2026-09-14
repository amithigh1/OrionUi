# kanban — `<o-kanban>` drag & drop task board

Columns, swimlanes, WIP limits, quick-add, a compact list variant, custom card templates, filtering and full
keyboard drag & drop. Built entirely on this package's own [`Orion.sortable`](../dnd/README.md) engine
(`// @deps dnd` on the first file) — no other component dependency.

```html
<o-kanban id="board" filterable wip-block persist="sprint-12"></o-kanban>
<script>
  board.columns = [{ id: 'todo', title: 'To do', color: 'info', limit: 5 }, { id: 'doing', title: 'Doing', color: 'primary' }];
  board.cards = [{ id: 1, columnId: 'todo', title: 'Login page', labels: [{ text: 'UI', color: 'primary' }],
    assignees: [{ name: 'Mei Tan' }], due: '2026-09-20', priority: 'high', progress: 40, checklist: { done: 2, total: 5 } }];
  board.onMove = async ({ cardId, to, index }) => api.moveCard(cardId, to, index); // false/throw -> revert
  board.addEventListener('o-card-move', e => console.log(e.detail));
</script>
```

## TypeScript reference

```ts
interface KanbanColumn { id?: string; title?: string; color?: string; limit?: number; hardLimit?: boolean; collapsed?: boolean; done?: boolean; [k: string]: any; }
interface KanbanLabel { text: string; color?: string; }
interface KanbanPerson { name: string; avatar?: string | null; }
interface KanbanCard {
  id?: string; columnId: string; laneId?: string | null; title: string; description?: string;
  labels?: (string | KanbanLabel)[]; assignees?: (string | KanbanPerson)[];
  due?: string | Date | null; priority?: 'low' | 'medium' | 'high' | 'urgent' | null; progress?: number | null;
  checklist?: { done: number; total: number } | null; comments?: number; attachments?: number; cover?: string | null;
  [k: string]: any;
}
interface KanbanLane { id?: string; title?: string; collapsed?: boolean; }
interface KanbanMoveDetail { cardId: string; card: KanbanCard; from: string; to: string; fromLane: string | null; toLane: string | null; oldIndex: number; index: number; keyboard: boolean; }

interface KanbanOptions {
  columns?: KanbanColumn[]; cards?: KanbanCard[]; swimlanes?: KanbanLane[];
  variant?: 'board' | 'list';
  renderCard?: (card: KanbanCard, kanban: OKanban) => string | InstanceType<typeof SafeHTML> | Node;
  onMove?: (detail: KanbanMoveDetail) => boolean | void | Promise<boolean | void>; // false/throw -> revert
  persist?: string;               // localStorage key suffix: column order/collapse, card order/position
  wipBlock?: boolean;             // refuse drops (and "Add card") once a column's `limit` is reached
  filterable?: boolean;           // search + assignee/label toolbar
  readonly?: boolean;             // no drag, no add/edit/delete UI; openCard() still works
  lockColumns?: boolean;          // cards still drag; columns cannot move/add/rename/delete
  addPosition?: 'top' | 'bottom'; // where the column menu's "Add card" inserts (default 'bottom')
  cardActions?: { id: string; label: string; icon?: string; danger?: boolean }[]; // extra card-menu items -> o-card-action
  detail?: 'panel' | 'none';      // built-in side panel (default) or fire o-card-open only
  texts?: Record<string, string>;
  label?: string;                 // aria-label of the board region
}
declare class OKanban extends HTMLElement implements KanbanOptions {
  addCard(data: Partial<KanbanCard>, opts?: { position?: 'top' | 'bottom'; after?: string; before?: string; user?: boolean }): KanbanCard | false;
  updateCard(id: string, patch: Partial<KanbanCard>, opts?: { user?: boolean }): KanbanCard | false;
  removeCard(id: string, opts?: { user?: boolean; quiet?: boolean }): boolean;
  moveCard(id: string, columnId: string, index?: number, laneId?: string | null, opts?: { user?: boolean }): boolean | Promise<boolean>;
  addColumn(data: Partial<KanbanColumn>, index?: number, opts?: { user?: boolean }): KanbanColumn | false;
  updateColumn(id: string, patch: Partial<KanbanColumn>, opts?: { user?: boolean }): KanbanColumn | false;
  removeColumn(id: string, opts?: { user?: boolean }): boolean;
  moveColumn(id: string, toIndex: number, opts?: { user?: boolean }): boolean;
  collapseColumn(id: string, collapsed?: boolean, opts?: { user?: boolean }): boolean;
  openCard(id: string): boolean;   // opens the built-in panel unless detail="none" or o-card-open is prevented
  closeCard(): void;
  focusCard(id: string): boolean;
  filter(f: { text?: string; assignee?: string[]; label?: string[] } | string, user?: boolean): number; // returns visible count
  clearFilter(): number;
  getData(): { columns: KanbanColumn[]; cards: KanbanCard[]; swimlanes: KanbanLane[] }; // deep clone
}
declare function kanban(target: string | Element, options?: Partial<KanbanOptions>): OKanban; // Orion.kanban()
```

## DOM events

| Event | Detail | Notes |
|---|---|---|
| `o-card-move` | `KanbanMoveDetail` | Cancelable. Fired for both drag and `moveCard()`. |
| `o-card-move-revert` | `KanbanMoveDetail` | `onMove` returned/threw false; the card was already moved back. |
| `o-card-add` / `o-card-update` / `o-card-remove` | `{ card }` (`+ { patch }` for update) | Cancelable. |
| `o-card-open` | `{ card }` | Cancelable — prevent default to replace the built-in panel with your own UI. |
| `o-card-close` | `{ cardId }` | The built-in panel closed. |
| `o-card-menu` / `o-column-menu` | `{ card\|column, items, anchor, run(id) }` | Cancelable. Mutate `items` in place, or `preventDefault()` and call `run()`/render your own menu. |
| `o-card-action` | `{ action, card }` | A `cardActions` entry (or an unrecognised built-in id) was picked. |
| `o-column-move` / `o-column-add` / `o-column-update` / `o-column-remove` / `o-column-toggle` | Same shape, with `column` | Cancelable. |
| `o-filter` | `{ filter, visible, total }` | After the toolbar filter (or `filter()`) changes. |
| `o-change` | `{ reason, columns, cards }` | After every mutation — good single hook for a debounced autosave. |

## Keyboard

Cards and column headers are focusable and share the [drag & drop](../dnd/README.md) keyboard engine
(`Space` picks up / drops, arrows move, `Escape` cancels — see that package for the full table). Additional
kanban bindings: `Enter` opens the focused card, `Shift+F10`/`ContextMenu` opens its menu, `F2` or double-click
renames the focused column title, `↑↓` move focus between cards in a column (or the next/previous lane row),
`←→` move focus to the nearest card in an adjacent column (mirrored in RTL, disabled in `variant="list"`).

## CSS

Custom properties: `--o-kanban-col-w` (default `18.5rem`), `--o-kanban-gap`. Structural classes: `.o-kanban-board`
(`.has-lanes`), `.o-kanban-col` (`.is-collapsed`, `.is-over-limit`, `.is-blocked`), `.o-kanban-card`
(`[data-priority]`, `.is-pending`), `.o-kanban-lane` / `.o-kanban-cell`, `.o-kanban-detail` (the built-in panel).
Drag visuals reuse the drag & drop engine's `.o-sortable-placeholder` / `.o-dnd-ghost`.

`column.color` / `label.color` semantic tokens map to the core `.o-c-{primary|secondary|success|danger|warning|info|light|dark}`
"current color context" utilities described in ARCHITECTURE.md §8 (they set `--o-c`, `--o-c-subtle`, `--o-c-text`,
`--o-c-border`, `--o-c-hover`); a raw colour/hex sets `--o-c` directly via an inline style.

## Framework note

Set `columns` / `cards` / `swimlanes` as properties (arrays), not attributes, from React/Vue/Angular — the
board keeps its own shallow-copied working arrays and normalises `id`s, so pass a fresh array/objects on every
change rather than mutating in place. `renderCard` and `onMove` are plain functions and can close over component
state freely. `moveCard`/`addCard`/etc. are the recommended way to apply an external (realtime) change without
re-diffing the whole board.

## Limitations / known gaps

* The built-in card detail panel edits title, description, column, priority, due date, progress and checklist
  count; it does not offer inline editors for labels/assignees/cover — prevent default on `o-card-open` and
  render your own panel if you need those.
* `removeCard` does not yet animate other cards sliding up to fill the gap (only the removed card fades).
* There is no built-in "add label" / label palette editor; labels are supplied as data.

## Core changes this package prompted (now landed)

* The `.o-c-{color}` utilities are generated by core (`build/utilities.mjs`); the scoped copy this file used to ship is gone.
* `define()` now reports (via `console.error`, which fails `build/check.mjs`) any component whose props or methods shadow
  `OElement`'s reserved members such as `_changed`, `flush` or `render` — see ARCHITECTURE.md §2/§5.
