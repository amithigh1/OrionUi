/* ============================================================================
 * Rendering (mixin for ODiagram): stage skeleton, keyed SVG nodes / edges,
 * selection overlay, minimap and the screen-reader fallback list.
 * Pan / zoom only touch one transform attribute (no per-frame layout).
 * ========================================================================== */

const DG_HANDLES = [['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0], ['e', 1, 0.5], ['se', 1, 1], ['s', 0.5, 1], ['sw', 0, 1], ['w', 0, 0.5]];
const dgSafeURL = u => (/^(https?:|data:image\/|blob:|\.{0,2}\/|[\w-]+\.(png|jpe?g|gif|svg|webp))/i.test(String(u || '').trim()) ? String(u) : '');

const DgRender = {
  _buildStage() {
    const gid = uid('dg-grid'), helpId = uid('dg-help');
    this._gridDot = svg('circle', { class: 'o-dg-dot', cx: 1, cy: 1, r: 1 });
    this._gridPat = svg('pattern', { id: gid, width: 20, height: 20, patternUnits: 'userSpaceOnUse' }, this._gridDot);
    this._gridRect = svg('rect', { class: 'o-dg-grid', width: '100%', height: '100%', fill: `url(#${gid})` });
    this._lGroups = svg('g', { class: 'o-dg-groups' });
    this._lEdges = svg('g', { class: 'o-dg-edges' });
    this._lNodes = svg('g', { class: 'o-dg-nodes', role: 'listbox', 'aria-multiselectable': 'true' });
    this._lLabels = svg('g', { class: 'o-dg-elabels' });
    this._lOver = svg('g', { class: 'o-dg-overlay' });
    this._vpG = svg('g', { class: 'o-dg-viewport' }, this._lGroups, this._lEdges, this._lNodes, this._lLabels, this._lOver);
    this._svg = svg('svg', { class: 'o-dg-svg', role: 'presentation' }, svg('defs', null, this._gridPat), this._gridRect, this._vpG);
    this._zoomLbl = h('button', { type: 'button', class: 'o-dg-zoom-pct', onClick: () => this.zoomTo(1, { animate: true }) }, '100%');
    this._zoomBar = h('div', { class: 'o-dg-zoom', role: 'toolbar' },
      this._btn('zoom-out', 'diagram.zoomOut', () => this._vp.zoomBy(1 / 1.25, { animate: true })), this._zoomLbl,
      this._btn('zoom-in', 'diagram.zoomIn', () => this._vp.zoomBy(1.25, { animate: true })), this._btn('fit', 'diagram.fit', () => this.fit({ animate: true })));
    this._mmNodes = svg('path', { class: 'o-dg-mm-nodes' });
    this._mmSel = svg('path', { class: 'o-dg-mm-sel' });
    this._mmView = svg('rect', { class: 'o-dg-mm-view' });
    this._mmSvg = svg('svg', { class: 'o-dg-mm-svg', preserveAspectRatio: 'xMidYMid meet' }, this._mmNodes, this._mmSel, this._mmView);
    this._mm = h('div', { class: 'o-dg-minimap', 'aria-hidden': 'true', hidden: true }, this._mmSvg);
    this._editor = h('textarea', { class: 'o-dg-editor', hidden: true, rows: 1, spellcheck: 'true' });
    this._help = h('p', { id: helpId, class: 'o-sr-only' });
    this._srList = h('div', { class: 'o-sr-only o-dg-sr' });
    this._stage = h('div', { class: 'o-dg-stage', tabindex: '0', role: 'application', 'aria-describedby': helpId }, this._svg, this._zoomBar, this._mm, this._editor, this._help);
  },
  /** Small icon button helper. */
  _btn(iconName, key, onClick, extra = {}) {
    const b = h('button', { type: 'button', class: ['o-btn o-btn-ghost o-btn-icon o-btn-sm', extra.class], 'aria-label': this.t(key), title: this.t(key), 'data-key': key, onClick }, dgIcon(iconName));
    return b;
  },
  _texts() {
    this._help.textContent = this.t('diagram.help');
    this._lNodes.setAttribute('aria-label', this.t('diagram.shapesList'));
    this._zoomBar.setAttribute('aria-label', this.t('diagram.zoomBar'));
    this._editor.setAttribute('aria-label', this.t('diagram.editLabel'));
    this.querySelectorAll('[data-key]').forEach(b => { const s = this.t(b.dataset.key); if (b.hasAttribute('aria-label')) b.setAttribute('aria-label', s); if (b.title) b.title = s; const sp = b.querySelector('.o-dg-btn-text'); if (sp) sp.textContent = s; });
  },

  /* ── viewport ─────────────────────────────────────────────────────── */
  _applyVp(x, y, k) {
    this._vpG.setAttribute('transform', `matrix(${k} 0 0 ${k} ${x} ${y})`);
    const g = this.grid > 0 ? this.grid : 0;
    this._gridRect.style.display = g ? '' : 'none';
    if (g) {
      let step = g; while (step * k < 9) step *= 5;
      if (step !== this._gStep) { this._gStep = step; this._gridPat.setAttribute('width', step); this._gridPat.setAttribute('height', step); }
      this._gridDot.setAttribute('r', Math.min(1.6, 1.1 / k));
      this._gridPat.setAttribute('patternTransform', `translate(${x} ${y}) scale(${k})`);
    }
    if (this._lastK !== k) {
      this._lastK = k;
      this.classList.toggle('is-far', k < 0.38);
      this._zoomLbl.textContent = Math.round(k * 100) + '%';
      this._zoomLbl.setAttribute('aria-label', this.t('diagram.actual') + ' (' + Math.round(k * 100) + '%)');
      this._overlayDirty = true; this._schedule();
    }
    this._mmApply();
    if (this._editing) this._placeEditor();
  },

  /* ── scheduling ───────────────────────────────────────────────────── */
  _schedule() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this._paint(); });
  },
  /** Mark nodes (ids | true) and edges (ids | true) dirty and render in the next frame. */
  _invalidate(nodes, edges) {
    if (nodes === true) this._dirtyAll = true; else if (nodes) nodes.forEach(id => this._dirtyN.add(id));
    if (edges === true) this._dirtyEAll = true; else if (edges) edges.forEach(id => this._dirtyE.add(id));
    this._overlayDirty = true;
    this._schedule();
  },
  _paint() {
    if (!this._setupDone) return;
    if (this._dirtyAll) { this._dirtyAll = false; this._dirtyN.clear(); this._renderAll(); }
    else if (this._dirtyN.size) {
      for (const id of this._dirtyN) { const n = this._nm.get(id); if (n) { this._syncNode(n); this._router.set(n.id, n); for (const eid of this._inc.get(id) || []) this._dirtyE.add(eid); } }
      this._dirtyN.clear();
    }
    if (this._dirtyEAll) { this._dirtyEAll = false; this._dirtyE.clear(); for (const e of this._edges) this._syncEdge(e); }
    else if (this._dirtyE.size) { for (const id of this._dirtyE) { const e = this._em.get(id); if (e) this._syncEdge(e); } this._dirtyE.clear(); }
    if (this._overlayDirty) { this._overlayDirty = false; this._renderOverlay(); }
    this._mmDirty();
    this._a11yDirty();
  },
  /** Full render: keyed reuse of node / edge elements, z-order, router obstacles, incidence index. */
  _renderAll() {
    this._family = getComputedStyle(this).fontFamily || 'sans-serif';
    const live = new Set();
    this._router.clear();
    this._inc = new Map();
    let prev = null;
    for (const n of this._nodes) {
      live.add(n.id);
      const rec = this._syncNode(n);
      const next = prev ? prev.nextSibling : this._lNodes.firstChild;
      if (rec.g !== next) this._lNodes.insertBefore(rec.g, next);
      prev = rec.g;
      this._router.set(n.id, n);
    }
    for (const [id, rec] of this._nEls) if (!live.has(id)) { rec.g.remove(); this._nEls.delete(id); }
    const elive = new Set();
    for (const e of this._edges) {
      elive.add(e.id);
      for (const id of [e.from, e.to]) { let s = this._inc.get(id); if (!s) this._inc.set(id, (s = new Set())); s.add(e.id); }
    }
    for (const [id, rec] of this._eEls) if (!elive.has(id)) { rec.g.remove(); rec.lg.remove(); this._eEls.delete(id); }
    this._dirtyEAll = false; this._dirtyE.clear();
    for (const e of this._edges) this._syncEdge(e);
    this._renderOverlay();
  },
  _def(n) { return dgDef(n, this.shapes); },
  _font(size = 13, weight = 400) { return `${weight} ${size}px ${this._family || 'sans-serif'}`; },

  /* ── nodes ────────────────────────────────────────────────────────── */
  _nodeSig(n) { return [n.type, n.width, n.height, n.label, n.style ? JSON.stringify(n.style) : '', n.image || '', n.html || '', n.icon || '', n.ports ? JSON.stringify(n.ports) : '', this.renderNode && n.data ? JSON.stringify(n.data) : '', this._family].join('|'); },
  _syncNode(n) {
    let rec = this._nEls.get(n.id);
    if (!rec) {
      const g = svg('g', { class: 'o-dg-node', 'data-id': n.id, role: 'option', tabindex: '0', 'aria-selected': 'false' });
      rec = { g, sig: '' };
      this._nEls.set(n.id, rec);
    }
    if (!rec.g.parentNode) this._lNodes.append(rec.g);
    const sig = this._nodeSig(n);
    if (rec.sig !== sig) { rec.sig = sig; this._paintNode(rec.g, n); }
    rec.g.setAttribute('transform', `translate(${n.x} ${n.y})`);
    const sel = this._sel.has(n.id);
    rec.g.classList.toggle('is-selected', sel);
    rec.g.setAttribute('aria-selected', String(sel));
    return rec;
  },
  _paintNode(g, n) {
    const def = this._def(n), st = n.style || {}, w = n.width, hh = n.height;
    g.replaceChildren();
    g.setAttribute('class', `o-dg-node o-dg-t-${n.type}` + (this._sel.has(n.id) ? ' is-selected' : '') + (st.dashed ? ' is-dashed' : ''));
    g.setAttribute('aria-label', this.t('diagram.shapeDesc', { label: n.label || this.t('diagram.untitled'), shape: this._shapeName(n.type) }));
    if (def.render) { def.render.call(this, n, g, { w, h: hh, style: st, font: (s, wt) => this._font(s, wt), wrap: dgWrap, host: this }); return; }
    const paint = el => { if (st.fill) el.style.fill = st.fill; if (st.stroke) el.style.stroke = st.stroke; if (st.strokeWidth) el.style.strokeWidth = st.strokeWidth + 'px'; return el; };
    g.append(paint(svg('path', { class: 'o-dg-shape', d: def.path(w, hh, n) })));
    if (def.extra) { const x = svg('path', { class: 'o-dg-shape-x', d: def.extra(w, hh, n) }); if (st.stroke) x.style.stroke = st.stroke; g.append(x); }
    if (n.type === 'image') {
      const src = dgSafeURL(n.image || n.src);
      if (src) g.append(svg('image', { href: src, x: 6, y: 6, width: Math.max(1, w - 12), height: Math.max(1, hh - (n.label ? 34 : 12)), preserveAspectRatio: 'xMidYMid meet' }));
    }
    if (n.type === 'html') {
      const box = h('div', { class: 'o-dg-html', xmlns: 'http://www.w3.org/1999/xhtml' });
      const out = this.renderNode ? this.renderNode(n) : null;
      if (out instanceof Node) box.append(out); else box.innerHTML = out != null ? String(out) : sanitize(n.html || esc(n.label));
      g.append(svg('foreignObject', { x: 0, y: 0, width: w, height: hh }, box));
      return;
    }
    const tb = dgTextBox(n, def);
    if (tb && n.label) {
      const fs = +st.fontSize || 13, lh = Math.round(fs * 1.3), font = this._font(fs, st.bold ? 600 : 500);
      const lines = dgWrap(n.label, Math.max(10, tb.w), font, Math.max(1, Math.floor((tb.h + 2) / lh)));
      const start = (st.align || def.align) === 'start';
      const x = start ? tb.x : tb.x + tb.w / 2, y0 = start ? tb.y + lh / 2 : tb.y + (tb.h - lines.length * lh) / 2 + lh / 2;
      const text = svg('text', { class: 'o-dg-label', 'text-anchor': start ? 'start' : 'middle' });
      text.style.fontSize = fs + 'px';
      if (st.bold) text.style.fontWeight = '600';
      if (st.textColor) text.style.fill = st.textColor;
      lines.forEach((ln, i) => text.append(svg('tspan', { x: dgF(x), y: dgF(y0 + i * lh), dy: '0.35em' }, ln)));
      g.append(text);
    }
  },
  _shapeName(type) { const k = 'diagram.shapes.' + type; const s = this.t(k); return s === k ? (this._def({ type }).name || type) : s; },

  /* ── edges ────────────────────────────────────────────────────────── */
  _syncEdge(e) {
    let rec = this._eEls.get(e.id);
    if (!rec) {
      const hit = svg('path', { class: 'o-dg-edge-hit' }), line = svg('path', { class: 'o-dg-edge-line' });
      const a1 = svg('path', { class: 'o-dg-arrow' }), a2 = svg('path', { class: 'o-dg-arrow' });
      const g = svg('g', { class: 'o-dg-edge', 'data-edge': e.id }, hit, line, a1, a2);
      const lg = svg('g', { class: 'o-dg-elabel', 'data-elabel': e.id });
      rec = { g, hit, line, a1, a2, lg, sig: '' };
      this._eEls.set(e.id, rec);
    }
    if (rec.g.parentNode !== this._lEdges) { this._lEdges.append(rec.g); this._lLabels.append(rec.lg); }
    const geo = this._edgeGeom(e);
    rec.g.style.display = rec.lg.style.display = geo ? '' : 'none';
    if (!geo) { rec.pts = null; return rec; }
    rec.pts = geo.pts;
    const st = e.style || {}, color = st.stroke || e.color, sw = +st.width || +st.strokeWidth || 0;
    rec.line.setAttribute('d', geo.d);
    rec.hit.setAttribute('d', geo.d);
    rec.line.style.stroke = color || '';
    rec.line.style.strokeWidth = sw ? sw + 'px' : '';
    const sel = this._selE.has(e.id);
    rec.g.setAttribute('class', 'o-dg-edge' + (e.dashed ? ' is-dashed' : '') + (e.animated ? ' is-animated' : '') + (sel ? ' is-selected' : '') + (e.className ? ' ' + e.className : ''));
    const arrow = (el, p, show) => {
      el.style.display = show ? '' : 'none';
      if (!show) return;
      const L = 9 + (sw ? sw * 1.2 : 0), W = 7 + (sw ? sw : 0), bx = p.x - p.dx * L, by = p.y - p.dy * L;
      el.setAttribute('d', `M${dgF(p.x)} ${dgF(p.y)}L${dgF(bx - p.dy * W / 2)} ${dgF(by + p.dx * W / 2)}L${dgF(bx + p.dy * W / 2)} ${dgF(by - p.dx * W / 2)}Z`);
      el.style.fill = color || '';
    };
    arrow(rec.a1, geo.end, e.arrow === 'end' || e.arrow === 'both');
    arrow(rec.a2, geo.start, e.arrow === 'start' || e.arrow === 'both');
    // label
    const label = e.label;
    const lsig = (label || '') + '|' + this._family;
    if (lsig !== rec.sig) {
      rec.sig = lsig;
      rec.lg.replaceChildren();
      if (label) {
        const lines = String(label).split('\n').slice(0, 4), fs = 12, lh = 15, font = this._font(fs, 500);
        const w = Math.max(...lines.map(l => dgTextWidth(l, font))) + 12, hh = lines.length * lh + 6;
        const text = svg('text', { 'text-anchor': 'middle' });
        lines.forEach((l, i) => text.append(svg('tspan', { x: 0, y: dgF(-hh / 2 + 3 + lh / 2 + i * lh), dy: '0.35em' }, l)));
        rec.lg.append(svg('rect', { x: dgF(-w / 2), y: dgF(-hh / 2), width: dgF(w), height: dgF(hh), rx: 4 }), text);
      }
    }
    rec.lg.classList.toggle('is-selected', sel);
    if (label) { const p = dgPointAt(geo.pts, e.labelPos ?? 0.5); rec.lg.setAttribute('transform', `translate(${dgF(p.x)} ${dgF(p.y)})`); }
    return rec;
  },
  /** Geometry of an edge: { pts (full polyline), d (drawn path), start, end: {x, y, dx, dy} }. */
  _edgeGeom(e) {
    const a = this._nm.get(e.from), b = this._nm.get(e.to);
    if (!a || !b) return null;
    const da = this._def(a), db = this._def(b);
    const endArrow = e.arrow === 'end' || e.arrow === 'both', startArrow = e.arrow === 'start' || e.arrow === 'both';
    const AL = 9 + (+e.style?.width || 0) * 1.2;
    let pts, d;
    const dirOf = (p, q) => { const l = Math.hypot(q.x - p.x, q.y - p.y) || 1; return { dx: (q.x - p.x) / l, dy: (q.y - p.y) / l }; };
    if (a === b) {
      const ps = dgPorts(a, da), p = ps.find(x => x.side === 'r') || ps[0], q = ps.find(x => x.side === 't') || ps[1] || ps[0];
      pts = [p, { x: p.x + 28, y: p.y }, { x: p.x + 28, y: a.y - 28 }, { x: q.x, y: a.y - 28 }, q];
    } else if (e.type === 'straight') {
      if (e.fromPort == null && e.toPort == null) {
        const ca = { x: a.x + a.width / 2, y: a.y + a.height / 2 }, cb = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        pts = [dgBoundary(a, da, cb.x, cb.y), dgBoundary(b, db, ca.x, ca.y)];
      } else { const [p, q] = dgBestPorts(a, da, b, db, e); pts = [p, q]; }
    } else {
      const [p, q] = dgBestPorts(a, da, b, db, e);
      if (e.type === 'curve') {
        const [nx, ny] = DG_NORMAL[p.side], [mx, my] = DG_NORMAL[q.side];
        const L = clamp(Math.hypot(q.x - p.x, q.y - p.y) / 2.2, 30, 160);
        const c1 = { x: p.x + nx * L, y: p.y + ny * L }, c2 = { x: q.x + mx * L, y: q.y + my * L };
        pts = dgBezierPts(p, c1, c2, q, 24);
        const ez = endArrow ? { x: q.x + mx * AL, y: q.y + my * AL } : q, sz = startArrow ? { x: p.x + nx * AL, y: p.y + ny * AL } : p;
        d = `M${dgF(sz.x)} ${dgF(sz.y)}C${dgF(c1.x)} ${dgF(c1.y)} ${dgF(c2.x)} ${dgF(c2.y)} ${dgF(ez.x)} ${dgF(ez.y)}`;
        return { pts, d, end: { x: q.x, y: q.y, dx: -mx, dy: -my }, start: { x: p.x, y: p.y, dx: -nx, dy: -ny } };
      }
      pts = this._router.route(p, q, {});
    }
    const n = pts.length, end = { x: pts[n - 1].x, y: pts[n - 1].y, ...dirOf(pts[n - 2], pts[n - 1]) }, start = { x: pts[0].x, y: pts[0].y, ...dirOf(pts[1], pts[0]) };
    const drawn = pts.map(p => ({ x: p.x, y: p.y }));
    const cut = (i, j, dir) => { const l = dgDist(drawn[i], drawn[j]); if (l > AL + 1) { drawn[i] = { x: drawn[i].x - dir.dx * AL, y: drawn[i].y - dir.dy * AL }; } };
    if (endArrow) cut(n - 1, n - 2, end);
    if (startArrow) cut(0, 1, start);
    d = e.type === 'straight' ? `M${dgF(drawn[0].x)} ${dgF(drawn[0].y)}L${dgF(drawn[1].x)} ${dgF(drawn[1].y)}` : dgRoundPath(drawn, this.cornerRadius ?? 8);
    return { pts, d, end, start };
  },

  /* ── overlay (selection frame, handles, ports, guides, marquee, ghost edge) ─ */
  _renderOverlay() {
    const L = this._lOver, k = this._vp.k, ed = this._editable, hs = 8 / k, sw = 1.25 / k;
    L.replaceChildren();
    const sel = this._selNodes();
    const dash = `${4 / k} ${3 / k}`;
    // groups of selected nodes
    const groups = new Set(sel.map(n => n.group).filter(Boolean));
    for (const gid of groups) {
      const b = dgBounds(this._nodes.filter(n => n.group === gid)); if (!b) continue;
      const p = 12 / k;
      L.append(svg('rect', { class: 'o-dg-groupbox', x: b.x - p, y: b.y - p, width: b.w + p * 2, height: b.h + p * 2, rx: 8 / k, 'stroke-width': sw, 'stroke-dasharray': dash }));
    }
    const handles = ed && sel.length === 1 && !sel[0].locked && !this._drag;
    if (sel.length <= 400) for (const n of sel) {
      const p = handles ? 0 : 4 / k;
      L.append(svg('rect', { class: 'o-dg-frame', x: n.x - p, y: n.y - p, width: n.width + p * 2, height: n.height + p * 2, rx: 3 / k, 'stroke-width': sw }));
    }
    if (sel.length > 1) {
      const b = dgBounds(sel), p = 10 / k;
      L.append(svg('rect', { class: 'o-dg-selbox', x: b.x - p, y: b.y - p, width: b.w + p * 2, height: b.h + p * 2, 'stroke-width': sw, 'stroke-dasharray': dash }));
    }
    if (handles) {
      const n = sel[0];
      for (const [hid, fx, fy] of DG_HANDLES) L.append(svg('rect', { class: 'o-dg-handle', 'data-handle': hid, x: n.x + n.width * fx - hs / 2, y: n.y + n.height * fy - hs / 2, width: hs, height: hs, rx: 2 / k, 'stroke-width': sw }));
    }
    if (ed) for (const id of this._selE) {
      const rec = this._eEls.get(id); if (!rec || !rec.pts) continue;
      const a = rec.pts[0], z = rec.pts[rec.pts.length - 1];
      L.append(svg('circle', { class: 'o-dg-endpoint', 'data-endpoint': 'from', 'data-edge': id, cx: a.x, cy: a.y, r: 5 / k, 'stroke-width': sw }));
      L.append(svg('circle', { class: 'o-dg-endpoint', 'data-endpoint': 'to', 'data-edge': id, cx: z.x, cy: z.y, r: 5 / k, 'stroke-width': sw }));
    }
    const portNodes = new Set();
    if (ed && this._hover && (!this._drag || this._drag.kind === 'connect' || this._drag.kind === 'reconnect')) portNodes.add(this._hover);
    if (handles) portNodes.add(sel[0].id);
    for (const id of portNodes) {
      const n = this._nm.get(id); if (!n) continue;
      for (const p of dgPorts(n, this._def(n))) {
        const snap = this._drag && this._drag.snapPort && this._drag.snapPort.node === id && this._drag.snapPort.port === p.id;
        L.append(svg('circle', { class: 'o-dg-port' + (snap ? ' is-target' : '') + (p.kind !== 'both' ? ' is-' + p.kind : ''), 'data-node': id, 'data-port': p.id, cx: p.x, cy: p.y, r: 5 / k, 'stroke-width': 1.5 / k }));
      }
    }
    const d = this._drag;
    if (d && d.guides) for (const gl of d.guides) L.append(svg('line', { class: 'o-dg-guide', x1: gl[0], y1: gl[1], x2: gl[2], y2: gl[3], 'stroke-width': sw }));
    if (d && d.kind === 'marquee' && d.rect) L.append(svg('rect', { class: 'o-dg-marquee', x: d.rect.x, y: d.rect.y, width: d.rect.w, height: d.rect.h, 'stroke-width': sw }));
    if (d && (d.kind === 'connect' || d.kind === 'reconnect') && d.ghost) L.append(svg('path', { class: 'o-dg-ghost' + (d.denied ? ' is-denied' : ''), d: d.ghost, 'stroke-width': 1.75 / k, 'stroke-dasharray': `${5 / k} ${4 / k}` }));
    this._decorateOverlay?.(L, k);
  },

  /* ── minimap ──────────────────────────────────────────────────────── */
  _mmDirty() {
    if (!this.minimap) return;
    clearTimeout(this._mmT);
    this._mmT = setTimeout(() => this._renderMinimap(), this._drag ? 120 : 30);
  },
  _renderMinimap() {
    if (!this.minimap || this._mm.hidden) return;
    let d = '', ds = '';
    for (const n of this._nodes) {
      const s = `M${Math.round(n.x)} ${Math.round(n.y)}h${Math.round(n.width)}v${Math.round(n.height)}h${-Math.round(n.width)}Z`;
      if (this._sel.has(n.id)) ds += s; else d += s;
    }
    this._mmNodes.setAttribute('d', d);
    this._mmSel.setAttribute('d', ds);
    this._mmBounds = dgBounds(this._nodes);
    this._mmApply();
  },
  _mmApply() {
    if (!this.minimap || this._mm.hidden) return;
    const v = this._vp.world, b = this._mmBounds || v;
    const x1 = Math.min(b.x, v.x), y1 = Math.min(b.y, v.y), x2 = Math.max(b.x + b.w, v.x + v.w), y2 = Math.max(b.y + b.h, v.y + v.h);
    const pad = Math.max(x2 - x1, y2 - y1) * 0.04;
    this._mmBox = { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 };
    this._mmSvg.setAttribute('viewBox', `${this._mmBox.x} ${this._mmBox.y} ${this._mmBox.w} ${this._mmBox.h}`);
    const sc = Math.max(this._mmBox.w / 180, this._mmBox.h / 120);
    this._mmView.setAttribute('x', v.x); this._mmView.setAttribute('y', v.y);
    this._mmView.setAttribute('width', Math.max(0, v.w)); this._mmView.setAttribute('height', Math.max(0, v.h));
    this._mmView.setAttribute('stroke-width', 1.5 * sc);
  },

  /* ── screen reader summary ───────────────────────────────────────── */
  _a11yDirty() {
    clearTimeout(this._a11yT);
    this._a11yT = setTimeout(() => this._renderA11y(), 300);
  },
  _renderA11y() {
    if (!this.isConnected) return;
    const nodes = this._nodes, edges = this._edges;
    const name = id => { const n = this._nm.get(id); return n ? n.label || this.t('diagram.untitled') : id; };
    this._stage.setAttribute('aria-label', (this.label ? this.label + '. ' : '') + this.t('diagram.summary', { nodes: nodes.length, edges: edges.length }));
    if (nodes.length > 1500) { this._srList.replaceChildren(); return; }
    const outs = new Map();
    edges.forEach(e => { if (!outs.has(e.from)) outs.set(e.from, []); outs.get(e.from).push(name(e.to)); });
    const ul1 = h('ul', { 'aria-label': this.t('diagram.shapesList') }, nodes.map(n => h('li', null, `${name(n.id)} (${this._shapeName(n.type)}), ${outs.has(n.id) ? this.t('diagram.connectsTo', { list: fmt.list(outs.get(n.id)) }) : this.t('diagram.noLinks')}`)));
    const ul2 = h('ul', { 'aria-label': this.t('diagram.edgesList') }, edges.map(e => h('li', null, e.label ? this.t('diagram.edgeDescLabel', { from: name(e.from), to: name(e.to), label: e.label }) : this.t('diagram.edgeDesc', { from: name(e.from), to: name(e.to) }))));
    this._srList.replaceChildren(h('h3', null, this.t('diagram.shapesList')), ul1, h('h3', null, this.t('diagram.edgesList')), ul2);
  },
};
