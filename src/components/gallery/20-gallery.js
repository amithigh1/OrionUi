/* <o-gallery> — responsive image / video gallery that opens Orion.lightbox.
 *   <o-gallery layout="grid|masonry|justified" columns="3" gap="8" aspect="4/3" row-height="220" captions="hover|below|none">
 *     <a href="full.jpg" data-caption="…"><img src="thumb.jpg" alt="…" width="1600" height="1067"></a>   (or <img>, <figure>)
 *   </o-gallery>
 *   or  gallery.items = [{ src, thumb, title, caption, alt, width, height, type: 'image'|'video', poster }]
 * Props: layout, columns (auto from min-width when empty), minWidth (200), gap, aspect (grid tiles), rowHeight (justified),
 *        lightbox (true), lightboxOptions {}, captions, items, label
 * Methods: open(index), relayout(), getItems()     Events: o-open { index, item } (cancelable)
 * Children are never moved; width/height attributes (or data-width/data-height) avoid layout shifts in masonry/justified.
 */
class OGallery extends OElement {
  static props = {
    layout: { type: String, default: 'grid', reflect: true }, columns: Number, minWidth: { type: Number, default: 200 },
    gap: { type: Any, default: 8 }, aspect: { type: String, default: '1' }, rowHeight: { type: Number, default: 220 },
    lightbox: { type: Boolean, default: true }, lightboxOptions: { type: Object, default: () => ({}) },
    captions: { type: String, default: 'hover' }, items: { type: Array, default: () => [] }, label: String,
  };
  get tiles() { return [...this.children].filter(c => c.nodeType === 1 && !c.hasAttribute('data-o-ui') && !/^(template|script|style)$/.test(c.localName)); }

  setup() {
    this.classList.add('o-gallery');
    if (!this.hasAttribute('role')) this.setAttribute('role', 'group');
    this._schedule = rafThrottle(() => this._layout());
    on(this, 'click', e => this._click(e));
    on(this, 'keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.parentElement === this && e.target.getAttribute('role') === 'button') { e.preventDefault(); this._open(e.target); }
    });
    on(this, 'load', e => { if (e.target.localName === 'img') this._schedule(); }, true);
  }
  connected() {
    const mo = new MutationObserver(() => this._schedule());
    mo.observe(this, { childList: true });
    this.addCleanup(() => mo.disconnect());
    this.addCleanup(observeResize(this, () => this._schedule()));
  }
  update(changed) {
    if (changed.has('items')) this._render();
    if (this.label) this.setAttribute('aria-label', this.label); else if (!this.hasAttribute('aria-label')) this.setAttribute('aria-label', t('gallery.gallery'));
    this._schedule();
  }

  /** Items as the lightbox sees them. */
  getItems() { return this.items?.length ? this.items.map(galItem) : this.tiles.map(galFromEl); }
  /** Open the lightbox at index (fires cancelable o-open). */
  open(i = 0) { return this._open(this.tiles[i]); }
  relayout() { this._layout(); }

  _render() {
    this.querySelectorAll(':scope > [data-o-gi]').forEach(el => el.remove());
    const list = (this.items || []).map(galItem);
    this.append(...list.map((it, i) => {
      const ar = it.width && it.height ? it.width / it.height : null;
      return h('a', { class: 'o-gallery-item', href: it.src, 'data-o-gi': i, style: ar ? `--o-ar:${round(ar, 4)}` : null, 'data-caption': it.caption || null, 'data-title': it.title || null, 'data-type': it.type, 'data-width': it.width || null, 'data-height': it.height || null, 'data-poster': it.poster || null },
        h('img', { src: it.thumb || it.poster || it.src, alt: it.alt || it.title || '', loading: 'lazy', decoding: 'async', width: it.width || null, height: it.height || null, draggable: 'false' }),
        it.type === 'video' ? h('span', { class: 'o-gallery-badge', 'aria-hidden': 'true' }, icon('play')) : null,
        it.title || it.caption ? h('span', { class: 'o-gallery-cap' }, it.title ? h('strong', {}, it.title) : null, it.caption ? h('span', {}, it.caption) : null) : null);
    }));
  }
  _ar(tile) {
    const img = tile.localName === 'img' ? tile : tile.querySelector('img, video');
    const d = tile.dataset, w = +d.width || +(img && img.getAttribute('width')), hh = +d.height || +(img && img.getAttribute('height'));
    if (w && hh) return w / hh;
    if (img && img.naturalWidth) return img.naturalWidth / img.naturalHeight;
    if (img && img.videoWidth) return img.videoWidth / img.videoHeight;
    return 0;
  }
  _layout() {
    if (!this.isConnected) return;
    const tiles = this.tiles, L = this.layout;
    this.classList.remove('o-gallery-cap-hover', 'o-gallery-cap-below', 'o-gallery-cap-none');
    this.classList.add('o-gallery-cap-' + (['below', 'none'].includes(this.captions) ? this.captions : 'hover'));
    this.style.setProperty('--o-gallery-gap', carLenG(this.gap));
    this.style.setProperty('--o-gallery-aspect', String(this.aspect || '1').replace(':', '/'));
    this.style.setProperty('--o-gallery-row-h', (this.rowHeight || 220) + 'px');
    this.style.setProperty('--o-gallery-min', (this.minWidth || 200) + 'px');
    if (this.columns) this.style.setProperty('--o-gallery-cols', this.columns); else this.style.removeProperty('--o-gallery-cols');
    this.classList.toggle('has-cols', !!this.columns);
    tiles.forEach(tile => {
      const ar = this._ar(tile);
      if (ar) tile.style.setProperty('--o-ar', round(ar, 4));
      if (!/^(a|button)$/.test(tile.localName) && !tile.querySelector('a, button') && this.lightbox) {
        if (!tile.hasAttribute('tabindex')) tile.tabIndex = 0;
        if (!tile.hasAttribute('role')) tile.setAttribute('role', 'button');
      }
    });
    if (L === 'masonry') this._masonry(tiles);
    else if (this._wasMasonry) {
      this._wasMasonry = false;
      this.style.height = '';
      tiles.forEach(tile => { tile.style.position = tile.style.width = tile.style.top = tile.style.insetInlineStart = ''; });
    }
  }
  _masonry(tiles) {
    this._wasMasonry = true;
    const W = this.clientWidth, gap = parseFloat(getComputedStyle(this).columnGap) || 0;
    const cols = this.columns || Math.max(1, Math.floor((W + gap) / ((this.minWidth || 200) + gap)));
    const cw = (W - gap * (cols - 1)) / cols, hs = new Array(cols).fill(0);
    tiles.forEach(tile => { tile.style.position = 'absolute'; tile.style.width = cw + 'px'; if (!this._ar(tile)) tile.style.setProperty('--o-ar', 1); });
    const heights = tiles.map(tile => tile.offsetHeight);
    tiles.forEach((tile, i) => {
      const c = hs.indexOf(Math.min(...hs));
      tile.style.insetInlineStart = c * (cw + gap) + 'px';
      tile.style.top = hs[c] + 'px';
      hs[c] += heights[i] + gap;
    });
    this.style.height = Math.max(0, Math.max(...hs) - gap) + 'px';
  }
  _click(e) {
    if (!this.lightbox || e.defaultPrevented || e.button > 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const tile = this.tiles.find(x => x.contains(e.target));
    if (!tile || e.target.closest('[data-o-no-preview]')) return;
    const inner = e.target.closest('a, button');
    if (inner && inner !== tile && tile.contains(inner) && !inner.querySelector('img')) return;
    e.preventDefault();
    this._open(tile);
  }
  _open(tile) {
    if (!tile) return null;
    const items = this.getItems(), i = this.tiles.indexOf(tile);
    if (!this.emit('open', { index: i, item: items[i] })) return null;
    return lightbox(items, { label: this.label, ...this.lightboxOptions, index: i, origin: tile.localName === 'img' ? tile : tile.querySelector('img') || tile });
  }
}
const carLenG = v => (v == null || v === '' ? '0px' : isNum(v) || /^-?\d*\.?\d+$/.test(String(v)) ? parseFloat(v) + 'px' : String(v));
define('o-gallery', OGallery);
O.Gallery = OGallery;
