/* legacy-export-formats.js — salvaged from .tmp/eval-export.js (docs/components/export-import.html).
 * Orion.export.{csv,xlsx,pdf,json,html,clipboard} each resolve with the right Blob/text shape when
 * download:false, and the download:true path (which triggers a real browser download) does not throw.
 */
(async () => {
  const rows = [
    { id: 1, name: 'Ada Lovelace', salary: 88600, joined: new Date(2025, 1, 14), progress: 0.42, status: 'Active' },
    { id: 2, name: 'Zoë Müller', salary: 69300, joined: new Date(2020, 3, 8), progress: 0.9, status: 'On leave' },
    { id: 3, name: 'Farid "The Great" Silva', salary: 98700, joined: new Date(2022, 7, 13), progress: 0.15, status: 'Active' },
  ];
  const columns = [
    { key: 'id', title: 'ID', type: 'integer' },
    { key: 'name', title: 'Name' },
    { key: 'salary', title: 'Salary', type: 'currency', currency: 'USD' },
    { key: 'joined', title: 'Joined', type: 'date' },
    { key: 'progress', title: 'Progress', type: 'percent' },
    { key: 'status', title: 'Status' },
  ];
  const out = {};
  const csvBlob = await Orion.export.csv(rows, { columns, download: false });
  out.csv = { isBlob: csvBlob instanceof Blob, type: csvBlob.type, size: csvBlob.size };
  const xlsxBlob = await Orion.export.xlsx(rows, { columns, download: false });
  out.xlsx = { isBlob: xlsxBlob instanceof Blob, type: xlsxBlob.type, size: xlsxBlob.size };
  const pdfBlob = await Orion.export.pdf(rows, { columns, download: false, title: 'Test report' });
  out.pdf = { isBlob: pdfBlob instanceof Blob, type: pdfBlob.type, size: pdfBlob.size };
  const jsonBlob = await Orion.export.json(rows, { columns, download: false });
  out.json = { isBlob: jsonBlob instanceof Blob, type: jsonBlob.type, size: jsonBlob.size, text: await jsonBlob.text() };
  const htmlBlob = await Orion.export.html(rows, { columns, download: false, title: 'Test' });
  out.html = { isBlob: htmlBlob instanceof Blob, type: htmlBlob.type, size: htmlBlob.size };
  const clip = await Orion.export.clipboard(rows, { columns });
  out.clipboard = { text: clip.slice(0, 60) };
  let threw = null;
  try { await Orion.export.csv(rows, { columns, filename: 'qa-test' }); } catch (e) { threw = e.message; }
  out.downloadTrue = { threw };

  const blobsOk = ['csv', 'xlsx', 'pdf', 'json', 'html'].every(k => out[k].isBlob && out[k].size > 0);
  const ok = blobsOk && /Ada Lovelace/.test(out.json.text) && !!out.clipboard.text && out.downloadTrue.threw === null;
  return { ok, ...out };
})()
