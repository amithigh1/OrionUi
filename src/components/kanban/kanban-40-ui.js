/* <o-kanban> interactions: delegated actions, filter toolbar, quick add, add column, built-in menus, keyboard navigation. */
Object.assign(OKanban.prototype, {
  _say(msg) { announce(msg); },
  _bindUI() {
    on(this, 'click', '[data-act]', (e, btn) => { if (this.contains(btn)) this._act(btn.dataset.act, btn, e); });
    on(this, 'click', '.o-kanban-card', (e, card) => {
      if (e.target.closest('[data-act],a[href],button,input,textarea,select,label')) return;
      this._open(card.dataset.id);
    });
    on(this, 'click', '.o-kanban-col.is-collapsed', (e, col) => { if (!e.target.closest('button')) this.collapseColumn(col.dataset.id, false, { user: true }); });
    on(this, 'dblclick', '.o-kanban-col-title', (e, t) => { if (!this.readonly) this._renameColumn(t.closest('[data-id]').dataset.id); });
    on(this, 'contextmenu', '.o-kanban-card', (e, card) => {
      if (this.readonly || e.shiftKey) return;
      e.preventDefault();
      this._cardMenu(card.dataset.id, { x: e.clientX, y: e.clientY });
    });
    on(this, 'keydown', e => this._keydown(e));
    on(this, 'focusin', '.o-kanban-card', (e, card) => { if (e.target === card) this._setCurrent(card); });
  },
  _act(act, btn) {
    const colId = btn.closest('[data-id]')?.dataset.id;
    if (act === 'add') this._composer(btn.dataset.col, btn.dataset.lane || null, 'bottom', btn);
    else if (act === 'add-top') this._composer(colId, this._hasLanes() ? this.swimlanes[0].id : null, 'top', btn);
    else if (act === 'collapse') this.collapseColumn(colId, undefined, { user: true });
    else if (act === 'col-menu') this._colMenu(colId, btn);
    else if (act === 'card-menu') this._cardMenu(btn.closest('.o-kanban-card').dataset.id, btn);
    else if (act === 'add-col') this._addColumnForm(btn.closest('.o-kanban-add-col'));
    else if (act === 'lane-toggle') {
      const lane = this.swimlanes.find(l => l.id === btn.closest('.o-kanban-lane').dataset.lane);
      if (lane) { lane.collapsed = !lane.collapsed; this._lanePatch(btn.closest('.o-kanban-lane'), lane); this._notify('lane-toggle', true); }
    } else if (act === 'filter-person') this._toggleFilter('assignee', btn.dataset.name);
    else if (act === 'filter-label') this._toggleFilter('label', btn.dataset.label);
    else if (act === 'filter-clear') this.clearFilter();
  },
  _container(colId, laneId) {
    const sel = `.o-kanban-cards[data-col="${CSS.escape(colId)}"]` + (laneId ? `[data-lane="${CSS.escape(laneId)}"]` : '');
    return this.querySelector(sel);
  },
  _cardElOf(id) { return this.querySelector(`.o-kanban-card[data-id="${CSS.escape(String(id))}"]`); },

  /* ── roving focus over cards ── */
  _setCurrent(card) {
    if (this._curEl && this._curEl !== card) this._curEl.tabIndex = -1;
    card.tabIndex = 0;
    this._curEl = card;
    this._current = card.dataset.id;
  },
  _roving() {
    const cards = [...this.querySelectorAll('.o-kanban-card')];
    let cur = this._current && cards.find(c => c.dataset.id === this._current && !c.hidden);
    if (!cur) cur = cards.find(c => !c.hidden && c.offsetParent !== null) || cards.find(c => !c.hidden);
    cards.forEach(c => { c.tabIndex = c === cur ? 0 : -1; });
    this._curEl = cur || null;
  },
  _keydown(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const card = e.target.classList?.contains('o-kanban-card') ? e.target : null;
    if (!card) return;
    if (e.key === 'Enter') { e.preventDefault(); this._open(card.dataset.id); return; }
    if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
      e.preventDefault();
      const b = card.querySelector('.o-kanban-card-menu');
      if (b) this._cardMenu(card.dataset.id, b);
      return;
    }
    const next = this._navTarget(card, e.key);
    if (next) { e.preventDefault(); next.focus(); next.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  },
  _navTarget(card, key) {
    const vis = el => el.classList.contains('o-kanban-card') && !el.hidden && el.offsetParent !== null;
    const cont = card.parentElement, list = [...cont.children].filter(vis), i = list.indexOf(card);
    const conts = [...this.querySelectorAll('.o-kanban-cards')].filter(c => !c.hidden && c.offsetParent !== null);
    if (key === 'Home') return list[0];
    if (key === 'End') return list[list.length - 1];
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      const d = key === 'ArrowDown' ? 1 : -1;
      if (list[i + d]) return list[i + d];
      const chain = this._hasLanes() ? conts.filter(c => c.dataset.col === cont.dataset.col) : this.variant === 'list' ? conts : [];
      for (let j = chain.indexOf(cont) + d; j >= 0 && j < chain.length; j += d) { const l = [...chain[j].children].filter(vis); if (l.length) return d > 0 ? l[0] : l[l.length - 1]; }
      return null;
    }
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
    if (this.variant === 'list') return null;
    const r = card.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, dir = key === 'ArrowRight' ? 1 : -1;
    const scored = conts.filter(c => c !== cont).map(c => {
      const cr = c.getBoundingClientRect(), dx = (cr.left + cr.width / 2 - cx) * dir;
      return { c, s: dx <= 0 ? Infinity : dx + (cy >= cr.top - 8 && cy <= cr.bottom + 8 ? 0 : 1e5) };
    }).filter(x => x.s < Infinity).sort((a, b) => a.s - b.s);
    for (const { c } of scored) {
      const l = [...c.children].filter(vis);
      if (!l.length) continue;
      return l.reduce((best, el) => { const er = el.getBoundingClientRect(); const d = Math.abs(er.top + er.height / 2 - cy); return !best || d < best.d ? { el, d } : best; }, null).el;
    }
    return null;
  },

  /* ── filter toolbar ── */
  _renderToolbar() {
    const tb = this.toolbarEl;
    tb.hidden = !this.filterable;
    if (!this.filterable) return;
    if (!tb.firstChild || tb.__loc !== i18n.locale) {
      tb.__loc = i18n.locale;
      const input = h('input', { class: 'o-input o-input-sm', type: 'search', placeholder: this.t('kanban.search'), 'aria-label': this.t('kanban.search'), value: this._filter.text || '' });
      on(input, 'input', debounce(() => this.filter({ text: input.value }, true), 160));
      on(input, 'keydown', e => { if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; this.filter({ text: '' }, true); } });
      tb.replaceChildren(
        h('div', { class: 'o-input-wrap o-kanban-search' }, raw(icon('search')), input),
        h('div', { class: 'o-kanban-people', role: 'group', 'aria-label': this.t('kanban.filterBy') }),
        h('div', { class: 'o-kanban-labels', role: 'group', 'aria-label': this.t('kanban.labels') }),
        h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm o-kanban-clear', 'data-act': 'filter-clear', hidden: true }, raw(icon('x')), h('span', null, this.t('kanban.clearFilters'))),
        h('span', { class: 'o-kanban-summary', 'aria-hidden': 'true' }));
    }
    const people = new Map(), labels = new Map();
    this.cards.forEach(c => {
      toArr(c.assignees).forEach(a => { const p = isStr(a) ? { name: a } : a; if (p?.name && !people.has(p.name)) people.set(p.name, p); });
      toArr(c.labels).forEach(l => { const lb = isStr(l) ? { text: l } : l; if (lb?.text && !labels.has(lb.text)) labels.set(lb.text, lb); });
    });
    const hasAvatar = !!customElements.get('o-avatar');
    patchList(tb.querySelector('.o-kanban-people'), [...people.values()].slice(0, 10), p => p.name,
      p => h('button', { type: 'button', class: 'o-kanban-person', 'data-act': 'filter-person', 'data-name': p.name, title: p.name, 'aria-label': p.name },
        hasAvatar ? h('o-avatar', { name: p.name, src: p.avatar || null, size: 'sm', 'aria-hidden': 'true' }) : h('span', { class: 'o-avatar o-avatar-sm' }, String(p.name).slice(0, 1))));
    patchList(tb.querySelector('.o-kanban-labels'), [...labels.values()], l => l.text, l => {
      const k = kbColor(l.color || 'secondary');
      return h('button', { type: 'button', class: 'o-chip o-kanban-filter-label', 'data-act': 'filter-label', 'data-label': l.text }, h('span', { class: cls('o-dot', k.cls), style: k.style }), h('span', null, l.text));
    });
    this._paintToolbar();
  },
  _paintToolbar(vis, total) {
    const tb = this.toolbarEl, f = this._filter;
    if (!this.filterable || !tb.firstChild) return;
    tb.querySelectorAll('.o-kanban-person').forEach(b => b.setAttribute('aria-pressed', String(f.assignee.includes(b.dataset.name))));
    tb.querySelectorAll('.o-kanban-filter-label').forEach(b => b.setAttribute('aria-pressed', String(f.label.includes(b.dataset.label))));
    const active = this._filterActive();
    tb.querySelector('.o-kanban-clear').hidden = !active;
    tb.querySelector('.o-kanban-summary').textContent = active && total != null ? this.t('kanban.filtered', { visible: vis, total }) : '';
    const input = tb.querySelector('input');
    if (input && input.value !== (f.text || '') && doc.activeElement !== input) input.value = f.text || '';
  },
  _toggleFilter(kind, v) {
    const cur = new Set(this._filter[kind]);
    cur.has(v) ? cur.delete(v) : cur.add(v);
    this.filter({ [kind]: [...cur] }, true);
  },
  /** filter('text') | filter({ text, assignee: [names], label: [texts] }) — merges with the current filter */
  filter(f = {}, user = false) {
    if (isStr(f)) f = { text: f };
    const cur = this._filter;
    this._filter = { text: f.text ?? cur.text ?? '', assignee: toArr(f.assignee ?? cur.assignee), label: toArr(f.label ?? cur.label) };
    return this._applyFilter(true, user);
  },
  clearFilter() { this._filter = { text: '', assignee: [], label: [] }; return this._applyFilter(true, true); },
  _filterActive() { const f = this._filter; return !!(f && (f.text || f.assignee.length || f.label.length)); },
  _matches(card) {
    const f = this._filter;
    if (f.text) {
      const hay = [card.title, card.description, ...toArr(card.labels).map(l => l?.text ?? l), ...toArr(card.assignees).map(a => a?.name ?? a)].join(' ').toLowerCase();
      if (!f.text.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w))) return false;
    }
    if (f.assignee.length && !toArr(card.assignees).some(a => f.assignee.includes(a?.name ?? a))) return false;
    if (f.label.length && !toArr(card.labels).some(l => f.label.includes(l?.text ?? l))) return false;
    return true;
  },
  _applyFilter(notify, user) {
    const active = this._filterActive();
    let vis = 0, total = 0;
    for (const el of this.querySelectorAll('.o-kanban-card')) {
      const c = this._card(el.dataset.id);
      if (!c) continue;
      total++;
      const m = !active || this._matches(c);
      el.hidden = !m;
      if (m) vis++;
    }
    this.classList.toggle('is-filtered', active);
    this._paintToolbar(vis, total);
    if (notify) {
      this._refreshCounts();
      this._roving();
      if (user) this._say(active ? (vis ? this.t('kanban.filtered', { visible: vis, total }) : this.t('kanban.noMatches')) : this.t('kanban.cards', { count: total }));
      this.emit('filter', { filter: { ...this._filter }, visible: vis, total });
    }
    return vis;
  },

  /* ── quick add ── */
  _composer(colId, laneId, pos = 'bottom', trigger) {
    this._composerClose();
    const col = this._col(colId);
    if (!col || this.readonly) return;
    if (col.collapsed) this.collapseColumn(colId, false, { user: true });
    const cont = this._container(colId, laneId);
    if (!cont) return;
    const ta = h('textarea', { class: 'o-input o-kanban-composer-input', rows: 2, placeholder: this.t('kanban.cardPlaceholder'), 'aria-label': this.t('kanban.addCard') + ': ' + (col.title ?? col.id) });
    const addB = h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm' }, this.t('kanban.add'));
    const cancelB = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': this.t('kanban.cancel'), title: this.t('kanban.cancel') }, raw(icon('x')));
    const box = h('div', { class: 'o-kanban-composer' }, ta, h('div', { class: 'o-kanban-composer-actions' }, addB, cancelB));
    const foot = cont.parentElement.querySelector(':scope > .o-kanban-col-foot');
    if (pos === 'top') cont.before(box); else cont.after(box);
    if (foot && pos !== 'top') foot.hidden = true;
    const submit = () => {
      const title = ta.value.trim();
      if (!title) { ta.focus(); return; }
      if (this.addCard({ title, columnId: colId, laneId }, { position: pos, user: true })) {
        ta.value = '';
        ta.focus();
        if (pos === 'top') cont.scrollTop = 0; else cont.scrollTop = cont.scrollHeight;
      }
    };
    on(ta, 'keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this._composerClose(true); }
    });
    addB.onclick = submit;
    cancelB.onclick = () => this._composerClose(true);
    on(box, 'focusout', () => setTimeout(() => { if (this._comp?.box === box && !box.contains(doc.activeElement) && !ta.value.trim()) this._composerClose(); }, 150));
    this._comp = { box, foot, trigger };
    ta.focus();
    box.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  },
  _composerClose(refocus) {
    const c = this._comp;
    if (!c) return;
    this._comp = null;
    c.box.remove();
    if (c.foot) c.foot.hidden = !!this.readonly;
    if (refocus && c.trigger?.isConnected) c.trigger.focus();
  },

  /* ── add / rename column, WIP limit ── */
  _addColumnForm(wrap) {
    if (!wrap || wrap.querySelector('input')) return;
    const btn = wrap.querySelector('button');
    const input = h('input', { class: 'o-input o-input-sm', placeholder: this.t('kanban.columnPlaceholder'), 'aria-label': this.t('kanban.addColumn') });
    const form = h('div', { class: 'o-kanban-add-col-form' }, input, h('div', { class: 'o-kanban-composer-actions' },
      h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm', onClick: () => submit() }, this.t('kanban.add')),
      h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': this.t('kanban.cancel'), onClick: () => close(true) }, raw(icon('x')))));
    const close = (refocus) => { form.remove(); btn.hidden = false; if (refocus) btn.focus(); };
    const submit = () => {
      const title = input.value.trim();
      if (!title) { input.focus(); return; }
      if (this.addColumn({ title }, undefined, { user: true })) { input.value = ''; input.focus(); this.board.scrollLeft = isRTL(this) ? -this.board.scrollWidth : this.board.scrollWidth; }
    };
    on(input, 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); } });
    on(form, 'focusout', () => setTimeout(() => { if (form.isConnected && !form.contains(doc.activeElement) && !input.value.trim()) close(); }, 150));
    btn.hidden = true;
    wrap.append(form);
    input.focus();
  },
  _inlineEdit(host, value, { type = 'text', label, onDone }) {
    const input = h('input', { class: 'o-input o-input-sm o-kanban-inline', type, value: value ?? '', 'aria-label': label });
    if (type === 'number') { input.min = 0; input.step = 1; }
    const prev = [...host.childNodes];
    host.replaceChildren(input);
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const v = input.value;
      host.replaceChildren(...prev);
      onDone(commit, v);
    };
    on(input, 'keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
    on(input, 'blur', () => finish(true));
    on(input, 'pointerdown', e => e.stopPropagation());
    input.focus();
    input.select();
  },
  _renameColumn(id) {
    const col = this._col(id);
    const head = this.querySelector(`.o-kanban-col-head[data-id="${CSS.escape(id)}"]`);
    if (!col || !head) return;
    const title = head.querySelector('.o-kanban-col-title');
    this._inlineEdit(title, col.title, {
      label: this.t('kanban.rename'),
      onDone: (commit, v) => { if (commit && v.trim() && v.trim() !== col.title) this.updateColumn(id, { title: v.trim() }, { user: true }); head.focus(); },
    });
  },
  _editLimit(id) {
    const col = this._col(id);
    const head = this.querySelector(`.o-kanban-col-head[data-id="${CSS.escape(id)}"]`);
    if (!col || !head) return;
    this._inlineEdit(head.querySelector('.o-kanban-col-count'), col.limit || '', {
      type: 'number', label: this.t('kanban.limitPrompt'),
      onDone: (commit, v) => { if (commit) this.updateColumn(id, { limit: +v > 0 ? Math.round(+v) : null }, { user: true }); head.focus(); },
    });
  },

  /* ── built-in menu (apps may replace it: preventDefault() on o-column-menu / o-card-menu) ── */
  _menu(anchor, items, pick) {
    this._menuClose();
    const menu = h('div', { class: 'o-kanban-menu o-floating', role: 'menu' });
    for (const it of items) {
      if (it.separator) { menu.append(h('div', { class: 'o-kanban-menu-sep', role: 'separator' })); continue; }
      if (it.heading) { menu.append(h('div', { class: 'o-kanban-menu-heading', role: 'presentation' }, it.heading)); continue; }
      const b = h('button', { type: 'button', role: 'menuitem', tabindex: '-1', class: cls('o-kanban-menu-item', it.danger && 'is-danger'), 'data-id': it.id, disabled: !!it.disabled },
        it.icon ? raw(icon(it.icon)) : h('span', { class: 'o-kanban-menu-noicon' }), h('span', null, it.label));
      b.onclick = () => {
        if (it.confirm && !b.classList.contains('is-confirm')) { b.classList.add('is-confirm'); b.lastChild.textContent = this.t('kanban.confirm'); return; }
        this._menuClose();
        pick(it.id, it);
      };
      menu.append(b);
    }
    portal(menu, this);
    const unplace = autoPlace(menu, anchor, { placement: 'bottom-end', offset: 4, flip: true });
    const nav = new ListNav(menu, { items: '[role=menuitem]:not([disabled])' });
    on(menu, 'keydown', e => { if (e.key === 'Tab') { e.preventDefault(); this._menuClose(); } else if (e.key !== 'Enter' && e.key !== ' ') nav.handle(e); });
    const btn = anchor instanceof Element ? anchor : null;
    this._ov = overlays.open({
      el: menu, owner: btn,
      onClose: () => { unplace(); menu.remove(); btn?.setAttribute('aria-expanded', 'false'); btn?.closest('.o-kanban-card')?.classList.remove('is-menu-open'); this._ov = null; },
    });
    btn?.setAttribute('aria-expanded', 'true');
    btn?.closest('.o-kanban-card')?.classList.add('is-menu-open');
    animate(menu, 'zoomIn', { duration: 120 });
    nav.first();
    return menu;
  },
  _menuClose() { this._ov?.close('api'); },
  _colMenu(colId, anchor) {
    const col = this._col(colId);
    if (!col) return;
    const i = this.columns.indexOf(col), last = this.columns.length - 1, rtl = isRTL(this), n = this._count(colId);
    const items = [
      { id: 'add', label: this.t('kanban.addCard'), icon: 'plus', disabled: !!col.collapsed },
      { id: 'rename', label: this.t('kanban.rename'), icon: 'edit' },
      { id: 'limit', label: this.t('kanban.setLimit'), icon: 'flag' },
      { id: 'collapse', label: col.collapsed ? this.t('kanban.expand', { column: col.title ?? col.id }) : this.t('kanban.collapse'), icon: col.collapsed ? 'chevrons-right' : 'chevrons-left' },
      { id: 'left', label: this.t('kanban.moveLeft'), icon: 'arrow-left', disabled: this.lockColumns || (rtl ? i === last : i === 0) },
      { id: 'right', label: this.t('kanban.moveRight'), icon: 'arrow-right', disabled: this.lockColumns || (rtl ? i === 0 : i === last) },
      { separator: true },
      { id: 'clear', label: this.t('kanban.clear'), icon: 'x', danger: true, confirm: true, disabled: !n },
      { id: 'delete', label: this.t('kanban.deleteColumn'), icon: 'trash', danger: true, confirm: true },
    ];
    const run = id => this._colAction(id, colId);
    if (!this.emit('column-menu', { column: col, items, anchor, run })) return;
    this._menu(anchor, items, run);
  },
  _colAction(id, colId) {
    const col = this._col(colId);
    if (!col) return;
    const rtl = isRTL(this);
    if (id === 'add') this._composer(colId, this._hasLanes() ? this.swimlanes[0].id : null, this.addPosition === 'top' ? 'top' : 'bottom');
    else if (id === 'rename') this._renameColumn(colId);
    else if (id === 'limit') this._editLimit(colId);
    else if (id === 'collapse') this.collapseColumn(colId, undefined, { user: true });
    else if (id === 'left' || id === 'right') this.moveColumn(colId, this.columns.indexOf(col) + ((id === 'left') !== rtl ? -1 : 1), { user: true });
    else if (id === 'clear') this._cardsIn(colId).forEach(c => this.removeCard(c.id, { user: true, quiet: true }));
    else if (id === 'delete') this.removeColumn(colId, { user: true });
  },
  _cardMenu(cardId, anchor) {
    const card = this._card(cardId);
    if (!card || this.readonly) return;
    const peers = this._cardsIn(card.columnId, this._hasLanes() ? this._laneOf(card) : null), idx = peers.indexOf(card);
    const cont = this._container(card.columnId, this._hasLanes() ? this._laneOf(card) : null);
    const items = [
      { id: 'open', label: this.t('kanban.open'), icon: 'eye' },
      { id: 'duplicate', label: this.t('kanban.duplicate'), icon: 'copy' },
      { id: 'top', label: this.t('kanban.moveTop'), icon: 'arrow-up', disabled: idx === 0 },
      { id: 'bottom', label: this.t('kanban.moveBottom'), icon: 'arrow-down', disabled: idx === peers.length - 1 },
    ];
    const others = this.columns.filter(c => c.id !== card.columnId);
    if (others.length) {
      items.push({ heading: this.t('kanban.moveTo') });
      const el = this._cardElOf(cardId);
      others.forEach(c => items.push({ id: 'move:' + c.id, label: c.title ?? c.id, icon: 'arrow-right', disabled: !this._canDrop(this._container(c.id, this._hasLanes() ? this._laneOf(card) : null) || cont, el) }));
    }
    toArr(this.cardActions).forEach((a, i) => { if (!i) items.push({ separator: true }); items.push({ ...a, id: 'x:' + a.id }); });
    items.push({ separator: true }, { id: 'delete', label: this.t('kanban.deleteCard'), icon: 'trash', danger: true, confirm: true });
    const run = id => this._cardAction(id, cardId);
    if (!this.emit('card-menu', { card, items, anchor, run })) return;
    this._menu(anchor, items, run);
  },
  _cardAction(id, cardId) {
    const card = this._card(cardId);
    if (!card) return;
    const lane = this._hasLanes() ? this._laneOf(card) : null;
    if (id === 'open') this._open(cardId);
    else if (id === 'duplicate') { const { id: _, ...rest } = clone(card); this.addCard(rest, { after: cardId, user: true }); }
    else if (id === 'top') this.moveCard(cardId, card.columnId, 0, lane, { user: true });
    else if (id === 'bottom') this.moveCard(cardId, card.columnId, Infinity, lane, { user: true });
    else if (id.startsWith('move:')) this.moveCard(cardId, id.slice(5), Infinity, lane, { user: true });
    else if (id === 'delete') this.removeCard(cardId, { user: true });
    else if (id.startsWith('x:')) this.emit('card-action', { action: id.slice(2), card });
    else this.emit('card-action', { action: id, card });
  },
});
define('o-kanban', OKanban);
O.Kanban = OKanban;
/** Orion.kanban(el, options) -> the <o-kanban> element (creates one if el is a plain container). */
O.kanban = function (target, options = {}) {
  let el = isStr(target) ? $(target) : target;
  if (el && el.localName !== 'o-kanban') {
    const host = el;
    el = h('o-kanban');
    host.replaceWith(el);
  }
  if (!el) { el = h('o-kanban'); doc.body.appendChild(el); }
  Object.assign(el, options);
  return el;
};
