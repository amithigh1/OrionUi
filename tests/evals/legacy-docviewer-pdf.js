/* legacy-docviewer-pdf.js — salvaged from .tmp/eval-pdf.js (docs/components/document-viewer.html).
 * <o-docviewer> PDF rendering: shows an iframe with a src (not the "unsupported" fallback card), no error state.
 */
(async () => {
  const dv = document.querySelector('o-docviewer[filename="Q3 report.pdf"]');
  let tries = 0;
  while (dv.classList.contains('is-loading') && tries < 100) { await new Promise(r => setTimeout(r, 50)); tries++; }
  await new Promise(r => setTimeout(r, 300));
  const frame = dv.querySelector('.o-docviewer-frame');
  const fallback = dv.querySelector('.o-empty');
  const result = {
    kind: dv.kind,
    hasFrame: !!frame,
    frameSrc: frame ? frame.src : null,
    hasFallbackCard: !!fallback,
    isError: dv.classList.contains('is-error'),
  };
  const ok = result.kind === 'pdf' && result.hasFrame && !!result.frameSrc && !result.hasFallbackCard && !result.isError;
  return { ok, ...result };
})()
