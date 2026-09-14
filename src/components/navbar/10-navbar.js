// @deps dropdown
/* Navbar: responsive top bar.
 *   <header class="o-navbar" data-o-navbar aria-label="Main">
 *     <div class="o-navbar-inner">
 *       <a class="o-navbar-brand" href="/"><span class="o-navbar-brand-mark">…</span><span class="o-navbar-brand-text">Orion</span></a>
 *       <button class="o-navbar-toggle" data-o-toggle="navbar" data-o-target="#nav-main" aria-controls="nav-main" aria-expanded="false" aria-label="Menu"><o-icon name="menu"></o-icon></button>
 *       <div class="o-navbar-collapse" id="nav-main">
 *         <ul class="o-navbar-nav">
 *           <li class="o-navbar-item"><a class="o-navbar-link is-active" href="#" aria-current="page">Dashboard</a></li>
 *           <li class="o-navbar-item o-navbar-dropdown">
 *             <button class="o-navbar-link" type="button" data-o-toggle="dropdown"><span>Products</span><o-icon name="chevron-down" class="o-navbar-caret"></o-icon></button>
 *             <div class="o-dropdown-menu"><a class="o-dropdown-item" href="#">Overview</a><a class="o-dropdown-item" href="#">Pricing</a></div>
 *           </li>
 *         </ul>
 *         <label class="o-navbar-search"><o-icon name="search"></o-icon><input class="o-input" type="search" placeholder="Search…" aria-label="Search"></label>
 *       </div>
 *       <div class="o-navbar-actions">
 *         <button class="o-btn o-btn-ghost o-btn-icon" aria-label="Notifications"><o-icon name="bell"></o-icon></button>
 *         <button class="o-header-user" data-o-toggle="dropdown" data-o-target="#nav-user"><span class="o-avatar o-avatar-sm">JS</span><span class="o-user-info"><span class="o-user-name">Jamie</span></span></button>
 *         <div class="o-dropdown-menu" id="nav-user"><button class="o-dropdown-item">Profile</button><button class="o-dropdown-item">Sign out</button></div>
 *       </div>
 *     </div>
 *   </header>
 * Nested dropdowns / the user menu reuse the `dropdown` component's `data-o-toggle="dropdown"` action
 * (declared as a build dependency, so it is always bundled with the navbar).
 * Variants: .o-navbar-transparent (solid once scrolled), [data-o-navbar-autohide] (hides on scroll down).
 * Actions: data-o-toggle="navbar" [data-o-target="#collapse"].
 * API: Orion.navbar.toggle(el?) / open(el?) / close(el?) / isOpen(el?)
 * Events (on .o-navbar): o-navbar-toggle { open }.
 */
i18n.add('en', { navbar: { toggle: 'Toggle navigation' } });

const navOf = x => { const el = isStr(x) ? $(x) : x; return el && el.nodeType === 1 ? el.closest('.o-navbar') || (isBrowser ? $('.o-navbar') : null) : (isBrowser ? $('.o-navbar') : null); };
const collapseOf = nb => nb && nb.querySelector('.o-navbar-collapse');
function isDesktop(nb) { return getComputedStyle(nb).getPropertyValue('--o-navbar-mode').trim() !== 'collapsed'; }

function paint(nb) {
  const open = nb.classList.contains('is-open');
  $$('[data-o-toggle="navbar"]').forEach(b => { if (navOf(targetOf(b) || b) === nb) b.setAttribute('aria-expanded', String(open)); });
}
function fire(nb, open) { emit(nb, 'o-navbar-toggle', { open }); }

const navbar = {
  navbar: el => navOf(el),
  isOpen: el => !!navOf(el)?.classList.contains('is-open'),
  open(el) {
    const nb = navOf(el); if (!nb || nb.classList.contains('is-open')) return;
    nb.classList.add('is-open'); paint(nb); fire(nb, true);
  },
  close(el) {
    const nb = navOf(el); if (!nb || !nb.classList.contains('is-open')) return;
    nb.classList.remove('is-open'); paint(nb); fire(nb, false);
  },
  toggle(el) { const nb = navOf(el); if (!nb) return; nb.classList.contains('is-open') ? navbar.close(nb) : navbar.open(nb); },
};

behavior('data-o-navbar', nb => {
  const offs = [];
  if (!nb.hasAttribute('aria-label') && !nb.hasAttribute('aria-labelledby')) nb.setAttribute('aria-label', t('common.menu'));
  paint(nb);
  // close the mobile collapse on navigation / outside click / resize to desktop
  offs.push(on(nb, 'click', 'a.o-navbar-link[href]:not([href="#"])', () => { if (!isDesktop(nb)) navbar.close(nb); }));
  offs.push(onClickOutside([nb], () => { if (nb.classList.contains('is-open') && !isDesktop(nb)) navbar.close(nb); }));
  offs.push(on(doc, 'keydown', e => { if (e.key === 'Escape' && nb.classList.contains('is-open') && !isDesktop(nb)) { navbar.close(nb); nb.querySelector('[data-o-toggle="navbar"]')?.focus(); } }));
  let mode = isDesktop(nb) ? 'desktop' : 'collapsed';
  offs.push(on(win, 'resize', rafThrottle(() => {
    const m = isDesktop(nb) ? 'desktop' : 'collapsed';
    if (m === mode) return;
    mode = m;
    if (m === 'desktop' && nb.classList.contains('is-open')) navbar.close(nb);
  })));

  // sticky shadow + transparent-until-scroll
  const onScroll = rafThrottle(() => nb.classList.toggle('is-scrolled', (win.scrollY || 0) > 4));
  offs.push(on(win, 'scroll', onScroll, { passive: true }));
  onScroll();

  // hide-on-scroll-down
  if (nb.hasAttribute('data-o-navbar-autohide')) {
    let last = win.scrollY || 0;
    const onAuto = rafThrottle(() => {
      const y = Math.max(0, win.scrollY || 0), delta = y - last;
      if (nb.classList.contains('is-open') || nb.contains(doc.activeElement)) { last = y; return; }
      if (y > 80 && delta > 4) nb.classList.add('is-hidden');
      else if (delta < -4 || y < 80) nb.classList.remove('is-hidden');
      last = y;
    });
    offs.push(on(win, 'scroll', onAuto, { passive: true }));
  }
  return () => { offs.forEach(f => f()); onScroll.cancel?.(); };
});

action('navbar', btn => navbar.toggle(navOf(targetOf(btn) || btn)));

if (isBrowser) ready(() => { $$('.o-navbar:not([data-o-navbar])').forEach(n => n.setAttribute('data-o-navbar', '')); });

O.navbar = navbar;
