/* gantt-dependencies.js — populated data (45 tasks, 5 nested groups, mixed FS/SS/SF/FF
 * dependencies, milestones), fixed 2026 dates. Proves dependency arrows are drawn, and that
 * moving a predecessor (via the real Alt+Arrow keyboard move — a genuine user flow) redraws the
 * link and auto-schedule pushes the dependent successor, with the o-task-change event listing it
 * in `affected`.
 *   node build/check.mjs docs/components/gantt.html --bundle=.tmp/gantt/orion.js "--eval=@.tmp/evals/gantt-dependencies.js"
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
  const tasks = buildTasks();
  g.tasks = tasks;
  g.view = 'day';
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await frame();

  // g1-t1 depends on g1-k via plain FS (see buildTasks: i=1 falls through to the default dep = prev = kickoff)
  const t1Before = g.getTask('g1-t1');
  const kBefore = g.getTask('g1-k');
  if (!t1Before.dependencies.some(d => d.id === 'g1-k' && d.type === 'FS')) return { ok: false, error: 'expected g1-t1 -> FS -> g1-k', deps: t1Before.dependencies };

  g.scrollToTask('g1-k', { select: true });
  await frame();

  const linksBefore = [...g.querySelectorAll('.o-gantt-link-line')];
  if (!linksBefore.length) return { ok: false, error: 'no dependency links rendered' };
  const linkEl = g.querySelector('.o-gantt-link-line'); // some link in the visible window (g1-k -> g1-t1 among them)
  const dBefore = linkEl.getAttribute('d');

  let changeDetail = null;
  const onChange = e => { changeDetail = e.detail; };
  g.addEventListener('o-task-change', onChange);

  const chartEl = g.querySelector('.o-gantt-chart');
  g.select('g1-k'); // sets the internal selection used by Alt+Arrow, without emitting o-select
  for (let i = 0; i < 5; i++) {
    chartEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }));
  }
  await frame();
  g.removeEventListener('o-task-change', onChange);

  const t1After = g.getTask('g1-t1');
  const kAfter = g.getTask('g1-k');
  const kickoffMovedForward = new Date(kAfter.start) > new Date(kBefore.start);
  const t1PushedForward = new Date(t1After.start) > new Date(t1Before.start);
  const fsHolds = new Date(t1After.start) >= new Date(kAfter.start); // FS: successor must start on/after the (milestone) predecessor's date

  const linkElAfter = g.querySelector('.o-gantt-link-line');
  const dAfter = linkElAfter ? linkElAfter.getAttribute('d') : null;
  const linkRedrawn = dAfter != null && dAfter !== dBefore;

  const eventOk = !!changeDetail && changeDetail.task && changeDetail.task.id === 'g1-k'
    && Array.isArray(changeDetail.affected) && changeDetail.affected.some(a => a.task.id === 'g1-t1');

  const ok = linksBefore.length > 0 && kickoffMovedForward && t1PushedForward && fsHolds && linkRedrawn && eventOk && tasks.length >= 40;
  return {
    ok, taskCount: tasks.length, linkCountBefore: linksBefore.length,
    kickoffBefore: kBefore.start, kickoffAfter: kAfter.start,
    t1Before: t1Before.start, t1After: t1After.start,
    kickoffMovedForward, t1PushedForward, fsHolds,
    dBefore, dAfter, linkRedrawn,
    eventOk, affectedIds: changeDetail ? changeDetail.affected.map(a => a.task.id) : null,
  };
})()
