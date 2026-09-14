/* ── item / group model (pure functions, no DOM) ──────────────────────────
 * Internal item record:
 *   { key, id, content, start (ms), end (ms|null), type, group (key|null),
 *     className, color, editable, selectable, title, extra, data }
 * Internal group record:
 *   { key, id, content, className, order, nested:[childKey,...], collapsed, visible, height, extra, data }
 * ========================================================================== */
const TV_TYPES = ['range', 'point', 'background'];
const TV_KNOWN_ITEM = new Set(['id', 'content', 'start', 'end', 'group', 'type', 'className', 'color', 'editable', 'selectable', 'title', 'data']);
const TV_KNOWN_GROUP = new Set(['id', 'content', 'className', 'order', 'nested', 'nestedGroups', 'collapsed', 'visible', 'height', 'data']);
let __tvSeq = 0;
const tvNewId = () => 'i' + (++__tvSeq).toString(36) + Math.random().toString(36).slice(2, 6);

/** Any date-like value -> epoch ms (null when invalid/empty). */
function tvMs(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(+v) ? null : +v;
  if (isNum(v)) return v;
  const d = date.parse(v);
  return d ? +d : null;
}
/** epoch ms -> Date (public items expose real Date instances, useful at any granularity). */
const tvDate = ms => (ms == null ? null : new Date(ms));

/** Normalise one public item into an internal record. */
function tvNormItem(raw, key) {
  const type = TV_TYPES.includes(raw.type) ? raw.type : (raw.end != null && raw.end !== '' ? 'range' : 'point');
  let start = tvMs(raw.start);
  let end = raw.end != null && raw.end !== '' ? tvMs(raw.end) : null;
  if (start == null) start = end ?? Date.now();
  if (type === 'point') end = null;
  else { if (end == null) end = start + TV_MS.h; if (end <= start) end = start + 60000; }
  const extra = {};
  for (const k of Object.keys(raw)) if (!TV_KNOWN_ITEM.has(k)) extra[k] = raw[k];
  return {
    key, id: raw.id ?? key, content: raw.content ?? '', start, end, type,
    group: raw.group == null || raw.group === '' ? null : String(raw.group),
    className: raw.className ? String(raw.className) : '', color: raw.color ? String(raw.color) : '',
    editable: raw.editable === true || raw.editable === false ? raw.editable : undefined,
    selectable: raw.selectable === true || raw.selectable === false ? raw.selectable : undefined,
    title: raw.title != null ? String(raw.title) : '', extra, data: raw.data,
  };
}
/** Normalise one public group into an internal record. */
function tvNormGroup(raw, key, i) {
  const nested = toArr(raw.nested || raw.nestedGroups).map(String);
  const extra = {};
  for (const k of Object.keys(raw)) if (!TV_KNOWN_GROUP.has(k)) extra[k] = raw[k];
  return {
    key, id: raw.id ?? key, content: raw.content ?? String(raw.id ?? key), className: raw.className ? String(raw.className) : '',
    order: raw.order != null ? +raw.order : i, nested, collapsed: !!raw.collapsed, visible: raw.visible !== false,
    height: raw.height != null ? +raw.height : null, extra, data: raw.data,
  };
}
/**
 * Normalise items + groups: unique keys, valid group refs, group display order (parents before
 * their nested children, depth-first). Items whose `group` doesn't match a known group fall back
 * to the implicit ungrouped lane (group: null).
 */
function tvNormalize(itemsIn, groupsIn) {
  const gseen = new Set(); let grecs = [];
  for (const raw of toArr(groupsIn)) {
    if (!isObj(raw)) continue;
    let key = raw.id == null || raw.id === '' ? tvNewId() : String(raw.id);
    if (gseen.has(key)) key += '~' + tvNewId();
    gseen.add(key);
    grecs.push(tvNormGroup(raw, key, grecs.length));
  }
  const gkeys = new Set(grecs.map(g => g.key));
  grecs = grecs.map(g => (g.nested.length ? { ...g, nested: g.nested.filter(k => gkeys.has(k) && k !== g.key) } : g));
  const byKey = new Map(grecs.map(g => [g.key, g]));
  const childOf = new Map();
  for (const g of grecs) for (const c of g.nested) if (!childOf.has(c)) childOf.set(c, g.key);
  const roots = grecs.filter(g => childOf.get(g.key) == null).sort((a, b) => a.order - b.order);
  const ordered = [], level = new Map(), parentOf = new Map();
  const visit = (g, lv, parent) => {
    if (level.has(g.key)) return; // guard against cycles
    ordered.push(g); level.set(g.key, lv); parentOf.set(g.key, parent);
    const kids = g.nested.map(k => byKey.get(k)).filter(Boolean).sort((a, b) => a.order - b.order);
    for (const c of kids) visit(c, lv + 1, g.key);
  };
  roots.forEach(g => visit(g, 0, null));
  for (const g of grecs) if (!level.has(g.key)) visit(g, 0, null); // orphaned cycle members
  const iseen = new Set(); let irecs = [];
  for (const raw of toArr(itemsIn)) {
    if (!isObj(raw)) continue;
    let key = raw.id == null || raw.id === '' ? tvNewId() : String(raw.id);
    if (iseen.has(key)) key += '~' + tvNewId();
    iseen.add(key);
    irecs.push(tvNormItem(raw, key));
  }
  irecs = irecs.map(r => (r.group != null && !gkeys.has(r.group) ? { ...r, group: null } : r));
  return { items: irecs, groups: ordered, level, parentOf, hasGroups: !!ordered.length };
}
/** Overall time bounds of a record list (null when empty). */
function tvExtent(recs) {
  let mn = Infinity, mx = -Infinity;
  for (const r of recs) { if (r.start < mn) mn = r.start; const e = r.end ?? r.start; if (e > mx) mx = e; }
  return mn === Infinity ? null : { min: mn, max: mx };
}
/** Internal item record -> public item object. */
function tvPublicItem(r) {
  const o = { ...r.extra, id: r.id, content: r.content, start: tvDate(r.start), type: r.type, group: r.group };
  if (r.type !== 'point') o.end = tvDate(r.end);
  if (r.className) o.className = r.className;
  if (r.color) o.color = r.color;
  if (r.editable !== undefined) o.editable = r.editable;
  if (r.selectable !== undefined) o.selectable = r.selectable;
  if (r.title) o.title = r.title;
  if (r.data !== undefined) o.data = r.data;
  return o;
}
/** Internal group record -> public group object. */
function tvPublicGroup(g) {
  const o = { ...g.extra, id: g.id, content: g.content };
  if (g.className) o.className = g.className;
  if (g.nested.length) o.nested = g.nested.map(String);
  if (g.collapsed) o.collapsed = true;
  if (g.height != null) o.height = g.height;
  if (g.data !== undefined) o.data = g.data;
  return o;
}
