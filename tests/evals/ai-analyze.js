/* ai-analyze.js — Orion.ai.analyze() returns the documented { summary, keyPoints, entities, fields, raw } shape
 * for plain text, and rejects with the right error code for a PDF Blob (unsupported in a zero-dependency build)
 * and an oversized Blob, while a plain-text Blob resolves normally. Mock provider only.
 *   node build/check.mjs docs/components/ai-tools.html --bundle=.tmp/ai/orion.js "--eval=@tests/evals/ai-analyze.js"
 */
(async () => {
  Orion.ai.configure({ provider: Orion.ai.mock({
    latency: 15, speed: 3,
    responses: (text, ctx) => (!ctx.task && /analyze documents/.test(ctx.system || ''))
      ? JSON.stringify({
          summary: 'A customer reports a delayed order and asks for a new delivery date.',
          keyPoints: ['Order #48213 is late', 'Expected before the 30th'],
          entities: [{ name: 'Order #48213', type: 'reference' }],
          fields: {},
        })
      : undefined,
  }) });

  const textEl = document.getElementById('doc-text');
  if (!textEl) return { ok: false, error: 'no #doc-text on the page' };

  const r = await Orion.ai.analyze(textEl.value);
  const shapeOk = typeof r.summary === 'string' && r.summary.length > 0
    && Array.isArray(r.keyPoints) && r.keyPoints.length > 0
    && Array.isArray(r.entities) && r.entities.length > 0 && 'name' in r.entities[0] && 'type' in r.entities[0]
    && typeof r.fields === 'object' && r.fields !== null
    && typeof r.raw === 'string' && r.raw.length > 0;

  let pdfCode = null;
  try { await Orion.ai.analyze(new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' })); } catch (e) { pdfCode = e.code; }

  let bigCode = null;
  try { await Orion.ai.analyze(new Blob([new Uint8Array(6_000_000)], { type: 'text/plain' })); } catch (e) { bigCode = e.code; }

  const textBlob = new Blob(['Order #48213 shipped to Jane Doe.'], { type: 'text/plain' });
  const rBlob = await Orion.ai.analyze(textBlob);
  const blobOk = typeof rBlob.summary === 'string' && rBlob.summary.length > 0;

  const ok = shapeOk && pdfCode === 'pdf-unsupported' && bigCode === 'too-big' && blobOk;
  return { ok, shapeOk, result: r, pdfCode, bigCode, blobOk };
})()
