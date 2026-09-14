/* Document scanner — <o-doc-scanner> (also used by <o-camera mode="document">): capture or upload a page,
 * automatic edge detection (grayscale -> blur -> Sobel -> convex hull -> largest quadrilateral, falling back to
 * the full frame), draggable 4-corner handles with a magnifier loupe, perspective correction (homography +
 * bilinear sampling), filters, rotate, a reorderable multi-page session, and PDF / image export.
 *   <o-doc-scanner facing="environment"></o-doc-scanner>
 *   Methods: start() stop() capture() loadImage(src) autoDetect() applyCorners() setFilter(i,name) rotate(i,deg)
 *            removePage(i) reorderPage(from,to) clear() exportPDF() exportImages()
 *   Properties: pages (read-only array of { canvas, corners, filter, rotation }) · corners (current edit quad)
 *            · source (property only — test/fixture path for start(), see README.md)
 *   Events: o-ready o-error o-scan { page, pages, index }
 */
i18n.add('en', {
  docScanner: {
    upload: 'Upload', capture: 'Capture page', startCamera: 'Start camera', autoDetect: 'Auto detect edges',
    useFullFrame: 'Use full frame', addPage: 'Add page', exportPdf: 'Export PDF', exportImages: 'Download images',
    clearAll: 'Clear all', pageAdded: 'Page {n} added', pageRemoved: 'Page removed', rotate: 'Rotate',
    moveUp: 'Move earlier', moveDown: 'Move later', noPdf: 'PDF export is unavailable — downloading images instead',
    cornerTL: 'Top-left corner', cornerTR: 'Top-right corner', cornerBR: 'Bottom-right corner', cornerBL: 'Bottom-left corner',
    pageCount: { one: '{count} page', other: '{count} pages' },
    filter: { original: 'Original', grayscale: 'Grayscale', bw: 'Black & white', enhance: 'Enhance' },
  },
});

/* ── image processing: grayscale / blur / Sobel / hull / homography / filters ── */
function scanBoxBlur(src, w, h, radius) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), win2 = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0; const row = y * w;
    for (let x = -radius; x <= radius; x++) sum += src[row + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) { tmp[row + x] = sum / win2; sum += src[row + clamp(x + radius + 1, 0, w - 1)] - src[row + clamp(x - radius, 0, w - 1)]; }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = sum / win2; sum += tmp[clamp(y + radius + 1, 0, h - 1) * w + x] - tmp[clamp(y - radius, 0, h - 1) * w + x]; }
  }
  return out;
}
function scanSobel(gray, w, h) {
  const out = new Float32Array(w * h), gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1], gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sx = 0, sy = 0, k = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = gray[(y + dy) * w + (x + dx)]; sx += v * gx[k]; sy += v * gy[k]; k++; }
      out[y * w + x] = Math.hypot(sx, sy);
    }
  }
  return out;
}
function scanConvexHull(points) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}
/** Greedy area-based simplification (Visvalingam–Whyatt) down to exactly 4 vertices. */
function scanSimplifyToQuad(hull) {
  let pts = hull.slice();
  while (pts.length > 4) {
    const n = pts.length; let minIdx = 0, minArea = Infinity;
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
      const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
      if (area < minArea) { minArea = area; minIdx = i; }
    }
    pts.splice(minIdx, 1);
  }
  return pts;
}
/** Order 4 points as [topLeft, topRight, bottomRight, bottomLeft]. */
function scanOrderQuad(pts) {
  const bySum = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const byDiff = [...pts].sort((a, b) => (a.x - a.y) - (b.x - b.y));
  return [bySum[0], byDiff[byDiff.length - 1], bySum[bySum.length - 1], byDiff[0]];
}
/** Detect the document quadrilateral in `source` (canvas/image/video). Returns 4 points in source pixel space. */
function detectDocumentQuad(source) {
  const ow = source.videoWidth || source.naturalWidth || source.width, oh = source.videoHeight || source.naturalHeight || source.height;
  const scale = Math.min(1, 520 / Math.max(ow || 1, oh || 1));
  const w = Math.max(4, Math.round(ow * scale)), h = Math.max(4, Math.round(oh * scale));
  const c = doc.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) gray[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  const mag = scanSobel(scanBoxBlur(gray, w, h, 1), w, h);
  let sum = 0, sum2 = 0;
  for (let i = 0; i < mag.length; i++) { sum += mag[i]; sum2 += mag[i] * mag[i]; }
  const mean = sum / mag.length, sd = Math.sqrt(Math.max(0, sum2 / mag.length - mean * mean));
  const thresh = mean + sd * 1.15;
  const pts = [];
  for (let y = 0; y < h; y++) {
    let left = -1, right = -1;
    for (let x = 0; x < w; x++) if (mag[y * w + x] > thresh) { if (left < 0) left = x; right = x; }
    if (left >= 0) { pts.push({ x: left, y }); pts.push({ x: right, y }); }
  }
  for (let x = 0; x < w; x++) {
    let top = -1, bottom = -1;
    for (let y = 0; y < h; y++) if (mag[y * w + x] > thresh) { if (top < 0) top = y; bottom = y; }
    if (top >= 0) { pts.push({ x, y: top }); pts.push({ x, y: bottom }); }
  }
  let quad = null;
  if (pts.length >= 8) {
    const hull = scanConvexHull(pts);
    if (hull.length >= 4) quad = scanOrderQuad(hull.length > 4 ? scanSimplifyToQuad(hull) : hull);
  }
  if (!quad) {
    const inset = Math.round(Math.min(w, h) * 0.04);
    quad = scanOrderQuad([{ x: inset, y: inset }, { x: w - inset, y: inset }, { x: w - inset, y: h - inset }, { x: inset, y: h - inset }]);
  }
  const inv = 1 / scale;
  return quad.map(p => ({ x: clamp(p.x * inv, 0, ow), y: clamp(p.y * inv, 0, oh) }));
}
function scanSolve8(A, b) {
  const n = 8, M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const pv = M[col][col] || 1e-12;
    for (let c = col; c <= n; c++) M[col][c] /= pv;
    for (let r = 0; r < n; r++) { if (r === col) continue; const f = M[r][col]; if (f) for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]; }
  }
  return M.map(row => row[n]);
}
/** 3x3 homography (row-major, h[8]=1) mapping each from[i] to to[i], for 4 point correspondences. */
function computeHomography(from, to) {
  const A = [], B = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i], { x: X, y: Y } = to[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); B.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); B.push(Y);
  }
  const h = scanSolve8(A, B);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}
/** Warp the quadrilateral `corners` (TL,TR,BR,BL) of `srcCanvas` into a new outW x outH canvas. */
function warpPerspective(srcCanvas, corners, outW, outH) {
  const rect = [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }];
  const H = computeHomography(rect, corners);
  const sw = srcCanvas.width, sh = srcCanvas.height;
  const srcData = srcCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
  const out = doc.createElement('canvas'); out.width = outW; out.height = outH;
  const octx = out.getContext('2d');
  const outImg = octx.createImageData(outW, outH), od = outImg.data;
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const wq = H[6] * u + H[7] * v + 1;
      const x = (H[0] * u + H[1] * v + H[2]) / wq, y = (H[3] * u + H[4] * v + H[5]) / wq;
      const o = (v * outW + u) * 4;
      if (x < 0 || y < 0 || x > sw - 1 || y > sh - 1) { od[o] = od[o + 1] = od[o + 2] = 255; od[o + 3] = 255; continue; }
      const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
      const fx = x - x0, fy = y - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      for (let k = 0; k < 4; k++) {
        const top = srcData[i00 + k] * (1 - fx) + srcData[i10 + k] * fx, bot = srcData[i01 + k] * (1 - fx) + srcData[i11 + k] * fx;
        od[o + k] = top * (1 - fy) + bot * fy;
      }
    }
  }
  octx.putImageData(outImg, 0, 0);
  return out;
}
function quadOutputSize(corners) {
  const [tl, tr, br, bl] = corners;
  const w = Math.max(Math.hypot(tr.x - tl.x, tr.y - tl.y), Math.hypot(br.x - bl.x, br.y - bl.y));
  const h = Math.max(Math.hypot(bl.x - tl.x, bl.y - tl.y), Math.hypot(br.x - tr.x, br.y - tr.y));
  return { w: Math.max(40, Math.round(w)), h: Math.max(40, Math.round(h)) };
}
function rotateCanvas(src, deg) {
  const d = ((deg % 360) + 360) % 360; if (!d) return src;
  const swap = d % 180 !== 0, out = doc.createElement('canvas');
  out.width = swap ? src.height : src.width; out.height = swap ? src.width : src.height;
  const ctx = out.getContext('2d');
  ctx.translate(out.width / 2, out.height / 2); ctx.rotate(d * Math.PI / 180); ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}
function scanFilterCanvas(src, name) {
  const w = src.width, h = src.height, out = doc.createElement('canvas'); out.width = w; out.height = h;
  const ctx = out.getContext('2d'); ctx.drawImage(src, 0, 0);
  if (!name || name === 'original') return out;
  const id = ctx.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; d[i] = d[i + 1] = d[i + 2] = l; }
  if (name === 'enhance') {
    let min = 255, max = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i] < min) min = d[i]; if (d[i] > max) max = d[i]; }
    const range = Math.max(1, max - min);
    for (let i = 0; i < d.length; i += 4) { const v = clamp(((d[i] - min) / range) * 255 * 1.06, 0, 255); d[i] = d[i + 1] = d[i + 2] = v; }
  } else if (name === 'bw') {
    const gray = new Float32Array(w * h);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) gray[p] = d[i];
    const local = scanBoxBlur(gray, w, h, 12), C = 8;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) { const v = gray[p] > local[p] - C ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; }
  }
  ctx.putImageData(id, 0, 0);
  return out;
}
function scanLoadImage(source) {
  return new Promise((resolve, reject) => {
    if (source instanceof HTMLCanvasElement || source instanceof HTMLVideoElement || (win.ImageBitmap && source instanceof ImageBitmap)) { resolve(source); return; }
    if (source instanceof HTMLImageElement) { if (source.complete && source.naturalWidth) resolve(source); else { source.onload = () => resolve(source); source.onerror = () => reject(new Error('image load failed')); } return; }
    const img = new Image(); let objectUrl = null;
    img.onload = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); resolve(img); };
    img.onerror = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); reject(new Error('image load failed')); };
    if (source instanceof Blob) img.src = objectUrl = URL.createObjectURL(source); else img.src = String(source);
  });
}

const SCAN_CORNER_KEYS = ['docScanner.cornerTL', 'docScanner.cornerTR', 'docScanner.cornerBR', 'docScanner.cornerBL'];
const SCAN_FILTERS = ['original', 'grayscale', 'bw', 'enhance'];

class ODocScanner extends OElement {
  static props = {
    facing: { type: String, default: 'environment' },
    resolution: { type: String, default: '' },
    format: { type: String, default: 'image/jpeg' },
    quality: { type: Number, default: 0.9 },
    deviceId: { type: String, default: '', attr: 'device-id' },
    /** Test/fixture path (property only, like `<o-scanner source>`): a MediaStream-like value (anything with
     * `getTracks()`), or a `<video>`/`<canvas>`/`ImageBitmap`/`ImageData`/File/Blob/image URL to feed `start()`'s
     * live preview from instead of calling getUserMedia() — `loadImage(source)` is the separate one-shot path
     * straight into corner-editing. See README.md. */
    source: { type: Any, default: null, attr: false },
    texts: { type: Object, attr: false },
  };

  setup() {
    this.classList.add('o-scanner');
    this.pages = [];
    this._state = 'idle';
    this._corners = null;
    this._rawCanvas = null;
    this._activeHandle = null;
    this._stream = null;

    this._video = h('video', { class: 'o-scanner-video', playsinline: true, muted: true, hidden: true });
    this._video.autoplay = true;
    this._editCanvas = h('canvas', { class: 'o-scanner-edit-canvas', hidden: true });
    this._quadPoly = svg('polygon', { class: 'o-scanner-quad' });
    this._overlaySvg = svg('svg', { class: 'o-scanner-overlay', viewBox: '0 0 100 100', preserveAspectRatio: 'none', hidden: true, 'aria-hidden': 'true' }, this._quadPoly);
    this._handles = [0, 1, 2, 3].map(i => h('div', { class: 'o-scanner-handle', 'data-i': String(i), tabindex: '0', role: 'button', hidden: true, 'aria-label': this.t(SCAN_CORNER_KEYS[i]) }));
    this._loupe = h('canvas', { class: 'o-scanner-loupe', width: 96, height: 96, hidden: true });
    this._statePanel = h('div', { class: 'o-camera-state', hidden: true });
    this._stage = h('div', { class: 'o-scanner-stage' }, this._video, this._editCanvas, this._overlaySvg, ...this._handles, this._loupe, this._statePanel);

    this._fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true, tabindex: '-1' });
    on(this._fileInput, 'change', () => { const f = this._fileInput.files[0]; if (f) this.loadImage(f); this._fileInput.value = ''; });
    this._startBtn = h('button', { type: 'button', class: 'o-btn o-btn-primary' }, icon('camera', { size: 16 }), h('span', null, this.t('docScanner.startCamera')));
    on(this._startBtn, 'click', () => this.start());
    this._uploadBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost' }, icon('cloud-upload', { size: 16 }), h('span', null, this.t('docScanner.upload')));
    on(this._uploadBtn, 'click', () => this._fileInput.click());
    this._shutterBtn = h('button', { type: 'button', class: 'o-camera-shutter', hidden: true, 'aria-label': this.t('docScanner.capture') });
    on(this._shutterBtn, 'click', () => this.capture());
    this._deviceSelect = h('select', { class: 'o-select o-select-sm o-camera-device', hidden: true, 'aria-label': this.t('camera.device') });
    on(this._deviceSelect, 'change', () => { this.deviceId = this._deviceSelect.value; this._restart(); });
    this._captureControls = h('div', { class: 'o-scanner-controls' }, this._deviceSelect, this._startBtn, this._uploadBtn, this._shutterBtn, this._fileInput);

    this._autoBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm' }, icon('scan', { size: 16 }), h('span', null, this.t('docScanner.autoDetect')));
    on(this._autoBtn, 'click', () => this.autoDetect());
    this._fullBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm' }, h('span', null, this.t('docScanner.useFullFrame')));
    on(this._fullBtn, 'click', () => this._useFullFrame());
    this._cancelEditBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm' }, this.t('common.cancel'));
    on(this._cancelEditBtn, 'click', () => this._cancelEdit());
    this._applyBtn = h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm' }, icon('check', { size: 16 }), h('span', null, this.t('docScanner.addPage')));
    on(this._applyBtn, 'click', () => this.applyCorners());
    this._editControls = h('div', { class: 'o-scanner-controls', hidden: true }, this._autoBtn, this._fullBtn, this._cancelEditBtn, this._applyBtn);

    this._pagesList = h('div', { class: 'o-scanner-pages', hidden: true });
    this._countLabel = h('span', { class: 'o-scanner-count' });
    this._exportPdfBtn = h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm' }, icon('file-text', { size: 16 }), h('span', null, this.t('docScanner.exportPdf')));
    on(this._exportPdfBtn, 'click', () => this.exportPDF());
    this._exportImgBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm' }, icon('images', { size: 16 }), h('span', null, this.t('docScanner.exportImages')));
    on(this._exportImgBtn, 'click', () => this.exportImages());
    this._clearAllBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm' }, icon('trash', { size: 16 }), h('span', null, this.t('docScanner.clearAll')));
    on(this._clearAllBtn, 'click', () => this.clear());
    this._exportBar = h('div', { class: 'o-scanner-export', hidden: true }, this._countLabel, this._exportImgBtn, this._exportPdfBtn, this._clearAllBtn);

    this.append(this._stage, this._captureControls, this._editControls, this._pagesList, this._exportBar);
    this._wireHandles();
    this._setState('idle');
  }
  connected() { this.listen(doc, 'o-locale', () => this._retranslate()); }
  disconnected() { this.stop(); }
  update(changed) {
    if ((changed.has('facing') || changed.has('resolution') || changed.has('source')) && this._state === 'live') this._restart();
    if (changed.has('locale')) this._retranslate();
  }
  _retranslate() {
    this._handles.forEach((el, i) => el.setAttribute('aria-label', this.t(SCAN_CORNER_KEYS[i])));
    this._renderPages();
  }

  _setState(state) {
    this._state = state;
    const meta = CAM_STATE_META[state];
    this._statePanel.hidden = !meta;
    if (meta) {
      this._statePanel.replaceChildren(
        h('div', { class: 'o-camera-state-icon' }, icon(meta.icon, { size: 32 })),
        h('p', { class: 'o-camera-state-msg' }, this.t('camera.' + meta.key)),
        meta.hint ? h('p', { class: 'o-camera-state-hint' }, this.t('camera.' + meta.hint)) : null,
        meta.retry ? h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm', onClick: () => this.start() }, this.t('camera.retry')) : null);
    }
    const live = state === 'live', edit = state === 'edit';
    this._video.hidden = !live;
    this._deviceSelect.hidden = !live;
    this._shutterBtn.hidden = !live;
    this._startBtn.hidden = live || edit || state === 'starting';
    this._uploadBtn.hidden = edit;
    this._editCanvas.hidden = !edit;
    this._overlaySvg.hidden = !edit;
    this._handles.forEach(el => { el.hidden = !edit; });
    if (!edit) this._loupe.hidden = true;
    this._editControls.hidden = !edit;
    this._pagesList.hidden = !this.pages.length || edit;
    this._exportBar.hidden = !this.pages.length || edit;
  }

  async start() {
    if (this._state === 'starting' || this._state === 'live') return;
    this._setState('starting');
    try {
      const stream = await this._resolveStream();
      this._stream = stream; this._video.srcObject = stream; await this._video.play().catch(() => {});
      await this._refreshDevices();
      this._setState('live');
      this.emit('ready', { stream });
    } catch (err) { this._setState(err.reason || 'error'); this.emit('error', { reason: err.reason || 'error', message: err.message }); }
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
  stop() {
    camStopStream(this._stream); this._stream = null;
    if (this._video) this._video.srcObject = null;
    if (this._state === 'live' || this._state === 'starting') this._setState(this.pages.length || this._rawCanvas ? 'idle' : 'idle');
  }
  async _restart() { if (this._state === 'live') { this.stop(); await this.start(); } }
  async _refreshDevices() {
    const list = await camDevices();
    this._deviceSelect.replaceChildren(...list.map(d => h('option', { value: d.deviceId, selected: d.deviceId === this.deviceId }, d.label)));
    this._deviceSelect.hidden = list.length < 2;
  }

  /** Capture the current live frame and enter the corner-editing step. */
  capture() { if (this._state === 'live') this._beginEdit(camFrameCanvas(this._video, {})); }
  /** Load an image (File/Blob/dataURL/canvas/<img>/<video>) and enter the corner-editing step. */
  async loadImage(source) {
    const img = O.image && O.image.load ? await O.image.load(source) : await scanLoadImage(source);
    const w = img.naturalWidth || img.videoWidth || img.width, h2 = img.naturalHeight || img.videoHeight || img.height;
    const c = doc.createElement('canvas'); c.width = w; c.height = h2;
    c.getContext('2d').drawImage(img, 0, 0, w, h2);
    this._beginEdit(c);
  }
  _beginEdit(canvas) { this._rawCanvas = canvas; this._setState('edit'); this._editCanvas.width = canvas.width; this._editCanvas.height = canvas.height; this._editCanvas.getContext('2d').drawImage(canvas, 0, 0); this.autoDetect(); }
  _cancelEdit() { this._rawCanvas = null; this._corners = null; this._setState(this._stream ? 'live' : 'idle'); }
  _useFullFrame() { if (!this._rawCanvas) return; const w = this._rawCanvas.width, h2 = this._rawCanvas.height; this._corners = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h2 }, { x: 0, y: h2 }]; this._syncHandles(); }

  /** Re-run automatic edge detection on the frame being edited. Returns the 4 corners. */
  autoDetect() { if (!this._rawCanvas) return null; this._corners = detectDocumentQuad(this._rawCanvas); this._syncHandles(); return this.corners; }
  get corners() { return this._corners ? clone(this._corners) : null; }
  set corners(v) { if (Array.isArray(v) && v.length === 4) { this._corners = v.map(p => ({ x: +p.x, y: +p.y })); this._syncHandles(); } }

  _syncHandles() {
    if (!this._corners || !this._rawCanvas) return;
    const w = this._rawCanvas.width, h2 = this._rawCanvas.height;
    this._handles.forEach((el, i) => { const p = this._corners[i]; el.style.left = (p.x / w * 100) + '%'; el.style.top = (p.y / h2 * 100) + '%'; });
    this._quadPoly.setAttribute('points', this._corners.map(p => (p.x / w * 100) + ',' + (p.y / h2 * 100)).join(' '));
  }
  _wireHandles() {
    this._handles.forEach((el, i) => {
      on(el, 'pointerdown', e => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch {} this._activeHandle = i; this._loupe.hidden = false; this._moveHandle(e); });
      on(el, 'pointermove', e => { if (this._activeHandle === i) this._moveHandle(e); });
      on(el, 'pointerup pointercancel', e => { if (this._activeHandle === i) { this._activeHandle = null; this._loupe.hidden = true; try { el.releasePointerCapture(e.pointerId); } catch {} } });
      on(el, 'keydown', e => {
        if (!this._corners) return;
        const step = e.shiftKey ? 12 : 3; let dx = 0, dy = 0;
        if (e.key === 'ArrowLeft') dx = -step; else if (e.key === 'ArrowRight') dx = step; else if (e.key === 'ArrowUp') dy = -step; else if (e.key === 'ArrowDown') dy = step; else return;
        e.preventDefault();
        const w = this._rawCanvas.width, h2 = this._rawCanvas.height, p = this._corners[i];
        this._corners[i] = { x: clamp(p.x + dx, 0, w), y: clamp(p.y + dy, 0, h2) };
        this._syncHandles();
      });
    });
  }
  _moveHandle(e) {
    const i = this._activeHandle; if (i == null || !this._rawCanvas) return;
    const rect = this._editCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const w = this._rawCanvas.width, h2 = this._rawCanvas.height;
    const x = clamp((e.clientX - rect.left) / rect.width * w, 0, w), y = clamp((e.clientY - rect.top) / rect.height * h2, 0, h2);
    this._corners[i] = { x, y };
    this._syncHandles();
    this._drawLoupe(e, x, y);
  }
  _drawLoupe(e, x, y) {
    const ctx = this._loupe.getContext('2d'), zoom = 3, size = 96, half = size / (2 * zoom);
    ctx.clearRect(0, 0, size, size); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this._rawCanvas, x - half, y - half, half * 2, half * 2, 0, 0, size, size);
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size); ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2); ctx.stroke();
    const stageRect = this._stage.getBoundingClientRect();
    let lx = e.clientX - stageRect.left + 16, ly = e.clientY - stageRect.top - size - 16;
    if (ly < 0) ly = e.clientY - stageRect.top + 16;
    this._loupe.style.left = clamp(lx, 0, Math.max(0, stageRect.width - size)) + 'px';
    this._loupe.style.top = ly + 'px';
  }

  /** Perspective-correct the current edit frame with the current corners and add it as a page. */
  async applyCorners() {
    if (!this._rawCanvas || !this._corners) return null;
    const { w, h: h2 } = quadOutputSize(this._corners);
    const processed = warpPerspective(this._rawCanvas, this._corners, w, h2);
    const page = { raw: this._rawCanvas, corners: clone(this._corners), filter: 'original', rotation: 0, processed };
    this.pages.push(page);
    this._rawCanvas = null; this._corners = null;
    this._renderPages();
    this._setState(this._stream ? 'live' : 'idle');
    announce(this.t('docScanner.pageAdded', { n: this.pages.length }));
    this.emit('scan', { page: this._pageSummary(page), pages: this.pages.map(p => this._pageSummary(p)), index: this.pages.length - 1 });
    return processed;
  }
  _finalCanvas(page) { let c = scanFilterCanvas(page.processed, page.filter); if (page.rotation) c = rotateCanvas(c, page.rotation); return c; }
  _pageSummary(page) { return { canvas: this._finalCanvas(page), corners: page.corners, filter: page.filter, rotation: page.rotation }; }

  setFilter(i, name) { if (this.pages[i] && SCAN_FILTERS.includes(name)) { this.pages[i].filter = name; this._renderPages(); } }
  rotate(i, deg = 90) { if (this.pages[i]) { this.pages[i].rotation = ((this.pages[i].rotation + deg) % 360 + 360) % 360; this._renderPages(); } }
  removePage(i) { if (!this.pages[i]) return; this.pages.splice(i, 1); this._renderPages(); announce(this.t('docScanner.pageRemoved')); }
  reorderPage(from, to) { if (to < 0 || to >= this.pages.length || !this.pages[from]) return; const [p] = this.pages.splice(from, 1); this.pages.splice(to, 0, p); this._renderPages(); }
  /** Discard the whole session. */
  clear() { this.pages = []; this._rawCanvas = null; this._corners = null; this._renderPages(); this._setState(this._stream ? 'live' : 'idle'); }

  _renderPages() {
    this._pagesList.hidden = !this.pages.length || this._state === 'edit';
    this._exportBar.hidden = !this.pages.length || this._state === 'edit';
    this._countLabel.textContent = this.t('docScanner.pageCount', { count: this.pages.length });
    this._pagesList.replaceChildren(...this.pages.map((p, i) => this._renderPageItem(p, i)));
  }
  _renderPageItem(page, i) {
    const canvas = this._finalCanvas(page);
    const thumb = h('canvas', { class: 'o-scanner-thumb', width: 120, height: Math.max(1, Math.round(120 * canvas.height / canvas.width)) });
    thumb.getContext('2d').drawImage(canvas, 0, 0, thumb.width, thumb.height);
    const filterSel = h('select', { class: 'o-select o-select-sm', 'aria-label': this.t('camera.device') }, SCAN_FILTERS.map(f => h('option', { value: f, selected: f === page.filter }, this.t('docScanner.filter.' + f))));
    on(filterSel, 'change', () => this.setFilter(i, filterSel.value));
    const rotateBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': this.t('docScanner.rotate') }, icon('rotate-cw', { size: 14 }));
    on(rotateBtn, 'click', () => this.rotate(i));
    const upBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', disabled: i === 0, 'aria-label': this.t('docScanner.moveUp') }, icon('chevron-left', { size: 14 }));
    on(upBtn, 'click', () => this.reorderPage(i, i - 1));
    const downBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', disabled: i === this.pages.length - 1, 'aria-label': this.t('docScanner.moveDown') }, icon('chevron-right', { size: 14 }));
    on(downBtn, 'click', () => this.reorderPage(i, i + 1));
    const delBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': this.t('common.remove') }, icon('trash', { size: 14 }));
    on(delBtn, 'click', () => this.removePage(i));
    return h('div', { class: 'o-scanner-page' }, h('div', { class: 'o-scanner-page-num' }, String(i + 1)), thumb, filterSel, h('div', { class: 'o-scanner-page-actions' }, upBtn, rotateBtn, downBtn, delBtn));
  }

  /** Export every page as a single multi-page PDF (uses O.PDF when present) and trigger a download. */
  async exportPDF() {
    if (!this.pages.length) return null;
    if (!O.PDF) { announce(this.t('docScanner.noPdf')); await this.exportImages(); return null; }
    const margin = 10, pageW = 210 - margin * 2, pageH = 297 - margin * 2;
    const pdf = new O.PDF({ size: 'A4', unit: 'mm', margin, title: 'Scanned document' });
    for (let i = 0; i < this.pages.length; i++) {
      if (i > 0) pdf.addPage();
      const c = this._finalCanvas(this.pages[i]);
      const ar = c.width / c.height, arPage = pageW / pageH;
      let w = pageW, h2 = pageW / ar;
      if (ar <= arPage) { h2 = pageH; w = pageH * ar; }
      pdf.image(c, margin + (pageW - w) / 2, margin + (pageH - h2) / 2, { width: w, height: h2 });
    }
    const blob = await pdf.toBlob();
    download(blob, 'scan-' + Date.now() + '.pdf');
    return blob;
  }
  /** Export every page as a separate image download. */
  async exportImages() {
    for (let i = 0; i < this.pages.length; i++) {
      const c = this._finalCanvas(this.pages[i]);
      const blob = await new Promise(res => c.toBlob(res, this.format, this.quality));
      if (blob) download(blob, 'scan-' + Date.now() + '-' + (i + 1) + (this.format === 'image/png' ? '.png' : '.jpg'));
      await sleep(120);
    }
    return this.pages.length;
  }
}
define('o-doc-scanner', ODocScanner);
O.DocScanner = ODocScanner;
