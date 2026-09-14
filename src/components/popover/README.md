# Popover — `data-o-popover`, `<o-popover>` and `Orion.popover()`

Interactive floating panel anchored to a trigger: arrow, flip/shift, click / hover / focus triggers,
focus moves in for click popovers, closes on outside press and Escape (focus returns to the trigger),
nests with other overlays (a dropdown inside a popover keeps it open).

```html
<button class="o-btn" data-o-popover="Plain text content" data-o-popover-title="Hint">Info</button>
<button class="o-btn" data-o-popover="#share-tpl" data-o-placement="bottom-start">Share</button>
<template id="share-tpl"><input class="o-input" value="https://…"> <button class="o-btn" data-o-dismiss="popover">Done</button></template>

<button class="o-btn" id="filter-btn">Filters</button>
<o-popover for="filter-btn" heading="Filters" placement="bottom-end" close-button>
  <form>…</form>
</o-popover>
```

## Attributes (delegated triggers)

| Attribute | Description |
|---|---|
| `data-o-popover="text ｜ #id"` | Text (escaped), or `#id` of a `<template>` (cloned once) or an element (moved into the popover). |
| `data-o-popover-title` | Title. |
| `data-o-trigger` | `click` (default) ｜ `hover` ｜ `focus`. |
| `data-o-placement` | `bottom` (default) ｜ `top` ｜ `left` ｜ `right` ｜ `start` ｜ `end` + optional `-start`/`-end`. |
| `data-o-popover-close` | Show a close button. |
| `data-o-dismiss="popover"` | On an element inside a popover: closes it. |

## Element `<o-popover>`

| Attribute / property | Type | Default | Description |
|---|---|---|---|
| `for` | string | — | Id of the trigger element. |
| `placement` | string | `'bottom'` | See above. |
| `trigger` | `'click'｜'hover'｜'focus'｜'manual'` | `'click'` | Opening interaction. |
| `heading` | string | — | Title. |
| `close-button` / `closeButton` | boolean | `false` | Close button in the header. |
| `width` | string | — | CSS width of the panel (e.g. `20rem`). |
| `open` (attr) / `isOpen` (prop) | boolean | `false` | State (reflected); `el.open = true` works for frameworks. |

Children are the (interactive) content; they are moved into the portaled panel. Methods: `open()`, `close()`, `toggle()`, `reposition()`.
Properties: `panel` (the floating element). Events on the element: `o-open`, `o-close` `{ reason }`.

## `Orion.popover(trigger, options) → { open, close, toggle, update, destroy, el }`

| Option | Type | Default | Description |
|---|---|---|---|
| `content` | string (trusted HTML) ｜ Node ｜ SafeHTML ｜ `() => Node｜string` | — | Body. Escape user data with `Orion.util.esc`. |
| `title` | string | — | Header title (text). |
| `placement` | string | `'bottom'` | See above. |
| `trigger` | `'click'｜'hover'｜'focus'｜'manual'` | `'click'` | |
| `closeButton` | boolean | `false` | Close button. |
| `width` | string ｜ number | auto (max 22rem) | Panel width (numbers are px). |
| `className` | string | — | Extra class on the panel. |
| `onOpen(handle)`, `onClose(reason)` | function | — | Callbacks. |

`update(options | content)` re-renders and repositions. `destroy()` closes, removes listeners and the panel.
Events `o-open` / `o-close` are also dispatched on the trigger (delegated and API popovers).

## Keyboard

| Key | Action |
|---|---|
| `Enter` / `Space` on the trigger | Toggle (click popovers); focus moves to the first field (or the panel). |
| `Tab` past the last field | Closes and continues to the element after the trigger (`Shift+Tab` from the first returns to the trigger). |
| `Escape` | Close and return focus to the trigger. |

Trigger ARIA: `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`. Panel: `role="dialog"` labelled by its title.

## CSS

`.o-popover` (+ `.o-floating`), `.o-popover-arrow`, `.o-popover-header`, `.o-popover-title`, `.o-popover-close`, `.o-popover-body`.
Variables: `--o-popover-max-w` (22rem).
