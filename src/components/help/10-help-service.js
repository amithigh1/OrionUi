/* Orion.help — an article registry + a shared <o-help-panel> instance (auto-created on first use).
 *   Orion.help.register({ billing: { title: 'Billing', content: '<p>…</p>', related: ['invoices'], video } })
 *   Orion.help.open(key?)     opens the panel (home/search view when key is omitted)
 *   Orion.help.close() / toggle(key?) / search(query) -> [{ key, title, content, ... }]
 *   Orion.help.whatsThis(on?) toggles "What's this?" inspect mode (data-o-help elements light up; clicking one opens it)
 * F1 or ? (outside text fields) opens help; Escape cancels inspect mode. See 30-help-panel.js / 40-help-target.js.
 */
i18n.add('en', {
  help: {
    title: 'Help', searchPlaceholder: 'Search help…', noResults: 'No results found', related: 'Related articles',
    back: 'Back', forward: 'Forward', close: 'Close help', whatsThis: "What's this?", cancel: 'Cancel',
    inspectHint: 'Click any highlighted area for help.',
  },
});

const __articles = Object.create(null);
function __panel(create = true) {
  let el = doc.querySelector('o-help-panel');
  if (!el && create) { el = doc.createElement('o-help-panel'); doc.body.appendChild(el); }
  return el;
}
const help = {
  /** register({ key: { title, content, related: [keys], video } }) — merges into the registry. */
  register(map) { Object.assign(__articles, map || {}); return help; },
  get(key) { return __articles[key] || null; },
  keys() { return Object.keys(__articles); },
  search(q) { return fuzzySearch(help.keys().map(k => ({ key: k, ...__articles[k] })), q, a => (a.title || '') + ' ' + String(a.content || '').replace(/<[^>]+>/g, ' ')); },
  open(key) { const p = __panel(); p.open(key); return p; },
  close() { __panel(false)?.close(); },
  toggle(key) { const p = __panel(); p.isOpen ? p.close() : p.open(key); },
  get isOpen() { return !!__panel(false)?.isOpen; },
  /** whatsThis(true|false|undefined=toggle) — highlight every data-o-help element; click one to open it. */
  whatsThis(on) {
    if (!isBrowser) return;
    const val = on === undefined ? !doc.documentElement.classList.contains('o-help-inspect') : !!on;
    doc.documentElement.classList.toggle('o-help-inspect', val);
    __banner(val);
    bus.emit('help:inspect', val);
    if (val) announce(t('help.inspectHint'));
  },
  get inspecting() { return isBrowser && doc.documentElement.classList.contains('o-help-inspect'); },
};
O.help = help;

let __bannerEl = null;
function __banner(active) {
  if (!active) { __bannerEl?.remove(); __bannerEl = null; return; }
  if (__bannerEl) return;
  __bannerEl = h('div', { class: 'o-help-inspect-banner', role: 'status' },
    raw(String(icon('help-circle', { size: 16 }))), h('span', null, t('help.inspectHint')),
    h('button', { type: 'button', class: 'o-btn o-btn-sm o-btn-ghost' }, t('help.cancel')));
  on(__bannerEl, 'click', 'button', () => help.whatsThis(false));
  doc.body.appendChild(__bannerEl);
}

if (isBrowser) ready(() => {
  on(doc, 'keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(doc.activeElement?.tagName || '') || doc.activeElement?.isContentEditable;
    if (e.key === 'F1') { e.preventDefault(); help.open(); }
    else if (e.key === '?' && !typing) { e.preventDefault(); help.open(); }
    else if (e.key === 'Escape' && help.inspecting) { help.whatsThis(false); }
  });
});
