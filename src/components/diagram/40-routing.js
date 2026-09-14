/* ============================================================================
 * Orthogonal edge routing that avoids node boxes.
 *   1. Leave each port with a short stub along the port normal.
 *   2. Try cheap pattern routes (straight, L, Z, U) and keep the shortest one that
 *      crosses no obstacle (a uniform spatial hash makes the checks O(1)-ish).
 *   3. Otherwise run A* over a sparse orthogonal visibility grid built from the
 *      obstacle edges near the route (bend penalty, no reversals).
 *   4. Fall back to the pattern with the fewest collisions (very dense regions).
 * ========================================================================== */

class DgHeap {
  constructor() { this.f = []; this.v = []; }
  get size() { return this.f.length; }
  push(f, v) {
    const F = this.f, V = this.v;
    let i = F.length; F.push(f); V.push(v);
    while (i > 0) { const p = (i - 1) >> 1; if (F[p] <= f) break; F[i] = F[p]; V[i] = V[p]; i = p; }
    F[i] = f; V[i] = v;
  }
  pop() {
    const F = this.f, V = this.v, top = V[0], lf = F.pop(), lv = V.pop(), n = F.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && F[c + 1] < F[c]) c++;
        if (F[c] >= lf) break;
        F[i] = F[c]; V[i] = V[c]; i = c;
      }
      F[i] = lf; V[i] = lv;
    }
    return top;
  }
}

const DG_DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const dgDirIndex = (dx, dy) => (dx > 0 ? 0 : dy > 0 ? 1 : dx < 0 ? 2 : 3);

class DgRouter {
  constructor({ margin = 14, cell = 240, bend = 24 } = {}) { this.m = margin; this.cell = cell; this.bend = bend; this.rects = new Map(); this.grid = new Map(); this._stamp = 0; }
  clear() { this.rects.clear(); this.grid.clear(); }
  _keys(r) {
    const c = this.cell, out = [];
    for (let i = Math.floor(r.x / c); i <= Math.floor((r.x + r.w) / c); i++) for (let j = Math.floor(r.y / c); j <= Math.floor((r.y + r.h) / c); j++) out.push(i + ',' + j);
    return out;
  }
  /** Add / move an obstacle (node rect inflated by the margin). */
  set(id, n) {
    this.remove(id);
    const m = this.m, r = { id, x: n.x - m, y: n.y - m, w: n.width + m * 2, h: n.height + m * 2, s: 0 };
    r.keys = this._keys(r);
    for (const k of r.keys) { let s = this.grid.get(k); if (!s) this.grid.set(k, (s = new Set())); s.add(r); }
    this.rects.set(id, r);
  }
  remove(id) {
    const r = this.rects.get(id); if (!r) return;
    for (const k of r.keys) { const s = this.grid.get(k); if (s) { s.delete(r); if (!s.size) this.grid.delete(k); } }
    this.rects.delete(id);
  }
  /** Obstacles intersecting the box. */
  query(x1, y1, x2, y2) {
    const c = this.cell, out = [], st = ++this._stamp;
    for (let i = Math.floor(x1 / c); i <= Math.floor(x2 / c); i++) for (let j = Math.floor(y1 / c); j <= Math.floor(y2 / c); j++) {
      const s = this.grid.get(i + ',' + j); if (!s) continue;
      for (const r of s) if (r.s !== st) { r.s = st; if (r.x < x2 && r.x + r.w > x1 && r.y < y2 && r.y + r.h > y1) out.push(r); }
    }
    return out;
  }
  /** Number of obstacles an axis-aligned segment crosses. */
  hits(a, b, ignore) {
    let n = 0;
    for (const r of this.query(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x) + 0.01, Math.max(a.y, b.y) + 0.01)) if (!(ignore && ignore.has(r.id)) && dgSegHitsRect(a, b, r)) n++;
    return n;
  }
  /**
   * route(pa, pb) -> [points] from port pa {x, y, side} to port pb (both on node borders).
   * opts.ignore: Set of obstacle ids to ignore entirely.
   */
  route(pa, pb, opts = {}) {
    const st = this.m + 8, ig = opts.ignore;
    const [ax, ay] = DG_NORMAL[pa.side] || [0, 1], [bx, by] = DG_NORMAL[pb.side] || [0, -1];
    const s = { x: pa.x + ax * st, y: pa.y + ay * st }, t = { x: pb.x + bx * st, y: pb.y + by * st };
    const dS = dgDirIndex(ax, ay), dT = dgDirIndex(-bx, -by);
    // pattern candidates
    const xsSet = [...new Set([s.x, t.x, (s.x + t.x) / 2])], ysSet = [...new Set([s.y, t.y, (s.y + t.y) / 2])];
    const cands = [];
    if (Math.abs(s.x - t.x) < 0.5 || Math.abs(s.y - t.y) < 0.5) cands.push([s, t]);
    for (const X of xsSet) cands.push([s, { x: X, y: s.y }, { x: X, y: t.y }, t]);
    for (const Y of ysSet) cands.push([s, { x: s.x, y: Y }, { x: t.x, y: Y }, t]);
    let best = null, bestCost = Infinity, fallback = null, fbCost = Infinity;
    for (const c of cands) {
      const full = [pa, ...c, pb];
      const ev = this._eval(full, ig);
      if (ev.cost < fbCost) { fbCost = ev.cost; fallback = full; }
      if (!ev.hits && !ev.bad && ev.cost < bestCost) { bestCost = ev.cost; best = full; }
    }
    if (best) return dgSimplify(best);
    const path = this._astar(s, t, dS, dT, ig);
    if (path) return dgSimplify([pa, ...path, pb]);
    return dgSimplify(fallback || [pa, s, t, pb]);
  }
  /** Cost of a candidate: length + bends; flags reversals (bad) and obstacle hits (middle segments only). */
  _eval(pts, ig) {
    let len = 0, bends = 0, hits = 0, bad = false, pd = -1;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue;
      const d = dgDirIndex(Math.abs(dx) < 0.01 ? 0 : dx, Math.abs(dy) < 0.01 ? 0 : dy);
      if (pd >= 0 && d !== pd) { bends++; if ((d + 2) % 4 === pd) bad = true; }
      pd = d;
      len += Math.abs(dx) + Math.abs(dy);
      if (i > 1 && i < pts.length - 1) hits += this.hits(a, b, ig);
    }
    return { cost: len + bends * this.bend + hits * 5000 + (bad ? 20000 : 0), hits, bad };
  }
  _astar(s, t, dS, dT, ig) {
    for (const ext of [160, 640]) {
      const x1 = Math.min(s.x, t.x) - ext, y1 = Math.min(s.y, t.y) - ext, x2 = Math.max(s.x, t.x) + ext, y2 = Math.max(s.y, t.y) + ext;
      const obs = this.query(x1, y1, x2, y2).filter(r => !(ig && ig.has(r.id)));
      if (obs.length > 180) return null;
      const xs = [s.x, t.x, x1, x2], ys = [s.y, t.y, y1, y2];
      for (const r of obs) { xs.push(r.x, r.x + r.w); ys.push(r.y, r.y + r.h); }
      const X = [...new Set(xs.map(v => Math.round(v * 10) / 10))].sort((a, b) => a - b);
      const Y = [...new Set(ys.map(v => Math.round(v * 10) / 10))].sort((a, b) => a - b);
      const nx = X.length, ny = Y.length;
      const inside = (x, y) => { for (const r of obs) if (x > r.x + 0.5 && x < r.x + r.w - 0.5 && y > r.y + 0.5 && y < r.y + r.h - 0.5) return true; return false; };
      const si = X.indexOf(Math.round(s.x * 10) / 10), sj = Y.indexOf(Math.round(s.y * 10) / 10);
      const ti = X.indexOf(Math.round(t.x * 10) / 10), tj = Y.indexOf(Math.round(t.y * 10) / 10);
      const ok = new Uint8Array(nx * ny);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) ok[j * nx + i] = inside(X[i], Y[j]) ? 0 : 1;
      ok[sj * nx + si] = 1; ok[tj * nx + ti] = 1;
      const N = nx * ny * 4, g = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
      const heap = new DgHeap(), bend = this.bend;
      const hFn = (i, j) => Math.abs(X[i] - t.x) + Math.abs(Y[j] - t.y);
      const s0 = (sj * nx + si) * 4 + dS;
      g[s0] = 0; heap.push(hFn(si, sj), s0);
      let goal = -1, goalCost = Infinity;
      while (heap.size) {
        const cur = heap.pop();
        if (closed[cur]) continue;
        closed[cur] = 1;
        const d = cur & 3, cell = cur >> 2, i = cell % nx, j = (cell / nx) | 0, gc = g[cur];
        if (gc + hFn(i, j) >= goalCost) break;
        if (i === ti && j === tj) {
          const fin = gc + (d === dT ? 0 : (d + 2) % 4 === dT ? 1e6 : bend);
          if (fin < goalCost) { goalCost = fin; goal = cur; }
          continue;
        }
        for (let nd = 0; nd < 4; nd++) {
          if ((nd + 2) % 4 === d) continue; // no reversal
          const ni = i + DG_DIRS[nd][0], nj = j + DG_DIRS[nd][1];
          if (ni < 0 || nj < 0 || ni >= nx || nj >= ny || !ok[nj * nx + ni]) continue;
          if (inside((X[i] + X[ni]) / 2, (Y[j] + Y[nj]) / 2)) continue;
          const ns = (nj * nx + ni) * 4 + nd;
          const cost = gc + Math.abs(X[ni] - X[i]) + Math.abs(Y[nj] - Y[j]) + (nd === d ? 0 : bend);
          if (cost < g[ns]) { g[ns] = cost; prev[ns] = cur; heap.push(cost + hFn(ni, nj), ns); }
        }
      }
      if (goal >= 0) {
        const out = [];
        for (let c = goal; c >= 0; c = prev[c]) { const cell = c >> 2; out.push({ x: X[cell % nx], y: Y[(cell / nx) | 0] }); }
        return out.reverse();
      }
    }
    return null;
  }
}
O.diagram.Router = DgRouter;
