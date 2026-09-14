/* docs-gaps.js — docs/components/validation.html "Orion.fill(form, data) & Orion.formFields(form)" demo.
 * Primary script for the docs-gaps work package (Orion.* APIs that were never mentioned in any docs page).
 * Clicks the real demo buttons (not calling Orion.fill programmatically) so this is the actual user flow:
 * fill a form from a nested data object, read back the control list, then round-trip through Orion.serialize.
 *   node build/check.mjs docs/components/validation.html --bundle=.tmp/docsgaps/orion.js "--eval=@tests/evals/docs-gaps.js"
 */
(async () => {
  const $ = s => document.querySelector(s);
  const form = $('#fill-form');
  if (!form) return { ok: false, error: 'no #fill-form on page' };

  $('#fill-btn').click();
  await new Promise(r => setTimeout(r, 60));
  const name = $('#fill-name').value, city = $('#fill-city').value;
  const design = form.querySelector('input[name="tags[]"][value="design"]').checked;
  const engineering = form.querySelector('input[name="tags[]"][value="engineering"]').checked;
  const sales = form.querySelector('input[name="tags[]"][value="sales"]').checked;
  const filledOk = name === 'Ada Lovelace' && city === 'London' && design && engineering && !sales;

  $('#fill-fields-btn').click();
  await new Promise(r => setTimeout(r, 60));
  const fieldsLog = $('#fill-log').textContent;
  const fieldsOk = /formFields\(\):/.test(fieldsLog) && /user\[name\]/.test(fieldsLog) && /user\[address\]\[city\]/.test(fieldsLog);

  // Orion.serialize() should now read back exactly what Orion.fill() wrote — a full fill/serialize round trip.
  const serialized = Orion.serialize(form);
  const serializeOk = !!serialized.user && serialized.user.name === 'Ada Lovelace' && serialized.user.address.city === 'London'
    && Array.isArray(serialized.tags) && serialized.tags.includes('design') && serialized.tags.includes('engineering') && !serialized.tags.includes('sales');

  const ok = filledOk && fieldsOk && serializeOk;
  return { ok, filledOk, fieldsOk, serializeOk, name, city, design, engineering, sales, fieldsLog, serialized };
})()
