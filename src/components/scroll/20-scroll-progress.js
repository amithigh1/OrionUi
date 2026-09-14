/* <o-scroll-progress target position="top|bottom">
 *   Thin fixed bar showing how far the page (or `target`) has been scrolled.
 */
i18n.add('en', { scroll: { progress: 'Scroll progress' } });

class OScrollProgress extends OElement {
  static props = { target: String, position: { type: String, default: 'top', reflect: true } };
  setup() {
    this.classList.add('o-scroll-progress');
    this.setAttribute('role', 'progressbar');
    this.setAttribute('aria-valuemin', '0');
    this.setAttribute('aria-valuemax', '100');
    if (!this.hasAttribute('aria-label')) this.setAttribute('aria-label', t('scroll.progress'));
    this._bar = h('div', { class: 'o-scroll-progress-bar' });
    this.replaceChildren(this._bar);
  }
  connected() {
    const scroller = this.target ? $(this.target) : win;
    this._scroller = scroller || win;
    const update = rafThrottle(() => this._update());
    this.listen(this._scroller === win ? win : this._scroller, 'scroll', update, { passive: true });
    this.listen(win, 'resize', update);
    update();
    this.addCleanup(() => update.cancel?.());
  }
  _update() {
    const s = this._scroller;
    const top = s === win ? (win.scrollY || doc.documentElement.scrollTop || 0) : s.scrollTop;
    const el = s === win ? doc.documentElement : s;
    const max = Math.max(1, el.scrollHeight - (s === win ? win.innerHeight : el.clientHeight));
    const pct = clamp(round((top / max) * 100, 1), 0, 100);
    this._bar.style.width = pct + '%';
    this.setAttribute('aria-valuenow', String(pct));
  }
}
define('o-scroll-progress', OScrollProgress);
O.ScrollProgress = OScrollProgress;
