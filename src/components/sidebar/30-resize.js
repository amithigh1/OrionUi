/* Sidebar: resizable width (drag the edge, arrow keys, double-click resets). Persisted per sidebar id.
 *   <aside class="o-sidebar" data-o-sidebar data-o-sidebar-resizable="200,420">   (min,max px; optional)
 * Sets --o-sidebar-w on the closest .o-app (or on the sidebar itself when standalone).
 */
O.sidebar._resizer = function (sb) {
  let r = sb.querySelector(':scope > .o-sidebar-resizer');
  if (!r && !sb.hasAttribute('data-o-sidebar-resizable')) return noop;
  const created = !r;
  if (!r) { r = h('div', { class: 'o-sidebar-resizer' }); sb.append(r); }
  const [min, max] = (sb.getAttribute('data-o-sidebar-resizable') || '').split(',').map(Number).filter(n => n > 0).concat([200, 420]).slice(0, 2);
  const host = sb.closest('.o-app') || sb;
  const key = `orion:sidebar:${sb.id || 'main'}:width`;
  Object.entries({ role: 'separator', 'aria-orientation': 'vertical', tabindex: '0', 'aria-label': t('sidebar.resize'), 'aria-valuemin': min, 'aria-valuemax': max })
    .forEach(([k, v]) => r.setAttribute(k, v));
  const width = () => Math.round(sb.getBoundingClientRect().width);
  const apply = (px, save) => {
    px = Math.round(clamp(px, min, max));
    host.style.setProperty('--o-sidebar-w', px + 'px');
    r.setAttribute('aria-valuenow', px);
    if (save) ls.set(key, px);
    emit(sb, 'o-sidebar-resize', { width: px });
  };
  const saved = +ls.get(key, 0);
  if (saved) apply(saved); else r.setAttribute('aria-valuenow', width());
  let drag = null;
  const offs = [
    on(r, 'pointerdown', e => {
      if (e.button !== 0 || O.sidebar.isMini(sb)) return;
      e.preventDefault();
      r.setPointerCapture?.(e.pointerId);
      drag = { x: e.clientX, w: width(), dir: isRTL(sb) !== !!sb.closest('.o-app-sidebar-end') ? -1 : 1 };
      host.classList.add('is-resizing');
    }),
    on(r, 'pointermove', e => { if (drag) apply(drag.w + (e.clientX - drag.x) * drag.dir); }),
    on(r, 'pointerup pointercancel lostpointercapture', () => {
      if (!drag) return;
      drag = null; host.classList.remove('is-resizing');
      ls.set(key, width());
    }),
    on(r, 'dblclick', () => { host.style.removeProperty('--o-sidebar-w'); ls.del(key); r.setAttribute('aria-valuenow', width()); }),
    on(r, 'keydown', e => {
      const rtl = isRTL(sb), step = e.shiftKey ? 48 : 16, w = width();
      const map = { ArrowRight: rtl ? -step : step, ArrowLeft: rtl ? step : -step };
      if (e.key in map) apply(w + map[e.key] * (sb.closest('.o-app-sidebar-end') ? -1 : 1), true);
      else if (e.key === 'Home') apply(min, true);
      else if (e.key === 'End') apply(max, true);
      else return;
      e.preventDefault();
    }),
  ];
  return () => { offs.forEach(f => f()); if (created) r.remove(); };
};
