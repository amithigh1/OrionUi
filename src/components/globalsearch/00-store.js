/* Shared strings + fallback persistence for <o-global-search>.
 * Delegates to Orion.searchHistory / Orion.recent / Orion.favorites when a compatible API is
 * present (services-b package), otherwise falls back to a small localStorage-backed store here.
 */
i18n.add('en', {
  globalsearch: {
    placeholder: 'Search…', noResults: 'No results for “{q}”', recent: 'Recent', recentSearches: 'Recent searches',
    favorites: 'Favorites', trending: 'Suggested', seeAll: 'See all {count} results', clearHistory: 'Clear history',
    removeSearch: 'Remove “{q}” from history', loadingMore: 'Searching…', error: 'Something went wrong',
    retry: 'Retry', navigate: 'Navigate', select: 'Select', close: 'Close', minChars: 'Keep typing to search…',
  },
});

const __gsHistKey = id => 'orion:globalsearch:history:' + id;
function __gsFallbackHistory(scope) {
  const key = __gsHistKey(scope);
  return {
    list: () => toArr(ls.get(key, [])),
    add(q) { q = String(q || '').trim(); if (!q) return; const list = [q, ...toArr(ls.get(key, [])).filter(x => x !== q)].slice(0, 10); ls.set(key, list); },
    remove(q) { ls.set(key, toArr(ls.get(key, [])).filter(x => x !== q)); },
    clear() { ls.del(key); },
  };
}
const __gsFallbackRecentStores = new Map();
function __gsFallbackRecent(scope) {
  const key = 'orion:globalsearch:recent:' + scope;
  return {
    list: () => toArr(ls.get(key, [])),
    add(item) { const list = [item, ...toArr(ls.get(key, [])).filter(x => x.id !== item.id)].slice(0, 8); ls.set(key, list); },
    remove(id) { ls.set(key, toArr(ls.get(key, [])).filter(x => x.id !== id)); },
    clear() { ls.del(key); },
  };
}
function __gsFallbackFavorites(scope) {
  const key = 'orion:globalsearch:favorites:' + scope;
  return {
    list: () => toArr(ls.get(key, [])),
    has: id => toArr(ls.get(key, [])).some(x => x.id === id),
    add(item) { const list = toArr(ls.get(key, [])).filter(x => x.id !== item.id); list.unshift(item); ls.set(key, list); },
    remove(id) { ls.set(key, toArr(ls.get(key, [])).filter(x => x.id !== id)); },
    toggle(item) { (this.has(item.id) ? this.remove(item.id) : this.add(item)); },
    clear() { ls.del(key); },
  };
}
/** Best-effort adapter: use Orion.searchHistory/.recent/.favorites when they look usable, else the fallback above. */
const gsStore = {
  history(scope) {
    const svc = O.searchHistory;
    // Orion.searchHistory.list(scope) (userdata package) returns [{ query, time }], not plain strings like the
    // localStorage fallback below — normalize either shape to a flat string[] so the empty-state list (which
    // esc()apes and renders each entry as text) never shows "[object Object]".
    if (isFn(svc?.add) && isFn(svc?.list)) return { list: () => toArr(svc.list(scope)).map(x => (isStr(x) ? x : x?.query)).filter(Boolean), add: q => svc.add(q, scope), remove: q => svc.remove?.(q, scope), clear: () => svc.clear?.(scope) };
    return __gsFallbackHistory(scope);
  },
  recent(scope) {
    const svc = O.recent;
    // Orion.recent (userdata package) is a single shared, unscoped list — list({ type, limit }) ignores a scope
    // string entirely (it destructures an options object) and add(item) has no scope parameter at all. Tag each
    // item we add with the owning scope and filter on read so different <o-global-search> instances still get
    // separate "recent" lists, per this component's documented `scope` contract, without touching the shared store.
    if (isFn(svc?.add) && isFn(svc?.list)) {
      const mine = x => x && (x.__gsScope || 'default') === scope;
      return {
        list: () => toArr(svc.list()).filter(mine),
        add: item => svc.add({ ...item, __gsScope: scope }),
        remove: id => svc.remove?.(id),
        clear: () => toArr(svc.list()).filter(mine).forEach(x => svc.remove?.(x.id)),
      };
    }
    return __gsFallbackRecentStores.get(scope) || (__gsFallbackRecentStores.set(scope, __gsFallbackRecent(scope)), __gsFallbackRecentStores.get(scope));
  },
  favorites(scope) {
    const svc = O.favorites;
    // Orion.favorites (userdata package) has no scope concept at all — a favorite is a per-user fact, not a
    // per-search-box one, so (unlike history/recent above) every <o-global-search> instance intentionally shares
    // one favorites list when this service is present. The `scope` parameter only matters for the localStorage
    // fallback below (no real service loaded).
    if (isFn(svc?.add) && isFn(svc?.list)) return { list: () => toArr(svc.list()), has: id => !!svc.has?.(id), toggle: item => svc.toggle?.(item), remove: id => svc.remove?.(id) };
    return __gsFallbackFavorites(scope);
  },
};
