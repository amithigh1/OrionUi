/* ============================================================================
 * <o-sparkline values="4,8,5,9" type="line|area|bar|winloss" color="1"> — tiny, fast
 * inline trend. Default follows the stat-tile contract: trend in the de-emphasis
 * gray with the current period (last point) in the accent; set `color` to paint
 * the whole trend. Tooltip on hover; role="img" with a spoken summary.
 *   Orion.sparkline(el, [4, 8, 5, 9], { type: 'bar', color: 2 }) -> <o-sparkline>
 * Self-contained (no dependency on the chart engine).
 * ========================================================================== */

i18n.add('en', { sparkline: { label: 'Trend', summary: '{count} values, from {first} to {last}; low {min}, high {max}.', win: 'Win', loss: 'Loss', draw: 'Draw' } });

const SP_NS = 'http://www.w3.org/2000/svg';
const spEl = (tag, attrs, parent) => { const el = doc.createElementNS(SP_NS, tag); for (const k in attrs || {}) if (attrs[k] != null) el.setAttribute(k, attrs[k]); if (parent) parent.appendChild(el); return el; };
const spR = v => Math.round(v * 10) / 10;
/** 3 -> slot 3, 'status-good' / '--var' / '#hex' as in the chart engine */
function spColor(c) {
  if (c == null || c === '') return null;
  if (isNum(c) || /^\d+$/.test(String(c))) return `var(--o-chart-${clamp(+c, 1, 8)})`;
  const s = String(c).trim();
  if (s.startsWith('--')) return `var(${s})`;
  if (/^(chart-\d|seq-\d00|status-(good|warning|serious|critical))$/.test(s) || /^(primary|secondary|success|danger|warning|info)$/.test(s)) return `var(--o-${s})`;
  return s;
}
function spValues(v) {
  if (v == null) return [];
  if (isStr(v)) { const s = v.trim(); v = s.startsWith('[') ? parseJSON(s, []) : s.split(/[\s,;]+/); }
  return toArr(v).map(x => { const n = x === '' || x == null ? NaN : +(isObj(x) ? (x.y ?? x.value) : x); return Number.isFinite(n) ? n : null; });
}

let __spTip = null;
function spTipShow(host, text, sub, x, y) {
  if (!__spTip) __spTip = h('div', { class: 'o-floating o-spark-tip', 'aria-hidden': 'true' });
  if (!__spTip.isConnected) portal(__spTip, host); else inheritContext(__spTip, host);
  __spTip.replaceChildren(h('strong', { text }), ...(sub ? [h('span', { text: sub })] : []));
  __spTip.hidden = false;
  __spTip.style.zIndex = String(Z.tooltip);
  place(__spTip, { x, y, width: 0, height: 0 }, { placement: 'top', offset: 8, flip: true, shift: true });
}
function spTipHide() { if (__spTip) __spTip.hidden = true; }

class OSparkline extends OElement {
  static props = {
    values: { type: Any, default: () => [] },
    labels: { type: Array },
    type: { type: String, default: 'line' },
    color: { type: String },
    min: { type: Number },
    max: { type: Number },
    highlight: { type: String, default: 'last' },   // 'last' | 'minmax' | 'none'
    format: { type: Any },                          // 'number' | 'percent' | 'currency' | 'compact' | fn
    currency: { type: String },
    label: { type: String },
    curve: { type: String, default: 'linear' },     // 'linear' | 'smooth'
    tooltip: { type: Boolean, default: true },
  };
  setup() {
    this.classList.add('o-sparkline');
    this.setAttribute('role', 'img');
    this._svg = spEl('svg', { 'aria-hidden': 'true', focusable: 'false' }, this);
    on(this, 'pointermove', e => this._hover(e));
    on(this, 'pointerleave', () => { this._mark(-1); spTipHide(); });
  }
  connected() {
    this.listen(win, 'blur', spTipHide);
    this.addCleanup(observeResize(this, () => this.render()));
  }
  disconnected() { spTipHide(); }
  get data() { return spValues(this.values); }
  _fmt(v) {
    const f = this.format;
    if (v == null) return '';
    if (isFn(f)) return String(f(v));
    if (f === 'percent') return fmt.percent(v, Math.abs(v) < 0.1 ? 1 : 0);
    if (f === 'currency') return fmt.currency(v, this.currency);
    if (f === 'compact') return fmt.compact(v);
    return fmt.number(v, { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 });
  }
  render() {
    const vals = this.data, svg = this._svg;
    const W = Math.round(this.clientWidth), H = Math.round(this.clientHeight);
    svg.replaceChildren();
    const nums = vals.filter(v => v != null);
    const type = this.type || 'line';
    // accessible summary
    if (nums.length) {
      const sum = this.t('sparkline.summary', { count: vals.length, first: this._fmt(nums[0]), last: this._fmt(nums[nums.length - 1]), min: this._fmt(Math.min(...nums)), max: this._fmt(Math.max(...nums)) });
      this.setAttribute('aria-label', (this.label || this.t('sparkline.label')) + ': ' + sum);
    } else this.setAttribute('aria-label', this.label || this.t('sparkline.label'));
    if (!W || !H || !nums.length) { this._geo = null; return; }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    const col = spColor(this.color);
    this.style.setProperty('--o-spark-c', col || '');
    this.classList.toggle('is-colored', !!col);
    const n = vals.length;
    const pad = type === 'line' || type === 'area' ? 3 : 0;
    let lo = this.min ?? Math.min(...nums), hi = this.max ?? Math.max(...nums);
    if (type === 'bar') { lo = Math.min(0, lo); hi = Math.max(0, hi); }
    if (lo === hi) { lo -= 1; hi += 1; }
    const y = v => pad + (H - pad * 2) * (1 - (v - lo) / (hi - lo));
    const geo = { xs: [], ys: [], type };
    if (type === 'bar' || type === 'winloss') {
      const step = W / n, gap = Math.min(2, step * 0.25), bw = Math.max(1, step - gap);
      const mid = H / 2;
      const base = type === 'winloss' ? mid : y(0);
      let dPos = '', dNeg = '', dLast = '', dDraw = '';
      vals.forEach((v, i) => {
        const x = i * step + gap / 2;
        geo.xs.push(x + bw / 2);
        if (v == null) { geo.ys.push(null); return; }
        let top, hgt;
        if (type === 'winloss') { const s = Math.sign(v); hgt = s ? H / 2 - 1 : 2; top = s > 0 ? mid - hgt - 0.5 : s < 0 ? mid + 0.5 : mid - 1; }
        else { const yy = y(v); top = Math.min(yy, base); hgt = Math.max(1, Math.abs(base - yy)); }
        geo.ys.push(type === 'winloss' ? (v > 0 ? top : top + hgt) : v >= 0 ? top : top + hgt);
        const r = Math.min(1.5, bw / 3, hgt / 2);
        const pos = v >= 0;
        const p = `M${spR(x)},${spR(pos ? top + hgt : top)}V${spR(pos ? top + r : top + hgt - r)}q0,${pos ? -r : r} ${r},${pos ? -r : r}H${spR(x + bw - r)}q${r},0 ${r},${pos ? r : -r}V${spR(pos ? top + hgt : top)}Z`;
        if (i === n - 1 && this.highlight === 'last' && type === 'bar') dLast = p;
        else if (type === 'winloss') { if (v > 0) dPos += p; else if (v < 0) dNeg += p; else dDraw += p; }
        else dPos += p;
      });
      if (dPos) spEl('path', { d: dPos, class: 'o-spark-bar' + (type === 'winloss' ? ' is-win' : '') }, svg);
      if (dNeg) spEl('path', { d: dNeg, class: 'o-spark-bar is-loss' }, svg);
      if (dDraw) spEl('path', { d: dDraw, class: 'o-spark-bar is-draw' }, svg);
      if (dLast) spEl('path', { d: dLast, class: 'o-spark-bar is-current' }, svg);
      if (type === 'bar' && lo < 0) spEl('line', { x1: 0, x2: W, y1: spR(base) + 0.5, y2: spR(base) + 0.5, class: 'o-spark-base' }, svg);
    } else {
      const step = n > 1 ? (W - pad * 2) / (n - 1) : 0;
      const pts = vals.map((v, i) => (v == null ? null : [pad + i * step, y(v)]));
      vals.forEach((v, i) => { geo.xs.push(pad + i * step); geo.ys.push(v == null ? null : y(v)); });
      let d = '', run = [];
      const flush = () => {
        if (!run.length) return;
        if (this.curve === 'smooth' && run.length > 2) {
          d += `M${spR(run[0][0])},${spR(run[0][1])}`;
          for (let i = 0; i < run.length - 1; i++) { const p0 = run[i - 1] || run[i], p1 = run[i], p2 = run[i + 1], p3 = run[i + 2] || p2; d += `C${spR(p1[0] + (p2[0] - p0[0]) / 6)},${spR(p1[1] + (p2[1] - p0[1]) / 6)},${spR(p2[0] - (p3[0] - p1[0]) / 6)},${spR(p2[1] - (p3[1] - p1[1]) / 6)},${spR(p2[0])},${spR(p2[1])}`; }
        } else d += 'M' + run.map(p => spR(p[0]) + ',' + spR(p[1])).join('L');
        if (type === 'area') geo.area = (geo.area || '') + d.slice(d.lastIndexOf('M')) + `L${spR(run[run.length - 1][0])},${H}L${spR(run[0][0])},${H}Z`;
        run = [];
      };
      pts.forEach(p => (p ? run.push(p) : flush()));
      flush();
      if (geo.area) spEl('path', { d: geo.area, class: 'o-spark-area' }, svg);
      spEl('path', { d, class: 'o-spark-line' }, svg);
      const mark = (i, cls) => { if (geo.ys[i] != null) spEl('circle', { cx: spR(geo.xs[i]), cy: spR(geo.ys[i]), r: 2.5, class: 'o-spark-dot ' + cls }, svg); };
      if (this.highlight === 'last') { let i = n - 1; while (i > 0 && vals[i] == null) i--; mark(i, 'is-current'); }
      if (this.highlight === 'minmax') { mark(vals.indexOf(Math.min(...nums)), 'is-min'); mark(vals.indexOf(Math.max(...nums)), 'is-max'); }
    }
    this._hot = spEl('circle', { r: 3, class: 'o-spark-dot is-hover', visibility: 'hidden' }, svg);
    this._geo = geo;
  }
  _mark(i) {
    const g = this._geo;
    if (!g || !this._hot) return;
    if (i < 0 || g.ys[i] == null || g.type === 'bar' || g.type === 'winloss') {
      this._hot.setAttribute('visibility', 'hidden');
      this._svg.querySelectorAll('.is-hover-bar').forEach(el => el.remove());
      if (i >= 0 && (g.type === 'bar' || g.type === 'winloss') && g.ys[i] != null) {
        const step = this.clientWidth / g.xs.length;
        spEl('rect', { x: spR(g.xs[i] - step / 2), y: 0, width: spR(step), height: this.clientHeight, class: 'is-hover-bar' }, this._svg);
      }
      return;
    }
    this._hot.setAttribute('cx', spR(g.xs[i])); this._hot.setAttribute('cy', spR(g.ys[i])); this._hot.setAttribute('visibility', 'visible');
  }
  _hover(e) {
    const g = this._geo;
    if (!g || !this.tooltip) return;
    const r = this.getBoundingClientRect();
    const x = e.clientX - r.left;
    let i = 0, bd = Infinity;
    g.xs.forEach((gx, k) => { const d = Math.abs(gx - x); if (d < bd && g.ys[k] != null) { bd = d; i = k; } });
    const v = this.data[i];
    if (v == null) return;
    this._mark(i);
    const lab = this.labels?.[i];
    const wl = this.type === 'winloss' ? this.t(v > 0 ? 'sparkline.win' : v < 0 ? 'sparkline.loss' : 'sparkline.draw') : null;
    spTipShow(this, wl || this._fmt(v), lab != null ? String(lab) : wl ? this._fmt(v) : null, r.left + g.xs[i], r.top + (g.ys[i] ?? 0));
  }
}
define('o-sparkline', OSparkline);

/** Orion.sparkline(el, values, { type, color, labels, format, highlight, min, max }) -> <o-sparkline> */
O.sparkline = function (target, values, opts = {}) {
  const el = $(target);
  if (!el) throw new Error('Orion.sparkline: element not found');
  const sp = el.localName === 'o-sparkline' ? el : (el.querySelector(':scope > o-sparkline') || el.appendChild(doc.createElement('o-sparkline')));
  for (const k of Object.keys(opts)) if (k in OSparkline.props) sp[k] = opts[k];
  sp.values = values;
  return sp;
};
O.OSparkline = OSparkline;
