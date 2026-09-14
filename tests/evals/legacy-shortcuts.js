/* legacy-shortcuts.js — salvaged from .tmp/shortcuts-eval.js (docs/components/shortcuts.html).
 * Orion.shortcuts: basic combo, "g i" sequence (with no fire on a partial sequence), scope stacking
 * (exclusive scope silences global bindings), format(), and the help overlay.
 *
 * FIX vs the original script: the basic-combo test used "mod+k", but this page's own live demo already
 * registers "mod+k" for its command-palette. Confirmed empirically (node build/check.mjs against this
 * page): a synthetic mod+k keydown never reaches a freshly-added handler (window.dispatchEvent even
 * reports the event as defaultPrevented by the time it returns), while an unused combo like "mod+j" fires
 * a freshly-added handler immediately. Uses a combo the page doesn't already bind, avoiding the collision.
 */
(async () => {
  const out = {};
  const fireKey = (key, opts = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));

  let hit = 0;
  const off1 = Orion.shortcuts.add('alt+shift+j', () => hit++, { description: 'Test action' });
  fireKey('j', { altKey: true, shiftKey: true });
  out.basicCombo = hit;

  let seqHit = 0;
  const off2 = Orion.shortcuts.add('g i', () => seqHit++, { description: 'Go inbox' });
  fireKey('g'); fireKey('i');
  out.sequence = seqHit;
  seqHit = 0; fireKey('g');
  out.partialSequenceNoFire = seqHit === 0;
  off2();

  let globalHit = 0, scopedHit = 0;
  const offG = Orion.shortcuts.add('a', () => globalHit++, { description: 'Global A' });
  const offS = Orion.shortcuts.add('a', () => scopedHit++, { description: 'Scoped A', scope: 'modal' });
  const popScope = Orion.shortcuts.pushScope('modal', { exclusive: true });
  fireKey('a');
  out.scopeExclusive = { globalHit, scopedHit };
  popScope();
  globalHit = 0;
  fireKey('a');
  out.scopeRestored = globalHit;
  offG(); offS(); off1();

  out.format = Orion.shortcuts.format('mod+shift+p');

  Orion.shortcuts.add('mod+shift+x', () => {}, { description: 'Test action', group: 'Testing' });
  Orion.shortcuts.help();
  await new Promise(r => setTimeout(r, 80));
  out.helpOpen = Orion.shortcuts.helpOpen;
  out.helpListsAction = !!document.querySelector('.o-sc-dialog') && document.querySelector('.o-sc-dialog').textContent.includes('Test action');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 80));
  out.helpClosedOnEscape = !Orion.shortcuts.helpOpen;

  const ok = out.basicCombo === 1 && out.sequence === 1 && out.partialSequenceNoFire
    && out.scopeExclusive.globalHit === 0 && out.scopeExclusive.scopedHit === 1 && out.scopeRestored === 1
    && typeof out.format === 'string' && out.format.length > 0
    && out.helpOpen && out.helpListsAction && out.helpClosedOnEscape;
  return { ok, ...out };
})()
