# tree — `<o-tree>` hierarchical tree / file explorer

Nodes, checkboxes, lazy loading, search, drag & drop and virtual scrolling for 10,000+ rows, in one custom
element. Drag & drop is built on this package's low-level [`Orion.dnd.start()`](../dnd/README.md) primitive
directly (not `Orion.sortable`, which only reorders flat siblings) — `// @deps dnd` on the first file.

```html
<o-tree id="tr" checkboxes selection="multiple" draggable filterable filetype></o-tree>
<script>
  tr.nodes = [{ id: 'src', label: 'src', expanded: true, children: [
    { id: 'app', label: 'app.js' }, { id: 'assets', label: 'assets', lazy: true },
  ] }];
  tr.load = async node => fetchChildrenOf(node.id);          // called once per lazy node, on first expand
  tr.addEventListener('o-select', e => console.log(e.detail.node));
</script>
```

## TypeScript reference

```ts
interface TreeNode {
  id?: string; label: string; icon?: string | null; badge?: string | number | null;
  children?: TreeNode[]; expanded?: boolean; checked?: boolean; disabled?: boolean; lazy?: boolean;
  data?: any; [k: string]: any;                    // ids are auto-generated (WeakMap-cached) when omitted
}
type DropPosition = 'before' | 'after' | 'inside';
interface TreeOptions {
  nodes?: TreeNode[];
  selection?: 'none' | 'single' | 'multiple';       // default 'single'
  checkboxes?: boolean;                             // tri-state, automatic parent/child cascade
  filetype?: boolean;                               // folder / open-folder / file-by-extension icons when no `icon`
  filterable?: boolean;                             // built-in search box (or call filter() yourself)
  draggable?: boolean;
  canDrop?: (drag: TreeNode, target: TreeNode, position: DropPosition) => boolean;
  load?: (node: TreeNode) => Promise<TreeNode[]>;   // required for any `lazy: true` node
  renderLabel?: (node: TreeNode, tree: OTree) => string | InstanceType<typeof SafeHTML> | Node;
  rowHeight?: number;                               // px, default 28
  virtual?: 'auto' | 'on' | 'off';                  // default 'auto' (on above 300 visible rows)
  readonly?: boolean;
  texts?: Record<string, string>; label?: string;
}
declare class OTree extends HTMLElement implements TreeOptions {
  getNode(id: string): TreeNode | null;
  addNode(parentId: string | null, node: TreeNode, index?: number): TreeNode;
  updateNode(id: string, patch: Partial<TreeNode>): TreeNode | false;
  removeNode(id: string): boolean;
  setNodes(nodes: TreeNode[]): TreeNode[];
  getChecked(): TreeNode[];       // fully-checked only; a partially-checked group is excluded
  getSelected(): TreeNode[];
  select(id: string, opts?: { toggle?: boolean; range?: boolean; activate?: boolean }): boolean;
  toggle(id: string, expanded?: boolean, opts?: { user?: boolean }): boolean;
  check(id: string, checked?: boolean): boolean;
  rename(id: string): boolean;    // starts inline editing; commit -> cancelable o-rename
  expandAll(id?: string): void; collapseAll(id?: string): void;
  expandTo(id: string): boolean;  // expands every ancestor and scrolls to it
  scrollTo(id: string): boolean;
  filter(query: string): number;  // returns match count
  clearFilter(): number;
}
declare function tree(target: string | Element, options?: Partial<TreeOptions>): OTree; // Orion.tree()
```

## DOM events

| Event | Detail | Notes |
|---|---|---|
| `o-select` | `{ node, id, ctrlKey, shiftKey }` | Click, Enter, or `select()`. |
| `o-toggle` | `{ node, expanded }` | Cancelable. |
| `o-check` | `{ node, checked }` | Fired once for the toggled node; ancestor/descendant cascade updates are silent. |
| `o-rename` | `{ node, value, previous }` | Cancelable — return `false` (or `preventDefault()`) to reject the new name. |
| `o-move` | `{ node, target, position }` | Cancelable. Fired by drag & drop only; `moveCard`-style programmatic move is not (yet) exposed — see Limitations. |
| `o-context` | `{ node, x, y }` | Cancelable. **This is a hook, not a menu** — right-click / long-press / `Shift+F10` fire it; wire up your own menu (a `dropdown`/`menu` package, once available, or any floating panel) in the listener. |
| `o-filter` | `{ query, count }` | After `filter()` / the built-in search box changes. |

## Declarative markup

```html
<o-tree filetype>
  <ul>
    <li data-icon="folder" data-expanded>
      Documents
      <ul><li>Resume.pdf</li><li data-lazy>Old drafts</li></ul>
    </li>
    <li data-checked>Shared with me</li>
  </ul>
</o-tree>
```
Parsed once, on first connect, only when no `nodes` were already set as a property/attribute. Supported
attributes per `<li>`: `data-id`, `data-label` (else the `<li>`'s own text), `data-icon`, `data-badge`,
`data-expanded` (or `open`), `data-checked`, `data-disabled`, `data-lazy`.

## Keyboard

Full WAI-ARIA treeview pattern — see the docs page's keyboard table for the complete list. Highlights:
`↑↓` move focus, `→`/`←` expand-or-descend / collapse-or-ascend (mirrored in RTL), `Home`/`End`, `*` expands
every sibling at the current level, `Enter` selects, `Space` toggles the checkbox (or the selection in
`selection="multiple"`), `F2` renames, single-character typeahead, `Ctrl/Cmd+Click` and `Shift+Click` for
multi-select.

## CSS

`--o-tree-indent` (default `1.25rem`), `--o-tree-row-h`. `.o-tree-scroll`, `.o-tree-row` (`.is-selected`,
`.is-disabled`, `.is-current`), `.o-tree-toggle` (`.is-expanded`, `.is-leaf`), `.o-tree-row-placeholder`
(loading/error/empty), drop indicators `.drop-before` / `.drop-after` / `.drop-inside` / `.is-drop-denied`.

## Rendering model (why virtualization never has a separate "mode")

Every render computes the full flattened list of *visible* rows (ancestors expanded, and — while searching —
kept by the filter), then windows it: only the rows near the scroll viewport become real DOM nodes, reconciled
by id with `patchList` so nodes are reused while scrolling. `virtual="auto"` just changes how big that window
is — for a small tree the window covers every row, so there is no separate "non-virtual" code path to keep in
sync. Keyboard navigation, search, drag & drop and `scrollTo()` all work against the same logical row list, so
they behave identically whether or not virtualization is actually kicking in.

## Limitations / known gaps

* **Expand is animated (a short reveal on the newly-shown rows); collapse is instant.** Because rows are a flat,
  windowed list rather than real nested `<ul>` containers, there is no single element whose height can be
  animated closed the way `collapse()` does elsewhere — animating a *closing* windowed list without visible
  jank needs a second render pass (freeze the doomed rows, animate, then actually remove them) that didn't fit
  this pass. Expand gets the animation because the reveal can just play on the rows once they exist.
* `o-move` only fires from a drag; there is no `moveNode(id, targetId, position)` convenience method yet
  (compose it from `getNode` + `addNode`/`removeNode` in the meantime).
* `o-context` is intentionally just a hook (no built-in menu), since a menu/dropdown package is out of this
  package's scope — see the docs page for wiring it up.
* Multi-select range (`Shift+Click`) only extends from the last **clicked** row, not the last **keyboard**-moved
  row; `Shift+Arrow` range selection isn't implemented.

## Proposed core additions

Same as [`kanban`](../kanban/README.md): the `.o-c-{color}` "current color context" utility classes documented in
ARCHITECTURE.md §8 don't exist in core yet. This package only uses raw `icon`/`color` values (no semantic
tokens) for tree nodes, so it doesn't need its own copy — but it's the same gap kanban hits.
