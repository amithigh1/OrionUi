(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const map = document.createElement('o-map');
  map.setAttribute('tiles', 'offline');
  map.style.cssText = 'width:400px;height:300px';
  map.lat = 3.1390; map.lng = 101.6869; map.zoom = 12;
  document.body.appendChild(map);
  await sleep(250);
  map.focus();

  const r = {};
  const initial = { lat: map.getCenter().lat, lng: map.getCenter().lng, zoom: map.getZoom() };
  const key = k => map.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

  key('ArrowUp');
  await sleep(60);
  const afterUp = map.getCenter();
  r.arrowUpMovedNorth = afterUp.lat > initial.lat; // panning up moves the visible center northward

  key('ArrowDown');
  await sleep(60);
  const afterDown = map.getCenter();
  r.arrowDownMovedBack = Math.abs(afterDown.lat - initial.lat) < Math.abs(afterUp.lat - initial.lat);

  const beforeRight = map.getCenter();
  key('ArrowRight');
  await sleep(60);
  const afterRight = map.getCenter();
  r.arrowRightMovedEast = afterRight.lng > beforeRight.lng;

  key('ArrowLeft');
  await sleep(60);
  const afterLeft = map.getCenter();
  r.arrowLeftMovedBack = afterLeft.lng < afterRight.lng;

  const zoomBefore = map.getZoom();
  key('+');
  await sleep(60);
  r.plusZoomedIn = map.getZoom() > zoomBefore;
  const zoomAfterPlus = map.getZoom();
  key('-');
  await sleep(60);
  r.minusZoomedOut = map.getZoom() < zoomAfterPlus;

  // move + zoom away, then Home resets to the element's initial view
  map.setView(10, 10, 5);
  await sleep(60);
  key('Home');
  await sleep(60);
  const afterHome = { lat: map.getCenter().lat, lng: map.getCenter().lng, zoom: map.getZoom() };
  r.homeResets = Math.abs(afterHome.lat - initial.lat) < 0.01 && Math.abs(afterHome.lng - initial.lng) < 0.01 && Math.abs(afterHome.zoom - initial.zoom) < 0.01;

  map.remove();
  r.ok = r.arrowUpMovedNorth && r.arrowDownMovedBack && r.arrowRightMovedEast && r.arrowLeftMovedBack
    && r.plusZoomedIn && r.minusZoomedOut && r.homeResets;
  return r;
})()
