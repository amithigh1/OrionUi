/* <o-global-search> — a header search box that expands into a floating results panel
 * (full-screen below ~640px), grouped by category from async providers.
 *   <o-global-search placeholder="Search…" shortcut="/"></o-global-search>
 *   el.providers = [{ id, title, icon, limit, search: async (q, { signal }) => [{ id, title, subtitle, url, icon, avatar, meta, badge }] }];
 *   el.trending = ['invoices', 'overdue orders'];         // suggested queries shown on an empty search
 * Recent items/favorites/search history come from Orion.recent / Orion.favorites / Orion.searchHistory
 * when those are loaded (feature-detected), else a built-in localStorage-backed fallback.
 * Events: o-search { query }, o-select { item, provider }, o-open, o-close.
 */
function gsResultIcon(item) {
  if (item.avatar) return `<span class="o-avatar o-gs-avatar"><img src="${esc(item.avatar)}" alt=""></span>`;
  if (item.icon) return `<span class="o-gs-icon">${icon(item.icon)}</span>`;
  return `<span class="o-gs-icon o-gs-icon-blank" aria-hidden="true"></span>`;
}
function gsRowHTML(item, idx, query) {
  const titleHTML = query ? highlight(item.title, query) : esc(item.title);
  return `<div class="o-gs-item" role="option" id="${idx.baseId}-${idx.i}" data-idx="${idx.i}" aria-selected="false">
    ${gsResultIcon(item)}
    <span class="o-gs-main">
      <span class="o-gs-title">${titleHTML}</span>
      ${item.subtitle ? `<span class="o-gs-subtitle">${esc(item.subtitle)}</span>` : ''}
    </span>
    ${item.meta ? `<span class="o-gs-meta">${esc(item.meta)}</span>` : ''}
    ${item.badge != null ? `<span class="o-badge o-badge-sm">${esc(item.badge)}</span>` : ''}
  </div>`;
}
function gsSeeAllHTML(idx, count) {
  return `<div class="o-gs-item o-gs-seeall" role="option" id="${idx.baseId}-${idx.i}" data-idx="${idx.i}" aria-selected="false">
    <span class="o-gs-icon o-gs-icon-blank" aria-hidden="true"></span>
    <span class="o-gs-main"><span class="o-gs-title">${esc(t('globalsearch.seeAll', { count }))}</span></span>
    ${icon('arrow-right', { class: 'o-gs-seeall-arrow' })}
  </div>`;
}
function gsSectionHTML(title, body) {
  return `<div class="o-gs-section" role="presentation">${title ? `<div class="o-gs-section-title" role="presentation">${esc(title)}</div>` : ''}${body}</div>`;
}
function gsLoadingHTML() { return `<div class="o-gs-item o-gs-loading" role="presentation"><span class="o-spinner o-spinner-xs" aria-hidden="true"></span><span class="o-gs-title">${esc(t('globalsearch.loadingMore'))}</span></div>`; }
function gsErrorHTML(providerId) {
  return `<div class="o-gs-item o-gs-error" role="presentation">${icon('alert-triangle')}<span class="o-gs-title">${esc(t('globalsearch.error'))}</span>
    <button type="button" class="o-btn o-btn-ghost o-btn-sm o-gs-retry" data-provider="${esc(providerId)}">${esc(t('globalsearch.retry'))}</button></div>`;
}

class OGlobalSearch extends OElement {
  static props = {
    placeholder: String,
    shortcut: { type: String, default: '/' },
    providers: { type: Array, default: () => [] },
    trending: { type: Array, default: () => [] },
    minChars: { type: Number, default: 1 },
    debounce: { type: Number, default: 200 },
    scope: { type: String, default: 'default' },
    texts: Object,
  };

  setup() {
    this.classList.add('o-global-search');
    this.setAttribute('role', 'search');
    this._baseId = uid('gs');
    this._query = '';
    this._provState = new Map();
    this._activeItems = [];
    this.isOpen = false;

    this.input = h('input', {
      class: 'o-gs-input', type: 'search', role: 'combobox', 'aria-expanded': 'false', 'aria-autocomplete': 'list',
      autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    });
    this.shortcutHint = h('kbd', { class: 'o-kbd o-gs-shortcut-hint' });
    this.clearBtn = h('button', { type: 'button', class: 'o-gs-clear', 'aria-label': t('common.clear') }, icon('x'));
    this.clearBtn.hidden = true;
    this.control = h('div', { class: 'o-gs-control' }, iconEl('search'), this.input, this.shortcutHint, this.clearBtn);
    this.append(this.control);

    this.body = h('div', { class: 'o-gs-body o-scroll', role: 'listbox', id: this._baseId + '-list' });
    this.footer = h('div', { class: 'o-gs-footer' });
    const mobileHead = h('div', { class: 'o-gs-mobile-head' },
      h('button', { type: 'button', class: 'o-gs-back', 'aria-label': t('common.back') }, icon('arrow-left')));
    this.panel = h('div', { class: 'o-gs-panel o-floating', role: 'presentation' }, mobileHead, this.body, this.footer);
    this.panel.hidden = true;
    this.input.setAttribute('aria-controls', this.body.id);

    this.nav = new ListNav(this.body, {
      items: '[role=option]', virtual: this.input, loop: true,
      onActivate: el => { this.body.querySelectorAll('[aria-selected="true"]').forEach(x => x.setAttribute('aria-selected', 'false')); el.setAttribute('aria-selected', 'true'); },
      onSelect: el => this.activate(el),
    });

    on(this.input, 'focus', () => this.open());
    on(this.input, 'input', () => { this.clearBtn.hidden = !this.input.value; this.setQuery(this.input.value); });
    on(this.input, 'keydown', e => this.onKeydown(e));
    on(this.clearBtn, 'click', () => { this.input.value = ''; this.clearBtn.hidden = true; this.setQuery(''); this.input.focus(); });
    on(mobileHead.firstElementChild, 'click', () => this.close());
    on(this.body, 'pointermove', '[role=option]', (e, el) => this.nav.setItem(el, { scroll: false }));
    on(this.body, 'click', '[role=option]', (e, el) => this.activate(el));
    on(this.body, 'click', '.o-gs-history-remove', (e, el) => { e.stopPropagation(); gsStore.history(this.scope).remove(el.dataset.q); this.render(); });
    on(this.body, 'click', '.o-gs-history-clear', () => { gsStore.history(this.scope).clear(); this.render(); });
    on(this.body, 'click', '.o-gs-retry', (e, el) => { const st = this._provState.get(el.dataset.provider); if (st) st.query = null; this.render(); });
    on(this.body, 'click', '.o-gs-trending', (e, el) => { this.input.value = el.dataset.q; this.setQuery(el.dataset.q); this.input.focus(); });
  }
  connected() {
    this._bindShortcut();
    this.addCleanup(() => this._shortcutOff?.());
  }
  update(changed) {
    if (changed.has('placeholder') || changed.has('init') || changed.has('locale')) this.input.placeholder = this.placeholder || this.t('globalsearch.placeholder');
    if (changed.has('shortcut') || changed.has('init')) { this.shortcutHint.textContent = this.shortcut || ''; if (this.__connected) this._bindShortcut(); }
    if ((changed.has('init') || changed.has('locale')) && this.isOpen) this.render();
  }
  disconnected() { this._provState.forEach(st => st.controller?.abort()); }

  /** Bind (or rebind) the focus shortcut at RUNTIME — Orion.shortcuts may load after this file. */
  _bindShortcut() {
    this._shortcutOff?.(); this._shortcutOff = null;
    if (!this.shortcut || !isBrowser) return;
    if (O.shortcuts) {
      this._shortcutOff = O.shortcuts.add(this.shortcut, e => { e.preventDefault(); this.focus(); }, { description: () => this.t('globalsearch.placeholder'), group: 'General' });
      return;
    }
    // small built-in fallback: supports "/" style single keys and "mod+k" style combos
    const parts = String(this.shortcut).toLowerCase().split('+');
    const key = parts.pop();
    const mac = /Mac|iPhone|iPad/i.test(win.navigator.platform || '');
    const need = { ctrl: parts.includes('mod') ? !mac : parts.includes('ctrl'), meta: parts.includes('mod') ? mac : parts.includes('meta'), alt: parts.includes('alt'), shift: parts.includes('shift') };
    const handler = e => {
      if (e.defaultPrevented || e.isComposing || e.key.toLowerCase() !== key || e.ctrlKey !== need.ctrl || e.metaKey !== need.meta || e.altKey !== need.alt || e.shiftKey !== need.shift) return;
      const a = doc.activeElement, typing = a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
      if (typing && !need.ctrl && !need.meta && !need.alt) return;
      e.preventDefault(); this.focus();
    };
    doc.addEventListener('keydown', handler);
    this._shortcutOff = () => doc.removeEventListener('keydown', handler);
  }

  /* ── open/close ────────────────────────────────────────────────────── */
  open() {
    if (this.isOpen) return;
    if (!this.emit('before-open')) return;
    portal(this.panel, this);
    this.panel.hidden = false;
    this._unplace = autoPlace(this.panel, this.control, { placement: 'bottom-start', offset: 8, matchWidth: 'min', size: true, flip: true });
    this._ov = overlays.open({
      el: this.panel, owner: this,
      onClose: (reason) => { this._ov = null; this.isOpen = false; this._unplace?.(); this.panel.hidden = true; this.classList.remove('is-open'); this.input.setAttribute('aria-expanded', 'false'); this.emit('close', { reason }); },
    });
    this.isOpen = true;
    this.classList.add('is-open');
    this.input.setAttribute('aria-expanded', 'true');
    animate(this.panel, 'zoomIn', { duration: 120 });
    this.render();
    this.emit('open');
  }
  close() { this._ov?.close('api'); }
  toggle() { this.isOpen ? this.close() : this.open(); }
  focus(opts) { this.input.focus(opts); this.open(); }

  /* ── query & providers ─────────────────────────────────────────────── */
  setQuery(q) {
    this._query = q;
    this.input.value = q;
    this.clearBtn.hidden = !q;
    if (!this.isOpen) this.open(); else this.render();
    this.emit('search', { query: q });
  }
  _refreshProviders() {
    const q = this._query;
    for (const p of toArr(this.providers)) {
      const prev = this._provState.get(p.id);
      if (q.length < this.minChars) { prev?.controller?.abort(); this._provState.delete(p.id); continue; }
      if (prev && prev.query === q) continue;
      prev?.controller?.abort(); clearTimeout(prev?.timer);
      const controller = new AbortController();
      const st = { query: q, loading: true, results: [], error: null, controller, timer: null };
      this._provState.set(p.id, st);
      st.timer = setTimeout(async () => {
        try {
          const res = await p.search(q, { signal: controller.signal });
          if (controller.signal.aborted) return;
          st.loading = false; st.results = toArr(res); st.error = null;
          this.render();
        } catch (err) {
          if (controller.signal.aborted) return;
          st.loading = false; st.error = err;
          this.render();
        }
      }, this.debounce);
    }
  }
  onKeydown(e) {
    if (e.key === 'Escape') { if (this._query) { e.preventDefault(); this.input.value = ''; this.clearBtn.hidden = true; this.setQuery(''); return; } return; }
    if (e.key === 'Enter' && !this.nav.active) {
      if (this._query) { gsStore.history(this.scope).add(this._query); this.emit('search', { query: this._query, submitted: true }); this.render(); }
      return;
    }
    if (this.nav.handle(e)) return;
  }
  activate(el) {
    const i = +el.dataset.idx;
    const entry = this._activeItems[i];
    if (!entry) return;
    if (entry.seeAll) {
      const p = entry.provider;
      if (isFn(p.onSeeAll)) p.onSeeAll(this._query);
      const href = isFn(p.seeAllHref) ? p.seeAllHref(this._query) : p.seeAllHref;
      if (href && isBrowser) win.location.href = href;
      emit(this, 'o-see-all', { provider: p, query: this._query });
      return;
    }
    const item = entry.item;
    gsStore.history(this.scope).add(this._query || item.title);
    gsStore.recent(this.scope).add(item);
    if (item.url && isBrowser && !isFn(item.onSelect)) win.location.href = item.url;
    if (isFn(item.onSelect)) item.onSelect(item);
    this.emit('select', { item, provider: entry.provider });
    this.close();
  }

  /* ── render ────────────────────────────────────────────────────────── */
  render() {
    this._refreshProviders();
    this._activeItems = [];
    let html = '';
    let busy = false;
    if (this._query.length < this.minChars) html = this._renderEmptyState();
    else { html = this._renderResults(); busy = [...this._provState.values()].some(s => s.loading); }
    if (!html) html = `<div class="o-empty o-empty-sm"><div class="o-empty-icon">${icon('search')}</div><p class="o-empty-text">${esc(t('globalsearch.noResults', { q: this._query }))}</p></div>`;
    this.body.innerHTML = html;
    this.body.setAttribute('aria-busy', String(busy));
    this.nav.reset();
    if (this._activeItems.length) this.nav.set(0, { focus: false, scroll: false });
    this._renderFooter();
    if (this._query.length >= this.minChars && !busy) announce(t('common.items', { count: this._activeItems.length }));
  }
  _renderEmptyState() {
    let html = '';
    const hist = gsStore.history(this.scope).list();
    if (hist.length) {
      const rows = hist.map(q => `<div class="o-gs-history-row"><button type="button" class="o-gs-trending" data-q="${esc(q)}">${icon('clock')}<span>${esc(q)}</span></button><button type="button" class="o-gs-history-remove" data-q="${esc(q)}" aria-label="${esc(t('globalsearch.removeSearch', { q }))}">${icon('x')}</button></div>`).join('');
      html += `<div class="o-gs-section" role="presentation"><div class="o-gs-section-title" role="presentation">${esc(t('globalsearch.recentSearches'))}<button type="button" class="o-gs-history-clear o-link-btn">${esc(t('globalsearch.clearHistory'))}</button></div>${rows}</div>`;
    }
    const favs = gsStore.favorites(this.scope).list();
    if (favs.length) html += gsSectionHTML(t('globalsearch.favorites'), this._items(favs.map(item => ({ item, provider: null }))));
    const recent = gsStore.recent(this.scope).list();
    if (recent.length) html += gsSectionHTML(t('globalsearch.recent'), this._items(recent.map(item => ({ item, provider: null }))));
    const trend = toArr(this.trending);
    if (trend.length) {
      const chips = trend.map(x => { const label = isStr(x) ? x : x.label; return `<button type="button" class="o-chip o-gs-trending" data-q="${esc(label)}">${icon('sparkles')}<span>${esc(label)}</span></button>`; }).join('');
      html += `<div class="o-gs-section" role="presentation"><div class="o-gs-section-title" role="presentation">${esc(t('globalsearch.trending'))}</div><div class="o-gs-chips">${chips}</div></div>`;
    }
    return html;
  }
  _renderResults() {
    let html = '';
    for (const p of toArr(this.providers)) {
      const st = this._provState.get(p.id);
      if (!st) continue;
      let body = '';
      if (st.loading && !st.results.length) body = gsLoadingHTML();
      else if (st.error) body = gsErrorHTML(p.id);
      else {
        const limit = p.limit || 5;
        const shown = st.results.slice(0, limit);
        body = this._items(shown.map(item => ({ item, provider: p })));
        if (st.results.length > limit) body += this._seeAll(p, st.results.length);
        if (st.loading && shown.length) body += gsLoadingHTML();
      }
      if (body) html += gsSectionHTML(isFn(p.title) ? p.title() : p.title, body);
    }
    return html;
  }
  _items(entries) {
    let out = '';
    for (const entry of entries) {
      const i = this._activeItems.length;
      this._activeItems.push(entry);
      out += gsRowHTML(entry.item, { baseId: this._baseId, i }, this._query);
    }
    return out;
  }
  _seeAll(provider, count) {
    const i = this._activeItems.length;
    this._activeItems.push({ seeAll: true, provider });
    return gsSeeAllHTML({ baseId: this._baseId, i }, count);
  }
  _renderFooter() {
    this.footer.innerHTML = `<span class="o-gs-hint"><kbd class="o-kbd">↑</kbd><kbd class="o-kbd">↓</kbd><span>${esc(t('globalsearch.navigate'))}</span></span>` +
      `<span class="o-gs-hint"><kbd class="o-kbd">↵</kbd><span>${esc(t('globalsearch.select'))}</span></span>` +
      `<span class="o-gs-hint o-gs-hint-end"><kbd class="o-kbd">Esc</kbd><span>${esc(t('globalsearch.close'))}</span></span>`;
  }
}
define('o-global-search', OGlobalSearch);
O.GlobalSearch = OGlobalSearch;
