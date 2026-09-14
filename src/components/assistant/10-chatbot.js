/* ============================================================================
 * <o-chatbot title welcome suggestions persist launcher position avatar>
 * Floating launcher + chat window (or inline when launcher=false). Streams Markdown responses
 * from Orion.ai, with stop/regenerate/copy, thumbs feedback, file-context attachment,
 * localStorage persistence, typing indicator, scroll anchoring and an error bubble with retry.
 * Events: o-message, o-response, o-error, o-feedback.
 * ========================================================================== */
class OChatbot extends OElement {
  static props = {
    title: { type: String, default: '' },
    welcome: { type: String, default: '' },
    suggestions: { type: Array, default: () => [] },
    persist: { type: Any, default: false },
    launcher: { type: Boolean, default: true, reflect: true },
    position: { type: String, default: 'bottom-end', reflect: true },
    avatar: { type: String, default: '' },
    isOpen: { type: Boolean, attr: 'open', reflect: true, default: false },
    placeholder: { type: String, default: '' },
    disabled: { type: Boolean, reflect: true },
    provider: { type: Function, attr: false },
    system: { type: String, default: '' },
    texts: { type: Object, attr: false },
  };

  setup() {
    this.classList.add('o-chatbot');
    this._uiMessages = [];
    this._history = [];
    this._attachments = [];
    this._pinned = true;
    this._streaming = false;
    this._stream = null;
    this._lastUserText = '';

    const id = this.id || uid('chatbot');
    this._winId = id + '-win';

    this._launcherBtn = h('button', { type: 'button', class: 'o-chatbot-launcher', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': this._winId }, iconEl('sparkles'));
    this._window = h('div', { class: 'o-chatbot-window o-floating', id: this._winId, role: 'dialog', 'aria-label': this.title || t('chatbot.title'), hidden: true });

    this._avatarEl = h('span', { class: 'o-avatar o-chatbot-avatar' });
    this._titleEl = h('div', { class: 'o-chatbot-title' });
    const newChatBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': t('chatbot.newChat'), title: t('chatbot.newChat') }, iconEl('refresh'));
    const exportBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm o-chatbot-export', 'aria-label': t('chatbot.export'), title: t('chatbot.export') }, iconEl('download'));
    const closeBtn = h('button', { type: 'button', class: 'o-btn-close', 'aria-label': t('chatbot.close') });
    const header = h('header', { class: 'o-chatbot-header' }, this._avatarEl, this._titleEl, h('div', { class: 'o-chatbot-header-actions' }, exportBtn, newChatBtn, closeBtn));

    this._log = h('div', { class: 'o-chatbot-log o-scroll', role: 'log', 'aria-live': 'polite', 'aria-atomic': 'false', tabindex: '-1' });
    this._jump = h('button', { type: 'button', class: 'o-chatbot-jump', hidden: true }, iconEl('arrow-down'), h('span', {}, t('chatbot.jump')));
    this._chipsRow = h('div', { class: 'o-chatbot-suggestions', hidden: true });
    this._attachRow = h('div', { class: 'o-chatbot-attachments' });

    this._input = h('textarea', { class: 'o-chatbot-input', rows: '1', 'aria-label': this.placeholder || t('chatbot.placeholder') });
    this._fileInput = h('input', { type: 'file', hidden: true, accept: '.txt,.md,.csv,.json,text/plain,text/csv,application/json' });
    const attachBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-chatbot-attach', 'aria-label': t('chatbot.attach'), title: t('chatbot.attach') }, iconEl('paperclip'));
    this._sendBtn = h('button', { type: 'submit', class: 'o-btn o-btn-primary o-btn-icon o-chatbot-send', 'aria-label': t('chatbot.send') }, iconEl('send'));
    this._stopBtn = h('button', { type: 'button', class: 'o-btn o-btn-soft-danger o-btn-icon o-chatbot-stop', hidden: true, 'aria-label': t('chatbot.stop') }, iconEl('x'));
    const inputRow = h('div', { class: 'o-chatbot-inputrow' }, attachBtn, this._input, this._sendBtn, this._stopBtn);
    this._composer = h('form', { class: 'o-chatbot-composer', novalidate: true }, this._attachRow, inputRow);

    this._window.append(header, this._log, this._jump, this._chipsRow, this._composer, this._fileInput);
    this.append(this._launcherBtn, this._window);
    this.focusTarget = this._input;

    on(this._launcherBtn, 'click', () => this.toggle());
    on(closeBtn, 'click', () => this.close());
    on(newChatBtn, 'click', () => this.newChat());
    on(exportBtn, 'click', () => this.exportTranscript());
    on(this._composer, 'submit', e => { e.preventDefault(); this._submit(); });
    on(this._input, 'keydown', e => this._onInputKey(e));
    on(this._input, 'input', () => this._autoGrow());
    on(attachBtn, 'click', () => this._fileInput.click());
    on(this._fileInput, 'change', () => this._onFile());
    on(this._stopBtn, 'click', () => this.stop());
    on(this._jump, 'click', () => { this._pinned = true; this._scrollToBottom(); this._jump.hidden = true; });
    on(this._log, 'scroll', throttle(() => this._onScroll(), 150));
    on(this._log, 'click', '.o-chat-action-copy', (e, b) => this._copyMessage(b));
    on(this._log, 'click', '.o-chat-action-regenerate', () => this.regenerate());
    on(this._log, 'click', '.o-chat-action-retry', () => this.regenerate());
    on(this._log, 'click', '.o-chat-action-up', (e, b) => this._feedback(b, 'up'));
    on(this._log, 'click', '.o-chat-action-down', (e, b) => this._feedback(b, 'down'));
    on(this._attachRow, 'click', '.o-chip-remove', (e, b) => this._removeAttachment(+b.closest('[data-idx]').dataset.idx));
  }

  disconnected() { this._stream?.cancel('disconnect'); }

  update(changed) {
    if (changed.has('init')) {
      this._loadPersisted();
      this._renderWelcome();
    }
    if (changed.has('title') || changed.has('avatar') || changed.has('locale') || changed.has('init')) this._renderHeader();
    if (changed.has('launcher') || changed.has('init')) {
      this.classList.toggle('o-chatbot-inline', !this.launcher);
      this._launcherBtn.hidden = !this.launcher;
      if (!this.launcher) this.isOpen = true;
    }
    if (changed.has('position') || changed.has('init')) {
      ['bottom-end', 'bottom-start', 'top-end', 'top-start'].forEach(p => this.classList.remove('o-chatbot-' + p));
      this.classList.add('o-chatbot-' + (['bottom-end', 'bottom-start', 'top-end', 'top-start'].includes(this.position) ? this.position : 'bottom-end'));
    }
    if (changed.has('isOpen') || changed.has('init')) this._applyOpen();
    if (changed.has('placeholder') || changed.has('locale') || changed.has('init')) {
      const ph = this.placeholder || this.t('chatbot.placeholder');
      this._input.setAttribute('aria-label', ph); this._input.placeholder = ph;
    }
    if (changed.has('disabled') || changed.has('init')) { this._input.disabled = this.disabled; this._sendBtn.disabled = this.disabled; }
    if (changed.has('suggestions') || changed.has('init')) this._renderSuggestions();
  }

  /* ── public API ── */
  open() { if (!this.isOpen) this.isOpen = true; }
  close() { if (this.isOpen && this.launcher) { this.isOpen = false; this._launcherBtn.focus(); } }
  toggle() { this.isOpen ? this.close() : this.open(); }
  focus() { this._input?.focus(); }
  stop() { this._stream?.cancel('user-stop'); }
  clear() { this.newChat(); }
  /** Programmatically send a message as the user. */
  async send(text) {
    text = String(text ?? '').trim();
    if (!text || this._streaming) return;
    if (this.launcher && !this.isOpen) this.open();
    this._pushUser(text);
    await this._respond();
  }
  /** Re-run the last exchange (also used by the error bubble's Retry button). */
  regenerate() {
    if (this._streaming) return;
    while (this._history.length && this._history[this._history.length - 1].role === 'assistant') this._history.pop();
    const last = this._uiMessages[this._uiMessages.length - 1];
    if (last && last.role === 'assistant') {
      this._uiMessages.pop();
      this._log.querySelector(`[data-id="${CSS.escape(last.id)}"]`)?.remove();
    }
    if (!this._history.length || this._history[this._history.length - 1].role !== 'user') return;
    this._respond();
  }
  /**
   * exportTranscript({ format='markdown'|'text'|'json', download=true, filename }) -> string
   * Returns the conversation as a string (and triggers a file download unless download:false).
   */
  exportTranscript({ format = 'markdown', download: shouldDownload = true, filename } = {}) {
    const msgs = this._uiMessages.filter(m => (m.role === 'user' || m.role === 'assistant') && !m.isWelcome && m.text);
    const who = m => (m.role === 'user' ? 'You' : (this.title || this.t('chatbot.title')));
    let content, mime, ext;
    if (format === 'json') {
      content = JSON.stringify(msgs.map(m => ({ role: m.role, text: m.text, ts: m.ts })), null, 2);
      mime = 'application/json'; ext = 'json';
    } else if (format === 'text') {
      content = msgs.map(m => `${who(m)}: ${m.text}`).join('\n\n');
      mime = 'text/plain'; ext = 'txt';
    } else {
      format = 'markdown';
      content = msgs.map(m => `**${who(m)}:**\n\n${m.text}`).join('\n\n---\n\n');
      mime = 'text/markdown'; ext = 'md';
    }
    if (shouldDownload) { download(content, (filename || 'chat-transcript') + '.' + ext, mime); announce(this.t('chatbot.exported')); }
    this.emit('export', { format, text: content });
    return content;
  }
  newChat() {
    this._stream?.cancel('new-chat');
    this._uiMessages = []; this._history = []; this._attachments = [];
    this._log.replaceChildren();
    this._renderAttachments();
    const key = this._storageKey(); if (key) ls.del(key);
    this._renderWelcome();
    this._chipsRow.hidden = false;
    this._renderSuggestions();
    this._pinned = true;
    announce(this.t('chatbot.newChat'));
  }

  /* ── internals ── */
  _applyOpen() {
    const openNow = this.isOpen || !this.launcher;
    this._window.hidden = !openNow;
    this._launcherBtn.setAttribute('aria-expanded', String(this.isOpen));
    this.classList.toggle('is-open', openNow);
    if (openNow) {
      if (isFn(animate)) animate(this._window, 'zoomIn', { duration: 140 });
      nextFrame().then(() => { if (this.isConnected) { this._input.focus(); this._scrollToBottom(); } });
    }
  }
  _renderHeader() {
    this._titleEl.textContent = this.title || this.t('chatbot.title');
    this._window.setAttribute('aria-label', this.title || this.t('chatbot.title'));
    this._avatarEl.replaceChildren(this._avatarNode());
  }
  _avatarNode() {
    if (this.avatar && /^(https?:|data:|\.\/|\/)/.test(this.avatar)) return h('img', { src: this.avatar, alt: '' });
    return iconEl(this.avatar || 'sparkles');
  }
  _renderSuggestions() {
    const list = toArr(this.suggestions);
    if (!list.length || this._uiMessages.some(m => m.role === 'user')) { this._chipsRow.replaceChildren(); this._chipsRow.hidden = true; return; }
    this._chipsRow.replaceChildren(...list.map(s => {
      const label = isStr(s) ? s : (s.label ?? s.prompt ?? '');
      const prompt = isStr(s) ? s : (s.prompt ?? s.label ?? '');
      return h('button', { type: 'button', class: 'o-chip o-chatbot-chip', onClick: () => this.send(prompt) }, label);
    }));
    this._chipsRow.hidden = false;
  }
  _renderWelcome() {
    if (this._uiMessages.length || !this.welcome) return;
    const msg = { id: uid('m'), role: 'assistant', text: this.welcome, ts: Date.now(), isWelcome: true };
    this._uiMessages.push(msg);
    this._finishBubble(this._appendBubble(msg), msg, { noActions: true });
  }
  _onInputKey(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); this._submit(); return; }
    if (e.key === 'Escape') {
      if (this._streaming) { e.preventDefault(); this.stop(); }
      else if (this.launcher) { e.preventDefault(); this.close(); }
      return;
    }
    if (e.key === 'ArrowUp' && !this._input.value && this._lastUserText) {
      e.preventDefault();
      this._input.value = this._lastUserText;
      this._autoGrow();
      nextFrame().then(() => this._input.setSelectionRange(this._input.value.length, this._input.value.length));
    }
  }
  _autoGrow() {
    const el = this._input;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }
  _onScroll() {
    const el = this._log;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    this._pinned = atBottom;
    this._jump.hidden = atBottom;
  }
  _scrollToBottom() { this._log.scrollTop = this._log.scrollHeight; }

  _submit() {
    const text = this._input.value.trim();
    if (!text || this._streaming || this.disabled) return;
    this._input.value = ''; this._autoGrow();
    this._pushUser(text);
    this._respond();
  }
  _composeUserContent(text) {
    if (!this._attachments.length) return text;
    const ctx = this._attachments.map(a => `--- file: ${a.name} ---\n${aiSharedTruncate(a.text, 6000)}`).join('\n\n');
    this._attachments = []; this._renderAttachments();
    return `${text}\n\n[Attached file context]\n${ctx}`;
  }
  _pushUser(text) {
    const msg = { id: uid('m'), role: 'user', text, ts: Date.now() };
    this._uiMessages.push(msg);
    this._history.push({ role: 'user', content: this._composeUserContent(text) });
    this._lastUserText = text;
    this._appendBubble(msg);
    this._persist();
    this._chipsRow.replaceChildren(); this._chipsRow.hidden = true;
    this._pinned = true; this._scrollToBottom();
    this.emit('message', { message: { role: 'user', text } });
  }
  async _respond() {
    this._streaming = true;
    this._sendBtn.hidden = true; this._stopBtn.hidden = false;
    const msg = { id: uid('m'), role: 'assistant', text: '', ts: Date.now(), streaming: true };
    this._uiMessages.push(msg);
    const bubble = this._appendBubble(msg, { typing: true });
    let first = true;
    const renderThrottled = throttle(() => this._renderBubbleText(bubble, msg.text, { streaming: true }), 300);
    this._stream = runStream(this._history, { system: this.system || undefined, provider: this.provider || undefined }, {
      onChunk: full => {
        msg.text = full;
        if (first && full) { first = false; bubble.classList.remove('is-typing'); }
        renderThrottled();
        if (this._pinned) this._scrollToBottom();
      },
      onDone: full => {
        msg.text = full; msg.streaming = false;
        this._renderBubbleText(bubble, full, { streaming: false });
        this._finishBubble(bubble, msg);
        this._history.push({ role: 'assistant', content: full });
        this._persist();
        this._afterResponse(bubble);
        this.emit('response', { message: { role: 'assistant', text: full }, aborted: false });
      },
      onAbort: partial => {
        msg.text = partial; msg.streaming = false; msg.aborted = true;
        bubble.classList.add('is-aborted');
        this._renderBubbleText(bubble, partial || this.t('chatbot.stopped'), { streaming: false });
        this._finishBubble(bubble, msg);
        if (partial) this._history.push({ role: 'assistant', content: partial });
        this._persist();
        this._afterResponse(bubble);
        announce(this.t('chatbot.stopped'));
        this.emit('response', { message: { role: 'assistant', text: partial }, aborted: true });
      },
      onError: (err, partial) => {
        msg.text = partial || ''; msg.streaming = false;
        this._finishError(bubble, err);
        this._afterResponse(bubble);
        this.emit('error', { error: err });
      },
    });
  }
  _afterResponse(bubble) {
    this._streaming = false; this._stream = null;
    this._sendBtn.hidden = false; this._stopBtn.hidden = true;
    if (this.isOpen || !this.launcher) this._input.focus();
  }
  _renderBubbleText(bubble, text, { streaming }) {
    const content = bubble.querySelector('.o-chat-content');
    content.innerHTML = String(O.ai.markdown(text));
    content.classList.toggle('is-streaming', !!streaming);
  }
  _appendBubble(msg, { typing = false } = {}) {
    const isUser = msg.role === 'user';
    const avatar = h('span', { class: 'o-avatar o-chat-avatar' }, isUser ? iconEl('user') : this._avatarNode());
    const content = h('div', { class: 'o-chat-content o-prose' });
    if (typing) { content.classList.add('is-typing'); content.append(h('span', { class: 'o-loader-dots', 'aria-label': this.t('assistant.running') }, h('i'), h('i'), h('i'))); }
    else content.innerHTML = String(O.ai.markdown(msg.text || ''));
    const bubble = h('div', { class: cls('o-chat-msg', isUser ? 'is-user' : 'is-assistant'), 'data-id': msg.id },
      avatar, h('div', { class: 'o-chatbot-bubble' }, content, h('div', { class: 'o-chatbot-actions' })));
    this._log.append(bubble);
    return bubble;
  }
  _finishBubble(bubble, msg, { noActions = false } = {}) {
    bubble.classList.remove('is-typing');
    bubble.querySelector('.o-chat-content')?.classList.remove('is-streaming');
    const actions = bubble.querySelector('.o-chatbot-actions');
    if (!actions || noActions || msg.role !== 'assistant') return;
    actions.replaceChildren(
      h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-xs o-chat-action-copy', 'aria-label': this.t('chatbot.copy'), title: this.t('chatbot.copy') }, iconEl('copy')),
      h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-xs o-chat-action-regenerate', 'aria-label': this.t('chatbot.regenerate'), title: this.t('chatbot.regenerate') }, iconEl('refresh')),
      h('button', { type: 'button', class: cls('o-btn o-btn-ghost o-btn-icon o-btn-xs o-chat-action-up', msg.feedback === 'up' && 'is-active'), 'aria-pressed': String(msg.feedback === 'up'), 'aria-label': this.t('chatbot.good'), title: this.t('chatbot.good') }, iconEl('check-circle')),
      h('button', { type: 'button', class: cls('o-btn o-btn-ghost o-btn-icon o-btn-xs o-chat-action-down', msg.feedback === 'down' && 'is-active'), 'aria-pressed': String(msg.feedback === 'down'), 'aria-label': this.t('chatbot.bad'), title: this.t('chatbot.bad') }, iconEl('x-circle')),
    );
  }
  _finishError(bubble, err) {
    bubble.classList.add('is-error');
    const content = bubble.querySelector('.o-chat-content');
    content?.classList.remove('is-typing', 'is-streaming');
    const text = err?.message || this.t('chatbot.error');
    if (content) content.replaceChildren(h('div', { class: 'o-chat-error' }, iconEl('alert-circle'), h('span', {}, text),
      h('button', { type: 'button', class: 'o-btn o-btn-soft-danger o-btn-sm o-chat-action-retry' }, this.t('chatbot.retry'))));
    announce(text, 'assertive');
  }
  _copyMessage(btn) {
    const el = btn.closest('.o-chat-msg')?.querySelector('.o-chat-content');
    if (el) copyText(el.textContent || '');
  }
  _feedback(btn, rating) {
    const bubbleId = btn.closest('.o-chat-msg')?.dataset.id;
    const msg = this._uiMessages.find(m => m.id === bubbleId);
    if (!msg) return;
    msg.feedback = msg.feedback === rating ? null : rating;
    this._finishBubble(btn.closest('.o-chat-msg'), msg);
    this.emit('feedback', { message: { role: 'assistant', text: msg.text }, rating: msg.feedback });
  }
  async _onFile() {
    const file = this._fileInput.files[0]; this._fileInput.value = '';
    if (!file) return;
    if (file.size > 2_000_000) { announce(this.t('chatbot.fileTooBig'), 'assertive'); return; }
    const text = await file.text().catch(() => '');
    this._attachments.push({ name: file.name, text });
    this._renderAttachments();
  }
  _renderAttachments() {
    this._attachRow.replaceChildren(...this._attachments.map((a, i) => h('span', { class: 'o-chip', 'data-idx': i },
      iconEl('file'), h('span', {}, `${a.name} · ${formatBytes(a.text.length)}`),
      h('button', { type: 'button', class: 'o-chip-remove', 'aria-label': this.t('chatbot.removeFile') }))));
  }
  _removeAttachment(idx) { this._attachments.splice(idx, 1); this._renderAttachments(); }

  /* ── persistence ── */
  _storageKey() { return this.persist ? 'orion:chatbot:' + (this.persist === true ? (this.id || 'default') : this.persist) : null; }
  _persist() {
    const key = this._storageKey(); if (!key) return;
    ls.set(key, this._uiMessages.filter(m => !m.isWelcome && !m.error && (m.role === 'user' || (m.role === 'assistant' && m.text))).map(m => ({ role: m.role, text: m.text })));
  }
  _loadPersisted() {
    const key = this._storageKey(); if (!key) return;
    const data = ls.get(key, null);
    if (!Array.isArray(data) || !data.length) return;
    for (const m of data) {
      if (m.role !== 'user' && m.role !== 'assistant') continue;
      const msg = { id: uid('m'), role: m.role, text: String(m.text || ''), ts: Date.now() };
      this._uiMessages.push(msg);
      this._history.push({ role: m.role, content: msg.text });
      const bubble = this._appendBubble(msg);
      if (m.role === 'assistant') this._finishBubble(bubble, msg);
      else this._lastUserText = msg.text;
    }
  }
}
define('o-chatbot', OChatbot);
O.Chatbot = OChatbot;
