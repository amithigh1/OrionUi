/* ── floating panels: popover, menu, confirm, filter menu, column chooser, density, export ── */
const DT_PANELS = {
  /** Built-in popover anchored to a trigger (portaled, auto-placed, closes on Escape / outside click). */
  _popover(anchor, build, o = {}) {
    this._closePanel();
    const el = h('div', { class: cls('o-floating o-dt-panel', o.className), role: o.role || 'dialog', 'aria-label': o.label || null, tabindex: '-1' });
    portal(el, this);
    const handle = { el, close: r => ov.close(r) };
    build(el, handle);
    const unplace = autoPlace(el, anchor, { placement: o.placement || 'bottom-end', offset: 6, flip: true, size: true, padding: 8 });
    const ov = overlays.open({
      el, owner: anchor,
      onClose: reason => {
        unplace(); el.remove();
        if (this._panelH === handle) this._panelH = null;
        anchor.setAttribute?.('aria-expanded', 'false');
        o.onClose?.(reason);
      },
    });
    anchor.setAttribute?.('aria-expanded', 'true');
    this._panelH = handle;
    if (o.nav) {
      const nav = new ListNav(el, { items: '[role^=menuitem]:not(:disabled)' });
      on(el, 'keydown', e => { if (nav.handle(e)) return; if (e.key === 'Tab') handle.close('tab'); });
      requestAnimationFrame(() => nav.first());
    } else if (o.focus !== false) requestAnimationFrame(() => { if (el.isConnected) focusFirst(el); });
    animate(el, 'zoomIn', { duration: 120 });
    return handle;
  },
  _closePanel() { this._panelH?.close('api'); },

  /** Menu of { label, icon, run, disabled, variant, checked, divider } — Orion.menu when available. */
  _menu(anchor, items, o = {}) {
    if (isFn(O.menu) && !o.builtin) {
      try {
        const map = it => (it.divider ? { divider: true } : { label: it.label, icon: it.icon, disabled: it.disabled, danger: it.variant === 'danger', checked: it.checked, action: it.run, onClick: it.run, onSelect: it.run });
        const r = O.menu({ anchor, target: anchor, trigger: anchor, placement: 'bottom-end', items: items.map(map) });
        if (r) return r;
      } catch {}
    }
    return this._popover(anchor, (el, handle) => {
      for (const it of items) {
        if (it.divider) { el.append(h('div', { class: 'o-dt-menu-sep', role: 'separator' })); continue; }
        const check = it.checked != null;
        const b = h('button', { type: 'button', tabindex: '-1', class: cls('o-dt-menu-item', it.variant && 'is-' + it.variant), role: check ? 'menuitemradio' : 'menuitem', 'aria-checked': check ? String(!!it.checked) : null, disabled: !!it.disabled },
          check ? h('span', { class: 'o-dt-menu-mark' }, it.checked ? iconEl('check') : '') : it.icon ? iconEl(it.icon) : null, h('span', {}, it.label));
        b.onclick = () => { handle.close('select'); it.run?.(); };
        el.append(b);
      }
    }, { className: 'o-dt-menu', role: 'menu', nav: true, label: o.label });
  },

  /** confirm(message) -> Promise<boolean> (Orion.confirm when available, else a small popover). */
  async _confirm(message, anchor, variant = 'danger') {
    if (isFn(O.confirm)) {
      try { const r = O.confirm(message, { title: this.t('table.confirm'), variant, okText: this.t('table.confirmOk') }); if (r && isFn(r.then)) return !!(await r); if (typeof r === 'boolean') return r; } catch {}
    }
    return new Promise(resolve => {
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); } };
      this._popover(anchor || this._toolbar, (el, handle) => {
        const ok = h('button', { type: 'button', class: `o-btn o-btn-sm o-btn-${variant || 'primary'}` }, this.t('table.confirmOk'));
        const no = h('button', { type: 'button', class: 'o-btn o-btn-sm' }, this.t('table.cancel'));
        ok.onclick = () => { finish(true); handle.close('select'); };
        no.onclick = () => { finish(false); handle.close('select'); };
        el.append(h('p', { class: 'o-dt-confirm-text' }, message), h('div', { class: 'o-dt-panel-actions' }, no, ok));
        requestAnimationFrame(() => ok.focus());
      }, { className: 'o-dt-confirm', role: 'alertdialog', label: this.t('table.confirm'), focus: false, onClose: () => finish(false) });
    });
  },
  _toast(msg, type = 'success') {
    if (isFn(O.toast)) { try { O.toast(msg, { type }); return; } catch {} }
    announce(msg);
  },

  /* ── filter menu (per column) ── */
  _openFilter(col, anchor) {
    if (!col) return;
    const key = this._filterKey(col);
    this._popover(anchor, el => {
      const clear = h('button', { type: 'button', class: 'o-btn o-btn-link o-btn-sm' }, this.t('table.clearFilter'));
      clear.onclick = () => { this.setFilter(key, null); this._closePanel(); anchor.focus?.(); };
      el.append(h('div', { class: 'o-dt-panel-head' }, h('strong', {}, col.title), clear));
      const body = h('div', { class: 'o-dt-panel-body' });
      el.append(body);
      this._filterControl(col, body, this.filters?.[key], v => this.setFilter(key, v));
    }, { className: 'o-dt-filter-panel', label: this.t('table.filterColumn', { column: col.title }), placement: 'bottom-start' });
  },
  /** Build the control for a column filter type inside `box`; `set(value)` applies it. */
  _filterControl(col, box, value, set) {
    const type = col.filter, uidp = uid('dtf');
    const deb = debounce(set, 250);
    if (type === 'text') {
      const inp = h('input', { class: 'o-input o-input-sm', type: 'search', placeholder: this.t('table.contains'), 'aria-label': this.t('table.filterColumn', { column: col.title }), value: value ?? '' });
      on(inp, 'input', () => deb(inp.value));
      on(inp, 'keydown', e => { if (e.key === 'Enter') { deb.flush(); this._closePanel(); } });
      box.append(inp);
    } else if (type === 'number-range' || type === 'date-range') {
      const isDate = type === 'date-range', v = value || {};
      const a = h('input', { class: 'o-input o-input-sm', type: isDate ? 'date' : 'number', 'aria-label': this.t(isDate ? 'table.from' : 'table.min'), placeholder: this.t(isDate ? 'table.from' : 'table.min'), value: (isDate ? (v.from ? date.toISODate(v.from) : '') : v.min ?? '') });
      const b = h('input', { class: 'o-input o-input-sm', type: isDate ? 'date' : 'number', 'aria-label': this.t(isDate ? 'table.to' : 'table.max'), placeholder: this.t(isDate ? 'table.to' : 'table.max'), value: (isDate ? (v.to ? date.toISODate(v.to) : '') : v.max ?? '') });
      const apply = () => deb(isDate ? { from: a.value || null, to: b.value || null } : { min: a.value === '' ? null : +a.value, max: b.value === '' ? null : +b.value });
      on(a, 'input change', apply); on(b, 'input change', apply);
      box.append(h('div', { class: 'o-dt-range' }, a, h('span', { 'aria-hidden': 'true' }, '–'), b));
    } else if (type === 'boolean') {
      const opts = [['', this.t('table.any')], ['true', this.t('table.yes')], ['false', this.t('table.no')]];
      const seg = h('div', { class: 'o-segmented o-dt-seg', role: 'radiogroup', 'aria-label': col.title });
      for (const [v, l] of opts) {
        const r = h('input', { type: 'radio', name: uidp, value: v });
        r.checked = String(value ?? '') === v;
        on(r, 'change', () => set(v === '' ? null : v === 'true'));
        seg.append(h('label', {}, r, h('span', {}, l)));
      }
      box.append(seg);
    } else {
      const multi = type === 'multiselect', opts = this.filterOptions(col), counts = this.facetCounts(this._filterKey(col));
      const cur = new Set(toArr(value).map(String));
      const list = h('div', { class: 'o-dt-opts', role: multi ? 'group' : 'radiogroup', 'aria-label': col.title });
      const render = q => {
        const w = dtWords(q);
        list.replaceChildren(...opts.filter(o => !w.length || w.every(x => o.label.toLowerCase().includes(x))).map(o => {
          const inp = h('input', { type: multi ? 'checkbox' : 'radio', name: uidp, value: o.value, class: 'o-check-input' });
          inp.checked = cur.has(o.value);
          on(inp, 'change', () => {
            if (multi) { if (inp.checked) cur.add(o.value); else cur.delete(o.value); set([...cur]); }
            else { cur.clear(); cur.add(o.value); set(o.value); }
          });
          const n = counts.get(o.value);
          return h('label', { class: 'o-check o-dt-opt' }, inp, h('span', { class: 'o-dt-opt-label' }, o.label), n != null ? h('span', { class: 'o-dt-count' }, fmt.number(n)) : null);
        }));
        if (!list.children.length) list.append(h('div', { class: 'o-dt-muted' }, this.t('common.noResults')));
      };
      if (opts.length > 7) {
        const s = h('input', { class: 'o-input o-input-sm o-dt-opt-search', type: 'search', placeholder: this.t('table.searchOptions'), 'aria-label': this.t('table.searchOptions') });
        on(s, 'input', () => render(s.value));
        box.append(s);
      }
      render('');
      box.append(list);
    }
  },

  /* ── column chooser ── */
  _openColumns(anchor) {
    this._popover(anchor, el => {
      const search = h('input', { class: 'o-input o-input-sm', type: 'search', placeholder: this.t('table.searchColumns'), 'aria-label': this.t('table.searchColumns') });
      const list = h('div', { class: 'o-dt-cols', role: 'group', 'aria-label': this.t('table.columns') });
      const draw = (focusSel) => {
        const w = dtWords(search.value), ids = this.columnOrder;
        list.replaceChildren(...ids.map(id => this._colById.get(id)).filter(c => c && c.type !== 'actions' || c?.title).filter(c => !w.length || w.every(x => String(c.title || c.id).toLowerCase().includes(x))).map((c, i, arr) => {
          const cb = h('input', { type: 'checkbox', class: 'o-check-input', 'data-id': c.id });
          cb.checked = !this._hidden.has(c.id);
          on(cb, 'change', () => { this.setColumnVisible(c.id, cb.checked); });
          const mv = (d, ic, lbl) => { const b = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-xs o-btn-icon', 'aria-label': `${lbl}: ${c.title || c.id}`, title: lbl, 'data-mv': c.id + ':' + d, disabled: !w.length ? (d < 0 ? i === 0 : i === arr.length - 1) : true }, iconEl(ic)); b.onclick = () => { const o = this.columnOrder, j = o.indexOf(c.id) + d; if (j >= 0 && j < o.length) { this.moveColumn(c.id, o[j], d < 0); draw(`[data-mv="${c.id}:${d}"]`); } }; return b; };
          return h('div', { class: 'o-dt-col-item' }, h('label', { class: 'o-check' }, cb, h('span', {}, c.title || c.id)), h('span', { class: 'o-dt-col-move' }, mv(-1, 'chevron-up', this.t('table.moveUp')), mv(1, 'chevron-down', this.t('table.moveDown'))));
        }));
        if (focusSel) (list.querySelector(focusSel + ':not(:disabled)') || list.querySelector(`[data-id="${focusSel.split('"')[1]?.split(':')[0]}"]`))?.focus();
      };
      on(search, 'input', () => draw());
      const groupSel = h('select', { class: 'o-select o-input-sm', 'aria-label': this.t('table.groupBy') },
        h('option', { value: '' }, this.t('table.noGrouping')), ...this._cols.filter(c => c.key != null && c.type !== 'actions' && !this.tree).map(c => h('option', { value: c.key }, c.title)));
      groupSel.value = this.groupBy || '';
      on(groupSel, 'change', () => { this.groupBy = groupSel.value; this._collapsed.clear(); this.emit('group', { groupBy: groupSel.value }); });
      const showAll = h('button', { type: 'button', class: 'o-btn o-btn-sm' }, this.t('table.showAll'));
      showAll.onclick = () => { this._hidden.clear(); this._userHidden = true; this._afterColumns(); draw(); };
      const reset = h('button', { type: 'button', class: 'o-btn o-btn-sm' }, this.t('table.resetColumns'));
      reset.onclick = () => { this.resetColumns(); draw(); };
      el.append(h('div', { class: 'o-dt-panel-head' }, h('strong', {}, this.t('table.columns'))), h('div', { class: 'o-dt-panel-body' }, search, list),
        this.tree ? '' : h('label', { class: 'o-dt-panel-row' }, h('span', {}, this.t('table.groupBy')), groupSel),
        h('div', { class: 'o-dt-panel-actions' }, showAll, reset));
      draw();
    }, { className: 'o-dt-cols-panel', label: this.t('table.columns') });
  },

  _openDensity(anchor) {
    this._menu(anchor, ['compact', 'normal', 'comfortable'].map(d => ({ label: this.t('table.' + d), checked: this.density === d, run: () => { this.density = d; this._rh = 0; this._persist(); } })), { builtin: true, label: this.t('table.density') });
  },

  /* ── export panel ── */
  _openExport(anchor) {
    const sel = this._sel.size, name = uid('dts');
    let scope = sel ? 'selected' : 'filtered', visible = true;
    this._popover(anchor, (el, handle) => {
      const scopes = [['filtered', this.t('table.scopeFiltered'), this.total], ['selected', this.t('table.scopeSelected'), this._selAll ? this._total : sel], ['page', this.t('table.scopePage'), this._pageRows().length]];
      if (!this._server) scopes.push(['all', this.t('table.scopeAll'), this.tree ? this._flatAll().length : this._data.length]);
      const radios = scopes.map(([v, l, n]) => {
        const r = h('input', { type: 'radio', class: 'o-check-input', name, value: v, disabled: v === 'selected' && !n });
        r.checked = v === scope; on(r, 'change', () => { scope = v; });
        return h('label', { class: 'o-check' }, r, h('span', {}, l), h('span', { class: 'o-dt-count' }, fmt.number(n || 0)));
      });
      const vis = h('input', { type: 'checkbox', class: 'o-check-input' }); vis.checked = true; on(vis, 'change', () => { visible = vis.checked; });
      const fmtBtn = (f, lbl, ic) => { const b = h('button', { type: 'button', class: 'o-btn o-btn-sm' }, ic ? iconEl(ic) : null, lbl); b.onclick = () => { handle.close('select'); this.export(f, { rows: scope, columns: visible ? 'visible' : 'all' }); }; return b; };
      const btns = [fmtBtn('csv', this.t('table.exportCsv'), 'download')];
      if (this._canExport('xlsx')) btns.push(fmtBtn('xlsx', this.t('table.exportXlsx')));
      if (this._canExport('pdf')) btns.push(fmtBtn('pdf', this.t('table.exportPdf')));
      btns.push(fmtBtn('json', this.t('table.exportJson')));
      el.append(h('div', { class: 'o-dt-panel-head' }, h('strong', {}, this.t('table.export'))),
        h('div', { class: 'o-dt-panel-body' }, h('div', { class: 'o-dt-muted' }, this.t('table.scope')), ...radios, h('label', { class: 'o-check o-dt-sep-top' }, vis, h('span', {}, this.t('table.visibleOnly')))),
        h('div', { class: 'o-dt-panel-actions is-wrap' }, ...btns),
        h('div', { class: 'o-dt-panel-actions is-wrap' }, fmtBtn('clipboard', this.t('table.copy'), 'copy'), fmtBtn('print', this.t('table.print'), 'printer'), fmtBtn('preview', this.t('table.printPreview'), 'eye')));
    }, { className: 'o-dt-export-panel', label: this.t('table.export') });
  },
};
