(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const map = document.createElement('o-map');
  map.setAttribute('tiles', 'offline');
  map.style.cssText = 'width:400px;height:300px';
  map.lat = 3.1390; map.lng = 101.6869; map.zoom = 13;
  document.body.appendChild(map);
  await sleep(250);

  const r = {};
  const linePoints = [[3.1579, 101.7116], [3.1478, 101.6953], [3.1490, 101.7133]];
  const lineId = map.addLayer({ type: 'polyline', points: linePoints, style: { color: '#2a78d6', weight: 3 } });
  const circleId = map.addLayer({ type: 'circle', center: [3.1390, 101.6869], radius: 500, style: { color: '#e34948' } });
  await sleep(80);

  const parsePoints = str => str.trim().split(/\s+/).map(pair => pair.split(',').map(Number));
  const lineEl = () => map.querySelector(`polyline[data-id="${lineId}"]`);
  const circleEl = () => map.querySelector(`circle[data-id="${circleId}"]`);

  // 1) at the initial view, the rendered SVG points must match map.project() for each geo point.
  const expectedBefore = linePoints.map(([lat, lng]) => { const p = map.project({ lat, lng }); return [+p.x.toFixed(1), +p.y.toFixed(1)]; });
  const actualBefore = parsePoints(lineEl().getAttribute('points'));
  const closeEnough = (a, b, eps = 0.6) => a.length === b.length && a.every(([x, y], i) => Math.abs(x - b[i][0]) < eps && Math.abs(y - b[i][1]) < eps);
  r.polylineMatchesProjectionBefore = closeEnough(actualBefore, expectedBefore);

  const cxBefore = +circleEl().getAttribute('cx'), cyBefore = +circleEl().getAttribute('cy');
  const centerProjBefore = map.project({ lat: 3.1390, lng: 101.6869 });
  r.circleMatchesProjectionBefore = Math.abs(cxBefore - centerProjBefore.x) < 0.6 && Math.abs(cyBefore - centerProjBefore.y) < 0.6;

  // 2) pan the map, then re-check: the rendered points must have MOVED and still match the (new)
  // projection — proving they re-project on every frame rather than staying stuck at their
  // original screen position.
  map.setView(3.05, 101.55, 13);
  await sleep(120);
  const expectedAfter = linePoints.map(([lat, lng]) => { const p = map.project({ lat, lng }); return [+p.x.toFixed(1), +p.y.toFixed(1)]; });
  const actualAfter = parsePoints(lineEl().getAttribute('points'));
  r.polylineMatchesProjectionAfterPan = closeEnough(actualAfter, expectedAfter);
  r.polylineActuallyMoved = !closeEnough(actualAfter, actualBefore, 5);

  const cxAfter = +circleEl().getAttribute('cx'), cyAfter = +circleEl().getAttribute('cy');
  const centerProjAfter = map.project({ lat: 3.1390, lng: 101.6869 });
  r.circleMatchesProjectionAfterPan = Math.abs(cxAfter - centerProjAfter.x) < 0.6 && Math.abs(cyAfter - centerProjAfter.y) < 0.6;
  r.circleActuallyMoved = Math.hypot(cxAfter - cxBefore, cyAfter - cyBefore) > 5;
  // the circle's pixel radius must also change with a pan+same zoom only if latitude (and thus
  // metres-per-pixel) changed — just sanity check it stayed a sane positive number.
  r.circleRadiusPositive = +circleEl().getAttribute('r') > 0;

  // 3) removeLayer / clearLayers
  map.removeLayer(circleId);
  await sleep(50);
  r.circleRemoved = !map.querySelector(`circle[data-id="${circleId}"]`);
  map.clearLayers();
  await sleep(50);
  r.allCleared = map.querySelectorAll('.o-map-vector').length === 0;

  map.remove();
  r.ok = r.polylineMatchesProjectionBefore && r.circleMatchesProjectionBefore && r.polylineMatchesProjectionAfterPan
    && r.polylineActuallyMoved && r.circleMatchesProjectionAfterPan && r.circleActuallyMoved && r.circleRadiusPositive
    && r.circleRemoved && r.allCleared;
  return r;
})()
