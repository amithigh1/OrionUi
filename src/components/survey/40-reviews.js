/* Rating summary + review list + write-a-review form.
 *   <o-reviews reviews='[{"id":"1","author":"Ada","rating":5,"title":"Great","body":"…","date":"2026-01-01",
 *                          "verified":true,"helpful":4,"unhelpful":0}]' summary allow-write sort="recent"></o-reviews>
 *   Props: reviews (array), summary (bool, default true), allowWrite (bool), sort ('recent'|'helpful'|'highest'|'lowest'),
 *          filterStars (1-5 | null), name (storage key so "helpful" votes aren't counted twice per browser), texts.
 *   Methods: addReview(review) -> review, getReviews(), setReviews(list), voteHelpful(id, helpful).
 *   Events: o-review { review } (a visitor submitted the write-a-review form), o-vote-helpful { id, helpful }.
 */
i18n.add('en', {
  reviews: {
    total: { one: '{count} review', other: '{count} reviews' }, sortBy: 'Sort by', sortRecent: 'Most recent', sortHelpful: 'Most helpful',
    sortHighest: 'Highest rated', sortLowest: 'Lowest rated', write: 'Write a review', yourRating: 'Your rating', titleLabel: 'Title',
    titlePlaceholder: 'Summarize your experience', bodyLabel: 'Review', bodyPlaceholder: 'What did you like or dislike?',
    submit: 'Submit review', incomplete: 'Please add a rating and a review', thanks: 'Thanks for your review!',
    verified: 'Verified', anonymous: 'Anonymous', response: 'Response from the team', wasHelpful: 'Was this helpful?',
    empty: 'No reviews yet', ratingOf: '{value} out of {max} stars', all: 'All ratings',
  },
});
function starsInt(value, max = 5) {
  const n = clamp(Math.round(+value || 0), 0, max);
  return h('div', { class: 'o-reviews-stars-int', role: 'img', 'aria-label': t('reviews.ratingOf', { value: n, max }) },
    ...Array.from({ length: max }, (_, i) => h('span', { class: cls('o-reviews-star', i < n && 'is-filled') }, icon('star'))));
}
function starsFrac(value, max = 5) {
  const pct = clamp((value / max) * 100, 0, 100);
  return h('div', { class: 'o-reviews-stars', role: 'img', 'aria-label': t('reviews.ratingOf', { value: value.toFixed(1), max }) },
    h('div', { class: 'o-reviews-stars-bg' }, ...Array.from({ length: max }, () => icon('star'))),
    h('div', { class: 'o-reviews-stars-fg', style: `width:${pct}%` }, ...Array.from({ length: max }, () => icon('star'))));
}

class OReviews extends OElement {
  static props = {
    reviews: { type: Array, default: () => [] }, summary: { type: Boolean, default: true }, allowWrite: Boolean,
    sort: { type: String, default: 'recent' }, filterStars: { type: Number, default: null }, name: String, texts: Object,
  };
  setup() {
    this.classList.add('o-reviews');
    this._writing = false;
    if (!this.reviews.length) { const s = this.querySelector(':scope > script[type="application/json"]'); if (s) this._p.reviews = parseJSON(s.textContent, []); }
  }
  render() {
    const stats = this._stats();
    const parts = [];
    if (this.summary !== false) parts.push(this._summaryView(stats));
    parts.push(this._toolbar());
    if (this._writing) parts.push(this._writeForm());
    parts.push(this._list());
    this.replaceChildren(...parts);
  }
  _stats() {
    const list = this.reviews, total = list.length;
    const avg = total ? list.reduce((s, r) => s + (+r.rating || 0), 0) / total : 0;
    const hist = [5, 4, 3, 2, 1].map(n => { const count = list.filter(r => Math.round(+r.rating) === n).length; return { n, count, pct: total ? Math.round((count / total) * 100) : 0 }; });
    return { total, avg, hist };
  }
  _sorted() {
    let list = [...this.reviews];
    if (this.filterStars) list = list.filter(r => Math.round(+r.rating) === +this.filterStars);
    const by = {
      recent: (a, b) => new Date(b.date) - new Date(a.date), helpful: (a, b) => (b.helpful || 0) - (a.helpful || 0),
      highest: (a, b) => b.rating - a.rating, lowest: (a, b) => a.rating - b.rating,
    };
    return list.sort(by[this.sort] || by.recent);
  }
  _votesKey() { return 'orion:reviews:' + (this.name || 'default') + ':votes'; }
  _votes() { return ls.get(this._votesKey(), {}) || {}; }

  _summaryView({ total, avg, hist }) {
    return h('div', { class: 'o-reviews-summary' },
      h('div', { class: 'o-reviews-avg' }, h('div', { class: 'o-reviews-avg-num' }, avg.toFixed(1)), starsFrac(avg), h('div', { class: 'o-reviews-avg-total' }, this.t('reviews.total', { count: total }))),
      h('div', { class: 'o-reviews-hist' }, ...hist.map(row => h('button', { type: 'button', class: cls('o-reviews-hist-row', this.filterStars === row.n && 'is-active'), onClick: () => { this.filterStars = this.filterStars === row.n ? null : row.n; } },
        h('span', { class: 'o-reviews-hist-label' }, row.n + '★'),
        h('div', { class: 'o-progress o-progress-sm' }, h('div', { class: 'o-progress-bar', style: `--o-value:${row.pct}%` })),
        h('span', { class: 'o-reviews-hist-count' }, row.count)))));
  }
  _toolbar() {
    const sortSel = h('select', { class: 'o-select o-input-sm', 'aria-label': this.t('reviews.sortBy') },
      ...['recent', 'helpful', 'highest', 'lowest'].map(v => h('option', { value: v, selected: this.sort === v }, this.t('reviews.sort' + cap(v)))));
    sortSel.onchange = () => { this.sort = sortSel.value; };
    const parts = [h('span', { class: 'o-reviews-filter-label' }, this.filterStars ? this.filterStars + '★' : this.t('reviews.all'))];
    if (this.filterStars) parts.push(h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-xs', onClick: () => { this.filterStars = null; } }, icon('x'), t('common.clear')));
    const right = [sortSel];
    if (this.allowWrite) right.push(h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm', onClick: () => { this._writing = !this._writing; this.requestUpdate('_writing'); } }, this.t('reviews.write')));
    return h('div', { class: 'o-reviews-toolbar' }, h('div', { class: 'o-reviews-filter' }, ...parts), h('div', { class: 'o-reviews-toolbar-end' }, ...right));
  }
  _writeForm() {
    const name = uid('rv-rating'), stars = h('div', { class: 'o-reviews-picker', role: 'radiogroup', 'aria-label': this.t('reviews.yourRating') });
    for (let i = 5; i >= 1; i--) { const id = `${name}-${i}`; stars.append(h('input', { type: 'radio', name, value: String(i), id, class: 'o-sr-only' }), h('label', { for: id, title: t('reviews.ratingOf', { value: i, max: 5 }) }, icon('star'))); }
    const titleEl = h('input', { class: 'o-input', placeholder: this.t('reviews.titlePlaceholder') });
    const bodyEl = h('textarea', { class: 'o-textarea', rows: 3, placeholder: this.t('reviews.bodyPlaceholder') });
    const submitBtn = h('button', { type: 'button', class: 'o-btn o-btn-primary' }, this.t('reviews.submit'));
    const cancelBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost' }, t('common.cancel'));
    cancelBtn.onclick = () => { this._writing = false; this.requestUpdate('_writing'); };
    submitBtn.onclick = () => {
      const rating = +($$('input:checked', stars)[0]?.value || 0);
      if (!rating || !bodyEl.value.trim()) { announce(this.t('reviews.incomplete'), 'assertive'); return; }
      const review = this.addReview({ rating, title: titleEl.value.trim(), body: bodyEl.value.trim() });
      this._writing = false;
      this.requestUpdate('_writing');
      this.emit('review', { review });
      announce(this.t('reviews.thanks'));
    };
    return h('div', { class: 'o-reviews-write' },
      h('div', { class: 'o-field' }, h('span', { class: 'o-label' }, this.t('reviews.yourRating')), stars),
      h('div', { class: 'o-field' }, h('label', { class: 'o-label' }, this.t('reviews.titleLabel')), titleEl),
      h('div', { class: 'o-field' }, h('label', { class: 'o-label' }, this.t('reviews.bodyLabel')), bodyEl),
      h('div', { class: 'o-form-actions' }, cancelBtn, submitBtn));
  }
  _list() {
    const list = this._sorted();
    if (!list.length) return h('div', { class: 'o-empty o-empty-sm' }, h('div', { class: 'o-empty-icon' }, icon('message-circle')), h('p', { class: 'o-empty-text' }, this.t('reviews.empty')));
    return h('div', { class: 'o-reviews-list' }, ...list.map(r => this._card(r)));
  }
  _card(r) {
    const votes = this._votes(), voted = votes[r.id];
    return h('article', { class: 'o-review' },
      h('div', { class: 'o-review-head' },
        h('div', { class: 'o-avatar' }, r.avatar ? h('img', { src: r.avatar, alt: '' }) : String(r.author || '?').slice(0, 1).toUpperCase()),
        h('div', { class: 'o-review-who' },
          h('span', { class: 'o-review-name' }, r.author || this.t('reviews.anonymous'), r.verified ? h('span', { class: 'o-badge o-badge-sm o-c-success o-review-verified' }, icon('shield-check'), this.t('reviews.verified')) : null),
          h('span', { class: 'o-review-date' }, fmt.relative(r.date))),
        starsInt(r.rating)),
      r.title ? h('h4', { class: 'o-review-title' }, r.title) : null,
      h('p', { class: 'o-review-body' }, r.body),
      r.response ? h('div', { class: 'o-review-response' }, h('strong', null, this.t('reviews.response')), h('p', null, r.response)) : null,
      h('div', { class: 'o-review-actions' },
        h('span', { class: 'o-review-helpful-label' }, this.t('reviews.wasHelpful')),
        h('button', { type: 'button', class: cls('o-btn o-btn-ghost o-btn-sm', voted === true && 'is-active'), disabled: voted != null, onClick: () => this.voteHelpful(r.id, true) }, icon('thumbs-up'), h('span', null, r.helpful || 0)),
        h('button', { type: 'button', class: cls('o-btn o-btn-ghost o-btn-sm', voted === false && 'is-active'), disabled: voted != null, onClick: () => this.voteHelpful(r.id, false) }, icon('thumbs-down'), h('span', null, r.unhelpful || 0))));
  }

  /* ── public API ── */
  addReview(review) {
    const r = { id: uid('rev'), date: new Date().toISOString(), helpful: 0, unhelpful: 0, verified: false, ...review };
    this.reviews = [r, ...this.reviews];
    return r;
  }
  getReviews() { return clone(this.reviews); }
  setReviews(list) { this.reviews = toArr(list); }
  voteHelpful(id, helpful) {
    const votes = this._votes();
    if (votes[id] != null) return false;
    this.reviews = this.reviews.map(r => (r.id === id ? { ...r, helpful: (r.helpful || 0) + (helpful ? 1 : 0), unhelpful: (r.unhelpful || 0) + (helpful ? 0 : 1) } : r));
    votes[id] = helpful;
    ls.set(this._votesKey(), votes);
    this.emit('vote-helpful', { id, helpful });
    return true;
  }
}
define('o-reviews', OReviews);
O.Reviews = OReviews;
