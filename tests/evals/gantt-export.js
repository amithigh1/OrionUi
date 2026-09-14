/* gantt-export.js — populated data (45 tasks, 5 nested groups, dependencies, milestones), fixed
 * 2026 dates. Proves the three export formats the README documents: exportPNG (a real, non-empty
 * PNG blob), exportJSON (round-trips the task data), and exportPDF (falls back to the print dialog
 * when no Orion.PDF module is loaded, as documented, and resolves without throwing).
 *   node build/check.mjs docs/components/gantt.html --bundle=.tmp/gantt/orion.js "--eval=@.tmp/evals/gantt-export.js"
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

  const exportEvents = [];
  g.addEventListener('o-export', e => exportEvents.push(e.detail.format));

  // --- JSON: round-trips getTasks() ---
  const json = g.exportJSON({ download: false });
  let parsed = null, jsonErr = null;
  try { parsed = JSON.parse(json); } catch (e) { jsonErr = String(e); }
  const jsonRoundTrips = Array.isArray(parsed) && parsed.length === g.getTasks().length
    && parsed[0].id === g.getTasks()[0].id && parsed.find(t => t.id === 'g3-t3') && parsed.find(t => t.id === 'g3-t3').dependencies.some(d => d.type === 'SS');

  // --- PNG: a real, non-trivial image blob ---
  const blob = await g.exportPNG({ download: false, scale: 1 });
  const pngOk = blob instanceof Blob && blob.type === 'image/png' && blob.size > 1000;

  // --- PDF: no Orion.PDF module is loaded in this bundle, so it must fall back to the print dialog
  //     (per the README) without throwing, and still resolve. ---
  let pdfErr = null, pdfResult;
  try { pdfResult = await g.exportPDF({}); } catch (e) { pdfErr = String(e); }
  const pdfFallbackOk = pdfErr == null; // resolves cleanly (result is null for the print fallback, per exportPDF's docs)

  const ok = jsonRoundTrips && pngOk && pdfFallbackOk && exportEvents.includes('json') && exportEvents.includes('png') && exportEvents.includes('pdf');
  return {
    ok, taskCount: g.getTasks().length,
    jsonRoundTrips, jsonLength: json.length,
    pngOk, pngBlobType: blob && blob.type, pngBlobSize: blob && blob.size,
    pdfFallbackOk, pdfErr, pdfResult,
    exportEvents,
  };
})()
