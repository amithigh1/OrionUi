/* Orion.http.mock — in-memory mock server for demos & tests (applies to every http instance).
 *   const server = Orion.http.mock([
 *     { method: 'GET',  url: '/api/users/:id', response: req => ({ id: +req.params.id }) },
 *     { method: 'POST', url: '/api/users', status: 201, delay: [200, 600], response: req => ({ id: 7, ...req.body }) },
 *     { method: 'POST', url: '/api/save', reply: req => [422, { errors: { email: 'Taken' } }] },
 *     { url: '/api/flaky', fail: 2, status: 503 },            // first 2 calls fail with 503, then succeed
 *     { url: '/api/down', error: 'network' },                  // 'network' | 'timeout'
 *   ], { delay: 150, passthrough: true });
 *   server.calls  ·  server.add(route)  ·  server.reset()  ·  server.restore()
 *   Object form: Orion.http.mock({ 'GET /api/users': [...], 'POST /api/users': req => ({ ok: true }) })
 * Patterns: '/abs/path/:param' (full pathname), 'relative/path' (pathname suffix), 'https://host/path', '*' wildcards, RegExp or fn(url, req).
 */

function __mockPattern(p) {
  if (p instanceof RegExp || isFn(p)) return p;
  const s = String(p);
  const keys = [];
  const full = /^[a-z][a-z\d+\-.]*:\/\//i.test(s);
  const src = s.split('?')[0].replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*?/g, '.*').replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  const re = new RegExp((full || s.startsWith('/') ? '^' : '(?:^|/)') + src.replace(/^\//, full ? '' : '/').replace(/^\/\//, '/') + '/?$', 'i');
  return { re, keys, full };
}
function __mockMatch(route, method, url) {
  if (route.method && route.method !== '*' && String(route.method).toUpperCase() !== method) return null;
  let u;
  try { u = new URL(url, isBrowser ? doc.baseURI : 'http://localhost/'); } catch { return null; }
  const p = route._p;
  if (isFn(p)) return p(u.href, u) ? {} : null;
  if (p instanceof RegExp) { const m = p.exec(u.href) || p.exec(u.pathname); return m ? { ...(m.groups || {}) } : null; }
  const m = p.re.exec(p.full ? u.origin + u.pathname : u.pathname);
  if (!m) return null;
  const params = {};
  p.keys.forEach((k, i) => { try { params[k] = decodeURIComponent(m[i + 1]); } catch { params[k] = m[i + 1]; } });
  return params;
}
const __mockDelay = d => (Array.isArray(d) ? d[0] + Math.random() * ((d[1] ?? d[0]) - d[0]) : +d || 0);
function __mockBodySize(b) {
  if (b == null) return 0;
  if (isStr(b)) return new Blob([b]).size;
  if (isInst(b, Blob)) return b.size;
  if (isInst(b, FormData)) { let n = 0; for (const [, v] of b.entries()) n += isInst(v, Blob) ? v.size : String(v).length; return n; }
  if (isInst(b, ArrayBuffer) || ArrayBuffer.isView(b)) return b.byteLength;
  return 0;
}
function __mockParseBody(b) {
  if (isStr(b)) return parseJSON(b, b);
  if (isInst(b, URLSearchParams)) return Object.fromEntries(b);
  return b ?? null;
}
function __mockResponse(status, body, headers = {}) {
  const h = mergeHeaders(headers);
  let payload = null;
  if (!NULL_BODY.has(status) && body !== undefined && body !== null) {
    if (isInst(body, Blob) || isInst(body, ArrayBuffer) || ArrayBuffer.isView(body) || isInst(body, FormData)) payload = body;
    else if (isStr(body)) { payload = body; if (!getHeader(h, 'content-type')) setHeader(h, 'Content-Type', /^\s*</.test(body) ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8'); }
    else { payload = JSON.stringify(body); if (!getHeader(h, 'content-type')) setHeader(h, 'Content-Type', 'application/json; charset=utf-8'); }
  }
  if (payload && isStr(payload) && !getHeader(h, 'content-length')) setHeader(h, 'Content-Length', new Blob([payload]).size);
  return new Response(payload, { status, headers: h });
}
/** Synthetic progress events spread over `ms` */
async function __mockProgress(cb, total, ms, signal) {
  if (!cb) return abortableSleep(ms, signal);
  const steps = Math.max(2, Math.min(10, Math.round(ms / 60)));
  for (let i = 0; i <= steps; i++) {
    cb(progressOf(Math.round((total || 1) * i / steps), total || 1));
    if (i < steps) await abortableSleep(ms / steps, signal);
  }
}

/** Called by the instance for every request: returns a handler when a mock route matches. */
function __httpMatchMock(req) {
  for (let i = __httpMocks.length - 1; i >= 0; i--) {
    const srv = __httpMocks[i];
    for (const route of srv.routes) {
      if (route.times != null && route._hits >= route.times) continue;
      const params = __mockMatch(route, req.method, req.url);
      if (!params) continue;
      return (rq, cfg, attempt) => srv._handle(route, params, rq, cfg, attempt);
    }
  }
  return null;
}

/** URLSearchParams → plain object; a key that repeats (?b=2&b=3) becomes an array, as server frameworks report it. */
function __mockQuery(sp) {
  const q = {};
  for (const [k, v] of sp) { if (!(k in q)) q[k] = v; else if (Array.isArray(q[k])) q[k].push(v); else q[k] = [q[k], v]; }
  return q;
}
function httpMock(routes = [], opts = {}) {
  const o = { delay: 0, passthrough: true, ...opts };
  const srv = { routes: [], calls: [], options: o };
  const norm = r => {
    const route = { status: 200, ...r, _hits: 0, _fails: 0 };
    route._p = __mockPattern(route.url ?? '*');
    return route;
  };
  srv.add = r => {
    if (Array.isArray(r)) {
      // ['GET /api/x', handler] — one entry of the object form as a tuple. Without this branch the tuple was
      // recursed into, and its string and function each became a catch-all '*' route with an empty body.
      if (r.length === 2 && isStr(r[0]) && /^([A-Z]+|\*)\s+\S/i.test(r[0])) return srv.add({ [r[0]]: r[1] });
      r.forEach(srv.add);
    } else if (!isObj(r)) {
      throw new TypeError('[Orion] http.mock: a route is { method, url, response }, { "METHOD /path": handler } or ["METHOD /path", handler] — got ' + typeof r);
    } else if (!('url' in r) && !('reply' in r) && !('response' in r)) {
      for (const [k, v] of Object.entries(r)) {
        const m = k.match(/^([A-Z]+|\*)\s+(.+)$/i);
        const route = isObj(v) && ('response' in v || 'reply' in v || 'status' in v || 'error' in v) ? v : { response: v };
        srv.add({ ...route, method: m ? m[1] : '*', url: m ? m[2] : k });
      }
    } else srv.routes.push(norm(r));
    return srv;
  };
  srv.remove = r => { srv.routes = srv.routes.filter(x => x !== r && x.url !== r); return srv; };
  srv.reset = () => { srv.calls.length = 0; srv.routes.forEach(r => { r._hits = 0; r._fails = 0; }); return srv; };
  srv.restore = () => { const i = __httpMocks.indexOf(srv); if (i >= 0) __httpMocks.splice(i, 1); return srv; };
  srv._handle = async (route, params, req, cfg, attempt) => {
    route._hits++;
    const u = new URL(req.url, isBrowser ? doc.baseURI : 'http://localhost/');
    const mreq = {
      // repeated keys (?b=2&b=3) become arrays, as a real server would see them — Object.fromEntries kept only the last
      method: req.method, url: u.href, path: u.pathname, query: __mockQuery(u.searchParams), params, headers: { ...req.headers },
      body: __mockParseBody(cfg.body !== undefined ? cfg.body : req.body), raw: req.body, config: cfg, attempt,
    };
    srv.calls.push({ method: mreq.method, url: mreq.url, path: mreq.path, body: mreq.body, headers: mreq.headers, time: Date.now(), route: route.url });
    const delay = __mockDelay(route.delay ?? o.delay);
    if (req.onUploadProgress) await __mockProgress(req.onUploadProgress, __mockBodySize(req.body), Math.max(delay * 0.7, 120), req.signal);
    else await abortableSleep(req.onDownloadProgress ? delay * 0.3 : delay, req.signal);
    if (route.error === 'network') throw new TypeError('Failed to fetch (mock network error)');
    if (route.error === 'timeout') { await abortableSleep(cfg.timeout ? cfg.timeout + 1000 : 30000, req.signal); throw new TypeError('Mock timeout'); }
    let status = route.status, body, headers = route.headers || {};
    if (route.fail && route._fails < route.fail) {
      route._fails++;
      status = route.failStatus || (route.status >= 400 ? route.status : 503);
      body = route.failBody ?? { message: 'Service unavailable (mock)' };
    } else {
      if (route.fail && status >= 400) status = 200;
      if (isFn(route.reply)) { const r = await route.reply(mreq); [status = 200, body, headers = headers] = Array.isArray(r) ? r : [200, r]; }
      else if (isFn(route.response)) body = await route.response(mreq);
      else body = route.response ?? route.body ?? (status >= 400 ? { message: 'Mock error ' + status } : null);
    }
    const res = __mockResponse(status, body, headers);
    if (req.onDownloadProgress && !NULL_BODY.has(status)) {
      const blob = await res.clone().blob();
      await __mockProgress(req.onDownloadProgress, blob.size, Math.max(delay * 0.7, 120), req.signal);
    }
    return responseWithUrl(res, u.href);
  };
  srv.add(routes);
  __httpMocks.push(srv);
  return srv;
}
O.http.mock = httpMock;
O.http.mock.response = __mockResponse;
