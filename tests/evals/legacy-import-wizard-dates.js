/* legacy-import-wizard-dates.js — salvaged from .tmp/eval-date-check2.js (docs/components/export-import.html).
 * Orion.importWizard() with a DD/MM/YYYY date column: dropping the fixture CSV and completing the wizard
 * must parse each date's day/month/year components correctly (not shifted by a timezone conversion, and
 * not swapped as MM/DD/YYYY). Kept over the near-identical .tmp/eval-date-check.js (dropped — it compared
 * toISOString().slice(0,10), which is timezone-sensitive; this version compares local Y/M/D components).
 *
 * FIX vs the original script: it dispatched a synthetic DragEvent('drop') on `.o-iw-drop`. That element
 * only exists in importer.js's plain-div fallback (renderUpload(), `else` branch); on this full-bundle
 * page `<o-upload>` IS registered, so `UploadEl = o.container !== 'dialog' && ... && customElements.get(
 * 'o-upload')` is truthy and the wizard renders `<o-upload class="o-iw-upload-el">` instead (confirmed:
 * `.o-iw-drop` was null, `o-upload.o-iw-upload-el` was present, and the whole panel mounts inside an
 * Orion.modal rather than the wizard's own `.o-iw` dialog wrapper). This version feeds the file straight
 * through `<o-upload>`'s own `addFiles()` API, which the importer's pick handler already listens for via
 * the `o-change` event, instead of the DOM event the fallback drop zone would have received.
 */
(async () => {
  const columns = [
    { key: 'name', title: 'Name', required: true },
    { key: 'startDate', title: 'Start date', type: 'date', format: 'DD/MM/YYYY' },
  ];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (sel, tries = 40) => { for (let i = 0; i < tries; i++) { const el = document.querySelector(sel); if (el) return el; await sleep(50); } return null; };
  const p = Orion.importWizard({ title: 'Import employees', columns, skipInvalid: true, onImport: async () => {} });
  const blob = await (await fetch('../fixtures/data/sample.csv')).blob();
  const file = new File([blob], 'sample.csv');
  const uploadEl = await waitFor('o-upload.o-iw-upload-el');
  if (uploadEl) { await uploadEl.addFiles([file]); }
  else {
    const dropZone = await waitFor('.o-iw-drop');
    const dt = new DataTransfer(); dt.items.add(file);
    dropZone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }
  await new Promise(r => setTimeout(r, 500));
  document.querySelector('.o-iw-footer .o-btn-primary').click();
  await new Promise(r => setTimeout(r, 500));
  document.querySelector('.o-iw-footer .o-btn-primary').click();
  await new Promise(r => setTimeout(r, 900));
  document.querySelector('.o-iw-footer .o-btn-primary')?.click();
  const result = await p;
  const rows = result.slice(0, 3).map(r => ({ name: r.name, isDate: r.startDate instanceof Date, y: r.startDate?.getFullYear?.(), m: r.startDate ? r.startDate.getMonth() + 1 : null, d: r.startDate?.getDate?.() }));
  // Fixture (docs/fixtures/data/sample.csv) rows 1-3, "Start Date" column is DD/MM/YYYY:
  const expected = [
    { name: 'Aisha Müller', d: 13, m: 7, y: 2019 },
    { name: 'Grace Smith', d: 11, m: 10, y: 2021 },
    { name: 'Elena Patel', d: 22, m: 4, y: 2018 },
  ];
  const ok = rows.length === 3 && rows.every((r, i) => r.isDate && r.name === expected[i].name && r.d === expected[i].d && r.m === expected[i].m && r.y === expected[i].y);
  return { ok, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, rows, expected };
})()
