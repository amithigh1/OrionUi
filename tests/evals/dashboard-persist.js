(async () => {
  const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  const KEY = 'orion:dashboard:demo-analytics';

  const dash = document.getElementById('dash-demo');
  out.keyBeforeAnyChange = dash._key === KEY; // 'persist="demo-analytics"' from the markup
  dash.editable = true; // arrow-key move/resize (and remove) below require edit mode
  await raf();

  /* ---- 1. a real move (keyboard, like a user) commits post-compaction coordinates into both
             _cur and the persisted layout together, then wait past the 120ms autosave debounce.
             (setLayout() with a hand-built array is intentionally NOT used here: it stores the
             caller's raw request, which vertical compaction may then float elsewhere on next
             render — so comparing it to getLayout() would be testing the wrong thing.) ---- */
  const todo = document.getElementById('todo');
  todo.setAttribute('tabindex', '0');
  todo.focus();
  const beforeMove = dash.getLayout().find(i => i.id === 'todo');
  todo.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  const afterMove = dash.getLayout().find(i => i.id === 'todo');
  out.keyboardMoveChanged = beforeMove.x !== afterMove.x || beforeMove.y !== afterMove.y;
  await sleep(300);
  const raw1 = localStorage.getItem(KEY);
  out.autosavedAfterMove = !!raw1;
  const state1 = raw1 && JSON.parse(raw1);
  out.storedShapeOk = !!state1 && state1.v === 1 && typeof state1.layouts === 'object';
  const storedTodo1 = state1 && state1.layouts[dash.breakpoint] && state1.layouts[dash.breakpoint].find(i => i.id === 'todo');
  out.storedMatchesLiveLayout = !!storedTodo1 && storedTodo1.x === afterMove.x && storedTodo1.y === afterMove.y
    && storedTodo1.w === afterMove.w && storedTodo1.h === afterMove.h;

  /* ---- 2. explicit save() (also exercised via the "save" action elsewhere) after another change ---- */
  await dash.removeWidget('todo', { confirm: false });
  dash.save(); // synchronous — cancels the debounce and writes now
  const state2 = JSON.parse(localStorage.getItem(KEY));
  out.removedPersisted = Array.isArray(state2.removed) && state2.removed.includes('todo');

  /* ---- 3. round trip: a FRESH <o-dashboard> reading the same persist key on first connect
             restores the persisted layout/removed state instead of its own markup defaults ---- */
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;inset-inline-start:-9999px;width:900px';
  document.body.appendChild(host);
  const fresh = document.createElement('o-dashboard');
  fresh.setAttribute('persist', 'demo-analytics');
  fresh.setAttribute('columns', '12');
  // same widget ids as the demo, but with DIFFERENT markup positions than the original —
  // if persistence round-trips, the restored layout (not these attributes) should win.
  // Appended to `fresh` WHILE DETACHED so they exist before the dashboard's very first
  // _sync() (on connect) — a dashboard that first connects with zero children and only gets
  // its widgets appended a tick later would consume (and null out) the one-shot `removed`
  // list before there is any 'todo' element for it to apply to.
  const w1 = document.createElement('o-widget'); w1.id = 'kpis'; w1.setAttribute('x', '0'); w1.setAttribute('y', '0'); w1.setAttribute('w', '12'); w1.setAttribute('h', '2'); w1.setAttribute('locked', '');
  const w2 = document.createElement('o-widget'); w2.id = 'revenue'; w2.setAttribute('x', '0'); w2.setAttribute('y', '2'); w2.setAttribute('w', '8'); w2.setAttribute('h', '4');
  const w3 = document.createElement('o-widget'); w3.id = 'todo'; w3.setAttribute('x', '9'); w3.setAttribute('y', '9'); w3.setAttribute('w', '3'); w3.setAttribute('h', '3'); w3.setAttribute('removable', '');
  fresh.append(w1, w2, w3);
  host.appendChild(fresh);
  await raf(); await sleep(50);

  out.freshRestoredRemoved = !fresh.getWidget('todo'); // 'todo' was in state2.removed -> hidden on the fresh instance too
  const freshTodoLayout = fresh.getLayout().find(i => i.id === 'todo');
  out.freshHasNoRemovedInLayout = !freshTodoLayout;

  document.body.removeChild(host);

  /* ---- 4. reset() forgets everything and clears the storage key ---- */
  dash.reset();
  await raf();
  out.resetRestoredTodo = !!dash.getWidget('todo');
  out.resetClearedStorage = localStorage.getItem(KEY) === null;

  out.ok = out.keyBeforeAnyChange && out.keyboardMoveChanged && out.autosavedAfterMove && out.storedShapeOk && out.storedMatchesLiveLayout
    && out.removedPersisted && out.freshRestoredRemoved && out.freshHasNoRemovedInLayout
    && out.resetRestoredTodo && out.resetClearedStorage;
  return out;
})()
