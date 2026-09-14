/* Orion.share — Web Share API with a network sheet fallback (X, Facebook, LinkedIn, WhatsApp, Telegram, Reddit, Email, Copy link, QR).
 *   const r = await Orion.share({ title, text, url, files, networks: ['x', 'linkedin', 'copy'], native: true | false | 'mobile', anchor: buttonEl })
 *     r = { shared, method: 'native' | 'network' | 'copy' | 'qr' | 'sheet', network?, cancelled? }
 *   Orion.share.networks.add('mastodon', { label, glyph: '<path …/>', url: ({ url, text, title }) => '…' })
 *   Orion.share.link('x', { url, text }) -> network URL · Orion.share.close()
 *   <o-share url title text networks="x,linkedin,copy" variant="button|icons" native="auto|mobile|never" label></o-share>
 *   <button data-o-action="share" data-o-url data-o-title data-o-text data-o-networks>
 *   Brand colors are opt-in via CSS vars: .o-share { --o-share-x: #000; --o-share-x-fg: #fff; … }
 */
i18n.add('en', {
  share: {
    share: 'Share', title: 'Share', shareOn: 'Share on {network}', copyLink: 'Copy link', copied: 'Link copied', qr: 'QR code', qrHint: 'Scan to open on another device',
    email: 'Email', more: 'More', link: 'Link', qrUnavailable: 'QR code unavailable', shared: 'Opened {network}',
  },
});

const __enc = encodeURIComponent;
const __stroke = d => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
const __net = {
  x: { label: 'X', glyph: '<path d="M4 3.5h4.3l11.7 17h-4.3z"/><path d="M19.3 3.5 13.4 10.2M4.7 20.5l6-6.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    url: d => `https://x.com/intent/post?text=${__enc(d.text || d.title || '')}&url=${__enc(d.url)}` },
  facebook: { label: 'Facebook', glyph: '<path d="M13.6 21v-7.4h2.5l.4-3h-2.9V8.8c0-.9.3-1.5 1.5-1.5h1.5V4.6c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.3H8.2v3h2.5V21z"/>',
    url: d => `https://www.facebook.com/sharer/sharer.php?u=${__enc(d.url)}` },
  linkedin: { label: 'LinkedIn', glyph: '<path d="M4.5 9h3.2v11H4.5zM6.1 3.8a1.85 1.85 0 1 1 0 3.7 1.85 1.85 0 0 1 0-3.7zM9.8 9h3.1v1.5h.1c.4-.8 1.5-1.7 3.1-1.7 3.3 0 3.9 2.2 3.9 5V20h-3.2v-5.4c0-1.3 0-2.9-1.8-2.9s-2 1.4-2 2.8V20H9.8z"/>',
    url: d => `https://www.linkedin.com/sharing/share-offsite/?url=${__enc(d.url)}` },
  whatsapp: { label: 'WhatsApp', glyph: '<path fill-rule="evenodd" d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1 0 12 2.5zm0 1.8a7.7 7.7 0 1 1-4 14.3l-.3-.2-2.8.8.8-2.7-.2-.3A7.7 7.7 0 0 1 12 4.3z"/><path d="M9.2 7.6c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.6 1 2.7c.1.2 1.8 2.9 4.5 4 2.2.9 2.7.7 3.2.7.5-.1 1.6-.7 1.8-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3l-1.9-.9c-.3-.1-.4-.1-.6.1l-.8 1c-.2.2-.3.2-.6.1-.3-.1-1.2-.4-2.2-1.4-.8-.7-1.4-1.6-1.5-1.9-.2-.3 0-.4.1-.5l.4-.5.3-.5c.1-.2 0-.4 0-.5z"/>',
    url: d => `https://wa.me/?text=${__enc([d.text || d.title, d.url].filter(Boolean).join(' '))}` },
  telegram: { label: 'Telegram', glyph: '<path d="M21.5 3.5 2.8 10.6c-1 .4-1 1.4 0 1.7l4.6 1.5 1.7 5.5c.2.7 1.1.9 1.6.4l2.5-2.4 4.6 3.4c.6.4 1.4.1 1.6-.6l3-14.9c.2-.9-.6-1.5-1.4-1.2zM9.6 14.3l-.5 4.1-1.3-4.8L18 7.3z" fill-rule="evenodd"/>',
    url: d => `https://t.me/share/url?url=${__enc(d.url)}&text=${__enc(d.text || d.title || '')}` },
  reddit: { label: 'Reddit', glyph: '<path fill-rule="evenodd" d="M12 8.2c4.5 0 8.2 2.6 8.2 5.8s-3.7 5.8-8.2 5.8-8.2-2.6-8.2-5.8S7.5 8.2 12 8.2zM9 12.3a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zm6 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zm-5.6 4.4c.8.6 1.7.9 2.6.9s1.8-.3 2.6-.9l-.5-.6c-.6.5-1.3.7-2.1.7s-1.5-.2-2.1-.7z"/><circle cx="18.3" cy="4.6" r="1.7"/><circle cx="4.3" cy="10.9" r="1.8"/><circle cx="19.7" cy="10.9" r="1.8"/><path d="M12 8.3 13.3 3.4l4.8 1.1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
    url: d => `https://www.reddit.com/submit?url=${__enc(d.url)}&title=${__enc(d.title || d.text || '')}` },
  email: { label: () => t('share.email'), glyph: '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>' + __stroke('m3.5 7 8.5 6 8.5-6'),
    url: d => `mailto:?subject=${__enc(d.title || '')}&body=${__enc([d.text, d.url].filter(Boolean).join('\n\n'))}`, self: true },
  copy: { label: () => t('share.copyLink'), glyph: __stroke('M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7') + __stroke('M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7') },
  qr: { label: () => t('share.qr'), available: () => __qrAvailable(), glyph: '<path fill-rule="evenodd" d="M3 3h8v8H3zm2 2v4h4V5zm8-2h8v8h-8zm2 2v4h4V5zM3 13h8v8H3zm2 2v4h4v-4z"/><path d="M6 6h2v2H6zm10 0h2v2h-2zM6 16h2v2H6zm7-3h2v2h-2zm2 2h2v2h-2zm2-2h4v2h-4zm-4 4h2v4h-2zm4 0h2v2h-2zm2 2h2v2h-2z"/>' },
  native: { label: () => t('share.more'), available: () => isBrowser && !!navigator.share, glyph: __stroke('M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13') },
};
const SHARE_DEFAULT = ['x', 'facebook', 'linkedin', 'whatsapp', 'telegram', 'reddit', 'email', 'qr', 'copy'];
const __glyph = n => raw(`<svg class="o-share-glyph" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${__net[n]?.glyph || ''}</svg>`);
const __label = n => { const l = __net[n]?.label; return isFn(l) ? l() : l || cap(n); };
const __qrAvailable = () => isBrowser && (!!customElements.get('o-qr') || isFn(O.qr) || isFn(O.qr?.toSVG) || isFn(O.qr?.svg));
const __netList = v => (v == null || v === '' ? SHARE_DEFAULT : isStr(v) ? v.split(/[\s,]+/).filter(Boolean) : toArr(v)).filter(n => __net[n] && (!__net[n].available || __net[n].available()));
function __shareData(o = {}) {
  const desc = isBrowser ? doc.querySelector('meta[name="description"]')?.content : '';
  const url0 = o.url || (isBrowser ? location.href : '');
  let url = url0;
  try { url = new URL(url0, isBrowser ? location.href : undefined).href; } catch {}
  return { title: o.title ?? (isBrowser ? doc.title : ''), text: o.text ?? desc ?? '', url, files: o.files };
}
async function __qr(box, text) {
  try {
    if (customElements.get('o-qr')) { const q = doc.createElement('o-qr'); q.setAttribute('value', text); q.setAttribute('size', '176'); box.replaceChildren(q); return true; }
    let r = isFn(O.qr?.toSVG) ? O.qr.toSVG(text, { size: 176 }) : isFn(O.qr?.svg) ? O.qr.svg(text, { size: 176 }) : isFn(O.qr) ? O.qr(text, { size: 176 }) : null;
    if (r && isFn(r.then)) r = await r;
    if (r instanceof Node) box.replaceChildren(r);
    else if (isStr(r) && /<svg/i.test(r)) box.innerHTML = r;
    else if (r && isStr(r.svg)) box.innerHTML = r.svg;
    else return false;
    return true;
  } catch (e) { console.warn('[Orion] share: QR rendering failed', e); return false; }
}
async function __copyLink(url) {
  if (isFn(O.clipboard?.copy)) return O.clipboard.copy(url);
  try { await navigator.clipboard.writeText(url); return true; } catch {}
  const ta = h('textarea', { style: 'position:fixed;left:-9999px;opacity:0' }); ta.value = url; doc.body.append(ta); ta.select();
  let ok = false; try { ok = doc.execCommand('copy'); } catch {} ta.remove();
  return ok;
}
/** open a network (returns true when handled) */
function __openNet(name, d) {
  const n = __net[name];
  if (!n?.url) return false;
  const href = n.url(d);
  if (n.self) { const a = h('a', { href, rel: 'noopener', style: 'display:none' }); doc.body.append(a); a.click(); a.remove(); }
  else win.open(href, '_blank', 'noopener,noreferrer,width=640,height=560');
  return true;
}

/* ── sheet / popover ───────────────────────────────────────────────── */
let __sheet = null;
function __openSheet(d, o) {
  __sheet?.close('api');
  return new Promise(resolve => {
    let result = { shared: false, method: 'sheet', cancelled: true };
    const nets = __netList(o.networks).filter(n => n !== 'native' || !o.nativeTried);
    const id = uid('share'), anchor = o.anchor ? $(o.anchor) : null;
    const small = isBrowser && win.innerWidth < 576, sheet = !anchor || small;
    const tiles = nets.filter(n => n !== 'copy');
    const panel = h('div', { class: cls('o-share-panel o-floating', sheet ? 'is-sheet' : 'is-popover'), role: 'dialog', 'aria-modal': sheet ? 'true' : 'false', 'aria-labelledby': id + '-t' });
    panel.innerHTML = String(html`<div class="o-share-head"><h2 class="o-share-title" id="${id}-t">${o.heading || t('share.title')}</h2><button type="button" class="o-btn-close o-share-x" aria-label="${t('common.close')}"></button></div>
      ${d.title ? html`<div class="o-share-preview"><div class="o-share-ptitle">${d.title}</div><div class="o-share-purl">${d.url}</div></div>` : ''}
      ${tiles.length ? html`<div class="o-share-grid" role="group" aria-label="${t('share.title')}">${tiles.map(n => html`<button type="button" class="o-share-net" data-net="${n}" aria-label="${n === 'qr' || n === 'native' ? __label(n) : t('share.shareOn', { network: __label(n) })}"><span class="o-share-ic">${__glyph(n)}</span><span class="o-share-name">${__label(n)}</span></button>`)}</div>` : ''}
      <div class="o-share-qr" hidden><div class="o-share-qrbox"></div><p class="o-share-qrhint">${t('share.qrHint')}</p></div>
      ${nets.includes('copy') ? html`<div class="o-share-link"><label class="o-sr-only" for="${id}-u">${t('share.link')}</label><div class="o-input-group"><input class="o-input o-input-sm" id="${id}-u" readonly value="${d.url}"><button type="button" class="o-btn o-btn-sm o-btn-primary o-share-copy">${icon('copy')}<span>${t('share.copyLink')}</span></button></div></div>` : ''}`);
    const layer = sheet ? h('div', { class: 'o-share-layer' }, h('div', { class: 'o-backdrop' }), panel) : panel;
    portal(layer, anchor || doc.body);
    const nav = new ListNav(panel, { items: '.o-share-net', orientation: 'grid', typeahead: false, columns: () => { const g = panel.querySelector('.o-share-grid'), f = g?.firstElementChild; return f ? Math.max(1, Math.round(g.clientWidth / f.offsetWidth)) : 1; } });
    const done = r => { result = r; bus.emit('share', { ...r, url: d.url }); };
    on(panel, 'keydown', e => { if (e.target.classList.contains('o-share-net')) nav.handle(e); });
    on(panel, 'click', '.o-share-x', () => handle.close('api'));
    on(layer, 'click', '.o-backdrop', () => handle.close('outside'));
    on(panel, 'click', '.o-share-link input', e => e.target.select());
    on(panel, 'click', '.o-share-copy', async (e, b) => {
      const ok = await __copyLink(d.url);
      if (isFn(O.clipboard?.feedback)) O.clipboard.feedback(b, ok, ok ? t('share.copied') : undefined); else announce(t('share.copied'));
      done({ shared: ok, method: 'copy' });
    });
    on(panel, 'click', '.o-share-net', async (e, b) => {
      const n = b.dataset.net;
      if (n === 'qr') {
        const box = panel.querySelector('.o-share-qr'), show = box.hidden;
        box.hidden = !show; b.setAttribute('aria-pressed', String(show));
        if (show && !box.__done) { box.__done = await __qr(box.querySelector('.o-share-qrbox'), d.url); if (!box.__done) box.querySelector('.o-share-qrhint').textContent = t('share.qrUnavailable'); }
        if (show) done({ shared: true, method: 'qr' });
        return;
      }
      if (n === 'native') { handle.close('api'); try { await navigator.share({ title: d.title, text: d.text, url: d.url }); done({ shared: true, method: 'native' }); } catch (err) { done({ shared: false, method: 'native', cancelled: err?.name === 'AbortError' }); } resolve(result); return; }
      if (isFn(__net[n].action)) __net[n].action(d); else __openNet(n, d);
      announce(t('share.shared', { network: __label(n) }));
      done({ shared: true, method: 'network', network: n });
      handle.close('api');
    });
    const unplace = sheet ? noop : autoPlace(panel, anchor, { placement: 'bottom-start', offset: 6, flip: true });
    const handle = overlays.open({
      el: layer, owner: anchor, modal: sheet, trap: sheet, lockScroll: sheet,
      onClose: () => { unplace(); layer.remove(); if (__sheet === handle) __sheet = null; resolve(result); },
    });
    __sheet = handle;
    animate(panel, sheet && small ? 'slideInBottom' : 'zoomIn', { duration: 180 });
    (panel.querySelector('.o-share-net') || panel.querySelector('.o-share-copy'))?.focus();
    if (panel.querySelector('.o-share-net')) nav.set(0);
  });
}

async function share(o = {}) {
  const d = __shareData(o);
  const nat = o.native ?? true;
  const useNative = isBrowser && !!navigator.share && nat !== false && nat !== 'never' && (nat !== 'mobile' || O.device?.touch || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));
  if (useNative && (!d.files?.length || navigator.canShare?.({ files: d.files }))) {
    try {
      await navigator.share({ title: d.title, text: d.text, url: d.url, ...(d.files?.length ? { files: d.files } : {}) });
      const r = { shared: true, method: 'native' }; bus.emit('share', { ...r, url: d.url }); return r;
    } catch (e) { if (e?.name === 'AbortError') return { shared: false, method: 'native', cancelled: true }; }
  }
  return __openSheet(d, { ...o, nativeTried: useNative });
}
share.close = () => __sheet?.close('api');
share.link = (network, o = {}) => __net[network]?.url?.(__shareData(o)) || null;
share.networks = {
  add(name, def) { __net[name] = def; return share.networks; },
  get: name => __net[name] || null,
  list: () => Object.keys(__net),
  defaults: SHARE_DEFAULT,
};
share.glyph = n => __glyph(n);

action('share', trigger => {
  const A = n => trigger.getAttribute('data-o-' + n) ?? undefined;
  share({ url: A('url'), title: A('title'), text: A('text'), networks: A('networks'), native: A('native') === 'false' || A('native') === 'never' ? false : A('native') || true, anchor: trigger });
});

class OShare extends OElement {
  static props = { url: String, title: String, text: String, networks: { type: Any, default: null }, variant: { type: String, default: 'button', reflect: true }, native: { type: String, default: 'auto' }, label: String, size: String };
  setup() {
    this.classList.add('o-share');
    on(this, 'click', '.o-share-btn', (e, b) => this.share(b));
    on(this, 'click', '.o-share-net', async (e, b) => {
      const n = b.dataset.net, d = this.data();
      if (n === 'copy') { const ok = await __copyLink(d.url); O.clipboard?.feedback ? O.clipboard.feedback(b, ok, t('share.copied')) : announce(t('share.copied')); this.emit('share', { method: 'copy', shared: ok }); return; }
      if (n === 'native' || n === 'qr') { const r = await share({ ...d, networks: n === 'qr' ? ['qr', 'copy'] : undefined, native: n === 'native', anchor: b }); this.emit('share', r); return; }
      __openNet(n, d);
      announce(t('share.shared', { network: __label(n) }));
      this.emit('share', { method: 'network', network: n, shared: true });
    });
  }
  data() { return __shareData({ url: this.url, title: this.title || undefined, text: this.text || undefined }); }
  get nativeOpt() { const n = this.native; return n === 'never' || n === 'false' ? false : n === 'mobile' ? 'mobile' : true; }
  async share(anchor) {
    if (!this.emit('before-share', this.data())) return null;
    const r = await share({ ...this.data(), networks: this.networks, native: this.nativeOpt, anchor: anchor || this.$('.o-share-btn') || this });
    this.emit('share', r);
    return r;
  }
  render() {
    const sz = this.size === 'sm' ? ' o-btn-sm' : this.size === 'lg' ? ' o-btn-lg' : '';
    if (this.variant === 'icons') {
      const nets = __netList(this.networks).filter(n => n !== 'native' || this.nativeOpt !== false);
      this.setAttribute('role', 'group');
      this.setAttribute('aria-label', this.label || t('share.share'));
      this.innerHTML = nets.map(n => String(html`<button type="button" class="o-share-net o-share-icon${sz}" data-net="${n}" aria-label="${n === 'copy' || n === 'qr' || n === 'native' ? __label(n) : t('share.shareOn', { network: __label(n) })}" title="${__label(n)}"><span class="o-share-ic">${__glyph(n)}</span></button>`)).join('');
    } else {
      this.removeAttribute('role'); this.removeAttribute('aria-label');
      this.innerHTML = String(html`<button type="button" class="o-btn o-share-btn${sz}" aria-haspopup="dialog">${__glyph('native')}<span>${this.label || t('share.share')}</span></button>`);
    }
  }
}
define('o-share', OShare);
O.share = share;
O.Share = OShare;
