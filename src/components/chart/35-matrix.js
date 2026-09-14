/* ============================================================================
 * Orion charts — matrix family: heatmap (sequential or diverging steps),
 * calendar heatmap (GitHub-style), treemap (squarified) and funnel (ordinal ramp).
 * Cells carry their own tooltip; steps are CSS classes so dark mode flips the
 * ramp anchor without re-rendering.
 * ========================================================================== */

/** Class for a value: sequential o-ch-q1..7 or diverging o-ch-d1..7 (0 = missing). */
function chHeatClass(v, lo, hi, bins, diverging, mid = 0) {
  if (v == null || !Number.isFinite(v)) return 'o-ch-q0';
  if (diverging) {
    const span = Math.max(Math.abs(lo - mid), Math.abs(hi - mid)) || 1;
    const k = clamp(Math.round(((v - mid) / span) * 3), -3, 3);
    return 'o-ch-d' + (4 + k);
  }
  return 'o-ch-q' + chHeatStep(chBin(v, lo, hi, bins), bins);
}
function chHeatLegend(ch, m) {
  const fmtV = v => chAxisFormatter(ch.cfg.yAxis.format, { locale: ch.locale, currency: ch.cfg.yAxis.currency }, (m.hi - m.lo) / 10 || 1, Math.max(Math.abs(m.lo), Math.abs(m.hi)))(v);
  const classes = m.diverging ? [1, 2, 3, 4, 5, 6, 7].map(i => 'o-ch-d' + i) : Array.from({ length: m.bins }, (_, i) => 'o-ch-q' + chHeatStep(i + 1, m.bins));
  return { scale: { classes, lead: fmtV(m.lo), trail: fmtV(m.hi), missing: m.hasMissing ? ch.t('chart.noData') : null } };
}

/* ── heatmap ───────────────────────────────────────────────────────── */
chRegister('heatmap', {
  family: 'heatmap',
  prepare(ch) {
    const c = ch.cfg, hc = c.heatmap || {};
    let xl = c.labels ? toArr(c.labels) : null, yl = [], grid = [];
    const raw = chRawSeries(c);
    const flat = raw.length === 1 && Array.isArray(raw[0].data) && raw[0].data.length && isObj(raw[0].data[0]) && 'y' in raw[0].data[0] && 'x' in raw[0].data[0] && !('name' in raw[0]);
    if (flat) {
      const xs = new Map(), ys = new Map();
      for (const d of raw[0].data) { if (!xs.has(String(d.x))) xs.set(String(d.x), d.x); if (!ys.has(String(d.y))) ys.set(String(d.y), d.y); }
      xl = xl || [...xs.values()]; yl = hc.yLabels || [...ys.values()];
      grid = yl.map(() => xl.map(() => null));
      for (const d of raw[0].data) { const i = xl.findIndex(x => String(x) === String(d.x)), j = yl.findIndex(y => String(y) === String(d.y)); if (i >= 0 && j >= 0) grid[j][i] = chNum(d.v ?? d.value); }
    } else {
      yl = raw.map((s, j) => s.name ?? j + 1);
      grid = raw.map(s => (s.data || []).map(v => chNum(isObj(v) ? v.value : v)));
      const n = Math.max(0, ...grid.map(r => r.length));
      xl = xl || Array.from({ length: n }, (_, i) => i + 1);
    }
    const all = grid.flat().filter(v => v != null);
    const ext = chExtent(all) || [0, 1];
    const diverging = hc.scale === 'diverging' || hc.diverging === true;
    const lo = hc.min ?? (diverging ? Math.min(ext[0], -Math.abs(ext[1])) : Math.min(0, ext[0])), hi = hc.max ?? ext[1];
    return { kind: 'heatmap', type: 'heatmap', xl: xl.map(String), yl: yl.map(String), grid, lo, hi, bins: clamp(hc.bins ?? 7, 3, 7), diverging, mid: hc.mid ?? 0, hasMissing: grid.some(r => r.some(v => v == null)) || grid.some(r => r.length < xl.length), empty: !all.length };
  },
  autoHeight: (ch, m, w) => clamp(m.yl.length * clamp((w - 90) / Math.max(1, m.xl.length), 16, 34) + ch.fontSize * 2 + 16, 120, 640),
  legend: chHeatLegend,
  table: (ch, m) => ({ head: ['', ...m.xl], rows: m.yl.map((y, j) => [y, ...m.xl.map((_, i) => ch.fmtValue(m.grid[j]?.[i]))]), raw: m.yl.map((y, j) => [y, ...m.xl.map((_, i) => m.grid[j]?.[i] ?? '')]), numeric: [false, ...m.xl.map(() => true)] }),
  summary: (ch, m) => `${ch.t('chart.types.heatmap')}: ${m.yl.length} × ${m.xl.length}. ${ch.t('chart.range', { name: ch.t('chart.value'), min: ch.fmtValue(m.lo), max: ch.fmtValue(m.hi) })}`,
  render(ch, m, fr) {
    const W = ch.W, H = ch.H, fs = ch.fontSize, c = ch.cfg;
    const L = ch.layers(['cells', 'labels', 'axes', 'hover']);
    const font = ch.font(400);
    const yW = Math.min(W * 0.3, Math.max(0, ...m.yl.map(s => chMeasure(s, font))));
    const x0 = yW + 10, x1 = W - 2, y0 = 2;
    const nx = m.xl.length, ny = m.yl.length;
    const xLabW = Math.max(0, ...m.xl.map(s => chMeasure(s, font)));
    const cw = (x1 - x0) / nx;
    const every = Math.max(1, Math.ceil((xLabW + 8) / cw));
    const y1 = H - fs - 10;
    const chh = (y1 - y0) / ny;
    const gap = cw > 8 && chh > 8 ? 2 : 1;
    const A = L.axes.begin();
    m.yl.forEach((l, j) => { const t = A.next('text', 'o-ch-tick'); chSetText(t, chFit(l, yW, font)); chAttr(t, { x: r1(x0 - 8), y: r1(y0 + chh * (j + 0.5)), 'text-anchor': 'end', 'dominant-baseline': 'central' }); });
    m.xl.forEach((l, i) => { if (i % every) return; const t = A.next('text', 'o-ch-tick'); chSetText(t, l); chAttr(t, { x: r1(x0 + cw * (i + 0.5)), y: r1(y1 + fs + 4), 'text-anchor': 'middle', 'dominant-baseline': null }); });
    A.end();
    const C = L.cells.begin(), LB = L.labels.begin();
    const labels = c.dataLabels === true || (c.dataLabels === 'auto' && cw >= 34 && chh >= fs + 8);
    const lf = ch.font(500, fs - 1);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v = m.grid[j]?.[i];
        const el = C.next('path', 'o-ch-cell ' + chHeatClass(v, m.lo, m.hi, m.bins, m.diverging, m.mid));
        const te = fr.mode === 'enter' ? easeOut(clamp((fr.raw - 0.4 * ((i + j) / (nx + ny))) / 0.6, 0, 1)) : 1;
        const w = cw - gap, hh = chh - gap;
        el.setAttribute('d', chRectPath(x0 + cw * i + gap / 2 + (w * (1 - te)) / 2, y0 + chh * j + gap / 2 + (hh * (1 - te)) / 2, w * te, hh * te, Math.min(3, w / 4)));
        el.dataset.i = i; el.dataset.j = j;
        if (labels && v != null && te === 1) {
          const tx = ch.fmtValue(v);
          if (chMeasure(tx, lf) + 6 > w) continue;
          const cls = el.getAttribute('class').split(' ').pop();
          const t = LB.next('text', 'o-ch-cell-label ' + chInkClass(ch.resolveColor(`var(--o-ch-${cls.slice(5)})`)));
          chSetText(t, tx);
          chAttr(t, { x: r1(x0 + cw * (i + 0.5)), y: r1(y0 + chh * (j + 0.5)), 'text-anchor': 'middle', 'dominant-baseline': 'central' });
        }
      }
    }
    C.end(); LB.end();
    return {
      hit: (x, y) => { if (x < x0 || x > x1 || y < y0 || y > y1) return null; const i = Math.floor((x - x0) / cw), j = Math.floor((y - y0) / chh); return i >= 0 && j >= 0 && i < nx && j < ny ? { s: j, i } : null; },
      mark: a => { ch.svg.querySelectorAll('.o-ch-cell.is-active').forEach(el => el.classList.remove('is-active')); if (a) L.cells.g.querySelector(`[data-i="${a.i}"][data-j="${a.s}"]`)?.classList.add('is-active'); },
      tip: a => { const v = m.grid[a.s]?.[a.i]; return { title: `${m.yl[a.s]} · ${m.xl[a.i]}`, rows: [{ shape: 'none', value: v == null ? ch.t('chart.noData') : ch.fmtValue(v), name: c.yAxis.title || '' }] }; },
      anchor: a => ({ x: x0 + cw * (a.i + 0.5), y: y0 + chh * a.s, place: 'top' }),
      point: a => ({ series: a.s, index: a.i, name: m.yl[a.s], label: m.xl[a.i], value: m.grid[a.s]?.[a.i] ?? null, text: ch.fmtValue(m.grid[a.s]?.[a.i]) }),
      first: () => ({ s: 0, i: 0 }),
      nav: (a, k) => ({ s: clamp(a.s + (k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : 0), 0, ny - 1), i: k === 'Home' ? 0 : k === 'End' ? nx - 1 : clamp(a.i + (k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0), 0, nx - 1) }),
    };
  },
});

/* ── calendar heatmap ──────────────────────────────────────────────── */
chRegister('calendar', {
  family: 'calendar',
  prepare(ch) {
    const c = ch.cfg, cc = c.calendar || {};
    const raw = chRawSeries(c)[0];
    const labels = c.labels ? toArr(c.labels) : null;
    const map = new Map();
    (raw?.data || []).forEach((d, i) => {
      const t0 = chTime(isObj(d) ? (d.date ?? d.x) : Array.isArray(d) ? d[0] : labels?.[i]);
      const v = chNum(isObj(d) ? (d.value ?? d.y ?? d.v) : Array.isArray(d) ? d[1] : d);
      if (t0 == null) return;
      const k = date.toISODate(t0);
      map.set(k, (map.get(k) || 0) + (v ?? 0));
    });
    const keys = [...map.keys()].sort();
    const end = date.startOf(cc.to ? chTime(cc.to) : keys.length ? date.parse(keys[keys.length - 1]) : new Date(), 'd');
    const start = date.startOf(cc.from ? chTime(cc.from) : date.add(end, -364, 'd'), 'd');
    const vals = [...map.entries()].filter(([k]) => k >= date.toISODate(start) && k <= date.toISODate(end)).map(([, v]) => v).filter(v => v > 0);
    const hi = cc.max ?? (vals.length ? Math.max(...vals) : 1);
    return { kind: 'calendar', type: 'calendar', map, start, end, hi, lo: 0, levels: clamp(cc.levels ?? 4, 2, 6), weekStart: cc.weekStart ?? date.weekStart(ch.locale), empty: false };
  },
  autoHeight: (ch, m, w) => {
    const weeks = Math.ceil((date.diff(m.end, m.start, 'd') + 8) / 7);
    const cell = clamp((w - 40) / weeks, 8, 18);
    return Math.round(cell * 7 + ch.fontSize + 12);
  },
  legend: (ch, m) => ({ scale: { classes: ['o-ch-q0', ...chCalLevels(m.levels)], lead: ch.t('chart.less'), trail: ch.t('chart.more') } }),
  table: (ch, m) => {
    const rows = [], raw = [];
    for (let d = new Date(m.start); +d <= +m.end; d = date.add(d, 1, 'd')) { const k = date.toISODate(d); if (!m.map.has(k)) continue; rows.push([fmt.date(d, 'medium', ch.locale), ch.fmtValue(m.map.get(k))]); raw.push([k, m.map.get(k)]); }
    return { head: [ch.t('chart.date'), ch.t('chart.value')], rows, raw, numeric: [false, true] };
  },
  summary: (ch, m) => { let tot = 0, days = 0; m.map.forEach(v => { tot += v; if (v > 0) days++; }); return `${ch.t('chart.types.calendar')}: ${fmt.date(m.start, 'medium', ch.locale)} – ${fmt.date(m.end, 'medium', ch.locale)}. ${ch.t('chart.total')}: ${ch.fmtValue(tot)}, ${days} ${ch.t('chart.date').toLowerCase()}s.`; },
  render(ch, m, fr) {
    const W = ch.W, H = ch.H, fs = ch.fontSize, loc = ch.locale;
    const L = ch.layers(['cells', 'axes', 'hover']);
    const ws = m.weekStart;
    const first = date.add(m.start, -((m.start.getDay() - ws + 7) % 7), 'd');
    const weeks = Math.ceil((date.diff(m.end, first, 'd') + 1) / 7);
    const font = ch.font(400);
    const names = date.weekdayNames('short', loc, ws);
    const dayW = Math.max(...[1, 3, 5].map(i => chMeasure(names[i], font)));
    const x0 = dayW + 8, y0 = fs + 8;
    const cell = Math.max(4, Math.min((W - x0 - 2) / weeks, (H - y0 - 2) / 7));
    const gap = cell >= 9 ? 2 : 1;
    const A = L.axes.begin();
    [1, 3, 5].forEach(i => { const t = A.next('text', 'o-ch-tick'); chSetText(t, names[i]); chAttr(t, { x: r1(x0 - 6), y: r1(y0 + cell * (i + 0.5)), 'text-anchor': 'end', 'dominant-baseline': 'central' }); });
    let lastM = -1, lastX = -99;
    for (let w = 0; w < weeks; w++) {
      const d = date.add(first, w * 7, 'd');
      const md = [0, 1, 2, 3, 4, 5, 6].map(k => date.add(d, k, 'd')).find(x => x.getDate() === 1 && +x >= +m.start) || (w === 0 ? m.start : null);
      if (md && md.getMonth() !== lastM) {
        const x = x0 + w * cell;
        const label = fmt.date(md, { month: 'short' }, loc);
        if (x - lastX >= chMeasure(label, font) + 8 && x + chMeasure(label, font) <= W) { const t = A.next('text', 'o-ch-tick'); chSetText(t, label); chAttr(t, { x: r1(x), y: fs, 'text-anchor': 'start', 'dominant-baseline': null }); lastX = x; }
        lastM = md.getMonth();
      }
    }
    A.end();
    const C = L.cells.begin();
    const cellsIdx = [];
    const lv = chCalLevels(m.levels);
    for (let w = 0; w < weeks; w++) {
      for (let k = 0; k < 7; k++) {
        const d = date.add(first, w * 7 + k, 'd');
        if (+d < +m.start || +d > +m.end) continue;
        const key = date.toISODate(d), v = m.map.get(key) || 0;
        const lvl = v > 0 ? lv[clamp(Math.ceil((v / (m.hi || 1)) * m.levels), 1, m.levels) - 1] : 'o-ch-q0';
        const el = C.next('path', 'o-ch-cell ' + lvl);
        const te = fr.mode === 'enter' ? clamp((fr.raw - 0.5 * (w / weeks)) / 0.5, 0, 1) : 1;
        const s = (cell - gap) * te;
        el.setAttribute('d', chRectPath(x0 + w * cell + (cell - s) / 2, y0 + k * cell + (cell - s) / 2, s, s, Math.min(2.5, s / 4)));
        el.dataset.i = cellsIdx.length;
        cellsIdx.push({ d, key, v, w, k });
      }
    }
    C.end();
    const findAt = (w, k) => cellsIdx.findIndex(c => c.w === w && c.k === k);
    return {
      hit: (x, y) => { const w = Math.floor((x - x0) / cell), k = Math.floor((y - y0) / cell); if (w < 0 || k < 0 || k > 6 || w >= weeks) return null; const i = findAt(w, k); return i < 0 ? null : { s: 0, i }; },
      mark: a => { ch.svg.querySelectorAll('.o-ch-cell.is-active').forEach(el => el.classList.remove('is-active')); if (a) L.cells.g.querySelector(`[data-i="${a.i}"]`)?.classList.add('is-active'); },
      tip: a => { const c0 = cellsIdx[a.i]; return c0 && { title: fmt.date(c0.d, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }, loc), rows: [{ shape: 'none', value: ch.fmtValue(c0.v), name: ch.cfg.yAxis.title || '' }] }; },
      anchor: a => { const c0 = cellsIdx[a.i]; return { x: x0 + c0.w * cell + cell / 2, y: y0 + c0.k * cell, place: 'top' }; },
      point: a => { const c0 = cellsIdx[a.i]; return c0 && { series: 0, index: a.i, name: '', label: fmt.date(c0.d, 'medium', loc), value: c0.v, text: ch.fmtValue(c0.v), date: c0.d }; },
      first: () => (cellsIdx.length ? { s: 0, i: cellsIdx.length - 1 } : null),
      nav: (a, k) => { const c0 = cellsIdx[a.i]; if (!c0) return a; const dw = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0, dk = k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : 0; if (k === 'Home') return { s: 0, i: 0 }; if (k === 'End') return { s: 0, i: cellsIdx.length - 1 }; const i = findAt(c0.w + dw, c0.k + dk); return i < 0 ? a : { s: 0, i }; },
    };
  },
});
const chCalLevels = n => (n === 4 ? ['o-ch-q2', 'o-ch-q4', 'o-ch-q5', 'o-ch-q7'] : Array.from({ length: n }, (_, i) => 'o-ch-q' + chHeatStep(i + 1, n)));

/* ── treemap (squarified; groups take categorical slots, children share the hue) ── */
function chSquarify(items, x, y, w, hgt) {
  const out = [];
  const total = items.reduce((s, it) => s + it.value, 0);
  if (!total || w <= 0 || hgt <= 0) return out;
  const scale = (w * hgt) / total;
  const rest = items.map(it => ({ it, area: it.value * scale })).filter(r => r.area > 0);
  let rx = x, ry = y, rw = w, rh = hgt;
  const worst = (row, len) => { const s = row.reduce((a, r) => a + r.area, 0); let mx = 0, mn = Infinity; for (const r of row) { mx = Math.max(mx, r.area); mn = Math.min(mn, r.area); } return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn)); };
  while (rest.length) {
    const len = Math.min(rw, rh);
    const row = [rest.shift()];
    while (rest.length && worst([...row, rest[0]], len) <= worst(row, len)) row.push(rest.shift());
    const s = row.reduce((a, r) => a + r.area, 0);
    if (rw >= rh) {
      const cw = s / rh; let yy = ry;
      for (const r of row) { const hh = r.area / cw; out.push({ it: r.it, x: rx, y: yy, w: cw, h: hh }); yy += hh; }
      rx += cw; rw -= cw;
    } else {
      const chh = s / rw; let xx = rx;
      for (const r of row) { const ww = r.area / chh; out.push({ it: r.it, x: xx, y: ry, w: ww, h: chh }); xx += ww; }
      ry += chh; rh -= chh;
    }
  }
  return out;
}
chRegister('treemap', {
  family: 'treemap',
  defaultHeight: 320,
  prepare(ch) {
    const c = ch.cfg;
    const raw = chRawSeries(c);
    let nodes;
    if (raw.length === 1 && Array.isArray(raw[0].data) && raw[0].data.some(d => isObj(d))) nodes = raw[0].data;
    else if (raw.length && raw.every(s => Array.isArray(s.data) && s.data.some(d => isObj(d)))) nodes = raw.map(s => ({ name: s.name, color: s.color, children: s.data }));
    else { const labels = c.labels ? toArr(c.labels) : []; nodes = (raw[0]?.data || []).map((v, i) => ({ name: labels[i] ?? i + 1, value: v })); }
    const sumOf = n => (Array.isArray(n.children) && n.children.length ? n.children.reduce((s, x) => s + sumOf(x), 0) : Math.max(0, chNum(n.value ?? n.y) || 0));
    let groups = nodes.map(n => ({ name: String(n.name ?? n.label ?? ''), value: sumOf(n), color: n.color, children: Array.isArray(n.children) ? n.children.map(k => ({ name: String(k.name ?? k.label ?? ''), value: sumOf(k) })).filter(k => k.value > 0).sort((a, b) => b.value - a.value) : null })).filter(g => g.value > 0);
    const nested = groups.some(g => g.children?.length);
    groups.sort((a, b) => b.value - a.value);
    if (c.fold !== false && groups.length > CH_MAX_SLOTS && nested) groups = chFold(groups, CH_MAX_SLOTS, tail => ({ name: ch.t('chart.other'), value: tail.reduce((s, x) => s + x.value, 0), color: 'other', children: tail.map(g => ({ name: g.name, value: g.value })) }));
    groups = groups.map((g, i) => ({ ...g, key: i, color: nested ? chColor(g.color, i) : chColor(g.color ?? c.color ?? 1, 0), hidden: nested && ch.state.hidden.has(i) }));
    const total = groups.filter(g => !g.hidden).reduce((s, g) => s + g.value, 0);
    return { kind: 'treemap', type: 'treemap', groups, nested, total, empty: !total };
  },
  legend: (ch, m) => (m.nested ? m.groups.map(g => ({ key: g.key, name: g.name, color: g.color, shape: 'rect', hidden: g.hidden })) : null),
  table: (ch, m) => {
    const rows = [], raw = [];
    for (const g of m.groups) { if (g.hidden) continue; if (g.children) for (const k of g.children) { rows.push([g.name, k.name, ch.fmtValue(k.value), fmt.percent(k.value / (m.total || 1), 1, ch.locale)]); raw.push([g.name, k.name, k.value]); } else { rows.push([g.name, '', ch.fmtValue(g.value), fmt.percent(g.value / (m.total || 1), 1, ch.locale)]); raw.push([g.name, '', g.value]); } }
    return { head: [ch.t('chart.category'), '', ch.t('chart.value'), '%'], rows, raw, numeric: [false, false, true, true] };
  },
  summary: (ch, m) => `${ch.t('chart.types.treemap')}: ${fmt.list(m.groups.filter(g => !g.hidden).slice(0, 4).map(g => `${g.name} ${fmt.percent(g.value / (m.total || 1), 0, ch.locale)}`), 'conjunction', ch.locale)}. ${ch.t('chart.total')}: ${ch.fmtValue(m.total)}.`,
  render(ch, m, fr) {
    const W = ch.W, H = ch.H, fs = ch.fontSize;
    const L = ch.layers(['cells', 'labels', 'hover']);
    const vis = m.groups.filter(g => !g.hidden);
    const tiles = [];
    const outer = chSquarify(vis, 0, 0, W, H);
    for (const o of outer) {
      if (o.it.children?.length) {
        const pad = o.w > 60 && o.h > 44 ? { t: fs + 10, s: 2 } : { t: 0, s: 0 };
        const inner = chSquarify(o.it.children, o.x + pad.s, o.y + pad.t, o.w - pad.s * 2, o.h - pad.t - pad.s);
        tiles.push({ g: o.it, head: true, x: o.x, y: o.y, w: o.w, h: o.h, padT: pad.t });
        for (const r of inner) tiles.push({ g: o.it, it: r.it, x: r.x, y: r.y, w: r.w, h: r.h });
      } else tiles.push({ g: o.it, it: o.it, x: o.x, y: o.y, w: o.w, h: o.h });
    }
    const prevT = fr.prev?.kind === 'treemap' ? fr.prev._tiles : null;
    const keyOf = tl => tl.g.name + '›' + (tl.head ? '' : tl.it.name);
    const pmap = prevT ? new Map(prevT.map(tl => [keyOf(tl), tl])) : null;
    m._tiles = tiles;
    const C = L.cells.begin(), LB = L.labels.begin();
    const fName = ch.font(600), fVal = ch.font(400);
    const hit = [];
    tiles.forEach((tl, n) => {
      let { x, y, w, h: hh } = tl;
      const pv = pmap?.get(keyOf(tl));
      if (fr.mode === 'enter') { const te = easeOut(clamp((fr.raw - 0.3 * (n / tiles.length)) / 0.7, 0, 1)); x += (w * (1 - te)) / 2; y += (hh * (1 - te)) / 2; w *= te; hh *= te; }
      else if (pv && fr.t < 1) { x = lerp(pv.x, x, fr.t); y = lerp(pv.y, y, fr.t); w = lerp(pv.w, w, fr.t); hh = lerp(pv.h, hh, fr.t); }
      if (tl.head) {
        if (tl.padT) { const t = LB.next('text', 'o-ch-label'); chSetText(t, chFit(`${tl.g.name}`, w - 12, fName)); chAttr(t, { x: r1(x + 6), y: r1(y + tl.padT / 2 + 1), 'text-anchor': 'start', 'dominant-baseline': 'central' }); }
        const bg = C.next('path', 'o-ch-cell o-ch-tile-head o-ch-mark');
        bg.setAttribute('d', chRectPath(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, hh - 2), 4));
        bg.style.setProperty('--sc', tl.g.color); bg.dataset.key = tl.g.key;
        return;
      }
      const el = C.next('path', 'o-ch-cell o-ch-tile o-ch-mark');
      el.setAttribute('d', chRectPath(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, hh - 2), 3));
      el.style.setProperty('--sc', tl.g.color); el.dataset.key = tl.g.key; el.dataset.i = n;
      hit.push({ n, tl });
      if ((fr.mode !== 'enter' || fr.raw > 0.8) && w > 44 && hh > fs + 10) {
        const ink = chInkClass(ch.resolveColor(tl.g.color));
        const name = chFit(tl.it.name, w - 12, fName);
        if (!name) return;
        const t = LB.next('text', 'o-ch-label is-inside ' + ink); chSetText(t, name); chAttr(t, { x: r1(x + 7), y: r1(y + fs + 5), 'text-anchor': 'start', 'dominant-baseline': null });
        if (hh > fs * 2 + 14) { const v = LB.next('text', 'o-ch-label is-inside is-soft ' + ink); chSetText(v, chFit(ch.fmtValue(tl.it.value), w - 12, fVal)); chAttr(v, { x: r1(x + 7), y: r1(y + fs * 2 + 8), 'text-anchor': 'start', 'dominant-baseline': null }); }
      }
    });
    C.end(); LB.end();
    const order = hit.map(hh => hh.n);
    const tileOf = a => tiles[a.i];
    return {
      hit: (x, y) => { for (const { n, tl } of hit) if (x >= tl.x && x <= tl.x + tl.w && y >= tl.y && y <= tl.y + tl.h) return { s: tl.g.key, i: n }; return null; },
      mark: a => { ch.svg.querySelectorAll('.o-ch-tile.is-active').forEach(el => el.classList.remove('is-active')); if (a) L.cells.g.querySelector(`.o-ch-tile[data-i="${a.i}"]`)?.classList.add('is-active'); },
      tip: a => { const tl = tileOf(a); return tl && { title: m.nested ? tl.g.name : '', rows: [{ color: tl.g.color, shape: 'rect', value: ch.fmtValue(tl.it.value), name: tl.it.name }], foot: ch.t('chart.shareOf', { value: fmt.percent(tl.it.value / (m.total || 1), 1, ch.locale) }) }; },
      anchor: a => { const tl = tileOf(a); return { x: tl.x + tl.w / 2, y: tl.y + 2, place: 'top' }; },
      point: a => { const tl = tileOf(a); return tl && { series: tl.g.key, index: a.i, name: tl.g.name, label: tl.it.name, value: tl.it.value, text: ch.fmtValue(tl.it.value) }; },
      first: () => (order.length ? { s: tiles[order[0]].g.key, i: order[0] } : null),
      nav: (a, k) => { const p = order.indexOf(a.i); const q = k === 'Home' ? 0 : k === 'End' ? order.length - 1 : clamp(p + (k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1), 0, order.length - 1); return { s: tiles[order[q]].g.key, i: order[q] }; },
    };
  },
});

/* ── funnel (stages are ordinal: one-hue ramp, darkest first) ──────── */
chRegister('funnel', {
  family: 'funnel',
  prepare(ch) {
    const slices = chSlices(ch).map(s => ({ ...s, hidden: false }));
    return { kind: 'funnel', type: 'funnel', stages: slices, empty: !slices.length };
  },
  autoHeight: (ch, m) => clamp(m.stages.length * 50 + 8, 140, 520),
  legend: () => null,
  table: (ch, m) => {
    const first = m.stages[0]?.value || 1;
    return {
      head: [ch.t('chart.category'), ch.t('chart.value'), ch.t('chart.ofFirst', { value: '%' }).replace('% ', ''), ch.t('chart.ofPrev', { value: '%' }).replace('% ', '')],
      rows: m.stages.map((s, i) => [s.name, ch.fmtValue(s.value), fmt.percent(s.value / first, 1, ch.locale), i ? fmt.percent(s.value / (m.stages[i - 1].value || 1), 1, ch.locale) : '']),
      raw: m.stages.map((s, i) => [s.name, s.value, +(s.value / first).toFixed(4), i ? +(s.value / (m.stages[i - 1].value || 1)).toFixed(4) : '']),
      numeric: [false, true, true, true],
    };
  },
  summary: (ch, m) => { const f = m.stages[0], l = m.stages[m.stages.length - 1]; return `${ch.t('chart.types.funnel')}: ${m.stages.length} ${ch.t('chart.category').toLowerCase()}. ${f.name} ${ch.fmtValue(f.value)} → ${l.name} ${ch.fmtValue(l.value)} (${fmt.percent(l.value / (f.value || 1), 1, ch.locale)}).`; },
  render(ch, m, fr) {
    const W = ch.W, H = ch.H, fs = ch.fontSize;
    const L = ch.layers(['flows', 'series', 'labels', 'hover']);
    const n = m.stages.length;
    const font = ch.font(500), fontM = ch.font(400);
    const narrow = W < 460;
    const nameW = narrow ? 0 : Math.min(W * 0.26, Math.max(...m.stages.map(s => chMeasure(s.name, font))) + 12);
    const rightW = narrow ? 0 : Math.min(W * 0.24, Math.max(chMeasure('100.0%', font), chMeasure(ch.t('chart.ofPrevShort', { value: '100%' }), fontM)) + 14);
    const x0 = nameW, x1 = W - rightW, pw = x1 - x0;
    const rowH = H / n, barH = clamp(rowH - (narrow ? fs + 12 : 12), 10, 40);
    const max = Math.max(...m.stages.map(s => s.value)) || 1;
    const first = m.stages[0].value || 1;
    const cx = (x0 + x1) / 2;
    const prevM = fr.prev?.kind === 'funnel' ? fr.prev : null;
    const F = L.flows.begin(), S = L.series.begin(), LB = L.labels.begin();
    const geo = [];
    m.stages.forEach((s, i) => {
      let v = s.value;
      const ps = prevM?.stages[i];
      if (fr.mode === 'enter') v *= easeOut(clamp((fr.raw - 0.35 * (i / n)) / 0.65, 0, 1)); else if (ps && fr.t < 1) v = lerp(ps.value, v, fr.t);
      const w = Math.max(2, (v / max) * pw);
      const yTop = rowH * i + (rowH - barH) / 2 + (narrow ? fs / 2 + 4 : 0);
      geo.push({ x: cx - w / 2, y: yTop, w, h: barH });
      const cls = n <= 5 ? 'o-ch-o' + Math.round(1 + (i * 4) / Math.max(1, n - 1)) : 'o-ch-o' + (1 + Math.min(4, Math.floor((i * 5) / n)));
      const el = S.next('path', 'o-ch-bar o-ch-mark ' + cls);
      el.setAttribute('d', chRectPath(cx - w / 2, yTop, w, barH, 4));
      el.dataset.key = i; el.dataset.i = i;
    });
    for (let i = 0; i < n - 1; i++) {
      const a = geo[i], b = geo[i + 1];
      const el = F.next('path', 'o-ch-flow');
      el.setAttribute('d', `M${r1(a.x + 4)},${r1(a.y + a.h)}L${r1(a.x + a.w - 4)},${r1(a.y + a.h)}L${r1(b.x + b.w - 4)},${r1(b.y)}L${r1(b.x + 4)},${r1(b.y)}Z`);
    }
    if (fr.mode !== 'enter' || fr.raw > 0.7) {
      m.stages.forEach((s, i) => {
        const g = geo[i];
        const vy = g.y + g.h / 2;
        const name = LB.next('text', 'o-ch-label');
        if (narrow) { chSetText(name, `${s.name} · ${ch.fmtValue(s.value)}`); chAttr(name, { x: r1(cx), y: r1(g.y - 6), 'text-anchor': 'middle', 'dominant-baseline': null }); }
        else {
          name.replaceChildren();
          const t1 = chEl('tspan', { x: 0 }, name); t1.textContent = chFit(s.name, nameW - 12, font);
          chAttr(name, { x: 0, y: r1(vy - fs * 0.45), 'text-anchor': 'start', 'dominant-baseline': 'central' });
          const val = LB.next('text', 'o-ch-caption'); chSetText(val, ch.fmtValue(s.value)); chAttr(val, { x: 0, y: r1(vy + fs * 0.75), 'text-anchor': 'start', 'dominant-baseline': 'central' });
          const pct = LB.next('text', 'o-ch-label'); chSetText(pct, fmt.percent(s.value / first, s.value / first < 0.1 ? 1 : 0, ch.locale)); chAttr(pct, { x: W - 2, y: r1(vy - fs * 0.45), 'text-anchor': 'end', 'dominant-baseline': 'central' });
          if (i) { const dp = LB.next('text', 'o-ch-caption'); chSetText(dp, ch.t('chart.ofPrevShort', { value: fmt.percent(s.value / (m.stages[i - 1].value || 1), 0, ch.locale) })); chAttr(dp, { x: W - 2, y: r1(vy + fs * 0.75), 'text-anchor': 'end', 'dominant-baseline': 'central' }); }
        }
        // value inside the bar when it fits
        if (!narrow) {
          const tx = ch.fmtValue(s.value), tw = chMeasure(tx, font);
          if (tw + 16 < g.w && barH >= fs + 6) { const t = LB.next('text', 'o-ch-label is-inside ' + chInkClass(ch.resolveColor(`var(--o-ch-o${n <= 5 ? Math.round(1 + (i * 4) / Math.max(1, n - 1)) : 1 + Math.min(4, Math.floor((i * 5) / n))})`))); chSetText(t, tx); chAttr(t, { x: r1(cx), y: r1(vy), 'text-anchor': 'middle', 'dominant-baseline': 'central' }); }
        }
      });
    }
    F.end(); S.end(); LB.end();
    return {
      hit: (x, y) => { const i = clamp(Math.floor(y / rowH), 0, n - 1); return { s: i, i }; },
      mark: a => { ch.svg.querySelectorAll('.o-ch-bar.is-active').forEach(el => el.classList.remove('is-active')); if (a) L.series.g.querySelector(`[data-i="${a.i}"]`)?.classList.add('is-active'); },
      tip: a => {
        const s = m.stages[a.i];
        const rows = [{ color: `var(--o-ch-o${1 + Math.min(4, Math.floor((a.i * 5) / n))})`, shape: 'rect', value: ch.fmtValue(s.value), name: s.name }, { shape: 'none', value: fmt.percent(s.value / first, 1, ch.locale), name: ch.t('chart.ofFirst', { value: '' }).trim(), strong: false }];
        if (a.i) rows.push({ shape: 'none', value: fmt.percent(s.value / (m.stages[a.i - 1].value || 1), 1, ch.locale), name: ch.t('chart.ofPrev', { value: '' }).trim(), strong: false });
        return { title: s.name, rows };
      },
      anchor: a => { const g = geo[a.i]; return { x: g.x + g.w / 2, y: g.y, place: 'top' }; },
      point: a => { const s = m.stages[a.i]; return { series: a.i, index: a.i, name: s.name, label: s.name, value: s.value, text: `${ch.fmtValue(s.value)}, ${fmt.percent(s.value / first, 1, ch.locale)}` }; },
      first: () => ({ s: 0, i: 0 }),
      nav: (a, k) => { const i = k === 'Home' ? 0 : k === 'End' ? n - 1 : clamp(a.i + (k === 'ArrowDown' || k === 'ArrowRight' ? 1 : -1), 0, n - 1); return { s: i, i }; },
    };
  },
});
