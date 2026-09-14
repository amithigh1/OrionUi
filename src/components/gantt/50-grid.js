/* ── task tree-grid (role=treegrid, aria-activedescendant, virtualized rows) ── */
const G_COLS = {
  name: { label: 'gantt.name', width: 232, min: 120 },
  start: { label: 'gantt.start', width: 108, min: 72, type: 'date' },
  end: { label: 'gantt.end', width: 108, min: 72, type: 'date' },
  duration: { label: 'gantt.duration', width: 80, min: 56, align: 'end', type: 'number' },
  progress: { label: 'gantt.progress', width: 80, min: 56, align: 'end', type: 'number' },
  assignee: { label: 'gantt.assignee', width: 140, min: 80 },
};
const G_DEFAULT_COLS = ['name', 'start', 'end', 'duration', 'progress', 'assignee'];
const G_AV_COLORS = ['primary', 'success', 'info', 'warning', 'danger', 'secondary'];
const gInitials = n => { const p = String(n).trim().split(/[\s._-]+/).filter(Boolean); return p.length ? (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : p[0][1] || '')).toUpperCase() : ''; };
const gAvColor = n => { if (O.avatar?.colorFor) return O.avatar.colorFor(n); let x = 0; for (const ch of String(n)) x = (x * 31 + ch.codePointAt(0)) >>> 0; return G_AV_COLORS[x % G_AV_COLORS.length]; };

Object.assign(OGantt.prototype, {
  _setupColumns() {
    const src = Array.isArray(this.columns) && this.columns.length ? this.columns : G_DEFAULT_COLS;
    this._colW = this._colW || new Map();
    this._cols = src.map((c, i) => {
      const d = isStr(c) ? { key: c } : { ...c };
      const key = d.key === 'assignees' ? 'assignee' : String(d.key ?? d.field ?? 'col' + i);
      const base = G_COLS[key];
      return {
        key, builtin: !!base, label: d.label ?? d.title ?? (base ? this.t(base.label) : key),
        width: Math.max(40, +(this._colW.get(key) ?? d.width ?? base?.width ?? 120)), min: +(d.minWidth ?? base?.min ?? 48),
        align: d.align ?? base?.align ?? 'start', editable: d.editable ?? !!base, type: d.type || base?.type || 'text',
        render: isFn(d.render) ? d.render : null, value: isFn(d.value) ? d.value : null, set: isFn(d.set) ? d.set : null, tree: false,
      };
    });
    const ti = this._cols.findIndex(c => c.key === 'name');
    if (this._cols.length) this._cols[ti >= 0 ? ti : 0].tree = true;
    this._layoutCols();
    this._ghrow.replaceChildren(...this._cols.map((c, i) => h('div', { class: ['o-gantt-hcell', c.align === 'end' && 'is-end'], role: 'columnheader', 'aria-colindex': i + 1 },
      h('span', { class: 'o-gantt-hlabel' }, c.label), h('span', { class: 'o-gantt-col-resize', 'data-col': i, 'aria-hidden': 'true' }))));
    this._gridV = (this._gridV || 0) + 1;
    if (this._act && this._act.c >= this._cols.length) this._act.c = -1;
  },
  _layoutCols() {
    const total = this._cols.reduce((s, c) => s + c.width, 0);
    this._colsTotal = total;
    this._gridEl.style.setProperty('--o-gantt-cols', this._cols.map(c => c.width + 'px').join(' '));
    this._gridEl.style.setProperty('--o-gantt-cols-w', total + 'px');
    this._gridEl.setAttribute('aria-colcount', String(this._cols.length));
  },
  _rowId(k) {
    let n = this._keyN.get(k);
    if (n == null) this._keyN.set(k, n = this._keyN.size + 1);
    return this._uid + '-r' + n;
  },

  /* ── rows ── */
  _renderGrid(w) {
    if (!this._gridShown) { for (const el of this._rowEls.values()) el.remove(); this._rowEls.clear(); this._gridEl.removeAttribute('aria-activedescendant'); return; }
    const need = new Set();
    for (let i = w.r0; i <= w.r1; i++) need.add(this._rows[i]);
    if (this._act && this._rowIndex.has(this._act.k)) need.add(this._act.k);
    if (this._editing) need.add(this._editing.k);
    for (const [k, el] of this._rowEls) if (!need.has(k)) { this._rowEls.delete(k); el.remove(); this._rowFree.push(el); }
    for (const k of need) {
      const i = this._rowIndex.get(k);
      if (i == null) continue;
      let el = this._rowEls.get(k);
      if (!el) { el = this._rowFree.pop() || h('div', { class: 'o-gantt-row', role: 'row' }); el.__sig = null; this._rowEls.set(k, el); }
      this._updateRow(el, k, i);
      if (el.parentNode !== this._gbody) this._gbody.append(el);
    }
    if (this._rowFree.length > 80) this._rowFree.length = 80;
    const act = this._act && this._rowIndex.has(this._act.k) ? this._act : null;
    if (act) this._gridEl.setAttribute('aria-activedescendant', this._rowId(act.k) + (act.c >= 0 ? '-c' + act.c : ''));
    else this._gridEl.removeAttribute('aria-activedescendant');
  },
  _updateRow(el, k, i) {
    const r = this._rec(k), p = this._posOf(k), sum = this._isSum(k), open = !this._collapsed.has(k);
    const crit = !!this._cp?.critical.has(k), sel = k === this._sel, act = this._act?.k === k ? this._act.c : null;
    el.style.transform = `translateY(${i * this._rh}px)`;
    el.setAttribute('aria-rowindex', String(i + 2));
    el.setAttribute('aria-selected', String(sel));
    el.classList.toggle('is-selected', sel);
    el.classList.toggle('is-active', act === -1);
    el.classList.toggle('is-summary', sum);
    el.classList.toggle('is-critical', crit);
    const sig = el.__sig;
    if (sig && sig.r === r && sig.p === p && sig.open === open && sig.crit === crit && sig.g === this._gridV && sig.k === k && this._editing?.k !== k) {
      if (sig.act !== act) { [...el.children].forEach((c, j) => c.classList.toggle('is-active', act === j)); sig.act = act; }
      return;
    }
    if (this._editing?.k === k && sig?.k === k) return;
    el.__sig = { r, p, open, crit, act, g: this._gridV, k };
    el.dataset.k = k;
    el.id = this._rowId(k);
    const lv = this._tree.level.get(k);
    el.setAttribute('aria-level', String(lv + 1));
    if (sum) el.setAttribute('aria-expanded', String(open)); else el.removeAttribute('aria-expanded');
    const sib = r.parent != null ? this._tree.kids.get(r.parent) : null;
    if (sib) { el.setAttribute('aria-setsize', String(sib.length)); el.setAttribute('aria-posinset', String(sib.indexOf(k) + 1)); }
    else { el.removeAttribute('aria-setsize'); el.removeAttribute('aria-posinset'); }
    const cells = this._cols.map((c, j) => {
      const cell = h('div', { class: ['o-gantt-cell', c.align === 'end' && 'is-end', c.tree && 'is-tree', act === j && 'is-active'], role: 'gridcell', id: el.id + '-c' + j, 'aria-colindex': j + 1 });
      if (c.tree) cell.append(this._treeCell(k, r, sum, open, crit, lv, c));
      else this._fillCell(cell, k, r, p, c);
      if (!this._canEdit(k, c)) cell.setAttribute('aria-readonly', 'true');
      return cell;
    });
    el.replaceChildren(...cells);
  },
  _treeCell(k, r, sum, open, crit, lv, c) {
    const wrap = h('span', { class: 'o-gantt-tree', style: `--o-gantt-level:${lv}` });
    wrap.append(sum
      ? h('span', { class: ['o-gantt-toggle', open && 'is-open'], 'data-toggle': '', 'aria-hidden': 'true' }, icon('chevron-right'))
      : h('span', { class: 'o-gantt-toggle is-leaf', 'aria-hidden': 'true' }));
    if (r.ms) wrap.append(h('span', { class: 'o-gantt-kind is-milestone', title: this.t('gantt.milestone') }, gIcon('diamond')));
    const content = c.render ? c.render(this._public(k)) : null;
    const name = h('span', { class: 'o-gantt-name' });
    if (content instanceof Node || content instanceof SafeHTML) append(name, content); else name.textContent = content != null ? String(content) : r.name;
    wrap.append(name);
    if (crit) wrap.append(h('span', { class: 'o-gantt-crit', title: this.t('gantt.critical') }, h('span', { class: 'o-sr-only' }, this.t('gantt.critical'))));
    return wrap;
  },
  _fillCell(cell, k, r, p, c) {
    if (c.render) { const v = c.render(this._public(k)); if (v instanceof Node || v instanceof SafeHTML) append(cell, v); else cell.textContent = v == null ? '' : String(v); return; }
    if (c.key === 'assignee' && r.assignees.length) {
      const names = r.assignees.map(gAssigneeName).filter(Boolean);
      const first = r.assignees[0], n1 = names[0] || '';
      const av = isObj(first) && first.avatar ? h('span', { class: 'o-avatar o-avatar-xs', 'aria-hidden': 'true' }, h('img', { src: first.avatar, alt: '', loading: 'lazy' })) : h('span', { class: `o-avatar o-avatar-xs o-c-${gAvColor(n1)}`, 'aria-hidden': 'true' }, gInitials(n1));
      cell.append(h('span', { class: 'o-gantt-people', title: names.join(', ') }, av, h('span', { class: 'o-gantt-people-name' }, n1), names.length > 1 ? h('span', { class: 'o-gantt-more' }, '+' + (names.length - 1)) : null));
      if (names.length > 1) cell.append(h('span', { class: 'o-sr-only' }, ', ' + names.slice(1).join(', ')));
      return;
    }
    if (c.key === 'progress' && !r.ms) {
      const v = p.progress || 0;
      cell.append(h('span', { class: 'o-gantt-pcell' }, h('span', { class: 'o-gantt-pmini', style: `--o-value:${v}%`, 'aria-hidden': 'true' }), h('span', null, fmt.percent(v / 100))));
      return;
    }
    cell.textContent = this._cellValue(k, c, r, p);
  },
  _cellValue(k, c, r = this._rec(k), p = this._posOf(k)) {
    switch (c.key) {
      case 'name': return r.name;
      case 'start': return this._fmtDate(r.ms ? r.s - 1 : p.s);
      case 'end': return this._fmtDate(r.ms ? r.s - 1 : p.e - 1);
      case 'duration': return r.ms ? '0' : this.t('gantt.dayShort', { count: p.dur });
      case 'progress': return r.ms ? '' : fmt.percent((p.progress || 0) / 100);
      case 'assignee': return r.assignees.map(gAssigneeName).join(', ');
      default: {
        if (c.value) return String(c.value(this._public(k)) ?? '');
        const v = r.extra[c.key] !== undefined ? r.extra[c.key] : isObj(r.data) ? r.data[c.key] : undefined;
        if (v == null) return '';
        if (v instanceof Date) return fmt.date(v);
        if (isNum(v)) return fmt.number(v);
        return String(v);
      }
    }
  },
  _canEdit(k, c) {
    if (this.readonly || !c || !c.editable || c.render && !c.set && !c.builtin) return false;
    const r = this._rec(k);
    if (this._isSum(k) && ['end', 'duration', 'progress'].includes(c.key)) return false;
    if (r.ms && ['end', 'duration', 'progress'].includes(c.key)) return false;
    return true;
  },

  /* ── active cell / focus ── */
  _setActive(k, c = -1, { scroll = true, select = true } = {}) {
    if (k == null || !this._rowIndex.has(k)) return;
    this._act = { k, c: clamp(c, -1, this._cols.length - 1) };
    if (select && k !== this._sel) this._setSel(k, { emit: true, announce: false });
    if (scroll) this._scrollRowIntoView(k);
    this._render(false);
    if (scroll && this._act.c >= 0) {
      const cell = this._rowEls.get(k)?.children[this._act.c];
      if (cell) { const ge = this._gridEl, cr = cell.getBoundingClientRect(), gr = ge.getBoundingClientRect(); if (cr.left < gr.left) ge.scrollLeft -= gr.left - cr.left; else if (cr.right > gr.right) ge.scrollLeft += cr.right - gr.right; }
    }
  },
  _focusGrid() { (this._gridShown ? this._gridEl : this._chartEl).focus({ preventScroll: true }); },

  /* ── inline editing ── */
  _startEdit(k, j, initial) {
    const c = this._cols[j];
    if (k == null || !this._canEdit(k, c)) return false;
    if (!this._gridShown) this._showGrid(true);
    this._endEdit(false);
    this._setActive(k, j);
    const rowEl = this._rowEls.get(k), cell = rowEl?.children[j];
    if (!cell) return false;
    const r = this._rec(k), p = this._posOf(k);
    let type = 'text', value;
    switch (c.key) {
      case 'name': value = r.name; break;
      case 'start': type = 'date'; value = gISO(r.ms ? r.s - 1 : p.s); break;
      case 'end': type = 'date'; value = gISO(p.e - 1); break;
      case 'duration': type = 'number'; value = String(r.dur); break;
      case 'progress': type = 'number'; value = String(r.progress); break;
      case 'assignee': value = r.assignees.map(gAssigneeName).join(', '); break;
      default: {
        const v = c.value ? c.value(this._public(k)) : r.extra[c.key] ?? (isObj(r.data) ? r.data[c.key] : '');
        type = c.type === 'number' || c.type === 'date' ? c.type : 'text';
        value = v == null ? '' : v instanceof Date ? gISO(gDay(v)) : String(v);
      }
    }
    const input = h('input', { class: 'o-input o-input-sm o-gantt-editor', type, 'aria-label': this.t('gantt.edit', { column: c.label }), autocomplete: 'off' });
    if (c.key === 'progress') { input.min = '0'; input.max = '100'; input.step = '1'; }
    if (c.key === 'duration') { input.min = '1'; input.step = '1'; }
    input.value = initial != null && type !== 'date' ? initial : value;
    cell.classList.add('is-editing');
    cell.append(input);
    this._editing = { k, j, input, cell, orig: value };
    input.focus({ preventScroll: true });
    if (initial == null) try { input.select(); } catch {}
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); this._endEdit(true); this._moveActive(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { e.preventDefault(); this._endEdit(false); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        this._endEdit(true);
        const cols = this._cols;
        for (let x = j + (e.shiftKey ? -1 : 1); x >= 0 && x < cols.length; x += e.shiftKey ? -1 : 1) if (this._canEdit(k, cols[x])) { this._startEdit(k, x); return; }
      }
    });
    input.addEventListener('blur', () => { if (this._editing?.input === input) this._endEdit(true, true); });
    return true;
  },
  _endEdit(commit, fromBlur = false) {
    const ed = this._editing;
    if (!ed) return;
    this._editing = null;
    const val = ed.input.value;
    ed.input.remove();
    ed.cell.classList.remove('is-editing');
    if (!fromBlur) this._focusGrid();
    if (commit && String(val) !== String(ed.orig)) this._commitCell(ed.k, ed.j, val);
    else { const el = this._rowEls.get(ed.k); if (el) el.__sig = null; this._render(false); }
  },
  _commitCell(k, j, val) {
    const c = this._cols[j];
    let ch = null;
    switch (c.key) {
      case 'name': ch = { name: String(val).trim() || this._rec(k).name }; break;
      case 'start': if (gDay(val) != null) ch = { start: val }; break;
      case 'end': if (gDay(val) != null) ch = { end: val }; break;
      case 'duration': ch = { duration: Math.max(1, Math.round(+val) || 1) }; break;
      case 'progress': ch = { progress: clamp(+val || 0, 0, 100) }; break;
      case 'assignee': ch = { assignees: String(val) }; break;
      default: ch = c.set ? c.set(this._public(k), val) : { [c.key]: c.type === 'number' ? (val === '' ? null : +val) : val };
    }
    const el = this._rowEls.get(k);
    if (el) el.__sig = null;
    if (ch && isObj(ch)) this._userUpdate(k, ch); else this._render(false);
  },

  /* ── grid events ── */
  _bindGrid() {
    const ge = this._gridEl;
    on(ge, 'click', '[data-toggle]', (e, t) => { e.stopPropagation(); const k = t.closest('.o-gantt-row')?.dataset.k; if (k != null) { this._toggle(k); this._setActive(k, -1, { scroll: false }); } });
    on(ge, 'click', '.o-gantt-row', (e, row) => {
      if (e.target.closest('.o-gantt-editor')) return;
      const k = row.dataset.k, cell = e.target.closest('.o-gantt-cell');
      const j = cell ? [...row.children].indexOf(cell) : -1;
      this._setActive(k, j, { scroll: false });
      this.emit('task-click', { id: this._idOf(k), task: this._public(k), originalEvent: e }, { cancelable: false });
    });
    on(ge, 'dblclick', '.o-gantt-cell', (e, cell) => {
      const row = cell.closest('.o-gantt-row'), k = row?.dataset.k;
      if (k == null || e.target.closest('[data-toggle]')) return;
      this._startEdit(k, [...row.children].indexOf(cell));
    });
    on(ge, 'focus', () => {
      this._tabRelease = false;
      if (!this._act || !this._rowIndex.has(this._act.k)) { const k = this._sel ?? this._rows[0]; if (k != null) this._setActive(k, -1, { scroll: false, select: false }); }
      this._render(false);
    });
    on(ge, 'pointermove', e => { const row = e.target.closest('.o-gantt-row'); this._hover(row ? row.dataset.k : null); });
    on(ge, 'pointerleave', () => this._hover(null));
    // column resize
    on(this._ghrow, 'pointerdown', '.o-gantt-col-resize', (e, grip) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const j = +grip.dataset.col, c = this._cols[j], x0 = e.clientX, w0 = c.width, rtl = isRTL(this);
      grip.setPointerCapture(e.pointerId);
      const move = ev => { c.width = Math.max(c.min, Math.round(w0 + (rtl ? x0 - ev.clientX : ev.clientX - x0))); this._colW.set(c.key, c.width); this._layoutCols(); if (this._userGridW == null && !this.gridWidth) this._layout(); };
      const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); this._layout(); this._render(true); this.emit('column-resize', { key: c.key, width: c.width }, { cancelable: false }); };
      grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    });
    // splitter
    on(this._split, 'pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      const x0 = e.clientX, w0 = this._gridShown ? this._gridW() : 0, rtl = isRTL(this);
      this._split.setPointerCapture(e.pointerId);
      this.classList.add('is-resizing');
      const move = ev => {
        const w = w0 + (rtl ? x0 - ev.clientX : ev.clientX - x0);
        if (w < 60) { if (this._gridShown) this._showGrid(false); return; }
        if (!this._gridShown) this._showGrid(true);
        this._userGridW = w; this._layout(); this._render(true);
      };
      const up = () => { this.classList.remove('is-resizing'); this._split.removeEventListener('pointermove', move); this._split.removeEventListener('pointerup', up); this._split.removeEventListener('pointercancel', up); };
      this._split.addEventListener('pointermove', move); this._split.addEventListener('pointerup', up); this._split.addEventListener('pointercancel', up);
    });
    on(this._split, 'dblclick', () => this._showGrid(!this._gridShown));
    on(this._split, 'keydown', e => {
      const rtl = isRTL(this), grow = e.key === (rtl ? 'ArrowLeft' : 'ArrowRight'), shrink = e.key === (rtl ? 'ArrowRight' : 'ArrowLeft');
      if (!grow && !shrink && e.key !== 'Enter') return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Enter') { this._showGrid(!this._gridShown); return; }
      if (!this._gridShown) { this._showGrid(true); return; }
      this._userGridW = this._gridW() + (grow ? 24 : -24);
      if (this._userGridW < 100) { this._showGrid(false); return; }
      this._layout(); this._render(true);
    });
  },
  _showGrid(show) {
    if (show === this._gridShown) return;
    if (this._editing) this._endEdit(false);
    const focusIn = this._gridEl.contains(doc.activeElement);
    this._gridShown = !!show;
    this._layout(); this._render(true); this._syncToolbar();
    if (focusIn && !show) this._chartEl.focus({ preventScroll: true });
    this._gridEl.scrollTop = this._chartEl.scrollTop;
    this.emit('grid-toggle', { visible: this._gridShown }, { cancelable: false });
  },
});
