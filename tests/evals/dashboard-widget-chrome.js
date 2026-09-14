(async () => {
  const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};

  /* ================= <o-widget> chrome, on the standalone "chrome-demo" widget ================= */
  const w = document.getElementById('chrome-demo');
  // This section is far down the docs page. autoPlace()'s onHidden guard (dashMenu uses it so a
  // floating menu doesn't linger over an anchor that scrolled off-screen) checks the anchor's
  // bounding rect on every resize-observer tick, so a menu opened on an off-screen button closes
  // itself again within a couple of frames — scroll it into view first, like a real user would.
  w.scrollIntoView({ block: 'center' });
  await raf();
  out.chromeWidgetInViewport = w.menuBtn.getBoundingClientRect().top < innerHeight;
  const openMenuAndClick = async (label) => {
    w.openMenu();
    await raf();
    const btn = [...document.querySelectorAll('.o-dash-menu-item')].find(b => b.textContent.trim() === label);
    btn.click();
    await raf();
  };

  /* ---- collapse / expand via the header menu ---- */
  out.startsExpanded = !w.collapsed;
  await openMenuAndClick('Collapse');
  out.collapsedAfterMenuClick = w.collapsed === true;
  out.bodyHiddenWhenCollapsed = getComputedStyle(w.querySelector('.o-widget-body')).display === 'none';
  let collapseDetail = null;
  w.addEventListener('o-widget-collapse', e => (collapseDetail = e.detail), { once: true });
  await openMenuAndClick('Expand');
  out.expandedAfterMenuClick = w.collapsed === false;
  out.collapseEventFiredOnExpand = !!collapseDetail && collapseDetail.collapsed === false;

  /* ---- before-widget-collapse is cancelable ---- */
  w.addEventListener('o-before-widget-collapse', e => e.preventDefault(), { once: true });
  w.toggleCollapse(true);
  out.collapseVetoedByBeforeEvent = w.collapsed === false;

  /* ---- refresh(): fires o-widget-refresh, the documented hook is detail.waitUntil(promise) ---- */
  const bodyBefore = document.getElementById('chrome-demo-body').textContent;
  await sleep(1100); // the demo's clock ticks every second; make sure a refresh actually changes it
  let refreshDetail = null, sawLoadingDuringRefresh = false;
  w.addEventListener('o-widget-refresh', e => (refreshDetail = e.detail), { once: true });
  const refreshPromise = w.refresh();
  await raf();
  sawLoadingDuringRefresh = w.loading === true && w.hasAttribute('aria-busy') && w.getAttribute('aria-busy') === 'true';
  await refreshPromise;
  out.refreshEventFired = !!refreshDetail && refreshDetail.id === 'chrome-demo' && typeof refreshDetail.waitUntil === 'function';
  out.loadingShownWhileWaitUntilPending = sawLoadingDuringRefresh;
  out.loadingClearedAfterRefresh = w.loading === false;
  out.bodyRepaintedByRefresh = document.getElementById('chrome-demo-body').textContent !== bodyBefore;

  /* ---- fullscreen (maximize) via the menu, then exit ---- */
  await openMenuAndClick('Full screen');
  out.maximizedClassAdded = w.classList.contains('is-maximized');
  await openMenuAndClick('Exit full screen');
  out.maximizedClassRemoved = !w.classList.contains('is-maximized');

  /* ---- remove: available from the menu even when the dashboard is NOT in "edit mode"
     (removable + not locked is enough — only "duplicate" requires editable). This demo's
     markup happens to start editable, so force it off first to actually exercise that path. ---- */
  w.dashboard.editable = false;
  await raf();
  out.dashboardNotInEditMode = !w.dashboard.editable;
  const removeVisible = w.menuItems().some(i => i.id === 'remove');
  out.removeOfferedWithoutEditMode = removeVisible;
  let removeDetail = null;
  w.dashboard.addEventListener('o-widget-remove', e => (removeDetail = e.detail), { once: true });
  w.openMenu();
  await raf();
  [...document.querySelectorAll('.o-dash-menu-item')].find(b => b.textContent.trim() === 'Remove').click();
  await raf();
  document.querySelector('#chrome-demo .o-widget-confirm button[data-v="1"]').click(); // confirm removal
  await sleep(50);
  out.widgetRemovedFromChromeDashboard = w.hidden === true;
  out.removeEventFiredFromMenu = !!removeDetail && removeDetail.id === 'chrome-demo';

  /* ================= the `dashboard` declarative action, on the first ("dash-demo") demo ================= */
  const dash = document.getElementById('dash-demo');
  const editBtn = document.querySelector('[data-o-action="dashboard"][data-o-value="edit"][data-o-target="#dash-demo"]');
  const catalogBtn = document.querySelector('[data-o-action="dashboard"][data-o-value="catalog"][data-o-target="#dash-demo"]');
  const compactBtn = document.querySelector('[data-o-action="dashboard"][data-o-value="compact"][data-o-target="#dash-demo"]');
  const resetBtn = document.querySelector('[data-o-action="dashboard"][data-o-value="reset"][data-o-target="#dash-demo"]');

  // the markup starts this dashboard already editable="" — the first click turns it OFF
  out.startsEditable = dash.editable === true;
  editBtn.click();
  await raf();
  out.actionEditTurnsOffEditable = dash.editable === false;
  out.actionEditReflectsAriaUnpressed = editBtn.getAttribute('aria-pressed') === 'false';
  editBtn.click();
  await raf();
  out.actionEditTurnsOnEditable = dash.editable === true;
  out.actionEditReflectsAriaPressed = editBtn.getAttribute('aria-pressed') === 'true';

  catalogBtn.click();
  await raf();
  out.actionCatalogOpens = dash.catalogOpen === true;
  catalogBtn.click();
  await raf();
  out.actionCatalogTogglesClosed = dash.catalogOpen === false;

  compactBtn.click();
  await raf();
  out.actionCompactRunsWithValidLayout = Orion.gridLayout.valid(dash.getLayout(), dash.cols);

  dash.addWidget('kpi'); // addWidget doesn't require edit mode — proves reset() undoes it regardless
  await raf();
  const countBeforeReset = dash.widgets.length;
  resetBtn.click();
  await raf();
  out.actionResetChangedWidgetCount = dash.widgets.length !== countBeforeReset;
  out.actionResetRestoresBaseWidgets = ['kpis', 'revenue', 'sources', 'activity', 'table', 'todo'].every(id => !!dash.getWidget(id));

  out.ok = out.chromeWidgetInViewport && out.startsExpanded && out.collapsedAfterMenuClick && out.bodyHiddenWhenCollapsed && out.expandedAfterMenuClick
    && out.collapseEventFiredOnExpand && out.collapseVetoedByBeforeEvent && out.refreshEventFired
    && out.loadingShownWhileWaitUntilPending && out.loadingClearedAfterRefresh && out.bodyRepaintedByRefresh
    && out.maximizedClassAdded && out.maximizedClassRemoved && out.dashboardNotInEditMode && out.removeOfferedWithoutEditMode
    && out.widgetRemovedFromChromeDashboard && out.removeEventFiredFromMenu
    && out.startsEditable && out.actionEditTurnsOffEditable && out.actionEditReflectsAriaUnpressed
    && out.actionEditTurnsOnEditable && out.actionEditReflectsAriaPressed && out.actionCatalogOpens && out.actionCatalogTogglesClosed
    && out.actionCompactRunsWithValidLayout && out.actionResetChangedWidgetCount && out.actionResetRestoresBaseWidgets;
  return out;
})()
