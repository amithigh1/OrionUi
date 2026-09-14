# Auth — login/register forms, two-factor, passkeys

Everything needed to build a sign-in flow: `<o-auth-form>` (login/register/forgot/reset/lock/magic-link),
`<o-2fa-setup>` + `<o-2fa-verify>` with `Orion.totp` (RFC 6238), and `Orion.webauthn` + `<o-biometric-login>`
for passkeys. Zero dependencies; feature-detects the `inputs` (`data-o-password-toggle`, `data-o-strength`,
`<o-otp>`, `<o-colorpicker>`), `forms` (`Orion.validate`, `<o-stepper>`) and `codes` (`<o-qrcode>`, `Orion.qr`)
packages and degrades gracefully when they are not part of your build.

## `<o-auth-form type="login|register|forgot|reset|lock|magic-link">`

```html
<o-auth-form type="login" brand="Orion Admin" logo="/logo.svg" social='["google","github"]' remember></o-auth-form>
<script>
  document.querySelector('o-auth-form').onSubmit = async (data) => {
    const res = await fetch('/api/login', { method: 'POST', body: JSON.stringify(data) });
    if (!res.ok) throw { field: 'password', message: 'Incorrect email or password' };
    location.href = '/dashboard';
  };
</script>
```

| Prop / attr | Type | Description |
|---|---|---|
| `type` | `login｜register｜forgot｜reset｜lock｜magic-link` | Which fields and copy to render. |
| `brand`, `logo` | string | Optional header brand name / logo image. |
| `social` | array (JSON or `"google,microsoft,github,apple"`) | Social buttons to show; click emits `o-social`. |
| `remember` | boolean | Show "Remember me" (login only). |
| `terms-url` | string | Link target for the terms checkbox (register). |
| `user` | object `{ name, email, avatar }` | Lock-screen identity. |
| `onSubmit` | `async (data) => void` | Called after client-side validation passes; **throw `{ message, field? }`** to show a field error or a top alert. |
| `texts` | object | Per-instance string overrides (`this.t('auth.xxx')`). |

Methods: `submit()`, `reset()`, `showSuccess()`, `showError(err)`, `focus()`.
Events: `o-submit {type,data}` (cancelable — prevent to take over submission yourself), `o-success {type,data,result}`,
`o-error {type,error}`, `o-social {provider}`, `o-mode {type}` (cancelable — default switches `type`), `o-resend {type,data}` (cancelable).

Inline validation uses `Orion.validate.check()` when the `forms` package is present, otherwise a small
built-in required/email/min-length checker — either way errors render the same way (`.o-field.is-invalid` +
`.o-error`). Password show/hide, the caps-lock hint and the strength meter on `register` are the `inputs`
package's `data-o-password-toggle` / `data-o-strength` **behaviors**, attached automatically because the
inputs are just plain `<input data-o-password-toggle>` elements — nothing breaks if that package is absent,
the buttons simply don't appear.

Layout classes for full-page examples (optional, not required by the element itself):
`.o-auth` (centered card), `.o-auth-card`, `.o-auth-split` + `.o-auth-cover` (brand/illustration panel that
collapses below 992px) + `.o-auth-split-form`.

## Two-factor — `Orion.totp`, `<o-2fa-setup>`, `<o-2fa-verify>`

```js
const secret = Orion.totp.generateSecret();                 // base32
await Orion.totp.generate(secret);                           // "123456" for right now
await Orion.totp.verify(secret, code, { window: 1 });         // boolean
Orion.totp.uri({ issuer: 'Orion Admin', account: 'ada@example.com', secret });
```

`Orion.totp` implements HOTP/TOTP (RFC 4226/6238) with WebCrypto HMAC — **verified against the RFC 6238
test vectors** (SHA-1, secret `"12345678901234567890"`, 8 digits: T=59 → `94287082`, T=1111111109 →
`07081804`, T=1234567890 → `89005924`). **This runs in the browser and is for demos, offline apps and
"verify what you just scanned" UI — a real login must check the code against the server-stored secret,
server-side.**

`<o-2fa-setup issuer="Orion Admin" account="ada@example.com" methods="totp,sms,email">` walks choose-method
(skipped for a single method) → set up (QR + secret, or a phone/email prompt) → verify → 10 backup codes
(copy/download/print) → done. `onVerify: async (code, method) => boolean` defaults to `Orion.totp.verify`
for the `totp` method when omitted. Events: `o-method`, `o-verified`, `o-error`, `o-done {backupCodes}`, `o-step`.

`<o-2fa-verify method="totp" masked-destination="j***@example.com" trust-device>` is the sign-in-time
counterpart: one OTP box row (`<o-otp>` when present), "use a backup code", a resend countdown for
sms/email, and an optional "trust this device" checkbox. `onVerify: async (code, {trustDevice}) => boolean`.
Events: `o-verify` (cancelable), `o-verified`, `o-error`, `o-use-backup-code`, `o-resend` (cancelable).

## Passkeys — `Orion.webauthn`, `<o-biometric-login>`

```js
Orion.webauthn.isSupported();                    // PublicKeyCredential + navigator.credentials
await Orion.webauthn.isPlatformAvailable();       // Face ID / Touch ID / Windows Hello
await Orion.webauthn.register(creationOptionsJSON);
await Orion.webauthn.authenticate(requestOptionsJSON);
```

Accepts the WebAuthn **Level 3 JSON** option format (what most server SDKs already emit) and returns a
JSON-serializable credential, using `PublicKeyCredential.parseCreationOptionsFromJSON` /
`.parseRequestOptionsFromJSON` when the browser supports them. **The signature must be verified
server-side** — this module only collects the ceremony result.

```html
<o-biometric-login label="Sign in with a passkey" fallback-href="/login/password"></o-biometric-login>
<script>
  const el = document.querySelector('o-biometric-login');
  el.getOptions = () => fetch('/api/webauthn/options').then(r => r.json());
  el.addEventListener('o-success', e => fetch('/api/webauthn/verify', { method: 'POST', body: JSON.stringify(e.detail.credential) }));
</script>
```

States: `idle → waiting → success | failed | unsupported` (reflected as `data-state`). Headless/CI note:
Chrome has no authenticator, so tests drive the state machine with a mocked `navigator.credentials`.

## Files

`00-totp.js` `Orion.totp` · `10-webauthn.js` `Orion.webauthn` + `<o-biometric-login>` · `20-auth-form.js`
`<o-auth-form>` · `30-2fa-setup.js` `<o-2fa-setup>` · `31-2fa-verify.js` `<o-2fa-verify>` · `auth.css`.
