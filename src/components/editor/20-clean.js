/* Schema normalisation, paste cleaning (Word / Google Docs / web), serialisation (HTML, text, JSON) and HTML pretty-printing. */

const ED_TAGS = new Set('p h1 h2 h3 h4 strong em u s code sup sub a img br hr ul ol li blockquote pre table thead tbody tr th td span mark'.split(' '));
const ED_ATTRS = {
  '*': ['dir'],
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width'],
  ol: ['start'],
  ul: ['data-type'],
  li: ['data-checked'],
  pre: ['data-lang'],
  td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan', 'scope'],
  span: ['class', 'data-id', 'data-label', 'data-trigger', 'contenteditable'],
};
const ALIGNABLE = /^(P|H[1-4]|LI|TD|TH)$/;
const RENAME = { B: 'strong', I: 'em', STRIKE: 's', DEL: 's', INS: 'u', KBD: 'code', TT: 'code', SAMP: 'code', VAR: 'em', CITE: 'em', DFN: 'em', H5: 'h4', H6: 'h4' };
const TO_P = /^(DIV|SECTION|ARTICLE|HEADER|FOOTER|MAIN|NAV|ASIDE|ADDRESS|DETAILS|SUMMARY|FIGURE|FIGCAPTION|CENTER|DT|DD|DL|CAPTION)$/;
const DROP = /^(VIDEO|AUDIO|IFRAME|OBJECT|EMBED|CANVAS|SVG|MATH|INPUT|BUTTON|SELECT|TEXTAREA|STYLE|SCRIPT|SOURCE|TRACK|COLGROUP|COL)$/;
const INLINE_OK = /^(STRONG|EM|U|S|CODE|SUP|SUB|A|IMG|BR|SPAN|MARK)$/;
const NBSP = '\u00a0';
const SAN_ATTRS = { attrs: ['contenteditable', 'data-type', 'data-checked', 'data-lang'] };

/** Parse (sanitised) HTML into a detached container element. */
function parseHTML(input) {
  const box = doc.createElement('div');
  box.innerHTML = sanitize(String(input ?? ''), SAN_ATTRS);
  return box;
}
const safeColor = v => (/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]+)$/i.test(String(v || '').trim()) ? String(v).trim() : '');
const hoist = el => { const kids = [...el.childNodes]; unwrap(el); return kids; };

/**
 * normalizeTree(container, { keepColors, dirAuto, trailing }) — enforce the editor schema in place:
 * known tags only, clean attributes, blocks at the top level, inline-only text blocks, well-formed lists / tables / code.
 */
function normalizeTree(root, o = {}) {
  /* returns: Element (kept, visit children) | Node[] (hoisted children to visit) | null (done) */
  const fixEl = el => {
    let name = el.nodeName;
    if (el.hasAttribute('data-o-sel')) return null;
    if (name === 'B' && /font-weight:\s*(normal|400)/i.test(el.getAttribute('style') || '')) return hoist(el);
    if (name === 'FONT') {
      const c = safeColor(el.getAttribute('color'));
      if (c && o.keepColors) { const s = h('span'); s.style.color = c; s.append(...el.childNodes); el.replaceWith(s); return s; }
      return hoist(el);
    }
    if (DROP.test(name)) { el.remove(); return null; }
    if (RENAME[name]) { el = retag(el, RENAME[name], ['style', 'dir']); name = el.nodeName; }
    if (/^(SPAN|MARK|P|H[1-6]|LI|TD|TH|DIV)$/.test(name) && el.getAttribute('style')) {
      // inline styles -> semantic marks (Word / Docs / web pages)
      const st = el.style, wraps = [];
      const fw = st.fontWeight;
      if ((fw === 'bold' || +fw >= 600) && !/^(H\d|TH)$/.test(name)) wraps.push('strong');
      if (st.fontStyle === 'italic') wraps.push('em');
      const td = st.textDecorationLine || st.textDecoration || '';
      if (/underline/.test(td)) wraps.push('u');
      if (/line-through/.test(td)) wraps.push('s');
      if (st.verticalAlign === 'super') wraps.push('sup');
      if (st.verticalAlign === 'sub') wraps.push('sub');
      if (wraps.length && el.childNodes.length) {
        let node = null;
        wraps.forEach(tg => { const w = doc.createElement(tg); if (!node) w.append(...el.childNodes); else w.append(node); node = w; });
        el.append(node);
      }
    }
    if (!ED_TAGS.has(name.toLowerCase())) {
      if (TO_P.test(name)) return [...el.children].some(isBlockEl) ? hoist(el) : retag(el, 'p', ['style', 'dir']);
      return hoist(el);
    }
    const allowed = new Set([...ED_ATTRS['*'], ...(ED_ATTRS[name.toLowerCase()] || [])]);
    const align = ALIGNABLE.test(name) ? (el.style.textAlign || el.getAttribute('align') || '') : '';
    const color = name === 'SPAN' && o.keepColors ? safeColor(el.style.color) : '';
    const bg = name === 'MARK' || (name === 'SPAN' && o.keepColors) ? safeColor(el.style.backgroundColor) : '';
    for (const a of [...el.attributes]) if (!allowed.has(a.name)) el.removeAttribute(a.name);
    if (/^(center|right|justify)$/.test(align)) el.style.textAlign = align;
    if (color) el.style.color = color;
    if (bg) el.style.backgroundColor = bg;
    if (name === 'SPAN') {
      if (el.classList.contains('o-mention')) { el.className = 'o-mention'; el.setAttribute('contenteditable', 'false'); return null; }
      ['class', 'contenteditable', 'data-id', 'data-label', 'data-trigger'].forEach(a => el.removeAttribute(a));
      if (!el.attributes.length) return hoist(el);
    }
    if (name === 'MARK' && !el.style.backgroundColor) el.style.backgroundColor = '#fef08a';
    if (name === 'A') {
      if (!el.getAttribute('href')) return hoist(el);
      if (el.getAttribute('target') === '_blank') el.setAttribute('rel', 'noopener noreferrer'); else { el.removeAttribute('target'); el.removeAttribute('rel'); }
    }
    if (name === 'IMG') {
      if (!el.getAttribute('src')) { el.remove(); return null; }
      const w = el.getAttribute('width');
      if (w && !/^\d+%?$/.test(w)) el.removeAttribute('width');
      if (!el.hasAttribute('alt')) el.setAttribute('alt', '');
      return null;
    }
    if (name === 'UL' && el.getAttribute('data-type') !== 'check') el.removeAttribute('data-type');
    if (name === 'OL' && el.getAttribute('start') === '1') el.removeAttribute('start');
    if (name === 'PRE') {
      const code = el.querySelector('code');
      const lang = el.getAttribute('data-lang') || ((code && code.className.match(/language-([\w#+.-]+)/)) || [])[1] || '';
      el.replaceChildren(h('code', {}, textWithBreaks(el).replace(/\u200b/g, '')));
      if (lang) el.setAttribute('data-lang', lang); else el.removeAttribute('data-lang');
      return null;
    }
    return el;
  };
  const fixList = nodes => {
    for (const n of nodes) {
      if (!n.parentNode) continue;
      if (n.nodeType === 8) { n.remove(); continue; }
      if (n.nodeType !== 1) continue;
      const r = fixEl(n);
      if (Array.isArray(r)) fixList(r);
      else if (r) fixList([...r.childNodes]);
    }
  };
  fixList([...root.childNodes]);
  structure(root, o);
  return root;
}
function textWithBreaks(el) {
  let s = '';
  el.childNodes.forEach(n => {
    if (n.nodeType === 3) s += n.data;
    else if (n.nodeName === 'BR') s += '\n';
    else if (n.nodeType === 1) { s += textWithBreaks(n); if (/^(P|DIV|LI|H[1-6])$/.test(n.nodeName) && !s.endsWith('\n')) s += '\n'; }
  });
  return s;
}
/** Move a block child out of a paragraph/heading (splitting it) so blocks stay at the top level. */
function liftOut(b, child) {
  const r = doc.createRange();
  r.setStartAfter(child);
  r.setEnd(b, b.childNodes.length);
  const tail = r.extractContents();
  b.after(child);
  if (tail.textContent.trim() || tail.querySelector('img,br')) { const nb = doc.createElement(b.nodeName.toLowerCase()); nb.append(tail); child.after(nb); }
}
/** Replace a nested block with inline content separated by <br>. */
function flattenBlock(c) {
  const prev = c.previousSibling;
  if (prev && prev.nodeName !== 'BR' && (prev.nodeType !== 3 || prev.data.trim())) c.before(h('br'));
  if (c.nodeName === 'PRE') { c.replaceWith(doc.createTextNode(c.textContent)); return; }
  if (/^(UL|OL)$/.test(c.nodeName)) { const items = [...c.querySelectorAll('li')]; const f = doc.createDocumentFragment(); items.forEach((li, i) => { if (i) f.append(h('br')); f.append(...[...li.childNodes].filter(x => !/^(UL|OL)$/.test(x.nodeName))); }); c.replaceWith(f); return; }
  if (c.nodeName === 'HR') { c.remove(); return; }
  if (c.nodeName === 'TABLE') { const f = doc.createDocumentFragment(); [...c.rows].forEach((tr, i) => { if (i) f.append(h('br')); f.append([...tr.cells].map(x => x.textContent.trim()).join(' · ')); }); c.replaceWith(f); return; }
  unwrap(c);
}

/** Block-level structure rules. */
function structure(root, o = {}) {
  const wrapInline = parent => {
    let run = null;
    for (const n of [...parent.childNodes]) {
      const mk = n.nodeType === 1 && n.hasAttribute('data-o-sel');
      const inline = n.nodeType === 3 || mk || (n.nodeType === 1 && INLINE_OK.test(n.nodeName));
      if (!inline) { run = null; continue; }
      if (!run && n.nodeType === 3 && !n.data.trim()) { n.remove(); continue; }
      if (!run) { run = doc.createElement('p'); n.before(run); }
      run.append(n);
    }
  };
  wrapInline(root);
  root.querySelectorAll('blockquote').forEach(wrapInline);
  // stray list items at the top level
  [...root.children].forEach(c => { if (c.nodeName === 'LI') { const prev = c.previousElementSibling; if (prev && prev.nodeName === 'UL' && prev.__oStray) prev.append(c); else { const ul = h('ul'); ul.__oStray = true; c.before(ul); ul.append(c); } } });
  // text blocks may only hold inline content (lists may nest inside <li>)
  root.querySelectorAll('p,h1,h2,h3,h4').forEach(b => { let c; while ((c = [...b.children].find(x => isBlockEl(x) && !x.hasAttribute('data-o-sel')))) { if (/^(P|H\d|DIV)$/.test(c.nodeName)) flattenBlock(c); else liftOut(b, c); } });
  root.querySelectorAll('li,td,th').forEach(b => { let c; while ((c = [...b.children].find(x => isBlockEl(x) && !x.hasAttribute('data-o-sel') && !(b.nodeName === 'LI' && /^(UL|OL)$/.test(x.nodeName))))) flattenBlock(c); });
  // lists: only <li> children
  root.querySelectorAll('ul,ol').forEach(list => {
    for (const c of [...list.childNodes]) {
      if (c.nodeName === 'LI') continue;
      if (c.nodeType === 3 && !c.data.trim()) { c.remove(); continue; }
      const prev = c.previousElementSibling;
      if (/^(UL|OL)$/.test(c.nodeName) && prev && prev.nodeName === 'LI') { prev.append(c); continue; }
      const li = h('li'); c.before(li); li.append(c);
    }
    if (list.getAttribute('data-type') === 'check') [...list.children].forEach(li => { li.setAttribute('data-checked', String(li.getAttribute('data-checked') === 'true')); });
    else [...list.children].forEach(li => li.removeAttribute('data-checked'));
    if (!list.children.length) list.remove();
  });
  // tables: rows inside thead/tbody, cells only
  root.querySelectorAll('table').forEach(tb => {
    [...tb.childNodes].forEach(c => {
      if (c.nodeType !== 1) { c.remove(); return; }
      if (c.nodeName === 'TR') { let body = tb.querySelector(':scope > tbody'); if (!body) { body = h('tbody'); tb.append(body); } body.append(c); }
      else if (c.nodeName === 'TFOOT') { let body = tb.querySelector(':scope > tbody') || tb.appendChild(h('tbody')); body.append(...c.childNodes); c.remove(); }
      else if (!/^(THEAD|TBODY)$/.test(c.nodeName)) c.remove();
    });
    tb.querySelectorAll('tr').forEach(tr => { [...tr.childNodes].forEach(c => { if (!/^(TD|TH)$/.test(c.nodeName)) { if (c.nodeType === 1 && c.textContent.trim()) { const td = h('td'); c.before(td); td.append(c); } else c.remove(); } }); if (!tr.cells.length) tr.remove(); });
    if (!tb.rows.length) tb.remove();
  });
  root.querySelectorAll('pre').forEach(pre => { if (pre.childNodes.length !== 1 || pre.firstChild.nodeName !== 'CODE') pre.replaceChildren(h('code', {}, pre.textContent)); });
  [...root.childNodes].forEach(n => { if (n.nodeType === 3 && !n.data.trim()) n.remove(); });
  root.querySelectorAll('p,h1,h2,h3,h4,li,td,th').forEach(b => {
    collapseWS(b);
    fixEmpty(b);
    if (o.dirAuto && !b.hasAttribute('dir') && b.nodeName !== 'TD' && b.nodeName !== 'TH') b.setAttribute('dir', 'auto');
  });
  const last = root.lastElementChild;
  if (o.trailing !== false && (!last || /^(TABLE|HR|PRE|BLOCKQUOTE)$/.test(last.nodeName))) root.append(h('p', {}, h('br')));
}
/** Collapse HTML source whitespace (newlines / tabs / runs) in a text block. */
function collapseWS(b) {
  const w = doc.createTreeWalker(b, NodeFilter.SHOW_TEXT);
  const texts = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) if (/[\t\n\r]| {2}/.test(n.data)) texts.push(n);
  texts.forEach(n => { n.data = n.data.replace(/[\t\n\r ]+/g, ' '); });
  const first = firstText(b), last = firstText(b, true);
  if (first && /^ /.test(first.data) && !first.previousSibling) first.data = first.data.replace(/^ +/, '');
  if (last && / $/.test(last.data) && !last.nextSibling) last.data = last.data.replace(/ +$/, '');
}

/** Normalise inline markup: merge adjacent identical marks, drop empty wrappers, merge text nodes. */
function normInline(el) {
  const sameAttrs = (a, b) => a.attributes.length === b.attributes.length && [...a.attributes].every(x => b.getAttribute(x.name) === x.value);
  const visit = node => {
    for (let c = node.firstChild; c;) {
      let next = c.nextSibling;
      if (c.nodeType === 1 && !c.hasAttribute('data-o-sel') && c.nodeName !== 'PRE' && !c.classList.contains('o-mention')) {
        if (c.nodeName === 'B') c = retag(c, 'strong', []);
        else if (c.nodeName === 'I') c = retag(c, 'em', []);
        else if (c.nodeName === 'STRIKE' || c.nodeName === 'DEL') c = retag(c, 's', []);
        if (/^(STRONG|EM|U|S|CODE|SUP|SUB|SPAN|MARK|A|FONT)$/.test(c.nodeName)) {
          if (c.nodeName === 'FONT' || (c.nodeName === 'SPAN' && !c.attributes.length)) { const kids = hoist(c); c = kids[0] || next; continue; }
          visit(c);
          if (!hasText(c) && !c.querySelector('br')) {
            if (c.querySelector('[data-o-sel]')) hoist(c); else c.remove();
            c = next; continue;
          }
          const p = c.parentElement;
          if (p && p.nodeName === c.nodeName && c.nodeName !== 'SPAN' && c.nodeName !== 'A' && c.nodeName !== 'MARK') { const kids = hoist(c); c = kids[0] || next; continue; }
          let sib = c.nextSibling;
          while (sib && sib.nodeType === 1 && sib.nodeName === c.nodeName && sameAttrs(c, sib) && !sib.classList.contains('o-mention')) { const s2 = sib.nextSibling; c.append(...sib.childNodes); sib.remove(); sib = s2; }
          next = c.nextSibling;
        } else visit(c);
      }
      c = next;
    }
  };
  visit(el);
  mergeTexts(el);
}
function mergeTexts(el) {
  const w = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const list = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) list.push(n);
  list.forEach(n => { if (!n.parentNode) return; let nx = n.nextSibling; while (nx && nx.nodeType === 3) { n.appendData(nx.data); const r2 = nx.nextSibling; nx.remove(); nx = r2; } });
}

/* ── paste cleaning ────────────────────────────────────────────────── */
/** cleanPaste(html, { keepColors, dirAuto }) -> clean editor HTML (Word lists, Docs wrappers, styles -> marks, junk removed). */
function cleanPaste(input, o = {}) {
  let s = String(input ?? '');
  s = s.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '').replace(/<!--(?:Start|End)Fragment-->/gi, '').replace(/<\/?o:p>/gi, '').replace(/<xml>[\s\S]*?<\/xml>/gi, '');
  const bodyM = s.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyM) s = bodyM[1];
  const box = doc.createElement('div');
  box.innerHTML = sanitize(s, SAN_ATTRS);
  wordLists(box);
  box.querySelectorAll('meta,link,title').forEach(n => n.remove());
  box.querySelectorAll('p').forEach(p => { const empty = x => x && x.nodeName === 'P' && !x.textContent.replace(/[\s\u00a0]/g, '') && !x.querySelector('img'); if (empty(p) && empty(p.nextElementSibling)) p.remove(); });
  box.querySelectorAll('u').forEach(u => { if (u.closest('a') || u.querySelector('a')) unwrap(u); });
  normalizeTree(box, { keepColors: !!o.keepColors, dirAuto: o.dirAuto, trailing: false });
  box.querySelectorAll('p,h1,h2,h3,h4,li,td,th').forEach(normInline);
  return box.innerHTML;
}
/** Convert MS Word list paragraphs (mso-list) into real nested lists. */
function wordLists(box) {
  const isItem = p => p && p.nodeName === 'P' && (/MsoListParagraph/i.test(p.className) || /mso-list:\s*l\d/i.test(p.getAttribute('style') || ''));
  let p = box.querySelector('p');
  while (p) {
    if (!isItem(p)) { p = nextP(p, box); continue; }
    const group = [];
    for (let n = p; isItem(n); n = n.nextElementSibling) group.push(n);
    const after = group[group.length - 1].nextElementSibling;
    let cur = { level: 0, el: null, parent: null };
    group.forEach(item => {
      const st = item.getAttribute('style') || '';
      const level = +((st.match(/level(\d+)/i) || [])[1] || 1);
      const ign = [...item.querySelectorAll('span')].find(s2 => /mso-list:\s*ignore/i.test(s2.getAttribute('style') || ''));
      const markerText = (ign ? ign.textContent : (item.textContent.match(/^\s*(\S+)\s/) || [])[1] || '').trim();
      const ordered = /^[([]?(\d+|[a-z]|[ivxlc]+)[.)\]]$/i.test(markerText);
      if (ign) ign.remove();
      else { const tn = firstText(item); if (tn) tn.data = tn.data.replace(/^\s*(?:[·•o§▪\-–*]|\(?\w{1,3}[.)])\s+/, ''); }
      while (cur.level > level && cur.parent) cur = cur.parent;
      if (cur.level < level) {
        const list = doc.createElement(ordered ? 'ol' : 'ul');
        if (cur.el) (cur.el.lastElementChild || cur.el).append(list); else item.before(list);
        cur = { level, el: list, parent: cur };
      }
      const li = doc.createElement('li');
      li.append(...item.childNodes);
      cur.el.append(li);
      item.remove();
    });
    p = after && after.nodeName === 'P' ? after : after ? nextP(after, box) : null;
  }
}
function nextP(el, box) { const all = [...box.querySelectorAll('p')]; const i = all.indexOf(el); if (i >= 0) return all[i + 1] || null; return all.find(x => el.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING) || null; }

/* ── serialisation ─────────────────────────────────────────────────── */
/** Editor DOM -> sanitised HTML string ('' for an empty document). */
function serializeHTML(root) {
  const c = root.cloneNode(true);
  c.querySelectorAll('[data-o-sel], .o-editor-ui, img[data-o-upload]').forEach(n => n.remove());
  c.querySelectorAll('pre').forEach(pre => {
    const tx = (pre.querySelector('code') || pre).textContent.replace(/\u200b/g, '').replace(/\n$/, '');
    const lang = pre.getAttribute('data-lang');
    pre.replaceChildren(h('code', lang ? { class: 'language-' + lang } : {}, tx));
  });
  c.querySelectorAll('.o-mention').forEach(m => m.removeAttribute('contenteditable'));
  c.querySelectorAll('[class]').forEach(el => { if (!el.classList.contains('o-mention') && !(el.nodeName === 'CODE' && el.parentElement && el.parentElement.nodeName === 'PRE')) el.removeAttribute('class'); });
  c.querySelectorAll('[data-ph]').forEach(el => el.removeAttribute('data-ph'));
  const w = doc.createTreeWalker(c, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.data.includes('\u200b')) n.data = n.data.replace(/\u200b/g, '');
    if (n.data.includes(NBSP) && !n.parentElement.closest('pre')) n.data = n.data.replace(/([^\s\u00a0])\u00a0(?=[^\s\u00a0])/g, '$1 ');
  }
  c.querySelectorAll('strong,em,u,s,code,sup,sub,span,mark,a').forEach(el => { if (el.isConnected !== false && !hasText(el) && !el.querySelector('br')) el.remove(); });
  if (!hasText(c) && !c.querySelector('img,hr,table')) return '';
  return sanitize(c.innerHTML, SAN_ATTRS);
}
/** Plain text: blocks separated by newlines, table cells by tabs. */
function serializeText(root) {
  let out = '';
  const isB = n => isTextBlock(n) || /^(UL|OL|BLOCKQUOTE|TABLE|TR|HR)$/.test(n.nodeName);
  const walk = n => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { out += c.data.replace(/\u200b/g, ''); continue; }
      if (c.nodeType !== 1 || c.hasAttribute('data-o-sel') || c.classList.contains('o-editor-ui')) continue;
      if (c.nodeName === 'BR') { if (c.nextSibling || c.previousSibling) out += '\n'; continue; }
      if (c.nodeName === 'IMG') continue;
      const blk = isB(c);
      if (blk && out && !out.endsWith('\n')) out += '\n';
      walk(c);
      if (c.nodeName === 'TD' || c.nodeName === 'TH') out += '\t';
      if (blk && !out.endsWith('\n')) out += '\n';
    }
  };
  walk(root);
  return out.replace(/\t\n/g, '\n').split(NBSP).join(' ').replace(/\n+$/, '');
}
/** Simple block model: { type: 'doc', blocks: [...] } */
function serializeJSON(root) {
  const inlineHTML = el => { const c = el.cloneNode(true); c.querySelectorAll('ul,ol,[data-o-sel]').forEach(x => x.remove()); const box = h('div'); box.append(...c.childNodes); return serializeHTML(box); };
  const text = el => { const c = el.cloneNode(true); c.querySelectorAll('ul,ol').forEach(x => x.remove()); return serializeText(c); };
  const align = el => (el.style && el.style.textAlign ? { align: el.style.textAlign } : {});
  const list = el => ({
    type: 'list', style: el.nodeName === 'OL' ? 'ordered' : el.getAttribute('data-type') === 'check' ? 'check' : 'bullet',
    ...(el.getAttribute('start') ? { start: +el.getAttribute('start') } : {}),
    items: [...el.children].map(li => ({ text: text(li), html: inlineHTML(li), ...(li.hasAttribute('data-checked') ? { checked: li.getAttribute('data-checked') === 'true' } : {}), children: [...li.children].filter(c => /^(UL|OL)$/.test(c.nodeName)).map(list) })),
  });
  const blockOf = el => {
    const n = el.nodeName;
    if (n === 'P') {
      const img = el.children.length === 1 && el.firstElementChild.nodeName === 'IMG' && !el.textContent.trim() ? el.firstElementChild : null;
      if (img) return { type: 'image', src: img.getAttribute('src'), alt: img.getAttribute('alt') || '', ...(img.getAttribute('width') ? { width: img.getAttribute('width') } : {}) };
      return { type: 'paragraph', text: text(el), html: inlineHTML(el), ...align(el) };
    }
    if (/^H[1-6]$/.test(n)) return { type: 'heading', level: +n[1], text: text(el), html: inlineHTML(el), ...align(el) };
    if (n === 'UL' || n === 'OL') return list(el);
    if (n === 'BLOCKQUOTE') return { type: 'quote', blocks: [...el.children].map(blockOf).filter(Boolean) };
    if (n === 'PRE') return { type: 'code', language: el.getAttribute('data-lang') || '', code: el.textContent.replace(/\u200b/g, '').replace(/\n$/, '') };
    if (n === 'HR') return { type: 'divider' };
    if (n === 'TABLE') return { type: 'table', header: !!el.tHead, rows: [...el.rows].map(r => [...r.cells].map(inlineHTML)) };
    return null;
  };
  const blocks = [...root.children].map(blockOf).filter(Boolean);
  while (blocks.length && blocks[blocks.length - 1].type === 'paragraph' && !blocks[blocks.length - 1].text && !blocks[blocks.length - 1].html) blocks.pop();
  return { type: 'doc', version: 1, blocks };
}
/** Words / characters (Intl.Segmenter when available). */
function countText(text) {
  const flat = text.replace(/\n/g, ' ');
  let words = 0, chars = 0;
  try {
    for (const s of new Intl.Segmenter(i18n.locale, { granularity: 'word' }).segment(flat)) if (s.isWordLike) words++;
    for (const s of new Intl.Segmenter(i18n.locale, { granularity: 'grapheme' }).segment(text.replace(/\n/g, ''))) if (s) chars++;
  } catch { words = (flat.match(/\S+/g) || []).length; chars = [...text.replace(/\n/g, '')].length; }
  return { words, chars };
}
/** Pretty-print editor HTML (one block per line, indented lists / tables / quotes). */
function prettyHTML(input) {
  const box = doc.createElement('div');
  box.innerHTML = input;
  const pad = n => '  '.repeat(n), out = [];
  const container = /^(UL|OL|BLOCKQUOTE|TABLE|THEAD|TBODY|TR)$/;
  const openTag = el => { const s = el.outerHTML; return s.slice(0, s.indexOf('>') + 1); };
  const emitNode = (el, d) => {
    if (el.nodeType !== 1) { const tx = el.textContent.trim(); if (tx) out.push(pad(d) + esc(tx)); return; }
    const nestedList = el.nodeName === 'LI' && [...el.children].some(c => /^(UL|OL)$/.test(c.nodeName));
    if (!container.test(el.nodeName) && !nestedList) { out.push(pad(d) + el.outerHTML); return; }
    out.push(pad(d) + openTag(el));
    if (nestedList) {
      const tmp = doc.createElement('div');
      [...el.childNodes].filter(c => !/^(UL|OL)$/.test(c.nodeName)).forEach(c => tmp.append(c.cloneNode(true)));
      if (tmp.innerHTML.trim()) out.push(pad(d + 1) + tmp.innerHTML.trim());
      [...el.children].filter(c => /^(UL|OL)$/.test(c.nodeName)).forEach(c => emitNode(c, d + 1));
    } else [...el.childNodes].forEach(c => emitNode(c, d + 1));
    out.push(pad(d) + `</${el.nodeName.toLowerCase()}>`);
  };
  [...box.childNodes].forEach(n => emitNode(n, 0));
  return out.join('\n');
}
