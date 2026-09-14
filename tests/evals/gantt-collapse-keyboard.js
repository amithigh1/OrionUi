/* gantt-collapse-keyboard.js — populated data (45 tasks, 5 nested groups, dependencies,
 * milestones), fixed 2026 dates. Proves group collapse/expand (hides/shows the child rows) and
 * keyboard navigation between tasks (ArrowDown/Up in the treegrid moves the active row and
 * selection; Home/End jump to the first/last row).
 *   node build/check.mjs docs/components/gantt.html --bundle=.tmp/gantt/orion.js "--eval=@.tmp/evals/gantt-collapse-keyboard.js"
 */
(async () => {
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

  function buildTasks() {
    const tasks = [];
    for (let g = 1; g <= 5; g++) {
      const gid = 'g' + g;
      tasks.push({ id: gid, name: 'Workstream ' + g, type: 'project' });
      const base = new Date(2026, 1, g);
      const kickoff = gid + '-k';
      tasks.push({ id: kickoff, parent: gid, name: 'Kickoff ' + g, type: 'milestone', start: iso(base) });
      let prev = kickoff, cursor = addDays(base, 2);
      const childIds = [];
      for (let i = 1; i <= 6; i++) {
        const id = gid + '-t' + i, dur = 3 + (i % 3);
        const dep = i === 3 ? { id: prev, type: 'SS', lag: 1 } : i === 5 ? { id: prev, type: 'FF' } : i === 2 ? { id: prev, type: 'SF' } : prev;
        tasks.push({ id, parent: gid, name: `Task ${g}.${i}`, start: iso(cursor), duration: dur, assignees: ['User ' + (((g + i) % 6) + 1)], dependencies: [dep] });
        childIds.push(id);
        prev = id;
        cursor = addDays(cursor, dur + 3);
      }
      tasks.push({ id: gid + '-end', parent: gid, name: 'Milestone ' + g, type: 'milestone', start: iso(cursor), dependencies: [childIds[4], childIds[5]] });
    }
    return tasks;
  }

  const g = document.getElementById('plan');
  if (!g) return { ok: false, error: 'no #plan element on page' };
  g.tasks = buildTasks();
  g.view = 'week';
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await frame();

  // --- collapse / expand ---
  const rowsExpanded = g.getTasks().length; // rows shown in the tree grid before collapsing (== task count, nothing collapsed)
  const collapseEvents = [];
  g.addEventListener('o-collapse', e => collapseEvents.push(e.detail.id));
  g.addEventListener('o-expand', e => collapseEvents.push('expand:' + e.detail.id));
  g.collapse('g2');
  await frame();
  const rowsAfterCollapse = g.querySelectorAll('.o-gantt-row').length; // rendered rows (small, but reflects visible row count via aria-rowcount too)
  const gridEl = g.querySelector('.o-gantt-grid');
  const ariaRowCountCollapsed = +gridEl.getAttribute('aria-rowcount');
  g.expand('g2');
  await frame();
  const ariaRowCountExpanded = +gridEl.getAttribute('aria-rowcount');
  const collapseHidRows = ariaRowCountCollapsed < ariaRowCountExpanded;
  const collapseEventsOk = collapseEvents.includes('g2') && collapseEvents.includes('expand:g2');

  // --- keyboard navigation (treegrid) ---
  gridEl.focus();
  await frame();
  gridEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
  await frame();
  const selAtHome = g.getSelected();

  const selectSeq = [selAtHome ? selAtHome.id : null];
  const selectEvents = [];
  const onSelect = e => selectEvents.push(e.detail.id);
  g.addEventListener('o-select', onSelect);
  for (let i = 0; i < 3; i++) {
    gridEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await frame();
    selectSeq.push(g.getSelected() ? g.getSelected().id : null);
  }
  g.removeEventListener('o-select', onSelect);
  g.removeEventListener('o-collapse', () => {});

  gridEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', ctrlKey: true, bubbles: true, cancelable: true }));
  await frame();
  const selAtEnd = g.getSelected();
  const allTasks = g.getTasks();

  const movedThroughDistinctRows = new Set(selectSeq).size === selectSeq.length; // each ArrowDown selected a different row
  const startedAtFirstRow = selAtHome && selAtHome.id === allTasks[0].id;
  const endedAtLastRow = selAtEnd && selAtEnd.id === allTasks[allTasks.length - 1].id;
  const selectEventsFired = selectEvents.length >= 3;

  const ok = rowsExpanded >= 40 && collapseHidRows && collapseEventsOk
    && startedAtFirstRow && movedThroughDistinctRows && selectEventsFired && endedAtLastRow;
  return {
    ok, rowsExpanded, ariaRowCountCollapsed, ariaRowCountExpanded, collapseHidRows, collapseEventsOk,
    selectSeq, movedThroughDistinctRows, startedAtFirstRow, endedAtLastRow, selectEventsFired,
    firstTaskId: allTasks[0].id, lastTaskId: allTasks[allTasks.length - 1].id,
  };
})()
