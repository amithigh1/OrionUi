# Dialogs — `Orion.alert()`, `Orion.confirm()`, `Orion.prompt()`, `data-o-confirm`

Promise-based replacements for `window.alert/confirm/prompt`, built on `Orion.modal` (small, centered layout with a
colored icon badge). `role="alertdialog"` for alert/confirm, labelled by the title and described by the text.
Requires the `modal` component (`// @deps modal`).

```js
await Orion.alert('Your changes were saved.');
if (await Orion.confirm({ title: 'Delete user?', text: 'This cannot be undone.', danger: true, confirmText: 'Delete' })) remove();
const { confirmed, checked } = await Orion.confirm({ text: 'Leave the page?', checkbox: "Don't ask again" });
const name = await Orion.prompt({ title: 'Rename', label: 'New name', value: 'report.pdf', required: true,
  validate: v => /\.pdf$/.test(v) ? null : 'Must end with .pdf' });           // null when cancelled
```

## `Orion.alert(text | options) → Promise<void>`

| Option | Type | Default | Description |
|---|---|---|---|
| `title` | string | — | Title. Without a title, `text` is shown as the title. |
| `text` | string | — | Message (plain text, newlines kept). |
| `html` | string | — | Rich message (sanitized). |
| `type` | `'info'｜'success'｜'warning'｜'danger'｜'question'` | `'info'` | Icon badge and color (`'error'` = `'danger'`). |
| `icon` | string ｜ `false` | per type | Custom icon name, or no icon. |
| `okText` | string | `OK` | Button text. |

## `Orion.confirm(text | options) → Promise<boolean>`

All alert options plus:

| Option | Type | Default | Description |
|---|---|---|---|
| `confirmText` / `cancelText` | string | `Confirm` / `Cancel` | Button texts. |
| `danger` | boolean | `false` | Red confirm button, danger icon, and the **Cancel** button gets focus (Enter = safe choice). |
| `requireText` | string | — | Type-to-confirm: the confirm button stays disabled until the input equals this text. |
| `checkbox` | string | — | Adds a checkbox (e.g. "Don't ask again"); the promise then resolves `{ confirmed, checked }`. |
| `checked` | boolean | `false` | Initial checkbox state. |

Default `type` is `'question'` (`'danger'` when `danger`). Escape / backdrop click resolve `false`.

## `Orion.prompt(text | options) → Promise<string | null>`

| Option | Type | Default | Description |
|---|---|---|---|
| `title`, `text` | string | — | Title and description (a string argument is the title). |
| `label` | string | — | Visible field label (otherwise the title is the accessible name). |
| `value`, `placeholder` | string | — | Initial value / placeholder. |
| `inputType` | string | `'text'` | Any `<input type>` (`email`, `number`, `password`, `url`…). |
| `multiline`, `rows` | boolean, number | `false`, 4 | Use a `<textarea>` (Ctrl/⌘+Enter submits). |
| `required` | boolean | `false` | Empty value shows "This field is required". |
| `validate(value)` | function | — | Return an error string (or a Promise of one) to block submission; `null` = valid. |
| `okText` / `cancelText` | string | `OK` / `Cancel` | Button texts. |
| `type`, `icon` | | none | Optional icon badge. |

Resolves the entered string, or `null` when cancelled.

Every returned promise has a `modal` property (the `Orion.modal` handle) to close it programmatically: `p.modal.close()`.

## `data-o-confirm` behavior

```html
<a href="/users/5/delete" data-o-confirm="Delete this user?" data-o-confirm-type="danger" data-o-confirm-text="Delete">Delete</a>
<button class="o-btn" data-o-confirm="Send the newsletter now?" onclick="send()">Send</button>
<form action="/reset" method="post" data-o-confirm="Reset all settings?" data-o-confirm-title="Reset">…</form>
```

| Attribute | Description |
|---|---|
| `data-o-confirm` | Message (empty → "Are you sure?"). |
| `data-o-confirm-title` | Title (the message becomes the description). |
| `data-o-confirm-type` | `question`, `warning`, `danger` (danger styling + safe focus), `info`, `success`. |
| `data-o-confirm-text` | Confirm button text. |

Clicks (links, buttons) and form submissions are intercepted (capture phase, other handlers do not run) until the
user confirms; then the action continues: the link navigates, the click is re-dispatched (so `onclick`, actions and
submit buttons run), or the form is submitted with the original submitter.

## Keyboard

| Key | Action |
|---|---|
| `Enter` | Activates the focused button (OK / Confirm; Cancel for danger dialogs); submits the prompt field. |
| `Escape` | Cancel (`false` / `null`). |
| `Tab` | Cycles inside the dialog. |

## CSS

`.o-dialog` (on the `<dialog>`), `.o-dialog-{alert|confirm|prompt}`, `.o-dialog-{type}`, `.o-dialog-layout`, `.o-dialog-icon`,
`.o-dialog-title`, `.o-dialog-text`, `.o-dialog-field`, `.o-dialog-check`. On phones the layout is centered and buttons are full width.
