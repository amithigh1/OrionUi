# Scroll — back-to-top, progress, spy, sticky actions

Small scroll-driven helpers: `<o-back-to-top>`, `<o-scroll-progress>`, a `data-o-spy` scroll-spy behavior, and
a `data-o-sticky-actions` behavior that adds `.is-stuck` to a `position: sticky` bar once it is actually pinned.

```html
<o-back-to-top threshold="300" progress></o-back-to-top>
<o-scroll-progress position="top"></o-scroll-progress>

<nav id="toc"><a href="#intro">Intro</a><a href="#usage">Usage</a></nav>
<main data-o-spy="#toc" data-o-spy-offset="72"><h2 id="intro">Intro</h2>…<h2 id="usage">Usage</h2></main>

<div class="o-sticky-bar" data-o-sticky-actions><button class="o-btn">Cancel</button><button class="o-btn o-btn-primary">Save</button></div>
```

## `<o-back-to-top>`

| Attribute | Type | Description |
|---|---|---|
| `threshold` | Number | Scroll distance (px) before the button appears. Default 300. |
| `target` | selector | Scroll container; defaults to the window. |
| `progress` | Boolean | Draw a completion ring around the button. |
| `label` | String | `aria-label` override. |

Method: `scrollToTop()`. Event: `o-click`.

## `<o-scroll-progress>`

| Attribute | Type | Description |
|---|---|---|
| `target` | selector | Scroll container; defaults to the window. |
| `position` | `top｜bottom` | Default `top`. |

## Behaviors

| Attribute | Description |
|---|---|
| `data-o-spy="#nav" [data-o-spy-offset="80"]` | Scroll-spy on the element carrying the attribute (its own scroll box, or the window for `<body>`/`<html>`). Highlights the nav link (`.is-active`, `aria-current="true"`) whose target heading is in view, supports nested `<ul>` lists (ancestor `<li>` get `.has-active`), and smooth-scrolls to a section when its link is clicked. |
| `data-o-sticky-actions` | Adds/removes `.is-stuck` on a `position: sticky` element while it is pinned against its sticky edge. |

## Events

| Event | Target | Detail |
|---|---|---|
| `o-spy-change` | the nav element | `{ link, id }` |

## CSS custom properties

`--o-progress` (0–1, the back-to-top ring) and `--o-bottom-nav-space` (used to lift the back-to-top button
above a bottom nav on small screens).
