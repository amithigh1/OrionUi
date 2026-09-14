/* <o-2fa-verify method="totp|sms|email" masked-destination="+1 •••• 1234" trust-device>
 * A standalone "enter your 2FA code" step (the sign-in counterpart to <o-2fa-setup>) — one OTP box row
 * (<o-otp> when present, a plain digit input otherwise), a "use a backup code" fallback, a resend countdown
 * for sms/email, an optional "trust this device" checkbox and an error shake on a rejected code.
 *   Props: method(=totp) maskedDestination length(=6) trustDevice resendSeconds(=30)
 *          onVerify: async (code, { trustDevice }) => boolean|void (throw { message } to reject) texts
 *   Methods: verify(code?) markValid() markInvalid(msg?) useBackupCode() usePassword() reset() focus()
 *   Events: o-verify {code, method, trustDevice} (cancelable — prevent to fully take over verification),
 *           o-verified {method, trustDevice}, o-error {error}, o-use-backup-code {}, o-resend (cancelable)
 * SECURITY: the real check must happen server-side — onVerify should call your API, not compare locally.
 */
i18n.add('en', {
  twofaVerify: {
    title: 'Two-factor verification', subtitleTotp: 'Enter the code from your authenticator app.',
    subtitleDest: 'Enter the code we sent to {destination}.', invalid: 'That code is incorrect. Try again.',
    verify: 'Verify', verifying: 'Verifying…', useBackup: 'Use a backup code instead', useCode: 'Use your authenticator app instead',
    backupLabel: 'Backup code', backupPlaceholder: 'XXXXX-XXXXX', trustDevice: 'Trust this device for 30 days',
    resend: 'Resend code', resendIn: 'Resend in {time}s', sent: 'A new code was sent', verified: 'Verified',
  },
});

class O2faVerify extends OElement {
  static props = {
    method: { type: String, default: 'totp' },
    maskedDestination: String,
    length: { type: Number, default: 6 },
    trustDevice: Boolean,
    resendSeconds: { type: Number, default: 30 },
    onVerify: { type: Function, attr: false },
    texts: Object,
  };
  setup() {
    this.classList.add('o-2fa', 'o-2fa-verify');
    this._mode = 'code'; this._busy = false;
    this.box = h('div', { class: 'o-2fa-verify-box' });
    this.append(this.box);
    on(this, 'submit', 'form', e => { e.preventDefault(); this.submit(); });
    on(this, 'click', '[data-2fa-use-backup]', e => { e.preventDefault(); this.useBackupCode(); });
    on(this, 'click', '[data-2fa-use-code]', e => { e.preventDefault(); this.usePassword(); });
    on(this, 'click', '[data-2fa-resend]', () => this.resend());
    on(this, 'input', '[name]', () => this.clearMsg());
    this.focusTarget = null;
  }
  disconnected() { clearInterval(this._resendIv); }
  update() { this.render(); }

  render() {
    const method = this.method, isBackup = this._mode === 'backup';
    const subtitle = method === 'totp' ? this.t('twofaVerify.subtitleTotp') : this.t('twofaVerify.subtitleDest', { destination: this.maskedDestination || '' });
    const otpSupported = !isBackup && customElements.get('o-otp');
    let input;
    if (isBackup) {
      input = h('input', { class: 'o-input o-2fa-backup-input', name: 'backup', autocomplete: 'off', spellcheck: 'false', placeholder: this.t('twofaVerify.backupPlaceholder'), 'aria-label': this.t('twofaVerify.backupLabel'), autofocus: true });
    } else if (otpSupported) {
      input = h('o-otp', { length: this.length, type: 'numeric', autofocus: true, 'resend-seconds': method === 'totp' ? null : this.resendSeconds });
      on(input, 'o-complete', e => this.verify(e.detail.value));
    } else {
      input = h('input', { class: 'o-input o-2fa-code-input', name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: this.length, autofocus: true });
    }
    this._input = input;
    this.focusTarget = input;
    this.box.replaceChildren(
      h('h2', { class: 'o-2fa-title' }, this.t('twofaVerify.title')),
      h('p', { class: 'o-2fa-text' }, isBackup ? this.t('twofaVerify.backupLabel') : subtitle),
      h('form', null,
        input,
        h('div', { class: 'o-2fa-verify-msg', role: 'alert', 'aria-live': 'assertive' }),
        (!isBackup && !otpSupported && method !== 'totp') ? h('div', { class: 'o-2fa-resend' }, h('button', { type: 'button', class: 'o-btn o-btn-link o-btn-sm', 'data-2fa-resend': '' }, this.t('twofaVerify.resend'))) : null,
        this.trustDevice ? h('label', { class: 'o-check o-2fa-trust' }, h('input', { type: 'checkbox', name: 'trust' }), h('span', null, this.t('twofaVerify.trustDevice'))) : null,
        h('button', { type: 'submit', class: 'o-btn o-btn-primary o-btn-block', id: 'tfa-v-submit' }, this.t('twofaVerify.verify'))),
      h('a', { href: '#', class: 'o-2fa-switch-link', 'data-2fa-use-backup': isBackup ? null : '', 'data-2fa-use-code': isBackup ? '' : null }, isBackup ? this.t('twofaVerify.useCode') : this.t('twofaVerify.useBackup')));
  }
  currentCode() {
    if (this._mode === 'backup') return this.box.querySelector('[name=backup]')?.value?.trim();
    if (this._input && this._input.localName === 'o-otp') return this._input.value;
    return this.box.querySelector('[name=code]')?.value;
  }
  submit() { this.verify(this.currentCode()); }
  useBackupCode() { this._mode = 'backup'; this.render(); this.emit('use-backup-code', {}); focusFirst(this.box); }
  usePassword() { this._mode = 'code'; this.render(); focusFirst(this.box); }
  clearMsg() { const el = this.box.querySelector('.o-2fa-verify-msg'); if (el) el.textContent = ''; this.box.querySelector('.o-2fa-verify-box')?.classList.remove('is-invalid'); }

  async verify(code) {
    if (this._busy) return;
    if (!code) { this.markInvalid(); return; }
    const trust = this.trustDevice ? !!this.box.querySelector('[name=trust]')?.checked : undefined;
    if (!this.emit('verify', { code, method: this.method, trustDevice: trust })) return;
    if (!isFn(this.onVerify)) return;
    this._setBusy(true);
    try {
      const ok = await this.onVerify(code, { trustDevice: trust });
      this._setBusy(false);
      if (ok === false) throw new Error(this.t('twofaVerify.invalid'));
      this.markValid();
      this.emit('verified', { method: this.method, trustDevice: trust });
    } catch (err) {
      this._setBusy(false);
      this.markInvalid(err && err.message);
      this.emit('error', { error: err });
    }
  }
  _setBusy(on) { this._busy = on; const btn = this.box.querySelector('#tfa-v-submit'); if (btn) { btn.classList.toggle('is-loading', on); btn.disabled = on; } }
  markValid() { announce(this.t('twofaVerify.verified')); this.classList.add('is-verified'); }
  markInvalid(msg) {
    const el = this.box.querySelector('.o-2fa-verify-msg');
    if (el) el.textContent = msg || this.t('twofaVerify.invalid');
    if (this._input && this._input.localName === 'o-otp') this._input.setError(msg);
    else animate(this.box, 'shake', { duration: 320 });
    announce(msg || this.t('twofaVerify.invalid'), 'assertive');
  }
  resend() {
    clearInterval(this._resendIv);
    const btn = this.box.querySelector('[data-2fa-resend]');
    if (!btn || !this.emit('resend', {})) return;
    announce(this.t('twofaVerify.sent'));
    let left = this.resendSeconds;
    btn.disabled = true;
    const tick = () => { btn.textContent = this.t('twofaVerify.resendIn', { time: left }); if (--left < 0) { clearInterval(this._resendIv); btn.disabled = false; btn.textContent = this.t('twofaVerify.resend'); } };
    tick(); this._resendIv = setInterval(tick, 1000);
  }
  reset() { this._mode = 'code'; this.classList.remove('is-verified'); this.render(); }
  focus(opts) { (this.focusTarget || this._input)?.focus?.(opts); }
}
define('o-2fa-verify', O2faVerify);
O.TwoFactorVerify = O2faVerify;
