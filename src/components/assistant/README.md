# assistant — `<o-chatbot>` and `<o-assistant>`

`<o-chatbot>`: a floating launcher + chat window (or an inline panel) with streamed Markdown replies, suggested
prompts, per-message copy/regenerate/feedback actions, file-context attachment, `localStorage` persistence and
transcript export. `<o-assistant>`: a resizable side panel with context actions (summarize this page, explain
the selection, draft a reply, plus your own templates) that stream a result and can insert/replace it back into
whatever field or selection you had focused. Both stream from the `ai` package's `Orion.ai` — configure a
provider (or pass a per-instance `provider`) before using either; without one, both show a clear error bubble
via `Orion.ai`'s own "no provider configured" error rather than failing silently.

Docs: `docs/components/chatbot.html`. Realistic example: `docs/examples/ai-helpdesk.html`.

## Files

| File | Contents |
|---|---|
| `00-shared.js` | i18n strings, `trackLastFocused` (last editable element outside the panel, for Insert/Replace), `insertIntoTarget`, `currentSelectionText`, `copyText`, `runStream` (drives `Orion.ai.stream` with a throttled render callback + success/abort/error normalization) |
| `10-chatbot.js` | `<o-chatbot>` |
| `20-assistant.js` | `<o-assistant>` |
| `assistant.css` | Both elements' styling. `.o-chatbot-bubble`/`.o-chatbot-actions` are this package's own names — **not** `.o-chat-bubble`/`.o-chat-actions`, which the `chat` package owns (a different, incompatible shape); every other chat-bubble-related class here (`.o-chat-msg`, `.o-chat-avatar`, `.o-chat-content`, `.o-chat-error`, `.o-chat-action-*`) is unique to this package today (`build/audit.mjs` reports no collision), but is not yet `.o-chatbot-*`-prefixed — a cosmetic follow-up, not a functional issue |

## `<o-chatbot>`

```html
<o-chatbot title="Support" welcome="Hi! How can I help?" launcher persist="support"
  suggestions='["How do I export to CSV?", "Can columns be resized?"]'></o-chatbot>
<script>
  Orion.ai.configure({ provider: Orion.ai.http({ url: '/api/ai/chat', stream: 'sse' }) });
</script>
```

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `title` | `title` | string | `''` | Header title (falls back to a localized "Assistant"). |
| `welcome` | `welcome` | string | `''` | First assistant bubble, shown once, before any user message. |
| `suggestions` | `suggestions` | `(string \| { label, prompt })[]` | `[]` | Chips shown until the first user message; JSON in the attribute. |
| `launcher` | `launcher` | boolean | `true` | `false` renders inline (always open, no floating button). |
| `position` | `position` | `bottom-end \| bottom-start \| top-end \| top-start` | `bottom-end` | Launcher/window corner. |
| `persist` | `persist` | boolean \| string | `false` | Remember the conversation in `localStorage` (`orion:chatbot:<id or key>`). |
| `avatar` | `avatar` | string | `''` | Icon name, or an image URL (detected by a leading `http(s):`/`data:`/`./`/`/`). |
| `isOpen` | `open` | boolean | `false` | Reflects the window's open state. |
| `placeholder` | `placeholder` | string | `''` | Composer placeholder (falls back to a localized default). |
| `disabled` | `disabled` | boolean | `false` | Disables the composer. |
| `provider` | — (property only) | function | — | Per-instance override of `Orion.ai.configure()`'s provider. |
| `system` | `system` | string | `''` | System prompt prepended to every call. |
| `texts` | — (property only) | object | — | Per-instance string overrides (`this.t('chatbot.key')`). |

### Methods

| Method | Description |
|---|---|
| `open()` / `close()` / `toggle()` / `focus()` | Window and input focus control. |
| `send(text)` | Send a message as the user (opens the window first if it's a launcher). |
| `stop()` | Abort the in-progress reply. |
| `regenerate()` | Re-run the last exchange (also wired to the error bubble's Retry button). |
| `newChat()` / `clear()` | Clear the conversation (and persisted storage). |
| `exportTranscript({ format, download, filename })` | `format`: `'markdown'` (default) \| `'text'` \| `'json'`. Returns the transcript string; triggers a file download (`Orion.download`) unless `download: false`. Also fired from the header's export button. |

### Events

| Event | Detail |
|---|---|
| `o-message` | `{ message: { role: 'user', text } }` |
| `o-response` | `{ message: { role: 'assistant', text }, aborted }` |
| `o-feedback` | `{ message, rating: 'up' \| 'down' \| null }` — toggling the same thumb again clears it. |
| `o-error` | `{ error }` |
| `o-export` | `{ format, text }` |

### Keyboard

`Enter` sends, `Shift+Enter` inserts a newline, `↑` on an empty input recalls the last message you sent, `Esc`
stops an in-progress reply (else closes the window when it's a launcher).

## `<o-assistant>`

```html
<o-assistant title="Page assistant"></o-assistant>
<script>
  const asst = document.querySelector('o-assistant');
  asst.templates = [{ label: 'Write a title', build: ctx => `Suggest a short page title for: ${ctx}` }];
  asst.addEventListener('o-insert', e => console.log(e.detail.mode, e.detail.text));
</script>
```

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `contextSelector` | `context-selector` | boolean | `true` | Shows the current-context badge (Selection / Page / No context). |
| `dock` | `dock` | `start \| end` | `end` | Which edge the panel docks to; mirrors in RTL. |
| `width` | `width` | number | `360` | Panel width in px, 280–640 (drag the handle or `←`/`→` on it, focused). |
| `isOpen` | `open` | boolean | `false` | Reflects the panel's open state. |
| `context` | — (property only) | `() => string` | — | Override "the page": default is the current window selection, else the last focused editable element outside the panel, else nothing. |
| `provider` | — (property only) | function | — | Same as `<o-chatbot>`. |
| `templates` | — (property only) | `{ label, build: string \| (ctx) => string }[]` | `[]` | Extra quick-action buttons after the 3 built-ins. |
| `title` | `title` | string | `''` | Panel header. |
| `texts` | — (property only) | object | — | Per-instance string overrides. |

### Methods

| Method | Description |
|---|---|
| `open()` / `close()` / `toggle()` / `focus()` | Panel and input focus control. |
| `ask(prompt)` | Programmatically ask a question using the current context. |
| `stop()` | Abort the in-progress result. |
| `clearHistory()` | Clear the short result history list. |

### Events

| Event | Detail |
|---|---|
| `o-result` | `{ label, text }` |
| `o-insert` | `{ text, mode: 'insert' \| 'replace' }` |
| `o-error` | `{ error }` |

### Keyboard

`Esc` closes the panel; `←`/`→` on the resize handle narrows/widens by 16px (mirrors in RTL); `Ctrl+J` toggles
the panel from anywhere when the `shortcuts` package is in the build (`Orion.shortcuts.add`) — the panel is
still fully usable from its own trigger button without it.

## Accessibility

Both use `Orion.ai.markdown()` for replies (sanitized, safe `innerHTML`). The chatbot log is `role="log"
aria-live="polite"`; a "new messages" jump button appears when scrolled up. Streaming/typing/aborted/error
states get their own classes for reduced-motion-safe visual treatment. The assistant panel restores focus
sensibly and announces async results (`announce()`) for insert/replace/copy/errors.

## Limitations

- `<o-assistant>`'s "Replace selection" and ghost-text/"improve with AI" in the `aitools` package are
  independent features; `<o-assistant>` is the one selection-aware option (it captures the last focused element,
  not just its own textarea).
- File attachments in `<o-chatbot>` are read as plain text client-side (2MB cap) and folded into the next
  message's context — there is no server-side upload/storage.
- `exportTranscript()` excludes the welcome bubble and any message still mid-stream at export time.
