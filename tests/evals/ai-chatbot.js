/* ai-chatbot.js — <o-chatbot>: launcher opens/closes, Enter sends and streams a reply, a suggested-prompt chip
 * sends its prompt, thumbs-up fires o-feedback, Esc closes the window, and exportTranscript() returns the
 * conversation (and fires o-export). Runs against the page's own #cb1 (launcher) and #cb2 (inline) demos.
 * Mock provider only.
 *   node build/check.mjs docs/components/chatbot.html --bundle=.tmp/ai/orion.js "--eval=@tests/evals/ai-chatbot.js"
 */
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  Orion.ai.configure({ provider: Orion.ai.mock({ latency: 15, speed: 4 }) });

  const cb = document.getElementById('cb1');
  if (!cb) return { ok: false, error: 'no #cb1 on the page' };
  const events = [];
  ['o-message', 'o-response', 'o-feedback', 'o-export'].forEach(evt => cb.addEventListener(evt, e => events.push({ evt, detail: e.detail })));

  /* open / close via the public API (same code path the launcher button uses) */
  cb.open();
  await sleep(30);
  const openedViaOpen = cb.isOpen === true && cb.classList.contains('is-open');
  cb.close();
  await sleep(30);
  const closedViaClose = cb.isOpen === false;

  /* launcher click opens it */
  cb.querySelector('.o-chatbot-launcher').click();
  await sleep(30);
  const openedViaLauncher = cb.isOpen === true;

  /* suggested prompt click sends its prompt and streams a reply (there is already a welcome bubble, so
     count assistant/user replies relative to their counts right before each action, not by absolute index) */
  const userMsgs = () => cb.querySelectorAll('.o-chat-msg.is-user');
  const assistantReplies = () => cb.querySelectorAll('.o-chat-msg.is-assistant');
  const chip = cb.querySelector('.o-chatbot-chip');
  const chipPrompt = chip && chip.textContent;
  const usersBeforeChip = userMsgs().length, assistantsBeforeChip = assistantReplies().length;
  chip && chip.click();
  await sleep(700);
  const chipSent = !!chip && userMsgs().length === usersBeforeChip + 1 && userMsgs()[userMsgs().length - 1].textContent.includes(chipPrompt);
  const chipStreamed = assistantReplies().length === assistantsBeforeChip + 1 && assistantReplies()[assistantReplies().length - 1].textContent.trim().length > 0;

  /* Enter sends from the composer, and the reply streams in */
  const input = cb.querySelector('.o-chatbot-input');
  const usersBeforeEnter = userMsgs().length, assistantsBeforeEnter = assistantReplies().length;
  input.value = 'What can you help me with?';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await sleep(700);
  const sentViaEnter = userMsgs().length === usersBeforeEnter + 1 && input.value === '';
  const streamed = assistantReplies().length === assistantsBeforeEnter + 1 && assistantReplies()[assistantReplies().length - 1].textContent.trim().length > 0;
  const gotMessageEvent = events.some(e => e.evt === 'o-message');
  const gotResponseEvent = events.some(e => e.evt === 'o-response' && e.detail.aborted === false);

  /* thumbs-up on the last assistant bubble fires o-feedback (re-query after click: _finishBubble rebuilds the action buttons) */
  const lastBubble = assistantReplies()[assistantReplies().length - 1];
  lastBubble.querySelector('.o-chat-action-up').click();
  await sleep(30);
  const gotFeedback = events.some(e => e.evt === 'o-feedback' && e.detail.rating === 'up');
  const thumbActive = lastBubble.querySelector('.o-chat-action-up').classList.contains('is-active');

  /* Esc closes the window (when it's a launcher) */
  cb.querySelector('.o-chatbot-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await sleep(30);
  const closedViaEscape = cb.isOpen === false;

  /* exportTranscript() returns the conversation and fires o-export, without downloading */
  const md = cb.exportTranscript({ download: false });
  const exportHasBothMessages = md.includes(chipPrompt) && md.includes('What can you help me');
  const gotExportEvent = events.some(e => e.evt === 'o-export' && e.detail.format === 'markdown');

  /* --- keyboard navigation on the inline chatbot (#cb2): focus, type, Enter, stream, Esc stops --- */
  const cb2 = document.getElementById('cb2');
  let keyboardOk = false;
  if (cb2) {
    const in2 = cb2.querySelector('.o-chatbot-input');
    in2.focus();
    const focusedComposer = document.activeElement === in2;
    in2.value = 'Tell me a long story about Orion Admin so I can stop it';
    in2.dispatchEvent(new Event('input', { bubbles: true }));
    in2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await sleep(40); // let streaming begin, then stop it mid-flight with Esc
    in2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await sleep(150);
    const stoppedRow = cb2.querySelector('.o-chat-msg.is-assistant.is-aborted');
    keyboardOk = focusedComposer && !!stoppedRow;
  }

  const ok = openedViaOpen && closedViaClose && openedViaLauncher && chipSent && chipStreamed
    && sentViaEnter && streamed && gotMessageEvent && gotResponseEvent
    && gotFeedback && thumbActive && closedViaEscape
    && exportHasBothMessages && gotExportEvent && keyboardOk;
  return {
    ok, openedViaOpen, closedViaClose, openedViaLauncher, chipSent, chipStreamed,
    sentViaEnter, streamed, gotMessageEvent, gotResponseEvent, gotFeedback, thumbActive, closedViaEscape,
    exportHasBothMessages, gotExportEvent, keyboardOk, eventCount: events.length,
  };
})()
