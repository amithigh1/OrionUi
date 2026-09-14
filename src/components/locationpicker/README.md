# locationpicker

`<o-location-picker>` — a form control for picking a point on a map: drag the map under a fixed
centre crosshair (default) or drag a marker directly, search an address, or use the device
location. Reverse-geocodes the chosen point and submits `lat,lng` plus the address text with the
form. Built on `<o-map>` and `<o-address-input>` (declared as `// @deps map, geocode`).

Docs: `docs/components/location-picker.html`.

## Files

| File | Contents |
|---|---|
| `locationpicker.js` | The `<o-location-picker>` element: search box + map + crosshair/marker + coordinates/address readout, wired together. |
| `locationpicker.css` | Layout only (search row, map wrapper, crosshair overlay, info row). |

## Public API

| Name | Kind | Description |
|---|---|---|
| `<o-location-picker>` | element | Form-associated point picker. |
| `Orion.LocationPicker` | class | The `OLocationPicker` class. |

## Props / attributes

| Attribute | Type | Default | Notes |
|---|---|---|---|
| `name` | string | | Submitted as `"lat,lng"`. |
| `value` | object \| null | `null` | `{ lat, lng, address }`. |
| `lat`, `lng`, `zoom` | number | `3.139`, `101.6869`, `14` | Initial map view. |
| `mode` | `"crosshair"` \| `"marker"` | `crosshair` | Drag the map under a fixed pin, or drag a marker directly. Reflected. |
| `tiles` | same as `<o-map>` | `offline` | Unlike `<o-map>` (default `osm`), this defaults to the offline placeholder tiles — a location picker is normally embedded in a form deep in an app, not a map-browsing surface, so it should never silently depend on network. |
| `provider` | string | `mock` | `Orion.geocode` provider for search + reverse geocoding. |
| `country-codes`, `lang`, `email` | string | | Forwarded to the geocode provider. |
| `radius` | number | `0` | Metres; draws a circle overlay around the point when > 0. |
| `address-name` | string | `<name>-address` | Form field name for the address text. |
| `reverse-geocode` | boolean | `true` | Set `false` to skip automatic reverse geocoding. |
| `height` | string | `18rem` | Map height. |
| `required`, `disabled` | boolean | `false` | Standard form-control behaviour. |

## Methods

`setLocation(lat, lng, { address })` — move the picker programmatically, like a user pick (fires
`o-change`; omit `address` to trigger reverse geocoding). `clear()`, `focus(opts)`, plus the
standard `FormElement` validation methods.

## Events

`o-change { value }` — `value` is `{ lat, lng, address }`; fires after a drag settles, a search
pick, `setLocation()`, or the debounced reverse-geocode lookup resolves. `o-locate-error { error }`
— the device-location request failed or was denied.

## Keyboard / accessibility

The address field follows `<o-address-input>`'s keyboard model. The embedded map is a full
`<o-map>` (arrow keys pan, `+`/`-` zoom); in `mode="marker"` the pin is a real, focusable,
draggable button. The coordinates readout is a `<button>` that copies `lat, lng` to the clipboard
and announces the copy via `announce()`.

## Known bug found and fixed in this pass

`update()`'s "value changed externally → reposition the map" branch was guarded by an
`__internalValue` boolean meant to stop the picker's own `_commit()` (map moved → address/coords
committed → `setValue()`) from feeding back into itself. The guard is set `true` then reset `false`
**synchronously**, but the branch that reads it only runs in a **later microtask** (props are
batched via `queueMicrotask`) — so by the time it runs, the flag has already been reset, and the
guard never actually blocks anything. On the crosshair-mode initial connect this created a genuine
infinite loop: `mapEl.setView()` (in `update()`'s `init` branch) unconditionally emits `o-move` even
for a no-op call → the picker's `o-move` listener calls `_commit()` → `setValue()` schedules another
`update()` → which sees `changed.has('value')`, still not blocked, and calls `mapEl.setView()`
again → forever, one microtask at a time (never throws, never stops repainting — the browser just
never reaches a stable frame, which is what made it look like a hang rather than a crash; it stalled
`node build/check.mjs --shots` indefinitely until killed). Fixed with an equality check — only touch
the map when `value.lat`/`value.lng` actually differ from the picker's own last-known position —
which stops the branch's expensive/loop-prone side effects while still keeping the address label and
coordinates readout in sync on every value change (see the comment at `locationpicker.js` ~line 100).

## Limitations

- `mode` can be changed at runtime, but switching **and** setting `radius`/`markers` in the same
  tick is not specifically tested; prefer setting `mode` before other props when constructing one
  programmatically.
- Reverse geocoding is debounced (400ms) and de-duplicated by request id, but does not cancel the
  underlying provider call — a slow `nominatim`/`photon` response can still resolve after a newer
  one if the provider itself doesn't honour `signal`.
