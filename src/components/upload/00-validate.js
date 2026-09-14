/* Upload — strings, size parsing, type matching, magic-number sniffing, image header parsing, validation.
 * Everything in src/components/upload/*.js shares one function scope (concatenated in file-name order). */

i18n.add('en', {
  upload: {
    label: 'Upload files', labelOne: 'Upload a file',
    title: 'Drag & drop files here or {browse}', titleOne: 'Drag & drop a file here or {browse}', browse: 'browse',
    dropActive: 'Release to add files', overlay: 'Drop files to upload', overlayHint: 'Files are added to “{label}”',
    choose: 'Choose files', chooseOne: 'Choose file', chooseFolder: 'Choose folder', noFile: 'No file chosen',
    selected: { one: '{count} file selected', other: '{count} files selected' },
    added: { one: '{count} file added', other: '{count} files added' },
    hintMaxSize: 'up to {size} each', hintMaxSizeOne: 'up to {size}', hintTotal: '{size} total',
    hintMaxFiles: { one: 'max {count} file', other: 'max {count} files' }, hintPaste: 'or paste from clipboard',
    kinds: { image: 'Images', video: 'Videos', audio: 'Audio', text: 'Text files', application: 'Files' },
    status: {
      validating: 'Checking…', processing: 'Processing…', queued: 'Queued', ready: 'Ready', uploading: 'Uploading',
      paused: 'Paused', done: 'Uploaded', error: 'Failed', rejected: 'Rejected', canceled: 'Canceled', remote: 'Uploaded',
    },
    speed: '{speed}/s', eta: '{time} left', of: '{loaded} of {total}',
    summary: '{done} of {total} uploaded', summaryDone: { one: '{count} file uploaded', other: '{count} files uploaded' },
    summaryQueued: { one: '{count} file ready to upload', other: '{count} files ready to upload' },
    summaryErrors: { one: '{count} failed', other: '{count} failed' }, summaryPaused: 'Paused', summaryOffline: 'Offline — waiting for connection',
    uploadAll: { one: 'Upload {count} file', other: 'Upload {count} files' },
    clear: 'Clear all', clearDone: 'Clear completed', pauseAll: 'Pause all', resumeAll: 'Resume all', retryAll: 'Retry failed',
    pause: 'Pause', resume: 'Resume', cancel: 'Cancel', retry: 'Retry', remove: 'Remove', preview: 'Preview',
    change: 'Change', changePhoto: 'Change photo', removePhoto: 'Remove photo', addPhoto: 'Upload photo', addMore: 'Add more files',
    pasted: 'pasted', folderFiles: { one: '{count} file from “{name}”', other: '{count} files from “{name}”' },
    moved: 'Moved to position {pos} of {count}',
    errors: {
      type: 'File type not allowed', typeList: 'File type not allowed (allowed: {types})',
      mismatch: 'File content does not match its type', mismatchAs: 'Content is a {detected} file, not {expected}',
      maxSize: 'File is too large ({size}, max {max})', minSize: 'File is too small ({size}, min {min})',
      totalSize: 'Total size limit of {max} exceeded',
      maxFiles: { one: 'Only {count} file allowed', other: 'No more than {count} files allowed' },
      duplicate: 'This file was already added', empty: 'File is empty',
      minWidth: 'Image must be at least {min}px wide (is {value}px)', maxWidth: 'Image must be at most {max}px wide (is {value}px)',
      minHeight: 'Image must be at least {min}px tall (is {value}px)', maxHeight: 'Image must be at most {max}px tall (is {value}px)',
      image: 'Could not read the image', invalid: 'File is not valid', crop: 'Cropping was canceled',
      network: 'Network error', server: 'Server error ({status})', abort: 'Upload canceled', timeout: 'The request timed out',
      offline: 'You are offline. The upload resumes when the connection is back.', noTransport: 'No upload URL configured',
      pending: 'Please wait until all uploads have finished', failed: 'Some files failed to upload',
    },
    announce: {
      rejected: '{name} rejected: {reason}', success: '{name} uploaded', error: '{name} failed: {reason}', removed: '{name} removed',
      complete: { one: 'Upload complete: {count} file', other: 'Upload complete: {count} files' },
      progress: 'Uploading, {percent}% done', start: { one: 'Uploading {count} file', other: 'Uploading {count} files' },
      offline: 'Connection lost. Uploads paused.', online: 'Back online. Resuming uploads.', resumed: 'Resuming {name} from {percent}%',
    },
  },
});

const UP_KB = 1024;
/** parseSize('5mb' | '1.5 GB' | '500k' | 1024) -> bytes (0 when empty) */
function parseSize(v) {
  if (v == null || v === '' || v === false) return 0;
  if (isNum(v)) return v;
  const m = String(v).trim().match(/^([\d.]+)\s*([kmgt]?)(i?b)?$/i);
  if (!m) return +v || 0;
  return Math.round(parseFloat(m[1]) * UP_KB ** ' kmgt'.indexOf((m[2] || ' ').toLowerCase()));
}

const OX = 'application/vnd.openxmlformats-officedocument.';
const UP_MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
  heic: 'image/heic', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', tif: 'image/tiff', tiff: 'image/tiff',
  pdf: 'application/pdf', zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed', gz: 'application/gzip', tar: 'application/x-tar',
  doc: 'application/msword', docx: OX + 'wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: OX + 'spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: OX + 'presentationml.presentation', odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet', odp: 'application/vnd.oasis.opendocument.presentation', epub: 'application/epub+zip',
  csv: 'text/csv', txt: 'text/plain', md: 'text/markdown', json: 'application/json', xml: 'application/xml', html: 'text/html', rtf: 'application/rtf',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac',
};
const extOf = name => { const m = String(name || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/); return m ? m[1] : ''; };
const mimeOf = name => UP_MIME[extOf(name)] || '';
const typeOf = f => (f && f.type) || mimeOf(f && f.name) || '';

/* ── magic numbers ─────────────────────────────────────────────────── */
const KIND_LABEL = { png: 'PNG', jpeg: 'JPEG', gif: 'GIF', webp: 'WebP', pdf: 'PDF', zip: 'ZIP', mp4: 'MP4' };
const KIND_MIME = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf', zip: 'application/zip', mp4: 'video/mp4' };
const EXT_KIND = { png: 'png', jpg: 'jpeg', jpeg: 'jpeg', jfif: 'jpeg', gif: 'gif', webp: 'webp', pdf: 'pdf', mp4: 'mp4', m4v: 'mp4', m4a: 'mp4' };
'zip docx xlsx pptx odt ods odp epub jar apk'.split(' ').forEach(e => { EXT_KIND[e] = 'zip'; });
const MIME_KIND = { 'image/pjpeg': 'jpeg', 'application/x-zip-compressed': 'zip', 'video/x-m4v': 'mp4', 'audio/mp4': 'mp4' };
for (const [e, k] of Object.entries(EXT_KIND)) if (UP_MIME[e]) MIME_KIND[UP_MIME[e]] = k;
const bstr = (b, s, e) => String.fromCharCode(...b.subarray(s, e));
const SIGS = {
  png: b => b[0] === 0x89 && bstr(b, 1, 4) === 'PNG',
  jpeg: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif: b => bstr(b, 0, 4) === 'GIF8',
  webp: b => bstr(b, 0, 4) === 'RIFF' && bstr(b, 8, 12) === 'WEBP',
  pdf: b => bstr(b, 0, Math.min(b.length, 1024)).includes('%PDF-'),
  zip: b => b[0] === 0x50 && b[1] === 0x4b && [3, 5, 7].includes(b[2]) && b[3] === b[2] + 1,
  mp4: b => bstr(b, 4, 8) === 'ftyp',
};
/** The kind a file claims to be by MIME or extension ('png' | 'jpeg' | … | '') */
const claimedKind = f => MIME_KIND[f.type] || (!f.type || f.type === 'application/octet-stream' ? EXT_KIND[extOf(f.name)] : '') || '';
/** sniff(blob) -> Promise<'png'|'jpeg'|'gif'|'webp'|'pdf'|'zip'|'mp4'|null> (reads the first 1 KB) */
async function sniff(blob) {
  try {
    const b = new Uint8Array(await blob.slice(0, 1024).arrayBuffer());
    for (const k in SIGS) if (b.length >= 4 && SIGS[k](b)) return k;
  } catch {}
  return null;
}

/* ── accept matching ───────────────────────────────────────────────── */
const acceptList = a => (Array.isArray(a) ? a : String(a || '').split(',')).map(s => String(s).trim().toLowerCase()).filter(Boolean);
/** matchAccept('image/*,.pdf', file, detectedMime?) -> boolean */
function matchAccept(accept, file, detected) {
  const list = acceptList(accept);
  if (!list.length) return true;
  const name = String(file.name || '').toLowerCase();
  const types = [file.type, detected, mimeOf(name)].filter(Boolean).map(s => s.toLowerCase());
  return list.some(a => (a[0] === '.' ? name.endsWith(a) : a.endsWith('/*') ? types.some(ty => ty.startsWith(a.slice(0, -1))) : types.includes(a)));
}
/** Human list of an accept string: 'image/*,.pdf' -> 'Images, PDF' */
function describeAccept(accept, tr = t) {
  const out = [];
  for (const a of acceptList(accept)) {
    let s;
    if (a[0] === '.') s = a.slice(1).toUpperCase();
    else if (a.endsWith('/*')) s = tr('upload.kinds.' + a.slice(0, -2), { default: cap(a.slice(0, -2)) });
    else { const e = Object.keys(UP_MIME).find(k => UP_MIME[k] === a); s = e ? e.toUpperCase() : a.split('/').pop().toUpperCase(); }
    if (!out.includes(s)) out.push(s);
  }
  return fmt.list(out);
}

/* ── image headers: dimensions + EXIF orientation without decoding ─── */
function exifOrientation(dv, s) {
  const le = dv.getUint16(s) === 0x4949, ifd = s + dv.getUint32(s + 4, le), n = dv.getUint16(ifd, le);
  for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (dv.getUint16(e, le) === 0x0112) return dv.getUint16(e + 8, le); }
  return 1;
}
function parseImageHeader(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (SIGS.png(b)) return { width: dv.getUint32(16), height: dv.getUint32(20), orientation: 1 };
  if (SIGS.gif(b)) return { width: dv.getUint16(6, true), height: dv.getUint16(8, true), orientation: 1 };
  if (SIGS.webp(b)) {
    const c = bstr(b, 12, 16);
    if (c === 'VP8 ') return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff, orientation: 1 };
    if (c === 'VP8L') { const v = dv.getUint32(21, true); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1, orientation: 1 }; }
    if (c === 'VP8X') return { width: 1 + (b[24] | b[25] << 8 | b[26] << 16), height: 1 + (b[27] | b[28] << 8 | b[29] << 16), orientation: 1 };
  }
  if (SIGS.jpeg(b)) {
    let i = 2, o = 1;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m === 0xe1 && bstr(b, i + 4, i + 8) === 'Exif') o = exifOrientation(dv, i + 10);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        const hh = dv.getUint16(i + 5), w = dv.getUint16(i + 7);
        return o >= 5 ? { width: hh, height: w, orientation: o } : { width: w, height: hh, orientation: o };
      }
      i += 2 + dv.getUint16(i + 2);
    }
  }
  return null;
}
/** imageInfo(file) -> Promise<{ width, height, orientation } | null> (as displayed, EXIF applied) */
async function imageInfo(file) {
  try { const r = parseImageHeader(new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer())); if (r && r.width && r.height) return r; } catch {}
  if (!isBrowser) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight, orientation: 1 };
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}

/* ── validation ────────────────────────────────────────────────────── */
const vErr = (reason, message) => ({ reason, message });
/** Relative paths of files that came from folder drops / directory pickers (File objects are immutable). */
const __paths = new WeakMap();
const pathOf = f => (f && (__paths.get(f) || f.webkitRelativePath)) || '';
const fileKey = f => [pathOf(f) || f.name, f.size, f.lastModified || 0].join('|');

/** Checks that do not depend on processing: type, content sniffing, duplicates, file count. */
async function checkBefore(file, o, ctx) {
  const tr = o.t || t;
  const kind = o.sniff !== false ? claimedKind(file) : '';
  const detected = o.sniff !== false && (kind || !typeOf(file)) ? await sniff(file) : null;
  if (!matchAccept(o.accept, file, detected && KIND_MIME[detected])) {
    const types = describeAccept(o.accept, tr);
    return vErr('type', types ? tr('upload.errors.typeList', { types }) : tr('upload.errors.type'));
  }
  if (kind && file.size > 0 && detected !== kind) {
    return vErr('mismatch', detected ? tr('upload.errors.mismatchAs', { detected: KIND_LABEL[detected], expected: KIND_LABEL[kind] }) : tr('upload.errors.mismatch'));
  }
  if (!o.allowDuplicates && ctx.items.some(it => { const f = it.original || it.file; return f && fileKey(f) === fileKey(file); })) return vErr('duplicate', tr('upload.errors.duplicate'));
  if (o.maxFiles > 0 && ctx.count >= o.maxFiles) return vErr('maxFiles', tr('upload.errors.maxFiles', { count: o.maxFiles }));
  return null;
}
/** Checks on the final (processed) file: sizes, image dimensions, custom validator. */
async function checkAfter(file, o, ctx) {
  const tr = o.t || t;
  const size = file.size, sz = formatBytes;
  if (o.maxSize > 0 && size > o.maxSize) return vErr('maxSize', tr('upload.errors.maxSize', { size: sz(size), max: sz(o.maxSize) }));
  if (o.minSize > 0 && size < o.minSize) return vErr('minSize', tr('upload.errors.minSize', { size: sz(size), min: sz(o.minSize) }));
  if (o.totalMaxSize > 0 && ctx.bytes + size > o.totalMaxSize) return vErr('totalSize', tr('upload.errors.totalSize', { max: sz(o.totalMaxSize) }));
  if ((o.minWidth || o.maxWidth || o.minHeight || o.maxHeight) && /^image\//.test(typeOf(file))) {
    const info = await imageInfo(file);
    if (!info) return vErr('image', tr('upload.errors.image'));
    const dim = [['minWidth', info.width, (v, l) => v < l], ['maxWidth', info.width, (v, l) => v > l], ['minHeight', info.height, (v, l) => v < l], ['maxHeight', info.height, (v, l) => v > l]];
    for (const [k, v, bad] of dim) if (o[k] > 0 && bad(v, o[k])) return vErr('dimensions', tr('upload.errors.' + k, { min: o[k], max: o[k], value: v }));
  }
  if (isFn(o.validate)) {
    let r;
    try { r = await o.validate(file, { items: ctx.items }); } catch (e) { r = e; }
    if (r === false) return vErr('custom', tr('upload.errors.invalid'));
    if (r instanceof Error) return vErr('custom', r.message || tr('upload.errors.invalid'));
    if (isStr(r) && r) return vErr('custom', r);
    if (isObj(r) && r.message) return vErr(r.reason || 'custom', r.message);
  }
  return null;
}
/** Standalone validator: validateFile(file, rules) -> Promise<null | { reason, message }> */
async function validateFile(file, rules = {}) {
  const o = normRules(rules), ctx = { items: [], count: 0, bytes: 0 };
  return (await checkBefore(file, o, ctx)) || checkAfter(file, o, ctx);
}
function normRules(r) {
  return {
    ...r, maxSize: parseSize(r.maxSize), minSize: parseSize(r.minSize), totalMaxSize: parseSize(r.totalMaxSize),
    maxFiles: +r.maxFiles || 0, minWidth: +r.minWidth || 0, maxWidth: +r.maxWidth || 0, minHeight: +r.minHeight || 0, maxHeight: +r.maxHeight || 0,
  };
}
