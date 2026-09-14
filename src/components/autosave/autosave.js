// @deps validation
/* Auto save / draft save.
 *   <form data-o-autosave="profile" data-o-autosave-restore="prompt|auto|false" data-o-autosave-storage="local|session|idb"
 *         data-o-autosave-delay="800" data-o-autosave-warn data-o-autosave-exclude="card,cvv">
 *     <span data-o-autosave-status></span>  …  <button type="button" data-o-action="save-draft">Save draft</button>
 *   const a = Orion.autosave(form, { key, storage: 'local'|'session'|'idb', delay: 800, restore: 'prompt'|'auto'|false,
 *     exclude: ['password'], warn: false, onSave: async (data) => {}, retries: 3, maxAge: ms, meta: () => ({}), onRestore(data, meta), onDiscard() });
 *   a.save({ force }) ; a.restore() ; a.discard() ; a.clear() ; a.isDirty ; a.lastSaved ; a.draft ; a.destroy()
 *   Events on the form: o-autosave { data, remote }, o-restore { data, meta, savedAt }, o-discard, o-autosave-error { error }
 *   Password and file inputs and [data-o-autosave-exclude] fields are never stored. Drafts clear on successful submit or reset.
 */
i18n.add('en', {
  autosave: {
    saving: 'Saving…', saved: 'Saved {time}', draftSaved: 'Draft saved {time}', offline: 'Offline — saved locally', retrying: 'Save failed — retrying…',
    error: 'Could not save changes', restored: 'Draft restored', discarded: 'Draft discarded', draftFrom: 'You have an unsaved draft from {time}.',
    restore: 'Restore', discard: 'Discard', draft: 'Unsaved draft', unsaved: 'Unsaved changes',
  },
});
const FU = () => O.formUtil;

/* ── storage adapters ── */
let __idb = null;
function idbOpen() {
  if (!__idb) __idb = new Promise((res, rej) => {
    const r = indexedDB.open('orion-autosave', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('drafts');
    r.onsuccess = () => res(r.result);
    r.onerror = () => { __idb = null; rej(r.error); };
  });
  return __idb;
}
const idbDo = (mode, fn) => idbOpen().then(db => new Promise((res, rej) => {
  const tx = db.transaction('drafts', mode), req = fn(tx.objectStore('drafts'));
  tx.oncomplete = () => res(req && req.result);
  tx.onerror = () => rej(tx.error);
}));
const webStore = name => ({
  async get(k) { try { const v = win[name].getItem(k); return v == null ? null : JSON.parse(v); } catch { return null; } },
  async set(k, v) { win[name].setItem(k, JSON.stringify(v)); },
  async del(k) { try { win[name].removeItem(k); } catch {} },
});
const STORES = {
  local: webStore('localStorage'),
  session: webStore('sessionStorage'),
  idb: { get: k => idbDo('readonly', s => s.get(k)).then(v => v ?? null), set: (k, v) => idbDo('readwrite', s => s.put(v, k)), del: k => idbDo('readwrite', s => s.delete(k)) },
};

const __autosaves = new WeakMap();
const STATUS_ICON = { saving: '', saved: 'check', offline: 'wifi-off', retrying: 'refresh', error: 'alert-circle', restored: 'rotate-cw', discarded: 'trash' };

class Autosave {
  constructor(form, opts = {}) {
    this.form = form;
    this.o = { storage: 'local', delay: 800, restore: 'prompt', exclude: [], warn: false, retries: 3, files: false, ...opts };
    this.key = 'orion:autosave:' + (this.o.key || form.id || form.getAttribute('name') || location.pathname);
    this.store = STORES[this.o.storage] || STORES.local;
    if (this.o.storage === 'idb' && !win.indexedDB) this.store = STORES.local;
    this.lastSaved = null;
    this.draft = null;
    this._offs = [];
    this._seq = 0;
    this._deb = debounce(() => this.save(), this.o.delay);
    this._base = this._json();
    this._lastJson = this._base;
    const f = form;
    this._offs.push(
      on(f, 'input change o-change', e => { if (!e.target.closest('.o-autosave-banner')) this._deb(); }),
      on(f, 'o-submitted', () => this.clear()),
      on(f, 'submit', e => setTimeout(() => { if (!e.defaultPrevented) this.clear(); }, 0)),
      on(f, 'reset', () => setTimeout(() => this.clear(), 0)),
      on(win, 'online', () => { this._paint(this._state); if (this._pendingRemote) this._remote(this._pendingRemote); }),
      on(win, 'offline', () => { if (this.o.onSave) this._paint('offline'); }),
      on(win, 'pagehide', () => this._deb.flush()),
    );
    if (this.o.warn) this._offs.push(on(win, 'beforeunload', e => { if (this.isDirty) { e.preventDefault(); e.returnValue = ''; } }));
    this._statusEls().forEach(el => { el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.classList.add('o-autosave-status'); });
    this._ready = this._init();
  }
  _excluded() {
    const out = toArr(this.o.exclude).slice();
    for (const el of FU().formFields(this.form)) {
      const name = el.getAttribute('name') || el.name;
      if (!name) continue;
      if (el.type === 'password' || (el.type === 'file' && !(this.o.storage === 'idb' && this.o.files)) || el.closest('[data-o-no-autosave]') || /cc-|one-time-code|new-password|current-password/.test(el.autocomplete || '')) out.push(name);
    }
    return out;
  }
  _data() { return FU().serialize(this.form, { disabled: true, files: this.o.storage === 'idb' && this.o.files, exclude: this._excluded() }); }
  _json() { try { return JSON.stringify(this._data()); } catch { return ''; } }
  get isDirty() { return this._json() !== this._base; }

  async _init() {
    let rec = null;
    try { rec = await this.store.get(this.key); } catch {}
    if (!rec || !rec.data) return;
    if (this.o.maxAge && Date.now() - rec.t > this.o.maxAge) { this.store.del(this.key); return; }
    if (JSON.stringify(rec.data) === this._base) return;
    this.draft = rec;
    this.lastSaved = new Date(rec.t);
    if (this.o.restore === 'auto') this.restore(rec);
    else if (this.o.restore === 'prompt') this._banner(rec);
  }
  /** save({ force }) — store a draft now (and call onSave). */
  async save({ force = false, manual = false } = {}) {
    this._deb.cancel();
    const data = this._data(), json = JSON.stringify(data);
    if (!force && json === this._lastJson) return false;
    this._lastJson = json;
    if (json === this._base && !manual) { try { await this.store.del(this.key); } catch {} this.draft = null; this._paint(this.lastSaved ? 'saved' : ''); return false; }
    const rec = { v: 1, t: Date.now(), data, meta: isFn(this.o.meta) ? this.o.meta() : undefined, url: location.pathname };
    this._paint('saving');
    try { await this.store.set(this.key, rec); } catch (error) { this._paint('error'); emit(this.form, 'o-autosave-error', { error }); return false; }
    this.draft = rec;
    this.lastSaved = new Date(rec.t);
    this._manual = manual;
    if (isFn(this.o.onSave)) await this._remote(data, json);
    else this._paint('saved');
    emit(this.form, 'o-autosave', { data, remote: isFn(this.o.onSave), manual });
    return true;
  }
  async _remote(data, json = JSON.stringify(data)) {
    const seq = ++this._seq;
    this._pendingRemote = null;
    for (let attempt = 0; ; attempt++) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { this._pendingRemote = data; this._paint('offline'); return; }
      try {
        this._paint('saving');
        await this.o.onSave(data, this.form);
        if (seq === this._seq) { this._base = json; this._paint('saved'); }
        return;
      } catch (error) {
        if (seq !== this._seq) return;
        if (attempt >= this.o.retries) { this._pendingRemote = data; this._paint(navigator.onLine === false ? 'offline' : 'error'); emit(this.form, 'o-autosave-error', { error }); return; }
        this._paint('retrying');
        await sleep(Math.min(8000, 800 * 2 ** attempt));
        if (seq !== this._seq) return;
      }
    }
  }
  /** restore(record?) — put the stored draft back into the form. */
  async restore(rec) {
    rec = rec || this.draft || (await this.store.get(this.key).catch(() => null));
    if (!rec || !rec.data) return false;
    FU().fill(this.form, rec.data, { events: true });
    if (O.conditional) O.conditional.refresh(this.form);
    this._deb.cancel();
    this._lastJson = this._json();
    this._removeBanner();
    this._paint('restored');
    if (isFn(this.o.onRestore)) this.o.onRestore(rec.data, rec.meta);
    emit(this.form, 'o-restore', { data: rec.data, meta: rec.meta, savedAt: new Date(rec.t) });
    announce(t('autosave.restored'));
    return true;
  }
  /** discard() — delete the stored draft without restoring it. */
  async discard() {
    try { await this.store.del(this.key); } catch {}
    this.draft = null;
    this._removeBanner();
    this._paint('');
    if (isFn(this.o.onDiscard)) this.o.onDiscard();
    emit(this.form, 'o-discard', {});
    announce(t('autosave.discarded'));
  }
  /** clear() — forget the draft and treat the current values as saved (after submit / reset). */
  async clear() {
    this._deb.cancel();
    this._seq++;
    this._pendingRemote = null;
    this._base = this._json();
    this._lastJson = this._base;
    this.draft = null;
    this._removeBanner();
    try { await this.store.del(this.key); } catch {}
    this._paint('');
  }
  destroy() {
    this._deb.cancel();
    this._offs.forEach(f => f());
    this._offs = [];
    this._removeBanner();
    __autosaves.delete(this.form);
  }

  /* ── UI ── */
  _statusEls() {
    const k = this.key.replace('orion:autosave:', '');
    return [...new Set([...$$('[data-o-autosave-status]', this.form).filter(el => !el.getAttribute('data-o-autosave-status') || el.getAttribute('data-o-autosave-status') === k), ...$$(`[data-o-autosave-status="${k.replace(/"/g, '')}"]`)])];
  }
  _paint(state) {
    this._state = state;
    const time = this.lastSaved ? fmt.time(this.lastSaved) : '';
    const text = !state ? '' : state === 'saved' ? t(this._manual ? 'autosave.draftSaved' : 'autosave.saved', { time }) : t('autosave.' + state);
    for (const el of this._statusEls()) {
      el.dataset.state = state || 'idle';
      el.innerHTML = state === 'saving' ? `<span class="o-spinner o-spinner-xs o-spinner-inherit" aria-hidden="true"></span><span>${esc(text)}</span>` : state ? `${STATUS_ICON[state] ? icon(STATUS_ICON[state]) : ''}<span>${esc(text)}</span>` : '';
    }
  }
  _banner(rec) {
    this._removeBanner();
    const host = this.form.querySelector('[data-o-autosave-banner]');
    const b = h('div', { class: 'o-alert o-alert-info o-autosave-banner', role: 'region', 'aria-label': t('autosave.draft') },
      icon('clock'),
      h('div', { class: 'o-alert-content' }, t('autosave.draftFrom', { time: fmt.relative(rec.t) })),
      h('div', { class: 'o-autosave-actions' },
        h('button', { type: 'button', class: 'o-btn o-btn-sm o-btn-primary', onClick: () => this.restore(rec) }, t('autosave.restore')),
        h('button', { type: 'button', class: 'o-btn o-btn-sm o-btn-ghost', onClick: () => this.discard() }, t('autosave.discard'))));
    if (host) host.append(b); else this.form.prepend(b);
    this._bannerEl = b;
    animate(b, 'slideInDown', { duration: 200 });
  }
  _removeBanner() { if (this._bannerEl) { const b = this._bannerEl; this._bannerEl = null; animate(b, 'fadeOut', { duration: 150 }).then(() => b.remove()); } }
}

/** Orion.autosave(form, opts) -> controller (one per form; calling again merges options) */
function autosave(form, opts = {}) {
  form = $(form);
  if (!form) throw new Error('Orion.autosave: form not found');
  const ex = __autosaves.get(form);
  if (ex) { Object.assign(ex.o, opts); return ex; }
  const a = new Autosave(form, opts);
  __autosaves.set(form, a);
  return a;
}
autosave.get = f => __autosaves.get($(f)) || null;
O.autosave = autosave;
O.Autosave = Autosave;

behavior('data-o-autosave', form => {
  if (__autosaves.has(form)) return;
  const a = n => form.getAttribute('data-o-autosave-' + n);
  const opts = { key: form.getAttribute('data-o-autosave') || undefined };
  if (a('storage')) opts.storage = a('storage');
  if (a('delay')) opts.delay = +a('delay');
  if (a('restore') != null) opts.restore = a('restore') === 'false' ? false : a('restore');
  if (form.hasAttribute('data-o-autosave-warn')) opts.warn = a('warn') !== 'false';
  const ex = a('exclude');
  if (ex && ex !== '') opts.exclude = ex.split(',').map(s => s.trim());
  if (a('onsave')) { const fn = getPath(win, a('onsave')); if (isFn(fn)) opts.onSave = fn; }
  const ctl = autosave(form, opts);
  return () => ctl.destroy();
});
action('save-draft', trigger => {
  const f = targetOf(trigger) || trigger.closest('form');
  const ctl = f && (__autosaves.get(f) || autosave(f, {}));
  if (!ctl) return;
  ctl.save({ force: true, manual: true }).then(() => { if (O.toast) O.toast(t('autosave.draftSaved', { time: fmt.time(new Date()) })); });
});
