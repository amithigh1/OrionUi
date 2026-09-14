/* docs-gaps-markdown.js — docs/components/rich-text-editor.html "Standalone Markdown <-> HTML — Orion.markdown" demo.
 * Verifies the standalone service (not the <o-editor> methods): toHTML() renders real markup, and fromHTML()
 * round-trips it back to equivalent Markdown, entirely outside of any editor instance.
 *   node build/check.mjs docs/components/rich-text-editor.html --bundle=.tmp/docsgaps/orion.js "--eval=@tests/evals/docs-gaps-markdown.js"
 */
(async () => {
  const out = document.getElementById('md-svc-out');
  if (!out) return { ok: false, error: 'no #md-svc-out on page' };

  // The demo self-renders on load; confirm the initial sample converted correctly.
  const initialOk = !!out.querySelector('h2') && /Round-trip/.test(out.querySelector('h2').textContent)
    && !!out.querySelector('strong') && !!out.querySelector('li');

  // Type new Markdown and re-render via the toHTML() button.
  const ta = document.getElementById('md-svc-in');
  ta.value = '# Fresh heading\n\nA **bold** word and a [link](https://example.com).';
  document.getElementById('md-svc-render').click();
  await new Promise(r => setTimeout(r, 60));
  const h1 = out.querySelector('h1');
  const freshOk = !!h1 && /Fresh heading/.test(h1.textContent) && !!out.querySelector('a[href="https://example.com"]') && !!out.querySelector('strong');

  // Convert the rendered (sanitized) HTML back to Markdown via fromHTML().
  document.getElementById('md-svc-back').click();
  await new Promise(r => setTimeout(r, 60));
  const log = document.getElementById('md-svc-log').textContent;
  const roundTripOk = /# Fresh heading/.test(log) && /\*\*bold\*\*/.test(log) && /\[link\]\(https:\/\/example\.com\)/.test(log);

  const ok = initialOk && freshOk && roundTripOk;
  return { ok, initialOk, freshOk, roundTripOk, log };
})()
