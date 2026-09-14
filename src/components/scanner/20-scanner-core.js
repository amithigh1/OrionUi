/* ============================================================================
 * Orion.scanner — shared image/camera helpers, BarcodeDetector feature
 * detection (per format) with the pure-JS decoders as fallback, and the
 * .decodeImage() / .open() service API. The <o-scanner> element lives in
 * 30-scanner-element.js.
 * ========================================================================== */
i18n.add('en', {
  scanner: {
    close: 'Close scanner', permission: 'Camera access is required to scan.', https: 'Camera access requires HTTPS (or localhost).',
    noCamera: 'No camera was found on this device.', starting: 'Starting camera…', switchCamera: 'Switch camera', torch: 'Toggle flashlight',
    upload: 'Upload an image', dropHint: 'Drop an image here or click to browse', scanning: 'Point the camera at a code',
    found: 'Code detected',
  },
});

const SCANNER_1D_FORMATS = ['ean13','ean8','upca','code128','code128a','code128b','code128c','code39','itf','itf14','codabar'];
const SCANNER_ALL_FORMATS = ['qr_code', ...SCANNER_1D_FORMATS];
const SCANNER_NATIVE_MAP = { qr_code: 'qr_code', ean13: 'ean_13', ean8: 'ean_8', upca: 'upc_a', code128: 'code_128', code128a: 'code_128', code128b: 'code_128', code128c: 'code_128', code39: 'code_39', itf: 'itf', itf14: 'itf', codabar: 'codabar' };
const SCANNER_NATIVE_REV = { qr_code: 'qr_code', ean_13: 'ean13', ean_8: 'ean8', upc_a: 'upca', code_128: 'code128', code_39: 'code39', itf: 'itf', codabar: 'codabar' };

function scannerNormalizeFormats(formats) {
  const list = formats == null ? SCANNER_ALL_FORMATS : toArr(formats).flatMap(f => String(f).split(','));
  const out = list.map(f => f.trim().toLowerCase()).filter(Boolean);
  return out.length ? out : SCANNER_ALL_FORMATS.slice();
}
let __nativeSupportedCache = null;
async function scannerSupportedNative() {
  if (__nativeSupportedCache) return __nativeSupportedCache;
  if (!isBrowser || !win.BarcodeDetector) return (__nativeSupportedCache = new Set());
  try { __nativeSupportedCache = new Set(await win.BarcodeDetector.getSupportedFormats()); }
  catch { __nativeSupportedCache = new Set(); }
  return __nativeSupportedCache;
}

/** Load any accepted image source into an offscreen canvas. */
function scannerBlobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Orion.scanner: failed to load image')); };
    img.src = url;
  });
}
async function scannerToCanvas(source) {
  if (source instanceof HTMLCanvasElement) return { canvas: source, ctx: source.getContext('2d', { willReadFrequently: true }), width: source.width, height: source.height };
  if (isBrowser && win.ImageData && source instanceof ImageData) {
    const canvas = doc.createElement('canvas');
    canvas.width = source.width; canvas.height = source.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.putImageData(source, 0, 0);
    return { canvas, ctx, width: source.width, height: source.height };
  }
  let img = source;
  if (source instanceof Blob || (typeof File !== 'undefined' && source instanceof File)) img = await scannerBlobToImage(source);
  else if (source instanceof HTMLImageElement && !source.complete) await new Promise(r => { source.onload = r; source.onerror = r; });
  else if (!(source instanceof HTMLVideoElement) && !(source instanceof HTMLImageElement) && !(isBrowser && win.ImageBitmap && source instanceof ImageBitmap)) {
    throw new Error('Orion.scanner: unsupported image source (expected File, Blob, <img>, <video>, <canvas>, ImageData or ImageBitmap)');
  }
  const width = img.videoWidth || img.naturalWidth || img.width, height = img.videoHeight || img.naturalHeight || img.height;
  if (!width || !height) throw new Error('Orion.scanner: image has no dimensions');
  const canvas = doc.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);
  return { canvas, ctx, width, height };
}

/**
 * Orion.scanner.decodeImage(source, { formats }) -> Promise<[{ text, format, points }]>
 * `source` is a File, Blob, <img>, <video>, <canvas>, ImageData or ImageBitmap.
 * Prefers the native BarcodeDetector per requested format, falls back to the pure-JS decoders.
 */
async function scannerDecodeImage(source, opts = {}) {
  const formats = scannerNormalizeFormats(opts.formats);
  const { canvas, ctx, width, height } = await scannerToCanvas(source);
  const supported = opts.forcePureJS ? new Set() : await scannerSupportedNative();
  const nativeFormats = formats.filter(f => supported.has(SCANNER_NATIVE_MAP[f]));
  const jsFormats = formats.filter(f => !nativeFormats.includes(f));
  const results = [];
  if (nativeFormats.length) {
    try {
      const detector = new win.BarcodeDetector({ formats: [...new Set(nativeFormats.map(f => SCANNER_NATIVE_MAP[f]))] });
      const found = await detector.detect(canvas);
      for (const r of found) results.push({ text: r.rawValue, format: SCANNER_NATIVE_REV[r.format] || r.format, points: (r.cornerPoints || []).map(p => [p.x, p.y]) });
    } catch (e) { jsFormats.push(...nativeFormats.filter(f => !jsFormats.includes(f))); }
  }
  if (jsFormats.length) {
    const imgData = ctx.getImageData(0, 0, width, height);
    if (jsFormats.includes('qr_code')) results.push(...qrDecodeImageData(imgData));
    const oneD = jsFormats.filter(f => f !== 'qr_code');
    if (oneD.length) { const gray = qrGrayscale(imgData); results.push(...decode1DGray(gray, width, height, oneD)); }
  }
  return results;
}

/** Orion.scanner.open({ formats, title }) -> Promise<{text,format,points}|null> — modal camera/upload picker. */
function scannerOpen(opts = {}) {
  return new Promise(resolve => {
    const scannerEl = h('o-scanner', { formats: scannerNormalizeFormats(opts.formats).join(',') });
    const closeBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-scanner-modal-close', 'aria-label': t('scanner.close') }, iconEl('x'));
    const panel = h('div', { class: 'o-scanner-modal o-floating', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || t('scanner.scanning') }, closeBtn, scannerEl);
    portal(panel, doc.body);
    let done = false;
    const finish = result => { if (done) return; done = true; ov.close('api'); resolve(result); };
    const offScan = on(scannerEl, 'o-scan', e => finish(e.detail));
    const ov = overlays.open({
      el: panel, escape: true, outside: true, modal: true, lockScroll: true, trap: true,
      onClose: () => { offScan(); scannerEl.stop?.(); panel.remove(); if (!done) { done = true; resolve(null); } },
    });
    on(closeBtn, 'click', () => ov.close('api'));
    animate(panel, 'zoomIn', { duration: 150 });
    requestAnimationFrame(() => scannerEl.start?.());
  });
}

O.scanner = { decodeImage: scannerDecodeImage, open: scannerOpen, formats: SCANNER_ALL_FORMATS.slice() };
O.scanner.__debug = {
  qrGrayscale, qrBinarize, qrScanRowFinders, qrRefineCenter, qrClusterCenters, qrPickTriples, qrTryDecodeOriented, qrDecodeBinary,
  qrComputeHomography, qrSampleMatrix, qrReadFormatInfo, qrBuildReservedMask, qrReadDataBits, qrDeinterleave, qrRsDecodeBlock, qrDecodeSegments, qrFindAlignmentNear,
  QR_MASK_FNS_D, QR_ECC_TABLE_D,
};
