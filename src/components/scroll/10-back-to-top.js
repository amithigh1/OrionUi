/* <o-back-to-top threshold="300" target progress label>
 *   Fixed circular button, shown after scrolling past `threshold` px of `target` (default: window).
 *   `progress` draws a ring showing how far through the page/target the user has scrolled.
 * Methods: scrollToTop(). Events: o-click.
 */
i18n.add('en', { scroll: { top: 'Back to top' } });

class OBackToTop extends OElement {
  static props = { threshold: { type: Number, default: 300 }, target: String, progress: { type: Boolean, reflect: true }, label: String };
  setup() {
    this.classList.add('o-back-to-top');
    this._btn = h('button', { type: 'button', class: 'o-back-to-top-btn' }, iconEl('arrow-up', { class: 'o-back-to-top-icon' }));
    this.replaceChildren(this._btn);
    on(this._btn, 'click', () => this.scrollToTop());
  }
  connected() {
    this._btn.setAttribute('aria-label', this.label || this.t('scroll.top'));
    const scroller = this.target ? $(this.target) : win;
    this._scroller = scroller;
    const update = rafThrottle(() => this._update());
    this.listen(scroller === win ? win : scroller, 'scroll', update, { passive: true });
    this.listen(win, 'resize', update);
    update();
    this.addCleanup(() => update.cancel?.());
  }
  update(changed) { if (changed.has('label') || changed.has('locale')) this._btn.setAttribute('aria-label', this.label || this.t('scroll.top')); }
  _top() { const s = this._scroller; return s === win ? (win.scrollY || doc.documentElement.scrollTop || 0) : s.scrollTop; }
  _max() { const s = this._scroller; const el = s === win ? doc.documentElement : s; return Math.max(1, el.scrollHeight - (s === win ? win.innerHeight : el.clientHeight)); }
  _update() {
    const y = this._top();
    this.classList.toggle('is-visible', y > this.threshold);
    if (this.progress) this._btn.style.setProperty('--o-progress', String(clamp(y / this._max(), 0, 1)));
  }
  /** Smooth-scroll the target (or window) to the top. */
  scrollToTop() {
    const s = this._scroller || win;
    s.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    this.emit('click');
  }
}
define('o-back-to-top', OBackToTop);
O.BackToTop = OBackToTop;
