/* ============================================================================
 * <o-timeline-view> — interactive time axis with items (ranges, points, backgrounds)
 * in optional (nested, collapsible) group lanes: adaptive localized axis (minutes → years),
 * zoom (wheel / pinch / buttons), pan with inertia, automatic stacking, clustering of
 * dense points, current-time line, selection, drag move/resize with snapping, range selection.
 *
 * Files (one function scope):
 *   00-i18n   strings
 *   10-scale  steps, ticks, labels, snapping
 *   20-model  item / group normalisation, stacking, clustering
 *   30-element  <o-timeline-view>: props, layout, rendering, public API
 *   40-interact pointer (pan, pinch, wheel, drag, range select) + keyboard
 *   99-define   registration
 * ========================================================================== */
i18n.add('en', {
  timelineView: {
    label: 'Timeline', toolbar: 'Timeline tools', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit all', now: 'Now',
    groups: 'Groups', other: 'Other', items: 'Items', expand: 'Expand {name}', collapse: 'Collapse {name}',
    cluster: { one: '{count} event', other: '{count} events' }, clusterLabel: '{count} events from {start} to {end}. Press Enter to zoom in.',
    quarter: 'Q{n}', range: '{start} – {end}', point: '{content}, {time}', rangeItem: '{content}, {start} to {end}',
    selected: { one: '{count} item selected', other: '{count} items selected' }, cleared: 'Selection cleared',
    moved: '{content}: {start}', resized: '{content}: {start} to {end}', removed: '{content} removed',
    rangeSelected: 'Selected {start} to {end}', noItems: 'Nothing to show in this range',
    keyboard: 'Arrow keys move between items or pan, plus and minus zoom, 0 fits everything, Enter selects, Alt+Arrow moves an item.',
  },
});
