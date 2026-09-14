(async () => {
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const r = {};

  const chat = document.createElement('o-chat');
  chat.id = 'eval-chat';
  chat.setAttribute('layout', 'thread');
  chat.style.height = '360px';
  chat.style.width = '420px';
  document.body.append(chat);
  chat.currentUser = { id: 'me', name: 'Me' };

  const other = { id: 'ben', name: 'Ben Tan' };
  const now = Date.now();
  // 60 history messages so the thread starts windowed (default window = 40) — enough to exercise
  // the scroll-anchor path when scrolling up reveals more of the locally-held history. The oldest 20
  // are dated "yesterday" and the rest "today" so scrolling to the top reveals a NEW day divider
  // above the current one — the clearest proof that the anchor (whatever was on screen) doesn't jump.
  const history = Array.from({ length: 60 }, (_, i) => ({
    id: 'h' + i, conversationId: 'c1', author: i % 2 ? other : { id: 'me' }, text: 'Message #' + i,
    createdAt: i < 20 ? now - 30 * 36e5 - (20 - i) * 6e4 : now - (60 - i) * 6e4, status: 'read',
  }));
  chat.setConversations([{ id: 'c1', title: 'Ben Tan', unread: 2, members: [other] }]);
  chat.setMessages(history);
  await sleep(50);

  /* ---- unread divider: opening a conversation with unread>0 shows it before markRead() fires ---- */
  r.unreadDividerShown = !!chat.querySelector('.o-chat-unread-sep');

  /* ---- windowing: only the last 40 are rendered initially ---- */
  r.initialRowCount = chat.querySelectorAll('.o-chat-row[data-mid]').length;

  /* ---- scroll-anchor when older messages are revealed by scrolling up ---- */
  const box = chat.querySelector('.o-chat-messages');
  box.scrollTop = 0; // scroll to the top first so the anchor capture reflects what's actually on screen
  await sleep(20);
  const anchorBefore = box.firstElementChild;
  r.anchorWasTodayDivider = anchorBefore.textContent.trim() === 'Today';
  const anchorTopBefore = anchorBefore.getBoundingClientRect().top;
  box.dispatchEvent(new Event('scroll', { bubbles: true }));
  await sleep(250); // scroll handler is throttled(120ms)
  r.rowCountAfterScrollUp = chat.querySelectorAll('.o-chat-row[data-mid]').length;
  r.scrollTopAfterAnchor = box.scrollTop;
  r.newDividerRevealedAbove = box.firstElementChild !== anchorBefore && box.firstElementChild.textContent.trim() !== 'Today';
  r.anchorStillPresent = anchorBefore.isConnected;
  r.anchorTopDelta = anchorBefore.isConnected ? Math.abs(anchorBefore.getBoundingClientRect().top - anchorTopBefore) : null;
  r.anchorPositionStable = anchorBefore.isConnected && r.anchorTopDelta < 4;

  /* ---- typing indicator ---- */
  chat.setTyping('ben', true, 'c1');
  await sleep(30);
  r.typingRowShown = !!chat.querySelector('.o-chat-typing-row');
  r.typingHeaderText = chat.querySelector('.o-chat-header-sub').textContent.includes('typing');
  chat.setTyping('ben', false, 'c1');
  await sleep(30);
  r.typingRowCleared = !chat.querySelector('.o-chat-typing-row');

  /* ---- send + ticks (sending -> sent) ---- */
  let resolveSend;
  chat.onSend = () => new Promise(res => { resolveSend = res; });
  const textarea = chat.querySelector('.o-chat-textarea');
  textarea.focus(); textarea.value = 'Hello from the eval';
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await sleep(30);
  const lastRow = () => [...chat.querySelectorAll('.o-chat-row.is-mine[data-mid]')].pop();
  r.sentRowAppended = !!lastRow();
  r.tickSendingShown = !!lastRow().querySelector('.o-chat-ticks.is-sending');
  resolveSend({ status: 'sent' });
  await sleep(30);
  r.tickSentAfterResolve = lastRow().querySelector('.o-chat-ticks') && !lastRow().querySelector('.o-chat-ticks.is-sending');
  r.composerClearedAfterSend = textarea.value === '';

  /* ---- read tick on an incoming message ---- */
  chat.updateMessage('h58', { status: 'read' });
  await sleep(30);
  const readRow = chat.querySelector('.o-chat-row[data-mid="h58"]');
  r.readTickShown = false; // h58 is Ben's incoming message, not mine — ticks only render for "is-mine" rows
  chat.addMessage('c1', { id: 'mine1', conversationId: 'c1', author: { id: 'me' }, text: 'read me', createdAt: Date.now(), status: 'delivered' });
  await sleep(30);
  chat.updateMessage('mine1', { status: 'read' });
  await sleep(30);
  r.readTickShown = !!chat.querySelector('.o-chat-row[data-mid="mine1"] .o-chat-ticks.is-read');

  /* ---- keyboard: ArrowUp in an empty composer edits the last own message, Escape cancels ---- */
  textarea.value = '';
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  await sleep(30);
  r.editModeEntered = textarea.value === 'read me';
  textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await sleep(30);
  r.editModeCancelled = textarea.value === '';

  /* ---- markRead() fires ~400ms after a conversation becomes active, clearing its list badge —
   *      the in-thread "unread messages" divider is a where-you-left-off marker and correctly
   *      stays put until the conversation is left and reopened. ---- */
  await sleep(500);
  r.badgeClearedAfterDelay = !chat.querySelector('.o-chat-conv[data-id="c1"] .o-badge');
  r.dividerStillMarksWhereLeftOff = !!chat.querySelector('.o-chat-unread-sep');

  r.ok = r.unreadDividerShown && r.initialRowCount === 40 && r.anchorWasTodayDivider && r.rowCountAfterScrollUp === 60
    && r.newDividerRevealedAbove && r.anchorStillPresent && r.anchorPositionStable && r.scrollTopAfterAnchor > 0
    && r.typingRowShown && r.typingHeaderText && r.typingRowCleared
    && r.sentRowAppended && r.tickSendingShown && r.tickSentAfterResolve && r.composerClearedAfterSend && r.readTickShown
    && r.editModeEntered && r.editModeCancelled && r.badgeClearedAfterDelay && r.dividerStillMarksWhereLeftOff;
  return r;
})()
