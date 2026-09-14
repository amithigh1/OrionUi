(async () => {
  // data-o-infinite, tested self-contained (no dependency on the "http" package's mock server that
  // the docs page's own declarative demo uses) — stub window.fetch to serve 3 pages of a small
  // fake feed, then prove: page 1 loads immediately, the sentinel triggers page 2/3 as it scrolls
  // into view, and loading stops (no 4th fetch) once the last page reports no more data.
  const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};

  const PAGE_SIZE = 5, TOTAL_PAGES = 3;
  let fetchCalls = [];
  const origFetch = window.fetch;
  window.fetch = async (input) => {
    const url = new URL(String(input), location.href);
    const page = +url.searchParams.get('page') || 1;
    fetchCalls.push(page);
    await new Promise(r => setTimeout(r, 40));
    const hasMore = page < TOTAL_PAGES;
    const html = Array.from({ length: PAGE_SIZE }, (_, i) => `<div class="eval-item" data-page="${page}">Item ${page}-${i + 1}</div>`).join('');
    return new Response(html, { status: 200, headers: { 'X-Has-More': String(hasMore) } });
  };

  const box = document.createElement('div');
  box.id = 'eval-infinite-declarative';
  // deliberately shorter than a single page's rendered content (5 short divs already exceed
  // ~40px) so the "unscrollable page" auto-fill guard never kicks in — every page after the
  // first must be driven by an actual scroll-the-sentinel-into-view, which is what this test
  // wants to prove, not the auto-fill fallback.
  box.style.cssText = 'position:fixed;top:0;inset-inline-start:0;z-index:99999;background:#fff;height:36px;width:220px;overflow:auto';
  // Attributes are set on the DETACHED element, then it is connected once — matching the real
  // usage this behavior is for (a server-rendered page with the attributes already in the HTML).
  // Setting them on an element that is ALREADY connected instead — data-o-infinite-url then
  // data-o-infinite, each its own setAttribute() call — races the library's own attribute-change
  // MutationObserver against an explicit Orion.upgrade() call and double-initializes the
  // controller (destroy+reinit, so page 1 is fetched twice before the surviving instance settles).
  // That is a core (`behavior()`/`__bhInit`) timing subtlety, not something this eval needs to
  // exercise — see the report's "Proposed changes outside my scope".
  box.setAttribute('data-o-infinite-url', '/api/eval-feed?page={page}');
  // threshold=0: the default 300px rootMargin is meant for a normal, page-sized scroller, where
  // "near the edge" is a meaningful distinct state from "not near it". This eval's container is
  // deliberately tiny (36px) so a real user-style scroll-to-bottom is trivial to script — but that
  // also means a 300px margin would make the sentinel "intersecting" from the very first frame,
  // for any scroll position, forever (nothing to actually trigger on). 0px makes intersection
  // track the real, tiny viewport instead, exactly like scrolling a full-size list to its edge.
  box.setAttribute('data-o-infinite-threshold', '0');
  box.setAttribute('data-o-infinite', '');
  document.body.appendChild(box);
  Orion.upgrade(box);

  await sleep(200); // page 1 loads automatically (mode defaults to 'auto'), no scroll needed
  out.page1LoadedAutomatically = box.querySelectorAll('.eval-item[data-page="1"]').length === PAGE_SIZE;
  out.onlyOneFetchSoFar = fetchCalls.length === 1;

  const ctrl = box.__oInfinite;
  out.controllerExposed = !!ctrl && typeof ctrl.loadMore === 'function';
  out.statusHasLiveRegion = (() => { const s = box.querySelector('.o-infinite-status'); return !!s && s.getAttribute('role') === 'status' && s.getAttribute('aria-live') === 'polite'; })();

  /* ---- scrolling the sentinel into view (real IntersectionObserver, no direct loadMore() calls)
     triggers the next page ---- */
  box.scrollTop = box.scrollHeight;
  await sleep(300);
  out.page2LoadedViaSentinel = box.querySelectorAll('.eval-item[data-page="2"]').length === PAGE_SIZE;
  out.twoFetchesAfterFirstScroll = fetchCalls.length === 2;
  out.notDoneYetAfterPage2 = ctrl.done === false;

  box.scrollTop = box.scrollHeight;
  await sleep(300);
  out.page3LoadedViaSentinel = box.querySelectorAll('.eval-item[data-page="3"]').length === PAGE_SIZE;
  out.threeFetchesAfterSecondScroll = fetchCalls.length === 3;

  /* ---- end marker: done=true, status row shows the end state, and no further requests happen ---- */
  out.doneAfterLastPage = ctrl.done === true;
  const status = box.querySelector('.o-infinite-status');
  out.statusShowsEndState = status.classList.contains('is-end');
  out.endTextVisible = !status.hidden && /reached the end/i.test(status.textContent);

  box.scrollTop = 0; box.scrollTop = box.scrollHeight; // try to provoke more loading
  await sleep(300);
  out.noFourthFetchAfterEnd = fetchCalls.length === 3;
  out.totalItemsIsExactlyThreePages = box.querySelectorAll('.eval-item').length === PAGE_SIZE * TOTAL_PAGES;

  ctrl.destroy();
  document.body.removeChild(box);
  window.fetch = origFetch;

  out.ok = out.page1LoadedAutomatically && out.onlyOneFetchSoFar && out.controllerExposed && out.statusHasLiveRegion
    && out.page2LoadedViaSentinel && out.twoFetchesAfterFirstScroll && out.notDoneYetAfterPage2
    && out.page3LoadedViaSentinel && out.threeFetchesAfterSecondScroll && out.doneAfterLastPage
    && out.statusShowsEndState && out.endTextVisible && out.noFourthFetchAfterEnd && out.totalItemsIsExactlyThreePages;
  return out;
})()
