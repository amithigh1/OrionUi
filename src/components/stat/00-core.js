/* KPI helpers: value formatting, count-up animation (<o-countup>, Orion.countUp) and a tiny built-in sparkline. */

i18n.add('en', {
  stat: {
    up: 'Up {value}', down: 'Down {value}', flat: 'No change', favorable: 'favorable', unfavorable: 'unfavorable',
    trend: 'Trend over {count} periods: from {first} to {last}, low {min}, high {max}.',
    goal: '{pct} of {goal} goal', goalReached: 'Goal reached', goalLabel: 'Progress to goal', loading: 'Loading…',
  },
});

/**
 * statFormat(value, { format, currency, decimals, compact, prefix, suffix })
 *   format: number (default) | currency | percent (12.4 -> 12.4%) | compact | duration (ms) | bytes | raw
 */
function statFormat(v, o = {}) {
  if (v == null || v === '') return '';
  const n = +v;
  if (o.format === 'raw' || Number.isNaN(n)) return (o.prefix || '') + String(v) + (o.suffix || '');
  const d = o.decimals == null || o.decimals === '' ? null : +o.decimals;
  const fix = d == null ? {} : { minimumFractionDigits: d, maximumFractionDigits: d };
  let s;
  switch (o.format) {
    case 'currency': s = fmt.currency(n, o.currency, o.compact ? { notation: 'compact', maximumFractionDigits: d ?? 1 } : fix); break;
    case 'percent': s = fmt.number(n / 100, { style: 'percent', minimumFractionDigits: d ?? 0, maximumFractionDigits: d ?? 1 }); break;
    case 'compact': s = fmt.number(n, { notation: 'compact', maximumFractionDigits: d ?? 1 }); break;
    case 'duration': s = fmt.duration(n); break;
    case 'bytes': s = fmt.bytes(n, d ?? 1); break;
    default: s = o.compact ? fmt.number(n, { notation: 'compact', maximumFractionDigits: d ?? 1 }) : fmt.number(n, d == null ? { maximumFractionDigits: 2 } : fix);
  }
  return (o.prefix || '') + s + (o.suffix || '');
}
const statDecimals = v => { const m = String(v ?? '').match(/\.(\d+)$/); return m ? Math.min(m[1].length, 4) : 0; };
const statEase = p => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));

/**
 * countUpRun(el, from, to, { duration, format(n) }) -> { promise, cancel }
 * Writes formatted intermediate values into el.textContent (reduced motion: jumps to the end).
 */
function countUpRun(el, from, to, { duration = 1200, format = n => fmt.number(n) } = {}) {
  let raf = 0, done;
  const promise = new Promise(r => (done = r));
  const end = () => { el.textContent = format(to); done(to); };
  if (reducedMotion() || !duration || from === to || !isBrowser) { end(); return { promise, cancel: noop }; }
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / duration);
    el.textContent = format(from + (to - from) * statEase(p));
    if (p < 1) raf = requestAnimationFrame(step); else end();
  };
  raf = requestAnimationFrame(step);
  return { promise, cancel: () => { cancelAnimationFrame(raf); end(); } };
}

/** Orion.countUp(el, to, { from, duration, format, decimals, currency, prefix, suffix, compact }) -> { promise, cancel } */
O.countUp = function (target, to, opts = {}) {
  const el = $(target);
  if (!el) return { promise: Promise.resolve(), cancel: noop };
  const from = opts.from != null ? +opts.from : (fmt.parseNumber(el.textContent) ?? 0);
  const decimals = opts.decimals ?? Math.max(statDecimals(to), statDecimals(from));
  const f = isFn(opts.format) ? opts.format : n => statFormat(n, { ...opts, decimals: opts.format === 'duration' ? null : decimals });
  el.__oCount?.cancel();
  const run = el.__oCount = countUpRun(el, from, +to, { duration: opts.duration ?? 1200, format: f });
  run.promise.then(() => { if (el.__oCount === run) el.__oCount = null; });
  return run;
};
O.countUp.format = statFormat;

/* ── <o-countup to="12450" from="0" duration="1200" format decimals currency prefix suffix announce> ── */
class OCountUp extends OElement {
  static props = {
    to: { type: Number, default: 0 }, from: { type: Number, default: 0 }, duration: { type: Number, default: 1200 },
    format: String, currency: String, decimals: Number, prefix: String, suffix: String, compact: Boolean,
    announce: Boolean, repeat: Boolean,
  };
  setup() {
    this.classList.add('o-countup');
    this.valEl = h('bdi', { class: 'o-countup-value', 'aria-hidden': 'true' });
    this.srEl = h('span', { class: 'o-sr-only' });
    this.replaceChildren(this.valEl, this.srEl);
    this._shown = null;
  }
  connected() {
    this._seen = false;
    this.addCleanup(observeVisible(this, vis => {
      if (vis && (!this._seen || this.repeat)) { this._seen = true; this.start(); }
      else if (!vis && this.repeat) this._shown = null;
    }, { threshold: 0.2 }));
  }
  disconnected() { this._run?.cancel(); }
  _opts() { return { format: this.format, currency: this.currency, decimals: this.decimals ?? (this.format === 'duration' ? null : Math.max(statDecimals(this.to), statDecimals(this.from))), prefix: this.prefix, suffix: this.suffix, compact: this.compact }; }
  update(changed) {
    const o = this._opts();
    this.srEl.textContent = statFormat(this.to, o);
    if (changed.has('init')) { this.valEl.textContent = statFormat(this.from, o); return; }
    if (this._seen && (changed.has('to') || changed.has('format') || changed.has('locale'))) this.start(this._shown ?? this.from);
  }
  /** Animate from `from` (or the value shown now) to `to`. */
  start(from = this.from) {
    this._run?.cancel();
    const o = this._opts(), to = this.to;
    this._run = countUpRun(this.valEl, +from, to, { duration: this.duration, format: n => { this._shown = n; return statFormat(n, o); } });
    this._run.promise.then(() => {
      this._shown = to;
      if (this.announce) announce(statFormat(to, o));
      this.emit('countup-end', { value: to });
    });
    return this._run.promise;
  }
  reset() { this._run?.cancel(); this._shown = null; this.valEl.textContent = statFormat(this.from, this._opts()); }
}
define('o-countup', OCountUp);
O.CountUp = OCountUp;

/* ── built-in sparkline (used when the charts package's <o-sparkline> is absent) ── */
const SPARK_NS = 'http://www.w3.org/2000/svg';
const sEl = (tag, attrs, parent) => { const el = doc.createElementNS(SPARK_NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); parent?.appendChild(el); return el; };

/** Draw values into box (sized by CSS). opts: { type: line|area|bar, rtl, label(i), value(v) } */
function sparkDraw(box, values, opts = {}) {
  const W = box.clientWidth, H = box.clientHeight;
  box.querySelector('svg')?.remove();
  const n = values.length;
  if (!W || !H || !n) return null;
  const pad = 4, type = opts.type || 'line';
  let min = Math.min(...values), max = Math.max(...values);
  if (type === 'bar') { min = Math.min(0, min); max = Math.max(0, max); }
  const span = max - min || 1;
  const X = i => { const x = n === 1 ? W / 2 : pad + i * (W - 2 * pad) / (n - 1); return opts.rtl ? W - x : x; };
  const Y = v => pad + (H - 2 * pad) * (1 - (v - min) / span);
  const s = sEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'o-spark-svg', 'aria-hidden': 'true', focusable: 'false' });
  const pts = values.map((v, i) => [X(i), Y(v)]);
  const ptsBar = [];
  if (type === 'bar') {
    const slot = (W - 2 * pad) / n, bw = Math.max(2, Math.min(8, slot - 2)), y0 = Y(0);
    values.forEach((v, i) => {
      const cx = pad + slot * (i + 0.5), x = (opts.rtl ? W - cx : cx) - bw / 2, y = Math.min(Y(v), y0), hh = Math.max(1, Math.abs(Y(v) - y0));
      sEl('rect', { x: x.toFixed(1), y: y.toFixed(1), width: bw.toFixed(1), height: hh.toFixed(1), rx: Math.min(1.5, bw / 2), class: i === n - 1 ? 'o-spark-bar is-last' : 'o-spark-bar' }, s);
      ptsBar.push([x + bw / 2, y]);
    });
  } else {
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
    if (type === 'area') sEl('path', { d: `${d}L${pts[n - 1][0].toFixed(1)} ${H}L${pts[0][0].toFixed(1)} ${H}Z`, class: 'o-spark-area' }, s);
    sEl('path', { d, class: 'o-spark-line' }, s);
    if (n > 1) sEl('path', { d: `M${pts[n - 2][0].toFixed(1)} ${pts[n - 2][1].toFixed(1)}L${pts[n - 1][0].toFixed(1)} ${pts[n - 1][1].toFixed(1)}`, class: 'o-spark-line is-last' }, s);
    sEl('circle', { cx: pts[n - 1][0].toFixed(1), cy: pts[n - 1][1].toFixed(1), r: 3, class: 'o-spark-dot' }, s);
  }
  const hair = sEl('line', { y1: 0, y2: H, class: 'o-spark-hair', visibility: 'hidden' }, s);
  const hot = sEl('circle', { r: 3.5, class: 'o-spark-dot is-hover', visibility: 'hidden' }, s);
  box.prepend(s);
  return { pts: type === 'bar' ? ptsBar : pts, hair, hot, W, H };
}

/** Hover readout for a built-in sparkline: nearest point, hairline, tooltip (value first, label second). */
function sparkHover(box, getState) {
  const tip = h('div', { class: 'o-spark-tip', hidden: true, 'aria-hidden': 'true' }, h('b'), h('span'));
  box.append(tip);
  const hide = () => { const st = getState(); tip.hidden = true; if (st?.g) { st.g.hair.setAttribute('visibility', 'hidden'); st.g.hot.setAttribute('visibility', 'hidden'); } };
  const move = e => {
    const st = getState();
    if (!st?.g) return;
    const r = box.getBoundingClientRect(), x = e.clientX - r.left, pts = st.g.pts;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - x) < Math.abs(pts[best][0] - x)) best = i;
    const [px, py] = pts[best];
    st.g.hair.setAttribute('x1', px); st.g.hair.setAttribute('x2', px); st.g.hair.setAttribute('visibility', 'visible');
    st.g.hot.setAttribute('cx', px); st.g.hot.setAttribute('cy', py); st.g.hot.setAttribute('visibility', 'visible');
    tip.firstChild.textContent = st.value(st.values[best]);
    tip.lastChild.textContent = st.label(best);
    tip.lastChild.hidden = !tip.lastChild.textContent;
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = clamp(px - tw / 2, -4, r.width - tw + 4) + 'px';
  };
  on(box, 'pointermove', move);
  on(box, 'pointerleave pointercancel', hide);
  return hide;
}
