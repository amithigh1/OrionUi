// @deps mentions, codeeditor
/* <o-editor> foundations: strings, icons, schema, DOM & selection helpers (shared by the editor files). */

i18n.add('en', {
  editor: {
    label: 'Rich text editor', placeholder: 'Start writing…', toolbar: 'Formatting', more: 'More tools', undo: 'Undo', redo: 'Redo',
    paragraph: 'Paragraph', heading: 'Heading {level}', blockType: 'Text style',
    bold: 'Bold', italic: 'Italic', underline: 'Underline', strike: 'Strikethrough', code: 'Inline code', superscript: 'Superscript', subscript: 'Subscript',
    color: 'Text color', highlight: 'Highlight color', defaultColor: 'Default', noHighlight: 'No highlight', customColor: 'Custom color',
    align: 'Alignment', alignLeft: 'Align left', alignCenter: 'Align center', alignRight: 'Align right', alignJustify: 'Justify',
    bulletList: 'Bulleted list', orderedList: 'Numbered list', checkList: 'Checklist', indent: 'Increase indent', outdent: 'Decrease indent',
    link: 'Link', insertLink: 'Insert link', editLink: 'Edit link', unlink: 'Remove link', openLink: 'Open link in new tab', url: 'URL', linkText: 'Text',
    newTab: 'Open in new tab', invalidUrl: 'Enter a valid URL, e.g. https://example.com, mailto: or /path',
    image: 'Image', insertImage: 'Insert image', upload: 'Upload', fromUrl: 'From URL', chooseFile: 'Choose image…', dropHint: 'You can also paste or drop images into the editor.',
    alt: 'Alt text', altHint: 'Describe the image for people using screen readers', imageUrl: 'Image URL', uploading: 'Uploading image…', uploaded: 'Image uploaded',
    uploadFailed: 'Image upload failed', imageTooLarge: 'Image is too large (max {size})', imageWidth: 'Image width', small: 'Small', medium: 'Medium', large: 'Large',
    full: 'Full width', original: 'Original size', removeImage: 'Remove image', editAlt: 'Edit alt text', imageSelected: 'Image selected: {alt}',
    table: 'Table', insertTable: 'Insert table', tableSize: '{rows} × {cols}', headerRow: 'Header row', rowAbove: 'Insert row above', rowBelow: 'Insert row below',
    colBefore: 'Insert column before', colAfter: 'Insert column after', deleteRow: 'Delete row', deleteCol: 'Delete column', deleteTable: 'Delete table', tableMenu: 'Table options',
    blockquote: 'Quote', codeBlock: 'Code block', language: 'Code language', hr: 'Divider', emoji: 'Emoji', clear: 'Clear formatting', source: 'HTML source',
    fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen', dir: 'Text direction', ltr: 'Left to right', rtl: 'Right to left', auto: 'Automatic',
    words: { one: '{count} word', other: '{count} words' }, chars: { one: '{count} character', other: '{count} characters' }, charsMax: '{count} / {max} characters',
    limit: 'Character limit reached', saved: 'Draft saved', restored: 'Draft restored', checked: 'Checked', unchecked: 'Unchecked',
    apply: 'Apply', remove: 'Remove', insert: 'Insert', slashHint: "Type '/' for commands",
    slash: {
      text: 'Text', textDesc: 'Start writing with plain text', h1: 'Heading 1', h1Desc: 'Big section heading', h2: 'Heading 2', h2Desc: 'Medium section heading',
      h3: 'Heading 3', h3Desc: 'Small section heading', h4: 'Heading 4', h4Desc: 'Subsection heading', ul: 'Bulleted list', ulDesc: 'Create a simple bulleted list',
      ol: 'Numbered list', olDesc: 'Create a list with numbering', check: 'Checklist', checkDesc: 'Track tasks with checkboxes', quote: 'Quote', quoteDesc: 'Capture a quotation',
      code: 'Code block', codeDesc: 'Syntax-highlighted code', table: 'Table', tableDesc: 'Insert a 3 × 3 table', image: 'Image', imageDesc: 'Upload or embed an image',
      hr: 'Divider', hrDesc: 'Visually divide sections', emoji: 'Emoji', emojiDesc: 'Pick an emoji',
    },
  },
});

/* ── icons (the global icon set wins when it has the same name) ──────── */
const ED_ICONS = {
  bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
  italic: '<path d="M19 4h-9M14 20H5M15 4 9 20"/>',
  underline: '<path d="M6 4v6a6 6 0 0 0 12 0V4M4 20h16"/>',
  strikethrough: '<path d="M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  superscript: '<path d="m4 19 8-8M12 19l-8-8"/><path d="M16 5.5a1.75 1.75 0 1 1 3.3.8L16 10h4"/>',
  subscript: '<path d="m4 5 8 8M12 5l-8 8"/><path d="M16 14.5a1.75 1.75 0 1 1 3.3.8L16 19h4"/>',
  heading: '<path d="M6 12h12M6 20V4M18 20V4"/>',
  pilcrow: '<path d="M13 4v16M17 4v16M19 4H9.5a4.5 4.5 0 0 0 0 9H13"/>',
  'text-color': '<path d="m6 16 6-12 6 12M8.5 11h7"/>',
  highlighter: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  'align-left': '<path d="M21 6H3M15 12H3M17 18H3"/>',
  'align-center': '<path d="M21 6H3M17 12H7M19 18H5"/>',
  'align-right': '<path d="M21 6H3M21 12H9M21 18H7"/>',
  'align-justify': '<path d="M3 6h18M3 12h18M3 18h18"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  'list-ordered': '<path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
  'list-checks': '<path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8"/>',
  indent: '<path d="m3 8 4 4-4 4M21 12H11M21 6H11M21 18H11"/>',
  outdent: '<path d="m7 8-4 4 4 4M21 12H11M21 6H11M21 18H11"/>',
  unlink: '<path d="m18.8 12.3 1.8-1.8a5 5 0 0 0-7.1-7.1l-1.7 1.7M5.2 11.8l-1.7 1.7a5 5 0 0 0 7.1 7.1l1.7-1.7M8 2v3M2 8h3M16 22v-3M22 16h-3"/>',
  table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  quote: '<path d="M10 11H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v4c0 3-1.5 5-4 6M20 11h-4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v4c0 3-1.5 5-4 6"/>',
  'code-block': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 10-2 2 2 2M14 10l2 2-2 2"/>',
  separator: '<path d="M3 12h18M8 8l4-4 4 4M16 16l-4 4-4-4"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
  eraser: '<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 19M22 21H7M5 11l9 9"/>',
  'code-xml': '<path d="m18 16 4-4-4-4M6 8l-4 4 4 4M14.5 4l-5 16"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  redo: '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>',
  'text-direction': '<path d="M9 4v10M13 4v10M15 4H8a3 3 0 0 0 0 6h1M4 20h16M17 17l3 3-3 3M7 17l-3 3 3 3"/>',
  type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
};
function edIcon(name, opts) {
  if (O.icons.has(name) || !ED_ICONS[name]) return icon(name, opts);
  return raw(`<svg class="o-icon o-icon-${esc(name)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ED_ICONS[name]}</svg>`);
}
const edIconEl = name => fromHTML(String(edIcon(name)));

/* ── schema ──────────────────────────────────────────────────────────── */
const ZW = '\u200b';
const TEXT_BLOCK_RE = /^(P|H[1-6]|PRE|LI|TD|TH)$/;
const BLOCK_RE = /^(P|H[1-6]|PRE|LI|TD|TH|UL|OL|BLOCKQUOTE|TABLE|THEAD|TBODY|TFOOT|TR|HR|DIV|FIGURE|FIGCAPTION|SECTION|ARTICLE|HEADER|FOOTER|MAIN|NAV|ASIDE|ADDRESS|DETAILS|SUMMARY|DL|DT|DD|CENTER)$/;
const isEl = n => !!n && n.nodeType === 1;
const isTextBlock = n => isEl(n) && TEXT_BLOCK_RE.test(n.nodeName);
const isBlockEl = n => isEl(n) && BLOCK_RE.test(n.nodeName);
const MARK_TAGS = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code', superscript: 'sup', subscript: 'sub' };
const MARK_MATCH = { strong: /^(STRONG|B)$/, em: /^(EM|I)$/, u: /^U$/, s: /^(S|STRIKE|DEL)$/, code: /^CODE$/, sup: /^SUP$/, sub: /^SUB$/ };
const isMarkEl = (el, tag) => isEl(el) && MARK_MATCH[tag] && MARK_MATCH[tag].test(el.nodeName) && !(tag === 'code' && el.parentElement && el.parentElement.nodeName === 'PRE');
const INLINE_STYLE = { color: el => el.nodeName === 'SPAN' && !!el.style.color, highlight: el => el.nodeName === 'MARK' || (el.nodeName === 'SPAN' && !!el.style.backgroundColor) };

/** Closest text block (p, h1-6, pre, li, td, th) containing node, inside root. */
function textBlockOf(node, root) {
  for (let n = node && node.nodeType !== 1 ? node.parentNode : node; n && n !== root; n = n.parentNode) if (isTextBlock(n)) return n;
  return null;
}
/** The direct child of root that contains node. */
function topBlockOf(node, root) {
  let n = node;
  while (n && n.parentNode !== root) n = n.parentNode;
  return n && n.parentNode === root ? n : null;
}
function closestIn(node, sel, root) {
  const el = node && (node.nodeType === 1 ? node : node.parentElement);
  const c = el && el.closest(sel);
  return c && root.contains(c) && c !== root ? c : null;
}
/** Does the range cover some of el's "own" content (for <li> excluding nested lists)? */
function coversOwn(range, el) {
  if (el.nodeName !== 'LI') return range.intersectsNode(el);
  for (const c of el.childNodes) if (!/^(UL|OL)$/.test(c.nodeName) && range.intersectsNode(c)) return true;
  return el.childNodes.length === 0 && range.intersectsNode(el);
}
/** Text blocks touched by the range, in document order. */
function textBlocksIn(range, root) {
  const start = textBlockOf(range.startContainer, root);
  if (range.collapsed) return start ? [start] : [];
  const out = [];
  const w = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, { acceptNode: n => (isTextBlock(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
  for (let n = w.nextNode(); n; n = w.nextNode()) if (range.intersectsNode(n) && coversOwn(range, n)) out.push(n);
  // a selection that ends at offset 0 of a block does not really include it
  const last = out[out.length - 1];
  if (out.length > 1 && last && atStartOf(range.endContainer, range.endOffset, last)) out.pop();
  return out.length ? out : start ? [start] : [];
}
function atStartOf(node, offset, block) {
  const r = doc.createRange();
  r.setStart(block, 0);
  try { r.setEnd(node, offset); } catch { return false; }
  const f = r.cloneContents();
  return !f.textContent.replace(/\u200b/g, '') && !f.querySelector('img,hr,.o-mention');
}
function atEndOf(node, offset, block) {
  const r = doc.createRange();
  try { r.setStart(node, offset); } catch { return false; }
  r.setEnd(block, block.childNodes.length);
  const f = r.cloneContents();
  f.querySelectorAll('ul,ol').forEach(x => x.remove());
  return !f.textContent.replace(/\u200b/g, '') && !f.querySelector('img,hr,.o-mention');
}
const hasText = n => !!(n.textContent.replace(/\u200b/g, '') || (n.querySelector && n.querySelector('img,hr,.o-mention,table')));
/** Block has no visible content (a lone <br> counts as empty). */
const isEmptyBlock = b => !b.textContent.replace(/[\u200b\n]/g, '') && !b.querySelector('img,hr,.o-mention,table,ul,ol');
/** Ensure an empty block keeps its height with a <br>; drop useless trailing <br>. */
function fixEmpty(b) {
  if (!b || !b.isConnected) return;
  if (b.nodeName === 'PRE') { const code = b.querySelector('code') || b; if (!code.textContent) code.textContent = ''; return; }
  if (isEmptyBlock(b)) {
    [...b.querySelectorAll('*')].forEach(el => { if (!el.hasAttribute('data-o-sel') && !el.querySelector('[data-o-sel]') && el.nodeName !== 'BR') el.remove(); });
    if (!b.querySelector('br')) b.append(h('br'));
    return;
  }
  const last = b.lastChild;
  if (last && last.nodeName === 'BR' && last.previousSibling && !(last.previousSibling.nodeName === 'BR') && b.nodeName !== 'TD' && b.nodeName !== 'TH') {
    // a trailing <br> is only needed when the line before it is empty
    const prev = last.previousSibling;
    if (!(prev.nodeType === 3 && /\n$/.test(prev.data))) last.remove();
  }
}

/* ── selection ───────────────────────────────────────────────────────── */
const getSelection = () => (isBrowser ? doc.getSelection() : null);
function selRange(root) {
  const s = getSelection();
  if (!s || !s.rangeCount) return null;
  const r = s.getRangeAt(0);
  return root.contains(r.commonAncestorContainer) ? r : null;
}
function setRange(r) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); return r; }
function caretAt(node, offset) { const r = doc.createRange(); r.setStart(node, offset); r.collapse(true); return setRange(r); }
function firstText(el, last) {
  const w = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let t = null;
  for (let n = w.nextNode(); n; n = w.nextNode()) { if (!last) return n; t = n; }
  return t;
}
/** Place the caret at the start/end of an element's text. */
function caretIn(el, atEnd = false) {
  const r = doc.createRange();
  const nested = el.nodeName === 'LI' ? [...el.childNodes].find(c => /^(UL|OL)$/.test(c.nodeName)) : null;
  if (atEnd && nested) {
    const prev = nested.previousSibling;
    if (prev && prev.nodeType === 3) r.setStart(prev, prev.length);
    else r.setStartBefore(nested);
  } else {
    const t = firstText(el, atEnd);
    if (t && !(t.parentElement && t.parentElement.closest('.o-mention'))) r.setStart(t, atEnd ? t.length : 0);
    else {
      const br = atEnd ? el.lastChild : null;
      if (br && br.nodeName === 'BR') r.setStartBefore(br); else r.setStart(el, atEnd ? el.childNodes.length : 0);
    }
  }
  r.collapse(true);
  return setRange(r);
}

/* selection markers: survive DOM restructuring, then restore the exact selection */
const marker = k => { const m = doc.createElement('span'); m.setAttribute('data-o-sel', k); return m; };
function markSel(r) {
  const e = marker('e');
  const re = r.cloneRange(); re.collapse(false); re.insertNode(e);
  let s = null;
  if (!r.collapsed) { s = marker('s'); const rs = r.cloneRange(); rs.collapse(true); rs.insertNode(s); }
  return { s, e };
}
function markerPos(mk) {
  const p = mk.parentNode, prev = mk.previousSibling, next = mk.nextSibling;
  mk.remove();
  if (prev && prev.nodeType === 3) {
    const off = prev.length;
    if (next && next.nodeType === 3) { prev.appendData(next.data); next.remove(); }
    return [prev, off];
  }
  if (next && next.nodeType === 3) return [next, 0];
  return [p, prev ? Array.prototype.indexOf.call(p.childNodes, prev) + 1 : 0];
}
function restoreSel(m) {
  if (!m) return null;
  const r = doc.createRange();
  const sp = m.s && m.s.isConnected ? markerPos(m.s) : null;
  const ep = m.e && m.e.isConnected ? markerPos(m.e) : null;
  if (!ep && !sp) return null;
  const a = sp || ep, b = ep || sp;
  r.setStart(a[0], Math.min(a[1], a[0].nodeType === 3 ? a[0].length : a[0].childNodes.length));
  r.setEnd(b[0], Math.min(b[1], b[0].nodeType === 3 ? b[0].length : b[0].childNodes.length));
  return setRange(r);
}
/** Text nodes between the two markers (document order). */
function textsBetween(m, root) {
  const out = [];
  if (!m.s) return out;
  const w = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  w.currentNode = m.s;
  for (let n = w.nextNode(); n && n !== m.e; n = w.nextNode()) if (n.nodeType === 3 && n.data.length) out.push(n);
  return out;
}
/** Split the text node / inline ancestors so that `node` can be pulled out of `anc` (the mark element). */
function isolate(anc, node) {
  const has = f => !!(f.textContent || f.querySelector('img,br,.o-mention'));
  const before = doc.createRange(); before.setStart(anc, 0); before.setEndBefore(node);
  const after = doc.createRange(); after.setStartAfter(node); after.setEnd(anc, anc.childNodes.length);
  const fa = after.extractContents(), fb = before.extractContents();
  const put = (f, where) => {
    if (has(f)) { const c = anc.cloneNode(false); c.append(f); anc[where](c); }
    else f.querySelectorAll('[data-o-sel]').forEach(mk => anc[where](mk));
  };
  put(fb, 'before');
  put(fa, 'after');
  anc.replaceWith(...anc.childNodes);
}
/** Unwrap an element (keep children). */
function unwrap(el) { el.replaceWith(...el.childNodes); }
/** Replace the tag of an element, keeping children and alignment/direction. */
function retag(el, tag, keep = ['style', 'dir']) {
  if (el.nodeName.toLowerCase() === tag) return el;
  const n = doc.createElement(tag);
  keep.forEach(a => { if (el.hasAttribute(a)) n.setAttribute(a, el.getAttribute(a)); });
  if (n.getAttribute('style')) { const align = el.style.textAlign; n.removeAttribute('style'); if (align) n.style.textAlign = align; }
  n.append(...el.childNodes);
  el.replaceWith(n);
  return n;
}
/** Extract [caret → end of block] as a new sibling block of the same (or given) tag. */
function splitBlock(block, node, offset, tag) {
  const r = doc.createRange();
  r.setStart(node, offset);
  r.setEnd(block, block.childNodes.length);
  const tail = r.extractContents();
  const nb = doc.createElement(tag || block.nodeName.toLowerCase());
  ['style', 'dir', 'data-checked'].forEach(a => { if (block.hasAttribute(a)) nb.setAttribute(a, block.getAttribute(a)); });
  if (nb.hasAttribute('data-checked')) nb.setAttribute('data-checked', 'false');
  nb.append(tail);
  // drop empty inline clones created by extractContents
  nb.querySelectorAll('strong,em,u,s,code,sup,sub,span,mark,a').forEach(el => { if (!hasText(el) && !el.querySelector('[data-o-sel],br')) el.remove(); });
  block.after(nb);
  return nb;
}
const isMac = isBrowser && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const modOf = e => (isMac ? e.metaKey : e.ctrlKey);
/** "Mod+Shift+K" -> "⌘⇧K" / "Ctrl+Shift+K" */
const keyLabel = k => (!k ? '' : isMac ? k.replace(/Mod\+/g, '⌘').replace(/Shift\+/g, '⇧').replace(/Alt\+/g, '⌥') : k.replace(/Mod\+/g, 'Ctrl+'));
