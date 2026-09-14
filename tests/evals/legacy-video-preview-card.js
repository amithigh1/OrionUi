/* legacy-video-preview-card.js — salvaged from .tmp/eval-preview.js (docs/components/players.html).
 * data-o-video-preview: hovering starts inline playback, leaving stops the preview.
 */
(async () => {
  const card = document.querySelector('[data-o-video-preview]');
  card.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, pointerType: 'mouse' }));
  await new Promise(r => setTimeout(r, 500));
  const video = card.querySelector('video.o-video-preview-media');
  const isPreviewing = card.classList.contains('is-previewing');
  const playing = video ? !video.paused : false;
  card.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true, pointerType: 'mouse' }));
  await new Promise(r => setTimeout(r, 200));
  const stillPreviewingAfterLeave = card.classList.contains('is-previewing');
  const ok = !!video && isPreviewing && playing && !stillPreviewingAfterLeave;
  return { ok, hasVideo: !!video, isPreviewing, playing, stillPreviewingAfterLeave };
})()
