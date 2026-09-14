/* legacy-xlsx-merge.js — salvaged from .tmp/eval-merge-xml.js (docs/components/export-import.html).
 * Orion.xlsx.write({ merges }) emits a <mergeCells> block with the requested range in the sheet XML.
 */
(async () => {
  const blob = await Orion.xlsx.write([{ a: 'x', b: 1 }, { a: 'y', b: 2 }], { merges: ['A1:B1'], title: 'Merged Title' });
  const entries = await Orion.zip.read(blob);
  const sheetEntry = entries.find(e => e.name === 'xl/worksheets/sheet1.xml');
  const xml = await sheetEntry.text();
  const mergeTag = /<mergeCells[\s\S]*?<\/mergeCells>/.exec(xml);
  const mergeCellsBlock = mergeTag ? mergeTag[0] : null;
  const ok = !!mergeCellsBlock && /ref="A1:B1"/.test(mergeCellsBlock);
  return { ok, mergeCellsBlock, sheetDataStart: xml.slice(xml.indexOf('<sheetData'), xml.indexOf('<sheetData') + 400) };
})()
