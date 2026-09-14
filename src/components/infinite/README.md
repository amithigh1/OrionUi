# infinite — `Orion.infiniteScroll()` / `data-o-infinite`

Sentinel-driven infinite loading for a plain list/table body, a `<o-virtual-list>`, or (declaratively) a
server-rendered HTML fragment feed. An invisible sentinel + `IntersectionObserver` does the watching — nothing
to wire up on scroll events. Loading / error-with-retry / end-of-list states are built in, plus a "load more"
button mode and chat-style `direction: 'up'` history loading that preserves scroll position.

Self-contained: no dependency on the dashboard, stat or virtuallist packages (it works with a `<o-virtual-list>`
purely through that element's public `near-end`/`near-start` events and `appendItems`/`prependItems` methods).

Docs: `docs/components/infinite-scroll.html`.

## Files

| File | Contents |
|---|---|
| `00-core.js` | `Orion.infiniteScroll(container, options)` — the loader engine: status chrome (loading/error/end/button), sentinel mounting for both plain-DOM and `<o-virtual-list>` containers, scroll-position preservation when prepending, HTML-fragment sanitization, the "unscrollable page" auto-fill guard. |
| `10-behavior.js` | `data-o-infinite` — declarative wiring: fetches `data-o-infinite-url` and appends the response body as an HTML fragment. |
| `infinite.css` | The sentinel (1px, invisible) and status row (spinner/error/end/button). Tokens only. |

## Usage

```js
Orion.infiniteScroll('#list', {
  load: async (page, { signal }) => {
    const res = await fetch(`/api/items?page=${page}`, { signal });
    const { items, hasMore } = await res.json();
    return { items, hasMore };
  },
  render: item => `<div class="o-list-item">${Orion.util.esc(item.name)}</div>`,
});
```

```html
<!-- declarative, server-rendered HTML fragments, no JS -->
<div data-o-infinite data-o-infinite-url="/feed?page={page}">
  <!-- optional server-rendered initial items -->
</div>
```

## `Orion.infiniteScroll(container, options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `load` | `(page, { signal }) => items[] \| { items, hasMore } \| html \| { html, hasMore }` | — | **Required.** Return a plain array, `{ items, hasMore }`, an HTML string, or `{ html, hasMore }`. `hasMore` defaults to "did we get anything back". |
| `render` | `(item) => Node \| string` | — | Row content for array/items results. Ignored for html results and when `container` is a `<o-virtual-list>` (it has its own `renderItem`). A string/`SafeHTML` result is trusted markup like other render callbacks in this library; the no-`render` fallback (`String(item)`) is always inserted as plain text. |
| `mode` | `'auto' \| 'button'` | `'auto'` | `auto` loads via an `IntersectionObserver` sentinel; `button` shows a "Load more" button instead. |
| `threshold` | number | 300 | Sentinel `rootMargin`, px — how far from the edge loading starts. |
| `initialPage` | number | 1 | First page number passed to `load`. |
| `direction` | `'down' \| 'up'` | `'down'` | `up` prepends new items/HTML and preserves scroll position (chat history). |
| `trusted` | boolean | false | Skip `sanitize()` for html results — only for markup you generated yourself. |
| `showEnd` | boolean | true | Show the end-of-list row once `hasMore` is false. |
| `root` | Element \| null | auto-detected | `IntersectionObserver` root; auto-detects an `overflow: auto/scroll` container, else the viewport. |
| `texts` | object | — | Override `loading, error, retry, end, loadMore, loaded`. |

Returns a controller: `{ loadMore(), reset(page?), destroy(), loading, done, page }` (the last three are
read-only getters). `reset()` clears loaded items/HTML this instance inserted, forgets `done`, and (in `auto`
mode) reloads from `page` (default: `initialPage`). `destroy()` stops observing and removes the sentinel/status
chrome; already-loaded content is left in place.

### Driving a `<o-virtual-list>`

When `container.localName === 'o-virtual-list'`, `infiniteScroll` hooks its `near-end`/`near-start` events
instead of mounting a sentinel, and merges results with `appendItems()`/`prependItems()` — no extra DOM to
manage, and it scales to very large feeds. `render` is ignored; set the list's own `renderItem` instead.

## Events (on `container`)

| Event | Detail | Description |
|---|---|---|
| `infinite-load` | `{ page, items, html, done }` | A page finished loading. |
| `infinite-error` | `{ page, error }` | A page failed to load (not fired for a cancelled/aborted request). |

## Declarative: `data-o-infinite`

| Attribute | Description |
|---|---|
| `data-o-infinite` | Marks the container. |
| `data-o-infinite-url` | Endpoint returning an HTML fragment. Use a literal `{page}` placeholder, or it is appended as a query parameter (name from `data-o-infinite-param`, default `page`). |
| `data-o-infinite-mode` | `auto` (default) \| `button`. |
| `data-o-infinite-threshold` | Sentinel `rootMargin`, px (default 300). |
| `data-o-infinite-initial-page` | Default 1. |
| `data-o-infinite-direction` | `down` (default) \| `up`. |
| `data-o-infinite-param` | Query-param name when the URL has no `{page}` placeholder (default `page`). |
| `data-o-trusted` | Skip sanitizing the response. |
| `X-Has-More` response header | `"true"` / `"false"` tells the behavior whether to keep loading; omit it to infer from a non-empty body. |

The behavior's controller is stashed on `el.__oInfinite` and destroyed automatically when the attribute is
removed or the element leaves the DOM (standard `behavior()` cleanup).

## Accessibility

The status row (loading / error / end / button) is `role="status" aria-live="polite"` so its text — "Loading
more…", an error with its **Retry** button, or "You've reached the end." — is announced to screen reader users
as it changes, not just shown visually. New items loaded are additionally summarized once via
`Orion.announce()` ("`{count}` more loaded"). The sentinel itself is `aria-hidden` (1px, purely a scroll
trigger, never focusable).

## Limitations

* `load` is expected to be idempotent per `page` — there is no request de-duplication beyond the plain
  `loading`/`done` guards (a second `loadMore()` call while one is in flight is a no-op).
* `direction: 'up'` scroll-position preservation for plain-DOM containers measures `scrollHeight` before/after
  insertion on the detected scroll root; if your container's scrollable ancestor isn't auto-detectable (no
  `overflow: auto/scroll` on `container` itself and no explicit `root` option), pass `root` explicitly.
* The "unscrollable page" auto-fill guard (keep loading while content is shorter than the viewport) only
  applies to plain-DOM `auto` mode, not `<o-virtual-list>` containers or `button` mode.
* No built-in retry backoff/limit — every failed page shows **Retry** and `loadMore(true)` tries the same page
  again immediately.
* `direction: 'up'`'s scroll compensation brackets only the message-insertion step; the status row's own
  `loading` → `idle` height change immediately afterward (the spinner/text collapsing back to nothing) is not
  separately compensated, so the anchored view can drift by roughly one status row's height per load — cosmetic
  (the anchor row stays on screen, just not pixel-exact), not a functional break.
