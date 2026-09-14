# Drawer — `<o-drawer>` and `Orion.drawer()`

Off-canvas panel sliding in from an edge of the viewport. Extends `<o-modal>` (`O.Modal`) so it shares its
native-`<dialog>` foundation, core `overlays` (Escape, nesting, focus trap, scroll lock, focus return),
events and `Orion.modal._mount` factory plumbing — everything below is what the drawer changes or adds.

```html
<button class="o-btn" data-o-toggle="drawer" data-o-target="#filters">Filters</button>

<o-drawer id="filters" placement="end" size="md" heading="Filters">
  <p>Body content…</p>
  <div slot="footer">
    <button class="o-btn" data-o-dismiss="drawer">Cancel</button>
    <button class="o-btn o-btn-primary" data-o-dismiss="drawer" data-o-value="apply">Apply</button>
  </div>
</o-drawer>
```

## Element `<o-drawer>`

| Attribute / property | Type | Default | Description |
|---|---|---|---|
| `open` (attr) / `isOpen` (prop) | boolean | `false` | Open state (reflected). `el.open = true` also works (frameworks). |
| `heading` | string | `''` | Title text (`<h2>`, used for `aria-labelledby`). |
| `label` | string | `''` | Accessible name when there is no heading. |
| `placement` | `'start'｜'end'｜'top'｜'bottom'` | `'end'` | Edge the panel slides from. Logical (`start`/`end` follow text direction; `end` = right in LTR, left in RTL). |
| `size` | `'sm'｜'md'｜'lg'｜'xl'｜'full'` ｜ any CSS length | `'md'` | `start`/`end`: panel width (18/24/32/44rem/100%). `top`/`bottom`: panel height (30/–/70/85/100vh). A custom value (e.g. `'480px'`) sets both `--o-drawer-size` and `--o-drawer-vsize`. |
| `static` | boolean | `false` | Backdrop click does not close (the panel shakes instead). |
| `closable` | boolean | `true` | Close button, Escape, backdrop click and swipe-to-close. `closable="false"` forces a choice. |
| `backdrop` | boolean | `true` | `backdrop="false"` makes the drawer **modeless**: no dimmed backdrop, the page underneath stays interactive and scrollable, no focus trap or scroll lock. |
| `push` | string | — | Modeless drawer that shifts a target element's margin by the panel width instead of overlaying it. A CSS selector for the target (empty string / no value = `<body>`). Only for `start`/`end`. Implies modeless (no backdrop, page stays usable). |
| `swipe` | boolean | `true` | Touch/pen swipe towards the edge closes the drawer (anywhere on `start`/`end` panels, from the header/handle on `top`/`bottom`). |
| `loading` | boolean | `false` | Overlay spinner over the panel (`aria-busy`). |
| `texts` | object | — | Per-instance strings: `{ close, loading }` (same dictionary as `<o-modal>`). |

Children: every child becomes the **body**; a child with `slot="footer"` (or class `.o-drawer-footer`) goes to the
footer; a child with `slot="header"` replaces the title area (the close button stays). Children added later
(frameworks) are distributed too.

### Methods & properties (same as `<o-modal>`)

| Member | Description |
|---|---|
| `open(trigger?)` | Open. `trigger` is used for nesting and focus return (defaults to the focused element). |
| `close(value?)` | Request close (fires the cancelable `o-before-close`). `value` becomes `returnValue` and event detail. |
| `toggle(trigger?)` | Toggle. |
| `isOpen` | `true` while open (also during the enter animation). |
| `returnValue` | Value of the last close. |
| `dialog`, `panel`, `header`, `body`, `footer` | Internal elements (read-only). |

### Events (identical set to `<o-modal>`; all bubble)

| Event | Cancelable | Detail |
|---|---|---|
| `o-open` | yes (prevents opening) | `{ trigger }` |
| `o-opened` | no | `{}` after the enter animation |
| `o-before-close` | yes (keeps it open) | `{ reason, value }` |
| `o-close` | no | `{ reason, value }` closing starts |
| `o-closed` | no | `{ reason, value }` after the leave animation and focus return |

`reason` adds `'swipe'` to the modal's set (`'escape'｜'backdrop'｜'close-button'｜'dismiss'｜'button'｜'swipe'｜'api'｜'parent'｜'native'｜'disconnect'`).

### Actions

* `data-o-toggle="drawer" data-o-target="#id"` (or `href="#id"`) toggles a drawer.
* `data-o-dismiss="drawer"` closes the nearest `<o-drawer>`; optional `data-o-value="x"` → close value.

### Keyboard & touch

| Input | Action |
|---|---|
| `Tab` / `Shift+Tab` | Cycle focus inside the panel (trapped, unless modeless). |
| `Escape` | Close (when `closable`); inner popups close first. |
| Swipe towards the edge | Close (when `swipe`; a fast flick or dragging past 30% of the panel size commits the close). |

Focus on open: `[autofocus]`/`[data-autofocus]`, else the first focusable in the body, else the panel. Focus
returns to the trigger on close (skipped for modeless/push drawers when focus was already outside).

## `Orion.drawer(options) → handle`

Same handle shape as `Orion.modal()` (`{ el, close(value), result, setTitle, setContent, setLoading, setButtons, body, footer }`),
built with `Orion.modal._mount('o-drawer', options, ...)`.

```js
const d = Orion.drawer({
  title: 'Notifications', placement: 'end', size: 'sm',
  content: '<p>You are all caught up.</p>',
  buttons: [{ text: 'Close', value: null }],
});
const value = await d.result;
```

| Option | Description |
|---|---|
| `title`, `content`, `buttons`, `closable`, `className`, `label`, `backdrop`, `onOpen`, `onClose` | As `Orion.modal()`. |
| `placement` | `'start'｜'end'｜'top'｜'bottom'` (default `'end'`). |
| `size` | As the attribute. |
| `push` | `true` (pushes `<body>`) or a CSS selector; implies modeless. |
| `swipe` | `false` disables swipe-to-close. |

## CSS

Classes: `.o-drawer` (the `<dialog>`), `.o-drawer-{start|end|top|bottom}`, `.o-drawer-backdrop`, `.o-drawer-panel`,
`.o-drawer-header`, `.o-drawer-title`, `.o-drawer-close`, `.o-drawer-body`, `.o-drawer-footer`; state
`.is-modeless .is-closing .is-swiping .o-drawer-{sm|lg|xl|full}`.
Variables: `--o-drawer-size` (width for `start`/`end`), `--o-drawer-vsize` (height for `top`/`bottom`), `--o-drawer-vmax` (max height, default 85vh).

## Frameworks

Same notes as `<o-modal>`: React 19 / Vue / Angular can bind `open` as a property and listen to `o-close`/`o-closed`.
