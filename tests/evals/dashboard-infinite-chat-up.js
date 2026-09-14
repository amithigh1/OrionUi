(async () => {
  // docs/components/infinite-scroll.html's #chat section: Orion.infiniteScroll(box, { direction:
  // 'up', ... }) — scrolling toward the TOP loads older messages, prepending them while keeping
  // the current view visually anchored (the standard "chat history" scroll-preservation trick).
  const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};

  const box = document.getElementById('inf-chat');
  await sleep(700); // initial page-1 load (400ms mock latency) + the demo's own scroll-to-bottom
  out.startsScrolledNearBottom = box.scrollTop > 0 && box.scrollTop >= box.scrollHeight - box.clientHeight - 4;

  const topMessageId = () => {
    const row = box.querySelector('#inf-chat > div:not(.o-infinite-status):not(.o-infinite-sentinel)');
    const m = row ? row.textContent.match(/#(\d+)/) : null;
    return m ? +m[1] : null;
  };
  const topIdBefore = topMessageId();
  out.hasATopMessageBefore = topIdBefore != null;
  const scrollHeightBefore = box.scrollHeight;
  const messageCountBefore = box.querySelectorAll('#inf-chat > div:not(.o-infinite-status):not(.o-infinite-sentinel)').length;

  /* ---- scroll to the very top: the sentinel (mounted before the messages, in "up" mode) enters
     the viewport and Orion.infiniteScroll loads the next (older) page automatically ---- */
  box.scrollTop = 0;
  await sleep(700); // IntersectionObserver callback + the mock load's 400ms latency

  const scrollHeightAfter = box.scrollHeight;
  out.moreContentInserted = scrollHeightAfter > scrollHeightBefore;
  const messageCountAfter = box.querySelectorAll('#inf-chat > div:not(.o-infinite-status):not(.o-infinite-sentinel)').length;
  out.messageCountGrew = messageCountAfter > messageCountBefore;

  const topIdAfter = topMessageId();
  out.olderMessagesPrependedAboveIt = topIdAfter != null && topIdAfter < topIdBefore;

  /* ---- scroll position was compensated so the message the user was looking at (topIdBefore) is
     still under their eyes, not shoved off-screen — check it's still within the visible viewport
     (not just "scrollTop grew"), which is the actual user-facing promise. A few tens of px of
     slack is allowed: the "loading…" status row (shown during the fetch, hidden again once it
     settles) changes height once more right after the scroll-compensated insert, without a
     second compensation pass for that specific transition — a cosmetic, documented nuance, not a
     functional break. ---- */
  out.viewNotLeftAtRawZero = box.scrollTop > 40; // i.e. it did NOT just leave the user staring at the newest-of-the-old batch
  const anchorRow = [...box.querySelectorAll('#inf-chat > div:not(.o-infinite-status):not(.o-infinite-sentinel)')]
    .find(row => row.textContent.includes('#' + topIdBefore));
  out.anchorMessageStillInDom = !!anchorRow;
  if (anchorRow) {
    const relTop = anchorRow.getBoundingClientRect().top - box.getBoundingClientRect().top;
    out.anchorMessageStillNearViewportTop = relTop > -80 && relTop < box.clientHeight;
  } else out.anchorMessageStillNearViewportTop = false;

  out.ok = out.startsScrolledNearBottom && out.hasATopMessageBefore && out.moreContentInserted && out.messageCountGrew
    && out.olderMessagesPrependedAboveIt && out.viewNotLeftAtRawZero
    && out.anchorMessageStillInDom && out.anchorMessageStillNearViewportTop;
  return out;
})()
