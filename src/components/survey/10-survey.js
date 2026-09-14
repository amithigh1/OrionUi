// @deps validation, conditional
/* Multi-page surveys from a JSON schema.
 *   <o-survey schema='{ "pages": [ { "questions": [ … ] } ] }'></o-survey>     or     Orion.survey(el, schema, { onComplete })
 *   schema = {
 *     title, description, progress: true,
 *     pages: [{ id, title, description, showIf, skipIf, questions: [ … ] }],  // or a flat top-level `questions` (one page)
 *     thankYou: { title, description } | fn(answers) -> string,
 *     nextText, backText, submitText,
 *   }
 *   question = {
 *     id, type: 'single'|'multiple'|'text'|'longtext'|'rating'|'nps'|'emoji'|'matrix'|'likert'|'dropdown'|'ranking'|'date',
 *     label, help, required, placeholder, default, rules ("email|…", checked with Orion.validate),
 *     options: ['A', { value, label, goTo }],       // single / multiple / dropdown / ranking — goTo branches to another page.id
 *     rows / columns: [ … ],                        // matrix / likert
 *     scale: 5,                                     // rating / emoji point count
 *     labels: { low, high },                         // end captions for rating / nps / emoji
 *     showIf / skipIf: 'other=value' | { field, op, value } | { any:[…] } | { all:[…] } | fn(answers) -> bool  (skip logic)
 *   }
 *   Props: schema, texts. Methods: getAnswers(), setAnswers(obj), next(), prev(), goToPage(idOrIndex), reset(), finish().
 *   Events: o-page-change { index, page }, o-answer { id, value, answers }, o-complete { answers }.
 *   Static helper: Orion.survey.summarize(schema, responses) -> per-question aggregated counts / averages / NPS score.
 *   Keyboard: every question is a native input/radiogroup/checkbox-group; ranking rows have Up/Down buttons and
 *   respond to ArrowUp/ArrowDown while their drag handle is focused.
 */
i18n.add('en', {
  survey: {
    next: 'Next', back: 'Back', submit: 'Submit', restart: 'Start over', pageOf: 'Page {n} of {total}',
    required: 'Please answer this question', matrixIncomplete: 'Please answer every row',
    thanksTitle: 'Thank you!', thanksBody: 'Your response has been recorded.',
    npsNotLikely: 'Not at all likely', npsVeryLikely: 'Extremely likely', stars: '{n} of {max} stars',
    rankHint: 'Use the arrow buttons (or focus the handle and press Arrow Up / Down) to reorder.',
    rankPosition: '{item}, position {n} of {total}', moveUp: 'Move {item} up', moveDown: 'Move {item} down',
    chooseOne: 'Choose one', chooseMany: 'Choose all that apply',
  },
});

const FU = () => O.formUtil;
const hasEl = tag => isBrowser && !!win.customElements && !!customElements.get(tag);
const cssEsc = s => (win && win.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));
const normOptions = list => toArr(list).map(o => (isObj(o) ? { value: String(o.value ?? o.id ?? o.label), label: String(o.label ?? o.text ?? o.name ?? o.value), disabled: !!o.disabled, goTo: o.goTo } : { value: String(o), label: String(o) }));

/* ── tiny condition-object -> expression-string compiler (feeds data-o-show-if / data-o-hide-if) ── */
const OPSTR = { '=': '=', '==': '=', eq: '=', '!=': '!=', ne: '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=' };
function condToExpr(c) {
  if (c == null || isFn(c) || c === true) return null;
  if (isStr(c)) return c;
  if (Array.isArray(c) || c.all) { const p = toArr(c.all || c).map(condToExpr).filter(Boolean); return p.length ? p.map(x => '(' + x + ')').join(' && ') : null; }
  if (c.any) { const p = toArr(c.any).map(condToExpr).filter(Boolean); return p.length ? p.map(x => '(' + x + ')').join(' || ') : null; }
  const op = c.op || '=', v = Array.isArray(c.value) ? c.value.join(',') : c.value ?? '';
  if (op === 'in' || op === 'notIn') return `${c.field} ${op === 'in' ? 'in' : 'not in'}:${v}`;
  if (['empty', 'notEmpty', 'checked', 'unchecked'].includes(op)) return `${c.field} ${op}`;
  return `${c.field}${OPSTR[op] || '='}${v}`;
}

/* ── question renderers ───────────────────────────────────────────────── */
function choiceInputs(kind, q, ctx) {
  const opts = normOptions(q.options), name = kind === 'checkbox' ? ctx.name + '[]' : ctx.name;
  const box = h('div', { class: cls('o-survey-choices', q.inline && 'is-inline'), role: kind === 'radio' ? 'radiogroup' : 'group', 'aria-labelledby': ctx.labelId || null });
  opts.forEach((o, i) => {
    const id = `${ctx.id}-${i}`;
    const input = h('input', { type: kind, class: 'o-sr-only', name, value: o.value, id, disabled: !!o.disabled });
    if (i === 0 && q.required) input.required = true;
    if (i === 0 && q.rules) input.setAttribute('data-o-rules', q.rules);
    if (toArr(q.default).map(String).includes(o.value)) input.defaultChecked = true;
    box.append(h('label', { class: 'o-survey-choice', for: id, 'data-goto': o.goTo != null ? String(o.goTo) : null },
      input, h('span', { class: 'o-survey-choice-mark', 'aria-hidden': 'true' }), h('span', { class: 'o-survey-choice-label' }, o.label)));
  });
  return box;
}
const EMOJI_5 = ['frown', 'meh', 'meh', 'smile', 'smile'];
function scaleInputs(q, ctx, { count, from = 1, kind }) {
  const wrap = h('div', { class: `o-survey-scale o-survey-scale-${kind}` });
  const row = h('div', { class: 'o-survey-scale-row', role: 'radiogroup' });
  const order = kind === 'star' ? Array.from({ length: count }, (_, k) => count - k) : Array.from({ length: count }, (_, k) => from + k);
  order.forEach((v, k) => {
    const id = `${ctx.id}-${v}`;
    const input = h('input', { type: 'radio', class: 'o-sr-only o-survey-scale-input', name: ctx.name, value: String(v), id });
    if (k === 0 && q.required) input.required = true;
    if (String(q.default) === String(v)) input.defaultChecked = true;
    let content;
    if (kind === 'star') content = icon('star');
    else if (kind === 'emoji') { const idx = Math.round(((v - from) / Math.max(count - 1, 1)) * (EMOJI_5.length - 1)); content = icon(EMOJI_5[idx]); }
    else content = h('span', null, String(v));
    row.append(input, h('label', { class: 'o-survey-scale-item', for: id, title: kind === 'star' ? t('survey.stars', { n: v, max: count }) : null }, content));
  });
  wrap.append(row);
  const low = q.labels?.low ?? (kind === 'nps' ? t('survey.npsNotLikely') : null);
  const high = q.labels?.high ?? (kind === 'nps' ? t('survey.npsVeryLikely') : null);
  if (low || high) wrap.append(h('div', { class: 'o-survey-scale-labels' }, h('span', null, low || ''), h('span', null, high || '')));
  return wrap;
}
function matrixEl(q, ctx) {
  const rows = normOptions(q.rows), cols = normOptions(q.columns);
  const table = h('table', { class: 'o-survey-matrix' });
  table.append(h('thead', null, h('tr', null, h('th', { class: 'o-survey-matrix-corner' }), ...cols.map(c => h('th', { scope: 'col' }, c.label)))));
  const tbody = h('tbody');
  rows.forEach((r, ri) => {
    const name = `${ctx.name}[${r.value}]`;
    const tr = h('tr', null, h('th', { scope: 'row', class: 'o-survey-matrix-row-label' }, r.label));
    cols.forEach((c, ci) => {
      const id = `${ctx.id}-${ri}-${ci}`;
      const input = h('input', { type: 'radio', name, value: c.value, id, class: 'o-survey-matrix-input' });
      tr.append(h('td', { class: 'o-survey-matrix-cell', 'data-label': c.label }, h('label', { class: 'o-survey-matrix-radio', for: id }, input, h('span', { class: 'o-sr-only' }, r.label + ' — ' + c.label))));
    });
    tbody.append(tr);
  });
  table.append(tbody);
  return h('div', { class: 'o-survey-matrix-wrap' }, table);
}
function rankingEl(q, ctx) {
  const opts = normOptions(q.options);
  const order = (Array.isArray(q.default) && q.default.length ? q.default : opts.map(o => o.value)).map(String);
  const hidden = h('input', { type: 'hidden', name: ctx.name, id: ctx.id, value: JSON.stringify(order) });
  const list = h('ul', { class: 'o-survey-rank', role: 'list' });
  const labelOf = v => (opts.find(o => o.value === v) || { label: v }).label;
  const paint = () => {
    list.replaceChildren(...order.map((v, i) => h('li', { class: 'o-survey-rank-item' },
      h('button', { type: 'button', class: 'o-survey-rank-handle', 'aria-label': t('survey.rankPosition', { item: labelOf(v), n: i + 1, total: order.length }) }, iconEl('grip-vertical')),
      h('span', { class: 'o-survey-rank-index' }, String(i + 1)),
      h('span', { class: 'o-survey-rank-label' }, labelOf(v)),
      h('div', { class: 'o-survey-rank-actions' },
        h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'data-act': 'up', disabled: i === 0, 'aria-label': t('survey.moveUp', { item: labelOf(v) }) }, iconEl('chevron-up')),
        h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'data-act': 'down', disabled: i === order.length - 1, 'aria-label': t('survey.moveDown', { item: labelOf(v) }) }, iconEl('chevron-down'))))));
  };
  const setValue = () => { hidden.value = JSON.stringify(order); };
  const commit = () => { setValue(); hidden.dispatchEvent(new Event('input', { bubbles: true })); hidden.dispatchEvent(new Event('change', { bubbles: true })); };
  const move = (i, j, focusHandle) => {
    if (j < 0 || j >= order.length) return;
    const [x] = order.splice(i, 1); order.splice(j, 0, x);
    paint(); commit();
    announce(t('survey.rankPosition', { item: labelOf(order[j]), n: j + 1, total: order.length }));
    if (focusHandle) list.children[j]?.querySelector('.o-survey-rank-handle')?.focus();
  };
  paint();
  on(list, 'click', '[data-act]', (e, b) => { const li = b.closest('.o-survey-rank-item'); const i = [...list.children].indexOf(li); move(i, i + (b.dataset.act === 'up' ? -1 : 1)); });
  on(list, 'keydown', '.o-survey-rank-handle', (e, btn) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const li = btn.closest('.o-survey-rank-item'), i = [...list.children].indexOf(li);
    move(i, i + (e.key === 'ArrowUp' ? -1 : 1), true);
  });
  /** Restore a previously-saved order without re-dispatching input/change (used when re-rendering a visited page). */
  hidden.__setOrder = (arr, silent) => { order.length = 0; order.push(...toArr(arr).map(String)); paint(); if (silent) setValue(); else commit(); };
  return h('div', { class: 'o-survey-rank-wrap' }, h('p', { class: 'o-survey-rank-hint o-help' }, t('survey.rankHint')), list, hidden);
}
function dropdownEl(q, ctx) {
  const opts = normOptions(q.options);
  if (hasEl('o-select')) {
    const el = h('o-select', { id: ctx.id, name: ctx.name, options: JSON.stringify(opts), placeholder: q.placeholder || t('common.select'), required: !!q.required });
    if (q.default != null) el.setAttribute('value', JSON.stringify(q.default));
    return el;
  }
  const el = h('select', { class: 'o-select', id: ctx.id, name: ctx.name, required: !!q.required });
  el.append(h('option', { value: '' }, q.placeholder || t('common.select')));
  opts.forEach(o => { const opt = h('option', { value: o.value, disabled: o.disabled, 'data-goto': o.goTo != null ? String(o.goTo) : null }, o.label); if (String(q.default) === o.value) opt.defaultSelected = true; el.append(opt); });
  return el;
}
function dateEl(q, ctx) {
  if (hasEl('o-datepicker')) return h('o-datepicker', { id: ctx.id, name: ctx.name, required: !!q.required, min: q.min, max: q.max, value: q.default || null });
  const el = h('input', { class: 'o-input', type: 'date', id: ctx.id, name: ctx.name, required: !!q.required, min: q.min, max: q.max });
  if (q.default) el.defaultValue = q.default;
  return el;
}
const Q_TYPES = {
  single: { group: true, render: (q, c) => choiceInputs('radio', q, c) },
  multiple: { group: true, render: (q, c) => choiceInputs('checkbox', q, c) },
  text: { render(q, c) { const el = h('input', { class: 'o-input', type: q.inputType || 'text', name: c.name, id: c.id, placeholder: q.placeholder, required: !!q.required, autocomplete: q.autocomplete, 'data-o-rules': q.rules || null }); if (q.default != null) el.defaultValue = String(q.default); return el; } },
  longtext: { render(q, c) { const el = h('textarea', { class: 'o-textarea', name: c.name, id: c.id, rows: q.rows || 4, placeholder: q.placeholder, required: !!q.required, 'data-o-rules': q.rules || null }); if (q.default != null) el.defaultValue = String(q.default); return el; } },
  dropdown: { render: dropdownEl },
  date: { render: dateEl },
  rating: { group: true, render: (q, c) => scaleInputs(q, c, { count: q.scale || 5, kind: 'star' }) },
  nps: { group: true, render: (q, c) => scaleInputs(q, c, { count: 11, from: 0, kind: 'nps' }) },
  emoji: { group: true, render: (q, c) => scaleInputs(q, c, { count: q.scale || 5, kind: 'emoji' }) },
  matrix: { group: true, custom: true, render: matrixEl },
  ranking: { group: true, custom: true, render: rankingEl },
};
Q_TYPES.likert = Q_TYPES.matrix;

/* ── <o-survey> ───────────────────────────────────────────────────────── */
class OSurvey extends OElement {
  static props = { schema: { type: Object, default: () => ({}) }, texts: Object };

  setup() {
    this.classList.add('o-survey');
    this._answers = {};
    this._history = [];
    this._pageIdx = -1;
    this._qmap = new Map();
    this._offConds = [];
    if (!Object.keys(this.schema || {}).length) {
      const s = this.querySelector(':scope > script[type="application/json"]');
      if (s) this._p.schema = parseJSON(s.textContent, {});
    }
    this._header = h('div', { class: 'o-survey-header' });
    this._progressWrap = h('div', { class: 'o-survey-progress' });
    this._form = h('div', { class: 'o-survey-form', 'data-o-scope': '' });
    const btn = (c, ic) => h('button', { type: 'button', class: 'o-btn ' + c }, ic ? iconEl(ic) : null, h('span'));
    this._back = btn('o-survey-back', 'chevron-left');
    this._next = btn('o-btn-primary o-survey-next');
    this._submit = btn('o-btn-primary o-survey-submit');
    this._footer = h('div', { class: 'o-survey-footer' }, this._back, h('div', { class: 'o-survey-footer-end' }, this._next, this._submit));
    this._done = h('div', { class: 'o-survey-done', hidden: true });
    this.append(this._header, this._progressWrap, this._form, this._footer, this._done);
    this._back.onclick = () => this.prev();
    this._next.onclick = () => this.next();
    this._submit.onclick = () => this.finish();
    on(this._form, 'input change', e => { this._syncAnswers(); this._paint(); const qid = (e.target.name || '').replace(/\[.*/, ''); if (qid) this.emit('answer', { id: qid, value: this._answers[qid], answers: this.getAnswers() }); });
    on(this, 'keydown', e => this._onKey(e));
  }
  disconnected() { this._offConds.forEach(f => f()); this._offConds = []; }
  update(changed) { if (['schema', 'init', 'locale'].some(k => changed.has(k))) this._start(); }
  get page() { return this._pageIdx; }
  get pages() { return this._pages().length; }

  _pages() { const s = this.schema || {}; return Array.isArray(s.pages) && s.pages.length ? s.pages : [{ questions: s.questions || [] }]; }
  _testCond(cond, values) { if (isFn(cond)) return !!cond(values); return O.conditional ? O.conditional.test(cond, values) : true; }
  _pageVisible(page) {
    const values = this._answers;
    if (page.showIf != null && !this._testCond(page.showIf, values)) return false;
    if (page.skipIf != null && this._testCond(page.skipIf, values)) return false;
    return true;
  }
  _firstVisiblePage() { const i = this._pages().findIndex(p => this._pageVisible(p)); return i < 0 ? 0 : i; }
  _nextVisiblePage(from) { const pages = this._pages(); for (let i = from + 1; i < pages.length; i++) if (this._pageVisible(pages[i])) return i; return null; }
  _resolvePage(ref) {
    const pages = this._pages();
    if (isNum(ref)) return clamp(Math.round(ref), 0, pages.length - 1);
    const i = pages.findIndex(p => p.id === ref);
    return i >= 0 ? i : null;
  }

  _start() {
    this._answers = {};
    this._history = [];
    this._qmap.clear();
    for (const p of this._pages()) for (const q of toArr(p.questions)) if (q.id) this._qmap.set(q.id, q);
    this.classList.remove('is-done');
    this._done.hidden = true; this._form.hidden = false; this._footer.hidden = false;
    const s = this.schema || {};
    this._header.replaceChildren();
    if (s.title) this._header.append(h('h1', { class: 'o-survey-title' }, s.title));
    if (s.description) this._header.append(h('p', { class: 'o-survey-desc' }, s.description));
    this._header.hidden = !s.title && !s.description;
    if (!this._v && O.validate) this._v = O.validate(this._form, { live: 'blur', scrollToError: true });
    else if (this._v) this._v.clear();
    this._pageIdx = -1;
    this._showPage(this._firstVisiblePage(), null);
    this.emit('ready', {});
  }
  _syncAnswers() { if (this._form.firstChild) Object.assign(this._answers, FU().serialize(this._form)); }
  _buildQuestion(q) {
    const id = uid('o-sv'), type = q.type === 'likert' ? 'matrix' : (q.type || 'text');
    const def = Q_TYPES[type] || Q_TYPES.text;
    let ctl;
    try { ctl = def.render(q, { id, name: q.id, labelId: id + '-label' }); } catch (e) { console.error('[Orion] o-survey: question "' + q.id + '" failed to render:', e); return null; }
    const cell = h(def.group ? 'fieldset' : 'div', { class: cls('o-field', 'o-survey-question', 'o-survey-q-' + type), 'data-o-qid': q.id, 'data-o-qtype': type });
    if (q.label) cell.append(h(def.group ? 'legend' : 'label', { class: cls('o-label', q.required && 'is-required'), for: def.group ? null : id, id: id + '-label' }, q.label, (type === 'multiple') ? h('span', { class: 'o-label-hint' }, t('survey.chooseMany')) : null));
    if (q.help) cell.append(h('div', { class: 'o-help' }, q.help));
    cell.append(ctl);
    for (const [key, attr] of [['showIf', 'data-o-show-if'], ['skipIf', 'data-o-hide-if']]) {
      const cond = q[key];
      if (cond == null) continue;
      const expr = condToExpr(cond);
      if (expr) cell.setAttribute(attr, expr);
      else if (isFn(cond)) (this._fnConds || (this._fnConds = [])).push([cell, { [key === 'showIf' ? 'showIf' : 'hideIf']: cond }]);
    }
    return cell;
  }
  _renderPage(i) {
    this._offConds.forEach(f => f()); this._offConds = []; this._fnConds = [];
    const page = this._pages()[i] || { questions: [] };
    const host = h('div', { class: 'o-survey-page', tabindex: '-1' });
    if (page.title) host.append(h('h2', { class: 'o-survey-page-title' }, page.title));
    if (page.description) host.append(h('p', { class: 'o-survey-page-desc' }, page.description));
    for (const q of toArr(page.questions)) { const c = this._buildQuestion(q); if (c) host.append(c); }
    this._form.replaceChildren(host);
    this._pageEl = host;
    if (O.conditional) { this._fnConds.forEach(([cell, conds]) => this._offConds.push(O.conditional.watch(cell, conds, this._form))); O.conditional.refresh(this._form); }
    const data = clone(this._answers);
    for (const [id, q] of this._qmap) { const ty = q.type === 'likert' ? 'matrix' : q.type; if (ty === 'ranking' && Array.isArray(data[id])) data[id] = JSON.stringify(data[id]); }
    FU().fill(host, data, { events: false });
    $$('[data-o-qtype="ranking"] input[type=hidden]', host).forEach(inp => {
      if (!inp.__setOrder) return;
      const qid = inp.closest('[data-o-qid]')?.dataset.oQid, q = qid && this._qmap.get(qid);
      if (!q) return;
      let val = this._answers[q.id];
      if (isStr(val)) { try { val = JSON.parse(val); } catch { val = null; } }
      if (Array.isArray(val)) inp.__setOrder(val, true);
    });
    if (O.conditional) O.conditional.refresh(this._form);
    return host;
  }
  _showPage(i, dir) {
    this._syncAnswers();
    const from = this._pageIdx;
    this._pageIdx = i;
    this._renderPage(i);
    this._paint();
    if (dir && !reducedMotion()) { const dx = (dir === 'next' ? 14 : -14) * (isRTL(this) ? -1 : 1); animate(this._pageEl, [{ opacity: 0, transform: `translateX(${dx}px)` }, { opacity: 1, transform: 'none' }], { duration: 200 }); }
    if (from !== i && from >= 0) {
      announce(t('survey.pageOf', { n: i + 1, total: this._pages().length }));
      const top = this.getBoundingClientRect().top;
      if (top < 0 || top > innerHeight) this.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
    this.emit('page-change', { index: i, page: this._pages()[i] });
  }
  _paint() {
    const pages = this._pages(), i = this._pageIdx;
    this._back.hidden = this._history.length === 0;
    const last = this._nextVisiblePage(i) == null;
    this._next.hidden = last;
    this._submit.hidden = !last;
    this._back.querySelector('span').textContent = this.texts?.back || this.t('survey.back');
    this._next.querySelector('span').textContent = this.texts?.next || this.schema.nextText || this.t('survey.next');
    this._submit.querySelector('span').textContent = this.texts?.submit || this.schema.submitText || this.t('survey.submit');
    if (this.schema.progress === false || pages.length < 2) { this._progressWrap.hidden = true; return; }
    this._progressWrap.hidden = false;
    /* best-effort: pages that are still ahead may become hidden/visible as answers change, so this is
       recomputed from the CURRENT answers on every paint rather than a fixed page count. */
    let remaining = 0;
    for (let k = i + 1; k < pages.length; k++) if (this._pageVisible(pages[k])) remaining++;
    const total = i + 1 + remaining;
    const pct = clamp(Math.round(((i + 1) / total) * 100), 1, 100);
    this._progressWrap.replaceChildren(
      h('div', { class: 'o-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct }, h('div', { class: 'o-progress-bar', style: `--o-value:${pct}%` })),
      h('div', { class: 'o-survey-progress-text' }, this.t('survey.pageOf', { n: i + 1, total })));
  }
  _branchTarget(pageEl) {
    for (const el of $$('[data-goto]', pageEl)) {
      if (el.tagName === 'OPTION') { if (el.selected) return el.dataset.goto; }
      else { const inp = el.matches('input') ? el : el.querySelector('input'); if (inp && inp.checked) return el.dataset.goto; }
    }
    return null;
  }
  async _validatePage(i) {
    const pageEl = this._pageEl;
    let ok = true;
    if (this._v) ok = await this._v.validate(pageEl, { focus: true });
    for (const cell of $$('[data-o-qtype="matrix"]', pageEl)) {
      const q = this._qmap.get(cell.dataset.oQid);
      if (!q || !q.required || cell.hidden) continue;
      const rows = normOptions(q.rows);
      const missing = rows.some(r => !cell.querySelector(`input[name="${cssEsc(q.id)}[${cssEsc(r.value)}]"]:checked`));
      cell.classList.toggle('is-invalid', missing);
      let err = cell.querySelector(':scope > .o-error');
      if (missing) {
        if (!err) { err = h('div', { class: 'o-error' }); cell.append(err); }
        err.textContent = this.t('survey.matrixIncomplete'); err.classList.add('is-visible');
        if (ok) cell.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
        ok = false;
      } else if (err) err.classList.remove('is-visible');
    }
    return ok;
  }
  _onKey(e) {
    if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return;
    const tg = e.target;
    if (tg.localName === 'textarea' || tg.classList?.contains('o-survey-rank-handle') || (tg.localName === 'button')) return;
    if (!this._pageEl || !this._pageEl.contains(tg)) return;
    e.preventDefault();
    this._next.hidden ? this.finish() : this.next();
  }

  /* ── public API ── */
  getAnswers() {
    this._syncAnswers();
    const out = clone(this._answers);
    for (const [id, q] of this._qmap) { const ty = q.type === 'likert' ? 'matrix' : q.type; if (ty === 'ranking' && isStr(out[id])) { try { out[id] = JSON.parse(out[id]); } catch { out[id] = []; } } }
    return out;
  }
  setAnswers(obj = {}) {
    Object.assign(this._answers, clone(obj));
    if (this._pageEl) this._renderPage(this._pageIdx);
    this._paint();
  }
  async next() {
    if (this._busy || this._pageIdx < 0) return false;
    this._busy = true;
    try {
      if (!(await this._validatePage(this._pageIdx))) return false;
      this._syncAnswers();
      const branch = this._branchTarget(this._pageEl);
      const target = branch != null ? this._resolvePage(branch) : this._nextVisiblePage(this._pageIdx);
      if (target == null) return await this.finish();
      this._history.push(this._pageIdx);
      this._showPage(target, 'next');
      return true;
    } finally { this._busy = false; }
  }
  prev() {
    const back = this._history.pop();
    if (back == null) return false;
    this._showPage(back, 'prev');
    return true;
  }
  goToPage(ref) {
    const i = this._resolvePage(ref);
    if (i == null || i === this._pageIdx) return false;
    this._history.push(this._pageIdx);
    this._showPage(i, null);
    return true;
  }
  async finish() {
    if (this._busy || this._pageIdx < 0) return false;
    this._busy = true;
    try {
      if (!(await this._validatePage(this._pageIdx))) return false;
      this._syncAnswers();
      const answers = this.getAnswers();
      this.classList.add('is-done');
      this._renderDone(answers);
      this.emit('complete', { answers });
      return true;
    } finally { this._busy = false; }
  }
  _renderDone(answers) {
    this._form.hidden = true; this._footer.hidden = true; this._progressWrap.hidden = true;
    const ty = this.schema.thankYou;
    const title = isFn(ty) ? '' : (ty && ty.title) || this.t('survey.thanksTitle');
    const body = isFn(ty) ? ty(answers) : (ty && ty.description) || this.t('survey.thanksBody');
    this._done.hidden = false;
    const kids = [h('div', { class: 'o-survey-done-icon' }, icon('check-circle'))];
    if (title) kids.push(h('h2', { class: 'o-survey-done-title' }, title));
    kids.push(h('div', { class: 'o-survey-done-body' }, body));
    this._done.replaceChildren(...kids);
    if (!reducedMotion()) animate(this._done, 'zoomIn', { duration: 220 });
  }
  reset() {
    this._answers = {};
    this._history = [];
    this.classList.remove('is-done');
    this._form.hidden = false; this._footer.hidden = false;
    this._done.hidden = true;
    if (this._v) this._v.clear();
    this._pageIdx = -1;
    this._showPage(this._firstVisiblePage(), null);
    this.emit('reset', {});
  }
}
define('o-survey', OSurvey);
O.Survey = OSurvey;

/** Orion.survey(target, schema, { onComplete }) -> <o-survey> */
O.survey = function (target, schema, opts = {}) {
  let el = $(target);
  if (!el) throw new Error('Orion.survey: target not found');
  if (el.localName !== 'o-survey') { const s = h('o-survey'); el.append(s); el = s; }
  if (opts.onComplete) on(el, 'o-complete', e => opts.onComplete(e.detail.answers, e));
  if (schema) el.schema = schema;
  return el;
};
/** Orion.survey.summarize(schema, responses) -> { [questionId]: { type, total, counts|rows|options|responses, average?, nps? } } */
O.survey.summarize = function (schema, responses = []) {
  const pages = Array.isArray(schema.pages) && schema.pages.length ? schema.pages : [{ questions: schema.questions || [] }];
  const qs = pages.flatMap(p => toArr(p.questions));
  const out = {};
  for (const q of qs) {
    const type = q.type === 'likert' ? 'matrix' : (q.type || 'text');
    const values = responses.map(r => r && r[q.id]).filter(v => v != null && v !== '');
    if (['single', 'multiple', 'dropdown', 'nps', 'emoji', 'rating'].includes(type)) {
      const counts = new Map();
      for (const v of values) for (const x of toArr(v)) counts.set(String(x), (counts.get(String(x)) || 0) + 1);
      const options = type === 'nps' ? Array.from({ length: 11 }, (_, k) => ({ value: String(k), label: String(k) }))
        : type === 'rating' || type === 'emoji' ? Array.from({ length: q.scale || 5 }, (_, k) => ({ value: String(k + 1), label: String(k + 1) }))
        : normOptions(q.options);
      const total = values.length;
      out[q.id] = { type, total, counts: options.map(o => ({ value: o.value, label: o.label, count: counts.get(o.value) || 0, pct: total ? Math.round(((counts.get(o.value) || 0) / total) * 100) : 0 })) };
      if (type === 'nps' && total) { const promoters = values.filter(v => +v >= 9).length, detractors = values.filter(v => +v <= 6).length; out[q.id].nps = Math.round(((promoters - detractors) / total) * 100); }
      if ((type === 'rating' || type === 'emoji') && total) out[q.id].average = Math.round((values.reduce((s, v) => s + (+v || 0), 0) / total) * 100) / 100;
    } else if (type === 'matrix') {
      const rows = normOptions(q.rows), colsOpts = normOptions(q.columns);
      out[q.id] = {
        type, rows: rows.map(r => {
          const rv = responses.map(resp => resp && resp[q.id] && resp[q.id][r.value]).filter(v => v != null);
          const counts = new Map(); rv.forEach(v => counts.set(String(v), (counts.get(String(v)) || 0) + 1));
          return { value: r.value, label: r.label, total: rv.length, counts: colsOpts.map(c => ({ value: c.value, label: c.label, count: counts.get(c.value) || 0 })) };
        }),
      };
    } else if (type === 'ranking') {
      const opts = normOptions(q.options), score = new Map(); let n = 0;
      for (const v of values) { const arr = Array.isArray(v) ? v : []; if (!arr.length) continue; n++; arr.forEach((val, idx) => score.set(String(val), (score.get(String(val)) || 0) + (arr.length - idx))); }
      out[q.id] = { type, total: n, options: opts.map(o => ({ value: o.value, label: o.label, score: score.get(o.value) || 0 })).sort((a, b) => b.score - a.score) };
    } else {
      out[q.id] = { type, total: values.length, responses: values };
    }
  }
  return out;
};
