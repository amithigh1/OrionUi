/* docs-gaps-importer.js — docs/components/export-import.html "Lower-level helpers — Orion.importer" demo.
 * Exercises the live demo button (autoMap + coerce) and calls Orion.importer.validate() directly to cover
 * all three documented members (autoMap, coerce, validate) with realistic data.
 *   node build/check.mjs docs/components/export-import.html --bundle=.tmp/docsgaps/orion.js "--eval=@tests/evals/docs-gaps-importer.js"
 */
(async () => {
  const btn = document.getElementById('imp-helpers-run'), out = document.getElementById('imp-helpers-out');
  if (!btn || !out) return { ok: false, error: 'demo elements not found' };
  btn.click();
  await new Promise(r => setTimeout(r, 30));
  const log = out.textContent;
  const domOk = /"E-mail":"email"/.test(log) && /"Order Total/.test(log) && /"total"/.test(log)
    && /not-an-email/.test(log) && /error/.test(log) && /-42\.5/.test(log);

  // Orion.importer.validate(): row-level pass, checking required/email/unique enforcement end to end.
  const columns = [
    { key: 'email', title: 'Email', type: 'email', required: true, unique: true },
    { key: 'age', title: 'Age', type: 'integer', min: 0, max: 120 },
  ];
  const mapping = { Email: 'email', Age: 'age' };
  const raw = [
    { Email: 'ada@example.com', Age: '34' },
    { Email: 'ada@example.com', Age: '200' },  // duplicate email + out-of-range age
    { Email: '', Age: '40' },                   // missing required email
  ];
  const result = await Orion.importer.validate(raw, mapping, columns);
  const row0ok = result.rows[0].email === 'ada@example.com' && result.rows[0].age === 34 && !result.invalid.has(0);
  const row1flagged = result.invalid.has(1) && !!result.errors.get(1);
  const row2flagged = result.invalid.has(2) && !!result.errors.get(2)?.email;
  const validateOk = row0ok && row1flagged && row2flagged;

  const ok = domOk && validateOk;
  return { ok, domOk, validateOk, row0: result.rows[0], errors1: result.errors.get(1), errors2: result.errors.get(2) };
})()
