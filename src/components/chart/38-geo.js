/* ============================================================================
 * Orion charts — geo: choropleth and bubble maps from user-supplied GeoJSON
 * (Polygon / MultiPolygon regions, Point features), equirectangular or mercator
 * projection fitted to the plot, wheel (Ctrl/⌘) / button / keyboard zoom, drag pan.
 *
 *   { type: 'choropleth', geo: { geojson, key: 'id', projection: 'mercator' },
 *     series: [{ name: 'Sales', data: [{ id: 'N1', value: 120 }] }] }
 *   { type: 'bubbleMap', geo: { geojson }, series: [{ name: 'Stores', data: [{ lon, lat, value, name }] }] }
 * ========================================================================== */

const CH_DEG = Math.PI / 180;
function chProjection(kind) {
  if (kind === 'mercator') return (lon, lat) => [lon * CH_DEG, -Math.log(Math.tan(Math.PI / 4 + (clamp(lat, -85, 85) * CH_DEG) / 2))];
  return (lon, lat) => [lon * CH_DEG, -lat * CH_DEG];
}
function chPolys(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  if (geom.type === 'GeometryCollection') return (geom.geometries || []).flatMap(chPolys);
  return [];
}
/** Area-weighted centroid of the largest outer ring (projected coordinates). */
function chRingCentroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
  }
  if (!a) return ring[0] || [0, 0];
  return [cx / (3 * a), cy / (3 * a), Math.abs(a / 2)];
}

chRegister(['geo', 'choropleth', 'bubbleMap'], {
  family: 'geo',
  zoomButtons: true,
  prepare(ch) {
    const c = ch.cfg, gc = c.geo || {};
    const gj = gc.geojson || gc.data;
    const feats = !gj ? [] : gj.type === 'FeatureCollection' ? gj.features || [] : Array.isArray(gj) ? gj : gj.type === 'Feature' ? [gj] : [];
    const project = chProjection(gc.projection || 'equirectangular');
    const keyOf = f => String(getPath(f, gc.key || 'id') ?? f.id ?? f.properties?.id ?? f.properties?.name ?? '');
    const nameOf = f => String(getPath(f, gc.nameKey || 'properties.name') ?? keyOf(f));
    const regions = [], points = [];
    for (const f of feats) {
      if (!f || !f.geometry) continue;
      if (f.geometry.type === 'Point') { const [lon, lat] = f.geometry.coordinates; points.push({ key: keyOf(f), name: nameOf(f), p: project(lon, lat), props: f.properties || {} }); continue; }
      const polys = chPolys(f.geometry).map(poly => poly.map(ring => ring.map(([lon, lat]) => project(lon, lat))));
      if (!polys.length) continue;
      let best = null;
      for (const poly of polys) { const cc = chRingCentroid(poly[0]); if (!best || cc[2] > best[2]) best = cc; }
      regions.push({ i: regions.length, key: keyOf(f), name: nameOf(f), polys, centroid: best, props: f.properties || {} });
    }
    const raw = chRawSeries(c);
    const valMap = new Map();
    const bubbleSeries = [];
    raw.forEach((s, si) => {
      const isBubble = s.type === 'bubble' || (c.type === 'bubbleMap' && s.type !== 'choropleth');
      if (!isBubble) {
        const list = Array.isArray(s.data) ? s.data : isObj(s.data) ? Object.entries(s.data).map(([id, value]) => ({ id, value })) : [];
        for (const d of list) { const k = String(d.id ?? d.key ?? d.name ?? d.region); const v = chNum(d.value ?? d.y); if (v != null) valMap.set(k, v); }
        return;
      }
      const pts = [];
      for (const d of s.data || []) {
        let p = null, name = d.name ?? d.label;
        if (d.lon != null || d.lng != null) p = project(+(d.lon ?? d.lng), +d.lat);
        else if (Array.isArray(d.coordinates)) p = project(d.coordinates[0], d.coordinates[1]);
        else if (d.id != null) { const k = String(d.id); const pt = points.find(q => q.key === k); const rg = regions.find(q => q.key === k); p = pt?.p || rg?.centroid || null; name = name ?? pt?.name ?? rg?.name; }
        const v = chNum(d.value ?? d.size ?? d.z);
        if (p && v != null) pts.push({ p, v, name: String(name ?? ''), raw: d });
      }
      bubbleSeries.push({ key: si, name: s.name != null ? String(s.name) : ch.t('chart.seriesN', { n: si + 1 }), color: chColor(c.colors?.[si] ?? s.color, bubbleSeries.length), pts, hidden: ch.state.hidden.has(si) });
    });
    const vals = [...valMap.values()];
    const ext = chExtent(vals);
    const bins = clamp(gc.bins ?? 5, 3, 7);
    let bMax = 0;
    for (const s of bubbleSeries) if (!s.hidden) for (const q of s.pts) bMax = Math.max(bMax, Math.abs(q.v));
    // projected bounds
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = ([x, y]) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    for (const r of regions) for (const poly of r.polys) for (const ring of poly) for (const p of ring) grow(p);
    for (const s of bubbleSeries) for (const q of s.pts) grow(q.p);
    return {
      kind: 'geo', type: c.type, regions, points, valMap, lo: gc.min ?? (ext ? Math.min(0, ext[0]) : 0), hi: gc.max ?? (ext ? ext[1] : 1), bins,
      bubbleSeries, bMax, bounds: [x0, y0, x1, y1], hasValues: vals.length > 0, empty: !regions.length && !bubbleSeries.some(s => s.pts.length),
    };
  },
  autoHeight: (ch, m, w) => { const [x0, y0, x1, y1] = m.bounds; const ar = (y1 - y0) / ((x1 - x0) || 1); return clamp(Math.round(w * ar) + 8, 220, 560); },
  legend: (ch, m) => {
    if (m.hasValues) return chHeatLegend(ch, { lo: m.lo, hi: m.hi, bins: m.bins, diverging: false, hasMissing: m.regions.some(r => !m.valMap.has(r.key)) });
    return m.bubbleSeries.length >= 2 ? m.bubbleSeries.map(s => ({ key: s.key, name: s.name, color: s.color, shape: 'dot', hidden: s.hidden })) : null;
  },
  table: (ch, m) => {
    const rows = [], raw = [];
    if (m.hasValues) for (const r of [...m.regions].sort((a, b) => a.name.localeCompare(b.name))) { const v = m.valMap.get(r.key); rows.push([r.name, v == null ? '' : ch.fmtValue(v)]); raw.push([r.name, v ?? '']); }
    for (const s of m.bubbleSeries) if (!s.hidden) for (const q of s.pts) { rows.push([m.bubbleSeries.length > 1 ? `${s.name} · ${q.name}` : q.name, ch.fmtValue(q.v)]); raw.push([q.name, q.v]); }
    return { head: [ch.t('chart.region'), ch.t('chart.value')], rows, raw, numeric: [false, true] };
  },
  summary: (ch, m) => {
    const parts = [ch.t('chart.types.' + (m.type === 'geo' ? 'geo' : m.type))];
    if (m.hasValues) {
      const top = [...m.valMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${m.regions.find(r => r.key === k)?.name ?? k} ${ch.fmtValue(v)}`);
      parts.push(`${m.regions.length} ${ch.t('chart.region').toLowerCase()}. ${fmt.list(top, 'conjunction', ch.locale)}.`);
    }
    for (const s of m.bubbleSeries) parts.push(`${s.name}: ${s.pts.length}.`);
    return parts.join(' ');
  },
  render(ch, m, fr) {
    const W = ch.W, H = ch.H, gc = ch.cfg.geo || {};
    const L = ch.layers(['regions', 'hl', 'bubbles', 'hover']);
    const [bx0, by0, bx1, by1] = m.bounds;
    const pad = 8;
    const k0 = Math.min((W - pad * 2) / ((bx1 - bx0) || 1), (H - pad * 2) / ((by1 - by0) || 1));
    const ox = (W - (bx1 - bx0) * k0) / 2 - bx0 * k0, oy = (H - (by1 - by0) * k0) / 2 - by0 * k0;
    const fit = ([x, y]) => [x * k0 + ox, y * k0 + oy];
    const z = ch.state.geo || (ch.state.geo = { k: 1, x: 0, y: 0 });
    const R = L.regions.begin();
    const regionEls = [];
    for (const r of m.regions) {
      let d = '';
      for (const poly of r.polys) for (const ring of poly) { d += 'M' + ring.map(p => fit(p).map(r1).join(',')).join('L') + 'Z'; }
      const v = m.valMap.get(r.key);
      const cls = m.hasValues ? chHeatClass(v, m.lo, m.hi, m.bins, false) : '';
      const el = R.next('path', 'o-ch-region ' + (m.hasValues ? cls : 'is-base'));
      chAttr(el, { d, 'fill-rule': 'evenodd' });
      el.dataset.r = r.i;
      if (fr.mode === 'enter') el.style.opacity = String(clamp(fr.raw * 1.6 - (r.i / Math.max(1, m.regions.length)) * 0.6, 0, 1)); else el.style.opacity = '';
      regionEls.push(el);
    }
    R.end();
    const rMax = clamp(Math.min(W, H) / 12, 8, 30);
    const rOf = v => Math.max(3, Math.sqrt(Math.abs(v) / (m.bMax || 1)) * rMax);
    const bubbles = [];
    for (const s of m.bubbleSeries) if (!s.hidden) s.pts.forEach((q, j) => bubbles.push({ s, q, j, base: fit(q.p), r: rOf(q.v) }));
    bubbles.sort((a, b) => b.r - a.r);
    const apply = () => {
      L.regions.g.setAttribute('transform', `translate(${r2(z.x)},${r2(z.y)}) scale(${r2(z.k)})`);
      L.hl.g.setAttribute('transform', `translate(${r2(z.x)},${r2(z.y)}) scale(${r2(z.k)})`);
      const B = L.bubbles.begin();
      for (const b of bubbles) {
        b.x = b.base[0] * z.k + z.x; b.y = b.base[1] * z.k + z.y;
        const te = fr.mode === 'enter' ? easeOut(clamp((fr.raw - 0.4) / 0.6, 0, 1)) : 1;
        const el = B.next('circle', 'o-ch-bubble o-ch-mark');
        chAttr(el, { cx: r1(b.x), cy: r1(b.y), r: r1(b.r * te) });
        el.style.setProperty('--sc', b.s.color); el.dataset.key = b.s.key;
      }
      B.end();
      ch.els.plot.classList.toggle('is-pannable', z.k > 1.001);
      ch.els.reset.hidden = !(z.k > 1.001);
      ch.E_updateHead();
    };
    apply();
    const setZoom = (k, cx, cy) => {
      const nk = clamp(k, 1, gc.maxZoom ?? 12);
      cx = cx ?? W / 2; cy = cy ?? H / 2;
      z.x = cx - ((cx - z.x) / z.k) * nk; z.y = cy - ((cy - z.y) / z.k) * nk; z.k = nk;
      if (nk <= 1.001) { z.x = 0; z.y = 0; z.k = 1; }
      clampPan(); apply();
      chTipHide(ch);
      ch._fire('zoom', { scale: z.k, x: z.x, y: z.y });
    };
    const clampPan = () => { const mx = W * 0.8, my = H * 0.8; z.x = clamp(z.x, W - W * z.k - mx * 0.25, mx * 0.25); z.y = clamp(z.y, H - H * z.k - my * 0.25, my * 0.25); };
    const order = [...m.regions].sort((a, b) => a.name.localeCompare(b.name)).map(r => ({ t: 'r', i: r.i }));
    bubbles.forEach((b, n) => order.push({ t: 'b', i: n }));
    const aOf = n => (order[n].t === 'r' ? { s: -1, i: order[n].i, n } : { s: bubbles[order[n].i].s.key, i: order[n].i, b: true, n });
    const V = {
      zoomed: () => z.k > 1.001,
      resetZoom: () => setZoom(1),
      zoomBy: f => setZoom(z.k * f),
      hit: (x, y, target) => {
        for (const b of [...bubbles].reverse()) if (Math.hypot(b.x - x, b.y - y) <= Math.max(b.r, 8) + 2) { const n = order.findIndex(o => o.t === 'b' && bubbles[o.i] === b); return aOf(n); }
        const el = target && target.closest ? target.closest('[data-r]') : null;
        if (el) { const i = +el.dataset.r; const n = order.findIndex(o => o.t === 'r' && o.i === i); return aOf(n); }
        return null;
      },
      mark: a => {
        const HL = L.hl.begin(), HV = L.hover.begin();
        if (a && !a.b) { const src = regionEls[a.i]; if (src) chAttr(HL.next('path', 'o-ch-region-hl'), { d: src.getAttribute('d'), 'fill-rule': 'evenodd' }); }
        if (a && a.b) { const b = bubbles[a.i]; const ring = HV.next('circle', 'o-ch-focus-ring'); chAttr(ring, { cx: r1(b.x), cy: r1(b.y), r: r1(b.r + 3) }); ring.style.setProperty('--sc', b.s.color); }
        HL.end(); HV.end();
      },
      tip: a => {
        if (a.b) { const b = bubbles[a.i]; return { title: b.q.name, rows: [{ color: b.s.color, shape: 'dot', value: ch.fmtValue(b.q.v), name: b.s.name }] }; }
        const r = m.regions[a.i], v = m.valMap.get(r.key);
        const sName = chRawSeries(ch.cfg).find(s => s.type !== 'bubble')?.name || '';
        return { title: r.name, rows: m.hasValues ? [{ color: v == null ? 'var(--o-ch-q0)' : `var(--o-ch-${chHeatClass(v, m.lo, m.hi, m.bins, false).slice(5)})`, shape: 'rect', value: v == null ? ch.t('chart.noData') : ch.fmtValue(v), name: sName }] : [] };
      },
      anchor: (a, ptr) => {
        if (a.b) { const b = bubbles[a.i]; return { x: b.x, y: b.y - b.r - 2, place: 'top' }; }
        if (ptr) return { x: ptr.x, y: ptr.y - 8, place: 'top' };
        const c0 = fit(m.regions[a.i].centroid); return { x: c0[0] * z.k + z.x, y: c0[1] * z.k + z.y, place: 'top' };
      },
      point: a => {
        if (a.b) { const b = bubbles[a.i]; return { series: b.s.key, index: b.j, name: b.s.name, label: b.q.name, value: b.q.v, text: ch.fmtValue(b.q.v) }; }
        const r = m.regions[a.i], v = m.valMap.get(r.key) ?? null;
        return { series: 0, index: a.i, name: r.name, label: r.name, value: v, id: r.key, text: v == null ? ch.t('chart.noData') : ch.fmtValue(v) };
      },
      first: () => (order.length ? aOf(0) : null),
      nav: (a, k) => { const n = k === 'Home' ? 0 : k === 'End' ? order.length - 1 : clamp(a.n + (k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1), 0, order.length - 1); return aOf(n); },
      key: e => {
        if (e.key === '+' || e.key === '=') { setZoom(z.k * 1.5); return true; }
        if (e.key === '-' || e.key === '_') { setZoom(z.k / 1.5); return true; }
        if (e.key === '0') { setZoom(1); return true; }
        return false;
      },
      wheel: (p, e) => {
        if (!(e.ctrlKey || e.metaKey || gc.wheel === true)) return;
        e.preventDefault();
        setZoom(z.k * Math.pow(1.0018, -e.deltaY), p.x, p.y);
      },
      dblclick: p => setZoom(z.k * 1.8, p.x, p.y),
      dragStart: p => (z.k > 1.001 ? { sx: p.x, sy: p.y, zx: z.x, zy: z.y } : null),
      dragMove: (d, p) => { d.moved = d.moved || Math.hypot(p.x - d.sx, p.y - d.sy) > 3; if (!d.moved) return; ch.els.plot.classList.add('is-panning'); z.x = d.zx + (p.x - d.sx); z.y = d.zy + (p.y - d.sy); clampPan(); apply(); chTipHide(ch); },
      dragEnd: () => { ch.els.plot.classList.remove('is-panning'); },
    };
    return V;
  },
});
