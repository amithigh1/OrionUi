/* gantt-zoom-today.js — populated data (45 tasks, 5 nested groups, dependencies, milestones),
 * fixed 2026 dates. Proves the four documented zoom presets (day/week/month/quarter) change the
 * rendered header column count and tick unit, and that the today marker is present and positioned
 * inside the canvas when todayLine is enabled and the visible range brackets the real current date.
 *   node build/check.mjs docs/components/gantt.html --bundle=.tmp/gantt/orion.js "--eval=@.tmp/evals/gantt-zoom-today.js"
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
  const now = new Date();
  g.start = iso(addDays(now, -30));
  g.end = iso(addDays(now, 30));
  g.tasks = buildTasks();
  g.todayLine = true;
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await frame();

  const cellsFor = () => [...g.querySelectorAll('.o-gantt-tier.is-bottom .o-gantt-tcell > span')].map(s => s.textContent.trim());

  const views = ['day', 'week', 'month', 'quarter'];
  const byView = {};
  for (const v of views) {
    g.setView(v);
    await frame();
    byView[v] = cellsFor();
  }

  const counts = Object.fromEntries(views.map(v => [v, byView[v].length]));
  const countsDiffer = new Set(views.map(v => counts[v])).size > 1;
  // the quarter view's bottom-tier ticks must actually read as quarters ("Q1".."Q4"), proving the axis
  // unit itself changed (not just the pixel scale of daily ticks)
  const quarterLabelsLookRight = byView.quarter.length > 0 && byView.quarter.every(t => /^Q[1-4]$/.test(t));
  // the day view's ticks are dense, single-day cells: strictly more of them than the quarter view's
  const dayHasMoreThanQuarter = counts.day > counts.quarter;

  const todayEl = g.querySelector('.o-gantt-today');
  const todayVisible = !!todayEl && !todayEl.hidden;
  const totalW = parseFloat(g.querySelector('.o-gantt-canvas').style.width);
  const todayX = todayVisible ? parseFloat(todayEl.style.insetInlineStart) : null;
  const todayInBounds = todayVisible && todayX >= 0 && todayX <= totalW;

  const ok = countsDiffer && quarterLabelsLookRight && dayHasMoreThanQuarter && todayVisible && todayInBounds;
  return {
    ok, counts, countsDiffer, quarterLabelsLookRight, dayHasMoreThanQuarter,
    quarterSample: byView.quarter.slice(0, 4), daySample: byView.day.slice(0, 4),
    todayVisible, todayX, totalW, todayInBounds,
  };
})()
