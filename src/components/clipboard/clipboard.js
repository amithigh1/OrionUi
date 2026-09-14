/* Orion.clipboard — copy / read / paste helpers, copy buttons and feedback.
 *   await Orion.clipboard.copy('text' | { text, html } | Blob | Element) -> true/false   (execCommand fallback for text/html)
 *   await Orion.clipboard.readText() · await Orion.clipboard.read() -> { text, html, files, images }
 *   const off = Orion.clipboard.onPaste(el, ({ text, html, files, images, event }) => …, { preventDefault })
 *   Orion.clipboard.feedback(el, ok)   check-icon swap + "Copied!" bubble (Orion.tooltip when present) + announce()
 *   <button data-o-action="copy" data-o-value="text">   data-o-target="#el" (value / text of target)   data-o-copy-html   data-o-copied="Done!"
 *   <o-copy value="…" | target="#sel" variant="icon|button|input" label="Copy link"></o-copy>          o-copy { text, success }
 */
i18n.add('en', { clipboard: { copy: 'Copy', copied: 'Copied!', failed: 'Copy failed', copyValue: 'Copy {label}', pasted: 'Pasted {what}', image: 'image', images: '{count} images', text: 'text' } });

const __blobItems = blob => [new ClipboardItem({ [blob.type || 'text/plain']: blob })];
function __execCopy(text, htmlStr) {
  if (!isBrowser) return false;
  const active = doc.activeElement, sel = doc.getSelection(), ranges = [];
  for (let i = 0; i < (sel?.rangeCount || 0); i++) ranges.push(sel.getRangeAt(i));
  let ok = false;
  const node = htmlStr != null ? h('div', { contenteditable: 'true', 'aria-hidden': 'true', html: sanitize(htmlStr) }) : h('textarea', { readonly: true, 'aria-hidden': 'true' });
  node.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;pointer-events:none;white-space:pre';
  if (htmlStr == null) node.value = text;
  doc.body.appendChild(node);
  try {
    if (htmlStr != null) { const r = doc.createRange(); r.selectNodeContents(node); sel.removeAllRanges(); sel.addRange(r); }
    else { node.select(); node.setSelectionRange(0, text.length); }
    ok = doc.execCommand('copy');
  } catch { ok = false; }
  node.remove();
  try { sel?.removeAllRanges(); ranges.forEach(r => sel.addRange(r)); } catch {}
  if (active && isFn(active.focus)) active.focus({ preventScroll: true });
  return ok;
}
/** textOf(el): value of form fields, else visible text */
const __textOf = el => (el == null ? '' : 'value' in el && /^(INPUT|TEXTAREA|SELECT|O-)/.test(el.tagName) && el.value != null ? String(el.value) : (el.innerText ?? el.textContent ?? '').trim());

const clipboard = {
  get supported() { return isBrowser && (!!navigator.clipboard?.writeText || !!doc.queryCommandSupported?.('copy')); },
  get canRead() { return isBrowser && !!navigator.clipboard?.read; },
  /** copy(text | { text, html } | Blob | Element) -> Promise<boolean> */
  async copy(data) {
    if (!isBrowser || data == null) return false;
    let text, htmlStr = null;
    if (data instanceof Blob) {
      try { await navigator.clipboard.write(__blobItems(data)); return true; } catch { if (!data.type.startsWith('text/')) return false; text = await data.text(); }
    } else if (data instanceof Element) text = __textOf(data);
    else if (isObj(data)) { text = data.text ?? ''; htmlStr = data.html ?? null; }
    else text = String(data);
    if (htmlStr != null && navigator.clipboard?.write && win.ClipboardItem) {
      try { await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text || ''], { type: 'text/plain' }), 'text/html': new Blob([htmlStr], { type: 'text/html' }) })]); return true; } catch {}
    } else if (htmlStr == null && navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch {}
    }
    return __execCopy(text, htmlStr);
  },
  /** readText() -> Promise<string> ('' when blocked) */
  async readText() { try { return await navigator.clipboard.readText(); } catch { return ''; } },
  /** read() -> Promise<{ text, html, files, images }> (needs permission; empty when blocked) */
  async read() {
    const out = { text: '', html: '', files: [], images: [] };
    try {
      for (const item of await navigator.clipboard.read()) {
        for (const type of item.types) {
          const blob = await item.getType(type);
          if (type === 'text/plain') out.text = await blob.text();
          else if (type === 'text/html') out.html = await blob.text();
          else { const f = new File([blob], `clipboard-${Date.now()}.${(type.split('/')[1] || 'bin').replace('+xml', '')}`, { type }); out.files.push(f); if (type.startsWith('image/')) out.images.push(f); }
        }
      }
    } catch { out.text = await clipboard.readText(); }
    return out;
  },
  /** onPaste(el, handler({ text, html, files, images, event }), { preventDefault }) -> off() */
  onPaste(target, handler, { preventDefault = false } = {}) {
    const el = $(target) || doc;
    const fn = e => {
      const cd = e.clipboardData;
      if (!cd) return;
      const files = [];
      for (const it of cd.items || []) {
        if (it.kind !== 'file') continue;
        let f = it.getAsFile();
        if (!f) continue;
        if (!f.name || /^image\.\w+$/.test(f.name)) f = new File([f], `pasted-${Date.now()}${files.length ? '-' + files.length : ''}.${(f.type.split('/')[1] || 'png').replace('+xml', '')}`, { type: f.type, lastModified: Date.now() });
        files.push(f);
      }
      const d = { text: cd.getData('text/plain') || '', html: cd.getData('text/html') || '', files, images: files.filter(f => f.type.startsWith('image/')), event: e };
      if (preventDefault) e.preventDefault();
      if (handler(d) === false) e.preventDefault();
    };
    el.addEventListener('paste', fn);
    return () => el.removeEventListener('paste', fn);
  },
  /** feedback(el, ok = true, text) — visual + announced confirmation on a copy trigger */
  feedback(el, ok = true, text) {
    const msg = text || el?.getAttribute?.('data-o-copied') || t(ok ? 'clipboard.copied' : 'clipboard.failed');
    announce(msg);
    if (!el || !el.isConnected) return;
    clearTimeout(el.__oCopyT);
    el.classList.add(ok ? 'is-copied' : 'is-copy-failed');
    const ic = el.querySelector('o-icon[name="copy"], o-icon[name="link"], .o-icon-copy, .o-icon-link');
    if (ok && ic && !el.__oCopyIcon) {
      el.__oCopyIcon = ic;
      const check = iconEl('check', { class: 'o-copy-check' });
      ic.replaceWith(check);
      el.__oCopyCheck = check;
    }
    let shown = false;
    if (isFn(O.tooltip?.flash)) { try { O.tooltip.flash(el, msg); shown = true; } catch {} }
    if (!shown) __bubble(el, msg, ok);
    el.__oCopyT = setTimeout(() => {
      el.classList.remove('is-copied', 'is-copy-failed');
      if (el.__oCopyCheck) { el.__oCopyCheck.replaceWith(el.__oCopyIcon); el.__oCopyCheck = el.__oCopyIcon = null; }
    }, 1600);
  },
};
let __bub = null, __bubT = 0, __bubOff = null;
function __bubble(el, msg, ok) {
  if (!__bub) __bub = h('div', { class: 'o-copy-bubble', role: 'presentation', 'aria-hidden': 'true' });
  __bub.textContent = msg;
  __bub.classList.toggle('is-error', !ok);
  portal(__bub, el);
  __bub.hidden = false;
  __bub.style.zIndex = String(Z.tooltip);
  __bubOff?.();
  __bubOff = autoPlace(__bub, el, { placement: 'top', offset: 6 });
  animate(__bub, 'slideInUp', { duration: 140 });
  clearTimeout(__bubT);
  __bubT = setTimeout(() => { __bub.hidden = true; __bubOff?.(); __bubOff = null; }, 1300);
}
/** resolve what a trigger copies: data-o-value | data-o-target (value/text) | data-o-copy (text) */
function __copyData(trigger, target) {
  const v = trigger.getAttribute('data-o-value') ?? trigger.getAttribute('data-o-copy');
  if (v != null) return v;
  if (!target) return '';
  return trigger.hasAttribute('data-o-copy-html') ? { text: __textOf(target), html: target.innerHTML } : __textOf(target);
}
action('copy', async (trigger, e, target) => {
  const data = __copyData(trigger, target);
  if (!emit(trigger, 'o-before-copy', { data }).defaultPrevented) {
    const ok = await clipboard.copy(data);
    clipboard.feedback(trigger, ok);
    emit(trigger, 'o-copy', { text: isObj(data) ? data.text : data, success: ok });
  }
});

class OCopy extends OElement {
  static props = { value: String, target: String, variant: { type: String, default: 'icon', reflect: true }, label: String, size: String, texts: Object };
  setup() {
    this.classList.add('o-copy');
    on(this, 'click', '.o-copy-btn', () => this.copy());
    on(this, 'click', '.o-copy-field', e => e.target.select());
  }
  /** Text that will be copied */
  get text() { if (this.value != null && this.value !== '') return this.value; const el = this.target ? $(this.target) : null; return el ? __textOf(el) : ''; }
  async copy() {
    const text = this.text, btn = this.$('.o-copy-btn');
    if (!this.emit('before-copy', { text })) return false;
    const ok = await clipboard.copy(text);
    clipboard.feedback(btn || this, ok);
    this.emit('copy', { text, success: ok });
    return ok;
  }
  render() {
    const v = this.variant, lbl = this.label || this.t('clipboard.copy'), sz = this.size === 'sm' ? ' o-btn-sm' : this.size === 'lg' ? ' o-btn-lg' : '';
    const aria = this.label ? this.label : this.t('clipboard.copy');
    if (v === 'input') {
      const id = this._fid || (this._fid = uid('copy'));
      this.innerHTML = String(html`<div class="o-input-group"><input class="o-input o-copy-field${sz ? ' o-input-' + this.size : ''}" id="${id}" readonly value="${this.text}" aria-label="${this.label || this.t('clipboard.copy')}"><button type="button" class="o-btn o-copy-btn${sz}" aria-label="${this.t('clipboard.copyValue', { label: this.label || '' }).trim()}" aria-controls="${id}">${icon('copy')}<span>${this.t('clipboard.copy')}</span></button></div>`);
    } else if (v === 'button') {
      this.innerHTML = String(html`<button type="button" class="o-btn o-copy-btn${sz}">${icon('copy')}<span>${lbl}</span></button>`);
    } else {
      this.innerHTML = String(html`<button type="button" class="o-btn o-btn-ghost o-btn-icon o-copy-btn${sz || ' o-btn-sm'}" aria-label="${aria}" title="${aria}">${icon('copy')}</button>`);
    }
  }
}
define('o-copy', OCopy);
O.clipboard = clipboard;
O.Copy = OCopy;
