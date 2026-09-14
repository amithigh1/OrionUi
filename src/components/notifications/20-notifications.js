/* <o-notifications> — the notification list/center. Renders Orion.notifications.items live (no local
 * `items` prop — it always reflects the shared store, same as <o-notification-bell>'s panel).
 *   compact                    — denser rows without the header/actions (fits a small popover).
 *   group-by-day (default on)  — inserts a day divider between items ("Today" / "Yesterday" / date).
 *   source(page, {pageSize}) -> items[] | { items, hasMore }
 *     Pulls OLDER notifications and appends them via Orion.notifications.append() — used by load()/auto-load.
 * Methods: load(page?) markAllRead() clearAll().
 * Events: o-select ({item}) — cancelable; o-dismiss ({item}); o-load ({page,items,hasMore}); o-error ({error}).
 */
i18n.add('en', {
  notif: {
    ariaLabel: 'Notifications', title: 'Notifications', empty: 'No notifications', markAllRead: 'Mark all read',
    clearAll: 'Clear all', dismiss: 'Dismiss', loadMore: 'Load more', loading: 'Loading…',
    unread: { one: '{count} unread', other: '{count} unread' }, today: 'Today', yesterday: 'Yesterday',
  },
});

const NOTIF_ICON = { success: 'success', error: 'error', warning: 'warning', info: 'info', mention: 'mention' };
const NOTIF_COLOR = { success: 'success', error: 'danger', warning: 'warning', info: 'info', mention: 'primary' };
const notifIcon = it => it.icon || NOTIF_ICON[it.type] || 'bell';
const notifColor = it => NOTIF_COLOR[it.type] || 'secondary';
function notifDate(v) { return v == null ? null : (O.date ? O.date.parse(v) : new Date(v)); }
function notifDayKey(v) { const d = notifDate(v); return d ? (date.isSame(d, new Date(), 'd') ? 'today' : date.format(d, 'YYYY-MM-DD')) : 'unknown'; }
function notifDayLabel(v, tFn) {
  const d = notifDate(v);
  if (!d) return '';
  if (date.isToday(d)) return tFn('notif.today');
  if (date.isSame(d, date.sub(new Date(), 1, 'day'), 'd')) return tFn('notif.yesterday');
  return fmt.date(d, { month: 'long', day: 'numeric', year: date.isSame(d, new Date(), 'y') ? undefined : 'numeric' });
}

class ONotifications extends OElement {
  static props = {
    compact: { type: Boolean, reflect: true },
    groupByDay: { type: Boolean, attr: 'group-by-day', default: true },
    showHeader: { type: Boolean, attr: 'show-header', default: true },
    emptyText: String,
    source: { type: Function, attr: false },
    pageSize: { type: Number, attr: 'page-size', default: 20 },
    autoLoad: { type: Boolean, attr: 'auto-load' },
    label: String,
    texts: Object,
  };

  setup() {
    this.classList.add('o-notifications');
    this._page = 0; this._hasMore = true; this._loading = false;
    this._header = h('div', { class: 'o-notif-header', hidden: true },
      h('span', { class: 'o-notif-header-title' }),
      h('div', { class: 'o-notif-header-actions' },
        h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', 'data-act': 'read-all' }, this.t('notif.markAllRead')),
        h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm o-btn-icon', 'data-act': 'clear-all', 'aria-label': this.t('notif.clearAll') }, icon('trash'))));
    this._list = h('div', { class: 'o-feed o-notif-list', role: 'list' });
    this._moreBtn = h('button', { type: 'button', class: 'o-btn o-btn-sm o-btn-ghost o-feed-more', hidden: true });
    this._sentinel = h('div', { class: 'o-feed-sentinel', 'aria-hidden': 'true' });
    this.append(this._header, this._list, this._moreBtn, this._sentinel);

    on(this._header, 'click', '[data-act]', (e, el) => this._headerAction(el.dataset.act));
    on(this._list, 'click', '.o-feed-item', (e, el) => this._onRowClick(e, el));
    on(this._list, 'keydown', '.o-feed-item', (e, el) => { if (e.key === 'Enter' || e.key === ' ') { if (e.target.closest('button')) return; e.preventDefault(); this._select(el); } });
    on(this._moreBtn, 'click', () => this.load());
  }
  connected() {
    if (O.notifications) this._unsub = O.notifications.on('change', () => this._render());
    this._watchSentinel();
    this._render();
  }
  disconnected() { this._unsub?.(); this._unsub = null; this._offVisible?.(); this._offVisible = null; }
  update(changed) {
    if (changed.has('autoLoad') || changed.has('source') || changed.has('init')) this._watchSentinel();
    if (changed.has('showHeader') || changed.has('init') || changed.has('locale')) { this._header.hidden = !this.showHeader; this._header.querySelector('.o-notif-header-title').textContent = this.t('notif.title'); }
    if (changed.has('compact') || changed.has('groupByDay') || changed.has('init') || changed.has('locale')) this._render();
    if (changed.has('label') || changed.has('init') || changed.has('locale')) this.setAttribute('aria-label', this.label || this.t('notif.ariaLabel'));
  }

  /* ── public API ──────────────────────────────────────────────────────── */
  markAllRead() { O.notifications && O.notifications.markRead('all'); }
  clearAll() { O.notifications && O.notifications.remove('all'); }
  /** load(page = next) -> Promise<newItems[]> — pulls OLDER notifications from `source` and appends them. */
  async load(page = this._page + 1) {
    if (!isFn(this.source) || this._loading || !O.notifications) return [];
    this._loading = true; this._paintLoading(true);
    try {
      const res = await this.source(page, { pageSize: this.pageSize });
      const list = toArr(isObj(res) && !Array.isArray(res) ? res.items : res);
      this._hasMore = isObj(res) && !Array.isArray(res) && typeof res.hasMore === 'boolean' ? res.hasMore : list.length >= this.pageSize;
      this._page = page;
      O.notifications.append(list);
      this.emit('load', { page, items: list, hasMore: this._hasMore });
      return list;
    } catch (err) {
      console.error('[Orion] o-notifications: source() failed:', err);
      this.emit('error', { error: err });
      return [];
    } finally { this._loading = false; this._paintLoading(false); }
  }

  /* ── internal ────────────────────────────────────────────────────────── */
  _headerAction(act) { if (act === 'read-all') this.markAllRead(); else if (act === 'clear-all') this.clearAll(); }
  _onRowClick(e, el) {
    if (e.target.closest('[data-dismiss]')) { const it = this._byId.get(el.dataset.id); if (it) { O.notifications && O.notifications.remove(it.id); this.emit('dismiss', { item: it }); } return; }
    this._select(el);
  }
  _select(el) {
    const it = this._byId.get(el.dataset.id);
    if (!it) return;
    O.notifications && O.notifications.markRead(it.id);
    this.emit('select', { item: it });
  }
  _watchSentinel() {
    this._offVisible?.(); this._offVisible = null;
    if (!this.autoLoad || !isFn(this.source)) return;
    this._offVisible = observeVisible(this._sentinel, visible => { if (visible && !this._loading && this._hasMore) this.load(); }, { rootMargin: '160px' });
  }
  _paintLoading(isLoading) {
    this.classList.toggle('is-loading', isLoading);
    this._moreBtn.disabled = isLoading;
    this._moreBtn.textContent = isLoading ? this.t('notif.loading') : this.t('notif.loadMore');
    this._moreBtn.hidden = !isFn(this.source) || (!this._hasMore && !isLoading);
  }
  _items() { return O.notifications ? O.notifications.items : []; }
  _render() {
    const items = this._items();
    this._byId = new Map(items.map(it => [String(it.id), it]));
    if (this.showHeader) {
      const n = O.notifications ? O.notifications.unreadCount : 0;
      this._header.querySelector('.o-notif-header-title').textContent = n ? `${this.t('notif.title')} · ${this.t('notif.unread', { count: n })}` : this.t('notif.title');
      const readAllBtn = this._header.querySelector('[data-act="read-all"]');
      if (readAllBtn) readAllBtn.disabled = !n;
    }
    if (!items.length) {
      this._list.replaceChildren(h('div', { class: 'o-empty o-empty-sm' }, h('div', { class: 'o-empty-icon' }, icon('bell')), h('p', { class: 'o-empty-text' }, this.emptyText || this.t('notif.empty'))));
      this._emptyShown = true;
      this._paintLoading(false);
      return;
    }
    // patchList only tracks/reuses children it created itself (tagged __okey); clear a leftover
    // empty-state node first so it doesn't linger alongside the real rows.
    if (this._emptyShown) { this._list.replaceChildren(); this._emptyShown = false; }
    const rows = this._buildRows(items);
    patchList(this._list, rows, r => r.key, r => this._createRow(r), (el, r) => this._updateRow(el, r));
    this._paintLoading(false);
  }
  _buildRows(items) {
    const rows = [];
    let prevDay = null;
    items.forEach(it => {
      if (this.groupByDay) {
        const dk = notifDayKey(it.createdAt);
        if (dk !== prevDay) { rows.push({ type: 'day', key: 'day:' + dk, label: notifDayLabel(it.createdAt, k => this.t(k)) }); prevDay = dk; }
      }
      rows.push({ type: 'item', key: 'i:' + it.id, item: it });
    });
    return rows;
  }
  _createRow(r) {
    if (r.type === 'day') return h('div', { class: 'o-divider' }, r.label);
    // The timestamp lives inside .o-feed-content (next to the title, wrapping onto its own line when
    // narrow) rather than as a same-row flex sibling — at report widths a fixed-position time label
    // beside an absolutely-positioned dismiss button collides with wrapped title text.
    const el = h('div', { class: 'o-feed-item', role: 'listitem', tabindex: '0' },
      h('span', { class: 'o-notif-icon' }),
      h('div', { class: 'o-feed-content' },
        h('div', { class: 'o-notif-title-row' }, h('span', { class: 'o-notif-title' }), h('time', { class: 'o-feed-time' })),
        h('div', { class: 'o-notif-body' })),
      h('button', { type: 'button', class: 'o-notif-dismiss', 'data-dismiss': '', 'aria-label': this.t('notif.dismiss') }, icon('x')));
    this._paintRow(el, r.item);
    return el;
  }
  _updateRow(el, r) { if (r.type === 'day') { el.textContent = r.label; return; } this._paintRow(el, r.item); }
  _paintRow(el, it) {
    el.dataset.id = it.id;
    el.classList.toggle('is-unread', !it.read);
    const iconSlot = el.querySelector('.o-notif-icon');
    iconSlot.className = cls('o-notif-icon', 'o-c-' + notifColor(it));
    iconSlot.replaceChildren(iconEl(notifIcon(it)));
    el.querySelector('.o-notif-title').textContent = it.title || '';
    const body = el.querySelector('.o-notif-body');
    body.textContent = it.body || '';
    body.hidden = !it.body;
    const time = el.querySelector('.o-feed-time');
    time.textContent = it.createdAt ? fmt.relative(it.createdAt) : '';
    const d = notifDate(it.createdAt);
    if (d) time.dateTime = d.toISOString(); else time.removeAttribute('datetime');
  }
}
define('o-notifications', ONotifications);
O.Notifications = ONotifications;
