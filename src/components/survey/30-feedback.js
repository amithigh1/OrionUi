/* Floating feedback widget: a corner launcher button that opens a small rating + category + message panel.
 *   Orion.feedback({ position: 'bottom-end'|'bottom-start'|'top-end'|'top-start', categories: ['Bug','Idea','Other'],
 *                    buttonText, onSubmit: async (data) => {} }) -> { open(), close(), destroy() }
 *   data submitted to onSubmit: { rating, category, message, url, userAgent, viewport, timestamp }.
 *   Calling Orion.feedback() again (without `id`) replaces the previous default launcher; pass `id` to run several.
 */
i18n.add('en', {
  feedback: {
    open: 'Send feedback', title: 'Send feedback', category: 'Category', placeholder: "What's on your mind?",
    send: 'Send feedback', thanks: 'Thanks for your feedback!', required: 'Please add a rating or a message',
    error: 'Could not send feedback — please try again.', ratingLabel: 'Rating', starLabel: '{n} of {max} stars',
  },
});
const __feedbacks = new Map();

class Feedback {
  constructor(o = {}) {
    this.o = { position: 'bottom-end', categories: [], ...o };
    this._build();
  }
  _build() {
    const [side] = this.o.position.split('-');
    this.btn = h('button', { type: 'button', class: cls('o-feedback-btn', 'o-feedback-' + this.o.position), 'aria-label': this.o.buttonText || t('feedback.open') },
      iconEl('message-circle'), this.o.buttonText ? h('span', null, this.o.buttonText) : null);
    doc.body.append(this.btn);
    this.btn.addEventListener('click', () => (this._ov ? this.close() : this.open()));
    this._anchorPlacement = (side === 'bottom' ? 'top' : 'bottom') + '-' + this.o.position.split('-')[1];
  }
  open() {
    if (this._ov) return;
    this.panel = this._panel();
    portal(this.panel, this.btn);
    this.panel.hidden = false;
    this._unplace = autoPlace(this.panel, this.btn, { placement: this._anchorPlacement, offset: 10, flip: true });
    this._ov = overlays.open({
      el: this.panel, owner: this.btn, trap: true,
      onClose: () => { this._ov = null; this._unplace?.(); this._unplace = null; this.panel?.remove(); this.panel = null; this.btn.classList.remove('is-open'); },
    });
    this.btn.classList.add('is-open');
    animate(this.panel, 'zoomIn', { duration: 150 });
    focusFirst(this.panel);
  }
  close() { this._ov?.close('api'); }
  destroy() { this.close(); this.btn.remove(); }

  _panel() {
    const stars = h('div', { class: 'o-feedback-stars', role: 'radiogroup', 'aria-label': t('feedback.ratingLabel') });
    const starName = uid('fb-rating');
    for (let i = 5; i >= 1; i--) {
      const id = `${starName}-${i}`;
      stars.append(h('input', { type: 'radio', name: starName, value: String(i), id, class: 'o-sr-only' }), h('label', { for: id, title: t('feedback.starLabel', { n: i, max: 5 }) }, icon('star')));
    }
    const cats = this.o.categories.length ? h('div', { class: 'o-feedback-cats', role: 'radiogroup', 'aria-label': t('feedback.category') },
      ...this.o.categories.map(c => { const id = uid('fb-cat'); return h('label', { class: 'o-feedback-cat', for: id }, h('input', { type: 'radio', name: 'o-feedback-cat', value: c, id, class: 'o-sr-only' }), h('span', null, c)); })) : null;
    const msg = h('textarea', { class: 'o-textarea', rows: 3, placeholder: t('feedback.placeholder') });
    const submitBtn = h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-block' }, t('feedback.send'));
    const closeBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': t('common.close') }, icon('x'));
    const body = [stars];
    if (cats) body.push(cats);
    body.push(msg);
    const panel = h('div', { class: 'o-feedback-panel o-floating', role: 'dialog', 'aria-modal': 'false', 'aria-label': t('feedback.title'), hidden: true },
      h('div', { class: 'o-feedback-head' }, h('strong', null, t('feedback.title')), closeBtn),
      h('div', { class: 'o-feedback-body' }, ...body),
      h('div', { class: 'o-feedback-foot' }, submitBtn));
    closeBtn.onclick = () => this.close();
    submitBtn.onclick = () => this._submit({ stars, msg, panel, submitBtn });
    return panel;
  }
  async _submit({ stars, msg, panel, submitBtn }) {
    const rating = +($$('input:checked', stars)[0]?.value || 0);
    const category = panel.querySelector('input[name="o-feedback-cat"]:checked')?.value || null;
    const message = msg.value.trim();
    if (!rating && !message) { announce(t('feedback.required'), 'assertive'); return; }
    const data = { rating: rating || null, category, message, url: location.href, userAgent: navigator.userAgent, viewport: `${innerWidth}x${innerHeight}`, timestamp: new Date().toISOString() };
    submitBtn.classList.add('is-loading'); submitBtn.disabled = true;
    try {
      if (isFn(this.o.onSubmit)) await this.o.onSubmit(data);
      this._success(panel);
    } catch (e) {
      console.error('[Orion] feedback submit failed:', e);
      announce(t('feedback.error'), 'assertive');
      submitBtn.classList.remove('is-loading'); submitBtn.disabled = false;
    }
  }
  _success(panel) {
    panel.replaceChildren(h('div', { class: 'o-feedback-success' }, icon('check-circle'), h('p', null, t('feedback.thanks'))));
    announce(t('feedback.thanks'));
    setTimeout(() => this.close(), 2200);
  }
}

/** Orion.feedback(opts) -> { open(), close(), destroy() } — see file header for opts. */
O.feedback = function (opts = {}) {
  const id = opts.id || '__default';
  __feedbacks.get(id)?.destroy();
  const fb = new Feedback(opts);
  __feedbacks.set(id, fb);
  return { open: () => fb.open(), close: () => fb.close(), destroy: () => { fb.destroy(); __feedbacks.delete(id); } };
};
