/* legacy-theme-builder.js — salvaged from .tmp/eval-tb.js (docs/components/theme-builder.html).
 * <o-theme-builder>: a color input updates the live --o-primary token, applyPreset() updates both the
 * token and the input together, and exportJSON() reflects the current draft.
 */
(async () => {
  const tb = document.getElementById('demo-tb');
  const before = getComputedStyle(document.documentElement).getPropertyValue('--o-primary').trim();
  const colorInput = tb.querySelector('[data-tb="colors.primary"]');
  colorInput.value = '#e11d48';
  colorInput.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 80));
  const after = getComputedStyle(document.documentElement).getPropertyValue('--o-primary').trim();
  const contrastRow = [...tb.querySelectorAll('.o-tb-contrast-table tbody tr')][0];
  const ratioText = contrastRow.children[2].textContent.trim();
  const wcagBadge = contrastRow.children[3].textContent.trim();
  tb.applyPreset('Emerald');
  await new Promise(r => setTimeout(r, 80));
  const afterPreset = getComputedStyle(document.documentElement).getPropertyValue('--o-primary').trim();
  const colorInputSynced = colorInput.value;
  const json = tb.exportJSON();
  const parsed = JSON.parse(json);

  const matchesInput = after.toLowerCase() === '#e11d48';
  const ok = matchesInput && !!ratioText && !!wcagBadge
    && afterPreset !== after && colorInputSynced.toLowerCase() === afterPreset.toLowerCase()
    && parsed.colors.primary.toLowerCase() === afterPreset.toLowerCase();
  return { ok, before, after, matchesInput, ratioText, wcagBadge, afterPreset, colorInputSynced, exportedPrimary: parsed.colors.primary };
})()
