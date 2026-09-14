(async () => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => !!el && el.getClientRects().length > 0;
  const tile = n => $(`#fm-grid .fm-tile[data-name="${n}"]`);
  const r = {};
  r.rootTiles = $$('#fm-grid .fm-tile').length;
  r.treeNodes = $$('#fm-tree [role=treeitem]').length;
  tile('Reports').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await sleep(100);
  r.reportsTiles = $$('#fm-grid .fm-tile').length;
  r.crumbText = $('#fm-path').textContent.replace(/\s+/g, ' ').trim();
  tile('2026').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await sleep(100);
  r.nestedTiles = $$('#fm-grid .fm-tile').length;
  $('#fm-path a').click(); await sleep(100);
  r.backToRootTiles = $$('#fm-grid .fm-tile').length;
  tile('Q3-board-pack.pdf').click(); await sleep(50);
  r.selBarShown = vis($('#fm-selbar')) && $('#fm-selcount').textContent.trim() === '1 item';
  tile('onboarding.md').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); await sleep(50);
  r.multiSelect = $('#fm-selcount').textContent.trim() === '2 items';
  $('#fm-clear').click(); await sleep(50);
  r.selCleared = $('#fm-selbar').hidden;
  tile('onboarding.md').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 })); await sleep(300);
  const menu = $$('.o-dropdown-menu').find(vis);
  r.contextMenuShown = !!menu && menu.textContent.includes('Delete') && menu.textContent.includes('Rename');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300);
  r.contextMenuClosed = !$$('.o-dropdown-menu').some(vis);
  tile('team-photo.jpg').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await sleep(500);
  r.lightboxShown = $$('.o-lightbox').some(vis);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(600);
  r.lightboxClosed = !$$('.o-lightbox').some(vis);
  $('#fm-view [data-view=list]').click(); await sleep(300);
  r.listRows = $$('#fm-dt tbody tr').length;
  r.listVisible = vis($('#fm-list')) && !vis($('#fm-grid'));
  $('#fm-view [data-view=grid]').click(); await sleep(100);
  const q = $('#fm-search'); q.value = 'pdf'; q.dispatchEvent(new Event('input', { bubbles: true })); await sleep(400);
  r.searchTiles = $$('#fm-grid .fm-tile').length;
  q.value = 'zzz'; q.dispatchEvent(new Event('input', { bubbles: true })); await sleep(400);
  r.emptyShown = vis($('#fm-empty'));
  q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); await sleep(400);
  const invoices = $$('#fm-tree [role=treeitem]').find(n => n.textContent.includes('Invoices'));
  if (invoices) invoices.click(); await sleep(200);
  r.treeNavTiles = $$('#fm-grid .fm-tile').length;
  r.treeNavCrumb = $('#fm-path').textContent.includes('Invoices');
  r.ok = r.rootTiles === 8 && r.treeNodes >= 5 && r.reportsTiles === 4 && r.crumbText.includes('Reports') && r.nestedTiles === 3
    && r.backToRootTiles === 8 && r.selBarShown && r.multiSelect && r.selCleared && r.contextMenuShown && r.contextMenuClosed
    && r.lightboxShown && r.lightboxClosed && r.listRows === 8 && r.listVisible && r.searchTiles === 1 && r.emptyShown
    && r.treeNavTiles === 4 && r.treeNavCrumb;
  return r;
})()
