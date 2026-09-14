/* Orion.shortcuts — keyboard shortcuts with sequences, alternatives, scopes and a help overlay.
 *   const off = Orion.shortcuts.add('mod+k', e => palette(), { description: 'Command palette', group: 'General' });
 *   Orion.shortcuts.add('g i', goInbox, { description: 'Go to inbox', group: 'Navigation' });   // sequence (1s between keys)
 *   Orion.shortcuts.add('mod+s, ctrl+shift+s', save);                                            // alternatives
 *   options: { description, group, scope: 'global'|name|'*', preventDefault: true, allowInInputs: false, repeat: false, when: e => bool, hidden }
 *   Orion.shortcuts.pushScope('modal', { exclusive }) -> pop()  ·  popScope('modal')  ·  scope   (global bindings stay active unless exclusive)
 *   Orion.shortcuts.enable() / disable() · format('mod+shift+p') -> "⌘⇧P" | "Ctrl+Shift+P" · kbd(combo) -> <kbd> HTML
 *   Orion.shortcuts.help() / closeHelp() / toggleHelp()   (opened with "?" — configure({ helpKey: 'shift+/' | false }))
 *   await Orion.shortcuts.record() -> 'mod+shift+k'   (capture the next combo, e.g. for user-defined shortcuts)
 *   <button data-o-shortcut="mod+s" data-o-shortcut-hint="title|kbd|none" data-o-shortcut-scope data-o-shortcut-group data-o-shortcut-description>
 */
i18n.add('en', {
  shortcuts: {
    title: 'Keyboard shortcuts', search: 'Search shortcuts…', empty: 'No shortcuts match “{q}”', then: 'then', or: 'or',
    general: 'General', page: 'On this page', showHelp: 'Show keyboard shortcuts', footer: 'Press {key} to open this list at any time',
    recording: 'Press a key combination…',
  },
});

const IS_MAC = isBrowser && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);
const MOD_ALIAS = { mod: 'mod', cmd: 'meta', command: 'meta', meta: 'meta', super: 'meta', win: 'meta', ctrl: 'ctrl', control: 'ctrl', alt: 'alt', option: 'alt', opt: 'alt', shift: 'shift' };
const KEY_ALIAS = { esc: 'escape', return: 'enter', del: 'delete', ins: 'insert', up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright',
  space: ' ', spacebar: ' ', plus: '+', comma: ',', minus: '-', period: '.', dot: '.', slash: '/', backslash: '\\', pgup: 'pageup', pgdn: 'pagedown', question: '?' };
const MOD_KEYS = new Set(['shift', 'control', 'alt', 'meta', 'os', 'altgraph', 'capslock', 'fn', 'fnlock', 'hyper', 'super', 'numlock', 'scrolllock']);
const CODE_KEY = { Slash: '/', Period: '.', Comma: ',', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backquote: '`', Backslash: '\\', Space: ' ' };

function __step(str, mac) {
  const parts = str.toLowerCase().split('+');
  let key = parts.pop();
  if (key === '' && parts[parts.length - 1] === '') { parts.pop(); key = '+'; }
  key = KEY_ALIAS[key] ?? key;
  const s = { key, ctrl: false, alt: false, shift: false, meta: false, mod: false };
  for (const p of parts) { const m = MOD_ALIAS[p.trim()]; if (m === 'mod') { s.mod = true; s[mac ? 'meta' : 'ctrl'] = true; } else if (m) s[m] = true; }
  s.symbol = key.length === 1 && !/[a-z0-9 ]/.test(key);   // "?", "+", "!": shift is implied by the character
  return s;
}
/** parse('mod+s, g i') -> [[step], [step, step]]  (alternatives of sequences) */
function parseCombo(combo, mac = IS_MAC) {
  return String(combo).split(/,(?=\s*[^\s,])/).map(a => a.trim()).filter(Boolean)
    .map(alt => (alt === ' ' ? [' '] : alt.split(/\s+/)).map(s => __step(s, mac)));
}
const __evKey = e => { const k = e.key; return !k || k === 'Unidentified' || k === 'Dead' ? '' : k.toLowerCase(); };
const __codeKey = e => { const c = e.code || ''; if (c.startsWith('Key')) return c.slice(3).toLowerCase(); if (c.startsWith('Digit')) return c.slice(5); if (/^Numpad\d$/.test(c)) return c.slice(6); return CODE_KEY[c] || ''; };
function __match(s, e, k, ck) {
  const ag = e.getModifierState?.('AltGraph');
  if (s.ctrl !== (e.ctrlKey && !ag) || s.meta !== e.metaKey || s.alt !== (e.altKey && !ag)) return false;
  if (!s.symbol && s.shift !== e.shiftKey) return false;
  return s.key === k || (!s.symbol && !/^[a-z0-9]$/.test(k) && s.key === ck);
}
/** true when the element is a place where the user types text */
function isTyping(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName === 'INPUT') return !/^(checkbox|radio|button|submit|reset|range|color|file|image|hidden)$/i.test(el.type);
  return el.getAttribute('role') === 'textbox' || el.getAttribute('role') === 'combobox';
}

/* ── labels ────────────────────────────────────────────────────────── */
const MAC_MOD = [['meta', '⌘'], ['ctrl', '⌃'], ['alt', '⌥'], ['shift', '⇧']];
const PC_MOD = [['ctrl', 'Ctrl'], ['alt', 'Alt'], ['shift', 'Shift'], ['meta', isBrowser && /Win/i.test(navigator.platform || '') ? 'Win' : 'Meta']];
function __keyLabel(k, mac) {
  const L = { arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', escape: 'Esc', ' ': 'Space', pageup: 'PgUp', pagedown: 'PgDn', insert: 'Ins', capslock: 'Caps',
    enter: mac ? '↵' : 'Enter', backspace: mac ? '⌫' : 'Backspace', delete: mac ? '⌦' : 'Del', tab: mac ? '⇥' : 'Tab' };
  return L[k] || (k.length === 1 ? k.toUpperCase() : /^f\d+$/.test(k) ? k.toUpperCase() : cap(k));
}
const __stepKeys = (s, mac) => [...(mac ? MAC_MOD : PC_MOD).filter(([m]) => s[m] && !(m === 'shift' && s.symbol)).map(([, l]) => l), __keyLabel(s.key, mac)];
/** format('mod+shift+p') -> "⌘⇧P" on Mac, "Ctrl+Shift+P" elsewhere. Sequences: "G then I"; alternatives joined with ", ". */
function format(combo, { mac = IS_MAC } = {}) {
  return parseCombo(combo, mac).map(alt => alt.map(s => __stepKeys(s, mac).join(mac ? '' : '+')).join(' ' + t('shortcuts.then') + ' ')).join(', ');
}
/** kbd(combo) -> SafeHTML with one <kbd class="o-kbd"> per key */
function kbd(combo, { mac = IS_MAC } = {}) {
  const alts = parseCombo(combo, mac).map(alt => alt.map(s => __stepKeys(s, mac).map(k => `<kbd class="o-kbd">${esc(k)}</kbd>`).join('')).join(`<span class="o-sc-then">${esc(t('shortcuts.then'))}</span>`));
  return raw(`<span class="o-sc-keys">${alts.join(`<span class="o-sc-or">${esc(t('shortcuts.or'))}</span>`)}</span>`);
}
/** aria-keyshortcuts value (single-step alternatives only) */
function ariaKeys(combo) {
  const name = k => ({ ' ': 'Space', arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', pageup: 'PageUp', pagedown: 'PageDown' }[k] || (k.length === 1 ? k.toUpperCase() : cap(k)));
  return parseCombo(combo).filter(a => a.length === 1).map(([s]) => [s.ctrl && 'Control', s.alt && 'Alt', s.shift && !s.symbol && 'Shift', s.meta && 'Meta', name(s.key)].filter(Boolean).join('+')).join(' ');
}

/* ── registry & dispatcher ─────────────────────────────────────────── */
const __binds = [];
const __scopes = [];
let __on = true, __pending = [], __lastT = 0, __n = 0, __listening = false;
const cfg = { sequenceTimeout: 1000, helpKey: '?' };

function __eligible(b, e, typing) {
  if (!b.enabled) return false;
  const top = __scopes[__scopes.length - 1];
  const scopeOk = b.scope === '*' || (b.scope === 'global' ? !top?.exclusive : top?.name === b.scope);
  return scopeOk && (!typing || b.allowInInputs) && (!b.when || b.when(e) !== false);
}
function __onKey(e) {
  if (!__on || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
  const k = __evKey(e);
  if (!k || MOD_KEYS.has(k)) return;
  const ck = __codeKey(e), target = e.composedPath ? e.composedPath()[0] : e.target, typing = isTyping(target), now = Date.now();
  if (now - __lastT > cfg.sequenceTimeout) __pending = [];
  __lastT = now;
  const next = [];
  let hit = null, completed = false;
  for (const p of __pending) {
    if (!__eligible(p.b, e, typing) || !__match(p.alt[p.i], e, k, ck)) continue;
    if (p.i === p.alt.length - 1) { hit = hit || p.b; completed = true; } else next.push({ ...p, i: p.i + 1 });
  }
  if (!hit) {
    const ranked = __binds.filter(b => __eligible(b, e, typing)).sort((a, b) => (b.scope !== 'global' && b.scope !== '*') - (a.scope !== 'global' && a.scope !== '*') || b.order - a.order);
    for (const b of ranked) for (const alt of b.alts) {
      if (!__match(alt[0], e, k, ck)) continue;
      if (alt.length === 1) hit = hit || b; else next.push({ b, alt, i: 1 });
    }
  }
  // a completed sequence consumes the key; a single-key hit may also start a longer sequence
  __pending = completed ? [] : next;
  if (!hit) { if (next.length && next.some(p => { const s = p.alt[p.i - 1]; return s.ctrl || s.meta || s.alt; })) e.preventDefault(); return; }
  if (hit.preventDefault) e.preventDefault();
  if (e.repeat && !hit.repeat) return;
  try { if (hit.handler(e, { combo: hit.combo, binding: hit, scope: shortcuts.scope }) === false) e.preventDefault(); }
  catch (err) { console.error('[Orion] shortcut "' + hit.combo + '" failed:', err); }
}
function __listen() { if (!__listening && isBrowser) { __listening = true; win.addEventListener('keydown', __onKey); } }

const shortcuts = {
  get isMac() { return IS_MAC; },
  get enabled() { return __on; },
  get scope() { return __scopes[__scopes.length - 1]?.name || 'global'; },
  get scopes() { return __scopes.map(s => s.name); },
  /** add(combo | { combo: handler }, handler, options) -> remove() */
  add(combo, handler, opts = {}) {
    if (isObj(combo)) { const offs = Object.entries(combo).map(([c, fn]) => shortcuts.add(c, fn, handler || {})); return () => offs.forEach(f => f()); }
    if (!isFn(handler)) throw new TypeError('shortcuts.add: handler must be a function');
    const b = { id: uid('sc'), combo: String(combo), alts: parseCombo(combo), handler, order: ++__n, enabled: true, description: '', group: '', scope: 'global', preventDefault: true, allowInInputs: false, repeat: false, hidden: false, ...opts };
    __binds.push(b);
    __listen();
    bus.emit('shortcuts:change');
    return () => shortcuts.remove(b);
  },
  /** remove(bindingOrId | combo, handler?) */
  remove(x, handler) {
    for (let i = __binds.length - 1; i >= 0; i--) { const b = __binds[i]; if (b === x || b.id === x || (b.combo === x && (!handler || b.handler === handler))) __binds.splice(i, 1); }
    __pending = __pending.filter(p => __binds.includes(p.b));
    bus.emit('shortcuts:change');
  },
  /** pushScope(name, { exclusive }) -> pop() ; exclusive scopes also silence global bindings */
  pushScope(name, { exclusive = false } = {}) { const s = { name: String(name), exclusive }; __scopes.push(s); __pending = []; return () => { const i = __scopes.lastIndexOf(s); if (i >= 0) __scopes.splice(i, 1); }; },
  popScope(name) { const i = name == null ? __scopes.length - 1 : __scopes.map(s => s.name).lastIndexOf(name); if (i >= 0) __scopes.splice(i, 1); __pending = []; return shortcuts.scope; },
  setScope(name) { __scopes.length = 0; if (name && name !== 'global') __scopes.push({ name, exclusive: false }); return shortcuts; },
  enable() { __on = true; return shortcuts; },
  disable() { __on = false; __pending = []; return shortcuts; },
  /** list({ scope, all }) -> bindings with a description (active ones unless all: true) */
  list({ all = false, scope } = {}) {
    const top = __scopes[__scopes.length - 1];
    const activeNow = b => b.scope === '*' || (b.scope === 'global' ? !top?.exclusive : top?.name === b.scope);
    return __binds.filter(b => !b.hidden && b.description && (all || ((scope ? b.scope === scope : activeNow(b)) && (!b.available || b.available()))))
      .map(b => ({ id: b.id, combo: b.combo, description: isFn(b.description) ? b.description() : b.description, group: (isFn(b.group) ? b.group() : b.group) || t('shortcuts.general'), scope: b.scope, formatted: format(b.combo), enabled: b.enabled }));
  },
  /** Run the handler registered for combo (tests, menus). */
  trigger(combo, e = null) { const b = [...__binds].reverse().find(x => x.combo === combo && x.enabled); if (b) b.handler(e || new CustomEvent('o-shortcut'), { combo, binding: b, scope: shortcuts.scope }); return !!b; },
  configure(o = {}) { if ('sequenceTimeout' in o) cfg.sequenceTimeout = o.sequenceTimeout; if ('helpKey' in o) { cfg.helpKey = o.helpKey; __helpBinding(); } return shortcuts; },
  /** record() -> Promise<string> of the next key combination pressed ('mod+shift+k'); Escape cancels (resolves null). */
  record({ allowEscape = false } = {}) {
    return new Promise(resolve => {
      const fn = e => {
        const combo = shortcuts.comboFromEvent(e);
        if (!combo) return;
        e.preventDefault(); e.stopPropagation();
        doc.removeEventListener('keydown', fn, true);
        resolve(combo === 'escape' && !allowEscape ? null : combo);
      };
      doc.addEventListener('keydown', fn, true);
    });
  },
  /** comboFromEvent(keydownEvent) -> 'mod+shift+k' (null for bare modifier keys) */
  comboFromEvent(e) {
    const k = __evKey(e);
    if (!k || MOD_KEYS.has(k)) return null;
    const code = __codeKey(e);
    let key = { ' ': 'space', '+': 'plus', ',': 'comma' }[k] || k;
    if (key.length === 1 && !/^[a-z0-9]$/.test(key) && (e.altKey || e.ctrlKey || e.metaKey) && code) key = code;   // Option+letter on macOS
    const symbol = key.length === 1 && !/^[a-z0-9]$/.test(key);
    return [(IS_MAC ? e.metaKey : e.ctrlKey) && 'mod', (IS_MAC ? e.ctrlKey : e.metaKey) && (IS_MAC ? 'ctrl' : 'meta'), e.altKey && 'alt', e.shiftKey && !symbol && 'shift', key].filter(Boolean).join('+');
  },
  parse: parseCombo, format, kbd, ariaKeys, isTyping,
  help: (o) => __help.open(o), closeHelp: () => __help.close(), toggleHelp: (o) => (__help.isOpen ? __help.close() : __help.open(o)),
  get helpOpen() { return __help.isOpen; },
};

/* ── help overlay (own dialog on core overlays) ─────────────────────── */
const __help = {
  isOpen: false,
  open({ title } = {}) {
    if (!isBrowser || this.isOpen) return;
    const id = uid('sc');
    const input = h('input', { class: 'o-input', type: 'search', placeholder: t('shortcuts.search'), 'aria-label': t('shortcuts.search'), autocomplete: 'off', spellcheck: 'false' });
    const body = h('div', { class: 'o-sc-body o-scroll', tabindex: '-1' });
    const close = h('button', { type: 'button', class: 'o-btn-close', 'aria-label': t('common.close'), onClick: () => this.close() });
    const foot = h('div', { class: 'o-sc-foot' });
    if (cfg.helpKey) foot.innerHTML = esc(t('shortcuts.footer', { key: '\u0001' })).replace('\u0001', String(kbd(cfg.helpKey)));
    const dlg = h('div', { class: 'o-sc-dialog o-floating', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id },
      h('div', { class: 'o-sc-head' }, h('h2', { class: 'o-sc-title', id, text: title || t('shortcuts.title') }), close),
      h('div', { class: 'o-sc-search' }, h('div', { class: 'o-input-wrap' }, iconEl('search'), input)), body, cfg.helpKey ? foot : null);
    const layer = h('div', { class: 'o-sc-layer' }, h('div', { class: 'o-backdrop', onClick: () => this.close() }), dlg);
    const items = shortcuts.list();   // snapshot before our own exclusive scope is pushed
    const render = () => {
      const q = input.value.trim();
      const found = q ? items.filter(b => fuzzy(q, b.description + ' ' + b.group + ' ' + b.formatted)) : items;
      const groups = new Map();
      found.forEach(b => { if (!groups.has(b.group)) groups.set(b.group, []); groups.get(b.group).push(b); });
      body.innerHTML = groups.size ? [...groups].map(([g, list]) => String(html`<section class="o-sc-group" aria-label="${g}"><h3 class="o-sc-group-title">${g}</h3><ul class="o-sc-list" role="list">${list.map(b => html`<li class="o-sc-row"><span class="o-sc-desc">${raw(highlight(b.description, q))}</span>${kbd(b.combo)}</li>`)}</ul></section>`)).join('')
        : String(html`<div class="o-empty o-empty-sm"><p class="o-empty-text">${t('shortcuts.empty', { q })}</p></div>`);
      if (q) announce(t('common.items', { count: found.length }));
    };
    on(input, 'input', debounce(render, 80));
    on(input, 'keydown', e => { if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; render(); } });
    render();
    portal(layer, doc.body);
    this.isOpen = true;
    const pop = shortcuts.pushScope('o-shortcuts-help', { exclusive: true });
    this._ov = overlays.open({
      el: layer, modal: true, trap: true, lockScroll: true, outside: false,
      onClose: () => { this.isOpen = false; this._ov = null; pop(); layer.remove(); bus.emit('shortcuts:help', { open: false }); },
    });
    animate(dlg, 'zoomIn', { duration: 160 });
    input.focus();
    bus.emit('shortcuts:help', { open: true });
  },
  close() { this._ov?.close('api'); },
};

let __helpOff = null;
function __helpBinding() {
  __helpOff?.(); __helpOff = null;
  if (!cfg.helpKey) return;
  __helpOff = shortcuts.add(cfg.helpKey, () => shortcuts.toggleHelp(), { description: () => t('shortcuts.showHelp'), group: () => t('shortcuts.general'), scope: '*' });
}
__helpBinding();

/* ── <el data-o-shortcut="mod+s"> ──────────────────────────────────── */
behavior('data-o-shortcut', (el, combo) => {
  if (!combo) return;
  const A = n => el.getAttribute('data-o-shortcut-' + n);
  const origTitle = el.getAttribute('title'), origAria = el.getAttribute('aria-keyshortcuts');
  let hint = null;
  const ownText = () => [...el.childNodes].filter(n => n !== hint).map(n => n.textContent).join('').trim().replace(/\s+/g, ' ');
  const label = () => A('description') || el.getAttribute('aria-label') || origTitle || ownText() || el.getAttribute('placeholder') || el.closest('label')?.textContent.trim() || combo;
  const usable = () => el.isConnected && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !el.closest('[inert],[hidden]') && isVisible(el);
  const off = shortcuts.add(combo, () => {
    if (isTyping(el) || el.tagName === 'SELECT' || el instanceof FormElement) { el.focus(); if (isFn(el.select) && el.tagName === 'INPUT') el.select(); }
    else el.click();
  }, { description: label, group: () => A('group') || t('shortcuts.page'), scope: A('scope') || 'global', allowInInputs: el.hasAttribute('data-o-shortcut-inputs'), when: usable, available: usable, element: el });
  const aria = ariaKeys(combo);
  if (aria) el.setAttribute('aria-keyshortcuts', aria);
  const mode = A('hint') || 'title';
  if (mode !== 'none') el.setAttribute('title', `${origTitle || label()} (${format(combo)})`);
  if (mode === 'kbd') { hint = h('span', { class: 'o-shortcut-hint', 'aria-hidden': 'true' }, kbd(combo)); el.append(hint); }
  return () => {
    off(); hint?.remove();
    if (origTitle == null) el.removeAttribute('title'); else el.setAttribute('title', origTitle);
    if (origAria == null) el.removeAttribute('aria-keyshortcuts'); else el.setAttribute('aria-keyshortcuts', origAria);
  };
});

O.shortcuts = shortcuts;
