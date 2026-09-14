/* WebAuthn / passkeys — thin wrapper around navigator.credentials with base64url<->ArrayBuffer conversion.
 * Accepts the WebAuthn Level 3 JSON option format (PublicKeyCredentialCreationOptionsJSON /
 * PublicKeyCredentialRequestOptionsJSON), the shape most server SDKs (SimpleWebAuthn, Passwordless.ID,
 * Duo, etc.) already serialize to JSON. Uses PublicKeyCredential.parseCreationOptionsFromJSON /
 * parseRequestOptionsFromJSON when the browser supports them (Level 3), a manual conversion otherwise.
 *   Orion.webauthn.isSupported() -> boolean
 *   await Orion.webauthn.isPlatformAvailable() -> boolean       (Face ID / Touch ID / Windows Hello)
 *   await Orion.webauthn.isConditionalAvailable() -> boolean    (autofill / "conditional mediation" UI)
 *   await Orion.webauthn.register(optionsJSON, { signal }) -> credentialJSON
 *   await Orion.webauthn.authenticate(optionsJSON, { signal, mediation: 'conditional' }) -> credentialJSON
 *   Orion.webauthn.bufToB64url(buf) / b64urlToBuf(str)
 *
 * IMPORTANT: this only *collects* an attestation/assertion from the authenticator and returns it as JSON.
 * The signature must always be verified server-side against the challenge and stored public key — never
 * trust a client's report that a passkey ceremony "succeeded".
 */
function b64urlToBuf(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
function bufToB64url(buf) {
  let bin = '';
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function creationOptionsFromJSON(json) {
  if (win.PublicKeyCredential && isFn(win.PublicKeyCredential.parseCreationOptionsFromJSON)) return win.PublicKeyCredential.parseCreationOptionsFromJSON(json);
  const o = { ...json, challenge: b64urlToBuf(json.challenge), user: { ...json.user, id: b64urlToBuf(json.user.id) } };
  if (json.excludeCredentials) o.excludeCredentials = json.excludeCredentials.map(c => ({ ...c, id: b64urlToBuf(c.id) }));
  return o;
}
function requestOptionsFromJSON(json) {
  if (win.PublicKeyCredential && isFn(win.PublicKeyCredential.parseRequestOptionsFromJSON)) return win.PublicKeyCredential.parseRequestOptionsFromJSON(json);
  const o = { ...json, challenge: b64urlToBuf(json.challenge) };
  if (json.allowCredentials) o.allowCredentials = json.allowCredentials.map(c => ({ ...c, id: b64urlToBuf(c.id) }));
  return o;
}
function credentialToJSON(cred) {
  if (isFn(cred.toJSON)) return cred.toJSON();
  const r = cred.response, out = {
    id: cred.id, rawId: bufToB64url(cred.rawId), type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment || null,
    clientExtensionResults: isFn(cred.getClientExtensionResults) ? cred.getClientExtensionResults() : {},
  };
  const resp = { clientDataJSON: bufToB64url(r.clientDataJSON) };
  if (r.attestationObject) resp.attestationObject = bufToB64url(r.attestationObject);
  if (r.authenticatorData) resp.authenticatorData = bufToB64url(r.authenticatorData);
  if (r.signature) resp.signature = bufToB64url(r.signature);
  if (r.userHandle) resp.userHandle = bufToB64url(r.userHandle);
  if (isFn(r.getTransports)) resp.transports = r.getTransports();
  out.response = resp;
  return out;
}
const webauthn = {
  isSupported: () => isBrowser && !!win.PublicKeyCredential && !!(navigator.credentials && navigator.credentials.create),
  async isPlatformAvailable() {
    try { return webauthn.isSupported() && await win.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
    catch { return false; }
  },
  async isConditionalAvailable() {
    try { return webauthn.isSupported() && isFn(win.PublicKeyCredential.isConditionalMediationAvailable) && await win.PublicKeyCredential.isConditionalMediationAvailable(); }
    catch { return false; }
  },
  async register(optionsJSON, { signal } = {}) {
    if (!webauthn.isSupported()) throw new Error('Passkeys are not supported in this browser');
    const cred = await navigator.credentials.create({ publicKey: creationOptionsFromJSON(optionsJSON), signal });
    if (!cred) throw new Error('Passkey creation was cancelled');
    return credentialToJSON(cred);
  },
  async authenticate(optionsJSON, { signal, mediation } = {}) {
    if (!webauthn.isSupported()) throw new Error('Passkeys are not supported in this browser');
    const req = { publicKey: requestOptionsFromJSON(optionsJSON), signal };
    if (mediation) req.mediation = mediation;
    const cred = await navigator.credentials.get(req);
    if (!cred) throw new Error('Passkey sign-in was cancelled');
    return credentialToJSON(cred);
  },
  b64urlToBuf, bufToB64url,
};
O.webauthn = webauthn;

/* ── <o-biometric-login label fallback-href fallback-text> ──────────────
 * Idle -> waiting -> success | failed | unsupported button. The host supplies the WebAuthn request
 * options (fetched from its server) either as the `options` property/attribute or via a `getOptions()`
 * property (sync or async, called on demand); el.authenticate(json) drives the flow imperatively too.
 */
i18n.add('en', {
  biometric: {
    label: 'Sign in with a passkey', waiting: 'Waiting for your passkey…', success: 'Verified',
    failed: 'Could not verify — try again', unsupported: 'Passkeys are not supported on this device',
    fallback: 'Use password instead', retry: 'Try again',
  },
});
if (!O.icons.has('fingerprint')) O.icons.add({ fingerprint: '<path d="M12 3a7 7 0 0 0-7 7v2c0 2.2-.6 4.2-1.6 6M20.1 15.5A16.5 16.5 0 0 0 21 12v-2a9 9 0 0 0-15.7-6M8 21a13.6 13.6 0 0 0 1.9-6V9a3.5 3.5 0 1 1 7 0"/><path d="M12 9a1 1 0 0 0-1 1v2a13 13 0 0 1-3 8.3M16 20a20 20 0 0 0 1.5-7v-3"/>' });

class OBiometricLogin extends OElement {
  static props = {
    label: String,
    fallbackHref: String,
    fallbackText: String,
    getOptions: { type: Function, attr: false },
    options: { type: Object, attr: false },
    texts: Object,
  };
  setup() {
    this.classList.add('o-biometric');
    this._state = 'idle';
    this.btn = h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-lg o-biometric-btn' },
      h('span', { class: 'o-biometric-icon' }, raw(String(icon('fingerprint', { size: 22 })))),
      h('span', { class: 'o-biometric-text' }));
    this.status = h('div', { class: 'o-biometric-status', role: 'status', 'aria-live': 'polite' });
    this.fallback = h('a', { class: 'o-biometric-fallback', hidden: true });
    on(this.btn, 'click', () => this.trigger());
    this.append(this.btn, this.status, this.fallback);
    this.focusTarget = this.btn;
  }
  connected() {
    if (!O.webauthn.isSupported()) this._setState('unsupported');
  }
  update() {
    this.btn.querySelector('.o-biometric-text').textContent = this.label || this.t('biometric.label');
    if (this.fallbackHref) { this.fallback.href = this.fallbackHref; this.fallback.textContent = this.fallbackText || this.t('biometric.fallback'); this.fallback.hidden = false; }
    else this.fallback.hidden = true;
    this._paint();
  }
  _setState(s) { this._state = s; this.setAttribute('data-state', s); this._paint(); }
  _paint() {
    this.btn.disabled = this._state === 'waiting' || this._state === 'unsupported';
    this.btn.classList.toggle('is-loading', this._state === 'waiting');
    const msg = { waiting: this.t('biometric.waiting'), success: this.t('biometric.success'), failed: this.t('biometric.failed'), unsupported: this.t('biometric.unsupported') }[this._state] || '';
    this.status.textContent = msg;
    this.status.classList.toggle('is-error', this._state === 'failed');
    this.status.classList.toggle('is-success', this._state === 'success');
    this.btn.querySelector('.o-biometric-text').textContent = this._state === 'failed' ? this.t('biometric.retry') : (this.label || this.t('biometric.label'));
  }
  /** Run the authentication ceremony. Pass options to override the `options`/`getOptions` prop for this call. */
  async authenticate(optionsJSON) {
    if (this._state === 'waiting') return;
    if (!O.webauthn.isSupported()) { this._setState('unsupported'); return; }
    let opts = optionsJSON || this.options;
    try {
      if (!opts && isFn(this.getOptions)) opts = await this.getOptions();
      if (!opts) throw new Error('No WebAuthn request options were provided (set `options` or `getOptions`)');
      this._setState('waiting');
      const credential = await O.webauthn.authenticate(opts);
      this._setState('success');
      announce(this.t('biometric.success'));
      this.emit('success', { credential });
    } catch (err) {
      this._setState('failed');
      this.emit('error', { error: err });
    }
  }
  trigger() { return this.authenticate(); }
  reset() { this._setState(O.webauthn.isSupported() ? 'idle' : 'unsupported'); }
}
define('o-biometric-login', OBiometricLogin);
O.BiometricLogin = OBiometricLogin;
