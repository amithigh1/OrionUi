# Navbar — `.o-navbar`

Responsive top bar: brand, links with dropdown menus, a search box, action icons and a user menu. Collapses
into a hamburger drawer below 992px. Dropdowns reuse the `dropdown` component's `data-o-toggle="dropdown"`
(declared as a build dependency, so it is always bundled with the navbar).

```html
<nav class="o-navbar" aria-label="Main">
  <div class="o-navbar-inner">
    <a class="o-navbar-brand" href="/">Orion Admin</a>
    <button class="o-navbar-toggle" data-o-toggle="navbar" data-o-target="#nav-main" aria-controls="nav-main" aria-expanded="false" aria-label="Menu"><o-icon name="menu"></o-icon></button>
    <div class="o-navbar-collapse" id="nav-main">
      <ul class="o-navbar-nav">
        <li class="o-navbar-item"><a class="o-navbar-link is-active" href="/" aria-current="page">Dashboard</a></li>
        <li class="o-navbar-item">
          <button class="o-navbar-link" type="button" data-o-toggle="dropdown"><span>Products</span><o-icon name="chevron-down" class="o-navbar-caret"></o-icon></button>
          <div class="o-dropdown-menu"><a class="o-dropdown-item" href="/products">Catalog</a></div>
        </li>
      </ul>
      <label class="o-navbar-search"><o-icon name="search"></o-icon><input class="o-input" type="search" placeholder="Search…"></label>
    </div>
    <div class="o-navbar-actions">
      <button class="o-header-user" data-o-toggle="dropdown" data-o-target="#user-menu">…</button>
      <div class="o-dropdown-menu" id="user-menu">…</div>
    </div>
  </div>
</nav>
```

## Markup

`.o-navbar[data-o-navbar]` (root, behavior auto-attached) · `.o-navbar-inner` (centering row,
`--o-navbar-max`) · `.o-navbar-brand` · `.o-navbar-toggle` · `.o-navbar-collapse` · `.o-navbar-nav` /
`-item` / `-link` (`.o-navbar-caret` rotates with `[aria-expanded="true"]`) · `.o-navbar-search` ·
`.o-navbar-actions`.

## Variants

| Class / attribute | Description |
|---|---|
| `.o-navbar-sticky` | `position: sticky` convenience class. |
| `.o-navbar-transparent` | See-through until `.is-scrolled`. |
| `data-o-navbar-autohide` | Hide on scroll-down, reveal on scroll-up (never while the drawer is open or focus is inside). |

## Actions

`data-o-toggle="navbar" [data-o-target="#collapse"]` — hamburger toggle.

## Events

| Event | Detail |
|---|---|
| `o-navbar-toggle` | `{ open }` — the mobile drawer opened/closed. |

## JavaScript API — `Orion.navbar`

`toggle(el?)` / `open(el?)` / `close(el?)` / `isOpen(el?)`.

## CSS custom properties

`--o-navbar-h` (defaults to `--o-header-h`), `--o-navbar-max`, `--o-navbar-mode` (read-only: `full` or `collapsed`).

## Frameworks

Mounted the same way as any markup; the collapse/scroll/autohide behaviors attach via a shared
`MutationObserver`, so a navbar rendered by React/Vue/Angular after the initial load still works. Nested
dropdowns are documented with the `dropdown` component.
