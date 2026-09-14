# device

Browser/device detection (UA Client Hints with a UA-string fallback) plus live media-query state: breakpoint,
orientation, online/offline, color-scheme, reduced-motion, pointer type and connection quality. Detection runs
synchronously at load and is refined asynchronously (`device.ready`) with UA-CH high-entropy values and AVIF/WebP
decode tests. Also keeps `<html>` in sync with state classes and provides the `data-o-show`/`data-o-hide` behaviors.
No custom element.

## `Orion.device`

### Properties

| Property | Type | Notes |
|---|---|---|
| `mobile` / `tablet` / `desktop` | `Boolean` | Mutually exclusive device class. |
| `touch` | `Boolean` | `maxTouchPoints > 0` or `'ontouchstart' in window`. |
| `os` | `String` | `'windows'\|'macos'\|'ios'\|'android'\|'chromeos'\|'linux'\|'unknown'`. |
| `osVersion` | `String` | Best-effort; refined async via UA-CH `platformVersion` on supporting browsers. |
| `browser` | `String` | `'chrome'\|'firefox'\|'safari'\|'edge'\|'opera'\|'samsung'\|'yandex'\|'vivaldi'\|'brave'\|'ie'\|'unknown'`. |
| `browserVersion` | `String` | Refined async via UA-CH `fullVersionList` when available. |
| `engine` | `String` | `'blink'\|'gecko'\|'webkit'\|'trident'\|'unknown'`. |
| `model` | `String` | Device model; only populated via async UA-CH high-entropy values. |
| `ua` | `String` | Raw `navigator.userAgent`. |
| `memory` | `Number\|null` | `navigator.deviceMemory`. |
| `cores` | `Number\|null` | `navigator.hardwareConcurrency`. |
| `supports` | `Object` | Feature-detection flags, see below. |
| `breakpoints` | `Object` | `{ sm:576, md:768, lg:992, xl:1200, xxl:1400 }`. |
| `ready` | `Promise<device>` | Resolves after async refinement (UA-CH, image decode tests). |

### Live getters

| Getter | Type | Notes |
|---|---|---|
| `pointer` | `'coarse'\|'fine'` | `(pointer: coarse)` media query. |
| `hover` | `Boolean` | `(hover: hover)`. |
| `standalone` | `Boolean` | Installed/PWA display mode. |
| `pixelRatio` | `Number` | `devicePixelRatio`. |
| `prefersDark` | `Boolean` | `(prefers-color-scheme: dark)`. |
| `reducedMotion` | `Boolean` | `(prefers-reduced-motion: reduce)`. |
| `online` | `Boolean` | `navigator.onLine !== false`. |
| `connection` | `{ effectiveType, downlink, rtt, saveData, type }` | From `navigator.connection`; fields are `null`/`false` when unsupported. |
| `orientation` | `'portrait'\|'landscape'` | `screen.orientation.type` or a media query fallback. |
| `breakpoint` | `'xs'\|'sm'\|'md'\|'lg'\|'xl'\|'xxl'` | Largest `breakpoints` entry currently matching `min-width`. |
| `width` / `height` | `Number` | `window.innerWidth` / `innerHeight`. |

### Methods

| Method | Description |
|---|---|
| `parseUA(ua = '', { touchPoints, uaData } = {})` | Static UA parser → `{ os, osVersion, browser, browserVersion, engine, mobile, tablet }`. |
| `is(query)` | Query DSL: `' '`/`','` = OR, `+` = AND, `!x`/`not-x` = NOT. Tokens: `xs..xxl` (optionally `-up`/`-down`/`-only`), `mobile`, `tablet`, `desktop`, `touch`, `standalone`, `online`, `offline`, `coarse`, `fine`, `hover`, `portrait`, `landscape`, `dark`, `light`, `reduced-motion`, `retina`, `save-data`, `mac`, `apple`, or any `os`/`browser`/`engine` name. |
| `onChange(fn({ type, from, to, device }))` | → `off()`. Internal `Emitter`, **not** the bus. `type`: `breakpoint\|orientation\|online\|theme\|motion\|pointer\|connection\|standalone\|supports\|ua`. |
| `refresh()` | Re-run detection (UA overrides, tests) → `device`. |

### `supports` flags (booleans)

`webp`, `avif`, `touch`, `share`, `clipboard`, `notifications`, `serviceWorker`, `webauthn`, `barcodeDetector`,
`eyeDropper`, `speechSynthesis`, `speechRecognition`, `speech` (= synthesis or recognition), `mediaRecorder`,
`fullscreen`, `vibrate`, `geolocation`, `webrtc`, `wakeLock`, `bluetooth`, `usb`, `indexedDB`, `broadcastChannel`,
`pointerEvents`, `webgl` (lazy getter, computed on first access).

## Behaviors

| Attribute | Applies to | Behavior |
|---|---|---|
| `data-o-show="query"` | any element | Toggles `.o-device-hidden` **off** when `device.is(query)` is true (shown only when the query matches). |
| `data-o-hide="query"` | any element | Toggles `.o-device-hidden` **on** when `device.is(query)` is true (hidden when the query matches). |

Both re-evaluate live as matching media queries change, and clean up `.o-device-hidden` when the attribute is removed.

## `<html>` classes

Kept in sync automatically: `o-touch`/`o-no-touch`, `o-mobile`/`o-tablet`/`o-desktop`, `o-os-<os>`,
`o-browser-<browser>`, `o-engine-<engine>`, `o-pointer-<coarse|fine>`, `o-bp-<breakpoint>`, `o-portrait`/`o-landscape`,
plus conditionally `o-standalone`, `o-offline`, `o-reduced-motion`.

## Events

| Event | Channel | Detail | Notes |
|---|---|---|---|
| `change` | `Orion.device.onChange(fn)` (internal `Emitter`) | `{ type, from, to, device }` | |
| `device:change` | Bus (`Orion.on('device:change', fn)`) | Same shape as above | Emitted alongside the `Emitter` callback. |

No DOM `CustomEvent` is dispatched for device state changes (there is no `o-device`/`o-change` DOM event here — only
the two channels above).
