/* Tags input.
 *   <o-tags name="skills" value='["js","css"]' suggestions='["html","css","js","go"]' max="8" pattern="^[a-z0-9-]+$"></o-tags>
 *   Props: value (Array) placeholder max allow-duplicates pattern suggestions (Array of strings | {value,label,color})
 *          source (fn(query) -> Promise<items>) strict (only suggested values) separator (form value joined, e.g. ",")
 *          delimiters (=",;" plus Enter/Tab) min-chars(=1) max-length transform (lower|upper) color-for (fn(tag) -> color)
 *          colors ({ tag: 'success' | '#hex' }) editable(=true) sortable(=true) size name required disabled readonly texts
 *   Methods: add(tag|tags) remove(tag|index) clear() focus() open() close()
 *   Events: o-add { tag } (cancelable), o-remove { tag, index } (cancelable), o-change { value }, input, change
 *   Keyboard: Enter/,/Tab add · Backspace in an empty field removes the last tag · ←/→ move between tags ·
 *             Delete/Backspace on a tag removes it · Enter/F2 or double-click edits · Alt+←/→ reorders · ↓ opens suggestions
 * Form value: one entry per tag (FormData.getAll(name)), or a single joined string when `separator` is set.
 */
i18n.add('en', {
  tags: {
    label: 'Tags', placeholder: 'Add a tag…', remove: 'Remove {tag}', max: 'Maximum of {max} tags reached', invalid: '“{tag}” is not a valid tag',
    duplicate: '“{tag}” is already added', added: 'Added {tag}', removed: 'Removed {tag}', moved: '{tag} moved to position {pos}',
    suggestions: 'Suggestions', loading: 'Loading…', noResults: 'No matches', create: 'Add “{tag}”', notAllowed: '“{tag}” is not in the list',
  },
});
const SEMANTIC_C = ['primary', 'secondary', 'success', 'danger', 'warning', 'info', 'light', 'dark'];
const itemOf = s => (isObj(s) ? { value: String(s.value ?? s.label ?? ''), label: String(s.label ?? s.value ?? ''), color: s.color } : { value: String(s), label: String(s) });
let tagSeq = 0;

class OTags extends FormElement {
  static props = {
    ...FormElement.props,
    value: { type: Array, default: () => [] },
    placeholder: String, max: Number, allowDuplicates: Boolean, pattern: String,
    suggestions: { type: Array, default: () => [] }, source: Function, strict: Boolean, separator: String,
    delimiters: { type: String, default: ',;' }, minChars: { type: Number, default: 1 }, maxLength: Number, transform: String,
    colorFor: Function, colors: { type: Object, default: () => ({}) }, editable: { type: Boolean, default: true }, sortable: { type: Boolean, default: true },
    size: { type: String, reflect: true }, texts: Object,
  };
  setup() {
    this.classList.add('o-tags');
    this.items = [];
    this.list = h('span', { class: 'o-tags-list', role: 'list' });
    this.input = h('input', { type: 'text', class: 'o-tags-input', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'enter' });
    this.box = h('div', { class: 'o-control o-tags-control' }, this.list, this.input);
    this.msg = h('div', { class: 'o-tags-msg', role: 'status' });
    this.append(this.box, this.msg);
    this.focusTarget = this.input;
    const inp = this.input;
    on(inp, 'keydown', e => this.onInputKey(e));
    on(inp, 'input', e => { this.setMsg(''); const d = this.delims(); if (!e.isComposing && d && [...inp.value].some(c => d.includes(c))) this.commitText(); else this.suggest(); });
    on(inp, 'paste', e => this.onPaste(e));
    on(inp, 'focus', () => this.classList.add('is-focused'));
    on(inp, 'blur', () => { this.classList.remove('is-focused'); setTimeout(() => this.onLeave()); });
    on(this.list, 'keydown', '.o-tag', (e, chip) => this.onChipKey(e, chip));
    on(this.list, 'click', '.o-chip-remove', (e, b) => { e.stopPropagation(); this.removeAt(this.indexOf(b.closest('.o-tag')), true); });
    on(this.list, 'dblclick', '.o-tag', (e, chip) => this.edit(chip));
    on(this.list, 'pointerdown', '.o-tag', (e, chip) => this.drag(e, chip));
    on(this.list, 'focusout', () => setTimeout(() => this.onLeave()));
    on(this.box, 'click', e => { if (e.target === this.box || e.target === this.list) inp.focus(); });
  }
  connected() { queueMicrotask(() => { const own = this.getAttribute('aria-label'), ids = [...(this.labels || [])].map(l => l.id || (l.id = uid('lbl'))); if (own) this.input.setAttribute('aria-label', own); else if (ids.length) this.input.setAttribute('aria-labelledby', ids.join(' ')); }); }
  disconnected() { this.close(); }
  get tags() { return this.items.map(i => i.text); }
  get chips() { return [...this.list.children]; }
  indexOf(chip) { return this.chips.indexOf(chip); }
  delims() { return this.delimiters == null ? ',' : String(this.delimiters); }
  norm(s) {
    let v = String(s ?? '').replace(/\s+/g, ' ').trim();
    if (this.transform === 'lower') v = v.toLowerCase(); else if (this.transform === 'upper') v = v.toUpperCase();
    if (this.maxLength > 0) v = v.slice(0, this.maxLength);
    return v;
  }
  update(changed) {
    if (changed.has('value')) {
      const vals = toArr(this.value).map(v => String(isObj(v) ? v.value ?? v.label : v));
      if (!equal(vals, this.tags)) {
        const pool = [...this.items];
        this.items = vals.map(text => { const k = pool.findIndex(p => p.text === text); return k >= 0 ? pool.splice(k, 1)[0] : { id: ++tagSeq, text }; });
      }
    }
    this.render();
    const full = this.max > 0 && this.items.length >= this.max;
    this.input.placeholder = this.items.length ? '' : this.placeholder ?? this.t('tags.placeholder');
    this.input.disabled = this.isDisabled; this.input.readOnly = !!this.readonly || full;
    this.box.classList.toggle('is-disabled', this.isDisabled);
    this.classList.toggle('is-full', full);
    this.list.setAttribute('aria-label', this.t('tags.label'));
  }
  colorOf(text) {
    const c = this.colors?.[text] ?? (this.colorFor ? this.colorFor(text) : null) ?? this.suggestItems().find(s => s.value === text)?.color;
    return c || null;
  }
  render() {
    const ro = this.readonly || this.isDisabled;
    patchList(this.list, this.items, 'id', it => {
      const chip = h('span', { class: 'o-chip o-tag', role: 'listitem', tabindex: '-1' }, h('span', { class: 'o-tag-text' }), h('button', { type: 'button', class: 'o-chip-remove', tabindex: '-1' }));
      this.paintChip(chip, it, ro);
      return chip;
    }, (chip, it) => this.paintChip(chip, it, ro));
  }
  paintChip(chip, it, ro) {
    const text = chip.firstChild;
    if (text.textContent !== it.text && !chip.classList.contains('is-editing')) text.textContent = it.text;
    const c = this.colorOf(it.text), semantic = c && SEMANTIC_C.includes(c);
    chip.className = cls('o-chip o-tag', semantic && 'o-c-' + c, c && !semantic && 'is-colored', chip.classList.contains('is-editing') && 'is-editing', chip.classList.contains('is-dragging') && 'is-dragging');
    chip.style.setProperty('--o-tag-color', c && !semantic ? c : '');
    chip.title = it.text;
    const rm = chip.lastChild;
    rm.hidden = ro;
    rm.setAttribute('aria-label', this.t('tags.remove', { tag: it.text }));
  }
  setMsg(m, kind = 'error') { this.msg.textContent = m || ''; this.msg.dataset.kind = kind; }
  flash(el, msg) { animate(el, 'shake', { duration: 320 }); if (msg) { this.setMsg(msg); announce(msg, 'assertive'); } }
  /** Validate one tag; returns the message or ''. */
  check(v, skipIndex = -1) {
    if (!v) return 'empty';
    if (this.pattern) { let re; try { re = new RegExp(this.pattern, 'u'); } catch { re = null; } if (re && !re.test(v)) return this.t('tags.invalid', { tag: v }); }
    if (this.strict && !this.suggestItems().some(s => s.value.toLowerCase() === v.toLowerCase()) && !(this._last || []).some(s => s.value === v)) return this.t('tags.notAllowed', { tag: v });
    if (!this.allowDuplicates && this.items.some((it, i) => i !== skipIndex && it.text.toLowerCase() === v.toLowerCase())) return this.t('tags.duplicate', { tag: v });
    return '';
  }
  /** add('x') / add(['a','b']) — user-style add with validation. Returns the number of tags added. */
  add(input, user = false) {
    let n = 0;
    for (const raw0 of toArr(input)) {
      const v = this.norm(isObj(raw0) ? raw0.value : raw0);
      if (this.max > 0 && this.items.length >= this.max) { this.flash(this.box, this.t('tags.max', { max: this.max })); break; }
      const err = this.check(v);
      if (err) {
        if (err === 'empty') continue;
        const dupe = !this.allowDuplicates && this.items.findIndex(it => it.text.toLowerCase() === v.toLowerCase());
        this.flash(dupe >= 0 ? this.chips[dupe] : this.input, err);
        return n;
      }
      if (!this.emit('add', { tag: v })) continue;
      this.items.push({ id: ++tagSeq, text: v });
      n++;
      if (user) announce(this.t('tags.added', { tag: v }));
    }
    if (n) this.sync(user);
    return n;
  }
  removeAt(i, user = false) {
    const it = this.items[i];
    if (!it || this.readonly || this.isDisabled) return;
    if (!this.emit('remove', { tag: it.text, index: i })) return;
    const chips = this.chips, hadFocus = this.list.contains(doc.activeElement);
    this.items.splice(i, 1);
    this.sync(user);
    if (user) announce(this.t('tags.removed', { tag: it.text }));
    if (hadFocus) { const next = this.chips[Math.min(i, this.items.length - 1)]; (next || this.input).focus(); } else if (user && chips[i]) this.input.focus();
  }
  remove(tag) { const i = isNum(tag) ? tag : this.items.findIndex(it => it.text === tag); if (i >= 0) this.removeAt(i); }
  clear() { this.items = []; this.sync(false); this.setValue([]); }
  sync(user) {
    const v = this.tags;
    this.render();
    if (user) this.setValue(v); else this.value = v;
    this.requestUpdate('items');
  }
  commitText() {
    const inp = this.input, d = this.delims();
    const parts = d ? inp.value.split(new RegExp('[' + d.replace(/[\]\\^-]/g, '\\$&') + '\\n]')) : [inp.value];
    const last = d && ![...d].includes(inp.value.slice(-1)) && parts.length > 1 ? parts.pop() : '';
    const vals = parts.map(s => this.norm(s)).filter(Boolean);
    if (!vals.length) { inp.value = last; return false; }
    const before = this.items.length;
    this.add(vals, true);
    const added = this.items.length - before;
    inp.value = added === vals.length ? last : vals.slice(added).join(', ') + (last ? ', ' + last : '');
    this.close();
    return added > 0;
  }
  onInputKey(e) {
    const inp = this.input, open = !!this._ov;
    if (e.isComposing) return;
    if (open && this.nav.handle(e)) return;
    if (e.key === 'Enter') {
      if (open && this.nav.active) return;
      if (inp.value.trim()) { e.preventDefault(); this.commitText(); }
    } else if (e.key === 'Tab' && !e.shiftKey && inp.value.trim()) {
      if (this.commitText()) e.preventDefault();
    } else if (e.key === 'Backspace' && !inp.value && this.items.length && !this.readonly) {
      e.preventDefault(); this.removeAt(this.items.length - 1, true);
    } else if ((e.key === (isRTL(this) ? 'ArrowRight' : 'ArrowLeft')) && inp.selectionStart === 0 && inp.selectionEnd === 0 && this.items.length) {
      e.preventDefault(); this.chips[this.chips.length - 1].focus();
    } else if (e.key === 'ArrowDown' && !open) { e.preventDefault(); this.suggest(true); }
  }
  onChipKey(e, chip) {
    if (chip.classList.contains('is-editing')) return;
    const i = this.indexOf(chip), rtl = isRTL(this), chips = this.chips;
    let k = e.key;
    if (rtl && (k === 'ArrowLeft' || k === 'ArrowRight')) k = k === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    const go = j => (j >= chips.length ? this.input : chips[clamp(j, 0, chips.length - 1)]).focus();
    if ((k === 'ArrowLeft' || k === 'ArrowRight') && e.altKey && this.sortable && !this.readonly) {
      e.preventDefault();
      const j = clamp(i + (k === 'ArrowLeft' ? -1 : 1), 0, this.items.length - 1);
      if (j === i) return;
      this.items.splice(j, 0, this.items.splice(i, 1)[0]);
      this.sync(true); this.chips[j].focus();
      announce(this.t('tags.moved', { tag: this.items[j].text, pos: j + 1 }));
    } else if (k === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
    else if (k === 'ArrowRight') { e.preventDefault(); go(i + 1); }
    else if (k === 'Home') { e.preventDefault(); go(0); }
    else if (k === 'End') { e.preventDefault(); this.input.focus(); }
    else if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); this.removeAt(i, true); }
    else if (k === 'Enter' || k === 'F2') { e.preventDefault(); this.edit(chip); }
    else if (k === 'Escape') { e.preventDefault(); this.input.focus(); }
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey) this.input.focus(); // typing goes to the field
  }
  onPaste(e) {
    const txt = e.clipboardData?.getData('text/plain');
    if (!txt || !/[\n\t,;]/.test(txt)) return;
    e.preventDefault();
    const vals = txt.split(/[\n\t,;]+/).map(s => this.norm(s)).filter(Boolean);
    this.add(vals, true);
  }
  onLeave() {
    if (this.contains(doc.activeElement) || this.panel?.contains(doc.activeElement)) return;
    this.close();
    if (this.input.value.trim() && !this.strict) this.commitText();
  }
  /* ── inline edit ── */
  edit(chip) {
    if (!this.editable || this.readonly || this.isDisabled || chip.classList.contains('is-editing')) return;
    const i = this.indexOf(chip), it = this.items[i];
    const ed = h('input', { class: 'o-tag-edit', value: it.text, size: Math.max(2, it.text.length), 'aria-label': it.text });
    chip.classList.add('is-editing');
    chip.firstChild.replaceChildren(ed);
    ed.focus(); ed.select();
    let done = false;
    const finish = save => {
      if (done) return;
      const v = this.norm(ed.value);
      if (save && v !== it.text) {
        const err = !v ? '' : this.check(v, i);
        if (err) { this.flash(chip, err); ed.focus(); return; }
      }
      done = true;
      chip.classList.remove('is-editing');
      chip.firstChild.textContent = it.text;
      if (save && v && v !== it.text) { it.text = v; this.sync(true); }
      else if (save && !v) { this.removeAt(this.items.indexOf(it), true); return; }
      (this.chips[this.items.indexOf(it)] || this.input).focus();
    };
    on(ed, 'input', () => { ed.size = Math.max(2, ed.value.length); });
    on(ed, 'keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
    on(ed, 'blur', () => finish(true));
    on(ed, 'dblclick pointerdown', e => e.stopPropagation());
  }
  /* ── drag reorder (pointer; works with touch) ── */
  drag(e, chip) {
    if (!this.sortable || e.button !== 0 || this.readonly || this.isDisabled || e.target.closest('.o-chip-remove') || chip.classList.contains('is-editing')) return;
    const sx = e.clientX, sy = e.clientY, from = this.indexOf(chip);
    let moving = false;
    const move = ev => {
      if (!moving) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        moving = true; chip.classList.add('is-dragging'); this.classList.add('is-sorting');
        try { chip.setPointerCapture(e.pointerId); } catch {}
      }
      ev.preventDefault();
      const rtl = isRTL(this);
      let before = null;
      for (const c of this.chips) {
        if (c === chip) continue;
        const r = c.getBoundingClientRect();
        if (ev.clientY < r.top) { before = c; break; }
        if (ev.clientY <= r.bottom && (rtl ? ev.clientX > r.left + r.width / 2 : ev.clientX < r.left + r.width / 2)) { before = c; break; }
      }
      if (before !== chip.nextSibling) this.list.insertBefore(chip, before);
    };
    const up = () => {
      offs.forEach(f => f());
      if (!moving) return;
      chip.classList.remove('is-dragging'); this.classList.remove('is-sorting');
      const order = this.chips.map(c => c.__okey);
      const to = order.indexOf(chip.__okey);
      if (to !== from) {
        this.items = order.map(id => this.items.find(it => it.id === id));
        this.sync(true);
        announce(this.t('tags.moved', { tag: this.items[to].text, pos: to + 1 }));
      }
    };
    const offs = [on(doc, 'pointermove', move, { passive: false }), on(doc, 'pointerup pointercancel', up)];
  }
  /* ── suggestions ── */
  suggestItems() { return toArr(this.suggestions).map(itemOf); }
  suggest(force) {
    const q = this.input.value.trim();
    if (!force && q.length < this.minChars) { this.close(); return; }
    if (this.source) {
      clearTimeout(this._deb);
      this._deb = setTimeout(async () => {
        const tok = this._tok = {};
        this.showList(null, q);
        let res = [];
        try { res = toArr(await this.source(q)).map(itemOf); } catch (err) { console.warn('[Orion] o-tags source failed', err); }
        if (tok === this._tok && this.contains(doc.activeElement)) { this._last = res; this.showList(this.filterOut(res), q); }
      }, 200);
      return;
    }
    const all = this.suggestItems();
    if (!all.length) return;
    this.showList(this.filterOut(fuzzySearch(all, q, s => s.label, 50)).slice(0, 8), q);
  }
  filterOut(list) { return this.allowDuplicates ? list : list.filter(s => !this.items.some(it => it.text.toLowerCase() === s.value.toLowerCase())); }
  ensurePanel() {
    if (this.panel) return;
    this.lb = h('ul', { class: 'o-tags-options', role: 'listbox', id: uid('tags-lb') });
    this.panel = h('div', { class: 'o-floating o-tags-panel', hidden: true }, this.lb);
    this.input.setAttribute('aria-controls', this.lb.id);
    this.nav = new ListNav(this.lb, { items: '[role=option]', virtual: this.input, onSelect: el => this.pickOption(el) });
    on(this.lb, 'pointerdown', e => e.preventDefault()); // keep focus in the field
    on(this.lb, 'click', '[role=option]', (e, el) => this.pickOption(el));
    on(this.lb, 'pointermove', '[role=option]', (e, el) => { if (this.nav.active !== el) this.nav.setItem(el, { scroll: false }); });
  }
  showList(items, q) {
    this.ensurePanel();
    const lb = this.lb;
    lb.setAttribute('aria-label', this.t('tags.suggestions'));
    if (items === null) lb.replaceChildren(h('li', { class: 'o-tags-note' }, h('span', { class: 'o-spinner o-spinner-xs' }), ' ', this.t('tags.loading')));
    else if (!items.length) {
      if (!q) { this.close(); return; }
      lb.replaceChildren(h('li', { class: 'o-tags-note' }, this.t('tags.noResults')));
    } else {
      lb.replaceChildren(...items.map(s => {
        const c = s.color || this.colorOf(s.value);
        return h('li', { role: 'option', id: uid('tag-opt'), class: 'o-tags-option', 'aria-selected': 'false', 'data-value': s.value },
          c ? h('span', { class: cls('o-tags-dot', SEMANTIC_C.includes(c) && 'o-c-' + c), style: SEMANTIC_C.includes(c) ? null : { background: c } }) : null,
          raw(highlight(s.label, q)));
      }));
    }
    if (!this._ov) this.open();
    if (items?.length && q) this.nav.first(); else this.nav.reset();
  }
  pickOption(el) {
    const v = el.dataset.value;
    this.input.value = '';
    this.add(v, true);
    this.close();
    this.input.focus();
  }
  open() {
    if (this._ov) return;
    this.ensurePanel();
    const panel = this.panel;
    portal(panel, this);
    panel.hidden = false;
    this._unplace = autoPlace(panel, this.box, { placement: 'bottom-start', offset: 4, matchWidth: 'min', size: true, flip: true });
    this._ov = overlays.open({
      el: panel, owner: this, returnFocus: false,
      onClose: () => { this._ov = null; this._unplace?.(); panel.hidden = true; this.input.setAttribute('aria-expanded', 'false'); this.input.removeAttribute('aria-activedescendant'); this.nav.reset(); },
    });
    this.input.setAttribute('aria-expanded', 'true');
    animate(panel, 'fadeIn', { duration: 100 });
  }
  close() { this._ov?.close('api'); }
  formValue() {
    const v = this.tags;
    if (!v.length) return null;
    return this.separator != null && this.separator !== '' ? v.join(this.separator) : v;
  }
  getValidity() { return this.max > 0 && this.items.length > this.max ? { flags: { rangeOverflow: true }, message: this.t('tags.max', { max: this.max }) } : null; }
}
define('o-tags', OTags);
O.Tags = OTags;
