/* ============================================================================
 * <o-scanner formats="qr_code,ean_13,..." continuous beep vibrate torch
 *            camera-select region> — live camera scanning with a scan-window
 * overlay, permission/error states, and an "upload image" fallback.
 * ========================================================================== */
let __scannerAudioCtx = null;
function scannerBeep() {
  if (!isBrowser) return;
  try {
    const Ctx = win.AudioContext || win.webkitAudioContext;
    if (!Ctx) return;
    __scannerAudioCtx = __scannerAudioCtx || new Ctx();
    const ctx = __scannerAudioCtx;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain); gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(); osc.stop(ctx.currentTime + 0.16);
  } catch { /* ignore: audio is a nice-to-have */ }
}

class OScanner extends OElement {
  static props = {
    formats: { type: Array, default: () => SCANNER_ALL_FORMATS.slice() },
    continuous: { type: Boolean, default: false, reflect: true },
    beep: { type: Boolean, default: false },
    vibrate: { type: Boolean, default: false },
    torch: { type: Boolean, default: false, reflect: true },
    cameraSelect: { type: Boolean, default: false },
    region: { type: Boolean, default: true, reflect: true },
    /** Test/fixture hook: a MediaStream-like (anything with getTracks()), or a live <video>/<canvas>/ImageBitmap
     * to pull frames from instead of calling getUserMedia. Property only (not reflected as an attribute). */
    source: { type: Object, attr: false, default: null },
  };

  setup() {
    this.classList.add('o-scanner');
    this.setAttribute('data-state', 'idle');
    this.video = h('video', { class: 'o-scanner-video', playsinline: true, muted: true, 'aria-hidden': 'true' });
    this._sourceCanvas = h('canvas', { class: 'o-scanner-video', 'aria-hidden': 'true' });
    this._sourceCanvas.style.display = 'none';
    this.frame = h('div', { class: 'o-scanner-frame' }, h('div', { class: 'o-scanner-line' }));
    this.overlay = h('div', { class: 'o-scanner-overlay' }, this.frame);
    this.statusEl = h('div', { class: 'o-scanner-status', role: 'status', 'aria-live': 'polite' });
    this.stage = h('div', { class: 'o-scanner-stage' }, this.video, this._sourceCanvas, this.overlay, this.statusEl);
    this.toolbar = h('div', { class: 'o-scanner-toolbar' });
    append(this, [this.stage, this.toolbar]);

    this._canvas = doc.createElement('canvas');
    this._ctx = this._canvas.getContext('2d', { willReadFrequently: true });
    this._seen = new Map();
    this._devices = [];
    this._deviceIndex = 0;
    this._facing = 'environment';

    this._switchBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': this.t('scanner.switchCamera'), hidden: true }, iconEl('refresh'));
    this._cameraSelect = h('select', { class: 'o-select o-input-sm o-scanner-select', 'aria-label': this.t('scanner.switchCamera'), hidden: true });
    this._torchBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': this.t('scanner.torch'), hidden: true }, iconEl('sun'));
    this._uploadInput = h('input', { type: 'file', accept: 'image/*', class: 'o-sr-only', tabindex: -1 });
    this._uploadBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': this.t('scanner.upload') }, iconEl('upload'));
    this.toolbar.append(this._switchBtn, this._cameraSelect, this._torchBtn, this._uploadBtn, this._uploadInput);

    on(this._switchBtn, 'click', () => this.switchCamera());
    on(this._cameraSelect, 'change', () => { this._preferredDeviceId = this._cameraSelect.value; this._restart(); });
    on(this._torchBtn, 'click', () => this.toggleTorch());
    on(this._uploadBtn, 'click', () => this._uploadInput.click());
    on(this._uploadInput, 'change', () => { const f = this._uploadInput.files[0]; this._uploadInput.value = ''; if (f) this.decodeFile(f); });
    on(this.stage, 'dragover', e => { e.preventDefault(); this.stage.classList.add('is-dragover'); });
    on(this.stage, 'dragleave', () => this.stage.classList.remove('is-dragover'));
    on(this.stage, 'drop', e => { e.preventDefault(); this.stage.classList.remove('is-dragover'); const f = e.dataTransfer?.files?.[0]; if (f) this.decodeFile(f); });
    this._setStatus('idle', '');
  }
  connected() {
    this.listen(doc, 'visibilitychange', () => { if (doc.hidden) this._pause(); else if (this._wantRunning) this._resume(); });
  }
  disconnected() { this.stop(); }
  update(changed) {
    if (changed.has('region') || changed.has('init')) this.frame.hidden = !this.region;
    if (changed.has('source') && !changed.has('init') && this._wantRunning) this._restart();
  }

  _setStatus(state, msg) { this.setAttribute('data-state', state); this.statusEl.textContent = msg || ''; }

  /** Start scanning: from the camera (getUserMedia), or from `source` when set (test/fixture path). */
  async start() {
    this._wantRunning = true;
    if (this._running) return;
    if (!isBrowser) return;
    if (this.source) return this._startFromSource(this.source);
    if (!win.isSecureContext) { this._setStatus('unsupported', this.t('scanner.https')); this.emit('error', { error: new Error('insecure-context') }); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { this._setStatus('unsupported', this.t('scanner.noCamera')); this.emit('error', { error: new Error('no-media-devices') }); return; }
    this._setStatus('starting', this.t('scanner.starting'));
    try {
      const videoConstraints = this._preferredDeviceId ? { deviceId: { exact: this._preferredDeviceId } } : { facingMode: this._facing };
      const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
      this._stream = stream;
      this._showFrameEl(this.video);
      this.video.srcObject = stream;
      try { await this.video.play(); } catch { /* autoplay may need a user gesture on some browsers */ }
      this._frameEl = this.video;
      this._running = true;
      this._setStatus('scanning', this.t('scanner.scanning'));
      this.emit('start');
      await this._refreshDevices();
      this._loop();
    } catch (e) {
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      this._setStatus(denied ? 'denied' : 'error', denied ? this.t('scanner.permission') : this.t('scanner.noCamera'));
      this.emit('error', { error: e });
    }
  }
  /** Start from a supplied MediaStream-like or <video>/<canvas>/ImageBitmap instead of the camera. */
  async _startFromSource(source) {
    this._setStatus('starting', this.t('scanner.starting'));
    try {
      const isStream = source && isFn(source.getTracks);
      const isEl = source instanceof HTMLVideoElement || source instanceof HTMLCanvasElement || (isBrowser && win.ImageBitmap && source instanceof ImageBitmap);
      if (isStream) {
        this._stream = source;
        this._showFrameEl(this.video);
        this.video.srcObject = source;
        try { await this.video.play(); } catch { /* fixture streams may not need a gesture */ }
        this._frameEl = this.video;
      } else if (isEl) {
        this._showFrameEl(this._sourceCanvas);
        this._frameEl = source;
      } else {
        throw new Error('Orion.scanner: source must be a MediaStream-like (getTracks()), <video>, <canvas> or ImageBitmap');
      }
      this._running = true;
      this._setStatus('scanning', this.t('scanner.scanning'));
      this.emit('start');
      this._loop();
    } catch (e) {
      this._setStatus('error', e.message);
      this.emit('error', { error: e });
    }
  }
  /** Show exactly one of the two stage layers (camera <video> vs fixture <canvas>). */
  _showFrameEl(el) {
    this.video.style.display = el === this.video ? '' : 'none';
    this._sourceCanvas.style.display = el === this._sourceCanvas ? '' : 'none';
  }
  /** Stop the camera/source and scanning loop. */
  stop() {
    this._wantRunning = false;
    this._running = false;
    if (this._raf) { if (this._rvfcHandle && this.video.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this._raf); else cancelAnimationFrame(this._raf); this._raf = null; }
    clearTimeout(this._frameTimer);
    if (this._stream) { this._stream.getTracks().forEach(t => t.stop()); this._stream = null; }
    this.video.srcObject = null;
    this._frameEl = null;
    this._showFrameEl(this.video);
    this._torchBtn.hidden = true;
    this._setStatus('idle', '');
  }
  _pause() { if (this._running) { this._running = false; if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; } clearTimeout(this._frameTimer); } }
  _resume() { if (!this._running && (this._stream || this._frameEl)) { this._running = true; this._loop(); } }
  async _restart() { const was = this._wantRunning; this.stop(); if (was) await this.start(); }

  /** Switch to the next camera (or flip facing mode on single-camera devices). */
  async switchCamera() {
    await this._refreshDevices();
    if (this._devices.length > 1) { this._deviceIndex = (this._deviceIndex + 1) % this._devices.length; this._preferredDeviceId = this._devices[this._deviceIndex].deviceId; }
    else this._facing = this._facing === 'user' ? 'environment' : 'user';
    await this._restart();
  }
  async _refreshDevices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      this._devices = list.filter(d => d.kind === 'videoinput');
      const multi = this._devices.length > 1;
      this._switchBtn.hidden = !multi || this.cameraSelect;
      this._cameraSelect.hidden = !multi || !this.cameraSelect;
      if (multi && this.cameraSelect) {
        this._cameraSelect.innerHTML = this._devices.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || `${this.t('scanner.switchCamera')} ${i + 1}`)}</option>`).join('');
        if (this._preferredDeviceId) this._cameraSelect.value = this._preferredDeviceId;
      }
    } catch { /* enumerateDevices needs permission on some browsers; ignore */ }
  }
  /** Toggle the torch/flashlight, when the active camera supports it. */
  async toggleTorch() {
    const track = this._stream && this._stream.getVideoTracks()[0];
    if (!track || !track.getCapabilities) return;
    const caps = track.getCapabilities();
    if (!caps.torch) { this._torchBtn.hidden = true; return; }
    this._torchBtn.hidden = false;
    this.torch = !this.torch;
    try { await track.applyConstraints({ advanced: [{ torch: this.torch }] }); } catch { this.torch = !this.torch; }
  }

  _loop() {
    if (!this._running) return;
    const el = this._frameEl || this.video;
    const isVideo = el instanceof HTMLVideoElement;
    if (!isVideo || (el.readyState >= 2 && el.videoWidth)) this._processFrame();
    if (isVideo && el.requestVideoFrameCallback) { this._rvfcHandle = true; this._raf = el.requestVideoFrameCallback(() => this._loop()); }
    else { this._rvfcHandle = false; this._raf = requestAnimationFrame(() => { this._frameTimer = setTimeout(() => this._loop(), 100); }); }
  }
  async _processFrame() {
    if (this._busy) return;
    this._busy = true;
    try {
      const el = this._frameEl || this.video;
      const vw = el.videoWidth || el.naturalWidth || el.width, vh = el.videoHeight || el.naturalHeight || el.height;
      if (!vw || !vh) { this._busy = false; return; }
      const scale = Math.min(1, 480 / Math.max(vw, vh));
      const w = Math.max(1, Math.round(vw * scale)), h = Math.max(1, Math.round(vh * scale));
      this._canvas.width = w; this._canvas.height = h;
      this._ctx.drawImage(el, 0, 0, w, h);
      if (el !== this.video && this._sourceCanvas.style.display !== 'none') {
        this._sourceCanvas.width = vw; this._sourceCanvas.height = vh;
        this._sourceCanvas.getContext('2d').drawImage(el, 0, 0);
      }
      const results = await scannerDecodeImage(this._canvas, { formats: this.formats });
      if (results.length) this._handleResults(results);
    } catch { /* transient: most frames legitimately contain no code */ }
    this._busy = false;
  }
  _handleResults(results) {
    const now = Date.now();
    for (const r of results) {
      const key = r.format + ':' + r.text;
      const last = this._seen.get(key);
      if (last && now - last < 2500) continue;
      this._seen.set(key, now);
      this._feedback();
      this.emit('scan', r);
      if (!this.continuous) { setTimeout(() => this.stop(), 400); return; }
    }
  }
  /** Flash the "result" state (data-state="result", .is-hit) and play beep/vibrate feedback. */
  _feedback() {
    this.classList.add('is-hit');
    this._setStatus('result', this.t('scanner.found'));
    if (this.beep) scannerBeep();
    if (this.vibrate && isBrowser && navigator.vibrate) navigator.vibrate(80);
    clearTimeout(this._hitTimer);
    this._hitTimer = setTimeout(() => {
      this.classList.remove('is-hit');
      if (this._running) this._setStatus('scanning', this.t('scanner.scanning'));
      else if (this.getAttribute('data-state') === 'result') this._setStatus('idle', '');
    }, 400);
  }
  /** Decode a still image/File/Blob/ImageData (upload, drop or paste) without the camera. */
  async decodeFile(file) {
    try {
      const results = await O.scanner.decodeImage(file, { formats: this.formats });
      if (results.length) { this._feedback(); this.emit('scan', results[0]); }
      else this.emit('error', { error: new Error('No recognizable code found in that image') });
    } catch (e) { this.emit('error', { error: e }); }
  }
}
define('o-scanner', OScanner);
O.Scanner = OScanner;
