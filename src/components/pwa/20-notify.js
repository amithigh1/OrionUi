/* Orion.notify — browser notifications with permission flow and in-app toast fallback.
 *   await Orion.notify('Order #1024 shipped', { body: 'Arrives Friday', icon: '/icon.png', tag: 'order-1024', onClick: () => open(…) });
 *   Orion.notify.permission  // 'default' | 'granted' | 'denied' | 'unsupported'
 *   await Orion.notify.request()  // ask (call from a click handler: browsers require a user gesture)
 * Options: body icon badge image tag data requireInteraction silent renotify actions vibrate url onClick onClose
 *          request = true (ask when permission is 'default'), fallback = 'toast' | false, serviceWorker = 'auto' | true | false, type (toast)
 * Resolves { via: 'native' | 'sw' | 'toast' | 'none', notification?, close() }. SW notifications route clicks back through
 * postMessage, so onClick works for them too (Android Chrome only allows SW notifications).
 */
const notifyCbs = new Map();
const notifySupported = () => isBrowser && 'Notification' in win;
function notifyPermission() { return notifySupported() ? Notification.permission : 'unsupported'; }
function notifyRequest() {
  if (!notifySupported()) return Promise.resolve('unsupported');
  if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
  return new Promise(resolve => {
    try {
      const p = Notification.requestPermission(r => resolve(r));
      if (p && isFn(p.then)) p.then(resolve, () => resolve(Notification.permission));
    } catch { resolve(Notification.permission); }
  }).then(r => { pwaEm.emit('permission', r); return r; });
}
async function notifyReg(timeout = 3000) {
  if (!swSupported()) return null;
  const reg = pwaState.reg || await navigator.serviceWorker.getRegistration().catch(() => null);
  if (reg?.active) return reg;
  return Promise.race([navigator.serviceWorker.ready.catch(() => null), sleep(timeout).then(() => null)]);
}
const NOTIFY_KEYS = ['body', 'icon', 'badge', 'image', 'tag', 'requireInteraction', 'silent', 'renotify', 'actions', 'vibrate', 'timestamp', 'dir', 'lang'];

async function notify(title, o = {}) {
  const opts = { request: true, fallback: 'toast', serviceWorker: 'auto', ...o };
  let perm = notifyPermission();
  if (perm === 'default' && opts.request) perm = await notifyRequest();
  const fallback = () => {
    if (opts.fallback !== 'toast') return { via: 'none', close: noop };
    const hnd = pwaToast(opts.body ? `${opts.body}` : title, { title: opts.body ? title : undefined, type: opts.type || 'info', duration: opts.requireInteraction ? 0 : opts.duration, action: opts.onClick ? { label: opts.actionLabel || t('common.open'), onClick: () => opts.onClick({ action: '', fallback: true }, opts.data) } : null });
    return { via: 'toast', toast: hnd, close: () => hnd.close() };
  };
  if (perm !== 'granted') return fallback();
  const id = uid('notify');
  const nopts = {};
  for (const k of NOTIFY_KEYS) if (opts[k] !== undefined) nopts[k] = opts[k];
  if (!nopts.lang) nopts.lang = i18n.locale;
  if (!nopts.dir && isBrowser) nopts.dir = i18n.dir() === 'rtl' ? 'rtl' : 'auto';
  nopts.data = { __orion: id, url: opts.url || null, value: opts.data ?? null };
  notifyCbs.set(id, { onClick: opts.onClick, onClose: opts.onClose, data: opts.data });
  if (notifyCbs.size > 200) notifyCbs.delete(notifyCbs.keys().next().value);
  if (opts.serviceWorker !== true && !nopts.actions) {
    try {
      const n = new Notification(title, nopts);
      n.onclick = e => {
        try { win.focus(); } catch {}
        const cb = notifyCbs.get(id);
        try { cb?.onClick?.call(n, e, opts.data); } catch (err) { console.error(err); }
        if (!cb?.onClick && opts.url) location.assign(opts.url);
        n.close();
      };
      n.onclose = () => { const cb = notifyCbs.get(id); notifyCbs.delete(id); try { cb?.onClose?.(); } catch (err) { console.error(err); } };
      return { via: 'native', notification: n, close: () => n.close() };
    } catch { /* e.g. Android Chrome: "Illegal constructor" -> service worker */ }
  }
  if (opts.serviceWorker !== false) {
    const reg = await notifyReg();
    if (reg && isFn(reg.showNotification)) {
      try {
        await reg.showNotification(title, nopts);
        return { via: 'sw', close: async () => { try { for (const n of await reg.getNotifications(nopts.tag ? { tag: nopts.tag } : undefined)) if (n.data?.__orion === id) n.close(); } catch {} } };
      } catch (e) { console.warn('[Orion] showNotification failed', e); }
    }
  }
  notifyCbs.delete(id);
  return fallback();
}
// clicks on SW-shown notifications come back as messages from the worker
pwaEm.on('notificationClick', d => {
  const id = d?.data?.__orion;
  const cb = id && notifyCbs.get(id);
  if (cb?.onClick) { try { cb.onClick({ action: d.action || '', fromServiceWorker: true }, cb.data); } catch (e) { console.error(e); } }
});
pwaEm.on('notificationClose', d => { const id = d?.data?.__orion; const cb = id && notifyCbs.get(id); if (cb) { notifyCbs.delete(id); try { cb.onClose?.(); } catch (e) { console.error(e); } } });

Object.defineProperties(notify, {
  permission: { get: notifyPermission },
  supported: { get: notifySupported },
});
notify.request = notifyRequest;
O.notify = notify;
