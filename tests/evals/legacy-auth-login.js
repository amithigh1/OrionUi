/* legacy-auth-login.js — salvaged from .tmp/eval-login.js (docs/components/auth.html).
 * <o-auth-form type="login">: empty submit shows both required errors, a rejected onSubmit ({field,message})
 * marks just that field invalid without a page-level alert, and a successful submit fires o-success and
 * clears the earlier field error.
 */
(async () => {
  const el = document.getElementById('demo-login');
  const emailInput = el.querySelector('[name=email]');
  const pwInput = el.querySelector('[name=password]');
  const emailBox = el.querySelector('[data-field=email]');
  const pwBox = el.querySelector('[data-field=password]');

  await el.submit();
  const emptyState = {
    emailInvalid: emailBox.classList.contains('is-invalid'),
    pwInvalid: pwBox.classList.contains('is-invalid'),
    emailAriaInvalid: emailInput.getAttribute('aria-invalid'),
    emailErrorText: emailBox.querySelector('.o-error').textContent,
  };

  emailInput.value = 'wrong@example.com'; emailInput.dispatchEvent(new Event('input', { bubbles: true }));
  pwInput.value = 'whatever1'; pwInput.dispatchEvent(new Event('input', { bubbles: true }));
  await el.submit();
  await new Promise(r => setTimeout(r, 850));
  const wrongState = { pwInvalid: pwBox.classList.contains('is-invalid'), pwError: pwBox.querySelector('.o-error').textContent, alertHidden: el.querySelector('.o-auth-alert').hidden };

  let payload = null;
  el.addEventListener('o-success', e => { payload = e.detail; }, { once: true });
  emailInput.value = 'demo@orion.dev'; emailInput.dispatchEvent(new Event('input', { bubbles: true }));
  pwInput.value = 'password123'; pwInput.dispatchEvent(new Event('input', { bubbles: true }));
  await el.submit();
  await new Promise(r => setTimeout(r, 850));
  const pwStillInvalidAfterSuccess = pwBox.classList.contains('is-invalid');

  const ok = emptyState.emailInvalid && emptyState.pwInvalid && emptyState.emailAriaInvalid === 'true' && !!emptyState.emailErrorText
    && wrongState.pwInvalid && !!wrongState.pwError && wrongState.alertHidden
    && !!payload && !pwStillInvalidAfterSuccess;
  return { ok, emptyState, wrongState, successPayload: payload, pwStillInvalidAfterSuccess };
})()
