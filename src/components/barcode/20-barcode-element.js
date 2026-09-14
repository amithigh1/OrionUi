/* ============================================================================
 * <o-barcode value format height show-text font-size color background margin
 *            module-width guard-bars download>
 * ========================================================================== */
i18n.add('en', { barcode: { download: 'Download' } });

class OBarcode extends OElement {
  static props = {
    value: { type: String, default: '' },
    format: { type: String, default: 'code128', reflect: true },
    height: { type: Number, default: 80 },
    moduleWidth: { type: Number, default: 2 },
    margin: { type: Number, default: 10 },
    showText: { type: Boolean, default: true },
    fontSize: { type: Number, default: 14 },
    color: { type: String, default: '#000000' },
    background: { type: String, default: '#ffffff' },
    guardBars: { type: Boolean, default: true },
    download: { type: String, default: null },
  };
  setup() {
    this.classList.add('o-barcode');
    this.figure = h('div', { class: 'o-barcode-box' });
    this.actions = h('div', { class: 'o-barcode-actions' });
    append(this, [this.figure, this.actions]);
  }
  update() {
    if (!this.value) {
      this.figure.innerHTML = ''; this.actions.innerHTML = '';
      this.toggleAttribute('data-empty', true);
      return;
    }
    this.toggleAttribute('data-empty', false);
    let svgStr;
    try {
      svgStr = O.barcode.svg(this.value, {
        format: this.format, height: this.height, moduleWidth: this.moduleWidth, margin: this.margin,
        showText: this.showText, fontSize: this.fontSize, color: this.color, background: this.background, guardBars: this.guardBars,
      });
    } catch (e) {
      this.figure.innerHTML = `<div class="o-barcode-error" role="alert">${esc(e.message)}</div>`;
      this.actions.innerHTML = '';
      this.emit('error', { error: e });
      return;
    }
    this.figure.innerHTML = svgStr;
    if (this.download !== null) {
      this.actions.innerHTML = '';
      const btn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', 'aria-label': this.t('barcode.download') });
      btn.append(iconEl('download'), h('span', {}, this.t('barcode.download')));
      on(btn, 'click', () => this.saveAsPNG());
      this.actions.append(btn);
    } else this.actions.innerHTML = '';
  }
  async saveAsPNG() {
    if (!this.value) return;
    const name = this.download || 'barcode.png';
    try {
      const blob = await O.barcode.toBlob(this.value, {
        format: this.format, height: this.height * 2, moduleWidth: this.moduleWidth * 2, margin: this.margin * 2,
        showText: this.showText, fontSize: this.fontSize * 2, color: this.color, background: this.background, guardBars: this.guardBars,
      });
      download(blob, name, 'image/png');
    } catch (e) { console.error('[Orion] <o-barcode> download failed:', e); }
  }
}
define('o-barcode', OBarcode);
O.Barcode = OBarcode;
