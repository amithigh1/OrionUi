// @deps autocomplete
/* <o-address-input> — debounced address suggestions built on the finished <o-autocomplete>
 * (keyboard, highlighting, loading/empty/error states come for free) plus Orion.geocode, a small
 * provider registry for forward/reverse geocoding.
 *   <o-address-input name="address" provider="mock" fill='{"city":"#city","postcode":"#postcode"}'>
 *   Orion.geocode.search('Petronas Towers', { provider: 'nominatim', countryCodes: 'my' })
 *   Orion.geocode.reverse(3.1579, 101.7116, { provider: 'nominatim' })
 * Providers: nominatim (OSM, throttled >=1s + cached, `email` identifies your app per its usage policy),
 * photon, google (Places, via Orion.maps.google — must be loaded first), mock (offline, default),
 * custom: pass `source: async (q, opts) => results` as a property (bypasses the registry for this
 * element only), or register one for every element with `Orion.geocode.addProvider(name, impl)`.
 * Result shape: { label, lat, lng, street, houseNumber, postcode, city, state, country, countryCode, raw }
 * Events: o-change { value }  (value = the structured result or null). Methods: search(q), clear(), focus().
 */
i18n.add('en', {
  geocode: {
    placeholder: 'Search for an address', noResults: 'No matching address', error: 'Address search failed',
    useLocation: 'Use my current location', locating: 'Locating…', locateError: 'Could not determine your location',
  },
});

/* ── small offline dataset: default & test provider, no network ─────────── */
const MOCK_ADDRESSES = [
  { label: 'Petronas Twin Towers, Kuala Lumpur City Centre, Kuala Lumpur, Malaysia', lat: 3.1579, lng: 101.7116, street: 'Jalan Ampang', houseNumber: '', postcode: '50450', city: 'Kuala Lumpur', state: 'W.P. Kuala Lumpur', country: 'Malaysia', countryCode: 'MY' },
  { label: 'Merdeka Square, Kuala Lumpur, Malaysia', lat: 3.1478, lng: 101.6953, street: 'Jalan Raja', houseNumber: '', postcode: '50050', city: 'Kuala Lumpur', state: 'W.P. Kuala Lumpur', country: 'Malaysia', countryCode: 'MY' },
  { label: 'Pavilion Kuala Lumpur, Bukit Bintang, Kuala Lumpur, Malaysia', lat: 3.1490, lng: 101.7133, street: 'Jalan Bukit Bintang', houseNumber: '168', postcode: '55100', city: 'Kuala Lumpur', state: 'W.P. Kuala Lumpur', country: 'Malaysia', countryCode: 'MY' },
  { label: 'KLCC Park, Kuala Lumpur, Malaysia', lat: 3.1569, lng: 101.7127, street: 'Jalan Ampang', houseNumber: '', postcode: '50088', city: 'Kuala Lumpur', state: 'W.P. Kuala Lumpur', country: 'Malaysia', countryCode: 'MY' },
  { label: 'Batu Caves, Gombak, Selangor, Malaysia', lat: 3.2379, lng: 101.6840, street: '', houseNumber: '', postcode: '68100', city: 'Gombak', state: 'Selangor', country: 'Malaysia', countryCode: 'MY' },
  { label: 'Sunway Pyramid, Bandar Sunway, Selangor, Malaysia', lat: 3.0733, lng: 101.6067, street: 'Persiaran Lagoon', houseNumber: '3', postcode: '47500', city: 'Subang Jaya', state: 'Selangor', country: 'Malaysia', countryCode: 'MY' },
  { label: 'Marina Bay Sands, Singapore', lat: 1.2834, lng: 103.8607, street: 'Bayfront Avenue', houseNumber: '10', postcode: '018956', city: 'Singapore', state: '', country: 'Singapore', countryCode: 'SG' },
  { label: 'Gardens by the Bay, Singapore', lat: 1.2816, lng: 103.8636, street: 'Bay East Avenue', houseNumber: '18', postcode: '018953', city: 'Singapore', state: '', country: 'Singapore', countryCode: 'SG' },
  { label: 'Merlion Park, Singapore', lat: 1.2868, lng: 103.8545, street: 'Fullerton Road', houseNumber: '1', postcode: '049178', city: 'Singapore', state: '', country: 'Singapore', countryCode: 'SG' },
  { label: 'Orchard Road, Singapore', lat: 1.3048, lng: 103.8318, street: 'Orchard Road', houseNumber: '', postcode: '238841', city: 'Singapore', state: '', country: 'Singapore', countryCode: 'SG' },
  { label: 'Changi Airport, Singapore', lat: 1.3644, lng: 103.9915, street: 'Airport Boulevard', houseNumber: '', postcode: '819663', city: 'Singapore', state: '', country: 'Singapore', countryCode: 'SG' },
  { label: 'Sentosa Island, Singapore', lat: 1.2494, lng: 103.8303, street: 'Sentosa Gateway', houseNumber: '', postcode: '098269', city: 'Singapore', state: '', country: 'Singapore', countryCode: 'SG' },
];
const mockHaversine = (a, b) => { const R = 6371000, tr = d => d * Math.PI / 180; const dLat = tr(b.lat - a.lat), dLng = tr(b.lng - a.lng); const s = Math.sin(dLat / 2) ** 2 + Math.cos(tr(a.lat)) * Math.cos(tr(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(s))); };
async function mockSearch(q, opts = {}) { await sleep(120); return fuzzySearch(MOCK_ADDRESSES, q, 'label', opts.limit || 6).map(a => ({ ...a })); }
async function mockReverse(lat, lng) { await sleep(80); let best = null, bestD = Infinity; for (const a of MOCK_ADDRESSES) { const d = mockHaversine({ lat, lng }, a); if (d < bestD) { bestD = d; best = a; } } return best ? { ...best, lat, lng, label: `Near ${best.label}` } : null; }

/* ── small response cache + Nominatim's required >=1 req/s throttle ─────── */
/* nominatim/photon are network providers built on the optional `http` package; give a clear
 * error instead of "Cannot read properties of undefined" when a custom build omits it. */
function requireHttp() {
  if (!O.http) throw new Error('Orion.geocode "nominatim"/"photon" providers require the "http" package in your build (or register your own with Orion.geocode.addProvider).');
  return O.http;
}
const __gcCache = new Map();
function gcGet(k, ttl = 60000) { const e = __gcCache.get(k); if (!e) return null; if (Date.now() - e.t > ttl) { __gcCache.delete(k); return null; } return e.v; }
function gcSet(k, v) { __gcCache.set(k, { t: Date.now(), v }); if (__gcCache.size > 300) __gcCache.delete(__gcCache.keys().next().value); }
let __nominatimLast = 0;
async function nominatimThrottle() { const wait = Math.max(0, 1000 - (Date.now() - __nominatimLast)); if (wait) await sleep(wait); __nominatimLast = Date.now(); }
function nominatimToAddr(r) {
  const a = r.address || {};
  return { label: r.display_name, lat: +r.lat, lng: +r.lon, street: a.road || a.pedestrian || a.footway || '', houseNumber: a.house_number || '', postcode: a.postcode || '', city: a.city || a.town || a.village || a.county || '', state: a.state || '', country: a.country || '', countryCode: (a.country_code || '').toUpperCase(), raw: r };
}
async function nominatimSearch(q, opts = {}) {
  const key = 'nom:s:' + q + '|' + (opts.countryCodes || '') + '|' + (opts.lang || '');
  const cached = gcGet(key); if (cached) return cached;
  await nominatimThrottle();
  const params = { format: 'jsonv2', q, addressdetails: 1, limit: opts.limit || 6 };
  if (opts.countryCodes) params.countrycodes = opts.countryCodes;
  if (opts.email) params.email = opts.email;
  const data = await requireHttp().get('https://nominatim.openstreetmap.org/search', { params, headers: opts.lang ? { 'Accept-Language': opts.lang } : {}, signal: opts.signal, timeout: 8000 });
  const out = toArr(data).map(nominatimToAddr);
  gcSet(key, out);
  return out;
}
async function nominatimReverse(lat, lng, opts = {}) {
  const key = 'nom:r:' + lat.toFixed(5) + ',' + lng.toFixed(5);
  const cached = gcGet(key); if (cached) return cached;
  await nominatimThrottle();
  const params = { format: 'jsonv2', lat, lon: lng, addressdetails: 1 };
  if (opts.email) params.email = opts.email;
  const data = await requireHttp().get('https://nominatim.openstreetmap.org/reverse', { params, headers: opts.lang ? { 'Accept-Language': opts.lang } : {}, signal: opts.signal, timeout: 8000 });
  const out = data ? nominatimToAddr(data) : null;
  gcSet(key, out);
  return out;
}

function photonToAddr(f) {
  const p = f.properties || {}, [lng, lat] = f.geometry.coordinates;
  return { label: [p.name, p.street, p.city, p.state, p.country].filter(Boolean).join(', '), lat, lng, street: p.street || '', houseNumber: p.housenumber || '', postcode: p.postcode || '', city: p.city || '', state: p.state || '', country: p.country || '', countryCode: (p.countrycode || '').toUpperCase(), raw: f };
}
async function photonSearch(q, opts = {}) {
  const params = { q, limit: opts.limit || 6 }; if (opts.lang) params.lang = opts.lang;
  const data = await requireHttp().get('https://photon.komoot.io/api/', { params, signal: opts.signal, timeout: 8000 });
  return toArr(data?.features).map(photonToAddr);
}
async function photonReverse(lat, lng, opts = {}) {
  const data = await requireHttp().get('https://photon.komoot.io/reverse', { params: { lat, lon: lng }, signal: opts.signal, timeout: 8000 });
  const f = data?.features?.[0];
  return f ? photonToAddr(f) : null;
}

/* ── Google Places (opt-in; requires Orion.maps.google.load({ libraries: ['places'] })) ── */
function googlePlaceToAddr(place) {
  const comp = (place.address_components || []);
  const part = types => comp.find(c => types.some(t => c.types.includes(t)))?.long_name || '';
  return {
    label: place.formatted_address || place.name, lat: place.geometry?.location?.lat?.() ?? place.geometry?.location?.lat, lng: place.geometry?.location?.lng?.() ?? place.geometry?.location?.lng,
    street: part(['route']), houseNumber: part(['street_number']), postcode: part(['postal_code']),
    city: part(['locality', 'postal_town']), state: part(['administrative_area_level_1']), country: part(['country']),
    countryCode: (comp.find(c => c.types.includes('country'))?.short_name || '').toUpperCase(), raw: place,
  };
}
async function googleSearch(q, opts = {}) {
  if (!win.google?.maps?.places) throw new Error('Load Orion.maps.google.load({ libraries: ["places"] }) before using provider="google"');
  const svc = googleSearch._svc || (googleSearch._svc = new google.maps.places.AutocompleteService());
  const preds = await new Promise((resolve, reject) => {
    svc.getPlacePredictions({ input: q, language: opts.lang, componentRestrictions: opts.countryCodes ? { country: opts.countryCodes.split(',') } : undefined }, (res, status) => {
      if (status === 'ZERO_RESULTS') return resolve([]);
      if (status !== 'OK') return reject(new Error('Google Places: ' + status));
      resolve(res || []);
    });
  });
  return preds.slice(0, opts.limit || 6).map(p => ({ label: p.description, lat: null, lng: null, placeId: p.place_id, needsDetails: true, raw: p }));
}
async function googleResolve(item) {
  if (!item?.needsDetails || !win.google?.maps?.places) return item;
  const svc = googleResolve._svc || (googleResolve._svc = new google.maps.places.PlacesService(doc.createElement('div')));
  return new Promise((resolve, reject) => {
    svc.getDetails({ placeId: item.placeId, fields: ['formatted_address', 'geometry', 'address_components', 'name'] }, (place, status) => {
      if (status !== 'OK' || !place) return reject(new Error('Google Places details: ' + status));
      resolve(googlePlaceToAddr(place));
    });
  });
}
async function googleReverse(lat, lng, opts = {}) {
  if (!win.google?.maps) throw new Error('Load Orion.maps.google.load() before using provider="google"');
  const geocoder = googleReverse._geocoder || (googleReverse._geocoder = new google.maps.Geocoder());
  const { results } = await geocoder.geocode({ location: { lat, lng }, language: opts.lang });
  return results?.[0] ? googlePlaceToAddr(results[0]) : null;
}

const GEOCODE_PROVIDERS = {
  mock: { search: mockSearch, reverse: mockReverse },
  nominatim: { search: nominatimSearch, reverse: nominatimReverse },
  photon: { search: photonSearch, reverse: photonReverse },
  google: { search: googleSearch, reverse: googleReverse, resolve: googleResolve },
};
const geocodeApi = {
  providers: GEOCODE_PROVIDERS,
  /** Orion.geocode.search(q, { provider, countryCodes, lang, limit, email, signal }) -> [Address] */
  async search(q, opts = {}) {
    if (!q || !String(q).trim()) return [];
    const p = isFn(opts.provider) ? { search: opts.provider } : GEOCODE_PROVIDERS[opts.provider || 'mock'];
    if (!p) throw new Error('Unknown geocode provider: ' + opts.provider);
    return toArr(await p.search(String(q).trim(), opts));
  },
  /** Orion.geocode.reverse(lat, lng, { provider, lang, email, signal }) -> Address | null */
  async reverse(lat, lng, opts = {}) {
    const p = GEOCODE_PROVIDERS[opts.provider || 'mock'];
    if (!p?.reverse) throw new Error('Provider "' + (opts.provider || 'mock') + '" does not support reverse geocoding');
    return p.reverse(lat, lng, opts);
  },
  /** Register (or override) a provider: { search(q, opts), reverse(lat, lng, opts) } */
  addProvider(name, impl) { GEOCODE_PROVIDERS[name] = impl; },
};
O.geocode = geocodeApi;

/* ── <o-address-input> ────────────────────────────────────────────────── */
class OAddressInput extends FormElement {
  static props = {
    ...FormElement.props,
    value: { type: Any, default: null },
    provider: { type: String, default: 'mock' },
    countryCodes: { type: String, attr: 'country-codes' },
    lang: String,
    placeholder: String,
    limit: { type: Number, default: 6 },
    fill: Object,
    // Named `source` (not `search`) on purpose: this class also has a public `search(q)` METHOD
    // (see below). A prop and a method of the same name collide — __setupProps() in
    // 40-component.js detects that "search" already has an own (non-generated) prototype member
    // and skips generating the reactive accessor for it, so `this.search` would always be the
    // class's own search() function, never whatever a developer assigned to the property, and
    // `isFn(this.search)` below would always be true — breaking every provider lookup, silently
    // (no error, just zero results, forever). `source` mirrors <o-autocomplete source> and has no
    // such collision.
    source: { type: Function, attr: false },
    email: String,
    apiKey: { type: String, attr: 'api-key' },
    texts: Object,
  };

  setup() {
    this.classList.add('o-address-input');
    this.ac = h('o-autocomplete', { class: 'o-address-input-ac', 'min-chars': 2, debounce: 350, icon: 'map-pin' });
    this.append(this.ac);
    this.ac.source = q => this._search(q);
    on(this.ac, 'o-select', e => { e.stopPropagation(); this._onSelect(e.detail); });
    // The inner <o-autocomplete> fires its own o-change (detail: { value: <plain text>, item })
    // whenever its free-text value changes. Left alone it bubbles straight through this host, so
    // a listener on <o-address-input> for the *documented* o-change ({ value: Address | null })
    // would also receive this differently-shaped one and have no reliable way to tell them apart.
    // Stop it here; _onSelect() above (via o-select) is what fires this element's own o-change.
    on(this.ac, 'o-change', e => e.stopPropagation());
    on(this.ac, 'o-input', e => { if (!e.detail.query) this._clearValue(); });
    on(this.ac, 'invalid', () => this._syncValidity());
    this.focusTarget = this.ac;
  }
  connected() { O.pickers?.syncLabel(this, this.ac); }
  update(changed) {
    const init = changed.has('init');
    if (init || changed.has('placeholder') || changed.has('locale')) this.ac.placeholder = this.placeholder || this.t('geocode.placeholder');
    if (init || changed.has('disabled')) this.ac.disabled = this.isDisabled;
    if (init || changed.has('readonly')) this.ac.readonly = this.readonly;
    if ((init || changed.has('value')) && !this.__picking) this.ac.value = this.value ? (this.value.address || this.value.label || '') : '';
  }
  async _search(q) {
    const opts = { countryCodes: this.countryCodes, lang: this.lang, limit: this.limit, email: this.email, provider: this.provider };
    const results = isFn(this.source) ? await this.source(q, opts) : await geocodeApi.search(q, opts);
    return toArr(results).map(r => ({ value: r.label, label: r.label, description: [r.city, r.state, r.country].filter(Boolean).join(', '), raw: r }));
  }
  async _onSelect({ item }) {
    let addr = item?.raw ?? item;
    if (addr?.needsDetails) { try { addr = await geocodeApi.providers[this.provider]?.resolve?.(addr) ?? addr; } catch (e) { console.error('[Orion] address-input:', e); } }
    this.__picking = true;
    this.setValue(addr ? { lat: addr.lat, lng: addr.lng, address: addr.label, street: addr.street, houseNumber: addr.houseNumber, postcode: addr.postcode, city: addr.city, state: addr.state, country: addr.country, countryCode: addr.countryCode } : null);
    this.__picking = false;
    this._fillFields(addr);
  }
  _clearValue() { if (this.value) this.setValue(null); }
  _fillFields(addr) {
    if (!addr || !isObj(this.fill)) return;
    const root = this.form || doc;
    for (const key of Object.keys(this.fill)) {
      const sel = this.fill[key];
      const target = isStr(sel) ? root.querySelector(sel) : sel;
      if (!target || !('value' in target)) continue;
      target.value = addr[key] ?? '';
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  /** Programmatically run a search and open the panel (e.g. from a "use my location" button after reverse geocoding). */
  search(q) { this.ac.search(q); }
  clear() { this.ac.clear(true); this._clearValue(); }
  focus(opts) { this.ac.focus(opts); }
}
define('o-address-input', OAddressInput);
O.AddressInput = OAddressInput;
