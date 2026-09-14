/* <o-2fa-setup issuer="Orion Admin" account="ada@example.com" secret methods="totp,sms,email">
 * Step flow: choose method (skipped when there is only one) -> set up (QR / phone / email) -> verify code
 * -> backup codes -> done. Uses <o-qrcode> / Orion.qr.svg when the `codes` package is present (otherwise
 * shows the otpauth:// URI and a copyable secret), <o-otp> when the `inputs` package is present (otherwise
 * a plain digit input), and <o-stepper> for the progress dots when the `forms` package is present.
 *   Props: issuer account secret(auto-generated if empty) methods(Array,"totp,sms,email") digits(=6) period(=30)
 *          backupCodesCount(=10) onVerify: async (code, method) => boolean|void (throw {message} to reject) texts
 *   Methods: next() prev() goTo(step) reset() backupCodes()
 *   Events: o-method {method}, o-verified {method}, o-error {error}, o-done {backupCodes}, o-step {step, index}
 * SECURITY: onVerify (or the built-in Orion.totp.verify fallback) is for demos / offline apps only — a real
 * login must verify the submitted code against the secret stored on the server, never trust the client.
 */
i18n.add('en', {
  twofa: {
    step: { method: 'Method', setup: 'Set up', verify: 'Verify', backup: 'Backup codes', done: 'Done' },
    chooseMethod: 'Choose a verification method', chooseMethodText: 'Pick how you want to receive your codes.',
    methodTotp: 'Authenticator app', methodTotpDesc: 'Google Authenticator, 1Password, Authy…',
    methodSms: 'Text message', methodSmsDesc: 'Get a code by SMS',
    methodEmail: 'Email', methodEmailDesc: 'Get a code by email',
    scanTitle: 'Scan the QR code', scanText: 'Scan this with your authenticator app, or enter the code manually.',
    manualEntry: 'Or enter this code manually', copy: 'Copy', copied: 'Copied',
    continueBtn: 'Continue', phoneLabel: 'Phone number', sendCode: 'Send code',
    emailSendText: "We'll send a verification code to {account}.",
    verifyTitle: 'Enter the verification code', verifyTextTotp: 'Enter the 6-digit code shown in your authenticator app.',
    verifyTextSms: 'Enter the code we sent to {destination}.', verifyTextEmail: 'Enter the code we sent to {destination}.',
    invalidCode: 'That code is incorrect. Try again.', verify: 'Verify', verifying: 'Verifying…', resend: 'Resend code', resendIn: 'Resend in {time}s',
    backupTitle: 'Save your backup codes', backupText: 'Use one of these if you lose access to your device. Each code works once.',
    copyAll: 'Copy all', download: 'Download', print: 'Print', savedConfirm: "I've saved these codes",
    finish: 'Finish', doneTitle: 'Two-factor authentication is enabled', doneText: 'Your account now has an extra layer of security.',
    close: 'Close', back: 'Back', serverNote: 'The code above is checked in your browser for this demo — a real sign-in must verify it on your server.',
  },
});
if (!O.icons.has('smartphone')) O.icons.add({ smartphone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>' });
if (!O.icons.has('mail')) O.icons.add({ mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>' });
if (!O.icons.has('message-circle')) O.icons.add({ 'message-circle': '<path d="M21 11.5a8.4 8.4 0 0 1-8.9 8.4 8.4 8.4 0 0 1-3.6-.9L3 21l1.9-5.5a8.4 8.4 0 0 1-.9-3.6 8.4 8.4 0 0 1 8.4-8.9h.4a8.4 8.4 0 0 1 8.2 8.2z"/>' });
if (!O.icons.has('shield-check')) O.icons.add({ 'shield-check': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>' });

const METHOD_META = {
  totp: { icon: 'smartphone', label: 'methodTotp', desc: 'methodTotpDesc' },
  sms: { icon: 'message-circle', label: 'methodSms', desc: 'methodSmsDesc' },
  email: { icon: 'mail', label: 'methodEmail', desc: 'methodEmailDesc' },
};
function genBackupCodes(n = 10) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const bytes = new Uint8Array(5);
    (globalThis.crypto || {}).getRandomValues?.(bytes);
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    out.push(hex.slice(0, 5) + '-' + hex.slice(5, 10));
  }
  return out;
}
function maskEmail(a) { const [u, d] = String(a || '').split('@'); if (!d) return a || ''; return (u[0] || '') + '•••@' + d; }
function maskPhone(p) { const digits = String(p || '').replace(/\D/g, ''); return digits ? '•••• ' + digits.slice(-4) : ''; }

class O2faSetup extends OElement {
  static props = {
    issuer: String, account: String, secret: String,
    methods: { type: Array, default: () => ['totp'] },
    digits: { type: Number, default: 6 }, period: { type: Number, default: 30 },
    backupCodesCount: { type: Number, default: 10 },
    onVerify: { type: Function, attr: false }, texts: Object,
  };
  setup() {
    this.classList.add('o-2fa', 'o-2fa-setup');
    this._step = null; this._method = null; this._phone = ''; this._codes = [];
    this.progressEl = h('div', { class: 'o-2fa-progress' });
    this.bodyEl = h('div', { class: 'o-2fa-body' });
    this.append(this.progressEl, this.bodyEl);
    on(this, 'click', '[data-2fa-method]', (e, b) => this.chooseMethod(b.dataset.twofaMethod));
    on(this, 'click', '[data-2fa-next]', () => this.handleSetupContinue());
    on(this, 'click', '[data-2fa-back]', () => this.prev());
    on(this, 'click', '[data-2fa-copy-secret]', (e, b) => this.copySecret(b));
    on(this, 'submit', 'form[data-2fa-verify]', e => { e.preventDefault(); this.submitCode(); });
    on(this, 'click', '[data-2fa-resend]', () => this.resend());
    on(this, 'click', '[data-2fa-copy-codes]', () => this.copyCodes());
    on(this, 'click', '[data-2fa-download]', () => this.downloadCodes());
    on(this, 'click', '[data-2fa-print]', () => this.printCodes());
    on(this, 'change', '[data-2fa-saved]', (e, cb) => { this.bodyEl.querySelector('[data-2fa-finish]').disabled = !cb.checked; });
    on(this, 'click', '[data-2fa-finish]', () => this.finish());
  }
  connected() { if (!this.secret) this.secret = O.totp.generateSecret(); }
  disconnected() { clearInterval(this._resendIv); }
  update(changed) {
    if (!this._step) this._step = this.stepList()[0];
    if (this._step === 'setup' && !this._method) this._method = this.methods[0] || 'totp';
    if (changed.has('secret') && !this.secret) return; // wait for connected() to assign one
    this.render();
  }
  stepList() { return toArr(this.methods).length > 1 ? ['method', 'setup', 'verify', 'backup', 'done'] : ['setup', 'verify', 'backup', 'done']; }

  /* ── navigation ── */
  goTo(step) {
    if (!this.stepList().includes(step)) return;
    this._step = step;
    this.render();
    this.emit('step', { step, index: this.stepList().indexOf(step) });
    focusFirst(this.bodyEl);
  }
  next() { const s = this.stepList(), i = s.indexOf(this._step); if (i < s.length - 1) this.goTo(s[i + 1]); }
  prev() { const s = this.stepList(), i = s.indexOf(this._step); if (i > 0) this.goTo(s[i - 1]); }
  chooseMethod(m) { this._method = m; this.emit('method', { method: m }); this.goTo('setup'); }
  handleSetupContinue() {
    if (this._method === 'sms') { const input = this.bodyEl.querySelector('[name=phone]'); this._phone = input ? input.value.trim() : ''; if (!this._phone) { input?.focus(); return; } }
    this.goTo('verify');
  }
  reset() { this._step = this.stepList()[0]; this._method = null; this._phone = ''; this._codes = []; this.secret = O.totp.generateSecret(); this.render(); }
  backupCodes() { return [...this._codes]; }

  /* ── render ── */
  render() {
    const steps = this.stepList(), idx = steps.indexOf(this._step);
    this.progressEl.replaceChildren(this.buildProgress(steps, idx));
    const fn = { method: this.renderMethod, setup: this.renderSetup, verify: this.renderVerify, backup: this.renderBackup, done: this.renderDone }[this._step];
    this.bodyEl.replaceChildren(fn.call(this));
  }
  buildProgress(steps, idx) {
    if (customElements.get('o-stepper')) {
      if (!this._stepperEl) this._stepperEl = h('o-stepper', { variant: 'dots', responsive: 'false' });
      this._stepperEl.steps = steps.map(s => ({ title: this.t('twofa.step.' + s) }));
      this._stepperEl.current = idx;
      return this._stepperEl;
    }
    return h('div', { class: 'o-2fa-dots' }, steps.map((s, i) => h('span', { class: cls('o-2fa-dot', i === idx && 'is-active', i < idx && 'is-done'), title: this.t('twofa.step.' + s) })));
  }
  renderMethod() {
    return h('div', { class: 'o-2fa-step' },
      h('h2', { class: 'o-2fa-title' }, this.t('twofa.chooseMethod')),
      h('p', { class: 'o-2fa-text' }, this.t('twofa.chooseMethodText')),
      h('div', { class: 'o-2fa-methods' }, toArr(this.methods).map(m => {
        const meta = METHOD_META[m] || { icon: 'shield-check', label: m, desc: '' };
        return h('button', { type: 'button', class: 'o-2fa-method', 'data-2fa-method': '', 'data-twofa-method': m },
          h('span', { class: 'o-2fa-method-icon' }, raw(String(icon(meta.icon, { size: 20 })))),
          h('span', { class: 'o-2fa-method-text' }, h('b', null, this.t('twofa.' + meta.label)), h('span', null, meta.desc ? this.t('twofa.' + meta.desc) : '')),
          raw(String(icon('chevron-right', { size: 16, class: 'o-2fa-method-chev' }))));
      })));
  }
  renderSetup() {
    if (this._method === 'totp') {
      const uriStr = O.totp.uri({ issuer: this.issuer, account: this.account, secret: this.secret, digits: this.digits, period: this.period });
      return h('div', { class: 'o-2fa-step' },
        h('h2', { class: 'o-2fa-title' }, this.t('twofa.scanTitle')),
        h('p', { class: 'o-2fa-text' }, this.t('twofa.scanText')),
        this.qrBlock(uriStr),
        h('div', { class: 'o-2fa-secret' },
          h('span', { class: 'o-2fa-secret-label' }, this.t('twofa.manualEntry')),
          h('div', { class: 'o-2fa-secret-row' },
            h('code', { class: 'o-2fa-secret-code' }, this.secret.replace(/(.{4})/g, '$1 ').trim()),
            h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', 'data-2fa-copy-secret': '' }, raw(String(icon('copy', { size: 14 }))), h('span', null, this.t('twofa.copy'))))),
        this.navRow(true, this.t('twofa.continueBtn')));
    }
    if (this._method === 'sms') {
      return h('div', { class: 'o-2fa-step' },
        h('h2', { class: 'o-2fa-title' }, this.t('twofa.methodSms')),
        h('div', { class: 'o-field' }, h('label', { class: 'o-label', for: 'tfa-phone' }, this.t('twofa.phoneLabel')),
          h('input', { id: 'tfa-phone', name: 'phone', type: 'tel', class: 'o-input', inputmode: 'tel', autocomplete: 'tel', value: this._phone, placeholder: '+1 555 000 1234' })),
        this.navRow(true, this.t('twofa.sendCode')));
    }
    return h('div', { class: 'o-2fa-step' },
      h('h2', { class: 'o-2fa-title' }, this.t('twofa.methodEmail')),
      h('p', { class: 'o-2fa-text' }, this.t('twofa.emailSendText', { account: this.account || '' })),
      this.navRow(true, this.t('twofa.sendCode')));
  }
  qrBlock(uriStr) {
    if (customElements.get('o-qrcode')) return h('o-qrcode', { value: uriStr, size: '176', class: 'o-2fa-qr' });
    if (O.qr && isFn(O.qr.svg)) return h('div', { class: 'o-2fa-qr', html: O.qr.svg(uriStr, { size: 176 }) });
    return h('div', { class: 'o-2fa-qr o-2fa-qr-fallback' }, raw(String(icon('smartphone', { size: 28 }))), h('code', null, uriStr));
  }
  renderVerify() {
    const destination = this._method === 'sms' ? maskPhone(this._phone) : maskEmail(this.account);
    const text = this._method === 'totp' ? this.t('twofa.verifyTextTotp') : this.t('twofa.verifyText' + cap(this._method), { destination });
    const otpSupported = customElements.get('o-otp');
    const input = otpSupported
      ? h('o-otp', { length: this.digits, type: 'numeric', autofocus: true, 'resend-seconds': this._method === 'totp' ? null : 30 })
      : h('div', { class: 'o-2fa-fallback-otp' }, h('input', { class: 'o-input o-2fa-code-input', name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: this.digits, autofocus: true }));
    if (otpSupported) { on(input, 'o-complete', e => this.submitCode(e.detail.value)); on(input, 'o-resend', () => this.resend()); }
    this._verifyInput = input;
    return h('div', { class: 'o-2fa-step' },
      h('h2', { class: 'o-2fa-title' }, this.t('twofa.verifyTitle')),
      h('p', { class: 'o-2fa-text' }, text),
      h('form', { 'data-2fa-verify': '' }, input,
        h('div', { class: 'o-2fa-verify-msg', role: 'alert' }),
        !otpSupported && this._method !== 'totp' ? h('div', { class: 'o-2fa-resend' }, h('button', { type: 'button', class: 'o-btn o-btn-link o-btn-sm', 'data-2fa-resend': '' }, this.t('twofa.resend'))) : null,
        h('div', { class: 'o-2fa-actions' },
          h('button', { type: 'button', class: 'o-btn', 'data-2fa-back': '' }, this.t('twofa.back')),
          h('button', { type: 'submit', class: 'o-btn o-btn-primary', id: 'tfa-verify-submit' }, this.t('twofa.verify')))));
  }
  renderBackup() {
    return h('div', { class: 'o-2fa-step' },
      h('h2', { class: 'o-2fa-title' }, this.t('twofa.backupTitle')),
      h('p', { class: 'o-2fa-text' }, this.t('twofa.backupText')),
      h('ol', { class: 'o-2fa-codes' }, this._codes.map(c => h('li', null, h('code', null, c)))),
      h('div', { class: 'o-2fa-code-actions' },
        h('button', { type: 'button', class: 'o-btn o-btn-sm', 'data-2fa-copy-codes': '' }, raw(String(icon('copy', { size: 14 }))), h('span', null, this.t('twofa.copyAll'))),
        h('button', { type: 'button', class: 'o-btn o-btn-sm', 'data-2fa-download': '' }, raw(String(icon('download', { size: 14 }))), h('span', null, this.t('twofa.download'))),
        h('button', { type: 'button', class: 'o-btn o-btn-sm', 'data-2fa-print': '' }, raw(String(icon('printer', { size: 14 }))), h('span', null, this.t('twofa.print')))),
      h('label', { class: 'o-check o-2fa-confirm' }, h('input', { type: 'checkbox', 'data-2fa-saved': '' }), h('span', null, this.t('twofa.savedConfirm'))),
      h('div', { class: 'o-2fa-actions' }, h('button', { type: 'button', class: 'o-btn o-btn-primary', 'data-2fa-finish': '', disabled: true }, this.t('twofa.finish'))));
  }
  renderDone() {
    return h('div', { class: 'o-2fa-step o-2fa-done' },
      h('div', { class: 'o-2fa-done-icon' }, raw(String(icon('check', { size: 30 })))),
      h('h2', { class: 'o-2fa-title' }, this.t('twofa.doneTitle')),
      h('p', { class: 'o-2fa-text' }, this.t('twofa.doneText')));
  }
  navRow(showBack, label) {
    return h('div', { class: 'o-2fa-actions' },
      showBack && this.stepList().indexOf(this._step) > 0 ? h('button', { type: 'button', class: 'o-btn', 'data-2fa-back': '' }, this.t('twofa.back')) : h('span'),
      h('button', { type: 'button', class: 'o-btn o-btn-primary', 'data-2fa-next': '' }, label));
  }

  /* ── actions ── */
  async copySecret(btn) {
    try { await navigator.clipboard.writeText(this.secret); } catch {}
    const span = btn.querySelector('span'); const orig = span.textContent;
    span.textContent = this.t('twofa.copied'); announce(this.t('twofa.copied'));
    setTimeout(() => { span.textContent = orig; }, 1500);
  }
  async submitCode(code) {
    const otpEl = this._verifyInput && this._verifyInput.localName === 'o-otp' ? this._verifyInput : null;
    code = code ?? (otpEl ? otpEl.value : this.bodyEl.querySelector('[name=code]')?.value);
    if (!code || String(code).length < this.digits) { otpEl ? otpEl.setError() : this.showVerifyMsg(this.t('twofa.invalidCode')); return; }
    const submitBtn = this.bodyEl.querySelector('#tfa-verify-submit');
    if (submitBtn) { submitBtn.classList.add('is-loading'); submitBtn.disabled = true; }
    try {
      let ok;
      if (isFn(this.onVerify)) ok = await this.onVerify(code, this._method);
      else if (this._method === 'totp') ok = await O.totp.verify(this.secret, code, { digits: this.digits, period: this.period });
      else ok = true; // sms/email demo methods have no server wired up — accept once a code of the right length is entered
      if (ok === false) throw new Error(this.t('twofa.invalidCode'));
      this.emit('verified', { method: this._method });
      this._codes = genBackupCodes(this.backupCodesCount);
      this.goTo('backup');
    } catch (err) {
      if (otpEl) { otpEl.setError(err && err.message); } else { this.showVerifyMsg((err && err.message) || this.t('twofa.invalidCode')); animate(this.bodyEl.querySelector('.o-2fa-fallback-otp'), 'shake', { duration: 320 }); }
      this.emit('error', { error: err });
    } finally {
      if (submitBtn) { submitBtn.classList.remove('is-loading'); submitBtn.disabled = false; }
    }
  }
  showVerifyMsg(msg) { const el = this.bodyEl.querySelector('.o-2fa-verify-msg'); if (el) el.textContent = msg || ''; }
  resend() {
    clearInterval(this._resendIv);
    const btn = this.bodyEl.querySelector('[data-2fa-resend]');
    if (!btn) return;
    announce(this.t('twofa.resend'));
    let left = 30;
    btn.disabled = true;
    const tick = () => { btn.textContent = this.t('twofa.resendIn', { time: left }); if (--left < 0) { clearInterval(this._resendIv); btn.disabled = false; btn.textContent = this.t('twofa.resend'); } };
    tick(); this._resendIv = setInterval(tick, 1000);
  }
  copyCodes() { try { navigator.clipboard.writeText(this._codes.join('\n')); } catch {} announce(this.t('twofa.copied')); }
  downloadCodes() { download(this._codes.join('\n') + '\n', 'backup-codes.txt', 'text/plain'); }
  printCodes() {
    const frame = h('iframe', { style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0', 'aria-hidden': 'true' });
    doc.body.append(frame);
    const fdoc = frame.contentDocument;
    fdoc.open();
    fdoc.write(`<!doctype html><title>${esc(this.t('twofa.backupTitle'))}</title><style>body{font-family:ui-monospace,monospace;padding:2rem}li{font-size:1.15rem;letter-spacing:.06em;margin-bottom:.6rem}</style><h2>${esc(this.t('twofa.backupTitle'))}</h2><ol>${this._codes.map(c => `<li>${esc(c)}</li>`).join('')}</ol>`);
    fdoc.close();
    frame.onload = () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch {} setTimeout(() => frame.remove(), 1000); };
  }
  finish() { this.emit('done', { backupCodes: this.backupCodes() }); this.goTo('done'); }
}
define('o-2fa-setup', O2faSetup);
O.TwoFactorSetup = O2faSetup;

O.twofa = { generateBackupCodes: genBackupCodes };
