# Layout — `.o-app` responsive shell

CSS grid shell (sidebar · header · main · footer) with three responsive modes read from `--o-app-mode`:
desktop (full sidebar, `.is-collapsed` → mini rail), tablet (mini rail, the toggle opens it as an overlay),
mobile (off-canvas drawer with a backdrop and swipe gestures). `data-o-app` is added to every `.o-app`
automatically and wires state restoration, the backdrop, the header scroll shadow and swipe.

```html
<div class="o-app">
  <a class="o-skip-link" href="#main">Skip to main content</a>
  <aside class="o-app-sidebar o-sidebar" data-o-sidebar aria-label="Main">…</aside>
  <header class="o-app-header">
    <button class="o-btn o-btn-ghost o-btn-icon o-app-toggle" data-o-toggle="sidebar" aria-label="Toggle sidebar"><o-icon name="panel-left-close"></o-icon></button>
    <div class="o-app-header-end">…</div>
  </header>
  <main class="o-app-main" id="main"><div class="o-app-content">…</div></main>
  <footer class="o-app-footer">…</footer>
</div>
```

## Variants

| Class | Description |
|---|---|
| `.o-app-horizontal` | Top navbar layout; the sidebar (if present) is a drawer at every width. |
| `.o-app-compact` | Smaller sidebar/header sizes, tighter gutters. |
| `.o-app-boxed` | Centers the shell with a max width and a border. |
| `.o-app-sidebar-end` | Sidebar on the end side (right in LTR, left in RTL). |
| `.o-app-fixed` | Shell fills the viewport; only `.o-app-main` scrolls. |
| `.o-app-no-mini` | Skip the tablet mini-rail step (behaves like mobile below desktop). |
| `.o-app-content-boxed` / `.o-app-content-narrow` | Constrain `.o-app-content` width. |
| `.o-app-header-blur` | Translucent, blurred sticky header. |
| `.is-collapsed` / `.is-mobile-open` | Desktop mini-rail / drawer-open state. |

## Actions

`data-o-toggle="sidebar" [data-o-target="#app"]` — mode-aware toggle. `data-o-dismiss="sidebar"` — close the drawer.

## JavaScript API — `Orion.layout`

| Member | Description |
|---|---|
| `toggleSidebar(app?, trigger?)` | Collapse/expand (desktop) or open/close the drawer (tablet/mobile). |
| `collapse(app?, { persist })` / `expand(app?, { persist })` | Desktop mini-rail state. |
| `openMobile(app?, trigger?)` / `closeMobile(app?)` | Off-canvas drawer. |
| `mode(app?)` | `'desktop' \| 'tablet' \| 'mobile'`. |
| `isCollapsed(app?)` / `isOpen(app?)` | Current state. |
| `setPageTitle(title, breadcrumbs?)` | Updates `document.title`, `[data-o-page-title]`, `[data-o-page-breadcrumb]`, and announces it. |
| `sync()` | Re-run active-link detection after an SPA navigation that skipped `popstate`. |
| `titleTemplate` | e.g. `'%s · Acme'`. |

`app` accepts an element, selector, or nothing (first `.o-app` on the page).

## Events

| Event | Target | Detail |
|---|---|---|
| `o-sidebar-toggle` | `.o-app` | `{ state: 'collapsed'\|'expanded'\|'open'\|'closed', mode, collapsed, open }` |
| `o-page-title` | `document` | `{ title, breadcrumbs }` |

## CSS custom properties

`--o-sidebar-w`, `--o-sidebar-w-mini`, `--o-header-h`, `--o-app-gutter`, `--o-app-boxed-max`, `--o-content-max`.
