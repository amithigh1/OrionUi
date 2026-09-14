(async () => {
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const r = {};

  Orion.ocr.use(Orion.ocr.fixture());
  const invoiceFixture = Orion.ocr.fixtures.find(f => f.id === 'invoice');

  const el = document.createElement('o-ocr');
  document.body.appendChild(el);
  await sleep(30);

  // ── round trip: load a known fixture image -> recognize -> text equals the canned text ──
  const progress = [];
  el.addEventListener('o-progress', e => progress.push({ ...e.detail }));
  el.load('../fixtures/ocr/invoice.svg', 'invoice');
  await new Promise(res => el.addEventListener('o-load', res, { once: true }));
  const res1 = await el.recognize();
  r.textMatchesFixture = res1 && res1.text === invoiceFixture.text;
  r.confidenceMatchesFixture = res1 && res1.confidence === invoiceFixture.confidence;
  r.resultShownInTextarea = el.querySelector('.o-ocr-text').value === invoiceFixture.text;
  r.confidenceBadgeShows97 = el.querySelector('.o-badge').textContent.includes('97');

  // ── progress events fired in order ──
  r.progressCount = progress.length;
  r.progressStatusSequence = progress.map(p => p.status).join(',');
  r.progressEndsAtDone = progress.length > 0 && progress[progress.length - 1].status === 'done' && progress[progress.length - 1].progress === 1;
  r.progressNonDecreasing = progress.every((p, i) => i === 0 || p.progress >= progress[i - 1].progress);

  // ── region selection changes the result ──
  const canvas = el.querySelector('.o-ocr-canvas');
  const rect = canvas.getBoundingClientRect();
  const pt = (fx, fy) => ({ clientX: rect.left + rect.width * fx, clientY: rect.top + rect.height * fy });
  const down = pt(0.02, 0.80), up = pt(0.30, 0.95);
  canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: down.clientX, clientY: down.clientY, button: 0 }));
  canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: up.clientX, clientY: up.clientY }));
  canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: up.clientX, clientY: up.clientY }));
  await sleep(50);
  r.regionSet = !!el.region;
  // a region change with an existing result auto-recognizes
  await sleep(600);
  r.textNarrowedByRegion = el.result && el.result.text === 'Total: $75.00' && el.result.text !== invoiceFixture.text;
  r.clearRegionButtonVisible = !el.querySelector('.o-ocr-toolbar button:nth-child(4)').hidden;

  el.clearRegion();
  await sleep(500);
  r.regionClearedGoesBackToFullText = el.result && el.result.text === invoiceFixture.text;

  // ── abort via signal ──
  const p = el.recognize();
  await sleep(10);
  el.abort();
  const abortedResult = await p;
  r.abortReturnsNull = abortedResult === null;
  r.notBusyAfterAbort = el.busy === false;

  el.remove();

  r.ok = r.textMatchesFixture && r.confidenceMatchesFixture && r.resultShownInTextarea && r.confidenceBadgeShows97
    && r.progressCount >= 4 && r.progressEndsAtDone && r.progressNonDecreasing
    && r.regionSet && r.textNarrowedByRegion && r.clearRegionButtonVisible && r.regionClearedGoesBackToFullText
    && r.abortReturnsNull && r.notBusyAfterAbort;
  return r;
})()
