/* Command layer for <o-editor>: pure DOM + Range operations (no document.execCommand).
 * Every command receives the editor (`ed.root` = content element, `ed.range()` = current range inside it). */

/* ── helpers ───────────────────────────────────────────────────────── */
function closestMark(node, tag, root) {
  for (let n = node && node.nodeType === 3 ? node.parentNode : node; n && n !== root; n = n.parentNode) { if (isMarkEl(n, tag)) return n; if (isTextBlock(n)) return null; }
  return null;
}
function closestMatch(node, fn, root) {
  for (let n = node && node.nodeType === 3 ? node.parentNode : node; n && n !== root && !isTextBlock(n); n = n.parentNode) if (n.nodeType === 1 && fn(n)) return n;
  return null;
}
const FORMAT_EL = n => /^(STRONG|B|EM|I|U|S|STRIKE|DEL|CODE|SUP|SUB|SPAN|MARK|FONT)$/.test(n.nodeName) && !n.classList.contains('o-mention');
/** Text nodes intersecting the range with a non-empty intersection. */
function textsIn(range, root) {
  const out = [];
  const base = range.commonAncestorContainer;
  if (base.nodeType === 3) return base.data.replace(/[\s​]/g, '') ? [base] : [];
  const w = doc.createTreeWalker(base, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!range.intersectsNode(n) || !n.data.replace(/[\s​]/g, '')) continue;
    if (n === range.endContainer && range.endOffset === 0) continue;
    if (n === range.startContainer && range.startOffset >= n.length) continue;
    if (!textBlockOf(n, root)) continue;
    out.push(n);
  }
  return out;
}
function markActive(root, range, tag) {
  if (!range) return false;
  if (range.collapsed) return !!closestMark(range.startContainer, tag, root);
  const texts = textsIn(range, root).filter(n => !n.parentElement.closest('.o-mention'));
  return texts.length > 0 && texts.every(n => closestMark(n, tag, root));
}
function styleAt(root, range, kind) {
  if (!range) return '';
  const el = closestMatch(range.startContainer, INLINE_STYLE[kind], root);
  return el ? (kind === 'color' ? el.style.color : el.style.backgroundColor) : '';
}
/** Text between the selection markers that belongs to editable text blocks. */
const editableTexts = (m, root) => textsBetween(m, root).filter(t => textBlockOf(t, root) && !t.parentElement.closest('pre,.o-mention'));
const blocksOfTexts = (texts, root) => new Set(texts.map(t => textBlockOf(t, root)).filter(Boolean));
/** Leave the inline element `mk` at the caret: split it and continue typing outside (re-creating inner marks). */
function exitInline(mk, r, keepInner = true) {
  if (!mk.textContent.replace(/​/g, '')) { const z = doc.createTextNode(ZW); mk.replaceWith(z); caretAt(z, 1); return; }
  const inner = [];
  if (keepInner) for (let n = r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer; n && n !== mk; n = n.parentNode) inner.push(n.cloneNode(false));
  const tail = doc.createRange();
  tail.setStart(r.startContainer, r.startOffset);
  tail.setEnd(mk, mk.childNodes.length);
  const frag = tail.extractContents();
  const z = doc.createTextNode(ZW);
  let holder = z;
  inner.forEach(c => { c.append(holder); holder = c; });
  mk.after(holder);
  if (hasText(frag)) { const m2 = mk.cloneNode(false); m2.append(frag); holder.after(m2); }
  if (!hasText(mk)) mk.remove();
  caretAt(z, 1);
}
/** Flatten an element's text (with <br> as \n) and remember where selection markers were. */
function flatText(el, acc = { text: '', marks: [] }) {
  for (const c of [...el.childNodes]) {
    if (c.nodeType === 3) acc.text += c.data.replace(/​/g, '');
    else if (c.nodeType !== 1) continue;
    else if (c.hasAttribute('data-o-sel')) acc.marks.push([c, acc.text.length]);
    else if (c.nodeName === 'BR') acc.text += '\n';
    else if (!/^(UL|OL)$/.test(c.nodeName)) flatText(c, acc);
  }
  return acc;
}
/** Append text[from..] to el, re-inserting markers at their offsets. */
function fillText(el, text, marks, from = 0) {
  const to = from + text.length;
  const ms = marks.filter(([mk, o]) => o >= from && o <= to && !mk.__oUsed).sort((a, b) => a[1] - b[1]);
  let pos = from;
  ms.forEach(([mk, o]) => { if (o > pos) el.append(text.slice(pos - from, o - from)); el.append(mk); mk.__oUsed = true; pos = o; });
  if (to > pos) el.append(text.slice(pos - from));
}

/* ── inline marks ──────────────────────────────────────────────────── */
function cmdMark(ed, tag) {
  const root = ed.root, r = ed.range();
  if (!r || closestIn(r.startContainer, 'pre', root)) return false;
  const active = markActive(root, r, tag);
  const other = tag === 'sup' ? 'sub' : tag === 'sub' ? 'sup' : null;
  if (r.collapsed) {
    if (active) exitInline(closestMark(r.startContainer, tag, root), r);
    else {
      if (other) { const o2 = closestMark(r.startContainer, other, root); if (o2) exitInline(o2, r); }
      const r2 = ed.range();
      const w = doc.createElement(tag), z = doc.createTextNode(ZW);
      w.append(z);
      r2.insertNode(w);
      caretAt(z, 1);
    }
    return true;
  }
  const m = markSel(r);
  const texts = editableTexts(m, root);
  texts.forEach(t => {
    if (active) { let mk; while ((mk = closestMark(t, tag, root))) isolate(mk, t); return; }
    if (other) { let mk; while ((mk = closestMark(t, other, root))) isolate(mk, t); }
    if (!closestMark(t, tag, root)) { const w = doc.createElement(tag); t.before(w); w.append(t); }
  });
  blocksOfTexts(texts, root).forEach(normInline);
  restoreSel(m);
  return true;
}
/** color / highlight: value '' removes. */
function cmdStyle(ed, kind, color) {
  const root = ed.root, r = ed.range();
  if (!r || closestIn(r.startContainer, 'pre', root)) return false;
  const match = INLINE_STYLE[kind];
  const make = () => { const el = doc.createElement(kind === 'highlight' ? 'mark' : 'span'); if (kind === 'highlight') el.style.backgroundColor = color; else el.style.color = color; return el; };
  if (r.collapsed) {
    const cur = closestMatch(r.startContainer, match, root);
    if (cur) exitInline(cur, r);
    if (color) { const r2 = ed.range(), w = make(), z = doc.createTextNode(ZW); w.append(z); r2.insertNode(w); caretAt(z, 1); }
    return true;
  }
  const m = markSel(r);
  const texts = editableTexts(m, root);
  texts.forEach(t => {
    let mk;
    while ((mk = closestMatch(t, match, root))) isolate(mk, t);
    if (color) { const w = make(); t.before(w); w.append(t); }
  });
  blocksOfTexts(texts, root).forEach(normInline);
  restoreSel(m);
  return true;
}
function cmdClear(ed) {
  const root = ed.root, r = ed.range();
  if (!r) return false;
  const blocks = textBlocksIn(r, root);
  if (r.collapsed) {
    const b = textBlockOf(r.startContainer, root);
    let top = null;
    for (let n = r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer; n && n !== b && n !== root; n = n.parentNode) if (n.nodeType === 1 && FORMAT_EL(n)) top = n;
    if (top) exitInline(top, r, false);
  } else {
    const m = markSel(r);
    const texts = textsBetween(m, root).filter(t => textBlockOf(t, root) && !t.parentElement.closest('pre'));
    texts.forEach(t => { let mk; while ((mk = closestMatch(t, FORMAT_EL, root))) isolate(mk, t); });
    blocks.forEach(normInline);
    restoreSel(m);
  }
  blocks.forEach(b => { if (b.style) { b.style.textAlign = ''; if (!b.getAttribute('style')) b.removeAttribute('style'); } });
  return true;
}

/* ── blocks ────────────────────────────────────────────────────────── */
function preToBlocks(pre, tag) {
  const acc = flatText(pre.querySelector('code') || pre);
  const lines = acc.text.replace(/\n$/, '').split('\n');
  let off = 0, last = pre;
  const made = lines.map(line => {
    const b = doc.createElement(tag);
    fillText(b, line, acc.marks, off);
    off += line.length + 1;
    last.after(b);
    last = b;
    fixEmpty(b);
    return b;
  });
  acc.marks.forEach(([mk]) => { if (!mk.__oUsed) made[made.length - 1].append(mk); delete mk.__oUsed; });
  pre.remove();
  return made;
}
function cmdBlock(ed, tag) {
  const root = ed.root, r = ed.range();
  if (!r) return false;
  const blocks = textBlocksIn(r, root).filter(b => !/^(TD|TH)$/.test(b.nodeName));
  const m = markSel(r);
  blocks.forEach(b => {
    if (b.nodeName === 'PRE') { preToBlocks(b, tag); return; }
    if (b.nodeName === 'LI') b = liftLi(b);
    fixEmpty(retag(b, tag));
  });
  restoreSel(m);
  return true;
}
function cmdQuote(ed) {
  const root = ed.root, r = ed.range();
  if (!r) return false;
  const blocks = textBlocksIn(r, root);
  if (!blocks.length) return false;
  const quotes = blocks.map(b => closestIn(b, 'blockquote', root));
  const m = markSel(r);
  if (quotes.every(Boolean)) new Set(quotes).forEach(q => { if (q.isConnected) unwrap(q); });
  else {
    const units = [];
    blocks.forEach(b => { let u = b; while (u.parentNode !== root && u.parentNode.nodeName !== 'BLOCKQUOTE') u = u.parentNode; if (!units.includes(u)) units.push(u); });
    const parent = units[0].parentNode;
    const bq = doc.createElement('blockquote');
    units[0].before(bq);
    units.filter(u => u.parentNode === parent).forEach(u => bq.append(/^(PRE|TABLE|UL|OL|HR|P|BLOCKQUOTE)$/.test(u.nodeName) ? u : retag(u, 'p')));
  }
  restoreSel(m);
  return true;
}
function cmdCodeBlock(ed, lang) {
  const root = ed.root, r = ed.range();
  if (!r) return false;
  const blocks = textBlocksIn(r, root).filter(b => !/^(TD|TH)$/.test(b.nodeName));
  if (!blocks.length) return false;
  const m = markSel(r);
  if (blocks.length === 1 && blocks[0].nodeName === 'PRE') {
    if (lang) blocks[0].setAttribute('data-lang', lang); else preToBlocks(blocks[0], 'p');
    restoreSel(m);
    return true;
  }
  const acc = { text: '', marks: [] };
  blocks.forEach((b, i) => { if (i) acc.text += '\n'; flatText(b, acc); });
  const code = h('code'), pre = h('pre', lang ? { 'data-lang': lang } : {}, code);
  fillText(code, acc.text, acc.marks);
  acc.marks.forEach(([mk]) => { if (!mk.__oUsed) code.append(mk); delete mk.__oUsed; });
  const anchor = blocks[0].nodeName === 'LI' ? liftLi(blocks[0]) : blocks[0];
  anchor.replaceWith(pre);
  blocks.slice(1).forEach(b => { if (!b.isConnected) return; if (b.nodeName === 'LI') liftLi(b).remove(); else b.remove(); });
  root.querySelectorAll('ul:empty,ol:empty,blockquote:empty').forEach(x => x.remove());
  restoreSel(m);
  return true;
}
function cmdAlign(ed, value) {
  const r = ed.range();
  if (!r) return false;
  textBlocksIn(r, ed.root).forEach(b => {
    if (b.nodeName === 'PRE') return;
    b.style.textAlign = !value || value === 'left' || value === 'start' ? '' : value;
    if (!b.getAttribute('style')) b.removeAttribute('style');
  });
  return true;
}
function cmdDir(ed, value) {
  const r = ed.range();
  if (!r) return false;
  const blocks = textBlocksIn(r, ed.root);
  const cur = blocks[0] ? dirOf(blocks[0]) : 'ltr';
  const v = value || (cur === 'rtl' ? 'ltr' : 'rtl');
  blocks.forEach(b => { if (v === 'inherit') b.removeAttribute('dir'); else b.setAttribute('dir', v); });
  return true;
}
function insertBlockAfterCaret(ed, node, { replaceEmpty = true } = {}) {
  const root = ed.root, r = ed.range();
  const b = r ? textBlockOf(r.startContainer, root) : null;
  const cell = b && /^(TD|TH|LI)$/.test(b.nodeName) ? b : null;
  let top = b ? (cell ? topBlockOf(b, root) : b.parentNode === root || b.parentNode.nodeName === 'BLOCKQUOTE' ? b : topBlockOf(b, root)) : null;
  if (b && !cell && replaceEmpty && isEmptyBlock(b) && b.nodeName !== 'PRE') { b.replaceWith(node); return node; }
  if (b && !cell && b.nodeName !== 'PRE' && r && r.collapsed && !atEndOf(r.startContainer, r.startOffset, b) && !atStartOf(r.startContainer, r.startOffset, b)) {
    splitBlock(b, r.startContainer, r.startOffset);
    b.after(node);
    return node;
  }
  if (b && !cell && r && atStartOf(r.startContainer, r.startOffset, b) && !isEmptyBlock(b)) { top.before(node); return node; }
  if (top) top.after(node); else root.append(node);
  return node;
}
function cmdHr(ed) {
  const hr = h('hr');
  insertBlockAfterCaret(ed, hr);
  let next = hr.nextElementSibling;
  if (!next || !isTextBlock(next) || next.nodeName === 'PRE') { next = h('p', {}, h('br')); hr.after(next); }
  caretIn(next);
  return true;
}

/* ── lists ─────────────────────────────────────────────────────────── */
const listTypeOf = l => (l.nodeName === 'OL' ? 'ol' : l.getAttribute('data-type') === 'check' ? 'check' : 'ul');
function makeList(type) { const l = doc.createElement(type === 'ol' ? 'ol' : 'ul'); if (type === 'check') l.setAttribute('data-type', 'check'); return l; }
function setListType(list, type) {
  let l = list;
  if ((type === 'ol') !== (list.nodeName === 'OL')) { l = doc.createElement(type === 'ol' ? 'ol' : 'ul'); if (list.getAttribute('dir')) l.setAttribute('dir', list.getAttribute('dir')); l.append(...list.childNodes); list.replaceWith(l); }
  if (type === 'check') { l.setAttribute('data-type', 'check'); [...l.children].forEach(li => { if (!li.hasAttribute('data-checked')) li.setAttribute('data-checked', 'false'); }); }
  else { l.removeAttribute('data-type'); [...l.children].forEach(li => li.removeAttribute('data-checked')); }
  return l;
}
/** Turn a list item into a paragraph (outdenting nested items first; the list is split around it). */
function liftLi(li) {
  let list = li.parentElement;
  while (list.parentElement && list.parentElement.nodeName === 'LI') { outdentLi(li); list = li.parentElement; }
  const items = [...list.children], idx = items.indexOf(li);
  const after = items.slice(idx + 1);
  const nested = [...li.children].filter(c => /^(UL|OL)$/.test(c.nodeName));
  const p = doc.createElement('p');
  ['dir', 'style'].forEach(a => { if (li.getAttribute(a)) p.setAttribute(a, li.getAttribute(a)); });
  p.append(...[...li.childNodes].filter(c => !nested.includes(c)));
  list.after(p);
  if (after.length || nested.length) {
    const tail = list.cloneNode(false);
    if (list.nodeName === 'OL') tail.setAttribute('start', String((+list.getAttribute('start') || 1) + idx + 1));
    nested.forEach(n => tail.append(...n.children));
    tail.append(...after);
    p.after(tail);
  }
  li.remove();
  if (!list.children.length) list.remove();
  fixEmpty(p);
  return p;
}
function outdentLi(li) {
  const list = li.parentElement, parentLi = list.parentElement;
  if (!parentLi || parentLi.nodeName !== 'LI') return liftLi(li);
  const items = [...list.children], after = items.slice(items.indexOf(li) + 1);
  if (after.length) {
    let sub = [...li.children].find(c => /^(UL|OL)$/.test(c.nodeName));
    if (!sub) { sub = list.cloneNode(false); sub.removeAttribute('start'); li.append(sub); }
    sub.append(...after);
  }
  parentLi.after(li);
  if (!list.children.length) list.remove();
  const nl = li.parentElement;
  if (listTypeOf(nl) === 'check') { if (!li.hasAttribute('data-checked')) li.setAttribute('data-checked', 'false'); } else li.removeAttribute('data-checked');
  return li;
}
function indentLi(li) {
  const prev = li.previousElementSibling;
  if (!prev || prev.nodeName !== 'LI') return false;
  const list = li.parentElement;
  let sub = prev.lastElementChild;
  if (!sub || !/^(UL|OL)$/.test(sub.nodeName)) { sub = list.cloneNode(false); sub.removeAttribute('start'); prev.append(sub); }
  sub.append(li);
  return true;
}
function cmdList(ed, type) {
  const root = ed.root, r = ed.range();
  if (!r) return false;
  const blocks = textBlocksIn(r, root).filter(b => !/^(TD|TH)$/.test(b.nodeName) && !closestIn(b, 'td,th', root));
  if (!blocks.length) return false;
  const m = markSel(r);
  if (blocks.every(b => b.nodeName === 'LI' && listTypeOf(b.parentElement) === type)) blocks.forEach(li => { if (li.isConnected) liftLi(li); });
  else {
    const done = new Set();
    blocks.forEach(b => {
      if (b.nodeName === 'LI') { const l = b.parentElement; if (!done.has(l) && listTypeOf(l) !== type) done.add(setListType(l, type)); return; }
      const li = doc.createElement('li');
      if (type === 'check') li.setAttribute('data-checked', 'false');
      if (b.getAttribute('dir')) li.setAttribute('dir', b.getAttribute('dir'));
      if (b.nodeName === 'PRE') fillText(li, flatText(b).text.replace(/\n/g, ' '), []);
      else li.append(...b.childNodes);
      const prev = b.previousElementSibling;
      if (prev && /^(UL|OL)$/.test(prev.nodeName) && listTypeOf(prev) === type) prev.append(li);
      else { const l = makeList(type); b.before(l); l.append(li); }
      b.remove();
      const list = li.parentElement, next = list.nextElementSibling;
      if (next && /^(UL|OL)$/.test(next.nodeName) && listTypeOf(next) === type) { list.append(...next.childNodes); next.remove(); }
      fixEmpty(li);
    });
  }
  restoreSel(m);
  return true;
}
/** Tab / Shift+Tab: list nesting, or code block indentation. */
function cmdIndent(ed, dir = 1) {
  const root = ed.root, r = ed.range();
  if (!r) return false;
  const pre = closestIn(r.startContainer, 'pre', root);
  if (pre) return indentPre(ed, pre, r, dir);
  const lis = textBlocksIn(r, root).filter(b => b.nodeName === 'LI');
  const tops = lis.filter(li => !lis.some(o => o !== li && o.contains(li)));
  if (!tops.length) return false;
  const m = markSel(r);
  let changed = false;
  tops.forEach(li => { changed = (dir > 0 ? indentLi(li) : !!outdentLi(li)) || changed; });
  restoreSel(m);
  return changed;
}
function indentPre(ed, pre, r, dir) {
  const code = pre.querySelector('code') || pre;
  const m = markSel(r);
  const acc = flatText(code);
  const pos = new Map(acc.marks.map(([mk, o]) => [mk, o]));
  const s = pos.get(m.s) ?? pos.get(m.e), e = pos.get(m.e);
  const text = acc.text;
  const ls = text.lastIndexOf('\n', s - 1) + 1;
  let out = '', shiftS = 0, shiftE = 0, i = 0;
  const lines = text.split('\n');
  let off = 0;
  lines.forEach((line, k) => {
    const lineStart = off, lineEnd = off + line.length;
    const inSel = lineEnd >= ls && lineStart <= e && (lineStart <= e && (k === 0 || lineStart !== e || s === e));
    let nl = line;
    if (inSel && (s !== e || lineStart === ls)) {
      if (dir > 0) { nl = '  ' + line; if (lineStart <= s) shiftS += 2; shiftE += 2; }
      else { const rm = (line.match(/^ {1,2}/) || [''])[0].length; nl = line.slice(rm); if (lineStart <= s) shiftS -= Math.min(rm, s - lineStart); shiftE -= rm; }
    }
    out += (k ? '\n' : '') + nl;
    off = lineEnd + 1;
    i++;
  });
  if (s === e && dir > 0 && !text.slice(ls, s).trim()) { /* caret in leading whitespace: plain indent handled above */ }
  code.replaceChildren();
  m.s && m.s.remove();
  m.e.remove();
  const ns = Math.max(ls, s + shiftS), ne = Math.max(ns, e + shiftE);
  const marks = m.s ? [[m.s, ns], [m.e, ne]] : [[m.e, ne]];
  fillText(code, out, marks);
  marks.forEach(([mk]) => delete mk.__oUsed);
  restoreSel(m);
  return true;
}
function toggleCheck(li, value) { const v = value ?? li.getAttribute('data-checked') !== 'true'; li.setAttribute('data-checked', String(v)); return v; }

/* ── links ─────────────────────────────────────────────────────────── */
function linkAt(root, r) { return r ? closestIn(r.startContainer, 'a[href]', root) || (!r.collapsed ? closestIn(r.endContainer, 'a[href]', root) : null) : null; }
/** Validate / complete a URL typed by a user. Returns '' (empty), null (invalid) or the URL. */
function normalizeUrl(u) {
  u = String(u ?? '').trim();
  if (!u) return '';
  if (/^(javascript|vbscript|data|file):/i.test(u.replace(/[\s\x00-\x1f]/g, ''))) return null;
  if (/^https?:\/\//i.test(u)) return /^https?:\/\/[^\s/?#.]+(\.[^\s/?#.]+)*(:\d+)?([/?#]\S*)?$/i.test(u) ? u : null;
  if (/^(mailto:|tel:)\S+$/i.test(u) || /^(\/|#|\?|\.\.?\/)\S*$/.test(u) || /^ftp:\/\/\S+$/i.test(u)) return u;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(u)) return 'mailto:' + u;
  if (/^\+?[\d\s().-]{7,}$/.test(u)) return 'tel:' + u.replace(/[^\d+]/g, '');
  if (/^(localhost|[a-z0-9-]+(\.[a-z0-9-]+)+)(:\d+)?([/?#]\S*)?$/i.test(u)) return 'https://' + u;
  return null;
}
function cmdLink(ed, value) {
  const o = isStr(value) ? { href: value } : (value || {});
  const href = normalizeUrl(o.href);
  if (!href) return false;
  const root = ed.root, r = ed.range();
  if (!r) return false;
  const newTab = o.newTab ?? (o.target === '_blank');
  const apply = a => { a.setAttribute('href', href); if (newTab) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } else { a.removeAttribute('target'); a.removeAttribute('rel'); } if (o.title) a.title = o.title; };
  const existing = linkAt(root, r);
  if (r.collapsed) {
    if (existing) { apply(existing); if (o.text && o.text !== existing.textContent) existing.textContent = o.text; return true; }
    const a = h('a', {}, o.text || href.replace(/^(mailto|tel):/, ''));
    apply(a);
    r.insertNode(a);
    const z = doc.createTextNode(ZW);
    a.after(z);
    caretAt(z, 1);
    return true;
  }
  const m = markSel(r);
  const span = doc.createRange(); span.setStartAfter(m.s); span.setEndBefore(m.e);
  [...root.querySelectorAll('a')].forEach(a => { if (span.intersectsNode(a)) unwrap(a); });
  const texts = textsBetween(m, root).filter(t => textBlockOf(t, root) && !t.parentElement.closest('pre'));
  const groups = new Map();
  texts.forEach(t => { const b = textBlockOf(t, root); if (!groups.has(b)) groups.set(b, []); groups.get(b).push(t); });
  groups.forEach(list => {
    const rr = doc.createRange();
    rr.setStartBefore(topInBlock(list[0], textBlockOf(list[0], root), m));
    rr.setEndAfter(topInBlock(list[list.length - 1], textBlockOf(list[0], root), m));
    const frag = rr.extractContents();
    frag.querySelectorAll('a').forEach(unwrap);
    const a = h('a');
    apply(a);
    a.append(frag);
    rr.insertNode(a);
  });
  groups.forEach((_, b) => normInline(b));
  restoreSel(m);
  return true;
}
/** Highest ancestor of t (inside block) that lies fully between the markers — keeps partial marks intact. */
function topInBlock(t, block, m) {
  let n = t;
  while (n.parentNode && n.parentNode !== block) {
    const p = n.parentNode;
    const r = doc.createRange(); r.setStartAfter(m.s); r.setEndBefore(m.e);
    if (!(r.isPointInRange(p, 0) && r.isPointInRange(p, p.childNodes.length))) break;
    n = p;
  }
  return n;
}
function cmdUnlink(ed) {
  const root = ed.root, r = ed.range();
  if (!r) return false;
  const m = markSel(r);
  const a = linkAt(root, r);
  if (r.collapsed || !m.s) { if (a) unwrap(a); }
  else {
    const span = doc.createRange(); span.setStartBefore(m.s); span.setEndAfter(m.e);
    [...root.querySelectorAll('a')].forEach(x => { if (span.intersectsNode(x)) unwrap(x); });
  }
  restoreSel(m);
  return true;
}

/* ── images ────────────────────────────────────────────────────────── */
function insertImage(ed, o) {
  const root = ed.root;
  let r = ed.range();
  if (!r) { caretIn(root.lastElementChild || root, true); r = ed.range(); }
  const img = h('img', { src: o.src, alt: o.alt || '' });
  if (o.width) img.setAttribute('width', String(o.width));
  if (!r.collapsed) r.deleteContents();
  const b = textBlockOf(r.startContainer, root);
  if (!b || b.nodeName === 'PRE') {
    const p = h('p', {}, img);
    if (b) b.after(p); else root.append(p);
  } else {
    r.insertNode(img);
    const br = img.nextSibling;
    if (br && br.nodeName === 'BR' && !br.nextSibling) br.remove();
  }
  const after = doc.createRange();
  after.setStartAfter(img);
  after.collapse(true);
  setRange(after);
  return img;
}

/* ── tables ────────────────────────────────────────────────────────── */
function cmdTable(ed, o = {}) {
  const rows = clamp(+o.rows || 3, 1, 50), cols = clamp(+o.cols || 3, 1, 20), header = o.header !== false;
  const table = h('table');
  const cell = tag => h(tag, {}, h('br'));
  if (header) table.append(h('thead', {}, h('tr', {}, Array.from({ length: cols }, () => cell('th')))));
  const body = h('tbody');
  for (let i = 0; i < rows - (header ? 1 : 0); i++) body.append(h('tr', {}, Array.from({ length: cols }, () => cell('td'))));
  if (body.children.length) table.append(body);
  insertBlockAfterCaret(ed, table);
  const next = table.nextElementSibling;
  if (!next || next.nodeName !== 'P') table.after(h('p', {}, h('br')));
  caretIn(table.rows[0].cells[0]);
  return true;
}
function cellInfo(root, node) {
  const cell = closestIn(node, 'td,th', root);
  if (!cell) return null;
  const tr = cell.parentElement;
  return { cell, tr, table: tr.closest('table'), col: cell.cellIndex };
}
function cmdTableOp(ed, op) {
  const root = ed.root, r = ed.range();
  const info = r && cellInfo(root, r.startContainer);
  if (!info) return false;
  const { tr, table, col } = info;
  const inHead = tr.parentElement.nodeName === 'THEAD';
  const mk = tag => h(tag, {}, h('br'));
  const body = () => table.tBodies[0] || table.appendChild(h('tbody'));
  const removeTable = () => { const p = h('p', {}, h('br')); table.replaceWith(p); caretIn(p); };
  if (op === 'rowAbove' || op === 'rowBelow') {
    const above = op === 'rowAbove';
    const nr = h('tr', {}, [...tr.cells].map(() => mk(inHead && above ? 'th' : 'td')));
    if (inHead && !above) body().prepend(nr); else if (above) tr.before(nr); else tr.after(nr);
    caretIn(nr.cells[Math.min(col, nr.cells.length - 1)]);
  } else if (op === 'colBefore' || op === 'colAfter') {
    let target = null;
    [...table.rows].forEach(row => {
      const ref = row.cells[Math.min(col, row.cells.length - 1)];
      const c = mk(row.parentElement.nodeName === 'THEAD' ? 'th' : 'td');
      if (!ref) row.append(c); else if (op === 'colBefore') ref.before(c); else ref.after(c);
      if (row === tr) target = c;
    });
    caretIn(target);
  } else if (op === 'deleteRow') {
    const next = tr.nextElementSibling || tr.previousElementSibling;
    const sect = tr.parentElement;
    tr.remove();
    if (!sect.rows.length) sect.remove();
    if (!table.rows.length) return removeTable(), true;
    const nr = next && next.isConnected ? next : table.rows[0];
    caretIn(nr.cells[Math.min(col, nr.cells.length - 1)]);
  } else if (op === 'deleteCol') {
    [...table.rows].forEach(row => { const c = row.cells[col]; if (c) c.remove(); });
    if (!table.rows[0] || !table.rows[0].cells.length) return removeTable(), true;
    caretIn(tr.cells[Math.min(col, tr.cells.length - 1)]);
  } else if (op === 'toggleHeader') {
    const m = markSel(r);
    if (table.tHead) {
      const rows = [...table.tHead.rows];
      rows.forEach(row => [...row.cells].forEach(c => retag(c, 'td', ['style', 'colspan', 'rowspan'])));
      body().prepend(...rows);
      table.tHead.remove();
    } else {
      const first = table.tBodies[0] && table.tBodies[0].rows[0];
      if (first) { [...first.cells].forEach(c => retag(c, 'th', ['style', 'colspan', 'rowspan'])); const th = h('thead'); th.append(first); table.prepend(th); if (table.tBodies[0] && !table.tBodies[0].rows.length) table.tBodies[0].remove(); }
    }
    restoreSel(m);
  } else if (op === 'deleteTable') removeTable();
  return true;
}
/** Tab navigation between cells (adds a row after the last cell). */
function moveCell(ed, dir) {
  const r = ed.range();
  const info = r && cellInfo(ed.root, r.startContainer);
  if (!info) return false;
  const cells = [...info.table.querySelectorAll('th,td')];
  const i = cells.indexOf(info.cell) + dir;
  if (i >= cells.length) { const last = info.table.rows[info.table.rows.length - 1]; caretIn(last.cells[last.cells.length - 1]); cmdTableOp(ed, 'rowBelow'); caretIn(info.table.rows[info.table.rows.length - 1].cells[0]); return true; }
  if (i < 0) return true;
  const target = cells[i], rr = doc.createRange();
  rr.selectNodeContents(target);
  if (isEmptyBlock(target)) rr.collapse(true);
  setRange(rr);
  return true;
}

const EDITOR_COMMANDS = {
  bold: ed => cmdMark(ed, 'strong'), italic: ed => cmdMark(ed, 'em'), underline: ed => cmdMark(ed, 'u'), strike: ed => cmdMark(ed, 's'),
  code: ed => cmdMark(ed, 'code'), superscript: ed => cmdMark(ed, 'sup'), subscript: ed => cmdMark(ed, 'sub'),
  paragraph: ed => cmdBlock(ed, 'p'), heading: (ed, v) => cmdBlock(ed, 'h' + clamp(+v || 1, 1, 4)),
  h1: ed => cmdBlock(ed, 'h1'), h2: ed => cmdBlock(ed, 'h2'), h3: ed => cmdBlock(ed, 'h3'), h4: ed => cmdBlock(ed, 'h4'),
  bulletList: ed => cmdList(ed, 'ul'), orderedList: ed => cmdList(ed, 'ol'), checkList: ed => cmdList(ed, 'check'),
  indent: ed => cmdIndent(ed, 1), outdent: ed => cmdIndent(ed, -1),
  blockquote: ed => cmdQuote(ed), codeBlock: (ed, v) => cmdCodeBlock(ed, v),
  align: (ed, v) => cmdAlign(ed, v), alignLeft: ed => cmdAlign(ed, 'left'), alignCenter: ed => cmdAlign(ed, 'center'), alignRight: ed => cmdAlign(ed, 'right'), alignJustify: ed => cmdAlign(ed, 'justify'),
  dir: (ed, v) => cmdDir(ed, v),
  color: (ed, v) => cmdStyle(ed, 'color', v || ''), highlight: (ed, v) => cmdStyle(ed, 'highlight', v || ''),
  link: (ed, v) => cmdLink(ed, v), unlink: ed => cmdUnlink(ed),
  image: (ed, v) => { const o = isStr(v) ? { src: v } : v || {}; if (!o.src) return false; insertImage(ed, o); return true; },
  table: (ed, v) => cmdTable(ed, v), hr: ed => cmdHr(ed), clear: ed => cmdClear(ed),
  rowAbove: ed => cmdTableOp(ed, 'rowAbove'), rowBelow: ed => cmdTableOp(ed, 'rowBelow'), colBefore: ed => cmdTableOp(ed, 'colBefore'), colAfter: ed => cmdTableOp(ed, 'colAfter'),
  deleteRow: ed => cmdTableOp(ed, 'deleteRow'), deleteCol: ed => cmdTableOp(ed, 'deleteCol'), toggleHeader: ed => cmdTableOp(ed, 'toggleHeader'), deleteTable: ed => cmdTableOp(ed, 'deleteTable'),
};
