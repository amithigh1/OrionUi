// @deps validation
/* Repeatable form fields.
 *   <o-repeater name="experience" min="1" max="10" add-text="Add position" item-label="Position {n}" sortable>
 *     <template> <input name="company"> <input name="skills[]"> … <span data-o-row-number></span> </template>
 *   </o-repeater>
 *   Field names are indexed automatically: company -> experience[0][company] (re-indexed on add / remove / reorder).
 *   Props: name, min, max, initial, sortable, duplicable (attribute `duplicate`, default true), addText, emptyText, itemLabel, value (array), texts
 *   Methods: add(data?, index?), remove(index), duplicate(index), move(from, to), clear(), getValue(), setValue(array), rows, count
 *   Events: o-before-add / o-add { row, index }, o-before-remove / o-remove { index, data }, o-sort { from, to }, o-change { value }
 *   Keyboard: Alt+ArrowUp / Alt+ArrowDown inside a row moves it; ArrowUp / ArrowDown on the drag handle.
 */
i18n.add('en', {
  repeater: {
    add: 'Add item', remove: 'Remove {label}', duplicate: 'Duplicate {label}', moveUp: 'Move {label} up', moveDown: 'Move {label} down',
    drag: 'Reorder {label} (drag, or use the arrow keys)', item: 'Item {n}', empty: 'No items yet', added: '{label} added', removed: '{label} removed',
    moved: '{label} moved to position {n} of {total}', max: 'You can add up to {max} items', count: '{count} of {max}',
  },
});

/* form helpers live in the validation folder (@deps) */
const serialize = (...a) => O.formUtil.serialize(...a);
const fill = (...a) => O.formUtil.fill(...a);
const setByName = (...a) => O.formUtil.setByName(...a);
const getByName = (...a) => O.formUtil.getByName(...a);

function indexedName(prefix, i, rel) {
  const b = rel.indexOf('[');
  const base = b < 0 ? rel : rel.slice(0, b), rest = b < 0 ? '' : rel.slice(b);
  return `${prefix}[${i}][${base}]${rest}`;
}
const REF_ATTRS = ['for', 'aria-describedby', 'aria-labelledby', 'aria-controls', 'list', 'data-o-error-for'];

class ORepeater extends OElement {
  static props = {
    name: { type: String, default: 'items' }, min: { type: Number, default: 0 }, max: { type: Number, default: Infinity },
    // `duplicable` (attribute still `duplicate`): a prop named `duplicate` replaced the duplicate() method below.
    initial: { type: Number, default: null }, sortable: Boolean, duplicable: { type: Boolean, default: true, attr: 'duplicate' },
    addText: String, emptyText: String, itemLabel: String, value: Array, texts: Object,
  };
  get value() { return this._setupDone && this._tpl ? this.getValue() : this._pendingValue || []; }
  set value(v) { if (isStr(v)) v = parseJSON(v, []); this._pendingValue = toArr(v); if (this._setupDone && this._tpl) this.setValue(this._pendingValue, { silent: true }); }

  setup() {
    this.classList.add('o-repeater');
    this._list = h('div', { class: 'o-repeater-list' });
    this._empty = h('div', { class: 'o-repeater-empty o-empty o-empty-sm', hidden: true }, h('p', { class: 'o-empty-text' }));
    this._addBtn = h('button', { type: 'button', class: 'o-btn o-btn-soft-primary o-btn-sm o-repeater-add', 'data-o-act': 'add' }, iconEl('plus'), h('span'));
    this._hint = h('span', { class: 'o-repeater-hint', 'aria-live': 'polite' });
    this._foot = h('div', { class: 'o-repeater-footer' }, this._addBtn, this._hint);
    this.append(this._list, this._empty, this._foot);
    this._findTemplate();
    on(this, 'click', '[data-o-act]', (e, b) => {
      if (b.closest('o-repeater') !== this) return;
      const row = b.closest('.o-repeater-row'), i = row ? this.rows.indexOf(row) : -1, act = b.dataset.oAct;
      if (act === 'add') this.add(null, null, { focus: true });
      else if (act === 'remove') this.remove(i);
      else if (act === 'duplicate') this.duplicate(i);
      else if (act === 'up') this.move(i, i - 1);
      else if (act === 'down') this.move(i, i + 1);
    });
    on(this, 'keydown', e => this._onKey(e));
    on(this, 'pointerdown', '.o-repeater-handle', (e, hd) => hd.closest('o-repeater') === this && this._drag(e, hd));
    on(this, 'input change', e => { if (e.target.closest('o-repeater') === this || this.contains(e.target)) this._changedSoon(); });
  }
  connected() {
    if (!this._tpl) {
      const mo = new MutationObserver(() => { if (this._findTemplate()) { mo.disconnect(); this._init(); } });
      mo.observe(this, { childList: true });
      this.addCleanup(() => mo.disconnect());
    }
  }
  _findTemplate() {
    const tpl = [...this.children].find(c => c.localName === 'template');
    if (tpl) this._tpl = tpl;
    return !!tpl;
  }
  update(changed) {
    if (changed.has('init')) { this._init(); return; }
    if (!this._tpl) return;
    if (changed.has('name')) this._reindex();
    if (changed.has('sortable') || changed.has('duplicable') || changed.has('locale') || changed.has('itemLabel')) { this.rows.forEach(r => this._chrome(r)); this._reindex(); }
    if (changed.has('min') || changed.has('max') || changed.has('addText') || changed.has('emptyText') || changed.has('locale')) { this._ensureMin(); this._sync(); }
  }
  _init() {
    if (!this._tpl || this._inited) { this._sync(); return; }
    this._inited = true;
    if (this._pendingValue) this.setValue(this._pendingValue, { silent: true });
    else { const n = this.initial != null ? this.initial : Math.max(this.min, 1); for (let i = 0; i < n; i++) this._insert(this._createRow(), i, false); this._reindex(); }
    this._ensureMin();
  }
  _ensureMin() { if (!this._tpl) return; let added = false; while (this.count < this.min) { this._insert(this._createRow(), this.count, false); added = true; } if (added) this._reindex(); }

  get rows() { return this._list ? [...this._list.children].filter(r => r.classList.contains('o-repeater-row') && !r.classList.contains('is-removing')) : []; }
  get count() { return this.rows.length; }
  _label(i) { const tpl = this.itemLabel || this.t('repeater.item'); return String(tpl).replace('{n}', i + 1); }

  _createRow() {
    const rid = uid('r');
    const body = h('div', { class: 'o-repeater-body' });
    const src = this._tpl.content && this._tpl.content.childNodes.length ? this._tpl.content : this._tpl;
    for (const n of src.childNodes) body.append(n.cloneNode(true));
    for (const el of $$('[name]', body)) if (!el.hasAttribute('data-o-name')) el.setAttribute('data-o-name', el.getAttribute('name'));
    const ids = {};
    for (const el of $$('[id]', body)) { ids[el.id] = el.id + '-' + rid; el.id = ids[el.id]; }
    for (const el of $$(REF_ATTRS.map(a => `[${a}]`).join(','), body)) for (const a of REF_ATTRS) { const v = el.getAttribute(a); if (v) el.setAttribute(a, v.split(/\s+/).map(x => ids[x] || x).join(' ')); }
    const row = h('div', { class: 'o-repeater-row', role: 'group' }, body);
    this._chrome(row);
    return row;
  }
  _chrome(row) {
    const body = row.querySelector(':scope > .o-repeater-body');
    [...row.children].forEach(c => c !== body && c.remove());
    const btn = (act, ic, cls = '') => h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm ' + cls, 'data-o-act': act }, iconEl(ic));
    const acts = h('div', { class: 'o-repeater-actions' });
    if (this.sortable) acts.append(btn('up', 'chevron-up', 'o-repeater-up'), btn('down', 'chevron-down', 'o-repeater-down'));
    if (this.duplicable) acts.append(btn('duplicate', 'copy'));
    acts.append(btn('remove', 'trash', 'o-repeater-remove'));
    if (this.sortable) row.prepend(h('button', { type: 'button', class: 'o-repeater-handle', 'data-o-act': 'handle' }, iconEl('grip-vertical')));
    row.append(acts);
  }
  _insert(row, idx, animated) {
    const ref = this.rows[idx] || null;
    this._list.insertBefore(row, ref);
    if (animated && !reducedMotion()) { row.hidden = true; collapse(row, true, { duration: 200 }).then(() => animate(row, 'fadeIn', { duration: 120 })); }
  }
  _reindex() {
    const rows = this.rows, total = rows.length;
    rows.forEach((row, i) => {
      const label = this._label(i);
      row.dataset.index = i;
      row.setAttribute('aria-label', label);
      $$('[data-o-row-number]', row).forEach(el => { if (el.closest('.o-repeater-row') === row) el.textContent = i + 1; });
      for (const el of $$('[data-o-name]', row)) {
        if (el.closest('.o-repeater-row') !== row) continue;
        const nm = indexedName(this.name, i, el.getAttribute('data-o-name'));
        if (el.getAttribute('name') !== nm) el.setAttribute('name', nm);
      }
      const set = (sel, key, dis) => { const b = row.querySelector(`:scope > ${sel}`); if (b) { b.setAttribute('aria-label', this.t(key, { label })); b.title = this.t(key, { label }); if (dis != null) b.disabled = dis; } };
      set('.o-repeater-handle', 'repeater.drag');
      set('.o-repeater-actions > [data-o-act=up]', 'repeater.moveUp', i === 0);
      set('.o-repeater-actions > [data-o-act=down]', 'repeater.moveDown', i === total - 1);
      set('.o-repeater-actions > [data-o-act=duplicate]', 'repeater.duplicate', total >= this.max);
      set('.o-repeater-actions > [data-o-act=remove]', 'repeater.remove', total <= this.min);
    });
    this._sync();
  }
  _sync() {
    if (!this._addBtn) return;
    const n = this.count, full = n >= this.max;
    this._addBtn.lastChild.textContent = this.addText || this.t('repeater.add');
    this._addBtn.disabled = full;
    this._hint.textContent = full ? this.t('repeater.max', { max: this.max }) : Number.isFinite(this.max) ? this.t('repeater.count', { count: n, max: this.max }) : '';
    this._empty.hidden = n > 0;
    this._empty.firstChild.textContent = this.emptyText || this.t('repeater.empty');
    this.toggleAttribute('data-empty', n === 0);
    this.setAttribute('data-count', n);
  }
  _changedSoon() {
    clearTimeout(this._chT);
    this._chT = setTimeout(() => this.emit('change', { value: this.getValue() }), 60);
  }
  _focusRow(row) { const f = focusables(row.querySelector('.o-repeater-body') || row)[0]; if (f) f.focus(); }

  /* ── public API ── */
  getValue() {
    const data = serialize(this), arr = toArr(getByName(data, this.name));
    return this.rows.map((_, i) => arr[i] || {});
  }
  setValue(list, { silent = false } = {}) {
    list = toArr(list);
    if (!this._tpl) { this._pendingValue = list; return; }
    this._inited = true;
    const want = Math.max(list.length, this.min);
    while (this.count > want) this.rows[this.count - 1].remove();
    while (this.count < want) this._insert(this._createRow(), this.count, false);
    this._reindex();
    const data = {};
    setByName(data, this.name, list);
    fill(this, data, { events: !silent });
    if (!silent) this.emit('change', { value: this.getValue() });
  }
  add(data, index, { focus = false } = {}) {
    if (!this._tpl) return null;
    if (this.count >= this.max) { announce(this.t('repeater.max', { max: this.max })); return null; }
    const idx = index == null ? this.count : clamp(index, 0, this.count);
    if (!this.emit('before-add', { index: idx, data })) return null;
    const row = this._createRow();
    this._insert(row, idx, true);
    this._reindex();
    if (data) { const d = {}; setByName(d, `${this.name}[${idx}]`, data); fill(row, d); }
    if (focus) requestAnimationFrame(() => this._focusRow(row));
    announce(this.t('repeater.added', { label: this._label(idx) }));
    this.emit('add', { row, index: idx });
    this.emit('change', { value: this.getValue() });
    return row;
  }
  async remove(index) {
    const row = this.rows[index];
    if (!row || this.count <= this.min) return false;
    const data = this.getValue()[index], label = this._label(index);
    if (!this.emit('before-remove', { index, row, data })) return false;
    const hadFocus = row.contains(doc.activeElement);
    row.classList.add('is-removing');
    $$('input,select,textarea,button', row).forEach(c => { c.disabled = true; });
    await collapse(row, false, { duration: 180 });
    row.remove();
    this._reindex();
    if (hadFocus) { const r = this.rows[Math.min(index, this.count - 1)]; if (r) this._focusRow(r); else this._addBtn.focus(); }
    announce(this.t('repeater.removed', { label }));
    this.emit('remove', { index, data });
    this.emit('change', { value: this.getValue() });
    return true;
  }
  duplicate(index) { const v = this.getValue()[index]; return v ? this.add(clone(v), index + 1, { focus: true }) : null; }
  move(from, to, { focus = true } = {}) {
    const rows = this.rows;
    if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return;
    const row = rows[from], active = doc.activeElement, before = new Map(rows.map(r => [r, r.getBoundingClientRect().top]));
    this._list.insertBefore(row, to > from ? rows[to].nextSibling : rows[to]);
    this._reindex();
    if (!reducedMotion()) for (const r of rows) { const dy = before.get(r) - r.getBoundingClientRect().top; if (dy) r.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
    if (focus && active && row.contains(active)) active.focus({ preventScroll: false });
    announce(this.t('repeater.moved', { label: this._label(to), n: to + 1, total: rows.length }));
    this.emit('sort', { from, to });
    this.emit('change', { value: this.getValue() });
  }
  clear() { this.setValue([]); }

  /* ── keyboard & drag ── */
  _onKey(e) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const row = e.target.closest('.o-repeater-row');
    if (!row || row.parentElement !== this._list || !this.sortable) return;
    const onHandle = e.target.classList.contains('o-repeater-handle');
    if (!e.altKey && !onHandle) return;
    e.preventDefault();
    const i = this.rows.indexOf(row);
    this.move(i, i + (e.key === 'ArrowUp' ? -1 : 1));
  }
  _drag(e, handle) {
    if (e.button !== 0) return;
    const row = handle.closest('.o-repeater-row');
    const from = this.rows.indexOf(row), startY = e.clientY, startTop = row.getBoundingClientRect().top;
    let off = 0, moved = false;
    e.preventDefault();
    try { handle.setPointerCapture(e.pointerId); } catch {}
    row.classList.add('is-dragging');
    const mv = ev => {
      moved = true;
      const rows = this.rows, idx = rows.indexOf(row), prev = rows[idx - 1], next = rows[idx + 1];
      if (next) { const r = next.getBoundingClientRect(); if (ev.clientY > r.top + r.height / 2) this._list.insertBefore(next, row); }
      if (prev) { const r = prev.getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) this._list.insertBefore(row, prev); }
      const natural = row.getBoundingClientRect().top - off;
      off = ev.clientY - startY - (natural - startTop);
      row.style.transform = `translateY(${off}px)`;
    };
    const up = () => {
      handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
      row.classList.remove('is-dragging');
      const o = off;
      row.style.transform = '';
      if (o && !reducedMotion()) row.animate([{ transform: `translateY(${o}px)` }, { transform: 'none' }], { duration: 150, easing: 'ease-out' });
      const to = this.rows.indexOf(row);
      if (moved && to !== from) {
        this._reindex();
        announce(this.t('repeater.moved', { label: this._label(to), n: to + 1, total: this.count }));
        this.emit('sort', { from, to });
        this.emit('change', { value: this.getValue() });
      }
    };
    handle.addEventListener('pointermove', mv);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }
}
define('o-repeater', ORepeater);
O.Repeater = ORepeater;
