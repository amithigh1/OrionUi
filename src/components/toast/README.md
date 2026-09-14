# Toast — `Orion.toast()`

Non-blocking notifications: six logical positions (RTL aware), stacked cards that expand on hover/focus,
timers that pause on hover/focus and while the tab is hidden, swipe to dismiss on touch, countdown bar,
action button, in-place updates by `id`, promise tracking. Full width on phones.
Toasts stay usable above open modals (the container follows the top-most modal `<dialog>`).

```js
Orion.toast('Saved');
Orion.toast.success('Profile updated', { title: 'Done' });
const t = Orion.toast({ type: 'loading', text: 'Uploading…', id: 'upload' });
t.update({ type: 'success', text: 'Uploaded', duration: 3000 });
Orion.toast({ text: 'Message archived', action: { text: 'Undo', onClick: () => restore() } });
await Orion.toast.promise(save(), { loading: 'Saving…', success: r => `Saved ${r.name}`, error: e => e.message });
```

## `Orion.toast(text | options, extraOptions?) → handle`

| Option | Type | Default | Description |
|---|---|---|---|
| `text` | string ｜ Node | — | Message (text, escaped). |
| `html` | string | — | Rich message (sanitized with `Orion.sanitize`). |
| `title` | string | — | Bold first line. |
| `type` | `'success'｜'error'｜'warning'｜'info'｜'loading'｜'default'` | `'default'` | Icon, color and politeness (`error` → `role="alert"`, assertive). |
| `duration` | number (ms) | config (4000; errors ×1.5) | `0` = sticky. `loading` is sticky by default. |
| `position` | `'top-start'｜'top-center'｜'top-end'｜'bottom-start'｜'bottom-center'｜'bottom-end'` | config (`'top-end'`) | Logical: `start`/`end` follow the text direction. |
| `action` | `{ text, onClick(handle, event) }` | — | Button; the toast closes after the click unless `onClick` returns `false`. |
| `closable` | boolean | `true` (`false` for `loading`) | Close button. |
| `progress` | boolean | `false` | Countdown bar (pauses with the timer). |
| `icon` | string ｜ `false` | per type | Icon name (see `Orion.icons`), raw `<svg>` string, or `false`. |
| `id` | string | auto | A toast with the same id is **updated** instead of duplicated. |
| `className` | string | — | Extra class on the `.o-toast`. |
| `onClose(reason)` | function | — | `reason`: `'timeout'｜'close'｜'action'｜'swipe'｜'escape'｜'overflow'｜'api'｜'clear'`. |

**Handle**: `{ id, el, update(options), close() }`. `update()` merges options, re-renders in place and restarts the timer.

## Shortcuts & helpers

| Function | Description |
|---|---|
| `toast.success(text, opts)` `toast.error()` `toast.warning()` `toast.info()` `toast.loading()` | Typed toasts. |
| `toast.promise(promiseOrFn, { loading, success, error }, opts?) → Promise` | Loading toast updated on settle. Messages are strings, option objects or functions of the result/error (return `null` to close). Returns the original promise. |
| `toast.close(id)` | Close by id. |
| `toast.clear()` | Close every toast. |
| `toast.config({ position, max, duration, expand, gap, visible })` | Defaults: `top-end`, `max` 5 toasts kept per position, `duration` 4000, `expand` false (true = always a list), `gap` 10px, `visible` 3 cards in the collapsed stack. Returns the config. |

## Keyboard & accessibility

| Key | Action |
|---|---|
| `Alt+T` | Focus the newest toast. |
| `Tab` | Move through toast buttons (the stack expands while focused). |
| `Escape` | Close the focused toast. |

Each toast has `role="status"` (`role="alert"` for errors) inside a labelled region. Timers pause while hovered,
focused or when the page is hidden.

## CSS

`.o-toasts .o-toasts-{position}`, `.o-toast .o-toast-{type}`, `.o-toast-icon .o-toast-content .o-toast-title .o-toast-text
.o-toast-action .o-toast-close .o-toast-progress`. Variables: `--o-toast-w` (width, 22rem), `--o-toast-offset` (edge distance, 1rem).
