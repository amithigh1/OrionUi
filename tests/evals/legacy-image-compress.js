/* legacy-image-compress.js — salvaged from .tmp/eval-compress.js (docs/components/image-editor.html).
 * Orion.image.compress() shrinks a fixture photo under a maxSizeKB budget.
 */
(async () => {
  const src = '../fixtures/media/photo-mountains.jpg';
  const before = await fetch(src).then(r => r.blob());
  const blob = await Orion.image.compress(src, { maxWidth: 800, maxSizeKB: 25, quality: 0.85 });
  const underLimit = blob.size <= 25 * 1024 + 512;
  const shrank = blob.size < before.size;
  const ok = underLimit && shrank;
  return { ok, beforeSize: before.size, afterSize: blob.size, report: blob.report, underLimit, shrank };
})()
