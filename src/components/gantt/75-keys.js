/* ── keyboard (task list + timeline share one handler) ─────────────────── */
Object.assign(OGantt.prototype, {
  _bindKeys() {
    on(this, 'keydown', e => this._onKey(e));
  },
  _onKey(e) {
    if (e.defaultPrevented || e.isComposing || this._editing) return;
    const inGrid = e.target === this._gridEl, inChart = e.target === this._chartEl;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z') && !this.readonly && (inGrid || inChart || this._tb.contains(e.target))) { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if (mod && !e.altKey && (e.key === 'y' || e.key === 'Y') && !this.readonly && (inGrid || inChart)) { e.preventDefault(); this.redo(); return; }
    if (!inGrid && !inChart) return;
    if (e.key !== 'Tab') this._tabRelease = e.key === 'Escape';
    const rtl = isRTL(this), fwd = e.key === (rtl ? 'ArrowLeft' : 'ArrowRight'), back = e.key === (rtl ? 'ArrowRight' : 'ArrowLeft');
    const k = inGrid ? (this._act?.k ?? this._sel) : this._sel;
    const edit = !this.readonly;
    if (e.altKey && !mod && (fwd || back)) {
      e.preventDefault();
      if (!edit || k == null) return;
      const step = gSnapDays(this._dw) * (fwd ? 1 : -1);
      if (e.shiftKey) this._resizeBy(k, 'end', step); else this._moveBy(k, step);
      this._keepVisible(k);
      return;
    }
    if (e.altKey) return;
    const page = Math.max(1, Math.floor((this._chartH || 300) / this._rh) - 1);
    switch (e.key) {
      case 'ArrowDown': case 'ArrowUp': e.preventDefault(); this._moveActive(e.key === 'ArrowDown' ? 1 : -1, inChart); return;
      case 'PageDown': case 'PageUp': e.preventDefault(); this._moveActive(e.key === 'PageDown' ? page : -page, inChart); return;
      case 'Home': case 'End': {
        e.preventDefault();
        if (inGrid && !mod && this._act && this._act.c >= 0) { this._setActive(this._act.k, e.key === 'Home' ? 0 : this._cols.length - 1); return; }
        const key = e.key === 'Home' ? this._rows[0] : this._rows[this._rows.length - 1];
        if (key != null) inGrid ? this._setActive(key, this._act?.c ?? -1) : this._setSel(key, { scroll: true, announce: true });
        return;
      }
      case 'ArrowRight': case 'ArrowLeft': {
        e.preventDefault();
        if (inChart) { this._setScrollX(this._scrollX() + (fwd ? 1 : -1) * Math.max(40, this._chartW / 6)); return; }
        if (k == null) return;
        const c = this._act?.k === k ? this._act.c : -1;
        if (c < 0) {
          if (fwd) { if (this._isSum(k) && this._collapsed.has(k)) this._toggle(k, true); else this._setActive(k, 0); }
          else if (this._isSum(k) && !this._collapsed.has(k)) this._toggle(k, false);
          else { const p = this._rec(k).parent; if (p != null && this._rowIndex.has(p)) this._setActive(p, -1); }
        } else this._setActive(k, fwd ? Math.min(c + 1, this._cols.length - 1) : c - 1);
        return;
      }
      case 'Enter': case 'F2': {
        if (k == null) return;
        e.preventDefault();
        if (!edit) return;
        let c = inGrid && this._act?.c >= 0 ? this._act.c : this._cols.findIndex(x => x.tree);
        this._startEdit(k, c < 0 ? 0 : c);
        return;
      }
      case 'Tab': {
        if (!edit || k == null || this._tabRelease) { this._tabRelease = false; return; }
        const res = e.shiftKey ? this._outdent(k) : this._indent(k);
        if (res) { e.preventDefault(); this._keepVisible(k); }
        return;
      }
      case 'Escape': if (this._selLink) { this._selLink = null; this._render(true); } return;
      case 'Delete': case 'Backspace': {
        if (!edit) return;
        e.preventDefault();
        if (this._selLink) { const L = this._links.find(x => x.key === this._selLink); if (L?.direct) this._unlink(L.p, L.t); return; }
        if (k != null) { this._remove(k); this._focusGrid(); }
        return;
      }
      case 'Insert': if (edit) { e.preventDefault(); this._userAdd(e.shiftKey ? 'milestone' : 'task'); } return;
      case '+': case '=': if (!mod) { e.preventDefault(); this.zoomIn(); } return;
      case '-': case '_': if (!mod) { e.preventDefault(); this.zoomOut(); } return;
      case 't': case 'T': if (!mod && inChart) { e.preventDefault(); this.scrollToToday('smooth'); } return;
      case ' ': if (k != null && this._isSum(k)) { e.preventDefault(); this._toggle(k); } return;
      default:
        // type-to-edit (spreadsheet style) on a focused, editable cell
        if (inGrid && edit && !mod && e.key.length === 1 && this._act?.c >= 0 && k != null) {
          const col = this._cols[this._act.c];
          if (col && col.type !== 'date' && this._canEdit(k, col)) { e.preventDefault(); this._startEdit(k, this._act.c, e.key); }
        }
    }
  },
  _moveActive(d, inChart = false) {
    const cur = inChart ? this._sel : (this._act?.k ?? this._sel);
    const i = cur == null ? (d > 0 ? -1 : this._rows.length) : this._rowIndex.get(cur) ?? 0;
    const key = this._rows[clamp(i + d, 0, this._rows.length - 1)];
    if (key == null) return;
    if (inChart) { this._setSel(key, { scroll: true, announce: true }); this._keepVisible(key); }
    else this._setActive(key, this._act?.c ?? -1);
  },
  /** Scroll the timeline horizontally so the task's bar is visible. */
  _keepVisible(k) {
    if (!this._rowIndex.has(k)) return;
    const p = this._posOf(k), x0 = this._x(p.s), x1 = this._x(p.e), sx = this._scrollX(), vw = this._chartW;
    if (x1 < sx + 20 || x0 > sx + vw - 20) this._setScrollX(x0 - vw * 0.2);
    else if (x1 > sx + vw) this._setScrollX(Math.min(x0 - 20, x1 - vw + 60));
  },
  /** Toolbar / Insert key: add a task (or milestone) below the selection. */
  _userAdd(type = 'task') {
    const base = type === 'milestone' ? { type: 'milestone' } : {};
    const sel = this._sel != null ? this._rec(this._sel) : null;
    const task = this._newRecord(base);
    const detail = { task: gPublic(task, { idOf: x => this._idOf(x) }) };
    if (!this.emit('task-add', detail)) return null;
    const parent = sel ? (this._isSum(sel.key) && !this._collapsed.has(sel.key) ? sel.key : sel.parent) : null;
    const after = sel && !(this._isSum(sel.key) && !this._collapsed.has(sel.key)) ? sel.key : null;
    const res = this._commit(this._insert(task, { parent, after }), { schedule: new Set([task.key]), reason: 'add', announce: this.t('gantt.added', { name: task.name }) });
    if (!res) return null;
    this._setSel(task.key, { scroll: true, emit: true, announce: false });
    this._keepVisible(task.key);
    const j = this._cols.findIndex(c => c.tree);
    if (this._gridShown) this._startEdit(task.key, j < 0 ? 0 : j);
    return task.id;
  },
});
