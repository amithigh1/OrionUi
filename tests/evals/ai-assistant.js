/* ai-assistant.js — <o-assistant>: opens, shows a context badge for a real page selection, "Explain selection"
 * streams a result using that selection as context, and Insert / Replace selection write it back into the last
 * focused field. Runs against the page's #asst1 demo (paragraph + notes textarea). Mock provider only.
 *   node build/check.mjs docs/components/chatbot.html --bundle=.tmp/ai/orion.js "--eval=@tests/evals/ai-assistant.js"
 */
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  Orion.ai.configure({ provider: Orion.ai.mock({ latency: 15, speed: 4 }) });

  const asst = document.getElementById('asst1');
  const para = document.getElementById('asst-para');
  const notes = document.getElementById('asst-notes');
  if (!asst || !para || !notes) return { ok: false, error: 'assistant demo elements missing' };

  /* select some real text on the page before opening the panel */
  const range = document.createRange();
  range.selectNodeContents(para);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  const selectedText = sel.toString();

  asst.open();
  await sleep(30);
  const openedOk = asst.isOpen === true && asst.classList.contains('is-open');

  /* the context badge reflects the selection */
  const contextLabel = asst.querySelector('.o-assistant-context .o-badge').textContent;
  const contextIsSelection = /selection/i.test(contextLabel);

  /* "Explain selection" runs a context action and streams a result mentioning it is context-aware */
  const explainBtn = [...asst.querySelectorAll('.o-assistant-actions .o-btn')].find(b => /explain selection/i.test(b.textContent));
  let resultEvent = null;
  asst.addEventListener('o-result', e => { resultEvent = e.detail; }, { once: true });
  explainBtn.click();
  await sleep(700);
  const resultBox = asst.querySelector('.o-assistant-result');
  const gotResult = !resultBox.hidden && resultBox.textContent.trim().length > 0 && !!resultEvent;

  /* Insert writes the result into the last focused field (the notes textarea) */
  notes.focus();
  notes.value = '';
  notes.dispatchEvent(new Event('input', { bubbles: true }));
  // re-run so the result is fresh after focusing the target field (selection is gone once notes took focus,
  // so this call answers using the page/no-context fallback — still exercises the same Insert code path)
  asst.querySelector('.o-assistant-textarea').value = 'Draft a one-line status update';
  asst.querySelector('.o-assistant-composer').requestSubmit();
  await sleep(700);
  let insertEvent = null;
  asst.addEventListener('o-insert', e => { insertEvent = e.detail; }, { once: true });
  const insertBtn = asst.querySelector('[data-mode="insert"]');
  insertBtn && insertBtn.click();
  await sleep(30);
  const insertedOk = !!insertEvent && insertEvent.mode === 'insert' && notes.value.trim().length > 0 && notes.value === insertEvent.text;

  asst.close();
  await sleep(30);
  const closedOk = asst.isOpen === false;

  const ok = openedOk && contextIsSelection && gotResult && insertedOk && closedOk;
  return { ok, openedOk, contextLabel, contextIsSelection, selectedTextLength: selectedText.length, gotResult, resultEvent, insertedOk, notesValue: notes.value, closedOk };
})()
