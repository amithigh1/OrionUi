/* tests/evals/capture-recorder.js — run against docs/components/recorder.html
 * Proves <o-audio-recorder>/<o-video-recorder>: permission/hardware states via a mocked getUserMedia, a real
 * MediaRecorder round-trip via the injected `stream` property (no microphone/camera needed), pause/resume,
 * the duration-limit auto-stop, the level-meter mechanism attaching/skipping correctly, and download().
 */
(async () => {
  const results = [];
  const assert = (name, cond, extra) => results.push({ name, ok: !!cond, extra });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  /** Wait for the first of several event types on `el` (each resolves with { type, event }), or 'timeout'.
   * IMPORTANT: call this BEFORE triggering the action — some failure paths (e.g. an immediately-known
   * "unsupported" reason) emit synchronously, before the triggering call even returns, so a listener attached
   * afterwards would miss it and hang forever. */
  function raceEvents(el, types, timeoutMs) {
    return new Promise(resolve => {
      const offs = types.map(type => {
        const h = e => { offs.forEach(o => o()); resolve({ type, event: e }); };
        el.addEventListener(type, h, { once: true });
        return () => el.removeEventListener(type, h);
      });
      setTimeout(() => { offs.forEach(o => o()); resolve({ type: 'timeout' }); }, timeoutMs);
    });
  }

  const md = navigator.mediaDevices;
  const realGetUserMedia = md && md.getUserMedia;

  function freshAudio() {
    const el = document.createElement('o-audio-recorder');
    el.style.cssText = 'position:fixed;inset-inline-start:-9999px;top:-9999px';
    document.body.appendChild(el);
    return el;
  }
  function freshVideo() {
    const el = document.createElement('o-video-recorder');
    el.style.cssText = 'position:fixed;inset-inline-start:-9999px;top:-9999px';
    document.body.appendChild(el);
    return el;
  }
  function silentAudioStream() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const dest = ctx.createMediaStreamDestination();
    const osc = ctx.createOscillator();
    osc.frequency.value = 440; osc.connect(dest); osc.start();
    return { stream: dest.stream, ctx };
  }
  function movingCanvasStream(fps) {
    const c = document.createElement('canvas'); c.width = 160; c.height = 120;
    const ctx = c.getContext('2d');
    let n = 0;
    const timer = setInterval(() => { n = (n + 8) % 255; ctx.fillStyle = `rgb(${n},${n},${n})`; ctx.fillRect(0, 0, 160, 120); }, 33);
    const stream = c.captureStream ? c.captureStream(fps || 30) : null;
    return { stream, stop: () => clearInterval(timer) };
  }

  // ---- unsupported: no getUserMedia at all (audio) ----
  {
    const el = freshAudio();
    md.getUserMedia = undefined;
    const p = raceEvents(el, ['o-error'], 3000);
    el.start(); // the "unsupported" reason is known synchronously, so the listener above must exist first
    const { type, event } = await p;
    assert('audio unsupported: o-error reason', type === 'o-error' && event.detail.reason === 'unsupported', { type });
    el.remove();
  }

  // ---- denied: getUserMedia rejects with NotAllowedError (audio) ----
  {
    md.getUserMedia = async () => { const e = new Error('denied'); e.name = 'NotAllowedError'; throw e; };
    const el = freshAudio();
    const p = raceEvents(el, ['o-error'], 3000);
    el.start();
    const { type, event } = await p;
    assert('audio denied: o-error reason', type === 'o-error' && event.detail.reason === 'denied', { type });
    el.remove();
  }
  md.getUserMedia = realGetUserMedia;

  const canCapture = !!(document.createElement('canvas').captureStream) && !!(window.AudioContext || window.webkitAudioContext);
  if (!canCapture) {
    assert('stream fixture round-trip (skipped: captureStream/AudioContext unsupported in this browser)', true);
  } else {
    // ---- audio: real MediaRecorder round-trip via an injected `stream` (no microphone) ----
    {
      const el = freshAudio();
      const { stream, ctx } = silentAudioStream();
      el.stream = stream;
      const startP = raceEvents(el, ['o-start', 'o-error'], 3000);
      el.start();
      const started = await startP;
      assert('audio+stream: start() reaches o-start (not o-error)', started.type === 'o-start', { started: started.type, detail: started.event && started.event.detail });
      assert('audio+stream: level meter attaches when the stream has an audio track', typeof el._stopMeter === 'function');
      await wait(120);
      assert('audio+stream: pause() moves to paused', (el.pause(), el._state === 'paused'));
      assert('audio+stream: resume() moves back to recording', (el.resume(), el._state === 'recording'));
      await wait(500);
      const stopP = raceEvents(el, ['o-stop'], 3000);
      el.stop();
      const stopped = await stopP;
      const detail = stopped.event && stopped.event.detail;
      assert('audio+stream: o-stop gives a non-empty File', !!detail && detail.file instanceof File && detail.file.size > 0, { size: detail && detail.file && detail.file.size });
      assert('audio+stream: mime type is audio/*', !!detail && /^audio\//.test(detail.file.type), { type: detail && detail.file && detail.file.type });
      assert('audio+stream: form value round-trips (form-associated)', !!detail && el.value === detail.file);
      let downloaded = null;
      const realDownload = Orion.download;
      Orion.download = (data, name) => { downloaded = { data, name }; };
      el.download();
      Orion.download = realDownload;
      assert('audio+stream: download() calls Orion.download with the recorded file', !!detail && downloaded && downloaded.data === detail.file);
      ctx.close().catch(() => {});
      el._player.removeAttribute('src'); el._player.load?.(); // cleanly cancel the blob: load before disconnect revokes it
      el.remove();
    }

    // ---- audio: a video-only injected stream (no audio track) must not hang or throw; meter skipped ----
    {
      const el = freshAudio();
      const { stream, stop } = movingCanvasStream(30);
      if (stream) {
        el.stream = stream;
        const p = raceEvents(el, ['o-start', 'o-error'], 3000);
        el.start();
        const settled = await p;
        assert('audio+video-only stream: start() settles (o-start or a graceful o-error), never hangs', settled.type === 'o-start' || settled.type === 'o-error', { settled: settled.type });
        if (settled.type === 'o-start') {
          assert('audio+video-only stream: level meter is skipped (no audio track)', el._stopMeter == null);
          el.stop();
        }
      } else assert('audio+video-only stream (skipped: captureStream unsupported)', true);
      stop();
      el.remove();
    }

    // ---- audio: duration limit auto-stops ----
    {
      const el = freshAudio();
      el.maxDuration = 1;
      const { stream, ctx } = silentAudioStream();
      el.stream = stream;
      const p = raceEvents(el, ['o-stop', 'o-error'], 3000);
      el.start();
      const stopped = await p;
      assert('audio: max-duration auto-stops without a manual stop() call', stopped.type === 'o-stop', { type: stopped.type });
      el._player.removeAttribute('src'); el._player.load?.(); // cleanly cancel the blob: load before disconnect revokes it
      ctx.close().catch(() => {});
      el.remove();
    }

    // ---- video: real MediaRecorder round-trip via an injected `stream` (no camera) ----
    {
      const el = freshVideo();
      const { stream, stop } = movingCanvasStream(30);
      if (stream) {
        el.stream = stream;
        const startP = raceEvents(el, ['o-start', 'o-error'], 3000);
        el.start();
        const started = await startP;
        assert('video+stream: start() reaches o-start (not o-error)', started.type === 'o-start', { started: started.type, detail: started.event && started.event.detail });
        await wait(500);
        const stopP = raceEvents(el, ['o-stop'], 3000);
        el.stop();
        const stopped = await stopP;
        const detail = stopped.event && stopped.event.detail;
        assert('video+stream: o-stop gives a non-empty File', !!detail && detail.file instanceof File && detail.file.size > 0, { size: detail && detail.file && detail.file.size });
        assert('video+stream: mime type is video/*', !!detail && /^video\//.test(detail.file.type), { type: detail && detail.file && detail.file.type });
        assert('video+stream: file property matches the event', !!detail && el.file === detail.file);
        el._player.removeAttribute('src'); el._player.load?.(); // cleanly cancel the blob: load before disconnect revokes it
      } else assert('video+stream round-trip (skipped: captureStream unsupported)', true);
      stop();
      el.remove();
    }
  }

  md.getUserMedia = realGetUserMedia;

  const bad = results.filter(r => !r.ok);
  return { ok: bad.length === 0, count: results.length, bad, results };
})();
