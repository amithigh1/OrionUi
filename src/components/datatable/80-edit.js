/* ── inline editing: cell & row modes, validation, async onSave, dirty cells, undo ── */
const DT_EDIT = {
  _canEdit(col, row) {
    if (!col || col.special || col.type === 'actions' || col.key == null) return false;
    return isFn(col.editable) ? !!col.editable(row) : !!col.editable;
  },
  /** Editor element for a column: { el, input, get(), focus() } */
  _makeEditor(col, row, value) {
    const commit = () => this._commitEdit(), cancel = () => this._cancelEdit();
    if (isFn(col.editor)) {
      const r = col.editor({ value, row, column: col, commit, cancel, table: this });
      if (r instanceof Node) return { el: r, input: r.matches?.('input,select,textarea') ? r : r.querySelector?.('input,select,textarea') || r, get: () => ('value' in r ? r.value : value), focus: () => (r.focus ? r.focus() : null) };
      return { input: r.input || r.el, get: r.getValue || r.get || (() => value), focus: r.focus || (() => r.el?.focus?.()), ...r };
    }
    const kind = col.editor || (col.type === 'boolean' ? 'checkbox' : DT_NUMERIC.has(col.type) ? 'number' : col.type === 'date' ? 'date' : col.type === 'datetime' ? 'datetime' : col.type === 'badge' || col.options ? 'select' : 'text');
    const aria = this.t('table.editCell', { column: col.title });
    let input;
    if (kind === 'select') {
      const opts = col.options ? toArr(col.options).map(o => (isObj(o) ? { value: String(o.value ?? o.label), label: String(o.label ?? o.value) } : { value: String(o), label: String(o) })) : this.filterOptions(col);
      input = h('select', { class: 'o-select o-input-sm', 'aria-label': aria }, ...opts.map(o => h('option', { value: o.value }, o.label)));
      input.value = value == null ? '' : String(value);
      return { el: input, input, get: () => input.value, focus: () => input.focus() };
    }
    if (kind === 'checkbox') {
      input = h('input', { type: 'checkbox', class: 'o-check-input', 'aria-label': aria });
      input.checked = !!value;
      return { el: input, input, get: () => input.checked, focus: () => input.focus() };
    }
    const type = kind === 'number' ? 'number' : kind === 'date' ? 'date' : kind === 'datetime' ? 'datetime-local' : 'text';
    input = h('input', { class: 'o-input o-input-sm', type, 'aria-label': aria, step: type === 'number' ? 'any' : null });
    input.value = value == null ? '' : type === 'date' ? date.toISODate(value) : type === 'datetime-local' ? date.toLocalISO(value) : String(value);
    const wasDate = value instanceof Date;
    const get = () => {
      const s = input.value;
      if (type === 'number') return s === '' ? null : (isNum(+s) ? +s : fmt.parseNumber(s));
      if (type === 'date' || type === 'datetime-local') return s === '' ? null : wasDate ? date.parse(s) : s;
      return s;
    };
    return { el: input, input, get, focus: () => { input.focus(); if (input.select && type === 'text') input.select(); } };
  },
  _editorNode(key, c) {
    const e = this._edit;
    if (e && e.key === key && e.col === c) return e.box;
    const r = this._rowEdit;
    if (r && r.key === key && r.eds.has(c.id)) return r.eds.get(c.id).box;
    return null;
  },
  _wrapEditor(ed) {
    const box = h('div', { class: 'o-dt-editor' }, ed.el);
    ed.box = box;
    return box;
  },

  /** editCell(rowKey, columnId) — start editing one cell (double-click, Enter or F2). */
  editCell(ref, colId) {
    const row = this.rowOf(ref), col = this._colById.get(colId) || this._colFor(colId);
    if (!row || !this._canEdit(col, row)) return false;
    if (this._edit) { if (this._edit.row === row && this._edit.col === col) return true; this._commitEdit(); if (this._edit) return false; }
    if (this._rowEdit) return false;
    const key = this.keyOf(row), value = col.get(row);
    if (col.type === 'boolean' && !col.editor) { this._applyEdit(row, col, !value); return true; }
    if (!this._findCell(key, col.id)) this.scrollToRow(key);
    const ed = this._makeEditor(col, row, value);
    this._wrapEditor(ed);
    this._edit = { row, key, col, ed, box: ed.box, value, input: ed.input };
    on(ed.box, 'focusout', ev => { const to = ev.relatedTarget; if (this._edit?.ed === ed && (!to || !ed.box.contains(to)) && !(to && this._panelH?.el.contains(to))) setTimeout(() => { if (this._edit?.ed === ed && !ed.box.contains(doc.activeElement) && ed.box.isConnected) this._commitEdit({ blur: true }); }, 0); });
    if (!this._updateCell(row, col)) this._renderRows([row]);
    ed.focus();
    this.emit('edit-start', { row, key, column: col.key });
    return true;
  },
  /** Keys while editing (called from the grid keydown handler). Returns true when handled. */
  _editKey(e) {
    const r = this._rowEdit;
    if (r && e.target.closest?.('.o-dt-editor')) {
      if (e.key === 'Escape') { e.preventDefault(); this.cancelRowEdit(); }
      else if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); this.saveRowEdit(); }
      return true;
    }
    const ed = this._edit;
    if (!ed || !ed.box.contains(e.target)) return false;
    if (e.key === 'Escape') { e.preventDefault(); this._cancelEdit(); }
    else if (e.key === 'Enter' && !e.shiftKey && !e.altKey && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); this._commitEdit({ refocus: true }); }
    else if (e.key === 'Tab') { e.preventDefault(); this._commitEdit({ move: e.shiftKey ? -1 : 1 }); }
    return true;
  },
  _validate(col, value, row) {
    const empty = value == null || value === '' || (typeof value === 'number' && Number.isNaN(value));
    if (col.required && empty) return t('validation.required');
    if (!empty && DT_NUMERIC.has(col.type) && !isNum(value)) return t('validation.number');
    if (!empty && isNum(value) && col.min != null && value < col.min) return t('validation.min', { min: col.min });
    if (!empty && isNum(value) && col.max != null && col.type !== 'progress' && value > col.max) return t('validation.max', { max: col.max });
    if (isFn(col.validate)) { const r = col.validate(value, row); if (r === false) return this.t('table.invalid'); if (isStr(r) && r) return r; }
    return null;
  },
  _showError(box, input, msg) {
    let er = box.querySelector('.o-dt-cell-error');
    if (!er) { er = h('div', { class: 'o-dt-cell-error', role: 'alert', id: uid('dte') }); box.append(er); }
    er.textContent = msg;
    input?.classList?.add('is-invalid');
    input?.setAttribute?.('aria-invalid', 'true');
    input?.setAttribute?.('aria-describedby', er.id);
    animate(box, 'shake', { duration: 300 });
    input?.focus?.();
  },
  async _commitEdit(o = {}) {
    const ed = this._edit;
    if (!ed || ed.busy) return;
    let value;
    try { value = ed.ed.get(); } catch { value = ed.value; }
    const err = this._validate(ed.col, value, ed.row);
    if (err) { if (o.blur) { this._cancelEdit(false); this._toast(err, 'danger'); return false; } this._showError(ed.box, ed.input, err); return false; }
    const { row, col, key } = ed;
    this._edit = null;
    const same = equal(value, ed.value) || ((value == null || value === '') && (ed.value == null || ed.value === ''));
    const saving = same ? (this._updateCell(row, col), Promise.resolve(true)) : this._applyEdit(row, col, value);
    if (o.move) { const next = this._nextEditable(row, col, o.move); if (next) { this.editCell(this.keyOf(next.row), next.col.id); return saving; } }
    if (o.refocus || o.move) this._focusCell(key, col.id);
    return saving;
  },
  /** Re-render one cell in place (other cells — and any open editor — stay untouched). */
  _updateCell(row, col) {
    const key = this.keyOf(row), tr = [...this._tbody.children].find(r => r.__k === key && r.classList.contains('o-dt-row'));
    const i = this._vis.indexOf(col), old = tr?.cells[i];
    if (!old) return null;
    const nodes = [];
    __dtTpl.innerHTML = this._tdHTML(col, row, key, this._tinfo?.get(row), this._dirty.get(key), nodes);
    const td = __dtTpl.content.firstElementChild;
    for (const ph of td.querySelectorAll('[data-node]')) ph.replaceWith(nodes[+ph.dataset.node]);
    const wasActive = old === this._activeEl, focused = old === doc.activeElement;
    old.replaceWith(td);
    if (wasActive) { this._activeEl = null; this._setActive(td); if (focused) td.focus({ preventScroll: true }); }
    return td;
  },
  _cancelEdit(refocus = true) {
    const ed = this._edit; if (!ed) return;
    this._edit = null;
    if (!this._updateCell(ed.row, ed.col)) this._renderRows([ed.row]);
    if (refocus) this._focusCell(ed.key, ed.col.id);
    this.emit('edit-cancel', { row: ed.row, key: ed.key, column: ed.col.key });
  },
  _nextEditable(row, col, dir) {
    const rows = this._pageRows(), cols = this._vis;
    let ri = rows.indexOf(row), ci = cols.indexOf(col);
    for (let guard = 0; guard < rows.length * cols.length + 2; guard++) {
      ci += dir;
      if (ci < 0 || ci >= cols.length) { ri += dir; ci = dir > 0 ? 0 : cols.length - 1; if (ri < 0 || ri >= rows.length) return null; }
      if (this._canEdit(cols[ci], rows[ri])) return { row: rows[ri], col: cols[ci] };
    }
    return null;
  },

  /** Apply a value: cancelable o-cell-edit, optimistic update, async onSave(row, changes), rollback on failure. */
  async _applyEdit(row, col, value, o = {}) {
    const key = this.keyOf(row), old = col.get(row);
    const detail = { row, key, column: col.key, value, oldValue: old, undo: !!o.undo };
    if (!this.emit('cell-edit', detail)) { this._updateCell(row, col); return false; }
    value = detail.value;
    setPath(row, col.key, value);
    this._blobs.delete(row);
    if (!o.undo) { this._undo.push({ key, row, col: col.id, old, value }); if (this._undo.length > 100) this._undo.shift(); }
    this._markDirty(key, col.id, !o.undo || !equal(value, this._origOf(key, col.id, value)));
    this._flash(row, col, 'is-saving');
    if (isFn(this.onSave)) {
      try {
        const r = await this.onSave(row, { [col.key]: value }, { column: col.key, oldValue: old, table: this });
        if (r === false) throw new Error(this.t('table.saveFailed'));
      } catch (e) {
        setPath(row, col.key, old);
        this._blobs.delete(row);
        if (!o.undo) this._undo.pop();
        this._markDirty(key, col.id, false);
        this._flash(row, col, 'is-error');
        this._toast(e?.message || this.t('table.saveFailed'), 'danger');
        this.emit('save-error', { ...detail, error: e });
        return false;
      }
    }
    this._flash(row, col, 'is-saved');
    this._renderFoot();
    this.emit('cell-change', detail);
    return true;
  },
  _origOf(key, colId, fallback) { const u = this._undo.find(x => x.key === key && x.col === colId); return u ? u.old : fallback; },
  _markDirty(key, colId, on) {
    let s = this._dirty.get(key);
    if (on) { if (!s) this._dirty.set(key, (s = new Set())); s.add(colId); }
    else if (s) { s.delete(colId); if (!s.size) this._dirty.delete(key); }
  },
  _flash(row, col, cl) {
    const td = cl === 'is-saved' ? this._findCell(this.keyOf(row), col.id) : this._updateCell(row, col);
    if (!td || td.classList.contains('is-editing')) return;
    td.classList.remove('is-saving', 'is-saved', 'is-error');
    td.classList.add(cl);
    if (cl !== 'is-saving') setTimeout(() => td.classList.remove(cl), 1200);
    if (cl === 'is-error') animate(td, 'shake', { duration: 300 });
  },
  /** Undo the last edit (Ctrl+Z). */
  async undo() {
    const u = this._undo.pop(); if (!u) return false;
    const col = this._colById.get(u.col); if (!col) return false;
    const ok = await this._applyEdit(u.row, col, u.old, { undo: true });
    if (ok) { if (!this._undo.some(x => x.key === u.key && x.col === u.col)) this._markDirty(u.key, u.col, false); this._updateCell(u.row, col); announce(this.t('table.undone')); }
    return ok;
  },
  /** [{ key, row, columns: [ids] }] of edited rows */
  getChanges() { return [...this._dirty].map(([key, s]) => ({ key, row: this.rowOf(key), columns: [...s] })); },
  /** Clear dirty markers (after saving everything yourself). */
  acceptChanges() { const rows = [...this._dirty.keys()].map(k => this.rowOf(k)).filter(Boolean); this._dirty.clear(); this._undo = []; this._renderRows(rows); },

  /* ── row edit mode ── */
  editRow(ref) {
    const row = this.rowOf(ref); if (!row) return false;
    if (this._edit) this._commitEdit();
    if (this._rowEdit) { if (this._rowEdit.row === row) return true; this.cancelRowEdit(false); }
    const key = this.keyOf(row), eds = new Map();
    for (const c of this._vis) if (this._canEdit(c, row)) { const ed = this._makeEditor(c, row, c.get(row)); this._wrapEditor(ed); eds.set(c.id, ed); }
    if (!eds.size) return false;
    this._rowEdit = { row, key, eds };
    this._renderRows([row]);
    [...eds.values()][0].focus();
    this.emit('edit-start', { row, key, mode: 'row' });
    return true;
  },
  _rowEditButtons() {
    return `<span class="o-dt-actions-in"><button type="button" class="o-btn o-btn-primary o-btn-sm o-btn-icon" data-dt-action="save-row" aria-label="${esc(this.t('table.save'))}" title="${esc(this.t('table.save'))}">${icon('check')}</button><button type="button" class="o-btn o-btn-sm o-btn-icon" data-dt-action="cancel-row" aria-label="${esc(this.t('table.cancel'))}" title="${esc(this.t('table.cancel'))}">${icon('x')}</button></span>`;
  },
  async saveRowEdit() {
    const r = this._rowEdit; if (!r || r.busy) return false;
    const changes = {}, olds = {};
    for (const [id, ed] of r.eds) {
      const col = this._colById.get(id), v = ed.get();
      const err = this._validate(col, v, r.row);
      if (err) { this._showError(ed.box, ed.input, err); return false; }
      const old = col.get(r.row);
      if (!equal(v, old) && !((v == null || v === '') && (old == null || old === ''))) { changes[col.key] = v; olds[col.key] = old; }
    }
    const key = r.key, row = r.row;
    if (!Object.keys(changes).length) { this.cancelRowEdit(); return true; }
    if (!this.emit('row-edit', { row, key, changes })) return false;
    r.busy = true;
    const tr = [...this._tbody.children].find(x => x.__k === key); tr?.classList.add('is-saving');
    for (const [k, v] of Object.entries(changes)) setPath(row, k, v);
    try {
      if (isFn(this.onSave)) { const res = await this.onSave(row, changes, { table: this, oldValues: olds }); if (res === false) throw new Error(this.t('table.saveFailed')); }
    } catch (e) {
      for (const [k, v] of Object.entries(olds)) setPath(row, k, v);
      r.busy = false; tr?.classList.remove('is-saving');
      this._toast(e?.message || this.t('table.saveFailed'), 'danger');
      return false;
    }
    for (const k of Object.keys(changes)) { const col = this._colFor(k); if (col) { this._markDirty(key, col.id, true); this._undo.push({ key, row, col: col.id, old: olds[k], value: changes[k] }); } }
    this._blobs.delete(row);
    this._rowEdit = null;
    this._renderRows([row]);
    this._focusCell(key, this._active.col);
    this.emit('cell-change', { row, key, changes, mode: 'row' });
    return true;
  },
  cancelRowEdit(refocus = true) {
    const r = this._rowEdit; if (!r) return;
    this._rowEdit = null;
    this._renderRows([r.row]);
    if (refocus) this._focusCell(r.key, this._active.col);
  },
};
