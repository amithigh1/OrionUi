(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const map = document.createElement('o-map');
  map.setAttribute('tiles', 'offline');
  map.style.cssText = 'width:400px;height:300px';
  map.lat = 3.1390; map.lng = 101.6869; map.zoom = 10;
  document.body.appendChild(map);
  await sleep(250);
  const viewport = map.querySelector('.o-map-viewport');
  const rect = viewport.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;

  const r = {};
  // ── wheel zoom ──────────────────────────────────────────────────────────
  const zoomBefore = map.getZoom();
  viewport.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, deltaY: -240, deltaMode: 0 }));
  await sleep(30);
  r.wheelZoomedImmediately = map.getZoom() > zoomBefore; // _zoomBy() applies synchronously, before the debounced commit
  await sleep(300); // past the 200ms _wheelEndT debounce that commits the zoom prop
  r.wheelZoomCommitted = map.zoom > zoomBefore;

  const zoomBeforeOut = map.getZoom();
  viewport.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, deltaY: 240, deltaMode: 0 }));
  await sleep(300);
  r.wheelZoomedOut = map.getZoom() < zoomBeforeOut;

  // ── pinch zoom via two-pointer PointerEvents ───────────────────────────
  map.setView(3.1390, 101.6869, 10);
  await sleep(250);
  const pinchZoomBefore = map.getZoom();
  const p1 = { id: 101, x: cx - 40, y: cy };
  const p2 = { id: 102, x: cx + 40, y: cy };
  const down = (id, x, y) => viewport.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: id, clientX: x, clientY: y, pointerType: 'touch', button: 0 }));
  const move = (id, x, y) => window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: id, clientX: x, clientY: y, pointerType: 'touch' }));
  const up = (id, x, y) => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: id, clientX: x, clientY: y, pointerType: 'touch' }));

  down(p1.id, p1.x, p1.y);
  down(p2.id, p2.x, p2.y);
  await sleep(20);
  // spread the two pointers further apart -> pinch-out -> zoom in
  move(p1.id, cx - 100, cy);
  move(p2.id, cx + 100, cy);
  await sleep(20);
  move(p1.id, cx - 130, cy);
  move(p2.id, cx + 130, cy);
  await sleep(20);
  const zoomDuringPinch = map.getZoom();
  r.pinchZoomedInWhileActive = zoomDuringPinch > pinchZoomBefore;
  up(p1.id, cx - 130, cy);
  up(p2.id, cx + 130, cy);
  await sleep(80);
  r.pinchZoomCommitted = map.zoom > pinchZoomBefore;

  map.remove();
  r.ok = r.wheelZoomedImmediately && r.wheelZoomCommitted && r.wheelZoomedOut && r.pinchZoomedInWhileActive && r.pinchZoomCommitted;
  return r;
})()
