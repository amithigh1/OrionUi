# sparkline — `<o-sparkline>` / `Orion.sparkline()`

Tiny, dependency-free inline trend (line, area, bar, win/loss). Self-contained: does not require
the `chart` component. Default styling follows the stat-tile contract — trend in the de-emphasis
gray, current period (last point) in the accent (`--o-chart-1`); set `color` to paint the whole trend.

```html
<o-sparkline values="4,8,5,9,7,11"></o-sparkline>
<o-sparkline type="bar" color="2" values="[3, 5, -2, 6]"></o-sparkline>
<o-sparkline type="winloss" values="1,-1,1,0,1"></o-sparkline>
```

```js
const sp = Orion.sparkline('#cell', [4, 8, 5, 9], { type: 'area', color: 3, labels: ['Mon', 'Tue', 'Wed', 'Thu'] });
sp.values = [5, 9, 6, 11];   // re-renders
```

Size it with CSS (default `6rem × 1.75rem`, `display: inline-block`); it re-renders on resize.

## Properties / attributes

| Prop | Attribute | Type | Default | Description |
|---|---|---|---|---|
| `values` | `values` | `string` (`"4,8,5"` / JSON) \| `number[]` | `[]` | Data; `null`/empty entries leave a gap |
| `labels` | `labels` (JSON) | `string[]` | | Shown next to the value in the tooltip |
| `type` | `type` | `'line' \| 'area' \| 'bar' \| 'winloss'` | `'line'` | Mark type (winloss uses the sign only) |
| `color` | `color` | slot `1–8` \| token (`status-good`, `seq-400`, `--my-var`) \| CSS color | | Paint the whole trend |
| `highlight` | `highlight` | `'last' \| 'minmax' \| 'none'` | `'last'` | Emphasised points / bar |
| `min` / `max` | `min` / `max` | `number` | data extent | Fix the scale to compare several sparklines |
| `format` | `format` | `'number' \| 'percent' \| 'currency' \| 'compact'` \| `(v) => string` | `'number'` | Tooltip & summary formatting |
| `currency` | `currency` | `string` | `Orion.config.currency` | For `format="currency"` |
| `label` | `label` | `string` | `"Trend"` | Accessible name prefix |
| `curve` | `curve` | `'linear' \| 'smooth'` | `'linear'` | Line shape |
| `tooltip` | `tooltip` | `boolean` | `true` | Hover tooltip |

## JS

- `Orion.sparkline(target, values, opts) → HTMLElement` — configures `target` if it is an
  `<o-sparkline>`, otherwise creates one inside `target` (reused on later calls).
- `Orion.OSparkline` — element class.
- `el.data` — parsed numeric values.

## Accessibility

`role="img"` with `aria-label` = `"{label}: {count} values, from {first} to {last}; low {min}, high {max}."`
(i18n keys `sparkline.label`, `sparkline.summary`, `sparkline.win|loss|draw`). The tooltip is
decorative (`aria-hidden`); pair a sparkline with the figure it summarises (see KPI tiles in the docs).

## Tokens

`--o-chart-1…8`, `--o-status-good` / `--o-status-critical` (win/loss), `--o-chart-axis` (bar baseline),
`--o-chart-surface` (dot ring), `--o-text-subtle` (de-emphasis). Local variables: `--o-spark-muted`,
`--o-spark-accent`, `--o-spark-c`.
