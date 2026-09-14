/* ── time scale: zoom presets, header tiers, unit boundaries ─────────── */
const G_VIEWS = ['day', 'week', 'month', 'quarter', 'year'];
/** Pixels per day of each view preset. Ctrl+wheel zooms continuously between them. */
const G_VIEW_DW = { day: 40, week: 16, month: 4.4, quarter: 1.6, year: 0.55 };
const G_ZOOM_MIN = 0.3, G_ZOOM_MAX = 120;
const G_UNIT_DAYS = { day: 1, week: 7, month: 30.44, quarter: 91.3, year: 365.25 };
const G_MIN_PX = { day: 18, week: 44, month: 50, quarter: 26, year: 40 };
const G_PARENT = { day: 'month', week: 'month', month: 'year', quarter: 'year', year: null };

/** Nearest preset name for a day width. */
function gViewFor(dw) {
  let best = 'week', d = Infinity;
  for (const v of G_VIEWS) { const x = Math.abs(Math.log(G_VIEW_DW[v] / dw)); if (x < d) { d = x; best = v; } }
  return best;
}
/** [topUnit, bottomUnit] header tiers for a day width. */
function gTiers(dw) {
  const bottom = ['day', 'week', 'month', 'quarter', 'year'].find(u => G_UNIT_DAYS[u] * dw >= G_MIN_PX[u]) || 'year';
  return [G_PARENT[bottom] || bottom, bottom];
}
/** Snap step (days) for dragging / keyboard at a day width. */
const gSnapDays = dw => (dw >= 3 ? 1 : 7);

const gYMD = n => { const u = new Date(Math.floor(n) * G_DAY_MS); return [u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()]; };
const gFromYM = (y, m) => Math.round(Date.UTC(y, m, 1) / G_DAY_MS);

/** First day of the unit that contains day n. */
function gUnitStart(n, unit, ws = 1) {
  if (unit === 'day') return n;
  if (unit === 'week') return n - ((gWeekday(n) - ws + 7) % 7);
  const [y, m] = gYMD(n);
  if (unit === 'month') return gFromYM(y, m);
  if (unit === 'quarter') return gFromYM(y, m - (m % 3));
  return gFromYM(y, 0);
}
/** First day of the next unit (n must be a unit start). */
function gUnitNext(n, unit) {
  if (unit === 'day') return n + 1;
  if (unit === 'week') return n + 7;
  const [y, m] = gYMD(n);
  if (unit === 'month') return gFromYM(y, m + 1);
  if (unit === 'quarter') return gFromYM(y, m + 3);
  return gFromYM(y + 1, 0);
}
/** Unit cells [[start, next], …] covering days d0..d1. */
function gCells(unit, d0, d1, ws) {
  const out = [];
  for (let n = gUnitStart(d0, unit, ws), g = 0; n < d1 && g < 4000; g++) { const nx = gUnitNext(n, unit); out.push([n, nx]); n = nx; }
  return out;
}
/** Localised header label for a unit cell of width w (px). */
function gCellLabel(n, unit, w, top, host) {
  const d = gDate(n);
  if (unit === 'day') return w >= 64 ? fmt.date(d, { weekday: 'short', day: 'numeric' }) : fmt.date(d, { day: 'numeric' });
  if (unit === 'week') return w >= 76 ? fmt.date(d, { day: 'numeric', month: 'short' }) : fmt.date(d, { day: 'numeric' });
  if (unit === 'month') {
    if (top) return fmt.date(d, { month: 'long', year: 'numeric' });
    return fmt.date(d, { month: w >= 110 ? 'long' : w >= 44 ? 'short' : 'narrow' });
  }
  if (unit === 'quarter') return host.t('gantt.quarter', { n: Math.floor(d.getMonth() / 3) + 1 });
  return fmt.date(d, { year: 'numeric' });
}
