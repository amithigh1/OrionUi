(async () => {
  // Run this file with --mobile (390x844 emulated phone) — see the command in the report.
  const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};

  const dash = document.getElementById('dash-demo');
  await raf(); await sleep(50);

  out.viewportIsNarrow = window.innerWidth <= 400;
  out.containerNarrowerThan12ColBase = dash.clientWidth < 500; // authored at columns="12"
  out.reflowedToFewerColumns = dash.cols < dash.columns; // columns=12 from markup
  out.breakpointIsNarrowest = dash.breakpoint === 'xs' || dash.breakpoint === 'sm';

  const layout = dash.getLayout();
  out.everyWidgetFitsWithinCols = layout.every(i => i.x >= 0 && i.x + i.w <= dash.cols);
  out.everyWidgetAtLeastOneWide = layout.every(i => i.w >= 1);
  out.layoutValid = Orion.gridLayout.valid(layout, dash.cols);
  // at the narrowest breakpoint the base layout (2 widgets per row at 12 cols) should have
  // visibly stacked into (close to) a single column
  out.mostWidgetsFullWidth = layout.filter(i => i.w === dash.cols).length >= layout.length - 1;

  /* ---- the mechanism actually re-runs on resize, not just "narrow at load": widen the
     dashboard's own box (independent of the emulated viewport) and confirm it reflows again ---- */
  const prevCols = dash.cols, prevBp = dash.breakpoint;
  let changeDetail = null;
  dash.addEventListener('o-breakpoint-change', e => (changeDetail = e.detail), { once: true });
  dash.style.maxWidth = '1300px'; // only shrinks the container in --mobile's 390px viewport... so
  // instead directly grow it via a wrapping block with a huge min-width forcing horizontal room:
  const wrap = dash.parentElement;
  wrap.style.minWidth = '1300px';
  document.body.style.overflowX = 'auto';
  await raf(); await sleep(150);
  out.widenedContainer = dash.clientWidth > 900;
  out.recomputedMoreColumns = dash.cols > prevCols;
  out.breakpointChangeEventFired = !!changeDetail && changeDetail.previous === prevBp && changeDetail.breakpoint === dash.breakpoint;
  out.layoutValidAfterWiden = Orion.gridLayout.valid(dash.getLayout(), dash.cols);

  out.ok = out.viewportIsNarrow && out.reflowedToFewerColumns && out.breakpointIsNarrowest
    && out.everyWidgetFitsWithinCols && out.everyWidgetAtLeastOneWide && out.layoutValid && out.mostWidgetsFullWidth
    && out.widenedContainer && out.recomputedMoreColumns && out.breakpointChangeEventFired && out.layoutValidAfterWiden;
  return out;
})()
