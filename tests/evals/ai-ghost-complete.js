/* ai-ghost-complete.js — data-o-ai-complete: a suggestion appears after typing pauses (caret at the end),
 * Tab accepts it into the field, and Escape dismisses a (fresh) suggestion. Mock provider only.
 *   node build/check.mjs docs/components/ai-tools.html --bundle=.tmp/ai/orion.js "--eval=@tests/evals/ai-ghost-complete.js"
 */
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  Orion.ai.configure({ provider: Orion.ai.mock({ latency: 15, speed: 4 }) });

  const ta = document.getElementById('complete-ta');
  if (!ta) return { ok: false, error: 'no #complete-ta on the page' };
  ta.focus();

  // 1) appears after typing + a pause, caret at the end
  ta.value = 'I appreciate your patience while we look into this';
  ta.setSelectionRange(ta.value.length, ta.value.length);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(600);
  const ghost = document.querySelector('.o-ai-complete-ghost');
  const restEl = ghost && ghost.querySelector('.o-ai-complete-rest');
  const appeared = !!ghost && ghost.hidden === false && !!restEl && restEl.textContent.trim().length > 0;
  const suggestion = appeared ? restEl.textContent : '';
  const beforeAccept = ta.value;

  // 2) Tab accepts it into the field and hides the ghost
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  await sleep(30);
  const accepted = ta.value === beforeAccept + suggestion;
  const hiddenAfterAccept = ghost.hidden === true;

  // 3) Escape dismisses a freshly-appeared suggestion (without touching the field's value)
  ta.value = ta.value + '. An update is coming shortly';
  ta.setSelectionRange(ta.value.length, ta.value.length);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(600);
  const secondAppeared = ghost.hidden === false && restEl.textContent.trim().length > 0;
  const beforeEscape = ta.value;
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await sleep(30);
  const dismissed = ghost.hidden === true && restEl.textContent === '' && ta.value === beforeEscape;

  const ok = appeared && accepted && hiddenAfterAccept && secondAppeared && dismissed;
  return { ok, appeared, suggestionLength: suggestion.length, accepted, hiddenAfterAccept, secondAppeared, dismissed };
})()
