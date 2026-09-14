(async () => {
  const $ = s => document.querySelector(s);
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const r = {};

  const facets = $('#ff-facets2'), dt = $('#ff-table');
  dt.flush();
  r.initialTotal = dt.total;

  // ── facet toggle -> table row count changes ──
  const wearables = $('#ff-facets2 [data-key="category"] input[value="wearables"]');
  r.wearablesHasCount = !!wearables.closest('.o-facets-option').querySelector('.o-facets-count').textContent.trim();
  wearables.click();
  await sleep(50);
  dt.flush();
  r.totalAfterFacetToggle = dt.total;
  r.tableFiltersUpdated = Array.isArray(dt.filters.category) && dt.filters.category.includes('wearables');

  const chips = document.querySelectorAll('o-facet-chips')[1]; // second <o-facet-chips> on the page (bound demo)
  r.boundChipVisible = chips && !chips.hidden && chips.querySelectorAll('.o-chip').length === 1;

  wearables.click(); // uncheck
  await sleep(50); dt.flush();
  r.totalAfterUncheck = dt.total;

  // ── vice versa: the table's OWN filter API changes -> facets syncs ──
  dt.setFilter('category', ['computing']);
  await sleep(50); dt.flush();
  r.totalAfterTableFilter = dt.total;
  const computingBox = $('#ff-facets2 [data-key="category"] input[value="computing"]');
  r.facetsSyncedFromTable = computingBox.checked && facets.value.category?.includes('computing');
  r.boundChipVisibleAfterTableFilter = chips && !chips.hidden && chips.querySelectorAll('.o-chip').length === 1;

  // clean up via the table's own API too
  dt.setFilter('category', null);
  await sleep(50); dt.flush();
  r.totalAfterClear = dt.total;

  r.ok = r.initialTotal === 8 && r.wearablesHasCount && r.totalAfterFacetToggle === 2 && r.tableFiltersUpdated
    && r.boundChipVisible && r.totalAfterUncheck === 8
    && r.totalAfterTableFilter === 2 && r.facetsSyncedFromTable && r.boundChipVisibleAfterTableFilter
    && r.totalAfterClear === 8;
  return r;
})()
