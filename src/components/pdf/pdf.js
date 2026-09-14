/* PDF — dependency-free PDF 1.4 generator (data package). Browsers, workers and Node 18+ (images need a DOM canvas
 * except JPEG, which is embedded as-is).
 *
 *   const pdf = new O.PDF({ size: 'A4' | 'Letter' | 'Legal' | 'A3' | 'A5' | [w, h], orientation: 'portrait' | 'landscape',
 *                           unit: 'pt' | 'mm' | 'in' | 'px', margin: 40 | [v, h] | [t, r, b, l] | { top, right, bottom, left },
 *                           font: 'Helvetica' | 'Times' | 'Courier', fontSize: 10, lineHeight: 1.2, color,
 *                           title, author, subject, keywords, creator, header(pdf, info), footer(pdf, info), compress: true });
 *   pdf.text(str, x, y, { size, font, bold, italic, color, align: 'left'|'center'|'right'|'justify', maxWidth, lineHeight,
 *                         baseline: 'top'|'middle'|'bottom'|'alphabetic', maxLines, underline, strike, link, angle, opacity })
 *   pdf.write(str, opts)          flowing text at the cursor (wraps, breaks pages, advances pdf.y)
 *   pdf.line(x1, y1, x2, y2, { color, width, dash }) · pdf.rect(x, y, w, h, { fill, stroke, radius, width, opacity })
 *   pdf.circle(cx, cy, r, opts) · pdf.ellipse(cx, cy, rx, ry, opts) · pdf.polygon([[x, y], ...], opts)
 *   pdf.image(jpegBytes | dataURL | url | Blob | canvas | img | ImageBitmap | ImageData, x, y, { width, height, fit })
 *   pdf.link(x, y, w, h, 'https://…' | { page: 2 }) · pdf.addPage(opts) · pdf.setPage(n) · pdf.moveDown(lines)
 *   pdf.table({ columns: [{ key, title, width, align, format(value, row), type }], rows, x, y, width, fontSize, padding,
 *               headerStyle: { fill, color, bold, fontSize }, zebra, borderColor, borders: 'horizontal'|'all'|'none',
 *               columnWidths, repeatHeader: true, align, cellStyle(value, row, column) }) -> { y, page }   (tableAsync: yields)
 *   pdf.widthOf(str, opts) · pdf.splitText(str, maxWidth, opts) · pdf.heightOf(str, opts)
 *   await pdf.toBlob() · await pdf.toBytes() · await pdf.toDataURL() · await pdf.save('report.pdf')
 * Coordinates start at the TOP-LEFT corner of the page, in `unit`. header/footer run at output time for every page with
 * info = { page, pages, width, height, margin }, so "Page 1 of N" is exact.
 *
 * Text uses the standard 14 fonts with WinAnsiEncoding (Latin-1 + Windows-1252 extras: € ‘ ’ “ ” • – — … ™ Š š Ž ž Œ œ Ÿ ƒ).
 * Accents outside that set are folded (ł -> l, ą -> a); other characters (CJK, Arabic, emoji…) become "?".
 * For full Unicode output use the browser's print-to-PDF path (Orion.printPreview).
 */

const UNITS = { pt: 1, mm: 72 / 25.4, cm: 72 / 2.54, in: 72, px: 0.75 };
const SIZES = { a3: [841.89, 1190.55], a4: [595.28, 841.89], a5: [419.53, 595.28], a6: [297.64, 419.53], letter: [612, 792], legal: [612, 1008], tabloid: [792, 1224], executive: [521.86, 756] };
const unpack = s => s.trim().split(/\s+/).flatMap(t => { const [v, n] = t.split('*'); return Array(+n || 1).fill(+v); });
/* AFM advance widths (1/1000 em) for WinAnsi codes 32..255 */
const W_HELV = unpack('278*2 355 556*2 889 667 191 333*2 389 584 278 333 278*2 556*10 278*2 584*3 556 1015 667*2 722*2 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667*2 611 278*3 469 556 333 ' +
  '556*2 500 556*2 278 556*2 222*2 500 222 833 556*4 333 500 278 556 500 722 500*3 334 260 334 584 350 556 350 222 556 333 1000 556*2 333 1000 667 333 1000 350 611 350 350 222*2 333*2 350 556 1000 333 1000 500 333 944 350 500 667 ' +
  '278 333 556*4 260 556 333 737 370 556 584 333 737 333 400 584 333*3 556 537 278 333*2 365 556 834*3 611 667*6 1000 722 667*4 278*4 722*2 778*5 584 778 722*4 667*2 611 556*6 889 500 556*4 278*4 556*7 584 611 556*4 500 556 500');
const W_HELVB = unpack('278 333 474 556*2 889 722 238 333*2 389 584 278 333 278*2 556*10 333*2 584*3 611 975 722*4 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667*2 611 333 278 333 584 556 333 ' +
  '556 611 556 611 556 333 611*2 278*2 556 278 889 611*4 389 556 333 611 556 778 556*2 500 389 280 389 584 350 556 350 278 556 500 1000 556*2 333 1000 667 333 1000 350 611 350 350 278*2 500*2 350 556 1000 333 1000 556 333 944 350 500 667 ' +
  '278 333 556*4 280 556 333 737 370 556 584 333 737 333 400 584 333*3 611 556 278 333*2 365 556 834*3 611 722*6 1000 722 667*4 278*4 722*2 778*5 584 778 722*4 667*2 611 556*6 889 556*5 278*4 611*7 584 611*5 556 611 556');
const W_TIMES = unpack('250 333 408 500*2 833 778 180 333*2 500 564 250 333 250 278 500*10 278*2 564*3 444 921 722 667*2 722 611 556 722*2 333 389 722 611 889 722*2 556 722 667 556 611 722*2 944 722*2 611 333 278 333 469 500 333 ' +
  '444 500 444 500 444 333 500*2 278*2 500 278 778 500*4 333 389 278 500*2 722 500*2 444 480 200 480 541 350 500 350 333 500 444 1000 500*2 333 1000 556 333 889 350 611 350 350 333*2 444*2 350 500 1000 333 980 389 333 722 350 444 722 ' +
  '250 333 500*4 200 500 333 760 276 500 564 333 760 333 400 564 300*2 333 500 453 250 333 300 310 500 750*3 444 722*6 889 667 611*4 333*4 722*7 564 722*6 556 500 444*6 667 444*5 278*4 500*7 564 500*8');
const W_TIMESB = unpack('250 333 555 500*2 1000 833 278 333*2 500 570 250 333 250 278 500*10 333*2 570*3 500 930 722 667 722*2 667 611 778*2 389 500 778 667 944 722 778 611 778 722 556 667 722*2 1000 722*2 667 333 278 333 581 500 333 ' +
  '500 556 444 556 444 333 500 556 278 333 556 278 833 556 500 556*2 444 389 333 556 500 722 500*2 444 394 220 394 520 350 500 350 333 500*2 1000 500*2 333 1000 556 333 1000 350 667 350 350 333*2 500*2 350 500 1000 333 1000 389 333 722 350 444 722 ' +
  '250 333 500*4 220 500 333 747 300 500 570 333 747 333 400 570 300*2 333 556 540 250 333 300 330 500 750*3 500 722*6 1000 722 667*4 389*4 722*2 778*5 570 778 722*5 611 556 500*6 722 444*5 278*4 500 556 500*5 570 500 556*4 500 556 500');
const FAMILIES = {
  helvetica: { names: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'], widths: [W_HELV, W_HELVB], asc: 0.718, desc: -0.207 },
  times: { names: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'], widths: [W_TIMES, W_TIMESB], asc: 0.683, desc: -0.217 },
  courier: { names: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'], widths: [600, 600], asc: 0.629, desc: -0.157 },
};
const FAMILY_ALIAS = { helvetica: 'helvetica', arial: 'helvetica', 'sans-serif': 'helvetica', sans: 'helvetica', times: 'times', 'times-roman': 'times', 'times new roman': 'times', serif: 'times', courier: 'courier', 'courier new': 'courier', monospace: 'courier', mono: 'courier' };

/* ── WinAnsi text encoding ────────────────────────────────────────────── */
const WIN = new Map([[0x20ac, 128], [0x201a, 130], [0x192, 131], [0x201e, 132], [0x2026, 133], [0x2020, 134], [0x2021, 135], [0x2c6, 136], [0x2030, 137], [0x160, 138], [0x2039, 139], [0x152, 140], [0x17d, 142],
  [0x2018, 145], [0x2019, 146], [0x201c, 147], [0x201d, 148], [0x2022, 149], [0x2013, 150], [0x2014, 151], [0x2dc, 152], [0x2122, 153], [0x161, 154], [0x203a, 155], [0x153, 156], [0x17e, 158], [0x178, 159]]);
const SUBST = new Map([[0x2212, '-'], [0x2010, '-'], [0x2011, '-'], [0x2012, '-'], [0x2015, '-'], [0x2002, ' '], [0x2003, ' '], [0x2007, ' '], [0x2008, ' '], [0x2009, ' '], [0x200a, ' '], [0x202f, ' '], [0x205f, ' '], [0x3000, ' '],
  [0x200b, ''], [0x200c, ''], [0x200d, ''], [0xfeff, ''], [0x200e, ''], [0x200f, ''], [0x2032, "'"], [0x2033, '"'], [0x2044, '/'], [0x2190, '<-'], [0x2192, '->'], [0x2194, '<->'], [0x21d2, '=>'], [0x2264, '<='], [0x2265, '>='],
  [0x2260, '!='], [0x2248, '~'], [0x2713, 'v'], [0x2714, 'v'], [0x2715, 'x'], [0x2717, 'x'], [0x2605, '*'], [0x2606, '*'], [0x25cf, '\x95'], [0x25e6, 'o'], [0x2043, '-'], [0x2219, '\xb7'],
  [0x20b9, 'Rs'], [0x20a9, 'W'], [0x20bd, 'RUB'], [0x20ba, 'TL'], [0x20b1, 'PHP'], [0x20a6, 'NGN'], [0x20b4, 'UAH'], [0x20ab, 'VND'], [0x20aa, 'ILS'], [0x20bf, 'BTC'], [0x2116, 'No.'],
  [0x141, 'L'], [0x142, 'l'], [0x110, 'D'], [0x111, 'd'], [0x131, 'i'], [0x126, 'H'], [0x127, 'h'], [0x166, 'T'], [0x167, 't'], [0x138, 'k'], [0x149, "'n"], [0x14a, 'N'], [0x14b, 'n'], [0x132, 'IJ'], [0x133, 'ij'], [0x13f, 'L'], [0x140, 'l']]);
const PRINTABLE = /^[\x20-\x7e]*$/;
/** Encode text to WinAnsi bytes (as a binary string). Unknown characters become '?'. */
function winAnsi(str) {
  str = String(str ?? '');
  if (PRINTABLE.test(str)) return str;
  let out = '';
  for (const ch of str.normalize('NFC')) {
    const cp = ch.codePointAt(0);
    if ((cp >= 32 && cp < 127) || (cp >= 160 && cp <= 255)) out += ch;
    else if (WIN.has(cp)) out += String.fromCharCode(WIN.get(cp));
    else if (cp === 9) out += '    ';
    else if (cp === 10 || cp === 13) out += ' ';
    else if (SUBST.has(cp)) out += SUBST.get(cp);
    else {
      const base = ch.normalize('NFD').replace(/[\u{300}-\u{36F}]/gu, '');
      out += base && base !== ch && [...base].every(c => { const b = c.codePointAt(0); return (b >= 32 && b < 127) || (b >= 160 && b <= 255) || WIN.has(b); })
        ? [...base].map(c => (WIN.has(c.codePointAt(0)) ? String.fromCharCode(WIN.get(c.codePointAt(0))) : c)).join('') : '?';
    }
  }
  return out;
}
const pdfStr = s => '(' + s.replace(/[\\()]/g, '\\$&').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + ')';
const n2 = v => { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? '0' : String(r); };
const n4 = v => { const r = Math.round(v * 10000) / 10000; return Object.is(r, -0) ? '0' : String(r); };
/** Text string for the document info dictionary (UTF-16BE when needed — full Unicode is fine there). */
function infoStr(s) {
  s = String(s ?? '');
  if (/^[\x20-\x7e]*$/.test(s)) return pdfStr(s);
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}
function rgb(c, fallback = [0, 0, 0]) {
  if (c == null || c === false) return null;
  if (Array.isArray(c)) return c.map(v => (v > 1 ? v / 255 : v));
  if (typeof c === 'number') return [c, c, c];
  const p = O.color ? O.color.parse(c) : null;
  return p ? [p.r / 255, p.g / 255, p.b / 255] : fallback;
}
const rgbOp = (c, op) => `${n4(c[0])} ${n4(c[1])} ${n4(c[2])} ${op}`;
const latin1 = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
const yieldUI = () => new Promise(r => (globalThis.scheduler?.yield ? globalThis.scheduler.yield().then(r) : setTimeout(r, 0)));
async function flate(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()); } catch { return null; }
}
function pdfDate(d = new Date()) {
  const p = v => String(v).padStart(2, '0'), off = -d.getTimezoneOffset(), a = Math.abs(off);
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${off === 0 ? 'Z' : (off > 0 ? '+' : '-') + p(Math.floor(a / 60)) + "'" + p(a % 60) + "'"}`;
}

/* ── images ───────────────────────────────────────────────────────────── */
function jpegInfo(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2, adobe = false;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m === 0xee && b[i + 4] === 0x41 && b[i + 5] === 0x64) adobe = true;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], comps: b[i + 9], adobe };
    i += 2 + len;
  }
  return null;
}
function b64bytes(s) { const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; }
function pixelsOf(src) {
  let w, h, data;
  if (typeof ImageData !== 'undefined' && src instanceof ImageData) ({ width: w, height: h, data } = src);
  else {
    w = src.naturalWidth || src.videoWidth || src.width; h = src.naturalHeight || src.videoHeight || src.height;
    let cv = src;
    if (!isFn(src.getContext)) {
      cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(doc.createElement('canvas'), { width: w, height: h });
      cv.getContext('2d').drawImage(src, 0, 0, w, h);
    }
    data = cv.getContext('2d').getImageData(0, 0, w, h).data;
  }
  const n = w * h, rgbB = new Uint8Array(n * 3), alpha = new Uint8Array(n);
  let hasAlpha = false;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    rgbB[i * 3] = data[j]; rgbB[i * 3 + 1] = data[j + 1]; rgbB[i * 3 + 2] = data[j + 2];
    alpha[i] = data[j + 3]; if (data[j + 3] !== 255) hasAlpha = true;
  }
  return { w, h, kind: 'rgb', data: rgbB, alpha: hasAlpha ? alpha : null };
}
async function loadImage(src) {
  if (src instanceof Uint8Array || src instanceof ArrayBuffer) return src;
  let blob = src;
  if (isStr(src)) {
    const m = /^data:image\/jpe?g;base64,/i.exec(src);
    if (m) return b64bytes(src.slice(m[0].length));
    blob = await (await fetch(src)).blob();
  }
  if (typeof Blob !== 'undefined' && blob instanceof Blob) {
    const head = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
    if (head[0] === 0xff && head[1] === 0xd8) return new Uint8Array(await blob.arrayBuffer());
    if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
    const url = URL.createObjectURL(blob);
    try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { URL.revokeObjectURL(url); }
  }
  if (src && isFn(src.decode) && !src.complete) await src.decode();
  return src;
}

/* ── the generator ───────────────────────────────────────────────────── */
class PDF {
  constructor(opts = {}) {
    this.o = { size: 'A4', orientation: 'portrait', unit: 'pt', margin: null, font: 'Helvetica', fontSize: 10, lineHeight: 1.2, color: '#111827', compress: true, ...opts };
    this.k = UNITS[this.o.unit] || 1;
    this.meta = { title: opts.title, author: opts.author, subject: opts.subject, keywords: opts.keywords, creator: opts.creator };
    this.header = opts.header || null;
    this.footer = opts.footer || null;
    this.pages = []; this._fonts = new Map(); this._gs = new Map(); this._images = []; this._imgKeys = new Map();
    this.state = { family: this._family(this.o.font), bold: false, italic: false, size: this.o.fontSize, color: rgb(this.o.color), draw: [0, 0, 0], fill: [0.9, 0.9, 0.9], lineWidth: 1 / this.k };
    this._pi = -1; this._hf = false;
    this.addPage();
  }
  /* ── pages & geometry (user units) ── */
  _family(name) { return FAMILY_ALIAS[String(name || 'helvetica').toLowerCase()] || 'helvetica'; }
  _margin(m, w) {
    const d = m == null ? Math.min(40, w * 0.07) / this.k : m;
    if (isNum(d)) return { top: d, right: d, bottom: d, left: d };
    if (Array.isArray(d)) return d.length === 2 ? { top: d[0], right: d[1], bottom: d[0], left: d[1] } : { top: d[0], right: d[1] ?? d[0], bottom: d[2] ?? d[0], left: d[3] ?? d[1] ?? d[0] };
    return { top: 0, right: 0, bottom: 0, left: 0, ...d };
  }
  /** addPage({ size, orientation, margin }) — also moves the cursor to the top-left margin */
  addPage(opts = {}) {
    const o = { ...this.o, ...opts };
    let [w, h] = Array.isArray(o.size) ? o.size.map(v => v * this.k) : SIZES[String(o.size).toLowerCase()] || SIZES.a4;
    if ((o.orientation === 'landscape') !== (w > h)) [w, h] = [h, w];
    const page = { w, h, ops: [], hf: [], annots: [], hfAnnots: [], deferred: [], margin: this._margin(opts.margin ?? this.o.margin, w) };
    this.pages.push(page);
    this._pi = this.pages.length - 1;
    this.x = page.margin.left; this.y = page.margin.top;
    return this;
  }
  setPage(n) { this._pi = clamp((n | 0) - 1, 0, this.pages.length - 1); const p = this._page; this.x = p.margin.left; this.y = p.margin.top; return this; }
  get _page() { return this.pages[this._pi]; }
  get page() { return this._pi + 1; }
  get pageCount() { return this.pages.length; }
  get width() { return this._page.w / this.k; }
  get height() { return this._page.h / this.k; }
  get margin() { return { ...this._page.margin }; }
  get contentWidth() { const p = this._page; return p.w / this.k - p.margin.left - p.margin.right; }
  get contentHeight() { const p = this._page; return p.h / this.k - p.margin.top - p.margin.bottom; }
  get bottom() { return this.height - this._page.margin.bottom; }
  moveDown(lines = 1) { this.y += lines * this.state.size * this.o.lineHeight / this.k; return this; }
  /** Break to a new page (or the next existing one) when h user units do not fit below the cursor. */
  ensureSpace(h) { if (this.y + h > this.bottom + 1e-6) this._nextPage(); return this; }
  _nextPage() { if (this._pi < this.pages.length - 1) this.setPage(this._pi + 2); else this.addPage(); }
  _op(s) { (this._hf ? this._page.hf : this._page.ops).push(s); }
  /* ── state setters (chainable) ── */
  setFont(name, style = '') { this.state.family = this._family(name); this.state.bold = /bold/i.test(style); this.state.italic = /italic|oblique/i.test(style); return this; }
  setFontSize(size) { this.state.size = +size || this.state.size; return this; }
  setTextColor(c) { this.state.color = rgb(c) || this.state.color; return this; }
  setDrawColor(c) { this.state.draw = rgb(c) || this.state.draw; return this; }
  setFillColor(c) { this.state.fill = rgb(c) || this.state.fill; return this; }
  setLineWidth(w) { this.state.lineWidth = +w; return this; }
  setProperties(meta) { Object.assign(this.meta, meta); return this; }
  /* ── fonts & measuring ── */
  _fontKey(o = {}) {
    const fam = FAMILIES[o.font ? this._family(o.font) : this.state.family];
    const bold = o.bold ?? this.state.bold, italic = o.italic ?? this.state.italic;
    const name = fam.names[(bold ? 1 : 0) + (italic ? 2 : 0)];
    let f = this._fonts.get(name);
    if (!f) { f = { name, res: 'F' + (this._fonts.size + 1), w: fam.widths[bold ? 1 : 0], asc: fam.asc, desc: fam.desc }; this._fonts.set(name, f); }
    return f;
  }
  _w(enc, f, size) {
    const w = f.w;
    if (typeof w === 'number') return enc.length * w * size / 1000;
    let s = 0;
    for (let i = 0; i < enc.length; i++) { const c = enc.charCodeAt(i); if (c >= 32 && c <= 255) s += w[c - 32]; }
    return s * size / 1000;
  }
  /** Width of a single line of text in user units. */
  widthOf(str, o = {}) { const f = this._fontKey(o); return this._w(winAnsi(str), f, o.size || this.state.size) / this.k; }
  _wrap(str, f, size, maxW, maxLines) {
    const out = [], sw = this._w(' ', f, size);
    const paras = String(str ?? '').replace(/\r\n?/g, '\n').split('\n');
    const breakWord = (word, push) => {
      while (word.length > 1 && this._w(word, f, size) > maxW) {
        let lo = 1, acc = 0;
        for (let i = 0; i < word.length; i++) { const cw = this._w(word[i], f, size); if (acc + cw > maxW && i > 0) break; acc += cw; lo = i + 1; }
        push(word.slice(0, lo)); word = word.slice(lo);
      }
      return word;
    };
    for (const p of paras) {
      const enc = winAnsi(p);
      if (maxW == null) { out.push({ s: enc, w: this._w(enc, f, size), last: true }); continue; }
      const full = this._w(enc, f, size);
      if (full <= maxW) { out.push({ s: enc, w: full, last: true }); continue; }
      let line = '', lw = 0;
      for (let word of enc.split(' ')) {
        let ww = this._w(word, f, size);
        if (line && lw + sw + ww <= maxW + 1e-6) { line += ' ' + word; lw += sw + ww; continue; }
        if (line) out.push({ s: line, w: lw });
        if (ww > maxW) { word = breakWord(word, s => out.push({ s, w: this._w(s, f, size) })); ww = this._w(word, f, size); }
        line = word; lw = ww;
      }
      out.push({ s: line, w: lw, last: true });
    }
    if (maxLines && out.length > maxLines) {
      out.length = maxLines;
      const l = out[maxLines - 1], ell = '\x85';
      let s = l.s;
      while (s && this._w(s + ell, f, size) > (maxW ?? Infinity)) s = s.slice(0, -1);
      l.s = s.replace(/\s+$/, '') + ell; l.w = this._w(l.s, f, size); l.last = true;
    }
    return out;
  }
  /** Split text into lines that fit maxWidth (user units). */
  splitText(str, maxWidth, o = {}) { const f = this._fontKey(o); return this._wrap(str, f, o.size || this.state.size, maxWidth == null ? null : maxWidth * this.k).map(l => l.s); }
  /** Height of (wrapped) text in user units. */
  heightOf(str, o = {}) { const size = o.size || this.state.size; return this._wrap(str, this._fontKey(o), size, o.maxWidth == null ? null : o.maxWidth * this.k, o.maxLines).length * size * (o.lineHeight || this.o.lineHeight) / this.k; }
  _gsRes(alpha) {
    const a = clamp(+alpha, 0, 1), key = n2(a);
    if (!this._gs.has(key)) this._gs.set(key, { res: 'GS' + (this._gs.size + 1), a });
    return this._gs.get(key).res;
  }
  /* ── text ── */
  text(str, x, y, opts = {}) {
    if (isObj(x)) { opts = x; x = undefined; y = undefined; }
    const k = this.k, o = opts, size = o.size || this.state.size, f = this._fontKey(o), lh = size * (o.lineHeight || this.o.lineHeight);
    const maxW = o.maxWidth != null ? o.maxWidth * k : null;
    const lines = this._wrap(str, f, size, maxW, o.maxLines), blockH = lines.length * lh;
    let top = (y ?? this.y) * k;
    const base = o.baseline || 'top';
    if (base === 'alphabetic') top -= (lh - (f.asc - f.desc) * size) / 2 + f.asc * size;
    else if (base === 'middle') top -= blockH / 2;
    else if (base === 'bottom') top -= blockH;
    const maxLine = this._drawLines(lines, (x ?? this.x) * k, top, f, size, lh, maxW, o);
    this.lastText = { width: maxLine / k, height: blockH / k, lines: lines.length };
    return this;
  }
  _drawLines(lines, X, top, f, size, lh, maxW, o) {
    const p = this._page, color = o.color != null ? rgb(o.color) : this.state.color, align = o.align || 'left';
    const rot = o.angle ? (o.angle * Math.PI) / 180 : 0, cos = Math.cos(rot), sin = Math.sin(rot), deco = [];
    let ops = o.opacity != null && o.opacity < 1 ? `q /${this._gsRes(o.opacity)} gs\n` : '';
    ops += `BT /${f.res} ${n2(size)} Tf ${rgbOp(color, 'rg')}\n`;
    let maxLine = 0;
    lines.forEach((l, i) => {
      let lx = X;
      if (align === 'right') lx = maxW != null ? X + maxW - l.w : X - l.w;
      else if (align === 'center') lx = maxW != null ? X + (maxW - l.w) / 2 : X - l.w / 2;
      const bl = top + i * lh + (lh - (f.asc - f.desc) * size) / 2 + f.asc * size;
      const PX = lx, PY = p.h - bl;
      const spaces = align === 'justify' && !l.last && maxW != null ? (l.s.match(/ /g) || []).length : 0;
      const tw = spaces ? (maxW - l.w) / spaces : 0;
      if (tw) ops += `${n4(tw)} Tw\n`;
      ops += rot ? `${n4(cos)} ${n4(sin)} ${n4(-sin)} ${n4(cos)} ${n2(PX)} ${n2(PY)} Tm ${pdfStr(l.s)} Tj\n` : `1 0 0 1 ${n2(PX)} ${n2(PY)} Tm ${pdfStr(l.s)} Tj\n`;
      if (tw) ops += '0 Tw\n';
      const lw = tw ? maxW : l.w;
      if (lw > maxLine) maxLine = lw;
      if ((o.underline || o.strike) && !rot) {
        if (o.underline) deco.push([PX, PY - size * 0.11, lw]);
        if (o.strike) deco.push([PX, PY + size * 0.26, lw]);
      }
      if (o.link && !rot) this._annot([PX, PY + f.desc * size, PX + lw, PY + f.asc * size], o.link);
    });
    ops += 'ET';
    if (deco.length) ops += `\nq ${rgbOp(color, 'RG')} ${n2(size * 0.055)} w ` + deco.map(([dx, dy, dw]) => `${n2(dx)} ${n2(dy)} m ${n2(dx + dw)} ${n2(dy)} l`).join(' ') + ' S Q';
    if (o.opacity != null && o.opacity < 1) ops += '\nQ';
    this._op(ops);
    return maxLine;
  }
  /** Flowing text: wraps to the content width, breaks pages and moves the cursor below the text. */
  write(str, opts = {}) {
    const k = this.k, size = opts.size || this.state.size, lh = size * (opts.lineHeight || this.o.lineHeight), f = this._fontKey(opts);
    const x = opts.x ?? this._page.margin.left + (opts.indent || 0);
    const width = opts.width ?? this.contentWidth - (x - this._page.margin.left);
    const lines = this._wrap(str, f, size, width * k);
    if (opts.gapBefore) this.y += opts.gapBefore;
    for (let i = 0; i < lines.length;) {
      if (this.y * k + lh > this.bottom * k + 1e-6) this._nextPage();
      const fit = Math.max(1, Math.floor((this.bottom * k - this.y * k + 1e-6) / lh)), chunk = lines.slice(i, i + fit);
      this._drawLines(chunk, x * k, this.y * k, f, size, lh, width * k, opts);
      this.y += chunk.length * lh / k;
      i += chunk.length;
    }
    this.y += opts.gap ?? lh * 0.35 / k;
    this.x = this._page.margin.left;
    return this;
  }
  /* ── vector graphics ── */
  _paint(o, closePath = true) {
    const fill = o.fill === true ? this.state.fill : o.fill != null ? rgb(o.fill) : null;
    const stroke = o.stroke === true || (o.stroke == null && o.color == null && !fill) ? this.state.draw : o.stroke != null ? rgb(o.stroke) : o.color != null ? rgb(o.color) : null;
    let pre = '';
    if (fill) pre += rgbOp(fill, 'rg') + ' ';
    if (stroke) pre += rgbOp(stroke, 'RG') + ` ${n2((o.width ?? o.lineWidth ?? this.state.lineWidth) * this.k)} w `;
    if (stroke && o.dash) pre += `[${toArr(o.dash).map(d => n2(d * this.k)).join(' ')}] 0 d `;
    const op = fill && stroke ? (closePath ? 'B' : 'B') : fill ? 'f' : stroke ? (closePath ? 's' : 'S') : 'n';
    return { pre, op };
  }
  _shape(path, o, closePath = true) {
    const { pre, op } = this._paint(o, closePath);
    const gs = o.opacity != null && o.opacity < 1 ? `/${this._gsRes(o.opacity)} gs ` : '';
    this._op(`q ${gs}${pre}${o.cap ? { butt: 0, round: 1, square: 2 }[o.cap] + ' J ' : ''}${path} ${op} Q`);
    return this;
  }
  line(x1, y1, x2, y2, o = {}) {
    const k = this.k, h = this._page.h;
    return this._shape(`${n2(x1 * k)} ${n2(h - y1 * k)} m ${n2(x2 * k)} ${n2(h - y2 * k)} l`, { stroke: o.color ?? true, ...o, fill: null }, false);
  }
  rect(x, y, w, h, o = {}) {
    const k = this.k, H = this._page.h, X = x * k, Y = H - (y + h) * k, W = w * k, Hh = h * k;
    const r = Math.min((o.radius || 0) * k, W / 2, Hh / 2);
    if (!r) return this._shape(`${n2(X)} ${n2(Y)} ${n2(W)} ${n2(Hh)} re`, o);
    const c = r * 0.5523;
    const path = `${n2(X + r)} ${n2(Y)} m ${n2(X + W - r)} ${n2(Y)} l ${n2(X + W - r + c)} ${n2(Y)} ${n2(X + W)} ${n2(Y + r - c)} ${n2(X + W)} ${n2(Y + r)} c ` +
      `${n2(X + W)} ${n2(Y + Hh - r)} l ${n2(X + W)} ${n2(Y + Hh - r + c)} ${n2(X + W - r + c)} ${n2(Y + Hh)} ${n2(X + W - r)} ${n2(Y + Hh)} c ` +
      `${n2(X + r)} ${n2(Y + Hh)} l ${n2(X + r - c)} ${n2(Y + Hh)} ${n2(X)} ${n2(Y + Hh - r + c)} ${n2(X)} ${n2(Y + Hh - r)} c ` +
      `${n2(X)} ${n2(Y + r)} l ${n2(X)} ${n2(Y + r - c)} ${n2(X + r - c)} ${n2(Y)} ${n2(X + r)} ${n2(Y)} c h`;
    return this._shape(path, o);
  }
  ellipse(cx, cy, rx, ry, o = {}) {
    const k = this.k, H = this._page.h, X = cx * k, Y = H - cy * k, a = rx * k, b = ry * k, ca = a * 0.5523, cb = b * 0.5523;
    const path = `${n2(X + a)} ${n2(Y)} m ${n2(X + a)} ${n2(Y + cb)} ${n2(X + ca)} ${n2(Y + b)} ${n2(X)} ${n2(Y + b)} c ${n2(X - ca)} ${n2(Y + b)} ${n2(X - a)} ${n2(Y + cb)} ${n2(X - a)} ${n2(Y)} c ` +
      `${n2(X - a)} ${n2(Y - cb)} ${n2(X - ca)} ${n2(Y - b)} ${n2(X)} ${n2(Y - b)} c ${n2(X + ca)} ${n2(Y - b)} ${n2(X + a)} ${n2(Y - cb)} ${n2(X + a)} ${n2(Y)} c h`;
    return this._shape(path, o);
  }
  circle(cx, cy, r, o = {}) { return this.ellipse(cx, cy, r, r, o); }
  polygon(points, o = {}) {
    const k = this.k, H = this._page.h;
    const path = points.map(([x, y], i) => `${n2(x * k)} ${n2(H - y * k)} ${i ? 'l' : 'm'}`).join(' ') + (o.close === false ? '' : ' h');
    return this._shape(path, o, o.close !== false);
  }
  /* ── links ── */
  _annot(rect, target) { (this._hf ? this._page.hfAnnots : this._page.annots).push({ rect, target }); }
  link(x, y, w, h, target) { const k = this.k, H = this._page.h; this._annot([x * k, H - (y + h) * k, (x + w) * k, H - y * k], target); return this; }
  /* ── images ── */
  _imageRes(src) {
    if (src && this._imgKeys.has(src)) return this._imgKeys.get(src);
    const res = { res: 'Im' + (this._images.length + 1), w: 0, h: 0, kind: null, data: null, alpha: null, pending: null };
    const fromBytes = b => {
      const j = jpegInfo(b);
      if (j) Object.assign(res, { kind: 'jpeg', data: b, w: j.w, h: j.h, comps: j.comps, adobe: j.adobe });
      else res.pending = src;
    };
    if (src instanceof ArrayBuffer) fromBytes(new Uint8Array(src));
    else if (src instanceof Uint8Array) fromBytes(src);
    else if (isStr(src)) { const m = /^data:image\/jpe?g;base64,/i.exec(src); if (m) fromBytes(b64bytes(src.slice(m[0].length))); else res.pending = src; }
    else if (typeof Blob !== 'undefined' && src instanceof Blob) res.pending = src;
    else if (src && (isFn(src.getContext) || (typeof ImageData !== 'undefined' && src instanceof ImageData) || (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap) || (src.complete && src.naturalWidth))) Object.assign(res, pixelsOf(src));
    else if (src) res.pending = src;
    else throw new Error('pdf.image: no source');
    this._images.push(res);
    if (src && (isStr(src) || typeof src === 'object')) this._imgKeys.set(src, res);
    return res;
  }
  _imgOp(res, x, y, o) {
    const k = this.k, H = this._page.h;
    let w = o.width, h = o.height;
    const iw = res.w, ih = res.h;
    if (w == null && h == null) { w = iw * 0.75 / k; h = ih * 0.75 / k; }
    else if (w == null) w = h * iw / ih;
    else if (h == null) h = w * ih / iw;
    else if (o.fit === 'contain' || o.fit === 'cover') {
      const s = o.fit === 'contain' ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih), dw = iw * s, dh = ih * s;
      x += (w - dw) / 2; y += (h - dh) / 2; w = dw; h = dh;
    }
    const clip = o.fit === 'cover' ? `${n2(o._x * k)} ${n2(H - (o._y + o.height) * k)} ${n2(o.width * k)} ${n2(o.height * k)} re W n ` : '';
    const gs = o.opacity != null && o.opacity < 1 ? `/${this._gsRes(o.opacity)} gs ` : '';
    return { op: `q ${gs}${clip}${n4(w * k)} 0 0 ${n4(h * k)} ${n2(x * k)} ${n2(H - (y + h) * k)} cm /${res.res} Do Q`, w, h };
  }
  /** Draw an image. Sources that must be fetched/decoded (URLs, PNG, Blob) are loaded during toBlob(). */
  image(src, x, y, o = {}) {
    const res = this._imageRes(src);
    x = x ?? this.x; y = y ?? this.y;
    const opts = { ...o, _x: x, _y: y };
    if (res.w) { const r = this._imgOp(res, x, y, opts); this._op(r.op); this.lastImage = { width: r.w, height: r.h }; }
    else { const list = this._hf ? this._page.hf : this._page.ops; list.push(''); this._page.deferred.push({ list: this._hf ? 'hf' : 'ops', i: list.length - 1, res, x, y, o: opts, page: this._page }); }
    return this;
  }
  async _loadImages() {
    for (const res of this._images) {
      if (!res.pending) continue;
      const src = await loadImage(res.pending);
      res.pending = null;
      if (src instanceof Uint8Array || src instanceof ArrayBuffer) {
        const b = src instanceof Uint8Array ? src : new Uint8Array(src), j = jpegInfo(b);
        if (!j) throw new Error('pdf.image: unsupported image data');
        Object.assign(res, { kind: 'jpeg', data: b, w: j.w, h: j.h, comps: j.comps, adobe: j.adobe });
      } else Object.assign(res, pixelsOf(src));
    }
    for (const pg of this.pages) {
      for (const d of pg.deferred) {
        const prev = this._pi; this._pi = this.pages.indexOf(pg);
        pg[d.list][d.i] = this._imgOp(d.res, d.x, d.y, d.o).op;
        this._pi = prev;
      }
      pg.deferred = [];
    }
  }
  /* ── tables ── */
  _cellText(v, c, row) {
    if (isFn(c.format)) v = c.format(v, row);
    else if (v != null && v !== '' && c.type) {
      const ty = c.type;
      if (ty === 'number') v = fmt.number(v, c.decimals ?? { maximumFractionDigits: 2 });
      else if (ty === 'integer') v = fmt.number(v, 0);
      else if (ty === 'currency') v = fmt.currency(v, c.currency);
      else if (ty === 'percent') v = fmt.percent(v, c.decimals ?? 0);
      else if (ty === 'date') v = fmt.date(v, c.dateStyle || 'medium');
      else if (ty === 'datetime') v = fmt.datetime(v);
      else if (ty === 'boolean') v = v ? t('common.yes') : t('common.no');
    } else if (v instanceof Date) v = v.getHours() || v.getMinutes() ? fmt.datetime(v) : fmt.date(v);
    else if (typeof v === 'boolean') v = v ? t('common.yes') : t('common.no');
    else if (Array.isArray(v)) v = v.join(', ');
    else if (isObj(v)) v = JSON.stringify(v);
    return v == null ? '' : String(v);
  }
  *_tableGen(opts = {}) {
    const k = this.k;
    const o = { fontSize: 9, padding: 4, lineHeight: 1.25, repeatHeader: true, zebra: true, borders: 'horizontal', header: true, borderColor: '#DDE3EA', ...opts };
    const rows = toArr(o.rows);
    let cols = o.columns?.length ? o.columns.map((c, i) => (isStr(c) ? { key: c, title: c } : { ...c, key: c.key ?? c.field ?? i, title: c.title ?? c.label ?? String(c.key ?? '') }))
      : Object.keys(rows.find(isObj) || {}).map(kk => ({ key: kk, title: kk }));
    cols = cols.filter(c => !c.hidden);
    if (!cols.length) return { y: this.y, page: this.page };
    const hs = { fill: '#EEF2F7', color: '#0F172A', bold: true, fontSize: o.fontSize, ...(o.headerStyle || {}) };
    const [pv, ph] = (Array.isArray(o.padding) ? o.padding : [o.padding, o.padding + 1]).map(v => v * k);
    const size = o.fontSize, fN = this._fontKey({ font: o.font, bold: false, italic: false }), fB = this._fontKey({ font: o.font, bold: true, italic: false });
    const fH = hs.bold ? fB : fN, lh = size * o.lineHeight, hlh = hs.fontSize * o.lineHeight;
    const x0 = (o.x ?? this._page.margin.left) * k, availW = (o.width ?? this.contentWidth) * k;
    const texts = rows.map(r => cols.map(c => this._cellText(isFn(c.value) ? c.value(r) : getPath(r, c.key), c, r)));
    // column widths
    const widths = (() => {
      const fixed = cols.map((c, i) => {
        const w = o.columnWidths?.[i] ?? c.width;
        if (w == null || w === '*' || w === 'auto') return null;
        return isStr(w) && w.endsWith('%') ? availW * parseFloat(w) / 100 : +w * k;
      });
      const nat = [], min = [], step = Math.max(1, Math.floor(rows.length / 400));
      cols.forEach((c, i) => {
        if (fixed[i] != null) return;
        const title = winAnsi(c.title);
        let m = this._w(title, fH, hs.fontSize), longWord = 0;
        for (const word of title.split(' ')) longWord = Math.max(longWord, this._w(word, fH, hs.fontSize));
        for (let r = 0; r < rows.length; r += step) for (const line of texts[r][i].split('\n')) m = Math.max(m, this._w(winAnsi(line), fN, size));
        nat[i] = Math.min(m, availW * 0.6) + ph * 2;
        min[i] = Math.min(nat[i], Math.max(longWord + ph * 2, 28));
      });
      const autos = cols.map((_, i) => i).filter(i => fixed[i] == null);
      const rest = availW - fixed.reduce((s, w) => s + (w || 0), 0);
      const out = fixed.slice();
      const natSum = autos.reduce((s, i) => s + nat[i], 0);
      if (natSum <= rest || !autos.length) autos.forEach(i => { out[i] = nat[i] * (natSum ? rest / natSum : 1); });
      else {
        let free = autos.slice(), budget = rest;
        for (let guard = 0; guard < 10 && free.length; guard++) {
          const f = budget / free.reduce((s, i) => s + nat[i], 0), pinned = free.filter(i => nat[i] * f < min[i]);
          if (!pinned.length) { free.forEach(i => { out[i] = nat[i] * f; }); break; }
          pinned.forEach(i => { out[i] = min[i]; budget -= min[i]; });
          free = free.filter(i => !pinned.includes(i));
        }
      }
      return out;
    })();
    const aligns = cols.map((c, i) => c.align || o.align || (['number', 'integer', 'currency', 'percent'].includes(c.type) || (rows.length && typeof getPath(rows[0], c.key) === 'number') ? 'right' : 'left'));
    const border = rgb(o.borderColor), headFill = rgb(hs.fill), headColor = rgb(hs.color), zebra = o.zebra ? rgb(o.zebra === true ? '#F7F9FC' : o.zebra) : null;
    const textColor = rgb(o.color) || this.state.color, lwB = 0.6;
    let y = (o.y ?? this.y) * k;
    const bottom = () => (this.height - this._page.margin.bottom) * k;
    const drawRowText = (cells, f, fs, lhh, rowY, color) => {
      let x = x0, ops = `BT /${f.res} ${n2(fs)} Tf ${rgbOp(color, 'rg')}\n`;
      const H = this._page.h;
      cells.forEach((lines, i) => {
        const w = widths[i], al = aligns[i];
        lines.forEach((l, li) => {
          const lx = al === 'right' ? x + w - ph - l.w : al === 'center' ? x + (w - l.w) / 2 : x + ph;
          const bl = rowY + pv + li * lhh + (lhh - (f.asc - f.desc) * fs) / 2 + f.asc * fs;
          ops += `1 0 0 1 ${n2(lx)} ${n2(H - bl)} Tm ${pdfStr(l.s)} Tj\n`;
        });
        x += w;
      });
      return ops + 'ET';
    };
    const hLines = cols.map((c, i) => this._wrap(c.title, fH, hs.fontSize, widths[i] - ph * 2));
    const headH = Math.max(...hLines.map(l => l.length)) * hlh + pv * 2;
    const totalW = widths.reduce((s, w) => s + w, 0);
    const gridV = (top, h) => {
      if (o.borders !== 'all') return '';
      let x = x0, s = '';
      for (let i = 0; i <= widths.length; i++) { s += `${n2(x)} ${n2(this._page.h - top)} m ${n2(x)} ${n2(this._page.h - top - h)} l `; x += widths[i] || 0; }
      return s;
    };
    const drawHeader = () => {
      if (!o.header) return;
      const H = this._page.h;
      let s = headFill ? `q ${rgbOp(headFill, 'rg')} ${n2(x0)} ${n2(H - y - headH)} ${n2(totalW)} ${n2(headH)} re f Q\n` : '';
      s += drawRowText(hLines, fH, hs.fontSize, hlh, y, headColor);
      if (border && o.borders !== 'none') s += `\nq ${rgbOp(border, 'RG')} ${n2(lwB)} w ${o.borders === 'all' ? `${n2(x0)} ${n2(H - y)} m ${n2(x0 + totalW)} ${n2(H - y)} l ` : ''}${n2(x0)} ${n2(H - y - headH)} m ${n2(x0 + totalW)} ${n2(H - y - headH)} l ${gridV(y, headH)}S Q`;
      this._op(s);
      y += headH;
    };
    if (o.header && y + headH + lh + pv * 2 > bottom()) { this._nextPage(); y = this._page.margin.top * k; }
    drawHeader();
    let pageTop = y;
    for (let r = 0; r < rows.length; r++) {
      const cells = texts[r].map((tx, i) => this._wrap(tx, fN, size, widths[i] - ph * 2, o.maxLines));
      const rh = Math.max(1, ...cells.map(l => l.length)) * lh + pv * 2;
      if (y + rh > bottom() + 0.01 && y > pageTop + 0.01) {
        this._nextPage(); y = this._page.margin.top * k;
        if (o.repeatHeader) drawHeader();
        pageTop = y;
      }
      const H = this._page.h;
      let s = '';
      const style = o.cellStyle ? cols.map((c, i) => o.cellStyle(getPath(rows[r], c.key), rows[r], c, i) || null) : null;
      const fillRow = zebra && r % 2 === 1 ? zebra : null;
      if (fillRow) s += `q ${rgbOp(fillRow, 'rg')} ${n2(x0)} ${n2(H - y - rh)} ${n2(totalW)} ${n2(rh)} re f Q\n`;
      if (style) {
        let x = x0;
        style.forEach((st, i) => { if (st?.fill) s += `q ${rgbOp(rgb(st.fill), 'rg')} ${n2(x)} ${n2(H - y - rh)} ${n2(widths[i])} ${n2(rh)} re f Q\n`; x += widths[i]; });
      }
      if (style && style.some(st => st && (st.color || st.bold))) {
        cells.forEach((lines, i) => {
          const st = style[i] || {}, f = st.bold ? fB : fN, only = cells.map((l, j) => (j === i ? l : []));
          s += drawRowText(only, f, size, lh, y, st.color ? rgb(st.color) : textColor) + '\n';
        });
      } else s += drawRowText(cells, fN, size, lh, y, textColor) + '\n';
      if (border && o.borders !== 'none') s += `q ${rgbOp(border, 'RG')} ${n2(lwB)} w ${n2(x0)} ${n2(H - y - rh)} m ${n2(x0 + totalW)} ${n2(H - y - rh)} l ${gridV(y, rh)}S Q`;
      this._op(s);
      y += rh;
      if ((r & 255) === 255) yield r;
    }
    this.y = y / k + (o.gap ?? 0);
    this.x = this._page.margin.left;
    return { y: this.y, page: this.page };
  }
  /** Draw a table with automatic column widths, wrapping and page breaks. */
  table(opts) { const g = this._tableGen(opts); let r; do { r = g.next(); } while (!r.done); return r.value; }
  /** Same as table() but yields to the UI thread every 256 rows (use for thousands of rows). */
  async tableAsync(opts) { const g = this._tableGen(opts); let r; for (;;) { r = g.next(); if (r.done) return r.value; await yieldUI(); opts?.onProgress?.(r.value / (opts.rows?.length || 1)); } }
  /* ── output ── */
  _decorate() {
    const n = this.pages.length;
    this.pages.forEach(p => { p.hf = []; p.hfAnnots = []; });
    if (!this.header && !this.footer) return;
    const prev = this._pi, px = this.x, py = this.y;
    for (let i = 0; i < n; i++) {
      this._pi = i; this._hf = true;
      const p = this.pages[i], info = { page: i + 1, pages: n, width: p.w / this.k, height: p.h / this.k, margin: { ...p.margin } };
      try { this.header?.(this, info); this.footer?.(this, info); } finally { this._hf = false; }
    }
    this._pi = prev; this.x = px; this.y = py;
  }
  /** Render the document to bytes (Uint8Array). */
  async toBytes() {
    this._decorate();
    await this._loadImages();
    const compress = this.o.compress !== false;
    const objs = [null, null, null, null, null]; // 1 catalog, 2 pages, 3 info, 4 resources
    const add = (dict, stream = null) => { objs.push({ dict, stream }); return objs.length - 1; };
    const fontIds = [...this._fonts.values()].map(f => [f.res, add(`<< /Type /Font /Subtype /Type1 /BaseFont /${f.name} /Encoding /WinAnsiEncoding >>`)]);
    const gsIds = [...this._gs.values()].map(g => [g.res, add(`<< /Type /ExtGState /ca ${n4(g.a)} /CA ${n4(g.a)} >>`)]);
    const imgIds = [];
    for (const im of this._images) {
      if (!im.kind) continue;
      if (im.kind === 'jpeg') {
        const cs = im.comps === 1 ? '/DeviceGray' : im.comps === 4 ? '/DeviceCMYK' : '/DeviceRGB';
        imgIds.push([im.res, add(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace ${cs} /BitsPerComponent 8${im.comps === 4 && im.adobe ? ' /Decode [1 0 1 0 1 0 1 0]' : ''} /Filter /DCTDecode /Length ${im.data.length} >>`, im.data)]);
        continue;
      }
      let smask = '';
      if (im.alpha) {
        const z = compress ? await flate(im.alpha) : null;
        const id = add(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceGray /BitsPerComponent 8${z ? ' /Filter /FlateDecode' : ''} /Length ${(z || im.alpha).length} >>`, z || im.alpha);
        smask = ` /SMask ${id} 0 R`;
      }
      const z = compress ? await flate(im.data) : null;
      imgIds.push([im.res, add(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8${z ? ' /Filter /FlateDecode' : ''}${smask} /Length ${(z || im.data).length} >>`, z || im.data)]);
    }
    const dict = list => list.map(([r, id]) => `/${r} ${id} 0 R`).join(' ');
    objs[4] = { dict: `<< /ProcSet [/PDF /Text /ImageB /ImageC /ImageI] /Font << ${dict(fontIds)} >>${gsIds.length ? ` /ExtGState << ${dict(gsIds)} >>` : ''}${imgIds.length ? ` /XObject << ${dict(imgIds)} >>` : ''} >>` };
    const first = objs.length, pageIds = this.pages.map((_, i) => first + i * 2);
    for (let i = 0; i < this.pages.length; i++) { objs.push(null, null); }
    for (let i = 0; i < this.pages.length; i++) {
      const p = this.pages[i], body = latin1(p.ops.concat(p.hf).filter(Boolean).join('\n'));
      const z = compress ? await flate(body) : null, data = z || body;
      objs[pageIds[i] + 1] = { dict: `<< /Length ${data.length}${z ? ' /Filter /FlateDecode' : ''} >>`, stream: data };
      const annots = p.annots.concat(p.hfAnnots).map(a => {
        const rect = `/Rect [${a.rect.map(n2).join(' ')}]`;
        if (isObj(a.target) && a.target.page) return `<< /Type /Annot /Subtype /Link ${rect} /Border [0 0 0] /Dest [${pageIds[clamp(a.target.page - 1, 0, pageIds.length - 1)]} 0 R /Fit] >>`;
        let uri = String(a.target);
        try { uri = encodeURI(decodeURI(uri)); } catch { uri = encodeURI(uri); }
        uri = uri.replace(/[\\()]/g, '\\$&');
        return `<< /Type /Annot /Subtype /Link ${rect} /Border [0 0 0] /A << /S /URI /URI (${uri}) >> >>`;
      });
      objs[pageIds[i]] = { dict: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n2(p.w)} ${n2(p.h)}] /Resources 4 0 R /Contents ${pageIds[i] + 1} 0 R${annots.length ? ` /Annots [${annots.join(' ')}]` : ''} >>` };
    }
    const m = this.meta, lang = (i18n.locale || 'en').replace(/[^\w-]/g, '');
    objs[1] = { dict: `<< /Type /Catalog /Pages 2 0 R /PageLayout /OneColumn /ViewerPreferences << /DisplayDocTitle true >> /Lang (${lang}) >>` };
    objs[2] = { dict: `<< /Type /Pages /Kids [${pageIds.map(id => id + ' 0 R').join(' ')}] /Count ${pageIds.length} >>` };
    objs[3] = { dict: `<< /Producer (Orion Admin PDF) /Creator ${infoStr(m.creator || 'Orion Admin')} /CreationDate (${pdfDate()})${m.title ? ' /Title ' + infoStr(m.title) : ''}${m.author ? ' /Author ' + infoStr(m.author) : ''}${m.subject ? ' /Subject ' + infoStr(m.subject) : ''}${m.keywords ? ' /Keywords ' + infoStr(m.keywords) : ''} >>` };
    // serialize with byte offsets
    const parts = [], offsets = [];
    let pos = 0;
    const push = b => { const u = typeof b === 'string' ? latin1(b) : b; parts.push(u); pos += u.length; };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    for (let i = 1; i < objs.length; i++) {
      offsets[i] = pos;
      const ob = objs[i];
      push(`${i} 0 obj\n${ob.dict}\n`);
      if (ob.stream) { push('stream\n'); push(ob.stream); push('\nendstream\n'); }
      push('endobj\n');
    }
    const xref = pos, size = objs.length;
    let x = `xref\n0 ${size}\n0000000000 65535 f \n`;
    for (let i = 1; i < size; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    const id = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
    push(x + `trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R /ID [<${id}> <${id}>] >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(pos);
    let o2 = 0;
    for (const p of parts) { out.set(p, o2); o2 += p.length; }
    return out;
  }
  async toBlob() { return new Blob([await this.toBytes()], { type: 'application/pdf' }); }
  async toDataURL() { const b = await this.toBytes(); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return 'data:application/pdf;base64,' + btoa(s); }
  async toObjectURL() { return URL.createObjectURL(await this.toBlob()); }
  /** Download the document. */
  async save(filename = 'document.pdf') { const blob = await this.toBlob(); download(blob, /\.pdf$/i.test(filename) ? filename : filename + '.pdf'); return blob; }
}
PDF.sizes = SIZES;
PDF.units = UNITS;
PDF.encode = winAnsi;
PDF.loadImage = loadImage;
/** Measure text without a document: O.PDF.measure('Hello', { size: 12, bold: true, font: 'Helvetica' }) -> points */
PDF.measure = (str, o = {}) => { const fam = FAMILIES[FAMILY_ALIAS[String(o.font || 'helvetica').toLowerCase()] || 'helvetica'], w = fam.widths[o.bold ? 1 : 0], e = winAnsi(str), size = o.size || 10; if (typeof w === 'number') return e.length * w * size / 1000; let s = 0; for (let i = 0; i < e.length; i++) { const c = e.charCodeAt(i); if (c >= 32 && c <= 255) s += w[c - 32]; } return s * size / 1000; };
O.PDF = PDF;
O.pdf = opts => new PDF(opts);
