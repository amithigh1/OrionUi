/* ============================================================================
 * Orion charts — cartesian drawing. Marks follow the data-viz spec:
 *   bars ≤ 24px, 4px rounded data-end, square baseline, 2px surface gaps;
 *   lines 2px round joins; area = 10% wash; dots ≥ 8px with a 2px surface ring;
 *   selective direct labels (line ends, bar caps when they fit).
 * Tweens: value axis + values interpolate on update; streams slide along x.
 * ========================================================================== */

/** How many leading categories were dropped between two label lists (streaming). */
function chStreamShift(a, b) {
  if (!a || !b || !a.length || !b.length) return 0;
  const key = v => (v instanceof Date ? +v : String(v));
  const b0 = key(b[0]);
  for (let k = 1; k <= Math.min(8, a.length - 1); k++) if (key(a[k]) === b0) return k;
  return 0;
}

function chCartRender(ch, m, fr) {
  const c = ch.cfg, fs = ch.fontSize;
  const L = ch.layers(['grid', 'bands', 'hl', 'series', 'annot', 'labels', 'axes', 'hover']);
  const lay = chCartLayout(ch, m);
  const t = fr.t, mode = fr.mode, prev = fr.prev && fr.prev.kind === 'cartesian' ? fr.prev : null;
  const P = prev?._lay;
  const tweening = (mode === 'update' || mode === 'stream') && prev && P && P.horizontal === lay.horizontal;
  // value scale tween
  let vd = [lay.vt.min, lay.vt.max];
  if (tweening && P.vt.kind === lay.vt.kind && t < 1) vd = [lerp(P.vd[0], vd[0], t), lerp(P.vd[1], vd[1], t)];
  const vr = lay.horizontal ? [lay.x0, lay.x1] : [lay.y1, lay.y0];
  lay.v = (lay.vt.kind === 'log' ? chLog : chLinear)(vd[0], vd[1], vr[0], vr[1]);
  lay.vd = vd;
  // x tween (numeric streams / zoom) and category stream shift
  let shift = 0;
  if (tweening && m.xKind !== 'category' && prev.xKind === m.xKind && t < 1 && P.xd) {
    const nd = m.view.domain, xd = [lerp(P.xd[0], nd[0], t), lerp(P.xd[1], nd[1], t)];
    lay.c = (m.xKind === 'log' ? chLog : chLinear)(xd[0], xd[1], lay.x0, lay.x1);
    lay.xt.forEach(tk => { tk.px = lay.c(tk.v); });
  }
  if (m.xKind !== 'category') lay.xd = lay.c.domain.slice();
  if (m.xKind === 'category' && mode === 'stream' && prev?.xKind === 'category') {
    shift = chStreamShift(prev.labels, m.labels);
    if (shift && t < 1) {
      const off = m.view.offset - shift * (1 - t);
      const b = lay.c;
      lay.c = b.kind === 'band' ? chBand(m.view.n, lay.x0, lay.x1, { inner: 1 - b.bw / b.step, outer: (b(m.view.offset) - lay.x0) / b.step, offset: off }) : chPoint(m.view.n, lay.x0, lay.x1, { pad: 0, offset: off });
      lay.xt.forEach(tk => { tk.px = lay.c.center(tk.v); });
    }
  }
  m._lay = lay;
  chDrawCartAxes(ch, L, lay, m);
  chDrawAnnotations(ch, L.bands, L.annot, lay, m);
  L.series.g.setAttribute('clip-path', ch.clip(lay.x0 - 4, lay.y0 - 6, lay.pw + 8, lay.ph + 12));

  const S = L.series.begin(), LB = L.labels.begin();
  const hor = lay.horizontal;
  const enter = mode === 'enter';
  const N = Math.max(1, m.view.n || 1);
  const stagger = k => (enter ? easeOut(clamp((fr.raw - 0.35 * (k / N)) / 0.65, 0, 1)) : 1);
  const prevS = new Map((prev?.series || []).filter(s => !s.hidden).map(s => [s.key, s]));
  const prevPoint = (s, p) => {
    const ps = prevS.get(s.key);
    if (!ps) return null;
    if (m.xKind === 'category') return ps.byX?.[p.x + shift] || null;
    const k = ps.pts.length === s.pts.length ? s.pts.indexOf(p) : -1;
    if (k >= 0 && ps.pts[k] && ps.pts[k].x === p.x) return ps.pts[k];
    const j = chBisect(ps.pts, p.x, q => q.x);
    return j >= 0 && ps.pts[j].x === p.x ? ps.pts[j] : null;
  };
  const tw = (s, p, key) => {
    if (!tweening || t >= 1) return p[key];
    const pp = prevPoint(s, p);
    if (pp && pp[key] != null) return lerp(pp[key], p[key], t);
    return key === 'y' || key === 'y1' ? lerp(key === 'y1' ? p.y0 : (m.zero ? 0 : p.y), p[key], t) : p[key];
  };
  const twk = (s, p, key) => {
    if (!tweening || t >= 1) return p[key];
    const pp = prevPoint(s, p);
    return pp && pp[key] != null ? lerp(pp[key], p[key], t) : p[key];
  };
  const streamPrev = mode === 'stream' && t < 1 ? prev : null;
  const geo = { bars: [], lines: [], dots: [], candles: [] };
  const xPos = p => (m.xKind === 'category' ? lay.c.center(p.x) : lay.c(p.x));
  const inX = (p, pad = 1) => (m.xKind === 'category' ? p.x >= m.view.lo - pad - shift && p.x <= m.view.hi + pad : true);

  /* ── bars (column / bar) ─────────────────────────────────────────── */
  const g = Math.max(1, m.groups.length), bw = lay.c.bw || 0, cap = c.barWidth ?? 24;
  const gap = g > 1 ? 2 : 0;
  const thick = clamp((bw - gap * (g - 1)) / g, 1, cap);
  const total = thick * g + gap * (g - 1);
  const slot = (i, k) => lay.c(i) + (bw - total) / 2 + k * (thick + gap);
  lay.slot = slot; lay.thick = thick;
  // outermost segment per stack & index (gets the rounded data end)
  const tops = new Map();
  for (const s of m.bars) {
    if (s.stackId.startsWith('solo:')) continue;
    for (const p of s.pts) { if (p.y == null || !p.y) continue; const k = s.stackId + '|' + p.x + (p.y1 >= 0 && p.y >= 0 ? '+' : '-'); tops.set(k, s.key); }
  }
  const zeroPx = lay.v(lay.vt.kind === 'log' ? vd[0] : clamp(0, vd[0], vd[1]));
  for (const s of m.bars) {
    const k = m.groups.indexOf(s.stackId);
    const solo = s.stackId.startsWith('solo:');
    for (const p of s.pts) {
      if (p.y == null || !inX(p)) continue;
      const te = stagger(p.x - m.view.offset);
      let y0 = solo ? 0 : tw(s, p, 'y0'), y1 = solo ? tw(s, p, 'y') : tw(s, p, 'y1');
      if (enter) { y0 *= te; y1 *= te; }
      if (lay.vt.kind === 'log') { y0 = vd[0]; }
      const a = lay.v(y0), b = lay.v(y1);
      const pos = (p.y ?? 0) >= 0;
      const outer = solo || tops.get(s.stackId + '|' + p.x + (pos ? '+' : '-')) === s.key;
      const atBase = solo || Math.abs(p.y0) < 1e-12;
      let lo = Math.min(a, b), hi = Math.max(a, b);
      // 2px surface gap between stacked segments
      if (!atBase) { if (hor) { if (pos) lo += 1; else hi -= 1; } else { if (pos) hi -= 1; else lo += 1; } }
      if (!outer) { if (hor) { if (pos) hi -= 1; else lo += 1; } else { if (pos) lo += 1; else hi -= 1; } }
      const len = hi - lo;
      const x = slot(p.x, k);
      const el = S.next('path', 'o-ch-bar o-ch-mark');
      if (len < 0.5) { el.setAttribute('d', ''); continue; }
      const end = !outer ? 'none' : hor ? (pos ? 'right' : 'left') : (pos ? 'top' : 'bottom');
      el.setAttribute('d', hor ? chBarPath(lo, x, len, thick, 4, end) : chBarPath(x, lo, thick, len, 4, end));
      el.style.setProperty('--sc', p.color || s.color);
      el.dataset.key = s.key; el.dataset.i = p.x;
      geo.bars.push({ s, p, x0: hor ? lo : x, y0: hor ? x : lo, x1: hor ? hi : x + thick, y1: hor ? x + thick : hi, k });
    }
  }
  /* ── bar data labels (value at the tip, only when it fits) ────────── */
  if (m.dataLabels && m.bars.length && (enter ? fr.raw > 0.75 : true)) {
    const font = ch.font(500);
    for (const gb of geo.bars) {
      const { s, p } = gb;
      if (!s.stackId.startsWith('solo:') && (m.stackMode === 'percent' || tops.get(s.stackId + '|' + p.x + (p.y >= 0 ? '+' : '-')) !== s.key)) {
        // interior stacked segment: inline only when it fits, else legend + tooltip carry it
        const tx = m.stackMode === 'percent' ? fmt.percent(p.share ?? 0, 0, ch.locale) : ch.fmtValue(p.y);
        const w = chMeasure(tx, font), segW = gb.x1 - gb.x0, segH = gb.y1 - gb.y0;
        if (w + 10 <= segW && fs + 6 <= segH) {
          const el = LB.next('text', 'o-ch-label is-inside ' + chInkClass(ch.resolveColor(s.color)));
          chSetText(el, tx);
          chAttr(el, { x: r1((gb.x0 + gb.x1) / 2), y: r1((gb.y0 + gb.y1) / 2), 'text-anchor': 'middle', 'dominant-baseline': 'central' });
        }
        continue;
      }
      const val = !s.stackId.startsWith('solo:') && m.stackMode !== 'percent' ? p.y1 : p.y;
      const tx = m.stackMode === 'percent' && !s.stackId.startsWith('solo:') ? fmt.percent(p.share ?? 0, 0, ch.locale) : ch.fmtValue(val);
      const w = chMeasure(tx, font);
      const el = LB.next('text', 'o-ch-label');
      chSetText(el, tx);
      if (hor) {
        const pos = p.y >= 0, x = pos ? gb.x1 + 6 : gb.x0 - 6;
        if (pos ? x + w > ch.W - 2 : x - w < 2) { el.textContent = ''; continue; }
        chAttr(el, { x: r1(x), y: r1((gb.y0 + gb.y1) / 2), 'text-anchor': pos ? 'start' : 'end', 'dominant-baseline': 'central' });
      } else {
        if (w > (lay.c.step || thick) - 2) { el.textContent = ''; continue; }
        const pos = p.y >= 0;
        chAttr(el, { x: r1((gb.x0 + gb.x1) / 2), y: r1(pos ? gb.y0 - 6 : gb.y1 + fs + 2), 'text-anchor': 'middle', 'dominant-baseline': null });
      }
    }
  }

  /* ── box plots ───────────────────────────────────────────────────── */
  for (const s of m.vis) {
    if (s.type !== 'boxplot') continue;
    const k = m.groups.indexOf('box:' + s.key);
    for (const p of s.pts) {
      if (!inX(p)) continue;
      const te = stagger(p.x - m.view.offset);
      const mid = p.median, f = key => lay.v(enter ? lerp(mid, p[key], te) : twk(s, p, key));
      const x = slot(p.x, k), cx = x + thick / 2, w = thick;
      const yMin = f('min'), yMax = f('max'), yQ1 = f('q1'), yQ3 = f('q3'), yMed = f('median');
      const grp = S.next('path', 'o-ch-whisker o-ch-mark');
      const wx = r1(cx) + 0.5;
      grp.setAttribute('d', `M${wx},${r1(yMax)}V${r1(Math.min(yQ3, yQ1))}M${wx},${r1(Math.max(yQ1, yQ3))}V${r1(yMin)}M${r1(cx - w / 4)},${r1(yMax)}H${r1(cx + w / 4)}M${r1(cx - w / 4)},${r1(yMin)}H${r1(cx + w / 4)}`);
      grp.style.setProperty('--sc', s.color); grp.dataset.key = s.key;
      const box = S.next('path', 'o-ch-box o-ch-mark');
      box.setAttribute('d', chRectPath(x, Math.min(yQ1, yQ3), w, Math.max(1, Math.abs(yQ1 - yQ3)), 3));
      box.style.setProperty('--sc', s.color); box.dataset.key = s.key;
      const med = S.next('line', 'o-ch-median o-ch-mark');
      chAttr(med, { x1: r1(x + 1), x2: r1(x + w - 1), y1: r1(yMed), y2: r1(yMed) });
      med.style.setProperty('--sc', s.color); med.dataset.key = s.key;
      for (const o of p.outliers || []) {
        const d = S.next('circle', 'o-ch-outlier o-ch-mark');
        chAttr(d, { cx: r1(cx), cy: r1(lay.v(o)), r: 3 });
        d.style.setProperty('--sc', s.color); d.dataset.key = s.key;
      }
      geo.bars.push({ s, p, x0: x - 2, x1: x + w + 2, y0: Math.min(yMax, yMin), y1: Math.max(yMax, yMin), k, box: true });
    }
  }

  /* ── candlestick / OHLC ──────────────────────────────────────────── */
  for (const s of m.vis) {
    if (s.type !== 'candlestick' && s.type !== 'ohlc') continue;
    const w = clamp((bw || 8) * 0.72, 1, cap);
    for (const p of s.pts) {
      if (!inX(p)) continue;
      const te = stagger(p.x - m.view.offset);
      const mid = (p.o + p.c) / 2;
      const f = key => lay.v(enter ? lerp(mid, p[key], te) : twk(s, p, key));
      const cx = lay.c.center(p.x), up = p.c >= p.o;
      const yo = f('o'), yc = f('c'), yh = f('h'), yl = f('l');
      const cls = up ? ' is-up' : ' is-down';
      const wick = S.next('path', 'o-ch-wick o-ch-mark' + cls);
      const X = r1(cx) + (w % 2 ? 0.5 : 0);
      if (s.type === 'candlestick') {
        wick.setAttribute('d', `M${X},${r1(yh)}V${r1(Math.min(yo, yc))}M${X},${r1(Math.max(yo, yc))}V${r1(yl)}`);
        const body = S.next('path', 'o-ch-candle o-ch-mark' + cls);
        const top = Math.min(yo, yc), hgt = Math.max(1, Math.abs(yo - yc));
        body.setAttribute('d', chRectPath(cx - w / 2 + (up ? 0.75 : 0), top + (up ? 0.75 : 0), w - (up ? 1.5 : 0), Math.max(1, hgt - (up ? 1.5 : 0)), Math.min(2, w / 4)));
        body.dataset.key = s.key; body.dataset.i = p.x;
      } else {
        wick.setAttribute('d', `M${X},${r1(yh)}V${r1(yl)}M${r1(cx - w / 2)},${r1(yo)}H${X}M${X},${r1(yc)}H${r1(cx + w / 2)}`);
      }
      wick.dataset.key = s.key;
      geo.bars.push({ s, p, x0: cx - Math.max(w, 8) / 2, x1: cx + Math.max(w, 8) / 2, y0: Math.min(yh, yl), y1: Math.max(yh, yl), candle: true });
    }
  }

  /* ── areas & lines ───────────────────────────────────────────────── */
  const lines = m.vis.filter(s => s.type === 'line' || s.type === 'area');
  const baseV = lay.vt.kind === 'log' ? vd[0] : clamp(0, vd[0], vd[1]);
  const drawOrder = [...lines.filter(s => s.area), ...lines.filter(s => !s.area)];
  const areaPass = lines.filter(s => s.area);
  for (const s of areaPass) {
    const pts = chVisiblePts(ch, m, s, lay, shift, streamPrev);
    const runs = [];
    let run = [];
    for (const p of pts) {
      const y1 = s.stackId.startsWith('solo:') ? tw(s, p, 'y') : tw(s, p, 'y1');
      if (y1 == null) { if (run.length) runs.push(run); run = []; continue; }
      const y0 = s.stackId.startsWith('solo:') ? baseV : tw(s, p, 'y0');
      run.push([xPos(p), lay.v(y1), lay.v(y0)]);
    }
    if (run.length) runs.push(run);
    const el = S.next('path', 'o-ch-area o-ch-mark' + (m.stackMode ? ' is-stacked' : ''));
    el.setAttribute('d', runs.map(r => (hor ? '' : chAreaPath(r.map(q => [q[0], q[1]]), r.map(q => [q[0], q[2]]), s.curve))).join(''));
    el.style.setProperty('--sc', s.color); el.dataset.key = s.key;
  }
  for (const s of drawOrder) {
    const pts = chVisiblePts(ch, m, s, lay, shift, streamPrev);
    const coords = [], sx = [], sy = [], sp = [];
    for (const p of pts) {
      const y = s.stackId.startsWith('solo:') ? tw(s, p, 'y') : tw(s, p, 'y1');
      if (y == null) { coords.push(null); continue; }
      const X = xPos(p), Y = lay.v(y);
      coords.push([X, Y]); sx.push(X); sy.push(Y); sp.push(p);
    }
    const el = S.next('path', 'o-ch-line o-ch-mark' + (s.dashed ? ' is-dashed' : ''));
    el.setAttribute('d', chLinePath(coords, s.curve));
    el.style.setProperty('--sc', s.color); el.dataset.key = s.key;
    geo.lines.push({ s, sx, sy, sp });
    const showDots = s.markers === true || (s.markers === 'auto' && sp.length <= 1);
    if (showDots) {
      for (let j = 0; j < sp.length; j++) {
        const d = S.next('circle', 'o-ch-dot o-ch-mark');
        chAttr(d, { cx: r1(sx[j]), cy: r1(sy[j]), r: 3.5 });
        d.style.setProperty('--sc', s.color); d.dataset.key = s.key;
      }
    }
  }
  if (enter && lines.length && !m.bars.length) {
    L.series.g.setAttribute('clip-path', ch.clip(lay.x0 - 4, lay.y0 - 6, (lay.pw + 8) * easeOut(fr.raw), lay.ph + 12));
  }

  /* ── scatter & bubble ────────────────────────────────────────────── */
  const bub = m.vis.filter(s => s.type === 'bubble');
  let zMax = 0;
  for (const s of bub) for (const p of s.pts) zMax = Math.max(zMax, Math.abs(p.z || 0));
  const rMax = clamp(Math.min(lay.pw, lay.ph) / 9, 8, 30);
  lay.rOf = z => Math.max(3, Math.sqrt(Math.abs(z || 0) / (zMax || 1)) * rMax);
  for (const s of m.vis) {
    if (s.type !== 'scatter' && s.type !== 'bubble') continue;
    const many = s.pts.length > 1200;
    const baseR = s.raw.size ?? (many ? 2.5 : 4);
    const sx = [], sy = [], sr = [], sp = [];
    const sorted = s.type === 'bubble' ? [...s.pts].sort((a, b) => (b.z || 0) - (a.z || 0)) : s.pts;
    sorted.forEach((p, j) => {
      if (p.y == null) return;
      const te = enter ? easeOut(clamp((fr.raw - 0.3 * (j / Math.max(1, sorted.length))) / 0.7, 0, 1)) : 1;
      const X = lay.c(p.x), Y = lay.v(tw(s, p, 'y'));
      const r = (s.type === 'bubble' ? lay.rOf(p.z) : baseR) * te;
      const d = S.next('circle', (s.type === 'bubble' ? 'o-ch-bubble' : 'o-ch-dot') + ' o-ch-mark' + (many ? ' is-dense' : ''));
      chAttr(d, { cx: r1(X), cy: r1(Y), r: r1(Math.max(0, r)) });
      d.style.setProperty('--sc', p.color || s.color); d.dataset.key = s.key;
      sx.push(X); sy.push(Y); sr.push(r); sp.push(p);
    });
    geo.dots.push({ s, sx, sy, sr, sp });
  }
  S.end();

  /* ── direct end labels for lines (leader lines when they had to move) ── */
  if (m.endLabels && geo.lines.length && !hor) {
    const items = [];
    for (const e of m.endLabels) {
      const gl = geo.lines.find(x => x.s.key === e.key);
      if (!gl || !gl.sx.length) continue;
      const j = gl.sx.length - 1;
      if (gl.sx[j] < lay.x0 - 1 || gl.sx[j] > lay.x1 + 1) continue;
      items.push({ e, s: gl.s, x: gl.sx[j], y: gl.sy[j], ly: gl.sy[j] });
    }
    items.sort((a, b) => a.y - b.y);
    const gapY = fs + 3;
    for (let pass = 0; pass < 40; pass++) {
      let moved = false;
      for (let i = 1; i < items.length; i++) {
        const d = items[i].ly - items[i - 1].ly;
        if (d < gapY) { const push = (gapY - d) / 2; items[i - 1].ly -= push; items[i].ly += push; moved = true; }
      }
      for (const it of items) it.ly = clamp(it.ly, lay.y0 + fs / 2 - 4, lay.y1 - fs / 2 + 2);
      if (!moved) break;
    }
    const op = enter ? clamp((fr.raw - 0.7) / 0.3, 0, 1) : 1;
    for (const it of items) {
      const dot = LB.next('circle', 'o-ch-dot o-ch-mark is-end');
      chAttr(dot, { cx: r1(it.x), cy: r1(it.y), r: 4 });
      dot.style.setProperty('--sc', it.s.color); dot.dataset.key = it.s.key; dot.style.opacity = op;
      const lx = lay.x1 + 10;
      if (Math.abs(it.ly - it.y) > 2 || it.x < lay.x1 - 2) {
        const ld = LB.next('path', 'o-ch-leader');
        ld.setAttribute('d', `M${r1(it.x + 5)},${r1(it.y)}L${r1(lx - 3)},${r1(it.ly)}`);
        ld.style.opacity = op;
      }
      const tx = LB.next('text', 'o-ch-label is-end');
      chSetText(tx, it.e.text);
      chAttr(tx, { x: r1(lx), y: r1(it.ly), 'text-anchor': 'start', 'dominant-baseline': 'central' });
      tx.style.opacity = op;
    }
  }
  LB.end();
  L.hover.begin().end();
  L.hl.begin().end();
  return chCartView(ch, m, lay, geo, L);
}

/** Points of a line/area series worth drawing: inside the view (+1 each side), LTTB past 2k, stream tail. */
function chVisiblePts(ch, m, s, lay, shift, prev) {
  let pts = s.pts;
  if (m.xKind === 'category') {
    const lo = m.view.lo - 1 - shift, hi = m.view.hi + 1;
    pts = pts.filter(p => p.x >= lo && p.x <= hi);
    if (shift && prev) {
      const ps = prev.series.find(x => x.key === s.key);
      if (ps) { const head = ps.pts.filter(p => p.x < shift).map(p => ({ ...p, x: p.x - shift })); pts = [...head, ...pts]; }
    }
    return pts;
  }
  const [d0, d1] = lay.c.domain;
  const a = Math.max(0, chBisect(pts, d0, p => p.x) - 1), b = Math.min(pts.length, chBisect(pts, d1, p => p.x) + 2);
  pts = pts.slice(a, b);
  if (prev && lay.xd && prev._lay?.xd && prev.xKind === m.xKind) {
    const ps = prev.series.find(x => x.key === s.key);
    if (ps && ps.pts.length && pts.length && ps.pts[0].x < pts[0].x) {
      const head = ps.pts.filter(p => p.x < pts[0].x && p.x >= prev._lay.xd[0] - (pts[1] ? pts[1].x - pts[0].x : 0));
      pts = [...head, ...pts];
    }
  }
  const limit = Math.max(300, Math.round(lay.pw * 1.5));
  if (pts.length > 2000 && pts.length > limit) {
    const key = limit + ':' + a + ':' + b + ':' + s.pts.length;
    if (s._lttbKey !== key) { s._lttbKey = key; s._lttb = chLTTB(pts, limit); }
    return s._lttb;
  }
  return pts;
}

chRegister(CH_CART_TYPES, {
  family: 'cartesian',
  defaultHeight: 300,
  prepare: chCartPrepare,
  render: chCartRender,
  legend: (ch, m) => m.series.map(s => ({ key: s.key, name: s.name, color: s.color, shape: s.type === 'line' ? 'line' : s.type === 'scatter' || s.type === 'bubble' ? 'dot' : 'rect', hidden: s.hidden, dashed: s.dashed })),
  table: chCartTable,
  summary: chCartSummary,
});
