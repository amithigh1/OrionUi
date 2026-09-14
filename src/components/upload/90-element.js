/* <o-upload> — form-associated file upload (dropzone, button, compact, avatar, gallery, inline) + Orion.upload namespace. */

const UP_VARIANTS = ['dropzone', 'button', 'compact', 'avatar', 'gallery', 'inline'];
const PENDING_ST = new Set(['validating', 'processing', 'queued', 'uploading', 'paused']);
const objOpt = v => (v == null || v === false || v === 'false' ? null : v === '' || v === true || v === 'true' ? {} : isStr(v) ? parseJSON(v, {}) : v);

class OUpload extends FormElement {
  static props = {
    ...FormElement.props,
    multiple: Boolean, accept: String, directory: Boolean, capture: String,
    maxFiles: Number, maxSize: Any, minSize: Any, totalMaxSize: Any,
    minWidth: Number, maxWidth: Number, minHeight: Number, maxHeight: Number,
    allowDuplicates: Boolean, sniff: { type: Boolean, default: true }, validate: Function,
    url: Any, method: { type: String, default: 'POST' }, fieldName: { type: String, default: 'file' }, headers: Any, data: Any,
    withCredentials: Boolean, timeout: Number, binary: Boolean, uploader: Function, request: Function, parseResponse: Function,
    auto: Boolean, manual: Boolean, parallel: { type: Number, default: 3 }, retries: { type: Number, default: 3 }, retryDelay: { type: Number, default: 1000 },
    chunkSize: Any, chunkParallel: { type: Number, default: 3 }, resumable: Boolean, protocol: String, metadata: Any,
    chunkRequest: Function, finalize: Function, resumeOffset: Function, store: { type: Object, attr: false },
    compress: Any, crop: Any, previews: { type: Boolean, default: true }, thumbSize: { type: Number, default: 160 },
    variant: { type: String, default: 'dropzone', reflect: true }, paste: { type: String, default: 'element' }, dropTarget: String,
    sortable: Boolean, summary: { type: Boolean, default: true }, label: String, hint: String,
    submit: { type: String, default: 'auto' }, valueKey: { type: String, default: 'id' }, texts: Object,
  };

  /* ── value: File[] (files mode) or server ids (response mode); setting it shows existing server files ── */
  get value() {
    if (!this._q) return this._p.value ?? null;
    const acc = this._q.accepted();
    if (this._submitMode() === 'files') return acc.map(x => x.file || x.response).filter(Boolean);
    return acc.filter(x => x.status === 'done').map(x => x.serverId).filter(v => v != null);
  }
  set value(v) {
    if (!this._setupDone) { this._p.value = v; return; }
    this._importValue(v);
    this._syncForm();
  }

  setup() {
    this.classList.add('o-upload');
    const kids = [...this.childNodes].filter(n => n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim()));
    if (kids.length) { this._custom = h('span', { class: 'o-upload-custom' }); this._custom.append(...kids); }
    const hid = uid('upload-hint');
    this._input = h('input', { type: 'file', class: 'o-upload-input', tabindex: '-1', 'aria-hidden': 'true' });
    this._zone = h('button', { type: 'button', class: 'o-upload-zone', id: uid('upload'), 'aria-describedby': hid });
    this._hint = h('span', { class: 'o-upload-hint', id: hid });
    this._boxBtn = h('button', { type: 'button', class: 'o-upload-box-btn', hidden: true, 'data-act': 'remove' }, iconNode('x'));
    this._box = h('div', { class: 'o-upload-box' }, this._zone, this._hint, this._boxBtn);
    this._msg = h('div', { class: 'o-upload-msg', hidden: true });
    this._sum = buildSummary();
    this._list = h('ul', { class: 'o-upload-list', hidden: true });
    this.replaceChildren(this._input, this._box, this._msg, this._sum.root, this._list);
    this.focusTarget = this._zone;
    this._locale = 0; this._annStep = 0;
    this._q = new UploadQueue(() => this._opts());
    this._q.on('*', (name, ...a) => this._onQueue(name, ...a));
    this._paint = rafThrottle(() => this._render());
    this._nav = new ListNav(this._list, { items: '.o-upload-item', loop: false, typeahead: false, orientation: 'vertical', columns: () => this._columns() });

    on(this._zone, 'click', () => this.browse());
    on(this._box, 'click', e => { if (e.target === this._box || e.target === this._hint) this.browse(); });
    on(this, 'click', e => { if (e.target === this) this.browse(); });
    on(this._input, 'change', () => { const files = [...this._input.files]; this._input.value = ''; if (files.length) this.addFiles(files, 'picker'); });
    on(this, 'dragenter dragover', e => this._dragOver(e));
    on(this, 'drop', e => this._drop(e));
    on(this, 'paste', e => { if (this.paste === 'element') this._pasteEvt(e); });
    on(this, 'click', '[data-act]', (e, b) => this._action(b.dataset.act, b.dataset.id || b.closest('[data-id]')?.dataset.id));
    on(this, 'click', '[data-bulk]', (e, b) => this._bulk(b.dataset.bulk));
    on(this._list, 'keydown', e => this._listKey(e));
    on(this._list, 'focusin', e => {
      const li = e.target.closest?.('.o-upload-item');
      if (!li) return;
      for (const x of this._list.children) x.tabIndex = x === li ? 0 : -1;
      this._nav.index = this._nav.items.indexOf(li);
    });
    // built-in sortable (keyboard: Alt + arrows)
    on(this._list, 'dragstart', '.o-upload-item', (e, li) => {
      if (!this.sortable || this.isDisabled) return;
      this._dragLi = li; li.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-orion-upload', li.dataset.id);
    });
    on(this._list, 'dragover', e => {
      if (!this._dragLi) return;
      e.preventDefault();
      const over = e.target.closest?.('.o-upload-item');
      if (!over || over === this._dragLi) return;
      const r = over.getBoundingClientRect(), grid = this.variant === 'gallery';
      const after = grid ? (isRTL(this) ? e.clientX < r.left + r.width / 2 : e.clientX > r.left + r.width / 2) : e.clientY > r.top + r.height / 2;
      over[after ? 'after' : 'before'](this._dragLi);
    });
    on(this._list, 'drop', e => { if (this._dragLi) e.preventDefault(); });
    on(this._list, 'dragend', () => {
      const li = this._dragLi; if (!li) return;
      this._dragLi = null; li.classList.remove('is-dragging');
      if (this._q.reorder($$('.o-upload-item', this._list).map(x => x.dataset.id))) this._notifyChange();
    });
  }
  connected() {
    clearTimeout(this._detachT);
    if (this._detached) { this._detached = false; this._q.unsuspend(); }
    this.addCleanup(this._q.bindNetwork());
    if (this.paste === 'window') {
      this.listen(doc, 'paste', e => {
        const up = e.target?.closest?.('o-upload');
        if (e.defaultPrevented || (up && up !== this) || e.target?.closest?.('[contenteditable]:not([contenteditable="false"])')) return;
        this._pasteEvt(e);
      });
    }
    this._bindDropTarget();
    const lab = this.labels?.[0];
    if (lab) { lab.id = lab.id || uid('upload-label'); this._zone.setAttribute('aria-labelledby', lab.id + ' ' + this._zone.id); }
  }
  disconnected() {
    this._hideOverlay();
    this._detachT = setTimeout(() => { if (!this.isConnected) { this._detached = true; this._q.suspend(); this._overlay?.remove(); this._overlay = null; } }, 0);
  }
  update(changed) {
    const init = changed.has('init');
    if (init && this._p.value != null) { this._initialValue = clone(this._p.value); this._importValue(this._p.value); }
    if (changed.has('locale')) this._locale++;
    if (init || changed.has('variant')) {
      UP_VARIANTS.forEach(v => this.classList.remove('o-upload-' + v));
      this.classList.add('o-upload-' + (UP_VARIANTS.includes(this.variant) ? this.variant : 'dropzone'));
      this._nav.o.orientation = this.variant === 'gallery' ? 'grid' : 'vertical';
    }
    const inp = this._input, single = !this.multiple || this.variant === 'avatar';
    inp.multiple = !single;
    inp.accept = this._accept();
    inp.webkitdirectory = !!this.directory;
    if (this.capture) inp.setAttribute('capture', this.capture); else inp.removeAttribute('capture');
    inp.disabled = this.isDisabled;
    this._zone.disabled = this.isDisabled;
    this._zone.toggleAttribute('aria-disabled', !!this.readonly);
    if (this.readonly) this._zone.setAttribute('aria-disabled', 'true');
    this.classList.toggle('is-disabled', this.isDisabled);
    if (['init', 'variant', 'multiple', 'accept', 'maxSize', 'totalMaxSize', 'maxFiles', 'label', 'hint', 'directory', 'texts', 'locale'].some(k => changed.has(k))) renderZone(this);
    if ((changed.has('url') || changed.has('uploader') || changed.has('auto') || changed.has('manual')) && !init && this._opts().auto) this._q.upload();
    if (changed.has('dropTarget') && !init && this.isConnected) this._bindDropTarget();
    this._render();
  }

  /* ── options ── */
  _hasTransport() { return !!(this.uploader || this.url); }
  _submitMode() { return this.submit === 'files' || this.submit === 'response' ? this.submit : this._hasTransport() ? 'response' : 'files'; }
  _accept() { return this.accept || (this.variant === 'avatar' ? 'image/*' : ''); }
  _opts() {
    const single = !this.multiple || this.variant === 'avatar';
    return {
      accept: this._accept(), sniff: this.sniff, multiple: !single, maxFiles: single ? 0 : this.maxFiles, maxSize: this.maxSize, minSize: this.minSize,
      totalMaxSize: this.totalMaxSize, minWidth: this.minWidth, maxWidth: this.maxWidth, minHeight: this.minHeight, maxHeight: this.maxHeight,
      allowDuplicates: this.allowDuplicates, validate: this.validate,
      url: this.url, method: this.method, fieldName: this.fieldName, headers: this.headers, data: this.data, withCredentials: this.withCredentials,
      timeout: this.timeout, binary: this.binary, uploader: this.uploader, request: this.request, parseResponse: this.parseResponse,
      parallel: this.parallel, retries: this.retries, retryDelay: this.retryDelay, chunkSize: this.chunkSize, chunkParallel: this.chunkParallel,
      resumable: this.resumable, protocol: this.protocol, metadata: this.metadata, chunkRequest: this.chunkRequest, finalize: this.finalize,
      resumeOffset: this.resumeOffset, store: this.store, compress: objOpt(this.compress), crop: objOpt(this.crop),
      previews: this.previews, thumbSize: this.thumbSize, valueKey: this.valueKey,
      auto: this._hasTransport() && (this.auto || !this.manual), t: (k, p) => this.t(k, p),
    };
  }

  /* ── public API ── */
  /** addFiles(files, source='api') -> Promise<{ accepted, rejected }> */
  addFiles(files, source = 'api') {
    if (this.readonly && source !== 'api') return Promise.resolve({ accepted: [], rejected: [] });
    return this._q.add(files, { source }).then(r => {
      if (r.accepted.length && source !== 'value') { this._notifyChange(); if (this.multiple || r.accepted.length > 1) announce(this.t('upload.added', { count: r.accepted.length })); }
      return r;
    });
  }
  removeFile(id) { const it = this._q.get(id); if (!it || !this.emit('before-remove', { file: it.file, item: it })) return false; const ok = this._q.remove(id); if (ok) { announce(this.t('upload.announce.removed', { name: it.name })); this._notifyChange(); } return ok; }
  clear() { const n = this._q.clear(); if (n) this._notifyChange(); return n; }
  upload(id) { return this._q.upload(id); }
  pause(id) { this._q.pause(id); }
  resume(id) { this._q.resume(id); }
  cancel(id) { this._q.cancel(id); }
  retry(id) { this._q.retry(id); }
  getFiles() { return this._q.items.slice(); }
  stats() { return this._q.stats(); }
  get queue() { return this._q; }
  /** Open the native file picker. */
  browse() { if (this.isDisabled || this.readonly) return; this._input.click(); }
  /** Preview a file: Orion.preview (media package) when present, otherwise a new tab. */
  preview(id) {
    const it = this._q.get(id);
    if (!it || (!it.file && !it.url) || !this.emit('preview', { file: it.file, item: it })) return;
    if (isFn(O.preview)) { try { O.preview(it.file || it.url, { name: it.name, type: it.type, url: it.url }); return; } catch (e) { console.warn('[Orion] upload: Orion.preview failed', e); } }
    const url = it.file ? URL.createObjectURL(it.file) : it.url;
    win.open(url, '_blank', 'noopener');
    if (it.file) setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /* ── forms ── */
  // NOTE: this helper is intentionally NOT named `_changed` — OElement's base constructor already
  // owns `this._changed` as a Set (pending prop-change tracking); shadowing it with a method here
  // would make every `this._changed()` call throw "this._changed is not a function".
  isEmpty() { return !this._q || !this._q.accepted().length; }
  formValue() {
    if (!this._q || !this.name) return null;
    const fd = new FormData(), acc = this._q.accepted();
    if (this._submitMode() === 'files') acc.forEach(x => (x.file ? fd.append(this.name, x.file, x.relativePath || x.name) : x.serverId != null && fd.append(this.name, String(x.serverId))));
    else acc.forEach(x => x.status === 'done' && x.serverId != null && fd.append(this.name, isObj(x.serverId) ? JSON.stringify(x.serverId) : String(x.serverId)));
    return [...fd.keys()].length ? fd : null;
  }
  getValidity() {
    if (!this._q || this._submitMode() !== 'response') return null;
    if (this._q.items.some(x => !x.remote && PENDING_ST.has(x.status))) return { flags: { customError: true }, message: this.t('upload.errors.pending') };
    return null;
  }
  formResetCallback() { this._importValue(this._initialValue ?? null); this._syncForm(); }
  _importValue(v) {
    this._q.clear();
    const arr = v == null || v === '' ? [] : Array.isArray(v) ? v : [v];
    const remote = arr.filter(x => x != null && !(x instanceof Blob) && (isStr(x) || isObj(x)));
    if (remote.length) this._q.addRemote(remote);
    const files = arr.filter(x => x instanceof Blob);
    if (files.length) this._q.add(files, { source: 'value' });
    this._paint();
  }
  _notifyChange() {
    if (this._chgQ) return;
    this._chgQ = true;
    queueMicrotask(() => {
      this._chgQ = false;
      this._syncForm();
      this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      this.dispatchEvent(new Event('change', { bubbles: true }));
      this.emit('change', { files: this.getFiles(), value: this.value });
    });
  }

  /* ── queue events -> DOM events, announcements, rendering ── */
  _onQueue(name, it, x) {
    const d = it && it.id ? { file: it.file, item: it, id: it.id } : {};
    switch (name) {
      case 'change':
        if (it?.reason !== 'preview') this._syncForm();
        this._paint();
        return;
      case 'progress': {
        const p = it.progress;
        this.emit('progress', { ...d, loaded: p.loaded, total: p.total, percent: p.percent, speed: p.speed, eta: p.eta });
        const st = this._q.stats(), step = Math.floor(st.percent / 25);
        if (step > this._annStep && step < 4) { this._annStep = step; announce(this.t('upload.announce.progress', { percent: step * 25 })); }
        this._paint();
        return;
      }
      case 'add': this.emit('add', d); return;
      case 'reject':
        this.emit('reject', { ...d, reason: x.reason, message: x.message });
        announce(this.t('upload.announce.rejected', { name: it.name, reason: x.message }), 'assertive');
        return;
      case 'remove': this.emit('remove', d); return;
      case 'start':
        if (!this._running) { this._running = true; this._annStep = 0; const n = this._q.items.filter(i => i.scheduled || i.status === 'uploading').length; announce(this.t('upload.announce.start', { count: n })); }
        this.emit('start', d); return;
      case 'success':
        it._fresh = true; setTimeout(() => { it._fresh = false; }, 1200);
        this.emit('success', { ...d, response: x });
        if (this.variant === 'avatar' || !this.multiple) announce(this.t('upload.announce.success', { name: it.name }));
        if (this._submitMode() === 'response') this._notifyChange();
        return;
      case 'error':
        this.emit('error', { ...d, error: x, message: it.error });
        announce(this.t('upload.announce.error', { name: it.name, reason: it.error }), 'assertive');
        return;
      case 'complete':
        this._running = false;
        this.emit('complete', it);
        if (it.files.length) announce(this.t('upload.announce.complete', { count: it.files.length }));
        return;
      case 'resumed': announce(this.t('upload.announce.resumed', { name: it.name, percent: Math.floor((x / (it.size || 1)) * 100) })); this.emit('resumed', { ...d, offset: x }); return;
      case 'offline': announce(this.t('upload.announce.offline')); return;
      case 'online': if (it?.length) announce(this.t('upload.announce.online')); return;
      case 'sort': this.emit('sort', { ...d, files: this.getFiles() }); return;
      default: if (['pause', 'resume', 'cancel', 'retry'].includes(name)) this.emit(name, d);
    }
  }
  _render() {
    if (!this._q) return;
    const items = this._q.items, v = this.variant;
    const acc = items.filter(x => x.status !== 'rejected');
    this.classList.toggle('has-files', acc.length > 0);
    this.classList.toggle('is-uploading', items.some(x => x.status === 'uploading'));
    const listed = v === 'avatar' || (v === 'compact' && !this.multiple) ? [] : items;
    patchList(this._list, listed, 'id', it => createItem(it, this), (el, it) => { renderItem(el, it, this); el.classList.toggle('is-fresh', !!it._fresh); });
    this._list.hidden = !listed.length;
    this._list.setAttribute('aria-label', this.t('upload.selected', { count: listed.length }));
    const lis = this._list.children;
    if (lis.length && ![...lis].some(li => li.tabIndex === 0)) lis[0].tabIndex = 0;
    if (v === 'avatar') this._renderAvatar(acc[acc.length - 1]);
    else if (v === 'compact') this._renderCompact(acc);
    else this._boxBtn.hidden = true;
    const rej = items.filter(x => x.status === 'rejected').pop(), last = acc[acc.length - 1];
    const msg = listed.length ? '' : rej?.error || (last?.status === 'error' ? last.error : '');
    this._msg.textContent = msg; this._msg.hidden = !msg;
    renderSummary(this);
  }
  _renderAvatar(it) {
    const view = this._avatarView, ring = this._avatarRing;
    if (!view) return;
    const key = it ? it.id + (it.preview || '') : '';
    if (this._avatarKey !== key) { this._avatarKey = key; view.replaceChildren(it?.preview ? h('img', { src: it.preview, alt: '', draggable: 'false' }) : iconNode(it ? fileKind(it).icon : 'user')); }
    this.classList.toggle('has-image', !!it?.preview);
    this.classList.toggle('is-done', it?.status === 'done' && !!it._fresh);
    this.classList.toggle('is-error', it?.status === 'error');
    const busy = it && ['validating', 'processing', 'uploading', 'paused', 'queued'].includes(it.status) && (it.status !== 'queued' || it.scheduled);
    ring.hidden = !busy;
    if (busy) { ring.style.setProperty('--o-value', String(it.progress.percent)); ring.textContent = it.progress.percent + '%'; }
    if (!this._custom) this._zone.setAttribute('aria-label', this.label || this.t(it ? 'upload.changePhoto' : 'upload.addPhoto'));
    const b = this._boxBtn;
    b.hidden = !it || this.readonly || this.isDisabled;
    if (it) { b.dataset.id = it.id; b.dataset.act = it.status === 'error' ? 'retry' : 'remove'; b.setAttribute('aria-label', this.t(it.status === 'error' ? 'upload.retry' : 'upload.removePhoto')); b.replaceChildren(iconNode(it.status === 'error' ? 'refresh' : 'trash')); }
  }
  _renderCompact(acc) {
    const txt = this._compactText, bar = this._compactBar, b = this._boxBtn;
    if (!txt) return;
    const it = acc[acc.length - 1], multi = this.multiple;
    let s = this.t('upload.noFile');
    if (multi && acc.length) s = this.t('upload.selected', { count: acc.length });
    else if (it) {
      const vs = viewStatus(it, this);
      s = `${it.name} · ${formatBytes(it.size)}` + (vs === 'uploading' ? ` · ${it.progress.percent}%` : vs && vs !== 'ready' && vs !== 'queued' ? ` · ${this.t('upload.status.' + vs)}` : '');
    }
    txt.textContent = s;
    txt.classList.toggle('is-empty', !acc.length);
    const busy = !multi && it && (it.status === 'uploading' || it.status === 'paused');
    bar.hidden = !busy;
    if (busy) bar.style.setProperty('--o-value', it.progress.percent + '%');
    this.classList.toggle('is-error', !multi && it?.status === 'error');
    b.hidden = !acc.length || this.readonly || this.isDisabled;
    b.dataset.act = multi ? 'clear' : 'remove';
    if (it) b.dataset.id = it.id;
    b.setAttribute('aria-label', multi ? this.t('upload.clear') : this.t('upload.remove') + ' ' + (it?.name || ''));
    b.replaceChildren(iconNode('x'));
  }
  _columns() {
    const first = this._list.firstElementChild;
    if (!first) return 1;
    const gap = parseFloat(getComputedStyle(this._list).columnGap) || 0;
    return Math.max(1, Math.round((this._list.clientWidth + gap) / (first.offsetWidth + gap)));
  }

  /* ── interaction ── */
  _action(act, id) {
    if (act === 'preview') return this.preview(id);
    if (act === 'remove') return this._removeFocus(id);
    if (act === 'clear') { this.clear(); this._zone.focus(); return; }
    if (['pause', 'resume', 'cancel', 'retry'].includes(act)) {
      this._q[act](id);
      const li = id && this._list.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (li && li.contains(doc.activeElement)) { this._render(); li.focus(); }
    }
  }
  _bulk(a) {
    const q = this._q;
    if (a === 'upload') this.upload();
    else if (a === 'pauseAll') q.pause();
    else if (a === 'resumeAll') q.resume();
    else if (a === 'retryAll') q.retry();
    else if (a === 'clear') { this.clear(); this._zone.focus(); }
    else if (a === 'clearDone') { if (q.clear(x => x.status === 'done')) this._notifyChange(); }
  }
  _removeFocus(id) {
    const lis = [...this._list.children], i = lis.findIndex(l => l.dataset.id === id);
    const hadFocus = this.contains(doc.activeElement);
    if (!this.removeFile(id)) return;
    this._render();
    if (!hadFocus) return;
    const rest = [...this._list.children], next = rest[Math.min(i, rest.length - 1)];
    if (next && i >= 0) { next.tabIndex = 0; next.focus(); } else this._zone.focus();
  }
  _listKey(e) {
    const li = e.target.closest('.o-upload-item');
    if (!li || e.target !== li) return;
    const id = li.dataset.id, it = this._q.get(id);
    if (!it) return;
    const k = e.key;
    if ((k === 'Delete' || k === 'Backspace') && !this.readonly && !this.isDisabled) { e.preventDefault(); this._removeFocus(id); return; }
    if (e.altKey && this.sortable && /^Arrow(Up|Down|Left|Right)$/.test(k)) {
      e.preventDefault();
      let d = k === 'ArrowUp' || k === 'ArrowLeft' ? -1 : 1;
      if ((k === 'ArrowLeft' || k === 'ArrowRight') && isRTL(this)) d = -d;
      if (this._q.move(id, d)) {
        this._render(); li.focus();
        announce(this.t('upload.moved', { pos: this._q.items.indexOf(it) + 1, count: this._q.items.length }));
        this._notifyChange();
      }
      return;
    }
    if (k === 'Enter') { e.preventDefault(); this.preview(id); return; }
    if (k === ' ') {
      e.preventDefault();
      const a = { uploading: 'pause', paused: 'resume', error: 'retry', canceled: 'retry' }[it.status];
      if (a) this._action(a, id);
      return;
    }
    this._nav.handle(e);
  }
  _dragOver(e) {
    if (!hasFiles(e) || this.isDisabled || this.readonly) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    this.classList.add('is-dragover');
    clearTimeout(this._dragT);
    this._dragT = setTimeout(() => this.classList.remove('is-dragover'), 160);
  }
  _drop(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e._oUpload = true;
    clearTimeout(this._dragT); this.classList.remove('is-dragover'); this._hideOverlay();
    if (this.isDisabled || this.readonly) return;
    filesFromDrop(e.dataTransfer).then(files => files.length && this.addFiles(files, 'drop'));
  }
  _pasteEvt(e) {
    if (this.isDisabled || this.readonly) return;
    const files = filesFromClipboard(e.clipboardData, this.t('upload.pasted'));
    if (!files.length) return;
    e.preventDefault();
    this.addFiles(files, 'paste');
  }
  /* page-level drop overlay: drop-target="body" | CSS selector */
  _bindDropTarget() {
    this._offDrop?.();
    this._offDrop = null;
    const sel = this.dropTarget;
    if (!sel || !isBrowser) return;
    const target = sel === 'body' || sel === 'document' || sel === 'window' ? doc : $(sel);
    if (!target) return;
    const offs = [
      on(target, 'dragenter dragover', e => {
        if (!hasFiles(e) || this.isDisabled || this.readonly || !this.isConnected) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!this.contains(e.target)) this._showOverlay();
        clearTimeout(this._ovT); this._ovT = setTimeout(() => this._hideOverlay(), 180);
      }),
      on(target, 'drop', e => {
        if (!hasFiles(e) || e._oUpload || this.isDisabled || this.readonly) return;
        e.preventDefault();
        this._hideOverlay();
        filesFromDrop(e.dataTransfer).then(files => files.length && this.addFiles(files, 'drop'));
      }),
    ];
    this._offDrop = () => { offs.forEach(f => f()); this._hideOverlay(); };
    this.addCleanup(() => { this._offDrop?.(); this._offDrop = null; });
  }
  _showOverlay() {
    if (!this._overlay) {
      const label = this.label || this.getAttribute('aria-label') || this.labels?.[0]?.textContent?.trim() || this.t('upload.label');
      this._overlay = h('div', { class: 'o-upload-overlay', hidden: true, 'aria-hidden': 'true' },
        h('div', { class: 'o-upload-overlay-box' }, h('span', { class: 'o-upload-zone-icon' }, iconNode('upload')),
          h('strong', null, this.t('upload.overlay')), h('span', { class: 'o-upload-overlay-hint' }, this.t('upload.overlayHint', { label }))));
    }
    if (!this._overlay.isConnected) portal(this._overlay, this);
    this._overlay.hidden = false;
  }
  _hideOverlay() { clearTimeout(this._ovT); if (this._overlay) this._overlay.hidden = true; }
}
define('o-upload', OUpload);

/* ── Orion.upload namespace ────────────────────────────────────────── */
function upload(files, options) { return createUploadController(files, options); }
Object.assign(upload, {
  mock: mockUploader, validate: validateFile, sniff, fingerprint, parseSize, matchAccept, describeAccept, imageInfo,
  compress: compressImage, crop: cropImage, thumbnail, fileKind, xhr: xhrUploader, request: xhrRequest, store: resumeStore,
  chunked: chunkedUpload, tus: tusUpload, Queue: UploadQueue,
  /** download(url, { onProgress({loaded,total,percent}), filename, save, signal, headers }) -> Blob — delegates to Orion.http.download when present */
  download: (url, opts = {}) => (isFn(O.http?.download) ? O.http.download(url, opts) : builtinDownload(url, opts)),
});
O.upload = upload;
O.Upload = OUpload;
O.UploadQueue = UploadQueue;
