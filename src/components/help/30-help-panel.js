/* <o-help-panel placement="end" width> — contextual help drawer over the article registry
 * (Orion.help.register). One instance is enough for a whole app; Orion.help.open(key) creates it lazily.
 * Responsive: a side panel on desktop, a full-height sheet on narrow screens. Built directly on core
 * portal()/overlays/animate (no dependency on the `overlays` package's <o-drawer>).
 *   Props: placement(start|end,=end) width texts
 *   Methods: open(key?) close() toggle(key?) navigate(key,{push}) back() forward() search(q)
 *   Events: o-open, o-close {reason}, o-navigate {key}
 */
class OHelpPanel extends OElement {
  static props = { placement: { type: String, default: 'end' }, width: String, isOpen: { type: Boolean, attr: 'open', reflect: true, default: false }, texts: Object };
  setup() {
    this.classList.add('o-help-panel-host');
    this._history = []; this._hindex = -1;
    this.backdrop = h('div', { class: 'o-help-backdrop', hidden: true });
    this.backBtn = h('button', { type: 'button', class: 'o-btn-close o-btn-close-sm o-help-nav-btn', disabled: true }, raw(String(icon('chevron-left', { size: 16 }))));
    this.fwdBtn = h('button', { type: 'button', class: 'o-btn-close o-btn-close-sm o-help-nav-btn', disabled: true }, raw(String(icon('chevron-right', { size: 16 }))));
    this.searchInput = h('input', { type: 'search', class: 'o-input o-input-sm o-help-search', autocomplete: 'off' });
    this.closeBtn = h('button', { type: 'button', class: 'o-btn-close' });
    this.headerEl = h('div', { class: 'o-help-header' },
      this.backBtn, this.fwdBtn,
      h('div', { class: 'o-input-wrap o-help-search-wrap' }, raw(String(icon('search', { size: 14 }))), this.searchInput),
      this.closeBtn);
    this.bodyEl = h('div', { class: 'o-help-body', role: 'region' });
    this.drawer = h('div', { class: 'o-help-drawer o-floating', role: 'dialog', 'aria-modal': 'true', tabindex: '-1', hidden: true }, this.headerEl, this.bodyEl);
    this.append(this.backdrop, this.drawer);
    on(this.closeBtn, 'click', () => this.close());
    on(this.backBtn, 'click', () => this.back());
    on(this.fwdBtn, 'click', () => this.forward());
    on(this.backdrop, 'click', () => this.close());
    on(this.searchInput, 'input', debounce(() => this._onSearchInput(), 150));
    on(this.bodyEl, 'click', 'a[data-help-key]', (e, a) => { e.preventDefault(); this.navigate(a.dataset.helpKey, { push: true }); });
  }
  disconnected() { this.close(); }
  update() {
    this.closeBtn.setAttribute('aria-label', this.t('help.close'));
    this.backBtn.setAttribute('aria-label', this.t('help.back'));
    this.fwdBtn.setAttribute('aria-label', this.t('help.forward'));
    this.searchInput.placeholder = this.t('help.searchPlaceholder');
    this.drawer.setAttribute('aria-label', this.t('help.title'));
    this.drawer.classList.toggle('o-help-drawer-start', this.placement === 'start');
    if (this.width) this.drawer.style.setProperty('--o-help-w', this.width);
    if (this._view) this._render();
  }

  /* ── open / close ── */
  open(key) {
    if (!this._ov) {
      portal(this.drawer, this); portal(this.backdrop, this);
      this.drawer.hidden = false; this.backdrop.hidden = false;
      this._ov = overlays.open({ el: this.drawer, owner: this, trap: true, lockScroll: true, onClose: reason => this._hide(reason) });
      animate(this.backdrop, 'fadeIn', { duration: 200 });
      animate(this.drawer, this.placement === 'start' ? 'slideInStart' : 'slideInEnd', { duration: 240 });
      this.isOpen = true;
      this.emit('open', {});
    }
    if (key) this.navigate(key, { push: true });
    else if (!this._history.length) this._render('home');
    else this._render();
    (focusables(this.drawer)[0] || this.searchInput).focus({ preventScroll: true });
  }
  close() { this._ov?.close('api'); }
  toggle(key) { this.isOpen ? this.close() : this.open(key); }
  _hide(reason) {
    this._ov = null;
    this.isOpen = false;
    animate(this.backdrop, 'fadeOut', { duration: 160, fill: 'forwards' });
    animate(this.drawer, this.placement === 'start' ? 'slideOutStart' : 'slideOutEnd', { duration: 200, fill: 'forwards' })
      .then(() => { this.drawer.hidden = true; this.backdrop.hidden = true; });
    this.emit('close', { reason });
  }

  /* ── navigation ── */
  navigate(key, { push = true } = {}) {
    if (push) { this._history = this._history.slice(0, this._hindex + 1); this._history.push(key); this._hindex = this._history.length - 1; }
    this.searchInput.value = '';
    this._render();
    this.emit('navigate', { key });
  }
  back() { if (this._hindex > 0) { this._hindex--; this._render(); } }
  forward() { if (this._hindex < this._history.length - 1) { this._hindex++; this._render(); } }
  search(q) { this.searchInput.value = q; this._onSearchInput(); }
  _onSearchInput() { const q = this.searchInput.value; this._render(q.trim() ? { search: q } : undefined); }

  /* ── render ── */
  _paintNav() {
    this.backBtn.disabled = this._hindex <= 0;
    this.fwdBtn.disabled = this._hindex < 0 || this._hindex >= this._history.length - 1;
  }
  _render(mode) {
    this._view = mode || this._view;
    this._paintNav();
    if (isObj(mode) && mode.search != null) return this._renderSearch(mode.search);
    if (mode === 'home' || this._hindex < 0) return this._renderHome();
    const key = this._history[this._hindex];
    const a = key && O.help.get(key);
    if (!a) return this._renderHome();
    this.bodyEl.replaceChildren(
      h('article', { class: 'o-help-article' },
        h('h2', null, a.title || key),
        this._videoBlock(a.video),
        h('div', { class: 'o-help-article-content', html: sanitize(a.content || '') }),
        toArr(a.related).length ? h('div', { class: 'o-help-related' },
          h('h3', null, this.t('help.related')),
          h('ul', null, toArr(a.related).map(k => h('li', null, h('a', { href: '#', 'data-help-key': k }, (O.help.get(k) || {}).title || k))))) : null));
    announce(a.title || key);
  }
  _renderHome() {
    const keys = O.help.keys();
    this.bodyEl.replaceChildren(h('div', { class: 'o-help-home' }, keys.length
      ? h('ul', { class: 'o-list o-list-flush' }, keys.map(k => this._articleLink(k)))
      : h('div', { class: 'o-empty o-empty-sm' }, h('p', { class: 'o-empty-text' }, this.t('help.noResults')))));
  }
  _renderSearch(q) {
    const results = O.help.search(q);
    this.bodyEl.replaceChildren(h('div', { class: 'o-help-search-results' }, results.length
      ? h('ul', { class: 'o-list o-list-flush' }, results.map(a => this._articleLink(a.key, q)))
      : h('div', { class: 'o-empty o-empty-sm' }, h('p', { class: 'o-empty-text' }, this.t('help.noResults')))));
  }
  _articleLink(key, q) {
    const a = O.help.get(key) || {};
    return h('li', { class: 'o-list-item' }, h('a', { href: '#', class: 'o-list-item', 'data-help-key': key, style: 'width:100%' },
      h('div', { class: 'o-list-content' }, h('span', { class: 'o-list-title', html: q ? highlight(a.title || key, q) : esc(a.title || key) })),
      raw(String(icon('chevron-right', { size: 14 })))));
  }
  _videoBlock(video) {
    if (!video) return null;
    const isFile = /\.(mp4|webm|ogv)(\?|#|$)/i.test(video);
    return h('div', { class: 'o-help-video' }, isFile ? h('video', { src: video, controls: true, playsinline: true }) : h('iframe', { src: video, loading: 'lazy', allowfullscreen: true, title: 'video' }));
  }
}
define('o-help-panel', OHelpPanel);
O.HelpPanel = OHelpPanel;
