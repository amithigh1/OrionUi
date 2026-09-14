# clipboard

Copy/read/paste helpers with an `execCommand` fallback for browsers without the async Clipboard API, visual + ARIA
copy feedback, the `data-o-action="copy"` action, and the `<o-copy>` element (icon-button, labeled-button, or
input-with-button variants).

## `Orion.clipboard`

| Member | Description |
|---|---|
| `supported` | Getter → `Boolean`. |
| `canRead` | Getter → `Boolean` (`navigator.clipboard.read` available). |
| `copy(data)` | `data`: `String`, `{ text, html }`, `Blob`, or `Element` (copies its form value or visible text) → `Promise<Boolean>`. Tries `navigator.clipboard.write`/`writeText` first (a `ClipboardItem` carrying both text/html parts when `html` is given and supported), then falls back to a hidden `contenteditable`/`textarea` + `document.execCommand('copy')`. |
| `readText()` | → `Promise<String>` (`''` if blocked/unsupported). |
| `read()` | → `Promise<{ text, html, files, images }>`. Needs clipboard-read permission; `files`/`images` are non-text clipboard items wrapped as `File`s. |
| `onPaste(target, handler({ text, html, files, images, event }), { preventDefault = false } = {})` | `target`: selector/Element/omitted (→ `document`) → `off()`. Pasted image/file items without a useful name are renamed `pasted-<timestamp>[-n].<ext>`. Returning `false` from `handler` (or `preventDefault: true`) suppresses the native paste. |
| `feedback(el, ok = true, text?)` | Shows a "Copied!"/"Copy failed" confirmation on `el`: swaps a `.o-icon-copy`/`o-icon[name="copy"\|"link"]` child for a check icon for 1.6s, uses `Orion.tooltip.flash()` if tooltips are loaded (else a self-contained `.o-copy-bubble` popup), and calls `announce()`. |

## DOM events

| Event | Target | Detail | Cancelable |
|---|---|---|---|
| `o-before-copy` | The `data-o-action="copy"` trigger | `{ data }` (`data` is a `String` or `{ text, html }`) | Yes — `preventDefault()` aborts the copy. |
| `o-copy` | The `data-o-action="copy"` trigger | `{ text, success }` (`text` is always a plain `String`) | No |

## Behaviors

### `data-o-action="copy"`

Applies to a button/trigger.

| Sub-attribute | Notes |
|---|---|
| `data-o-value` / `data-o-copy` | Literal text to copy (takes priority over `data-o-target`). |
| `data-o-target` | Selector; copies the target's form value or visible text. |
| `data-o-copy-html` | Presence — when copying from a target, also copies its `innerHTML` as the HTML clipboard flavor. |
| `data-o-copied` | Custom feedback message, else the localized "Copied!"/"Copy failed". |

Dispatches `o-before-copy` (cancelable), then performs `clipboard.copy()`, calls `clipboard.feedback()`, and
dispatches `o-copy`.

## Elements

### `<o-copy>`

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | `String` | — | Literal text to copy (takes priority over `target`). |
| `target` | `target` | `String` | — | Selector; read its value/text when `value` is empty. |
| `variant` | `variant` | `String`, reflect | `'icon'` | `'icon'\|'button'\|'input'`. |
| `label` | `label` | `String` | — | Button text / accessible label. |
| `size` | `size` | `String` | — | `'sm'\|'lg'`. |
| `texts` | — | `Object` | — | |

Read-only property: `text` (getter) → the `String` that would be copied. Method: `copy()` → `Promise<Boolean>`.

#### Events

| Event | Detail | Cancelable |
|---|---|---|
| `o-before-copy` | `{ text }` | Yes |
| `o-copy` | `{ text, success }` | No |
