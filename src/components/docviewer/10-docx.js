/* DOCX -> HTML converter (word/document.xml + styles.xml + numbering.xml + relationships + media).
 * docxToHTML(src) -> Promise<SafeHTML> — paragraphs, heading styles, bold/italic/underline/strike, colors,
 * highlight, superscript/subscript, bullet & numbered lists (numbering.xml, nested), tables (gridSpan / vMerge,
 * shading, alignment), hyperlinks (via rels) and inline images (word/media, via rels).
 * Scope: this is a converter for common Word output, not the full OOXML spec (no headers/footers, footnotes,
 * text boxes, SmartArt, or nested tables).
 */
const DVX_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const dvxLocal = n => n.localName || n.nodeName.replace(/^.*:/, '');
const dvxChild = (n, name) => n ? [...n.children].find(c => dvxLocal(c) === name) : null;
const dvxChildren = (n, name) => n ? [...n.children].filter(c => dvxLocal(c) === name) : [];
const dvxVal = (n, attr = 'val') => n ? (n.getAttribute('w:' + attr) ?? n.getAttribute(attr)) : null;
const HIGHLIGHT_COLORS = { yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000', darkBlue: '#00008b', darkCyan: '#008b8b', darkGreen: '#006400', darkMagenta: '#8b008b', darkRed: '#8b0000', darkYellow: '#808000', darkGray: '#808080', lightGray: '#d3d3d3', black: '#000000', white: '#ffffff' };

function dvxParseXML(text) {
  if (!text) return null;
  const xdoc = new DOMParser().parseFromString(text, 'application/xml');
  return xdoc.querySelector('parsererror') ? null : xdoc;
}
function dvxStyles(xdoc) {
  const map = new Map();
  if (!xdoc) return map;
  dvxChildren(xdoc.documentElement, 'style').forEach(st => {
    if (dvxVal(st, 'type') !== 'paragraph') return;
    const id = st.getAttribute('w:styleId') || st.getAttribute('styleId');
    const name = dvxVal(dvxChild(st, 'name')) || id || '';
    map.set(id, classifyStyleName(name, id));
  });
  return map;
}
function classifyStyleName(name, id) {
  const n = String(name || id || '').toLowerCase();
  let m = /heading\s*([1-6])/.exec(n);
  if (m) return { tag: 'h' + Math.min(6, +m[1] + 1), cls: 'o-docviewer-h' + m[1] };
  if (/^title$/.test(n)) return { tag: 'h1', cls: 'o-docviewer-title' };
  if (/subtitle/.test(n)) return { tag: 'p', cls: 'o-docviewer-subtitle' };
  if (/(^|\s)quote/.test(n)) return { tag: 'blockquote', cls: null };
  return null;
}
function dvxNumbering(xdoc) {
  if (!xdoc) return () => null;
  const abstractById = new Map();
  dvxChildren(xdoc.documentElement, 'abstractNum').forEach(an => {
    const id = an.getAttribute('w:abstractNumId') || an.getAttribute('abstractNumId');
    const lvls = new Map();
    dvxChildren(an, 'lvl').forEach(lvl => lvls.set(dvxVal(lvl, 'ilvl') ?? lvl.getAttribute('ilvl'), dvxVal(dvxChild(lvl, 'numFmt'))));
    abstractById.set(id, lvls);
  });
  const numToAbstract = new Map();
  dvxChildren(xdoc.documentElement, 'num').forEach(n => {
    const id = n.getAttribute('w:numId') || n.getAttribute('numId');
    numToAbstract.set(id, dvxVal(dvxChild(n, 'abstractNumId')));
  });
  return (numId, ilvl) => { const lvls = abstractById.get(numToAbstract.get(String(numId))); return lvls ? lvls.get(String(ilvl)) || 'decimal' : 'decimal'; };
}
function dvxRels(xdoc) {
  const map = new Map();
  if (!xdoc) return map;
  [...xdoc.documentElement.children].forEach(r => { if (dvxLocal(r) === 'Relationship') map.set(r.getAttribute('Id'), { target: r.getAttribute('Target'), external: r.getAttribute('TargetMode') === 'External' }); });
  return map;
}

function dvxRunProps(rPr) {
  if (!rPr) return {};
  const flag = tag => { const el = dvxChild(rPr, tag); return el && dvxVal(el) !== 'false' && dvxVal(el) !== '0'; };
  const u = dvxChild(rPr, 'u');
  const color = dvxVal(dvxChild(rPr, 'color'));
  const hl = dvxVal(dvxChild(rPr, 'highlight'));
  return {
    bold: flag('b'), italic: flag('i'), strike: flag('strike') || flag('dstrike'),
    underline: !!(u && dvxVal(u) && dvxVal(u) !== 'none'),
    color: color && color !== 'auto' && /^[0-9a-f]{6}$/i.test(color) ? color : null,
    highlight: hl && hl !== 'none' ? (HIGHLIGHT_COLORS[hl] || null) : null,
    vertAlign: dvxVal(dvxChild(rPr, 'vertAlign')),
  };
}
function dvxFind(root, name) { return [...root.getElementsByTagName('*')].find(n => dvxLocal(n) === name) || null; }
async function dvxDrawingHTML(drawing, rels, zip, media) {
  const blip = dvxFind(drawing, 'blip');
  const rid = blip && (blip.getAttribute('r:embed') || blip.getAttribute('embed'));
  const rel = rid && rels.get(rid);
  if (!rel || rel.external) return '';
  const path = 'word/' + rel.target.replace(/^\.?\//, '');
  let url = media.get(path);
  if (!url) {
    const bytes = await zip.bytes(path).catch(() => null);
    if (!bytes) return '';
    const ext = (path.split('.').pop() || 'png').toLowerCase();
    const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', emf: 'image/emf', wmf: 'image/wmf' }[ext] || 'image/png';
    url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    media.set(path, url);
  }
  const docPr = dvxFind(drawing, 'docPr');
  const alt = (docPr && (docPr.getAttribute('descr') || docPr.getAttribute('name'))) || '';
  return `<img src="${esc(url)}" alt="${esc(alt)}" class="o-docviewer-docx-img">`;
}
async function dvxRunHTML(rNode, ctx) {
  const p = dvxRunProps(dvxChild(rNode, 'rPr'));
  let out = '';
  for (const node of [...rNode.children]) {
    const ln = dvxLocal(node);
    if (ln === 't') out += esc(node.textContent);
    else if (ln === 'tab') out += '    ';
    else if (ln === 'br') { const bt = dvxVal(node, 'type'); if (bt !== 'page' && bt !== 'column') out += '<br>'; }
    else if (ln === 'drawing') out += await dvxDrawingHTML(node, ctx.rels, ctx.zip, ctx.media);
  }
  if (!out) return '';
  if (p.vertAlign === 'superscript') out = `<sup>${out}</sup>`;
  else if (p.vertAlign === 'subscript') out = `<sub>${out}</sub>`;
  if (p.strike) out = `<s>${out}</s>`;
  if (p.underline) out = `<u>${out}</u>`;
  if (p.italic) out = `<em>${out}</em>`;
  if (p.bold) out = `<strong>${out}</strong>`;
  const sty = [];
  if (p.color) sty.push(`color:#${p.color}`);
  if (p.highlight) sty.push(`background-color:${p.highlight}`);
  if (sty.length) out = `<span style="${sty.join(';')}">${out}</span>`;
  return out;
}
async function dvxInlineHTML(pNode, ctx) {
  let out = '';
  for (const node of [...pNode.children]) {
    const ln = dvxLocal(node);
    if (ln === 'r') out += await dvxRunHTML(node, ctx);
    else if (ln === 'hyperlink') {
      const rid = node.getAttribute('r:id') || node.getAttribute('id');
      const rel = rid && ctx.rels.get(rid);
      const href = rel ? rel.target : (node.getAttribute('w:anchor') ? '#' + node.getAttribute('w:anchor') : '');
      let inner = ''; for (const r of dvxChildren(node, 'r')) inner += await dvxRunHTML(r, ctx);
      out += href && isSafeHref(href) ? `<a href="${esc(href)}"${rel && rel.external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${inner}</a>` : inner;
    }
  }
  return out;
}
function dvxParaMeta(pNode, styles) {
  const pPr = dvxChild(pNode, 'pPr');
  const styleId = pPr && (dvxChild(pPr, 'pStyle')?.getAttribute('w:val') || dvxChild(pPr, 'pStyle')?.getAttribute('val'));
  const meta = (styleId && styles.get(styleId)) || null;
  const jc = pPr && dvxVal(dvxChild(pPr, 'jc'));
  const numPr = pPr && dvxChild(pPr, 'numPr');
  const numId = numPr && dvxVal(dvxChild(numPr, 'numId'));
  const ilvl = numPr && (dvxVal(dvxChild(numPr, 'ilvl')) || '0');
  const pageBreakBefore = !!(dvxChildren(pNode, 'r').some(r => dvxChildren(r, 'br').some(b => dvxVal(b, 'type') === 'page')));
  const align = jc === 'both' ? 'justify' : jc === 'end' ? 'right' : jc === 'start' ? 'left' : jc;
  return { tag: meta?.tag || 'p', cls: meta?.cls, align: (align === 'right' || align === 'center' || align === 'justify') ? align : null, numId: numId && numId !== '0' ? numId : null, ilvl, pageBreakBefore };
}
async function dvxParagraphHTML(pNode, ctx) {
  const inner = await dvxInlineHTML(pNode, ctx);
  return inner || '&nbsp;';
}
function dvxCellShade(tcPr) { const shd = tcPr && dvxChild(tcPr, 'shd'); const fill = shd && dvxVal(shd, 'fill'); return fill && fill !== 'auto' && /^[0-9a-f]{6}$/i.test(fill) ? '#' + fill : null; }

async function dvxTableHTML(tbl, ctx) {
  const rows = dvxChildren(tbl, 'tr');
  const grid = [];
  for (let ri = 0; ri < rows.length; ri++) {
    grid[ri] = grid[ri] || [];
    let ci = 0;
    const isHeader = !!dvxChild(dvxChild(rows[ri], 'trPr'), 'tblHeader');
    for (const tc of dvxChildren(rows[ri], 'tc')) {
      while (grid[ri][ci]) ci++;
      const tcPr = dvxChild(tc, 'tcPr');
      const span = +dvxVal(dvxChild(tcPr, 'gridSpan')) || 1;
      const vMerge = dvxChild(tcPr, 'vMerge');
      if (vMerge && (dvxVal(vMerge) === 'continue' || dvxVal(vMerge) == null)) {
        for (let k = 0; k < span; k++) grid[ri][ci + k] = 'x';
        for (let rr = ri - 1; rr >= 0; rr--) { const o = grid[rr][ci]; if (o && o !== 'x') { o.rowSpan++; break; } if (o !== 'x') break; }
        ci += span; continue;
      }
      const paras = dvxChildren(tc, 'p');
      let html = ''; for (const p of paras) { const m = dvxParaMeta(p, ctx.styles); const t2 = await dvxParagraphHTML(p, ctx); html += `<p${m.align ? ` style="text-align:${m.align}"` : ''}>${t2}</p>`; }
      const cellInfo = { colSpan: span, rowSpan: 1, html: html || '&nbsp;', shade: dvxCellShade(tcPr), header: isHeader };
      for (let k = 0; k < span; k++) grid[ri][ci + k] = cellInfo;
      ci += span;
    }
  }
  let out = '<table class="o-docviewer-docx-table"><tbody>';
  const seen = new Set();
  for (const row of grid) {
    out += '<tr>';
    for (const cell of row) {
      if (!cell || cell === 'x' || seen.has(cell)) continue;
      seen.add(cell);
      const tag = cell.header ? 'th' : 'td';
      const attrs = (cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '') + (cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : '') + (cell.shade ? ` style="background-color:${cell.shade}"` : '');
      out += `<${tag}${attrs}>${cell.html}</${tag}>`;
    }
    out += '</tr>';
  }
  return out + '</tbody></table>';
}

const DVX_NUM_TAG = fmt => (fmt === 'bullet' ? 'ul' : 'ol');
/** docxToHTML(src) -> Promise<SafeHTML>. src: URL string | File | Blob. Object URLs for embedded images stay alive for the page's lifetime. */
async function docxToHTML(src) {
  const buf = await readBuffer(src);
  const zip = await unzip(buf);
  const docXml = dvxParseXML(await zip.text('word/document.xml'));
  if (!docXml) throw new Error('word/document.xml not found — not a Word document');
  const styles = dvxStyles(dvxParseXML(await zip.text('word/styles.xml')));
  const numFmtOf = dvxNumbering(dvxParseXML(await zip.text('word/numbering.xml')));
  const rels = dvxRels(dvxParseXML(await zip.text('word/_rels/document.xml.rels')));
  const ctx = { rels, zip, styles, media: new Map() };
  const body = dvxChild(docXml.documentElement, 'body');
  let out = '';
  const stack = []; // { tag, numId, liOpen } — nesting: a deeper list nests INSIDE its parent's still-open <li>
  const closeLi = depth => { if (stack[depth] && stack[depth].liOpen) { out += '</li>'; stack[depth].liOpen = false; } };
  const closeListsAbove = depth => { while (stack.length > depth) { const top = stack.length - 1; closeLi(top); out += `</${stack[top].tag}>`; stack.pop(); } };
  const closeAllLists = () => closeListsAbove(0);
  const openListItem = async (lvl, numId, fmt, html) => {
    const tag = DVX_NUM_TAG(fmt);
    closeListsAbove(lvl + 1);
    if (stack.length === lvl + 1) { if (stack[lvl].numId !== numId) closeListsAbove(lvl); else closeLi(lvl); }
    while (stack.length <= lvl) { out += `<${tag}>`; stack.push({ tag, numId, liOpen: false }); }
    out += `<li>${html}`;
    stack[lvl].liOpen = true;
  };
  for (const node of body ? [...body.children] : []) {
    const ln = dvxLocal(node);
    if (ln === 'p') {
      const meta = dvxParaMeta(node, styles);
      const html = await dvxParagraphHTML(node, ctx);
      if (meta.pageBreakBefore) { out += '<hr class="o-docviewer-docx-pagebreak">'; if (html === '&nbsp;' && !meta.numId) continue; }
      if (meta.numId) {
        await openListItem(+meta.ilvl, meta.numId, numFmtOf(meta.numId, meta.ilvl), html);
      } else {
        closeAllLists();
        const style = meta.align ? ` style="text-align:${meta.align}"` : '';
        const cls = meta.cls ? ` class="${meta.cls}"` : '';
        out += `<${meta.tag}${cls}${style}>${html}</${meta.tag}>`;
      }
    } else if (ln === 'tbl') {
      closeAllLists();
      out += await dvxTableHTML(node, ctx);
    }
  }
  closeAllLists();
  return raw(out);
}
O.docx = { toHTML: docxToHTML };
