/* legacy-biometric.js — salvaged from .tmp/eval-bio2.js (docs/components/biometric.html).
 * <o-biometric-login>: mocked navigator.credentials.get() success (data-state transitions, credential
 * shape), a rejected/cancelled authenticator (failed state + o-error), and the unsupported-browser reset.
 * Kept over .tmp/eval-bio.js (dropped — that script clicked the host element itself, but the component's
 * click handler is bound to the inner .o-biometric-btn, so el.click() never actually triggered the flow).
 *
 * FIX vs the original script: `_setState('waiting')` happens inside trigger()'s async body, past its
 * first await, so it is not yet set in the same synchronous tick as btn.click() — reading data-state
 * immediately after click() is a race, not a meaningful assertion either way. Kept as a diagnostic field
 * but dropped from `ok` (the state DOES reach 'success'/'failed'/'unsupported' correctly, which is what's
 * actually asserted).
 */
(async () => {
  const el = document.getElementById('demo-bio');
  const btn = el.querySelector('.o-biometric-btn');
  const results = {};
  results.initialSupported = Orion.webauthn.isSupported();

  navigator.credentials.get = async () => ({
    id: 'cred1', rawId: new Uint8Array([1, 2, 3]).buffer, type: 'public-key',
    response: { clientDataJSON: new TextEncoder().encode('{"type":"webauthn.get"}').buffer, authenticatorData: new Uint8Array(37).buffer, signature: new Uint8Array(8).buffer, userHandle: null },
    getClientExtensionResults: () => ({}),
  });
  let successCred = null;
  el.addEventListener('o-success', e => { successCred = e.detail.credential; }, { once: true });
  btn.click();
  results.stateRightAfterClick = el.getAttribute('data-state');
  await new Promise(r => setTimeout(r, 200));
  results.stateAfterSuccess = el.getAttribute('data-state');
  results.credentialId = successCred && successCred.id;
  results.credentialRawIdIsString = !!(successCred && typeof successCred.rawId === 'string');

  navigator.credentials.get = async () => { throw new DOMException('cancelled', 'NotAllowedError'); };
  let errMsg = null;
  el.addEventListener('o-error', e => { errMsg = e.detail.error.message; }, { once: true });
  btn.click();
  await new Promise(r => setTimeout(r, 200));
  results.stateAfterFail = el.getAttribute('data-state');
  results.errMsg = errMsg;

  const original = window.PublicKeyCredential;
  delete window.PublicKeyCredential;
  el.reset();
  results.stateWhenUnsupported = el.getAttribute('data-state');
  window.PublicKeyCredential = original;

  const ok = results.initialSupported === true
    && results.stateAfterSuccess === 'success' && results.credentialId === 'cred1' && results.credentialRawIdIsString
    && results.stateAfterFail === 'failed' && !!results.errMsg
    && results.stateWhenUnsupported === 'unsupported';
  return { ok, ...results };
})()
