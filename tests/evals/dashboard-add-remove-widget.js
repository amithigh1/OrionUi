(async () => {
  const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};

  const dash = document.getElementById('dash-demo');
  dash.editable = true;
  await raf();
  const countBefore = dash.widgets.length;

  /* ---- open the catalog via the toolbar action button (data-o-action="dashboard") ---- */
  const catalogBtn = document.querySelector('[data-o-action="dashboard"][data-o-value="catalog"][data-o-target="#dash-demo"]');
  catalogBtn.click();
  await raf();
  out.catalogOpenedViaAction = dash.catalogOpen;

  const search = document.querySelector('.o-dash-catalog-search input');
  search.value = 'notes';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(30);
  const items = [...document.querySelectorAll('.o-dash-catalog-item')];
  out.searchFiltered = items.length === 1 && items[0].dataset.type === 'notes';

  /* ---- pick it: addWidget() runs, the catalog re-renders with a count badge, panel stays open ---- */
  items[0].click();
  await raf(); await sleep(30);
  out.widgetAddedFromCatalog = dash.widgets.length === countBefore + 1;
  const added = dash.getWidget('notes-1');
  out.addedHasExpectedId = !!added;
  out.addedIsRemovableCollapsible = !!added && added.removable && added.collapsible;
  out.catalogStaysOpenAfterPick = dash.catalogOpen;
  out.catalogShowsCount = !!document.querySelector('.o-dash-catalog-item[data-type="notes"] .o-dash-catalog-count');
  out.layoutValidAfterAdd = Orion.gridLayout.valid(dash.getLayout(), dash.cols);

  document.querySelector('.o-dash-catalog .o-btn-close').click();
  await raf();
  out.catalogClosed = !dash.catalogOpen;

  /* ---- programmatic add: addWidget(type, opts) with an explicit spot. y=50 is comfortably
         below every existing widget (and the locked full-width "kpis" header only occupies
         row 0-1) so the requested spot is actually free and the new widget is pinned there
         by gridCompact rather than floated up into whatever gap it finds. ---- */
  const countBefore2 = dash.widgets.length;
  const chart = dash.addWidget('chart', { x: 0, y: 50, focus: false });
  out.programmaticAddReturnsElement = chart instanceof HTMLElement && chart.localName === 'o-widget';
  out.programmaticAddIncrementsCount = dash.widgets.length === countBefore2 + 1;
  const chartLayout = dash.getLayout().find(i => i.id === chart.id);
  out.programmaticAddHonouredSpot = !!chartLayout && chartLayout.x === 0 && chartLayout.y === 50;

  let addEventDetail = null;
  dash.addEventListener('o-widget-add', e => (addEventDetail = e.detail), { once: true });
  const added3 = dash.addWidget('kpi');
  await sleep(10);
  out.widgetAddEventFired = !!addEventDetail && addEventDetail.id === added3.id;

  /* ---- remove: cancel via the inline confirm leaves it in place ---- */
  const p1 = dash.removeWidget('sources', { confirm: true });
  await raf();
  const confirmBox = document.querySelector('#sources .o-widget-confirm');
  out.confirmDialogShown = !!confirmBox;
  confirmBox.querySelector('button[data-v="0"]').click(); // Cancel
  const cancelResult = await p1;
  out.cancelledRemoveReturnsFalse = cancelResult === false;
  out.widgetStillPresentAfterCancel = !!dash.getWidget('sources');

  /* ---- remove: confirm removes it, fires events, focus moves on ---- */
  let removeEventDetail = null;
  dash.addEventListener('o-widget-remove', e => (removeEventDetail = e.detail), { once: true });
  const countBefore3 = dash.widgets.length;
  const p2 = dash.removeWidget('sources', { confirm: true });
  await raf();
  document.querySelector('#sources .o-widget-confirm button[data-v="1"]').click(); // Remove
  const okResult = await p2;
  out.confirmedRemoveReturnsTrue = okResult === true;
  out.widgetGoneAfterConfirm = !dash.getWidget('sources');
  out.countDecrementedAfterRemove = dash.widgets.length === countBefore3 - 1;
  out.removeEventFired = !!removeEventDetail && removeEventDetail.id === 'sources';
  out.layoutValidAfterRemove = Orion.gridLayout.valid(dash.getLayout(), dash.cols);

  /* ---- remove without confirm: instant ---- */
  const removedNow = await dash.removeWidget(chart.id, { confirm: false });
  out.removeWithoutConfirmIsInstant = removedNow === true && !dash.getWidget(chart.id);

  /* ---- reset(): forgets every add/remove above and restores the original six widgets ---- */
  dash.reset();
  await raf();
  const ORIGINAL = ['kpis', 'revenue', 'sources', 'activity', 'table', 'todo'];
  out.resetRestoresOriginalCount = dash.widgets.length === ORIGINAL.length;
  out.resetRestoresOriginalIds = ORIGINAL.every(id => !!dash.getWidget(id));
  out.resetDropsCatalogAdditions = !dash.getWidget('notes-1') && !dash.getWidget('kpi-1');

  out.ok = out.catalogOpenedViaAction && out.searchFiltered && out.widgetAddedFromCatalog && out.addedHasExpectedId
    && out.addedIsRemovableCollapsible && out.catalogStaysOpenAfterPick && out.catalogShowsCount && out.layoutValidAfterAdd
    && out.catalogClosed && out.programmaticAddReturnsElement && out.programmaticAddIncrementsCount
    && out.programmaticAddHonouredSpot && out.widgetAddEventFired && out.confirmDialogShown
    && out.cancelledRemoveReturnsFalse && out.widgetStillPresentAfterCancel && out.confirmedRemoveReturnsTrue
    && out.widgetGoneAfterConfirm && out.countDecrementedAfterRemove && out.removeEventFired && out.layoutValidAfterRemove
    && out.removeWithoutConfirmIsInstant && out.resetRestoresOriginalCount && out.resetRestoresOriginalIds && out.resetDropsCatalogAdditions;
  return out;
})()
