/* ============================================================================
 * <o-virtual-list> — windowed rendering of large arrays (fixed or measured variable row
 * heights, horizontal strips, auto-fit grids, sticky group headers, listbox keyboard
 * selection). Renders only what is visible (+ overscan) into a small, RECYCLED pool of DOM
 * nodes so 100k+ rows scroll smoothly — nodes are reassigned to new indices as you scroll
 * rather than created/destroyed every frame (`patchList`'s identity-keyed diffing is the
 * right tool for moderate lists, but a bounded recycle pool is what keeps this one at 60fps).
 *   Orion.virtualList(container, opts) -> <o-virtual-list>
 * ========================================================================== */
i18n.add('en', { virtualList: { listLabel: 'List', empty: 'Nothing to show', loading: 'Loading…' } });

class OVirtualList extends OElement {
  static props = {
    items: { type: Array, default: () => [] },
    itemHeight: { type: Any, default: 40 },        // number (px) | 'auto'
    itemWidth: { type: Any, default: 220 },        // horizontal mode item width, or grid cell width fallback
    overscan: { type: Number, default: 6 },
    horizontal: { type: Boolean, reflect: true },
    grid: { type: Boolean, reflect: true },
    columns: { type: Number, default: 0 },          // explicit column count for grid mode; 0 = auto-fit
    minColumnWidth: { type: Number, default: 180 },
    gap: { type: Number, default: 0 },
    groupBy: { type: Any, attr: false },            // string path | (item) => key
    groupHeaderHeight: { type: Number, default: 34 },
    renderGroup: { type: Function, attr: false },   // (key, items) => Node | string
    renderItem: { type: Function, attr: false },    // (item, index) => Node | string
    keyFn: { type: Function, attr: false },         // (item, index) => string | number
    selectable: { type: String, default: '' },      // '' | 'single' | 'multiple'
    selected: { type: Array, default: () => [] },   // keys
    loading: { type: Boolean, reflect: true },
    emptyText: String,
    label: String,
    texts: Object,
  };

  constructor() {
    super();
    // Plain state (as opposed to the DOM skeleton built in setup()) is initialised in the
    // constructor, which always runs immediately on element creation, so that public methods
    // like getVisibleRange() are safe to call even a tick before the element is connected/set up
    // (custom element upgrade timing can otherwise race a consumer's own script — see README).
    this._pool = [];               // recycled row elements: { el, key, rowIndex, itemIndex, size, roOff, type }
    this._measured = new Map();    // key -> measured size (auto mode)
    this._rows = [];               // flattened rows (item | group)
    this._itemToRow = [];          // item logical index -> row index
    this._fen = new VFenwick([]);
    this._range = { start: 0, end: 0 };
    this._active = -1;             // active item index (keyboard)
    this._id = uid('vlist');
  }

  setup() {
    this.classList.add('o-vlist');
    this.tabIndex = this.tabIndex || 0;
    this._inner = h('div', { class: 'o-vlist-inner' });
    // Zero-height `position: sticky` wrapper placed at the top of the flow: it "sticks" at the
    // scroller's top edge for the whole scroll range, and its content is swapped for whichever
    // group is current — a manual transform layered on top gives the classic push-off effect.
    this._sticky = h('div', { class: 'o-vlist-sticky', hidden: true });
    this._stickyWrap = h('div', { class: 'o-vlist-sticky-wrap' }, this._sticky);
    this._empty = h('div', { class: 'o-empty o-vlist-empty', hidden: true },
      h('div', { class: 'o-empty-icon' }, icon('inbox')), h('p', { class: 'o-empty-title' }));
    this.append(this._stickyWrap, this._inner, this._empty);
    if (!this.hasAttribute('role')) this.setAttribute('role', this.grid ? 'grid' : 'listbox');

    this._onScroll = rafThrottle(() => this._layout());
    on(this, 'scroll', this._onScroll, { passive: true });
    on(this, 'keydown', e => this._onKey(e));
    on(this, 'click', '.o-vlist-row, .o-vlist-cell', (e, row) => this._onRowClick(e, row));
  }

  connected() {
    this.addCleanup(observeResize(this, rafThrottle(() => this._layout(true))));
    this.listen(doc, 'o-theme', () => this._layout(true));
  }
  disconnected() { this._freeAllSlots(); }

  update(changed) {
    if (!this.getAttribute('aria-label') && (this.label || changed.has('init'))) this.setAttribute('aria-label', this.label || this.t('virtualList.listLabel'));
    if (changed.has('grid') || changed.has('init')) this.setAttribute('role', this.grid ? 'grid' : 'listbox');
    const rebuild = ['items', 'groupBy', 'itemHeight', 'groupHeaderHeight', 'grid', 'horizontal', 'keyFn', 'init'];
    if (rebuild.some(k => changed.has(k))) this._rebuild();
    if (changed.has('selected')) this._paintSelection();
    if (changed.has('loading') || changed.has('init')) this.setAttribute('aria-busy', String(!!this.loading));
    if (changed.has('emptyText') || changed.has('init') || changed.has('locale')) this._empty.querySelector('.o-empty-title').textContent = this.emptyText || this.t('virtualList.empty');
  }

  /* ── row model ─────────────────────────────────────────────────────── */
  get _isAuto() { return !this.grid && this.itemHeight === 'auto'; }
  _fixedSize() { const v = this.horizontal ? this.itemWidth : this.itemHeight; const n = +v; return Number.isFinite(n) && n > 0 ? n : 40; }
  _rowKey(row, itemIndex) {
    if (row.type === 'group') return 'g:' + row.key;
    const kf = this.keyFn || vlDefaultKey;
    return 'i:' + kf(row.item, itemIndex);
  }

  _rebuild() {
    const items = toArr(this.items);
    this.setAttribute('aria-rowcount', String(items.length));
    if (this.grid) { this._rows = items.map(item => ({ type: 'item', item })); this._fen = null; this._layoutGrid(true); this._paintEmpty(items.length); return; }
    const rows = vlBuildRows(items, this.groupBy);
    const sizes = new Array(rows.length);
    let itemIndex = 0;
    this._itemToRow = new Array(items.length);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.type === 'group') { sizes[i] = this.groupHeaderHeight || 34; continue; }
      row.itemIndex = itemIndex; this._itemToRow[itemIndex] = i; itemIndex++;
      const key = this._rowKey(row, row.itemIndex);
      sizes[i] = this._isAuto ? (this._measured.get(key) ?? this._fixedSize()) : this._fixedSize();
    }
    this._rows = rows;
    this._fen = new VFenwick(sizes);
    this._inner.style[this.horizontal ? 'width' : 'height'] = this._fen.total() + 'px';
    this._inner.style[this.horizontal ? 'height' : 'width'] = '';
    if (this._active >= items.length) this._active = items.length - 1;
    this._paintEmpty(items.length);
    this._layout(true);
  }

  _paintEmpty(n) { this._empty.hidden = n > 0 || this.loading; }

  /* ── list / horizontal layout (fixed or measured heights, optional groups) ── */
  _viewportSize() { return this.horizontal ? this.clientWidth : this.clientHeight; }
  // In horizontal mode, rows are placed with a logical inset-inline-start so item 0 sits at the
  // reading start (right edge in RTL) and content grows toward the end — matching how the browser
  // itself reports scroll position: modern engines report RTL `scrollLeft` as 0..-(max), so we
  // normalise to an always-positive "distance scrolled from the start" for the offset math.
  _scrollPos() { if (!this.horizontal) return this.scrollTop; return isRTL(this) ? -this.scrollLeft : this.scrollLeft; }
  _setScrollPos(v) { if (!this.horizontal) { this.scrollTop = v; return; } this.scrollLeft = isRTL(this) ? -v : v; }

  _layout(force) {
    if (this.grid) return this._layoutGrid(force);
    const fen = this._fen;
    if (!fen) return;
    const vp = this._viewportSize(), pos = this._scrollPos(), overscan = Math.max(0, this.overscan || 0);
    const startAnchor = fen.indexAt(pos);
    let start = startAnchor, end = startAnchor;
    // extend backward/forward by overscan rows, then to fully cover the viewport
    for (let k = 0; k < overscan && start > 0; k++) start--;
    while (end < fen.n - 1 && fen.offsetOf(end) < pos + vp) end++;
    for (let k = 0; k < overscan && end < fen.n - 1; k++) end++;
    end = Math.min(fen.n, end + 1);
    start = Math.max(0, start);
    const prevRange = this._range;
    this._range = { start, end };
    this._reconcile(start, end);
    this._measureVisible(start);
    this._paintSticky(pos);
    if (force || start !== prevRange.start || end !== prevRange.end) {
      this.emit('range-change', { start, end, total: this._itemCount() });
      this._maybeEdgeEvents(start, end);
    }
  }

  _itemCount() { return toArr(this.items).length; }

  _maybeEdgeEvents(start, end) {
    const n = this._itemCount(); if (!n) return;
    const overscan = Math.max(1, this.overscan || 1);
    const lastItemRow = this._rows.length - (this._rows[this._rows.length - 1]?.type === 'item' ? 1 : 0);
    if (end >= this._rows.length - overscan) this.emit('near-end', { remaining: Math.max(0, n - 1 - (this._rows[Math.min(end, this._rows.length - 1)]?.itemIndex ?? n - 1)) });
    if (start <= overscan) this.emit('near-start', { index: this._rows[start]?.itemIndex ?? 0 });
  }

  _reconcile(start, end) {
    const need = new Map();          // rowIndex -> true
    for (let i = start; i < end; i++) need.set(i, true);
    const bySlotRow = new Map(this._pool.filter(s => s.rowIndex >= 0).map(s => [s.rowIndex, s]));
    const free = [];
    for (const slot of this._pool) {
      if (slot.rowIndex >= 0 && !need.has(slot.rowIndex)) { free.push(slot); slot.rowIndex = -1; }
      else if (slot.rowIndex < 0) free.push(slot);
    }
    for (let i = start; i < end; i++) {
      let slot = bySlotRow.get(i);
      if (!slot) {
        slot = free.pop();
        if (!slot) { slot = this._createSlot(); this._pool.push(slot); }
        slot.el.style.display = ''; this._inner.appendChild(slot.el);
      }
      // always re-check content: the row model may have been rebuilt (filter/sort) so the same
      // rowIndex can now hold a different item — _paintSlot no-ops the expensive part when the key matches.
      this._paintSlot(slot, i);
      this._positionSlot(slot, i);
    }
    // hide leftover free slots not reused this pass
    for (const slot of free) if (slot.rowIndex < 0 && slot.el.style.display !== 'none') slot.el.style.display = 'none';
  }

  _createSlot() {
    const el = h('div', { class: 'o-vlist-row' });
    const slot = { el, rowIndex: -1, key: null, type: null, itemIndex: -1, size: 0, roOff: null };
    // ResizeObserver catches size changes that happen *after* the synchronous measure below —
    // async images, web fonts, a `renderItem` that hydrates later — and re-anchors the scroll then too.
    slot.roOff = observeResize(el, () => this._onSlotResize(slot));
    return slot;
  }

  _onSlotResize(slot) {
    if (!this._isAuto || this.grid || slot.rowIndex < 0 || slot.type !== 'item') return;
    const real = this.horizontal ? slot.el.offsetWidth : slot.el.offsetHeight;
    if (!real || Math.abs(real - slot.size) < 0.5) return;
    const fen = this._fen, rowIndex = slot.rowIndex, anchor = this._range.start;
    const beforeAnchor = fen.offsetOf(anchor);
    fen.add(rowIndex, real - slot.size);
    this._measured.set(slot.key, real);
    slot.size = real;
    this._inner.style[this.horizontal ? 'width' : 'height'] = fen.total() + 'px';
    for (const s of this._pool) if (s.rowIndex >= 0) this._positionSlot(s, s.rowIndex);
    if (rowIndex < anchor) {
      const delta = fen.offsetOf(anchor) - beforeAnchor;
      if (Math.abs(delta) > 0.5) this._setScrollPos(this._scrollPos() + delta);
    }
  }

  _paintSlot(slot, rowIndex) {
    const row = this._rows[rowIndex];
    const key = this._rowKey(row, row.itemIndex);
    if (slot.key !== key) {
      slot.key = key; slot.rowIndex = rowIndex; slot.itemIndex = row.itemIndex ?? -1; slot.type = row.type;
      const el = slot.el;
      el.id = this._id + '-' + key.replace(/[^\w-]/g, '_');
      if (row.type === 'group') {
        el.className = 'o-vlist-row o-vlist-group';
        el.setAttribute('role', 'presentation');
        el.removeAttribute('aria-selected'); el.removeAttribute('tabindex');
        const out = isFn(this.renderGroup) ? this.renderGroup(row.key, this.items) : esc(row.key ?? '');
        this._paintContent(el, out);
      } else {
        el.className = 'o-vlist-row';
        if (this.selectable) { el.setAttribute('role', 'option'); el.setAttribute('aria-selected', String(this._isSelected(key))); el.tabIndex = -1; }
        else { el.removeAttribute('role'); el.removeAttribute('aria-selected'); el.removeAttribute('tabindex'); }
        el.dataset.key = key;
        el.dataset.index = String(row.itemIndex);
        const out = isFn(this.renderItem) ? this.renderItem(row.item, row.itemIndex) : esc(JSON.stringify(row.item));
        this._paintContent(el, out);
      }
    } else if (row.type === 'item' && this.selectable) {
      slot.el.setAttribute('aria-selected', String(this._isSelected(key)));
    }
    slot.el.classList.toggle('is-active', row.type === 'item' && row.itemIndex === this._active);
    const size = row.type === 'group' ? (this.groupHeaderHeight || 34) : (this._isAuto ? (this._measured.get(key) ?? this._fixedSize()) : this._fixedSize());
    slot.size = size;
  }

  // A Node is used as-is; anything else (string or SafeHTML) is treated as markup, matching every
  // other render callback in this library (developer-supplied content is trusted — see
  // ARCHITECTURE.md §5.4). Callers that fall back to raw data (no renderItem/renderGroup given)
  // are responsible for esc()-ing it first.
  _paintContent(el, out) {
    if (out instanceof Node) { if (el.firstChild !== out || el.childNodes.length > 1) el.replaceChildren(out); }
    else el.innerHTML = out instanceof SafeHTML ? out.s : (out == null ? '' : String(out));
  }

  _positionSlot(slot, rowIndex) {
    const fen = this._fen, off = fen.offsetOf(rowIndex);
    // in auto mode an item row's height/width is left to its content so we can measure the real size;
    // group headers (and every row in fixed mode) get the estimated/fixed size applied directly.
    const auto = this._isAuto && this._rows[rowIndex]?.type === 'item';
    if (this.horizontal) { slot.el.style.position = 'absolute'; slot.el.style.top = '0'; slot.el.style.bottom = '0'; slot.el.style.insetInlineStart = off + 'px'; css(slot.el, { width: auto ? null : slot.size, height: null }); }
    else css(slot.el, { position: 'absolute', left: 0, right: 0, top: off, height: auto ? null : slot.size, width: null });
  }

  /** Read real rendered sizes for the visible range and correct the Fenwick tree + scroll anchor. */
  _measureVisible(anchorRowIndex) {
    if (!this._isAuto) return;
    const fen = this._fen;
    const beforeAnchor = fen.offsetOf(anchorRowIndex);
    let shiftedBeforeAnchor = false;
    for (const slot of this._pool) {
      if (slot.rowIndex < 0 || slot.type !== 'item') continue;
      const real = this.horizontal ? slot.el.offsetWidth : slot.el.offsetHeight;
      if (!real || Math.abs(real - slot.size) < 0.5) continue;
      fen.add(slot.rowIndex, real - slot.size);
      this._measured.set(slot.key, real);
      if (slot.rowIndex < anchorRowIndex) shiftedBeforeAnchor = true;
      slot.size = real;
      this._positionSlot(slot, slot.rowIndex);
    }
    this._inner.style[this.horizontal ? 'width' : 'height'] = fen.total() + 'px';
    if (shiftedBeforeAnchor) {
      const delta = fen.offsetOf(anchorRowIndex) - beforeAnchor;
      if (Math.abs(delta) > 0.5) this._setScrollPos(this._scrollPos() + delta);
    }
  }

  _paintSticky(pos) {
    if (!this.groupBy || this.grid) { this._sticky.hidden = true; return; }
    const fen = this._fen, rows = this._rows;
    let gi = -1;
    for (let i = this._range.start; i >= 0; i--) { if (rows[i]?.type === 'group') { gi = i; break; } }
    if (gi < 0) { this._sticky.hidden = true; return; }
    const group = rows[gi];
    // hide the sticky clone right as the *next* header pushes it off (classic sticky-header push effect)
    let nextGi = -1;
    for (let i = gi + 1; i < rows.length; i++) if (rows[i].type === 'group') { nextGi = i; break; }
    const h1 = this.groupHeaderHeight || 34;
    let top = 0;
    if (nextGi >= 0) { const nextOff = fen.offsetOf(nextGi); const intoNext = pos + h1 - nextOff; if (intoNext > 0) top = -intoNext; }
    this._sticky.hidden = false;
    this._sticky.style.transform = `translateY(${Math.round(top)}px)`;
    const out = isFn(this.renderGroup) ? this.renderGroup(group.key, this.items) : esc(group.key ?? '');
    if (this._sticky.__key !== group.key) { this._sticky.__key = group.key; this._paintContent(this._sticky, out); }
  }

  /* ── grid layout (uniform cell size, no groups) ───────────────────── */
  _gridMetrics() {
    const w = this.clientWidth || 1, gap = this.gap || 0;
    const minW = Math.max(1, this.minColumnWidth || 180);
    const cols = this.columns > 0 ? Math.round(this.columns) : Math.max(1, Math.floor((w + gap) / (minW + gap)));
    const colW = (w - gap * (cols - 1)) / cols;
    const rowH = this._fixedSize();
    return { cols, colW, rowH, gap };
  }
  _layoutGrid(force) {
    const items = toArr(this.items), n = items.length;
    const { cols, colW, rowH, gap } = this._gridMetrics();
    const totalRows = Math.ceil(n / cols);
    const totalH = totalRows > 0 ? totalRows * (rowH + gap) - gap : 0;
    this._inner.style.height = Math.max(0, totalH) + 'px';
    this._inner.style.width = '';
    const vp = this.clientHeight, pos = this.scrollTop, overscan = Math.max(0, this.overscan || 0);
    const pitch = rowH + gap || 1;
    let startRow = Math.max(0, Math.floor(pos / pitch) - overscan);
    let endRow = Math.min(totalRows, Math.ceil((pos + vp) / pitch) + overscan);
    const start = startRow * cols, end = Math.min(n, endRow * cols);
    const prevRange = this._range;
    this._range = { start, end };
    const need = new Map(); for (let i = start; i < end; i++) need.set(i, true);
    const bySlotRow = new Map(this._pool.filter(s => s.rowIndex >= 0).map(s => [s.rowIndex, s]));
    const free = [];
    for (const slot of this._pool) { if (slot.rowIndex >= 0 && !need.has(slot.rowIndex)) { free.push(slot); slot.rowIndex = -1; } else if (slot.rowIndex < 0) free.push(slot); }
    for (let i = start; i < end; i++) {
      let slot = bySlotRow.get(i);
      if (!slot) {
        slot = free.pop();
        if (!slot) { slot = this._createSlot(); this._pool.push(slot); }
        slot.el.style.display = ''; slot.el.classList.add('o-vlist-cell'); this._inner.appendChild(slot.el);
      }
      this._paintGridSlot(slot, i);
      const r = Math.floor(i / cols), c = i % cols;
      slot.el.style.position = 'absolute'; slot.el.style.left = ''; slot.el.style.right = '';
      slot.el.style.insetInlineStart = (c * (colW + gap)) + 'px';
      css(slot.el, { top: r * pitch, width: colW, height: rowH, bottom: null });
    }
    for (const slot of free) if (slot.rowIndex < 0 && slot.el.style.display !== 'none') slot.el.style.display = 'none';
    this._paintEmpty(n);
    if (force || start !== prevRange.start || end !== prevRange.end) { this.emit('range-change', { start, end, total: n }); this._maybeEdgeEventsGrid(start, end, n); }
  }
  _paintGridSlot(slot, i) {
    const item = toArr(this.items)[i];
    const kf = this.keyFn || vlDefaultKey;
    const key = 'i:' + kf(item, i);
    if (slot.key !== key) {
      slot.key = key; slot.rowIndex = i; slot.itemIndex = i; slot.type = 'item';
      slot.el.id = this._id + '-' + key.replace(/[^\w-]/g, '_');
      if (this.selectable) { slot.el.setAttribute('role', 'option'); slot.el.tabIndex = -1; } else { slot.el.removeAttribute('role'); slot.el.removeAttribute('tabindex'); }
      slot.el.dataset.key = key; slot.el.dataset.index = String(i);
      const out = isFn(this.renderItem) ? this.renderItem(item, i) : esc(JSON.stringify(item));
      this._paintContent(slot.el, out);
    }
    if (this.selectable) slot.el.setAttribute('aria-selected', String(this._isSelected(key)));
    slot.el.classList.toggle('is-active', i === this._active);
  }
  _maybeEdgeEventsGrid(start, end, n) { if (!n) return; if (end >= n - (this.overscan || 1)) this.emit('near-end', { remaining: Math.max(0, n - end) }); if (start <= (this.overscan || 1)) this.emit('near-start', { index: start }); }

  _activeSlotFor(itemIndex) { return this._pool.find(s => s.rowIndex >= 0 && s.type === 'item' && s.itemIndex === itemIndex); }
  _freeAllSlots() { for (const s of this._pool) s.roOff?.(); this._pool.length = 0; }

  /* ── selection ─────────────────────────────────────────────────────── */
  _isSelected(key) { return (this.selected || []).includes(key.replace(/^i:/, '')); }
  _keyForItem(index) { const item = toArr(this.items)[index]; const kf = this.keyFn || vlDefaultKey; return kf(item, index); }
  _paintSelection() { for (const s of this._pool) if (s.rowIndex >= 0 && s.type === 'item') s.el.setAttribute('aria-selected', String(this._isSelected(s.key))); }

  _onRowClick(e, rowEl) {
    if (rowEl.classList.contains('o-vlist-group')) return;
    const index = +rowEl.dataset.index;
    this._active = index;
    this.focus({ preventScroll: true });
    if (this.selectable) this._toggleSelect(index, e.ctrlKey || e.metaKey || e.shiftKey);
    this.emit('activate', { index, item: toArr(this.items)[index] });
  }
  _toggleSelect(index, additive) {
    const key = this._keyForItem(index);
    let sel = toArr(this.selected).slice();
    if (this.selectable === 'single') sel = sel.includes(key) ? [] : [key];
    else if (!additive) sel = sel.includes(key) && sel.length === 1 ? [] : [key];
    else sel = sel.includes(key) ? sel.filter(k => k !== key) : [...sel, key];
    this.selected = sel;
    this.emit('select', { selected: sel, index, item: toArr(this.items)[index] });
  }

  /* ── keyboard (virtualized listbox: focus stays on the host, aria-activedescendant) ── */
  _onKey(e) {
    const n = this._itemCount(); if (!n) return;
    const vp = this._viewportSize();
    const pageRows = this.grid ? this._gridMetrics().cols * Math.max(1, Math.floor(vp / (this._fixedSize() + (this.gap || 0)))) : Math.max(1, Math.floor(vp / this._fixedSize()));
    let i = this._active < 0 ? 0 : this._active;
    const cols = this.grid ? this._gridMetrics().cols : 1;
    const map = {
      ArrowDown: () => i + (this.grid ? cols : 1),
      ArrowUp: () => i - (this.grid ? cols : 1),
      ArrowRight: () => (this.grid || this.horizontal) ? i + 1 : i,
      ArrowLeft: () => (this.grid || this.horizontal) ? i - 1 : i,
      Home: () => 0,
      End: () => n - 1,
      PageDown: () => i + pageRows,
      PageUp: () => i - pageRows,
    };
    if (map[e.key]) {
      e.preventDefault();
      this._active = clamp(map[e.key](), 0, n - 1);
      this.scrollToIndex(this._active, 'auto');
      this._layout();
      this.setAttribute('aria-activedescendant', this._id + '-' + ('i:' + this._keyForItem(this._active)).replace(/[^\w-]/g, '_'));
      this.emit('activate', { index: this._active, item: toArr(this.items)[this._active] });
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && this.selectable && this._active >= 0) {
      e.preventDefault();
      this._toggleSelect(this._active, e.ctrlKey || e.metaKey);
    }
  }

  /* ── public API ────────────────────────────────────────────────────── */
  /** Scroll so item `index` is visible. align: 'auto' | 'start' | 'center' | 'end'. */
  scrollToIndex(index, align = 'auto') {
    const n = this._itemCount(); if (!n) return;
    index = clamp(Math.round(index), 0, n - 1);
    if (this.grid) {
      const { cols, rowH, gap } = this._gridMetrics(), pitch = rowH + gap;
      const row = Math.floor(index / cols);
      this._scrollAxis(row * pitch, row * pitch + rowH, this.clientHeight, align, 'top');
      return;
    }
    const rowIndex = this._itemToRow[index]; if (rowIndex == null) return;
    const off = this._fen.offsetOf(rowIndex), size = (this._rows[rowIndex].type === 'item' ? (this._isAuto ? (this._measured.get(this._rowKey(this._rows[rowIndex], index)) ?? this._fixedSize()) : this._fixedSize()) : this._fixedSize());
    this._scrollAxis(off, off + size, this._viewportSize(), align, this.horizontal ? 'inline' : 'top');
  }
  /** axis: 'top' (always scrollTop, e.g. grid) | 'inline' (scrollTop, or the RTL-aware inline axis in horizontal mode). */
  _scrollAxis(start, end, vp, align, axis) {
    const useTop = axis === 'top' || !this.horizontal;
    const cur = useTop ? this.scrollTop : this._scrollPos();
    let target = cur;
    if (align === 'start') target = start;
    else if (align === 'end') target = end - vp;
    else if (align === 'center') target = start - (vp - (end - start)) / 2;
    else { if (start < cur) target = start; else if (end > cur + vp) target = end - vp; }
    target = Math.max(0, target);
    if (useTop) this.scrollTop = target; else this._setScrollPos(target);
    this._layout(true);
  }
  /** Re-measure and re-render (data unchanged; use after content that affects row size changes externally). */
  refresh() { this._measured.clear(); this._rebuild(); }
  /** Append items to the end — for infinite-scroll "load more". */
  appendItems(items) { const add = toArr(items); if (add.length) this.items = [...toArr(this.items), ...add]; }
  /**
   * Prepend items to the start, preserving the visual scroll position — for chat-style history
   * loading (Orion.infiniteScroll's `direction: 'up'`). Anchors on the item that was first visible.
   */
  prependItems(items) {
    const add = toArr(items); if (!add.length) return;
    if (this.grid) {
      const { cols, rowH, gap } = this._gridMetrics(), before = this.scrollTop;
      this.items = [...add, ...toArr(this.items)];
      this.flush();
      this.scrollTop = before + Math.floor(add.length / cols) * (rowH + gap);
      return;
    }
    const range = this.getVisibleRange(), anchorRow = this._rows[range.start];
    const anchorKey = anchorRow ? this._rowKey(anchorRow, anchorRow.itemIndex) : null;
    const anchorOffsetBefore = this._fen ? this._fen.offsetOf(range.start) : 0;
    const scrollBefore = this._scrollPos();
    this.items = [...add, ...toArr(this.items)];
    this.flush();
    if (anchorKey == null) return;
    const idx = this._rows.findIndex(r => r.type === 'item' && this._rowKey(r, r.itemIndex) === anchorKey);
    if (idx < 0) return;
    const delta = this._fen.offsetOf(idx) - anchorOffsetBefore;
    if (Math.abs(delta) > 0.5) this._setScrollPos(scrollBefore + delta);
  }
  /** { start, end } row indices currently rendered (row space, not item space when groupBy is set). */
  getVisibleRange() { return { ...this._range }; }
  getSelected() { return toArr(this.selected).slice(); }
  select(keys) { this.selected = toArr(keys); }
  clearSelection() { this.selected = []; }
}
define('o-virtual-list', OVirtualList);
O.VirtualList = OVirtualList;

/** Orion.virtualList(container, opts) -> <o-virtual-list> */
O.virtualList = function (el, options = {}) {
  let host = $(el);
  if (!host) return null;
  if (host.localName !== 'o-virtual-list') { const v = doc.createElement('o-virtual-list'); host.append(v); host = v; }
  for (const [k, v] of Object.entries(options)) {
    if (k === 'on' && isObj(v)) { for (const [ev, fn] of Object.entries(v)) host.addEventListener(ev.startsWith('o-') ? ev : 'o-' + ev, fn); }
    else host[k] = v;
  }
  return host;
};
