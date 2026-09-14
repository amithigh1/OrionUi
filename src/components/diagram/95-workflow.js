/* ============================================================================
 * <o-workflow> — workflow / approval-process designer built on <o-diagram>.
 * Adds a typed node palette (cards with icons + named ports), a schema-driven
 * per-node configuration panel, structural validation with error badges,
 * vertical auto layout and a token "simulate" mode.
 * ========================================================================== */

i18n.add('en', {
  workflow: {
    label: 'Workflow', simulate: 'Simulate', stopSimulate: 'Stop simulation', autoLayout: 'Auto layout',
    output: 'output', input: 'input', errMultiStart: 'Only one Start node is allowed', errUnreachable: 'Not reachable from Start',
    errDangling: 'The "{port}" connection point is not wired up', valid: 'Workflow is valid', invalid: '{count} problem found', invalid_plural: '{count} problems found',
    description: 'Description', approver: 'Approver', expression: 'Condition (expression)', waitFor: 'Wait for', all: 'All branches', any: 'Any branch',
    duration: 'Duration', unit: 'Unit', seconds: 'Seconds', minutes: 'Minutes', hours: 'Hours', to: 'To', subject: 'Subject', url: 'URL', method: 'Method', script: 'Script',
    types: {
      'wf-start': 'Start', 'wf-task': 'Task', 'wf-approval': 'Approval', 'wf-condition': 'Condition', 'wf-split': 'Parallel split',
      'wf-join': 'Parallel join', 'wf-delay': 'Delay', 'wf-email': 'Email', 'wf-webhook': 'Webhook', 'wf-script': 'Script', 'wf-end': 'End',
    },
  },
});

DG_ICONS.task = '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>';

const WF_TYPES = {
  'wf-start': { icon: 'play', tone: 'success' },
  'wf-task': { icon: 'task', tone: 'primary' },
  'wf-approval': { icon: 'check-square', tone: 'info' },
  'wf-condition': { icon: 'git-branch', tone: 'warning' },
  'wf-split': { icon: 'split', tone: 'secondary' },
  'wf-join': { icon: 'merge', tone: 'secondary' },
  'wf-delay': { icon: 'timer', tone: 'secondary' },
  'wf-email': { icon: 'mail', tone: 'info' },
  'wf-webhook': { icon: 'globe', tone: 'primary' },
  'wf-script': { icon: 'code', tone: 'dark' },
  'wf-end': { icon: 'flag', tone: 'danger' },
};
const WF_SIZE = { 'wf-start': [160, 56], 'wf-end': [160, 56], 'wf-condition': [206, 74] };
const WF_PORTS = {
  'wf-start': [{ id: 'out', side: 'b', kind: 'out' }],
  'wf-end': [{ id: 'in', side: 't', kind: 'in' }],
  'wf-condition': [{ id: 'in', side: 't', kind: 'in' }, { id: 'yes', side: 'b', offset: 0.25, kind: 'out', label: 'Yes', max: 1 }, { id: 'no', side: 'b', offset: 0.75, kind: 'out', label: 'No', max: 1 }],
  'wf-split': [{ id: 'in', side: 't', kind: 'in' }, { id: 'out1', side: 'b', offset: 0.25, kind: 'out', label: 'A' }, { id: 'out2', side: 'b', offset: 0.75, kind: 'out', label: 'B' }],
  'wf-join': [{ id: 'in1', side: 't', offset: 0.25, kind: 'in' }, { id: 'in2', side: 't', offset: 0.75, kind: 'in' }, { id: 'out', side: 'b', kind: 'out' }],
};
const WF_DEFAULT_PORTS = [{ id: 'in', side: 't', kind: 'in' }, { id: 'out', side: 'b', kind: 'out' }];
const wfPorts = type => WF_PORTS[type] || (type === 'wf-start' || type === 'wf-end' ? [] : WF_DEFAULT_PORTS);

const WF_SCHEMA = {
  'wf-task': [{ key: 'description', label: 'workflow.description', type: 'textarea' }],
  'wf-approval': [{ key: 'approver', label: 'workflow.approver', type: 'text' }, { key: 'description', label: 'workflow.description', type: 'textarea' }],
  'wf-condition': [{ key: 'expression', label: 'workflow.expression', type: 'text', placeholder: 'amount > 1000' }],
  'wf-join': [{ key: 'waitFor', label: 'workflow.waitFor', type: 'select', options: [['all', 'workflow.all'], ['any', 'workflow.any']] }],
  'wf-delay': [{ key: 'duration', label: 'workflow.duration', type: 'number', min: 0 }, { key: 'unit', label: 'workflow.unit', type: 'select', options: [['seconds', 'workflow.seconds'], ['minutes', 'workflow.minutes'], ['hours', 'workflow.hours']] }],
  'wf-email': [{ key: 'to', label: 'workflow.to', type: 'text' }, { key: 'subject', label: 'workflow.subject', type: 'text' }],
  'wf-webhook': [{ key: 'url', label: 'workflow.url', type: 'text' }, { key: 'method', label: 'workflow.method', type: 'select', options: [['GET', 'GET'], ['POST', 'POST'], ['PUT', 'PUT']] }],
  'wf-script': [{ key: 'code', label: 'workflow.script', type: 'textarea', mono: true }],
};
const WF_PALETTE = Object.keys(WF_TYPES).map(type => ({ type, icon: WF_TYPES[type].icon }));
const WF_SHAPES = {};
for (const type of Object.keys(WF_TYPES)) {
  WF_SHAPES[type] = { size: WF_SIZE[type] || [200, 60], render: wfRenderCard(type) };
}

/** Build the SVG paint function for one workflow card type. */
function wfRenderCard(type) {
  const meta = WF_TYPES[type];
  return function (n, g, ctx) {
    const w = ctx.w, h = ctx.h, tone = meta.tone, st = n.style || {};
    const fill = st.fill || `var(--o-${tone}-subtle)`, stroke = st.stroke || `var(--o-${tone}-border)`;
    const chip = `var(--o-${tone})`, onChip = `var(--o-on-${tone})`, textColor = st.textColor || `var(--o-${tone}-text)`;
    g.append(svg('rect', { class: 'o-wf-card', x: 0, y: 0, width: w, height: h, rx: 10, style: `fill:${fill};stroke:${stroke}` }));
    const chipR = Math.min(15, h / 2 - 8), chipX = 11 + chipR, chipY = h / 2 - (type === 'wf-condition' ? 6 : 0);
    g.append(svg('circle', { class: 'o-wf-chip', cx: chipX, cy: chipY, r: chipR, style: `fill:${chip}` }));
    const isz = chipR * 1.15, ic = fromHTML(dgIcon(meta.icon, 'o-wf-chip-ic'));
    ic.setAttribute('x', dgF(chipX - isz / 2)); ic.setAttribute('y', dgF(chipY - isz / 2)); ic.setAttribute('width', isz); ic.setAttribute('height', isz);
    ic.style.color = onChip;
    g.append(ic);
    const tx = chipX + chipR + 10, tw = Math.max(20, w - tx - 10);
    const title = n.label || ctx.host.t('workflow.types.' + type) || meta.label;
    const font = ctx.font(13, 600), lines = ctx.wrap(String(title), tw, font, 1);
    const label = svg('text', { class: 'o-dg-label', x: dgF(tx), 'text-anchor': 'start' });
    label.style.fill = textColor;
    const ly = chipY - 6;
    lines.forEach((ln, i) => label.append(svg('tspan', { x: dgF(tx), y: dgF(ly + i * 15), dy: '0.35em' }, ln)));
    g.append(label);
    g.append(svg('text', { class: 'o-wf-sub', x: dgF(tx), y: dgF(chipY + 12) }, ctx.host.t('workflow.types.' + type)));
    for (const p of (n.ports || [])) {
      if (!p.label) continue;
      const px = p.side === 'l' ? 0 : p.side === 'r' ? w : w * (p.offset ?? 0.5);
      const py = p.side === 't' ? 0 : p.side === 'b' ? h : h * (p.offset ?? 0.5);
      const anchor = p.side === 'l' ? 'end' : p.side === 'r' ? 'start' : 'middle';
      const lx = px + (p.side === 'l' ? -8 : p.side === 'r' ? 8 : 0), ly2 = py + (p.side === 'b' ? 13 : p.side === 't' ? -7 : 4);
      g.append(svg('text', { class: 'o-wf-portlabel', x: dgF(lx), y: dgF(ly2), 'text-anchor': anchor }, p.label));
    }
    const errs = ctx.host._errors && ctx.host._errors.get(n.id);
    if (errs && errs.length) {
      g.append(svg('circle', { class: 'o-wf-errdot', cx: w - 9, cy: 9, r: 8 }));
      const bang = fromHTML(dgIcon('alert-triangle', 'o-wf-errdot-ic'));
      bang.setAttribute('x', w - 15); bang.setAttribute('y', 3); bang.setAttribute('width', 12); bang.setAttribute('height', 12);
      g.append(bang);
    }
  };
}

class OWorkflow extends ODiagram {
  static props = {
    ...ODiagram.props,
    shapes: { type: Object, attr: false, default: () => ({ ...WF_SHAPES }) },
    palette: { type: Any, default: () => WF_PALETTE },
    toolbar: { type: Boolean, default: true },
    properties: { type: Boolean, default: true },
  };
  setup() {
    super.setup();
    this.classList.add('o-workflow');
    this._errors = new Map(); this._prevErrIds = new Set();
  }
  disconnected() { super.disconnected(); this.stopSimulate(); }

  /* ── model: keep named ports on every workflow node ─────────────── */
  _fillPorts(v) {
    if (!v || !Array.isArray(v.nodes)) return v;
    return { ...v, nodes: v.nodes.map(n => (WF_TYPES[n.type] && !(Array.isArray(n.ports) && n.ports.length)) ? { ...n, ports: clone(wfPorts(n.type)) } : n) };
  }
  _load(v, opts) { super._load(this._fillPorts(v), opts); this.validate(); }
  addNode(node, opts) {
    if (node && WF_TYPES[node.type] && !(Array.isArray(node.ports) && node.ports.length)) node = { ...node, ports: clone(wfPorts(node.type)) };
    return super.addNode(node, opts);
  }
  _afterChange(action) { super._afterChange(action); this.validate(); }
  _shapeName(type) { return (WF_TYPES[type] && this.t('workflow.types.' + type)) || super._shapeName(type); }

  /* ── vertical auto layout ─────────────────────────────────────────── */
  _layoutItems() { return [{ label: this.t('workflow.autoLayout'), run: () => this.autoLayout({ animate: true }) }]; }
  autoLayout(opts = {}) { return this.layout('layered', { direction: 'TB', ...opts }); }
  _extraTools() {
    this._simBtn = this._btn(this._simulating ? 'stop' : 'play', this._simulating ? 'workflow.stopSimulate' : 'workflow.simulate', () => this.toggleSimulate());
    return [this._simBtn];
  }

  /* ── validation ───────────────────────────────────────────────────── */
  validate() {
    const nodes = this._nodes, edges = this._edges, errors = new Map();
    const push = (id, msg) => { if (!errors.has(id)) errors.set(id, []); errors.get(id).push(msg); };
    const starts = nodes.filter(n => n.type === 'wf-start'), ends = nodes.filter(n => n.type === 'wf-end');
    if (nodes.length) {
      if (starts.length > 1) starts.slice(1).forEach(n => push(n.id, this.t('workflow.errMultiStart')));
      if (starts.length === 1 && ends.length) {
        const reach = new Set([starts[0].id]), q = [starts[0].id];
        while (q.length) { const u = q.shift(); for (const e of edges) if (e.from === u && !reach.has(e.to)) { reach.add(e.to); q.push(e.to); } }
        ends.filter(n => !reach.has(n.id)).forEach(n => push(n.id, this.t('workflow.errUnreachable')));
      }
      for (const n of nodes) {
        const ports = Array.isArray(n.ports) && n.ports.length ? n.ports : wfPorts(n.type);
        const outs = ports.filter(p => p.kind === 'out'), ins = ports.filter(p => p.kind === 'in');
        for (const p of outs) { const has = outs.length === 1 ? edges.some(e => e.from === n.id) : edges.some(e => e.from === n.id && e.fromPort === p.id); if (!has) push(n.id, this.t('workflow.errDangling', { port: p.label || this.t('workflow.output') })); }
        for (const p of ins) { const has = ins.length === 1 ? edges.some(e => e.to === n.id) : edges.some(e => e.to === n.id && e.toPort === p.id); if (!has) push(n.id, this.t('workflow.errDangling', { port: p.label || this.t('workflow.input') })); }
      }
    }
    this._errors = errors;
    const changedIds = new Set([...errors.keys(), ...this._prevErrIds]);
    this._prevErrIds = new Set(errors.keys());
    if (changedIds.size) { for (const rec of this._nEls.values()) rec.sig = ''; this._invalidate([...changedIds]); }
    const valid = nodes.length === 0 || (errors.size === 0 && starts.length === 1);
    this.emit('validate', { valid, errors: Object.fromEntries([...errors].map(([k, v]) => [k, v.slice()])) }, { bubbles: true });
    return valid;
  }

  /* ── properties: schema-driven config panel per node type ─────────── */
  _inspect(body, nodes, edges) {
    if (nodes.length !== 1 || edges.length) { super._inspect(body, nodes, edges); return; }
    const n = nodes[0];
    body.append(this._fField('diagram.labelText', this._fText(n.label, v => this.updateNode(n.id, { label: v }, { key: 'label:' + n.id }), false, 'label')));
    const errs = this._errors.get(n.id);
    if (errs && errs.length) body.append(h('div', { class: 'o-wf-errors', role: 'alert' }, errs.map(m => h('div', { class: 'o-wf-error-item' }, dgIcon('alert-triangle', 'o-wf-error-ic'), h('span', null, m)))));
    const schema = WF_SCHEMA[n.type] || [];
    const data = n.data || {};
    for (const f of schema) {
      const v = data[f.key];
      let control;
      if (f.type === 'textarea') control = this._fText(v || '', val => this._patchData(n.id, f.key, val), true);
      else if (f.type === 'number') control = this._fNum(v || 0, val => this._patchData(n.id, f.key, +val || 0), f.min, f.max);
      else if (f.type === 'select') control = this._fSelect(f.options.map(([val, key]) => [val, this.t(key)]), v || f.options[0][0], val => this._patchData(n.id, f.key, val));
      else control = this._fText(v || '', val => this._patchData(n.id, f.key, val), false);
      if (f.mono) control.classList.add('o-wf-mono');
      if (f.placeholder) control.placeholder = f.placeholder;
      body.append(this._fField(f.label, control));
    }
  }
  _patchData(id, key, v) { this.updateNode(id, n => ({ data: { ...(n.data || {}), [key]: v } }), { key: 'data:' + id + ':' + key }); }

  /* ── simulate: animate a token along one path from Start to End ───── */
  toggleSimulate() { if (this._simulating) this.stopSimulate(); else this.simulate(); }
  simulate() {
    if (this._simulating) return false;
    const path = this._samplePath();
    if (!path.length) { announce(this.t('workflow.errUnreachable')); return false; }
    this._simulating = true;
    this.classList.add('is-simulating');
    this._simToken = svg('circle', { class: 'o-wf-token', r: 7 });
    this._vpG.append(this._simToken);
    this._simPath = path; this._simIndex = 0; this._simT = 0; this._simLast = null;
    this._updateSimBtn();
    this._simRaf = requestAnimationFrame(t => this._simTick(t));
    this.emit('simulate', { running: true, path: path.slice() }, { bubbles: false });
    return true;
  }
  stopSimulate() {
    if (!this._simulating) return;
    this._simulating = false;
    this.classList.remove('is-simulating');
    if (this._simRaf) cancelAnimationFrame(this._simRaf); this._simRaf = 0;
    this._simToken?.remove(); this._simToken = null;
    for (const rec of this._eEls.values()) rec.g.classList.remove('is-active');
    this._updateSimBtn();
    this.emit('simulate', { running: false }, { bubbles: false });
  }
  _updateSimBtn() {
    if (!this._simBtn) return;
    this._simBtn.replaceChildren(fromHTML(dgIcon(this._simulating ? 'stop' : 'play')));
    const key = this._simulating ? 'workflow.stopSimulate' : 'workflow.simulate';
    this._simBtn.dataset.key = key;
    this._simBtn.setAttribute('aria-label', this.t(key)); this._simBtn.title = this.t(key);
    this._simBtn.classList.toggle('is-active', !!this._simulating);
  }
  _samplePath() {
    const starts = this._nodes.filter(n => n.type === 'wf-start');
    if (!starts.length) return [];
    const visited = new Set([starts[0].id]);
    const path = []; let cur = starts[0].id;
    for (let i = 0; i < 400; i++) {
      const outs = this._edges.filter(e => e.from === cur);
      if (!outs.length) break;
      const next = outs.find(e => !visited.has(e.to)) || outs[0];
      path.push(next.id); cur = next.to;
      if (this._nm.get(cur)?.type === 'wf-end') break;
      if (visited.has(cur)) break;
      visited.add(cur);
    }
    return path;
  }
  _simTick(now) {
    if (!this._simulating) return;
    if (this._simLast == null) this._simLast = now;
    const dt = now - this._simLast; this._simLast = now;
    const edgeId = this._simPath[this._simIndex], rec = this._eEls.get(edgeId);
    if (!rec || !rec.pts) { this._simIndex++; this._simT = 0; }
    else {
      rec.g.classList.add('is-active');
      this._simT += dt / 850;
      const p = dgPointAt(rec.pts, Math.min(1, this._simT));
      this._simToken.setAttribute('cx', dgF(p.x)); this._simToken.setAttribute('cy', dgF(p.y));
      if (this._simT >= 1) { rec.g.classList.remove('is-active'); this._simIndex++; this._simT = 0; }
    }
    if (this._simIndex >= this._simPath.length) { this.stopSimulate(); return; }
    this._simRaf = requestAnimationFrame(t => this._simTick(t));
  }
}
define('o-workflow', OWorkflow);
O.Workflow = OWorkflow;
O.workflow = { types: Object.keys(WF_TYPES), shapes: WF_SHAPES, ports: WF_PORTS };
