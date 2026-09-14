/* legacy-image-crop.js — salvaged from .tmp/eval-crop.js (docs/components/image-editor.html).
 * <o-cropper>: setAspect(1) produces a square crop rect, and toBlob() yields a PNG matching that size.
 */
(async () => {
  const c = document.querySelector('#crop3');
  let tries = 0;
  while (!c.ready && tries < 100) { await new Promise(r => setTimeout(r, 50)); tries++; }
  c.setAspect(1);
  await new Promise(r => setTimeout(r, 250));
  const data1 = c.getData();
  const blob = await c.toBlob('image/png');
  const bmp = await createImageBitmap(blob);
  const squareAspect = Math.abs(data1.width - data1.height) < 1;
  const matchesData = Math.abs(bmp.width - Math.round(data1.width)) <= 1 && Math.abs(bmp.height - Math.round(data1.height)) <= 1;
  const result = { ready: c.ready, squareAspect, blobType: blob.type, blobSize: blob.size, canvasW: bmp.width, canvasH: bmp.height, matchesData };
  bmp.close();
  const ok = result.ready && result.squareAspect && result.blobType === 'image/png' && result.blobSize > 0 && result.matchesData;
  return { ok, ...result };
})()
