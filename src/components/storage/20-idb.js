/* Orion.idb — promise-based IndexedDB.
 *   const db = await Orion.idb.open('crm', { stores: { users: { keyPath: 'id', autoIncrement: true, indexes: ['email', { name: 'tags', keyPath: 'tags', multiEntry: true }] }, notes: null } });
 *   await db.put('users', { id: 1, email: 'ada@x.io' }); await db.get('users', 1); await db.getAll('users', Orion.idb.range.bound(1, 10));
 *   await db.index('users', 'email').getAll('ada@x.io');  ·  db.keys · db.count · db.delete · db.clear · db.bulkPut · db.iterate
 *   await db.tx(['users', 'notes'], 'readwrite', async t => { await t.store('users').put(u); await t.store('notes').add(n); });
 *   await Orion.idb.kv.set('draft', {...}); await Orion.idb.kv.get('draft');   // default key-value store (memory fallback)
 * Without `version`, missing stores/indexes trigger an automatic version bump. Errors are Orion.StorageError { code, cause }.
 */

class StorageError extends Error {
  constructor(message, { code = 'ESTORAGE', cause } = {}) { super(message); this.name = 'StorageError'; this.code = code; if (cause) this.cause = cause; }
}
const idbSupported = () => { try { return typeof indexedDB !== 'undefined' && !!indexedDB; } catch { return false; } };
const idbErr = (e, fallback = 'IndexedDB error') => (e instanceof StorageError ? e : new StorageError(e?.message || fallback, { code: e?.name === 'QuotaExceededError' ? 'EQUOTA' : e?.name === 'ConstraintError' ? 'ECONSTRAINT' : e?.name === 'VersionError' ? 'EVERSION' : 'EIDB', cause: e }));
const idbReq = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = e => { e.preventDefault?.(); reject(idbErr(req.error)); }; });
const idbTxDone = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onabort = () => reject(idbErr(tx.error || new DOMException('Transaction aborted', 'AbortError')));
  tx.onerror = e => { e.preventDefault?.(); };
});
const idbNormStore = d => (d == null ? {} : isStr(d) ? { keyPath: d } : d);
const idbNormIndex = ix => (isStr(ix) ? { name: ix, keyPath: ix } : { keyPath: ix.name, ...ix });

function idbRawOpen(name, version, onUpgrade, blockedTimeout = 10000) {
  return new Promise((resolve, reject) => {
    let req, timer = null, settled = false;
    try { req = version ? indexedDB.open(name, version) : indexedDB.open(name); }
    catch (e) { reject(idbErr(e, 'IndexedDB unavailable')); return; }
    req.onupgradeneeded = e => { try { onUpgrade?.(req.result, e.oldVersion, e.newVersion, req.transaction); } catch (err) { console.error('[Orion] idb upgrade failed', err); try { req.transaction.abort(); } catch {} } };
    req.onsuccess = () => { clearTimeout(timer); if (settled) { req.result.close(); return; } settled = true; resolve(req.result); };
    req.onerror = e => { e.preventDefault?.(); clearTimeout(timer); if (!settled) { settled = true; reject(idbErr(req.error)); } };
    req.onblocked = () => {
      bus.emit('idb:blocked', { name, version });
      timer = setTimeout(() => { if (!settled) { settled = true; reject(new StorageError(`Opening "${name}" is blocked by another tab`, { code: 'EBLOCKED' })); } }, blockedTimeout);
    };
  });
}

class IDBDatabaseWrapper extends Emitter {
  constructor(name, db, opts) { super(); this.name = name; this._opts = opts; this._attach(db); }
  _attach(db) {
    this._db = db;
    db.onversionchange = () => { db.close(); if (this._db === db) this._db = null; this.emit('versionchange'); };
    db.onclose = () => { if (this._db === db) this._db = null; this.emit('close'); };
  }
  get version() { return this._db?.version; }
  get stores() { return this._db ? [...this._db.objectStoreNames] : []; }
  async _conn() {
    if (this._db) return this._db;
    if (this._closed) throw new StorageError(`Database "${this.name}" is closed`, { code: 'ECLOSED' });
    const db = await idbRawOpen(this.name);
    this._attach(db);
    return db;
  }
  async _run(store, mode, fn) {
    const db = await this._conn();
    let tx;
    try { tx = db.transaction(store, mode); } catch (e) { throw idbErr(e); }
    const done = idbTxDone(tx);
    let req;
    try { req = fn(tx.objectStore(isStr(store) ? store : store[0])); } catch (e) { try { tx.abort(); } catch {} done.catch(noop); throw idbErr(e); }
    const [res] = await Promise.all([req instanceof IDBRequest ? idbReq(req) : req, done]);
    return res;
  }
  get(store, key) { return this._run(store, 'readonly', st => st.get(key)); }
  /** put(store, value, key?) -> key */
  put(store, value, key) { return this._run(store, 'readwrite', st => (key === undefined ? st.put(value) : st.put(value, key))); }
  add(store, value, key) { return this._run(store, 'readwrite', st => (key === undefined ? st.add(value) : st.add(value, key))); }
  delete(store, keyOrRange) { return this._run(store, 'readwrite', st => st.delete(keyOrRange)); }
  clear(store) { return this._run(store, 'readwrite', st => st.clear()); }
  /** getAll(store, query? (key | IDBKeyRange | filter fn), count?) */
  async getAll(store, query, count) {
    if (isFn(query)) { const out = []; await this.iterate(store, (v, k) => { if (query(v, k)) out.push(v); if (count && out.length >= count) return false; }); return out; }
    return this._run(store, 'readonly', st => st.getAll(query ?? null, count));
  }
  keys(store, query, count) { return this._run(store, 'readonly', st => st.getAllKeys(query ?? null, count)); }
  count(store, query) { return this._run(store, 'readonly', st => st.count(query ?? undefined)); }
  /** bulkPut(store, values[]) — one transaction */
  bulkPut(store, values) { return this._run(store, 'readwrite', st => { let last; for (const v of values) last = st.put(v); return last; }); }
  /** iterate(store, fn(value, key, cursor) -> false to stop, { index, query, direction }) */
  iterate(store, fn, { index, query, direction = 'next' } = {}) {
    return this._run(store, 'readonly', st => new Promise((resolve, reject) => {
      const src = index ? st.index(index) : st;
      const req = src.openCursor(query ?? null, direction);
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve();
        let r;
        try { r = fn(c.value, c.primaryKey, c); } catch (e) { reject(e); return; }
        if (r === false) resolve(); else c.continue();
      };
      req.onerror = e => { e.preventDefault?.(); reject(idbErr(req.error)); };
    }));
  }
  /** index(store, name) -> { get, getAll, keys, count } */
  index(store, name) {
    const run = fn => this._run(store, 'readonly', st => fn(st.index(name)));
    return {
      get: v => run(ix => ix.get(v)),
      getAll: (v, count) => run(ix => ix.getAll(v ?? null, count)),
      keys: (v, count) => run(ix => ix.getAllKeys(v ?? null, count)),
      count: v => run(ix => ix.count(v ?? undefined)),
    };
  }
  /** tx(stores, mode, async t => { t.store('a').put(x) … }) — resolves with fn's result after commit; aborts when fn throws */
  async tx(stores, mode = 'readonly', fn) {
    if (isFn(mode)) { fn = mode; mode = 'readonly'; }
    const db = await this._conn();
    const tx = db.transaction(stores, mode);
    const done = idbTxDone(tx);
    const wrap = st => ({
      get: k => idbReq(st.get(k)), put: (v, k) => idbReq(k === undefined ? st.put(v) : st.put(v, k)), add: (v, k) => idbReq(k === undefined ? st.add(v) : st.add(v, k)),
      delete: k => idbReq(st.delete(k)), clear: () => idbReq(st.clear()), getAll: (q, c) => idbReq(st.getAll(q ?? null, c)), keys: (q, c) => idbReq(st.getAllKeys(q ?? null, c)),
      count: q => idbReq(st.count(q ?? undefined)), index: n => { const ix = st.index(n); return { get: v => idbReq(ix.get(v)), getAll: (v, c) => idbReq(ix.getAll(v ?? null, c)), count: v => idbReq(ix.count(v ?? undefined)) }; },
    });
    let result;
    try { result = await fn({ store: n => wrap(tx.objectStore(n)), abort: () => tx.abort(), raw: tx }); }
    catch (e) { try { tx.abort(); } catch {} done.catch(noop); throw idbErr(e); }
    await done;
    return result;
  }
  close() { this._closed = true; this._db?.close(); this._db = null; }
  /** delete the whole database */
  async destroy() { this.close(); return O.idb.deleteDatabase(this.name); }
}

async function idbOpen(name, opts = {}) {
  if (!idbSupported()) throw new StorageError('IndexedDB is not available in this environment', { code: 'EUNSUPPORTED' });
  const stores = opts.stores || {};
  const upgrade = (db, oldV, newV, tx) => {
    for (const [s, d0] of Object.entries(stores)) {
      const d = idbNormStore(d0);
      const st = db.objectStoreNames.contains(s) ? tx.objectStore(s) : db.createObjectStore(s, { keyPath: d.keyPath ?? undefined, autoIncrement: !!d.autoIncrement });
      for (const ix of d.indexes || []) { const x = idbNormIndex(ix); if (!st.indexNames.contains(x.name)) st.createIndex(x.name, x.keyPath, { unique: !!x.unique, multiEntry: !!x.multiEntry }); }
    }
    if (opts.prune) for (const s of [...db.objectStoreNames]) if (!(s in stores)) db.deleteObjectStore(s);
    if (isFn(opts.upgrade)) opts.upgrade(db, oldV, newV, tx);
  };
  const missing = db => Object.entries(stores).some(([s, d0]) => {
    if (!db.objectStoreNames.contains(s)) return true;
    const ixs = idbNormStore(d0).indexes || [];
    if (!ixs.length) return false;
    try { const st = db.transaction(s).objectStore(s); return ixs.some(ix => !st.indexNames.contains(idbNormIndex(ix).name)); } catch { return true; }
  });
  let db;
  if (opts.version) db = await idbRawOpen(name, opts.version, upgrade, opts.blockedTimeout);
  else {
    db = await idbRawOpen(name, undefined, upgrade, opts.blockedTimeout);
    if (missing(db)) { const v = db.version + 1; db.close(); db = await idbRawOpen(name, v, upgrade, opts.blockedTimeout); }
  }
  return new IDBDatabaseWrapper(name, db, opts);
}

/* ── default key-value store (IndexedDB -> memory fallback) ───────────── */
let __kvp = null;
const __kvMem = new Map();
const __kvDB = () => __kvp || (__kvp = (idbSupported() ? idbOpen('orion-kv', { stores: { kv: null } }) : Promise.reject(new StorageError('no idb', { code: 'EUNSUPPORTED' }))).catch(() => null));
const __kvRun = async (fn, mem) => { const db = await __kvDB(); return db ? fn(db) : mem(); };
const idbKV = {
  get: (key, def) => __kvRun(async db => { const v = await db.get('kv', key); return v === undefined ? def : v; }, () => (__kvMem.has(key) ? clone(__kvMem.get(key)) : def)),
  set: (key, value) => __kvRun(db => db.put('kv', value, key), () => { __kvMem.set(key, clone(value)); return key; }),
  del: key => __kvRun(db => db.delete('kv', key), () => { __kvMem.delete(key); }),
  has: key => __kvRun(async db => (await db.count('kv', key)) > 0, () => __kvMem.has(key)),
  keys: () => __kvRun(db => db.keys('kv'), () => [...__kvMem.keys()]),
  entries: () => __kvRun(async db => { const out = []; await db.iterate('kv', (v, k) => { out.push([k, v]); }); return out; }, () => [...__kvMem.entries()].map(([k, v]) => [k, clone(v)])),
  clear: () => __kvRun(db => db.clear('kv'), () => { __kvMem.clear(); }),
  /** true when backed by IndexedDB (false = memory fallback) */
  persistent: async () => !!(await __kvDB()),
};
idbKV.delete = idbKV.del;
idbKV.remove = idbKV.del;

O.idb = {
  get supported() { return idbSupported(); },
  open: idbOpen,
  kv: idbKV,
  /** [{ name, version }] (when the browser supports indexedDB.databases()) */
  async databases() { if (!idbSupported()) return []; try { return isFn(indexedDB.databases) ? await indexedDB.databases() : []; } catch { return []; } },
  deleteDatabase(name) {
    if (!idbSupported()) return Promise.resolve(false);
    return new Promise((resolve, reject) => {
      const r = indexedDB.deleteDatabase(name);
      r.onsuccess = () => resolve(true);
      r.onerror = () => reject(idbErr(r.error));
      r.onblocked = () => bus.emit('idb:blocked', { name, delete: true });
    });
  },
  range: {
    only: v => IDBKeyRange.only(v), bound: (a, b, lo = false, hi = false) => IDBKeyRange.bound(a, b, lo, hi),
    lower: (a, open = false) => IDBKeyRange.lowerBound(a, open), upper: (b, open = false) => IDBKeyRange.upperBound(b, open),
  },
  Database: IDBDatabaseWrapper,
};
O.StorageError = StorageError;
O.storage = Object.assign(O.storage || {}, { idb: O.idb, StorageError });
