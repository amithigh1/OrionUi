/* ============================================================================
 * Orion.ai.fillForm(form, text, opts) -> Promise<{ proposed, applied, values }>
 * Reads a form's named fields (Orion.formFields), asks the AI to pull matching values out of
 * free text (Orion.ai.tasks.extract), and renders an inline confirmation panel — one row per
 * proposed field, all checked by default, old value struck through next to the new one — right
 * after the form (or into opts.container). The form is only written to (via Orion.fill) when the
 * user clicks Apply; Cancel discards the proposal untouched. Every row's checkbox can be unchecked
 * to keep that field as-is.
 *   opts: { fields: string[] (limit to these field names), provider, signal, container }
 * Needs "ai" (Orion.ai) and "validation" (Orion.fill / Orion.formFields).
 * ========================================================================== */
const __AI_FILL_SKIP_TYPE = /^(password|file|hidden|submit|reset|button|image)$/i;
const __AI_FILL_TYPE_HINT = { email: 'email', tel: 'phone number', number: 'number', date: 'date (YYYY-MM-DD)', url: 'URL', checkbox: 'boolean' };

function __aitFieldLabel(el) {
  if (el.labels && el.labels.length && el.labels[0].textContent.trim()) return el.labels[0].textContent.trim();
  const wrap = el.closest('label');
  if (wrap && wrap.textContent.trim()) return wrap.textContent.trim();
  return el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || el.name || '';
}
function __aitDescribeFields(form, only) {
  const wanted = only && only.length ? new Set(only.map(String)) : null;
  const seen = new Set();
  const out = [];
  for (const el of O.formFields(form)) {
    const type = (el.type || '').toLowerCase();
    if (__AI_FILL_SKIP_TYPE.test(type)) continue;
    const name = el.getAttribute('name') || el.name || el.id;
    if (!name || seen.has(name) || (wanted && !wanted.has(name))) continue;
    seen.add(name);
    out.push({ el, name, label: __aitFieldLabel(el), type: __AI_FILL_TYPE_HINT[type] });
  }
  return out;
}
function __aitFieldCurrentValue(el) {
  if (el.type === 'checkbox') return el.checked ? 'true' : '';
  if (el.type === 'radio') return el.checked ? el.value : '';
  return String(el.value ?? '').trim();
}

function __aitRenderFillPanel(form, fields, proposed, opts) {
  return new Promise(resolve => {
    const rows = fields.filter(f => Object.prototype.hasOwnProperty.call(proposed, f.name)).map(f => {
      const cb = h('input', { type: 'checkbox', class: 'o-check-input', checked: true });
      const oldVal = __aitFieldCurrentValue(f.el);
      const row = h('label', { class: 'o-check o-ai-fill-row' }, cb,
        h('span', { class: 'o-ai-fill-row-label' }, f.label || f.name),
        h('span', { class: 'o-ai-fill-row-value' },
          ...(oldVal ? [h('del', { class: 'o-ai-fill-old' }, oldVal), ' '] : []),
          h('ins', { class: 'o-ai-fill-new' }, String(proposed[f.name]))));
      return { row, cb, field: f };
    });
    const applyBtn = h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm', 'data-action': 'apply' }, iconEl('check'), h('span', {}, t('common.apply')));
    const cancelBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', 'data-action': 'discard' }, t('common.cancel'));
    const panel = h('div', { class: 'o-ai-fill-panel', role: 'region', 'aria-label': t('aiFill.title') },
      h('div', { class: 'o-ai-fill-title' }, iconEl('sparkles'), h('span', {}, t('aiFill.title'))),
      h('div', { class: 'o-ai-fill-rows' }, ...rows.map(r => r.row)),
      h('div', { class: 'o-ai-fill-actions' }, applyBtn, cancelBtn));

    const container = opts.container ? $(opts.container) : null;
    if (container) container.append(panel); else form.after(panel);

    function finish(applied) {
      let values = {};
      if (applied) {
        values = {};
        rows.forEach(r => { if (r.cb.checked) values[r.field.name] = proposed[r.field.name]; });
        O.fill(form, values, { events: true });
        announce(t('aiFill.filled', { count: Object.keys(values).length }));
      }
      panel.remove();
      resolve({ applied, values });
    }
    on(applyBtn, 'click', () => finish(true));
    on(cancelBtn, 'click', () => finish(false));
    nextFrame().then(() => { if (panel.isConnected) applyBtn.focus(); });
  });
}

/** Orion.ai.fillForm(form, text, opts) -> Promise<{ proposed, applied, values }> */
async function aiFillForm(form, text, opts = {}) {
  form = $(form);
  if (!form) throw new Error('[Orion] Orion.ai.fillForm: form not found.');
  if (!O.ai) throw new Error('[Orion] Orion.ai.fillForm requires the "ai" component (Orion.ai) — include it in your build.');
  if (!O.fill || !O.formFields) throw new Error('[Orion] Orion.ai.fillForm requires the "validation" component (Orion.fill / Orion.formFields) — include it in your build.');

  const fields = __aitDescribeFields(form, opts.fields);
  if (!fields.length) return { proposed: {}, applied: false, values: {} };

  const aiFields = fields.map(f => ({ name: f.name, type: f.type, description: f.label }));
  const { system, messages } = O.ai.tasks.extract(aitTruncate(aitTextOf(text), 6000), { fields: aiFields });
  let raw;
  try { raw = await O.ai.chat(messages, { system, task: 'extract', options: { fields: aiFields }, signal: opts.signal, provider: opts.provider }); }
  catch (err) { if (err?.name !== 'AbortError') announce(t('aiFill.error'), 'assertive'); throw err; }

  const data = aitParseJSON(raw) || {};
  const proposed = {};
  for (const f of fields) {
    const v = data[f.name];
    if (v !== undefined && v !== null && String(v).trim() !== '') proposed[f.name] = v;
  }
  if (!Object.keys(proposed).length) { announce(t('aiFill.error'), 'assertive'); return { proposed, applied: false, values: {} }; }

  const { applied, values } = await __aitRenderFillPanel(form, fields, proposed, opts);
  return { proposed, applied, values };
}
