/* <o-select> — searchable single / multiple select with chips, groups, icons & avatars, remote data,
 * infinite scroll, virtual scrolling (10k+ options), creatable tags and native form participation.
 *   <o-select name="fruit" placeholder="Pick one" clearable><option value="a">Apple</option>…</o-select>
 *   <o-select multiple options='[{"value":"1","label":"One","icon":"star","group":"A"}]'></o-select>
 *   <o-select tags name="labels"></o-select>                              free-form tags (multiple + creatable)
 *   el.source = async (query, { page, signal }) => ({ options: [...], hasMore: true });
 *   <o-select url="/api/users?q={q}&page={page}" fields='{"value":"id","label":"name"}'></o-select>
 *   (a url without {q} is fetched once, lazily, then filtered locally)
 * Events: o-change {value, option|options}, o-search {query}, o-open, o-close {reason}, o-create {value, label}
 *         (cancelable; listeners may rewrite detail.value / detail.label), o-load {query, page, options}, o-error {error}
 * Methods: open() close() toggle() clear(emit?) focus() setOptions(list) addOption(opt|list) removeOption(value)
 *          refresh() getOption(value); getters selectedOption, selectedOptions, query
 */
i18n.add('en', {
  select: {
    placeholder: 'Select…', search: 'Search…', noResults: 'No results found', noOptions: 'No options available',
    loading: 'Loading…', loadingMore: 'Loading more…', error: 'Could not load options', retry: 'Retry',
    create: 'Add “{label}”', selectAll: 'Select all', clearAll: 'Clear', clear: 'Clear selection', remove: 'Remove {label}',
    selected: '{count} selected', options: 'Options',
    max: { one: 'You can select only {count} item', other: 'You can select up to {count} items' },
    results: { zero: 'No results', one: '{count} result available', other: '{count} results available' },
    minChars: { one: 'Type at least {count} character to search', other: 'Type at least {count} characters to search' },
  },
});

const { normalize: normOpt, mediaHTML: optMedia, openPanel: openPickerPanel, syncLabel: syncPickerLabel, Remote: PickerRemote } = O.pickers;

class OSelect extends FormElement {
  static props = {
    ...FormElement.props,
    multiple: { type: Boolean, reflect: true },
    tags: { type: Boolean, reflect: true },
    options: { type: Array, default: () => [] },
    placeholder: String,
    searchable: Any,
    display: { type: String, default: 'chips' },
    clearable: Boolean,
    creatable: Boolean,
    max: Number,
    size: { type: String, reflect: true },
    source: Function,
    url: String,
    fields: Object,
    debounce: { type: Number, default: 250 },
    minChars: { type: Number, default: 0 },
    renderOption: Function,
    renderValue: Function,
    selectAll: { type: Boolean, default: true },
    hideSelected: Boolean,
    closeOnSelect: Any,
    virtualThreshold: { type: Number, default: 150 },
    texts: Object,
  };

  setup() {
    this._child = []; this._urlItems = []; this._created = []; this._known = new Map(); this._remoteBy = new Map();
    this._all = []; this._byValue = new Map(); this._query = ''; this._req = 0;
    this._remote = new PickerRemote(() => ({ source: this.source, url: this.url, fields: this.fields }));
    const listId = uid('select-list');
    this.control = h('div', { class: 'o-control o-select-control' });
    this.combo = h('div', { class: 'o-select-combo', role: 'combobox', tabindex: '0', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': listId });
    this.ph = h('span', { class: 'o-select-placeholder' });
    this.single = h('span', { class: 'o-select-single' });
    this.chips = h('span', { class: 'o-select-chips' });
    this.inline = h('input', { class: 'o-select-inline', type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-autocomplete': 'list', 'aria-controls': listId, 'aria-expanded': 'false' });
    this.combo.append(this.chips, this.single, this.ph, this.inline);
    this.clearBtn = h('button', { type: 'button', class: 'o-select-clear', tabindex: '-1' }, icon('x'));
    this.control.append(this.combo, h('span', { class: 'o-select-indicators' }, this.clearBtn, h('span', { class: 'o-spinner o-spinner-xs o-select-spinner', 'aria-hidden': 'true' }), h('span', { class: 'o-select-arrow' }, icon('chevron-down'))));
    this.append(this.control);

    this.panel = h('div', { class: 'o-floating o-select-panel', hidden: true });
    this.search = h('input', { class: 'o-select-search-input', type: 'text', role: 'combobox', autocomplete: 'off', spellcheck: 'false', 'aria-autocomplete': 'list', 'aria-expanded': 'true', 'aria-controls': listId });
    this.searchWrap = h('div', { class: 'o-select-search' }, icon('search'), this.search);
    this.actionsEl = h('div', { class: 'o-select-actions' },
      h('button', { type: 'button', class: 'o-btn o-btn-link o-btn-xs', 'data-act': 'all' }),
      h('span', { class: 'o-select-count' }),
      h('button', { type: 'button', class: 'o-btn o-btn-link o-btn-xs', 'data-act': 'none' }));
    this.listEl = h('div', { id: listId, class: 'o-select-list' });
    this.statusEl = h('div', { class: 'o-select-status', hidden: true });
    this.panel.append(this.searchWrap, this.actionsEl, this.listEl, this.statusEl);
    this.list = new O.Listbox(this.listEl, {
      isSelected: o => !o.create && this._selSet().has(o.value),
      isDisabled: o => !o.create && this._maxed() && !this._selSet().has(o.value),
      onPick: o => this._pick(o), onEnd: () => this._loadMore(),
      activeTarget: () => this._comboEl(),
      renderOption: (o, ctx) => (this.renderOption ? this.renderOption(o, ctx) : null),
    });

    on(this.control, 'click', e => {
      if (e.target.closest('.o-select-chip-remove, .o-select-clear') || this.isDisabled || this.readonly) return;
      if (this.tags) { this.inline.focus(); if (!this._ov && this._all.length) this.open(); return; }
      this.toggle();
    });
    on(this.control, 'mousedown', '.o-select-chip-remove, .o-select-clear', e => e.preventDefault());
    on(this.control, 'click', '.o-select-chip-remove', (e, b) => { if (!this.isDisabled && !this.readonly) this._remove(b.dataset.value); });
    on(this.clearBtn, 'click', () => { this.clear(true); this._comboEl().focus(); });
    on(this.control, 'keydown', e => this._keyCombo(e));
    on(this.inline, 'input', () => { this._renderValue(); if (!this._ov && this.inline.value.trim()) this.open(); if (this._ov) this._onQuery(this.inline.value); });
    on(this.inline, 'paste', e => {
      const txt = e.clipboardData?.getData('text') || '';
      if (!/[,;\n\t]/.test(txt)) return;
      e.preventDefault(); txt.split(/[,;\n\t]+/).map(s => s.trim()).filter(Boolean).forEach(s => this._create(s));
    });
    on(this.search, 'input', () => this._onQuery(this.search.value));
    on(this.search, 'keydown', e => this._keySearch(e));
    on(this.search, 'focus', () => this.list.syncTarget());
    on(this.combo, 'focus', () => this.list.syncTarget());
    on(this.actionsEl, 'click', '[data-act]', (e, b) => (b.dataset.act === 'all' ? this._selectAll() : this.setValue([])));
    on(this.statusEl, 'click', '[data-act="retry"]', () => { this._remote.clear(); this._load(this._query, 1); });
    on(this, 'click', e => { if (e.target === this) this.focus(); });           // <label for> activation
    on(this, 'focusout', e => { const r = e.relatedTarget; if (!r || (!this.contains(r) && !this.panel.contains(r))) { this._touched = true; this._syncInvalid(); } });
    on(this, 'invalid', () => { this._touched = true; this._syncInvalid(); });
    this._readChildren(true);
  }

  connected() {
    this._mo = new MutationObserver(muts => {
      const relevant = muts.some(m => {
        const tgt = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (!tgt || this.control.contains(tgt)) return false;
        if (m.type === 'childList') return [...m.addedNodes, ...m.removedNodes].some(n => n.localName === 'option' || n.localName === 'optgroup') || !!tgt.closest('option, optgroup');
        return !!tgt.closest('option, optgroup');
      });
      if (relevant) { this._readChildren(); this._rebuild(); this._renderValue(); if (this._ov) this._refresh(); }
    });
    this._mo.observe(this, { childList: true, subtree: true, attributes: true, characterData: true });
    syncPickerLabel(this, this.focusTarget);
    syncPickerLabel(this, this.listEl);
  }
  disconnected() { this.close(); this._mo?.disconnect(); clearTimeout(this._timer); this._remote.abort(); }

  update(changed) {
    const init = changed.has('init');
    if (init || changed.has('options') || changed.has('fields')) this._rebuild();
    if (init || changed.has('tags') || changed.has('multiple')) this._mode();
    if (init || changed.has('size')) { this.control.classList.toggle('o-control-sm', this.size === 'sm'); this.control.classList.toggle('o-control-lg', this.size === 'lg'); }
    if (init || changed.has('disabled') || changed.has('readonly')) {
      const off = this.isDisabled;
      this.control.classList.toggle('is-disabled', off);
      this.control.classList.toggle('is-readonly', !!this.readonly);
      this.combo.setAttribute('aria-disabled', String(off));
      if (this.readonly) this.combo.setAttribute('aria-readonly', 'true'); else this.combo.removeAttribute('aria-readonly');
      if (!this.tags) this.combo.tabIndex = off ? -1 : 0;
      this.inline.disabled = off; this.inline.readOnly = !!this.readonly;
      if (off || this.readonly) this.close();
    }
    if (changed.has('url') || changed.has('source')) { this._remote.clear(); this._urlLoaded = false; this._urlItems = []; this._rebuild(); }
    if (init || changed.has('locale') || changed.has('texts') || changed.has('placeholder')) {
      this.search.placeholder = this.t('select.search');
      this.search.setAttribute('aria-label', this.t('select.search'));
      this.clearBtn.setAttribute('aria-label', this.t('select.clear'));
      this.actionsEl.querySelector('[data-act=all]').textContent = this.t('select.selectAll');
      this.actionsEl.querySelector('[data-act=none]').textContent = this.t('select.clearAll');
      if (!this.combo.hasAttribute('aria-label') && !this.combo.hasAttribute('aria-labelledby') && !this.getAttribute('aria-label')) this.listEl.setAttribute('aria-label', this.placeholder || this.t('select.options'));
    }
    if (changed.has('value') && this._isUrlOnce() && !this._urlLoaded && this._vals().some(v => !this._opt(v))) this._fetchOnce();
    this._renderValue();
    if (this._ov) {
      if (changed.has('options') || changed.has('multiple') || changed.has('locale') || changed.has('url') || changed.has('source') || (changed.has('value') && this.hideSelected)) this._refresh();
      else if (changed.has('value') || changed.has('max')) { this.list.paint(); this._renderStatus(); }
    }
    this._syncInvalid();
  }

  /* ── data ─────────────────────────────────────────────────────────── */
  get _multi() { return this.multiple || this.tags; }
  get _creatable() { return this.creatable || this.tags; }
  _isRemote() { return isFn(this.source) || (!!this.url && this.url.includes('{q}')); }
  _isUrlOnce() { return !!this.url && !this.url.includes('{q}') && !isFn(this.source); }
  _readChildren(first) {
    const out = [], sel = [];
    const read = (el, group, gdis) => {
      const o = normOpt({ value: el.value, label: el.label || el.textContent.trim(), description: el.dataset.description, icon: el.dataset.icon, avatar: el.dataset.avatar, disabled: el.disabled || gdis, group });
      out.push(o);
      if (el.hasAttribute('selected')) sel.push(o.value);
    };
    for (const el of this.children) {
      if (el.localName === 'option') read(el, null, false);
      else if (el.localName === 'optgroup') for (const c of el.children) if (c.localName === 'option') read(c, el.label, el.disabled);
    }
    this._child = out;
    if (sel.length && !this._vals().length && !this._dirty) this.value = this._multi ? sel : sel[sel.length - 1];
    if (!first) this._rebuild();
  }
  _rebuild() {
    const f = this.fields;
    this._all = [...this._child, ...toArr(this.options).map(o => normOpt(o, f)), ...this._urlItems, ...this._created].filter(Boolean);
    this._byValue = new Map();
    for (const o of this._all) if (!this._byValue.has(o.value)) this._byValue.set(o.value, o);
  }
  _opt(v) { return this._byValue.get(v) || this._remoteBy.get(v) || this._known.get(v) || null; }
  _vals() {
    const v = this.value;
    if (this.__vc && this.__vc.src === v && this.__vc.multi === this._multi) return this.__vc.vals;
    let arr;
    if (v == null || v === '') arr = [];
    else if (isStr(v) && this._multi) { const s = v.trim(); arr = s.startsWith('[') ? toArr(parseJSON(s, [])) : s.split(',').map(x => x.trim()); }
    else arr = toArr(v);
    arr = arr.map(x => { if (isObj(x)) { const o = normOpt(x, this.fields); this._known.set(o.value, o); return o.value; } return x == null ? '' : String(x); }).filter(x => x !== '');
    if (!this._multi) arr = arr.slice(-1);
    this.__vc = { src: v, multi: this._multi, vals: arr, set: new Set(arr) };
    return arr;
  }
  _selSet() { this._vals(); return this.__vc.set; }
  _selOpts() { return this._vals().map(v => this._opt(v) || normOpt(v)); }
  _maxed() { return this._multi && this.max > 0 && this._vals().length >= this.max; }
  _searchable() {
    const s = this.searchable;
    if (s === true || s === '' || s === 'true') return true;
    if (s === false || s === 'false') return false;
    return this._isRemote() || this._creatable || this._all.length > 8 || (this._isUrlOnce() && this._all.length === 0);
  }
  _closeOnSelect() { const c = this.closeOnSelect; return c == null || c === '' ? !this._multi : c !== false && c !== 'false'; }
  isEmpty() { return this._vals().length === 0; }
  formValue() { const v = this._vals(); return this._multi ? v : (v[0] ?? null); }
  get selectedOptions() { return this._selOpts(); }
  get selectedOption() { return this._selOpts()[0] || null; }
  get query() { return this._query; }

  /* ── display ──────────────────────────────────────────────────────── */
  _mode() {
    const tags = this.tags;
    this.list.set({ multiple: this._multi });
    this.inline.hidden = !tags;
    this.control.classList.toggle('is-tags', tags);
    this.control.classList.toggle('is-multiple', this._multi);
    if (tags) { ['role', 'tabindex', 'aria-haspopup', 'aria-expanded', 'aria-controls'].forEach(a => this.combo.removeAttribute(a)); this.inline.setAttribute('role', 'combobox'); }
    else {
      this.inline.removeAttribute('role');
      Object.entries({ role: 'combobox', tabindex: this.isDisabled ? '-1' : '0', 'aria-haspopup': 'listbox', 'aria-expanded': String(!!this._ov), 'aria-controls': this.listEl.id }).forEach(([k, v]) => this.combo.setAttribute(k, v));
    }
    this.focusTarget = tags ? this.inline : this.combo;
    if (this.isConnected) syncPickerLabel(this, this.focusTarget);
  }
  _comboEl() { return this._ov && !this.searchWrap.hidden && doc.activeElement === this.search ? this.search : this.tags ? this.inline : this.combo; }
  _renderValue() {
    const opts = this._selOpts(), n = opts.length, ph = this.placeholder ?? this.t('select.placeholder');
    const chips = this._multi && (this.display !== 'count' || this.tags);
    this.control.classList.toggle('has-value', n > 0);
    if (chips) {
      const canRemove = !this.isDisabled && !this.readonly;
      patchList(this.chips, opts, o => o.value, o => this._chip(o, canRemove), (el, o) => this._fillChip(el, o, canRemove));
      this.single.hidden = true;
    } else {
      this.chips.replaceChildren();
      this.single.hidden = !n;
      if (n) {
        const o = opts[0];
        if (this._multi && n > 1) this.single.textContent = this.t('select.selected', { count: n });
        else {
          const c = this.renderValue ? this.renderValue(o, { chip: false }) : null;
          if (c instanceof Node) this.single.replaceChildren(c);
          else this.single.innerHTML = c != null ? String(c) : optMedia(o) + `<span class="o-select-label">${esc(o.label)}</span>`;
        }
      }
    }
    this.ph.textContent = ph;
    this.ph.hidden = n > 0 || this.tags;
    if (this.tags) this.inline.placeholder = n ? '' : ph;
    this.clearBtn.hidden = !(this.clearable && n && !this.isDisabled && !this.readonly);
  }
  _chip(o, canRemove) { const el = h('span', { class: 'o-chip o-select-chip' }); this._fillChip(el, o, canRemove); return el; }
  _fillChip(el, o, canRemove) {
    el.dataset.value = o.value;
    const c = this.renderValue ? this.renderValue(o, { chip: true }) : null;
    el.innerHTML = (c != null && !(c instanceof Node) ? String(c) : optMedia(o) + `<span>${esc(o.label)}</span>`) +
      (canRemove ? `<button type="button" class="o-chip-remove o-select-chip-remove" tabindex="-1" aria-hidden="true" data-value="${esc(o.value)}" title="${esc(this.t('select.remove', { label: o.label }))}"></button>` : '');
    if (c instanceof Node) el.prepend(c);
  }
  _syncInvalid() {
    const bad = !!(this._touched && this.validity && !this.validity.valid);
    this.control.classList.toggle('is-invalid', bad);
    if (bad) this.focusTarget?.setAttribute('aria-invalid', 'true'); else this.focusTarget?.removeAttribute('aria-invalid');
  }
  _syncValidity() { super._syncValidity(); if (this._setupDone) this._syncInvalid(); }

  /* ── open / close ─────────────────────────────────────────────────── */
  open() {
    if (this._ov || this.isDisabled || this.readonly || !this.isConnected) return;
    if (!this.emit('before-open')) return;
    const searchable = this._searchable() && !this.tags;
    this.searchWrap.hidden = !searchable;
    this.panel.classList.toggle('is-multiple', this._multi);
    this.panel.classList.toggle('is-tags', !!this.tags);
    this.panel.classList.toggle('o-select-panel-sm', this.size === 'sm');
    this._ov = openPickerPanel(this, this.panel, this.control, { sheet: !this.tags, onClose: reason => this._closed(reason) });
    this.classList.add('is-open'); this.control.classList.add('is-focused');
    this._comboEl().setAttribute('aria-expanded', 'true');
    this._query = '';
    this.search.value = '';
    if (this._isUrlOnce() && !this._urlLoaded) this._fetchOnce();
    if (this.tags) this._onQuery(this.inline.value, 'selected');
    else this._refresh('selected');
    const coarse = this.panel.classList.contains('is-sheet') && win.matchMedia?.('(pointer: coarse)').matches;
    if (searchable && !coarse) this.search.focus({ preventScroll: true });
    this.list.syncTarget();
    this.emit('open');
  }
  close(reason = 'api') { this._ov?.close(reason); }
  toggle() { this._ov ? this.close() : this.open(); }
  _closed(reason) {
    this._ov = null;
    clearTimeout(this._timer); this._remote.abort();
    this._loading = false; this.classList.remove('is-open', 'is-loading'); this.control.classList.remove('is-focused');
    [this.combo, this.inline].forEach(el => { if (el.getAttribute('role') === 'combobox') el.setAttribute('aria-expanded', 'false'); el.removeAttribute('aria-activedescendant'); });
    this.list.setActive(-1);
    this.emit('close', { reason });
  }

  /* ── searching & loading ──────────────────────────────────────────── */
  _refresh(active = 'keep') { this._onQuery(this.tags ? this.inline.value : this._query, active, true); }
  _onQuery(q, active = 'first', quiet = false) {
    q = String(q ?? '');
    const changed = q !== this._query;
    this._query = q;
    if (changed && !quiet) this.emit('search', { query: q });
    clearTimeout(this._timer);
    this._hint = '';
    if (this._isRemote()) {
      if (q.length < (this.minChars || 0)) {
        this._remote.abort(); this._loading = false; this._error = null;
        this._hint = this.t('select.minChars', { count: this.minChars });
        this.list.setItems(this._withCreate([], q), { query: q, active });
        return this._renderStatus();
      }
      const cached = this._rs && this._rs.query === q && !changed && quiet;
      if (cached) { this.list.setItems(this._withCreate(this._rs.items, q), { query: q, active, keepScroll: true }); return this._renderStatus(); }
      this._loading = true; this._error = null; this._page = 1; this._renderStatus();
      this._timer = setTimeout(() => this._load(q, 1), quiet || !changed ? 0 : this.debounce);
      return;
    }
    const run = () => {
      this.list.setItems(this._withCreate(this._local(q), q), { query: q, active, keepScroll: active === 'keep' });
      this._renderStatus();
      if (q && !quiet) this._announce();
    };
    if (this._all.length > 3000 && changed) this._timer = setTimeout(run, 80); else run();
  }
  _local(q) {
    let list = this._all;
    if (this.hideSelected && this._multi) { const s = this._selSet(); list = list.filter(o => !s.has(o.value)); }
    if (!q.trim()) return list;
    const key = o => (o.description ? o.label + ' ' + o.description : o.label);
    return list.some(o => o.group != null && o.group !== '') ? list.filter(o => fuzzy(q, key(o))) : fuzzySearch(list, q, key);
  }
  _withCreate(list, q) {
    const text = String(q || '').trim();
    if (!this._creatable || !text) return list;
    const lo = text.toLowerCase();
    if (list.some(o => o.label.toLowerCase() === lo) || this._all.some(o => o.label.toLowerCase() === lo) || this._vals().some(v => v.toLowerCase() === lo)) return list;
    return [{ __opt: true, create: true, value: ' create', label: text, createLabel: this.t('select.create', { label: text }) }, ...list];
  }
  async _load(q, page) {
    const id = ++this._req;
    this._loading = true; this._error = null; this._page = page;
    this.classList.add('is-loading'); this.listEl.setAttribute('aria-busy', 'true');
    this._renderStatus();
    try {
      const res = await this._remote.load(q, page);
      if (id !== this._req) return;
      const items = page > 1 && this._rs?.query === q ? [...this._rs.items, ...res.options] : res.options;
      this._rs = { query: q, page, hasMore: res.hasMore, items };
      this._remoteBy = new Map(items.map(o => [o.value, o]));
      this._loading = false;
      if (this._ov) this.list.setItems(this._withCreate(items, q), { query: q, active: page > 1 ? 'keep' : (q ? 'first' : 'selected'), keepScroll: page > 1 });
      this.emit('load', { query: q, page, options: res.options });
      if (page === 1 && q) this._announce();
    } catch (e) {
      if (e === PickerRemote.ABORT || id !== this._req) return;
      this._error = e;
      this.emit('error', { error: e, query: q });
    } finally {
      if (id === this._req) { this._loading = false; this.classList.remove('is-loading'); this.listEl.removeAttribute('aria-busy'); this._renderStatus(); }
    }
  }
  _loadMore() { if (this._isRemote() && this._ov && this._rs?.hasMore && !this._loading && this._rs.query === this._query) this._load(this._query, this._rs.page + 1); }
  async _fetchOnce() {
    if (this._urlLoading) return;
    this._urlLoading = true; this._loading = true; this._error = null; this._page = 1;
    this.classList.add('is-loading'); this._renderStatus();
    try {
      const r = await fetch(this.url, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const res = await r.json();
      const list = Array.isArray(res) ? res : toArr(res?.options || res?.items || res?.results || res?.data || res?.rows);
      this._urlItems = list.map(o => normOpt(o, this.fields)).filter(Boolean);
      this._urlLoaded = true;
      this._rebuild(); this._renderValue();
      this.emit('load', { query: '', page: 1, options: this._urlItems });
    } catch (e) { this._error = e; this.emit('error', { error: e, query: '' }); }
    finally { this._urlLoading = false; this._loading = false; this.classList.remove('is-loading'); if (this._ov) this._refresh(this._error ? 'keep' : 'selected'); }
  }
  _announce() {
    clearTimeout(this._annT);
    this._annT = setTimeout(() => { if (this._ov) announce(this.t('select.results', { count: this.list.count })); }, 450);
  }
  _renderStatus() {
    const n = this.list.count;
    let html = '';
    if (this._error) html = `<div class="o-select-msg is-error">${icon('alert-circle')}<span>${esc(this.t('select.error'))}</span><button type="button" class="o-btn o-btn-xs o-btn-soft-danger" data-act="retry">${esc(this.t('select.retry'))}</button></div>`;
    else if (this._loading) html = `<div class="o-select-msg"><span class="o-spinner o-spinner-xs" aria-hidden="true"></span><span>${esc(this.t(this._page > 1 ? 'select.loadingMore' : 'select.loading'))}</span></div>`;
    else if (this._hint) html = `<div class="o-select-msg">${icon('search')}<span>${esc(this._hint)}</span></div>`;
    else if (!n) html = `<div class="o-select-msg is-empty">${esc(this.t(this._query ? 'select.noResults' : 'select.noOptions'))}</div>`;
    else if (this._maxed()) html = `<div class="o-select-msg is-info">${icon('info')}<span>${esc(this.t('select.max', { count: this.max }))}</span></div>`;
    this.statusEl.innerHTML = html;
    this.statusEl.hidden = !html;
    this.statusEl.classList.toggle('is-footer', n > 0);
    const acts = this._multi && this.selectAll && !this.tags && !this._isRemote() && n > 0;
    this.actionsEl.hidden = !acts;
    if (acts) this.actionsEl.querySelector('.o-select-count').textContent = this._vals().length ? this.t('select.selected', { count: this._vals().length }) : '';
  }

  /* ── selection ────────────────────────────────────────────────────── */
  setValue(v, opts = {}) {
    this._dirty = true;
    this.value = v; this._syncForm();
    if (opts.silent) return;
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    if (opts.inputOnly) return;
    this.dispatchEvent(new Event('change', { bubbles: true }));
    this.emit('change', this._multi ? { value: this.value, options: this._selOpts() } : { value: this.value, option: this.selectedOption });
  }
  _pick(o) {
    if (o.create) return this._create(o.label);
    if (o.disabled) return;
    this._known.set(o.value, o);
    if (this._multi) {
      const vals = [...this._vals()], i = vals.indexOf(o.value);
      if (i >= 0) vals.splice(i, 1);
      else if (this._maxed()) return announce(this.t('select.max', { count: this.max }));
      else vals.push(o.value);
      this.setValue(vals);
      if (this.tags && this.inline.value) { this.inline.value = ''; this._onQuery(''); }
      if (this._closeOnSelect()) this.close();
    } else {
      if (this._vals()[0] !== o.value) this.setValue(o.value);
      this.close();
      this.combo.focus({ preventScroll: true });
    }
  }
  _create(text) {
    const label = String(text || '').trim();
    if (!label) return;
    const detail = { value: label, label };
    if (!this.emit('create', detail)) return;
    const o = normOpt({ value: detail.value, label: detail.label ?? detail.value });
    if (!this._byValue.has(o.value)) { this._created.push(o); this._rebuild(); }
    this._known.set(o.value, o);
    if (this.tags) { this.inline.value = ''; this._query = ''; }
    else if (this.search.value) { this.search.value = ''; this._query = ''; }
    if (this._multi) {
      const vals = this._vals();
      if (!vals.includes(o.value) && !this._maxed()) this.setValue([...vals, o.value]);
      if (this._ov) (this.tags && !this._all.length ? this.close() : this._refresh('first'));
    } else { this.setValue(o.value); this.close(); this.combo.focus({ preventScroll: true }); }
  }
  _remove(v) { this.setValue(this._vals().filter(x => x !== v)); }
  _selectAll() {
    const set = new Set(this._vals());
    for (const o of this.list.options) {
      if (o.create || o.disabled) continue;
      if (this.max > 0 && set.size >= this.max) break;
      set.add(o.value); this._known.set(o.value, o);
    }
    this.setValue([...set]);
  }
  _typeahead(ch) {
    const now = Date.now();
    this._ta = (now - (this._taT || 0) > 700 ? '' : this._ta || '') + ch.toLowerCase();
    this._taT = now;
    const list = this._ov ? this.list.options.filter(o => !o.disabled) : this._all.filter(o => !o.disabled);
    if (!list.length) return;
    const curV = this._ov ? this.list.activeOption?.value : this._vals()[0];
    const cur = list.findIndex(o => o.value === curV);
    const start = this._ta.length === 1 ? cur + 1 : Math.max(cur, 0);
    for (let n = 0; n < list.length; n++) {
      const o = list[(start + n) % list.length];
      if (!o.label.toLowerCase().startsWith(this._ta)) continue;
      if (this._ov) this.list.setActive(this.list.rows.findIndex(r => r.opt === o));
      else if (!this._multi && o.value !== curV) { this._known.set(o.value, o); this.setValue(o.value); }
      return;
    }
  }

  /* ── keyboard ─────────────────────────────────────────────────────── */
  _keyCombo(e) {
    if (this.isDisabled || e.isComposing || e.target.closest('.o-select-clear')) return;
    const k = e.key, open = !!this._ov, inl = e.target === this.inline;
    if (this.readonly) return;
    if (open && this.list.handleKey(e)) return;
    if (k === 'ArrowDown' || k === 'ArrowUp') { if (!open) { e.preventDefault(); this.open(); } return; }
    if (!inl && (k === 'Enter' || k === ' ')) {
      e.preventDefault();
      if (open && this.list.activeOption) this._pick(this.list.activeOption); else if (open) this.close(); else this.open();
      return;
    }
    if (!inl && (k === 'Home' || k === 'End')) { e.preventDefault(); if (!open) this.open(); k === 'Home' ? this.list.first() : this.list.last(); return; }
    if (k === 'Backspace' || k === 'Delete') {
      if (inl && this.inline.value) return;
      const vals = this._vals();
      if (!vals.length) return;
      if (this._multi) { e.preventDefault(); this._remove(vals[vals.length - 1]); }
      else if (this.clearable) { e.preventDefault(); this.clear(true); }
      return;
    }
    if (inl) {
      if ((k === 'Enter' || k === ',' || k === ';') && this.inline.value.trim()) { e.preventDefault(); this._create(this.inline.value); }
      else if (k === 'Escape' && this.inline.value) { e.preventDefault(); this.inline.value = ''; this._onQuery(''); this._renderValue(); }
      else if (k === 'Tab' && open) this.close('tab');
      return;
    }
    if (k === 'Tab') { if (open) this.close('tab'); return; }
    if (k.length === 1 && k !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (this._searchable()) {
        e.preventDefault();
        if (!open) this.open();
        this.search.focus({ preventScroll: true });
        this.search.value += k;
        this._onQuery(this.search.value);
      } else this._typeahead(k);
    }
  }
  _keySearch(e) {
    if (e.isComposing) return;
    if (this.list.handleKey(e)) return;
    const k = e.key;
    if (k === 'Escape' && this.search.value) { e.preventDefault(); this.search.value = ''; this._onQuery(''); }
    else if (k === 'Tab') { this.close('tab'); this.combo.focus({ preventScroll: true }); }
    else if (k === 'Enter') e.preventDefault();
    else if (k === 'Backspace' && !this.search.value && this._multi) { const v = this._vals(); if (v.length) { e.preventDefault(); this._remove(v[v.length - 1]); } }
  }

  /* ── public API ───────────────────────────────────────────────────── */
  clear(emitEvents = false) { const empty = this._multi ? [] : null; if (emitEvents) this.setValue(empty); else { this.value = empty; this._syncForm(); } }
  setOptions(list) { this.options = toArr(list); return this; }
  addOption(o) { this.options = [...toArr(this.options), ...(Array.isArray(o) ? o : [o])]; return this; }
  removeOption(value) {
    const v = String(value), f = this.fields;
    this.options = toArr(this.options).filter(o => normOpt(o, f)?.value !== v);
    this._created = this._created.filter(o => o.value !== v);
    this._rebuild(); this.requestUpdate('options');
    return this;
  }
  getOption(value) { return this._opt(String(value)); }
  refresh() {
    this._readChildren(); this._remote.clear(); this._rs = null;
    if (this._isUrlOnce()) { this._urlLoaded = false; this._urlItems = []; this._rebuild(); if (this._ov || this._vals().length) this._fetchOnce(); }
    this._renderValue();
    if (this._ov) this._refresh();
    return this;
  }
  formResetCallback() { this._dirty = false; super.formResetCallback(); }
}
define('o-select', OSelect);
O.Select = OSelect;
