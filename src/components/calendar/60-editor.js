/* ============================================================================
 * calendar: dialogs — modal wrapper (Orion.modal when available, else a built-in
 * dialog on core overlays), event details popover, create / edit dialog,
 * recurring-scope chooser and delete confirmation.
 * ========================================================================== */

/** calModal(cal, { title, content, buttons:[{ text, variant, value, onClick() -> false keeps open, autofocus }], size }) -> Promise<value> */
function calModal(cal, opts) {
  if (isFn(O.modal) && cal.builtinDialogs !== true) {
    try {
      const m = O.modal({
        title: opts.title, content: opts.content, size: opts.size || 'md', scrollable: true, fullscreen: 'sm', className: 'o-calendar-dlg',
        buttons: opts.buttons.map(b => ({ text: b.text, variant: b.variant, autofocus: b.autofocus, className: b.className,
          onClick: () => { const r = b.onClick ? b.onClick() : undefined; if (r === false) return false; return b.value !== undefined ? b.value : r; } })),
      });
      if (m && m.result && isFn(m.result.then)) return m.result;
    } catch (e) { console.warn('[Orion] calendar: Orion.modal failed, using the built-in dialog', e); }
  }
  return new Promise(resolve => {
    const tid = uid('cal-dlg');
    let result, ov = null;
    const close = (v, reason) => { result = v; ov?.close(reason || 'api'); };
    const panel = h('div', { class: ['o-calendar-dialog', opts.size && 'is-' + opts.size], role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': tid, tabindex: '-1' },
      h('div', { class: 'o-calendar-dialog-head' }, h('h2', { class: 'o-calendar-dialog-title', id: tid }, opts.title),
        h('button', { type: 'button', class: 'o-btn-close', 'aria-label': t('common.close'), onClick: () => close(undefined, 'close') })),
      h('div', { class: 'o-calendar-dialog-body' }, opts.content),
      h('div', { class: 'o-calendar-dialog-foot' }, opts.buttons.map(b => h('button', {
        type: 'button', class: ['o-btn', b.variant && 'o-btn-' + b.variant, b.className], 'data-autofocus': b.autofocus ? '' : null,
        onClick: () => { const r = b.onClick ? b.onClick() : undefined; if (r === false) return; close(b.value !== undefined ? b.value : r, 'button'); },
      }, b.text))));
    const backdrop = h('div', { class: 'o-calendar-dialog-backdrop', onClick: () => close(undefined, 'backdrop') });
    const wrap = h('div', { class: 'o-calendar-dialog-wrap' }, backdrop, panel);
    portal(wrap, cal);
    ov = overlays.open({ el: wrap, owner: cal, trap: true, lockScroll: true, modal: true, outside: false, onClose: () => { wrap.remove(); resolve(result); } });
    animate(backdrop, 'fadeIn', { duration: 150 });
    animate(panel, 'zoomIn', { duration: 180 });
    (panel.querySelector('.o-calendar-dialog-body [data-autofocus], .o-calendar-dialog-body input:not([type=hidden]), [data-autofocus]') || panel).focus({ preventScroll: true });
  });
}
/** 'this' | 'following' | 'all' | undefined */
function calScope(cal, kind, { following = true } = {}) {
  const name = uid('cal-scope');
  const opts = [['this', cal.t('calendar.scopeThis')], following && ['following', cal.t('calendar.scopeFollowing')], ['all', cal.t('calendar.scopeAll')]].filter(Boolean);
  const box = h('div', { class: 'o-calendar-scope', role: 'radiogroup', 'aria-label': cal.t(kind === 'delete' ? 'calendar.scopeDeleteTitle' : 'calendar.scopeEditTitle') },
    opts.map(([v, l], i) => h('label', { class: 'o-check' }, h('input', { type: 'radio', name, value: v, checked: i === 0, 'data-autofocus': i === 0 ? '' : null }), h('span', null, l))));
  return calModal(cal, {
    title: cal.t(kind === 'delete' ? 'calendar.scopeDeleteTitle' : 'calendar.scopeEditTitle'), content: box, size: 'sm',
    buttons: [{ text: cal.t('calendar.cancel'), variant: 'ghost' }, { text: cal.t('calendar.ok'), variant: kind === 'delete' ? 'danger' : 'primary', onClick: () => box.querySelector('input:checked')?.value || 'this' }],
  });
}
function calConfirmDelete(cal, ev) {
  return calModal(cal, {
    title: cal.t('calendar.deleteTitle'), size: 'sm', content: h('p', { class: 'o-calendar-confirm-text' }, cal.t('calendar.deleteText', { title: ev.title || cal.t('calendar.untitled') })),
    buttons: [{ text: cal.t('calendar.cancel'), variant: 'ghost' }, { text: cal.t('calendar.delete'), variant: 'danger', value: true, autofocus: true }],
  });
}

/* ── details popover ────────────────────────────────────────────────── */
function calDetails(cal, o, anchor) {
  cal._pop?.close('api');
  const ev = o.ev, loc = cal._loc, can = cal._canEdit(ev), tid = uid('cal-det');
  let when1, when2 = '';
  if (ev.allDay) {
    const last = calD.add(o.end, -1);
    when1 = calD.same(o.start, last) ? calF(o.start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, loc) : calFmtRange(o.start, last, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }, loc);
    when2 = cal.t('calendar.allDay');
  } else if (calD.same(o.start, new Date(+o.end - 1))) {
    when1 = calF(o.start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, loc);
    when2 = calTimeText(cal, o, false);
  } else when1 = calFmtRange(o.start, o.end, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: cal._h12 }, loc);
  const row = (ic, ...content) => h('div', { class: 'o-calendar-det-row' }, h('span', { class: 'o-calendar-det-ic', 'aria-hidden': 'true' }, calIcon(ic)), h('div', { class: 'o-calendar-det-val' }, ...content));
  const people = toArr(ev.attendees).map(a => (isObj(a) ? a : { name: String(a) })).filter(a => a.name || a.email);
  const res = ev.resourceId != null ? toArr(cal.resources).find(r => String(r.id) === ev.resourceId) : null;
  const safeUrl = ev.url && /^(https?:|mailto:|\/|\.|#)/i.test(String(ev.url).trim()) ? String(ev.url).trim() : null;
  const btn = (txt, cls, fn, ic) => h('button', { type: 'button', class: ['o-btn o-btn-sm', cls], onClick: fn }, ic ? icon(ic) : null, h('span', null, txt));
  cal._pop = calFloat(cal, anchor, panel => {
    calPaint(panel, ev, cal.eventColor);
    panel.setAttribute('aria-labelledby', tid);
    return [
      h('div', { class: 'o-calendar-det-head' },
        h('span', { class: 'o-calendar-det-swatch', 'aria-hidden': 'true' }),
        h('h3', { class: 'o-calendar-det-title', id: tid }, ev.title || cal.t('calendar.untitled')),
        h('button', { type: 'button', class: 'o-btn-close o-btn-close-sm', 'aria-label': cal.t('calendar.close'), onClick: () => cal._pop?.close('api') })),
      h('div', { class: 'o-calendar-det-body' },
        row('clock', h('div', null, when1), when2 ? h('div', { class: 'o-calendar-det-sub' }, when2) : null),
        o.occ || ev.rrule ? row('repeat', rrDescribe(ev.rrule, { dtstart: ev.start, locale: loc })) : null,
        res ? row('columns', res.title ?? res.id) : null,
        ev.location ? row('map-pin', ev.location) : null,
        people.length ? row('users', h('ul', { class: 'o-calendar-det-people' }, people.map(p => h('li', null,
          customElements.get('o-avatar') ? h('o-avatar', { name: p.name || p.email, size: 'xs' }) : null, h('span', null, p.name || p.email))))) : null,
        ev.description ? row('align-left', h('div', { class: 'o-calendar-det-desc' }, String(ev.description))) : null,
        safeUrl ? row('external-link', h('a', { href: safeUrl, target: '_blank', rel: 'noopener noreferrer' }, cal.t('calendar.openLink'))) : null),
      can ? h('div', { class: 'o-calendar-det-foot' },
        btn(cal.t('calendar.delete'), 'o-btn-ghost o-calendar-det-del', () => { cal._pop?.close('api'); cal._deleteFlow(o); }, 'trash'),
        btn(cal.t('calendar.edit'), 'o-btn-soft-primary', () => { cal._pop?.close('api'); cal._editFlow(o); }, 'edit')) : null,
    ];
  }, { cls: 'o-calendar-det', label: ev.title, onClose: () => { cal._pop = null; cal._setSel(null); } });
}

/* ── create / edit dialog ───────────────────────────────────────────── */
const CAL_SWATCHES = ['primary', 'info', 'success', 'warning', 'danger', 'secondary', 'chart-5', 'chart-7'];
/** Resolves { action: 'save', data } | { action: 'delete' } | undefined */
function calEditor(cal, init, { mode = 'create' } = {}) {
  const id = uid('cal-ed'), loc = cal._loc;
  const allDay = !!init.allDay, s = init.start, e = init.end;
  const endShown = allDay ? calD.add(e, -1) : e;
  const title = h('input', { class: 'o-input', id: id + '-t', value: init.title || '', placeholder: cal.t('calendar.titlePh'), 'data-autofocus': '', autocomplete: 'off', required: true });
  const adBox = h('input', { type: 'checkbox', id: id + '-ad', checked: allDay });
  const sD = calDateField(calD.key(s), { 'aria-label': cal.t('calendar.start') }), sT = calTimeField(calTime(s, false), { 'aria-label': cal.t('calendar.start') }, cal._snap);
  const eD = calDateField(calD.key(endShown), { 'aria-label': cal.t('calendar.end') }), eT = calTimeField(calTime(e, false), { 'aria-label': cal.t('calendar.end') }, cal._snap);
  const rr = h('o-recurrence-editor', { class: 'o-calendar-ed-rr' });
  rr.start = calD.key(s); rr.weekStart = cal._ws; rr.locale = cal.locale || null; rr.value = init.rrule ? rrToString(init.rrule) : '';
  const color = init.color && !CAL_SWATCHES.includes(init.color) ? init.color : null;
  const sw = h('div', { class: 'o-calendar-swatches', role: 'radiogroup', 'aria-label': cal.t('calendar.color') },
    [...CAL_SWATCHES, color].filter(Boolean).map(c => {
      const b = h('label', { class: 'o-calendar-swatch', title: c }, h('input', { type: 'radio', name: id + '-c', value: c, checked: (init.color || cal.eventColor || 'primary') === c, 'aria-label': c }), h('span', { 'aria-hidden': 'true' }));
      b.style.setProperty('--ev', calColor(c));
      return b;
    }));
  const resList = toArr(cal.resources).filter(isObj);
  const resSel = resList.length ? h('select', { class: 'o-select', id: id + '-r' }, h('option', { value: '' }, '—'), resList.map(r => h('option', { value: String(r.id), selected: String(r.id) === String(init.resourceId ?? '') }, r.title ?? r.id))) : null;
  const locIn = h('input', { class: 'o-input', id: id + '-l', value: init.location || '', autocomplete: 'off' });
  const desc = h('textarea', { class: 'o-textarea', id: id + '-d', rows: 3 }, init.description || '');
  const err = h('div', { class: 'o-calendar-ed-err', role: 'alert' });
  const field = (label, forId, ...ctl) => h('div', { class: 'o-field o-calendar-ed-f' }, h('label', { class: 'o-label', for: forId }, label), ...ctl);
  const timeRow = (lbl, dF, tF) => h('div', { class: 'o-calendar-ed-when' }, h('span', { class: 'o-label' }, lbl), h('div', { class: 'o-calendar-ed-dt' }, dF.el, tF.el));
  const form = h('form', { class: 'o-calendar-editor', novalidate: true },
    field(cal.t('calendar.title'), id + '-t', title),
    h('label', { class: 'o-switch o-calendar-ed-ad' }, adBox, h('span', null, cal.t('calendar.allDay'))),
    h('div', { class: 'o-calendar-ed-times' }, timeRow(cal.t('calendar.start'), sD, sT), timeRow(cal.t('calendar.end'), eD, eT)),
    init.hideRepeat ? null : h('div', { class: 'o-field o-calendar-ed-f' }, rr),
    h('div', { class: 'o-field o-calendar-ed-f' }, h('span', { class: 'o-label' }, cal.t('calendar.color')), sw),
    resSel ? field(cal.t('calendar.resource'), id + '-r', resSel) : null,
    field(cal.t('calendar.location'), id + '-l', locIn),
    field(cal.t('calendar.description'), id + '-d', desc),
    err);
  const syncAD = () => { form.classList.toggle('is-allday', adBox.checked); [sT.el, eT.el].forEach(x => { x.hidden = adBox.checked; }); };
  syncAD();
  adBox.addEventListener('change', syncAD);
  const read = () => {
    const ad = adBox.checked, sd = date.parse(sD.get()), ed = date.parse(eD.get());
    if (!sd || !ed) return null;
    let start, end;
    if (ad) { start = calD.sod(sd); end = calD.add(calD.sod(ed), 1); }
    else { start = date.setTime(sd, sT.get() || '09:00'); end = date.setTime(ed, eT.get() || '10:00'); }
    return { start, end, allDay: ad };
  };
  let last = read();
  const onStart = () => {  // keep the duration when the start moves
    const cur = read();
    if (!cur || !last) { last = cur; return; }
    if (+cur.start !== +last.start) {
      const dur = +last.end - +last.start, ne = cur.allDay ? calD.add(cur.start, Math.max(1, calD.days(last.start, last.end))) : new Date(+cur.start + dur);
      eD.set(calD.key(cur.allDay ? calD.add(ne, -1) : ne)); eT.set(calTime(ne, false));
      rr.start = calD.key(cur.start);
    }
    last = read();
  };
  [sD.el, sT.el].forEach(x => x.addEventListener('change', onStart));
  [eD.el, eT.el].forEach(x => x.addEventListener('change', () => { last = read(); }));
  const save = () => {
    err.textContent = '';
    title.classList.remove('is-invalid');
    if (!title.value.trim() && cal.requireTitle !== false) { err.textContent = cal.t('calendar.titleRequired'); title.classList.add('is-invalid'); title.focus(); return false; }
    const w = read();
    if (!w || +w.end <= +w.start) { err.textContent = cal.t('calendar.endBeforeStart'); return false; }
    return { action: 'save', data: {
      title: title.value.trim(), ...w, rrule: init.hideRepeat ? init.rrule || null : rr.value || null,
      color: sw.querySelector('input:checked')?.value || init.color || null, location: locIn.value.trim() || null,
      description: desc.value.trim() || null, resourceId: resSel ? (resSel.value || null) : init.resourceId ?? null,
    } };
  };
  form.addEventListener('submit', ev => { ev.preventDefault(); form.closest('.o-calendar-dialog, dialog, .o-modal-panel')?.querySelector('.o-calendar-ed-save')?.click(); });
  form.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target === title) { ev.preventDefault(); form.closest('.o-calendar-dialog, dialog, .o-modal, .o-modal-panel')?.querySelector('.o-calendar-ed-save')?.click(); } });
  const buttons = [];
  if (mode === 'edit' && init.canDelete !== false) buttons.push({ text: cal.t('calendar.delete'), variant: 'ghost', className: 'o-calendar-ed-delete', value: { action: 'delete' } });
  buttons.push({ text: cal.t('calendar.cancel'), variant: 'ghost' }, { text: cal.t('calendar.save'), variant: 'primary', className: 'o-calendar-ed-save', onClick: save });
  return calModal(cal, { title: cal.t(mode === 'edit' ? 'calendar.editEvent' : 'calendar.newEvent'), content: form, buttons, size: 'md' });
}
