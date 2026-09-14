/* legacy-preferences-controls.js — salvaged from .tmp/eval-prefs.js (docs/components/preferences.html).
 * The live preferences panel: font-scale range + A- button stay in sync, density compact changes
 * --o-control-h, and the high-contrast / reduce-motion toggles flip their respective states.
 * Complements the existing core-motion.js (which only checks the Orion.anim.reducedMotion() API directly).
 *
 * FIX vs the original script: it compared the range input's value (a percentage like "119") directly
 * against the --o-font-scale custom property (a decimal multiplier like "1.1875") as strings, which can
 * never be equal — converts the multiplier to a percentage first.
 */
(async () => {
  const before = getComputedStyle(document.documentElement).getPropertyValue('--o-font-scale').trim();
  const range = document.querySelector('#demo-prefs [data-pref-range="fontScale"]');
  range.value = '125';
  range.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 80));
  const after = getComputedStyle(document.documentElement).getPropertyValue('--o-font-scale').trim();
  document.querySelector('#demo-prefs [data-o-value="font-"]').click();
  await new Promise(r => setTimeout(r, 80));
  const afterMinus = getComputedStyle(document.documentElement).getPropertyValue('--o-font-scale').trim();
  const rangeSynced = range.value;
  const controlHBefore = getComputedStyle(document.documentElement).getPropertyValue('--o-control-h').trim();
  document.querySelector('#demo-prefs [data-pref-set="density"][data-value="compact"]').click();
  await new Promise(r => setTimeout(r, 50));
  const controlH = getComputedStyle(document.documentElement).getPropertyValue('--o-control-h').trim();
  document.querySelector('#demo-prefs [data-pref-contrast]').click();
  await new Promise(r => setTimeout(r, 50));
  const highContrastOn = Orion.theme.highContrast;
  document.querySelector('#demo-prefs [data-pref-set="motion"][data-value="on"]').click();
  await new Promise(r => setTimeout(r, 50));
  const motionClass = document.documentElement.classList.contains('o-motion-reduce');

  const rangeSyncedMatchesScale = Math.abs(Math.round(parseFloat(afterMinus) * 100) - parseInt(rangeSynced, 10)) <= 1;
  const ok = after !== before && afterMinus !== after && rangeSyncedMatchesScale
    && controlH !== controlHBefore && highContrastOn === true && motionClass === true;
  return { ok, before, after, afterMinus, rangeSynced, controlH, controlHBefore, highContrastOn, motionClass };
})()
