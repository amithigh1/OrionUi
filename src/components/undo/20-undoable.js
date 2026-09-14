/* Orion.undoable(formOrField, options) -> UndoManager tracking user edits of form fields.
 *   const um = Orion.undoable('#profile', { id: 'profile', mergeWindow: 1000 });   // typing grouped per field
 *   Tracks <input>, <textarea>, <select>, checkboxes, radio groups, contenteditable and Orion form controls.
 *   mod+Z / mod+Shift+Z / mod+Y inside the form; form reset becomes one undoable step. um.destroy() stops tracking.
 *   The element gets .undoManager, so <o-undo-controls for="profile"> works with the form's id too.
 */
function undoable(target, opts = {}) {
  const root = $(target);
  if (!root) throw new Error('Orion.undoable: target not found');
  const m = opts.manager || new UndoManager({ mergeWindow: 1000, limit: 200, id: opts.id || root.id || null, ...opts });
  const last = new WeakMap(), lastRadio = new Map();
  let applying = false;
  const isCE = el => el.isContentEditable && (el.getAttribute('contenteditable') ?? '') !== 'false' && !el.parentElement?.isContentEditable;
  const isField = el => !!el && el.nodeType === 1 && !el.hasAttribute('data-o-undo-ignore') && (el instanceof FormElement || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || isCE(el)) && !/^(button|submit|reset|image|file|hidden|password)$/i.test(el.type || '');
  const kind = el => (el instanceof FormElement ? 'fe' : el.type === 'checkbox' ? 'check' : el.type === 'radio' ? 'radio' : el.tagName === 'SELECT' ? 'select' : isCE(el) ? 'ce' : 'text');
  const get = el => {
    switch (kind(el)) {
      case 'fe': return clone(el.value ?? null);
      case 'check': return el.checked;
      case 'select': return el.multiple ? [...el.selectedOptions].map(o => o.value) : el.value;
      case 'ce': return el.innerHTML;
      default: return el.value;
    }
  };
  const fire = el => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const set = (el, v) => {
    applying = true;
    try {
      const k = kind(el);
      if (k === 'fe') el.setValue ? el.setValue(clone(v)) : (el.value = clone(v));
      else {
        if (k === 'check') el.checked = !!v;
        else if (k === 'select' && el.multiple) [...el.options].forEach(o => { o.selected = v.includes(o.value); });
        else if (k === 'ce') el.innerHTML = v;
        else el.value = v;
        fire(el);
      }
      last.set(el, clone(v));
      if (doc.activeElement === el && isFn(el.setSelectionRange) && k === 'text') { try { el.setSelectionRange(el.value.length, el.value.length); } catch {} }
    } finally { applying = false; }
  };
  const labelOf = el => {
    if (el.type === 'radio') {   // prefer the group's label: <fieldset><legend> or [role=radiogroup][aria-label(ledby)]
      const g = el.closest('fieldset, [role="radiogroup"]');
      const gl = g && (g.querySelector(':scope > legend')?.textContent || g.getAttribute('aria-label') || doc.getElementById(g.getAttribute('aria-labelledby') || '')?.textContent);
      if (gl) return gl.trim().replace(/\s+/g, ' ').slice(0, 40);
    }
    let lb = el.id ? doc.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
    lb = lb || el.closest('label') || (el.getAttribute('aria-labelledby') && doc.getElementById(el.getAttribute('aria-labelledby').split(' ')[0]));
    const txt = (lb?.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || el.getAttribute('name') || '').trim().replace(/\s+/g, ' ');
    return txt.length > 40 ? txt.slice(0, 39) + '…' : txt;
  };
  const labelFor = (el, grouped) => { const field = labelOf(el); return field ? t(grouped ? 'undo.typing' : 'undo.change', { field }) : t(grouped ? 'undo.typingAny' : 'undo.changeAny'); };
  const groupOf = el => (el.form || root).querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`);
  const remember = el => {
    if (!isField(el)) return;
    if (el.type === 'radio') { if (!lastRadio.has(el.name)) lastRadio.set(el.name, [...groupOf(el)].find(r => r.checked) || null); }
    else if (!last.has(el)) last.set(el, clone(get(el)));
  };
  const hostOf = el => { for (let n = el; n && n !== root.parentNode; n = n.parentElement) if (n instanceof FormElement) return n; return el; };
  const fields = () => (isField(root) ? [root] : [...new Set($$('input,textarea,select,[contenteditable]', root).map(hostOf).concat($$('*', root).filter(el => el instanceof FormElement)))]);
  fields().forEach(remember);

  const record = (el, typed) => {
    if (applying || m.applying || !isField(el)) return;
    if (el.type === 'radio') {
      if (!el.checked) return;
      const from = lastRadio.has(el.name) ? lastRadio.get(el.name) : null;
      if (from === el) return;
      lastRadio.set(el.name, el);
      const setRadio = r => { applying = true; try { if (r) { r.checked = true; fire(r); } else { el.checked = false; fire(el); } lastRadio.set(el.name, r); } finally { applying = false; } };
      m.push({ label: labelFor(el, false), undo: () => setRadio(from), do: () => setRadio(el) });
      return;
    }
    const from = last.has(el) ? last.get(el) : (el.defaultValue ?? ''), to = clone(get(el));
    if (equal(from, to)) return;
    last.set(el, clone(to));
    const k = kind(el), grouped = typed && (k === 'text' || k === 'ce' || k === 'fe');
    m.push({
      el, from, to, kind: grouped ? 'type' : 'change',
      label: labelFor(el, grouped),
      undo() { set(el, this.from); }, do() { set(el, this.to); },
      merge: grouped ? function (prev) { if (prev.el === el && prev.kind === 'type') { prev.to = this.to; return true; } return false; } : false,
    });
  };
  const target0 = e => (e.composedPath ? e.composedPath()[0] : e.target);
  const offs = [
    on(root, 'focusin pointerdown', e => remember(hostOf(target0(e)))),
    on(root, 'input', e => { const el = hostOf(target0(e)); if (kind(el) === 'text' || kind(el) === 'ce' || kind(el) === 'fe') record(el, true); }),
    on(root, 'change', e => { const el = hostOf(target0(e)); if (!['text', 'ce', 'fe'].includes(kind(el))) record(el, false); else if (!equal(last.get(el), get(el))) record(el, true); }),
    on(root, 'focusout', () => m.seal()),
    on(root, 'reset', () => {
      const before = fields().map(el => [el, el.type === 'radio' ? el.checked : clone(get(el))]);
      setTimeout(() => {
        const changed = before.filter(([el, v]) => !equal(el.type === 'radio' ? el.checked : get(el), v));
        if (!changed.length) return;
        const after = changed.map(([el]) => [el, el.type === 'radio' ? el.checked : clone(get(el))]);
        const apply = list => list.forEach(([el, v]) => { if (el.type === 'radio') { applying = true; el.checked = v; applying = false; if (v) lastRadio.set(el.name, el); } else set(el, v); });
        after.forEach(([el, v]) => { if (el.type === 'radio') { if (v) lastRadio.set(el.name, el); } else last.set(el, clone(v)); });
        m.push({ label: t('undo.reset'), undo: () => apply(changed), do: () => apply(after) });
        m.seal();
      });
    }),
  ];
  if (opts.bind !== false) offs.push(m.bind(root, { allowInInputs: true }));
  root.undoManager = m;
  const destroy = m.destroy.bind(m);
  m.untrack = () => { offs.forEach(f => f()); if (root.undoManager === m) delete root.undoManager; };
  m.destroy = () => { m.untrack(); destroy(); };
  return m;
}
O.undoable = undoable;
