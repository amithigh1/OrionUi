/* <o-activity-feed items='[{id, actor:{name,avatar}, verb, target:{label}, type, icon, color, createdAt}]'>
 *   compact              — denser rows for a sidebar/card widget (still shows everything, just tighter).
 *   group-by-day         — inserts a day divider ("Today" / "Yesterday" / date) between items (default on).
 *   filter="type"        — only render items whose `type` matches (empty string / omitted = show all).
 *   filters='[{value,label}]' — explicit filter chips; when omitted they are derived from the distinct
 *                          `type`s present in `items`. The chip row shows automatically once there is more
 *                          than one type, or force it with `show-filter`.
 *   source(page, {pageSize}) -> items[] | { items, hasMore }   — paged loader used by load()/auto-load.
 *   auto-load             — observes a sentinel row and calls load() automatically near the bottom.
 * Methods: load(page?) setItems(list) refresh() clear().
 * Events: o-select ({item}), o-load ({page,items,hasMore}), o-error ({error}).
 * Markup reuses core classes so a static feed needs no JS: `.o-feed > .o-feed-item > .o-feed-content` /
 * `.o-feed-time` (src/css/60-content.css) — this package only adds `.o-feed-icon` / `.o-feed-avatar` and
 * reuses `.o-divider` (day headers), `.o-empty` (empty state) and `.o-segmented` (filter chips).
 */
i18n.add('en', {
  feed: {
    ariaLabel: 'Activity feed', empty: 'No activity yet', loadMore: 'Load more', loading: 'Loading…',
    all: 'All', today: 'Today', yesterday: 'Yesterday',
  },
});

function feedActor(actor = {}, size) {
  if (isBrowser && customElements.get('o-avatar')) return h('o-avatar', { name: actor.name || '', src: actor.avatar || null, size });
  const el = h('span', { class: cls('o-avatar', size && 'o-avatar-' + size) });
  el.textContent = String(actor.name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  return el;
}
function feedDate(v) { return O.date ? O.date.parse(v) : (v instanceof Date ? v : new Date(v)); }
function feedDayKey(v) { const d = feedDate(v); return d ? (date.isSame(d, new Date(), 'd') ? 'today' : date.format(d, 'YYYY-MM-DD')) : 'unknown'; }
function feedDayLabel(v, tFn) {
  const d = feedDate(v);
  if (!d) return '';
  if (date.isToday(d)) return tFn('feed.today');
  if (date.isSame(d, date.sub(new Date(), 1, 'day'), 'd')) return tFn('feed.yesterday');
  return fmt.date(d, { month: 'long', day: 'numeric', year: date.isSame(d, new Date(), 'y') ? undefined : 'numeric' });
}

class OActivityFeed extends OElement {
  static props = {
    items: { type: Array, default: () => [] },
    compact: { type: Boolean, reflect: true },
    groupByDay: { type: Boolean, attr: 'group-by-day', default: true },
    filter: { type: String, default: '' },
    filters: { type: Array, default: () => [] },
    showFilter: { type: Boolean, attr: 'show-filter' },
    source: { type: Function, attr: false },
    pageSize: { type: Number, attr: 'page-size', default: 20 },
    autoLoad: { type: Boolean, attr: 'auto-load' },
    empty: String,
    label: String,
    texts: Object,
  };

  setup() {
    this.classList.add('o-activity-feed');
    this._page = 0; this._hasMore = true; this._loading = false;
    this._filterBar = h('div', { class: 'o-segmented o-feed-filters', hidden: true });
    this._list = h('div', { class: 'o-feed', role: 'list' });
    this._moreBtn = h('button', { type: 'button', class: 'o-btn o-btn-sm o-btn-ghost o-feed-more', hidden: true });
    this._sentinel = h('div', { class: 'o-feed-sentinel', 'aria-hidden': 'true' });
    this.append(this._filterBar, this._list, this._moreBtn, this._sentinel);

    on(this._list, 'click', '.o-feed-item', (e, el) => { if (e.target.closest('a,button')) return; const it = this._byId.get(el.dataset.id); if (it) this.emit('select', { item: it }); });
    on(this._list, 'keydown', '.o-feed-item', (e, el) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const it = this._byId.get(el.dataset.id); if (it) this.emit('select', { item: it }); } });
    on(this._filterBar, 'click', 'button', (e, el) => { this.filter = el.dataset.value || ''; });
    on(this._moreBtn, 'click', () => this.load());
  }
  connected() { this._watchSentinel(); }
  disconnected() { this._offVisible?.(); this._offVisible = null; }
  update(changed) {
    if (changed.has('autoLoad') || changed.has('source') || changed.has('init')) this._watchSentinel();
    if (changed.has('items') || changed.has('filter') || changed.has('filters') || changed.has('showFilter')
      || changed.has('compact') || changed.has('groupByDay') || changed.has('init') || changed.has('locale')) this._render();
    if (changed.has('label') || changed.has('init') || changed.has('locale')) this.setAttribute('aria-label', this.label || this.t('feed.ariaLabel'));
  }

  /* ── public API ──────────────────────────────────────────────────────── */
  setItems(list) { this.items = toArr(list); }
  clear() { this.items = []; this._page = 0; this._hasMore = true; }
  refresh() { this.clear(); return this.load(1); }
  /** load(page = next) -> Promise<newItems[]> — pulls a page from `source` and appends it to `items`. */
  async load(page = this._page + 1) {
    if (!isFn(this.source) || this._loading) return [];
    this._loading = true; this._paintLoading(true);
    try {
      const res = await this.source(page, { pageSize: this.pageSize });
      const list = toArr(isObj(res) && !Array.isArray(res) ? res.items : res);
      this._hasMore = isObj(res) && !Array.isArray(res) && typeof res.hasMore === 'boolean' ? res.hasMore : list.length >= this.pageSize;
      this._page = page;
      this.items = this.items.concat(list);
      this.emit('load', { page, items: list, hasMore: this._hasMore });
      return list;
    } catch (err) {
      console.error('[Orion] o-activity-feed: source() failed:', err);
      this.emit('error', { error: err });
      return [];
    } finally { this._loading = false; this._paintLoading(false); }
  }

  /* ── internal ────────────────────────────────────────────────────────── */
  _watchSentinel() {
    this._offVisible?.(); this._offVisible = null;
    if (!this.autoLoad || !isFn(this.source)) return;
    this._offVisible = observeVisible(this._sentinel, visible => { if (visible && !this._loading && this._hasMore) this.load(); }, { rootMargin: '160px' });
  }
  _paintLoading(isLoading) {
    this.classList.toggle('is-loading', isLoading);
    this._moreBtn.disabled = isLoading;
    this._moreBtn.textContent = isLoading ? this.t('feed.loading') : this.t('feed.loadMore');
    this._moreBtn.hidden = !isFn(this.source) || (!this._hasMore && !isLoading);
  }
  _typesInUse() { const set = new Set(); this.items.forEach(it => { if (it.type) set.add(it.type); }); return [...set]; }
  _renderFilters() {
    const chips = this.filters.length ? this.filters : this._typesInUse().map(v => ({ value: v, label: cap(v) }));
    const show = this.showFilter || !!this.filter || chips.length > 1;
    this._filterBar.hidden = !show;
    if (!show) return;
    const chip = (value, label) => h('button', { type: 'button', class: cls(this.filter === value && 'is-active'), 'aria-pressed': String(this.filter === value), 'data-value': value }, label);
    this._filterBar.replaceChildren(chip('', this.t('feed.all')), ...chips.map(c => chip(c.value, c.label)));
  }
  _render() {
    this._renderFilters();
    this._byId = new Map(this.items.map(it => [String(it.id), it]));
    const items = this.filter ? this.items.filter(it => it.type === this.filter) : this.items;
    if (!items.length) {
      this._list.replaceChildren(h('div', { class: 'o-empty o-empty-sm' },
        h('div', { class: 'o-empty-icon' }, icon('activity')),
        h('p', { class: 'o-empty-text' }, this.empty || this.t('feed.empty'))));
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
        const dk = feedDayKey(it.createdAt);
        if (dk !== prevDay) { rows.push({ type: 'day', key: 'day:' + dk, label: feedDayLabel(it.createdAt, k => this.t(k)) }); prevDay = dk; }
      }
      rows.push({ type: 'item', key: 'i:' + it.id, item: it });
    });
    return rows;
  }
  _createRow(r) {
    if (r.type === 'day') return h('div', { class: 'o-divider' }, r.label);
    const el = h('div', { class: 'o-feed-item', role: 'listitem', tabindex: '0' },
      h('span', { class: 'o-feed-icon' }),
      h('span', { class: 'o-feed-avatar' }),
      h('div', { class: 'o-feed-content' }),
      h('time', { class: 'o-feed-time' }));
    this._paintRow(el, r.item);
    return el;
  }
  _updateRow(el, r) { if (r.type === 'day') { el.textContent = r.label; return; } this._paintRow(el, r.item); }
  _paintRow(el, it) {
    el.dataset.id = it.id;
    const iconSlot = el.querySelector('.o-feed-icon');
    iconSlot.className = cls('o-feed-icon', it.color && 'o-c-' + it.color);
    iconSlot.replaceChildren(iconEl(it.icon || 'activity'));
    el.querySelector('.o-feed-avatar').replaceChildren(feedActor(it.actor, 'xs'));
    el.querySelector('.o-feed-content').replaceChildren(
      h('b', {}, (it.actor && it.actor.name) || ''), ' ' + (it.verb || '') + ' ',
      it.target ? h('b', {}, it.target.label || '') : null);
    const time = el.querySelector('.o-feed-time');
    time.textContent = it.createdAt ? fmt.relative(it.createdAt) : '';
    const d = it.createdAt ? feedDate(it.createdAt) : null;
    if (d) time.dateTime = d.toISOString(); else time.removeAttribute('datetime');
  }
}
define('o-activity-feed', OActivityFeed);
O.ActivityFeed = OActivityFeed;
