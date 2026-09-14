/* ============================================================================
 * Optional Google Maps adapter — never loaded unless the developer opts in
 * (either `Orion.maps.google.load({ key })` or `<o-map provider="google" api-key>`).
 *   Orion.maps.google.load({ key, libraries, language, region }) -> Promise<google.maps>
 *   <o-map provider="google" api-key="..." map-id="...">  — same element API (setView,
 *   markers, popups, fitBounds, o-* events) rendered with the real Google Maps JS API.
 * Requires a billing-enabled Google Cloud Maps JavaScript API key that the developer supplies.
 * ========================================================================== */
O.maps = O.maps || {};
if (!O.maps.google) {
  let gPromise = null;
  O.maps.google = {
    /** load({ key, libraries, language, region, version }) -> Promise<google.maps> (loaded once, cached). */
    load(opts = {}) {
      if (!isBrowser) return Promise.reject(new Error('Orion.maps.google.load requires a browser'));
      if (win.google?.maps) return Promise.resolve(win.google.maps);
      if (gPromise) return gPromise;
      const { key, libraries = ['places', 'marker'], language, region, version = 'weekly' } = opts;
      if (!key) return Promise.reject(new Error('Orion.maps.google.load requires { key }'));
      const params = new URLSearchParams({ key, v: version, loading: 'async', libraries: toArr(libraries).join(',') });
      if (language) params.set('language', language);
      if (region) params.set('region', region);
      gPromise = loadScript(`https://maps.googleapis.com/maps/api/js?${params}`).then(() => {
        if (!win.google?.maps) throw new Error('Google Maps failed to initialize');
        return win.google.maps;
      }).catch(err => { gPromise = null; throw err; });
      return gPromise;
    },
    get loaded() { return !!(isBrowser && win.google?.maps); },
  };
}

Object.assign(OMap.prototype, {
  async _initGoogle() {
    if (this._gReady || this._gLoading) return this._gReady;
    this._gLoading = true;
    try {
      let gmaps = win.google?.maps;
      if (!gmaps) {
        if (!this.apiKey) throw new Error('<o-map provider="google"> needs api-key, or call Orion.maps.google.load({ key }) before it connects');
        gmaps = await O.maps.google.load({ key: this.apiKey });
      }
      this._gMarkers = new Map();
      this._gInfo = new gmaps.InfoWindow();
      this._g = new gmaps.Map(this.gEl, {
        center: { lat: this.lat, lng: this.lng }, zoom: this.zoom, mapId: this.mapId || undefined,
        gestureHandling: 'greedy', fullscreenControl: true, streetViewControl: false,
      });
      this._g.addListener('click', e => e.latLng && this.emit('click', { lat: e.latLng.lat(), lng: e.latLng.lng() }));
      this._g.addListener('dragend', () => { const c = this._g.getCenter(); this.__syncing = true; this.lat = c.lat(); this.lng = c.lng(); this.__syncing = false; this.emit('move', { lat: c.lat(), lng: c.lng() }); });
      this._g.addListener('zoom_changed', () => { this.__syncing = true; this.zoom = this._g.getZoom(); this.__syncing = false; this.emit('zoom', { zoom: this._g.getZoom() }); });
      this._gReady = true;
      this._gSyncMarkers();
      return true;
    } catch (e) {
      console.error('[Orion] <o-map provider="google">', e);
      // _gSyncMarkers() can call in here before _applyProvider() has created gEl (see the guard
      // added in 30-markers.js _afterMarkersChanged) — stay defensive regardless.
      if (this.gEl) this.gEl.textContent = e.message;
      return false;
    } finally { this._gLoading = false; }
  },
  async _gSyncMarkers() {
    if (!await this._initGoogle()) return;
    const gmaps = win.google.maps;
    const AdvancedMarker = this.mapId && gmaps.marker ? gmaps.marker.AdvancedMarkerElement : null;
    this._gMarkers.forEach(gm => (gm.map = null));
    this._gMarkers.clear();
    for (const m of this.markersList) {
      let gm;
      if (AdvancedMarker) gm = new AdvancedMarker({ map: this._g, position: { lat: m.lat, lng: m.lng }, title: m.title || '' });
      else gm = new gmaps.Marker({ map: this._g, position: { lat: m.lat, lng: m.lng }, title: m.title || '', draggable: !!m.draggable });
      const clickEvt = AdvancedMarker ? 'gmp-click' : 'click';
      gm.addListener?.(clickEvt, () => {
        this.emit('marker-click', { marker: m });
        if (m.popup) { this._gInfo.setContent(isFn(m.popup) ? m.popup(m) : m.popup); this._gInfo.open({ map: this._g, anchor: gm }); }
      });
      if (!AdvancedMarker && m.draggable) gm.addListener('dragend', e => { m.lat = e.latLng.lat(); m.lng = e.latLng.lng(); this.emit('marker-drag-end', { id: m.id, lat: m.lat, lng: m.lng, marker: m }); });
      this._gMarkers.set(m.id, gm);
    }
  },
});
