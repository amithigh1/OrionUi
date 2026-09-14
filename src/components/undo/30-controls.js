/* <o-undo-controls for="managerId"> — undo / redo buttons with a history menu.
 *   for: UndoManager id (new UndoManager({ id })), an element id with .undoManager (Orion.undoable), or a global variable name
 *   .manager = um (property, wins over `for`) · labels (show text) · size="sm|md" · no-history · texts
 *   Events: o-undo, o-redo, o-goto { index }
 */
const __undoKey = redo => (isFn(O.shortcuts?.format) ? O.shortcuts.format(redo ? (UNDO_MAC ? 'mod+shift+z' : 'mod+y') : 'mod+z') : UNDO_MAC ? (redo ? '⇧⌘Z' : '⌘Z') : redo ? 'Ctrl+Y' : 'Ctrl+Z');

class OUndoControls extends OElement {
  static props = { for: String, manager: { type: Any, attr: false }, labels: Boolean, size: { type: String, default: 'sm' }, noHistory: { type: Boolean, reflect: true }, texts: Object };
  setup() {
    this.classList.add('o-undo-controls', 'o-btn-group');
    this.setAttribute('role', 'group');
    const act = (fn) => e => { const b = e.currentTarget; if (b.getAttribute('aria-disabled') === 'true') return; fn(); };
    this._undo = h('button', { type: 'button', class: 'o-btn o-undo-btn', onClick: act(() => this.undo()) });
    this._redo = h('button', { type: 'button', class: 'o-btn o-redo-btn', onClick: act(() => this.redo()) });
    this._hist = h('button', { type: 'button', class: 'o-btn o-btn-icon o-undo-hist', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onClick: act(() => (this._ov ? this.closeHistory() : this.openHistory())) }, icon('chevron-down'));
    this._panel = h('div', { class: 'o-undo-menu o-floating o-scroll', role: 'menu', hidden: true, id: uid('undo-menu') });
    this._hist.setAttribute('aria-controls', this._panel.id);
    this.append(this._undo, this._redo, this._hist);
    this._nav = new ListNav(this._panel, { items: '[role=menuitemradio],[role=menuitem]', typeahead: false, onSelect: item => this._pick(item) });
    on(this._panel, 'keydown', e => { if (this._nav.handle(e)) return; if (e.key === 'Tab') this.closeHistory(); });
    on(this._panel, 'click', '[role=menuitemradio],[role=menuitem]', (e, item) => this._pick(item));
  }
  connected() {
    this.addCleanup(bus.on('undo:register', () => this._resolve()));
    this._resolve();
  }
  disconnected() { this.closeHistory(); this._offM?.(); this._offM = null; this._m = null; }
  /** The UndoManager in use (or null). */
  get undoManager() { return this._m || null; }
  undo() { const m = this._m, l = m?.undoLabel; if (m?.undo()) { this.emit('undo', { label: l }); announce(t('undo.undone', { label: l || t('undo.untitled') })); } }
  redo() { const m = this._m, l = m?.redoLabel; if (m?.redo()) { this.emit('redo', { label: l }); announce(t('undo.redone', { label: l || t('undo.untitled') })); } }
  update(changed) {
    if (changed.has('for') || changed.has('manager')) this._resolve();
    if (changed.has('init') || changed.has('labels') || changed.has('size') || changed.has('locale') || changed.has('texts')) {
      const sm = this.size === 'sm';
      [this._undo, this._redo, this._hist].forEach(b => b.classList.toggle('o-btn-sm', sm));
      this._undo.classList.toggle('o-btn-icon', !this.labels); this._redo.classList.toggle('o-btn-icon', !this.labels);
      this._undo.innerHTML = String(icon('undo')) + (this.labels ? `<span>${esc(this.t('undo.undo'))}</span>` : '');
      this._redo.innerHTML = String(icon('redo')) + (this.labels ? `<span>${esc(this.t('undo.redo'))}</span>` : '');
      this._hist.setAttribute('aria-label', this.t('undo.history'));
      this.setAttribute('aria-label', this.t('undo.group'));
    }
    this._hist.hidden = this.noHistory;
    this._paint();
  }
  _resolve() {
    const f = this.for;
    let m = this.manager instanceof UndoManager ? this.manager : null;
    if (!m && f) m = UndoManager.get(f) || (isBrowser && doc.getElementById(f)?.undoManager) || (isBrowser && win[f] instanceof UndoManager ? win[f] : null);
    if (m === this._m) return;
    this._offM?.();
    this._m = m || null;
    this._offM = m ? m.on('change', () => this._paint()) : null;
    this._paint();
  }
  _paint() {
    if (!this._setupDone) return;
    const m = this._m, dis = (b, off) => { b.setAttribute('aria-disabled', String(!!off)); };
    dis(this._undo, !m?.canUndo); dis(this._redo, !m?.canRedo); dis(this._hist, !m?.size);
    const ul = m?.undoLabel, rl = m?.redoLabel;
    const ua = ul ? this.t('undo.undoLabel', { label: ul }) : this.t('undo.undo'), ra = rl ? this.t('undo.redoLabel', { label: rl }) : this.t('undo.redo');
    this._undo.setAttribute('aria-label', ua); this._undo.title = `${ua} (${__undoKey(false)})`;
    this._redo.setAttribute('aria-label', ra); this._redo.title = `${ra} (${__undoKey(true)})`;
    this._hist.title = this.t('undo.history');
    if (this._ov) { if (m?.size) this._renderMenu(); else this.closeHistory(); }
  }
  _renderMenu() {
    const m = this._m, rows = [...m.history].reverse();
    const item = (i, label, time, checked, undone) => html`<div class="o-undo-item${undone ? ' is-undone' : ''}" role="menuitemradio" aria-checked="${checked ? 'true' : 'false'}" tabindex="-1" data-index="${i}">${icon('check', { class: 'o-undo-check' })}<span class="o-undo-label">${label}</span>${time ? html`<time class="o-undo-time" datetime="${new Date(time).toISOString()}">${fmt.relative(time)}</time>` : ''}</div>`;
    this._panel.innerHTML = String(html`<div class="o-undo-menu-title">${this.t('undo.history')}</div>
      ${rows.map(e => item(e.index, e.label || this.t('undo.untitled'), e.time, e.current, !e.done))}
      ${item(-1, this.t('undo.initial'), 0, m.pointer === -1, false)}
      <div class="o-undo-sep" role="separator"></div>
      <div class="o-undo-item o-undo-clear" role="menuitem" tabindex="-1" data-action="clear">${icon('trash')}<span class="o-undo-label">${this.t('undo.clear')}</span></div>`);
  }
  openHistory() {
    const m = this._m;
    if (this._ov || !m?.size) return;
    this._renderMenu();
    portal(this._panel, this);
    this._panel.hidden = false;
    this._unplace = autoPlace(this._panel, this, { placement: 'bottom-start', offset: 4, size: true });
    this._ov = overlays.open({
      el: this._panel, owner: this,
      onClose: () => { this._ov = null; this._unplace?.(); this._panel.hidden = true; this._hist.setAttribute('aria-expanded', 'false'); },
    });
    this._hist.setAttribute('aria-expanded', 'true');
    animate(this._panel, 'zoomIn', { duration: 120 });
    const cur = this._panel.querySelector('[aria-checked="true"]');
    if (cur) this._nav.setItem(cur); else this._nav.first();
  }
  closeHistory() { this._ov?.close('api'); }
  _pick(item) {
    const m = this._m;
    if (!m) return;
    if (item.dataset.action === 'clear') { m.clear(); this.closeHistory(); this._hist.focus(); return; }
    const i = +item.dataset.index;
    m.goto(i);
    this.emit('goto', { index: i });
    announce(i < 0 ? this.t('undo.initial') : (m.history[i]?.label || this.t('undo.untitled')));
    this.closeHistory();
  }
}
define('o-undo-controls', OUndoControls);
O.UndoControls = OUndoControls;
