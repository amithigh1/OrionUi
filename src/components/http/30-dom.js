/* HTTP behaviors
 *   <form data-o-ajax action="/api/users" method="post"               submits through Orion.http (JSON, or FormData with files)
 *         data-o-ajax-toast="Saved!" data-o-ajax-reset data-o-ajax-redirect="/users" data-o-ajax-offline>
 *     422 { errors: { field: msg | [msgs] } } are shown in the matching .o-field (.is-invalid + .o-error)
 *     events: o-ajax-before (cancelable, detail.config editable), o-ajax-success, o-ajax-error (cancelable: skip default error UI)
 *   <div data-o-load="/fragments/stats.html" data-o-trigger="load, every 30s" data-o-select=".card"></div>
 *   <button data-o-load="/fragments/more.html" data-o-target="#list" data-o-swap="append">More</button>
 *     triggers: load | click | visible | every 30s | <any DOM event>; swap: inner | append | prepend | outer
 *     HTML is sanitized unless data-o-trusted; events: o-load-before (cancelable), o-load, o-load-error
 *   Orion.http.load(target, url, { trusted, select, swap, skeleton }) -> Promise<string>
 */

const httpToast = (msg, type = 'info') => { if (isFn(O.toast) && msg) { try { return O.toast(msg, { type }); } catch (e) { console.error(e); } } return null; };

/* ── forms ─────────────────────────────────────────────────────────────── */
/** FormData -> object: repeated keys and name[] become arrays, a.b / a[b] become nested objects */
function formToObject(fd) {
  const out = {};
  for (const [rawKey, v] of fd.entries()) {
    if (isInst(v, File) && !v.name && !v.size) continue;
    const isArr = rawKey.endsWith('[]');
    const path = rawKey.replace(/\[\]$/, '').split(/\.|\[|\]/).filter(Boolean);
    let o = out;
    for (let i = 0; i < path.length - 1; i++) { if (!isObj(o[path[i]])) o[path[i]] = {}; o = o[path[i]]; }
    const k = path[path.length - 1] ?? rawKey;
    if (isArr) (o[k] = Array.isArray(o[k]) ? o[k] : []).push(v);
    else if (k in o) o[k] = Array.isArray(o[k]) ? [...o[k], v] : [o[k], v];
    else o[k] = v;
  }
  return out;
}
/** Normalise validation payloads (Laravel, Rails, ASP.NET ProblemDetails, express-validator) -> { field: message } */
function extractErrors(data) {
  if (!data || typeof data !== 'object') return null;
  const src = data.errors ?? data.fieldErrors ?? data.validationErrors ?? data.detail?.errors;
  if (!src) return null;
  const out = {};
  if (Array.isArray(src)) {
    for (const e of src) {
      if (!isObj(e)) continue;
      const k = e.field ?? e.path ?? e.param ?? e.name ?? e.property ?? e.loc?.slice?.(-1)?.[0];
      if (k != null) out[k] = [out[k], e.message ?? e.msg ?? e.detail ?? e.error].filter(Boolean).join(' ');
    }
  } else if (isObj(src)) for (const [k, v] of Object.entries(src)) out[k] = Array.isArray(v) ? v.map(x => (isObj(x) ? x.message ?? x.msg : x)).join(' ') : isObj(v) ? v.message ?? JSON.stringify(v) : String(v);
  return Object.keys(out).length ? out : null;
}
const __normName = s => String(s).toLowerCase().replace(/\[\]$/, '').replace(/\[(\w*)\]/g, '.$1').replace(/^\.+|\.+$/g, '');
function findControl(form, name) {
  const n = __normName(name);
  return [...form.elements].find(el => el.name && __normName(el.name) === n) || form.querySelector(`[data-o-error-for="${CSS.escape(name)}"]`);
}
function markInvalid(ctl, msg) {
  const field = ctl.closest('.o-field') || ctl.parentElement;
  ctl.classList.add('is-invalid');
  ctl.setAttribute('aria-invalid', 'true');
  ctl.__oAjaxErr = true;
  if (!field) return;
  field.classList.add('is-invalid');
  let err = field.querySelector('.o-error');
  if (!err) { err = h('div', { class: 'o-error', 'data-o-ajax-err': '' }); if (field === ctl.parentElement && !ctl.closest('.o-field')) ctl.after(err); else field.append(err); }
  if (err.__oOrig === undefined) err.__oOrig = err.textContent;
  err.textContent = msg;
  err.classList.add('is-visible');
  if (!err.id) err.id = uid('o-err');
  const ids = new Set((ctl.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  ids.add(err.id);
  ctl.setAttribute('aria-describedby', [...ids].join(' '));
}
function clearFieldError(ctl) {
  if (!ctl || !ctl.__oAjaxErr) return;
  ctl.__oAjaxErr = false;
  ctl.classList.remove('is-invalid');
  ctl.removeAttribute('aria-invalid');
  const field = ctl.closest('.o-field') || ctl.parentElement;
  if (!field) return;
  if (![...field.querySelectorAll('[aria-invalid="true"]')].length) field.classList.remove('is-invalid');
  const err = field.querySelector('.o-error');
  if (!err) return;
  const ids = (ctl.getAttribute('aria-describedby') || '').split(/\s+/).filter(x => x && x !== err.id);
  if (ids.length) ctl.setAttribute('aria-describedby', ids.join(' ')); else ctl.removeAttribute('aria-describedby');
  if (err.hasAttribute('data-o-ajax-err')) err.remove();
  else { err.textContent = err.__oOrig ?? ''; err.__oOrig = undefined; err.classList.remove('is-visible'); }
}
function formMessage(form, msg, type) {
  const box = form.querySelector('[data-o-ajax-message]');
  if (box) {
    box.hidden = !msg;
    box.classList.remove('o-alert', 'o-alert-success', 'o-alert-danger', 'o-alert-info', 'o-alert-warning');
    if (msg) box.classList.add('o-alert', 'o-alert-' + type);
    box.setAttribute('role', type === 'danger' ? 'alert' : 'status');
    box.textContent = msg || '';
    return true;
  }
  return false;
}
function submitButtons(form) {
  const inside = [...form.querySelectorAll('button:not([type]), button[type="submit"], input[type="submit"]')];
  const outside = form.id ? $$(`button[form="${CSS.escape(form.id)}"]`) : [];
  return [...inside, ...outside];
}

async function submitAjax(form, submitter) {
  if (form.__oAjaxBusy) return;
  const mode = (form.getAttribute('data-o-ajax') || 'auto').toLowerCase();
  const method = (submitter?.getAttribute('formmethod') || form.getAttribute('data-o-ajax-method') || form.getAttribute('method') || 'POST').toUpperCase();
  const action = submitter?.getAttribute('formaction') || form.getAttribute('action') || location.href;
  let fd;
  try { fd = new FormData(form, submitter || undefined); } catch { fd = new FormData(form); }
  const hasFiles = [...fd.values()].some(v => isInst(v, File) && (v.name || v.size));
  const asJSON = mode === 'json' || (mode === 'auto' && !hasFiles && form.enctype !== 'multipart/form-data');
  const cfg = {
    method, headers: { 'X-Requested-With': 'XMLHttpRequest' },
    loader: form.hasAttribute('data-o-ajax-loader'), offline: form.hasAttribute('data-o-ajax-offline') ? 'queue' : false,
    retry: +form.getAttribute('data-o-ajax-retry') || 0, timeout: +form.getAttribute('data-o-ajax-timeout') || 0,
  };
  if (method === 'GET') cfg.params = formToObject(fd); else cfg.body = asJSON ? formToObject(fd) : fd;
  const before = emit(form, 'o-ajax-before', { config: cfg, form, submitter });
  if (before.defaultPrevented) return;
  const buttons = submitButtons(form);
  const prev = buttons.map(b => b.disabled);
  const busy = on => {
    form.__oAjaxBusy = on;
    form.classList.toggle('is-loading', on);
    form.toggleAttribute('aria-busy', on);
    buttons.forEach((b, i) => { b.disabled = on ? true : prev[i]; if (!on || b === submitter || buttons.length === 1) { b.classList.toggle('is-loading', on); b.toggleAttribute('aria-busy', on); } });
  };
  [...form.elements].forEach(clearFieldError);
  formMessage(form, '', 'info');
  busy(true);
  const ctl = new AbortController();
  form.__oAjaxCtl = ctl;
  try {
    const res = await O.http.request(action, { ...cfg, full: true, signal: ctl.signal });
    const data = res.data;
    if (res.queued) { const m = t('http.queued'); if (!formMessage(form, m, 'info')) httpToast(m, 'info'); announce(m); }
    else {
      const msg = form.getAttribute('data-o-ajax-toast');
      if (msg != null) { const m = msg || (isObj(data) && isStr(data.message) ? data.message : t('http.saved')); if (!formMessage(form, m, 'success')) httpToast(m, 'success'); announce(m); }
      const target = form.getAttribute('data-o-ajax-target');
      if (target && isStr(data)) { const el = $(target); if (el) el.innerHTML = form.hasAttribute('data-o-trusted') ? data : sanitize(data); }
    }
    emit(form, 'o-ajax-success', { data, response: res, form, queued: !!res.queued });
    if (form.hasAttribute('data-o-ajax-reset')) form.reset();
    const redirect = form.getAttribute('data-o-ajax-redirect');
    if (redirect != null && !res.queued) { const to = redirect || (isObj(data) && data.redirect); if (to) location.assign(to); }
  } catch (err) {
    if (err?.isAbort) return;
    const errors = extractErrors(err?.data);
    const ev = emit(form, 'o-ajax-error', { error: err, errors, status: err?.status || 0, form });
    if (!ev.defaultPrevented) {
      const unmatched = [];
      let first = null;
      if (errors) for (const [name, msg] of Object.entries(errors)) { const c = findControl(form, name); if (c) { markInvalid(c, msg); first = first || c; } else unmatched.push(msg); }
      const general = !errors || unmatched.length ? (unmatched.join(' ') || err?.userMessage || t('http.error')) : (err?.userMessage || t('http.status.422'));
      if (!formMessage(form, general, 'danger') && (!errors || unmatched.length)) httpToast(general, 'danger');
      announce(general, 'assertive');
      if (first) { try { first.focus(); } catch {} }
    }
  } finally {
    if (form.__oAjaxCtl === ctl) form.__oAjaxCtl = null;
    busy(false);
  }
}

behavior('data-o-ajax', form => {
  if (form.tagName !== 'FORM') return;
  const offSubmit = on(form, 'submit', e => {
    if (e.defaultPrevented) return;
    e.preventDefault();
    if (form.noValidate && form.classList.contains('o-validate') && !form.checkValidity()) { form.reportValidity(); return; }
    submitAjax(form, e.submitter).catch(err => console.error('[Orion] ajax form', err));
  });
  const offInput = on(form, 'input change', e => clearFieldError(e.target.closest?.('[aria-invalid="true"]') || e.target));
  return () => { offSubmit(); offInput(); form.__oAjaxCtl?.abort(); };
});

/* ── data-o-load ───────────────────────────────────────────────────────── */
function __loadSkeleton(n) {
  return h('div', { class: 'o-load-skeleton', 'aria-hidden': 'true' }, Array.from({ length: n }, (_, i) => h('div', { class: cls('o-skeleton', i === 0 ? 'o-skeleton-title' : 'o-skeleton-text') })));
}
async function loadInto(target, url, o = {}) {
  target = $(target);
  if (!target || !url) return null;
  const opts = { swap: 'inner', skeleton: 3, trusted: false, select: null, quiet: false, ...o };
  if (emit(target, 'o-load-before', { url, options: opts }).defaultPrevented) return null;
  target.__oLoadCtl?.abort();
  const ctl = new AbortController();
  target.__oLoadCtl = ctl;
  const empty = !target.children.length && !target.textContent.trim();
  const hadSkeleton = empty && opts.skeleton > 0 && opts.swap === 'inner';
  target.setAttribute('aria-busy', 'true');
  target.classList.add('is-loading');
  if (hadSkeleton) target.replaceChildren(__loadSkeleton(opts.skeleton));
  else if (!opts.quiet && opts.swap === 'inner' && isFn(O.loading)) O.loading(target, true);
  try {
    const text = await O.http.get(url, { responseType: 'text', signal: ctl.signal, dedupe: false, headers: { Accept: 'text/html, */*;q=0.8', 'X-Requested-With': 'XMLHttpRequest' }, ...(opts.http || {}) });
    let out = String(text ?? '');
    if (opts.select) {
      const tpl = doc.createElement('template');
      tpl.innerHTML = out;
      out = [...tpl.content.querySelectorAll(opts.select)].map(n => n.outerHTML).join('');
    }
    const safe = opts.trusted ? out : sanitize(out);
    if (isFn(O.loading)) O.loading(target, false);
    if (opts.swap === 'append') target.insertAdjacentHTML('beforeend', safe);
    else if (opts.swap === 'prepend') target.insertAdjacentHTML('afterbegin', safe);
    else if (opts.swap === 'outer') { const f = frag(safe); const first = f.firstElementChild; target.replaceWith(f); if (first) emit(first, 'o-load', { url, html: safe }); return safe; }
    else target.innerHTML = safe;
    target.removeAttribute('data-o-load-error');
    target.setAttribute('data-o-loaded', new Date().toISOString());
    emit(target, 'o-load', { url, html: safe });
    if (opts.announce) announce(isStr(opts.announce) ? opts.announce : t('http.loaded'));
    return safe;
  } catch (err) {
    if (err?.isAbort) return null;
    target.setAttribute('data-o-load-error', String(err?.status || err?.code || 'error'));
    if (isFn(O.loading)) O.loading(target, false);
    if (hadSkeleton || (!target.children.length && !target.textContent.trim())) {
      const retry = h('button', { type: 'button', class: 'o-btn o-btn-sm' }, raw(String(icon('refresh'))), h('span', t('common.retry')));
      retry.addEventListener('click', () => loadInto(target, url, { ...opts, quiet: false }));
      target.replaceChildren(h('div', { class: 'o-empty o-empty-sm is-error o-load-error', role: 'alert' },
        h('div', { class: 'o-empty-icon' }, raw(String(icon('alert-triangle')))),
        h('p', { class: 'o-empty-text' }, t('http.loadFailed') + (err?.status ? ` (${err.status})` : '')),
        h('div', { class: 'o-empty-actions' }, retry)));
    }
    emit(target, 'o-load-error', { url, error: err });
    return null;
  } finally {
    if (target.__oLoadCtl === ctl) { target.__oLoadCtl = null; target.removeAttribute('aria-busy'); target.classList.remove('is-loading'); }
  }
}
function __parseTriggers(s) {
  return String(s).split(',').map(x => x.trim()).filter(Boolean).map(x => {
    const m = x.match(/^every\s+(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i);
    if (m) return { type: 'every', ms: +m[1] * ({ ms: 1, s: 1000, m: 60000, h: 3600000 }[(m[2] || 's').toLowerCase()]) };
    return { type: x.toLowerCase() };
  });
}

behavior('data-o-load', el => {
  const offs = [];
  let seen = false, timer = null, alive = true;
  const isTrigger = el.matches('a, button, [role="button"]');
  const opts = quiet => ({
    trusted: el.hasAttribute('data-o-trusted'), select: el.getAttribute('data-o-select'), swap: el.getAttribute('data-o-swap') || 'inner',
    skeleton: el.hasAttribute('data-o-skeleton') ? +el.getAttribute('data-o-skeleton') || 0 : 3, announce: el.hasAttribute('data-o-announce'), quiet,
  });
  const target = () => { const s = el.getAttribute('data-o-target'); return s ? $(s) : el; };
  const run = quiet => {
    const url = el.getAttribute('data-o-load');
    if (isTrigger) { el.classList.add('is-loading'); el.setAttribute('aria-busy', 'true'); }
    return loadInto(target(), url, opts(quiet)).finally(() => { if (isTrigger) { el.classList.remove('is-loading'); el.removeAttribute('aria-busy'); } });
  };
  for (const tr of __parseTriggers(el.getAttribute('data-o-trigger') || (isTrigger ? 'click' : 'load'))) {
    if (tr.type === 'load') queueMicrotask(() => alive && run(false));
    else if (tr.type === 'visible' || tr.type === 'revealed') offs.push(observeVisible(el, v => { if (v && !seen) { seen = true; run(false); } }, { rootMargin: '100px' }));
    else if (tr.type === 'every') {
      const tick = () => { timer = setTimeout(async () => { if (!alive) return; if (!doc.hidden && navigator.onLine !== false && !O.offline?.isOffline) await run(true); if (alive) tick(); }, tr.ms); };
      tick();
    } else offs.push(on(el, tr.type, e => { if (tr.type === 'click' || tr.type === 'submit') e.preventDefault(); run(false); }));
  }
  return () => { alive = false; clearTimeout(timer); offs.forEach(f => f()); target()?.__oLoadCtl?.abort(); };
});

O.http.load = loadInto;
O.http.formToObject = formToObject;
O.http.extractErrors = extractErrors;
O.http.submitForm = (form, submitter) => submitAjax($(form), submitter);
