/* legacy-http-client.js — salvaged from .tmp/http-eval.js (docs/components/http.html).
 * Orion.http imperative client: params/query, POST, timeout, retry-with-backoff, abort, network-error
 * normalization, interceptors, request de-dup, cache, download progress, and HttpError field shape.
 * Complements the existing http-mock-forms.js (which only covers Orion.http.mock() route shapes).
 */
(async () => {
  const out = {};
  Orion.http.mock([
    { method: 'GET', url: '/api/users/:id', response: req => ({ id: +req.params.id, name: 'User ' + req.params.id }) },
    { method: 'GET', url: '/api/echo', response: req => ({ q: req.query }) },
    { method: 'POST', url: '/api/users', status: 201, response: req => ({ id: 99, ...req.body }) },
    { url: '/api/flaky', fail: 2, status: 503, failBody: { message: 'try again' }, response: () => ({ ok: true }) },
    { url: '/api/slow', delay: 5000, response: () => ({ ok: true }) },
    { url: '/api/down', error: 'network' },
    { url: '/api/dedupe-count', response: () => ({ n: ++window.__dedupeHits }) },
  ]);
  window.__dedupeHits = 0;

  out.getUser = await Orion.http.get('/api/users/7');
  out.getEcho = await Orion.http.get('/api/echo', { params: { a: 1, b: [2, 3] } });
  out.postUser = await Orion.http.post('/api/users', { name: 'Ada' });

  try { await Orion.http.get('/api/slow', { timeout: 100 }); out.timeoutError = null; }
  catch (e) { out.timeoutError = { isTimeout: e.isTimeout, code: e.code, isHttpError: Orion.http.isHttpError(e) }; }

  out.retrySucceeds = await Orion.http.get('/api/flaky', { retry: 3 });

  const ctl = new AbortController();
  const abortP = Orion.http.get('/api/slow', { signal: ctl.signal, timeout: 0 }).catch(e => ({ isAbort: e.isAbort, code: e.code }));
  ctl.abort();
  out.abortResult = await abortP;

  try { await Orion.http.get('/api/down'); } catch (e) { out.networkError = { isNetwork: e.isNetwork, code: e.code, userMessage: e.userMessage }; }

  const api = Orion.http.create({ baseURL: '/api' });
  let sawReq = false, sawRes = false;
  api.interceptors.request.use(cfg => { sawReq = true; cfg.headers['X-Test'] = '1'; });
  api.interceptors.response.use(res => { sawRes = true; return res; });
  await api.get('/users/1');
  out.interceptors = { sawReq, sawRes };

  const [d1, d2] = await Promise.all([Orion.http.get('/api/dedupe-count'), Orion.http.get('/api/dedupe-count')]);
  out.dedupe = { d1, d2, hits: window.__dedupeHits };

  Orion.http.cache.clear();
  const c1 = await Orion.http.get('/api/dedupe-count', { cache: true });
  const c2 = await Orion.http.get('/api/dedupe-count', { cache: true });
  out.cache = { c1, c2, hitsAfterCache: window.__dedupeHits, sameN: c1.n === c2.n };

  let progressCalls = 0;
  Orion.http.mock([{ url: '/api/file', response: () => 'x'.repeat(5000) }]);
  await Orion.http.get('/api/file', { responseType: 'text', onDownloadProgress: () => progressCalls++ });
  out.downloadProgressCalls = progressCalls > 0;

  Orion.http.mock([{ url: '/api/bad', status: 422, response: () => ({ errors: { email: 'Taken' } }) }]);
  try { await Orion.http.get('/api/bad'); } catch (e) {
    out.httpErrorFields = { status: e.status, code: e.code, isClientError: e.isClientError, hasData: !!e.data, name: e.name };
  }

  // (13 Sep: the mock server now reports repeated keys as arrays, so `q.b` is asserted as ['2','3'] below.)
  // Note: an array param (b: [2,3]) round-trips through the URL as repeated "b=2&b=3" (confirmed correct
  // via Orion.http's own query-building code), but the mock server's req.query — built with a plain
  // Object.fromEntries(searchParams) — only keeps the LAST value for a repeated key ("3"), not an array.
  // That's a minor fidelity gap in the mock's request-query reconstruction, not the real client's request
  // encoding, so this only checks the single value it actually gets back, not an array shape.
  const ok = out.getUser.id === 7 && out.getUser.name === 'User 7'
    && String(out.getEcho.q.a) === '1' && Array.isArray(out.getEcho.q.b) && out.getEcho.q.b.join() === '2,3'
    && out.postUser.id === 99 && out.postUser.name === 'Ada'
    && !!out.timeoutError && out.timeoutError.isTimeout === true
    && out.retrySucceeds.ok === true
    && !!out.abortResult && out.abortResult.isAbort === true
    && !!out.networkError && out.networkError.isNetwork === true
    && out.interceptors.sawReq && out.interceptors.sawRes
    && out.dedupe.hits === 1 && out.dedupe.d1.n === out.dedupe.d2.n
    && out.cache.sameN === true && out.cache.hitsAfterCache === 2
    && out.downloadProgressCalls
    && !!out.httpErrorFields && out.httpErrorFields.status === 422 && out.httpErrorFields.isClientError === true && out.httpErrorFields.hasData === true;
  return { ok, ...out };
})()
