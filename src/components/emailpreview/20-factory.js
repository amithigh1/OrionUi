/* Orion.emailPreview(html, opts) -> { el, viewer, close(reason), closed }
 * A small standalone modal wrapped around <o-email-preview>, built directly on the core overlay stack
 * (overlays.open + portal, per ARCHITECTURE section 6) instead of depending on Orion.modal — the dialogs/
 * modal components are developed separately and may not be part of a bundle that only builds `emailpreview`.
 */
function epModal(html, opts = {}) {
  if (!isBrowser) return null;
  const o = opts || {};
  const el = doc.createElement('o-email-preview');
  el.html = isStr(html) ? html : (o.html || '');
  if (o.subject != null) el.subject = o.subject;
  if (o.from != null) el.from = o.from;
  if (o.to != null) el.to = o.to;
  if (o.preheader != null) el.preheader = o.preheader;
  if (o.device) el.device = o.device;
  if (o.dark) el.dark = true;
  if (o.images === false) el.images = false;
  if (o.view) el.view = o.view;
  if (o.toolbar === false) el.toolbar = false;
  if (o.texts) el.texts = o.texts;

  const titleId = uid('ep-modal-t');
  const closeBtn = h('button', { type: 'button', class: 'o-btn-close o-ep-modal-close', 'aria-label': t('emailpreview.close') });
  const header = h('div', { class: 'o-ep-modal-header' }, h('h2', { class: 'o-ep-modal-title', id: titleId }, o.title || t('emailpreview.modalTitle')), closeBtn);
  const body = h('div', { class: 'o-ep-modal-body' }, el);
  const panel = h('div', { class: 'o-ep-modal-panel o-floating', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' }, header, body);
  const backdrop = h('div', { class: 'o-backdrop' });
  const root = h('div', { class: 'o-ep-modal' }, backdrop, panel);

  const from = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : doc.documentElement;
  portal(root, o.trigger || from);

  let resolveClosed;
  const closed = new Promise(r => { resolveClosed = r; });
  const ov = overlays.open({
    el: root, owner: o.trigger, modal: true, trap: true, lockScroll: true, outside: true,
    onClose: reason => {
      animate(root, 'fadeOut', { duration: 150 }).then(() => root.remove());
      try { o.onClose?.(reason); } catch (err) { console.error('[Orion] emailPreview onClose:', err); }
      resolveClosed(reason);
    },
  });
  const handle = { el: root, viewer: el, closed, close: reason => ov.close(reason || 'api') };
  on(backdrop, 'click', () => handle.close('backdrop'));
  on(closeBtn, 'click', () => handle.close('close-button'));
  animate(root, 'fadeIn', { duration: 160 });
  animate(panel, 'zoomIn', { duration: 160 });
  requestAnimationFrame(() => focusFirst(panel));
  return handle;
}
O.emailPreview = epModal;
