/* <o-widget> — a dashboard tile: header (handle, icon, title, actions menu), body, resize handles.
 * Content = children. A single element child becomes the body in place (framework-safe: it is never
 * moved or cloned); several nodes are wrapped in .o-widget-body; a <template> child renders lazily.
 */

const WIDGET_LAYOUT_PROPS = ['x', 'y', 'w', 'h', 'minW', 'minH', 'maxW', 'maxH', 'locked', 'collapsed'];

class OWidget extends OElement {
  static props = {
    heading: String, subtitle: String, icon: String, type: String,
    x: Number, y: Number, w: Number, h: Number, minW: Number, minH: Number, maxW: Number, maxH: Number,
    collapsible: Boolean, removable: Boolean, refreshable: Boolean, fullscreen: Boolean, settings: Boolean,
    headerless: { type: Boolean, reflect: true },
    // Named to avoid shadowing OElement's own flush()/render() methods (JS props become
    // accessor methods on the prototype, replacing whatever the base class defined there).
    flushed: { type: Boolean, reflect: true, attr: 'flush' },
    locked: { type: Boolean, reflect: true }, collapsed: { type: Boolean, reflect: true }, loading: { type: Boolean, reflect: true },
    lazy: { type: Boolean, default: true },
    renderer: { type: Function, attr: false },
    data: { type: Any, attr: false },
    texts: Object,
  };

  get dashboard() { const d = this.parentElement; return d && d.localName === 'o-dashboard' ? d : null; }
  get key() { return this.id; }
  t(key, params) { return this.dashboard ? this.dashboard.t(key, params) : super.t(key, params); }

  setup() {
    this.classList.add('o-widget');
    this.setAttribute('role', 'region');
    const kids = [...this.childNodes].filter(n => !(n.nodeType === 3 && !n.textContent.trim()) && n.nodeType !== 8);
    const slotted = kids.filter(n => n.nodeType === 1 && n.getAttribute('slot') === 'actions');
    const content = kids.filter(n => !slotted.includes(n));
    const tpl = content.length === 1 && content[0].localName === 'template' ? content[0] : null;
    if (content.length === 1 && content[0].nodeType === 1 && !tpl) {
      this.body = content[0];
    } else {
      this.body = h('div');
      if (!tpl) this.body.append(...content);
      this.append(this.body);
    }
    this._tpl = tpl;
    this.body.classList.add('o-widget-body');
    this._rendered = !tpl && !this.renderer;

    const tid = uid('wt');
    this.titleEl = h('h3', { class: 'o-widget-title', id: tid });
    this.subEl = h('p', { class: 'o-widget-subtitle' });
    this.iconEl = h('span', { class: 'o-widget-icon', 'aria-hidden': 'true' });
    this.handle = h('button', { type: 'button', class: 'o-widget-handle', tabindex: '-1' }, icon('grip-vertical'));
    this.menuBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm o-widget-menu-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, icon('more-vertical'));
    this.lockEl = h('span', { class: 'o-widget-lock' }, icon('lock'));
    this.spin = h('span', { class: 'o-spinner o-spinner-xs o-widget-spinner', role: 'status' });
    this.actionsEl = h('div', { class: 'o-widget-actions' }, ...slotted, this.spin, this.lockEl, this.menuBtn);
    this.header = h('div', { class: 'o-widget-header' }, this.handle, this.iconEl, h('div', { class: 'o-widget-titles' }, this.titleEl, this.subEl), this.actionsEl);
    this.prepend(this.header);
    this.setAttribute('aria-labelledby', tid);
    for (const dir of ['s', 'e', 'se']) this.append(h('div', { class: 'o-widget-resize', 'data-dir': dir, 'aria-hidden': 'true' }));

    on(this.menuBtn, 'click', e => { e.stopPropagation(); this.openMenu(); });
    on(this, 'keydown', e => {
      if (e.target === this.menuBtn && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); this.openMenu(); }
    });
  }

  connected() {
    if (!this._rendered && this.lazy !== false && win.IntersectionObserver) {
      const off = observeVisible(this, vis => { if (vis) { off(); this._renderContent(); } }, { rootMargin: '200px' });
      this.addCleanup(off);
    } else if (!this._rendered) queueMicrotask(() => this._renderContent());
  }

  disconnected() { if (this._max) this.maximize(false); }

  update(changed) {
    if (changed.has('heading') || changed.has('subtitle') || changed.has('icon') || changed.has('init') || changed.has('locale')) this._paintHeader();
    if (changed.has('loading') || changed.has('init')) { this.setAttribute('aria-busy', String(!!this.loading)); this.spin.hidden = !this.loading; }
    if (changed.has('renderer') && !changed.has('init') && this._rendered) this._renderContent(true);
    this.lockEl.hidden = !this.locked;
    this.header.classList.toggle('is-floating', !!this.headerless);
    if (WIDGET_LAYOUT_PROPS.some(k => changed.has(k)) && !changed.has('init')) this.dashboard?._widgetChanged?.(this, changed);
    if (changed.has('init') || changed.has('collapsible') || changed.has('removable') || changed.has('refreshable') || changed.has('fullscreen') || changed.has('settings')) this._paintMenuBtn();
  }

  _paintHeader() {
    const title = this.heading || '';
    this.titleEl.textContent = title;
    this.titleEl.classList.toggle('o-sr-only', !title || !!this.headerless);
    if (!title) this.titleEl.textContent = this.t('dashboard.widget');
    this.subEl.textContent = this.subtitle || '';
    this.subEl.hidden = !this.subtitle || !!this.headerless;
    this.iconEl.innerHTML = this.icon && !this.headerless ? String(icon(this.icon)) : '';
    this.iconEl.hidden = !this.icon || !!this.headerless;
    const name = this.heading || this.t('dashboard.widget');
    this.handle.setAttribute('aria-label', this.t('dashboard.move', { title: name }));
    this.menuBtn.setAttribute('aria-label', this.t('dashboard.actions') + ': ' + name);
    this.lockEl.setAttribute('title', this.t('dashboard.locked'));
    this.spin.setAttribute('aria-label', this.t('dashboard.loading'));
  }

  _paintMenuBtn() { if (this.menuBtn) this.menuBtn.hidden = !this.menuItems().length; }

  /** The actions shown in the widget menu (depends on flags and the dashboard's edit mode). */
  menuItems() {
    const d = this.dashboard, out = [];
    const editable = !!d && !d.locked;
    if (this.refreshable) out.push({ id: 'refresh', label: this.t('dashboard.refresh'), icon: 'refresh' });
    if (this.fullscreen) out.push(this._max ? { id: 'fullscreen', label: this.t('dashboard.exitFullscreen'), icon: 'minimize' } : { id: 'fullscreen', label: this.t('dashboard.fullscreen'), icon: 'maximize' });
    if (this.collapsible) out.push(this.collapsed ? { id: 'collapse', label: this.t('dashboard.expand'), icon: 'chevron-down' } : { id: 'collapse', label: this.t('dashboard.collapse'), icon: 'chevron-up' });
    if (this.settings) out.push({ id: 'settings', label: this.t('dashboard.settings'), icon: 'settings' });
    const edit = [];
    if (editable && d.editable && (this.type || this.renderer) && !this.locked) edit.push({ id: 'duplicate', label: this.t('dashboard.duplicate'), icon: 'copy' });
    if (editable && this.removable && !this.locked) edit.push({ id: 'remove', label: this.t('dashboard.remove'), icon: 'trash', danger: true });
    if (out.length && edit.length) out.push({ divider: true });
    return out.concat(edit);
  }

  openMenu() {
    if (this._menu) { this._menu.close(); return; }
    const items = this.menuItems();
    if (!items.length) return;
    this._menu = dashMenu(this.menuBtn, items, id => this.runAction(id), { label: this.t('dashboard.actions'), onClose: () => { this._menu = null; } });
  }

  /** runAction('refresh' | 'fullscreen' | 'collapse' | 'settings' | 'duplicate' | 'remove') */
  runAction(id) {
    const d = this.dashboard;
    if (id === 'refresh') return this.refresh();
    if (id === 'fullscreen') return this.maximize();
    if (id === 'collapse') return this.toggleCollapse();
    if (id === 'settings') return this.emit('widget-settings', { id: this.id, widget: this });
    if (id === 'duplicate') return d?.duplicateWidget(this.id);
    if (id === 'remove') return d ? d.removeWidget(this.id, { confirm: true }) : this.remove();
  }

  /** Fire o-widget-refresh; handlers may call detail.waitUntil(promise) to show the loading state. */
  refresh() {
    const waits = [];
    const ok = this.emit('widget-refresh', { id: this.id, widget: this, waitUntil: p => waits.push(p) });
    if (!ok) return Promise.resolve();
    if (this.renderer) waits.push(this._renderContent(true));
    if (!waits.length) return Promise.resolve();
    this.loading = true;
    return Promise.allSettled(waits).then(() => { this.loading = false; });
  }

  toggleCollapse(force) {
    const next = force == null ? !this.collapsed : !!force;
    if (next === !!this.collapsed) return;
    if (!this.emit('before-widget-collapse', { id: this.id, collapsed: next })) return;
    this.collapsed = next;
    this.flush();
    this.emit('widget-collapse', { id: this.id, collapsed: next });
    announce((next ? this.t('dashboard.collapse') : this.t('dashboard.expand')) + ': ' + (this.heading || ''));
  }

  /** Expand the widget over the page (Escape or the menu restores it). */
  maximize(force) {
    const next = force == null ? !this._max : !!force;
    if (next === !!this._max) return;
    if (next) {
      this._max = true;
      this.classList.add('is-maximized');
      this._maxOv = overlays.open({ el: this, trap: true, lockScroll: true, outside: false, onClose: () => { this._maxOv = null; this.maximize(false); } });
      animate(this, 'zoomIn', { duration: 160 });
      this.menuBtn.focus({ preventScroll: true });
    } else {
      this._max = false;
      const ov = this._maxOv; this._maxOv = null;
      ov?.close('api');
      this.classList.remove('is-maximized');
      this.style.zIndex = '';
    }
    this.emit('widget-fullscreen', { id: this.id, fullscreen: next });
    requestAnimationFrame(() => this._notifyResize(false));
  }

  /** (Re)render lazy content: <template> child or the `renderer(body, widget)` function. */
  _renderContent(force) {
    if (this._rendered && !force) return Promise.resolve();
    const first = !this._rendered;
    this._rendered = true;
    let res;
    if (this._tpl && first) this.body.append(this._tpl.content.cloneNode(true));
    else if (isFn(this.renderer)) {
      try { res = this.renderer(this.body, this); } catch (e) { console.error('[Orion] widget render failed:', e); }
    }
    const put = v => {
      if (v == null) return;
      if (v instanceof Node) this.body.replaceChildren(v);
      else this.body.innerHTML = String(v);
    };
    if (res && isFn(res.then)) {
      this.loading = true;
      return res.then(put, e => console.error('[Orion] widget render failed:', e)).finally(() => { this.loading = false; if (first) this.emit('widget-visible', { id: this.id }); });
    }
    put(res);
    if (first) this.emit('widget-visible', { id: this.id });
    return Promise.resolve();
  }

  _notifyResize(live) {
    const r = this.getBoundingClientRect();
    const it = this.dashboard?._item?.(this.id);
    this.emit('widget-resize', { id: this.id, w: it?.w, h: it?.h, width: Math.round(r.width), height: Math.round(r.height), live: !!live });
  }
}
define('o-widget', OWidget);
O.Widget = OWidget;
