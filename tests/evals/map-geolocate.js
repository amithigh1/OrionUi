(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // Mock navigator.geolocation before anything touches it (both <o-map>'s locate() and the
  // standalone Orion.geo API wrap this same object).
  const FAKE = { lat: 1.3521, lng: 103.8198, accuracy: 25 };
  const realGeolocation = navigator.geolocation;
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok, err, opts) => setTimeout(() => ok({ coords: { latitude: FAKE.lat, longitude: FAKE.lng, accuracy: FAKE.accuracy, altitude: null, heading: null, speed: null }, timestamp: Date.now() }), 20),
      watchPosition: () => 1,
      clearWatch: () => {},
    },
  });

  const r = {};
  // ── Orion.geo.current() standalone (no <o-map> involved) ──
  const pos = await Orion.geo.current();
  r.geoCurrentResolved = Math.abs(pos.lat - FAKE.lat) < 1e-6 && Math.abs(pos.lng - FAKE.lng) < 1e-6;

  // ── <o-map>.locate() ──
  const map = document.createElement('o-map');
  map.setAttribute('tiles', 'offline');
  map.setAttribute('controls', 'zoom,locate');
  map.style.cssText = 'width:400px;height:300px';
  map.lat = 3.1390; map.lng = 101.6869; map.zoom = 10;
  document.body.appendChild(map);
  await sleep(250);

  let locateEventDetail = null;
  map.addEventListener('o-locate', e => { locateEventDetail = e.detail; });
  const locateBtn = map.locateBtn; // the control instance itself, not a fragile DOM query
  r.locateButtonVisible = !!locateBtn && !locateBtn.hidden && map.querySelector('.o-map-controls').contains(locateBtn);
  locateBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep(200);

  r.locateEventFired = !!locateEventDetail;
  r.locateEventHasCorrectCoords = locateEventDetail && Math.abs(locateEventDetail.lat - FAKE.lat) < 1e-6 && Math.abs(locateEventDetail.lng - FAKE.lng) < 1e-6;

  await sleep(700); // flyTo(pos.lat, pos.lng, max(zoom,15)) default duration 600ms
  const center = map.getCenter();
  r.mapFlewToPosition = Math.abs(center.lat - FAKE.lat) < 0.01 && Math.abs(center.lng - FAKE.lng) < 0.01;
  r.zoomedInToAtLeast15 = map.getZoom() >= 15 - 0.01;

  const dot = map.querySelector('.o-map-locate-dot');
  r.locateDotShown = !!dot && !dot.hidden;
  const accuracyRing = map.querySelector('.o-map-locate-accuracy');
  r.accuracyRingSized = accuracyRing && parseFloat(accuracyRing.style.width || '0') > 0;

  map.remove();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: realGeolocation });
  r.ok = r.geoCurrentResolved && r.locateButtonVisible && r.locateEventFired && r.locateEventHasCorrectCoords
    && r.mapFlewToPosition && r.zoomedInToAtLeast15 && r.locateDotShown && r.accuracyRingSized;
  return r;
})()
