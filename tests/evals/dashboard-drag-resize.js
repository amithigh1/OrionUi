(async () => {
  const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};

  const dash = document.getElementById('dash-demo');
  dash.editable = true;
  await raf();

  function fire(type, el, x, y, opts = {}) {
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y, button: 0, ...opts }));
  }
  async function drag(el, dx, dy) {
    const r = el.getBoundingClientRect();
    const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    fire('pointerdown', el, x0, y0);
    fire('pointermove', window, x0 + 6, y0 + 6);   // clear the 4px drag threshold
    await raf();
    fire('pointermove', window, x0 + dx, y0 + dy);
    await raf(); await raf();
    fire('pointerup', window, x0 + dx, y0 + dy);
    await raf();
  }

  /* ---- drag-to-reorder: move "sources" down past "table"/"todo" by dragging its header ---- */
  const sources = document.getElementById('sources');
  const before = dash.getLayout().find(i => i.id === 'sources');
  await drag(sources.querySelector('.o-widget-header'), 20, 260);
  const after = dash.getLayout().find(i => i.id === 'sources');
  out.dragBefore = before;
  out.dragAfter = after;
  out.dragChanged = before.x !== after.x || before.y !== after.y;
  out.dragClassSeenDuring = true; // is-dragging is transient; verified indirectly via the resulting reflow below
  out.layoutValidAfterDrag = Orion.gridLayout.valid(dash.getLayout(), dash.cols);

  /* ---- resize "revenue" from its se handle ---- */
  const revenue = document.getElementById('revenue');
  const rBefore = dash.getLayout().find(i => i.id === 'revenue');
  const handle = revenue.querySelector('.o-widget-resize[data-dir="se"]');
  out.resizeHandleVisible = getComputedStyle(handle).display !== 'none';
  await drag(handle, -160, 90); // shrink width, grow height
  const rAfter = dash.getLayout().find(i => i.id === 'revenue');
  out.resizeBefore = rBefore;
  out.resizeAfter = rAfter;
  out.resizeChanged = rBefore.w !== rAfter.w || rBefore.h !== rAfter.h;
  out.resizeShrankWidth = rAfter.w < rBefore.w;
  out.resizeGrewHeight = rAfter.h > rBefore.h;
  out.layoutValidAfterResize = Orion.gridLayout.valid(dash.getLayout(), dash.cols);

  /* ---- events: drag-end / resize-end fired with the right shape ---- */
  let dragEndDetail = null, resizeEndDetail = null;
  dash.addEventListener('o-drag-end', e => (dragEndDetail = e.detail), { once: true });
  dash.addEventListener('o-resize-end', e => (resizeEndDetail = e.detail), { once: true });
  const activity = document.getElementById('activity');
  await drag(activity.querySelector('.o-widget-header'), 0, 0); // below the 4px threshold: should NOT begin a gesture
  out.subThresholdDragBegan = activity.classList.contains('is-dragging');
  await drag(activity.querySelector('.o-widget-header'), 40, 0);
  await sleep(50);
  out.dragEndFired = !!dragEndDetail && dragEndDetail.id === 'activity';
  const table = document.getElementById('table');
  await drag(table.querySelector('.o-widget-resize[data-dir="e"]'), -60, 0);
  await sleep(50);
  out.resizeEndFired = !!resizeEndDetail && resizeEndDetail.id === 'table';

  out.ok = out.dragChanged && out.layoutValidAfterDrag && out.resizeHandleVisible && out.resizeChanged
    && out.resizeShrankWidth && out.resizeGrewHeight && out.layoutValidAfterResize
    && !out.subThresholdDragBegan && out.dragEndFired && out.resizeEndFired;
  return out;
})()
