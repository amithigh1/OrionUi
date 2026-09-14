/* ============================================================================
 * <o-facets> — faceted filter panel.
 *   Standalone:  <o-facets items='[...]' groups='[...]'>          -> .filtered, .filter(items)
 *   Bound:       <o-facets for="#table" groups='[...]'>           drives an <o-datatable>'s .filters
 *                (the datatable's own filterOptions()/facetCounts()/filters stay the source of truth;
 *                 this element never re-implements its filtering, only drives it — see README)
 *
 * Group shape: { key, label, type: 'checkbox'|'radio'|'range'|'date-range'|'search',
 *                collapsed?, options?, step?, searchKeys? }
 *   - checkbox: multi-select over distinct values of `key` (auto-derived from `items` unless `options` given)
 *   - radio: single-select; each option may be `{ value, label }` (exact match), `{ value, label, min, max }`
 *            (numeric bucket, e.g. a price range) or `{ value, label, test(item) }` (fully custom)
 *   - range: numeric `{ min, max }` over `key`
 *   - date-range: `{ from, to }` (ISO date strings) over `key`
 *   - search: free-text substring match over `key` (or `searchKeys`, an array of dot-paths)
 *
 * value: { [groupKey]: selection } — selection shape matches the group type (string[] / string / {min,max} / {from,to}).
 * Events: o-change { value, filtered }  (filtered is null when bound to a table — read the table's own rows/total instead)
 * ========================================================================== */
i18n.add('en', {
  facets: {
    title: 'Filters', clearAll: 'Clear all', min: 'Min', max: 'Max', from: 'From', to: 'To',
    searchPlaceholder: 'Search…', remove: 'Remove {label}', noOptions: 'No options',
  },
});

const FACET_TYPES = new Set(['checkbox', 'radio', 'range', 'date-range', 'search']);
const facetsValKey = v => String(isObj(v) ? (v.label ?? v.name ?? v.value ?? '') : (v ?? ''));
const facetsEmptyVal = t => (t === 'checkbox' ? [] : t === 'search' ? '' : t === 'range' || t === 'date-range' ? {} : '');

function facetsIsEmpty(group, v) {
  if (v == null) return true;
  switch (group.type) {
    case 'checkbox': return !Array.isArray(v) || !v.length;
    case 'radio': return v === '';
    case 'range': return !isObj(v) || (v.min == null && v.max == null);
    case 'date-range': return !isObj(v) || (!v.from && !v.to);
    case 'search': return !String(v || '').trim();
    default: return true;
  }
}
function facetsMatchOption(item, group, opt) {
  if (isFn(opt.test)) return !!opt.test(item);
  if (opt.min != null || opt.max != null) {
    const n = +getPath(item, group.key);
    return isNum(n) && (opt.min == null || n >= opt.min) && (opt.max == null || n <= opt.max);
  }
  return facetsValKey(getPath(item, group.key)) === String(opt.value);
}
function facetsTest(item, group, value) {
  switch (group.type) {
    case 'checkbox': { const set = new Set(toArr(value).map(String)); return toArr(getPath(item, group.key)).some(v => set.has(facetsValKey(v))); }
    case 'radio': { const opt = (group.options || []).find(o => String(o.value) === String(value)); return opt ? facetsMatchOption(item, group, opt) : true; }
    case 'range': { const n = +getPath(item, group.key); return isNum(n) && (value.min == null || n >= +value.min) && (value.max == null || n <= +value.max); }
    case 'date-range': {
      const d = date.parse(getPath(item, group.key)); if (!d) return false;
      const from = value.from ? +date.startOf(value.from, 'd') : null, to = value.to ? +date.endOf(value.to, 'd') : null;
      return (from == null || +d >= from) && (to == null || +d <= to);
    }
    case 'search': {
      const q = String(value).toLowerCase(), keys = group.searchKeys && group.searchKeys.length ? group.searchKeys : [group.key];
      return keys.some(k => String(getPath(item, k) ?? '').toLowerCase().includes(q));
    }
    default: return true;
  }
}
/** Translate a radio selection into the shape the bound table's `filters` expects (bucket -> {min,max}). */
function facetsRadioTableValue(group, val) {
  const opt = (group.options || []).find(o => String(o.value) === String(val));
  if (opt && (opt.min != null || opt.max != null)) return { min: opt.min ?? null, max: opt.max ?? null };
  return val;
}
function facetsNormGroup(g, i) {
  const type = FACET_TYPES.has(g.type) ? g.type : 'checkbox';
  return { ...g, type, key: g.key, id: g.id || g.key || ('g' + i), label: g.label ?? cap(String(g.key || '')), collapsed: !!g.collapsed,
    options: Array.isArray(g.options) ? g.options.map(o => (isObj(o) ? o : { value: o, label: o })) : null, searchKeys: g.searchKeys || null };
}

class OFacets extends OElement {
  static props = {
    items: { type: Array, default: () => [] },
    groups: { type: Array, default: () => [] },
    value: { type: Object, default: () => ({}) },
    for: { type: String, attr: 'for' },
    label: String,
    collapsible: { type: Boolean, default: true },
    urlKey: { type: String, attr: 'url-key' },
    texts: Object,
  };

  setup() {
    this.classList.add('o-facets');
    if (!this.hasAttribute('role')) this.setAttribute('role', 'group');
    this._clearBtn = h('button', { type: 'button', class: 'o-btn o-btn-xs o-btn-ghost o-facets-clear', hidden: true }, this.t('facets.clearAll'));
    this._head = h('div', { class: 'o-facets-head' }, h('span', { class: 'o-facets-title' }, this.label || this.t('facets.title')), this._clearBtn);
    this._body = h('div', { class: 'o-facets-body' });
    this.append(this._head, this._body);
    on(this._clearBtn, 'click', () => this.clear());
    on(this._body, 'click', '.o-facets-group-title', (e, btn) => this._toggleGroup(btn));
    on(this._body, 'change', 'input[type=checkbox]', (e, input) => this._onCheckbox(input));
    on(this._body, 'change', 'input[type=radio]', (e, input) => this._onRadio(input));
    const onRange = debounce((e, input) => this._onRange(input), 200);
    on(this._body, 'input', '.o-facets-range input', onRange);
    const onSearch = debounce((e, input) => this._onSearch(input), 200);
    on(this._body, 'input', '.o-facets-search input', onSearch);
  }
  connected() {
    if (this.urlKey && O.url && isFn(O.url.bind) && !this._urlBind) {
      this._urlBind = O.url.bind(this.urlKey, {
        type: 'string', default: '{}', debounce: 300,
        get: () => JSON.stringify(this.value || {}),
        set: raw => { const v = parseJSON(raw, null); if (v && isObj(v)) { this.value = v; this._applyValueToTable(); this._renderGroups(); this._syncClear(); } },
      });
    }
  }
  disconnected() { this._unbindTarget?.(); this._urlBind?.unbind?.(); this._urlBind = null; }

  update(changed) {
    if (changed.has('for') || changed.has('init')) this._bindTarget();
    if (changed.has('groups') || changed.has('init')) { this._groups = toArr(this.groups).map(facetsNormGroup); this._buildSkeleton(); }
    if (changed.has('locale')) { this._head.firstChild.textContent = this.label || this.t('facets.title'); this._clearBtn.textContent = this.t('facets.clearAll'); }
    if (changed.has('label')) this._head.firstChild.textContent = this.label || this.t('facets.title');
    if (changed.has('items') || changed.has('groups') || changed.has('value') || changed.has('init')) this._renderGroups();
    this._syncClear();
  }

  /* ── binding to an <o-datatable> ── */
  _bindTarget(retried) {
    this._unbindTarget?.(); this._unbindTarget = null; this._table = null;
    if (!this.for) return;
    const el = $(this.for);
    if (!el || !isFn(el.facetCounts) || !('filters' in el)) {
      // The target (or its custom-element upgrade / first render) may not exist yet if it appears
      // later in the same batch of markup as this element — give it one animation frame, then warn.
      if (!retried) { requestAnimationFrame(() => this._bindTarget(true)); return; }
      console.warn(`[Orion] <o-facets for="${this.for}"> did not match a bindable table (needs .filters / .facetCounts()).`);
      return;
    }
    this._table = el;
    this._syncFromTable();
    const off1 = on(el, 'o-filter', () => { this._syncFromTable(); this._renderGroups(); this._syncClear(); this.emit('change', { value: this.value, filtered: null }); });
    const off2 = on(el, 'o-search', () => this._renderGroups());
    this._unbindTarget = () => { off1(); off2(); };
    // The target's own initial rows/columns may not have been processed yet at this exact instant
    // (independent element lifecycles) — refresh once more a frame later so counts aren't stale/empty.
    requestAnimationFrame(() => { if (this._table === el) this._renderGroups(); });
  }
  _syncFromTable() {
    if (!this._table || !this._groups) return;
    const filters = this._table.filters || {}, value = {};
    for (const g of this._groups) {
      const fv = filters[g.key]; if (fv === undefined) continue;
      if (g.type === 'radio') {
        if (isObj(fv)) { const opt = (g.options || []).find(o => o.min === fv.min && o.max === fv.max); if (opt) value[g.key] = String(opt.value); }
        else value[g.key] = String(fv);
      } else value[g.key] = fv;
    }
    this.value = value;
  }
  _applyValueToTable() {
    if (!this._table || !this._groups) return;
    const filters = { ...(this._table.filters || {}) };
    for (const g of this._groups) {
      const v = this.value[g.key];
      if (facetsIsEmpty(g, v)) delete filters[g.key]; else filters[g.key] = g.type === 'radio' ? facetsRadioTableValue(g, v) : v;
    }
    this._table.filters = filters;
  }

  /* ── skeleton (rebuilt only when groups change) ── */
  _buildSkeleton() {
    const create = g => {
      const bodyId = uid('facet-body');
      let inner;
      if (g.type === 'range') {
        inner = h('div', { class: 'o-facets-range' },
          h('input', { type: 'number', class: 'o-input o-input-sm', 'data-r': 'min', 'aria-label': this.t('facets.min'), placeholder: this.t('facets.min'), step: g.step ?? 'any' }),
          h('span', { class: 'o-facets-range-sep', 'aria-hidden': 'true' }, '–'),
          h('input', { type: 'number', class: 'o-input o-input-sm', 'data-r': 'max', 'aria-label': this.t('facets.max'), placeholder: this.t('facets.max'), step: g.step ?? 'any' }));
      } else if (g.type === 'date-range') {
        inner = h('div', { class: 'o-facets-range' },
          h('input', { type: 'date', class: 'o-input o-input-sm', 'data-r': 'from', 'aria-label': this.t('facets.from') }),
          h('span', { class: 'o-facets-range-sep', 'aria-hidden': 'true' }, '–'),
          h('input', { type: 'date', class: 'o-input o-input-sm', 'data-r': 'to', 'aria-label': this.t('facets.to') }));
      } else if (g.type === 'search') {
        inner = h('div', { class: 'o-facets-search o-input-wrap' }, icon('search'),
          h('input', { type: 'search', class: 'o-input', 'aria-label': g.label, placeholder: g.placeholder || this.t('facets.searchPlaceholder') }));
      } else {
        inner = h('div', { class: 'o-facets-options', role: g.type === 'radio' ? 'radiogroup' : null, 'aria-label': g.type === 'radio' ? g.label : null });
      }
      const body = h('div', { class: 'o-facets-group-body', id: bodyId }, inner);
      body.hidden = !!g.collapsed;
      const titleBtn = this.collapsible
        ? h('button', { type: 'button', class: 'o-facets-group-title', 'aria-expanded': String(!g.collapsed), 'aria-controls': bodyId }, h('span', null, g.label), icon('chevron-down', { class: 'o-facets-chev' }))
        : h('p', { class: 'o-facets-group-title is-static' }, g.label);
      const section = h('section', { class: 'o-facets-group', 'data-key': g.key, 'data-type': g.type }, titleBtn, body);
      section.__okey = g.key;
      return section;
    };
    patchList(this._body, this._groups, g => g.key, create);
  }
  _toggleGroup(btn) {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    const body = doc.getElementById(btn.getAttribute('aria-controls'));
    btn.setAttribute('aria-expanded', String(!expanded));
    if (body) collapse(body, !expanded);
  }

  /* ── rendering (counts + checked state; never touches focused inputs) ── */
  _renderGroups() {
    if (!this._groups) return;
    for (const section of this._body.children) {
      const group = this._groups.find(g => g.key === section.dataset.key); if (!group) continue;
      if (group.type === 'checkbox' || group.type === 'radio') this._renderOptions(section.querySelector('.o-facets-options'), group);
      else if (group.type === 'range') this._renderRange(section.querySelector('.o-facets-range'), group);
      else if (group.type === 'date-range') this._renderDateRange(section.querySelector('.o-facets-range'), group);
      else if (group.type === 'search') this._renderSearch(section.querySelector('.o-facets-search input'), group);
    }
  }
  _optionsData(group) {
    const selected = this.value[group.key];
    if (group.type === 'checkbox') {
      const selSet = new Set(toArr(selected).map(String));
      let counts, candidates;
      if (this._table) {
        counts = this._table.facetCounts(group.key);
        candidates = group.options || [...counts.keys()].sort((a, b) => a.localeCompare(b)).map(k => ({ value: k, label: k }));
      } else {
        const base = this.filter(this.items, group.key);
        counts = new Map();
        for (const it of base) for (const v of toArr(getPath(it, group.key))) { const k = facetsValKey(v); if (k !== '') counts.set(k, (counts.get(k) || 0) + 1); }
        candidates = group.options || [...new Set(this.items.flatMap(it => toArr(getPath(it, group.key)).map(facetsValKey)).filter(k => k !== ''))]
          .sort((a, b) => a.localeCompare(b)).map(k => ({ value: k, label: k }));
      }
      return candidates.map(o => ({ value: String(o.value), label: o.label ?? o.value, count: counts.get(String(o.value)), checked: selSet.has(String(o.value)) }))
        .filter(o => o.checked || o.count == null || o.count > 0);
    }
    // radio
    const opts = group.options || [];
    const counts = this._table ? null : (() => { const base = this.filter(this.items, group.key); return opts.map(o => base.filter(it => facetsMatchOption(it, group, o)).length); })();
    return opts.map((o, i) => ({ value: String(o.value), label: o.label ?? o.value, count: counts ? counts[i] : null, checked: String(selected ?? '') === String(o.value) }));
  }
  _renderOptions(container, group) {
    if (!container) return;
    const data = this._optionsData(group), isRadio = group.type === 'radio';
    container.querySelectorAll(':scope > .o-facets-empty').forEach(el => el.remove()); // patchList doesn't track this placeholder
    if (!data.length) { container.append(h('p', { class: 'o-facets-empty o-text-muted o-text-sm' }, this.t('facets.noOptions'))); return; }
    const create = o => {
      const input = h('input', { type: isRadio ? 'radio' : 'checkbox', name: isRadio ? 'ofg-' + group.id : null, value: o.value });
      const count = h('small', { class: 'o-facets-count' });
      const row = h('label', { class: 'o-check o-facets-option' }, h('span', null, input, h('span', null, o.label)), count);
      row.__okey = o.value;
      update(row, o);
      return row;
    };
    const update = (row, o) => {
      const input = row.querySelector('input');
      if (doc.activeElement !== input) input.checked = o.checked;
      const c = row.querySelector('.o-facets-count');
      c.textContent = o.count == null ? '' : fmt.number(o.count);
      c.hidden = o.count == null;
      row.classList.toggle('is-disabled', o.count === 0 && !o.checked);
    };
    patchList(container, data, o => o.value, create, update);
    if (isRadio) {
      // an unselected radio group needs a hidden "any" option so it can be cleared by choosing nothing explicitly
      const noneChecked = !data.some(o => o.checked);
      container.querySelectorAll('input[type=radio]').forEach(r => { if (doc.activeElement !== r && noneChecked) r.checked = false; });
    }
  }
  _renderRange(container, group) {
    if (!container) return;
    const v = this.value[group.key] || {};
    const minEl = container.querySelector('[data-r=min]'), maxEl = container.querySelector('[data-r=max]');
    if (doc.activeElement !== minEl) minEl.value = v.min == null ? '' : v.min;
    if (doc.activeElement !== maxEl) maxEl.value = v.max == null ? '' : v.max;
  }
  _renderDateRange(container, group) {
    if (!container) return;
    const v = this.value[group.key] || {};
    const fromEl = container.querySelector('[data-r=from]'), toEl = container.querySelector('[data-r=to]');
    if (doc.activeElement !== fromEl) fromEl.value = v.from || '';
    if (doc.activeElement !== toEl) toEl.value = v.to || '';
  }
  _renderSearch(input, group) {
    if (!input) return;
    const v = this.value[group.key];
    if (doc.activeElement !== input) input.value = v || '';
  }
  _syncClear() {
    const active = Object.keys(this.value || {}).length > 0;
    this._clearBtn.hidden = !active;
  }

  /* ── input handlers ── */
  _groupOf(el) { const section = el.closest('.o-facets-group'); return section && this._groups.find(g => g.key === section.dataset.key); }
  _onCheckbox(input) {
    const group = this._groupOf(input); if (!group) return;
    const cur = new Set(toArr(this.value[group.key]).map(String));
    if (input.checked) cur.add(input.value); else cur.delete(input.value);
    this._setValue(group.key, [...cur]);
  }
  _onRadio(input) {
    const group = this._groupOf(input); if (!group || !input.checked) return;
    this._setValue(group.key, input.value);
  }
  _onRange(input) {
    const group = this._groupOf(input); if (!group) return;
    const c = input.closest('.o-facets-range');
    if (group.type === 'date-range') {
      const from = c.querySelector('[data-r=from]').value || null, to = c.querySelector('[data-r=to]').value || null;
      this._setValue(group.key, { from, to });
      return;
    }
    const min = c.querySelector('[data-r=min]').value, max = c.querySelector('[data-r=max]').value;
    this._setValue(group.key, { min: min === '' ? null : +min, max: max === '' ? null : +max });
  }
  _onSearch(input) {
    const group = this._groupOf(input); if (!group) return;
    this._setValue(group.key, input.value);
  }

  _setValue(key, val) {
    const group = this._groups.find(g => g.key === key); if (!group) return;
    const value = { ...this.value };
    if (facetsIsEmpty(group, val)) delete value[key]; else value[key] = val;
    this.value = value;
    if (this._table) {
      const filters = { ...(this._table.filters || {}) };
      if (facetsIsEmpty(group, val)) delete filters[key]; else filters[key] = group.type === 'radio' ? facetsRadioTableValue(group, val) : val;
      this._table.filters = filters;
    }
    this._renderGroups(); this._syncClear();
    this.emit('change', { value: this.value, filtered: this._table ? null : this.filtered });
  }

  /* ── public API ── */
  /** filter(items?, excludeKey?) -> items matching every active selection except excludeKey. */
  filter(items, excludeKey) {
    const list = items || this.items, groups = this._groups || [];
    return list.filter(item => groups.every(g => {
      if (g.key === excludeKey) return true;
      const v = this.value[g.key];
      return facetsIsEmpty(g, v) || facetsTest(item, g, v);
    }));
  }
  get filtered() { return this.filter(this.items); }
  clearGroup(key) {
    const group = this._groups?.find(g => g.key === key); if (!group) return;
    this._setValue(key, facetsEmptyVal(group.type));
  }
  /** remove(key, value?) — drop one checkbox value, or clear the whole group for other types. */
  remove(key, val) {
    const group = this._groups?.find(g => g.key === key); if (!group) return;
    if (group.type === 'checkbox' && val != null) { const arr = toArr(this.value[key]).map(String).filter(v => v !== String(val)); this._setValue(key, arr); return; }
    this.clearGroup(key);
  }
  clear() {
    this.value = {};
    if (this._table && this._groups) { const filters = { ...(this._table.filters || {}) }; this._groups.forEach(g => delete filters[g.key]); this._table.filters = filters; }
    this._renderGroups(); this._syncClear();
    this.emit('change', { value: this.value, filtered: this._table ? null : this.filtered });
  }
  /** Recompute counts/rendering (e.g. after mutating `items` in place, or the bound table's rows changed). */
  refresh() { this._renderGroups(); }
}
define('o-facets', OFacets);
O.Facets = OFacets;
