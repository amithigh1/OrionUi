/* legacy-csv-xlsx-extra.js — salvaged from .tmp/eval-more.js (docs/components/export-import.html).
 * Orion.csv.parse dynamicTyping + escaped quotes, Orion.csv.parseAsync over a Blob with onChunk,
 * an xlsx formula cell's cached value read back, and merged-cell fill.
 *
 * (Update 13 Sep: the hidden-sheet bug described below is fixed — write() emits state="hidden" and the round trip IS
 * asserted in `ok` now. The original analysis is kept for context.)
 * The hidden-sheet round trip from the original script was intentionally NOT asserted: it was a real,
 * reproducible library bug, not a stale test. `Orion.xlsx.write({ sheets: [{ ..., hidden: true }] })`
 * silently drops the flag — src/components/xlsx/xlsx.js's write() merges the per-sheet `hidden` option
 * into its internal sheet object (line ~199: `o = { ...gg, ...sh }`) but the `<sheets>` tag builder
 * (line ~341: `built.map((b,i) => \`<sheet name="..." sheetId="${i+1}" r:id="rId${i+1}"/>\`)`) never
 * emits a `state="hidden"` attribute from it, even though read() correctly parses `state` back into
 * `hidden` (line ~531: `hidden: a.state === 'hidden' || a.state === 'veryHidden'`) and the read-side
 * return shape documents `hidden` per sheet (line 13 JSDoc). Reproduced below and reported in the
 * package report as a candidate real bug; the diagnostic values are still returned for visibility.
 *
 * Also fixed vs the original: parseAsync's own contract (src/components/csv/csv.js line ~104:
 * `this.collect = this.o.collect ?? !this.o.onChunk`) defaults `collect` to false whenever `onChunk` is
 * given — it's an explicit either/or streaming design, not a bug — so `res.rows` was always empty. Passes
 * `collect: true` to get both the per-chunk callback AND the final aggregated rows.
 */
(async () => {
  const out = {};

  const csv = 'id;name;amount;joined;active;note\n1;"Ada Lovelace";1234.5;2024-02-29;true;"Said ""hello"""\n2;"Zoë, the second";-12;2023-11-05;FALSE;"multi\nline"\n3;Bob;007;not a date;yes;';
  const r = Orion.csv.parse(csv, { header: true, dynamicTyping: true });
  out.dynamicTyping = { rows: r.rows, errors: r.errors, delimiter: r.meta.delimiter };

  const chunks = [];
  const bigCsv = 'a,b\n' + Array.from({ length: 2500 }, (_, i) => `${i},val${i}`).join('\n');
  const blob = new Blob([bigCsv], { type: 'text/csv' });
  const res = await Orion.csv.parseAsync(blob, { header: true, chunkSize: 500, collect: true, onChunk: (rows) => { chunks.push(rows.length); } });
  out.parseAsyncBlob = { totalRows: res.rows.length, chunkSizes: chunks, collectedIntoRows: res.rows.length > 0 };

  const wbBlob = await Orion.xlsx.write([['Total', { f: 'SUM(A1:A2)', v: 42 }]], { header: false });
  const wb = await Orion.xlsx.read(wbBlob, { header: false });
  out.formula = wb.sheets[0].rows;

  const mergeBlob = await Orion.xlsx.write([{ a: 'x', b: 1 }, { a: 'y', b: 2 }], { merges: ['A1:B1'], title: 'Merged Title' });
  const mergeWb = await Orion.xlsx.read(mergeBlob, { fillMerged: true });
  out.merges = { merges: mergeWb.sheets[0].merges, range: mergeWb.sheets[0].range };

  const multiBlob = await Orion.xlsx.write({ sheets: [{ name: 'Visible', rows: [{ a: 1 }] }, { name: 'Hidden', rows: [{ a: 2 }], hidden: true }] });
  const multiWb = await Orion.xlsx.read(multiBlob);
  out.multiSheet = { sheetNames: multiWb.sheetNames, hiddenFlags: multiWb.sheets.map(s => s.hidden) };

  const ok = out.dynamicTyping.rows.length === 3 && out.dynamicTyping.rows[0].amount === 1234.5 && out.dynamicTyping.rows[0].active === true
    && out.dynamicTyping.rows[0].note === 'Said "hello"' && out.dynamicTyping.rows[1].name === 'Zoë, the second' && out.dynamicTyping.rows[1].note === 'multi\nline'
    && out.parseAsyncBlob.totalRows === 2500 && out.parseAsyncBlob.chunkSizes.length >= 5
    && Array.isArray(out.formula[0]) && +out.formula[0][1] === 42
    && Array.isArray(out.merges.merges) && out.merges.merges.length === 1
    && out.multiSheet.sheetNames.length === 2
    && out.multiSheet.hiddenFlags.join() === 'false,true'; // write() now emits state="hidden" (fixed 13 Sep, see header)
  return { ok, ...out };
})()
