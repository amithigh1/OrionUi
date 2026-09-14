# stat — `<o-stat>` / `<o-stat-group>` / `<o-countup>` / `Orion.countUp`

KPI tiles for dashboards: a value (with currency/percent/compact/bytes/duration formatting), a delta arrow
colored by whether the direction is actually favorable, an optional sparkline, an optional progress-to-goal
bar or ring, and an animated count-up. `<o-stat-group>` lays out a responsive row of them with dividers.

Docs: `docs/components/stat.html`.

## Files

| File | Contents |
|---|---|
| `00-core.js` | `statFormat()` (shared value formatter), `countUpRun()` (the raw rAF tween used by both `<o-countup>` and `<o-stat>`'s own count-up), `Orion.countUp()`, `<o-countup>`, and a dependency-free built-in sparkline renderer (`sparkDraw`/`sparkHover`) used when the richer `<o-sparkline>` (charts package) isn't registered. `i18n.add('en', { stat: {...} })`. |
| `10-stat.js` | `<o-stat>` and `<o-stat-group>`. |
| `stat.css` | Card chrome, delta colors, sparkline box, goal bar/ring, clickable variant, loading skeleton, responsive group grid. The base `.o-stat`/`.o-stat-label`/`.o-stat-value`/`.o-trend` classes usable without the custom element live in `60-content.css` (core), not here. |

## Usage

```html
<o-stat label="Revenue" value="84210" format="currency" currency="USD" delta="12.4" period="vs last month"
        icon="wallet" sparkline="[42,48,45,53,58,62,68,72]" countup></o-stat>

<o-stat-group min="12rem">
  <o-stat label="Orders" value="1284" delta="4.1"></o-stat>
  <o-stat label="Refund rate" value="2.1" format="percent" delta="-0.4" delta-good="down"></o-stat>
</o-stat-group>

<o-countup to="12450" duration="1500" format="currency" currency="USD"></o-countup>
```

```js
Orion.countUp('#total', 12450, { format: 'currency', currency: 'USD', duration: 1200 });
Orion.countUp.format(1234.5, { format: 'compact' });   // '1.2K' — the same formatter <o-stat> uses
```

## `statFormat(value, opts)` / `Orion.countUp.format`

`statFormat(v, { format, currency, decimals, compact, prefix, suffix })` — `format`: `number` (default) |
`currency` | `percent` (a **ratio out of 100**, i.e. `12.4` → `"12.4%"`, not `0.124`) | `compact` | `duration`
(milliseconds, via `fmt.duration`) | `bytes` | `raw` (no formatting, `prefix`/`suffix` only). Exposed as
`Orion.countUp.format` for reuse outside a `<o-stat>`/`<o-countup>`.

## `<o-stat>` — properties / attributes

| Property (attribute) | Type | Default | Description |
|---|---|---|---|
| `label` | string | — | Header label. |
| `value` | any | — | The number (or pre-formatted string when `format="raw"`). Empty/`null` shows nothing (or a skeleton while `loading`). |
| `format` | string | — | `number` \| `currency` \| `percent` \| `compact` \| `duration` \| `bytes` \| `raw`. |
| `currency` | string | — | ISO currency code, for `format="currency"`. |
| `decimals` | number | auto | Fixed fraction digits; default infers from the value's own decimals. |
| `prefix` / `suffix` | string | — | Literal text around the formatted value. |
| `compact` | boolean | false | Shorthand for `format`'s compact notation when `format` is `number`/unset. |
| `delta` | number | — | Percent/amount change. Sign determines the arrow (`>0` up, `<0` down, `0` flat). |
| `deltaFormat` | string | `'percent'` | `percent` \| `currency` \| `compact` \| `number` — how `delta` itself is formatted. |
| `deltaDecimals` | number | — | Fraction digits for the delta. |
| `deltaGood` | `'up' \| 'down' \| 'none'` | `'up'` | Which direction is favorable (colors green) — e.g. `down` for a refund rate. `none` always shows neutral. |
| `period` | string | — | Comparison label shown next to the delta, e.g. "vs last month". |
| `icon` | string | — | Icon name, shown top-end corner. |
| `color` | string | — | A semantic color name (`primary`, `success`, …) applied via `.o-c-<color>` to the icon (and the whole card in `variant="gradient"`). |
| `description` | string | — | Small muted line under the value. |
| `sparkline` | array | — | Numeric series. Uses `<o-sparkline>` (charts package) if registered, else a built-in line/area/bar SVG with hover tooltip. |
| `sparklineType` | `'line' \| 'area' \| 'bar'` | `'line'` | |
| `sparklineLabels` | array | — | Per-point labels for the hover tooltip. |
| `goal` | number | — | Target value; shows a progress bar/ring for `value / goal`. |
| `goalType` | `'bar' \| 'ring'` | `'bar'` | `ring` replaces the icon slot with a `.o-progress-ring`. |
| `loading` | boolean (reflects) | false | Shows a skeleton in place of the value/meta while there's no value yet, otherwise dims the card (`.is-refreshing`). |
| `variant` (reflects) | `'default' \| 'minimal' \| 'gradient'` | `'default'` | `default`/`gradient` get card chrome (padding, border, shadow); `minimal` is bare (for embedding inside a `<o-widget>` or your own card). |
| `href` / `target` | string | — | Makes the whole tile a link (`.o-stat-link` overlay), keyboard-focusable. |
| `countup` | boolean | false | Animate from 0 (first time visible) to `value`, and re-animate on subsequent `value` changes. |
| `duration` | number | 1200 | Count-up duration, ms. |
| `texts` | object | — | Per-instance string overrides (see i18n keys below). |

## `<o-stat-group>` — properties / attributes

| Property (attribute) | Type | Default | Description |
|---|---|---|---|
| `min` | string | `'12rem'` | Minimum column width (`auto-fit` grid via `--o-stat-min`). |
| `columns` | number | — | Fixed column count instead of auto-fit. |
| `plain` | boolean | false | No group chrome (border/shadow/dividers) — each `<o-stat>` keeps its own card look. |
| `label` | string | — | `aria-label` for the group (`role="group"`). |

## `<o-countup>` — properties / attributes

| Property (attribute) | Type | Default | Description |
|---|---|---|---|
| `to` | number | 0 | Target value. |
| `from` | number | 0 | Starting value (also the value shown before the element is ever visible). |
| `duration` | number | 1200 | ms. |
| `format`, `currency`, `decimals`, `prefix`, `suffix`, `compact` | — | Same as `<o-stat>`'s formatting props (passed straight to `statFormat`). |
| `announce` | boolean | false | Call `Orion.announce()` with the final formatted value when the animation finishes. |
| `repeat` | boolean | false | Replay the animation every time the element re-enters the viewport (default: once). |

Methods: `start(from?)` — animate now (defaults to resuming from whatever is currently shown, or `from`);
returns the tween's promise. `reset()` — cancel and show `from` again. Event: `countup-end` — `{ value }`.

## `Orion.countUp(target, to, opts)`

`target`: selector or element. `opts`: `{ from, duration, format, decimals, currency, prefix, suffix, compact }`
— same formatting options as above, plus `format` may be a function `(n) => string` for full control. Returns
`{ promise, cancel() }`. If `from` is omitted, it is parsed out of the element's current text
(`fmt.parseNumber`) so re-triggering an animation continues from what's on screen. Cancelling a previous run
before starting a new one is automatic (per-element, via an internal `el.__oCount`).

## Keyboard & accessibility

* The animated digits (`<bdi aria-hidden="true">`) are decorative; a `.o-sr-only` sibling holds the final,
  stable value so screen readers never read intermediate tween frames.
* `<o-countup announce>` and `<o-stat countup>` report the *finished* value via `Orion.announce()` (for the
  stat's delta this is baked into `deltaGood`'s favorable/unfavorable wording, read together with the value).
* `prefers-reduced-motion` (or an already-cancelled/zero-duration run) jumps straight to the end value — no
  motion is ever the only way a value is conveyed.
* The goal bar/ring is `role="progressbar"` with `aria-valuemin`/`-max`/`-now`/`-valuetext` ("42% of 80 goal"
  or "Goal reached").
* A built-in sparkline is `role="img"` with an `aria-label` summarizing the trend (first/last/min/max) rather
  than exposing per-point SVG to assistive tech.
* `href` makes the tile a real, tab-focusable link (`.o-stat-link`, an absolutely positioned anchor covering
  the tile) with a computed `aria-label` combining the label, value and delta text.

## Limitations

* `delta` is a plain number, not itself computed from two `value`s — pass the already-computed change.
* The built-in sparkline (used when the charts package isn't loaded) has no zoom/crosshair-across-series and
  only line/area/bar types; load the charts package for the richer `<o-sparkline>`.
* `goalType="ring"` display clamps the shown percentage at 999% (`fmt.percent(Math.min(pct, 9.99))`) though
  the progress ring itself keeps filling past 100% only up to a full circle.
* `<o-stat>` does not itself poll or refresh data — wrap it in a `<o-widget refreshable>` (dashboard package)
  or call your own update code that sets `value`/`delta`/`sparkline`.
