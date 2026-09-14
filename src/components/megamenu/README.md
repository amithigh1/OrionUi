# Mega menu — `.o-megamenu`

A full-width, multi-column panel opened from a navbar item: hover-intent on desktop, click and full keyboard
support everywhere, and an automatic inline-accordion fallback on mobile (below 992px, or wherever
`--o-megamenu-mode` is switched to `collapsed`) so it also works inside a collapsed navbar drawer. Declares a
build dependency on `navbar` (its `.o-navbar { position: relative }` is the panel's positioning context).

```html
<li class="o-navbar-item o-megamenu-item">
  <button class="o-navbar-link" type="button" data-o-megamenu-toggle aria-haspopup="true">
    <span>Solutions</span><o-icon name="chevron-down" class="o-navbar-caret"></o-icon>
  </button>
  <div class="o-megamenu">
    <div class="o-megamenu-inner">
      <div class="o-megamenu-col">
        <div class="o-megamenu-heading">Platform</div>
        <a class="o-megamenu-link" href="/analytics"><o-icon name="chart-bar"></o-icon><span><strong>Analytics</strong><small>Understand your users</small></span></a>
      </div>
      <div class="o-megamenu-promo"><h4>What's new</h4><p>…</p><a class="o-btn o-btn-primary o-btn-sm" href="#">Read more</a></div>
    </div>
  </div>
</li>
```

## Markup

| Class / attribute | Description |
|---|---|
| `.o-megamenu-item` | Wraps the trigger and the panel (an `<li>` inside `.o-navbar-nav`). |
| `data-o-megamenu-toggle` | The trigger (`aria-haspopup="true"`; `aria-expanded`/`aria-controls` are managed for you). |
| `.o-megamenu` | The panel — must be the element right after the trigger. |
| `.o-megamenu-inner` | Centering row (matches `--o-container-max`). |
| `.o-megamenu-col`, `.o-megamenu-heading`, `.o-megamenu-link` | A column of links with icon, title, description. |
| `.o-megamenu-promo` | Optional feature card; hidden automatically on the mobile accordion. |

## Events (on the trigger)

| Event | Detail | Description |
|---|---|---|
| `o-open` | — | The panel opened. |
| `o-close` | `{ reason }` | `toggle｜leave｜escape｜outside｜nav｜resize｜replaced`. |

## JavaScript API

`Orion.megamenu.close()` · `Orion.megamenu.isOpen()`.

## Keyboard

| Key | Action |
|---|---|
| Enter / Space | Toggle the panel. |
| ↓ (on the trigger) | Open and focus the first link. |
| ↓ / ↑ (in the panel) | Move between links in document order. |
| ← / → (on a top-level trigger) | Move to the previous/next navbar item (mirrored in RTL). |
| Escape | Close and return focus to the trigger. |
| Tab / click outside | Closes the panel. |
