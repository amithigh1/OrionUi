# undo

Command-pattern undo/redo. `Orion.UndoManager` is the core stack (execute/push/undo/redo/batch/merge/limit,
keyboard binding); `Orion.undoable()` auto-tracks form-field edits into a manager; `<o-undo-controls>` renders
undo/redo buttons plus a history dropdown bound to a manager by id.

## `Orion.UndoManager` (class, `extends Emitter`)

`new Orion.UndoManager({ id = null, limit = 100, mergeWindow = 800, onChange = null } = {})` — with `id`, registers
the instance in a global registry (`UndoManager.get(id)`) and emits bus `undo:register` (detail = the instance).

### Static

| Member | Description |
|---|---|
| `UndoManager.get(id)` | → `UndoManager \| null`. |

### Getters

| Getter | Type | Notes |
|---|---|---|
| `canUndo` / `canRedo` | `Boolean` | `false` while an async batch/undo/redo step is in flight (`busy`). |
| `pointer` | `Number` | Current stack index (`-1` = before the first entry). |
| `size` | `Number` | Stack length. |
| `applying` | `Boolean` | `true` while running `undo()`/`redo()` side effects (re-entrant pushes are ignored). |
| `undoLabel` / `redoLabel` | `String` | Label of the entry about to be undone/redone. |
| `history` | `Array` | `[{ index, label, time, count, done, current }]`, oldest first. |

### Methods

| Method | Description |
|---|---|
| `execute(cmd)` | Runs `cmd.do()` then `push(cmd)`; returns `do()`'s return value. |
| `push(cmd)` | Records an already-applied command → `this`. `cmd` needs `.undo()` (throws `TypeError` otherwise); optional `.do()`/`.redo()`, `.label`, `.merge` (`true` \| `(prev) => Boolean`), `.mergeKey`. No-op while `applying`. |
| `seal()` | Stop merging into the current entry (e.g. on blur) → `this`. |
| `undo()` | Runs the current entry's commands' `.undo()` in reverse → `false` if `!canUndo`, else `true`/`Promise`. |
| `redo()` | Runs `.redo()` (or `.do()`) forward → `false` if `!canRedo`, else `true`/`Promise`. |
| `goto(index)` | Repeatedly `undo()`/`redo()` until `history[index]` is current (`-1` = before the first) → `Boolean`/`Promise`. |
| `batch(fn)` \| `batch(label, fn)` \| `batch(label)` | Groups multiple `push()`es into one history entry (async `fn` supported; a thrown error rolls back everything pushed so far). `batch(label)` with no `fn` returns an `end()` closer for manual batches. |
| `clear()` | Empties the stack → `this`. |
| `bind(target = document, { allowInInputs } = {})` | Binds `mod+Z` (undo), `mod+Shift+Z` / `mod+Y` (redo) → `unbind()`. `allowInInputs` defaults to `true` when `target !== document`, preserving native undo inside text fields otherwise. |
| `destroy()` | `clear()` + `off()` + removes itself from the `id` registry. |

### Instance events (`.on('change', fn)`)

| Event | Detail |
|---|---|
| `change` | `{ action: 'push'\|'merge'\|'undo'\|'redo'\|'batch'\|'clear'\|'settled', label, canUndo, canRedo, pointer, size, manager }` |

Also invokes the constructor's `onChange` option with the same detail.

### Bus events

| Event | Detail | Notes |
|---|---|---|
| `undo:register` | The `UndoManager` instance itself (not a plain object) | Emitted once per construction, only when `id` is set. |

## `Orion.undoable(target, options = {})`

Returns a `UndoManager`. `target`: selector or element (a form, or any container). Tracks `<input>`, `<textarea>`,
`<select>`, checkboxes, radio groups, `contenteditable`, and Orion `FormElement` controls inside `target` (or
`target` itself if it's a trackable field); elements with `data-o-undo-ignore` are skipped. Throws
`Error('Orion.undoable: target not found')` if `target` doesn't resolve.

| Option | Type | Default | Notes |
|---|---|---|---|
| `manager` | `UndoManager` | — | Reuse an existing manager instead of creating one. |
| `id`, `limit`, `mergeWindow`, `onChange` | — | `limit: 200`, `mergeWindow: 1000` | Passed to the `UndoManager` constructor when `manager` is not given. |
| `bind` | `Boolean` | `true` | Also calls `manager.bind(root, { allowInInputs: true })`. |

Behavior: typed edits into the same field within `mergeWindow` merge into one entry, labeled `"Typing “field”"` /
`"Change “field”"` from the nearest `<label>`/`aria-label`/placeholder/name (or the fieldset `<legend>`/`aria-label`
for radio groups). A native form `reset` becomes one combined undoable step. Sets `root.undoManager = manager` (so
`<o-undo-controls for="rootId">` resolves it via the target's `id`) and adds `manager.untrack()` (stop tracking,
keep the manager), also making `manager.destroy()` call `untrack()` first.

No events beyond what `UndoManager` already emits.

## Elements

### `<o-undo-controls>`

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `for` | `for` | `String` | — | `UndoManager` id, an element id whose `.undoManager` is set (via `Orion.undoable`), or a global variable name holding a `UndoManager`. |
| `manager` | — | `Any` (attr:false) | — | Direct `UndoManager` reference; wins over `for`. |
| `labels` | `labels` | `Boolean` | `false` | Show text labels next to the icons. |
| `size` | `size` | `String` | `'sm'` | `'sm'\|'md'`. |
| `noHistory` | `no-history` | `Boolean` | `false` | Hides the history dropdown button. |
| `texts` | — | `Object` | — | Per-instance text overrides. |

Read-only property: `undoManager` (getter) → the resolved `UndoManager` or `null`. Resolution order for `for`:
`UndoManager.get(id)` → `document.getElementById(id)?.undoManager` → `window[id]` (if it's a `UndoManager`).

#### Methods

| Method | Description |
|---|---|
| `undo()` | Calls the manager's `undo()`; on success emits `o-undo` and announces. |
| `redo()` | Calls the manager's `redo()`; on success emits `o-redo` and announces. |
| `openHistory()` / `closeHistory()` | Opens/closes the history dropdown menu. |

#### Events

| Event | Detail | Cancelable |
|---|---|---|
| `o-undo` | `{ label }` | No |
| `o-redo` | `{ label }` | No |
| `o-goto` | `{ index }` | No — fired after picking a history entry from the dropdown (not fired by "Clear history"). |
