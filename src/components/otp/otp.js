/* One-time code input: one box per character.
 *   <o-otp name="code" length="6" type="numeric|alphanumeric|alpha" separator="3" mask autofocus resend-seconds="30"></o-otp>
 *   Props: value length(=6) type(=numeric) mask separator (Number | "2,4") autofocus resend-seconds webotp(=true)
 *          invalid (red + shake) size(sm|lg) name required disabled readonly texts
 *   Methods: focus() clear() shake() setError(msg?) restartTimer(seconds?)
 *   Events: input, change, o-change { value }, o-complete { value }, o-resend (cancelable; restarts the countdown)
 *   Keyboard: type to fill + auto-advance, Backspace (clears / goes back), Delete, ←/→ (RTL aware), Home/End. Paste fills from the box.
 *   The first box has autocomplete="one-time-code" (iOS/Android SMS autofill) and the WebOTP API is used when available.
 */
i18n.add('en', {
  otp: {
    label: 'Verification code', char: 'Character {n} of {total}', resend: 'Resend code', resendIn: 'Resend code in {time}',
    sent: 'A new code was sent', complete: 'Code entered', invalid: 'The code is incorrect',
  },
});
const OTP_TYPES = { numeric: /\d/, alphanumeric: /[\p{L}\p{N}]/u, alpha: /\p{L}/u };
const otpSet = isBrowser ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set : null;

class OOtp extends FormElement {
  static props = {
    ...FormElement.props,
    value: { type: String, default: '' },
    length: { type: Number, default: 6 },
    type: { type: String, default: 'numeric' },
    mask: Boolean, separator: Any, autofocus: Boolean, resendSeconds: Number, webotp: { type: Boolean, default: true },
    invalid: { type: Boolean, reflect: true }, size: { type: String, reflect: true }, texts: Object,
  };
  setup() {
    this.classList.add('o-otp');
    this.row = h('div', { class: 'o-otp-row', role: 'group' });
    this.msg = h('div', { class: 'o-otp-msg', 'aria-live': 'polite' });
    this.timer = h('div', { class: 'o-otp-resend', hidden: true });
    this.append(this.row, this.msg, this.timer);
    on(this.row, 'input', 'input', (e, box) => this.onInput(e, box));
    on(this.row, 'compositionend', 'input', (e, box) => this.onInput(e, box));
    on(this.row, 'keydown', 'input', (e, box) => this.onKey(e, box));
    on(this.row, 'paste', 'input', (e, box) => this.onPaste(e, box));
    on(this.row, 'focusin', 'input', (e, box) => { this.v0 ??= this.value; requestAnimationFrame(() => box.select()); });
    on(this.row, 'focusout', () => setTimeout(() => { if (!this.contains(doc.activeElement) && this.v0 !== undefined) { if (this.v0 !== this.value) this.fireChange(); this.v0 = undefined; } }));
    on(this.row, 'pointerdown', 'input', (e, box) => {
      // clicking past the filled part focuses the first empty box (codes are entered in order)
      const i = this.boxes.indexOf(box), firstEmpty = this.boxes.findIndex(b => !b.value);
      if (firstEmpty >= 0 && i > firstEmpty) { e.preventDefault(); this.boxes[firstEmpty].focus(); }
    });
    on(this.timer, 'click', 'button', () => this.resend());
    this.focusTarget = null;
  }
  connected() {
    if (this.autofocus) requestAnimationFrame(() => this.focus());
    this.startWebOtp();
    if (this.resendSeconds && this._until) this.tick();
  }
  disconnected() { this._ac?.abort(); this._ac = null; clearInterval(this._iv); }
  get boxes() { return [...this.row.querySelectorAll('input')]; }
  get chars() { return this.boxes.map(b => b.value).join(''); }
  build() {
    const n = clamp(this.length | 0 || 6, 1, 12), seps = this.sepAt();
    const old = this.value;
    const nodes = [];
    for (let i = 0; i < n; i++) {
      if (i && seps.has(i)) nodes.push(h('span', { class: 'o-otp-sep', 'aria-hidden': 'true' }));
      nodes.push(h('input', {
        class: 'o-otp-box', type: this.mask ? 'password' : 'text', inputmode: this.type === 'numeric' ? 'numeric' : 'text',
        autocomplete: i === 0 ? 'one-time-code' : 'off', autocapitalize: 'characters', spellcheck: 'false', enterkeyhint: i === n - 1 ? 'done' : 'next',
        pattern: this.type === 'numeric' ? '[0-9]*' : null, 'data-i': i,
      }));
    }
    this.row.replaceChildren(...nodes);
    this.focusTarget = this.boxes[0];
    this.fill(old, 0, false);
  }
  sepAt() {
    const s = this.separator;
    if (s == null || s === '' || s === false) return new Set();
    const list = String(s).split(',').map(Number).filter(Boolean);
    const n = this.length;
    if (list.length === 1) { const out = new Set(); for (let i = list[0]; i < n; i += list[0]) out.add(i); return out; }
    return new Set(list);
  }
  update(changed) {
    if (changed.has('length') || changed.has('separator') || changed.has('mask') || changed.has('type') || changed.has('init')) this.build();
    else if (changed.has('value') && this.value !== this.chars) this.fill(this.value, 0, false);
    this.row.setAttribute('aria-label', this.getAttribute('aria-label') || this.t('otp.label'));
    const n = this.boxes.length;
    this.boxes.forEach((b, i) => {
      b.setAttribute('aria-label', this.t('otp.char', { n: i + 1, total: n }));
      b.disabled = this.isDisabled; b.readOnly = !!this.readonly;
      b.setAttribute('aria-invalid', String(!!this.invalid));
    });
    if (changed.has('invalid') && this.invalid && !changed.has('init')) this.shake();
    if (changed.has('resendSeconds') && this.resendSeconds && !this._until) this.restartTimer();
    if (changed.has('locale')) this.tick();
  }
  /** Put chars into the boxes starting at `from`; returns the index after the last written box. */
  fill(str, from = 0, user = true) {
    const re = OTP_TYPES[this.type] || OTP_TYPES.alphanumeric;
    const chars = [...String(str ?? '')].filter(c => re.test(c)).map(c => (this.type === 'numeric' ? c : c.toUpperCase()));
    const boxes = this.boxes;
    let i = from;
    if (!user) boxes.forEach(b => otpSet.call(b, ''));
    for (const c of chars) { if (i >= boxes.length) break; otpSet.call(boxes[i], c); i++; }
    boxes.forEach(b => b.classList.toggle('is-filled', !!b.value));
    const v = this.chars;
    if (user) this.commitValue(v); else this.value = v;
    return i;
  }
  commitValue(v) {
    if (v === this.value) return;
    if (this.invalid) { this.invalid = false; this.msg.textContent = ''; }
    this.setValue(v, { inputOnly: true });
    if (v.length === this.boxes.length) {
      announce(this.t('otp.complete'));
      this.emit('complete', { value: v });
      this.fireChange();
    }
  }
  fireChange() {
    this.v0 = this.value;
    this.dispatchEvent(new Event('change', { bubbles: true }));
    this.emit('change', { value: this.value });
  }
  onInput(e, box) {
    if (e.isComposing) return;
    const i = +box.dataset.i, re = OTP_TYPES[this.type] || OTP_TYPES.alphanumeric;
    let chars = [...box.value].filter(c => re.test(c));
    const prev = box.__prev || '';
    if (chars.length === 2 && prev && chars.includes(prev)) chars.splice(chars.indexOf(prev), 1); // typed after the old char
    if (!chars.length) { otpSet.call(box, ''); box.classList.remove('is-filled'); box.__prev = ''; this.commitValue(this.chars); return; }
    const next = this.fill(chars.join(''), i);
    this.boxes.forEach(b => { b.__prev = b.value; });
    const boxes = this.boxes, target = boxes[Math.min(next, boxes.length - 1)];
    if (target !== box || chars.length > 1) target.focus(); else box.select();
  }
  onPaste(e, box) {
    const txt = e.clipboardData?.getData('text/plain');
    if (txt == null) return;
    e.preventDefault();
    if (this.readonly || this.isDisabled) return;
    const re = OTP_TYPES[this.type] || OTP_TYPES.alphanumeric;
    const n = [...txt].filter(c => re.test(c)).length;
    const from = n >= this.boxes.length ? 0 : +box.dataset.i;
    const next = this.fill(txt, from);
    this.boxes.forEach(b => { b.__prev = b.value; });
    this.boxes[Math.min(next, this.boxes.length - 1)].focus();
  }
  onKey(e, box) {
    const boxes = this.boxes, i = +box.dataset.i, rtl = isRTL(this);
    const go = j => { const b = boxes[clamp(j, 0, boxes.length - 1)]; b.focus(); b.select(); };
    let k = e.key;
    if (rtl && (k === 'ArrowLeft' || k === 'ArrowRight')) k = k === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (k === 'Backspace') {
      if (this.readonly) return;
      e.preventDefault();
      if (box.value) otpSet.call(box, '');
      else if (i > 0) { otpSet.call(boxes[i - 1], ''); go(i - 1); }
      boxes.forEach(b => { b.classList.toggle('is-filled', !!b.value); b.__prev = b.value; });
      this.commitValue(this.chars);
    } else if (k === 'Delete') {
      if (this.readonly) return;
      e.preventDefault();
      // remove this char and shift the rest left
      const v = boxes.map(b => b.value);
      v.splice(i, 1); v.push('');
      boxes.forEach((b, j) => { otpSet.call(b, v[j]); b.classList.toggle('is-filled', !!v[j]); b.__prev = v[j]; });
      box.select();
      this.commitValue(this.chars);
    } else if (k === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
    else if (k === 'ArrowRight') { e.preventDefault(); go(i + 1); }
    else if (k === 'Home') { e.preventDefault(); go(0); }
    else if (k === 'End') { e.preventDefault(); go(boxes.length - 1); }
    else if (k.length === 1 && box.value && box.selectionStart === box.selectionEnd && !this.readonly) {
      const re = OTP_TYPES[this.type] || OTP_TYPES.alphanumeric;
      if (!re.test(k)) { e.preventDefault(); return; }
      box.select(); // overwrite the existing char
    }
  }
  focus(opts) { const b = this.boxes; (b.find(x => !x.value) || b[b.length - 1])?.focus(opts); }
  clear() { this.fill('', 0, false); this.setValue(''); this.boxes.forEach(b => { b.__prev = ''; }); }
  shake() { animate(this.row, 'shake', { duration: 360 }); }
  /** Mark the code as wrong: red boxes, shake, optional message; clears on the next edit. */
  setError(msg) {
    this.invalid = true;
    this.msg.textContent = msg === undefined ? this.t('otp.invalid') : msg || '';
    this.shake();
  }
  getValidity() { return this.value && this.value.length < this.boxes.length ? { flags: { tooShort: true }, message: t('validation.minLength', { min: this.boxes.length }) } : null; }
  formValue() { return this.value || null; }
  /* ── resend countdown ── */
  restartTimer(sec = this.resendSeconds) {
    if (!sec) return;
    this._until = Date.now() + sec * 1000;
    this.tick();
  }
  tick() {
    clearInterval(this._iv);
    if (!this.resendSeconds) { this.timer.hidden = true; return; }
    this.timer.hidden = false;
    const paint = () => {
      const left = Math.max(0, Math.ceil(((this._until || 0) - Date.now()) / 1000));
      if (left > 0) {
        const time = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
        let s = this.timer.querySelector('.o-otp-countdown');
        if (!s) this.timer.replaceChildren(s = h('span', { class: 'o-otp-countdown' }));
        s.textContent = this.t('otp.resendIn', { time });
      } else {
        clearInterval(this._iv);
        if (!this.timer.querySelector('button')) this.timer.replaceChildren(h('button', { type: 'button', class: 'o-btn o-btn-link o-btn-sm o-otp-resend-btn' }, raw(String(icon('refresh', { size: 14 }))), h('span', null, this.t('otp.resend'))));
      }
    };
    paint();
    if (this.isConnected) this._iv = setInterval(paint, 1000);
  }
  resend() {
    if (this.isDisabled || !this.emit('resend', {})) return;
    this.clear();
    this.restartTimer();
    announce(this.t('otp.sent'));
    this.focus();
    this.startWebOtp();
  }
  startWebOtp() {
    if (!this.webotp || !isBrowser || !('OTPCredential' in win) || !navigator.credentials) return;
    this._ac?.abort();
    const ac = this._ac = new AbortController();
    navigator.credentials.get({ otp: { transport: ['sms'] }, signal: ac.signal }).then(cred => {
      if (cred?.code && this._ac === ac) { this.fill(cred.code, 0); this.focus(); }
    }).catch(() => {});
  }
}
define('o-otp', OOtp);
O.Otp = OOtp;
