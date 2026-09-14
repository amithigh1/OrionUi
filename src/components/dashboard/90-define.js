/* Registration, declarative actions and the Orion.dashboard() factory. */

define('o-dashboard', ODashboard);

/* <button data-o-action="dashboard" data-o-value="edit|catalog|reset|save|compact" data-o-target="#dash"> */
action('dashboard', (el, e, target) => {
  const d = target && target.localName === 'o-dashboard' ? target : el.closest('o-dashboard');
  if (!d || !d.toggleEdit) return;
  const v = el.getAttribute('data-o-value') || 'edit';
  if (v === 'edit') d.toggleEdit();
  else if (v === 'catalog') { if (d.catalogOpen) d.closeCatalog(); else d.openCatalog(el); }
  else if (v === 'reset') d.reset();
  else if (v === 'save') d.save();
  else if (v === 'compact') d.compactLayout();
});

/**
 * Orion.dashboard(el, options) -> <o-dashboard>
 *   el: an <o-dashboard> or a container (a new <o-dashboard> is appended to it)
 *   options: any prop (columns, rowHeight, gap, editable, persist, breakpoints, layout, catalog, ...) plus
 *            on: { 'layout-change': fn, 'widget-add': fn, ... }  (o- prefix optional)
 */
O.dashboard = function (el, options = {}) {
  let host = $(el);
  if (!host) return null;
  if (host.localName !== 'o-dashboard') { const d = doc.createElement('o-dashboard'); host.append(d); host = d; }
  for (const [k, v] of Object.entries(options)) {
    if (k === 'on' && isObj(v)) { for (const [ev, fn] of Object.entries(v)) host.addEventListener(ev.startsWith('o-') ? ev : 'o-' + ev, fn); }
    else host[k] = v;
  }
  return host;
};
