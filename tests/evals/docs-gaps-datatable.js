/* docs-gaps-datatable.js — docs/components/datatable.html "Programmatic factory — Orion.datatable()" demo.
 * Proves the factory-built <o-datatable> holds the configured rows, renders real clickable rows (o-row-click
 * fires with the right row), and its imperative sort API works against it.
 *   node build/check.mjs docs/components/datatable.html --bundle=.tmp/docsgaps/orion.js "--eval=@tests/evals/docs-gaps-datatable.js"
 */
(async () => {
  const dt = document.querySelector('#dt-factory-host o-datatable');
  if (!dt) return { ok: false, error: 'Orion.datatable() did not create an <o-datatable> inside the host' };
  await new Promise(r => setTimeout(r, 120));

  const rows = dt.getRows();
  const rowsOk = rows.length === 20;

  const tr = dt.querySelector('tbody tr');
  if (!tr) return { ok: false, error: 'no rendered row', rowsOk };
  let clickDetail = null;
  dt.addEventListener('o-row-click', e => { clickDetail = e.detail; }, { once: true });
  tr.click();
  await new Promise(r => setTimeout(r, 60));
  const clickOk = !!clickDetail && !!clickDetail.row && typeof clickDetail.row.name === 'string';

  dt.setSort('name', 'asc');
  await new Promise(r => setTimeout(r, 60));
  const sorted = dt.getRows({ sorted: true }).map(r => r.name);
  const sortOk = sorted.length === 20 && sorted.every((n, i) => i === 0 || sorted[i - 1].localeCompare(n) <= 0);

  const ok = rowsOk && clickOk && sortOk;
  return { ok, rowsOk, clickOk, sortOk, clickedName: clickDetail && clickDetail.row.name };
})()
