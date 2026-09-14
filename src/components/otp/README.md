# otp

`<o-otp>` — a one-time-code input: one box per character, paste distribution, WebOTP autofill and a resend countdown.
Form-associated.

## Usage

```html
<o-otp name="code" length="6" separator="3" resend-seconds="30" autofocus></o-otp>
```

```js
const otp = document.querySelector('o-otp');
otp.addEventListener('o-complete', e => verify(e.detail.value));
otp.setError('Invalid code');
```

## Types

```ts
interface OOtpProps {
  value: string;
  length: number;                          // default 6
  type: 'numeric' | 'alpha' | 'alphanumeric';   // default 'numeric'
  mask?: boolean;
  separator?: number | string;             // group size, e.g. 3, or explicit positions "3,6"
  autofocus?: boolean;
  resendSeconds?: number;
  webotp: boolean;                         // default true
  invalid: boolean;                        // reflects the error state
  size?: 'sm' | 'lg';
  name?: string; required?: boolean; disabled?: boolean; readonly?: boolean;
  texts?: Record<string, string>;
}

declare class OOtp extends HTMLElement implements OOtpProps {
  // ...OOtpProps
  focus(opts?: FocusOptions): void;
  clear(): void;
  shake(): void;
  setError(message?: string): void;      // message omitted -> default "The code is incorrect"; '' clears silently
  restartTimer(seconds?: number): void;
}

interface Orion { Otp: typeof OOtp }
declare global { interface HTMLElementTagNameMap { 'o-otp': OOtp } }
```

## Events

| Event | Detail |
|---|---|
| `input`, `change` | native, mirrored from the boxes |
| `o-change` | `{ value }` |
| `o-complete` | `{ value }` — every box is filled |
| `o-resend` | cancelable; `preventDefault()` to stop the countdown from restarting |

## Keyboard

Type to fill + auto-advance · Backspace clears/goes back · Delete shifts left · ←/→ move (RTL-aware) · Home/End jump.
