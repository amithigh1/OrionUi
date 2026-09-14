/* data-o-video-preview — hover-to-play video card.
 *   <a class="card" data-o-video-preview data-src="clip.webm" data-poster="poster.jpg">
 *     <img src="poster.jpg" alt="">
 *   </a>
 * On pointer hover or keyboard focus, a small delay later, a muted looping <video> fades in over the poster and plays;
 * on leave/blur it fades out again. Respects prefers-reduced-motion (stays on the poster). Options:
 *   data-o-video-preview-delay="300"   hover delay in ms before the preview starts (default 250)
 */
behavior('data-o-video-preview', el => {
  el.classList.add('o-video-preview-host');
  const src = el.getAttribute('data-src');
  if (!src) return;
  const delay = +(el.getAttribute('data-o-video-preview-delay')) || 250;
  let video = null, showT = 0, active = false;

  function start() {
    if (active || reducedMotion() || !src) return;
    active = true;
    clearTimeout(showT);
    showT = setTimeout(() => {
      if (!active) return;
      if (!video) {
        video = h('video', { class: 'o-video-preview-media', muted: true, loop: true, playsinline: true, 'webkit-playsinline': '', preload: 'none', 'aria-hidden': 'true', tabindex: '-1' });
        video.src = src;
        if (el.hasAttribute('data-poster')) video.poster = el.getAttribute('data-poster');
        el.append(video);
      }
      video.currentTime = 0;
      video.play().catch(() => {});
      requestAnimationFrame(() => el.classList.add('is-previewing'));
    }, delay);
  }
  function stop() {
    active = false;
    clearTimeout(showT);
    el.classList.remove('is-previewing');
    if (video) { video.pause(); }
  }
  const offs = [
    on(el, 'pointerenter', e => { if (e.pointerType !== 'touch') start(); }),
    on(el, 'pointerleave', stop),
    on(el, 'focusin', start),
    on(el, 'focusout', e => { if (!el.contains(e.relatedTarget)) stop(); }),
  ];
  return () => { offs.forEach(f => f()); stop(); video?.remove(); };
});
