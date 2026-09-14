/* ============================================================================
 * Orion.compare — a small, persisted "items to compare" list shared by <o-compare-tray> and
 * <o-compare-table>. Cross-tab synced (BroadcastChannel, falling back to a localStorage ping),
 * persisted under `orion:compare:items`.
 *
 *   Orion.compare.add(item)         item needs `.id` (usually also `.title`/`.image`/attributes…) -> Boolean
 *   Orion.compare.remove(id) · has(id) · get(id) · toggle(item) · list() · clear()
 *   Orion.compare.max / setMax(n)   default 4
 *   Orion.compare.subscribe(fn({ items, source })) -> unsubscribe()   fires immediately + on every change
 *
 *   <button data-o-action="compare" data-o-item='{"id":7,"title":"Aurora Chair","price":120}'>Compare</button>
 * ========================================================================== */
i18n.add('en', {
  compare: {
    add: 'Add to compare', remove: 'Remove from compare', added: '“{title}” added to compare', removed: '“{title}” removed from compare',
    full: 'You can compare up to {max} items — remove one first', invalidItem: 'Compare item needs an id',
  },
});

const CMP_KEY = 'orion:compare:items';
const __cmpEv = new Emitter();
const __cmpSame = (a, b) => a != null && b != null && String(a) === String(b);
let __cmpItems = ls.get(CMP_KEY, []);
if (!Array.isArray(__cmpItems)) __cmpItems = [];
let __cmpMax = 4;

const __cmpChan = (() => {
  if (!isBrowser) return { post: noop };
  const id = uid('tab'), PING = 'orion:compare:__ping';
  let bc = null;
  try { if (win.BroadcastChannel) { bc = new BroadcastChannel('orion:compare'); bc.onmessage = e => __cmpRemote(e.data); } } catch { bc = null; }
  if (!bc) win.addEventListener('storage', e => { if (e.key === PING && e.newValue) { const m = parseJSON(e.newValue, null); if (m && m.from !== id) __cmpRemote(m); } });
  return { post(data) { if (bc) { try { bc.postMessage(data); } catch {} } else { try { localStorage.setItem(PING, JSON.stringify({ from: id, n: Date.now() + Math.random(), ...data })); } catch {} } } };
})();
function __cmpRemote() { __cmpItems = ls.get(CMP_KEY, []); if (!Array.isArray(__cmpItems)) __cmpItems = []; __cmpNotify('remote'); }
function __cmpPersist(source) { ls.set(CMP_KEY, __cmpItems); __cmpNotify(source); __cmpChan.post({}); }
function __cmpNotify(source) {
  const detail = { items: __cmpItems.slice(), source };
  __cmpEv.emit('change', detail);
  bus.emit('compare:change', detail);
}

const compare = {
  get max() { return __cmpMax; },
  /** setMax(n) — trims the list if it is currently over the new limit. */
  setMax(n) {
    __cmpMax = Math.max(1, Math.trunc(n) || 1);
    if (__cmpItems.length > __cmpMax) { __cmpItems = __cmpItems.slice(0, __cmpMax); __cmpPersist('local'); }
    return compare;
  },
  list() { return __cmpItems.slice(); },
  has(id) { return __cmpItems.some(x => __cmpSame(x.id, id)); },
  get(id) { return __cmpItems.find(x => __cmpSame(x.id, id)) || null; },
  /** add(item) — item needs `.id`. Returns false when invalid, already present, or at `max`. */
  add(item) {
    if (!item || item.id == null) return false;
    if (compare.has(item.id)) return false;
    if (__cmpItems.length >= __cmpMax) return false;
    __cmpItems = [...__cmpItems, { ...item, addedAt: Date.now() }];
    __cmpPersist('local');
    return true;
  },
  remove(id) {
    const n = __cmpItems.filter(x => !__cmpSame(x.id, id));
    if (n.length === __cmpItems.length) return false;
    __cmpItems = n;
    __cmpPersist('local');
    return true;
  },
  /** toggle(item) -> true when now in the list. */
  toggle(item) {
    if (!item || item.id == null) return false;
    if (compare.has(item.id)) { compare.remove(item.id); return false; }
    return compare.add(item);
  },
  clear() { if (!__cmpItems.length) return; __cmpItems = []; __cmpPersist('local'); },
  /** subscribe(fn) — fires immediately with the current list, then on every change. Returns unsubscribe(). */
  subscribe(fn) { fn({ items: __cmpItems.slice(), source: 'init' }); return __cmpEv.on('change', fn); },
};
O.compare = compare;

/* ── data-o-action="compare" ──────────────────────────────────────────── */
function __cmpItemOf(trigger) {
  const raw = trigger.getAttribute('data-o-item');
  const parsed = raw ? parseJSON(raw, null) : null;
  if (parsed && isObj(parsed)) return parsed;
  const id = trigger.getAttribute('data-o-item-id') || trigger.dataset.id;
  return id != null ? { id, title: trigger.getAttribute('data-o-item-title') || trigger.textContent.trim() } : null;
}
function __cmpSyncButtons() {
  if (!isBrowser) return;
  $$('[data-o-action="compare"]').forEach(btn => {
    const item = __cmpItemOf(btn);
    const active = !!(item && compare.has(item.id));
    btn.setAttribute('aria-pressed', String(active));
    btn.classList.toggle('is-active', active);
  });
}
action('compare', trigger => {
  const item = __cmpItemOf(trigger);
  if (!item) { console.error('[Orion] data-o-action="compare": missing data-o-item (JSON with at least an "id").'); return; }
  const was = compare.has(item.id);
  if (was) compare.remove(item.id);
  else {
    const ok = compare.add(item);
    if (!ok && compare.max <= compare.list().length) {
      const msg = t('compare.full', { max: compare.max });
      announce(msg);
      if (O.toast) { if (isFn(O.toast.warning)) O.toast.warning(msg); else O.toast(msg); }
    }
  }
});
if (isBrowser) { compare.subscribe(() => __cmpSyncButtons()); ready(() => __cmpSyncButtons()); }
