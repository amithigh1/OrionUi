/* legacy-workspace.js — salvaged from .tmp/ws-eval.js (docs/components/workspace.html).
 * <o-workspace> tab open/close (clean vs dirty with confirm/veto), persistence, plus the plain-markup
 * data-o-toggle="tab"/"collapse" directives that any docs page can use.
 *
 * FIX vs the original script: it stubbed `window.confirm` for the dirty-close cases, assuming no
 * Orion.confirm/dialog was loaded. That held on whatever isolated fixture the previous agent used, but
 * NOT on this full docs page: src/components/workspace/workspace.js's _confirmClose() (line ~267) checks
 * `isFn(O.confirm)` BEFORE falling back to `window.confirm`, and Orion.confirm (src/components/dialogs/
 * dialogs.js) is always registered here. So `ws.close()` on a dirty tab opens a real `.o-dialog` (button
 * classes `.o-dialog-ok` / `.o-dialog-cancel`) and the `window.confirm` stub is never consulted — awaiting
 * `ws.close()` before the dialog is dismissed hung forever (confirmed: it stalled tests/evals/run.mjs for
 * ~17 minutes before being killed). This version clicks the real dialog buttons instead, with a bounded
 * race as a safety net so a wrong assumption fails fast instead of hanging again.
 */
(async () => {
  const out = {};
  localStorage.removeItem('orion:workspace:wtest');
  const ws = document.createElement('o-workspace');
  ws.setAttribute('persist', 'wtest');
  document.body.appendChild(ws);
  await new Promise(r => setTimeout(r, 20));

  const id1 = ws.open({ title: 'Doc A', content: 'Body A' });
  const id2 = ws.open({ title: 'Doc B', content: 'Body B', dirty: true });
  await new Promise(r => setTimeout(r, 20));
  out.openCount = ws.getTabs().length;
  out.activeAfterOpen = ws.activeId === id2;

  const closedClean = await ws.close(id1);
  out.closedCleanDirectly = closedClean;
  out.countAfterCloseClean = ws.getTabs().length;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const race = (p, ms, fallback) => Promise.race([p, sleep(ms).then(() => fallback)]);
  const clickDialogButton = async (selector) => {
    for (let i = 0; i < 20; i++) { const b = document.querySelector(selector); if (b) { b.click(); return true; } await sleep(20); }
    return false;
  };

  const closeDirtyP = ws.close(id2);
  out.dialogOkFoundForClose = await clickDialogButton('.o-dialog-ok');
  const closedDirty = await race(closeDirtyP, 2000, 'TIMED_OUT');
  out.closedDirtyAfterConfirm = closedDirty;
  out.countAfterCloseDirty = ws.getTabs().length;

  const id3 = ws.open({ title: 'Doc C', content: 'C', dirty: true });
  await sleep(20);
  const closeVetoP = ws.close(id3);
  out.dialogCancelFoundForVeto = await clickDialogButton('.o-dialog-cancel');
  const vetoed = await race(closeVetoP, 2000, 'TIMED_OUT');
  out.closeVetoed = vetoed === false;
  out.stillOpenAfterVeto = ws.getTabs().some(t => t.id === id3);

  ws.setDirty(id3, false);
  await new Promise(r => setTimeout(r, 250));
  out.persistedTabs = JSON.parse(localStorage.getItem('orion:workspace:wtest') || '{}').tabs?.length;

  ws.remove();
  localStorage.removeItem('orion:workspace:wtest');

  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="o-nav" role="tablist">
      <button data-o-toggle="tab" data-o-target="#pane1" aria-selected="true">One</button>
      <button data-o-toggle="tab" data-o-target="#pane2">Two</button>
    </div>
    <div id="pane1">P1</div><div id="pane2" hidden>P2</div>`;
  document.body.appendChild(wrap);
  Orion.upgrade(wrap);
  await new Promise(r => setTimeout(r, 20));
  wrap.querySelector('[data-o-target="#pane2"]').click();
  await new Promise(r => setTimeout(r, 20));
  out.plainTabSwitched = !document.getElementById('pane2').hidden && document.getElementById('pane1').hidden;
  wrap.remove();

  const cwrap = document.createElement('div');
  cwrap.innerHTML = `<button data-o-toggle="collapse" data-o-target="#coll1">Toggle</button><div id="coll1" hidden>Collapsible content</div>`;
  document.body.appendChild(cwrap);
  Orion.upgrade(cwrap);
  await new Promise(r => setTimeout(r, 20));
  cwrap.querySelector('button').click();
  await new Promise(r => setTimeout(r, 300));
  out.collapseShown = !document.getElementById('coll1').hidden;
  cwrap.remove();

  const ok = out.openCount === 2 && out.activeAfterOpen && out.closedCleanDirectly === true && out.countAfterCloseClean === 1
    && out.dialogOkFoundForClose && out.closedDirtyAfterConfirm === true && out.countAfterCloseDirty === 0
    && out.dialogCancelFoundForVeto && out.closeVetoed && out.stillOpenAfterVeto && out.persistedTabs === 1
    && out.plainTabSwitched && out.collapseShown;
  return { ok, ...out };
})()
