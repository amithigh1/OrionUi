/* docs-gaps-trackview.js — docs/components/user-data.html "Recently viewed — data-o-track-view" demo.
 * Scrolls the card into view inside its scrollable container, waits past data-o-track-view-delay (600ms),
 * and confirms it recorded exactly once: the o-track-view event fires and Orion.viewed picks up the item.
 *   node build/check.mjs docs/components/user-data.html --bundle=.tmp/docsgaps/orion.js "--eval=@tests/evals/docs-gaps-trackview.js"
 */
(async () => {
  const box = document.getElementById('ud-track-scroll'), target = document.getElementById('ud-track-target');
  if (!box || !target) return { ok: false, error: 'demo elements not found' };
  const before = Orion.viewed.list().some(i => i.id === 'prod-42');

  let eventDetail = null;
  target.addEventListener('o-track-view', e => { eventDetail = e.detail; }, { once: true });
  box.scrollIntoView({ block: 'center' }); // the IntersectionObserver root is the page viewport — the box itself must be on-screen first
  await new Promise(r => setTimeout(r, 60));
  box.scrollTop = box.scrollHeight;
  await new Promise(r => setTimeout(r, 900)); // > data-o-track-view-delay (600ms)

  const eventOk = !!eventDetail && eventDetail.item && eventDetail.item.id === 'prod-42' && eventDetail.item.title === 'Aurora Desk Lamp';
  const storeOk = Orion.viewed.list().some(i => i.id === 'prod-42');
  const logOk = /o-track-view: /.test(document.getElementById('ud-track-log').textContent);

  const ok = !before && eventOk && storeOk && logOk;
  return { ok, before, eventOk, storeOk, logOk, eventDetail };
})()
