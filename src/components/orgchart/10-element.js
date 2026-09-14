/* ============================================================================
 * <o-orgchart> element.
 * ========================================================================== */

class OOrgChart extends OElement {
  static props = {
    nodes: { type: Array, default: () => [] },
    direction: { type: String, default: 'TB', reflect: true },
    compact: { type: Boolean, reflect: true },
    collapsible: { type: Boolean, default: true },
    // NOTE: the property is `searchable` (not `search`) because `search(query)` is a public method
    // (ARCHITECTURE.md §5.2 footgun: a prop must never share a name with a method on the same class —
    // the generated accessor is skipped when an "own" prototype member already exists, so `<o-orgchart search>`
    // would otherwise silently replace the `search()` method with the boolean `true` on first attribute set).
    // The HTML attribute stays `search` for a natural `<o-orgchart search>` usage.
    searchable: { type: Boolean, attr: 'search' },
    draggable: Boolean,
    toolbar: { type: Boolean, default: true },
    minZoom: { type: Number, default: 0.1 },
    maxZoom: { type: Number, default: 3 },
    autoFit: { type: Boolean, default: true },
    renderNode: Function,
    label: String,
    texts: Object,
  };

  setup() {
    this.classList.add('o-orgchart');
    this._all = []; this._byId = new Map(); this._kids = new Map(); this._roots = [];
    this._collapsed = new Set(); this._deptColors = new Map();
    this._nEls = new Map(); this._lEls = new Map();
    this._sel = null; this._pathIds = null; this._query = ''; this._matches = []; this._focusId = null;
    this._visibleList = []; this._visibleSet = new Set();

    this._gLinks = svg('g', { class: 'o-org-links' });
    this._gNodes = svg('g', { class: 'o-org-nodes', role: 'tree' });
    this._gOverlay = svg('g', { class: 'o-org-overlay' });
    this._vpG = svg('g', { class: 'o-org-viewport' }, this._gLinks, this._gNodes, this._gOverlay);
    this._svg = svg('svg', { class: 'o-org-svg', role: 'presentation' }, this._vpG);

    this._zoomLbl = h('button', { type: 'button', class: 'o-org-zoom-pct', onClick: () => this.zoomTo(1, { animate: true }) }, '100%');
    this._zoomBar = h('div', { class: 'o-org-zoom', role: 'toolbar' },
      this._btn('zoom-out', 'orgchart.zoomOut', () => this._vp.zoomBy(1 / 1.25, { animate: true })), this._zoomLbl,
      this._btn('zoom-in', 'orgchart.zoomIn', () => this._vp.zoomBy(1.25, { animate: true })), this._btn('fit', 'orgchart.fit', () => this.fit({ animate: true })));

    this._searchInput = h('input', { type: 'search', class: 'o-input o-input-sm', role: 'combobox', 'aria-expanded': 'false', autocomplete: 'off' });
    this._searchList = h('div', { class: 'o-org-search-list o-scroll', role: 'listbox', hidden: true });
    this._searchBox = h('div', { class: 'o-org-search', role: 'search', hidden: true }, h('span', { class: 'o-org-search-ic', 'aria-hidden': 'true' }, ocIcon('search')), this._searchInput, this._searchList);

    this._top = h('div', { class: 'o-org-toolbar' }, this._searchBox, h('span', { class: 'o-spacer' }), this._menuBtn('download', 'orgchart.export'));
    this._help = h('p', { class: 'o-sr-only', id: uid('org-help') });
    this._stage = h('div', { class: 'o-org-stage', tabindex: '0', role: 'application', 'aria-describedby': this._help.id }, this._svg, this._zoomBar);
    this._body = h('div', { class: 'o-org-body' }, this._stage);
    this.replaceChildren(this._top, this._body, this._help);

    this._vp = new O.diagram.Viewport(this._stage, {
      min: this.minZoom, max: this.maxZoom,
      apply: (x, y, k) => this._applyVp(x, y, k),
      onChange: () => this.emit('viewport', { x: this._vp.x, y: this._vp.y, zoom: this._vp.k }, { bubbles: false }),
    });
    this._bind();
    this.focusTarget = this._stage;
  }
  connected() {
    this.addCleanup(observeResize(this, r => this._resized(r)));
    this.addCleanup(this._vp.attach({ canPan: e => !e.target.closest('.o-org-card, .o-org-toggle, .o-org-ui, .o-org-toolbar, .o-org-zoom'), wheel: 'zoom' }));
    this.listen(document, 'o-theme', () => {});
  }
  disconnected() {
    clearTimeout(this._a11yT);
    this._menuOv?.close('api');
    this._vp?.stop();
  }
  update(changed) {
    const init = changed.has('init');
    if (changed.has('minZoom') || changed.has('maxZoom')) { this._vp.o.min = this.minZoom; this._vp.o.max = this.maxZoom; }
    if (init || changed.has('nodes')) this._rebuild();
    if (init || changed.has('locale') || changed.has('texts')) this._texts();
    if (init || changed.has('toolbar')) this._top.hidden = !this.toolbar;
    if (init || changed.has('searchable')) this._searchBox.hidden = !this.searchable;
    if (init || changed.has('renderNode') || changed.has('locale')) { for (const rec of this._nEls.values()) rec.sig = ''; this._render(); }
    this.classList.toggle('is-compact', !!this.compact);
    if (!init && (changed.has('direction') || changed.has('compact'))) this._relayout(true);
  }

  /* ── small UI helpers ─────────────────────────────────────────────── */
  _btn(iconName, key, onClick) {
    return h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': this.t(key), title: this.t(key), 'data-key': key, onClick }, ocIcon(iconName));
  }
  _menuBtn(iconName, key) {
    const btn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm o-btn-icon', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': this.t(key), title: this.t(key), 'data-key': key }, ocIcon(iconName));
    btn.addEventListener('click', () => {
      if (this._menuOv && this._menuOwner === btn) { this._menuOv.close('api'); return; }
      const r = btn.getBoundingClientRect();
      this._menu({ x: isRTL(this) ? r.right : r.left, y: r.bottom + 2 }, this._exportItems());
    });
    return btn;
  }
  _menu(pt, items) {
    this._menuOv?.close('api');
    const panel = h('div', { class: 'o-floating o-org-menu o-org-float', role: 'menu', tabindex: '-1' });
    for (const it of items.filter(Boolean)) {
      if (it === '-') { if (panel.lastChild && !panel.lastChild.classList.contains('o-org-menu-sep')) panel.append(h('div', { class: 'o-org-menu-sep', role: 'separator' })); continue; }
      panel.append(h('button', { type: 'button', class: 'o-org-menu-item', role: 'menuitem', onClick: () => { this._menuOv?.close('api'); it.run(); } },
        h('span', { class: 'o-org-menu-ic' }, it.icon ? ocIcon(it.icon) : null), h('span', { class: 'o-org-menu-text' }, it.label)));
    }
    if (panel.lastChild?.classList.contains('o-org-menu-sep')) panel.lastChild.remove();
    portal(panel, this);
    place(panel, { x: pt.x, y: pt.y }, { placement: 'bottom-start', offset: 2, rtl: isRTL(this) });
    const nav = new ListNav(panel, { items: '[role=menuitem]', onSelect: el => el.click() });
    on(panel, 'keydown', e => { if (nav.handle(e)) return; if (e.key === 'Tab') { e.preventDefault(); this._menuOv?.close('api'); } });
    this._menuOwner = this.querySelector('[data-key="orgchart.export"]');
    this._menuOwner?.setAttribute('aria-expanded', 'true');
    this._menuOv = overlays.open({ el: panel, owner: this._menuOwner, onClose: () => { panel.remove(); this._menuOv = null; this._menuOwner?.setAttribute('aria-expanded', 'false'); this._menuOwner = null; } });
    animate(panel, 'zoomIn', { duration: 120 });
    nav.first();
  }
  _exportItems() {
    return [
      { label: this.t('orgchart.exportSVG'), icon: 'image', run: () => this.download('svg') },
      { label: this.t('orgchart.exportPNG'), icon: 'image', run: () => this.download('png') },
      '-',
      { label: this.t('orgchart.expandAll'), icon: 'plus', run: () => this.expandAll() },
      { label: this.t('orgchart.collapseAll'), icon: 'minus', run: () => this.collapseAll() },
    ];
  }
  _texts() {
    this._searchInput.placeholder = this.t('orgchart.searchPlaceholder');
    this._searchInput.setAttribute('aria-label', this.t('orgchart.searchPlaceholder'));
    this.querySelectorAll('[data-key]').forEach(b => { const s = this.t(b.dataset.key); b.setAttribute('aria-label', s); b.title = s; });
    this._a11yDirty();
  }

  /* ── model ────────────────────────────────────────────────────────── */
  _rebuild() {
    const raw = toArr(this._p.nodes);
    const seen = new Set();
    this._all = raw.map((n, i) => { const o = ocNorm(n, i); if (seen.has(o.id)) o.id = o.id + '_' + i; seen.add(o.id); return o; });
    this._byId = new Map(this._all.map(n => [n.id, n]));
    for (const n of this._all) if (n.parentId != null && (!this._byId.has(n.parentId) || n.parentId === n.id)) n.parentId = null;
    this._kids = new Map(this._all.map(n => [n.id, []]));
    const roots = [];
    for (const n of this._all) { if (n.parentId != null) this._kids.get(n.parentId).push(n.id); else roots.push(n.id); }
    this._roots = roots;
    this._deptColors.clear();
    let ci = 0;
    for (const n of this._all) if (n.department && !this._deptColors.has(n.department)) this._deptColors.set(n.department, ++ci);
    this._collapsed = new Set([...this._collapsed].filter(id => this._byId.has(id)));
    if (this._sel && !this._byId.has(this._sel)) this._sel = null;
    this._fitPending = this.autoFit;
    this._relayout(false);
  }
  _visible() {
    const out = [], seen = new Set();
    const walk = id => {
      if (seen.has(id)) return; seen.add(id);
      const n = this._byId.get(id); if (!n) return;
      out.push(n);
      if (!this._collapsed.has(id)) for (const c of this._kids.get(id) || []) walk(c);
    };
    this._roots.forEach(walk);
    return out;
  }
  _cardSize() { return this.compact ? { w: 168, h: 58 } : { w: 224, h: 92 }; }
  _gap() { return this.compact ? 36 : 54; }
  _relayout(animate, after) {
    const visible = this._visible();
    const { w, h } = this._cardSize();
    const idset = new Set(visible.map(n => n.id));
    const items = visible.map(n => ({ id: n.id, width: w, height: h }));
    const edges = visible.filter(n => n.parentId != null && idset.has(n.parentId)).map(n => ({ from: n.parentId, to: n.id }));
    const dir = /^(TB|BT|LR|RL)$/.test(this.direction) ? this.direction : 'TB';
    const pos = items.length ? O.diagram.layout.tree(items, edges, { direction: dir, nodeSep: this.compact ? 16 : 26, rankSep: this._gap() }) : new Map();
    const moves = visible.map(n => { const p = pos.get(n.id) || { x: n.x || 0, y: n.y || 0 }; return { n, x0: n.x ?? p.x, y0: n.y ?? p.y, x1: p.x, y1: p.y, w, h }; });
    const finish = () => {
      for (const m of moves) { m.n.x = m.x1; m.n.y = m.y1; m.n.width = m.w; m.n.height = m.h; }
      this._visibleList = visible; this._visibleSet = idset;
      this._render();
      if (this._fitPending && this._stage.clientWidth) { this._fitPending = false; this.fit(); }
      this._updateToolbarState();
      after?.();
    };
    if (animate && !reducedMotion() && moves.length && moves.length <= 400) {
      const t0 = performance.now();
      const step = now => {
        const t = Math.min(1, (now - t0) / 320), e = 1 - Math.pow(1 - t, 3);
        for (const m of moves) { m.n.x = m.x0 + (m.x1 - m.x0) * e; m.n.y = m.y0 + (m.y1 - m.y0) * e; m.n.width = m.w; m.n.height = m.h; }
        this._visibleList = visible; this._visibleSet = idset;
        this._render();
        if (t < 1) requestAnimationFrame(step); else finish();
      };
      requestAnimationFrame(step);
    } else finish();
  }
  _updateToolbarState() {}
  _resized(r) {
    this.classList.toggle('is-narrow', r.width < 480);
    if (this._fitPending && r.width) { this._fitPending = false; this.fit(); }
  }

  /* ── rendering ────────────────────────────────────────────────────── */
  _applyVp(x, y, k) {
    this._vpG.setAttribute('transform', `matrix(${k} 0 0 ${k} ${x} ${y})`);
    if (this._lastK !== k) { this._lastK = k; this.classList.toggle('is-far', k < 0.45); this._zoomLbl.textContent = Math.round(k * 100) + '%'; }
  }
  _render() {
    const liveN = new Set();
    for (const n of this._visibleList) { liveN.add(n.id); this._syncNode(n); }
    for (const [id, rec] of this._nEls) if (!liveN.has(id)) { rec.g.remove(); this._nEls.delete(id); }
    const liveL = new Set();
    for (const n of this._visibleList) {
      if (n.parentId == null || !this._visibleSet.has(n.parentId)) continue;
      liveL.add(n.id);
      const p = this._byId.get(n.parentId);
      let rec = this._lEls.get(n.id);
      if (!rec) { rec = { path: svg('path', { class: 'o-org-link' }) }; this._lEls.set(n.id, rec); }
      if (!rec.path.parentNode) this._gLinks.append(rec.path);
      rec.path.setAttribute('d', ocLink(this.direction, p, n, this._gap()));
      rec.path.classList.toggle('is-path', !!(this._pathIds && this._pathIds.has(n.id) && this._pathIds.has(p.id)));
    }
    for (const [id, rec] of this._lEls) if (!liveL.has(id)) { rec.path.remove(); this._lEls.delete(id); }
    this._a11yDirty();
  }
  _syncNode(n) {
    let rec = this._nEls.get(n.id);
    if (!rec) {
      const fo = svg('foreignObject', { class: 'o-org-fo' });
      const div = h('div', { class: 'o-org-card', xmlns: 'http://www.w3.org/1999/xhtml', tabindex: '-1', role: 'treeitem' });
      fo.append(div);
      const toggle = svg('g', { class: 'o-org-toggle', 'aria-hidden': 'true' }, svg('circle', { class: 'o-org-toggle-bg', r: 9 }), svg('path', { class: 'o-org-toggle-h', d: 'M-4 0H4' }), svg('path', { class: 'o-org-toggle-v', d: 'M0 -4V4' }));
      const g = svg('g', { class: 'o-org-node', 'data-id': n.id }, fo, toggle);
      rec = { g, fo, div, toggle, sig: '' };
      this._nEls.set(n.id, rec);
    }
    if (!rec.g.parentNode) this._gNodes.append(rec.g);
    rec.g.setAttribute('transform', `translate(${Math.round(n.x)} ${Math.round(n.y)})`);
    rec.fo.setAttribute('width', n.width); rec.fo.setAttribute('height', n.height);
    const kids = this._kids.get(n.id) || [], hasKids = kids.length > 0, collapsed = this._collapsed.has(n.id);
    const sig = [n.name, n.title, n.department, n.avatar, n.email, n.badge, n.color, hasKids, kids.length, collapsed, this.compact, this._deptColors.get(n.department), isFn(this.renderNode) ? 'r' + JSON.stringify(n.data || null) : ''].join('|');
    if (rec.sig !== sig) { rec.sig = sig; this._paintCard(rec, n, hasKids, kids.length, collapsed); }
    const isSel = this._sel === n.id;
    rec.div.classList.toggle('is-selected', isSel);
    rec.div.classList.toggle('is-match', !!(this._query && this._matches.some(m => m.id === n.id)));
    rec.div.classList.toggle('is-dim', !!(this._query && this._matches.length && !this._matches.some(m => m.id === n.id)));
    rec.div.classList.toggle('is-path', !!(this._pathIds && this._pathIds.has(n.id)));
    rec.div.setAttribute('aria-selected', String(isSel));
    if (hasKids) rec.div.setAttribute('aria-expanded', String(!collapsed)); else rec.div.removeAttribute('aria-expanded');
    rec.div.tabIndex = (this._focusId ? this._focusId === n.id : n.id === this._roots[0]) ? 0 : -1;
    return rec;
  }
  _avatarEl(n) {
    if (customElements.get('o-avatar')) return h('o-avatar', { class: 'o-org-avatar', props: { name: n.name, src: n.avatar || undefined, size: this.compact ? 'sm' : 'md' } });
    const initials = (n.name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
    return n.avatar ? h('div', { class: 'o-org-avatar o-org-avatar-fb' }, h('img', { src: n.avatar, alt: '' })) : h('div', { class: 'o-org-avatar o-org-avatar-fb' }, initials);
  }
  _paintCard(rec, n, hasKids, kidCount, collapsed) {
    const accent = n.color || (n.department ? `var(--o-chart-${((this._deptColors.get(n.department) - 1) % 8) + 1})` : 'var(--o-border-strong)');
    rec.div.style.setProperty('--o-org-accent', accent);
    if (n.email) rec.div.title = n.email; else rec.div.removeAttribute('title');
    let body;
    if (isFn(this.renderNode)) { try { body = this.renderNode(clone(n)); } catch (e) { console.error('[Orion] orgchart renderNode failed:', e); } }
    if (body instanceof Node) rec.div.replaceChildren(body);
    else if (isStr(body)) rec.div.innerHTML = sanitize(body);
    else {
      rec.div.replaceChildren(...[
        h('div', { class: 'o-org-accent' }),
        this._avatarEl(n),
        h('div', { class: 'o-org-info' },
          h('div', { class: 'o-org-name' }, n.name || this.t('orgchart.untitled')),
          !this.compact && n.title ? h('div', { class: 'o-org-title' }, n.title) : null,
          n.department ? h('div', { class: 'o-org-dept' }, n.department) : null),
        n.badge ? h('span', { class: 'o-org-badge' }, n.badge) : null,
        hasKids ? h('span', { class: 'o-org-count', title: this.t(kidCount === 1 ? 'orgchart.reports' : 'orgchart.reports_plural', { count: kidCount }) }, ocIcon('users'), String(kidCount)) : null,
      ].filter(Boolean));
    }
    rec.toggle.style.display = hasKids && this.collapsible ? '' : 'none';
    rec.toggle.classList.toggle('is-collapsed', collapsed);
    rec.toggle.setAttribute('aria-label', this.t(collapsed ? 'orgchart.expand' : 'orgchart.collapse'));
    const horiz = this.direction === 'LR' || this.direction === 'RL';
    const tx = horiz ? (this.direction === 'LR' ? n.width : 0) : n.width / 2;
    const ty = horiz ? n.height / 2 : (this.direction === 'BT' ? 0 : n.height);
    rec.toggle.setAttribute('transform', `translate(${tx} ${ty})`);
  }

  /* ── interaction ──────────────────────────────────────────────────── */
  _bind() {
    on(this._stage, 'pointerdown', e => this._down(e));
    on(this._stage, 'pointermove', e => this._move(e));
    on(this._stage, 'pointerup', e => this._up(e, false));
    on(this._stage, 'pointercancel', e => this._up(e, true));
    on(this._stage, 'dblclick', '.o-org-card', (e, card) => { const g = card.closest('.o-org-node'); if (g) this._toggle(g.dataset.id); });
    on(this._gNodes, 'focusin', e => { const g = e.target.closest && e.target.closest('.o-org-node'); if (g) this._focusId = g.dataset.id; });
    on(this, 'keydown', e => this._key(e));
    on(this._searchInput, 'input', () => this.search(this._searchInput.value));
    on(this._searchInput, 'keydown', e => this._onSearchKey(e));
  }
  _hit(t) {
    const el = t && t.nodeType === 1 ? t : t?.parentElement;
    if (!el || !el.closest) return { kind: 'bg' };
    let m;
    if ((m = el.closest('.o-org-toggle'))) { const g = m.closest('.o-org-node'); return { kind: 'toggle', id: g?.dataset.id }; }
    if ((m = el.closest('.o-org-node'))) return { kind: 'node', id: m.dataset.id };
    if (el.closest('.o-org-zoom, .o-org-toolbar, .o-org-float')) return { kind: 'ui' };
    return { kind: 'bg' };
  }
  _down(e) {
    const hit = this._hit(e.target);
    if (hit.kind === 'ui' || e.button !== 0) return;
    if (hit.kind === 'toggle') { this._pendingToggle = hit.id; e.preventDefault(); return; }
    if (hit.kind === 'node') {
      this._drag = { kind: 'maybe', id: hit.id, sx: e.clientX, sy: e.clientY, pid: e.pointerId };
      try { this._stage.setPointerCapture(e.pointerId); } catch {}
    }
  }
  _move(e) {
    const d = this._drag; if (!d || d.pid !== e.pointerId) return;
    if (d.kind === 'maybe') {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
      if (!this.draggable) { d.kind = 'done'; return; }
      d.kind = 'reassign'; this.classList.add('is-reassigning');
    }
    if (d.kind !== 'reassign') return;
    const el = doc.elementFromPoint(e.clientX, e.clientY);
    const hit = this._hit(el);
    let tid = hit.kind === 'node' ? hit.id : null;
    if (tid === d.id || (tid && this._isDescendant(tid, d.id))) tid = null;
    d.target = tid;
    this._dragVisual(d, e);
  }
  _up(e, cancel) {
    const d = this._drag;
    if (d) {
      this._drag = null;
      try { this._stage.releasePointerCapture(e.pointerId); } catch {}
      this.classList.remove('is-reassigning');
      this._clearDragVisual();
      if (!cancel) {
        if (d.kind === 'reassign' && d.target) this._reassign(d.id, d.target, true);
        else if (d.kind === 'maybe') this._clickNode(d.id, e);
      }
    }
    if (this._pendingToggle) { const id = this._pendingToggle; this._pendingToggle = null; if (!cancel) this._toggle(id); }
  }
  _dragVisual(d, e) {
    if (!this._dragLine) { this._dragLine = svg('path', { class: 'o-org-drag-line' }); this._gOverlay.append(this._dragLine); }
    const src = this._byId.get(d.id), w = this._vp.toWorld(e.clientX, e.clientY);
    this._dragLine.setAttribute('d', `M${src.x + src.width / 2} ${src.y + src.height / 2}L${w.x} ${w.y}`);
    for (const [id, rec] of this._nEls) rec.div.classList.toggle('is-drop-target', id === d.target);
  }
  _clearDragVisual() { this._dragLine?.remove(); this._dragLine = null; for (const rec of this._nEls.values()) rec.div.classList.remove('is-drop-target'); }
  _clickNode(id, e) {
    const n = this._byId.get(id); if (!n) return;
    this.select(id);
    this._focusId = id;
    this._nEls.get(id)?.div.focus({ preventScroll: true });
    this.emit('node-click', { node: clone(n), originalEvent: e });
  }
  _isDescendant(id, ofId) { let n = this._byId.get(id); while (n && n.parentId != null) { if (n.parentId === ofId) return true; n = this._byId.get(n.parentId); } return false; }
  _toggle(id) {
    const kids = this._kids.get(id) || []; if (!kids.length) return;
    const willCollapse = !this._collapsed.has(id);
    if (willCollapse) this._collapsed.add(id); else this._collapsed.delete(id);
    this._relayout(true);
    this.emit('toggle', { id, expanded: !willCollapse });
    announce(this.t(willCollapse ? 'orgchart.collapse' : 'orgchart.expand'));
  }
  _key(e) {
    const t = e.target;
    if (t === this._searchInput) return;
    if (!this._stage.contains(t) && t !== this) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && this.searchable) { e.preventDefault(); this._searchInput.focus(); return; }
    const id = this._focusId || this._sel || this._roots[0];
    const n = id && this._byId.get(id);
    if (n) {
      const horiz = this.direction === 'LR' || this.direction === 'RL';
      const map = { ArrowDown: horiz ? null : 'child', ArrowUp: horiz ? null : 'parent', ArrowRight: horiz ? 'child' : 'next', ArrowLeft: horiz ? 'parent' : 'prev' };
      if (!horiz) { map.ArrowRight = 'next'; map.ArrowLeft = 'prev'; }
      const act = map[e.key];
      if (act) {
        e.preventDefault();
        let target = null;
        if (act === 'parent') target = n.parentId;
        else if (act === 'child') { const kids = this._kids.get(id) || []; if (kids.length && !this._collapsed.has(id)) target = kids[0]; }
        else { const sibs = n.parentId != null ? (this._kids.get(n.parentId) || []) : this._roots; const i = sibs.indexOf(id); if (i >= 0) target = sibs[act === 'next' ? Math.min(i + 1, sibs.length - 1) : Math.max(i - 1, 0)]; }
        if (target && target !== id) {
          this._focusId = target; this.select(target);
          const rec = this._nEls.get(target);
          if (rec) { rec.div.focus({ preventScroll: true }); const tn = this._byId.get(target); this._vp.ensureVisible({ x: tn.x, y: tn.y, w: tn.width, h: tn.height }, 40, { animate: true }); }
        }
        return;
      }
      if (e.key === ' ') { if ((this._kids.get(id) || []).length && this.collapsible) { e.preventDefault(); this._toggle(id); } return; }
      if (e.key === 'Enter') { e.preventDefault(); this.emit('node-click', { node: clone(n), originalEvent: e }); return; }
    }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); this._vp.zoomBy(1.25, { animate: true }); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); this._vp.zoomBy(1 / 1.25, { animate: true }); }
    else if (e.key === '0') { e.preventDefault(); this.zoomTo(1, { animate: true }); }
    else if (e.key === '1') { e.preventDefault(); this.fit({ animate: true }); }
  }

  /* ── search ───────────────────────────────────────────────────────── */
  search(query) {
    this._query = query || '';
    const q = this._query.trim();
    this._matches = q ? fuzzySearch(this._all, q, n => `${n.name} ${n.title} ${n.department}`, 8) : [];
    this._searchList.hidden = !q;
    this._searchInput.setAttribute('aria-expanded', String(!!q));
    this._searchList.replaceChildren(...(q ? (this._matches.length ? this._matches.map(m => h('div', { role: 'option', class: 'o-org-search-opt', onClick: () => { this.focusPerson(m.id); this._searchList.hidden = true; } }, h('span', { html: highlight(m.name, q) }), m.title ? h('small', null, m.title) : null)) : [h('div', { class: 'o-org-search-empty' }, this.t('orgchart.noResults'))]) : []));
    for (const rec of this._nEls.values()) {
      const id = rec.g.dataset.id;
      rec.div.classList.toggle('is-match', !!(q && this._matches.some(m => m.id === id)));
      rec.div.classList.toggle('is-dim', !!(q && this._matches.length && !this._matches.some(m => m.id === id)));
    }
    this.emit('search', { query: this._query, matches: this._matches.map(clone) });
    return this._matches.map(clone);
  }
  _onSearchKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); if (this._matches[0]) { this.focusPerson(this._matches[0].id); this._searchList.hidden = true; } }
    else if (e.key === 'Escape') { e.preventDefault(); this._searchInput.value = ''; this.search(''); }
  }
  focusPerson(id, opts = {}) {
    id = String(id);
    const n = this._byId.get(id); if (!n) return false;
    let changed = false, p = n.parentId;
    while (p != null) { if (this._collapsed.delete(p)) changed = true; p = this._byId.get(p)?.parentId; }
    const path = new Set(); let cur = id;
    while (cur != null) { path.add(cur); cur = this._byId.get(cur)?.parentId; }
    this._pathIds = path;
    this.select(id);
    this._focusId = id;
    const after = () => {
      const t = this._byId.get(id), rec = this._nEls.get(id);
      this._vp.center(t.x + t.width / 2, t.y + t.height / 2, Math.max(this._vp.k, 0.85), { animate: opts.animate !== false });
      rec?.div.focus({ preventScroll: true });
    };
    if (changed) this._relayout(true, after); else { this._render(); after(); }
    announce(this.t('orgchart.focused', { name: n.name }));
    return true;
  }

  /* ── reassignment ─────────────────────────────────────────────────── */
  reassign(id, newParentId) { return this._reassign(String(id), newParentId == null ? null : String(newParentId), false); }
  _reassign(id, newParentId, user) {
    const n = this._byId.get(id); if (!n) return false;
    if (newParentId != null && (newParentId === id || this._isDescendant(newParentId, id) || !this._byId.has(newParentId))) { if (user) announce(this.t('orgchart.reassignNotAllowed')); return false; }
    if (n.parentId === newParentId) return false;
    const detail = { id, from: n.parentId, to: newParentId, node: clone(n) };
    if (!this.emit('reassign', detail)) return false;
    const oldParent = n.parentId;
    n.parentId = newParentId;
    const raw = toArr(this._p.nodes).find(r => String(r.id) === id || (r.id == null && false));
    if (raw) raw.parentId = newParentId;
    const oldList = this._kids.get(oldParent); if (oldList) { const i = oldList.indexOf(id); if (i >= 0) oldList.splice(i, 1); }
    if (newParentId != null) { if (!this._kids.has(newParentId)) this._kids.set(newParentId, []); this._kids.get(newParentId).push(id); }
    this._roots = this._all.filter(x => x.parentId == null).map(x => x.id);
    this._relayout(true);
    if (user) announce(this.t('orgchart.reassigned', { name: n.name, manager: newParentId ? (this._byId.get(newParentId)?.name || '') : this.t('orgchart.noManager') }));
    this.emit('change', { nodes: this.getValue() });
    return true;
  }

  /* ── public API ───────────────────────────────────────────────────── */
  expand(id) { id = String(id); if (this._collapsed.delete(id)) { this._relayout(true); this.emit('toggle', { id, expanded: true }); } }
  collapse(id) { id = String(id); if ((this._kids.get(id) || []).length && !this._collapsed.has(id)) { this._collapsed.add(id); this._relayout(true); this.emit('toggle', { id, expanded: false }); } }
  toggle(id) { this._toggle(String(id)); }
  isExpanded(id) { return !this._collapsed.has(String(id)); }
  expandAll() { if (this._collapsed.size) { this._collapsed.clear(); this._relayout(true); } }
  collapseAll() { this._collapsed = new Set(this._all.filter(n => (this._kids.get(n.id) || []).length).map(n => n.id)); this._relayout(true); }
  select(id) {
    id = id == null ? null : String(id);
    if (id === this._sel) return;
    this._sel = id && this._byId.has(id) ? id : null;
    for (const rec of this._nEls.values()) { const s = rec.g.dataset.id === this._sel; rec.div.classList.toggle('is-selected', s); rec.div.setAttribute('aria-selected', String(s)); }
    this.emit('select', { node: this._sel ? clone(this._byId.get(this._sel)) : null });
  }
  getSelection() { return this._sel ? clone(this._byId.get(this._sel)) : null; }
  getValue() { return clone(this._all.map(({ x, y, width, height, ...rest }) => rest)); }
  getNodes() { return this.getValue(); }
  getNode(id) { const n = this._byId.get(String(id)); return n ? clone(n) : null; }
  getChildren(id) { return (this._kids.get(String(id)) || []).map(cid => clone(this._byId.get(cid))); }
  getAncestors(id) { const out = []; let p = this._byId.get(String(id))?.parentId; while (p != null) { const n = this._byId.get(p); if (!n) break; out.push(clone(n)); p = n.parentId; } return out; }

  /* ── view ─────────────────────────────────────────────────────────── */
  _contentBounds() { return O.diagram.bounds(this._visibleList); }
  fit(opts = {}) { const b = this._contentBounds(); if (!b) return this._vp.set(40, 40, 1, opts); return this._vp.fit(b, { padding: opts.padding ?? 40, max: opts.maxZoom ?? 1, animate: opts.animate }); }
  zoomTo(k, opts = {}) { return k === 'fit' ? this.fit(opts) : this._vp.zoomTo(+k || 1, opts); }
  get zoom() { return this._vp ? this._vp.k : 1; }

  /* ── export ───────────────────────────────────────────────────────── */
  exportSVG(opts = {}) {
    const b = this._contentBounds() || { x: 0, y: 0, w: 200, h: 120 };
    const bg = opts.background === false ? null : opts.background || O.diagram.resolveColor(this, 'var(--o-org-bg, var(--o-surface))');
    return O.diagram.exportSVG([this._gLinks, this._gNodes], b, { padding: opts.padding ?? 24, background: bg, foreign: opts.foreign || 'keep', title: this.label || this.t('orgchart.label') });
  }
  exportPNG(opts = {}) { return O.diagram.svgToPNG(this.exportSVG({ ...opts, foreign: 'text' }), { scale: opts.scale || 2 }); }
  async download(format = 'png', filename) {
    const base = filename || String(this.label || 'orgchart').trim().toLowerCase().replace(/[^\w-]+/g, '-') || 'orgchart';
    const name = base.includes('.') ? base : base + '.' + format;
    if (format === 'svg') download(this.exportSVG(), name, 'image/svg+xml');
    else download(await this.exportPNG(), name, 'image/png');
  }

  /* ── a11y ─────────────────────────────────────────────────────────── */
  _a11yDirty() { clearTimeout(this._a11yT); this._a11yT = setTimeout(() => this._renderA11y(), 250); }
  _renderA11y() {
    if (!this.isConnected) return;
    this._help.textContent = this.t('orgchart.help');
    this._stage.setAttribute('aria-label', (this.label ? this.label + '. ' : '') + this.t('orgchart.summary', { count: this._all.length }));
  }
}
define('o-orgchart', OOrgChart);
O.OrgChart = OOrgChart;
