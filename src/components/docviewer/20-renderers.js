/* Renderers for plain formats previewed by <o-docviewer>: CSV (table), JSON (collapsible tree),
 * Markdown (safe mini renderer — escapes everything first, so raw HTML in the source is inert), code (line numbers).
 */
function dvParseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) { if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || r[0] !== '');
}
function renderCSV(text) {
  const rows = dvParseCSV(text);
  if (!rows.length) return h('div', { class: 'o-empty o-empty-sm' }, h('p', { class: 'o-empty-text' }, t('docviewer.empty')));
  const [header, ...body] = rows;
  return h('div', { class: 'o-table-wrap o-docviewer-csv' }, h('table', { class: 'o-table o-table-striped o-table-sm o-table-sticky' },
    h('thead', {}, h('tr', {}, header.map(c => h('th', {}, c)))),
    h('tbody', {}, body.map(r => h('tr', {}, header.map((_, i) => h('td', {}, r[i] ?? '')))))));
}

function dvJsonScalar(v) { if (v === null) return 'null'; if (typeof v === 'string') return JSON.stringify(v); return String(v); }
function dvJsonNode(value, key, depth) {
  const isObj2 = value !== null && typeof value === 'object';
  const keyEl = key != null ? h('span', { class: 'o-docviewer-json-key' }, key + ': ') : null;
  if (!isObj2) return h('div', { class: 'o-docviewer-json-row' }, keyEl, h('span', { class: cls('o-docviewer-json-val', 'is-' + (value === null ? 'null' : typeof value)) }, dvJsonScalar(value)));
  const isArr = Array.isArray(value);
  const entries = isArr ? value.map((v, i) => [i, v]) : Object.entries(value);
  const details = h('details', { class: 'o-docviewer-json-node', open: depth < 2 ? true : null });
  details.append(
    h('summary', {}, keyEl, h('span', { class: 'o-docviewer-json-brace' }, isArr ? `Array(${entries.length})` : `{ ${entries.length} ${entries.length === 1 ? 'key' : 'keys'} }`)),
    h('div', { class: 'o-docviewer-json-children' }, entries.map(([k, v]) => dvJsonNode(v, isArr ? '[' + k + ']' : JSON.stringify(String(k)), depth + 1))));
  return details;
}
function renderJSON(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return h('div', { class: 'o-empty o-empty-sm is-error' }, icon('alert-triangle'), h('p', { class: 'o-empty-text' }, String(e.message || e))); }
  return h('div', { class: 'o-docviewer-json' }, dvJsonNode(data, null, 0));
}

function renderCode(text, lang) {
  let lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return h('div', { class: 'o-docviewer-code' },
    h('div', { class: 'o-docviewer-code-gutter', 'aria-hidden': 'true' }, lines.map((_, i) => h('span', {}, String(i + 1)))),
    h('pre', { class: 'o-docviewer-code-pre' }, h('code', { class: lang ? 'language-' + lang : null, text: lines.join('\n') })));
}
function renderText(text) { return h('pre', { class: 'o-docviewer-text', text: String(text ?? '') }); }

/* ── Markdown (safe mini renderer): escape first, only ever splice OUR OWN tags around escaped text ── */
const dvIsSafeUrl = v => { const s = String(v).replace(/[\x00-\x20]/g, ''); return !/^[a-z][a-z0-9+.-]*:/i.test(s) || /^(https?|mailto|tel):/i.test(s); };
let __dvMdBase = ''; // absolute URL of the markdown source, so relative image/link paths resolve against IT, not the host page
function dvResolveUrl(url) {
  if (!__dvMdBase || /^([a-z][a-z0-9+.-]*:)?\/\//i.test(url) || /^(data|blob|mailto|tel):/i.test(url) || url.startsWith('#')) return url;
  try { return new URL(url, __dvMdBase).href; } catch { return url; }
}
function dvMdInline(text) {
  let s = esc(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (m, alt, url, title) => dvIsSafeUrl(url) ? `<img src="${dvResolveUrl(url)}" alt="${alt}"${title ? ` title="${title}"` : ''} loading="lazy">` : alt);
  s = s.replace(/\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (m, txt, url, title) => dvIsSafeUrl(url) ? `<a href="${dvResolveUrl(url)}" target="_blank" rel="noopener noreferrer"${title ? ` title="${title}"` : ''}>${txt}</a>` : txt);
  s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (m, a, b) => `<strong>${a || b}</strong>`);
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, (m, pre, t2) => `${pre}<em>${t2}</em>`);
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return s;
}
/** renderMarkdown(text, baseUrl?) — baseUrl (the source file's own absolute URL) resolves relative image/link paths. */
function renderMarkdown(src, baseUrl) {
  __dvMdBase = baseUrl || '';
  try { return dvRenderMarkdownBody(src); } finally { __dvMdBase = ''; }
}
function dvRenderMarkdownBody(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  let out = '', i = 0, para = [];
  const flushPara = () => { if (para.length) { out += `<p>${dvMdInline(para.join(' '))}</p>`; para = []; } };
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^```\s*([\w-]*)/.exec(line);
    if (fence) {
      flushPara();
      const lang = fence[1]; const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // skip closing fence
      out += `<pre class="o-docviewer-md-code"><code>${esc(buf.join('\n'))}</code></pre>`;
      continue;
    }
    if (!line.trim()) { flushPara(); i++; continue; }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) { flushPara(); out += `<h${heading[1].length}>${dvMdInline(heading[2])}</h${heading[1].length}>`; i++; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushPara(); out += '<hr>'; i++; continue; }
    if (/^>\s?/.test(line)) {
      flushPara(); const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out += `<blockquote><p>${dvMdInline(buf.join(' '))}</p></blockquote>`;
      continue;
    }
    const tableHead = /^\|?(.+)\|?$/.exec(line);
    if (tableHead && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(lines[i + 1] || '')) {
      flushPara();
      const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const header = cells(line); i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|')) { rows.push(cells(lines[i])); i++; }
      out += '<table><thead><tr>' + header.map(c => `<th>${dvMdInline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + header.map((_, k) => `<td>${dvMdInline(r[k] || '')}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
      continue;
    }
    const listItem = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (listItem) {
      flushPara();
      const ordered = /\d/.test(listItem[2]);
      const tag = ordered ? 'ol' : 'ul';
      out += `<${tag}>`;
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!m || /\d/.test(m[2]) !== ordered) break;
        const box = /^\[( |x|X)\]\s+(.*)$/.exec(m[3]);
        if (box) out += `<li class="o-docviewer-md-task"><input type="checkbox" disabled${/x/i.test(box[1]) ? ' checked' : ''}> ${dvMdInline(box[2])}</li>`;
        else out += `<li>${dvMdInline(m[3])}</li>`;
        i++;
      }
      out += `</${tag}>`;
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flushPara();
  return h('div', { class: 'o-prose o-docviewer-md' }, raw(out));
}
