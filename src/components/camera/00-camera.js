/* Camera — <o-camera> live webcam capture (photo / face / document modes) + Orion.camera service.
 *   <o-camera facing="user" mode="photo" countdown="3" grid mirror format="image/jpeg" quality="0.92"></o-camera>
 *   <o-camera mode="face"></o-camera>          oval guide, auto-capture when centered & steady
 *   <o-camera mode="document"></o-camera>      delegates to <o-doc-scanner> (see 20-scanner.js)
 *   Orion.camera.capture({ facing, mode, countdown }) -> Promise<File|null>   (modal helper)
 *   Orion.camera.devices() -> Promise<{deviceId,label}[]>
 * Props: facing resolution mirror aspect format quality countdown grid torch-toggle zoom-control mode device-id
 *        auto-start review source (property only — test/fixture path, see README.md)
 * Methods: start() stop() capture(opts) switchCamera() retake() confirmCapture()
 * Events: o-ready { stream } · o-capture { file, blob, dataURL } · o-error { reason, message } · o-state { state }
 */
i18n.add('en', {
  camera: {
    captureTitle: 'Take a photo', startCamera: 'Start camera', switchCamera: 'Switch camera', retake: 'Retake', usePhoto: 'Use photo',
    takePhoto: 'Take photo', torch: 'Torch', zoom: 'Zoom', device: 'Camera', grid: 'Grid', ready: 'Camera ready',
    denied: 'Camera access was denied', deniedHint: 'Allow camera access in your browser settings, then retry.',
    nodevice: 'No camera found', nodeviceHint: 'Connect a camera and retry.',
    insecure: 'Camera needs a secure connection', insecureHint: 'Camera access requires HTTPS (or localhost).',
    unsupported: 'Camera is not supported in this browser', hardware: 'Camera is unavailable',
    hardwareHint: 'It may be in use by another app. Close it and retry.', retry: 'Retry',
    captured: 'Photo captured', photoOf: 'Captured photo', preview: 'Live camera preview',
  },
});

const CAM_PRESETS = { sd: [640, 480], hd: [1280, 720], fhd: [1920, 1080], '4k': [3840, 2160] };
function camParseRes(res) {
  if (!res) return null;
  const m = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(res);
  if (m) return [+m[1], +m[2]];
  return CAM_PRESETS[String(res).toLowerCase()] || null;
}
function camConstraints({ facing, resolution, deviceId, audio }) {
  const video = {};
  if (deviceId) video.deviceId = { exact: deviceId };
  else video.facingMode = { ideal: facing === 'environment' ? 'environment' : 'user' };
  const wh = camParseRes(resolution);
  if (wh) { video.width = { ideal: wh[0] }; video.height = { ideal: wh[1] }; }
  return { video, audio: !!audio };
}
function camSupportReason() {
  if (!isBrowser) return 'unsupported';
  if (!win.isSecureContext) return 'insecure';
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'unsupported';
  return null;
}
/** Open a getUserMedia stream, normalizing errors to a short reason code. */
async function camOpenStream(constraints) {
  const reason = camSupportReason();
  if (reason) { const e = new Error(reason); e.reason = reason; throw e; }
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    let reason2 = 'error';
    const n = err && err.name;
    if (n === 'NotAllowedError' || n === 'PermissionDeniedError' || n === 'SecurityError') reason2 = 'denied';
    else if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') reason2 = 'nodevice';
    else if (n === 'NotReadableError' || n === 'TrackStartError') reason2 = 'hardware';
    const e2 = new Error(reason2); e2.reason = reason2; e2.cause = err;
    throw e2;
  }
}
function camStopStream(stream) { if (stream) { stream.__oStopDraw?.(); for (const tr of stream.getTracks()) { try { tr.stop(); } catch {} } } }
/** Resolve a File/Blob/data-URL/URL/<img>/<canvas>/<video>/ImageBitmap/ImageData `source` prop value into a
 * drawable (<canvas>/<img>/<video>/ImageBitmap). Shares camera/20-scanner.js's `scanLoadImage` (same folder scope). */
function camResolveDrawable(source) {
  if (isBrowser && win.ImageData && source instanceof ImageData) {
    const c = doc.createElement('canvas'); c.width = source.width; c.height = source.height;
    c.getContext('2d').putImageData(source, 0, 0);
    return Promise.resolve(c);
  }
  return scanLoadImage(source);
}
/** Wrap a static/live drawable in a MediaStream via `canvas.captureStream()` so the rest of the pipeline (mirror,
 * face guide, capture, review) can treat a `source` fixture exactly like a real getUserMedia() stream — the
 * offline test path for `<o-camera source>` (mirrors `<o-scanner source>`, see scanner/README.md). */
function camStreamFromDrawable(drawable) {
  const w = drawable.videoWidth || drawable.naturalWidth || drawable.width || 640;
  const h = drawable.videoHeight || drawable.naturalHeight || drawable.height || 480;
  const c = doc.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const draw = () => { try { ctx.drawImage(drawable, 0, 0, w, h); } catch {} };
  draw();
  let raf = 0;
  if (isBrowser && win.HTMLVideoElement && drawable instanceof HTMLVideoElement) {
    const loop = () => { draw(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
  }
  if (!c.captureStream) return null;
  const stream = c.captureStream(30);
  stream.__oStopDraw = () => { if (raf) cancelAnimationFrame(raf); };
  return stream;
}
/** enumerateDevices() filtered to video inputs (labels need a prior permission grant to be non-empty). */
async function camDevices() {
  if (!isBrowser || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    return list.filter(d => d.kind === 'videoinput').map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${t('camera.device')} ${i + 1}` }));
  } catch { return []; }
}
/** Draw the current video frame to a canvas (optionally cropped to `aspect` and mirrored). Returns the canvas. */
function camFrameCanvas(video, { aspect, mirror } = {}) {
  const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
  let sx = 0, sy = 0, sw = vw, sh = vh;
  if (aspect) {
    const [aw, ah] = String(aspect).split('/').map(Number);
    if (aw > 0 && ah > 0) {
      const target = aw / ah, cur = vw / vh;
      if (cur > target) { sw = Math.round(vh * target); sx = Math.round((vw - sw) / 2); }
      else { sh = Math.round(vw / target); sy = Math.round((vh - sh) / 2); }
    }
  }
  const c = doc.createElement('canvas');
  c.width = sw; c.height = sh;
  const ctx = c.getContext('2d');
  if (mirror) { ctx.translate(sw, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
  return c;
}
function camCanvasToFile(canvas, format, quality, name) {
  return new Promise(resolve => canvas.toBlob(b => resolve(b ? new File([b], name, { type: format }) : null), format, quality));
}

const CAM_STATE_META = {
  denied: { icon: 'camera-off', key: 'denied', hint: 'deniedHint', retry: true },
  nodevice: { icon: 'camera-off', key: 'nodevice', hint: 'nodeviceHint', retry: true },
  insecure: { icon: 'alert-triangle', key: 'insecure', hint: 'insecureHint', retry: false },
  unsupported: { icon: 'alert-triangle', key: 'unsupported', hint: '', retry: false },
  hardware: { icon: 'alert-circle', key: 'hardware', hint: 'hardwareHint', retry: true },
  error: { icon: 'alert-circle', key: 'hardware', hint: 'hardwareHint', retry: true },
};

class OCamera extends OElement {
  static props = {
    facing: { type: String, default: 'user', reflect: true },
    resolution: { type: String, default: '' },
    mirror: { type: Boolean, default: true },
    aspect: { type: String, default: '' },
    format: { type: String, default: 'image/jpeg' },
    quality: { type: Number, default: 0.92 },
    countdown: { type: Number, default: 0 },
    grid: { type: Boolean, default: false },
    torchToggle: { type: Boolean, default: true, attr: 'torch-toggle' },
    zoomControl: { type: Boolean, default: true, attr: 'zoom-control' },
    mode: { type: String, default: 'photo', reflect: true },
    deviceId: { type: String, default: '', attr: 'device-id' },
    autoStart: { type: Boolean, default: true, attr: 'auto-start' },
    review: { type: Boolean, default: true },
    /** Test/fixture path (property only, like `<o-scanner source>`): a MediaStream-like value (anything with
     * `getTracks()`), or a `<video>`/`<canvas>`/`ImageBitmap`/`ImageData`/File/Blob/image URL to capture from
     * instead of calling getUserMedia(). See README.md. */
    source: { type: Any, default: null, attr: false },
    texts: { type: Object, attr: false },
  };

  setup() {
    this.classList.add('o-camera');
    this._state = 'idle';
    this._stream = null;
    this._track = null;
    this._torchOn = false;
    this._pendingFile = null;
    this._reviewResolve = null;
    this._docScanner = null;

    this._video = h('video', { class: 'o-camera-video', playsinline: true, muted: true, 'aria-label': this.t('camera.preview') });
    this._video.autoplay = true;
    this._reviewImg = h('img', { class: 'o-camera-review', hidden: true, alt: this.t('camera.photoOf') });
    this._grid = h('div', { class: 'o-camera-grid', hidden: !this.grid, 'aria-hidden': 'true' });
    this._faceGuide = h('div', { class: 'o-camera-face-guide', hidden: true, 'aria-hidden': 'true' });
    this._flash = h('div', { class: 'o-camera-flash', 'aria-hidden': 'true' });
    this._countdownEl = h('div', { class: 'o-camera-countdown', hidden: true, 'aria-hidden': 'true' });
    this._hint = h('div', { class: 'o-camera-hint', role: 'status', hidden: true });
    this._statePanel = h('div', { class: 'o-camera-state', hidden: true });
    this._stage = h('div', { class: 'o-camera-stage' }, this._video, this._reviewImg, this._grid, this._faceGuide, this._flash, this._countdownEl, this._hint, this._statePanel);

    this._deviceSelect = h('select', { class: 'o-select o-select-sm o-camera-device', 'aria-label': this.t('camera.device') });
    on(this._deviceSelect, 'change', () => { this.deviceId = this._deviceSelect.value; this._restart(); });
    this._switchBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon', hidden: true, 'aria-label': this.t('camera.switchCamera'), title: this.t('camera.switchCamera') }, icon('repeat', { size: 18 }));
    on(this._switchBtn, 'click', () => this.switchCamera());
    this._torchBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon', hidden: true, 'aria-pressed': 'false', 'aria-label': this.t('camera.torch'), title: this.t('camera.torch') }, icon('zap', { size: 18 }));
    on(this._torchBtn, 'click', () => this._toggleTorch());
    this._zoomRange = h('input', { type: 'range', class: 'o-range o-camera-zoom', hidden: true, 'aria-label': this.t('camera.zoom') });
    on(this._zoomRange, 'input', () => this._applyZoom(+this._zoomRange.value));
    this._shutterBtn = h('button', { type: 'button', class: 'o-camera-shutter', 'aria-label': this.t('camera.takePhoto') });
    on(this._shutterBtn, 'click', () => this.capture());
    this._retakeBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost' }, icon('rotate-ccw', { size: 16 }), h('span', null, this.t('camera.retake')));
    on(this._retakeBtn, 'click', () => this.retake());
    this._useBtn = h('button', { type: 'button', class: 'o-btn o-btn-primary' }, icon('check', { size: 16 }), h('span', null, this.t('camera.usePhoto')));
    on(this._useBtn, 'click', () => this.confirmCapture());
    this._reviewActions = h('div', { class: 'o-camera-review-actions', hidden: true }, this._retakeBtn, this._useBtn);
    this._liveControls = h('div', { class: 'o-camera-live-controls' }, this._deviceSelect, this._switchBtn, this._zoomRange, this._torchBtn, this._shutterBtn);
    this._controls = h('div', { class: 'o-camera-controls' }, this._liveControls, this._reviewActions);

    this.append(this._stage, this._controls);
  }

  connected() {
    this.listen(doc, 'o-locale', () => this._retranslate());
    if (this.mode !== 'document' && this.autoStart && this._state === 'idle') this.start();
  }
  disconnected() { this.stop(); }

  update(changed) {
    if (changed.has('mode')) this._syncMode();
    if (changed.has('grid')) this._grid.hidden = !this.grid || this.mode === 'document';
    if (changed.has('mirror') && !changed.has('init')) this._video.classList.toggle('is-mirrored', this.mirror && this.facing === 'user');
    if (changed.has('torchToggle') || changed.has('zoomControl')) this._syncTrackControls();
    if ((changed.has('deviceId') || changed.has('facing') || changed.has('resolution') || changed.has('source')) && this._state === 'live' && !changed.has('init')) this._restart();
    if (changed.has('locale')) this._retranslate();
  }

  _retranslate() {
    this._deviceSelect.setAttribute('aria-label', this.t('camera.device'));
    this._switchBtn.setAttribute('aria-label', this.t('camera.switchCamera'));
    this._torchBtn.setAttribute('aria-label', this.t('camera.torch'));
    this._zoomRange.setAttribute('aria-label', this.t('camera.zoom'));
    this._shutterBtn.setAttribute('aria-label', this.t('camera.takePhoto'));
    this._retakeBtn.lastChild.textContent = this.t('camera.retake');
    this._useBtn.lastChild.textContent = this.t('camera.usePhoto');
  }

  _syncMode() {
    if (this.mode === 'document') { this._ensureDocScanner(); this.stop(); this._stage.hidden = true; this._controls.hidden = true; this._docScanner.hidden = false; }
    else { if (this._docScanner) this._docScanner.hidden = true; this._stage.hidden = false; this._controls.hidden = false; this._faceGuide.hidden = this.mode !== 'face'; this._hint.hidden = this.mode !== 'face'; if (this.autoStart && this._state === 'idle') this.start(); }
  }
  _ensureDocScanner() {
    if (this._docScanner) return this._docScanner;
    const ODocScanner = customElements.get('o-doc-scanner');
    if (!ODocScanner) return null;
    this._docScanner = doc.createElement('o-doc-scanner');
    this._docScanner.facing = this.facing; this._docScanner.format = this.format; this._docScanner.quality = this.quality;
    if (this.source) this._docScanner.source = this.source;
    this.append(this._docScanner);
    // No explicit re-emit needed: `emit()` dispatches with `bubbles: true` and `_docScanner` is a plain light-DOM
    // child, so its `o-scan` naturally bubbles up through `<o-camera>` — re-emitting here would fire it twice.
    return this._docScanner;
  }

  _setState(state, extra) {
    this._state = state;
    this._statePanel.hidden = !CAM_STATE_META[state];
    if (CAM_STATE_META[state]) {
      const m = CAM_STATE_META[state];
      this._statePanel.replaceChildren(
        h('div', { class: 'o-camera-state-icon' }, icon(m.icon, { size: 32 })),
        h('p', { class: 'o-camera-state-msg' }, this.t('camera.' + m.key)),
        m.hint ? h('p', { class: 'o-camera-state-hint' }, this.t('camera.' + m.hint)) : null,
        m.retry ? h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm', onClick: () => this.start() }, this.t('camera.retry')) : null);
    }
    this._liveControls.hidden = state !== 'live';
    this._video.hidden = state !== 'live';
    this._reviewImg.hidden = state !== 'review';
    this._reviewActions.hidden = state !== 'review';
    this._grid.hidden = state !== 'live' || !this.grid || this.mode === 'document';
    this._faceGuide.hidden = state !== 'live' || this.mode !== 'face';
    this.classList.toggle('is-live', state === 'live');
    this.emit('state', { state, ...extra });
  }

  /** Request the camera and start the live preview. */
  async start() {
    if (this.mode === 'document') { this._ensureDocScanner(); return this._docScanner && this._docScanner.start(); }
    if (this._state === 'starting' || this._state === 'live') return;
    this._setState('starting');
    try {
      const stream = await this._resolveStream();
      this._stream = stream;
      this._video.srcObject = stream;
      await this._video.play().catch(() => {});
      this._track = stream.getVideoTracks()[0] || null;
      this._video.classList.toggle('is-mirrored', this.mirror && this.facing === 'user');
      this._syncTrackControls();
      this._refreshDevices();
      this._setState('live');
      this.emit('ready', { stream });
      if (this.mode === 'face') this._faceStart?.();
    } catch (err) {
      this._setState(err.reason || 'error');
      this.emit('error', { reason: err.reason || 'error', message: err.message });
    }
  }
  /** Resolve the stream to preview: `source` (if set) or a real getUserMedia() request. */
  async _resolveStream() {
    if (this.source) {
      if (isFn(this.source.getTracks)) return this.source;
      const drawable = await camResolveDrawable(this.source);
      const stream = camStreamFromDrawable(drawable);
      if (!stream) { const e = new Error('unsupported'); e.reason = 'unsupported'; throw e; }
      return stream;
    }
    return camOpenStream(camConstraints({ facing: this.facing, resolution: this.resolution, deviceId: this.deviceId || undefined }));
  }
  /** Stop the stream and release all tracks. */
  stop() {
    this._faceStop?.();
    camStopStream(this._stream);
    this._stream = null; this._track = null;
    if (this._video) this._video.srcObject = null;
    if (this._docScanner) this._docScanner.stop();
    if (this._state === 'live' || this._state === 'starting') this._setState('idle');
  }
  async _restart() { if (this._state === 'live' || this._state === 'starting') { this.stop(); await this.start(); } }

  async _refreshDevices() {
    const list = await camDevices();
    this._deviceSelect.replaceChildren(...list.map(d => h('option', { value: d.deviceId, selected: d.deviceId === this.deviceId }, d.label)));
    this._deviceSelect.hidden = list.length < 2;
    this._switchBtn.hidden = list.length < 2;
  }
  _syncTrackControls() {
    const caps = this._track && this._track.getCapabilities ? this._track.getCapabilities() : {};
    this._torchBtn.hidden = !(this.torchToggle && caps.torch);
    if (caps.zoom && this.zoomControl) {
      this._zoomRange.hidden = false;
      this._zoomRange.min = caps.zoom.min ?? 1; this._zoomRange.max = caps.zoom.max ?? 5; this._zoomRange.step = caps.zoom.step ?? 0.1;
      const settings = this._track.getSettings ? this._track.getSettings() : {};
      this._zoomRange.value = settings.zoom ?? caps.zoom.min ?? 1;
    } else this._zoomRange.hidden = true;
  }
  async _toggleTorch() {
    if (!this._track) return;
    this._torchOn = !this._torchOn;
    try { await this._track.applyConstraints({ advanced: [{ torch: this._torchOn }] }); this._torchBtn.setAttribute('aria-pressed', String(this._torchOn)); this._torchBtn.classList.toggle('is-active', this._torchOn); }
    catch { this._torchOn = false; }
  }
  async _applyZoom(v) { if (this._track) try { await this._track.applyConstraints({ advanced: [{ zoom: v }] }); } catch {} }

  /** Switch to the next available camera (cycles facing on mobile, or the device list). */
  async switchCamera() {
    const list = await camDevices();
    if (list.length > 1 && this.deviceId) {
      const i = list.findIndex(d => d.deviceId === this.deviceId);
      this.deviceId = list[(i + 1) % list.length].deviceId;
    } else this.facing = this.facing === 'user' ? 'environment' : 'user';
    await this._restart();
  }

  async _runCountdown() {
    const n = Math.round(this.countdown);
    this._countdownEl.hidden = false;
    for (let i = n; i > 0; i--) { this._countdownEl.textContent = String(i); announce(String(i)); await sleep(1000); }
    this._countdownEl.hidden = true;
  }
  async _shutterFlash() { await animate(this._flash, [{ opacity: 0 }, { opacity: .85, offset: .12 }, { opacity: 0 }], { duration: 260 }); }

  /** Capture the current frame. With `review` (default) this resolves once the user confirms ("Use photo"). */
  async capture(opts = {}) {
    if (this._state !== 'live') { if (this._state === 'idle') await this.start(); if (this._state !== 'live') return null; }
    if (this.countdown > 0) await this._runCountdown();
    this._shutterFlash();
    const canvas = camFrameCanvas(this._video, { aspect: this.aspect, mirror: this.mirror && this.facing === 'user' });
    const format = opts.format || this.format, quality = opts.quality ?? this.quality;
    const file = await camCanvasToFile(canvas, format, quality, 'photo-' + Date.now() + (format === 'image/png' ? '.png' : '.jpg'));
    if (!file) return null;
    this._lastDataURL = canvas.toDataURL(format, quality);
    if (!this.review) { this._finish(file); return file; }
    this._pendingFile = file;
    this._reviewImg.src = this._lastDataURL;
    this._setState('review');
    return new Promise(resolve => { this._reviewResolve = resolve; });
  }
  /** Return from the review screen to the live preview without using the photo. */
  retake() { this._pendingFile = null; this._setState('live'); }
  /** Confirm the pending capture from the review screen (fires o-capture, resolves capture()'s promise). */
  confirmCapture() {
    if (!this._pendingFile) return;
    const file = this._pendingFile; this._pendingFile = null;
    this._setState('live');
    this._finish(file);
    if (this._reviewResolve) { this._reviewResolve(file); this._reviewResolve = null; }
  }
  _finish(file) { announce(this.t('camera.captured')); this.emit('capture', { file, blob: file, dataURL: this._lastDataURL }); }
}
define('o-camera', OCamera);
O.Camera = OCamera;

O.camera = {
  devices: camDevices,
  supported: () => !camSupportReason(),
  /** Open a modal with a live <o-camera> and resolve with the captured File (or null if cancelled). */
  capture(opts = {}) {
    return new Promise(resolve => {
      const cam = doc.createElement('o-camera');
      cam.facing = opts.facing || 'user'; cam.mode = opts.mode || 'photo';
      if (opts.countdown) cam.countdown = opts.countdown;
      if (opts.aspect) cam.aspect = opts.aspect;
      cam.format = opts.format || 'image/jpeg'; cam.quality = opts.quality ?? 0.92;
      let settled = false;
      const handle = O.modal._mount('o-modal', {
        title: opts.title || t('camera.captureTitle'),
        content: cam,
        buttons: [{ text: t('common.cancel'), value: null }],
      }, el => { el.size = opts.size || 'sm'; el.centered = true; });
      on(cam, 'o-capture', e => { settled = true; resolve(e.detail.file); handle.close('capture'); }, { once: true });
      on(cam, 'o-scan', e => { settled = true; resolve(e.detail.pages && e.detail.pages[0] ? e.detail.pages[0].file : null); handle.close('scan'); }, { once: true });
      handle.result.then(v => { if (!settled) resolve(v || null); });
    });
  },
};
