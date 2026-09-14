/* ============================================================================
 * Orion.infiniteScroll(container, options) — sentinel-driven infinite loading for a plain
 * list/table body, or (when `container` is a virtual list) driven off its own
 * `o-near-end` / `o-near-start` events. Self-contained; no dependency on the dashboard,
 * stat or chart packages. Declarative `data-o-infinite` wiring lives in 10-behavior.js.
 * ========================================================================== */
i18n.add('en', {
  infinite: {
    loading: 'Loading more…', error: 'Couldn’t load more.', retry: 'Retry',
    end: 'You’ve reached the end.', loadMore: 'Load more', loaded: '{count} more loaded',
  },
});

const infEl = (tag, attrs, ...kids) => h(tag, attrs, ...kids);

/** Normalise whatever `load()` resolved with into { items, html, hasMore }. */
function infNormalize(res) {
  if (res == null) return { items: [], html: null, hasMore: false };
  if (isStr(res)) return { items: null, html: res, hasMore: !!res.trim() };
  if (Array.isArray(res)) return { items: res, html: null, hasMore: res.length > 0 };
  if (isObj(res)) {
    const items = res.items ?? null, html = res.html ?? null;
    const hasMore = res.hasMore ?? ((items ? items.length > 0 : false) || (html ? !!html.trim() : false));
    return { items, html, hasMore: !!hasMore };
  }
  return { items: null, html: null, hasMore: false };
}

/**
 * Orion.infiniteScroll(container, {
 *   load(page, { signal }) -> items[] | { items, hasMore } | html string | { html, hasMore },
 *   render(item, index) -> Node | string,   // required unless `load` returns html, or container is <o-virtual-list>
 *   threshold: 300,                          // px root-margin before the edge that triggers the next load
 *   mode: 'auto' | 'button',
 *   initialPage: 1,
 *   direction: 'down' | 'up',                // 'up': prepend + preserve scroll position (chat history)
 *   trusted: false,                          // skip sanitize() for html results
 *   showEnd: true,
 *   root: undefined,                         // IntersectionObserver root; auto-detected from overflow otherwise
 *   texts: {},
 * }) -> { reset(), loadMore(), destroy(), get loading(), get done(), get page() }
 */
O.infiniteScroll = function (container, options = {}) {
  const el = $(container);
  if (!el) throw new Error('Orion.infiniteScroll: container not found');
  const opts = options;
  const tt = k => (opts.texts && (opts.texts[k] ?? opts.texts['infinite.' + k])) || t('infinite.' + k);
  const isVList = el.localName === 'o-virtual-list';
  const up = opts.direction === 'up';
  const mode = opts.mode === 'button' ? 'button' : 'auto';

  let page = opts.initialPage ?? 1;
  let loading = false, done = false, destroyed = false, controller = null;
  const appended = []; // DOM nodes we own, for reset()

  /* ── status row (loading / error / end / load-more button) ───────────── */
  const status = infEl('div', { class: 'o-infinite-status', role: 'status', 'aria-live': 'polite', hidden: true });
  const sentinel = infEl('div', { class: 'o-infinite-sentinel', 'aria-hidden': 'true' });
  let unwatch = noop;

  function mountChrome() {
    if (isVList) {
      // the list virtualizes its own rows; our chrome lives as a sibling banner under/over it
      if (up) el.before(status); else el.after(status);
      return;
    }
    if (up) {
      el.insertBefore(status, el.firstChild);
      if (mode === 'auto') el.insertBefore(sentinel, status);
    } else {
      el.appendChild(status);
      if (mode === 'auto') el.insertBefore(sentinel, status);
    }
  }

  function paintStatus(state, err) {
    status.className = 'o-infinite-status is-' + state;
    status.hidden = false;
    if (state === 'idle') { status.hidden = true; status.replaceChildren(); }
    else if (state === 'loading') status.replaceChildren(infEl('span', { class: 'o-spinner o-spinner-sm', 'aria-hidden': 'true' }), infEl('span', {}, tt('loading')));
    else if (state === 'error') status.replaceChildren(
      iconEl('alert-triangle'), infEl('span', { class: 'o-infinite-error-text' }, (err && err.message) || tt('error')),
      infEl('button', { type: 'button', class: 'o-btn o-btn-sm o-btn-soft-danger', onClick: () => loadMore(true) }, tt('retry')));
    else if (state === 'end') { if (opts.showEnd === false) { status.hidden = true; status.replaceChildren(); } else status.replaceChildren(iconEl('check'), infEl('span', {}, tt('end'))); }
    else if (state === 'button') status.replaceChildren(infEl('button', { type: 'button', class: 'o-btn o-btn-soft-primary o-btn-block', onClick: () => loadMore(true) }, tt('loadMore')));
  }

  // Down mode: new items must land *before* the sentinel (not the status row) so the sentinel
  // stays pinned at the true bottom — otherwise, once buried under a page of new content, it
  // would never re-enter the viewport and loading would stop after page 2.
  function insertAnchor() { return up ? status.nextSibling : (mode === 'auto' ? sentinel : status); }
  // A `render` result is developer-supplied markup and is trusted (like every other render
  // callback in this library, e.g. <o-widget renderer>); the no-`render` fallback is raw item
  // data and is always escaped as plain text.
  function renderNode(item) {
    if (!isFn(opts.render)) return infEl('div', { class: 'o-infinite-item', text: String(item) });
    const out = opts.render(item);
    return out instanceof Node ? out : infEl('div', { class: 'o-infinite-item' }, raw(out));
  }

  /* ── inserting results ────────────────────────────────────────────────── */
  function appendToDOM(items, html) {
    const anchor = insertAnchor();
    // Prepending shifts everything below it down; the browser does not compensate scrollTop for
    // that on its own, so measure the height added and shift the scroll position by the same
    // amount — the standard "chat history" trick, keeping whatever the user is looking at still.
    const root = up ? (autoDetectRoot() || doc.scrollingElement || doc.documentElement) : null;
    const beforeScrollHeight = root ? root.scrollHeight : 0;
    const beforeScrollTop = root ? root.scrollTop : 0;
    if (html != null) {
      const safe = opts.trusted ? html : sanitize(html);
      const nodes = [...frag(safe).childNodes];
      appended.push(...nodes.filter(n => n.nodeType === 1));
      for (const n of nodes) el.insertBefore(n, anchor);
    } else if (items && items.length) {
      // `anchor` is a single fixed reference node, so inserting in forward order naturally keeps
      // each page's own item order intact whichever end of the list it lands on.
      for (const item of items) {
        const node = renderNode(item);
        appended.push(node);
        el.insertBefore(node, anchor);
      }
    }
    if (root) root.scrollTop = beforeScrollTop + (root.scrollHeight - beforeScrollHeight);
  }

  /** Merge new items into a bound <o-virtual-list>, preserving scroll position when prepending. */
  function appendToVList(items) {
    if (!items || !items.length) return;
    if (up && isFn(el.prependItems)) el.prependItems(items);
    else if (isFn(el.appendItems)) el.appendItems(items);
    else el.items = up ? [...items, ...toArr(el.items)] : [...toArr(el.items), ...items];
  }

  async function loadMore(isRetry) {
    if (destroyed || loading || (done && !isRetry)) return;
    if (!isFn(opts.load)) return;
    loading = true;
    paintStatus('loading');
    controller = new (win.AbortController || function () { this.signal = null; this.abort = noop; })();
    const thisPage = page;
    try {
      const raw = await opts.load(thisPage, { signal: controller.signal });
      if (destroyed) return;
      const { items, html, hasMore } = infNormalize(raw);
      page = thisPage + 1;
      if (isVList) appendToVList(items || []); else appendToDOM(items, html);
      done = !hasMore;
      loading = false;
      paintStatus(done ? 'end' : mode === 'button' ? 'button' : 'idle');
      const count = items ? items.length : (html ? 1 : 0);
      if (count) announce(tt('loaded').replace('{count}', count));
      emit(el, 'o-infinite-load', { page: thisPage, items, html, done });
      if (!done) fillIfNotScrollable();
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      loading = false;
      if (!destroyed) { paintStatus('error', e); emit(el, 'o-infinite-error', { page: thisPage, error: e }); }
    }
  }

  /**
   * A sentinel that never leaves the viewport (a page smaller than the container, or a container
   * taller than one page of results) only ever fires an IntersectionObserver callback once, since
   * there is no state *change* to re-observe — so auto mode would silently stop after one page.
   * Keep loading until the content actually overflows (or the data runs out).
   */
  function fillIfNotScrollable() {
    if (isVList || mode !== 'auto' || destroyed) return;
    nextFrame().then(() => {
      if (destroyed || loading || done) return;
      if (el.scrollHeight <= el.clientHeight + 1) loadMore();
    });
  }

  function autoDetectRoot() {
    if (opts.root !== undefined) return opts.root;
    if (isVList) return el;
    try { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY)) return el; } catch {}
    return null;
  }

  mountChrome();
  if (isVList) {
    const onNear = (e) => { if (!loading && !done) loadMore(); };
    on(el, up ? 'o-near-start' : 'o-near-end', onNear);
    unwatch = () => off_(el, up ? 'o-near-start' : 'o-near-end', onNear);
  } else if (mode === 'auto') {
    unwatch = observeVisible(sentinel, vis => { if (vis && !loading && !done) loadMore(); }, { root: autoDetectRoot(), rootMargin: (opts.threshold ?? 300) + 'px' });
  }
  function off_(target, type, fn) { target.removeEventListener(type, fn); }

  if (mode === 'button' && !isVList) paintStatus('button');
  // kick off the first page automatically in auto mode (button mode waits for the click)
  if (mode === 'auto') loadMore();

  return {
    get loading() { return loading; },
    get done() { return done; },
    get page() { return page; },
    loadMore: () => loadMore(true),
    reset(newInitialPage) {
      controller?.abort?.();
      for (const n of appended.splice(0)) n.remove();
      page = newInitialPage ?? (opts.initialPage ?? 1);
      done = false; loading = false;
      paintStatus(mode === 'button' ? 'button' : 'idle');
      if (mode === 'auto') loadMore();
    },
    destroy() {
      destroyed = true;
      controller?.abort?.();
      unwatch();
      status.remove(); sentinel.remove();
    },
  };
};
