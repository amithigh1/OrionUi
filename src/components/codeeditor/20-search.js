/* <o-code-editor> search & replace panel (Ctrl+F / Ctrl+H, F3, Enter / Shift+Enter, Alt+C / Alt+R / Alt+W). */

Object.assign(OCodeEditor.prototype, {
  _buildSearch() {
    const btn = (cls, iconName, act) => h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-xs o-btn-icon ' + cls, 'data-act': act }, raw(String(icon(iconName))));
    const opt = (key, label) => h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-xs o-ce-opt', 'aria-pressed': 'false', 'data-opt': key }, label);
    this.sToggle = btn('o-ce-s-toggle', 'chevron-right', 'toggle');
    this.sToggle.setAttribute('aria-expanded', 'false');
    this.sFind = h('input', { class: 'o-input o-input-sm o-ce-find', type: 'text', spellcheck: 'false', autocomplete: 'off' });
    this.sRepl = h('input', { class: 'o-input o-input-sm o-ce-repl', type: 'text', spellcheck: 'false', autocomplete: 'off' });
    this.sCase = opt('case', 'Aa');
    this.sWord = opt('word', h('span', { class: 'o-ce-word' }, 'ab'));
    this.sRe = opt('regex', '.*');
    this.sCount = h('span', { class: 'o-ce-count', 'aria-live': 'polite' });
    this.sPrev = btn('', 'arrow-up', 'prev');
    this.sNext = btn('', 'arrow-down', 'next');
    this.sClose = btn('', 'x', 'close');
    this.sReplOne = h('button', { type: 'button', class: 'o-btn o-btn-sm', 'data-act': 'replace' });
    this.sReplAll = h('button', { type: 'button', class: 'o-btn o-btn-sm', 'data-act': 'replaceAll' });
    this.sReplRow = h('div', { class: 'o-ce-search-row o-ce-replace-row', hidden: true }, h('span', { class: 'o-ce-s-spacer' }), this.sRepl, this.sReplOne, this.sReplAll);
    const el = h('div', { class: 'o-ce-search', role: 'search', hidden: true },
      h('div', { class: 'o-ce-search-row' }, this.sToggle,
        h('div', { class: 'o-ce-find-wrap' }, this.sFind, h('div', { class: 'o-ce-opts' }, this.sCase, this.sWord, this.sRe)),
        this.sCount, this.sPrev, this.sNext, this.sClose),
      this.sReplRow);
    on(el, 'click', '[data-opt]', (e, b) => { const k = b.dataset.opt; this._opt[k] = !this._opt[k]; b.setAttribute('aria-pressed', String(this._opt[k])); this._search(false); });
    on(el, 'click', '[data-act]', (e, b) => {
      const a = b.dataset.act;
      if (a === 'toggle') this._showReplace(this.sReplRow.hidden);
      else if (a === 'prev') this.findPrev();
      else if (a === 'next') this.findNext();
      else if (a === 'close') this.closeSearch();
      else if (a === 'replace') this.replaceCurrent();
      else if (a === 'replaceAll') this.replaceAll();
    });
    on(this.sFind, 'input', () => this._search(false));
    on(el, 'keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.closeSearch(); return; }
      if (e.altKey && /^[crw]$/i.test(e.key)) { e.preventDefault(); ({ c: this.sCase, r: this.sRe, w: this.sWord })[e.key.toLowerCase()].click(); return; }
      if (modKey(e) && e.key.toLowerCase() === 'f') { e.preventDefault(); this.sFind.focus(); this.sFind.select(); return; }
      if (modKey(e) && e.key.toLowerCase() === 'h') { e.preventDefault(); this._showReplace(true); this.sRepl.focus(); return; }
      if (e.key === 'F3') { e.preventDefault(); e.shiftKey ? this.findPrev() : this.findNext(); return; }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (e.target === this.sRepl) { if (modKey(e) && e.altKey) this.replaceAll(); else this.replaceCurrent(); }
      else if (e.target === this.sFind) { if (e.shiftKey) this.findPrev(); else this.findNext(); }
    });
    return el;
  },
  _paintSearchTexts() {
    const T = k => this.t('codeeditor.' + k);
    this.sFind.placeholder = T('find'); this.sFind.setAttribute('aria-label', T('find'));
    this.sRepl.placeholder = T('replace'); this.sRepl.setAttribute('aria-label', T('replace'));
    this.sReplOne.textContent = T('replaceOne'); this.sReplAll.textContent = T('replaceAll');
    [[this.sCase, 'matchCase'], [this.sWord, 'wholeWord'], [this.sRe, 'regex'], [this.sPrev, 'prev'], [this.sNext, 'next'], [this.sClose, 'close'], [this.sToggle, 'toggleReplace']]
      .forEach(([b, k]) => { b.title = T(k); b.setAttribute('aria-label', T(k)); });
    this.searchEl.setAttribute('aria-label', T('find'));
  },
  _showReplace(show) {
    this.sReplRow.hidden = !show || !!this.readonly;
    this.sToggle.setAttribute('aria-expanded', String(!this.sReplRow.hidden));
    this.sToggle.innerHTML = String(icon(this.sReplRow.hidden ? 'chevron-right' : 'chevron-down'));
  },
  /** openSearch(replace = false) — show the panel (prefilled with the selection). */
  openSearch(replace = false) {
    const ta = this.ta, sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    this.searchEl.hidden = false;
    this._showReplace(replace);
    if (sel && !sel.includes('\n') && sel.length < 200) this.sFind.value = sel;
    this._search(false);
    (replace && this.sFind.value ? this.sRepl : this.sFind).focus();
    if (!replace || !this.sFind.value) this.sFind.select();
    this.emit('search-open', { replace });
  },
  closeSearch() {
    if (this.searchEl.hidden) return;
    this.searchEl.hidden = true;
    const m = this._matches[this._matchIndex];
    this._matches = []; this._matchIndex = -1;
    this.ta.focus();
    if (m) this.ta.setSelectionRange(m.start, m.end);
    this._render();
  },
  _regex(q) {
    const src = this._opt.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(this._opt.word ? `\\b(?:${src})\\b` : src, 'g' + (this._opt.case ? '' : 'i') + (this._opt.regex ? 'm' : ''));
  },
  /** Recompute matches; move = true jumps to the match nearest to the caret. */
  _search(move = false) {
    const q = this.sFind.value, v = this.ta.value;
    this._matches = [];
    this.sFind.classList.remove('is-invalid');
    if (q) {
      let re = null;
      try { re = this._regex(q); } catch { this.sFind.classList.add('is-invalid'); }
      if (re) {
        let m, guard = 0;
        while ((m = re.exec(v)) && this._matches.length < 10000 && guard++ < 200000) {
          if (!m[0].length) { re.lastIndex++; continue; }
          this._matches.push({ start: m.index, end: m.index + m[0].length });
        }
      }
    }
    const caret = this.ta.selectionStart;
    this._matchIndex = this._matches.length ? Math.max(0, lowerBound(this._matches, caret)) % this._matches.length : -1;
    this._paintCount();
    if (move && this._matchIndex >= 0) this._goto(this._matchIndex); else this._render();
    if (this._matchIndex >= 0 && !move) this._reveal(this._matches[this._matchIndex].start);
  },
  _paintCount() {
    const n = this._matches.length;
    this.sCount.textContent = this.sFind.classList.contains('is-invalid') ? this.t('codeeditor.invalidRegex')
      : !this.sFind.value ? '' : n ? this.t('codeeditor.results', { index: this._matchIndex + 1, count: n }) : this.t('codeeditor.noResults');
    this.sCount.classList.toggle('is-empty', !!this.sFind.value && !n);
  },
  _goto(i) {
    const n = this._matches.length;
    if (!n) return;
    this._matchIndex = (i + n) % n;
    const m = this._matches[this._matchIndex];
    this.ta.setSelectionRange(m.start, m.end);
    this._activeLine = this._lineOf(m.start);
    this._paintCount();
    this._reveal(m.start);
    this._render();
  },
  findNext() {
    if (this.searchEl.hidden) return this.openSearch(false);
    if (!this._matches.length) this._search(false);
    const cur = this._matches[this._matchIndex], caret = this.ta.selectionEnd;
    const sel = cur && this.ta.selectionStart === cur.start && this.ta.selectionEnd === cur.end;
    this._goto(sel ? this._matchIndex + 1 : lowerBound(this._matches, caret));
  },
  findPrev() {
    if (this.searchEl.hidden) return this.openSearch(false);
    if (!this._matches.length) this._search(false);
    const cur = this._matches[this._matchIndex];
    const sel = cur && this.ta.selectionStart === cur.start && this.ta.selectionEnd === cur.end;
    this._goto(sel ? this._matchIndex - 1 : lowerBound(this._matches, this.ta.selectionStart) - 1);
  },
  /** find(query, { regex, case, word }) -> number of matches (opens the panel). */
  find(query, opts = {}) {
    Object.assign(this._opt, { case: !!opts.case, regex: !!opts.regex, word: !!opts.word });
    [[this.sCase, 'case'], [this.sRe, 'regex'], [this.sWord, 'word']].forEach(([b, k]) => b.setAttribute('aria-pressed', String(this._opt[k])));
    this.searchEl.hidden = false;
    this.sFind.value = query;
    this._search(true);
    return this._matches.length;
  },
  _replacement(m) {
    const repl = this.sRepl.value;
    if (!this._opt.regex) return repl;
    const re = this._regex(this.sFind.value);
    re.lastIndex = m.start;
    const mm = re.exec(this.ta.value);
    return mm && mm.index === m.start ? mm[0].replace(new RegExp(re.source, re.flags.replace('g', '')), repl) : repl;
  },
  replaceCurrent() {
    if (this.readonly || this.isDisabled) return;
    if (!this._matches.length) this._search(false);
    const m = this._matches[this._matchIndex];
    if (!m) return;
    const r = this._replacement(m);
    this._edit(m.start, m.end, r, m.start + r.length);
    this._search(false);
    const next = lowerBound(this._matches, m.start + r.length);
    if (this._matches.length) this._goto(next);
    this.sRepl.focus();
  },
  /** replaceAll(query?, replacement?, opts?) -> count */
  replaceAll(query, replacement, opts) {
    if (this.readonly || this.isDisabled) return 0;
    if (query != null) { this.find(query, opts); this.sRepl.value = replacement ?? ''; }
    const q = this.sFind.value;
    if (!q) return 0;
    let re;
    try { re = this._regex(q); } catch { return 0; }
    const repl = this.sRepl.value, v = this.ta.value;
    const count = (v.match(re) || []).filter(Boolean).length;
    re.lastIndex = 0;
    const out = v.replace(re, this._opt.regex ? repl : () => repl);
    if (count) this._edit(0, this.ta.value.length, out, Math.min(this.ta.selectionStart, out.length));
    this._search(false);
    announce(this.t('codeeditor.replaced', { count }));
    return count;
  },
});

define('o-code-editor', OCodeEditor);
