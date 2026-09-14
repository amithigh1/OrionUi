# Bottom nav — `.o-bottom-nav`

Fixed mobile tab bar: icons + labels, badges, an active indicator, safe-area insets for notched phones, an
optional raised center action button, and a hide-on-scroll option. Renders only below 768px by default.

```html
<nav class="o-bottom-nav" aria-label="Primary">
  <a class="o-bottom-nav-link" href="/"><o-icon name="dashboard"></o-icon><span>Home</span></a>
  <a class="o-bottom-nav-link" href="/search"><o-icon name="search"></o-icon><span>Search</span></a>
  <button class="o-bottom-nav-action" aria-label="New"><o-icon name="plus"></o-icon></button>
  <a class="o-bottom-nav-link" href="/alerts"><o-icon name="bell"></o-icon><span>Alerts</span><span class="o-badge o-badge-counter">3</span></a>
  <a class="o-bottom-nav-link" href="/me"><o-icon name="user"></o-icon><span>Profile</span></a>
</nav>
```

## Markup

| Class / attribute | Description |
|---|---|
| `.o-bottom-nav[data-o-bottom-nav]` | Root (behavior auto-attached). Hidden ≥768px unless `.o-bottom-nav-always`. |
| `.o-bottom-nav-link` | Icon + label tab; `.is-active` / `aria-current="page"` marks the current one. |
| `.o-bottom-nav-action` | Raised circular center action button. |
| `data-o-bottom-nav="manual"` | Disables automatic URL-based active detection. |
| `data-o-bottom-nav-autohide` | Hide on scroll-down, show on scroll-up. |

## Events

| Event | Detail |
|---|---|
| `o-navigate` | `{ href, link }` — the active link changed. |

## JavaScript API — `Orion.bottomNav`

`sync(el?)` · `setActive(el, hrefOrLink)`.

## CSS custom properties

`--o-bottom-nav-h` (default `3.75rem`) and the auto-computed `--o-bottom-nav-space` (already applied as
`padding-bottom` on `.o-app` automatically; add it to your own scroll container if you use the bottom nav
without the app shell).
