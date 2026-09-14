/* ============================================================================
 * <o-map> — Web Mercator projection helpers + Orion.geo (geolocation, distance,
 * bearing, formatting, bounds). Shared by every file in this folder.
 * ========================================================================== */
i18n.add('en', {
  map: {
    label: 'Map', zoomIn: 'Zoom in', zoomOut: 'Zoom out', locate: 'Show my location', locating: 'Locating…',
    fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen', layers: 'Layers', close: 'Close',
    markerList: 'List of markers', markerListToggle: 'View markers as a list', backToMap: 'Back to map',
    cluster: '{count} locations', spiderfy: 'Show all {count} at this spot', locateError: 'Could not determine your location',
    attributionOffline: 'Offline demo tiles — no real map data', you: 'Your location', accuracy: 'Accuracy ±{m} m',
    resetView: 'Reset view', kbdHint: 'Use arrow keys to pan, plus and minus to zoom, Home to reset.',
  },
});

const MAX_LAT = 85.05112878;
const clampLat = lat => clamp(lat, -MAX_LAT, MAX_LAT);
const wrap180 = lng => { let l = ((lng + 180) % 360 + 360) % 360 - 180; return l; };

/** lat/lng (degrees) -> world pixel at zoom, tileSize (standard Web Mercator / OSM slippy-map scheme). */
function geoToPixel(lat, lng, zoom, tileSize) {
  const scale = tileSize * Math.pow(2, zoom);
  const x = (wrap180(lng) + 180) / 360 * scale;
  const rad = clampLat(lat) * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * scale;
  return { x, y };
}
/** world pixel at zoom -> lat/lng (degrees). Inverse of geoToPixel. */
function pixelToGeo(x, y, zoom, tileSize) {
  const scale = tileSize * Math.pow(2, zoom);
  const lng = x / scale * 360 - 180;
  const n = Math.PI - 2 * Math.PI * (y / scale);
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}
function toDMS(deg, axis) {
  const dir = axis === 'lat' ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
  const abs = Math.abs(deg), d = Math.floor(abs), mFull = (abs - d) * 60, m = Math.floor(mFull), s = Math.round((mFull - m) * 60 * 10) / 10;
  return `${d}°${m}'${s}"${dir}`;
}

/** Orion.geo — geolocation & geometry helpers, independent of <o-map>. */
const geo = {
  /** current({ enableHighAccuracy, timeout, maximumAge }) -> Promise<{lat,lng,accuracy,altitude,heading,speed,timestamp}> */
  current(opts = {}) {
    return new Promise((resolve, reject) => {
      if (!isBrowser || !navigator.geolocation) return reject(new Error('Geolocation is not available'));
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, altitude: pos.coords.altitude, heading: pos.coords.heading, speed: pos.coords.speed, timestamp: pos.timestamp }),
        err => reject(err),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 0, ...opts },
      );
    });
  },
  /** watch(fn(pos, err), opts) -> stop() */
  watch(fn, opts = {}) {
    if (!isBrowser || !navigator.geolocation) return noop;
    const id = navigator.geolocation.watchPosition(
      pos => fn({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, heading: pos.coords.heading, speed: pos.coords.speed, timestamp: pos.timestamp }, null),
      err => fn(null, err),
      { enableHighAccuracy: false, ...opts },
    );
    return () => navigator.geolocation.clearWatch(id);
  },
  /** distance(a, b) -> meters (haversine great-circle distance) */
  distance(a, b) {
    const R = 6371000, toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  },
  /** bearing(a, b) -> degrees clockwise from north */
  bearing(a, b) {
    const toRad = d => d * Math.PI / 180, toDeg = r => r * 180 / Math.PI;
    const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
    const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  },
  /** format({lat,lng}, 'dms'|'decimal') -> string */
  format(latlng, style = 'decimal') {
    if (!latlng) return '';
    if (style === 'dms') return `${toDMS(latlng.lat, 'lat')} ${toDMS(latlng.lng, 'lng')}`;
    return `${round(latlng.lat, 5)}, ${round(latlng.lng, 5)}`;
  },
  /** bounds([{lat,lng}, ...]) -> { north, south, east, west } */
  bounds(points) {
    const list = toArr(points).filter(p => p && isNum(p.lat) && isNum(p.lng));
    if (!list.length) return null;
    let north = -90, south = 90, east = -180, west = 180;
    list.forEach(p => { north = Math.max(north, p.lat); south = Math.min(south, p.lat); east = Math.max(east, p.lng); west = Math.min(west, p.lng); });
    return { north, south, east, west };
  },
};
O.geo = geo;
