/* ============================================================================
 * Orion.ai.markdown(text) -> SafeHTML — a small, safe Markdown renderer for AI output.
 * Supports headings, emphasis, strikethrough, lists (incl. one level of nesting), task lists,
 * links, inline code, fenced code (+ copy button, uses Orion.highlight when present), tables and
 * blockquotes. Every raw character is HTML-escaped before any markup is generated, and the final
 * HTML always passes through sanitize() — so any HTML/script hiding inside AI text is inert text,
 * never executed.
 * ========================================================================== */
i18n.add('en', { ai: { copyCode: 'Copy code', copied: 'Copied!' } });

const __MD_BLOCK_RE = /^(\s*)([-*+]\s+|\d+\.\s+|#{1,6}\s+|>\s?|```|~~~)/;
function __mdIsBlockStart(line) { return __MD_BLOCK_RE.test(line) || /^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim()); }
const __MD_MARK = '';

/** Inline markup: code spans, links, bold, italic, strikethrough. Input must already be raw markdown text. */
function __mdInline(text) {
  let s = esc(text);
  const codes = [];
  s = s.replace(/`([^`]+?)`/g, (m, c) => { codes.push(c); return __MD_MARK + (codes.length - 1) + __MD_MARK; });
  s = s.replace(/\[([^\]]+)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g, (m, txt, url, title) =>
    `<a href="${url}"${title ? ` title="${esc(title)}"` : ''} target="_blank" rel="noopener noreferrer">${txt}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (m, a, b) => `<strong>${a ?? b}</strong>`);
  s = s.replace(/(?<![*\w])\*([^*\n]+)\*(?!\*)|(?<![_\w])_([^_\n]+)_(?!_)/g, (m, a, b) => `<em>${a ?? b}</em>`);
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(new RegExp(__MD_MARK + '(\\d+)' + __MD_MARK, 'g'), (m, i) => `<code>${codes[+i]}</code>`);
  return s;
}
function __mdSplitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}
function __mdAlign(cell) {
  const start = cell.startsWith(':'), end = cell.endsWith(':');
  return start && end ? 'center' : end ? 'end' : start ? 'start' : '';
}
function __mdTable(header, aligns, rows) {
  const cell = (tag, list) => `<tr>${list.map((c, i) => `<${tag}${aligns[i] ? ` style="text-align:${aligns[i]}"` : ''}>${__mdInline(c)}</${tag}>`).join('')}</tr>`;
  return `<table><thead>${cell('th', header)}</thead><tbody>${rows.map(r => cell('td', r)).join('')}</tbody></table>`;
}
function __mdCodeBlock(code, lang) {
  let inner;
  if (lang && isFn(O.highlight)) { try { inner = String(O.highlight(code, lang)); } catch { inner = esc(code); } }
  else inner = esc(code);
  return `<div class="o-md-code"><div class="o-md-code-bar"><span class="o-md-lang">${esc(lang || 'text')}</span>`
    + `<button type="button" class="o-md-copy" aria-label="${esc(t('ai.copyCode'))}">${icon('copy')}<span>${esc(t('common.copy'))}</span></button></div>`
    + `<pre class="o-pre o-md-pre"><code class="language-${esc(lang || '')}">${inner}</code></pre></div>`;
}
/** Parse a (possibly nested) list starting at lines[start]; returns { html, next }. */
function __mdList(lines, start) {
  const n = lines.length;
  const topIndent = lines[start].match(/^(\s*)/)[1].length;
  const ordered = /^\s*\d+\./.test(lines[start]);
  let i = start;
  const items = [];
  while (i < n && lines[i].trim() !== '') {
    const m = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (!m) break;
    const indent = m[1].length;
    if (indent < topIndent) break;
    if (indent === topIndent) { items.push({ text: m[3], sub: [] }); i++; }
    else { if (items.length) items[items.length - 1].sub.push(lines[i]); i++; }
  }
  const lis = items.map(it => {
    const task = it.text.match(/^\[([ xX])\]\s+(.*)$/);
    const inner = task
      ? `<span class="o-md-checkbox${task[1].toLowerCase() === 'x' ? ' is-done' : ''}" aria-hidden="true"></span>${__mdInline(task[2])}`
      : __mdInline(it.text);
    let sub = '';
    if (it.sub.length && /^(\s*)([-*+]|\d+\.)\s+/.test(it.sub[0])) sub = __mdList(it.sub, 0).html;
    return `<li${task ? ' class="o-md-task"' : ''}>${inner}${sub}</li>`;
  });
  const tag = ordered ? 'ol' : 'ul';
  return { html: `<${tag}>${lis.join('')}</${tag}>`, next: i };
}
function __mdBlocks(lines) {
  const out = [];
  const n = lines.length;
  let i = 0;
  while (i < n) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = line.match(/^(```|~~~)(\S*)\s*$/);
    if (fence) {
      const close = fence[1], lang = fence[2] || '';
      const body = []; i++;
      while (i < n && lines[i].trim() !== close) { body.push(lines[i]); i++; }
      i++;
      out.push(__mdCodeBlock(body.join('\n'), lang));
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${__mdInline(h[2].trim())}</h${h[1].length}>`); i++; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) { out.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(line)) {
      const body = [];
      while (i < n && /^>\s?/.test(lines[i])) { body.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote>${__mdBlocks(body)}</blockquote>`);
      continue;
    }
    if (line.includes('|') && i + 1 < n && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(lines[i + 1])) {
      const header = __mdSplitRow(line);
      const aligns = __mdSplitRow(lines[i + 1]).map(__mdAlign);
      i += 2;
      const rows = [];
      while (i < n && lines[i].includes('|') && lines[i].trim()) { rows.push(__mdSplitRow(lines[i])); i++; }
      out.push(__mdTable(header, aligns, rows));
      continue;
    }
    if (/^(\s*)([-*+]|\d+\.)\s+/.test(line)) { const r = __mdList(lines, i); out.push(r.html); i = r.next; continue; }
    const buf = [line]; i++;
    while (i < n && lines[i].trim() && !__mdIsBlockStart(lines[i])) { buf.push(lines[i]); i++; }
    out.push(`<p>${__mdInline(buf.join(' ').trim())}</p>`);
  }
  return out.join('');
}
/** Orion.ai.markdown(text) -> SafeHTML. Always sanitized; safe to insert with innerHTML/html``. */
function renderMarkdown(text) {
  const src = String(text ?? '').replace(/\r\n?/g, '\n');
  if (!src.trim()) return raw('');
  const html = __mdBlocks(src.split('\n'));
  return raw(sanitize(html, { tags: ['del'] }));
}

if (isBrowser) {
  on(doc, 'click', '.o-md-copy', async (e, btn) => {
    const code = btn.closest('.o-md-code')?.querySelector('code');
    if (!code) return;
    try { await navigator.clipboard.writeText(code.textContent); } catch { /* clipboard unavailable */ }
    const span = btn.querySelector('span');
    if (!span) return;
    const orig = span.textContent;
    span.textContent = t('ai.copied');
    btn.classList.add('is-copied');
    setTimeout(() => { span.textContent = orig; btn.classList.remove('is-copied'); }, 1400);
  });
}
