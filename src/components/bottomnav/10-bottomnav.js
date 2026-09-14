/* Bottom nav: fixed mobile tab bar.
 *   <nav class="o-bottom-nav" aria-label="Primary" data-o-bottom-nav>
 *     <a class="o-bottom-nav-link" href="/"><o-icon name="home"></o-icon><span>Home</span></a>
 *     <a class="o-bottom-nav-link" href="/search"><o-icon name="search"></o-icon><span>Search</span></a>
 *     <button class="o-bottom-nav-action" aria-label="New"><o-icon name="plus"></o-icon></button>  <!-- .o-bottom-nav-center variant -->
 *     <a class="o-bottom-nav-link" href="/alerts"><o-icon name="bell"></o-icon><span>Alerts</span><span class="o-badge o-badge-counter">3</span></a>
 *     <a class="o-bottom-nav-link" href="/me"><o-icon name="user"></o-icon><span>Profile</span></a>
 *   </nav>
 * Active link auto-detected from the URL (opt out with data-o-bottom-nav="manual"), like the sidebar.
 * data-o-bottom-nav-autohide hides the bar while scrolling down (shows again on scroll up).
 * API: Orion.bottomNav.sync(el?) · setActive(el, hrefOrLink)
 */
const normPath = p => (p.replace(/\/index\.html?$/i, '/').replace(/\/+$/, '') || '/');
function scoreLink(a) {
  const href = a.getAttribute('href');
  if (!href || href === '#' || /^(javascript|mailto|tel):/i.test(href)) return 0;
  let u; try { u = new URL(href, location.href); } catch { return 0; }
  if (u.origin !== location.origin) return 0;
  const p = normPath(location.pathname), lp = normPath(u.pathname);
  if (u.hash.length > 1) {
    if (lp !== p) return 0;
    const h = decodeURIComponent(location.hash), lh = decodeURIComponent(u.hash);
    return h === lh ? 200 + lh.length : 0;
  }
  return lp === p ? 100 + lp.length : 0;
}
function applyActive(nav, link) {
  $$('.o-bottom-nav-link.is-active, .o-bottom-nav-link[aria-current]', nav).forEach(a => { if (a !== link) { a.classList.remove('is-active'); a.removeAttribute('aria-current'); } });
  if (!link) return;
  link.classList.add('is-active');
  link.setAttribute('aria-current', 'page');
  emit(nav, 'o-navigate', { href: link.getAttribute('href'), link });
}
function syncActive(nav) {
  let best = null, score = 0;
  $$('.o-bottom-nav-link[href]', nav).forEach(a => { const s = scoreLink(a); if (s > score) { score = s; best = a; } });
  if (best) applyActive(nav, best);
  return best;
}

behavior('data-o-bottom-nav', nav => {
  const offs = [];
  if (!nav.hasAttribute('aria-label')) nav.setAttribute('aria-label', t('common.menu'));
  if (nav.getAttribute('data-o-bottom-nav') !== 'manual') {
    syncActive(nav);
    offs.push(on(win, 'popstate hashchange', () => syncActive(nav)), on(doc, 'o-location', () => syncActive(nav)));
  }
  if (nav.hasAttribute('data-o-bottom-nav-autohide')) {
    let last = win.scrollY || 0;
    const onScroll = rafThrottle(() => {
      const y = Math.max(0, win.scrollY || 0), dy = y - last;
      if (y > 40 && dy > 4) nav.classList.add('is-hidden'); else if (dy < -4 || y < 40) nav.classList.remove('is-hidden');
      last = y;
    });
    offs.push(on(win, 'scroll', onScroll, { passive: true }));
  }
  return () => offs.forEach(f => f());
});

if (isBrowser) ready(() => $$('.o-bottom-nav:not([data-o-bottom-nav])').forEach(n => n.setAttribute('data-o-bottom-nav', '')));

O.bottomNav = {
  sync: el => (el ? [$(el)] : $$('.o-bottom-nav')).filter(Boolean).forEach(syncActive),
  setActive(el, x) {
    const nav = $(el); if (!nav) return null;
    const link = isStr(x) ? $$('a.o-bottom-nav-link[href]', nav).find(a => a.getAttribute('href') === x) : x;
    applyActive(nav, link || null);
    return link || null;
  },
};
