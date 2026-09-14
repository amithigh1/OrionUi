/* ============================================================================
 * core: accessibility helpers
 *   announce(msg, 'polite'|'assertive')     screen-reader live region
 *   new ListNav(root, opts)                 keyboard navigation for menus / listboxes / grids
 * ========================================================================== */

let __live = null;
/** Announce a message to screen readers. */
function announce(msg, politeness = 'polite') {
  if (!isBrowser || !msg) return;
  if (!__live) { __live = h('div', { id: 'o-live', class: 'o-sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' }); doc.body.appendChild(__live); }
  __live.setAttribute('aria-live', politeness);
  __live.textContent = '';
  setTimeout(() => { __live.textContent = String(msg); }, 40);
}

/**
 * ListNav — arrow-key navigation over items inside `root`.
 *   const nav = new ListNav(listEl, {
 *     items: '[role=option]:not([aria-disabled=true])',   // selector (re-queried every time)
 *     orientation: 'vertical' | 'horizontal' | 'grid',
 *     columns: 7,              // for grid (or a function)
 *     loop: true,
 *     virtual: inputEl,        // keep DOM focus on inputEl and use aria-activedescendant (combobox pattern)
 *     activeClass: 'is-active',
 *     typeahead: true,
 *     onActivate(item, i),     // active item changed
 *     onSelect(item, i, event) // Enter / Space
 *   });
 *   keydown -> if (nav.handle(e)) return;   (nav.handle returns true when it consumed the key)
 */
class ListNav {
  constructor(root, opts = {}) {
    this.root = root;
    this.o = { items: '[role=option],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=tab],[role=treeitem]', orientation: 'vertical', loop: true, activeClass: 'is-active', typeahead: true, ...opts };
    this.index = -1;
    this._buf = ''; this._bufT = 0;
  }
  get items() {
    return $$(this.o.items, this.root).filter(el => el.getAttribute('aria-disabled') !== 'true' && !el.disabled && !el.hidden && isVisible(el));
  }
  get active() { return this.items[this.index] || null; }
  /** Make item i active (focus or aria-activedescendant). */
  set(i, { scroll = true, focus = true } = {}) {
    const items = this.items;
    if (!items.length) { this.index = -1; if (this.o.virtual) this.o.virtual.removeAttribute('aria-activedescendant'); return null; }
    i = this.o.loop ? (i + items.length) % items.length : clamp(i, 0, items.length - 1);
    items.forEach(el => el.classList.remove(this.o.activeClass));
    const el = items[i];
    this.index = i;
    el.classList.add(this.o.activeClass);
    if (this.o.virtual) {
      if (!el.id) el.id = uid('opt');
      this.o.virtual.setAttribute('aria-activedescendant', el.id);
      if (scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else if (focus) {
      items.forEach(x => x.setAttribute('tabindex', x === el ? '0' : '-1'));
      el.focus({ preventScroll: !scroll });
      if (scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    this.o.onActivate?.(el, i);
    return el;
  }
  setItem(el, opts) { const i = this.items.indexOf(el); if (i >= 0) this.set(i, opts); }
  reset() { this.items.forEach(el => el.classList.remove(this.o.activeClass)); this.index = -1; this.o.virtual?.removeAttribute('aria-activedescendant'); }
  move(delta) { const n = this.items.length; if (!n) return null; if (this.index < 0) return this.set(delta > 0 ? 0 : n - 1); return this.set(this.index + delta); }
  first() { return this.set(0); }
  last() { return this.set(this.items.length - 1); }
  /** Handle a keydown event. Returns true if consumed. */
  handle(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return false;
    const o = this.o, rtl = isRTL(this.root);
    const horiz = o.orientation === 'horizontal', grid = o.orientation === 'grid';
    const cols = grid ? (isFn(o.columns) ? o.columns() : o.columns || 1) : 1;
    let k = e.key;
    if (rtl && (k === 'ArrowLeft' || k === 'ArrowRight') && (horiz || grid)) k = k === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    const map = {
      ArrowDown: grid ? cols : horiz ? 0 : 1, ArrowUp: grid ? -cols : horiz ? 0 : -1,
      ArrowRight: grid || horiz ? 1 : 0, ArrowLeft: grid || horiz ? -1 : 0,
    };
    if (k in map && map[k]) { e.preventDefault(); this.move(map[k]); return true; }
    if (k === 'Home') { e.preventDefault(); this.first(); return true; }
    if (k === 'End') { e.preventDefault(); this.last(); return true; }
    if (k === 'PageDown') { e.preventDefault(); this.move(10); return true; }
    if (k === 'PageUp') { e.preventDefault(); this.move(-10); return true; }
    if ((k === 'Enter' || (k === ' ' && !o.virtual)) && this.active) { e.preventDefault(); o.onSelect?.(this.active, this.index, e); return true; }
    if (o.typeahead && !o.virtual && k.length === 1 && /\S/.test(k)) {
      const now = Date.now();
      this._buf = (now - this._bufT > 700 ? '' : this._buf) + k.toLowerCase();
      this._bufT = now;
      const items = this.items;
      const start = this.index + (this._buf.length === 1 ? 1 : 0);
      for (let n = 0; n < items.length; n++) {
        const i = (start + n) % items.length;
        if ((items[i].getAttribute('data-label') || items[i].textContent).trim().toLowerCase().startsWith(this._buf)) { this.set(i); return true; }
      }
    }
    return false;
  }
}

O.a11y = { announce, ListNav, focusables, focusFirst, trapFocus, reducedMotion };
O.announce = announce;
O.ListNav = ListNav;
