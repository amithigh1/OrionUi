/* Markdown <-> HTML (CommonMark/GFM subset: headings, emphasis, strike, code, fences, lists, task lists,
 * quotes, tables, links, images, hard breaks, rules). Used by <o-editor> (getMarkdown/setMarkdown, paste) and <o-comments>.
 *   Orion.Editor.markdown.toHTML(md, { breaks }) -> HTML (unsanitized — sanitize before inserting)
 *   Orion.Editor.markdown.fromHTML(htmlOrNode) -> Markdown
 */

const MD_LIST = /^( {0,12})([-*+]|\d{1,9}[.)])(\s+|$)(.*)$/;
const MD_FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/;
const MD_HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const MD_HEAD = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const MD_QUOTE = /^ {0,3}>[ \t]?(.*)$/;
const MD_TSEP = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const MD_HTML = /^ {0,3}<\/?(?:p|div|h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|blockquote|pre|hr|figure|section|article|details|summary)\b/i;

function mdIsBlockStart(l) {
  const m = MD_LIST.exec(l);
  return MD_FENCE.test(l) || MD_HEAD.test(l) || MD_HR.test(l) || MD_QUOTE.test(l) || MD_HTML.test(l) || (m && m[4].trim() && (!/\d/.test(m[2]) || /^1[.)]$/.test(m[2])));
}

function mdToHtml(src, opts = {}) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  return mdBlocks(lines, opts).join('\n');
}

function mdBlocks(lines, opts) {
  const out = [];
  let i = 0, m;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if ((m = MD_FENCE.exec(line))) {
      const fence = m[1], lang = m[2], body = [];
      const close = new RegExp('^ {0,3}' + (fence[0] === '`' ? '`' : '~') + '{' + fence.length + ',}\\s*$');
      i++;
      while (i < lines.length && !close.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(`<pre${lang ? ` data-lang="${esc(lang)}"` : ''}><code${lang ? ` class="language-${esc(lang)}"` : ''}>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    if ((m = MD_HEAD.exec(line))) { const n = m[1].length; out.push(`<h${n}>${mdInline(m[2] || '', null, opts)}</h${n}>`); i++; continue; }
    if (MD_HR.test(line)) { out.push('<hr>'); i++; continue; }
    if (MD_QUOTE.test(line)) {
      const body = [];
      while (i < lines.length && lines[i].trim()) {
        const q = MD_QUOTE.exec(lines[i]);
        if (!q && mdIsBlockStart(lines[i])) break;
        body.push(q ? q[1] : lines[i]);
        i++;
      }
      out.push(`<blockquote>${mdBlocks(body, opts).join('')}</blockquote>`);
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && MD_TSEP.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const cells = s => s.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
      const head = cells(line);
      const aligns = cells(lines[i + 1]).map(c => (/^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : /^:-+$/.test(c) ? 'left' : ''));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(cells(lines[i++]));
      const cell = (tag, c, k) => `<${tag}${aligns[k] ? ` style="text-align: ${aligns[k]}"` : ''}>${mdInline(c || '', null, opts)}</${tag}>`;
      out.push(`<table><thead><tr>${head.map((c, k) => cell('th', c, k)).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${head.map((_, k) => cell('td', r[k], k)).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if ((m = MD_LIST.exec(line))) { const r = mdList(lines, i, opts); out.push(r.html); i = r.next; continue; }
    if (MD_HTML.test(line)) { const body = []; while (i < lines.length && lines[i].trim()) body.push(lines[i++]); out.push(body.join('\n')); continue; }
    const para = [line];
    let setext = 0;
    i++;
    while (i < lines.length && lines[i].trim()) {
      const l = lines[i];
      if (/^ {0,3}=+\s*$/.test(l)) { setext = 1; i++; break; }
      if (/^ {0,3}-+\s*$/.test(l)) { setext = 2; i++; break; }
      if (mdIsBlockStart(l)) break;
      para.push(l); i++;
    }
    const inner = mdInline(para.map(s => s.replace(/^ {0,3}/, '')).join('\n').replace(/[ \t]+$/, ''), null, opts);
    out.push(setext ? `<h${setext}>${inner}</h${setext}>` : `<p>${inner}</p>`);
  }
  return out;
}

function mdList(lines, i, opts) {
  const first = MD_LIST.exec(lines[i]);
  const indent = first[1].length, ordered = /\d/.test(first[2]), start = ordered ? parseInt(first[2], 10) : 1;
  const items = [];
  let cur = null;
  while (i < lines.length) {
    const line = lines[i], m = MD_LIST.exec(line);
    if (m && m[1].length === indent && /\d/.test(m[2]) === ordered && !MD_HR.test(line)) {
      cur = { lines: [m[4]], ci: indent + m[2].length + Math.max(1, Math.min(4, m[3].length || 1)) };
      items.push(cur); i++; continue;
    }
    if (!cur) break;
    if (!line.trim()) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j >= lines.length) break;
      const nm = MD_LIST.exec(lines[j]), ind = lines[j].match(/^ */)[0].length;
      if ((nm && nm[1].length === indent && /\d/.test(nm[2]) === ordered) || ind >= cur.ci) { cur.lines.push(''); i++; continue; }
      break;
    }
    const ind = line.match(/^ */)[0].length;
    if (ind >= cur.ci || (m && m[1].length > indent)) { cur.lines.push(line.slice(Math.min(ind, cur.ci))); i++; continue; }
    if (m || mdIsBlockStart(line)) break;
    cur.lines.push(line.trim()); i++;
  }
  let task = false;
  const lis = items.map(it => {
    let ls2 = it.lines;
    let checked = null;
    const tm = /^\[([ xX])\](?:[ \t]+|$)/.exec(ls2[0] || '');
    if (tm) { checked = tm[1] !== ' '; task = true; ls2 = [ls2[0].slice(tm[0].length), ...ls2.slice(1)]; }
    const cut = ls2.findIndex((l, k) => k > 0 && (!l.trim() || MD_LIST.test(l) || mdIsBlockStart(l)));
    const own = cut < 0 ? ls2 : ls2.slice(0, cut), rest = cut < 0 ? [] : ls2.slice(cut);
    let htmlLi = mdInline(own.join('\n').trim(), null, opts);
    if (rest.some(l => l.trim())) htmlLi += mdBlocks(rest, opts).map(b => (/^<(ul|ol)\b/.test(b) ? b : '<br>' + b.replace(/^<p>([\s\S]*)<\/p>$/, '$1'))).join('');
    return { html: htmlLi, checked };
  });
  const tag = ordered ? 'ol' : 'ul';
  const attrs = (ordered && start !== 1 ? ` start="${start}"` : '') + (task && !ordered ? ' data-type="check"' : '');
  return { html: `<${tag}${attrs}>${lis.map(li => `<li${task && !ordered ? ` data-checked="${!!li.checked}"` : ''}>${li.html}</li>`).join('')}</${tag}>`, next: i };
}

function mdInline(s, slots, opts = {}) {
  const top = !slots;
  slots = slots || [];
  const put = x => '\u0000' + (slots.push(x) - 1) + '\u0000';
  s = String(s);
  s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (m, t, code) => put('<code>' + esc(code.replace(/\n/g, ' ').replace(/^ (.*) $/, '$1')) + '</code>'));
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!|~<>=@])/g, (m, c) => put(esc(c)));
  s = s.replace(/(?: {2,}|\\)\n/g, () => put('<br>'));
  s = s.replace(/<((?:https?|ftp):\/\/[^\s<>]+|mailto:[^\s<>]+)>/gi, (m, u) => put(`<a href="${esc(u)}">${esc(u.replace(/^mailto:/i, ''))}</a>`));
  s = s.replace(/<\/?(?:u|sup|sub|mark|kbd|br|span|s|del|ins|small|img|a)\b[^<>]*>/gi, m => put(m));
  s = s.replace(/!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+["']([^"']*)["'])?\s*\)/g, (m, alt, src, title) => put(`<img src="${esc(src)}" alt="${esc(alt)}"${title ? ` title="${esc(title)}"` : ''}>`));
  s = s.replace(/\[((?:[^[\]]|\[[^\]]*\])+)\]\(\s*<?([^\s)>]*)>?(?:\s+["']([^"']*)["'])?\s*\)/g, (m, text, href, title) => put(`<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}>${mdInline(text, slots, opts)}</a>`));
  s = s.replace(/(^|[\s(])((?:https?:\/\/|www\.)[^\s<\u0000]*[^\s<\u0000.,;:!?)"'*_~])/g, (m, pre, u) => pre + put(`<a href="${esc(/^www\./i.test(u) ? 'https://' + u : u)}">${esc(u)}</a>`));
  s = esc(s);
  s = s.replace(/(\*\*\*|___)(?=\S)([\s\S]*?\S)\1(?![*_])/g, '<strong><em>$2</em></strong>');
  s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1(?![*_])/g, '<strong>$2</strong>');
  s = s.replace(/(^|[^\w*\\])\*(?=[^\s*])([\s\S]*?[^\s*])\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w_\\])_(?=[^\s_])([\s\S]*?[^\s_])_(?![\w_])/g, '$1<em>$2</em>');
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>');
  s = s.replace(/\n/g, opts.breaks ? '<br>' : ' ');
  if (top) { let prev; do { prev = s; s = s.replace(/\u0000(\d+)\u0000/g, (m, k) => slots[k]); } while (s !== prev); }
  return s;
}

/* ── HTML -> Markdown ──────────────────────────────────────────────── */
const MD_BLOCKISH = /^(P|DIV|H[1-6]|BLOCKQUOTE|PRE|UL|OL|TABLE|HR|FIGURE|SECTION|ARTICLE|HEADER|FOOTER|MAIN|ASIDE|NAV|DETAILS|SUMMARY|ADDRESS|DL|DT|DD|CENTER|FIGCAPTION)$/;

function htmlToMd(input) {
  let root = input;
  if (!input || isStr(input)) { const tpl = doc.createElement('template'); tpl.innerHTML = String(input ?? ''); root = tpl.content; }
  return mdChildren(root).join('\n\n').replace(/\n{3,}/g, '\n\n').replace(/\u200b/g, '').trim();
}
function mdChildren(parent) {
  const out = [];
  let inline = [];
  const flush = () => { const s = mdEscLead(mdInlineFrom(inline).replace(/^[ \t]+|[ \t]+$/g, '')); if (s.trim()) out.push(s); inline = []; };
  for (const n of parent.childNodes) {
    if (n.nodeType === 1 && MD_BLOCKISH.test(n.nodeName)) { flush(); const b = mdBlockFrom(n); if (b) out.push(b); }
    else inline.push(n);
  }
  flush();
  return out;
}
function mdBlockFrom(el) {
  const name = el.nodeName;
  if (/^H[1-6]$/.test(name)) return '#'.repeat(+name[1]) + ' ' + mdInlineFrom(el.childNodes).replace(/\s*\n\s*/g, ' ').trim();
  if (name === 'BLOCKQUOTE') return mdChildren(el).join('\n\n').split('\n').map(l => (l ? '> ' + l : '>')).join('\n');
  if (name === 'PRE') {
    const code = el.textContent.replace(/\u200b/g, '').replace(/\n$/, '');
    const c = el.querySelector('code');
    const lang = el.getAttribute('data-lang') || ((c && c.className.match(/language-(\S+)/)) || [])[1] || '';
    const run = Math.max(0, ...(code.match(/`+/g) || []).map(x => x.length));
    const fence = '`'.repeat(Math.max(3, run + 1));
    return fence + lang + '\n' + code + '\n' + fence;
  }
  if (name === 'UL' || name === 'OL') return mdListFrom(el, '');
  if (name === 'TABLE') return mdTableFrom(el);
  if (name === 'HR') return '---';
  return mdChildren(el).join('\n\n');
}
function mdListFrom(list, indent) {
  const ordered = list.nodeName === 'OL';
  const check = !ordered && (list.getAttribute('data-type') === 'check' || [...list.children].some(li => li.hasAttribute('data-checked')));
  let n = parseInt(list.getAttribute('start') || '1', 10) || 1;
  const lines = [];
  for (const li of list.children) {
    if (li.nodeName !== 'LI') continue;
    const marker = ordered ? `${n++}.` : '-', pad = ' '.repeat(marker.length + 1);
    const own = [], nested = [];
    for (const c of li.childNodes) (c.nodeName === 'UL' || c.nodeName === 'OL' ? nested : own).push(c);
    const box = check ? (li.getAttribute('data-checked') === 'true' ? '[x] ' : '[ ] ') : '';
    const wrapper = doc.createElement('div');
    own.forEach(c => wrapper.append(c.cloneNode(true)));
    const text = mdChildren(wrapper).join('\n\n').split('\n').map((l, k) => (k && l ? indent + pad + l : l)).join('\n');
    lines.push(indent + marker + ' ' + box + text);
    nested.forEach(nl => lines.push(mdListFrom(nl, indent + pad)));
  }
  return lines.join('\n');
}
function mdTableFrom(table) {
  const rows = [...table.rows];
  if (!rows.length) return '';
  const cell = c => mdInlineFrom(c.childNodes).replace(/\s*\n\s*/g, '<br>').replace(/\|/g, '\\|').trim();
  const cols = Math.max(...rows.map(r => r.cells.length));
  const line = cs => '| ' + Array.from({ length: cols }, (_, k) => cs[k] ?? '').join(' | ') + ' |';
  const head = [...rows[0].cells];
  const align = c => { const a = c && (c.style.textAlign || c.getAttribute('align')); return a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---'; };
  return [line(head.map(cell)), line(Array.from({ length: cols }, (_, k) => align(head[k]))), ...rows.slice(1).map(r => line([...r.cells].map(cell)))].join('\n');
}
function mdWrap(d, inner) { const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/); return m[2] ? m[1] + d + m[2] + d + m[3] : inner; }
function mdEscText(s) {
  return s.replace(/[\\`*[\]]/g, '\\$&').replace(/_(?!\w)|(?<!\w)_/g, '\\_').replace(/<(?=[a-zA-Z/!])/g, '\\<').replace(/~~/g, '\\~\\~');
}
function mdEscLead(s) {
  return s.replace(/^(\s*)(#{1,6}(?=\s)|>|[-+](?=\s)|=+\s*$)/gm, '$1\\$2').replace(/^(\s*\d+)([.)])(?=\s)/gm, '$1\\$2');
}
function mdInlineFrom(nodes) {
  let s = '';
  for (const n of nodes) {
    if (n.nodeType === 3) { s += mdEscText(n.data.replace(/\u200b/g, '').replace(/[ \t\r\n]+/g, ' ')); continue; }
    if (n.nodeType !== 1) continue;
    const name = n.nodeName, inner = () => mdInlineFrom(n.childNodes);
    if (name === 'BR') s += '\\\n';
    else if (name === 'STRONG' || name === 'B') s += mdWrap('**', inner());
    else if (name === 'EM' || name === 'I') s += mdWrap('_', inner());
    else if (name === 'S' || name === 'DEL' || name === 'STRIKE') s += mdWrap('~~', inner());
    else if (name === 'CODE') {
      const c = n.textContent.replace(/\u200b/g, '');
      const run = Math.max(0, ...(c.match(/`+/g) || []).map(x => x.length));
      const ticks = '`'.repeat(run + 1), pad = /^`|`$/.test(c) ? ' ' : '';
      s += c ? ticks + pad + c + pad + ticks : '';
    } else if (name === 'A') {
      const href = n.getAttribute('href') || '', text = inner();
      if (!href) s += text;
      else if (text === mdEscText(href) || text === mdEscText(href.replace(/^mailto:/, ''))) s += `<${href}>`;
      else s += `[${text}](${href.replace(/[ ()]/g, c => encodeURIComponent(c))}${n.title ? ` "${n.title.replace(/"/g, '\\"')}"` : ''})`;
    } else if (name === 'IMG') {
      const src = n.getAttribute('src') || '', alt = (n.getAttribute('alt') || '').replace(/[[\]]/g, '\\$&');
      s += n.getAttribute('width') ? `<img src="${esc(src)}" alt="${esc(n.getAttribute('alt') || '')}" width="${esc(n.getAttribute('width'))}">` : `![${alt}](${src.replace(/[ ()]/g, c => encodeURIComponent(c))})`;
    } else if (name === 'U' || name === 'SUP' || name === 'SUB' || name === 'MARK' || name === 'KBD') { const tg = name.toLowerCase(); s += `<${tg}>${inner()}</${tg}>`; }
    else if (n.classList && n.classList.contains('o-mention')) s += n.textContent;
    else if (/^(UL|OL)$/.test(name)) s += '\n' + mdListFrom(n, '');
    else if (MD_BLOCKISH.test(name)) s += '\n\n' + mdBlockFrom(n) + '\n\n';
    else s += inner();
  }
  return s;
}

const markdown = { toHTML: mdToHtml, fromHTML: htmlToMd, inline: (s, opts) => mdInline(s, null, opts) };
if (!O.markdown) O.markdown = markdown;
