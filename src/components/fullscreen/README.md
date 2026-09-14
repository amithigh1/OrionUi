# fullscreen

Wraps the Fullscreen API with an automatic CSS "pseudo fullscreen" fallback (used on iOS Safari, when the request
is refused, or there's no active user gesture), keeping a consistent `isActive`/`element` API and `.o-is-fullscreen`
styling either way. Ships the `data-o-action="fullscreen"` action, which also keeps a trigger's icon/`aria-pressed`/
label in sync with the current state. No custom element.

## `Orion.fullscreen`

| Member | Description |
|---|---|
| `supported` | Getter → `Boolean` (native Fullscreen API available). |
| `element` | Getter → `Element \| null`, the fullscreen element (native or pseudo). |
| `isActive` | Getter → `Boolean`. |
| `pseudo` | Getter → `Boolean`, true when in the CSS fallback (not native) fullscreen. |
| `enter(target = document.documentElement, { pseudo = false, navigationUI = 'hide' } = {})` | → `Promise<Boolean>` (always resolves `true`). Exits any current fullscreen first; tries the native API unless `pseudo: true`, unsupported, or there's no active user gesture (`navigator.userActivation`), falling back to pseudo fullscreen on refusal or when forced. |
| `exit()` | → `Promise<void>`. Exits native or pseudo fullscreen, whichever is active. |
| `toggle(target, options)` | → `Promise<Boolean>`, the new `isActive` state. |
| `onChange(fn({ active, element, pseudo }))` | → `off()`. Internal `Emitter`. |

Pseudo-fullscreen is built on `overlays.open()` (Escape closes it; scroll-locks the page unless the target is
`<html>`/`<body>`), adds `.o-pseudo-fullscreen` (plus `.o-is-fullscreen`) and a temporary `tabindex="-1"` if the
element wasn't otherwise focusable, then focuses it.

## CSS

`.o-is-fullscreen` on the active element (native or pseudo); `html.o-has-fullscreen` while anything is fullscreen.

## Events

| Event | Channel | Detail | Notes |
|---|---|---|---|
| `change` | `Orion.fullscreen.onChange(fn)` (internal `Emitter`) | `{ active, element, pseudo }` | |
| `fullscreen:change` | Bus (`Orion.on('fullscreen:change', fn)`) | Same shape | |
| `o-fullscreen` | DOM `CustomEvent` | Same shape | Dispatched on the fullscreen `element` when entering; on `document` when exiting (no element). Bubbles/composed via the plain `emit()` DOM helper — not a custom-element event. |

## Behaviors

### `data-o-action="fullscreen"`

Applies to a button, typically containing `<o-icon name="maximize">` or `.o-icon-maximize`.

| Sub-attribute | Notes |
|---|---|
| `data-o-target` | Selector — the element to fullscreen; defaults to `document.documentElement` (the whole page). |

Automatically swaps the icon (`maximize` ↔ `minimize`, matching either `<o-icon>` or `.o-icon-maximize`/
`.o-icon-minimize`), sets `aria-pressed` and `.is-active`, and updates `aria-label`/`title`/a
`[data-o-fullscreen-label]` child's text to "Fullscreen"/"Exit fullscreen" — repainted for every such trigger
whenever fullscreen state changes anywhere on the page.
