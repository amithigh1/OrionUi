(async () => {
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const O = window.Orion;
  const r = {};

  // fresh state: this store is a page-wide singleton, other demos on the docs page may have pushed to it
  O.notifications.remove('all');
  O.notifications.configure({ toast: true, persist: true, storageKey: 'eval:notif:items', crossTab: false, sound: false, browserNotify: false });

  const bell = document.createElement('o-notification-bell');
  bell.id = 'eval-bell';
  document.body.append(bell);
  const center = document.createElement('o-notifications');
  center.id = 'eval-center';
  document.body.append(center);
  await sleep(30);

  /* ---- bell count reflects the store, including live pushes ---- */
  r.badgeHiddenWhenEmpty = bell.querySelector('.o-badge-counter').hidden;
  const now = Date.now();
  O.notifications.push({ title: 'New order #1', body: 'RM 10.00', type: 'success', createdAt: now - 5000 });
  O.notifications.push({ title: 'New order #2', body: 'RM 20.00', type: 'success', createdAt: now - 4000 });
  const yesterdayItem = O.notifications.push({ title: 'Yesterday item', body: 'older', type: 'info', createdAt: now - 26 * 36e5 });
  await sleep(30);
  r.badgeShowsCountOfThree = bell.querySelector('.o-badge-counter').textContent === '3';
  r.centerShowsThreeRows = center.querySelectorAll('.o-feed-item').length === 3;
  r.dayGroupingShowsTwoDividers = center.querySelectorAll('.o-divider').length === 2; // Today + Yesterday

  /* ---- toast bridging ---- */
  r.toastAppeared = !!document.querySelector('.o-toast, [class*="o-toast"]');

  /* ---- mark one read, mark all read ---- */
  const firstRow = center.querySelector('.o-feed-item');
  const firstId = firstRow.dataset.id;
  firstRow.click();
  await sleep(30);
  r.oneMarkedRead = O.notifications.get(firstId).read === true;
  r.unreadCountAfterOne = O.notifications.unreadCount;
  center.markAllRead();
  await sleep(30);
  r.allMarkedRead = O.notifications.unreadCount === 0;
  r.badgeHiddenAfterAllRead = bell.querySelector('.o-badge-counter').hidden;
  r.noUnreadRowsLeft = center.querySelectorAll('.o-feed-item.is-unread').length === 0;

  /* ---- dismiss removes it from the store ---- */
  const before = O.notifications.items.length;
  const dismissBtn = center.querySelector('.o-notif-dismiss');
  dismissBtn.click();
  await sleep(30);
  r.dismissRemoved = O.notifications.items.length === before - 1;

  /* ---- persistence of read state ---- */
  const saved = JSON.parse(localStorage.getItem('eval:notif:items') || '[]');
  r.persistedReadState = saved.length === O.notifications.items.length && saved.every(it => it.read === true);

  /* ---- connect(): a mocked realtime source pushes notifications into the store ---- */
  // Orion.notifications.connect() pushes the raw event payload as-is (see its README): the WS client
  // auto-emits an event named after the message's own `type` field, so `type` here is both the routing
  // key ('notification', matching { event: 'notification' } below) and ends up as the pushed item's type.
  const srv = O.realtime.mockServer('wss://eval.local/notif', socket => {
    socket.send({ type: 'notification', title: 'Live push', body: 'from mock server' });
  });
  const ws = O.ws('wss://eval.local/notif', { id: 'eval-notif-ws' });
  const disconnect = O.notifications.connect(ws, { event: 'notification' });
  await sleep(150);
  r.connectPushedItem = O.notifications.items.some(it => it.title === 'Live push');
  r.connectUpdatedBell = bell.querySelector('.o-badge-counter').textContent === '1';
  disconnect(); ws.destroy(); srv.close();

  localStorage.removeItem('eval:notif:items');
  r.ok = r.badgeHiddenWhenEmpty && r.badgeShowsCountOfThree && r.centerShowsThreeRows && r.dayGroupingShowsTwoDividers
    && r.toastAppeared && r.oneMarkedRead && r.unreadCountAfterOne === 2 && r.allMarkedRead && r.badgeHiddenAfterAllRead
    && r.noUnreadRowsLeft && r.dismissRemoved && r.persistedReadState && r.connectPushedItem && r.connectUpdatedBell;
  return r;
})()
