/* Tabs — WAI-ARIA tabs from <o-tab-panel> children, from explicit markup, or plain data-o-toggle="tab" triggers.
 *   <o-tabs variant="line|pills|boxed|enclosed" orientation="horizontal|vertical" selected="id|index" label="Settings"
 *           lazy keep-alive hash="tab" query="tab" persist="key" closable addable reorderable overflow="scroll|menu"
 *           fill activation="auto|manual">
 *     <o-tab-panel id="profile" label="Profile" icon="user" badge="3" disabled closable>…</o-tab-panel>
 *     <o-tab-panel label="Audit"><template>…rendered on first show…</template></o-tab-panel>
 *   </o-tabs>
 *   Explicit: <o-tabs><div class="o-nav" role="tablist"><button role="tab" aria-controls="p1">A</button></div><div id="p1">…</div></o-tabs>
 *   Events: o-before-change (cancelable) · o-change {id, index, previous} · o-close (cancelable) {id, index}
 *           o-tab-add · o-reorder {id, from, to, order} · o-render {id, panel}
 *   Methods: select(id|index) · add({ id, label, icon, badge, content, html, render, closable, disabled, index }) -> id
 *            remove(id) · close(id) · next() · prev() · refresh() · getTabs()
 */

const VARIANTS = { line: 'o-nav-tabs', pills: 'o-nav-pills', boxed: 'o-nav-boxed', enclosed: 'o-tabs-enclosed-list' };

class OTabPanel extends OElement {
  static props = {
    label: String, icon: String, badge: String,
    disabled: { type: Boolean, reflect: true }, closable: { type: Boolean, reflect: true },
    renderer: { type: Function },
  };
  setup() {
    this.classList.add('o-tab-panel');
    this.setAttribute('role', 'tabpanel');
    if (!this.id) this.id = uid('tabpanel');
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
  }
  update() { this.closest('o-tabs')?._queueSync?.(); }
}

class OTabs extends OElement {
  static props = {
    variant: { type: String, default: 'line', reflect: true },
    orientation: { type: String, default: 'horizontal', reflect: true },
    selected: Any, label: String, lazy: Boolean, keepAlive: Boolean, hash: String, query: String, persist: String,
    closable: Boolean, addable: Boolean, reorderable: Boolean, fill: Boolean,
    overflow: { type: String, default: 'scroll' }, activation: { type: String, default: 'auto' }, texts: Object,
  };

  setup() {
    this.classList.add('o-tabs');
    this._cur = null; this._order = null; this._items = [];
    const ex = this._findList();
    this._explicit = !!ex;
    this.ind = h('span', { class: 'o-tabs-indicator', 'aria-hidden': 'true' });
    if (ex) {
      this.list = ex;
      this.list.classList.add('o-tabs-list');
    } else {
      this.list = h('div', { class: 'o-nav o-tabs-list', role: 'tablist' });
      const mk = (c, ic, extra) => h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm ' + c, hidden: true, ...extra }, icon(ic));
      this.bPrev = mk('o-tabs-scroll', 'chevron-left', { tabindex: '-1', 'aria-hidden': 'true' });
      this.bNext = mk('o-tabs-scroll', 'chevron-right', { tabindex: '-1', 'aria-hidden': 'true' });
      this.bMore = mk('o-tabs-more', 'more-horizontal', { 'aria-haspopup': 'menu' });
      this.bAdd = mk('o-tabs-add', 'plus');
      this.bar = h('div', { class: 'o-tabs-bar' }, this.bPrev, this.list, this.bNext, this.bMore, this.bAdd);
      this.prepend(this.bar);
      on(this.bPrev, 'click', () => this._scrollBy(-1));
      on(this.bNext, 'click', () => this._scrollBy(1));
      on(this.bMore, 'click', () => this._moreMenu());
      on(this.bAdd, 'click', () => this.emit('tab-add', {}));
      on(this.list, 'scroll', rafThrottle(() => this._updOverflow()), { passive: true });
    }
    this.list.append(this.ind);
    this.nav = new ListNav(this.list, {
      items: '[role=tab]', orientation: 'horizontal', typeahead: false, activeClass: 'is-focus',
      onActivate: tab => { if (this.activation !== 'manual') this._pick(tab); },
      onSelect: tab => this._pick(tab),
    });
    on(this.list, 'click', '[role=tab]', (e, tab) => {
      if (!this._own(tab)) return;
      if (tab.localName === 'a') e.preventDefault();
      if (e.target.closest('.o-tab-close')) { e.preventDefault(); this.close(this._byTab(tab)?.id); return; }
      this._pick(tab, true);
    });
    on(this.list, 'auxclick', '[role=tab]', (e, tab) => { if (e.button === 1 && this._own(tab) && this._byTab(tab)?.closable) { e.preventDefault(); this.close(this._byTab(tab).id); } });
    on(this.list, 'mousedown', '[role=tab]', e => { if (e.button === 1) e.preventDefault(); });
    on(this.list, 'keydown', e => this._key(e));
  }

  connected() {
    this._mo = new MutationObserver(muts => {
      if (muts.some(m => [...m.addedNodes, ...m.removedNodes].some(n => n.nodeType === 1 && n !== this.ind && n !== this.bar))) this._queueSync();
    });
    this._mo.observe(this, { childList: true });
    if (this._explicit) this._mo.observe(this.list, { childList: true });
    this.addCleanup(() => this._mo.disconnect());
    this.addCleanup(observeResize(this, rafThrottle(() => this._layoutChanged())));
    this.addCleanup(observeResize(this.list, rafThrottle(() => { this._updOverflow(); this._placeInd(); })));
    if (this.hash) this.listen(win, 'hashchange', () => { const id = hashParams.get(this.hash); if (id && id !== this._cur) this.select(id); });
    if (this._setupOnce) this._queueSync();
    this._setupOnce = true;
    if (!this._dragOff && !this._explicit) this._dragOff = kitDragReorder(this.list, {
      items: '[role=tab]', axis: 'x', canDrag: tab => this.reorderable && !tab.disabled,
      onMove: (tab, to) => this._moveTo(this._byTab(tab), to, false),
      onEnd: (tab, from, to) => { if (from !== to) this._reordered(this._byTab(tab), from, to); },
    });
  }

  update(changed) {
    if (changed.has('init') || changed.has('variant') || changed.has('orientation') || changed.has('fill') || changed.has('overflow') ||
        changed.has('addable') || changed.has('label') || changed.has('locale') || changed.has('texts')) this._applyLayout();
    if (changed.has('init')) { this._sync(); return; }
    if (changed.has('closable') || changed.has('reorderable') || changed.has('locale')) this._sync();
    if (changed.has('selected') && this.selected != null) { const d = this._get(this.selected); if (d && d.id !== this._cur) this._show(d.id); }
    if (changed.has('lazy') || changed.has('keepAlive')) this._show(this._cur);
  }

  /* ── public API ── */
  /** Methods may run before connectedCallback (inline scripts, frameworks): run setup now when connected. */
  _ready() { if (!this._setupDone && this.isConnected && doc.readyState !== 'loading') this.connectedCallback(); return this._setupDone; }
  get selectedId() { return this._cur ?? null; }
  get selectedIndex() { return (this._items || []).findIndex(d => d.id === this._cur); }
  getTabs() { this._ready(); return (this._items || []).map(({ id, label, index, disabled, closable }) => ({ id, label, index, disabled, closable })); }
  refresh() { if (this._ready()) this._sync(); }
  next() { return this._ready() && this._step(1); }
  prev() { return this._ready() && this._step(-1); }
  /** select(id | index, { focus }) -> boolean (false when vetoed or unknown) */
  select(ref, { focus = false } = {}) {
    if (!this._ready()) { this.selected = ref; return true; }
    const d = this._get(ref);
    if (!d || d.disabled) return false;
    if (d.id === this._cur) { if (focus) d.tab.focus(); return true; }
    const prev = this._cur, prevIndex = this.selectedIndex;
    const detail = { id: d.id, index: d.index, previous: prev, previousIndex: prevIndex };
    if (!this.emit('before-change', detail)) return false;
    this._show(d.id);
    this._remember(d.id);
    if (focus) d.tab.focus();
    this.emit('change', detail);
    return true;
  }
  /** add({ id, label, icon, badge, content: Node|text, html (trusted), render: panel => Node|string, closable, disabled, index, select }) -> id */
  add(o = {}) {
    const id = o.id || uid('tab');
    if (!this._ready()) {
      const p = h('o-tab-panel', { id, label: o.label || t('tabs.newTab'), icon: o.icon, badge: o.badge != null ? String(o.badge) : null, closable: o.closable || null, disabled: o.disabled || null });
      this._fill(p, o); this.append(p);
      if (o.select) this.selected = id;
      return id;
    }
    if (this._explicit) {
      const tab = h('button', { type: 'button', class: 'o-nav-link', role: 'tab', 'aria-controls': id }, o.label || this.t('tabs.newTab'));
      const panel = h('div', { id, role: 'tabpanel', class: 'o-tab-panel', hidden: true });
      this._fill(panel, o);
      const tabs = this._items.map(d => d.tab), ref = o.index != null ? tabs[o.index] : null;
      ref ? this.list.insertBefore(tab, ref) : this.list.insertBefore(tab, this.ind);
      const last = this._items[this._items.length - 1]?.panel;
      last ? last.after(panel) : this.append(panel);
    } else {
      const p = h('o-tab-panel', { id, label: o.label || this.t('tabs.newTab'), icon: o.icon, badge: o.badge != null ? String(o.badge) : null, closable: o.closable || null, disabled: o.disabled || null });
      this._fill(p, o);
      const ref = o.index != null ? this._items[o.index]?.panel : null;
      ref ? this.insertBefore(p, ref) : this.append(p);
      if (this._order) this._order.splice(o.index != null ? o.index : this._order.length, 0, id);
    }
    const focus = o.focus ?? (doc.activeElement === this.bAdd);
    this._sync();
    if (o.select !== false) this.select(id, { focus });
    return id;
  }
  /** close(id) — user-style close: emits cancelable o-close, then removes. */
  close(ref) {
    if (!this._ready()) return false;
    const d = this._get(ref);
    if (!d || !this.emit('close', { id: d.id, index: d.index, label: d.label })) return false;
    this.remove(d.id);
    announce(this.t('tabs.closed', { label: d.label }));
    return true;
  }
  /** remove(id) — removes the tab and its panel (no event except o-change when the selection moves). */
  remove(ref) {
    if (!this._ready()) return false;
    const d = this._get(ref);
    if (!d) return false;
    const i = this._items.indexOf(d), focusIn = this.list.contains(doc.activeElement);
    const rest = this._items.filter(x => x !== d && !x.disabled);
    const nextSel = d.id === this._cur ? (this._items.slice(i + 1).find(x => !x.disabled) || this._items.slice(0, i).reverse().find(x => !x.disabled)) : null;
    if (this._explicit) d.tab.remove();
    d.panel?.remove();
    if (this._order) this._order = this._order.filter(x => x !== d.id);
    if (d.id === this._cur) this._cur = null;
    this._sync();
    if (nextSel) this.select(nextSel.id, { focus: focusIn });
    else if (focusIn && rest.length) rest[0].tab.focus();
    return true;
  }

  /* ── internals ── */
  _fill(panel, o) {
    if (o.content instanceof Node) panel.append(o.content);
    else if (o.content != null) panel.textContent = String(o.content);
    if (o.html != null) { if (this.lazy) panel.__html = String(o.html); else panel.insertAdjacentHTML('beforeend', String(o.html)); }
    if (o.render) panel.renderer = o.render;
  }
  _findList() {
    const cand = this.querySelector('[role=tablist], .o-nav');
    return cand && cand.closest('o-tabs') === this && !cand.closest('o-tab-panel') ? cand : null;
  }
  _own(tab) { return tab.closest('o-tabs') === this; }
  _orient() { return this.orientation === 'vertical' && !this._narrow ? 'vertical' : 'horizontal'; }
  _queueSync() { if (this._sq || !this._setupDone) return; this._sq = true; queueMicrotask(() => { this._sq = false; if (this.isConnected) this._sync(); }); }
  _get(ref) {
    if (ref == null || ref === '' || !this._items) return null;
    if (isNum(ref) || (isStr(ref) && /^\d+$/.test(ref) && !this._items.some(d => d.id === ref))) return this._items[+ref] || null;
    return this._items.find(d => d.id === String(ref)) || null;
  }
  _byTab(tab) { return this._items.find(d => d.tab === tab) || null; }
  _step(dir) {
    const list = this._items.filter(d => !d.disabled); if (!list.length) return false;
    const i = list.findIndex(d => d.id === this._cur);
    return this.select(list[(i + dir + list.length) % list.length].id);
  }
  _pick(tab, focus) { const d = this._byTab(tab); if (d) this.select(d.id, { focus }); }

  _applyLayout() {
    const v = VARIANTS[this.variant] ? this.variant : 'line', vert = this._orient() === 'vertical';
    for (const k in VARIANTS) this.classList.toggle('is-' + k, k === v);
    this.classList.toggle('is-vertical', vert);
    this.classList.toggle('is-stacked', !!this._narrow);
    this.classList.toggle('is-fill', !!this.fill);
    if (!this._explicit) {
      this.list.className = cls('o-nav o-tabs-list', VARIANTS[v], vert && 'o-nav-vertical', this.fill && 'o-nav-fill');
      this.bPrev.setAttribute('aria-label', this.t('tabs.scrollPrev'));
      this.bNext.setAttribute('aria-label', this.t('tabs.scrollNext'));
      this.bMore.setAttribute('aria-label', this.t('tabs.more'));
      this.bMore.title = this.t('tabs.more');
      this.bAdd.setAttribute('aria-label', this.t('tabs.add'));
      this.bAdd.title = this.t('tabs.add');
      this.bAdd.hidden = !this.addable;
    }
    this.list.setAttribute('role', 'tablist');
    this.list.setAttribute('aria-orientation', vert ? 'vertical' : 'horizontal');
    if (this.label) this.list.setAttribute('aria-label', this.label);
    this.nav.o.orientation = vert ? 'vertical' : 'horizontal';
    this.ind.hidden = v === 'enclosed';
    this.ind.classList.remove('is-ready');
    requestAnimationFrame(() => { this._updOverflow(); this._placeInd(); });
  }
  _layoutChanged() {
    const narrow = this.orientation === 'vertical' && this.clientWidth > 0 && this.clientWidth < 520;
    if (narrow !== !!this._narrow) { this._narrow = narrow; this._applyLayout(); }
    this._updOverflow(); this._placeInd();
  }

  /** Rebuild the model (and generated tab buttons) from the DOM. */
  _sync() {
    const closable = this.closable;
    let items;
    if (this._explicit) {
      const tabs = [...this.list.querySelectorAll('[role=tab], .o-nav-link, [data-o-target], a[href^="#"]')].filter(t => t !== this.ind && t.closest('o-tabs') === this && (t.closest('[role=tablist], .o-nav') === this.list));
      items = tabs.map(tab => {
        const sel = tab.getAttribute('aria-controls') ? '#' + CSS.escape(tab.getAttribute('aria-controls')) : tab.getAttribute('data-o-target') || tab.getAttribute('href');
        let panel = null; try { panel = sel && sel !== '#' ? this.querySelector(sel) || doc.querySelector(sel) : null; } catch {}
        if (!tab.id) tab.id = uid('tab');
        tab.setAttribute('role', 'tab');
        const id = panel ? (panel.id || (panel.id = uid('tabpanel'))) : tab.id;
        if (panel) {
          tab.setAttribute('aria-controls', panel.id);
          panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
          if (!panel.hasAttribute('tabindex')) panel.tabIndex = 0;
          panel.classList.add('o-tab-panel');
        }
        const disabled = tab.disabled || tab.getAttribute('aria-disabled') === 'true';
        return { id, tab, panel, label: tab.textContent.trim(), disabled, closable: closable || tab.hasAttribute('data-closable') };
      });
    } else {
      const panels = [...this.children].filter(c => c.localName === 'o-tab-panel');
      let ordered = panels;
      if (this._order) {
        const map = new Map(panels.map(p => [p.id, p]));
        ordered = [...this._order.filter(id => map.has(id)).map(id => map.get(id)), ...panels.filter(p => !this._order.includes(p.id))];
      }
      items = ordered.map(p => {
        if (!p.id) p.id = uid('tabpanel');
        const pr = k => p[k] ?? p.getAttribute(k);
        const bool = k => p[k] ?? (p.hasAttribute(k) ? p.getAttribute(k) !== 'false' : undefined);
        return {
          id: p.id, panel: p, label: pr('label') ?? '', icon: pr('icon'), badge: pr('badge'),
          disabled: !!bool('disabled'), closable: bool('closable') ?? closable,
        };
      });
      patchList(this.list, items, 'id', d => h('button', { type: 'button', role: 'tab', class: 'o-nav-link o-tab' }), noop);
      items.forEach(d => {
        d.tab = [...this.list.children].find(c => c.__okey === d.id);
        this._paintTab(d);
        d.panel.setAttribute('aria-labelledby', d.tab.id);
      });
      this.list.append(this.ind);
    }
    items.forEach((d, i) => { d.index = i; });
    this._items = items;
    this.classList.toggle('is-empty', !items.length);
    if (!this._get(this._cur)) { this._cur = null; this._show(this._initial()?.id); }
    else this._show(this._cur);
  }
  _paintTab(d) {
    const b = d.tab;
    b.id = d.id + '-tab';
    b.disabled = !!d.disabled;
    b.setAttribute('aria-controls', d.id);
    b.dataset.id = d.id;
    b.classList.toggle('is-closable', !!d.closable);
    if (d.closable) b.setAttribute('aria-keyshortcuts', 'Delete'); else b.removeAttribute('aria-keyshortcuts');
    const key = [d.label, d.icon, d.badge, d.closable, i18n.locale].join('');
    if (b.__paint === key) return;
    b.__paint = key;
    b.replaceChildren(...[
      d.icon ? iconEl(d.icon) : null,
      h('span', { class: 'o-tab-label' }, d.label),
      d.badge != null && d.badge !== '' ? h('span', { class: 'o-badge o-badge-sm o-tab-badge' }, d.badge) : null,
      d.closable ? h('span', { class: 'o-tab-close', 'aria-hidden': 'true', title: this.t('tabs.closeTab', { label: d.label }), 'data-no-drag': '' }, icon('x')) : null,
    ].filter(Boolean));
  }
  _initial() {
    const q = [this.hash && hashParams.get(this.hash), this.query && queryParam.get(this.query), this.persist && ls.get('orion:tabs:' + this.persist), this.selected];
    for (const ref of q) { const d = ref != null && this._get(ref); if (d && !d.disabled) return d; }
    return this._items.find(d => !d.disabled && (d.panel?.hasAttribute('selected') || d.tab.getAttribute('aria-selected') === 'true' || d.tab.classList.contains('is-active')))
      || this._items.find(d => !d.disabled) || null;
  }
  _remember(id) {
    this._p.selected = id;
    if (this.hash) hashParams.set(this.hash, id);
    if (this.query) queryParam.set(this.query, id);
    if (this.persist) ls.set('orion:tabs:' + this.persist, id);
  }
  _show(id) {
    const moved = (id ?? null) !== this._shown;
    this._cur = this._shown = id ?? null;
    for (const d of this._items) {
      const on = d.id === this._cur;
      d.tab.setAttribute('aria-selected', String(on));
      d.tab.classList.toggle('is-active', on);
      d.tab.tabIndex = on ? 0 : -1;
      if (!d.panel) continue;
      d.panel.hidden = !on;
      d.panel.classList.toggle('is-active', on);
      if (on) this._render(d);
      else if (this.lazy && !this.keepAlive && d.panel.__lazy) { d.panel.__lazy.forEach(n => n.remove()); d.panel.__lazy = null; }
    }
    if (!this._cur && this._items.length) this._items.find(d => !d.disabled)?.tab.setAttribute('tabindex', '0');
    const cur = this._get(this._cur);
    if (cur) { this.nav.index = this.nav.items.indexOf(cur.tab); if (moved) this._reveal(cur.tab); }
    this._placeInd();
    this._updOverflow();
  }
  /** Lazy content: <template> child, renderer function or add({ html }) — rendered on first show. */
  _render(d) {
    const p = d.panel;
    if (p.__lazy) return;
    const tpl = [...p.children].find(c => c.localName === 'template');
    let nodes = null;
    if (tpl) nodes = [...tpl.content.cloneNode(true).childNodes];
    else if (isFn(p.renderer)) { const r = p.renderer(p); nodes = r == null ? [] : [r instanceof Node ? r : doc.createTextNode(String(r))]; }
    else if (p.__html != null) nodes = [...frag(p.__html).childNodes];
    if (!nodes) return;
    p.__lazy = nodes;
    p.append(...nodes);
    emit(this, 'o-render', { id: d.id, panel: p });
  }

  _placeInd() {
    const d = this._get(this._cur), el = this.ind;
    if (!d || el.hidden || !d.tab.offsetParent) { el.style.opacity = '0'; return; }
    const l = this.list, r = d.tab.getBoundingClientRect(), lr = l.getBoundingClientRect();
    css(el, {
      '--x': (r.left - lr.left - l.clientLeft + l.scrollLeft) + 'px', '--y': (r.top - lr.top - l.clientTop + l.scrollTop) + 'px',
      '--w': r.width + 'px', '--h': r.height + 'px', opacity: '',
    });
    if (!el.classList.contains('is-ready')) requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-ready')));
    this.list.classList.add('has-indicator');
  }
  _reveal(tab) {
    const l = this.list, r = tab.getBoundingClientRect(), lr = l.getBoundingClientRect(), pad = 28;
    if (!lr.width) return;
    if (this._orient() === 'vertical') {
      if (r.top < lr.top) l.scrollTop -= lr.top - r.top + pad; else if (r.bottom > lr.bottom) l.scrollTop += r.bottom - lr.bottom + pad;
    } else if (r.left < lr.left) l.scrollLeft -= lr.left - r.left + pad;
    else if (r.right > lr.right) l.scrollLeft += r.right - lr.right + pad;
  }
  _updOverflow() {
    if (this._explicit) return;
    const l = this.list, horiz = this._orient() === 'horizontal';
    const over = horiz && l.scrollWidth > l.clientWidth + 1;
    this.classList.toggle('is-overflowing', over);
    const scrollMode = this.overflow !== 'menu';
    this.bPrev.hidden = this.bNext.hidden = !(over && scrollMode);
    this.bMore.hidden = !(over && !scrollMode);
    if (over && scrollMode) {
      const s = Math.abs(l.scrollLeft), max = l.scrollWidth - l.clientWidth - 1;
      this.bPrev.disabled = s <= 0;
      this.bNext.disabled = s >= max;
    }
  }
  _scrollBy(dir) {
    const l = this.list, d = Math.max(80, l.clientWidth * 0.7) * dir * (isRTL(this) ? -1 : 1);
    l.scrollBy({ left: d, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
  _moreMenu() {
    const lr = this.list.getBoundingClientRect();
    const hidden = this._items.filter(d => { const r = d.tab.getBoundingClientRect(); return r.left < lr.left - 1 || r.right > lr.right + 1; });
    kitMenu(this.bMore, (hidden.length ? hidden : this._items).map(d => ({
      label: d.label, icon: d.icon, disabled: d.disabled, checked: d.id === this._cur, action: () => this.select(d.id, { focus: true }),
    })), { owner: this, placement: 'bottom-end', label: this.t('tabs.more') });
  }

  _key(e) {
    const tab = e.target.closest?.('[role=tab]');
    if (!tab || !this._own(tab)) return;
    const d = this._byTab(tab);
    const vert = this._orient() === 'vertical';
    const fwd = vert ? 'ArrowDown' : isRTL(this) ? 'ArrowLeft' : 'ArrowRight', back = vert ? 'ArrowUp' : isRTL(this) ? 'ArrowRight' : 'ArrowLeft';
    if (e.altKey && this.reorderable && d && (e.key === fwd || e.key === back)) {
      e.preventDefault();
      const i = this._items.indexOf(d), to = clamp(i + (e.key === fwd ? 1 : -1), 0, this._items.length - 1);
      if (to !== i) { this._moveTo(d, to, true); this._reordered(d, i, to); }
      return;
    }
    if (e.key === 'Delete' && d?.closable) { e.preventDefault(); this.close(d.id); return; }
    this.nav.index = this.nav.items.indexOf(tab);
    this.nav.handle(e);
  }
  _moveTo(d, to, refocus) {
    if (!d) return;
    const had = doc.activeElement === d.tab;
    if (this._explicit) {
      if (d.tab.parentElement !== this.list) return;
      const tabs = this._items.map(x => x.tab).filter(t => t !== d.tab);
      this.list.insertBefore(d.tab, tabs[to] || this.ind);
    } else {
      const ids = this._items.map(x => x.id).filter(x => x !== d.id);
      ids.splice(to, 0, d.id);
      this._order = ids;
    }
    this._sync();
    if (had || refocus) d.tab.focus({ preventScroll: true });
  }
  _reordered(d, from, to) {
    const order = this._items.map(x => x.id);
    this.emit('reorder', { id: d.id, from, to, order });
    announce(this.t('tabs.moved', { label: d.label, pos: to + 1, count: order.length }));
  }
  disconnected() { this._dragOff?.(); this._dragOff = null; }
}

define('o-tab-panel', OTabPanel);
define('o-tabs', OTabs);
O.Tabs = OTabs;
O.TabPanel = OTabPanel;
OTabs.kit = { menu: kitMenu, contextMenu: kitContextMenu, dragReorder: kitDragReorder, hashParams, queryParam };
