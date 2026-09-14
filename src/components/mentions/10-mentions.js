/* Orion.mentions(target, options) -> { destroy, close, getMentions, isOpen }
 *   target: <textarea> | <input> | [contenteditable] | <o-editor>
 *   options: {
 *     triggers: { '@': source, '#': source | { source, insert, render, onSelect, allowSpaces, startOfLine, minChars, limit, label } },
 *     source,               // shorthand for triggers['@']
 *     limit: 8, minChars: 0, debounce: 120, allowSpaces: true,
 *     insert(item, trigger) -> string | Node,       // default: "@label " (text) or a token <span class="o-mention">
 *     render(item, query) -> HTML string | Node,    // custom option row
 *     onSelect(item, trigger), texts
 *   }
 *   source: [{ id, label, avatar, description }] | async (query, trigger) => items | 'globalName'
 * Behavior: <textarea data-o-mentions="usersArrayOrFn" data-o-mentions-trigger="@">
 */

i18n.add('en', { mentions: { label: 'Suggestions', loading: 'Loading…', none: 'No matches', results: { one: '{count} suggestion', other: '{count} suggestions' } } });

const isField = el => el && (el.localName === 'textarea' || el.localName === 'input');

class Mentions {
  constructor(target, o = {}) {
    this.host = target && target.localName === 'o-editor' ? target : null;
    this.el = this.host ? (this.host.contentEl || this.host.querySelector('.o-editor-content')) : $(target);
    if (!this.el) throw new Error('Orion.mentions: target not found');
    this.o = { limit: 8, minChars: 0, debounce: 120, allowSpaces: true, maxLength: 40, ...o };
    const trig = o.triggers || { [o.trigger || '@']: o.source };
    this.triggers = {};
    for (const [ch, v] of Object.entries(trig)) {
      if (!v) continue;
      this.triggers[ch] = isObj(v) && !Array.isArray(v) && 'source' in v ? { ...v } : { source: v };
    }
    this.field = isField(this.el);
    this.inserted = [];
    this.items = [];
    this.active = -1;
    this.state = null;
    this.listId = uid('mentions');
    this._req = 0;
    this._fetchLater = debounce(() => this._fetch(), this.o.debounce);
    this._build();
    const el = this.el;
    if (this.field) el.setAttribute('aria-autocomplete', 'list');
    this._offs = [
      on(el, 'input', () => this._detect()),
      on(el, 'keydown', e => this._key(e), { capture: true }),
      on(el, 'click', () => this._detect()),
      on(el, 'keyup', e => { if (/^(Arrow(Left|Right)|Home|End)$/.test(e.key)) this._detect(); }),
      on(el, 'blur', () => setTimeout(() => { if (doc.activeElement !== this.el) this.close('blur'); }, 120)),
      on(el, 'scroll', () => this._pop && this._pop.update()),
    ];
  }
  get isOpen() { return !!this._pop; }
  _build() {
    this.list = h('div', { class: 'o-mentions-list', role: 'listbox', id: this.listId, 'aria-label': t('mentions.label') });
    on(this.list, 'mousedown', e => e.preventDefault());
    on(this.list, 'click', '.o-mentions-item', (e, it) => this._choose(+it.dataset.i));
    on(this.list, 'mousemove', '.o-mentions-item', (e, it) => { const i = +it.dataset.i; if (i !== this.active) this._setActive(i, false); });
  }
  /** Text before the caret (current line / text node) and helpers to map offsets. */
  _context() {
    if (this.field) {
      const el = this.el, pos = el.selectionStart;
      if (pos == null || pos !== el.selectionEnd) return null;
      const from = Math.max(0, pos - 120);
      const before = el.value.slice(from, pos);
      const nl = before.lastIndexOf('\n');
      return { text: nl >= 0 ? before.slice(nl + 1) : before, base: nl >= 0 ? from + nl + 1 : from, pos, lineStart: nl >= 0 || from === 0 ? true : false };
    }
    const sel = doc.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    let node = r.startContainer, off = r.startOffset;
    if (!this.el.contains(node)) return null;
    if (node.nodeType !== 3) {
      const prev = node.childNodes[off - 1];
      if (prev && prev.nodeType === 3) { node = prev; off = prev.data.length; } else return null;
    }
    const p = node.parentElement;
    if (p && p.closest('.o-mention, pre, code, a[href]')) return null;
    let text = node.data.slice(0, off);
    // is this text node the first content of its block? (for startOfLine triggers)
    let atStart = true;
    for (let n = node; n && n !== this.el; n = n.parentNode) {
      if (n.previousSibling && !(n.previousSibling.nodeType === 3 && !n.previousSibling.data.replace(/[\s\u200b]/g, ''))) { atStart = false; break; }
      if (n.parentNode && /^(P|H[1-6]|LI|DIV|BLOCKQUOTE|TD|TH)$/.test(n.parentNode.nodeName)) break;
    }
    return { text, base: 0, pos: off, node, lineStart: atStart };
  }
  _detect() {
    const ctx = this._context();
    if (!ctx) return this.close('caret');
    const text = ctx.text;
    let best = null;
    for (const [ch, cfg] of Object.entries(this.triggers)) {
      const allowSpaces = cfg.allowSpaces ?? this.o.allowSpaces;
      let idx = text.lastIndexOf(ch);
      while (idx >= 0) {
        const prev = text[idx - 1];
        const query = text.slice(idx + ch.length);
        const okPrev = idx === 0 || /[\s([{"'\u00a0\u200b]/.test(prev);
        const okQuery = query.length <= (cfg.maxLength || this.o.maxLength) && !/\n/.test(query) && (allowSpaces ? !/\s\s|^\s/.test(query) && query.split(/\s+/).length <= 3 : !/\s/.test(query));
        const okStart = !cfg.startOfLine || (!text.slice(0, idx).replace(/[\s\u200b]/g, '') && ctx.lineStart);
        if (okPrev && okQuery && okStart) { if (!best || idx > best.idx) best = { ch, cfg, idx, query }; break; }
        if (!okQuery) break;
        idx = text.lastIndexOf(ch, idx - 1);
      }
    }
    if (!best || best.query.length < (best.cfg.minChars ?? this.o.minChars)) return this.close('none');
    const start = ctx.base + best.idx;
    if (this._dismissed && this._dismissed.start === start && this._dismissed.node === ctx.node && this._dismissed.query === best.query) return;
    this._dismissed = null;
    const same = this.state && this.state.trigger === best.ch && this.state.start === start && this.state.node === ctx.node;
    this.state = { trigger: best.ch, cfg: best.cfg, start, end: ctx.pos, query: best.query, node: ctx.node };
    if (!same) this._anchor = null;
    this._fetch(true);
  }
  async _fetch(soon) {
    const st = this.state;
    if (!st) return;
    let src = st.cfg.source;
    if (isStr(src)) src = getPath(win, src);
    const limit = st.cfg.limit || this.o.limit;
    const id = ++this._req;
    let items;
    if (isFn(src)) {
      if (soon && this._pop && this.o.debounce) { this._fetchLater(); return; }
      if (!this._pop) this._show([], true);
      try { items = await src(st.query, st.trigger); } catch (e) { console.error('[Orion] mentions source failed:', e); items = []; }
      if (id !== this._req || !this.state) return;
      items = toArr(items).slice(0, limit);
    } else {
      items = fuzzySearch(toArr(src), st.query, it => (isStr(it) ? it : it.label || it.name || ''), limit);
    }
    items = items.map(it => (isStr(it) ? { id: it, label: it } : it));
    const hadSpace = /\s/.test(st.query);
    if (!items.length && (hadSpace || st.cfg.hideEmpty)) return this.close('empty');
    this._show(items, false);
  }
  _show(items, loading) {
    const st = this.state;
    this.items = items;
    const q = st.query;
    this.list.replaceChildren();
    if (loading) this.list.append(h('div', { class: 'o-mentions-status' }, h('span', { class: 'o-spinner o-spinner-xs' }), t('mentions.loading')));
    else if (!items.length) this.list.append(h('div', { class: 'o-mentions-status' }, t('mentions.none')));
    items.forEach((it, i) => {
      const row = h('div', { class: 'o-mentions-item', role: 'option', id: this.listId + '-' + i, 'data-i': i, 'aria-selected': 'false' });
      const render = st.cfg.render || this.o.render;
      const custom = render ? render(it, q, st.trigger) : null;
      if (custom != null) { if (custom instanceof Node) row.append(custom); else row.innerHTML = String(custom); }
      else {
        const label = it.label ?? it.name ?? '';
        if (it.emoji || it.char) row.append(h('span', { class: 'o-mentions-emoji' }, it.emoji || it.char));
        else if (it.icon) row.append(h('span', { class: 'o-mentions-icon' }, raw(String(icon(it.icon)))));
        else if (it.avatar !== false && st.trigger === '@') row.append(avatarEl(it));
        const text = h('span', { class: 'o-mentions-text' }, h('span', { class: 'o-mentions-label', html: highlight((it.emoji || it.char) ? ':' + label + ':' : label, q) }));
        if (it.description) text.append(h('span', { class: 'o-mentions-desc' }, it.description));
        row.append(text);
        if (it.hint) row.append(h('span', { class: 'o-mentions-hint' }, it.hint));
      }
      this.list.append(row);
    });
    if (!this._pop) this._open();
    this._setActive(items.length ? 0 : -1, true);
    if (!loading) announce(items.length ? t('mentions.results', { count: items.length }) : t('mentions.none'));
  }
  _open() {
    const el = this.el;
    const anchor = { getBoundingClientRect: () => this._anchorRect() || el.getBoundingClientRect() };
    this._pop = O.editorKit.popover(anchor, this.list, {
      role: 'presentation', className: 'o-mentions ' + (this.state.cfg.className || this.o.className || ''), placement: 'bottom-start', offset: 4,
      owner: this.host || el, returnFocus: false, onClose: () => { this._pop = null; this._aria(false); },
    });
    this._pop.el.removeAttribute('tabindex');
    this._aria(true);
  }
  _aria(open) {
    const el = this.el;
    if (open) { el.setAttribute('aria-expanded', 'true'); el.setAttribute('aria-controls', this.listId); }
    else { el.removeAttribute('aria-expanded'); el.removeAttribute('aria-controls'); el.removeAttribute('aria-activedescendant'); }
  }
  /** Viewport rect of the trigger character (cached while the trigger stays put). */
  _anchorRect() {
    const st = this.state;
    if (!st) return null;
    if (this.field) return O.editorKit.caretRect(this.el, st.start);
    if (!st.node || !st.node.isConnected) return this._anchor;
    try {
      const r = doc.createRange();
      r.setStart(st.node, Math.min(st.start, st.node.data.length));
      r.collapse(true);
      const rect = O.editorKit.rangeRect(r);
      if (rect) this._anchor = rect;
    } catch {}
    return this._anchor;
  }
  _setActive(i, scroll) {
    this.active = i;
    $$('.o-mentions-item', this.list).forEach((row, k) => { row.classList.toggle('is-active', k === i); row.setAttribute('aria-selected', String(k === i)); });
    const row = this.list.children[i];
    if (row && row.classList.contains('o-mentions-item')) {
      this.el.setAttribute('aria-activedescendant', row.id);
      const L = this.list;
      if (scroll && L.scrollHeight > L.clientHeight) {
        if (row.offsetTop < L.scrollTop) L.scrollTop = row.offsetTop;
        else if (row.offsetTop + row.offsetHeight > L.scrollTop + L.clientHeight) L.scrollTop = row.offsetTop + row.offsetHeight - L.clientHeight;
      }
    } else this.el.removeAttribute('aria-activedescendant');
  }
  _key(e) {
    if (!this._pop || e.isComposing) return;
    const n = this.items.length;
    const stop = () => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
    if (e.key === 'ArrowDown' && n) { stop(); this._setActive((this.active + 1) % n, true); }
    else if (e.key === 'ArrowUp' && n) { stop(); this._setActive((this.active - 1 + n) % n, true); }
    else if ((e.key === 'Enter' || e.key === 'Tab') && n && this.active >= 0 && !e.shiftKey) { stop(); this._choose(this.active); }
    else if (e.key === 'Escape') { stop(); this._dismissed = { start: this.state && this.state.start, node: this.state && this.state.node, query: this.state && this.state.query }; this.close('escape'); }
  }
  _choose(i) {
    const it = this.items[i], st = this.state;
    if (!it || !st) return;
    const cfg = st.cfg;
    const ins = cfg.insert || this.o.insert;
    let out = ins ? ins(it, st.trigger) : null;
    if (out == null) out = it.emoji || it.char || it.value || (this.field ? `${st.trigger}${it.label} ` : mentionToken(it, st.trigger));
    this.close('select');
    if (this.field) this._insertField(st, out);
    else this._insertRich(st, out);
    if (!(it.emoji || it.char)) this.inserted.push({ id: it.id, label: it.label, trigger: st.trigger, item: it });
    (cfg.onSelect || this.o.onSelect)?.(it, st.trigger);
    emit(this.host || this.el, 'o-mention', { item: it, trigger: st.trigger });
  }
  _insertField(st, out) {
    const el = this.el, text = out instanceof Node ? out.textContent : String(out);
    el.focus();
    el.setRangeText(text, st.start, el.selectionStart, 'end');
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: text }));
  }
  _insertRich(st, out) {
    const node = st.node;
    if (!node || !node.isConnected) return;
    this.el.focus({ preventScroll: true });
    const sel = doc.getSelection();
    const cur = sel.rangeCount ? sel.getRangeAt(0) : null;
    const end = cur && cur.startContainer === node ? cur.startOffset : Math.min(st.end, node.data.length);
    const r = doc.createRange();
    r.setStart(node, Math.min(st.start, node.data.length));
    r.setEnd(node, Math.max(Math.min(st.start, node.data.length), end));
    r.deleteContents();
    const frag = doc.createDocumentFragment();
    let last;
    if (out instanceof Node) {
      frag.append(out);
      last = doc.createTextNode('\u00a0');
      frag.append(last);
    } else if (out) { last = doc.createTextNode(String(out)); frag.append(last); }
    if (last) {
      r.insertNode(frag);
      const after = doc.createRange();
      after.setStart(last, last.data.length);
      after.collapse(true);
      sel.removeAllRanges(); sel.addRange(after);
    } else {
      sel.removeAllRanges(); sel.addRange(r);
    }
    this.el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
  }
  close(reason = 'api') {
    this._fetchLater.cancel();
    this._req++;
    if (reason !== 'refresh') this.state = null;
    if (this._pop) this._pop.close(reason === 'outside' ? 'outside' : 'api');
  }
  /** Mentions currently present in the target: [{ id, label, trigger }] */
  getMentions() {
    if (!this.field) return $$('.o-mention', this.el).map(m => ({ id: m.dataset.id, label: m.dataset.label || m.textContent.replace(/^[@#]/, ''), trigger: m.dataset.trigger || '@' }));
    const v = this.el.value, seen = new Set();
    return this.inserted.filter(m => { const k = m.trigger + m.id; if (seen.has(k) || !v.includes(m.trigger + m.label)) return false; seen.add(k); return true; }).map(({ id, label, trigger }) => ({ id, label, trigger }));
  }
  /** Change options at runtime (e.g. new triggers / sources). */
  update(o = {}) { Object.assign(this.o, o); if (o.triggers) { this.triggers = {}; for (const [ch, v] of Object.entries(o.triggers)) if (v) this.triggers[ch] = isObj(v) && !Array.isArray(v) && 'source' in v ? { ...v } : { source: v }; } }
  destroy() {
    this.close('destroy');
    this._offs.forEach(f => f());
    this._aria(false);
    this.el.removeAttribute('aria-autocomplete');
  }
}

function initialsOf(name) {
  if (O.avatar && O.avatar.initials) return O.avatar.initials(name);
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((p[0] || '')[0] || '').toUpperCase() + ((p.length > 1 ? p[p.length - 1][0] : (p[0] || '')[1]) || '').toUpperCase();
}
const AV_COLORS = ['primary', 'success', 'info', 'warning', 'danger', 'secondary'];
function colorOf(s) { if (O.avatar && O.avatar.colorFor) return O.avatar.colorFor(s); let n = 0; for (const ch of String(s || '')) n = (n * 31 + ch.codePointAt(0)) >>> 0; return AV_COLORS[n % AV_COLORS.length]; }
/** avatarEl({ label|name, avatar }, size) — lightweight avatar (no <o-avatar> dependency). */
function avatarEl(it, size = 'xs') {
  const name = it.label || it.name || '';
  const el = h('span', { class: `o-avatar o-avatar-${size} o-c-${colorOf(name)}`, 'aria-hidden': 'true' });
  if (it.avatar) {
    const img = h('img', { src: it.avatar, alt: '', loading: 'lazy' });
    img.onerror = () => { img.remove(); el.textContent = initialsOf(name); };
    el.append(img);
  } else el.textContent = initialsOf(name);
  return el;
}
/** mentionToken(item, trigger) -> <span class="o-mention" contenteditable="false" data-id data-trigger> */
function mentionToken(it, trigger = '@') {
  return h('span', { class: 'o-mention', contenteditable: 'false', 'data-id': it.id ?? it.label, 'data-label': it.label, 'data-trigger': trigger }, trigger + (it.label ?? ''));
}

function mentions(target, o) { return new Mentions(target, o); }
mentions.Mentions = Mentions;
mentions.emoji = emoji;
mentions.token = mentionToken;
mentions.avatar = avatarEl;
mentions.initials = initialsOf;
O.mentions = mentions;

behavior('data-o-mentions', (el, value) => {
  let src = null;
  const v = String(value || '').trim();
  if (/^[[{]/.test(v)) src = parseJSON(v, []);
  else if (v) src = getPath(win, v);
  const trig = el.getAttribute('data-o-mentions-trigger') || '@';
  const triggers = { [trig]: src || [] };
  if (el.hasAttribute('data-o-mentions-emoji')) triggers[':'] = { source: emoji.source, minChars: 1 };
  const ctl = mentions(el, { triggers });
  el.__oMentions = ctl;
  return () => { ctl.destroy(); delete el.__oMentions; };
});
