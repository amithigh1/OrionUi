/* ============================================================================
 * Orion charts — cartesian hover layer & keyboard:
 *   line/area/mixed/candles -> crosshair snapped to the nearest X + one tooltip for every series
 *   bars/boxes              -> the mark (whole band slot) is the hit target, per-mark tooltip
 *   scatter/bubble          -> nearest point within 24px
 * Plus brush zoom (zoom: { x: true }), table view and the aria summary.
 * ========================================================================== */

function chCartView(ch, m, lay, geo, L) {
  const c = ch.cfg, fs = ch.fontSize;
  const hor = lay.horizontal;
  const shared = c.tooltip?.shared;
  const onlyScatter = m.scatterish;
  const mode = onlyScatter ? 'near' : (m.hasLines || m.vis.some(s => s.type === 'candlestick' || s.type === 'ohlc') || shared === true) && !hor ? 'cross' : 'bar';
  const cat = m.xKind === 'category';
  const primary = m.vis.find(s => (s.type === 'line' || s.type === 'area' || s.type === 'candlestick' || s.type === 'ohlc') && s.pts.length) || m.vis.find(s => s.pts.length);
  const inPlot = (x, y, pad = 6) => x >= lay.x0 - pad && x <= lay.x1 + pad && y >= lay.y0 - pad - 4 && y <= lay.y1 + pad;
  const pointAt = (s, a) => {
    if (cat) return s.byX?.[a.i] || null;
    if (s === primary) return s.pts[a.i] || null;
    const j = chBisect(s.pts, a.x, p => p.x);
    return j >= 0 ? s.pts[j] : null;
  };
  const xPx = a => (cat ? lay.c.center(a.i) : lay.c(a.x));
  const labelOf = a => {
    if (cat) return m.labelsText[a.i] ?? '';
    if (m.xKind === 'time') return chTimeFull(a.x, m.gran, ch.locale);
    return chFormatter(c.xAxis.format, { locale: ch.locale })(a.x);
  };
  const val = (s, p) => (p == null ? null : s.type === 'candlestick' || s.type === 'ohlc' ? p.c : s.type === 'boxplot' ? p.median : p.y);
  const yPx = (s, p) => (p ? lay.v(!s.stackId.startsWith('solo:') ? p.y1 : val(s, p)) : null);
  const fmtV = v => ch.fmtValue(v);
  const rowsFor = (s, p) => {
    if (!p) return [];
    if (s.type === 'candlestick' || s.type === 'ohlc') {
      const ch1 = p.o ? (p.c - p.o) / p.o : 0;
      return [
        { color: s.color, shape: 'none', value: fmtV(p.o), name: ch.t('chart.open') },
        { shape: 'none', value: fmtV(p.h), name: ch.t('chart.high') },
        { shape: 'none', value: fmtV(p.l), name: ch.t('chart.low') },
        { shape: 'none', value: fmtV(p.c), name: ch.t('chart.close') },
        { shape: 'none', value: (ch1 >= 0 ? '+' : '') + fmt.percent(ch1, 2, ch.locale), name: ch.t('chart.change') },
      ];
    }
    if (s.type === 'boxplot') {
      return [['max', p.max], ['q3', p.q3], ['median', p.median], ['q1', p.q1], ['min', p.min]].map(([k, v], j) => ({ color: s.color, shape: j === 2 ? 'line' : 'none', value: fmtV(v), name: (m.vis.filter(x => x.type === 'boxplot').length > 1 && j === 2 ? s.name + ' · ' : '') + ch.t('chart.' + k) }))
        .concat(p.outliers?.length ? [{ shape: 'none', value: String(p.outliers.length), name: ch.t('chart.outliers') }] : []);
    }
    const pct = m.stackMode === 'percent' && !s.stackId.startsWith('solo:') && p.share != null ? ' · ' + fmt.percent(p.share, 0, ch.locale) : '';
    return [{ color: p.color || s.color, shape: s.type === 'line' ? 'line' : s.type === 'scatter' || s.type === 'bubble' ? 'dot' : 'rect', value: fmtV(p.y) + pct, name: s.name, dashed: s.dashed }];
  };
  const stackFoot = (list, a) => {
    if (!m.stackMode || m.stackMode === 'percent') return null;
    const segs = list.filter(s => !s.stackId.startsWith('solo:'));
    if (segs.length < 2) return null;
    let tot = 0; for (const s of segs) tot += pointAt(s, a)?.y || 0;
    return ch.t('chart.total') + ': ' + fmtV(tot);
  };
  const V = { mode, lay };

  /* ── hit testing ─────────────────────────────────────────────────── */
  V.hit = (x, y) => {
    if (!inPlot(x, y, mode === 'near' ? 24 : 6)) return null;
    if (mode === 'near') {
      let best = null, bd = Infinity;
      for (const d of geo.dots) {
        for (let j = 0; j < d.sx.length; j++) {
          const dx = d.sx[j] - x, dy = d.sy[j] - y, dist = Math.hypot(dx, dy) - (d.sr[j] > 6 ? d.sr[j] : 0);
          if (dist < bd) { bd = dist; best = { s: d.s.key, i: d.s.pts.indexOf(d.sp[j]), j }; }
        }
      }
      return bd <= 24 ? best : null;
    }
    if (mode === 'cross') {
      let a;
      if (cat) a = { i: lay.c.invert(x) };
      else {
        if (!primary?.pts.length) return null;
        const dx = lay.c.invert(x), j = chBisect(primary.pts, dx, p => p.x);
        a = { i: j, x: primary.pts[j].x };
      }
      let bs = null, bd = Infinity;
      for (const s of m.vis) {
        const p = pointAt(s, a), py = yPx(s, p);
        if (py == null) continue;
        const d = Math.abs(py - y);
        if (d < bd) { bd = d; bs = s.key; }
      }
      if (bs == null) return null;
      a.s = bs; a.py = y;
      return a;
    }
    // bar mode: band slot is the target; stacked -> the segment under the pointer
    const along = hor ? y : x, across = hor ? x : y;
    let cand = geo.bars.filter(b => (hor ? along >= b.y0 - 2 && along <= b.y1 + 2 : along >= b.x0 - 2 && along <= b.x1 + 2));
    if (!cand.length) {
      const i = lay.c.invert(along);
      cand = geo.bars.filter(b => b.p.x === i);
      if (!cand.length) return null;
      let best = cand[0], bd = Infinity;
      for (const b of cand) { const mid = hor ? (b.y0 + b.y1) / 2 : (b.x0 + b.x1) / 2; const d = Math.abs(mid - along); if (d < bd) { bd = d; best = b; } }
      cand = [best];
    }
    let pick = cand.find(b => (hor ? across >= b.x0 && across <= b.x1 : across >= b.y0 && across <= b.y1));
    if (!pick) { let bd = Infinity; for (const b of cand) { const d = Math.min(Math.abs(across - (hor ? b.x0 : b.y0)), Math.abs(across - (hor ? b.x1 : b.y1))); if (d < bd) { bd = d; pick = b; } } }
    return pick ? { s: pick.s.key, i: pick.p.x, py: y } : null;
  };

  /* ── hover marks ─────────────────────────────────────────────────── */
  V.mark = a => {
    const HV = L.hover.begin(), HL = L.hl.begin();
    ch.svg.querySelectorAll('.o-ch-bar.is-active').forEach(el => el.classList.remove('is-active'));
    if (a) {
      if (mode === 'near') {
        const d = geo.dots.find(q => q.s.key === a.s);
        const j = d ? d.sp.indexOf(d.s.pts[a.i]) : -1;
        if (j >= 0) {
          const ring = HV.next('circle', 'o-ch-focus-ring');
          chAttr(ring, { cx: r1(d.sx[j]), cy: r1(d.sy[j]), r: r1(Math.max(d.sr[j], 4) + 3) });
          ring.style.setProperty('--sc', d.s.color);
        }
      } else if (mode === 'cross') {
        const px = xPx(a);
        if (cat && lay.c.kind === 'band') chAttr(HL.next('rect', 'o-ch-hl-band'), { x: r1(lay.c(a.i) - (lay.c.step - lay.c.bw) / 2), y: lay.y0, width: r1(lay.c.step), height: lay.ph });
        chAttr(HV.next('line', 'o-ch-cross'), { x1: crisp(px), x2: crisp(px), y1: lay.y0, y2: lay.y1 });
        for (const s of m.vis) {
          if (s.type !== 'line' && s.type !== 'area') continue;
          const p = pointAt(s, a), py = yPx(s, p);
          if (py == null || !Number.isFinite(py)) continue;
          const dot = HV.next('circle', 'o-ch-dot is-active' + (s.key === a.s ? ' is-focus' : ''));
          chAttr(dot, { cx: r1(cat ? px : lay.c(p.x)), cy: r1(py), r: 4.5 });
          dot.style.setProperty('--sc', s.color);
        }
      } else {
        if (lay.c.kind === 'band') {
          const b0 = lay.c(a.i) - (lay.c.step - lay.c.bw) / 2;
          chAttr(HL.next('rect', 'o-ch-hl-band'), hor ? { x: lay.x0, y: r1(b0), width: lay.pw, height: r1(lay.c.step) } : { x: r1(b0), y: lay.y0, width: r1(lay.c.step), height: lay.ph });
        }
        ch.svg.querySelectorAll(`.o-ch-bar[data-key="${a.s}"][data-i="${a.i}"]`).forEach(el => el.classList.add('is-active'));
      }
    }
    HV.end(); HL.end();
  };

  /* ── tooltip ─────────────────────────────────────────────────────── */
  V.tip = a => {
    const s0 = m.series.find(s => s.key === a.s);
    if (mode === 'near') {
      const p = s0?.pts[a.i];
      if (!p) return null;
      const fx = m.xKind === 'time' ? chTimeFull(p.x, m.gran, ch.locale) : chFormatter(c.xAxis.format, { locale: ch.locale })(p.x);
      const rows = [
        { color: p.color || s0.color, shape: 'dot', value: fmtV(p.y), name: c.yAxis.title || ch.t('chart.y') },
        { shape: 'none', value: fx, name: c.xAxis.title || ch.t('chart.x'), strong: false },
      ];
      if (s0.type === 'bubble') rows.push({ shape: 'none', value: chFormatter(c.sizeFormat, { locale: ch.locale })(p.z), name: c.sizeLabel || ch.t('chart.size'), strong: false });
      return { title: p.label != null ? String(p.label) : m.vis.length > 1 ? s0.name : '', rows };
    }
    if (mode === 'cross') {
      const rows = [];
      for (const s of m.vis) { const p = pointAt(s, a); if (p && val(s, p) != null) rows.push(...rowsFor(s, p)); }
      return { title: labelOf(a), rows, foot: stackFoot(m.vis, a) };
    }
    // bar mode
    if (!s0) return null;
    const stackPeers = !s0.stackId.startsWith('solo:') ? m.vis.filter(s => s.stackId === s0.stackId) : null;
    const list = shared === true ? m.vis : stackPeers || [s0];
    const rows = [];
    for (const s of list) { const r = rowsFor(s, pointAt(s, a)); if (s.key === a.s && list.length > 1) r.forEach(x => (x.active = true)); rows.push(...r); }
    return { title: labelOf(a), rows, foot: stackFoot(list, a) };
  };
  V.anchor = (a, ptr) => {
    if (mode === 'near') {
      const d = geo.dots.find(q => q.s.key === a.s); const j = d ? d.sp.indexOf(d.s.pts[a.i]) : -1;
      return j >= 0 ? { x: d.sx[j], y: d.sy[j] - Math.max(4, d.sr[j]) - 2, place: 'top' } : { x: 0, y: 0 };
    }
    if (mode === 'cross') {
      const s = m.series.find(q => q.key === a.s);
      const py = ptr ? ptr.y : yPx(s, pointAt(s, a)) ?? (lay.y0 + lay.y1) / 2;
      return { x: xPx(a), y: clamp(py, lay.y0, lay.y1), place: 'right' };
    }
    const b = geo.bars.find(q => q.s.key === a.s && q.p.x === a.i);
    if (!b) return { x: lay.c.center(a.i), y: lay.y0, place: 'top' };
    const pos = (b.p.y ?? 0) >= 0;
    if (hor) return { x: pos ? b.x1 : b.x0, y: (b.y0 + b.y1) / 2, place: pos ? 'right' : 'left' };
    return { x: (b.x0 + b.x1) / 2, y: pos ? b.y0 : b.y1, place: pos ? 'top' : 'bottom' };
  };
  V.point = a => {
    const s = m.series.find(q => q.key === a.s);
    if (!s) return null;
    const p = mode === 'near' ? s.pts[a.i] : pointAt(s, a);
    if (!p) return null;
    const label = mode === 'near' ? (m.xKind === 'time' ? chTimeFull(p.x, m.gran, ch.locale) : String(p.x)) : labelOf(mode === 'cross' && !cat ? { i: a.i, x: p.x } : a);
    const value = val(s, p);
    return { series: s.key, name: s.name, index: mode === 'near' ? a.i : cat ? a.i : s.pts.indexOf(p), value, label, x: p.x, text: fmtV(value) };
  };

  /* ── keyboard ────────────────────────────────────────────────────── */
  const keys = m.vis.filter(s => s.pts.length).map(s => s.key);
  V.first = () => {
    if (!keys.length) return null;
    if (mode === 'near') { const s = m.series.find(q => q.key === keys[0]); const ord = chXOrder(s); return { s: s.key, i: ord[0] }; }
    if (cat) return { s: keys[0], i: m.view.lo };
    const j = Math.max(0, primary.pts.findIndex(p => p.x >= lay.c.domain[0]));
    return { s: primary.key, i: j, x: primary.pts[j].x };
  };
  V.nav = (a, k) => {
    const ki = keys.indexOf(a.s);
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      const nk = keys[(ki + (k === 'ArrowUp' ? -1 : 1) + keys.length) % keys.length];
      if (mode === 'near') { const s = m.series.find(q => q.key === nk); const cur = m.series.find(q => q.key === a.s)?.pts[a.i]; const j = cur ? chBisect(chXSorted(s), cur.x, p => p.x) : 0; return { s: nk, i: s.pts.indexOf(chXSorted(s)[j]) }; }
      return { ...a, s: nk };
    }
    const step = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : k === 'PageDown' ? 10 : k === 'PageUp' ? -10 : 0;
    if (mode === 'near') {
      const s = m.series.find(q => q.key === a.s), ord = chXOrder(s), pos = ord.indexOf(a.i);
      const np = k === 'Home' ? 0 : k === 'End' ? ord.length - 1 : clamp(pos + step, 0, ord.length - 1);
      return { s: a.s, i: ord[np] };
    }
    if (cat) {
      const lo = m.view.lo, hi = m.view.hi;
      const i = k === 'Home' ? lo : k === 'End' ? hi : clamp(a.i + step, lo, hi);
      return { ...a, i };
    }
    const pts = primary.pts;
    const [d0, d1] = lay.c.domain;
    let lo = pts.findIndex(p => p.x >= d0); if (lo < 0) lo = 0;
    let hi = pts.length - 1; while (hi > 0 && pts[hi].x > d1) hi--;
    const i = k === 'Home' ? lo : k === 'End' ? hi : clamp(a.i + step, lo, hi);
    return { ...a, i, x: pts[i].x };
  };

  /* ── brush zoom ──────────────────────────────────────────────────── */
  if (c.zoom?.x && !hor) {
    ch.els.plot.classList.add('is-zoomable');
    V.dragStart = (p, e) => (inPlot(p.x, p.y, 0) && (e.pointerType !== 'touch' || e.isPrimary) ? { x0: clamp(p.x, lay.x0, lay.x1) } : null);
    V.dragMove = (d, p) => {
      const x = clamp(p.x, lay.x0, lay.x1);
      d.moved = d.moved || Math.abs(x - d.x0) > 4;
      if (!d.moved) return;
      d.x1 = x;
      const HV = L.hover.begin();
      chAttr(HV.next('rect', 'o-ch-brush'), { x: r1(Math.min(d.x0, x)), y: lay.y0, width: r1(Math.abs(x - d.x0)), height: lay.ph });
      HV.end();
    };
    V.dragEnd = d => {
      L.hover.clear();
      if (!d.moved || d.x1 == null || Math.abs(d.x1 - d.x0) < 8) return;
      const a = Math.min(d.x0, d.x1), b = Math.max(d.x0, d.x1);
      if (cat) {
        const i0 = lay.c.invert(a), i1 = lay.c.invert(b);
        if (i1 - i0 < 1) return;
        ch.zoom(i0, i1);
      } else ch.zoom(lay.c.invert(a), lay.c.invert(b));
    };
  } else ch.els.plot.classList.remove('is-zoomable');
  V.zoomed = () => !!ch.state.zoom;
  return V;
}
const chXSorted = s => s._xs || (s._xs = [...s.pts].filter(p => p.y != null).sort((a, b) => a.x - b.x || a.y - b.y));
const chXOrder = s => s._xo || (s._xo = chXSorted(s).map(p => s.pts.indexOf(p)));

/* ── table view ───────────────────────────────────────────────────── */
function chCartTable(ch, m) {
  const c = ch.cfg, vis = m.vis;
  const fv = v => ch.fmtValue(v);
  const xTitle = c.xAxis.title || (m.xKind === 'time' ? ch.t('chart.date') : ch.t('chart.category'));
  if (m.scatterish) {
    const bubble = vis.some(s => s.type === 'bubble');
    const head = [ch.t('chart.series'), c.xAxis.title || ch.t('chart.x'), c.yAxis.title || ch.t('chart.y')].concat(bubble ? [c.sizeLabel || ch.t('chart.size')] : []);
    const rows = [], raw = [];
    const fx = chFormatter(c.xAxis.format, { locale: ch.locale });
    for (const s of vis) for (const p of s.pts) {
      rows.push([p.label != null ? `${s.name} · ${p.label}` : s.name, m.xKind === 'time' ? chTimeFull(p.x, m.gran, ch.locale) : fx(p.x), fv(p.y)].concat(bubble ? [String(p.z ?? '')] : []));
      raw.push([s.name, m.xKind === 'time' ? new Date(p.x) : p.x, p.y].concat(bubble ? [p.z] : []));
    }
    return { head, rows, raw, numeric: head.map((_, j) => j > 0) };
  }
  const fin = vis.find(s => s.type === 'candlestick' || s.type === 'ohlc');
  if (fin) {
    const head = [xTitle, ch.t('chart.open'), ch.t('chart.high'), ch.t('chart.low'), ch.t('chart.close')];
    const rows = fin.pts.map(p => [m.labelsText[p.x], fv(p.o), fv(p.h), fv(p.l), fv(p.c)]);
    const raw = fin.pts.map(p => [m.labels[p.x], p.o, p.h, p.l, p.c]);
    return { head, rows, raw, numeric: [false, true, true, true, true] };
  }
  const box = vis.filter(s => s.type === 'boxplot');
  if (box.length) {
    const head = [xTitle, ch.t('chart.series'), ch.t('chart.min'), ch.t('chart.q1'), ch.t('chart.median'), ch.t('chart.q3'), ch.t('chart.max')];
    const rows = [], raw = [];
    for (const s of box) for (const p of s.pts) { rows.push([m.labelsText[p.x], s.name, fv(p.min), fv(p.q1), fv(p.median), fv(p.q3), fv(p.max)]); raw.push([m.labels[p.x], s.name, p.min, p.q1, p.median, p.q3, p.max]); }
    return { head, rows, raw, numeric: head.map((_, j) => j > 1) };
  }
  if (m.xKind === 'category') {
    const head = [xTitle, ...vis.map(s => s.name)];
    const rows = [], raw = [];
    for (let i = 0; i < m.n; i++) {
      rows.push([m.labelsText[i], ...vis.map(s => { const p = s.byX[i]; return p?.y == null ? '' : fv(p.y) + (m.stackMode === 'percent' && p.share != null ? ' (' + fmt.percent(p.share, 0, ch.locale) + ')' : ''); })]);
      raw.push([m.labels[i], ...vis.map(s => s.byX[i]?.y ?? '')]);
    }
    return { head, rows, raw, numeric: head.map((_, j) => j > 0) };
  }
  // numeric x: wide table when x values align, else long format
  const xsKey = s => s.pts.map(p => p.x).join(',');
  const aligned = vis.every(s => xsKey(s) === xsKey(vis[0]));
  const fx = x => (m.xKind === 'time' ? chTimeFull(x, m.gran, ch.locale) : chFormatter(c.xAxis.format, { locale: ch.locale })(x));
  const rx = x => (m.xKind === 'time' ? new Date(x) : x);
  if (aligned && vis.length) {
    const head = [xTitle, ...vis.map(s => s.name)];
    const rows = vis[0].pts.map((p, j) => [fx(p.x), ...vis.map(s => fv(s.pts[j]?.y))]);
    const raw = vis[0].pts.map((p, j) => [rx(p.x), ...vis.map(s => s.pts[j]?.y ?? '')]);
    return { head, rows, raw, numeric: head.map((_, j) => j > 0) };
  }
  const head = [ch.t('chart.series'), xTitle, c.yAxis.title || ch.t('chart.value')];
  const rows = [], raw = [];
  for (const s of vis) for (const p of s.pts) { rows.push([s.name, fx(p.x), fv(p.y)]); raw.push([s.name, rx(p.x), p.y]); }
  return { head, rows, raw, numeric: [false, false, true] };
}

function chCartSummary(ch, m) {
  const typeName = ch.t('chart.types.' + (m.stackMode && m.type === 'column' ? 'column' : m.type));
  const vis = m.vis;
  const names = vis.map(s => s.name);
  const head = vis.length === 1 ? ch.t('chart.summaryOne', { type: typeName, name: names[0] }) : ch.t('chart.summary', { type: typeName, count: vis.length, names: fmt.list(names, 'conjunction', ch.locale) });
  const parts = [head];
  if (m.xKind === 'category' && m.labelsText.length) parts.push(`${m.labelsText[0]} – ${m.labelsText[m.labelsText.length - 1]}.`);
  else if (m.xKind === 'time' && m.xExt) parts.push(`${chTimeFull(m.xExt[0], m.gran, ch.locale)} – ${chTimeFull(m.xExt[1], m.gran, ch.locale)}.`);
  for (const s of vis.slice(0, 6)) {
    const vals = s.pts.map(p => (s.type === 'candlestick' || s.type === 'ohlc' ? p.c : s.type === 'boxplot' ? p.median : p.y)).filter(v => v != null);
    const ext = chExtent(vals);
    if (ext) parts.push(ch.t('chart.range', { name: s.name, min: ch.fmtValue(ext[0]), max: ch.fmtValue(ext[1]) }));
  }
  return parts.join(' ');
}
