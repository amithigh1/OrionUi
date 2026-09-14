/* legacy-export-import-demo-buttons.js — salvaged from .tmp/eval-demo-buttons.js (docs/components/export-import.html).
 * Three of the page's live demo buttons: the in-browser zip round-trip, the CSV parser "Parse" button,
 * and the five Orion.export.to() format buttons (each must resolve without throwing).
 */
(async () => {
  const out = {};
  document.getElementById('zip-list').click();
  await new Promise(r => setTimeout(r, 500));
  out.zipLog = document.getElementById('zip-log').textContent;

  document.getElementById('csv-go').click();
  await new Promise(r => setTimeout(r, 100));
  out.csvMeta = document.getElementById('csv-meta').textContent;
  out.csvRows = document.querySelectorAll('#csv-out tbody tr').length;

  for (const fmt of ['csv', 'xlsx', 'pdf', 'json', 'html']) {
    const btn = document.querySelector(`[data-exp="${fmt}"]`);
    btn.click();
    await new Promise(r => setTimeout(r, 300));
  }
  out.expLog = document.getElementById('exp-log').textContent;

  const ok = /people\.xlsx/.test(out.zipLog) && /first salary/.test(out.zipLog)
    && out.csvRows > 0
    && ['csv', 'xlsx', 'pdf', 'json', 'html'].every(fmt => new RegExp(fmt + ':').test(out.expLog));
  return { ok, ...out };
})()
