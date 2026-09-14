/* Orion.pwa — service worker registration (the orion.js bundle itself is the SW), updates, install prompt, manifest.
 *   await Orion.pwa.register({ scope: './', precache: ['./', './app.css'], offlinePage: './offline.html',
 *     routes: [{ match: '/api/', strategy: 'network-first', timeout: 4000 }, { match: '*.png', strategy: 'cache-first', maxEntries: 60 },
 *              { match: '/api/', methods: ['POST', 'PUT', 'PATCH', 'DELETE'], queue: true }] });
 *   Orion.pwa.onUpdate(({ registration }) => …) · document 'o-sw-update' · toast "New version available · Reload" (toast: false to disable)
 *   Orion.pwa.update() · Orion.pwa.applyUpdate() · Orion.pwa.unregister() · await Orion.pwa.message({ type: 'GET_VERSION' })
 *   Orion.pwa.canInstall · Orion.pwa.installMode ('prompt' | 'ios' | 'installed' | 'unavailable') · await Orion.pwa.install()
 *   Orion.pwa.isStandalone · Orion.pwa.manifest({ name, short_name, icons, theme_color, … }) (blob-URL <link rel=manifest>)
 * Requirements: HTTPS or localhost; serve orion.js with "Service-Worker-Allowed: /" to use a scope above the script folder,
 * or use a tiny /sw.js containing importScripts('/path/orion.js') and pass it as swUrl.
 */
i18n.add('en', {
  pwa: {
    updateAvailable: 'A new version is available', reload: 'Reload', later: 'Later', install: 'Install', installApp: 'Install {name}',
    installDesc: 'Add it to your home screen for quick access, a full-screen window and offline use.', notNow: 'Not now', gotIt: 'Got it',
    iosTitle: 'Install {name}', iosSteps: 'Tap the Share button {icon} in Safari, then choose “Add to Home Screen”.',
    installed: 'App installed', offlineReady: 'Ready to work offline', unsupported: 'Service workers need HTTPS or localhost',
  },
});

class PWAError extends Error { constructor(msg, code = 'EPWA', cause) { super(msg); this.name = 'PWAError'; this.code = code; if (cause) this.cause = cause; } }
const pwaEm = new Emitter();
const pwaState = { reg: null, notified: null, reloading: false, installed: false, deferred: null, manifestURL: null, listening: false };
const swSupported = () => isBrowser && 'serviceWorker' in navigator && win.isSecureContext !== false;

/* ── fallback snackbar (used only when Orion.toast is not available) ──── */
let __snackHost = null;
/** pwaToast(message, { type, action: { label, onClick }, duration, title }) -> { close() } */
function pwaToast(msg, o = {}) {
  if (!isBrowser) return { close: noop };
  if (isFn(O.toast)) {
    try { const h0 = O.toast(msg, { type: o.type || 'info', title: o.title, duration: o.duration ?? 5000, action: o.action, actions: o.action ? [o.action] : undefined }); return { close: () => { try { (h0?.close || h0?.dismiss || noop).call(h0); } catch {} }, handle: h0 }; } catch (e) { console.error(e); }
  }
  if (!__snackHost || !__snackHost.isConnected) { __snackHost = h('div', { class: 'o-pwa-snacks', 'aria-live': 'polite' }); doc.body.appendChild(__snackHost); }
  const close = () => { clearTimeout(tm); animate(el, 'fadeOut', { duration: 150 }).then(() => el.remove()); };
  const btn = o.action ? h('button', { type: 'button', class: 'o-btn o-btn-sm o-pwa-snack-action' }, o.action.label) : null;
  const el = h('div', { class: cls('o-pwa-snack', o.type && 'is-' + o.type), role: o.type === 'danger' ? 'alert' : 'status' },
    h('div', { class: 'o-pwa-snack-text' }, o.title ? h('strong', o.title) : null, h('span', msg)), btn,
    h('button', { type: 'button', class: 'o-btn-close o-btn-close-sm', 'aria-label': t('common.close'), onClick: () => close() }));
  if (btn) btn.addEventListener('click', () => { close(); try { o.action.onClick?.(); } catch (e) { console.error(e); } });
  __snackHost.appendChild(el);
  animate(el, 'slideInUp', { duration: 200 });
  const tm = o.duration === 0 ? null : setTimeout(close, o.duration ?? 6000);
  return { close, el };
}

/* ── helpers ──────────────────────────────────────────────────────────── */
function pwaScriptURL() {
  if (__script && __script.src) return __script.src;
  if (!isBrowser) return null;
  const s = [...doc.scripts].reverse().find(x => /orion(\.esm)?(\.min)?\.js(\?|#|$)/i.test(x.src));
  return s ? s.src : null;
}
const pwaShort = u => { const x = new URL(u, doc.baseURI); return x.origin === location.origin ? x.pathname + x.search : x.href; };
function pwaRoute(r) {
  if (!r) return null;
  const out = { ...r };
  if (r.match instanceof RegExp) { out.match = undefined; out.regex = r.match.source; out.flags = r.match.flags; }
  else if (isStr(r.match) && /^\.\.?\//.test(r.match)) out.match = pwaShort(r.match);
  else if (isFn(r.match)) { console.warn('[Orion] pwa route: functions cannot be sent to the service worker; use a string or RegExp'); return null; }
  if (out.methods) out.methods = out.methods.map(m => String(m).toUpperCase());
  return JSON.parse(JSON.stringify(out));
}
function pwaListen() {
  if (pwaState.listening || !swSupported()) return;
  pwaState.listening = true;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    pwaEm.emit('controllerchange');
    emit(doc, 'o-sw-controlling', { controller: navigator.serviceWorker.controller });
    if (pwaState.reloading) { pwaState.reloading = false; location.reload(); }
  });
  navigator.serviceWorker.addEventListener('message', e => {
    const d = e.data;
    if (!isObj(d) || !isStr(d.type) || !d.type.startsWith('ORION_')) return;
    const name = d.type.replace(/^ORION_(SW_)?/, '').toLowerCase().replace(/_(\w)/g, (_, c) => c.toUpperCase());
    pwaEm.emit(name, d);
    pwaEm.emit('message', d);
    emit(doc, 'o-sw-message', d);
  });
}
function pwaWatch(reg, o) {
  const notify = () => {
    if (!reg.waiting || !navigator.serviceWorker.controller || pwaState.notified === reg.waiting) return;
    pwaState.notified = reg.waiting;
    const detail = { registration: reg, waiting: reg.waiting };
    pwaEm.emit('update', detail);
    emit(doc, 'o-sw-update', detail);
    if (o.toast !== false) pwaToast(t('pwa.updateAvailable'), { type: 'info', duration: 0, action: { label: t('pwa.reload'), onClick: () => O.pwa.applyUpdate() } });
  };
  notify();
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    if (!w) return;
    pwaEm.emit('installing', { registration: reg, worker: w });
    w.addEventListener('statechange', () => {
      if (w.state === 'installed') {
        if (navigator.serviceWorker.controller) notify();
        else { pwaEm.emit('ready', { registration: reg }); emit(doc, 'o-sw-ready', { registration: reg }); if (o.announceReady) announce(t('pwa.offlineReady')); }
      } else if (w.state === 'redundant') pwaEm.emit('redundant', { registration: reg, worker: w });
    });
  });
  clearInterval(pwaState.checkT);
  if (o.checkInterval > 0) pwaState.checkT = setInterval(() => { if (!doc.hidden && navigator.onLine !== false) reg.update().catch(noop); }, o.checkInterval);
}

/* ── install prompt capture (must be registered early) ───────────────── */
const pwaIsIOS = () => isBrowser && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const pwaIsSafari = () => isBrowser && /^((?!chrome|android|crios|fxios|edgios|opr).)*safari/i.test(navigator.userAgent);
if (isBrowser) {
  win.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pwaState.deferred = e; pwaEm.emit('installable', true); emit(doc, 'o-pwa-installable', {}); });
  win.addEventListener('appinstalled', () => { pwaState.deferred = null; pwaState.installed = true; pwaEm.emit('installed'); emit(doc, 'o-pwa-installed', {}); announce(t('pwa.installed')); });
}

O.pwa = {
  get supported() { return swSupported(); },
  get registration() { return pwaState.reg; },
  get controller() { return swSupported() ? navigator.serviceWorker.controller : null; },
  /** register(swUrl?, { scope, precache, routes, offlinePage, version, navigation, networkTimeout, toast = true, checkInterval }) -> registration | null */
  async register(swUrl, o = {}) {
    if (isObj(swUrl)) { o = swUrl; swUrl = null; }
    if (!swSupported()) { pwaEm.emit('unsupported'); return null; }
    pwaListen();
    const base = swUrl || o.swUrl || pwaScriptURL();
    if (!base) throw new PWAError('Cannot detect the Orion script URL: pass swUrl to Orion.pwa.register()', 'ESCRIPT');
    const url = new URL(base, doc.baseURI);
    const precache = [...new Set([...(o.precache || []), ...(o.offlinePage ? [o.offlinePage] : [])].map(pwaShort))];
    const routes = (o.routes || []).map(pwaRoute).filter(Boolean);
    url.searchParams.set('orion-sw', String(o.version || VERSION));
    if (o.offlinePage) url.searchParams.set('offline', pwaShort(o.offlinePage));
    if (routes.length) url.searchParams.set('routes', JSON.stringify(routes));
    if (o.navigation) url.searchParams.set('nav', o.navigation);
    if (o.networkTimeout) url.searchParams.set('timeout', String(o.networkTimeout));
    if (o.debug) url.searchParams.set('debug', '1');
    const viaMessage = precache.join(',').length > 1500;
    if (precache.length && !viaMessage) url.searchParams.set('precache', precache.join(','));
    let reg;
    try {
      reg = await navigator.serviceWorker.register(url.href, { scope: o.scope, type: /\.esm(\.min)?\.js/i.test(url.pathname) ? 'module' : 'classic', updateViaCache: o.updateViaCache || 'none' });
    } catch (e) {
      const hint = e?.name === 'SecurityError' ? ' (serve orion.js with the header "Service-Worker-Allowed: /" or register a /sw.js that imports it)' : '';
      throw new PWAError('Service worker registration failed: ' + (e?.message || e) + hint, e?.name === 'SecurityError' ? 'ESCOPE' : 'EREGISTER', e);
    }
    pwaState.reg = reg;
    pwaWatch(reg, o);
    if (viaMessage) { const w = reg.installing || reg.waiting || reg.active; w?.postMessage({ type: 'ORION_SW_CONFIG', precache }); }
    pwaEm.emit('registered', { registration: reg });
    emit(doc, 'o-sw-registered', { registration: reg });
    return reg;
  },
  /** Check the server for a new service worker version. */
  async update() { const reg = pwaState.reg || (swSupported() ? await navigator.serviceWorker.getRegistration() : null); if (!reg) return null; await reg.update(); return reg; },
  /** Activate the waiting worker (SKIP_WAITING) and reload once it controls the page. -> false when nothing is waiting */
  applyUpdate() { const w = pwaState.reg?.waiting; if (!w) return false; pwaState.reloading = true; w.postMessage({ type: 'SKIP_WAITING' }); return true; },
  get updateAvailable() { return !!(pwaState.reg?.waiting && navigator.serviceWorker?.controller); },
  async unregister() { const reg = pwaState.reg || (swSupported() ? await navigator.serviceWorker.getRegistration() : null); pwaState.reg = null; return reg ? reg.unregister() : false; },
  /** message(data, { timeout }) -> reply from the service worker (MessageChannel) */
  async message(data, { timeout = 5000 } = {}) {
    if (!swSupported()) throw new PWAError(t('pwa.unsupported'), 'EUNSUPPORTED');
    const reg = pwaState.reg || await navigator.serviceWorker.getRegistration();
    const target = navigator.serviceWorker.controller || reg?.active || reg?.waiting || reg?.installing;
    if (!target) throw new PWAError('No active service worker', 'ENOWORKER');
    return new Promise((resolve, reject) => {
      const ch = new MessageChannel();
      const tm = setTimeout(() => { ch.port1.close(); reject(new PWAError('Service worker did not reply in time', 'ETIMEOUT')); }, timeout);
      ch.port1.onmessage = e => { clearTimeout(tm); ch.port1.close(); if (isObj(e.data) && e.data.error) reject(new PWAError(e.data.error, 'ESW')); else resolve(e.data); };
      target.postMessage(data, [ch.port2]);
    });
  },
  /** Replay the service-worker mutation queue now -> { sent, remaining } */
  sync: () => O.pwa.message({ type: 'REPLAY' }),
  queueSize: () => O.pwa.message({ type: 'QUEUE_SIZE' }).then(r => r?.size ?? 0),
  clearCaches: () => O.pwa.message({ type: 'CLEAR_CACHES' }),
  on: (n, f) => pwaEm.on(n, f),
  off: (n, f) => pwaEm.off(n, f),
  onUpdate: fn => pwaEm.on('update', fn),
  /* install */
  get canInstall() { return !!pwaState.deferred; },
  get installMode() { return O.pwa.isStandalone || pwaState.installed ? 'installed' : pwaState.deferred ? 'prompt' : pwaIsIOS() && pwaIsSafari() ? 'ios' : 'unavailable'; },
  get isStandalone() {
    if (!isBrowser) return false;
    const mq = q => { try { return win.matchMedia(q).matches; } catch { return false; } };
    return mq('(display-mode: standalone)') || mq('(display-mode: fullscreen)') || mq('(display-mode: minimal-ui)') || mq('(display-mode: window-controls-overlay)') || navigator.standalone === true;
  },
  get isIOS() { return pwaIsIOS(); },
  /** install() -> { outcome: 'accepted' | 'dismissed' | 'ios' | 'unavailable', platform? } */
  async install() {
    const e = pwaState.deferred;
    if (e) {
      pwaState.deferred = null;
      try { await e.prompt(); const c = await e.userChoice; pwaEm.emit('choice', c); return { outcome: c.outcome, platform: c.platform }; }
      catch (err) { return { outcome: 'unavailable', error: err }; }
    }
    if (pwaIsIOS()) return { outcome: 'ios' };
    return { outcome: 'unavailable' };
  },
  /** manifest({ name, short_name, icons, theme_color, background_color, display, start_url, scope, ... }) -> { link, manifest, url } */
  manifest(m = {}) {
    if (!isBrowser) return null;
    const abs = u => new URL(u, doc.baseURI).href;
    const { shortName, startUrl, themeColor, backgroundColor, ...rest } = m;
    const name = m.name || doc.title || 'App';
    const tc = m.theme_color || themeColor || theme.get('primary') || '#4f46e5';
    const bg = m.background_color || backgroundColor || theme.get('bg') || '#ffffff';
    let icons = (m.icons || []).map(i => ({ ...i, src: abs(i.src) }));
    if (!icons.length) {
      const letter = esc(String(m.short_name || shortName || name).trim()[0] || 'A').toUpperCase();
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${esc(tc)}"/><text x="50%" y="54%" font-family="system-ui,sans-serif" font-size="300" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="middle">${letter}</text></svg>`;
      icons = [{ src: 'data:image/svg+xml,' + encodeURIComponent(svg), sizes: 'any', type: 'image/svg+xml', purpose: 'any' }];
    }
    const man = { ...rest, name, short_name: m.short_name || shortName || name.slice(0, 12), start_url: abs(m.start_url || startUrl || './'), scope: abs(m.scope || './'), display: m.display || 'standalone', theme_color: tc, background_color: bg, icons };
    if (pwaState.manifestURL) URL.revokeObjectURL(pwaState.manifestURL);
    const url = URL.createObjectURL(new Blob([JSON.stringify(man)], { type: 'application/manifest+json' }));
    pwaState.manifestURL = url;
    let link = doc.querySelector('link[rel="manifest"]');
    if (!link) { link = h('link', { rel: 'manifest' }); doc.head.appendChild(link); }
    link.href = url;
    link.setAttribute('data-orion', '');
    let meta = doc.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = h('meta', { name: 'theme-color' }); doc.head.appendChild(meta); }
    meta.content = tc;
    return { link, manifest: man, url };
  },
  toast: pwaToast,
  PWAError,
};
O.PWAError = PWAError;
