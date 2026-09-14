# Modal — `<o-modal>` and `Orion.modal()`

Accessible modal dialog built on a native `<dialog>` opened with `showModal()` (top layer: never clipped by
`overflow`/`transform` ancestors; floating panels of other components are portaled into it by core `portal()`).
Uses core `overlays` for Escape, nesting, focus trap and scroll lock.

```html
<button class="o-btn" data-o-toggle="modal" data-o-target="#edit">Edit</button>

<o-modal id="edit" heading="Edit user" size="lg" centered>
  <p>Body content…</p>
  <div slot="footer">
    <button class="o-btn" data-o-dismiss="modal">Cancel</button>
    <button class="o-btn o-btn-primary" data-o-dismiss="modal" data-o-value="save">Save</button>
  </div>
</o-modal>
```

## Element `<o-modal>`

| Attribute / property | Type | Default | Description |
|---|---|---|---|
| `open` (attr) / `isOpen` (prop) | boolean | `false` | Open state (reflected). `el.open = true` also works (frameworks). |
| `heading` | string | `''` | Title text (rendered as `<h2>`, used for `aria-labelledby`). |
| `label` | string | `''` | Accessible name when there is no heading. |
| `size` | `'sm'｜'md'｜'lg'｜'xl'｜'full'` | `'md'` | Width: 25rem, 35rem, 50rem, 71.25rem, 100%. |
| `static` | boolean | `false` | Backdrop click does not close (the dialog shakes instead). |
| `centered` | boolean | `false` | Vertically centered (default: near the top). |
| `scrollable` | boolean | `false` | Body scrolls inside the dialog (header/footer stay visible). Default: the whole dialog scrolls. |
| `fullscreen` | `'sm'｜'md'｜'lg'｜'always'` | — | Edge-to-edge below the breakpoint (576/768/992px) or always (`fullscreen` with no value = always). |
| `closable` | boolean | `true` | Close button, Escape and backdrop click. `closable="false"` forces a choice. |
| `draggable` | boolean | `false` | Move the dialog by its header (mouse/pen/touch). |
| `backdrop` | boolean | `true` | `backdrop="false"` hides the dimmed backdrop (the dialog stays modal). |
| `loading` | boolean | `false` | Overlay spinner over the dialog (`aria-busy`). |
| `texts` | object | — | Per-instance strings: `{ close, loading }`. |

Children: every child becomes the **body**; a child with `slot="footer"` (or class `.o-modal-footer`) goes to the
footer; a child with `slot="header"` replaces the title area (the close button stays). Children added later
(frameworks) are distributed too. In React, prefer one stable wrapper element per slot.

### Methods & properties

| Member | Description |
|---|---|
| `open(trigger?)` | Open. `trigger` is used for nesting and focus return (defaults to the focused element). |
| `close(value?)` | Request close (fires the cancelable `o-before-close`). `value` becomes `returnValue` and event detail. |
| `toggle(trigger?)` | Toggle. |
| `isOpen` | `true` while open (also during the enter animation). |
| `returnValue` | Value of the last close. |
| `dialog`, `panel`, `header`, `body`, `footer` | Internal elements (read-only). |

### Events (all bubble — check `e.target` when modals are nested)

| Event | Cancelable | Detail |
|---|---|---|
| `o-open` | yes (prevents opening) | `{ trigger }` |
| `o-opened` | no | `{}` after the enter animation |
| `o-before-close` | yes (keeps it open) | `{ reason, value }` |
| `o-close` | no | `{ reason, value }` closing starts |
| `o-closed` | no | `{ reason, value }` after the leave animation and focus return |

`reason`: `'escape'｜'backdrop'｜'close-button'｜'dismiss'｜'button'｜'api'｜'parent'｜'native'｜'disconnect'`.
`'parent'` (a parent overlay closed) and `'disconnect'` cannot be vetoed.

### Actions

* `data-o-toggle="modal" data-o-target="#id"` (or `href="#id"`) toggles a modal.
* `data-o-dismiss="modal"` closes the nearest `<o-modal>`; optional `data-o-value="x"` → close value.
* A `<form method="dialog">` inside the modal closes it natively with the submitter's value (reason `'native'`).

### Keyboard

| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Cycle focus inside the dialog (trapped). |
| `Escape` | Close (when `closable`); inner popups close first. |

Focus on open: `[autofocus]`/`[data-autofocus]`, else the first focusable in the body, else the dialog panel.
Focus returns to the trigger on close.

## `Orion.modal(options) → handle`

```js
const m = Orion.modal({
  title: 'Invite member',
  content: '<form>…</form>',              // string (trusted HTML) | Node | () => Node | SafeHTML
  size: 'md', centered: true, scrollable: false, fullscreen: 'sm', draggable: false,
  backdrop: true,                           // true | 'static' | false
  closable: true, className: 'my-modal', label: '',
  buttons: [
    { text: 'Cancel', value: null },
    { text: 'Send', variant: 'primary', submit: true, onClick: async (handle, event, formData) => api.invite(formData) },
  ],
  onOpen(handle) {}, onClose(value, reason) {},
});
const value = await m.result;
```

Button options: `{ text, variant ('primary'｜'danger'｜'outline-primary'｜'ghost'…), value, close = true, onClick(handle, event, data),
submit (validate the first `<form>` in the body and pass its data), icon, autofocus, disabled, className }`.
`onClick` may return `false` (stay open), a value (used as close value when `value` is not set) or a Promise
(the button shows a spinner until it settles; resolving `false` or rejecting keeps the dialog open).
**Pitfall:** a bare `return` (i.e. `undefined`) still closes the dialog. A handler that validates a form and closes the
dialog itself — `if (!(await v.validate())) return; …; handle.close();` — must set `close: false` on the button, or
return `false` on the failure path.
Pressing Enter in the form triggers the `submit` button. The element is removed from the DOM after it closes.

Resolved value: `button.value` if set, else the form data object (`submit`), else what `onClick` returned; `undefined` when dismissed.

| Handle member | Description |
|---|---|
| `el` | The `<o-modal>` element. |
| `close(value?)` | Close the modal. |
| `result` | `Promise<value>` resolved after the modal has closed. |
| `setTitle(text)`, `setContent(content)`, `setLoading(bool)`, `setButtons(buttons)` | Update in place. |
| `body`, `footer` | Body / footer elements. |

## CSS

Classes: `.o-modal` (the `<dialog>`), `.o-modal-backdrop`, `.o-modal-wrap`, `.o-modal-panel`, `.o-modal-header`,
`.o-modal-title`, `.o-modal-close`, `.o-modal-body`, `.o-modal-footer`; state `.is-centered .is-scrollable
.is-fullscreen .is-draggable .is-closing .o-modal-{size} .o-modal-fs-{bp}`.
Variables: `--o-modal-w` (panel width), `--o-modal-gutter` (viewport margin), `--o-modal-radius`.
