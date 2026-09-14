/* legacy-video-seekbar.js — salvaged from .tmp/eval-seekbar.js (docs/components/players.html).
 * Clicking the <o-video> seek bar at ~60% of its width moves currentTime to ~60% of duration.
 */
(async () => {
  const v = document.querySelector('#v-api');
  const blob = await fetch('../fixtures/media/clip2.webm').then(r => r.blob());
  v.src = URL.createObjectURL(blob);
  await new Promise(r => setTimeout(r, 500));
  const seekEl = v.querySelector('.o-video-seek');
  const rect = seekEl.getBoundingClientRect();
  const y = rect.top + rect.height / 2;
  const x = rect.left + rect.width * 0.6;
  const fire = (type, cx) => seekEl.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: cx, clientY: y, pointerId: 3, pointerType: 'mouse', button: 0, isPrimary: true }));
  fire('pointerdown', x);
  await new Promise(r => setTimeout(r, 60));
  fire('pointerup', x);
  await new Promise(r => setTimeout(r, 200));
  const playedWidth = v.querySelector('.o-video-seek-played').style.width;
  const currentTime = v.currentTime;
  const expectedFrac = 0.6;
  const nearExpected = Math.abs(currentTime / v.duration - expectedFrac) < 0.08;
  const ok = nearExpected && parseFloat(playedWidth) > 0;
  return { ok, currentTime, duration: v.duration, playedWidth, nearExpected };
})()
