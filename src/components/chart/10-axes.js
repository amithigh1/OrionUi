/* ============================================================================
 * Orion charts — cartesian layout & axes: margins from measured tick labels,
 * nice value ticks, category label thinning / rotation, time ticks, gridlines.
 * Grid & axes are recessive hairlines (never dashed); text wears text tokens.
 * ========================================================================== */

/**
 * Value axis ticks for a data extent over `len` px.
 * a = axis config { min, max, beginAtZero, format, ticks, type }
 */
function chValueTicks(ch, lo, hi, len, a, { zero = false, minPx = 44, kind = 'linear' } = {}) {
  const affix = f => (a.prefix || a.suffix ? v => (a.prefix || '') + f(v) + (a.suffix || '') : f);
  if (kind === 'log') {
    const [d0, d1] = chLogNice(a.min ?? Math.max(lo, 1e-9), a.max ?? hi);
    const ticks = chLogTicks(d0, d1);
    const f = chAxisFormatter(a.tickFormat || a.format, { currency: a.currency, locale: ch.locale }, 1, d1);
    return { min: d0, max: d1, ticks, step: 1, fmt: affix(f), kind };
  }
  const count = a.ticks ?? clamp(Math.floor(len / minPx), 2, 10);
  const includeZero = a.beginAtZero === true || (a.beginAtZero !== false && zero);
  const n = chNice(a.min ?? lo, a.max ?? hi, count, { zero: includeZero && a.min == null, fixedMin: a.min, fixedMax: a.max });
  const maxAbs = Math.max(Math.abs(n.min), Math.abs(n.max));
  const f = chAxisFormatter(a.tickFormat || a.format, { currency: a.currency, locale: ch.locale }, n.step, maxAbs);
  return { ...n, fmt: affix(f), kind };
}

/**
 * chCartLayout(ch, m) -> lay
 *   lay = { x0, x1, y0, y1, pw, ph, v (value scale), vt (value ticks), c (category/x scale), xt: [{ v, px, label, major }],
 *           rotate, horizontal, xKind, xtY? (horizontal-bar category ticks) }
 */
function chCartLayout(ch, m) {
  const c = ch.cfg, W = ch.W, H = ch.H, fs = ch.fontSize;
  const font = ch.font(400), xa = c.xAxis, ya = c.yAxis;
  const hor = m.horizontal;
  const lab = m.dataLabels;
  const titleH = fs + 8;
  let top = 8 + (lab && !hor && m.bars.length ? fs + 4 : 0);
  if (m.endLabels) top = Math.max(top, fs * 0.6);
  let right = 12;
  if (m.endLabels) right = Math.min(Math.max(...m.endLabels.map(e => e.w)) + 18, W * 0.28);
  if (lab && hor) right = Math.max(right, 12 + chMeasure(m.maxLabelText || '0000', font) + 6);
  // values always use yAxis options (horizontal swaps geometry only); 100% stacks read as percent
  const valueA = m.stackMode === 'percent' && !ya.format ? { ...ya, format: 'percent', max: ya.max ?? 1 } : ya;
  const catA = xa;

  if (!hor) {
    const xTitle = catA.title ? titleH : 0;
    const yTitle = valueA.title ? titleH : 0;
    let bottom = fs + 12 + xTitle;
    let ph = Math.max(40, H - top - bottom);
    let vt = chValueTicks(ch, m.vLo, m.vHi, ph, valueA, { zero: m.zero, kind: m.yKind });
    let labW = Math.max(0, ...vt.ticks.map(v => chMeasure(vt.fmt(v), font)));
    let left = 6 + yTitle + labW + 8;
    let pw = Math.max(40, W - left - right);
    const x = chXAxis(ch, m, left, left + pw, font);
    bottom = x.height + xTitle + 6;
    const ph2 = Math.max(40, H - top - bottom);
    if (Math.abs(ph2 - ph) > 1) {
      ph = ph2;
      vt = chValueTicks(ch, m.vLo, m.vHi, ph, valueA, { zero: m.zero, kind: m.yKind });
      const labW2 = Math.max(0, ...vt.ticks.map(v => chMeasure(vt.fmt(v), font)));
      if (labW2 > labW + 1) { left += labW2 - labW; pw = Math.max(40, W - left - right); Object.assign(x, chXAxis(ch, m, left, left + pw, font)); }
      labW = labW2;
    }
    const v = (vt.kind === 'log' ? chLog : chLinear)(vt.min, vt.max, top + ph, top);
    return { x0: left, x1: left + pw, y0: top, y1: top + ph, pw, ph, v, vt, c: x.scale, xt: x.ticks, rotate: x.rotate, horizontal: false, xKind: m.xKind, labW, yTitle, xTitle, bottomH: x.height };
  }
  // horizontal bars: categories down the left, values along the bottom
  const xTitle = valueA.title ? titleH : 0;
  const yTitle = catA.title ? titleH : 0;
  const bottom = fs + 12 + xTitle;
  const ph = Math.max(40, H - top - bottom);
  const maxCat = W * 0.34;
  const labels = m.labelsText;
  const catW = Math.min(maxCat, Math.max(0, ...labels.map(s => chMeasure(s, font))));
  const left = 6 + yTitle + catW + 10;
  const pw = Math.max(40, W - left - right);
  const vt = chValueTicks(ch, m.vLo, m.vHi, pw, valueA, { zero: true, minPx: 72, kind: m.yKind });
  const v = (vt.kind === 'log' ? chLog : chLinear)(vt.min, vt.max, left, left + pw);
  const z = m.view;
  const band = chBand(z.n, top, top + ph, { inner: m.bars.length ? 0.3 : 0.2, outer: 0.15, offset: z.offset });
  const step = band.step;
  const every = Math.max(1, Math.ceil((fs + 4) / step));
  const xt = [];
  for (let i = z.offset; i < z.offset + z.n; i++) if ((i - z.offset) % every === 0) xt.push({ v: i, px: band.center(i), label: chFit(labels[i], catW, font) });
  return { x0: left, x1: left + pw, y0: top, y1: top + ph, pw, ph, v, vt, c: band, xt, horizontal: true, xKind: 'category', catW, yTitle, xTitle };
}

/** X axis for vertical layouts: scale + ticks + needed height. */
function chXAxis(ch, m, x0, x1, font) {
  const fs = ch.fontSize, pw = x1 - x0, xa = ch.cfg.xAxis;
  const z = m.view;
  if (m.xKind === 'category') {
    const scale = m.bars.length || m.forceBand ? chBand(z.n, x0, x1, { inner: m.stackedAll ? 0.36 : 0.28, outer: 0.14, offset: z.offset }) : chPoint(z.n, x0, x1, { pad: z.n > 1 ? 0 : 0.5, offset: z.offset });
    const labels = m.labelsText;
    const vis = [];
    for (let i = z.offset; i < z.offset + z.n; i++) vis.push(i);
    const widths = vis.map(i => chMeasure(labels[i], font));
    const maxW = Math.max(0, ...widths);
    const step = scale.kind === 'band' ? scale.step : (scale.step || pw);
    let rotate = false, every = 1, maxLabel = Infinity;
    if (maxW + 8 > step) {
      const textual = !m.labelsAreDates && !m.labelsAreNumbers;
      // short labels (months, codes) thin out; long names rotate so every category stays labelled
      if (textual && xa.rotate !== false && maxW > 48 && vis.length <= 48 && step >= fs * 0.95) { rotate = true; maxLabel = 110; }
      else every = Math.ceil((maxW + 12) / Math.max(1, step));
    }
    if (xa.rotate === true) rotate = true;
    const ticks = [];
    vis.forEach((i, k) => {
      if (k % every !== 0) return;
      ticks.push({ v: i, px: scale.center(i), label: rotate ? chFit(labels[i], maxLabel, font) : labels[i] });
    });
    const rW = rotate ? Math.min(maxLabel, maxW) : 0;
    const height = rotate ? Math.sin(Math.PI * 40 / 180) * rW + fs + 10 : fs + 12;
    return { scale, ticks, rotate, height };
  }
  const [d0, d1] = z.domain;
  if (m.xKind === 'time') {
    const sample = chMeasure(chTimeLabel(d1, (d1 - d0) > 400 * CH_T.d ? 'y' : (d1 - d0) > 60 * CH_T.d ? 'M' : (d1 - d0) > 2 * CH_T.d ? 'd' : 'h', ch.locale), font);
    const count = xa.ticks ?? clamp(Math.floor(pw / (sample + 36)), 2, 12);
    const tt = chTimeTicks(d0, d1, count);
    const scale = chLinear(d0, d1, x0, x1);
    const ticks = tt.ticks.map(v => ({ v, px: scale(v), label: isFn(xa.format) ? String(xa.format(new Date(v))) : chTimeLabel(v, tt.unit, ch.locale), major: chTimeMajor(v, tt.unit) }));
    return { scale, ticks, rotate: false, height: fs + 12, unit: tt.unit };
  }
  // linear / log x
  const log = m.xKind === 'log';
  const sampleW = chMeasure(chFormatter(xa.format, { locale: ch.locale })(d1), font);
  const vt = chValueTicks(ch, d0, d1, pw, xa, { minPx: Math.max(56, sampleW + 28), kind: log ? 'log' : 'linear' });
  const scale = (log ? chLog : chLinear)(vt.min, vt.max, x0, x1);
  return { scale, ticks: vt.ticks.map(v => ({ v, px: scale(v), label: vt.fmt(v) })), rotate: false, height: fs + 12, vt };
}

/** Gridlines, baseline, tick labels and axis titles. L: layers { grid, axes } */
function chDrawCartAxes(ch, L, lay, m) {
  const c = ch.cfg, fs = ch.fontSize, W = ch.W;
  const g = L.grid.begin(), ax = L.axes.begin();
  const hor = lay.horizontal;
  const showGrid = c.yAxis.grid !== false;
  // value gridlines
  for (const v of lay.vt.ticks) {
    const p = crisp(lay.v(v));
    if (hor ? (p < lay.x0 - 1 || p > lay.x1 + 1) : (p < lay.y0 - 1 || p > lay.y1 + 1)) continue;
    if (showGrid) chAttr(g.next('line', 'o-ch-gridline'), hor ? { x1: p, x2: p, y1: lay.y0, y2: lay.y1 } : { x1: lay.x0, x2: lay.x1, y1: p, y2: p });
    const t = ax.next('text', 'o-ch-tick');
    chSetText(t, lay.vt.fmt(v));
    if (hor) chAttr(t, { x: lay.v(v), y: lay.y1 + fs + 6, 'text-anchor': 'middle', transform: null, 'dominant-baseline': null });
    else chAttr(t, { x: lay.x0 - 8, y: lay.v(v), 'text-anchor': 'end', 'dominant-baseline': 'central', transform: null });
  }
  // x gridlines for numeric x (scatter) when asked
  if (!hor && lay.xKind !== 'category' && c.xAxis.grid === true) {
    for (const tk of lay.xt) chAttr(g.next('line', 'o-ch-gridline'), { x1: crisp(tk.px), x2: crisp(tk.px), y1: lay.y0, y2: lay.y1 });
  }
  // baseline (value 0 when visible, else the bottom/left edge)
  const [vd0, vd1] = [lay.vt.min, lay.vt.max];
  const zeroIn = lay.vt.kind !== 'log' && vd0 <= 0 && vd1 >= 0;
  const bp = crisp(zeroIn ? lay.v(0) : hor ? lay.x0 : lay.y1);
  chAttr(ax.next('line', 'o-ch-axis-line'), hor ? { x1: bp, x2: bp, y1: lay.y0, y2: lay.y1 } : { x1: lay.x0, x2: lay.x1, y1: bp, y2: bp });
  // category / x tick labels
  for (const tk of lay.xt) {
    if (tk.px < (hor ? lay.y0 : lay.x0) - 2 || tk.px > (hor ? lay.y1 : lay.x1) + 2) continue;
    const t = ax.next('text', 'o-ch-tick' + (tk.major ? ' is-major' : ''));
    chSetText(t, tk.label);
    if (hor) { chAttr(t, { x: lay.x0 - 10, y: tk.px, 'text-anchor': 'end', 'dominant-baseline': 'central', transform: null }); continue; }
    const y = lay.y1 + fs + 6;
    if (lay.rotate) { chAttr(t, { x: tk.px, y: lay.y1 + 10, 'text-anchor': 'end', 'dominant-baseline': 'central', transform: `rotate(-40 ${r1(tk.px)} ${r1(lay.y1 + 10)})` }); continue; }
    const w = chMeasure(tk.label, ch.font(tk.major ? 500 : 400));
    let x = tk.px;
    if (x - w / 2 < 2) x = 2 + w / 2; else if (x + w / 2 > W - 2) x = W - 2 - w / 2;
    chAttr(t, { x: r1(x), y, 'text-anchor': 'middle', 'dominant-baseline': null, transform: null });
  }
  // titles
  const vTitle = c.yAxis.title, cTitle = c.xAxis.title;
  const bottomTitle = hor ? vTitle : cTitle, leftTitle = hor ? cTitle : vTitle;
  if (bottomTitle) {
    const t = ax.next('text', 'o-ch-axis-title');
    chSetText(t, bottomTitle);
    chAttr(t, { x: (lay.x0 + lay.x1) / 2, y: ch.H - 4, 'text-anchor': 'middle', transform: null, 'dominant-baseline': null });
  }
  if (leftTitle) {
    const t = ax.next('text', 'o-ch-axis-title');
    chSetText(t, leftTitle);
    const cy = (lay.y0 + lay.y1) / 2;
    chAttr(t, { x: fs * 0.9, y: cy, 'text-anchor': 'middle', 'dominant-baseline': null, transform: `rotate(-90 ${r1(fs * 0.9)} ${r1(cy)})` });
  }
  g.end(); ax.end();
}

/** Annotation lines & bands: [{ type: 'line'|'band', axis: 'y'|'x', value | from/to, label, color, status }] */
function chDrawAnnotations(ch, Lband, Lline, lay, m) {
  const list = ch.cfg.annotations || [];
  const bg = Lband.begin(), ln = Lline.begin(), fs = ch.fontSize;
  const toPx = (axis, v) => {
    if (axis === 'x') {
      if (lay.horizontal) return null;
      if (lay.xKind === 'category') { const i = isNum(v) ? v : m.labels.findIndex(l => String(l) === String(v)); return i < 0 ? null : lay.c.center(i); }
      if (lay.xKind === 'time') return lay.c(chTime(v));
      return lay.c(+v);
    }
    return lay.v(+v);
  };
  for (const a of list) {
    const axis = a.axis || (a.x != null ? 'x' : 'y');
    const vertical = axis === 'x' ? !lay.horizontal : lay.horizontal;
    const col = a.status ? `var(--o-status-${a.status})` : a.color ? chColor(a.color) : null;
    if (a.type === 'band' || (a.from != null && a.to != null)) {
      let p0 = toPx(axis, a.from), p1 = toPx(axis, a.to);
      if (p0 == null || p1 == null || !Number.isFinite(p0) || !Number.isFinite(p1)) continue;
      if (p0 > p1) [p0, p1] = [p1, p0];
      const rect = bg.next('rect', 'o-ch-band');
      if (vertical) chAttr(rect, { x: clamp(p0, lay.x0, lay.x1), y: lay.y0, width: Math.max(0, clamp(p1, lay.x0, lay.x1) - clamp(p0, lay.x0, lay.x1)), height: lay.ph });
      else chAttr(rect, { x: lay.x0, y: clamp(p0, lay.y0, lay.y1), width: lay.pw, height: Math.max(0, clamp(p1, lay.y0, lay.y1) - clamp(p0, lay.y0, lay.y1)) });
      rect.style.fill = col || '';
      if (a.label) {
        const t = bg.next('text', 'o-ch-annot-label');
        chSetText(t, a.label);
        chAttr(t, vertical ? { x: clamp(p0, lay.x0, lay.x1) + 6, y: lay.y0 + fs + 2, 'text-anchor': 'start' } : { x: lay.x1 - 6, y: clamp(p0, lay.y0, lay.y1) + fs + 2, 'text-anchor': 'end' });
      }
      continue;
    }
    const val = a.value ?? a.y ?? a.x;
    const p = toPx(axis, val);
    if (p == null || !Number.isFinite(p)) continue;
    if (vertical ? (p < lay.x0 - 0.5 || p > lay.x1 + 0.5) : (p < lay.y0 - 0.5 || p > lay.y1 + 0.5)) continue;
    const q = crisp(p);
    const line = ln.next('line', 'o-ch-annot' + (a.dashed === false ? '' : ' is-dashed'));
    chAttr(line, vertical ? { x1: q, x2: q, y1: lay.y0, y2: lay.y1 } : { x1: lay.x0, x2: lay.x1, y1: q, y2: q });
    line.style.stroke = col || '';
    if (a.label) {
      const text = String(a.label);
      const font = ch.font(500, fs - 1);
      const w = chMeasure(text, font) + 10, hgt = fs + 6;
      const bx = vertical ? clamp(q + 4, lay.x0, lay.x1 - w) : lay.x1 - w;
      const by = vertical ? lay.y0 : clamp(q - hgt - 3, lay.y0 - 4, lay.y1 - hgt);
      chAttr(ln.next('rect', 'o-ch-annot-bg'), { x: r1(bx), y: r1(by), width: r1(w), height: hgt, rx: 4 });
      const t = ln.next('text', 'o-ch-annot-label');
      chSetText(t, text);
      chAttr(t, { x: r1(bx + 5), y: r1(by + hgt / 2), 'dominant-baseline': 'central', 'text-anchor': 'start' });
    }
  }
  bg.end(); ln.end();
}
