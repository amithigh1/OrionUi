// @deps csv, xlsx, pdf
/* Export helpers — one call to download data as CSV, TSV, Excel, PDF report, JSON or HTML (data package).
 *
 *   O.export.csv(rows, { columns, filename, delimiter, bom: true, eol, quote, safe, header, raw })          -> Promise<Blob>
 *   O.export.tsv(rows, opts)
 *   O.export.xlsx(rows | [{ name, rows, columns }], { columns, filename, sheetName, title, titleRow, rtl, ...O.xlsx options })
 *   O.export.pdf(rows, { columns, title, subtitle, orientation: 'auto'|'portrait'|'landscape', size: 'A4', filename, logo,
 *                        author, fontSize, totals: true | { key: value }, zebra, margin, footerText })  (report layout;
 *                        totals: true sums columns typed number/integer/currency or flagged column.total = true)
 *   O.export.json(rows, { columns, filename, space: 2, raw: true, keys: 'key'|'title', ndjson })
 *   O.export.html(rows, { columns, title, subtitle, filename })     standalone, print-friendly HTML document
 *   O.export.clipboard(rows, opts) -> Promise<string>               tab-separated text (pastes into Excel/Sheets)
 *   O.export.to(format, rows, opts) · O.export.tableHTML(rows, opts) -> string · O.export.columns(rows, columns)
 *   O.export.format(value, column, row) -> display string
 * Every helper accepts columns [{ key ('a.b' dot path or fn), title, type, format(value, row), width, align, currency,
 * decimals, value(row) }] (defaults to the keys of the first rows), triggers a download (core download()) and resolves
 * with the Blob; pass { download: false } to only get the Blob. filename may contain {date} -> 2026-09-11.
 */

i18n.add('en', {
  export: {
    generated: 'Generated {date}', page: 'Page {page} of {pages}', records: { one: '{count} record', other: '{count} records' },
    total: 'Total', report: 'Report', sheet: 'Sheet1', copied: { one: '{count} row copied', other: '{count} rows copied' },
  },
});

const NUMERIC = new Set(['number', 'integer', 'currency', 'percent']);
const yieldUI = () => new Promise(r => (globalThis.scheduler?.yield ? globalThis.scheduler.yield().then(r) : setTimeout(r, 0)));
/** 'firstName' -> 'First name', 'user.email_address' -> 'User email address' */
const humanize = k => cap(String(k).replace(/[._-]+/g, ' ').replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim().toLowerCase());

/** Normalize columns (or derive them from the rows). */
function columnsOf(rows, columns) {
  if (columns && columns.length) {
    return columns.filter(c => c && !c.hidden && c.export !== false).map((c, i) => {
      if (isStr(c)) return { key: c, title: humanize(c) };
      const key = c.key ?? c.field ?? c.name ?? i;
      return { ...c, key, title: c.title ?? c.label ?? c.header ?? (isStr(key) ? humanize(key) : '') };
    });
  }
  const keys = new Set(), list = toArr(rows);
  for (let i = 0; i < Math.min(list.length, 100); i++) if (isObj(list[i])) Object.keys(list[i]).forEach(k => keys.add(k));
  if (!keys.size && Array.isArray(list[0])) return list[0].map((_, i) => ({ key: i, title: O.xlsx ? O.xlsx.colName(i) : String(i + 1) }));
  return [...keys].map(k => ({ key: k, title: humanize(k) }));
}
const valueOf = (row, c) => (isFn(c.value) ? c.value(row) : getPath(row, c.key));
/** Display text for a value (column.format wins, then column.type). */
function format(v, c = {}, row) {
  if (isFn(c.format)) { const r = c.format(v, row); return r == null ? '' : r instanceof SafeHTML ? String(r).replace(/<[^>]*>/g, '') : String(r); }
  if (v == null || v === '') return '';
  switch (c.type) {
    case 'number': return fmt.number(v, c.decimals ?? { maximumFractionDigits: 2 });
    case 'integer': return fmt.number(v, 0);
    case 'currency': return fmt.currency(v, c.currency);
    case 'percent': return fmt.percent(v, c.decimals ?? 0);
    case 'date': return fmt.date(v, c.dateFormat || 'medium');
    case 'datetime': return fmt.datetime(v);
    case 'time': return fmt.time(v);
    case 'boolean': return v ? t('common.yes') : t('common.no');
  }
  if (v instanceof Date) return v.getHours() || v.getMinutes() ? fmt.datetime(v) : fmt.date(v);
  if (typeof v === 'number') return fmt.number(v, { maximumFractionDigits: 6, useGrouping: false });
  if (typeof v === 'boolean') return v ? t('common.yes') : t('common.no');
  if (Array.isArray(v)) return v.map(x => (isObj(x) ? x.label ?? x.name ?? JSON.stringify(x) : x)).join(', ');
  if (isObj(v)) return v.label ?? v.name ?? JSON.stringify(v);
  return String(v);
}
const isNumCol = (c, rows) => NUMERIC.has(c.type) || (!c.type && !isFn(c.format) && rows.slice(0, 50).some(r => typeof valueOf(r, c) === 'number') && rows.slice(0, 50).every(r => { const v = valueOf(r, c); return v == null || v === '' || typeof v === 'number'; }));
function fileName(name, ext) {
  let n = String(name || 'export').replace(/\{date\}/g, date.toISODate(new Date())).replace(/[\\/:*?"<>|]+/g, '-').trim() || 'export';
  if (!n.toLowerCase().endsWith('.' + ext)) n += '.' + ext;
  return n;
}
function finish(blob, o, ext) { if (o.download !== false) download(blob, fileName(o.filename, ext)); return blob; }

/* ── CSV / TSV ────────────────────────────────────────────────────────── */
async function toCSV(rows, opts = {}) {
  const o = { bom: true, delimiter: ',', eol: '\r\n', ...opts };
  const list = toArr(rows), cols = columnsOf(list, o.columns);
  const cc = cols.map(c => ({
    key: row => {
      const v = valueOf(row, c);
      if (!o.raw && isFn(c.format)) return format(v, c, row);
      if (c.type === 'boolean' && v != null && v !== '') return v ? t('common.yes') : t('common.no');
      return v;
    },
    title: c.title,
  }));
  const parts = [], step = 10000;
  for (let i = 0; i === 0 || i < list.length; i += step) {
    const s = O.csv.stringify(list.slice(i, i + step), { ...o, columns: cc, header: o.header !== false && i === 0, bom: false });
    if (s) parts.push(s);
    o.onProgress?.(Math.min(1, (i + step) / Math.max(1, list.length)));
    if (i + step < list.length) await yieldUI();
  }
  return (o.bom ? '\u{FEFF}' : '') + parts.join(o.eol) + o.eol;
}
async function exportCSV(rows, opts = {}) {
  const tsv = opts.delimiter === '\t';
  const text = await toCSV(rows, opts);
  return finish(new Blob([text], { type: (tsv ? 'text/tab-separated-values' : 'text/csv') + ';charset=utf-8' }), { filename: tsv ? 'export.tsv' : 'export.csv', ...opts }, tsv ? 'tsv' : 'csv');
}

/* ── Excel ────────────────────────────────────────────────────────────── */
function xlsxColumns(rows, columns, o) {
  return columnsOf(rows, columns).map(c => {
    const typed = !!c.type;
    return {
      key: c.key, title: c.title, width: c.xlsxWidth ?? (isNum(c.width) && c.width > 40 ? Math.round(c.width / 7) : undefined),
      type: c.type === 'time' ? 'time' : c.type, currency: c.currency, decimals: c.decimals, wrap: c.wrap, hidden: c.hidden,
      format: c.numFmt || (isStr(c.format) ? c.format : undefined),
      value: row => { const v = valueOf(row, c); return !typed && isFn(c.format) && !o.raw ? format(v, c, row) : v; },
    };
  });
}
async function exportXLSX(input, opts = {}) {
  const o = { filename: opts.title ? opts.title : 'export', ...opts };
  const list = isObj(input) && Array.isArray(input.sheets) ? input.sheets : toArr(input);
  const multi = list.length > 0 && list.every(s => isObj(s) && Array.isArray(s.rows) && (isStr(s.name) || Array.isArray(s.columns)));
  const sheets = multi ? list.map(s => ({ ...s, columns: xlsxColumns(s.rows, s.columns ?? o.columns, o) }))
    : [{ name: o.sheetName || (o.title ? String(o.title).slice(0, 31) : t('export.sheet')), rows: list, columns: xlsxColumns(list, o.columns, o) }];
  const { filename, download: _d, columns: _c, ...rest } = o;
  const blob = await O.xlsx.write(sheets, { ...rest, creator: o.author || o.creator || 'Orion Admin' });
  return finish(blob, o, 'xlsx');
}

/* ── PDF report ───────────────────────────────────────────────────────── */
function primaryColor() {
  const c = O.theme?.get?.('primary');
  return c && O.color.parse(c) ? c : '#4F46E5';
}
async function exportPDF(rows, opts = {}) {
  const o = { filename: opts.title || 'report', orientation: 'auto', size: 'A4', fontSize: 8.5, margin: 36, zebra: true, ...opts };
  const list = toArr(rows), cols = columnsOf(list, o.columns);
  const accent = o.color || primaryColor(), muted = '#64748B';
  let orientation = o.orientation;
  if (orientation === 'auto') {
    const PDF = O.PDF, step = Math.max(1, Math.floor(list.length / 200)), size = o.fontSize;
    let natural = 0;
    for (const c of cols) {
      let w = PDF.measure(c.title, { size, bold: true });
      for (let i = 0; i < list.length; i += step) w = Math.max(w, PDF.measure(format(valueOf(list[i], c), c, list[i]), { size }));
      natural += Math.min(w, 220) + 12;
    }
    const [pw] = PDF.sizes[String(o.size).toLowerCase()] || PDF.sizes.a4;
    orientation = natural > pw - o.margin * 2 ? 'landscape' : 'portrait';
  }
  const title = o.title || '', generated = t('export.generated', { date: fmt.datetime(new Date()) });
  const footerText = o.footerText ?? title;
  const pdf = new O.PDF({
    size: o.size, orientation, margin: o.margin, title: title || o.filename, author: o.author, subject: o.subject, creator: 'Orion Admin', compress: o.compress,
    header: (p, info) => {
      if (info.page === 1 || !title) return;
      p.text(title, info.margin.left, info.margin.top - 20, { size: 8, bold: true, color: muted, maxWidth: info.width - info.margin.left - info.margin.right, maxLines: 1 });
    },
    footer: (p, info) => {
      const y = info.height - info.margin.bottom + 14, x2 = info.width - info.margin.right;
      p.line(info.margin.left, y - 6, x2, y - 6, { color: '#E2E8F0', width: 0.5 });
      if (footerText) p.text(footerText, info.margin.left, y, { size: 7.5, color: muted, maxWidth: (x2 - info.margin.left) * 0.6, maxLines: 1 });
      p.text(t('export.page', { page: info.page, pages: info.pages }), x2, y, { size: 7.5, color: muted, align: 'right' });
    },
  });
  const m = pdf.margin, right = pdf.width - m.right;
  let x = m.left, y = m.top, blockH = 0;
  if (o.logo) {
    try {
      const img = await O.PDF.loadImage(o.logo);
      pdf.image(img, x, y, { height: o.logoHeight || 30 });
      if (pdf.lastImage) { x += pdf.lastImage.width + 12; blockH = pdf.lastImage.height; }
    } catch (e) { console.warn('[Orion] export.pdf: logo not loaded', e); }
  }
  const metaW = 160, textW = right - x - metaW - 12;
  if (title) { pdf.text(title, x, y, { size: 17, bold: true, color: '#0F172A', maxWidth: textW, maxLines: 2 }); y += pdf.lastText.height + 2; }
  if (o.subtitle) { pdf.text(o.subtitle, x, y, { size: 9.5, color: muted, maxWidth: textW, maxLines: 3 }); y += pdf.lastText.height; }
  pdf.text(generated, right, m.top + 1, { size: 8, color: muted, align: 'right' });
  pdf.text(t('export.records', { count: list.length }), right, m.top + 13, { size: 8, color: muted, align: 'right' });
  y = Math.max(y, m.top + blockH, m.top + 24) + 8;
  pdf.line(m.left, y, right, y, { color: accent, width: 1.25 });
  y += 10;
  let data = list, totalsRow = null;
  if (o.totals) {
    totalsRow = {};
    cols.forEach((c, i) => {
      if (isObj(o.totals) && c.key in o.totals) setPath(totalsRow, c.key, o.totals[c.key]);
      else if (o.totals === true && (c.total === true || (c.total !== false && ['number', 'integer', 'currency'].includes(c.type)))) setPath(totalsRow, c.key, list.reduce((s, r) => s + (+valueOf(r, c) || 0), 0));
      else if (i === 0) totalsRow.__label = t('export.total');
    });
    data = list.concat([totalsRow]);
  }
  const tcols = cols.map((c, i) => ({
    key: c.key, title: c.title, width: c.width && c.width <= 400 ? c.width : undefined, align: c.align || (isNumCol(c, list) ? 'right' : undefined),
    format: (v, row) => (row === totalsRow && i === 0 && row.__label && (v == null || v === '') ? row.__label : row === totalsRow && v == null ? '' : format(isFn(c.value) && row !== totalsRow ? c.value(row) : v, c, row)),
  }));
  await pdf.tableAsync({
    rows: data, columns: tcols, y, fontSize: o.fontSize, zebra: o.zebra, repeatHeader: true, borders: o.borders || 'horizontal',
    headerStyle: { fill: '#EEF2F7', color: '#0F172A', bold: true, ...(o.headerStyle || {}) },
    cellStyle: totalsRow ? (v, row) => (row === totalsRow ? { bold: true, fill: '#EEF2F7' } : null) : o.cellStyle, onProgress: o.onProgress,
  });
  return finish(await pdf.toBlob(), o, 'pdf');
}

/* ── JSON / HTML / clipboard ──────────────────────────────────────────── */
async function exportJSON(rows, opts = {}) {
  const o = { filename: 'export', space: 2, raw: true, keys: 'key', ...opts };
  let data = toArr(rows);
  if (o.columns) {
    const cols = columnsOf(data, o.columns);
    data = data.map(r => {
      const out = {};
      for (const c of cols) {
        const v = valueOf(r, c), val = o.raw ? v : format(v, c, r);
        if (o.keys === 'title') out[c.title] = val; else if (isStr(c.key)) setPath(out, c.key, val); else out[c.title || c.key] = val;
      }
      return out;
    });
  }
  const text = o.ndjson ? data.map(d => JSON.stringify(d)).join('\n') + '\n' : JSON.stringify(data, null, o.space);
  return finish(new Blob([text], { type: o.ndjson ? 'application/x-ndjson' : 'application/json' }), o, o.ndjson ? 'ndjson' : 'json');
}
/** HTML <table> markup for rows (escaped). */
function tableHTML(rows, opts = {}) {
  const list = toArr(rows), cols = columnsOf(list, opts.columns), nums = cols.map(c => isNumCol(c, list));
  const cls = opts.tableClass ?? 'o-table';
  return `<table${cls ? ` class="${esc(cls)}"` : ''}><thead><tr>${cols.map((c, i) => `<th scope="col"${nums[i] ? ' class="o-num"' : ''}>${esc(c.title)}</th>`).join('')}</tr></thead><tbody>` +
    list.map(r => `<tr>${cols.map((c, i) => { const s = format(valueOf(r, c), c, r); return `<td${nums[i] ? ' class="o-num"' : ''}>${s ? `<bdi>${esc(s).replace(/\n/g, '<br>')}</bdi>` : ''}</td>`; }).join('')}</tr>`).join('') + '</tbody></table>';
}
async function exportHTML(rows, opts = {}) {
  const o = { filename: opts.title || 'export', ...opts };
  const list = toArr(rows), dir = isBrowser ? dirOf(doc.documentElement) : 'ltr';
  const css = 'body{margin:24px;font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#0f172a;background:#fff}' +
    'h1{font-size:20px;margin:0 0 4px}.meta{color:#64748b;font-size:12px;margin:0 0 16px}table{width:100%;border-collapse:collapse}' +
    'th,td{padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:start;vertical-align:top}th{background:#f1f5f9;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#475569}' +
    'tbody tr:nth-child(even) td{background:#f8fafc}.o-num{text-align:end;font-variant-numeric:tabular-nums}@media print{body{margin:0}thead{display:table-header-group}tr{break-inside:avoid}}';
  const meta = [o.subtitle, t('export.generated', { date: fmt.datetime(new Date()) }), t('export.records', { count: list.length })].filter(Boolean).map(esc).join(' &middot; ');
  const html = `<!doctype html>\n<html lang="${esc(i18n.locale)}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(o.title || 'Export')}</title><style>${css}</style></head><body>${o.title ? `<h1>${esc(o.title)}</h1>` : ''}<p class="meta">${meta}</p>${tableHTML(list, { ...o, tableClass: '' })}</body></html>\n`;
  return finish(new Blob([html], { type: 'text/html;charset=utf-8' }), o, 'html');
}
async function clipboard(rows, opts = {}) {
  const text = (await toCSV(rows, { delimiter: '\t', bom: false, safe: false, quote: 'auto', ...opts, raw: opts.raw ?? false })).replace(/\r\n$/, '');
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0;pointer-events:none', 'aria-hidden': 'true' });
    ta.value = text; doc.body.appendChild(ta); ta.select();
    try { doc.execCommand('copy'); } finally { ta.remove(); }
  }
  announce(t('export.copied', { count: toArr(rows).length }));
  return text;
}
const FORMATS = {
  csv: exportCSV, tsv: (r, o) => exportCSV(r, { ...o, delimiter: '\t' }), xlsx: exportXLSX, excel: exportXLSX,
  pdf: exportPDF, json: exportJSON, html: exportHTML, clipboard,
};
O.export = {
  csv: exportCSV, tsv: FORMATS.tsv, xlsx: exportXLSX, pdf: exportPDF, json: exportJSON, html: exportHTML, clipboard,
  /** to('xlsx', rows, opts) */
  to(formatName, rows, opts) { const fn = FORMATS[String(formatName).toLowerCase()]; if (!fn) throw new Error(`export: unknown format "${formatName}"`); return fn(rows, opts); },
  formats: Object.keys(FORMATS), columns: columnsOf, format, tableHTML, toCSV, humanize,
};
