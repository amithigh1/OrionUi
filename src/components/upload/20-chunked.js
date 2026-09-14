/* Upload — chunked & resumable uploads.
 *   fingerprint(file)            'u' + SHA-256(name|size|lastModified|type + first/last 64 KB), stable across reloads
 *   resumeStore(custom?)         { get, set, del } — custom store > Orion.idb (probed) > own IndexedDB > localStorage
 *   chunkedUpload(file, o, ctx)  parallel chunks, retries with exponential backoff, persisted progress, finalize hook
 *   tusUpload(file, o, ctx)      tus 1.0 core: creation POST, HEAD to resume, PATCH with Upload-Offset
 */

const RS_PREFIX = 'orion:upload:';
const RS_MAX_AGE = 7 * 864e5;

async function fingerprint(file) {
  const K = 65536;
  const parts = [file.slice(0, K)];
  if (file.size > K) parts.push(file.slice(Math.max(K, file.size - K)));
  const bytes = new Uint8Array(await new Blob(parts).arrayBuffer());
  const meta = new TextEncoder().encode([file.name, file.size, file.lastModified || 0, file.type].join('|') + '|');
  const all = new Uint8Array(meta.length + bytes.length); all.set(meta); all.set(bytes, meta.length);
  try {
    if (globalThis.crypto?.subtle) return 'u' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', all))].slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {}
  let h1 = 0x811c9dc5, h2 = 0x01000193; // FNV-1a pair (insecure contexts)
  for (let i = 0; i < all.length; i++) { h1 = Math.imul(h1 ^ all[i], 16777619) >>> 0; h2 = Math.imul(h2 ^ all[all.length - 1 - i], 2246822519) >>> 0; }
  return 'u' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + file.size.toString(16);
}

/* ── resume store ──────────────────────────────────────────────────── */
let __idbp = null, __pruned = false, __ext;
function idbOpen() {
  if (!__idbp) {
    __idbp = new Promise((res, rej) => {
      const r = indexedDB.open('orion-upload', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('resume');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('IndexedDB blocked'));
    });
    __idbp.catch(() => { __idbp = null; });
  }
  return __idbp;
}
const idbOp = (mode, fn) => idbOpen().then(db => new Promise((res, rej) => {
  const tx = db.transaction('resume', mode), rq = fn(tx.objectStore('resume'));
  tx.oncomplete = () => res(rq.result); tx.onerror = tx.onabort = () => rej(tx.error);
}));
const ownStore = {
  async get(k) { try { const v = await idbOp('readonly', s => s.get(k)); if (v != null) return v; } catch {} return ls.get(k, null); },
  async set(k, v) { try { await idbOp('readwrite', s => s.put(v, k)); } catch { ls.set(k, v); } },
  async del(k) { try { await idbOp('readwrite', s => s.delete(k)); } catch {} ls.del(k); },
};
async function pruneStore() {
  if (__pruned) return; __pruned = true;
  try {
    const keys = await idbOp('readonly', s => s.getAllKeys());
    for (const k of keys) { const v = await ownStore.get(k); if (!v || Date.now() - (v.updated || 0) > RS_MAX_AGE) await ownStore.del(k); }
  } catch {}
}
/** Orion.idb (services-a) is used when present and a set/get round-trip works. */
async function externalStore() {
  if (__ext !== undefined) return __ext;
  __ext = null;
  const x = O.idb, del = x && (x.del || x.delete || x.remove);
  if (x && isFn(x.get) && isFn(x.set) && isFn(del)) {
    try {
      const k = RS_PREFIX + '__probe';
      await x.set(k, { v: 1 });
      const r = await x.get(k);
      await del.call(x, k);
      if (r && r.v === 1) __ext = { get: k2 => x.get(k2), set: (k2, v) => x.set(k2, v), del: k2 => del.call(x, k2) };
    } catch {}
  }
  return __ext;
}
function resumeStore(custom) {
  const pick = async () => (custom && isFn(custom.get) ? custom : (await externalStore()) || (pruneStore(), ownStore));
  return {
    async get(id) { try { return (await (await pick()).get(RS_PREFIX + id)) || null; } catch { return null; } },
    async set(id, v) { try { await (await pick()).set(RS_PREFIX + id, v); } catch {} },
    async del(id) { try { await (await pick()).del(RS_PREFIX + id); } catch {} },
  };
}

/* ── retry helpers ─────────────────────────────────────────────────── */
function waitOnline(signal) {
  return new Promise((res, rej) => {
    if (!isBrowser || navigator.onLine !== false) return res();
    const off = () => { win.removeEventListener('online', on); signal?.removeEventListener('abort', ab); };
    const on = () => { off(); res(); };
    const ab = () => { off(); rej(abortError()); };
    win.addEventListener('online', on); signal?.addEventListener('abort', ab, { once: true });
  });
}
/** Exponential backoff with jitter (base * 2^attempt, max 30 s); waits for `online` first when offline. */
async function backoff(attempt, base = 1000, signal) {
  await waitOnline(signal);
  await abortableWait(Math.min(30000, base * 2 ** attempt) * (0.8 + Math.random() * 0.4), signal);
}
function linkedAbort(signal) {
  const ac = new AbortController();
  if (signal) { if (signal.aborted) ac.abort(); else signal.addEventListener('abort', () => ac.abort(), { once: true }); }
  return ac;
}

/* ── chunked upload ────────────────────────────────────────────────── */
async function defaultChunkRequest(chunk, o, onProgress, signal) {
  const { file, item } = chunk;
  const base = {
    url: resolveOpt(o.url, file, item), method: o.method || 'POST', body: chunk.blob,
    headers: {
      ...((await resolveOpt(o.headers, file, item)) || {}),
      'Content-Type': 'application/octet-stream', 'Content-Range': `bytes ${chunk.start}-${chunk.end - 1}/${chunk.total}`,
      'X-File-Id': chunk.fileId, 'X-File-Name': encodeURIComponent(file.name), 'X-Chunk-Index': chunk.index, 'X-Chunk-Count': chunk.count,
    },
  };
  const custom = isFn(o.chunkRequest) ? await o.chunkRequest(chunk, base) : null;
  const req = custom ? { ...base, ...custom, headers: { ...base.headers, ...(custom.headers || {}) } } : base;
  const res = await (o.request || xhrRequest)({ ...req, withCredentials: o.withCredentials, timeout: o.timeout, onProgress, signal });
  return okResponse(res);
}
/**
 * chunkedUpload(file, o, { item, onProgress(loaded,total), signal }) -> response
 * o: chunkSize, chunkParallel, retries, retryDelay, resumable, store, resumeOffset(fileId, file) -> bytes,
 *    uploader(file, { chunk, onProgress, signal }) | url/method/headers/request/chunkRequest(chunk, base), finalize(ctx)
 */
async function chunkedUpload(file, o, ctx) {
  const { item } = ctx, size = file.size, cs = Math.max(1, o.chunkSize | 0), count = Math.max(1, Math.ceil(size / cs));
  const fileId = item.fileId || (item.fileId = await fingerprint(file));
  const store = resumeStore(o.store);
  let done = item._chunks;
  if (!done || item._chunkSize !== cs) {
    const rec = o.resumable ? await store.get(fileId) : null;
    done = new Set(rec && rec.size === size && rec.chunkSize === cs ? rec.done : []);
  }
  if (isFn(o.resumeOffset)) { // server truth: every chunk that ends at or below the offset is done
    const off = +(await o.resumeOffset(fileId, file, item)) || 0;
    done = new Set([...Array(count).keys()].filter(i => Math.min(size, (i + 1) * cs) <= off));
  }
  item._chunks = done; item._chunkSize = cs;
  const bytesOf = i => Math.min(size, (i + 1) * cs) - i * cs;
  const inflight = new Map();
  const report = () => { let l = 0; done.forEach(i => { l += bytesOf(i); }); inflight.forEach(v => { l += v; }); ctx.onProgress(Math.min(l, size), size); };
  const persist = () => o.resumable && store.set(fileId, { id: fileId, name: file.name, size, chunkSize: cs, count, done: [...done], updated: Date.now() });
  const resumedBytes = [...done].reduce((s, i) => s + bytesOf(i), 0);
  if (resumedBytes) ctx.onResume?.(resumedBytes, size);
  report();
  const pending = [...Array(count).keys()].filter(i => !done.has(i));
  const ac = linkedAbort(ctx.signal);
  let last = null, next = 0;
  const send = async i => {
    const start = i * cs, end = Math.min(size, start + cs);
    const chunk = { index: i, start, end, size: end - start, total: size, count, fileId, blob: file.slice(start, end), file, item };
    for (let attempt = 0; ; attempt++) {
      inflight.set(i, 0);
      try {
        const onProgress = l => { if (inflight.has(i)) { inflight.set(i, Math.min(l, chunk.size)); report(); } };
        const res = o.uploader ? await o.uploader(file, { onProgress, signal: ac.signal, chunk, item }) : await defaultChunkRequest(chunk, o, onProgress, ac.signal);
        inflight.delete(i); done.add(i); last = res; report(); persist();
        return;
      } catch (e) {
        inflight.delete(i); report();
        if (isAbort(e) || ac.signal.aborted || attempt >= o.retries || e.retryable === false) throw e;
        item.attempts = (item.attempts || 0) + 1;
        await backoff(attempt, o.retryDelay, ac.signal);
      }
    }
  };
  const worker = async () => { while (next < pending.length && !ac.signal.aborted) await send(pending[next++]); };
  try { await Promise.all(Array.from({ length: Math.max(1, Math.min(o.chunkParallel || 3, pending.length)) }, worker)); }
  catch (e) { ac.abort(); throw e; }
  const response = isFn(o.finalize) ? await o.finalize({ fileId, file, item, count, chunkSize: cs, response: last }) : last;
  await store.del(fileId);
  item._chunks = null;
  return response;
}

/* ── tus 1.0 ───────────────────────────────────────────────────────── */
const b64 = s => btoa(unescape(encodeURIComponent(String(s))));
async function tusUpload(file, o, ctx) {
  const { item, signal } = ctx, size = file.size, req = o.request || xhrRequest;
  const fileId = item.fileId || (item.fileId = await fingerprint(file));
  const store = resumeStore(o.store);
  const TUS = { 'Tus-Resumable': '1.0.0', ...((await resolveOpt(o.headers, file, item)) || {}) };
  const call = p => req({ withCredentials: o.withCredentials, timeout: o.timeout, signal, ...p, headers: { ...TUS, ...(p.headers || {}) } });
  const head = async url => { const r = await call({ method: 'HEAD', url }); return r.status >= 200 && r.status < 300 ? +r.getHeader('upload-offset') : null; };
  let url = item._tusUrl || (o.resumable !== false ? (await store.get(fileId))?.tusUrl : null), offset = null;
  if (url) { try { offset = await head(url); } catch (e) { if (isAbort(e)) throw e; } }
  if (offset == null || Number.isNaN(offset)) {
    const endpoint = resolveOpt(o.url, file, item);
    const meta = { filename: file.name, filetype: typeOf(file), ...((await resolveOpt(o.metadata, file, item)) || {}) };
    const r = await call({ method: 'POST', url: endpoint, headers: { 'Upload-Length': size, 'Upload-Metadata': Object.entries(meta).map(([k, v]) => k + ' ' + b64(v)).join(',') } });
    if (r.status !== 201 || !r.getHeader('location')) throw httpError(r.status, r.response);
    url = new URL(r.getHeader('location'), new URL(endpoint, isBrowser ? location.href : 'http://localhost/')).href;
    offset = 0;
  }
  item._tusUrl = url;
  const persist = () => o.resumable !== false && store.set(fileId, { id: fileId, name: file.name, size, tusUrl: url, offset, updated: Date.now() });
  persist();
  if (offset > 0) ctx.onResume?.(offset, size);
  ctx.onProgress(offset, size);
  const cs = o.chunkSize > 0 ? o.chunkSize : size;
  for (let attempt = 0; offset < size;) {
    const from = offset, end = Math.min(size, from + cs);
    try {
      const r = await call({ method: 'PATCH', url, headers: { 'Upload-Offset': from, 'Content-Type': 'application/offset+octet-stream' }, body: file.slice(from, end), onProgress: l => ctx.onProgress(from + l, size) });
      if (r.status < 200 || r.status >= 300) throw httpError(r.status, r.response);
      offset = +r.getHeader('upload-offset') || end; attempt = 0;
      ctx.onProgress(offset, size); persist();
    } catch (e) {
      if (isAbort(e) || signal?.aborted || attempt >= o.retries || (e.retryable === false && e.status !== 409)) throw e;
      item.attempts = (item.attempts || 0) + 1;
      await backoff(attempt++, o.retryDelay, signal);
      const off = await head(url).catch(er => { if (isAbort(er)) throw er; return null; });
      if (off == null) throw httpError(404, null, 'Upload expired');
      offset = off;
    }
  }
  await store.del(fileId);
  return isFn(o.finalize) ? o.finalize({ fileId, file, item, url }) : { id: url.split('/').pop(), url, name: file.name, size };
}
