/* ai-suggest.js — data-o-ai-suggest: the trigger appears on focus, opens a tone menu, Accept writes the
 * rewritten text back into the field, and Discard on a later run leaves the field untouched. Mock provider only.
 *   node build/check.mjs docs/components/ai-tools.html --bundle=.tmp/ai/orion.js "--eval=@tests/evals/ai-suggest.js"
 */
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  Orion.ai.configure({ provider: Orion.ai.mock({ latency: 15, speed: 3 }) });

  const ta = document.getElementById('suggest-ta');
  if (!ta) return { ok: false, error: 'no #suggest-ta on the page' };
  ta.focus();
  ta.dispatchEvent(new Event('focus', { bubbles: true }));
  await sleep(30);
  const trigger = document.querySelector('.o-ai-suggest-trigger');
  const triggerVisible = !!trigger && trigger.hidden === false;

  trigger.click();
  await sleep(30);
  const panel = document.querySelector('.o-ai-suggest-panel');
  const menuShown = !!panel && !!panel.querySelector('.o-ai-suggest-menu');
  const items = panel ? [...panel.querySelectorAll('.o-ai-suggest-item')] : [];
  const improveBtn = items.find(b => /improve/i.test(b.textContent));

  const before = ta.value;
  improveBtn.click();
  await sleep(500);
  const diffShown = !!panel.querySelector('.o-ai-suggest-diff');
  const acceptBtn = [...panel.querySelectorAll('.o-btn')].find(b => /accept/i.test(b.textContent));
  acceptBtn.click();
  await sleep(30);
  const accepted = ta.value !== before && ta.value.length > 0;
  const panelClosedAfterAccept = !document.querySelector('.o-ai-suggest-panel');

  /* reopen, pick "Translate to…", submit, then Discard — the field must not change */
  ta.focus();
  await sleep(30);
  document.querySelector('.o-ai-suggest-trigger').click();
  await sleep(30);
  const panel2 = document.querySelector('.o-ai-suggest-panel');
  const translateBtn = [...panel2.querySelectorAll('.o-ai-suggest-item')].find(b => /translate/i.test(b.textContent));
  translateBtn.click();
  await sleep(30);
  const langInput = panel2.querySelector('.o-ai-suggest-custom input');
  const customFormShown = !!langInput;
  langInput.value = 'German';
  panel2.querySelector('.o-ai-suggest-custom').requestSubmit();
  await sleep(500);
  const beforeDiscard = ta.value;
  const discardBtn = [...panel2.querySelectorAll('.o-btn')].find(b => /discard/i.test(b.textContent));
  discardBtn.click();
  await sleep(30);
  const discardedUnchanged = ta.value === beforeDiscard && !document.querySelector('.o-ai-suggest-panel');

  const ok = triggerVisible && menuShown && diffShown && accepted && panelClosedAfterAccept && customFormShown && discardedUnchanged;
  return { ok, triggerVisible, menuShown, itemCount: items.length, diffShown, accepted, panelClosedAfterAccept, customFormShown, discardedUnchanged };
})()
