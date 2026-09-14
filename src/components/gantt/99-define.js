/* ── registration + factory ───────────────────────────────────────────── */
// Methods called before the element is connected (e.g. right after createElement) are safe no-ops,
// except setView which just sets the property.
for (const name of ['addTask', 'updateTask', 'removeTask', 'addLink', 'removeLink', 'indent', 'outdent', 'schedule', 'select', 'expand', 'collapse', 'toggle',
  'expandAll', 'collapseAll', 'scrollToTask', 'zoomIn', 'zoomOut', 'scrollToToday', 'scrollToDate', 'undo', 'redo', 'refresh', 'exportPNG', 'exportPDF', 'exportJSON', 'toCanvas', 'setView']) {
  const fn = OGantt.prototype[name];
  OGantt.prototype[name] = function (...args) {
    if (this._tree && this._layoutDone) return fn.apply(this, args);
    if (name === 'setView' && G_VIEW_DW[args[0]]) this.view = args[0];
    return name.startsWith('export') ? Promise.resolve(null) : null;
  };
}
define('o-gantt', OGantt);
O.Gantt = OGantt;

/**
 * Orion.gantt(target, config) -> <o-gantt>
 *   Orion.gantt('#plan', { tasks, view: 'week', criticalPath: true })
 * The engine helpers stay available on the same function: Orion.gantt.schedule(), .criticalPath(), .calendar() …
 */
const __gEngine = O.gantt;
O.gantt = Object.assign(function gantt(target, config = {}) {
  let el = $(target);
  if (!el) throw new Error('[Orion] gantt: target not found');
  if (el.localName !== 'o-gantt') { const g = doc.createElement('o-gantt'); el.append(g); el = g; }
  Object.assign(el, config);
  return el;
}, __gEngine);
