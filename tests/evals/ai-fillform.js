/* ai-fillform.js — Orion.ai.fillForm() proposes values in a panel and leaves the form untouched until the
 * user acts: Apply writes the checked proposals via Orion.fill(), Cancel discards them entirely. Mock provider
 * only (its extract-task branch fabricates plausible values from the field name/type/description).
 *   node build/check.mjs docs/components/ai-tools.html --bundle=.tmp/ai/orion.js "--eval=@tests/evals/ai-fillform.js"
 */
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  Orion.ai.configure({ provider: Orion.ai.mock({ latency: 15, speed: 3 }) });

  const form = document.getElementById('fill-form');
  const textEl = document.getElementById('fill-text');
  const fields = ['f-name', 'f-email', 'f-phone', 'f-address', 'f-amount'].map(id => document.getElementById(id));
  if (!form || !textEl || fields.some(f => !f)) return { ok: false, error: 'fill-form demo elements missing' };

  const emptyAll = () => fields.every(f => f.value === '');
  form.reset();

  /* --- Apply path --- */
  const p1 = Orion.ai.fillForm(form, textEl.value);
  await sleep(400);
  const panel1 = document.querySelector('.o-ai-fill-panel');
  const rowsBeforeApply = panel1 ? panel1.querySelectorAll('.o-ai-fill-row').length : 0;
  const untouchedBeforeApply = emptyAll();
  const applyBtn = panel1 && panel1.querySelector('[data-action="apply"]');
  applyBtn && applyBtn.click();
  const r1 = await p1;
  const filledAfterApply = !emptyAll();
  const panelGoneAfterApply = !document.querySelector('.o-ai-fill-panel');

  /* --- Cancel path --- */
  form.reset();
  const p2 = Orion.ai.fillForm(form, textEl.value);
  await sleep(400);
  const panel2 = document.querySelector('.o-ai-fill-panel');
  const cancelBtn = panel2 && panel2.querySelector('[data-action="discard"]');
  cancelBtn && cancelBtn.click();
  const r2 = await p2;
  const stillEmptyAfterCancel = emptyAll();

  const ok = rowsBeforeApply > 0 && untouchedBeforeApply && r1.applied === true && filledAfterApply && panelGoneAfterApply
    && r2.applied === false && stillEmptyAfterCancel;
  return {
    ok, rowsBeforeApply, untouchedBeforeApply, applied: r1.applied, filledAfterApply, panelGoneAfterApply,
    values: r1.values, cancelledApplied: r2.applied, stillEmptyAfterCancel,
  };
})()
