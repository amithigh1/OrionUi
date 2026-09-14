/* Orion.deeplink — shareable links that open tabs, modals and items.
 *   Orion.deeplink.register('invite', (value, { source }) => openInvite(value))  -> unregister()
 *   Recognised URLs:  page#invite · page#tab=billing&user=42 · page?open=invite · page?open=tab:billing,user:42
 *   Orion.deeplink.link('tab', 'billing') -> "https://…/page#tab=billing"   (link({ tab: 'billing' }), { query: true } -> ?open=tab:billing)
 *   Orion.deeplink.open('invite') (push + run) · set(name, value) (URL only) · remove(name) · parse(href) · copy(name, value)
 *   <button data-o-toggle="modal" data-o-target="#m" data-o-deeplink="invite" data-o-deeplink-sync>  opens on #invite (clicks the trigger)
 *   <dialog data-o-deeplink="help">  <details>  <o-drawer>  [role=tab]  any element (scrolled into view + highlighted)
 *   data-o-deeplink-value="billing" matches one value · data-o-deeplink-sync writes the link on click and removes it on close
 */
const __dlH = new Map();   // name -> Set<handler>
let __dlPrev = [], __dlBooted = false;
const __dlKey = e => e.name + '=' + e.value;

const deeplink = {
  /** parse(href) -> [{ name, value }]  (value === true for bare names) */
  parse(href) {
    if (!isBrowser && !href) return [];
    const u = new URL(href || location.href, isBrowser ? location.href : undefined), out = [];
    const hp = __hp(u);
    hp?.forEach((v, k) => out.push({ name: k, value: v === '' ? true : v, from: 'hash' }));
    u.searchParams.getAll('open').flatMap(s => s.split(',')).filter(Boolean).forEach(s => {
      const i = s.indexOf(':');
      out.push(i < 0 ? { name: s, value: true, from: 'query' } : { name: s.slice(0, i), value: s.slice(i + 1), from: 'query' });
    });
    return out;
  },
  get current() { return deeplink.parse(); },
  /** register(name, handler(value, ctx)) -> unregister(). Runs right away when the current URL targets it. */
  register(name, handler) {
    if (!__dlH.has(name)) __dlH.set(name, new Set());
    __dlH.get(name).add(handler);
    if (isBrowser) setTimeout(() => { if (__dlH.get(name)?.has(handler)) deeplink.parse().filter(e => e.name === name).forEach(e => __dlCall(handler, e, 'load')); }, 0);
    return () => deeplink.unregister(name, handler);
  },
  unregister(name, handler) { const s = __dlH.get(name); if (!s) return; if (handler) s.delete(handler); else s.clear(); if (!s.size) __dlH.delete(name); },
  /** link(name, value?, { query, base, merge }) | link({ a: 1, b: true }, opts) -> absolute URL */
  link(name, value, o = {}) {
    let map;
    if (isObj(name)) { map = name; o = value || {}; } else map = { [name]: value === undefined ? true : value };
    const u = new URL(o.base || (isBrowser ? location.href : 'http://localhost/'), isBrowser ? location.href : undefined);
    if (o.query) {
      const cur = o.merge ? u.searchParams.getAll('open').flatMap(s => s.split(',')).filter(Boolean) : [];
      const add = Object.entries(map).map(([k, v]) => (v === true ? k : k + ':' + v));
      const sp = new URLSearchParams(u.search); sp.set('open', [...cur, ...add].join(','));
      u.search = __qs(sp);
      if (!o.merge) u.hash = '';
    } else {
      const hp = o.merge ? __hp(u) || new URLSearchParams() : new URLSearchParams();
      for (const [k, v] of Object.entries(map)) hp.set(k, v === true ? '' : String(v));
      u.hash = __qs(hp);
    }
    return u.href;
  },
  /** set(name, value = true, { replace }) — write the link into the current URL without running handlers */
  set(name, value = true, { replace = false } = {}) {
    if (!isBrowser) return deeplink;
    url.flush();
    const u = new URL(location.href), hp = __hp(u) || new URLSearchParams();
    hp.set(name, value === true ? '' : String(value));
    u.hash = __qs(hp);
    if (u.href !== location.href) history[replace ? 'replaceState' : 'pushState'](history.state, '', u.href);
    __dlPrev = deeplink.parse();
    url.sync();
    return deeplink;
  },
  /** open(name, value) — write the link (history entry) and run its handlers */
  open(name, value = true, { replace = false } = {}) {
    deeplink.set(name, value, { replace });
    __dlRun({ name, value }, 'api');
    return deeplink;
  },
  /** remove(name) — drop it from the hash / ?open= (replace) */
  remove(name, { replace = true } = {}) {
    if (!isBrowser) return deeplink;
    const u = new URL(location.href), sp = new URLSearchParams(u.search);
    const rest = sp.getAll('open').flatMap(s => s.split(',')).filter(s => s && s !== name && !s.startsWith(name + ':'));
    if (sp.has('open')) { sp.delete('open'); if (rest.length) sp.set('open', rest.join(',')); u.search = __qs(sp); }
    const hp = __hp(u); if (hp) { hp.delete(name); u.hash = __qs(hp); }
    if (u.href !== location.href) history[replace ? 'replaceState' : 'pushState'](history.state, '', u.href.replace(/#$/, ''));
    __dlPrev = deeplink.parse();
    url.sync();
    return deeplink;
  },
  /** copy(name, value) -> Promise<boolean> — copy the shareable link */
  copy(name, value, o) {
    const href = deeplink.link(name, value, o);
    if (isFn(O.clipboard?.copy)) return O.clipboard.copy(href);
    return navigator.clipboard?.writeText(href).then(() => true, () => false) ?? Promise.resolve(false);
  },
  /** Re-run handlers for everything in the URL. */
  handle(source = 'api') { deeplink.parse().forEach(e => __dlRun(e, source)); __dlPrev = deeplink.parse(); },
};
function __dlCall(fn, e, source) {
  try { fn(e.value, { name: e.name, source, params: deeplink.parse() }); } catch (err) { console.error('[Orion] deeplink "' + e.name + '" failed:', err); }
}
function __dlRun(e, source) { [...(__dlH.get(e.name) || [])].forEach(fn => __dlCall(fn, e, source)); bus.emit('deeplink', { ...e, source }); }
function __dlChange(source) {
  const now = deeplink.parse(), before = new Set(__dlPrev.map(__dlKey)), after = new Set(now.map(__dlKey));
  const added = now.filter(e => !before.has(__dlKey(e))), removed = __dlPrev.filter(e => !after.has(__dlKey(e)));
  __dlPrev = now;
  added.forEach(e => __dlRun(e, source));
  removed.forEach(e => __dlLeave.get(e.name)?.forEach(fn => { try { fn(e.value); } catch (err) { console.error(err); } }));
}
const __dlLeave = new Map();   // name -> Set<fn> (sync elements closing their target when the link disappears)

/* ── data-o-deeplink ───────────────────────────────────────────────── */
let __dlActivating = false;
function __dlActivate(el, value) {
  if (!el.isConnected) return;
  __dlActivating = true;
  try { __dlDo(el, value); } finally { __dlActivating = false; }
  emit(el, 'o-deeplink', { name: el.getAttribute('data-o-deeplink'), value });
}
function __dlDo(el, value) {
  if (el.matches('[data-o-toggle],[data-o-action],a[href],button,[role=tab],summary,[role=button]')) el.click();
  else if (el.tagName === 'DIALOG') { if (!el.open) el.showModal(); }
  else if (el.tagName === 'DETAILS') el.open = true;
  else if (isFn(el.open)) el.open(value);
  else if (isFn(el.show)) el.show(value);
  else {
    el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    if (!el.hasAttribute('tabindex') && !focusables(el.parentElement || el).includes(el)) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
    animate(el, 'highlight', { duration: 1600 });
  }
}
behavior('data-o-deeplink', (el, name) => {
  if (!name) return;
  const want = el.getAttribute('data-o-deeplink-value');
  const off = deeplink.register(name, v => { if (want == null || String(v) === want) __dlActivate(el, v); });
  if (!el.hasAttribute('data-o-deeplink-sync')) return off;
  const target = () => targetOf(el) || el;
  const leave = v => { if (want != null && String(v) !== want) return; const tg = target(); if (tg.tagName === 'DIALOG') tg.close?.(); else if (isFn(tg.close)) tg.close(); else if (tg !== el && tg.tagName === 'DETAILS') tg.open = false; };
  if (!__dlLeave.has(name)) __dlLeave.set(name, new Set());
  __dlLeave.get(name).add(leave);
  const offClick = on(el, 'click', () => { if (!__dlActivating) { const cur = deeplink.parse().find(x => x.name === name); if (!cur || String(cur.value) !== String(want ?? true)) deeplink.set(name, want ?? true); } });
  const offClose = on(doc, 'o-close o-closed o-hide close', e => { if (e.target === target() && deeplink.parse().some(x => x.name === name)) deeplink.remove(name); }, true);
  return () => { off(); offClick(); offClose(); __dlLeave.get(name)?.delete(leave); };
});

if (isBrowser) {
  ready(() => { __dlBooted = true; __dlPrev = deeplink.parse(); });
  url.onChange(e => { if (__dlBooted && (e.source !== 'set')) __dlChange(e.source); });
}
O.deeplink = deeplink;
