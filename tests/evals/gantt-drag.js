/* gantt-drag.js — populated data (45 tasks, 5 nested groups, dependencies, milestones), fixed 2026
 * dates. Drives real pointer events (pointerdown/pointermove/pointerup) to drag-move a task and
 * drag-resize its end handle, then asserts the task's new start/end and the o-task-change event
 * detail (the same event used by the docs demo's "refuse a past move" pattern).
 *   node build/check.mjs docs/components/gantt.html --bundle=.tmp/gantt/orion.js "--eval=@.tmp/evals/gantt-drag.js"
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
    // an isolated task (no deps, far from everything else) so drag deltas are unambiguous
    tasks.push({ id: 'drag1', name: 'Drag target', start: '2026-06-01', duration: 5 });
    return tasks;
  }

  const g = document.getElementById('plan');
  if (!g) return { ok: false, error: 'no #plan element on page' };
  g.tasks = buildTasks();
  g.view = 'day';
  g.readonly = false;
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await frame();

  const canvas = g.querySelector('.o-gantt-canvas');
  // o-task-change detail is { task, changes, previous, affected, revert() } (no `reason`); o-change is
  // the separate { reason, ids } event fired for every commit. Track both and correlate by order.
  const taskChanges = [], changes = [];
  const onTaskChange = e => taskChanges.push({ id: e.detail.task.id, start: e.detail.task.start, end: e.detail.task.end, changedKeys: Object.keys(e.detail.changes) });
  const onChange = e => changes.push({ reason: e.detail.reason, ids: e.detail.ids.slice() });
  g.addEventListener('o-task-change', onTaskChange);
  g.addEventListener('o-change', onChange);

  const dispatchDrag = (startEl, dxPx) => {
    const r = startEl.getBoundingClientRect();
    const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    startEl.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: x0, clientY: y0, bubbles: true, cancelable: true }));
    // cross the 4px "drag started" threshold, then move to the target delta
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: x0 + 10, clientY: y0, bubbles: true, cancelable: true }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: x0 + dxPx, clientY: y0, bubbles: true, cancelable: true }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: x0 + dxPx, clientY: y0, bubbles: true, cancelable: true }));
  };

  // --- drag-to-move ---
  g.scrollToTask('drag1', { select: false });
  await frame();
  const before1 = g.getTask('drag1');
  const bar1 = g.querySelector('.o-gantt-bar[data-k="drag1"]');
  if (!bar1) return { ok: false, error: 'drag1 bar not rendered' };
  dispatchDrag(bar1, 3 * 40); // view=day, 40px/day -> +3 days
  await frame();
  const after1 = g.getTask('drag1');
  const moveDeltaDays = Math.round((new Date(after1.start) - new Date(before1.start)) / 864e5);
  const durationKeptOnMove = after1.duration === before1.duration;
  const moveTaskChange = taskChanges.find(e => e.id === 'drag1');
  const moveChange = changes.find(e => e.reason === 'move' && e.ids.includes('drag1'));

  // --- drag-to-resize (end handle) ---
  taskChanges.length = 0; changes.length = 0;
  const before2 = g.getTask('drag1');
  const bar2 = g.querySelector('.o-gantt-bar[data-k="drag1"]');
  const handle = bar2.querySelector('.o-gantt-handle.is-end');
  if (!handle) return { ok: false, error: 'no end-resize handle' };
  dispatchDrag(handle, 2 * 40); // +2 days longer
  await frame();
  const after2 = g.getTask('drag1');
  const startUnchangedOnResize = after2.start === before2.start;
  const durationGrew = after2.duration === before2.duration + 2;
  const resizeTaskChange = taskChanges.find(e => e.id === 'drag1');
  const resizeChange = changes.find(e => e.reason === 'resize' && e.ids.includes('drag1'));

  g.removeEventListener('o-task-change', onTaskChange);
  g.removeEventListener('o-change', onChange);

  const ok = moveDeltaDays === 3 && durationKeptOnMove
    && !!moveTaskChange && moveTaskChange.start === after1.start && moveTaskChange.changedKeys.includes('start') && !!moveChange
    && startUnchangedOnResize && durationGrew
    && !!resizeTaskChange && resizeTaskChange.end === after2.end && resizeTaskChange.changedKeys.includes('end') && !!resizeChange;
  return {
    ok, taskCount: g.getTasks().length,
    move: { before: before1.start, after: after1.start, deltaDays: moveDeltaDays, durationKeptOnMove, taskChange: moveTaskChange, changeEvent: moveChange },
    resize: { before: `${before2.start}..${before2.end}`, after: `${after2.start}..${after2.end}`, startUnchangedOnResize, durationGrew, taskChange: resizeTaskChange, changeEvent: resizeChange },
  };
})()
