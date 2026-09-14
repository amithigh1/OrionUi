/* tests/evals/capture-camera.js — run against docs/components/camera.html
 * Proves <o-camera>: permission/unsupported states via a mocked getUserMedia, a full capture round-trip from a
 * `source` fixture (no camera), mirror/countdown/device-switch, and mode="document" delegation.
 */
(async () => {
  const results = [];
  const assert = (name, cond, extra) => results.push({ name, ok: !!cond, extra });
  const wait = ms => new Promise(r => setTimeout(r, ms));

  const md = navigator.mediaDevices;
  const realGetUserMedia = md && md.getUserMedia;
  const realEnumerate = md && md.enumerateDevices;

  function freshCamera() {
    const el = document.createElement('o-camera');
    el.autoStart = false;
    el.style.cssText = 'position:fixed;inset-inline-start:-9999px;top:-9999px';
    document.body.appendChild(el);
    return el;
  }
  function fixtureCanvas(w, h, color) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = color || '#3366cc'; ctx.fillRect(0, 0, w, h);
    return c;
  }

  // ---- unsupported: no getUserMedia at all ----
  {
    const el = freshCamera();
    md.getUserMedia = undefined;
    const errPromise = new Promise(resolve => el.addEventListener('o-error', e => resolve(e.detail), { once: true }));
    el.start();
    const detail = await errPromise;
    assert('unsupported: o-error reason', detail.reason === 'unsupported');
    el.remove();
  }

  // ---- denied: getUserMedia rejects with NotAllowedError ----
  {
    md.getUserMedia = async () => { const e = new Error('denied'); e.name = 'NotAllowedError'; throw e; };
    const el = freshCamera();
    const errPromise = new Promise(resolve => el.addEventListener('o-error', e => resolve(e.detail), { once: true }));
    el.start();
    const detail = await errPromise;
    assert('denied: o-error reason', detail.reason === 'denied');
    el.remove();
  }
  md.getUserMedia = realGetUserMedia;

  const canCapture = !!(document.createElement('canvas').captureStream);
  if (!canCapture) {
    assert('source fixture capture (skipped: canvas.captureStream unsupported)', true);
  } else {
    // ---- capture from a `source` fixture: no camera involved ----
    {
      const el = freshCamera();
      el.review = false;
      el.source = fixtureCanvas(320, 240, '#3366cc');
      const readyPromise = new Promise(resolve => el.addEventListener('o-ready', resolve, { once: true }));
      el.start();
      await readyPromise;
      assert('source: reaches the live state with no getUserMedia call', el._state === 'live');
      const capturePromise = new Promise(resolve => el.addEventListener('o-capture', e => resolve(e.detail), { once: true }));
      const file = await el.capture();
      const detail = await capturePromise;
      assert('source: capture() resolves a non-empty File', file instanceof File && file.size > 0, { size: file && file.size });
      assert('source: o-capture detail matches the resolved file', detail.file === file && typeof detail.dataURL === 'string' && detail.dataURL.startsWith('data:image/jpeg'));
      const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = detail.dataURL; });
      assert('source: captured image dimensions match the 320x240 fixture', img.naturalWidth === 320 && img.naturalHeight === 240, { w: img.naturalWidth, h: img.naturalHeight });
      el.remove();
    }

    // ---- mirror: reflected on the video element only for facing="user" ----
    {
      const el = freshCamera();
      el.source = fixtureCanvas(160, 120, '#994400');
      el.mirror = true; el.facing = 'user';
      const readyPromise = new Promise(resolve => el.addEventListener('o-ready', resolve, { once: true }));
      el.start();
      await readyPromise;
      assert('mirror: is-mirrored applied for facing=user + mirror=true', el._video.classList.contains('is-mirrored'));
      el.mirror = false;
      el.flush(); // prop updates are batched; force it synchronously before checking the class
      assert('mirror: is-mirrored removed once mirror=false', !el._video.classList.contains('is-mirrored'));
      el.remove();
    }

    // ---- countdown: capture() waits the full countdown before firing ----
    {
      const el = freshCamera();
      el.source = fixtureCanvas(160, 120, '#227722');
      el.countdown = 1; el.review = false;
      const readyPromise = new Promise(resolve => el.addEventListener('o-ready', resolve, { once: true }));
      el.start();
      await readyPromise;
      const t0 = performance.now();
      await el.capture();
      const elapsed = performance.now() - t0;
      assert('countdown: capture() takes at least ~1s for countdown=1', elapsed >= 900, { elapsed });
      el.remove();
    }

    // ---- device switch: cycles through the mocked device list ----
    {
      md.enumerateDevices = async () => [
        { kind: 'videoinput', deviceId: 'cam-a', label: 'Camera A' },
        { kind: 'videoinput', deviceId: 'cam-b', label: 'Camera B' },
      ];
      const el = freshCamera();
      el.deviceId = 'cam-a';
      el.source = fixtureCanvas(160, 120, '#772277');
      const readyPromise = new Promise(resolve => el.addEventListener('o-ready', resolve, { once: true }));
      el.start();
      await readyPromise;
      await el.switchCamera();
      assert('device switch: cycles to the next mocked device', el.deviceId === 'cam-b', { deviceId: el.deviceId });
      el.remove();
      md.enumerateDevices = realEnumerate;
    }

    // ---- mode="document": mounts <o-doc-scanner> and forwards `source` ----
    {
      const el = freshCamera();
      el.autoStart = false;
      el.source = fixtureCanvas(200, 150, '#444444');
      el.mode = 'document';
      await wait(30);
      const inner = el.querySelector('o-doc-scanner');
      assert('document mode: mounts an internal <o-doc-scanner>', !!inner);
      assert('document mode: forwards `source` to the internal scanner', inner && inner.source === el.source);
      const scanPromise = new Promise(resolve => el.addEventListener('o-scan', e => resolve(e.detail), { once: true }));
      await el.start();
      await wait(30);
      inner.capture(); // live -> edit (auto-detects corners internally); applyCorners() needs an edit frame first
      await inner.applyCorners();
      const detail = await scanPromise;
      assert('document mode: o-scan bubbles up from the internal scanner', detail && Array.isArray(detail.pages) && detail.pages.length === 1);
      el.remove();
    }
  }

  md.getUserMedia = realGetUserMedia;
  md.enumerateDevices = realEnumerate;

  const bad = results.filter(r => !r.ok);
  return { ok: bad.length === 0, count: results.length, bad, results };
})();
