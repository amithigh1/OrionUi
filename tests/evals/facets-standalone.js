(async () => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const r = {};

  const facets = $('#ff-facets');
  r.initialCount = $$('#ff-grid .ff-card').length;
  r.initialFilteredMatches = facets.filtered.length === r.initialCount;

  // ── checkbox group: category ──
  const audioBox = $('#ff-facets [data-key="category"] input[value="audio"]');
  r.audioHasCount = !!audioBox.closest('.o-facets-option').querySelector('.o-facets-count').textContent.trim();
  audioBox.click(); await sleep(50);
  r.countAfterCategory = $$('#ff-grid .ff-card').length;
  r.categoryAllAudio = r.countAfterCategory > 0 && r.countAfterCategory < r.initialCount;
  r.chipVisibleAfterCategory = !$('o-facet-chips').hidden && $$('o-facet-chips .o-chip').length === 1;

  // remove via chip
  $('o-facet-chips .o-chip-remove').click(); await sleep(50);
  r.countAfterChipRemove = $$('#ff-grid .ff-card').length;
  r.chipsHiddenAfterRemove = $('o-facet-chips').hidden;

  // ── radio group: price bucket ──
  const price250 = $('#ff-facets [data-key="price"] input[value="250-"]');
  price250.click(); await sleep(50);
  r.countAfterPrice = $$('#ff-grid .ff-card').length;
  r.allPricesOver250 = $$('#ff-grid .ff-price').every(e => +e.textContent.replace(/[^\d.]/g, '') >= 250);

  // clear all
  $('#ff-facets .o-facets-clear').click(); await sleep(50);
  r.countAfterClear = $$('#ff-grid .ff-card').length;
  r.valueEmptyAfterClear = Object.keys(facets.value).length === 0;

  // ── keyboard operability: native, focusable controls (no custom key handling needed) ──
  audioBox.focus();
  r.checkboxFocusable = document.activeElement === audioBox && audioBox.tabIndex !== -1;
  const groupTitleBtn = $('#ff-facets [data-key="category"] .o-facets-group-title');
  r.groupToggleIsButton = groupTitleBtn.tagName === 'BUTTON';
  groupTitleBtn.click(); await sleep(250); // collapse() animation
  r.groupCollapsed = groupTitleBtn.getAttribute('aria-expanded') === 'false';
  groupTitleBtn.click(); await sleep(250);
  r.groupReexpanded = groupTitleBtn.getAttribute('aria-expanded') === 'true';
  audioBox.checked && audioBox.click(); // leave clean (unlikely to still be checked, defensive)
  facets.clear(); await sleep(50);

  // ── range / date-range / search (separate demo) ──
  const f3log = () => $('#ff-log3').textContent;
  const searchInput = $('#ff-facets3 [data-key="title"] input[type=search]');
  searchInput.value = 'Widget';
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(300);
  r.searchLogged = f3log().includes('match');
  r.searchFiltered = $('#ff-facets3').filtered.every(it => it.title.includes('Widget'));

  searchInput.value = '';
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(300);

  const priceMin = $('#ff-facets3 [data-key="price"] input[data-r=min]');
  priceMin.value = '50';
  priceMin.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(300);
  r.rangeFiltered = $('#ff-facets3').filtered.every(it => it.price >= 50);
  priceMin.value = '';
  priceMin.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(300);

  const dateFrom = $('#ff-facets3 [data-key="created"] input[data-r=from]');
  dateFrom.value = '2026-02-01';
  dateFrom.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(300);
  r.dateFiltered = $('#ff-facets3').filtered.every(it => it.created >= '2026-02-01');

  r.ok = r.initialCount === 32 && r.initialFilteredMatches && r.audioHasCount
    && r.categoryAllAudio && r.chipVisibleAfterCategory && r.countAfterChipRemove === 32 && r.chipsHiddenAfterRemove
    && r.countAfterPrice > 0 && r.allPricesOver250 && r.countAfterClear === 32 && r.valueEmptyAfterClear
    && r.checkboxFocusable && r.groupToggleIsButton && r.groupCollapsed && r.groupReexpanded
    && r.searchLogged && r.searchFiltered && r.rangeFiltered && r.dateFiltered;
  return r;
})()
