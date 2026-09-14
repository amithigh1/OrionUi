/* <o-tree> drag & drop: move/reorder nodes with before/after/inside indicators, canDrop validation and
 * auto-expand on hover. Hierarchical drops (a node can land as a sibling OR inside another) don't fit
 * Orion.sortable's flat-sibling model, so this uses the low-level Orion.dnd.start() primitive directly. */
Object.assign(OTree.prototype, {
  _bindDnd() {
    this.addCleanup(on(this.rowsEl, 'pointerdown', e => this._dragDown(e)));
  },
  _dragDown(e) {
    if (!this.draggable || this.readonly || e.__oDnd) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const row = e.target.closest('.o-tree-row');
    if (!row || row.classList.contains('o-tree-row-placeholder')) return;
    if (e.target.closest('[data-act="toggle"],[data-act="check"],input,button')) return;
    const node = this.getNode(row.dataset.id);
    if (!node || node.disabled) return;
    O.dnd.start(e, {
      el: row, data: { id: row.dataset.id }, threshold: 4, delayOnTouch: 220,
      preview: () => this._dragGhost(row),
      onStart: () => { this._dragNode = node; this.classList.add('is-dragging'); },
      onMove: s => this._dragMove(s),
      onDrop: s => this._dragDrop(s),
      onCancel: () => this._dragEnd(),
      onEnd: () => this._dragEnd(),
    });
  },
  _dragGhost(row) {
    // .o-tree normally stretches to its container's height; the drag preview is position:fixed and must hug its content.
    const clone = row.cloneNode(true);
    clone.classList.add('o-tree-row-ghost');
    return h('div', { class: 'o-tree is-ghost', style: { height: 'auto', width: row.getBoundingClientRect().width + 'px' } }, clone);
  },
  _isDescendant(ancestor, node) { for (let p = node; p; p = this._parent(p)) if (p === ancestor) return true; return false; },
  _clearDropMarks() { this.rowsEl.querySelectorAll('.drop-before,.drop-after,.drop-inside,.is-drop-denied').forEach(el => el.classList.remove('drop-before', 'drop-after', 'drop-inside', 'is-drop-denied')); },
  _clearAutoExpand() { clearTimeout(this._autoExpandTimer); this._autoExpandTimer = null; this._autoExpandFor = null; },
  _dragMove(s) {
    this._clearDropMarks();
    const row = s.target && s.target.closest ? s.target.closest('.o-tree-row') : null;
    if (!row || row.classList.contains('o-tree-row-placeholder') || !this._dragNode) { this._dropTarget = null; this._clearAutoExpand(); return; }
    const target = this.getNode(row.dataset.id);
    if (!target || target === this._dragNode || this._isDescendant(this._dragNode, target)) { this._dropTarget = null; this._clearAutoExpand(); return; }
    const r = row.getBoundingClientRect();
    const frac = (s.y - r.top) / (r.height || 1);
    const canInside = this._hasKids(target);
    const pos = frac < .25 ? 'before' : frac > .75 ? 'after' : canInside ? 'inside' : (frac < .5 ? 'before' : 'after');
    if (isFn(this.canDrop) && !this.canDrop(this._dragNode, target, pos)) { this._dropTarget = null; row.classList.add('is-drop-denied'); this._clearAutoExpand(); return; }
    this._dropTarget = { target, pos };
    row.classList.add('drop-' + pos);
    if (pos === 'inside' && canInside && !this._isExpanded(target)) {
      if (this._autoExpandFor !== target) { this._clearAutoExpand(); this._autoExpandFor = target; this._autoExpandTimer = setTimeout(() => { this.toggle(row.dataset.id, true); this._autoExpandFor = null; }, 600); }
    } else this._clearAutoExpand();
  },
  _dragDrop() {
    this._clearAutoExpand();
    this._clearDropMarks();
    const drop = this._dropTarget, dragNode = this._dragNode;
    this._dragEnd();
    if (!drop || !dragNode) return;
    const { target, pos } = drop;
    if (!this.emit('move', { node: dragNode, target, position: pos })) return;
    const oldParent = this._parent(dragNode);
    const oldList = oldParent ? (oldParent.children || []) : this.nodes;
    const oi = oldList.indexOf(dragNode);
    if (oi >= 0) oldList.splice(oi, 1);
    if (pos === 'inside') { target.children = target.children || []; target.children.push(dragNode); target.expanded = true; }
    else {
      const parent = this._parent(target);
      const list = parent ? (parent.children || (parent.children = [])) : this.nodes;
      let idx = list.indexOf(target);
      if (idx < 0) idx = list.length; else if (pos === 'after') idx++;
      list.splice(idx, 0, dragNode);
    }
    this._reindex();
    this._render();
  },
  _dragEnd() { this._dragNode = null; this._dropTarget = null; this.classList.remove('is-dragging'); this._clearAutoExpand(); this._clearDropMarks(); },
});
