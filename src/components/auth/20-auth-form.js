/* <o-auth-form type="login|register|forgot|reset|lock|magic-link" brand logo social='["google","microsoft","github","apple"]'
 *              remember terms-url>
 * A complete, accessible authentication form for one of six modes. Per-type fields with correct
 * autocomplete/inputmode, password show/hide + caps-lock hint + strength meter (via the `inputs` package's
 * data-o-password-toggle / data-o-strength behaviors when present — plain attributes otherwise, so nothing
 * breaks when that package is absent), confirm-password matching, terms checkbox, inline validation
 * (Orion.validate.check when the `forms` package is present, otherwise light built-in checks), a loading
 * submit button, a top error alert, "check your inbox" / "password updated" success screens with a resend
 * countdown, social buttons and mode-switch links.
 *   onSubmit: async (data) => void            data: { email, password, name, confirmPassword, remember, terms }
 *   onSubmit may throw { message, field? }    (field -> inline error; no field -> top alert)
 *   Methods: submit() reset() showSuccess() showError(err) focus()
 *   Events: o-submit {type,data} (cancelable — prevent to fully take over submission), o-success {type,data,result},
 *           o-error {type,error}, o-social {provider}, o-mode {type} (cancelable), o-resend {type,data} (cancelable)
 */
i18n.add('en', {
  auth: {
    email: 'Email', password: 'Password', confirmPassword: 'Confirm password', name: 'Full name',
    required: '{label} is required.', invalidEmail: 'Enter a valid email address.', minLength: 'Must be at least {n} characters.',
    passwordMismatch: 'Passwords do not match.', termsRequired: 'You must accept the terms to continue.',
    formHasErrors: 'Please fix the highlighted fields.', genericError: 'Something went wrong. Please try again.',
    rememberMe: 'Remember me', forgotPassword: 'Forgot password?', termsPrefix: 'I agree to the', termsLink: 'Terms & Privacy Policy',
    notYou: 'Not you?', orContinueWith: 'or continue with',
    login: { title: 'Welcome back', subtitle: 'Sign in to your account', submit: 'Sign in', switchText: "Don't have an account?", switchLink: 'Sign up', switchTo: 'register' },
    register: { title: 'Create your account', subtitle: 'Start your free trial — no credit card required', submit: 'Create account', switchText: 'Already have an account?', switchLink: 'Sign in', switchTo: 'login' },
    forgot: { title: 'Forgot your password?', subtitle: "Enter your email and we'll send you a reset link", submit: 'Send reset link', switchText: 'Remembered it?', switchLink: 'Back to sign in', switchTo: 'login' },
    reset: { title: 'Set a new password', subtitle: 'Choose a strong password you have not used before', submit: 'Reset password' },
    'magic-link': { title: 'Sign in with email', subtitle: "We'll email you a one-time sign-in link", submit: 'Send magic link', switchText: 'Prefer a password?', switchLink: 'Sign in instead', switchTo: 'login' },
    lock: { title: 'Welcome back', subtitle: 'Enter your password to continue', submit: 'Unlock' },
    checkInboxTitle: 'Check your inbox', checkInboxText: "We've sent a link to {email}. It expires in 15 minutes.",
    resend: 'Resend', resendIn: 'Resend in {time}s', resent: 'Email sent again',
    passwordUpdatedTitle: 'Password updated', passwordUpdatedText: 'Your password has been changed successfully.',
    continueToSignIn: 'Continue to sign in',
  },
});

const SOCIAL_ICONS = {
  google: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.3 7.4 24 12 24z"/><path fill="#FBBC05" d="M5.4 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.4C.5 8.3 0 10.1 0 12s.5 3.7 1.4 5.4z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.7 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>',
  microsoft: '<svg viewBox="0 0 23 23" width="18" height="18" aria-hidden="true"><rect width="11" height="11" fill="#F35325"/><rect x="12" width="11" height="11" fill="#81BC06"/><rect y="12" width="11" height="11" fill="#05A6F0"/><rect x="12" y="12" width="11" height="11" fill="#FFBA08"/></svg>',
  github: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.7.5.7 5.6.7 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2.2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.2-1.7-1.2-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 1.7 2.6 1.2 3.3.9.1-.7.4-1.2.7-1.5-2.5-.3-5.2-1.3-5.2-5.6 0-1.2.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2.9-.3 2-.4 3-.4s2.1.1 3 .4c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.3-5.2 5.6.4.3.8 1 .8 2v3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.3 5.6 18.3.5 12 .5z"/></svg>',
  apple: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M16.7 1c.1 1.2-.3 2.4-1 3.3-.8.9-2 1.7-3.2 1.6-.1-1.2.4-2.4 1.1-3.2C14.4 1.7 15.6 1 16.7 1zM20.8 17.2c-.5 1.1-.7 1.6-1.4 2.6-.9 1.4-2.2 3.1-3.8 3.1-1.4 0-1.8-.9-3.7-.9s-2.4.9-3.7.9c-1.6 0-2.8-1.5-3.7-2.9-2.5-3.8-2.7-8.3-1.2-10.7 1.1-1.7 2.8-2.7 4.4-2.7 1.6 0 2.7.9 4 .9 1.3 0 2.1-.9 4-.9 1.4 0 2.9.8 4 2.1-3.5 1.9-2.9 6.9.1 8.5z"/></svg>',
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 30;

async function checkField(name, value, rules, label) {
  if (O.validate && isFn(O.validate.check)) { try { return await O.validate.check(value, rules, { label }); } catch { /* fall through */ } }
  const empty = value == null || value === '' || value === false;
  for (const r of String(rules).split('|')) {
    if (r === 'required' && empty) return t('auth.required', { label });
    if (r === 'email' && !empty && !EMAIL_RE.test(value)) return t('auth.invalidEmail');
    if (r.startsWith('min:') && !empty && String(value).length < +r.slice(4)) return t('auth.minLength', { n: +r.slice(4) });
  }
  return null;
}

class OAuthForm extends OElement {
  static props = {
    type: { type: String, default: 'login', reflect: true },
    brand: String, logo: String,
    social: { type: Array, default: () => [] },
    remember: Boolean,
    termsUrl: String,
    user: { type: Object, default: () => ({}) },
    onSubmit: { type: Function, attr: false },
    texts: Object,
  };
  setup() {
    this.classList.add('o-auth-form');
    this.alertBox = h('div', { class: 'o-alert o-alert-danger o-auth-alert', role: 'alert', hidden: true });
    this.headerEl = h('div', { class: 'o-auth-header' });
    this.bodyEl = h('div', { class: 'o-auth-body' });
    this.footerEl = h('div', { class: 'o-auth-footer' });
    this.successEl = h('div', { class: 'o-auth-success', hidden: true });
    this.form = h('form', { novalidate: true, class: 'o-auth-form-el' }, this.alertBox, this.headerEl, this.bodyEl, this.footerEl);
    this.append(this.form, this.successEl);
    on(this.form, 'submit', e => { e.preventDefault(); this.submit(); });
    on(this.form, 'click', 'a[data-mode]', (e, a) => { e.preventDefault(); this.switchMode(a.dataset.mode); });
    on(this.form, 'click', '.o-auth-social button', (e, btn) => this.emit('social', { provider: btn.dataset.provider }));
    on(this.form, 'click', '[data-not-you]', e => { e.preventDefault(); this.emit('switch-user', {}); });
    on(this.form, 'input', 'input[data-confirm]', (e, input) => this.checkConfirm(input));
    on(this.form, 'input', '[name]', (e, input) => this.clearError(input.name));
    on(this.successEl, 'click', '[data-resend]', e => { e.preventDefault(); this.resend(); });
    on(this.successEl, 'click', 'a[data-mode]', (e, a) => { e.preventDefault(); this.switchMode(a.dataset.mode); });
    this.focusTarget = null;
  }
  disconnected() { clearInterval(this._resendIv); }
  update(changed) {
    if (changed.has('type') && !changed.has('init')) { this.successEl.hidden = true; this.form.hidden = false; clearInterval(this._resendIv); this.hideAlert(); }
    this._build();
  }

  /* ── building ── */
  field({ name, label, type = 'text', autocomplete, inputmode, extraAttrs = {}, hint }) {
    const id = uid('af'), errId = id + '-err';
    const input = h('input', { id, name, type, class: 'o-input', autocomplete, inputmode, required: true, 'aria-describedby': errId, ...extraAttrs });
    const box = h('div', { class: 'o-field', 'data-field': name },
      h('label', { class: 'o-label', for: id }, label),
      (type === 'password' ? h('div', { class: 'o-input-wrap' }, input) : input),
      hint ? h('div', { class: 'o-help' }, hint) : null,
      h('div', { class: 'o-error', id: errId }));
    this.focusTarget = this.focusTarget || input;
    return box;
  }
  _paintHeader() {
    const type = this.type, brandRow = (this.logo || this.brand) ? h('div', { class: 'o-auth-brand' },
      this.logo ? h('img', { src: this.logo, alt: this.brand || '' }) : null,
      this.brand ? h('span', null, this.brand) : null) : null;
    const heading = type === 'lock' ? this._lockHeader() : h('div', { class: 'o-auth-heading' },
      h('h1', { class: 'o-auth-title' }, this.t(`auth.${type}.title`)),
      h('p', { class: 'o-auth-subtitle' }, this.t(`auth.${type}.subtitle`)));
    this.headerEl.replaceChildren(...[brandRow, heading].filter(Boolean));
  }
  _lockHeader() {
    const u = this.user || {};
    return h('div', { class: 'o-auth-lock-user' },
      h('span', { class: 'o-avatar o-avatar-2xl' }, u.avatar ? h('img', { src: u.avatar, alt: '' }) : (u.name || '?').trim().slice(0, 1).toUpperCase()),
      h('h1', { class: 'o-auth-title' }, u.name || this.t('auth.lock.title')),
      u.email ? h('p', { class: 'o-auth-subtitle' }, u.email) : h('p', { class: 'o-auth-subtitle' }, this.t('auth.lock.subtitle')));
  }
  _build() {
    const type = this.type;
    this.focusTarget = null;
    this._paintHeader();
    const boxes = [];
    if (type === 'register') boxes.push(this.field({ name: 'name', label: this.t('auth.name'), autocomplete: 'name' }));
    if (type !== 'lock') boxes.push(this.field({ name: 'email', label: this.t('auth.email'), type: 'email', autocomplete: type === 'login' ? 'username' : 'email', inputmode: 'email' }));
    if (type !== 'forgot' && type !== 'magic-link') {
      boxes.push(this.field({
        name: 'password', label: this.t('auth.password'), type: 'password',
        autocomplete: (type === 'login' || type === 'lock') ? 'current-password' : 'new-password',
        extraAttrs: { 'data-o-password-toggle': '', ...(type === 'register' ? { 'data-o-strength': '', 'data-o-strength-rules': 'length:8,upper,lower,number' } : {}) },
      }));
    }
    if (type === 'register' || type === 'reset') {
      boxes.push(this.field({ name: 'confirmPassword', label: this.t('auth.confirmPassword'), type: 'password', autocomplete: 'new-password', extraAttrs: { 'data-o-password-toggle': '', 'data-confirm': 'password' } }));
    }
    this.bodyEl.replaceChildren(...boxes);
    if (type === 'login') {
      this.bodyEl.append(h('div', { class: 'o-auth-row' },
        this.remember ? h('label', { class: 'o-check o-check-inline' }, h('input', { type: 'checkbox', name: 'remember' }), h('span', null, this.t('auth.rememberMe'))) : h('span'),
        h('a', { href: '#', class: 'o-auth-link', 'data-mode': 'forgot' }, this.t('auth.forgotPassword'))));
    }
    if (type === 'register') {
      this.bodyEl.append(h('div', { class: 'o-field o-auth-terms', 'data-field': 'terms' },
        h('label', { class: 'o-check' }, h('input', { type: 'checkbox', name: 'terms' }),
          h('span', null, this.t('auth.termsPrefix') + ' ', this.termsUrl
            ? h('a', { href: this.termsUrl, target: '_blank', rel: 'noopener' }, this.t('auth.termsLink'))
            : h('span', null, this.t('auth.termsLink')))),
        h('div', { class: 'o-error' })));
    }
    if (type === 'lock') this.bodyEl.append(h('div', { class: 'o-auth-row o-auth-row-end' }, h('a', { href: '#', class: 'o-auth-link', 'data-not-you': '' }, this.t('auth.notYou'))));

    this.submitBtn = h('button', { type: 'submit', class: 'o-btn o-btn-primary o-btn-lg o-btn-block o-auth-submit' }, this.t(`auth.${type}.submit`));
    this.footerEl.replaceChildren(...[this.submitBtn, this._buildSocial(), this._buildSwitch()].filter(Boolean));
  }
  _buildSocial() {
    const list = toArr(this.social).filter(p => SOCIAL_ICONS[p]);
    if (!list.length || this.type === 'reset' || this.type === 'lock') return null;
    return h('div', { class: 'o-auth-social-wrap' },
      h('div', { class: 'o-auth-divider' }, this.t('auth.orContinueWith')),
      h('div', { class: 'o-auth-social' }, list.map(p => h('button', { type: 'button', class: 'o-btn', 'data-provider': p, 'aria-label': cap(p) }, raw(SOCIAL_ICONS[p])))));
  }
  _buildSwitch() {
    const cfg = this.t(`auth.${this.type}.switchTo`);
    if (!cfg || cfg === `auth.${this.type}.switchTo`) return null;
    return h('p', { class: 'o-auth-switch' }, this.t(`auth.${this.type}.switchText`) + ' ', h('a', { href: '#', 'data-mode': cfg }, this.t(`auth.${this.type}.switchLink`)));
  }

  /* ── validation ── */
  rulesFor(name) {
    if (name === 'email') return 'required|email';
    if (name === 'name') return 'required';
    if (name === 'password') return this.type === 'register' ? 'required|min:8' : 'required';
    return 'required';
  }
  async validateField(name, box) {
    const input = box.querySelector('[name]');
    const label = box.querySelector('label')?.textContent?.trim() || name;
    let msg = null;
    if (name === 'terms') { if (!input.checked) msg = this.t('auth.termsRequired'); }
    else if (name === 'confirmPassword') {
      const pw = this.form.querySelector('[name=password]')?.value || '';
      if (!input.value) msg = t('auth.required', { label });
      else if (input.value !== pw) msg = this.t('auth.passwordMismatch');
    } else {
      msg = await checkField(name, input.type === 'checkbox' ? input.checked : input.value, this.rulesFor(name), label);
    }
    this.setError(name, msg);
    return !msg;
  }
  checkConfirm(input) {
    const box = input.closest('[data-field]');
    if (!input.value) { this.clearError(box.dataset.field); return; }
    const pw = this.form.querySelector('[name=password]')?.value || '';
    this.setError(box.dataset.field, input.value === pw ? null : this.t('auth.passwordMismatch'));
  }
  setError(name, msg) {
    const box = this.form.querySelector(`[data-field="${CSS.escape ? CSS.escape(name) : name}"]`);
    if (!box) return;
    box.classList.toggle('is-invalid', !!msg);
    const err = box.querySelector('.o-error'); if (err) err.textContent = msg || '';
    const input = box.querySelector('[name]'); if (input) input.setAttribute('aria-invalid', String(!!msg));
  }
  clearError(name) { this.setError(name, null); }
  hideAlert() { this.alertBox.hidden = true; this.alertBox.textContent = ''; }
  showAlert(msg) { this.alertBox.textContent = msg; this.alertBox.hidden = false; announce(msg, 'assertive'); }
  collectData() {
    const data = {};
    for (const input of this.form.querySelectorAll('[name]')) data[input.name] = input.type === 'checkbox' ? input.checked : input.value;
    return data;
  }

  /* ── submit flow ── */
  async submit() {
    if (this._busy) return;
    this.hideAlert();
    const boxes = [...this.form.querySelectorAll('[data-field]')];
    const ok = await Promise.all(boxes.map(b => this.validateField(b.dataset.field, b)));
    const badIndex = ok.findIndex(x => !x);
    if (badIndex >= 0) {
      announce(this.t('auth.formHasErrors'), 'assertive');
      boxes[badIndex].querySelector('[name]')?.focus();
      return;
    }
    const data = this.collectData();
    if (!this.emit('submit', { type: this.type, data })) return;
    if (!isFn(this.onSubmit)) return;
    this._setBusy(true);
    this._lastData = data;
    try {
      const result = await this.onSubmit(data);
      this._setBusy(false);
      this.emit('success', { type: this.type, data, result });
      if (this.type === 'forgot' || this.type === 'magic-link' || this.type === 'reset') this.showSuccess(data);
    } catch (err) {
      this._setBusy(false);
      this.emit('error', { type: this.type, error: err });
      this.showError(err);
    }
  }
  _setBusy(on) {
    this._busy = on;
    this.submitBtn.classList.toggle('is-loading', on);
    this.form.setAttribute('aria-busy', String(on));
    this.form.querySelectorAll('input,button').forEach(el => { if (el !== this.submitBtn) el.disabled = on; });
    this.submitBtn.disabled = on;
  }
  showError(err) {
    if (err && err.field) { this.setError(err.field, err.message || t('auth.genericError')); this.form.querySelector(`[data-field="${err.field}"] [name]`)?.focus(); }
    else this.showAlert((err && err.message) || this.t('auth.genericError'));
  }
  /** Force the "check your inbox" / "password updated" success screen (also called automatically after onSubmit resolves). */
  showSuccess(data = this._lastData || {}) {
    const cfg = { forgot: { icon: 'inbox', title: 'checkInboxTitle', text: 'checkInboxText', resend: true },
      'magic-link': { icon: 'inbox', title: 'checkInboxTitle', text: 'checkInboxText', resend: true },
      reset: { icon: 'check-circle', title: 'passwordUpdatedTitle', text: 'passwordUpdatedText', resend: false } }[this.type];
    if (!cfg) return;
    this.form.hidden = true;
    this.successEl.hidden = false;
    this._resendUntil = cfg.resend ? Date.now() + RESEND_SECONDS * 1000 : 0;
    this.successEl.replaceChildren(...[
      h('div', { class: 'o-auth-success-icon' }, raw(String(icon(cfg.icon, { size: 30 })))),
      h('h2', { class: 'o-auth-title' }, this.t('auth.' + cfg.title)),
      h('p', { class: 'o-auth-subtitle' }, this.t('auth.' + cfg.text, { email: data.email || '' })),
      cfg.resend ? h('div', { class: 'o-auth-resend' }) : null,
      h('a', { href: '#', class: 'o-btn o-btn-ghost o-auth-back', 'data-mode': 'login' }, this.type === 'reset' ? this.t('auth.continueToSignIn') : this.t('auth.login.switchLink')),
    ].filter(Boolean));
    announce(this.t('auth.' + cfg.title));
    if (cfg.resend) this._tickResend();
  }
  _tickResend() {
    clearInterval(this._resendIv);
    const box = this.successEl.querySelector('.o-auth-resend');
    if (!box) return;
    const paint = () => {
      const left = Math.max(0, Math.ceil((this._resendUntil - Date.now()) / 1000));
      if (left > 0) box.replaceChildren(h('span', { class: 'o-text-muted' }, this.t('auth.resendIn', { time: left })));
      else { clearInterval(this._resendIv); box.replaceChildren(h('button', { type: 'button', class: 'o-btn o-btn-link o-btn-sm', 'data-resend': '' }, this.t('auth.resend'))); }
    };
    paint();
    if (this.isConnected) this._resendIv = setInterval(paint, 1000);
  }
  resend() {
    if (this._resendUntil > Date.now()) return;
    if (!this.emit('resend', { type: this.type, data: this._lastData })) return;
    this._resendUntil = Date.now() + RESEND_SECONDS * 1000;
    this._tickResend();
    announce(this.t('auth.resent'));
    if (isFn(this.onSubmit)) Promise.resolve(this.onSubmit(this._lastData)).catch(() => {});
  }
  switchMode(target) { if (this.emit('mode', { type: target })) this.type = target; }
  reset() { this.form.reset(); [...this.form.querySelectorAll('[data-field]')].forEach(b => this.setError(b.dataset.field, null)); this.hideAlert(); this.form.hidden = false; this.successEl.hidden = true; clearInterval(this._resendIv); }
  focus(opts) { (this.focusTarget || this.submitBtn)?.focus(opts); }
}
define('o-auth-form', OAuthForm);
O.AuthForm = OAuthForm;
