(async () => {
  const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};

  const list = document.getElementById('ov-huge'); // 100,000 rows, item-height="auto", group-by="letter"
  await sleep(200);
  out.totalItems = list.items.length;
  out.hasHundredThousandItems = out.totalItems === 100000;

  const renderedRows = () => [...list.querySelectorAll('.o-vlist-row')].filter(el => el.style.display !== 'none');
  const rowsInitial = renderedRows();
  out.initialRenderedCount = rowsInitial.length;
  out.rendersOnlyASmallWindow = rowsInitial.length > 0 && rowsInitial.length < 200; // <<< 100,000

  /* ---- scrollToIndex jumps the window to the requested item ---- */
  let rangeChangeDetail = null;
  list.addEventListener('o-range-change', e => (rangeChangeDetail = e.detail), { once: true });
  list.scrollToIndex(50000, 'center');
  await sleep(150);
  out.rangeChangeFiredOnScrollTo = !!rangeChangeDetail;

  const rowsAfterScroll = renderedRows();
  out.stillOnlyASmallWindowAfterScroll = rowsAfterScroll.length > 0 && rowsAfterScroll.length < 200;
  const indexesNear50k = rowsAfterScroll.map(el => +el.dataset.index).filter(i => Number.isFinite(i));
  out.scrolledNearRequestedIndex = indexesNear50k.some(i => Math.abs(i - 50000) < 60);
  out.didNotRenderEverything = indexesNear50k.length < 200; // recycled pool, not one node per item

  /* ---- scrollToIndex(0) and the last index both work (edges) ---- */
  list.scrollToIndex(0, 'start');
  await sleep(150);
  out.scrolledToStart = renderedRows().some(el => +el.dataset.index === 0);
  list.scrollToIndex(99999, 'end');
  await sleep(150);
  const rowsAtEnd = renderedRows().map(el => +el.dataset.index).filter(Number.isFinite);
  out.scrolledToEnd = rowsAtEnd.some(i => i >= 99900);
  out.smallWindowAtEndToo = rowsAtEnd.length < 200;

  out.ok = out.hasHundredThousandItems && out.rendersOnlyASmallWindow && out.rangeChangeFiredOnScrollTo
    && out.stillOnlyASmallWindowAfterScroll && out.scrolledNearRequestedIndex && out.didNotRenderEverything
    && out.scrolledToStart && out.scrolledToEnd && out.smallWindowAtEndToo;
  return out;
})()
