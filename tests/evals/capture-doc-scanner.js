/* tests/evals/capture-doc-scanner.js — run against docs/components/document-scanner.html
 * Proves <o-doc-scanner>: loadImage() -> corner adjust -> perspective-cropped output dimensions, filters actually
 * change pixel data, multi-page add/remove/reorder, and export (PDF via Orion.pdf when present, else images).
 */
(async () => {
  const results = [];
  const assert = (name, cond, extra) => results.push({ name, ok: !!cond, extra });

  function freshScanner() {
    const el = document.createElement('o-doc-scanner');
    el.style.cssText = 'position:fixed;inset-inline-start:-9999px;top:-9999px';
    document.body.appendChild(el);
    return el;
  }
  // A synthetic "photo of a document on a desk": a light, rotated rectangle on a dark background, with real
  // contrast at the edges so the Sobel-based auto-detector has something to find.
  function fixtureDocPhoto(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#202020'; ctx.fillRect(0, 0, w, h);
    const m = Math.min(w, h) * 0.12;
    ctx.fillStyle = '#f5f5f0';
    ctx.beginPath();
    ctx.moveTo(m, m); ctx.lineTo(w - m, m * 1.4); ctx.lineTo(w - m * 1.3, h - m); ctx.lineTo(m * 1.2, h - m * 1.2);
    ctx.closePath(); ctx.fill();
    return c;
  }

  const el = freshScanner();

  // ---- loadImage() -> auto-detected corners -> applyCorners() perspective-crops ----
  await el.loadImage(fixtureDocPhoto(480, 360));
  assert('loadImage(): enters edit state with 4 auto-detected corners', el._state === 'edit' && Array.isArray(el.corners) && el.corners.length === 4);
  const scanPromise = new Promise(resolve => el.addEventListener('o-scan', e => resolve(e.detail), { once: true }));
  const page0 = await el.applyCorners();
  const detail0 = await scanPromise;
  assert('applyCorners(): returns a processed canvas smaller than the raw frame (perspective-cropped)', page0 instanceof HTMLCanvasElement && page0.width > 0 && page0.height > 0 && (page0.width < 480 || page0.height < 360), { w: page0.width, h: page0.height });
  assert('applyCorners(): o-scan fires with the new page and a 1-page session', detail0.pages.length === 1 && detail0.index === 0);
  assert('pages: exposes a read-only array with the raw ingredients', el.pages.length === 1 && el.pages[0].corners.length === 4 && el.pages[0].filter === 'original');

  // ---- filters actually change pixel data ----
  {
    const before = el._finalCanvas(el.pages[0]).getContext('2d').getImageData(0, 0, 4, 4).data.slice();
    el.setFilter(0, 'bw');
    assert('setFilter(): recorded on the page', el.pages[0].filter === 'bw');
    const after = el._finalCanvas(el.pages[0]).getContext('2d').getImageData(0, 0, 4, 4).data;
    let changed = false;
    for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) { changed = true; break; }
    assert('setFilter("bw"): pixel data actually changes vs. "original"', changed);
    el.setFilter(0, 'original');
  }

  // ---- rotate ----
  {
    const before = el._finalCanvas(el.pages[0]);
    el.rotate(0, 90);
    const after = el._finalCanvas(el.pages[0]);
    assert('rotate(90): swaps width/height', after.width === before.height && after.height === before.width);
    el.rotate(0, -90); // restore
  }

  // ---- multi-page: add, reorder, remove ----
  await el.loadImage(fixtureDocPhoto(400, 300));
  el.autoDetect();
  await el.applyCorners();
  await el.loadImage(fixtureDocPhoto(300, 400));
  el.autoDetect();
  await el.applyCorners();
  assert('multi-page: 3 pages after two more applyCorners()', el.pages.length === 3);
  const firstCanvasBefore = el.pages[0].processed;
  el.reorderPage(0, 2);
  assert('reorderPage(0,2): moves the first page to the end', el.pages[2].processed === firstCanvasBefore);
  el.removePage(1);
  assert('removePage(1): drops to 2 pages', el.pages.length === 2);
  el.reorderPage(0, 1);
  assert('reorderPage(0,1): swaps the remaining two back', el.pages[0].processed === firstCanvasBefore);

  // ---- export: PDF via Orion.pdf when present, else per-page images ----
  // exportPDF()/exportImages() call the core `download()` helper directly (not through `Orion.download`), so it
  // has to be intercepted at the <a download> click rather than by reassigning Orion.download.
  {
    const clicks = [];
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.hasAttribute('download')) { clicks.push({ href: this.href, name: this.download }); return; }
      return realClick.call(this);
    };
    try {
      if (Orion.PDF) {
        const blob = await el.exportPDF();
        assert('exportPDF(): Orion.pdf present -> resolves a Blob', blob instanceof Blob && blob.size > 0, { size: blob && blob.size });
        assert('exportPDF(): triggers exactly one download (the PDF)', clicks.length === 1 && /\.pdf$/.test(clicks[0].name));
        const downloadedBlob = await fetch(clicks[0].href).then(r => r.blob());
        const head = new Uint8Array(await downloadedBlob.slice(0, 5).arrayBuffer());
        const magic = String.fromCharCode(...head);
        assert('exportPDF(): the downloaded blob starts with the %PDF magic bytes', magic === '%PDF-', { magic });
      } else {
        const count = await el.exportImages();
        assert('exportImages() fallback (no Orion.pdf in this bundle): downloads one file per page', clicks.length === count && count === el.pages.length);
      }
    } finally {
      HTMLAnchorElement.prototype.click = realClick;
    }
  }

  // ---- clear() ----
  el.clear();
  assert('clear(): empties the session', el.pages.length === 0);

  el.remove();

  const bad = results.filter(r => !r.ok);
  return { ok: bad.length === 0, count: results.length, bad, results };
})();
