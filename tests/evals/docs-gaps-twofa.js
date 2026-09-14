/* docs-gaps-twofa.js — docs/components/two-factor.html "Backup codes — Orion.twofa" demo.
 * Checks both the direct API (Orion.twofa.generateBackupCodes) and the live demo button that renders them.
 *   node build/check.mjs docs/components/two-factor.html --bundle=.tmp/docsgaps/orion.js "--eval=@tests/evals/docs-gaps-twofa.js"
 */
(async () => {
  const CODE_RE = /^[0-9A-F]{5}-[0-9A-F]{5}$/;

  // Direct API call: default count (10), correct format, no duplicates.
  const direct = Orion.twofa.generateBackupCodes();
  const directCountOk = direct.length === 10;
  const directFormatOk = direct.every(c => CODE_RE.test(c));
  const directUniqueOk = new Set(direct).size === direct.length;

  // Custom count.
  const five = Orion.twofa.generateBackupCodes(5);
  const customCountOk = five.length === 5 && five.every(c => CODE_RE.test(c));

  // The live demo button re-renders the list.
  const btn = document.getElementById('twofa-gen'), list = document.getElementById('twofa-codes');
  if (!btn || !list) return { ok: false, error: 'demo button/list not found' };
  btn.click();
  await new Promise(r => setTimeout(r, 30));
  const items = [...list.querySelectorAll('li')].map(li => li.textContent);
  const domOk = items.length === 10 && items.every(c => CODE_RE.test(c));

  const ok = directCountOk && directFormatOk && directUniqueOk && customCountOk && domOk;
  return { ok, directCountOk, directFormatOk, directUniqueOk, customCountOk, domOk, sample: direct[0] };
})()
