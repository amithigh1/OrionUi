/* <o-presence-list items='[{id,name,avatar,status,group}]'> — "who is online", grouped.
 *   group-by="status" (default, sections: Online/Busy/Do not disturb/Away/Offline) | "group" (uses each
 *   item's `group` field, e.g. a team name) | "none" (flat list, presence-priority sorted).
 *   With `live` (default on) each row's status is kept in sync with Orion.presence by item id, overriding
 *   the item's own `status` field once the store has an entry for that id.
 * Fires `o-select` ({ item }) when a row is activated (click / Enter / Space).
 */
i18n.add('en', { presence: { group: { other: 'Other' } } });

function presenceAvatar(item, size) {
  if (isBrowser && customElements.get('o-avatar')) return h('o-avatar', { name: item.name || '', src: item.avatar || null, size });
  const el = h('span', { class: cls('o-avatar', size && 'o-avatar-' + size) });
  el.textContent = String(item.name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  return el;
}

class OPresenceList extends OElement {
  static props = {
    items: { type: Array, default: () => [] },
    groupBy: { type: String, default: 'status', reflect: true, attr: 'group-by' },
    hideOffline: { type: Boolean, attr: 'hide-offline' },
    live: { type: Boolean, default: true },
    empty: String,
    texts: Object,
  };

  setup() {
    this.classList.add('o-presence-list');
    this.setAttribute('role', 'list');
    on(this, 'click', '.o-presence-row', (e, row) => this._activate(row));
    on(this, 'keydown', '.o-presence-row', (e, row) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._activate(row); } });
  }
  disconnected() { this._unsub?.(); this._unsub = null; }
  update(changed) {
    if (changed.has('live') || changed.has('init')) this._subscribeLive();
    if (changed.has('items') || changed.has('groupBy') || changed.has('hideOffline') || changed.has('live') || changed.has('init') || changed.has('locale')) this._render();
  }

  _activate(row) {
    const item = this._byId.get(row.dataset.id);
    if (item) this.emit('select', { item });
  }
  _subscribeLive() {
    this._unsub?.(); this._unsub = null;
    if (!this.live || !O.presence) return;
    this._unsub = O.presence.subscribe(() => this._render());
  }
  _statusOf(item) {
    if (this.live && O.presence && O.presence.has(item.id)) return O.presence.get(item.id);
    return presenceStatus(item.status);
  }
  _render() {
    this._byId = new Map(this.items.map(it => [String(it.id), it]));
    let items = this.items;
    if (this.hideOffline) items = items.filter(it => this._statusOf(it) !== 'offline');
    if (!items.length) {
      this.replaceChildren(h('div', { class: 'o-presence-empty' }, icon('users'), h('p', {}, this.empty || this.t('presence.noOne'))));
      return;
    }
    const groups = this._group(items);
    const frag = doc.createDocumentFragment();
    groups.forEach(g => {
      if (this.groupBy !== 'none') frag.append(h('div', { class: 'o-presence-group-head' }, h('span', {}, g.label), h('span', { class: 'o-presence-group-count' }, String(g.items.length))));
      const list = h('div', { class: 'o-presence-group' });
      g.items.forEach(it => list.append(this._row(it)));
      frag.append(list);
    });
    this.replaceChildren(frag);
  }
  _group(items) {
    if (this.groupBy === 'group') {
      const map = new Map();
      items.forEach(it => { const key = it.group || this.t('presence.group.other'); if (!map.has(key)) map.set(key, []); map.get(key).push(it); });
      return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, list]) => ({ label, items: this._sortByPresence(list) }));
    }
    if (this.groupBy === 'none') return [{ label: '', items: this._sortByPresence(items) }];
    const buckets = new Map(PRESENCE_ORDER.map(s => [s, []]));
    items.forEach(it => buckets.get(this._statusOf(it)).push(it));
    return PRESENCE_ORDER.filter(s => buckets.get(s).length).map(s => ({ label: `${this.t('presence.' + s)} (${buckets.get(s).length})`, items: buckets.get(s) }));
  }
  _sortByPresence(list) { return [...list].sort((a, b) => PRESENCE_ORDER.indexOf(this._statusOf(a)) - PRESENCE_ORDER.indexOf(this._statusOf(b)) || String(a.name).localeCompare(String(b.name))); }
  _row(item) {
    const st = this._statusOf(item);
    const row = h('div', { class: 'o-presence-row', role: 'listitem', tabindex: '0', 'data-id': item.id },
      h('span', { class: 'o-presence-row-avatar' }, presenceAvatar(item, 'sm'), h('span', { class: cls('o-status', 'o-status-' + st), 'aria-hidden': 'true' })),
      h('div', { class: 'o-presence-row-body' },
        h('span', { class: 'o-presence-row-name' }, item.name || ''),
        h('span', { class: 'o-presence-row-sub' }, item.role || item.group || this.t('presence.' + st))));
    return row;
  }
}
define('o-presence-list', OPresenceList);
O.PresenceList = OPresenceList;
