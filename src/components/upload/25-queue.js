/* Upload — the queue/controller shared by <o-upload> and Orion.upload() (no DOM).
 * Item: { id, file, original, name, size, type, relativePath, source, status, progress: { loaded, total, percent, speed, eta },
 *         error, reason, response, serverId, url, preview, remote, chunked, fileId, attempts, scheduled, meta }
 * status: validating | processing | queued | uploading | paused | done | error | canceled | rejected
 * Events (Emitter): add, reject, remove, start, progress, success, error, complete, change, pause, resume, cancel, retry, sort, resumed
 */

const BUSY = new Set(['validating', 'processing', 'uploading']);
function pickId(res, key = 'id') {
  if (res == null) return null;
  if (isStr(res) || isNum(res)) return res;
  if (isObj(res)) return getPath(res, key) ?? res.id ?? res.key ?? res.url ?? res.location ?? null;
  return null;
}
function uploadErrorMessage(e, tr) {
  if (e?.timeout) return tr('upload.errors.timeout');
  if (e?.status) { const r = e.response, m = isObj(r) && (r.message || r.error); return isStr(m) && m ? m : tr('upload.errors.server', { status: e.status }); }
  if (e && e.status === 0) return tr('upload.errors.network');
  return (e && e.message) || tr('upload.errors.network');
}
function normQueueOpts(src) {
  const o = normRules(src || {});
  o.parallel = Math.max(1, +src.parallel || 3);
  o.chunkParallel = Math.max(1, +src.chunkParallel || 3);
  o.chunkSize = parseSize(src.chunkSize);
  o.retries = src.retries == null || src.retries === '' ? 3 : Math.max(0, +src.retries);
  o.retryDelay = src.retryDelay == null || src.retryDelay === '' ? 1000 : Math.max(0, +src.retryDelay);
  o.hasTransport = !!(src.uploader || src.url);
  o.multiple = src.multiple !== false;
  o.t = src.t || t;
  return o;
}

class UploadQueue extends Emitter {
  /** new UploadQueue(options | () => options) — a function is re-read on every operation (live element props). */
  constructor(opts) {
    super();
    this.items = [];
    this._get = isFn(opts) ? opts : () => opts || {};
    this._chain = Promise.resolve();
    this._active = false;
  }
  get o() { return normQueueOpts(this._get()); }
  get(id) { return this.items.find(x => x.id === id || x === id) || null; }
  _sel(id) { return id == null ? [...this.items] : [this.get(id)].filter(Boolean); }
  /** Accepted (non-rejected) items, in order. */
  accepted() { return this.items.filter(x => x.status !== 'rejected'); }
  _change(reason, item) { this.emit('change', { reason, item }); }

  _make(file, source) {
    return {
      id: uid('file'), file, original: null, name: file.name || 'file', size: file.size, type: typeOf(file), relativePath: pathOf(file), source,
      status: 'validating', progress: { loaded: 0, total: file.size, percent: 0, speed: 0, eta: null }, error: null, reason: null,
      response: null, serverId: null, url: null, preview: null, remote: false, chunked: false, fileId: null, attempts: 0, scheduled: false, meta: {},
    };
  }
  /** add(files, { source }) -> Promise<{ accepted, rejected }>; batches are validated one after the other. */
  add(list, { source = 'api' } = {}) {
    const o = this.o;
    let files = toArr(list).filter(f => f instanceof Blob);
    if (!files.length) return Promise.resolve({ accepted: [], rejected: [] });
    if (!o.multiple) { files = files.slice(0, 1); this.items.filter(x => x.status === 'rejected').forEach(x => this._drop(x, true)); }
    const batch = files.map(f => this._make(f instanceof File ? f : new File([f], 'blob', { type: f.type }), source));
    this.items.push(...batch);
    this._change('add');
    const run = async () => {
      const accepted = [], rejected = [];
      for (const it of batch) {
        if (!this.items.includes(it)) continue;
        let err;
        try { err = await this._validate(it, this.o); } catch (e) { err = vErr('custom', e.message || o.t('upload.errors.invalid')); }
        if (!this.items.includes(it)) continue;
        if (err) {
          it.status = 'rejected'; it.reason = err.reason; it.error = err.message;
          rejected.push(it); this.emit('reject', it, err);
        } else {
          if (!o.multiple) this.items.filter(x => x !== it).forEach(x => this._drop(x, true));
          it.status = 'queued'; accepted.push(it);
          this._thumb(it);
          this.emit('add', it);
        }
        this._change('validate', it);
      }
      if (accepted.length && this._get().auto) this.upload();
      return { accepted, rejected };
    };
    const p = this._chain.then(run, run);
    this._chain = p.catch(noop);
    return p;
  }
  async _validate(it, o) {
    const others = this.items.filter(x => x !== it && x.status !== 'rejected' && x.status !== 'validating');
    const single = !o.multiple;
    const ctx = { items: others, count: single ? 0 : others.length, bytes: single ? 0 : others.reduce((s, x) => s + (x.size || 0), 0) };
    const pre = await checkBefore(it.file, o, ctx);
    if (pre) return pre;
    const src = this._get();
    if (src.crop || src.compress) {
      it.status = 'processing'; this._change('process', it);
      let f = it.file;
      if (src.crop) { f = await cropImage(f, src.crop); if (!f) return vErr('crop', o.t('upload.errors.crop')); }
      if (src.compress) { try { f = await compressImage(f, src.compress); } catch (e) { console.warn('[Orion] upload: compression failed', e); } }
      if (f !== it.file) {
        if (pathOf(it.file)) __paths.set(f, pathOf(it.file));
        it.original = it.file; it.file = f; it.size = f.size; it.type = typeOf(f); it.name = f.name; it.progress.total = f.size;
      }
    }
    return checkAfter(it.file, o, ctx);
  }
  _thumb(it) {
    const src = this._get();
    if (src.previews === false || !it.file || it.preview || !/^(image|video)\//.test(it.type)) return;
    it._thumbing = true;
    thumbnail(it.file, src.thumbSize || 160).then(url => {
      it._thumbing = false;
      if (!url) return;
      if (!this.items.includes(it) || this._suspended) { URL.revokeObjectURL(url); return; }
      it.preview = url; it._ownPreview = true;
      this._change('preview', it);
    });
  }
  /** Pre-existing server files: [{ id, name, size, type, url, thumbnail }] | 'url' — shown as uploaded. */
  addRemote(list) {
    const added = toArr(list).filter(Boolean).map(d => {
      const x = isStr(d) ? { url: d } : d;
      const name = x.name || decodeURIComponent(String(x.url || 'file').split(/[?#]/)[0].split('/').pop()) || 'file';
      const type = x.type || mimeOf(name);
      return {
        ...this._make({ name, size: +x.size || 0, type }, 'value'), file: null, remote: true, status: 'done', type,
        serverId: x.id ?? x.url ?? null, url: x.url || null, response: x, preview: x.thumbnail || (/^image\//.test(type) ? x.url : null) || null,
        progress: { loaded: +x.size || 0, total: +x.size || 0, percent: 100, speed: 0, eta: null },
      };
    });
    this.items.push(...added);
    this._change('value');
    return added;
  }

  /* ── running ── */
  /** upload(id?) — schedule queued (or canceled, when targeted) items and start them. */
  upload(id) {
    const o = this.o;
    if (!o.hasTransport) return false;
    let n = 0;
    for (const it of this._sel(id)) {
      if (it.status === 'queued' || (id != null && it.status === 'canceled')) { it.status = 'queued'; it.scheduled = true; n++; }
    }
    if (n) { this._active = true; this._change('schedule'); }
    this._pump();
    return n > 0;
  }
  _pump() {
    const o = this.o;
    let active = this.items.filter(x => x.status === 'uploading').length;
    for (const it of this.items) {
      if (active >= o.parallel) break;
      if (it.status === 'queued' && it.scheduled) { active++; this._run(it, o); }
    }
    this._checkComplete();
  }
  async _run(it, o) {
    const ac = new AbortController();
    it._ac = ac; it.status = 'uploading'; it.error = null; it.reason = null; it._offline = false; it._samples = [];
    it.progress.speed = 0; it.progress.eta = null;
    const src = this._get();
    const opts = { ...src, ...o, uploader: src.uploader, request: src.request };
    const ctx = { item: it, signal: ac.signal, onProgress: (l, tt) => it._ac === ac && this._progress(it, l, tt), onResume: (b, tt) => this.emit('resumed', it, b, tt) };
    this.emit('start', it);
    this._change('status', it);
    try {
      const tus = src.protocol === 'tus';
      it.chunked = tus || (o.chunkSize > 0 && it.file.size > o.chunkSize);
      const res = tus ? await tusUpload(it.file, opts, ctx) : it.chunked ? await chunkedUpload(it.file, opts, ctx) : await this._simple(it, opts, ctx);
      if (it._ac !== ac) return;
      Object.assign(it, { _ac: null, status: 'done', response: res, serverId: pickId(res, src.valueKey || 'id'), scheduled: false });
      if (isObj(res) && isStr(res.url)) it.url = res.url;
      Object.assign(it.progress, { loaded: it.size, total: it.size, percent: 100, eta: 0 });
      this.emit('success', it, res);
    } catch (e) {
      if (it._ac !== ac) return;
      it._ac = null;
      if (isAbort(e)) { if (it.status === 'uploading') it.status = 'paused'; }
      else if (isBrowser && navigator.onLine === false) { it.status = 'paused'; it._offline = true; }
      else { Object.assign(it, { status: 'error', error: uploadErrorMessage(e, o.t), reason: 'upload', scheduled: false, lastError: e }); this.emit('error', it, e); }
    }
    this._change('status', it);
    this._pump();
  }
  async _simple(it, o, ctx) {
    const up = o.uploader || xhrUploader(o);
    for (let attempt = 0; ; attempt++) {
      try { return await up(it.file, { onProgress: ctx.onProgress, signal: ctx.signal, item: it }); }
      catch (e) {
        if (isAbort(e) || ctx.signal.aborted || attempt >= o.retries || e?.retryable === false) throw e;
        it.attempts++; ctx.onProgress(0, it.file.size);
        await backoff(attempt, o.retryDelay, ctx.signal);
      }
    }
  }
  _progress(it, loaded, total) {
    const p = it.progress, now = isBrowser ? performance.now() : Date.now();
    p.total = total || it.size; p.loaded = Math.min(loaded, p.total);
    p.percent = p.total ? Math.min(99, Math.floor((p.loaded / p.total) * 100)) : 0;
    const s = it._samples || (it._samples = []);
    s.push([now, p.loaded]);
    while (s.length > 2 && now - s[0][0] > 3000) s.shift();
    const dt = (now - s[0][0]) / 1000;
    if (dt > 0.35) {
      const sp = (p.loaded - s[0][1]) / dt;
      if (sp > 0) { p.speed = p.speed ? p.speed * 0.6 + sp * 0.4 : sp; p.eta = (p.total - p.loaded) / p.speed; }
    }
    this.emit('progress', it);
  }
  _checkComplete() {
    if (!this._active) return;
    if (this.items.some(x => x.status === 'uploading' || x.status === 'paused' || (x.status === 'queued' && x.scheduled) || x.status === 'validating' || x.status === 'processing')) return;
    this._active = false;
    const ran = this.items.filter(x => !x.remote && (x.status === 'done' || x.status === 'error' || x.status === 'canceled'));
    this.emit('complete', { files: ran.filter(x => x.status === 'done'), failed: ran.filter(x => x.status !== 'done') });
  }
  /** Overall numbers for the summary UI. */
  stats() {
    const list = this.items.filter(x => !x.remote && x.status !== 'rejected');
    const st = { count: list.length, done: 0, error: 0, uploading: 0, paused: 0, queued: 0, scheduled: 0, loaded: 0, total: 0, speed: 0, eta: null, offline: false };
    for (const x of list) {
      st.total += x.size;
      st.loaded += x.status === 'done' ? x.size : x.progress.loaded || 0;
      if (x.status === 'done') st.done++;
      else if (x.status === 'error' || x.status === 'canceled') st.error++;
      else if (x.status === 'uploading') { st.uploading++; st.speed += x.progress.speed || 0; }
      else if (x.status === 'paused') { st.paused++; if (x._offline) st.offline = true; }
      else if (x.status === 'queued') { st.queued++; if (x.scheduled) st.scheduled++; }
    }
    st.percent = st.total ? Math.min(100, Math.floor((st.loaded / st.total) * 100)) : 0;
    if (st.speed > 0) st.eta = (st.total - st.loaded) / st.speed;
    return st;
  }

  /* ── controls ── */
  _abort(it, status) { const ac = it._ac; it._ac = null; if (status) it.status = status; ac?.abort(); }
  pause(id) {
    for (const it of this._sel(id)) {
      if (it.status === 'uploading') this._abort(it, 'paused');
      else if (it.status === 'queued' && it.scheduled) it.status = 'paused';
      else continue;
      it._offline = false; this.emit('pause', it);
    }
    this._change('pause'); this._pump();
  }
  resume(id) {
    for (const it of this._sel(id)) if (it.status === 'paused') { it.status = 'queued'; it.scheduled = true; it._offline = false; this._active = true; this.emit('resume', it); }
    this._change('resume'); this._pump();
  }
  cancel(id) {
    for (const it of this._sel(id)) {
      if (!['uploading', 'paused', 'queued'].includes(it.status) || it.remote) continue;
      this._abort(it, 'canceled');
      it.scheduled = false; it._chunks = null; it._tusUrl = null; it.error = this.o.t('upload.errors.abort'); it.reason = 'canceled';
      Object.assign(it.progress, { loaded: 0, percent: 0, speed: 0, eta: null });
      if (it.fileId) resumeStore(this._get().store).del(it.fileId);
      this.emit('cancel', it);
    }
    this._change('cancel'); this._pump();
  }
  retry(id) {
    if (!this.o.hasTransport) return;
    for (const it of this._sel(id)) {
      if (it.status !== 'error' && it.status !== 'canceled') continue;
      Object.assign(it, { status: 'queued', scheduled: true, attempts: 0, error: null, reason: null });
      this._active = true; this.emit('retry', it);
    }
    this._change('retry'); this._pump();
  }
  _drop(it, quiet) {
    const i = this.items.indexOf(it);
    if (i < 0) return;
    if (it.status === 'uploading') this._abort(it);
    this.items.splice(i, 1);
    if (it._ownPreview && it.preview) URL.revokeObjectURL(it.preview);
    it.preview = null;
    if (it.fileId && it.status !== 'done') resumeStore(this._get().store).del(it.fileId);
    this.emit('remove', it, quiet);
  }
  remove(id) { const it = this.get(id); if (!it) return false; this._drop(it); this._change('remove', it); this._pump(); return true; }
  clear(filter) { const list = this.items.filter(x => !filter || filter(x)); list.forEach(x => this._drop(x, true)); this._change('clear'); this._pump(); return list.length; }
  /** move(id, delta) / reorder([ids]) */
  move(id, delta) {
    const i = this.items.findIndex(x => x.id === id), j = clamp(i + delta, 0, this.items.length - 1);
    if (i < 0 || i === j) return false;
    const [it] = this.items.splice(i, 1); this.items.splice(j, 0, it);
    this.emit('sort', it, j); this._change('sort', it);
    return true;
  }
  reorder(ids) {
    const map = new Map(this.items.map(x => [x.id, x]));
    const next = ids.map(id => map.get(id)).filter(Boolean);
    this.items.forEach(x => { if (!next.includes(x)) next.push(x); });
    if (next.every((x, i) => x === this.items[i])) return false;
    this.items = next; this.emit('sort', null); this._change('sort');
    return true;
  }

  /* ── lifecycle ── */
  /** Network awareness: pause on offline, resume on online. Returns off(). */
  bindNetwork() {
    if (!isBrowser) return noop;
    const off = on(win, 'online offline', () => this.setOnline(navigator.onLine !== false));
    return off;
  }
  setOnline(online) {
    if (!online) {
      for (const it of this.items) if (it.status === 'uploading') { this._abort(it, 'paused'); it._offline = true; }
      this.emit('offline'); this._change('offline');
    } else {
      const list = this.items.filter(x => x.status === 'paused' && x._offline);
      list.forEach(x => { x.status = 'queued'; x.scheduled = true; x._offline = false; });
      this.emit('online', list); this._change('online'); this._pump();
    }
  }
  /** Detach (element removed from the DOM): abort requests, release previews; unsuspend() restores both. */
  suspend() {
    this._suspended = true;
    for (const it of this.items) {
      if (it.status === 'uploading') { this._abort(it, 'paused'); it._detached = true; }
      if (it._ownPreview && it.preview) { URL.revokeObjectURL(it.preview); it.preview = null; it._ownPreview = false; }
    }
  }
  unsuspend() {
    this._suspended = false;
    for (const it of this.items) {
      if (it.status !== 'rejected' && it.file && !it.preview) this._thumb(it);
      if (it._detached) { it._detached = false; if (it.status === 'paused') { it.status = 'queued'; it.scheduled = true; } }
    }
    this._change('reattach'); this._pump();
  }
  destroy() { this.suspend(); this.items.forEach(it => this._abort(it)); this.off(); }
}

/** Orion.upload(files, options) -> controller (no UI). Uploads automatically unless { auto: false }. */
function createUploadController(files, options = {}) {
  const opts = { auto: true, previews: false, ...options };
  const q = new UploadQueue(() => opts);
  const offNet = q.bindNetwork();
  let settle;
  const done = new Promise(r => { settle = r; });
  q.on('complete', d => settle(d));
  for (const k of ['add', 'reject', 'remove', 'start', 'progress', 'success', 'error', 'complete', 'change', 'pause', 'resume', 'cancel', 'retry']) {
    const fn = options['on' + cap(k)];
    if (isFn(fn)) q.on(k, fn);
  }
  const add = f => q.add(f).then(r => { if (!r.accepted.length && !q._active && !q.items.some(x => BUSY.has(x.status))) settle({ files: [], failed: [], rejected: r.rejected }); return r; });
  const ctl = {
    queue: q, done,
    get files() { return q.items.slice(); },
    get stats() { return q.stats(); },
    add, upload: id => q.upload(id), remove: id => q.remove(id), clear: () => q.clear(),
    pause: id => q.pause(id), resume: id => q.resume(id), cancel: id => q.cancel(id), retry: id => q.retry(id),
    set: patch => Object.assign(opts, patch),
    on: (n, fn) => q.on(n, fn), off: (n, fn) => q.off(n, fn), once: (n, fn) => q.once(n, fn),
    destroy() { offNet(); q.destroy(); },
  };
  if (files) add(files);
  return ctl;
}
