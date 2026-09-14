/* tests/evals/codes-scanner.js — run against docs/components/scanner.html
 * Proves scanner states (unsupported, denied, ready/scanning, result) via a mocked
 * navigator.mediaDevices.getUserMedia, the o-scan event detail shape, file/drop scanning,
 * continuous vs. single-shot, the `source` fixture path, and keyboard-reachable controls.
 */
(async () => {
  const results = [];
  const assert = (name, cond, extra) => results.push({ name, ok: !!cond, extra });
  const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const wait = ms => new Promise(r => setTimeout(r, ms));

  const md = navigator.mediaDevices;
  const realGetUserMedia = md && md.getUserMedia;
  const realEnumerate = md && md.enumerateDevices;

  function freshScanner() {
    const el = document.createElement('o-scanner');
    el.style.cssText = 'position:fixed;inset-inline-start:-9999px;top:-9999px';
    document.body.appendChild(el);
    return el;
  }

  // ---- unsupported: no getUserMedia at all ----
  {
    const el = freshScanner();
    await raf2();
    md.getUserMedia = undefined;
    const errPromise = new Promise(resolve => el.addEventListener('o-error', e => resolve(e.detail.error), { once: true }));
    el.start();
    const err = await errPromise;
    assert('unsupported: data-state="unsupported" when getUserMedia is missing', el.getAttribute('data-state') === 'unsupported');
    assert('unsupported: o-error fires', err instanceof Error);
    assert('unsupported: status text is user-facing', el.querySelector('.o-scanner-status').textContent.length > 0);
    el.remove();
  }

  // ---- denied: getUserMedia rejects with NotAllowedError ----
  {
    md.getUserMedia = async () => { const e = new Error('Permission denied'); e.name = 'NotAllowedError'; throw e; };
    const el = freshScanner();
    await raf2();
    const errPromise = new Promise(resolve => el.addEventListener('o-error', e => resolve(e.detail.error), { once: true }));
    el.start();
    const err = await errPromise;
    assert('denied: data-state="denied" on NotAllowedError', el.getAttribute('data-state') === 'denied');
    assert('denied: o-error fires with the original error', err && err.name === 'NotAllowedError');
    el.remove();
  }

  // ---- ready -> scanning -> result, via a mocked getUserMedia returning a real (fixture) stream ----
  {
    const fixtureCanvas = document.createElement('canvas');
    fixtureCanvas.width = 320; fixtureCanvas.height = 320;
    const fctx = fixtureCanvas.getContext('2d');
    fctx.fillStyle = '#fff'; fctx.fillRect(0, 0, 320, 320);
    fctx.drawImage(Orion.qr.canvas('Mocked getUserMedia stream', { size: 300, margin: 2, ecc: 'Q' }), 10, 10);
    const fixtureStream = fixtureCanvas.captureStream ? fixtureCanvas.captureStream(10) : null;
    md.getUserMedia = async () => fixtureStream;
    md.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'fixture-cam', label: 'Fixture camera' }];

    const el = freshScanner();
    el.formats = ['qr_code'];
    await raf2();
    assert('ready: data-state="idle" before start()', el.getAttribute('data-state') === 'idle');

    if (fixtureStream) {
      const scanPromise = new Promise(resolve => el.addEventListener('o-scan', e => resolve(e.detail), { once: true }));
      const startPromise = new Promise(resolve => el.addEventListener('o-start', resolve, { once: true }));
      el.start();
      await startPromise;
      assert('scanning: data-state="scanning" once the mocked camera starts', el.getAttribute('data-state') === 'scanning');
      const detail = await scanPromise;
      assert('o-scan detail shape: text/format/points', typeof detail.text === 'string' && detail.format === 'qr_code' && Array.isArray(detail.points));
      assert('o-scan detail: decoded text matches what was drawn', detail.text === 'Mocked getUserMedia stream');
      assert('result: data-state="result" right when o-scan fires (single-shot, before the delayed stop())', el.getAttribute('data-state') === 'result');
      await wait(700);
      assert('single-shot: stops itself after the match', el.getAttribute('data-state') === 'idle' && !el._running);
    } else {
      assert('scanning/result (skipped: canvas.captureStream unsupported in this browser)', true);
    }
    el.remove();
  }

  // ---- continuous mode: keeps scanning after a match ----
  {
    let n = 0;
    const nextCanvas = () => {
      const c = document.createElement('canvas'); c.width = 320; c.height = 320;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 320, 320);
      ctx.drawImage(Orion.qr.canvas('Continuous frame ' + (n++), { size: 300, margin: 2, ecc: 'Q' }), 10, 10);
      return c;
    };
    const el = freshScanner();
    el.formats = ['qr_code']; el.continuous = true;
    await raf2();
    const seen = [];
    el.addEventListener('o-scan', e => seen.push(e.detail.text));
    el.source = nextCanvas();
    el.start();
    await new Promise(resolve => el.addEventListener('o-scan', resolve, { once: true }));
    assert('continuous: still scanning right after a match', el.getAttribute('data-state') !== 'idle');
    el.source = nextCanvas(); // a different payload — the 2.5s same-code cooldown would otherwise suppress a repeat
    await wait(900);
    el.stop();
    assert('continuous: decoded more than one frame without stopping itself', seen.length >= 2, { seen });
    el.remove();
  }

  // ---- file scanning (decodeFile), independent of the camera ----
  {
    const el = freshScanner();
    await raf2();
    const canvas = Orion.barcode.canvas('FILE-SCAN-OK', { format: 'code128' });
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    const file = new File([blob], 'fixture.png', { type: 'image/png' });
    const scanPromise = new Promise(resolve => el.addEventListener('o-scan', e => resolve(e.detail), { once: true }));
    await el.decodeFile(file);
    const detail = await scanPromise;
    assert('decodeFile(File): decodes without ever starting the camera', detail.format === 'code128' && detail.text === 'FILE-SCAN-OK');
    assert('decodeFile(File): camera never ran', !el._running && !el._stream);

    // drag-and-drop delivers a File through the same path via a native 'drop' event
    const dt = new DataTransfer();
    dt.items.add(file);
    const dropPromise = new Promise(resolve => el.addEventListener('o-scan', e => resolve(e.detail), { once: true }));
    el.querySelector('.o-scanner-stage').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const dropDetail = await dropPromise;
    assert('drop onto the stage decodes the dropped file', dropDetail.text === 'FILE-SCAN-OK');
    el.remove();
  }

  // ---- fixture image round-trip via the actual /docs/fixtures/codes/ assets ----
  {
    const el = freshScanner();
    await raf2();
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = '/docs/fixtures/codes/qr-wifi.svg'; });
    const scanPromise = new Promise(resolve => el.addEventListener('o-scan', e => resolve(e.detail), { once: true }));
    await el.decodeFile(img);
    const detail = await scanPromise;
    assert('fixture file docs/fixtures/codes/qr-wifi.svg decodes', detail.format === 'qr_code' && /^WIFI:/.test(detail.text), { detail });
    el.remove();
  }

  // ---- Orion.scanner.open() modal picker: resolves with a match, and resolves null on cancel ----
  {
    const modalCanvas = document.createElement('canvas');
    modalCanvas.width = 320; modalCanvas.height = 320;
    const mctx = modalCanvas.getContext('2d');
    mctx.fillStyle = '#fff'; mctx.fillRect(0, 0, 320, 320);
    mctx.drawImage(Orion.qr.canvas('Modal picker fixture', { size: 300, margin: 2, ecc: 'Q' }), 10, 10);
    const modalStream = modalCanvas.captureStream ? modalCanvas.captureStream(10) : null;
    if (modalStream) {
      md.getUserMedia = async () => modalStream;
      const result = await Orion.scanner.open({ formats: ['qr_code'], title: 'Eval test scan' });
      assert('Orion.scanner.open() resolves with the decoded result', !!result && result.text === 'Modal picker fixture' && result.format === 'qr_code');
      assert('Orion.scanner.open() closes its dialog after resolving', !document.querySelector('.o-scanner-modal'));

      md.getUserMedia = async () => { const e = new Error('denied'); e.name = 'NotAllowedError'; throw e; };
      const openPromise = Orion.scanner.open({ formats: ['qr_code'] });
      await wait(200);
      const closeBtn = document.querySelector('.o-scanner-modal-close');
      assert('Orion.scanner.open(): a close button is present in the DOM (portaled to <body>)', !!closeBtn);
      closeBtn && closeBtn.click();
      const cancelled = await openPromise;
      assert('Orion.scanner.open() resolves null when closed without a match', cancelled === null);
    } else {
      assert('Orion.scanner.open() (skipped: canvas.captureStream unsupported)', true);
    }
  }

  // ---- keyboard: toolbar controls are real, labelled, natively-focusable elements ----
  {
    const el = freshScanner();
    el.cameraSelect = true;
    await raf2();
    md.enumerateDevices = async () => [
      { kind: 'videoinput', deviceId: 'a', label: 'Camera A' },
      { kind: 'videoinput', deviceId: 'b', label: 'Camera B' },
    ];
    md.getUserMedia = async () => { const e = new Error('no camera in this harness'); e.name = 'NotFoundError'; throw e; };
    await el._refreshDevices();
    const upload = el.querySelector('.o-scanner-toolbar button[aria-label]:not([hidden])');
    assert('upload button: real <button>, has an aria-label, is in the tab order', upload instanceof HTMLButtonElement && upload.tabIndex !== -1 && !!upload.getAttribute('aria-label'));
    upload.focus();
    assert('upload button: reachable via focus() (Tab order)', document.activeElement === upload);
    const select = el.querySelector('.o-scanner-select');
    assert('camera-select: a real <select>, not hidden once there are 2+ cameras', select instanceof HTMLSelectElement && !select.hidden && select.options.length === 2);
    select.focus();
    assert('camera-select: reachable via focus()', document.activeElement === select);
    el.remove();
  }

  md.getUserMedia = realGetUserMedia;
  md.enumerateDevices = realEnumerate;

  const bad = results.filter(r => !r.ok);
  return { ok: bad.length === 0, count: results.length, bad, results };
})();
