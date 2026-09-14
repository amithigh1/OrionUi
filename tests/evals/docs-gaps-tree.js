/* docs-gaps-tree.js — docs/components/tree.html "Programmatic factory — Orion.tree()" demo.
 * Orion.tree() REPLACES the host element rather than appending inside it — confirms the returned element is
 * the live, connected tree: clicking a rendered row fires o-select with the right node, and addNode() both
 * updates the model and renders a new row.
 *   node build/check.mjs docs/components/tree.html --bundle=.tmp/docsgaps/orion.js "--eval=@tests/evals/docs-gaps-tree.js"
 */
(async () => {
  const tr = document.getElementById('tr-factory');
  if (!tr) return { ok: false, error: 'Orion.tree() did not produce a #tr-factory element (replaceWith may not have run)' };
  const connectedOk = tr.isConnected && tr.localName === 'o-tree';

  const row = [...tr.querySelectorAll('.o-tree-row')].find(r => /First child/.test(r.textContent));
  if (!row) return { ok: false, error: 'expected row not rendered', connectedOk };
  let selectDetail = null;
  tr.addEventListener('o-select', e => { selectDetail = e.detail; }, { once: true });
  row.click();
  await new Promise(r => setTimeout(r, 60));
  const selectOk = !!selectDetail && selectDetail.node.label === 'First child';

  const added = tr.addNode('root', { id: 'c', label: 'Third child' });
  await new Promise(r => setTimeout(r, 60));
  const modelOk = !!added && tr.getNode('c')?.label === 'Third child';
  const domOk = [...tr.querySelectorAll('.o-tree-row')].some(r => /Third child/.test(r.textContent));

  const ok = connectedOk && selectOk && modelOk && domOk;
  return { ok, connectedOk, selectOk, modelOk, domOk };
})()
