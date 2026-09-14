/* Orion.http — zero-dependency HTTP client (fetch + XHR for upload progress).
 *   const users = await Orion.http.get('/api/users', { params: { page: 2 }, retry: 2, timeout: 8000 });
 *   await Orion.http.post('/api/users', { name: 'Ada' });              // plain objects are sent as JSON
 *   const api = Orion.http.create({ baseURL: '/api', headers: { 'X-App': 'admin' } });
 *   const eject = api.interceptors.request.use(cfg => { cfg.headers.Authorization = 'Bearer ' + token; });
 *   api.interceptors.error.use(async err => { if (err.status === 401) { await refresh(); return api.request(err.config); } });
 *   try { await api.get('/x', { signal }); } catch (e) { if (e instanceof Orion.HttpError && e.isTimeout) … }
 *   await Orion.http.download('/report.csv', { onProgress: p => bar(p.progress) });
 *   await Orion.http.upload('/files', fileInput.files, { onProgress });
 * Options: method params body headers timeout retry signal responseType onUploadProgress onDownloadProgress cache dedupe
 *          baseURL credentials csrf loader offline full validateStatus meta
 */

i18n.add('en', {
  http: {
    error: 'Request failed', network: 'Network error. Check your connection.', timeout: 'The request timed out',
    aborted: 'Request cancelled', offline: 'You are offline', parse: 'Invalid server response',
    downloading: 'Downloading {name}…', downloaded: 'Downloaded {name}', downloadFailed: 'Download failed',
    uploading: 'Uploading…', uploaded: 'Upload complete', uploadFailed: 'Upload failed',
    queued: 'Saved offline. It will sync when you are back online.', saved: 'Saved', loadFailed: 'Could not load content', loaded: 'Content loaded',
    status: {
      400: 'Bad request', 401: 'Please sign in again', 403: 'You do not have permission to do that', 404: 'Not found',
      408: 'The request timed out', 409: 'This item was changed by someone else', 413: 'The upload is too large',
      422: 'Please correct the highlighted fields', 429: 'Too many requests. Try again shortly.', 500: 'Server error',
      502: 'Bad gateway', 503: 'Service unavailable', 504: 'The server took too long to respond',
    },
  },
});

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const NULL_BODY = new Set([101, 204, 205, 304]);
const isInst = (v, C) => typeof C !== 'undefined' && v instanceof C;
const RETRY_DEFAULTS = { count: 0, delay: 300, factor: 2, maxDelay: 10000, jitter: 0.25, on: [408, 425, 429, 500, 502, 503, 504], methods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'], network: true };
const HTTP_DEFAULTS = {
  method: 'GET', baseURL: '', headers: {}, timeout: 0, responseType: 'auto', credentials: 'same-origin', csrf: true,
  csrfHeader: 'X-CSRF-Token', csrfCookie: null, dedupe: true, cache: false, loader: false, offline: false, retry: 0,
  validateStatus: s => s >= 200 && s < 300, full: false,
};

/** Typed error for every failure: HTTP status, timeout, abort, network, offline and parse errors. */
class HttpError extends Error {
  constructor(message, o = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = o.status || 0;
    this.statusText = o.statusText || '';
    this.code = o.code || (this.status ? 'EHTTP' : 'ENETWORK');
    this.data = o.data ?? null;
    this.headers = o.headers || null;
    this.response = o.response || null;
    this.config = o.config || null;
    this.attempts = o.attempts || 1;
    if (o.cause) this.cause = o.cause;
  }
  get isTimeout() { return this.code === 'ETIMEDOUT'; }
  get isAbort() { return this.code === 'EABORT'; }
  get isNetwork() { return this.code === 'ENETWORK' || this.code === 'EOFFLINE'; }
  get isOffline() { return this.code === 'EOFFLINE'; }
  get isClientError() { return this.status >= 400 && this.status < 500; }
  get isServerError() { return this.status >= 500; }
  /** Localised, user-facing message (server `message`/`title` first). */
  get userMessage() {
    const d = this.data;
    if (isObj(d) && isStr(d.message || d.title || d.error) && (d.message || d.title || d.error).length < 300) return d.message || d.title || d.error;
    if (this.isTimeout) return t('http.timeout');
    if (this.isOffline) return t('http.offline');
    if (this.isNetwork) return t('http.network');
    if (this.isAbort) return t('http.aborted');
    return this.status ? t('http.status.' + this.status, { default: t('http.error') + ' (' + this.status + ')' }) : t('http.error');
  }
  toJSON() { return { name: this.name, message: this.message, status: this.status, code: this.code, data: this.data, url: this.config?.fullURL, method: this.config?.method }; }
}

/* ── small helpers ─────────────────────────────────────────────────────── */
/** exponential backoff with +/- jitter: attempt 1 -> delay */
function httpBackoff(attempt, { delay = 300, factor = 2, maxDelay = 10000, jitter = 0.25 } = {}) {
  const base = Math.min(maxDelay, delay * factor ** Math.max(0, attempt - 1));
  return Math.max(0, Math.round(base * (1 + (Math.random() * 2 - 1) * (jitter || 0))));
}
/** sleep that rejects with an AbortError when the signal aborts */
function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    const done = () => { clearTimeout(id); signal?.removeEventListener('abort', onAbort); };
    const onAbort = () => { done(); reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); };
    const id = setTimeout(() => { done(); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
/** case-insensitive header merge into a plain object; null/undefined values delete */
function mergeHeaders(...list) {
  const out = {};
  for (const src of list) {
    if (!src) continue;
    const entries = isInst(src, Headers) ? [...src.entries()] : Array.isArray(src) ? src : Object.entries(src);
    for (const [k, v] of entries) {
      for (const ex of Object.keys(out)) if (ex.toLowerCase() === String(k).toLowerCase()) delete out[ex];
      if (v != null) out[k] = String(v);
    }
  }
  return out;
}
const headerKey = (h, name) => Object.keys(h).find(k => k.toLowerCase() === name.toLowerCase());
const getHeader = (h, name) => { const k = headerKey(h, name); return k ? h[k] : undefined; };
const setHeader = (h, name, v) => { const k = headerKey(h, name); if (k) delete h[k]; if (v != null) h[name] = String(v); };
/** { a: 1, b: [2, 3], d: Date } -> 'a=1&b=2&b=3&d=2024-…' (null/undefined skipped) */
function serializeParams(params) {
  if (!params) return '';
  if (isInst(params, URLSearchParams)) return params.toString();
  if (isStr(params)) return params.replace(/^\?/, '');
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    for (const x of Array.isArray(v) ? v : [v]) if (x != null) sp.append(k, x instanceof Date ? x.toISOString() : isObj(x) ? JSON.stringify(x) : String(x));
  }
  return sp.toString();
}
function buildURL(url, baseURL, params, serializer) {
  let u = String(url ?? '');
  if (baseURL && !/^([a-z][a-z\d+\-.]*:)?\/\//i.test(u)) u = u ? String(baseURL).replace(/\/+$/, '') + '/' + u.replace(/^\/+/, '') : String(baseURL);
  const qs = params ? (isFn(serializer) ? serializer(params) : serializeParams(params)) : '';
  if (qs) { const i = u.indexOf('#'), p = i < 0 ? u : u.slice(0, i), hash = i < 0 ? '' : u.slice(i); u = p + (p.includes('?') ? '&' : '?') + qs + hash; }
  return u;
}
const absURL = u => { try { return new URL(u, isBrowser ? doc.baseURI : 'http://localhost/').href; } catch { return String(u); } };
const sameOrigin = u => { if (!isBrowser) return false; try { return new URL(u, doc.baseURI).origin === location.origin; } catch { return false; } };
const isRawBody = b => isStr(b) || isInst(b, Blob) || isInst(b, FormData) || isInst(b, URLSearchParams) || isInst(b, ArrayBuffer) || ArrayBuffer.isView(b) || isInst(b, typeof ReadableStream !== 'undefined' ? ReadableStream : undefined);
function encodeBody(body, headers) {
  if (body == null) return undefined;
  if (isInst(body, FormData)) { setHeader(headers, 'Content-Type', null); return body; }
  if (isRawBody(body)) return body;
  if (!getHeader(headers, 'content-type')) setHeader(headers, 'Content-Type', 'application/json');
  return JSON.stringify(body);
}
function csrfToken(cfg) {
  if (!isBrowser) return null;
  const m = doc.querySelector('meta[name="csrf-token"]');
  if (m && m.content) return m.content;
  if (cfg.csrfCookie) {
    const c = doc.cookie.match(new RegExp('(?:^|; )' + String(cfg.csrfCookie).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
    if (c) return decodeURIComponent(c[1]);
  }
  return null;
}
/** RFC 6266 Content-Disposition -> filename */
function filenameFromDisposition(cd) {
  if (!cd) return '';
  let m = cd.match(/filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i);
  if (m) { try { return decodeURIComponent(m[2].trim().replace(/^"|"$/g, '')); } catch {} }
  m = cd.match(/filename\s*=\s*("?)([^";]+)\1/i);
  return m ? m[2].trim() : '';
}
const filenameFromURL = u => { try { return decodeURIComponent(new URL(u, 'http://x/').pathname.split('/').filter(Boolean).pop() || ''); } catch { return ''; } };
const progressOf = (loaded, total) => ({ loaded, total: total || 0, progress: total ? Math.min(1, loaded / total) : null, lengthComputable: !!total });
function retryAfterMs(err) {
  const v = err?.headers?.get?.('retry-after');
  if (!v) return null;
  const s = Number(v);
  const ms = Number.isFinite(s) ? s * 1000 : Date.parse(v) - Date.now();
  return Number.isFinite(ms) && ms >= 0 ? Math.min(ms, 60000) : null;
}
function normRetry(r) {
  if (!r) return { ...RETRY_DEFAULTS, count: 0 };
  if (isNum(r)) return { ...RETRY_DEFAULTS, count: r };
  if (r === true) return { ...RETRY_DEFAULTS, count: 3 };
  return { ...RETRY_DEFAULTS, count: 3, ...r, methods: (r.methods || RETRY_DEFAULTS.methods).map(m => String(m).toUpperCase()) };
}

/** Optional toast with progress (feature-detects Orion.toast) -> { update(p), done(msg), fail(msg) } | null */
function httpProgressToast(title) {
  if (!isFn(O.toast)) return null;
  let h = null;
  try { h = O.toast(title, { type: 'info', duration: 0, progress: 0, dismissible: true }); } catch { return null; }
  const upd = o => { try { if (h && isFn(h.update)) h.update(o); } catch {} };
  const close = () => { try { (h?.close || h?.dismiss || noop).call(h); } catch {} };
  const finish = (msg, type) => {
    if (h && isFn(h.update)) { upd({ message: msg, type, progress: type === 'success' ? 1 : null, duration: 3000 }); setTimeout(close, 3200); }
    else { close(); try { O.toast(msg, { type }); } catch {} }
  };
  return {
    update(p) { if (p && p.progress != null) upd({ message: `${title} ${Math.round(p.progress * 100)}%`, progress: p.progress }); },
    done: msg => finish(msg, 'success'),
    fail: msg => finish(msg, 'danger'),
  };
}

/* ── transports ────────────────────────────────────────────────────────── */
function responseWithUrl(res, url) { try { if (url && !res.url) Object.defineProperty(res, 'url', { value: url }); } catch {} return res; }
async function streamWithProgress(res, cb) {
  const enc = res.headers.get('content-encoding');
  const total = enc && enc !== 'identity' ? 0 : +res.headers.get('content-length') || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  cb(progressOf(0, total));
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    cb(progressOf(loaded, total));
  }
  if (!total) cb(progressOf(loaded, loaded));
  const out = new Response(new Blob(chunks, { type: res.headers.get('content-type') || '' }), { status: res.status, statusText: res.statusText, headers: res.headers });
  return responseWithUrl(out, res.url);
}
async function fetchTransport(req) {
  const init = { method: req.method, headers: req.headers, body: req.body, signal: req.signal, credentials: req.credentials };
  for (const k of ['mode', 'redirect', 'referrer', 'referrerPolicy', 'integrity', 'keepalive', 'priority']) if (req[k] != null) init[k] = req[k];
  if (req.fetchCache) init.cache = req.fetchCache;
  if (isInst(req.body, ReadableStream)) init.duplex = 'half';
  const res = await fetch(req.url, init);
  if (req.onDownloadProgress && res.body && !NULL_BODY.has(res.status) && req.method !== 'HEAD') return streamWithProgress(res, req.onDownloadProgress);
  return res;
}
function xhrTransport(req) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    const aborted = () => req.signal?.reason ?? new DOMException('Aborted', 'AbortError');
    if (req.signal?.aborted) return reject(aborted());
    const onAbort = () => x.abort();
    const done = () => req.signal?.removeEventListener('abort', onAbort);
    x.open(req.method, req.url, true);
    x.responseType = 'blob';
    x.withCredentials = req.credentials === 'include';
    for (const [k, v] of Object.entries(req.headers || {})) { try { x.setRequestHeader(k, v); } catch {} }
    if (req.onUploadProgress && x.upload) x.upload.onprogress = e => req.onUploadProgress(progressOf(e.loaded, e.lengthComputable ? e.total : 0));
    if (req.onDownloadProgress) x.onprogress = e => req.onDownloadProgress(progressOf(e.loaded, e.lengthComputable ? e.total : 0));
    x.onload = () => {
      done();
      if (!x.status) return reject(new TypeError('Network request failed'));
      const headers = new Headers();
      x.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach(line => { const i = line.indexOf(':'); if (i > 0) { try { headers.append(line.slice(0, i).trim(), line.slice(i + 1).trim()); } catch {} } });
      const nb = NULL_BODY.has(x.status);
      let res;
      try { res = new Response(nb ? null : x.response, { status: x.status, statusText: x.statusText, headers }); }
      catch { res = new Response(nb ? null : x.response, { status: 500, statusText: x.statusText, headers }); }
      resolve(responseWithUrl(res, x.responseURL || req.url));
    };
    x.onerror = () => { done(); reject(new TypeError('Network request failed')); };
    x.onabort = () => { done(); reject(aborted()); };
    req.signal?.addEventListener('abort', onAbort, { once: true });
    x.send(req.body ?? null);
  });
}
async function parseBody(res, type, method) {
  if (method === 'HEAD' || NULL_BODY.has(res.status)) return null;
  if (type === 'blob') return res.blob();
  if (type === 'arrayBuffer' || type === 'arraybuffer') return res.arrayBuffer();
  if (type === 'text') return res.text();
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (type === 'json' || /[/+]json\b/.test(ct)) { const s = await res.text(); if (!s.trim()) return null; try { return JSON.parse(s); } catch (e) { e.__parse = true; e.__text = s; throw e; } }
  if (!ct || /^text\/|xml|html|javascript|x-www-form-urlencoded/.test(ct)) {
    const s = await res.text();
    if (!ct && /^\s*[[{]/.test(s)) return parseJSON(s, s);
    return s;
  }
  return res.blob();
}

/* ── interceptors ──────────────────────────────────────────────────────── */
class HttpInterceptors {
  constructor() { this.handlers = []; }
  /** use(fn) -> eject() */
  use(fn) { if (!isFn(fn)) throw new TypeError('interceptor must be a function'); const h = { fn }; this.handlers.push(h); return () => this.eject(h); }
  eject(h) { const i = this.handlers.findIndex(x => x === h || x.fn === h); if (i >= 0) this.handlers.splice(i, 1); }
  clear() { this.handlers.length = 0; }
  get size() { return this.handlers.length; }
  list() { return this.handlers.map(h => h.fn); }
}

/* ── memory cache (LRU) ────────────────────────────────────────────────── */
const HTTP_CACHE_MAX = 200;
const __pathOf = u => { try { return new URL(u, 'http://x/').pathname; } catch { return String(u).split('?')[0]; } };
function httpCacheStore() {
  const map = new Map();
  return {
    map,
    get(k) { const e = map.get(k); if (!e) return null; if (e.expires < Date.now()) { map.delete(k); return null; } map.delete(k); map.set(k, e); return e; },
    set(k, v, ttl) { map.delete(k); map.set(k, { ...v, url: v.url, expires: ttl === Infinity ? Infinity : Date.now() + ttl }); while (map.size > HTTP_CACHE_MAX) map.delete(map.keys().next().value); },
    /** clear() | clear('/api/users') (URL prefix) | clear(/regex/) -> count */
    clear(match) {
      let n = 0;
      for (const [k, e] of [...map]) {
        const hit = match == null || (match instanceof RegExp ? match.test(e.url) : isFn(match) ? match(e.url) : e.url.startsWith(absURL(match)) || __pathOf(e.url).startsWith(String(match)));
        if (hit) { map.delete(k); n++; }
      }
      return n;
    },
    /** invalidate entries related to a mutated URL (same path, child or parent collection) */
    invalidate(url) { const p = __pathOf(url); for (const [k, e] of [...map]) { const q = __pathOf(e.url); if (q.startsWith(p) || p.startsWith(q + '/') || p === q) map.delete(k); } },
    get size() { return map.size; },
  };
}
