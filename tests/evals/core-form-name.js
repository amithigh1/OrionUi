(async () => {
  // A form-associated element whose `name` is set as a PROPERTY (frameworks do this) must still submit: the browser
  // keys FormData off the `name` content attribute, so FormElement must reflect the prop. Before the fix, `.name = 'x'`
  // left no attribute and the control silently vanished from FormData.
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  const form = document.createElement('form');
  form.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  const sel = document.createElement('o-select');
  sel.options = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }];
  form.append(sel);
  document.body.append(form);
  await customElements.whenDefined('o-select'); await sleep(50);
  sel.name = 'plan';           // property, not attribute
  sel.value = 'b';
  await sleep(50);
  out.attributeReflected = sel.getAttribute('name') === 'plan';
  const fd = new FormData(form);
  out.inFormData = fd.get('plan') === 'b';
  // renaming via property re-keys the entry
  sel.name = 'tier'; await sleep(30);
  const fd2 = new FormData(form);
  out.rekeyed = fd2.get('tier') === 'b' && !fd2.has('plan');
  // attribute → property still works the other way
  sel.setAttribute('name', 'level'); await sleep(30);
  out.attrToProp = sel.name === 'level' && new FormData(form).get('level') === 'b';
  form.remove();
  out.ok = out.attributeReflected && out.inFormData && out.rekeyed && out.attrToProp;
  return out;
})()
