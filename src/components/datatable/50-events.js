/* ── events: clicks, sorting, selection, expansion, tree, groups, row actions ── */
const DT_EVENTS = {
  _bind() {
    const scrolled = rafThrottle(() => { this._scrollShadows(); if (this.virtual) this._renderBody(); });
    on(this._scroll, 'scroll', scrolled, { passive: true });
    on(this._table, 'click', e => this._onClick(e));
    on(this._table, 'dblclick', e => this._onDblClick(e));
    on(this._table, 'keydown', e => this._onKey(e));
    on(this._table, 'focusin', e => { const c = e.target.closest?.('td,th'); if (c && c === e.target && this._table.contains(c)) this._setActive(c); });
    on(this._table, 'pointerdown', e => {
      if (e.target.closest('.o-dt-resizer')) return this._startResize(e, e.target.closest('.o-dt-resizer'));
      const cell = e.target.closest('td,th');
      if (cell && cell.parentNode.matches('.o-dt-hrow,.o-dt-row:not(.o-dt-skel),.o-dt-group') && !dtIsInteractive(e.target, cell) && !cell.classList.contains('is-editing')) this._setActive(cell);
      const th = e.target.closest('.o-dt-hrow > th');
      if (th) return this._startReorder(e, th);
      if (e.shiftKey && this._selMode && e.target.closest('.o-dt-row')) e.preventDefault();
    });
    on(this, 'click', '[data-dt-act]', (e, b) => this._act(b.dataset.dtAct, b, e));
    on(this._pagerSlot, 'click', '[data-dt-page]', (e, b) => this.goToPage(this.page + (b.dataset.dtPage === 'next' ? 1 : -1)));
  },
  _act(name, el) {
    if (name === 'retry') this.reload();
    else if (name === 'clear-filters') this.clearFilters();
  },

  _onClick(e) {
    const t = e.target;
    if (t.closest('.o-dt-resizer')) return;
    const th = t.closest('.o-dt-hrow > th');
    if (th) {
      const col = this._colById.get(th.dataset.col);
      this._setActive(th);
      if (t.closest('.o-dt-check-all')) { this._selectPage(t.checked); return; }
      if (t.closest('.o-dt-expand-all')) { const b = t.closest('button'); b.getAttribute('aria-expanded') === 'true' ? this.collapseAll() : this.expandAll(); return; }
      if (t.closest('.o-dt-fbtn')) { this._openFilter(col, t.closest('.o-dt-fbtn')); return; }
      if (this._dragged || Date.now() - (this._resizedAt || 0) < 300) return;
      if (col?.sortable) this._toggleSort(col, e.shiftKey || e.ctrlKey || e.metaKey);
      return;
    }
    const tr = t.closest('tr');
    if (!tr || tr.parentNode !== this._tbody) return;
    if (tr.classList.contains('o-dt-group')) { if (!dtIsInteractive(t, tr) || t.closest('.o-dt-group-toggle')) this._toggleGroup(tr.dataset.group); return; }
    if (!tr.classList.contains('o-dt-row') || tr.classList.contains('o-dt-skel')) return;
    const row = tr.__item, key = tr.__k, td = t.closest('td');
    if (td && !td.contains(this._edit?.input)) this._setActive(td);
    if (t.closest('.o-dt-check')) { this._clickSelect(row, key, e, true); return; }
    if (t.closest('.o-dt-expand')) { this.toggleExpand(key); return; }
    if (t.closest('.o-dt-tree-toggle')) { this.toggleNode(key); return; }
    const ab = t.closest('[data-dt-action]');
    if (ab) { this._rowAction(row, ab, e); return; }
    if (t.closest('.o-dt-editor')) return;
    if (dtIsInteractive(t, td)) return;
    const col = td ? this._vis[td.cellIndex] : null;
    if (this._selMode && (e.shiftKey || e.ctrlKey || e.metaKey || this.selectOnClick)) this._clickSelect(row, key, e, false);
    this.emit('row-click', { row, key, column: col?.key ?? col?.id, event: e });
  },
  _onDblClick(e) {
    const t = e.target;
    const rz = t.closest('.o-dt-resizer');
    if (rz) { const col = this._colById.get(rz.closest('th').dataset.col); if (col) this.autofitColumn(col.id); return; }
    const td = t.closest('td'), tr = td?.parentNode;
    if (!tr || tr.parentNode !== this._tbody || !tr.classList.contains('o-dt-row') || dtIsInteractive(t, td)) return;
    const col = this._vis[td.cellIndex];
    if (this._canEdit(col, tr.__item)) { e.preventDefault(); this.editMode === 'row' ? this.editRow(tr.__k) : this.editCell(tr.__k, col.id); return; }
    this.emit('row-dblclick', { row: tr.__item, key: tr.__k, column: col?.key ?? col?.id, event: e });
  },

  /* ── sorting (tri-state; Shift adds a level) ── */
  _toggleSort(col, multi) {
    const cur = toArr(this.sort), i = cur.findIndex(s => s.key === col.key), s = cur[i];
    const dir = !s ? (col.sortFirst || 'asc') : s.dir === (col.sortFirst === 'desc' ? 'desc' : 'asc') ? (s.dir === 'asc' ? 'desc' : 'asc') : null;
    let next;
    if (multi && this.multiSort) {
      next = cur.filter(x => x.key !== col.key);
      if (dir) { if (s) next.splice(i, 0, { key: col.key, dir }); else next.push({ key: col.key, dir }); }
    } else next = dir ? [{ key: col.key, dir }] : [];
    this.sort = next;
    this.emit('sort', { sort: next, column: col.key });
    announce(dir ? this.t('table.sortAnnounce', { column: col.title, dir: this.t(dir === 'asc' ? 'table.sortedAsc' : 'table.sortedDesc') }) : this.t('table.sortCleared'));
  },

  /* ── selection ── */
  _clickSelect(row, key, e, fromBox) {
    if (this._selMode === 'single') {
      const was = this._sel.has(key);
      this._sel.clear();
      if (!was || !fromBox) this._sel.set(key, row);
    } else if (e.shiftKey && this._anchor != null && this._anchor !== key) {
      const list = (this.virtual ? this._items : this._pageView || []).filter(r => !r.__group);
      const a = list.findIndex(r => this.keyOf(r) === this._anchor), b = list.findIndex(r => r === row);
      if (a >= 0 && b >= 0) { const on = !fromBox || !!e.target.checked; for (const r of list.slice(Math.min(a, b), Math.max(a, b) + 1)) this._setSel(r, on); }
      else this._setSel(row, !this._sel.has(key));
    } else this._setSel(row, !this._isSelected(row, key));
    this._anchor = key;
    this._selChanged();
  },
  /** Select / deselect one row (tree: with descendants, then fix ancestors). */
  _setSel(row, on) {
    if (this._selAll && !on) { this._selAll = false; for (const r of this._pageRows()) this._sel.set(this.keyOf(r), r); }
    const list = this.tree ? [row, ...this._descendants(row)] : [row];
    for (const r of list) { const k = this.keyOf(r); if (on) this._sel.set(k, r); else this._sel.delete(k); }
    if (this.tree) {
      for (let p = this._parentOf(row); p; p = this._parentOf(p)) {
        const kids = this._kids(p) || [], all = kids.length && kids.every(c => this._sel.has(this.keyOf(c)));
        if (all) this._sel.set(this.keyOf(p), p); else this._sel.delete(this.keyOf(p));
      }
    }
  },
  _parentOf(row) {
    if (!this._parents || this._parentsFor !== this._data) {
      this._parents = new Map(); this._parentsFor = this._data;
      const walk = (list, p) => { for (const r of list) { if (p) this._parents.set(r, p); const k = this._kids(r); if (k) walk(k, r); } };
      walk(this._data, null);
    }
    return this._parents.get(row) || null;
  },
  _selectPage(on) {
    for (const r of this._pageRows()) this._setSel(r, on);
    if (!on) this._selAll = false;
    this._selChanged();
  },
  /** selectAll('page' | 'all') — 'all' selects every filtered row (server: every matching row on the server). */
  selectAll(scope = 'all') {
    if (this._selMode !== 'multi') return;
    if (scope === 'page') return this._selectPage(true);
    if (this._server) { this._selAll = true; for (const r of this._data) this._sel.set(this.keyOf(r), r); }
    else for (const r of this.tree ? this._flatAll() : this._filtered || []) this._sel.set(this.keyOf(r), r);
    this._selChanged();
  },
  clearSelection() { this._sel.clear(); this._selAll = false; this._selChanged(); },
  /** select(keysOrRows, on = true) */
  select(refs, on = true) { for (const r of toArr(refs)) { const row = this.rowOf(r); if (row) this._setSel(row, on); } this._selChanged(); },
  _selChanged(silent) {
    for (const tr of this._tbody.children) if (tr.__item && tr.classList.contains('o-dt-row')) this._syncRow(tr, tr.__item, +tr.getAttribute('aria-rowindex') - this._headRows() - 1);
    this._syncCheckAll();
    this._syncChrome();
    if (!silent) this._emitSelect();
  },
  _emitSelect() {
    const rows = this.getSelected(), count = this._selAll ? this._total : rows.length;
    this.emit('select', { rows, keys: [...this._sel.keys()], count, all: !!this._selAll, query: this._selAll ? this.getQuery() : undefined });
    announce(count ? this.t('table.selected', { count }) : this.t('table.selected', { count: 0 }));
  },

  /* ── master-detail ── */
  toggleExpand(ref, force) {
    const row = this.rowOf(ref); if (!row) return;
    const key = this.keyOf(row), open = force ?? !this._expanded.has(key);
    if (open === this._expanded.has(key)) return;
    if (open) this._expanded.add(key); else this._expanded.delete(key);
    this._renderBody();
    this._syncExpandAll();
    this.emit('expand', { row, key, expanded: open });
  },
  expand(ref) { this.toggleExpand(ref, true); },
  collapse(ref) { this.toggleExpand(ref, false); },
  expandAll() {
    if (this.tree) { for (const r of this._flatAll()) if (this._hasKids(r) && this._kids(r)) this._open.add(this.keyOf(r)); this._run('items'); this._render(); return; }
    if (this.groupBy) { this._collapsed.clear(); this._run('items'); this._render(); return; }
    for (const r of this._pageRows()) this._expanded.add(this.keyOf(r));
    this._renderBody(); this._syncExpandAll();
    this.emit('expand', { all: true, expanded: true });
  },
  collapseAll() {
    if (this.tree) { this._open.clear(); this._run('items'); this._render(); return; }
    if (this.groupBy) { for (const g of this._groups || []) this._collapsed.add(g.key); this._run('items'); this._render(); return; }
    this._expanded.clear(); this._renderBody(); this._syncExpandAll();
    this.emit('expand', { all: true, expanded: false });
  },
  _syncExpandAll() {
    const b = this._thead.querySelector('.o-dt-expand-all'); if (!b) return;
    const rows = this._pageRows(), all = !!rows.length && rows.every(r => this._expanded.has(this.keyOf(r)));
    b.setAttribute('aria-expanded', String(all));
    b.setAttribute('aria-label', this.t(all ? 'table.collapseAll' : 'table.expandAll'));
  },

  /* ── tree grid ── */
  async toggleNode(ref, force) {
    const row = this.rowOf(ref); if (!row || !this._hasKids(row)) return;
    const key = this.keyOf(row), open = force ?? !this._open.has(key);
    if (open && !this._kids(row) && isFn(this.tree?.lazy)) {
      if (this._lazyLoading.has(key)) return;
      this._lazyLoading.add(key); this._renderRows([row]);
      try { row[this.tree.childrenKey || 'children'] = toArr(await this.tree.lazy(row)); this._reindex(); this._parents = null; }
      catch (e) { this.emit('error', { error: e, row }); }
      finally { this._lazyLoading.delete(key); }
      if (this._sel.has(key)) for (const d of this._descendants(row)) this._sel.set(this.keyOf(d), d);
    }
    if (open) this._open.add(key); else this._open.delete(key);
    this._run('items');
    this._force = true;
    const tr = [...this._tbody.children].find(r => r.__k === key); if (tr) tr.__stale = true;
    this._render();
    this.emit('expand', { row, key, expanded: open, tree: true });
  },
  _toggleGroup(gkey) {
    if (this._collapsed.has(gkey)) this._collapsed.delete(gkey); else this._collapsed.add(gkey);
    this._run('items');
    const tr = [...this._tbody.children].find(r => r.__k === gkey); if (tr) tr.remove();
    this._render();
    this._focusCell(gkey, null);
  },

  /* ── row actions ── */
  _actionList(row) { return toArr(this.rowActions).filter(a => !(isFn(a.hidden) ? a.hidden(row) : a.hidden)); },
  /** { inline, menu } — up to two actions (or inline: true ones) as buttons, the rest in a "⋯" menu. */
  _splitActions(row) {
    const acts = this._actionList(row), few = acts.length <= 2;
    return { inline: acts.filter(a => few || a.inline), menu: acts.filter(a => !few && !a.inline) };
  },
  _actionsHTML(row) {
    if (this.editMode === 'row' && this._rowEdit?.key === this.keyOf(row)) return this._rowEditButtons();
    const { inline, menu: menuActs } = this._splitActions(row), menu = menuActs.length > 0;
    const all = toArr(this.rowActions);
    let out = inline.map(a => {
      const dis = isFn(a.disabled) ? a.disabled(row) : a.disabled, label = isFn(a.label) ? a.label(row) : a.label;
      return `<button type="button" class="o-btn o-btn-ghost o-btn-sm${a.icon ? ' o-btn-icon' : ''}${a.variant ? ' o-dt-act-' + esc(a.variant) : ''}" data-dt-action="${all.indexOf(a)}" tabindex="-1" aria-label="${esc(label)}" title="${esc(label)}"${dis ? ' disabled' : ''}>${a.icon ? icon(a.icon) : esc(label)}</button>`;
    }).join('');
    if (this.editMode === 'row' && this._cols.some(c => c.editable)) out = `<button type="button" class="o-btn o-btn-ghost o-btn-sm o-btn-icon" data-dt-action="edit-row" tabindex="-1" aria-label="${esc(this.t('table.edit'))}" title="${esc(this.t('table.edit'))}">${icon('edit')}</button>` + out;
    if (menu) out += `<button type="button" class="o-btn o-btn-ghost o-btn-sm o-btn-icon" data-dt-action="menu" tabindex="-1" aria-haspopup="menu" aria-label="${esc(this.t('table.moreActions'))}" title="${esc(this.t('table.moreActions'))}">${icon('more-horizontal')}</button>`;
    return `<span class="o-dt-actions-in">${out}</span>`;
  },
  _rowAction(row, btn, e) {
    const id = btn.dataset.dtAction;
    if (id === 'edit-row') return this.editRow(this.keyOf(row));
    if (id === 'save-row') return this.saveRowEdit();
    if (id === 'cancel-row') return this.cancelRowEdit();
    if (id === 'menu') {
      const acts = this._splitActions(row).menu;
      return this._menu(btn, acts.map(a => ({ label: isFn(a.label) ? a.label(row) : a.label, icon: a.icon, variant: a.variant, disabled: isFn(a.disabled) ? a.disabled(row) : a.disabled, divider: a.divider, run: () => this._runAction(a, row, btn) })));
    }
    const a = toArr(this.rowActions)[+id];
    if (a) this._runAction(a, row, btn, e);
  },
  async _runAction(a, row, anchor, e) {
    if (a.confirm && !(await this._confirm(isFn(a.confirm) ? a.confirm(row) : a.confirm === true ? this.t('table.confirm') : a.confirm, anchor, a.variant))) return;
    try { await a.action?.(row, { table: this, event: e, key: this.keyOf(row) }); } catch (err) { console.error('[Orion] row action', err); }
  },
};
