/* Orion.cropImage(fileOrUrl, opts) -> Promise<Blob|null> — a modal image editor built on <o-cropper>.
 * Resolves the cropped Blob when the user applies, or null when they cancel / close the dialog.
 *   const blob = await Orion.cropImage(file, { aspect: 1, round: true, maxWidth: 512, type: 'image/webp' });
 * opts: aspect, round, minWidth, minHeight, guides (true), height (cropper viewport height in rem, 22),
 *       type, quality, width, height, maxWidth, maxHeight, fill (passed to <o-cropper>.toBlob), title, size ('md')
 * Uses Orion.modal when it is loaded in the same bundle; otherwise a minimal dialog on the core overlay stack.
 */
function __cropFallback(body, title, onClosed) {
  const closeBtn = h('button', { type: 'button', class: 'o-cropimage-fb-close', 'aria-label': t('cropper.cancel') }, icon('x'));
  const head = h('div', { class: 'o-cropimage-fb-head' }, h('strong', {}, title), closeBtn);
  const panel = h('div', { class: 'o-cropimage-fb-panel', role: 'dialog', 'aria-modal': 'true', tabindex: '-1', 'aria-label': title }, head, body);
  const root = h('div', { class: 'o-cropimage-fb' }, panel);
  portal(root, doc.body);
  const ov = overlays.open({ el: root, modal: true, trap: true, lockScroll: true, onClose: () => { animate(root, 'fadeOut', { duration: 150 }).then(() => root.remove()); onClosed(); } });
  on(closeBtn, 'click', () => ov.close('close-button'));
  animate(root, 'fadeIn', { duration: 160 });
  animate(panel, 'zoomIn', { duration: 160 });
  focusFirst(panel);
  return { close: r => ov.close(r || 'api') };
}
function cropImage(fileOrUrl, opts = {}) {
  if (!isBrowser) return Promise.resolve(null);
  return new Promise(resolve => {
    let result = null;
    const cropper = h('o-cropper', { class: 'o-cropimage-cropper', aspect: opts.aspect ?? 'free', round: !!opts.round, guides: opts.guides !== false });
    if (opts.minWidth) cropper.setAttribute('min-width', opts.minWidth);
    if (opts.minHeight) cropper.setAttribute('min-height', opts.minHeight);
    cropper.style.setProperty('--o-cropper-h', (opts.height || 22) + 'rem');
    cropper.src = fileOrUrl;
    const bCancel = h('button', { type: 'button', class: 'o-btn' }, t('cropper.cancel'));
    const bApply = h('button', { type: 'button', class: 'o-btn o-btn-primary' }, icon('check'), h('span', {}, t('cropper.apply')));
    const body = h('div', { class: 'o-cropimage-body' }, cropper, h('div', { class: 'o-cropimage-fb-actions' }, bCancel, bApply));
    const title = opts.title || t('cropper.title');
    const handle = isFn(O.modal)
      ? O.modal({ title, content: body, size: opts.size || 'md', scrollable: false, className: 'o-cropimage-dialog', onClose: () => resolve(result) })
      : __cropFallback(body, title, () => resolve(result));
    on(bCancel, 'click', () => handle.close());
    on(bApply, 'click', async () => {
      bApply.classList.add('is-loading'); bApply.setAttribute('aria-busy', 'true'); bCancel.disabled = true;
      try { result = await cropper.toBlob(opts.type, opts.quality, opts); }
      catch (e) { console.error('[Orion] cropImage:', e); result = null; }
      bApply.classList.remove('is-loading'); bApply.removeAttribute('aria-busy'); bCancel.disabled = false;
      handle.close();
    });
  });
}
O.cropImage = cropImage;
