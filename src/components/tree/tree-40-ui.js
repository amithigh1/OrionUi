/* <o-tree> interactions: delegated clicks, WAI-ARIA keyboard, inline rename, lazy loading, filter toolbar,
 * and the public mutation API (expandAll/collapseAll/expandTo/getNode/addNode/updateNode/removeNode/
 * getChecked/getSelected/scrollTo/setNodes, plus select/toggle/check/rename). */
Object.assign(OTree.prototype, {
  _bindUI() {
    on(this, 'click', '[data-act]', (e, el) => { e.stopPropagation(); this._act(el.dataset.act, el); });
    on(this, 'click', '.o-tree-row', (e, row) => { if (row.classList.contains('o-tree-row-placeholder') || e.target.closest('[data-act]')) return; this._rowClick(row, e); });
    on(this, 'dblclick', '.o-tree-label', (e, label) => { if (this.readonly) return; const row = label.closest('.o-tree-row'); if (row && !row.classList.contains('o-tree-row-placeholder')) this.rename(row.dataset.id); });
    on(this, 'contextmenu', '.o-tree-row', (e, row) => {
      if (row.classList.contains('o-tree-row-placeholder') || e.shiftKey) return;
      e.preventDefault();
      this._context(this.getNode(row.dataset.id), { x: e.clientX, y: e.clientY });
    });
    on(this, 'keydown', e => { if (e.target.closest('.o-tree-rename')) return; this._keydown(e); });
    on(this, 'focusin', '.o-tree-row', (e, row) => { if (!row.classList.contains('o-tree-row-placeholder')) this._focusId = row.dataset.id; });
    if (this.draggable) this._bindDnd();
  },
  _act(act, el) {
    const row = el.closest('.o-tree-row');
    const id = row?.dataset.id;
    if (act === 'toggle') this.toggle(id, undefined, { user: true });
    else if (act === 'check') this.check(id, el.checked);
    else if (act === 'retry') this._startLoad(this.getNode(row.dataset.owner));
  },
  _rowClick(row, e) {
    const id = row.dataset.id;
    const n = this.getNode(id);
    if (!n || n.disabled) return;
    if (this.selection !== 'none') this.select(id, { toggle: this.selection === 'multiple' && (e.ctrlKey || e.metaKey), range: this.selection === 'multiple' && e.shiftKey, activate: true });
    this._focusId = id;
    row.tabIndex = 0;
    row.focus();
  },
  _rowElOf(id) { return id == null ? null : this.rowsEl.querySelector(`[data-id="${CSS.escape(String(id))}"]`); },
  _context(node, anchor) {
    if (!node) return;
    const point = anchor instanceof Element ? (() => { const r = anchor.getBoundingClientRect(); return { x: r.left + 8, y: r.top + r.height / 2 }; })() : anchor;
    this.emit('context', { node, x: point.x, y: point.y });
  },

  /* ── keyboard: WAI-ARIA treeview pattern ── */
  _keydown(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey) return;
    const rows = this._lastRows || this._visibleRows();
    const real = r => r && !r.node.__kind;
    let idx = rows.findIndex(r => real(r) && treeNodeId(r.node) === this._focusId);
    if (idx < 0) { const first = rows.findIndex(real); if (first >= 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home')) { e.preventDefault(); this._focusRow(rows[first]); } return; }
    const cur = rows[idx], rtl = isRTL(this), key = e.key;
    const nextReal = (from, dir) => { for (let i = from; i >= 0 && i < rows.length; i += dir) if (real(rows[i])) return rows[i]; return null; };
    if (key === 'ArrowDown') { e.preventDefault(); const r = nextReal(idx + 1, 1); if (r) this._focusRow(r); return; }
    if (key === 'ArrowUp') { e.preventDefault(); const r = nextReal(idx - 1, -1); if (r) this._focusRow(r); return; }
    if (key === 'Home') { e.preventDefault(); const r = nextReal(0, 1); if (r) this._focusRow(r); return; }
    if (key === 'End') { e.preventDefault(); const r = nextReal(rows.length - 1, -1); if (r) this._focusRow(r); return; }
    const expandKey = rtl ? 'ArrowLeft' : 'ArrowRight', collapseKey = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (key === expandKey) {
      e.preventDefault();
      const n = cur.node;
      if (this._hasKids(n)) { if (!this._isExpanded(n)) this.toggle(treeNodeId(n), true, { user: true }); else { const r = nextReal(idx + 1, 1); if (r) this._focusRow(r); } }
      return;
    }
    if (key === collapseKey) {
      e.preventDefault();
      const n = cur.node;
      if (this._hasKids(n) && this._isExpanded(n)) this.toggle(treeNodeId(n), false, { user: true });
      else { const p = this._parent(n); if (p) this._focusRow({ node: p, depth: cur.depth - 1 }); }
      return;
    }
    if (key === 'Enter') { e.preventDefault(); this.select(treeNodeId(cur.node), { activate: true, toggle: this.selection === 'multiple' && (e.ctrlKey || e.metaKey) }); return; }
    if (key === ' ') {
      e.preventDefault();
      if (this.checkboxes) this.check(treeNodeId(cur.node));
      else this.select(treeNodeId(cur.node), { toggle: this.selection === 'multiple' });
      return;
    }
    if (key === '*') {
      e.preventDefault();
      const p = this._parent(cur.node), sibs = p ? (p.children || []) : this.nodes;
      sibs.forEach(s => { if (this._hasKids(s)) s.expanded = true; });
      this._render();
      return;
    }
    if (key === 'F2') { e.preventDefault(); this.rename(treeNodeId(cur.node)); return; }
    if ((key === 'F10' && e.shiftKey) || key === 'ContextMenu') { e.preventDefault(); this._context(cur.node, this._rowElOf(treeNodeId(cur.node))); return; }
    if (key.length === 1 && /\S/.test(key) && !e.altKey) {
      const now = Date.now();
      this._buf = (now - (this._bufT || 0) > 700 ? '' : (this._buf || '')) + key.toLowerCase();
      this._bufT = now;
      const list = rows.filter(real);
      const curI = list.findIndex(r => treeNodeId(r.node) === this._focusId);
      const start = curI + (this._buf.length === 1 ? 1 : 0);
      for (let n = 0; n < list.length; n++) {
        const r = list[(start + n) % list.length];
        if (String(r.node.label || '').toLowerCase().startsWith(this._buf)) { e.preventDefault(); this._focusRow(r); break; }
      }
    }
  },
  _focusRow(r) {
    this._focusId = treeNodeId(r.node);
    this._ensureVisible(r.node);
    this._render();
    const el = this._rowElOf(this._focusId);
    if (el) { el.tabIndex = 0; el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' }); }
  },
  _ensureVisible(node) {
    const rows = this._lastRows || this._visibleRows();
    const idx = rows.findIndex(r => !r.node.__kind && treeNodeId(r.node) === treeNodeId(node));
    if (idx < 0 || !this._effectiveVirtual(rows.length)) return;
    const rh = this.rowHeight || 28, top = idx * rh, bottom = top + rh;
    if (this.scroller.scrollTop > top) this.scroller.scrollTop = top;
    else if (this.scroller.scrollTop + this.scroller.clientHeight < bottom) this.scroller.scrollTop = bottom - this.scroller.clientHeight;
  },

  /* ── selection / expand / check / rename ── */
  select(id, opts = {}) {
    const n = this.getNode(id);
    if (!n || n.disabled || this.selection === 'none') return false;
    if (!this.emit('select', { node: n, id: String(id), ctrlKey: !!opts.toggle, shiftKey: !!opts.range })) return false;
    if (this.selection === 'single') { this._selected.clear(); this._selected.add(String(id)); }
    else if (opts.range && this._lastSelectedId) {
      const rows = this._lastRows || this._visibleRows();
      const a = rows.findIndex(r => !r.node.__kind && treeNodeId(r.node) === this._lastSelectedId);
      const b = rows.findIndex(r => !r.node.__kind && treeNodeId(r.node) === String(id));
      if (a >= 0 && b >= 0) { const lo = Math.min(a, b), hi = Math.max(a, b); for (let i = lo; i <= hi; i++) if (!rows[i].node.__kind) this._selected.add(treeNodeId(rows[i].node)); }
    } else if (opts.toggle) { this._selected.has(String(id)) ? this._selected.delete(String(id)) : this._selected.add(String(id)); }
    else { this._selected.clear(); this._selected.add(String(id)); }
    this._lastSelectedId = String(id);
    this._render();
    announce(this.t('tree.selected') + ': ' + (n.label || ''));
    return true;
  },
  toggle(id, expanded, opts = {}) {
    const n = this.getNode(id);
    if (!n || !this._hasKids(n)) return false;
    const next = expanded == null ? !this._isExpanded(n) : !!expanded;
    if (next === !!n.expanded) return true;
    if (!this.emit('toggle', { node: n, expanded: next })) return false;
    n.expanded = next;
    this._render();
    if (opts.user) announce((next ? this.t('tree.expand') : this.t('tree.collapse')) + ': ' + (n.label || ''));
    return true;
  },
  check(id, checked) {
    const n = this.getNode(id);
    if (!n || n.disabled || !this.checkboxes || this.readonly) return false;
    const next = checked == null ? !(n.checked && !this._indeterminate.has(n)) : !!checked;
    if (!this.emit('check', { node: n, checked: next })) return false;
    this._applyCheck(n, next);
    this._render();
    announce((n.label || '') + ': ' + this.t(next ? 'tree.checked' : 'tree.unchecked'));
    return true;
  },
  rename(id) {
    if (this.readonly) return false;
    const n = this.getNode(id);
    if (!n || n.disabled) return false;
    const row = this._rowElOf(id);
    const label = row?.querySelector('.o-tree-label');
    if (!label) return false;
    const input = h('input', { class: 'o-input o-input-sm o-tree-rename', value: n.label || '', 'aria-label': this.t('tree.renamePrompt') });
    label.replaceChildren(input);
    let done = false;
    const finish = commit => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (commit && v && v !== n.label && this.emit('rename', { node: n, value: v, previous: n.label })) n.label = v;
      this._render();
      this._rowElOf(id)?.focus();
    };
    on(input, 'keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
    on(input, 'blur', () => finish(true));
    on(input, 'pointerdown', e => e.stopPropagation());
    input.focus();
    input.select();
    return true;
  },
  async _startLoad(n) {
    if (!n || n._loadState === 'loading') return;
    n._loadState = 'loading';
    this._render();
    try {
      const children = toArr(isFn(this.load) ? await this.load(n) : []);
      n.children = children;
      n._loadState = 'loaded';
      this._reindex();
    } catch (err) {
      n._loadState = 'error';
      console.error('[Orion] <o-tree> load failed:', err);
    }
    this._render();
  },

  /* ── filter toolbar ── */
  _renderToolbar() {
    const tb = this.toolbarEl;
    tb.hidden = !this.filterable;
    if (!this.filterable) return;
    if (!tb.firstChild || tb.__loc !== i18n.locale) {
      tb.__loc = i18n.locale;
      const input = h('input', { class: 'o-input o-input-sm', type: 'search', placeholder: this.t('tree.search'), 'aria-label': this.t('tree.search'), value: this._searchQuery || '' });
      on(input, 'input', debounce(() => { const n = this.filter(input.value); this._paintToolbar(n); }, 160));
      on(input, 'keydown', e => { if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; this.filter(''); this._paintToolbar(0); } });
      tb.replaceChildren(h('div', { class: 'o-input-wrap o-tree-search' }, raw(icon('search')), input), h('span', { class: 'o-tree-summary', 'aria-hidden': 'true' }));
    }
    this._paintToolbar(this._searchQuery ? this._lastMatchCount : undefined);
  },
  _paintToolbar(count) {
    const tb = this.toolbarEl;
    if (!this.filterable || !tb.firstChild) return;
    this._lastMatchCount = count;
    const summary = tb.querySelector('.o-tree-summary');
    summary.textContent = this._searchQuery ? (count ? this.t('tree.matches', { count }) : this.t('tree.noMatches')) : '';
    const input = tb.querySelector('input');
    if (input && input.value !== (this._searchQuery || '') && doc.activeElement !== input) input.value = this._searchQuery || '';
  },

  /* ── public API ── */
  expandAll(id) {
    const root = id != null ? this.getNode(id) : null;
    const walk = list => list.forEach(n => { if (this._hasKids(n)) n.expanded = true; if (Array.isArray(n.children)) walk(n.children); });
    walk(root ? (root.children || []) : this.nodes);
    if (root) root.expanded = true;
    this._render();
  },
  collapseAll(id) {
    const root = id != null ? this.getNode(id) : null;
    const walk = list => list.forEach(n => { n.expanded = false; if (Array.isArray(n.children)) walk(n.children); });
    if (root) { walk(root.children || []); root.expanded = false; } else walk(this.nodes);
    this._render();
  },
  expandTo(id) {
    const n = this.getNode(id);
    if (!n) return false;
    this._ancestors(n).forEach(p => { p.expanded = true; });
    this._render();
    this.scrollTo(id);
    return true;
  },
  addNode(parentId, node, index) {
    const parent = parentId != null ? this.getNode(parentId) : null;
    const list = parent ? (parent.children || (parent.children = [])) : this.nodes;
    const at = index == null ? list.length : clamp(Math.round(index), 0, list.length);
    list.splice(at, 0, node);
    if (parent) parent.expanded = true;
    this._reindex();
    this._render();
    return node;
  },
  updateNode(id, patch = {}) {
    const n = this.getNode(id);
    if (!n) return false;
    Object.assign(n, patch);
    this._render();
    return n;
  },
  removeNode(id) {
    const n = this.getNode(id);
    if (!n) return false;
    const parent = this._parent(n);
    const list = parent ? (parent.children || []) : this.nodes;
    const i = list.indexOf(n);
    if (i >= 0) list.splice(i, 1);
    this._selected.delete(treeNodeId(n));
    this._reindex();
    this._render();
    return true;
  },
  setNodes(nodes) { this.nodes = nodes; return this.nodes; },
  scrollTo(id) {
    const n = this.getNode(id);
    if (!n) return false;
    this._ancestors(n).forEach(p => { p.expanded = true; });
    this._render();
    const rows = this._lastRows;
    const idx = rows.findIndex(r => !r.node.__kind && treeNodeId(r.node) === String(id));
    if (idx < 0) return false;
    const rh = this.rowHeight || 28;
    this.scroller.scrollTop = Math.max(0, idx * rh - this.scroller.clientHeight / 2);
    this._render();
    return true;
  },
});
define('o-tree', OTree);
O.Tree = OTree;
/** Orion.tree(el, options) -> the <o-tree> element (creates one if el is a plain container). */
O.tree = function (target, options = {}) {
  let el = isStr(target) ? $(target) : target;
  if (el && el.localName !== 'o-tree') { const host = el; el = h('o-tree'); host.replaceWith(el); }
  if (!el) { el = h('o-tree'); doc.body.appendChild(el); }
  Object.assign(el, options);
  return el;
};
