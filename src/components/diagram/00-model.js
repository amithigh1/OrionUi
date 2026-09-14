/* ============================================================================
 * Orion diagrams — model layer: strings, ids, value normalisation, history and
 * the shape registry. Every file of this folder shares one function scope:
 *   00-model  05-kit (viewport/export, shared with orgchart + graph)  10-geometry
 *   20-render  30-interact  40-routing  50-layout  60-panels  90-element  95-workflow
 * ========================================================================== */

i18n.add('en', {
  diagram: {
    label: 'Diagram', summary: 'Diagram with {nodes} shapes and {edges} connections.',
    help: 'Tab moves between shapes. Arrow keys move the selection (Shift for bigger steps), Enter edits the label, Delete removes it, Shift+F10 opens the action menu, Ctrl+Z undoes.',
    shapesList: 'Shapes', edgesList: 'Connections', untitled: 'Untitled', connectsTo: 'connects to {list}', noLinks: 'not connected',
    edgeDesc: '{from} to {to}', edgeDescLabel: '{from} to {to}: {label}', shapeDesc: '{label}, {shape}',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Zoom to fit', actual: 'Reset zoom to 100%', zoomBar: 'Zoom',
    undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', duplicate: 'Duplicate', delete: 'Delete', selectAll: 'Select all',
    editLabel: 'Edit label', connectTo: 'Connect to…', disconnect: 'Disconnect from…', bringFront: 'Bring to front', sendBack: 'Send to back',
    group: 'Group', ungroup: 'Ungroup', layout: 'Auto layout', layeredTB: 'Layered, top to bottom', layeredLR: 'Layered, left to right',
    treeTB: 'Tree, top to bottom', treeLR: 'Tree, left to right', export: 'Export', import: 'Import JSON', exportJSON: 'Export JSON',
    exportSVG: 'Export SVG', exportPNG: 'Export PNG', actions: 'Diagram actions', toolbar: 'Diagram toolbar', more: 'More',
    palette: 'Shapes', paletteHint: 'Drag a shape onto the canvas, or press Enter to add it.', properties: 'Properties', showProps: 'Properties',
    noSelection: 'Select a shape or connection to edit it.', multiple: '{count} items selected', canvas: 'Canvas',
    labelText: 'Label', shape: 'Shape', fill: 'Fill', stroke: 'Line color', textColor: 'Text color', fontSize: 'Font size', dashed: 'Dashed',
    animated: 'Animated', edgeType: 'Line type', arrow: 'Arrows', position: 'Position', size: 'Size', x: 'X', y: 'Y', w: 'W', h: 'H',
    style: 'Style', reset: 'Reset', grid: 'Grid', snap: 'Snap to grid', minimap: 'Minimap', gridSize: 'Grid size',
    types: { orthogonal: 'Orthogonal', straight: 'Straight', curve: 'Curved' },
    arrows: { end: 'Arrow at end', both: 'Arrows at both ends', start: 'Arrow at start', none: 'No arrows' },
    presets: { default: 'Default', primary: 'Blue', success: 'Green', warning: 'Amber', danger: 'Red', info: 'Teal', secondary: 'Gray', dark: 'Dark' },
    shapes: {
      rect: 'Rectangle', rounded: 'Process', ellipse: 'Ellipse', circle: 'Circle', diamond: 'Decision', parallelogram: 'Input / output',
      cylinder: 'Database', document: 'Document', hexagon: 'Preparation', note: 'Note', image: 'Image', html: 'HTML', text: 'Text', terminator: 'Start / end',
    },
    newShape: 'New shape', searchShapes: 'Find a shape…', noShapes: 'No matching shapes', notAllowed: 'This connection is not allowed',
    moved: { one: 'Moved {count} shape', other: 'Moved {count} shapes' }, deleted: { one: 'Deleted {count} item', other: 'Deleted {count} items' },
    added: 'Added {label}', connected: 'Connected {from} to {to}', undone: 'Undone: {action}', redone: 'Redone: {action}', nothing: 'Nothing to undo',
    copied: { one: 'Copied {count} item', other: 'Copied {count} items' }, pasted: { one: 'Pasted {count} item', other: 'Pasted {count} items' },
    selected: { one: '{count} selected', other: '{count} selected' }, laidOut: 'Layout applied', grouped: 'Grouped', ungrouped: 'Ungrouped',
    importFailed: 'That file is not a valid diagram', zoomLevel: 'Zoom {pct}',
  },
});

let __dgSeq = 0;
/** Unique id for new nodes / edges: dgId('n') -> "n1k3f9" */
const dgId = (p = 'n') => p + (++__dgSeq).toString(36) + Math.random().toString(36).slice(2, 6);

/** Port sides: unit normals pointing out of the shape. */
const DG_NORMAL = { t: [0, -1], r: [1, 0], b: [0, 1], l: [-1, 0] };
const DG_SIDE_ALIAS = { top: 't', right: 'r', bottom: 'b', left: 'l', t: 't', r: 'r', b: 'b', l: 'l', n: 't', e: 'r', s: 'b', w: 'l' };
const DG_EDGE_TYPES = ['orthogonal', 'straight', 'curve'];
const DG_ARROWS = ['end', 'both', 'start', 'none'];

/** Shape registry: name -> { size:[w,h], path(w,h,node), extra?(w,h), text?(w,h), boundary?, ports?(w,h), render?(node, g, ctx), ratio? } */
const DG_SHAPES = Object.create(null);
function dgShape(name, def) { DG_SHAPES[name] = def; return def; }

/** Node style presets (token based so they follow light / dark mode). */
const DG_PRESETS = {
  default: {},
  primary: { fill: 'var(--o-primary-subtle)', stroke: 'var(--o-primary)', textColor: 'var(--o-primary-text)' },
  success: { fill: 'var(--o-success-subtle)', stroke: 'var(--o-success)', textColor: 'var(--o-success-text)' },
  warning: { fill: 'var(--o-warning-subtle)', stroke: 'var(--o-warning)', textColor: 'var(--o-warning-text)' },
  danger: { fill: 'var(--o-danger-subtle)', stroke: 'var(--o-danger)', textColor: 'var(--o-danger-text)' },
  info: { fill: 'var(--o-info-subtle)', stroke: 'var(--o-info)', textColor: 'var(--o-info-text)' },
  secondary: { fill: 'var(--o-surface-3)', stroke: 'var(--o-secondary)', textColor: 'var(--o-text)' },
  dark: { fill: 'var(--o-dark)', stroke: 'var(--o-dark)', textColor: 'var(--o-on-dark)' },
};

/** Normalise one node (keeps unknown keys so user data round-trips). */
function dgNormNode(n, shapes) {
  n = isObj(n) ? n : {};
  const type = n.type || 'rounded';
  const def = (shapes && shapes[type]) || DG_SHAPES[type] || DG_SHAPES.rounded;
  const [dw, dh] = def.size || [140, 64];
  const out = { ...n, id: n.id != null && n.id !== '' ? String(n.id) : dgId('n'), type, x: +n.x || 0, y: +n.y || 0, width: Math.max(8, +n.width || dw), height: Math.max(8, +n.height || dh), label: n.label == null ? '' : String(n.label) };
  if (isObj(n.style)) out.style = { ...n.style }; else delete out.style;
  if (Array.isArray(n.ports)) out.ports = n.ports.map((p, i) => ({ ...p, id: p.id != null ? String(p.id) : 'p' + i }));
  return out;
}
/** Normalise one edge. Accepts {from,to} or {source,target}. */
function dgNormEdge(e, defaults = {}) {
  e = isObj(e) ? e : {};
  const out = { ...e, id: e.id != null && e.id !== '' ? String(e.id) : dgId('e'), from: String(e.from ?? e.source ?? ''), to: String(e.to ?? e.target ?? '') };
  delete out.source; delete out.target;
  out.type = DG_EDGE_TYPES.includes(e.type) ? e.type : (defaults.type || 'orthogonal');
  out.arrow = DG_ARROWS.includes(e.arrow) ? e.arrow : (defaults.arrow || 'end');
  if (e.fromPort != null) out.fromPort = String(e.fromPort); else delete out.fromPort;
  if (e.toPort != null) out.toPort = String(e.toPort); else delete out.toPort;
  if (e.label == null) delete out.label; else out.label = String(e.label);
  return out;
}
/** { nodes, edges } from anything (object, JSON string, null). Duplicate ids are renamed. */
function dgNormValue(v, shapes, defaults) {
  if (isStr(v)) v = parseJSON(v, {});
  v = isObj(v) ? v : {};
  const seen = new Set();
  const nodes = toArr(v.nodes).map(n => { const o = dgNormNode(n, shapes); if (seen.has(o.id)) o.id = dgId('n'); seen.add(o.id); return o; });
  const eseen = new Set();
  const edges = toArr(v.edges).map(e => { const o = dgNormEdge(e, defaults); if (eseen.has(o.id)) o.id = dgId('e'); eseen.add(o.id); return o; });
  return { nodes, edges };
}

/**
 * Snapshot history (JSON strings: immutable and cheap to compare).
 * push(snapshot, label, coalesceKey) — consecutive pushes with the same key inside 1s replace the top entry.
 */
class DgHistory {
  constructor(limit = 100) { this.limit = limit; this.stack = []; this.i = -1; }
  reset(snap) { this.stack = [{ snap, label: '' }]; this.i = 0; }
  push(snap, label = '', key = null) {
    const top = this.stack[this.i];
    if (top && top.snap === snap) return false;
    const now = Date.now();
    if (key && top && top.key === key && now - top.t < 1000 && this.i > 0) { top.snap = snap; top.t = now; this.stack.length = this.i + 1; return true; }
    this.stack.length = this.i + 1;
    this.stack.push({ snap, label, key, t: now });
    if (this.stack.length > this.limit) this.stack.shift();
    this.i = this.stack.length - 1;
    return true;
  }
  get canUndo() { return this.i > 0; }
  get canRedo() { return this.i < this.stack.length - 1; }
  undo() { if (!this.canUndo) return null; const label = this.stack[this.i].label; this.i--; return { snap: this.stack[this.i].snap, label }; }
  redo() { if (!this.canRedo) return null; this.i++; return { snap: this.stack[this.i].snap, label: this.stack[this.i].label }; }
}

/** Copy methods AND accessors of mixin objects onto a class prototype. */
function dgMixin(Cls, ...mixins) {
  for (const m of mixins) Object.defineProperties(Cls.prototype, Object.getOwnPropertyDescriptors(m));
  return Cls;
}

/** Private icon set for the diagram UI (falls back when the icons package doesn't provide a name). */
const DG_ICONS = {
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  'bring-front': '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>',
  'send-back': '<rect x="4" y="4" width="12" height="12" rx="2" stroke-dasharray="3 2"/><path d="M20 8v10a2 2 0 0 1-2 2H8"/>',
  group: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M3 14v5a2 2 0 0 0 2 2h5M21 10V5a2 2 0 0 0-2-2h-5"/>',
  ungroup: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
  layout: '<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5M5 17v-2a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v2"/>',
  fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
  play: '<path d="m6 3 14 9-14 9z"/>', stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  'git-branch': '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10M18 9a6 6 0 0 1-6 6H6"/>',
  'check-square': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 12 3 3 5-6"/>',
  split: '<path d="M12 3v6M12 9 6 15v6M12 9l6 6v6"/>', merge: '<path d="M6 3v6l6 6v6M18 3v6l-6 6"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>', mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>', flag: '<path d="M4 22V4M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1"/>',
  square: '<rect x="4" y="4" width="16" height="16" rx="3"/>', snowflake: '<path d="M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9"/>',
  pin: '<path d="M12 17v5M9 3h6l-1 7 4 4H6l4-4z"/>', crosshair: '<circle cx="12" cy="12" r="9"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M1 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1M17 3.5a4 4 0 0 1 0 8M23 21v-1a6 6 0 0 0-4-5.6"/>',
};
/** dgIcon(name, cls) -> SafeHTML <svg>. Uses the global registry first, then DG_ICONS. */
function dgIcon(name, cls = '') {
  if (O.icons?.has(name)) return icon(name, cls ? { class: cls } : {});
  const body = DG_ICONS[name] || '';
  return raw(`<svg class="o-icon o-icon-${esc(name)}${cls ? ' ' + esc(cls) : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`);
}
