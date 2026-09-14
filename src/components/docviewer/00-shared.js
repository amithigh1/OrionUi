/* Document viewer package — shared helpers: file-type detection, small XML helpers and Orion.preview(). */
i18n.add('en', {
  docviewer: {
    toolbar: 'Document toolbar', filename: 'File', zoomIn: 'Zoom in', zoomOut: 'Zoom out', zoomReset: 'Reset zoom',
    download: 'Download', print: 'Print', openNewTab: 'Open in new tab', fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen',
    loading: 'Loading document…', error: 'This file could not be previewed', empty: 'Nothing to preview',
    pdfFallback: 'Your browser cannot display PDFs inline.', close: 'Close preview',
  },
});
const DV_EXT = {
  pdf: 'pdf', docx: 'docx', doc: 'docx',
  csv: 'csv', tsv: 'csv',
  json: 'json', map: 'json',
  md: 'markdown', markdown: 'markdown',
  txt: 'text', log: 'text', ini: 'text', conf: 'text',
  js: 'code', mjs: 'code', cjs: 'code', ts: 'code', jsx: 'code', tsx: 'code', css: 'code', html: 'code', htm: 'code',
  xml: 'code', yml: 'code', yaml: 'code', py: 'code', java: 'code', c: 'code', cpp: 'code', h: 'code', sh: 'code',
  php: 'code', rb: 'code', go: 'code', rs: 'code', sql: 'code', svelte: 'code', vue: 'code',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image', avif: 'image', ico: 'image',
  mp4: 'video', webm: 'video', ogv: 'video', mov: 'video', m4v: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio', flac: 'audio', aac: 'audio', oga: 'audio',
};
const DV_ICON = { pdf: 'file-pdf', docx: 'file-text', csv: 'file-spreadsheet', json: 'file-code', markdown: 'file-text', text: 'file-text', code: 'file-code', image: 'file-image', video: 'file-video', audio: 'file-audio', unknown: 'file' };
function extOf(name) { const m = /\.([a-z0-9]+)$/i.exec(String(name || '').split(/[?#]/)[0]); return m ? m[1].toLowerCase() : ''; }
/** detectType(filename, mime) -> 'pdf'|'docx'|'csv'|'json'|'markdown'|'text'|'code'|'image'|'video'|'audio'|'unknown' */
function detectType(filename, mime) {
  const byExt = DV_EXT[extOf(filename)];
  if (byExt) return byExt;
  if (mime) {
    if (mime === 'application/pdf') return 'pdf';
    if (/wordprocessingml/.test(mime)) return 'docx';
    if (mime === 'application/json') return 'json';
    if (/^text\/csv/.test(mime)) return 'csv';
    if (/^text\/markdown/.test(mime)) return 'markdown';
    if (/^image\//.test(mime)) return 'image';
    if (/^video\//.test(mime)) return 'video';
    if (/^audio\//.test(mime)) return 'audio';
    if (/^text\//.test(mime) || /javascript|json/.test(mime)) return 'text';
  }
  return 'unknown';
}
function nameOf(src, filename) {
  if (filename) return filename;
  if (typeof File !== 'undefined' && src instanceof File) return src.name;
  if (isStr(src)) { try { return decodeURIComponent(src.split(/[?#]/)[0].split('/').pop() || ''); } catch { return src.split(/[?#]/)[0].split('/').pop() || ''; } }
  return '';
}
/** Resolve src (URL string | File | Blob) to a usable object URL (or the string as-is). Returns { url, revoke, mime }. */
async function resolveSrc(src) {
  if (isStr(src)) return { url: src, revoke: null, mime: '' };
  if (typeof Blob !== 'undefined' && src instanceof Blob) return { url: URL.createObjectURL(src), revoke: true, mime: src.type || '' };
  return { url: '', revoke: null, mime: '' };
}
/** Read src as text (URL fetched, File/Blob read directly). */
async function readText(src) {
  if (typeof Blob !== 'undefined' && src instanceof Blob) return src.text();
  const res = await fetch(src);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}
async function readBuffer(src) {
  if (typeof Blob !== 'undefined' && src instanceof Blob) return src.arrayBuffer();
  const res = await fetch(src);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.arrayBuffer();
}
const isSafeHref = v => { const s = String(v).replace(/[\x00-\x20]/g, ''); return !/^[a-z][a-z0-9+.-]*:/i.test(s) || /^(https?|mailto|tel):/i.test(s); };

/* ── Orion.preview(fileOrUrl, opts) -> handle { el, close(reason), result } ───────────── */
function __previewFallback(body, opts, title) {
  let resolveP; const result = new Promise(r => (resolveP = r));
  const closeBtn = h('button', { type: 'button', class: 'o-docviewer-fb-close', 'aria-label': t('docviewer.close') }, icon('x'));
  const head = title ? h('div', { class: 'o-docviewer-fb-head' }, h('strong', {}, title), closeBtn) : h('div', { class: 'o-docviewer-fb-head' }, h('span', {}), closeBtn);
  const panel = h('div', { class: 'o-docviewer-fb-panel', role: 'dialog', 'aria-modal': 'true', tabindex: '-1', 'aria-label': title || t('docviewer.toolbar') }, head, body);
  const root = h('div', { class: 'o-docviewer-fb' }, panel);
  portal(root, opts.trigger || doc.body);
  const ov = overlays.open({
    el: root, owner: opts.trigger, modal: true, trap: true, lockScroll: true,
    onClose: reason => { animate(root, 'fadeOut', { duration: 160 }).then(() => root.remove()); opts.onClose?.(reason); resolveP(reason); },
  });
  on(closeBtn, 'click', () => ov.close('close-button'));
  animate(root, 'fadeIn', { duration: 180 });
  animate(panel, 'zoomIn', { duration: 180 });
  focusFirst(panel);
  return { el: root, body, close: r => ov.close(r || 'api'), result };
}
/**
 * Orion.preview(fileOrUrl, opts) -> fullscreen dialog around <o-docviewer>.
 * opts: filename, type, title, size ('lg'), fullscreen ('sm'), trigger (origin element), onClose(reason)
 * Uses Orion.modal when it is loaded in the same bundle; otherwise a minimal dialog on the core overlay stack.
 */
function preview(fileOrUrl, opts = {}) {
  if (!isBrowser) return null;
  const filename = nameOf(fileOrUrl, opts.filename);
  const viewer = h('o-docviewer', { class: 'o-docviewer-modal-viewer', label: opts.title || filename || t('docviewer.toolbar') });
  if (opts.type) viewer.type = opts.type;
  viewer.filename = filename;
  viewer.src = fileOrUrl;
  const body = h('div', { class: 'o-docviewer-modal-body' }, viewer);
  if (isFn(O.modal)) {
    return O.modal({
      title: opts.title ?? filename, content: body, size: opts.size || 'lg', fullscreen: opts.fullscreen ?? 'sm',
      scrollable: false, className: 'o-docviewer-dialog', closable: opts.closable, onClose: opts.onClose,
    });
  }
  return __previewFallback(body, opts, opts.title ?? filename);
}
O.preview = preview;
