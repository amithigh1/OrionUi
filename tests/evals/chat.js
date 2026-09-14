(async () => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => !!el && el.getClientRects().length > 0;
  const r = {};
  r.convos = $$('#ch-convos .ch-convo').length;
  r.opsMessages = $$('#ch-log .ch-msg').length;
  r.dayDividers = $$('#ch-log .ch-day').length;
  r.unreadBadges = $$('#ch-convos .o-badge').length;
  $('#ch-convos [data-id=daniel]').click(); await sleep(100);
  r.danielTitle = $('#ch-title').textContent.trim();
  r.danielMessages = $$('#ch-log .ch-msg').length;
  r.danielStatus = $('#ch-sub').textContent.includes('Active now');
  r.avatarStatus = $('#ch-av').getAttribute('data-status');
  const input = $('#ch-input');
  input.value = 'Hello from the test'; input.dispatchEvent(new Event('input', { bubbles: true }));
  $('#ch-form').requestSubmit(); await sleep(150);
  r.afterSend = $$('#ch-log .ch-msg').length;
  r.sentIsMine = $('#ch-log .ch-msg:last-child').classList.contains('is-me');
  r.typingShown = $('#ch-typing').textContent.includes('typing');
  r.railUpdated = $('#ch-convos [data-id=daniel] .ch-convo-last').textContent.includes('You: Hello');
  await sleep(2600);
  r.afterReply = $$('#ch-log .ch-msg').length;
  r.typingCleared = $('#ch-typing').textContent === '';
  const react = $('#ch-log .ch-react'); if (react) react.click();
  r.reactIncremented = !!react && react.textContent === '👍 2';
  input.value = '@Dan'; input.selectionStart = input.selectionEnd = 4; input.dispatchEvent(new Event('input', { bubbles: true })); await sleep(400);
  const kitPanels = () => $$('[class*="o-ek-"], .o-mentions-list').filter(vis);
  r.mentionPopup = kitPanels().length > 0;
  r.mentionPopupHasDaniel = kitPanels().some(e => e.textContent.includes('Daniel'));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); await sleep(300);
  $('#ch-emoji').click(); await sleep(400);
  r.emojiPicker = kitPanels().length > 0;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300);
  $('#ch-menu > button').click(); await sleep(300);
  const openMenu = () => $$('.o-dropdown-menu').find(m => vis(m) && m.textContent.includes('Pin conversation')); // menus are portaled when open
  r.menuOpen = !!openMenu();
  (openMenu() || document).querySelector('[data-value=pin]').click(); await sleep(400);
  r.pinToast = document.body.textContent.includes('Conversation pinned');
  r.menuClosed = !openMenu();
  const f = $('#ch-filter'); f.value = 'sof'; f.dispatchEvent(new Event('input', { bubbles: true })); await sleep(50);
  r.filtered = $$('#ch-convos .ch-convo').length;
  r.ok = r.convos === 5 && r.opsMessages === 7 && r.dayDividers >= 2 && r.unreadBadges === 2 && r.danielTitle === 'Daniel Okafor'
    && r.danielMessages === 3 && r.danielStatus && r.avatarStatus === 'online' && r.afterSend === 4 && r.sentIsMine && r.typingShown
    && r.railUpdated && r.afterReply === 5 && r.typingCleared && r.reactIncremented && r.mentionPopup && r.mentionPopupHasDaniel
    && r.emojiPicker && r.menuOpen && r.pinToast && r.menuClosed && r.filtered === 1;
  return r;
})()
