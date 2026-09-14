/* ── toolbar, search box, faceted filter chips, bulk-action bar, filter row ── */
const DT_TOOLBAR = {
  _buildToolbar(slotted) {
    const tb = this._toolbar;
    this._searchInput = h('input', { class: 'o-input o-input-sm', type: 'search', autocomplete: 'off', spellcheck: 'false' });
    this._searchClear = h('button', { type: 'button', class: 'o-input-action', hidden: true }, iconEl('x'));
    this._searchBox = h('div', { class: 'o-input-wrap o-dt-search' }, iconEl('search'), this._searchInput, this._searchClear);
    this._tbCustom = h('div', { class: 'o-dt-tb-custom' });
    this._tbStart = h('div', { class: 'o-dt-tb-start' }, this._searchBox, this._tbCustom);
    this._tbEnd = h('div', { class: 'o-dt-tb-end' });
    tb.append(this._tbStart, this._tbEnd);
    slotted.forEach(el => this._slot(el));
    const apply = () => this.setSearch(this._searchInput.value);
    this._searchDeb = debounce(apply, 250);
    on(this._searchInput, 'input', () => {
      this._searchClear.hidden = !this._searchInput.value;
      this._searchDeb.cancel();
      this._searchDeb = debounce(apply, this._server ? +this.searchDebounce || 250 : Math.min(+this.searchDebounce || 0, 150));
      this._searchDeb();
    });
    on(this._searchInput, 'keydown', e => {
      if (e.key === 'Escape' && this._searchInput.value) { e.preventDefault(); this._searchInput.value = ''; this._searchClear.hidden = true; this._searchDeb.cancel(); this.setSearch(''); }
      else if (e.key === 'Enter') { e.preventDefault(); this._searchDeb.flush(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); this._focusCell(this._pageRows()[0] ? this.keyOf(this._pageRows()[0]) : '__head', this._dataVis[0]?.id); }
    });
    on(this._searchClear, 'click', () => { this._searchInput.value = ''; this._searchClear.hidden = true; this._searchDeb.cancel(); this.setSearch(''); this._searchInput.focus(); });
    on(this._tbEnd, 'click', '[data-tb]', (e, b) => this._tbAction(b.dataset.tb, b));
    on(this._bulk, 'click', '[data-bulk]', (e, b) => this._bulkAction(b.dataset.bulk, b));
    on(this._chips, 'click', '[data-chip]', (e, b) => this._chipAction(b.dataset.chip, b));
    // filter row (delegated; the row itself is only rebuilt when columns change, so typing never loses focus)
    const setRow = debounce((key, el) => this._filterRowSet(key, el), 250);
    on(this._thead, 'input', '[data-fkey]', (e, el) => { if (el.tagName === 'INPUT') setRow(el.dataset.fkey, el); });
    on(this._thead, 'change', '[data-fkey]', (e, el) => { setRow.cancel(); this._filterRowSet(el.dataset.fkey, el); });
    on(this._thead, 'focusin pointerdown', 'select[data-fsel]', (e, el) => this._fillSelect(el));
  },
  _slot(el) { el.removeAttribute('slot'); el.classList.add('o-dt-slotted'); this._tbCustom.append(el); },

  /** toolbar prop: true | false | { search, filters, columns, density, export, views, import, refresh, print, actions } | ['search', ...] */
  _tbConf() {
    let t = this.toolbar;
    if (t === 'false' || t === false) return null;
    const auto = { search: this.searchable, filters: this._cols.some(c => c.filterable), columns: true, density: true, export: true, views: !!this.stateKey || !!this.views?.length, import: this.importable, refresh: this._server || !!(this.source || this.url), print: false, actions: [] };
    if (Array.isArray(t)) return Object.fromEntries(Object.keys(auto).map(k => [k, t.includes(k) ? auto[k] || true : false]).concat([['actions', []]]));
    if (isObj(t)) return { ...auto, ...t };
    return auto;
  },
  _syncToolbar() {
    const c = this._tbConf();
    this._toolbar.hidden = !c;
    if (!c) return;
    this._searchBox.hidden = !c.search;
    this._searchInput.placeholder = this.t('table.search');
    this._searchInput.setAttribute('aria-label', this.t('table.searchLabel'));
    this._searchClear.setAttribute('aria-label', this.t('table.clearSearch'));
    this._toolbar.setAttribute('aria-label', this.label || this.t('table.label'));
    const btn = (id, ic, label, text) => `<button type="button" class="o-btn o-btn-sm${text ? '' : ' o-btn-icon'} o-dt-tb-${id}" data-tb="${id}" aria-label="${esc(label)}" title="${esc(label)}"${['columns', 'density', 'export', 'views'].includes(id) ? ' aria-haspopup="dialog" aria-expanded="false"' : ''}>${icon(ic)}${text ? `<span class="o-dt-tb-text">${esc(text)}</span>` : ''}${id === 'filters' ? '<span class="o-badge o-badge-primary o-badge-sm o-dt-fcount" hidden></span>' : ''}</button>`;
    let html = toArr(c.actions).map((a, i) => `<button type="button" class="o-btn o-btn-sm${a.variant ? ' o-btn-' + esc(a.variant) : ''}" data-tb="act:${i}">${a.icon ? icon(a.icon) : ''}<span>${esc(a.label || '')}</span></button>`).join('');
    if (c.filters && this._cols.some(x => x.filterable)) html += btn('filters', 'filter', this.t('table.filterRow'), this.t('table.filters'));
    if (c.views) html += btn('views', 'star', this.t('table.views'), this._viewName || this.t('table.views'));
    if (c.refresh) html += btn('refresh', 'refresh', this.t('table.refresh'));
    if (c.import) html += btn('import', 'upload', this.t('table.import'));
    if (c.print) html += btn('print', 'printer', this.t('table.print'));
    if (c.columns) html += btn('columns', 'columns', this.t('table.columns'));
    if (c.density) html += btn('density', 'menu', this.t('table.density'));
    if (c.export) html += btn('export', 'download', this.t('table.export'), this.t('table.export'));
    if (html !== this._tbHTML) { this._tbHTML = html; this._tbEnd.innerHTML = html; }
    this._syncChrome();
  },
  _tbAction(id, b) {
    if (id.startsWith('act:')) { const a = toArr(this._tbConf()?.actions)[+id.slice(4)]; a?.action?.(this, b); return; }
    if (id === 'filters') { this.filterRow = !this.filterRow; this.flush(); b.setAttribute('aria-pressed', String(!!this.filterRow)); if (this.filterRow) this._thead.querySelector('.o-dt-frow [data-fkey]')?.focus(); return; }
    if (id === 'columns') return this._openColumns(b);
    if (id === 'density') return this._openDensity(b);
    if (id === 'export') return this._openExport(b);
    if (id === 'views') return this._openViews(b);
    if (id === 'import') return this.importFile();
    if (id === 'print') return this.print();
    if (id === 'refresh') { b.classList.add('is-spinning'); Promise.resolve(this.reload()).finally(() => b.classList.remove('is-spinning')); }
  },

  /** Everything that depends on selection / filters but not on rows: bulk bar, chips, toolbar states. */
  _syncChrome() {
    if (!this._setupDone) return;
    if (doc.activeElement !== this._searchInput && this._searchInput.value !== (this.search || '')) { this._searchInput.value = this.search || ''; this._searchClear.hidden = !this.search; }
    const active = Object.entries(this.filters || {}).filter(([, v]) => !dtFilterEmpty(v));
    const fc = this._tbEnd.querySelector('.o-dt-fcount');
    if (fc) { fc.hidden = !active.length; fc.textContent = active.length; }
    const fb = this._tbEnd.querySelector('.o-dt-tb-filters'); if (fb) fb.setAttribute('aria-pressed', String(!!this.filterRow));
    this._renderChips(active);
    this._renderBulk();
  },

  _chipText(col, v) {
    const f = col?.filter;
    if (Array.isArray(v)) { const l = v.map(String); return l.slice(0, 2).join(', ') + (l.length > 2 ? ` +${l.length - 2}` : ''); }
    if (f === 'number-range' || (isPlainObj(v) && ('min' in v || 'max' in v))) {
      const n = x => (col && DT_NUMERIC.has(col.type) ? dtFormat(col, x, {}) : fmt.number(x));
      return v.min != null && v.max != null ? `${n(v.min)} – ${n(v.max)}` : v.min != null ? `≥ ${n(v.min)}` : `≤ ${n(v.max)}`;
    }
    if (f === 'date-range' || (isPlainObj(v) && ('from' in v || 'to' in v))) return v.from && v.to ? `${fmt.date(v.from)} – ${fmt.date(v.to)}` : v.from ? `≥ ${fmt.date(v.from)}` : `≤ ${fmt.date(v.to)}`;
    if (typeof v === 'boolean' || f === 'boolean') return v === true || v === 'true' ? this.t('table.yes') : this.t('table.no');
    return `“${v}”`;
  },
  _renderChips(active) {
    const chips = [];
    if (this.search) chips.push(`<span class="o-chip is-active"><button type="button" class="o-dt-chip-btn" data-chip="open:__search"><span class="o-dt-chip-key">${esc(this.t('table.searchChip'))}:</span> <b>${esc('“' + this.search + '”')}</b></button><button type="button" class="o-chip-remove" data-chip="rm:__search" aria-label="${esc(this.t('table.clearSearch'))}"></button></span>`);
    for (const [k, v] of active) {
      const col = this._colFor(k), title = col?.title || k;
      let counts = '';
      if (Array.isArray(v) && v.length <= 3 && col) { const fc = this.facetCounts(k); counts = v.map(x => fc.get(String(x))).some(n => n != null) ? ` <span class="o-dt-count">${esc(fmt.number(v.reduce((s, x) => s + (fc.get(String(x)) || 0), 0)))}</span>` : ''; }
      chips.push(`<span class="o-chip is-active"><button type="button" class="o-dt-chip-btn" data-chip="open:${esc(k)}" aria-haspopup="dialog"><span class="o-dt-chip-key">${esc(title)}:</span> <b>${esc(this._chipText(col, v))}</b>${counts}</button><button type="button" class="o-chip-remove" data-chip="rm:${esc(k)}" aria-label="${esc(this.t('table.clearFilter') + ' ' + title)}"></button></span>`);
    }
    if (isFn(this.filterFn)) chips.push(`<span class="o-chip is-active"><span class="o-dt-chip-key">${esc(this.filterLabel || this.t('table.filter'))}</span><button type="button" class="o-chip-remove" data-chip="rm:__fn" aria-label="${esc(this.t('table.clearFilter'))}"></button></span>`);
    const show = chips.length > 0;
    this._chips.hidden = !show;
    const html = show ? `<span class="o-dt-chips-list">${chips.join('')}</span><span class="o-dt-chips-end"><span class="o-dt-muted">${esc(this.t('table.results', { count: this.total }))}</span><button type="button" class="o-btn o-btn-link o-btn-sm" data-chip="clear">${esc(this.t('table.clearAll'))}</button></span>` : '';
    if (html !== this._chipsHTML) {
      const f = this._chips.contains(doc.activeElement) ? doc.activeElement.dataset.chip : null;
      this._chipsHTML = html; this._chips.innerHTML = html;
      if (f) (this._chips.querySelector(`[data-chip="${CSS.escape(f)}"]`) || this._chips.querySelector('[data-chip]') || this._searchInput).focus();
    }
  },
  _chipAction(id, b) {
    if (id === 'clear') { this.clearFilters(); if (isFn(this.filterFn)) this.filterFn = null; this._searchInput.focus(); return; }
    const [op, key] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
    if (op === 'rm') {
      if (key === '__search') this.setSearch('');
      else if (key === '__fn') { this.filterFn = null; this.emit('filter', { filters: this.filters }); }
      else this.setFilter(key, null);
      return;
    }
    if (key === '__search') { this._searchInput.focus(); this._searchInput.select(); return; }
    this._openFilter(this._colFor(key), b);
  },

  _renderBulk() {
    const n = this._selAll ? this._total : this._sel.size;
    const show = !!this._selMode && n > 0;
    this._bulk.hidden = !show;
    this.classList.toggle('has-selection', show);
    if (!show) { this._bulkHTML = ''; return; }
    const page = this._pageRows(), total = this.total;
    const pageAll = page.length && page.every(r => this._isSelected(r));
    let more = '';
    if (this._selMode === 'multi') {
      if (this._selAll || (!this._server && n >= total && total > page.length)) more = `<span class="o-dt-muted">${esc(this.t('table.allSelected', { count: fmt.number(total) }))}</span>`;
      else if (pageAll && total > n) more = `<button type="button" class="o-btn o-btn-link o-btn-sm" data-bulk="all">${esc(this.t('table.selectAllResults', { count: fmt.number(total) }))}</button>`;
    }
    const acts = toArr(this.bulkActions).map((a, i) => `<button type="button" class="o-btn o-btn-sm${a.variant ? ' o-btn-soft-' + esc(a.variant) : ''}" data-bulk="${i}">${a.icon ? icon(a.icon) : ''}<span>${esc(a.label)}</span></button>`).join('');
    const html = `<span class="o-dt-bulk-count" role="status"><strong>${esc(this.t('table.selected', { count: n }))}</strong></span>${more}<span class="o-dt-bulk-actions">${acts}</span><button type="button" class="o-btn o-btn-ghost o-btn-sm o-dt-bulk-clear" data-bulk="clear">${icon('x')}<span>${esc(this.t('table.clearSelection'))}</span></button>`;
    if (html !== this._bulkHTML) {
      const f = this._bulk.contains(doc.activeElement) ? doc.activeElement.dataset.bulk : null;
      this._bulkHTML = html; this._bulk.innerHTML = html;
      if (f) this._bulk.querySelector(`[data-bulk="${f}"]`)?.focus();
    }
  },
  async _bulkAction(id, b) {
    if (id === 'clear') { this.clearSelection(); this.focus(); return; }
    if (id === 'all') { this.selectAll('all'); return; }
    const a = toArr(this.bulkActions)[+id]; if (!a) return;
    const rows = this.getSelected(), ctx = { table: this, all: !!this._selAll, query: this.getQuery(), keys: [...this._sel.keys()], count: this._selAll ? this._total : rows.length };
    if (a.confirm && !(await this._confirm(isFn(a.confirm) ? a.confirm(rows, ctx) : a.confirm === true ? this.t('table.confirm') : String(a.confirm).replace('{count}', ctx.count), b, a.variant))) return;
    try { await a.action?.(rows, ctx); } catch (e) { console.error('[Orion] bulk action', e); }
  },

  /* ── filter row ── */
  _filterCellHTML(c) {
    if (c.special || !c.filterable) return '<th class="o-dt-fcell" role="gridcell"></th>';
    const key = esc(this._filterKey(c)), lbl = esc(this.t('table.filterColumn', { column: c.title }));
    const inp = (type, part, ph) => `<input class="o-input o-input-sm" type="${type}" data-fkey="${key}"${part ? ` data-fpart="${part}"` : ''} placeholder="${esc(ph)}" aria-label="${lbl}${part ? ' (' + esc(ph) + ')' : ''}">`;
    let body;
    if (c.filter === 'text') body = inp('search', '', this.t('table.contains'));
    else if (c.filter === 'number-range') body = `<div class="o-dt-range">${inp('number', 'min', this.t('table.min'))}${inp('number', 'max', this.t('table.max'))}</div>`;
    else if (c.filter === 'date-range') body = `<div class="o-dt-range">${inp('date', 'from', this.t('table.from'))}${inp('date', 'to', this.t('table.to'))}</div>`;
    else if (c.filter === 'boolean') body = `<select class="o-select o-input-sm" data-fkey="${key}" aria-label="${lbl}"><option value="">${esc(this.t('table.any'))}</option><option value="true">${esc(this.t('table.yes'))}</option><option value="false">${esc(this.t('table.no'))}</option></select>`;
    else body = `<select class="o-select o-input-sm" data-fkey="${key}" data-fsel aria-label="${lbl}"><option value="">${esc(this.t('table.any'))}</option></select>`;
    return `<th class="o-dt-fcell" role="gridcell">${body}</th>`;
  },
  _fillSelect(sel) {
    const col = this._colFor(sel.dataset.fkey); if (!col) return;
    const opts = this.filterOptions(col), counts = this.facetCounts(sel.dataset.fkey), cur = sel.value;
    const sig = opts.map(o => o.value + (counts.get(o.value) ?? '')).join('|');
    if (sel.__sig === sig) return;
    sel.__sig = sig;
    sel.innerHTML = `<option value="">${esc(this.t('table.any'))}</option>` + opts.map(o => `<option value="${esc(o.value)}">${esc(o.label)}${counts.has(o.value) ? ` (${esc(fmt.number(counts.get(o.value)))})` : ''}</option>`).join('');
    sel.value = cur;
  },
  _filterRowSet(key, el) {
    const col = this._colFor(key); if (!col) return;
    if (el.dataset.fpart) {
      const parts = {};
      this._thead.querySelectorAll(`[data-fkey="${CSS.escape(key)}"]`).forEach(x => { parts[x.dataset.fpart] = x.value === '' ? null : col.filter === 'number-range' ? +x.value : x.value; });
      this.setFilter(key, parts);
    } else if (col.filter === 'boolean') this.setFilter(key, el.value === '' ? null : el.value === 'true');
    else if (col.filter === 'multiselect') this.setFilter(key, el.value ? [el.value] : null);
    else this.setFilter(key, el.value || null);
  },
  _syncFilterRow() {
    if (!this.filterRow) return;
    for (const el of this._thead.querySelectorAll('.o-dt-frow [data-fkey]')) {
      if (el === doc.activeElement) continue;
      const v = this.filters?.[el.dataset.fkey];
      let s = '';
      if (el.dataset.fpart) { const p = v?.[el.dataset.fpart]; s = p == null ? '' : el.type === 'date' ? date.toISODate(p) : String(p); }
      else if (Array.isArray(v)) s = v.length === 1 ? String(v[0]) : '';
      else s = v == null ? '' : String(v);
      if (el.tagName === 'SELECT' && s && ![...el.options].some(o => o.value === s)) this._fillSelect(el);
      if (el.value !== s) el.value = s;
    }
  },
};
