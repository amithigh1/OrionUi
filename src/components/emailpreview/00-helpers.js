/* Email preview — pure helpers: sanitizing, dark-mode simulation CSS, image placeholders, HTML -> plain text.
 * None of this touches window/document at the top level; the isBrowser-only functions (epImagesOff, epHtmlToText)
 * are only ever invoked at runtime from OEmailPreview.update(). */

/** Defense-in-depth pass BEFORE sanitize(): strip <script> blocks, inline event handlers and javascript: URLs.
 *  sanitize() already removes all of these on its own (script/style/etc. are in its DROP_WITH_CONTENT set and
 *  on* attributes are always rejected); this just guarantees a script can never survive even if sanitize()
 *  were ever bypassed, reconfigured, or missing from a stripped-down host bundle. */
function epStripScripts(input) {
  return String(input ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*"(?:[^"\\]|\\.)*"/gi, '')
    .replace(/\son\w+\s*=\s*'(?:[^'\\]|\\.)*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript\s*:/gi, '');
}

/** Sanitize a full email HTML document (or fragment) for display. Keeps <style> (email HTML relies on it,
 *  and it is inert here since the iframe never gets allow-scripts) and the legacy bgcolor attribute; drops
 *  <title> explicitly first (once the surrounding <head> is unwrapped by the fragment parser its text would
 *  otherwise leak into the visible flow). Falls back to plain escaping if sanitize() is somehow unavailable
 *  (it is core and always in the bundle, but this keeps the helper safe to call from anywhere). */
function epSanitize(input) {
  const stripped = epStripScripts(input).replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, '');
  return isFn(sanitize) ? sanitize(stripped, { tags: ['style'], attrs: ['bgcolor'] }) : esc(stripped);
}

/** True when the email itself declares dark-mode awareness: a color-scheme / supported-color-schemes meta
 *  tag naming "dark", or a `prefers-color-scheme: dark` media query in an inline <style>. */
function epDeclaresDark(html) {
  const s = String(html ?? '');
  if (/prefers-color-scheme\s*:\s*dark/i.test(s)) return true;
  const metaRe = /<meta\b([^>]*)>/gi;
  let m;
  while ((m = metaRe.exec(s))) {
    const attrs = m[1];
    if (/name\s*=\s*["'](?:color-scheme|supported-color-schemes)["']/i.test(attrs) && /content\s*=\s*["'][^"']*dark[^"']*["']/i.test(attrs)) return true;
  }
  return false;
}

const EP_BASE_CSS = 'html,body{margin:0;padding:0;}' +
  'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1f2430;background:#ffffff;}' +
  'img{max-width:100%;height:auto;border:0;}a{color:#1a56db;}table{border-collapse:collapse;}';

/* Best-effort simulation of a mail client that forces its own dark palette onto a message with no dark-mode
 * styles of its own (this is how Outlook.com and some Gmail apps behave). It cannot be pixel-accurate — real
 * clients use different heuristics (some invert wholesale, some only recolor text, some skip images) — so
 * intentionally colored elements (a brand button, a colored banner) get muddled here exactly like they would
 * in a real forced-dark inbox. See the README for the documented limitations. */
const EP_DARK_CSS = 'html,body{background:#1b1d23 !important;}' +
  'body,table,td,th,tr,div,span,p,li,h1,h2,h3,h4,h5,h6,blockquote,strong,em,small,label,center,font{' +
  'background-color:transparent !important;color:#e7e9ee !important;border-color:#3a3f4b !important;}' +
  '[style*="background"]{background-color:#23262f !important;background-image:none !important;}' +
  'a{color:#8ab4ff !important;}img{filter:brightness(.92) contrast(1.05);}';

/** epBuildSrcdoc(rawHtml, { dark, images, subject }) -> full HTML document string for the sandboxed iframe srcdoc. */
function epBuildSrcdoc(rawHtml, opts = {}) {
  let body = epSanitize(rawHtml);
  if (opts.images === false) body = epImagesOff(body);
  const forceDark = !!opts.dark && !epDeclaresDark(rawHtml);
  const style = EP_BASE_CSS + (forceDark ? EP_DARK_CSS : '');
  const scheme = opts.dark ? 'dark' : 'light';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="' + scheme + '">' +
    '<title>' + esc(opts.subject || '') + '</title>' +
    '<style>' + style + '</style></head><body>' + body + '</body></html>';
}

/** SVG data-URI placeholder for a hidden image: sized like the original, labelled with its alt text. */
function epPlaceholderSvg(w, h, label) {
  const text = esc(String(label || 'Image').trim().slice(0, 60));
  const fs = clamp(Math.round(w / 18), 10, 16);
  const s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
    '<rect width="100%" height="100%" fill="#dde3ec"/>' +
    '<rect x="1" y="1" width="' + (w - 2) + '" height="' + (h - 2) + '" fill="none" stroke="#9aa5b5" stroke-width="1" stroke-dasharray="4 3"/>' +
    (text ? '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="' + fs + '" fill="#5b6472">' + text + '</text>' : '') +
    '</svg>';
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(s);
}

/** Replace every <img> src with a labelled placeholder. Runs in the PARENT on a detached <template> (never
 *  rendered, so no request is ever made for the original src) and returns the serialized HTML string. */
function epImagesOff(html) {
  if (!isBrowser) return html;
  const tpl = doc.createElement('template');
  tpl.innerHTML = String(html ?? '');
  tpl.content.querySelectorAll('img').forEach(img => {
    const alt = img.getAttribute('alt') || '';
    const w = clamp(parseInt(img.getAttribute('width'), 10) || 320, 24, 640);
    const h = clamp(parseInt(img.getAttribute('height'), 10) || 120, 24, 480);
    if (img.hasAttribute('src')) img.setAttribute('data-o-src', img.getAttribute('src'));
    img.setAttribute('src', epPlaceholderSvg(w, h, alt));
    img.removeAttribute('srcset');
    img.setAttribute('data-o-hidden-image', '');
  });
  const out = doc.createElement('div');
  out.appendChild(tpl.content);
  return out.innerHTML;
}

const EP_TEXT_BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'table', 'tr', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'hr', 'thead', 'tbody', 'tfoot']);

/** epHtmlToText(rawHtml) -> a plausible plain-text version: strips tags, keeps a line break per block element,
 *  keeps link URLs as "label (url)", keeps <img alt> as "[alt]", and collapses runs of whitespace. */
function epHtmlToText(rawHtml) {
  if (!isBrowser) return '';
  const tpl = doc.createElement('template');
  tpl.innerHTML = epSanitize(rawHtml);
  const lines = [];
  let cur = '';
  const flush = () => { const t = cur.replace(/[ \t]+/g, ' ').trim(); cur = ''; if (t) lines.push(t); };
  const walk = node => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { cur += n.data.replace(/\s+/g, ' '); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.localName;
      if (tag === 'style' || tag === 'script' || tag === 'head' || tag === 'title') continue;
      if (tag === 'br') { cur += '\n'; continue; }
      if (tag === 'img') { const alt = (n.getAttribute('alt') || '').trim(); if (alt) cur += '[' + alt + ']'; continue; }
      if (tag === 'a') {
        const href = (n.getAttribute('href') || '').trim();
        const label = n.textContent.replace(/\s+/g, ' ').trim();
        cur += href && label && !/^javascript:/i.test(href) && href !== label ? label + ' (' + href + ')' : (label || href);
        continue;
      }
      const block = EP_TEXT_BLOCK.has(tag);
      if (block) flush();
      walk(n);
      if (block) flush();
    }
  };
  walk(tpl.content);
  flush();
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** parseFrom("Ada Lovelace <ada@example.com>") -> { name: 'Ada Lovelace', email: 'ada@example.com' } */
function epFromParts(from) {
  const s = String(from || '').trim();
  const m = /^"?([^"<]*)"?\s*<([^>]+)>$/.exec(s);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { name: '', email: s };
  return { name: s, email: '' };
}
/** epInitial(from) -> a single uppercase letter for the inbox-row avatar, or '' when from is empty. */
function epInitial(from) {
  const { name, email } = epFromParts(from);
  const base = (name || email).trim();
  return base ? base[0].toUpperCase() : '';
}
/** epToText(to) -> "a@x.com, b@x.com" whether `to` is a string or an array. */
function epToText(to) {
  return Array.isArray(to) ? to.filter(Boolean).join(', ') : String(to ?? '').trim();
}
