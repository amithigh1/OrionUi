# network

Online/offline detection and connection-quality classification (`online`/`slow`/`offline`) built on
`navigator.onLine` and the Network Information API, plus active reachability pinging (`check()`, detects
"lie-fi") and a `simulate()` hook for previews/tests. Ships the `<o-network-status>` indicator (dot, badge or
full alert variants) with an optional retry button and toast notifications.

## `Orion.network`

### Properties

| Property | Type | Notes |
|---|---|---|
| `online` | `Boolean` | `navigator.onLine !== false` and not marked unreachable by `check()`; overridden by `simulate()`. |
| `effectiveType` | `String\|null` | `'slow-2g'\|'2g'\|'3g'\|'4g'` from `navigator.connection`. |
| `rtt` | `Number\|null` | Round-trip time estimate (ms). |
| `downlink` | `Number\|null` | Estimated bandwidth (Mbps). |
| `saveData` | `Boolean` | `navigator.connection.saveData`. |
| `type` | `String\|null` | Connection type (`'wifi'`, `'cellular'`, …). |
| `slow` | `Boolean` | `status === 'slow'`. |
| `status` | `'online'\|'slow'\|'offline'` | `offline` when not `online`; else `slow` when `effectiveType`/`rtt`/`downlink` cross `thresholds`. |
| `thresholds` | `{ types: ['slow-2g','2g'], rtt: 900, downlink: 0.4 }` | Mutable; adjust to tune "slow" classification. |

### Methods

| Method | Description |
|---|---|
| `info()` | → `{ status, online, effectiveType, rtt, downlink, saveData, simulated }` snapshot. |
| `onChange(fn(detail))` | → `off()`. Internal `Emitter`. `detail`: `{ ...info(), from }`. |
| `check(url?, { timeout = 5000 } = {})` | → `Promise<Boolean>`. `HEAD`-pings `url` (default: current page, `no-store`). Detects unreachability even when `navigator.onLine` is true; auto-retries every 15s while unreachable. |
| `simulate(status \| null)` | `status`: `'offline'\|'slow'\|'online'`; `null` clears. For docs/tests → `network`. |

## Events

| Event | Channel | Detail | Notes |
|---|---|---|---|
| `change` | `Orion.network.onChange(fn)` (internal `Emitter`) | `{ status, online, effectiveType, rtt, downlink, saveData, simulated, from }` | |
| `network:change` | Bus (`Orion.on('network:change', fn)`) | Same shape | Fired only when the status/quality actually changes (deduped); not fired on the very first computation. |

On a status change, `announce()` is called for accessibility, and if any `<o-network-status toast>` element exists
in the DOM, `Orion.toast(...)` is shown (danger/warning/success per new status).

## Elements

### `<o-network-status>`

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `variant` | `variant` | `String` | `'badge'` | `'dot'\|'badge'\|'full'`. |
| `toast` | `toast` | `Boolean` | `false` | Enables the toast notification (checked globally — any `[toast]` instance in the DOM enables it). |
| `hideOnline` | `hide-online` | `Boolean` | `false` | Hides the element entirely while `status === 'online'`. |
| `texts` | — | `Object` | — | Per-instance text overrides. |

Read-only property: `status` (getter) → `network.status`.

Sets `dataset.status` to the current status. `variant="full"` shows an alert with effective type / downlink / rtt
and a retry button when offline.

#### Events

| Event | Detail | Cancelable |
|---|---|---|
| `o-change` | `{ status, from }` | No |
