/* ============================================================================
 * <o-ocr> — image/file/drop/camera-snapshot input, drag-to-select a region on the preview, language
 * select, progress bar, editable result text with a confidence badge, word-box overlay toggle, copy
 * and download actions. Runs OCR through whatever engine `Orion.ocr.use()` has registered (or the
 * `engine` property, to override per instance) — this element contains no OCR logic itself.
 *   <o-ocr languages='[{"value":"eng","label":"English"}]'></o-ocr>
 *   el.engine = Orion.ocr.fixture();  el.load(file | url);  await el.recognize();
 * Events: o-result { text, confidence, words }, o-error { error }, o-region { region }.
 * ========================================================================== */
i18n.add('en', {
  ocr: {
    dropTitle: 'Drop an image, or click to browse', dropDrop: 'Drop it here',
    browse: 'Browse…', replace: 'Replace image', camera: 'Camera', language: 'Language',
    recognize: 'Recognize', recognizing: 'Recognizing…', cancel: 'Cancel', clearRegion: 'Clear region',
    starting: 'Starting…', done: 'Done', aborted: 'Stopped.', error: 'Recognition failed.',
    confidence: 'Confidence: {pct}%', wordBoxes: 'Show word boxes', copy: 'Copy text', download: 'Download text',
    copied: 'Copied to clipboard', regionHint: 'Drag on the image to focus recognition on one area.',
  },
});

const OCR_ACCEPT = 'image/*';
class OOcr extends OElement {
  static props = {
    engine: { type: Any, attr: false },
    lang: { type: String, default: 'eng' },
    languages: { type: Array, default: () => [{ value: 'eng', label: 'English' }] },
    src: { type: Any, attr: false },
    fixture: { type: String, attr: 'fixture' },
    autoRecognize: { type: Boolean, default: false, attr: 'auto-recognize' },
    camera: { type: Boolean, default: true },
    label: String,
    texts: Object,
  };

  get busy() { return !!this._busy; }
  get result() { return this._result || null; }
  get region() { return this._region || null; }

  setup() {
    this.classList.add('o-ocr');

    this._fileInput = h('input', { type: 'file', accept: OCR_ACCEPT, hidden: true });
    this._emptyState = h('div', { class: 'o-ocr-empty' }, icon('upload', { size: 22 }), h('p', { class: 'o-ocr-drop-title' }, this.t('ocr.dropTitle')), h('p', { class: 'o-ocr-drop-drop' }, this.t('ocr.dropDrop')));
    this._img = h('img', { class: 'o-ocr-img', alt: '' });
    this._regionEl = h('div', { class: 'o-ocr-region', hidden: true });
    this._wordsEl = h('div', { class: 'o-ocr-words', hidden: true });
    this._canvas = h('div', { class: 'o-ocr-canvas', hidden: true }, this._img, this._regionEl, this._wordsEl);
    this._drop = h('div', { class: 'o-ocr-drop', role: 'button', tabindex: '0' }, this._emptyState, this._canvas, this._fileInput);

    this._langSelect = h('select', { class: 'o-select o-ocr-lang', 'aria-label': this.t('ocr.language') });
    this._browseBtn = h('button', { type: 'button', class: 'o-btn o-btn-sm' }, icon('upload'), h('span', null, this.t('ocr.browse')));
    this._cameraBtn = h('button', { type: 'button', class: 'o-btn o-btn-sm', hidden: true }, icon('camera'), h('span', null, this.t('ocr.camera')));
    this._clearRegionBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', hidden: true }, icon('x'), h('span', null, this.t('ocr.clearRegion')));
    this._recognizeBtn = h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm', disabled: true }, this.t('ocr.recognize'));
    this._abortBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', hidden: true }, this.t('ocr.cancel'));
    this._toolbar = h('div', { class: 'o-ocr-toolbar' }, this._langSelect, this._browseBtn, this._cameraBtn, this._clearRegionBtn, h('div', { class: 'o-spacer' }), this._recognizeBtn, this._abortBtn);

    this._progressBar = h('div', { class: 'o-progress-bar' });
    this._progressStatus = h('span', { class: 'o-ocr-status' }, this.t('ocr.regionHint'));
    this._progressWrap = h('div', { class: 'o-progress-labeled o-ocr-progress' }, h('div', { class: 'o-progress' }, this._progressBar), this._progressStatus);

    this._confBadge = h('span', { class: 'o-badge' });
    this._wordsToggleInput = h('input', { type: 'checkbox', disabled: true });
    this._copyBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': this.t('ocr.copy') }, icon('copy'));
    this._downloadBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': this.t('ocr.download') }, icon('download'));
    this._resultHead = h('div', { class: 'o-ocr-result-head' }, this._confBadge,
      h('label', { class: 'o-switch o-ocr-words-toggle' }, this._wordsToggleInput, h('span', null, this.t('ocr.wordBoxes'))),
      h('div', { class: 'o-spacer' }), this._copyBtn, this._downloadBtn);
    this._textEl = h('textarea', { class: 'o-textarea o-ocr-text', rows: 6 });
    this._resultPanel = h('div', { class: 'o-ocr-result', hidden: true }, this._resultHead, this._textEl);

    this.append(this._drop, this._toolbar, this._progressWrap, this._resultPanel);

    on(this._drop, 'click', () => { if (!this._img.src) this._fileInput.click(); });
    on(this._drop, 'keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === this._drop) { e.preventDefault(); this._fileInput.click(); } });
    on(this._fileInput, 'change', () => { const f = this._fileInput.files?.[0]; if (f) this.load(f); this._fileInput.value = ''; });
    let dragT = 0;
    on(this._drop, 'dragenter dragover', e => { e.preventDefault(); this.classList.add('is-dragover'); clearTimeout(dragT); });
    on(this._drop, 'dragleave', () => { dragT = setTimeout(() => this.classList.remove('is-dragover'), 100); });
    on(this._drop, 'drop', e => {
      e.preventDefault(); this.classList.remove('is-dragover');
      const f = e.dataTransfer?.files?.[0]; if (f) this.load(f);
    });
    on(this._browseBtn, 'click', () => this._fileInput.click());
    on(this._cameraBtn, 'click', () => this._snapCamera());
    on(this._clearRegionBtn, 'click', () => this.clearRegion());
    on(this._recognizeBtn, 'click', () => this.recognize());
    on(this._abortBtn, 'click', () => this.abort());
    on(this._langSelect, 'change', () => { this.lang = this._langSelect.value; });
    on(this._img, 'load', () => this._onImageLoad());
    on(this._canvas, 'pointerdown', e => this._regionDown(e));
    on(this._canvas, 'pointermove', e => this._regionMove(e));
    on(this._canvas, 'pointerup pointercancel', e => this._regionUp(e));
    on(this._wordsToggleInput, 'change', () => this._renderWords());
    on(this._copyBtn, 'click', () => this._copy());
    on(this._downloadBtn, 'click', () => this._download());
  }

  update(changed) {
    if (changed.has('languages') || changed.has('locale') || changed.has('init')) this._renderLanguages();
    if (changed.has('lang')) this._langSelect.value = this.lang;
    if (changed.has('camera') || changed.has('init')) this._cameraBtn.hidden = !(this.camera && isFn(O.camera?.capture) && win.customElements?.get('o-camera'));
    if (changed.has('src') || changed.has('init')) { if (this.src) this.load(this.src, this.fixture); }
    if (changed.has('label')) { if (this.label) this.setAttribute('aria-label', this.label); }
  }

  _renderLanguages() {
    const list = toArr(this.languages);
    this._langSelect.replaceChildren(...list.map(l => h('option', { value: isObj(l) ? l.value : l }, isObj(l) ? (l.label ?? l.value) : l)));
    this._langSelect.value = this.lang;
  }

  /* ── loading an image ── */
  connected() {
    // load() may be called (e.g. by a script immediately after insertion) before setup() has run —
    // notably when this element is inserted via importNode()+append() rather than parsed inline.
    if (this._pendingLoad) { const [s, f] = this._pendingLoad; this._pendingLoad = null; this.load(s, f); }
  }
  /** load(source, fixtureId?) — source: File/Blob, URL string, or an already-loaded <img>. */
  load(source, fixtureId) {
    if (!this._setupDone) { this._pendingLoad = [source, fixtureId]; return this; }
    this._region = null; this._result = null;
    this._regionEl.hidden = true; this._wordsEl.hidden = true; this._wordsEl.replaceChildren();
    this._resultPanel.hidden = true;
    this._clearRegionBtn.hidden = true;
    this._progressBar.style.width = '0%';
    this._progressStatus.textContent = this.t('ocr.regionHint');
    this._revoke?.(); this._revoke = null;
    if (source instanceof Blob) {
      const url = URL.createObjectURL(source);
      this._revoke = () => URL.revokeObjectURL(url);
      this._img.src = url;
    } else if (isStr(source)) this._img.src = source;
    else if (source && source.nodeType === 1 && source.currentSrc) this._img.src = source.currentSrc;
    if (fixtureId) this._img.dataset.ocrFixture = fixtureId; else delete this._img.dataset.ocrFixture;
    return this;
  }
  _onImageLoad() {
    this._emptyState.hidden = true;
    this._canvas.hidden = false;
    this._recognizeBtn.disabled = false;
    this.emit('load', { width: this._img.naturalWidth, height: this._img.naturalHeight });
    if (this.autoRecognize) this.recognize();
  }
  async _snapCamera() {
    if (!isFn(O.camera?.capture)) return;
    try {
      const file = await O.camera.capture({ mode: 'photo' });
      if (file) this.load(file);
    } catch (e) { console.error('[Orion] <o-ocr> camera capture failed:', e); }
  }

  /* ── region selection (drag on the preview) ── */
  _regionDown(e) {
    if (!this._img.src || e.button > 0 || this._busy) return;
    const rect = this._canvas.getBoundingClientRect();
    this._drag = { x0: clamp(e.clientX - rect.left, 0, rect.width), y0: clamp(e.clientY - rect.top, 0, rect.height), rect };
    try { this._canvas.setPointerCapture(e.pointerId); } catch {}
    css(this._regionEl, { left: this._drag.x0 + 'px', top: this._drag.y0 + 'px', width: '0px', height: '0px' });
    this._regionEl.hidden = false;
  }
  _regionMove(e) {
    if (!this._drag) return;
    const r = this._drag.rect, x1 = clamp(e.clientX - r.left, 0, r.width), y1 = clamp(e.clientY - r.top, 0, r.height);
    const x = Math.min(this._drag.x0, x1), y = Math.min(this._drag.y0, y1), w = Math.abs(x1 - this._drag.x0), h = Math.abs(y1 - this._drag.y0);
    css(this._regionEl, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  }
  _regionUp() {
    if (!this._drag) return;
    const r = this._drag.rect, box = this._regionEl.getBoundingClientRect();
    const w = box.width, hgt = box.height;
    this._drag = null;
    if (w < 8 || hgt < 8) { this.clearRegion(); return; }
    const x = (box.left - r.left) / r.width, y = (box.top - r.top) / r.height;
    this._region = { x: clamp(x, 0, 1), y: clamp(y, 0, 1), width: clamp(w / r.width, 0, 1), height: clamp(hgt / r.height, 0, 1) };
    this._clearRegionBtn.hidden = false;
    this.emit('region', { region: this._region });
    if (this._result && !this._busy) this.recognize();
  }
  clearRegion() {
    this._region = null;
    this._regionEl.hidden = true;
    this._clearRegionBtn.hidden = true;
    this.emit('region', { region: null });
    if (this._result && !this._busy) this.recognize();
    return this;
  }

  /* ── recognition ── */
  async recognize() {
    if (!this._img.src || this._busy) return null;
    const engine = this.engine || O.ocr.get(O.ocr.active);
    if (!engine) { this._progressStatus.textContent = this.t('ocr.noEngine'); return null; }
    if (!this.emit('before-recognize', { region: this._region })) return null;
    this._busy = true;
    this._controller = new AbortController();
    this._recognizeBtn.hidden = true; this._abortBtn.hidden = false;
    this.classList.add('is-busy');
    this._progressBar.style.width = '0%';
    this._progressStatus.textContent = this.t('ocr.starting');
    try {
      const opts = { lang: this.lang, region: this._region || undefined, signal: this._controller.signal, onProgress: info => this._onProgress(info) };
      const res = this.engine ? await this.engine.recognize(this._img, opts) : await O.ocr.recognize(this._img, { ...opts, engine: O.ocr.active });
      this._result = res;
      this._showResult(res);
      this.emit('result', res);
      return res;
    } catch (err) {
      if (err?.name === 'AbortError') this._progressStatus.textContent = this.t('ocr.aborted');
      else { console.error('[Orion] <o-ocr> recognize failed:', err); this._progressStatus.textContent = this.t('ocr.error'); this.emit('error', { error: err }); }
      return null;
    } finally {
      this._busy = false; this._controller = null;
      this._recognizeBtn.hidden = false; this._abortBtn.hidden = true;
      this.classList.remove('is-busy');
    }
  }
  /** Abort an in-flight recognize() call. */
  abort() { this._controller?.abort(); }
  _onProgress(info) {
    const pct = Math.round(clamp(info?.progress ?? 0, 0, 1) * 100);
    this._progressBar.style.width = pct + '%';
    this._progressStatus.textContent = info?.status === 'done' ? this.t('ocr.done') : this.t('ocr.recognizing');
    this.emit('progress', info);
  }
  _showResult(res) {
    this._resultPanel.hidden = false;
    this._textEl.value = res.text || '';
    const pct = Math.round((res.confidence || 0) * 100);
    this._confBadge.textContent = this.t('ocr.confidence', { pct });
    this._confBadge.className = 'o-badge ' + (res.confidence >= 0.85 ? 'o-badge-soft-success' : res.confidence >= 0.6 ? 'o-badge-soft-warning' : 'o-badge-soft-danger');
    this._wordsToggleInput.disabled = !res.words?.length;
    if (!res.words?.length) this._wordsToggleInput.checked = false;
    this._renderWords();
  }
  _renderWords() {
    this._wordsEl.replaceChildren();
    const words = this._result?.words;
    const show = this._wordsToggleInput.checked && words?.length && this._img.naturalWidth;
    this._wordsEl.hidden = !show;
    if (!show) return;
    const iw = this._img.naturalWidth, ih = this._img.naturalHeight;
    this._wordsEl.replaceChildren(...words.filter(w => w.bbox).map(w => {
      const el = h('div', { class: 'o-ocr-word', title: `${w.text} (${Math.round((w.confidence || 0) * 100)}%)` });
      css(el, { left: (w.bbox.x / iw) * 100 + '%', top: (w.bbox.y / ih) * 100 + '%', width: (w.bbox.width / iw) * 100 + '%', height: (w.bbox.height / ih) * 100 + '%' });
      return el;
    }));
  }

  async _copy() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(this._textEl.value);
      else { this._textEl.select(); doc.execCommand?.('copy'); }
      announce(this.t('ocr.copied'));
      this.emit('copy', { text: this._textEl.value });
    } catch (e) { console.error('[Orion] <o-ocr> copy failed:', e); }
  }
  _download() {
    download(this._textEl.value, 'ocr-result.txt', 'text/plain');
    this.emit('download', { text: this._textEl.value });
  }
  disconnected() { this._controller?.abort(); this._revoke?.(); }
}
define('o-ocr', OOcr);
O.OCR = OOcr;
