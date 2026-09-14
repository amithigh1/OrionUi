/* Shared rendering/keyboard engine behind <o-command-palette> (modal) and <o-command-menu> (inline).
 * Not part of the public API — internal to this folder.
 */
const __recentKey = 'orion:commandpalette:recent';
function __pushRecent(id) {
  const list = toArr(ls.get(__recentKey, [])).filter(x => x !== id);
  list.unshift(id);
  ls.set(__recentKey, list.slice(0, 10));
}
function __recentIds() { return toArr(ls.get(__recentKey, [])); }

/** rank commands against a query; returns [{ command, score, ranges }] sorted best-first (unsorted, unscored when query is empty) */
function rankCommands(list, query) {
  if (!query) return list.map(command => ({ command, ranges: null }));
  const out = [];
  for (const command of list) {
    const text = [command.title, command.subtitle, ...toArr(command.keywords)].filter(Boolean).join(' ');
    const m = fuzzy(query, text);
    if (!m) continue;
    out.push({ command, score: m.score, ranges: fuzzy(query, command.title || '')?.ranges || [] });
  }
  return out.sort((a, b) => b.score - a.score);
}

function cmdIcon(c) {
  if (!c.icon) return '<span class="o-cmdk-icon o-cmdk-icon-blank" aria-hidden="true"></span>';
  return `<span class="o-cmdk-icon">${icon(c.icon)}</span>`;
}
const __CMDK_MAC = isBrowser && /Mac|iPhone|iPad/i.test(win.navigator.platform || '');
const __CMDK_MOD_LABEL = __CMDK_MAC
  ? { mod: '⌘', cmd: '⌘', command: '⌘', meta: '⌘', ctrl: '⌃', control: '⌃', alt: '⌥', option: '⌥', shift: '⇧' }
  : { mod: 'Ctrl', cmd: 'Ctrl', command: 'Ctrl', meta: 'Win', ctrl: 'Ctrl', control: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Shift' };
/** Small fallback formatter used when Orion.shortcuts (the richer combo formatter) is not loaded. */
function fallbackKbd(combo) {
  return combo.split(/[+\s]+/).filter(Boolean).map(part => {
    const key = part.toLowerCase();
    const disp = __CMDK_MOD_LABEL[key] || (part.length === 1 ? part.toUpperCase() : cap(part));
    return `<kbd class="o-kbd">${esc(disp)}</kbd>`;
  }).join('');
}
function cmdShortcut(c) {
  if (!c.shortcut) return '';
  const body = O.shortcuts ? String(O.shortcuts.kbd(c.shortcut)) : fallbackKbd(c.shortcut);
  return `<span class="o-cmdk-shortcut">${body}</span>`;
}
function rowHTML(entry, idx, confirmId) {
  const c = entry.command;
  const confirming = c.danger && confirmId === c.id;
  const titleHTML = entry.ranges && entry.ranges.length ? highlight(c.title, entry.ranges) : esc(c.title);
  const sub = confirming ? esc(t('commandpalette.confirmAgain')) : (c.subtitle ? esc(c.subtitle) : '');
  const nested = c.children || c.load;
  return `<div class="o-cmdk-item${confirming ? ' is-danger' : ''}${c.disabled ? ' is-disabled' : ''}" role="option" id="${idx.baseId}-${idx.i}" data-idx="${idx.i}" aria-selected="false"${c.disabled ? ' aria-disabled="true"' : ''}>
    ${cmdIcon(c)}
    <span class="o-cmdk-main">
      <span class="o-cmdk-title">${titleHTML}</span>
      ${sub ? `<span class="o-cmdk-subtitle">${sub}</span>` : ''}
    </span>
    ${c.badge != null ? `<span class="o-badge o-badge-sm">${esc(c.badge)}</span>` : ''}
    ${cmdShortcut(c)}
    ${nested ? String(icon('chevron-right', { class: 'o-cmdk-chevron' })) : ''}
  </div>`;
}
function sectionHTML(title, itemsHtml) {
  return `<div class="o-cmdk-section" role="presentation">${title ? `<div class="o-cmdk-section-title" role="presentation">${esc(title)}</div>` : ''}${itemsHtml}</div>`;
}
function loadingRowHTML(label) {
  return `<div class="o-cmdk-item o-cmdk-loading" role="presentation"><span class="o-spinner o-spinner-xs" aria-hidden="true"></span><span class="o-cmdk-title">${esc(label || t('commandpalette.loadingMore'))}</span></div>`;
}

/**
 * CommandEngine — drives one command list: pages/breadcrumb, fuzzy filtering, async providers
 * (debounced + abortable), recent commands, danger confirmation, and keyboard navigation.
 */
class CommandEngine extends Emitter {
  constructor({ root, input, list, breadcrumb, footer, providers = true, closeOnRun = true }) {
    super();
    this.root = root; this.input = input; this.list = list; this.breadcrumb = breadcrumb; this.footer = footer;
    this.providersEnabled = providers; this.closeOnRun = closeOnRun;
    this.pages = [{ title: null }];
    this.query = '';
    this._confirm = null;
    this._provState = new Map();
    this._baseId = uid('cmdk');
    this._rendered = [];
    this.list.setAttribute('role', 'listbox');
    this.nav = new ListNav(list, {
      items: '[role=option]', virtual: input, loop: true,
      onActivate: el => { list.querySelectorAll('[aria-selected="true"]').forEach(x => x.setAttribute('aria-selected', 'false')); el.setAttribute('aria-selected', 'true'); },
      onSelect: el => this.activate(el),
    });
    this._offInput = on(input, 'input', () => { this.query = input.value; this._confirm = null; this.render(); this.emit('search', { query: this.query }); });
    this._offKey = on(input, 'keydown', e => this.onKeydown(e));
    this._offCmds = bus.on('commands:change', () => this.render());
    this._offHover = on(list, 'pointermove', '[role=option]', (e, el) => { if (el.getAttribute('aria-disabled') !== 'true') this.nav.setItem(el, { scroll: false }); });
    this._offClick = on(list, 'click', '[role=option]', (e, el) => { if (el.getAttribute('aria-disabled') === 'true') return; this.nav.setItem(el, { scroll: false }); this.activate(el); });
  }
  get page() { return this.pages[this.pages.length - 1]; }
  /** rootCommands: a fixed local list to use instead of the global Orion.commands registry (for <o-command-menu>). */
  setRootCommands(list) { this.pages[0].commands = list && list.length ? list.map(__norm0) : null; }
  reset(query = '', pageCmd) {
    const root = this.pages[0];
    this.pages = [{ title: null, commands: root.commands }];
    if (pageCmd) this.pages.push({ title: pageCmd.title, icon: pageCmd.icon, commands: pageCmd.children ? pageCmd.children.map(__norm0) : null, load: pageCmd.load || null });
    this.query = query;
    if (this.input) this.input.value = query;
    this._confirm = null;
    this._provState.clear();
    this.render();
  }
  pushPage(cmd) {
    this.pages.push({ title: cmd.title, icon: cmd.icon, commands: cmd.children ? cmd.children.map(__norm0) : null, load: cmd.load || null });
    this.query = ''; if (this.input) this.input.value = '';
    this._confirm = null;
    this.render();
    this.emit('navigate', { pages: this.pages });
  }
  popPage() {
    if (this.pages.length <= 1) return false;
    this.pages.pop();
    this.query = ''; if (this.input) this.input.value = '';
    this._confirm = null;
    this.render();
    this.emit('navigate', { pages: this.pages });
    return true;
  }
  onKeydown(e) {
    if (e.key === 'Backspace' && this.input && !this.input.value && this.pages.length > 1) { e.preventDefault(); this.popPage(); return; }
    if (e.key === 'Escape' && this.pages.length > 1 && !this.input.value) { /* let owner decide; still allow close */ }
    if (this.nav.handle(e)) return;
  }
  destroy() {
    this._offInput(); this._offKey(); this._offCmds(); this._offHover(); this._offClick();
    this._provState.forEach(st => st.controller?.abort());
    clearTimeout(this._confirmT);
  }
  /* ── data ──────────────────────────────────────────────────────────── */
  _refreshProviders() {
    if (!this.providersEnabled || this.pages.length > 1) return;
    const q = this.query;
    for (const p of commands.providers()) {
      const prev = this._provState.get(p.id);
      if (q.length < p.minChars) { prev?.controller?.abort(); this._provState.delete(p.id); continue; }
      if (prev && prev.query === q) continue;
      prev?.controller?.abort(); clearTimeout(prev?.timer);
      const controller = new AbortController();
      const st = { query: q, loading: true, results: prev?.results || [], error: null, controller, timer: null };
      this._provState.set(p.id, st);
      st.timer = setTimeout(async () => {
        try {
          const res = await p.search(q, { signal: controller.signal });
          if (controller.signal.aborted) return;
          st.loading = false; st.results = toArr(res).slice(0, p.limit).map(__norm0); st.error = null;
          this.render();
        } catch (err) {
          if (controller.signal.aborted) return;
          st.loading = false; st.error = err;
          this.render();
        }
      }, p.debounce);
    }
  }
  /* ── render ────────────────────────────────────────────────────────── */
  render() {
    this._refreshProviders();
    const page = this.page;
    this._rendered = [];
    let html = '';
    let busy = false;
    const isGlobalRoot = this.pages.length === 1 && !page.commands;
    if (page.load) {
      html = this._renderAsyncPage(page);
      busy = this._pageLoading;
    } else {
      const source = (page.commands || (isGlobalRoot ? commands.list() : [])).filter(passesWhen);
      const allowProviders = this.providersEnabled && isGlobalRoot;
      html = this._renderGrouped(source, { allowRecent: isGlobalRoot, allowProviders });
      busy = allowProviders && [...this._provState.values()].some(s => s.loading);
    }
    if (!this._rendered.length && !busy) {
      html = `<div class="o-empty o-empty-sm"><div class="o-empty-icon">${icon('search')}</div><p class="o-empty-text">${esc(t('commandpalette.empty', { q: this.query }))}</p></div>`;
    }
    this.list.innerHTML = html;
    this.list.setAttribute('aria-busy', String(busy));
    this.nav.reset();
    if (this._rendered.length) this.nav.set(0, { focus: false, scroll: false });
    this._renderBreadcrumb();
    this._renderFooter();
    if (this.query) announce(t('common.items', { count: this._rendered.length }));
  }
  _renderGrouped(list, { allowRecent, allowProviders }) {
    let html = '';
    if (!this.query) {
      if (allowRecent) {
        const recentCmds = __recentIds().map(id => commands.get(id)).filter(passesWhen);
        if (recentCmds.length) html += sectionHTML(t('commandpalette.recent'), this._items(recentCmds.map(command => ({ command, ranges: null }))));
      }
      html += this._groupsHTML(list.map(command => ({ command, ranges: null })));
    } else {
      html += this._groupsHTML(rankCommands(list, this.query));
      if (allowProviders) html += this._renderProviderSections();
    }
    return html;
  }
  _groupsHTML(entries) {
    const groups = new Map();
    for (const r of entries) { const key = r.command.section || t('commandpalette.commands'); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r); }
    let html = '';
    for (const [section, items] of groups) html += sectionHTML(section, this._items(items));
    return html;
  }
  _renderProviderSections() {
    let html = '';
    for (const p of commands.providers()) {
      const st = this._provState.get(p.id);
      if (!st) continue;
      let body = '';
      if (st.loading && !st.results.length) body = loadingRowHTML();
      else if (st.error) body = `<div class="o-cmdk-item o-cmdk-error" role="presentation">${icon('alert-triangle')}<span class="o-cmdk-title">${esc(t('common.error'))}</span></div>`;
      else body = this._items(st.results.map(command => ({ command, ranges: fuzzy(this.query, command.title || '')?.ranges || null })));
      if (body) html += sectionHTML(isFn(p.section) ? p.section() : (p.section || p.id), body + (st.loading && st.results.length ? loadingRowHTML() : ''));
    }
    return html;
  }
  _renderAsyncPage(page) {
    if (page._loadedFor !== this.query) {
      page._loadedFor = this.query;
      page._gen = (page._gen || 0) + 1;
      const gen = page._gen;
      this._pageLoading = true;
      Promise.resolve(page.load(this.query)).then(list => {
        if (page._gen !== gen) return;
        page._cache = toArr(list).map(__norm0);
        this._pageLoading = false;
        this.render();
      }).catch(err => { if (page._gen !== gen) return; page._cache = []; page._loadError = err; this._pageLoading = false; this.render(); });
    }
    if (this._pageLoading && !page._cache) return loadingRowHTML();
    const list = (page._cache || []).filter(passesWhen);
    return this._renderFlat(rankCommands(list, ''), t('commandpalette.commands'));
  }
  _items(entries) {
    let out = '';
    for (const entry of entries) {
      const i = this._rendered.length;
      this._rendered.push(entry.command);
      out += rowHTML(entry, { baseId: this._baseId, i }, this._confirm);
    }
    return out;
  }
  _renderBreadcrumb() {
    if (!this.breadcrumb) return;
    const crumbs = this.pages.slice(1);
    this.breadcrumb.hidden = !crumbs.length;
    if (!crumbs.length) return;
    this.breadcrumb.innerHTML = crumbs.map((p, i) => `<button type="button" class="o-cmdk-crumb" data-i="${i}">${p.icon ? icon(p.icon) : ''}<span>${esc(p.title)}</span></button>`).join(String(icon('chevron-right', { class: 'o-cmdk-crumb-sep' })));
  }
  _renderFooter() {
    if (!this.footer) return;
    const back = this.pages.length > 1 ? `<span class="o-cmdk-hint"><kbd class="o-kbd">⌫</kbd><span>${esc(t('commandpalette.back'))}</span></span>` : '';
    this.footer.innerHTML = `<span class="o-cmdk-hint"><kbd class="o-kbd">↑</kbd><kbd class="o-kbd">↓</kbd><span>${esc(t('commandpalette.navigate'))}</span></span>` +
      `<span class="o-cmdk-hint"><kbd class="o-kbd">↵</kbd><span>${esc(t('commandpalette.select'))}</span></span>` + back +
      `<span class="o-cmdk-hint o-cmdk-hint-end"><kbd class="o-kbd">Esc</kbd><span>${esc(t('commandpalette.close'))}</span></span>`;
  }
  /* ── actions ───────────────────────────────────────────────────────── */
  activate(el) {
    const i = +el.dataset.idx;
    const cmd = this._rendered[i];
    if (!cmd || cmd.disabled) return;
    if (cmd.danger && this._confirm !== cmd.id) {
      this._confirm = cmd.id;
      this.render();
      const row = this.list.querySelector(`[data-idx="${i}"]`);
      if (row) this.nav.setItem(row, { scroll: false });
      clearTimeout(this._confirmT);
      this._confirmT = setTimeout(() => { if (this._confirm === cmd.id) { this._confirm = null; this.render(); } }, 4000);
      return;
    }
    this._confirm = null;
    if (cmd.children || cmd.load) { this.pushPage(cmd); return; }
    this.run(cmd);
  }
  run(cmd) {
    __pushRecent(cmd.id);
    const query = this.query;
    const ctx = { close: () => this.emit('run-close'), query, engine: this };
    try { if (isFn(cmd.run)) cmd.run(ctx); else if (cmd.href && isBrowser) win.location.href = cmd.href; }
    finally {
      emit(this.root, 'o-command', { command: cmd, query });
      this.emit('run', { command: cmd, query });
      if (this.closeOnRun) this.emit('run-close');
    }
  }
}
function passesWhen(c) { return !c.when || c.when() !== false; }
function __norm0(c) { return c.id ? c : { ...c, id: uid('cmd') }; }
