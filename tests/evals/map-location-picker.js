(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const r = {};

  // ── marker mode: drag the pin -> lat/lng form value, reverse-geocoded label ──
  const picker = document.createElement('o-location-picker');
  picker.setAttribute('name', 'spot');
  picker.setAttribute('mode', 'marker');
  picker.lat = 3.1390; picker.lng = 101.6869; picker.zoom = 14;
  picker.style.cssText = 'width:400px';
  document.body.appendChild(picker);
  await sleep(300);

  let changeDetail = null;
  picker.addEventListener('o-change', e => { changeDetail = e.detail; });

  const pin = picker.mapEl.querySelector('.o-map-marker');
  r.pinFound = !!pin;
  const pinRect = pin.getBoundingClientRect();
  const startX = pinRect.left + pinRect.width / 2, startY = pinRect.top + pinRect.height / 2;
  const targetX = startX + 60, targetY = startY - 40; // drag up-and-right on screen

  pin.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, clientX: startX, clientY: startY, button: 0 }));
  await sleep(20);
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 1, clientX: startX + 30, clientY: startY - 20 }));
  await sleep(20);
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 1, clientX: targetX, clientY: targetY }));
  await sleep(20);
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, clientX: targetX, clientY: targetY }));
  await sleep(120);

  r.valueChangedAfterDrag = picker.value && (picker.value.lat !== 3.1390 || picker.value.lng !== 101.6869);
  r.formValueHasLatLng = picker.value && typeof picker.value.lat === 'number' && typeof picker.value.lng === 'number';
  r.eventFiredOnDrag = !!changeDetail;

  // formValue() -> FormData with "lat,lng"
  const fd = picker.formValue();
  const latLngField = fd ? fd.get('spot') : null;
  r.formDataHasLatLngPair = typeof latLngField === 'string' && /^-?[\d.]+,-?[\d.]+$/.test(latLngField);

  // ── reverse-geocoded label (crosshair mode, default mock provider) ──
  const picker2 = document.createElement('o-location-picker');
  picker2.lat = 3.1579; picker2.lng = 101.7116; picker2.zoom = 15; // KLCC, in the mock dataset
  document.body.appendChild(picker2);
  await sleep(600); // initial reverse-geocode debounce (400ms) + mock provider sleep(80)
  r.reverseGeocodedLabel = picker2.value && typeof picker2.value.address === 'string' && picker2.value.address.length > 0;
  r.reverseLabelMentionsKLCC = picker2.value && /klcc|petronas/i.test(picker2.value.address);

  // ── required validation ──
  const req = document.createElement('o-location-picker');
  req.setAttribute('required', '');
  document.body.appendChild(req);
  await sleep(80);
  r.validWithDefaultValue = req.checkValidity(); // lat/lng default to a real point, so it's non-empty out of the box
  req.clear();
  await sleep(50);
  r.invalidAfterClear = !req.checkValidity();
  req.setLocation(1.3521, 103.8198, { address: 'Test address' });
  await sleep(50);
  r.validAfterSetLocation = req.checkValidity();

  picker.remove(); picker2.remove(); req.remove();
  r.ok = r.pinFound && r.valueChangedAfterDrag && r.formValueHasLatLng && r.eventFiredOnDrag && r.formDataHasLatLngPair
    && r.reverseGeocodedLabel && r.reverseLabelMentionsKLCC
    && r.validWithDefaultValue && r.invalidAfterClear && r.validAfterSetLocation;
  return r;
})()
