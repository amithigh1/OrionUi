/* ── export (CSV / JSON / clipboard + pluggable XLSX / PDF), import with preview, print & preview ── */
const DT_IO = {
  _canExport(f) {
    if (ODataTable.exporters[f]) return true;
    if (f === 'xlsx') return isFn(O.export) || isFn(O.xlsx?.export);
    if (f === 'pdf') return isFn(O.export) || isFn(O.PDF?.export) || isFn(O.pdf?.export);
    return ['csv', 'tsv', 'json', 'clipboard', 'print', 'preview'].includes(f);
  },
  /** exportData({ rows: 'filtered'|'selected'|'page'|'all'|array, columns: 'visible'|'all', formatted }) */
  exportData(o = {}) {
    const s = o.rows || 'filtered';
    const rows = Array.isArray(s) ? s : s === 'selected' ? this.getSelected() : s === 'page' ? this._pageRows() : s === 'all' ? this.getRows() : this.tree ? this._sorted || [] : this.getRows({ filtered: true });
    const cols = (o.columns === 'all' ? this.columnOrder.map(id => this._colById.get(id)) : this._dataVis).filter(c => c && c.exportable);
    const matrix = rows.map(r => cols.map(c => dtExportValue(c, r, !!o.formatted)));
    return {
      columns: cols.map(c => ({ key: c.key ?? c.id, title: c.title, type: c.type })),
      header: cols.map(c => c.title),
      rows: matrix,
      objects: matrix.map(line => Object.fromEntries(cols.map((c, i) => [c.key ?? c.id, line[i]]))),
      filename: o.filename || this.exportFilename || 'export',
      title: o.title || this.label || '',
    };
  },
  /** export(format, opts) -> generated text for csv/tsv/json/clipboard. Pass { download: false } to only get the text. */
  async export(format = 'csv', o = {}) {
    if (format === 'print') return this.print(o);
    if (format === 'preview') return this.printPreview(o);
    const data = this.exportData(o), name = data.filename;
    let out;
    const custom = ODataTable.exporters[format];
    if (custom) out = await custom(data, { ...o, table: this });
    else if (format === 'csv' || format === 'tsv') {
      out = csvStringify([data.header, ...data.rows], format === 'tsv' ? '\t' : o.delimiter || ',');
      if (o.download !== false) download('\ufeff' + out, `${name}.${format}`, 'text/csv;charset=utf-8');
    } else if (format === 'json') {
      out = JSON.stringify(data.objects, null, 2);
      if (o.download !== false) download(out, `${name}.json`, 'application/json');
    } else if (format === 'clipboard') {
      out = csvStringify([data.header, ...data.rows], '\t');
      if (o.download !== false) { await dtCopy(out); this._toast(this.t('table.copied', { count: data.rows.length })); }
    } else if (format === 'xlsx' || format === 'pdf') {
      const fn = isFn(O.export) ? (d, op) => O.export(format, d, op) : format === 'xlsx' ? O.xlsx?.export : (O.PDF?.export || O.pdf?.export);
      if (isFn(fn)) out = await fn(data, { ...o, filename: `${name}.${format}` });
      else if (format === 'pdf') return this.printPreview(o);
      else return this.export('csv', o);
    } else throw new Error('Unknown export format: ' + format);
    this.emit('export', { format, count: data.rows.length, text: isStr(out) ? out : undefined });
    if (format !== 'clipboard' && o.download !== false) announce(this.t('table.exported', { count: fmt.number(data.rows.length) }));
    return out;
  },

  /* ── print ── */
  /** Standalone printable HTML document of the current view (formatted values). */
  printHTML(o = {}) {
    const d = this.exportData({ ...o, formatted: true });
    const cols = d.columns, dir = dirOf(this), right = dir === 'rtl' ? 'left' : 'right';
    const title = o.title || this.label || doc.title || '';
    const head = cols.map(c => `<th>${esc(c.title)}</th>`).join('');
    const body = d.rows.map(r => `<tr>${r.map((v, i) => `<td${DT_TYPES_END.has(cols[i].type) ? ' class="num"' : ''}>${esc(v)}</td>`).join('')}</tr>`).join('');
    const css = `*{box-sizing:border-box}body{margin:0;padding:16px;font:12px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a}h1{font-size:16px;margin:0 0 4px}.meta{color:#64748b;margin:0 0 12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:5px 8px;text-align:start;vertical-align:top}th{background:#f1f5f9;font-weight:600}td.num{text-align:${right};font-variant-numeric:tabular-nums}tr{break-inside:avoid}thead{display:table-header-group}@page{margin:12mm}`;
    return `<!doctype html><html lang="${esc(i18n.locale)}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${title ? `<h1>${esc(title)}</h1>` : ''}<p class="meta">${esc(fmt.datetime(new Date()))} · ${esc(this.t('table.results', { count: d.rows.length }))}</p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  },
  /** print(opts) — prints the current view through a hidden iframe. */
  print(o = {}) {
    const html = this.printHTML(o);
    const fr = h('iframe', { class: 'o-dt-print-frame', title: this.t('table.print'), 'aria-hidden': 'true', style: 'position:fixed;width:0;height:0;border:0;inset-inline-start:-9999px;top:0' });
    fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch {} setTimeout(() => fr.remove(), 1500); };
    fr.srcdoc = html;
    doc.body.append(fr);
    return html;
  },
  /** printPreview(opts) — Orion.printPreview when available, else a built-in preview dialog. */
  printPreview(o = {}) {
    const html = this.printHTML(o);
    if (isFn(O.printPreview)) { try { const r = O.printPreview({ html, title: o.title || this.label || '' }); if (r !== false) return r; } catch {} }
    return this._dialog(this.t('table.printPreview'), (box, handle) => {
      const fr = h('iframe', { class: 'o-dt-preview-frame', title: this.t('table.printPreview') });
      fr.srcdoc = html;
      const pr = h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm' }, iconEl('printer'), this.t('table.print'));
      pr.onclick = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch {} };
      const cl = h('button', { type: 'button', class: 'o-btn o-btn-sm' }, this.t('table.close'));
      cl.onclick = () => handle.close('api');
      box.append(h('div', { class: 'o-dt-dialog-body is-flush' }, fr), h('div', { class: 'o-dt-panel-actions' }, cl, pr));
    }, { wide: true });
  },

  /** Modal dialog (built-in; traps focus, locks scroll, Escape closes). */
  _dialog(title, build, o = {}) {
    this._closePanel();
    const id = uid('dtd');
    const back = h('div', { class: 'o-backdrop o-dt-backdrop' });
    const box = h('div', { class: cls('o-floating o-dt-dialog', o.wide && 'is-wide'), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id, tabindex: '-1' });
    const wrap = h('div', { class: 'o-dt-modal' }, back, box);
    const x = h('button', { type: 'button', class: 'o-btn-close', 'aria-label': this.t('table.close') });
    box.append(h('div', { class: 'o-dt-dialog-head' }, h('h2', { class: 'o-dt-dialog-title', id }, title), x));
    portal(wrap, this);
    const handle = { el: box, close: r => ov.close(r) };
    build(box, handle);
    const ov = overlays.open({ el: wrap, modal: true, trap: true, lockScroll: true, onClose: r => { wrap.remove(); o.onClose?.(r); } });
    x.onclick = () => handle.close('api');
    on(back, 'click', () => handle.close('outside'));
    animate(box, 'zoomIn', { duration: 160 });
    requestAnimationFrame(() => focusFirst(box));
    return handle;
  },

  /* ── import ── */
  /** Open a file picker and import the chosen CSV (or XLSX when Orion.xlsx.read exists). */
  importFile(o = {}) {
    const inp = h('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv' + (isFn(O.xlsx?.read) ? ',.xlsx' : ''), style: 'display:none' });
    inp.onchange = () => { const f = inp.files?.[0]; inp.remove(); if (f) this.importCSV(f, o); };
    doc.body.append(inp);
    inp.click();
  },
  /** importCSV(fileOrText, { preview = true, replace = false }) -> Promise<rows | null> */
  async importCSV(src, o = {}) {
    let grid;
    if (src instanceof Blob && /\.xlsx$/i.test(src.name || '') && isFn(O.xlsx?.read)) {
      const r = await O.xlsx.read(src);
      grid = Array.isArray(r) ? r : toArr(r?.sheets?.[0]?.rows || r?.rows);
    } else grid = csvParse(src instanceof Blob ? await src.text() : String(src ?? ''));
    grid = grid.map(r => toArr(r).map(v => (v == null ? '' : v)));
    if (grid.length < 2) { this._toast(this.t('table.importEmpty'), 'warning'); return null; }
    const header = grid[0].map(String), body = grid.slice(1);
    const cols = this._cols.filter(c => c.key != null && c.type !== 'actions');
    const map = header.map(hd => { const k = hd.trim().toLowerCase(); return cols.find(c => String(c.title).toLowerCase() === k || String(c.key).toLowerCase() === k)?.key ?? null; });
    if (o.preview === false) return this._doImport(this._importRows(body, map), !!o.replace);
    return new Promise(resolve => {
      let done = false;
      this._dialog(this.t('table.importTitle'), (box, handle) => {
        const replace = h('input', { type: 'checkbox', class: 'o-check-input' }); replace.checked = !!o.replace;
        const sels = header.map((hd, i) => { const s = h('select', { class: 'o-select o-input-sm', 'aria-label': hd }, h('option', { value: '' }, this.t('table.importIgnore')), ...cols.map(c => h('option', { value: c.key }, c.title))); s.value = map[i] || ''; on(s, 'change', () => { map[i] = s.value || null; }); return s; });
        const prev = body.slice(0, 5);
        const table = h('table', { class: 'o-table o-table-sm o-dt-import-table' },
          h('thead', {}, h('tr', {}, header.map(hd => h('th', {}, hd))), h('tr', {}, sels.map(s => h('th', {}, s)))),
          h('tbody', {}, prev.map(r => h('tr', {}, header.map((_, i) => h('td', {}, String(r[i] ?? '')))))));
        const go = h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm' }, iconEl('upload'), this.t('table.importRows', { count: body.length }));
        const cancel = h('button', { type: 'button', class: 'o-btn o-btn-sm' }, this.t('table.cancel'));
        go.onclick = () => { done = true; handle.close('api'); resolve(this._doImport(this._importRows(body, map), replace.checked)); };
        cancel.onclick = () => handle.close('api');
        box.append(h('div', { class: 'o-dt-dialog-body' }, h('p', { class: 'o-dt-muted' }, `${this.t('table.importPreview')} · ${this.t('table.results', { count: body.length })}`), h('div', { class: 'o-table-wrap o-scroll' }, table),
          h('label', { class: 'o-check o-dt-sep-top' }, replace, h('span', {}, this.t('table.importReplace')))), h('div', { class: 'o-dt-panel-actions' }, cancel, go));
      }, { wide: true, onClose: () => { if (!done) resolve(null); } });
    });
  },
  _importRows(body, map) {
    const rk = this.rowKey || 'id';
    let next = Math.max(0, ...this._data.map(r => +getPath(r, rk)).filter(isNum)) + 1;
    return body.map(line => {
      const o = {};
      map.forEach((key, i) => { if (key) setPath(o, key, dtCoerce(line[i], this._colFor(key)?.type)); });
      if (getPath(o, rk) == null || getPath(o, rk) === '') setPath(o, rk, next++);
      return o;
    });
  },
  _doImport(rows, replace) {
    if (!this.emit('import', { rows, replace })) return null;
    if (!this._server) this.rows = replace ? rows : [...this._data, ...rows];
    this._toast(this.t('table.importDone', { count: rows.length }));
    return rows;
  },
};
