# map

`<o-map>` — a self-contained slippy map (Web Mercator projection, its own tile pyramid, pointer/
wheel/pinch/keyboard navigation, marker clustering, popups, an SVG vector layer and an optional
Google Maps provider) plus `Orion.geo` (geolocation & geometry helpers) and `Orion.maps.google`
(the lazy-loading Google adapter). No third-party map library.

Docs: `docs/components/maps.html`, `docs/components/google-maps.html`. Fixtures: `docs/fixtures/maps/`.

## Files

| File | Contents |
|---|---|
| `00-geo.js` | Web Mercator projection math (`geoToPixel`/`pixelToGeo`), `Orion.geo` (geolocation, distance, bearing, formatting, bounds). No DOM. |
| `10-tiles.js` | Tile sources: URL templates, the deterministic offline canvas generator, `loadTileElement()` (retry + error fallback), and the `TileCache` class (instantiated per map, see 20-map.js). |
| `20-map.js` | The `<o-map>` element itself: skeleton, render loop, pointer/wheel/keyboard interaction, `setView`/`flyTo`/`fitBounds`, chrome controls (zoom, locate, fullscreen, scale, layers), `Orion.map()`. |
| `30-markers.js` | Marker CRUD, clustering + spiderfy, the marker/cluster DOM, popups, the accessible marker-list view. Extends `OMap.prototype`. |
| `40-vectors.js` | Vector overlay: polyline/polygon/rectangle/circle, `addGeoJSON()`. Extends `OMap.prototype`. |
| `50-google.js` | `Orion.maps.google` (lazy script loader) + the `provider="google"` branch of `OMap` (real Google Maps JS API rendering). Extends `OMap.prototype`. |
| `map.css` | All chrome styling. Tile/marker/popup *positions* are set with inline `transform`/`top`/`left` from JS (pixel-space, not text-direction-dependent) — those stay physical on purpose; everything else (attribution corner, controls, popup padding, list items) uses logical properties for RTL. |

## Public API

| Name | Kind | Description |
|---|---|---|
| `<o-map>` | element | The map. |
| `Orion.Map` | class | The `OMap` class (same as `document.createElement('o-map').constructor`). |
| `Orion.map(target, opts)` | function | Mounts a new `<o-map>` into `target` (Element or selector), assigning `opts` as properties. |
| `Orion.geo` | service | `current(opts)`, `watch(fn, opts)`, `distance(a,b)`, `bearing(a,b)`, `format(latlng, style)`, `bounds(points)`. Usable without ever touching `<o-map>`. |
| `Orion.maps.google` | service | `load({ key, libraries, language, region, version })`, `loaded`. Only requested when you call it or set `api-key`. |

## `<o-map>` props / attributes

| Attribute | Type | Default | Notes |
|---|---|---|---|
| `lat`, `lng`, `zoom` | number | `20`, `0`, `3` | Reflected. |
| `min-zoom`, `max-zoom` | number | `1`, `19` | |
| `tiles` | `"osm"` \| `"offline"` \| URL template \| function | `osm` | `osm` needs network. `offline` (procedural canvas) needs none — **use it for tests/CI/anywhere without network**, or point `tiles` at a single static file (see `docs/fixtures/maps/tile.svg`) for a pixel-stable "fixture" tile. A function receives `{x,y,z,size}` and may return a URL string, an `Element`, or a `Promise` of either. |
| `tile-size`, `retina` | number, boolean | `256`, `false` | |
| `tile-filter` | `"dark"` | | CSS filter to darken real raster imagery. |
| `attribution` | string | | Overrides the auto attribution (OSM's is filled in for you). |
| `controls` | comma list: `zoom,locate,fullscreen,scale,layers` | `zoom` | |
| `scroll-zoom` | boolean | `true` | |
| `cluster`, `cluster-radius` | boolean, number | `true`, `60` | Set `cluster-radius="0"` (or `cluster="false"`) to disable clustering, e.g. when every marker must stay individually addressable (as `<o-location-picker>` does). |
| `markers` | array | `[]` | See marker shape below. Re-assigning replaces all; prefer the imperative methods to mutate. |
| `base-layers` | array | `[]` | `[{ id, label, tiles, attribution }]`, shown by the `layers` control when there are 2+. |
| `height` | string | | Shorthand for `style="height:…"`. |
| `label` | string | | Accessible name of the map region. |
| `provider`, `api-key`, `map-id` | string | | `provider="google"` renders with the real Google Maps JS API — see `docs/components/google-maps.html`. Never embed a real key in source; ship it via your own config/env. |

Marker shape: `{ id, lat, lng, title, icon, html, color, draggable, popup, tooltip, data }` — `icon`/
`html`/`popup` are trusted HTML (pass through `esc()`/`html` yourself if the content is user-supplied).

## Methods

`setView(lat,lng,zoom?)`, `flyTo(lat,lng,zoom?,{duration})`, `fitBounds(bounds|points[],{padding,animate})`,
`setMarkers(list)`, `addMarker(m)→id`, `updateMarker(id,patch)`, `removeMarker(id)`, `markersList` (getter,
`Object.defineProperty` — **not** inside an `Object.assign()` literal, see ARCHITECTURE.md §5 item 4b),
`addLayer({type,...})→id`, `removeLayer(id)`, `clearLayers()`, `addGeoJSON(geojson,{style,popup})→[ids]`,
`project(latlng)→{x,y}`, `unproject(point)→{lat,lng}`, `getCenter()`, `getZoom()`, `getBounds()`,
`invalidateSize()`, `locate()→Promise`.

## Events

`o-click {lat,lng}`, `o-move {lat,lng}`, `o-zoom {zoom}`, `o-marker-click {marker}`,
`o-marker-drag-end {id,lat,lng,marker}`, `o-locate {lat,lng,...}`, `o-locate-error {error}`.

## Keyboard / accessibility

Arrow keys pan (mirrored in RTL), `+`/`-` zoom, `Home` resets to the initial view, `Escape` closes an
open popup. Markers and clusters are real `<button>`s (reachable by Tab, activated with Enter/Space).
The "View markers as a list" control (shown automatically once there is at least one marker) opens a
full keyboard/screen-reader list view as an alternative to hunting for pins on the canvas — this is the
primary accessible path to markers that overlap or sit off-screen. `role="region"` +
`aria-roledescription="map"` on the host; a visually-hidden hint documents the keyboard shortcuts.

## Known bugs found and fixed in this pass

- **`markersList` getter crash** (pre-existing, already fixed before this pass): a getter cannot live
  inside an `Object.assign()` source literal — `Object.assign` *reads* the getter once against the
  literal and copies the resulting value, crashing at load time. Moved to `Object.defineProperty`.
- **Tile cache was a module-level singleton shared by every `<o-map>` instance.** A cached tile
  element can only be attached under one DOM parent; when two different map instances needed the
  same `z/x/y` (very likely — e.g. two dashboard maps of the same city/zoom, or simply by
  coincidence), whichever map rendered second would think it had the tile (bookkeeping updated) but
  the element stayed attached to the first map, leaving the second map's tile area blank. Fixed by
  making `TileCache` per-instance (`this._tileCache`, created in `setup()`).
- **Tiles painted over markers/vectors/popups.** `.o-map-level` (a zoom-crossfade layer) sets an
  explicit numeric `z-index`; without an intervening stacking context that z-index escaped
  `.o-map-tiles` and was compared directly against `.o-map-svg`/`.o-map-markers`/`.o-map-popups`
  (all `z-index:auto`), and CSS paints explicit-z-index elements *after* (i.e. above) `auto` ones —
  so the tile layer rendered on top of every marker, vector and popup. Fixed with
  `.o-map-tiles { isolation: isolate; }`, containing the crossfade z-index locally.
- **`<o-map popup>` padding was physical**, leaving asymmetric space for the close button
  (`inset-inline-end`) only in LTR. Changed to `padding-block`/`padding-inline`.
- **`provider="google"` without an `api-key` crashed** with an unhandled promise rejection
  (`Cannot set properties of undefined (setting 'textContent')`) instead of failing gracefully.
  `setMarkers()` runs before `_applyProvider()` in the prop-update cycle, and *every* prop is in the
  first update's `changed` set (even with zero markers) — so `_gSyncMarkers()` called `_initGoogle()`
  before `_applyProvider()` had created `this.gEl`, and the error handler's `this.gEl.textContent = …`
  then threw a second, unhandled error. Fixed by only syncing Google markers once `this.gEl` exists
  (`30-markers.js`) and by making the error handler itself defensive (`50-google.js`).

## Limitations

- Vector layers (`addLayer`/`addGeoJSON`) and the marker-list accessibility view are specific to the
  built-in renderer; they have no effect with `provider="google"` — use Google's own
  `Polyline`/`Polygon`/`Data` APIs via `map._g` (the underlying `google.maps.Map`) instead.
- `scroll-zoom`, `tiles`, `tile-filter` and clustering only apply to the built-in renderer.
- Offline `tiles="offline"` tiles are a deterministic placeholder (a grid, a couple of land-ish
  blobs, the `z/x/y` label) — not real cartography. They exist so demos, screenshots and CI never
  need network access.
- The `nominatim`/`photon` search providers used by `<o-address-input>`/`<o-location-picker>` (see
  the `geocode` package) need the optional `http` package in custom `--only` builds.
