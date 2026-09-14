// @deps dnd
/* <o-tree> — hierarchical tree / file-explorer view.
 *   <o-tree checkboxes selection="multiple" filterable draggable></o-tree>
 *   tr.nodes = [{ id, label, icon, children, expanded, checked, disabled, lazy, badge, data }, ...]
 *   or nested markup: <o-tree><ul><li data-icon="folder" data-expanded>Docs<ul><li>Resume.pdf</li></ul></li></ul></o-tree>
 *   tr.load = async (node) => children              (node.lazy = true triggers this on first expand)
 *   tr.canDrop = (drag, target, position) => boolean (position: 'before'|'after'|'inside')
 *   tr.renderLabel = (node, tree) => string | SafeHTML | Node
 *   events: o-select, o-toggle (cancelable), o-check, o-move (cancelable), o-rename (cancelable), o-context (cancelable), o-filter
 *   methods: expandAll, collapseAll, expandTo, getNode, addNode, updateNode, removeNode, getChecked, getSelected,
 *            scrollTo, setNodes, filter, clearFilter, select, toggle, check, rename
 */
i18n.add('en', {
  tree: {
    label: 'Tree', expand: 'Expand', collapse: 'Collapse', loading: 'Loading…', loadError: 'Could not load items', retry: 'Retry',
    search: 'Search…', clear: 'Clear search', noMatches: 'No matches', matches: '{count} matches',
    checked: 'checked', unchecked: 'not checked', partial: 'partially checked', selected: 'selected',
    renamePrompt: 'Rename', empty: 'No items',
  },
});
if (O.icons) {
  const extra = {
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    'folder-open': '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H8l-2.5 8H3z"/><path d="M5.5 18 8 10h13l-2.5 8a2 2 0 0 1-2 1.5H7.5a2 2 0 0 1-2-1.5z"/>',
    'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2"/>',
    'file-code': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M10 13l-2 2 2 2M14 13l2 2-2 2"/>',
    'file-image': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><circle cx="10" cy="13" r="1"/><path d="m9 18 2.5-3 2 2L16 14l2 4"/>',
    'file-archive': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M11 11v1M11 14v1M11 17v1"/>',
    'file-pdf': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 17v-4h1.5a1.5 1.5 0 0 1 0 3H8m6-3v4m0-4h1.5M12 13v4"/>',
    'corner-down-right': '<path d="m15 10 5 5-5 5M4 4v7a4 4 0 0 0 4 4h12"/>',
  };
  for (const k in extra) if (!O.icons.has(k)) O.icons.add({ [k]: extra[k] });
}

const __treeIds = new WeakMap();
/** Stable id for a node object: node.id when present, else a cached generated one (never mutates the node). */
function treeNodeId(node) {
  if (node.id != null) return String(node.id);
  let id = __treeIds.get(node);
  if (!id) { id = uid('tn'); __treeIds.set(node, id); }
  return id;
}
const FILE_ICONS = {
  js: 'file-code', ts: 'file-code', jsx: 'file-code', tsx: 'file-code', json: 'file-code', html: 'file-code', css: 'file-code', py: 'file-code', java: 'file-code', go: 'file-code', rb: 'file-code', php: 'file-code', c: 'file-code', cpp: 'file-code', rs: 'file-code', sh: 'file-code', yml: 'file-code', yaml: 'file-code',
  png: 'file-image', jpg: 'file-image', jpeg: 'file-image', gif: 'file-image', svg: 'file-image', webp: 'file-image',
  zip: 'file-archive', rar: 'file-archive', tar: 'file-archive', gz: 'file-archive', '7z': 'file-archive',
  pdf: 'file-pdf', md: 'file-text', txt: 'file-text', csv: 'file-text', doc: 'file-text', docx: 'file-text',
};

class OTree extends OElement {
  static props = {
    nodes: { type: Array, default: () => [] },
    selection: { type: String, default: 'single', reflect: true },  // none | single | multiple
    checkboxes: { type: Boolean, reflect: true },
    filetype: { type: Boolean, reflect: true },                     // file-explorer icon mode (folder/file by shape + extension)
    filterable: Boolean,
    draggable: Boolean,
    canDrop: { type: Function, attr: false },
    load: { type: Function, attr: false },
    renderLabel: { type: Function, attr: false },
    rowHeight: { type: Number, default: 28 },
    virtual: { type: String, default: 'auto', reflect: true },      // auto | on | off
    readonly: Boolean,
    height: String,
    texts: Object,
    label: String,
  };
  get nodes() { return this._nodes || (this._nodes = []); }
  set nodes(v) { this._nodes = toArr(parseAttrTree(v)); this._reindex(); this.requestUpdate('nodes'); }

  /* ── indexing (id -> node, node -> parent); O(n), run whenever the tree structure changes ── */
  _reindex() {
    this._byId = new Map();
    this._parentOf = new WeakMap();
    this._indeterminate = new WeakSet();
    const walk = (list, parent) => {
      for (const n of list) {
        this._byId.set(treeNodeId(n), n);
        this._parentOf.set(n, parent || null);
        if (Array.isArray(n.children) && n.children.length) walk(n.children, n);
      }
    };
    walk(this.nodes, null);
    if (this.checkboxes) this._recomputeChecks();
    if (!this._selected) this._selected = new Set();
    if (!this._searchExpanded) this._searchExpanded = new WeakSet();
    if (!this._matched) this._matched = new WeakSet();
    // drop selection/focus pointing at nodes that no longer exist
    for (const id of [...this._selected]) if (!this._byId.has(id)) this._selected.delete(id);
    if (this._focusId != null && !this._byId.has(this._focusId)) this._focusId = null;
  }
  _hasKids(n) { return !!(n.lazy || (Array.isArray(n.children) && n.children.length)); }
  _isExpanded(n) {
    if (this._searchQuery) return !!(n.expanded || this._searchExpanded.has(n));
    return !!n.expanded;
  }
  getNode(id) { return this._byId?.get(String(id)) || null; }
  _parent(n) { return this._parentOf?.get(n) ?? null; }
  _ancestors(n) { const out = []; for (let p = this._parent(n); p; p = this._parent(p)) out.push(p); return out; }
  _depthOf(n) { return this._ancestors(n).length; }
  _icon(n) {
    if (n.icon) return n.icon;
    if (!this.filetype) return null;
    if (this._hasKids(n)) return this._isExpanded(n) ? 'folder-open' : 'folder';
    const ext = String(n.label || '').split('.').pop().toLowerCase();
    return FILE_ICONS[ext] || 'file-text';
  }

  /* ── flattened list of currently visible rows (ancestors expanded, and — while searching — kept by the filter) ──
   * A lazy node that is expanded but not yet loaded contributes a synthetic loading/error/empty placeholder row
   * instead of real children, and kicks off `load()` the first time it is seen. */
  _visibleRows() {
    const out = [];
    const searching = !!this._searchQuery;
    const walk = (list, depth) => {
      for (const n of list) {
        if (searching && !this._matched.has(n)) continue;
        out.push({ node: n, depth });
        if (!this._hasKids(n) || !this._isExpanded(n)) continue;
        if (n.lazy && !Array.isArray(n.children)) {
          const st = n._loadState || 'idle';
          if (st === 'idle') this._startLoad(n);
          out.push({ node: this._placeholderFor(n, st === 'error' ? 'error' : 'loading'), depth: depth + 1 });
        } else if (Array.isArray(n.children)) {
          if (!n.children.length) out.push({ node: this._placeholderFor(n, 'empty'), depth: depth + 1 });
          else walk(n.children, depth + 1);
        }
      }
    };
    walk(this.nodes, 0);
    return out;
  }
  /** Cached synthetic row object for a lazy node's loading/error/empty state (never touches the real node). */
  _placeholderFor(n, kind) {
    const id = treeNodeId(n);
    const map = this._placeholders || (this._placeholders = new Map());
    const key = id + ':' + kind;
    let p = map.get(key);
    if (!p) { p = { id: '__' + kind + ':' + id, __kind: kind, __owner: n, label: '' }; map.set(key, p); }
    return p;
  }
  _rowOf(id) { return this._visibleRows().find(r => treeNodeId(r.node) === String(id)) || null; }

  /* ── tri-state checkbox cascade ── */
  _recomputeChecks() {
    const visit = n => {
      if (!this._hasKids(n) || !Array.isArray(n.children) || !n.children.length) return n.checked ? 1 : 0;
      let allC = true, anyC = false;
      for (const c of n.children) { const s = visit(c); if (s === 1) anyC = true; else if (s === 0.5) { anyC = true; allC = false; } else allC = false; }
      if (allC) { n.checked = true; this._indeterminate.delete(n); return 1; }
      if (anyC) { n.checked = false; this._indeterminate.add(n); return 0.5; }
      n.checked = false; this._indeterminate.delete(n); return 0;
    };
    this.nodes.forEach(visit);
  }
  _applyCheck(node, checked) {
    const stack = [node];
    while (stack.length) {
      const n = stack.pop();
      if (n.disabled) continue;
      n.checked = checked;
      this._indeterminate.delete(n);
      if (Array.isArray(n.children)) stack.push(...n.children);
    }
    for (let p = this._parent(node); p; p = this._parent(p)) {
      const kids = (p.children || []).filter(k => !k.disabled);
      const allC = kids.length > 0 && kids.every(k => k.checked && !this._indeterminate.has(k));
      const noneC = kids.every(k => !k.checked && !this._indeterminate.has(k));
      if (allC) { p.checked = true; this._indeterminate.delete(p); }
      else if (noneC) { p.checked = false; this._indeterminate.delete(p); }
      else { p.checked = false; this._indeterminate.add(p); }
    }
  }
  getChecked() {
    const out = [];
    const walk = list => list.forEach(n => { if (n.checked && !this._indeterminate.has(n)) out.push(n); if (Array.isArray(n.children)) walk(n.children); });
    walk(this.nodes);
    return out;
  }
  getSelected() { return [...this._selected].map(id => this.getNode(id)).filter(Boolean); }

  /* ── search / filter: keeps matches + their ancestors, and temporarily expands kept branches ── */
  filter(query) {
    query = String(query ?? '').trim();
    this._searchQuery = query;
    this._matched = new WeakSet();
    this._searchExpanded = new WeakSet();
    let count = 0;
    if (query) {
      const mark = n => {
        let keep = false;
        if (Array.isArray(n.children)) for (const c of n.children) if (mark(c)) keep = true;
        if (fuzzy(query, n.label ?? '')) { keep = true; count++; }
        if (keep) { this._matched.add(n); if (this._hasKids(n)) this._searchExpanded.add(n); }
        return keep;
      };
      this.nodes.forEach(mark);
    }
    if (this._setupDone) this._render(); else this.requestUpdate('nodes');
    this.emit('filter', { query, count });
    return count;
  }
  clearFilter() { return this.filter(''); }

  /* ── declarative <ul>/<li> markup (read once in setup() if no `nodes` were set) ── */
  _parseMarkup() {
    const ul = this.querySelector(':scope > ul');
    if (!ul) return [];
    const parseLi = li => {
      const ownText = [...li.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
      const labelEl = li.querySelector(':scope > .o-tree-li-label');
      const node = {
        id: li.dataset.id, label: li.dataset.label || labelEl?.textContent.trim() || ownText,
        icon: li.dataset.icon || null, badge: li.dataset.badge || null,
        expanded: li.hasAttribute('data-expanded') || li.hasAttribute('open'),
        checked: li.hasAttribute('data-checked'), disabled: li.hasAttribute('data-disabled'),
        lazy: li.hasAttribute('data-lazy'),
      };
      const childUl = li.querySelector(':scope > ul');
      if (childUl) node.children = [...childUl.children].filter(c => c.tagName === 'LI').map(parseLi);
      return node;
    };
    return [...ul.children].filter(c => c.tagName === 'LI').map(parseLi);
  }
  getData() { return clone(this.nodes); }
}
/** Array props may arrive as JSON strings (attributes / React 18). */
function parseAttrTree(v) { return isStr(v) ? parseAttr(v, Array) : v; }
