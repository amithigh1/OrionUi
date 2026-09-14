/* <o-dashboard> widget catalog: a side panel with search; picking an entry inserts it at the first free spot. */

Object.assign(ODashboard.prototype, {
  /** Open the catalog panel (optionally anchored to the trigger that opened it). */
  openCatalog(trigger) {
    if (this._cat) { this._cat.search.focus(); return; }
    if (!this.emit('before-catalog-open', {})) return;
    const tid = uid('cat');
    const search = h('input', { type: 'search', class: 'o-input o-input-sm', autocomplete: 'off', spellcheck: 'false' });
    const list = h('div', { class: 'o-dash-catalog-list' });
    const empty = h('p', { class: 'o-dash-catalog-empty', hidden: true });
    const close = h('button', { type: 'button', class: 'o-btn-close' });
    const title = h('h2', { class: 'o-dash-catalog-title', id: tid });
    const panel = h('div', { class: 'o-floating o-dash-catalog', role: 'dialog', 'aria-labelledby': tid },
      h('div', { class: 'o-dash-catalog-head' }, title, close),
      h('div', { class: 'o-dash-catalog-search o-input-wrap' }, icon('search'), search),
      list, empty);
    portal(panel, this);
    const cat = this._cat = { panel, search, list, empty, title, close };
    this._catRender = () => {
      if (!this._cat) return;
      title.textContent = this.t('dashboard.catalog');
      close.setAttribute('aria-label', t('common.close'));
      search.placeholder = this.t('dashboard.searchWidgets');
      search.setAttribute('aria-label', this.t('dashboard.searchWidgets'));
      const all = (this.catalog || []).filter(c => c && c.type);
      const items = fuzzySearch(all, search.value, c => [c.title, c.description, c.type].filter(Boolean).join(' '));
      const counts = {};
      for (const w of this._widgets()) if (w.type) counts[w.type] = (counts[w.type] || 0) + 1;
      list.replaceChildren(...items.map(c => h('button', { type: 'button', class: 'o-dash-catalog-item', 'data-type': c.type },
        h('span', { class: 'o-dash-catalog-icon', 'aria-hidden': 'true' }, c.icon ? icon(c.icon) : icon('plus')),
        h('span', { class: 'o-dash-catalog-text' },
          h('span', { class: 'o-dash-catalog-name' }, c.title || c.type),
          c.description ? h('span', { class: 'o-dash-catalog-desc' }, c.description) : null),
        h('span', { class: 'o-dash-catalog-meta' },
          h('span', { class: 'o-badge o-badge-sm' }, this.t('dashboard.size', { w: c.w || 3, h: c.h || 2 })),
          counts[c.type] ? h('span', { class: 'o-dash-catalog-count' }, icon('check'), String(counts[c.type])) : null))));
      empty.textContent = this.t('dashboard.noWidgets');
      empty.hidden = items.length > 0;
    };
    const nav = new ListNav(list, { items: '.o-dash-catalog-item', loop: false, typeahead: false });
    on(search, 'input', () => this._catRender());
    on(search, 'keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); nav.first(); } else if (e.key === 'Enter') { const b = list.querySelector('.o-dash-catalog-item'); if (b) { e.preventDefault(); b.click(); } } });
    on(list, 'keydown', e => { if (e.key === 'ArrowUp' && nav.index <= 0) { e.preventDefault(); search.focus(); return; } if (e.key !== 'Enter' && e.key !== ' ') nav.handle(e); });
    on(close, 'click', () => this.closeCatalog());
    on(list, 'click', '.o-dash-catalog-item', (e, b) => {
      const el = this.addWidget(b.dataset.type);
      if (el) { this._catRender(); this.emit('catalog-select', { type: b.dataset.type, widget: el }); }
      list.querySelector(`[data-type="${CSS.escape(b.dataset.type)}"]`)?.focus();
    });
    cat.ov = overlays.open({
      el: panel, owner: trigger || null, trap: true,
      onClose: () => { panel.remove(); this._cat = null; this._catRender = null; trigger?.setAttribute?.('aria-expanded', 'false'); this.emit('catalog-close', {}); },
    });
    trigger?.setAttribute?.('aria-expanded', 'true');
    this._catRender();
    animate(panel, 'slideInEnd', { duration: 200 });
    search.focus({ preventScroll: true });
    this.emit('catalog-open', {});
  },
  closeCatalog() { this._cat?.ov?.close('api'); },
});
Object.defineProperty(ODashboard.prototype, 'catalogOpen', { configurable: true, get() { return !!this._cat; } });
