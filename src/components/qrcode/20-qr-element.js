/* ============================================================================
 * <o-qrcode value size ecc color background margin module-style finder-style logo label download>
 * ========================================================================== */
i18n.add('en', { qrcode: { alt: 'QR code', download: 'Download' } });

class OQRCode extends OElement {
  static props = {
    value: { type: String, default: '' },
    size: { type: Number, default: 200 },
    ecc: { type: String, default: 'M', reflect: true },
    color: { type: String, default: '#000000' },
    background: { type: String, default: '#ffffff' },
    margin: { type: Number, default: 2 },
    moduleStyle: { type: String, default: 'square', reflect: true },
    finderStyle: { type: String, default: 'square' },
    logo: { type: Object, default: () => null },
    label: { type: String, default: '' },
    download: { type: String, default: null },
  };
  setup() {
    this.classList.add('o-qrcode');
    this.figure = h('div', { class: 'o-qrcode-box' });
    this.labelEl = h('div', { class: 'o-qrcode-label' });
    this.actions = h('div', { class: 'o-qrcode-actions' });
    append(this, [this.figure, this.labelEl, this.actions]);
  }
  update() {
    if (!this.value) {
      this.figure.innerHTML = '';
      this.labelEl.textContent = '';
      this.actions.innerHTML = '';
      this.toggleAttribute('data-empty', true);
      return;
    }
    this.toggleAttribute('data-empty', false);
    let svgStr;
    try {
      svgStr = O.qr.svg(this.value, {
        size: this.size, margin: this.margin, color: this.color, background: this.background,
        moduleStyle: this.moduleStyle, finderStyle: this.finderStyle, ecc: this.ecc, logo: this.logo || undefined,
      });
    } catch (e) {
      this.figure.innerHTML = `<div class="o-qrcode-error" role="alert">${esc(e.message)}</div>`;
      this.labelEl.textContent = ''; this.actions.innerHTML = '';
      this.emit('error', { error: e });
      return;
    }
    this.figure.innerHTML = svgStr;
    const svg = this.figure.querySelector('svg');
    if (svg) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', this.label || this.t('qrcode.alt')); }
    this.labelEl.textContent = this.label || '';
    this.labelEl.hidden = !this.label;
    if (this.download !== null) {
      this.actions.innerHTML = '';
      const btn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', 'aria-label': this.t('qrcode.download') });
      btn.append(iconEl ? iconEl('download') : '', h('span', {}, this.t('qrcode.download')));
      on(btn, 'click', () => this.saveAsPNG());
      this.actions.append(btn);
    } else this.actions.innerHTML = '';
  }
  /** Render at 2x size and trigger a PNG download. */
  async saveAsPNG() {
    if (!this.value) return;
    const name = this.download || 'qrcode.png';
    try {
      const blob = await O.qr.toBlob(this.value, {
        size: this.size * 2, margin: this.margin, color: this.color, background: this.background,
        moduleStyle: this.moduleStyle, finderStyle: this.finderStyle, ecc: this.ecc, logo: this.logo || undefined,
      });
      download(blob, name, 'image/png');
    } catch (e) { console.error('[Orion] <o-qrcode> download failed:', e); }
  }
}
define('o-qrcode', OQRCode);
O.QRCode = OQRCode;
