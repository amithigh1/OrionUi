// @deps csv, xlsx
/* Import — read CSV / TSV / Excel / JSON files and a guided import wizard (data package).
 *
 *   O.importFile(file | Blob | string, { columns, sheet, header: true, delimiter, encoding, dynamicTyping, onProgress, signal })
 *     -> Promise<{ rows, fields, sheets: [{ name, rows, fields }], sheet, format, mapping, errors }>
 *     format is detected from the content (ZIP -> xlsx, JSON, NDJSON, else CSV/TSV with delimiter sniffing).
 *     With `columns`, fields are auto-mapped (key, title, aliases, fuzzy) and values are converted to the column types.
 *   Orion.importWizard({ columns: [{ key, title, required, type, aliases, options, unique, format, example, validate(value, row) }],
 *                        accept: '.csv,.tsv,.txt,.xlsx,.json', maxRows, maxSize: 10 MB, title, onImport: async (rows, { progress, signal }) => {},
 *                        batchSize, skipInvalid: true, allowPaste: true, template: true, texts, container: 'auto' | 'dialog' })
 *     -> Promise<importedRows | null>
 *     Steps: Upload (drag & drop / browse / paste) -> Sheet -> Map columns -> Review (errors highlighted, fix inline,
 *     skip invalid rows) -> Import (progress, cancel) -> Summary (download skipped rows).
 *   O.importer.autoMap(fields, columns) · O.importer.coerce(value, column) -> { value, error }
 * column.type: 'string' | 'number' | 'integer' | 'currency' | 'percent' | 'boolean' | 'date' | 'datetime' | 'email' | 'url' | 'phone'
 */

i18n.add('en', {
  importer: {
    title: 'Import data', upload: 'Upload', sheet: 'Sheet', map: 'Map columns', review: 'Review', import: 'Import', done: 'Done',
    stepOf: 'Step {n} of {total}: {name}',
    dropTitle: 'Drag & drop a file here', dropOr: 'or', browse: 'browse files', dropHint: 'CSV, Excel (.xlsx) or JSON · up to {size}',
    dropLabel: 'Choose a file to import', paste: 'Paste data instead', pasteLabel: 'Pasted rows', pastePlaceholder: 'Paste rows copied from Excel or a CSV file, including the header row…',
    usePasted: 'Use pasted data', template: 'Download a CSV template', reading: 'Reading {name}…', pasted: 'Pasted data',
    unsupported: 'This file type is not supported. Use CSV, Excel (.xlsx) or JSON.', tooLarge: 'The file is too large (maximum {size}).',
    empty: 'No rows were found in this file.', xls: 'Legacy .xls files are not supported. Save the file as .xlsx or CSV and try again.',
    readError: 'The file could not be read: {message}', chooseSheet: 'Choose the sheet to import', sheetInfo: '{rows} rows · {cols} columns',
    fileInfo: '{name} · {rows}', rows: { one: '{count} row', other: '{count} rows' }, mapIntro: 'Match the columns of your file to the fields. Columns set to “Don’t import” are ignored.',
    sourceColumn: 'Column in file', sample: 'Sample values', targetField: 'Import as', ignore: 'Don’t import', mapAs: 'Import “{name}” as',
    auto: 'Auto', unmapped: 'Required fields not mapped: {fields}', swapped: '{field} is now mapped to {column}',
    validRows: { one: '{count} valid row', other: '{count} valid rows' }, errorsIn: '{errors} errors in {rows} rows', noErrors: 'No errors found',
    onlyErrors: 'Only rows with errors', skipInvalid: 'Skip invalid rows', showing: 'Showing {shown} of {total} rows', row: 'Row',
    fixHint: 'Select a highlighted cell to fix its value.', edit: 'Edit value', cellError: 'Error: {message}',
    maxRows: 'Only the first {count} rows will be imported.', blockInvalid: 'Fix the errors or turn on “Skip invalid rows”.',
    importRows: { one: 'Import {count} row', other: 'Import {count} rows' }, importing: 'Importing {done} of {total} rows…', validating: 'Checking rows…',
    imported: { one: '{count} row imported', other: '{count} rows imported' }, skipped: { one: '{count} invalid row was skipped.', other: '{count} invalid rows were skipped.' },
    allImported: 'All rows were imported successfully.', downloadSkipped: 'Download skipped rows', another: 'Import another file',
    failed: 'Import failed', cancelled: 'Import cancelled', errorColumn: 'Errors',
    required: 'This field is required', invalid: 'Not a valid {type}', notAllowed: 'Not an allowed value', duplicate: 'Duplicate value',
    types: { number: 'number', integer: 'whole number', currency: 'amount', percent: 'percentage', boolean: 'yes/no value', date: 'date', datetime: 'date and time', email: 'email address', url: 'URL', phone: 'phone number' },
  },
});

const yieldUI = () => new Promise(r => (globalThis.scheduler?.yield ? globalThis.scheduler.yield().then(r) : setTimeout(r, 0)));
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u{300}-\u{36F}]/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const colTitle = c => c.title ?? c.label ?? c.key;
const isBlank = v => v == null || (typeof v === 'string' && !v.trim());

/* ── mapping & conversion ─────────────────────────────────────────────── */
/** autoMap(fields, columns) -> { [field]: columnKey | null } (greedy best matches, each column used once) */
function autoMap(fields, columns) {
  const cands = [];
  fields.forEach((f, fi) => {
    const nf = norm(f);
    if (!nf) return;
    columns.forEach(c => {
      let best = 0;
      for (const name of [c.key, colTitle(c), ...(c.aliases || [])]) {
        const n = norm(name);
        if (!n) continue;
        let s = 0;
        if (n === nf) s = 100;
        else if (Math.min(n.length, nf.length) >= 3 && (nf.includes(n) || n.includes(nf))) s = 70 + 20 * Math.min(n.length, nf.length) / Math.max(n.length, nf.length);
        else if (n.length >= 3) { const m = fuzzy(n, nf); if (m && n.length / nf.length >= 0.3) s = Math.min(60, 25 + m.score * 1.5); }
        if (s > best) best = s;
      }
      if (best >= 45) cands.push({ f, fi, key: c.key, s: best });
    });
  });
  cands.sort((a, b) => b.s - a.s || a.fi - b.fi);
  const map = {}, used = new Set();
  fields.forEach(f => { map[f] = null; });
  for (const c of cands) if (map[c.f] == null && !used.has(c.key)) { map[c.f] = c.key; used.add(c.key); }
  return map;
}
const TRUE = new Set(['true', 'yes', 'y', '1', 'x', 'on', 't', 'ja', 'si', 'oui', 'ya']), FALSE = new Set(['false', 'no', 'n', '0', 'off', 'f', 'nein', 'non', 'tidak']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** coerce(value, column) -> { value, error } — converts text to the column type and validates it. */
function coerce(v, c) {
  const ty = c.type || 'string', typeName = t('importer.types.' + ty, { default: ty });
  if (isBlank(v)) return { value: c.default ?? null, error: c.required && c.default == null ? t('importer.required') : null };
  if (typeof v === 'string' && /^'[=+\-@\t\r]/.test(v)) v = v.slice(1); // undo the CSV formula-injection guard
  let out = v, bad = false;
  switch (ty) {
    case 'number': case 'integer': case 'currency': case 'decimal': case 'float': case 'percent': {
      if (typeof v === 'number') out = v;
      else {
        let s = String(v).trim(), neg = false;
        if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
        const pct = /%\s*$/.test(s);
        const n = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(s) ? +s : /\d/.test(s) && !/[a-df-z]/i.test(s.replace(/[\p{Sc}]|[A-Z]{3}/gu, '')) ? fmt.parseNumber(s) : null;
        if (n == null || Number.isNaN(n)) bad = true; else out = (neg ? -n : n) / (pct && ty === 'percent' ? 100 : 1);
      }
      if (!bad && ty === 'integer' && !Number.isInteger(out)) bad = true;
      if (!bad && c.min != null && out < c.min) return { value: out, error: t('validation.min', { min: c.min }) };
      if (!bad && c.max != null && out > c.max) return { value: out, error: t('validation.max', { max: c.max }) };
      break;
    }
    case 'boolean': {
      if (typeof v === 'boolean') break;
      const s = String(v).trim().toLowerCase();
      if (TRUE.has(s)) out = true; else if (FALSE.has(s)) out = false; else bad = true;
      break;
    }
    case 'date': case 'datetime': {
      if (v instanceof Date) { bad = Number.isNaN(+v); break; }
      if (typeof v === 'number') { out = v > 20000 && v < 80000 && O.xlsx ? O.xlsx.fromSerial(v) : new Date(v); break; }
      const s = String(v).trim();
      out = (c.format && date.parse(s, c.format)) || date.parse(s);
      if (!out || Number.isNaN(+out)) {
        const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
        const pat = date.localePattern();
        if (m) out = date.parseFormat(s.replace(/[.-]/g, '/'), (pat.startsWith('DD') ? 'D/M/' : 'M/D/') + (m[3].length === 2 ? 'YY' : 'YYYY'));
      }
      bad = !out || Number.isNaN(+out);
      if (!bad && ty === 'date') out.setHours(0, 0, 0, 0);
      break;
    }
    case 'email': out = String(v).trim(); bad = !EMAIL.test(out); break;
    case 'url': {
      out = String(v).trim();
      try { const u = new URL(/^[a-z][\w+.-]*:/i.test(out) ? out : 'https://' + out); bad = !/^https?:$/.test(u.protocol) || !u.hostname.includes('.'); } catch { bad = true; }
      break;
    }
    case 'phone': out = String(v).trim(); bad = !/^\+?[\d\s().-]{6,20}$/.test(out) || (out.match(/\d/g) || []).length < 6; break;
    default: out = v instanceof Date ? date.toISODate(v) : typeof v === 'string' ? v.trim() : String(v);
  }
  if (bad) return { value: v, error: t('importer.invalid', { type: typeName }) };
  if (c.options) {
    const opts = toArr(c.options).map(x => (isObj(x) ? x : { value: x, label: x }));
    const hit = opts.find(x => String(x.value).toLowerCase() === String(out).toLowerCase() || String(x.label).toLowerCase() === String(out).toLowerCase());
    if (!hit) return { value: out, error: t('importer.notAllowed') };
    out = hit.value;
  }
  if (c.maxLength && String(out).length > c.maxLength) return { value: out, error: t('validation.maxLength', { max: c.maxLength }) };
  if (c.pattern && !new RegExp(c.pattern).test(String(out))) return { value: out, error: t('validation.pattern') };
  return { value: out, error: null };
}
/** Map + convert + validate raw rows. Returns { rows, errors: Map(index -> { key: message }), invalid: Set(index) } */
async function validateRows(raw, mapping, columns, { onProgress } = {}) {
  const pairs = Object.entries(mapping).filter(([, k]) => k != null).map(([f, k]) => [f, columns.find(c => c.key === k)]).filter(p => p[1]);
  const mappedKeys = new Set(pairs.map(p => p[1].key));
  const missing = columns.filter(c => !mappedKeys.has(c.key));
  const rows = new Array(raw.length), errors = new Map(), invalid = new Set(), seen = new Map();
  const uniques = columns.filter(c => c.unique);
  uniques.forEach(c => seen.set(c.key, new Map()));
  for (let i = 0; i < raw.length; i++) {
    const src = raw[i], row = {}, errs = {};
    for (const [f, c] of pairs) { const r = coerce(src[f], c); setPath(row, c.key, r.value); if (r.error) errs[c.key] = r.error; }
    for (const c of missing) { if (c.default != null) setPath(row, c.key, c.default); else if (c.required) errs[c.key] = t('importer.required'); }
    for (const c of columns) {
      if (errs[c.key] || !isFn(c.validate)) continue;
      const v = getPath(row, c.key);
      const res = c.validate(v, row);
      if (res === false) errs[c.key] = t('validation.invalid'); else if (isStr(res) && res) errs[c.key] = res;
    }
    for (const c of uniques) {
      const v = getPath(row, c.key);
      if (isBlank(v)) continue;
      const k = String(v).toLowerCase(), m = seen.get(c.key);
      if (m.has(k)) { errs[c.key] = t('importer.duplicate'); } else m.set(k, i);
    }
    rows[i] = row;
    if (Object.keys(errs).length) { errors.set(i, errs); invalid.add(i); }
    if ((i & 1023) === 1023) { onProgress?.(i / raw.length); await yieldUI(); }
  }
  return { rows, errors, invalid };
}

/* ── file reading ─────────────────────────────────────────────────────── */
function flatten(obj, prefix = '', out = {}, depth = 0) {
  for (const k of Object.keys(obj)) {
    const v = obj[k], key = prefix ? prefix + '.' + k : k;
    if (isPlainObj(v) && depth < 3) flatten(v, key, out, depth + 1); else out[key] = v;
  }
  return out;
}
function fieldsOf(rows) { const s = new Set(); for (let i = 0; i < Math.min(rows.length, 500); i++) if (isObj(rows[i])) Object.keys(rows[i]).forEach(k => s.add(k)); return [...s]; }
function jsonRows(text) {
  const s = text.replace(/^\u{FEFF}/u, '').trim();
  let data;
  try { data = JSON.parse(s); }
  catch { data = s.split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l)); }
  if (isObj(data)) data = [data.data, data.rows, data.items, data.records, data.results, ...Object.values(data)].find(Array.isArray) || [data];
  data = toArr(data);
  if (Array.isArray(data[0])) { const [head, ...body] = data; return body.map(r => Object.fromEntries(head.map((hh, i) => [String(hh), r[i] ?? null]))); }
  return data.filter(isObj).map(r => flatten(r));
}
/** Read a file (or CSV text) into rows. */
async function importFile(file, opts = {}) {
  const o = { header: true, ...opts };
  if (file == null) throw new Error('importFile: no file');
  let format = o.format, sheets;
  const name = file.name || '', ext = (/\.([a-z0-9]+)$/i.exec(name) || [])[1]?.toLowerCase() || '';
  const base = name.replace(/\.[^.]+$/, '') || t('importer.pasted');
  if (isStr(file)) format = format || (/^\s*[[{]/.test(file) ? 'json' : 'csv');
  else if (!format) {
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) format = 'xlsx';
    else if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) format = 'xls';
    else if (['json', 'ndjson', 'jsonl'].includes(ext)) format = 'json';
    else if (['xlsx', 'xlsm'].includes(ext)) format = 'xlsx';
    else if (ext === 'xls') format = 'xls';
    else {
      const peek = new TextDecoder().decode(await file.slice(0, 64).arrayBuffer()).replace(/^\u{FEFF}/u, '');
      format = /^\s*[[{]/.test(peek) ? 'json' : 'csv';
    }
  }
  if (format === 'xls') throw Object.assign(new Error(t('importer.xls')), { code: 'xls' });
  if (format === 'xlsx') {
    const wb = await O.xlsx.read(file, { header: o.header, fillMerged: o.fillMerged });
    sheets = wb.sheets.map(s => ({ name: s.name, rows: s.rows, fields: s.columns.map(c => c.key), hidden: s.hidden }));
  } else if (format === 'json') {
    const text = isStr(file) ? file : await file.text();
    const rows = jsonRows(text);
    sheets = [{ name: base, rows, fields: fieldsOf(rows) }];
  } else {
    const res = await O.csv.parseAsync(file, { header: o.header, delimiter: o.delimiter || 'auto', encoding: o.encoding, dynamicTyping: o.dynamicTyping, skipEmpty: 'greedy', trim: o.trim, onProgress: o.onProgress, signal: o.signal, maxRows: o.maxRows });
    sheets = [{ name: base, rows: res.rows, fields: res.fields, errors: res.errors, delimiter: res.meta.delimiter }];
  }
  const want = o.sheet;
  const sheet = (want != null && sheets.find((s, i) => (isNum(want) ? i === want : s.name === want))) || sheets.find(s => s.rows.length && !s.hidden) || sheets[0] || { name: base, rows: [], fields: [] };
  const result = { rows: sheet.rows, fields: sheet.fields, sheets, sheet: sheet.name, format, mapping: null, errors: sheet.errors || [] };
  if (o.columns?.length) {
    const cols = o.columns.map(c => (isStr(c) ? { key: c, title: c } : c));
    result.mapping = o.mapping || autoMap(sheet.fields, cols);
    const v = await validateRows(sheet.rows, result.mapping, cols);
    result.rows = v.rows;
    result.errors = [...v.errors].flatMap(([row, errs]) => Object.entries(errs).map(([key, message]) => ({ row, key, message })));
  }
  return result;
}

/* ── wizard ───────────────────────────────────────────────────────────── */
const PREVIEW = 200;
function openShell(title, panel, labelId, onDismiss, o) {
  if (o.container !== 'dialog' && isFn(O.modal)) {
    try {
      let mine = false, done = false;
      const dismiss = () => { if (!mine && !done) { done = true; onDismiss(); } };
      const handle = O.modal({ title, content: panel, body: panel, size: 'xl', onClose: dismiss, onHide: dismiss });
      if (panel.isConnected && handle && (isFn(handle.close) || isFn(handle.hide))) {
        const root = panel.closest('[role="dialog"], dialog, .o-modal') || panel.parentElement;
        const off = on(root, 'o-close o-closed o-hide close', e => { if (e.target === root || e.type === 'close') dismiss(); });
        panel.classList.add('is-in-modal');
        return { el: root, setEscape: noop, close() { mine = true; off(); (handle.close || handle.hide).call(handle); } };
      }
      if (handle && isFn(handle.close)) handle.close();
    } catch (e) { console.warn('[Orion] importWizard: Orion.modal not usable, using the built-in dialog', e); }
  }
  const from = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : doc.documentElement;
  const closeBtn = h('button', { type: 'button', class: 'o-btn-close', 'aria-label': t('common.close') });
  const dialog = h('div', { class: 'o-iw', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': labelId },
    h('header', { class: 'o-iw-header' }, h('h2', { class: 'o-iw-title', id: labelId }, title), closeBtn), panel);
  const layer = h('div', { class: 'o-iw-layer' }, h('div', { class: 'o-backdrop o-iw-backdrop' }), dialog);
  portal(layer, from);
  let closing = false;
  const ov = overlays.open({ el: layer, modal: true, trap: true, lockScroll: true, outside: false, onClose: () => { layer.remove(); if (!closing) onDismiss(); } });
  closeBtn.addEventListener('click', () => ov.close('api'));
  animate(dialog, 'zoomIn', { duration: 180 });
  return { el: layer, setEscape: v => { ov.entry.escape = v; }, close() { closing = true; ov.close('api'); } };
}

function importWizard(opts = {}) {
  const o = { accept: '.csv,.tsv,.txt,.xlsx,.xlsm,.json', maxSize: 10 * 1024 * 1024, skipInvalid: true, allowPaste: true, template: true, ...opts };
  const columns = toArr(o.columns).map(c => (isStr(c) ? { key: c, title: c } : { ...c, title: colTitle(c) }));
  const tx = (key, params) => { const own = o.texts?.[key] ?? o.texts?.['importer.' + key]; return own != null ? String(own).replace(/\{(\w+)\}/g, (m, p) => params?.[p] ?? m) : t('importer.' + key, params); };
  const id = uid('iw');
  const S = { step: 'upload', file: null, sheets: [], sheetIndex: 0, fields: [], raw: [], mapping: {}, auto: new Set(), result: null, onlyErrors: false, skipInvalid: o.skipInvalid, imported: [], skipped: [], abort: null, busy: false };
  let resolveP;
  const promise = new Promise(r => { resolveP = r; });
  let settled = false;
  const settle = v => { if (settled) return; settled = true; resolveP(v); };

  // skeleton
  const steps = h('ol', { class: 'o-iw-steps', 'aria-label': tx('title') });
  const body = h('div', { class: 'o-iw-body o-scroll' });
  const info = h('div', { class: 'o-iw-info', 'aria-live': 'polite' });
  const backBtn = h('button', { type: 'button', class: 'o-btn' }, t('common.back'));
  const nextBtn = h('button', { type: 'button', class: 'o-btn o-btn-primary' }, t('common.next'));
  const footer = h('footer', { class: 'o-iw-footer' }, info, h('div', { class: 'o-iw-actions' }, backBtn, nextBtn));
  const panel = h('div', { class: 'o-iw-panel' }, steps, body, footer);
  const shell = openShell(o.title || tx('title'), panel, id + '-t', () => { S.abort?.abort(); settle(S.step === 'done' ? S.imported : null); }, o);
  const close = v => { settle(v); shell.close(); };

  const stepList = () => ['upload', ...(S.sheets.length > 1 ? ['sheet'] : []), 'map', 'review', 'import'];
  const setInfo = (text, tone) => { info.textContent = text || ''; info.className = 'o-iw-info' + (tone ? ' is-' + tone : ''); };
  function renderSteps() {
    const list = stepList(), cur = list.indexOf(S.step === 'done' ? 'import' : S.step);
    steps.replaceChildren(...list.map((s, i) => h('li', { class: cls('o-iw-step', i < cur && 'is-done', i === cur && 'is-current'), 'aria-current': i === cur ? 'step' : null },
      h('span', { class: 'o-iw-step-num', 'aria-hidden': 'true' }, i < cur ? raw(String(icon('check', { size: 14 }))) : String(i + 1)),
      h('span', { class: 'o-iw-step-label' }, tx(s)))));
  }
  function go(step) {
    S.step = step;
    renderSteps();
    body.replaceChildren();
    backBtn.hidden = step === 'import' || step === 'done';
    backBtn.textContent = step === 'upload' ? t('common.cancel') : t('common.back');
    nextBtn.hidden = false; nextBtn.disabled = false;
    setInfo('');
    ({ upload: renderUpload, sheet: renderSheet, map: renderMap, review: renderReview, import: renderImport, done: renderDone })[step]();
    body.scrollTop = 0;
    const list = stepList(), n = list.indexOf(step === 'done' ? 'import' : step) + 1;
    const head = body.querySelector('.o-iw-heading');
    if (head) { head.setAttribute('tabindex', '-1'); requestAnimationFrame(() => { if (!body.contains(doc.activeElement) || doc.activeElement === body) head.focus({ preventScroll: true }); }); }
    announce(tx('stepOf', { n, total: list.length, name: tx(step === 'done' ? 'done' : step) }));
    o.onStep?.(step);
  }
  backBtn.addEventListener('click', () => {
    if (S.step === 'upload') return close(null);
    if (S.step === 'done') return go('review');
    const list = stepList(), i = list.indexOf(S.step);
    if (i > 0) go(list[i - 1]);
  });
  nextBtn.addEventListener('click', () => nextBtn._action?.());
  const setNext = (label, action, disabled = false) => { nextBtn.textContent = label; nextBtn._action = action; nextBtn.disabled = disabled; };
  const heading = text => h('h3', { class: 'o-iw-heading' }, text);

  /* ── step: upload ── */
  async function loadFile(file) {
    const err = body.querySelector('.o-iw-error');
    const showErr = msg => { if (err) { err.hidden = false; err.querySelector('.o-alert-content').textContent = msg; } setInfo(''); };
    if (!file) return;
    if (!isStr(file)) {
      const ext = (/\.[^.]+$/.exec(file.name || '') || [''])[0].toLowerCase();
      const accepted = o.accept.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      if (file.name && accepted.length && !accepted.some(a => a === ext || (a.endsWith('/*') ? (file.type || '').startsWith(a.slice(0, -1)) : a === file.type))) return showErr(tx('unsupported'));
      if (o.maxSize && file.size > o.maxSize) return showErr(tx('tooLarge', { size: formatBytes(o.maxSize) }));
    }
    if (err) err.hidden = true;
    const prog = body.querySelector('.o-iw-reading');
    if (prog) { prog.hidden = false; prog.querySelector('.o-iw-reading-text').textContent = tx('reading', { name: file.name || tx('pasted') }); }
    S.busy = true;
    try {
      const res = await importFile(file, { onProgress: r => prog?.querySelector('.o-progress-bar')?.style.setProperty('--o-value', Math.round(r * 100) + '%') });
      const sheets = res.sheets.filter(s => s.rows.length);
      if (!sheets.length) { if (prog) prog.hidden = true; return showErr(tx('empty')); }
      S.file = file; S.sheets = sheets; S.sheetIndex = Math.max(0, sheets.findIndex(s => s.name === res.sheet));
      S.fileName = file.name || tx('pasted');
      selectSheet(S.sheetIndex);
      go(sheets.length > 1 ? 'sheet' : 'map');
    } catch (e) {
      if (prog) prog.hidden = true;
      showErr(e.code === 'xls' ? e.message : tx('readError', { message: e.message || String(e) }));
    } finally { S.busy = false; }
  }
  function selectSheet(i) {
    S.sheetIndex = i;
    const sh = S.sheets[i];
    S.raw = o.maxRows && sh.rows.length > o.maxRows ? sh.rows.slice(0, o.maxRows) : sh.rows;
    S.truncated = o.maxRows && sh.rows.length > o.maxRows;
    S.fields = sh.fields;
    S.mapping = o.mapping ? { ...autoMap(S.fields, columns), ...o.mapping } : autoMap(S.fields, columns);
    S.auto = new Set(Object.keys(S.mapping).filter(f => S.mapping[f] != null));
    S.result = null;
  }
  function renderUpload() {
    const input = h('input', { type: 'file', accept: o.accept, hidden: true, tabindex: '-1', 'aria-hidden': 'true' });
    input.addEventListener('change', () => { loadFile(input.files[0]); input.value = ''; });
    let zone;
    const UploadEl = o.container !== 'dialog' && o.upload !== false && isBrowser && customElements.get('o-upload');
    if (UploadEl) {
      zone = h('o-upload', { accept: o.accept, 'max-files': '1', class: 'o-iw-upload-el' });
      const pick = e => {
        const d = e.detail || {}, cand = [d.file, ...(toArr(d.files)), ...(toArr(d.value)), ...(toArr(zone.files)), ...(toArr(zone.value))];
        const f = cand.map(x => (x && x.file instanceof Blob ? x.file : x)).find(x => x instanceof Blob);
        if (f) loadFile(f);
      };
      ['o-change', 'o-add', 'o-select', 'o-files', 'change'].forEach(ev => zone.addEventListener(ev, pick));
    } else {
      const hintId = id + '-hint';
      zone = h('div', { class: 'o-iw-drop', role: 'button', tabindex: '0', 'aria-label': tx('dropLabel'), 'aria-describedby': hintId },
        h('span', { class: 'o-iw-drop-icon', 'aria-hidden': 'true' }, raw(String(icon('upload')))),
        h('strong', { class: 'o-iw-drop-title' }, tx('dropTitle')),
        h('span', { class: 'o-iw-drop-or' }, tx('dropOr') + ' ', h('span', { class: 'o-iw-link' }, tx('browse'))),
        h('small', { class: 'o-iw-drop-hint', id: hintId }, tx('dropHint', { size: formatBytes(o.maxSize) })), input);
      zone.addEventListener('click', () => input.click());
      zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
      zone.addEventListener('dragenter', e => { e.preventDefault(); zone.classList.add('is-dragover'); });
      zone.addEventListener('dragover', e => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; zone.classList.add('is-dragover'); });
      zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('is-dragover'); });
      zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('is-dragover'); const f = e.dataTransfer?.files?.[0]; if (f) loadFile(f); });
    }
    const nodes = [heading(tx('upload')), zone,
      h('div', { class: 'o-iw-reading', hidden: true, role: 'status' }, h('span', { class: 'o-iw-reading-text' }), h('div', { class: 'o-progress o-progress-sm' }, h('div', { class: 'o-progress-bar', style: '--o-value: 5%' }))),
      h('div', { class: 'o-alert o-alert-danger o-iw-error', role: 'alert', hidden: true }, raw(String(icon('alert-circle'))), h('div', { class: 'o-alert-content' }))];
    if (o.allowPaste) {
      const ta = h('textarea', { class: 'o-textarea o-iw-paste-input', rows: '5', placeholder: tx('pastePlaceholder'), 'aria-label': tx('pasteLabel'), spellcheck: 'false' });
      const use = h('button', { type: 'button', class: 'o-btn o-btn-sm', disabled: true }, tx('usePasted'));
      ta.addEventListener('input', () => { use.disabled = !ta.value.trim(); });
      use.addEventListener('click', () => loadFile(ta.value));
      nodes.push(h('details', { class: 'o-iw-paste' }, h('summary', null, tx('paste')), ta, h('div', { class: 'o-iw-paste-actions' }, use)));
    }
    if (o.template && columns.length) {
      const tb = h('button', { type: 'button', class: 'o-btn o-btn-link o-btn-sm o-iw-template' }, raw(String(icon('download'))), tx('template'));
      tb.addEventListener('click', () => {
        if (isStr(o.template)) return downloadURL(o.template, o.template.split('/').pop());
        const example = columns.some(c => c.example != null) ? [Object.fromEntries(columns.map(c => [c.key, c.example ?? '']))] : [];
        download(new Blob([O.csv.stringify(example, { columns: columns.map(c => ({ key: c.key, title: colTitle(c) })), bom: true }) + '\r\n'], { type: 'text/csv;charset=utf-8' }), (o.templateName || 'import-template') + '.csv');
      });
      nodes.push(tb);
    }
    body.append(...nodes);
    setNext(t('common.next'), () => zone.focus?.(), true);
    nextBtn.hidden = true;
  }

  /* ── step: sheet ── */
  function renderSheet() {
    const fs = h('fieldset', { class: 'o-iw-sheets' }, h('legend', { class: 'o-sr-only' }, tx('chooseSheet')));
    S.sheets.forEach((sh, i) => {
      const inp = h('input', { type: 'radio', name: id + '-sheet', value: String(i), checked: i === S.sheetIndex });
      inp.addEventListener('change', () => selectSheet(i));
      fs.append(h('label', { class: 'o-iw-sheet' }, inp, h('span', { class: 'o-iw-sheet-body' },
        h('span', { class: 'o-iw-sheet-name' }, h('bdi', null, sh.name)),
        h('span', { class: 'o-iw-sheet-meta' }, tx('sheetInfo', { rows: fmt.number(sh.rows.length), cols: sh.fields.length })),
        h('span', { class: 'o-iw-sheet-fields' }, h('bdi', null, sh.fields.slice(0, 8).join(', ') + (sh.fields.length > 8 ? '…' : ''))))));
    });
    body.append(heading(tx('chooseSheet')), fs);
    setNext(t('common.next'), () => go('map'));
  }

  /* ── step: map ── */
  function renderMap() {
    const list = h('div', { class: 'o-iw-map', role: 'list' });
    const alertEl = h('div', { class: 'o-alert o-alert-warning o-iw-unmapped', role: 'status', hidden: true }, raw(String(icon('alert-triangle'))), h('div', { class: 'o-alert-content' }));
    const selects = new Map();
    const refresh = () => {
      const used = new Set(Object.values(S.mapping).filter(Boolean));
      const missing = columns.filter(c => c.required && !used.has(c.key) && c.default == null);
      alertEl.hidden = !missing.length;
      alertEl.querySelector('.o-alert-content').textContent = missing.length ? tx('unmapped', { fields: fmt.list(missing.map(colTitle)) }) : '';
      nextBtn.disabled = !!missing.length || !used.size;
      selects.forEach((sel, f) => {
        [...sel.options].forEach(op => { if (op.value) op.textContent = colTitle(columns.find(c => c.key === op.value)) + (columns.find(c => c.key === op.value).required ? ' *' : '') + (used.has(op.value) && S.mapping[f] !== op.value ? ' ✓' : ''); });
        sel.closest('.o-iw-map-row').classList.toggle('is-ignored', !S.mapping[f]);
        const badge = sel.closest('.o-iw-map-row').querySelector('.o-iw-map-auto');
        badge.hidden = !(S.auto.has(f) && S.mapping[f]);
      });
    };
    S.fields.forEach(f => {
      const samples = [];
      for (let i = 0; i < S.raw.length && samples.length < 3; i++) { const v = S.raw[i]?.[f]; if (!isBlank(v)) samples.push(v instanceof Date ? fmt.date(v) : String(v)); }
      const sel = h('select', { class: 'o-select o-input-sm', 'aria-label': tx('mapAs', { name: f }) },
        h('option', { value: '' }, tx('ignore')), ...columns.map(c => h('option', { value: String(c.key), selected: S.mapping[f] === c.key }, colTitle(c))));
      sel.addEventListener('change', () => {
        const key = sel.value || null;
        if (key) {
          const other = Object.keys(S.mapping).find(k => k !== f && S.mapping[k] === key);
          if (other) { S.mapping[other] = null; selects.get(other).value = ''; announce(tx('swapped', { field: colTitle(columns.find(c => c.key === key)), column: f })); }
        }
        S.mapping[f] = key; S.auto.delete(f); S.result = null;
        refresh();
      });
      selects.set(f, sel);
      list.append(h('div', { class: 'o-iw-map-row', role: 'listitem' },
        h('div', { class: 'o-iw-src' }, h('span', { class: 'o-iw-src-name' }, h('bdi', null, f)), h('span', { class: 'o-iw-src-sample' }, samples.length ? samples.flatMap((x, i) => [i ? ' · ' : '', h('bdi', null, x)]) : '—')),
        h('span', { class: 'o-iw-arrow', 'aria-hidden': 'true' }, raw(String(icon('arrow-right', { size: 16 })))),
        h('div', { class: 'o-iw-target' }, sel, h('span', { class: 'o-badge o-badge-soft-success o-iw-map-auto', hidden: true }, raw(String(icon('check', { size: 12 }))), tx('auto')))));
    });
    body.append(heading(tx('map')), h('p', { class: 'o-iw-intro' }, tx('mapIntro')),
      h('div', { class: 'o-iw-map-head', 'aria-hidden': 'true' }, h('span', null, tx('sourceColumn')), h('span'), h('span', null, tx('targetField'))), list, alertEl);
    setInfo(tx('fileInfo', { name: S.fileName, rows: tx('rows', { count: S.raw.length }) }));
    setNext(t('common.next'), () => go('review'));
    refresh();
  }

  /* ── step: review ── */
  async function computeResult() {
    if (S.result) return S.result;
    S.result = await validateRows(S.raw, S.mapping, columns);
    return S.result;
  }
  function renderReview() {
    const mapped = columns.filter(c => Object.values(S.mapping).includes(c.key) || c.required || c.default != null);
    const wrap = h('div', { class: 'o-iw-review' }, heading(tx('review')), h('div', { class: 'o-iw-validating', role: 'status' }, h('span', { class: 'o-spinner o-spinner-sm' }), tx('validating')));
    body.append(wrap);
    setNext(tx('importRows', { count: 0 }), () => startImport(), true);
    computeResult().then(res => { if (S.step === 'review') drawReview(wrap, res, mapped); });
  }
  function drawReview(wrap, res, cols) {
    wrap.querySelector('.o-iw-validating')?.remove();
    const errCount = [...res.errors.values()].reduce((s, e) => s + Object.keys(e).length, 0);
    const valid = res.rows.length - res.invalid.size;
    const bar = h('div', { class: 'o-iw-review-bar' });
    const summary = h('div', { class: 'o-iw-summary' },
      h('span', { class: 'o-badge o-badge-soft-success' }, raw(String(icon('check-circle', { size: 14 }))), tx('validRows', { count: valid })),
      res.invalid.size ? h('span', { class: 'o-badge o-badge-soft-danger' }, raw(String(icon('alert-circle', { size: 14 }))), tx('errorsIn', { errors: fmt.number(errCount), rows: fmt.number(res.invalid.size) })) : h('span', { class: 'o-badge' }, tx('noErrors')));
    const only = h('input', { type: 'checkbox', checked: S.onlyErrors, disabled: !res.invalid.size });
    const skip = h('input', { type: 'checkbox', checked: S.skipInvalid });
    bar.append(summary, h('div', { class: 'o-iw-toggles' },
      h('label', { class: 'o-switch o-iw-toggle' }, only, h('span', null, tx('onlyErrors'))),
      h('label', { class: 'o-check o-iw-toggle' }, skip, h('span', null, tx('skipInvalid')))));
    const tableWrap = h('div', { class: 'o-table-wrap o-scroll o-iw-table-wrap', tabindex: '0', role: 'region', 'aria-label': tx('review') });
    const note = h('p', { class: 'o-iw-note' });
    const notices = [];
    if (S.truncated) notices.push(h('div', { class: 'o-alert o-alert-info' }, raw(String(icon('info'))), h('div', { class: 'o-alert-content' }, tx('maxRows', { count: fmt.number(o.maxRows) }))));
    const drawTable = () => {
      const idx = [];
      for (let i = 0; i < res.rows.length && idx.length < PREVIEW; i++) if (!S.onlyErrors || res.invalid.has(i)) idx.push(i);
      const total = S.onlyErrors ? res.invalid.size : res.rows.length;
      const thead = h('thead', null, h('tr', null, h('th', { scope: 'col', class: 'o-iw-rownum' }, tx('row')), ...cols.map(c => h('th', { scope: 'col' }, colTitle(c) + (c.required ? ' *' : '')))));
      const tbody = h('tbody');
      for (const i of idx) {
        const row = res.rows[i], errs = res.errors.get(i) || {};
        const tr = h('tr', { class: cls(errs && Object.keys(errs).length && 'is-invalid') }, h('th', { scope: 'row', class: 'o-iw-rownum' }, String(i + 1)));
        for (const c of cols) {
          const v = getPath(row, c.key), msg = errs[c.key];
          const text = v == null ? '' : v instanceof Date ? (c.type === 'datetime' ? fmt.datetime(v) : fmt.date(v)) : typeof v === 'boolean' ? (v ? t('common.yes') : t('common.no')) : typeof v === 'number' && c.type !== 'string' ? fmt.number(v, { maximumFractionDigits: 6 }) : String(v);
          if (msg) {
            const btn = h('button', { type: 'button', class: 'o-iw-fix', title: msg, 'data-row': String(i), 'data-key': String(c.key) },
              h('bdi', { class: 'o-iw-fix-text' }, text || ' '), raw(String(icon('alert-circle', { size: 14 }))), h('span', { class: 'o-sr-only' }, ' ' + tx('cellError', { message: msg })));
            tr.append(h('td', { class: 'is-invalid' }, btn));
          } else tr.append(h('td', null, text ? h('bdi', null, text) : ''));
        }
        tbody.append(tr);
      }
      tableWrap.replaceChildren(h('table', { class: 'o-table o-table-sm o-table-sticky o-iw-table' }, thead, tbody));
      note.textContent = (idx.length < total ? tx('showing', { shown: fmt.number(idx.length), total: fmt.number(total) }) + ' ' : '') + (res.invalid.size ? tx('fixHint') : '');
    };
    const updateFooter = () => {
      const count = S.skipInvalid ? res.rows.length - res.invalid.size : res.rows.length;
      const blocked = !S.skipInvalid && res.invalid.size > 0;
      setNext(tx('importRows', { count }), () => startImport(), blocked || count === 0);
      setInfo(blocked ? tx('blockInvalid') : '', blocked ? 'danger' : null);
    };
    only.addEventListener('change', () => { S.onlyErrors = only.checked; drawTable(); });
    skip.addEventListener('change', () => { S.skipInvalid = skip.checked; updateFooter(); });
    // inline fixes
    tableWrap.addEventListener('click', e => {
      const btn = e.target.closest('.o-iw-fix');
      if (!btn) return;
      const i = +btn.dataset.row, key = btn.dataset.key, col = cols.find(c => String(c.key) === key), td = btn.parentElement;
      const cur = S.raw[i];
      const srcField = Object.keys(S.mapping).find(f => String(S.mapping[f]) === key);
      const inp = h('input', { class: 'o-input o-input-sm o-iw-fix-input', value: srcField != null && cur[srcField] != null ? String(cur[srcField] instanceof Date ? date.toISODate(cur[srcField]) : cur[srcField]) : '', 'aria-label': tx('edit') + ': ' + colTitle(col) });
      td.replaceChildren(inp); inp.focus(); inp.select();
      let doneEdit = false;
      const commit = save => {
        if (doneEdit) return; doneEdit = true;
        if (save) {
          const field = srcField ?? '__' + key;
          if (srcField == null) S.mapping[field] = col.key;
          if (S.raw === S.sheets[S.sheetIndex]?.rows) S.raw = S.raw.slice();
          S.raw[i] = { ...cur, [field]: inp.value };
          validateRows([S.raw[i]], S.mapping, columns).then(one => {
            res.rows[i] = one.rows[0];
            if (one.errors.size) { res.errors.set(i, one.errors.get(0)); res.invalid.add(i); } else { res.errors.delete(i); res.invalid.delete(i); }
            S.result = res;
            drawReview(wrap, res, cols);
            (wrap.querySelector('.o-iw-fix') || wrap.querySelector('.o-iw-table-wrap'))?.focus({ preventScroll: true });
          });
        } else drawTable();
      };
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); commit(true); } else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); commit(false); } });
      inp.addEventListener('blur', () => commit(true));
    });
    const scroll = wrap.querySelector('.o-iw-table-wrap')?.scrollTop || 0;
    wrap.replaceChildren(heading(tx('review')), bar, ...notices, tableWrap, note);
    drawTable();
    tableWrap.scrollTop = scroll;
    updateFooter();
  }

  /* ── step: import ── */
  async function startImport() {
    const res = await computeResult();
    const rows = [], skipped = [];
    res.rows.forEach((r, i) => { if (res.invalid.has(i)) { if (S.skipInvalid) skipped.push(i); else rows.push(r); } else rows.push(r); });
    S.pending = rows; S.skippedIdx = skipped;
    go('import');
  }
  function renderImport() {
    const rows = S.pending || [], total = rows.length;
    const bar = h('div', { class: 'o-progress-bar', style: '--o-value: 0%' });
    const text = h('p', { class: 'o-iw-progress-text' }, tx('importing', { done: 0, total: fmt.number(total) }));
    const progress = h('div', { class: cls('o-progress o-progress-lg', !o.batchSize && 'o-progress-indeterminate'), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-label': tx('import') }, bar);
    body.append(heading(tx('import')), h('div', { class: 'o-iw-importing' }, progress, text));
    const set = ratio => {
      const p = Math.round(clamp(ratio, 0, 1) * 100);
      progress.classList.remove('o-progress-indeterminate');
      bar.style.setProperty('--o-value', p + '%'); progress.setAttribute('aria-valuenow', String(p));
      text.textContent = tx('importing', { done: fmt.number(Math.round(total * clamp(ratio, 0, 1))), total: fmt.number(total) });
    };
    S.abort = new AbortController();
    shell.setEscape(false);
    setNext(t('common.cancel'), () => S.abort.abort());
    nextBtn.classList.remove('o-btn-primary');
    const signal = S.abort.signal;
    (async () => {
      try {
        if (isFn(o.onImport)) {
          if (o.batchSize && o.batchSize < total) {
            for (let i = 0; i < total; i += o.batchSize) {
              if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
              await o.onImport(rows.slice(i, i + o.batchSize), { index: i, total, signal, progress: set });
              set(Math.min(1, (i + o.batchSize) / total));
            }
          } else await o.onImport(rows, { progress: set, signal, total });
        }
        if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        set(1);
        S.imported = rows; S.error = null;
      } catch (e) { S.error = e; }
      nextBtn.classList.add('o-btn-primary');
      shell.setEscape(true);
      go('done');
    })();
  }
  function renderDone() {
    const err = S.error, cancelled = err && err.name === 'AbortError';
    const skippedRows = (S.skippedIdx || []).map(i => S.raw[i]);
    const actions = h('div', { class: 'o-empty-actions' });
    if (!err && skippedRows.length) {
      const dl = h('button', { type: 'button', class: 'o-btn o-btn-sm' }, raw(String(icon('download'))), tx('downloadSkipped'));
      dl.addEventListener('click', () => {
        const res = S.result, errCol = tx('errorColumn');
        const data = (S.skippedIdx || []).map(i => ({ ...S.raw[i], [errCol]: Object.entries(res.errors.get(i) || {}).map(([k, m]) => `${colTitle(columns.find(c => c.key === k) || { key: k })}: ${m}`).join('; ') }));
        download(new Blob([O.csv.stringify(data, { columns: [...S.fields, errCol].map(f => ({ key: row => row[f], title: f })), bom: true })], { type: 'text/csv;charset=utf-8' }), 'skipped-rows.csv');
      });
      actions.append(dl);
    }
    const again = h('button', { type: 'button', class: 'o-btn o-btn-sm' }, raw(String(icon('upload'))), tx('another'));
    again.addEventListener('click', () => { S.sheets = []; S.result = null; S.imported = []; go('upload'); });
    actions.append(again);
    if (err && !cancelled) {
      const retry = h('button', { type: 'button', class: 'o-btn o-btn-sm o-btn-primary' }, t('common.retry'));
      retry.addEventListener('click', () => go('import'));
      actions.prepend(retry);
    }
    const tone = err ? 'is-error' : 'is-success';
    body.append(h('div', { class: cls('o-empty o-iw-done', tone) },
      h('div', { class: 'o-empty-icon' }, raw(String(icon(err ? 'alert-circle' : 'check-circle')))),
      h('h3', { class: 'o-empty-title o-iw-heading' }, err ? tx(cancelled ? 'cancelled' : 'failed') : tx('imported', { count: S.imported.length })),
      h('p', { class: 'o-empty-text' }, err ? (cancelled ? '' : err.message || String(err)) : skippedRows.length ? tx('skipped', { count: skippedRows.length }) : tx('allImported')), actions));
    setNext(t('common.done'), () => close(err ? null : S.imported));
    backBtn.hidden = !err;
    if (!err) o.onComplete?.({ rows: S.imported, skipped: skippedRows });
  }

  // paste files anywhere in the dialog on the upload step
  panel.addEventListener('paste', e => {
    if (S.step !== 'upload') return;
    const f = e.clipboardData?.files?.[0];
    if (f) { e.preventDefault(); loadFile(f); }
  });
  go('upload');
  promise.close = () => close(null);
  return promise;
}

O.importFile = importFile;
O.importWizard = importWizard;
O.importer = { autoMap, coerce, validate: validateRows, read: importFile, wizard: importWizard };
