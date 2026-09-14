/* ============================================================================
 * <o-assistant context-selector dock width> — resizable, context-aware side panel.
 * Quick actions (Summarize this page, Explain selection, Draft a reply, + custom templates),
 * a free-form prompt box, a streamed Markdown result with Insert / Replace selection / Copy,
 * a short history, and a Ctrl+J toggle shortcut (via Orion.shortcuts when present).
 * Events: o-result, o-error, o-insert.
 * ========================================================================== */
class OAssistant extends OElement {
  static props = {
    contextSelector: { type: Boolean, default: true, attr: 'context-selector' },
    dock: { type: String, default: 'end' },
    width: { type: Number, default: 360 },
    isOpen: { type: Boolean, attr: 'open', reflect: true, default: false },
    context: { type: Function, attr: false },
    provider: { type: Function, attr: false },
    templates: { type: Array, attr: false, default: () => [] },
    title: { type: String, default: '' },
    texts: { type: Object, attr: false },
  };

  setup() {
    this.classList.add('o-assistant');
    this.setAttribute('aria-hidden', 'true');
    this._historyList = [];
    this._streaming = false;
    this._stream = null;
    this._current = null;

    this._handle = h('div', { class: 'o-assistant-handle', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': t('common.settings'), tabindex: '0' });
    const closeBtn = h('button', { type: 'button', class: 'o-btn-close', 'aria-label': t('assistant.close') });
    this._titleEl = h('h2', {}, t('assistant.title'));
    const header = h('header', { class: 'o-assistant-header' }, this._titleEl, closeBtn);

    this._contextLabelEl = h('span', { class: 'o-badge' });
    const refreshCtx = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': t('common.refresh'), title: t('common.refresh') }, iconEl('refresh'));
    const contextRow = h('div', { class: 'o-assistant-context' }, this._contextLabelEl, refreshCtx);

    this._actionsRow = h('div', { class: 'o-assistant-actions' });

    this._textarea = h('textarea', { class: 'o-input o-assistant-textarea', placeholder: t('assistant.placeholder'), 'aria-label': t('assistant.placeholder') });
    this._askBtn = h('button', { type: 'submit', class: 'o-btn o-btn-primary o-btn-sm' }, t('assistant.ask'));
    this._form = h('form', { class: 'o-assistant-composer', novalidate: true }, this._textarea, h('div', { style: { textAlign: 'end' } }, this._askBtn));

    this._resultBox = h('div', { class: 'o-assistant-result', hidden: true });
    this._resultActions = h('div', { class: 'o-assistant-result-actions', hidden: true });

    this._historyBox = h('div', { class: 'o-assistant-history' });
    const historySection = h('div', {}, h('h3', { class: 'o-section-title' }, t('assistant.history')), this._historyBox);

    const body = h('div', { class: 'o-assistant-body' }, contextRow, this._actionsRow, this._form, this._resultBox, this._resultActions, historySection);
    this.append(this._handle, h('div', { class: 'o-assistant-panel' }, header, body));
    this.focusTarget = this._textarea;

    on(closeBtn, 'click', () => this.close());
    on(refreshCtx, 'click', () => this._renderContextLabel());
    on(this._form, 'submit', e => {
      e.preventDefault();
      const v = this._textarea.value.trim();
      if (!v) return;
      this._textarea.value = '';
      this._runAction('ask', { prompt: v });
    });
    on(this._resultActions, 'click', '[data-mode]', (e, b) => this._insert(b.dataset.mode));
    on(this._historyBox, 'click', '.o-assistant-history-item', (e, b) => this._loadHistory(+b.dataset.idx));
    on(this, 'keydown', e => { if (e.key === 'Escape') { e.preventDefault(); this.close(); } });
    this._dragHandle();
  }

  connected() {
    const tracker = trackLastFocused(this);
    this._tracker = tracker;
    this.addCleanup(tracker.off);
    if (isFn(O.shortcuts?.add)) {
      this.addCleanup(O.shortcuts.add('ctrl+j', () => this.toggle(), { description: () => this.t('assistant.open'), group: 'General', scope: '*', preventDefault: true }));
    }
  }
  disconnected() { this._stream?.cancel('disconnect'); }

  update(changed) {
    if (changed.has('title') || changed.has('locale') || changed.has('init')) this._titleEl.textContent = this.title || this.t('assistant.title');
    if (changed.has('width') || changed.has('init')) css(this, { '--o-assistant-w': this.width + 'px' });
    if (changed.has('dock') || changed.has('init')) this.classList.toggle('o-assistant-start', this.dock === 'start');
    if (changed.has('isOpen') || changed.has('init')) this._applyOpen();
    if (changed.has('contextSelector') || changed.has('init')) this.querySelector('.o-assistant-context')?.toggleAttribute('hidden', !this.contextSelector);
    if (changed.has('templates') || changed.has('locale') || changed.has('init')) this._renderActions();
  }

  /* ── public API ── */
  open() { if (!this.isOpen) this.isOpen = true; }
  close() { if (this.isOpen) this.isOpen = false; }
  toggle() { this.isOpen ? this.close() : this.open(); }
  focus() { this._textarea?.focus(); }
  stop() { this._stream?.cancel('user-stop'); }
  clearHistory() { this._historyList = []; this._renderHistory(); announce(this.t('assistant.clearHistory')); }
  /** Programmatically ask a question using the current context. */
  ask(prompt) { if (String(prompt || '').trim()) this._runAction('ask', { prompt: String(prompt).trim() }); }

  /* ── internals ── */
  _applyOpen() {
    this.classList.toggle('is-open', this.isOpen);
    this.setAttribute('aria-hidden', String(!this.isOpen));
    // Focus the panel's first control (its close button), not the textarea: focusing a text field collapses
    // any selection the user made on the page before opening — exactly the context "Explain selection" needs.
    if (this.isOpen) { this._renderContextLabel(); nextFrame().then(() => { if (this.isConnected) focusFirst(this.querySelector('.o-assistant-panel')); }); }
  }
  _dragHandle() {
    let startX = 0, startW = 0;
    const onMove = e => {
      const physicalDir = this.dock === 'start' ? 1 : -1;
      const rtlFlip = isRTL(this) ? -1 : 1;
      this.width = clamp(startW + (e.clientX - startX) * physicalDir * rtlFlip, 280, 640);
    };
    const onUp = () => { this._handle.classList.remove('is-active'); doc.removeEventListener('pointermove', onMove); doc.removeEventListener('pointerup', onUp); };
    on(this._handle, 'pointerdown', e => { e.preventDefault(); startX = e.clientX; startW = this.width; this._handle.classList.add('is-active'); doc.addEventListener('pointermove', onMove); doc.addEventListener('pointerup', onUp); });
    on(this._handle, 'keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const dir = (e.key === 'ArrowRight' ? 1 : -1) * (this.dock === 'start' ? 1 : -1);
      this.width = clamp(this.width + dir * 16, 280, 640);
    });
  }
  _renderActions() {
    const builtins = [
      { label: this.t('assistant.summarizePage'), kind: 'summarize-page' },
      { label: this.t('assistant.explainSelection'), kind: 'explain-selection' },
      { label: this.t('assistant.draftReply'), kind: 'draft-reply' },
    ];
    const custom = toArr(this.templates).map(tpl => ({ label: tpl.label, kind: 'custom', build: tpl.build }));
    const all = [...builtins, ...custom];
    this._actionsRow.replaceChildren(...all.map(a => h('button', { type: 'button', class: 'o-btn o-btn-soft-primary o-btn-sm' }, a.label)));
    [...this._actionsRow.children].forEach((btn, i) => {
      const a = all[i];
      on(btn, 'click', () => {
        if (a.kind === 'custom') {
          const prompt = isFn(a.build) ? String(a.build(this._resolveContext()) ?? '') : String(a.build || '');
          this._runAction('custom', { label: a.label, prompt });
        } else this._runAction(a.kind);
      });
    });
  }
  _resolveContext() {
    if (isFn(this.context)) {
      try { const v = this.context(); return isStr(v) ? v : (v && isStr(v.text) ? v.text : v != null ? JSON.stringify(v) : ''); }
      catch (e) { console.error('[Orion] <o-assistant> context() threw:', e); return ''; }
    }
    const sel = currentSelectionText();
    if (sel) return sel;
    const el = this._tracker?.get();
    if (el) return aiSharedTruncate('value' in el ? String(el.value ?? '') : (el.textContent || ''), 6000);
    return '';
  }
  _contextLabel() {
    if (isFn(this.context)) return this.t('assistant.contextPage');
    if (currentSelectionText()) return this.t('assistant.contextSelection');
    return this._tracker?.get() ? this.t('assistant.contextSelection') : this.t('assistant.contextNone');
  }
  _renderContextLabel() { this._contextLabelEl.textContent = this._contextLabel(); }

  async _runAction(kind, opts = {}) {
    if (this._streaming) return;
    const context = opts.context ?? this._resolveContext();
    let system, messages, label, task;
    if (kind === 'summarize-page') {
      label = this.t('assistant.summarizePage');
      const text = aiSharedTruncate((doc.body.innerText || '').replace(/\s+/g, ' '), 8000);
      const built = O.ai.tasks.summarize(text, { length: 'medium' });
      system = built.system; messages = built.messages; task = 'summarize';
    } else if (kind === 'explain-selection') {
      label = this.t('assistant.explainSelection');
      system = 'You explain text simply and clearly for someone unfamiliar with the topic. Reply with the explanation only.';
      messages = [{ role: 'user', content: `Explain the following:\n\n${context || aiSharedTruncate(doc.body.innerText || '', 4000)}` }];
    } else if (kind === 'draft-reply') {
      label = this.t('assistant.draftReply');
      system = 'You draft clear, polite, professional replies based on the given context. Reply with only the draft.';
      messages = [{ role: 'user', content: `Draft a reply to:\n\n${context || this.t('assistant.noContext')}` }];
    } else if (kind === 'custom') {
      label = opts.label;
      system = 'You are a helpful writing and research assistant. Reply concisely.';
      messages = [{ role: 'user', content: String(opts.prompt || '') }];
    } else {
      label = opts.prompt;
      system = 'You are a helpful assistant embedded in an admin dashboard. Use the given context if it is relevant, otherwise answer directly.';
      messages = [{ role: 'user', content: context ? `Context:\n${context}\n\nQuestion: ${opts.prompt}` : opts.prompt }];
    }
    this._start(label, messages, system, task);
  }
  _start(label, messages, system, task) {
    this._streaming = true;
    this._askBtn.disabled = true;
    const entry = { id: uid('h'), label, text: '', ts: Date.now() };
    this._current = entry;
    this._renderResult('', { streaming: true });
    this._stream = runStream(messages, { system, task, options: task ? { length: 'medium' } : undefined, provider: this.provider || undefined }, {
      onChunk: full => { entry.text = full; this._renderResult(full, { streaming: true }); },
      onDone: full => { entry.text = full; this._streaming = false; this._askBtn.disabled = false; this._renderResult(full, { streaming: false }); this._pushHistory(entry); this.emit('result', { label, text: full }); },
      onAbort: partial => { entry.text = partial; this._streaming = false; this._askBtn.disabled = false; this._renderResult(partial, { streaming: false }); if (partial) this._pushHistory(entry); },
      onError: err => { this._streaming = false; this._askBtn.disabled = false; this._renderError(err); this.emit('error', { error: err }); },
    });
  }
  _renderResult(text, { streaming }) {
    this._resultBox.hidden = false;
    this._resultBox.innerHTML = String(O.ai.markdown(text || ''));
    this._resultBox.classList.toggle('is-streaming', !!streaming);
    if (!streaming && text) {
      this._resultActions.hidden = false;
      this._resultActions.replaceChildren(
        h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm', 'data-mode': 'insert' }, iconEl('check'), h('span', {}, this.t('assistant.insert'))),
        h('button', { type: 'button', class: 'o-btn o-btn-sm', 'data-mode': 'replace' }, h('span', {}, this.t('assistant.replace'))),
        h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', 'data-mode': 'copy' }, iconEl('copy'), h('span', {}, this.t('assistant.copy'))),
      );
    } else this._resultActions.hidden = true;
  }
  _renderError(err) {
    this._resultBox.hidden = false;
    this._resultBox.classList.remove('is-streaming');
    this._resultBox.replaceChildren(h('div', { class: 'o-chat-error' }, iconEl('alert-circle'), h('span', {}, err?.message || this.t('chatbot.error'))));
    this._resultActions.hidden = true;
    announce(err?.message || this.t('chatbot.error'), 'assertive');
  }
  _insert(mode) {
    const text = this._current?.text || '';
    if (!text) return;
    if (mode === 'copy') { copyText(text); announce(this.t('assistant.resultCopied')); return; }
    const target = this._tracker?.get();
    const ok = target && insertIntoTarget(target, text, mode);
    if (ok) { announce(this.t(mode === 'replace' ? 'assistant.replaced' : 'assistant.inserted')); this.emit('insert', { text, mode }); }
    else announce(this.t('assistant.noContext'), 'assertive');
  }
  _pushHistory(entry) {
    this._historyList.unshift(entry);
    if (this._historyList.length > 20) this._historyList.length = 20;
    this._renderHistory();
  }
  _renderHistory() {
    this._historyBox.replaceChildren(...this._historyList.map((e, i) => h('button', { type: 'button', class: 'o-assistant-history-item', 'data-idx': i, title: e.label }, e.label)));
  }
  _loadHistory(i) {
    const entry = this._historyList[i];
    if (!entry) return;
    this._current = entry;
    this._renderResult(entry.text, { streaming: false });
  }
}
define('o-assistant', OAssistant);
O.Assistant = OAssistant;
