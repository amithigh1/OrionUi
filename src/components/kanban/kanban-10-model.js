// @deps dnd
/* <o-kanban> — kanban / task board.
 *   <o-kanban filterable persist="sprint-12"></o-kanban>
 *   kb.columns = [{ id: 'todo', title: 'To do', color: 'info', limit: 5 }, ...];
 *   kb.cards = [{ id: 1, columnId: 'todo', title: 'Login page', labels: [{ text: 'UI', color: 'primary' }], assignees: [{ name: 'Mei Tan' }],
 *                 due: '2026-09-20', priority: 'high', progress: 40, checklist: { done: 2, total: 5 }, comments: 3, attachments: 1, cover }];
 *   kb.swimlanes = [{ id: 'web', title: 'Web' }]  (+ card.laneId)       variant="list" = compact task board
 *   kb.onMove = async ({ cardId, from, to, index }) => api.move(...)   (false / throw = revert)
 *   events: o-card-move (cancelable), o-card-add, o-card-update, o-card-remove, o-card-open, o-column-move, o-column-add,
 *           o-column-update, o-column-remove, o-filter, o-change
 *   methods: addCard, updateCard, removeCard, moveCard, addColumn, updateColumn, removeColumn, collapseColumn, getData,
 *            filter, clearFilter, openCard, closeCard, focusCard
 */
i18n.add('en', {
  kanban: {
    label: 'Kanban board', addCard: 'Add card', addCardTop: 'Add card to top', addColumn: 'Add column', add: 'Add', cancel: 'Cancel',
    cardPlaceholder: 'Enter a title for this card…', columnPlaceholder: 'Column title…', collapse: 'Collapse column', expand: 'Expand {column}',
    columnMenu: 'Column actions', cardMenu: 'Card actions', rename: 'Rename', setLimit: 'Set WIP limit', clear: 'Clear cards',
    deleteColumn: 'Delete column', confirm: 'Click again to confirm', moveLeft: 'Move column left', moveRight: 'Move column right',
    open: 'Open', duplicate: 'Duplicate', moveTo: 'Move to', deleteCard: 'Delete card', moveTop: 'Move to top', moveBottom: 'Move to bottom',
    cards: { zero: 'No cards', one: '{count} card', other: '{count} cards' }, limit: 'WIP limit {limit}',
    overLimit: 'WIP limit exceeded: {count} of {limit}', atLimit: 'WIP limit reached', blocked: '{column} is at its WIP limit',
    search: 'Search cards…', filterBy: 'Filter by assignee', labels: 'Filter by label', clearFilters: 'Clear',
    empty: 'Drop cards here', filtered: '{visible} of {total} cards', noMatches: 'No cards match the filters',
    priority: { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }, priorityLabel: 'Priority',
    dueOn: 'Due {date}', overdue: 'Overdue', dueDate: 'Due date', checklist: '{done} of {total} done', checklistLabel: 'Checklist',
    comments: { one: '{count} comment', other: '{count} comments' }, attachments: { one: '{count} attachment', other: '{count} attachments' },
    progress: 'Progress', assignees: 'Assignees', status: 'Status', lane: 'Swimlane', description: 'Description', title: 'Title',
    details: 'Card details', save: 'Save changes', close: 'Close', none: 'None', toggleLane: 'Toggle {lane}', unassigned: 'Unassigned',
    moved: 'Moved {card} to {column}, position {index}', moveFailed: 'Could not move {card}. It was returned.',
    added: 'Card added to {column}', removed: 'Card deleted', columnMoved: 'Moved {column} to position {index}',
    columnAdded: 'Column {column} added', columnRemoved: 'Column deleted', limitPrompt: 'WIP limit (empty = none)',
  },
});
if (O.icons) {
  const extra = {
    flag: '<path d="M4 22V4M4 4h13l-2.5 4L17 12H4"/>',
    'message-square': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    'check-square': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 12 3 3 5-6"/>',
    'layout-list': '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/>',
  };
  for (const k in extra) if (!O.icons.has(k)) O.icons.add({ [k]: extra[k] });
}

const KB_PRIO = {
  low: { color: 'secondary', icon: 'arrow-down', rank: 1 },
  medium: { color: 'info', icon: 'minus', rank: 2 },
  high: { color: 'warning', icon: 'arrow-up', rank: 3 },
  urgent: { color: 'danger', icon: 'alert-triangle', rank: 4 },
};
const KB_COLORS = ['primary', 'secondary', 'success', 'danger', 'warning', 'info', 'light', 'dark'];
/** color token -> { cls, style } so both 'success' and '#0ea5e9' work */
function kbColor(c) {
  if (!c) return { cls: '', style: '' };
  if (KB_COLORS.includes(c)) return { cls: 'o-c-' + c, style: '' };
  const safe = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/]+\)|var\(--[\w-]+\))$/i.test(String(c).trim());
  return { cls: '', style: safe ? `--o-c:${c}` : '' };
}
const kbStr = v => (v == null ? null : String(v));

class OKanban extends OElement {
  static props = {
    columns: { type: Array, default: () => [] },
    cards: { type: Array, default: () => [] },
    swimlanes: { type: Array, default: () => [] },
    variant: { type: String, default: 'board', reflect: true },
    renderCard: { type: Function, attr: false },
    onMove: { type: Function, attr: false },
    persist: String,
    wipBlock: Boolean,
    filterable: Boolean,
    readonly: Boolean,
    lockColumns: Boolean,
    addPosition: { type: String, default: 'bottom' },
    cardActions: { type: Array, default: () => [] },
    detail: { type: String, default: 'panel' },
    height: String,
    texts: Object,
    label: String,
  };
  /* data accessors: the board keeps its own (shallow-copied) objects; frameworks set new arrays */
  get columns() { return this._cols || (this._cols = []); }
  set columns(v) { this._cols = toArr(parseAttr0(v)).map(c => ({ ...c, id: kbStr(c.id ?? uid('col')) })); this._applyPersist(); this.requestUpdate('columns'); }
  get cards() { return this._cardsArr || (this._cardsArr = []); }
  set cards(v) { this._cardsArr = toArr(parseAttr0(v)).map(c => ({ ...c, id: kbStr(c.id ?? uid('card')), columnId: kbStr(c.columnId), laneId: kbStr(c.laneId) })); this._applyPersist(); this.requestUpdate('cards'); }
  get swimlanes() { return this._lanes || (this._lanes = []); }
  set swimlanes(v) { this._lanes = toArr(parseAttr0(v)).map(l => ({ ...l, id: kbStr(l.id ?? uid('lane')) })); this.requestUpdate('swimlanes'); }

  /* ── data helpers ── */
  _card(id) { id = kbStr(id); return this.cards.find(c => c.id === id) || null; }
  _col(id) { id = kbStr(id); return this.columns.find(c => c.id === id) || null; }
  _hasLanes() { return this.swimlanes.length > 0 && this.variant !== 'list'; }
  _laneOf(card) { if (!this._hasLanes()) return null; const l = card.laneId; return l && this.swimlanes.some(x => x.id === l) ? l : this.swimlanes[0].id; }
  _cardsIn(colId, laneId) { return this.cards.filter(c => c.columnId === colId && (laneId == null || this._laneOf(c) === laneId)); }
  _count(colId) { return this.cards.filter(c => c.columnId === colId).length; }
  _limitOf(col) { return col && +col.limit > 0 ? +col.limit : 0; }
  _blocks(col) { return !!(this.wipBlock || col?.hardLimit); }
  /** Rebuild card order + column/lane membership from the DOM (the DOM is the truth after a drag). */
  _syncFromDom() {
    const order = [], seen = new Set();
    for (const cont of this.querySelectorAll('.o-kanban-cards')) {
      const colId = cont.dataset.col, laneId = cont.dataset.lane || null;
      for (const el of cont.children) {
        const c = el.classList.contains('o-kanban-card') && this._card(el.dataset.id);
        if (!c || seen.has(c.id)) continue;
        seen.add(c.id);
        c.columnId = colId;
        if (laneId) c.laneId = laneId;
        order.push(c);
      }
    }
    this._cardsArr = [...order, ...this.cards.filter(c => !seen.has(c.id))];
  }
  _snapshot() { return { columns: clone(this.columns), cards: clone(this.cards), swimlanes: clone(this.swimlanes) }; }
  getData() { return this._snapshot(); }

  /* ── persistence: orion:kanban:<key> = { cols: [ids], collapsed: [ids], lanes: [ids], cards: { id: [col, lane] }, order: [ids] } ── */
  _pkey() { return this.persist ? 'orion:kanban:' + this.persist : null; }
  _save() {
    const k = this._pkey();
    if (!k || this._restoring) return;
    const cards = {};
    this.cards.forEach(c => { cards[c.id] = [c.columnId, c.laneId ?? null]; });
    ls.set(k, { cols: this.columns.map(c => c.id), collapsed: this.columns.filter(c => c.collapsed).map(c => c.id), lanesCollapsed: this.swimlanes.filter(l => l.collapsed).map(l => l.id), cards, order: this.cards.map(c => c.id) });
  }
  _applyPersist() {
    const k = this._pkey();
    if (!k) return;
    const s = ls.get(k);
    if (!s || !isObj(s)) return;
    if (this._cols && Array.isArray(s.cols)) {
      const idx = id => { const i = s.cols.indexOf(id); return i < 0 ? 1e6 : i; };
      this._cols = this._cols.map((c, i) => [c, i]).sort((a, b) => idx(a[0].id) - idx(b[0].id) || a[1] - b[1]).map(x => x[0]);
      if (Array.isArray(s.collapsed)) this._cols.forEach(c => { c.collapsed = s.collapsed.includes(c.id); });
    }
    if (this._cardsArr && s.cards && Array.isArray(s.order)) {
      this._cardsArr.forEach(c => { const p = s.cards[c.id]; if (p) { c.columnId = p[0]; if (p[1] != null) c.laneId = p[1]; } });
      const idx = id => { const i = s.order.indexOf(id); return i < 0 ? 1e6 : i; };
      this._cardsArr = this._cardsArr.map((c, i) => [c, i]).sort((a, b) => idx(a[0].id) - idx(b[0].id) || a[1] - b[1]).map(x => x[0]);
    }
    if (this._lanes && Array.isArray(s.lanesCollapsed)) this._lanes.forEach(l => { l.collapsed = s.lanesCollapsed.includes(l.id); });
  }
  _notify(reason) { this._save(); this.emit('change', { reason, columns: this.columns, cards: this.cards }); }
}
/** Array props may arrive as JSON strings (attributes / React 18). */
function parseAttr0(v) { return isStr(v) ? parseAttr(v, Array) : v; }
