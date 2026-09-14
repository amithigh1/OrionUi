# Dropdown & menus — `data-o-toggle="dropdown"`, `<o-dropdown>`, `Orion.menu()`

WAI-ARIA menu button: portaled, flipping menu with keyboard navigation (arrows, Home/End, PageUp/PageDown,
typeahead), submenus (hover intent + Right/Left keys, mirrored in RTL), checkbox and radio items, headers,
dividers, shortcuts, descriptions, danger and disabled items. The renderer and controller are shared with
context menus (`Orion.contextMenu`).

```html
<button class="o-btn" data-o-toggle="dropdown">Actions <o-icon name="chevron-down"></o-icon></button>
<div class="o-dropdown-menu">
  <div class="o-dropdown-header">Account</div>
  <button class="o-dropdown-item"><o-icon name="user"></o-icon> Profile <span class="o-dropdown-kbd">⌘P</span></button>
  <a class="o-dropdown-item" href="/settings"><o-icon name="settings"></o-icon> Settings</a>
  <div class="o-dropdown-sub">
    <button class="o-dropdown-item">Export</button>
    <div class="o-dropdown-menu">
      <button class="o-dropdown-item" data-value="csv">CSV</button>
      <button class="o-dropdown-item" data-value="xlsx">Excel</button>
    </div>
  </div>
  <button class="o-dropdown-item" role="menuitemcheckbox" aria-checked="true" data-o-keep-open>Show grid</button>
  <div class="o-dropdown-divider"></div>
  <button class="o-dropdown-item is-danger">Delete</button>
</div>

<o-dropdown placement="bottom-end">
  <button class="o-btn o-btn-icon" aria-label="More"><o-icon name="more-vertical"></o-icon></button>
  <div class="o-dropdown-menu">…</div>
</o-dropdown>
```

## Triggers

* `data-o-toggle="dropdown"`: the menu is the next sibling `.o-dropdown-menu` or `data-o-target="#menu"`.
  `data-o-placement` sets the placement (default `bottom-start`; `bottom-end` = right-aligned in LTR).
* `<o-dropdown placement disabled>`: first non-menu child = trigger, `.o-dropdown-menu` child = menu.
  `open` attribute / `isOpen` property (reflected; `el.open = true` works). Methods `open(focus?)`, `close()`, `toggle()`.
  `focus`: `'first'｜'last'｜'menu'`.

The menu is moved to the portal (or the open `<dialog>`) while open and put back when it closes.

## Menu markup

| Class / attribute | Description |
|---|---|
| `.o-dropdown-menu` | Menu container (`role="menu"` is added). Hidden unless open. |
| `.o-dropdown-item` | `<button>` or `<a>`; may contain `<o-icon>`, `.o-dropdown-label` + `.o-dropdown-desc`, `.o-dropdown-kbd`. |
| `.is-danger` / `disabled` / `aria-disabled="true"` | Destructive style / disabled (skipped by the keyboard). |
| `role="menuitemcheckbox"｜"menuitemradio"` + `aria-checked` | Checkable items; radios are grouped by `data-o-group` (or per menu). |
| `data-value` | Value reported in `o-select`. |
| `data-o-keep-open` | On an item (or the menu): selecting does not close the menu. |
| `.o-dropdown-header`, `.o-dropdown-divider` | Section title, separator. |
| `.o-dropdown-sub` | Wraps a trigger `.o-dropdown-item` and a nested `.o-dropdown-menu` (submenu). |

## Events (on the trigger for `data-o-toggle`, on `<o-dropdown>` otherwise)

| Event | Cancelable | Detail |
|---|---|---|
| `o-open` | yes | `{ menu }` |
| `o-close` | no | `{ reason }` (`'select'｜'escape'｜'outside'｜'tab'｜'toggle'｜'api'…`) |
| `o-select` | yes (keeps the menu open) | `{ item, el, value, checked }` — `item` is the element (markup) or the item object (`Orion.menu`). |

## `Orion.menu(anchor, items, options) → Promise<item | null>`

`anchor`: an element or a point `{ x, y }` (viewport coordinates). Resolves with the selected item object (the last one
for keep-open items) or `null` when dismissed.

```js
const item = await Orion.menu(button, [
  { type: 'header', label: 'Row' },
  { label: 'Edit', icon: 'edit', shortcut: 'E', onClick: () => edit(row) },
  { label: 'Move to', children: [{ label: 'Archive' }, { label: 'Trash', danger: true }] },
  { type: 'checkbox', label: 'Pinned', checked: true },
  { type: 'radio', group: 'size', label: 'Compact', checked: true }, { type: 'radio', group: 'size', label: 'Comfortable' },
  { type: 'divider' },
  { label: 'Delete', icon: 'trash', danger: true, description: 'Cannot be undone' },
], { placement: 'bottom-end', onSelect: item => console.log(item.label) });
```

Item fields: `{ label, icon, shortcut, description, onClick(item, event), disabled, danger, type: 'item'｜'checkbox'｜'radio'｜'divider'｜'header',
checked, group, children, href, target, value, keepOpen, className, hidden }`. Checkbox/radio `checked` is updated on the object.
`'-'` is a shorthand for a divider.

Options: `{ placement = 'bottom-start', onSelect(item, event), onClose(reason), className, minWidth, focus ('first'｜'last'｜'menu'),
owner (element used for nesting/focus return), eventTarget (element receiving o-select), rtl }`.

Lower level (used by context menus): `Orion.menu.render(items) → HTMLElement`, `Orion.menu.open(menuEl, { anchor, owner, placement,
eventTarget, focus, onSelect, onClose, rtl }) → controller { close(), menu }`.

## Keyboard

| Key | Action |
|---|---|
| `Enter` / `Space` / `↓` on the trigger | Open and focus the first item (`↑`: last item). |
| `↓` `↑` `Home` `End` `PageDown` `PageUp` | Move between items (wraps). |
| Printable characters | Typeahead. |
| `Enter` / `Space` | Activate the item (toggle checkbox/radio). |
| `→` (`←` in RTL) | Open a submenu and focus its first item. |
| `←` (`→` in RTL) | Close the submenu, back to its parent item. |
| `Escape` | Close the current (sub)menu, focus returns to its trigger. |
| `Tab` | Close all menus and move to the next element after the trigger. |

## CSS

`.o-dropdown`, `.o-dropdown-menu` (+ `.o-floating`, `.is-open`, `.is-sub`), `.o-dropdown-item` (`.is-active`, `.is-expanded`, `.is-danger`),
`.o-dropdown-icon .o-dropdown-label .o-dropdown-desc .o-dropdown-kbd .o-dropdown-arrow .o-dropdown-header .o-dropdown-divider .o-dropdown-sub`.
Variables: `--o-menu-pad`, `--o-menu-min-w`, `--o-menu-max-w`.
