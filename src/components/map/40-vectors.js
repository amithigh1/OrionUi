/* ============================================================================
 * <o-map> — vector overlay (SVG): polylines, polygons, circles (metre radius),
 * rectangles and GeoJSON (Point/LineString/Polygon/Multi* + style/popup fns).
 * Extends OMap.prototype (defined in 20-map.js, same folder scope).
 * ========================================================================== */
Object.assign(OMap.prototype, {
  _applyVectorStyle(el, style = {}, isLine) {
    el.setAttribute('stroke', style.color || 'var(--o-primary)');
    el.setAttribute('stroke-width', style.weight ?? 3);
    el.setAttribute('stroke-opacity', style.opacity ?? 0.9);
    if (style.dashArray) el.setAttribute('stroke-dasharray', style.dashArray); else el.removeAttribute('stroke-dasharray');
    if (isLine) el.setAttribute('fill', 'none');
    else { el.setAttribute('fill', style.fillColor || style.color || 'var(--o-primary)'); el.setAttribute('fill-opacity', style.fillOpacity ?? 0.18); }
  },
  _renderVectorEl(layer) {
    const isLine = layer.type === 'polyline';
    const el = svg(layer.type === 'circle' ? 'circle' : layer.type === 'polyline' ? 'polyline' : 'polygon', { class: 'o-map-vector', 'data-id': layer.id });
    this._applyVectorStyle(el, layer.style, isLine);
    if (layer.popup) {
      el.style.pointerEvents = 'auto'; el.style.cursor = 'pointer';
      on(el, 'pointerdown', e => e.stopPropagation());
      on(el, 'click', e => { e.stopPropagation(); this._openLayerPopup(layer, this.unproject(this._pointFromEvent(e))); });
    }
    return el;
  },
  _updateVectors() {
    for (const [, layer] of this._layers) {
      if (!layer.el) { layer.el = this._renderVectorEl(layer); this.svg.appendChild(layer.el); }
      if (layer.type === 'polyline' || layer.type === 'polygon') {
        layer.el.setAttribute('points', layer.points.map(([lat, lng]) => { const p = this.project({ lat, lng }); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' '));
      } else if (layer.type === 'rectangle') {
        const b = layer.bounds;
        const corners = [[b.north, b.west], [b.north, b.east], [b.south, b.east], [b.south, b.west]];
        layer.el.setAttribute('points', corners.map(([lat, lng]) => { const p = this.project({ lat, lng }); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' '));
      } else if (layer.type === 'circle') {
        const c = this.project({ lat: layer.center[0], lng: layer.center[1] });
        const mpp = metersPerPixel(layer.center[0], this._zoom, this.tileSize);
        layer.el.setAttribute('cx', c.x.toFixed(1)); layer.el.setAttribute('cy', c.y.toFixed(1)); layer.el.setAttribute('r', Math.max(0.5, layer.radius / mpp).toFixed(1));
      }
    }
  },
  /** addLayer({ type:'polyline'|'polygon'|'rectangle'|'circle', points|bounds|center+radius, style, popup, data }) -> id */
  addLayer(layer) {
    const id = layer.id != null ? String(layer.id) : uid('lyr');
    this._layers.set(id, { ...layer, id, el: null });
    this._scheduleRender(true);
    return id;
  },
  removeLayer(id) {
    id = String(id);
    const l = this._layers.get(id);
    if (l) { l.el?.remove(); this._layers.delete(id); this._scheduleRender(); }
    return this;
  },
  clearLayers() { this._layers.forEach(l => l.el?.remove()); this._layers.clear(); return this; },
  /** addGeoJSON(geojson, { style(feature), popup(feature) }) -> [ids] (markers for Points, layers for lines/polygons) */
  addGeoJSON(geojson, opts = {}) {
    const ids = [];
    const styleFor = f => isFn(opts.style) ? (opts.style(f) || {}) : (opts.style || {});
    const popupFor = f => isFn(opts.popup) ? opts.popup(f) : (opts.popup !== undefined ? opts.popup : (f.properties && f.properties.popup) || null);
    const addFeature = (geom, props) => {
      if (!geom) return;
      const feature = { type: 'Feature', geometry: geom, properties: props || {} };
      const style = styleFor(feature), popup = popupFor(feature);
      const ring = coords => coords.map(c => [c[1], c[0]]);
      if (geom.type === 'Point') ids.push(this.addMarker({ lat: geom.coordinates[1], lng: geom.coordinates[0], title: props?.name || props?.title, color: style.color, popup, data: props }));
      else if (geom.type === 'MultiPoint') geom.coordinates.forEach(c => ids.push(this.addMarker({ lat: c[1], lng: c[0], title: props?.name, color: style.color, popup, data: props })));
      else if (geom.type === 'LineString') ids.push(this.addLayer({ type: 'polyline', points: ring(geom.coordinates), style, popup, data: props }));
      else if (geom.type === 'MultiLineString') geom.coordinates.forEach(line => ids.push(this.addLayer({ type: 'polyline', points: ring(line), style, popup, data: props })));
      else if (geom.type === 'Polygon') ids.push(this.addLayer({ type: 'polygon', points: ring(geom.coordinates[0]), style, popup, data: props }));
      else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => ids.push(this.addLayer({ type: 'polygon', points: ring(poly[0]), style, popup, data: props })));
      else if (geom.type === 'GeometryCollection') geom.geometries.forEach(g => addFeature(g, props));
    };
    const feats = geojson.type === 'FeatureCollection' ? geojson.features : geojson.type === 'Feature' ? [geojson] : [{ geometry: geojson, properties: {} }];
    feats.forEach(f => addFeature(f.geometry, f.properties || {}));
    return ids;
  },
});
