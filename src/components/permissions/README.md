# permissions

Role- and permission-based UI gating. `Orion.auth` holds the current user, roles and permission grants (with
wildcard matching and explicit denies); `Orion.can`/`Orion.hasRole` are the check functions; `data-o-permission`/
`data-o-role` behaviors gate arbitrary elements (hide/disable/readonly/remove/blur); `<o-can>` gates a block of
markup declaratively. **UI checks are cosmetic — always enforce permissions on the server.**

## `Orion.auth`

| Member | Description |
|---|---|
| `user` | Getter → `Object \| null`. |
| `isAuthenticated` | Getter → `Boolean`. |
| `roles` | Getter → `String[]`, effective roles including inherited ones. |
| `permissions` | Getter → `String[]`, effective granted permission patterns. |
| `roleMap` | Getter → copy of the defined role map. |
| `setUser(user)` | `user: { id?, name?, roles, permissions, ... }` (roles/permissions normalized to arrays); `null` clears the user → `auth`. |
| `update(patch)` | Shallow-merges `patch` into the current user (no-op if none) → `auth`. |
| `clear()` | Alias for `setUser(null)` → `auth`. |
| `defineRoles(map, { merge = true } = {})` | `map: { roleName: string[] \| { permissions, inherits } }`; `merge: false` replaces the whole map → `auth`. |
| `can(perm, opts)` | Same as top-level `Orion.can` (see below). |
| `hasRole(role, opts)` | Same as top-level `Orion.hasRole`. |
| `match(granted, wanted)` | The raw wildcard-pattern matcher → `Boolean`. |
| `onChange(fn({ user }))` | → `off()`. |
| `guard(perm, onDenied?, { any, role } = {})` | Checks `can(perm, { any })` and, if `role` given, `hasRole(role)`. On failure, calls `onDenied(perm, user)` if given, else shows the default denial (`announce()` + toast + `auth:denied` bus event) → `Boolean`. |
| `protect(perm, fn, onDenied?, opts?)` | Wraps `fn` so it only runs when `guard()` passes → `Function`. |
| `refresh()` | Re-evaluates every `[data-o-permission]`/`[data-o-role]` element → `auth`. |

## `Orion.can(perm, { any = false, user } = {})`

`perm`: `String` (`'a'`, `'a, b'`) or `Array`. Checks against `user` (default: `auth.user`). `any: true` = OR
instead of AND across multiple requested permissions. Wildcards work on both sides: granted `'users.*'` matches
wanted `'users.edit'`; granted `'*'` matches everything; a wanted pattern like `'*.view'` also works. An explicit
deny (`'-x'`/`'!x'` in the user's permissions) always wins over a matching allow. → `Boolean`.

## `Orion.hasRole(role, { all = false, user } = {})`

`role`: `String` (`'a'`, `'a, b'`) or `Array`; matches the user's roles plus every role reached via
`defineRoles({ ..., inherits: [...] })`. Default is "any" (OR); `all: true` requires every listed role. → `Boolean`.

## Bus events

| Event | Detail | Notes |
|---|---|---|
| `auth:change` | `{ user }` | After `setUser`/`update`/`clear`/`defineRoles`. |
| `auth:denied` | `{ permission }` | From the default `guard()` denial handler only — not raised by `can()`/`hasRole()` themselves. |

## DOM events

| Event | Target | Detail | Notes |
|---|---|---|---|
| `o-auth` | `document` | `{ user }` | Dispatched every time `auth:change` fires (in addition to, not instead of, the bus event). |

## Behaviors

### `data-o-permission="perm"` / `data-o-role="role"`

Applies to any element (either or both attributes). Re-evaluated automatically on `auth:change` (or `auth.refresh()`).

| Sub-attribute | Notes |
|---|---|
| `data-o-permission-any` | OR instead of AND when `data-o-permission` lists multiple permissions. |
| `data-o-denied` | `'hide'` (default) \| `'disable'` \| `'readonly'` \| `'remove'` \| `'blur'`. |
| `data-o-denied-message` | Custom tooltip/`aria-description` text, else auto-generated ("Requires permission: …" / "Requires role: …"). |

Denial modes:

| Mode | Effect |
|---|---|
| `hide` | Adds `.o-perm-hidden` (CSS-hidden). |
| `disable` | Form controls: `.disabled = true`. Others: `aria-disabled="true"` + `.is-disabled` + blocks click/Enter/Space (capture phase) + strips `href` from links (adds `role="link"`) + ensures focusability. |
| `readonly` | Sets `.readOnly`/`.readonly`/`contentEditable` on the element and its form-field descendants; adds `aria-readonly="true"` + `.o-perm-readonly`. |
| `remove` | Detaches the element, replacing it with a comment placeholder; re-inserted if access is re-granted. |
| `blur` | Sets `inert`, adds `.o-perm-blur`, appends a visually-hidden `<span class="o-sr-only">` announcing the restriction. |

Always sets `data-o-access="granted"\|"denied"` on the element.

## Elements

### `<o-can>`

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `permission` | `permission` | `String` | — | |
| `role` | `role` | `String` | — | |
| `any` | `any` | `Boolean` | `false` | OR instead of AND for `permission`. |
| `mode` | `mode` | `String` | `'hide'` | `'hide'` (adds `.is-denied`) \| `'remove'` (detaches children while denied). |

Read-only property: `allowed` (getter) → `Boolean`. An optional `<template slot="denied">…</template>` child is
cloned into a `.o-can-denied` block while denied, and removed once granted. Always sets
`data-o-access="granted"\|"denied"` and toggles `.is-denied`.

#### Events

| Event | Detail | Cancelable |
|---|---|---|
| `o-change` | `{ allowed }` | No — fired only when the allowed state actually flips (not on first render). |
