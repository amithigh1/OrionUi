(async () => {
  // Smoke-tests docs/examples/analytics-workspace.html's own integration code (not the library
  // itself, which is covered elsewhere) — the four packages composed together in one realistic
  // page: KPI row, a 312-row <o-virtual-list>, Orion.infiniteScroll-driven activity log, and the
  // catalog-added "Live counter" widget's refresh hook driving <o-countup>.
  const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};

  const dash = document.getElementById('dash');
  out.startsNotEditable = !dash.editable; // no `editable` attribute in the markup

  document.querySelector('[data-o-value="edit"]').click();
  await raf();
  out.editButtonWorks = dash.editable === true;

  const teamList = document.getElementById('team-list');
  out.teamListHas312Items = teamList.items.length === 312;
  const rendered = [...teamList.querySelectorAll('.o-vlist-row')].filter(el => el.style.display !== 'none');
  out.teamListWindowed = rendered.length > 0 && rendered.length < 60;

  await sleep(500); // activity log's first page (mock 300ms latency)
  const activityList = document.getElementById('activity-list');
  out.activityLoadedFirstPage = activityList.querySelectorAll('.aw-log-row').length === 24;

  /* ---- add the catalog "Live counter" widget and exercise its refresh hook ---- */
  document.querySelector('[data-o-value="catalog"]').click();
  await raf();
  const counterItem = document.querySelector('.o-dash-catalog-item[data-type="counter"]');
  out.counterInCatalog = !!counterItem;
  counterItem.click();
  await raf(); await sleep(50);
  document.querySelector('.o-dash-catalog .o-btn-close').click();

  const counterWidget = dash.widgets.find(w => w.type === 'counter');
  out.counterWidgetAdded = !!counterWidget;
  const cu = counterWidget.querySelector('o-countup');
  out.counterHasTarget = !!cu && cu.to > 0;
  await sleep(1500); // let the initial count-up (from the renderer) settle
  const valueBefore = cu.querySelector('bdi').textContent.trim();

  const p = counterWidget.refresh();
  await sleep(1600); // waitUntil chains two 1200ms tweens
  await p;
  const valueAfter = cu.querySelector('bdi').textContent.trim();
  out.refreshChangedTheCounter = valueAfter !== valueBefore || cu.to !== +Orion.format.parseNumber(valueBefore);

  /* ---- persistence: reload-equivalent via getState/setState round trip ---- */
  const state = dash.getState();
  out.stateIncludesAddedCounter = state.added.some(a => a.type === 'counter');

  out.ok = out.startsNotEditable && out.editButtonWorks && out.teamListHas312Items && out.teamListWindowed
    && out.activityLoadedFirstPage && out.counterInCatalog && out.counterWidgetAdded && out.counterHasTarget
    && out.refreshChangedTheCounter && out.stateIncludesAddedCounter;
  return out;
})()
