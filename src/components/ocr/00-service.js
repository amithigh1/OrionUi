/* ============================================================================
 * Orion.ocr — OCR is an adapter contract. This library ships NO third-party OCR code.
 *
 *   Orion.ocr.use(engine)                    register + activate. engine: { name, recognize(imageSource, opts) }
 *   Orion.ocr.register(engine)               register without activating
 *   Orion.ocr.recognize(imageSource, opts)   opts: { engine?, lang?, region?, onProgress?, signal? } -> Promise<Result>
 *   Orion.ocr.fixture({ fixtures?, latency? })        built-in, offline, deterministic engine — see docs/fixtures/ocr/
 *   Orion.ocr.shapeDetection()               uses the browser's native TextDetector when available (no adapter needed)
 *   Orion.ocr.tesseract({ scriptUrl, … })    documented in 20-adapters.js — developer opt-in, nothing fetched by default
 *
 * Result: { text, confidence, words?: [{ text, bbox: {x,y,width,height}, confidence }] }
 * `region` (on every engine call): fractional { x, y, width, height } in 0..1 of the image's natural size.
 * Nothing here is active until you call Orion.ocr.use(...) — same philosophy as Orion.ai (bring your own engine).
 * ========================================================================== */
i18n.add('en', {
  ocr: {
    noEngine: 'No OCR engine configured — call Orion.ocr.use(Orion.ocr.fixture()) or your own adapter.',
    noFixtureMatch: '(fixture engine: no matching sample image — add data-ocr-fixture="id" to the source image, or use one of the bundled docs/fixtures/ocr/ images)',
  },
});

const __ocrEngines = new Map();
let __ocrActive = null;

function __ocrValidate(engine) {
  if (!engine || !isStr(engine.name) || !engine.name.trim()) throw new Error('[Orion] Orion.ocr: engine.name (a non-empty string) is required.');
  if (!isFn(engine.recognize)) throw new Error(`[Orion] Orion.ocr: engine.recognize(imageSource, opts) must be a function ("${engine.name}").`);
  return engine;
}
function __ocrAbort() { try { return new DOMException('The operation was aborted.', 'AbortError'); } catch { const e = new Error('Aborted'); e.name = 'AbortError'; return e; } }
function __ocrSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(__ocrAbort()); return; }
    const tm = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(tm); reject(__ocrAbort()); }, { once: true });
  });
}
/** Crop `imageSource` to a fractional `region` on an offscreen canvas (used by real adapters that need pixels). */
async function ocrCropToCanvas(imageSource, region) {
  const iw = imageSource.naturalWidth || imageSource.videoWidth || imageSource.width, ih = imageSource.naturalHeight || imageSource.videoHeight || imageSource.height;
  const sx = clamp((region.x || 0) * iw, 0, iw), sy = clamp((region.y || 0) * ih, 0, ih);
  const sw = clamp((region.width ?? 1) * iw, 1, iw - sx), sh = clamp((region.height ?? 1) * ih, 1, ih - sy);
  const c = doc.createElement('canvas');
  c.width = Math.max(1, Math.round(sw)); c.height = Math.max(1, Math.round(sh));
  c.getContext('2d').drawImage(imageSource, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

const ocr = {
  use(engine) { __ocrValidate(engine); __ocrEngines.set(engine.name, engine); __ocrActive = engine.name; return ocr; },
  register(engine) { __ocrValidate(engine); __ocrEngines.set(engine.name, engine); return ocr; },
  get(name) { return __ocrEngines.get(name) || null; },
  list() { return [...__ocrEngines.keys()]; },
  get active() { return __ocrActive; },
  setActive(name) { if (!__ocrEngines.has(name)) throw new Error(`[Orion] Orion.ocr: unknown engine "${name}" — register it first.`); __ocrActive = name; return ocr; },
  /** recognize(imageSource, { engine, lang, region, onProgress, signal }) -> Promise<{text, confidence, words?}> */
  recognize(imageSource, opts = {}) {
    const name = opts.engine || __ocrActive;
    const eng = name && __ocrEngines.get(name);
    if (!eng) return Promise.reject(new Error('[Orion] ' + t('ocr.noEngine')));
    const { engine, ...rest } = opts;
    return eng.recognize(imageSource, rest);
  },
};
O.ocr = ocr;

/* ── fixture engine: canned text for known sample images, fully offline & deterministic ─────── */
const OCR_FIXTURES = [
  {
    id: 'invoice', width: 800, height: 600, confidence: 0.97,
    text: 'INVOICE #1042\nBill To: Aisha Rahman\nDate: 2026-03-14\n\nItem              Qty   Price\nWireless Mouse     2    $24.00\nUSB-C Cable        3    $9.00\n\nTotal: $75.00\nThank you for your business!',
    words: [
      { text: 'INVOICE', bbox: { x: 40, y: 36, width: 150, height: 30 }, confidence: 0.99 },
      { text: '#1042', bbox: { x: 200, y: 36, width: 90, height: 30 }, confidence: 0.98 },
      { text: 'Bill', bbox: { x: 40, y: 90, width: 50, height: 22 }, confidence: 0.95 },
      { text: 'To:', bbox: { x: 96, y: 90, width: 36, height: 22 }, confidence: 0.95 },
      { text: 'Aisha', bbox: { x: 138, y: 90, width: 62, height: 22 }, confidence: 0.94 },
      { text: 'Rahman', bbox: { x: 204, y: 90, width: 80, height: 22 }, confidence: 0.94 },
      { text: 'Wireless', bbox: { x: 40, y: 220, width: 100, height: 22 }, confidence: 0.93 },
      { text: 'Mouse', bbox: { x: 146, y: 220, width: 70, height: 22 }, confidence: 0.93 },
      { text: 'Total:', bbox: { x: 40, y: 500, width: 70, height: 26 }, confidence: 0.96 },
      { text: '$75.00', bbox: { x: 120, y: 500, width: 90, height: 26 }, confidence: 0.95 },
    ],
  },
  {
    id: 'receipt', width: 400, height: 700, confidence: 0.94,
    text: 'CORNER MARKET\n123 Main St\n\nMilk          3.49\nBread         2.99\nEggs          4.20\n\nSubtotal     10.68\nTax           0.85\nTotal        11.53\n\nThank you!',
    words: [
      { text: 'CORNER', bbox: { x: 60, y: 30, width: 110, height: 28 }, confidence: 0.97 },
      { text: 'MARKET', bbox: { x: 178, y: 30, width: 120, height: 28 }, confidence: 0.97 },
      { text: 'Milk', bbox: { x: 30, y: 160, width: 50, height: 22 }, confidence: 0.9 },
      { text: '3.49', bbox: { x: 300, y: 160, width: 60, height: 22 }, confidence: 0.9 },
      { text: 'Total', bbox: { x: 30, y: 560, width: 70, height: 24 }, confidence: 0.92 },
      { text: '11.53', bbox: { x: 290, y: 560, width: 70, height: 24 }, confidence: 0.92 },
    ],
  },
  {
    id: 'card', width: 350, height: 200, confidence: 0.9,
    text: 'Jordan Lee\nSenior Designer\n\nAurora Studio\njordan@aurora.studio\n+1 555 0182',
    words: [
      { text: 'Jordan', bbox: { x: 20, y: 22, width: 80, height: 24 }, confidence: 0.93 },
      { text: 'Lee', bbox: { x: 106, y: 22, width: 50, height: 24 }, confidence: 0.93 },
      { text: 'Senior', bbox: { x: 20, y: 52, width: 66, height: 20 }, confidence: 0.88 },
      { text: 'Designer', bbox: { x: 90, y: 52, width: 88, height: 20 }, confidence: 0.88 },
      { text: 'jordan@aurora.studio', bbox: { x: 20, y: 128, width: 220, height: 20 }, confidence: 0.85 },
    ],
  },
];
function __ocrMatchFixture(imageSource, fixtures) {
  let id = null;
  if (isStr(imageSource)) id = imageSource;
  else if (imageSource && imageSource.nodeType === 1) id = imageSource.dataset?.ocrFixture || imageSource.getAttribute?.('data-ocr-fixture') || null;
  else if (isObj(imageSource)) id = imageSource.ocrFixture || null;
  if (id) { const byId = fixtures.find(f => f.id === id); if (byId) return byId; }
  const w = imageSource?.naturalWidth ?? imageSource?.width, h = imageSource?.naturalHeight ?? imageSource?.height;
  if (isNum(w) && isNum(h)) { const bySize = fixtures.find(f => f.width === w && f.height === h); if (bySize) return bySize; }
  return { id: '_unknown', width: w || 0, height: h || 0, confidence: 0.5, text: t('ocr.noFixtureMatch'), words: [] };
}
function __ocrBoxHit(bbox, region, fw, fh) {
  if (!bbox || !fw || !fh) return false;
  const bx = { x: bbox.x / fw, y: bbox.y / fh, w: bbox.width / fw, h: bbox.height / fh };
  return bx.x < region.x + region.width && bx.x + bx.w > region.x && bx.y < region.y + region.height && bx.y + bx.h > region.y;
}
/**
 * Orion.ocr.fixture({ fixtures, latency }) — canned, offline engine used by docs/tests. Matches the image by
 * `data-ocr-fixture="id"` (or `.ocrFixture` on a plain object source) first, then by exact natural width/height
 * against the bundled samples in docs/fixtures/ocr/. `region` (fractional) narrows the returned text/words to
 * whatever bundled words intersect it, so selecting a region genuinely changes the result.
 */
function ocrFixtureEngine(opts = {}) {
  const fixtures = [...OCR_FIXTURES, ...(opts.fixtures || [])];
  const latency = opts.latency ?? 120;
  return {
    name: opts.name || 'fixture',
    async recognize(imageSource, { region, onProgress, signal } = {}) {
      const fx = __ocrMatchFixture(imageSource, fixtures);
      for (const p of [0, 0.4, 0.75]) {
        if (signal?.aborted) throw __ocrAbort();
        onProgress?.({ status: 'recognizing', progress: p });
        await __ocrSleep(latency, signal);
      }
      if (signal?.aborted) throw __ocrAbort();
      let text = fx.text, confidence = fx.confidence, words = (fx.words || []).map(w => ({ ...w }));
      if (region && (region.x || region.y || region.width < 1 || region.height < 1)) {
        const r = { x: region.x || 0, y: region.y || 0, width: region.width ?? 1, height: region.height ?? 1 };
        words = words.filter(w => __ocrBoxHit(w.bbox, r, fx.width, fx.height));
        text = words.length ? words.map(w => w.text).join(' ') : '';
        confidence = words.length ? words.reduce((s, w) => s + (w.confidence || 0), 0) / words.length : fx.confidence * 0.5;
      }
      onProgress?.({ status: 'done', progress: 1 });
      return { text, confidence, words, fixtureId: fx.id };
    },
  };
}
ocr.fixture = ocrFixtureEngine;
ocr.fixtures = OCR_FIXTURES;

/**
 * Orion.ocr.shapeDetection() — uses the browser's native `TextDetector` (Shape Detection API) when present.
 * Zero third-party code (a built-in browser API, feature-detected); throws a clear error where unsupported —
 * most browsers today, so treat this as a progressive enhancement, not something to rely on.
 */
function ocrShapeDetectionEngine(opts = {}) {
  return {
    name: opts.name || 'shape-detection',
    async recognize(imageSource, { region, onProgress, signal } = {}) {
      if (!isBrowser || !win.TextDetector) throw new Error('[Orion] Orion.ocr.shapeDetection: the TextDetector API is not supported in this browser.');
      onProgress?.({ status: 'recognizing', progress: 0 });
      const source = region ? await ocrCropToCanvas(imageSource, region) : imageSource;
      if (signal?.aborted) throw __ocrAbort();
      const detector = new win.TextDetector();
      const results = await detector.detect(source);
      if (signal?.aborted) throw __ocrAbort();
      onProgress?.({ status: 'done', progress: 1 });
      const words = results.map(r => ({ text: r.rawValue, confidence: 1, bbox: { x: r.boundingBox.x, y: r.boundingBox.y, width: r.boundingBox.width, height: r.boundingBox.height } }));
      return { text: words.map(w => w.text).join('\n'), confidence: words.length ? 1 : 0, words };
    },
  };
}
ocr.shapeDetection = ocrShapeDetectionEngine;
