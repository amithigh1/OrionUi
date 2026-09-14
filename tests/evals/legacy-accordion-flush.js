/* legacy-accordion-flush.js — salvaged from .tmp/accordion-flush-eval.js (docs/components/accordion.html).
 * The `flush` boolean attribute correctly sets the `flushed` prop and `.is-flush` class on both
 * <o-accordion> and <o-faq>, and setting `flushed = false` afterwards updates the class.
 *
 * FIX vs the original script: it also expected setting `acc.flushed = false` to remove the `flush`
 * attribute. src/components/accordion/accordion.js defines `flushed: { type: Boolean, attr: 'flush' }`
 * with no `reflect: true` — this prop is intentionally one-way (attribute -> prop only, matching many
 * other Orion props); the class stays in sync via a separate render-time `classList.toggle`, but the
 * attribute is never written back. Kept as a diagnostic field, dropped from `ok`.
 */
(async () => {
  const out = {};
  const acc = document.createElement('o-accordion');
  acc.setAttribute('flush', '');
  acc.innerHTML = '<o-accordion-item heading="A">Body</o-accordion-item>';
  document.body.appendChild(acc);
  await new Promise(r => setTimeout(r, 20));
  out.flushedPropFromAttr = acc.flushed;
  out.classApplied = acc.classList.contains('is-flush');
  out.flushMethodStillWorks = typeof acc.flush === 'function';
  acc.flushed = false;
  await new Promise(r => setTimeout(r, 20));
  out.classRemovedAfterUnset = !acc.classList.contains('is-flush');
  out.attrRemovedAfterUnset = !acc.hasAttribute('flush');
  acc.remove();

  const faq = document.createElement('o-faq');
  faq.setAttribute('flush', '');
  faq.innerHTML = '<o-accordion-item heading="Q">A</o-accordion-item>';
  document.body.appendChild(faq);
  await new Promise(r => setTimeout(r, 20));
  out.faqFlushedFromAttr = faq.flushed;
  out.faqClassApplied = faq.classList.contains('is-flush');
  faq.remove();

  const ok = out.flushedPropFromAttr === true && out.classApplied && out.flushMethodStillWorks
    && out.classRemovedAfterUnset
    && out.faqFlushedFromAttr === true && out.faqClassApplied;
  return { ok, ...out };
})()
