# chart — `<o-chart>` / `Orion.chart()`

Hand-written SVG chart engine (no third-party code). Cartesian (line, area, column, bar,
stacked, 100%, mixed, scatter, bubble, candlestick, OHLC, box plot), radial (pie, donut,
radar, polar area, radial bar, gauge, progress ring), matrix (heatmap, calendar heatmap,
treemap, funnel) and geo (choropleth, bubble map) charts that theme with CSS tokens.

Docs: `docs/components/charts*.html` · examples: `docs/examples/charts-*.html` ·
demo map: `docs/fixtures/charts/aurelia.geojson`.

## Files

| File | Contents |
|---|---|
| `00-scales.js` | nice ticks, linear / log / band / point scales, calendar-aligned time ticks & localized labels |
| `05-util.js` | i18n strings (`chart.*`), renderer registry, SVG node pooling (`ChLayer`), path builders (monotone smooth, step, rounded bars, arcs), LTTB, bisect, color slots, number formatters, text measurement |
| `10-axes.js` | cartesian layout (margins from measured labels, label thinning/rotation), gridlines, annotations |
| `20-cartesian.js` | cartesian data model: x-type inference, points, stacking / percent, zoom window, extents |
| `22-cartesian-render.js` | bars, areas, lines, dots, bubbles, candles, boxes, direct labels, tweens, stream slide |
| `24-cartesian-view.js` | crosshair / per-mark / nearest-point hover, keyboard, brush zoom, table view, summary |
| `30-radial.js` | pie, donut, radar, polar, radialBar, gauge, progress |
| `35-matrix.js` | heatmap, calendar, treemap (squarified), funnel |
| `38-geo.js` | choropleth & bubble maps (equirectangular / mercator), zoom & pan |
| `40-tooltip-legend.js` | tooltip (`.o-floating`), legend, scale legend, table view, CSV |
| `50-element.js` | `Chart` class, `<o-chart>`, `Orion.chart()`, animation loop, interaction, export |
| `chart.css` | tokens-only styles (`--o-ch-*` derived steps flip in dark mode) |

## Usage

```html
<o-chart type="column" height="280"
  config='{"labels":["Q1","Q2","Q3"],"series":[{"name":"Sales","data":[12,19,15]}]}'></o-chart>
```

```js
const chart = Orion.chart('#panel', { type: 'line', labels, series, yAxis: { format: 'currency' } });
chart.update({ series: newSeries });          // tweens
chart.append([{ x: new Date(), y: 42 }], { max: 60 });   // stream
chart.on('point-click', d => console.log(d)); // or el.addEventListener('o-point-click', …)
```

## Public API

### `Orion.chart(target, config) → Chart`
`target` is an element or selector. For `<o-chart>` it configures that element; for any
other element it appends an owned `<o-chart>` child (removed by `destroy()`).
`Orion.chart.register(types, renderer)` adds a chart type; `Orion.chart.types()` lists them.
`Orion.Chart` is the class, `Orion.OChart` the element class.

### `<o-chart>` properties / attributes
| Prop | Attr | Type | Notes |
|---|---|---|---|
| `config` | `config` (JSON) | `ChartConfig` | whole configuration; replacing it animates |
| `type` | `type` | `ChartType` | overrides `config.type` |
| `series` / `labels` / `data` | JSON | arrays | data shortcuts (patch + animate) |
| `options` | JSON | `Partial<ChartConfig>` | merged over `config` |
| `height` | `height` | `number \| string` | plot height (px incl. axes), `'fill'`, `'100%'` |
| `texts` | – | `Record<string,string>` | per-instance strings |
| `chart` | – | `Chart` (read-only) | the instance; methods below are also proxied on the element |

### `Chart` methods
| Method | Returns | Description |
|---|---|---|
| `update(patch \| series[], { animate = true })` | `Chart` | merge a config patch (or replace series) and tween |
| `setData(series, { animate, labels })` | `Chart` | replace series (a number array = one series) |
| `append(values, { max, label, animate })` | `Chart` | streaming; one entry per series (`number \| {x,y} \| [x,y]`) or `{ label, values }` |
| `setOptions(options)` | `Chart` | alias of `update` for options |
| `highlight(index \| null)` | `Chart` | emphasise one series (others → `--o-chart-other`) |
| `toggleSeries(index, force?)` | `Chart` | hide/show a series or slice (keeps ≥ 1 visible) |
| `zoom(min, max)` / `resetZoom()` | `Chart` | x zoom in data units (category indices) / maps reset |
| `toggleTable(force?)` | `Chart` | show the accessible data table |
| `exportSVG({ legend = true, background = true })` | `string` | standalone SVG, computed colors inlined |
| `exportPNG({ scale = 2 })` | `Promise<Blob>` | rasterised export |
| `exportCSV()` | `string` | table data (raw values), RFC 4180 |
| `download(format = 'png', filename?)` | `Promise<void>` | `'png' \| 'svg' \| 'csv'` |
| `getData()` | `{ labels, series, data }` | copy of the current data |
| `config` (getter) | `ChartConfig` | normalised configuration |
| `resize()` | `Chart` | force re-measure |
| `destroy()` | `void` | release observers/listeners, remove owned element |
| `on(name, fn)` / `off(name, fn)` | | instance events (names without the `o-` prefix) |

### Events (bubble from the element; also `chart.on(name)` without `o-`)
| Event | `detail` |
|---|---|
| `o-point-click` | `{ series, index, value, label, name, text, x? }` — click/tap or Enter |
| `o-point-hover` | same, when the active point changes |
| `o-legend-toggle` | `{ series, name, visible, user }` |
| `o-zoom` | `{ min, max }` (reset → `null`s); maps: `{ scale, x, y }` |
| `o-render` | `{ type }` after a completed render/animation |

## Config shape (for TypeScript types)

```ts
type ChartType =
  | 'line' | 'area' | 'column' | 'bar' | 'mixed' | 'scatter' | 'bubble' | 'candlestick' | 'ohlc' | 'boxplot'
  | 'pie' | 'donut' | 'radar' | 'polar' | 'radialBar' | 'gauge' | 'progress'
  | 'heatmap' | 'calendar' | 'treemap' | 'funnel' | 'choropleth' | 'bubbleMap' | 'geo';
// aliases accepted: doughnut, polarArea/polar-area, radialBar/radial-bar/radialbar, bubbleMap/bubble-map/bubblemap,
//   box/box-plot, stock, combo, map, calendar-heatmap, progress-radial/ring, hbar, columns, lines, areas

type ColorSpec = number | string;          // 1..8 slot, 'status-good' | 'seq-400' | 'div-pos' | 'primary' | '--var' | CSS color
type Format = 'number' | 'integer' | 'currency' | 'currency-compact' | 'percent' | 'compact' | 'bytes'
  | Intl.NumberFormatOptions | ((v: number) => string);   // 'percent' expects ratios (0.42 → 42%)
type XValue = number | string | Date;

interface ChartConfig {
  type?: ChartType;                        // default 'line'
  title?: string; subtitle?: string; description?: string;
  labels?: XValue[];                       // categories (dates → time axis for line/area)
  series?: Series[] | number[];            // number[] = one series
  data?: any[];                            // one-series shorthand
  height?: number | string | 'fill' | 'auto';
  xAxis?: Axis | 'category' | 'time' | 'linear' | 'log';
  yAxis?: Axis | Format;                   // one value axis — no dual axes by design
  stacked?: boolean | 'percent';
  horizontal?: boolean;
  curve?: 'linear' | 'smooth' | 'step';    // smooth = monotone cubic (no overshoot)
  markers?: 'auto' | boolean;
  dataLabels?: 'auto' | boolean | 'end' | 'all' | 'none';
  annotations?: Annotation[];
  legend?: false | true | { show?: boolean; position?: 'top' | 'bottom' | 'start' | 'end' };
  tooltip?: false | { show?: boolean; shared?: boolean; format?: (v: number) => string };
  toolbar?: false | true | { show?: boolean; table?: boolean; download?: boolean };
  zoom?: true | { x: boolean };
  animate?: boolean | number;              // number = duration scale (ms of the entry animation)
  colors?: ColorSpec[];
  fold?: boolean;                          // fold series/slices past 8 into "Other" (default true)
  maxPoints?: number;                      // default window for append()
  barWidth?: number;                       // max bar thickness, default 24
  locale?: string;
  texts?: Record<string, string>;          // e.g. { viewTable: 'Tabelle' }
  empty?: string;                          // "No data" text
  sizeLabel?: string; sizeFormat?: Format; // bubble third value
  pie?: { innerRadius?: number; startAngle?: number; labels?: 'outside' | 'inside' | false; center?: { value?: string; label?: string } };
  radar?: { min?: number; max?: number; grid?: 'polygon' | 'circle' };
  radialBar?: { max?: number; arc?: number; innerRadius?: number };
  gauge?: GaugeOptions;
  progress?: GaugeOptions & { thickness?: number };
  heatmap?: { scale?: 'sequential' | 'diverging'; bins?: number; min?: number; max?: number; mid?: number; yLabels?: string[] };
  calendar?: { from?: XValue; to?: XValue; levels?: number; max?: number; weekStart?: number };
  treemap?: {};
  funnel?: {};
  geo?: { geojson: any; projection?: 'equirectangular' | 'mercator'; key?: string; nameKey?: string;
          bins?: number; min?: number; max?: number; maxZoom?: number; wheel?: boolean };
}

interface Series {
  name?: string;
  data: Array<number | null | Point | [XValue, number] | Candle | BoxStats | number[]> | Record<string, number>;
  type?: 'column' | 'bar' | 'line' | 'area' | 'scatter' | 'bubble' | 'candlestick' | 'ohlc' | 'boxplot';
  color?: ColorSpec;
  stack?: string;                          // stack group id
  dashed?: boolean; curve?: 'linear' | 'smooth' | 'step'; area?: boolean; markers?: boolean | 'auto';
  size?: number;                           // scatter dot radius
  value?: number;                          // one-value series (pie / gauge shorthands)
}
interface Point { x?: XValue; y?: number; z?: number; r?: number; size?: number; label?: string; color?: ColorSpec;
                  value?: number; date?: XValue; lon?: number; lat?: number; id?: string; name?: string; coordinates?: [number, number];
                  children?: Point[] /* treemap */ }
interface Candle { x?: XValue; o: number; h: number; l: number; c: number }   // or open/high/low/close, or [x,o,h,l,c]
interface BoxStats { x?: XValue; min: number; q1: number; median: number; q3: number; max: number; outliers?: number[] } // or raw samples number[]

interface Axis {
  type?: 'category' | 'time' | 'linear' | 'log';
  title?: string;
  format?: Format | string;                // x on dates also accepts date tokens ('MMM D') or fn(value, index)
  tickFormat?: Format;
  currency?: string; decimals?: number; prefix?: string; suffix?: string;
  min?: number | XValue; max?: number | XValue;
  beginAtZero?: boolean;                   // always on for bars/areas; auto for lines
  ticks?: number;                          // target tick count
  grid?: boolean; rotate?: boolean;
}
interface Annotation {
  type?: 'line' | 'band';
  axis?: 'y' | 'x';
  value?: number | XValue; from?: number | XValue; to?: number | XValue;
  label?: string; color?: ColorSpec; status?: 'good' | 'warning' | 'serious' | 'critical'; dashed?: boolean;
}
interface GaugeOptions {
  value?: number; min?: number; max?: number; target?: number;
  bands?: Array<{ from: number; to: number; status?: 'good' | 'warning' | 'serious' | 'critical'; color?: ColorSpec; label?: string }>;
  severity?: boolean; arc?: number; needle?: boolean; label?: string; color?: ColorSpec; minMax?: boolean;
  format?: (v: number) => string;
}
```

## Renderer interface (`Orion.chart.register`)

```ts
interface Renderer {
  prepare(chart: Chart): Model & { empty?: boolean };
  render(chart: Chart, model: Model, frame: { t: number; raw: number; mode: 'enter' | 'update' | 'stream' | 'static'; prev: Model | null }): View;
  legend?(chart, model): LegendItem[] | { scale: ScaleLegend } | null;
  table?(chart, model): { head: string[]; rows: string[][]; raw?: any[][]; numeric?: boolean[] };
  summary?(chart, model): string;
  autoHeight?(chart, model, width: number): number;
  defaultHeight?: number; toolbar?: false; zoomButtons?: true;
}
interface View {
  hit?(x: number, y: number, target: EventTarget): Active | null;
  mark?(active: Active | null): void; tip?(active): Tooltip; anchor?(active, pointer?): { x: number; y: number; place: string };
  point?(active): object; first?(): Active; nav?(active, key: string): Active;
  dragStart?/dragMove?/dragEnd?/wheel?/dblclick?/key?/zoomBy?/zoomed?/resetZoom?: Function;
}
```
Inside a renderer use `chart.layers(names)` (pooled `ChLayer` per name), `chart.clip()`, `chart.font()`,
`chart.fmtValue()`, `chart.resolveColor()` and `chart.t()`.

## Styling & tokens

Marks read `--sc` (series color) through `--c`; `.o-chart.has-hl` swaps non-highlighted marks to
`--o-chart-other`. Tokens used: `--o-chart-1…8`, `--o-seq-100…700` (as `--o-ch-q1…7`, reversed in
dark mode), ordinal `--o-ch-o1…5` (seq 700→300 light / 200→600 dark), diverging `--o-div-*` (as
`--o-ch-d1…7`), `--o-status-*`, `--o-chart-grid`, `--o-chart-axis`, `--o-chart-surface`, text/border tokens.
Set `--o-chart-surface` on the chart if it sits on something other than `--o-surface`
(it is the color of the 2px gaps and marker rings).

Palette validation (dataviz validator, Orion surfaces `#ffffff` / `#121a2b`): all hard gates pass;
worst adjacent CVD ΔE 9.1 / 8.4, normal-vision 19.6 / 19.3; first three slots pass all-pairs;
light slots 3–5 are below 3:1 contrast → every chart ships a table view and direct labels.

## Accessibility

- Plot: focusable `role="img"` with a generated summary (`aria-label`) + keyboard hint (`aria-describedby`).
- Arrow keys / Home / End / PageUp / PageDown move the active point (announced via `Orion.announce`),
  Enter/Space fire `o-point-click`, Escape clears. Maps add `+` `-` `0`.
- "View as table" toolbar toggle; when closed the table stays in the DOM as `.o-sr-only` (≤ 400 rows).
- Legend items are `aria-pressed` buttons. Reduced motion disables animation; forced-colors adds outlines.

## Notes & limits

- One value axis per chart (deliberately no dual axes).
- The plot is not mirrored in RTL (time runs left→right); legends, toolbar and tooltips follow `dir`.
- LTTB downsampling applies to line/area series > 2,000 points; scatter draws every point.
- Geo supports Polygon/MultiPolygon/Point GeoJSON; no TopoJSON, no graticule, no pinch-zoom.
