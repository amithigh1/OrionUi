# Lazy loading — `data-o-lazy`, `data-o-lazy-bg`, `data-o-lazy-render`, `Orion.lazy`

Attribute behaviors that defer loading images (including `<picture>` sources), iframes, video/audio and
background images until they are about to scroll into view, with blur-up/color placeholders, a shimmer while
waiting, fade-in, and an error fallback. One shared `IntersectionObserver` per distinct `rootMargin`. Works with
markup rendered by any framework (behaviors initialise on current *and future* matching elements).

## `data-o-lazy`

```html
<img data-o-lazy data-src="a.jpg" data-srcset="a-800.jpg 800w, a-1600.jpg 1600w" data-sizes="auto"
     width="800" height="533" alt="" data-o-lazy-placeholder="tiny-blurred.jpg">

<picture>
  <source type="image/webp" data-srcset="a.webp">
  <img data-o-lazy data-src="a.jpg" alt="">
</picture>

<img data-o-lazy src="a.jpg" alt="">                 <!-- real src: adds loading="lazy" + fade-in + fallback -->
<iframe data-o-lazy data-src="map.html"></iframe>     <!-- native loading="lazy" when supported -->
<video data-o-lazy data-src="v.mp4" data-poster="p.jpg" controls></video>
```

| Attribute | On | Description |
|---|---|---|
| `data-o-lazy` | `img`, `iframe`, `video`, `audio`, `picture > img` | Enable lazy loading. With `data-src`/`data-srcset` present, the element waits for the viewport; on an element with a real `src` already, it just adds native `loading="lazy"`, a fade-in and the error fallback. |
| `data-o-lazy-bg` | any element | Background-image URL, loaded (and preloaded via a probe `Image`) when visible, then swapped into `style.backgroundImage`. |
| `data-o-lazy-placeholder` | `img`, `[data-o-lazy-bg]` | A tiny image URL/data-URI (shown blurred via `filter: blur()` until the real image loads), a CSS color, or `"none"`. |
| `data-o-lazy-error` | `img` | Fallback image swapped in when loading fails. |
| `data-o-lazy-margin` | any | `IntersectionObserver` `rootMargin` for this element (default from `Orion.lazy.config`, itself `"200px 0px"`). |
| `data-sizes="auto"` | `img`, `source` | Resolved to the element's rendered width in px right before `srcset` is applied. |

Classes toggled by the behavior: `.o-lazy` (always), `.is-lazy` (shimmer while waiting), `.is-placeholder`
(blurred preview shown), `.is-loaded`, `.is-fade` (one-shot fade-in animation), `.is-error`, `.is-fallback`
(an error image was substituted). Always give a lazy image a size (`width`/`height` or CSS `aspect-ratio`) so
the page doesn't jump when it loads.

## `data-o-lazy-render`

```html
<section data-o-lazy-render style="--o-lazy-min-h: 12rem">
  <template>…expensive chart/map markup…</template>
</section>
```

Stamps the `<template>` content once the element scrolls into view and fires `o-visible` — use it to mount a
chart, map or other expensive widget only when it's needed. With `data-o-lazy-render="repeat"` it fires
`o-visible`/`o-hidden` every time visibility changes (e.g. to pause/resume animations offscreen), and toggles a
`data-o-visible` attribute while visible. `--o-lazy-min-h` reserves height before the template is stamped.

## `Orion.lazy`

| Member | Description |
|---|---|
| `load(el)` | Load an element immediately, bypassing the viewport check (e.g. before printing). Accepts an element or a selector. |
| `observe(root) → cleanup()` | Initialise every `[data-o-lazy]` / `[data-o-lazy-bg]` / `[data-o-lazy-render]` under `root` — for shadow roots or detached trees the global `MutationObserver` can't see. |
| `config({ rootMargin, errorImage, fade, loader })` | Global defaults. `loader(url, el)` may return a (promise of a) URL — use it to sign or authenticate URLs, simulate latency, or rewrite CDN paths. Returns the current config. |
| `rootMargin` | Get/set the default `rootMargin` directly. |

## Events (dispatched on the element)

| Event | Detail | Description |
|---|---|---|
| `o-lazy-load` | `{}` | The image/background finished loading. |
| `o-lazy-error` | `{}` | Loading failed (fired after the fallback image is applied too, if any). |
| `o-visible` / `o-hidden` | `{ entry }` | `data-o-lazy-render` visibility changes (`entry` is the `IntersectionObserverEntry`). |

## Notes

* `<o-carousel>` loads the `data-src` of the active slide's images and its immediate neighbours ahead of time,
  deferring to `Orion.lazy.load()` when a slide image also has `data-o-lazy`.
* Animations (shimmer, fade, blur) respect `prefers-reduced-motion` automatically via the shared CSS rules.
* When `IntersectionObserver` isn't available, everything loads immediately (no error, no visual regression).
