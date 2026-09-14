/* ============================================================================
 * Panels (mixin for ODiagram): toolbar, shape palette (pointer drag onto the
 * canvas, Enter to add), properties inspector, context / dropdown menus and the
 * keyboard "Connect to…" picker. Menus are built here (no dependency on the
 * overlays package) on top of core overlays + ListNav.
 * ========================================================================== */

const DG_PALETTE = ['rounded', 'terminator', 'diamond', 'parallelogram', 'rect', 'ellipse', 'circle', 'hexagon', 'cylinder', 'document', 'note', 'text'];

const DgPanels = {
  /* ── toolbar ──────────────────────────────────────────────────────── */
  _renderToolbar() {
    const tb = this._top;
    tb.hidden = !this.toolbar;
    if (!this.toolbar) return;
    const b = (icn, key, fn, name) => { const el = this._btn(icn, key, fn); if (name) el.dataset.act = name; return el; };
    const sep = () => h('span', { class: 'o-dg-sep', role: 'separator' });
    tb.replaceChildren(
      b('undo', 'diagram.undo', () => this.undo(), 'undo'), b('redo', 'diagram.redo', () => this.redo(), 'redo'), sep(),
      b('trash', 'diagram.delete', () => this.deleteSelection(), 'sel'), b('copy', 'diagram.duplicate', () => this.duplicate(), 'nodes'), sep(),
      b('bring-front', 'diagram.bringFront', () => this.bringToFront(), 'nodes'), b('send-back', 'diagram.sendBack', () => this.sendToBack(), 'nodes'),
      b('group', 'diagram.group', () => this.group(), 'multi'), b('ungroup', 'diagram.ungroup', () => this.ungroup(), 'grouped'), sep(),
      this._menuBtn('layout', 'diagram.layout', () => this._layoutItems()),
      ...this._extraTools(),
      h('span', { class: 'o-spacer' }),
      this._menuBtn('download', 'diagram.export', () => this._exportItems(), true),
      b('panel', 'diagram.showProps', () => this.classList.toggle('is-props-open'), 'props'),
    );
    this._updateToolbar();
  },
  _extraTools() { return []; },
  _menuBtn(icn, key, items, withText) {
    const btn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm' + (withText ? '' : ' o-btn-icon'), 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': this.t(key), title: this.t(key), 'data-key': key }, dgIcon(icn), withText ? h('span', { class: 'o-dg-btn-text' }, this.t(key)) : null);
    btn.addEventListener('click', () => {
      if (this._menuOv && this._menuOwner === btn) { this._menuOv.close('api'); return; }
      const r = btn.getBoundingClientRect();
      this._menu({ x: isRTL(this) ? r.right : r.left, y: r.bottom + 2 }, items(), btn);
    });
    return btn;
  },
  _updateToolbar() {
    if (!this.toolbar) return;
    const nodes = this._selNodes(), ro = !this._editable;
    this._top.querySelectorAll('[data-act]').forEach(b => {
      const a = b.dataset.act;
      b.disabled = a === 'undo' ? ro || !this._hist.canUndo : a === 'redo' ? ro || !this._hist.canRedo
        : a === 'sel' ? ro || !(nodes.length || this._selE.size) : a === 'nodes' ? ro || !nodes.length
          : a === 'multi' ? ro || nodes.length < 2 : a === 'grouped' ? ro || !nodes.some(n => n.group) : false;
    });
  },
  _layoutItems() {
    return [
      { label: this.t('diagram.layeredTB'), run: () => this.layout('layered', { direction: 'TB', animate: true }) },
      { label: this.t('diagram.layeredLR'), run: () => this.layout('layered', { direction: 'LR', animate: true }) },
      { label: this.t('diagram.treeTB'), run: () => this.layout('tree', { direction: 'TB', animate: true }) },
      { label: this.t('diagram.treeLR'), run: () => this.layout('tree', { direction: 'LR', animate: true }) },
    ];
  },
  _exportItems() {
    const items = [
      { label: this.t('diagram.exportSVG'), icon: 'image', run: () => this.download('svg') },
      { label: this.t('diagram.exportPNG'), icon: 'image', run: () => this.download('png') },
      { label: this.t('diagram.exportJSON'), icon: 'file', run: () => this.download('json') },
    ];
    if (this._editable) items.push('-', { label: this.t('diagram.import'), icon: 'upload', run: () => this._importPick() });
    return items;
  },
  _importPick() {
    const inp = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; inp.remove();
      if (!f) return;
      try { const v = JSON.parse(await f.text()); if (!isObj(v) || !Array.isArray(v.nodes)) throw new Error('bad'); this.import(v); }
      catch { announce(this.t('diagram.importFailed'), 'assertive'); }
    });
    this.append(inp); inp.click();
  },

  /* ── menus ────────────────────────────────────────────────────────── */
  /** Open a menu at a client point. items: [{ label, icon, kbd, run, disabled, checked } | '-' | { header }] */
  _menu(pt, items, owner) {
    this._menuOv?.close('api');
    if (O.menu && this.useOrionMenu) { /* reserved: delegate to the overlays package once its API is published */ }
    const panel = h('div', { class: 'o-floating o-dg-menu o-dg-float', role: 'menu', tabindex: '-1' });
    for (const it of items.filter(Boolean)) {
      if (it === '-') { if (panel.lastChild && !panel.lastChild.classList.contains('o-dg-menu-sep')) panel.append(h('div', { class: 'o-dg-menu-sep', role: 'separator' })); continue; }
      if (it.header) { panel.append(h('div', { class: 'o-dg-menu-head', role: 'presentation' }, it.header)); continue; }
      panel.append(h('button', {
        type: 'button', class: 'o-dg-menu-item', role: it.checked != null ? 'menuitemradio' : 'menuitem', 'aria-checked': it.checked != null ? String(!!it.checked) : null, disabled: !!it.disabled,
        onClick: () => { this._menuOv?.close('api'); it.run(); },
      }, it.icon ? dgIcon(it.icon, 'o-dg-menu-ic') : h('span', { class: 'o-dg-menu-ic' }, it.checked ? dgIcon('check') : null), h('span', { class: 'o-dg-menu-text' }, it.label), it.kbd ? h('kbd', { class: 'o-kbd' }, it.kbd) : null));
    }
    if (panel.lastChild?.classList.contains('o-dg-menu-sep')) panel.lastChild.remove();
    portal(panel, this);
    place(panel, { x: pt.x, y: pt.y }, { placement: 'bottom-start', offset: 2, rtl: isRTL(this) });
    const nav = new ListNav(panel, { items: '[role^=menuitem]:not(:disabled)', onSelect: el => el.click() });
    on(panel, 'keydown', e => { if (nav.handle(e)) return; if (e.key === 'Tab') { e.preventDefault(); this._menuOv?.close('api'); } });
    if (owner) owner.setAttribute('aria-expanded', 'true');
    this._menuOwner = owner || null;
    this._menuOv = overlays.open({ el: panel, owner: owner || null, onClose: () => { panel.remove(); this._menuOv = null; this._menuOwner = null; owner?.setAttribute('aria-expanded', 'false'); } });
    animate(panel, 'zoomIn', { duration: 120 });
    nav.first();
  },
  _openMenu(pt) {
    const nodes = this._selNodes(), edges = [...this._selE].map(id => this._em.get(id)).filter(Boolean), ed = this._editable, t = k => this.t('diagram.' + k);
    const mod = /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘' : 'Ctrl+';
    let items = [];
    if (nodes.length && ed) {
      const n = nodes[0];
      if (nodes.length === 1) items.push({ label: t('editLabel'), icon: 'edit', kbd: 'Enter', run: () => this.editLabel(n.id) });
      if (nodes.length === 1) items.push({ label: t('connectTo'), icon: 'arrow-right', run: () => this._picker(n.id, 'connect') });
      if (nodes.length === 1 && (this._inc.get(n.id)?.size)) items.push({ label: t('disconnect'), icon: 'x', run: () => this._picker(n.id, 'disconnect') });
      items.push('-', { label: t('cut'), kbd: mod + 'X', run: () => this.cut() }, { label: t('copy'), icon: 'copy', kbd: mod + 'C', run: () => this.copy() },
        { label: t('duplicate'), kbd: mod + 'D', run: () => this.duplicate() }, { label: t('delete'), icon: 'trash', kbd: 'Del', run: () => this.deleteSelection() }, '-',
        { label: t('bringFront'), icon: 'bring-front', kbd: mod + ']', run: () => this.bringToFront() }, { label: t('sendBack'), icon: 'send-back', kbd: mod + '[', run: () => this.sendToBack() });
      if (nodes.length > 1) items.push({ label: t('group'), icon: 'group', kbd: mod + 'G', run: () => this.group() });
      if (nodes.some(x => x.group)) items.push({ label: t('ungroup'), icon: 'ungroup', run: () => this.ungroup() });
    } else if (edges.length && ed) {
      const e = edges[0];
      if (edges.length === 1) items.push({ label: t('editLabel'), icon: 'edit', kbd: 'Enter', run: () => this.editLabel(e.id, 'edge') });
      items.push({ header: t('edgeType') }, ...DG_EDGE_TYPES.map(ty => ({ label: this.t('diagram.types.' + ty), checked: edges.every(x => x.type === ty), run: () => this._patchEdges(edges, { type: ty }) })));
      items.push({ header: t('arrow') }, ...DG_ARROWS.map(a => ({ label: this.t('diagram.arrows.' + a), checked: edges.every(x => x.arrow === a), run: () => this._patchEdges(edges, { arrow: a }) })));
      items.push('-', { label: t('delete'), icon: 'trash', kbd: 'Del', run: () => this.deleteSelection() });
    } else {
      if (ed) items.push({ label: t('paste'), kbd: mod + 'V', disabled: !__dgClip, run: () => this.paste(this._ctxWorld) }, { label: t('selectAll'), kbd: mod + 'A', run: () => this.selectAll() }, '-',
        { header: t('layout') }, ...this._layoutItems(), '-');
      items.push({ label: t('fit'), icon: 'fit', kbd: '1', run: () => this.fit({ animate: true }) }, '-', ...this._exportItems());
    }
    items = this._menuHook ? this._menuHook(items, { nodes, edges }) : items;
    this._menu(pt, items);
  },

  /* ── keyboard connect / disconnect picker ─────────────────────────── */
  _picker(sourceId, mode) {
    const src = this._nm.get(sourceId); if (!src) return;
    this._menuOv?.close('api');
    let entries;
    if (mode === 'connect') entries = this._nodes.filter(n => n.id !== sourceId).map(n => ({ id: n.id, label: n.label || this.t('diagram.untitled'), sub: this._shapeName(n.type) }));
    else entries = [...(this._inc.get(sourceId) || [])].map(id => this._em.get(id)).filter(Boolean).map(e => { const other = this._nm.get(e.from === sourceId ? e.to : e.from); return { id: e.id, label: (e.from === sourceId ? '→ ' : '← ') + (other?.label || this.t('diagram.untitled')), sub: e.label || '' }; });
    const input = h('input', { class: 'o-input o-input-sm', type: 'search', placeholder: this.t('diagram.searchShapes'), 'aria-label': this.t(mode === 'connect' ? 'diagram.connectTo' : 'diagram.disconnect'), role: 'combobox', 'aria-expanded': 'true', autocomplete: 'off' });
    const list = h('div', { class: 'o-dg-picker-list o-scroll', role: 'listbox', id: uid('dg-pick') });
    input.setAttribute('aria-controls', list.id);
    const panel = h('div', { class: 'o-floating o-dg-picker o-dg-float', role: 'dialog', 'aria-label': this.t(mode === 'connect' ? 'diagram.connectTo' : 'diagram.disconnect') }, input, list);
    const choose = id => {
      ov.close('api');
      if (mode === 'connect') this.connect(sourceId, id, { user: true }); else this.removeEdge(id);
      this._nEls.get(sourceId)?.g.focus({ preventScroll: true });
    };
    const nav = new ListNav(list, { items: '[role=option]', virtual: input, onSelect: el => choose(el.dataset.id) });
    const fill = () => {
      const res = fuzzySearch(entries, input.value, 'label', 200);
      list.replaceChildren(...(res.length ? res.map(en => h('div', { role: 'option', class: 'o-dg-picker-opt', 'data-id': en.id, 'aria-selected': 'false', onClick: () => choose(en.id) }, h('span', null, en.label), en.sub ? h('small', null, en.sub) : null)) : [h('div', { class: 'o-dg-picker-empty' }, this.t('diagram.noShapes'))]));
      if (res.length) nav.set(0, { scroll: false });
    };
    on(input, 'input', fill);
    on(input, 'keydown', e => { if (nav.handle(e)) return; if (e.key === 'Tab') { e.preventDefault(); ov.close('api'); } });
    portal(panel, this);
    const p = this._vp.toLocal(src.x + src.width / 2, src.y + src.height), r = this._stage.getBoundingClientRect();
    place(panel, { x: r.left + p.x, y: r.top + p.y }, { placement: 'bottom', offset: 8 });
    const ov = overlays.open({ el: panel, onClose: () => panel.remove() });
    fill(); input.focus();
  },

  /* ── palette ──────────────────────────────────────────────────────── */
  _paletteItems() {
    const p = this.palette;
    const list = Array.isArray(p) ? p : DG_PALETTE;
    return list.map(it => (isStr(it) ? { type: it } : it)).filter(it => it && (this.shapes?.[it.type] || DG_SHAPES[it.type]));
  },
  _renderPalette() {
    const el = this._paletteEl, on_ = this.palette !== false && this.palette != null && this.palette !== 'false';
    el.hidden = !on_ || this.readonly;
    if (el.hidden) return;
    const grid = h('div', { class: 'o-dg-pal-grid', role: 'list' });
    this._paletteItems().forEach((it, i) => {
      const def = this.shapes?.[it.type] || DG_SHAPES[it.type];
      const [sw, sh] = def.ratio ? [26, 26] : it.type === 'diamond' ? [36, 26] : [38, 24];
      const prev = it.icon ? dgIcon(it.icon, 'o-dg-pal-ic') : svg('svg', { class: 'o-dg-pal-svg', viewBox: `-2 -2 ${sw + 4} ${sh + 4}`, 'aria-hidden': 'true' },
        svg('path', { class: 'o-dg-pal-shape', d: def.path ? def.path(sw, sh, {}) : dgRR(sw, sh, 4) }), def.extra ? svg('path', { class: 'o-dg-pal-shape', d: def.extra(sw, sh), fill: 'none' }) : null);
      const label = it.label || this._shapeName(it.type);
      grid.append(h('div', { role: 'listitem', class: 'o-dg-pal-cell' }, h('button', { type: 'button', class: 'o-dg-pal-item', 'data-i': i, title: label }, prev, h('span', { class: 'o-dg-pal-label' }, label))));
    });
    el.replaceChildren(h('div', { class: 'o-dg-pane-title' }, this.t(this._paletteTitleKey || 'diagram.palette')), h('p', { class: 'o-dg-pane-hint' }, this.t('diagram.paletteHint')), grid);
    this._palItems = this._paletteItems();
  },
  _bindPalette() {
    let drag = null;
    on(this._paletteEl, 'pointerdown', '.o-dg-pal-item', (e, btn) => {
      if (e.button !== 0) return;
      drag = { btn, it: this._palItems[+btn.dataset.i], sx: e.clientX, sy: e.clientY, pid: e.pointerId, ghost: null };
      try { btn.setPointerCapture(e.pointerId); } catch {}
    });
    on(this._paletteEl, 'pointermove', e => {
      if (!drag || e.pointerId !== drag.pid) return;
      if (!drag.ghost) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
        const def = this.shapes?.[drag.it.type] || DG_SHAPES[drag.it.type], [w, hh] = [drag.it.width || def.size?.[0] || 140, drag.it.height || def.size?.[1] || 64];
        const k = this._vp.k;
        drag.ghost = h('div', { class: 'o-dg-drag-ghost', style: { width: w * k, height: hh * k } });
        drag.ghost.append(svg('svg', { viewBox: `-1 -1 ${w + 2} ${hh + 2}`, width: '100%', height: '100%' }, svg('path', { d: def.path ? def.path(w, hh, {}) : dgRR(w, hh, 8) })));
        portal(drag.ghost, this);
        drag.w = w; drag.h = hh;
      }
      css(drag.ghost, { left: e.clientX - drag.w * this._vp.k / 2, top: e.clientY - drag.h * this._vp.k / 2 });
      const r = this._stage.getBoundingClientRect();
      drag.ghost.classList.toggle('is-over', e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom);
    });
    on(this._paletteEl, 'pointerup pointercancel', e => {
      if (!drag || e.pointerId !== drag.pid) return;
      const d = drag; drag = null;
      if (!d.ghost) return;
      d.ghost.remove();
      this._swallowPal = true; setTimeout(() => { this._swallowPal = false; }, 0);
      const r = this._stage.getBoundingClientRect();
      if (e.type === 'pointerup' && e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom) {
        const w = this._vp.toWorld(e.clientX, e.clientY);
        this._addFromPalette(d.it, { x: w.x - d.w / 2, y: w.y - d.h / 2 });
      }
    });
    on(this._paletteEl, 'click', '.o-dg-pal-item', (e, btn) => {
      if (this._swallowPal) return;
      const it = this._palItems[+btn.dataset.i], c = this._vp.world;
      const def = this.shapes?.[it.type] || DG_SHAPES[it.type], w = it.width || def.size?.[0] || 140, hh = it.height || def.size?.[1] || 64;
      let x = c.x + c.w / 2 - w / 2, y = c.y + c.h / 2 - hh / 2;
      for (let i = 0; i < 20 && this._nodes.some(n => Math.abs(n.x - x) < 8 && Math.abs(n.y - y) < 8); i++) { x += 24; y += 24; }
      const n = this._addFromPalette(it, { x, y });
      if (e.detail === 0 && n) this._nEls.get(n.id)?.g.focus({ preventScroll: true });
    });
  },
  _addFromPalette(it, at) {
    const g = this.snap && this.grid > 0 ? this.grid : 1;
    const { label, icon: _i, ...rest } = it;
    const node = { ...clone(rest), label: label ?? this._shapeName(it.type), x: Math.round(at.x / g) * g, y: Math.round(at.y / g) * g };
    if (it.type === 'text' && label == null) node.label = this.t('diagram.shapes.text');
    const n = this.addNode(node, { user: true });
    if (n) { this.select([n.id]); announce(this.t('diagram.added', { label: n.label || this._shapeName(n.type) })); }
    return n;
  },

  /* ── properties inspector ─────────────────────────────────────────── */
  _renderProps(force) {
    const el = this._propsEl;
    el.hidden = !this.properties || this.readonly;
    if (el.hidden) return;
    const nodes = this._selNodes(), edges = [...this._selE].map(id => this._em.get(id)).filter(Boolean);
    const key = nodes.map(n => n.id).join(',') + '|' + edges.map(e => e.id).join(',');
    if (!force && key === this._propsKey && el.contains(doc.activeElement)) { this._propsValues(); return; }
    this._propsKey = key;
    const body = h('div', { class: 'o-dg-props-body' });
    const head = h('div', { class: 'o-dg-pane-title' }, h('span', null, this.t('diagram.properties')), h('button', { type: 'button', class: 'o-btn-close o-btn-close-sm o-dg-props-close', 'aria-label': this.t('common.close'), onClick: () => this.classList.remove('is-props-open') }));
    this._inspect(body, nodes, edges);
    el.replaceChildren(head, body);
  },
  /** Fill the inspector body (overridden by <o-workflow>). */
  _inspect(body, nodes, edges) {
    if (!nodes.length && !edges.length) {
      body.append(h('p', { class: 'o-dg-pane-hint' }, this.t('diagram.noSelection')),
        this._fField('diagram.gridSize', this._fSelect([0, 10, 20, 40].map(v => [v, v ? v + ' px' : this.t('common.none')]), this.grid, v => { this.grid = +v; })),
        this._fCheck('diagram.snap', this.snap, v => { this.snap = v; }), this._fCheck('diagram.minimap', this.minimap, v => { this.minimap = v; }));
      return;
    }
    if (nodes.length + edges.length > 1) body.append(h('p', { class: 'o-dg-pane-hint' }, this.t('diagram.multiple', { count: nodes.length + edges.length })));
    if (nodes.length) {
      const n = nodes[0], one = nodes.length === 1;
      if (one) body.append(this._fField('diagram.labelText', this._fText(n.label, v => this.updateNode(n.id, { label: v }, { key: 'label:' + n.id }), true, 'label')));
      const shapes = Object.keys({ ...DG_SHAPES, ...(this.shapes || {}) }).filter(s => !DG_SHAPES[s]?.hidden && s !== 'html');
      body.append(this._fField('diagram.shape', this._fSelect(shapes.map(s => [s, this._shapeName(s)]), nodes.every(x => x.type === n.type) ? n.type : '', v => this._patchNodes(nodes, { type: v }))));
      const presets = h('div', { class: 'o-dg-swatches', role: 'group', 'aria-label': this.t('diagram.style') }, Object.keys(DG_PRESETS).map(p => h('button', {
        type: 'button', class: 'o-dg-swatch', title: this.t('diagram.presets.' + p), 'aria-label': this.t('diagram.presets.' + p),
        style: { background: DG_PRESETS[p].fill || 'var(--o-surface)', borderColor: DG_PRESETS[p].stroke || 'var(--o-border-strong)' },
        onClick: () => this._patchNodes(nodes, n2 => ({ style: { ...(n2.style || {}), fill: DG_PRESETS[p].fill, stroke: DG_PRESETS[p].stroke, textColor: DG_PRESETS[p].textColor } })),
      })));
      body.append(this._fField('diagram.style', presets));
      const col = (key, prop, sel) => this._fField(key, this._fColor(this._colorOf(n, prop, sel), v => this._patchNodes(nodes, n2 => ({ style: { ...(n2.style || {}), [prop]: v } }))));
      body.append(h('div', { class: 'o-dg-row3' }, col('diagram.fill', 'fill', '.o-dg-shape'), col('diagram.stroke', 'stroke', '.o-dg-shape'), col('diagram.textColor', 'textColor', '.o-dg-label')));
      body.append(h('div', { class: 'o-dg-row2' },
        this._fField('diagram.fontSize', this._fNum(n.style?.fontSize || 13, v => this._patchNodes(nodes, n2 => ({ style: { ...(n2.style || {}), fontSize: clamp(+v || 13, 8, 48) } })), 8, 48)),
        this._fCheck('diagram.dashed', !!n.style?.dashed, v => this._patchNodes(nodes, n2 => ({ style: { ...(n2.style || {}), dashed: v } })))));
      if (one) {
        const num = (k, prop) => this._fField('diagram.' + k, this._fNum(Math.round(n[prop]), v => this.updateNode(n.id, { [prop]: prop === 'width' || prop === 'height' ? Math.max(16, +v || 16) : +v || 0 }, { key: 'geo:' + n.id }), null, null, prop));
        body.append(h('div', { class: 'o-dg-row4' }, num('x', 'x'), num('y', 'y'), num('w', 'width'), num('h', 'height')));
      }
    }
    if (edges.length) {
      const e = edges[0];
      if (edges.length === 1) body.append(this._fField('diagram.labelText', this._fText(e.label || '', v => this.updateEdge(e.id, { label: v }, { key: 'elabel:' + e.id }), true, 'elabel')));
      body.append(this._fField('diagram.edgeType', h('div', { class: 'o-segmented o-dg-seg', role: 'group' }, DG_EDGE_TYPES.map(ty => h('button', { type: 'button', 'aria-pressed': String(edges.every(x => x.type === ty)), onClick: () => this._patchEdges(edges, { type: ty }) }, this.t('diagram.types.' + ty))))));
      body.append(this._fField('diagram.arrow', this._fSelect(DG_ARROWS.map(a => [a, this.t('diagram.arrows.' + a)]), edges.every(x => x.arrow === e.arrow) ? e.arrow : '', v => this._patchEdges(edges, { arrow: v }))));
      body.append(h('div', { class: 'o-dg-row2' }, this._fCheck('diagram.dashed', !!e.dashed, v => this._patchEdges(edges, { dashed: v })), this._fCheck('diagram.animated', !!e.animated, v => this._patchEdges(edges, { animated: v }))));
      body.append(this._fField('diagram.stroke', this._fColor(this._edgeColor(e), v => this._patchEdges(edges, x => ({ style: { ...(x.style || {}), stroke: v } })))));
    }
  },
  /** Refresh numeric fields (x/y/w/h) without rebuilding the inspector. */
  _propsValues() {
    const n = this._selNodes()[0]; if (!n) return;
    this._propsEl.querySelectorAll('[data-prop]').forEach(inp => { const p = inp.dataset.prop; if (inp !== doc.activeElement && p in n) inp.value = p === 'label' ? n.label : Math.round(n[p]); });
  },
  _colorOf(n, prop, sel) {
    const v = n.style?.[prop], g = this._nEls.get(n.id)?.g, el = g && g.querySelector(sel);
    const c = v ? dgResolveColor(this, v) : el ? getComputedStyle(el)[prop === 'textColor' ? 'fill' : prop] : '';
    return color.toHex(c) || '#000000';
  },
  _edgeColor(e) { const el = this._eEls.get(e.id)?.line; return color.toHex(e.style?.stroke ? dgResolveColor(this, e.style.stroke) : el ? getComputedStyle(el).stroke : '') || '#64748b'; },
  _fField(key, control) {
    const id = uid('dgf');
    const c = control.matches?.('input, select, textarea') ? control : control.querySelector?.('input, select, textarea');
    if (c && !c.id && !control.matches?.('.o-check, .o-switch')) c.id = id;
    return h('div', { class: 'o-field o-dg-field' }, h('label', { class: 'o-label', for: c && c.id === id ? id : null }, this.t(key)), control);
  },
  _fText(v, onInput, multi, prop) {
    const el = h(multi ? 'textarea' : 'input', { class: multi ? 'o-textarea o-dg-ta' : 'o-input o-input-sm', rows: multi ? 2 : null, 'data-prop': prop || null });
    el.value = v ?? '';
    on(el, 'input', () => onInput(el.value));
    return el;
  },
  _fNum(v, onChange, min, max, prop) {
    const el = h('input', { class: 'o-input o-input-sm', type: 'number', min, max, 'data-prop': prop || null });
    el.value = v;
    on(el, 'change', () => onChange(el.value));
    return el;
  },
  _fSelect(opts, v, onChange) {
    const el = h('select', { class: 'o-select o-input-sm' }, v === '' ? h('option', { value: '' }, '—') : null, opts.map(([val, text]) => h('option', { value: val }, text)));
    el.value = String(v);
    on(el, 'change', () => { if (el.value !== '') onChange(el.value); });
    return el;
  },
  _fColor(v, onChange) {
    const el = h('input', { class: 'o-input o-input-sm o-dg-color', type: 'color' });
    el.value = v;
    on(el, 'input', () => onChange(el.value));
    return el;
  },
  _fCheck(key, v, onChange) {
    const inp = h('input', { type: 'checkbox' });
    inp.checked = !!v;
    on(inp, 'change', () => onChange(inp.checked));
    return h('label', { class: 'o-switch o-switch-sm o-dg-check' }, inp, h('span', null, this.t(key)));
  },
};
