# share

`Orion.share()` opens the native Web Share sheet when available, otherwise a network-picker sheet/popover (X,
Facebook, LinkedIn, WhatsApp, Telegram, Reddit, Email, Copy link, QR code), extensible via `Orion.share.networks`.
Ships the `data-o-action="share"` action and the `<o-share>` element (button or icon-row variants). Brand colors
are opt-in via CSS custom properties on `.o-share` (e.g. `--o-share-x`, `--o-share-x-fg`).

## `Orion.share(options)`

→ `Promise<{ shared, method, network?, cancelled? }>`. `method`: `'native'\|'network'\|'copy'\|'qr'\|'sheet'`.

| Option | Type | Default | Notes |
|---|---|---|---|
| `title`, `text`, `url` | `String` | `document.title` / `<meta name="description">` / `location.href` | |
| `files` | `File[]` | — | Native share only, gated by `navigator.canShare({ files })`. |
| `networks` | `String` (comma list) or `Array` | `Orion.share.networks.defaults` = `['x','facebook','linkedin','whatsapp','telegram','reddit','email','qr','copy']` | |
| `native` | `true\|false\|'mobile'\|'never'` | `true` | `'mobile'` only tries the native API on touch/mobile UAs. |
| `anchor` | `Element` | — | Popover anchor; falls back to a full-screen sheet on narrow viewports or when omitted. |

### Static members

| Member | Description |
|---|---|
| `share.close()` | Closes any open share sheet/popover. |
| `share.link(network, options)` | → network share URL `String`, or `null`, without opening it. |
| `share.networks.add(name, { label, glyph, url({url,text,title}) -> String, self?, available?, action? })` | Registers/overrides a network → `share.networks`. `self: true` opens via a hidden same-tab `<a>` (used for `mailto:`) instead of `window.open`. |
| `share.networks.get(name)` | → definition or `null`. |
| `share.networks.list()` | → `String[]` of all registered names. |
| `share.networks.defaults` | The default network list (see above). |
| `share.glyph(name)` | → `SafeHTML`, the network's icon as inline SVG. |

## Bus events

| Event | Detail | Notes |
|---|---|---|
| `share` | `{ shared, method, network?, cancelled?, url }` | Emitted for every completed share (native, network click, copy, or QR reveal) — from both the top-level `share()` call and `<o-share>`'s network-row clicks. |

## Behaviors

### `data-o-action="share"`

Applies to a button.

| Sub-attribute | Notes |
|---|---|
| `data-o-url`, `data-o-title`, `data-o-text` | Share payload. |
| `data-o-networks` | Comma list of network names. |
| `data-o-native` | `'false'`/`'never'` disables native share; any other value (or absent) = `true`. |

No `o-share`/`o-before-share` DOM events are dispatched on the trigger itself — only the `share` bus event.

## Elements

### `<o-share>`

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `url` | `url` | `String` | — | |
| `title` | `title` | `String` | — | |
| `text` | `text` | `String` | — | |
| `networks` | `networks` | `Any` (comma string or array) | all defaults | |
| `variant` | `variant` | `String`, reflect | `'button'` | `'button'` (single Share button opening the sheet) \| `'icons'` (inline row of network icon buttons). |
| `native` | `native` | `String` | `'auto'` | `'auto'\|'mobile'\|'never'\|'false'`. |
| `label` | `label` | `String` | — | |
| `size` | `size` | `String` | — | |

Method: `share(anchor?)` → `Promise<result>`.

#### Events

| Event | Detail | Cancelable |
|---|---|---|
| `o-before-share` | `{ title, text, url, files }` | Yes — returning `false` aborts. |
| `o-share` | `{ shared, method, network?, cancelled? }` | No — fired for the button variant's full share flow and for each icon-row network click (copy/native/qr/network). |
