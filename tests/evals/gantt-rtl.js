/* gantt-rtl.js — populated data (45 tasks, 5 nested groups, dependencies, milestones), fixed 2026
 * dates. Proves RTL mirroring: bars flow right-to-left (an earlier task renders to the *right* of
 * a later one, since inset-inline-start counts from the trailing/right edge under dir=rtl), the
 * task-list column order mirrors, and the dependency-link SVG is flipped. Run with --rtl so
 * <html dir="rtl"> is set before scripts run:
 *   node build/check.mjs docs/components/gantt.html --bundle=.tmp/gantt/orion.js --rtl "--eval=@.tmp/evals/gantt-rtl.js"
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
    tasks.push({ id: 'anchorA', name: 'Anchor A', start: '2026-01-05', duration: 1 });
    tasks.push({ id: 'anchorB', name: 'Anchor B', start: '2026-01-20', duration: 1 });
    return tasks;
  }

  if (document.documentElement.getAttribute('dir') !== 'rtl') return { ok: false, error: 'page was not loaded with --rtl' };

  const g = document.getElementById('plan');
  if (!g) return { ok: false, error: 'no #plan element on page' };
  g.tasks = buildTasks();
  g.view = 'day';
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await frame();

  // bars: the earlier task (Jan 5) must render to the RIGHT of the later one (Jan 20) on screen.
  // Measure each bar's position relative to the (scrolling) canvas itself, not the fixed chart
  // viewport, so the two measurements are comparable regardless of which scroll position each
  // scrollToTask() call lands on.
  const logicalFromCanvas = k => {
    const bar = g.querySelector(`.o-gantt-bar[data-k="${k}"]`);
    const canvasRect = g.querySelector('.o-gantt-canvas').getBoundingClientRect();
    return bar ? canvasRect.right - bar.getBoundingClientRect().right : null; // distance from the RTL start (right) edge
  };
  g.scrollToTask('anchorA', { select: false });
  await frame();
  const logicalA = logicalFromCanvas('anchorA');
  g.scrollToTask('anchorB', { select: false });
  await frame();
  const logicalB = logicalFromCanvas('anchorB');
  if (logicalA == null || logicalB == null) return { ok: false, error: 'anchor bars not rendered' };
  // anchorB (15 days later) must sit further from the right (start) edge than anchorA
  const barsFlowRTL = logicalB > logicalA;

  // task list: in RTL the tree/name column moves to the visual right of the grid, chart to the left
  const body = g.querySelector('.o-gantt-body');
  const gridRect = g.querySelector('.o-gantt-grid').getBoundingClientRect();
  const chartRect = g.querySelector('.o-gantt-chart').getBoundingClientRect();
  const gridOnRight = gridRect.left > chartRect.left;

  // dependency links: scroll to a dependency-dense area first (the anchors above have none), then
  // check the SVG layer is mirrored via CSS (.o-gantt-links:dir(rtl){transform:scaleX(-1)})
  g.scrollToTask('g1-k', { select: false });
  await frame();
  const svg = g.querySelector('.o-gantt-links');
  const svgTransform = getComputedStyle(svg).transform;
  // a horizontal-flip matrix has a negative a (first) component: matrix(-1, 0, 0, 1, tx, ty)
  const m = svgTransform.match(/matrix\(([^)]+)\)/);
  const svgFlipped = !!m && parseFloat(m[1].split(',')[0]) < 0;

  const linkCount = g.querySelectorAll('.o-gantt-link-line').length;

  const ok = barsFlowRTL && gridOnRight && svgFlipped && linkCount > 0;
  return { ok, logicalA, logicalB, barsFlowRTL, gridOnRight, svgTransform, svgFlipped, linkCount, taskCount: g.getTasks().length };
})()
