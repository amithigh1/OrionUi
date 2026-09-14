/* Responsive list–detail view (mail client pattern).
 *   <o-split-view breakpoint="md" list-width="22rem" hash="mail" label="Messages">
 *     <div slot="list">…<a data-o-item="42">…</a>…</div>
 *     <div slot="detail">…</div>
 *   </o-split-view>
 *   Wide (own width ≥ breakpoint): list and detail side by side. Narrow: the list fills the view; selecting an item slides the
 *   detail in with a Back button (Escape or Back returns). Without slots the first two children are list and detail.
 *   breakpoint: sm | md | lg | xl | <px>. hash="key" syncs the selection with "#key=id" (browser Back returns to the list).
 *   Events: o-select { id, item } (cancelable) · o-view { view: 'list' | 'detail', compact }
 *   Methods: select(id) · showDetail(id?) · showList() · clear()      Props: selected, view (read-only), compact (read-only)
 */

i18n.add('en', { splitView: { back: 'Back', backTo: 'Back to list' } });

const SV_BP = { sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1400 };
const svHash = {
  map() { const m = new Map(), plain = []; location.hash.slice(1).split('&').forEach(p => { if (!p) return; const i = p.indexOf('='); if (i < 0) plain.push(p); else try { m.set(decodeURIComponent(p.slice(0, i)), decodeURIComponent(p.slice(i + 1))); } catch {} }); return { m, plain }; },
  get(k) { return svHash.map().m.get(k) ?? null; },
  set(k, v, push) {
    const { m, plain } = svHash.map();
    if (v == null || v === '') m.delete(k); else m.set(k, String(v));
    const s = [...plain, ...[...m].map(([a, b]) => encodeURIComponent(a) + '=' + encodeURIComponent(b))].join('&');
    const url = location.pathname + location.search + (s ? '#' + s : '');
    if (url !== location.pathname + location.search + location.hash) history[push ? 'pushState' : 'replaceState']({ oSplitView: k }, '', url);
  },
};

class OSplitView extends OElement {
  static props = {
    breakpoint: { type: String, default: 'md' }, listWidth: String, hash: String, label: String,
    selected: String, items: { type: String, default: '[data-o-item]' }, texts: Object,
  };
  setup() {
    this.classList.add('o-split-view');
    this.view = 'list';
    this.back = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm o-split-view-back' }, icon('arrow-left'), h('span'));
    this.bar = h('div', { class: 'o-split-view-bar' }, this.back);
    this.append(this.bar);
    on(this.back, 'click', () => this._goBack());
    on(this, 'click', this.items, (e, el) => {
      if (!this.listEl?.contains(el) || e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (el.localName === 'a') e.preventDefault();
      this.select(el.getAttribute('data-o-item') || el.id, { user: true });
    });
    on(this, 'keydown', e => {
      if (e.key === 'Escape' && this.compact && this.view === 'detail' && !e.defaultPrevented && this.detailEl?.contains(e.target)) { e.preventDefault(); this._goBack(); }
    });
  }
  connected() {
    const mo = new MutationObserver(muts => { if (muts.some(m => [...m.addedNodes, ...m.removedNodes].some(n => n !== this.bar))) this._parts(); });
    mo.observe(this, { childList: true });
    this.addCleanup(() => mo.disconnect());
    this.addCleanup(observeResize(this, rafThrottle(() => this._measure())));
    if (this.hash) this.listen(win, 'popstate hashchange', () => this._fromHash());
    this._parts(); this._measure();
    if (this.hash) this._fromHash(true);
  }
  update(changed) {
    if (changed.has('listWidth')) this.style.setProperty('--o-split-view-list', this.listWidth || '');
    if (changed.has('init') || changed.has('locale') || changed.has('texts')) {
      this.back.lastChild.textContent = this.t('splitView.back');
      this.back.setAttribute('aria-label', this.t('splitView.backTo'));
    }
    if (changed.has('label') && this.label) this.setAttribute('aria-label', this.label);
    if (changed.has('breakpoint')) this._measure();
    if (changed.has('selected') && !changed.has('init') && this.selected !== this._sel) this._mark(this.selected);
  }
  get compact() { return !!this._compact; }
  get selectedItem() { return this._sel ? this._item(this._sel) : null; }

  /** select(id) — mark the item, emit o-select (cancelable) and show the detail. */
  select(id, { user = false, fromHash = false } = {}) {
    if (id == null) return false;
    id = String(id);
    const item = this._item(id);
    if (!this.emit('select', { id, item })) return false;
    this._mark(id);
    this.showDetail(null, { push: this.hash && !fromHash, focus: user && this.compact });
    return true;
  }
  showDetail(id, { push = false, focus = true } = {}) {
    if (id != null) return this.select(id);
    if (this.hash && this._sel && svHash.get(this.hash) !== this._sel) svHash.set(this.hash, this._sel, push && this.compact);
    this._pushed = push && this.compact;
    this._setView('detail', focus);
  }
  showList({ focus = true } = {}) { this._setView('list', focus); }
  /** clear() — deselect and return to the list. */
  clear() { this._mark(null); if (this.hash) svHash.set(this.hash, null); this._setView('list', false); }

  _parts() {
    const kids = [...this.children].filter(c => c !== this.bar && !['template', 'script', 'style'].includes(c.localName));
    this.listEl = kids.find(c => c.getAttribute('slot') === 'list') || kids.find(c => !c.hasAttribute('slot')) || null;
    this.detailEl = kids.find(c => c.getAttribute('slot') === 'detail') || kids.filter(c => !c.hasAttribute('slot'))[1] || null;
    this.listEl?.classList.add('o-split-view-list');
    this.detailEl?.classList.add('o-split-view-detail');
    if (this.detailEl && !this.detailEl.hasAttribute('tabindex')) this.detailEl.tabIndex = -1;
    if (this.detailEl) {
      if (!this.detailEl.id) this.detailEl.id = uid('detail');
      if (!this.detailEl.hasAttribute('role')) this.detailEl.setAttribute('role', 'region');
      if (this.detailEl.previousElementSibling !== this.bar) this.detailEl.before(this.bar);   // Back button precedes the detail in tab order
    }
    this._paint();
  }
  _measure() {
    const bp = SV_BP[this.breakpoint] ?? (parseFloat(this.breakpoint) || 768);
    const w = this.getBoundingClientRect().width;
    const compact = w > 0 && w < bp;
    if (compact === this._compact) return;
    this._compact = compact;
    this.classList.add('no-anim');
    this._paint();
    requestAnimationFrame(() => requestAnimationFrame(() => this.classList.remove('no-anim')));
    this.emit('view', { view: this.view, compact });
  }
  _setView(v, focus) {
    const changed = v !== this.view;
    this.view = v;
    this._paint();
    if (changed) this.emit('view', { view: v, compact: this.compact });
    if (!this.compact || !focus) return;
    if (v === 'detail') requestAnimationFrame(() => this.detailEl?.focus({ preventScroll: true }));
    else (this._item(this._sel) || focusables(this.listEl || this)[0])?.focus({ preventScroll: true });
  }
  _paint() {
    const c = !!this._compact, detail = this.view === 'detail';
    this.classList.toggle('is-compact', c);
    this.classList.toggle('is-detail', c && detail);
    this.bar.hidden = !c;
    if (this.listEl) this.listEl.toggleAttribute('inert', c && detail);
    if (this.detailEl) this.detailEl.toggleAttribute('inert', c && !detail);
    this.bar.toggleAttribute('inert', c && !detail);
  }
  _item(id) { if (id == null || !this.listEl) return null; return $$(this.items, this.listEl).find(el => (el.getAttribute('data-o-item') || el.id) === String(id)) || null; }
  _mark(id) {
    this._sel = id == null ? null : String(id);
    this._p.selected = this._sel;
    if (!this.listEl) return;
    $$(this.items, this.listEl).forEach(el => {
      const on = (el.getAttribute('data-o-item') || el.id) === this._sel;
      el.classList.toggle('is-active', on);
      if (on) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current');
    });
  }
  _goBack() {
    if (this.hash && this._pushed && history.state?.oSplitView === this.hash) { this._pushed = false; history.back(); return; }
    if (this.hash) svHash.set(this.hash, null);
    this.showList();
  }
  _fromHash(initial) {
    const id = svHash.get(this.hash);
    if (id) { if (id !== this._sel || this.view !== 'detail') this.select(id, { fromHash: true }); }
    else if (!initial && this.view === 'detail') this.showList();
  }
}

define('o-split-view', OSplitView);
O.SplitView = OSplitView;
