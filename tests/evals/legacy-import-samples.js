/* legacy-import-samples.js — salvaged from .tmp/eval-samples.js (docs/components/export-import.html).
 * The "Load sample.csv / .xlsx / .json" quick-preview buttons each parse their fixture and render rows.
 */
(async () => {
  const out = {};
  for (const name of ['sample.csv', 'sample.xlsx', 'sample.json']) {
    const btn = [...document.querySelectorAll('[data-fixture]')].find(b => b.dataset.fixture === name);
    btn.click();
    await new Promise(r => setTimeout(r, 400));
    out[name] = {
      meta: document.getElementById('imp-meta').textContent,
      rowsShown: document.querySelectorAll('#imp-out tbody tr').length,
    };
  }
  const ok = Object.values(out).every(r => r.rowsShown > 0 && !!r.meta);
  return { ok, ...out };
})()
