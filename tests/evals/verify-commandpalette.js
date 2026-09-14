(async () => {
  const results = {};
  const fail = [];
  const check = (name, cond) => { results[name] = !!cond; if (!cond) fail.push(name); };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  const ran = {};
  const unregisters = [];

  // A focusable trigger to prove focus returns to it after Escape.
  const trigger = document.createElement('button');
  trigger.textContent = 'verify-trigger';
  trigger.id = 'verify-cp-trigger';
  document.body.appendChild(trigger);

  unregisters.push(Orion.commands.register([
    { id: 'verify-alpha', title: 'Verify Alpha Command', section: 'Verify Section', keywords: ['first'], run: () => { ran.alpha = true; ran.lastRun = 'Verify Alpha Command'; } },
    { id: 'verify-beta', title: 'Verify Beta Command', section: 'Verify Section', keywords: ['second'], run: () => { ran.beta = true; ran.lastRun = 'Verify Beta Command'; } },
    {
      id: 'verify-group', title: 'Verify Nested Group', section: 'Verify Section', icon: 'settings',
      children: [
        { id: 'verify-group-child', title: 'Verify Nested Child', run: () => { ran.child = true; ran.lastRun = 'Verify Nested Child'; } },
      ],
    },
  ]));

  // ── 1. Open via the documented Ctrl/Cmd+K hotkey ─────────────────────
  trigger.focus();
  check('triggerFocusedBeforeOpen', document.activeElement === trigger);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true }));
  await wait(60);
  check('hotkeyOpensPalette', Orion.commandPalette.isOpen === true);
  let dialog = document.querySelector('.o-cmdk');
  check('dialogInDom', !!dialog);
  let input = dialog.querySelector('.o-cmdk-input');
  check('inputFocusedAfterOpen', document.activeElement === input);

  // ── Escape closes and returns focus ──────────────────────────────────
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await wait(60);
  check('escapeClosesPalette', Orion.commandPalette.isOpen === false);
  check('escapeReturnsFocus', document.activeElement === trigger);

  // ── 2. Open via Orion.commandPalette.open() ──────────────────────────
  Orion.commandPalette.open();
  await wait(60);
  check('apiOpensPalette', Orion.commandPalette.isOpen === true);
  dialog = document.querySelector('.o-cmdk');
  input = dialog.querySelector('.o-cmdk-input');

  // grouped commands render under their section heading
  let sectionTitles = [...dialog.querySelectorAll('.o-cmdk-section-title')].map(x => x.textContent);
  check('groupedSectionRenders', sectionTitles.includes('Verify Section'));

  // ── fuzzy query narrows the list ──────────────────────────────────────
  input.value = 'verify beta';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(30);
  let options = [...dialog.querySelectorAll('[role="option"]')];
  check('fuzzyQueryFiltersList', options.length >= 1 && options.every(o => /Verify Beta Command/.test(o.textContent)));

  // ── ArrowDown / ArrowUp / Enter runs the selected command ────────────
  input.value = 'verify';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(30);
  options = [...dialog.querySelectorAll('[role="option"]')];
  check('multipleMatchesForVerify', options.length >= 3);

  // the top result is pre-selected as soon as the list renders (typical command-palette UX)
  const initialIdx = dialog.querySelector('[aria-selected="true"]')?.dataset.idx;
  check('topResultPreselectedOnRender', initialIdx === '0');

  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  let activeIdx = dialog.querySelector('[aria-selected="true"]')?.dataset.idx;
  check('arrowDownAdvancesFromPreselected', activeIdx === '1');

  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  const secondIdx = dialog.querySelector('[aria-selected="true"]')?.dataset.idx;
  check('arrowDownAdvancesAgain', secondIdx === '2');

  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  const backIdx = dialog.querySelector('[aria-selected="true"]')?.dataset.idx;
  check('arrowUpMovesBack', backIdx === '1');

  const selectedTitleBeforeEnter = dialog.querySelector('[aria-selected="true"] .o-cmdk-title')?.textContent;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await wait(60);
  check('enterRanTheSelectedCommand', !!selectedTitleBeforeEnter && ran.lastRun === selectedTitleBeforeEnter);
  check('paletteClosesAfterRunByDefault', Orion.commandPalette.isOpen === false);

  // ── recent items appear on reopen (empty query, global root) ─────────
  Orion.commandPalette.open();
  await wait(60);
  dialog = document.querySelector('.o-cmdk');
  sectionTitles = [...dialog.querySelectorAll('.o-cmdk-section-title')].map(x => x.textContent);
  check('recentSectionShownOnReopen', sectionTitles.includes('Recent'));
  const recentSection = [...dialog.querySelectorAll('.o-cmdk-section')].find(s => s.querySelector('.o-cmdk-section-title')?.textContent === 'Recent');
  check('recentSectionListsRanCommand', !!recentSection && ran.lastRun && recentSection.textContent.includes(ran.lastRun));

  // ── nested pages: children push a breadcrumb page ────────────────────
  input = dialog.querySelector('.o-cmdk-input');
  input.value = 'Verify Nested Group';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(30);
  const groupRow = [...dialog.querySelectorAll('[role="option"]')].find(o => /Verify Nested Group/.test(o.textContent));
  check('nestedGroupRowFound', !!groupRow);
  groupRow.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
  groupRow.click();
  await wait(30);
  const breadcrumb = dialog.querySelector('.o-cmdk-breadcrumb');
  check('breadcrumbShowsAfterEnteringNestedPage', !breadcrumb.hidden && /Verify Nested Group/.test(breadcrumb.textContent));
  const childOptions = [...dialog.querySelectorAll('[role="option"]')].map(o => o.textContent);
  check('nestedChildCommandRenders', childOptions.some(t => /Verify Nested Child/.test(t)));

  // Backspace on an empty query goes back one page
  input = dialog.querySelector('.o-cmdk-input');
  input.value = '';
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
  await wait(30);
  check('backspaceGoesBackAPage', dialog.querySelector('.o-cmdk-breadcrumb').hidden === true);

  Orion.commandPalette.close();
  await wait(60);

  // ── 3. Orion.commands.register/unregister reflects immediately ──────
  // Note: the docs page's own demo registers a real async "Users" provider (~300ms simulated
  // latency + 200ms debounce), which also runs on every keystroke here; wait past that so the
  // "no results" checks below observe its settled state, not a still-loading row.
  Orion.commandPalette.open({ query: 'zqxliveverify' });
  await wait(700);
  dialog = document.querySelector('.o-cmdk');
  let emptyBefore = !!dialog.querySelector('.o-empty');
  check('noResultsBeforeLiveRegister', emptyBefore);

  const offLive = Orion.commands.register({ id: 'verify-live', title: 'Zqxliveverify Command', section: 'Verify Section', run: () => { ran.live = true; } });
  await wait(30); // commands:change -> engine re-renders without reopening or retyping
  let liveOptions = [...dialog.querySelectorAll('[role="option"]')].map(o => o.textContent);
  check('registerReflectsImmediatelyWhileOpen', liveOptions.some(t => /Zqxliveverify Command/.test(t)));

  offLive();
  await wait(30);
  liveOptions = [...dialog.querySelectorAll('[role="option"]')].map(o => o.textContent);
  const emptyAfterUnregister = !!dialog.querySelector('.o-empty');
  check('unregisterReflectsImmediately', emptyAfterUnregister && !liveOptions.some(t => /Zqxliveverify Command/.test(t)));

  Orion.commandPalette.close();
  await wait(60);

  // ── <o-command-menu>: inline variant with a local (grouped) list ────
  const menu = document.createElement('o-command-menu');
  document.body.appendChild(menu);
  menu.commands = [
    { id: 'm-one', title: 'Menu Command One', section: 'Menu Group', run: () => { ran.menuOne = true; } },
    { id: 'm-two', title: 'Menu Command Two', section: 'Menu Group', run: () => { ran.menuTwo = true; } },
  ];
  menu.flush?.();
  await wait(30);
  let menuGroups = [...menu.querySelectorAll('.o-cmdk-section-title')].map(x => x.textContent);
  check('inlineMenuGroupsRender', menuGroups.includes('Menu Group'));
  let menuOptions = [...menu.querySelectorAll('[role="option"]')];
  check('inlineMenuHasTwoLocalCommands', menuOptions.length === 2);

  // the top row is pre-selected on render too; running it should fire the matching handler
  const menuFirstTitle = menu.querySelector('[aria-selected="true"] .o-cmdk-title')?.textContent;
  const menuInput = menu.querySelector('.o-cmdk-input');
  menuInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await wait(30);
  const ranMatchingFirst = (menuFirstTitle === 'Menu Command One' && ran.menuOne === true) || (menuFirstTitle === 'Menu Command Two' && ran.menuTwo === true);
  check('inlineMenuRanCommand', ranMatchingFirst);
  check('inlineMenuStaysOpenAfterRun', menu.isConnected);

  let commandEventDetail = null;
  menu.addEventListener('o-command', e => { commandEventDetail = e.detail; });
  menuInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  const menuSecondTitle = menu.querySelector('[aria-selected="true"] .o-cmdk-title')?.textContent;
  menuInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await wait(30);
  check('inlineMenuEmitsCommandEvent', !!commandEventDetail && commandEventDetail.command.title === menuSecondTitle);

  // cleanup
  unregisters.forEach(off => off());
  menu.remove();
  trigger.remove();
  Orion.commandPalette.close();

  const ok = fail.length === 0;
  return { ok, failed: fail, results };
})()
