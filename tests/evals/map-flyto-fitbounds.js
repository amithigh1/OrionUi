(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitUntil = async (fn, timeout = 2000, step = 30) => { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (fn()) return true; await sleep(step); } return fn(); };
  const map = document.createElement('o-map');
  map.setAttribute('tiles', 'offline');
  map.style.cssText = 'width:400px;height:300px';
  map.lat = 3.1390; map.lng = 101.6869; map.zoom = 10;
  document.body.appendChild(map);
  await sleep(250);

  const r = {};
  // ── flyTo: must actually animate (intermediate frames differ from both start and end) ──
  const start = map.getCenter();
  const samples = [];
  const sampler = setInterval(() => samples.push({ ...map.getCenter(), zoom: map.getZoom() }), 20);
  let doneFired = false;
  map.flyTo(1.2840, 103.8512, 14, { duration: 300, onDone: () => { doneFired = true; } });
  await sleep(120); // mid-flight
  const mid = map.getCenter();
  r.midDifferentFromStart = Math.abs(mid.lat - start.lat) > 0.001;
  r.midDifferentFromTarget = Math.abs(mid.lat - 1.2840) > 0.001;
  await waitUntil(() => doneFired, 1500);
  clearInterval(sampler);
  const end = map.getCenter();
  r.reachedTarget = Math.abs(end.lat - 1.2840) < 0.001 && Math.abs(end.lng - 103.8512) < 0.001;
  r.reachedTargetZoom = Math.abs(map.getZoom() - 14) < 0.01;
  r.onDoneFired = doneFired;
  r.sawIntermediateFrames = samples.length >= 2;
  // committed to the reflected props too (not just the internal _lat/_lng/_zoom)
  r.propsCommitted = Math.abs(map.lat - 1.2840) < 0.001 && Math.abs(map.zoom - 14) < 0.01;

  // ── fitBounds: frame a bounding box so every point is visible with padding ──
  const points = [[3.1579, 101.7116], [1.2840, 103.8512], [3.1390, 101.6869]]; // KL + Singapore, spread out
  map.fitBounds(points, { padding: 20, animate: false });
  await sleep(50);
  const b = map.getBounds();
  const within = (lat, lng) => lat <= b.north + 0.01 && lat >= b.south - 0.01 && lng <= b.east + 0.01 && lng >= b.west - 0.01;
  r.allPointsWithinBounds = points.every(([lat, lng]) => within(lat, lng));
  // the view should have zoomed OUT from 14 to fit this much wider area
  r.zoomedOutToFit = map.getZoom() < 14;

  map.remove();
  r.ok = r.midDifferentFromStart && r.midDifferentFromTarget && r.reachedTarget && r.reachedTargetZoom
    && r.onDoneFired && r.sawIntermediateFrames && r.propsCommitted && r.allPointsWithinBounds && r.zoomedOutToFit;
  return r;
})()
