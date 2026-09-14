/* Orion user data — per-user, persisted, cross-tab synced stores.
 *   Orion.userdata.setUser('u42')  (namespace; follows Orion.auth.setUser automatically unless set explicitly) · .user · configure({ storage }) · export() · import(data) · clear()
 *   Orion.recent.add({ id, title, url, icon, type, meta }) · list({ type, limit }) · remove(id) · clear(type?)          (dedupe, newest first, max)
 *   Orion.favorites.toggle(item) -> bool · add · remove(id) · has(id) · list() · reorder(ids) · move(id, delta) · update(id, patch)
 *   Orion.searchHistory.add(query, scope) · list(scope, limit) -> [{ query, time }] · remove(query, scope) · clear(scope?)
 *   Orion.viewed.track(item) · list({ type, limit }) · remove · clear      <article data-o-track-view='{"id":7,"title":"Invoice #7"}'>
 *   Orion.views.save(scope, name, state, { isDefault }) · list(scope) · get(scope, idOrName) · remove · rename · setDefault · getDefault
 *   Orion.prefs.get(key, def) · set(key | {…}, value) · on(key | '*', fn(value, old)) · all() · reset(key?) · toggle(key)
 *   Every store: .onChange(fn({ store, source: 'local'|'remote'|'user' })) -> off()   (bus: 'userdata:change')
 */
i18n.add('en', {
  userdata: {
    addFavorite: 'Add “{title}” to favorites', removeFavorite: 'Remove “{title}” from favorites', favorite: 'Favorite', favorited: 'Favorited',
    added: 'Added “{title}” to favorites', removed: 'Removed “{title}” from favorites', item: 'item',
    recentEmpty: 'Nothing here yet', favoritesEmpty: 'No favorites yet. Star items to pin them here.', remove: 'Remove “{title}”',
    clearAll: 'Clear all', moved: '“{title}” moved to position {pos} of {total}', reorderHint: 'Alt + arrow keys to reorder',
    views: 'Views', savedViews: 'Saved views', viewsEmpty: 'No saved views yet', saveView: 'Save current view', viewName: 'View name',
    save: 'Save', update: 'Update “{name}”', setDefault: 'Set as default', isDefault: 'Default', makeDefault: 'Make “{name}” the default view',
    unsetDefault: 'Remove default', deleteView: 'Delete view “{name}”', applied: 'View “{name}” applied', saved: 'View “{name}” saved',
    deleted: 'View “{name}” deleted', nameRequired: 'Enter a name', justNow: 'just now',
  },
});
if (!O.icons.has('bookmark')) O.icons.add({ bookmark: '<path d="m18 21-6-4-6 4V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/>' });

const UD = { user: 'anon', explicit: false, adapter: null };
const __udEv = new Emitter();
const __udMem = new Map();
const __ukey = s => `orion:ud:${UD.user}:${s}`;
const __same = (a, b) => a != null && b != null && String(a) === String(b);
function __udRead(store, def) {
  const k = __ukey(store);
  let v;
  if (UD.adapter) v = UD.adapter.get(k);
  else { v = ls.get(k, undefined); if (v === undefined && __udMem.has(k)) v = clone(__udMem.get(k)); }
  return v === undefined || v === null || typeof v !== typeof def || Array.isArray(v) !== Array.isArray(def) ? clone(def) : v;
}
function __udWrite(store, data) {
  const k = __ukey(store);
  if (UD.adapter) UD.adapter.set(k, data);
  else if (!ls.set(k, data)) __udMem.set(k, clone(data));
  __udEmit(store, 'local');
  __udCh.post({ store, user: UD.user });
}
function __udEmit(store, source) {
  const d = { store, user: UD.user, source };
  if (store === 'prefs') __prefsDiff();
  __udEv.emit(store, d);
  __udEv.emit('change', d);
  bus.emit('userdata:change', d);
}
/* cross-tab: BroadcastChannel, or 'storage' events on a ping key */
const __udCh = (() => {
  if (!isBrowser) return { post: noop };
  const id = uid('tab'), PING = 'orion:ud:__ping';
  let bc = null;
  try { if (win.BroadcastChannel) { bc = new BroadcastChannel('orion:userdata'); bc.onmessage = e => __udRemote(e.data); } } catch { bc = null; }
  if (!bc) win.addEventListener('storage', e => { if (e.key === PING && e.newValue) { const m = parseJSON(e.newValue, null); if (m && m.from !== id) __udRemote(m.data); } });
  return { post(data) { if (bc) { try { bc.postMessage(data); } catch {} } else { try { localStorage.setItem(PING, JSON.stringify({ from: id, n: Date.now() + Math.random(), data })); } catch {} } } };
})();
function __udRemote(m) { if (m && m.user === UD.user && m.store) __udEmit(m.store, 'remote'); }
const __on = store => fn => __udEv.on(store, fn);

const userdata = {
  get user() { return UD.user; },
  /** setUser(id) — switch the namespace (null = anonymous). */
  setUser(id, { auto = false } = {}) {
    const next = id == null || id === '' ? 'anon' : String(id);
    if (!auto) UD.explicit = id != null;
    if (next === UD.user) return userdata;
    UD.user = next;
    ['recent', 'favorites', 'search', 'viewed', 'views', 'prefs'].forEach(s => __udEmit(s, 'user'));
    return userdata;
  },
  /** configure({ storage: { get(key), set(key, value), del(key) } }) — e.g. a server-synced cache */
  configure({ storage } = {}) { if (storage !== undefined) UD.adapter = storage; return userdata; },
  /** export() -> { recent, favorites, search, viewed, views, prefs } for the current user */
  export() { return { recent: __udRead('recent', []), favorites: __udRead('favorites', []), search: __udRead('search', {}), viewed: __udRead('viewed', []), views: __udRead('views', {}), prefs: __udRead('prefs', {}) }; },
  import(data = {}) { for (const [k, v] of Object.entries(data)) if (['recent', 'favorites', 'search', 'viewed', 'views', 'prefs'].includes(k)) __udWrite(k, v); return userdata; },
  clear() { ['recent', 'favorites', 'search', 'viewed', 'views', 'prefs'].forEach(s => { const k = __ukey(s); if (UD.adapter) UD.adapter.del?.(k); else { ls.del(k); __udMem.delete(k); } __udEmit(s, 'local'); __udCh.post({ store: s, user: UD.user }); }); return userdata; },
  onChange(fn) { return __udEv.on('change', fn); },
};

/* ── recent items & recently viewed (same shape) ─────────────────────── */
function __history(store, max) {
  const api = {
    max,
    add(item) {
      if (!item || (item.id == null && !item.url)) return null;
      const list = __udRead(store, []), id = item.id ?? item.url;
      const i = list.findIndex(x => __same(x.id, id)), prev = i >= 0 ? list.splice(i, 1)[0] : null;
      const entry = { ...prev, ...item, id, time: Date.now(), count: (prev?.count || 0) + 1 };
      list.unshift(entry);
      __udWrite(store, list.slice(0, api.max));
      return entry;
    },
    list({ type, limit } = {}) { let l = __udRead(store, []); if (type) { const ts = toArr(isStr(type) ? type.split(',').map(s => s.trim()) : type); l = l.filter(x => ts.includes(x.type)); } return limit ? l.slice(0, limit) : l; },
    get(id) { return __udRead(store, []).find(x => __same(x.id, id)) || null; },
    remove(id) { const l = __udRead(store, []), n = l.filter(x => !__same(x.id, id)); if (n.length !== l.length) __udWrite(store, n); return n.length !== l.length; },
    clear(type) { __udWrite(store, type ? __udRead(store, []).filter(x => x.type !== type) : []); },
    onChange: __on(store),
  };
  return api;
}
const recent = __history('recent', 20);
const viewed = __history('viewed', 50);
viewed.track = item => viewed.add(item);

/* ── favorites ─────────────────────────────────────────────────────── */
const favorites = {
  list() { return __udRead('favorites', []); },
  has(id) { return __udRead('favorites', []).some(x => __same(x.id, id)); },
  get(id) { return __udRead('favorites', []).find(x => __same(x.id, id)) || null; },
  add(item) {
    if (!item || item.id == null) return false;
    const l = __udRead('favorites', []), i = l.findIndex(x => __same(x.id, item.id));
    if (i >= 0) l[i] = { ...l[i], ...item }; else l.push({ ...item, time: Date.now() });
    __udWrite('favorites', l);
    return true;
  },
  remove(id) { const l = __udRead('favorites', []), n = l.filter(x => !__same(x.id, id)); if (n.length !== l.length) __udWrite('favorites', n); return n.length !== l.length; },
  /** toggle(item) -> true when now a favorite */
  toggle(item) { if (favorites.has(item?.id)) { favorites.remove(item.id); return false; } favorites.add(item); return true; },
  update(id, patch) { const l = __udRead('favorites', []), i = l.findIndex(x => __same(x.id, id)); if (i < 0) return false; l[i] = { ...l[i], ...patch, id: l[i].id }; __udWrite('favorites', l); return true; },
  /** reorder([id, id, …]) — unknown ids ignored, missing ones kept at the end */
  reorder(ids) {
    const l = __udRead('favorites', []), pos = new Map(toArr(ids).map((id, i) => [String(id), i]));
    const sorted = [...l].sort((a, b) => (pos.get(String(a.id)) ?? 1e9) - (pos.get(String(b.id)) ?? 1e9));
    if (!equal(sorted.map(x => x.id), l.map(x => x.id))) __udWrite('favorites', sorted);
    return sorted;
  },
  /** move(id, delta) -> new index */
  move(id, delta) {
    const l = __udRead('favorites', []), i = l.findIndex(x => __same(x.id, id));
    if (i < 0) return -1;
    const j = clamp(i + delta, 0, l.length - 1);
    if (j !== i) { l.splice(j, 0, l.splice(i, 1)[0]); __udWrite('favorites', l); }
    return j;
  },
  clear() { __udWrite('favorites', []); },
  onChange: __on('favorites'),
};

/* ── search history ────────────────────────────────────────────────── */
const searchHistory = {
  max: 10,
  add(query, scope = 'global') {
    const q = String(query ?? '').trim();
    if (!q) return;
    const all = __udRead('search', {}), l = (all[scope] || []).filter(x => x.query.toLowerCase() !== q.toLowerCase());
    l.unshift({ query: q, time: Date.now() });
    all[scope] = l.slice(0, searchHistory.max);
    __udWrite('search', all);
  },
  list(scope = 'global', limit) { const l = __udRead('search', {})[scope] || []; return limit ? l.slice(0, limit) : l; },
  remove(query, scope = 'global') { const all = __udRead('search', {}); if (!all[scope]) return; all[scope] = all[scope].filter(x => x.query.toLowerCase() !== String(query).toLowerCase()); __udWrite('search', all); },
  clear(scope) { const all = __udRead('search', {}); if (scope) delete all[scope]; __udWrite('search', scope ? all : {}); },
  onChange: __on('search'),
};

/* ── saved views / filters ─────────────────────────────────────────── */
const __vfind = (l, x) => l.find(v => __same(v.id, x)) || l.find(v => isStr(x) && v.name.toLowerCase() === x.toLowerCase()) || null;
const views = {
  list(scope = 'default') { return __udRead('views', {})[scope] || []; },
  get(scope, idOrName) { return __vfind(views.list(scope), idOrName); },
  /** save(scope, name, state, { isDefault, id }) -> view (same name/id updates it) */
  save(scope, name, state, { isDefault, id } = {}) {
    name = String(name ?? '').trim();
    if (!name) throw new Error('views.save: name required');
    const all = __udRead('views', {}), l = all[scope] || [], now = Date.now();
    let v = id != null ? l.find(x => __same(x.id, id)) : __vfind(l, name);
    if (v) Object.assign(v, { name, state: clone(state), updated: now });
    else { v = { id: uid('view'), name, state: clone(state), isDefault: false, created: now, updated: now }; l.push(v); }
    if (isDefault != null) { l.forEach(x => { x.isDefault = false; }); v.isDefault = !!isDefault; }
    all[scope] = l;
    __udWrite('views', all);
    return clone(v);
  },
  rename(scope, idOrName, name) { const all = __udRead('views', {}), v = __vfind(all[scope] || [], idOrName); if (!v || !String(name).trim()) return null; v.name = String(name).trim(); v.updated = Date.now(); __udWrite('views', all); return clone(v); },
  remove(scope, idOrName) { const all = __udRead('views', {}), l = all[scope] || [], v = __vfind(l, idOrName); if (!v) return false; all[scope] = l.filter(x => x !== v); __udWrite('views', all); return true; },
  /** setDefault(scope, idOrName | null) */
  setDefault(scope, idOrName) { const all = __udRead('views', {}), l = all[scope] || [], v = idOrName == null ? null : __vfind(l, idOrName); l.forEach(x => { x.isDefault = x === v; }); __udWrite('views', all); return v ? clone(v) : null; },
  getDefault(scope = 'default') { return views.list(scope).find(v => v.isDefault) || null; },
  clear(scope) { const all = __udRead('views', {}); if (scope) delete all[scope]; __udWrite('views', scope ? all : {}); },
  onChange: __on('views'),
};

/* ── preferences ───────────────────────────────────────────────────── */
const __prefL = new Map();   // key -> Set<fn>
let __prefSnap = null;
function __prefsDiff() {
  const now = __udRead('prefs', {}), old = __prefSnap || {};
  __prefSnap = clone(now);
  const keys = new Set([...Object.keys(now), ...Object.keys(old)]);
  for (const k of keys) {
    if (equal(now[k], old[k])) continue;
    __prefL.get(k)?.forEach(fn => { try { fn(now[k], old[k], k); } catch (e) { console.error(e); } });
    __prefL.get('*')?.forEach(fn => { try { fn(now[k], old[k], k); } catch (e) { console.error(e); } });
  }
}
const prefs = {
  get(key, def) { const v = __udRead('prefs', {})[key]; return v === undefined ? def : v; },
  /** set(key, value) | set({ a: 1, b: 2 }) — undefined deletes */
  set(key, value) {
    const all = __udRead('prefs', {}), patch = isObj(key) ? key : { [key]: value };
    for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete all[k]; else all[k] = v; }
    if (__prefSnap === null) __prefSnap = clone(__udRead('prefs', {}));
    __udWrite('prefs', all);
    return prefs;
  },
  toggle(key) { const v = !prefs.get(key, false); prefs.set(key, v); return v; },
  /** on(key | '*', fn(value, old, key)) -> off() — local, other tabs and user switches */
  on(key, fn) { if (__prefSnap === null) __prefSnap = clone(__udRead('prefs', {})); if (!__prefL.has(key)) __prefL.set(key, new Set()); __prefL.get(key).add(fn); return () => __prefL.get(key)?.delete(fn); },
  all() { return __udRead('prefs', {}); },
  reset(key) { if (key == null) __udWrite('prefs', {}); else prefs.set(key, undefined); return prefs; },
  onChange: __on('prefs'),
};

/* ── <el data-o-track-view='{"id":…,"title":…}'> ───────────────────── */
behavior('data-o-track-view', (el, v) => {
  const parsed = parseJSON(v, null);
  const item = isObj(parsed) ? parsed : { id: v || location.pathname + location.search };
  const delay = +(el.getAttribute('data-o-track-view-delay') || 0);
  let tm = 0, done = false;
  const off = observeVisible(el, (vis, en) => {
    if (done) return;
    clearTimeout(tm);
    const enough = vis && (!en || en.intersectionRatio >= 0.5 || en.intersectionRect.height >= win.innerHeight * 0.5);
    if (enough) tm = setTimeout(() => { done = true; const e = viewed.track({ title: doc.title, url: location.href, ...item }); emit(el, 'o-track-view', { item: e }); }, delay);
  }, { threshold: [0, 0.5, 1] });
  return () => { off(); clearTimeout(tm); };
});

if (isBrowser) bus.on('auth:change', e => { if (!UD.explicit) userdata.setUser(e?.user?.id ?? null, { auto: true }); });

Object.assign(O, { userdata, recent, favorites, searchHistory, viewed, views, prefs });
