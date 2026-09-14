(async () => {
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const r = {};

  // ── engine registration validation ──
  try { Orion.ocr.use({}); r.missingNameThrew = false; }
  catch (e) { r.missingNameThrew = /name/i.test(e.message); }

  try { Orion.ocr.use({ name: 'incomplete' }); r.missingRecognizeThrew = false; }
  catch (e) { r.missingRecognizeThrew = /recognize/i.test(e.message); }

  const before = Orion.ocr.list().length;
  Orion.ocr.register({ name: 'eval-echo', recognize: async () => ({ text: 'echo', confidence: 1 }) });
  r.registeredWithoutActivating = Orion.ocr.list().length === before + 1 && Orion.ocr.active !== 'eval-echo';
  Orion.ocr.use({ name: 'eval-echo2', recognize: async () => ({ text: 'echo2', confidence: 1 }) });
  r.useActivates = Orion.ocr.active === 'eval-echo2';

  let rejected = false;
  try { await Orion.ocr.recognize('x.png', { engine: 'totally-unknown-engine' }); }
  catch { rejected = true; }
  r.recognizeRejectsUnknownEngine = rejected;

  // ── copy / download actions ──
  Orion.ocr.use(Orion.ocr.fixture());
  const el = document.createElement('o-ocr');
  document.body.appendChild(el);
  await sleep(30);
  el.load('../fixtures/ocr/business-card.svg', 'card');
  await new Promise(res => el.addEventListener('o-load', res, { once: true }));
  await el.recognize();

  let copiedText = null;
  const origClipboard = navigator.clipboard;
  try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { copiedText = t; } }, configurable: true }); } catch {}
  let copyDetail = null;
  el.addEventListener('o-copy', e => { copyDetail = e.detail; });
  el.querySelector('[aria-label="Copy text"]').click();
  await sleep(50);
  r.copyWroteToClipboard = copiedText === el.result.text;
  r.copyEventFired = copyDetail && copyDetail.text === el.result.text;
  try { Object.defineProperty(navigator, 'clipboard', { value: origClipboard, configurable: true }); } catch {}

  let downloadDetail = null;
  el.addEventListener('o-download', e => { downloadDetail = e.detail; });
  el.querySelector('[aria-label="Download text"]').click();
  await sleep(50);
  r.downloadEventFired = downloadDetail && downloadDetail.text === el.result.text && downloadDetail.text.length > 0;

  el.remove();

  r.ok = r.missingNameThrew && r.missingRecognizeThrew && r.registeredWithoutActivating && r.useActivates
    && r.recognizeRejectsUnknownEngine && r.copyWroteToClipboard && r.copyEventFired && r.downloadEventFired;
  return r;
})()
