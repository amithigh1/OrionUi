/* legacy-xlsx-roundtrip.js — salvaged from .tmp/eval-xlsx-roundtrip2.js (docs/components/export-import.html).
 * Orion.xlsx.write()/read() round trip over 500 rows with unicode, decimals, booleans, datetimes and
 * nulls. Kept over .tmp/eval-xlsx-roundtrip.js (dropped — it read rows back via lowercase keys like
 * `got.id`, but Orion.xlsx.read() with no explicit read-side columns returns keys matching the column
 * *titles* (`got.ID`), verified empirically via `node -e "require('./dist/orion.js')..."`; that script's
 * own mismatch counter would have flagged every single row as a mismatch, so it was a stale/broken check).
 */
(async () => {
  const rows = [];
  for (let i = 0; i < 500; i++) {
    rows.push({
      id: i + 1,
      name: 'Row "' + i + '" & <special> ' + (i % 7 === 0 ? 'Zoë Müller ünïcode 日本語' : 'plain'),
      amount: (i * 3.14159) - 100.5,
      active: i % 2 === 0,
      created: new Date(2024, 0, 1 + (i % 365), 10, 30, 15),
      notes: i % 11 === 0 ? null : 'tab\tnewline\nend',
    });
  }
  const columns = [
    { key: 'id', title: 'ID', type: 'integer' },
    { key: 'name', title: 'Name' },
    { key: 'amount', title: 'Amount', type: 'number', decimals: 4 },
    { key: 'active', title: 'Active', type: 'boolean' },
    { key: 'created', title: 'Created', type: 'datetime' },
    { key: 'notes', title: 'Notes' },
  ];
  const blob = await Orion.xlsx.write(rows, { columns, sheetName: 'RoundTrip' });
  const wb = await Orion.xlsx.read(blob);
  const sheet = wb.sheets[0];
  let mismatches = [];
  for (let i = 0; i < rows.length; i++) {
    const src = rows[i], got = sheet.rows[i];
    if (!got) { mismatches.push({ i, reason: 'missing row' }); continue; }
    if (got.ID !== src.id) mismatches.push({ i, field: 'id', src: src.id, got: got.ID });
    if (got.Name !== src.name) mismatches.push({ i, field: 'name', src: src.name, got: got.Name });
    if (Math.abs(got.Amount - src.amount) > 1e-6) mismatches.push({ i, field: 'amount', src: src.amount, got: got.Amount });
    if (got.Active !== src.active) mismatches.push({ i, field: 'active', src: src.active, got: got.Active });
    const gotDate = got.Created instanceof Date ? got.Created.getTime() : null;
    if (gotDate !== src.created.getTime()) mismatches.push({ i, field: 'created', src: src.created.toISOString(), got: got.Created });
    const srcNotes = src.notes == null ? null : src.notes;
    const gotNotes = got.Notes == null ? null : got.Notes;
    if (srcNotes !== gotNotes) mismatches.push({ i, field: 'notes', src: srcNotes, got: gotNotes });
  }
  const ok = sheet.rows.length === rows.length && mismatches.length === 0;
  return { ok, blobSize: blob.size, blobType: blob.type, rowCount: sheet.rows.length, expectedCount: rows.length, mismatchCount: mismatches.length, firstMismatches: mismatches.slice(0, 10) };
})()
