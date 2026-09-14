(async () => {
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const O = window.Orion;
  const r = {};

  /* ---- set() / get() / subscribe() ---- */
  const events = [];
  const off = O.presence.subscribe(e => events.push(e));
  O.presence.set('u1', 'online', { name: 'Aisha Rahman' });
  r.getReturnsSetStatus = O.presence.get('u1') === 'online';
  r.entryKeepsMeta = O.presence.entry('u1').name === 'Aisha Rahman';
  r.subscribeFired = events.length === 1 && events[0].userId === 'u1' && events[0].status === 'online' && events[0].prev === null;
  O.presence.set('u1', 'busy');
  r.subscribeFiresPrev = events[1].prev === 'online' && events[1].status === 'busy';
  r.unknownStatusFallsBackToOffline = (O.presence.set('u1', 'bogus'), O.presence.get('u1') === 'offline');
  off();
  O.presence.set('u1', 'online'); // no more events expected after off()
  r.unsubscribeStopsEvents = events.length === 3;

  /* ---- <o-presence> tracks the store live via user-id ---- */
  const dot = document.createElement('o-presence');
  dot.setAttribute('user-id', 'u2');
  document.body.append(dot);
  await sleep(20);
  r.dotDefaultsOffline = dot.querySelector('.o-status').classList.contains('o-status-offline');
  O.presence.set('u2', 'away', { name: 'Ben Tan' });
  await sleep(20);
  r.dotTracksLiveStatus = dot.querySelector('.o-status').classList.contains('o-status-away');
  r.dotPicksUpStoreName = dot.querySelector('.o-presence-label').textContent.includes('Ben Tan');

  /* ---- <o-presence-list> groups by status and by group, and reflects live status ---- */
  const list = document.createElement('o-presence-list');
  document.body.append(list);
  list.items = [
    { id: 'p1', name: 'Aisha Rahman', status: 'online', group: 'Eng' },
    { id: 'p2', name: 'Ben Tan', status: 'away', group: 'Eng' },
    { id: 'p3', name: 'Chen Wei', status: 'offline', group: 'Design' },
  ];
  await sleep(20);
  r.listGroupsByStatusDefault = list.querySelectorAll('.o-presence-group-head').length === 3; // online/away/offline
  O.presence.set('p3', 'online'); // live override: p3's own item.status ('offline') should be superseded
  await sleep(20);
  const p3Row = list.querySelector('.o-presence-row[data-id="p3"] .o-status');
  r.listRowUsesLiveStatusOverItemStatus = p3Row.classList.contains('o-status-online');
  list.groupBy = 'group';
  await sleep(20);
  r.listGroupsByTeam = [...list.querySelectorAll('.o-presence-group-head')].some(h => h.textContent.includes('Design'));
  let selected = null;
  list.addEventListener('o-select', e => { selected = e.detail.item; });
  list.querySelector('.o-presence-row').click();
  r.selectEventFired = !!selected;

  /* ---- autoAway() with a mocked Orion.idle ---- */
  O.presence.set('u3', 'online', { name: 'Diego Silva' });
  let idleHandlers = null;
  const realIdle = O.idle;
  O.idle = opts => { idleHandlers = opts; return { stop() {}, start() { return this; }, isIdle: false }; };
  const stopAutoAway = O.presence.autoAway('u3', { timeout: 50 });
  r.autoAwayCalledOrionIdle = !!idleHandlers;
  idleHandlers.onIdle();
  r.statusBecameAwayOnIdle = O.presence.get('u3') === 'away';
  idleHandlers.onActive();
  r.statusRestoredOnActive = O.presence.get('u3') === 'online';
  // a second idle/active cycle after setting 'dnd' by hand: autoAway must not downgrade an explicit DND
  O.presence.set('u3', 'dnd');
  idleHandlers.onIdle();
  r.dndNotOverriddenByAutoAway = O.presence.get('u3') === 'dnd';
  stopAutoAway();
  O.idle = realIdle;
  r.autoAwayNoopWithoutOrionIdle = (() => { const saved = O.idle; delete O.idle; const stop = O.presence.autoAway('u4', {}); O.idle = saved; return typeof stop === 'function'; })();

  r.ok = r.getReturnsSetStatus && r.entryKeepsMeta && r.subscribeFired && r.subscribeFiresPrev && r.unknownStatusFallsBackToOffline
    && r.unsubscribeStopsEvents && r.dotDefaultsOffline && r.dotTracksLiveStatus && r.dotPicksUpStoreName
    && r.listGroupsByStatusDefault && r.listRowUsesLiveStatusOverItemStatus && r.listGroupsByTeam && r.selectEventFired
    && r.autoAwayCalledOrionIdle && r.statusBecameAwayOnIdle && r.statusRestoredOnActive && r.dndNotOverriddenByAutoAway
    && r.autoAwayNoopWithoutOrionIdle;
  return r;
})()
