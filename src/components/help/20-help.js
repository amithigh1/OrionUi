/* <o-help text="Totals exclude tax." placement="top" article="billing"> — an inline "?" popover.
 * Uses Orion.popover when the `overlays` package is present, otherwise a minimal floating panel built
 * directly on core place()/portal()/overlays.
 */
class OHelp extends OElement {
  static props = { text: String, placement: { type: String, default: 'top' }, article: String, label: String };
  setup() {
    this.classList.add('o-help-inline');
    this.btn = h('button', { type: 'button', class: 'o-help-btn' }, raw(String(icon('help-circle', { size: 16 }))));
    this.append(this.btn);
    on(this.btn, 'click', () => this.toggle());
  }
  disconnected() { this._pop?.close?.(); this._pop = null; }
  update() { this.btn.setAttribute('aria-label', this.label || this.text || t('help.title')); }
  toggle() { this._pop ? this.close() : this.open(); }
  close() { this._pop?.close?.(); this._pop = null; }
  open() {
    if (this._pop) return;
    const article = this.article && O.help ? O.help.get(this.article) : null;
    const content = h('div', { class: 'o-help-inline-content' },
      h('p', null, this.text || ''),
      article ? h('a', { href: '#', class: 'o-help-more', 'data-help-open': '' }, t('help.title') + ' →') : null);
    if (article) on(content, 'click', '[data-help-open]', e => { e.preventDefault(); this.close(); O.help.open(this.article); });
    if (O.popover) { this._pop = O.popover(this.btn, { content, trigger: 'manual', placement: this.placement, closeButton: true, onClose: () => { this._pop = null; } }); this._pop.open(); }
    else this._pop = this._miniPanel(content);
  }
  _miniPanel(content) {
    const panel = h('div', { class: 'o-floating o-help-inline-panel', role: 'dialog', tabindex: '-1' }, content);
    portal(panel, this.btn);
    panel.hidden = false;
    const unplace = autoPlace(panel, this.btn, { placement: this.placement, offset: 8, flip: true });
    const ov = overlays.open({ el: panel, owner: this.btn, trap: false, onClose: () => { unplace(); panel.remove(); this._pop = null; } });
    animate(panel, 'zoomIn', { duration: 120 });
    focusFirst(panel);
    return { close: () => ov.close('api') };
  }
}
define('o-help', OHelp);
O.Help = OHelp;
