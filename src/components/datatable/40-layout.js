/* ── header, column widths, frozen columns, footer & pager ─────────────── */
const DT_LAYOUT = {
  _headRows() { return 1 + (this.filterRow ? 1 : 0); },

  _renderHead() {
    const cols = this._vis;
    this._colgroup.innerHTML = cols.map(c => `<col data-col="${esc(c.id)}">`).join('');
    let html = `<tr class="o-dt-hrow" role="row" aria-rowindex="1">${cols.map(c => this._thHTML(c)).join('')}</tr>`;
    if (this.filterRow) html += `<tr class="o-dt-frow" role="row" aria-rowindex="2">${cols.map(c => this._filterCellHTML(c)).join('')}</tr>`;
    this._thead.innerHTML = html;
    this._syncHead();
    this._fixActive();
  },
  _thHTML(c) {
    if (c.special === 'select') {
      return `<th class="o-dt-th o-dt-sel" role="columnheader" scope="col" data-col="__select">${this._selMode === 'multi' ? `<input type="checkbox" class="o-check-input o-dt-check-all" tabindex="-1" aria-label="${esc(this.t('table.selectAll'))}">` : `<span class="o-sr-only">${esc(this.t('table.selectRow'))}</span>`}</th>`;
    }
    if (c.special === 'expand') {
      return `<th class="o-dt-th o-dt-exp" role="columnheader" scope="col" data-col="__expand">${this.detail ? `<button type="button" class="o-dt-toggle o-dt-expand-all" tabindex="-1" aria-expanded="false" aria-label="${esc(this.t('table.expandAll'))}">${icon('chevron-right')}</button>` : ''}<span class="o-sr-only">${esc(this.t('table.details'))}</span></th>`;
    }
    const tip = c.headerTooltip ? ` title="${esc(c.headerTooltip)}"` : c.sortable && this.multiSort ? ` title="${esc(this.t('table.sortHint'))}"` : '';
    return `<th class="${cls('o-dt-th', c.align !== 'start' && 'is-' + c.align, c.sortable && 'is-sortable', c.headerClass)}" role="columnheader" scope="col" data-col="${esc(c.id)}"${tip}>`
      + `<div class="o-dt-th-in"><span class="o-dt-th-label">${esc(c.title)}</span>`
      + (c.sortable ? '<span class="o-dt-sort" aria-hidden="true"></span>' : '')
      + (c.filterable && !this.filterRow ? `<button type="button" class="o-dt-fbtn" tabindex="-1" aria-haspopup="dialog" aria-label="${esc(this.t('table.filterColumn', { column: c.title }))}">${icon('filter')}</button>` : '')
      + '</div>' + (c.resizable ? '<span class="o-dt-resizer" aria-hidden="true"></span>' : '') + '</th>';
  },
  /** Refresh sort indicators, filter-button states and the select-all checkbox without rebuilding the header. */
  _syncHead() {
    const sort = toArr(this.sort), multi = sort.length > 1;
    for (const th of this._thead.querySelectorAll('.o-dt-hrow > th[data-col]')) {
      const c = this._colById.get(th.dataset.col);
      if (!c) continue;
      if (c.sortable) {
        const i = sort.findIndex(s => s.key === c.key), s = sort[i];
        th.classList.toggle('is-sorted', !!s);
        if (s) th.setAttribute('aria-sort', s.dir === 'desc' ? 'descending' : 'ascending'); else th.removeAttribute('aria-sort');
        const ic = th.querySelector('.o-dt-sort');
        const want = s ? s.dir + (multi ? i + 1 : '') : 'none';
        if (ic && ic.__s !== want) { ic.__s = want; ic.innerHTML = String(icon(s ? (s.dir === 'desc' ? 'arrow-down' : 'arrow-up') : 'chevrons-up-down')) + (s && multi ? `<sup>${i + 1}</sup>` : ''); }
      }
      const fb = th.querySelector('.o-dt-fbtn');
      if (fb) fb.classList.toggle('is-active', !dtFilterEmpty(this.filters?.[this._filterKey(c)]));
    }
    this._syncCheckAll();
    this._syncFilterRow?.();
  },
  _syncCheckAll() {
    const cb = this._thead.querySelector('.o-dt-check-all');
    if (!cb) return;
    const rows = this._pageRows(), n = rows.filter(r => this._isSelected(r)).length;
    cb.checked = !!rows.length && n === rows.length;
    cb.indeterminate = n > 0 && n < rows.length;
    cb.disabled = !rows.length;
  },

  /** Base width: user-resized > column.width > estimate. */
  _baseWidth(c) { return clamp(this._widths[c.id] ?? c.width ?? dtDefaultWidth(c, this), c.minWidth, c.maxWidth); },
  _actionsWidth() {
    const acts = toArr(this.rowActions), inl = acts.filter(a => a.inline || acts.length <= 2).length, menu = acts.length > inl;
    return Math.max(56, (inl + (menu ? 1 : 0)) * 34 + 22 + (this.editMode === 'row' ? 34 : 0));
  },
  /** Distribute spare width to flexible columns, write <col> widths and the frozen-column stylesheet. */
  _layout() {
    const cols = this._vis;
    if (!cols.length) { this._style.textContent = ''; return; }
    const stacked = this.classList.contains('is-stacked');
    const avail = this._scroll.clientWidth;
    const w = cols.map(c => this._baseWidth(c));
    let sum = w.reduce((a, b) => a + b, 0);
    if (avail > sum && !stacked) {
      const flex = cols.map(c => !c.special && c.type !== 'actions' && this._widths[c.id] == null && c.width == null);
      const fsum = w.reduce((s, x, i) => s + (flex[i] ? x : 0), 0), extra = avail - sum;
      if (fsum > 0) w.forEach((x, i) => { if (flex[i]) w[i] = x + Math.floor((extra * x) / fsum); });
      else { const li = cols.map(c => !c.special && c.type !== 'actions').lastIndexOf(true); if (li >= 0) w[li] += extra; }
      sum = w.reduce((a, b) => a + b, 0);
    }
    this._w = w;
    const colEls = this._colgroup.children;
    cols.forEach((c, i) => { if (colEls[i]) colEls[i].style.width = w[i] + 'px'; });
    this._table.style.width = stacked ? '' : sum + 'px';
    this.style.setProperty('--o-dt-vw', (avail || 0) + 'px');
    // frozen columns
    const u = '.' + this._uidc;
    const body = n => `${u} .o-dt-row>:nth-child(${n})`, head = n => `${u} .o-dt-hrow>:nth-child(${n}),${u} .o-dt-frow>:nth-child(${n}),${u} .o-dt-foot>:nth-child(${n})`;
    let css = '', off = 0, lastS = -1, firstE = -1;
    if (stacked) { this._style.textContent = ''; this._scrollShadows(); return; }
    cols.forEach((c, i) => { if (c.frozen === 'start') { css += `${body(i + 1)}{position:sticky;inset-inline-start:${off}px;z-index:1}${head(i + 1)}{inset-inline-start:${off}px;z-index:4}`; off += w[i]; lastS = i; } });
    off = 0;
    for (let i = cols.length - 1; i >= 0; i--) if (cols[i].frozen === 'end') { css += `${body(i + 1)}{position:sticky;inset-inline-end:${off}px;z-index:1}${head(i + 1)}{inset-inline-end:${off}px;z-index:4}`; off += w[i]; firstE = i; }
    if (lastS >= 0) css += `${u}.is-scroll-s .o-dt-row>:nth-child(${lastS + 1}),${u}.is-scroll-s .o-dt-hrow>:nth-child(${lastS + 1}),${u}.is-scroll-s .o-dt-frow>:nth-child(${lastS + 1}),${u}.is-scroll-s .o-dt-foot>:nth-child(${lastS + 1}){box-shadow:var(--o-dt-shadow-s)}`;
    if (firstE >= 0) css += `${u}.is-scroll-e .o-dt-row>:nth-child(${firstE + 1}),${u}.is-scroll-e .o-dt-hrow>:nth-child(${firstE + 1}),${u}.is-scroll-e .o-dt-frow>:nth-child(${firstE + 1}),${u}.is-scroll-e .o-dt-foot>:nth-child(${firstE + 1}){box-shadow:var(--o-dt-shadow-e)}`;
    if (this._style.textContent !== css) this._style.textContent = css;
    this._scrollShadows();
    this._measureHead();
  },
  _measureHead() {
    const hr = this._thead.firstElementChild;
    if (hr) this.style.setProperty('--o-dt-head-h', hr.offsetHeight + 'px');
  },
  _scrollShadows() {
    const el = this._scroll, max = el.scrollWidth - el.clientWidth, x = Math.abs(el.scrollLeft);
    this.classList.toggle('is-scroll-s', max > 1 && x > 1);
    this.classList.toggle('is-scroll-e', max > 1 && x < max - 1);
  },
  /** Page-level sticky header: translate header cells while the table scrolls under the page top. */
  _pageSticky() {
    if (!this.stickyHeader || this._ownScroll || this.classList.contains('is-stacked') || !this.isConnected) return;
    const r = this._scroll.getBoundingClientRect(), hh = this._thead.offsetHeight, top = +this.stickyOffset || 0;
    const y = r.top < top && r.bottom - hh > top ? Math.min(top - r.top, r.height - hh) : 0;
    if (y !== this._sy) { this._sy = y; if (y) this._table.style.setProperty('--o-dt-sy', y + 'px'); else this._table.style.removeProperty('--o-dt-sy'); this.classList.toggle('is-stuck', y > 0); }
  },

  /** Responsive modes: stacked cards and priority columns. */
  _onResize() {
    const w = this._scroll.clientWidth;
    const stacked = this.responsive === 'stack' && w > 0 && (w < 480 || (win.matchMedia && win.matchMedia('(max-width: 767.98px)').matches));
    let changed = stacked !== this.classList.contains('is-stacked');
    this.classList.toggle('is-stacked', stacked);
    if (w > 0) this.classList.toggle('is-narrow', w < 640);
    if (this.responsive === 'priority' && w > 0) {
      const data = this._cols.filter(c => !this._hidden.has(c.id));
      const fixed = (this._selMode ? 44 : 0) + 40;
      const prio = (c, i) => c.priority ?? (i < 2 || c.type === 'actions' ? 1 : 2 + i / 100);
      const ranked = data.map((c, i) => [c, prio(c, i)]).sort((a, b) => b[1] - a[1]);
      const hide = new Set();
      let sum = fixed + data.reduce((s, c) => s + this._baseWidth(c), 0);
      for (const [c, p] of ranked) { if (sum <= w || p <= 1) break; hide.add(c.id); sum -= this._baseWidth(c); }
      const key = [...hide].join('|');
      if (key !== [...(this._prio || [])].join('|')) { this._prio = hide; changed = true; this._dropPrioDetails(); }
    } else if (this._prio?.size) { this._prio = null; changed = true; this._dropPrioDetails(); }
    if (changed) { this._computeVisible(); this._renderHead(); this._render(); }
    this._layout();
    if (this.virtual) this._renderBody();
    this._pageSticky();
  },

  _dropPrioDetails() {
    for (const [k, b] of this._details) if (b.__prio) this._details.delete(k);
    this._tbody.querySelectorAll(':scope > .o-dt-detail').forEach(r => r.remove());
  },

  /* ── footer: aggregates ── */
  _renderFoot() {
    const cols = this._vis, show = this.aggregates && cols.some(c => c.aggregate) && this._loaded !== false;
    this._tfoot.hidden = !show;
    if (!show) { this._tfoot.textContent = ''; return; }
    const rows = this._server ? null : this._filtered || [];
    let labelDone = false;
    const cells = cols.map(c => {
      const al = c.align !== 'start' ? ` is-${c.align}` : '';
      if (c.aggregate) return `<td class="o-dt-td${al}" role="gridcell">${dtAggHTML(c, this._server ? this._aggs?.[c.key] : dtAggregate(c, rows))}</td>`;
      if (!labelDone && !c.special) { labelDone = true; return `<th class="o-dt-td" role="rowheader" scope="row">${esc(this.t('table.total'))}</th>`; }
      return '<td class="o-dt-td" role="gridcell"></td>';
    });
    this._tfoot.innerHTML = `<tr class="o-dt-foot" role="row">${cells.join('')}</tr>`;
  },

  /* ── info text & pager ── */
  _renderMeta() {
    const total = this.total, items = this._pageView || [];
    const rows = items.filter(r => !r.__group).length;
    let info = '';
    const paged = this.pagination && !this.virtual && !this.infinite;
    if (!total) info = '';
    else if (paged) {
      const size = +this.pageSize || 10, start = this._server ? (this.page - 1) * size + 1 : null;
      if (this._server) info = this.t('table.showing', { start: fmt.number(start), end: fmt.number(start + rows - 1), total: fmt.number(total) });
      else {
        const all = this._items.length, s = (this.page - 1) * size;
        info = all === total ? this.t('table.showing', { start: fmt.number(s + 1), end: fmt.number(Math.min(all, s + size)), total: fmt.number(total) }) : this.t('table.results', { count: total });
      }
    } else if (this.infinite || (this.virtual && this._server)) info = this.t('table.loaded', { count: fmt.number(this._server ? this._data.length : Math.min(this._limit, total)), total: fmt.number(total) });
    else info = this.t('table.results', { count: total });
    if (!this._server && total < this._data.length && !this.tree) info += ' ' + this.t('table.filteredFrom', { total: fmt.number(this._data.length) });
    this._info.textContent = info;
    this._pagerSlot.hidden = !paged || !total;
    if (!paged || !total) return;
    const pages = this.pageCount;
    if (customElements.get('o-pagination')) {
      let p = this._pager;
      if (!p) {
        p = this._pager = h('o-pagination', { class: 'o-dt-pagination' });
        on(p, 'o-change', e => { e.stopPropagation(); this._onPager(e.detail); });
        this._pagerSlot.replaceChildren(p);
      }
      p.pageSizes = toArr(this.pageSizes);
      p.total = this._server ? this._total : this._items.length;
      p.pageSize = +this.pageSize || 10;
      p.page = clamp(+this.page || 1, 1, pages);
      p.siblings = this.classList.contains('is-narrow') ? 0 : 1;
      p.disabled = !!this._busy && !this._loaded;
      p.texts = this.texts;
    } else {
      this._pagerSlot.innerHTML = `<div class="o-btn-group"><button type="button" class="o-btn o-btn-sm" data-dt-page="prev"${this.page <= 1 ? ' disabled' : ''} aria-label="${esc(t('pagination.prev', { default: 'Previous' }))}">${icon('chevron-left')}</button><button type="button" class="o-btn o-btn-sm" data-dt-page="next"${this.page >= pages ? ' disabled' : ''} aria-label="${esc(t('pagination.next', { default: 'Next' }))}">${icon('chevron-right')}</button></div>`;
    }
  },
  _onPager({ page, pageSize }) {
    if (pageSize && pageSize !== this.pageSize) { this.pageSize = pageSize; this.page = page; this.emit('page', { page, pageSize }); this._persist(); }
    else this.goToPage(page);
    this._scrollTop();
  },
  _scrollTop() {
    if (this._ownScroll) this._scroll.scrollTop = 0;
    else { const r = this.getBoundingClientRect(); if (r.top < 0) this.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' }); }
  },
};
