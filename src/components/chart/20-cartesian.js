/* ============================================================================
 * Orion charts — cartesian model: line, area, column, bar, stacked / 100%,
 * mixed bar+line (one value axis), scatter, bubble, candlestick, OHLC, box plot.
 * prepare() normalises data into points, infers the x type, stacks, and computes
 * the value extent; rendering lives in 22-cartesian-render.js.
 * ========================================================================== */

const CH_CART_TYPES = ['line', 'area', 'column', 'bar', 'mixed', 'scatter', 'bubble', 'candlestick', 'ohlc', 'boxplot'];
const CH_BARLIKE = new Set(['column', 'candlestick', 'ohlc', 'boxplot']);
const __chSType = t => (t === 'bar' ? 'column' : t === 'spline' ? 'line' : t);

/** Raw series list from config (series | data shorthand), never mutated. */
function chRawSeries(c) {
  let src = c.series;
  if (!src || (Array.isArray(src) && !src.length)) src = c.data != null ? [{ data: c.data }] : [];
  if (!Array.isArray(src)) src = [src];
  if (src.length && !isObj(src[0]) && !Array.isArray(src[0])) src = [{ data: src }];
  return src.filter(s => s != null).map(s => (Array.isArray(s) ? { data: s } : s));
}

/** Quartiles for a box plot from raw samples. */
function chBoxStats(vals) {
  const a = vals.map(chNum).filter(v => v != null).sort((x, y) => x - y);
  if (!a.length) return null;
  const q = p => { const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
  const q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  const inside = a.filter(v => v >= lo && v <= hi);
  return { min: inside[0] ?? a[0], q1, median: q(0.5), q3, max: inside[inside.length - 1] ?? a[a.length - 1], outliers: a.filter(v => v < lo || v > hi) };
}

function chCartPrepare(ch) {
  const c = ch.cfg, type = c.type;
  const base = type === 'bar' ? 'column' : type;
  const horizontal = type === 'bar' || (!!c.horizontal && (type === 'column' || type === 'mixed'));
  let raw = chRawSeries(c);
  const additive = CH_BARLIKE.has(base) || base === 'area' || c.stacked;
  // fixed categorical order: fold series past 8 into "Other" (additive) or de-emphasis gray
  if (raw.length > CH_MAX_SLOTS && c.fold !== false && additive && base !== 'candlestick' && base !== 'ohlc' && base !== 'boxplot') {
    raw = chFold(raw, CH_MAX_SLOTS, tail => ({ name: ch.t('chart.other'), color: 'other', __other: tail.length, data: (tail[0].data || []).map((_, i) => tail.reduce((s, x) => s + (chNum(isObj(x.data?.[i]) ? x.data[i].y : x.data?.[i]) || 0), 0)) }));
  }
  let labels = c.labels != null ? toArr(c.labels) : null;
  const defType = i => (base === 'mixed' ? (i === 0 ? 'column' : 'line') : base);
  const series = raw.map((s, i) => ({
    key: i, raw: s, name: s.name != null ? String(s.name) : ch.t('chart.seriesN', { n: i + 1 }),
    type: __chSType(s.type) || defType(i), color: chColor(c.colors?.[i] ?? s.color, i),
    dashed: !!s.dashed, curve: s.curve || c.curve || 'linear', stack: s.stack, hidden: ch.state.hidden.has(i), other: !!s.__other,
    markers: s.markers ?? c.markers,
  }));
  for (const s of series) if (s.type === 'line' && s.raw.area) s.area = true; else if (s.type === 'area') s.area = true;

  // ── x type
  const isPointObj = d => d != null && typeof d === 'object' && !Array.isArray(d) && ('x' in d || 'date' in d);
  const first = (() => { for (const s of series) for (const d of s.raw.data || []) { if (isPointObj(d)) return d.x ?? d.date; if (Array.isArray(d) && d.length >= 2 && (s.type === 'line' || s.type === 'area' || s.type === 'scatter' || s.type === 'bubble')) return d[0]; } return undefined; })();
  const pointData = first !== undefined;
  const hasBars = series.some(s => CH_BARLIKE.has(s.type));
  const scatterish = series.every(s => s.type === 'scatter' || s.type === 'bubble');
  let xKind = c.xAxis.type;
  if (!xKind) {
    if (scatterish) xKind = pointData && chIsDateLike(first) ? 'time' : 'linear';
    else if (hasBars) xKind = 'category';
    else if (pointData) xKind = chIsDateLike(first) ? 'time' : (chNum(first) != null && !isStr(first) ? 'linear' : 'category');
    else xKind = labels && labels.length > 1 && labels.every(chIsDateLike) ? 'time' : 'category';
  }
  if (hasBars && xKind !== 'category') xKind = 'category';
  // category labels from point x values when needed
  if (xKind === 'category' && pointData && !labels) {
    const seen = new Map();
    for (const s of series) for (const d of s.raw.data || []) { const x = isPointObj(d) ? (d.x ?? d.date) : Array.isArray(d) && d.length > 4 ? d[0] : undefined; if (x !== undefined) { const k = x instanceof Date ? +x : String(x); if (!seen.has(k)) seen.set(k, x); } }
    labels = [...seen.values()];
  }
  const labelIndex = new Map((labels || []).map((l, i) => [l instanceof Date ? +l : String(l), i]));

  // ── points
  const catIndex = (x, i) => { if (x === undefined) return i; const k = x instanceof Date ? +x : String(x); return labelIndex.has(k) ? labelIndex.get(k) : i; };
  const xOf = (d, i) => {
    if (xKind === 'category') return catIndex(isPointObj(d) ? (d.x ?? d.date) : undefined, i);
    let xv = isPointObj(d) ? (d.x ?? d.date) : Array.isArray(d) && d.length >= 2 ? d[0] : labels ? labels[i] : i;
    return xKind === 'time' ? chTime(xv) : chNum(xv);
  };
  let n = labels ? labels.length : 0;
  for (const s of series) {
    const data = s.raw.data || [];
    const pts = [];
    data.forEach((d, i) => {
      if (d === undefined) return;
      const x = xOf(d, i);
      if (x == null) return;
      let p;
      if (s.type === 'candlestick' || s.type === 'ohlc') {
        const a = Array.isArray(d) ? (d.length >= 5 ? d.slice(1) : d) : [d.o ?? d.open, d.h ?? d.high, d.l ?? d.low, d.c ?? d.close];
        const [o, hi, lo, cl] = a.map(chNum);
        if (o == null || cl == null) return;
        p = { x, i, o, h: hi ?? Math.max(o, cl), l: lo ?? Math.min(o, cl), c: cl, y: cl };
      } else if (s.type === 'boxplot') {
        const st = Array.isArray(d) ? chBoxStats(d) : isObj(d) && Array.isArray(d.values) ? chBoxStats(d.values) : isObj(d) ? { min: chNum(d.min), q1: chNum(d.q1), median: chNum(d.median), q3: chNum(d.q3), max: chNum(d.max), outliers: toArr(d.outliers).map(chNum).filter(v => v != null) } : null;
        if (!st || st.median == null) return;
        p = { x, i, ...st, y: st.median };
      } else {
        const y = chNum(isObj(d) ? (d.y ?? d.value) : Array.isArray(d) ? d[1] : d);
        p = { x, i, y };
        if (s.type === 'bubble') p.z = chNum(isObj(d) ? (d.z ?? d.r ?? d.size) : Array.isArray(d) ? d[2] : null) ?? 1;
        if (isObj(d) && d.label != null) p.label = d.label;
        if (isObj(d) && d.color != null) p.color = chColor(d.color);
      }
      pts.push(p);
    });
    if (xKind !== 'category') pts.sort((a, b) => a.x - b.x);
    s.pts = pts;
    if (xKind === 'category') n = Math.max(n, ...pts.map(p => p.x + 1), 0);
  }
  if (xKind === 'category' && !labels) labels = Array.from({ length: n }, (_, i) => i + 1);
  const labelsAreDates = !!labels && labels.length > 0 && labels.every(chIsDateLike);
  const labelsAreNumbers = !!labels && labels.every(l => isNum(l));

  // ── visible series, stacks
  const vis = series.filter(s => !s.hidden);
  const stackMode = c.stacked === 'percent' ? 'percent' : c.stacked ? 'stack' : null;
  for (const s of series) {
    s.stackId = (s.type === 'column' || s.type === 'area') && (stackMode || s.stack != null) ? s.type + ':' + (s.stack ?? 'all') : 'solo:' + s.key;
    for (const p of s.pts) { p.y0 = 0; p.y1 = p.y; }
  }
  if (stackMode || series.some(s => s.stack != null)) {
    const groups = new Map();
    for (const s of vis) if (!s.stackId.startsWith('solo:')) { if (!groups.has(s.stackId)) groups.set(s.stackId, []); groups.get(s.stackId).push(s); }
    for (const list of groups.values()) {
      const byIdx = xKind === 'category' ? null : list[0].pts.map(p => p.x);
      const len = xKind === 'category' ? n : byIdx.length;
      for (let k = 0; k < len; k++) {
        const get = s => (xKind === 'category' ? s.pts.find(p => p.x === k) : s.pts[k]);
        let tot = 0;
        if (stackMode === 'percent') for (const s of list) tot += Math.abs(get(s)?.y || 0);
        let pos = 0, neg = 0;
        for (const s of list) {
          const p = get(s);
          if (!p || p.y == null) continue;
          const v = stackMode === 'percent' ? (tot ? p.y / tot : 0) : p.y;
          p.share = tot ? Math.abs(p.y) / tot : null;
          if (v >= 0) { p.y0 = pos; p.y1 = pos + v; pos = p.y1; } else { p.y0 = neg; p.y1 = neg + v; neg = p.y1; }
        }
      }
    }
  }
  // category lookup: s.byX[i] -> point
  for (const s of series) { if (xKind === 'category') { s.byX = []; for (const p of s.pts) s.byX[p.x] = p; } }

  // ── view window (zoom) & value extent
  const z = ch.state.zoom;
  let view, xExt = null;
  if (xKind === 'category') {
    const lo = z ? clamp(Math.round(z.min), 0, n - 1) : 0, hi = z ? clamp(Math.round(z.max), lo, n - 1) : n - 1;
    view = { offset: lo, n: Math.max(1, hi - lo + 1), lo, hi };
  } else {
    const xs = [];
    for (const s of vis) if (s.pts.length) { xs.push(s.pts[0].x, s.pts[s.pts.length - 1].x); }
    xExt = chExtent(xs) || [0, 1];
    let d0 = c.xAxis.min != null ? (xKind === 'time' ? chTime(c.xAxis.min) : +c.xAxis.min) : xExt[0];
    let d1 = c.xAxis.max != null ? (xKind === 'time' ? chTime(c.xAxis.max) : +c.xAxis.max) : xExt[1];
    if (d0 === d1) { const pad = xKind === 'time' ? CH_T.d : Math.abs(d0) * 0.1 || 1; d0 -= pad; d1 += pad; }
    if (scatterish && xKind !== 'time' && series.some(s => s.type === 'bubble')) { const pad = (d1 - d0) * 0.06; d0 -= pad; d1 += pad; }
    if (z) { d0 = z.min; d1 = z.max; }
    view = { domain: [d0, d1] };
  }
  const inView = p => (xKind === 'category' ? p.x >= view.lo && p.x <= view.hi : p.x >= view.domain[0] && p.x <= view.domain[1]);
  const vals = [];
  for (const s of vis) {
    for (const p of s.pts) {
      if (!inView(p)) continue;
      if (s.type === 'candlestick' || s.type === 'ohlc') vals.push(p.l, p.h);
      else if (s.type === 'boxplot') vals.push(p.min, p.max, ...(p.outliers || []));
      else if (!s.stackId.startsWith('solo:')) vals.push(p.y0, p.y1);
      else vals.push(p.y);
    }
  }
  for (const a of c.annotations || []) {
    if ((a.axis || (a.x != null ? 'x' : 'y')) !== 'y') continue;
    if (a.from != null) vals.push(+a.from, +a.to); else if (a.value != null) vals.push(+a.value);
  }
  let ext = chExtent(vals);
  const empty = !ext || !vis.some(s => s.pts.length);
  if (!ext) ext = [0, 1];
  const yKind = c.yAxis.type === 'log' ? 'log' : 'linear';
  const barsVis = vis.filter(s => CH_BARLIKE.has(s.type) && s.type === 'column');
  const areaVis = vis.filter(s => s.area);
  let zero = !!(barsVis.length || areaVis.length);
  if (!zero && c.yAxis.beginAtZero == null && !scatterish && !vis.some(s => s.type === 'candlestick' || s.type === 'ohlc' || s.type === 'boxplot')) zero = ext[0] >= 0 && ext[0] < ext[1] * 0.4;
  if (stackMode === 'percent') ext = [Math.min(0, ext[0]), Math.max(ext[1], 0) > 0 ? Math.min(1, ext[1]) : 0];
  if (scatterish && series.some(s => s.type === 'bubble')) { const pad = (ext[1] - ext[0]) * 0.1 || 1; ext = [ext[0] - pad, ext[1] + pad]; }

  // bar slots: one per distinct stack group among visible column series
  const groups = [];
  for (const s of barsVis) if (!groups.includes(s.stackId)) groups.push(s.stackId);
  const boxes = vis.filter(s => s.type === 'boxplot');
  for (const s of boxes) if (!groups.includes('box:' + s.key)) groups.push('box:' + s.key);

  // time granularity (for tooltip labels)
  let gran = 0;
  if (xKind === 'time') {
    const s0 = vis.find(s => s.pts.length > 1);
    if (s0) { gran = Infinity; for (let i = 1; i < Math.min(s0.pts.length, 60); i++) gran = Math.min(gran, s0.pts[i].x - s0.pts[i - 1].x); }
    if (!Number.isFinite(gran)) gran = CH_T.d;
  }
  const loc = ch.locale;
  const labelText = i => {
    const l = labels?.[i];
    if (l == null) return '';
    if (isFn(c.xAxis.format)) return String(c.xAxis.format(l, i));
    if (labelsAreDates) {
      const tms = chTime(l);
      return c.xAxis.format && isStr(c.xAxis.format) && !['number', 'currency', 'percent', 'compact'].includes(c.xAxis.format) ? date.format(tms, c.xAxis.format, loc) : chCatDateLabel(labels, tms, loc);
    }
    return isNum(l) && c.xAxis.format ? chFormatter(c.xAxis.format, { locale: loc })(l) : String(l);
  };
  const labelsText = labels ? labels.map((_, i) => labelText(i)) : [];
  const m = {
    kind: 'cartesian', type, horizontal, xKind, yKind, labels: labels || [], labelsText, labelsAreDates, labelsAreNumbers, n,
    series, vis, bars: barsVis, groups, stackMode, stackedAll: !!stackMode && barsVis.length > 1,
    vLo: ext[0], vHi: ext[1], zero, view, xExt, empty, gran, scatterish,
    hasLines: vis.some(s => s.type === 'line' || s.type === 'area'),
    forceBand: vis.some(s => CH_BARLIKE.has(s.type)),
  };
  // direct labels (skill: ≤ 4 series direct-labelled; legend always for ≥ 2)
  const dl = c.dataLabels;
  const lines = vis.filter(s => s.type === 'line' || s.type === 'area');
  m.endLabels = null;
  if (dl !== false && dl !== 'none' && lines.length && lines.length <= 4 && !horizontal && ch.W >= 480 && (dl === 'auto' || dl === true || dl === 'end') && !(barsVis.length && dl === 'auto')) {
    const font = ch.font(500);
    m.endLabels = lines.map(s => {
      const last = [...s.pts].reverse().find(p => p.y != null);
      const text = lines.length === 1 && vis.length === 1 ? ch.fmtValue(last?.y) : s.name;
      return { key: s.key, text: chFit(text, 110, font), w: Math.min(110, chMeasure(text, font)) };
    });
  }
  const bars1 = barsVis.length === 1 && vis.length === 1;
  m.dataLabels = dl === true || dl === 'all' || (dl === 'auto' && bars1 && view.n <= (horizontal ? 24 : 14) && !stackMode);
  if (m.dataLabels && barsVis.length) {
    let longest = '';
    for (const s of barsVis) for (const p of s.pts) { const tx = ch.fmtValue(p.y); if (tx.length > longest.length) longest = tx; }
    m.maxLabelText = longest;
  }
  return m;
}
/** Category label for date categories: month names for monthly data, day otherwise. */
function chCatDateLabel(labels, tms, loc) {
  const d = new Date(tms);
  const ds = labels.slice(0, 3).map(chTime);
  const step = ds.length > 1 ? ds[1] - ds[0] : CH_T.d;
  if (step >= CH_T.y * 0.9) return fmt.date(d, { year: 'numeric' }, loc);
  if (step >= CH_T.M * 0.9) return fmt.date(d, d.getMonth() === 0 ? { month: 'short', year: '2-digit' } : { month: 'short' }, loc);
  if (step >= CH_T.d * 0.9) return fmt.date(d, { month: 'short', day: 'numeric' }, loc);
  return fmt.time(d, { hour: 'numeric', minute: '2-digit' }, loc);
}
