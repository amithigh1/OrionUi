/* legacy-xlsx-titlerow.js — salvaged from .tmp/eval-titlerow.js (docs/components/export-import.html).
 * Orion.xlsx.write({ titleRow: true }) writes both a visible title row in the sheet XML and the
 * document title into docProps/core.xml.
 */
(async () => {
  const blob = await Orion.xlsx.write([{ a: 'x', b: 1 }, { a: 'y', b: 2 }], { title: 'My Title', subtitle: 'Sub', titleRow: true });
  const entries = await Orion.zip.read(blob);
  const xml = await entries.find(e => e.name === 'xl/worksheets/sheet1.xml').text();
  const core = await entries.find(e => e.name === 'docProps/core.xml').text();
  const sharedStrings = await entries.find(e => e.name === 'xl/sharedStrings.xml')?.text();
  const sd = /<sheetData>[\s\S]*?<\/sheetData>/.exec(xml)[0];
  const coreTitle = /<dc:title>([\s\S]*?)<\/dc:title>/.exec(core)?.[1];
  // Text is stored in the shared-strings table, not inline in the sheet — read it back with Orion.xlsx.read
  // instead of re-deriving the XML shared-string-index scheme by hand.
  const wb = await Orion.xlsx.read(blob, { header: false });
  const firstRows = wb.sheets[0].rows.slice(0, 3).map(r => JSON.stringify(r));
  const titleRowFound = firstRows.some(r => /My Title/.test(r));
  const ok = titleRowFound && !!sharedStrings && /My Title/.test(sharedStrings) && coreTitle === 'My Title' && sd.length > 0;
  return { ok, sheetData: sd, coreTitle, firstRows };
})()
