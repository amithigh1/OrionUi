(async () => {
  const results = {};
  const fail = [];
  const check = (name, cond) => { results[name] = !!cond; if (!cond) fail.push(name); };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  const el = document.createElement('o-global-search');
  el.scope = 'verify-' + Date.now();
  el.minChars = 1;
  el.debounce = 50;
  document.body.appendChild(el);
  el.flush?.();
  await wait(30);

  // Note: <o-global-search>'s results panel is portaled to <body> once opened (ARCHITECTURE.md §6),
  // so it is no longer a DOM descendant of `el` — query it through the element's own `panel`/`body`
  // instance properties (which stay valid regardless of where the node currently lives), not el.querySelector().

  // ── static (synchronous) provider ────────────────────────────────────
  const staticPages = ['Dashboard', 'Billing', 'Team members', 'API keys', 'Webhooks'];
  const staticProvider = {
    id: 'pages', title: 'Pages', icon: 'file', limit: 5,
    search: async (q) => staticPages.filter(p => p.toLowerCase().includes(q.toLowerCase())).map(p => ({ id: 'p-' + p, title: p, icon: 'file', onSelect: (item) => { window.__gs_selected = item; } })),
  };

  // ── async provider backed by a fixture file under docs/fixtures/ (no network) ──
  const seeAllEvents = [];
  const fixtureProvider = {
    id: 'customers', title: 'Customers', icon: 'user', limit: 5,
    search: async (q, { signal }) => {
      const res = await fetch('/docs/fixtures/search/customers.json', { signal });
      const rows = await res.json();
      const ql = q.toLowerCase();
      return rows.filter(r => r.title.toLowerCase().includes(ql)).map(r => ({
        id: r.id, title: r.title, subtitle: r.subtitle, meta: r.meta, icon: 'user',
        onSelect: (item) => { window.__gs_selected = item; },
      }));
    },
  };

  el.providers = [staticProvider, fixtureProvider];
  el.flush?.();

  // ── open + typing produces grouped results from both sources ────────
  el.focus();
  await wait(20);
  check('opensOnFocus', el.isOpen === true);

  el.setQuery('fresh');
  // right after setQuery, the debounced providers haven't resolved yet -> loading state visible
  check('loadingStateVisibleWhileProvidersRun', !!el.panel.querySelector('.o-gs-loading'));

  await wait(400); // > debounce (50ms) + fetch/json parse, comfortably settled
  let sectionTitles = [...el.panel.querySelectorAll('.o-gs-section-title')].map(t => t.textContent.trim());
  check('staticSourceGroupRendersNoMatch', !sectionTitles.some(t => t.startsWith('Pages'))); // "fresh" matches no static page
  check('fixtureSourceGroupRenders', sectionTitles.some(t => t.startsWith('Customers')));

  const customerRows = [...el.panel.querySelectorAll('.o-gs-item')].filter(r => /Fresh/.test(r.textContent));
  check('fixtureResultsRendered', customerRows.length >= 1);

  // "Fresh…" matches 7 of the 10 fixture rows; limit is 5 -> a trailing "See all 7 results" row
  let seeAllRow = el.panel.querySelector('.o-gs-seeall');
  check('seeAllRowAppearsWhenOverLimit', !!seeAllRow && /7/.test(seeAllRow.textContent));

  // ── highlight of matches ─────────────────────────────────────────────
  const markEl = el.panel.querySelector('.o-gs-item .o-mark');
  check('matchIsHighlighted', !!markEl && /fresh/i.test(markEl.textContent));

  // ── static source also matches on its own query ──────────────────────
  el.setQuery('billing');
  await wait(400);
  sectionTitles = [...el.panel.querySelectorAll('.o-gs-section-title')].map(t => t.textContent.trim());
  check('staticSourceGroupRendersOnMatch', sectionTitles.some(t => t.startsWith('Pages')));
  const billingRow = [...el.panel.querySelectorAll('.o-gs-item')].find(r => /Billing/.test(r.textContent));
  check('staticResultRendered', !!billingRow);

  // ── empty state (no query): trending suggestions ─────────────────────
  el.trending = ['overdue invoices', 'admin users'];
  el.setQuery('');
  await wait(30);
  check('trendingShownOnEmptyQuery', /overdue invoices/.test(el.body.textContent));

  // ── true empty-result state (a query matching nothing anywhere) ──────
  el.setQuery('zzz-nonexistent-query-zzz');
  await wait(400);
  check('noResultsEmptyStateShown', !!el.panel.querySelector('.o-empty'));

  // ── keyboard navigation + Enter fires the documented event ───────────
  el.setQuery('fresh');
  await wait(400);
  const input = el.querySelector('.o-gs-input');
  check('inputStaysInLightDom', !!input); // the input/control is not portaled, only the results panel is
  const firstSelected = el.panel.querySelector('[aria-selected="true"]');
  check('firstResultPreselected', !!firstSelected);

  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  const secondSelected = el.panel.querySelector('[aria-selected="true"]');
  check('arrowDownMovesSelection', !!secondSelected && secondSelected !== firstSelected);

  let selectEventDetail = null;
  el.addEventListener('o-select', e => { selectEventDetail = e.detail; });
  const selectedTitle = secondSelected.querySelector('.o-gs-title')?.textContent;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await wait(30);
  check('enterFiresSelectEvent', !!selectEventDetail && selectEventDetail.item.title === selectedTitle);
  check('enterCallsOnSelectInsteadOfNavigating', !!window.__gs_selected && window.__gs_selected.title === selectedTitle);
  check('panelClosesAfterSelect', el.isOpen === false);

  // ── "See all" row: click fires o-see-all and calls onSeeAll ──────────
  el.open();
  el.setQuery('fresh');
  await wait(400);
  el.addEventListener('o-see-all', e => seeAllEvents.push(e.detail));
  let onSeeAllCalled = false;
  fixtureProvider.onSeeAll = () => { onSeeAllCalled = true; };
  const seeAllRow2 = el.panel.querySelector('.o-gs-seeall');
  check('seeAllRowStillPresent', !!seeAllRow2);
  seeAllRow2.click();
  await wait(30);
  check('seeAllFiresEvent', seeAllEvents.length === 1 && seeAllEvents[0].provider.id === 'customers');
  check('seeAllCallsOnSeeAll', onSeeAllCalled === true);

  // ── Escape clears the query first, then closes on a second press ─────
  el.open();
  el.setQuery('fresh');
  await wait(400);
  const inputNow = el.querySelector('.o-gs-input');
  inputNow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await wait(20);
  check('escapeFirstClearsQuery', inputNow.value === '' && el.isOpen === true);
  inputNow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await wait(20);
  check('escapeSecondCloses', el.isOpen === false);

  // ── submit with nothing active records history + fires o-search(submitted) ──
  el.open();
  let searchEventDetail = null;
  el.addEventListener('o-search', e => { if (e.detail.submitted) searchEventDetail = e.detail; });
  el.setQuery('zzz-nonexistent-query-zzz');
  await wait(400);
  const noResults = el.panel.querySelector('.o-empty');
  check('confirmedZeroActiveResultsBeforeSubmit', !!noResults);
  const inputSubmit = el.querySelector('.o-gs-input');
  inputSubmit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await wait(30);
  check('submitWithNoActiveFiresSubmittedSearch', !!searchEventDetail && searchEventDetail.query === 'zzz-nonexistent-query-zzz');

  el.close();
  el.setQuery('');
  el.open();
  await wait(30);
  check('submittedQueryRecordedInHistory', /zzz-nonexistent-query-zzz/.test(el.body.textContent));

  // ── "recent" items stay isolated per instance/scope even though the real Orion.recent (userdata
  // package) is a single shared, unscoped list — 00-store.js tags each add() with its scope and
  // filters list() by it. Prove two instances with different scopes do not see each other's picks.
  const el2 = document.createElement('o-global-search');
  el2.scope = 'verify2-' + Date.now();
  el2.minChars = 1;
  el2.debounce = 20;
  document.body.appendChild(el2);
  el2.flush?.();
  await wait(20);
  const pickProvider = (tag) => ({ id: 'pick', title: 'Pick', limit: 5, search: async () => [{ id: tag + '-item', title: tag + ' Result', onSelect: () => {} }] });
  el.providers = [pickProvider('scopeA')];
  el2.providers = [pickProvider('scopeB')];
  el.flush?.(); el2.flush?.();

  el.open(); el.setQuery('x'); await wait(200);
  el.panel.querySelector('[role="option"]').click();
  await wait(20);

  el2.open(); el2.setQuery('x'); await wait(200);
  el2.panel.querySelector('[role="option"]').click();
  await wait(20);

  el.open(); el.setQuery(''); await wait(20);
  check('recentIsolatedForInstanceA', /scopeA Result/.test(el.body.textContent) && !/scopeB Result/.test(el.body.textContent));

  el2.open(); el2.setQuery(''); await wait(20);
  check('recentIsolatedForInstanceB', /scopeB Result/.test(el2.body.textContent) && !/scopeA Result/.test(el2.body.textContent));

  el2.remove();
  el.remove();

  const ok = fail.length === 0;
  return { ok, failed: fail, results };
})()
