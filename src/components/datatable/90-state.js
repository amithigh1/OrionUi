/* ── state (columns / sort / filters / page size / density / grouping), persistence, saved views ── */
const DT_STATE = {
  /** Serializable view state. */
  getState() {
    return {
      columns: { order: this.columnOrder, hidden: [...this._hidden], widths: { ...this._widths } },
      sort: clone(toArr(this.sort)), filters: clone(this.filters || {}), search: this.search || '',
      pageSize: +this.pageSize || 10, density: this.density, groupBy: this.groupBy || '', filterRow: !!this.filterRow,
    };
  },
  /** Apply a (partial) state object. */
  setState(s = {}, { persist = true } = {}) {
    if (!s || !isObj(s)) return;
    if (s.columns) {
      if (Array.isArray(s.columns.order)) this._order = [...s.columns.order];
      if (Array.isArray(s.columns.hidden)) { this._hidden = new Set(s.columns.hidden); this._userHidden = true; }
      if (isObj(s.columns.widths)) this._widths = { ...s.columns.widths };
      if (this._setupDone) { this._computeVisible(); this._renderHead(); this._layout(); this._force = true; }
    }
    if ('sort' in s) this.sort = toArr(s.sort);
    if ('filters' in s) this.filters = { ...(s.filters || {}) };
    if ('search' in s) this.search = s.search || '';
    if (s.pageSize) this.pageSize = +s.pageSize;
    if (s.density) this.density = s.density;
    if ('groupBy' in s) this.groupBy = s.groupBy || '';
    if ('filterRow' in s) this.filterRow = !!s.filterRow;
    this.page = 1;
    if (this._setupDone) { this.flush(); if (s.columns) this._render(); }
    if (persist) this._persist();
  },
  _storeKey() { return this.stateKey ? DT_NS + this.stateKey : null; },
  _store() { const k = this._storeKey(); const v = k ? ls.get(k, null) : null; return isObj(v) ? v : { views: [] }; },
  _save(data) { const k = this._storeKey(); if (k) ls.set(k, data); },
  /** On first update: remember the original layout, then restore the default view or the last state. */
  _restoreState() {
    this._initialState = {
      columns: { order: null, hidden: toArr(this.columns).filter(c => c?.hidden).map((c, i) => String(c.id ?? c.key ?? 'col' + i)), widths: {} },
      sort: clone(toArr(this.sort)), filters: clone(this.filters || {}), search: this.search || '', pageSize: +this.pageSize || 10, density: this.density, groupBy: this.groupBy || '', filterRow: !!this.filterRow,
    };
    if (!this.stateKey) return;
    const st = this._store(), v = st.defaultView && this._allViews(st).find(x => x.name === st.defaultView);
    const s = v ? v.state : st.state;
    if (v) this._viewName = v.name;
    if (!s) return;
    const c = s.columns || {};
    if (Array.isArray(c.order)) this._order = [...c.order];
    if (Array.isArray(c.hidden)) { this._hidden = new Set(c.hidden); this._userHidden = true; }
    if (isObj(c.widths)) this._widths = { ...c.widths };
    const P = this._p;
    if (s.sort) P.sort = toArr(s.sort);
    if (s.filters) P.filters = { ...s.filters };
    if (s.search) P.search = s.search;
    if (s.pageSize) P.pageSize = +s.pageSize;
    if (s.density) { P.density = s.density; this.setAttribute('density', s.density); }
    if (s.groupBy) P.groupBy = s.groupBy;
    if (s.filterRow) P.filterRow = true;
  },
  /** Debounced: save to localStorage (state-key) and emit o-state-change. */
  _persist() {
    if (!this._setupDone) return;
    clearTimeout(this._persistT);
    this._persistT = setTimeout(() => {
      const state = this.getState();
      if (this.stateKey) { const st = this._store(); st.state = state; this._save(st); }
      this.emit('state-change', { state, view: this._viewName || null });
    }, 250);
  },
  _allViews(st = this._store()) {
    const pre = toArr(this.views).map(v => ({ ...v, preset: true }));
    return [...pre.filter(p => !toArr(st.views).some(v => v.name === p.name)), ...toArr(st.views)];
  },
  /** Saved views: [{ name, state, preset? }] */
  getViews() { return this._allViews(); },
  saveView(name, state = this.getState()) {
    name = String(name || '').trim(); if (!name) return null;
    const st = this._store();
    st.views = toArr(st.views).filter(v => v.name !== name);
    st.views.push({ name, state });
    this._save(st);
    this._memViews = st.views;
    this._viewName = name; this._syncToolbar();
    this._toast(this.t('table.viewSaved', { name }));
    this.emit('view-save', { name, state });
    return state;
  },
  applyView(name) {
    const v = this._allViews().find(x => x.name === name); if (!v) return false;
    this.setState(v.state);
    this._viewName = name; this._syncToolbar();
    announce(this.t('table.viewApplied', { name }));
    this.emit('view-change', { name, state: v.state });
    return true;
  },
  deleteView(name) {
    const st = this._store();
    st.views = toArr(st.views).filter(v => v.name !== name);
    if (st.defaultView === name) st.defaultView = null;
    this._save(st);
    if (this._viewName === name) { this._viewName = null; this._syncToolbar(); }
  },
  setDefaultView(name) { const st = this._store(); st.defaultView = st.defaultView === name ? null : name; this._save(st); },
  /** Back to the original column layout / sort / filters. */
  resetView() {
    this._order = null; this._widths = {}; this._userHidden = false;
    this.setState(this._initialState || {});
    this._hidden = new Set(this._cols.filter(c => c.hidden).map(c => c.id));
    this._afterColumns();
    this._viewName = null; this._syncToolbar();
  },
  _openViews(anchor) {
    this._popover(anchor, (el, handle) => {
      const list = h('div', { class: 'o-dt-views', role: 'list' });
      const draw = () => {
        const st = this._store(), views = this._allViews(st);
        const item = (label, isCur, run, extra = []) => { const b = h('button', { type: 'button', class: cls('o-dt-view', isCur && 'is-active'), 'aria-current': isCur ? 'true' : null }, h('span', {}, label)); b.onclick = () => { run(); handle.close('select'); }; return h('div', { class: 'o-dt-view-row', role: 'listitem' }, b, ...extra); };
        const rows = [item(this.t('table.resetView'), !this._viewName, () => this.resetView())];
        for (const v of views) {
          const star = h('button', { type: 'button', class: cls('o-btn o-btn-ghost o-btn-xs o-btn-icon', st.defaultView === v.name && 'is-active'), 'aria-pressed': String(st.defaultView === v.name), 'aria-label': `${this.t('table.setDefault')}: ${v.name}`, title: this.t(st.defaultView === v.name ? 'table.isDefault' : 'table.setDefault') }, iconEl('star'));
          star.onclick = () => { this.setDefaultView(v.name); draw(); list.querySelector(`[aria-label="${CSS.escape(this.t('table.setDefault') + ': ' + v.name)}"]`)?.focus(); };
          const extra = [star];
          if (!v.preset) { const del = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-xs o-btn-icon', 'aria-label': this.t('table.deleteView', { name: v.name }), title: this.t('table.deleteView', { name: v.name }) }, iconEl('trash')); del.onclick = () => { this.deleteView(v.name); draw(); input.focus(); }; extra.push(del); }
          rows.push(item(v.name, this._viewName === v.name, () => this.applyView(v.name), extra));
        }
        list.replaceChildren(...rows);
        if (!views.length) list.append(h('div', { class: 'o-dt-muted o-dt-views-empty' }, this.t('table.noViews')));
      };
      const input = h('input', { class: 'o-input o-input-sm', placeholder: this.t('table.viewName'), 'aria-label': this.t('table.viewName'), value: this._viewName || '' });
      const save = h('button', { type: 'submit', class: 'o-btn o-btn-primary o-btn-sm' }, this.t('table.viewSave'));
      const form = h('form', { class: 'o-dt-view-form' }, input, save);
      on(form, 'submit', e => { e.preventDefault(); if (input.value.trim()) { this.saveView(input.value); draw(); } });
      el.append(h('div', { class: 'o-dt-panel-head' }, h('strong', {}, this.t('table.views'))), h('div', { class: 'o-dt-panel-body' }, list), h('div', { class: 'o-dt-panel-foot' }, h('div', { class: 'o-dt-muted' }, this.t('table.saveView')), form));
      draw();
    }, { className: 'o-dt-views-panel', label: this.t('table.views') });
  },

  /** scrollToRow(keyOrRow, { focus, highlight }) — switches page / scrolls the virtual list as needed. */
  scrollToRow(ref, { focus = false, highlight = true } = {}) {
    const row = this.rowOf(ref); if (!row) return false;
    const key = this.keyOf(row);
    if (this.tree) { for (let p = this._parentOf(row); p; p = this._parentOf(p)) this._open.add(this.keyOf(p)); this._run('items'); }
    const items = this._items || [], i = items.indexOf(row);
    if (i < 0 && !this._server) return false;
    if (this.virtual) { const rh = this._rh || DT_ROW_H[this.density]; this._scroll.scrollTop = Math.max(0, i * rh - this._scroll.clientHeight / 3); this._renderBody(); }
    else if (this.pagination && !this.infinite && !this._server) { const p = Math.floor(i / (+this.pageSize || 10)) + 1; if (p !== this.page) { this.page = p; this.flush(); } else this._render(); }
    else if (this.infinite && i >= this._limit) { this._limit = i + 1; this._render(); }
    else this._render();
    const cell = this._findCell(key, this._active.col || this._dataVis[0]?.id);
    if (!cell) return false;
    if (focus) { this._setActive(cell); cell.focus({ preventScroll: true }); }
    this._reveal(cell);
    if (!this._ownScroll) { const r = cell.getBoundingClientRect(); if (r.top < 0 || r.bottom > doc.documentElement.clientHeight) cell.scrollIntoView({ block: 'center' }); }
    if (highlight) for (const td of cell.parentNode.cells) animate(td, 'highlight', { duration: 1200 });
    return true;
  },
};
