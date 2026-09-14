/* Orion.offline — connectivity state + persisted mutation queue, replayed in order when back online.
 *   Orion.offline.isOffline · Orion.offline.onChange(isOffline => …) · Orion.offline.simulate(true | false | null)
 *   await Orion.http.post('/api/notes', note, { offline: 'queue' })   // queued while offline -> { queued: true, id }
 *   Orion.offline.queue.add({ url, method, headers, body, meta }) · list() · size · remove(id) · clear() · onChange(fn)
 *   Orion.offline.queue.onConflict((entry, err) => 'retry' | 'drop' | 'keep' | { body, headers, url })   // 409 / 412
 *   Orion.offline.queue.onError((entry, err) => 'drop' | 'keep')  ·  onReplay((entry, res) => …)
 *   await Orion.offline.sync() -> { sent, failed, remaining }   ·   await Orion.offline.check() -> boolean (active probe)
 * Storage: IndexedDB (orion-offline/queue; Blob/File bodies OK) -> localStorage (JSON bodies) -> memory.
 * Multi-tab safe: Web Locks + BroadcastChannel. Document events: o-offline, o-online, o-offline-queue, o-offline-sync.
 */

i18n.add('en', {
  offline: {
    queued: { one: '{count} change waiting to sync', other: '{count} changes waiting to sync' },
    syncing: { one: 'Syncing {count} change…', other: 'Syncing {count} changes…' },
    synced: 'All changes synced', retry: 'Retry', checking: 'Checking connection…', dismiss: 'Dismiss',
    stillOffline: 'Still offline', failed: { one: '{count} change could not be synced', other: '{count} changes could not be synced' },
  },
});

const OFF_KEY = 'orion:offline:queue';
const offEm = new Emitter();
const offState = { simulated: null, real: isBrowser ? navigator.onLine !== false : true, maxAttempts: 5, autoSync: true, retryTimer: null, retryN: 0 };
const offIsOffline = () => (offState.simulated != null ? offState.simulated : !offState.real);

/* ── persistence adapters ─────────────────────────────────────────────── */
function offIdb() {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open('orion-offline', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('queue')) r.result.createObjectStore('queue', { keyPath: 'id' }); };
    r.onsuccess = () => { const db = r.result; db.onversionchange = () => { db.close(); dbp = null; }; db.onclose = () => { dbp = null; }; resolve(db); };
    r.onerror = () => { dbp = null; reject(r.error); };
    r.onblocked = () => { dbp = null; reject(new Error('IndexedDB blocked')); };
  }));
  const run = (mode, fn) => open().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction('queue', mode), st = tx.objectStore('queue');
    let out;
    const req = fn(st);
    if (req) req.onsuccess = () => { out = req.result; };
    tx.oncomplete = () => resolve(out);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction failed'));
  }));
  return {
    kind: 'idb',
    all: () => run('readonly', st => st.getAll()),
    put: e => run('readwrite', st => st.put(e)),
    del: id => run('readwrite', st => st.delete(id)),
    clear: () => run('readwrite', st => st.clear()),
    probe: () => open().then(() => true),
  };
}
function offLocal() {
  const mem = new Map();
  const persistable = e => e.body?.type !== 'formdata' && e.body?.type !== 'blob' && e.body?.type !== 'buffer';
  const save = () => { const list = [...mem.values()].filter(persistable); try { localStorage.setItem(OFF_KEY, JSON.stringify(list)); return true; } catch { return false; } };
  let ok = false;
  try { const k = OFF_KEY + ':probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); ok = true; } catch {}
  if (ok) { try { for (const e of JSON.parse(localStorage.getItem(OFF_KEY) || '[]')) if (e && e.id) mem.set(e.id, e); } catch {} }
  return {
    kind: ok ? 'local' : 'memory',
    all: async () => {
      if (ok) {
        let persisted = [];
        try { persisted = JSON.parse(localStorage.getItem(OFF_KEY) || '[]') || []; } catch {}
        const extra = [...mem.values()].filter(e => !persistable(e));
        mem.clear();
        for (const e of [...persisted, ...extra]) if (e && e.id) mem.set(e.id, e);
      }
      return [...mem.values()];
    },
    put: async e => { mem.set(e.id, e); if (ok) save(); },
    del: async id => { mem.delete(id); if (ok) save(); },
    clear: async () => { mem.clear(); if (ok) { try { localStorage.removeItem(OFF_KEY); } catch {} } },
    probe: async () => true,
  };
}
let offStore = null;
async function offGetStore() {
  if (offStore) return offStore;
  if (isBrowser && typeof indexedDB !== 'undefined') {
    const s = offIdb();
    try { await s.probe(); offStore = s; return s; } catch {}
  }
  offStore = offLocal();
  return offStore;
}

/* ── body (de)serialisation ───────────────────────────────────────────── */
function offSerialize(body) {
  if (body == null) return { type: 'none' };
  if (isStr(body)) return { type: 'text', value: body };
  if (typeof FormData !== 'undefined' && body instanceof FormData) return { type: 'formdata', value: [...body.entries()] };
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return { type: 'params', value: body.toString() };
  if (typeof Blob !== 'undefined' && body instanceof Blob) return { type: 'blob', value: body };
  if (body instanceof ArrayBuffer) return { type: 'buffer', value: body.slice(0) };
  if (ArrayBuffer.isView(body)) return { type: 'buffer', value: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
  return { type: 'json', value: clone(body) };
}
function offDeserialize(b) {
  if (!b || b.type === 'none') return undefined;
  if (b.type === 'formdata') { const fd = new FormData(); for (const [k, v] of b.value || []) fd.append(k, v); return fd; }
  if (b.type === 'params') return new URLSearchParams(b.value);
  return b.value;
}

/* ── queue ────────────────────────────────────────────────────────────── */
let offItems = [];
let offSeq = 0;
let offSyncing = null;
const offHooks = { conflict: new Set(), error: new Set(), replay: new Set() };
const offChannel = isBrowser && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('orion-offline') : null;
const offSorted = () => [...offItems].sort((a, b) => a.createdAt - b.createdAt || a.seq - b.seq);
const offPublic = e => ({ id: e.id, method: e.method, url: e.url, headers: { ...e.headers }, body: offDeserialize(e.body), meta: e.meta, createdAt: e.createdAt, attempts: e.attempts, lastError: e.lastError });
function offNotify(remote = false) {
  const list = offSorted().map(offPublic);
  offEm.emit('queue', list);
  bus.emit('offline:queue', list);
  if (isBrowser) emit(doc, 'o-offline-queue', { size: list.length, items: list });
  if (!remote) { try { offChannel?.postMessage({ type: 'queue' }); } catch {} }
}
async function offReload() { const s = await offGetStore(); try { offItems = (await s.all()) || []; offSeq = offItems.reduce((m, e) => Math.max(m, e.seq || 0), offSeq); } catch (e) { console.warn('[Orion] offline queue load failed', e); } }
const offReady = isBrowser ? offReload().then(() => { offNotify(true); if (offItems.length && !offIsOffline() && offState.autoSync) setTimeout(() => offlineSync().catch(noop), 800); }) : Promise.resolve();
if (offChannel) offChannel.onmessage = e => { if (e.data?.type === 'queue') offReload().then(() => offNotify(true)); };

async function offCallHooks(set, ...args) {
  for (const fn of [...set]) {
    try { const r = await fn(...args); if (r !== undefined) return r; } catch (e) { console.error('[Orion] offline hook failed', e); }
  }
  return undefined;
}
async function offSend(e) {
  const headers = { ...e.headers };
  for (const k of Object.keys(headers)) if (/^x-(csrf|xsrf)-token$/i.test(k)) delete headers[k];
  headers['X-Orion-Replay'] = '1';
  const body = offDeserialize(e.body);
  if (O.http) return O.http.request(e.url, { method: e.method, headers, body, offline: false, retry: 0, full: true, dedupe: false, meta: e.meta });
  const init = { method: e.method, headers, credentials: 'same-origin' };
  if (body !== undefined) { if (isObj(body) || Array.isArray(body)) { init.body = JSON.stringify(body); init.headers['Content-Type'] = init.headers['Content-Type'] || 'application/json'; } else init.body = body; }
  const res = await fetch(e.url, init);
  if (!res.ok) { const err = new Error('HTTP ' + res.status); err.status = res.status; throw err; }
  return { status: res.status, response: res };
}
function offScheduleRetry() {
  clearTimeout(offState.retryTimer);
  const n = ++offState.retryN;
  const ms = Math.min(60000, 2000 * 2 ** Math.min(n - 1, 5)) * (0.8 + Math.random() * 0.4);
  offState.retryTimer = setTimeout(() => { if (!offIsOffline()) offlineSync().catch(noop); }, ms);
}

const offQueue = {
  get ready() { return offReady; },
  get size() { return offItems.length; },
  get persistence() { return offStore?.kind || 'pending'; },
  /** add({ url, method = 'POST', headers, body, meta }) -> entry */
  async add(req) {
    await offReady;
    if (!req || !req.url) throw new TypeError('offline.queue.add: url required');
    const e = {
      id: uid('oq'), seq: ++offSeq, method: String(req.method || 'POST').toUpperCase(), url: String(req.url), headers: { ...(req.headers || {}) },
      body: offSerialize(req.body), meta: req.meta ?? null, createdAt: Date.now(), attempts: 0, lastError: null,
    };
    offItems.push(e);
    try { await (await offGetStore()).put(e); } catch (err) { console.warn('[Orion] offline queue persist failed; kept in memory', err); }
    offNotify();
    if (!offIsOffline() && offState.autoSync) setTimeout(() => offlineSync().catch(noop), 50);
    return offPublic(e);
  },
  list: () => offSorted().map(offPublic),
  get: id => { const e = offItems.find(x => x.id === id); return e ? offPublic(e) : null; },
  async remove(id) { offItems = offItems.filter(x => x.id !== id); try { await (await offGetStore()).del(id); } catch {} offNotify(); },
  async clear() { offItems = []; try { await (await offGetStore()).clear(); } catch {} offNotify(); },
  onChange: fn => offEm.on('queue', fn),
  onConflict: fn => { offHooks.conflict.add(fn); return () => offHooks.conflict.delete(fn); },
  onError: fn => { offHooks.error.add(fn); return () => offHooks.error.delete(fn); },
  onReplay: fn => { offHooks.replay.add(fn); return () => offHooks.replay.delete(fn); },
};

async function offRun() {
  await offReload();
  let sent = 0, failed = 0, stopped = false;
  const total = offItems.length;
  if (total) { offEm.emit('sync-start', { total }); bus.emit('offline:sync-start', { total }); if (isBrowser) emit(doc, 'o-offline-sync-start', { total }); }
  for (const e of offSorted()) {
    if (offIsOffline()) { stopped = true; break; }
    let tries = 0;
    for (;;) {
      try {
        const res = await offSend(e);
        await offQueue.remove(e.id);
        sent++;
        await offCallHooks(offHooks.replay, offPublic(e), res);
        offEm.emit('replayed', offPublic(e), res);
        break;
      } catch (err) {
        if (err?.isNetwork || err?.isTimeout || err instanceof TypeError) { stopped = true; break; }
        e.attempts++;
        e.lastError = { status: err?.status || 0, message: err?.message || String(err), data: err?.data ?? null };
        const status = err?.status || 0;
        let d;
        if (status === 409 || status === 412) d = (await offCallHooks(offHooks.conflict, offPublic(e), err)) ?? 'drop';
        else if (status >= 500 || status === 429 || status === 408) d = e.attempts >= offState.maxAttempts ? (await offCallHooks(offHooks.error, offPublic(e), err)) ?? 'drop' : 'keep';
        else d = (await offCallHooks(offHooks.error, offPublic(e), err)) ?? 'drop';
        if (isObj(d) && tries < 3) { Object.assign(e, { url: d.url ?? e.url, headers: d.headers ?? e.headers, body: 'body' in d ? offSerialize(d.body) : e.body }); tries++; continue; }
        if (d === 'retry' && tries < 3) { tries++; continue; }
        if (d === 'keep' || d === 'retry') { try { await (await offGetStore()).put(e); } catch {} offNotify(); stopped = true; failed++; break; }
        failed++;
        offEm.emit('failed', offPublic(e), err);
        if (isBrowser) emit(doc, 'o-offline-failed', { entry: offPublic(e), error: err });
        await offQueue.remove(e.id);
        break;
      }
    }
    if (stopped) break;
  }
  const out = { sent, failed, remaining: offItems.length };
  if (total) { offEm.emit('sync', out); bus.emit('offline:sync', out); if (isBrowser) emit(doc, 'o-offline-sync', out); }
  if (offItems.length && !offIsOffline()) offScheduleRetry(); else offState.retryN = 0;
  return out;
}
/** Replay queued mutations now (in order). Resolves { sent, failed, remaining }. */
function offlineSync() {
  if (offSyncing) return offSyncing;
  offSyncing = (async () => {
    await offReady;
    if (offIsOffline()) return { sent: 0, failed: 0, remaining: offItems.length };
    if (isBrowser && navigator.locks?.request) {
      return navigator.locks.request('orion-offline-sync', { ifAvailable: true }, lock => (lock ? offRun() : { sent: 0, failed: 0, remaining: offItems.length, skipped: true }));
    }
    return offRun();
  })().finally(() => { offSyncing = null; });
  return offSyncing;
}

function offApply() {
  const off = offIsOffline();
  if (off === offState.last) return;
  offState.last = off;
  if (isBrowser) {
    doc.documentElement.classList.toggle('o-is-offline', off);
    emit(doc, off ? 'o-offline' : 'o-online', { simulated: offState.simulated != null });
  }
  offEm.emit('change', off);
  bus.emit('offline:change', off);
  if (!off && offState.autoSync && offItems.length) setTimeout(() => offlineSync().catch(noop), 300);
}
if (isBrowser) {
  offState.last = offIsOffline();
  win.addEventListener('online', () => { offState.real = true; offApply(); });
  win.addEventListener('offline', () => { offState.real = false; offApply(); });
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden && offItems.length && !offIsOffline() && offState.autoSync) offlineSync().catch(noop); });
  ready(() => doc.documentElement.classList.toggle('o-is-offline', offIsOffline()));
}

O.offline = {
  get isOffline() { return offIsOffline(); },
  get isOnline() { return !offIsOffline(); },
  get status() { return offIsOffline() ? 'offline' : 'online'; },
  /** true while simulate() overrides the real network state */
  get simulated() { return offState.simulated != null; },
  /** onChange(fn(isOffline)) -> off() */
  onChange: fn => offEm.on('change', fn),
  on: (n, f) => offEm.on(n, f),
  off: (n, f) => offEm.off(n, f),
  /** Testing hook: simulate(true) = offline, simulate(false) = online, simulate(null) = real state */
  simulate(v) { offState.simulated = v == null ? null : !!v; offApply(); return O.offline; },
  /** Resolves when the app is online again (immediately if already online). */
  waitForOnline() { return offIsOffline() ? new Promise(r => { const off = offEm.on('change', o => { if (!o) { off(); r(); } }); }) : Promise.resolve(); },
  /** Active connectivity probe (navigator.onLine can lie). */
  async check(url = isBrowser ? location.href : '/', { timeout = 5000 } = {}) {
    if (offState.simulated != null) return !offState.simulated;
    if (!isBrowser) return true;
    const ctl = new AbortController(), id = setTimeout(() => ctl.abort(), timeout);
    try {
      const u = new URL(url, doc.baseURI); u.searchParams.set('_orion_ping', Date.now());
      await fetch(u.href, { method: 'HEAD', cache: 'no-store', signal: ctl.signal });
      offState.real = true; offApply(); return true;
    } catch { offState.real = navigator.onLine !== false ? offState.real : false; offApply(); return false; }
    finally { clearTimeout(id); }
  },
  /** configure({ maxAttempts = 5, autoSync = true }) */
  configure(o = {}) { if (o.maxAttempts != null) offState.maxAttempts = Math.max(1, +o.maxAttempts); if (o.autoSync != null) offState.autoSync = !!o.autoSync; return O.offline; },
  queue: offQueue,
  sync: offlineSync,
  serialize: offSerialize,
  deserialize: offDeserialize,
};
