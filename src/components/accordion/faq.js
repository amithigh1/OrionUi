/* FAQ — searchable accordion with category chips, expand / collapse all, highlighting and optional FAQPage JSON-LD.
 *   <o-faq searchable json-ld placeholder="Search…" category="Billing" query="refund">
 *     <o-accordion-item heading="How do refunds work?" category="Billing">…</o-accordion-item>
 *   </o-faq>
 *   Data: faq.questions = [{ id, q, a, html (sanitized), category, open }]
 *   Answer text matches are painted with the CSS Custom Highlight API (no DOM changes) where supported.
 *   Events: o-search { query, category, count }  (+ accordion events)
 *   Methods: search(q) · setCategory(c) · expandAll() · collapseAll()
 */

i18n.add('en', {
  faq: {
    search: 'Search questions…', searchLabel: 'Search frequently asked questions', all: 'All', categories: 'Categories',
    count: { one: '{count} question', other: '{count} questions' }, empty: 'No matching questions', emptyHint: 'Try another word or pick a different category.',
  },
});

const __faqHL = new Map();
function faqPaintHighlights() {
  if (!isBrowser || !win.CSS?.highlights || !win.Highlight) return;
  const all = [...__faqHL.values()].flat();
  if (all.length) CSS.highlights.set('o-faq-match', new Highlight(...all)); else CSS.highlights.delete('o-faq-match');
}
function faqRanges(text, words) {
  const lower = text.toLowerCase(), out = [];
  for (const w of words) for (let i = lower.indexOf(w); i >= 0 && out.length < 50; i = lower.indexOf(w, i + w.length)) out.push([i, i + w.length]);
  out.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of out) { const l = merged[merged.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else merged.push(r); }
  return merged;
}
function faqTextRanges(root, words) {
  const out = [], tw = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n && out.length < 300; n = tw.nextNode()) {
    for (const [a, b] of faqRanges(n.data, words)) { const r = new Range(); r.setStart(n, a); r.setEnd(n, b); out.push(r); }
  }
  return out;
}

class OFaq extends OAccordion {
  static props = {
    ...OAccordion.props,
    multiple: { type: Boolean, default: true }, variant: { type: String, default: 'separated', reflect: true },
    searchable: Boolean, jsonLd: Boolean, placeholder: String, query: String, category: String, questions: Array,
  };
  setup() {
    super.setup();
    this.classList.add('o-faq');
    this._cat = '';
    const sid = uid('faq');
    this.input = h('input', { type: 'search', class: 'o-input', id: sid, autocomplete: 'off', spellcheck: 'false' });
    this.searchWrap = h('div', { class: 'o-input-wrap o-faq-search' }, icon('search'), h('label', { class: 'o-sr-only', for: sid }), this.input);
    this.chips = h('div', { class: 'o-faq-chips', role: 'group' });
    this.count = h('span', { class: 'o-faq-count' });
    this.btnAll = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm o-faq-toggle' });
    this.bar = h('div', { class: 'o-faq-toolbar' }, this.searchWrap, this.chips, h('div', { class: 'o-faq-meta' }, this.count, this.btnAll));
    this.emptyEl = h('div', { class: 'o-empty o-empty-sm o-faq-empty', hidden: true, role: 'status' },
      h('div', { class: 'o-empty-icon' }, icon('search')), h('p', { class: 'o-empty-title' }), h('p', { class: 'o-empty-text' }));
    this.prepend(this.bar);
    this.append(this.emptyEl);
    this._own = new Set([this.bar, this.emptyEl]);
    const run = debounce(() => this._filter(true), 140);
    on(this.input, 'input', run);
    on(this.input, 'keydown', e => { if (e.key === 'Escape' && this.input.value) { e.preventDefault(); this.input.value = ''; run.cancel(); this._filter(true); } });
    on(this.chips, 'click', 'button', (e, b) => this.setCategory(b.dataset.cat));
    on(this.btnAll, 'click', () => (this._allOpen() ? this.collapseAll() : this.expandAll()));
    on(this, 'o-shown o-hidden', e => { if (e.target.parentElement?.closest('o-faq') === this) this._paintToggle(); });
  }
  connected() {
    const mo = new MutationObserver(muts => {
      if (muts.some(m => [...m.addedNodes, ...m.removedNodes].some(n => n.nodeType === 1 && !this._own.has(n)))) this._queue();
    });
    mo.observe(this, { childList: true });
    this.addCleanup(() => { mo.disconnect(); __faqHL.delete(this); faqPaintHighlights(); });
    this._queue();
  }
  update(changed) {
    super.update(changed);
    if (changed.has('questions')) this._renderData();
    if (changed.has('init') || changed.has('locale') || changed.has('texts') || changed.has('placeholder') || changed.has('searchable')) {
      this.input.placeholder = this.placeholder || this.t('faq.search');
      this.searchWrap.querySelector('label').textContent = this.t('faq.searchLabel');
      this.chips.setAttribute('aria-label', this.t('faq.categories'));
      this.emptyEl.querySelector('.o-empty-title').textContent = this.t('faq.empty');
      this.emptyEl.querySelector('.o-empty-text').textContent = this.t('faq.emptyHint');
      this.searchWrap.hidden = !this.searchable;
    }
    if (changed.has('query') && this.query != null) this.input.value = this.query;
    if (changed.has('category')) this._cat = this.category || '';
    if (changed.has('jsonLd') && !this.jsonLd) { this._ldEl?.remove(); this._ldEl = null; }
    this._queue();
  }
  /** search(query) — filter questions (also typed in the search box). */
  search(q) { this.input.value = q ?? ''; this._filter(true); }
  /** setCategory(name | '') — '' shows all categories. */
  setCategory(c) { this._cat = c || ''; this._p.category = this._cat; this._refresh(true); }

  _queue() { if (this._q) return; this._q = true; queueMicrotask(() => { this._q = false; if (this.isConnected) this._refresh(false); }); }
  _renderData() {
    this._gen?.forEach(n => n.remove());
    this._gen = (this.questions || []).map(d => {
      const it = h('o-accordion-item', { id: d.id || null, heading: d.q ?? d.question ?? d.heading ?? '', category: d.category || null, open: d.open || null });
      const body = h('div', { 'data-o-panel': '' });
      if (d.html != null) body.innerHTML = sanitize(d.html); else body.textContent = d.a ?? d.answer ?? '';
      it.append(body);
      return it;
    });
    this._gen.forEach(n => this.insertBefore(n, this.emptyEl));
  }
  _refresh(announceIt) {
    const cats = [...new Set(this.items.map(i => i.category || i.getAttribute('category')).filter(Boolean))];
    if (this._cat && !cats.includes(this._cat)) this._cat = '';
    const key = cats.join('|') + this._cat + i18n.locale;
    if (key !== this._catKey) {
      this._catKey = key;
      this.chips.replaceChildren(...['', ...cats].map(c => h('button', {
        type: 'button', class: 'o-chip', 'data-cat': c, 'aria-pressed': String(c === this._cat),
      }, c || this.t('faq.all'))));
    }
    this.chips.hidden = cats.length < 2;
    this._filter(announceIt);
    this._ld();
  }
  _filter(announceIt) {
    const q = this.input.value.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean), cat = this._cat;
    const items = this.items, ranges = [];
    if (words.length && !this._saved) this._saved = new Map(items.map(i => [i, i.expanded]));
    let count = 0;
    for (const it of items) {
      if (!it.btn) continue;
      const title = it.heading ?? '', body = it.panel.textContent, lt = title.toLowerCase(), lb = body.toLowerCase();
      const ok = (!cat || (it.category || it.getAttribute('category')) === cat) && words.every(w => lt.includes(w) || lb.includes(w));
      it.hidden = !ok;
      if (it._title) it._title.innerHTML = ok && words.length ? highlight(title, faqRanges(title, words)) : esc(title);
      if (!ok) continue;
      count++;
      if (words.length) {
        ranges.push(...faqTextRanges(it.panel, words));
        if (q.length >= 3 && !words.every(w => lt.includes(w)) && !it.expanded) it.show();
      }
    }
    if (!words.length && this._saved) { this._saved.forEach((was, it) => { if (it.isConnected && it.expanded !== was) it.toggle(was); }); this._saved = null; }
    __faqHL.set(this, ranges);
    faqPaintHighlights();
    this.emptyEl.hidden = count > 0;
    this.count.textContent = this.t('faq.count', { count });
    this.chips.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === cat)));
    this._paintToggle();
    const sig = q + ' ' + cat;
    if (this._sig != null && sig !== this._sig) {
      if (announceIt) announce(this.t('faq.count', { count }));
      this.emit('search', { query: q, category: cat, count });
    }
    this._sig = sig;
  }
  _visible() { return this.items.filter(i => !i.hidden && !i.disabled); }
  _allOpen() { const v = this._visible(); return v.length > 0 && v.every(i => i.expanded); }
  _paintToggle() {
    const v = this._visible();
    this.btnAll.hidden = !this.multiple || !v.length;
    this.btnAll.textContent = this.t(this._allOpen() ? 'accordion.collapseAll' : 'accordion.expandAll');
  }
  expandAll() { return Promise.all(this._visible().map(i => i.show())); }
  _ld() {
    if (!this.jsonLd) return;
    if (!this._ldEl) { this._ldEl = h('script', { type: 'application/ld+json' }); this._own.add(this._ldEl); this.append(this._ldEl); }
    this._ldEl.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: this.items.filter(i => i.heading).map(i => ({ '@type': 'Question', name: i.heading, acceptedAnswer: { '@type': 'Answer', text: i.panel?.textContent.trim().replace(/\s+/g, ' ') || '' } })),
    }).replace(/</g, '\\u003c');
  }
}

define('o-faq', OFaq);
O.Faq = OFaq;
