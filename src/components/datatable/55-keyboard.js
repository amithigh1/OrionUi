/* ── ARIA grid keyboard navigation, column resize / reorder, column API ── */
const DT_KEYS = {
  /** Navigable rows: header row + data / group rows currently rendered. */
  _navRows() { return [this._thead.querySelector('.o-dt-hrow'), ...[...this._tbody.children].filter(r => r.classList.contains('o-dt-row') && !r.classList.contains('o-dt-skel') || r.classList.contains('o-dt-group'))].filter(Boolean); },
  _cellKey(cell) { const tr = cell.parentNode; return tr.classList.contains('o-dt-hrow') ? '__head' : tr.__k; },
  _setActive(cell) {
    if (!cell || cell.tabIndex === 0 && cell === this._activeEl) return;
    if (this._activeEl && this._activeEl !== cell) this._activeEl.removeAttribute('tabindex');
    cell.tabIndex = 0;
    this._activeEl = cell;
    const tr = cell.parentNode;
    this._active = { key: this._cellKey(cell), col: tr.classList.contains('o-dt-group') ? null : this._vis[cell.cellIndex]?.id ?? null };
  },
  /** Keep exactly one tabbable cell after re-rendering (and restore focus if it was inside). */
  _fixActive() {
    const had = this._table.contains(doc.activeElement) || (this._activeEl && !this._activeEl.isConnected && doc.activeElement === doc.body && this._hadFocus);
    let cell = this._findCell(this._active.key, this._active.col);
    if (!cell) cell = this._thead.querySelector('.o-dt-hrow > th');
    if (!cell) return;
    for (const c of this._table.querySelectorAll('[tabindex="0"]')) if (c !== cell && (c.tagName === 'TD' || c.tagName === 'TH')) c.removeAttribute('tabindex');
    this._setActive(cell);
    if (had && !this._table.contains(doc.activeElement)) cell.focus({ preventScroll: true });
    this._hadFocus = false;
  },
  _findCell(key, colId) {
    let tr = null;
    if (key === '__head') tr = this._thead.querySelector('.o-dt-hrow');
    else if (key != null) tr = [...this._tbody.children].find(r => r.__k === key);
    if (!tr) return null;
    if (tr.classList.contains('o-dt-group')) return tr.cells[0];
    const i = this._vis.findIndex(c => c.id === colId);
    return tr.cells[i >= 0 ? i : 0] || tr.cells[0] || null;
  },
  _focusCell(key, colId) {
    const cell = this._findCell(key, colId ?? this._active.col);
    if (!cell) return null;
    this._setActive(cell);
    cell.focus({ preventScroll: true });
    this._reveal(cell);
    return cell;
  },
  /** Scroll a cell into view, accounting for the sticky header and frozen columns. */
  _reveal(cell) {
    const sc = this._scroll, cr = cell.getBoundingClientRect(), sr = sc.getBoundingClientRect();
    if (cell.parentNode.parentNode === this._tbody) {
      const hh = this._thead.offsetHeight, top = (this._ownScroll ? sr.top : Math.max(0, +this.stickyOffset || 0)) + hh;
      const bottom = this._ownScroll ? sr.bottom : doc.documentElement.clientHeight;
      if (cr.top < top) (this._ownScroll ? sc : win).scrollBy(0, cr.top - top);
      else if (cr.bottom > bottom) (this._ownScroll ? sc : win).scrollBy(0, cr.bottom - bottom);
    }
    const col = this._vis[cell.cellIndex];
    if (col && !col.frozen && cell.colSpan === 1) {
      let fs = 0, fe = 0;
      this._vis.forEach((c, i) => { if (c.frozen === 'start') fs += this._w?.[i] || 0; if (c.frozen === 'end') fe += this._w?.[i] || 0; });
      const rtl = isRTL(this), s = rtl ? sr.right - cr.right : cr.left - sr.left, e = rtl ? cr.left - sr.left : sr.right - cr.right;
      if (s < fs) sc.scrollLeft += (rtl ? 1 : -1) * (fs - s);
      else if (e < fe) sc.scrollLeft += (rtl ? -1 : 1) * (fe - e);
    }
  },

  _onKey(e) {
    if (e.defaultPrevented || e.isComposing) return;
    const cell = e.target.closest('td,th');
    if (this._edit || this._rowEdit) { if (this._editKey?.(e)) return; }
    if (!cell || e.target !== cell) {
      if (e.key === 'Escape' && cell && cell.contains(e.target) && !e.target.closest('.o-dt-frow')) { e.preventDefault(); cell.focus(); }
      return;
    }
    const tr = cell.parentNode, head = tr.classList.contains('o-dt-hrow'), group = tr.classList.contains('o-dt-group');
    if (tr.classList.contains('o-dt-frow')) return;
    const col = group ? null : this._vis[cell.cellIndex], rows = this._navRows(), ri = rows.indexOf(tr);
    const ctrl = e.ctrlKey || e.metaKey;
    let k = e.key;
    if (isRTL(this) && (k === 'ArrowLeft' || k === 'ArrowRight')) k = k === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    const go = (r, c) => { const row = rows[clamp(r, 0, rows.length - 1)]; if (!row) return; const cells = row.cells, target = cells[clamp(c, 0, cells.length - 1)]; if (target) { this._setActive(target); target.focus({ preventScroll: true }); this._reveal(target); } };
    const ci = cell.cellIndex;
    const virtualMove = delta => {
      if (!this.virtual || head) return false;
      const items = this._items, idx = items.indexOf(tr.__item), to = clamp(idx + delta, 0, items.length - 1);
      if (to === idx) return true;
      const target = items[to], key = target.__group ? target.key : this.keyOf(target);
      if (!this._findCell(key, col?.id)) { const rh = this._rh || DT_ROW_H[this.density]; this._scroll.scrollTop = Math.max(0, to * rh - this._scroll.clientHeight / 2); this._renderBody(); }
      this._focusCell(key, col?.id);
      return true;
    };
    // header shortcuts: resize & move columns
    if (head && col && !col.special && ctrl && (k === 'ArrowLeft' || k === 'ArrowRight')) {
      e.preventDefault();
      const dir = k === 'ArrowRight' ? 1 : -1;
      if (e.shiftKey) this._moveBy(col, dir); else if (col.resizable) this.setColumnWidth(col.id, (this._w?.[ci] || this._baseWidth(col)) + dir * (e.altKey ? 50 : 10), true);
      return;
    }
    switch (k) {
      case 'ArrowDown': e.preventDefault(); if (!virtualMove(1)) go(ri + 1, ci); return;
      case 'ArrowUp': e.preventDefault(); if (!(this.virtual && !head && this._items.indexOf(tr.__item) > 0 && virtualMove(-1))) go(ri - 1, ci); return;
      case 'ArrowRight':
        e.preventDefault();
        if (this.tree && col === this._treeCol && !head) { const ti = this._tinfo?.get(tr.__item); if (ti?.hasKids && !ti.open) { this.toggleNode(tr.__k, true); return; } }
        if (group && this._collapsed.has(tr.dataset.group)) { this._toggleGroup(tr.dataset.group); return; }
        go(ri, ci + 1); return;
      case 'ArrowLeft':
        e.preventDefault();
        if (this.tree && col === this._treeCol && !head) {
          const ti = this._tinfo?.get(tr.__item);
          if (ti?.open) { this.toggleNode(tr.__k, false); return; }
          if (ti?.parent) { this._focusCell(this.keyOf(ti.parent), col.id); return; }
        }
        if (group && !this._collapsed.has(tr.dataset.group)) { this._toggleGroup(tr.dataset.group); return; }
        go(ri, ci - 1); return;
      case 'Home': e.preventDefault(); if (ctrl && this.virtual) { this._scroll.scrollTop = 0; this._renderBody(); } go(ctrl ? 0 : ri, 0); return;
      case 'End': e.preventDefault(); if (ctrl) { if (this.virtual) { this._scroll.scrollTop = this._scroll.scrollHeight; this._renderBody(); const rr = this._navRows(); const last = rr[rr.length - 1]; if (last) { this._setActive(last.cells[last.cells.length - 1]); last.cells[last.cells.length - 1].focus(); } return; } go(rows.length - 1, 99); } else go(ri, 99); return;
      case 'PageDown': e.preventDefault(); if (!virtualMove(10)) go(ri + 10, ci); return;
      case 'PageUp': e.preventDefault(); if (!virtualMove(-10)) go(Math.max(ri - 10, head ? 0 : 1), ci); return;
      case 'Enter':
        e.preventDefault();
        if (head) { if (col?.sortable) this._toggleSort(col, e.shiftKey); else cell.querySelector('input,button')?.click(); return; }
        if (group) { this._toggleGroup(tr.dataset.group); return; }
        if (col?.special === 'expand') { this.toggleExpand(tr.__k); return; }
        if (col?.special === 'select') { this._clickSelect(tr.__item, tr.__k, e, false); return; }
        if (this._canEdit(col, tr.__item)) { this.editMode === 'row' ? this.editRow(tr.__k) : this.editCell(tr.__k, col.id); return; }
        if (this.tree && col === this._treeCol && this._tinfo?.get(tr.__item)?.hasKids) { this.toggleNode(tr.__k); return; }
        { const w = focusables(cell)[0] || cell.querySelector('a,button:not(:disabled),input,select'); if (w) { w.tabIndex = 0; w.focus(); if (w.tagName === 'A') w.click(); return; } }
        this.emit('row-click', { row: tr.__item, key: tr.__k, column: col?.key ?? col?.id, event: e });
        return;
      case 'F2': if (!head && this._canEdit(col, tr.__item)) { e.preventDefault(); this.editCell(tr.__k, col.id); } return;
      case ' ':
        if (head) { if (col?.special === 'select') { e.preventDefault(); const cb = cell.querySelector('input'); if (cb) { cb.checked = !cb.checked; this._selectPage(cb.checked); } } else if (col?.sortable) { e.preventDefault(); this._toggleSort(col, e.shiftKey); } return; }
        if (this._selMode && !group) { e.preventDefault(); this._clickSelect(tr.__item, tr.__k, e, false); }
        return;
      case 'a': case 'A':
        if (ctrl && this._selMode === 'multi') { e.preventDefault(); const all = this.getSelected().length >= this.total && this.total > 0; all ? this.clearSelection() : this.selectAll(this._server ? 'page' : 'all'); }
        return;
      case 'z': case 'Z': if (ctrl && !e.shiftKey && this._undo.length) { e.preventDefault(); this.undo(); } return;
    }
  },

  /* ── resizing ── */
  _startResize(e, handle) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const th = handle.closest('th'), col = this._colById.get(th.dataset.col); if (!col) return;
    const i = this._vis.indexOf(col), w0 = this._w?.[i] || th.offsetWidth, x0 = e.clientX, rtl = isRTL(this);
    try { handle.setPointerCapture(e.pointerId); } catch {}
    this.classList.add('is-resizing');
    const move = rafThrottle(ev => this.setColumnWidth(col.id, w0 + (ev.clientX - x0) * (rtl ? -1 : 1), false));
    const offM = on(handle, 'pointermove', move);
    const offU = on(handle, 'pointerup pointercancel lostpointercapture', () => {
      offM(); offU(); move.cancel?.(); this.classList.remove('is-resizing'); this._resizedAt = Date.now();
      this._persist(); this.emit('column-resize', { column: col.key ?? col.id, width: this._widths[col.id] });
    });
  },
  /** setColumnWidth(id, px) — persisted when state-key is set */
  setColumnWidth(id, px, announceIt) {
    const col = this._colById.get(id); if (!col) return;
    this._widths[id] = Math.round(clamp(+px || col.minWidth, col.minWidth, col.maxWidth));
    this._layout();
    if (announceIt) { announce(this.t('table.columnResized', { column: col.title, width: this._widths[id] })); this._persist(); }
  },
  /** Fit a column to its widest rendered content (double-click on the resize handle). */
  autofitColumn(id) {
    const col = this._colById.get(id), i = this._vis.indexOf(col); if (i < 0) return;
    const rg = doc.createRange(), n = i + 1;
    let max = 0;
    const th = this._thead.querySelector(`.o-dt-hrow > :nth-child(${n})`);
    if (th) { const l = th.querySelector('.o-dt-th-label'); rg.selectNodeContents(l); max = rg.getBoundingClientRect().width + 34 + (col.sortable ? 20 : 0) + (col.filterable ? 28 : 0); }
    const cells = this._tbody.querySelectorAll(`.o-dt-row > :nth-child(${n})`);
    let pad = 0;
    if (cells[0]) { const cs = getComputedStyle(cells[0]); pad = parseFloat(cs.paddingInlineStart) + parseFloat(cs.paddingInlineEnd) + 2; }
    for (const c of cells) { rg.selectNodeContents(c); max = Math.max(max, rg.getBoundingClientRect().width + pad); }
    this.setColumnWidth(id, Math.ceil(max), true);
  },

  /* ── reordering ── */
  _startReorder(e, th) {
    if (e.button !== 0 || e.target.closest('.o-dt-resizer,.o-dt-fbtn,input,button')) return;
    const col = this._colById.get(th.dataset.col);
    if (!col || col.special || !col.reorderable || !this.reorderable) return;
    const x0 = e.clientX, y0 = e.clientY, rtl = isRTL(this);
    let ghost = null, marker = null, target = null, raf = 0;
    const cleanup = () => { offs.forEach(f => f()); ghost?.remove(); marker?.remove(); th.classList.remove('is-dragging'); cancelAnimationFrame(raf); this.classList.remove('is-reordering'); };
    const move = ev => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        ghost = h('div', { class: 'o-floating o-dt-ghost' }, col.title);
        marker = h('div', { class: 'o-dt-drop' });
        portal(ghost, this); this._wrap.append(marker);
        th.classList.add('is-dragging'); this.classList.add('is-reordering');
      }
      ev.preventDefault();
      css(ghost, { position: 'fixed', left: ev.clientX + 12, top: ev.clientY + 8, zIndex: Z.tooltip });
      const ths = [...this._thead.querySelectorAll('.o-dt-hrow > th')].filter(x => { const c = this._colById.get(x.dataset.col); return c && !c.special && (c.frozen || null) === (col.frozen || null); });
      target = null;
      for (const x of ths) {
        const r = x.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right) { const first = ev.clientX < r.left + r.width / 2; target = { id: x.dataset.col, before: rtl ? !first : first, r }; break; }
      }
      if (target) {
        const wr = this._wrap.getBoundingClientRect(), edge = (target.before !== rtl) ? target.r.left : target.r.right;
        css(marker, { display: 'block', left: edge - wr.left - 1, top: target.r.top - wr.top, height: this._scroll.clientHeight - Math.max(0, target.r.top - this._scroll.getBoundingClientRect().top) });
      } else marker.style.display = 'none';
      const sr = this._scroll.getBoundingClientRect();
      cancelAnimationFrame(raf);
      const edgeScroll = () => { const d = ev.clientX < sr.left + 40 ? -12 : ev.clientX > sr.right - 40 ? 12 : 0; if (d) { this._scroll.scrollLeft += d; raf = requestAnimationFrame(edgeScroll); } };
      edgeScroll();
    };
    const up = () => {
      const moved = !!ghost;
      cleanup();
      if (moved) { this._dragged = true; setTimeout(() => { this._dragged = false; }, 0); if (target && target.id !== col.id) this.moveColumn(col.id, target.id, target.before); }
    };
    const offs = [on(doc, 'pointermove', move), on(doc, 'pointerup pointercancel', up), on(doc, 'keydown', ev => { if (ev.key === 'Escape') { target = null; up(); } })];
  },
  _moveBy(col, dir) {
    const ids = this._dataVis.filter(c => (c.frozen || null) === (col.frozen || null)).map(c => c.id), i = ids.indexOf(col.id), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    this.moveColumn(col.id, ids[j], dir < 0);
    this._focusCell('__head', col.id);
  },
  /** moveColumn(id, targetIdOrIndex, before = true) */
  moveColumn(id, target, before = true) {
    const order = this.columnOrder.filter(x => x !== id);
    let at = isNum(target) ? clamp(target, 0, order.length) : order.indexOf(target) + (before ? 0 : 1);
    if (at < 0) at = order.length;
    order.splice(at, 0, id);
    this._order = order;
    this._afterColumns();
    const col = this._colById.get(id);
    announce(this.t('table.columnMoved', { column: col?.title || id, pos: this._dataVis.indexOf(col) + 1 }));
    this.emit('column-move', { column: col?.key ?? id, order: [...order] });
  },
  /** setColumnVisible(id, visible) */
  setColumnVisible(id, visible) {
    if (visible) this._hidden.delete(id); else this._hidden.add(id);
    this._userHidden = true;
    this._afterColumns();
    this.emit('column-toggle', { column: id, visible: !!visible });
  },
  /** Restore the original column order, visibility and widths. */
  resetColumns() {
    this._order = null; this._widths = {}; this._userHidden = false;
    this._hidden = new Set(this._cols.filter(c => c.hidden).map(c => c.id));
    this._afterColumns();
  },
  _afterColumns() {
    this._computeVisible();
    this._renderHead();
    this._layout();
    this._render();
    this._persist();
  },
};
