/* Orion.preferences.open(opts?) — shows <o-preferences> in a drawer (Orion.drawer when the `overlays`
 * package is present, a minimal panel built on core portal()/overlays/animate otherwise).
 *   Orion.preferences.open({ sections, notifications })
 *   Orion.preferences.close() / toggle(opts?)
 */
let __panel = null;
function __buildEl(opts = {}) {
  const el = doc.createElement('o-preferences');
  if (opts.sections) el.sections = opts.sections;
  if (opts.notifications) el.notifications = opts.notifications;
  if (opts.texts) el.texts = opts.texts;
  return el;
}
function __openMini(opts) {
  if (__panel) return __panel;
  const backdrop = h('div', { class: 'o-help-backdrop' });
  const panel = h('div', { class: 'o-prefs-drawer o-floating', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('preferences.title'), tabindex: '-1' },
    h('div', { class: 'o-prefs-drawer-head' }, h('h2', null, t('preferences.title')), h('button', { type: 'button', class: 'o-btn-close', onClick: () => __panel.close() })),
    h('div', { class: 'o-prefs-drawer-body' }, __buildEl(opts)));
  portal(backdrop, doc.body); portal(panel, doc.body);
  const ov = overlays.open({
    el: panel, owner: null, trap: true, lockScroll: true,
    onClose: () => {
      animate(backdrop, 'fadeOut', { duration: 160, fill: 'forwards' });
      animate(panel, 'slideOutEnd', { duration: 200, fill: 'forwards' }).then(() => { backdrop.remove(); panel.remove(); });
      __panel = null;
    },
  });
  animate(backdrop, 'fadeIn', { duration: 200 });
  animate(panel, 'slideInEnd', { duration: 240 });
  focusFirst(panel);
  on(backdrop, 'click', () => __panel.close());
  __panel = { el: panel, close: () => ov.close('api'), get open() { return overlays.isOpen(panel); } };
  return __panel;
}
O.preferences = {
  open(opts) {
    if (O.drawer && !__panel) {
      const h2 = O.drawer({ title: t('preferences.title'), content: () => __buildEl(opts), size: 'sm', placement: 'end' });
      h2.el.addEventListener('o-closed', () => { __panel = null; });
      __panel = { el: h2.el, close: () => h2.close(), get open() { return h2.el.isOpen; } };
      return __panel;
    }
    return __openMini(opts);
  },
  close() { __panel?.close(); },
  toggle(opts) { __panel ? O.preferences.close() : O.preferences.open(opts); },
};
action('preferences', () => O.preferences.open());
