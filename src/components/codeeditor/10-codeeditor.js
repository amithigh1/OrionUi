/* <o-code-editor language="json" line-numbers wrap readonly tab-size="2" min-lines max-lines placeholder validate>
 * A <textarea> (native selection, IME, clipboard) under a synchronized, virtualized, highlighted <pre>.
 * Own undo history, auto-indent, bracket/quote pairs, comment toggle, line moves, search & replace, validation.
 */

i18n.add('en', {
  codeeditor: {
    label: 'Code editor, {language}', find: 'Find', replace: 'Replace', replaceOne: 'Replace', replaceAll: 'Replace all',
    matchCase: 'Match case', regex: 'Use regular expression', wholeWord: 'Match whole word', prev: 'Previous match (Shift+Enter)',
    next: 'Next match (Enter)', close: 'Close (Escape)', toggleReplace: 'Toggle replace', noResults: 'No results', results: '{index} of {count}',
    invalidRegex: 'Invalid expression', replaced: { one: 'Replaced {count} occurrence', other: 'Replaced {count} occurrences' },
    position: 'Ln {line}, Col {col}', spaces: 'Spaces: {count}', problems: { one: '{count} problem', other: '{count} problems' },
    errorAt: 'Line {line}, column {column}: {message}', more: '+{count} more', valid: 'No problems',
    tabHint: 'Tab inserts indentation. Press Escape, then Tab, to move focus out of the editor.',
  },
});

const CE_PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
const CE_OPEN = '([{', CE_CLOSE = ')]}';
const IS_MAC = isBrowser && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const modKey = e => (IS_MAC ? e.metaKey : e.ctrlKey);
const VIRTUAL_MIN = 150;

function dedentText(s) {
  s = String(s).replace(/\r\n?/g, '\n').replace(/^\s*\n/, '').replace(/\s+$/, '');
  const lines = s.split('\n');
  const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^[ \t]*/)[0].length));
  return Number.isFinite(ind) && ind > 0 ? lines.map(l => l.slice(ind)).join('\n') : s;
}
function lowerBound(arr, v, key = x => x.start) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (key(arr[m]) < v) lo = m + 1; else hi = m; } return lo; }

class OCodeEditor extends FormElement {
  static props = {
    ...FormElement.props,
    value: { type: String, default: '' },
    language: { type: String, default: 'plaintext', reflect: true },
    lineNumbers: Boolean,
    wrap: { type: Boolean, reflect: true },
    tabSize: { type: Number, default: 2 },
    minLines: { type: Number, default: 3 },
    maxLines: Number,
    placeholder: String,
    label: String,
    validate: Any,
    autoClose: { type: Boolean, default: true },
    statusbar: Boolean,
    texts: Object,
  };

  setup() {
    this.classList.add('o-ce');
    const hasValue = Object.prototype.hasOwnProperty.call(this._p, 'value') || this.hasAttribute('value');
    const src = this.querySelector(':scope > textarea, :scope > template');
    const initial = src ? (src.localName === 'textarea' ? src.value : src.innerHTML) : this.textContent;
    this.replaceChildren();
    if (!hasValue && initial && initial.trim()) this._p.value = dedentText(initial);

    this.searchEl = this._buildSearch();
    this.gutterInner = h('div', { class: 'o-ce-gutter-inner' });
    this.gutter = h('div', { class: 'o-ce-gutter', 'aria-hidden': 'true' }, this.gutterInner);
    this.pre = h('pre', { class: 'o-ce-hl', 'aria-hidden': 'true' });
    this.ta = h('textarea', { class: 'o-ce-input', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', wrap: 'off', 'data-gramm': 'false', 'aria-multiline': 'true' });
    this.body = h('div', { class: 'o-ce-body' }, this.pre, this.ta);
    this.sizer = h('div', { class: 'o-ce-sizer' }, this.gutter, this.body);
    this.scroller = h('div', { class: 'o-ce-scroller o-scroll', dir: 'ltr' }, this.sizer);
    this.problemsEl = h('div', { class: 'o-ce-problems', id: uid('ce-err'), role: 'status', hidden: true });
    this.statusEl = h('div', { class: 'o-ce-status', hidden: true });
    this.hintEl = h('div', { class: 'o-sr-only', id: uid('ce-hint') });
    this.append(this.searchEl, this.scroller, this.problemsEl, this.statusEl, this.hintEl);
    this.ta.setAttribute('aria-describedby', this.hintEl.id);
    this.focusTarget = this.ta;

    this.ta.value = this.value ?? '';
    this._lastChange = this.ta.value;
    this._lines = [''];
    this._starts = [0];
    this._cache = [];
    this._validTo = 0;
    this._errors = [];
    this._errByLine = new Map();
    this._matches = [];
    this._matchIndex = -1;
    this._opt = { case: false, regex: false, word: false };
    this._slots = [];
    this._gslots = [];
    this._hist = { stack: [{ v: this.ta.value, s: 0, e: 0 }], i: 0, t: 0, kind: '' };
    this._textChanged();

    this._renderRaf = rafThrottle(() => this._render());
    this._cursorRaf = rafThrottle(() => this._updateCursor());
    this._changeLater = debounce(() => this._emitChange(), 400);
    this._validateLater = debounce(() => this._runValidate(), 300);
    this._searchLater = debounce(() => { if (!this.searchEl.hidden) this._search(false); }, 120);

    const ta = this.ta;
    on(ta, 'input', e => this._afterChange(e.inputType === 'insertText' && !/\n/.test(e.data || '') ? 'type' : /^delete/.test(e.inputType || '') ? 'delete' : 'edit'));
    on(ta, 'beforeinput', e => {
      if (e.inputType === 'historyUndo') { e.preventDefault(); this.undo(); }
      else if (e.inputType === 'historyRedo') { e.preventDefault(); this.redo(); }
    });
    on(ta, 'keydown', e => this._onKey(e));
    on(ta, 'compositionstart', () => this.classList.add('is-composing'));
    on(ta, 'compositionend', () => { this.classList.remove('is-composing'); this._cursorRaf(); });
    on(ta, 'focus', () => { this.classList.add('is-focused'); this._cursorRaf(); });
    on(ta, 'blur', () => { this.classList.remove('is-focused'); this._escaped = false; this._changeLater.flush(); this._render(); });
    on(ta, 'keyup mouseup select click', () => this._cursorRaf());
    on(ta, 'scroll', () => {
      if (ta.scrollLeft && !this.wrap) { ta.style.width = (ta.scrollWidth + this._cw * 4) + 'px'; }
      if (ta.scrollLeft || ta.scrollTop) { ta.scrollLeft = 0; ta.scrollTop = 0; }
    });
    on(this.scroller, 'scroll', () => this._renderRaf(), { passive: true });
    on(this.scroller, 'mousedown', e => {
      if (e.target === this.scroller || e.target === this.sizer || e.target === this.body) {
        e.preventDefault(); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); this._cursorRaf();
      }
    });
    on(this.gutter, 'mousedown', '.o-ce-ln', (e, ln) => {
      e.preventDefault();
      const i = +ln.dataset.l, start = this._starts[i], end = i + 1 < this._starts.length ? this._starts[i + 1] : ta.value.length;
      ta.focus(); ta.setSelectionRange(e.shiftKey ? Math.min(ta.selectionStart, start) : start, end); this._cursorRaf();
    });
    on(this.problemsEl, 'click', '[data-offset]', (e, b) => { const o = +b.dataset.offset; ta.focus(); ta.setSelectionRange(o, o); this._reveal(o); this._cursorRaf(); });
  }

  connected() {
    this.listen(doc, 'scroll', e => { if (!this.maxLines && this._lines.length > VIRTUAL_MIN && (e.target === doc || (e.target.contains && e.target.contains(this)))) this._renderRaf(); }, { capture: true, passive: true });
    this.listen(doc, 'selectionchange', () => { if (doc.activeElement === this.ta) this._cursorRaf(); });
    this.addCleanup(observeResize(this, () => { this._measure(); this._layout(); this._render(); }));
    this.addCleanup(bus.on('theme', () => requestAnimationFrame(() => { this._measure(); this._layout(); this._render(); })));
  }
  disconnected() { this._changeLater.flush(); }

  update(changed) {
    const ta = this.ta;
    if (changed.size === 1 && changed.has('value') && ta.value === (this.value ?? '')) return;
    let layout = changed.has('init');
    if (changed.has('language') || changed.has('init')) { this._grammar = O.highlight.compiled(this.language); this._cache = []; this._validTo = 0; layout = true; }
    if (changed.has('value') && ta.value !== (this.value ?? '')) {
      ta.value = this.value ?? '';
      this._lastChange = ta.value;
      this._hist = { stack: [{ v: ta.value, s: 0, e: 0 }], i: 0, t: 0, kind: '' };
      this._textChanged();
      layout = true;
      this._validateLater();
      if (!this.searchEl.hidden) this._search(false);
    }
    if (changed.has('tabSize') || changed.has('init')) this.style.setProperty('--o-ce-tab', String(this.tabSize || 2));
    if (['wrap', 'lineNumbers', 'minLines', 'maxLines', 'statusbar'].some(k => changed.has(k))) layout = true;
    this.classList.toggle('is-wrap', !!this.wrap);
    this.classList.toggle('has-gutter', !!this.lineNumbers);
    ta.setAttribute('wrap', this.wrap ? 'soft' : 'off');
    ta.readOnly = !!this.readonly;
    ta.disabled = !!this.isDisabled;
    this.classList.toggle('is-readonly', !!this.readonly);
    this.classList.toggle('is-disabled', !!this.isDisabled);
    if (this.placeholder) ta.placeholder = this.placeholder; else ta.removeAttribute('placeholder');
    const langName = O.highlight.names[O.highlight.resolve(this.language)] || this.language;
    ta.setAttribute('aria-label', this.label || this.t('codeeditor.label', { language: langName }));
    if (changed.has('locale') || changed.has('init') || changed.has('texts')) this._paintSearchTexts();
    this.hintEl.textContent = this.t('codeeditor.tabHint');
    if (changed.has('validate') || changed.has('language')) this._validateLater();
    if (layout) { this._measure(); this._layout(); }
    this._render();
    this._paintStatus();
  }

  /* ── geometry ─────────────────────────────────────────────────────── */
  _measure() {
    if (!this.isConnected) return;
    const cs = getComputedStyle(this.ta);
    this._lh = parseFloat(cs.lineHeight) || 20;
    this._padY = parseFloat(cs.paddingTop) || 0;
    this._padX = parseFloat(cs.paddingRight) || 0;
    const probe = h('span', { class: 'o-ce-probe' }, 'x'.repeat(100));
    this.pre.append(probe);
    this._cw = probe.getBoundingClientRect().width / 100 || 7.8;
    probe.remove();
  }
  _layout() {
    if (!this._lh) return;
    const ta = this.ta, n = this._lines.length, lh = this._lh, py = this._padY;
    this.style.setProperty('--o-ce-digits', String(Math.max(2, String(n).length)));
    const minH = Math.max(1, this.minLines || 1) * lh + py * 2;
    this.scroller.style.minHeight = minH + 'px';
    this.scroller.style.maxHeight = this.maxLines ? (this.maxLines * lh + py * 2 + 2) + 'px' : '';
    ta.style.minHeight = minH + 'px';
    if (this.wrap) {
      ta.style.width = '';
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    } else {
      let max = 0;
      const tab = this.tabSize || 2;
      for (const l of this._lines) {
        let len = l.length;
        if (len > max - 1 && l.includes('\t')) len += (l.split('\t').length - 1) * (tab - 1);
        if (len > max) max = len;
      }
      ta.style.width = Math.ceil(max * this._cw + this._padX * 2 + this._cw * 3) + 'px';
      ta.style.height = (n * lh + py * 2) + 'px';
    }
  }

  /* ── text model & tokens ──────────────────────────────────────────── */
  _textChanged() {
    const old = this._lines || [];
    const lines = this.ta.value.split('\n');
    let a = 0;
    const max = Math.min(old.length, lines.length);
    while (a < max && old[a] === lines[a]) a++;
    let oe = old.length, ne = lines.length;
    while (oe > a && ne > a && old[oe - 1] === lines[ne - 1]) { oe--; ne--; }
    this._cache.splice(a, oe - a, ...new Array(ne - a));
    this._cache.length = lines.length;
    this._validTo = Math.min(this._validTo, a);
    this._lines = lines;
    const starts = new Array(lines.length);
    let off = 0;
    for (let i = 0; i < lines.length; i++) { starts[i] = off; off += lines[i].length + 1; }
    this._starts = starts;
  }
  _ensure(upTo) {
    const c = this._grammar || O.highlight.compiled(this.language);
    const lines = this._lines, cache = this._cache;
    let i = this._validTo;
    let state = i === 0 ? ['root'] : cache[i - 1].end;
    for (; i <= upTo && i < lines.length; i++) {
      const key = state.join('/'), e = cache[i], text = lines[i];
      if (e && e.text === text && e.key === key) { state = e.end; continue; }
      let r;
      if (text.length > 4000) { r = tokenizeLine(c, text.slice(0, 4000), state); r.tokens.push([null, text.slice(4000)]); }
      else r = tokenizeLine(c, text, state);
      cache[i] = { text, key, end: r.state, tokens: r.tokens, html: null };
      state = r.state;
    }
    if (i > this._validTo) this._validTo = i;
  }
  _lineOf(offset) { return Math.max(0, lowerBound(this._starts, offset + 1, x => x) - 1); }

  /* ── rendering ────────────────────────────────────────────────────── */
  _render() {
    if (!this._lh || !this.isConnected) return;
    const n = this._lines.length, lh = this._lh;
    let first = 0, last = n - 1;
    if (!this.wrap && n > VIRTUAL_MIN) {
      const sr = this.scroller.getBoundingClientRect(), br = this.body.getBoundingClientRect();
      const top = Math.max(sr.top, 0) - br.top - this._padY, bot = Math.min(sr.bottom, win.innerHeight) - br.top - this._padY;
      if (bot <= top) { const s = Math.floor(this.scroller.scrollTop / lh); first = clamp(s, 0, n - 1); last = clamp(s + 60, 0, n - 1); }
      else { first = clamp(Math.floor(top / lh) - 10, 0, n - 1); last = clamp(Math.ceil(bot / lh) + 10, 0, n - 1); }
    }
    this._ensure(last);
    const focused = this.classList.contains('is-focused');
    const act = this._activeLine ?? -1, gutter = this.lineNumbers && !this.wrap, numberInLine = this.lineNumbers && this.wrap;
    const count = last - first + 1;
    for (let k = 0; k < count; k++) {
      const i = first + k, e = this._cache[i];
      const decos = this._decosFor(i);
      let htmlLine;
      if (decos.length) htmlLine = renderTokens(e.tokens, decos);
      else { if (e.html == null) e.html = renderTokens(e.tokens); htmlLine = e.html; }
      if (!htmlLine) htmlLine = '<br>';
      const errs = this._errByLine.get(i);
      const cls = 'o-ce-line' + (i === act && focused ? ' is-active' : '') + (errs ? ' is-error' : '');
      let s = this._slots[k];
      if (!s) { s = this._slots[k] = { el: h('div'), html: '', cls: '', n: '' }; this.pre.appendChild(s.el); }
      else if (s.el.parentNode !== this.pre) this.pre.appendChild(s.el);
      if (s.html !== htmlLine) { s.el.innerHTML = htmlLine; s.html = htmlLine; }
      if (s.cls !== cls) { s.el.className = cls; s.cls = cls; }
      const num = numberInLine ? String(i + 1) : '';
      if (s.n !== num) { if (num) s.el.setAttribute('data-n', num); else s.el.removeAttribute('data-n'); s.n = num; }
      if (gutter) {
        let g = this._gslots[k];
        if (!g) { g = this._gslots[k] = { el: h('div', { class: 'o-ce-ln' }), key: '' }; this.gutterInner.appendChild(g.el); }
        const key = i + '|' + (i === act ? 1 : 0) + '|' + (errs ? errs[0].severity : '');
        if (g.key !== key) {
          g.key = key; g.el.textContent = String(i + 1); g.el.dataset.l = String(i);
          g.el.className = 'o-ce-ln' + (i === act ? ' is-active' : '') + (errs ? ' is-' + (errs[0].severity === 'warning' ? 'warning' : 'error') : '');
          if (errs) g.el.title = errs.map(x => x.message).join('\n'); else g.el.removeAttribute('title');
        }
      }
    }
    while (this._slots.length > count) this._slots.pop().el.remove();
    while (this._gslots.length > (gutter ? count : 0)) this._gslots.pop().el.remove();
    const ty = first ? `translateY(${first * lh}px)` : '';
    this.pre.style.transform = ty;
    this.gutterInner.style.transform = ty;
    this.gutter.hidden = !gutter;
    this._range = [first, last];
  }
  _decosFor(i) {
    const d = [];
    const ls = this._starts[i], len = this._lines[i].length, le = ls + len;
    if (this._bm) this._bm.forEach((o, j) => { if (o >= ls && o < le) d.push({ from: o - ls, to: o - ls + 1, cls: 'o-ce-bm' + (this._bm.length === 1 && j === 0 ? ' is-bad' : '') }); });
    const M = this._matches;
    if (M.length) {
      let k = Math.max(0, lowerBound(M, ls) - 1);
      for (; k < M.length && M[k].start <= le; k++) {
        const m = M[k];
        if (m.end <= ls && !(m.start === m.end && m.start === ls)) continue;
        d.push({ from: Math.max(m.start, ls) - ls, to: Math.min(m.end, le) - ls, cls: 'o-ce-match' + (k === this._matchIndex ? ' is-current' : '') });
      }
    }
    const errs = this._errByLine.get(i);
    if (errs) errs.forEach(er => {
      const col = clamp((er.column || 1) - 1, 0, len);
      const rest = this._lines[i].slice(col).match(/^(?:\w+|\S)/);
      d.push({ from: col, to: col + (rest ? rest[0].length : 0), cls: 'o-ce-err' + (er.severity === 'warning' ? ' is-warning' : '') });
    });
    return d;
  }
  _updateCursor() {
    const ta = this.ta, s = ta.selectionStart, e = ta.selectionEnd;
    this._activeLine = this._lineOf(e);
    this._bm = null;
    if (s === e) {
      const v = ta.value;
      let at = -1;
      if (CE_OPEN.includes(v[s - 1] || '\0') || CE_CLOSE.includes(v[s - 1] || '\0')) at = s - 1;
      else if (CE_OPEN.includes(v[s] || '\0') || CE_CLOSE.includes(v[s] || '\0')) at = s;
      if (at >= 0) {
        const ch = v[at], oi = CE_OPEN.indexOf(ch), ci = CE_CLOSE.indexOf(ch);
        const open = oi >= 0 ? ch : CE_OPEN[ci], close = oi >= 0 ? CE_CLOSE[oi] : ch, dir = oi >= 0 ? 1 : -1;
        let depth = 0, j = at, match = -1;
        for (let steps = 0; j >= 0 && j < v.length && steps < 40000; j += dir, steps++) {
          const c = v[j];
          if (c === open) depth += dir; else if (c === close) depth -= dir;
          if (depth === 0) { match = j; break; }
        }
        this._bm = match >= 0 && match !== at ? [at, match] : [at];
      }
    }
    this._render();
    this._paintStatus();
  }
  _paintStatus() {
    if (!this.statusEl) return;
    this.statusEl.hidden = !this.statusbar;
    if (!this.statusbar) return;
    const ta = this.ta, line = this._lineOf(ta.selectionEnd), col = ta.selectionEnd - this._starts[line] + 1;
    const langName = O.highlight.names[O.highlight.resolve(this.language)] || this.language;
    const errs = this._errors.length;
    this.statusEl.innerHTML = String(html`<span>${this.t('codeeditor.position', { line: line + 1, col })}</span><span>${this.t('codeeditor.spaces', { count: this.tabSize })}</span><span>${langName}</span>${errs ? html`<span class="o-ce-status-err">${raw(String(icon('alert-circle')))} ${this.t('codeeditor.problems', { count: errs })}</span>` : ''}`);
  }
  /** Scroll so that the character at offset is visible. */
  _reveal(offset) {
    const line = this._lineOf(offset), col = offset - this._starts[line];
    const lh = this._lh, sc = this.scroller;
    let y = this._padY + line * lh;
    if (this.wrap) { const i = line - (this._range ? this._range[0] : 0); const el = this._slots[i] && this._slots[i].el; if (el) y = el.offsetTop; }
    if (this.maxLines && sc.scrollHeight > sc.clientHeight) {
      if (y < sc.scrollTop + lh) sc.scrollTop = Math.max(0, y - lh * 2);
      else if (y + lh > sc.scrollTop + sc.clientHeight - lh) sc.scrollTop = y + lh * 3 - sc.clientHeight;
    } else {
      const br = this.body.getBoundingClientRect(), abs = br.top + y;
      if (abs < 0 || abs + lh > win.innerHeight) win.scrollBy(0, abs - win.innerHeight / 2);
    }
    if (!this.wrap) {
      const gw = this.lineNumbers ? this.gutter.offsetWidth : 0, x = this._padX + col * this._cw;
      if (x < sc.scrollLeft + this._cw * 2) sc.scrollLeft = Math.max(0, x - this._cw * 8);
      else if (x > sc.scrollLeft + sc.clientWidth - gw - this._cw * 4) sc.scrollLeft = x - sc.clientWidth + gw + this._cw * 12;
    }
    this._renderRaf();
  }

  /* ── editing primitives ───────────────────────────────────────────── */
  /** Replace [start,end) with text as one undoable step and place the selection. */
  _edit(start, end, text, selStart, selEnd, kind = 'edit') {
    if (this.readonly || this.isDisabled) return;
    const ta = this.ta;
    ta.setRangeText(text, start, end, 'end');
    if (selStart != null) ta.setSelectionRange(selStart, selEnd ?? selStart);
    this._afterChange(kind);
    this._reveal(ta.selectionEnd);
  }
  _afterChange(kind, record = true) {
    this._textChanged();
    if (record) this._record(kind);
    this._layout();
    this._updateCursor();
    this.setValue(this.ta.value, { inputOnly: true });
    this.emit('input', { value: this.ta.value });
    this._changeLater();
    this._validateLater();
    this._searchLater();
  }
  _record(kind) {
    const H = this._hist, ta = this.ta, v = ta.value, now = Date.now();
    const snap = { v, s: ta.selectionStart, e: ta.selectionEnd };
    if (H.stack[H.i].v === v) { H.stack[H.i] = snap; return; }
    const merge = (kind === 'type' || kind === 'delete') && H.kind === kind && now - H.t < 800 && H.i === H.stack.length - 1 && H.i > 0;
    if (merge) H.stack[H.i] = snap;
    else { H.stack.splice(H.i + 1); H.stack.push(snap); if (H.stack.length > 400) H.stack.shift(); H.i = H.stack.length - 1; }
    H.kind = kind; H.t = now;
  }
  _restore(snap) {
    const ta = this.ta;
    ta.value = snap.v;
    ta.setSelectionRange(snap.s, snap.e);
    this._afterChange('history', false);
    this._reveal(snap.e);
  }
  undo() { const H = this._hist; if (H.i <= 0) return false; H.i--; H.kind = ''; this._restore(H.stack[H.i]); return true; }
  redo() { const H = this._hist; if (H.i >= H.stack.length - 1) return false; H.i++; H.kind = ''; this._restore(H.stack[H.i]); return true; }
  get canUndo() { return this._hist.i > 0; }
  get canRedo() { return this._hist.i < this._hist.stack.length - 1; }

  _emitChange() {
    const v = this.ta.value;
    if (v === this._lastChange) return;
    this._lastChange = v;
    this.dispatchEvent(new Event('change', { bubbles: true }));
    this.emit('change', { value: v });
  }

  /* ── keyboard ─────────────────────────────────────────────────────── */
  _onKey(e) {
    if (e.isComposing || e.keyCode === 229) return;
    const k = e.key, m = modKey(e), ro = this.readonly || this.isDisabled;
    if (m && !e.altKey) {
      const lk = k.toLowerCase();
      if (lk === 'f' && !e.shiftKey) { e.preventDefault(); return this.openSearch(false); }
      if (lk === 'h') { e.preventDefault(); return this.openSearch(true); }
      if (lk === 'z') { e.preventDefault(); return e.shiftKey ? this.redo() : this.undo(); }
      if (lk === 'y') { e.preventDefault(); return this.redo(); }
      if (lk === 's') { e.preventDefault(); this._changeLater.flush(); this.emit('save', { value: this.ta.value }); return; }
      if (ro) return;
      if (k === '/' || e.code === 'Slash') { e.preventDefault(); return this.toggleComment(); }
      if (lk === 'd') { e.preventDefault(); return this.duplicate(); }
      if (k === ']') { e.preventDefault(); return this.indent(); }
      if (k === '[') { e.preventDefault(); return this.outdent(); }
      return;
    }
    if (k === 'Escape') { if (!this.searchEl.hidden) { e.preventDefault(); this.closeSearch(); } else this._escaped = true; return; }
    if (k === 'F3') { e.preventDefault(); return e.shiftKey ? this.findPrev() : this.findNext(); }
    if (ro) return;
    if (e.altKey && !m && (k === 'ArrowUp' || k === 'ArrowDown')) { e.preventDefault(); return this.moveLines(k === 'ArrowUp' ? -1 : 1); }
    if (k === 'Tab' && !m && !e.altKey) {
      if (this._escaped) { this._escaped = false; return; }
      e.preventDefault();
      return e.shiftKey ? this.outdent() : this._tab();
    }
    this._escaped = false;
    if (k === 'Enter' && !e.altKey) { e.preventDefault(); return this._enter(); }
    if (k === 'Backspace' && !e.altKey && !e.shiftKey) { if (this._backspace()) e.preventDefault(); return; }
    if (k === 'Home' && !e.altKey) { if (this._home(e.shiftKey)) e.preventDefault(); return; }
    if (this.autoClose && k.length === 1 && !e.altKey && this._typeChar(k)) e.preventDefault();
  }
  get _unit() { return ' '.repeat(Math.max(1, this.tabSize || 2)); }
  _lang() { return O.highlight.resolve(this.language); }
  _tab() {
    const ta = this.ta, s = ta.selectionStart, e = ta.selectionEnd;
    if (s !== e && ta.value.slice(s, e).includes('\n')) return this.indent();
    const col = s - this._starts[this._lineOf(s)], size = this.tabSize || 2, n = size - (col % size);
    this._edit(s, e, ' '.repeat(n), s + n);
  }
  _enter() {
    const ta = this.ta, v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    const indent = v.slice(ls, s).match(/^[ \t]*/)[0];
    const before = v.slice(ls, s).replace(/\s+$/, '').slice(-1), after = v[e] || '';
    const lang = this._lang(), unit = this._unit;
    let opens = !!before && '{[('.includes(before);
    if (before === ':' && /^(?:python|yaml)$/.test(lang)) opens = true;
    if (/^(?:html|xml)$/.test(lang) && before === '>') {
      const tag = v.slice(ls, s).match(/<([a-zA-Z][\w:-]*)[^<>]*>\s*$/);
      if (tag && !/\/>\s*$/.test(v.slice(ls, s)) && !/^(?:area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i.test(tag[1])) opens = true;
    }
    const closesNext = (opens && CE_PAIRS[before] === after) || (opens && before === '>' && after === '<' && v[e + 1] === '/');
    if (closesNext) {
      const ins = '\n' + indent + unit + '\n' + indent;
      this._edit(s, e, ins, s + 1 + indent.length + unit.length);
    } else {
      let ind = indent + (opens ? unit : '');
      if (lang === 'python' && /^\s*(?:return|pass|break|continue|raise)\b/.test(v.slice(ls, s))) ind = indent.slice(0, Math.max(0, indent.length - unit.length));
      this._edit(s, e, '\n' + ind, s + 1 + ind.length);
    }
  }
  _backspace() {
    const ta = this.ta, v = ta.value, s = ta.selectionStart;
    if (s !== ta.selectionEnd || s === 0) return false;
    if (this.autoClose && CE_PAIRS[v[s - 1]] && CE_PAIRS[v[s - 1]] === v[s]) { this._edit(s - 1, s + 1, '', s - 1, s - 1, 'delete'); return true; }
    const ls = this._starts[this._lineOf(s)], col = s - ls;
    if (col > 0 && /^ +$/.test(v.slice(ls, s))) {
      const size = this.tabSize || 2, del = ((col - 1) % size) + 1;
      if (del > 1) { this._edit(s - del, s, '', s - del, s - del, 'delete'); return true; }
    }
    return false;
  }
  _home(shift) {
    const ta = this.ta, v = ta.value, p = ta.selectionDirection === 'backward' ? ta.selectionStart : ta.selectionEnd;
    const line = this._lineOf(p), ls = this._starts[line];
    if (this.wrap) return false;
    const first = ls + (this._lines[line].match(/^[ \t]*/)[0].length);
    const to = p === first ? ls : first;
    if (shift) { const anchor = ta.selectionDirection === 'backward' ? ta.selectionEnd : ta.selectionStart; ta.setSelectionRange(Math.min(anchor, to), Math.max(anchor, to), to < anchor ? 'backward' : 'forward'); }
    else ta.setSelectionRange(to, to);
    this._cursorRaf();
    return true;
  }
  _typeChar(ch) {
    const ta = this.ta, v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    const quote = ch === '"' || ch === "'" || ch === '`';
    const prose = /^(?:markdown|plaintext)$/.test(this._lang());
    if ((CE_CLOSE.includes(ch) || quote) && s === e && v[s] === ch && (quote || this._bmSkip(s))) { ta.setSelectionRange(s + 1, s + 1); this._cursorRaf(); return true; }
    const close = CE_PAIRS[ch];
    if (!close) return false;
    if (s !== e) { if (prose && ch === "'") return false; this._edit(s, e, ch + v.slice(s, e) + close, s + 1, e + 1); return true; }
    const prev = v[s - 1] || '', next = v[s] || '';
    if (quote) {
      if (prose || /[\w\\]/.test(prev) || prev === ch || /\w/.test(next)) return false;
      if (ch === '`' && !/^(?:javascript|typescript|markdown|go|bash)$/.test(this._lang())) return false;
    } else if (next && !/[\s)\]},;:.]/.test(next)) return false;
    this._edit(s, e, ch + close, s + 1, s + 1, 'type');
    return true;
  }
  _bmSkip() { return true; }

  /* ── line operations ──────────────────────────────────────────────── */
  _lineRange() {
    const ta = this.ta, s = ta.selectionStart, e = ta.selectionEnd;
    const l1 = this._lineOf(s);
    let l2 = this._lineOf(e);
    if (e > s && l2 > l1 && e === this._starts[l2]) l2--;
    return [l1, l2];
  }
  /** Transform the selected lines with fn(line, index) -> line (one undo step). */
  mapLines(fn) {
    const ta = this.ta, [l1, l2] = this._lineRange(), s0 = ta.selectionStart, e0 = ta.selectionEnd;
    const start = this._starts[l1], end = this._starts[l2] + this._lines[l2].length;
    const oldL = this._lines.slice(l1, l2 + 1), newL = oldL.map((l, i) => fn(l, l1 + i));
    const d1 = newL[0].length - oldL[0].length, total = newL.join('\n').length - oldL.join('\n').length;
    const ns = Math.max(start, s0 + d1), ne = Math.max(ns, e0 + total);
    this._edit(start, end, newL.join('\n'), ns, s0 === e0 ? ns : ne);
  }
  indent() { const u = this._unit, multi = this._lineRange()[0] !== this._lineRange()[1]; this.mapLines(l => (multi && !l.trim() ? l : u + l)); }
  outdent() { const size = this.tabSize || 2; this.mapLines(l => l.replace(new RegExp(`^(?: {1,${size}}|\\t)`), '')); }
  toggleComment() {
    const g = O.highlight.grammar(this.language) || {};
    const lc = g.lineComment, bc = g.blockComment;
    if (lc) {
      const [l1, l2] = this._lineRange();
      const lines = this._lines.slice(l1, l2 + 1), filled = lines.filter(l => l.trim());
      if (!filled.length) return this.mapLines(l => lc + ' ' + l);
      const esc2 = lc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const all = filled.every(l => new RegExp('^\\s*' + esc2).test(l));
      const ind = Math.min(...filled.map(l => l.match(/^\s*/)[0].length));
      this.mapLines(l => (!l.trim() ? l : all ? l.replace(new RegExp('^(\\s*)' + esc2 + ' ?'), '$1') : l.slice(0, ind) + lc + ' ' + l.slice(ind)));
    } else if (bc) {
      const [l1, l2] = this._lineRange(), start = this._starts[l1], end = this._starts[l2] + this._lines[l2].length;
      const text = this.ta.value.slice(start, end), [o, c] = bc;
      const m = text.match(new RegExp('^(\\s*)' + o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' ?([\\s\\S]*?) ?' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s*)$'));
      const out = m ? m[1] + m[2] + m[3] : text.replace(/^(\s*)([\s\S]*?)(\s*)$/, `$1${o} $2 ${c}$3`);
      this._edit(start, end, out, start, start + out.length);
    }
  }
  duplicate() {
    const ta = this.ta, s = ta.selectionStart, e = ta.selectionEnd;
    if (s !== e) { const t2 = ta.value.slice(s, e); this._edit(e, e, t2, e, e + t2.length); return; }
    const line = this._lineOf(s), ls = this._starts[line], text = this._lines[line], le = ls + text.length;
    this._edit(le, le, '\n' + text, s + text.length + 1);
  }
  moveLines(dir) {
    const ta = this.ta, [l1, l2] = this._lineRange(), s0 = ta.selectionStart, e0 = ta.selectionEnd;
    if ((dir < 0 && l1 === 0) || (dir > 0 && l2 >= this._lines.length - 1)) return;
    const block = this._lines.slice(l1, l2 + 1).join('\n');
    if (dir < 0) {
      const other = this._lines[l1 - 1], start = this._starts[l1 - 1], end = this._starts[l2] + this._lines[l2].length;
      this._edit(start, end, block + '\n' + other, s0 - other.length - 1, e0 - other.length - 1);
    } else {
      const other = this._lines[l2 + 1], start = this._starts[l1], end = this._starts[l2 + 1] + other.length;
      this._edit(start, end, other + '\n' + block, s0 + other.length + 1, e0 + other.length + 1);
    }
  }
  /** Pretty-print JSON (no-op for other languages). Returns true when formatted. */
  format() {
    if (this._lang() !== 'json') return false;
    try { const out = JSON.stringify(JSON.parse(this.ta.value), null, this.tabSize || 2); this._edit(0, this.ta.value.length, out, 0, 0); return true; }
    catch { return false; }
  }

  /* ── public API ───────────────────────────────────────────────────── */
  insertText(text) { const ta = this.ta, s = ta.selectionStart, e = ta.selectionEnd; this._edit(s, e, String(text), s + String(text).length); }
  getSelection() { const ta = this.ta; return { start: ta.selectionStart, end: ta.selectionEnd, text: ta.value.slice(ta.selectionStart, ta.selectionEnd) }; }
  setSelection(start, end = start) { const ta = this.ta; ta.setSelectionRange(start, end); this._reveal(end); this._cursorRaf(); }
  gotoLine(line, column = 1) { const i = clamp(line - 1, 0, this._lines.length - 1), o = this._starts[i] + clamp(column - 1, 0, this._lines[i].length); this.ta.focus(); this.setSelection(o); }
  getErrors() { return this._errors.slice(); }
  refresh() { this._measure(); this._layout(); this._render(); }
  async validateNow() { this._validateLater.cancel(); return this._runValidate(); }

  /* ── validation ───────────────────────────────────────────────────── */
  async _runValidate() {
    const ta = this.ta, v = ta.value, val = this.validate, lang = this._lang();
    let fn = isFn(val) ? val : isStr(val) && val && val !== 'false' && val !== 'true' ? getPath(win, val) : null;
    const builtIn = lang === 'json' && val !== false && val !== 'false';
    let errs = [];
    try {
      if (isFn(fn)) errs = (await fn(v, lang)) || [];
      else if (builtIn) errs = validateJSON(v);
    } catch (e) { errs = [{ line: 1, column: 1, message: String((e && e.message) || e), severity: 'error' }]; }
    if (v !== ta.value) return this._errors;
    const n = this._lines.length;
    this._errors = toArr(errs).map(x => {
      const line = clamp(Math.floor(+x.line || 1), 1, n), column = Math.max(1, Math.floor(+x.column || 1));
      return { line, column, message: String(x.message ?? ''), severity: x.severity || 'error', offset: x.offset ?? (this._starts[line - 1] + Math.min(column - 1, this._lines[line - 1].length)) };
    });
    this._errByLine = new Map();
    this._errors.forEach(er => { const k = er.line - 1; if (!this._errByLine.has(k)) this._errByLine.set(k, []); this._errByLine.get(k).push(er); });
    const bad = this._errors.some(x => x.severity === 'error');
    this.toggleAttribute('data-invalid', bad);
    this.classList.toggle('is-invalid', bad);
    if (bad) { ta.setAttribute('aria-invalid', 'true'); ta.setAttribute('aria-describedby', this.problemsEl.id + ' ' + this.hintEl.id); }
    else { ta.removeAttribute('aria-invalid'); ta.setAttribute('aria-describedby', this.hintEl.id); }
    this._paintProblems();
    this._syncForm();
    this._render();
    this._paintStatus();
    this.emit('validate', { errors: this.getErrors(), valid: !bad });
    return this.getErrors();
  }
  getValidity() {
    const e = (this._errors || []).find(x => x.severity === 'error');
    return e ? { flags: { customError: true }, message: this.t('codeeditor.errorAt', e) } : null;
  }
  _paintProblems() {
    const errs = this._errors, el = this.problemsEl;
    el.hidden = !errs.length;
    if (!errs.length) { el.replaceChildren(); return; }
    const first = errs[0];
    el.className = 'o-ce-problems' + (errs.every(x => x.severity === 'warning') ? ' is-warning' : '');
    el.innerHTML = String(html`<button type="button" class="o-ce-problem" data-offset="${first.offset}">${raw(String(icon(first.severity === 'warning' ? 'alert-triangle' : 'alert-circle')))}<span>${this.t('codeeditor.errorAt', first)}</span></button>${errs.length > 1 ? html`<span class="o-ce-more">${this.t('codeeditor.more', { count: errs.length - 1 })}</span>` : ''}`);
  }
}
O.CodeEditor = OCodeEditor;
