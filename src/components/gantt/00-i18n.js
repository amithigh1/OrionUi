/* ============================================================================
 * <o-gantt> — project Gantt chart: split task tree-grid + virtualized timeline,
 * drag-and-drop scheduling, dependencies (FS/SS/FF/SF + lag), auto-scheduling,
 * critical path, baselines, working-day calendar, undo/redo, PNG/PDF/JSON export.
 *
 * Files (one function scope, concatenated in order):
 *   00-i18n      strings
 *   10-calendar  day numbers + working-day calendar
 *   20-engine    task normalisation, tree, roll-up, scheduling, critical path (O.gantt.*)
 *   30-scale     zoom presets, header tiers, date <-> x
 *   35-routes    orthogonal dependency-arrow routing
 *   40-element   <o-gantt> element: props, model, history, public API
 *   50-grid      task tree-grid (treegrid) + inline editing
 *   60-chart     timeline rendering (virtualized rows + time axis)
 *   70-drag      pointer interactions (move / resize / progress / link / pan)
 *   75-keys      keyboard
 *   80-tooltip   task hover card + toolbar menus
 *   85-export    PNG / PDF / JSON export
 *   99-define    registration
 * ========================================================================== */

i18n.add('en', {
  gantt: {
    label: 'Gantt chart', taskList: 'Task list', timeline: 'Timeline', toolbar: 'Gantt tools',
    name: 'Task name', start: 'Start', end: 'End', duration: 'Duration', progress: 'Progress', assignee: 'Assignee',
    days: { one: '{count} day', other: '{count} days' }, dayShort: '{count}d',
    task: 'Task', milestone: 'Milestone', summary: 'Summary', newTask: 'New task', newMilestone: 'New milestone',
    addTask: 'Add task', addMilestone: 'Add milestone', indent: 'Indent', outdent: 'Outdent', remove: 'Delete task',
    undo: 'Undo', redo: 'Redo', zoomIn: 'Zoom in', zoomOut: 'Zoom out', today: 'Today', scrollToToday: 'Scroll to today',
    view: 'View', views: { day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year' },
    export: 'Export', exportPNG: 'Image (PNG)', exportPDF: 'PDF document', exportJSON: 'Data (JSON)',
    toggleGrid: 'Show or hide the task list', expandAll: 'Expand all', collapseAll: 'Collapse all',
    critical: 'Critical', criticalPath: 'Critical path', slack: 'Slack', baseline: 'Baseline', variance: 'Variance',
    late: '{count} days late', early: '{count} days early', onTime: 'On baseline',
    dependencies: 'Dependencies', predecessors: 'Predecessors', lag: 'Lag',
    linkTypes: { FS: 'Finish to start', SS: 'Start to start', FF: 'Finish to finish', SF: 'Start to finish' },
    linkCreated: 'Dependency created: {from} to {to}', linkDeleted: 'Dependency deleted: {from} to {to}',
    linkCycle: 'That dependency would create a loop', linkInvalid: 'A task cannot depend on its own group',
    moved: '{name}: {start} to {end}', progressSet: '{name}: {progress} complete', edited: '{name} updated',
    deleted: '{name} deleted. Press Ctrl+Z to undo.', added: '{name} added', indented: '{name} indented', outdented: '{name} outdented',
    pushed: { one: '{count} dependent task rescheduled', other: '{count} dependent tasks rescheduled' },
    undone: 'Undone', redone: 'Redone', expanded: 'Expanded', collapsed: 'Collapsed',
    holiday: 'Holiday', nonWorking: 'Non-working day', week: 'Week {n}', quarter: 'Q{n}',
    rowCount: { one: '{count} task', other: '{count} tasks' }, noTasks: 'No tasks yet',
    rowLabel: '{name}, {start} to {end}, {progress} complete', milestoneLabel: '{name}, milestone on {start}',
    edit: 'Edit {column}', dragHint: 'Drag to move · edges to resize · dot to link',
    keyboard: 'Arrow keys move between tasks. Alt+Arrow moves a task, Alt+Shift+Arrow changes its length, Enter edits, Tab indents, Delete removes.',
    splitter: 'Resize task list', exporting: 'Preparing export…', pdfFallback: 'Use “Save as PDF” in the print dialog.',
  },
});
