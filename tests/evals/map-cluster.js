(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const map = document.createElement('o-map');
  map.setAttribute('tiles', 'offline');
  map.setAttribute('cluster-radius', '80');
  map.setAttribute('min-zoom', '10');
  map.setAttribute('max-zoom', '10'); // pin max==current zoom so a cluster click spiderfies instead of fitBounds-zooming
  map.style.cssText = 'width:400px;height:300px';
  map.lat = 3.1390; map.lng = 101.6869; map.zoom = 10;
  document.body.appendChild(map);
  await sleep(250);

  const r = {};
  // Three markers within a few metres of each other (well under the 80px cluster radius at this
  // zoom) plus one far away (Singapore) that must stay a single, unclustered marker.
  map.setMarkers([
    { id: 'a', lat: 3.1390, lng: 101.6869, title: 'A' },
    { id: 'b', lat: 3.1391, lng: 101.6870, title: 'B' },
    { id: 'c', lat: 3.1389, lng: 101.6868, title: 'C' },
    { id: 'far', lat: 1.2840, lng: 103.8512, title: 'Far away' },
  ]);
  await sleep(150);

  const clusterEls = [...map.querySelectorAll('.o-map-cluster')];
  const markerEls = [...map.querySelectorAll('.o-map-marker')];
  r.clusterCount = clusterEls.length;
  r.clusterBubbleCount = clusterEls.length === 1 ? +clusterEls[0].querySelector('.o-map-cluster-count').textContent : null;
  r.unclusteredMarkerCount = markerEls.length; // just the "far" marker, since a,b,c are inside the cluster bubble
  r.clusterFormed = clusterEls.length === 1 && r.clusterBubbleCount === 3 && markerEls.length === 1;

  // Below the threshold: markers far apart from each other never cluster.
  map.setMarkers([
    { id: 'x', lat: 3.10, lng: 101.60, title: 'X' },
    { id: 'y', lat: 3.30, lng: 101.90, title: 'Y' },
  ]);
  await sleep(150);
  r.noClusterWhenSpreadOut = map.querySelectorAll('.o-map-cluster').length === 0 && map.querySelectorAll('.o-map-marker').length === 2;

  // Re-cluster the tight trio and click the bubble: since maxZoom === current zoom, _onClusterClick
  // spiderfies (fans the 3 markers out around the cluster centre) instead of fitBounds-zooming.
  map.setMarkers([
    { id: 'a', lat: 3.1390, lng: 101.6869, title: 'A' },
    { id: 'b', lat: 3.1391, lng: 101.6870, title: 'B' },
    { id: 'c', lat: 3.1389, lng: 101.6868, title: 'C' },
  ]);
  await sleep(150);
  const bubble = map.querySelector('.o-map-cluster');
  r.bubbleFoundBeforeClick = !!bubble;
  bubble.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep(150);
  r.spiderfiedFlagSet = !!map._spiderfied;
  const spiderfiedMarkers = [...map.querySelectorAll('.o-map-marker')].filter(el => !el.hidden);
  r.spiderfiedMarkerCount = spiderfiedMarkers.length;
  // spiderfied markers must be positioned around (not on top of) the cluster centre
  const positions = spiderfiedMarkers.map(el => { const m = el.style.transform.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/); return m ? { x: +m[1], y: +m[2] } : null; });
  r.allSpiderfiedPositioned = positions.every(Boolean);
  const distinctPositions = new Set(positions.map(p => `${Math.round(p.x)},${Math.round(p.y)}`));
  r.spiderfiedMarkersSpreadApart = distinctPositions.size === spiderfiedMarkers.length; // no two markers on the exact same pixel

  map.remove();
  r.ok = r.clusterFormed && r.noClusterWhenSpreadOut && r.bubbleFoundBeforeClick && r.spiderfiedFlagSet
    && r.spiderfiedMarkerCount === 3 && r.allSpiderfiedPositioned && r.spiderfiedMarkersSpreadApart;
  return r;
})()
