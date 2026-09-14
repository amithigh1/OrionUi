/* legacy-2fa-setup-wizard.js — salvaged from .tmp/eval-2fa.js (docs/components/two-factor.html).
 * The <o-2fa-setup> wizard flow: step transitions, real TOTP code verification, backup-codes format,
 * Finish gated on the "I've saved my codes" checkbox, o-done payload, and wrong-code rejection.
 * Complements the existing docs-gaps-twofa.js (which only exercises Orion.twofa.generateBackupCodes()).
 *
 * FIX vs the original script: it filled `.o-2fa-code-input, [name=code]` and called requestSubmit(). That
 * selector only exists in the no-JS fallback path (src/components/auth/30-2fa-setup.js renderVerify()):
 * whenever `<o-otp>` is registered — true on this full-bundle page — the verify step renders `<o-otp>`
 * instead, which has no such input/name and submits via its own `o-complete { value }` event wired to
 * `submitCode()`, not a form submit button. Setting `<o-otp>.value` alone doesn't fire `o-complete` either
 * (that only happens from real per-box typing). This version enters the code by dispatching `o-complete`
 * directly on the <o-otp> (falling back to the plain input if present), which reaches the same
 * `submitCode()` call a real completed entry would. Likewise, submitCode()'s failure path (line ~235)
 * reports the error via `otpEl.setError(message)` when <o-otp> is present, not the shared
 * `.o-2fa-verify-msg` (that element is only used by the no-JS fallback) — reads the OTP's own message.
 */
(async () => {
  const el = document.getElementById('demo-2fa-setup');
  const results = { initialStep: el._step, secretLen: el.secret.length };

  const enterCode = async (code) => {
    const otp = el.querySelector('o-otp');
    if (otp) { otp.value = code; otp.dispatchEvent(new CustomEvent('o-complete', { detail: { value: code }, bubbles: true })); }
    else { el.querySelector('.o-2fa-code-input, [name=code]').value = code; el.querySelector('form[data-2fa-verify]').requestSubmit(); }
    await new Promise(r => setTimeout(r, 200));
  };

  el.querySelector('[data-2fa-next]').click();
  await new Promise(r => setTimeout(r, 150));
  results.stepAfterContinue = el._step;
  const code = await Orion.totp.generate(el.secret, { digits: el.digits, period: el.period });
  await enterCode(code);
  results.stepAfterVerify = el._step;
  results.backupCodesCount = el.backupCodes().length;
  results.backupCodeFormatOk = /^[0-9A-F]{5}-[0-9A-F]{5}$/.test(el.backupCodes()[0]);
  const finishBtn = el.querySelector('[data-2fa-finish]');
  results.finishDisabledBefore = finishBtn.disabled;
  el.querySelector('[data-2fa-saved]').click();
  await new Promise(r => setTimeout(r, 30));
  results.finishDisabledAfterCheck = finishBtn.disabled;
  let doneDetail = null;
  el.addEventListener('o-done', e => { doneDetail = e.detail; }, { once: true });
  finishBtn.click();
  await new Promise(r => setTimeout(r, 50));
  results.stepAfterFinish = el._step;
  results.doneBackupCount = doneDetail && doneDetail.backupCodes.length;

  el.reset();
  await new Promise(r => setTimeout(r, 150));
  el.querySelector('[data-2fa-next]').click();
  await new Promise(r => setTimeout(r, 150));
  await enterCode('000000');
  results.stepStillVerifyOnWrongCode = el._step;
  const otpAfterWrong = el.querySelector('o-otp');
  results.errorMsgShown = otpAfterWrong ? (otpAfterWrong.invalid ? otpAfterWrong.querySelector('.o-otp-msg')?.textContent : '') : el.querySelector('.o-2fa-verify-msg').textContent;

  const ok = results.stepAfterContinue !== results.initialStep
    && results.stepAfterVerify !== results.stepAfterContinue
    && results.backupCodesCount === 10 && results.backupCodeFormatOk
    && results.finishDisabledBefore === true && results.finishDisabledAfterCheck === false
    && results.stepAfterFinish !== results.stepAfterVerify
    && results.doneBackupCount === 10
    && results.stepStillVerifyOnWrongCode === results.stepAfterContinue
    && !!results.errorMsgShown;
  return { ok, ...results };
})()
