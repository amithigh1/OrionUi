/* Orion.print — print the page, an element, a selector or an HTML string (hidden iframe, page styles copied).
 *   await Orion.print('#invoice', { title: 'Invoice 42', landscape: true, margins: '12mm' | 12 | { top, right, bottom, left },
 *                                   pageSize: 'A4' | 'letter', styles: true, css: '…', bodyClass, beforePrint({ window, document }), afterPrint() })
 *   await Orion.print()                 print the page itself (same options: title, landscape, margins, css, hooks)
 *   Orion.print.html(target, opts)      -> the full HTML document that would be printed (preview / tests)
 *   <button data-o-action="print" data-o-target="#invoice" data-o-print-title="Invoice" data-o-landscape>
 *   Helper classes: .o-print-hide / .o-no-print (hidden when printing) · .o-print-only (only when printing) · .o-print-break (page break before)
 *   Bus events: 'print:before' / 'print:after'
 */
i18n.add('en', { print: { print: 'Print', preparing: 'Preparing to print…', frame: 'Print preview' } });

const PRINT_BASE = 'html,body{margin:0;background:#fff}body{padding:0}:not(:defined){visibility:visible!important}.o-print-root{margin:0!important;max-width:none!important;box-shadow:none!important}'
  + '.o-print-break{break-before:page}@media print{.o-print-hide,.o-no-print{display:none!important}}';
const __mm = v => (isNum(v) ? v + 'mm' : String(v));
function __pageCSS(o) {
  const size = [o.pageSize, o.landscape ? 'landscape' : o.landscape === false && o.pageSize ? 'portrait' : ''].filter(Boolean).join(' ');
  let m = '';
  if (o.margins != null) m = isObj(o.margins) ? ['top', 'right', 'bottom', 'left'].map(k => __mm(o.margins[k] ?? 0)).join(' ') : __mm(o.margins);
  return size || m ? `@page{${size ? 'size:' + size + ';' : ''}${m ? 'margin:' + m + ';' : ''}}` : '';
}
function __collectStyles() {
  let out = '';
  for (const n of doc.querySelectorAll('style, link[rel~="stylesheet"]')) {
    if (n.hasAttribute('data-o-print-ignore') || n.media === 'screen') continue;
    if (n.tagName === 'LINK') out += `<link rel="stylesheet" href="${esc(n.href)}"${n.media ? ` media="${esc(n.media)}"` : ''}>`;
    else out += `<style${n.media ? ` media="${esc(n.media)}"` : ''}>${n.textContent.replace(/<\/style/gi, '<\\/style')}</style>`;
  }
  try { for (const s of doc.adoptedStyleSheets || []) out += `<style>${[...s.cssRules].map(r => r.cssText).join('\n')}</style>`; } catch {}
  const inline = doc.documentElement.getAttribute('style');
  if (inline) out += `<style>:root{${inline.replace(/<\/style/gi, '')}}</style>`;
  return out;
}
function __cloneForPrint(el) {
  const c = el.cloneNode(true);
  const src = el.tagName === 'CANVAS' ? [el] : [...el.querySelectorAll('canvas')], dst = el.tagName === 'CANVAS' ? [c] : [...c.querySelectorAll('canvas')];
  src.forEach((cv, i) => {
    try {
      const img = doc.createElement('img');
      img.src = cv.toDataURL('image/png');
      img.alt = cv.getAttribute('aria-label') || '';
      img.style.cssText = cv.style.cssText;
      img.style.width = (cv.clientWidth || cv.width) + 'px'; img.style.maxWidth = '100%'; img.style.height = 'auto';
      if (dst[i] === c) return;
      dst[i].replaceWith(img);
    } catch {}
  });
  c.querySelectorAll('script, template').forEach(n => n.remove());
  c.querySelectorAll('details').forEach(d => d.setAttribute('open', ''));
  c.querySelectorAll('[hidden].o-print-only').forEach(n => n.removeAttribute('hidden'));
  c.classList.add('o-print-root');
  return c;
}
/** html(target, opts) -> complete HTML document string */
function printHTML(target, o = {}) {
  if (!isBrowser) return '';
  let body;
  if (isStr(target) && /^\s*</.test(target)) body = target;
  else {
    const el = $(target);
    if (!el) throw new Error('Orion.print: target not found: ' + target);
    body = __cloneForPrint(el).outerHTML;
  }
  const de = doc.documentElement, title = o.title ?? doc.title;
  return `<!doctype html><html lang="${esc(de.lang || 'en')}" dir="${esc(dirOf(isStr(target) ? de : $(target) || de))}" data-theme="light"${de.getAttribute('data-contrast') ? ' data-contrast="high"' : ''}>`
    + `<head><meta charset="utf-8"><title>${esc(title)}</title><base href="${esc(doc.baseURI)}">${o.styles === false ? '' : __collectStyles()}`
    + `<style>${PRINT_BASE}${__pageCSS(o)}${String(o.css || '').replace(/<\/style/gi, '')}</style></head><body class="o-print-frame ${esc(o.bodyClass || '')}">${body}</body></html>`;
}
const __waitAssets = (d, ms) => Promise.race([
  Promise.all([...d.images].map(img => (img.complete ? 1 : new Promise(r => { img.onload = img.onerror = r; }))).concat(d.fonts?.ready || [])),
  sleep(ms),
]);

async function print(target, opts = {}) {
  if (!isBrowser) return false;
  const o = { styles: true, timeout: 4000, ...opts };
  const ctx = { target: target ?? null, options: o };
  if (target == null || target === doc || target === win || target === 'page') {
    const css = __pageCSS(o) + (o.css || '');
    const st = css ? h('style', { media: 'print', 'data-o-print': '' }, css) : null;
    if (st) doc.head.append(st);
    const oldTitle = doc.title;
    if (o.title) doc.title = o.title;
    await o.beforePrint?.({ window: win, document: doc });
    bus.emit('print:before', ctx);
    return new Promise(resolve => {
      let fin = false;
      const done = () => { if (fin) return; fin = true; st?.remove(); if (o.title) doc.title = oldTitle; try { o.afterPrint?.(); } catch (e) { console.error(e); } bus.emit('print:after', ctx); resolve(true); };
      win.addEventListener('afterprint', done, { once: true });
      win.print();
      setTimeout(done, 1500);   // browsers without afterprint (print() blocks in the others)
    });
  }
  const markup = printHTML(target, o);
  const frame = h('iframe', { class: 'o-print-iframe', title: t('print.frame'), 'aria-hidden': 'true', tabindex: '-1' });
  frame.style.cssText = 'position:fixed;inset-inline-end:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  const loaded = new Promise(r => frame.addEventListener('load', r, { once: true }));
  frame.srcdoc = markup;
  doc.body.append(frame);
  await loaded;
  const w = frame.contentWindow, d = frame.contentDocument;
  await __waitAssets(d, o.timeout);
  await o.beforePrint?.({ window: w, document: d, frame });
  bus.emit('print:before', ctx);
  return new Promise(resolve => {
    let fin = false;
    const finish = () => {
      if (fin) return; fin = true;
      try { o.afterPrint?.(); } catch (e) { console.error(e); }
      bus.emit('print:after', ctx);
      setTimeout(() => frame.remove(), 50);
      resolve(true);
    };
    w.addEventListener('afterprint', () => setTimeout(finish, 50), { once: true });
    w.focus();
    w.print();
    setTimeout(finish, o.cleanupAfter ?? 120000);   // safety net if afterprint never fires
  });
}
print.html = printHTML;
print.pageCSS = __pageCSS;

action('print', async (trigger, e, target) => {
  const A = n => trigger.getAttribute('data-o-' + n);
  const done = () => trigger.removeAttribute('aria-busy');
  const opts = { title: A('print-title') || undefined, landscape: trigger.hasAttribute('data-o-landscape') || undefined, margins: A('print-margins') || undefined, pageSize: A('print-size') || undefined, beforePrint: done };
  if (target) { trigger.setAttribute('aria-busy', 'true'); announce(t('print.preparing')); }
  try { await print(target || null, opts); } catch (err) { console.error('[Orion] print failed:', err); } finally { done(); }
});
O.print = print;
