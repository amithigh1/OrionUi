/* <o-breadcrumb> — data-driven breadcrumb trail. Reuses the static .o-breadcrumb CSS from core.
 *   <o-breadcrumb items='[{"label":"Home","href":"/"},{"label":"Users","href":"/users"},{"label":"Aisha"}]'></o-breadcrumb>
 *   <o-breadcrumb auto max="4" separator="chevron"></o-breadcrumb>   <!-- derives the trail -->
 * Props: items (Array), separator ('slash'|'chevron'|'dot'), max (Number, 0 = no limit), auto (Boolean), texts.
 * `auto` (with no items) builds the trail from the active sidebar link chain (`.o-sidebar .is-active`), falling
 * back to the URL path segments, and re-syncs on `o-menu-active` / navigation.
 * Overflow beyond `max` collapses the middle crumbs into a "…" button with a floating menu.
 * Events: o-navigate { item, href, originalEvent } — cancelable (preventDefault to let a router take over).
 */
i18n.add('en', { breadcrumb: { home: 'Home', more: 'Show hidden breadcrumbs' } });

const humanize = s => decodeURIComponent(s).replace(/[-_]+/g, ' ').replace(/\.\w+$/, '').replace(/\b\w/g, c => c.toUpperCase());

function fromSidebar() {
  const active = doc.querySelector('.o-sidebar .o-menu-link.is-active, o-sidebar-menu .o-menu-link.is-active');
  if (!active) return null;
  const label = el => (el.querySelector('.o-menu-label') || el).textContent.trim();
  const chain = [{ label: label(active), href: active.tagName === 'A' ? active.getAttribute('href') : null }];
  let li = active.closest('.o-menu-item');
  for (let p = li?.parentElement?.closest('.o-menu-item'); p; p = p.parentElement?.closest('.o-menu-item')) {
    const tg = p.querySelector(':scope > .o-menu-toggle');
    if (tg) chain.unshift({ label: label(tg) });
  }
  return chain.length > 1 ? chain : null;
}
function fromURL() {
  const segs = location.pathname.split('/').filter(Boolean);
  const out = [{ label: t('breadcrumb.home'), href: '/' }];
  let acc = '';
  segs.forEach((s, i) => { acc += '/' + s; out.push({ label: humanize(s), href: i < segs.length - 1 ? acc : undefined }); });
  return out;
}

let __menuOv = null, __menuHost = null;
function closeOverflow() { if (__menuOv) __menuOv.close('api'); }
function openOverflow(btn, items, host) {
  closeOverflow();
  const menu = h('div', { class: 'o-breadcrumb-menu o-floating', role: 'menu' },
    items.map(it => it.href
      ? h('a', { class: 'o-breadcrumb-menu-item', role: 'menuitem', href: it.href, text: it.label })
      : h('span', { class: 'o-breadcrumb-menu-item is-static', role: 'presentation', text: it.label })));
  portal(menu, btn);
  on(menu, 'click', 'a', (e, a) => {
    const it = items[[...menu.children].indexOf(a)];
    const ok = emit(host, 'o-navigate', { item: it, href: it.href, originalEvent: e });
    if (!ok) e.preventDefault();
    closeOverflow();
  });
  const unplace = autoPlace(menu, btn, { placement: 'bottom-start', offset: 4 });
  btn.setAttribute('aria-expanded', 'true');
  __menuHost = host;
  __menuOv = overlays.open({
    el: menu, owner: btn,
    onClose: () => { unplace(); menu.remove(); btn.setAttribute('aria-expanded', 'false'); __menuOv = null; __menuHost = null; },
  });
  animate(menu, 'zoomIn', { duration: 120 });
  focusFirst(menu, { preferAutofocus: false });
}
if (isBrowser) ready(() => {
  on(doc, 'keydown', '.o-breadcrumb-more', (e, btn) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
  });
});

class OBreadcrumb extends OElement {
  static props = {
    items: { type: Array, default: () => [] },
    separator: { type: String, default: 'slash', reflect: true },
    max: { type: Number, default: 0 },
    auto: { type: Boolean, reflect: true },
    texts: Object,
  };
  setup() {
    this.classList.add('o-breadcrumb-host');
    this._ol = h('ol', { class: 'o-breadcrumb' });
    this.replaceChildren(this._ol);
    on(this, 'click', 'a.o-breadcrumb-link', (e, a) => {
      const it = this._map.get(a); if (!it) return;
      const ok = this.emit('navigate', { item: it, href: it.href, originalEvent: e });
      if (!ok) e.preventDefault();
    });
    on(this, 'click', '.o-breadcrumb-more', (e, btn) => { e.stopPropagation(); openOverflow(btn, this._hidden || [], this); });
  }
  connected() {
    this.listen(doc, 'o-menu-active', () => { if (this.auto && !this._p.items?.length) this._render(); });
    this.listen(win, 'popstate hashchange', () => { if (this.auto && !this._p.items?.length) this._render(); });
  }
  disconnected() { if (__menuHost === this) closeOverflow(); }
  update(changed) { if (changed.has('items') || changed.has('separator') || changed.has('max') || changed.has('auto') || changed.has('init') || changed.has('locale')) this._render(); }
  _resolve() {
    if (this.items && this.items.length) return this.items;
    if (this.auto) return fromSidebar() || fromURL();
    return [];
  }
  _render() {
    this._ol.className = cls('o-breadcrumb', this.separator === 'chevron' && 'o-breadcrumb-chevron', this.separator === 'dot' && 'o-breadcrumb-dot');
    const items = this._resolve();
    this._map = new Map();
    this._hidden = [];
    let visible = items;
    if (this.max > 0 && items.length > this.max) {
      const tailN = Math.max(1, this.max - 1);
      this._hidden = items.slice(1, items.length - tailN);
      visible = [items[0], null, ...items.slice(items.length - tailN)]; // null = overflow marker
    }
    const nodes = visible.map((it, i) => {
      const last = i === visible.length - 1;
      if (it === null) {
        return h('li', { class: 'o-breadcrumb-item' },
          h('button', { type: 'button', class: 'o-breadcrumb-more', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': this.t('breadcrumb.more') }, '…'));
      }
      const li = h('li', { class: 'o-breadcrumb-item', 'aria-current': last ? 'page' : null });
      const content = [it.icon ? icon(it.icon) : null, h('span', null, it.label ?? '')];
      if (it.href && !last) { const a = h('a', { class: 'o-breadcrumb-link', href: it.href }, content); this._map.set(a, it); li.append(a); }
      else li.append(h('span', null, content));
      return li;
    });
    this._ol.replaceChildren(...nodes);
  }
}
define('o-breadcrumb', OBreadcrumb);
O.Breadcrumb = OBreadcrumb;
