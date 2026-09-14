/* ============================================================================
 * Task model engine (pure functions, no DOM).
 *
 * Internal record (immutable — edits create new objects, so undo is a pointer swap):
 *   { key, id, name, s, e, dur, ms, type, progress, parent, deps:[{id,type,lag}], assignees, color, bs, be, data, extra }
 *   s / e   integer day numbers, e EXCLUSIVE (a task on Sep 1–Sep 3 has s = Sep 1, e = Sep 4)
 *   ms      milestone: zero-length marker at the END of its day (s === e === day + 1)
 *   dur     working days (milestones 0)
 * ========================================================================== */
const G_TYPES = ['task', 'milestone', 'project'];
const G_LINK_TYPES = ['FS', 'SS', 'FF', 'SF'];
const G_KNOWN = new Set(['id', 'name', 'start', 'end', 'duration', 'progress', 'parent', 'type', 'dependencies', 'assignees', 'assignee', 'color', 'collapsed', 'baselineStart', 'baselineEnd', 'data']);
let __gSeq = 0;
const gNewId = () => 't' + (++__gSeq).toString(36) + Math.random().toString(36).slice(2, 6);

function gNormDeps(v) {
  if (v == null || v === '') return [];
  const list = isStr(v) ? v.split(/[,;]+/).map(s => s.trim()).filter(Boolean) : toArr(v);
  const out = [];
  for (const d of list) {
    if (d == null || d === '') continue;
    const o = isObj(d) ? d : { id: d };
    if (o.id == null || o.id === '') continue;
    const type = String(o.type || 'FS').toUpperCase();
    const dep = { id: String(o.id), type: G_LINK_TYPES.includes(type) ? type : 'FS', lag: Math.round(+o.lag || 0) };
    if (!out.some(x => x.id === dep.id)) out.push(dep);
  }
  return out;
}
function gNormAssignees(v) {
  if (v == null || v === '') return [];
  if (isStr(v)) return v.split(',').map(s => s.trim()).filter(Boolean);
  return toArr(v).filter(a => a != null && a !== '').map(a => (isObj(a) ? a : String(a)));
}
const gAssigneeName = a => (isObj(a) ? String(a.name ?? a.label ?? a.id ?? '') : String(a));

/** Normalise one public task object into an internal record. */
function gNormTask(raw, cal, key) {
  const type = G_TYPES.includes(raw.type) ? raw.type : 'task';
  const ms = type === 'milestone';
  let s = gDay(raw.start);
  const endIn = gDay(raw.end);
  const durIn = raw.duration != null && raw.duration !== '' && !Number.isNaN(+raw.duration) ? Math.max(0, Math.round(+raw.duration)) : null;
  let e;
  if (ms) { const d = s ?? endIn ?? gToday(); s = e = d + 1; }
  else {
    if (s == null) s = endIn != null ? cal.startFor(endIn + 1, Math.max(1, durIn ?? 1)) : gToday();
    if (endIn != null) e = Math.max(s + 1, endIn + 1);
    else e = cal.endFor(s, Math.max(1, durIn ?? 1));
  }
  const extra = {};
  for (const k of Object.keys(raw)) if (!G_KNOWN.has(k)) extra[k] = raw[k];
  let bs = gDay(raw.baselineStart), be = gDay(raw.baselineEnd);
  if (bs == null) bs = be;
  if (be == null) be = bs;
  if (bs != null) { if (ms) bs = be = bs + 1; else be = Math.max(bs + 1, be + 1); }
  return {
    key, id: raw.id ?? key, name: raw.name == null ? '' : String(raw.name), s, e,
    dur: ms ? 0 : Math.max(1, cal.count(s, e)), ms, type,
    progress: clamp(Math.round((+raw.progress || 0) * 10) / 10, 0, 100),
    parent: raw.parent == null || raw.parent === '' ? null : String(raw.parent),
    deps: gNormDeps(raw.dependencies),
    assignees: gNormAssignees(raw.assignees ?? raw.assignee),
    color: raw.color ? String(raw.color) : '',
    bs, be, data: raw.data, extra, collapsed: !!raw.collapsed,
  };
}

/** Normalise a task list: unique keys, valid parents (no loops), deps to existing tasks, tree (DFS) order. */
function gNormalize(list, cal) {
  const seen = new Set();
  let recs = [];
  for (const raw of toArr(list)) {
    if (!isObj(raw)) continue;
    let key = raw.id == null || raw.id === '' ? gNewId() : String(raw.id);
    if (seen.has(key)) key = key + '~' + gNewId();
    seen.add(key);
    recs.push(gNormTask(raw, cal, key));
  }
  const keys = new Set(recs.map(r => r.key));
  recs = recs.map(r => {
    const parent = r.parent != null && keys.has(r.parent) && r.parent !== r.key ? r.parent : null;
    const deps = r.deps.filter(d => d.id !== r.key && keys.has(d.id));
    return parent === r.parent && deps.length === r.deps.length ? r : { ...r, parent, deps };
  });
  return gOrder(recs);
}

/** Depth-first (tree) order, keeping sibling order; breaks parent loops. */
function gOrder(recs) {
  const byKey = new Map(recs.map(r => [r.key, r]));
  const kids = new Map(), roots = [];
  for (const r of recs) {
    if (r.parent != null && byKey.has(r.parent)) { let a = kids.get(r.parent); if (!a) kids.set(r.parent, a = []); a.push(r); }
    else roots.push(r);
  }
  const out = [], done = new Set();
  const visit = r => {
    if (done.has(r.key)) return;
    done.add(r.key); out.push(r);
    const c = kids.get(r.key); if (c) for (const k of c) visit(k);
  };
  roots.forEach(visit);
  if (out.length < recs.length) for (const r of recs) if (!done.has(r.key)) visit(r.parent == null ? r : { ...r, parent: null });
  return out;
}

/** Derived tree structure for a record list in DFS order. */
function gTree(recs) {
  const byKey = new Map(), kids = new Map(), level = new Map(), index = new Map();
  recs.forEach((r, i) => { byKey.set(r.key, r); index.set(r.key, i); });
  for (const r of recs) {
    if (r.parent != null && byKey.has(r.parent)) { let a = kids.get(r.parent); if (!a) kids.set(r.parent, a = []); a.push(r.key); }
    level.set(r.key, r.parent != null && byKey.has(r.parent) ? (level.get(r.parent) ?? 0) + 1 : 0);
  }
  const isSum = k => kids.has(k);
  const leaves = new Map();
  const leavesOf = k => {
    let l = leaves.get(k);
    if (l) return l;
    l = [];
    const walk = x => { const c = kids.get(x); if (!c) l.push(x); else c.forEach(walk); };
    walk(k);
    leaves.set(k, l);
    return l;
  };
  const isAncestor = (a, b) => { for (let p = byKey.get(b)?.parent, g = 0; p != null && g < 1000; p = byKey.get(p)?.parent, g++) if (p === a) return true; return false; };
  /** Index just past the subtree of k (records are in DFS order). */
  const subtreeEnd = k => { const lv = level.get(k); let i = index.get(k) + 1; while (i < recs.length && level.get(recs[i].key) > lv) i++; return i; };
  return { recs, byKey, kids, level, index, isSum, leavesOf, isAncestor, subtreeEnd };
}

/** Summary roll-up: key -> { s, e, progress, dur } (leaves return their own values). */
function gRollup(recs, tree, cal) {
  const pos = new Map();
  for (let i = recs.length - 1; i >= 0; i--) {
    const r = recs[i], ks = tree.kids.get(r.key);
    if (!ks) { pos.set(r.key, { s: r.s, e: r.e, progress: r.progress, dur: r.dur }); continue; }
    let s = Infinity, e = -Infinity, w = 0, acc = 0, all = 0;
    for (const k of ks) {
      const c = pos.get(k);
      if (c.s < s) s = c.s;
      if (c.e > e) e = c.e;
      w += c.dur; acc += c.progress * c.dur; all += c.progress;
    }
    pos.set(r.key, { s, e, progress: Math.round((w ? acc / w : all / ks.length) * 10) / 10, dur: cal.count(s, e) });
  }
  return pos;
}

/* ── dependency graph over leaf tasks (links on summaries apply to all their leaves) ── */
function gGraph(recs, tree, extra) {
  const nodes = [], leafIdx = new Map(), sumIdx = new Map();
  for (const r of recs) if (!tree.isSum(r.key)) { leafIdx.set(r.key, nodes.length); nodes.push({ k: r.key, sum: false }); }
  const edges = [], cons = new Map(), links = [];
  const sumNode = k => {
    let i = sumIdx.get(k);
    if (i == null) {
      sumIdx.set(k, i = nodes.length); nodes.push({ k, sum: true });
      for (const q of tree.leavesOf(k)) edges.push(leafIdx.get(q), i);
    }
    return i;
  };
  const link = (P, T, type, lag) => {
    if (!tree.byKey.has(P) || !tree.byKey.has(T) || P === T || tree.isAncestor(P, T) || tree.isAncestor(T, P)) return false;
    const src = tree.isSum(P) ? sumNode(P) : leafIdx.get(P);
    const targets = tree.isSum(T) ? tree.leavesOf(T) : [T];
    const c = { p: P, t: T, type, lag };
    links.push(c);
    for (const u of targets) {
      edges.push(src, leafIdx.get(u));
      let a = cons.get(u); if (!a) cons.set(u, a = []); a.push(c);
    }
    return true;
  };
  for (const r of recs) for (const d of r.deps) link(d.id, r.key, d.type, d.lag);
  if (extra) link(extra.from, extra.to, extra.type || 'FS', extra.lag || 0);
  const n = nodes.length, adj = Array.from({ length: n }, () => []), indeg = new Int32Array(n);
  for (let i = 0; i < edges.length; i += 2) { adj[edges[i]].push(edges[i + 1]); indeg[edges[i + 1]]++; }
  const order = [], stack = [];
  for (let i = n - 1; i >= 0; i--) if (!indeg[i]) stack.push(i);
  while (stack.length) { const i = stack.pop(); order.push(i); for (const j of adj[i]) if (--indeg[j] === 0) stack.push(j); }
  const cyclic = order.length < n ? [...new Set(nodes.filter((_, i) => indeg[i] > 0).map(x => x.k))] : null;
  return { nodes, leafIdx, sumIdx, adj, order, cons, links, cyclic };
}

/** Boundary `lag` working days after the boundary e (FF / milestone bounds). */
const gFinishBound = (cal, e, lag) => (lag ? cal.add(cal.prev(e - 1), lag) + 1 : e);

/** Earliest start of successor L allowed by constraint c from predecessor position P ({s, e}). */
function gBound(c, P, L, cal) {
  const lag = c.lag || 0;
  switch (c.type) {
    case 'SS': return L.ms ? (lag ? cal.add(cal.next(P.s), lag) : P.s) : cal.add(cal.next(P.s), lag);
    case 'FF': { const req = gFinishBound(cal, P.e, lag); return L.ms ? req : cal.startFor(req, L.dur); }
    case 'SF': { const req = lag ? cal.add(cal.next(P.s), lag) : P.s; return L.ms ? req : cal.startFor(req, L.dur); }
    default: return L.ms ? gFinishBound(cal, P.e, lag) : cal.add(cal.next(P.e), lag);
  }
}

/**
 * Forward push (auto-scheduling): tasks reachable from `changed` (Set of keys, null = all) move later
 * when a dependency requires it. Never pulls tasks earlier. Returns { recs, moved: [keys], cycle }.
 */
function gPush(recs, tree, cal, changed) {
  const G = gGraph(recs, tree);
  if (G.cyclic) return { recs, moved: [], cycle: G.cyclic };
  let affected = null;
  if (changed) {
    affected = new Uint8Array(G.nodes.length);
    const st = [];
    for (const k of changed) for (const l of (tree.isSum(k) ? tree.leavesOf(k) : [k])) {
      const i = G.leafIdx.get(l);
      if (i != null && !affected[i]) { affected[i] = 1; st.push(i); }
    }
    while (st.length) { const i = st.pop(); for (const j of G.adj[i]) if (!affected[j]) { affected[j] = 1; st.push(j); } }
  }
  const cur = new Map(), sumPos = new Map(), moved = [];
  const get = k => cur.get(k) || tree.byKey.get(k);
  for (const i of G.order) {
    const node = G.nodes[i];
    if (node.sum) {
      let s = Infinity, e = -Infinity;
      for (const q of tree.leavesOf(node.k)) { const r = get(q); if (r.s < s) s = r.s; if (r.e > e) e = r.e; }
      sumPos.set(node.k, { s, e });
      continue;
    }
    if (affected && !affected[i]) continue;
    const cs = G.cons.get(node.k);
    if (!cs) continue;
    const L = get(node.k);
    let b = -Infinity;
    for (const c of cs) { const P = tree.isSum(c.p) ? sumPos.get(c.p) : get(c.p); if (P) b = Math.max(b, gBound(c, P, L, cal)); }
    if (b > L.s) { cur.set(node.k, { ...L, s: b, e: L.ms ? b : cal.endFor(b, L.dur) }); moved.push(node.k); }
  }
  return { recs: moved.length ? recs.map(r => cur.get(r.key) || r) : recs, moved, cycle: null };
}

/** Latest finish (or start) of predecessor P allowed by constraint c given successor U's late dates. */
function gLatest(c, P, U, ls, lf, cal) {
  const lag = c.lag || 0;
  switch (c.type) {
    case 'SS': return { s: lag ? cal.add(ls, -lag) : ls };
    case 'SF': return { s: lag ? cal.add(lf, -lag) : lf };
    case 'FF': return { e: lag ? cal.add(cal.prev(lf - 1), -lag) + 1 : lf };
    default: return { e: U.ms ? (lag ? cal.add(cal.prev(ls - 1), -lag) + 1 : ls) : (lag ? cal.add(ls, -lag) : ls) };
  }
}

/**
 * Critical path (backward pass on the current schedule, total slack in working days).
 * Returns { critical: Set(keys), slack: Map(key -> days), links: Set('from>to'), finish, cycle }.
 */
function gCritical(recs, tree, cal, pos) {
  const out = { critical: new Set(), slack: new Map(), links: new Set(), finish: null, cycle: null };
  const G = gGraph(recs, tree);
  if (G.cyclic) { out.cycle = G.cyclic; return out; }
  let finish = -Infinity;
  for (const r of recs) if (!tree.isSum(r.key) && r.e > finish) finish = r.e;
  if (finish === -Infinity) return out;
  out.finish = finish;
  const succOf = new Map();
  for (const [u, cs] of G.cons) for (const c of cs) { let a = succOf.get(c.p); if (!a) succOf.set(c.p, a = []); a.push({ u, c }); }
  const LS = new Map(), LF = new Map(), sumLim = new Map();
  for (let o = G.order.length - 1; o >= 0; o--) {
    const node = G.nodes[G.order[o]];
    if (node.sum) {
      let e = Infinity, s = Infinity;
      for (const { u, c } of succOf.get(node.k) || []) {
        const U = tree.byKey.get(u), r = gLatest(c, null, U, LS.get(u), LF.get(u), cal);
        if (r.e != null) e = Math.min(e, r.e); else s = Math.min(s, r.s);
      }
      sumLim.set(node.k, { e, s, start: pos ? pos.get(node.k)?.s : null });
      continue;
    }
    const r = tree.byKey.get(node.k);
    let lf = finish;
    for (const { u, c } of succOf.get(node.k) || []) {
      const U = tree.byKey.get(u), x = gLatest(c, r, U, LS.get(u), LF.get(u), cal);
      lf = Math.min(lf, x.e != null ? x.e : r.ms ? x.s : cal.endFor(x.s, r.dur));
    }
    for (let a = r.parent, g = 0; a != null && g < 1000; a = tree.byKey.get(a)?.parent, g++) {
      const lim = sumLim.get(a);
      if (!lim) continue;
      if (lim.e < Infinity) lf = Math.min(lf, lim.e);
      if (lim.s < Infinity && (lim.start == null || lim.start === r.s)) lf = Math.min(lf, r.ms ? lim.s : cal.endFor(lim.s, r.dur));
    }
    const ls = r.ms ? lf : cal.startFor(lf, r.dur);
    LF.set(node.k, lf); LS.set(node.k, ls);
    const slack = cal.count(r.s, ls);
    out.slack.set(node.k, slack);
    if (slack <= 0) out.critical.add(node.k);
  }
  // driving (tight) links between critical tasks
  for (const c of G.links) {
    const targets = tree.isSum(c.t) ? tree.leavesOf(c.t) : [c.t];
    const preds = tree.isSum(c.p) ? tree.leavesOf(c.p) : [c.p];
    if (!preds.some(k => out.critical.has(k))) continue;
    const P = tree.isSum(c.p) ? pos?.get(c.p) : tree.byKey.get(c.p);
    if (!P) continue;
    if (targets.some(u => out.critical.has(u) && gBound(c, P, tree.byKey.get(u), cal) >= tree.byKey.get(u).s)) out.links.add(c.p + '>' + c.t);
  }
  return out;
}

/** Why a new link from -> to is not allowed: 'self' | 'hierarchy' | 'exists' | 'cycle' | null (ok). */
function gLinkProblem(recs, tree, from, to) {
  if (from === to) return 'self';
  if (!tree.byKey.has(from) || !tree.byKey.has(to)) return 'self';
  if (tree.isAncestor(from, to) || tree.isAncestor(to, from)) return 'hierarchy';
  if (tree.byKey.get(to).deps.some(d => d.id === from) || tree.byKey.get(from).deps.some(d => d.id === to)) return 'exists';
  return gGraph(recs, tree, { from, to }).cyclic ? 'cycle' : null;
}

/** Snap a start day to the calendar in the direction of travel (milestones snap their day, not their boundary). */
function gSnapStart(rec, s, dir, cal) {
  if (rec.ms) { const d = s - 1; return (cal.isWorking(d) ? d : dir < 0 ? cal.prev(d) : cal.next(d)) + 1; }
  return cal.isWorking(s) ? s : dir < 0 ? cal.prev(s) : cal.next(s);
}
/** Move a record so it starts on s (keeps its working duration). */
const gMoveTo = (rec, s, cal) => (rec.ms ? { ...rec, s, e: s } : { ...rec, s, e: cal.endFor(s, rec.dur) });

/** Internal record -> public task object. */
function gPublic(r, extras = {}) {
  const ms = r.ms;
  const s = extras.s ?? r.s, e = extras.e ?? r.e;
  const o = {
    ...r.extra,
    id: r.id, name: r.name,
    start: gISO(ms ? s - 1 : s), end: gISO(ms ? s - 1 : e - 1),
    duration: extras.dur ?? r.dur, progress: extras.progress ?? r.progress,
    parent: r.parent == null ? null : (extras.parentId ?? r.parent), type: r.type,
    dependencies: r.deps.map(d => ({ ...d, id: extras.idOf ? extras.idOf(d.id) : d.id })),
    assignees: r.assignees.map(a => (isObj(a) ? { ...a } : a)),
  };
  if (r.color) o.color = r.color;
  if (extras.collapsed != null ? extras.collapsed : r.collapsed) o.collapsed = true;
  if (r.bs != null) { o.baselineStart = gISO(ms ? r.bs - 1 : r.bs); o.baselineEnd = gISO(ms ? r.bs - 1 : r.be - 1); }
  if (r.data !== undefined) o.data = r.data;
  return o;
}

/* ── public engine API (also used by the unit tests) ─────────────────── */
function gPrepare(tasks, opts = {}) {
  const cal = opts.calendar instanceof GanttCalendar ? opts.calendar : new GanttCalendar(opts);
  const recs = gNormalize(tasks, cal);
  const tree = gTree(recs);
  return { cal, recs, tree };
}
const gIdOf = tree => k => tree.byKey.get(k)?.id ?? k;

O.gantt = {
  Calendar: GanttCalendar,
  /** calendar({ workingDays, holidays }) -> GanttCalendar */
  calendar: opts => new GanttCalendar(opts),
  /** day('2026-09-12') -> integer day number ; iso(n) -> 'YYYY-MM-DD' */
  day: gDay, iso: gISO, date: gDate,
  /** normalize(tasks, opts) -> tasks with computed start/end/duration and summary roll-ups */
  normalize(tasks, opts = {}) {
    const { cal, recs, tree } = gPrepare(tasks, opts);
    const pos = gRollup(recs, tree, cal), idOf = gIdOf(tree);
    return recs.map(r => gPublic(r, { ...pos.get(r.key), idOf, parentId: r.parent != null ? idOf(r.parent) : null }));
  },
  /**
   * schedule(tasks, { workingDays, holidays, changed: [ids] }) -> tasks
   * Pushes successors so every dependency (FS/SS/FF/SF + lag) holds. Throws on dependency loops.
   */
  schedule(tasks, opts = {}) {
    const { cal, recs, tree } = gPrepare(tasks, opts);
    const res = gPush(recs, tree, cal, opts.changed ? new Set(toArr(opts.changed).map(String)) : null);
    if (res.cycle) throw new Error('Dependency loop: ' + res.cycle.join(', '));
    const t2 = gTree(res.recs), pos = gRollup(res.recs, t2, cal), idOf = gIdOf(t2);
    return res.recs.map(r => gPublic(r, { ...pos.get(r.key), idOf, parentId: r.parent != null ? idOf(r.parent) : null }));
  },
  /** criticalPath(tasks, opts) -> { tasks: [ids], links: [[from, to]], slack: { id: days }, finish: 'YYYY-MM-DD' } */
  criticalPath(tasks, opts = {}) {
    const { cal, recs, tree } = gPrepare(tasks, opts);
    const pos = gRollup(recs, tree, cal), cp = gCritical(recs, tree, cal, pos), idOf = gIdOf(tree);
    if (cp.cycle) throw new Error('Dependency loop: ' + cp.cycle.join(', '));
    const slack = {};
    cp.slack.forEach((v, k) => { slack[idOf(k)] = v; });
    return {
      tasks: recs.filter(r => cp.critical.has(r.key)).map(r => r.id),
      links: [...cp.links].map(s => s.split('>').map(idOf)),
      slack, finish: cp.finish == null ? null : gISO(cp.finish - 1),
    };
  },
  /** findCycle(tasks) -> [ids in a loop] | null */
  findCycle(tasks, opts = {}) {
    const { recs, tree } = gPrepare(tasks, opts);
    const G = gGraph(recs, tree);
    return G.cyclic ? G.cyclic.map(gIdOf(tree)) : null;
  },
};
