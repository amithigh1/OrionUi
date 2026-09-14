/* ai-textops.js — Orion.ai.summarize() returns text for both an element and a selection; .rewrite()/.translate()
 * also resolve non-empty strings. Mock provider only.
 *   node build/check.mjs docs/components/ai-tools.html --bundle=.tmp/ai/orion.js "--eval=@tests/evals/ai-textops.js"
 */
(async () => {
  Orion.ai.configure({ provider: Orion.ai.mock({ latency: 15, speed: 4 }) });

  const el = document.getElementById('article-el');
  if (!el) return { ok: false, error: 'no #article-el on the page' };

  // summarize(element)
  const fromElement = await Orion.ai.summarize(el, { format: 'bullets' });
  const elementOk = typeof fromElement === 'string' && fromElement.trim().length > 0;

  // summarize(selection text) — select the element's contents via the real Selection API
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  const selectionText = sel.toString();
  const fromSelection = await Orion.ai.summarize(selectionText, { length: 'short' });
  const selectionOk = selectionText.length > 0 && typeof fromSelection === 'string' && fromSelection.trim().length > 0;

  // rewrite() / translate()
  const rewritten = await Orion.ai.rewrite('hey team, release is late, more info soon', { instruction: 'Make this more formal.' });
  const rewriteOk = typeof rewritten === 'string' && rewritten.trim().length > 0;

  const translated = await Orion.ai.translate('Thank you for your patience.', { to: 'French' });
  const translateOk = typeof translated === 'string' && translated.trim().length > 0;

  const ok = elementOk && selectionOk && rewriteOk && translateOk;
  return { ok, elementOk, fromElement, selectionOk, selectionText, fromSelection, rewriteOk, rewritten, translateOk, translated };
})()
