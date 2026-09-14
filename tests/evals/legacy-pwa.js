/* legacy-pwa.js — salvaged from .tmp/pwa-sw-eval.js (docs/components/pwa.html).
 * Service-worker registration/activation, precache population, GET_VERSION message round trip,
 * cache-first runtime route, install-prompt capture, notification fallback, and offline queue replay order.
 * Kept over .tmp/pwa-cache-eval2.js (dropped — a narrower subset of the same runtime-cache assertion).
 *
 * FIX vs the original script: its cache-first route matched the made-up path "echo-cache-test", which
 * doesn't exist on the static docs server — the fetch 404'd and cache-first (correctly) never caches a
 * non-OK response, so `runtimeCachePopulated` was always false regardless of the library. This version
 * routes against a real static fixture (docs/fixtures/data/sample.json) so the cache-first strategy has
 * an actual 200 response to cache (src/sw/10-sw.js route.test() matches on `pathname.includes(m)`).
 */
(async () => {
  const out = {};
  out.secureContext = window.isSecureContext;
  out.swSupported = Orion.pwa.supported;

  const reg = await Orion.pwa.register({
    scope: './',
    precache: ['pwa.html'],
    routes: [{ match: 'sample.json', strategy: 'cache-first' }],
  });
  out.registered = !!reg;

  await new Promise(resolve => {
    if (navigator.serviceWorker.controller) return resolve(true);
    const t = setTimeout(() => resolve(false), 4000);
    navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(t); resolve(true); });
  });
  out.hasActiveWorker = !!reg.active || !!(await navigator.serviceWorker.ready.then(r => r.active).catch(() => null));
  await new Promise(r => setTimeout(r, 300));

  const cacheNames = await caches.keys();
  out.precacheName = cacheNames.find(n => n.startsWith('orion-sw-precache-'));
  const precacheHit = out.precacheName ? await (await caches.open(out.precacheName)).match(new URL('pwa.html', location.href).href) : null;
  out.precacheContainsPage = !!precacheHit;

  const info = await Orion.pwa.message({ type: 'GET_VERSION' });
  out.swVersionInfo = { hasVersion: !!info.version, cacheCount: info.caches?.length, precacheCount: info.precache?.length, routeCount: info.routes?.length };

  const url1 = new URL('../fixtures/data/sample.json?x=1', location.href).href;
  out.firstFetchStatus = await fetch(url1).then(r => r.status).catch(e => 'ERR:' + e.message);
  await new Promise(r => setTimeout(r, 100));
  out.runtimeCachePopulated = false;
  for (const n of await caches.keys()) {
    if (!n.startsWith('orion-sw-runtime-')) continue;
    const hit = await (await caches.open(n)).match(url1);
    if (hit) { out.runtimeCachePopulated = true; break; }
  }

  await Orion.pwa.unregister();
  for (const n of await caches.keys()) if (n.startsWith('orion-sw-')) await caches.delete(n);

  let captured = false;
  window.addEventListener('o-pwa-installable', () => captured = true);
  const beforeInstallEvent = new Event('beforeinstallprompt', { cancelable: true });
  beforeInstallEvent.prompt = () => Promise.resolve();
  beforeInstallEvent.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
  window.dispatchEvent(beforeInstallEvent);
  await new Promise(r => setTimeout(r, 20));
  out.installCaptured = captured;
  out.canInstallAfterCapture = Orion.pwa.canInstall;
  const installResult = await Orion.pwa.install();
  out.installOutcome = installResult.outcome;

  out.notifyPermission = Orion.notify.permission;
  const notifyResult = await Orion.notify('Test title', { body: 'Test body', fallback: 'toast' });
  out.notifyVia = notifyResult.via;

  Orion.http.mock([{ method: 'POST', url: '/api/ordered', response: req => ({ echoed: req.body.n }) }]);
  await Orion.offline.queue.clear();
  Orion.offline.simulate(true);
  const order = [];
  Orion.offline.queue.onReplay(entry => order.push(JSON.parse(JSON.stringify(entry.body || {})).n ?? null));
  for (let i = 1; i <= 5; i++) await Orion.offline.queue.add({ url: '/api/ordered', method: 'POST', body: { n: i } });
  out.queueSizeWhileOffline = Orion.offline.queue.size;
  Orion.offline.simulate(false);
  const result = await Orion.offline.sync();
  out.replaySentCount = result.sent;
  out.replayOrder = order;
  Orion.offline.simulate(null);

  const ok = out.swSupported && out.registered && out.hasActiveWorker
    && out.precacheContainsPage && out.swVersionInfo.hasVersion
    && out.runtimeCachePopulated
    && out.installCaptured && out.canInstallAfterCapture === true && out.installOutcome === 'accepted'
    && out.queueSizeWhileOffline === 5 && out.replaySentCount === 5
    && JSON.stringify(out.replayOrder) === JSON.stringify([1, 2, 3, 4, 5]);
  return { ok, ...out };
})()
