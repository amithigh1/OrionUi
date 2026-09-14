/* legacy-lazy-loading.js — salvaged from .tmp/eval-lazy.js (docs/components/lazy-loading.html).
 * Lazy images in the grid finish loading (is-loaded), and data-o-lazy-render stamps its <template> and
 * sets data-o-visible once scrolled into view.
 */
(async () => {
  await new Promise(r => setTimeout(r, 800));
  const grid = document.getElementById('lz-grid');
  const imgs = [...grid.querySelectorAll('img')];
  const loadedCount = imgs.filter(i => i.classList.contains('is-loaded')).length;
  const renderSection = document.getElementById('lz-render');
  renderSection.scrollIntoView();
  await new Promise(r => setTimeout(r, 600));
  const stamped = !!renderSection.querySelector('.lz-chart');
  const visibleAttr = renderSection.hasAttribute('data-o-visible');
  const ok = imgs.length > 0 && loadedCount === imgs.length && stamped && visibleAttr;
  return { ok, totalImgs: imgs.length, loadedCount, stamped, visibleAttr };
})()
