# geocode

`<o-address-input>` — a debounced address search field built on `<o-autocomplete>` (see
`src/components/autocomplete/`, declared as `// @deps autocomplete`) plus `Orion.geocode`, a small
forward/reverse geocoding provider registry (offline mock, Nominatim, Photon, Google Places, or
your own).

Docs: `docs/components/address-autocomplete.html`. Fixtures: `docs/fixtures/geocode/addresses.json`
(a small alternate dataset demonstrating a *custom* offline provider, distinct from the built-in
`mock` provider's own dataset).

## Files

| File | Contents |
|---|---|
| `geocode.js` | `Orion.geocode` (the provider registry + `search`/`reverse`/`addProvider`), the four built-in providers (`mock`, `nominatim`, `photon`, `google`), and the `<o-address-input>` element. |
| `geocode.css` | Sizing only — the visible control is entirely `<o-autocomplete>`'s own styling. |

## Public API

| Name | Kind | Description |
|---|---|---|
| `<o-address-input>` | element | Form-associated address search field. |
| `Orion.geocode` | service | `search(q, opts)`, `reverse(lat, lng, opts)`, `addProvider(name, impl)`, `providers`. |
| `Orion.AddressInput` | class | The `OAddressInput` class. |

## Providers

| Provider | Network? | Notes |
|---|---|---|
| `mock` (default) | No | ~12 built-in Malaysia/Singapore landmarks. Deterministic — this is what makes the element (and every docs demo) testable with no network. |
| `nominatim` | Yes | OpenStreetMap's public Nominatim API. Throttled to ≥1 request/second and cached in-memory; pass `email` to identify your app per their usage policy. **Requires the optional `http` package** — `requireHttp()` throws a clear error instead of `Cannot read properties of undefined` if it's missing from a custom build. |
| `photon` | Yes | Komoot's Photon API. Also requires `http`. |
| `google` | Yes | Google Places `AutocompleteService` + `PlacesService`, via `Orion.maps.google` (see the `map` package). Never loaded unless the developer supplies a key. |
| custom | your choice | `Orion.geocode.addProvider(name, { search(q,opts), reverse(lat,lng,opts) })`, or set the element's `source` property directly (bypasses the registry). See `docs/components/address-autocomplete.html#fixture` for a worked example reading a local JSON fixture. |

Address shape (what every provider normalizes to): `{ label, lat, lng, street, houseNumber,
postcode, city, state, country, countryCode, raw }`.

## Props / attributes

| Attribute | Type | Default | Notes |
|---|---|---|---|
| `name` | string | | Form field name. |
| `value` | object \| null | `null` | The structured address, or `null`. |
| `provider` | string | `mock` | One of `Orion.geocode.providers`, or a name you registered. |
| `source` | `(q, opts) => results` | | Property-only; bypasses the provider registry entirely. Named `source`, not `search` — the class also has a public `search(q)` method (see below), and a prop/method name collision would silently defeat the prop (see "Known bug" below). |
| `country-codes` | string | | Comma-separated ISO codes, forwarded to providers that support it. |
| `lang` | string | | |
| `limit` | number | `6` | |
| `fill` | object | | `{ resultField: selectorOrElement }` — auto-fills other controls on selection (dispatches `input`+`change`). |
| `email` | string | | Identifies your app to Nominatim. |
| `api-key` | string | | Reserved for provider use (Google reads its key via `Orion.maps.google`, not from this attribute). |
| `required`, `disabled`, `readonly` | boolean | `false` | Standard form-control behaviour (`FormElement`). |
| `texts` | object | | Per-instance string overrides. |

## Methods

`search(q)`, `clear()`, `focus(opts)`, plus the standard `FormElement` validation methods
(`checkValidity()`, `reportValidity()`, `setCustomValidity()`).

## Events

`o-change { value }` — fires on selection and on clear (native `input`/`change` also fire on the
host, per `FormElement.setValue()`). `o-input` bubbles from the inner autocomplete as the user
types.

## Keyboard / accessibility

Inherited entirely from `<o-autocomplete>`: `↓`/`↑` move through suggestions, `Enter` selects,
`Escape` closes the panel. The suggestion panel is portaled to `<body>` (see ARCHITECTURE.md §6),
so query it from `document`, not from inside the element, when scripting against it.

## Known bugs found and fixed in this pass

- **Every search returned zero results, silently, for every provider (including the default
  `mock`) — the element's core feature was completely non-functional.** `static props` declared a
  `search: { type: Function, attr: false }` prop meant as a per-element provider override, but the
  class *also* defines a public method `search(q) { this.ac.search(q); }` (the documented
  imperative "run a search" API). `__setupProps()` (`src/core/40-component.js`) correctly detects
  that the prototype already has an "own" member named `search` and skips generating the reactive
  accessor for the prop — so `this.search` was *always* the method, never whatever a caller might
  have assigned, and `_search()`'s `isFn(this.search) ? await this.search(q, opts) : …` was
  therefore always true, always calling the void-returning UI method instead of the geocode
  registry. `toArr(undefined)` (the method's return value) is `[]`. No error anywhere — the
  autocomplete panel just always showed "No matching address". Fixed by renaming the prop to
  `source` (matching `<o-autocomplete source>`, which has no such collision).
- Consequently, listening for `o-change` on `<o-address-input>` could also receive the *inner*
  `<o-autocomplete>`'s own `o-change` (detail `{ value: <plain text>, item }`, bubbling straight
  through) indistinguishably from this element's own, documented `o-change` (detail
  `{ value: Address | null }`) — same event name, two different shapes. Fixed by stopping the
  inner `o-change` at the host (`e.stopPropagation()`); `_onSelect()` (via the inner `o-select`,
  also now stopped) is what fires this element's own `o-change`.

## Limitations

- `nominatim`/`photon` need the `http` package in the bundle (declared as a soft runtime dependency,
  not `// @deps http`, since most consumers of `<o-address-input>` only need the offline `mock`
  provider or `google`).
- Nominatim's usage policy requires the throttle and, ideally, an `email`; this package does not
  enforce the latter, it only forwards it if you provide one.
- The `google` provider needs `Orion.maps.google.load({ libraries: ['places'] })` to have completed
  first (or a `provider="google"` `<o-map>`/manual `load()` call elsewhere on the page) — see
  `docs/components/google-maps.html`.
