/* ============================================================================
 * data-o-ai-complete — inline "ghost text" autocomplete for a text <input>, <textarea>
 * or [contenteditable]. Works on the developer's own field: no wrapper markup needed.
 *
 *   <textarea data-o-ai-complete="a support ticket reply"
 *             data-o-ai-complete-min-chars="12"      (default 8 — wait for this many typed characters)
 *             data-o-ai-complete-delay="450"         (default 450ms debounce after typing stops)
 *             data-o-ai-complete-max="160"></textarea>
 *
 * The attribute's own value (if any) is a short free-text hint about what is being written, folded
 * into the system prompt ("Context: a support ticket reply."). A suggestion only appears once the
 * caret is at the very end of the field's text and typing has paused; further typing or Escape
 * dismisses it, Tab (or →/End at the end of the field) accepts it into the field.
 *
 * Needs the "ai" component (Orion.ai) — logs once and no-ops per field if it is not in the build.
 * ========================================================================== */
i18n.add('en', { aiComplete: { hint: 'AI suggestion — Tab to accept, Esc to dismiss' } });

function __aiCompleteSystem(hint) {
  return 'You write short inline autocomplete suggestions that continue the given text naturally, '
    + 'like predictive text. Reply with ONLY the continuation — never repeat any of the given text, '
    + 'never add quotes, labels, or explanation. Stop at a natural point (end of a clause or short '
    + 'sentence) and keep it under 15 words. If the text already looks complete, reply with nothing.'
    + (hint ? ` Context: this is ${hint}.` : '');
}

behavior('data-o-ai-complete', (el, hint) => {
  if (!isEditableField(el)) return undefined;
  if (!O.ai) { console.error('[Orion] data-o-ai-complete requires the "ai" component (Orion.ai) — include it in your build.'); return undefined; }

  const isMultiline = el.tagName === 'TEXTAREA' || el.isContentEditable;
  const minChars = +el.dataset.aiCompleteMinChars || 8;
  const delay = +el.dataset.aiCompleteDelay || 450;
  const maxLen = +el.dataset.aiCompleteMax || 160;
  const ghostId = uid('ai-ghost');

  const typedEl = h('span', { class: 'o-ai-complete-typed' });
  const restEl = h('span', { class: 'o-ai-complete-rest' });
  const ghost = h('div', { class: 'o-ai-complete-ghost', id: ghostId, 'aria-hidden': 'true' }, typedEl, restEl);
  ghost.hidden = true;
  portal(ghost, el);
  const hintEl = h('span', { class: 'o-sr-only', id: uid('ai-hint') });
  el.after(hintEl);

  let suggestion = '';
  let controller = null;
  let seq = 0;

  function reposition() {
    syncOverlayToField(el, ghost, { wrap: isMultiline });
    ghost.scrollTop = el.scrollTop; ghost.scrollLeft = el.scrollLeft;
  }
  function hide() {
    controller?.abort(); controller = null;
    if (!suggestion && ghost.hidden) return;
    suggestion = ''; ghost.hidden = true; restEl.textContent = ''; hintEl.textContent = '';
    if (el.getAttribute('aria-describedby') === hintEl.id) el.removeAttribute('aria-describedby');
  }
  function show(text) {
    suggestion = text;
    typedEl.textContent = fieldValue(el);
    restEl.textContent = text;
    reposition();
    ghost.hidden = false;
    hintEl.textContent = t('aiComplete.hint');
    el.setAttribute('aria-describedby', hintEl.id);
  }
  async function request() {
    if (el !== doc.activeElement) return;
    const value = fieldValue(el);
    if (value.trim().length < minChars || !caretAtEnd(el)) return;
    controller?.abort();
    const ctl = controller = new AbortController();
    const mySeq = ++seq;
    let text;
    try {
      text = await O.ai.chat([{ role: 'user', content: aitTruncate(value, 4000) }], {
        system: __aiCompleteSystem(hint), signal: ctl.signal, retries: 0,
      });
    } catch { return; }
    if (mySeq !== seq || ctl.signal.aborted || el !== doc.activeElement || !caretAtEnd(el) || fieldValue(el) !== value) return;
    text = String(text || '').replace(/^[\s"'`]+|[\s"'`]+$/g, '');
    if (text.length > maxLen) text = text.slice(0, maxLen);
    if (!text) { hide(); return; }
    show(text);
  }
  const debounced = debounce(request, delay);

  const offInput = on(el, 'input', () => { hide(); debounced(); });
  const offKey = on(el, 'keydown', e => {
    if (!suggestion) return;
    if (e.key === 'Tab' || ((e.key === 'ArrowRight' || e.key === 'End') && caretAtEnd(el))) {
      e.preventDefault();
      const accepted = suggestion;
      setFieldValue(el, fieldValue(el) + accepted);
      hide();
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(); }
  });
  const offBlur = on(el, 'blur', hide);
  const offScroll = on(el, 'scroll', reposition);
  const offResize = observeResize(el, () => !ghost.hidden && reposition());
  const offWinResize = on(win, 'resize', () => !ghost.hidden && reposition());

  return () => {
    debounced.cancel();
    controller?.abort();
    offInput(); offKey(); offBlur(); offScroll(); offResize(); offWinResize();
    ghost.remove(); hintEl.remove();
  };
});
