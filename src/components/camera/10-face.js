/* Face capture mode — <o-camera mode="face">: oval guide, FaceDetector when available (centered + large-enough
 * guidance, auto-capture after steady frames), otherwise a luminance + Laplacian-variance blur heuristic. */
i18n.add('en', {
  camera: {
    faceDark: 'Too dark — find better light', faceCenter: 'Center your face in the oval', faceCloser: 'Move closer',
    faceFarther: 'Move back a little', faceStill: 'Hold still', faceGood: 'Perfect — hold still…',
  },
});

/** Mean luminance and a Laplacian-variance focus/motion proxy for an ImageData. */
function faceLumaStats(imgData) {
  const { data, width, height } = imgData;
  const gray = new Float32Array(width * height);
  let sum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) { const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; gray[p] = l; sum += l; }
  const mean = sum / (gray.length || 1);
  let lsum = 0, lsum2 = 0, n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i];
      lsum += lap; lsum2 += lap * lap; n++;
    }
  }
  const lmean = n ? lsum / n : 0;
  return { mean, variance: n ? lsum2 / n - lmean * lmean : 0 };
}

Object.assign(OCamera.prototype, {
  _faceStart() {
    if (this._faceTimer) return;
    this._faceSteady = 0; this._faceBusy = false;
    this._faceDetector = (isBrowser && win.FaceDetector) ? new win.FaceDetector({ fastMode: true, maxDetectedFaces: 1 }) : null;
    this._faceCanvas = this._faceCanvas || doc.createElement('canvas');
    this._faceCanvas.width = 160; this._faceCanvas.height = 120;
    this._faceGuide.hidden = false;
    this._faceTimer = setInterval(() => this._faceTick(), 220);
  },
  _faceStop() {
    if (this._faceTimer) { clearInterval(this._faceTimer); this._faceTimer = null; }
    this._faceSteady = 0;
    this._faceGuide.classList.remove('is-good');
    if (this._hint) { this._hint.hidden = true; this._hint.textContent = ''; }
  },
  async _faceTick() {
    if (this._faceBusy || !this._video || this._video.readyState < 2 || this._state !== 'live') return;
    this._faceBusy = true;
    try {
      const c = this._faceCanvas, ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(this._video, 0, 0, c.width, c.height);
      let box = null;
      if (this._faceDetector) {
        try { const faces = await this._faceDetector.detect(c); if (faces && faces[0]) box = faces[0].boundingBox; } catch { this._faceDetector = null; }
      }
      let data; try { data = ctx.getImageData(0, 0, c.width, c.height); } catch { this._faceBusy = false; return; }
      const { mean, variance } = faceLumaStats(data);
      let msgKey = null;
      if (mean < 45) msgKey = 'faceDark';
      else if (box) {
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        const dCx = Math.abs(cx - c.width / 2) / c.width, dCy = Math.abs(cy - c.height / 2) / c.height;
        const sizeRatio = box.height / c.height;
        if (dCx > 0.16 || dCy > 0.16) msgKey = 'faceCenter';
        else if (sizeRatio < 0.28) msgKey = 'faceCloser';
        else if (sizeRatio > 0.78) msgKey = 'faceFarther';
        else if (variance < 15) msgKey = 'faceStill';
      } else if (variance < 15) msgKey = 'faceStill';
      this._hint.hidden = false;
      this._hint.textContent = msgKey ? this.t('camera.' + msgKey) : this.t('camera.faceGood');
      this._faceGuide.classList.toggle('is-good', !msgKey);
      if (!msgKey) { if (++this._faceSteady >= 8) { this._faceSteady = 0; this._faceStop(); this.capture(); } }
      else this._faceSteady = 0;
    } finally { this._faceBusy = false; }
  },
});
