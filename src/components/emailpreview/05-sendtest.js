/* Email preview — "send test" address prompt.
 * Uses Orion.prompt() when the (separately developed) dialogs component happens to be in the same bundle;
 * otherwise falls back to a tiny floating input anchored to the trigger button, built directly on the core
 * overlay stack (autoPlace + overlays.open), exactly like any other floating panel in Orion Admin. */
function epAskTestEmail(anchor, defaultTo) {
  if (isFn(O.prompt)) {
    return O.prompt({
      title: t('emailpreview.sendTest'), label: t('emailpreview.sendTestLabel'), value: defaultTo || '',
      inputType: 'email', placeholder: 'name@example.com', okText: t('emailpreview.send'), cancelText: t('emailpreview.cancel'),
    });
  }
  if (!isBrowser) return Promise.resolve(null);
  return new Promise(resolve => {
    let settled = false;
    const settle = v => { if (settled) return; settled = true; resolve(v); };
    const inputId = uid('ep-to');
    const input = h('input', { type: 'email', class: 'o-input o-input-sm', id: inputId, placeholder: 'name@example.com', 'aria-label': t('emailpreview.sendTestLabel') });
    input.value = defaultTo || '';
    const cancelBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm' }, t('emailpreview.cancel'));
    const okBtn = h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm' }, t('emailpreview.send'));
    const panel = h('div', { class: 'o-ep-sendtest o-floating', role: 'dialog', 'aria-label': t('emailpreview.sendTest'), tabindex: '-1' },
      h('div', { class: 'o-ep-sendtest-body' },
        h('label', { class: 'o-label', for: inputId }, t('emailpreview.sendTestLabel')),
        input),
      h('div', { class: 'o-ep-sendtest-actions' }, cancelBtn, okBtn));
    portal(panel, anchor);
    const finish = v => { settle(v); ov.close('api'); };
    const ov = overlays.open({
      el: panel, owner: anchor, trap: true,
      onClose: () => { unplace(); panel.remove(); settle(null); },
    });
    const unplace = autoPlace(panel, anchor, { placement: 'bottom-end', offset: 6 });
    on(okBtn, 'click', () => finish(input.value.trim() || null));
    on(cancelBtn, 'click', () => finish(null));
    on(input, 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(input.value.trim() || null); } });
    animate(panel, 'zoomIn', { duration: 120 });
    requestAnimationFrame(() => { try { input.focus(); } catch {} });
  });
}
