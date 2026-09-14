(async () => {
  // Builds its own minimal <o-virtual-list> (fixed item height, no groups) rather than reusing
  // a docs demo, so the pixel math is exact and the assertion is unambiguous: after
  // prependItems(), the item that was at the TOP of the viewport before the prepend must still
  // be the item at the top of the viewport afterward — only its index shifts, never what the
  // user sees. This is the scroll-anchor behavior documented on OVirtualList.prependItems().
  const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};

  const ITEM_H = 30, VIEWPORT_H = 300, N = 1000, PREPEND = 50;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;top:0;inset-inline-start:0;z-index:99999;background:#fff';
  document.body.appendChild(host);
  const list = document.createElement('o-virtual-list');
  list.style.cssText = `block-size:${VIEWPORT_H}px;inline-size:220px`;
  list.itemHeight = ITEM_H;
  list.keyFn = item => item.id;
  list.renderItem = item => { const el = document.createElement('div'); el.textContent = String(item.id); return el; };
  host.appendChild(list);
  await raf();
  list.items = Array.from({ length: N }, (_, i) => ({ id: i }));
  list.flush();

  /* ---- scroll to a round offset so the top visible item is unambiguous (item 100 at y=3000) ---- */
  const TOP_INDEX_BEFORE = 100;
  list.scrollTop = TOP_INDEX_BEFORE * ITEM_H;
  await raf(); await sleep(60); // let the (rafThrottled) scroll handler lay out the new range
  out.scrollAppliedBeforePrepend = list.scrollTop === TOP_INDEX_BEFORE * ITEM_H;

  const topIdBefore = list.items[Math.floor(list.scrollTop / ITEM_H)].id;
  out.topIdBeforeIsExpected = topIdBefore === TOP_INDEX_BEFORE;
  const domRowBefore = [...list.querySelectorAll('.o-vlist-row')].find(el => +el.dataset.index === TOP_INDEX_BEFORE && el.style.display !== 'none');
  out.topRowRenderedBefore = !!domRowBefore && domRowBefore.textContent.trim() === String(topIdBefore);

  /* ---- prepend PREPEND older items ---- */
  const newItems = Array.from({ length: PREPEND }, (_, i) => ({ id: 'new-' + i }));
  const scrollBefore = list.scrollTop;
  list.prependItems(newItems);
  // prependItems() calls this.flush() internally and corrects scrollTop synchronously —
  // no waiting needed to observe the corrected position.
  out.itemCountGrew = list.items.length === N + PREPEND;
  out.scrollShiftedByExactlyPrependedHeight = list.scrollTop === scrollBefore + PREPEND * ITEM_H;

  const topIndexAfter = Math.floor(list.scrollTop / ITEM_H);
  const topIdAfter = list.items[topIndexAfter].id;
  out.topVisibleItemIdentityUnchanged = topIdAfter === topIdBefore; // <<< the actual anchor assertion
  out.topRowIsNowAtShiftedIndex = topIndexAfter === TOP_INDEX_BEFORE + PREPEND;

  await raf(); await sleep(60);
  const domRowAfter = [...list.querySelectorAll('.o-vlist-row')]
    .find(el => +el.dataset.index === topIndexAfter && el.style.display !== 'none');
  out.topRowRenderedAfterMatchesSameItem = !!domRowAfter && domRowAfter.textContent.trim() === String(topIdBefore);

  /* ---- appendItems() (down-direction) does NOT touch scroll position at all ---- */
  const scrollBeforeAppend = list.scrollTop;
  list.appendItems([{ id: 'tail-1' }, { id: 'tail-2' }]);
  out.appendDidNotMoveScroll = list.scrollTop === scrollBeforeAppend;
  out.appendGrewItems = list.items.length === N + PREPEND + 2;

  document.body.removeChild(host);

  out.ok = out.scrollAppliedBeforePrepend && out.topIdBeforeIsExpected && out.topRowRenderedBefore
    && out.itemCountGrew && out.scrollShiftedByExactlyPrependedHeight && out.topVisibleItemIdentityUnchanged
    && out.topRowIsNowAtShiftedIndex && out.topRowRenderedAfterMatchesSameItem
    && out.appendDidNotMoveScroll && out.appendGrewItems;
  return out;
})()
