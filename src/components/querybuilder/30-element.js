/* <o-query-builder> — visual nested AND/OR/NOT rule builder + a compact search-bar mode.
 *   <o-query-builder fields='[{"key":"status","label":"Status","type":"select","options":["Active","Pending"]}]'></o-query-builder>
 *   el.value            // the tree: { id, type:'group', op:'and'|'or', not, children:[...] }
 *   el.toSQL({dialect}) -> { sql, params }   el.toMongo() -> {}   el.toString() -> "status is Active"
 *   el.toPredicate() -> (row) => boolean     el.fromJSON(json)
 * Events: o-change { value, valid } (also native `input`/`change` on the host — see FormElement).
 */
function qbSelectEl(options, value, placeholder) {
  const el = h('select', { class: 'o-select o-input-sm o-qb-select' });
  if (placeholder) el.append(h('option', { value: '' }, placeholder));
  for (const o of options) el.append(h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label));
  el.value = value || '';
  return el;
}

class OQueryBuilder extends FormElement {
  static props = {
    ...FormElement.props,
    value: { type: Any, default: () => qbGroup() },
    fields: { type: Array, default: () => [] },
    maxDepth: { type: Number, default: 5 },
    mode: { type: String, default: 'builder', reflect: true },
    dialect: { type: String, default: 'ansi' },
    texts: Object,
  };

  setup() {
    this.classList.add('o-querybuilder');
    this.value = qbNormalize(this.value);
    this._dragId = null;

    this.modeBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm o-qb-mode-btn' });
    on(this.modeBtn, 'click', () => { this.mode = this.mode === 'bar' ? 'builder' : 'bar'; });
    this.toolbar = h('div', { class: 'o-qb-toolbar' }, this.modeBtn);

    this.treeEl = h('div', { class: 'o-qb-tree' });
    this.barInput = h('input', { type: 'text', class: 'o-input o-qb-bar-input', placeholder: t('querybuilder.barPlaceholder'), autocomplete: 'off', spellcheck: 'false' });
    this.barWrap = h('div', { class: 'o-qb-bar' }, iconEl('filter'), this.barInput);
    on(this.barInput, 'input', debounce(() => { this.value = qbParseToTree(this.barInput.value, this.fields); this._commit(); }, 250));

    this.append(this.toolbar, this.treeEl, this.barWrap);
    this.focusTarget = this.treeEl;

    on(this.treeEl, 'dragstart', '[draggable="true"]', (e, el) => { this._dragId = el.dataset.id; el.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', el.dataset.id); } catch {} });
    on(this.treeEl, 'dragend', '[draggable="true"]', (e, el) => { el.classList.remove('is-dragging'); this._dragId = null; this.$$('.is-drop-before,.is-drop-after').forEach(x => x.classList.remove('is-drop-before', 'is-drop-after')); });
    on(this.treeEl, 'dragover', '.o-qb-rule, .o-qb-group', (e, el) => {
      if (!this._dragId || el.dataset.id === this._dragId) return;
      e.preventDefault();
      const r = el.getBoundingClientRect(), before = (e.clientY - r.top) < r.height / 2;
      el.classList.toggle('is-drop-before', before); el.classList.toggle('is-drop-after', !before);
    });
    on(this.treeEl, 'drop', '.o-qb-rule, .o-qb-group', (e, el) => {
      e.preventDefault();
      const before = el.classList.contains('is-drop-before');
      el.classList.remove('is-drop-before', 'is-drop-after');
      if (this._dragId && el.dataset.id !== this._dragId) this._moveNode(this._dragId, el.dataset.id, before);
    });
    on(this.treeEl, 'keydown', '.o-qb-grip', (e, el) => {
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault();
      this._moveSibling(el.closest('[data-id]').dataset.id, e.key === 'ArrowUp' ? -1 : 1);
    });
  }
  update(changed) {
    if (changed.has('mode') || changed.has('init')) this._syncMode();
    if (changed.has('init') || changed.has('value') || changed.has('fields') || changed.has('maxDepth') || changed.has('locale')) {
      // Always normalize: fills in missing ids (e.g. a plain object tree assigned from outside)
      // so duplicate/remove/move — which are id-keyed — never collide on `undefined`.
      this.value = qbNormalize(this.value);
      this.renderTree();
    }
  }
  isEmpty() { return qbCountRules(this.value) === 0; }
  getValidity() { return qbTreeValid(this.value, this.fields) ? null : { flags: { customError: true }, message: t('querybuilder.invalid') }; }

  /* ── public API ────────────────────────────────────────────────────── */
  toSQL(opts = {}) { return qbToSQL(this.value, this.fields, { dialect: opts.dialect || this.dialect }); }
  toMongo() { return qbToMongo(this.value, this.fields); }
  toString() { return this.value ? qbToString(this.value, this.fields) : ''; }
  toPredicate() { return qbToPredicate(this.value, this.fields); }
  fromJSON(json) { this.value = qbNormalize(isStr(json) ? parseJSON(json, qbGroup()) : json); this._commit(); return this; }
  /** true when every rule that has a field+operator also has a complete value. */
  get valid() { return qbTreeValid(this.value, this.fields); }

  /* ── commit: push a mutation through FormElement (fires input/change/o-change) ───────── */
  _commit() {
    this.toggleAttribute('data-invalid', !qbTreeValid(this.value, this.fields));
    this.setValue(this.value);
  }
  _syncMode() {
    const bar = this.mode === 'bar';
    this.treeEl.hidden = bar; this.barWrap.hidden = !bar;
    this.modeBtn.textContent = this.t(bar ? 'querybuilder.switchToBuilder' : 'querybuilder.switchToBar');
    if (bar) this.barInput.value = qbTreeToQueryString(this.value, this.fields);
  }

  /* ── tree mutation helpers ────────────────────────────────────────── */
  _moveNode(dragId, targetId, before) {
    const dragParent = qbFindParent(this.value, dragId), targetParent = qbFindParent(this.value, targetId);
    const dragNode = qbFind(this.value, dragId);
    if (!dragParent || !targetParent || !dragNode) return;
    if (dragNode.type === 'group' && qbFind(dragNode, targetId)) return; // can't drop a group into its own descendant
    const fromIdx = dragParent.children.findIndex(c => c.id === dragId);
    dragParent.children.splice(fromIdx, 1);
    let toIdx = targetParent.children.findIndex(c => c.id === targetId);
    if (dragParent === targetParent && fromIdx < toIdx) toIdx--;
    targetParent.children.splice(before ? toIdx : toIdx + 1, 0, dragNode);
    this._commit();
  }
  _moveSibling(id, dir) {
    const parent = qbFindParent(this.value, id);
    if (!parent) return;
    const idx = parent.children.findIndex(c => c.id === id), next = idx + dir;
    if (next < 0 || next >= parent.children.length) return;
    const [n] = parent.children.splice(idx, 1);
    parent.children.splice(next, 0, n);
    this._commit();
    announce(t('querybuilder.dragToReorder'));
    nextFrame().then(() => this.$(`[data-id="${id}"] > .o-qb-grip, [data-id="${id}"] .o-qb-group-head .o-qb-grip`)?.focus());
  }
  _duplicateNode(id) {
    const parent = qbFindParent(this.value, id), node = qbFind(this.value, id);
    if (!parent || !node) return;
    parent.children.splice(parent.children.findIndex(c => c.id === id) + 1, 0, qbCloneFresh(node));
    this._commit();
  }
  _removeNode(id) {
    const parent = qbFindParent(this.value, id);
    if (!parent) return;
    parent.children = parent.children.filter(c => c.id !== id);
    this._commit();
    announce(t('querybuilder.removed'));
  }

  /* ── render ────────────────────────────────────────────────────────── */
  renderTree() { this.treeEl.replaceChildren(this._buildNode(this.value, 0)); }
  _buildNode(node, depth) { return node.type === 'group' ? this._buildGroup(node, depth) : this._buildRule(node, depth); }
  _buildGroup(node, depth) {
    const el = h('div', { class: 'o-qb-group', 'data-id': node.id, role: 'group', 'aria-label': t('querybuilder.where') });
    const head = h('div', { class: 'o-qb-group-head' });
    if (depth > 0) {
      const grip = h('span', { class: 'o-qb-grip', tabindex: '0', role: 'button', 'aria-label': t('querybuilder.dragToReorder') }, icon('grip-vertical'));
      head.append(grip);
    }
    const notBtn = h('button', { type: 'button', class: cls('o-qb-not-toggle', node.not && 'is-active'), 'aria-pressed': String(!!node.not) }, t('querybuilder.not'));
    on(notBtn, 'click', () => { node.not = !node.not; this._commit(); });
    const seg = h('div', { class: 'o-qb-opseg', role: 'radiogroup', 'aria-label': t('querybuilder.where') });
    for (const op of ['and', 'or']) {
      const b = h('button', { type: 'button', class: cls('o-qb-opseg-btn', node.op === op && 'is-active'), role: 'radio', 'aria-checked': String(node.op === op) }, t('querybuilder.' + op));
      on(b, 'click', () => { if (node.op !== op) { node.op = op; this._commit(); } });
      seg.append(b);
    }
    const actions = h('div', { class: 'o-qb-group-actions' });
    const addRule = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm' }, icon('plus'), t('querybuilder.addRule'));
    on(addRule, 'click', () => { node.children.push(qbRule()); this._commit(); });
    actions.append(addRule);
    if (depth < this.maxDepth - 1) {
      const addGroup = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm' }, icon('columns'), t('querybuilder.addGroup'));
      on(addGroup, 'click', () => { node.children.push(qbGroup()); this._commit(); });
      actions.append(addGroup);
    }
    head.append(notBtn, seg, actions);
    if (depth > 0) {
      const dup = h('button', { type: 'button', class: 'o-qb-icon-btn', 'aria-label': t('querybuilder.duplicate') }, icon('copy'));
      on(dup, 'click', () => this._duplicateNode(node.id));
      const rm = h('button', { type: 'button', class: 'o-qb-icon-btn o-qb-remove', 'aria-label': t('querybuilder.remove') }, icon('x'));
      on(rm, 'click', () => this._removeNode(node.id));
      head.append(dup, rm);
    }
    el.append(head);
    const list = h('div', { class: 'o-qb-children' });
    node.children.forEach((child, i) => {
      if (i > 0) list.append(h('span', { class: 'o-qb-joiner', 'aria-hidden': 'true' }, t('querybuilder.' + node.op)));
      list.append(this._buildNode(child, depth + 1));
    });
    if (!node.children.length) list.append(h('p', { class: 'o-qb-empty-hint' }, t('querybuilder.emptyGroup')));
    el.append(list);
    if (depth > 0) el.draggable = true;
    return el;
  }
  _buildRule(node, depth) {
    const el = h('div', { class: 'o-qb-rule', draggable: 'true', 'data-id': node.id });
    const grip = h('span', { class: 'o-qb-grip', tabindex: '0', role: 'button', 'aria-label': t('querybuilder.dragToReorder') }, icon('grip-vertical'));
    const notBtn = h('button', { type: 'button', class: cls('o-qb-not-toggle o-qb-not-sm', node.not && 'is-active'), 'aria-pressed': String(!!node.not), title: t('querybuilder.not') }, t('querybuilder.not'));
    on(notBtn, 'click', () => { node.not = !node.not; this._commit(); });

    const fieldOpts = toArr(this.fields).map(f => ({ value: f.key, label: f.label || f.key }));
    const fieldSel = qbSelectEl(fieldOpts, node.field, t('querybuilder.selectField'));
    fieldSel.setAttribute('aria-label', t('querybuilder.field'));
    on(fieldSel, 'change', () => {
      node.field = fieldSel.value;
      const f = qbField(this.fields, node.field);
      node.operator = f ? qbDefaultOperator(f.type) : '';
      node.value = null;
      this._commit();
    });

    const f = qbField(this.fields, node.field);
    const opSel = qbSelectEl(f ? qbOperators(f.type) : [], node.operator, t('querybuilder.selectOperator'));
    opSel.disabled = !f;
    opSel.setAttribute('aria-label', t('querybuilder.operator'));
    on(opSel, 'change', () => {
      node.operator = opSel.value;
      const kind = f ? qbValueKind(f.type, node.operator) : 'single';
      node.value = kind === 'pair' ? [null, null] : kind === 'list' ? [] : null;
      this._commit();
    });

    const valueWrap = h('div', { class: 'o-qb-value' });
    this._renderValueEditor(valueWrap, node, f);

    const actions = h('div', { class: 'o-qb-rule-actions' });
    const dup = h('button', { type: 'button', class: 'o-qb-icon-btn', 'aria-label': t('querybuilder.duplicate') }, icon('copy'));
    on(dup, 'click', () => this._duplicateNode(node.id));
    const rm = h('button', { type: 'button', class: 'o-qb-icon-btn o-qb-remove', 'aria-label': t('querybuilder.remove') }, icon('x'));
    on(rm, 'click', () => this._removeNode(node.id));
    actions.append(dup, rm);

    const needsValue = !!f && !!node.operator && qbValueKind(f.type, node.operator) !== 'none';
    el.classList.toggle('is-invalid', needsValue && !qbRuleValid(node, this.fields));
    el.append(grip, notBtn, fieldSel, opSel, valueWrap, actions);
    return el;
  }
  _scalarInput(field, value, onInput, onCommit) {
    if (field.type === 'date') {
      if (customElements.get('o-datepicker')) {
        const el = h('o-datepicker', { class: 'o-qb-date', size: 'sm' });
        el.value = value || null;
        on(el, 'o-change', e => onCommit(e.detail.value));
        return el;
      }
      const el = h('input', { type: 'date', class: 'o-input o-input-sm', value: value || '' });
      on(el, 'change', () => onCommit(el.value));
      return el;
    }
    if (field.type === 'number') {
      const el = h('input', { type: 'number', class: 'o-input o-input-sm', value: value ?? '', min: field.min, max: field.max, step: field.step ?? 'any' });
      on(el, 'input', () => onInput(el.value === '' ? null : Number(el.value)));
      on(el, 'change', () => onCommit(el.value === '' ? null : Number(el.value)));
      return el;
    }
    const el = h('input', { type: 'text', class: 'o-input o-input-sm', value: value ?? '', placeholder: field.placeholder || t('querybuilder.value') });
    on(el, 'input', () => onInput(el.value));
    on(el, 'change', () => onCommit(el.value));
    return el;
  }
  _renderValueEditor(container, node, field) {
    container.replaceChildren();
    if (!field || !node.operator) return;
    if (node.operator === 'inLastNDays') {
      container.append(this._scalarInput({ type: 'number', min: 0, step: 1 }, node.value, v => { node.value = v; }, v => { node.value = v; this._commit(); }));
      return;
    }
    const kind = qbValueKind(field.type, node.operator);
    if (kind === 'none') return;
    if (kind === 'pair') {
      const a = this._scalarInput(field, node.value && node.value[0], v => { node.value = [v, (node.value && node.value[1]) ?? null]; }, v => { node.value = [v, (node.value && node.value[1]) ?? null]; this._commit(); });
      const b = this._scalarInput(field, node.value && node.value[1], v => { node.value = [(node.value && node.value[0]) ?? null, v]; }, v => { node.value = [(node.value && node.value[0]) ?? null, v]; this._commit(); });
      container.append(a, h('span', { class: 'o-qb-value-to' }, t('common.to')), b);
      return;
    }
    if (kind === 'list') { this._renderListEditor(container, node, field); return; }
    container.append(this._scalarInput(field, node.value, v => { node.value = v; }, v => { node.value = v; this._commit(); }));
  }
  _renderListEditor(container, node, field) {
    const options = toArr(field.options).map(o => (isStr(o) ? { value: o, label: o } : o));
    if (options.length && customElements.get('o-select')) {
      const el = h('o-select', { multiple: true, class: 'o-qb-select-multi' });
      el.options = options; el.value = toArr(node.value);
      on(el, 'o-change', e => { node.value = e.detail.value; this._commit(); });
      container.append(el);
      return;
    }
    if (options.length) {
      const el = h('select', { multiple: true, class: 'o-select o-input-sm', size: Math.min(4, options.length) });
      options.forEach(o => el.append(h('option', { value: o.value, selected: toArr(node.value).map(String).includes(String(o.value)) }, o.label)));
      on(el, 'change', () => { node.value = [...el.selectedOptions].map(o => o.value); this._commit(); });
      container.append(el);
      return;
    }
    const el = h('input', { type: 'text', class: 'o-input o-input-sm', value: toArr(node.value).join(', '), placeholder: t('querybuilder.value') });
    on(el, 'change', () => { node.value = el.value.split(',').map(s => s.trim()).filter(Boolean); this._commit(); });
    container.append(el);
  }
}
define('o-query-builder', OQueryBuilder);
O.QueryBuilder = OQueryBuilder;
O.qb = { toSQL: qbToSQL, toMongo: qbToMongo, toString: qbToString, toPredicate: qbToPredicate, parseQueryString: qbParseQueryString, parseToTree: qbParseToTree, treeToQueryString: qbTreeToQueryString, rule: qbRule, group: qbGroup, normalize: qbNormalize, operators: qbOperators };
