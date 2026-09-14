// @deps split, tabs
/* IDE-style dockable panels — regions (start / center / end / bottom), each a tab group with resizable
 * splitters (built on <o-split>), drag-to-move between regions, floating windows, minimize-to-rail,
 * maximize, a "Panels" menu to close/restore, and layout persistence.
 *   <o-dock layout-key="ide" label="Workbench">
 *     <o-dock-panel id="explorer" title="Explorer" icon="file" region="start" size="20">…</o-dock-panel>
 *     <o-dock-panel id="editor" title="index.js" icon="file" region="center">…</o-dock-panel>
 *     <o-dock-panel id="terminal" title="Terminal" icon="monitor" region="bottom" size="28">…</o-dock-panel>
 *     <o-dock-panel id="outline" title="Outline" icon="list" region="end" size="18" closable="false">…</o-dock-panel>
 *   </o-dock>
 * Methods: getLayout() · setLayout(obj) · reset() · movePanel(id, region, index?) · float(id, {x,y,w,h}?) · dockBack(id)
 *          toggleMinimize(region) · minimize(region) · expand(region) · toggleMaximize(region) · maximize(region) · restore()
 *          close(id) · open(id) · getPanels() · openPanelsMenu(anchor?)
 * Events: o-layout-change { layout } · o-close (cancelable) { id } · o-panel-move { id, from, to }
 * Panel props: title, icon, badge, region ('start'|'center'|'end'|'bottom', default 'center'), size (% weight of its region), closable (default true)
 * Keyboard: arrows / Home / End move focus between tabs in a region, Delete closes, ContextMenu / Shift+F10 opens the panel menu
 * (Move to…, Float, Minimize/Expand, Maximize/Restore, Close, Panels…). Below ~600px wide, all open panels collapse into one tab strip.
 */
i18n.add('en', {
  dock: {
    label: 'Panels', panels: 'Panels', panelMenu: 'Panel menu', move: 'Move to', float: 'Float', dockBack: 'Dock',
    minimize: 'Minimize', expand: 'Expand', maximize: 'Maximize', restore: 'Restore', close: 'Close', closePanel: 'Close {title}',
    closed: '{title} closed', opened: '{title} opened', regionStart: 'Sidebar', regionCenter: 'Main area', regionEnd: 'Secondary sidebar',
    regionBottom: 'Bottom panel', moved: '{title} moved to {region}', floated: '{title} floated', docked: '{title} docked',
    minimized: '{region} minimized', expanded: '{region} expanded', maximized: '{title} maximized', restored: 'Layout restored',
    empty: 'No panels open', emptyHint: 'Reopen a panel from the Panels menu.', resetLayout: 'Reset layout',
  },
});

const DOCK_REGIONS = ['start', 'center', 'end', 'bottom'];
const DOCK_RAIL_PX = { start: 40, end: 40, bottom: 36 };
const dockTabsKit = () => O.Tabs.kit;

class ODockPanel extends OElement {
  static props = {
    title: String, icon: String, badge: String,
    region: { type: String, default: 'center' },
    size: Number, closable: { type: Boolean, default: true },
  };
  setup() {
    this.classList.add('o-dock-panel');
    this.setAttribute('role', 'tabpanel');
    if (!this.id) this.id = uid('dockpanel');
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this.hidden = true;
  }
  update() { this.closest('o-dock')?._queuePanelSync?.(this); }
}

class ODock extends OElement {
  static props = { layoutKey: String, label: String, texts: Object };

  setup() {
    this.classList.add('o-dock');
    this._panels = new Map();      // id -> entry
    this._order = [];              // stable ids order (persistence + compact mode)
    this._compact = false;
    this._maxRegion = null;
    this._floatZ = 0;
    this._booted = false;

    DOCK_REGIONS.forEach(name => this._region(name, true));
    this._region('compact', false);

    // Seed each region's initial split weight from its panels' `size` before <o-split> reads data-size
    // (attribute reads only, since child <o-dock-panel> elements may not be upgraded yet at this point).
    const declared = [...this.children].filter(c => c.localName === 'o-dock-panel');
    DOCK_REGIONS.forEach(r => {
      const sz = Math.max(0, ...declared.filter(p => (p.getAttribute('region') || 'center') === r).map(p => +p.getAttribute('size') || 0));
      if (sz) this._regions[r].el.setAttribute('data-size', String(sz));
    });

    this._colSplit = h('o-split', { direction: 'vertical', class: 'o-dock-col' }, this._regions.center.el, this._regions.bottom.el);
    this._outer = h('o-split', { direction: 'horizontal', class: 'o-dock-outer' }, this._regions.start.el, this._colSplit, this._regions.end.el);
    this.append(this._outer, this._regions.compact.el);

    on(this, 'click', '.o-dock-tab', (e, tab) => { if (!e.target.closest('.o-dock-tab-close')) this._activateTab(tab); });
    on(this, 'click', '.o-dock-tab-close', (e, btn) => { e.stopPropagation(); this.close(btn.closest('.o-dock-tab').dataset.id); });
    on(this, 'auxclick', '.o-dock-tab', (e, tab) => { if (e.button === 1) { e.preventDefault(); this.close(tab.dataset.id); } });
    on(this, 'mousedown', '.o-dock-tab', e => { if (e.button === 1) e.preventDefault(); });
    on(this, 'contextmenu', '.o-dock-tab', (e, tab) => { e.preventDefault(); this._openPanelMenu(tab.dataset.id, tab); });
    on(this, 'keydown', '.o-dock-tabs', (e, box) => this._key(e, box));
    on(this, 'pointerdown', '.o-dock-tab', (e, tab) => { if (e.button === 0 && !e.target.closest('.o-dock-tab-close')) this._dragStart(e, tab); });
    on(this, 'click', '.o-dock-tool', (e, btn) => this._tool(btn));
    on(this, 'click', '.o-dock-rail-btn', (e, btn) => {
      const region = btn.closest('.o-dock-region').dataset.region;
      this._regions[region].active = btn.dataset.id;
      this.expand(region);
    });
  }

  connected() {
    this._mo = new MutationObserver(() => this._queueSync());
    this._mo.observe(this, { childList: true });
    this.addCleanup(() => this._mo.disconnect());
    this.addCleanup(observeResize(this, rafThrottle(() => this._checkCompact())));
    this.listen(win, 'resize', rafThrottle(() => this._floats?.forEach(f => this._clampFloat(f))));
    this.listen(this, 'o-resize-end', () => { if (this._booted) this._layoutChanged(); });
    this._checkCompact();
    if (!this._booted) { this._booted = true; this._sync(true); }
  }

  update(changed) {
    if (changed.has('init') || changed.has('locale') || changed.has('texts') || changed.has('label')) {
      this.setAttribute('aria-label', this.label || this.t('dock.label'));
      DOCK_REGIONS.concat('compact').forEach(r => this._paintRegionChrome(r));
      this._panels.forEach(p => this._paintTab(p));
    }
  }

  /* ── region scaffolding ─────────────────────────────────────────── */
  _region(name, collapsible) {
    this._regions ||= {};
    const railBtns = h('div', { class: 'o-dock-rail-btns' });
    const rail = h('div', { class: 'o-dock-rail', hidden: true }, railBtns);
    const tabs = h('div', { class: 'o-dock-tabs', role: 'tablist' });
    const menuBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm o-dock-tool', 'data-tool': 'menu', 'aria-haspopup': 'menu' }, icon('more-horizontal'));
    const minBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm o-dock-tool', 'data-tool': 'minimize' }, icon('minimize'));
    const maxBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm o-dock-tool', 'data-tool': 'maximize' }, icon('maximize'));
    const tools = h('div', { class: 'o-dock-tools' }, menuBtn, name !== 'center' && name !== 'compact' ? minBtn : null, name !== 'compact' ? maxBtn : null);
    const tabstrip = h('div', { class: 'o-dock-tabstrip' }, tabs, tools);
    const panes = h('div', { class: 'o-dock-panes' });
    const empty = h('div', { class: 'o-empty o-empty-sm o-dock-empty', hidden: true }, h('div', { class: 'o-empty-icon' }, icon('columns')), h('p', { class: 'o-empty-title' }), h('p', { class: 'o-empty-text' }));
    const group = h('div', { class: 'o-dock-group' }, tabstrip, panes, empty);
    const el = h('div', { class: 'o-dock-region', 'data-region': name }, collapsible ? rail : null, group);
    if (collapsible) { el.setAttribute('data-collapsible', ''); el.setAttribute('data-collapsed-size', String(DOCK_RAIL_PX[name] || 40)); }
    const reg = { name, el, rail, railBtns, tabsEl: tabs, tabstripEl: tabstrip, panesEl: panes, group, emptyEl: empty, menuBtn, minBtn, maxBtn, active: null, minimized: false, collapsible };
    reg.nav = new ListNav(tabs, { items: '.o-dock-tab', orientation: 'horizontal', typeahead: false, activeClass: 'is-focus', onSelect: tab => this._activateTab(tab) });
    this._regions[name] = reg;
    return reg;
  }
  _paintRegionChrome(name) {
    const reg = this._regions[name];
    if (!reg) return;
    reg.tabsEl.setAttribute('aria-label', this.t('dock.region' + cap(name === 'compact' ? 'center' : name)));
    reg.menuBtn.setAttribute('aria-label', this.t('dock.panelMenu')); reg.menuBtn.title = this.t('dock.panelMenu');
    if (reg.minBtn) { reg.minBtn.setAttribute('aria-label', this.t('dock.minimize')); reg.minBtn.title = this.t('dock.minimize'); }
    if (reg.maxBtn) { const lbl = this.t(this._maxRegion === name ? 'dock.restore' : 'dock.maximize'); reg.maxBtn.setAttribute('aria-label', lbl); reg.maxBtn.title = lbl; }
    reg.emptyEl.querySelector('.o-empty-title').textContent = this.t('dock.empty');
    reg.emptyEl.querySelector('.o-empty-text').textContent = this.t('dock.emptyHint');
  }

  /* ── model sync (declarative <o-dock-panel> children) ────────────── */
  _queueSync() { if (this._sq) return; this._sq = true; queueMicrotask(() => { this._sq = false; if (this.isConnected) this._sync(); }); }
  _queuePanelSync(panelEl) { const e = [...this._panels.values()].find(p => p.panelEl === panelEl); if (e) { this._absorb(e, panelEl); this._paintTab(e); this._rebuild(); } }
  _sync(initial) {
    const saved = initial && this.layoutKey ? ls.get('orion:dock:' + this.layoutKey) : null;
    const savedById = new Map((saved?.panels || []).map(p => [p.id, p]));
    const kids = [...this.children].filter(c => c.localName === 'o-dock-panel');
    let changed = false;
    kids.forEach(panelEl => {
      if (!panelEl.id) panelEl.id = uid('dockpanel');
      const id = panelEl.id;
      let entry = this._panels.get(id);
      if (!entry) {
        entry = { id, panelEl, region: 'center', order: this._order.length, closable: true, closed: false, floatEl: null, float: null, lastRegion: null, tabEl: null };
        this._panels.set(id, entry);
        this._order.push(id);
        changed = true;
      }
      this._absorb(entry, panelEl);
      const sp = savedById.get(id);
      if (initial && sp) { entry.region = DOCK_REGIONS.includes(sp.region) ? sp.region : entry.region; entry.closed = !!sp.closed; entry.order = sp.order ?? entry.order; if (sp.float) entry.float = sp.float; }
    });
    // drop entries whose panel element left the document entirely
    for (const [id, entry] of [...this._panels]) {
      if (!entry.panelEl.isConnected) { entry.tabEl?.remove(); entry.floatEl?.remove(); this._panels.delete(id); this._order = this._order.filter(x => x !== id); changed = true; }
    }
    if (initial) {
      this._order.sort((a, b) => (this._panels.get(a).order ?? 0) - (this._panels.get(b).order ?? 0));
      if (saved) {
        if (saved.outerSizes) this._outer.setSizes(saved.outerSizes, { silent: true });
        if (saved.colSizes) this._colSplit.setSizes(saved.colSizes, { silent: true });
        DOCK_REGIONS.filter(r => r !== 'center').forEach(r => { if (saved.minimized?.includes(r)) this._minimizedInit = (this._minimizedInit || new Set()).add(r); });
        if (saved.maxRegion) this._maxRegionInit = saved.maxRegion;
        (saved.floats || []).forEach(f => { const e = this._panels.get(f.id); if (e && !e.closed) { e.lastRegion = f.region || e.region; e._pendingFloat = f; } });
      }
    }
    this._rebuild();
    if (initial) {
      DOCK_REGIONS.filter(r => r !== 'center').forEach(r => { if (this._minimizedInit?.has(r)) this.minimize(r, { silent: true }); });
      if (this._maxRegionInit) this.maximize(this._maxRegionInit, { silent: true });
      for (const entry of this._panels.values()) if (entry._pendingFloat) { const f = entry._pendingFloat; delete entry._pendingFloat; this.float(entry.id, f); }
    }
    if (changed && !initial) this._layoutChanged();
  }
  _absorb(entry, panelEl) {
    entry.title = panelEl.title || panelEl.getAttribute('title') || '';
    entry.icon = panelEl.icon || null;
    entry.badge = panelEl.badge != null ? String(panelEl.badge) : null;
    entry.closable = panelEl.closable !== false;
    entry.size = +panelEl.size || 0;
    if (!entry._regionTouched) entry.region = DOCK_REGIONS.includes(panelEl.region) ? panelEl.region : 'center';
  }

  /* ── rendering ─────────────────────────────────────────────────── */
  _live() { return this._order.map(id => this._panels.get(id)).filter(Boolean); }
  _rebuild() {
    const buckets = { start: [], center: [], end: [], bottom: [], compact: [] };
    for (const entry of this._live()) {
      if (entry.closed || entry.floatEl) continue;
      buckets[this._compact ? 'compact' : entry.region].push(entry);
    }
    DOCK_REGIONS.concat('compact').forEach(name => this._renderRegion(name, buckets[name]));
    this._updateCollapse();
  }
  _makeTabEl(entry) {
    const b = h('button', { type: 'button', role: 'tab', class: 'o-dock-tab', dataset: { id: entry.id } });
    return b;
  }
  _paintTab(entry) {
    if (!entry.tabEl) entry.tabEl = this._makeTabEl(entry);
    const b = entry.tabEl;
    b.id = 'dt-' + entry.id;
    b.setAttribute('aria-controls', entry.panelEl.id);
    entry.panelEl.setAttribute('aria-labelledby', b.id);
    const key = [entry.title, entry.icon, entry.badge, entry.closable, i18n.locale].join('|');
    if (b.__paint === key) return;
    b.__paint = key;
    b.replaceChildren(...[
      entry.icon ? iconEl(entry.icon) : null,
      h('span', { class: 'o-dock-tab-label' }, entry.title || ''),
      entry.badge != null && entry.badge !== '' ? h('span', { class: 'o-badge o-badge-sm o-dock-tab-badge' }, entry.badge) : null,
      entry.closable ? h('span', { class: 'o-dock-tab-close', 'aria-hidden': 'true', title: this.t('dock.close') }, icon('x')) : null,
    ].filter(Boolean));
    b.title = entry.title || '';
  }
  _renderRegion(name, list) {
    const reg = this._regions[name];
    if (!reg) return;
    list.forEach(entry => { this._paintTab(entry); if (entry.tabEl.parentElement !== reg.tabsEl) reg.tabsEl.appendChild(entry.tabEl); });
    list.forEach(entry => reg.tabsEl.appendChild(entry.tabEl));
    list.forEach(entry => { if (entry.panelEl.parentElement !== reg.panesEl) reg.panesEl.appendChild(entry.panelEl); });
    if (!list.find(e => e.id === reg.active)) reg.active = list[0]?.id || null;
    list.forEach(entry => {
      const on = entry.id === reg.active;
      entry.tabEl.setAttribute('aria-selected', String(on));
      entry.tabEl.tabIndex = on ? 0 : -1;
      entry.panelEl.hidden = !on;
    });
    reg.tabstripEl.hidden = list.length === 0;
    reg.emptyEl.hidden = list.length > 0 || name === 'start' || name === 'end' || name === 'bottom';
    reg.panesEl.hidden = list.length === 0 && (name === 'start' || name === 'end' || name === 'bottom');
  }
  _updateCollapse() {
    DOCK_REGIONS.filter(r => r !== 'center').forEach(name => {
      const reg = this._regions[name];
      const empty = !this._compact && this._live().some(e => !e.closed && !e.floatEl && e.region === name) === false;
      const idx = this._paneIndex(name);
      const split = this._splitOf(name);
      if (!split) return;
      const wasEmpty = reg.el.getAttribute('data-collapsed-size') === '0';
      if (empty && !wasEmpty) { reg.el.setAttribute('data-collapsed-size', '0'); split.collapse(idx, { silent: true }); reg.rail.hidden = true; }
      else if (!empty && wasEmpty) { reg.el.setAttribute('data-collapsed-size', String(DOCK_RAIL_PX[name] || 40)); split.expand(idx, { silent: true }); reg.minimized = false; }
      reg.rail.hidden = !reg.minimized;
      reg.group.hidden = reg.minimized;
      if (reg.minimized) this._paintRail(name);
    });
  }
  _paintRail(name) {
    const reg = this._regions[name];
    const list = this._live().filter(e => !e.closed && !e.floatEl && e.region === name);
    reg.railBtns.replaceChildren(...list.map(e => h('button', { type: 'button', class: cls('o-btn o-btn-ghost o-btn-icon o-btn-sm o-dock-rail-btn', e.id === reg.active && 'is-active'), dataset: { id: e.id }, 'aria-label': e.title, title: e.title }, e.icon ? icon(e.icon) : icon('file'))));
    const chevron = name === 'bottom' ? 'chevron-up' : name === 'start' ? (isRTL(this) ? 'chevron-left' : 'chevron-right') : (isRTL(this) ? 'chevron-right' : 'chevron-left');
    if (!reg._chev) { reg._chev = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm o-dock-rail-expand', 'aria-label': this.t('dock.expand') }); reg.rail.append(reg._chev); }
    reg._chev.title = this.t('dock.expand');
    reg._chev.innerHTML = String(icon(chevron));
    on(reg._chev, 'click', () => this.expand(name));
  }
  _paneIndex(name) { return name === 'start' ? 0 : name === 'end' ? 2 : name === 'center' ? 0 : 1; }
  _splitOf(name) { return name === 'start' || name === 'end' ? this._outer : this._colSplit; }

  _activateTab(tab) {
    const id = tab.dataset.id, entry = this._panels.get(id);
    if (!entry) return;
    const region = this._compact ? 'compact' : entry.region;
    const reg = this._regions[region];
    if (reg.active === id) { tab.focus(); return; }
    reg.active = id;
    this._renderRegion(region, this._live().filter(e => !e.closed && !e.floatEl && (this._compact ? true : e.region === region)));
    tab.focus();
  }
  _key(e, box) {
    const reg = Object.values(this._regions).find(r => r.tabsEl === box);
    if (!reg) return;
    const tab = e.target.closest('.o-dock-tab');
    if (tab) reg.nav.index = reg.nav.items.indexOf(tab);
    if (reg.nav.handle(e)) return;
    if (e.key === 'Delete' && tab) { const en = this._panels.get(tab.dataset.id); if (en?.closable) { e.preventDefault(); this.close(en.id); } }
    else if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') { if (tab) { e.preventDefault(); this._openPanelMenu(tab.dataset.id, tab); } }
  }
  _tool(btn) {
    const el = btn.closest('.o-dock-region'), name = el?.dataset.region;
    const tool = btn.getAttribute('data-tool');
    if (tool === 'menu') { const reg = this._regions[name]; if (reg.active) this._openPanelMenu(reg.active, btn); }
    else if (tool === 'minimize') this.toggleMinimize(name);
    else if (tool === 'maximize') this.toggleMaximize(name);
  }

  /* ── public API ────────────────────────────────────────────────── */
  getPanels() {
    return this._live().map(e => ({ id: e.id, title: e.title, icon: e.icon, region: e.region, closed: e.closed, floating: !!e.floatEl, active: this._regions[this._compact ? 'compact' : e.region]?.active === e.id }));
  }
  /** getLayout() -> serializable snapshot (panels, region sizes, minimized/maximized state, floats). */
  getLayout() {
    return {
      panels: this._live().map(e => ({ id: e.id, region: e.region, order: this._order.indexOf(e.id), closed: e.closed })),
      outerSizes: this._outer.getSizes ? this._outer.getSizes() : null,
      colSizes: this._colSplit.getSizes ? this._colSplit.getSizes() : null,
      minimized: DOCK_REGIONS.filter(r => r !== 'center' && this._regions[r].minimized),
      maxRegion: this._maxRegion,
      floats: this._live().filter(e => e.floatEl).map(e => ({ id: e.id, region: e.lastRegion || e.region, ...e.float })),
    };
  }
  /** setLayout(layout) — apply a snapshot from getLayout(). */
  setLayout(layout) {
    if (!layout) return;
    this._live().forEach(e => { if (e.floatEl) this.dockBack(e.id, { silent: true }); });
    this.restore({ silent: true });
    DOCK_REGIONS.filter(r => r !== 'center').forEach(r => { if (this._regions[r].minimized) this.expand(r, { silent: true }); });
    (layout.panels || []).forEach(p => { const e = this._panels.get(p.id); if (e) { e.region = DOCK_REGIONS.includes(p.region) ? p.region : e.region; e.closed = !!p.closed; } });
    this._order.sort((a, b) => (layout.panels?.findIndex(p => p.id === a) ?? 0) - (layout.panels?.findIndex(p => p.id === b) ?? 0));
    this._rebuild();
    if (layout.outerSizes) this._outer.setSizes(layout.outerSizes, { silent: true });
    if (layout.colSizes) this._colSplit.setSizes(layout.colSizes, { silent: true });
    (layout.minimized || []).forEach(r => this.minimize(r, { silent: true }));
    if (layout.maxRegion) this.maximize(layout.maxRegion, { silent: true });
    (layout.floats || []).forEach(f => this.float(f.id, f, { silent: true }));
    this._layoutChanged();
    announce(this.t('dock.restored'));
  }
  /** reset() — discard persisted layout and rebuild from the declared markup. */
  reset() {
    if (this.layoutKey) ls.del('orion:dock:' + this.layoutKey);
    this._live().forEach(e => { if (e.floatEl) this.dockBack(e.id, { silent: true }); e.closed = false; e._regionTouched = false; });
    this._maxRegion = null; this.classList.remove('is-maximized');
    DOCK_REGIONS.filter(r => r !== 'center').forEach(r => { if (this._regions[r].minimized) this.expand(r, { silent: true }); });
    this._panels.forEach(e => this._absorb(e, e.panelEl));
    this._rebuild();
    this._layoutChanged();
    announce(this.t('dock.restored'));
  }
  /** movePanel(id, region, index?) — dock a panel into another region. */
  movePanel(id, region, index) {
    const entry = this._panels.get(String(id));
    if (!entry || !DOCK_REGIONS.includes(region)) return false;
    if (entry.floatEl) this.dockBack(id, { silent: true, keepRegion: true });
    const from = entry.region;
    entry.region = region; entry._regionTouched = true;
    if (index != null) { this._order = this._order.filter(x => x !== entry.id); this._order.splice(index, 0, entry.id); }
    this._regions[region].active = entry.id;
    this._rebuild();
    announce(this.t('dock.moved', { title: entry.title, region: this.t('dock.region' + cap(region)) }));
    this.emit('panel-move', { id: entry.id, from, to: region });
    this._layoutChanged();
    return true;
  }
  /** close(id) — hide a panel (still listed in the Panels menu). Emits cancelable o-close. */
  close(id) {
    const entry = this._panels.get(String(id));
    if (!entry || entry.closed) return false;
    if (!this.emit('close', { id: entry.id })) return false;
    if (entry.floatEl) this.dockBack(id, { silent: true });
    entry.closed = true;
    this._rebuild();
    announce(this.t('dock.closed', { title: entry.title }));
    this._layoutChanged();
    return true;
  }
  /** open(id) — restore a closed panel. */
  open(id) {
    const entry = this._panels.get(String(id));
    if (!entry || !entry.closed) return false;
    entry.closed = false;
    this._regions[this._compact ? 'compact' : entry.region].active = entry.id;
    this._rebuild();
    announce(this.t('dock.opened', { title: entry.title }));
    this._layoutChanged();
    return true;
  }
  /** openPanelsMenu(anchor?) — list every panel; toggles open/closed. */
  openPanelsMenu(anchor) {
    const items = this._live().map(e => ({ label: e.title || e.id, icon: e.icon, checked: !e.closed, action: () => (e.closed ? this.open(e.id) : this.close(e.id)) }));
    if (!items.length) return null;
    return dockTabsKit().menu(anchor || this, items, { owner: this, label: this.t('dock.panels') });
  }
  minimize(region, { silent } = {}) { return this._setMinimized(region, true, silent); }
  expand(region, { silent } = {}) { return this._setMinimized(region, false, silent); }
  toggleMinimize(region) { return this._setMinimized(region, !this._regions[region]?.minimized); }
  _setMinimized(region, on, silent) {
    const reg = this._regions[region];
    if (!reg || region === 'center' || region === 'compact' || reg.minimized === !!on) return false;
    const split = this._splitOf(region), idx = this._paneIndex(region);
    reg.minimized = !!on;
    if (on) split.collapse(idx, { silent: true }); else split.expand(idx, { silent: true });
    reg.rail.hidden = !on; reg.group.hidden = on;
    if (on) this._paintRail(region);
    else this._renderRegion(region, this._live().filter(e => !e.closed && !e.floatEl && e.region === region));
    if (!silent) { announce(this.t(on ? 'dock.minimized' : 'dock.expanded', { region: this.t('dock.region' + cap(region)) })); this._layoutChanged(); }
    return true;
  }
  maximize(region, { silent } = {}) { return this._setMaximized(region, silent); }
  restore({ silent } = {}) { return this._setMaximized(null, silent); }
  toggleMaximize(region) { return this._setMaximized(this._maxRegion === region ? null : region); }
  _setMaximized(region, silent) {
    if (region != null && !DOCK_REGIONS.includes(region)) return false;
    this._maxRegion = region;
    this.classList.toggle('is-maximized', region != null);
    DOCK_REGIONS.forEach(r => this._regions[r].el.classList.toggle('is-max-hidden', region != null && r !== region));
    this._colSplit.classList.toggle('is-max-hidden', region != null && region !== 'center' && region !== 'bottom');
    DOCK_REGIONS.forEach(r => {
      const reg = this._regions[r], restoring = region === r;
      if (!reg.maxBtn) return;
      reg.maxBtn.innerHTML = String(icon(restoring ? 'minimize' : 'maximize'));
      reg.maxBtn.setAttribute('aria-label', this.t(restoring ? 'dock.restore' : 'dock.maximize'));
      reg.maxBtn.title = reg.maxBtn.getAttribute('aria-label');
    });
    if (!silent) {
      const entry = region && this._regions[region].active ? this._panels.get(this._regions[region].active) : null;
      announce(region ? this.t('dock.maximized', { title: entry?.title || this.t('dock.region' + cap(region)) }) : this.t('dock.restored'));
      this._layoutChanged();
    }
    return true;
  }

  /* ── floating windows ──────────────────────────────────────────── */
  float(id, opts = {}, { silent } = {}) {
    const entry = this._panels.get(String(id));
    if (!entry || entry.floatEl || entry.closed) return false;
    entry.lastRegion = entry.region;
    const w = Math.max(260, opts.w || 420), h2 = Math.max(160, opts.h || 320);
    const vw = win.innerWidth, vh = win.innerHeight;
    const x = clamp(opts.x ?? (Math.round(vw / 2 - w / 2)), 8, Math.max(8, vw - w - 8));
    const y = clamp(opts.y ?? (Math.round(vh / 2 - h2 / 2)), 8, Math.max(8, vh - h2 - 8));
    entry.float = { x, y, w: Math.min(w, vw - 16), h: Math.min(h2, vh - 16) };
    const closeBtn = h('button', { type: 'button', class: 'o-btn-close o-btn-close-sm', 'aria-label': this.t('dock.close') });
    const dockBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': this.t('dock.dockBack'), title: this.t('dock.dockBack') }, icon('columns'));
    const bar = h('div', { class: 'o-dock-float-bar' }, entry.icon ? h('span', { class: 'o-dock-float-icon' }, icon(entry.icon)) : null, h('span', { class: 'o-dock-float-title' }, entry.title || ''), h('div', { class: 'o-dock-float-tools' }, dockBtn, closeBtn));
    const body = h('div', { class: 'o-dock-float-body' });
    const resize = h('div', { class: 'o-dock-float-resize', 'aria-hidden': 'true' });
    const floatEl = h('div', { class: 'o-dock-float', role: 'dialog', 'aria-label': entry.title || '' }, bar, body, resize);
    entry.floatEl = floatEl;
    portal(floatEl, this);
    css(floatEl, { left: entry.float.x, top: entry.float.y, width: entry.float.w, height: entry.float.h, zIndex: Z.base + (++this._floatZ) });
    body.append(entry.panelEl);
    entry.panelEl.hidden = false;
    on(closeBtn, 'click', () => this.close(id));
    on(dockBtn, 'click', () => this.dockBack(id));
    on(floatEl, 'pointerdown', () => css(floatEl, { zIndex: Z.base + (++this._floatZ) }));
    on(bar, 'pointerdown', e => { if (e.button === 0 && !e.target.closest('button')) this._floatDrag(e, entry); });
    on(resize, 'pointerdown', e => { if (e.button === 0) this._floatResize(e, entry); });
    (this._floats ||= new Set()).add(entry);
    animate(floatEl, 'zoomIn', { duration: 140 });
    this._rebuild();
    if (!silent) { announce(this.t('dock.floated', { title: entry.title })); this._layoutChanged(); }
    return true;
  }
  dockBack(id, { silent, keepRegion } = {}) {
    const entry = this._panels.get(String(id));
    if (!entry || !entry.floatEl) return false;
    entry.floatEl.remove();
    entry.floatEl = null; entry.float = null;
    this._floats?.delete(entry);
    if (!keepRegion) entry.region = entry.lastRegion || entry.region;
    this._regions[this._compact ? 'compact' : entry.region].active = entry.id;
    this._rebuild();
    if (!silent) { announce(this.t('dock.docked', { title: entry.title })); this._layoutChanged(); }
    return true;
  }
  _clampFloat(entry) {
    if (!entry.floatEl) return;
    const vw = win.innerWidth, vh = win.innerHeight;
    const w = Math.min(entry.float.w, vw - 16), h2 = Math.min(entry.float.h, vh - 16);
    const x = clamp(entry.float.x, 4, Math.max(4, vw - w - 4)), y = clamp(entry.float.y, 4, Math.max(4, vh - h2 - 4));
    Object.assign(entry.float, { x, y, w, h: h2 });
    css(entry.floatEl, { left: x, top: y, width: w, height: h2 });
  }
  _floatDrag(e, entry) {
    const start = { x: e.clientX, y: e.clientY, fx: entry.float.x, fy: entry.float.y };
    entry.floatEl.setPointerCapture?.(e.pointerId);
    entry.floatEl.classList.add('is-dragging');
    const move = rafThrottle(ev => {
      const vw = win.innerWidth, vh = win.innerHeight;
      entry.float.x = clamp(start.fx + (ev.clientX - start.x), 0, Math.max(0, vw - entry.float.w));
      entry.float.y = clamp(start.fy + (ev.clientY - start.y), 0, Math.max(0, vh - entry.float.h));
      css(entry.floatEl, { left: entry.float.x, top: entry.float.y });
    });
    const offs = [
      on(win, 'pointermove', ev => { if (ev.pointerId === e.pointerId) move(ev); }, { capture: true }),
      on(win, 'pointerup pointercancel', ev => { if (ev.pointerId !== e.pointerId) return; offs.forEach(f => f()); entry.floatEl.classList.remove('is-dragging'); this._layoutChanged(); }, { capture: true }),
    ];
  }
  _floatResize(e, entry) {
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, w: entry.float.w, h: entry.float.h };
    entry.floatEl.classList.add('is-resizing');
    const move = rafThrottle(ev => {
      const vw = win.innerWidth, vh = win.innerHeight;
      entry.float.w = clamp(start.w + (ev.clientX - start.x), 260, vw - entry.float.x - 4);
      entry.float.h = clamp(start.h + (ev.clientY - start.y), 160, vh - entry.float.y - 4);
      css(entry.floatEl, { width: entry.float.w, height: entry.float.h });
    });
    const offs = [
      on(win, 'pointermove', ev => { if (ev.pointerId === e.pointerId) move(ev); }, { capture: true }),
      on(win, 'pointerup pointercancel', ev => { if (ev.pointerId !== e.pointerId) return; offs.forEach(f => f()); entry.floatEl.classList.remove('is-resizing'); this._layoutChanged(); }, { capture: true }),
    ];
  }

  /* ── drag a tab between regions ────────────────────────────────── */
  _dragStart(e, tabEl) {
    if (this._compact) return;   // stacked tabs on narrow screens: use the panel menu instead of dragging
    const id = tabEl.dataset.id, entry = this._panels.get(id);
    if (!entry) return;
    const region0 = entry.region;
    const start = { x: e.clientX, y: e.clientY };
    let dragging = false, target = null;
    if (!this._hint) this._hint = h('div', { class: 'o-dock-drop-hint', hidden: true });
    const hint = this._hint;
    const shellRect = () => this.getBoundingClientRect();
    const onMove = ev => {
      const dist = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
      if (!dragging) { if (dist < 6) return; dragging = true; tabEl.classList.add('is-dragging'); this.classList.add('is-dock-dragging'); portal(hint, this); }
      const r = shellRect();
      const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (!this._compact && inside) {
        const stripHit = DOCK_REGIONS.map(n => ({ n, r: this._regions[n].tabstripEl.getBoundingClientRect() }))
          .find(x => x.r.width && x.r.height && ev.clientX >= x.r.left && ev.clientX <= x.r.right && ev.clientY >= x.r.top && ev.clientY <= x.r.bottom);
        if (stripHit) target = { region: stripHit.n, rect: this._regions[stripHit.n].el.getBoundingClientRect() };
        else {
          const px = (ev.clientX - r.left) / r.width, py = (ev.clientY - r.top) / r.height;
          const region = px < 0.22 ? 'start' : px > 0.78 ? 'end' : py > 0.72 ? 'bottom' : 'center';
          target = { region, rect: this._regions[region].el.getBoundingClientRect() };
        }
        css(hint, { left: target.rect.left, top: target.rect.top, width: target.rect.width, height: target.rect.height });
        hint.hidden = false; hint.dataset.mode = 'region';
      } else if (!inside) {
        target = { float: true, x: ev.clientX - 60, y: ev.clientY - 14 };
        css(hint, { left: target.x, top: target.y, width: 220, height: 32 });
        hint.hidden = false; hint.dataset.mode = 'float';
      } else { target = null; hint.hidden = true; }
    };
    const onUp = ev => {
      offs.forEach(f => f());
      hint.hidden = true; hint.remove();
      tabEl.classList.remove('is-dragging'); this.classList.remove('is-dock-dragging');
      if (!dragging) return;
      if (target?.float) this.float(id, { x: target.x, y: target.y });
      else if (target?.region && target.region !== region0) this.movePanel(id, target.region);
      else if (target?.region === region0 && !this._compact) this._reorderWithin(entry, ev);
    };
    const offs = [on(win, 'pointermove', onMove, { capture: true }), on(win, 'pointerup pointercancel', onUp, { capture: true })];
  }
  _reorderWithin(entry, ev) {
    const reg = this._regions[entry.region];
    const tabs = [...reg.tabsEl.querySelectorAll('.o-dock-tab')];
    const target = tabs.find(t => { const r = t.getBoundingClientRect(); return ev.clientX < r.left + r.width / 2; });
    const ids = this._order.filter(x => x !== entry.id);
    const at = target ? ids.indexOf(target.dataset.id) : ids.length;
    ids.splice(at, 0, entry.id);
    this._order = ids;
    this._rebuild();
    this._layoutChanged();
  }

  /* ── panel menu (keyboard alternative to drag) ────────────────────── */
  _openPanelMenu(id, anchor) {
    const entry = this._panels.get(id);
    if (!entry) return;
    const items = [];
    if (!this._compact) {
      items.push({ header: this.t('dock.move') });
      DOCK_REGIONS.filter(r => r !== entry.region).forEach(r => items.push({ label: this.t('dock.region' + cap(r)), action: () => this.movePanel(entry.id, r) }));
      items.push({ divider: true });
      items.push({ label: this.t('dock.float'), icon: 'external-link', action: () => this.float(entry.id) });
      if (entry.region !== 'center') { const min = this._regions[entry.region].minimized; items.push({ label: this.t(min ? 'dock.expand' : 'dock.minimize'), icon: min ? 'maximize' : 'minimize', action: () => this.toggleMinimize(entry.region) }); }
      items.push({ label: this.t(this._maxRegion === entry.region ? 'dock.restore' : 'dock.maximize'), icon: this._maxRegion === entry.region ? 'minimize' : 'maximize', action: () => this.toggleMaximize(entry.region) });
      items.push({ divider: true });
    }
    if (entry.closable) items.push({ label: this.t('dock.close'), icon: 'x', action: () => this.close(entry.id) });
    items.push({ label: this.t('dock.panels') + '…', icon: 'columns', action: () => this.openPanelsMenu(anchor) });
    dockTabsKit().menu(anchor, items, { owner: this, label: this.t('dock.panelMenu') });
  }

  /* ── responsive ────────────────────────────────────────────────── */
  _checkCompact() {
    const compact = this.clientWidth > 0 && this.clientWidth < 600;
    if (compact === this._compact) return;
    this._compact = compact;
    this.classList.toggle('is-compact', compact);
    this._rebuild();
  }

  /* ── persistence / events ──────────────────────────────────────── */
  _layoutChanged() {
    const layout = this.getLayout();
    if (this.layoutKey) ls.set('orion:dock:' + this.layoutKey, layout);
    this.emit('layout-change', { layout });
  }
  disconnected() { this._floats?.forEach(e => e.floatEl?.remove()); }
}

define('o-dock-panel', ODockPanel);
define('o-dock', ODock);
O.Dock = ODock;
O.DockPanel = ODockPanel;
