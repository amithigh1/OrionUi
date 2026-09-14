/* Third-party CAPTCHA adapters: <o-recaptcha> (Google), <o-hcaptcha> (Intuition Machines), <o-turnstile> (Cloudflare).
 * Each lazy-loads its vendor script — via the core `loadScript()` helper, and ONLY once a `sitekey` is set —
 * then renders the vendor's own widget and exposes the solved token as `.value` (submitted under [name]).
 *   <o-recaptcha sitekey="..." version="v2|invisible|v3" theme="light|dark" size="normal|compact" action="submit"></o-recaptcha>
 *   <o-hcaptcha sitekey="..." theme="light|dark" size="normal|compact|invisible"></o-hcaptcha>
 *   <o-turnstile sitekey="..." theme="light|dark|auto" size="normal|flexible|compact" action="submit"></o-turnstile>
 * Methods: execute() (re-run an invisible/v3 challenge and resolve a fresh token), reset(), verify() -> Promise<boolean>.
 * Events: o-verify { token }, o-expire {}, o-error {}.
 * IMPORTANT: exactly like <o-captcha>, these only prove that *some* client ran the vendor's script — the token is
 * only meaningful once your server verifies it against the vendor's siteverify API. Never trust a token client-side.
 * Without a `sitekey` the element renders a placeholder explaining what is missing (nothing is loaded from the network).
 */
i18n.add('en', { captcha: { verifyAction: 'Verify', protectedBy: 'Protected by {vendor}' } });

const VENDORS = {
  recaptcha: {
    label: 'reCAPTCHA', global: 'grecaptcha', src: 'https://www.google.com/recaptcha/api.js?render=explicit',
    ready: (g, cb) => (isFn(g.ready) ? g.ready(cb) : cb()),
    render: (g, el, o) => g.render(el, { sitekey: o.sitekey, theme: o.theme, size: o.version === 'invisible' ? 'invisible' : o.size, callback: o.onToken, 'expired-callback': o.onExpire, 'error-callback': o.onError }),
    execute: (g, id) => g.execute(id),
    reset: (g, id) => g.reset(id),
  },
  hcaptcha: {
    label: 'hCaptcha', global: 'hcaptcha', src: 'https://js.hcaptcha.com/1/api.js?render=explicit',
    ready: (g, cb) => cb(),
    render: (g, el, o) => g.render(el, { sitekey: o.sitekey, theme: o.theme, size: o.size || 'normal', callback: o.onToken, 'expired-callback': o.onExpire, 'error-callback': o.onError }),
    execute: (g, id) => g.execute(id),
    reset: (g, id) => g.reset(id),
  },
  turnstile: {
    label: 'Turnstile', global: 'turnstile', src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    ready: (g, cb) => cb(),
    render: (g, el, o) => g.render(el, { sitekey: o.sitekey, theme: o.theme, size: o.size || 'normal', action: o.action, callback: o.onToken, 'expired-callback': o.onExpire, 'error-callback': o.onError }),
    execute: (g, id) => g.execute(id),
    reset: (g, id) => g.reset(id),
  },
};

function makeAdapter(name) {
  const V = VENDORS[name];
  return class extends FormElement {
    static props = {
      ...FormElement.props, value: { type: String, default: '' }, sitekey: { type: String, reflect: true },
      version: { type: String, default: 'v2' }, theme: { type: String, default: 'light' }, size: String,
      action: { type: String, default: 'submit' }, texts: Object,
    };
    setup() {
      this.classList.add('o-captcha', 'o-' + name);
      this.setAttribute('role', 'group');
      this.setAttribute('aria-label', V.label);
      this._box = h('div', { class: 'o-captcha-widget' });
      this.append(this._box);
    }
    connected() { this.listen(doc, 'o-theme', () => { if (!this.hasAttribute('theme')) this._rebuild(); }); }
    disconnected() { this._seq = (this._seq || 0) + 1; }
    update(changed) {
      if (['init', 'sitekey', 'version', 'theme', 'size', 'locale'].some(k => changed.has(k))) this._rebuild();
    }
    get focusTarget() { return this._box.querySelector('iframe, button, [tabindex]') || this._box; }

    async _rebuild() {
      const seq = (this._seq = (this._seq || 0) + 1);
      this._id = null;
      this.value = '';
      this._syncForm();
      this.classList.remove('is-verified', 'is-wrong');
      this._box.replaceChildren();
      if (!this.sitekey) { this._box.append(h('div', { class: 'o-captcha-placeholder' }, icon('alert-triangle'), t('captcha.noKey', { vendor: V.label }))); return; }
      const isV3 = name === 'recaptcha' && this.version === 'v3';
      this._box.append(h('div', { class: 'o-captcha-placeholder' }, h('span', { class: 'o-spinner o-spinner-xs' }), h('span', null, t('captcha.loading'))));
      try {
        await loadScript(V.src);
        const g = await new Promise(res => {
          const wait = () => (win[V.global] ? V.ready(win[V.global], () => res(win[V.global])) : setTimeout(wait, 30));
          wait();
        });
        if (seq !== this._seq || !this.isConnected) return;
        const cb = {
          sitekey: this.sitekey, theme: this.theme, size: this.size, action: this.action, version: this.version,
          onToken: token => { if (seq !== this._seq) return; this.setValue(token); this.classList.add('is-verified'); this.classList.remove('is-wrong'); announce(t('captcha.verified')); this.emit('verify', { token }); },
          onExpire: () => { if (seq !== this._seq) return; this.value = ''; this._syncForm(); this.classList.remove('is-verified'); announce(t('captcha.expired')); this.emit('expire', {}); },
          onError: () => { if (seq !== this._seq) return; this.classList.add('is-wrong'); this.emit('error', {}); },
        };
        this._box.replaceChildren();
        if (isV3) {
          this._box.append(h('p', { class: 'o-captcha-note' }, t('captcha.protectedBy', { vendor: V.label })));
          this._g = g;
          this._v3exec(cb);
        } else {
          const target = h('div');
          this._box.append(target);
          this._id = V.render(g, target, cb);
          this._g = g;
        }
      } catch (e) {
        if (seq !== this._seq) return;
        console.error(`[Orion] <o-${name}> failed to load:`, e);
        this._box.replaceChildren(h('div', { class: 'o-captcha-placeholder is-error' }, icon('alert-circle'), t('captcha.failed')));
      }
    }
    _v3exec(cb) {
      if (!this._g || !isFn(this._g.execute)) return;
      Promise.resolve(this._g.execute(this.sitekey, { action: this.action })).then(cb.onToken, cb.onError);
    }
    /** Re-run the challenge: fetches a fresh token for v3 / invisible widgets. */
    execute() {
      if (name === 'recaptcha' && this.version === 'v3') { this._v3exec({ onToken: t => { this.setValue(t); this.classList.add('is-verified'); this.emit('verify', { token: t }); }, onError: () => this.emit('error', {}) }); return; }
      if (this._g && this._id != null) { try { return V.execute(this._g, this._id); } catch (e) { console.error(e); } }
      return null;
    }
    /** Clear the current token and reset the vendor widget. */
    reset() {
      if (this._g && this._id != null) { try { V.reset(this._g, this._id); } catch {} }
      this.value = '';
      this._syncForm();
      this.classList.remove('is-verified', 'is-wrong');
    }
    formResetCallback() { super.formResetCallback(); this.reset(); }
    /** true once a token has been obtained (fetches one for v3 first). */
    async verify() {
      if (!this.sitekey) return false;
      if (this.isEmpty() && name === 'recaptcha' && this.version === 'v3') { this.execute(); await sleep(300); }
      return !this.isEmpty();
    }
  };
}

O.Recaptcha = define('o-recaptcha', makeAdapter('recaptcha'));
O.HCaptcha = define('o-hcaptcha', makeAdapter('hcaptcha'));
O.Turnstile = define('o-turnstile', makeAdapter('turnstile'));
