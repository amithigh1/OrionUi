// @deps modal
/* Dialogs — Promise-based alert / confirm / prompt on top of Orion.modal, plus the data-o-confirm behavior.
 *   await Orion.alert('Saved')                                         → undefined
 *   await Orion.confirm({ title, text, type, danger, requireText, checkbox })  → boolean | { confirmed, checked }
 *   await Orion.prompt({ title, label, value, validate: v => error|null })     → string | null
 *   <a href="/delete/5" data-o-confirm="Delete this user?" data-o-confirm-type="danger" data-o-confirm-text="Delete">
 */
i18n.add('en', {
  dialogs: {
    ok: 'OK', cancel: 'Cancel', confirm: 'Confirm', areYouSure: 'Are you sure?', typeToConfirm: 'Type {text} to confirm',
    info: 'Information', success: 'Success', warning: 'Warning', danger: 'Error', question: 'Confirmation',
  },
});

const DLG_ICONS = { info: 'info', success: 'check-circle', warning: 'alert-triangle', danger: 'alert-circle', question: 'help-circle' };
const DLG_COLORS = { info: 'info', success: 'success', warning: 'warning', danger: 'danger', question: 'primary' };
const dlgType = (v, fallback) => (v === 'error' ? 'danger' : DLG_ICONS[v] ? v : fallback);

/** Build the body (icon badge + title + text + extra nodes) and open a small modal. */
function dlgOpen(kind, o, extra, buttons) {
  const type = dlgType(o.type, kind === 'confirm' ? (o.danger ? 'danger' : 'question') : kind === 'prompt' ? null : 'info');
  const id = uid('dlg');
  const title = o.title || (o.html == null ? o.text : '') || '';
  const text = o.title ? o.text : null;
  const ic = o.icon === false || !type && !o.icon ? null : o.icon || DLG_ICONS[type];
  const body = h('div', { class: cls('o-dialog-layout', !ic && 'no-icon') },
    ic ? h('div', { class: cls('o-dialog-icon', 'o-c-' + (DLG_COLORS[type] || 'primary')), 'aria-hidden': 'true' }, icon(ic)) : null,
    h('div', { class: 'o-dialog-main' },
      title ? h('h2', { class: 'o-dialog-title', id: id + '-t' }, title) : null,
      o.html != null ? h('div', { class: 'o-dialog-text', id: id + '-d', html: sanitize(o.html) }) : text ? h('div', { class: 'o-dialog-text', id: id + '-d' }, text) : null,
      extra));
  return O.modal._mount('o-modal', {
    content: body, buttons, closable: o.closable !== false, backdrop: o.backdrop ?? true, texts: o.texts, trigger: o.trigger,
    className: cls('o-dialog', 'o-dialog-' + kind, type && 'o-dialog-' + type, o.className), label: title ? null : t('dialogs.' + (type || 'question')),
  }, el => {
    el.size = o.size || 'sm';
    el.centered = o.centered ?? false;
    el.addEventListener('o-open', e => {
      if (e.target !== el) return;
      const d = el.dialog;
      if (kind !== 'prompt') d.setAttribute('role', 'alertdialog');
      if (title) { d.setAttribute('aria-labelledby', id + '-t'); d.removeAttribute('aria-label'); }
      if (text || o.html != null) d.setAttribute('aria-describedby', id + '-d');
    }, { once: true });
  });
}

/** Orion.alert(text | { title, text, html, type, okText }) → Promise<void> */
O.alert = function (input) {
  const o = isStr(input) ? { text: input } : { ...(input || {}) };
  const handle = dlgOpen('alert', o, null, [{ text: o.okText || t('dialogs.ok'), variant: 'primary', autofocus: true, value: true }]);
  const p = handle.result.then(() => undefined);
  p.modal = handle;
  return p;
};

/** Orion.confirm(text | { title, text, html, type, confirmText, cancelText, danger, requireText, icon, checkbox }) → Promise<boolean | { confirmed, checked }> */
O.confirm = function (input) {
  const o = isStr(input) ? { text: input } : { ...(input || {}) };
  const danger = !!o.danger || o.type === 'danger' || o.type === 'error';
  const extra = [];
  let input$ = null, check$ = null;
  if (o.requireText) {
    const fid = uid('dlg-req');
    input$ = h('input', { class: 'o-input', id: fid, type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'data-autofocus': true });
    const hint = h('label', { class: 'o-label', for: fid });
    const parts = t('dialogs.typeToConfirm').split('{text}');
    hint.append(parts[0], h('strong', { class: 'o-dialog-require' }, o.requireText), parts[1] || '');
    extra.push(h('div', { class: 'o-dialog-field' }, hint, input$));
  }
  if (o.checkbox) {
    check$ = h('input', { type: 'checkbox', checked: !!o.checked });
    extra.push(h('label', { class: 'o-check o-dialog-check' }, check$, h('span', null, o.checkbox === true ? '' : o.checkbox)));
  }
  const handle = dlgOpen('confirm', { ...o, danger }, extra.length ? extra : null, [
    { text: o.cancelText || t('dialogs.cancel'), value: false, autofocus: danger && !o.requireText, className: 'o-dialog-cancel' },
    { text: o.confirmText || t('dialogs.confirm'), variant: danger ? 'danger' : 'primary', value: true, autofocus: !danger && !o.requireText, className: 'o-dialog-ok', disabled: !!o.requireText },
  ]);
  if (input$) {
    const ok = () => handle.footer.querySelector('.o-dialog-ok');
    on(input$, 'input', () => { const b = ok(); if (b) b.disabled = input$.value.trim() !== String(o.requireText); });
    on(input$, 'keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const b = ok(); if (b && !b.disabled) b.click(); } });
  }
  const p = handle.result.then(v => (check$ ? { confirmed: v === true, checked: check$.checked } : v === true));
  p.modal = handle;
  return p;
};

/** Orion.prompt(text | { title, text, label, value, placeholder, inputType, multiline, rows, validate, required, okText, cancelText }) → Promise<string | null> */
O.prompt = function (input) {
  const o = isStr(input) ? { title: input } : { ...(input || {}) };
  const fid = uid('dlg-in'), eid = fid + '-err';
  const field = o.multiline
    ? h('textarea', { class: 'o-input o-textarea', id: fid, rows: o.rows || 4, placeholder: o.placeholder || null, 'data-autofocus': true })
    : h('input', { class: 'o-input', id: fid, type: o.inputType || 'text', placeholder: o.placeholder || null, autocomplete: 'off', 'data-autofocus': true });
  field.value = o.value ?? '';
  if (o.required) field.setAttribute('aria-required', 'true');
  if (!o.label) field.setAttribute('aria-label', o.title || o.text || t('dialogs.question'));
  const err = h('div', { class: 'o-error', id: eid, role: 'alert' });
  const wrap = h('div', { class: 'o-dialog-field' }, o.label ? h('label', { class: cls('o-label', o.required && 'is-required'), for: fid }, o.label) : null, field, err);
  const setError = msg => {
    err.textContent = msg || '';
    err.classList.toggle('is-visible', !!msg);
    field.classList.toggle('is-invalid', !!msg);
    if (msg) { field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-describedby', eid); } else { field.removeAttribute('aria-invalid'); field.removeAttribute('aria-describedby'); }
  };
  on(field, 'input', () => { if (field.classList.contains('is-invalid')) setError(null); });
  const handle = dlgOpen('prompt', { ...o, type: o.type || null }, wrap, [
    { text: o.cancelText || t('dialogs.cancel'), value: null, className: 'o-dialog-cancel' },
    {
      text: o.okText || t('dialogs.ok'), variant: 'primary', className: 'o-dialog-ok',
      onClick: async () => {
        const v = field.value;
        let msg = o.required && !String(v).trim() ? t('validation.required') : null;
        if (!msg && isFn(o.validate)) { try { msg = await o.validate(v); } catch (e) { msg = (e && e.message) || t('validation.invalid'); } }
        if (msg) { setError(String(msg)); field.focus(); return false; }
        return { __v: v };
      },
    },
  ]);
  on(field, 'keydown', e => {
    if (e.key !== 'Enter' || e.isComposing || (o.multiline && !(e.ctrlKey || e.metaKey))) return;
    e.preventDefault();
    handle.footer.querySelector('.o-dialog-ok')?.click();
  });
  const p = handle.result.then(v => (v && isObj(v) && '__v' in v ? v.__v : null));
  p.modal = handle;
  return p;
};

/* data-o-confirm on links / buttons / forms: intercept until confirmed, then continue (navigate, re-click or submit). */
behavior('data-o-confirm', el => {
  const isForm = el.tagName === 'FORM';
  const handler = e => {
    if (el.__oConfirmPass) { el.__oConfirmPass = false; return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (el.__oConfirmBusy) return;
    el.__oConfirmBusy = true;
    const submitter = isForm ? e.submitter : null;
    const type = el.getAttribute('data-o-confirm-type') || undefined;
    O.confirm({
      text: el.getAttribute('data-o-confirm') || t('dialogs.areYouSure'), title: el.getAttribute('data-o-confirm-title') || undefined,
      type, danger: type === 'danger', confirmText: el.getAttribute('data-o-confirm-text') || undefined, trigger: isForm ? submitter || el : el,
    }).then(ok => {
      el.__oConfirmBusy = false;
      if (!ok || !el.isConnected) return;
      el.__oConfirmPass = true;
      try {
        if (isForm) el.requestSubmit(submitter && submitter.form === el ? submitter : undefined);
        else el.click();
      } finally { setTimeout(() => { el.__oConfirmPass = false; }); }
    });
  };
  const evt = isForm ? 'submit' : 'click';
  el.addEventListener(evt, handler, true);
  return () => el.removeEventListener(evt, handler, true);
});
