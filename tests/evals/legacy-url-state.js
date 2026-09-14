/* legacy-url-state.js — salvaged from the URL half of .tmp/undo-url-eval.js (docs/components/url-state.html).
 * Orion.url set/get round trip, popstate sync, and two-way Orion.url.bind() with an input.
 * The UndoManager half of the original script is kept separately as legacy-undo-manager.js (undo-redo.html).
 */
(async () => {
  const out = {};
  Orion.url.set({ q: 'hello', page: 2 });
  await new Promise(r => setTimeout(r, 10));
  out.urlAfterSet = { q: Orion.url.get('q'), page: Orion.url.get('page', 'number') };
  out.locationHref = location.search;
  let changeDetail = null;
  const offc = Orion.url.onChange(e => { changeDetail = e; });
  history.pushState(null, '', location.pathname + '?q=world&page=5');
  window.dispatchEvent(new PopStateEvent('popstate'));
  await new Promise(r => setTimeout(r, 10));
  out.popstateSynced = { q: Orion.url.get('q'), page: Orion.url.get('page', 'number'), source: changeDetail?.source };
  offc();

  const input = document.createElement('input'); document.body.appendChild(input);
  const b = Orion.url.bind('search', input);
  input.value = 'typed-value';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 10));
  out.bindPushedToUrl = Orion.url.get('search');
  Orion.url.set('search', 'from-url');
  await new Promise(r => setTimeout(r, 10));
  out.bindPulledFromUrl = input.value;
  b.unbind(); input.remove();

  Orion.url.set({ q: null, page: null, search: null }, { replace: true });

  const ok = out.urlAfterSet.q === 'hello' && out.urlAfterSet.page === 2
    && out.popstateSynced.q === 'world' && out.popstateSynced.page === 5 && out.popstateSynced.source === 'popstate'
    && out.bindPushedToUrl === 'typed-value' && out.bindPulledFromUrl === 'from-url';
  return { ok, ...out };
})()
