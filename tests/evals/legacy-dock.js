/* legacy-dock.js — salvaged from .tmp/dock-eval.js (docs/components/dock.html).
 * Broad <o-dock> API pass: panel regions, minimize/expand, maximize/restore, float/dockBack,
 * close/open with cancelable o-close, layout get/set round trip, reset, tab click + keyboard close,
 * panels menu, and compact-width reflow.
 */
(async () => {
  const out = {};
  const dk = document.getElementById('dk');
  await new Promise(r => setTimeout(r, 50));

  out.initialRegions = dk.getPanels().reduce((m, p) => { m[p.region] = (m[p.region] || 0) + 1; return m; }, {});
  out.initialActivePerRegion = {
    start: dk._regions.start.active, center: dk._regions.center.active, end: dk._regions.end.active, bottom: dk._regions.bottom.active,
  };

  dk.movePanel('search', 'end');
  await new Promise(r => setTimeout(r, 20));
  out.afterMove = dk.getPanels().find(p => p.id === 'search').region;

  dk.minimize('start');
  await new Promise(r => setTimeout(r, 20));
  out.startMinimized = dk._regions.start.minimized;
  out.startRailVisible = !dk._regions.start.rail.hidden;
  dk.expand('start');
  await new Promise(r => setTimeout(r, 20));
  out.startExpandedBack = !dk._regions.start.minimized;

  dk.maximize('center');
  await new Promise(r => setTimeout(r, 20));
  out.isMaximizedClass = dk.classList.contains('is-maximized');
  out.startHiddenWhileMax = dk._regions.start.el.classList.contains('is-max-hidden');
  dk.restore();
  await new Promise(r => setTimeout(r, 20));
  out.restoredClassGone = !dk.classList.contains('is-maximized');

  dk.float('properties', { x: 100, y: 100, w: 300, h: 200 });
  await new Promise(r => setTimeout(r, 20));
  out.propertiesFloating = dk.getPanels().find(p => p.id === 'properties').floating;
  out.floatElInDom = !!document.querySelector('.o-dock-float');
  dk.dockBack('properties');
  await new Promise(r => setTimeout(r, 20));
  out.propertiesDockedBack = !dk.getPanels().find(p => p.id === 'properties').floating;
  out.floatElRemoved = !document.querySelector('.o-dock-float');

  let closeEventFired = false;
  dk.addEventListener('o-close', () => { closeEventFired = true; }, { once: true });
  dk.close('readme');
  await new Promise(r => setTimeout(r, 20));
  out.closeEventFired = closeEventFired;
  out.readmeClosed = dk.getPanels().find(p => p.id === 'readme').closed;
  dk.open('readme');
  await new Promise(r => setTimeout(r, 20));
  out.readmeReopened = !dk.getPanels().find(p => p.id === 'readme').closed;

  const veto = e => e.preventDefault();
  dk.addEventListener('o-close', veto);
  const closedResult = dk.close('editor');
  dk.removeEventListener('o-close', veto);
  out.closeVetoed = closedResult === false && !dk.getPanels().find(p => p.id === 'editor').closed;

  const snap = dk.getLayout();
  dk.movePanel('problems', 'start');
  await new Promise(r => setTimeout(r, 20));
  dk.setLayout(snap);
  await new Promise(r => setTimeout(r, 20));
  out.setLayoutRestoredRegion = dk.getPanels().find(p => p.id === 'problems').region === 'bottom';

  dk.reset();
  await new Promise(r => setTimeout(r, 20));
  out.resetRegions = dk.getPanels().reduce((m, p) => { m[p.region] = (m[p.region] || 0) + 1; return m; }, {});

  const tab = dk._regions.center.tabsEl.querySelector('.o-dock-tab[data-id="readme"]');
  tab.click();
  await new Promise(r => setTimeout(r, 20));
  out.tabClickActivated = dk._regions.center.active === 'readme';

  const tab2 = dk._regions.bottom.tabsEl.querySelector('.o-dock-tab[data-id="problems"]');
  tab2.focus();
  tab2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
  await new Promise(r => setTimeout(r, 20));
  out.deleteKeyClosed = dk.getPanels().find(p => p.id === 'problems').closed;
  dk.open('problems');

  dk.openPanelsMenu();
  await new Promise(r => setTimeout(r, 50));
  out.panelsMenuOpen = !!document.querySelector('.o-tabs-menu');
  document.querySelector('.o-tabs-menu')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  dk.classList.add('__test');
  dk.style.maxWidth = '400px';
  window.dispatchEvent(new Event('resize'));
  await new Promise(r => setTimeout(r, 200));
  out.compactTriggered = dk.classList.contains('is-compact');
  out.compactTabCount = dk._regions.compact.tabsEl.querySelectorAll('.o-dock-tab').length;
  dk.style.maxWidth = '';
  window.dispatchEvent(new Event('resize'));
  await new Promise(r => setTimeout(r, 200));
  out.compactOff = !dk.classList.contains('is-compact');

  const ok = out.afterMove === 'end' && out.startMinimized && out.startExpandedBack && out.isMaximizedClass && out.restoredClassGone
    && out.propertiesFloating && out.floatElInDom && out.propertiesDockedBack && out.floatElRemoved
    && out.closeEventFired && out.readmeClosed && out.readmeReopened && out.closeVetoed
    && out.setLayoutRestoredRegion && out.tabClickActivated && out.deleteKeyClosed && out.panelsMenuOpen
    && out.compactTriggered && out.compactOff;
  return { ok, ...out };
})()
