// @deps tabs
/* Multi-tab workspace — browser / IDE-like document tabs with keep-alive panes.
 *   <o-workspace persist="key" max="12" label="Open documents">
 *     <div slot="empty">…shown when nothing is open…</div>
 *   </o-workspace>
 *   ws.open({ id, title, icon, content: Node | text, html (trusted), render: tab => Node | string, url (iframe), pinned, dirty, closable, data })
 *   Reopening an existing id just activates it. Panes are never moved or re-rendered while open (iframes keep state).
 *   Events: o-open { tab } · o-close { tab, reason } (cancelable) · o-activate { tab, previous } · o-render { tab, pane }
 *           o-change { tabs } (list / order / state changed) · o-reorder { id, from, to }
 *   Methods: open() · close(id, { force }) · closeOthers(id) · closeRight(id) · closeAll() · activate(id) · pin(id, on)
 *            setDirty(id, on) · setTitle(id, title) · patch(id, { title, icon, dirty, pinned, data }) · duplicate(id)
 *            move(id, index) · getTabs() · getTab(id) · getPane(id) · restore() · openMenu(id)
 *   Props: resolver (descriptor => { content | html | render | url } | Node) rebuilds restored tabs; confirm (tab => Promise<boolean>)
 */

i18n.add('en', {
  workspace: {
    label: 'Open documents', close: 'Close', closeOthers: 'Close others', closeRight: 'Close to the right', closeAll: 'Close all',
    pin: 'Pin', unpin: 'Unpin', duplicate: 'Duplicate', copy: '{title} (copy)', allTabs: 'Show all open tabs', unsaved: 'Unsaved changes',
    confirm: '"{title}" has unsaved changes. Close it anyway?', confirmTitle: 'Discard changes?', discard: 'Discard', empty: 'No open documents',
    emptyHint: 'Open a document to get started.', pinned: 'Pinned', opened: '{title} opened', closed: '{title} closed', untitled: 'Untitled',
    moved: '{title} moved to position {pos} of {count}', actions: 'Tab actions',
  },
});

class OWorkspace extends OElement {
  static props = {
    persist: String, max: { type: Number, default: 0 }, label: String, texts: Object,
    resolver: { type: Function }, confirm: { type: Function },
  };
  setup() {
    this.classList.add('o-workspace');
    this._tabs = new Map(); this._active = null; this._clock = 0;
    this.list = h('div', { class: 'o-ws-tabs', role: 'tablist', 'aria-orientation': 'horizontal' });
    this.btnList = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm o-ws-all', 'aria-haspopup': 'menu', hidden: true }, icon('chevron-down'));
    this.bar = h('div', { class: 'o-ws-bar' }, this.list, this.btnList);
    this.panes = h('div', { class: 'o-ws-panes' });
    this.emptyEl = h('div', { class: 'o-empty o-ws-empty' }, h('div', { class: 'o-empty-icon' }, icon('file')), h('p', { class: 'o-empty-title' }), h('p', { class: 'o-empty-text' }));
    this.prepend(this.bar);
    this.append(this.panes, this.emptyEl);
    this.nav = new ListNav(this.list, { items: '[role=tab]', orientation: 'horizontal', typeahead: false, activeClass: 'is-focus', onActivate: el => this.activate(el.__id), onSelect: el => this.activate(el.__id) });
    on(this.list, 'click', '[role=tab]', (e, el) => {
      if (e.target.closest('.o-ws-close')) { e.stopPropagation(); this.close(el.__id, { reason: 'user' }); return; }
      this.activate(el.__id, { focus: true });
    });
    on(this.list, 'auxclick', '[role=tab]', (e, el) => { if (e.button === 1) { e.preventDefault(); this.close(el.__id, { reason: 'user' }); } });
    on(this.list, 'mousedown', '[role=tab]', e => { if (e.button === 1) e.preventDefault(); });
    on(this.list, 'contextmenu', '[role=tab]', (e, el) => { e.preventDefault(); this.openMenu(el.__id, { x: e.clientX, y: e.clientY }); });
    on(this.list, 'keydown', e => this._key(e));
    on(this.list, 'scroll', rafThrottle(() => this._overflow()), { passive: true });
    on(this.btnList, 'click', () => this._allMenu());
    this._save = debounce(() => this._persist(), 150);
  }
  connected() {
    this.addCleanup(observeResize(this.list, rafThrottle(() => this._overflow())));
    if (!this._dragOff) this._dragOff = OTabsKit().dragReorder(this.list, {
      items: '[role=tab]', axis: 'x',
      onMove: (el, to) => this._moveEl(this._tabs.get(el.__id), to),
      onEnd: (el, from, to) => { if (from !== to) this._reordered(this._tabs.get(el.__id), from, to); },
    });
    if (this._pending) { const p = this._pending; this._pending = null; p.forEach(d => this.open(d)); }
    if (this.persist && !this._restored) setTimeout(() => this.restore(), 0);
  }
  disconnected() { this._dragOff?.(); this._dragOff = null; }
  update(changed) {
    if (changed.has('init') || changed.has('locale') || changed.has('texts') || changed.has('label')) {
      this.list.setAttribute('aria-label', this.label || this.t('workspace.label'));
      this.btnList.setAttribute('aria-label', this.t('workspace.allTabs'));
      this.btnList.title = this.t('workspace.allTabs');
      this.emptyEl.querySelector('.o-empty-title').textContent = this.t('workspace.empty');
      this.emptyEl.querySelector('.o-empty-text').textContent = this.t('workspace.emptyHint');
      this._tabs.forEach(t => this._paint(t));
    }
    this._state();
  }

  /* ── API ── */
  _ready() { if (!this._setupDone && this.isConnected && doc.readyState !== 'loading') this.connectedCallback(); return this._setupDone; }
  get activeId() { return this._active; }
  getTabs() { return this._order().map(t => this._pub(t)); }
  getTab(id) { const t = this._tabs.get(String(id)); return t ? this._pub(t) : null; }
  getPane(id) { return this._tabs.get(String(id))?.pane || null; }
  /** open(descriptor) -> id. Activates an existing tab with the same id. */
  open(d = {}, { activate = true, silent = false } = {}) {
    if (!this._ready()) { (this._pending ||= []).push(d); return d.id; }
    const id = String(d.id ?? uid('doc'));
    const ex = this._tabs.get(id);
    if (ex) { if (activate) this.activate(id, { focus: d.focus }); return id; }
    const t = {
      id, title: d.title || this.t('workspace.untitled'), icon: d.icon || null, pinned: !!d.pinned, dirty: !!d.dirty,
      closable: d.closable !== false, url: d.url || null, data: d.data ?? null, src: d, used: ++this._clock,
    };
    const domId = uid('ws');
    t.el = h('button', { type: 'button', role: 'tab', class: 'o-ws-tab', id: domId + '-tab', 'aria-controls': domId + '-pane', 'aria-selected': 'false', tabindex: '-1' });
    t.el.__id = id;
    t.pane = h('div', { class: 'o-ws-pane', role: 'tabpanel', id: domId + '-pane', 'aria-labelledby': domId + '-tab', tabindex: '0', inert: true });
    t.pane.__id = id;
    this._tabs.set(id, t);
    this._paint(t);
    const order = this._order().filter(x => x !== t);
    const idx = t.pinned ? order.filter(x => x.pinned).length : order.length;
    this.list.insertBefore(t.el, order[idx]?.el || null);
    this.panes.append(t.pane);
    if (!silent) { this.emit('open', { tab: this._pub(t) }); announce(this.t('workspace.opened', { title: t.title })); }
    if (activate || !this._active) this.activate(id, { focus: !!d.focus });
    this._evict(id);
    this._changed2();
    return id;
  }
  activate(id, { focus = false } = {}) {
    const t = this._tabs.get(String(id));
    if (!t) return false;
    t.used = ++this._clock;
    const prev = this._active;
    if (prev !== t.id) {
      this._active = t.id;
      this._tabs.forEach(x => {
        const on = x === t;
        x.el.setAttribute('aria-selected', String(on));
        x.el.classList.toggle('is-active', on);
        x.el.tabIndex = on ? 0 : -1;
        x.pane.toggleAttribute('inert', !on);   // keep-alive: stays rendered (scroll, iframes, inputs), hidden via CSS
        x.pane.classList.toggle('is-active', on);
      });
      this._render(t);
      this._reveal(t.el);
      this.emit('activate', { tab: this._pub(t), previous: prev });
      this._save();
    }
    if (focus) t.el.focus();
    this._state();
    return true;
  }
  /** close(id, { force, reason }) -> Promise<boolean>. Dirty tabs ask for confirmation unless force. */
  async close(id, { force = false, reason = 'api' } = {}) {
    const t = this._tabs.get(String(id));
    if (!t) return false;
    if (t.dirty && !force && !(await this._confirmClose(t))) return false;
    if (!this.emit('close', { tab: this._pub(t), reason })) return false;
    this._remove(t);
    announce(this.t('workspace.closed', { title: t.title }));
    return true;
  }
  async closeOthers(id) { for (const t of this._order()) if (t.id !== String(id) && !t.pinned) await this.close(t.id, { reason: 'others' }); }
  async closeRight(id) { const o = this._order(), i = o.findIndex(t => t.id === String(id)); for (const t of o.slice(i + 1)) if (!t.pinned) await this.close(t.id, { reason: 'right' }); }
  async closeAll({ pinned = false } = {}) { for (const t of this._order()) if (pinned || !t.pinned) await this.close(t.id, { reason: 'all' }); }
  pin(id, on = true) {
    const t = this._tabs.get(String(id)); if (!t || t.pinned === !!on) return false;
    t.pinned = !!on;
    const rest = this._order().filter(x => x !== t), n = rest.filter(x => x.pinned).length;
    this.list.insertBefore(t.el, rest[n]?.el || null);   // end of the pinned group / start of the others
    this._paint(t); this._changed2();
    return true;
  }
  setDirty(id, on = true) { return this.patch(id, { dirty: !!on }); }
  setTitle(id, title) { return this.patch(id, { title }); }
  patch(id, p = {}) {
    const t = this._tabs.get(String(id)); if (!t) return false;
    if ('pinned' in p) this.pin(id, p.pinned);
    for (const k of ['title', 'icon', 'dirty', 'data']) if (k in p) t[k] = k === 'dirty' ? !!p[k] : p[k];
    this._paint(t); this._changed2();
    return true;
  }
  duplicate(id) {
    const t = this._tabs.get(String(id)); if (!t) return null;
    const s = { ...(t.src || {}) };
    if (t.rendered && !s.url && !isFn(s.render) && s.html == null) s.content = h('div', { class: 'o-ws-clone' }, [...t.pane.childNodes].map(n => n.cloneNode(true)));
    let n = 2; while (this._tabs.has(`${t.id}~${n}`)) n++;
    return this.open({ ...s, id: `${t.id}~${n}`, title: this.t('workspace.copy', { title: t.title }), icon: t.icon, pinned: false, dirty: false, data: t.data });
  }
  move(id, index) {
    const t = this._tabs.get(String(id)); if (!t) return false;
    const from = this._order().indexOf(t);
    this._moveEl(t, index);
    const to = this._order().indexOf(t);
    if (from !== to) this._reordered(t, from, to);
    return true;
  }
  /** restore() — reopen tabs saved with persist (once). Returns the number of restored tabs. */
  restore() {
    if (this._restored || !this.persist || !this._ready()) return 0;
    this._restored = true;
    const s = ls.get('orion:workspace:' + this.persist);
    let n = 0;
    if (s && Array.isArray(s.tabs)) {
      s.tabs.forEach(d => { if (d && d.id != null && !this._tabs.has(String(d.id))) { this.open({ ...d, restored: true }, { activate: false, silent: true }); n++; } });
      if (s.active != null && this._tabs.has(String(s.active))) this.activate(s.active);
    }
    this._save();
    return n;
  }
  openMenu(id, point) {
    const t = this._tabs.get(String(id)); if (!t) return null;
    const o = this._order(), i = o.indexOf(t);
    const items = [
      { label: this.t('workspace.close'), icon: 'x', shortcut: 'Del', disabled: !t.closable, action: () => this.close(t.id, { reason: 'user' }) },
      { label: this.t('workspace.closeOthers'), disabled: !o.some(x => x !== t && !x.pinned), action: () => this.closeOthers(t.id) },
      { label: this.t('workspace.closeRight'), disabled: !o.slice(i + 1).some(x => !x.pinned), action: () => this.closeRight(t.id) },
      { label: this.t('workspace.closeAll'), action: () => this.closeAll() },
      { divider: true },
      { label: this.t(t.pinned ? 'workspace.unpin' : 'workspace.pin'), icon: 'star', action: () => this.pin(t.id, !t.pinned) },
      { label: this.t('workspace.duplicate'), icon: 'copy', action: () => this.duplicate(t.id) },
    ];
    const kit = OTabsKit();
    const opts = { owner: this, label: this.t('workspace.actions') };
    if (point) return kit.contextMenu(point, items, opts);
    return kit.menu(t.el, items, opts);
  }

  /* ── internals ── */
  _order() { return [...this.list.children].map(el => this._tabs.get(el.__id)).filter(Boolean); }
  _pub(t) { return { id: t.id, title: t.title, icon: t.icon, pinned: t.pinned, dirty: t.dirty, closable: t.closable, url: t.url, data: t.data, index: this._order().indexOf(t), active: t.id === this._active }; }
  _paint(t) {
    const el = t.el;
    el.classList.toggle('is-pinned', t.pinned);
    el.classList.toggle('is-dirty', t.dirty);
    el.title = t.title + (t.dirty ? ' • ' + this.t('workspace.unsaved') : '');
    el.setAttribute('aria-label', t.title + (t.pinned ? ', ' + this.t('workspace.pinned') : '') + (t.dirty ? ', ' + this.t('workspace.unsaved') : ''));
    if (t.closable) el.setAttribute('aria-keyshortcuts', 'Delete Shift+F10'); else el.setAttribute('aria-keyshortcuts', 'Shift+F10');
    el.replaceChildren(...[
      h('span', { class: 'o-ws-icon' }, icon(t.icon || 'file')),
      h('span', { class: 'o-ws-title' }, t.title),
      t.pinned ? h('span', { class: 'o-ws-pin', 'aria-hidden': 'true' }) : null,
      t.closable && !t.pinned ? h('span', { class: 'o-ws-close', 'aria-hidden': 'true', 'data-no-drag': '', title: this.t('workspace.close') }, icon('x')) : null,
      t.dirty ? h('span', { class: 'o-ws-dirty', 'aria-hidden': 'true' }) : null,
    ].filter(Boolean));
  }
  _render(t) {
    if (t.rendered) return;
    t.rendered = true;
    let s = t.src || {};
    if (s.restored && isFn(this.resolver)) {
      const r = this.resolver(this._pub(t));
      s = r instanceof Node || isStr(r) ? { ...s, content: r } : { ...s, ...(r || {}) };
      t.src = s;
      if (s.url) t.url = s.url;
    }
    const p = t.pane;
    if (s.url) p.append(h('iframe', { class: 'o-ws-frame', src: s.url, title: t.title, loading: 'lazy' }));
    else if (isFn(s.render)) { const r = s.render(this._pub(t), p); if (r != null) p.append(r instanceof Node ? r : String(r)); }
    else if (s.html != null) p.insertAdjacentHTML('beforeend', String(s.html));
    else if (s.content instanceof Node) p.append(s.content);
    else if (s.content != null) p.textContent = String(s.content);
    this.emit('render', { tab: this._pub(t), pane: p });
  }
  _remove(t) {
    const o = this._order(), i = o.indexOf(t), wasActive = t.id === this._active, focusIn = this.list.contains(doc.activeElement);
    t.el.remove(); t.pane.remove();
    this._tabs.delete(t.id);
    if (wasActive) {
      this._active = null;
      const rest = this._order();
      const next = rest[Math.min(i, rest.length - 1)];
      if (next) this.activate(next.id, { focus: focusIn });
    }
    this._changed2();
    if (!this._tabs.size && focusIn) {   // nothing left: move focus to the empty state
      const target = [...this.children].find(c => c.getAttribute('slot') === 'empty') || this.emptyEl;
      if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
  }
  async _confirmClose(t) {
    const msg = this.t('workspace.confirm', { title: t.title });
    try {
      if (isFn(this.confirm)) return !!(await this.confirm(this._pub(t)));
      if (isFn(O.confirm)) {
        const r = await O.confirm({ title: this.t('workspace.confirmTitle'), message: msg, text: msg, confirmText: this.t('workspace.discard'), okText: this.t('workspace.discard'), danger: true, variant: 'danger' });
        return r === true || r?.confirmed === true || r === 'ok' || r === 'confirm';
      }
    } catch (e) { console.error(e); return false; }
    return win.confirm(msg);
  }
  _evict(keep) {
    if (!(this.max > 0) || this._tabs.size <= this.max) return;
    const cand = [...this._tabs.values()].filter(t => t.id !== keep && t.id !== this._active && !t.pinned && !t.dirty).sort((a, b) => a.used - b.used);
    for (const t of cand) {
      if (this._tabs.size <= this.max) break;
      if (this.emit('close', { tab: this._pub(t), reason: 'max' })) this._remove(t);
    }
  }
  _moveEl(t, to) {
    if (!t) return;
    const had = doc.activeElement === t.el;
    const rest = this._order().filter(x => x !== t), pins = rest.filter(x => x.pinned).length;
    to = t.pinned ? clamp(to, 0, pins) : clamp(to, pins, rest.length);
    this.list.insertBefore(t.el, rest[to]?.el || null);
    if (had) t.el.focus({ preventScroll: true });
  }
  _reordered(t, from, to) {
    this.emit('reorder', { id: t.id, from, to });
    announce(this.t('workspace.moved', { title: t.title, pos: to + 1, count: this._tabs.size }));
    this._changed2();
  }
  _changed2() { this._state(); this._overflow(); this._save(); this.emit('change', { tabs: this.getTabs() }); }
  _state() {
    const empty = !this._tabs.size;
    this.classList.toggle('is-empty', empty);
    const custom = [...this.children].find(c => c.getAttribute('slot') === 'empty');
    this.emptyEl.hidden = !empty || !!custom;
    if (custom) custom.hidden = !empty;
    this.bar.hidden = empty;
  }
  _persist() {
    if (!this.persist || !this._restored) return;   // never overwrite saved tabs before they were restored
    ls.set('orion:workspace:' + this.persist, {
      active: this._active,
      tabs: this._order().map(t => ({ id: t.id, title: t.title, icon: t.icon, pinned: t.pinned || undefined, url: t.url || undefined, data: t.data ?? undefined })),
    });
  }
  _overflow() {
    const l = this.list;
    const over = l.scrollWidth > l.clientWidth + 1;
    this.btnList.hidden = !over;
    this.bar.classList.toggle('is-overflowing', over);
  }
  _reveal(el) {
    const l = this.list, r = el.getBoundingClientRect(), lr = l.getBoundingClientRect();
    if (!lr.width) return;
    if (r.left < lr.left) l.scrollLeft -= lr.left - r.left + 16; else if (r.right > lr.right) l.scrollLeft += r.right - lr.right + 16;
  }
  _allMenu() {
    OTabsKit().menu(this.btnList, this._order().map(t => ({
      label: (t.dirty ? '● ' : '') + t.title, icon: t.icon || 'file', checked: t.id === this._active, action: () => this.activate(t.id, { focus: true }),
    })), { owner: this, placement: 'bottom-end', label: this.t('workspace.allTabs') });
  }
  _key(e) {
    const el = e.target.closest?.('[role=tab]');
    if (!el || el.parentElement !== this.list) return;
    const t = this._tabs.get(el.__id);
    const rtl = isRTL(this), fwd = rtl ? 'ArrowLeft' : 'ArrowRight', back = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (e.altKey && (e.key === fwd || e.key === back)) {
      e.preventDefault();
      const o = this._order(), i = o.indexOf(t);
      this.move(t.id, i + (e.key === fwd ? 1 : -1));
      return;
    }
    if (e.key === 'Delete' && t.closable) { e.preventDefault(); this.close(t.id, { reason: 'user' }); return; }
    if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') { e.preventDefault(); this.openMenu(t.id); return; }
    this.nav.index = this.nav.items.indexOf(el);
    this.nav.handle(e);
  }
}
/** The shared kit from the tabs package (declared with @deps tabs). */
const OTabsKit = () => O.Tabs.kit;

define('o-workspace', OWorkspace);
O.Workspace = OWorkspace;
