/* ── registration + factory ────────────────────────────────────────────── */
// Methods called before the element is connected/laid out are safe no-ops (mirrors <o-gantt>).
for (const name of ['setItems', 'getItems', 'setGroups', 'getGroups', 'addItem', 'updateItem', 'removeItem', 'getItem',
  'setSelection', 'getSelection', 'setWindow', 'fit', 'moveTo', 'zoom', 'zoomIn', 'zoomOut', 'refresh',
  'expandGroup', 'collapseGroup', 'toggleGroup']) {
  const fn = OTimelineView.prototype[name];
  OTimelineView.prototype[name] = function (...args) {
    if (this._layoutDone) return fn.apply(this, args);
    if (name === 'setItems') { this.items = args[0]; return; }
    if (name === 'setGroups') { this.groups = args[0]; return; }
    if (name.startsWith('get')) return name === 'getSelection' ? [] : [];
    return null;
  };
}
define('o-timeline-view', OTimelineView);
O.TimelineView = OTimelineView;

/**
 * Orion.timelineView(target, config) -> <o-timeline-view>
 *   Orion.timelineView('#panel', { items, groups, editable: true })
 */
O.timelineView = function timelineView(target, config = {}) {
  let el = $(target);
  if (!el) throw new Error('[Orion] timelineView: target not found');
  if (el.localName !== 'o-timeline-view') { const t = doc.createElement('o-timeline-view'); el.append(t); el = t; }
  Object.assign(el, config);
  return el;
};
