/* ============================================================================
 * Geometry: built-in shapes (paths in local 0..w / 0..h coordinates), label
 * boxes, ports, auto port selection, boundary clipping and polyline helpers.
 * ========================================================================== */

const dgRR = (w, hh, r) => (r <= 0 ? `M0 0H${w}V${hh}H0Z`
  : `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${hh - r}A${r} ${r} 0 0 1 ${w - r} ${hh}H${r}A${r} ${r} 0 0 1 0 ${hh - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`);
const dgEll = (cx, cy, rx, ry) => `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
const dgSkew = (w, hh) => Math.min(w * 0.18, hh * 0.5);
const dgInset = (p, w, hh) => ({ x: p, y: p, w: w - p * 2, h: hh - p * 2 });

dgShape('rect', { size: [140, 64], path: (w, hh) => dgRR(w, hh, 2) });
dgShape('rounded', { size: [140, 64], path: (w, hh) => dgRR(w, hh, Math.min(10, hh / 4, w / 4)) });
dgShape('terminator', { size: [140, 56], path: (w, hh) => dgRR(w, hh, Math.min(hh / 2, w / 2)), text: (w, hh) => dgInset(Math.min(hh / 3, 16), w, hh) });
dgShape('ellipse', { size: [140, 76], boundary: 'ellipse', path: (w, hh) => dgEll(w / 2, hh / 2, w / 2, hh / 2), text: (w, hh) => ({ x: w * 0.15, y: hh * 0.15, w: w * 0.7, h: hh * 0.7 }) });
dgShape('circle', { size: [88, 88], ratio: true, boundary: 'ellipse', path: (w, hh) => { const r = Math.min(w, hh) / 2; return dgEll(w / 2, hh / 2, r, r); }, text: (w, hh) => { const d = Math.min(w, hh) * 0.72; return { x: (w - d) / 2, y: (hh - d) / 2, w: d, h: d }; } });
dgShape('diamond', { size: [150, 96], boundary: 'diamond', path: (w, hh) => `M${w / 2} 0L${w} ${hh / 2}L${w / 2} ${hh}L0 ${hh / 2}Z`, text: (w, hh) => ({ x: w * 0.19, y: hh * 0.2, w: w * 0.62, h: hh * 0.6 }) });
dgShape('parallelogram', {
  size: [150, 64], path: (w, hh) => { const s = dgSkew(w, hh); return `M${s} 0H${w}L${w - s} ${hh}H0Z`; },
  text: (w, hh) => { const s = dgSkew(w, hh); return { x: s * 0.7, y: 4, w: w - s * 1.4, h: hh - 8 }; },
  ports: (w, hh) => { const s = dgSkew(w, hh); return { t: [w / 2, 0], r: [w - s / 2, hh / 2], b: [w / 2, hh], l: [s / 2, hh / 2] }; },
});
dgShape('hexagon', {
  size: [150, 64], path: (w, hh) => { const s = Math.min(w * 0.18, hh / 2); return `M${s} 0H${w - s}L${w} ${hh / 2}L${w - s} ${hh}H${s}L0 ${hh / 2}Z`; },
  text: (w, hh) => { const s = Math.min(w * 0.18, hh / 2); return { x: s * 0.8, y: 4, w: w - s * 1.6, h: hh - 8 }; },
});
dgShape('cylinder', {
  size: [110, 84],
  path: (w, hh) => { const ry = Math.min(hh * 0.14, 12); return `M0 ${ry}A${w / 2} ${ry} 0 0 1 ${w} ${ry}V${hh - ry}A${w / 2} ${ry} 0 0 1 0 ${hh - ry}Z`; },
  extra: (w, hh) => { const ry = Math.min(hh * 0.14, 12); return `M0 ${ry}A${w / 2} ${ry} 0 0 0 ${w} ${ry}`; },
  text: (w, hh) => { const ry = Math.min(hh * 0.14, 12); return { x: 6, y: ry * 2 + 2, w: w - 12, h: hh - ry * 3 - 4 }; },
});
dgShape('document', {
  size: [140, 76],
  path: (w, hh) => { const a = Math.min(hh * 0.1, 9); return `M0 0H${w}V${hh - a}C${w * 0.75} ${hh - a * 3} ${w * 0.3} ${hh + a * 1.2} 0 ${hh - a * 0.4}Z`; },
  text: (w, hh) => ({ x: 6, y: 4, w: w - 12, h: hh - 14 }),
});
dgShape('note', {
  size: [150, 92],
  path: (w, hh) => { const f = Math.min(16, w / 4, hh / 4); return `M0 0H${w - f}L${w} ${f}V${hh}H0Z`; },
  extra: (w, hh) => { const f = Math.min(16, w / 4, hh / 4); return `M${w - f} 0V${f}H${w}`; },
  text: (w, hh) => dgInset(10, w, hh), align: 'start',
});
dgShape('text', { size: [120, 40], path: (w, hh) => `M0 0H${w}V${hh}H0Z`, text: (w, hh) => dgInset(2, w, hh) });
dgShape('image', { size: [120, 112], path: (w, hh) => dgRR(w, hh, 8), text: (w, hh) => ({ x: 4, y: hh - 26, w: w - 8, h: 22 }) });
dgShape('html', { size: [180, 96], path: (w, hh) => dgRR(w, hh, 8), text: () => null });

/** Shape definition for a node (instance shapes first). */
function dgDef(n, shapes) { return (shapes && shapes[n.type]) || DG_SHAPES[n.type] || DG_SHAPES.rounded; }
/** Label box in local coordinates. */
function dgTextBox(n, def) {
  const b = def.text ? def.text(n.width, n.height, n) : dgInset(8, n.width, n.height);
  return b;
}

/**
 * Ports of a node in WORLD coordinates: [{ id, x, y, side, label, kind }]
 * node.ports: [{ id, side: 'top'|'right'|'bottom'|'left', offset: 0..1, label, kind: 'in'|'out'|'both' }]
 */
function dgPorts(n, def) {
  if (Array.isArray(n.ports) && n.ports.length) {
    return n.ports.map(p => {
      const side = DG_SIDE_ALIAS[p.side] || 'b', o = p.offset ?? 0.5;
      const x = side === 'l' ? 0 : side === 'r' ? n.width : n.width * o;
      const y = side === 't' ? 0 : side === 'b' ? n.height : n.height * o;
      return { id: p.id, x: n.x + x, y: n.y + y, side, label: p.label, kind: p.kind || 'both', max: p.max };
    });
  }
  const pp = def && def.ports ? def.ports(n.width, n.height) : null;
  const w = n.width, hh = n.height;
  let base = pp || { t: [w / 2, 0], r: [w, hh / 2], b: [w / 2, hh], l: [0, hh / 2] };
  if (def && def.ratio && !pp) { const r = Math.min(w, hh) / 2; base = { t: [w / 2, hh / 2 - r], r: [w / 2 + r, hh / 2], b: [w / 2, hh / 2 + r], l: [w / 2 - r, hh / 2] }; }
  return ['t', 'r', 'b', 'l'].map(s => ({ id: s, x: n.x + base[s][0], y: n.y + base[s][1], side: s, kind: 'both' }));
}
function dgPort(n, def, id) { return dgPorts(n, def).find(p => p.id === id) || null; }

/**
 * Pick the best (fromPort, toPort) pair between nodes a and b: ports that face each other with the
 * shortest manhattan distance. Explicit edge ports win. Returns [pa, pb].
 */
function dgBestPorts(a, da, b, db, e) {
  const A = dgPorts(a, da).filter(p => p.kind !== 'in'), B = dgPorts(b, db).filter(p => p.kind !== 'out');
  const fa = e && e.fromPort != null ? A.filter(p => p.id === e.fromPort) : [], fb = e && e.toPort != null ? B.filter(p => p.id === e.toPort) : [];
  const la = fa.length ? fa : (A.length ? A : dgPorts(a, da)), lb = fb.length ? fb : (B.length ? B : dgPorts(b, db));
  const acx = a.x + a.width / 2, acy = a.y + a.height / 2, bcx = b.x + b.width / 2, bcy = b.y + b.height / 2;
  let best = null, bestCost = Infinity;
  for (const p of la) for (const q of lb) {
    const [nx, ny] = DG_NORMAL[p.side], [mx, my] = DG_NORMAL[q.side];
    const dx = q.x - p.x, dy = q.y - p.y;
    let cost = Math.abs(dx) + Math.abs(dy);
    if (nx * (bcx - p.x) + ny * (bcy - p.y) <= 0) cost += 180;      // port faces away from the other node
    if (mx * (acx - q.x) + my * (acy - q.y) <= 0) cost += 180;
    if (nx * dx + ny * dy < 8) cost += 60;                            // must travel "out" of the source first
    if (mx * -dx + my * -dy < 8) cost += 60;
    if (nx === -mx && ny === -my) cost -= 10;                         // opposite sides read best
    if (cost < bestCost) { bestCost = cost; best = [p, q]; }
  }
  return best;
}

/** Point where the ray from the node center toward (tx, ty) leaves the shape boundary. */
function dgBoundary(n, def, tx, ty) {
  const cx = n.x + n.width / 2, cy = n.y + n.height / 2;
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const a = n.width / 2, b = n.height / 2, kind = def && def.boundary;
  let t;
  if (kind === 'ellipse') { const r = def.ratio ? Math.min(a, b) : 0; const ra = r || a, rb = r || b; t = 1 / Math.sqrt((dx / ra) ** 2 + (dy / rb) ** 2); }
  else if (kind === 'diamond') t = 1 / (Math.abs(dx) / a + Math.abs(dy) / b);
  else t = Math.min(dx ? a / Math.abs(dx) : Infinity, dy ? b / Math.abs(dy) : Infinity);
  return { x: cx + dx * t, y: cy + dy * t };
}

/* ── polyline helpers ────────────────────────────────────────────────── */
const dgDist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
function dgPolyLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += dgDist(pts[i - 1], pts[i]); return s; }
/** Point at fraction t (0..1) of the length: { x, y, dx, dy } (dx/dy = unit direction). */
function dgPointAt(pts, t) {
  if (pts.length < 2) return { x: pts[0]?.x || 0, y: pts[0]?.y || 0, dx: 1, dy: 0 };
  let target = dgPolyLen(pts) * clamp(t, 0, 1);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = dgDist(a, b);
    if (target <= l || i === pts.length - 1) { const f = l ? Math.min(1, target / l) : 0; return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, dx: l ? (b.x - a.x) / l : 1, dy: l ? (b.y - a.y) / l : 0 }; }
    target -= l;
  }
  return pts[pts.length - 1];
}
/** Fraction of the polyline length nearest to point p. */
function dgProject(pts, p) {
  let best = Infinity, at = 0, acc = 0;
  const total = dgPolyLen(pts) || 1;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = dgDist(a, b);
    const f = l ? clamp(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (l * l), 0, 1) : 0;
    const d = Math.hypot(a.x + (b.x - a.x) * f - p.x, a.y + (b.y - a.y) * f - p.y);
    if (d < best) { best = d; at = (acc + f * l) / total; }
    acc += l;
  }
  return at;
}
/** Remove duplicate and collinear points of an orthogonal polyline. */
function dgSimplify(pts) {
  const out = [];
  for (const p of pts) {
    const q = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
    const l = out[out.length - 1];
    if (l && Math.abs(l.x - q.x) < 0.5 && Math.abs(l.y - q.y) < 0.5) continue;
    if (out.length >= 2) {
      const k = out[out.length - 2];
      if ((Math.abs(k.x - l.x) < 0.5 && Math.abs(l.x - q.x) < 0.5) || (Math.abs(k.y - l.y) < 0.5 && Math.abs(l.y - q.y) < 0.5)) { out[out.length - 1] = q; continue; }
    }
    out.push(q);
  }
  return out;
}
const dgF = v => Math.round(v * 10) / 10;
/** SVG path through points with rounded corners of radius r. */
function dgRoundPath(pts, r = 8) {
  if (!pts.length) return '';
  let d = `M${dgF(pts[0].x)} ${dgF(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
    const l1 = dgDist(p0, p1), l2 = dgDist(p1, p2), rr = Math.min(r, l1 / 2, l2 / 2);
    if (rr < 1) { d += `L${dgF(p1.x)} ${dgF(p1.y)}`; continue; }
    const ax = p1.x + (p0.x - p1.x) * rr / l1, ay = p1.y + (p0.y - p1.y) * rr / l1;
    const bx = p1.x + (p2.x - p1.x) * rr / l2, by = p1.y + (p2.y - p1.y) * rr / l2;
    d += `L${dgF(ax)} ${dgF(ay)}Q${dgF(p1.x)} ${dgF(p1.y)} ${dgF(bx)} ${dgF(by)}`;
  }
  const z = pts[pts.length - 1];
  return d + `L${dgF(z.x)} ${dgF(z.y)}`;
}
/** Sample a cubic bezier into a polyline (for labels, hit tests, projection). */
function dgBezierPts(p0, c1, c2, p3, n = 20) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push({ x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y });
  }
  return out;
}
/** Does the axis-aligned segment a-b pass through the (inflated) rect r? */
function dgSegHitsRect(a, b, r) {
  const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
  return x2 > r.x + 0.5 && x1 < r.x + r.w - 0.5 && y2 > r.y + 0.5 && y1 < r.y + r.h - 0.5;
}
const dgRectsTouch = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const dgNodeRect = (n, m = 0) => ({ x: n.x - m, y: n.y - m, w: n.width + m * 2, h: n.height + m * 2 });
