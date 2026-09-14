/* Accordion / collapse panels (WAI-ARIA accordion pattern).
 *   <o-accordion multiple flush variant="default|separated|plain" icon-position="start|end">
 *     <o-accordion-item heading="Shipping" subtitle="3–5 days" icon="clock" open disabled heading-level="3">…content…</o-accordion-item>
 *   </o-accordion>
 *   Framework-safe content: put it in <div data-o-panel>…</div> (used as the region, never moved); otherwise the
 *   item's children are wrapped in a generated .o-accordion-panel.
 *   Item events: o-show / o-hide (cancelable) · o-shown / o-hidden   detail { id, item }
 *   Accordion events: o-change { id, expanded, open: [ids] }
 *   Item methods: show() · hide() · toggle(force?)      Accordion: toggle(id|index, force?) · expandAll() · collapseAll() · items · openIds
 */

i18n.add('en', { accordion: { expandAll: 'Expand all', collapseAll: 'Collapse all' } });

class OAccordionItem extends OElement {
  static props = {
    heading: String, subtitle: String, icon: String, category: String,
    open: { type: Boolean, reflect: true }, disabled: { type: Boolean, reflect: true },
    headingLevel: { type: Number, default: 3 },
  };
  setup() {
    this.classList.add('o-accordion-item');
    const base = this.id || uid('acc');
    this.btn = h('button', { type: 'button', class: 'o-accordion-trigger', id: base + '-trigger', 'aria-expanded': 'false' });
    this.header = h('div', { class: 'o-accordion-header', role: 'heading' }, this.btn);
    this._ownPanel = false;
    this.panel = [...this.children].find(c => c.matches('[data-o-panel], .o-accordion-panel')) || null;
    if (!this.panel) {
      this._ownPanel = true;
      this.panel = h('div', { class: 'o-accordion-panel' });
      this.panel.append(...[...this.childNodes]);
    }
    this.panel.classList.add('o-accordion-panel');
    if (!this.panel.id) this.panel.id = base + '-panel';
    this.panel.setAttribute('role', 'region');
    this.panel.setAttribute('aria-labelledby', this.btn.id);
    this.btn.setAttribute('aria-controls', this.panel.id);
    this.prepend(this.header);
    if (this._ownPanel) this.header.after(this.panel);
    this._open = !!this.open;
    this.panel.hidden = !this._open;
    this.classList.toggle('is-open', this._open);
    on(this.btn, 'click', () => { if (!this.disabled) this.toggle(); });
  }
  connected() {
    if (!this._ownPanel) return;
    const mo = new MutationObserver(muts => {
      const loose = muts.flatMap(m => [...m.addedNodes]).filter(n => n.parentNode === this && n !== this.header && n !== this.panel);
      if (loose.length) this.panel.append(...loose);
    });
    mo.observe(this, { childList: true });
    this.addCleanup(() => mo.disconnect());
  }
  update(changed) {
    if (changed.has('init') || changed.has('heading') || changed.has('subtitle') || changed.has('icon') || changed.has('locale')) {
      this.btn.replaceChildren(...[
        this.icon ? h('span', { class: 'o-accordion-icon' }, icon(this.icon)) : null,
        h('span', { class: 'o-accordion-text' },
          h('span', { class: 'o-accordion-title' }, this.heading ?? ''),
          this.subtitle ? h('span', { class: 'o-accordion-subtitle' }, this.subtitle) : null),
        h('span', { class: 'o-accordion-chevron', 'aria-hidden': 'true' }, icon('chevron-down')),
      ].filter(Boolean));
      this._title = this.btn.querySelector('.o-accordion-title');
    }
    if (changed.has('headingLevel') || changed.has('init')) this.header.setAttribute('aria-level', String(clamp(this.headingLevel || 3, 1, 6)));
    if (changed.has('disabled') || changed.has('init')) { this.btn.disabled = !!this.disabled; this.classList.toggle('is-disabled', !!this.disabled); }
    if (changed.has('open') && !changed.has('init') && !!this.open !== this._open) this._set(!!this.open);
    if (changed.has('init')) {
      const acc = this._acc();   // single mode: the first open item wins
      if (this._open && acc?._exclusive && !acc.multiple && acc.items.some(i => i !== this && i.expanded)) this._set(false, true);
      this.btn.setAttribute('aria-expanded', String(this._open));
    }
  }
  _acc() { return this.parentElement?.closest('o-accordion, o-faq') || null; }
  get expanded() { return !!this._open; }
  show() { return this.toggle(true); }
  hide() { return this.toggle(false); }
  /** toggle(force?) -> Promise<boolean>; emits cancelable o-show / o-hide. */
  toggle(force) {
    if (!this._setupDone) { this.open = force ?? !this.open; return Promise.resolve(!!this.open); }
    const want = force ?? !this._open;
    if (want === this._open) return Promise.resolve(want);
    if (!this.emit(want ? 'show' : 'hide', { id: this.id || this.panel.id, item: this })) return Promise.resolve(this._open);
    return this._set(want);
  }
  _set(want, instant) {
    this._open = want;
    this._p.open = want;
    this.__reflecting = true; this.toggleAttribute('open', want); this.__reflecting = false;
    this.btn.setAttribute('aria-expanded', String(want));
    this.classList.toggle('is-open', want);
    if (instant) { this.panel.hidden = !want; return Promise.resolve(want); }
    const acc = this._acc();
    if (want) acc?._exclusive?.(this);
    acc?._itemToggled?.(this);
    return collapse(this.panel, want).then(() => { if (this._open === want) this.emit(want ? 'shown' : 'hidden', { id: this.id || this.panel.id, item: this }); return want; });
  }
}

class OAccordion extends OElement {
  static props = {
    multiple: Boolean, flushed: { type: Boolean, attr: 'flush' },
    variant: { type: String, default: 'default', reflect: true }, iconPosition: { type: String, default: 'end' }, texts: Object,
  };
  setup() {
    this.classList.add('o-accordion');
    on(this, 'keydown', '.o-accordion-trigger', (e, btn) => {
      if (btn.closest('o-accordion, o-faq') !== this || e.altKey || e.ctrlKey || e.metaKey) return;
      const list = this.items.filter(i => !i.hidden && isVisible(i) && !i.disabled).map(i => i.btn);
      const i = list.indexOf(btn);
      const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: list.length - 1 }[e.key];
      if (to == null || i < 0) return;
      e.preventDefault();
      list[(to + list.length) % list.length]?.focus();
    });
  }
  update(changed) {
    const v = ['separated', 'plain'].includes(this.variant) ? this.variant : 'default';
    ['default', 'separated', 'plain'].forEach(k => this.classList.toggle('is-' + k, k === v));
    this.classList.toggle('is-flush', !!this.flushed);
    this.classList.toggle('is-icon-start', this.iconPosition === 'start');
    if (changed.has('multiple') && !this.multiple) { const first = this.items.find(i => i.expanded); if (first) this._exclusive(first, changed.has('init')); }
  }
  /** Direct items (items of nested accordions excluded). */
  get items() { return $$('o-accordion-item', this).filter(i => i.parentElement?.closest('o-accordion, o-faq') === this); }
  get openIds() { return this.items.filter(i => i.expanded).map(i => i.id || i.panel?.id); }
  _get(ref) { const all = this.items; return isNum(ref) ? all[ref] : all.find(i => i.id === ref) || null; }
  toggle(ref, force) { return this._get(ref)?.toggle(force) ?? Promise.resolve(false); }
  /** expandAll() — multiple mode only (single mode keeps one item open). */
  expandAll() { return Promise.all(this.multiple ? this.items.filter(i => !i.disabled && !i.hidden).map(i => i.show()) : []); }
  collapseAll() { return Promise.all(this.items.filter(i => !i.disabled).map(i => i.hide())); }
  _exclusive(item, instant) { if (!this.multiple) this.items.forEach(i => { if (i !== item && i.expanded) instant ? i._set(false, true) : i.hide(); }); }
  _itemToggled(item) { this.emit('change', { id: item.id || item.panel?.id, expanded: item.expanded, open: this.openIds }); }
}

define('o-accordion-item', OAccordionItem);
define('o-accordion', OAccordion);
O.Accordion = OAccordion;
O.AccordionItem = OAccordionItem;
