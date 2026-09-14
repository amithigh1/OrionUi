(async () => {
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const O = window.Orion;
  const r = {};

  /* ---- renders the EXACT item shape templates/dashboard.html feeds it ---- */
  const feed = document.createElement('o-activity-feed');
  feed.setAttribute('compact', '');
  document.body.append(feed);
  const now = Date.now();
  feed.items = [
    { id: 1, actor: { name: 'Ben Tan' }, verb: 'shipped order', target: { label: '#10236' }, type: 'status', icon: 'truck', color: 'info', createdAt: now - 6e5 },
    { id: 2, actor: { name: 'Aisha Rahman' }, verb: 'refunded', target: { label: '#10232' }, type: 'status', icon: 'rotate-ccw', color: 'danger', createdAt: now - 36e5 },
    { id: 3, actor: { name: 'Chen Wei' }, verb: 'added product', target: { label: 'Aurora desk lamp' }, type: 'upload', icon: 'package', color: 'success', createdAt: now - 9e6 },
    { id: 4, actor: { name: 'Grace Kim' }, verb: 'commented on', target: { label: 'Q3 report' }, type: 'comment', icon: 'message-square', color: 'primary', createdAt: now - 864e5 },
  ];
  await sleep(30);
  const rows = () => [...feed.querySelectorAll('.o-feed-item')];
  r.rowCount = rows().length;
  r.noConsoleGarbageIcons = !feed.textContent.includes('<svg') && !feed.textContent.includes('stroke-linecap');
  const first = rows()[0];
  r.firstRowHasAvatar = !!first.querySelector('.o-feed-avatar o-avatar, .o-feed-avatar .o-avatar');
  r.firstRowText = first.querySelector('.o-feed-content').textContent.replace(/\s+/g, ' ').trim();
  r.firstRowHasBoldActorAndTarget = first.querySelectorAll('.o-feed-content b').length === 2;
  r.firstRowIconColored = first.querySelector('.o-feed-icon').classList.contains('o-c-info');
  r.firstRowHasRelativeTime = !!first.querySelector('.o-feed-time').textContent.trim();
  r.firstRowHasDatetimeAttr = first.querySelector('.o-feed-time').hasAttribute('datetime');
  r.dayDividerCount = feed.querySelectorAll('.o-divider').length; // 3 items "today" (within 24h) + 1 "yesterday"

  /* ---- day grouping ---- */
  r.dayGroupingCorrect = r.dayDividerCount === 2;

  /* ---- type filter ---- */
  r.filterChipsAutoShown = !feed.querySelector('.o-feed-filters').hidden;
  const chip = [...feed.querySelectorAll('.o-feed-filters button')].find(b => b.dataset.value === 'status');
  chip.click();
  await sleep(20);
  r.filteredRowCount = rows().length;
  // the filter bar re-renders fresh buttons on every change (patchList isn't used there) — re-query.
  r.filterChipActive = feed.querySelector('.o-feed-filters button[data-value="status"]').classList.contains('is-active');
  const allChip = feed.querySelector('.o-feed-filters button[data-value=""]');
  allChip.click();
  await sleep(20);
  r.filterClearedRestoresAll = rows().length === 4;

  /* ---- o-select event ---- */
  let selected = null;
  feed.addEventListener('o-select', e => { selected = e.detail.item; });
  rows()[0].click();
  r.selectFired = selected && selected.id === 1;

  /* ---- setItems / clear / refresh ---- */
  feed.setItems([{ id: 99, actor: { name: 'X' }, verb: 'did', target: { label: 'Y' }, createdAt: now }]);
  await sleep(20);
  r.setItemsReplaces = rows().length === 1;
  feed.clear();
  await sleep(20);
  r.clearEmpties = rows().length === 0;
  r.emptyStateShown = !!feed.querySelector('.o-empty');

  /* ---- paged / infinite loading via source() ---- */
  const all = Array.from({ length: 25 }, (_, i) => ({ id: 'p' + i, actor: { name: 'User ' + i }, verb: 'did thing', target: { label: '#' + i }, createdAt: now - i * 1e5 }));
  const feed2 = document.createElement('o-activity-feed');
  feed2.pageSize = 10;
  document.body.append(feed2);
  feed2.source = async (page, { pageSize }) => {
    const start = (page - 1) * pageSize;
    return { items: all.slice(start, start + pageSize), hasMore: start + pageSize < all.length };
  };
  let loadEvents = 0;
  feed2.addEventListener('o-load', () => loadEvents++);
  await feed2.load(1);
  r.firstPageLoaded = feed2.items.length === 10;
  r.moreButtonShown = !feed2.querySelector('.o-feed-more').hidden;
  await feed2.load();
  r.secondPageAppended = feed2.items.length === 20;
  await feed2.load();
  r.thirdPageAppended = feed2.items.length === 25;
  r.moreButtonHiddenAtEnd = feed2.querySelector('.o-feed-more').hidden;
  r.loadEventCount = loadEvents === 3;

  /* ---- auto-load via IntersectionObserver-driven sentinel (source assigned after connect) ---- */
  const feed3 = document.createElement('o-activity-feed');
  feed3.setAttribute('auto-load', '');
  // Tall enough that the empty state + sentinel start inside the visible area (IntersectionObserver
  // clips against the feed's own overflow, same as a real page) — so auto-load fires without a manual
  // scroll, exactly like the docs demo (max-height:20rem) it mirrors.
  feed3.style.maxHeight = '320px';
  feed3.style.overflow = 'auto';
  document.body.append(feed3);
  feed3.scrollIntoView(); // the sentinel must be within the (viewport-rooted) IntersectionObserver's view
  await sleep(20);
  feed3.source = async (page, { pageSize }) => {
    const start = (page - 1) * pageSize;
    return { items: all.slice(start, start + pageSize), hasMore: start + pageSize < all.length };
  };
  await sleep(400); // IntersectionObserver callback + async source()
  r.autoLoadFetchedWithoutManualCall = feed3.items.length > 0;

  r.ok = r.rowCount === 4 && r.noConsoleGarbageIcons && r.firstRowHasAvatar && r.firstRowHasBoldActorAndTarget
    && r.firstRowIconColored && r.firstRowHasRelativeTime && r.firstRowHasDatetimeAttr && r.dayGroupingCorrect
    && r.filterChipsAutoShown && r.filteredRowCount === 2 && r.filterChipActive && r.filterClearedRestoresAll && r.selectFired
    && r.setItemsReplaces && r.clearEmpties && r.emptyStateShown && r.firstPageLoaded && r.moreButtonShown
    && r.secondPageAppended && r.thirdPageAppended && r.moreButtonHiddenAtEnd && r.loadEventCount && r.autoLoadFetchedWithoutManualCall;
  return r;
})()
