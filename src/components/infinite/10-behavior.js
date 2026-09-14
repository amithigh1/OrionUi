/* Declarative infinite scroll: fetch and append an HTML fragment per page.
 *   <div data-o-infinite data-o-infinite-url="/feed?page={page}">
 *     ...initial server-rendered items (optional)...
 *   </div>
 * The fetched response body is treated as an HTML fragment and appended as-is; it is run through
 * sanitize() unless the element carries data-o-trusted (only for markup you generated yourself).
 * Extra attributes: data-o-infinite-mode="auto|button", data-o-infinite-threshold="300",
 * data-o-infinite-initial-page="1", data-o-infinite-direction="down|up", data-o-infinite-param="page".
 */
// `attr || fallback` would treat an explicit "0" (a legitimate threshold — e.g. a small custom
// scroller where the default 300px margin would make the sentinel permanently "near the edge")
// as absent, since 0 is falsy. Only fall back when the attribute is genuinely missing/blank/NaN.
const infNum = (el, name, dflt) => { const v = el.getAttribute(name); return v == null || v === '' || Number.isNaN(+v) ? dflt : +v; };

behavior('data-o-infinite', el => {
  const url = el.getAttribute('data-o-infinite-url');
  if (!url) { console.error('[Orion] [data-o-infinite] needs data-o-infinite-url on', el); return; }
  const param = el.getAttribute('data-o-infinite-param') || 'page';
  const ctrl = O.infiniteScroll(el, {
    mode: el.getAttribute('data-o-infinite-mode') === 'button' ? 'button' : 'auto',
    threshold: infNum(el, 'data-o-infinite-threshold', 300),
    initialPage: infNum(el, 'data-o-infinite-initial-page', 1),
    direction: el.getAttribute('data-o-infinite-direction') === 'up' ? 'up' : 'down',
    trusted: el.hasAttribute('data-o-trusted'),
    async load(page, { signal }) {
      const u = url.includes('{' + param + '}') ? url.replace('{' + param + '}', page) : url + (url.includes('?') ? '&' : '?') + param + '=' + page;
      // Go through Orion.http when the http package is bundled — its mock server, auth headers, interceptors and
      // retries then apply to declarative feeds too (a raw fetch() silently bypassed all of them). responseType
      // 'response' yields the same Response object fetch() would.
      const cfg = { signal, headers: { 'X-Requested-With': 'OrionInfinite' } };
      const res = O.http ? await O.http.get(u, { ...cfg, responseType: 'response' }) : await fetch(u, cfg);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await res.text();
      const more = res.headers.get('X-Has-More');
      return { html, hasMore: more == null ? undefined : more === 'true' };
    },
  });
  el.__oInfinite = ctrl;
  return () => ctrl.destroy();
});
