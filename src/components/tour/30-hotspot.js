/* <button data-o-hotspot="Click here to add a new report" data-o-hotspot-id="reports-fab" data-o-hotspot-placement="top">
 * A pulsing beacon anchored to any element; clicking (or focusing) it opens a small popover with the tip
 * text and permanently remembers dismissal (localStorage) so it never reappears once seen. Uses
 * Orion.popover when the `overlays` package is present, otherwise a minimal floating panel built directly
 * on core `place()`/`portal()`/`overlays`.
 *   data-o-hotspot="text"              tip text (plain text)
 *   data-o-hotspot-id="key"            explicit dismissal key (defaults to a hash of the text + position)
 *   data-o-hotspot-placement="top"     popover placement (default "top")
 */
i18n.add('en', { tour: { hotspotLabel: 'Tip available' } });

const HOTSPOT_KEY = 'orion:tour:hotspots-dismissed';
function hotspotDismissed(key) { return toArr(ls.get(HOTSPOT_KEY, [])).includes(key); }
function hotspotDismiss(key) { const list = toArr(ls.get(HOTSPOT_KEY, [])); if (!list.includes(key)) { list.push(key); ls.set(HOTSPOT_KEY, list); } }

/** Minimal floating panel used when Orion.popover is not part of the build. */
function hotspotPanel(trigger, text, placement, onClose) {
  const panel = h('div', { class: 'o-floating o-hotspot-panel', role: 'dialog', tabindex: '-1' }, h('p', { class: 'o-hotspot-text' }, text));
  portal(panel, trigger);
  panel.hidden = false;
  const unplace = autoPlace(panel, trigger, { placement, offset: 10, flip: true });
  const ov = overlays.open({ el: panel, owner: trigger, trap: false, onClose: reason => { unplace(); panel.remove(); onClose?.(reason); } });
  animate(panel, 'zoomIn', { duration: 120 });
  focusFirst(panel);
  return { close: () => ov.close('api'), el: panel };
}

behavior('data-o-hotspot', (el, text) => {
  const key = el.getAttribute('data-o-hotspot-id') || ('t:' + text);
  if (hotspotDismissed(key)) return;
  const placement = el.getAttribute('data-o-hotspot-placement') || 'top';
  el.classList.add('o-hotspot-anchor');
  const beacon = h('span', { class: 'o-hotspot-beacon', tabindex: '0', role: 'button', 'aria-label': t('tour.hotspotLabel') });
  el.appendChild(beacon);
  let open = null, removed = false;
  const remove = () => { if (removed) return; removed = true; beacon.remove(); el.classList.remove('o-hotspot-anchor'); };
  const show = () => {
    if (open) return;
    hotspotDismiss(key); // remembered as soon as it is opened, whichever way it later closes
    beacon.classList.add('is-open');
    const onClosed = () => { open = null; remove(); };
    open = O.popover ? O.popover(beacon, { content: text, trigger: 'manual', placement, onClose: onClosed }) : hotspotPanel(beacon, text, placement, onClosed);
    if (O.popover) open.open();
  };
  const offClick = on(beacon, 'click', e => { e.stopPropagation(); show(); });
  const offKey = on(beacon, 'keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } });
  return () => { offClick(); offKey(); open?.close?.(); remove(); };
});
