/* ============================================================================
 * Orion.ocr.tesseract({ scriptUrl, workerOptions, langPath }) — a documented, developer-opt-in adapter
 * for Tesseract.js (https://github.com/naptha/tesseract.js). Orion never ships or fetches this script:
 * nothing happens until you (a) call this factory with a `scriptUrl` YOU host (a CDN URL is fine, but
 * you choose it) and (b) call `recognize()` at least once — mirrors how `captcha/20-adapters.js` only
 * loads a vendor script once a `sitekey` is set.
 *
 *   Orion.ocr.use(Orion.ocr.tesseract({ scriptUrl: 'https://cdn.example.com/tesseract.min.js' }));
 *   await document.querySelector('o-ocr').recognize();     // now runs through real Tesseract.js
 *
 * See docs/components/ocr.html "Tesseract.js adapter" for the full walkthrough (including how to host
 * the required .traineddata language files via `workerOptions.langPath`).
 * ========================================================================== */
i18n.add('en', {
  ocr: { tesseractScriptMissing: 'Orion.ocr.tesseract(): "scriptUrl" is required — point it at a Tesseract.js build you host; nothing is fetched automatically.' },
});

function ocrTesseractEngine(cfg = {}) {
  const { scriptUrl, workerOptions = {}, langPath } = cfg;
  let workerPromise = null;
  let liveProgress = null;
  const logger = m => liveProgress?.(m);

  function getWorker() {
    if (!scriptUrl) throw new Error('[Orion] ' + t('ocr.tesseractScriptMissing'));
    if (!workerPromise) {
      workerPromise = loadScript(scriptUrl).then(() => {
        if (!win.Tesseract || !isFn(win.Tesseract.createWorker)) throw new Error('[Orion] Orion.ocr.tesseract(): the script at scriptUrl did not define window.Tesseract.');
        return win.Tesseract.createWorker({ langPath, ...workerOptions, logger });
      });
    }
    return workerPromise;
  }
  return {
    name: cfg.name || 'tesseract',
    /** recognize(imageSource, { lang, region, onProgress, signal }) */
    async recognize(imageSource, { lang = 'eng', region, onProgress, signal } = {}) {
      const worker = await getWorker();
      if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
      liveProgress = onProgress ? m => onProgress({ status: m.status, progress: m.progress ?? 0 }) : null;
      try {
        if (isFn(worker.loadLanguage)) { await worker.loadLanguage(lang); await worker.initialize(lang); }
        else if (isFn(worker.reinitialize)) await worker.reinitialize(lang);
        const source = region ? await ocrCropToCanvas(imageSource, region) : imageSource;
        const { data } = await worker.recognize(source);
        onProgress?.({ status: 'done', progress: 1 });
        return {
          text: data.text,
          confidence: (data.confidence || 0) / 100,
          words: (data.words || []).map(w => ({
            text: w.text, confidence: (w.confidence || 0) / 100,
            bbox: { x: w.bbox.x0, y: w.bbox.y0, width: w.bbox.x1 - w.bbox.x0, height: w.bbox.y1 - w.bbox.y0 },
          })),
        };
      } finally { liveProgress = null; }
    },
  };
}
O.ocr.tesseract = ocrTesseractEngine;
