/* <o-editor value placeholder label max-length mentions upload-image> — the rich text editor custom element.
 * Wires the schema/selection/command/markdown/paste-cleaning engine (00-dom.js, 10-markdown.js, 20-clean.js,
 * 30-commands.js) into a working, accessible, form-associated widget. Toolbar UI lives in 50-toolbar.js
 * (same folder scope) which also calls define('o-editor', OEditor).
 */

i18n.add('en', { editor: { rows: 'Rows', cols: 'Columns', toolbar: 'Formatting', moreTools: 'More tools', wordCount: 'Word count', dropImage: 'Drop image to insert' } });

const ED_INLINE_RULES = [
  { re: /()\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, tag: 'strong' },
  { re: /()~~([^~\s](?:[^~]*[^~\s])?)~~$/, tag: 's' },
  { re: /(^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*$/, tag: 'em' },
  { re: /(^|[^_\w])_([^_\s](?:[^_]*[^_\s])?)_$/, tag: 'em' },
  { re: /()`([^`\s](?:[^`]*[^`\s])?)`$/, tag: 'code' },
];
const ED_BLOCK_RULE = /^(#{1,4}|-|\*|\d{1,9}[.)]|>|\[[ xX]?\]|`{3}) $/;
const ED_MAX_HISTORY = 300;
const ED_MERGE_MS = 700;

function isEmptyBlockText(block, r) {
  const rr = doc.createRange();
  rr.setStart(block, 0);
  try { rr.setEnd(r.startContainer, r.startOffset); } catch { return false; }
  return !rr.toString().slice(0, -1).trim();
}

class OEditor extends FormElement {
  static props = {
    ...FormElement.props,
    value: { type: String, default: '' },
    placeholder: String,
    label: String,
    toolbar: { type: Any, attr: false, default: null },
    maxLength: Number,
    mentions: { type: Any, attr: false, default: null },
    uploadImage: { type: Function, attr: false },
    spellcheck: { type: Boolean, default: true },
    autofocus: { type: Boolean },
    texts: Object,
  };

  setup() {
    this.classList.add('o-editor');
    const hasValue = Object.prototype.hasOwnProperty.call(this._p, 'value') || this.hasAttribute('value');
    const initialHTML = hasValue ? '' : this.innerHTML;
    this.replaceChildren();
    if (!hasValue && initialHTML.trim()) this._p.value = initialHTML;

    this._uid = uid('editor');
    this._hist = { stack: [{ html: '', sel: null }], i: 0, kind: '', t: 0 };
    this._composing = false;
    this._focused = false;
    this._fullscreen = false;
    this._lastEmitted = '';
    this._slashPop = null;
    this._slashActive = false;

    this.root = h('div', {
      class: 'o-editor-content o-prose', contenteditable: 'true', role: 'textbox', spellcheck: 'true',
      'aria-multiline': 'true', 'aria-label': this.label || t('editor.label'),
    });
    this.contentEl = this.root;
    this.focusTarget = this.root;

    this.toolbarEl = h('div', { class: 'o-editor-toolbar', role: 'toolbar', 'aria-label': t('editor.toolbar') });
    this.bubbleEl = h('div', { class: 'o-editor-bubble o-floating', role: 'toolbar', 'aria-label': t('editor.toolbar'), hidden: true });
    this.footerEl = h('div', { class: 'o-editor-footer' });
    this.wrapEl = h('div', { class: 'o-editor-body' }, this.root);
    this.hintEl = h('div', { class: 'o-sr-only', id: this._uid + '-hint' }, t('editor.slashHint'));
    this.append(this.toolbarEl, this.wrapEl, this.footerEl, this.hintEl);
    this.root.setAttribute('aria-describedby', this.hintEl.id);

    this.fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true, tabindex: '-1', 'aria-hidden': 'true' });
    this.append(this.fileInput);
    on(this.fileInput, 'change', () => { const f = this.fileInput.files[0]; if (f) this._uploadAndInsert(f); this.fileInput.value = ''; });

    this._changeLater = debounce(() => this._emitChange(), 400);
    this._countLater = rafThrottle(() => this._paintCounts());

    on(this.root, 'beforeinput', e => this._onBeforeInput(e));
    on(this.root, 'input', e => this._onInput(e));
    on(this.root, 'compositionstart', () => { this._composing = true; this.classList.add('is-composing'); });
    on(this.root, 'compositionend', () => { this._composing = false; this.classList.remove('is-composing'); this._onInput({ inputType: 'insertCompositionText' }); });
    on(this.root, 'keydown', e => this._onKeydown(e));
    on(this.root, 'paste', e => this._onPaste(e));
    on(this.root, 'drop', e => this._onDrop(e));
    on(this.root, 'dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    on(this.root, 'focus', () => { this._focused = true; this.classList.add('is-focused'); this.emit('focus'); });
    on(this.root, 'blur', () => { this._focused = false; this.classList.remove('is-focused'); this._hideBubble(); this._deselectImage(); this._changeLater.flush(); this.emit('blur'); });
    on(this.root, 'click', e => this._onClick(e));
    on(this.root, 'keyup mouseup', () => this._paintToolbarState());

    this._buildToolbar();
    if (this._readyQueue) { const q = this._readyQueue; this._readyQueue = null; q.forEach(fn => { try { fn(); } catch (e) { console.error('[Orion] <o-editor> queued call failed:', e); } }); }
  }

  connected() {
    this.listen(doc, 'selectionchange', () => this._onSelectionChange());
    if (this.autofocus && !this.__autofocused) { this.__autofocused = true; queueMicrotask(() => this.isConnected && this.focus()); }
  }
  disconnected() { this._changeLater.flush(); this._closeSlash(); this._hideBubble(); }

  update(changed) {
    if (changed.has('init')) { this._loadHTML(this.value); }
    else if (changed.has('value')) { const cur = serializeHTML(this.root); if (this.value !== cur) this._loadHTML(this.value); }
    if (changed.has('placeholder') || changed.has('init') || changed.has('locale')) this.root.dataset.ph = this.placeholder || this.t('editor.placeholder');
    if (changed.has('label') || changed.has('init') || changed.has('locale')) this.root.setAttribute('aria-label', this.label || this.t('editor.label'));
    if (changed.has('spellcheck') || changed.has('init')) this.root.spellcheck = this.spellcheck !== false;
    if (changed.has('disabled') || changed.has('readonly') || changed.has('init')) {
      const ro = this.isDisabled || this.readonly;
      this.root.contentEditable = ro ? 'false' : 'true';
      this.root.setAttribute('aria-readonly', String(!!ro));
      this.classList.toggle('is-disabled', !!this.isDisabled);
      this.classList.toggle('is-readonly', !!this.readonly);
      this._setToolbarDisabled(ro);
    }
    if (changed.has('mentions') || changed.has('init')) this._setupMentions();
    if (changed.has('toolbar') || changed.has('init') || changed.has('locale') || changed.has('texts')) this._buildToolbar();
    if (changed.has('maxLength') || changed.has('init') || changed.has('locale')) this._paintCounts();
    this._paintToolbarState();
  }

  /* ── loading / serialising ─────────────────────────────────────────── */
  _loadHTML(html) {
    const box = parseHTML(html || '');
    normalizeTree(box, { keepColors: true, dirAuto: false });
    this.root.replaceChildren(...box.childNodes);
    if (!this.root.childNodes.length) this.root.append(h('p', {}, h('br')));
    this.root.querySelectorAll('pre').forEach(pre => this._highlightBlock(pre));
    this._hist = { stack: [{ html: this.root.innerHTML, sel: null }], i: 0, kind: '', t: 0 };
    this._paintCounts();
  }
  _highlightBlock(pre) {
    if (!O.highlightElement) return;
    const lang = pre.getAttribute('data-lang') || 'plaintext';
    O.highlightElement(pre, lang);
  }
  /** Re-highlight the code block the caret is currently in, preserving the caret offset. */
  _highlightNearCaret() {
    if (!O.highlightElement) return;
    const r = this.range();
    const pre = r && closestIn(r.startContainer, 'pre', this.root);
    if (!pre) return;
    const off = this._textOffsetIn(pre, r.startContainer, r.startOffset);
    this._highlightBlock(pre);
    this._caretAtOffset(pre, off);
  }
  _textOffsetIn(root, node, offset) {
    const r = doc.createRange();
    r.selectNodeContents(root);
    try { r.setEnd(node, offset); } catch { return 0; }
    return r.toString().length;
  }
  _caretAtOffset(root, target) {
    const w = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n, acc = 0;
    while ((n = w.nextNode())) { const len = n.data.length; if (acc + len >= target) return caretAt(n, target - acc); acc += len; }
    caretIn(root, true);
  }

  /* ── selection / commands ────────────────────────────────────────── */
  range() { return this.root ? selRange(this.root) : null; }
  /** exec(name, value) — run a formatting command (see the editor toolbar for the full list). */
  exec(name, value) {
    const fn = EDITOR_COMMANDS[name];
    if (!fn || !this.root) return false;
    if (!this.range() && this._savedRange) { try { setRange(this._savedRange); } catch {} }
    this.root.focus({ preventScroll: true });
    const ok = fn(this, value);
    if (ok) this._afterEdit('cmd');
    this._paintToolbarState();
    return !!ok;
  }
  isActive(name) {
    const r = this.range();
    if (!r) return false;
    if (MARK_TAGS[name]) return markActive(this.root, r, MARK_TAGS[name]);
    if (name === 'link') return !!linkAt(this.root, r);
    return false;
  }

  /* ── history ─────────────────────────────────────────────────────── */
  _pathTo(node, offset) {
    const path = [];
    let n = node;
    while (n && n !== this.root) { const p = n.parentNode; if (!p) return null; path.unshift(Array.prototype.indexOf.call(p.childNodes, n)); n = p; }
    return n === this.root ? { path, offset } : null;
  }
  _nodeAt(path) { let n = this.root; for (const i of path) { if (!n || !n.childNodes) return null; n = n.childNodes[i]; } return n || null; }
  _captureSel() {
    const r = this.range();
    if (!r) return null;
    const s = this._pathTo(r.startContainer, r.startOffset), e = this._pathTo(r.endContainer, r.endOffset);
    return s && e ? { s, e } : null;
  }
  _restoreSel(sel) {
    if (!sel) return;
    const sn = this._nodeAt(sel.s.path), en = this._nodeAt(sel.e.path);
    if (!sn || !en) return;
    try {
      const r = doc.createRange();
      r.setStart(sn, Math.min(sel.s.offset, sn.nodeType === 3 ? sn.length : sn.childNodes.length));
      r.setEnd(en, Math.min(sel.e.offset, en.nodeType === 3 ? en.length : en.childNodes.length));
      setRange(r);
    } catch {}
  }
  _record(kind) {
    const H = this._hist, htmlNow = this.root.innerHTML, sel = this._captureSel(), now = Date.now();
    const cur = H.stack[H.i];
    if (cur && cur.html === htmlNow) { cur.sel = sel; return; }
    const merge = (kind === 'type' || kind === 'delete') && H.kind === kind && now - H.t < ED_MERGE_MS && H.i === H.stack.length - 1 && H.i > 0;
    if (merge) H.stack[H.i] = { html: htmlNow, sel };
    else { H.stack.splice(H.i + 1); H.stack.push({ html: htmlNow, sel }); if (H.stack.length > ED_MAX_HISTORY) H.stack.shift(); H.i = H.stack.length - 1; }
    H.kind = kind; H.t = now;
  }
  /** undo() -> boolean */
  undo() { const H = this._hist; if (H.i <= 0) return false; H.i--; H.kind = ''; this._restore(H.stack[H.i]); return true; }
  /** redo() -> boolean */
  redo() { const H = this._hist; if (H.i >= H.stack.length - 1) return false; H.i++; H.kind = ''; this._restore(H.stack[H.i]); return true; }
  get canUndo() { return this._hist.i > 0; }
  get canRedo() { return this._hist.i < this._hist.stack.length - 1; }
  _restore(step) {
    this.root.innerHTML = step.html;
    if (!this.root.childNodes.length) this.root.append(h('p', {}, h('br')));
    this.root.focus({ preventScroll: true });
    this._restoreSel(step.sel);
    this._afterEdit('history', { record: false });
  }

  /* ── change plumbing (o-input immediate, o-change debounced) ────────── */
  _afterEdit(kind = 'edit', { record = true } = {}) {
    this._enforceMaxLength();
    if (record) this._record(kind);
    const html = serializeHTML(this.root);
    this.setValue(html, { inputOnly: true });
    this.emit('input', { value: html });
    this._changeLater();
    this._countLater();
  }
  /** Truncate trailing text so the plain-text length never exceeds `maxLength` (typing, paste, commands). */
  _enforceMaxLength() {
    if (!this.maxLength) return;
    const { chars } = countText(serializeText(this.root));
    let over = chars - this.maxLength;
    if (over <= 0) return;
    const w = doc.createTreeWalker(this.root, NodeFilter.SHOW_TEXT);
    const texts = [];
    for (let n = w.nextNode(); n; n = w.nextNode()) texts.push(n);
    for (let i = texts.length - 1; i >= 0 && over > 0; i--) {
      const t = texts[i], take = Math.min(over, t.data.length);
      if (!take) continue;
      t.data = t.data.slice(0, t.data.length - take);
      over -= take;
    }
    caretIn(this.root.lastElementChild || this.root, true);
    announce(this.t('editor.limit'));
  }
  _emitChange() {
    const v = this.value;
    if (v === this._lastEmitted) return;
    this._lastEmitted = v;
    this.dispatchEvent(new Event('change', { bubbles: true }));
    this.emit('change', { value: v });
  }
  isEmpty() { return !this.value; }
  getValidity() { return null; }

  /* ── native editing: input / beforeinput / keydown ──────────────────── */
  _onBeforeInput(e) {
    if (this.isDisabled || this.readonly) { e.preventDefault(); return; }
    if (this.maxLength && /^insert/.test(e.inputType || '') && e.inputType !== 'insertReplacementText') {
      const { chars } = countText(serializeText(this.root));
      if (chars >= this.maxLength && (this.range() || {}).collapsed !== false) { e.preventDefault(); announce(this.t('editor.limit')); }
    }
  }
  _onInput(e) {
    if (this._composing) return;
    const kind = /^delete/.test(e.inputType || '') ? 'delete' : e.inputType === 'insertText' ? 'type' : 'edit';
    const r0 = this.range();
    const m = r0 ? markSel(r0) : null;
    normalizeTree(this.root, { keepColors: true, dirAuto: false });
    restoreSel(m);
    // Run shortcut detection (which may further mutate the DOM) BEFORE syncing `value`/history:
    // `_afterEdit` sets `this.value`, which schedules an async `update()` that reconciles the DOM
    // from `this.value` if they differ — if that ran first, a later synchronous DOM mutation here
    // (e.g. a markdown shortcut) would be invisible to it and get clobbered by that stale reload.
    this._updateSlash();
    let finalKind = kind;
    if (!this._slashActive && this._detectMarkdownShortcut(e)) finalKind = 'shortcut';
    this._afterEdit(finalKind);
    this._highlightNearCaret();
  }
  _onKeydown(e) {
    if (this._slashPop && this._slashKey(e)) return;
    const k = e.key, mod = modOf(e), ro = this.isDisabled || this.readonly;
    if (k === 'Escape') {
      if (this._fullscreen) { e.preventDefault(); this.toggleFullscreen(false); return; }
      this._hideBubble();
      return;
    }
    if (mod && !e.altKey) {
      const lk = k.toLowerCase();
      if (lk === 'z' && !ro) { e.preventDefault(); return void (e.shiftKey ? this.redo() : this.undo()); }
      if (lk === 'y' && !ro) { e.preventDefault(); return void this.redo(); }
      if (ro) return;
      if (lk === 'b') { e.preventDefault(); return void this.exec('bold'); }
      if (lk === 'i') { e.preventDefault(); return void this.exec('italic'); }
      if (lk === 'u') { e.preventDefault(); return void this.exec('underline'); }
      if (lk === 'k') { e.preventDefault(); return void this._openLinkPopover(); }
      if (e.shiftKey && lk === 'x') { e.preventDefault(); return void this.exec('strike'); }
      if (e.shiftKey && k === '7') { e.preventDefault(); return void this.exec('orderedList'); }
      if (e.shiftKey && k === '8') { e.preventDefault(); return void this.exec('bulletList'); }
      return;
    }
    if (ro) return;
    if (k === 'Tab') {
      const r = this.range();
      if (r && cellInfo(this.root, r.startContainer)) { e.preventDefault(); moveCell(this, e.shiftKey ? -1 : 1); return; }
      if (this.exec(e.shiftKey ? 'outdent' : 'indent')) e.preventDefault();
      return;
    }
    if (k === 'Enter' && !e.shiftKey) {
      const r = this.range();
      const pre = r && closestIn(r.startContainer, 'pre', this.root);
      if (pre && r.collapsed) { e.preventDefault(); this._insertPlain('\n'); return; }
      const li = r && textBlockOf(r.startContainer, this.root);
      if (li && li.nodeName === 'LI' && isEmptyBlock(li) && !closestIn(li, 'ul,ol', this.root)?.parentElement) { /* fallthrough to native */ }
      if (li && li.nodeName === 'LI' && isEmptyBlock(li) && r.collapsed) { e.preventDefault(); if (!liftLi(li)) return; this._afterEdit('cmd'); caretIn(this.root.lastElementChild, true); return; }
    }
    if (k === 'Backspace' && !e.shiftKey) {
      const r = this.range();
      const pre = r && closestIn(r.startContainer, 'pre', this.root);
      if (pre && r.collapsed && atStartOf(r.startContainer, r.startOffset, pre)) { /* let native merge with previous block */ }
    }
  }
  _insertPlain(text) {
    const r = this.range();
    if (!r) return;
    r.deleteContents();
    const node = doc.createTextNode(text);
    r.insertNode(node);
    caretAt(node, node.length);
    this._afterEdit('type');
  }

  /* ── markdown shortcuts ──────────────────────────────────────────── */
  _detectMarkdownShortcut(e) {
    const r = this.range();
    if (!r || !r.collapsed) return false;
    const block = textBlockOf(r.startContainer, this.root);
    if (!block || block.nodeName === 'PRE' || closestIn(block, 'pre', this.root)) return false;
    if (e.data === ' ') { if (this._applyBlockShortcut(block, r)) return true; }
    if (e.inputType === 'insertText' && e.data && /[*_`~]/.test(e.data)) return this._applyInlineShortcut(block, r);
    return false;
  }
  _applyBlockShortcut(block, r) {
    const rr = doc.createRange(); rr.setStart(block, 0); rr.setEnd(r.startContainer, r.startOffset);
    const text = rr.toString().replace(/ /g, " ");
    const m = ED_BLOCK_RULE.exec(text);
    if (!m) return false;
    const token = m[1];
    rr.deleteContents();
    fixEmpty(block);
    if (/^#{1,4}$/.test(token)) this.exec('heading', token.length);
    else if (token === '-' || token === '*') this.exec('bulletList');
    else if (/^\d{1,9}[.)]$/.test(token)) this.exec('orderedList');
    else if (token === '>') this.exec('blockquote');
    else if (/^\[[ xX]?\]$/.test(token)) {
      this.exec('checkList');
      if (/x/i.test(token)) { const li = textBlockOf(this.range().startContainer, this.root); if (li) toggleCheck(li, true); }
    } else if (token === '```') this.exec('codeBlock', '');
    return true;
  }
  _applyInlineShortcut(block) {
    const r = this.range();
    const node = r.startContainer;
    if (node.nodeType !== 3) return false;
    const s = node.data.slice(0, r.startOffset);
    for (const { re, tag } of ED_INLINE_RULES) {
      const m = re.exec(s);
      if (!m) continue;
      const realStart = r.startOffset - (s.length - m.index);
      const rr = doc.createRange(); rr.setStart(node, realStart); rr.setEnd(node, r.startOffset);
      rr.deleteContents();
      const frag = doc.createDocumentFragment();
      if (m[1]) frag.append(doc.createTextNode(m[1]));
      const mark = doc.createElement(tag);
      mark.textContent = m[2];
      frag.append(mark);
      rr.insertNode(frag);
      const after = doc.createRange(); after.setStartAfter(mark); after.collapse(true); setRange(after);
      normInline(block);
      return true;
    }
    return false;
  }

  /* ── slash command menu ──────────────────────────────────────────── */
  _updateSlash() {
    const r = this.range();
    if (!r || !r.collapsed || this._composing) return this._closeSlash();
    const block = textBlockOf(r.startContainer, this.root);
    if (!block || block.nodeName === 'PRE') return this._closeSlash();
    const rr = doc.createRange(); rr.setStart(block, 0); rr.setEnd(r.startContainer, r.startOffset);
    const text = rr.toString();
    const m = /(?:^|\s)\/([^\s/]{0,24})$/.exec(text);
    const atStart = m && !text.slice(0, m.index).trim();
    if (!m || !atStart) return this._closeSlash();
    const q = m[1];
    if (!this._slashPop || this._slashBlock !== block) { this._slashBlock = block; this._openSlashMenu(q); }
    else if (q !== this._slashQuery) this._openSlashMenu(q);
  }
  _slashItems(query) {
    const S = k => this.t('editor.slash.' + k);
    const all = [
      { id: 'text', label: S('text'), hint: S('textDesc'), icon: 'pilcrow' },
      { id: 'h1', label: S('h1'), hint: S('h1Desc'), icon: 'heading' },
      { id: 'h2', label: S('h2'), hint: S('h2Desc'), icon: 'heading' },
      { id: 'h3', label: S('h3'), hint: S('h3Desc'), icon: 'heading' },
      { id: 'ul', label: S('ul'), hint: S('ulDesc'), icon: 'list' },
      { id: 'ol', label: S('ol'), hint: S('olDesc'), icon: 'list-ordered' },
      { id: 'check', label: S('check'), hint: S('checkDesc'), icon: 'list-checks' },
      { id: 'quote', label: S('quote'), hint: S('quoteDesc'), icon: 'quote' },
      { id: 'code', label: S('code'), hint: S('codeDesc'), icon: 'code-block' },
      { id: 'table', label: S('table'), hint: S('tableDesc'), icon: 'table' },
      { id: 'image', label: S('image'), hint: S('imageDesc'), icon: 'image' },
      { id: 'hr', label: S('hr'), hint: S('hrDesc'), icon: 'separator' },
      { id: 'emoji', label: S('emoji'), hint: S('emojiDesc'), icon: 'smile' },
    ];
    const list = query ? fuzzySearch(all, query, x => x.label) : all;
    return list.map(it => ({ ...it, icon: edIconEl(it.icon) }));
  }
  _openSlashMenu(query) {
    this._slashQuery = query;
    this._slashList = this._slashItems(query);
    const r = this.range();
    const rect = r ? O.editorKit.rangeRect(r) : null;
    const block = this._slashBlock;
    this._slashIndex = 0;
    this._slashPop?.close('refresh');
    const anchor = { getBoundingClientRect: () => rect || (block && block.getBoundingClientRect()) || this.root.getBoundingClientRect() };
    const list = h('div', { class: 'o-ek-menu', id: this._uid + '-slash', role: 'listbox' });
    this._slashList.forEach((it, i) => {
      const b = h('div', { class: 'o-ek-item', role: 'option', 'data-i': i, id: this._uid + '-slash-' + i },
        it.icon, h('span', { class: 'o-ek-label' }, it.label), h('span', { class: 'o-ek-hint' }, it.hint));
      list.append(b);
    });
    if (!this._slashList.length) list.append(h('div', { class: 'o-mentions-status' }, t('common.noResults')));
    on(list, 'mousedown', e => e.preventDefault());
    on(list, 'click', '.o-ek-item', (e, b) => { const it = this._slashList[+b.dataset.i]; this._closeSlash(); this._runSlash(it); });
    on(list, 'mousemove', '.o-ek-item', (e, b) => { this._slashIndex = +b.dataset.i; this._paintSlash(list); });
    this._slashActive = true;
    this.root.setAttribute('aria-expanded', 'true');
    this.root.setAttribute('aria-controls', list.id);
    this._slashPop = O.editorKit.popover(anchor, list, {
      role: 'listbox', label: t('editor.slashHint'), placement: 'bottom-start', returnFocus: false,
      onClose: () => { this._slashPop = null; this._slashActive = false; this.root.removeAttribute('aria-expanded'); this.root.removeAttribute('aria-controls'); this.root.removeAttribute('aria-activedescendant'); },
    });
    this._slashPop.el.classList.add('o-editor-slash');
    this._paintSlash(list);
  }
  _paintSlash(container) {
    const root = container || (this._slashPop && this._slashPop.el);
    const items = root ? [...root.querySelectorAll('.o-ek-item')] : [];
    items.forEach((el, i) => { const on2 = i === this._slashIndex; el.classList.toggle('is-active', on2); if (on2) { this.root.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); } });
  }
  _slashKey(e) {
    const n = this._slashList ? this._slashList.length : 0;
    if (e.key === 'ArrowDown') { e.preventDefault(); this._slashIndex = (this._slashIndex + 1) % Math.max(1, n); this._paintSlash(); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); this._slashIndex = (this._slashIndex - 1 + Math.max(1, n)) % Math.max(1, n); this._paintSlash(); return true; }
    if ((e.key === 'Enter' || e.key === 'Tab') && n) { e.preventDefault(); const it = this._slashList[this._slashIndex]; this._closeSlash(); this._runSlash(it); return true; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this._closeSlash(); return true; }
    return false;
  }
  _closeSlash() { if (this._slashPop) this._slashPop.close('api'); this._slashPop = null; this._slashBlock = null; this._slashActive = false; }
  _runSlash(it) {
    if (!it) return;
    const block = this._slashBlock;
    const r = this.range();
    if (block && r) { const rr = doc.createRange(); rr.setStart(block, 0); rr.setEnd(r.startContainer, r.startOffset); rr.deleteContents(); fixEmpty(block); caretIn(block); }
    this.root.focus({ preventScroll: true });
    switch (it.id) {
      case 'h1': case 'h2': case 'h3': this.exec('heading', +it.id[1]); break;
      case 'ul': this.exec('bulletList'); break;
      case 'ol': this.exec('orderedList'); break;
      case 'check': this.exec('checkList'); break;
      case 'quote': this.exec('blockquote'); break;
      case 'code': this.exec('codeBlock', ''); break;
      case 'table': this.exec('table', { rows: 3, cols: 3 }); break;
      case 'hr': this.exec('hr'); break;
      case 'image': this._afterEdit('cmd'); this._openImagePopover(this.toolbarEl.querySelector('[data-cmd="image"]') || this.root); break;
      case 'emoji': this._afterEdit('cmd'); this._openEmojiPicker(this.toolbarEl.querySelector('[data-cmd="emoji"]') || this.root); break;
      default: this._afterEdit('cmd');
    }
  }

  /* ── mentions ────────────────────────────────────────────────────── */
  _setupMentions() {
    this._mentionsCtl?.destroy();
    this._mentionsCtl = null;
    if (!O.mentions) return;
    const cfg = this.mentions;
    let opts = null;
    if (Array.isArray(cfg)) opts = { source: cfg };
    else if (isFn(cfg)) opts = { source: cfg };
    else if (isObj(cfg)) opts = { ...cfg };
    const triggers = { ...(opts && opts.triggers), ':': (opts && opts.triggers && opts.triggers[':']) || { source: O.mentions.emoji.source, minChars: 1 } };
    if (opts && !opts.triggers && opts.source) triggers['@'] = { source: opts.source };
    if (!opts) return;
    this._mentionsCtl = O.mentions(this, { ...opts, triggers });
  }
  /** Mentions currently present in the document: [{ id, label, trigger }] */
  getMentions() { return this._mentionsCtl ? this._mentionsCtl.getMentions() : []; }

  /* ── click handling (links / images) ────────────────────────────── */
  _onClick(e) {
    const img = e.target.closest && e.target.closest('img');
    if (img && this.root.contains(img)) { this._selectImage(img); return; }
    this._deselectImage();
    const li = e.target.closest && e.target.closest('li');
    if (li && this.root.contains(li) && li.parentElement && li.parentElement.getAttribute('data-type') === 'check') {
      const r = li.getBoundingClientRect();
      const edge = isRTL(li) ? r.right - e.clientX : e.clientX - r.left;
      if (edge >= -4 && edge <= 28) {
        e.preventDefault();
        toggleCheck(li);
        this._afterEdit('cmd');
        announce(this.t('editor.' + (li.getAttribute('data-checked') === 'true' ? 'checked' : 'unchecked')));
        return;
      }
    }
    const a = e.target.closest && e.target.closest('a[href]');
    if (a && this.root.contains(a) && (e.metaKey || e.ctrlKey)) { win.open(a.href, '_blank', 'noopener'); }
  }

  /* ── counts ──────────────────────────────────────────────────────── */
  _paintCounts() {
    if (!this.isConnected) return;
    const { words, chars } = countText(serializeText(this.root));
    const parts = [];
    if (this.maxLength) parts.push(this.t('editor.charsMax', { count: chars, max: this.maxLength }));
    else parts.push(this.t('editor.words', { count: words }), this.t('editor.chars', { count: chars }));
    this.footerEl.innerHTML = String(html`<span class="o-editor-count${this.maxLength && chars >= this.maxLength ? ' is-limit' : ''}">${parts.join(' · ')}</span>`);
    this.footerEl.hidden = false;
  }

  /* ── public API ──────────────────────────────────────────────────── */
  /** insertHTML(html) — sanitise, normalise and insert at the caret. */
  insertHTML(html) {
    this._whenReady(() => {
      this.root.focus({ preventScroll: true });
      const box = parseHTML(html);
      normalizeTree(box, { keepColors: true, dirAuto: false, trailing: false });
      this._insertBlocks([...box.childNodes]);
      this._afterEdit('cmd');
    });
  }
  /** insertText(text) — plain text at the caret (newlines become paragraph breaks, or literal inside code blocks). */
  insertText(text) { this._whenReady(() => this._insertTextNow(text)); }
  _insertTextNow(text) {
    const r = this.range();
    if (!r) return;
    if (closestIn(r.startContainer, 'pre', this.root)) { this._insertPlain(String(text)); return; }
    const lines = String(text ?? '').split(/\r\n?|\n/);
    if (lines.length === 1) {
      r.deleteContents();
      const node = doc.createTextNode(lines[0]);
      r.insertNode(node);
      caretAt(node, node.length);
      normInline(textBlockOf(node, this.root) || this.root);
    } else {
      this._insertBlocks(lines.map(l => h('p', {}, l)));
    }
    this._afterEdit('cmd');
  }
  _insertBlocks(nodes) {
    if (!nodes.length) return;
    const root = this.root;
    let r = this.range();
    if (!r) { root.append(...nodes); caretIn(root.lastElementChild, true); return; }
    const b = textBlockOf(r.startContainer, root);
    if (!b) {
      const only = root.children.length === 1 ? root.firstElementChild : null;
      if (only && isTextBlock(only) && only.nodeName !== 'PRE' && isEmptyBlock(only)) {
        const last = nodes[nodes.length - 1];
        only.before(...nodes); only.remove();
        caretIn(isTextBlock(last) ? last : only, true);
        return;
      }
      root.append(...nodes); caretIn(root.lastElementChild, true); return;
    }
    if (isEmptyBlock(b) && b.nodeName !== 'PRE' && nodes.length === 1 && isTextBlock(nodes[0])) { b.replaceWith(nodes[0]); caretIn(nodes[0], true); return; }
    if (isEmptyBlock(b) && b.nodeName !== 'PRE') { const last = nodes[nodes.length - 1]; b.before(...nodes); b.remove(); caretIn(isTextBlock(last) ? last : b, true); return; }
    const tail = b.nodeName !== 'PRE' ? splitBlock(b, r.startContainer, r.startOffset) : null;
    let anchor = b;
    nodes.forEach(n => { anchor.after(n); anchor = n; });
    fixEmpty(b);
    const last = anchor;
    caretIn(isTextBlock(last) ? last : b, true);
  }
  /**
   * Run fn once the element has finished its one-time setup() (its DOM exists). Runs synchronously
   * when already ready. Public methods use this so calling them right after creating/inserting the
   * element (before the browser has upgraded/connected it) queues the call instead of throwing.
   */
  _whenReady(fn) {
    if (this.root) return void fn();
    (this._readyQueue || (this._readyQueue = [])).push(fn);
  }
  /** getMarkdown() -> Markdown string */
  getMarkdown() { return this.root ? markdown.fromHTML(this.root) : ''; }
  /** setMarkdown(md) — replaces the document. */
  setMarkdown(md) { this._whenReady(() => { this._loadHTML(markdown.toHTML(String(md ?? ''), { breaks: false })); this.value = serializeHTML(this.root); }); }
  /** getText() -> plain text */
  getText() { return this.root ? serializeText(this.root) : ''; }
  /** getHTML() -> sanitised HTML (same as .value) */
  getHTML() { return this.value; }
  /** getSelectionText() -> current selection as plain text */
  getSelectionText() { const r = this.root && this.range(); return r ? r.toString() : ''; }
  /** clear() — empties the document. */
  clear() { this._whenReady(() => { this._loadHTML(''); this.setValue('', { inputOnly: true }); this._changeLater(); this._countLater(); }); }
  focus(opts) { this._whenReady(() => { this.root.focus(opts); if (!this.range()) caretIn(this.root.lastElementChild || this.root, true); }); }
  formValue() { return this.value || null; }
}
O.Editor = OEditor;
