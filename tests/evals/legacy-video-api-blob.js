/* legacy-video-api-blob.js — salvaged from .tmp/eval-video-blob.js (docs/components/players.html).
 * <o-video> API against a freshly-loaded blob source, covering methods legacy-video-api.js doesn't:
 * seek(), skip(), setSpeed(), toggleMute().
 */
(async () => {
  const v = document.querySelector('#v-api');
  const blob = await fetch('../fixtures/media/clip2.webm').then(r => r.blob());
  v.src = URL.createObjectURL(blob);
  await new Promise(r => setTimeout(r, 400));
  await v.play();
  await new Promise(r => setTimeout(r, 400));
  const playingTime = v.currentTime;
  v.pause();
  v.seek(3.2);
  await new Promise(r => setTimeout(r, 200));
  const seekedTime = v.currentTime;
  v.skip(-1.5);
  await new Promise(r => setTimeout(r, 200));
  const afterSkip = v.currentTime;
  v.setSpeed(2);
  const rate = v.playbackRate;
  v.toggleMute();
  const muted = v.videoElement.muted;

  const wasPlaying = playingTime > 0.05;
  const seekedNear3_2 = Math.abs(seekedTime - 3.2) < 0.25;
  const afterSkipNear1_7 = Math.abs(afterSkip - 1.7) < 0.25;
  const ok = wasPlaying && seekedNear3_2 && afterSkipNear1_7 && rate === 2 && muted === true;
  return { ok, wasPlaying, seekedNear3_2, afterSkipNear1_7, rate, muted };
})()
