/* ============================================================================
 * <o-graph> — force-directed network graph.
 *   Velocity-Verlet integration, Barnes-Hut quadtree charge approximation,
 *   link springs, centre gravity and spatial-hash collision.
 * @deps diagram
 * ========================================================================== */

i18n.add('en', {
  graph: {
    label: 'Network graph', summary: 'Network graph with {nodes} nodes and {edges} links.',
    help: 'Drag a node to pin it in place; double-click a pinned node to release it. Hover a node to highlight its neighbours.',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Zoom to fit', actual: 'Reset zoom to 100%',
    freeze: 'Freeze layout', unfreeze: 'Resume layout', reheat: 'Restart layout',
    exportSVG: 'Export SVG', exportPNG: 'Export PNG', export: 'Export', legend: 'Legend', other: 'Other',
    untitled: 'Untitled', settled: 'Layout settled',
  },
});

const GR_ICONS = {
  fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  snowflake: '<path d="M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9"/>',
  play: '<path d="m6 3 14 9-14 9z"/>',
};
function grIcon(name, cls = '') {
  if (O.icons?.get(name)) return icon(name, cls ? { class: cls } : {});
  const body = GR_ICONS[name] || '';
  return raw(`<svg class="o-icon o-icon-${esc(name)}${cls ? ' ' + esc(cls) : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`);
}

function grNormNode(n, i) {
  n = isObj(n) ? n : {};
  const id = n.id != null && n.id !== '' ? String(n.id) : 'gn' + i;
  return { id, label: n.label != null ? String(n.label) : id, group: n.group != null ? String(n.group) : '', size: isNum(+n.size) ? +n.size : 10, data: n.data };
}
function grNormEdge(e) {
  e = isObj(e) ? e : {};
  return { source: String(e.source ?? e.from ?? ''), target: String(e.target ?? e.to ?? ''), weight: isNum(+e.weight) ? +e.weight : 1, label: e.label != null ? String(e.label) : '' };
}

/* ── Barnes-Hut quadtree ─────────────────────────────────────────────── */
class GrQuad {
  constructor(x0, y0, x1, y1) { this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1; this.node = null; this.kids = null; this.mass = 0; this.cx = 0; this.cy = 0; }
}
function grBuildTree(nodes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) { if (n.x < x0) x0 = n.x; if (n.x > x1) x1 = n.x; if (n.y < y0) y0 = n.y; if (n.y > y1) y1 = n.y; }
  if (!isFinite(x0)) { x0 = y0 = -1; x1 = y1 = 1; }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, d = Math.max(x1 - x0, y1 - y0, 1) * 1.05;
  const root = new GrQuad(cx - d / 2, cy - d / 2, cx + d / 2, cy + d / 2);
  for (const n of nodes) grInsert(root, n, 0);
  grAccumulate(root);
  return root;
}
function grQuadIndex(q, n) { const mx = (q.x0 + q.x1) / 2, my = (q.y0 + q.y1) / 2; return (n.x >= mx ? 1 : 0) + (n.y >= my ? 2 : 0); }
function grMakeKids(q) {
  const mx = (q.x0 + q.x1) / 2, my = (q.y0 + q.y1) / 2;
  return [new GrQuad(q.x0, q.y0, mx, my), new GrQuad(mx, q.y0, q.x1, my), new GrQuad(q.x0, my, mx, q.y1), new GrQuad(mx, my, q.x1, q.y1)];
}
function grInsert(q, n, depth) {
  if (depth > 28) return;
  if (q.kids) { grInsert(q.kids[grQuadIndex(q, n)], n, depth + 1); return; }
  if (!q.node) { q.node = n; return; }
  if (Math.abs(q.node.x - n.x) < 1e-4 && Math.abs(q.node.y - n.y) < 1e-4) { n.x += (Math.random() - 0.5) * 0.5; n.y += (Math.random() - 0.5) * 0.5; }
  const existing = q.node; q.node = null;
  q.kids = grMakeKids(q);
  grInsert(q.kids[grQuadIndex(q, existing)], existing, depth + 1);
  grInsert(q.kids[grQuadIndex(q, n)], n, depth + 1);
}
function grAccumulate(q) {
  if (q.kids) {
    let m = 0, sx = 0, sy = 0;
    for (const c of q.kids) { grAccumulate(c); m += c.mass; sx += c.cx * c.mass; sy += c.cy * c.mass; }
    q.mass = m; q.cx = m ? sx / m : (q.x0 + q.x1) / 2; q.cy = m ? sy / m : (q.y0 + q.y1) / 2;
  } else if (q.node) { q.mass = q.node.mass; q.cx = q.node.x; q.cy = q.node.y; }
  else { q.mass = 0; q.cx = (q.x0 + q.x1) / 2; q.cy = (q.y0 + q.y1) / 2; }
}
/** Accumulate repulsive acceleration on `n` from quad `q` into out.x/out.y (Barnes-Hut, theta ~0.85). */
function grApplyCharge(q, n, theta, strength, out) {
  if (q.mass <= 0 || q.node === n) return;
  const dx = n.x - q.cx, dy = n.y - q.cy;
  let d2 = dx * dx + dy * dy;
  if (d2 < 0.02) d2 = 0.02;
  const s = q.x1 - q.x0;
  if (!q.kids || (s * s) / d2 < theta * theta) {
    const f = (strength * q.mass) / d2;
    const d = Math.sqrt(d2);
    out.x += (f * dx) / d; out.y += (f * dy) / d;
    return;
  }
  for (const c of q.kids) grApplyCharge(c, n, theta, strength, out);
}

/** Force-directed simulation: velocity-Verlet integration over Barnes-Hut charge + link springs + gravity. */
class GrSimulation {
  constructor(nodes, edges, opts = {}) {
    this.o = { theta: 0.85, charge: -220, linkDistance: 70, linkStrength: 0.5, gravity: 0.04, collide: true, alphaDecay: 0.0228, alphaMin: 0.001, velocityDecay: 0.55, ...opts };
    this.nodes = nodes;
    this._byId = new Map(nodes.map(n => [n.id, n]));
    this.edges = edges.filter(e => this._byId.has(e.source) && this._byId.has(e.target) && e.source !== e.target);
    nodes.forEach((n, i) => { n._i = i; n.mass = Math.max(1, (n.r || 8) ** 2 / 30); if (!isFinite(n.x)) n.x = 0; if (!isFinite(n.y)) n.y = 0; n.vx = n.vx || 0; n.vy = n.vy || 0; n.ax = 0; n.ay = 0; });
    this.alpha = 1;
    this._ready = false;
  }
  reheat(alpha = 1) { this.alpha = Math.max(this.alpha, alpha); }
  /** One velocity-Verlet step (dt = 1): x uses a(t) + v(t); then a(t+dt) is computed once and v is updated
   *  from the average of a(t) and a(t+dt) (a(t) was cached on each node by the previous step). */
  step() {
    const o = this.o, nodes = this.nodes, alpha = this.alpha;
    if (!this._ready) {
      const a0 = this._computeAccel(alpha);
      for (let i = 0; i < nodes.length; i++) { nodes[i].ax = a0[i].x; nodes[i].ay = a0[i].y; }
      this._ready = true;
    }
    for (const n of nodes) {
      if (n.pinned) { n.vx = 0; n.vy = 0; continue; }
      n.x += n.vx + 0.5 * n.ax; n.y += n.vy + 0.5 * n.ay;
    }
    const next = this._computeAccel(alpha);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]; if (n.pinned) { n.ax = next[i].x; n.ay = next[i].y; continue; }
      n.vx = (n.vx + 0.5 * (n.ax + next[i].x)) * o.velocityDecay;
      n.vy = (n.vy + 0.5 * (n.ay + next[i].y)) * o.velocityDecay;
      n.ax = next[i].x; n.ay = next[i].y;
    }
    if (o.collide) this._collide();
    this.alpha *= (1 - o.alphaDecay);
    return this.alpha;
  }
  get settled() { return this.alpha < this.o.alphaMin; }
  _computeAccel(alpha) {
    const o = this.o, nodes = this.nodes;
    const tree = grBuildTree(nodes);
    const acc = this._acc && this._acc.length === nodes.length ? this._acc : (this._acc = nodes.map(() => ({ x: 0, y: 0 })));
    for (let i = 0; i < nodes.length; i++) { acc[i].x = 0; acc[i].y = 0; grApplyCharge(tree, nodes[i], o.theta, o.charge * alpha, acc[i]); }
    for (const e of this.edges) {
      const a = this._byId.get(e.source), b = this._byId.get(e.target);
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
      const L = o.linkDistance * (1 + Math.log10(Math.max(1, e.weight || 1)) * 0.15);
      const f = ((d - L) / d) * o.linkStrength * alpha;
      const fx = dx * f, fy = dy * f;
      if (!a.pinned) { acc[a._i].x += fx * 0.5; acc[a._i].y += fy * 0.5; }
      if (!b.pinned) { acc[b._i].x -= fx * 0.5; acc[b._i].y -= fy * 0.5; }
    }
    for (const n of nodes) { const i = n._i; acc[i].x += -n.x * o.gravity * alpha; acc[i].y += -n.y * o.gravity * alpha; }
    return acc;
  }
  _collide() {
    const nodes = this.nodes, cell = Math.max(16, (this._maxR || 12) * 2.2);
    const grid = new Map();
    const key = (x, y) => (Math.floor(x / cell)) + ',' + (Math.floor(y / cell));
    let maxR = 4;
    for (const n of nodes) { maxR = Math.max(maxR, n.r || 8); const k = key(n.x, n.y); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(n); }
    this._maxR = maxR;
    for (const n of nodes) {
      const gx = Math.floor(n.x / cell), gy = Math.floor(n.y / cell);
      for (let ix = gx - 1; ix <= gx + 1; ix++) for (let iy = gy - 1; iy <= gy + 1; iy++) {
        const arr = grid.get(ix + ',' + iy); if (!arr) continue;
        for (const m of arr) {
          if (m._i <= n._i) continue;
          const dx = m.x - n.x, dy = m.y - n.y, minD = (n.r || 8) + (m.r || 8) + 2;
          let d = Math.hypot(dx, dy);
          if (d >= minD || d < 1e-6) continue;
          const ov = (minD - d) / (d || 1) * 0.5;
          const ox = dx * ov, oy = dy * ov;
          if (!n.pinned) { n.x -= ox; n.y -= oy; }
          if (!m.pinned) { m.x += ox; m.y += oy; }
        }
      }
    }
  }
}
