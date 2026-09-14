// @deps zip
/* XLSX — Excel workbook writer & reader (ECMA-376 / ISO 29500 SpreadsheetML). No dependencies, no DOM needed.
 *
 *   O.xlsx.write(rows | sheets, opts) -> Promise<Blob>
 *     rows:   [{...}] or [[...]]            sheets: [{ name, rows, columns, ...sheet options }]
 *     opts / sheet options: { sheetName, columns: [{ key, title, width, type, format, currency, decimals, wrap, hidden, value(row) }],
 *       header: true, headerStyle: { bold: true, fill: '#EEF2F7', color, border: true }, freeze: true | { rows, cols },
 *       autoFilter: true, autoWidth: true, rtl, title, subtitle, merges: ['A1:C1'], headerRows (array rows),
 *       orientation: 'portrait' | 'landscape', creator, company, compress: true, onProgress(ratio) }
 *     column.type: 'string' | 'number' | 'integer' | 'currency' | 'percent' | 'date' | 'datetime' | 'time' | 'boolean'
 *     column.format: Excel number format code (e.g. '#,##0.00', 'dd/mm/yyyy'); formula cells: { f: 'SUM(B2:B9)', v }
 *   O.xlsx.read(File | Blob | ArrayBuffer, { header: true, sheet: name | index, skipEmpty: true, fillMerged: false })
 *     -> Promise<{ sheets: [{ name, rows, columns, merges, range, hidden }], sheetNames }>
 *     shared + inline strings, rich text, numbers, booleans, errors, ISO dates, dates via built-in and custom number formats,
 *     1900/1904 date systems, formula cached values, merged ranges.
 *   Helpers: O.xlsx.colName(0) -> 'A', O.xlsx.colIndex('AA') -> 26, O.xlsx.toSerial(date), O.xlsx.fromSerial(n)
 */

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NSR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const XML_BAD = /[\x00-\x08\x0B\x0C\x0E-\x1F\u{FFFE}\u{FFFF}\u{D800}-\u{DFFF}]/gu;
const XE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const xesc = s => String(s).replace(XML_BAD, '').replace(/[&<>"]/g, c => XE[c]);
const xtext = s => xesc(String(s).replace(/\r\n?/g, '\n')).replace(/_(x[0-9A-Fa-f]{4}_)/g, '_x005F_$1');
const NUM_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const yieldUI = () => new Promise(r => (globalThis.scheduler?.yield ? globalThis.scheduler.yield().then(r) : setTimeout(r, 0)));

function colName(i) { let s = ''; for (let n = i + 1; n > 0;) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }
function colIndex(letters) { let n = 0; for (let i = 0; i < letters.length; i++) { const c = letters.charCodeAt(i) & 0xdf; if (c < 65 || c > 90) break; n = n * 26 + c - 64; } return n - 1; }
const ref = (r, c) => colName(c) + (r + 1);
/** Excel serial number (1900 system) for a local Date. */
const toSerial = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()) / 864e5 + 25569;
/** Local Date for an Excel serial number. */
function fromSerial(n, date1904 = false) {
  const t = (n + (date1904 ? 1462 : 0) - 25569) * 864e5;
  let ms = Math.round(t);
  const s = Math.round(t / 1000) * 1000;
  if (Math.abs(ms - s) <= 1) ms = s;
  const d = new Date(ms);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
}
function argb(c, fallback) {
  const p = c && O.color ? O.color.parse(c) : null;
  if (!p) return fallback;
  const x = v => Math.round(v).toString(16).padStart(2, '0').toUpperCase();
  return 'FF' + x(p.r) + x(p.g) + x(p.b);
}
function uniqueKeys(list) {
  const used = new Set();
  return list.map((f, i) => { const base = String(f ?? '').trim() || `Column ${colName(i)}`; let k = base, n = 1; while (used.has(k)) k = `${base}_${++n}`; used.add(k); return k; });
}

/* ── styles ───────────────────────────────────────────────────────────── */
const BUILTIN_FMT = { General: 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10, '0.00E+00': 11, 'h:mm': 20, 'h:mm:ss': 21, '@': 49 };
class Styles {
  constructor() {
    this.fmts = new Map(); this.nextFmt = 164;
    this.fonts = ['<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'];
    this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    this.borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
    this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    this.keys = new Map([['', 0]]);
  }
  _idx(list, xml) { let i = list.indexOf(xml); if (i < 0) { i = list.length; list.push(xml); } return i; }
  numFmt(code) {
    if (code == null || code === '' || code === 'General') return 0;
    if (code in BUILTIN_FMT) return BUILTIN_FMT[code];
    if (!this.fmts.has(code)) this.fmts.set(code, this.nextFmt++);
    return this.fmts.get(code);
  }
  /** xf({ fmt, bold, italic, size, color, fill, border, align, valign, wrap }) -> cellXfs index */
  xf(s = {}) {
    const key = JSON.stringify(s);
    if (this.keys.has(key)) return this.keys.get(key);
    const numFmtId = this.numFmt(s.fmt);
    let fontId = 0, fillId = 0, borderId = 0;
    if (s.bold || s.italic || s.color || s.size) {
      fontId = this._idx(this.fonts, `<font>${s.bold ? '<b/>' : ''}${s.italic ? '<i/>' : ''}<sz val="${s.size || 11}"/>${s.color ? `<color rgb="${argb(s.color, 'FF000000')}"/>` : ''}<name val="Calibri"/><family val="2"/></font>`);
    }
    if (s.fill) fillId = this._idx(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="${argb(s.fill, 'FFEEF2F7')}"/><bgColor indexed="64"/></patternFill></fill>`);
    if (s.border) borderId = this._idx(this.borders, `<border><left/><right/><top/><bottom style="thin"><color rgb="${argb(s.border === true ? '#94A3B8' : s.border, 'FF94A3B8')}"/></bottom><diagonal/></border>`);
    const al = s.align || s.valign || s.wrap ? `<alignment${s.align ? ` horizontal="${s.align}"` : ''}${s.valign ? ` vertical="${s.valign}"` : ''}${s.wrap ? ' wrapText="1"' : ''}/>` : '';
    const xml = `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"${numFmtId ? ' applyNumberFormat="1"' : ''}${fontId ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}${borderId ? ' applyBorder="1"' : ''}${al ? ' applyAlignment="1">' + al + '</xf>' : '/>'}`;
    const i = this.xfs.length;
    this.xfs.push(xml); this.keys.set(key, i);
    return i;
  }
  xml() {
    const f = [...this.fmts].map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${xesc(code)}"/>`).join('');
    return HEAD + `<styleSheet xmlns="${NS}">` + (f ? `<numFmts count="${this.fmts.size}">${f}</numFmts>` : '') +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts><fills count="${this.fills.length}">${this.fills.join('')}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/>' +
      '<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>';
  }
}
class SST {
  constructor() { this.map = new Map(); this.list = []; this.count = 0; }
  idx(s) { this.count++; let i = this.map.get(s); if (i === undefined) { i = this.list.length; this.list.push(s); this.map.set(s, i); } return i; }
  xml() {
    let x = HEAD + `<sst xmlns="${NS}" count="${this.count}" uniqueCount="${this.list.length}">`;
    for (const s of this.list) x += /^\s|\s$|\n/.test(s) ? `<si><t xml:space="preserve">${xtext(s)}</t></si>` : `<si><t>${xtext(s)}</t></si>`;
    return x + '</sst>';
  }
}

function currencyFmt(code, decimals) {
  let sym = code, before = true, dec = 2, space = '';
  try {
    const nf = new Intl.NumberFormat(i18n.locale || 'en', { style: 'currency', currency: code });
    const parts = nf.formatToParts(1234.5);
    const ci = parts.findIndex(p => p.type === 'currency'), ii = parts.findIndex(p => p.type === 'integer');
    sym = parts[ci].value; before = ci < ii; dec = nf.resolvedOptions().maximumFractionDigits;
    if (parts[before ? ci + 1 : ci - 1]?.type === 'literal') space = ' ';
  } catch {}
  if (decimals != null) dec = decimals;
  const num = '#,##0' + (dec ? '.' + '0'.repeat(dec) : ''), s = `"${String(sym).replace(/"/g, '')}"`;
  return before ? s + space + num : num + space + s;
}
function typeFormat(col) {
  if (isStr(col.format) || isStr(col.numFmt)) return col.numFmt || col.format;
  const d = col.decimals;
  switch (col.type) {
    case 'integer': return '#,##0';
    case 'number': return d == null ? 'General' : d ? '#,##0.' + '0'.repeat(d) : '#,##0';
    case 'currency': return currencyFmt(col.currency || O.config?.currency || 'USD', d);
    case 'percent': return d ? '0.' + '0'.repeat(d) + '%' : '0%';
    case 'date': return 'yyyy-mm-dd';
    case 'datetime': return 'yyyy-mm-dd hh:mm';
    case 'time': return 'hh:mm:ss';
    default: return 'General';
  }
}
const NUMERIC = new Set(['number', 'integer', 'currency', 'percent']);
function convert(v, type) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(+v) ? null : v;
  if (NUMERIC.has(type)) {
    if (typeof v === 'string') {
      const s = v.trim();
      if (NUM_RE.test(s)) return +s;
      const n = /\d/.test(s) ? fmt.parseNumber(s) : null;
      if (n != null) return type === 'percent' && /%\s*$/.test(s) ? n / 100 : n;
    }
    return v;
  }
  if (type === 'date' || type === 'datetime' || type === 'time') { if (typeof v === 'string' || typeof v === 'number') return date.parse(v) || v; return v; }
  if (type === 'boolean' && typeof v === 'string') { const l = v.trim().toLowerCase(); if (['true', 'yes', 'y', '1'].includes(l)) return true; if (['false', 'no', 'n', '0'].includes(l)) return false; }
  if (type === 'string' && typeof v !== 'string' && !isObj(v)) return String(v);
  return v;
}
/** Approximate display width (characters) of a value, for auto column widths. */
function displayLen(v, fmtCode) {
  if (v == null) return 0;
  if (v instanceof Date) return /h/.test(fmtCode) ? 16 : 10;
  if (typeof v === 'number') {
    const dec = (/\.(0+)/.exec(fmtCode) || [, ''])[1].length;
    let s = /#,##0/.test(fmtCode) ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : String(Math.round(v * 1e6) / 1e6);
    if (/%/.test(fmtCode)) s = (v * 100).toFixed(dec) + '%';
    return s.length + (/"[^"]*"/.exec(fmtCode)?.[0].length || 0);
  }
  if (typeof v === 'boolean') return 5;
  if (isObj(v)) return 8;
  let max = 0;
  for (const line of String(v).split('\n')) {
    let n = line.length;
    if (/[\u{1100}-\u{115F}\u{2E80}-\u{A4CF}\u{AC00}-\u{D7A3}\u{F900}-\u{FAFF}\u{FE30}-\u{FE4F}\u{FF00}-\u{FF60}]/u.test(line)) n += (line.match(/[\u{1100}-\u{115F}\u{2E80}-\u{A4CF}\u{AC00}-\u{D7A3}\u{F900}-\u{FAFF}\u{FE30}-\u{FE4F}\u{FF00}-\u{FF60}]/gu) || []).length;
    if (n > max) max = n;
  }
  return max;
}

/* ── writer ───────────────────────────────────────────────────────────── */
function normSheets(input, opts) {
  if (isObj(input) && Array.isArray(input.sheets)) input = input.sheets;
  if (isObj(input) && Array.isArray(input.rows)) input = [input];
  const list = toArr(input);
  const isSheets = list.length > 0 && list.every(s => isObj(s) && Array.isArray(s.rows) && (isStr(s.name) || Array.isArray(s.columns) || s.sheet === true));
  return isSheets ? list : [{ name: opts.sheetName, rows: list, columns: opts.columns }];
}
function sheetName(n, i, used) {
  let s = String(n ?? '').replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || `Sheet${i + 1}`;
  if (s.toLowerCase() === 'history') s += ' 1';
  let k = s, j = 2;
  while (used.has(k.toLowerCase())) { const suf = ` (${j++})`; k = s.slice(0, 31 - suf.length) + suf; }
  used.add(k.toLowerCase());
  return k;
}
const quoteSheet = n => `'${n.replace(/'/g, "''")}'`;

async function buildSheet(sh, index, g, S, sst, used) {
  const { title: docTitle, subtitle: docSub, ...gg } = g;
  const o = { header: true, freeze: true, autoFilter: true, autoWidth: true, ...gg, ...sh };
  if (g.titleRow && sh.title == null) { o.title = docTitle; o.subtitle = docSub; }
  delete o.rows;
  const name = sheetName(sh.name ?? (index ? null : g.sheetName), index, used);
  const rows = toArr(sh.rows);
  const first = rows.find(r => r != null);
  const arrays = !o.columns?.length && Array.isArray(first);
  let cols;
  if (arrays) {
    let w = 0; for (const r of rows) if (r && r.length > w) w = r.length;
    cols = Array.from({ length: w }, (_, i) => ({ key: i }));
  } else if (o.columns?.length) {
    cols = o.columns.map((c, i) => (isStr(c) ? { key: c, title: c } : { ...c, key: c.key ?? c.field ?? i, title: c.title ?? c.label ?? String(c.key ?? c.field ?? '') }));
  } else {
    const keys = new Set();
    for (let i = 0; i < Math.min(rows.length, 200); i++) if (isObj(rows[i])) Object.keys(rows[i]).forEach(k => keys.add(k));
    cols = [...keys].map(k => ({ key: k, title: k }));
  }
  const nc = Math.max(1, cols.length), L = cols.map((_, i) => colName(i));
  const hs = { bold: true, fill: '#EEF2F7', color: '#0F172A', border: true, valign: 'center', ...(o.headerStyle || {}) };
  const headXf = S.xf({ bold: hs.bold, italic: hs.italic, color: hs.color, fill: hs.fill, border: hs.border, align: hs.align, valign: hs.valign, wrap: hs.wrap });
  // per-column inferred type when not given (samples)
  for (const c of cols) {
    if (!c.type && !isFn(c.format)) {
      let kind = null;
      for (let i = 0, seen = 0; i < rows.length && seen < 200; i++) {
        const v = rows[i] == null ? null : isFn(c.value) ? c.value(rows[i]) : getPath(rows[i], c.key);
        if (v == null || v === '') continue;
        seen++;
        const k = v instanceof Date ? (v.getHours() || v.getMinutes() || v.getSeconds() ? 'datetime' : 'date') : typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string';
        kind = kind == null || kind === k ? k : (kind === 'date' && k === 'datetime') || (kind === 'datetime' && k === 'date') ? 'datetime' : 'mixed';
      }
      c._kind = kind;
    }
    c._fmt = typeFormat(c.type ? c : { ...c, type: c._kind === 'date' || c._kind === 'datetime' ? c._kind : null });
    const align = c.align === 'center' || c.align === 'right' || c.align === 'left' ? c.align : null;
    c._xf = S.xf({ fmt: c._fmt, wrap: c.wrap, align });
    c._xfDate = S.xf({ fmt: c.type === 'date' || c.type === 'datetime' || c.type === 'time' ? c._fmt : 'yyyy-mm-dd', wrap: c.wrap, align });
    c._xfDateTime = S.xf({ fmt: c.type === 'date' || c.type === 'datetime' || c.type === 'time' ? c._fmt : 'yyyy-mm-dd hh:mm', wrap: c.wrap, align });
    c._xfText = S.xf({ wrap: c.wrap, align });
    c._get = isFn(c.value) ? c.value : isFn(c.key) ? c.key : null;
  }
  const out = [];
  let r = 0;
  const merges = [...toArr(o.merges)].map(m => (isStr(m) ? m : `${ref(m.s.r, m.s.c)}:${ref(m.e.r, m.e.c)}`));
  const widths = new Array(nc).fill(0);
  const sAttr = i => (i ? ` s="${i}"` : '');
  const strCell = (rr, c, s, xf) => `<c r="${L[c] || colName(c)}${rr + 1}"${sAttr(xf)} t="s"><v>${sst.idx(s.length > 32767 ? s.slice(0, 32767) : s)}</v></c>`;
  // title block
  if (o.title) {
    out.push(`<row r="${r + 1}" ht="24" customHeight="1">${strCell(r, 0, String(o.title), S.xf({ bold: true, size: 15 }))}</row>`);
    if (nc > 1) merges.push(`A${r + 1}:${L[nc - 1]}${r + 1}`);
    r++;
    if (o.subtitle) { out.push(`<row r="${r + 1}">${strCell(r, 0, String(o.subtitle), S.xf({ color: '#64748B' }))}</row>`); if (nc > 1) merges.push(`A${r + 1}:${L[nc - 1]}${r + 1}`); r++; }
    r++;
  }
  // header
  let headerRow = -1, headerRows = 0;
  if (!arrays && o.header !== false) {
    headerRow = r; headerRows = 1;
    let x = `<row r="${r + 1}">`;
    cols.forEach((c, i) => { const t = String(c.title ?? ''); widths[i] = Math.max(widths[i], displayLen(t) * 1.15); if (t) x += strCell(r, i, t, headXf); });
    out.push(x + '</row>'); r++;
  } else if (arrays) {
    headerRows = o.headerRows ?? ((sh.header ?? gg.header) === true ? 1 : 0);
    if (headerRows) headerRow = r;
  }
  const total = rows.length, sampleEvery = Math.max(1, Math.floor(total / 5000));
  for (let i = 0; i < total; i++) {
    const row = rows[i];
    if (row == null) { r++; continue; }
    const isHead = arrays && i < headerRows;
    let x = '';
    for (let c = 0; c < cols.length; c++) {
      const col = cols[c];
      let v = col._get ? col._get(row) : getPath(row, col.key);
      if (isFn(col.format) && !col.type) v = col.format(v, row);
      v = convert(v, col.type);
      if (v == null || v === '') continue;
      const rr = `${L[c]}${r + 1}`;
      if (isHead) { const s = String(v); x += strCell(r, c, s, headXf); if (i % sampleEvery === 0) widths[c] = Math.max(widths[c], displayLen(s) * 1.15); continue; }
      if (typeof v === 'number') { if (!Number.isFinite(v)) continue; x += `<c r="${rr}"${sAttr(col._xf)}><v>${v}</v></c>`; }
      else if (typeof v === 'boolean') x += `<c r="${rr}"${sAttr(col._xfText)} t="b"><v>${v ? 1 : 0}</v></c>`;
      else if (v instanceof Date) x += `<c r="${rr}" s="${v.getHours() || v.getMinutes() || v.getSeconds() ? col._xfDateTime : col._xfDate}"><v>${toSerial(v)}</v></c>`;
      else if (isObj(v) && (v.f != null || v.formula != null)) {
        const f = String(v.f ?? v.formula).replace(/^=/, ''), cv = v.v ?? v.value;
        x += `<c r="${rr}"${sAttr(col._xf)}${isStr(cv) ? ' t="str"' : typeof cv === 'boolean' ? ' t="b"' : ''}><f>${xesc(f)}</f>${cv == null ? '' : `<v>${xesc(typeof cv === 'boolean' ? +cv : cv)}</v>`}</c>`;
        g._formulas = true;
      } else {
        const s = Array.isArray(v) ? v.join(', ') : isObj(v) ? JSON.stringify(v) : String(v);
        x += strCell(r, c, s, col._xfText);
      }
      if (i % sampleEvery === 0) widths[c] = Math.max(widths[c], displayLen(v, col._fmt));
    }
    out.push(x ? `<row r="${r + 1}">${x}</row>` : '');
    r++;
    if ((i & 2047) === 2047) { g.onProgress?.(i / total); await yieldUI(); }
  }
  const lastRow = Math.max(r, 1), lastCol = L[nc - 1] || 'A';
  // sheet view (freeze panes)
  let fr = 0, fc = 0;
  if (o.freeze) {
    if (isObj(o.freeze)) { fr = o.freeze.rows ?? (headerRow >= 0 ? headerRow + headerRows : 0); fc = o.freeze.cols || 0; }
    else if (headerRow >= 0) fr = headerRow + headerRows;
  }
  const tl = ref(fr, fc), pane = fr && fc ? 'bottomRight' : fr ? 'bottomLeft' : 'topRight';
  const view = `<sheetViews><sheetView workbookViewId="0"${index === 0 ? ' tabSelected="1"' : ''}${o.rtl ? ' rightToLeft="1"' : ''}>` +
    (fr || fc ? `<pane${fc ? ` xSplit="${fc}"` : ''}${fr ? ` ySplit="${fr}"` : ''} topLeftCell="${tl}" activePane="${pane}" state="frozen"/><selection pane="${pane}" activeCell="${tl}" sqref="${tl}"/>` : '') +
    '</sheetView></sheetViews>';
  let colsXml = '';
  if (o.autoWidth !== false || cols.some(c => c.width || c.hidden)) {
    colsXml = '<cols>' + cols.map((c, i) => {
      const w = c.width ?? (o.autoWidth !== false ? Math.min(o.maxWidth || 60, Math.max(o.minWidth || 6, Math.ceil(widths[i]) + 2)) : 10);
      return `<col min="${i + 1}" max="${i + 1}" width="${Math.round(w * 100) / 100}" customWidth="1"${c.hidden ? ' hidden="1"' : ''}/>`;
    }).join('') + '</cols>';
  }
  const defined = [];
  let filter = '';
  if (o.autoFilter && headerRow >= 0 && lastRow > headerRow + 1) {
    const range = `$A$${headerRow + 1}:$${lastCol}$${lastRow}`;
    filter = `<autoFilter ref="A${headerRow + 1}:${lastCol}${lastRow}"/>`;
    defined.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${index}" hidden="1">${xesc(quoteSheet(name))}!${range}</definedName>`);
  }
  if (headerRow >= 0) defined.push(`<definedName name="_xlnm.Print_Titles" localSheetId="${index}">${xesc(quoteSheet(name))}!$${headerRow + 1}:$${headerRow + headerRows}</definedName>`);
  const landscape = o.orientation === 'landscape' || (o.orientation == null && nc > 8);
  const xml = HEAD + `<worksheet xmlns="${NS}" xmlns:r="${NSR}">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${lastCol}${lastRow}"/>${view}<sheetFormatPr defaultRowHeight="15"/>${colsXml}` +
    `<sheetData>${out.join('')}</sheetData>${filter}` +
    (merges.length ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${xesc(m)}"/>`).join('')}</mergeCells>` : '') +
    '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    `<pageSetup paperSize="${o.paper === 'Letter' ? 1 : 9}" orientation="${landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>` +
    `<headerFooter><oddFooter>&amp;L${xesc(name.replace(/&/g, '&&'))}&amp;RPage &amp;P of &amp;N</oddFooter></headerFooter></worksheet>`;
  return { name, xml, defined };
}

/** Write a workbook. Resolves with an .xlsx Blob. */
async function write(input, opts = {}) {
  const g = { ...opts }, sheets = normSheets(input, g), S = new Styles(), sst = new SST(), used = new Set();
  const built = [];
  for (let i = 0; i < sheets.length; i++) built.push(await buildSheet(sheets[i], i, g, S, sst, used));
  const n = built.length, now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  // Per-sheet `hidden` is emitted as state="hidden" (read() already parsed it back); the active tab must be a visible sheet.
  const activeTab = Math.max(0, sheets.findIndex(s => !s.hidden));
  const wb = HEAD + `<workbook xmlns="${NS}" xmlns:r="${NSR}"><workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15000" activeTab="${activeTab}"/></bookViews>` +
    `<sheets>${built.map((b, i) => `<sheet name="${xesc(b.name)}" sheetId="${i + 1}"${sheets[i].hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('')}</sheets>` +
    (built.some(b => b.defined.length) ? `<definedNames>${built.flatMap(b => b.defined).join('')}</definedNames>` : '') +
    `<calcPr calcId="191029"${g._formulas ? ' fullCalcOnLoad="1"' : ''}/></workbook>`;
  const wbRels = HEAD + `<Relationships xmlns="${PKG}">` + built.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NSR}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${n + 1}" Type="${NSR}/styles" Target="styles.xml"/><Relationship Id="rId${n + 2}" Type="${NSR}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  const types = HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    `<Override PartName="/xl/workbook.xml" ContentType="${CT}spreadsheetml.sheet.main+xml"/>` +
    built.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CT}spreadsheetml.worksheet+xml"/>`).join('') +
    `<Override PartName="/xl/styles.xml" ContentType="${CT}spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="${CT}spreadsheetml.sharedStrings+xml"/>` +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    `<Override PartName="/docProps/app.xml" ContentType="${CT}extended-properties+xml"/></Types>`;
  const rootRels = HEAD + `<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${NSR}/officeDocument" Target="xl/workbook.xml"/>` +
    `<Relationship Id="rId2" Type="${PKG}/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${NSR}/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const creator = xesc(g.creator || g.author || 'Orion Admin');
  const core = HEAD + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    (g.title || g.docTitle ? `<dc:title>${xesc(g.docTitle || g.title)}</dc:title>` : '') + (g.subject ? `<dc:subject>${xesc(g.subject)}</dc:subject>` : '') +
    `<dc:creator>${creator}</dc:creator>` + (g.keywords ? `<cp:keywords>${xesc(g.keywords)}</cp:keywords>` : '') + (g.description ? `<dc:description>${xesc(g.description)}</dc:description>` : '') +
    `<cp:lastModifiedBy>${creator}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  const app = HEAD + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    `<Application>Orion Admin</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${n}</vt:i4></vt:variant></vt:vector></HeadingPairs>` +
    `<TitlesOfParts><vt:vector size="${n}" baseType="lpstr">${built.map(b => `<vt:lpstr>${xesc(b.name)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts>` +
    (g.company ? `<Company>${xesc(g.company)}</Company>` : '') + '<LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0300</AppVersion></Properties>';
  g.onProgress?.(1);
  return O.zip.create([
    { name: '[Content_Types].xml', data: types }, { name: '_rels/.rels', data: rootRels },
    { name: 'docProps/core.xml', data: core }, { name: 'docProps/app.xml', data: app },
    { name: 'xl/workbook.xml', data: wb }, { name: 'xl/_rels/workbook.xml.rels', data: wbRels },
    { name: 'xl/styles.xml', data: S.xml() }, { name: 'xl/sharedStrings.xml', data: sst.xml() },
    ...built.map((b, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: b.xml })),
  ], { compress: g.compress !== false, type: MIME });
}

/* ── reader ───────────────────────────────────────────────────────────── */
const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const unesc = s => (s.indexOf('&') < 0 ? s : s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e])));
const unX = s => (s.indexOf('_x') < 0 ? s : s.replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16))));
function attrs(s) {
  const o = {}, re = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(s))) { if (m[1].startsWith('xmlns')) continue; const i = m[1].indexOf(':'); o[i < 0 ? m[1] : m[1].slice(i + 1)] = unesc(m[2] ?? m[3]); }
  return o;
}
function tags(xml, name) {
  const re = new RegExp(`<(?:[\\w.-]+:)?${name}\\b((?:\\s+[^\\s=>/]+\\s*=\\s*(?:"[^"]*"|'[^']*'))*)\\s*/?>`, 'g'), out = [];
  let m;
  while ((m = re.exec(xml))) out.push(attrs(m[1]));
  return out;
}
function resolvePath(base, target) {
  const p = target.startsWith('/') ? target.slice(1) : base + target, out = [];
  for (const seg of p.split('/')) { if (seg === '..') out.pop(); else if (seg && seg !== '.') out.push(seg); }
  return out.join('/');
}
const rels = (xml, base) => (xml ? tags(xml, 'Relationship').map(a => ({ id: a.Id, type: a.Type || '', target: a.TargetMode === 'External' ? a.Target : resolvePath(base, a.Target || '') })) : []);
function richText(x) {
  if (x.indexOf('<![CDATA[') >= 0) x = x.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (m, c) => xesc(c));
  if (x.indexOf('rPh') >= 0) x = x.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '');
  const re = /<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g;
  let s = '', m;
  while ((m = re.exec(x))) if (m[1]) s += m[1];
  return unX(unesc(s));
}
function parseSST(xml) {
  if (!xml) return [];
  const out = [], re = /<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g;
  let m;
  while ((m = re.exec(xml))) out.push(m[1] ? richText(m[1]) : '');
  return out;
}
const DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
function isDateFormat(code) {
  if (!code) return false;
  const s = String(code).replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/_.|\*./g, '').replace(/\[(?!(?:h+|m+|s+)\])[^\]]*\]/gi, '').split(';')[0];
  return /[dmyhs]/i.test(s) && !/^general$/i.test(s.trim());
}
function parseStyles(xml) {
  if (!xml) return [];
  const fmts = {};
  for (const a of tags(xml, 'numFmt')) fmts[+a.numFmtId] = a.formatCode;
  const cx = /<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/.exec(xml);
  return (cx ? tags(cx[1], 'xf') : []).map(a => { const id = +a.numFmtId || 0; return id in fmts ? isDateFormat(fmts[id]) : DATE_IDS.has(id); });
}
function isoToDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(String(s).trim());
  if (!m) return null;
  if (m[8]) return new Date(s);
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), +((m[7] || '0').slice(0, 3).padEnd(3, '0')));
}
function parseSheet(xml, sst, dateXf, date1904) {
  const rows = [];
  let maxC = -1, rm, r = -1;
  const ROW = /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g, CELL = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
  const start = xml.search(/<(?:\w+:)?sheetData\b/);
  ROW.lastIndex = start < 0 ? 0 : start;
  while ((rm = ROW.exec(xml))) {
    const ra = /\br="(\d+)"/.exec(rm[1]);
    r = ra ? +ra[1] - 1 : r + 1;
    if (!rm[2]) continue;
    let c = -1, cm;
    CELL.lastIndex = 0;
    while ((cm = CELL.exec(rm[2]))) {
      const a = cm[1], cr = /\br="([A-Za-z]+)(\d+)"/.exec(a);
      c = cr ? colIndex(cr[1]) : c + 1;
      const inner = cm[2];
      if (!inner) continue;
      const t = (/\bt="(\w+)"/.exec(a) || [])[1] || 'n';
      let v;
      if (t === 'inlineStr') v = richText(inner);
      else {
        const vm = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner);
        if (!vm) continue;
        const raw = vm[1];
        if (t === 's') v = sst[+raw] ?? '';
        else if (t === 'str') v = unX(unesc(raw));
        else if (t === 'b') v = raw === '1' || raw === 'true';
        else if (t === 'e') v = unesc(raw);
        else if (t === 'd') v = isoToDate(raw) ?? unesc(raw);
        else {
          if (raw === '') continue;
          const n = +raw;
          if (Number.isNaN(n)) v = unesc(raw);
          else { const sm = /\bs="(\d+)"/.exec(a); v = sm && dateXf[+sm[1]] ? fromSerial(n, date1904) : n; }
        }
      }
      (rows[r] || (rows[r] = []))[c] = v;
      if (c > maxC) maxC = c;
    }
  }
  const merges = [];
  for (const m of xml.matchAll(/<(?:\w+:)?mergeCell\b[^>]*\bref="([^"]+)"/g)) merges.push(m[1]);
  return { rows, maxC, merges };
}
function parseRange(s) {
  const m = /^([A-Za-z]+)(\d+)(?::([A-Za-z]+)(\d+))?$/.exec(s);
  if (!m) return null;
  return { s: { r: +m[2] - 1, c: colIndex(m[1]) }, e: { r: +(m[4] || m[2]) - 1, c: colIndex(m[3] || m[1]) } };
}
function inferType(values) {
  let t = null;
  for (let i = 0, seen = 0; i < values.length && seen < 500; i++) {
    const v = values[i];
    if (v == null || v === '') continue;
    seen++;
    const k = v instanceof Date ? (v.getHours() || v.getMinutes() || v.getSeconds() ? 'datetime' : 'date') : typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string';
    if (t == null) t = k; else if (t !== k) t = (t === 'date' || t === 'datetime') && (k === 'date' || k === 'datetime') ? 'datetime' : 'string';
  }
  return t || 'string';
}
function toTable(p, meta, o) {
  const src = p.rows;
  if (o.fillMerged) for (const m of p.merges) {
    const rg = parseRange(m); if (!rg) continue;
    const v = src[rg.s.r]?.[rg.s.c];
    for (let r = rg.s.r; r <= rg.e.r; r++) for (let c = rg.s.c; c <= rg.e.c; c++) (src[r] || (src[r] = []))[c] = v;
  }
  const width = p.maxC + 1, aoa = [];
  for (let r = 0; r < src.length; r++) {
    const row = src[r];
    const empty = !row || row.every(v => v == null || v === '');
    if (empty && (o.skipEmpty !== false || !aoa.length)) continue;
    const dense = new Array(width);
    for (let c = 0; c < width; c++) dense[c] = row && row[c] !== undefined ? row[c] : null;
    aoa.push(dense);
  }
  const range = width > 0 && src.length ? `A1:${colName(width - 1)}${src.length}` : '';
  const base = { name: meta.name, merges: p.merges, range, hidden: meta.hidden };
  if (o.maxRows && aoa.length > o.maxRows + (o.header !== false ? 1 : 0)) aoa.length = o.maxRows + (o.header !== false ? 1 : 0);
  if (o.header === false) return { ...base, rows: aoa, columns: Array.from({ length: width }, (_, i) => ({ key: i, title: colName(i), type: inferType(aoa.map(r => r[i])) })) };
  const head = aoa.shift() || [];
  let w = width;
  while (w > 0 && (head[w - 1] == null || head[w - 1] === '') && aoa.every(r => r[w - 1] == null || r[w - 1] === '')) w--;
  const keys = uniqueKeys(Array.from({ length: w }, (_, i) => { const h = head[i]; return h instanceof Date ? date.toISODate(h) : h; }));
  const rows = aoa.map(r => { const obj = {}; for (let i = 0; i < w; i++) obj[keys[i]] = r[i]; return obj; });
  return { ...base, rows, columns: keys.map((k, i) => ({ key: k, title: k, type: inferType(aoa.map(r => r[i])) })) };
}

/** Read an .xlsx workbook. */
async function read(input, opts = {}) {
  const o = { header: true, skipEmpty: true, ...opts };
  const entries = await O.zip.read(input);
  const map = new Map(entries.map(e => [e.name.replace(/^\/+/, '').toLowerCase(), e]));
  const get = async p => { const e = map.get(String(p).toLowerCase()); return e ? e.text() : null; };
  const root = rels(await get('_rels/.rels'), '');
  const wbPath = (root.find(r => /\/officeDocument$/.test(r.type)) || {}).target || 'xl/workbook.xml';
  const wbXml = await get(wbPath);
  if (!wbXml) throw new Error('xlsx: workbook not found — not an Excel .xlsx file');
  const dir = wbPath.slice(0, wbPath.lastIndexOf('/') + 1);
  const wbRels = rels(await get(dir + '_rels/' + wbPath.slice(dir.length) + '.rels'), dir);
  const date1904 = /<(?:\w+:)?workbookPr\b[^>]*\bdate1904="(?:1|true)"/.test(wbXml);
  const metas = tags(wbXml, 'sheet').map(a => ({ name: a.name, rid: a.id, hidden: a.state === 'hidden' || a.state === 'veryHidden' }));
  const relOf = type => wbRels.find(r => r.type.endsWith('/' + type));
  const sst = parseSST(relOf('sharedStrings') ? await get(relOf('sharedStrings').target) : null);
  const dateXf = parseStyles(relOf('styles') ? await get(relOf('styles').target) : null);
  const want = o.sheet, sheets = [];
  for (let i = 0; i < metas.length; i++) {
    const m = metas[i];
    if (want != null && !(isNum(want) ? want === i : String(want).toLowerCase() === String(m.name).toLowerCase())) continue;
    const rel = wbRels.find(r => r.id === m.rid);
    if (!rel || !rel.type.endsWith('/worksheet')) continue;
    const xml = await get(rel.target);
    if (xml == null) continue;
    sheets.push(toTable(parseSheet(xml, sst, dateXf, date1904), m, o));
  }
  if (want != null && !sheets.length) throw new Error(`xlsx: sheet "${want}" not found`);
  return { sheets, sheetNames: metas.map(m => m.name) };
}

O.xlsx = { write, read, colName, colIndex, toSerial, fromSerial, MIME, isDateFormat };
