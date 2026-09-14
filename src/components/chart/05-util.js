/* ============================================================================
 * Orion charts — shared helpers: SVG node pooling, path builders, LTTB,
 * bisect, color slots, number formatting, text measurement, i18n strings.
 * ========================================================================== */

i18n.add('en', {
  chart: {
    chart: 'Chart', viewTable: 'View as table', hideTable: 'Hide table', table: 'Data table', resetZoom: 'Reset zoom',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', download: 'Download', downloadAs: 'Download {format}', noData: 'No data',
    legend: 'Legend', series: 'Series', seriesN: 'Series {n}', category: 'Category', value: 'Value', total: 'Total', other: 'Other',
    keyboard: 'Use arrow keys to move between data points, Enter to select.',
    summary: '{type} with {count} series: {names}.', summaryOne: '{type}: {name}.', range: '{name} ranges from {min} to {max}.',
    point: '{series}, {label}: {value}', shareOf: '{value} of total', ofFirst: '{value} of first stage', ofPrev: '{value} of previous', ofPrevShort: '{value} of prev.',
    open: 'Open', high: 'High', low: 'Low', close: 'Close', change: 'Change', min: 'Min', q1: 'Q1', median: 'Median', q3: 'Q3', max: 'Max',
    outliers: 'Outliers', target: 'Target', less: 'Less', more: 'More', date: 'Date', x: 'X', y: 'Y', size: 'Size', region: 'Region',
    types: {
      line: 'Line chart', area: 'Area chart', column: 'Column chart', bar: 'Bar chart', mixed: 'Combined bar and line chart',
      scatter: 'Scatter plot', bubble: 'Bubble chart', candlestick: 'Candlestick chart', ohlc: 'OHLC chart', boxplot: 'Box plot',
      pie: 'Pie chart', donut: 'Donut chart', radar: 'Radar chart', polar: 'Polar area chart', radialBar: 'Radial bar chart',
      gauge: 'Gauge', progress: 'Progress ring', heatmap: 'Heatmap', calendar: 'Calendar heatmap', treemap: 'Treemap',
      funnel: 'Funnel chart', geo: 'Map', choropleth: 'Choropleth map', bubbleMap: 'Bubble map',
    },
  },
});

/* ── renderer registry (filled by 20-… files, used by 50-element.js) ── */
const CH_TYPES = Object.create(null);
function chRegister(types, renderer) { for (const t of toArr(types)) CH_TYPES[t] = renderer; }

/* ── SVG creation & pooling ─────────────────────────────────────────── */
const CH_NS = 'http://www.w3.org/2000/svg';
function chEl(tag, attrs, parent) {
  const el = doc.createElementNS(CH_NS, tag);
  if (attrs) chAttr(el, attrs);
  if (parent) parent.appendChild(el);
  return el;
}
function chAttr(el, attrs) {
  for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) el.removeAttribute(k);
    else { const s = v === true ? '' : String(v); if (el.getAttribute(k) !== s) el.setAttribute(k, s); }
  }
  return el;
}
/** Set text only when it changed (keeps re-renders cheap). */
function chSetText(el, s) { s = s == null ? '' : String(s); if (el.textContent !== s) el.textContent = s; return el; }

/**
 * A <g> whose children are reused by position between renders, so animation frames
 * patch attributes instead of rebuilding nodes: begin() -> next(tag) ... -> end().
 */
class ChLayer {
  constructor(parent, cls) { this.g = chEl('g', { class: cls }, parent); this.pool = []; this.n = 0; }
  begin() { this.n = 0; return this; }
  next(tag, cls) {
    let el = this.pool[this.n];
    if (!el || el.localName !== tag) {
      const nel = chEl(tag);
      if (el) el.replaceWith(nel); else this.g.appendChild(nel);
      this.pool[this.n] = el = nel;
      el.__new = true;
    } else el.__new = false;
    if (cls != null && el.getAttribute('class') !== cls) el.setAttribute('class', cls);
    this.n++;
    return el;
  }
  end() { for (let i = this.n; i < this.pool.length; i++) this.pool[i].remove(); this.pool.length = this.n; return this; }
  clear() { return this.begin().end(); }
}

/* ── numbers & geometry ─────────────────────────────────────────────── */
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
/** Snap a coordinate so 1px strokes render crisp. */
const crisp = v => Math.round(v) + 0.5;
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const chNum = v => { if (v == null || v === '' || typeof v === 'boolean') return null; const n = +v; return Number.isFinite(n) ? n : null; };
const chIsDateLike = v => v instanceof Date || (isStr(v) && /^\d{4}-\d{2}(-\d{2})?([T ]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(v.trim()));
function chTime(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return +v;
  if (isNum(v)) return v;
  const d = date.parse(v);
  return d ? +d : null;
}
function chExtent(values) {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) if (v != null && Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return lo === Infinity ? null : [lo, hi];
}
/** Nearest index in a sorted numeric array (binary search). */
function chBisect(arr, x, acc = v => v) {
  let lo = 0, hi = arr.length - 1;
  if (hi < 0) return -1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (acc(arr[mid]) < x) lo = mid; else hi = mid; }
  return Math.abs(acc(arr[lo]) - x) <= Math.abs(acc(arr[hi]) - x) ? lo : hi;
}

/**
 * Largest-Triangle-Three-Buckets downsampling. pts: [{x, y}] sorted by x.
 * Keeps the visual shape (peaks & troughs) with `threshold` points.
 */
function chLTTB(pts, threshold) {
  const n = pts.length;
  if (threshold >= n || threshold < 3) return pts;
  const out = [pts[0]], every = (n - 2) / (threshold - 2);
  let a = 0;
  for (let i = 0; i < threshold - 2; i++) {
    let avx = 0, avy = 0;
    const s = Math.floor((i + 1) * every) + 1, e = Math.min(Math.floor((i + 2) * every) + 1, n);
    for (let j = s; j < e; j++) { avx += pts[j].x; avy += pts[j].y ?? 0; }
    const len = e - s || 1; avx /= len; avy /= len;
    const rs = Math.floor(i * every) + 1, re = Math.floor((i + 1) * every) + 1;
    const ax = pts[a].x, ay = pts[a].y ?? 0;
    let max = -1, next = rs;
    for (let j = rs; j < re; j++) {
      const area = Math.abs((ax - avx) * ((pts[j].y ?? 0) - ay) - (ax - pts[j].x) * (avy - ay));
      if (area > max) { max = area; next = j; }
    }
    out.push(pts[next]); a = next;
  }
  out.push(pts[n - 1]);
  return out;
}

/* ── path builders ──────────────────────────────────────────────────── */
/** Path through [[x,y],...] runs (null entries break the line). curve: linear | smooth | step */
function chLinePath(pts, curve = 'linear') {
  let d = '', run = [];
  const flush = () => { if (run.length) d += __chRun(run, curve); run = []; };
  for (const p of pts) { if (!p) flush(); else run.push(p); }
  flush();
  return d;
}
function __chRun(p, curve) {
  if (p.length === 1) return `M${r1(p[0][0])},${r1(p[0][1])}h0`;
  if (curve === 'step') {
    let d = `M${r1(p[0][0])},${r1(p[0][1])}`;
    for (let i = 1; i < p.length; i++) { const mx = (p[i - 1][0] + p[i][0]) / 2; d += `H${r1(mx)}V${r1(p[i][1])}`; }
    return d + `H${r1(p[p.length - 1][0])}`;
  }
  if (curve !== 'smooth' || p.length < 3) return 'M' + p.map(q => r1(q[0]) + ',' + r1(q[1])).join('L');
  // monotone cubic (Fritsch–Carlson): smooth without overshooting the data
  const n = p.length, m = [], t = new Array(n);
  for (let i = 0; i < n - 1; i++) { const dx = p[i + 1][0] - p[i][0]; m[i] = dx ? (p[i + 1][1] - p[i][1]) / dx : 0; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (!m[i]) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${r1(p[0][0])},${r1(p[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (p[i + 1][0] - p[i][0]) / 3;
    d += `C${r1(p[i][0] + h)},${r1(p[i][1] + t[i] * h)},${r1(p[i + 1][0] - h)},${r1(p[i + 1][1] - t[i + 1] * h)},${r1(p[i + 1][0])},${r1(p[i + 1][1])}`;
  }
  return d;
}
/** Closed area between a top line and a bottom line (arrays of [x,y], same length, no nulls). */
function chAreaPath(top, bottom, curve) {
  if (!top.length) return '';
  const up = __chRun(top, curve);
  const back = bottom.slice().reverse();
  const down = __chRun(back, curve).replace(/^M/, 'L');
  return up + down + 'Z';
}
/**
 * Bar with a rounded data-end and a square baseline. (x, y, w, h) is the rect;
 * `end` is the side holding the data end: 'top' | 'bottom' | 'right' | 'left' | 'none'.
 */
function chBarPath(x, y, w, h, r, end = 'top') {
  if (w <= 0 || h <= 0) return '';
  const X = r1(x), Y = r1(y), W = r1(w), H = r1(h);
  if (end === 'none' || r <= 0) return `M${X},${Y}h${W}v${H}h${-W}Z`;
  if (end === 'top' || end === 'bottom') {
    const rr = r1(Math.min(r, w / 2, h));
    return end === 'top'
      ? `M${X},${r1(y + h)}V${r1(y + rr)}a${rr},${rr} 0 0 1 ${rr},${-rr}H${r1(x + w - rr)}a${rr},${rr} 0 0 1 ${rr},${rr}V${r1(y + h)}Z`
      : `M${X},${Y}V${r1(y + h - rr)}a${rr},${rr} 0 0 0 ${rr},${rr}H${r1(x + w - rr)}a${rr},${rr} 0 0 0 ${rr},${-rr}V${Y}Z`;
  }
  const rr = r1(Math.min(r, h / 2, w));
  return end === 'right'
    ? `M${X},${Y}H${r1(x + w - rr)}a${rr},${rr} 0 0 1 ${rr},${rr}V${r1(y + h - rr)}a${rr},${rr} 0 0 1 ${-rr},${rr}H${X}Z`
    : `M${r1(x + w)},${Y}H${r1(x + rr)}a${rr},${rr} 0 0 0 ${-rr},${rr}V${r1(y + h - rr)}a${rr},${rr} 0 0 0 ${rr},${rr}H${r1(x + w)}Z`;
}
/** Rounded rect path (all corners). */
function chRectPath(x, y, w, h, r) {
  if (w <= 0 || h <= 0) return '';
  const rr = Math.min(r, w / 2, h / 2);
  if (rr <= 0.2) return `M${r1(x)},${r1(y)}h${r1(w)}v${r1(h)}h${r1(-w)}Z`;
  return `M${r1(x + rr)},${r1(y)}H${r1(x + w - rr)}a${r1(rr)},${r1(rr)} 0 0 1 ${r1(rr)},${r1(rr)}V${r1(y + h - rr)}a${r1(rr)},${r1(rr)} 0 0 1 ${r1(-rr)},${r1(rr)}H${r1(x + rr)}a${r1(rr)},${r1(rr)} 0 0 1 ${r1(-rr)},${r1(-rr)}V${r1(y + rr)}a${r1(rr)},${r1(rr)} 0 0 1 ${r1(rr)},${r1(-rr)}Z`;
}
/** Point on a circle; angle in radians, 0 = 12 o'clock, clockwise. */
const chPolar = (cx, cy, r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
/** Annular sector (r0 = 0 for a pie slice). Angles clockwise from 12 o'clock. */
function chArcPath(cx, cy, r0, r, a0, a1) {
  let da = a1 - a0;
  if (da <= 1e-6 || r <= 0) return '';
  if (da >= Math.PI * 2 - 1e-6) { // full ring: two halves
    const mid = a0 + Math.PI;
    return chArcPath(cx, cy, r0, r, a0, mid) + chArcPath(cx, cy, r0, r, mid, a0 + Math.PI * 2 - 1e-6);
  }
  const large = da > Math.PI ? 1 : 0;
  const [x0, y0] = chPolar(cx, cy, r, a0), [x1, y1] = chPolar(cx, cy, r, a1);
  let d = `M${r2(x0)},${r2(y0)}A${r2(r)},${r2(r)} 0 ${large} 1 ${r2(x1)},${r2(y1)}`;
  if (r0 > 0) {
    const [x2, y2] = chPolar(cx, cy, r0, a1), [x3, y3] = chPolar(cx, cy, r0, a0);
    d += `L${r2(x2)},${r2(y2)}A${r2(r0)},${r2(r0)} 0 ${large} 0 ${r2(x3)},${r2(y3)}Z`;
  } else d += `L${r2(cx)},${r2(cy)}Z`;
  return d;
}
/** Open arc stroke path (for gauges / rings with round caps). */
function chArcStroke(cx, cy, r, a0, a1) {
  const da = a1 - a0;
  if (da <= 1e-6) return '';
  if (da >= Math.PI * 2 - 1e-4) { const [x, y] = chPolar(cx, cy, r, a0); const [xm, ym] = chPolar(cx, cy, r, a0 + Math.PI); return `M${r2(x)},${r2(y)}A${r2(r)},${r2(r)} 0 1 1 ${r2(xm)},${r2(ym)}A${r2(r)},${r2(r)} 0 1 1 ${r2(x)},${r2(y)}`; }
  const [x0, y0] = chPolar(cx, cy, r, a0), [x1, y1] = chPolar(cx, cy, r, a1);
  return `M${r2(x0)},${r2(y0)}A${r2(r)},${r2(r)} 0 ${da > Math.PI ? 1 : 0} 1 ${r2(x1)},${r2(y1)}`;
}

/* ── color slots ────────────────────────────────────────────────────── */
const CH_MAX_SLOTS = 8;
/**
 * chColor(spec, index) -> CSS color expression.
 *   undefined -> categorical slot (index+1) — fixed order, never cycled (callers fold past 8)
 *   3 | '3'  -> var(--o-chart-3)      'status-good' / 'seq-400' / 'primary' -> var(--o-…)
 *   '--my-var' -> var(--my-var)       'other' -> de-emphasis gray      '#hex' / 'rgb()' -> as is
 */
function chColor(spec, i = 0) {
  if (spec == null || spec === '') return i < CH_MAX_SLOTS ? `var(--o-chart-${i + 1})` : 'var(--o-chart-other)';
  if (isNum(spec) || /^\d+$/.test(String(spec))) return `var(--o-chart-${clamp(+spec, 1, CH_MAX_SLOTS)})`;
  const s = String(spec).trim();
  if (s.startsWith('--')) return `var(${s})`;
  if (s === 'other' || s === 'muted' || s === 'deemphasis') return 'var(--o-chart-other)';
  if (/^(chart-\d|seq-\d00|div-(neg|mid|pos)|status-(good|warning|serious|critical))$/.test(s) || /^(primary|secondary|success|danger|warning|info)$/.test(s)) return `var(--o-${s})`;
  return s;
}

/* ── number formatting ──────────────────────────────────────────────── */
/**
 * chFormatter(format, { currency, decimals, locale, prefix, suffix, compactAuto })
 *   format: 'number' | 'integer' | 'currency' | 'percent' | 'compact' | 'bytes' | Intl.NumberFormat options | fn(v) -> string
 *   percent expects ratios (0.42 -> 42%).
 */
function chFormatter(format, o = {}) {
  const loc = o.locale || undefined, dec = o.decimals;
  const wrap = f => v => (v == null || Number.isNaN(+v) ? '' : (o.prefix || '') + f(+v) + (o.suffix || ''));
  if (isFn(format)) return v => (v == null ? '' : String(format(v)));
  if (isObj(format)) return wrap(v => fmt.number(v, format, loc));
  switch (format) {
    case 'currency': return wrap(v => fmt.currency(v, o.currency, dec != null ? { minimumFractionDigits: dec, maximumFractionDigits: dec } : Math.abs(v) >= 1000 || Number.isInteger(v) ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }, loc));
    case 'currency-compact': return wrap(v => fmt.currency(v, o.currency, { notation: 'compact', maximumFractionDigits: 1 }, loc));
    case 'percent': return wrap(v => fmt.percent(v, dec ?? (Math.abs(v) < 0.1 && v !== 0 ? 1 : 0), loc));
    case 'compact': return wrap(v => fmt.compact(v, loc));
    case 'bytes': return wrap(v => fmt.bytes(v, dec ?? 1));
    case 'integer': return wrap(v => fmt.number(Math.round(v), {}, loc));
    default: return wrap(v => fmt.number(v, dec != null ? { minimumFractionDigits: dec, maximumFractionDigits: dec } : { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 2 : 4 }, loc));
  }
}
/** Axis tick formatter: compact for big numbers, decimals from the tick step. */
function chAxisFormatter(format, o, step, maxAbs) {
  if (isFn(format)) return v => String(format(v));
  const loc = o.locale || undefined, dec = chStepDecimals(step);
  if (format === 'percent') return v => fmt.percent(v, Math.max(0, dec - 2), loc);
  if (format === 'currency' || format === 'currency-compact') {
    return maxAbs >= 10000 || format === 'currency-compact'
      ? v => fmt.currency(v, o.currency, { notation: 'compact', maximumFractionDigits: 1 }, loc)
      : v => fmt.currency(v, o.currency, { minimumFractionDigits: 0, maximumFractionDigits: dec }, loc);
  }
  if (format === 'bytes') return v => fmt.bytes(v, 0);
  if (isObj(format)) return v => fmt.number(v, format, loc);
  if (format === 'compact' || (format !== 'number' && format !== 'integer' && maxAbs >= 10000)) return v => fmt.compact(v, loc);
  return v => fmt.number(v, { minimumFractionDigits: dec, maximumFractionDigits: dec }, loc);
}

/* ── text measurement ───────────────────────────────────────────────── */
let __chCtx = null;
const __chMeasureCache = new Map();
function chMeasure(text, font) {
  text = String(text ?? '');
  if (!text) return 0;
  const key = font + '|' + text;
  let w = __chMeasureCache.get(key);
  if (w != null) return w;
  if (!__chCtx) { try { __chCtx = doc.createElement('canvas').getContext('2d'); } catch { __chCtx = null; } }
  if (__chCtx) { __chCtx.font = font; w = __chCtx.measureText(text).width; } else w = text.length * 6.5;
  if (__chMeasureCache.size > 4000) __chMeasureCache.clear();
  __chMeasureCache.set(key, w);
  return w;
}
/** Truncate text with an ellipsis so it fits `max` px. */
function chFit(text, max, font) {
  text = String(text ?? '');
  if (chMeasure(text, font) <= max) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (chMeasure(text.slice(0, mid) + '…', font) <= max) lo = mid; else hi = mid - 1; }
  return lo ? text.slice(0, lo).trimEnd() + '…' : '';
}
/** Readable ink class for a label drawn inside a fill color (resolved rgb string). */
function chInkClass(rgb) {
  const c = color.parse(rgb);
  if (!c) return 'is-ink-dark';
  return color.contrast(rgb, '#ffffff') >= 3.2 || color.luminance(rgb) < 0.28 ? 'is-ink-light' : 'is-ink-dark';
}

/** Arrays: fold items past `max` into one "Other" entry (sum). */
function chFold(items, max, make) {
  if (items.length <= max) return items;
  const head = items.slice(0, max - 1), tail = items.slice(max - 1);
  return [...head, make(tail)];
}
/** Quantize v in [min,max] into bins 1..n (0 for missing). */
function chBin(v, min, max, n) {
  if (v == null || !Number.isFinite(v)) return 0;
  if (max <= min) return Math.ceil(n / 2);
  return clamp(Math.floor(((v - min) / (max - min)) * n) + 1, 1, n);
}
/** Map n requested classes onto the 7 heat steps (evenly spread). */
const chHeatStep = (bin, n) => (n >= 7 ? bin : Math.round(1 + ((bin - 1) * 6) / Math.max(1, n - 1)));
