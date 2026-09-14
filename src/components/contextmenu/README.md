# Context menu — `Orion.contextMenu()` and `data-o-context-menu`

Custom right-click menus built on the dropdown menu renderer/controller (same markup, submenus, checkbox/radio
items, keyboard). Opens at the pointer and flips to stay inside the viewport; touch long-press (550 ms); keyboard
with the `ContextMenu` key or `Shift+F10` at the focused element. `Shift` + right-click keeps the browser menu.
Requires the `dropdown` component (declared with `// @deps dropdown`).

```js
// items can be computed per target (delegated selector → works for rows added later)
const off = Orion.contextMenu('#users tbody tr', (event, row) => [
  { type: 'header', label: row.dataset.name },
  { label: 'Edit', icon: 'edit', shortcut: 'E', onClick: () => edit(row.dataset.id) },
  { label: 'Copy email', icon: 'copy' },
  { label: 'Move to', children: [{ label: 'Admins' }, { label: 'Viewers' }] },
  { type: 'divider' },
  { label: 'Delete', icon: 'trash', danger: true },
], { onSelect: (item, row) => console.log(item.label, row) });
off(); // unregister
```

```html
<template id="file-menu">
  <button class="o-dropdown-item" data-value="open"><o-icon name="external-link"></o-icon> Open</button>
  <button class="o-dropdown-item" data-value="rename">Rename <span class="o-dropdown-kbd">F2</span></button>
</template>
<div class="file" tabindex="0" data-o-context-menu="#file-menu">report.pdf</div>
<script>document.addEventListener('o-select', e => console.log(e.target, e.detail.value));</script>
```

## `Orion.contextMenu(target, items, options) → off()`

| Argument | Description |
|---|---|
| `target` | Element, or a CSS selector (delegated from `document`, so future elements work). The innermost match wins. |
| `items` | Item array (see `Orion.menu` in the dropdown README) or `(event, targetEl) => items`. Return `null`/`[]` to let the native menu open. |
| `options.placement` | Placement relative to the pointer (default `bottom-start`, RTL aware). |
| `options.onSelect(item, targetEl, event)` | Selection callback (item `onClick` handlers run too). |
| `options.onOpen(targetEl)`, `options.onClose(reason, targetEl)` | Callbacks. |
| `options.className`, `options.minWidth` | Menu styling. |

## `data-o-context-menu="#id"`

`#id` is a `<template>` (cloned each time; its content may be a `.o-dropdown-menu` or bare items) or an existing
`.o-dropdown-menu` element (moved to the pointer while open, then put back).

## Events (dispatched on the target element)

| Event | Cancelable | Detail |
|---|---|---|
| `o-open` | yes (prevents the menu; the native menu is not shown either) | `{ event, menu? }` |
| `o-select` | yes (keeps the menu open) | `{ item, el, value, checked }` |
| `o-close` | no | `{ reason }` |

## Keyboard

`ContextMenu` / `Shift+F10` opens the menu of the focused element (make custom targets focusable with `tabindex="0"`),
then the dropdown keys apply: arrows, Home/End, typeahead, Enter/Space, `→`/`←` for submenus, `Escape` (focus returns
to the target), `Tab` closes.

## CSS

The menu is a `.o-dropdown-menu.o-context-menu`.
