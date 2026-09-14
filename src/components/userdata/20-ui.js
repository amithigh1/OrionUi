/* User-data widgets.
 *   <o-favorite-button item='{"id":"r1","title":"Q3 report","url":"/r/1"}' label></o-favorite-button>   star toggle (aria-pressed)  · o-change { favorite, item }
 *   <o-recent-list type="report" limit="5" store="recent|viewed" empty-text="…" clearable></o-recent-list>           · o-select { item } (cancelable)
 *   <o-favorites-list limit empty-text></o-favorites-list>   drag reorder with Orion.sortable, Alt+↑/↓ always      · o-select, o-reorder { ids }
 *   <o-saved-views scope="users"></o-saved-views>  el.getState = () => filters;   o-apply { state, view } · o-save { view } · o-delete { view }
 */
const __itemIcon = it => (it.icon && O.icons.has(it.icon) ? it.icon : { user: 'user', users: 'user', page: 'file', report: 'file', file: 'file', image: 'image', search: 'search', setting: 'settings', settings: 'settings', home: 'home' }[it.type] || 'file');
const __rel = ts => { const d = Date.now() - ts; return d < 45e3 ? t('userdata.justNow') : fmt.relative(ts); };

/* ── <o-favorite-button> ───────────────────────────────────────────── */
class OFavoriteButton extends OElement {
  static props = { item: { type: Object, default: () => ({}) }, label: Boolean, size: String, texts: Object };
  setup() {
    this.classList.add('o-fav');
    this.btn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-fav-btn', 'aria-pressed': 'false', onClick: () => this.toggle() });
    this.append(this.btn);
  }
  connected() { this.addCleanup(favorites.onChange(() => this.requestUpdate('fav'))); }
  focus(o) { this.btn.focus(o); }
  get pressed() { return this.item?.id != null && favorites.has(this.item.id); }
  toggle(force) {
    const it = this.item;
    if (it?.id == null) return;
    const want = force ?? !this.pressed;
    if (want === this.pressed || !this.emit('before-change', { favorite: want, item: it })) return;
    if (want) favorites.add(it); else favorites.remove(it.id);
    const title = it.title || it.name || t('userdata.item');
    announce(t(want ? 'userdata.added' : 'userdata.removed', { title }));
    if (want) { this.btn.classList.remove('is-burst'); void this.btn.offsetWidth; this.btn.classList.add('is-burst'); animate(this.btn.querySelector('.o-icon'), 'popIn', { duration: 260 }); }
    this.flush?.();
    this.emit('change', { favorite: want, item: it });
  }
  render() {
    const on = this.pressed, title = this.item?.title || this.item?.name || t('userdata.item');
    this.btn.setAttribute('aria-pressed', String(on));
    this.btn.classList.toggle('o-btn-icon', !this.label);
    this.btn.classList.toggle('o-btn-sm', this.size === 'sm');
    this.btn.setAttribute('aria-label', this.t(on ? 'userdata.removeFavorite' : 'userdata.addFavorite', { title }));
    this.btn.title = this.btn.getAttribute('aria-label');
    this.btn.innerHTML = String(icon('star', { class: 'o-fav-star' })) + (this.label ? `<span>${esc(this.t(on ? 'userdata.favorited' : 'userdata.favorite'))}</span>` : '');
  }
}
define('o-favorite-button', OFavoriteButton);

/* ── shared list rendering ─────────────────────────────────────────── */
class __UDList extends OElement {
  setup() {
    this.classList.add('o-ud-list');
    this.list = h('ul', { class: 'o-list o-list-compact o-ud-items', role: 'list' });
    this.emptyEl = h('div', { class: 'o-empty o-empty-sm o-ud-empty', hidden: true }, h('div', { class: 'o-empty-icon' }, iconEl(this.emptyIcon)), h('p', { class: 'o-empty-text' }));
    this.foot = h('div', { class: 'o-ud-foot', hidden: true });
    this.append(this.list, this.emptyEl, this.foot);
    on(this.list, 'click', '.o-ud-remove', (e, b) => { e.preventDefault(); this.removeItem(b.closest('li').__item); });
    on(this.list, 'click', '.o-ud-link', (e, a) => { const it = a.closest('li').__item; if (!this.emit('select', { item: it })) e.preventDefault(); });
  }
  connected() {
    this.addCleanup(__udEv.on('change', e => { if (e.store === this.apiName) this.requestUpdate('data'); }));
    const tm = setInterval(() => this.requestUpdate('time'), 60e3);
    this.addCleanup(() => clearInterval(tm));
  }
  removeItem(it) { if (!it) return; this.api.remove(it.id); announce(t('common.remove') + ': ' + (it.title || it.id)); }
  row(it) {
    const li = h('li', { class: 'o-list-item o-ud-item', dataset: { id: String(it.id) } });
    li.__item = it;
    this.fillRow(li, it);
    return li;
  }
  fillRow(li, it) {
    li.__item = it;
    const title = it.title || it.name || String(it.id), sub = [it.type && cap(it.type), it.meta?.subtitle || (typeof it.meta === 'string' ? it.meta : ''), it.time && this.showTime ? __rel(it.time) : ''].filter(Boolean).join(' · ');
    li.innerHTML = String(html`${this.grip ? html`<span class="o-ud-grip" aria-hidden="true">${icon('grip-vertical')}</span>` : ''}<span class="o-ud-icon" aria-hidden="true">${icon(__itemIcon(it))}</span>
      <a class="o-list-content o-ud-link" href="${it.url || '#'}"${this.linkAttrs(it)}><span class="o-list-title">${title}</span>${sub ? html`<span class="o-list-sub">${sub}</span>` : ''}</a>
      <button type="button" class="o-btn o-btn-ghost o-btn-icon o-btn-sm o-ud-remove" aria-label="${this.t('userdata.remove', { title })}" title="${this.t('userdata.remove', { title })}">${icon(this.removeIcon)}</button>`);
  }
  linkAttrs() { return ''; }
  render() {
    const items = this.items();
    patchList(this.list, items, it => String(it.id), it => this.row(it), (li, it) => { if (!equal(li.__item, it) || this.changedTime) this.fillRow(li, it); });
    this.list.hidden = !items.length;
    this.emptyEl.hidden = !!items.length;
    this.emptyEl.querySelector('.o-empty-text').textContent = this.emptyText || this.t(this.emptyKey);
    this.foot.hidden = !this.clearable || !items.length;
    if (!this.foot.hidden && !this.foot.firstChild) this.foot.append(h('button', { type: 'button', class: 'o-btn o-btn-link o-btn-sm', onClick: () => this.clearAll() }, this.t('userdata.clearAll')));
  }
  update(changed) { this.changedTime = changed.has('time') || changed.has('locale'); this.render(); }
}

class ORecentList extends __UDList {
  static props = { type: String, limit: { type: Number, default: 8 }, store: { type: String, default: 'recent' }, emptyText: String, clearable: Boolean, texts: Object };
  get emptyIcon() { return 'clock'; }
  get emptyKey() { return 'userdata.recentEmpty'; }
  get removeIcon() { return 'x'; }
  get showTime() { return true; }
  get apiName() { return this.store === 'viewed' ? 'viewed' : 'recent'; }
  get api() { return this.store === 'viewed' ? viewed : recent; }
  items() { return this.api.list({ type: this.type || undefined, limit: this.limit || undefined }); }
  clearAll() { this.api.clear(this.type || undefined); }
  setup() { super.setup(); this.classList.add('o-recent-list'); }
}
define('o-recent-list', ORecentList);

class OFavoritesList extends __UDList {
  static props = { limit: Number, emptyText: String, clearable: Boolean, texts: Object };
  get emptyIcon() { return 'star'; }
  get emptyKey() { return 'userdata.favoritesEmpty'; }
  get removeIcon() { return 'star'; }
  get showTime() { return false; }
  get apiName() { return 'favorites'; }
  get api() { return favorites; }
  get grip() { return !!this._sortable; }
  items() { const l = favorites.list(); return this.limit ? l.slice(0, this.limit) : l; }
  clearAll() { favorites.clear(); }
  linkAttrs() { return raw(` aria-describedby="${this._hintId}"`); }
  setup() {
    super.setup();
    this.classList.add('o-favorites-list');
    this._hintId = uid('fav-hint');
    this.append(h('span', { class: 'o-sr-only', id: this._hintId }, this.t('userdata.reorderHint')));
    on(this.list, 'keydown', '.o-ud-link', (e, a) => {
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault();
      const it = a.closest('li').__item, total = favorites.list().length;
      const j = favorites.move(it.id, e.key === 'ArrowUp' ? -1 : 1);
      this.flush();
      this.render();
      this.list.querySelector(`li[data-id="${CSS.escape(String(it.id))}"] .o-ud-link`)?.focus();
      announce(t('userdata.moved', { title: it.title || it.id, pos: j + 1, total }));
      this.emit('reorder', { ids: favorites.list().map(x => x.id) });
    });
  }
  connected() {
    super.connected();
    if (!this._sortable && isFn(O.sortable)) {
      try { this._sortable = O.sortable(this.list, { handle: '.o-ud-grip', draggable: '.o-ud-item', items: '.o-ud-item', animation: 150, onEnd: () => this._readOrder(), onSort: () => this._readOrder(), onUpdate: () => this._readOrder() }) || true; }
      catch (e) { console.warn('[Orion] favorites: Orion.sortable failed', e); }
      if (this._sortable) { this.classList.add('is-sortable'); this.listen(this.list, 'o-sort o-sort-end o-sortend o-reorder o-change drop dragend', () => setTimeout(() => this._readOrder())); this.requestUpdate('data'); }
    }
  }
  _readOrder() {
    const ids = [...this.list.children].map(li => li.dataset.id).filter(Boolean);
    const cur = favorites.list().map(x => String(x.id));
    if (ids.length && !equal(ids, cur.slice(0, ids.length))) { favorites.reorder([...ids, ...cur.filter(id => !ids.includes(id))]); this.emit('reorder', { ids }); }
  }
  removeItem(it) { if (!it) return; favorites.remove(it.id); announce(t('userdata.removed', { title: it.title || it.id })); }
}
define('o-favorites-list', OFavoritesList);

/* ── <o-saved-views scope> ─────────────────────────────────────────── */
class OSavedViews extends OElement {
  static props = { scope: { type: String, default: 'default' }, value: { type: String, reflect: true }, state: { type: Any, attr: false }, getState: { type: Function }, applyDefault: Boolean, placement: { type: String, default: 'bottom-start' }, texts: Object };
  setup() {
    this.classList.add('o-saved-views');
    const pid = uid('views');
    this.btn = h('button', { type: 'button', class: 'o-btn o-saved-views-btn', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': pid, onClick: () => (this._ov ? this.close() : this.open()) });
    this.panel = h('div', { class: 'o-views-panel o-floating', role: 'dialog', id: pid, hidden: true });
    this.append(this.btn);
    this._nav = new ListNav(this.panel, { items: '.o-views-apply', typeahead: true });
    on(this.panel, 'keydown', e => { if (e.target.classList.contains('o-views-apply')) this._nav.handle(e); });
    on(this.panel, 'click', '.o-views-apply', (e, b) => { this.apply(b.dataset.id); this.close(); });
    on(this.panel, 'click', '.o-views-default', (e, b) => { const v = views.get(this.scope, b.dataset.id); views.setDefault(this.scope, v?.isDefault ? null : b.dataset.id); });
    on(this.panel, 'click', '.o-views-del', (e, b) => this.remove(b.dataset.id));
    on(this.panel, 'click', '.o-views-update', () => { const v = views.get(this.scope, this.value); if (v) this.save(v.name); });
    on(this.panel, 'submit', 'form', e => {
      e.preventDefault();
      const f = e.target, name = f.elements.name.value.trim();
      if (!name) { f.elements.name.setAttribute('aria-invalid', 'true'); f.elements.name.focus(); announce(this.t('userdata.nameRequired'), 'assertive'); return; }
      this.save(name, { isDefault: f.elements.def.checked });
      f.reset(); f.elements.name.removeAttribute('aria-invalid');
    });
  }
  connected() {
    this.addCleanup(views.onChange(() => this.requestUpdate('data')));
    if (this.applyDefault && !this._didDefault) { this._didDefault = true; queueMicrotask(() => { const d = views.getDefault(this.scope); if (d && !this.value) this.apply(d.id); }); }
  }
  disconnected() { this.close(); }
  /** Current state to save: getState() -> state property -> o-before-save listener (detail.state). */
  currentState() {
    if (isFn(this.getState)) return this.getState();
    if (this.state !== undefined) return this.state;
    const d = { state: undefined };
    this.emit('before-save', d);
    return d.state;
  }
  apply(idOrName) {
    const v = views.get(this.scope, idOrName);
    if (!v) return null;
    if (!this.emit('before-apply', { view: v, state: clone(v.state) })) return null;
    this.value = v.id;
    this.emit('apply', { view: v, state: clone(v.state) });
    announce(this.t('userdata.applied', { name: v.name }));
    return v;
  }
  save(name, { isDefault } = {}) {
    const v = views.save(this.scope, name, clone(this.currentState() ?? null), { isDefault: isDefault || undefined });
    this.value = v.id;
    this.emit('save', { view: v });
    announce(this.t('userdata.saved', { name: v.name }));
    return v;
  }
  remove(idOrName) {
    const v = views.get(this.scope, idOrName);
    if (!v || !this.emit('before-delete', { view: v })) return false;
    views.remove(this.scope, v.id);
    if (this.value === v.id) this.value = null;
    this.emit('delete', { view: v });
    announce(this.t('userdata.deleted', { name: v.name }));
    this.panel.querySelector('.o-views-apply, input')?.focus();
    return true;
  }
  update() {
    const list = views.list(this.scope), active = list.find(v => v.id === this.value);
    this.btn.innerHTML = String(html`${icon('bookmark')}<span class="o-saved-views-label">${active ? active.name : this.t('userdata.views')}</span>${icon('chevron-down', { class: 'o-saved-views-caret' })}`);
    this.btn.setAttribute('aria-label', `${this.t('userdata.savedViews')}${active ? ': ' + active.name : ''}`);
    this.panel.setAttribute('aria-label', this.t('userdata.savedViews'));
    if (this._ov) this._renderPanel();
  }
  _renderPanel() {
    const list = views.list(this.scope), active = list.find(v => v.id === this.value), T = (k, p) => this.t('userdata.' + k, p);
    const had = this.panel.contains(doc.activeElement) ? doc.activeElement : null, focusSel = had && (had.dataset.id ? `[data-id="${CSS.escape(had.dataset.id)}"].${[...had.classList].find(c => c.startsWith('o-views-'))}` : had.name ? `[name="${had.name}"]` : null);
    const nameVal = this.panel.querySelector('input[name="name"]')?.value || '';
    this.panel.innerHTML = String(html`<div class="o-views-head">${T('savedViews')}</div>
      ${list.length ? html`<ul class="o-views-list" role="list">${list.map(v => html`<li class="o-views-row${v.id === this.value ? ' is-active' : ''}">
        <button type="button" class="o-views-apply" data-id="${v.id}" aria-current="${v.id === this.value ? 'true' : 'false'}" tabindex="-1">${icon('check', { class: 'o-views-check' })}<span class="o-views-name">${v.name}</span>${v.isDefault ? html`<span class="o-badge o-badge-sm o-badge-soft-primary">${T('isDefault')}</span>` : ''}</button>
        <button type="button" class="o-btn o-btn-ghost o-btn-icon o-btn-sm o-views-default" data-id="${v.id}" aria-pressed="${v.isDefault ? 'true' : 'false'}" aria-label="${v.isDefault ? T('unsetDefault') : T('makeDefault', { name: v.name })}" title="${v.isDefault ? T('unsetDefault') : T('setDefault')}">${icon('star')}</button>
        <button type="button" class="o-btn o-btn-ghost o-btn-icon o-btn-sm o-views-del" data-id="${v.id}" aria-label="${T('deleteView', { name: v.name })}" title="${T('deleteView', { name: v.name })}">${icon('trash')}</button></li>`)}</ul>`
      : html`<p class="o-views-empty">${T('viewsEmpty')}</p>`}
      ${active ? html`<div class="o-views-updaterow"><button type="button" class="o-btn o-btn-sm o-btn-block o-views-update">${icon('refresh')}<span>${T('update', { name: active.name })}</span></button></div>` : ''}
      <form class="o-views-form" novalidate><label class="o-label" for="${this.panel.id}-n">${T('saveView')}</label>
        <div class="o-input-group"><input class="o-input o-input-sm" id="${this.panel.id}-n" name="name" autocomplete="off" placeholder="${T('viewName')}" maxlength="60"><button type="submit" class="o-btn o-btn-primary o-btn-sm">${T('save')}</button></div>
        <label class="o-check o-views-defcheck"><input type="checkbox" name="def"><span>${T('setDefault')}</span></label></form>`);
    this.panel.querySelector('input[name="name"]').value = nameVal;
    const first = this.panel.querySelector('.o-views-apply[aria-current="true"]') || this.panel.querySelector('.o-views-apply');
    if (first) first.tabIndex = 0;
    if (focusSel) this.panel.querySelector(focusSel)?.focus();
  }
  open() {
    if (this._ov) return;
    this._renderPanel();
    portal(this.panel, this);
    this.panel.hidden = false;
    this._unplace = autoPlace(this.panel, this.btn, { placement: this.placement, offset: 4, size: true });
    this._ov = overlays.open({ el: this.panel, owner: this, trap: false, onClose: () => { this._ov = null; this._unplace?.(); this.panel.hidden = true; this.btn.setAttribute('aria-expanded', 'false'); this.emit('close'); } });
    this.btn.setAttribute('aria-expanded', 'true');
    animate(this.panel, 'zoomIn', { duration: 120 });
    (this.panel.querySelector('.o-views-apply[tabindex="0"]') || this.panel.querySelector('input'))?.focus();
    this.emit('open');
  }
  close() { this._ov?.close('api'); }
  toggle() { if (this._ov) this.close(); else this.open(); }
}
define('o-saved-views', OSavedViews);
Object.assign(O, { FavoriteButton: OFavoriteButton, RecentList: ORecentList, FavoritesList: OFavoritesList, SavedViews: OSavedViews });
