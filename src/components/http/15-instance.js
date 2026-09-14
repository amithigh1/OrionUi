/* Orion.http instance: request pipeline (interceptors -> offline queue -> cache -> dedupe -> retries -> transport).
 *   Orion.http(url, opts) / .request(url | config, opts) / .get / .head / .delete / .options / .post / .put / .patch
 *   Orion.http.create(defaults) -> independent instance (own interceptors, cache, events)
 *   events: http.on('request' | 'response' | 'error' | 'retry', fn)
 */

const __httpMocks = [];        // global mock routes (20-mock.js) consulted by every instance
const __httpActive = new Set(); // AbortControllers of running requests (abortAll)

function createHttp(defaults = {}, parent = null) {
  const em = new Emitter();
  const cacheStore = httpCacheStore();
  const inflight = new Map();
  const interceptors = { request: new HttpInterceptors(), response: new HttpInterceptors(), error: new HttpInterceptors() };
  const base = merge({}, parent ? parent.defaults : HTTP_DEFAULTS, defaults);

  const inst = (url, opts) => inst.request(url, opts);

  function normalize(url, opts) {
    const o = isObj(url) && !isInst(url, URL) ? url : { ...(opts || {}), url };
    const cfg = { ...base, ...o };
    cfg.headers = mergeHeaders(base.headers, o.headers);
    cfg.method = String(cfg.method || 'GET').toUpperCase();
    cfg.url = String(o.url ?? cfg.url ?? '');
    return cfg;
  }
  function finalize(cfg) {
    cfg.method = String(cfg.method || 'GET').toUpperCase();
    cfg.headers = mergeHeaders(cfg.headers);
    cfg.fullURL = buildURL(cfg.url, cfg.baseURL, cfg.params, cfg.paramsSerializer);
    if (!getHeader(cfg.headers, 'accept') && (cfg.responseType === 'json' || cfg.responseType === 'auto')) setHeader(cfg.headers, 'Accept', 'application/json, text/plain, */*');
    if (cfg.csrf && !SAFE_METHODS.has(cfg.method) && sameOrigin(cfg.fullURL) && !getHeader(cfg.headers, cfg.csrfHeader)) {
      const tok = csrfToken(cfg);
      if (tok) setHeader(cfg.headers, cfg.csrfHeader, tok);
    }
    return cfg;
  }
  const cacheTTL = c => (!c ? 0 : c === true || c === 'memory' ? Infinity : isNum(c) ? c : 0);
  const reqKey = cfg => cfg.method + ' ' + absURL(cfg.fullURL) + ' ' + cfg.responseType + ' ' + JSON.stringify(cfg.headers);

  /** one attempt: transport + parse + status validation (throws HttpError) */
  async function once(cfg, attempt, signal) {
    const timeoutCtl = new AbortController();
    let timedOut = false, timer = null;
    const onUserAbort = () => timeoutCtl.abort(signal.reason);
    if (signal) { if (signal.aborted) timeoutCtl.abort(signal.reason); else signal.addEventListener('abort', onUserAbort, { once: true }); }
    if (cfg.timeout > 0) timer = setTimeout(() => { timedOut = true; timeoutCtl.abort(new DOMException('Timeout', 'TimeoutError')); }, cfg.timeout);
    __httpActive.add(timeoutCtl);
    const headers = { ...cfg.headers };
    const req = {
      url: cfg.fullURL, method: cfg.method, headers, body: encodeBody(cfg.body, headers), signal: timeoutCtl.signal,
      credentials: cfg.credentials, mode: cfg.mode, redirect: cfg.redirect, referrerPolicy: cfg.referrerPolicy, integrity: cfg.integrity,
      keepalive: cfg.keepalive, priority: cfg.priority, fetchCache: cfg.fetchCache, onUploadProgress: cfg.onUploadProgress, onDownloadProgress: cfg.onDownloadProgress,
    };
    try {
      if (O.offline?.simulated && O.offline.isOffline) throw new HttpError(t('http.offline'), { code: 'EOFFLINE', config: cfg, attempts: attempt });
      const mockFn = __httpMatchMock?.(req, cfg);
      let res;
      if (mockFn) res = await mockFn(req, cfg, attempt);
      else if (isFn(cfg.adapter)) res = await cfg.adapter(req, cfg);
      else if (cfg.onUploadProgress && typeof XMLHttpRequest !== 'undefined' && !isInst(req.body, ReadableStream)) res = await xhrTransport(req);
      else if (typeof fetch === 'function') res = await fetchTransport(req);
      else throw new TypeError('No fetch implementation available');
      const ok = (cfg.validateStatus || HTTP_DEFAULTS.validateStatus)(res.status);
      if (!ok) {
        let data = null;
        try { data = cfg.responseType === 'response' ? null : await parseBody(res, 'auto', cfg.method); } catch (e) { data = e.__text ?? null; }
        const msg = `Request failed with status ${res.status}${res.statusText ? ' ' + res.statusText : ''} (${cfg.method} ${cfg.fullURL})`;
        throw new HttpError(msg, { status: res.status, statusText: res.statusText, data, headers: res.headers, response: res, config: cfg, attempts: attempt });
      }
      let data;
      if (cfg.responseType === 'response') data = res;
      else {
        try { data = await parseBody(res, cfg.responseType, cfg.method); }
        catch (e) {
          if (e.__parse) throw new HttpError(t('http.parse'), { code: 'EPARSE', status: res.status, data: e.__text, headers: res.headers, response: res, config: cfg, cause: e, attempts: attempt });
          throw e;
        }
      }
      return { data, status: res.status, statusText: res.statusText, headers: res.headers, config: cfg, response: res, url: res.url || absURL(cfg.fullURL), cached: false };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      if (timedOut) throw new HttpError(t('http.timeout') + ` (${cfg.timeout} ms)`, { code: 'ETIMEDOUT', config: cfg, cause: e, attempts: attempt });
      if (signal?.aborted || e?.name === 'AbortError') throw new HttpError(t('http.aborted'), { code: 'EABORT', config: cfg, cause: e, attempts: attempt });
      const offline = isBrowser && navigator.onLine === false;
      throw new HttpError(offline ? t('http.offline') : t('http.network'), { code: offline ? 'EOFFLINE' : 'ENETWORK', config: cfg, cause: e, attempts: attempt });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onUserAbort);
      __httpActive.delete(timeoutCtl);
    }
  }

  /** attempts with retry/backoff (Retry-After honoured) */
  async function execute(cfg, signal) {
    const r = normRetry(cfg.retry);
    for (let attempt = 1; ; attempt++) {
      try { return await once(cfg, attempt, signal); }
      catch (err) {
        err.attempts = attempt;
        const retryable = !err.isAbort && attempt <= r.count && r.methods.includes(cfg.method) &&
          ((err.status && r.on.includes(err.status)) || ((err.isNetwork || err.isTimeout) && r.network && !err.isOffline)) &&
          (!isFn(r.when) || r.when(err, attempt));
        if (!retryable) throw err;
        const delay = retryAfterMs(err) ?? httpBackoff(attempt, r);
        em.emit('retry', { attempt, delay, error: err, config: cfg });
        try { await abortableSleep(delay, signal); }
        catch (e) { throw new HttpError(t('http.aborted'), { code: 'EABORT', config: cfg, cause: e, attempts: attempt }); }
      }
    }
  }

  /** concurrent identical GETs share one network request; each caller may still abort independently */
  function shared(key, cfg) {
    let entry = inflight.get(key);
    if (!entry) {
      const ctl = new AbortController();
      entry = { users: 0, served: 0, ctl };
      entry.promise = execute(cfg, ctl.signal).finally(() => { if (inflight.get(key) === entry) inflight.delete(key); });
      entry.promise.catch(noop);
      inflight.set(key, entry);
    }
    entry.users++;
    const sig = cfg.signal;
    return new Promise((resolve, reject) => {
      const onAbort = () => { if (--entry.users <= 0) entry.ctl.abort(sig.reason); reject(new HttpError(t('http.aborted'), { code: 'EABORT', config: cfg })); };
      if (sig) { if (sig.aborted) return onAbort(); sig.addEventListener('abort', onAbort, { once: true }); }
      entry.promise.then(res => {
        sig?.removeEventListener('abort', onAbort);
        resolve(entry.served++ ? { ...res, config: cfg, data: cloneData(res.data) } : res);
      }, err => { sig?.removeEventListener('abort', onAbort); reject(err); });
    });
  }
  const cloneData = d => (d == null || typeof d !== 'object' || isInst(d, Response) ? d : clone(d));

  async function runResponse(res) {
    for (const fn of interceptors.response.list()) { const r = await fn(res); if (r !== undefined) res = r; }
    return res;
  }
  const result = (cfg, res) => (cfg.full ? res : res && Object.prototype.hasOwnProperty.call(res, 'data') && Object.prototype.hasOwnProperty.call(res, 'status') ? res.data : res);

  async function queueOffline(cfg) {
    const entry = await O.offline.queue.add({ url: absURL(cfg.fullURL), method: cfg.method, headers: cfg.headers, body: cfg.body, meta: cfg.meta });
    const res = { data: { queued: true, id: entry.id }, status: 202, statusText: 'Queued', headers: new Headers(), config: cfg, response: null, url: absURL(cfg.fullURL), cached: false, queued: true };
    em.emit('queued', { config: cfg, entry });
    return res;
  }

  inst.request = async function (url, opts) {
    let cfg = normalize(url, opts);
    try {
      for (const fn of interceptors.request.list()) { const r = await fn(cfg); if (r !== undefined && r !== null) cfg = r; }
      finalize(cfg);
    } catch (e) {
      throw e instanceof HttpError ? e : new HttpError(e?.message || 'Request interceptor failed', { code: 'EINTERCEPTOR', config: cfg, cause: e });
    }
    em.emit('request', cfg);
    const loader = cfg.loader && isFn(O.progress?.start) ? O.progress : null;
    loader?.start();
    try {
      let res;
      const mutation = !SAFE_METHODS.has(cfg.method);
      const canQueue = mutation && cfg.offline === 'queue' && O.offline?.queue;
      const ttl = cfg.method === 'GET' && cfg.responseType !== 'response' ? cacheTTL(cfg.cache) : 0;
      const key = cfg.method === 'GET' ? reqKey(cfg) : null;
      const hit = ttl && key ? cacheStore.get(key) : null;
      if (hit) res = { ...hit.res, config: cfg, data: cloneData(hit.res.data), cached: true };
      else if (canQueue && O.offline.isOffline) res = await queueOffline(cfg);
      else {
        const plain = !cfg.onUploadProgress && !cfg.onDownloadProgress;
        try {
          res = key && cfg.dedupe && plain ? await shared(key, cfg) : await execute(cfg, cfg.signal);
        } catch (e) {
          if (canQueue && e instanceof HttpError && e.isNetwork) res = await queueOffline(cfg);
          else throw e;
        }
        if (ttl && res && !res.queued) cacheStore.set(key, { res: { ...res, data: cloneData(res.data) }, url: absURL(cfg.fullURL) }, ttl);
        if (mutation && !res.queued && cfg.invalidate !== false) cacheStore.invalidate(absURL(cfg.fullURL));
      }
      res = await runResponse(res);
      em.emit('response', res);
      return result(cfg, res);
    } catch (err0) {
      let err = err0 instanceof HttpError ? err0 : new HttpError(err0?.message || String(err0), { code: 'EUNKNOWN', config: cfg, cause: err0 });
      for (const fn of interceptors.error.list()) {
        try { const v = await fn(err); if (v !== undefined) return result(cfg, v); }
        catch (e) { err = e; }
      }
      if (!(err instanceof HttpError && err.isAbort)) { em.emit('error', err); bus.emit('http:error', err); }
      throw err;
    } finally { loader?.done(); }
  };
  for (const m of ['get', 'head', 'delete', 'options']) inst[m] = (url, opts = {}) => inst.request(url, { ...opts, method: m.toUpperCase() });
  for (const m of ['post', 'put', 'patch']) inst[m] = (url, body, opts = {}) => inst.request(url, { ...opts, method: m.toUpperCase(), body });

  /** download(url, { filename, onProgress, toast = true, save = true, ...config }) -> Blob */
  inst.download = async function (url, o = {}) {
    const { filename, onProgress, toast = true, save = true, ...cfg } = o;
    const guess = filename || filenameFromURL(url) || 'download';
    const tp = toast ? httpProgressToast(t('http.downloading', { name: guess })) : null;
    try {
      const res = await inst.request(url, { ...cfg, responseType: 'blob', full: true, dedupe: false, onDownloadProgress: p => { try { onProgress?.(p); } catch (e) { console.error(e); } tp?.update(p); } });
      const name = filename || filenameFromDisposition(res.headers?.get?.('content-disposition')) || filenameFromURL(res.url || url) || 'download';
      if (save && isBrowser) download(res.data, name);
      tp?.done(t('http.downloaded', { name }));
      announce(t('http.downloaded', { name }));
      return res.data;
    } catch (e) { tp?.fail(e.userMessage || t('http.downloadFailed')); throw e; }
  };
  /** upload(url, File | File[] | FileList | FormData, { fieldName = 'file', data, method = 'POST', onProgress, ...config }) */
  inst.upload = function (url, input, o = {}) {
    const { fieldName = 'file', data, method = 'POST', onProgress, ...cfg } = o;
    let body = input;
    if (!isInst(input, FormData)) {
      body = new FormData();
      for (const f of toArr(isInst(input, Blob) ? [input] : input)) body.append(fieldName, f, f.name || 'blob');
    }
    if (data) for (const [k, v] of Object.entries(data)) if (v != null) body.append(k, isInst(v, Blob) ? v : isObj(v) || Array.isArray(v) ? JSON.stringify(v) : String(v));
    return inst.request(url, { ...cfg, method, body, onUploadProgress: onProgress || cfg.onUploadProgress, dedupe: false });
  };

  Object.assign(inst, {
    defaults: base,
    interceptors,
    HttpError,
    isHttpError: e => e instanceof HttpError,
    /** create(defaults) -> new instance inheriting these defaults */
    create: d => createHttp(d, inst),
    cache: cacheStore,
    on: (n, f) => em.on(n, f), off: (n, f) => { em.off(n, f); return inst; }, once: (n, f) => em.once(n, f),
    /** abort every running request (all instances) */
    abortAll(reason) { for (const c of [...__httpActive]) c.abort(reason); for (const e of inflight.values()) e.ctl.abort(reason); },
    params: serializeParams,
    buildURL: (url, params) => buildURL(url, base.baseURL, params),
    backoff: httpBackoff,
  });
  return inst;
}

O.http = createHttp();
O.HttpError = HttpError;
