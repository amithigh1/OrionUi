/* ============================================================================
 * Orion charts — radial family: pie, donut (center label), radar, polar area,
 * radial bar, gauge (target + status bands), progress ring.
 * Angles are radians, 0 = 12 o'clock, clockwise. Slices are separated by a
 * 2px surface gap; tracks are a lighter step of the same hue.
 * ========================================================================== */

/** Slices from labels + first series, [{ label, value }], or several one-value series. */
function chSlices(ch) {
  const c = ch.cfg, labels = c.labels ? toArr(c.labels) : [];
  const raw = chRawSeries(c);
  let items;
  if (raw.length === 1 && Array.isArray(raw[0].data)) {
    items = raw[0].data.map((d, i) => ({
      name: String(isObj(d) ? (d.label ?? d.name ?? labels[i] ?? i + 1) : (labels[i] ?? i + 1)),
      value: chNum(isObj(d) ? (d.value ?? d.y) : d), color: isObj(d) ? d.color : c.colors?.[i],
    }));
  } else {
    items = raw.map((s, i) => ({ name: String(s.name ?? labels[i] ?? i + 1), value: chNum(s.value ?? (Array.isArray(s.data) ? s.data[0] : s.data)), color: s.color ?? c.colors?.[i] }));
  }
  items = items.filter(it => it.value != null);
  if (c.fold !== false && items.length > CH_MAX_SLOTS - 1 + 1) {
    items = chFold(items, CH_MAX_SLOTS, tail => ({ name: ch.t('chart.other'), value: tail.reduce((s, x) => s + (x.value || 0), 0), color: 'other', other: tail.map(x => x.name) }));
  }
  return items.map((it, i) => ({ ...it, key: i, color: chColor(it.color, i), hidden: ch.state.hidden.has(i) }));
}
const chSliceLegend = (ch, m) => m.slices.map(s => ({ key: s.key, name: s.name, color: s.color, shape: 'rect', hidden: s.hidden }));
function chSliceTable(ch, m, head) {
  const tot = m.total || 1;
  const rows = m.slices.filter(s => !s.hidden).map(s => [s.name, ch.fmtValue(s.value), fmt.percent(s.value / tot, 1, ch.locale)]);
  const raw = m.slices.filter(s => !s.hidden).map(s => [s.name, s.value, +(s.value / tot).toFixed(4)]);
  return { head: head || [ch.t('chart.category'), ch.t('chart.value'), '%'], rows, raw, numeric: [false, true, true] };
}
function chSliceSummary(ch, m) {
  const vis = m.slices.filter(s => !s.hidden);
  const tot = m.total || 1;
  const top = [...vis].sort((a, b) => b.value - a.value).slice(0, 3).map(s => `${s.name} ${fmt.percent(s.value / tot, 0, ch.locale)}`);
  return `${ch.t('chart.types.' + m.type)}, ${vis.length} ${ch.t('chart.category').toLowerCase()}: ${fmt.list(top, 'conjunction', ch.locale)}. ${ch.t('chart.total')}: ${ch.fmtValue(m.total)}.`;
}
/** Angular interpolation of slices between renders (by key). */
function chSliceAngles(m, prev, t, sweep, a0) {
  const vis = m.slices.filter(s => !s.hidden && s.value > 0);
  const tot = vis.reduce((s, x) => s + x.value, 0) || 1;
  let a = a0;
  const next = new Map();
  for (const s of vis) { const da = (s.value / tot) * sweep; next.set(s.key, [a, a + da]); a += da; }
  if (!prev || t >= 1) return next;
  const out = new Map();
  for (const s of m.slices) {
    const n = next.get(s.key) || null, p = prev.get(s.key) || null;
    if (!n && !p) continue;
    const from = p || (n ? [n[0], n[0]] : null), to = n || [p[1], p[1]];
    out.set(s.key, [lerp(from[0], to[0], t), lerp(from[1], to[1], t)]);
  }
  return out;
}
const chAngleOf = (cx, cy, x, y) => { let a = Math.atan2(x - cx, cy - y); if (a < 0) a += Math.PI * 2; return a; };
const chInArc = (a, a0, a1) => { const TAU = Math.PI * 2; let x = ((a - a0) % TAU + TAU) % TAU; return x <= a1 - a0; };

/* ── pie & donut ───────────────────────────────────────────────────── */
const chPie = {
  family: 'pie',
  defaultHeight: 280,
  prepare(ch) {
    const slices = chSlices(ch);
    const total = slices.filter(s => !s.hidden).reduce((s, x) => s + Math.max(0, x.value), 0);
    return { kind: 'pie', type: ch.cfg.type, slices, total, empty: !slices.length || total <= 0 };
  },
  legend: chSliceLegend,
  table: (ch, m) => chSliceTable(ch, m),
  summary: chSliceSummary,
  render(ch, m, fr) {
    const c = ch.cfg, pc = c.pie || {}, W = ch.W, H = ch.H, fs = ch.fontSize;
    const L = ch.layers(['series', 'labels', 'center', 'hover']);
    const donut = m.type === 'donut' || pc.innerRadius > 0;
    const vis = m.slices.filter(s => !s.hidden && s.value > 0);
    const font = ch.font(500), fontM = ch.font(400);
    const pctOf = s => s.value / (m.total || 1);
    const labelText = s => ({ name: s.name, pct: fmt.percent(pctOf(s), pctOf(s) < 0.1 ? 1 : 0, ch.locale) });
    const outside = pc.labels !== false && pc.labels !== 'inside' && W >= 380 && vis.length <= 8;
    let maxLW = 0;
    if (outside) for (const s of vis) { const lt = labelText(s); maxLW = Math.max(maxLW, Math.min(120, chMeasure(lt.name, font)) + chMeasure(' ' + lt.pct, fontM)); }
    const R = Math.max(20, Math.min(H / 2 - (outside ? fs + 6 : 6), outside ? (W / 2 - maxLW - 34) : W / 2 - 6));
    const r0 = donut ? R * (pc.innerRadius > 0 && pc.innerRadius < 1 ? pc.innerRadius : 0.64) : 0;
    const cx = W / 2, cy = H / 2;
    const a0 = ((pc.startAngle ?? 0) * Math.PI) / 180, sweep = Math.PI * 2;
    const enter = fr.mode === 'enter';
    const target = chSliceAngles(m, null, 1, sweep, a0);
    const ang = enter ? new Map([...target].map(([k, [x, y]]) => [k, [a0 + (x - a0) * fr.t, a0 + (y - a0) * fr.t]])) : chSliceAngles(m, fr.prev?.kind === 'pie' ? fr.prev._ang : null, fr.t, sweep, a0);
    m._ang = target;
    const S = L.series.begin();
    for (const s of m.slices) {
      const aa = ang.get(s.key);
      if (!aa || aa[1] - aa[0] < 1e-4) continue;
      const el = S.next('path', 'o-ch-slice o-ch-mark');
      el.setAttribute('d', chArcPath(cx, cy, r0, R, aa[0], aa[1]));
      el.style.setProperty('--sc', s.color);
      el.dataset.key = s.key;
    }
    S.end();
    // labels: outside with short leaders (sides relaxed), else percent inside when it fits
    const LB = L.labels.begin();
    if (!enter || fr.raw > 0.85) {
      if (outside) {
        const sides = { l: [], r: [] };
        for (const s of vis) {
          const [x0, x1] = target.get(s.key); const mid = (x0 + x1) / 2;
          const [px, py] = chPolar(cx, cy, R + 12, mid);
          (Math.sin(mid) >= 0 ? sides.r : sides.l).push({ s, mid, y: py, ly: py, px });
        }
        for (const side of [sides.l, sides.r]) {
          side.sort((a, b) => a.y - b.y);
          const gap = fs + 4;
          for (let pass = 0; pass < 30; pass++) {
            let moved = false;
            for (let i = 1; i < side.length; i++) { const d = side[i].ly - side[i - 1].ly; if (d < gap) { const p = (gap - d) / 2; side[i - 1].ly -= p; side[i].ly += p; moved = true; } }
            side.forEach(it => { it.ly = clamp(it.ly, fs / 2 + 2, H - fs / 2 - 2); });
            if (!moved) break;
          }
        }
        for (const it of [...sides.l, ...sides.r]) {
          const right = Math.sin(it.mid) >= 0;
          const [sx, sy] = chPolar(cx, cy, R + 3, it.mid);
          const ex = cx + (right ? 1 : -1) * (R + 18);
          const ld = LB.next('path', 'o-ch-leader');
          ld.setAttribute('d', `M${r1(sx)},${r1(sy)}L${r1(it.px)},${r1(it.ly)}L${r1(ex)},${r1(it.ly)}`);
          const lt = labelText(it.s);
          const tx = LB.next('text', 'o-ch-label');
          tx.replaceChildren();
          const t1 = chEl('tspan', null, tx); t1.textContent = chFit(lt.name, 120, font);
          const t2 = chEl('tspan', { class: 'o-ch-caption', dx: 4 }, tx); t2.textContent = lt.pct;
          chAttr(tx, { x: r1(ex + (right ? 4 : -4)), y: r1(it.ly), 'text-anchor': right ? 'start' : 'end', 'dominant-baseline': 'central' });
        }
      } else if (pc.labels !== false) {
        for (const s of vis) {
          const [x0, x1] = target.get(s.key); const mid = (x0 + x1) / 2;
          const rm = donut ? (r0 + R) / 2 : R * 0.64;
          const lt = labelText(s).pct, w = chMeasure(lt, font);
          if ((x1 - x0) * rm < w + 10 || (donut && R - r0 < fs + 6)) continue;
          const [x, y] = chPolar(cx, cy, rm, mid);
          const tx = LB.next('text', 'o-ch-label is-inside ' + chInkClass(ch.resolveColor(s.color)));
          chSetText(tx, lt);
          chAttr(tx, { x: r1(x), y: r1(y), 'text-anchor': 'middle', 'dominant-baseline': 'central' });
        }
      }
    }
    LB.end();
    // donut center (value leads, label follows)
    const CE = L.center.begin();
    const center = s => {
      if (!donut) return;
      const cc = pc.center || {};
      const value = s ? ch.fmtValue(s.value) : cc.value != null ? String(cc.value) : ch.fmtValue(m.total);
      const label = s ? s.name : cc.label ?? ch.t('chart.total');
      const vf = clamp(r0 * 0.42, 14, 34);
      const v = CE.next('text', 'o-ch-value');
      chSetText(v, chFit(value, r0 * 1.6, ch.font(650, vf)));
      chAttr(v, { x: cx, y: r1(cy - (label ? vf * 0.18 : 0)), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': r1(vf) });
      if (label) { const l = CE.next('text', 'o-ch-caption'); chSetText(l, chFit(label, r0 * 1.5, ch.font(400))); chAttr(l, { x: cx, y: r1(cy + vf * 0.62), 'text-anchor': 'middle', 'dominant-baseline': 'central' }); }
    };
    center(null);
    CE.end();
    const findKey = (x, y) => {
      const d = Math.hypot(x - cx, y - cy);
      if (d < r0 - 2 || d > R + 8) return null;
      const a = chAngleOf(cx, cy, x, y);
      for (const s of vis) { const [x0, x1] = target.get(s.key); if (chInArc(a, x0, x1)) return s.key; }
      return null;
    };
    const keys = vis.map(s => s.key);
    return {
      hit: (x, y) => { const k = findKey(x, y); return k == null ? null : { s: k, i: k }; },
      mark: a => {
        ch.svg.querySelectorAll('.o-ch-slice').forEach(el => {
          const k = +el.dataset.key;
          if (a && k === a.s) { const [x0, x1] = target.get(k) || [0, 0]; const mid = (x0 + x1) / 2; el.setAttribute('transform', `translate(${r1(Math.sin(mid) * 5)},${r1(-Math.cos(mid) * 5)})`); }
          else el.removeAttribute('transform');
        });
        L.center.begin(); center(a ? m.slices.find(s => s.key === a.s) : null); L.center.end();
      },
      tip: a => { const s = m.slices.find(x => x.key === a.s); return s && { title: s.name, rows: [{ color: s.color, shape: 'rect', value: ch.fmtValue(s.value), name: fmt.percent(pctOf(s), 1, ch.locale) + (s.other ? ' · ' + s.other.length + '…' : '') }] }; },
      anchor: a => { const [x0, x1] = target.get(a.s) || [0, 0]; const mid = (x0 + x1) / 2; const [x, y] = chPolar(cx, cy, R + 6, mid); return { x, y, place: Math.cos(mid) > 0.3 ? 'top' : Math.cos(mid) < -0.3 ? 'bottom' : Math.sin(mid) > 0 ? 'right' : 'left' }; },
      point: a => { const s = m.slices.find(x => x.key === a.s); return s && { series: s.key, index: s.key, name: s.name, label: s.name, value: s.value, text: `${ch.fmtValue(s.value)} (${fmt.percent(pctOf(s), 1, ch.locale)})` }; },
      first: () => (keys.length ? { s: keys[0], i: keys[0] } : null),
      nav: (a, k) => { const i = keys.indexOf(a.s); const n = k === 'Home' ? 0 : k === 'End' ? keys.length - 1 : clamp(i + (k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1), 0, keys.length - 1); return { s: keys[n], i: keys[n] }; },
    };
  },
};
chRegister(['pie', 'donut'], chPie);

/* ── radar ─────────────────────────────────────────────────────────── */
chRegister('radar', {
  family: 'radar',
  defaultHeight: 320,
  prepare(ch) {
    const c = ch.cfg, labels = c.labels ? toArr(c.labels).map(String) : [];
    const raw = chRawSeries(c).slice(0, CH_MAX_SLOTS);
    const series = raw.map((s, i) => ({ key: i, name: s.name != null ? String(s.name) : ch.t('chart.seriesN', { n: i + 1 }), color: chColor(c.colors?.[i] ?? s.color, i), vals: labels.map((_, j) => chNum(isObj(s.data?.[j]) ? s.data[j].value : s.data?.[j])), hidden: ch.state.hidden.has(i) }));
    const vis = series.filter(s => !s.hidden);
    const ext = chExtent(vis.flatMap(s => s.vals));
    return { kind: 'radar', type: 'radar', labels, series, vis, max: c.radar?.max ?? (ext ? ext[1] : 1), min: c.radar?.min ?? 0, empty: labels.length < 3 || !ext };
  },
  legend: (ch, m) => m.series.map(s => ({ key: s.key, name: s.name, color: s.color, shape: 'rect', hidden: s.hidden })),
  table: (ch, m) => ({ head: [ch.t('chart.category'), ...m.vis.map(s => s.name)], rows: m.labels.map((l, j) => [l, ...m.vis.map(s => ch.fmtValue(s.vals[j]))]), raw: m.labels.map((l, j) => [l, ...m.vis.map(s => s.vals[j] ?? '')]), numeric: [false, ...m.vis.map(() => true)] }),
  summary: (ch, m) => ch.t('chart.summary', { type: ch.t('chart.types.radar'), count: m.vis.length, names: fmt.list(m.vis.map(s => s.name), 'conjunction', ch.locale) }) + ' ' + fmt.list(m.labels, 'conjunction', ch.locale) + '.',
  render(ch, m, fr) {
    const W = ch.W, H = ch.H, fs = ch.fontSize, n = m.labels.length;
    const L = ch.layers(['grid', 'axes', 'series', 'hover']);
    const font = ch.font(400);
    const maxLW = Math.min(120, Math.max(...m.labels.map(l => chMeasure(l, font))));
    const R = Math.max(30, Math.min(H / 2 - fs - 12, W / 2 - maxLW - 14));
    const cx = W / 2, cy = H / 2 + 2;
    const nice = chNice(m.min, m.max, 4, { zero: true });
    const vmax = ch.cfg.radar?.max ?? nice.max;
    const rOf = v => (clamp((v - m.min) / (vmax - m.min || 1), 0, 1.05)) * R;
    const angle = j => (j / n) * Math.PI * 2;
    const G = L.grid.begin(), A = L.axes.begin();
    const circle = ch.cfg.radar?.grid === 'circle';
    for (const tv of nice.ticks) {
      if (tv <= m.min) continue;
      const rr = rOf(tv);
      if (circle) chAttr(G.next('circle', 'o-ch-radar-grid'), { cx, cy, r: r1(rr) });
      else G.next('path', 'o-ch-radar-grid').setAttribute('d', 'M' + m.labels.map((_, j) => chPolar(cx, cy, rr, angle(j)).map(r1).join(',')).join('L') + 'Z');
      const tk = A.next('text', 'o-ch-tick is-halo');
      chSetText(tk, chAxisFormatter(ch.cfg.yAxis.format, { locale: ch.locale }, nice.step, vmax)(tv));
      chAttr(tk, { x: r1(cx + 4), y: r1(cy - rr + fs * 0.85), 'text-anchor': 'start', 'dominant-baseline': null });
    }
    m.labels.forEach((l, j) => {
      const [x, y] = chPolar(cx, cy, R, angle(j));
      chAttr(G.next('line', 'o-ch-spoke'), { x1: cx, y1: cy, x2: r1(x), y2: r1(y) });
      const [lx, ly] = chPolar(cx, cy, R + 10, angle(j));
      const s = Math.sin(angle(j)), co = Math.cos(angle(j));
      const tx = A.next('text', 'o-ch-tick is-major');
      chSetText(tx, chFit(l, maxLW, font));
      chAttr(tx, { x: r1(lx), y: r1(ly + (co < -0.5 ? fs * 0.5 : co > 0.5 ? -2 : 0)), 'text-anchor': Math.abs(s) < 0.2 ? 'middle' : s > 0 ? 'start' : 'end', 'dominant-baseline': Math.abs(co) > 0.5 ? null : 'central' });
    });
    G.end(); A.end();
    const prevM = fr.prev?.kind === 'radar' ? fr.prev : null;
    const S = L.series.begin();
    const pts = new Map();
    for (const s of m.vis) {
      const ps = prevM?.series.find(x => x.key === s.key && !x.hidden);
      const coords = s.vals.map((v, j) => {
        let vv = v ?? m.min;
        if (fr.mode === 'enter') vv = m.min + (vv - m.min) * fr.t;
        else if (ps && fr.t < 1) vv = lerp(ps.vals[j] ?? m.min, vv, fr.t);
        return chPolar(cx, cy, rOf(vv), angle(j));
      });
      pts.set(s.key, coords);
      const el = S.next('path', 'o-ch-radar-area o-ch-mark');
      el.setAttribute('d', 'M' + coords.map(p => p.map(r1).join(',')).join('L') + 'Z');
      el.style.setProperty('--sc', s.color); el.dataset.key = s.key;
    }
    S.end();
    const keys = m.vis.map(s => s.key);
    return {
      hit: (x, y) => {
        const d = Math.hypot(x - cx, y - cy);
        if (d > R + 24) return null;
        const a = chAngleOf(cx, cy, x, y);
        const j = Math.round(a / (Math.PI * 2 / n)) % n;
        let best = keys[0], bd = Infinity;
        for (const k of keys) { const p = pts.get(k)[j]; const dd = Math.hypot(p[0] - x, p[1] - y); if (dd < bd) { bd = dd; best = k; } }
        return { i: j, s: best };
      },
      mark: a => {
        const HV = L.hover.begin();
        if (a) {
          const [x, y] = chPolar(cx, cy, R, angle(a.i));
          chAttr(HV.next('line', 'o-ch-cross'), { x1: cx, y1: cy, x2: r1(x), y2: r1(y) });
          for (const s of m.vis) { const p = pts.get(s.key)[a.i]; const d = HV.next('circle', 'o-ch-dot is-active' + (s.key === a.s ? ' is-focus' : '')); chAttr(d, { cx: r1(p[0]), cy: r1(p[1]), r: 4.5 }); d.style.setProperty('--sc', s.color); }
        }
        HV.end();
      },
      tip: a => ({ title: m.labels[a.i], rows: m.vis.map(s => ({ color: s.color, shape: 'rect', value: ch.fmtValue(s.vals[a.i]), name: s.name })) }),
      anchor: a => { const p = pts.get(a.s)?.[a.i] || [cx, cy]; return { x: p[0], y: p[1] - 6, place: 'top' }; },
      point: a => { const s = m.series.find(x => x.key === a.s); return s && { series: s.key, name: s.name, index: a.i, label: m.labels[a.i], value: s.vals[a.i], text: ch.fmtValue(s.vals[a.i]) }; },
      first: () => (keys.length ? { i: 0, s: keys[0] } : null),
      nav: (a, k) => {
        if (k === 'ArrowUp' || k === 'ArrowDown') { const i = keys.indexOf(a.s); return { ...a, s: keys[(i + (k === 'ArrowUp' ? -1 : 1) + keys.length) % keys.length] }; }
        const i = k === 'Home' ? 0 : k === 'End' ? n - 1 : (a.i + (k === 'ArrowRight' ? 1 : -1) + n) % n;
        return { ...a, i };
      },
    };
  },
});

/* ── polar area (area-true: radius ∝ √value) ───────────────────────── */
chRegister('polar', {
  family: 'polar',
  defaultHeight: 300,
  prepare(ch) {
    const slices = chSlices(ch);
    const vis = slices.filter(s => !s.hidden);
    const ext = chExtent(vis.map(s => s.value));
    return { kind: 'polar', type: 'polar', slices, total: vis.reduce((s, x) => s + Math.max(0, x.value), 0), max: ext ? ext[1] : 1, empty: !vis.length };
  },
  legend: chSliceLegend,
  table: (ch, m) => chSliceTable(ch, m),
  summary: chSliceSummary,
  render(ch, m, fr) {
    const W = ch.W, H = ch.H, fs = ch.fontSize;
    const L = ch.layers(['grid', 'series', 'axes', 'hover']);
    const vis = m.slices.filter(s => !s.hidden);
    const n = vis.length;
    const R = Math.max(30, Math.min(W, H) / 2 - fs - 8);
    const cx = W / 2, cy = H / 2;
    const nice = chNice(0, m.max, 3, { zero: true });
    const rOf = v => Math.sqrt(Math.max(0, v) / (nice.max || 1)) * R;
    const G = L.grid.begin(), A = L.axes.begin();
    for (const tv of nice.ticks) { if (tv <= 0) continue; chAttr(G.next('circle', 'o-ch-radar-grid'), { cx, cy, r: r1(rOf(tv)) }); const tk = A.next('text', 'o-ch-tick is-halo'); chSetText(tk, chAxisFormatter(ch.cfg.yAxis.format, { locale: ch.locale }, nice.step, nice.max)(tv)); chAttr(tk, { x: r1(cx + 3), y: r1(cy - rOf(tv) - 3), 'text-anchor': 'start' }); }
    G.end(); A.end();
    const prevM = fr.prev?.kind === 'polar' ? fr.prev : null;
    const S = L.series.begin();
    const da = (Math.PI * 2) / Math.max(1, n);
    const geo = new Map();
    vis.forEach((s, j) => {
      const ps = prevM?.slices.find(x => x.key === s.key);
      let v = s.value;
      if (fr.mode === 'enter') v *= easeOut(clamp((fr.raw - 0.3 * j / n) / 0.7, 0, 1));
      else if (ps && fr.t < 1) v = lerp(ps.value, v, fr.t);
      const a0 = j * da, a1 = a0 + da, rr = rOf(v);
      geo.set(s.key, { a0, a1, r: rOf(s.value) });
      const el = S.next('path', 'o-ch-slice o-ch-mark');
      el.setAttribute('d', chArcPath(cx, cy, 0, rr, a0, a1));
      el.style.setProperty('--sc', s.color); el.dataset.key = s.key;
    });
    S.end();
    const keys = vis.map(s => s.key);
    return {
      hit: (x, y) => { const d = Math.hypot(x - cx, y - cy); if (d > R + 6) return null; const a = chAngleOf(cx, cy, x, y); const j = Math.floor(a / da) % n; return keys[j] != null ? { s: keys[j], i: keys[j] } : null; },
      mark: a => { ch.svg.querySelectorAll('.o-ch-slice').forEach(el => el.classList.toggle('is-active', !!a && +el.dataset.key === a.s)); const HV = L.hover.begin(); if (a) { const g = geo.get(a.s); const el = HV.next('path', 'o-ch-region-hl'); el.setAttribute('d', chArcPath(cx, cy, 0, g.r, g.a0, g.a1)); } HV.end(); },
      tip: a => { const s = m.slices.find(x => x.key === a.s); return s && { title: s.name, rows: [{ color: s.color, shape: 'rect', value: ch.fmtValue(s.value), name: fmt.percent(s.value / (m.total || 1), 1, ch.locale) }] }; },
      anchor: a => { const g = geo.get(a.s); const mid = (g.a0 + g.a1) / 2; const [x, y] = chPolar(cx, cy, Math.max(g.r, 20), mid); return { x, y, place: 'top' }; },
      point: a => { const s = m.slices.find(x => x.key === a.s); return s && { series: s.key, index: s.key, name: s.name, label: s.name, value: s.value, text: ch.fmtValue(s.value) }; },
      first: () => (keys.length ? { s: keys[0], i: keys[0] } : null),
      nav: (a, k) => { const i = keys.indexOf(a.s); const j = k === 'Home' ? 0 : k === 'End' ? keys.length - 1 : (i + (k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1) + keys.length) % keys.length; return { s: keys[j], i: keys[j] }; },
    };
  },
});

/* ── radial bar (concentric rings, 270° sweep, labels in the open quadrant) ── */
chRegister('radialBar', {
  family: 'radialBar',
  defaultHeight: 280,
  prepare(ch) {
    const slices = chSlices(ch).slice(0, CH_MAX_SLOTS);
    const vis = slices.filter(s => !s.hidden);
    const ext = chExtent(vis.map(s => s.value));
    return { kind: 'radialBar', type: 'radialBar', slices, max: ch.cfg.radialBar?.max ?? (ext && ext[1] <= 100 ? 100 : ext ? chNice(0, ext[1], 4).max : 100), empty: !vis.length };
  },
  legend: chSliceLegend,
  table: (ch, m) => ({ head: [ch.t('chart.category'), ch.t('chart.value')], rows: m.slices.filter(s => !s.hidden).map(s => [s.name, ch.fmtValue(s.value)]), raw: m.slices.filter(s => !s.hidden).map(s => [s.name, s.value]), numeric: [false, true] }),
  summary: chSliceSummary,
  render(ch, m, fr) {
    const W = ch.W, H = ch.H, fs = ch.fontSize;
    const L = ch.layers(['series', 'labels', 'hover']);
    const vis = m.slices.filter(s => !s.hidden);
    const n = vis.length;
    const R = Math.max(30, Math.min(H / 2 - 4, W / 2 - 4));
    const cx = W / 2, cy = H / 2;
    const inner = R * (ch.cfg.radialBar?.innerRadius ?? 0.3);
    const ringGap = 4, band = (R - inner) / Math.max(1, n);
    const thick = clamp(band - ringGap, 3, 22);
    const sweep = ((ch.cfg.radialBar?.arc ?? 270) * Math.PI) / 180;
    const prevM = fr.prev?.kind === 'radialBar' ? fr.prev : null;
    const S = L.series.begin(), LB = L.labels.begin();
    const geo = new Map();
    const font = ch.font(500);
    vis.forEach((s, j) => {
      const r = R - band * j - band / 2;
      const ps = prevM?.slices.find(x => x.key === s.key);
      let v = clamp(s.value, 0, m.max);
      if (fr.mode === 'enter') v *= easeOut(clamp((fr.raw - 0.25 * j / n) / 0.75, 0, 1));
      else if (ps && fr.t < 1) v = lerp(clamp(ps.value, 0, m.max), v, fr.t);
      geo.set(s.key, { r, j });
      const tr = S.next('path', 'o-ch-track o-ch-mark');
      tr.setAttribute('d', chArcStroke(cx, cy, r, 0, sweep));
      chAttr(tr, { 'stroke-width': r1(thick) }); tr.style.setProperty('--sc', s.color); tr.dataset.key = s.key;
      const el = S.next('path', 'o-ch-arc o-ch-mark');
      el.setAttribute('d', chArcStroke(cx, cy, r, 0, Math.max(0.0001, (v / m.max) * sweep)));
      chAttr(el, { 'stroke-width': r1(thick) }); el.style.setProperty('--sc', s.color); el.dataset.key = s.key;
      // label at the arc start, in the open quadrant
      const tx = LB.next('text', 'o-ch-label');
      tx.replaceChildren();
      const t1 = chEl('tspan', null, tx); t1.textContent = chFit(s.name, Math.max(40, cx - thick - 60), font);
      const t2 = chEl('tspan', { class: 'o-ch-caption', dx: 6 }, tx); t2.textContent = ch.fmtValue(s.value);
      chAttr(tx, { x: r1(cx - thick / 2 - 8), y: r1(cy - r), 'text-anchor': 'end', 'dominant-baseline': 'central' });
    });
    S.end(); LB.end();
    const keys = vis.map(s => s.key);
    return {
      hit: (x, y) => { const d = Math.hypot(x - cx, y - cy); if (d < inner - 4 || d > R + 4) return null; const j = Math.floor((R - d) / band); const k = keys[clamp(j, 0, n - 1)]; return k == null ? null : { s: k, i: k }; },
      mark: a => { ch.svg.querySelectorAll('.o-ch-arc').forEach(el => el.classList.toggle('is-active', !!a && +el.dataset.key === a.s)); },
      tip: a => { const s = m.slices.find(x => x.key === a.s); return s && { title: s.name, rows: [{ color: s.color, shape: 'rect', value: ch.fmtValue(s.value), name: fmt.percent(s.value / (m.max || 1), 0, ch.locale) + ' ' + ch.t('common.of') + ' ' + ch.fmtValue(m.max) }] }; },
      anchor: a => { const g = geo.get(a.s); const s = m.slices.find(x => x.key === a.s); const [x, y] = chPolar(cx, cy, g.r, (clamp(s.value, 0, m.max) / m.max) * sweep); return { x, y, place: 'top' }; },
      point: a => { const s = m.slices.find(x => x.key === a.s); return s && { series: s.key, index: s.key, name: s.name, label: s.name, value: s.value, text: ch.fmtValue(s.value) }; },
      first: () => (keys.length ? { s: keys[0], i: keys[0] } : null),
      nav: (a, k) => { const i = keys.indexOf(a.s); const j = k === 'Home' ? 0 : k === 'End' ? keys.length - 1 : clamp(i + (k === 'ArrowDown' || k === 'ArrowRight' ? 1 : -1), 0, keys.length - 1); return { s: keys[j], i: keys[j] }; },
    };
  },
});

/* ── gauge & progress ring ─────────────────────────────────────────── */
const CH_STATUS_ICON = {
  good: 'M8 12.5l2.5 2.5L16 9.5',
  warning: 'M12 8v4.5M12 16h.01',
  serious: 'M12 8v4.5M12 16h.01',
  critical: 'M9 9l6 6M15 9l-6 6',
};
function chGaugeModel(ch, key) {
  const c = ch.cfg, g = c[key] || {};
  const raw = chRawSeries(c);
  const first = raw[0];
  const value = chNum(g.value ?? first?.value ?? (Array.isArray(first?.data) ? first.data[0] : first?.data));
  const min = chNum(g.min) ?? 0, max = chNum(g.max) ?? 100;
  return {
    kind: key, type: key, value, min, max: max > min ? max : min + 1, target: chNum(g.target),
    bands: toArr(g.bands).map(b => ({ from: chNum(b.from) ?? min, to: chNum(b.to) ?? max, status: b.status, color: b.status ? `var(--o-status-${b.status})` : chColor(b.color), label: b.label })),
    label: g.label ?? first?.name ?? '', color: chColor(g.color ?? first?.color, 0), empty: value == null,
  };
}
function chGaugeTable(ch, m) {
  const head = [ch.t('chart.category'), ch.t('chart.value'), ch.t('chart.min'), ch.t('chart.max')].concat(m.target != null ? [ch.t('chart.target')] : []);
  const row = [m.label || ch.t('chart.value'), ch.fmtValue(m.value), ch.fmtValue(m.min), ch.fmtValue(m.max)].concat(m.target != null ? [ch.fmtValue(m.target)] : []);
  return { head, rows: [row], raw: [[m.label, m.value, m.min, m.max].concat(m.target != null ? [m.target] : [])], numeric: head.map((_, j) => j > 0) };
}
const chGaugeBand = m => m.bands.find(b => m.value >= b.from && m.value <= b.to) || null;
function chGaugeSummary(ch, m) {
  const b = chGaugeBand(m);
  return `${m.label ? m.label + ': ' : ''}${ch.fmtValue(m.value)} (${ch.fmtValue(m.min)}–${ch.fmtValue(m.max)})` + (m.target != null ? `, ${ch.t('chart.target')} ${ch.fmtValue(m.target)}` : '') + (b?.label ? `, ${b.label}` : '') + '.';
}
function chGaugeView(ch, m, anchorPt, extraRows = []) {
  const b = chGaugeBand(m);
  return {
    hit: () => ({ s: 0, i: 0 }),
    tip: () => ({ title: m.label || '', rows: [{ color: b?.status ? b.color : m.color, shape: 'rect', value: ch.fmtValue(m.value), name: b?.label || ch.t('chart.value') }, ...extraRows] }),
    anchor: () => ({ ...anchorPt, place: 'top' }),
    point: () => ({ series: 0, index: 0, name: m.label, label: m.label, value: m.value, text: ch.fmtValue(m.value) + (b?.label ? ', ' + b.label : '') }),
    first: () => ({ s: 0, i: 0 }),
    nav: () => ({ s: 0, i: 0 }),
  };
}
chRegister('gauge', {
  family: 'gauge',
  toolbar: false,
  prepare: ch => chGaugeModel(ch, 'gauge'),
  autoHeight: (ch, m, w) => clamp(Math.round(w * 0.62), 150, 300),
  legend: () => null,
  table: chGaugeTable,
  summary: chGaugeSummary,
  render(ch, m, fr) {
    const W = ch.W, H = ch.H, fs = ch.fontSize, gc = ch.cfg.gauge || {};
    const L = ch.layers(['series', 'labels', 'hover']);
    const sweep = (clamp(gc.arc ?? 240, 90, 300) * Math.PI) / 180, a0 = -sweep / 2, a1 = sweep / 2;
    const below = Math.max(0, -Math.cos(sweep / 2)); // arc extent below the centre (× R)
    const fTick = ch.font(400), fCap = ch.font(500);
    const band0 = chGaugeBand(m);
    const sev0 = gc.severity !== false && m.bands.some(b => b.status);
    const capText = gc.needle ? null : sev0 && band0?.label ? band0.label : m.target != null ? `${ch.t('chart.target')} ${ch.fmtValue(m.target)}` : null;
    const minT = gc.minMax !== false ? ch.fmtValue(m.min) : '', maxT = gc.minMax !== false ? ch.fmtValue(m.max) : '';
    // rows under the arc: min/max at the arc ends; the caption joins that row when it fits between them
    const geomFor = rows => {
      const R0 = Math.max(24, Math.min(W / 2 - 8 - Math.max(chMeasure(minT, fTick), chMeasure(maxT, fTick)) / 2 * (below < 0.2 ? 1 : 0), (H - 10 - rows * (fs + 8)) / (1 + below)));
      const th = clamp(R0 * 0.15, 8, 22);
      return { R: R0, thick: th, cy: 6 + R0, rr: R0 - th / 2 };
    };
    const capW = capText ? chMeasure(capText, fCap) + (sev0 && band0?.label ? 18 : 0) : 0;
    let G = geomFor(1 + (gc.needle ? 1 : 0));
    const endHalf = Math.sin(sweep / 2) * G.rr;
    const twoRows = capText && (capW / 2 + 10 > endHalf - Math.max(chMeasure(minT, fTick), chMeasure(maxT, fTick)) / 2);
    if (twoRows) G = geomFor(2);
    const { R, thick, rr } = G, cx = W / 2, cy = G.cy;
    const row1 = cy + rr * below + thick / 2 + fs * 0.5 + 6, row2 = row1 + fs + 8;
    const span = m.max - m.min;
    const ang = v => a0 + (clamp(v, m.min, m.max) - m.min) / span * sweep;
    const prevM = fr.prev?.kind === 'gauge' ? fr.prev : null;
    let v = m.value;
    if (fr.mode === 'enter') v = m.min + (v - m.min) * fr.t; else if (prevM && fr.t < 1) v = lerp(prevM.value, v, fr.t);
    const band = chGaugeBand(m);
    const severity = gc.severity !== false && m.bands.some(b => b.status);
    const valueColor = severity && band ? band.color : m.color;
    const S = L.series.begin();
    // track: tinted band segments (lighter steps), or one neutral track
    if (m.bands.length) {
      for (const b of m.bands) {
        const el = S.next('path', 'o-ch-track o-ch-band-arc');
        el.setAttribute('d', chArcStroke(cx, cy, rr, ang(b.from) + 0.004, ang(b.to) - 0.004));
        chAttr(el, { 'stroke-width': r1(thick) });
        el.style.setProperty('--c', b.color);
      }
    } else {
      const tr = S.next('path', 'o-ch-track');
      tr.setAttribute('d', chArcStroke(cx, cy, rr, a0, a1));
      chAttr(tr, { 'stroke-width': r1(thick) }); tr.style.setProperty('--c', m.color);
    }
    const arc = S.next('path', 'o-ch-arc o-ch-mark' + (m.bands.length ? ' is-butt' : ''));
    arc.setAttribute('d', chArcStroke(cx, cy, rr, a0, Math.max(a0 + 0.0001, ang(v))));
    chAttr(arc, { 'stroke-width': r1(thick) });
    arc.style.setProperty('--sc', valueColor); arc.dataset.key = 0;
    if (m.target != null) {
      const at = ang(m.target);
      const [x1, y1] = chPolar(cx, cy, R + 4, at), [x2, y2] = chPolar(cx, cy, R - thick - 4, at);
      chAttr(S.next('line', 'o-ch-target'), { x1: r1(x1), y1: r1(y1), x2: r1(x2), y2: r1(y2) });
    }
    if (gc.needle) {
      const an = ang(v), [tx, ty] = chPolar(cx, cy, rr - thick * 0.2, an), [lx, ly] = chPolar(cx, cy, 5, an - Math.PI / 2), [qx, qy] = chPolar(cx, cy, 5, an + Math.PI / 2);
      S.next('path', 'o-ch-needle').setAttribute('d', `M${r1(lx)},${r1(ly)}L${r1(tx)},${r1(ty)}L${r1(qx)},${r1(qy)}Z`);
      chAttr(S.next('circle', 'o-ch-needle'), { cx, cy, r: 6 });
    }
    S.end();
    const LB = L.labels.begin();
    const valText = isFn(gc.format) ? String(gc.format(v)) : ch.fmtValue(Math.round(v * 100) / 100);
    if (!gc.needle) {
      // centre figure: shrinks to fit inside the ring
      let vf = clamp(rr * 0.42, 14, 40);
      const maxW = (rr - thick / 2) * (below > 0.2 ? 1.5 : 1.7);
      const w0 = chMeasure(valText, ch.font(650, vf));
      if (w0 > maxW) vf = Math.max(12, vf * maxW / w0);
      const semi = below < 0.2;
      const vy = semi ? cy - vf * 0.6 - (m.label ? fs * 0.9 : 0) : cy - (m.label ? vf * 0.12 : 0);
      const val = LB.next('text', 'o-ch-value');
      chSetText(val, valText);
      chAttr(val, { x: cx, y: r1(vy), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': r1(vf) });
      if (m.label) { const l = LB.next('text', 'o-ch-caption'); chSetText(l, chFit(m.label, rr * 1.5, fTick)); chAttr(l, { x: cx, y: r1(vy + vf * 0.55 + fs * 0.75), 'text-anchor': 'middle', 'dominant-baseline': 'central' }); }
    } else {
      // needle: figure + caption under the hub
      const t = LB.next('text', 'o-ch-label');
      t.replaceChildren();
      const t1 = chEl('tspan', { class: 'o-ch-value', 'font-size': r1(fs * 1.35) }, t); t1.textContent = valText;
      if (m.label) { const t2 = chEl('tspan', { class: 'o-ch-caption', dx: 6 }, t); t2.textContent = m.label; }
      chAttr(t, { x: cx, y: r1(Math.max(cy + 18, row1) + (below < 0.2 ? fs + 8 : 0)), 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    }
    // caption row: status (icon + label — never color alone) or target
    if (capText) {
      const sy = twoRows ? row2 : row1;
      if (severity && band?.label) {
        const ic = LB.next('circle', 'o-ch-status-dot');
        chAttr(ic, { cx: r1(cx - capW / 2 + 6), cy: r1(sy), r: 6 });
        ic.style.fill = band.color;
        const t = LB.next('text', 'o-ch-status');
        chSetText(t, band.label);
        chAttr(t, { x: r1(cx - capW / 2 + 17), y: r1(sy), 'text-anchor': 'start', 'dominant-baseline': 'central' });
      } else {
        const t = LB.next('text', 'o-ch-caption');
        chSetText(t, capText);
        chAttr(t, { x: cx, y: r1(sy), 'text-anchor': 'middle', 'dominant-baseline': 'central' });
      }
    }
    if (gc.minMax !== false) {
      const [x0] = chPolar(cx, cy, rr, a0), [x1] = chPolar(cx, cy, rr, a1);
      const mn = LB.next('text', 'o-ch-tick'); chSetText(mn, minT); chAttr(mn, { x: r1(Math.max(x0, chMeasure(minT, fTick) / 2 + 2)), y: r1(row1), 'text-anchor': 'middle', 'dominant-baseline': 'central' });
      const mx = LB.next('text', 'o-ch-tick'); chSetText(mx, maxT); chAttr(mx, { x: r1(Math.min(x1, W - chMeasure(maxT, fTick) / 2 - 2)), y: r1(row1), 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    }
    LB.end();
    const [ax, ay] = chPolar(cx, cy, R, ang(m.value));
    return chGaugeView(ch, m, { x: ax, y: ay - 4 }, m.target != null ? [{ shape: 'none', value: ch.fmtValue(m.target), name: ch.t('chart.target'), strong: false }] : []);
  },
});
chRegister('progress', {
  family: 'progress',
  toolbar: false,
  prepare: ch => { const m = chGaugeModel(ch, 'progress'); if (ch.cfg.progress?.max == null && m.max === 100 && m.value != null && m.value <= 1 && ch.cfg.yAxis.format === 'percent') m.max = 1; return m; },
  autoHeight: (ch, m, w) => clamp(Math.round(Math.min(w, 200)), 96, 220),
  legend: () => null,
  table: chGaugeTable,
  summary: chGaugeSummary,
  render(ch, m, fr) {
    const W = ch.W, H = ch.H, pc = ch.cfg.progress || {};
    const L = ch.layers(['series', 'labels']);
    const R = Math.max(16, Math.min(W, H) / 2 - 2);
    const thick = clamp(pc.thickness ?? R * 0.16, 4, 20);
    const cx = W / 2, cy = H / 2, rr = R - thick / 2;
    const prevM = fr.prev?.kind === 'progress' ? fr.prev : null;
    let v = m.value;
    if (fr.mode === 'enter') v = m.min + (v - m.min) * fr.t; else if (prevM && fr.t < 1) v = lerp(prevM.value, v, fr.t);
    const ratio = clamp((v - m.min) / (m.max - m.min), 0, 1);
    const band = chGaugeBand(m);
    const col = band && pc.severity !== false ? band.color : m.color;
    const S = L.series.begin();
    const tr = S.next('path', 'o-ch-track');
    tr.setAttribute('d', chArcStroke(cx, cy, rr, 0, Math.PI * 2));
    chAttr(tr, { 'stroke-width': r1(thick) }); tr.style.setProperty('--c', col);
    const arc = S.next('path', 'o-ch-arc o-ch-mark');
    arc.setAttribute('d', ratio > 0 ? chArcStroke(cx, cy, rr, 0, Math.max(0.0001, ratio * Math.PI * 2)) : '');
    chAttr(arc, { 'stroke-width': r1(thick) }); arc.style.setProperty('--sc', col); arc.dataset.key = 0;
    S.end();
    const LB = L.labels.begin();
    const vf = clamp(rr * 0.5, 12, 36);
    const val = LB.next('text', 'o-ch-value');
    chSetText(val, isFn(pc.format) ? pc.format(v) : fmt.percent(ratio, 0, ch.locale));
    chAttr(val, { x: cx, y: r1(cy - (m.label ? vf * 0.16 : 0)), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': r1(vf) });
    if (m.label && rr > 34) { const l = LB.next('text', 'o-ch-caption'); chSetText(l, chFit(m.label, rr * 1.5, ch.font(400))); chAttr(l, { x: cx, y: r1(cy + vf * 0.66), 'text-anchor': 'middle', 'dominant-baseline': 'central' }); }
    LB.end();
    const [ax, ay] = chPolar(cx, cy, R, ratio * Math.PI * 2);
    return chGaugeView(ch, m, { x: ax, y: ay });
  },
});
