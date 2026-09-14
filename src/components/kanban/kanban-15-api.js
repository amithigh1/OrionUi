/* <o-kanban> public mutation API: addCard/updateCard/removeCard/moveCard, addColumn/updateColumn/removeColumn/collapseColumn,
 * and the built-in card detail panel (openCard/closeCard/focusCard). Every mutator emits a cancelable `o-<name>` event
 * first (return false / preventDefault to veto), then updates the model, patches the DOM and persists. */
Object.assign(OKanban.prototype, {
  /* ── cards ── */
  _insertCard(card, opts = {}) {
    const arr = this.cards;
    const group = c => c.columnId === card.columnId && (!this._hasLanes() || (c.laneId ?? null) === (card.laneId ?? null));
    let idx = arr.length;
    if (opts.after != null) { const i = arr.findIndex(c => c.id === kbStr(opts.after)); if (i >= 0) idx = i + 1; }
    else if (opts.before != null) { const i = arr.findIndex(c => c.id === kbStr(opts.before)); if (i >= 0) idx = i; }
    else if (opts.position === 'top') { const i = arr.findIndex(group); idx = i < 0 ? arr.length : i; }
    else { let last = -1; arr.forEach((c, i) => { if (group(c)) last = i; }); idx = last < 0 ? arr.length : last + 1; }
    arr.splice(idx, 0, card);
  },
  /** addCard({ title, columnId, laneId, ... }, { position: 'top'|'bottom', after, before, user }) -> card | false */
  addCard(data = {}, opts = {}) {
    if (this.readonly) return false;
    const col = this._col(data.columnId) || this.columns[0];
    if (!col) return false;
    let laneId = null;
    if (this._hasLanes()) { const want = kbStr(data.laneId); laneId = want && this.swimlanes.some(l => l.id === want) ? want : this.swimlanes[0]?.id ?? null; }
    const card = { title: '', ...data, id: kbStr(data.id ?? uid('card')), columnId: col.id, laneId };
    if (!this.emit('card-add', { card })) return false;
    this._insertCard(card, opts);
    this.requestUpdate('cards');
    this._notify('card-add');
    if (opts.user) this._say(this.t('kanban.added', { column: col.title ?? col.id }));
    return card;
  },
  /** updateCard(id, { title, description, priority, due, progress, checklist, labels, assignees, columnId, laneId, ... }) */
  updateCard(id, patch = {}, opts = {}) {
    const card = this._card(id);
    if (!card) return false;
    if (!this.emit('card-update', { card, patch })) return false;
    const moving = (patch.columnId != null && kbStr(patch.columnId) !== card.columnId) || (patch.laneId != null && kbStr(patch.laneId) !== (card.laneId ?? null));
    Object.assign(card, patch);
    if (patch.columnId != null) card.columnId = kbStr(patch.columnId);
    if (patch.laneId != null) card.laneId = kbStr(patch.laneId);
    if (moving) this.requestUpdate('cards');
    else { const el = this._cardElOf(id); if (el) this._cardPatch(el, card); }
    this._refreshCounts();
    if (this._filterActive()) this._applyFilter(true);
    this._notify('card-update');
    return card;
  },
  /** removeCard(id, { user, quiet }) */
  removeCard(id, opts = {}) {
    const card = this._card(id);
    if (!card) return false;
    if (!opts.quiet && !this.emit('card-remove', { card })) return false;
    const el = this._cardElOf(id);
    const idx = this.cards.indexOf(card);
    if (idx >= 0) this._cardsArr.splice(idx, 1);
    const commit = () => { this.requestUpdate('cards'); this._notify('card-remove'); if (!opts.quiet) this._say(this.t('kanban.removed')); };
    if (el && el.isConnected && !reducedMotion()) { el.style.pointerEvents = 'none'; animate(el, 'zoomOut', { duration: 140 }).then(commit); }
    else commit();
    return true;
  },
  /** moveCard(id, columnId, index = Infinity, laneId?, { user, keyboard }) -> boolean | Promise<boolean> */
  moveCard(id, columnId, index = Infinity, laneId, opts = {}) {
    const card = this._card(id);
    if (!card || this.readonly) return false;
    const col = this._col(columnId);
    if (!col || col.collapsed) return false;
    columnId = col.id;
    laneId = this._hasLanes() ? (laneId != null ? kbStr(laneId) : this._laneOf(card)) : null;
    const cont = this._container(columnId, this._hasLanes() ? laneId : null);
    const el = this._cardElOf(id);
    if (!cont || !el) return false;
    const fromCol = card.columnId, fromLane = card.laneId ?? null;
    const oldIndex = this._cardsIn(fromCol, this._hasLanes() ? this._laneOf(card) : null).indexOf(card);
    const siblings = [...cont.children].filter(c => c !== el);
    const at = clamp(index === Infinity ? siblings.length : Math.round(index), 0, siblings.length);
    const detail = { cardId: card.id, card, from: fromCol, to: columnId, fromLane, toLane: laneId, oldIndex, index: at, keyboard: !!opts.keyboard };
    if (!this.emit('card-move', detail)) return false;
    const origParent = el.parentElement, origNext = el.nextSibling;
    cont.insertBefore(el, siblings[at] || null);
    this._syncFromDom();
    this._refreshCounts();
    this._cardPatch(el, card);
    this._save();
    return this._settleMove(el, card, detail, () => origParent.insertBefore(el, origNext));
  },
  /** Shared post-move flow (drag end and moveCard()): runs the async onMove hook, reverts + shakes on failure, announces, persists. */
  async _settleMove(el, card, detail, revert) {
    if (isFn(this.onMove)) {
      el.classList.add('is-pending');
      el.setAttribute('aria-busy', 'true');
      let ok;
      try { ok = (await this.onMove({ ...detail })) !== false; } catch { ok = false; }
      el.classList.remove('is-pending');
      el.removeAttribute('aria-busy');
      if (!ok) {
        revert();
        this._syncFromDom();
        this._refreshCounts();
        this._cardPatch(el, card);
        this._save();
        animate(el, 'shake', { duration: 320 });
        this._say(this.t('kanban.moveFailed', { card: card.title || card.id }));
        this.emit('card-move-revert', detail);
        return false;
      }
    }
    if (!detail.keyboard) {
      const col = this._col(card.columnId);
      this._say(this.t('kanban.moved', { card: card.title || card.id, column: col?.title ?? card.columnId, index: detail.index + 1 }));
    }
    this._notify('card-move');
    return true;
  },

  /* ── columns ── */
  /** addColumn({ title, color, limit, ... }, index?, { user }) -> column | false */
  addColumn(data = {}, index, opts = {}) {
    if (this.readonly || this.lockColumns) return false;
    const col = { title: '', ...data, id: kbStr(data.id ?? uid('col')) };
    if (!this.emit('column-add', { column: col })) return false;
    const arr = this.columns;
    const at = index == null ? arr.length : clamp(Math.round(index), 0, arr.length);
    arr.splice(at, 0, col);
    this.requestUpdate('columns');
    this._notify('column-add');
    if (opts.user) this._say(this.t('kanban.columnAdded', { column: col.title || col.id }));
    return col;
  },
  /** Re-patch a column everywhere it is rendered (head, body, lane cells) after its data changed. */
  _refreshColumn(col) {
    const colEl = this.board.querySelector(`:scope > .o-kanban-col[data-id="${CSS.escape(col.id)}"]`);
    if (colEl) this._colPatch(colEl, col);
    this.querySelectorAll(`.o-kanban-col-head[data-id="${CSS.escape(col.id)}"]`).forEach(head => {
      const inCol = head.parentElement?.classList.contains('o-kanban-col');
      if (!inCol) this._headPatch(head, col, false);
    });
    this.querySelectorAll(`.o-kanban-cell[data-col="${CSS.escape(col.id)}"]`).forEach(cell => {
      const k = kbColor(col.color);
      cell.className = cls('o-kanban-cell', k.cls, col.collapsed && 'is-collapsed');
      cell.style.cssText = k.style;
      const cards = cell.querySelector('.o-kanban-cards');
      if (cards) cards.hidden = !!col.collapsed;
      const foot = cell.querySelector('.o-kanban-col-foot');
      if (foot) foot.hidden = !!col.collapsed || this.readonly;
    });
    this._countPatch(col);
  },
  /** updateColumn(id, { title, color, limit, hardLimit, ... }) */
  updateColumn(id, patch = {}, opts = {}) {
    const col = this._col(id);
    if (!col) return false;
    if (!this.emit('column-update', { column: col, patch })) return false;
    Object.assign(col, patch);
    this._refreshColumn(col);
    this._notify('column-update');
    return col;
  },
  /** removeColumn(id, { user }) — also removes its cards. */
  removeColumn(id, opts = {}) {
    const col = this._col(id);
    if (!col) return false;
    if (!this.emit('column-remove', { column: col })) return false;
    const idx = this.columns.indexOf(col);
    if (idx >= 0) this._cols.splice(idx, 1);
    this._cardsArr = this.cards.filter(c => c.columnId !== col.id);
    this.requestUpdate('columns');
    this.requestUpdate('cards');
    this._notify('column-remove');
    if (opts.user) this._say(this.t('kanban.columnRemoved'));
    return true;
  },
  /** collapseColumn(id, collapsed?, { user }) — omit collapsed to toggle. */
  collapseColumn(id, collapsed, opts = {}) {
    const col = this._col(id);
    if (!col) return false;
    const next = collapsed == null ? !col.collapsed : !!collapsed;
    if (next === !!col.collapsed) return true;
    if (!this.emit('column-toggle', { column: col, collapsed: next })) return false;
    col.collapsed = next;
    this._refreshColumn(col);
    this._notify('column-toggle');
    if (opts.user) this._say(next ? this.t('kanban.collapse') : this.t('kanban.expand', { column: col.title ?? col.id }));
    return true;
  },
  /** moveColumn(id, toIndex, { user }) */
  moveColumn(id, toIndex, opts = {}) {
    const col = this._col(id);
    if (!col || this.readonly || this.lockColumns) return false;
    const from = this.columns.indexOf(col), to = clamp(Math.round(toIndex), 0, this.columns.length - 1);
    if (from === to) return true;
    const detail = { columnId: col.id, column: col, from, to, keyboard: !!opts.keyboard };
    if (!this.emit('column-move', detail)) return false;
    const ids = this.columns.map(c => c.id);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    this._applyColumnOrder(ids);
    if (opts.user) this._say(this.t('kanban.columnMoved', { column: col.title ?? col.id, index: to + 1 }));
    this._notify('column-move');
    return true;
  },

  /* ── card detail (openCard/closeCard/focusCard) ── */
  _open(id) { this.openCard(id); },
  /** openCard(id) -> opens the card detail panel (unless `detail="none"` or a listener calls preventDefault on o-card-open). */
  openCard(id) {
    const card = this._card(id);
    if (!card) return false;
    if (!this.emit('card-open', { card })) return true; // host is showing its own UI
    if (this.detail === 'none') return true;
    this._renderDetail(card);
    return true;
  },
  closeCard() { this._detailOv?.close('api'); },
  focusCard(id) {
    const el = this._cardElOf(id);
    if (!el) return false;
    this._setCurrent(el);
    el.focus({ preventScroll: false });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return true;
  },
  _renderDetail(card) {
    this.closeCard();
    const tid = uid('kbdt');
    const titleInput = h('input', { class: 'o-input o-kanban-detail-title', value: card.title || '', 'aria-label': this.t('kanban.title'), id: tid });
    const descInput = h('textarea', { class: 'o-input o-textarea o-kanban-detail-desc', rows: 4, placeholder: this.t('kanban.description') }, card.description || '');
    const prioSel = h('select', { class: 'o-select o-input-sm', 'aria-label': this.t('kanban.priorityLabel') },
      h('option', { value: '' }, this.t('kanban.none')),
      ...Object.keys(KB_PRIO).map(k => h('option', { value: k, selected: card.priority === k || null }, this.t('kanban.priority.' + k))));
    const dueInput = h('input', { type: 'date', class: 'o-input o-input-sm', 'aria-label': this.t('kanban.dueDate'), value: card.due ? date.toISODate(date.parse(card.due)) : '' });
    const progInput = h('input', { type: 'number', class: 'o-input o-input-sm', min: 0, max: 100, 'aria-label': this.t('kanban.progress'), value: card.progress ?? '' });
    const clDone = h('input', { type: 'number', class: 'o-input o-input-sm', min: 0, value: card.checklist?.done ?? '' });
    const clTotal = h('input', { type: 'number', class: 'o-input o-input-sm', min: 0, value: card.checklist?.total ?? '' });
    const colSel = h('select', { class: 'o-select o-input-sm', 'aria-label': this.t('kanban.status') }, this.columns.map(c => h('option', { value: c.id, selected: c.id === card.columnId || null }, c.title ?? c.id)));
    const closeBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon', 'aria-label': this.t('kanban.close'), title: this.t('kanban.close') }, raw(icon('x')));
    const saveBtn = h('button', { type: 'button', class: 'o-btn o-btn-primary' }, this.t('kanban.save'));
    const delBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-kanban-detail-delete' }, raw(icon('trash')), h('span', null, this.t('kanban.deleteCard')));
    const labels = toArr(card.labels).map(l => (isStr(l) ? { text: l } : l));
    const people = toArr(card.assignees).map(a => (isStr(a) ? { name: a } : a));
    const hasAvatar = !!customElements.get('o-avatar');

    const panel = h('div', { class: 'o-kanban-detail o-floating', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': tid },
      h('div', { class: 'o-kanban-detail-head' }, titleInput, closeBtn),
      h('div', { class: 'o-kanban-detail-body o-scroll' },
        labels.length ? h('div', { class: 'o-kanban-card-labels' }, labels.map(l => { const k = kbColor(l.color || 'secondary'); return h('span', { class: cls('o-kanban-label', k.cls), style: k.style }, l.text); })) : null,
        descInput,
        h('div', { class: 'o-kanban-detail-grid' },
          h('label', null, h('span', null, this.t('kanban.status')), colSel),
          h('label', null, h('span', null, this.t('kanban.priorityLabel')), prioSel),
          h('label', null, h('span', null, this.t('kanban.dueDate')), dueInput),
          h('label', null, h('span', null, this.t('kanban.progress')), progInput),
          h('label', { class: 'o-kanban-detail-cl' }, h('span', null, this.t('kanban.checklistLabel')), h('div', { class: 'o-kanban-detail-cl-row' }, clDone, h('span', { 'aria-hidden': 'true' }, '/'), clTotal))),
        people.length ? h('div', { class: 'o-kanban-detail-people' }, h('span', { class: 'o-kanban-detail-label' }, this.t('kanban.assignees')),
          h('div', { class: 'o-avatar-group' }, people.map(p => (hasAvatar ? h('o-avatar', { name: p.name, src: p.avatar || null, size: 'sm' }) : h('span', { class: 'o-avatar o-avatar-sm' }, String(p.name || '?').slice(0, 1)))))) : null),
      h('div', { class: 'o-kanban-detail-foot' }, delBtn, h('div', { class: 'o-kanban-detail-foot-end' }, saveBtn)));

    const save = () => {
      const patch = {
        title: titleInput.value.trim() || card.title, description: descInput.value,
        priority: prioSel.value || null, due: dueInput.value || null,
        progress: progInput.value === '' ? null : clamp(+progInput.value, 0, 100),
      };
      if (clDone.value !== '' || clTotal.value !== '') patch.checklist = { done: +clDone.value || 0, total: +clTotal.value || 0 };
      if (colSel.value && colSel.value !== card.columnId) this.moveCard(card.id, colSel.value, Infinity, this._hasLanes() ? this._laneOf(card) : null, { user: true });
      this.updateCard(card.id, patch, { user: true });
      this.closeCard();
    };
    saveBtn.onclick = save;
    closeBtn.onclick = () => this.closeCard();
    delBtn.onclick = () => { this.closeCard(); this.removeCard(card.id, { user: true }); };
    on(panel, 'keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.closeCard(); }
      else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
    });
    const backdrop = h('div', { class: 'o-kanban-detail-backdrop' });
    portal(backdrop, this);
    portal(panel, this);
    this._detailOv = overlays.open({
      el: panel, owner: this._cardElOf(card.id), trap: true, lockScroll: true,
      onClose: () => { panel.remove(); backdrop.remove(); this._detailOv = null; this.emit('card-close', { cardId: card.id }); },
    });
    backdrop.style.zIndex = String(this._detailOv.entry.z - 1);
    animate(backdrop, 'fadeIn', { duration: 160 });
    animate(panel, 'slideInEnd', { duration: 200 });
    titleInput.focus();
    titleInput.select();
  },
});
