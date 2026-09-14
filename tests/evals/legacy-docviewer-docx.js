/* legacy-docviewer-docx.js — salvaged from .tmp/eval-docx.js (docs/components/document-viewer.html).
 * <o-docviewer> DOCX rendering: bold/italic/underline/strike, a link, nested lists, a table (with a
 * specific grand-total cell), an embedded image served as a blob: URL, and a page break.
 */
(async () => {
  const dv = document.querySelector('o-docviewer[filename="Project brief.docx"]');
  let tries = 0;
  while (!dv.querySelector('.o-docviewer-docx') && tries < 100) { await new Promise(r => setTimeout(r, 50)); tries++; }
  await new Promise(r => setTimeout(r, 300));
  const prose = dv.querySelector('.o-docviewer-docx');
  const title = prose.querySelector('.o-docviewer-title')?.textContent || '';
  const h2s = [...prose.querySelectorAll('h2')].map(h => h.textContent);
  const bold = prose.querySelector('strong')?.textContent;
  const italic = prose.querySelector('em')?.textContent;
  const underline = prose.querySelector('u')?.textContent;
  const strike = prose.querySelector('s')?.textContent;
  const link = prose.querySelector('a');
  const lists = prose.querySelectorAll('ul, ol').length;
  const nestedLi = prose.querySelectorAll('ul ul li, ol ol li').length;
  const table = prose.querySelector('table');
  const tableText = table ? table.textContent.replace(/\s+/g, ' ').trim() : '';
  const grandTotalCell = [...(table?.querySelectorAll('td') || [])].find(td => /503,000/.test(td.textContent));
  const img = prose.querySelector('img.o-docviewer-docx-img');
  const pageBreak = prose.querySelector('.o-docviewer-docx-pagebreak');
  const h1s = [...prose.querySelectorAll('h1')].map(h => h.textContent);

  const result = {
    kind: dv.kind, title, h2s, bold, italic, underline, strike,
    linkHref: link ? link.getAttribute('href') : null, linkText: link ? link.textContent : null,
    listCount: lists, nestedLiCount: nestedLi,
    hasTable: !!table, tableHasEngineering: /Engineering/.test(tableText), hasGrandTotal: !!grandTotalCell,
    hasImage: !!img, imgSrcIsBlob: img ? img.src.startsWith('blob:') : false,
    hasPageBreak: !!pageBreak, h1s,
  };
  const ok = result.kind === 'docx' && !!result.title && result.h2s.length > 0
    && !!result.bold && !!result.italic && !!result.underline && !!result.strike
    && !!result.linkHref && result.listCount > 0 && result.nestedLiCount > 0
    && result.hasTable && result.tableHasEngineering && result.hasGrandTotal
    && result.hasImage && result.imgSrcIsBlob && result.hasPageBreak;
  return { ok, ...result };
})()
