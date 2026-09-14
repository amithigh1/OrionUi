// @deps exporter
/* Print preview — paginated preview dialog + printing through a hidden iframe (data package).
 *
 *   const pv = Orion.printPreview(target, { title, orientation: 'portrait'|'landscape', paper: 'A4'|'Letter'|'Legal'|'A3'|'A5',
 *                                         margins: 'default'|'narrow'|'wide'|'none'|mm|{ top, right, bottom, left },
 *                                         scale: 1 | 'fit', background: true, header, footer, showPageNumbers: true,
 *                                         onPrint({ pages, paper, orientation }) -> false to cancel, pdf: true })
 *     target: Element | selector | HTML string (trusted markup) | { rows, columns, title, subtitle }
 *     header/footer: 'text {page} of {pages} · {title} · {date}' | { left, center, right } | fn({ page, pages, title, date }) -> string | Node
 *     -> handle { el, print(), close(), update(opts), pages, closed: Promise }
 *   Orion.printTable(rows, columns, { title, subtitle, preview: true, ...printPreview options })
 *   Orion.printPreview.print(target, opts) — print directly (no preview) with the same @page settings.
 * The preview simulates CSS paged media: page boxes of the real paper size, content split between blocks, list items and
 * table rows (table headers repeat), `break-before/after: page` and `break-inside: avoid` are honoured, custom elements are
 * flattened to their rendered markup and canvases become images. "Download PDF" uses O.export.pdf for tabular data.
 */

i18n.add('en', {
  printPreview: {
    title: 'Print preview', paper: 'Paper', orientation: 'Orientation', portrait: 'Portrait', landscape: 'Landscape', margins: 'Margins',
    marginsDefault: 'Default', narrow: 'Narrow', wide: 'Wide', none: 'None', scale: 'Scale', fit: 'Fit to width', background: 'Background graphics',
    print: 'Print', pdf: 'Download PDF', pages: { one: '{count} page', other: '{count} pages' }, page: 'Page {page} of {pages}',
    pageLabel: 'Page {page}', preparing: 'Preparing preview…', stage: 'Page previews', settings: 'Print settings',
  },
});

const PAPER = { A4: [210, 297], Letter: [215.9, 279.4], Legal: [215.9, 355.6], A3: [297, 420], A5: [148, 210] };
const MARGINS = { default: 15, narrow: 8, wide: 25, none: 0 };
const MM = 96 / 25.4;
const ATOMIC = new Set(['img', 'svg', 'canvas', 'video', 'audio', 'iframe', 'object', 'embed', 'picture', 'pre', 'tr', 'thead', 'tbody', 'tfoot', 'button', 'input', 'select', 'textarea', 'figure', 'math', 'hr']);

function marginsOf(m) {
  const v = isStr(m) && m in MARGINS ? MARGINS[m] : m;
  if (isNum(v)) return { top: v, right: v, bottom: v, left: v };
  if (isObj(v)) return { top: 15, right: 15, bottom: 15, left: 15, ...v };
  return { top: 15, right: 15, bottom: 15, left: 15 };
}
function paperOf(paper, orientation) {
  let [w, h] = Array.isArray(paper) ? paper : PAPER[paper] || PAPER[String(paper).charAt(0).toUpperCase() + String(paper).slice(1).toLowerCase()] || PAPER.A4;
  if ((orientation === 'landscape') !== (w > h)) [w, h] = [h, w];
  return { w, h };
}
const fill = (tpl, ctx) => String(tpl ?? '').replace(/\{(page|pages|title|date|time|url)\}/g, (m, k) => ctx[k] ?? '');

/** Deep clone for printing: form values kept, canvases -> images, custom elements flattened, scripts and ids removed. */
function printable(src) {
  let c = src.cloneNode(true);
  if (src.nodeType !== 1 && src.nodeType !== 11) return c;
  const q = (root, sel) => (root.querySelectorAll ? [...root.querySelectorAll(sel)] : []);
  const srcEls = src.nodeType === 1 ? [src, ...src.querySelectorAll('*')] : [...src.querySelectorAll('*')];
  const dstEls = c.nodeType === 1 ? [c, ...c.querySelectorAll('*')] : [...c.querySelectorAll('*')];
  dstEls.forEach((el, i) => {
    if (el.localName === 'script' || el.localName === 'template' || el.localName === 'noscript') { el.remove(); return; }
    el.removeAttribute('id');
    if (!el.localName.includes('-') || !customElements.get(el.localName)) return;
    const display = srcEls[i] ? getComputedStyle(srcEls[i]).display : 'block';
    const rep = doc.createElement(display.startsWith('inline') ? 'span' : 'div');
    for (const a of el.attributes) if (a.name !== 'id') rep.setAttribute(a.name, a.value);
    rep.classList.add('o-pp-' + el.localName);
    rep.style.display = display === 'none' ? 'none' : display;
    rep.append(...el.childNodes);
    if (el === c) c = rep; else el.replaceWith(rep);
  });
  const si = q(src, 'input, textarea, select'), di = q(c, 'input, textarea, select');
  si.forEach((s, i) => {
    const d = di[i]; if (!d) return;
    if (s.type === 'checkbox' || s.type === 'radio') d.toggleAttribute('checked', s.checked);
    else if (s.tagName === 'SELECT') [...d.options].forEach((op, j) => op.toggleAttribute('selected', !!s.options[j]?.selected));
    else if (s.tagName === 'TEXTAREA') d.textContent = s.value;
    else d.setAttribute('value', s.value);
  });
  const sc = q(src, 'canvas'), dc = q(c, 'canvas');
  sc.forEach((s, i) => {
    try { const img = h('img', { src: s.toDataURL('image/png'), alt: '', class: s.getAttribute('class') }); img.style.width = (s.clientWidth || s.width) + 'px'; img.style.height = (s.clientHeight || s.height) + 'px'; dc[i]?.replaceWith(img); } catch {}
  });
  return c;
}

function sourceFor(target, o) {
  if (isObj(target) && !(target instanceof Node) && Array.isArray(target.rows)) {
    const title = target.title ?? o.title, sub = target.subtitle ?? o.subtitle;
    const meta = [sub, t('export.generated', { date: fmt.datetime(new Date()) }), t('export.records', { count: target.rows.length })].filter(Boolean).map(esc).join(' &middot; ');
    const tableCls = 'o-table o-table-sm o-table-bordered o-pp-table';
    return { html: `<div class="o-pp-report">${title ? `<h1 class="o-pp-report-title">${esc(title)}</h1>` : ''}<p class="o-pp-report-meta">${meta}</p>${O.export.tableHTML(target.rows, { columns: target.columns, tableClass: tableCls })}</div>`, rows: target.rows, columns: target.columns, title };
  }
  if (target instanceof Node) return { node: target };
  const s = String(target ?? '');
  if (/^\s*</.test(s)) return { html: s };
  let el = null;
  try { el = doc.querySelector(s); } catch {}
  return el ? { node: el } : { html: esc(s) };
}

/* ── pagination (plan with measurements first, then move nodes) ──────── */
function paginate(flow, pageH) {
  const top0 = flow.getBoundingClientRect().top;
  const pages = [[]];
  let pageTop = 0;
  const newPage = y => { pages.push([]); pageTop = y; };
  const cur = () => pages.length - 1;
  const rectOf = node => {
    if (node.nodeType === 3) {
      if (!node.data.trim()) return null;
      const rg = doc.createRange(); rg.selectNodeContents(node);
      const b = rg.getBoundingClientRect();
      return b.height ? { top: b.top - top0, bottom: b.bottom - top0 } : null;
    }
    if (node.nodeType !== 1) return null;
    const b = node.getBoundingClientRect();
    if (!b.height && !b.width) return null;
    return { top: b.top - top0, bottom: b.bottom - top0 };
  };
  const cs = el => getComputedStyle(el);
  const splittable = el => {
    if (ATOMIC.has(el.localName)) return false;
    const s = cs(el);
    if (s.breakInside === 'avoid' || s.breakInside === 'avoid-page' || s.pageBreakInside === 'avoid') return false;
    const d = s.display;
    const flowish = d === 'block' || d === 'flow-root' || d === 'list-item' || (d.includes('flex') && s.flexDirection.startsWith('column')) || (d.includes('grid') && s.gridTemplateColumns.trim().split(/\s+/).length <= 1);
    return flowish && [...el.children].some(ch => { const cd = cs(ch).display; return cd !== 'none' && cd !== 'contents' && !cd.startsWith('inline'); });
  };
  const target = (parentGet, node) => {
    const shells = new Map();
    let items = 0;
    return pi => {
      if (!shells.has(pi)) { const kids = []; parentGet(pi).push({ shell: node, kids, continued: shells.size > 0, startItem: items }); shells.set(pi, kids); }
      items++;
      return shells.get(pi);
    };
  };
  const place = (node, get) => {
    if (node.nodeType === 3 && !node.data.trim()) return;
    if (node.nodeType === 8) return;
    const r = rectOf(node);
    if (!r) { get(cur()).push({ node }); return; }
    if (node.nodeType === 1) {
      const s = cs(node);
      if ((s.breakBefore === 'page' || s.breakBefore === 'always' || s.pageBreakBefore === 'always') && r.top > pageTop + 1) newPage(r.top);
    }
    if (r.bottom <= pageTop + pageH + 0.5) { get(cur()).push({ node }); afterBreak(node, r); return; }
    if (node.nodeType === 1 && node.localName === 'table' && node.rows.length) { placeTable(node, get); afterBreak(node, r); return; }
    const tall = r.bottom - r.top > pageH - 0.5;
    if (node.nodeType === 1 && splittable(node) && (tall || r.top < pageTop + pageH * 0.85)) {
      const g = target(get, node);
      for (const ch of [...node.childNodes]) place(ch, g);
      afterBreak(node, r);
      return;
    }
    if (r.top > pageTop + 1) newPage(r.top);
    get(cur()).push({ node });
    if (r.bottom > pageTop + pageH) newPage(r.bottom);
    afterBreak(node, r);
  };
  const afterBreak = (node, r) => {
    if (node.nodeType !== 1) return;
    const s = cs(node);
    if (s.breakAfter === 'page' || s.breakAfter === 'always' || s.pageBreakAfter === 'always') newPage(r.bottom);
  };
  const placeTable = (table, get) => {
    const thead = table.tHead, headH = thead ? thead.getBoundingClientRect().height : 0;
    const widths = [...(thead?.rows[0] || table.rows[0]).cells].map(c => c.getBoundingClientRect().width);
    const tableW = table.getBoundingClientRect().width;
    const rows = [...table.rows].filter(r => r.parentElement !== thead && r.parentElement !== table.tFoot);
    let part = null, partPage = -1, first = true;
    const partFor = pi => {
      if (partPage !== pi) { part = { table, rows: [], first, widths, tableW }; first = false; get(pi).push(part); partPage = pi; }
      return part;
    };
    for (const row of rows) {
      const r = rectOf(row);
      if (!r) { partFor(cur()).rows.push(row); continue; }
      if (r.bottom > pageTop + pageH + 0.5 && r.top > pageTop + headH + 1) {
        const empty = partPage === cur() && !part.rows.length;
        newPage(r.top - headH);
        if (empty) { part.skip = true; first = true; }
      }
      partFor(cur()).rows.push(row);
    }
    if (part) part.last = true;
  };
  for (const ch of [...flow.childNodes]) place(ch, pi => pages[pi]);
  while (pages.length > 1 && !pages[pages.length - 1].length) pages.pop();
  return pages;
}
function buildEntries(entries, container) {
  for (const e of entries) {
    if (e.node) container.append(e.node);
    else if (e.shell) {
      const s = e.shell.cloneNode(false);
      if (e.continued) {
        s.classList.add('o-pp-continued');
        if (s.localName === 'ol') s.setAttribute('start', String((parseInt(e.shell.getAttribute('start'), 10) || 1) + e.startItem));
      }
      buildEntries(e.kids, s);
      container.append(s);
    } else if (e.table && !e.skip && e.rows.length) {
      const tb = e.table, t2 = tb.cloneNode(false);
      t2.style.tableLayout = 'fixed'; t2.style.width = e.tableW + 'px';
      t2.append(h('colgroup', null, e.widths.map(w => h('col', { style: `width:${w}px` }))));
      if (e.first && tb.caption) t2.append(tb.caption.cloneNode(true));
      if (tb.tHead) t2.append(tb.tHead.cloneNode(true));
      const body = (tb.tBodies[0] || doc.createElement('tbody')).cloneNode(false);
      body.append(...e.rows);
      t2.append(body);
      if (e.last && tb.tFoot) t2.append(tb.tFoot.cloneNode(true));
      if (!e.first) t2.classList.add('o-pp-continued');
      container.append(t2);
    }
  }
}

/* ── the dialog ───────────────────────────────────────────────────────── */
function collectStyles() {
  let out = '';
  for (const el of doc.querySelectorAll('style, link[rel~="stylesheet"]')) out += el.outerHTML;
  try { for (const sh of doc.adoptedStyleSheets || []) out += '<style>' + [...sh.cssRules].map(r => r.cssText).join('\n') + '</style>'; } catch {}
  return out;
}
async function printHTML(bodyHTML, { paper, orientation, background, title, pageCSS = '' }) {
  const { w, h: hh } = paperOf(paper, orientation);
  const frame = h('iframe', { class: 'o-pp-frame', title: title || 'print', 'aria-hidden': 'true', tabindex: '-1' });
  const css = `@page { size: ${w}mm ${hh}mm; margin: 0; } html, body { margin: 0; padding: 0; background: #fff; }` + pageCSS;
  const html = `<!doctype html><html lang="${esc(doc.documentElement.lang || 'en')}" dir="${dirOf(doc.documentElement)}" data-theme="light" class="o-theme-light${background ? ' o-pp-bg' : ''}"><head><meta charset="utf-8"><base href="${esc(doc.baseURI)}"><title>${esc(title || doc.title)}</title>${collectStyles()}<style>${css}</style></head><body class="o-pp-print">${bodyHTML}</body></html>`;
  doc.body.appendChild(frame);
  await new Promise(res => { frame.addEventListener('load', res, { once: true }); frame.srcdoc = html; });
  const w2 = frame.contentWindow, d2 = frame.contentDocument;
  await Promise.all([...d2.images].map(img => (img.complete ? null : img.decode?.().catch(noop)))).catch(noop);
  try { await d2.fonts?.ready; } catch {}
  const cleanup = () => setTimeout(() => frame.remove(), 400);
  w2.addEventListener('afterprint', cleanup, { once: true });
  w2.focus();
  w2.print();
  setTimeout(() => frame.isConnected && frame.remove(), 60000);
}
function tableData(src) {
  const tbl = src.node ? (src.node.localName === 'table' ? src.node : src.node.querySelectorAll('table').length === 1 ? src.node.querySelector('table') : null) : null;
  if (!tbl || !tbl.rows.length) return null;
  const headRow = tbl.tHead?.rows[0] || tbl.rows[0];
  const columns = [...headRow.cells].map((c, i) => ({ key: i, title: c.textContent.trim() }));
  const rows = [...tbl.rows].filter(r => r !== headRow && r.parentElement !== tbl.tFoot).map(r => [...r.cells].map(c => c.innerText?.trim() ?? c.textContent.trim()));
  return { rows, columns };
}

function printPreview(target, opts = {}) {
  const o = { title: '', orientation: 'portrait', paper: 'A4', margins: 'default', scale: 1, background: true, showPageNumbers: true, pdf: true, ...opts };
  const src = sourceFor(target, o);
  const title = o.title || src.title || (isBrowser ? doc.title : '');
  const id = uid('pp');
  const tx = (k, p) => t('printPreview.' + k, p);
  // toolbar
  const opt = (v, label, sel) => h('option', { value: v, selected: sel }, label);
  const paperSel = h('select', { class: 'o-select o-input-sm', 'aria-label': tx('paper') }, Object.keys(PAPER).map(p => opt(p, p, p === o.paper)));
  const orientBtns = ['portrait', 'landscape'].map(v => h('button', { type: 'button', 'aria-pressed': String(o.orientation === v), 'data-v': v, title: tx(v) }, raw(String(icon(v === 'portrait' ? 'file' : 'image', { size: 16 }))), h('span', { class: 'o-pp-hide-sm' }, tx(v))));
  const orientSeg = h('div', { class: 'o-segmented o-pp-orient', role: 'group', 'aria-label': tx('orientation') }, orientBtns);
  const marginSel = h('select', { class: 'o-select o-input-sm', 'aria-label': tx('margins') }, ['default', 'narrow', 'wide', 'none'].map(m => opt(m, tx(m === 'default' ? 'marginsDefault' : m), o.margins === m)));
  if (!isStr(o.margins) || !(o.margins in MARGINS)) marginSel.prepend(opt('custom', isNum(o.margins) ? o.margins + ' mm' : '—', true));
  const scales = ['fit', 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2];
  const scaleSel = h('select', { class: 'o-select o-input-sm', 'aria-label': tx('scale') }, scales.map(s => opt(String(s), s === 'fit' ? tx('fit') : Math.round(s * 100) + '%', String(o.scale) === String(s))));
  if (!scales.map(String).includes(String(o.scale))) scaleSel.prepend(opt(String(o.scale), Math.round(o.scale * 100) + '%', true));
  const bgInput = h('input', { type: 'checkbox', checked: !!o.background });
  const count = h('span', { class: 'o-pp-count', 'aria-live': 'polite' });
  const field = (label, control) => h('label', { class: 'o-pp-field' }, h('span', { class: 'o-pp-field-label' }, label), control);
  const data = src.rows ? { rows: src.rows, columns: src.columns } : tableData(src);
  const pdfBtn = o.pdf !== false && data && O.export?.pdf ? h('button', { type: 'button', class: 'o-btn' }, raw(String(icon('download', { size: 16 }))), tx('pdf')) : null;
  const printBtn = h('button', { type: 'button', class: 'o-btn o-btn-primary' }, raw(String(icon('printer', { size: 16 }))), tx('print'));
  const closeBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': t('common.close') }, raw(String(icon('x'))));
  const bar = h('header', { class: 'o-pp-bar' }, h('h2', { class: 'o-pp-title', id: id + '-t' }, tx('title')), count, h('span', { class: 'o-spacer' }), closeBtn);
  const side = h('aside', { class: 'o-pp-side', role: 'group', 'aria-label': tx('settings') },
    h('div', { class: 'o-pp-controls' }, field(tx('paper'), paperSel),
      h('div', { class: 'o-pp-field' }, h('span', { class: 'o-pp-field-label', 'aria-hidden': 'true' }, tx('orientation')), orientSeg),
      field(tx('margins'), marginSel), field(tx('scale'), scaleSel), h('label', { class: 'o-switch o-pp-bg-toggle' }, bgInput, h('span', null, tx('background')))),
    h('div', { class: 'o-pp-actions' }, printBtn, pdfBtn));
  const pagesEl = h('div', { class: 'o-pp-pages' });
  const stage = h('div', { class: 'o-pp-stage o-scroll', tabindex: '0', role: 'region', 'aria-label': tx('stage') }, pagesEl);
  const measure = h('div', { class: 'o-pp-measure o-theme-light', 'aria-hidden': 'true' });
  const dialog = h('div', { class: 'o-pp', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id + '-t' }, bar, h('div', { class: 'o-pp-body' }, stage, side), measure);
  const from = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : doc.documentElement;
  portal(dialog, from);
  let resolveClosed;
  const closed = new Promise(r => { resolveClosed = r; });
  const offs = [];
  const ov = overlays.open({ el: dialog, modal: true, trap: true, lockScroll: true, outside: false, onClose: reason => { offs.forEach(f => f()); dialog.remove(); resolveClosed(reason); } });
  animate(dialog, 'fadeIn', { duration: 160 });

  const state = { paper: o.paper, orientation: o.orientation, margins: o.margins, scale: o.scale, background: !!o.background };
  const handle = { el: dialog, pages: 0, closed, close: () => ov.close('api'), print: () => doPrint(), update: next => { Object.assign(state, next); render(); } };
  const headerFooter = (spec, ctx, defaults) => {
    let v = spec === undefined ? defaults : spec;
    if (v === false || v == null) return null;
    if (isFn(v)) v = v(ctx);
    if (v instanceof Node) return v;
    const slots = isObj(v) ? v : { left: v };
    return h('div', { class: 'o-pp-hf-row' }, ['left', 'center', 'right'].map(k => h('span', { class: 'o-pp-hf-' + k }, slots[k] instanceof Node ? slots[k] : fill(slots[k], ctx))));
  };
  let fitZoom = 1;
  const fitPages = () => {
    const first = pagesEl.firstElementChild;
    if (!first) return;
    const pw = first.offsetWidth, avail = stage.clientWidth - 32;
    fitZoom = pw > avail ? Math.max(0.2, avail / pw) : 1;
    pagesEl.style.zoom = fitZoom === 1 ? '' : String(fitZoom);
  };
  function render() {
    const { w, h: ph } = paperOf(state.paper, state.orientation), m = marginsOf(state.margins);
    const cw = (w - m.left - m.right) * MM, chh = (ph - m.top - m.bottom) * MM;
    const make = () => { const f = h('div', { class: 'o-pp-flow' }); if (src.node) f.append(printable(src.node)); else f.innerHTML = src.html; return f; };
    measure.replaceChildren();
    measure.style.width = cw + 'px';
    let flow = make(), scale = state.scale;
    measure.append(flow);
    if (scale === 'fit') {
      flow.style.width = cw + 'px';
      const natural = Math.max(flow.scrollWidth, ...[...flow.querySelectorAll('table, pre, img, svg')].map(e => e.getBoundingClientRect().width));
      scale = natural > cw + 1 ? cw / natural : 1;
    }
    scale = clamp(+scale || 1, 0.1, 4);
    flow.style.zoom = scale === 1 ? '' : String(scale);
    flow.style.width = cw / scale + 'px';
    const plan = paginate(flow, chh);
    const date = fmt.datetime(new Date()), n = plan.length;
    const pageEls = plan.map((entries, i) => {
      const ctx = { page: i + 1, pages: n, title, date, time: fmt.time(new Date()), url: isBrowser ? location.href : '' };
      const content = h('div', { class: 'o-pp-flow', style: `width:${cw / scale}px;${scale === 1 ? '' : 'zoom:' + scale}` });
      buildEntries(entries, content);
      const head = headerFooter(o.header, ctx, title ? { left: '{title}', right: '{date}' } : null);
      const foot = headerFooter(o.footer, ctx, o.showPageNumbers ? { right: tx('page', { page: '{page}', pages: '{pages}' }) } : null);
      return h('div', { class: 'o-pp-page o-theme-light', role: 'group', 'aria-label': tx('pageLabel', { page: i + 1 }), style: `--o-pp-w:${w}mm;--o-pp-h:${ph}mm` },
        h('div', { class: 'o-pp-hf o-pp-header', style: `top:0;height:${m.top}mm;inset-inline:${m.left}mm ${m.right}mm` }, head),
        h('div', { class: 'o-pp-content', style: `top:${m.top}mm;inset-inline:${m.left}mm ${m.right}mm;height:${ph - m.top - m.bottom}mm` }, content),
        h('div', { class: 'o-pp-hf o-pp-footer', style: `bottom:0;height:${m.bottom}mm;inset-inline:${m.left}mm ${m.right}mm` }, foot));
    });
    measure.replaceChildren();
    pagesEl.replaceChildren(...pageEls);
    pagesEl.classList.toggle('o-pp-nobg', !state.background);
    handle.pages = n;
    count.textContent = tx('pages', { count: n });
    fitPages();
    orientBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === state.orientation)));
  }
  async function doPrint() {
    if (o.onPrint && o.onPrint({ pages: handle.pages, paper: state.paper, orientation: state.orientation }) === false) return;
    printBtn.classList.add('is-loading');
    try {
      const body = [...pagesEl.children].map(p => p.outerHTML).join('');
      await printHTML(body, { paper: state.paper, orientation: state.orientation, background: state.background, title });
    } finally { printBtn.classList.remove('is-loading'); }
  }
  // wiring
  paperSel.addEventListener('change', () => { state.paper = paperSel.value; render(); });
  marginSel.addEventListener('change', () => { if (marginSel.value !== 'custom') state.margins = marginSel.value; render(); });
  scaleSel.addEventListener('change', () => { state.scale = scaleSel.value === 'fit' ? 'fit' : +scaleSel.value; render(); });
  bgInput.addEventListener('change', () => { state.background = bgInput.checked; pagesEl.classList.toggle('o-pp-nobg', !state.background); });
  orientSeg.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b && b.dataset.v !== state.orientation) { state.orientation = b.dataset.v; render(); } });
  printBtn.addEventListener('click', doPrint);
  closeBtn.addEventListener('click', () => handle.close());
  pdfBtn?.addEventListener('click', async () => {
    pdfBtn.classList.add('is-loading');
    try {
      const m = marginsOf(state.margins);
      await O.export.pdf(data.rows, { columns: data.columns, title, subtitle: o.subtitle, size: state.paper, orientation: state.orientation, margin: Math.max(18, Math.min(m.top, m.left) * 72 / 25.4), filename: o.filename || title || 'print' });
    } finally { pdfBtn.classList.remove('is-loading'); }
  });
  offs.push(on(dialog, 'keydown', e => { if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); doPrint(); } }));
  offs.push(observeResize(stage, rafThrottle(fitPages)));
  render();
  requestAnimationFrame(() => (printBtn.isConnected ? printBtn.focus() : null));
  announce(tx('pages', { count: handle.pages }));
  return handle;
}

/** Print without preview (native pagination, same @page settings). */
async function printDirect(target, opts = {}) {
  const o = { orientation: 'portrait', paper: 'A4', margins: 'default', background: true, ...opts };
  const src = sourceFor(target, o), m = marginsOf(o.margins);
  const holder = h('div');
  if (src.node) holder.append(printable(src.node)); else holder.innerHTML = src.html;
  const pageCSS = `@page { margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; } .o-pp-print { padding: 0; } thead { display: table-header-group; } tr { break-inside: avoid; }`;
  await printHTML(`<div class="o-pp-direct">${holder.innerHTML}</div>`, { ...o, title: o.title || src.title, pageCSS });
}

printPreview.print = printDirect;
printPreview.paginate = paginate;
O.printPreview = printPreview;
O.printTable = (rows, columns, opts = {}) => (opts.preview === false ? printDirect({ rows, columns, title: opts.title, subtitle: opts.subtitle }, opts) : printPreview({ rows, columns, title: opts.title, subtitle: opts.subtitle }, opts));
