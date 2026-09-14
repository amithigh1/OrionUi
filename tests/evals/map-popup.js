(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const map = document.createElement('o-map');
  map.setAttribute('tiles', 'offline');
  map.style.cssText = 'width:400px;height:300px';
  map.lat = 3.1390; map.lng = 101.6869; map.zoom = 14;
  document.body.appendChild(map);
  await sleep(250);

  const r = {};
  // Place a marker near the TOP edge of the viewport so opening its popup must pan the map
  // (_panPopupIntoView) to make room above it, not just render in place.
  const topPoint = map.unproject({ x: 200, y: 10 });
  map.setMarkers([{ id: 'm1', lat: topPoint.lat, lng: topPoint.lng, title: 'Edge marker', popup: '<strong>Hello</strong> popup' }]);
  await sleep(120);
  const centerBefore = map.getCenter();

  const btn = map.querySelector('.o-map-marker[data-id="m1"]');
  r.markerFound = !!btn;
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep(80);

  const popupEl = map.querySelector('.o-map-popup');
  r.popupOpened = !!popupEl;
  r.popupHasContent = popupEl ? popupEl.textContent.includes('Hello popup') : false;
  r.popupPositioned = popupEl ? /translate3d\(-?[\d.]+px,\s*-?[\d.]+px,\s*0px\)/.test(popupEl.style.transform) : false;
  r.popupHasCloseButton = !!map.querySelector('.o-map-popup-close');

  // The map must have flown toward the marker to keep the popup in view (center changed).
  await sleep(400); // let the flyTo animation triggered by _panPopupIntoView settle
  const centerAfter = map.getCenter();
  r.pannedIntoView = Math.abs(centerAfter.lat - centerBefore.lat) > 0.0001 || Math.abs(centerAfter.lng - centerBefore.lng) > 0.0001;

  // Close via the close button.
  map.querySelector('.o-map-popup-close').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep(80);
  r.closedViaButton = !map.querySelector('.o-map-popup');

  // Re-open then close via Escape.
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep(80);
  r.reopened = !!map.querySelector('.o-map-popup');
  map.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(80);
  r.closedViaEscape = !map.querySelector('.o-map-popup');

  map.remove();
  r.ok = r.markerFound && r.popupOpened && r.popupHasContent && r.popupPositioned && r.popupHasCloseButton
    && r.pannedIntoView && r.closedViaButton && r.reopened && r.closedViaEscape;
  return r;
})()
