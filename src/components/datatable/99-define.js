/* ── assemble <o-datatable> from the feature mixins and register it ── */
for (const m of [DT_PIPE, DT_SERVER, DT_LAYOUT, DT_BODY, DT_EVENTS, DT_KEYS, DT_PANELS, DT_TOOLBAR, DT_EDIT, DT_IO, DT_STATE]) {
  Object.defineProperties(ODataTable.prototype, Object.getOwnPropertyDescriptors(m));
}
// API calls made before the element initialised (e.g. right after document.createElement) are deferred, not lost.
for (const name of ['addRow', 'updateRow', 'removeRow', 'select', 'selectAll', 'toggleExpand', 'expandAll', 'collapseAll', 'toggleNode', 'scrollToRow', 'editCell', 'editRow', 'autofitColumn', 'moveColumn', 'setColumnVisible', 'setColumnWidth', 'applyView', 'resetColumns']) {
  const fn = ODataTable.prototype[name];
  ODataTable.prototype[name] = function (...a) { return this._inited ? fn.apply(this, a) : this._whenReady(() => fn.apply(this, a)); };
}
/** Pluggable export formats: Orion.DataTable.exporters.xlsx = async (data, opts) => { ... } */
ODataTable.exporters = {};
/** CSV helpers used by export / import. */
ODataTable.csv = { parse: csvParse, stringify: csvStringify };
define('o-datatable', ODataTable);
O.DataTable = ODataTable;

/** Orion.datatable(target, config) — create (or configure) an <o-datatable> inside target. */
O.datatable = function (target, config = {}) {
  const host = isStr(target) ? $(target) : target;
  if (!host) return null;
  let dt = host.localName === 'o-datatable' ? host : null;
  if (!dt) { dt = doc.createElement('o-datatable'); host.append(dt); }
  Object.assign(dt, config);
  return dt;
};
