(async () => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => !!el && el.getClientRects().length > 0;
  const r = {};
  r.tilesInitial = $$('#p-grid .p-card').length;
  $('#p-facets input[name=category][value=audio]').click(); await sleep(50);
  r.tilesAfterFacet = $$('#p-grid .p-card').length;
  r.chipShown = vis($('#p-chips .o-chip'));
  $('#p-chips .o-chip-remove').click(); await sleep(50);
  r.tilesAfterChipRemove = $$('#p-grid .p-card').length;
  $('#p-facets input[name=price][value="250-"]').click(); await sleep(50);
  r.tilesPrice250 = $$('#p-grid .p-card').length;
  r.allPricesOver250 = $$('#p-grid .p-price').every(e => +e.textContent.replace(/[^\d.]/g, '') >= 250);
  $('#p-clear').click(); await sleep(50);
  const q = $('#p-search'); q.value = 'aurora'; q.dispatchEvent(new Event('input', { bubbles: true })); await sleep(400);
  r.tilesSearch = $$('#p-grid .p-card').length;
  q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); await sleep(400);
  $('#p-view [data-view=table]').click(); await sleep(300);
  r.tableVisible = vis($('#p-table')) && !vis($('#p-grid'));
  r.tableRows = $$('#p-dt tbody tr').length;
  $('#p-view [data-view=grid]').click(); await sleep(100);
  $('#p-new').click(); await sleep(400);
  r.modalOpen = vis($('#p-form'));
  $('#p-save').click(); await sleep(300);
  r.validationErrors = $$('#p-form .o-error').filter(e => e.textContent.trim()).length;
  $('#pf-name').value = 'Test Speaker'; $('#pf-name').dispatchEvent(new Event('input', { bubbles: true }));
  $('#pf-sku').value = 'AUD-9999'; $('#pf-sku').dispatchEvent(new Event('input', { bubbles: true }));
  $('#pf-cat').value = 'audio'; $('#pf-price').value = 199; await sleep(100);
  $('#p-save').click(); await sleep(600);
  r.modalClosedAfterSave = !vis($('#p-form'));
  r.countAfterSave = $('#p-count').textContent.trim();
  r.toastShown = document.body.textContent.includes('added to the catalogue');
  r.ok = r.tilesInitial === 48 && r.tilesAfterFacet === 12 && r.chipShown && r.tilesAfterChipRemove === 48
    && r.tilesPrice250 > 0 && r.allPricesOver250 && r.tilesSearch === 4 && r.tableVisible && r.tableRows > 0
    && r.modalOpen && r.validationErrors >= 3 && r.modalClosedAfterSave && r.countAfterSave.startsWith('49 of 49') && r.toastShown;
  return r;
})()
