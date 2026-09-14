/* gantt-bars-scale.js — populated data (49 tasks: 5 nested groups x milestone+6 tasks+milestone,
 * plus 3 standalone anchors), every task/milestone given an EXPLICIT fixed start date (2026,
 * not Date.now()) so this file tests pixel geometry only, independent of auto-scheduling (that is
 * covered separately by gantt-dependencies.js). Proves bar pixel positions and widths match the
 * axis's own rendered scale, for an explicit known date range (g.start/g.end), within +/-1px.
 *   node build/check.mjs docs/components/gantt.html --bundle=.tmp/gantt/orion.js "--eval=@.tmp/evals/gantt-bars-scale.js"
 */
(async () => {
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; // local-time ISO (toISOString() would shift by a day off UTC)
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

  function buildTasks() {
    const tasks = [];
    for (let g = 1; g <= 5; g++) {
      const gid = 'g' + g;
      tasks.push({ id: gid, name: 'Workstream ' + g, type: 'project' });
      const base = new Date(2026, 1, g); // Feb g, 2026 (fixed, distinct per group)
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
    // standalone, dependency-free anchors on known weekdays (Mon/Tue) so their calendar span never crosses a weekend
    tasks.push({ id: 'anchorA', name: 'Anchor A', start: '2026-01-05', duration: 1 });   // Monday
    tasks.push({ id: 'anchorB', name: 'Anchor B', start: '2026-01-20', duration: 1 });   // Tuesday, 15 days later
    tasks.push({ id: 'anchorC', name: 'Anchor C', start: '2026-01-05', duration: 4 });   // Mon-Thu, no weekend
    return tasks;
  }

  const g = document.getElementById('plan');
  if (!g) return { ok: false, error: 'no #plan element on page' };
  const tasks = buildTasks();
  g.start = '2026-01-01';
  g.end = '2026-04-30';
  g.tasks = tasks;
  g.view = 'day';
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await frame();

  const chartEl = g.querySelector('.o-gantt-chart');
  const canvas = g.querySelector('.o-gantt-canvas');

  // "the computed scale": measured directly from a rendered day header cell, not a private constant.
  const dayCell = g.querySelector('.o-gantt-tier.is-bottom .o-gantt-tcell');
  if (!dayCell) return { ok: false, error: 'no rendered day header cell' };
  const pxPerDay = dayCell.getBoundingClientRect().width;

  const logicalX = el => { const r = el.getBoundingClientRect(), cr = chartEl.getBoundingClientRect(); return r.left - cr.left + chartEl.scrollLeft; };

  g.scrollToTask('anchorA', { select: false });
  await frame();
  const barA = g.querySelector('.o-gantt-bar[data-k="anchorA"]');
  if (!barA) return { ok: false, error: 'anchorA bar not rendered' };
  const xA = logicalX(barA);

  g.scrollToTask('anchorB', { select: false });
  await frame();
  const barB = g.querySelector('.o-gantt-bar[data-k="anchorB"]');
  if (!barB) return { ok: false, error: 'anchorB bar not rendered' };
  const xB = logicalX(barB);

  const expectedDelta = 15 * pxPerDay; // Jan 5 -> Jan 20, both weekdays
  const actualDelta = xB - xA;
  const deltaOk = Math.abs(actualDelta - expectedDelta) <= 1;

  // bar width for a task of known duration that never crosses a weekend (anchorC: Mon-Thu, 4 days)
  g.scrollToTask('anchorC', { select: false });
  await frame();
  const barC = g.querySelector('.o-gantt-bar[data-k="anchorC"]');
  const widthC = barC ? barC.getBoundingClientRect().width : -1;
  const expectedWidthC = 4 * pxPerDay;
  const widthOk = !!barC && Math.abs(widthC - expectedWidthC) <= 1;

  // the explicit known date range (g.start/g.end) must be fully covered by the rendered scale
  const totalDaysMin = Math.round((+new Date(2026, 3, 30) - +new Date(2026, 0, 1)) / 864e5); // Jan 1 - Apr 30
  const canvasWidth = parseFloat(canvas.style.width);
  const rangeOk = canvasWidth >= totalDaysMin * pxPerDay - pxPerDay; // allow one unit of boundary rounding

  const ok = deltaOk && widthOk && rangeOk && tasks.length >= 40;
  return {
    ok, taskCount: tasks.length, pxPerDay,
    anchorDeltaPx: actualDelta, expectedDeltaPx: expectedDelta, deltaOk,
    anchorCWidthPx: widthC, expectedAnchorCWidthPx: expectedWidthC, widthOk,
    canvasWidthPx: canvasWidth, minExpectedCanvasWidthPx: totalDaysMin * pxPerDay, rangeOk,
  };
})()
