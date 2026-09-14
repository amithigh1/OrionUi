/* Dashboard: tiny built-in action menu + inline confirm (no dependency on the overlays package). */

i18n.add('en', {
  dashboard: {
    label: 'Dashboard', widget: 'Widget', actions: 'Widget actions', move: 'Move {title}', resize: 'Resize {title}',
    refresh: 'Refresh', fullscreen: 'Full screen', exitFullscreen: 'Exit full screen', collapse: 'Collapse', expand: 'Expand',
    settings: 'Settings', duplicate: 'Duplicate', remove: 'Remove', locked: 'Locked', edit: 'Edit layout', done: 'Done',
    addWidget: 'Add widget', catalog: 'Widget catalog', searchWidgets: 'Search widgets…', noWidgets: 'No widgets match your search',
    added: '{title} added', removed: '{title} removed', moved: '{title} moved to column {x}, row {y}', resized: '{title} resized to {w} by {h}',
    cantMove: '{title} can’t move further', lockedMsg: '{title} is locked', confirmTitle: 'Remove “{title}”?',
    confirmText: 'You can add it again from the widget catalog.', cancel: 'Cancel', loading: 'Loading…', size: '{w} × {h}',
    editOn: 'Edit mode on. Focus a widget, press arrow keys to move it, Shift + arrow keys to resize, Delete to remove.',
    editOff: 'Edit mode off. Layout saved.', reset: 'Layout reset', grabbed: '{title} grabbed. Use arrow keys, then Escape to cancel.',
    dropped: '{title} dropped at column {x}, row {y}', cancelled: 'Move cancelled',
  },
});

/** dashMenu(anchor, items[{ id, label, icon, danger }], onSelect(id), opts) -> { close } */
function dashMenu(anchor, items, onSelect, { label = '', placement = 'bottom-end', onClose } = {}) {
  const panel = h('div', { class: 'o-floating o-dash-menu', role: 'menu', 'aria-label': label, tabindex: '-1' });
  for (const it of items) {
    if (it.divider) { panel.append(h('div', { class: 'o-dash-menu-sep', role: 'separator' })); continue; }
    panel.append(h('button', { type: 'button', class: cls('o-dash-menu-item', it.danger && 'is-danger'), role: 'menuitem', tabindex: '-1', 'data-id': it.id },
      it.icon ? icon(it.icon) : null, h('span', null, it.label)));
  }
  portal(panel, anchor);
  const nav = new ListNav(panel, { items: '[role=menuitem]', loop: true });
  let ov = null;
  const unplace = autoPlace(panel, anchor, { placement, offset: 4, flip: true, onHidden: () => ov?.close('scroll') });
  const pick = id => { ov?.close('select'); try { onSelect(id); } catch (e) { console.error('[Orion]', e); } };
  on(panel, 'click', '[role=menuitem]', (e, btn) => pick(btn.dataset.id));
  on(panel, 'keydown', e => {
    if (e.key === 'Tab') { ov?.close('tab'); return; }
    if (e.key === 'Enter' || e.key === ' ') { const a = nav.active; if (a) { e.preventDefault(); pick(a.dataset.id); } return; }
    nav.handle(e);
  });
  ov = overlays.open({
    el: panel, owner: anchor,
    onClose: () => { unplace(); panel.remove(); anchor.setAttribute('aria-expanded', 'false'); onClose?.(); },
  });
  anchor.setAttribute('aria-expanded', 'true');
  animate(panel, 'zoomIn', { duration: 120 });
  nav.set(0);
  return { close: () => ov?.close('api'), el: panel };
}

/** Inline confirm drawn over a widget (keeps focus inside, Escape cancels). Resolves true/false. */
function dashConfirm(host, { title, text, ok, cancel }) {
  return new Promise(resolve => {
    const tid = uid('dlg');
    const box = h('div', { class: 'o-widget-confirm', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': tid },
      h('div', { class: 'o-widget-confirm-box' },
        h('p', { class: 'o-widget-confirm-title', id: tid }, title),
        text ? h('p', { class: 'o-widget-confirm-text' }, text) : null,
        h('div', { class: 'o-widget-confirm-actions' },
          h('button', { type: 'button', class: 'o-btn o-btn-sm', 'data-v': '0' }, cancel),
          h('button', { type: 'button', class: 'o-btn o-btn-sm o-btn-danger', 'data-v': '1' }, ok))));
    host.append(box);
    let done = false;
    const ov = overlays.open({
      el: box, owner: host, trap: true, outside: false,
      onClose: () => { box.remove(); if (!done) { done = true; resolve(false); } },
    });
    on(box, 'click', 'button[data-v]', (e, b) => { const v = b.dataset.v === '1'; done = true; ov.close('api'); resolve(v); });
    box.querySelector('button').focus();
    animate(box, 'fadeIn', { duration: 120 });
  });
}
