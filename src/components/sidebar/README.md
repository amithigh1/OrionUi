# Sidebar — `.o-sidebar`, `<o-sidebar-menu>`

Navigation tree with a brand, a search filter, sectioned/nested collapsible groups, icons, badges, a footer
user card, a mini icon-rail mode with hover/focus fly-outs, an optional resizable width, and automatic
active-link detection from the URL.

```html
<aside class="o-sidebar" data-o-sidebar aria-label="Main">
  <a class="o-sidebar-brand" href="/"><span class="o-sidebar-brand-mark">…</span><span class="o-sidebar-brand-text">Orion</span></a>
  <div class="o-sidebar-search"><input class="o-input" type="search" placeholder="Search menu…"></div>
  <nav class="o-sidebar-body"><ul class="o-menu">
    <li class="o-menu-heading">Main</li>
    <li class="o-menu-item"><a class="o-menu-link" href="/"><o-icon name="home" class="o-menu-icon"></o-icon><span class="o-menu-label">Home</span></a></li>
    <li class="o-menu-item">
      <button class="o-menu-link o-menu-toggle" type="button"><o-icon name="users" class="o-menu-icon"></o-icon><span class="o-menu-label">Users</span></button>
      <ul class="o-menu-sub" hidden><li class="o-menu-item"><a class="o-menu-link" href="/users">All users</a></li></ul>
    </li>
  </ul></nav>
  <div class="o-sidebar-footer">
    <button class="o-sidebar-user" type="button" data-o-toggle="dropdown" data-o-target="#user-menu">
      <span class="o-avatar o-avatar-sm">AR</span><span class="o-user-info"><span class="o-user-name">Aisha Rahman</span></span>
    </button>
  </div>
</aside>
```

## Markup

| Class / attribute | Description |
|---|---|
| `.o-sidebar[data-o-sidebar]` | Root. `data-o-sidebar="manual"` disables URL active-detection. |
| `.o-sidebar-brand`, `.o-sidebar-search`, `.o-sidebar-body`, `.o-sidebar-footer` | Sections. |
| `.o-sidebar-user` | Footer user-card button — pair with `data-o-toggle="dropdown"` for a menu. |
| `.o-menu`, `.o-menu-heading`, `.o-menu-item`, `.o-menu-link`, `.o-menu-icon`, `.o-menu-label`, `.o-menu-badge`, `.o-menu-dot` | Tree parts. |
| `.o-menu-toggle` + `.o-menu-sub` | A collapsible group (animated open/close via core `collapse()`). |
| `data-o-active="exact｜prefix｜none"` | Per-link (or ancestor) active-matching override. |
| `data-o-sidebar-accordion` | One open group per level. |
| `data-o-sidebar-resizable="min,max"` | Drag handle; width persists to `localStorage`. |
| `.is-mini` | Icon rail — labels become tooltips, submenus become fly-outs. |
| `.o-theme-dark` | Force the dark palette for this sidebar only. |

## `<o-sidebar-menu>` (data-driven)

```html
<o-sidebar-menu current="#/users" items='[
  { "section": "Main" },
  { "label": "Home", "icon": "home", "href": "#/" },
  { "label": "Users", "icon": "users", "badge": 3, "children": [{ "label": "All users", "href": "#/users" }] }
]'></o-sidebar-menu>
```

Item shape: `{ label, icon, href, id, badge, badgeColor, dot, children, active, section, disabled, target, open }`.

| Attribute | Type | Description |
|---|---|---|
| `items` | Array | The tree (see above). |
| `current` | string | Active href/id (prefix-matched); omit to auto-detect from the URL. |
| `accordion` | boolean | One open group per level. |
| `texts` | object | Per-instance string overrides. |

Methods: `expandAll()`, `collapseAll()`, `setCurrent(hrefOrId)`. Event: `o-navigate { item, href, originalEvent }`
(cancelable — `preventDefault()` to hand off to a router).

## Events

| Event | Target | Detail |
|---|---|---|
| `o-menu-toggle` | the `.o-menu-toggle` | `{ open, label }` |
| `o-menu-active` | sidebar / `<o-sidebar-menu>` | `{ link, href, label }` |
| `o-sidebar-resize` | the sidebar | `{ width }` |

## JavaScript API — `Orion.sidebar`

`sync(el?)` · `setActive(el, hrefOrLink)` · `filter(el, query)` · `open(toggle)` / `close(toggle)` ·
`expandAll(el)` / `collapseAll(el)` · `flyout(toggle, { focus, toggle })` / `closeFlyout(refocus?)` · `isMini(el)`.

## Keyboard

| Key | Action |
|---|---|
| ↓ / ↑ | Move between visible links. |
| → (← in RTL) | Open a group / fly-out and move into it. |
| ← (→ in RTL) | Close the group / fly-out, or return to its parent toggle. |
| Home / End | First / last visible link. |
| Escape (search box) | Clear the filter. |

## CSS custom properties

`--o-sidebar-w`, `--o-sidebar-w-mini`, `--o-sidebar-bg`, `--o-sidebar-text`, `--o-header-h`.
