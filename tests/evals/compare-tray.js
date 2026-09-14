(async () => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const r = {};

  Orion.compare.clear(); await sleep(20);
  const tray = $('o-compare-tray');
  r.trayHiddenInitially = tray.hidden;

  const buttons = $$('#cmp-grid [data-o-action="compare"]');
  r.buttonCount = buttons.length;

  buttons[0].click(); await sleep(30);
  buttons[1].click(); await sleep(30);
  r.trayVisibleAfterAdd = !tray.hidden;
  r.trayChipCount = $$('o-compare-tray .o-compare-tray-item').length;
  r.countTextShows2 = tray.querySelector('.o-compare-tray-count').textContent.includes('2');
  r.button0Pressed = buttons[0].getAttribute('aria-pressed') === 'true' && buttons[0].classList.contains('is-active');

  // toggle off via the same button
  buttons[0].click(); await sleep(30);
  r.listAfterToggleOff = Orion.compare.list().length;
  r.button0Unpressed = buttons[0].getAttribute('aria-pressed') === 'false';

  buttons[0].click(); await sleep(30); // back to 2
  buttons[2].click(); await sleep(30);
  buttons[3].click(); await sleep(30); // now 4 (at max)
  r.listAtMax = Orion.compare.list().length;
  r.compareBtnEnabled = !tray.querySelector('.o-btn-primary').disabled;

  // 5th add should be rejected (max reached)
  buttons[4].click(); await sleep(30);
  r.listStillAtMaxAfter5th = Orion.compare.list().length;
  r.trayIsFull = tray.classList.contains('is-full');

  // persistence: localStorage mirrors the in-memory list
  const stored = JSON.parse(localStorage.getItem('orion:compare:items') || '[]');
  r.persistedMatchesList = stored.length === Orion.compare.list().length
    && stored.every((it, i) => it.id === Orion.compare.list()[i].id);

  // remove via a tray chip
  const beforeRemove = Orion.compare.list().length;
  tray.querySelector('.o-compare-tray-item .o-chip-remove').click(); await sleep(30);
  r.listAfterChipRemove = Orion.compare.list().length;
  r.chipRemoveWorked = r.listAfterChipRemove === beforeRemove - 1;

  // reveal the table via "Compare"
  const table = $('#cmp-table');
  tray.querySelector('.o-btn-primary').click(); await sleep(50);
  r.tableRevealed = !table.hidden;
  r.tableItemsMatch = table.items.length === Orion.compare.list().length;

  Orion.compare.clear(); await sleep(30);
  r.trayHiddenAfterClear = tray.hidden;

  r.ok = r.trayHiddenInitially && r.buttonCount >= 5 && r.trayVisibleAfterAdd && r.trayChipCount === 2
    && r.countTextShows2 && r.button0Pressed && r.listAfterToggleOff === 1 && r.button0Unpressed
    && r.listAtMax === 4 && r.compareBtnEnabled && r.listStillAtMaxAfter5th === 4 && r.trayIsFull
    && r.persistedMatchesList && r.chipRemoveWorked && r.tableRevealed && r.tableItemsMatch && r.trayHiddenAfterClear;
  return r;
})()
