# captcha

`<o-captcha>`: a self-contained client-side captcha (text / math / slider puzzle) plus `<o-recaptcha>` /
`<o-hcaptcha>` / `<o-turnstile>` adapters that lazy-load the real vendor widget. Docs:
`docs/components/captcha.html`.

**Read this first:** every widget here (including the three vendor adapters) is a *deterrent*, not
protection. `<o-captcha>`'s answer lives in the page, so a scripted attacker can read it — it only stops
naive spam bots. Real protection means verifying the token server-side (`onVerify`, or the vendor's
siteverify API) on every submission, in addition to normal rate-limiting/honeypots.

## Files

| File | Contents |
|---|---|
| `10-captcha.js` | `<o-captcha type="text\|math\|slider">` — canvas rendering, drag/keyboard slider, audio alternative |
| `20-adapters.js` | `<o-recaptcha>`, `<o-hcaptcha>`, `<o-turnstile>` — shared lazy-load/render/reset/execute adapter |
| *(no captcha.css originally shipped — added together with the adapters)* | All `.o-captcha-*` styling |

## `<o-captcha>`

```ts
class OCaptcha extends FormElement {
  value: string;                    // typed answer (text/math) or an opaque token once the slider is solved
  type: 'text' | 'math' | 'slider';
  length: number;                    // text challenge length, default 5
  width?: number; height?: number;
  caseSensitive: boolean; audio: boolean;     // audio: show the "Listen" button when speechSynthesis exists
  tolerance: number;                 // slider px tolerance, default 6
  challenge?(type: string): Promise<{ id?, image?: string /* dataURL */, question?: string, piece?: string, y?: number, pieceWidth?: number }>;
  onVerify?(ctx: { type, id?, answer?, position? }): Promise<boolean>;
  texts?: Record<string, string>;

  verify(): Promise<boolean>;        // client check, or onVerify() when provided
  refresh(opts?: { silent?: boolean }): Promise<void>;
  reset(): void;                     // alias for refresh()
  speak(): void;                     // reads the challenge aloud
}
```

Supply `challenge`/`onVerify` to move the real check server-side (challenge fetches a question/image from
your backend; onVerify posts the answer/position and returns pass/fail) — the client canvas becomes purely
cosmetic at that point, which is the closest this widget gets to "real" protection.

Add `data-o-rules="captcha"` to a `<form data-o-validate>` field to run `.verify()` automatically on submit
(registered once, lazily, the first time an `<o-captcha>` connects). Events: `o-verify { valid }`,
`o-refresh {}`.

## `<o-recaptcha>` / `<o-hcaptcha>` / `<o-turnstile>`

```ts
class CaptchaAdapter extends FormElement {   // one concrete class per vendor, same shape
  value: string;                     // the solved token, or '' before/after expiry
  sitekey?: string;                   // nothing loads from the network until this is set
  version: 'v2' | 'invisible' | 'v3'; // recaptcha only; ignored by hCaptcha/Turnstile
  theme: 'light' | 'dark'; size?: string; action: string;   // default action 'submit'

  execute(): any;                     // re-run an invisible/v3 challenge for a fresh token
  reset(): void;
  verify(): Promise<boolean>;         // true once a token exists (fetches one first for v3)
}
```

Each adapter lazy-loads its vendor script with the core `loadScript()` helper **only** once `sitekey` is
set, then calls the vendor's own `render()`/`execute()`/`reset()` — Orion never talks to Google/hCaptcha/
Cloudflare's APIs directly beyond loading their script. Without a `sitekey`, the element shows a static
"add a sitekey" placeholder and makes zero network requests. Events: `o-verify { token }`, `o-expire {}`,
`o-error {}`.

## CSS

`.o-captcha-box` / `-canvas` / `-tools` / `-input` (text & math), `.o-captcha-stage` / `-track` / `-knob` /
`-fill` / `-hint` / `-piece` / `-alt` (slider), `.is-verified` / `.is-wrong` / `.is-dragging` state classes,
`.o-captcha-placeholder` (no-sitekey / loading / failed states for the adapters).
