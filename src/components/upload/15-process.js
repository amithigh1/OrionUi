/* Upload — image decoding, EXIF-correct drawing, compression/resizing, crop, thumbnails and video posters.
 * Orion.image.compress / Orion.cropImage (media package) are used when present; the built-ins are the fallback. */

const cssOrientation = () => isBrowser && !!win.CSS?.supports?.('image-orientation', 'from-image');
const isRaster = ty => /^image\/(jpeg|png|webp|bmp|avif)$/.test(ty);

/** Decode an image blob -> { src (ImageBitmap | HTMLImageElement), width, height, orientation (still to apply), close() } */
async function decodeImage(blob) {
  if (win.createImageBitmap) {
    try { const bm = await createImageBitmap(blob, { imageOrientation: 'from-image' }); return { src: bm, width: bm.width, height: bm.height, orientation: 1, close: () => bm.close?.() }; } catch {}
  }
  const url = URL.createObjectURL(blob);
  const img = new Image(); img.src = url;
  try { await img.decode(); } catch (e) { URL.revokeObjectURL(url); throw e; }
  // Browsers without CSS image-orientation support draw raw pixels: apply EXIF ourselves.
  const orientation = cssOrientation() ? 1 : ((await imageInfo(blob))?.orientation || 1);
  const swap = orientation >= 5;
  return { src: img, width: swap ? img.naturalHeight : img.naturalWidth, height: swap ? img.naturalWidth : img.naturalHeight, orientation, close: () => URL.revokeObjectURL(url) };
}
/** Draw a decoded image into a w x h canvas (optionally a source crop in display coordinates). */
function drawImage(d, w, h, crop) {
  const c = doc.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  const o = d.orientation, cw = c.width, ch = c.height;
  const T = { 2: [-1, 0, 0, 1, cw, 0], 3: [-1, 0, 0, -1, cw, ch], 4: [1, 0, 0, -1, 0, ch], 5: [0, 1, 1, 0, 0, 0], 6: [0, 1, -1, 0, cw, 0], 7: [0, -1, -1, 0, cw, ch], 8: [0, -1, 1, 0, 0, ch] }[o];
  if (T) g.setTransform(...T);
  const [dw, dh] = o >= 5 ? [ch, cw] : [cw, ch];
  if (crop && o === 1) g.drawImage(d.src, crop.x, crop.y, crop.width, crop.height, 0, 0, dw, dh);
  else g.drawImage(d.src, 0, 0, dw, dh);
  return c;
}
const canvasBlob = (c, type, q) => new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('encode failed'))), type, q));
const EXT_FOR = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const renameTo = (name, type) => (EXT_FOR[type] ? String(name).replace(/\.[^.\/]+$/, '') + '.' + EXT_FOR[type] : name);
const asFile = (blob, like, type = blob.type) => (blob instanceof File && blob.name ? blob : new File([blob], renameTo(like.name, type), { type, lastModified: like.lastModified || Date.now() }));

/**
 * compressImage(file, { maxWidth, maxHeight, quality=0.82, type, minSize=0 }) -> File (original when not smaller / not an image)
 * GIF and SVG are never re-encoded.
 */
async function compressImage(file, opts = {}) {
  const o = opts === true ? {} : opts;
  const type = typeOf(file);
  if (!isRaster(type) || file.size < parseSize(o.minSize)) return file;
  if (isFn(O.image?.compress)) {
    try { const r = await O.image.compress(file, o); if (r instanceof Blob) return asFile(r, file); } catch (e) { console.warn('[Orion] upload: Orion.image.compress failed, using built-in', e); }
  }
  let d;
  try { d = await decodeImage(file); } catch { return file; }
  try {
    const scale = Math.min(1, (o.maxWidth || Infinity) / d.width, (o.maxHeight || Infinity) / d.height);
    const out = o.type || (type === 'image/png' ? 'image/png' : type === 'image/webp' ? 'image/webp' : 'image/jpeg');
    const blob = await canvasBlob(drawImage(d, d.width * scale, d.height * scale), out, o.quality ?? 0.82);
    if (scale === 1 && out === type && blob.size >= file.size) return file;
    return asFile(blob, file, out);
  } finally { d.close(); }
}
/**
 * cropImage(file, { aspect, width, height, type, quality }) -> File | null (null = canceled)
 * Uses Orion.cropImage (interactive, media package) when present; otherwise crops the centre to `aspect` automatically.
 */
async function cropImage(file, opts = {}) {
  const o = opts === true ? {} : opts;
  const type = typeOf(file);
  if (!isRaster(type)) return file;
  if (isFn(O.cropImage)) {
    const r = await O.cropImage(file, o);
    return r == null || r === false ? null : r instanceof Blob ? asFile(r, file) : file;
  }
  if (!o.aspect && !(o.width && o.height)) return file;
  const aspect = o.aspect || o.width / o.height;
  const d = await decodeImage(file);
  try {
    let cw = d.width, ch = cw / aspect;
    if (ch > d.height) { ch = d.height; cw = ch * aspect; }
    const crop = { x: (d.width - cw) / 2, y: (d.height - ch) / 2, width: cw, height: ch };
    const scale = Math.min(1, o.width ? o.width / cw : 1, o.height ? o.height / ch : 1);
    let src = d;
    if (d.orientation !== 1) src = { src: drawImage(d, d.width, d.height), orientation: 1 }; // normalise first
    const out = o.type || (type === 'image/png' ? 'image/png' : 'image/jpeg');
    return asFile(await canvasBlob(drawImage(src, cw * scale, ch * scale, crop), out, o.quality ?? 0.9), file, out);
  } finally { d.close(); }
}

/* ── previews ──────────────────────────────────────────────────────── */
/** thumbnail(file, px=160) -> Promise<objectURL | null>  (caller revokes) */
async function thumbnail(file, px = 160) {
  if (!isBrowser || !file) return null;
  const type = typeOf(file);
  if (/^image\//.test(type)) {
    if (/svg|gif/.test(type) || (file.size < 120e3 && cssOrientation())) return URL.createObjectURL(file);
    try {
      const d = await decodeImage(file);
      try {
        const s = Math.min(1, (px * 2) / Math.min(d.width, d.height));
        return URL.createObjectURL(await canvasBlob(drawImage(d, d.width * s, d.height * s), 'image/jpeg', 0.8));
      } finally { d.close(); }
    } catch { return /heic|tiff/.test(type) ? null : URL.createObjectURL(file); }
  }
  if (/^video\//.test(type)) return videoPoster(file, px);
  return null;
}
/** First meaningful frame of a video -> objectURL | null */
function videoPoster(file, px = 160) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = doc.createElement('video');
    let done = false;
    const finish = res => { if (done) return; done = true; clearTimeout(tm); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); resolve(res); };
    const tm = setTimeout(() => finish(null), 5000);
    v.muted = true; v.playsInline = true; v.preload = 'metadata';
    v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 0) / 10); };
    v.onseeked = () => {
      try {
        const s = Math.min(1, (px * 2) / Math.max(1, Math.min(v.videoWidth, v.videoHeight)));
        const c = drawImage({ src: v, orientation: 1 }, v.videoWidth * s, v.videoHeight * s);
        c.toBlob(b => finish(b ? URL.createObjectURL(b) : null), 'image/jpeg', 0.75);
      } catch { finish(null); }
    };
    v.onerror = () => finish(null);
    v.src = url;
  });
}

/* ── file type presentation ─────────────────────────────────────────── */
const TYPE_GROUPS = [
  [/^image\//, 'image', 'info'], [/^video\//, 'video', 'info'], [/^audio\//, 'audio', 'info'],
  [/pdf$/, 'pdf', 'danger'], [/(msword|wordprocessing|opendocument\.text|rtf)/, 'doc', 'primary'],
  [/(excel|spreadsheet|csv)/, 'sheet', 'success'], [/(powerpoint|presentation)/, 'slides', 'warning'],
  [/(zip|rar|7z|gzip|tar|compressed)/, 'archive', 'secondary'], [/^text\/|json|xml|javascript/, 'text', 'secondary'],
];
/** fileKind(file | {name,type}) -> { group, color, icon, ext } */
function fileKind(f) {
  const ty = typeOf(f), ext = extOf(f.name);
  const g = TYPE_GROUPS.find(([re]) => re.test(ty)) || [null, 'file', 'secondary'];
  const has = n => !!O.icons?.has?.(n);
  // Prefer the richer per-kind icons from the icons package (file-image, file-pdf, file-zip...) when it's
  // loaded, falling back to core-only icons (image, play, mic...) so this still looks reasonable without it.
  const pick = (...names) => names.find(has);
  const icon = {
    image: pick('file-image', 'image'), video: pick('file-video', 'video') || 'play', audio: pick('file-audio', 'music') || 'mic',
    pdf: pick('file-pdf', 'file-text'), doc: pick('file-text'), sheet: pick('file-spreadsheet', 'file-text'),
    slides: pick('file-text'), archive: pick('file-zip'), text: pick('file-code', 'file-text'),
  }[g[1]] || 'file';
  return { group: g[1], color: g[2], icon, ext: ext.slice(0, 4).toUpperCase() };
}
