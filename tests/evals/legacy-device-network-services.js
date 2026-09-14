/* legacy-device-network-services.js — salvaged from .tmp/svcb-remaining-eval.js (docs/components/device-network.html).
 * A grouped smoke test of several small always-on services: data-o-show/hide device queries,
 * Orion.network.simulate + <o-network-status>, Orion.idle, Orion.favorites, and the Orion.share fallback sheet.
 */
(async () => {
  const out = {};
  const el1 = document.createElement('div'); el1.setAttribute('data-o-show', 'mobile'); el1.textContent = 'mobile only'; document.body.appendChild(el1);
  const el2 = document.createElement('div'); el2.setAttribute('data-o-hide', 'mobile'); el2.textContent = 'not mobile'; document.body.appendChild(el2);
  Orion.upgrade(document.body);
  await new Promise(r => setTimeout(r, 20));
  out.deviceIs = { mobile: Orion.device.is('mobile'), desktop: Orion.device.is('desktop'), mdUp: Orion.device.is('md-up') };
  out.showHideClasses = { el1Hidden: el1.classList.contains('o-device-hidden'), el2Hidden: el2.classList.contains('o-device-hidden') };
  el1.remove(); el2.remove();

  let netChange = null;
  const offNet = Orion.network.onChange(e => netChange = e);
  Orion.network.simulate('offline');
  await new Promise(r => setTimeout(r, 20));
  out.networkSimOffline = { status: Orion.network.status, online: Orion.network.online, changeStatus: netChange?.status };
  Orion.network.simulate('slow');
  await new Promise(r => setTimeout(r, 20));
  out.networkSimSlow = Orion.network.status;
  Orion.network.simulate(null);
  offNet();

  const nstat = document.createElement('o-network-status');
  document.body.appendChild(nstat);
  await new Promise(r => setTimeout(r, 20));
  Orion.network.simulate('offline');
  await new Promise(r => setTimeout(r, 20));
  out.networkStatusEl = nstat.textContent.trim();
  Orion.network.simulate(null);
  nstat.remove();

  let idleFired = false, activeFired = false;
  const idleCtl = Orion.idle({ timeout: 60, crossTab: false, onIdle: () => idleFired = true, onActive: () => activeFired = true });
  await new Promise(r => setTimeout(r, 120));
  out.idleFiredAfterTimeout = idleFired;
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
  await new Promise(r => setTimeout(r, 20));
  out.activeFiredAfterActivity = activeFired;
  idleCtl.stop();

  Orion.userdata.setUser('test-user-1');
  Orion.favorites.clear();
  Orion.favorites.add({ id: 'f1', title: 'Fav one' });
  out.favoritesAfterAdd = Orion.favorites.list().length;
  out.favoritesToggleOff = Orion.favorites.toggle({ id: 'f1', title: 'Fav one' });
  out.favoritesAfterToggle = Orion.favorites.list().length;
  Orion.userdata.setUser('anon');

  const anchor = document.createElement('button'); document.body.appendChild(anchor);
  const sharePromise = Orion.share({ title: 'T', url: 'https://example.com', networks: ['copy', 'email'], native: false, anchor });
  await new Promise(r => setTimeout(r, 100));
  out.sharePanelOpen = !!document.querySelector('.o-share-panel');
  // 'copy' is intentionally NOT one of the .o-share-net tiles (src/components/share/share.js line ~88:
  // `nets.filter(n => n !== 'copy')`) — it renders as its own separate "copy link" input+button instead.
  out.shareNetworksRendered = [...document.querySelectorAll('.o-share-net')].map(b => b.dataset.net);
  out.shareCopyLinkRendered = !!document.querySelector('.o-share-copy');
  document.querySelector('.o-share-x')?.click();
  const shareResult = await sharePromise;
  out.shareCancelledOnClose = shareResult.cancelled;
  anchor.remove();

  const ok = out.deviceIs.desktop === true && out.showHideClasses.el1Hidden === true && out.showHideClasses.el2Hidden === false
    && out.networkSimOffline.status === 'offline' && out.networkSimOffline.online === false && out.networkSimOffline.changeStatus === 'offline'
    && out.networkSimSlow === 'slow' && /offline/i.test(out.networkStatusEl)
    && out.idleFiredAfterTimeout && out.activeFiredAfterActivity
    && out.favoritesAfterAdd === 1 && out.favoritesToggleOff === false && out.favoritesAfterToggle === 0
    && out.sharePanelOpen && out.shareNetworksRendered.includes('email') && out.shareCopyLinkRendered && out.shareCancelledOnClose === true;
  return { ok, ...out };
})()
