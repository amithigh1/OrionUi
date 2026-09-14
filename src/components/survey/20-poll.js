/* Single-question poll with animated result bars.
 *   <o-poll question="Which feature next?" options='["Dark mode","Offline sync","Mobile app"]' name="roadmap-poll"></o-poll>
 *   <o-poll question="Pick your top 2" options='[…]' multiple max-choices="2" name="…"></o-poll>
 *   <o-poll name="…" votes='{"Dark mode":42,"Offline sync":15}' results-only></o-poll>     (live results display, no voting UI)
 *   Props: question, options (array of string | {value,label}), multiple, maxChoices, name (storage/identity key),
 *          votes (object: seed / server counts, value -> count), persist (default true, localStorage), allowRevote, resultsOnly, texts.
 *   Methods: vote(value | value[]), getResults() -> [{ value, label, count, pct }], hasVoted(), changeVote(), reset().
 *   Events: o-vote { value, results }, o-results { results }.
 */
i18n.add('en', {
  poll: {
    vote: 'Vote', changeVote: 'Change your vote', voted: 'Thanks for voting!', total: { one: '{count} vote', other: '{count} votes' },
    chooseUpTo: 'Choose up to {n}', pickOne: 'Pick one option', results: 'Results',
  },
});
const FUp = () => O.formUtil;
const normPollOptions = list => toArr(list).map(o => (isObj(o) ? { value: String(o.value ?? o.label), label: String(o.label ?? o.value) } : { value: String(o), label: String(o) }));

class OPoll extends OElement {
  static props = {
    question: String, options: { type: Array, default: () => [] }, multiple: Boolean, maxChoices: { type: Number, default: Infinity },
    name: String, votes: { type: Object, default: () => ({}) }, persist: { type: Boolean, default: true }, allowRevote: Boolean,
    resultsOnly: { type: Boolean, reflect: true }, texts: Object,
  };
  setup() {
    this.classList.add('o-poll');
    this._voted = null;
    this._counts = {};
    this._body = h('div', { class: 'o-poll-body' });
    this.append(this._body);
    on(this, 'submit', e => e.preventDefault());
  }
  update(changed) {
    if (changed.has('votes') || changed.has('init')) { this._counts = { ...this.votes }; this._loadVote(); }
    if (['options', 'question', 'multiple', 'resultsOnly', 'votes', 'init', 'locale', 'texts'].some(k => changed.has(k))) this._render();
  }
  _key() { return 'orion:poll:' + (this.name || this.question || 'default'); }
  _loadVote() {
    if (!this.persist) return;
    const rec = ls.get(this._key());
    if (rec && Array.isArray(rec.voted)) {
      this._voted = rec.voted;
      /* an externally-seeded `votes` object (server totals) is authoritative; otherwise trust the local tally */
      if (!Object.keys(this.votes || {}).length) this._counts = { ...this._counts, ...rec.counts };
    }
  }
  _save() { if (this.persist) ls.set(this._key(), { voted: this._voted, counts: this._counts }); }
  hasVoted() { return !!(this._voted && this._voted.length); }
  getResults() {
    const opts = normPollOptions(this.options);
    const total = opts.reduce((s, o) => s + (+this._counts[o.value] || 0), 0);
    return opts.map(o => { const count = +this._counts[o.value] || 0; return { value: o.value, label: o.label, count, pct: total ? Math.round((count / total) * 100) : 0 }; });
  }
  /** Record a vote (or votes, for `multiple`). Increments local counts optimistically. */
  vote(value) {
    if (this.hasVoted() && !this.allowRevote) return false;
    const values = toArr(value).map(String).slice(0, Number.isFinite(this.maxChoices) ? this.maxChoices : undefined);
    if (!values.length) return false;
    if (this._voted) for (const v of this._voted) this._counts[v] = Math.max(0, (+this._counts[v] || 0) - 1);
    for (const v of values) this._counts[v] = (+this._counts[v] || 0) + 1;
    this._voted = values;
    this._save();
    const results = this.getResults();
    this._render();
    announce(this.t('poll.voted'));
    this.emit('vote', { value: this.multiple ? values : values[0], results });
    this.emit('results', { results });
    return true;
  }
  /** Return to the voting view without discarding the recorded vote (call vote() again to replace it). */
  changeVote() { if (!this.allowRevote) return; this._showForm = true; this._render(); }
  reset() {
    if (this._voted) for (const v of this._voted) this._counts[v] = Math.max(0, (+this._counts[v] || 0) - 1);
    this._voted = null; this._showForm = false;
    if (this.persist) ls.del(this._key());
    this._render();
  }

  _render() {
    const showResults = this.resultsOnly || (this.hasVoted() && !this._showForm);
    const kids = [showResults ? this._resultsView() : this._formView()];
    if (this.question) kids.unshift(h('div', { class: 'o-poll-question' }, this.question));
    this._body.replaceChildren(...kids);
  }
  _formView() {
    this._showForm = false;
    const opts = normPollOptions(this.options), type = this.multiple ? 'checkbox' : 'radio', name = uid('poll');
    const list = h('div', { class: 'o-poll-options', role: type === 'radio' ? 'radiogroup' : 'group', 'aria-label': this.question || this.t(this.multiple ? 'poll.chooseUpTo' : 'poll.pickOne', { n: this.maxChoices }) });
    opts.forEach((o, i) => {
      const id = `${name}-${i}`;
      list.append(h('label', { class: 'o-poll-choice', for: id },
        h('input', { type, class: 'o-sr-only', name, value: o.value, id }), h('span', { class: 'o-poll-choice-mark', 'aria-hidden': 'true' }), h('span', { class: 'o-poll-choice-label' }, o.label)));
    });
    const submit = h('button', { type: 'button', class: 'o-btn o-btn-primary o-poll-submit' }, this.t('poll.vote'));
    const form = h('div', { class: 'o-poll-form' }, list, submit);
    submit.onclick = () => {
      const checked = $$('input:checked', list).map(i => i.value);
      if (!checked.length) return announce(this.t(this.multiple ? 'poll.chooseUpTo' : 'poll.pickOne', { n: this.maxChoices }), 'assertive');
      this.vote(checked);
    };
    if (this.multiple && Number.isFinite(this.maxChoices)) {
      on(list, 'change', 'input', () => { const n = $$('input:checked', list).length; $$('input:not(:checked)', list).forEach(i => { i.disabled = n >= this.maxChoices; }); });
    }
    return form;
  }
  _resultsView() {
    const results = this.getResults(), total = results.reduce((s, r) => s + r.count, 0);
    const wrap = h('div', { class: 'o-poll-results' },
      ...results.map(r => h('div', { class: cls('o-poll-result', this._voted && this._voted.includes(r.value) && 'is-picked') },
        h('div', { class: 'o-poll-result-head' }, h('span', { class: 'o-poll-result-label' }, this._voted && this._voted.includes(r.value) ? iconEl('check') : null, r.label), h('span', { class: 'o-poll-result-pct' }, r.pct + '%')),
        h('div', { class: 'o-progress o-progress-sm o-poll-result-bar' }, h('div', { class: 'o-progress-bar', style: `--o-value:${r.pct}%` })),
        h('div', { class: 'o-poll-result-count' }, this.t('poll.total', { count: r.count })))),
      h('div', { class: 'o-poll-footer' },
        h('span', { class: 'o-poll-total' }, this.t('poll.total', { count: total })),
        this.allowRevote && !this.resultsOnly && this.hasVoted() ? h('button', { type: 'button', class: 'o-btn o-btn-link o-btn-sm', onClick: () => this.changeVote() }, this.t('poll.changeVote')) : null));
    if (!reducedMotion()) requestAnimationFrame(() => $$('.o-poll-result-bar .o-progress-bar', wrap).forEach(b => animate(b, [{ opacity: .6 }, { opacity: 1 }], { duration: 260 })));
    return wrap;
  }
}
define('o-poll', OPoll);
O.Poll = OPoll;

/** Orion.polls(target, options) -> <o-poll> (created inside target unless it is one). NOTE: `Orion.poll` is
 * the realtime package's live-data-refresh helper — this widget is only ever `<o-poll>` / `Orion.polls`. */
O.polls = function (target, opts = {}) {
  let el = $(target);
  if (!el) throw new Error('Orion.polls: target not found');
  if (el.localName !== 'o-poll') { const p = h('o-poll'); el.append(p); el = p; }
  Object.assign(el, opts);
  return el;
};
