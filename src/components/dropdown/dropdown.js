/* Dropdown & menus
 *   <button data-o-toggle="dropdown">…</button><div class="o-dropdown-menu"> .o-dropdown-item / -header / -divider / -sub </div>
 *   <o-dropdown placement="bottom-end"> trigger + .o-dropdown-menu </o-dropdown>         events: o-open o-close o-select {item}
 *   Orion.menu(anchorEl | {x, y}, items, { placement, onSelect }) → Promise<item | null>
 *   Orion.menu.render(items) → menu element · Orion.menu.open(menuEl, opts) → controller (shared with context menus)
 * Keyboard: ListNav (arrows, Home/End, typeahead), Enter/Space, Right/Left for submenus (RTL mirrored), Escape, Tab.
 */
i18n.add('en', { dropdown: { menu: 'Menu' } });

const ITEM = '.o-dropdown-item';
const DD_MENU = new WeakMap();   // trigger -> its menu element (kept while the menu is portaled)
const DD_CTL = new WeakMap();    // trigger -> open controller

class MenuNav extends ListNav {
  get items() { return super.items.filter(el => el.closest('.o-dropdown-menu') === this.root); }
}

/** Add roles / ids / tabindex to author markup (idempotent). */
function prepareMenu(menu) {
  if (!menu.id) menu.id = uid('menu');
  if (!menu.getAttribute('role')) menu.setAttribute('role', 'menu');
  menu.setAttribute('tabindex', '-1');
  menu.classList.add('o-floating');
  for (const el of menu.querySelectorAll(ITEM)) {
    if (el.closest('.o-dropdown-menu') !== menu) continue;
    if (!el.getAttribute('role')) el.setAttribute('role', 'menuitem');
    el.setAttribute('tabindex', '-1');
    if (el.tagName === 'BUTTON' && !el.getAttribute('type')) el.type = 'button';
    if (el.classList.contains('is-disabled')) el.setAttribute('aria-disabled', 'true');
    const sub = el.parentElement && el.parentElement.classList.contains('o-dropdown-sub') ? el.parentElement.querySelector(':scope > .o-dropdown-menu') : null;
    if (sub || el.__oSub) {
      el.__oSub = el.__oSub || sub;
      el.setAttribute('aria-haspopup', 'menu');
      el.setAttribute('aria-expanded', 'false');
      el.setAttribute('aria-controls', el.__oSub.id || (el.__oSub.id = uid('menu')));
      if (!el.querySelector('.o-dropdown-arrow')) el.append(iconEl('chevron-right', { class: 'o-dropdown-arrow' }));
    }
  }
  menu.querySelectorAll('.o-dropdown-divider').forEach(d => d.getAttribute('role') || d.setAttribute('role', 'separator'));
  menu.querySelectorAll('.o-dropdown-header').forEach(d => d.getAttribute('role') || d.setAttribute('role', 'presentation'));
}
/** Focus the element after (or before) `el` in tab order, skipping `skip`. */
function focusAfter(el, back, skip) {
  if (!el || !el.isConnected) return;
  if (back) { el.focus(); return; }
  const all = focusables(doc.body).filter(x => !skip || !skip.contains(x));
  const i = all.indexOf(el);
  (all[i + 1] || el).focus();
}

class MenuCtl {
  constructor(menu, o = {}) {
    this.menu = menu; this.o = o;
    this.parent = o.parent || null;
    this.root = this.parent ? this.parent.root : this;
    this.child = null;
    prepareMenu(menu);
    this.nav = new MenuNav(menu, { onSelect: item => item.click() });
  }
  open(focus) {
    const m = this.menu, o = this.o;
    if (m.isConnected) this.home = { parent: m.parentNode, next: m.nextSibling };
    portal(m, o.owner || o.from || (doc.activeElement !== doc.body ? doc.activeElement : null) || doc.body);
    m.hidden = false;
    m.classList.add('is-open');
    m.classList.toggle('is-sub', !!this.parent);
    if (o.minWidth) m.style.minWidth = isNum(o.minWidth) ? o.minWidth + 'px' : o.minWidth;
    const anchorEl = o.anchor instanceof Element;
    this.unplace = autoPlace(m, o.anchor, {
      placement: o.placement || (this.parent ? 'end-start' : 'bottom-start'), offset: this.parent ? 2 : 4, padding: 8, size: true,
      matchWidth: anchorEl && !this.parent && o.matchWidth !== false ? 'min' : false, rtl: o.rtl,
      onHidden: anchorEl && !this.parent ? () => this.close('hidden') : undefined,
    });
    this.ov = overlays.open({ el: m, owner: anchorEl ? o.owner || o.anchor : o.owner || null, returnFocus: false, onClose: r => this._hide(r) });
    this.offs = [
      on(m, 'keydown', e => this.keydown(e)),
      on(m, 'click', ITEM, (e, it) => this.activate(it, e)),
      on(m, 'pointermove', ITEM, (e, it) => this.hover(it, e)),
      on(m, 'pointerenter', () => { if (this.parent) this.parent.cancelSubClose(); }),
    ];
    if (o.owner) o.owner.setAttribute('aria-expanded', 'true');
    animate(m, this.parent ? 'fadeIn' : 'zoomIn', { duration: 120 });
    this.focus(focus);
    return this;
  }
  focus(mode) {
    if (mode === 'first') this.nav.first();
    else if (mode === 'last') this.nav.last();
    else if (mode === 'menu') { this.nav.reset(); try { this.menu.focus({ preventScroll: true }); } catch {} }
  }
  close(reason = 'api') { this.ov?.close(reason); }
  _hide(reason) {
    const m = this.menu, a = doc.activeElement, had = !a || a === doc.body || m.contains(a);
    this.ov = null;
    this.unplace?.(); this.unplace = null;
    (this.offs || []).splice(0).forEach(f => f());
    clearTimeout(this.subT); clearTimeout(this.subCloseT); this.subCloseT = 0;
    m.classList.remove('is-open', 'is-sub');
    m.style.minWidth = m.style.maxHeight = '';
    this.nav.reset();
    const home = this.home; this.home = null;
    if (home && home.parent && home.parent.isConnected) home.parent.insertBefore(m, home.next && home.next.parentNode === home.parent ? home.next : null);
    const owner = this.o.owner;
    if (owner) { owner.setAttribute('aria-expanded', 'false'); owner.classList.remove('is-expanded'); }
    if (this.parent && this.parent.child === this) this.parent.child = null;
    if (had && !['outside', 'parent', 'tab', 'switch', 'hover', 'hidden'].includes(reason)) {
      const back = this.parent ? owner : this.o.focusBack || owner;
      if (back && back.isConnected) { try { back.focus({ preventScroll: true }); } catch {} }
    }
    if (!this.parent && this.o.eventTarget) emit(this.o.eventTarget, 'o-close', { reason, menu: m });
    try { this.o.onClose?.(reason); } catch (err) { console.error(err); }
  }
  activate(item, e) {
    if (item.disabled || item.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
    if (item.__oSub) { e.preventDefault(); this.openSub(item, 'first'); return; }
    const role = item.getAttribute('role'), data = item.__oItem;
    if (role === 'menuitemcheckbox') item.setAttribute('aria-checked', String(item.getAttribute('aria-checked') !== 'true'));
    else if (role === 'menuitemradio') {
      const g = item.getAttribute('data-o-group');
      [...this.menu.querySelectorAll('[role=menuitemradio]')].filter(r => r.closest('.o-dropdown-menu') === this.menu && (r.getAttribute('data-o-group') || '') === (g || ''))
        .forEach(r => { r.setAttribute('aria-checked', String(r === item)); if (r.__oItem) r.__oItem.checked = r === item; });
    }
    const checked = role === 'menuitem' ? undefined : item.getAttribute('aria-checked') === 'true';
    if (data && checked !== undefined) data.checked = checked;
    const detail = { item: data || item, el: item, checked, value: data ? data.value ?? data.id ?? data.label : item.getAttribute('data-value') ?? item.textContent.trim() };
    const root = this.root, tgt = root.o.eventTarget;
    const ev = tgt ? emit(tgt, 'o-select', detail) : null;
    if (data && isFn(data.onClick)) { try { data.onClick(data, e); } catch (err) { console.error('[Orion] menu item:', err); } }
    try { root.o.onSelect?.(data || item, e, detail); } catch (err) { console.error(err); }
    if ((ev && ev.defaultPrevented) || item.hasAttribute('data-o-keep-open') || item.closest('.o-dropdown-menu[data-o-keep-open]')) return;
    root.close('select');
  }
  openSub(item, focus) {
    const sub = item.__oSub;
    if (!sub) return;
    clearTimeout(this.subT); this.cancelSubClose();
    if (this.child && this.child.menu === sub) { this.child.focus(focus); return; }
    this.child?.close('switch');
    item.classList.add('is-expanded');
    this.child = new MenuCtl(sub, { anchor: item, owner: item, parent: this, rtl: this.o.rtl, placement: 'end-start' });
    this.child.open(focus);
  }
  cancelSubClose() { clearTimeout(this.subCloseT); this.subCloseT = 0; }
  hover(item, e) {
    if (e.pointerType === 'touch') return;
    if (this.parent) this.parent.cancelSubClose();
    if (this.nav.active !== item && !item.disabled && item.getAttribute('aria-disabled') !== 'true') this.nav.setItem(item, { scroll: false });
    clearTimeout(this.subT);
    if (item.__oSub) {
      if (!this.child || this.child.menu !== item.__oSub) this.subT = setTimeout(() => this.openSub(item, null), 120);
      else this.cancelSubClose();
    } else if (this.child && !this.subCloseT) this.subCloseT = setTimeout(() => { this.subCloseT = 0; this.child?.close('hover'); }, 280);
  }
  keydown(e) {
    const item = e.target.closest ? e.target.closest(ITEM) : null;
    const rtl = isRTL(this.menu), fwd = rtl ? 'ArrowLeft' : 'ArrowRight', back = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === fwd && item && item.__oSub) { e.preventDefault(); this.openSub(item, 'first'); return; }
    if (e.key === back && this.parent) { e.preventDefault(); this.close('key'); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const root = this.root, owner = root.o.owner || root.o.focusBack;
      root.close('tab');
      focusAfter(owner, e.shiftKey, root.menu);
      return;
    }
    if (this.nav.handle(e)) e.stopPropagation();
  }
}

/* ── renderer for item objects ── */
function renderMenu(items) {
  const menu = h('div', { class: 'o-floating o-dropdown-menu', role: 'menu' });
  for (const it of toArr(items)) {
    if (it == null || it === false || it.hidden) continue;
    const type = it === '-' ? 'divider' : it.type || 'item';
    if (type === 'divider') { menu.append(h('div', { class: 'o-dropdown-divider', role: 'separator' })); continue; }
    if (type === 'header') { menu.append(h('div', { class: 'o-dropdown-header', role: 'presentation' }, it.label ?? '')); continue; }
    const role = type === 'checkbox' ? 'menuitemcheckbox' : type === 'radio' ? 'menuitemradio' : 'menuitem';
    const kids = it.children && it.children.length ? it.children : null;
    const tag = it.href && !kids && role === 'menuitem' ? 'a' : 'button';
    const el = h(tag, {
      class: cls('o-dropdown-item', it.danger && 'is-danger', it.className), role, tabindex: '-1',
      type: tag === 'button' ? 'button' : null, href: tag === 'a' ? it.href : null, target: tag === 'a' ? it.target : null,
      'aria-checked': role !== 'menuitem' ? String(!!it.checked) : null, 'aria-disabled': it.disabled ? 'true' : null,
      disabled: tag === 'button' && it.disabled ? true : null, 'data-o-group': it.group ?? null,
      'data-o-keep-open': it.keepOpen ? true : null, 'data-label': it.label ?? null, 'data-value': it.value ?? null,
    },
    it.icon ? h('span', { class: 'o-dropdown-icon' }, icon(it.icon)) : null,
    h('span', { class: 'o-dropdown-label' }, h('span', { class: 'o-dropdown-text' }, it.label ?? ''), it.description ? h('span', { class: 'o-dropdown-desc' }, it.description) : null),
    it.shortcut ? h('span', { class: 'o-dropdown-kbd' }, it.shortcut) : null);
    el.__oItem = it;
    if (kids) menu.append(h('div', { class: 'o-dropdown-sub' }, el, renderMenu(kids)));
    else menu.append(el);
  }
  return menu;
}
/** Open a menu element (author markup or rendered) → controller. */
function openMenu(menu, o = {}) {
  const ctl = new MenuCtl(menu, o);
  return ctl.open(o.focus);
}

/* ── triggers: data-o-toggle="dropdown" and <o-dropdown> ── */
function menuOfTrigger(trigger) {
  let m = DD_MENU.get(trigger);
  if (!m) {
    m = targetOf(trigger);
    if (!m) { let n = trigger.nextElementSibling; while (n && !n.classList.contains('o-dropdown-menu')) n = n.nextElementSibling; m = n; }
    if (m) DD_MENU.set(trigger, m);
  }
  return m;
}
function ddAria(trigger, menu) {
  trigger.setAttribute('aria-haspopup', 'menu');
  if (!trigger.hasAttribute('aria-expanded')) trigger.setAttribute('aria-expanded', 'false');
  if (menu) { if (!menu.id) menu.id = uid('menu'); trigger.setAttribute('aria-controls', menu.id); }
}
/** Open / close the dropdown of a trigger. host = event target (<o-dropdown> or the trigger). */
function ddToggle(trigger, { menu, host, placement, focus, force } = {}) {
  const open = DD_CTL.get(trigger);
  if (open && open.ov) { if (force !== true) open.close('toggle'); return open; }
  if (force === false) return null;
  menu = menu || menuOfTrigger(trigger);
  if (!menu || trigger.disabled || trigger.getAttribute('aria-disabled') === 'true') return null;
  host = host || trigger;
  ddAria(trigger, menu);
  if (emit(host, 'o-open', { menu }).defaultPrevented) return null;
  const ctl = openMenu(menu, {
    anchor: trigger, owner: trigger, eventTarget: host, focus,
    placement: placement || trigger.getAttribute('data-o-placement') || 'bottom-start',
    onClose: () => { if (DD_CTL.get(trigger) === ctl) DD_CTL.delete(trigger); host.__oSync?.(); },
  });
  DD_CTL.set(trigger, ctl);
  host.__oSync?.();
  return ctl;
}
action('dropdown', (trigger, e) => {
  const dd = trigger.closest('o-dropdown');
  if (dd && dd.triggerEl === trigger) return; // handled by <o-dropdown>
  ddToggle(trigger, { focus: e.detail === 0 ? 'first' : 'menu' });
});
if (isBrowser) ready(() => {
  $$('[data-o-toggle="dropdown"]').forEach(t => ddAria(t, menuOfTrigger(t)));
  on(doc, 'focusin pointerover', '[data-o-toggle="dropdown"]', (e, t) => { if (!t.hasAttribute('aria-haspopup')) ddAria(t, menuOfTrigger(t)); });
  on(doc, 'keydown', '[data-o-toggle="dropdown"]', (e, t) => {
    if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || e.altKey || e.ctrlKey || e.metaKey) return;
    const dd = t.closest('o-dropdown');
    if (dd && dd.triggerEl === t) return;
    e.preventDefault();
    const ctl = DD_CTL.get(t);
    if (ctl && ctl.ov) ctl.focus(e.key === 'ArrowUp' ? 'last' : 'first');
    else ddToggle(t, { focus: e.key === 'ArrowUp' ? 'last' : 'first' });
  });
});

class ODropdown extends OElement {
  static props = {
    placement: { type: String, default: 'bottom-start' },
    disabled: { type: Boolean, reflect: true },
    isOpen: { type: Boolean, attr: 'open', reflect: true, default: false },
  };
  get open() { return this.__openFn || (this.__openFn = focus => this._open(focus || 'first')); }
  set open(v) { this.isOpen = !!v; }
  connectedCallback() {
    if (Object.prototype.hasOwnProperty.call(this, 'open')) { const v = this.open; delete this.open; if (!isFn(v)) this.isOpen = !!v; }
    super.connectedCallback();
  }
  get triggerEl() { return [...this.children].find(c => !c.classList.contains('o-dropdown-menu')) || null; }
  get menuEl() {
    if (this._menu && (this._menu.parentNode === this || this._menu.classList.contains('is-open'))) return this._menu;
    return (this._menu = this.querySelector(':scope > .o-dropdown-menu'));
  }
  setup() {
    this.classList.add('o-dropdown');
    this.__oSync = () => { const c = this._ctl(); this.isOpen = !!(c && c.ov); this.classList.toggle('is-open', this.isOpen); };
    on(this, 'click', e => {
      const tr = this.triggerEl;
      if (!tr || !tr.contains(e.target) || this.disabled) return;
      if (tr.tagName === 'A') e.preventDefault();
      this._toggle(e.detail === 0 ? 'first' : 'menu');
    });
    on(this, 'keydown', e => {
      const tr = this.triggerEl;
      if (!tr || !tr.contains(e.target) || this.disabled || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      e.preventDefault();
      const f = e.key === 'ArrowUp' ? 'last' : 'first', c = this._ctl();
      if (c && c.ov) c.focus(f); else this._open(f);
    });
  }
  connected() { const tr = this.triggerEl; if (tr) ddAria(tr, this.menuEl); }
  disconnected() { queueMicrotask(() => { if (!this.isConnected) this.close(); }); }
  _ctl() { const tr = this.triggerEl; return tr ? DD_CTL.get(tr) : null; }
  _open(focus) { const tr = this.triggerEl; if (!tr || this.disabled) return; ddToggle(tr, { menu: this.menuEl, host: this, placement: this.placement, focus, force: true }); }
  _toggle(focus) { const tr = this.triggerEl; if (tr) ddToggle(tr, { menu: this.menuEl, host: this, placement: this.placement, focus }); }
  close() { const c = this._ctl(); if (c) c.close('api'); }
  toggle() { this._toggle('first'); }
  update(changed) {
    if (!changed.has('isOpen') || changed.has('init') && !this.isOpen) return;
    const c = this._ctl(), open = !!(c && c.ov);
    if (this.isOpen && !open) this._open('first');
    else if (!this.isOpen && open) c.close('api');
  }
}
define('o-dropdown', ODropdown);
O.Dropdown = ODropdown;

/** Orion.menu(anchor, items, opts) → Promise<item | null> */
O.menu = function (anchor, items, opts = {}) {
  if (!isBrowser) return Promise.resolve(null);
  return new Promise(resolve => {
    const point = anchor && !(anchor instanceof Element) && isObj(anchor) && 'x' in anchor;
    const el = point ? null : $(anchor);
    const menu = renderMenu(isFn(items) ? items() : items);
    if (opts.className) menu.classList.add(...opts.className.split(/\s+/).filter(Boolean));
    let picked = null;
    openMenu(menu, {
      anchor: point ? { x: anchor.x, y: anchor.y } : el, owner: opts.owner || el || null, from: opts.from, eventTarget: opts.eventTarget || el || null,
      placement: opts.placement || 'bottom-start', focus: opts.focus || (point ? 'menu' : 'first'), rtl: opts.rtl, minWidth: opts.minWidth,
      focusBack: opts.focusBack, matchWidth: opts.matchWidth,
      onSelect: (item, ev) => { picked = item; try { opts.onSelect?.(item, ev); } catch (err) { console.error(err); } },
      onClose: reason => { menu.remove(); try { opts.onClose?.(reason); } catch (err) { console.error(err); } resolve(picked); },
    });
  });
};
O.menu.render = renderMenu;
O.menu.open = openMenu;
O.menu.prepare = prepareMenu;
O.menu.Controller = MenuCtl;
