/* legacy-http-ajax-forms.js — salvaged from .tmp/http-ajax-eval.js (docs/components/http.html).
 * The declarative data-o-ajax="json" form directive: success message swap and o-ajax-success detail,
 * plus 422 field-error mapping (is-invalid + aria-invalid + inline .o-error) on o-ajax-error.
 *
 * FIX vs the original script: the success-message box is opt-in via `data-o-ajax-toast` (src/components/
 * http/30-dom.js: `const msg = form.getAttribute('data-o-ajax-toast'); if (msg != null) { ... }`) — the
 * original form never set that attribute, so [data-o-ajax-message] was correctly left untouched
 * (messageBoxText/Visible were always empty/false, regardless of the actual o-ajax-success payload, which
 * itself was already correct). Adds the attribute so the opt-in path is actually exercised.
 */
(async () => {
  const out = {};
  Orion.http.mock([
    { method: 'POST', url: '/api/ajax-ok', status: 201, response: req => ({ message: 'Saved ' + req.body.name }) },
    { method: 'POST', url: '/api/ajax-422', status: 422, response: () => ({ errors: { email: 'Email is invalid' } }) },
  ]);
  const form = document.createElement('form');
  form.setAttribute('data-o-ajax', 'json');
  form.setAttribute('data-o-ajax-toast', '');
  form.action = '/api/ajax-ok';
  form.method = 'post';
  form.innerHTML = '<input name="name" value="Ada"><div data-o-ajax-message hidden></div><button type="submit">Save</button>';
  document.body.appendChild(form);
  Orion.upgrade(form);
  await new Promise(r => setTimeout(r, 20));

  let successDetail = null;
  form.addEventListener('o-ajax-success', e => { successDetail = e.detail; }, { once: true });
  form.querySelector('button').click();
  await new Promise(r => setTimeout(r, 150));
  out.successDetail = successDetail;
  out.messageBoxText = form.querySelector('[data-o-ajax-message]').textContent;
  out.messageBoxVisible = !form.querySelector('[data-o-ajax-message]').hidden;

  const form2 = document.createElement('form');
  form2.setAttribute('data-o-ajax', 'json');
  form2.action = '/api/ajax-422';
  form2.method = 'post';
  form2.innerHTML = '<div class="o-field"><input name="email" value="bad" class="o-input"></div><button type="submit">Save</button>';
  document.body.appendChild(form2);
  Orion.upgrade(form2);
  await new Promise(r => setTimeout(r, 20));
  let errorDetail = null;
  form2.addEventListener('o-ajax-error', e => { errorDetail = e.detail; }, { once: true });
  form2.querySelector('button').click();
  await new Promise(r => setTimeout(r, 150));
  out.errorDetail = errorDetail && { status: errorDetail.status, errors: errorDetail.errors };
  const emailInput = form2.querySelector('[name=email]');
  out.emailInvalid = emailInput.classList.contains('is-invalid') && emailInput.getAttribute('aria-invalid') === 'true';
  out.fieldHasErrorMsg = !!form2.querySelector('.o-error');

  form.remove(); form2.remove();

  const ok = !!out.successDetail && out.messageBoxVisible && /Saved Ada/.test(out.messageBoxText)
    && !!out.errorDetail && out.errorDetail.status === 422 && out.emailInvalid && out.fieldHasErrorMsg;
  return { ok, ...out };
})()
