# Tooltip — `data-o-tooltip` and `Orion.tooltip()`

Delegated tooltips: works for every current and future element (any framework), one shared tooltip element,
arrow, flip/shift inside the viewport, hover + keyboard focus with delay, touch long-press, hides on scroll,
Escape and pointer press, `aria-describedby` while visible. Hoverable (WCAG 1.4.13).

```html
<button class="o-btn" data-o-tooltip="Save changes">Save</button>
<button class="o-btn o-btn-icon" data-o-tooltip="Delete" data-o-placement="bottom"><o-icon name="trash"></o-icon></button>
<span class="o-truncate" style="max-width:10rem" data-o-tooltip="auto">A very long file name that gets cut.pdf</span>
<button class="o-btn" data-o-tooltip-html="<b>Bold</b> and <em>rich</em>">Rich</button>
```

## Attributes

| Attribute | Description |
|---|---|
| `data-o-tooltip="text"` | Tooltip text. `"auto"` shows the element's full text **only when it is truncated** (ellipsis / line clamp). |
| `data-o-tooltip-html="…"` | Rich content, sanitized with `Orion.sanitize` (wins over `data-o-tooltip`). |
| `data-o-placement` | `top` (default) ｜ `bottom` ｜ `left` ｜ `right` ｜ `start` ｜ `end`, optionally `-start`/`-end` (e.g. `bottom-start`). Flips when there is no room. |
| `data-o-tooltip-delay` | Show delay in ms for hover (default 300; 0 right after another tooltip closed). |

Icon-only elements without an accessible name get `aria-label` = the tooltip text automatically.
Disabled buttons fire no pointer events: wrap them (`<span data-o-tooltip="…"><button disabled>`).

## `Orion.tooltip(el, text | options) → { show, hide, update, destroy }`

| Option | Type | Default | Description |
|---|---|---|---|
| `content` | string ｜ Node ｜ SafeHTML ｜ `(el) => string` | — | Text (escaped); a `SafeHTML` (`Orion.util.html\`\``) or Node is inserted as is. |
| `html` | boolean | `false` | Treat a string `content` as HTML (sanitized). |
| `placement` | string | `'top'` | As `data-o-placement`. |
| `trigger` | `'hover'｜'focus'｜'click'｜'manual'` | `'hover'` | `hover` = hover + keyboard focus; `click` toggles and closes on outside press/Escape; `manual` = only through the handle. |
| `delay` | number | 300 | Hover show delay (ms). |

Handle: `show()`, `hide()`, `update(content)`, `destroy()` (removes listeners and the tooltip), `el` (the tooltip element when shown via `click`/`manual`).
Programmatic tooltips override `data-o-tooltip` on the same element.

## Keyboard & touch

| Input | Action |
|---|---|
| `Tab` focus (keyboard) | Shows the tooltip immediately. |
| `Escape` | Hides it. |
| Long-press (touch) | Shows it; hides 1.5 s after release. |

## CSS

`.o-tooltip` (`role="tooltip"`, `data-placement`), `.o-tooltip-inner`, `.o-tooltip-arrow`. Variables: `--o-tooltip-bg`,
`--o-tooltip-fg`, `--o-tooltip-max-w`. Z-index `Z.tooltip` (1300). Inverse colors (dark on light, light on dark).
