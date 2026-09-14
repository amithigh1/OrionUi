# Help — inline help, contextual help panel, "What's this?" mode

`<o-help>` (inline "?" popover), `<o-help-panel>` + `Orion.help` (a searchable article registry in a
responsive drawer, with back/forward history and an F1/`?` shortcut) and the `data-o-help` section hook
for a "What's this?" inspection mode. Zero dependencies; uses `Orion.popover` when the `overlays` package
is present and a small floating panel built on core `place()`/`portal()`/`overlays` otherwise.

## `Orion.help`

```js
Orion.help.register({
  billing: { title: 'Billing & invoices', content: '<p>Your plan renews monthly…</p>', related: ['payment-methods'], video: '/media/billing.mp4' },
  'payment-methods': { title: 'Payment methods', content: '<p>Add a card in Settings → Billing.</p>' },
});
Orion.help.open('billing');     // or Orion.help.open() for the article list / search home
Orion.help.whatsThis(true);     // highlight every data-o-help element; click one to open it (Escape cancels)
```

| Member | Description |
|---|---|
| `register(map)` | Merge `{ key: { title, content, related?: string[], video? } }` into the registry. `content` is sanitized HTML. |
| `get(key)` / `keys()` | Read the registry. |
| `search(query)` | Fuzzy-ranked `[{ key, title, content, ... }]`. |
| `open(key?)` / `close()` / `toggle(key?)` | Show/hide the shared `<o-help-panel>` (created lazily and appended to `<body>` on first use). |
| `whatsThis(on?)` / `inspecting` | Toggle inspect mode (omit `on` to flip it). |

**F1** or **?** (outside text fields) opens the panel anywhere on the page; **Escape** cancels inspect mode.

## `<o-help-panel placement="end" width>`

One instance is enough for a whole app (or let `Orion.help.open()` create it). Header: back/forward,
search, close. Body: the current article (title, sanitized content, an optional video/iframe embed,
related-article links) or a search/home list. Slides in from the logical end edge (start in RTL), a
full-height sheet under 560px.
Methods: `open(key?)` `close()` `toggle(key?)` `navigate(key,{push})` `back()` `forward()` `search(q)`.
Events: `o-open`, `o-close {reason}`, `o-navigate {key}`.

## `<o-help text="…" placement="top" article="billing">`

A small inline "?" button with a lightweight popover; when `article` matches a registered key it adds a
"Help →" link that opens the full panel to that article.

## `data-o-help="billing"` — section hooks

Mark any element as a contextual help hotspot. It is inert until "What's this?" mode is active
(`Orion.help.whatsThis(true)`, or `data-o-action="help-whats-this"` / `data-o-action="help"
data-o-value="billing"` buttons), at which point it gets a dashed outline and clicking it opens that
article and exits inspect mode.

## Files

`10-help-service.js` `Orion.help` + shortcuts + inspect mode · `20-help.js` `<o-help>` ·
`30-help-panel.js` `<o-help-panel>` · `40-help-target.js` `data-o-help` + actions · `help.css`.
