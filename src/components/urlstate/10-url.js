/* Orion.url — typed URL (query / hash) state with history and two-way bindings.
 *   Orion.url.get('page', 'number', 1) · get('tags', 'array') · get('filter', 'json') · has('q') · all()
 *   Orion.url.set({ q: 'ada', page: 2 }, { replace, hash })   (null / '' / [] removes a key; calls in one tick = one history entry)
 *   Orion.url.set('page', 3) · remove('q') · remove(['q', 'page']) · build({ page: 2 }) -> URL string · flush()
 *   const b = Orion.url.bind('status', { get, set, type, default, debounce, replace, hash })  -> { update(), pull(), unbind() }
 *   Orion.url.bind('q', inputEl)   ·   <input data-o-url="q" data-o-url-type="string" data-o-url-debounce="300" data-o-url-replace>
 *   Orion.url.onChange(({ changed, params, source }) => …)   source: 'set' | 'popstate' | 'hashchange' | 'navigate' | 'sync'
 * Types: string · number · boolean ('1'/'0') · array (a,b,c — also repeated keys) · json · date (YYYY-MM-DD) · { parse, stringify }
 */
const __uev = new Emitter();
let __pend = null, __pendPush = false, __pendOrigin = null, __queued = false, __snap = null;

const __encQ = s => encodeURIComponent(s).replace(/%2C/gi, ',').replace(/%3A/gi, ':').replace(/%2F/gi, '/').replace(/%40/gi, '@').replace(/%20/g, '+');
const __encItem = s => String(s).replace(/%/g, '%25').replace(/,/g, '%2C');
const __decItem = s => s.replace(/%2C/gi, ',').replace(/%25/g, '%');
const URL_TYPES = {
  string: { parse: v => v, stringify: v => String(v) },
  number: { parse: v => { const n = parseFloat(v); return Number.isFinite(n) ? n : undefined; }, stringify: v => String(v) },
  boolean: { parse: v => !/^(0|false|no|off)$/i.test(v), stringify: v => (v ? '1' : '0') },
  array: { parse: (v, all) => all.flatMap(s => (s === '' ? [] : s.split(','))).map(__decItem), stringify: a => toArr(a).map(__encItem).join(',') },
  json: { parse: v => parseJSON(v, undefined), stringify: v => JSON.stringify(v) },
  date: { parse: v => O.date.parse(v) || undefined, stringify: v => O.date.toISODate(v) },
};
const __type = t0 => (isObj(t0) && isFn(t0.parse) ? t0 : isFn(t0) ? { parse: t0, stringify: String } : URL_TYPES[t0 || 'string'] || URL_TYPES.string);
/** JS value -> query string value (null = remove) */
function __ser(v, type) {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return null;
  if (type) return __type(type).stringify(v);
  if (v === true || v === false) return URL_TYPES.boolean.stringify(v);
  if (v instanceof Date) return v.getHours() || v.getMinutes() || v.getSeconds() ? v.toISOString() : O.date.toISODate(v);
  if (Array.isArray(v)) return URL_TYPES.array.stringify(v);
  if (isObj(v)) return JSON.stringify(v);
  return String(v);
}
const __cur = () => (__pend ? new URL(__pend.href) : new URL(isBrowser ? location.href : 'http://localhost/'));
/** hash "#a=1&b" -> URLSearchParams (bare names have ''), or null when the hash is empty */
const __hp = u => (u.hash.length > 1 ? new URLSearchParams(u.hash.slice(1)) : null);
const __qs = sp => [...sp].map(([k, v]) => __encQ(k) + (v === '' ? '' : '=' + __encQ(v))).join('&');
function __params(u) {
  const out = {}, add = (o, k, v) => { o[k] = k in o ? [].concat(o[k], v) : v; };
  u.searchParams.forEach((v, k) => add(out, k, v));
  const hp = __hp(u), hash = {};
  hp?.forEach((v, k) => add(hash, k, v));
  return { search: out, hash };
}
function __sync(source, origin = null) {
  if (!isBrowser) return;
  const p = __params(new URL(location.href)), prev = __snap || { search: {}, hash: {} };
  __snap = p;
  const keys = new Set([...Object.keys(p.search), ...Object.keys(prev.search), ...Object.keys(p.hash), ...Object.keys(prev.hash)]);
  const changed = [...keys].filter(k => !equal(p.search[k], prev.search[k]) || !equal(p.hash[k], prev.hash[k]));
  if (!changed.length) return;
  const detail = { changed, params: { ...p.hash, ...p.search }, search: p.search, hash: p.hash, source, origin };
  __uev.emit('change', detail);
  bus.emit('url:change', detail);
}
function __flush() {
  __queued = false;
  if (!__pend) return;
  const u = __pend, push = __pendPush, origin = __pendOrigin;
  __pend = null; __pendPush = false; __pendOrigin = null;
  if (u.href !== location.href) history[push ? 'pushState' : 'replaceState'](history.state, '', u.href);
  __sync('set', origin);
}

const url = {
  types: URL_TYPES,
  /** get(key, type = 'string', fallback) — query first, then hash params */
  get(key, type, fallback) {
    const u = __cur();
    let all = u.searchParams.getAll(key);
    if (!all.length) all = __hp(u)?.getAll(key) || [];
    if (!all.length) return fallback !== undefined ? fallback : type === 'array' ? [] : undefined;
    const v = __type(type).parse(all[all.length - 1], all);
    return v === undefined ? fallback : v;
  },
  has(key) { const u = __cur(); return u.searchParams.has(key) || !!__hp(u)?.has(key); },
  /** all() -> { key: value | [values] } (query + hash params; strings) */
  all() { const p = __params(__cur()); return { ...p.hash, ...p.search }; },
  /** set({ k: v }, opts) | set(k, v, opts) — opts: { replace, hash, type } */
  set(a, b, c) {
    if (!isBrowser) return url;
    const [obj, o] = isObj(a) ? [a, b || {}] : [{ [a]: b }, c || {}];
    const u = __cur(), sp = new URLSearchParams(u.search), hp = __hp(u) || new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) {
      const s = __ser(v, o.type), target = o.hash ? hp : sp;
      (o.hash ? sp : hp).delete(k);
      target.delete(k);
      if (s != null) target.set(k, s);
    }
    u.search = __qs(sp);
    u.hash = __qs(hp);
    __pend = u;
    __pendPush = __pendPush || !o.replace;
    __pendOrigin = o.origin ?? __pendOrigin;
    if (!__queued) { __queued = true; queueMicrotask(__flush); }
    return url;
  },
  remove(keys, o = {}) { return url.set(Object.fromEntries(toArr(keys).map(k => [k, null])), o); },
  /** build({ page: 2 }, { base, hash, clear }) -> absolute URL string (does not navigate) */
  build(obj = {}, { base, hash = false, clear = false } = {}) {
    const u = new URL(base || __cur().href, isBrowser ? location.href : undefined);
    const sp = clear ? new URLSearchParams() : new URLSearchParams(u.search), hp = __hp(u) || new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) { const s = __ser(v); (hash ? hp : sp).delete(k); if (s != null) (hash ? hp : sp).set(k, s); }
    u.search = __qs(sp); u.hash = __qs(hp);
    return u.href;
  },
  /** Write pending changes to history now (they are batched in a microtask otherwise). */
  flush() { __flush(); return url; },
  /** Re-read location (call after a router navigated with its own pushState). */
  sync() { __sync('sync'); return url; },
  onChange(fn) { return __uev.on('change', fn); },
  /** bind(key, element | { el, get, set, type, default, debounce, replace, hash, event }) -> { update, pull, unbind } */
  bind(key, o = {}) {
    if (o instanceof Element || isStr(o)) o = { el: o };
    const el = o.el ? $(o.el) : null;
    const type = o.type || (el ? __elType(el) : 'string');
    let writing = false;
    const getV = o.get || (el ? () => __readEl(el) : () => undefined);
    const setV = o.set || (el ? v => { writing = true; try { __writeEl(el, v); } finally { writing = false; } } : noop);
    const def = o.default !== undefined ? (isStr(o.default) && type !== 'string' ? __type(type).parse(o.default, [o.default]) : o.default) : el ? clone(__readEl(el)) : undefined;
    const id = uid('urlb');
    const isDef = v => v == null || v === '' || (Array.isArray(v) && !v.length) || (def !== undefined && equal(v, def));
    const toURL = () => { const v = getV(); url.set(key, isDef(v) ? null : v, { replace: o.replace, hash: o.hash, type, origin: id }); };
    const update = o.debounce ? debounce(toURL, o.debounce) : toURL;
    const pull = () => {
      const v = url.get(key, type), next = v === undefined || (Array.isArray(v) && !v.length && !url.has(key)) ? clone(def) : v;
      if (!equal(next, getV())) setV(next);
    };
    if (url.has(key)) pull();
    const offs = [url.onChange(e => { if (e.origin !== id && e.changed.includes(key)) pull(); })];
    if (el) offs.push(on(el, o.event || (__textual(el) ? 'input' : 'change'), () => { if (!writing) update(); }));
    return { key, update, push: update, pull, unbind() { offs.forEach(f => f()); update.cancel?.(); }, get value() { return url.get(key, type, def); } };
  },
};
const __textual = el => (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|email|url|tel|number|)$/i.test(el.type)));
const __elType = el => (el.type === 'checkbox' ? 'boolean' : el.type === 'number' || el.type === 'range' ? 'number' : el.multiple || Array.isArray(el.value) ? 'array' : 'string');
function __readEl(el) {
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'radio') { const g = (el.form || doc).querySelector(`input[type="radio"][name="${CSS.escape(el.name)}"]:checked`); return g ? g.value : ''; }
  if (el.tagName === 'SELECT' && el.multiple) return [...el.selectedOptions].map(x => x.value);
  if (el.type === 'number' || el.type === 'range') return el.value === '' ? null : +el.value;
  return el.value ?? '';
}
function __writeEl(el, v) {
  if (el.type === 'checkbox') el.checked = !!v;
  else if (el.type === 'radio') { const r = (el.form || doc).querySelector(`input[type="radio"][name="${CSS.escape(el.name)}"][value="${CSS.escape(String(v ?? ''))}"]`); if (r) r.checked = true; }
  else if (el.tagName === 'SELECT' && el.multiple) { const vals = toArr(v).map(String); [...el.options].forEach(x => { x.selected = vals.includes(x.value); }); }
  else if (el instanceof FormElement) { el.value = v; }
  else el.value = v ?? '';
  // let frameworks / listeners see the new value; `event.oUrl` tells them it came from the URL, not the user
  for (const type of ['input', 'change']) { const ev = new Event(type, { bubbles: true }); ev.oUrl = true; el.dispatchEvent(ev); }
}

behavior('data-o-url', (el, key) => {
  if (!key) return;
  const A = n => el.getAttribute('data-o-url-' + n);
  const d = A('debounce');
  const b = url.bind(key, { el, type: A('type') || undefined, debounce: d != null ? +d : __textual(el) ? 300 : 0, replace: el.hasAttribute('data-o-url-replace'), hash: el.hasAttribute('data-o-url-hash'), default: A('default') ?? undefined });
  return () => b.unbind();
});

if (isBrowser) {
  __snap = __params(new URL(location.href));
  on(win, 'popstate', () => __sync('popstate'));
  on(win, 'hashchange', () => __sync('hashchange'));
  if (win.navigation?.addEventListener) win.navigation.addEventListener('navigatesuccess', () => __sync('navigate'));
}
O.url = url;
