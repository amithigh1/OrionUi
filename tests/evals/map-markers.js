(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const map = document.createElement('o-map');
  map.setAttribute('tiles', 'offline');
  map.setAttribute('cluster', 'false'); // isolate CRUD from clustering for this test
  map.style.cssText = 'width:400px;height:300px';
  map.lat = 3.1390; map.lng = 101.6869; map.zoom = 12;
  document.body.appendChild(map);
  await sleep(250);

  const r = {};
  // setMarkers
  map.setMarkers([
    { id: 'a', lat: 3.15, lng: 101.70, title: 'A' },
    { id: 'b', lat: 3.16, lng: 101.71, title: 'B' },
  ]);
  await sleep(80);
  r.afterSetMarkers = map.markersList.map(m => m.id).sort();
  r.domCountAfterSet = map.querySelectorAll('.o-map-marker').length;

  // addMarker
  const newId = map.addMarker({ lat: 3.17, lng: 101.72, title: 'C' });
  await sleep(80);
  r.newIdReturned = typeof newId === 'string' && newId.length > 0;
  r.afterAdd = map.markersList.map(m => m.id).sort();
  r.domCountAfterAdd = map.querySelectorAll('.o-map-marker').length;

  // updateMarker
  map.updateMarker('a', { title: 'A updated', lat: 3.20 });
  await sleep(80);
  const updated = map.markersList.find(m => m.id === 'a');
  r.updateApplied = updated && updated.title === 'A updated' && updated.lat === 3.20;

  // removeMarker
  map.removeMarker('b');
  await sleep(80);
  r.afterRemove = map.markersList.map(m => m.id).sort();
  r.domCountAfterRemove = map.querySelectorAll('.o-map-marker').length;

  // markersList getter is live (reflects current state, not a stale snapshot) and is an own
  // accessor on the prototype (Object.defineProperty — the ARCHITECTURE.md §5 item 4b fix)
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(map), 'markersList');
  r.markersListIsAccessor = !!(desc && typeof desc.get === 'function');
  r.markersListReturnsArray = Array.isArray(map.markersList);

  map.remove();
  r.ok = JSON.stringify(r.afterSetMarkers) === JSON.stringify(['a', 'b'])
    && r.domCountAfterSet === 2
    && r.newIdReturned
    && JSON.stringify(r.afterAdd) === JSON.stringify(['a', 'b', newId].sort())
    && r.domCountAfterAdd === 3
    && r.updateApplied
    && JSON.stringify(r.afterRemove) === JSON.stringify(['a', newId].sort())
    && r.domCountAfterRemove === 2
    && r.markersListIsAccessor && r.markersListReturnsArray;
  return r;
})()
