(async () => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => !!el && el.getClientRects().length > 0;
  const r = {};
  const tabs = $('o-tabs');
  r.tabCount = tabs.getTabs().length;
  r.progress = $('#pf-pct').textContent.trim();
  r.todoItems = $$('#pf-todo li').length;
  $('#d-first').value = 'Amirah'; $('#d-first').dispatchEvent(new Event('input', { bubbles: true })); await sleep(50);
  r.dirtyShown = $('#pf-dirty').textContent.includes('Unsaved');
  $('#d-first').value = ''; $('#d-first').dispatchEvent(new Event('input', { bubbles: true }));
  $('#pf-save').click(); await sleep(300);
  r.saveBlockedWhenInvalid = $$('#pf-form .o-error').filter(e => e.textContent.trim()).length >= 1;
  $('#d-first').value = 'Amirah'; $('#d-first').dispatchEvent(new Event('input', { bubbles: true }));
  $('#pf-save').click(); await sleep(400);
  r.nameUpdated = $('#pf-name').textContent.trim() === 'Amirah Rahman';
  r.avatarInitials = $('#pf-av').textContent.trim();
  tabs.select('security'); await sleep(200);
  r.securityVisible = vis($('#pw-form')) && $('#security').hidden === false;
  r.sessions = $$('#pf-sessions .o-list-item').length;
  $('#pf-sessions [data-revoke]').click(); await sleep(100);
  r.sessionsAfterRevoke = $$('#pf-sessions .o-list-item').length;
  $('#pf-codes').click(); await sleep(500);
  const pre = $('#pf-code-list');
  r.codesShown = vis(pre) && pre.textContent.trim().split('\n').length === 8;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(400);
  r.codesClosed = !vis($('#pf-code-list'));
  tabs.select('activity'); await sleep(300);
  r.timelineItems = $$('#pf-timeline .o-timeline-item').length;
  r.loginRows = $$('#pf-logins tbody tr').length;
  r.loginBadges = $$('#pf-logins .o-badge').length;
  tabs.select('notifications'); await sleep(200);
  r.notifRows = $$('#pf-notif tr').length;
  r.ok = r.tabCount === 4 && r.progress === '60%' && r.todoItems === 5 && r.dirtyShown && r.saveBlockedWhenInvalid
    && r.nameUpdated && r.avatarInitials === 'AR' && r.securityVisible && r.sessions === 3 && r.sessionsAfterRevoke === 2
    && r.codesShown && r.codesClosed && r.timelineItems === 5 && r.loginRows === 6 && r.loginBadges >= 6 && r.notifRows === 7;
  return r;
})()
