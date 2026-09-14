/* ── dependency arrows: orthogonal routing with rounded corners ──────── */

/**
 * Orthogonal route between two bar anchors (logical x: 0 = timeline start).
 *   d1  exit direction at the source (+1 towards later dates, -1 towards earlier)
 *   d2  travel direction entering the target (+1 = arrow points to later dates)
 * Returns [[x, y], …] (3 or 5 segments).
 */
function gRoute(x1, y1, d1, x2, y2, d2, rowH, g = 10) {
  const pts = [[x1, y1]];
  if (d1 === d2) {
    const xm = x1 + d1 * g;
    if (d1 * (x2 - xm) >= g && Math.abs(y2 - y1) > 0.5) pts.push([xm, y1], [xm, y2]);
    else if (Math.abs(y2 - y1) <= 0.5 && d1 * (x2 - x1) > 0) { /* straight */ }
    else {
      const ym = Math.abs(y2 - y1) <= 0.5 ? y1 + rowH / 2 : y2 > y1 ? y2 - rowH / 2 : y2 + rowH / 2;
      const xe = x2 - d2 * g;
      pts.push([xm, y1], [xm, ym], [xe, ym], [xe, y2]);
    }
  } else {
    const xm = d1 > 0 ? Math.max(x1, x2) + g : Math.min(x1, x2) - g;
    pts.push([xm, y1], [xm, y2]);
  }
  pts.push([x2, y2]);
  return pts;
}

/** Polyline -> SVG path data with rounded corners; the last point is pulled back by `trim` px. */
function gPathD(pts, r = 5, trim = 0) {
  const p = [];
  for (const q of pts) { const l = p[p.length - 1]; if (!l || Math.abs(l[0] - q[0]) > 0.01 || Math.abs(l[1] - q[1]) > 0.01) p.push([q[0], q[1]]); }
  if (p.length < 2) return '';
  if (trim) {
    const a = p[p.length - 2], b = p[p.length - 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > trim) { b[0] -= (b[0] - a[0]) / len * trim; b[1] -= (b[1] - a[1]) / len * trim; }
  }
  const f = v => Math.round(v * 10) / 10;
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 1; i < p.length - 1; i++) {
    const [x0, y0] = p[i - 1], [x, y] = p[i], [x1, y1] = p[i + 1];
    const l0 = Math.hypot(x - x0, y - y0), l1 = Math.hypot(x1 - x, y1 - y), rr = Math.min(r, l0 / 2, l1 / 2);
    if (rr < 0.5) { d += `L${f(x)},${f(y)}`; continue; }
    d += `L${f(x - (x - x0) / l0 * rr)},${f(y - (y - y0) / l0 * rr)}Q${f(x)},${f(y)} ${f(x + (x1 - x) / l1 * rr)},${f(y + (y1 - y) / l1 * rr)}`;
  }
  const z = p[p.length - 1];
  return d + `L${f(z[0])},${f(z[1])}`;
}

/** Arrow head (filled triangle) with its tip at (x, y): dir 'right' | 'left' | 'down' | 'up'. */
function gArrowD(x, y, dir, s = 5) {
  const l = s * 1.3;
  if (dir === 'down' || dir === 'up') { const k = dir === 'down' ? -1 : 1; return `M${x},${y}L${x - s},${y + k * l}L${x + s},${y + k * l}Z`; }
  const k = dir === 'left' ? 1 : -1;
  return `M${x},${y}L${x + k * l},${y - s}L${x + k * l},${y + s}Z`;
}

/**
 * Route one dependency between anchors A (predecessor) and B (successor):
 *   anchors { xs, xe, y, ms, cx, half }. Links that end on a milestone right below/above the
 *   predecessor's edge drop straight onto the diamond.
 * Returns { pts, tip: [x, y], dir }.
 */
function gLinkRoute(type, A, B, rowH) {
  const fromStart = type === 'SS' || type === 'SF', toEnd = type === 'FF' || type === 'SF';
  const x1 = fromStart ? A.xs : A.xe;
  if (B.ms && !toEnd && Math.abs(B.cx - x1) <= 14 && Math.abs(B.y - A.y) > 1) {
    const down = B.y > A.y, ty = down ? B.y - B.half : B.y + B.half;
    return { pts: [[x1, A.y], [B.cx, A.y], [B.cx, ty]], tip: [B.cx, ty], dir: down ? 'down' : 'up' };
  }
  const x2 = toEnd ? B.xe : B.xs, d2 = toEnd ? -1 : 1;
  return { pts: gRoute(x1, A.y, fromStart ? -1 : 1, x2, B.y, d2, rowH, 10), tip: [x2, B.y], dir: d2 > 0 ? 'right' : 'left' };
}
