(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const el = document.createElement('o-address-input');
  el.setAttribute('name', 'addr');
  document.body.appendChild(el);
  await sleep(80);

  const r = {};
  const input = el.querySelector('.o-ac-input');
  r.inputFound = !!input;

  // ── typing -> suggestions from the offline fixture (mock) geocoder ──
  input.focus();
  input.value = 'Petronas';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(500); // debounce (350ms) + the mock provider's own sleep(120)

  const options = [...document.querySelectorAll('.o-ac-panel .o-listbox-option')];
  r.suggestionCount = options.length;
  r.suggestionsMentionPetronas = options.some(o => /petronas/i.test(o.textContent));

  // ── keyboard select: ArrowDown highlights the first result, Enter commits it ──
  let changeDetail = null;
  el.addEventListener('o-change', e => { changeDetail = e.detail; });
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  await sleep(30);
  const active = document.querySelector('.o-ac-panel .o-listbox-option.is-active, .o-ac-panel .o-listbox-option[aria-selected="true"]');
  r.arrowDownHighlighted = !!active;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await sleep(80);

  r.valueIsStructured = el.value && typeof el.value === 'object' && typeof el.value.lat === 'number' && typeof el.value.lng === 'number';
  r.valueLabelMentionsPetronas = el.value && /petronas/i.test(el.value.address || '');
  r.inputTextShowsLabel = /petronas/i.test(input.value);

  // ── o-change event detail shape ──
  r.eventFiredOnSelect = !!changeDetail;
  r.eventDetailMatchesValue = changeDetail && JSON.stringify(changeDetail.value) === JSON.stringify(el.value);

  // ── clearing the field back to empty clears the value too (o-input path) ──
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(50);
  r.valueClearedOnEmpty = el.value === null;

  // ── required validation ──
  const req = document.createElement('o-address-input');
  req.setAttribute('required', '');
  document.body.appendChild(req);
  await sleep(50);
  r.requiredInvalidWhenEmpty = !req.checkValidity();
  req.setValue({ lat: 1, lng: 1, address: 'Somewhere' });
  await sleep(30);
  r.requiredValidAfterValue = req.checkValidity();

  el.remove(); req.remove();
  r.ok = r.inputFound && r.suggestionCount > 0 && r.suggestionsMentionPetronas && r.arrowDownHighlighted
    && r.valueIsStructured && r.valueLabelMentionsPetronas && r.inputTextShowsLabel
    && r.eventFiredOnSelect && r.eventDetailMatchesValue && r.valueClearedOnEmpty
    && r.requiredInvalidWhenEmpty && r.requiredValidAfterValue;
  return r;
})()
