/* Sticky actions: data-o-sticky-actions adds `.is-stuck` (for a shadow) while a `position: sticky`
 * element (e.g. `.o-sticky-bar`) is actually pinned against its sticky edge.
 *   <div class="o-sticky-bar" data-o-sticky-actions> ... <button class="o-btn o-btn-primary">Save</button> </div>
 */
behavior('data-o-sticky-actions', el => {
  const scrollers = [win, ...scrollParents(el)];
  const check = rafThrottle(() => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    let stuck = false;
    if (s.position === 'sticky' || s.position === '-webkit-sticky') {
      if (s.top !== 'auto') stuck = stuck || r.top <= parseFloat(s.top) + .5;
      if (s.bottom !== 'auto') stuck = stuck || r.bottom >= win.innerHeight - parseFloat(s.bottom) - .5;
    }
    el.classList.toggle('is-stuck', stuck);
  });
  const offs = scrollers.map(sc => on(sc, 'scroll', check, { passive: true, capture: sc !== win }));
  offs.push(on(win, 'resize', check), observeResize(el, check));
  check();
  return () => { offs.forEach(f => f()); check.cancel?.(); };
});
