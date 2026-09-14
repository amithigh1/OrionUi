/* legacy-video-api.js — salvaged from .tmp/eval-video.js (docs/components/players.html).
 * <o-video> imperative API against the page's default source: play(), seek(), setSpeed(), pause().
 */
(async () => {
  const v = document.querySelector('#v-api');
  await new Promise(r => setTimeout(r, 400));
  await v.play();
  await new Promise(r => setTimeout(r, 500));
  const playingCurrentTime = v.currentTime;
  v.seek(2.5);
  await new Promise(r => setTimeout(r, 150));
  const seekedTime = v.currentTime;
  v.setSpeed(1.75);
  const rate = v.playbackRate;
  v.pause();
  const pausedNow = v.paused;
  const wasPlaying = playingCurrentTime > 0;
  const seekedNear = Math.abs(seekedTime - 2.5) < 0.5;
  const ok = wasPlaying && seekedNear && rate === 1.75 && pausedNow;
  return { ok, wasPlaying, seekedNear, rate, pausedNow, duration: v.duration };
})()
