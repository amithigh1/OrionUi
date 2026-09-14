# Carousel — `<o-carousel>`

A dependency-free carousel/slider. The element's own children are the slides — they are **never moved or
cloned**; each slide is positioned with a CSS transform, which also gives a clone-free infinite loop. Anything
that is not `[data-o-ui]` (the arrows/dots/thumbnails the component renders) and not a `<template>`/`<script>`/
`<style>` counts as a slide.

```html
<o-carousel autoplay="5000" loop arrows dots aspect="16/9" label="Featured">
  <img src="a.jpg" alt="…">
  <img src="b.jpg" alt="…">
</o-carousel>
```

## Attributes / properties

| Attribute | Property | Type | Default | Description |
|---|---|---|---|---|
| `autoplay` | `autoplay` | `number \| boolean` | `0` | Milliseconds between slides. A bare attribute (`autoplay` or `autoplay=""`) means `5000`. `0`/absent disables. |
| `loop` | `loop` | `boolean` | `false` | Infinite loop, clone-free. Needs at least `ceil(perView) + 1` slides; otherwise falls back to `rewind`-like behaviour. |
| `rewind` | `rewind` | `boolean` | `false` | Without `loop`, calling `next()` on the last slide jumps back to the first (and vice versa). |
| `per-view` | `perView` | `number \| 'auto'` | `1` | Slides visible at once; fractional values peek the next slide. `'auto'` keeps each slide's own CSS width (content sliders). |
| `per-view-sm` / `-md` / `-lg` / `-xl` | `perViewSm` / `perViewMd` / `perViewLg` / `perViewXl` | `number \| 'auto'` | — | Overrides at ≥576/768/992/1200px viewport width. |
| `breakpoints` | `breakpoints` | `object` | `{}` | `{ "768": { "perView": 2, "gap": 16 } }` — arbitrary min-width keys, applied in ascending order. |
| `gap` | `gap` | `number \| string` | `0` | Space between slides (px number or any CSS length). |
| `effect` | `effect` | `'slide' \| 'fade'` | `'slide'` | Transition. `fade` forces one slide per view. |
| `arrows` | `arrows` | `boolean` | `false` | Previous/next buttons. |
| `dots` | `dots` | `boolean \| 'outside'` | `false` | Pagination dots over the slides, or below them with `dots="outside"`. |
| `thumbnails` | `thumbnails` | `boolean` | `false` | Thumbnail strip; each thumbnail uses the slide's `data-thumb`, else its first `<img>`. |
| `pause-on-hover` | `pauseOnHover` | `boolean` | `true` | Pause autoplay while the pointer is over the carousel. |
| `draggable` | `draggable` | `boolean` | `true` | Pointer swipe/drag with momentum and snapping. |
| `center` | `center` | `boolean` | `false` | Center the active slide (use with fractional `per-view`). |
| `step` | `step` | `number \| 'page'` | `1` | Slides moved per `next()`/`prev()`/arrow key/autoplay tick. |
| `aspect` | `aspect` | `string` | — | Slide aspect ratio, e.g. `"16/9"`. |
| `speed` | `speed` | `number` | `420` | Transition duration, ms (forced to `0` under `prefers-reduced-motion`). |
| `index` | `index` | `number` | `0` | Current position. Setting it jumps without animation. |
| `label` | `label` | `string` | — | Accessible name (`aria-label`) of the carousel region. |
| `texts` | `texts` | `object` | — | Per-instance string overrides: `prev, next, goTo, play, pause, thumbs, dots, slideOf`. |

## Methods & getters

| Member | Description |
|---|---|
| `next(user?)` / `prev(user?)` | Move by `step`. |
| `goTo(index, { animate = true })` | Jump to a position (a "page" when several slides are visible per view). |
| `play()` / `pause()` | Start/stop autoplay programmatically (same as the built-in play/pause button). |
| `refresh()` | Re-read slides and options; called automatically on child mutation and resize. |
| `index` | Current position (getter/setter). |
| `count` | Number of positions (not always equal to the slide count when several are visible per view). |
| `slides` | Current slide elements, in DOM order. |
| `playing` | `true` while autoplay is actively running. |

## Events

All bubble, are composed, and are `o-`-prefixed on the DOM (`addEventListener('o-change', …)`).

| Event | Detail | Description |
|---|---|---|
| `change` | `{ index, previous }` | The active position changed (user interaction or API). |
| `play` / `pause` | — | Autoplay started / stopped. |

## Keyboard & accessibility

Follows the WAI-ARIA carousel pattern: the host is `role="region"` with `aria-roledescription="carousel"`;
each slide is `role="group"` labelled "n of N" (or its own `aria-label`/`aria-labelledby` if set). Slides not
currently visible are marked `inert`. `←`/`→` move by `step` (mirrored under `dir="rtl"`), `Home`/`End` jump
to the first/last position. Autoplay pauses on hover (`pause-on-hover`), on keyboard focus inside the
component, when the document tab is hidden, and when the carousel scrolls out of view; it never starts under
`prefers-reduced-motion`, and a play/pause button is always rendered when autoplay is configured (WCAG 2.2.2).

## CSS

Classes: `.o-carousel`, `.o-carousel-img` (cover image inside a slide), `.o-carousel-caption` (overlay caption
block), `.o-carousel-cards` (content-slider look, pairs with `per-view="auto"`), `.o-carousel-nodrag` (mark an
area inside a slide — e.g. a button — that must never start a drag).
Variables: `--o-carousel-gap`, `--o-carousel-speed`, `--o-carousel-delay`, `--o-carousel-radius`,
`--o-carousel-thumb-h`, `--o-carousel-card-w`, `--o-carousel-aspect`.

## Notes

* Slides may include `<img data-src="…">` (or `data-o-lazy`): the carousel loads the image of the active slide
  and its immediate neighbours ahead of time, and defers to `Orion.lazy.load()` when `data-o-lazy` is present.
* Works with frameworks unmodified — slides are read from the light DOM and never touched, so React/Vue/Angular
  keep full control of them; the component re-reads slides via a `MutationObserver`.
