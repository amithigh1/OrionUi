/* <o-kanban> rendering: board / list variant, columns, swimlanes, cards (keyed, patched in place). */
Object.assign(OKanban.prototype, {
  setup() {
    this.classList.add('o-kanban');
    this._gid = uid('kb');
    this._sorts = new Map();         // container -> Sortable
    this._filter = { text: '', assignee: [], label: [] };
    this.toolbarEl = h('div', { class: 'o-kanban-toolbar', hidden: true });
    this.board = h('div', { class: 'o-kanban-board o-scroll', role: 'region' });
    this.live = h('div', { class: 'o-sr-only', 'aria-live': 'polite' });
    this.replaceChildren(this.toolbarEl, this.board, this.live);
    this._bindUI();
  },
  update(changed) {
    if (changed.has('persist') && !changed.has('init')) this._applyPersist();
    if (changed.has('height')) this.style.height = this.height || '';
    this.board.setAttribute('aria-label', this.label || this.t('kanban.label'));
    const structural = ['init', 'columns', 'swimlanes', 'variant', 'locale', 'readonly', 'lockColumns', 'renderCard', 'texts', 'persist', 'wipBlock'].some(k => changed.has(k));
    if (structural) this._render();
    else if (changed.has('cards')) this._renderCards();
    if (structural || changed.has('filterable') || changed.has('cards')) this._renderToolbar();
  },
  disconnected() { this.closeCard?.(); this._menuClose?.(); },

  /* ── structure ── */
  _render() {
    const lanes = this._hasLanes();
    this.board.classList.toggle('has-lanes', lanes);
    this.toggleAttribute('data-lanes', lanes);
    const keep = new Set();
    if (!lanes) {
      patchList(this.board, [...this.columns, { id: '__add' }], c => (c.id === '__add' ? '__add' : 'c:' + c.id), c => (c.id === '__add' ? this._addColEl() : this._colEl(c)), (el, c) => { if (c.id !== '__add') this._colPatch(el, c); });
      this.board.querySelectorAll(':scope > .o-kanban-col').forEach(el => keep.add(el.querySelector('.o-kanban-cards')));
    } else {
      let heads = this.board.querySelector(':scope > .o-kanban-heads');
      if (!heads) {
        this.board.replaceChildren();
        heads = h('div', { class: 'o-kanban-heads' });
        this.board.append(heads);
      }
      patchList(heads, [...this.columns, { id: '__add' }], c => (c.id === '__add' ? '__add' : 'h:' + c.id), c => (c.id === '__add' ? this._addColEl() : this._headEl(c)), (el, c) => { if (c.id !== '__add') this._headPatch(el, c); });
      const laneEls = this.swimlanes.map(l => {
        let el = this.board.querySelector(`:scope > .o-kanban-lane[data-lane="${CSS.escape(l.id)}"]`);
        if (!el) el = this._laneEl(l);
        this._lanePatch(el, l);
        return el;
      });
      [...this.board.children].forEach(el => { if (el.classList.contains('o-kanban-lane') && !laneEls.includes(el)) el.remove(); });
      laneEls.forEach(el => this.board.append(el));
      laneEls.forEach(el => el.querySelectorAll('.o-kanban-cards').forEach(c => keep.add(c)));
    }
    this._renderCards();
    this._syncSortables(keep);
  },
  _colEl(col) {
    const el = h('section', { class: 'o-kanban-col', 'data-id': col.id });
    const head = this._headEl(col, true);
    const cards = h('div', { class: 'o-kanban-cards', role: 'list', 'data-col': col.id, 'data-empty': this.t('kanban.empty') });
    const foot = h('div', { class: 'o-kanban-col-foot' }, this._addBtn(col.id, null));
    el.append(head, cards, foot);
    this._colPatch(el, col);
    return el;
  },
  _colPatch(el, col) {
    const c = kbColor(col.color);
    el.className = cls('o-kanban-col', c.cls, col.collapsed && 'is-collapsed');
    el.style.cssText = c.style;
    el.dataset.id = col.id;
    const head = el.querySelector('.o-kanban-col-head');
    this._headPatch(head, col, true);
    const cards = el.querySelector('.o-kanban-cards');
    cards.setAttribute('aria-labelledby', head.querySelector('.o-kanban-col-title').id);
    cards.hidden = !!col.collapsed;
    el.querySelector('.o-kanban-col-foot').hidden = !!col.collapsed || this.readonly;
    const comp = el.querySelector('.o-kanban-composer');
    if (comp && col.collapsed) comp.remove();
  },
  _headEl(col, inColumn = false) {
    const id = uid('kbh');
    const head = h(inColumn ? 'header' : 'div', { class: 'o-kanban-col-head', 'data-id': col.id },
      h('span', { class: 'o-kanban-col-dot', 'aria-hidden': 'true' }),
      h('h3', { class: 'o-kanban-col-title', id }),
      h('span', { class: 'o-kanban-col-count' }),
      h('span', { class: 'o-kanban-col-tools' },
        h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-xs o-kanban-col-add', 'data-act': 'add-top' }, raw(icon('plus'))),
        h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-xs o-kanban-col-collapse', 'data-act': 'collapse' }, raw(icon('chevrons-left'))),
        h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-xs o-kanban-col-menu', 'data-act': 'col-menu', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, raw(icon('more-horizontal')))));
    if (!inColumn) this._headPatch(head, col);
    return head;
  },
  _headPatch(head, col, inColumn = false) {
    const c = kbColor(col.color);
    if (!inColumn) { head.className = cls('o-kanban-col-head', 'is-lane-head', c.cls, col.collapsed && 'is-collapsed'); head.style.cssText = c.style; }
    head.dataset.id = col.id;
    const title = head.querySelector('.o-kanban-col-title');
    if (!title.querySelector('input')) title.textContent = col.title ?? col.id;
    const add = head.querySelector('.o-kanban-col-add'), coll = head.querySelector('.o-kanban-col-collapse'), menu = head.querySelector('.o-kanban-col-menu');
    add.hidden = this.readonly || !!col.collapsed;
    add.setAttribute('aria-label', this.t('kanban.addCardTop'));
    add.title = this.t('kanban.addCardTop');
    const name = col.title ?? col.id;
    coll.setAttribute('aria-label', col.collapsed ? this.t('kanban.expand', { column: name }) : this.t('kanban.collapse'));
    coll.title = coll.getAttribute('aria-label');
    coll.setAttribute('aria-expanded', String(!col.collapsed));
    coll.innerHTML = String(icon(col.collapsed ? 'chevrons-right' : 'chevrons-left'));
    menu.setAttribute('aria-label', this.t('kanban.columnMenu'));
    menu.title = this.t('kanban.columnMenu');
    menu.hidden = this.readonly;
    this._countPatch(col);
  },
  _addBtn(colId, laneId) {
    return h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm o-kanban-add-btn', 'data-act': 'add', 'data-col': colId, 'data-lane': laneId }, raw(icon('plus')), h('span', null, this.t('kanban.addCard')));
  },
  _addColEl() {
    const el = h('div', { class: 'o-kanban-add-col' },
      h('button', { type: 'button', class: 'o-btn o-btn-ghost o-kanban-add-col-btn', 'data-act': 'add-col' }, raw(icon('plus')), h('span', null, this.t('kanban.addColumn'))));
    el.hidden = this.readonly;
    el.__okey = '__add';
    return el;
  },
  _laneEl(lane) {
    const el = h('div', { class: 'o-kanban-lane', 'data-lane': lane.id });
    const tid = uid('kbl');
    el.append(
      h('div', { class: 'o-kanban-lane-head' },
        h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-xs', 'data-act': 'lane-toggle', 'aria-expanded': 'true' }, raw(icon('chevron-down'))),
        h('span', { class: 'o-kanban-lane-title', id: tid }),
        h('span', { class: 'o-badge o-badge-sm o-kanban-lane-count' })),
      h('div', { class: 'o-kanban-lane-row', role: 'group', 'aria-labelledby': tid }));
    return el;
  },
  _lanePatch(el, lane) {
    el.classList.toggle('is-collapsed', !!lane.collapsed);
    el.querySelector('.o-kanban-lane-title').textContent = lane.title ?? lane.id;
    const tg = el.querySelector('[data-act="lane-toggle"]');
    tg.setAttribute('aria-expanded', String(!lane.collapsed));
    tg.setAttribute('aria-label', this.t('kanban.toggleLane', { lane: lane.title ?? lane.id }));
    const row = el.querySelector('.o-kanban-lane-row');
    row.hidden = !!lane.collapsed;
    patchList(row, this.columns, c => c.id, c => h('div', { class: 'o-kanban-cell', 'data-col': c.id },
      h('div', { class: 'o-kanban-cards', role: 'list', 'data-col': c.id, 'data-lane': lane.id, 'data-empty': this.t('kanban.empty') }),
      h('div', { class: 'o-kanban-col-foot' }, this._addBtn(c.id, lane.id))));
    for (const cell of row.children) {
      const c = this._col(cell.dataset.col);
      if (!c) continue;
      const k = kbColor(c.color);
      cell.className = cls('o-kanban-cell', k.cls, c.collapsed && 'is-collapsed');
      cell.style.cssText = k.style;
      const cards = cell.querySelector('.o-kanban-cards');
      cards.hidden = !!c.collapsed;
      cards.setAttribute('aria-label', `${c.title ?? c.id} · ${lane.title ?? lane.id}`);
      cell.querySelector('.o-kanban-col-foot').hidden = !!c.collapsed || this.readonly;
    }
  },
  _countPatch(col) {
    const n = this._count(col.id), lim = this._limitOf(col);
    const vis = this._filterActive() ? this.cards.filter(c => c.columnId === col.id && this._matches(c)).length : n;
    const over = lim && n > lim, at = lim && n === lim;
    const heads = this.querySelectorAll(`.o-kanban-col-head[data-id="${CSS.escape(col.id)}"]`);
    heads.forEach(head => {
      const cnt = head.querySelector('.o-kanban-col-count');
      const txt = (this._filterActive() ? vis + ' / ' : '') + n + (lim ? ' / ' + lim : '');
      cnt.replaceChildren();
      if (over) cnt.append(iconEl('alert-triangle'));
      cnt.append(h('span', null, lim && this._filterActive() ? `${vis} · ${n}/${lim}` : txt));
      cnt.className = cls('o-kanban-col-count', over && 'is-over', at && 'is-at');
      cnt.title = over ? this.t('kanban.overLimit', { count: n, limit: lim }) : lim ? this.t('kanban.limit', { limit: lim }) : this.t('kanban.cards', { count: n });
      cnt.setAttribute('aria-label', (this._filterActive() ? this.t('kanban.filtered', { visible: vis, total: n }) : this.t('kanban.cards', { count: n })) + (over ? '. ' + this.t('kanban.overLimit', { count: n, limit: lim }) : lim ? '. ' + this.t('kanban.limit', { limit: lim }) : ''));
    });
    const colEl = this.board.querySelector(`:scope > .o-kanban-col[data-id="${CSS.escape(col.id)}"]`);
    [colEl, ...heads].forEach(el => el && el.classList.toggle('is-over-limit', !!over));
    this.querySelectorAll(`.o-kanban-cell[data-col="${CSS.escape(col.id)}"]`).forEach(el => el.classList.toggle('is-over-limit', !!over));
  },
  _refreshCounts() {
    this.columns.forEach(c => this._countPatch(c));
    this.querySelectorAll('.o-kanban-lane').forEach(el => {
      const id = el.dataset.lane, n = this.cards.filter(c => this._laneOf(c) === id && this._col(c.columnId)).length;
      const b = el.querySelector('.o-kanban-lane-count');
      b.textContent = n; b.setAttribute('aria-label', this.t('kanban.cards', { count: n }));
    });
  },

  /* ── cards ── */
  _renderCards() {
    for (const cont of this.querySelectorAll('.o-kanban-cards')) {
      const list = this._cardsIn(cont.dataset.col, cont.dataset.lane || null);
      patchList(cont, list, c => c.id, c => this._cardEl(c), (el, c) => this._cardPatch(el, c));
    }
    this._applyFilter(false);
    this._refreshCounts();
  },
  _cardEl(card) {
    const el = h('article', { class: 'o-kanban-card', role: 'listitem', tabindex: '0', 'data-id': card.id });
    this._cardPatch(el, card);
    return el;
  },
  _cardSig(card) { try { return JSON.stringify(card) + '|' + i18n.locale + '|' + this.readonly; } catch { return Math.random(); } },
  _cardPatch(el, card) {
    const sig = this._cardSig(card);
    if (el.__osig === sig) return;
    el.__osig = sig;
    el.dataset.id = card.id;
    el.dataset.priority = card.priority || '';
    const tid = el.id ? el.id + '-t' : (el.id = uid('kbc')) + '-t';
    let content = null;
    if (isFn(this.renderCard)) {
      const r = this.renderCard(card, this);
      content = r instanceof Node ? r : raw(r instanceof SafeHTML ? r.s : String(r ?? ''));
    }
    el.replaceChildren();
    if (content) append(el, content);
    else el.append(...this._cardParts(card, tid));
    if (!this.readonly && !el.querySelector('.o-kanban-card-menu')) {
      const top = el.querySelector('.o-kanban-card-top') || el;
      top.append(h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-xs o-kanban-card-menu', 'data-act': 'card-menu', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': this.t('kanban.cardMenu'), title: this.t('kanban.cardMenu') }, raw(icon('more-horizontal'))));
    }
    const t = el.querySelector('.o-kanban-card-title');
    if (t) { t.id = tid; el.setAttribute('aria-labelledby', tid); } else el.setAttribute('aria-label', card.title || card.id);
  },
  _cardParts(card, tid) {
    const out = [];
    if (card.cover) {
      const cv = String(card.cover);
      const isColor = /^(#|rgb|hsl|var\()/.test(cv) || KB_COLORS.includes(cv);
      const k = kbColor(cv);
      out.push(isColor ? h('div', { class: cls('o-kanban-card-cover is-color', k.cls), style: k.style, 'aria-hidden': 'true' })
        : h('div', { class: 'o-kanban-card-cover', 'aria-hidden': 'true' }, h('img', { src: cv, alt: '', loading: 'lazy', draggable: 'false' })));
    }
    const body = h('div', { class: 'o-kanban-card-body' });
    const labels = toArr(card.labels);
    if (labels.length) {
      body.append(h('div', { class: 'o-kanban-card-labels' }, labels.map(l => { const lb = isStr(l) ? { text: l } : l; const k = kbColor(lb.color || 'secondary'); return h('span', { class: cls('o-kanban-label', k.cls), style: k.style }, lb.text); })));
    }
    body.append(h('div', { class: 'o-kanban-card-top' }, h('span', { class: 'o-kanban-card-title', id: tid }, card.title || '')));
    if (card.description) body.append(h('p', { class: 'o-kanban-card-desc' }, card.description));
    if (card.progress != null && card.progress !== '') {
      const p = clamp(+card.progress || 0, 0, 100);
      body.append(h('div', { class: 'o-kanban-card-progress' },
        h('div', { class: cls('o-progress o-progress-sm', p >= 100 ? 'o-c-success' : ''), role: 'progressbar', 'aria-valuenow': p, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': this.t('kanban.progress') }, h('div', { class: 'o-progress-bar', style: `--o-value:${p}%` })),
        h('span', { class: 'o-kanban-card-pct' }, fmt.percent(p / 100))));
    }
    const meta = h('div', { class: 'o-kanban-card-meta' });
    const pr = KB_PRIO[card.priority];
    if (pr) meta.append(h('span', { class: cls('o-kanban-meta o-kanban-prio', 'o-c-' + pr.color), title: this.t('kanban.priorityLabel') }, raw(icon(pr.icon)), h('span', null, this.t('kanban.priority.' + card.priority))));
    if (card.due) {
      const d = date.parse(card.due);
      if (d) {
        const days = date.diff(d, date.today(), 'd');
        const done = this._col(card.columnId)?.done;
        const st = done ? '' : days < 0 ? 'is-overdue' : days <= 2 ? 'is-soon' : '';
        meta.append(h('span', { class: cls('o-kanban-meta o-kanban-due', st), title: st === 'is-overdue' ? this.t('kanban.overdue') : this.t('kanban.dueDate') },
          raw(icon(st === 'is-overdue' ? 'alert-circle' : 'calendar')), h('time', { datetime: date.toISODate(d) }, fmt.date(d, { month: 'short', day: 'numeric' })),
          st === 'is-overdue' ? h('span', { class: 'o-sr-only' }, ' ' + this.t('kanban.overdue')) : null));
      }
    }
    const cl = card.checklist;
    if (cl && +cl.total > 0) meta.append(h('span', { class: cls('o-kanban-meta', +cl.done >= +cl.total && 'is-done'), title: this.t('kanban.checklist', { done: cl.done, total: cl.total }) }, raw(icon('check-square')), h('span', null, `${+cl.done || 0}/${+cl.total}`)));
    if (+card.comments > 0) meta.append(h('span', { class: 'o-kanban-meta', title: this.t('kanban.comments', { count: +card.comments }) }, raw(icon('message-square')), h('span', null, card.comments)));
    if (+card.attachments > 0) meta.append(h('span', { class: 'o-kanban-meta', title: this.t('kanban.attachments', { count: +card.attachments }) }, raw(icon('paperclip')), h('span', null, card.attachments)));
    const people = toArr(card.assignees).map(a => (isStr(a) ? { name: a } : a));
    if (people.length) {
      const g = h('div', { class: 'o-avatar-group o-kanban-card-people', title: people.map(p => p.name).join(', ') });
      const hasAvatar = !!customElements.get('o-avatar');
      people.slice(0, 3).forEach(p => g.append(hasAvatar ? h('o-avatar', { name: p.name, src: p.avatar || null, size: 'xs', class: 'o-avatar-xs' }) : h('span', { class: 'o-avatar o-avatar-xs', role: 'img', 'aria-label': p.name }, O.avatar?.initials ? O.avatar.initials(p.name) : String(p.name || '?').slice(0, 1))));
      if (people.length > 3) g.append(h('span', { class: 'o-avatar o-avatar-xs o-avatar-more' }, '+' + (people.length - 3)));
      meta.append(g);
    }
    if (meta.children.length) body.append(meta);
    out.push(body);
    return out;
  },
});
