/* ============================================================================
 * <o-orgchart> — tidy-tree organization chart from a flat list of people.
 *   <o-orgchart direction="TB" compact collapsible search draggable></o-orgchart>
 *   el.nodes = [{ id, parentId, name, title, department, avatar, email, badge, color, data }]
 * Built on the shared diagram kit (Orion.diagram.Viewport / .layout.tree / .exportSVG / .svgToPNG / .bounds).
 * @deps diagram
 * ========================================================================== */

i18n.add('en', {
  orgchart: {
    label: 'Organization chart', summary: 'Organization chart with {count} people.',
    help: 'Arrow keys move between manager, reports and siblings. Enter selects. Space toggles a subtree. Ctrl+F searches.',
    searchPlaceholder: 'Find a person…', noResults: 'No matches', clearSearch: 'Clear search',
    reports: '{count} direct report', reports_plural: '{count} direct reports',
    expand: 'Expand', collapse: 'Collapse', expandAll: 'Expand all', collapseAll: 'Collapse all',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Zoom to fit', zoomBar: 'Zoom', actual: 'Reset zoom to 100%',
    exportSVG: 'Export SVG', exportPNG: 'Export PNG', export: 'Export', more: 'More',
    focused: 'Focused on {name}', reassignNotAllowed: 'That reassignment is not allowed',
    reassigned: '{name} now reports to {manager}', untitled: 'Untitled', noManager: 'No manager',
  },
});

const OC_ICONS = {
  users: '<circle cx="9" cy="8" r="4"/><path d="M1 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1M17 3.5a4 4 0 0 1 0 8M23 21v-1a6 6 0 0 0-4-5.6"/>',
  crosshair: '<circle cx="12" cy="12" r="9"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
  fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
};
/** ocIcon(name, cls) -> SafeHTML <svg>. Global registry first, tiny private fallback second. */
function ocIcon(name, cls = '') {
  if (O.icons?.get(name)) return icon(name, cls ? { class: cls } : {});
  const body = OC_ICONS[name] || '';
  return raw(`<svg class="o-icon o-icon-${esc(name)}${cls ? ' ' + esc(cls) : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`);
}

/** Rounded elbow path through axis-aligned points. */
function ocElbow(pts, r = 7) {
  if (pts.length < 3) return `M${pts[0].x} ${pts[0].y}L${pts[1].x} ${pts[1].y}`;
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
    const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1, l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const ax = p1.x + (p0.x - p1.x) * rr / l1, ay = p1.y + (p0.y - p1.y) * rr / l1;
    const bx = p1.x + (p2.x - p1.x) * rr / l2, by = p1.y + (p2.y - p1.y) * rr / l2;
    d += `L${ax.toFixed(1)} ${ay.toFixed(1)}Q${p1.x.toFixed(1)} ${p1.y.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`;
  }
  const z = pts[pts.length - 1];
  return d + `L${z.x} ${z.y}`;
}
/** Elbow connector between a parent rect and a child rect ("family bracket" style). */
function ocLink(direction, p, c, gap) {
  if (direction === 'LR' || direction === 'RL') {
    const px = direction === 'LR' ? p.x + p.width : p.x, py = p.y + p.height / 2;
    const cx = direction === 'LR' ? c.x : c.x + c.width, cy = c.y + c.height / 2;
    const midX = direction === 'LR' ? px + gap / 2 : px - gap / 2;
    return ocElbow([{ x: px, y: py }, { x: midX, y: py }, { x: midX, y: cy }, { x: cx, y: cy }]);
  }
  const px = p.x + p.width / 2, py = direction === 'BT' ? p.y : p.y + p.height;
  const cx = c.x + c.width / 2, cy = direction === 'BT' ? c.y + c.height : c.y;
  const midY = direction === 'BT' ? py - gap / 2 : py + gap / 2;
  return ocElbow([{ x: px, y: py }, { x: px, y: midY }, { x: cx, y: midY }, { x: cx, y: cy }]);
}

/** Normalise a flat node into a stable-id record; unknown extra keys pass through as `data`. */
function ocNorm(n, i) {
  n = isObj(n) ? n : {};
  const id = n.id != null && n.id !== '' ? String(n.id) : 'oc' + i;
  const parentId = n.parentId == null || n.parentId === '' ? null : String(n.parentId);
  return { id, parentId, name: n.name || '', title: n.title || '', department: n.department || '', avatar: n.avatar || '', email: n.email || '', badge: n.badge || '', color: n.color || '', data: n.data };
}
