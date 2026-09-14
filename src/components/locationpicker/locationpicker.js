// @deps map, geocode
/* <o-location-picker lat lng zoom mode="crosshair|marker" radius name required> — pick a point on a map:
 * drag the map under a fixed centre crosshair (default) or drag a marker, search an address, use the
 * device location, see the reverse-geocoded address and copy the coordinates.
 * Form-associated value: { lat, lng, address }, submitted as `name`="lat,lng" plus an
 * `${addressName || name+'-address'}` field with the address text.
 * Events: o-change { value }. Methods: setLocation(lat,lng,opts), clear(), focus().
 */
i18n.add('en', {
  locationPicker: {
    searchLabel: 'Search for an address', useLocation: 'Use my current location', locating: 'Locating…',
    locateError: 'Could not determine your location', noAddress: 'No address found for this location',
    addressError: 'Could not look up the address', marker: 'Selected location', copy: 'Copy coordinates',
    copied: 'Coordinates copied', instructions: 'Drag the map, drag the pin, search an address, or use your current location.',
  },
});

class OLocationPicker extends FormElement {
  static props = {
    ...FormElement.props,
    value: { type: Any, default: null },
    lat: { type: Number, default: 3.139 },
    lng: { type: Number, default: 101.6869 },
    zoom: { type: Number, default: 14 },
    mode: { type: String, default: 'crosshair', reflect: true },
    tiles: { type: Any, default: 'offline' },
    provider: { type: String, default: 'mock' },
    countryCodes: { type: String, attr: 'country-codes' },
    lang: String,
    radius: { type: Number, default: 0 },
    addressName: { type: String, attr: 'address-name' },
    reverseGeocode: { type: Boolean, default: true, attr: 'reverse-geocode' },
    email: String,
    height: { type: String, default: '18rem' },
    texts: Object,
  };

  setup() {
    this.classList.add('o-location-picker');
    this._reverseDebounced = debounce((lat, lng) => this._reverseGeocode(lat, lng), 400);

    this.addressInput = h('o-address-input', { class: 'o-lp-address' });
    this.locateBtn = h('button', { type: 'button', class: 'o-btn o-btn-outline-primary o-btn-icon o-lp-locate' }, icon('crosshair'));
    this.searchRow = h('div', { class: 'o-lp-search' }, this.addressInput, this.locateBtn);

    this.mapEl = h('o-map', { class: 'o-lp-map', controls: 'zoom', 'cluster-radius': 0 });
    this.crosshair = h('div', { class: 'o-lp-crosshair', 'aria-hidden': 'true' });
    this.crosshair.innerHTML = String(icon('map-pin', { size: 30 }));
    this.mapWrap = h('div', { class: 'o-lp-mapwrap' }, this.mapEl, this.crosshair);

    this.addressOut = h('div', { class: 'o-lp-address-out' });
    this.coordsOut = h('button', { type: 'button', class: 'o-lp-coords' });
    this.infoRow = h('div', { class: 'o-lp-info' }, this.addressOut, this.coordsOut);
    this.hint = h('div', { class: 'o-sr-only' }, this.t('locationPicker.instructions'));

    this.append(this.searchRow, this.mapWrap, this.infoRow, this.hint);

    on(this.locateBtn, 'click', () => this._useMyLocation());
    on(this.addressInput, 'o-change', e => { if (e.detail.value) this._setFromSearch(e.detail.value); });
    on(this.mapEl, 'o-move', e => { if (this.mode === 'crosshair') this._commit(e.detail.lat, e.detail.lng); });
    on(this.mapEl, 'o-click', e => {
      if (this.mode === 'marker') { this._syncMarkerPos(e.detail.lat, e.detail.lng); this._commit(e.detail.lat, e.detail.lng); }
      else this.mapEl.flyTo(e.detail.lat, e.detail.lng, this.mapEl.getZoom());
    });
    on(this.mapEl, 'o-marker-drag-end', e => { if (this.mode === 'marker') this._commit(e.detail.lat, e.detail.lng); });
    on(this.coordsOut, 'click', () => this._copyCoords());
    this.focusTarget = this.addressInput;
  }
  connected() {}

  update(changed) {
    const init = changed.has('init');
    if (init || changed.has('locale')) {
      this.locateBtn.setAttribute('aria-label', this.t('locationPicker.useLocation')); this.locateBtn.title = this.t('locationPicker.useLocation');
      this.coordsOut.setAttribute('aria-label', this.t('locationPicker.copy')); this.coordsOut.title = this.t('locationPicker.copy');
      this.hint.textContent = this.t('locationPicker.instructions');
    }
    if (init || changed.has('tiles')) this.mapEl.tiles = this.tiles;
    if (init || changed.has('height')) this.mapWrap.style.height = this.height || '';
    if (init || changed.has('provider') || changed.has('countryCodes') || changed.has('lang') || changed.has('email')) {
      this.addressInput.provider = this.provider; this.addressInput.countryCodes = this.countryCodes; this.addressInput.lang = this.lang; this.addressInput.email = this.email;
      this.addressInput.placeholder = this.t('locationPicker.searchLabel');
    }
    if (init || changed.has('disabled')) { this.addressInput.disabled = this.isDisabled; this.locateBtn.disabled = this.isDisabled; this.coordsOut.disabled = this.isDisabled; }
    if (init || changed.has('mode')) {
      this.crosshair.hidden = this.mode !== 'crosshair';
      if (this.mode === 'marker') this._syncMarkerPos(this._lat ?? this.lat, this._lng ?? this.lng);
      else if (this._markerId) { this.mapEl.removeMarker(this._markerId); this._markerId = null; }
    }
    if (init) {
      this._lat = clamp(this.lat, -85, 85); this._lng = this.lng;
      this.mapEl.setView(this._lat, this._lng, this.zoom);
      if (this.mode === 'marker') this._syncMarkerPos(this._lat, this._lng);
      this._updateCoordsUI(this._lat, this._lng);
      this._drawRadius(this._lat, this._lng);
      const seed = isObj(this.value) ? this.value : { lat: this._lat, lng: this._lng, address: '' };
      this.__internalValue = true; this.value = seed; this._syncForm(); this.__internalValue = false;
      this.addressOut.textContent = seed.address || '';
      if (!seed.address && this.reverseGeocode) this._reverseDebounced(this._lat, this._lng);
    } else if (changed.has('value') && !this.__internalValue) {
      const v = this.value;
      if (v && isNum(v.lat) && isNum(v.lng)) {
        this.addressOut.textContent = v.address || '';
        // Only touch the map when the position actually moved. `setView()` unconditionally
        // fires o-move/o-zoom on mapEl (even for a no-op call), which the listener below feeds
        // straight back into setValue() -> this reactive branch again; without this guard an
        // external `.value = {...}` assignment (or the picker's own _commit(), whose lat/lng
        // always match what was just fed in) reschedules itself forever, one microtask at a
        // time (OElement batches synchronous prop writes, so it never throws — it just never
        // stops repainting the map).
        if (v.lat !== this._lat || v.lng !== this._lng) {
          this._lat = v.lat; this._lng = v.lng;
          this.mapEl.setView(v.lat, v.lng, this.mapEl.getZoom());
          if (this.mode === 'marker') this._syncMarkerPos(v.lat, v.lng);
          this._drawRadius(v.lat, v.lng);
        }
        this._updateCoordsUI(v.lat, v.lng);
      }
    }
    if (changed.has('radius') && !init) this._drawRadius(this._lat, this._lng);
  }

  /* ── internal wiring ──────────────────────────────────────────────── */
  _syncMarkerPos(lat, lng) {
    if (this._markerId) this.mapEl.updateMarker(this._markerId, { lat, lng });
    else this._markerId = this.mapEl.addMarker({ lat, lng, draggable: true, title: this.t('locationPicker.marker') });
  }
  _setFromSearch(v) {
    this._searchAddress = v.address || '';
    const z = Math.max(this.mapEl.getZoom(), 16);
    if (this.mode === 'marker') { this._syncMarkerPos(v.lat, v.lng); this.mapEl.setView(v.lat, v.lng, z); this._commit(v.lat, v.lng); }
    else this.mapEl.flyTo(v.lat, v.lng, z);
  }
  _commit(lat, lng) {
    this._lat = lat; this._lng = lng;
    this._updateCoordsUI(lat, lng);
    this._drawRadius(lat, lng);
    const addr = this._searchAddress; this._searchAddress = null;
    this.__internalValue = true;
    if (addr != null) { this.addressOut.textContent = addr || this.t('locationPicker.noAddress'); this.setValue({ lat, lng, address: addr }); }
    else { this.setValue({ lat, lng, address: this.value?.address || '' }); if (this.reverseGeocode) this._reverseDebounced(lat, lng); }
    this.__internalValue = false;
  }
  async _reverseGeocode(lat, lng) {
    this._reqId = (this._reqId || 0) + 1;
    const reqId = this._reqId;
    this.addressOut.classList.add('is-loading');
    try {
      const addr = await O.geocode.reverse(lat, lng, { provider: this.provider, lang: this.lang, email: this.email });
      if (reqId !== this._reqId || lat !== this._lat || lng !== this._lng) return;
      const label = addr?.label || '';
      this.addressOut.textContent = label || this.t('locationPicker.noAddress');
      this.__internalValue = true; this.value = { lat, lng, address: label }; this._syncForm(); this.__internalValue = false;
      this.emit('change', { value: this.value });
    } catch (e) { if (reqId === this._reqId) this.addressOut.textContent = this.t('locationPicker.addressError'); }
    finally { if (reqId === this._reqId) this.addressOut.classList.remove('is-loading'); }
  }
  async _useMyLocation() {
    this.locateBtn.classList.add('is-loading'); this.locateBtn.disabled = true;
    try {
      const pos = await O.geo.current({ enableHighAccuracy: true, timeout: 8000 });
      const z = Math.max(this.mapEl.getZoom(), 16);
      if (this.mode === 'marker') { this._syncMarkerPos(pos.lat, pos.lng); this.mapEl.setView(pos.lat, pos.lng, z); this._commit(pos.lat, pos.lng); }
      else this.mapEl.flyTo(pos.lat, pos.lng, z);
    } catch (e) { announce(this.t('locationPicker.locateError')); this.emit('locate-error', { error: e }); }
    finally { this.locateBtn.classList.remove('is-loading'); this.locateBtn.disabled = false; }
  }
  _updateCoordsUI(lat, lng) { this.coordsOut.textContent = `${round(lat, 6)}, ${round(lng, 6)}`; }
  _drawRadius(lat, lng) {
    if (this._circleId) { this.mapEl.removeLayer(this._circleId); this._circleId = null; }
    if (this.radius > 0) this._circleId = this.mapEl.addLayer({ type: 'circle', center: [lat, lng], radius: this.radius, style: { color: 'var(--o-primary)', weight: 2, fillOpacity: 0.12 } });
  }
  async _copyCoords() {
    const text = this.coordsOut.textContent;
    try { await navigator.clipboard.writeText(text); } catch { const ta = doc.createElement('textarea'); ta.value = text; doc.body.append(ta); ta.select(); doc.execCommand('copy'); ta.remove(); }
    this.coordsOut.classList.add('is-copied');
    clearTimeout(this._copyT); this._copyT = setTimeout(() => this.coordsOut.classList.remove('is-copied'), 1200);
    announce(this.t('locationPicker.copied'));
  }

  /* ── public API ───────────────────────────────────────────────────── */
  isEmpty() { return !this.value || !isNum(this.value.lat) || !isNum(this.value.lng); }
  formValue() {
    const v = this.value; if (!v || !isNum(v.lat) || !isNum(v.lng)) return null;
    const fd = new FormData();
    if (this.name) fd.append(this.name, `${round(v.lat, 6)},${round(v.lng, 6)}`);
    const addrName = this.addressName || (this.name ? this.name + '-address' : '');
    if (addrName && v.address) fd.append(addrName, v.address);
    return fd;
  }
  /** setLocation(lat, lng, { address }) — move the picker programmatically (like a user pick). */
  setLocation(lat, lng, opts = {}) {
    if (this.mode === 'marker') this._syncMarkerPos(lat, lng);
    this.mapEl.setView(lat, lng, Math.max(this.mapEl.getZoom(), this.zoom));
    this._searchAddress = opts.address ?? null;
    this._commit(lat, lng);
    return this;
  }
  clear() { this.addressInput.clear(); this.__internalValue = true; this.setValue(null); this.__internalValue = false; this.addressOut.textContent = ''; }
  focus(opts) { this.addressInput.focus(opts); }
}
define('o-location-picker', OLocationPicker);
O.LocationPicker = OLocationPicker;
