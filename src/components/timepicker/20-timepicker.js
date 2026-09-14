/* <o-timepicker> — time input with a dropdown list of times or a scroll-spinner columns panel (or `inline` columns).
 *   <o-timepicker name="start" value="09:30" step="15" min="08:00" max="18:00"></o-timepicker>
 *   <o-timepicker view="columns" seconds hour12></o-timepicker>        <o-timepicker inline></o-timepicker>
 * value: 'HH:mm' ('HH:mm:ss' with `seconds`). Typed input accepts '2:30 pm', '1430', '14.30', '2p'.
 * 12/24h follows the locale (date.uses12h) unless `hour12` is set (hour12="false" forces 24h).
 * Keyboard (input): ↑/↓ change the segment under the caret, Alt+↓ / F4 open the panel, Enter commits typed text;
 *   list open: ↑/↓ PageUp/PageDown move, Enter picks, Esc closes; columns: ↑/↓ value, ←/→ column, digits jump, Enter done.
 * Events: o-change {value, time}, o-open, o-close {reason}. Methods: open() close() toggle() clear(emit?) focus(); getter time
 */
i18n.add('en', {
  timepicker: {
    choose: 'Choose time', now: 'Now', clear: 'Clear', done: 'Done', times: 'Times',
    invalid: 'Enter a valid time', min: 'Time must be {min} or later', max: 'Time must be {max} or earlier',
  },
});

const { openPanel: tpOpen, syncLabel: tpLabel, time: TU } = O.pickers;

class OTimepicker extends FormElement {
  static props = {
    ...FormElement.props,
    value: { type: String, default: '' },
    hour12: Any,
    step: Number,
    seconds: Boolean,
    min: String,
    max: String,
    view: { type: String, default: 'list' },
    inline: { type: Boolean, reflect: true },
    placeholder: String,
    clearable: { type: Boolean, default: true },
    size: { type: String, reflect: true },
    texts: Object,
  };

  setup() {
    const pid = uid('tp-panel');
    this.control = h('div', { class: 'o-control o-tp-control' });
    this.input = h('input', { class: 'o-tp-input', type: 'text', role: 'combobox', autocomplete: 'off', spellcheck: 'false', 'aria-expanded': 'false', 'aria-controls': pid });
    this.clearBtn = h('button', { type: 'button', class: 'o-select-clear', tabindex: '-1', hidden: true }, icon('x'));
    this.btn = h('button', { type: 'button', class: 'o-tp-btn', tabindex: '-1' }, icon('clock'));
    this.control.append(this.input, h('span', { class: 'o-select-indicators' }, this.clearBtn, this.btn));
    this.inlineEl = h('div', { class: 'o-tp-inline' });
    this.append(this.control, this.inlineEl);

    this.panel = h('div', { class: 'o-floating o-tp-panel', id: pid, hidden: true });
    this.listEl = h('div', { class: 'o-tp-list' });
    this.colsWrap = h('div', { class: 'o-tp-cols' });
    this.nowBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', 'data-act': 'now' });
    this.doneBtn = h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm', 'data-act': 'done' });
    this.foot = h('div', { class: 'o-tp-foot' }, this.nowBtn, this.doneBtn);
    this.panel.append(this.listEl, this.colsWrap, this.foot);
    this.list = new O.Listbox(this.listEl, { tick: true, activeTarget: this.input, isSelected: o => o.value === this._iso(), onPick: o => { this.setValue(o.value); this.close(); this.input.focus(); } });
    const colsOpts = { onChange: tm => this.setValue(TU.toISO(tm, this.seconds)), onEnter: () => { this.close(); this.input.focus(); } };
    this.cols = new O.TimeColumns(this.colsWrap, colsOpts);
    this.inlineCols = new O.TimeColumns(this.inlineEl, colsOpts);

    on(this.control, 'click', e => {
      if (this.isDisabled || this.readonly || e.target.closest('.o-select-clear')) return;
      if (e.target.closest('.o-tp-btn')) { this.input.focus(); this._ov ? this.close() : this.open(true); return; }
      if (!this._ov) this.open();
    });
    on(this.clearBtn, 'mousedown', e => e.preventDefault());
    on(this.clearBtn, 'click', () => { this.clear(true); this.input.focus(); });
    on(this.input, 'keydown', e => this._key(e));
    on(this.input, 'input', () => {
      this._typing = true;
      const tm = TU.parse(this.input.value, this.locale);
      if (tm && this._ov && this.panel.dataset.mode === 'list') this._activateNear(tm);
    });
    on(this.foot, 'click', '[data-act]', (e, b) => {
      if (b.dataset.act === 'now') { const d = new Date(), st = this.step || 1; this.setValue(TU.toISO({ h: d.getHours(), m: Math.floor(d.getMinutes() / st) * st % 60, s: this.seconds ? d.getSeconds() : 0 }, this.seconds)); }
      else { this.close(); this.input.focus(); }
    });
    on(this, 'focusout', e => { const r = e.relatedTarget; if (!r || (!this.contains(r) && !this.panel.contains(r))) { this._commitTyped(); this._touched = true; this._syncInvalid(); } });
    on(this, 'invalid', () => { this._touched = true; this._syncInvalid(); });
    on(this, 'click', e => { if (e.target === this) this.focus(); });
    this.focusTarget = this.input;
  }
  connected() { tpLabel(this, this.input); tpLabel(this, this.listEl); tpLabel(this, this.inlineEl); }
  disconnected() { this.close(); }

  get locale() { return i18n.locale; }
  _h12() { const v = this.hour12; if (v === true || v === '' || v === 'true') return true; if (v === false || v === 'false') return false; return date.uses12h(); }
  _fmt(tm) { return TU.format(tm, { hour12: this._h12(), seconds: this.seconds }); }
  _iso() { const tm = TU.fromISO(this.value); return tm ? TU.toISO(tm, this.seconds) : ''; }
  get time() { return TU.fromISO(this.value); }

  update(changed) {
    const init = changed.has('init');
    if (init || changed.has('inline')) { this.control.hidden = !!this.inline; this.inlineEl.hidden = !this.inline; this.focusTarget = this.inline ? this.inlineEl.firstElementChild : this.input; if (this.inline) this.close(); }
    if (init || ['hour12', 'seconds', 'step', 'min', 'max', 'locale'].some(k => changed.has(k))) {
      const o = { hour12: this._h12(), seconds: this.seconds, step: this.step || 1, min: this.min, max: this.max, locale: i18n.locale };
      this.cols.configure(o); this.inlineCols.configure(o);
      if (this.inline) this.focusTarget = this.inlineEl.firstElementChild;
    }
    if (init || changed.has('locale') || changed.has('texts') || changed.has('placeholder') || changed.has('hour12') || changed.has('seconds')) {
      this.input.placeholder = this.placeholder ?? 'hh:mm' + (this.seconds ? ':ss' : '') + (this._h12() ? ' ' + TU.periods(i18n.locale).am : '');
      this.btn.setAttribute('aria-label', this.t('timepicker.choose'));
      this.clearBtn.setAttribute('aria-label', this.t('timepicker.clear'));
      this.nowBtn.textContent = this.t('timepicker.now');
      this.doneBtn.textContent = this.t('timepicker.done');
      if (!this.getAttribute('aria-label') && !this.getAttribute('aria-labelledby')) this.listEl.setAttribute('aria-label', this.t('timepicker.times'));
    }
    if (init || changed.has('size')) { this.control.classList.toggle('o-control-sm', this.size === 'sm'); this.control.classList.toggle('o-control-lg', this.size === 'lg'); }
    if (init || changed.has('disabled') || changed.has('readonly')) {
      this.input.disabled = this.isDisabled; this.input.readOnly = !!this.readonly;
      this.control.classList.toggle('is-disabled', this.isDisabled);
      this.inlineEl.classList.toggle('is-disabled', this.isDisabled);
      this.inlineEl.inert = this.isDisabled || !!this.readonly;
      if (this.isDisabled || this.readonly) this.close();
    }
    if (init || changed.has('value') || changed.has('locale') || changed.has('hour12') || changed.has('seconds')) {
      const tm = TU.fromISO(this.value);
      const text = tm ? this._fmt(tm) : '';
      if (!this._typing || changed.has('value')) { if (this.input.value !== text) this.input.value = text; this._typing = false; this._bad = false; }
      this.cols.set(tm, !!this._ov); this.inlineCols.set(tm);
      if (this._ov && this.panel.dataset.mode === 'list') this.list.paint();
    }
    this.clearBtn.hidden = !(this.clearable && this.value && !this.isDisabled && !this.readonly);
    this._syncInvalid();
  }

  /* ── validation ───────────────────────────────────────────────────── */
  getValidity() {
    if (this._bad) return { flags: { badInput: true }, message: this.t('timepicker.invalid') };
    const s = TU.secs(TU.fromISO(this.value));
    if (s == null) return null;
    const lo = TU.fromISO(this.min), hi = TU.fromISO(this.max);
    if (lo && s < TU.secs(lo)) return { flags: { rangeUnderflow: true }, message: this.t('timepicker.min', { min: this._fmt(lo) }) };
    if (hi && s > TU.secs(hi)) return { flags: { rangeOverflow: true }, message: this.t('timepicker.max', { max: this._fmt(hi) }) };
    return null;
  }
  _syncInvalid() {
    const bad = !!(this._touched && this.validity && !this.validity.valid);
    this.control.classList.toggle('is-invalid', bad);
    if (bad) this.input.setAttribute('aria-invalid', 'true'); else this.input.removeAttribute('aria-invalid');
  }
  _syncValidity() { super._syncValidity(); if (this._setupDone) this._syncInvalid(); }
  setValue(v, opts = {}) {
    this._bad = false; this._typing = false;
    if (v === this.value && !opts.force) { this.requestUpdate('value'); return; }
    this.value = v; this._syncForm();
    if (opts.silent) return;
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    this.dispatchEvent(new Event('change', { bubbles: true }));
    this.emit('change', { value: this.value, time: this.time });
  }
  _commitTyped() {
    if (!this._typing) return true;
    const txt = this.input.value.trim();
    if (!txt) { this._typing = false; if (this.value) this.setValue(''); return true; }
    const tm = TU.parse(txt, i18n.locale);
    if (!tm) { this._bad = true; this._syncForm(); this._touched = true; this._syncInvalid(); return false; }
    this.setValue(TU.toISO(tm, this.seconds));
    this.requestUpdate('value');
    return true;
  }

  /* ── panel ────────────────────────────────────────────────────────── */
  open(focusPanel = false) {
    if (this._ov || this.isDisabled || this.readonly || this.inline || !this.isConnected) return;
    if (!this.emit('before-open')) return;
    const mode = this.panel.dataset.mode = this.view === 'columns' ? 'columns' : 'list';
    this.listEl.hidden = mode !== 'list'; this.colsWrap.hidden = this.foot.hidden = mode !== 'columns';
    this.input.setAttribute('aria-haspopup', mode === 'list' ? 'listbox' : 'dialog');
    this.panel.setAttribute('role', mode === 'list' ? 'presentation' : 'dialog');
    if (mode === 'columns') this.panel.setAttribute('aria-label', this.t('timepicker.choose')); else this.panel.removeAttribute('aria-label');
    this._ov = tpOpen(this, this.panel, this.control, { sheet: false, matchWidth: mode === 'list' ? 'min' : false, onClose: r => this._closed(r) });
    this.classList.add('is-open'); this.control.classList.add('is-focused');
    this.input.setAttribute('aria-expanded', 'true');
    if (mode === 'list') {
      this.list.setItems(this._items(), { active: 'none' });
      this._activateNear(TU.parse(this.input.value, i18n.locale) || TU.fromISO(this.value) || (d => ({ h: d.getHours(), m: d.getMinutes(), s: 0 }))(new Date()), true);
    } else {
      this.cols.set(TU.fromISO(this.value)); this.cols.reveal();
      if (focusPanel) this.cols.focus('h');
    }
    this.emit('open');
  }
  close(reason = 'api') { this._ov?.close(reason); }
  toggle() { this._ov ? this.close() : this.open(); }
  _closed(reason) {
    this._ov = null;
    this.classList.remove('is-open'); this.control.classList.remove('is-focused');
    this.input.setAttribute('aria-expanded', 'false'); this.input.removeAttribute('aria-activedescendant');
    this.emit('close', { reason });
  }
  _items() {
    const st = Math.max(1, this.step || 15) * 60, lo = TU.secs(TU.fromISO(this.min)) ?? 0, hi = TU.secs(TU.fromISO(this.max)) ?? 86399;
    const out = [];
    for (let s = 0; s < 86400; s += st) {
      if (s < lo || s > hi) continue;
      const tm = { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: 0 };
      out.push({ __opt: true, value: TU.toISO(tm, this.seconds), label: this._fmt(tm), tm });
    }
    return out;
  }
  _activateNear(tm, center = false) {
    const s = TU.secs(tm);
    const rows = this.list.rows;
    let i = rows.findIndex(r => r.opt && TU.secs(r.opt.tm) >= s);
    if (i < 0) i = rows.length - 1;
    this.list.setActive(i, { center });
  }

  /* ── keyboard ─────────────────────────────────────────────────────── */
  _key(e) {
    if (e.isComposing || this.isDisabled) return;
    const k = e.key, open = !!this._ov, list = open && this.panel.dataset.mode === 'list';
    if ((k === 'ArrowDown' && e.altKey) || k === 'F4') { e.preventDefault(); open ? this.close() : this.open(true); return; }
    if (this.readonly) return;
    if (list && this.list.handleKey(e)) return;
    if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); this._step(k === 'ArrowUp' ? 1 : -1); return; }
    if (k === 'Enter') { if (this._typing) { e.preventDefault(); this._commitTyped(); } if (open) { e.preventDefault(); this.close(); } return; }
    if (k === 'Tab' && open) this.close('tab');
  }
  /** Step the segment under the caret (hour / minute / second / day period). */
  _step(dir) {
    const h12 = this._h12();
    let tm = TU.parse(this.input.value, i18n.locale) || TU.fromISO(this.value);
    const caret = this.input.selectionStart ?? 0;
    let seg = 'hour';
    if (tm) {
      const parts = TU.parts(tm, { hour12: h12, seconds: this.seconds });
      const hit = parts.find(p => p.type !== 'literal' && caret >= p.start && caret <= p.end) || [...parts].reverse().find(p => p.type !== 'literal' && p.end <= caret);
      if (hit) seg = hit.type;
    } else { const d = new Date(); tm = { h: d.getHours(), m: 0, s: 0 }; dir = 0; }
    const st = Math.max(1, this.step || 1);
    if (seg === 'hour') tm.h = (tm.h + dir + 24) % 24;
    else if (seg === 'minute') tm.m = dir > 0 ? (Math.floor(tm.m / st) * st + st) % 60 : ((Math.ceil(tm.m / st) * st - st) + 60) % 60;
    else if (seg === 'second') tm.s = (tm.s + dir + 60) % 60;
    else if (seg === 'dayPeriod') tm.h = (tm.h + 12) % 24;
    if (!this.seconds) tm.s = 0;
    this.setValue(TU.toISO(tm, this.seconds));
    this.flush();
    const p = TU.parts(tm, { hour12: h12, seconds: this.seconds }).find(x => x.type === seg);
    if (p) try { this.input.setSelectionRange(p.start, p.end); } catch {}
  }

  clear(emitEvents = false) { this._bad = false; this._typing = false; this.input.value = ''; if (emitEvents) this.setValue(''); else { this.value = ''; this._syncForm(); } }
  focus(o) { (this.inline ? this.inlineEl.querySelector('.o-tc-col') : this.input)?.focus(o); }
}
define('o-timepicker', OTimepicker);
O.Timepicker = OTimepicker;
