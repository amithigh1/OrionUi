/* <o-lang-switch variant="select|menu|flags"> — languages from Orion.i18n.locales().
 *   <o-lang-switch></o-lang-switch>
 *   <o-lang-switch variant="flags"></o-lang-switch>
 * Switching calls Orion.i18n.set(code) (updates <html lang>/[dir] and re-renders every component).
 */
i18n.add('en', { lang: { switch: 'Language' } });

const FLAGS = {
  en: '🇺🇸', ar: '🇸🇦', de: '🇩🇪', es: '🇪🇸', fr: '🇫🇷', hi: '🇮🇳', id: '🇮🇩', ja: '🇯🇵', ko: '🇰🇷', ms: '🇲🇾',
  pt: '🇵🇹', zh: '🇨🇳', ru: '🇷🇺', it: '🇮🇹', nl: '🇳🇱', tr: '🇹🇷', vi: '🇻🇳', th: '🇹🇭', bn: '🇧🇩', ur: '🇵🇰',
  fa: '🇮🇷', he: '🇮🇱', pl: '🇵🇱', uk: '🇺🇦', sv: '🇸🇪', nb: '🇳🇴', da: '🇩🇰', fi: '🇫🇮', cs: '🇨🇿', el: '🇬🇷', ro: '🇷🇴', hu: '🇭🇺',
};
const flagOf = code => FLAGS[String(code).split('-')[0].toLowerCase()] || '🏳️';

class OLangSwitch extends OElement {
  static props = { variant: { type: String, default: 'select', reflect: true }, texts: Object };
  setup() { this.classList.add('o-lang-switch'); }
  connected() { this.addCleanup(bus.on('locale', () => this._paint())); this.addCleanup(bus.on('i18n:update', () => this._build())); }
  disconnected() { this._ov?.close('api'); }
  update(changed) { if (changed.has('variant') || changed.has('init') || changed.has('locale')) this._build(); else this._paint(); }
  _build() {
    this.replaceChildren();
    const v = this.variant;
    this.append(v === 'menu' ? this._menu() : v === 'flags' ? this._flags() : this._select());
    this._paint();
  }
  _select() {
    this._sel = h('select', { class: 'o-select o-input-sm o-lang-switch-select', 'aria-label': this.t('lang.switch') },
      i18n.locales().map(l => h('option', { value: l.code }, `${flagOf(l.code)}  ${l.name}`)));
    on(this._sel, 'change', () => i18n.set(this._sel.value));
    return this._sel;
  }
  _flags() {
    const row = h('div', { class: 'o-lang-switch-flags', role: 'radiogroup', 'aria-label': this.t('lang.switch') });
    this._flagBtns = new Map();
    i18n.locales().forEach(l => {
      const btn = h('button', { type: 'button', class: 'o-lang-switch-flag', title: l.name, 'aria-pressed': 'false', 'aria-label': l.name },
        h('span', { 'aria-hidden': 'true' }, flagOf(l.code)));
      on(btn, 'click', () => i18n.set(l.code));
      this._flagBtns.set(l.code, btn);
      row.append(btn);
    });
    return row;
  }
  _menu() {
    this._btn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-lang-switch-btn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' },
      h('span', { class: 'o-lang-switch-flag-current', 'aria-hidden': 'true' }), h('span', { class: 'o-lang-switch-current' }),
      iconEl('chevron-down', { class: 'o-navbar-caret' }));
    on(this._btn, 'click', () => this._toggleMenu());
    on(this._btn, 'keydown', e => { if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && !this._ov) { e.preventDefault(); this._toggleMenu(); } });
    return this._btn;
  }
  _toggleMenu() {
    if (this._ov) { this._ov.close('toggle'); return; }
    const locs = i18n.locales(), current = i18n.locale;
    const list = h('div', { class: 'o-lang-switch-menu o-floating', role: 'listbox', id: uid('lang'), 'aria-label': this.t('lang.switch') },
      locs.map(l => h('button', { type: 'button', class: 'o-lang-switch-item', role: 'option', 'data-code': l.code, 'aria-selected': String(l.code === current) },
        h('span', { 'aria-hidden': 'true' }, flagOf(l.code)), h('span', null, l.name))));
    portal(list, this._btn);
    this._btn.setAttribute('aria-controls', list.id);
    this._btn.setAttribute('aria-expanded', 'true');
    const unplace = autoPlace(list, this._btn, { placement: 'bottom-start', offset: 4, matchWidth: 'min' });
    const select = code => { i18n.set(code); this._ov?.close('select'); };
    const nav = new ListNav(list, { items: '[role=option]', onSelect: el => select(el.dataset.code) });
    on(list, 'keydown', e => { if (nav.handle(e)) return; if (e.key === 'Escape') { e.preventDefault(); this._ov.close('escape'); } });
    on(list, 'click', '.o-lang-switch-item', (e, el) => select(el.dataset.code));
    this._ov = overlays.open({
      el: list, owner: this._btn, trap: false,
      onClose: reason => { unplace(); list.remove(); this._btn.setAttribute('aria-expanded', 'false'); this._ov = null; if (reason === 'escape') this._btn.focus(); },
    });
    animate(list, 'zoomIn', { duration: 120 });
    nav.setItem(list.querySelector('[aria-selected="true"]') || list.firstElementChild);
  }
  _paint() {
    const code = i18n.locale;
    if (this._sel) this._sel.value = code;
    if (this._flagBtns) this._flagBtns.forEach((btn, c) => { const on_ = c === code; btn.classList.toggle('is-active', on_); btn.setAttribute('aria-pressed', String(on_)); });
    if (this._btn) {
      const cur = i18n.locales().find(l => l.code === code);
      this._btn.querySelector('.o-lang-switch-flag-current').textContent = flagOf(code);
      this._btn.querySelector('.o-lang-switch-current').textContent = cur ? cur.name : code;
    }
  }
}
define('o-lang-switch', OLangSwitch);
O.LangSwitch = OLangSwitch;
