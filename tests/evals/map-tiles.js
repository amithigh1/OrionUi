(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const map = document.createElement('o-map');
  map.setAttribute('tiles', 'offline');
  map.style.cssText = 'width:400px;height:300px';
  map.lat = 3.1390; map.lng = 101.6869; map.zoom = 12;
  document.body.appendChild(map);
  await sleep(300);
  map.invalidateSize();
  await sleep(200);

  const tiles = [...map.querySelectorAll('.o-map-tile')];
  const re = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px,\s*0px\)\s*scale\(([\d.]+)\)/;
  const parsed = tiles.map(t => { const m = t.style.transform.match(re); return m ? { x: +m[1], y: +m[2], scale: +m[3] } : null; });
  const allParsed = parsed.every(Boolean);
  const allScale1 = allParsed && parsed.every(p => Math.abs(p.scale - 1) < 1e-6); // no in-progress zoom crossfade
  // _updateTiles() covers half-width/height + one whole tileSize of buffer on every side (so tiles
  // are ready just before they scroll into view), so the exact count is alignment-dependent
  // (fencepost effects); assert a generous-but-meaningful band around the geometric minimum
  // (a bare 400x300 box needs at least 2x2 = 4 tiles of that size to fully cover it).
  const expectedMin = 4;
  const expectedMax = 30;
  const countOk = tiles.length >= expectedMin && tiles.length <= expectedMax;
  // every tile's origin must be within two tile-sizes of the 400x300 viewport on every side
  const withinViewport = allParsed && parsed.every(p => p.x > -2 * 256 && p.x < 400 + 2 * 256 && p.y > -2 * 256 && p.y < 300 + 2 * 256);
  const allLoaded = tiles.every(t => t.classList.contains('is-loaded'));
  // the real geometric guarantee: every point of the 400x300 viewport must be covered by some
  // 256x256 tile rect (sampled on a 20px grid) — proves the tiles actually tile the viewport,
  // independent of exactly how many of them there are.
  const rects = allParsed ? parsed.map(p => ({ x1: p.x, y1: p.y, x2: p.x + 256, y2: p.y + 256 })) : [];
  let uncovered = 0;
  for (let sx = 0; sx < 400; sx += 20) for (let sy = 0; sy < 300; sy += 20) {
    if (!rects.some(r => sx >= r.x1 && sx < r.x2 && sy >= r.y1 && sy < r.y2)) uncovered++;
  }
  const fullyCovered = allParsed && uncovered === 0;
  // re-center: pan far away and confirm the tile set actually changes (not a static fixed grid)
  const beforeKeys = tiles.map(t => t.style.transform).sort();
  map.setView(52.5, 13.4, 12); // Berlin — far from KL, different tile coordinates entirely
  await sleep(250);
  const afterTiles = [...map.querySelectorAll('.o-map-tile')];
  const afterKeys = afterTiles.map(t => t.style.transform).sort();
  const tilesChangedOnPan = JSON.stringify(beforeKeys) !== JSON.stringify(afterKeys);

  map.remove();
  const ok = tiles.length > 0 && allParsed && allScale1 && countOk && withinViewport && allLoaded && tilesChangedOnPan && fullyCovered;
  return { tileCount: tiles.length, expectedMin, expectedMax, allParsed, allScale1, countOk, withinViewport, allLoaded, tilesChangedOnPan, fullyCovered, uncovered, ok };
})()
