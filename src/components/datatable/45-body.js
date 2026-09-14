/* ── body rendering: keyed row reuse, virtual window, detail / group / state rows ── */
const __dtTpl = isBrowser ? doc.createElement('template') : null;

const DT_BODY = {
  /** Full refresh of everything below the header. */
  _render() {
    if (!this._setupDone) return;
    this._renderBody();
    this._renderFoot();
    this._renderMeta();
    this._syncChrome();
    this._syncCheckAll();
    if (this.infinite || (this.virtual && this._server)) requestAnimationFrame(() => this._checkSentinel());
  },
  _pageRows() { return (this._pageView || []).filter(r => !r.__group); },
  _isSelected(row, key = this.keyOf(row)) { return this._selAll || this._sel.has(key); },

  _renderBody() {
    const items = (this._pageView = this._pageItems());
    const tb = this._tbody, n = Math.max(1, this._vis.length), busy = this._busy || this.loading;
    const sig = [this._vis.map(c => c.id).join(','), this.search, i18n.locale, this.responsive, this.classList.contains('is-stacked'), this._editVer || 0, this.density].join('|');
    if (sig !== this._sig) { this._sig = sig; this._ver = (this._ver || 0) + 1; this._words = dtWords(this.search); }
    let state = null;
    if (this._error && !items.length) state = this._stateHTML('error', n);
    else if (busy && !items.length) state = this._stateHTML('skeleton', n);
    else if (!items.length) state = this._stateHTML('empty', n);
    if (state) { tb.innerHTML = state; this._win = null; this.classList.toggle('is-empty', !busy); return; }
    this.classList.remove('is-empty');
    const list = [];
    let from = 0, to = items.length;
    if (this.virtual) {
      const rh = this._rh || this.rowHeight || DT_ROW_H[this.density] || 44, hh = this._thead.offsetHeight;
      const st = this._scroll.scrollTop, vh = this._scroll.clientHeight || 480, over = 8;
      from = clamp(Math.floor((st - hh) / rh) - over, 0, items.length);
      to = clamp(Math.ceil((st - hh + vh) / rh) + over, from, items.length);
      if (this._win && this._win[0] === from && this._win[1] === to && this._win[2] === items && this._win[3] === this._ver && !this._force) return;
      this._win = [from, to, items, this._ver];
      list.push({ k: '^', kind: 'spacer', h: from * rh });
    }
    const off = this._server ? ((+this.page || 1) - 1) * (+this.pageSize || 10) : this.pagination && !this.virtual && !this.infinite ? ((+this.page || 1) - 1) * (+this.pageSize || 10) : 0;
    for (let i = from; i < to; i++) {
      const it = items[i];
      if (it.__group) { list.push({ k: it.key, kind: 'group', item: it, idx: i }); continue; }
      const key = this.keyOf(it);
      list.push({ k: key, kind: 'row', item: it, idx: off + i });
      if (!this.virtual && (this._expanded.has(key) && (this.detail || this._prio?.size))) list.push({ k: 'd:' + key, kind: 'detail', item: it });
    }
    if (this.virtual) list.push({ k: '$', kind: 'spacer', h: (items.length - to) * (this._rh || this.rowHeight || DT_ROW_H[this.density] || 44) });
    if (this.infinite && this._hasMore()) list.push({ k: '…', kind: 'more' });
    this._force = false;
    this._patch(list, n);
    if (this.virtual && !this._rh) { const r = tb.querySelector('.o-dt-row'); if (r && r.offsetHeight) { this._rh = r.offsetHeight; if (Math.abs(this._rh - (this.rowHeight || DT_ROW_H[this.density])) > 1) { this._win = null; this._renderBody(); } } }
    this._table.setAttribute('aria-rowcount', String((this._server ? this._total : items.length) + this._headRows()));
    this._fixActive();
  },

  /** Keyed patch of <tr> elements: reuse unchanged rows, build the rest from one HTML string. */
  _patch(list, n) {
    const tb = this._tbody, old = new Map(), ver = this._ver;
    for (const tr of tb.children) if (tr.__k != null) old.set(tr.__k, tr);
    const need = [];
    for (const e of list) {
      const tr = old.get(e.k);
      const ok = tr && (e.kind === 'spacer' || e.kind === 'more' || (tr.__item === e.item && (e.kind === 'detail' || (tr.__ver === ver && !tr.__stale))));
      if (ok) { e.el = tr; old.delete(e.k); } else need.push(e);
    }
    if (need.length) {
      const nodes = [];
      __dtTpl.innerHTML = need.map(e => this._itemHTML(e, nodes, n)).join('');
      const trs = [...__dtTpl.content.children];
      need.forEach((e, i) => { const tr = trs[i]; tr.__k = e.k; tr.__ver = ver; tr.__item = e.item; e.el = tr; e.fresh = true; });
      if (nodes.length) for (const ph of __dtTpl.content.querySelectorAll('[data-node]')) ph.replaceWith(nodes[+ph.dataset.node]);
    }
    let prev = null;
    for (const e of list) {
      const next = prev ? prev.nextSibling : tb.firstChild;
      if (e.el !== next) tb.insertBefore(e.el, next);
      prev = e.el;
    }
    while (prev ? prev.nextSibling : tb.firstChild) (prev ? prev.nextSibling : tb.firstChild).remove();
    for (const e of list) {
      if (e.kind === 'row') this._syncRow(e.el, e.item, e.idx);
      else if (e.kind === 'spacer') e.el.firstChild.style.height = e.h + 'px';
      else if (e.kind === 'detail') { e.el.firstChild.colSpan = n; if (e.fresh) this._fillDetail(e.el.firstChild, e.item); }
      if (e.kind !== 'row' && e.el.firstChild && e.el.firstChild.colSpan !== n && e.kind !== 'group') e.el.firstChild.colSpan = n;
    }
  },
  _itemHTML(e, nodes, n) {
    if (e.kind === 'row') return this._rowHTML(e.item, nodes);
    if (e.kind === 'group') return this._groupHTML(e.item);
    if (e.kind === 'detail') return `<tr class="o-dt-detail" role="row"><td class="o-dt-detail-cell" role="gridcell" colspan="${n}"></td></tr>`;
    if (e.kind === 'more') return `<tr class="o-dt-more" role="row"><td colspan="${n}" role="gridcell"><span class="o-dt-sticky-cell"><span class="o-spinner o-spinner-xs"></span> ${esc(this.t('table.loadingMore'))}</span></td></tr>`;
    return `<tr class="o-dt-spacer" aria-hidden="true"><td colspan="${n}"></td></tr>`;
  },

  _rowHTML(row, nodes) {
    const key = this.keyOf(row), ti = this._tinfo?.get(row), dirty = this._dirty.get(key);
    const rc = isFn(this.rowClass) ? this.rowClass(row) : '';
    let html = `<tr class="${cls('o-dt-row', rc)}" role="row" data-key="${esc(key)}">`;
    for (const c of this._vis) html += this._tdHTML(c, row, key, ti, dirty, nodes);
    return html + '</tr>';
  },
  _tdHTML(c, row, key, ti, dirty, nodes) {
    if (c.special === 'select') return `<td class="o-dt-td o-dt-sel" role="gridcell"><input type="checkbox" class="o-check-input o-dt-check" tabindex="-1" aria-label="${esc(this.t('table.selectRow'))}"></td>`;
    if (c.special === 'expand') return `<td class="o-dt-td o-dt-exp" role="gridcell"><button type="button" class="o-dt-toggle o-dt-expand" tabindex="-1" aria-expanded="false" aria-label="${esc(this.t('table.expandRow'))}">${icon('chevron-right')}</button></td>`;
    const edn = (this._edit || this._rowEdit) && this._editorNode(key, c);
    if (edn) { nodes.push(edn); return `<td class="${cls('o-dt-td is-editing', c.align !== 'start' && 'is-' + c.align)}" role="gridcell"><span data-node="${nodes.length - 1}"></span></td>`; }
    let inner = dtCellHTML(c, row, this, this._words);
    if (inner instanceof Node) { nodes.push(inner); inner = `<span data-node="${nodes.length - 1}"></span>`; }
    if (ti && c === this._treeCol) {
      const tg = ti.hasKids ? `<button type="button" class="o-dt-toggle o-dt-tree-toggle" tabindex="-1" aria-label="${esc(this.t(ti.open ? 'table.collapseRow' : 'table.expandRow'))}">${this._lazyLoading.has(key) ? '<span class="o-spinner o-spinner-xs"></span>' : icon('chevron-right')}</button>` : '<span class="o-dt-tree-leaf"></span>';
      inner = `<span class="o-dt-tree" style="--o-dt-level:${ti.level - 1}">${tg}<span class="o-dt-tree-content">${inner}</span></span>`;
    }
    const v = c.cellClass ? c.cellClass(row, c.get(row)) : '';
    const cc = cls('o-dt-td', c.align !== 'start' && 'is-' + c.align, c.className, v, dirty?.has(c.id) && 'is-dirty', c.editable && 'is-editable', c.wrap && 'is-wrap', c.type === 'actions' && 'o-dt-actions');
    return `<td class="${cc}" role="gridcell"${this.responsive === 'stack' && c.title ? ` data-label="${esc(c.title)}"` : ''}>${inner}</td>`;
  },
  _groupHTML(g) {
    const cols = this._vis, n = cols.length;
    const firstAgg = cols.findIndex(c => c.aggregate), span = firstAgg < 1 ? n : firstAgg;
    let html = `<tr class="o-dt-group${g.collapsed ? ' is-collapsed' : ''}" role="row" data-group="${esc(g.key)}" aria-expanded="${!g.collapsed}">`
      + `<td class="o-dt-group-cell" role="gridcell" colspan="${span}"><span class="o-dt-group-in"><button type="button" class="o-dt-toggle o-dt-group-toggle" tabindex="-1" aria-label="${esc(this.t(g.collapsed ? 'table.expandRow' : 'table.collapseRow'))}: ${esc(g.label)}">${icon('chevron-right')}</button>`
      + `<span class="o-dt-group-title"><span class="o-dt-group-col">${esc(g.col.title)}</span> <strong>${esc(g.label)}</strong></span><span class="o-badge o-dt-group-count">${esc(this.t('table.groupRows', { count: g.count }))}</span></span></td>`;
    if (firstAgg >= 1) for (let i = firstAgg; i < n; i++) { const c = cols[i]; html += `<td class="o-dt-td${c.align !== 'start' ? ' is-' + c.align : ''}" role="gridcell">${c.aggregate ? dtAggHTML(c, dtAggregate(c, g.rows), false) : ''}</td>`; }
    return html + '</tr>';
  },
  _stateHTML(kind, n) {
    if (kind === 'skeleton') {
      const r = x => 38 + ((x * 37) % 50);
      return Array.from({ length: clamp(+this.pageSize || 10, 3, 10) }, (_, i) => `<tr class="o-dt-row o-dt-skel" aria-hidden="true">${this._vis.map((c, j) => `<td class="o-dt-td">${c.special ? '' : `<span class="o-skeleton o-skeleton-text" style="width:${r(i + j * 3)}%"></span>`}</td>`).join('')}</tr>`).join('');
    }
    let body;
    if (kind === 'error') {
      const msg = this._error?.message || '';
      body = `<div class="o-empty o-empty-sm is-error" role="alert"><div class="o-empty-icon">${icon('alert-triangle')}</div><p class="o-empty-title">${esc(this.t('table.error'))}</p>${msg ? `<p class="o-empty-text">${esc(msg)}</p>` : ''}<div class="o-empty-actions"><button type="button" class="o-btn o-btn-sm" data-dt-act="retry">${icon('refresh')}<span>${esc(this.t('table.retry'))}</span></button></div></div>`;
    } else {
      const filtered = !!(this.search || Object.values(this.filters || {}).some(v => !dtFilterEmpty(v)) || this.filterFn);
      body = filtered
        ? `<div class="o-empty o-empty-sm"><div class="o-empty-icon">${icon('search')}</div><p class="o-empty-title">${esc(this.t('table.noResults'))}</p><p class="o-empty-text">${esc(this.t('table.noResultsHint'))}</p><div class="o-empty-actions"><button type="button" class="o-btn o-btn-sm" data-dt-act="clear-filters">${esc(this.t('table.clearAll'))}</button></div></div>`
        : `<div class="o-empty o-empty-sm"><div class="o-empty-icon">${icon('inbox')}</div><p class="o-empty-title">${esc(this.emptyText || this.t('table.noData'))}</p></div>`;
    }
    return `<tr class="o-dt-state" role="row"><td role="gridcell" colspan="${n}"><div class="o-dt-sticky-cell">${body}</div></td></tr>`;
  },

  /** Selection / expansion / tree state of a (possibly reused) row element. */
  _syncRow(tr, row, idx) {
    const key = tr.__k, sel = this._isSelected(row, key);
    tr.classList.toggle('is-selected', sel);
    tr.setAttribute('aria-rowindex', String(idx + this._headRows() + 1));
    if (this._selMode) tr.setAttribute('aria-selected', String(sel)); else tr.removeAttribute('aria-selected');
    const cb = tr.querySelector('.o-dt-check');
    if (cb) {
      cb.checked = sel;
      cb.indeterminate = !sel && !!this.tree && this._descendants(row).some(d => this._sel.has(this.keyOf(d)));
    }
    const ex = tr.querySelector('.o-dt-expand');
    if (ex) {
      const open = this._expanded.has(key);
      ex.setAttribute('aria-expanded', String(open));
      ex.setAttribute('aria-label', this.t(open ? 'table.collapseRow' : 'table.expandRow'));
      tr.classList.toggle('is-expanded', open);
    }
    const ti = this._tinfo?.get(row);
    if (ti) {
      tr.setAttribute('aria-level', ti.level); tr.setAttribute('aria-setsize', ti.size); tr.setAttribute('aria-posinset', ti.pos);
      if (ti.hasKids) tr.setAttribute('aria-expanded', String(ti.open)); else tr.removeAttribute('aria-expanded');
      const tg = tr.querySelector('.o-dt-tree-toggle');
      if (tg) tg.setAttribute('aria-label', this.t(ti.open ? 'table.collapseRow' : 'table.expandRow'));
    }
  },
  /** Re-render specific rows in place (after an edit or updateRow). */
  _renderRows(rows) {
    for (const row of rows) {
      const key = this.keyOf(row);
      const tr = [...this._tbody.children].find(r => r.__k === key);
      if (tr) tr.__stale = true;
    }
    this._force = true;
    this._renderBody();
    this._renderFoot();
  },

  /* ── master-detail ── */
  _fillDetail(td, row) {
    const key = this.keyOf(row);
    let box = this._details.get(key);
    if (!box) {
      box = h('div', { class: 'o-dt-detail-body' });
      this._details.set(key, box);
      const parts = [];
      if (this._prio?.size) {
        const cols = this._cols.filter(c => this._prio.has(c.id));
        parts.push(h('dl', { class: 'o-dt-prio' }, cols.flatMap(c => { const v = dtCellHTML(c, row, this, this._words); return [h('dt', {}, c.title), h('dd', {}, v instanceof Node ? v : raw(v))]; })));
        box.__prio = true;
      }
      if (isFn(this.detail)) {
        let out;
        try { out = this.detail(row, { table: this }); } catch (e) { console.error('[Orion] datatable detail', e); out = ''; }
        const put = v => { if (v == null) return; if (v instanceof Node) box.append(v); else if (v instanceof SafeHTML) box.insertAdjacentHTML('beforeend', v.s); else box.insertAdjacentHTML('beforeend', sanitize(String(v))); };
        if (out && isFn(out.then)) {
          const sp = h('div', { class: 'o-dt-detail-loading' }, h('span', { class: 'o-spinner o-spinner-sm' }), ' ', this.t('table.loading'));
          box.append(...parts, sp);
          out.then(v => { sp.remove(); put(v); }, e => { sp.replaceWith(h('div', { class: 'o-empty o-empty-sm is-error' }, e?.message || this.t('table.error'))); });
          td.append(box);
          return;
        }
        box.append(...parts); put(out);
      } else box.append(...parts);
    }
    td.append(box);
  },
};
