/* ============================================================================
 * data-o-ai-suggest — "improve with AI" floating toolbar for a text <input>, <textarea>
 * or [contenteditable]: a small trigger button appears while the field is focused and has
 * text; it opens a menu of tone/rewrite presets (or a custom instruction / target language),
 * shows a word-diff preview of the AI's rewrite, and only replaces the field's value when the
 * user clicks Accept (Retry re-runs the same instruction, Discard closes without changes).
 *
 *   <textarea data-o-ai-suggest></textarea>
 *
 * Operates on the field's whole value (not a partial selection) — for selection-aware rewrite
 * inside a larger document use <o-assistant>'s "Replace selection" instead.
 * Needs the "ai" component (Orion.ai) — logs once and no-ops per field if it is not in the build.
 * ========================================================================== */
const __AI_SUGGEST_PRESETS = [
  { id: 'improve', label: 'aiSuggest.improve', instruction: 'Improve clarity, grammar and flow while preserving the original meaning and tone.' },
  { id: 'fix', label: 'aiSuggest.fix', instruction: 'Fix grammar and spelling only. Keep the meaning, tone and length as close to the original as possible.' },
  { id: 'shorten', label: 'aiSuggest.shorten', instruction: 'Shorten this text significantly while preserving the key meaning.' },
  { id: 'expand', label: 'aiSuggest.expand', instruction: 'Expand this text with more helpful detail while preserving the original meaning and tone.' },
  { id: 'formal', label: 'aiSuggest.formal', instruction: 'Rewrite this in a more formal, professional tone.' },
  { id: 'friendly', label: 'aiSuggest.friendly', instruction: 'Rewrite this in a warmer, friendlier, more casual tone.' },
];

behavior('data-o-ai-suggest', (el) => {
  if (!isEditableField(el)) return undefined;
  if (!O.ai) { console.error('[Orion] data-o-ai-suggest requires the "ai" component (Orion.ai) — include it in your build.'); return undefined; }

  const trigger = h('button', { type: 'button', class: 'o-ai-suggest-trigger', hidden: true, 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': t('aiSuggest.trigger'), title: t('aiSuggest.trigger') }, iconEl('sparkles'));
  portal(trigger, el);

  let panel = null, unplacePanel = null, ov = null, controller = null;
  let last = null; // { instruction, translateTo, label, original }
  let lastResult = '';

  function positionTrigger() { if (!trigger.hidden) place(trigger, el, { placement: 'top-end', offset: 4 }); }
  function updateTrigger() {
    const focused = el === doc.activeElement || (panel && panel.contains(doc.activeElement));
    const show = (focused || !!panel) && fieldValue(el).trim().length > 0;
    trigger.hidden = !show;
    if (show) positionTrigger();
  }

  function closePanel(reason) { ov?.close(reason); }
  function openPanel() {
    if (panel) return;
    panel = h('div', { class: 'o-ai-suggest-panel o-floating', role: 'dialog', 'aria-label': t('aiSuggest.trigger'), tabindex: '-1' });
    portal(panel, el);
    renderMenu();
    unplacePanel = autoPlace(panel, el, { placement: 'bottom-end', offset: 6, flip: true, shift: true });
    ov = overlays.open({
      el: panel, owner: el,
      onClose: () => {
        controller?.abort(); controller = null;
        unplacePanel?.(); unplacePanel = null;
        panel.remove(); panel = null;
        trigger.setAttribute('aria-expanded', 'false');
        updateTrigger();
        try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
      },
    });
    trigger.setAttribute('aria-expanded', 'true');
    if (isFn(animate)) animate(panel, 'zoomIn', { duration: 120 });
    focusFirst(panel);
  }

  function renderMenu() {
    const items = [
      ...__AI_SUGGEST_PRESETS.map(p => h('button', { type: 'button', class: 'o-ai-suggest-item', role: 'menuitem', onClick: () => run({ instruction: p.instruction, label: t(p.label) }) }, t(p.label))),
      h('button', { type: 'button', class: 'o-ai-suggest-item', role: 'menuitem', onClick: () => renderCustom('translate') }, t('aiSuggest.translate')),
      h('button', { type: 'button', class: 'o-ai-suggest-item', role: 'menuitem', onClick: () => renderCustom('custom') }, t('aiSuggest.custom')),
    ];
    panel.replaceChildren(h('div', { class: 'o-ai-suggest-menu', role: 'menu' }, ...items));
  }
  function renderCustom(kind) {
    const isTranslate = kind === 'translate';
    const input = h('input', { type: 'text', class: 'o-input o-input-sm', placeholder: isTranslate ? 'Spanish, French, …' : t('aiSuggest.placeholder') });
    const back = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': t('common.back'), title: t('common.back') }, iconEl('arrow-left'));
    const go = h('button', { type: 'submit', class: 'o-btn o-btn-primary o-btn-sm' }, isTranslate ? t('aiSuggest.translate') : t('aiSuggest.trigger'));
    const form = h('form', { class: 'o-ai-suggest-custom', novalidate: true }, h('div', { class: 'o-ai-suggest-custom-row' }, back, input), go);
    on(form, 'submit', e => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      run(isTranslate ? { translateTo: v, label: t('aiSuggest.translate') } : { instruction: v, label: t('aiSuggest.custom') });
    });
    on(back, 'click', renderMenu);
    panel.replaceChildren(form);
    nextFrame().then(() => panel && input.focus());
  }
  function renderLoading(label) {
    panel.replaceChildren(h('div', { class: 'o-ai-suggest-result' },
      h('div', { class: 'o-ai-suggest-status' }, h('span', { class: 'o-spinner o-spinner-sm' }), h('span', {}, label ? `${label}… ${t('aiSuggest.working')}` : t('aiSuggest.working')))));
  }
  function renderError(err) {
    panel.replaceChildren(h('div', { class: 'o-ai-suggest-result' },
      h('div', { class: 'o-ai-suggest-error' }, iconEl('alert-circle'), h('span', {}, err?.message || t('ai.error'))),
      h('div', { class: 'o-ai-suggest-actions' },
        h('button', { type: 'button', class: 'o-btn o-btn-sm o-btn-soft-danger', onClick: () => last && run(last) }, t('aiSuggest.retry')),
        h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', onClick: () => closePanel('discard') }, t('aiSuggest.discard')))));
  }
  function renderDiffResult(original, result, label) {
    lastResult = result;
    panel.replaceChildren(h('div', { class: 'o-ai-suggest-result' },
      h('div', { class: 'o-ai-suggest-diff o-prose' }, renderDiff(original, result)),
      h('div', { class: 'o-ai-suggest-actions' },
        h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm', onClick: accept }, iconEl('check'), h('span', {}, t('aiSuggest.accept'))),
        h('button', { type: 'button', class: 'o-btn o-btn-sm', onClick: () => last && run(last) }, iconEl('refresh'), h('span', {}, t('aiSuggest.retry'))),
        h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', onClick: () => closePanel('discard') }, t('aiSuggest.discard')))));
  }
  async function run(opts) {
    const original = fieldValue(el);
    if (!original.trim()) return;
    last = opts;
    controller?.abort();
    controller = new AbortController();
    renderLoading(opts.label);
    let result;
    try {
      const isTranslate = !!opts.translateTo;
      const taskOptions = isTranslate ? { to: opts.translateTo } : { instruction: opts.instruction };
      const built = isTranslate ? O.ai.tasks.translate(original, taskOptions) : O.ai.tasks.rewrite(original, taskOptions);
      result = await O.ai.chat(built.messages, { system: built.system, task: isTranslate ? 'translate' : 'rewrite', options: taskOptions, signal: controller.signal });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (panel) renderError(err);
      return;
    }
    if (panel) renderDiffResult(original, String(result || ''), opts.label);
  }
  function accept() {
    setFieldValue(el, lastResult);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    closePanel('accept');
  }

  const offClick = on(trigger, 'click', () => (panel ? closePanel('toggle') : openPanel()));
  const offFocus = on(el, 'focus', updateTrigger);
  const offBlur = on(el, 'focusout', e => { if (!panel || !panel.contains(e.relatedTarget)) setTimeout(updateTrigger, 0); });
  const offInput = on(el, 'input', updateTrigger);
  const offScroll = on(el, 'scroll', positionTrigger);
  const offResize = observeResize(el, positionTrigger);
  const offWinResize = on(win, 'resize', positionTrigger);

  return () => {
    closePanel('destroy');
    offClick(); offFocus(); offBlur(); offInput(); offScroll(); offResize(); offWinResize();
    trigger.remove();
  };
});
