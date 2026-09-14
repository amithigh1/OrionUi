# chat

`<o-chat>` — team / support messaging: a conversation list, a threaded message pane with day dividers,
reactions, replies, editing, attachments, a voice-note hook, search-in-conversation, and a composer with
an emoji picker. `Orion.chat.connect()` is a thin adapter template wiring it to a realtime client.

## Files

| File | Contents |
|---|---|
| `10-chat.js` | `<o-chat>` — everything above, plus i18n strings and the `chat-*` icon set. |
| `20-service.js` | `Orion.chat.connect(chatEl, client, opts?)`. |
| `chat.css` | `.o-chat-*` — this package **owns** every `.o-chat-*` selector (see "CSS ownership" below). |

## `<o-chat>`

```html
<o-chat id="app-chat" layout="full" current-user='{"id":"me","name":"Aisha Rahman"}'></o-chat>
<script>
  appChat.setConversations([{ id: 'c1', title: 'Ben Tan', avatar: null, online: true, unread: 2,
    lastMessage: { text: 'Sounds good', createdAt: Date.now() - 6e4 } }]);
  appChat.setMessages([{ id: 'm1', conversationId: 'c1', author: { id: 'u2', name: 'Ben Tan' },
    text: 'Sounds good', createdAt: Date.now() - 6e4, status: 'delivered' }]);
  appChat.onSend = async ({ conversationId, message }) => { /* POST to your API */ };
</script>
```

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `currentUser` | — | `Object` (`attr:false`) | `{}` | `{ id, name, avatar }` — determines which messages/rows render as "mine". |
| `layout` | `layout` | `String` | `'full'` | `full` (list + thread, collapses to a single pane with a back button below 720px) \| `thread` (thread only, no list) \| `widget` (floating support-chat bubble; toggle with `open`). Reflected. |
| `conversations` | — | `Array` (`attr:false`) | `[]` | `[{ id, title, avatar, members, lastMessage, unread, muted, pinned, online, typing }]`. |
| `messages` | — | `Array` (`attr:false`) | `[]` | `[{ id, conversationId, author:{id,name,avatar}, text, html?, attachments, replyTo, reactions, createdAt, editedAt, status, system }]`. `status`: `sending\|sent\|delivered\|read\|failed`. |
| `activeId` | `active-id` | `String` | — | Open conversation id; defaults to the first conversation once `conversations` arrives. |
| `open` | `open` | `Boolean` | `false` | Only meaningful with `layout="widget"` — shows/hides the floating panel. Reflected. |
| `onSend` | — | `({conversationId,message}) => Promise<patch?>` (`attr:false`) | — | Called after every optimistic send; the resolved object (if any) is merged onto the message (e.g. `{ id: serverId }`), a rejection marks it `failed` (tap-to-retry). `Orion.chat.connect()` sets this for you. |
| `label` | `label` | `String` | — | `aria-label` for the widget (default: localized "Chat"). |
| `texts` | — | `Object` (`attr:false`) | — | Per-instance string overrides (see the `chat.*` keys in `10-chat.js`). |

| Method | Description |
|---|---|
| `addMessage(conversationId, message)` | Appends a message (fills `reactions`/`attachments` defaults); bumps unread / announces it when the conversation isn't the active, scrolled-to-bottom one. |
| `updateMessage(id, patch)` | Merges `patch` onto a message (edits, status changes, reactions). |
| `removeMessage(id)` | Deletes a message. |
| `setMessages(list)` / `setConversations(list)` | Replace the respective array (property shorthands). |
| `setTyping(userId, isTyping, conversationId = activeId)` | Drives the typing indicator (header subtitle + animated dots in the thread + conversation list preview); auto-clears after 6s. |
| `markRead(id = activeId)` | Zeroes that conversation's `unread` and fires `o-read`. |
| `scrollToBottom(smooth?)` | Also clears the "jump to latest" badge. |
| `openConversation(id)` | Sets `activeId` and (on narrow layouts) slides the thread pane in; fires `o-open-conversation`. |

| Event | Detail | Notes |
|---|---|---|
| `o-send` | `{ conversationId, message }` | Right after the optimistic message is added (before `onSend` resolves). |
| `o-load-more` | `{ conversationId, oldest }` | Scrolled near the top and the in-memory window is already showing every loaded message — fetch older ones and call `setMessages()`/`addMessage()`. |
| `o-read` | `{ conversationId }` | From `markRead()` (auto-fires ~400ms after a conversation becomes active, and when scrolling to the bottom of an unread thread). |
| `o-typing` | `{ conversationId, userId, typing }` | From `setTyping()` (including your own calls). |
| `o-react` | `{ conversationId, messageId, emoji, reacted }` | Quick-react or toolbar reaction toggle. |
| `o-forward` | `{ message, targetConversationId }` | A message was forwarded via the "Forward" action. |
| `o-voice-note-start` | `{}` (cancelable) | Mic button pressed; `preventDefault()`/return `false` to veto (e.g. no mic permission yet). |
| `o-voice-note-stop` | `{ duration }` | Recording stopped — wire your own upload/transcription here; the component only manages the UI state. |
| `o-open-conversation` | `{ conversationId }` | From `openConversation()` (including the user clicking a row). |

## `Orion.chat.connect(chatEl, client, opts?)` → `disconnect()`

A **template**, not a fixed protocol — real backends have their own event/payload shapes, so copy this
function into your app and adjust it. As shipped it wires any `Emitter`-shaped client (`Orion.ws`,
`Orion.sse`, a SignalR `HubConnection` via `.invoke()`, or your own) with configurable event names:

```js
const ws = Orion.ws('wss://api.example.com/chat');
const disconnect = Orion.chat.connect(document.querySelector('o-chat'), ws, {
  messageEvent: 'chat:message', typingEvent: 'chat:typing', readEvent: 'chat:read', sendEvent: 'chat:send',
});
```

It listens for `messageEvent` (→ `addMessage`), `typingEvent` (→ `setTyping`) and `readEvent`
(→ `markRead`), and replaces `chatEl.onSend` to call `client.invoke(sendEvent, payload)` (SignalR-style)
or `client.send(payload)`. `disconnect()` removes the listeners and restores the previous `onSend`.

## Keyboard

| Key | Where | Action |
|---|---|---|
| Enter | composer | Send (Shift+Enter for a newline). |
| ↑ (empty composer) | composer | Edit your last message. |
| Escape | composer | Cancel the active reply/edit; while thread search is open, closes it. |
| Enter / Shift+Enter | thread search box | Next / previous match. |
| Escape | thread search box | Close search. |

Message action buttons, reactions and menus are reachable by keyboard (`Tab`/`Shift+Tab`, `Enter`/`Space`);
internal popovers (reactions, more-actions, forward, conversation options) use the shared floating-panel
pattern (`ARCHITECTURE.md` §6) — Escape/outside-click/focus-trap all work, and they're portaled to
`<body>` while open, so query them from `document`.

## CSS ownership

This package **owns every `.o-chat-*` selector**. `node build/audit.mjs` reports two of them as also
defined by `assistant/assistant.css`:

* `.o-chat-bubble` — in `<o-chat>` this **is** the visual message bubble (padding, background, radius,
  color). In `assistant/assistant.css` (`10-chatbot.js`) it is a different thing with the same name: a
  flex-column **wrapper** around an avatar + a separately-styled `.o-chat-content` (assistant's actual
  bubble). The two are not interchangeable — merging them would either break `<o-chatbot>`'s layout or
  strip `<o-chat>`'s bubble styling.
* `.o-chat-actions` — in `<o-chat>` this is the hover-revealed reply/react/more icon toolbar, shown via
  `.o-chat-row:hover .o-chat-actions`. Assistant's copy is a differently-styled action row shown via
  `.o-chat-msg:hover .o-chat-actions` (a container class `<o-chat>` doesn't have), so even color/spacing
  aside, the hover trigger wouldn't fire without assistant's own `.o-chat-msg` markup.

Both are complete, self-consistent definitions here — nothing is missing for `<o-chat>`. They cannot be
merged as-is because the two packages use the same class name for different concepts (layout wrapper vs.
visual bubble). See "Proposed changes outside my scope" in this package's delivery report for the
recommended fix (renaming assistant's copies, since `assistant.css` already prefixes everything else
`.o-chatbot-*`).

## Limitations

* `Orion.chat.connect()` is intentionally a thin template — no reconnection-aware message queue, no
  optimistic-send de-duplication across reconnects. For anything beyond a demo, adapt it to your backend.
* Voice notes: the component only manages the recording *UI* (`o-voice-note-start`/`-stop`); actual
  `MediaRecorder` capture/upload is the host app's responsibility.
* Message history is windowed in memory (grows 40 at a time on scroll-up); `o-load-more` is your hook to
  fetch further back once the whole loaded window is visible.
