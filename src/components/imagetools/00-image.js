/* Orion.image — canvas image helpers (EXIF-aware, promise based; functions accept a File, Blob, URL, <img> or <canvas>).
 *   load(src) / fromFile(file) -> Promise<HTMLImageElement>   upright in every browser (EXIF orientation applied)
 *   readExifOrientation(blob | ArrayBuffer) -> Promise<1..8>    exifAuto() -> Promise<boolean> (browser applies EXIF itself)
 *   toCanvas(src, { width, height, fit: 'contain'|'cover'|'fill', maxWidth, maxHeight, background }) -> Promise<canvas>
 *   toBlob(canvas, type = 'image/png', quality) -> Promise<Blob>
 *   compress(src, { maxWidth, maxHeight, quality = .8, type = 'image/jpeg', maxSizeKB, minQuality = .4, background = '#fff' })
 *     -> Promise<Blob|File> with .report = { before, after, saved, width, height, quality, type }
 *   resize(src, { width, height, fit, type, quality }) · rotate(src, deg, opts) · flip(src, 'h'|'v', opts)
 *   crop(src, { x, y, width, height }, opts) · filter(src, { brightness, contrast, saturation, grayscale, sepia, blur, hue, invert }, opts)
 *   filterCSS(filters) -> CSS filter string · info(src) -> Promise<{ width, height, type, size, orientation }>
 */
i18n.add('en', {
  image: { loadError: 'The image could not be loaded' },
  cropper: {
    label: 'Image cropper', area: 'Crop area', areaType: 'crop area', hint: 'Arrow keys move the crop area, Shift + arrow keys resize it, + and − zoom, R rotates.',
    size: '{width} × {height} px', zoom: 'Zoom', zoomIn: 'Zoom in', zoomOut: 'Zoom out', rotateLeft: 'Rotate left', rotateRight: 'Rotate right',
    angle: 'Straighten', flipH: 'Flip horizontally', flipV: 'Flip vertically', reset: 'Reset', title: 'Crop image', apply: 'Apply', cancel: 'Cancel',
    free: 'Free', square: 'Square', loading: 'Loading image…', error: 'The image could not be loaded',
  },
});

const IMG_EXIF_TEST = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAABAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAbEAEAAAcAAAAAAAAAAAAAAAAAAQMFBjZ0sv/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCPuDIantze4gA//9k=';
let imgExifP = null;
const imgCanvas = (w, h) => { const c = doc.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const imgIsBlob = v => typeof Blob !== 'undefined' && v instanceof Blob;

/** Does the browser apply EXIF orientation to <img> and drawImage by itself? (cached) */
function exifAuto() {
  if (!imgExifP) imgExifP = new Promise(res => { const i = new Image(); i.onload = () => res(i.naturalWidth === 1 && i.naturalHeight === 2); i.onerror = () => res(false); i.src = IMG_EXIF_TEST; });
  return imgExifP;
}
/** EXIF orientation (1–8) of a JPEG; 1 for anything else. */
async function readExifOrientation(src) {
  try {
    const buf = src instanceof ArrayBuffer ? src : await (imgIsBlob(src) ? src.slice(0, 131072) : src).arrayBuffer();
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return 1;
    let off = 2;
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off), len = v.getUint16(off + 2);
      if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) {
        const tiff = off + 10, little = v.getUint16(tiff) === 0x4949, ifd = tiff + v.getUint32(tiff + 4, little), n = v.getUint16(ifd, little);
        for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (e + 10 > v.byteLength) break; if (v.getUint16(e, little) === 0x0112) return v.getUint16(e + 8, little) || 1; }
        return 1;
      }
      if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) break;
      off += 2 + len;
    }
  } catch {}
  return 1;
}
function imgOrient(ctx, o, w, h) {
  const m = { 2: [-1, 0, 0, 1, w, 0], 3: [-1, 0, 0, -1, w, h], 4: [1, 0, 0, -1, 0, h], 5: [0, 1, 1, 0, 0, 0], 6: [0, 1, -1, 0, h, 0], 7: [0, -1, -1, 0, h, w], 8: [0, -1, 1, 0, 0, w] }[o];
  if (m) ctx.transform(...m);
}
function imgFromURL(url, cross) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.decoding = 'async';
    if (cross && !/^(data|blob):/.test(url)) { try { if (new URL(url, location.href).origin !== location.origin) i.crossOrigin = 'anonymous'; } catch {} }
    i.onload = () => res(i);
    i.onerror = () => rej(new Error(t('image.loadError')));
    i.src = url;
  });
}
/** load(File | Blob | url | img | canvas) -> Promise<HTMLImageElement | canvas> (upright) */
async function imgLoad(src) {
  if (!isBrowser) throw new Error('no DOM');
  if (src instanceof HTMLImageElement) { if (!src.complete || !src.naturalWidth) await (src.decode ? src.decode() : new Promise((r, j) => { src.onload = r; src.onerror = j; })); return src; }
  if (src instanceof HTMLCanvasElement || (win.ImageBitmap && src instanceof ImageBitmap)) return src;
  if (imgIsBlob(src)) {
    const url = URL.createObjectURL(src);
    try {
      const img = await imgFromURL(url);
      const o = /jpe?g/i.test(src.type || '') ? await readExifOrientation(src) : 1;
      if (o > 1 && !(await exifAuto())) {
        const w = img.naturalWidth, hh = img.naturalHeight, sw = o > 4, c = imgCanvas(sw ? hh : w, sw ? w : hh), ctx = c.getContext('2d');
        imgOrient(ctx, o, w, hh); ctx.drawImage(img, 0, 0);
        const b = await imgToBlob(c, 'image/png');
        const url2 = URL.createObjectURL(b);
        try { return await imgFromURL(url2); } finally { URL.revokeObjectURL(url2); }
      }
      return img;
    } finally { URL.revokeObjectURL(url); }
  }
  return imgFromURL(String(src), true);
}
const imgSize = s => ({ w: s.naturalWidth || s.videoWidth || s.width, h: s.naturalHeight || s.videoHeight || s.height });
/** toBlob(canvas, type, quality) -> Promise<Blob> */
function imgToBlob(canvas, type = 'image/png', quality) {
  return new Promise((res, rej) => {
    if (canvas.toBlob) canvas.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), type, quality);
    else fetch(canvas.toDataURL(type, quality)).then(r => r.blob()).then(res, rej);
  });
}
/** High-quality draw: halves the image in steps when shrinking a lot (sharper than one big downscale). */
function imgDraw(ctx, src, sx, sy, sw, sh, dx, dy, dw, dh) {
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  let cur = src, cx = sx, cy = sy, cw = sw, ch = sh;
  while (cw / dw > 2.2 && ch / dh > 2.2) {
    const c = imgCanvas(cw / 2, ch / 2), x = c.getContext('2d');
    x.imageSmoothingQuality = 'high'; x.drawImage(cur, cx, cy, cw, ch, 0, 0, c.width, c.height);
    cur = c; cx = 0; cy = 0; cw = c.width; ch = c.height;
  }
  ctx.drawImage(cur, cx, cy, cw, ch, dx, dy, dw, dh);
}
/** toCanvas(src, { width, height, fit, maxWidth, maxHeight, background }) */
async function imgToCanvas(src, o = {}) {
  const img = await imgLoad(src), { w: sw, h: sh } = imgSize(img);
  let sx = 0, sy = 0, cw = sw, ch = sh, w = sw, hh = sh;
  if (o.width || o.height) {
    const tw = o.width || (sw * o.height) / sh, th = o.height || (sh * o.width) / sw;
    if (o.fit === 'cover') { const k = Math.max(tw / sw, th / sh); cw = tw / k; ch = th / k; sx = (sw - cw) / 2; sy = (sh - ch) / 2; w = tw; hh = th; }
    else if (o.fit === 'fill') { w = tw; hh = th; }
    else { const k = Math.min(tw / sw, th / sh); w = sw * k; hh = sh * k; }
  }
  const k = Math.min(1, (o.maxWidth || Infinity) / w, (o.maxHeight || Infinity) / hh);
  const c = imgCanvas(w * k, hh * k), ctx = c.getContext('2d');
  if (o.background) { ctx.fillStyle = o.background; ctx.fillRect(0, 0, c.width, c.height); }
  imgDraw(ctx, img, sx, sy, cw, ch, 0, 0, c.width, c.height);
  return c;
}
const imgType = (src, o = {}) => o.type || (imgIsBlob(src) && /^image\/(png|jpeg|webp)$/.test(src.type) ? src.type : 'image/png');
function imgResult(blob, src, type) {
  if (typeof File !== 'undefined' && src instanceof File) {
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[blob.type] || 'img';
    return new File([blob], src.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: blob.type || type, lastModified: Date.now() });
  }
  return blob;
}
async function imgOut(canvas, src, o) {
  const type = imgType(src, o);
  const b = await imgToBlob(canvas, type, o.quality ?? 0.92);
  return imgResult(b, src, type);
}
/** compress(src, opts) -> Blob|File (+ .report) */
async function imgCompress(src, o = {}) {
  const type = o.type || 'image/jpeg', q0 = o.quality ?? 0.8, minQ = o.minQuality ?? 0.4, before = imgIsBlob(src) ? src.size : null;
  const bg = type === 'image/jpeg' ? o.background ?? '#fff' : null;
  let canvas = await imgToCanvas(src, { maxWidth: o.maxWidth, maxHeight: o.maxHeight, background: bg }), q = q0;
  let blob = await imgToBlob(canvas, type, q);
  const limit = o.maxSizeKB ? o.maxSizeKB * 1024 : 0;
  for (let guard = 0; limit && blob.size > limit && guard < 12; guard++) {
    if (type !== 'image/png' && q > minQ + 0.01) {
      let lo = minQ, hi = q, best = null, bestQ = q;
      for (let k = 0; k < 6; k++) { const mid = (lo + hi) / 2, b = await imgToBlob(canvas, type, mid); if (b.size <= limit) { best = b; bestQ = mid; lo = mid; } else hi = mid; }
      if (best) { blob = best; q = bestQ; break; }
      q = minQ;
    }
    const c2 = imgCanvas(canvas.width * 0.85, canvas.height * 0.85), x = c2.getContext('2d');
    if (bg) { x.fillStyle = bg; x.fillRect(0, 0, c2.width, c2.height); }
    imgDraw(x, canvas, 0, 0, canvas.width, canvas.height, 0, 0, c2.width, c2.height);
    canvas = c2;
    blob = await imgToBlob(canvas, type, q);
  }
  let out = imgResult(blob, src, type);
  const orig = imgIsBlob(src) ? await imgLoad(src).then(imgSize).catch(() => null) : null;
  if (before != null && blob.size >= before && src.type === blob.type && orig && orig.w === canvas.width && orig.h === canvas.height) out = src;
  out.report = { before, after: out.size, saved: before ? Math.max(0, 1 - out.size / before) : 0, width: canvas.width, height: canvas.height, quality: round(q, 2), type: out.type || blob.type };
  return out;
}
/** filterCSS({ brightness: 1.1, contrast: 1, saturation: 1.2, grayscale: 0, sepia: 0, blur: 0, hue: 0, invert: 0 }) */
function imgFilterCSS(f = {}) {
  const out = [];
  if (f.brightness != null && +f.brightness !== 1) out.push(`brightness(${+f.brightness})`);
  if (f.contrast != null && +f.contrast !== 1) out.push(`contrast(${+f.contrast})`);
  if (f.saturation != null && +f.saturation !== 1) out.push(`saturate(${+f.saturation})`);
  if (+f.grayscale) out.push(`grayscale(${+f.grayscale})`);
  if (+f.sepia) out.push(`sepia(${+f.sepia})`);
  if (+f.hue) out.push(`hue-rotate(${+f.hue}deg)`);
  if (+f.invert) out.push(`invert(${+f.invert})`);
  if (+f.blur) out.push(`blur(${+f.blur}px)`);
  return out.join(' ') || 'none';
}
function imgPixels(ctx, w, hh, f) {
  const d = ctx.getImageData(0, 0, w, hh), p = d.data;
  const br = f.brightness ?? 1, ct = f.contrast ?? 1, sa = f.saturation ?? 1, gr = +f.grayscale || 0, se = +f.sepia || 0, inv = +f.invert || 0;
  for (let i = 0; i < p.length; i += 4) {
    let r = p[i] * br, g = p[i + 1] * br, b = p[i + 2] * br;
    r = (r - 128) * ct + 128; g = (g - 128) * ct + 128; b = (b - 128) * ct + 128;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = l + (r - l) * sa; g = l + (g - l) * sa; b = l + (b - l) * sa;
    if (gr) { const y = 0.2126 * r + 0.7152 * g + 0.0722 * b; r += (y - r) * gr; g += (y - g) * gr; b += (y - b) * gr; }
    if (se) { const sr = 0.393 * r + 0.769 * g + 0.189 * b, sg = 0.349 * r + 0.686 * g + 0.168 * b, sb = 0.272 * r + 0.534 * g + 0.131 * b; r += (sr - r) * se; g += (sg - g) * se; b += (sb - b) * se; }
    if (inv) { r += (255 - 2 * r) * inv; g += (255 - 2 * g) * inv; b += (255 - 2 * b) * inv; }
    p[i] = r; p[i + 1] = g; p[i + 2] = b;
  }
  ctx.putImageData(d, 0, 0);
}

O.image = {
  load: imgLoad, fromFile: imgLoad, readExifOrientation, exifAuto, toBlob: imgToBlob, toCanvas: imgToCanvas, compress: imgCompress, filterCSS: imgFilterCSS,
  async resize(src, o = {}) { return imgOut(await imgToCanvas(src, o), src, o); },
  async rotate(src, deg = 90, o = {}) {
    const img = await imgLoad(src), { w, h: hh } = imgSize(img), a = (deg * Math.PI) / 180, cs = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a));
    const c = imgCanvas(w * cs + hh * sn, w * sn + hh * cs), ctx = c.getContext('2d');
    if (o.background) { ctx.fillStyle = o.background; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.translate(c.width / 2, c.height / 2); ctx.rotate(a); ctx.drawImage(img, -w / 2, -hh / 2);
    return imgOut(c, src, o);
  },
  async flip(src, axis = 'h', o = {}) {
    const img = await imgLoad(src), { w, h: hh } = imgSize(img), c = imgCanvas(w, hh), ctx = c.getContext('2d');
    if (axis === 'h') ctx.transform(-1, 0, 0, 1, w, 0); else ctx.transform(1, 0, 0, -1, 0, hh);
    ctx.drawImage(img, 0, 0);
    return imgOut(c, src, o);
  },
  async crop(src, r, o = {}) {
    const img = await imgLoad(src), c = imgCanvas(o.width || r.width, o.height || r.height), ctx = c.getContext('2d');
    if (o.background) { ctx.fillStyle = o.background; ctx.fillRect(0, 0, c.width, c.height); }
    imgDraw(ctx, img, r.x || 0, r.y || 0, r.width, r.height, 0, 0, c.width, c.height);
    return imgOut(c, src, o);
  },
  async filter(src, f = {}, o = {}) {
    const img = await imgLoad(src), { w, h: hh } = imgSize(img), c = imgCanvas(w, hh), ctx = c.getContext('2d');
    const native = 'filter' in ctx && ctx.filter === 'none';
    if (native) { ctx.filter = imgFilterCSS(f); ctx.drawImage(img, 0, 0); }
    else { ctx.drawImage(img, 0, 0); imgPixels(ctx, w, hh, f); }
    return imgOut(c, src, o);
  },
  async info(src) {
    const img = await imgLoad(src), { w, h: hh } = imgSize(img);
    return { width: w, height: hh, type: imgIsBlob(src) ? src.type : '', size: imgIsBlob(src) ? src.size : null, orientation: imgIsBlob(src) ? await readExifOrientation(src) : 1 };
  },
};
