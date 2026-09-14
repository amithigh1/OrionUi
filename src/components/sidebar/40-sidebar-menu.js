/* <o-sidebar-menu> — data-driven navigation tree for SPAs (renders the same .o-menu markup).
 *   <o-sidebar-menu items='[{"section":"Main"},{"label":"Home","icon":"home","href":"#/"},
 *     {"label":"Users","icon":"users","badge":12,"children":[{"label":"All","href":"#/users"}]}]' current="#/users"></o-sidebar-menu>
 * Item: { label, icon, href, id, badge, badgeColor, dot, children, active, section, disabled, target, open }
 * Props: items (Array), current (href or id; prefix match), accordion (Boolean), texts.
 * Events: o-navigate { item, href, originalEvent } — cancelable: preventDefault() stops the browser navigation (router takes over).
 * Methods: expandAll(), collapseAll(), setCurrent(hrefOrId).
 */
i18n.add('en', { sidebar: { new: 'New' } });

class OSidebarMenu extends OElement {
  static props = {
    items: { type: Array, default: () => [] },
    current: String,
    accordion: { type: Boolean, reflect: true },
    texts: Object,
  };
  setup() {
    this.classList.add('o-sidebar-menu');
    this._menu = h('ul', { class: 'o-menu' });
    this.replaceChildren(this._menu);
    this._map = new Map();
    on(this, 'click', 'a.o-menu-link', (e, a) => {
      const item = this._map.get(a); if (!item) return;
      if (item.disabled) { e.preventDefault(); return; }
      const ok = this.emit('navigate', { item, href: item.href || null, originalEvent: e });
      if (!ok || !item.href) e.preventDefault();
      if (item.target !== '_blank' && (item.href || item.id)) this.current = item.href || item.id;
    });
  }
  connected() { this.listen(win, 'popstate hashchange', () => { if (!this.current) this._sync(); }); }
  update(changed) {
    if (changed.has('items') || changed.has('init') || changed.has('locale')) this._render();
    if (changed.has('items') || changed.has('current') || changed.has('init')) this._sync();
  }
  _render() {
    const open = new Set($$('.o-menu-toggle[aria-expanded="true"]', this).map(x => x.dataset.key));
    this._map = new Map();
    const node = (it, key, level) => {
      const li = h('li', { class: cls('o-menu-item', it.class) });
      const inner = [
        it.icon ? icon(it.icon, { class: 'o-menu-icon' }) : null,
        h('span', { class: 'o-menu-label' }, it.label ?? ''),
        it.badge != null && it.badge !== '' ? h('span', { class: `o-badge o-badge-sm o-menu-badge o-badge-${esc(it.badgeColor || 'primary')}` }, String(it.badge)) : null,
        it.dot ? h('span', { class: cls('o-menu-dot', isStr(it.dot) && `o-c-${it.dot}`) }, h('span', { class: 'o-sr-only' }, this.t('sidebar.new'))) : null,
      ];
      if (Array.isArray(it.children) && it.children.length) {
        const isOpen = open.has(key) || !!it.open, subId = uid('o-menu');
        li.append(
          h('button', { type: 'button', class: 'o-menu-link o-menu-toggle', 'aria-expanded': String(isOpen), 'aria-controls': subId, 'data-key': key, disabled: !!it.disabled }, inner),
          h('ul', { class: 'o-menu-sub', id: subId, hidden: !isOpen }, it.children.map((c, j) => node(c, `${key}/${c.id ?? c.label ?? j}`, level + 1))),
        );
        if (isOpen) li.classList.add('is-open');
      } else {
        const a = h('a', { class: 'o-menu-link', href: it.href || '#', target: it.target || null, rel: it.target === '_blank' ? 'noopener noreferrer' : null, 'aria-disabled': it.disabled ? 'true' : null, 'data-key': key }, inner);
        this._map.set(a, it);
        li.append(a);
      }
      return li;
    };
    const out = [];
    let section = null;
    (this.items || []).forEach((it, i) => {
      if (!it) return;
      if (it.section && it.section !== section) { section = it.section; out.push(h('li', { class: 'o-menu-heading' }, it.section)); }
      if (it.label != null) out.push(node(it, String(it.id ?? it.href ?? it.label ?? i), 0));
    });
    this._menu.replaceChildren(...out);
  }
  _sync() {
    const cur = this.current;
    let best = null, score = 0;
    if (cur) {
      for (const [a, it] of this._map) for (const k of [it.id, it.href].filter(Boolean).map(String)) {
        const base = k.replace(/\/$/, '');
        const s = k === cur ? 1e6 : base.length > 1 && cur.startsWith(base + '/') ? base.length : 0;
        if (s > score) { score = s; best = a; }
      }
    } else {
      for (const [a, it] of this._map) if (it.active) { best = a; break; }
      if (!best) for (const a of this._map.keys()) { const s = O.sidebar._urlScore(a); if (s > score) { score = s; best = a; } }
    }
    O.sidebar._applyActive(this, best);
  }
  /** Mark an item active by href or id (same as setting `current`). */
  setCurrent(v) { this.current = v; }
  expandAll() { $$('.o-menu-toggle', this).forEach(x => O.sidebar._setGroup(x, true, { anim: false })); }
  collapseAll() { $$('.o-menu-toggle', this).forEach(x => O.sidebar._setGroup(x, false, { anim: false })); }
}
define('o-sidebar-menu', OSidebarMenu);
O.SidebarMenu = OSidebarMenu;
