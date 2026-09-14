/* <o-chat current-user='{...}' layout="full|thread|widget"> — team / support messaging.
 *   conversations: [{ id, title, avatar, members, lastMessage, unread, muted, pinned, online, typing }]
 *   messages:      [{ id, conversationId, author:{id,name,avatar}, text, html?, attachments, replyTo,
 *                      reactions, createdAt, editedAt, status: sending|sent|delivered|read|failed, system }]
 * Methods: addMessage/updateMessage/removeMessage/setMessages/setConversations/setTyping/markRead/
 *          scrollToBottom/openConversation. Events: o-send o-load-more o-read o-typing o-react o-open-conversation.
 * See 20-service.js for Orion.chat.connect(chatEl, client).
 */
i18n.add('en', {
  chat: {
    ariaLabel: 'Chat', searchConversations: 'Search conversations…', searchMessages: 'Search in conversation…',
    noConversations: 'No conversations', noMatches: 'No matches', selectConversation: 'Select a conversation',
    noMessages: 'No messages yet. Say hello!',
    typing: { one: '{names} is typing', other: '{names} are typing' },
    today: 'Today', yesterday: 'Yesterday', unreadDivider: 'Unread messages', jumpToLatest: 'Jump to latest',
    you: 'You', reply: 'Reply', forward: 'Forward', copyText: 'Copy text', edit: 'Edit message', delete: 'Delete message',
    deleteConfirm: 'Delete this message? This cannot be undone.', react: 'Add reaction', moreActions: 'More actions',
    send: 'Send', attach: 'Attach file', emoji: 'Emoji', voice: 'Record a voice note', stopRecording: 'Stop recording',
    recording: 'Recording…', replyingTo: 'Replying to {name}', editing: 'Editing message', cancelReply: 'Cancel reply',
    cancelEdit: 'Cancel edit',
    status: { sending: 'Sending…', sent: 'Sent', delivered: 'Delivered', read: 'Read', failed: 'Failed to send — tap to retry' },
    retry: 'Retry', online: 'Online', muted: 'Muted', pinned: 'Pinned',
    membersCount: { one: '{count} member', other: '{count} members' },
    back: 'Back to conversations', attachments: { one: '{count} attachment', other: '{count} attachments' },
    forwardTo: 'Forward to…', forwarded: 'Message forwarded', composerLabel: 'Message',
    close: 'Close chat', open: 'Open chat', remove: 'Remove',
  },
});

O.icons.add({
  'chat-reply': '<path d="M9 17 4 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
  'chat-forward': '<path d="m15 17 5-5-5-5"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>',
  'chat-smile': '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/>',
  'chat-check-check': '<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
  'chat-pin': '<path d="M12 21c0-3.5-5-8.5-5-12.5A5 5 0 0 1 12 3a5 5 0 0 1 5 5.5c0 4-5 9-5 12.5z"/><circle cx="12" cy="8.5" r="2"/>',
  'chat-mute': '<path d="M8.7 3A6 6 0 0 1 18 8c0 2.3.5 4 1 5.3M17.7 17.7A2 2 0 0 1 15 19H9a2 2 0 0 1-1.7-1M2 2l20 20M6.3 6.3C6 7 6 7.6 6 8c0 7-3 9-3 9h13"/>',
});

/* ── plain helpers ─────────────────────────────────────────────────────── */
const CHAT_SHORTCODES = {
  smile: '😄', smiley: '😃', grin: '😁', laughing: '😆', joy: '😂', rofl: '🤣', wink: '😉', blush: '😊',
  slight_smile: '🙂', upside_down: '🙃', relaxed: '😌', heart_eyes: '😍', kissing_heart: '😘', yum: '😋',
  sunglasses: '😎', thinking: '🤔', neutral: '😐', confused: '😕', worried: '😟', frowning: '☹️',
  cry: '😢', sob: '😭', angry: '😠', rage: '😡', triumph: '😤', scream: '😱', flushed: '😳', tired: '😫',
  sleepy: '😪', sleeping: '😴', mask: '😷', sick: '🤒', 100: '💯', fire: '🔥', tada: '🎉', clap: '👏',
  pray: '🙏', wave: '👋', thumbsup: '👍', '+1': '👍', thumbsdown: '👎', '-1': '👎', ok_hand: '👌',
  muscle: '💪', eyes: '👀', heart: '❤️', broken_heart: '💔', star: '⭐', sparkles: '✨', rocket: '🚀',
  white_check_mark: '✅', x: '❌', raised_hands: '🙌', handshake: '🤝', coffee: '☕', pizza: '🍕',
  beer: '🍺', cake: '🎂', eyes2: '👀', partying: '🥳', smirk: '😏',
};
const CHAT_QUICK_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const CHAT_FALLBACK_EMOJI = '👍 ❤️ 😂 😮 😢 🙏 🔥 🎉 😀 😁 😅 😊 😍 🤔 😴 😭 😡 👏 🙌 🤝 👌 ✌️ 🤞 🤙 👋 💪 🎂 🍕 ☕ 🍺 🚀 ⭐ ✨ 💯 ✅ ❌ 🙃 😉 😎 🥳 🤩 😇 🤗 🥰 😏 😬 🤐 👀'.split(' ');

function chatShortcodes(text) {
  return String(text ?? '').replace(/:([a-z0-9_+-]+):/gi, (m, name) => CHAT_SHORTCODES[name.toLowerCase()] || m);
}
const CHAT_URL_RE = /((?:https?:\/\/|www\.)[^\s<>"')\]]+)/gi;
function chatLinkify(text) {
  let out = '', last = 0, m;
  CHAT_URL_RE.lastIndex = 0;
  while ((m = CHAT_URL_RE.exec(text))) {
    let url = m[0].replace(/[).,!?;:]+$/, '');
    out += esc(text.slice(last, m.index));
    const href = /^https?:\/\//i.test(url) ? url : 'https://' + url;
    out += `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`;
    last = m.index + url.length;
  }
  return out + esc(text.slice(last));
}
const chatRenderText = text => chatLinkify(chatShortcodes(text));

function chatInitials(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}
function chatAvatar(user = {}, opts = {}) {
  if (isBrowser && customElements.get('o-avatar')) {
    const el = h('o-avatar', { name: user.name || '' });
    if (opts.size) el.setAttribute('size', opts.size);
    if (user.avatar) el.setAttribute('src', user.avatar);
    if (opts.status) el.setAttribute('status', opts.status);
    return el;
  }
  const div = h('div', { class: cls('o-avatar', opts.size && 'o-avatar-' + opts.size) });
  if (user.avatar) div.append(h('img', { src: user.avatar, alt: '' }));
  else div.textContent = chatInitials(user.name);
  if (opts.status) div.dataset.status = opts.status;
  return div;
}
const GROUP_WINDOW_MS = 5 * 60 * 1000;
function chatSameGroup(a, b) {
  if (!a || !b || a.system || b.system) return false;
  if ((a.author && a.author.id) !== (b.author && b.author.id)) return false;
  return Math.abs(+new Date(b.createdAt) - +new Date(a.createdAt)) <= GROUP_WINDOW_MS;
}
function chatDayKey(iso) { const d = new Date(iso); return date.isSame(d, new Date(), 'd') ? 'today' : date.format(d, 'YYYY-MM-DD'); }
function chatDayLabel(iso) {
  const d = new Date(iso);
  if (date.isToday(d)) return t('chat.today');
  if (date.isSame(d, date.sub(new Date(), 1, 'day'), 'd')) return t('chat.yesterday');
  return fmt.date(d, { month: 'long', day: 'numeric', year: date.isSame(d, new Date(), 'y') ? undefined : 'numeric' });
}

/* ── <o-chat> ──────────────────────────────────────────────────────────── */
class OChat extends OElement {
  static props = {
    currentUser: { type: Object, default: () => ({}) },
    layout: { type: String, default: 'full', reflect: true },
    conversations: { type: Array, default: () => [] },
    messages: { type: Array, default: () => [] },
    activeId: { type: String, attr: 'active-id' },
    open: { type: Boolean, reflect: true },
    onSend: { type: Function, attr: false },
    label: String,
    texts: Object,
  };

  setup() {
    this.classList.add('o-chat');
    this._convById = new Map();
    this._msgIndex = new Map();
    this._msgById = new Map();
    this._typing = new Map();
    this._windowSize = new Map();
    this._unreadSnapshot = new Map();
    this._newSince = new Map();
    this._loadMoreLock = new Set();
    this._pendingFiles = [];
    this._convSearch = '';
    this._replyTo = null;
    this._editingId = null;
    this._threadSearchActive = false;
    this._threadSearchQuery = '';
    this._threadMatches = [];
    this._threadMatchIdx = -1;
    this._recording = false;
    this._announceIncoming = throttle(msg => announce(msg), 1500);

    /* conversation list pane */
    this._searchInput = h('input', { class: 'o-input o-input-sm', type: 'search', placeholder: this.t('chat.searchConversations'), 'aria-label': this.t('chat.searchConversations') });
    const listHead = h('div', { class: 'o-chat-list-head' }, h('div', { class: 'o-input-wrap' }, icon('search'), this._searchInput));
    this._listItems = h('div', { class: 'o-chat-list-items', role: 'listbox', 'aria-label': this.t('chat.ariaLabel') });
    this._listPane = h('div', { class: 'o-chat-list' }, listHead, this._listItems);

    /* thread header */
    this._backBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-chat-header-back', 'aria-label': this.t('chat.back') }, icon('chevron-left'));
    this._headerAvatar = h('span', { class: 'o-chat-conv-avatar' });
    this._headerTitle = h('div', { class: 'o-chat-header-title', tabindex: '-1' });
    this._headerSub = h('div', { class: 'o-chat-header-sub' });
    this._searchToggleBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon', 'aria-label': this.t('chat.searchMessages') }, icon('search'));
    this._moreBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon', 'aria-label': t('common.menu') }, icon('more-vertical'));
    this._widgetCloseBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon', 'aria-label': this.t('chat.close'), hidden: true }, icon('x'));
    this._header = h('div', { class: 'o-chat-header' },
      this._backBtn,
      h('div', { class: 'o-chat-header-info' }, this._headerAvatar, h('div', { class: 'o-chat-header-text' }, this._headerTitle, this._headerSub)),
      h('div', { class: 'o-chat-header-actions' }, this._searchToggleBtn, this._moreBtn, this._widgetCloseBtn));

    /* thread search bar */
    this._threadSearchInput = h('input', { class: 'o-input o-input-sm', type: 'search', placeholder: this.t('chat.searchMessages'), 'aria-label': this.t('chat.searchMessages') });
    this._threadSearchCount = h('span', { class: 'o-chat-search-count' });
    this._threadSearchClose = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': t('common.close') }, icon('x'));
    this._searchBar = h('div', { class: 'o-chat-search-bar', hidden: true }, h('div', { class: 'o-input-wrap' }, icon('search'), this._threadSearchInput), this._threadSearchCount, this._threadSearchClose);

    /* messages */
    this._messagesEl = h('div', { class: 'o-chat-messages', role: 'log', 'aria-relevant': 'additions text', tabindex: '-1' });
    this._jumpBtn = h('button', { type: 'button', class: 'o-chat-jump', hidden: true }, icon('arrow-down'), h('span', {}, t('chat.jumpToLatest')), h('span', { class: 'o-badge o-badge-sm o-badge-danger' }));
    const threadBody = h('div', { style: 'position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column' }, this._messagesEl, this._jumpBtn);

    /* reply / edit / voice banners + attachment preview */
    this._replyBanner = h('div', { class: 'o-chat-reply-banner', hidden: true });
    this._voiceBar = h('div', { class: 'o-chat-reply-banner', hidden: true });
    this._attachPreview = h('div', { class: 'o-chat-attach-preview', hidden: true });

    /* composer */
    this._fileInput = h('input', { type: 'file', multiple: true, hidden: true, tabindex: '-1' });
    this._textarea = h('textarea', { class: 'o-chat-textarea', rows: 1, 'aria-label': this.t('chat.composerLabel'), placeholder: t('chat.composerLabel') });
    this._attachBtn = h('button', { type: 'button', 'aria-label': this.t('chat.attach') }, icon('paperclip'));
    this._emojiBtn = h('button', { type: 'button', 'aria-label': this.t('chat.emoji') }, icon('chat-smile'));
    this._micBtn = h('button', { type: 'button', 'aria-label': this.t('chat.voice') }, icon('mic'));
    this._sendBtn = h('button', { type: 'button', class: 'o-chat-send-btn', 'aria-label': this.t('chat.send'), disabled: true }, icon('send'));
    this._composer = h('div', { class: 'o-chat-composer' },
      h('div', { class: 'o-chat-composer-tools' }, this._attachBtn, this._emojiBtn, this._micBtn),
      h('div', { class: 'o-chat-input-wrap' }, this._textarea),
      this._sendBtn);

    this._threadPane = h('div', { class: 'o-chat-thread' }, this._header, this._searchBar, threadBody, this._replyBanner, this._voiceBar, this._attachPreview, this._composer);
    this._panelWrap = h('div', { class: 'o-chat-panel' }, this._listPane, this._threadPane);
    this.append(this._panelWrap, this._fileInput);

    this._wireEvents();
  }

  connected() {}

  disconnected() {
    clearInterval(this._recordTimer);
    clearTimeout(this._markReadT);
    for (const m of this._typing.values()) for (const v of m.values()) clearTimeout(v.timer);
    for (const p of this._pendingFiles) if (p.url) URL.revokeObjectURL(p.url);
  }

  update(changed) {
    if (changed.has('conversations') || changed.has('init')) this._indexConversations();
    if (changed.has('messages') || changed.has('init')) this._indexMessages();
    if ((changed.has('conversations') || changed.has('init')) && (this.activeId == null || !this._convById.has(String(this.activeId))) && this.conversations.length) {
      this.activeId = String(this.conversations[0].id);
    }
    if (changed.has('label') || changed.has('init') || changed.has('locale')) this.setAttribute('aria-label', this.label || this.t('chat.ariaLabel'));
    if (changed.has('conversations') || changed.has('init') || changed.has('locale') || changed.has('activeId')) this._renderConvList();
    if (changed.has('activeId')) this._onActiveChange();
    if (changed.has('messages') || changed.has('activeId') || changed.has('init') || changed.has('locale')) {
      this._renderThread(changed.has('activeId') || changed.has('init'));
      this._renderTypingIndicator();
    }
    if (changed.has('layout') || changed.has('init')) this._onLayoutChange();
    if (changed.has('open')) this._onOpenChange();
  }

  /* ── public API ──────────────────────────────────────────────────────── */
  addMessage(conversationId, message) {
    const m = { reactions: {}, attachments: [], ...message, conversationId };
    const isActive = String(conversationId) === String(this.activeId);
    const box = this._messagesEl;
    const atBottom = isActive && (box.scrollHeight - box.scrollTop - box.clientHeight < 60);
    this.messages = [...this.messages, m];
    const mine = m.author && m.author.id === (this.currentUser && this.currentUser.id);
    if (isActive) {
      if (!mine && !atBottom) { this._newSince.set(String(conversationId), (this._newSince.get(String(conversationId)) || 0) + 1); queueMicrotask(() => this._paintJumpButton()); }
      if (!mine) this._announceIncoming((m.author && m.author.name ? m.author.name + ': ' : '') + (m.text || ''));
    } else if (!mine) {
      const c = this._convById.get(String(conversationId));
      if (c) { c.unread = (c.unread || 0) + 1; this._renderConvList(); }
    }
    return m;
  }
  updateMessage(id, patch) {
    const idx = this.messages.findIndex(m => String(m.id) === String(id));
    if (idx < 0) return null;
    const updated = { ...this.messages[idx], ...patch };
    const list = this.messages.slice(); list[idx] = updated;
    this.messages = list;
    return updated;
  }
  removeMessage(id) { this.messages = this.messages.filter(m => String(m.id) !== String(id)); }
  setMessages(list) { this.messages = toArr(list); }
  setConversations(list) { this.conversations = toArr(list); }
  setTyping(userId, isTyping, conversationId = this.activeId) {
    if (conversationId == null) return;
    const cid = String(conversationId);
    let m = this._typing.get(cid);
    if (!m) { m = new Map(); this._typing.set(cid, m); }
    const prev = m.get(userId);
    if (prev && prev.timer) clearTimeout(prev.timer);
    if (isTyping) {
      const conv = this._convById.get(cid);
      const name = (conv && conv.members && conv.members.find(u => String(u.id) === String(userId)) || {}).name || (prev && prev.name) || '';
      const timer = setTimeout(() => this.setTyping(userId, false, cid), 6000);
      m.set(userId, { name, timer });
    } else m.delete(userId);
    this.emit('typing', { conversationId: cid, userId, typing: !!isTyping });
    if (cid === String(this.activeId)) this._renderTypingIndicator();
    this._renderConvList();
  }
  markRead(id = this.activeId) {
    if (id == null) return;
    const c = this._convById.get(String(id));
    if (!c || !c.unread) return;
    c.unread = 0;
    this._renderConvList();
    this.emit('read', { conversationId: id });
  }
  scrollToBottom(smooth) {
    const box = this._messagesEl;
    box.scrollTo ? box.scrollTo({ top: box.scrollHeight, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' }) : (box.scrollTop = box.scrollHeight);
    if (this.activeId) this._newSince.set(String(this.activeId), 0);
    this._jumpBtn.hidden = true;
  }
  openConversation(id) {
    if (id == null) return;
    id = String(id);
    if (!this._convById.has(id)) return;
    this.activeId = id;
    this.classList.add('is-conversation-open');
    this.emit('open-conversation', { conversationId: id });
  }

  /* ── internal: indexing ──────────────────────────────────────────────── */
  _indexConversations() { this._convById.clear(); for (const c of this.conversations) this._convById.set(String(c.id), c); }
  _indexMessages() {
    const byConv = new Map();
    this._msgById.clear();
    for (const m of this.messages) {
      const cid = String(m.conversationId);
      if (!byConv.has(cid)) byConv.set(cid, []);
      byConv.get(cid).push(m);
      this._msgById.set(String(m.id), m);
    }
    for (const list of byConv.values()) list.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    this._msgIndex = byConv;
  }

  /* ── internal: events ────────────────────────────────────────────────── */
  _wireEvents() {
    on(this._searchInput, 'input', debounce(() => { this._convSearch = this._searchInput.value; this._renderConvList(); }, 120));
    on(this._listItems, 'click', '.o-chat-conv', (e, el) => this.openConversation(el.dataset.id));

    on(this._backBtn, 'click', () => this.classList.remove('is-conversation-open'));
    on(this._searchToggleBtn, 'click', () => this._toggleThreadSearch());
    on(this._threadSearchClose, 'click', () => this._toggleThreadSearch(false));
    on(this._threadSearchInput, 'input', debounce(() => this._runThreadSearch(), 120));
    on(this._threadSearchInput, 'keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); this._toggleThreadSearch(false); }
      else if (e.key === 'Enter') { e.preventDefault(); this._stepThreadSearch(e.shiftKey ? -1 : 1); }
    });
    on(this._moreBtn, 'click', e => this._openConvMenu(e.currentTarget));
    on(this._widgetCloseBtn, 'click', () => { this.open = false; });

    on(this._messagesEl, 'scroll', throttle(() => this._onScroll(), 120));
    on(this._jumpBtn, 'click', () => this.scrollToBottom(true));

    on(this._messagesEl, 'click', '[data-act]', (e, el) => this._onMessageAction(e, el));
    on(this._messagesEl, 'click', '.o-chat-reaction', (e, el) => { const row = el.closest('[data-mid]'); if (row) this._toggleReaction(row.dataset.mid, el.dataset.emoji); });
    on(this._messagesEl, 'click', '.o-chat-img', (e, el) => this._openLightbox(el));

    on(this._replyBanner, 'click', '[data-act="cancel-reply"]', () => { if (this._editingId) this._cancelEdit(); else this._setReply(null); });

    on(this._attachBtn, 'click', () => this._fileInput.click());
    on(this._fileInput, 'change', () => { this._addPendingFiles([...this._fileInput.files]); this._fileInput.value = ''; });
    on(this._attachPreview, 'click', '[data-remove]', (e, el) => this._removePendingFile(el.dataset.remove));

    on(this._emojiBtn, 'click', () => this._openEmojiPicker());
    on(this._micBtn, 'click', () => this._toggleVoice());
    on(this._sendBtn, 'click', () => this._submit());
    on(this._textarea, 'input', () => { this._autosize(); this._syncSendState(); });
    on(this._textarea, 'keydown', e => this._onComposerKeydown(e));
  }

  _onComposerKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); this._submit(); return; }
    if (e.key === 'Escape') {
      if (this._editingId) { e.preventDefault(); this._cancelEdit(); }
      else if (this._replyTo) { e.preventDefault(); this._setReply(null); }
      return;
    }
    if (e.key === 'ArrowUp' && !this._textarea.value && !this._editingId) {
      const own = (this._msgIndex.get(String(this.activeId)) || []).filter(m => m.author && this.currentUser && m.author.id === this.currentUser.id && !m.system);
      const mine = own[own.length - 1];
      if (mine) { e.preventDefault(); this._startEdit(mine); }
    }
  }
  _autosize() { const ta = this._textarea; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 136) + 'px'; }
  _syncSendState() { this._sendBtn.disabled = !this._textarea.value.trim() && !this._pendingFiles.length; }

  /* ── conversation list ───────────────────────────────────────────────── */
  _renderConvList() {
    let list = [...this.conversations];
    if (this._convSearch.trim()) list = fuzzySearch(list, this._convSearch, c => (c.title || '') + ' ' + ((c.lastMessage && c.lastMessage.text) || ''));
    list.sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return +new Date((b.lastMessage && b.lastMessage.createdAt) || 0) - +new Date((a.lastMessage && a.lastMessage.createdAt) || 0);
    });
    if (!list.length) {
      this._listItems.replaceChildren(h('div', { class: 'o-chat-list-empty' }, icon('inbox'), h('p', {}, this._convSearch ? this.t('chat.noMatches') : this.t('chat.noConversations'))));
    } else {
      patchList(this._listItems, list, c => c.id, c => this._createConvRow(c), (el, c) => this._updateConvRow(el, c));
    }
    this._updateWidgetBadge();
  }
  _createConvRow(c) {
    const el = h('button', { type: 'button', class: 'o-chat-conv', role: 'option' },
      h('span', { class: 'o-chat-conv-avatar' }),
      h('div', { class: 'o-chat-conv-body' },
        h('div', { class: 'o-chat-conv-top' }, h('span', { class: 'o-chat-conv-title' }), h('span', { class: 'o-chat-conv-time' })),
        h('div', { class: 'o-chat-conv-bottom' }, h('span', { class: 'o-chat-conv-icons' }), h('span', { class: 'o-chat-conv-preview' }), h('span', { class: 'o-chat-conv-badge' }))));
    this._updateConvRow(el, c);
    return el;
  }
  _updateConvRow(el, c) {
    el.dataset.id = c.id;
    const active = String(c.id) === String(this.activeId);
    el.setAttribute('aria-selected', String(active));
    el.classList.toggle('is-active', active);
    el.classList.toggle('is-unread', !!c.unread);
    const avatarSlot = el.querySelector('.o-chat-conv-avatar');
    avatarSlot.replaceChildren(chatAvatar({ name: c.title, avatar: c.avatar }, { status: c.online ? 'online' : null }));
    el.querySelector('.o-chat-conv-title').textContent = c.title || '';
    el.querySelector('.o-chat-conv-time').textContent = (c.lastMessage && c.lastMessage.createdAt) ? fmt.relative(c.lastMessage.createdAt) : '';
    const icons = el.querySelector('.o-chat-conv-icons');
    icons.replaceChildren();
    if (c.pinned) icons.append(iconEl('chat-pin', { label: this.t('chat.pinned') }));
    if (c.muted) icons.append(iconEl('chat-mute', { label: this.t('chat.muted') }));
    const typing = this._typingNames(c.id);
    const preview = el.querySelector('.o-chat-conv-preview');
    if (typing.length) { preview.textContent = this.t('chat.typing', { count: typing.length, names: typing.join(', ') }); preview.classList.add('o-chat-typing-preview'); }
    else { preview.textContent = this._previewText(c); preview.classList.remove('o-chat-typing-preview'); }
    const badge = el.querySelector('.o-chat-conv-badge');
    badge.replaceChildren();
    if (c.unread) badge.append(h('span', { class: 'o-badge o-badge-sm o-badge-danger', style: 'border-radius:999px' }, c.unread > 99 ? '99+' : String(c.unread)));
  }
  _previewText(c) {
    const lm = c.lastMessage;
    if (!lm) return '';
    const who = this.currentUser && lm.author && lm.author.id === this.currentUser.id ? this.t('chat.you') + ': ' : '';
    return who + (lm.text || (lm.attachments && lm.attachments.length ? this.t('chat.attachments', { count: lm.attachments.length }) : ''));
  }
  _typingNames(cid) { const m = this._typing.get(String(cid)); if (!m || !m.size) return []; return [...m.values()].map(v => v.name).filter(Boolean); }

  /* ── active conversation / header ────────────────────────────────────── */
  _onActiveChange() {
    const cid = this.activeId;
    if (cid == null) return;
    if (!this._unreadSnapshot.has(cid)) this._computeUnreadDivider(cid);
    if (!this._windowSize.has(cid)) this._windowSize.set(cid, 40);
    this._newSince.set(cid, 0);
    this._jumpBtn.hidden = true;
    this._renderHeader();
    clearTimeout(this._markReadT);
    this._markReadT = setTimeout(() => this.markRead(cid), 400);
    queueMicrotask(() => { try { this._headerTitle.focus({ preventScroll: true }); } catch {} });
  }
  _computeUnreadDivider(cid) {
    const conv = this._convById.get(cid);
    const list = this._msgIndex.get(cid) || [];
    const n = (conv && conv.unread) || 0;
    if (n > 0) {
      const incoming = list.filter(m => !m.system && (!this.currentUser || (m.author && m.author.id !== this.currentUser.id)));
      const boundary = incoming[Math.max(0, incoming.length - n)];
      this._unreadSnapshot.set(cid, boundary ? boundary.id : null);
    } else this._unreadSnapshot.set(cid, null);
  }
  _renderHeader() {
    const c = this._convById.get(this.activeId);
    if (!c) { this._headerTitle.textContent = this.t('chat.selectConversation'); this._headerSub.textContent = ''; this._headerAvatar.replaceChildren(); return; }
    this._headerAvatar.replaceChildren(chatAvatar({ name: c.title, avatar: c.avatar }, { status: c.online ? 'online' : null }));
    this._headerTitle.textContent = c.title || '';
    this._renderTypingIndicator();
  }

  /* ── thread rendering (windowed) ─────────────────────────────────────── */
  _renderThread(jumpBottom) {
    const box = this._messagesEl, cid = this.activeId;
    const all = cid != null ? (this._msgIndex.get(String(cid)) || []) : [];
    if (cid == null || !all.length) {
      box.replaceChildren(h('div', { class: 'o-chat-empty' }, icon('inbox'), h('p', {}, cid != null ? this.t('chat.noMessages') : this.t('chat.selectConversation'))));
      this._jumpBtn.hidden = true;
      return;
    }
    const winSize = this._windowSize.get(cid) || 40;
    const start = Math.max(0, all.length - winSize);
    const visible = all.slice(start);

    const boxRect = box.getBoundingClientRect();
    let anchorEl = null, anchorTop = 0;
    if (!jumpBottom) {
      for (const child of box.children) {
        const r = child.getBoundingClientRect();
        if (r.bottom > boxRect.top + 1) { anchorEl = child; anchorTop = r.top; break; }
      }
    }
    const wasNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;

    const rows = this._buildRows(visible, start > 0);
    patchList(box, rows, r => r.key, r => this._createRow(r), (el, r) => this._updateRow(el, r));

    const typingRow = box.querySelector('.o-chat-typing-row');
    if (typingRow) box.append(typingRow); // keep typing indicator pinned at the end

    if (jumpBottom) { box.scrollTop = box.scrollHeight; this._newSince.set(cid, 0); this._jumpBtn.hidden = true; }
    else if (anchorEl && anchorEl.isConnected) box.scrollTop += (anchorEl.getBoundingClientRect().top - anchorTop);
    else if (wasNearBottom) box.scrollTop = box.scrollHeight;

    if (this._threadSearchActive) this._runThreadSearch(false);
  }
  _buildRows(visible) {
    const rows = [];
    let prevMsg = null, prevDayKey = null;
    const divider = this._unreadSnapshot.get(this.activeId);
    visible.forEach(m => {
      const dk = chatDayKey(m.createdAt);
      if (dk !== prevDayKey) { rows.push({ type: 'day', key: 'day:' + dk, label: chatDayLabel(m.createdAt) }); prevDayKey = dk; prevMsg = null; }
      if (divider != null && String(m.id) === String(divider)) rows.push({ type: 'unread', key: 'unread:' + this.activeId });
      rows.push({ type: m.system ? 'system' : 'msg', key: 'm:' + m.id, message: m, groupStart: !chatSameGroup(prevMsg, m) });
      prevMsg = m;
    });
    return rows;
  }
  _createRow(r) {
    if (r.type === 'day') return h('div', { class: 'o-chat-day-sep' }, h('span', {}, r.label));
    if (r.type === 'unread') return h('div', { class: 'o-chat-unread-sep' }, h('span', {}, this.t('chat.unreadDivider')));
    if (r.type === 'system') { const el = h('div', { class: 'o-chat-system' }, h('span', {})); this._paintSystem(el, r.message); return el; }
    const el = h('div', { class: 'o-chat-row', 'data-mid': r.message.id },
      h('div', { class: 'o-chat-row-avatar' }),
      h('div', { class: 'o-chat-col' },
        h('div', { class: 'o-chat-author' }),
        h('div', { class: 'o-chat-bubble-wrap' }),
        h('div', { class: 'o-chat-attachments' }),
        h('div', { class: 'o-chat-meta' }),
        h('div', { class: 'o-chat-reactions' })));
    this._paintRow(el, r);
    return el;
  }
  _updateRow(el, r) {
    if (r.type === 'day') { el.querySelector('span').textContent = r.label; return; }
    if (r.type === 'unread') return;
    if (r.type === 'system') { this._paintSystem(el, r.message); return; }
    this._paintRow(el, r);
  }
  _paintSystem(el, m) { el.querySelector('span').textContent = m.text || ''; }
  _paintRow(el, r) {
    const m = r.message;
    const mine = !!(this.currentUser && m.author && m.author.id === this.currentUser.id);
    el.classList.toggle('is-mine', mine);
    el.classList.toggle('is-group-start', r.groupStart);
    el.dataset.mid = m.id;

    if (!mine) {
      const avatarSlot = el.querySelector('.o-chat-row-avatar');
      if (!avatarSlot.firstChild) avatarSlot.append(chatAvatar(m.author || {}, { size: 'sm' }));
    }
    const authorEl = el.querySelector('.o-chat-author');
    authorEl.textContent = (!mine && r.groupStart) ? ((m.author && m.author.name) || '') : '';

    el.querySelector('.o-chat-bubble-wrap').replaceChildren(this._buildBubble(m), this._buildActions(m));
    const attSlot = el.querySelector('.o-chat-attachments');
    const attNodes = this._buildAttachments(m);
    attSlot.replaceChildren(...attNodes);
    attSlot.hidden = !attNodes.length;
    el.querySelector('.o-chat-meta').replaceChildren(...this._buildMeta(m, mine));
    el.querySelector('.o-chat-reactions').replaceChildren(...this._buildReactions(m));
  }
  _buildBubble(m) {
    const bubble = h('div', { class: cls('o-chat-bubble', m.status === 'failed' && 'is-failed', m.system && 'o-chat-system-bubble') });
    if (m.replyTo) {
      const orig = this._msgById.get(String(m.replyTo));
      if (orig) bubble.append(h('span', { class: 'o-chat-bubble-quote' }, h('b', {}, (orig.author && orig.author.name) || ''), h('span', {}, (orig.text || '').slice(0, 140))));
    }
    const body = h('span', { class: 'o-chat-text' });
    if (m.system) body.textContent = m.text || '';
    else if (m.html != null) body.innerHTML = String(sanitize(m.html));
    else body.innerHTML = chatRenderText(m.text || '');
    bubble.append(body);
    if (m.editedAt) bubble.append(h('span', { class: 'o-chat-bubble-edited' }, '(' + t('common.edit').toLowerCase() + ')'));
    return bubble;
  }
  _buildActions(m) {
    return h('div', { class: 'o-chat-actions' },
      h('button', { type: 'button', 'data-act': 'react', 'data-mid': m.id, 'aria-label': this.t('chat.react') }, icon('chat-smile')),
      h('button', { type: 'button', 'data-act': 'reply', 'data-mid': m.id, 'aria-label': this.t('chat.reply') }, icon('chat-reply')),
      h('button', { type: 'button', 'data-act': 'more', 'data-mid': m.id, 'aria-label': this.t('chat.moreActions') }, icon('more-horizontal')));
  }
  _buildAttachments(m) {
    const list = m.attachments || [];
    if (!list.length) return [];
    const out = [];
    const images = list.filter(a => (a.type || '').startsWith('image'));
    const files = list.filter(a => !(a.type || '').startsWith('image'));
    if (images.length) {
      const shown = images.slice(0, 4);
      const grid = h('div', { class: cls('o-chat-img-grid', 'is-' + Math.min(shown.length, 4)) });
      shown.forEach((a, i) => {
        const btn = h('button', { type: 'button', class: 'o-chat-img', 'data-mid': m.id, 'data-idx': i, 'aria-label': a.name || t('common.open') }, h('img', { src: a.thumb || a.url, alt: a.name || '', loading: 'lazy' }));
        if (i === 3 && images.length > 4) btn.append(h('span', { class: 'o-chat-img-more' }, '+' + (images.length - 4)));
        grid.append(btn);
      });
      out.push(grid);
    }
    files.forEach(a => out.push(h('a', { class: 'o-chat-file', href: a.url || '#', target: '_blank', rel: 'noopener noreferrer' },
      h('span', { class: 'o-chat-file-icon' }, icon('file')),
      h('span', { class: 'o-chat-file-info' }, h('span', { class: 'o-chat-file-name' }, a.name || 'file'), h('span', { class: 'o-chat-file-size' }, a.size ? formatBytes(a.size) : '')))));
    return out;
  }
  _buildMeta(m, mine) {
    const out = [h('span', {}, fmt.time(m.createdAt, 'short'))];
    if (mine && !m.system) {
      if (m.status === 'failed') out.push(h('button', { type: 'button', class: 'o-chat-retry', 'data-act': 'retry', 'data-mid': m.id }, icon('alert-circle'), this.t('chat.retry')));
      else {
        const ic = m.status === 'sending' ? icon('clock') : m.status === 'sent' ? icon('check') : icon('chat-check-check');
        out.push(h('span', { class: cls('o-chat-ticks', m.status === 'read' && 'is-read', m.status === 'sending' && 'is-sending'), 'data-o-tooltip': this.t('chat.status.' + m.status) }, ic));
      }
    }
    return out;
  }
  _buildReactions(m) {
    const reactions = m.reactions || {};
    const uidc = this.currentUser && this.currentUser.id;
    return Object.keys(reactions).filter(e => reactions[e] && reactions[e].length).map(e => {
      const users = reactions[e];
      return h('button', { type: 'button', class: cls('o-chat-reaction', users.includes(uidc) && 'is-mine'), 'data-emoji': e }, e, h('span', {}, String(users.length)));
    });
  }

  /* ── message actions ─────────────────────────────────────────────────── */
  _onMessageAction(e, el) {
    e.stopPropagation();
    const mid = el.dataset.mid, act = el.dataset.act;
    const m = this._msgById.get(String(mid));
    if (!m) return;
    if (act === 'reply') this._setReply(m);
    else if (act === 'react') this._openQuickReact(el, m);
    else if (act === 'more') this._openMoreMenu(el, m);
    else if (act === 'retry') this._retry(m);
  }
  _openQuickReact(anchor) {
    const m = this._msgById.get(String(anchor.dataset.mid));
    const panel = h('div', { class: 'o-floating o-chat-quick-react', role: 'menu' });
    CHAT_QUICK_EMOJI.forEach(e => panel.append(h('button', { type: 'button', 'aria-label': e }, e)));
    portal(panel, anchor);
    const unplace = autoPlace(panel, anchor, { placement: 'top', offset: 6 });
    const ov = overlays.open({ el: panel, owner: anchor, onClose: () => { unplace(); panel.remove(); } });
    on(panel, 'click', 'button', (e2, btn) => { this._toggleReaction(m.id, btn.textContent); ov.close('select'); });
    animate(panel, 'zoomIn', { duration: 120 });
  }
  _toggleReaction(mid, emoji) {
    const m = this._msgById.get(String(mid)); if (!m) return;
    const reactions = { ...(m.reactions || {}) };
    const uidc = this.currentUser && this.currentUser.id;
    const set = new Set(reactions[emoji] || []);
    let reacted;
    if (set.has(uidc)) { set.delete(uidc); reacted = false; } else { set.add(uidc); reacted = true; }
    if (set.size) reactions[emoji] = [...set]; else delete reactions[emoji];
    this.updateMessage(mid, { reactions });
    this.emit('react', { conversationId: m.conversationId, messageId: mid, emoji, reacted });
  }
  _openMoreMenu(anchor, m) {
    const mine = !!(this.currentUser && m.author && m.author.id === this.currentUser.id);
    const items = [
      { id: 'copy', label: this.t('chat.copyText'), icon: 'copy' },
      { id: 'forward', label: this.t('chat.forward'), icon: 'chat-forward' },
    ];
    if (mine && !m.system) items.push({ id: 'edit', label: this.t('chat.edit'), icon: 'edit' }, { id: 'delete', label: this.t('chat.delete'), icon: 'trash', danger: true });
    this._popoverMenu(anchor, items, id => this._runMessageAction(id, m));
  }
  _runMessageAction(id, m) {
    if (id === 'copy') { navigator.clipboard && navigator.clipboard.writeText(m.text || '').catch(() => {}); announce(t('common.copied')); }
    else if (id === 'forward') this._openForwardPicker(m);
    else if (id === 'edit') this._startEdit(m);
    else if (id === 'delete') this._confirmDelete(m);
  }
  async _confirmDelete(m) {
    if (O.confirm) { const ok = await O.confirm({ title: this.t('chat.delete'), text: this.t('chat.deleteConfirm'), danger: true }); if (!ok) return; }
    this.removeMessage(m.id);
  }
  _openForwardPicker(m) {
    const items = this.conversations.filter(c => String(c.id) !== String(m.conversationId)).map(c => ({ id: String(c.id), label: c.title }));
    if (!items.length) return;
    this._popoverMenu(this._moreBtn, items, id => this._forwardTo(m, id));
  }
  _forwardTo(m, targetId) {
    const copy = { id: uid('msg'), conversationId: targetId, author: this.currentUser, text: m.text, html: m.html, attachments: m.attachments, reactions: {}, createdAt: new Date().toISOString(), status: 'sent' };
    this.addMessage(targetId, copy);
    this.emit('forward', { message: m, targetConversationId: targetId });
    if (O.toast) O.toast.success(this.t('chat.forwarded'));
  }
  _openConvMenu(anchor) {
    const c = this._convById.get(this.activeId); if (!c) return;
    const items = [
      { id: 'search', label: this.t('chat.searchMessages'), icon: 'search' },
      { id: 'pin', label: c.pinned ? this.t('chat.remove') + ' ' + this.t('chat.pinned').toLowerCase() : this.t('chat.pinned'), icon: 'chat-pin' },
      { id: 'mute', label: c.muted ? this.t('chat.remove') + ' ' + this.t('chat.muted').toLowerCase() : this.t('chat.muted'), icon: 'chat-mute' },
    ];
    this._popoverMenu(anchor, items, id => {
      if (id === 'search') this._toggleThreadSearch(true);
      else if (id === 'pin') { c.pinned = !c.pinned; this._renderConvList(); }
      else if (id === 'mute') { c.muted = !c.muted; this._renderConvList(); }
    });
  }
  /** Minimal self-contained popover menu (portal + overlay stack + ListNav). */
  _popoverMenu(anchor, items, onSelect, opts = {}) {
    const menu = h('div', { class: 'o-floating o-chat-menu', role: 'menu' });
    items.forEach(it => {
      if (it === '-') { menu.append(h('div', { class: 'o-chat-menu-sep' })); return; }
      menu.append(h('button', { type: 'button', class: cls('o-chat-menu-item', it.danger && 'is-danger'), role: 'menuitem', 'data-id': it.id }, it.icon ? icon(it.icon) : null, h('span', {}, it.label)));
    });
    portal(menu, anchor);
    const unplace = autoPlace(menu, anchor, { placement: opts.placement || 'bottom-end', offset: 6 });
    let picked = null;
    const ov = overlays.open({ el: menu, owner: anchor, onClose: () => { unplace(); menu.remove(); if (picked) onSelect(picked); } });
    const nav = new ListNav(menu, { items: '.o-chat-menu-item', onSelect: elx => { picked = elx.dataset.id; ov.close('select'); } });
    on(menu, 'keydown', e => { if (!nav.handle(e) && e.key === 'Tab') ov.close('tab'); });
    on(menu, 'click', '.o-chat-menu-item', (e, elx) => { picked = elx.dataset.id; ov.close('select'); });
    animate(menu, 'zoomIn', { duration: 120 });
    focusFirst(menu);
    return ov;
  }
  _openLightbox(el) {
    const m = this._msgById.get(String(el.dataset.mid));
    if (!m) return;
    const images = (m.attachments || []).filter(a => (a.type || '').startsWith('image'));
    const idx = +el.dataset.idx || 0;
    if (O.lightbox) O.lightbox(images.map(a => ({ src: a.url, thumb: a.thumb, title: a.name })), { index: idx });
    else win.open((images[idx] || {}).url, '_blank', 'noopener');
  }

  /* ── reply / edit ────────────────────────────────────────────────────── */
  _setReply(m) { this._replyTo = m; this._renderReplyBanner(); if (m) this._textarea.focus(); }
  _startEdit(m) { this._editingId = m.id; this._textarea.value = m.text || ''; this._autosize(); this._syncSendState(); this._renderReplyBanner(); this._textarea.focus(); }
  _cancelEdit() { this._editingId = null; this._textarea.value = ''; this._autosize(); this._syncSendState(); this._renderReplyBanner(); }
  _renderReplyBanner() {
    if (this._editingId) {
      const m = this._msgById.get(String(this._editingId));
      this._replyBanner.hidden = false;
      this._replyBanner.replaceChildren(iconEl('edit'), h('div', { class: 'o-chat-reply-info' }, h('b', {}, this.t('chat.editing')), h('span', {}, (m && m.text) || '')), h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'data-act': 'cancel-reply', 'aria-label': this.t('chat.cancelEdit') }, icon('x')));
    } else if (this._replyTo) {
      this._replyBanner.hidden = false;
      this._replyBanner.replaceChildren(iconEl('chat-reply'), h('div', { class: 'o-chat-reply-info' }, h('b', {}, this.t('chat.replyingTo', { name: (this._replyTo.author && this._replyTo.author.name) || '' })), h('span', {}, this._replyTo.text || '')), h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'data-act': 'cancel-reply', 'aria-label': this.t('chat.cancelReply') }, icon('x')));
    } else this._replyBanner.hidden = true;
  }

  /* ── attachments (composer) ──────────────────────────────────────────── */
  _addPendingFiles(files) {
    for (const f of files) {
      const isImg = f.type.startsWith('image/');
      this._pendingFiles.push({ id: uid('pend'), file: f, name: f.name, size: f.size, url: isImg ? URL.createObjectURL(f) : '', isImg });
    }
    this._renderAttachPreview(); this._syncSendState();
  }
  _removePendingFile(id) {
    const idx = this._pendingFiles.findIndex(p => p.id === id);
    if (idx >= 0) { const [p] = this._pendingFiles.splice(idx, 1); if (p.url) URL.revokeObjectURL(p.url); }
    this._renderAttachPreview(); this._syncSendState();
  }
  _renderAttachPreview() {
    if (!this._pendingFiles.length) { this._attachPreview.hidden = true; this._attachPreview.replaceChildren(); return; }
    this._attachPreview.hidden = false;
    this._attachPreview.replaceChildren(...this._pendingFiles.map(p => h('span', { class: 'o-chat-attach-chip' }, p.isImg ? h('img', { src: p.url, alt: '' }) : icon('file'), h('span', {}, p.name), h('button', { type: 'button', 'data-remove': p.id, 'aria-label': t('common.remove') }, icon('x')))));
  }

  /* ── voice note hook ─────────────────────────────────────────────────── */
  _toggleVoice() {
    if (!this._recording) {
      if (!this.emit('voice-note-start')) return;
      this._recording = true; this._recordStart = Date.now();
      this._micBtn.classList.add('is-active');
      this._paintVoiceBar();
      this._recordTimer = setInterval(() => this._paintVoiceBar(), 500);
    } else {
      this._recording = false;
      clearInterval(this._recordTimer);
      const duration = Date.now() - this._recordStart;
      this._micBtn.classList.remove('is-active');
      this._voiceBar.hidden = true;
      this.emit('voice-note-stop', { duration });
    }
  }
  _paintVoiceBar() {
    this._voiceBar.hidden = false;
    const secs = Math.floor((Date.now() - this._recordStart) / 1000);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0'), ss = String(secs % 60).padStart(2, '0');
    this._voiceBar.replaceChildren(h('span', { class: 'o-chat-recording-dot' }), h('div', { class: 'o-chat-reply-info' }, h('b', {}, this.t('chat.recording')), h('span', {}, mm + ':' + ss)), h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': this.t('chat.stopRecording') }, icon('x')));
    on(this._voiceBar.lastChild, 'click', () => this._toggleVoice());
  }

  /* ── emoji picker ────────────────────────────────────────────────────── */
  _openEmojiPicker() {
    if (O.mentions && O.mentions.emoji && O.mentions.emoji.picker) { O.mentions.emoji.picker(this._emojiBtn, { onSelect: ch => this._insertAtCursor(ch) }); return; }
    const panel = h('div', { class: 'o-floating o-chat-emoji-pop' });
    const grid = h('div', { class: 'o-chat-emoji-grid' });
    CHAT_FALLBACK_EMOJI.forEach(e => grid.append(h('button', { type: 'button', 'aria-label': e }, e)));
    panel.append(grid);
    portal(panel, this._emojiBtn);
    const unplace = autoPlace(panel, this._emojiBtn, { placement: 'top-start', offset: 6 });
    const ov = overlays.open({ el: panel, owner: this._emojiBtn, onClose: () => { unplace(); panel.remove(); } });
    on(grid, 'click', 'button', (e, btn) => { this._insertAtCursor(btn.textContent); ov.close('select'); });
    animate(panel, 'zoomIn', { duration: 120 });
    focusFirst(panel);
  }
  _insertAtCursor(str) {
    const ta = this._textarea;
    const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? ta.value.length;
    ta.focus(); ta.setRangeText(str, s, e, 'end');
    this._autosize(); this._syncSendState();
  }

  /* ── send / submit ───────────────────────────────────────────────────── */
  _submit() {
    if (!this.activeId) return;
    const text = this._textarea.value.trim();
    if (!text && !this._pendingFiles.length) return;
    if (this._editingId) { this.updateMessage(this._editingId, { text, editedAt: new Date().toISOString() }); this._cancelEdit(); return; }
    const attachments = this._pendingFiles.map(f => ({ id: uid('att'), name: f.name, size: f.size, type: f.file.type, url: f.url }));
    const message = { id: uid('msg'), conversationId: this.activeId, author: this.currentUser, text, attachments, replyTo: this._replyTo ? this._replyTo.id : null, reactions: {}, createdAt: new Date().toISOString(), status: 'sending' };
    this.addMessage(this.activeId, message);
    this._textarea.value = ''; this._autosize(); this._syncSendState();
    this._pendingFiles = []; this._renderAttachPreview();
    this._setReply(null);
    this.emit('send', { conversationId: this.activeId, message });
    this._runSend(message);
    this.scrollToBottom(true);
  }
  async _runSend(message) {
    if (isFn(this.onSend)) {
      try { const res = await this.onSend({ conversationId: message.conversationId, message }); this.updateMessage(message.id, { status: 'sent', ...(isObj(res) ? res : {}) }); }
      catch { this.updateMessage(message.id, { status: 'failed' }); }
    } else this.updateMessage(message.id, { status: 'sent' });
  }
  _retry(m) { this.updateMessage(m.id, { status: 'sending' }); this._runSend(this._msgById.get(String(m.id)) || m); }

  /* ── scrolling / history ─────────────────────────────────────────────── */
  _onScroll() {
    const box = this._messagesEl, cid = this.activeId;
    if (cid == null) return;
    if (box.scrollTop < 60) this._maybeLoadMore(cid);
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    if (atBottom) {
      this._newSince.set(cid, 0); this._jumpBtn.hidden = true;
      if ((this._convById.get(cid) || {}).unread > 0) this.markRead(cid);
    }
  }
  _maybeLoadMore(cid) {
    const all = this._msgIndex.get(String(cid)) || [];
    const winSize = this._windowSize.get(cid) || 40;
    if (winSize < all.length) { this._windowSize.set(cid, Math.min(all.length, winSize + 40)); this._renderThread(false); }
    else if (!this._loadMoreLock.has(cid)) {
      this._loadMoreLock.add(cid);
      this.emit('load-more', { conversationId: cid, oldest: all[0] || null });
      setTimeout(() => this._loadMoreLock.delete(cid), 1500);
    }
  }
  _paintJumpButton() {
    const n = this._newSince.get(String(this.activeId)) || 0;
    this._jumpBtn.hidden = !n;
    const badge = this._jumpBtn.querySelector('.o-badge');
    if (badge) badge.textContent = n > 99 ? '99+' : String(n);
  }

  /* ── typing indicator ────────────────────────────────────────────────── */
  _renderTypingIndicator() {
    const c = this._convById.get(this.activeId);
    const names = this._typingNames(this.activeId);
    if (names.length) this._headerSub.textContent = this.t('chat.typing', { count: names.length, names: names.join(', ') });
    else if (c && c.members && c.members.length) this._headerSub.textContent = this.t('chat.membersCount', { count: c.members.length });
    else this._headerSub.textContent = c && c.online ? this.t('chat.online') : '';

    let row = this._messagesEl.querySelector('.o-chat-typing-row');
    if (names.length) {
      if (!row) { row = h('div', { class: 'o-chat-typing-row' }, h('span', { class: 'o-chat-row-avatar', style: 'width:1.75rem' }), h('div', { class: 'o-chat-typing-bubble' }, h('i'), h('i'), h('i'))); }
      this._messagesEl.append(row);
      const atBottom = this._messagesEl.scrollHeight - this._messagesEl.scrollTop - this._messagesEl.clientHeight < 80;
      if (atBottom) this._messagesEl.scrollTop = this._messagesEl.scrollHeight;
    } else if (row) row.remove();
  }

  /* ── search-in-conversation ──────────────────────────────────────────── */
  _toggleThreadSearch(force) {
    this._threadSearchActive = force !== undefined ? force : !this._threadSearchActive;
    this._searchBar.hidden = !this._threadSearchActive;
    if (this._threadSearchActive) { this._threadSearchInput.value = ''; this._threadSearchQuery = ''; this._threadSearchInput.focus(); this._runThreadSearch(false); }
    else { this._threadSearchQuery = ''; this._clearMatches(); this._threadSearchCount.textContent = ''; }
  }
  _runThreadSearch(scroll = true) {
    this._threadSearchQuery = this._threadSearchInput.value.trim();
    const q = this._threadSearchQuery.toLowerCase();
    const rows = [...this._messagesEl.querySelectorAll('.o-chat-row[data-mid]')];
    this._clearMatches();
    this._threadMatches = q ? rows.filter(r => { const m = this._msgById.get(r.dataset.mid); return m && !m.system && (m.text || '').toLowerCase().includes(q); }) : [];
    this._threadMatches.forEach(r => { const b = r.querySelector('.o-chat-bubble'); if (b) b.classList.add('is-match'); });
    this._threadMatchIdx = this._threadMatches.length ? 0 : -1;
    this._threadSearchCount.textContent = !q ? '' : this._threadMatches.length ? (this._threadMatchIdx + 1) + ' / ' + this._threadMatches.length : t('common.noResults');
    if (scroll) this._gotoMatch(0);
  }
  _stepThreadSearch(dir) {
    if (!this._threadMatches.length) return;
    this._threadMatchIdx = (this._threadMatchIdx + dir + this._threadMatches.length) % this._threadMatches.length;
    this._gotoMatch(this._threadMatchIdx);
  }
  _gotoMatch(i) {
    const rows = this._threadMatches;
    rows.forEach(r => { const b = r.querySelector('.o-chat-bubble'); if (b) b.classList.remove('is-match-current'); });
    const el = rows[i];
    if (!el) return;
    const b = el.querySelector('.o-chat-bubble'); if (b) b.classList.add('is-match-current');
    el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    this._threadSearchCount.textContent = (i + 1) + ' / ' + rows.length;
  }
  _clearMatches() { this._messagesEl.querySelectorAll('.is-match,.is-match-current').forEach(el => el.classList.remove('is-match', 'is-match-current')); }

  /* ── layout: full / thread / widget ──────────────────────────────────── */
  _onLayoutChange() {
    if (this.layout === 'widget') {
      if (!this._fab) {
        this._fab = h('button', { type: 'button', class: 'o-chat-widget-fab', 'aria-label': this.t('chat.open') }, icon('chat-reply'), h('span', { class: 'o-badge o-badge-counter' }));
        this._badgeCounter = this._fab.querySelector('.o-badge');
        on(this._fab, 'click', () => { this.open = !this.open; });
        this.prepend(this._fab);
      }
      this._fab.hidden = false;
      this._panelWrap.hidden = !this.open;
      this._widgetCloseBtn.hidden = false;
    } else {
      if (this._fab) this._fab.hidden = true;
      this._panelWrap.hidden = false;
      this._widgetCloseBtn.hidden = true;
    }
    this._updateWidgetBadge();
  }
  _onOpenChange() {
    if (this.layout !== 'widget') return;
    this._panelWrap.hidden = !this.open;
    if (this.open) { this._renderHeader(); focusFirst(this._panelWrap); }
  }
  _updateWidgetBadge() {
    if (!this._badgeCounter) return;
    const total = this.conversations.reduce((s, c) => s + (c.unread || 0), 0);
    this._badgeCounter.textContent = total ? (total > 99 ? '99+' : String(total)) : '';
    this._badgeCounter.hidden = !total;
  }
}
define('o-chat', OChat);
O.Chat = OChat;
