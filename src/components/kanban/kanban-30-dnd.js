/* <o-kanban> drag & drop: one Orion.sortable per card list (shared group), one for columns.
 * Cards move in the DOM first (FLIP), then the model is synced from the DOM; o-card-move (cancelable) and the
 * async onMove hook may still revert the move. Hard WIP limits veto drops through the group `put` check. */
Object.assign(OKanban.prototype, {
  _syncSortables(keep) {
    for (const [el, s] of this._sorts) if (!keep.has(el) || !el.isConnected) { s.destroy(); this._sorts.delete(el); }
    for (const el of keep) if (!this._sorts.has(el)) this._sorts.set(el, this._cardSortable(el));
    for (const [el, s] of this._sorts) { s.option('disabled', !!this.readonly); s.option('area', this._hasLanes() ? el.closest('.o-kanban-cell') : el.closest('.o-kanban-col')); }
    const cont = this._hasLanes() ? this.board.querySelector(':scope > .o-kanban-heads') : this.board;
    if (this._colSort && (this._colSort.el !== cont || this._colSortLanes !== this._hasLanes())) { this._colSort.destroy(); this._colSort = null; }
    if (!this._colSort && cont) { this._colSort = this._columnSortable(cont); this._colSortLanes = this._hasLanes(); }
    if (this._colSort) {
      this._colSort.option('disabled', !!(this.readonly || this.lockColumns));
      this._colSort.option('direction', this.variant === 'list' ? 'vertical' : 'horizontal');
    }
  },
  disconnectedDnd() { for (const s of this._sorts.values()) s.cancel(); },
  _cardSortable(el) {
    return O.sortable(el, {
      items: '.o-kanban-card', direction: 'vertical', animation: 200, delayOnTouch: 220, pickKeys: [' '],
      group: { name: this._gid, pull: true, put: (to, from, item) => this._canDrop(to.el, item) },
      preview: item => this._ghost(item),
      label: item => this._card(item.dataset.id)?.title,
      listLabel: null,
      onStart: () => this._dragStart(),
      onEnd: e => this._onCardEnd(e),
    });
  },
  _columnSortable(el) {
    const lanes = this._hasLanes();
    return O.sortable(el, {
      items: lanes ? '.o-kanban-col-head' : '.o-kanban-col', handle: lanes ? null : '.o-kanban-col-head',
      group: this._gid + '-cols', animation: 220, delayOnTouch: 260,
      direction: this.variant === 'list' ? 'vertical' : 'horizontal',
      preview: item => this._ghost(item),
      label: item => this._col(item.dataset.id)?.title,
      onEnd: e => this._onColumnEnd(e),
    });
  },
  _ghost(item) {
    // .o-kanban normally stretches to its container's height; the drag preview is position:fixed and must hug its content instead.
    const w = h('div', { class: 'o-kanban is-ghost', variant: this.variant, style: { height: 'auto', width: item.getBoundingClientRect().width + 'px' } });
    const c = item.cloneNode(true);
    c.classList.remove('o-sortable-placeholder', 'o-sortable-drag');
    w.append(c);
    return w;
  },
  _canDrop(toEl, item) {
    if (!item.classList.contains('o-kanban-card') || !this.contains(toEl)) return false;
    const col = this._col(toEl.dataset.col);
    if (!col || col.collapsed) return false;
    const card = this._card(item.dataset.id);
    if (card && card.columnId === col.id) return true;
    const lim = this._limitOf(col);
    return !(lim && this._blocks(col) && this._count(col.id) >= lim);
  },
  _dragStart() {
    this.classList.add('is-dragging');
    this._menuClose?.();
    for (const col of this.columns) {
      const lim = this._limitOf(col);
      const blocked = lim && this._blocks(col) && this._count(col.id) >= lim;
      if (!blocked) continue;
      this.querySelectorAll(`.o-kanban-col[data-id="${CSS.escape(col.id)}"], .o-kanban-cell[data-col="${CSS.escape(col.id)}"], .o-kanban-col-head[data-id="${CSS.escape(col.id)}"]`).forEach(x => x.classList.add('is-blocked'));
    }
  },
  _dragDone() { this.classList.remove('is-dragging'); this.querySelectorAll('.is-blocked').forEach(x => x.classList.remove('is-blocked')); },
  async _onCardEnd(e) {
    this._dragDone();
    if (e.cancelled || e.dropzone) return;
    const el = e.item, card = this._card(el.dataset.id);
    if (!card || (e.from === e.to && e.oldIndex === e.newIndex)) return;
    const detail = {
      cardId: card.id, card, from: card.columnId, to: e.to.dataset.col, fromLane: card.laneId ?? null, toLane: e.to.dataset.lane || null,
      oldIndex: e.oldIndex, index: e.newIndex, keyboard: e.keyboard,
    };
    if (!this.emit('card-move', detail)) { e.revert(); return; }
    this._syncFromDom();
    this._refreshCounts();
    this._cardPatch(el, card);
    this._save();
    await this._settleMove(el, card, detail, () => e.revert());
  },
  _onColumnEnd(e) {
    if (e.cancelled || e.oldIndex === e.newIndex) return;
    const sel = this._hasLanes() ? '.o-kanban-col-head' : '.o-kanban-col';
    const col = this._col(e.item.dataset.id);
    const detail = { columnId: col?.id, column: col, from: e.oldIndex, to: e.newIndex, keyboard: e.keyboard };
    if (!this.emit('column-move', detail)) { e.revert(); return; }
    this._applyColumnOrder([...e.to.children].filter(x => x.matches(sel)).map(x => x.dataset.id));
    if (!e.keyboard && col) this._say(this.t('kanban.columnMoved', { column: col.title ?? col.id, index: e.newIndex + 1 }));
    this._notify('column-move');
  },
  _applyColumnOrder(ids) {
    const byId = new Map(this.columns.map(c => [c.id, c]));
    this._cols = [...ids.map(id => byId.get(id)).filter(Boolean), ...this.columns.filter(c => !ids.includes(c.id))];
    if (this._hasLanes()) {
      const heads = this.board.querySelector(':scope > .o-kanban-heads');
      const cells = [...this.querySelectorAll('.o-kanban-cell'), ...heads.children];
      O.dnd.flip(cells, () => {
        this.columns.forEach(c => { const hd = heads.querySelector(`:scope > [data-id="${CSS.escape(c.id)}"]`); if (hd) heads.insertBefore(hd, heads.querySelector(':scope > .o-kanban-add-col')); });
        this.querySelectorAll('.o-kanban-lane-row').forEach(row => this.columns.forEach(c => { const cell = row.querySelector(`:scope > [data-col="${CSS.escape(c.id)}"]`); if (cell) row.append(cell); }));
      }, { duration: 220 });
    } else {
      const cols = [...this.board.querySelectorAll(':scope > .o-kanban-col')];
      O.dnd.flip(cols, () => this.columns.forEach(c => { const el = this.board.querySelector(`:scope > .o-kanban-col[data-id="${CSS.escape(c.id)}"]`); if (el) this.board.insertBefore(el, this.board.querySelector(':scope > .o-kanban-add-col')); }), { duration: 220 });
    }
  },
});
