/* Sidebar: navigation tree behaviors.
 *   <aside class="o-sidebar" data-o-sidebar aria-label="Main">           (data-o-sidebar="manual" = no URL detection)
 *     <div class="o-sidebar-brand">…</div>
 *     <div class="o-sidebar-search"><input class="o-input" type="search"></div>   (filters the menu)
 *     <nav class="o-sidebar-body"><ul class="o-menu">
 *       <li class="o-menu-heading">Main</li>
 *       <li class="o-menu-item"><a class="o-menu-link" href="/"><o-icon class="o-menu-icon" name="home"></o-icon><span class="o-menu-label">Home</span></a></li>
 *       <li class="o-menu-item"><button class="o-menu-link o-menu-toggle" aria-expanded="false">…</button><ul class="o-menu-sub" hidden>…</ul></li>
 *     </ul></nav>
 *     <div class="o-sidebar-footer">…</div>
 *   </aside>
 * Group toggles and keyboard work for every .o-menu (delegated). Links: data-o-active="exact|prefix|none".
 * Options: data-o-sidebar-accordion (one open group per level), data-o-sidebar-resizable.
 * API: Orion.sidebar.sync(el?) · setActive(el, hrefOrLink) · filter(el, q) · open(toggle) · close(toggle) · expandAll(el) · collapseAll(el)
 * Events: o-menu-toggle { open } (on the toggle), o-menu-active { link, href, label } (on the sidebar / menu root).
 */
i18n.add('en', { sidebar: { search: 'Search menu…', noResults: 'No matching pages', resize: 'Resize sidebar' } });

const isMini = sb => !!sb && sb.matches('.is-mini, .is-mini .o-sidebar');
const rootOf = el => el.closest('.o-sidebar-flyout, o-sidebar-menu, .o-sidebar') || el.closest('.o-menu:not(.o-menu .o-menu)') || el.closest('.o-menu');
const labelOf = el => ((el.querySelector(':scope > .o-menu-label') || el.querySelector('.o-menu-label') || el).textContent || '').trim();
function subOf(t) {
  const id = t.getAttribute('aria-controls');
  return (id && t.getRootNode().getElementById?.(id)) || t.parentElement?.querySelector(':scope > .o-menu-sub') || null;
}
const toggleOf = sub => sub?.parentElement?.querySelector(':scope > .o-menu-toggle') || null;

/** Open/close one group. */
function setGroup(t, open, { anim = true, silent = false } = {}) {
  const sub = subOf(t); if (!sub) return;
  if (!sub.id) sub.id = uid('o-menu');
  if (!t.hasAttribute('aria-controls')) t.setAttribute('aria-controls', sub.id);
  if ((t.getAttribute('aria-expanded') === 'true') === open && sub.hidden === !open) return;
  t.setAttribute('aria-expanded', String(open));
  t.closest('.o-menu-item')?.classList.toggle('is-open', open);
  if (anim && !reducedMotion()) collapse(sub, open); else { sub.hidden = !open; sub.style.height = ''; }
  if (open && t.closest('[data-o-sidebar-accordion], o-sidebar-menu[accordion]')) {
    const list = t.closest('.o-menu-item')?.parentElement;
    list && $$(':scope > .o-menu-item > .o-menu-toggle[aria-expanded="true"]', list).forEach(x => x !== t && setGroup(x, false, { anim }));
  }
  if (!silent) emit(t, 'o-menu-toggle', { open, label: labelOf(t) });
}

/* ── active link detection ─────────────────────────────────────────── */
const normPath = p => (p.replace(/\/index\.html?$/i, '/').replace(/\/+$/, '') || '/');
/** Score how well a link matches the current location (0 = no match, higher = more specific). */
function urlScore(a, loc = location) {
  const mode = a.getAttribute('data-o-active') || a.closest('[data-o-active]')?.getAttribute('data-o-active') || 'auto';
  const raw = a.getAttribute('href');
  if (mode === 'none' || !raw || raw === '#' || /^(javascript|mailto|tel):/i.test(raw)) return 0;
  let u; try { u = new URL(raw, loc.href); } catch { return 0; }
  if (u.origin !== loc.origin) return 0;
  const p = normPath(loc.pathname), lp = normPath(u.pathname);
  if (u.hash.length > 1) { // hash routes (#/users) or in-page links
    if (lp !== p) return 0;
    const h = decodeURIComponent(loc.hash), lh = decodeURIComponent(u.hash).replace(/\/$/, '');
    if (h === lh || h === lh + '/') return 2000 + lh.length;
    return mode !== 'exact' && lh.length > 2 && h.startsWith(lh + '/') ? 1000 + lh.length : 0;
  }
  if (u.search && u.search !== loc.search) return 0;
  if (lp === p) return 900 + lp.length + (u.search ? 5 : 0);
  return mode !== 'exact' && lp !== '/' && p.startsWith(lp + '/') ? 300 + lp.length : 0;
}
/** Mark one link active: aria-current, .is-active, ancestors .has-active + expanded. */
function applyActive(root, link, { scroll = false } = {}) {
  const own = x => root.matches('o-sidebar-menu') || !x.closest('o-sidebar-menu');
  $$('.o-menu-link.is-active, .o-menu-link[aria-current="page"]', root).forEach(x => { if (x !== link && own(x)) { x.classList.remove('is-active'); x.removeAttribute('aria-current'); } });
  $$('.has-active', root).forEach(x => own(x) && x.classList.remove('has-active'));
  if (!link) return;
  link.classList.add('is-active');
  link.setAttribute('aria-current', 'page');
  for (let it = link.closest('.o-menu-item')?.parentElement?.closest('.o-menu-item'); it && root.contains(it); it = it.parentElement?.closest('.o-menu-item')) {
    it.classList.add('has-active');
    const t = it.querySelector(':scope > .o-menu-toggle');
    if (t) setGroup(t, true, { anim: false, silent: true });
  }
  if (scroll) {
    const body = link.closest('.o-sidebar-body, .o-scroll');
    if (body) { const r = link.getBoundingClientRect(), b = body.getBoundingClientRect(); if (r.top < b.top || r.bottom > b.bottom) body.scrollTop += r.top - b.top - b.height / 2 + r.height / 2; }
  }
  emit(root, 'o-menu-active', { link, href: link.getAttribute('href'), label: labelOf(link) });
}
/** Detect the active link of a sidebar from the URL (links inside <o-sidebar-menu current> are left alone). */
function syncActive(root, { scroll = false } = {}) {
  let best = null, score = 0;
  for (const a of $$('a.o-menu-link[href]', root)) {
    if (a.closest('o-sidebar-menu') && !root.matches('o-sidebar-menu')) continue;
    const s = urlScore(a); if (s > score) { score = s; best = a; }
  }
  if (best && (scroll || !best.classList.contains('is-active'))) applyActive(root, best, { scroll });
  return best;
}

/* ── search filter ─────────────────────────────────────────────────── */
const HL = 'o-menu-match';
function filterMenu(sb, q) {
  q = String(q || '').trim();
  const items = $$('.o-menu-item', sb).filter(it => !it.closest('o-sidebar-menu') || sb.contains(it));
  const toggles = $$('.o-menu-toggle', sb);
  let empty = sb.querySelector('.o-sidebar-empty');
  const hl = win.CSS?.highlights && win.Highlight ? [] : null;
  if (!q) {
    items.forEach(it => { it.hidden = false; });
    $$('.o-menu-heading', sb).forEach(x => { x.hidden = false; });
    if (sb.__saved) { toggles.forEach(t => setGroup(t, !!sb.__saved.get(t), { anim: false, silent: true })); sb.__saved = null; }
    if (empty) empty.hidden = true;
    if (hl) CSS.highlights.delete(HL);
    sb.classList.remove('is-filtering');
    return 0;
  }
  if (!sb.__saved) sb.__saved = new Map(toggles.map(t => [t, t.getAttribute('aria-expanded') === 'true']));
  sb.classList.add('is-filtering');
  const show = new Set();
  const own = it => it.querySelector(':scope > .o-menu-link');
  items.forEach(it => {
    const link = own(it); if (!link) return;
    const lbl = link.querySelector('.o-menu-label')?.firstChild || null, txt = lbl && lbl.nodeType === 3;
    const m = fuzzy(q, txt ? lbl.data : labelOf(link)); if (!m) return;
    for (let x = it; x && sb.contains(x); x = x.parentElement?.closest('.o-menu-item')) show.add(x);
    if (link.classList.contains('o-menu-toggle')) $$('.o-menu-item', it).forEach(d => show.add(d));
    if (hl && txt) m.ranges.forEach(([s, e]) => { const r = new Range(); r.setStart(lbl, Math.min(s, lbl.length)); r.setEnd(lbl, Math.min(e, lbl.length)); hl.push(r); });
  });
  items.forEach(it => { it.hidden = !show.has(it); });
  toggles.forEach(t => setGroup(t, show.has(t.closest('.o-menu-item')) && $$(':scope > .o-menu-sub > .o-menu-item', t.parentElement).some(c => show.has(c)), { anim: false, silent: true }));
  $$('.o-menu', sb).forEach(menu => {
    let head = null, any = false;
    const close = () => { if (head) head.hidden = !any; };
    for (const c of menu.children) {
      if (c.classList.contains('o-menu-heading')) { close(); head = c; any = false; } else if (c.classList.contains('o-menu-item') && !c.hidden) any = true;
    }
    close();
  });
  if (hl) CSS.highlights.set(HL, new Highlight(...hl));
  const n = items.filter(it => !it.hidden && own(it) && !own(it).classList.contains('o-menu-toggle')).length;
  if (!n) {
    if (!empty) { empty = h('div', { class: 'o-sidebar-empty', role: 'status' }); (sb.querySelector('.o-sidebar-body') || sb).append(empty); }
    empty.textContent = t('sidebar.noResults'); empty.hidden = false;
  } else if (empty) empty.hidden = true;
  return n;
}

/* ── delegated interactions for every .o-menu ──────────────────────── */
const visibleLinks = root => $$('.o-menu-link', root).filter(l => !l.closest('[hidden]') && !l.disabled && l.getAttribute('aria-disabled') !== 'true' && isVisible(l));
function onMenuKey(e, link) {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const root = rootOf(link); if (!root) return;
  const rtl = isRTL(link), fwd = rtl ? 'ArrowLeft' : 'ArrowRight', back = rtl ? 'ArrowRight' : 'ArrowLeft';
  const k = e.key, isT = link.classList.contains('o-menu-toggle'), open = link.getAttribute('aria-expanded') === 'true';
  const sb = link.closest('.o-sidebar'), mini = sb && isMini(sb) && !link.closest('.o-sidebar-flyout');
  const links = visibleLinks(root), i = links.indexOf(link);
  let to = null;
  if (k === 'ArrowDown') to = links[(i + 1) % links.length];
  else if (k === 'ArrowUp') to = links[(i - 1 + links.length) % links.length];
  else if (k === 'Home') to = links[0];
  else if (k === 'End') to = links[links.length - 1];
  else if (k === fwd && isT) {
    if (mini) { O.sidebar.flyout?.(link, { focus: true }); e.preventDefault(); return; }
    if (!open) setGroup(link, true); else to = visibleLinks(subOf(link))[0];
  } else if (k === back) {
    if (isT && open && !mini) setGroup(link, false);
    else {
      to = toggleOf(link.closest('.o-menu-sub'));
      if (!to && link.closest('.o-sidebar-flyout')) { O.sidebar.closeFlyout?.(true); e.preventDefault(); return; }
    }
  } else return;
  e.preventDefault();
  to?.focus();
}
if (isBrowser) ready(() => {
  on(doc, 'click', '.o-menu-toggle', (e, tg) => {
    if (tg.disabled || tg.getAttribute('aria-disabled') === 'true') return;
    const sb = tg.closest('.o-sidebar');
    if (sb && isMini(sb) && !tg.closest('.o-sidebar-flyout') && O.sidebar.flyout) { e.preventDefault(); O.sidebar.flyout(tg, { focus: e.detail === 0, toggle: true }); return; }
    e.preventDefault();
    setGroup(tg, tg.getAttribute('aria-expanded') !== 'true');
  });
  on(doc, 'keydown', '.o-menu-link', onMenuKey);
  // same-document navigation (hash routes / SPA routers) -> re-sync shortly after the click
  on(doc, 'click', 'a.o-menu-link[href]', (e, a) => {
    const sb = a.closest('[data-o-sidebar]');
    if (sb && sb.getAttribute('data-o-sidebar') !== 'manual') setTimeout(() => { if (!syncActive(sb) && a.getAttribute('href').startsWith('#') && !a.closest('o-sidebar-menu')) applyActive(sb, a); }, 0);
  });
});

/* ── behavior ──────────────────────────────────────────────────────── */
behavior('data-o-sidebar', (sb, val) => {
  const offs = [];
  if (!sb.hasAttribute('aria-label') && !sb.hasAttribute('aria-labelledby')) sb.setAttribute('aria-label', t('common.menu'));
  $$('.o-menu-toggle', sb).forEach(tg => { const sub = subOf(tg); if (!sub) return; if (!sub.id) sub.id = uid('o-menu'); tg.setAttribute('aria-controls', sub.id); if (!tg.hasAttribute('aria-expanded')) tg.setAttribute('aria-expanded', String(!sub.hidden)); });
  if (val !== 'manual') {
    syncActive(sb, { scroll: true });
    const sync = () => syncActive(sb);
    offs.push(on(win, 'popstate hashchange', sync), on(doc, 'o-location', sync));
  }
  const input = sb.querySelector('.o-sidebar-search input, input[data-o-sidebar-search]');
  if (input) {
    if (!input.placeholder) input.placeholder = t('sidebar.search');
    if (!input.hasAttribute('aria-label')) input.setAttribute('aria-label', t('sidebar.search').replace(/…$/, ''));
    const run = debounce(() => { const n = filterMenu(sb, input.value); if (input.value.trim()) announce(n ? t('common.items', { count: n }) : t('sidebar.noResults')); }, 80);
    offs.push(on(input, 'input search', run), on(input, 'keydown', e => {
      if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; run.cancel(); filterMenu(sb, ''); }
      else if (e.key === 'ArrowDown') { const l = visibleLinks(sb)[0]; if (l) { e.preventDefault(); l.focus(); } }
      else if (e.key === 'Enter') { const l = visibleLinks(sb).find(x => !x.classList.contains('o-menu-toggle')); if (l) { e.preventDefault(); l.click(); } }
    }));
  }
  if (O.sidebar._resizer) offs.push(O.sidebar._resizer(sb));
  return () => { offs.forEach(f => f && f()); if (input) filterMenu(sb, ''); };
});

const __sbAll = el => (el ? [$(el)].filter(Boolean) : $$('[data-o-sidebar]'));
O.sidebar = Object.assign(O.sidebar || {}, {
  /** Re-detect the active link (all sidebars or one). */
  sync(el) { __sbAll(el).forEach(sb => syncActive(sb, { scroll: true })); },
  /** Mark a link active by element or href. */
  setActive(el, x) {
    const sb = $(el); if (!sb) return null;
    const link = isStr(x) ? $$('a.o-menu-link[href]', sb).find(a => a.getAttribute('href') === x) : x;
    applyActive(sb, link || null, { scroll: true });
    return link || null;
  },
  filter: (el, q) => filterMenu($(el), q),
  open: tg => setGroup($(tg), true),
  close: tg => setGroup($(tg), false),
  expandAll: el => $$('.o-menu-toggle', $(el)).forEach(tg => setGroup(tg, true, { anim: false })),
  collapseAll: el => $$('.o-menu-toggle', $(el)).forEach(tg => setGroup(tg, false, { anim: false })),
  isMini,
  _setGroup: setGroup, _urlScore: urlScore, _applyActive: applyActive, _labelOf: labelOf, _subOf: subOf,
});
