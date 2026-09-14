/* Panels kit — small helpers shared by tabs, workspace and dock (exposed as Orion.Tabs.kit; internal, may change).
 *   menu(anchor | {x,y}, items, { owner, placement, label, onClose }) -> { el, close }   built-in popup menu
 *     items: [{ label, icon, action(), disabled, checked, danger, shortcut } | { divider: true } | { header: 'Text' }]
 *   contextMenu({x,y}, items, opts)      uses Orion.contextMenu when present, else menu()
 *   dragReorder(container, { items, axis, canDrag, onStart, onMove(el, toIndex), onEnd(el, from, to) }) -> off()
 *   hashParams.get(k) / .set(k, v, push)  "#a=1&b=2" style deep links (plain "#anchor" parts are kept)
 *   queryParam.get(k) / .set(k, v)        "?tab=x" deep links
 */

i18n.add('en', {
  tabs: {
    scrollPrev: 'Scroll tabs back', scrollNext: 'Scroll tabs forward', more: 'More tabs', add: 'Add tab',
    close: 'Close', closeTab: 'Close {label}', closed: '{label} closed', moved: '{label} moved to position {pos} of {count}',
    newTab: 'New tab', closeHint: 'Delete',
  },
});

function kitMenu(anchor, items, opts = {}) {
  const el = h('div', { class: 'o-floating o-tabs-menu', role: 'menu', tabindex: '-1', 'aria-label': opts.label || null });
  const checks = items.some(it => it && it.checked != null);
  for (const it of items) {
    if (!it) continue;
    if (it.divider) { el.append(h('div', { class: 'o-tabs-menu-sep', role: 'separator' })); continue; }
    if (it.header) { el.append(h('div', { class: 'o-tabs-menu-header', role: 'presentation' }, it.header)); continue; }
    const b = h('button', {
      type: 'button', tabindex: '-1', disabled: !!it.disabled, class: cls('o-tabs-menu-item', it.danger && 'is-danger'),
      role: it.checked != null ? 'menuitemcheckbox' : 'menuitem', 'aria-checked': it.checked != null ? String(!!it.checked) : null,
    },
    checks ? h('span', { class: 'o-tabs-menu-check' }, it.checked ? icon('check') : null) : null,
    it.icon ? icon(it.icon) : null,
    h('span', { class: 'o-tabs-menu-label' }, it.label),
    it.shortcut ? h('kbd', { class: 'o-tabs-menu-kbd' }, it.shortcut) : null);
    b.__item = it;
    el.append(b);
  }
  const from = anchor instanceof Element ? anchor : opts.owner || doc.body;
  portal(el, from);
  let unplace = noop, ov = null;
  const choose = b => {
    const it = b.__item;
    ov?.close('select');
    try { it.action?.(it); } catch (e) { console.error('[Orion] menu action failed:', e); }
  };
  const nav = new ListNav(el, { items: '[role^=menuitem]', typeahead: true, onSelect: b => choose(b) });
  on(el, 'click', '[role^=menuitem]', (e, b) => { if (!b.disabled) choose(b); });
  on(el, 'pointermove', '[role^=menuitem]', (e, b) => { if (doc.activeElement !== b && !b.disabled) nav.setItem(b, { scroll: false }); });
  on(el, 'keydown', e => {
    if (nav.handle(e)) return;
    if (e.key === 'Tab') { e.preventDefault(); ov?.close('tab'); }
  });
  on(el, 'contextmenu', e => e.preventDefault());
  if (anchor instanceof Element) unplace = autoPlace(el, anchor, { placement: opts.placement || 'bottom-start', offset: 4, size: true });
  else place(el, anchor, { placement: 'bottom-start', offset: 2, size: true });
  ov = overlays.open({
    el, owner: opts.owner || (anchor instanceof Element ? anchor : null),
    onClose: reason => { unplace(); el.remove(); opts.onClose?.(reason); },
  });
  animate(el, 'zoomIn', { duration: 120 });
  requestAnimationFrame(() => { if (el.isConnected) nav.first() || el.focus(); });
  return { el, close: (r = 'api') => ov?.close(r) };
}

/** Uses Orion.contextMenu (another package) when available, else the built-in menu. */
function kitContextMenu(point, items, opts = {}) {
  const cm = O.contextMenu;
  try {
    if (cm && isFn(cm.open)) return cm.open({ x: point.x, y: point.y, items, ...opts });
    if (isFn(cm)) return cm({ x: point.x, y: point.y, items, ...opts });
  } catch (e) { console.warn('[Orion] contextMenu fallback:', e); }
  return kitMenu(point, items, opts);
}

/** Pointer drag reordering of direct children (long-press on touch). The consumer moves the DOM in onMove. */
function kitDragReorder(box, o = {}) {
  const axis = o.axis || 'x';
  let st = null;
  const kids = () => [...box.children].filter(c => c.matches(o.items));
  const reset = () => {
    if (!st) return;
    clearTimeout(st.timer);
    if (st.active) {
      st.el.classList.remove('is-dragging'); box.classList.remove('is-reordering');
      try { box.releasePointerCapture(st.id); } catch {}
      const swallow = e => { e.stopPropagation(); e.preventDefault(); };
      box.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => box.removeEventListener('click', swallow, { capture: true }), 0);
      o.onEnd?.(st.el, st.from, kids().indexOf(st.el));
    }
    st = null;
  };
  const offs = [
    on(box, 'pointerdown', o.items, (e, el) => {
      if (e.button !== 0 || e.target.closest('[data-no-drag]') || (o.canDrag && !o.canDrag(el, e))) return;
      st = { el, id: e.pointerId, x: e.clientX, y: e.clientY, active: false, armed: e.pointerType !== 'touch', from: kids().indexOf(el) };
      if (!st.armed) st.timer = setTimeout(() => { if (st) { st.armed = true; navigator.vibrate?.(10); } }, 380);
    }),
    on(box, 'pointermove', e => {
      if (!st || e.pointerId !== st.id) return;
      const dist = Math.hypot(e.clientX - st.x, e.clientY - st.y);
      if (!st.active) {
        if (dist < 6) return;
        if (!st.armed) { clearTimeout(st.timer); st = null; return; }
        st.active = true;
        try { box.setPointerCapture(e.pointerId); } catch {}
        st.el.classList.add('is-dragging'); box.classList.add('is-reordering');
        o.onStart?.(st.el);
      }
      e.preventDefault();
      const p = axis === 'x' ? e.clientX : e.clientY, list = kids();
      const target = list.find(s => {
        if (s === st.el) return false;
        const r = s.getBoundingClientRect();
        return axis === 'x' ? p >= r.left && p <= r.right : p >= r.top && p <= r.bottom;
      });
      if (!target) return;
      const r = target.getBoundingClientRect();
      let after = p > (axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2);
      if (axis === 'x' && isRTL(box)) after = !after;
      const ti = list.indexOf(target), ci = list.indexOf(st.el);
      if ((ti > ci && !after) || (ti < ci && after)) return;
      const before = new Map(list.map(s => [s, s.getBoundingClientRect()]));
      o.onMove?.(st.el, ti);
      kids().forEach(s => {
        const a = before.get(s); if (!a || s === st.el) return;
        const b = s.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
        if (dx || dy) animate(s, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 150 });
      });
    }),
    on(box, 'pointerup pointercancel lostpointercapture', e => { if (st && e.pointerId === st.id) reset(); }),
    on(box, 'touchmove', e => { if (st && st.armed) e.preventDefault(); }, { passive: false }),
    on(box, 'contextmenu', e => { if (st && !st.active && !st.armed) return; if (st) e.preventDefault(); }),
  ];
  return () => { reset(); offs.forEach(f => f()); };
}

const hashParams = {
  parse() {
    const out = { plain: [], params: new Map() };
    for (const part of (isBrowser ? location.hash.slice(1) : '').split('&')) {
      if (!part) continue;
      const i = part.indexOf('=');
      if (i < 0) { out.plain.push(part); continue; }
      try { out.params.set(decodeURIComponent(part.slice(0, i)), decodeURIComponent(part.slice(i + 1))); } catch {}
    }
    return out;
  },
  get(k) { return hashParams.parse().params.get(k) ?? null; },
  set(k, v, push = false) {
    if (!isBrowser) return;
    const p = hashParams.parse();
    if (v == null || v === '') p.params.delete(k); else p.params.set(k, String(v));
    const s = [...p.plain, ...[...p.params].map(([a, b]) => encodeURIComponent(a) + '=' + encodeURIComponent(b))].join('&');
    const url = location.pathname + location.search + (s ? '#' + s : '');
    if (url === location.pathname + location.search + location.hash) return;
    try { history[push ? 'pushState' : 'replaceState'](push ? null : history.state, '', url); } catch {}
  },
};
const queryParam = {
  get(k) { try { return new URL(location.href).searchParams.get(k); } catch { return null; } },
  set(k, v) {
    try {
      const u = new URL(location.href);
      if (v == null || v === '') u.searchParams.delete(k); else u.searchParams.set(k, v);
      if (u.href !== location.href) history.replaceState(history.state, '', u);
    } catch {}
  },
};
