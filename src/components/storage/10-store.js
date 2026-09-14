/* Orion.store / Orion.session — namespaced Web Storage with JSON values, TTL, change events and memory fallback.
 *   Orion.store.set('filters', { status: 'active' }, { ttl: '7d' })    // ttl: ms | '30s' | '10m' | '2h' | '7d'
 *   Orion.store.get('filters', {})  ·  has(key)  ·  remove(key)  ·  keys()  ·  clear(prefix?)  ·  update(key, fn, def)
 *   const off = Orion.store.onChange('filters', (value, old, info) => …)   // same tab + other tabs (storage event)
 *   Orion.store.onChange('*', fn)  ·  Orion.store.namespace('myapp')  ·  Orion.store.persistent (false = memory fallback)
 * Keys are stored as "<namespace>:<key>" (default namespace "orion:store"). Works when storage throws (private mode, quota).
 */

const __STORE_MARK = '__o';
const isInst = (v, C) => typeof C !== 'undefined' && v instanceof C;
function parseTTL(ttl) {
  if (ttl == null || ttl === '' || ttl === false) return 0;
  if (isNum(ttl)) return Math.max(0, ttl);
  const m = String(ttl).trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)?$/i);
  if (!m) return 0;
  return +m[1] * { ms: 1, s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 }[(m[2] || 'ms').toLowerCase()];
}
/** Detect a usable Storage object (throws in some private modes / sandboxed iframes). */
function __probeStorage(kind) {
  if (!isBrowser) return null;
  try {
    const s = win[kind];
    const k = '__orion_probe__';
    s.setItem(k, '1'); s.removeItem(k);
    return s;
  } catch { return null; }
}
/** Minimal Storage-compatible in-memory backend. */
function __memoryStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: i => [...m.keys()][i] ?? null,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    clear: () => m.clear(),
  };
}
const __stores = new Map();
let __storageListening = false;

function createStore(kind = 'localStorage', ns = 'orion:store') {
  const id = kind + '|' + ns;
  if (__stores.has(id)) return __stores.get(id);
  const native = __probeStorage(kind);
  let backend = native || __memoryStorage();
  const prefix = ns ? ns.replace(/:+$/, '') + ':' : '';
  const em = new Emitter();
  const full = k => prefix + k;
  const decode = raw => {
    if (raw == null) return { found: false };
    const v = parseJSON(raw, raw);
    if (isObj(v) && v[__STORE_MARK] === 1) return { found: true, value: v.v, expires: v.e || 0 };
    return { found: true, value: v, expires: 0 };
  };
  const readRaw = k => { try { return backend.getItem(full(k)); } catch { return null; } };
  const read = k => {
    const d = decode(readRaw(k));
    if (!d.found) return d;
    if (d.expires && d.expires <= Date.now()) { try { backend.removeItem(full(k)); } catch {} return { found: false, expired: true }; }
    return d;
  };
  const ownKeys = () => {
    const out = [];
    try { for (let i = 0; i < backend.length; i++) { const k = backend.key(i); if (k != null && k.startsWith(prefix)) out.push(k.slice(prefix.length)); } } catch {}
    return out;
  };
  const notify = (key, value, old, source) => {
    const info = { key, source, store: api };
    em.emit('key:' + key, value, old, info);
    em.emit('*', key, value, old, info);
  };
  /** prune expired entries (also used to free space on quota errors) */
  const prune = () => { let n = 0; for (const k of ownKeys()) { const d = decode(readRaw(k)); if (d.expires && d.expires <= Date.now()) { try { backend.removeItem(full(k)); n++; } catch {} } } return n; };

  const api = {
    kind, namespace: ns,
    /** false when the browser storage is unavailable and an in-memory fallback is used */
    get persistent() { return backend === native && !!native; },
    get(key, def) { const d = read(key); return d.found ? d.value : def; },
    /** set(key, value, { ttl }) -> boolean (false when the value could not be stored) */
    set(key, value, opts = {}) {
      if (value === undefined) { api.remove(key); return true; }
      const ttl = parseTTL(isObj(opts) ? opts.ttl : opts);
      const old = api.get(key);
      let payload;
      try { payload = JSON.stringify(ttl ? { [__STORE_MARK]: 1, v: value, e: Date.now() + ttl } : isObj(value) && __STORE_MARK in value ? { [__STORE_MARK]: 1, v: value } : value); }
      catch (e) { console.warn('[Orion] store.set: value is not serialisable', key, e); return false; }
      try { backend.setItem(full(key), payload); }
      catch {
        prune();
        try { backend.setItem(full(key), payload); }
        catch (e2) { console.warn('[Orion] store.set: storage quota exceeded', key, e2); return false; }
      }
      notify(key, value, old, 'local');
      return true;
    },
    has(key) { return read(key).found; },
    remove(key) {
      const old = api.get(key);
      const existed = readRaw(key) != null;
      try { backend.removeItem(full(key)); } catch {}
      if (existed) notify(key, undefined, old, 'local');
      return existed;
    },
    /** update(key, fn(oldValue) -> newValue, default, opts) */
    update(key, fn, def, opts) { const v = fn(api.get(key, def)); api.set(key, v, opts); return v; },
    /** remaining ms before expiry (Infinity without TTL, 0 when missing) */
    ttl(key) { const d = read(key); return !d.found ? 0 : d.expires ? Math.max(0, d.expires - Date.now()) : Infinity; },
    keys() { return ownKeys().filter(k => read(k).found); },
    entries() { return api.keys().map(k => [k, api.get(k)]); },
    /** clear(prefix = '') -> number of removed keys (only keys inside this namespace) */
    clear(p = '') {
      let n = 0;
      for (const k of ownKeys()) if (k.startsWith(p)) { const old = api.get(k); try { backend.removeItem(full(k)); n++; notify(k, undefined, old, 'local'); } catch {} }
      return n;
    },
    /** approximate bytes used by this namespace (UTF-16 = 2 bytes per char) */
    size() { let b = 0; for (const k of ownKeys()) b += ((full(k)).length + (readRaw(k) || '').length) * 2; return b; },
    prune,
    /** onChange(key | '*', fn(value, old, { key, source: 'local' | 'remote' })) -> off() */
    onChange(key, fn) {
      if (key === '*' || key == null) return em.on('*', (k, v, o, info) => fn(v, o, info));
      return em.on('key:' + key, fn);
    },
    /** namespace('myapp') -> another store on the same backend with prefix "myapp:" */
    namespace: n => createStore(kind, n),
    /** raw backend (Storage or memory) */
    get backend() { return backend; },
    _remote(e) {
      if (!e.key) { em.emit('*', null, undefined, undefined, { key: null, source: 'remote', cleared: true, store: api }); return; }
      if (!e.key.startsWith(prefix)) return;
      const key = e.key.slice(prefix.length);
      const nv = decode(e.newValue), ov = decode(e.oldValue);
      notify(key, nv.found ? nv.value : undefined, ov.found ? ov.value : undefined, 'remote');
    },
  };
  api.del = api.remove;
  __stores.set(id, api);
  if (isBrowser && !__storageListening) {
    __storageListening = true;
    win.addEventListener('storage', e => {
      for (const s of __stores.values()) {
        try { if ((s.kind === 'localStorage' && e.storageArea === win.localStorage) || (s.kind === 'sessionStorage' && e.storageArea === win.sessionStorage)) s._remote(e); } catch {}
      }
    });
  }
  return api;
}

O.store = createStore('localStorage');
O.session = createStore('sessionStorage');
O.storage = Object.assign(O.storage || {}, { local: O.store, session: O.session, createStore, parseTTL });
