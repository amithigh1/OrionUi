/* ============================================================================
 * Orion charts — scales & ticks (linear, log, band, point, time)
 * Every file in src/components/chart/ shares one function scope (file-name order).
 * Names are prefixed `ch`/`CH` to stay clear of core.
 * ========================================================================== */

const CH_E10 = Math.sqrt(50), CH_E5 = Math.sqrt(10), CH_E2 = Math.sqrt(2);

/** Human "nice" step (1, 2, 5 × 10^n) for about `count` intervals between a and b. */
function chTickStep(a, b, count) {
  const span = Math.abs(b - a);
  if (!span || !Number.isFinite(span)) return 1;
  const raw = span / Math.max(1, count);
  let step = Math.pow(10, Math.floor(Math.log10(raw)));
  const err = raw / step;
  if (err >= CH_E10) step *= 10; else if (err >= CH_E5) step *= 5; else if (err >= CH_E2) step *= 2;
  return step;
}
/** Decimal places needed to print multiples of `step` exactly. */
function chStepDecimals(step) {
  if (!step || !Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(10, -Math.floor(Math.log10(step) + 1e-9)));
}

/**
 * chNice(min, max, count, { zero }) -> { min, max, step, ticks }
 * Extends the domain to round numbers and returns the ticks in between.
 */
function chNice(min, max, count = 5, opts = {}) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
  if (min > max) [min, max] = [max, min];
  if (opts.zero) { min = Math.min(0, min); max = Math.max(0, max); }
  if (min === max) {
    if (min === 0) max = 1;
    else if (min > 0) { max = min * 1.2; min = opts.zero ? 0 : min * 0.8; }
    else { min = min * 1.2; max = opts.zero ? 0 : max * 0.8; }
  }
  let step = chTickStep(min, max, count);
  for (let k = 0; k < 6; k++) {
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const s2 = chTickStep(lo, hi, count);
    min = lo; max = hi;
    if (s2 === step) break;
    step = s2;
  }
  if (opts.fixedMin != null) min = opts.fixedMin;
  if (opts.fixedMax != null) max = opts.fixedMax;
  const dec = chStepDecimals(step), ticks = [];
  const first = Math.ceil(min / step - 1e-9) * step;
  for (let v = first, i = 0; v <= max + step * 1e-6 && i < 200; i++, v = first + i * step) ticks.push(+v.toFixed(dec));
  return { min, max, step, ticks, decimals: dec };
}

/** Linear scale: f(v) -> px, f.invert(px) -> v */
function chLinear(d0, d1, r0, r1) {
  const span = d1 - d0 || 1, k = (r1 - r0) / span;
  const f = v => r0 + (v - d0) * k;
  f.invert = p => d0 + (p - r0) / k;
  f.domain = [d0, d1]; f.range = [r0, r1]; f.kind = 'linear';
  return f;
}
/** Log10 scale (domain must be > 0) */
function chLog(d0, d1, r0, r1) {
  d0 = Math.max(d0, 1e-12); d1 = Math.max(d1, d0 * 10);
  const l0 = Math.log10(d0), l1 = Math.log10(d1), k = (r1 - r0) / (l1 - l0 || 1);
  const f = v => r0 + (Math.log10(Math.max(v, 1e-12)) - l0) * k;
  f.invert = p => 10 ** (l0 + (p - r0) / k);
  f.domain = [d0, d1]; f.range = [r0, r1]; f.kind = 'log';
  return f;
}
/** Log ticks: powers of ten, plus 2 and 5 multiples when the domain spans few decades. */
function chLogTicks(d0, d1) {
  const a = Math.floor(Math.log10(Math.max(d0, 1e-12))), b = Math.ceil(Math.log10(Math.max(d1, 1e-12)));
  const out = [], few = b - a <= 2;
  for (let e = a; e <= b; e++) {
    for (const m of few ? [1, 2, 5] : [1]) { const v = m * 10 ** e; if (v >= d0 * 0.999 && v <= d1 * 1.001) out.push(+v.toPrecision(12)); }
  }
  return out;
}
/** Nice log domain: whole decades around the data. */
function chLogNice(min, max) {
  min = Math.max(min, 1e-12); max = Math.max(max, min);
  return [10 ** Math.floor(Math.log10(min)), 10 ** Math.ceil(Math.log10(max) + (max === min ? 1 : 0))];
}

/**
 * Band scale for categories: f(i) -> band start px, f.center(i), f.bw (band width), f.step.
 * `offset` is the first visible index (zoom); indices outside extrapolate (clipped by the plot).
 */
function chBand(n, r0, r1, { inner = 0.28, outer = 0.14, offset = 0 } = {}) {
  n = Math.max(1, n);
  const step = (r1 - r0) / Math.max(1e-9, n - inner + outer * 2);
  const bw = step * (1 - inner), start = r0 + step * outer;
  const f = i => start + (i - offset) * step;
  f.center = i => f(i) + bw / 2;
  f.bw = bw; f.step = step; f.n = n; f.offset = offset; f.kind = 'band';
  f.invert = p => clamp(Math.floor((p - start + (step * inner) / 2) / step), 0, n - 1) + offset;
  f.range = [r0, r1];
  return f;
}
/** Point scale for categorical lines: evenly spaced points, first and last touch the padding. */
function chPoint(n, r0, r1, { pad = 0, offset = 0 } = {}) {
  n = Math.max(1, n);
  const step = n > 1 ? (r1 - r0) / (n - 1 + pad * 2) : 0;
  const f = n > 1 ? (i => r0 + (pad + i - offset) * step) : (() => (r0 + r1) / 2);
  f.center = f; f.bw = 0; f.step = step || (r1 - r0); f.n = n; f.offset = offset; f.kind = 'point';
  f.invert = p => clamp(Math.round(n > 1 ? (p - r0) / step - pad : 0), 0, n - 1) + offset;
  f.range = [r0, r1];
  return f;
}

/* ── time ticks ──────────────────────────────────────────────────────── */
const CH_T = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5, M: 2629746e3, y: 31556952e3 };
const CH_TIME_STEPS = [
  ['s', 1], ['s', 5], ['s', 15], ['s', 30], ['m', 1], ['m', 5], ['m', 15], ['m', 30],
  ['h', 1], ['h', 3], ['h', 6], ['h', 12], ['d', 1], ['d', 2], ['d', 7], ['d', 14], ['M', 1], ['M', 3], ['M', 6], ['y', 1],
];
const __chField = { s: d => d.getSeconds(), m: d => d.getMinutes(), h: d => d.getHours(), d: d => d.getDate() - 1, M: d => d.getMonth(), y: d => d.getFullYear() };

/**
 * chTimeTicks(min, max, count) -> { ticks: ms[], unit, step }
 * Picks a calendar interval (second … year) giving about `count` ticks, aligned to local time.
 */
function chTimeTicks(min, max, count = 6) {
  const span = Math.max(1, max - min), target = span / Math.max(1, count);
  let pick = CH_TIME_STEPS.find(([u, n]) => CH_T[u] * n >= target * 0.92);
  if (!pick) pick = ['y', Math.max(1, Math.round(chTickStep(0, span / CH_T.y, count)))];
  const [unit, step] = pick;
  let d = date.startOf(new Date(min), unit === 'w' ? 'w' : unit);
  const ticks = [];
  if (unit === 'd' && step > 1) {
    // day multiples restart each month (1, 8, 15, 22 …) and skip days that would crowd the next month's 1st
    for (let g = 0; g < 4000 && +d <= max; g++) {
      const day = d.getDate();
      if ((day - 1) % step === 0 && day + step - 1 <= 30 && +d >= min) ticks.push(+d);
      d = date.add(d, 1, 'd');
    }
    return { ticks, unit, step };
  }
  if (unit !== 'w' && step > 1) {
    const get = __chField[unit];
    for (let g = 0; g < 400 && get(d) % step !== 0; g++) d = date.add(d, 1, unit);
  }
  for (let g = 0; g < 1000 && +d <= max; g++) {
    if (+d >= min) ticks.push(+d);
    d = date.add(d, step, unit);
  }
  return { ticks, unit, step };
}
/** Is a tick a "major" boundary for its unit (new year / new day)? */
function chTimeMajor(v, unit) {
  const d = new Date(v);
  if (unit === 'M') return d.getMonth() === 0;
  if (unit === 'd' || unit === 'w') return d.getDate() <= (unit === 'w' ? 7 : 1) && d.getMonth() === 0;
  if (unit === 'h' || unit === 'm' || unit === 's') return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
  return false;
}
/** Localized short label for a time tick. */
function chTimeLabel(v, unit, loc) {
  const d = new Date(v);
  if (unit === 'y') return fmt.date(d, { year: 'numeric' }, loc);
  if (unit === 'M') return d.getMonth() === 0 ? fmt.date(d, { year: 'numeric' }, loc) : fmt.date(d, { month: 'short' }, loc);
  if (unit === 'd' || unit === 'w') return d.getDate() === 1 && d.getMonth() === 0 ? fmt.date(d, { year: 'numeric' }, loc) : fmt.date(d, { month: 'short', day: 'numeric' }, loc);
  if (chTimeMajor(v, unit)) return fmt.date(d, { month: 'short', day: 'numeric' }, loc);
  if (unit === 's') return fmt.time(d, { hour: 'numeric', minute: '2-digit', second: '2-digit' }, loc);
  return fmt.time(d, { hour: 'numeric', minute: '2-digit' }, loc);
}
/** Tooltip/table label for a timestamp, precise to the data's granularity (ms between points). */
function chTimeFull(v, gran, loc) {
  const d = new Date(v);
  if (gran >= CH_T.M * 0.9) return fmt.date(d, { month: 'long', year: 'numeric' }, loc);
  if (gran >= CH_T.d * 0.9) return fmt.date(d, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }, loc);
  if (gran >= CH_T.m) return fmt.date(d, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }, loc);
  return fmt.time(d, { hour: 'numeric', minute: '2-digit', second: '2-digit' }, loc);
}
