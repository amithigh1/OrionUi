/* Orion.recorder — modal helpers around <o-audio-recorder> / <o-video-recorder>.
 *   const memo = await Orion.recorder.audio({ maxDuration: 60 });   -> File | null
 *   const clip = await Orion.recorder.video({ source: 'screen' });  -> File | null
 */
function recModal(tag, opts, eventName) {
  return new Promise(resolve => {
    const el = doc.createElement(tag);
    Object.assign(el, opts.props || {});
    if (opts.maxDuration) el.maxDuration = opts.maxDuration;
    if (opts.source) el.source = opts.source;
    if (opts.facing) el.facing = opts.facing;
    let settled = false;
    const handle = O.modal._mount('o-modal', {
      title: opts.title || t('common.actions'),
      content: el,
      buttons: [{ text: t('common.cancel'), value: null }],
    }, m => { m.size = opts.size || 'sm'; m.centered = true; });
    on(el, eventName, e => { settled = true; resolve(e.detail.file); handle.close('recorded'); }, { once: true });
    handle.result.then(v => { if (!settled) resolve(v || null); });
  });
}
O.recorder = {
  /** Open a modal with <o-audio-recorder> and resolve with the recorded File (or null if cancelled). */
  audio(opts = {}) { return recModal('o-audio-recorder', { ...opts, title: opts.title || t('recorder.record') }, 'o-stop'); },
  /** Open a modal with <o-video-recorder> and resolve with the recorded File (or null if cancelled). */
  video(opts = {}) { return recModal('o-video-recorder', { ...opts, title: opts.title || t('recorder.record') }, 'o-stop'); },
};
