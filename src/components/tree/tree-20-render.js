/* <o-tree> rendering: one virtualized, windowed row list for every mode (small trees just render every row —
 * the window covers them all). Rows are keyed by node id and reconciled with patchList so DOM nodes are reused
 * while scrolling. Expand reveals new rows with a short reveal animation; collapse is instant (no fake nesting
 * to animate a height on — see README "Limitations"). */
Object.assign(OTree.prototype, {
  setup() {
    this.classList.add('o-tree');
    this.setAttribute('role', 'tree');
    this._gid = uid('tr');
    this.toolbarEl = h('div', { class: 'o-tree-toolbar', hidden: true });
    this.scroller = h('div', { class: 'o-tree-scroll o-scroll' });
    this.phantom = h('div', { class: 'o-tree-phantom', 'aria-hidden': 'true' });
    this.rowsEl = h('div', { class: 'o-tree-rows' });
    this.scroller.append(this.phantom, this.rowsEl);
    this.replaceChildren(this.toolbarEl, this.scroller);
    if (!this._nodes || !this._nodes.length) { const parsed = this._parseMarkup(); if (parsed.length) this.nodes = parsed; }
    this._bindUI();
    on(this.scroller, 'scroll', rafThrottle(() => this._render()));
    this.addCleanup(observeResize(this.scroller, () => this._render()));
  },
  update(changed) {
    if (changed.has('height')) this.scroller.style.height = this.height || '';
    if (changed.has('rowHeight') || changed.has('init')) this.style.setProperty('--o-tree-row-h', (this.rowHeight || 28) + 'px');
    this.setAttribute('aria-label', this.label || this.t('tree.label'));
    if (this.selection === 'multiple') this.setAttribute('aria-multiselectable', 'true'); else this.removeAttribute('aria-multiselectable');
    this._renderToolbar();
    this._render();
  },
  disconnected() { this._menuClose?.(); },

  _effectiveVirtual(total) { return this.virtual === 'off' ? false : this.virtual === 'on' ? true : total > 300; },
  _windowFor(total) {
    const rh = this.rowHeight || 28;
    if (!this._effectiveVirtual(total)) return [0, total];
    const vp = this.scroller.clientHeight || 300;
    const overscan = 8;
    const visibleCount = Math.ceil(vp / rh) + 1;
    const start = clamp(Math.floor(this.scroller.scrollTop / rh) - overscan, 0, Math.max(0, total - 1));
    const end = clamp(start + visibleCount + overscan * 2, 0, total);
    return [start, end];
  },
  _render() {
    const rows = this._visibleRows();
    this._lastRows = rows;
    const rh = this.rowHeight || 28;
    const [start, end] = this._windowFor(rows.length);
    this.phantom.style.height = (rows.length * rh) + 'px';
    this.rowsEl.style.transform = `translateY(${start * rh}px)`;
    const prevIds = new Set([...this.rowsEl.children].map(el => el.dataset.id));
    const slice = rows.slice(start, end);
    patchList(this.rowsEl, slice, r => (r.node.__kind ? r.node.id : treeNodeId(r.node)), r => this._rowEl(r), (el, r) => this._rowPatch(el, r));
    // reveal newly-expanded rows with a short animation (best-effort; skipped under reduced motion by animate())
    for (const el of this.rowsEl.children) if (!prevIds.has(el.dataset.id) && !el.dataset.id.startsWith('__')) animate(el, 'slideInUp', { duration: 130 });
    this._refreshRoving();
    this._paintToolbar();
  },
  _rowSig(n, depth) {
    if (n.__kind) return 'k:' + n.__kind;
    try { return JSON.stringify({ l: n.label, i: this._icon(n), b: n.badge, e: this._hasKids(n) && this._isExpanded(n), c: n.checked, ind: this._indeterminate?.has(n), d: n.disabled, dep: depth, sel: this._selected?.has(treeNodeId(n)), cb: this.checkboxes, q: this._searchQuery, ro: this.readonly, ft: this.filetype }) + '|' + i18n.locale; }
    catch { return Math.random(); }
  },
  _rowEl(r) {
    const el = h('div', { class: 'o-tree-row' });
    this._rowPatch(el, r);
    return el;
  },
  _rowPatch(el, r) {
    const n = r.node;
    if (n.__kind) return this._placeholderPatch(el, r);
    const sig = this._rowSig(n, r.depth);
    el.dataset.id = treeNodeId(n);
    if (el.__osig === sig) return;
    el.__osig = sig;
    el.className = cls('o-tree-row', n.disabled && 'is-disabled', this._selected?.has(treeNodeId(n)) && 'is-selected', treeNodeId(n) === this._focusId && 'is-current');
    el.setAttribute('role', 'treeitem');
    el.tabIndex = -1;
    el.style.paddingInlineStart = `calc(${r.depth} * var(--o-tree-indent, 1.25rem) + .375rem)`;
    el.setAttribute('aria-level', String(r.depth + 1));
    el.setAttribute('aria-disabled', String(!!n.disabled));
    if (n.disabled) el.classList.add('is-disabled');
    const hasKids = this._hasKids(n);
    if (hasKids) el.setAttribute('aria-expanded', String(this._isExpanded(n))); else el.removeAttribute('aria-expanded');
    if (this.selection !== 'none') el.setAttribute('aria-selected', String(this._selected?.has(treeNodeId(n)) || false));
    else el.removeAttribute('aria-selected');

    const toggle = h('button', { type: 'button', class: 'o-tree-toggle', tabindex: '-1', 'data-act': hasKids ? 'toggle' : null, 'aria-hidden': 'true' }, hasKids ? raw(icon('chevron-right')) : null);
    toggle.classList.toggle('is-expanded', hasKids && this._isExpanded(n));
    if (!hasKids) toggle.classList.add('is-leaf');

    const kids = [toggle];
    if (this.checkboxes) {
      const cb = h('input', { type: 'checkbox', class: 'o-check-input o-tree-check', tabindex: '-1', 'data-act': 'check', 'aria-label': n.label || '' });
      cb.checked = !!n.checked; cb.indeterminate = !!this._indeterminate?.has(n); cb.disabled = !!n.disabled || !!this.readonly;
      kids.push(cb);
    }
    const iconName = this._icon(n);
    if (iconName) kids.push(h('span', { class: 'o-tree-icon' }, raw(icon(iconName))));
    let labelContent;
    if (isFn(this.renderLabel)) { const rr = this.renderLabel(n, this); labelContent = rr instanceof Node ? rr : raw(rr instanceof SafeHTML ? rr.s : String(rr ?? '')); }
    else labelContent = raw(this._searchQuery ? highlight(n.label ?? '', this._searchQuery) : esc(n.label ?? ''));
    kids.push(h('span', { class: 'o-tree-label', 'data-act': 'label' }, labelContent));
    if (n.badge != null && n.badge !== '') kids.push(h('span', { class: 'o-badge o-badge-sm o-tree-badge' }, String(n.badge)));
    el.replaceChildren(...kids);
  },
  _placeholderPatch(el, r) {
    const n = r.node;
    if (el.__osig === 'k:' + n.__kind && el.dataset.owner === treeNodeId(n.__owner)) return;
    el.__osig = 'k:' + n.__kind;
    el.dataset.id = n.id;
    el.dataset.owner = treeNodeId(n.__owner);
    el.className = 'o-tree-row o-tree-row-placeholder';
    el.removeAttribute('role'); el.removeAttribute('aria-level'); el.removeAttribute('aria-selected'); el.removeAttribute('aria-expanded');
    el.tabIndex = -1;
    el.style.paddingInlineStart = `calc(${r.depth} * var(--o-tree-indent, 1.25rem) + .375rem)`;
    el.replaceChildren();
    if (n.__kind === 'loading') el.append(h('span', { class: 'o-spinner o-spinner-xs o-spinner-inherit', 'aria-hidden': 'true' }), h('span', null, this.t('tree.loading')));
    else if (n.__kind === 'error') el.append(iconEl('alert-circle'), h('span', null, this.t('tree.loadError')), h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-xs', 'data-act': 'retry' }, this.t('tree.retry')));
    else el.append(h('span', { class: 'o-tree-empty-label' }, this.t('tree.empty')));
  },
  _refreshRoving() {
    const rows = this._lastRows || this._visibleRows();
    if (this._focusId == null || !rows.some(r => !r.node.__kind && treeNodeId(r.node) === this._focusId)) {
      const first = rows.find(r => !r.node.__kind);
      this._focusId = first ? treeNodeId(first.node) : null;
    }
    for (const el of this.rowsEl.children) el.tabIndex = el.dataset.id === this._focusId ? 0 : -1;
  },
});
