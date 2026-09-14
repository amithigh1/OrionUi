# idle

Two inactivity utilities sharing an activity-detection core (pointer/keyboard/wheel/touch/scroll/focus/tab-visibility
events, optionally shared across same-origin tabs via `BroadcastChannel` with a `localStorage` fallback):
`Orion.idle()` for lightweight idle/active state, and `Orion.sessionTimeout()` for an accessible countdown-to-logout
dialog that stays in sync across every open tab and can ping a keep-alive endpoint.

## `Orion.idle(options)`

Returns a controller (started immediately unless `autoStart: false`).

### Options

| Option | Type | Default | Notes |
|---|---|---|---|
| `timeout` | `Number` | `60000` | Ms of inactivity before idle. |
| `events` | `String[]` | `pointermove, pointerdown, keydown, wheel, touchstart, scroll, focus, visibilitychange` | Activity events watched. |
| `crossTab` | `Boolean` | `true` | Share activity with other tabs via `key`. |
| `key` | `String` | `'default'` | Cross-tab channel namespace. |
| `element` | `Selector\|Element\|null` | `null` (→ `document`) | Activity target. |
| `onIdle` | `fn({ lastActive, idleFor, controller })` | — | Called when idle begins. |
| `onActive` | `fn({ remote, idleFor, lastActive, controller })` | — | Called when activity resumes. |
| `autoStart` | `Boolean` | `true` | Pass `false` to call `.start()` manually. |

### Controller

| Member | Description |
|---|---|
| `isIdle` | `Boolean` getter. |
| `lastActive` | `Number` (timestamp) getter. |
| `remaining` | `Number` (ms until idle) getter. |
| `running` | `Boolean` getter. |
| `timeout` | `Number`, snapshot of the option at creation (not reactive). |
| `reset()` | Mark active now (also posted to other tabs) → controller. |
| `start()` | Begin watching (idempotent) → controller. |
| `stop()` | Stop watching, close the cross-tab channel → controller. |

### Events (bus only — no DOM CustomEvents)

| Event | Detail |
|---|---|
| `idle` (`Orion.on('idle', fn)`) | `{ lastActive, idleFor, controller }` |
| `active` (`Orion.on('active', fn)`) | `{ remote, idleFor, lastActive, controller }` |

## `Orion.sessionTimeout(options)`

Returns a `SessionTimeout` instance (`extends Emitter`); the most recently created one is `Orion.sessionTimeout.current`.

### Options

| Option | Type | Default | Notes |
|---|---|---|---|
| `timeout` | `Number` | `900000` (15 min) | Ms of inactivity before logout. |
| `warning` | `Number` | `60000` | Ms before the end to show the countdown dialog; clamped to `≤ timeout`. |
| `keepAlive` | `fn() -> any\|Promise` | — | Called on activity (throttled by `keepAliveInterval`) and forced on `extend()`. |
| `keepAliveInterval` | `Number` | `clamp(timeout/3, 1000, 300000)` | Throttle for `keepAlive`. |
| `events` | `String[]` | same as `idle`'s default | Activity events watched. |
| `crossTab` | `Boolean` | `true` | |
| `key` | `String` | `'session'` | Cross-tab channel namespace. |
| `titleAlert` | `Boolean` | `true` | Flashes `(mm:ss) ` in `document.title` during the warning. |
| `escape` | `String` | `'stay'` | Behavior when Escape is pressed during the warning dialog: `'stay'` extends; anything else triggers the login/reload action. |
| `autoStart` | `Boolean` | `true` | |
| `onExtend` | `fn({ remote })` | — | |
| `onWarning` | `fn({ remaining })` | — | |
| `onTimeout` | `fn({ reason, remoteReason })` | — | If provided, called instead of showing the "signed out" dialog. |
| `onKeepAliveError` | `fn(err)` | — | |
| `onLogin` | `fn()` | — | Called by the "Sign in again" / warning-Escape action; else falls back to `loginUrl` or `location.reload()`. |
| `loginUrl`, `logoutUrl` | `String` | — | `logoutUrl` navigates there instead of showing the expired dialog. |
| `title`, `message` (`'{time}'` token), `detail`, `stayText`, `logoutText`, `loginText`, `expiredTitle`, `expiredMessage`, `loggedOutTitle`, `loggedOutMessage` | `String\|fn(params)->String` | i18n `session.*` keys | Per-instance text overrides. |

### Instance members

| Member | Description |
|---|---|
| `state` | Getter: `'active'\|'warning'\|'expired'\|'stopped'`. |
| `lastActive`, `expiresAt`, `remaining` | Getters. |
| `start()` | → this. |
| `stop()` | → this (clears timers, listeners, closes the channel, hides the dialog). |
| `destroy()` | `stop()` + removes the dialog element; clears `.current` if it was this instance. |
| `extend({ remote = false, at = Date.now() } = {})` | "Stay signed in": restarts the window here and in every tab, pings `keepAlive` → this. |
| `reset()` | Alias for `extend()`. |
| `warn()` | Jump straight to the warning state (previews/tests) → this. |
| `logout(reason = 'logout', { remote = false } = {})` | Ends the session everywhere. `reason`: `'logout'\|'timeout'\|'remote'` → this. |

### Instance events (`.on()`/`.off()`/`.once()`, `Emitter`)

| Event | Detail | Notes |
|---|---|---|
| `extend` | `{ remote, wasWarning }` | |
| `timeout` | `{ reason, remoteReason }` | Fired instead of `logout` when `reason === 'timeout'`. |
| `logout` | `{ reason, remoteReason }` | Fired for any other `reason` (e.g. `'logout'`). |
| `end` | `{ reason, remoteReason }` | Always fired alongside `timeout`/`logout`. |
| `warning` | `{ remaining }` | |
| `tick` | `{ remaining }` | Every 250ms while in the warning state. |
| `keepalive` | `{ at }` | |
| `keepalive-error` | `err` | |

### Bus events

| Event | Detail | Notes |
|---|---|---|
| `session:extend` | `{ remote }` | |
| `session:warning` | `{ remaining }` | |
| `session:timeout` | `{ reason, remoteReason }` | Emitted on **every** end of session (both `'timeout'` and `'logout'` reasons use this one bus event name). |

No DOM `CustomEvent`s are dispatched; the countdown dialog is a plain overlay (`role="alertdialog"`), not a custom
element. Cross-tab sync propagates activity, `extend()` and `logout()` to every tab sharing the same `key`.
