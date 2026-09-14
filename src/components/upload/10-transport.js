/* Upload — transports.
 *   xhrRequest({ method, url, headers, body, withCredentials, timeout, responseType, onProgress, onDownloadProgress, signal })
 *     -> Promise<{ status, response, getHeader(name), xhr }>   (the request primitive every mode uses; replaceable via `request`)
 *   xhrUploader(options) -> uploader(file, { onProgress, signal }) -> response   (multipart or binary body)
 *   mockUploader({ latency, failRate, speed, ... }) -> uploader with .request (tus / chunk server emulation), .server, .log
 */

const abortError = (msg = 'Aborted') => { const e = new Error(msg); e.name = 'AbortError'; return e; };
const isAbort = e => e && (e.name === 'AbortError' || e.aborted === true);
/** Error carrying the HTTP status and parsed body; `retryable` for network errors, 408, 429 and 5xx. */
function httpError(status, response, message) {
  const e = new Error(message || (status ? 'HTTP ' + status : 'Network error'));
  e.status = status; e.response = response;
  e.retryable = !status || status === 408 || status === 429 || status >= 500;
  return e;
}
function parseBody(xhr) {
  if (xhr.responseType && xhr.responseType !== 'text') return xhr.response;
  const txt = xhr.responseText;
  const ct = xhr.getResponseHeader('content-type') || '';
  if (/json/.test(ct) || /^\s*[{[]/.test(txt)) { const j = parseJSON(txt, undefined); if (j !== undefined) return j; }
  return txt;
}
function xhrRequest({ method = 'POST', url, headers = {}, body = null, withCredentials = false, timeout = 0, responseType = '', onProgress, onDownloadProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const xhr = new XMLHttpRequest();
    xhr.open(String(method).toUpperCase(), url, true);
    xhr.withCredentials = !!withCredentials;
    if (timeout) xhr.timeout = timeout;
    if (responseType) xhr.responseType = responseType;
    for (const k in headers) if (headers[k] != null) xhr.setRequestHeader(k, String(headers[k]));
    if (onProgress && xhr.upload) xhr.upload.onprogress = e => onProgress(e.loaded, e.lengthComputable ? e.total : (body?.size || 0));
    if (onDownloadProgress) xhr.onprogress = e => onDownloadProgress(e.loaded, e.lengthComputable ? e.total : 0);
    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const done = fn => (...a) => { signal?.removeEventListener('abort', onAbort); fn(...a); };
    xhr.onload = done(() => resolve({ status: xhr.status, response: parseBody(xhr), getHeader: n => xhr.getResponseHeader(n), xhr }));
    xhr.onerror = done(() => reject(httpError(0, null)));
    xhr.ontimeout = done(() => { const e = httpError(0, null, 'Timeout'); e.timeout = true; reject(e); });
    xhr.onabort = done(() => reject(abortError()));
    xhr.send(body);
  });
}
const resolveOpt = (v, ...args) => (isFn(v) ? v(...args) : v);
const okResponse = r => { if (r.status >= 200 && r.status < 300) return r.response; throw httpError(r.status, r.response, (isObj(r.response) && (r.response.message || r.response.error)) || undefined); };

/** Simple (whole file) uploader built from element / controller options. */
function xhrUploader(o) {
  return async (file, { onProgress, signal, item } = {}) => {
    const data = (await resolveOpt(o.data, file, item)) || {};
    const headers = { ...((await resolveOpt(o.headers, file, item)) || {}) };
    let body;
    if (o.binary) {
      body = file;
      if (!Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) headers['Content-Type'] = file.type || 'application/octet-stream';
    } else {
      body = new FormData();
      for (const k in data) toArr(data[k]).forEach(v => body.append(k, isObj(v) && !(v instanceof Blob) ? JSON.stringify(v) : v));
      body.append(o.fieldName || 'file', file, item?.relativePath || file.name);
    }
    const req = o.request || xhrRequest;
    const res = await req({ method: o.method || 'POST', url: resolveOpt(o.url, file, item), headers, body, withCredentials: o.withCredentials, timeout: o.timeout, onProgress, signal });
    const out = okResponse(res);
    return isFn(o.parseResponse) ? o.parseResponse(out, res) : out;
  };
}

/* ── mock transport (docs, tests, prototyping) ─────────────────────── */
function seededRandom(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
function abortableWait(ms, signal) {
  return new Promise((res, rej) => {
    if (signal?.aborted) return rej(abortError());
    const tm = setTimeout(() => { signal?.removeEventListener('abort', ab); res(); }, ms);
    const ab = () => { clearTimeout(tm); rej(abortError()); };
    signal?.addEventListener('abort', ab, { once: true });
  });
}
/**
 * mockUploader({ latency=250, failRate=0, speed=1.5e6 bytes/s, tick=50, seed, failOn(file, chunk), response(file) })
 * Returns an `uploader(file, { onProgress, signal, chunk })` that simulates progress, random failures and chunk
 * acceptance, plus `.request` (emulates a tus 1.0 / Content-Range chunk / multipart server for url-based modes),
 * `.server` (Map fileId -> { size, chunks:Set, ranges, offset, name }), `.log` (every attempt), `.received(fileId)`, `.reset()`.
 */
function mockUploader({ latency = 250, failRate = 0, speed = 1.5e6, tick = 50, seed, failOn, response } = {}) {
  const rnd = seed != null ? seededRandom(seed) : Math.random;
  const server = new Map(), log = [];
  let n = 0;
  const fileResponse = (file, id) => (response ? response(file) : { id: id || 'f' + (++n).toString(36) + Date.now().toString(36).slice(-4), name: file.name, size: file.size, type: file.type });
  const entryOf = (id, size, name) => { let e = server.get(id); if (!e) server.set(id, (e = { id, size, name, chunks: new Set(), ranges: [], offset: 0 })); return e; };
  const contiguous = e => { const r = [...e.ranges].sort((a, b) => a[0] - b[0]); let off = 0; for (const [s, en] of r) { if (s > off) break; off = Math.max(off, en); } return off; };
  // simulate sending `size` bytes: latency, ticks at `speed`, maybe fail mid-way
  async function transfer(size, onProgress, signal, fail) {
    await abortableWait(latency, signal);
    const failAt = fail ? size * (0.15 + rnd() * 0.6) : Infinity;
    let sent = 0;
    if (!size) { onProgress?.(0, 0); return; }
    while (sent < size) {
      await abortableWait(tick, signal);
      sent = Math.min(size, sent + Math.max(1, speed * tick / 1000));
      if (sent >= failAt) { const e = httpError(0, null, 'Mock network error'); throw e; }
      onProgress?.(sent, size);
    }
  }
  const shouldFail = (file, chunk) => (failOn ? !!failOn(file, chunk) : failRate > 0 && rnd() < failRate);

  async function uploader(file, { onProgress, signal, chunk } = {}) {
    const rec = { name: file.name, index: chunk ? chunk.index : null, start: chunk ? chunk.start : 0, end: chunk ? chunk.end : file.size, ok: false };
    log.push(rec);
    await transfer(chunk ? chunk.size : file.size, onProgress, signal, shouldFail(file, chunk));
    rec.ok = true;
    if (!chunk) return fileResponse(file);
    const e = entryOf(chunk.fileId, chunk.total, file.name);
    e.chunks.add(chunk.index); e.ranges.push([chunk.start, chunk.end]); e.offset = contiguous(e);
    if (e.offset >= e.size && !e.response) e.response = fileResponse(file, chunk.fileId);
    return e.offset >= e.size ? e.response : { ok: true, index: chunk.index, received: e.offset };
  }
  /** Request emulator: tus (Tus-Resumable header), Content-Range chunks, or plain multipart. */
  async function request({ method = 'POST', url = '', headers = {}, body, onProgress, signal } = {}) {
    const H = {}; for (const k in headers) H[k.toLowerCase()] = String(headers[k]);
    const reply = (status, response = null, hdrs = {}) => ({ status, response, getHeader: k => hdrs[k.toLowerCase()] ?? null });
    const m = String(method).toUpperCase();
    if (H['tus-resumable']) {
      const id = decodeURIComponent(url.split('/').pop());
      if (m === 'POST') {
        await abortableWait(latency, signal);
        const nid = 't' + (++n).toString(36) + Math.floor(rnd() * 1e6).toString(36);
        const meta = Object.fromEntries((H['upload-metadata'] || '').split(',').filter(Boolean).map(p => { const [k, v] = p.trim().split(' '); try { return [k, decodeURIComponent(escape(atob(v || '')))]; } catch { return [k, '']; } }));
        entryOf(nid, +H['upload-length'], meta.filename);
        log.push({ tus: 'create', id: nid });
        return reply(201, null, { location: url.replace(/\/$/, '') + '/' + nid, 'tus-resumable': '1.0.0' });
      }
      const e = server.get(id);
      if (!e) return reply(404);
      if (m === 'HEAD') { await abortableWait(latency / 2, signal); return reply(200, null, { 'upload-offset': String(e.offset), 'upload-length': String(e.size) }); }
      if (m === 'PATCH') {
        const off = +H['upload-offset'];
        if (off !== e.offset) return reply(409);
        const rec = { tus: 'patch', id, start: off, end: off + body.size, ok: false }; log.push(rec);
        await transfer(body.size, onProgress, signal, shouldFail({ name: e.name, size: e.size }, { start: off, end: off + body.size }));
        e.offset += body.size; e.ranges.push([off, e.offset]); rec.ok = true;
        return reply(204, null, { 'upload-offset': String(e.offset) });
      }
      return reply(405);
    }
    const range = (H['content-range'] || '').match(/bytes (\d+)-(\d+)\/(\d+)/);
    if (range) {
      const [s, en, total] = [+range[1], +range[2] + 1, +range[3]];
      const fid = H['x-file-id'] || url, e = entryOf(fid, total, decodeURIComponent(H['x-file-name'] || ''));
      const rec = { name: e.name, index: +H['x-chunk-index'], start: s, end: en, ok: false }; log.push(rec);
      await transfer(en - s, onProgress, signal, shouldFail({ name: e.name, size: total }, { index: rec.index, start: s, end: en }));
      e.chunks.add(rec.index); e.ranges.push([s, en]); e.offset = contiguous(e); rec.ok = true;
      if (e.offset >= e.size && !e.response) e.response = fileResponse({ name: e.name, size: e.size, type: '' }, fid);
      return reply(200, e.offset >= e.size ? e.response : { ok: true, received: e.offset });
    }
    const file = body instanceof FormData ? [...body.values()].find(v => v instanceof Blob) : body;
    return reply(200, await uploader(file || new Blob([]), { onProgress, signal }));
  }
  uploader.request = request;
  uploader.server = server;
  uploader.log = log;
  uploader.isMock = true;
  uploader.received = id => server.get(id)?.offset || 0;
  uploader.reset = () => { server.clear(); log.length = 0; };
  return uploader;
}

/* ── download with progress (services-a's Orion.http.download is preferred when present) ── */
function nameFromDisposition(v) {
  const m = String(v || '').match(/filename\*=(?:UTF-8'')?([^;]+)|filename="?([^";]+)"?/i);
  if (!m) return '';
  try { return decodeURIComponent((m[1] || m[2]).trim()); } catch { return (m[1] || m[2]).trim(); }
}
async function builtinDownload(url, { onProgress, filename, save, signal, headers, withCredentials, method = 'GET', request } = {}) {
  const res = await (request || xhrRequest)({ method, url, headers, withCredentials, signal, responseType: 'blob', onDownloadProgress: onProgress ? (l, tt) => onProgress({ loaded: l, total: tt, percent: tt ? Math.round(l / tt * 100) : null }) : null });
  if (res.status < 200 || res.status >= 300) throw httpError(res.status, res.response);
  const blob = res.response;
  if (save ?? filename != null) download(blob, filename || nameFromDisposition(res.getHeader('content-disposition')) || decodeURIComponent(String(url).split(/[?#]/)[0].split('/').pop()) || 'download');
  return blob;
}
