/* Scroll-spy: data-o-spy="#nav" on the scrolling element (or <body> for the whole page) highlights
 * the nav link whose target heading is currently in view, and smooth-scrolls to it on click.
 *   <main data-o-spy="#toc" data-o-spy-offset="72">
 *     <h2 id="intro">Intro</h2>…<h2 id="usage">Usage</h2>
 *   </main>
 *   <nav id="toc"><a href="#intro">Intro</a><ul><li><a href="#usage">Usage</a></li></ul></nav>
 * Nested lists are supported: ancestor <li> get `.has-active`. aria-current="true" marks the active link.
 */
function spyTargets(nav) {
  return $$('a[href^="#"]', nav).map(a => { const id = decodeURIComponent(a.getAttribute('href').slice(1)); return id ? { a, id } : null; }).filter(Boolean);
}
function activate(nav, link) {
  $$('a.is-active, a[aria-current]', nav).forEach(a => { if (a !== link) { a.classList.remove('is-active'); a.removeAttribute('aria-current'); } });
  $$('.has-active', nav).forEach(x => x.classList.remove('has-active'));
  if (!link) return;
  link.classList.add('is-active');
  link.setAttribute('aria-current', 'true');
  for (let li = link.parentElement && link.parentElement.closest('li'); li && nav.contains(li); li = li.parentElement && li.parentElement.closest('li')) li.classList.add('has-active');
  emit(nav, 'o-spy-change', { link, id: link.getAttribute('href').slice(1) });
}
function scrollToTarget(scroller, el, offset) {
  const top = scroller === win
    ? el.getBoundingClientRect().top + (win.scrollY || 0) - offset
    : el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - offset;
  (scroller === win ? win : scroller).scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' });
}

behavior('data-o-spy', (root, sel) => {
  const nav = $(sel); if (!nav) return;
  const offset = +root.getAttribute('data-o-spy-offset') || 0;
  const scroller = (root === doc.body || root === doc.documentElement) ? win : root;
  const list = () => spyTargets(nav).map(x => ({ ...x, el: doc.getElementById(x.id) })).filter(x => x.el)
    .sort((x, y) => x.el.compareDocumentPosition(y.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  const update = rafThrottle(() => {
    const items = list(); if (!items.length) return;
    const base = scroller === win ? 0 : root.getBoundingClientRect().top;
    let current = items[0];
    for (const item of items) { if (item.el.getBoundingClientRect().top - base - offset <= 2) current = item; else break; }
    activate(nav, current.a);
  });
  const offs = [
    on(scroller, 'scroll', update, { passive: true }),
    on(win, 'resize', update),
    on(nav, 'click', 'a[href^="#"]', (e, a) => {
      const id = decodeURIComponent(a.getAttribute('href').slice(1)), el = doc.getElementById(id);
      if (!el) return;
      e.preventDefault();
      scrollToTarget(scroller, el, offset);
      history.pushState ? history.pushState(null, '', '#' + id) : (location.hash = id);
      activate(nav, a);
    }),
  ];
  update();
  return () => offs.forEach(f => f());
});
