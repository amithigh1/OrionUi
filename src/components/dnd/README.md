# dnd — drag & drop engine, sortable lists, draggable, dropzones

Foundational package. Dashboard widgets, upload lists, datatable column reorder, gantt, calendar, kanban and tree
use it **at runtime** (`Orion.dnd`, `Orion.sortable`, `Orion.draggable`, `Orion.dropzone`). Add `// @deps dnd` to the
first line of your component when you call it, so custom builds (`--only=`) include it.

Everything is hand-written (no SortableJS / dnd-kit): pointer events (mouse, touch, pen), long-press on touch
without scroll hijacking, auto-scroll (window + scroll containers), FLIP animations (reduced motion respected),
keyboard drag & drop with live announcements, RTL, nested lists, grids, clone mode and controlled mode for frameworks.

## TypeScript reference

```ts
/* ───────────── Orion.sortable ───────────── */
type SortGroup = string | {
  name?: string;
  /** true | false | 'clone' | (to, from, item, event) => boolean | 'clone' */
  pull?: boolean | 'clone' | ((to: Sortable, from: Sortable, item: HTMLElement, e?: Event) => boolean | 'clone');
  /** true | false | ['otherGroup'] | (to, from, item, event) => boolean */
  put?: boolean | string[] | ((to: Sortable, from: Sortable, item: HTMLElement, e?: Event) => boolean);
};

interface SortableOptions {
  items?: string;               // selector matched against DIRECT children ('> *' or '*' = all). Default '*'
  handle?: string | null;       // drag only from this selector inside an item (touch: no long-press needed)
  group?: SortGroup | null;     // connect lists
  animation?: number;           // FLIP duration in ms (180). 0 disables
  direction?: 'auto' | 'vertical' | 'horizontal' | 'grid';
  disabled?: boolean;
  filter?: string | null;       // items (or parts of items) that must not start a drag
  ignore?: string;              // inner elements that never start a drag (inputs, buttons, links…)
  placeholderClass?: string;    // 'o-sortable-placeholder' — the item while it marks the drop position
  ghostClass?: string;          // 'o-sortable-ghost'       — the floating preview following the pointer
  dragClass?: string;           // 'o-sortable-drag'        — the item for the whole drag (pointer or keyboard)
  sort?: boolean;               // allow reordering inside this list (true)
  delayOnTouch?: number;        // long-press delay on touch (200 ms). Handles start immediately
  touchTolerance?: number;      // px a finger may move during the long-press (8)
  threshold?: number;           // px the mouse must move before a drag starts (4)
  autoScroll?: boolean;         // scroll the window / scroll containers near edges (true)
  scrollSensitivity?: number;   // edge size in px (56)
  scrollSpeed?: number;         // max px per frame (22)
  swapThreshold?: number;       // 0..1 part of a target the pointer must cross before swapping (0.5)
  revertOnSpill?: boolean;      // dropped outside every list -> go back (false: stays at last position)
  controlled?: boolean;         // DOM is restored on drop; you apply the move yourself (React/Vue/Angular)
  keyboard?: boolean;           // keyboard drag & drop (true). Makes items focusable
  pickKeys?: string[];          // keys that pick up / drop (default [' ', 'Enter'])
  preview?: 'clone' | 'none' | ((item: HTMLElement) => HTMLElement);  // custom drag image
  ghostParent?: 'body' | 'parent' | HTMLElement; // where the preview is attached ('body')
  data?: (item: HTMLElement) => any;             // payload offered to Orion.dropzone targets
  label?: (item: HTMLElement) => string;         // name used in announcements (text content)
  onStart?(e: SortEvent): void;
  onMove?(e: SortMoveEvent, pointer?: DragSession): boolean | void;   // return false to veto a position
  onChange?(e: SortEvent): void; // position changed during the drag
  onEnd?(e: SortEndEvent): void; // always (also cancelled)
  onAdd?(e: SortEndEvent): void; // on the target list (drag between lists)
  onRemove?(e: SortEndEvent): void; // on the source list
  onUpdate?(e: SortEndEvent): void; // order changed inside one list
}
interface SortEvent { item: HTMLElement; from: HTMLElement; to: HTMLElement; oldIndex: number; newIndex: number; pullMode: boolean | 'clone'; keyboard: boolean; }
interface SortMoveEvent extends SortEvent { related: HTMLElement | null; willInsertAfter: boolean; }
interface SortEndEvent extends SortEvent {
  clone: HTMLElement | null;     // element left in the source list (pull: 'clone')
  cancelled: boolean;            // Escape / pointercancel
  dropzone: HTMLElement | null;  // dropped on an Orion.dropzone instead of a list
  revert(): void;                // undo the move (uncontrolled mode)
}
interface Sortable {
  el: HTMLElement; options: SortableOptions;
  destroy(): void;
  option<K extends keyof SortableOptions>(key: K, value?: SortableOptions[K]): any;
  toArray(attr?: string): string[];        // 'data-id'
  sort(ids: string[], animate?: boolean, attr?: string): void;
  items(): HTMLElement[];
  cancel(): void;                          // abort a running drag
}
declare function sortable(container: HTMLElement | string, options?: SortableOptions): Sortable;

/* ───────────── Orion.draggable (free positioning) ───────────── */
interface DraggableOptions {
  data?: any;                                // payload for dropzones
  handle?: string | null;
  axis?: 'x' | 'y' | 'both';
  bounds?: 'parent' | 'window' | string | HTMLElement | { left: number; top: number; right: number; bottom: number } | null;
  grid?: number | [number, number];          // snap
  helper?: 'self' | 'clone';                 // clone = a preview is dragged and the element stays (palettes)
  apply?: 'transform' | 'position' | 'none'; // how the position is written (transform)
  position?: { x: number; y: number };       // initial offset
  keyboard?: boolean; step?: number;         // arrow keys move by step (10px, Shift x5)
  disabled?: boolean; delayOnTouch?: number; threshold?: number; autoScroll?: boolean;
  onStart?(e: DragEvent): void | false; onDrag?(e: DragEvent): void; onEnd?(e: DragEvent): void;
}
interface DragEvent { x: number; y: number; dx: number; dy: number; el: HTMLElement; dropzone: HTMLElement | null; cancelled?: boolean; keyboard?: boolean; }
interface Draggable { el: HTMLElement; destroy(): void; option(k: string, v?: any): any; position(): { x: number; y: number }; setPosition(x: number, y: number): void; reset(): void; }
declare function draggable(el: HTMLElement | string, options?: DraggableOptions): Draggable;

/* ───────────── Orion.dropzone (internal + native HTML5) ───────────── */
interface NativeDropData {
  native: true; types: string[]; items: { kind: string; type: string }[]; hasFiles: boolean;
  files: File[]; text: string; html: string; uri: string; uris: string[]; json?: any; // filled on drop only (browser security)
  dataTransfer: DataTransfer;
}
interface DropzoneOptions {
  accept?: (data: any, info: { native: boolean; event?: Event }) => boolean;  // default: everything
  native?: boolean;        // files / text / links dragged from outside the page (true)
  internal?: boolean;      // Orion drags (sortable / draggable / Orion.dnd.start) (true)
  overClass?: string;      // 'is-over'
  activeClass?: string;    // 'is-drop-active' — while a compatible drag is running anywhere
  dropEffect?: 'copy' | 'move' | 'link';
  disabled?: boolean;
  onEnter?(data: any, e: Event | DragSession): void;
  onLeave?(data: any, e: Event | DragSession): void;
  onOver?(data: any, e: Event | DragSession): void;
  onDrop?(data: any, e: Event | DragSession): void;
}
interface Dropzone { el: HTMLElement; destroy(): void; option(k: string, v?: any): any; }
declare function dropzone(el: HTMLElement | string, options?: DropzoneOptions): Dropzone;

/* ───────────── Orion.dnd (low level, for component authors) ───────────── */
interface DragStartOptions {
  el?: HTMLElement; data?: any;
  threshold?: number; delayOnTouch?: number; touchTolerance?: number;
  preview?: 'clone' | 'none' | ((el: HTMLElement, s: DragSession) => HTMLElement);
  previewClass?: string; ghostParent?: 'body' | 'parent' | HTMLElement;
  autoScroll?: boolean; scrollSensitivity?: number; scrollSpeed?: number;
  stopZoneAt?(el: Element): boolean;   // walk-up barrier: an inner target that wins over outer dropzones
  onPending?(s: DragSession): void;    // long-press started (touch)
  onStart?(s: DragSession): void | false;
  onMove?(s: DragSession): void;       // once per frame with a new position (also after auto-scroll)
  onDrop?(s: DragSession): void; onCancel?(s: DragSession): void; onEnd?(s: DragSession): void;
}
interface DragSession {
  el: HTMLElement; data: any; pointerType: string; active: boolean; cancelled: boolean;
  x: number; y: number; startX: number; startY: number; dx: number; dy: number;
  target: Element | null;        // element under the pointer (preview excluded)
  dropzone: HTMLElement | null;  // innermost accepting Orion.dropzone
  preview: HTMLElement | null;
  cancel(): void;
  settle(rect?: DOMRect | null, duration?: number): Promise<void>; // animate the preview onto rect, then remove it
}
declare const dnd: {
  start(e: PointerEvent, options: DragStartOptions): DragSession | null;
  readonly active: DragSession | null;
  flip(elements: Element[], mutate: () => void, options?: { duration?: number }): void; // FLIP animation helper
  layoutRect(el: Element): DOMRect;       // rect without running FLIP transforms
  touchGuard(el: Element): () => void;    // lets a running drag block native touch scrolling inside el
  sortables: Set<Sortable>;
};
```

## DOM events

| Event | Target | Detail |
|---|---|---|
| `o-sort-start` | source list | `SortEvent` |
| `o-sort-move` (cancelable) | target list | `SortMoveEvent` — `preventDefault()` vetoes the position |
| `o-sort-change` | target list | position changed during the drag |
| `o-sort-add` / `o-sort-remove` | target / source list | drag between lists |
| `o-sort-update` | list | order changed inside the list |
| `o-sort-end` | source list | `SortEndEvent` |
| `o-drag-start` / `o-drag-move` / `o-drag-end` | draggable element | `DragEvent` |
| `o-drop-enter` / `o-drop-leave` / `o-drop` | dropzone | `{ data, native }` |

## Declarative

```html
<ul data-o-sortable data-o-sortable-group="tasks" data-o-sortable-handle=".grip">…</ul>
<!-- extra: data-o-sortable-items, -filter, -direction, -animation, -clone (pull: 'clone'), -put="false", -sort="false" -->
<div data-o-draggable data-o-draggable-bounds="parent" data-o-draggable-handle=".title">…</div>
<div class="o-drop-area" data-o-dropzone>Drop files</div>   <!-- emits o-drop { data } -->
```

## Keyboard

| Key | Action |
|---|---|
| `Space` / `Enter` | pick up the focused item, drop it again |
| Arrow keys | move (vertical lists: Up/Down; horizontal: Left/Right, mirrored in RTL; grid: all four). Arrows perpendicular to the list (or past its ends) move to the nearest connected list |
| `Home` / `End` | first / last position |
| `Escape` | cancel and return to the original position |

## CSS

`.o-sortable-placeholder`, `.o-sortable-ghost` / `.o-dnd-ghost`, `.o-sortable-drag`, `.o-sortable-over`,
`.o-sortable-source`, `.o-dnd-handle`, `.o-drag-handle` (visual grip), `.o-drop-area` (+ `.is-over`, `.is-drop-active`).
Custom properties: `--o-dnd-ghost-rotate` (1.5deg), `--o-dnd-ghost-scale` (1.03), `--o-dnd-ghost-shadow`.

## Framework note

Frameworks own the DOM order. Use `controlled: true`: the DOM is restored on drop and `onEnd({ from, to, oldIndex, newIndex })`
tells you what to apply to your state (`list.splice(newIndex, 0, ...list.splice(oldIndex, 1))`). Re-create the sortable
when the container element itself is replaced; item changes need nothing.

## Proposed core additions

`layoutRect()` / `flip()` would fit in `60-anim.js`; `scrollParents()` could accept an axis filter for auto-scroll.
