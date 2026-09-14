/* <o-theme-switch variant="icon|segmented|select|toggle" show-contrast show-font-size>
 * A small control bound to Orion.theme (light/dark/auto, optional high-contrast and font-size steppers).
 *   <o-theme-switch></o-theme-switch>
 *   <o-theme-switch variant="segmented" show-contrast show-font-size></o-theme-switch>
 * Props: variant, showContrast (attr show-contrast), showFontSize (attr show-font-size), texts.
 */
i18n.add('en', {
  theme: {
    switch: 'Theme', light: 'Light', dark: 'Dark', auto: 'Auto', contrast: 'High contrast',
    fontSize: 'Text size', decrease: 'Decrease text size', increase: 'Increase text size', resetSize: 'Reset text size',
  },
});

const MODE_ICON = { light: 'sun', dark: 'moon', auto: 'monitor' };

class OThemeSwitch extends OElement {
  static props = {
    variant: { type: String, default: 'icon', reflect: true },
    showContrast: { type: Boolean, attr: 'show-contrast' },
    showFontSize: { type: Boolean, attr: 'show-font-size' },
    texts: Object,
  };
  setup() { this.classList.add('o-theme-switch'); }
  connected() { this.addCleanup(theme.onChange(() => this._paint())); }
  update(changed) {
    if (changed.has('variant') || changed.has('showContrast') || changed.has('showFontSize') || changed.has('init') || changed.has('locale')) this._build();
    else this._paint();
  }
  _build() {
    this._group = uid('theme');
    const v = this.variant;
    const main = v === 'segmented' ? this._segmented() : v === 'select' ? this._select() : v === 'toggle' ? this._toggle() : this._icon();
    const parts = [main];
    if (this.showContrast) parts.push(this._contrastToggle());
    if (this.showFontSize) parts.push(this._fontStepper());
    this.replaceChildren(...parts);
    this._paint();
  }
  _icon() {
    this._btn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-theme-switch-btn' });
    on(this._btn, 'click', () => theme.cycle());
    return this._btn;
  }
  _segmented() {
    this._radios = new Map();
    const row = h('div', { class: 'o-segmented o-theme-switch-segmented', role: 'radiogroup', 'aria-label': this.t('theme.switch') });
    for (const m of ['light', 'dark', 'auto']) {
      const input = h('input', { type: 'radio', name: this._group, value: m });
      on(input, 'change', () => { if (input.checked) theme.setMode(m); });
      this._radios.set(m, input);
      row.append(h('label', null, input, h('span', null, iconEl(MODE_ICON[m], { size: 14 }), h('span', { class: 'o-theme-switch-text' }, this.t('theme.' + m)))));
    }
    return row;
  }
  _select() {
    this._sel = h('select', { class: 'o-select o-input-sm o-theme-switch-select', 'aria-label': this.t('theme.switch') },
      ['light', 'dark', 'auto'].map(m => h('option', { value: m }, this.t('theme.' + m))));
    on(this._sel, 'change', () => theme.setMode(this._sel.value));
    return this._sel;
  }
  _toggle() {
    this._chk = h('input', { type: 'checkbox' });
    on(this._chk, 'change', () => theme.setMode(this._chk.checked ? 'dark' : 'light'));
    return h('label', { class: 'o-switch o-theme-switch-toggle' }, this._chk, h('span', null, this.t('theme.dark')));
  }
  _contrastToggle() {
    this._contrast = h('input', { type: 'checkbox' });
    on(this._contrast, 'change', () => theme.setContrast(this._contrast.checked));
    return h('label', { class: 'o-switch o-theme-switch-extra' }, this._contrast, h('span', null, this.t('theme.contrast')));
  }
  _fontStepper() {
    const dec = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': this.t('theme.decrease') }, iconEl('minus', { size: 14 }));
    const inc = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': this.t('theme.increase') }, iconEl('plus', { size: 14 }));
    this._fontLabel = h('span', { class: 'o-theme-switch-font-value' });
    on(dec, 'click', () => theme.setFontScale(theme.fontScale - .0625));
    on(inc, 'click', () => theme.setFontScale(theme.fontScale + .0625));
    on(this._fontLabel, 'dblclick', () => theme.setFontScale(1));
    return h('div', { class: 'o-theme-switch-font', role: 'group', 'aria-label': this.t('theme.fontSize'), title: this.t('theme.resetSize') }, dec, this._fontLabel, inc);
  }
  _paint() {
    const mode = theme.mode, resolved = theme.resolved;
    if (this._btn) { this._btn.innerHTML = String(icon(MODE_ICON[mode] || 'monitor')); this._btn.setAttribute('aria-label', `${this.t('theme.switch')}: ${this.t('theme.' + mode)}`); }
    if (this._radios) this._radios.forEach((input, m) => { input.checked = mode === m; });
    if (this._sel) this._sel.value = mode;
    if (this._chk) this._chk.checked = resolved === 'dark';
    if (this._contrast) this._contrast.checked = theme.highContrast;
    if (this._fontLabel) this._fontLabel.textContent = Math.round(theme.fontScale * 100) + '%';
  }
}
define('o-theme-switch', OThemeSwitch);
O.ThemeSwitch = OThemeSwitch;
