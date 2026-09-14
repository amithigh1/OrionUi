/* <select data-o-select> — progressive enhancement of a native select.
 * An <o-select> is rendered right after the native element; the native select stays in the form (it submits the
 * value and anchors the browser's validation bubble) and both are kept in sync in both directions.
 *   <select name="country" data-o-select='{"clearable":true}' required>
 *     <option value="">Choose a country…</option>          (a leading empty option becomes the placeholder)
 *     <optgroup label="Asia"><option value="my" data-icon="home">Malaysia</option></optgroup>
 *   </select>
 *   Per-prop attributes also work: data-o-select-clearable, data-o-select-placeholder="…", data-o-select-max="3".
 *   select.oSelect -> the generated <o-select>. After changing the native value from script, dispatch a 'change' event.
 */
behavior('data-o-select', (sel, cfg) => {
  if (sel.localName !== 'select') return;
  const os = doc.createElement('o-select');
  const conf = parseJSON(cfg, null) || {};
  const props = OSelect.props;
  const prevTab = sel.getAttribute('tabindex');
  let syncing = false, pushing = false;

  for (const a of [...sel.attributes]) {
    const m = a.name.match(/^data-o-select-(.+)$/);
    if (m) { const k = camel(m[1]); if (props[k]) conf[k] = parseAttr(a.value, props[k].type || props[k]); }
  }
  if (!conf.size && sel.classList.contains('o-input-sm')) conf.size = 'sm';
  if (!conf.size && sel.classList.contains('o-input-lg')) conf.size = 'lg';
  for (const [k, v] of Object.entries(conf)) if (props[k] && k !== 'value' && k !== 'name') os[k] = v;

  const fromOpt = (el, g) => ({
    value: el.value, label: el.label || el.textContent.trim(), disabled: el.disabled || !!g?.disabled, group: g ? g.label : undefined,
    description: el.dataset.description, icon: el.dataset.icon, avatar: el.dataset.avatar,
  });
  const pull = () => {
    const out = [];
    let ph = conf.placeholder || '';
    for (const el of sel.children) {
      if (el.localName === 'option') {
        if (el.value === '' && el === sel.options[0]) { if (!ph) ph = el.textContent.trim(); continue; }
        out.push(fromOpt(el));
      } else if (el.localName === 'optgroup') for (const c of el.children) if (c.localName === 'option') out.push(fromOpt(c, el));
    }
    syncing = true;
    os.multiple = sel.multiple;
    os.disabled = sel.disabled;
    os.required = sel.required;
    os.options = out;
    if (ph) os.placeholder = ph;
    const vals = [...sel.selectedOptions].map(o => o.value).filter(v => v !== '');
    os.value = sel.multiple ? vals : (vals[0] ?? null);
    syncing = false;
  };
  const push = () => {
    const v = os.formValue();
    const set = new Set(toArr(v).map(String));
    pushing = true;
    for (const o of sel.options) o.selected = set.has(o.value);
    if (!sel.multiple && !set.size) { const empty = [...sel.options].find(o => o.value === ''); if (empty) empty.selected = true; else sel.selectedIndex = -1; }
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    pushing = false;
  };

  // accessible name: labels of the native select label the o-select
  const ids = [...(sel.labels || [])].map(l => l.id || (l.id = uid('lbl')));
  if (ids.length) os.setAttribute('aria-labelledby', ids.join(' '));
  else if (sel.getAttribute('aria-label')) os.setAttribute('aria-label', sel.getAttribute('aria-label'));
  [...(sel.labels || [])].forEach(l => l.addEventListener('click', l.__oSelClick = e => { e.preventDefault(); os.focus(); }));

  pull();
  sel.classList.add('o-select-native');
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');
  sel.after(os);
  sel.oSelect = os;

  const offs = [
    on(os, 'o-change', () => { if (!syncing) push(); }),
    on(sel, 'change', () => { if (!pushing) pull(); }),
    on(sel, 'keydown', e => { if (e.key !== 'Tab') { e.preventDefault(); os.focus(); } }),
  ];
  const form = sel.form;
  const onReset = () => setTimeout(pull);
  form?.addEventListener('reset', onReset);
  const mo = new MutationObserver(() => pull());
  mo.observe(sel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'multiple', 'required', 'selected', 'label', 'value', 'data-description', 'data-icon', 'data-avatar'] });

  return () => {
    offs.forEach(f => f()); mo.disconnect(); form?.removeEventListener('reset', onReset);
    [...(sel.labels || [])].forEach(l => l.__oSelClick && l.removeEventListener('click', l.__oSelClick));
    os.remove(); delete sel.oSelect;
    sel.classList.remove('o-select-native'); sel.removeAttribute('aria-hidden');
    if (prevTab == null) sel.removeAttribute('tabindex'); else sel.setAttribute('tabindex', prevTab);
  };
});
