/* ── toolbar, hover card, export menu ─────────────────────────────────── */
Object.assign(OGantt.prototype, {
  _renderToolbar() {
    const tb = this._tb;
    tb.hidden = !this.toolbar;
    if (!this.toolbar) return;
    tb.setAttribute('aria-label', this.t('gantt.toolbar'));
    tb.setAttribute('aria-controls', this._uid + '-grid');
    const btn = (act, label, ic, extra = {}) => h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm o-btn-icon', 'data-act': act, 'aria-label': label, title: label, ...extra }, gIcon(ic));
    const sep = () => h('span', { class: 'o-gantt-tsep', 'aria-hidden': 'true' });
    const views = h('div', { class: 'o-segmented o-gantt-views', role: 'group', 'aria-label': this.t('gantt.view') },
      ...G_VIEWS.map(v => h('button', { type: 'button', 'data-view': v, 'aria-pressed': 'false' }, this.t('gantt.views.' + v))));
    const select = h('select', { class: 'o-select o-input-sm o-gantt-view-select', 'aria-label': this.t('gantt.view') },
      ...G_VIEWS.map(v => h('option', { value: v }, this.t('gantt.views.' + v))));
    const edit = this.readonly ? [] : [
      sep(),
      btn('add', this.t('gantt.addTask'), 'plus'), btn('milestone', this.t('gantt.addMilestone'), 'diamond'),
      btn('outdent', this.t('gantt.outdent'), 'outdent'), btn('indent', this.t('gantt.indent'), 'indent'),
      btn('remove', this.t('gantt.remove'), 'trash'),
      sep(),
      btn('undo', this.t('gantt.undo') + ' (Ctrl+Z)', 'undo'), btn('redo', this.t('gantt.redo') + ' (Ctrl+Y)', 'redo'),
    ];
    const exp = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm o-gantt-export', 'data-act': 'export', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
      icon('download'), h('span', { class: 'o-gantt-tb-text' }, this.t('gantt.export')));
    tb.replaceChildren(
      btn('grid', this.t('gantt.toggleGrid'), 'sidebar', { 'aria-pressed': String(this._gridShown) }),
      views, select,
      h('span', { class: 'o-gantt-zoom' }, btn('zoom-out', this.t('gantt.zoomOut'), 'zoom-out'), btn('zoom-in', this.t('gantt.zoomIn'), 'zoom-in')),
      h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', 'data-act': 'today', title: this.t('gantt.scrollToToday') }, gIcon('target'), h('span', { class: 'o-gantt-tb-text' }, this.t('gantt.today'))),
      ...edit, h('span', { class: 'o-gantt-spacer' }), exp);
    this._syncToolbar();
  },
  _syncToolbar() {
    if (!this.toolbar || !this._tb.firstChild) return;
    const view = gViewFor(this._dw), exact = Math.abs(G_VIEW_DW[view] / this._dw - 1) < 0.02;
    for (const b of this._tb.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === view && exact));
    const sel = this._tb.querySelector('.o-gantt-view-select');
    if (sel) sel.value = view;
    const set = (act, dis) => { const b = this._tb.querySelector(`[data-act="${act}"]`); if (b) b.disabled = !!dis; };
    const k = this._sel;
    set('undo', !this.canUndo); set('redo', !this.canRedo);
    set('remove', k == null);
    set('indent', k == null || !this._canIndent(k)); set('outdent', k == null || this._rec(k)?.parent == null);
    set('zoom-in', this._dw >= G_ZOOM_MAX * 0.99); set('zoom-out', this._dw <= G_ZOOM_MIN * 1.01);
    this._tb.querySelector('[data-act="grid"]')?.setAttribute('aria-pressed', String(this._gridShown));
    this._rovingToolbar();
  },
  _canIndent(k) {
    const t = this._tree, i = t.index.get(k), lv = t.level.get(k);
    for (let j = i - 1; j >= 0; j--) { const l = t.level.get(this._recs[j].key); if (l === lv) return true; if (l < lv) return false; }
    return false;
  },
  _rovingToolbar() {
    const items = this._tbItems();
    if (!items.length) return;
    let cur = items.find(x => x.tabIndex === 0 && !x.disabled);
    if (!cur) cur = items[0];
    items.forEach(x => { x.tabIndex = x === cur ? 0 : -1; });
  },
  _tbItems() { return [...this._tb.querySelectorAll('button, select')].filter(x => !x.disabled && x.offsetParent !== null); },
  _bindToolbar() {
    on(this._tb, 'click', 'button', (e, b) => {
      if (b.dataset.view) { this.setView(b.dataset.view); return; }
      switch (b.dataset.act) {
        case 'grid': this._showGrid(!this._gridShown); break;
        case 'zoom-in': this.zoomIn(); break;
        case 'zoom-out': this.zoomOut(); break;
        case 'today': this.scrollToToday('smooth'); break;
        case 'add': this._userAdd('task'); break;
        case 'milestone': this._userAdd('milestone'); break;
        case 'indent': if (this._sel != null) this._indent(this._sel); break;
        case 'outdent': if (this._sel != null) this._outdent(this._sel); break;
        case 'remove': if (this._sel != null) this._remove(this._sel); break;
        case 'undo': this.undo(); break;
        case 'redo': this.redo(); break;
        case 'export': this._openMenu(b); break;
      }
    });
    on(this._tb, 'change', 'select', (e, s) => this.setView(s.value));
    on(this._tb, 'focusin', e => { const items = this._tbItems(); if (items.includes(e.target)) items.forEach(x => { x.tabIndex = x === e.target ? 0 : -1; }); });
    on(this._tb, 'keydown', e => {
      if (e.target.tagName === 'SELECT' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) return;
      const items = this._tbItems(), i = items.indexOf(e.target);
      if (i < 0) return;
      const rtl = isRTL(this);
      let j = null;
      if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) j = (i + 1) % items.length;
      else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) j = (i - 1 + items.length) % items.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = items.length - 1;
      if (j == null) return;
      e.preventDefault();
      items[j].focus();
    });
  },

  /* ── export menu (own lightweight menu on the core overlay stack) ── */
  _openMenu(btn) {
    if (this._menu) { this._closeMenu(); return; }
    const items = [['png', this.t('gantt.exportPNG'), 'image'], ['pdf', this.t('gantt.exportPDF'), 'file'], ['json', this.t('gantt.exportJSON'), 'download']];
    const menu = h('div', { class: 'o-floating o-gantt-menu', role: 'menu', 'aria-label': this.t('gantt.export') },
      ...items.map(([f, label, ic]) => h('button', { type: 'button', role: 'menuitem', class: 'o-gantt-menu-item', 'data-fmt': f, tabindex: '-1' }, icon(ic), h('span', null, label))));
    portal(menu, this);
    const unplace = autoPlace(menu, btn, { placement: 'bottom-end', offset: 4, flip: true });
    const nav = new ListNav(menu, { items: '[role=menuitem]', onSelect: el => el.click() });
    menu.addEventListener('keydown', e => { if (nav.handle(e)) return; if (e.key === 'Tab') this._closeMenu(); });
    menu.addEventListener('click', e => {
      const it = e.target.closest('[data-fmt]');
      if (!it) return;
      const f = it.dataset.fmt;
      this._closeMenu();
      if (f === 'png') this.exportPNG(); else if (f === 'pdf') this.exportPDF(); else this.exportJSON();
    });
    btn.setAttribute('aria-expanded', 'true');
    this._menu = overlays.open({
      el: menu, owner: btn,
      onClose: () => { unplace(); menu.remove(); btn.setAttribute('aria-expanded', 'false'); this._menu = null; },
    });
    animate(menu, 'zoomIn', { duration: 120 });
    nav.first();
  },
  _closeMenu() { this._menu?.close('api'); },

  /* ── hover card ── */
  _scheduleTip(k, e) {
    clearTimeout(this._tipT);
    if (k == null) { this._tipT = setTimeout(() => this._hideTip(), 80); return; }
    if (this._tipK === k && this._tip && !this._tip.hidden) { this._placeTip(e); return; }
    const x = e.clientX, y = e.clientY;
    this._tipT = setTimeout(() => this._showTip(k, { clientX: x, clientY: y }), this._tip && !this._tip.hidden ? 60 : 380);
  },
  _showTip(k, pt) {
    if (this._drag || !this.isConnected || !this._tree.byKey.has(k)) return;
    const tip = this._tip || (this._tip = h('div', { class: 'o-floating o-gantt-tip', role: 'tooltip', id: this._uid + '-tip' }));
    const task = this._public(k);
    let content = isFn(this.tooltip) ? this.tooltip(task) : null;
    tip.replaceChildren();
    if (content instanceof Node) tip.append(content);
    else if (content instanceof SafeHTML) append(tip, content);
    else if (content != null && content !== false) tip.textContent = String(content);
    else tip.append(this._tipContent(k));
    if (!tip.isConnected) portal(tip, this); else inheritContext(tip, this);
    tip.hidden = false;
    tip.style.zIndex = String(Z.tooltip);
    this._tipK = k;
    this._placeTip(pt);
  },
  _placeTip(pt) {
    if (!this._tip || this._tip.hidden || !pt) return;
    place(this._tip, { x: pt.clientX, y: pt.clientY + 14, width: 0, height: 0 }, { placement: 'bottom-start', offset: 6, flip: true });
  },
  _hideTip() {
    clearTimeout(this._tipT);
    if (this._tip) { this._tip.hidden = true; this._tip.remove(); }
    this._tipK = null;
  },
  _tipContent(k) {
    const r = this._rec(k), p = this._posOf(k), sum = this._isSum(k);
    const f = n => this._fmtDate(n);
    const rows = [];
    const row = (label, value) => rows.push(h('dt', null, label), h('dd', null, value));
    if (r.ms) row(this.t('gantt.milestone'), f(r.s - 1));
    else {
      row(this.t('gantt.start'), f(p.s));
      row(this.t('gantt.end'), f(p.e - 1));
      row(this.t('gantt.duration'), this.t('gantt.days', { count: p.dur }));
      row(this.t('gantt.progress'), fmt.percent((p.progress || 0) / 100));
    }
    const names = r.assignees.map(gAssigneeName).filter(Boolean);
    if (names.length) row(this.t('gantt.assignee'), fmt.list(names));
    if (r.bs != null && !sum) {
      const v = this._cal.count(r.be, p.e);
      row(this.t('gantt.baseline'), r.ms ? f(r.bs - 1) : `${f(r.bs)} – ${f(r.be - 1)}`);
      if (!r.ms) row(this.t('gantt.variance'), v > 0 ? this.t('gantt.late', { count: v }) : v < 0 ? this.t('gantt.early', { count: -v }) : this.t('gantt.onTime'));
    }
    if (r.deps.length) row(this.t('gantt.predecessors'), r.deps.map(d => (this._rec(d.id)?.name || d.id) + (d.type !== 'FS' ? ` (${d.type})` : '') + (d.lag ? ` ${d.lag > 0 ? '+' : ''}${d.lag}d` : '')).join(', '));
    if (this._cp && !sum) { const s = this._cp.slack.get(k); if (s != null) row(this.t('gantt.slack'), this.t('gantt.days', { count: Math.max(0, s) })); }
    const head = h('div', { class: 'o-gantt-tip-head' },
      h('span', { class: ['o-gantt-tip-swatch', r.ms && 'is-milestone', sum && 'is-summary'], style: gColor(r.color) ? `--o-gantt-bar:${gColor(r.color)}` : null }),
      h('strong', null, r.name || '—'),
      this._cp?.critical.has(k) ? h('span', { class: 'o-badge o-badge-sm o-badge-soft-danger' }, this.t('gantt.critical')) : null);
    return h('div', null, head, h('dl', { class: 'o-gantt-tip-dl' }, ...rows));
  },
});
