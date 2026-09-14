/* legacy-dock-drag.js — salvaged from .tmp/dock-eval2.js (docs/components/dock.html).
 * Pointer-drag a tab between regions (with the drop-hint shown), drag a tab out to float it, and use the
 * per-panel context menu's "Move to" action.
 */
(async () => {
  const out = {};
  const dk = document.getElementById('dk');
  await new Promise(r => setTimeout(r, 50));
  const fire = (el, type, opts) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, ...opts }));

  const tab = dk._regions.start.tabsEl.querySelector('.o-dock-tab[data-id="search"]');
  const r0 = tab.getBoundingClientRect();
  fire(tab, 'pointerdown', { clientX: r0.left + 10, clientY: r0.top + 8 });
  const bottomRect = dk._regions.bottom.tabstripEl.getBoundingClientRect();
  const midX = bottomRect.left + bottomRect.width / 2, midY = bottomRect.top + bottomRect.height / 2;
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: r0.left + 30, clientY: r0.top + 20 }));
  await new Promise(r => setTimeout(r, 20));
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: midX, clientY: midY }));
  await new Promise(r => setTimeout(r, 20));
  out.hintVisibleDuringDrag = !!document.querySelector('.o-dock-drop-hint') && !document.querySelector('.o-dock-drop-hint').hidden;
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: midX, clientY: midY }));
  await new Promise(r => setTimeout(r, 20));
  out.searchMovedToBottomViaDrag = dk.getPanels().find(p => p.id === 'search').region === 'bottom';
  out.hintCleanedUp = !document.querySelector('.o-dock-drop-hint');

  const tab2 = dk._regions.bottom.tabsEl.querySelector('.o-dock-tab[data-id="search"]');
  const r1 = tab2.getBoundingClientRect();
  fire(tab2, 'pointerdown', { clientX: r1.left + 10, clientY: r1.top + 8 });
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: r1.left + 30, clientY: r1.top + 20 }));
  await new Promise(r => setTimeout(r, 20));
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: -50, clientY: -50 }));
  await new Promise(r => setTimeout(r, 20));
  out.floatHintMode = document.querySelector('.o-dock-drop-hint')?.dataset.mode;
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: -50, clientY: -50 }));
  await new Promise(r => setTimeout(r, 20));
  out.searchFloatedViaDragOut = dk.getPanels().find(p => p.id === 'search').floating;
  dk.dockBack('search');
  await new Promise(r => setTimeout(r, 20));

  dk.reset();
  await new Promise(r => setTimeout(r, 20));
  const editorTab = dk._regions.center.tabsEl.querySelector('.o-dock-tab[data-id="editor"]');
  dk._openPanelMenu('editor', editorTab);
  await new Promise(r => setTimeout(r, 50));
  const menuItems = [...document.querySelectorAll('.o-tabs-menu-item')];
  out.menuHasMoveToBottom = menuItems.some(b => b.textContent.includes('Bottom panel'));
  const moveBtn = menuItems.find(b => b.textContent.includes('Bottom panel'));
  moveBtn.click();
  await new Promise(r => setTimeout(r, 20));
  out.editorMovedViaMenu = dk.getPanels().find(p => p.id === 'editor').region === 'bottom';
  dk.reset();

  const ok = out.hintVisibleDuringDrag && out.searchMovedToBottomViaDrag && out.hintCleanedUp
    && out.floatHintMode === 'float' && out.searchFloatedViaDragOut
    && out.menuHasMoveToBottom && out.editorMovedViaMenu;
  return { ok, ...out };
})()
