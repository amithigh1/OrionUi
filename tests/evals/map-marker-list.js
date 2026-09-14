(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const map = document.createElement('o-map');
  map.setAttribute('tiles', 'offline');
  map.style.cssText = 'width:400px;height:300px';
  map.lat = 3.1390; map.lng = 101.6869; map.zoom = 6;
  document.body.appendChild(map);
  await sleep(250);

  const r = {};
  const toggleBtn = map.querySelector('.o-map-listtoggle');
  r.hiddenWithNoMarkers = toggleBtn.hidden;

  map.setMarkers([
    { id: 'kl', lat: 3.1579, lng: 101.7116, title: 'Kuala Lumpur' },
    { id: 'sg', lat: 1.2840, lng: 103.8512, title: 'Singapore' },
    { id: 'bk', lat: 3.2379, lng: 101.6840, title: 'Batu Caves' },
  ]);
  await sleep(100);
  r.shownWithMarkers = !toggleBtn.hidden;

  toggleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep(60);
  const listWrap = map.querySelector('.o-map-list');
  r.listOpened = !listWrap.hidden;
  const items = [...listWrap.querySelectorAll('.o-map-list-item')];
  r.itemCount = items.length;
  r.itemTitlesMatch = items.map(i => i.textContent.trim()).sort().join('|') === ['Kuala Lumpur', 'Singapore', 'Batu Caves'].sort().join('|');
  r.hasTitleHeading = !!listWrap.querySelector('.o-map-list-title');
  r.hasBackButton = [...listWrap.querySelectorAll('button')].some(b => /back to map/i.test(b.textContent));

  // clicking an item flies the map there and closes the list
  const centerBefore = map.getCenter();
  const sgItem = items.find(i => i.textContent.includes('Singapore'));
  sgItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep(700); // flyTo default duration 600ms
  r.listClosedAfterPick = listWrap.hidden;
  const centerAfter = map.getCenter();
  r.flewToPickedMarker = Math.abs(centerAfter.lat - 1.2840) < 0.05 && Math.abs(centerAfter.lng - 103.8512) < 0.05;
  r.flewAwayFromStart = Math.abs(centerAfter.lat - centerBefore.lat) > 1;

  // reopen and use the explicit "back to map" control
  toggleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep(60);
  const backBtn = [...map.querySelectorAll('.o-map-list button')].find(b => /back to map/i.test(b.textContent));
  backBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep(60);
  r.closedViaBackButton = map.querySelector('.o-map-list').hidden;

  map.remove();
  r.ok = r.hiddenWithNoMarkers && r.shownWithMarkers && r.listOpened && r.itemCount === 3 && r.itemTitlesMatch
    && r.hasTitleHeading && r.hasBackButton && r.listClosedAfterPick && r.flewToPickedMarker && r.flewAwayFromStart && r.closedViaBackButton;
  return r;
})()
