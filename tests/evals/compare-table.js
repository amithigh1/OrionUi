(async () => {
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const r = {};

  const el = document.createElement('o-compare-table');
  el.items = [
    { id: 1, title: 'A', price: 10, sameField: 'X', bestHigh: 5 },
    { id: 2, title: 'B', price: 20, sameField: 'X', bestHigh: 8 },
    { id: 3, title: 'C', price: 15, sameField: 'X', bestHigh: 3 },
  ];
  el.attributes = [
    { key: 'price', label: 'Price', numeric: true, best: 'low' },
    { key: 'sameField', label: 'Same' },
    { key: 'bestHigh', label: 'High wins', numeric: true, best: 'high' },
  ];
  document.body.appendChild(el);
  await sleep(50);

  const rowFor = key => el.querySelector(`tr[data-key="${key}"]`);
  const cellsFor = key => [...rowFor(key).querySelectorAll('td')];

  r.threeColumns = el.querySelectorAll('thead th.o-compare-table-col').length === 3;
  r.priceRowNotHiddenByDefault = !rowFor('price').hidden;
  r.sameFieldRowNotHiddenByDefault = !rowFor('sameField').hidden;
  r.priceBestIsFirstCell = cellsFor('price')[0].classList.contains('is-best') && !cellsFor('price')[1].classList.contains('is-best');
  r.bestHighBestIsSecondCell = cellsFor('bestHigh')[1].classList.contains('is-best');
  r.stickyAttrCellPresent = !!rowFor('price').querySelector('.o-compare-table-attr');

  // ── highlight differences ──
  el.querySelector('.o-compare-table-toolbar input[type=checkbox]').click();
  await sleep(50);
  r.showDiffClassAdded = el.classList.contains('show-diff');
  r.priceRowFlaggedDiff = rowFor('price').classList.contains('is-diff');
  r.sameFieldRowNotFlaggedDiff = !rowFor('sameField').classList.contains('is-diff');

  // ── only show differences ──
  el.querySelectorAll('.o-compare-table-toolbar input[type=checkbox]')[1].click();
  await sleep(50);
  r.sameFieldHiddenWhenOnlyDiff = rowFor('sameField').hidden;
  r.priceStillVisibleWhenOnlyDiff = !rowFor('price').hidden;

  // reset toggles
  el.highlightDiff = false; el.onlyDiff = false;
  await sleep(50);

  // ── column removal ──
  let removeDetail = null;
  el.addEventListener('o-remove', e => { removeDetail = e.detail; });
  const removeButtons = el.querySelectorAll('.o-compare-table-remove');
  r.removeButtonCount = removeButtons.length;
  removeButtons[2].click(); // remove item "C" (id 3)
  await sleep(50);
  r.itemsAfterRemove = el.items.length;
  r.removeEventFiredWithId = removeDetail && removeDetail.id === 3;
  r.columnsAfterRemove = el.querySelectorAll('thead th.o-compare-table-col').length;

  el.remove();

  r.ok = r.threeColumns && r.priceRowNotHiddenByDefault && r.sameFieldRowNotHiddenByDefault
    && r.priceBestIsFirstCell && r.bestHighBestIsSecondCell && r.stickyAttrCellPresent
    && r.showDiffClassAdded && r.priceRowFlaggedDiff && r.sameFieldRowNotFlaggedDiff
    && r.sameFieldHiddenWhenOnlyDiff && r.priceStillVisibleWhenOnlyDiff
    && r.removeButtonCount === 3 && r.itemsAfterRemove === 2 && r.removeEventFiredWithId && r.columnsAfterRemove === 2;
  return r;
})()
