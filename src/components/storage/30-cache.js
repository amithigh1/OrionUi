/* Orion.cache — Cache Storage API helpers (secure contexts: https or localhost).
 *   await Orion.cache.put('/api/me', { name: 'Ada' }, { ttl: '1h' })   // data -> JSON Response; Response / Blob / string also accepted
 *   await Orion.cache.match('/api/me')            // -> parsed data (json/text/blob by content-type) | undefined (missing/expired)
 *   await Orion.cache.match(url, { as: 'response' | 'json' | 'text' | 'blob' })
 *   await Orion.cache.delete(url) · keys(cacheName?) · names() · clear(prefix = 'orion') · size(cacheName?)
 *   await Orion.storage.estimate() -> { usage, quota, percent, details } · Orion.storage.persist() · Orion.storage.persisted()
 * Default cache name: 'orion-data' (option `cache` on every call). Service-worker caches use the 'orion-sw-' prefix.
 */

const CACHE_DEFAULT = 'orion-data';
const cacheSupported = () => { try { return typeof caches !== 'undefined' && !!caches && (!isBrowser || win.isSecureContext !== false); } catch { return false; } };
const __cacheURL = u => { try { return new URL(u, isBrowser ? doc.baseURI : 'http://localhost/').href; } catch { return String(u); } };
async function __openCache(name) {
  if (!cacheSupported()) throw new StorageError('Cache Storage is not available (requires HTTPS or localhost)', { code: 'EUNSUPPORTED' });
  try { return await caches.open(name || CACHE_DEFAULT); } catch (e) { throw new StorageError(e?.message || 'caches.open failed', { code: 'ECACHE', cause: e }); }
}
function __toResponse(value, ttl, headers = {}) {
  const h = new Headers(headers);
  const stamp = r => { const hh = new Headers(r.headers); hh.set('x-orion-cached', String(Date.now())); if (ttl) hh.set('x-orion-expires', String(Date.now() + ttl)); return hh; };
  if (isInst(value, Response)) {
    if (value.type === 'opaque' || !ttl) return value;
    return value.blob().then(b => new Response(b, { status: value.status, statusText: value.statusText, headers: stamp(value) }));
  }
  let body;
  if (isInst(value, Blob)) { body = value; if (!h.has('content-type') && value.type) h.set('content-type', value.type); }
  else if (isStr(value)) { body = value; if (!h.has('content-type')) h.set('content-type', 'text/plain; charset=utf-8'); }
  else { body = JSON.stringify(value ?? null); if (!h.has('content-type')) h.set('content-type', 'application/json; charset=utf-8'); }
  h.set('x-orion-cached', String(Date.now()));
  if (ttl) h.set('x-orion-expires', String(Date.now() + ttl));
  return new Response(body, { status: 200, headers: h });
}
async function __readAs(res, as) {
  if (as === 'response') return res;
  if (as === 'blob') return res.blob();
  if (as === 'text') return res.text();
  if (as === 'arrayBuffer') return res.arrayBuffer();
  const ct = res.headers.get('content-type') || '';
  if (as === 'json' || /[/+]json\b/.test(ct)) { const s = await res.text(); return s ? parseJSON(s, s) : null; }
  if (/^text\/|xml|html|javascript/.test(ct)) return res.text();
  return res.blob();
}

const orionCache = {
  get supported() { return cacheSupported(); },
  defaultName: CACHE_DEFAULT,
  /** put(url, Response | data | Blob | string, { cache, ttl, headers }) -> true */
  async put(url, value, o = {}) {
    const c = await __openCache(o.cache);
    const res = await __toResponse(isInst(value, Response) ? value.clone() : value, parseTTL(o.ttl), o.headers);
    try { await c.put(__cacheURL(url), res); } catch (e) { throw new StorageError(e?.message || 'cache.put failed', { code: e?.name === 'QuotaExceededError' ? 'EQUOTA' : 'ECACHE', cause: e }); }
    return true;
  },
  /** match(url, { cache, as = 'auto', ignoreSearch }) -> data | Response | undefined */
  async match(url, o = {}) {
    if (!cacheSupported()) return undefined;
    const opts = { ignoreSearch: !!o.ignoreSearch, ignoreVary: !!o.ignoreVary };
    const res = o.cache ? await (await __openCache(o.cache)).match(__cacheURL(url), opts) : await caches.match(__cacheURL(url), { ...opts, cacheName: CACHE_DEFAULT }) || (o.any ? await caches.match(__cacheURL(url), opts) : undefined);
    if (!res) return undefined;
    const exp = +res.headers.get('x-orion-expires');
    if (exp && exp <= Date.now()) { await orionCache.delete(url, o); return undefined; }
    return __readAs(res, o.as || 'auto');
  },
  async has(url, o = {}) { return (await orionCache.match(url, { ...o, as: 'response' })) !== undefined; },
  /** delete(url, { cache }) -> boolean */
  async delete(url, o = {}) { if (!cacheSupported()) return false; return (await __openCache(o.cache)).delete(__cacheURL(url), { ignoreSearch: !!o.ignoreSearch }); },
  /** keys(cacheName = 'orion-data') -> absolute URLs */
  async keys(name) { if (!cacheSupported()) return []; return (await (await __openCache(name)).keys()).map(r => r.url); },
  /** names() -> every cache name of this origin */
  async names() { if (!cacheSupported()) return []; try { return await caches.keys(); } catch { return []; } },
  /** clear(prefix = 'orion') -> number of deleted caches (use clear('') for all caches of this origin) */
  async clear(prefix = 'orion') {
    if (!cacheSupported()) return 0;
    let n = 0;
    for (const name of await caches.keys()) if (name.startsWith(prefix)) { if (await caches.delete(name)) n++; }
    return n;
  },
  /** size(cacheName?) -> bytes (sum of stored bodies; all caches when omitted). Opaque responses count as 0. */
  async size(name) {
    if (!cacheSupported()) return 0;
    const names = name ? [name] : await caches.keys();
    let total = 0;
    for (const n of names) {
      const c = await caches.open(n);
      for (const req of await c.keys()) {
        const r = await c.match(req);
        if (!r || r.type === 'opaque') continue;
        const len = +r.headers.get('content-length');
        total += len > 0 ? len : (await r.blob()).size;
      }
    }
    return total;
  },
  /** stats() -> [{ name, entries, bytes }] */
  async stats() {
    if (!cacheSupported()) return [];
    const out = [];
    for (const n of await caches.keys()) { const c = await caches.open(n); out.push({ name: n, entries: (await c.keys()).length, bytes: await orionCache.size(n) }); }
    return out;
  },
};

O.cache = orionCache;
O.storage = Object.assign(O.storage || {}, {
  cache: orionCache,
  /** estimate() -> { usage, quota, percent, details } | null */
  async estimate() {
    if (!isBrowser || !navigator.storage?.estimate) return null;
    try {
      const e = await navigator.storage.estimate();
      return { usage: e.usage || 0, quota: e.quota || 0, percent: e.quota ? (e.usage || 0) / e.quota : 0, details: e.usageDetails || null };
    } catch { return null; }
  },
  /** persist() -> true when the browser grants persistent storage (no eviction under pressure) */
  async persist() { if (!isBrowser || !navigator.storage?.persist) return false; try { return await navigator.storage.persist(); } catch { return false; } },
  async persisted() { if (!isBrowser || !navigator.storage?.persisted) return false; try { return await navigator.storage.persisted(); } catch { return false; } },
});
