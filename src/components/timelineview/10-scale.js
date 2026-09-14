/* ── adaptive time axis: steps (minutes → centuries), ticks, labels, snapping ── */
const TV_MS = { m: 6e4, h: 36e5, d: 864e5, w: 6048e5, M: 2629746e3, y: 31556952e3 };
const TV_STEPS = [['m', 1], ['m', 5], ['m', 10], ['m', 15], ['m', 30], ['h', 1], ['h', 2], ['h', 3], ['h', 6], ['h', 12], ['d', 1], ['d', 2], ['w', 1],
  ['M', 1], ['M', 3], ['y', 1], ['y', 2], ['y', 5], ['y', 10], ['y', 25], ['y', 50], ['y', 100]];
const TV_MIN_PX = { m: 54, h: 54, d: 34, w: 62, M: 46, y: 46 };
const TV_UNITS = { minute: TV_MS.m, hour: TV_MS.h, day: TV_MS.d, week: TV_MS.w, month: TV_MS.M, quarter: TV_MS.M * 3, year: TV_MS.y };

/** Minor step [unit, n] for a scale in ms per pixel. */
function tvStep(mpp) {
  for (const s of TV_STEPS) if (TV_MS[s[0]] * s[1] / mpp >= TV_MIN_PX[s[0]]) return s;
  return TV_STEPS[TV_STEPS.length - 1];
}
/** Major (upper) step for a minor step. */
function tvMajor([u, n]) {
  if (u === 'm' || u === 'h') return ['d', 1];
  if (u === 'd' || u === 'w') return ['M', 1];
  if (u === 'M') return ['y', 1];
  return ['y', n >= 10 ? 100 : 10];
}
/** Local-time floor of t to a multiple of n units. */
function tvFloor(t, u, n = 1) {
  const d = new Date(t);
  switch (u) {
    case 'm': d.setSeconds(0, 0); d.setMinutes(Math.floor(d.getMinutes() / n) * n); break;
    case 'h': d.setMinutes(0, 0, 0); d.setHours(Math.floor(d.getHours() / n) * n); break;
    case 'd': {
      d.setHours(0, 0, 0, 0);
      if (n > 1) { const idx = Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / TV_MS.d); d.setDate(d.getDate() - (((idx % n) + n) % n)); }
      break;
    }
    case 'w': return +date.startOf(d, 'week');
    case 'M': d.setHours(0, 0, 0, 0); d.setDate(1); d.setMonth(Math.floor(d.getMonth() / n) * n); break;
    default: d.setHours(0, 0, 0, 0); d.setMonth(0, 1); d.setFullYear(Math.floor(d.getFullYear() / n) * n);
  }
  return +d;
}
const tvAdd = (t, u, n = 1) => +date.add(t, n, u);
/** Tick times covering [ta, tb]. */
function tvTicks(ta, tb, [u, n]) {
  const out = [];
  for (let t = tvFloor(ta, u, n), g = 0; t <= tb && g < 2000; g++) { out.push(t); t = tvAdd(t, u, n); }
  out.push(tvAdd(out[out.length - 1] ?? tvFloor(ta, u, n), u, n));
  return out;
}
/** Localised tick label. */
function tvLabel(t, [u, n], w, major, host) {
  const d = new Date(t);
  if (major) {
    if (u === 'd') return fmt.date(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    if (u === 'M') return fmt.date(d, { month: 'long', year: 'numeric' });
    if (u === 'y' && n > 1) return `${fmt.date(d, { year: 'numeric' })} – ${fmt.date(new Date(d.getFullYear() + n - 1, 0, 1), { year: 'numeric' })}`;
    return fmt.date(d, { year: 'numeric' });
  }
  switch (u) {
    case 'm': return fmt.date(d, { hour: 'numeric', minute: '2-digit' });
    case 'h': return fmt.date(d, { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined });
    case 'd': return w >= 66 ? fmt.date(d, { weekday: 'short', day: 'numeric' }) : fmt.date(d, { day: 'numeric' });
    case 'w': return fmt.date(d, { day: 'numeric', month: 'short' });
    case 'M': return n === 3 ? host.t('timelineView.quarter', { n: Math.floor(d.getMonth() / 3) + 1 }) : fmt.date(d, { month: w >= 84 ? 'long' : 'short' });
    default: return fmt.date(d, { year: 'numeric' });
  }
}
/** Snapping unit for dragging at a minor step. */
function tvSnapUnit([u, n], mpp) {
  if (u === 'm') return n <= 5 ? ['m', 1] : ['m', 5];
  if (u === 'h') return n <= 2 ? ['m', 15] : n <= 3 ? ['m', 30] : ['h', 1];
  if (u === 'd') return TV_MS.d / mpp >= 240 ? ['h', 1] : ['d', 1];
  if (u === 'w' || u === 'M') return ['d', 1];
  return ['M', 1];
}
function tvSnap(t, s) { const a = tvFloor(t, s[0], s[1]), b = tvAdd(a, s[0], s[1]); return t - a < b - t ? a : b; }
/** '1h' | '30m' | '2d' | '1w' | '6M' | '10y' | ms number -> ms */
function tvDur(v, fallback) {
  if (v == null || v === '') return fallback;
  if (isNum(v)) return v;
  const m = String(v).trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|min|h|d|w|M|mo|y)?$/);
  if (!m) return fallback;
  const k = { ms: 1, s: 1e3, m: 6e4, min: 6e4, h: 36e5, d: 864e5, w: 6048e5, M: TV_MS.M, mo: TV_MS.M, y: TV_MS.y }[m[2] || 'ms'];
  return +m[1] * k;
}
const tvTime = v => { if (v == null || v === '') return null; const d = date.parse(v); return d ? +d : null; };
