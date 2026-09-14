/* docs-gaps-kanban.js — docs/components/kanban.html "Programmatic factory — Orion.kanban()" demo.
 * Orion.kanban() REPLACES the host element rather than appending inside it, which is easy to get wrong —
 * this confirms the returned element is the live, connected board (not a detached node): addCard() renders
 * a real card, and moveCard() fires o-card-move with the right detail.
 *   node build/check.mjs docs/components/kanban.html --bundle=.tmp/docsgaps/orion.js "--eval=@tests/evals/docs-gaps-kanban.js"
 */
(async () => {
  const kb = document.getElementById('kb-factory');
  if (!kb) return { ok: false, error: 'Orion.kanban() did not produce a #kb-factory element (replaceWith may not have run)' };
  const connectedOk = kb.isConnected && kb.localName === 'o-kanban';

  const added = kb.addCard({ title: 'Added from eval', columnId: 'todo' });
  await new Promise(r => setTimeout(r, 80));
  const addOk = !!added && !!kb.querySelector(`.o-kanban-card[data-id="${added.id}"]`) && /Added from eval/.test(kb.querySelector(`.o-kanban-card[data-id="${added.id}"]`).textContent);

  let moveDetail = null;
  kb.addEventListener('o-card-move', e => { moveDetail = e.detail; }, { once: true });
  kb.moveCard(1, 'doing', 0);
  await new Promise(r => setTimeout(r, 80));
  const moveOk = !!moveDetail && String(moveDetail.cardId) === '1' && moveDetail.to === 'doing';
  const dataOk = kb.getData().cards.find(c => String(c.id) === '1')?.columnId === 'doing';

  const ok = connectedOk && addOk && moveOk && dataOk;
  return { ok, connectedOk, addOk, moveOk, dataOk, moveDetail };
})()
