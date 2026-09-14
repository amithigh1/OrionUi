// @deps select
/* <o-autocomplete> — text input with suggestions (typeahead): local items or async source, highlighted matches,
 * groups, templates, inline (ghost) completion, recent searches, free text or strict mode.
 *   <o-autocomplete name="city" items='["Paris","Penang","Perth"]' placeholder="City"></o-autocomplete>
 *   el.source = async (query, { signal }) => [{ value, label, description, group, icon, avatar }]
 *   <o-autocomplete url="/api/search?q={q}" strict inline recent min-chars="2" icon="search"></o-autocomplete>
 * value: the typed text (free mode) or the picked item's value (item.value ?? label). In `strict` mode only
 *        picked items are accepted (leaving the field reverts unmatched text).
 * Events: o-input {query}, o-select {item, value}, o-change {value, item}, o-open, o-close {reason}
 * Methods: open() close() clear(emit?) focus() search(query) clearRecent(); getters item, query, items (normalized)
 */
i18n.add('en', {
  autocomplete: {
    noResults: 'No matches found', loading: 'Searching…', error: 'Search failed', retry: 'Retry',
    recent: 'Recent searches', clearRecent: 'Clear', clear: 'Clear', suggestions: 'Suggestions',
    results: { zero: 'No suggestions', one: '{count} suggestion available', other: '{count} suggestions available' },
    completion: 'Press Tab to complete “{label}”',
  },
});

const { normalize: acNorm, openPanel: acOpen, syncLabel: acLabel, Remote: AcRemote } = O.pickers;

class OAutocomplete extends FormElement {
  static props = {
    ...FormElement.props,
    value: { type: String, default: '' },
    items: { type: Array, default: () => [] },
    source: Function,
    url: String,
    fields: Object,
    minChars: { type: Number, default: 1 },
    debounce: { type: Number, default: 200 },
    limit: { type: Number, default: 10 },
    strict: Boolean,
    inline: Boolean,
    recent: Boolean,
    recentKey: String,
    recentMax: { type: Number, default: 5 },
    openOnFocus: Boolean,
    placeholder: String,
    icon: String,
    clearable: { type: Boolean, default: true },
    size: { type: String, reflect: true },
    renderItem: Function,
    texts: Object,
  };

  setup() {
    this._q = ''; this._item = null; this._req = 0; this._results = [];
    this._remote = new AcRemote(() => ({ source: this.source, url: this.url, fields: this.fields }));
    const listId = uid('ac-list');
    this.control = h('div', { class: 'o-control o-ac-control' });
    this.lead = h('span', { class: 'o-ac-icon', 'aria-hidden': 'true' });
    this.input = h('input', { class: 'o-ac-input', type: 'text', dir: 'auto', role: 'combobox', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': listId });
    this.ghostTyped = h('span', { class: 'o-ac-ghost-typed' });
    this.ghostRest = h('span', { class: 'o-ac-ghost-rest' });
    this.ghost = h('span', { class: 'o-ac-ghost', 'aria-hidden': 'true' }, this.ghostTyped, this.ghostRest);
    this.clearBtn = h('button', { type: 'button', class: 'o-select-clear o-ac-clear', tabindex: '-1', hidden: true }, icon('x'));
    this.control.append(this.lead, h('span', { class: 'o-ac-field' }, this.ghost, this.input),
      h('span', { class: 'o-select-indicators' }, h('span', { class: 'o-spinner o-spinner-xs o-ac-spinner', 'aria-hidden': 'true' }), this.clearBtn));
    this.append(this.control);
    this.hint = h('span', { class: 'o-sr-only', id: uid('ac-hint') });
    this.append(this.hint);

    this.panel = h('div', { class: 'o-floating o-ac-panel', hidden: true });
    this.head = h('div', { class: 'o-ac-head', hidden: true }, h('span', { class: 'o-ac-head-title' }), h('button', { type: 'button', class: 'o-btn o-btn-link o-btn-xs', 'data-act': 'clear-recent' }));
    this.listEl = h('div', { id: listId, class: 'o-ac-list' });
    this.statusEl = h('div', { class: 'o-select-status', hidden: true });
    this.panel.append(this.head, this.listEl, this.statusEl);
    this.list = new O.Listbox(this.listEl, {
      tick: false, activeTarget: this.input, isSelected: () => false,
      onPick: o => this._pick(o), onActive: () => this._ghost(),
      renderOption: (o, ctx) => (!o.recent && this.renderItem ? this.renderItem(o.raw ?? o, ctx) : null),
    });

    on(this.input, 'input', e => this._onInput(e));
    on(this.input, 'keydown', e => this._key(e));
    on(this.input, 'focus', () => { this._focusVal = this.value; if (this.openOnFocus || (this.recent && !this.input.value)) this._suggest(); });
    on(this.input, 'blur', () => this._hideGhost());
    on(this.input, 'click', () => { if (!this._ov && (this.openOnFocus || this.input.value.length >= this.minChars)) this._suggest(); });
    on(this.clearBtn, 'mousedown', e => e.preventDefault());
    on(this.clearBtn, 'click', () => { this.clear(true); this.input.focus(); });
    on(this.head, 'click', '[data-act="clear-recent"]', () => { this.clearRecent(); this.close(); this.input.focus(); });
    on(this.statusEl, 'click', '[data-act="retry"]', () => { this._remote.clear(); this._search(this._q, true); });
    on(this, 'focusout', e => { const r = e.relatedTarget; if (!r || (!this.contains(r) && !this.panel.contains(r))) this._blurred(); });
    on(this, 'invalid', () => { this._touched = true; this._syncInvalid(); });
    on(this, 'click', e => { if (e.target === this) this.input.focus(); });
    this.focusTarget = this.input;
  }
  connected() { acLabel(this, this.input); acLabel(this, this.listEl); }
  disconnected() { this.close(); clearTimeout(this._timer); this._remote.abort(); }

  update(changed) {
    const init = changed.has('init');
    if (init || changed.has('items') || changed.has('fields')) this._items = toArr(this.items).map(o => acNorm(o, this.fields)).filter(Boolean);
    if (init || changed.has('placeholder')) this.input.placeholder = this.placeholder || '';
    if (init || changed.has('icon')) { this.lead.innerHTML = this.icon ? String(icon(this.icon)) : ''; this.lead.hidden = !this.icon; this.control.classList.toggle('has-icon', !!this.icon); }
    if (init || changed.has('inline')) this.input.setAttribute('aria-autocomplete', this.inline ? 'both' : 'list');
    if (init || changed.has('size')) { this.control.classList.toggle('o-control-sm', this.size === 'sm'); this.control.classList.toggle('o-control-lg', this.size === 'lg'); }
    if (init || changed.has('disabled') || changed.has('readonly')) {
      this.input.disabled = this.isDisabled; this.input.readOnly = !!this.readonly;
      this.control.classList.toggle('is-disabled', this.isDisabled);
      if (this.isDisabled || this.readonly) this.close();
    }
    if (init || changed.has('locale') || changed.has('texts')) {
      this.clearBtn.setAttribute('aria-label', this.t('autocomplete.clear'));
      this.head.querySelector('.o-ac-head-title').textContent = this.t('autocomplete.recent');
      this.head.querySelector('button').textContent = this.t('autocomplete.clearRecent');
      if (!this.getAttribute('aria-label') && !this.getAttribute('aria-labelledby')) this.listEl.setAttribute('aria-label', this.t('autocomplete.suggestions'));
    }
    if ((init || changed.has('value') || changed.has('items')) && this.value !== this._userValue) {
      const v = this.value ?? '';
      const it = v === '' ? null : (this._item && String(this._item.value) === String(v) ? this._item : this._items.find(o => o.value === String(v)));
      this._item = this._picked = it || null;
      const text = it ? it.label : String(v);
      if (this.input.value !== text) this.input.value = text;
      this._q = this.input.value;
    }
    this.clearBtn.hidden = !(this.clearable && this.input.value && !this.isDisabled && !this.readonly);
    this._syncInvalid();
  }

  get item() { return this._item ? (this._item.raw ?? this._item) : null; }
  get query() { return this._q; }
  isEmpty() { return this.value == null || this.value === ''; }
  getValidity() {
    if (this.strict && this.input && this.input.value && !this._item) return { flags: { badInput: true }, message: t('validation.invalid') };
    return null;
  }
  setValue(v, opts = {}) {
    this._userValue = v;
    this.value = v; this._syncForm();
    if (opts.silent) return;
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    if (opts.inputOnly) return;
    this._focusVal = v;
    this.dispatchEvent(new Event('change', { bubbles: true }));
    this.emit('change', { value: this.value, item: this.item });
  }
  _syncInvalid() {
    const bad = !!(this._touched && this.validity && !this.validity.valid);
    this.control.classList.toggle('is-invalid', bad);
    if (bad) this.input.setAttribute('aria-invalid', 'true'); else this.input.removeAttribute('aria-invalid');
  }
  _syncValidity() { super._syncValidity(); if (this._setupDone) this._syncInvalid(); }

  /* ── input & searching ────────────────────────────────────────────── */
  _onInput(e) {
    const q = this.input.value;
    this._q = q;
    this._inserting = !!e.inputType && e.inputType.startsWith('insert');
    if (this._item && q !== this._item.label) this._item = null;
    if (!this.strict) this.setValue(q, { inputOnly: true });
    else this._syncForm();
    this.clearBtn.hidden = !(this.clearable && q && !this.isDisabled);
    this.emit('input', { query: q });
    this._suggest();
  }
  /** Show suggestions for the current text (or recent searches when empty). */
  _suggest() {
    if (this.isDisabled || this.readonly) return;
    const q = this.input.value;
    clearTimeout(this._timer);
    if (!q && this.recent && this._recentList().length) return this._showRecent();
    if (q.length < this.minChars && !(this.openOnFocus && !q && this.minChars <= 0)) { this._remote.abort(); this._loading = false; return this.close(); }
    this._search(q);
  }
  search(q) { this.input.value = String(q ?? ''); this._q = this.input.value; this._search(this._q, true); if (!this._ov) this.open(); }
  _isRemote() { return isFn(this.source) || !!this.url; }
  _search(q, now = false) {
    this.head.hidden = true;
    if (!this._isRemote()) return this._show(this._local(q), q);
    this._loading = true; this._error = null; this.classList.add('is-loading');
    if (!this._ov && this.isConnected) this.open();
    this._status();
    this._timer = setTimeout(() => this._load(q), now ? 0 : this.debounce);
  }
  _local(q) {
    const key = o => (o.description ? o.label + ' ' + o.description : o.label);
    const lim = this.limit > 0 ? this.limit : Infinity;
    if (!q) return this._items.slice(0, lim);
    if (this._items.some(o => o.group != null && o.group !== '')) return this._items.filter(o => fuzzy(q, key(o))).slice(0, lim);
    return fuzzySearch(this._items, q, key, lim);
  }
  async _load(q) {
    const id = ++this._req;
    try {
      const res = await this._remote.load(q, 1);
      if (id !== this._req) return;
      this._loading = false;
      this._show(res.options, q);
    } catch (e) {
      if (e === AcRemote.ABORT || id !== this._req) return;
      this._loading = false; this._error = e; this._show([], q);
    } finally { if (id === this._req) { this.classList.remove('is-loading'); this._status(); } }
  }
  _show(list, q) {
    if (q !== this.input.value) return;
    this._results = list;
    if (!this._ov) { if (!list.length && !q) return; this.open(); }
    this.panel.classList.remove('is-recent');
    this.list.setItems(list, { query: q, active: this.inline || this.strict ? 'first' : 'none' });
    this._status();
    this._ghost();
    clearTimeout(this._annT);
    this._annT = setTimeout(() => { if (this._ov && q) announce(this.t('autocomplete.results', { count: list.length })); }, 500);
  }
  _status() {
    let html = '';
    if (this._error) html = `<div class="o-select-msg is-error">${icon('alert-circle')}<span>${esc(this.t('autocomplete.error'))}</span><button type="button" class="o-btn o-btn-xs o-btn-soft-danger" data-act="retry">${esc(this.t('autocomplete.retry'))}</button></div>`;
    else if (this._loading && !this.list.count) html = `<div class="o-select-msg"><span class="o-spinner o-spinner-xs" aria-hidden="true"></span><span>${esc(this.t('autocomplete.loading'))}</span></div>`;
    else if (!this._loading && !this.list.count && this.input.value) html = `<div class="o-select-msg is-empty">${icon('search')}<span>${esc(this.t('autocomplete.noResults'))}</span></div>`;
    this.statusEl.innerHTML = html;
    this.statusEl.hidden = !html;
    this.statusEl.classList.toggle('is-footer', this.list.count > 0);
    this.listEl.toggleAttribute('aria-busy', !!this._loading);
  }

  /* ── inline completion (ghost text) ───────────────────────────────── */
  _completion() {
    if (!this.inline || !this._ov || !this._inserting || this.panel.classList.contains('is-recent')) return null;
    const q = this.input.value, lo = q.toLowerCase();
    if (!q || this.input.selectionStart !== q.length || this.input.selectionEnd !== q.length) return null;
    const act = this.list.activeOption;
    const cand = act && act.label.toLowerCase().startsWith(lo) ? act : this.list.options.find(o => !o.disabled && o.label.toLowerCase().startsWith(lo));
    return cand && cand.label.length > q.length ? cand : null;
  }
  _ghost() {
    const c = this._completion();
    if (!c || this.input.scrollWidth > this.input.clientWidth + 1) return this._hideGhost();
    this._ghostItem = c;
    // `dir=auto` on the input resolves its bidi direction from the typed text; mirror it onto the
    // overlay so the (flex-ordered) typed/rest spans line up with the real caret instead of the page's dir.
    this.ghost.style.direction = getComputedStyle(this.input).direction;
    this.ghostTyped.textContent = this.input.value;
    this.ghostRest.textContent = c.label.slice(this.input.value.length);
    this.ghost.hidden = false;
    this.hint.textContent = this.t('autocomplete.completion', { label: c.label });
    this.input.setAttribute('aria-describedby', this.hint.id);
  }
  _hideGhost() { this._ghostItem = null; this.ghost.hidden = true; this.ghostRest.textContent = ''; this.input.removeAttribute('aria-describedby'); }
  _accept() { const c = this._ghostItem; if (!c) return false; this._hideGhost(); this._pick(c); return true; }

  /* ── recent searches ──────────────────────────────────────────────── */
  _recentKey() { return 'orion:autocomplete:' + (this.recentKey || this.id || this.name || 'default'); }
  _recentList() { return toArr(ls.get(this._recentKey(), [])).filter(isStr); }
  _remember(text) {
    if (!this.recent || !(text = String(text || '').trim())) return;
    const list = [text, ...this._recentList().filter(x => x.toLowerCase() !== text.toLowerCase())].slice(0, Math.max(1, this.recentMax));
    ls.set(this._recentKey(), list);
  }
  clearRecent() { ls.del(this._recentKey()); }
  _showRecent() {
    const list = this._recentList().map(s => ({ __opt: true, value: s, label: s, icon: 'clock', recent: true }));
    if (!this._ov) this.open();
    this.head.hidden = false;
    this.panel.classList.add('is-recent');
    this._error = null; this._loading = false;
    this.list.setItems(list, { query: '', active: 'none' });
    this._status();
    this._hideGhost();
  }

  /* ── open / close / pick ──────────────────────────────────────────── */
  open() {
    if (this._ov || this.isDisabled || this.readonly || !this.isConnected) return;
    if (!this.emit('before-open')) return;
    this._ov = acOpen(this, this.panel, this.control, { sheet: false, returnFocus: false, onClose: reason => this._closed(reason) });
    this.classList.add('is-open');
    this.input.setAttribute('aria-expanded', 'true');
    this.emit('open');
  }
  close(reason = 'api') { this._ov?.close(reason); }
  _closed(reason) {
    this._ov = null;
    clearTimeout(this._timer); this._remote.abort(); this._loading = false; this.classList.remove('is-open', 'is-loading');
    this.input.setAttribute('aria-expanded', 'false');
    this.list.setActive(-1);
    this._hideGhost();
    this.emit('close', { reason });
  }
  _pick(o) {
    if (o.recent) {
      this.input.value = o.label; this._q = o.label;
      if (this.strict) { this._inserting = false; return this._search(o.label, true); }
      this._remember(o.label);
      this.close();
      this.emit('select', { item: { label: o.label, recent: true }, value: o.label });
      return this.setValue(o.label);
    }
    this._item = this._picked = o;
    this.input.value = o.label; this._q = o.label;
    this.close();
    this._remember(o.label);
    const v = o.raw != null && isObj(o.raw) && o.raw.value == null && !(this.fields && this.fields.value) ? o.label : o.value;
    this.emit('select', { item: o.raw ?? o, value: v });
    this.setValue(v);
    this.clearBtn.hidden = !this.clearable;
  }
  _commitFree() {
    const text = this.input.value;
    if (this.strict) {
      const lo = text.trim().toLowerCase();
      const m = lo && (this._results.find(o => o.label.toLowerCase() === lo) || this._items.find(o => o.label.toLowerCase() === lo));
      if (m) return this._pick(m);
      return false;
    }
    this._remember(text);
    if (this._focusVal !== text) this.setValue(text);
    return true;
  }
  _blurred() {
    this._touched = true;
    this.close('blur');
    if (this.strict) {
      if (!this._item && this.input.value) {
        const lo = this.input.value.trim().toLowerCase();
        const m = this._results.find(o => o.label.toLowerCase() === lo) || this._items.find(o => o.label.toLowerCase() === lo);
        if (m) this._pick(m);
        else { this._item = this._picked || null; this.input.value = this._item ? this._item.label : ''; this._q = this.input.value; if (!this._item && this.value !== '' && this.value != null) this.setValue(''); }
      }
    } else if (this._focusVal !== undefined && this._focusVal !== this.value) this.setValue(this.value);
    this._syncForm();
  }
  clear(emitEvents = false) {
    this._item = this._picked = null; this.input.value = ''; this._q = ''; this.clearBtn.hidden = true; this.close();
    if (emitEvents) this.setValue(''); else { this.value = ''; this._syncForm(); }
  }

  _key(e) {
    if (e.isComposing || this.isDisabled || this.readonly) return;
    const k = e.key, open = !!this._ov;
    if ((k === 'Tab' && !e.shiftKey) || ((k === 'ArrowRight' || k === 'End') && this._ghostItem && this.input.selectionStart === this.input.value.length)) {
      if (this._ghostItem) { e.preventDefault(); this._accept(); return; }
    }
    if (k === 'ArrowDown' && !open) { e.preventDefault(); this._inserting = false; if (this.input.value.length >= this.minChars || this.recent || this.openOnFocus) this._suggest(); return; }
    if (open && this.list.handleKey(e)) { if (k !== 'Enter') this._hideGhost(); return; }
    if (k === 'Enter') { if (open) e.preventDefault(); this.close(); if (this._commitFree() === false && this.strict) e.preventDefault(); return; }
    if (k === 'Escape') {
      if (open) { this._hideGhost(); return; }           // the overlay manager closes the panel
      if (this.input.value) { e.preventDefault(); this.clear(true); }
      return;
    }
    if (k === 'Tab' && open) this.close('tab');
  }
}
define('o-autocomplete', OAutocomplete);
O.Autocomplete = OAutocomplete;
