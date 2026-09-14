/* ============================================================================
 * Interaction (mixin for ODiagram): one pointer state machine for mouse, pen and
 * touch (pan, pinch, marquee, move with guides + snap, resize, connect, reconnect,
 * label drag), wheel zoom, keyboard shortcuts, inline label editing, minimap drag.
 * ========================================================================== */

const DG_ARROW_KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

const DgInteract = {
  _bind() {
    const st = this._stage;
    on(st, 'pointerdown', e => this._down(e));
    on(st, 'pointermove', e => this._move(e));
    on(st, 'pointerup', e => this._up(e, false));
    on(st, 'pointercancel', e => this._up(e, true));
    on(st, 'wheel', e => { if (!e.target.closest('.o-dg-editor')) this._vp.wheel(e, this.wheel); }, { passive: false });
    on(st, 'dblclick', e => this._dbl(e));
    on(st, 'contextmenu', e => this._ctx(e));
    on(st, 'pointerleave', () => { if (!this._drag) this._setHover(null); });
    on(this._lNodes, 'focusin', e => this._focusNode(e));
    on(this, 'keydown', e => this._key(e));
    on(this, 'keyup', e => { if (e.key === ' ' && this._space) { this._space = false; this.classList.remove('is-space'); } });
    on(this._editor, 'keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this._commitEdit(true); }
      else if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') { e.preventDefault(); this._commitEdit(false); }
      e.stopPropagation();
    });
    on(this._editor, 'blur', () => this._commitEdit(false));
    on(this._editor, 'input', () => this._placeEditor());
    on(this._mm, 'pointerdown', e => this._mmDown(e));
  },
  /** Classify an event target. */
  _hit(t) {
    const el = t && t.nodeType === 1 ? t : t?.parentElement;
    if (!el || !el.closest) return { kind: 'bg' };
    let m;
    if ((m = el.closest('[data-handle]'))) return { kind: 'handle', handle: m.dataset.handle };
    if ((m = el.closest('[data-port]'))) return { kind: 'port', node: m.dataset.node, port: m.dataset.port };
    if ((m = el.closest('[data-endpoint]'))) return { kind: 'endpoint', edge: m.dataset.edge, end: m.dataset.endpoint };
    if ((m = el.closest('[data-elabel]'))) return { kind: 'elabel', edge: m.dataset.elabel };
    if ((m = el.closest('.o-dg-node'))) return { kind: 'node', id: m.dataset.id };
    if ((m = el.closest('[data-edge]'))) return { kind: 'edge', edge: m.dataset.edge };
    if (el.closest('.o-dg-zoom, .o-dg-minimap, .o-dg-editor, .o-dg-float')) return { kind: 'ui' };
    return { kind: 'bg' };
  },
  get _editable() { return !this.readonly && !this._simulating; },

  _down(e) {
    const hit = this._hit(e.target);
    if (hit.kind === 'ui') return;
    if (this._editing) this._commitEdit(false);
    if (this._vp.pointerDown(e)) { this._cancelDrag(); return; }
    if (e.button === 2 || e.button > 2) return;
    if (e.target.closest?.('.o-dg-html a, .o-dg-html button, .o-dg-html input, .o-dg-html select, .o-dg-html textarea')) return;
    const w = this._vp.toWorld(e.clientX, e.clientY), ed = this._editable;
    const base = { pid: e.pointerId, sx: e.clientX, sy: e.clientY, wx: w.x, wy: w.y, moved: false, shift: e.shiftKey || e.metaKey || e.ctrlKey, touch: e.pointerType === 'touch' };
    let d = null;
    if (e.button === 1 || this._space || (hit.kind === 'bg' && (base.touch || this.readonly || this.panOnDrag))) d = { ...base, kind: 'pan', bg: hit.kind === 'bg' };
    else if (hit.kind === 'port' && ed) d = this._connectState(base, hit.node, hit.port);
    else if (hit.kind === 'handle' && ed) { const n = this._selNodes()[0]; if (n) d = { ...base, kind: 'resize', handle: hit.handle, id: n.id, orig: { x: n.x, y: n.y, w: n.width, h: n.height } }; }
    else if (hit.kind === 'endpoint' && ed) d = this._reconnectState(base, hit.edge, hit.end);
    else if (hit.kind === 'elabel' || hit.kind === 'edge') {
      const eid = hit.edge;
      if (base.shift) this._toggleEdge(eid); else if (!this._selE.has(eid) || this._sel.size) this._setSel([], [eid]);
      d = { ...base, kind: hit.kind === 'elabel' && ed ? 'label' : 'none', edge: eid };
    } else if (hit.kind === 'node') {
      const id = hit.id, was = this._sel.has(id), n = this._nm.get(id);
      this._pointerFocus = true;
      if (base.shift) this._toggleNode(id); else if (!was) this.select([id]);
      d = ed && n && !n.locked && this._sel.has(id) ? { ...base, kind: 'move', id, collapse: was && !base.shift } : { ...base, kind: this.readonly ? 'pan' : 'none', id };
      this._nEls.get(id)?.g.focus({ preventScroll: true });
      this._pointerFocus = false;
    } else d = { ...base, kind: 'marquee', add: base.shift, before: new Set(this._sel) };
    if (hit.kind !== 'node') this._stage.focus({ preventScroll: true });
    this._drag = d;
    if (d) { try { this._stage.setPointerCapture(e.pointerId); } catch {} }
    e.preventDefault();
  },
  _move(e) {
    if (this._vp.pointerMove(e)) return;
    const d = this._drag;
    if (!d) { this._hoverMove(e); return; }
    if (d.pid !== e.pointerId) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < (d.touch ? 6 : 3)) return;
      d.moved = true;
      if (!this._dragStart(d)) { this._drag = null; return; }
    }
    this._lastEv = e;
    this._dragStep(d, e);
    if (d.kind === 'move' || d.kind === 'connect' || d.kind === 'reconnect' || d.kind === 'marquee' || d.kind === 'resize') this._autoPan(e);
  },
  _dragStart(d) {
    this.classList.add(d.kind === 'pan' ? 'is-panning' : 'is-dragging');
    if (d.kind === 'move') {
      const ids = new Set(this._sel);
      for (const n of this._nodes) if (n.group && [...this._sel].some(id => this._nm.get(id)?.group === n.group)) ids.add(n.id);
      d.nodes = [...ids].map(id => this._nm.get(id)).filter(n => n && !n.locked).map(n => ({ n, x: n.x, y: n.y }));
      if (!d.nodes.length) return false;
      d.bbox = dgBounds(d.nodes.map(m => m.n));
      d.old = { ...d.bbox };
      const view = this._vp.world, pad = 400 / this._vp.k;
      d.cand = [];
      if (this.guides) for (const n of this._nodes) {
        if (ids.has(n.id) || n.x > view.x + view.w + pad || n.x + n.width < view.x - pad || n.y > view.y + view.h + pad || n.y + n.height < view.y - pad) continue;
        d.cand.push(n);
        if (d.cand.length > 400) break;
      }
      d.many = d.nodes.length > 250;
      if (d.many) this._lEdges.style.opacity = '0.25';
    }
    if (d.kind === 'label' || d.kind === 'resize') d.before = true;
    this._overlayDirty = true; this._schedule();
    return true;
  },
  _dragStep(d, e) {
    const w = this._vp.toWorld(e.clientX, e.clientY);
    if (d.kind === 'pan') { this._vp.panBy(e.clientX - (d.lx ?? d.sx), e.clientY - (d.ly ?? d.sy)); d.lx = e.clientX; d.ly = e.clientY; return; }
    if (d.kind === 'move') return this._dragMove(d, w, e);
    if (d.kind === 'resize') return this._dragResize(d, w, e);
    if (d.kind === 'marquee') return this._dragMarquee(d, w);
    if (d.kind === 'connect' || d.kind === 'reconnect') return this._dragConnect(d, w, e);
    if (d.kind === 'label') {
      const rec = this._eEls.get(d.edge), edge = this._em.get(d.edge);
      if (rec && rec.pts && edge) { edge.labelPos = round(clamp(dgProject(rec.pts, w), 0.03, 0.97), 3); this._invalidate(null, [edge.id]); }
    }
  },
  _dragMove(d, w, e) {
    const b = d.bbox, g = this.grid;
    let nx = b.x + (w.x - d.wx), ny = b.y + (w.y - d.wy);
    d.guides = [];
    let sx = false, sy = false;
    if (this.guides && !e.altKey && d.cand.length) {
      const th = 6 / this._vp.k, xs = [nx, nx + b.w / 2, nx + b.w], ys = [ny, ny + b.h / 2, ny + b.h];
      let bx = null, by = null;
      for (const c of d.cand) {
        const cx = [c.x, c.x + c.width / 2, c.x + c.width], cy = [c.y, c.y + c.height / 2, c.y + c.height];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          const dx = cx[j] - xs[i], dy = cy[j] - ys[i];
          if (Math.abs(dx) <= th && (!bx || Math.abs(dx) < Math.abs(bx.d))) bx = { d: dx, x: cx[j], c };
          if (Math.abs(dy) <= th && (!by || Math.abs(dy) < Math.abs(by.d))) by = { d: dy, y: cy[j], c };
        }
      }
      if (bx) { nx += bx.d; sx = true; }
      if (by) { ny += by.d; sy = true; }
      if (bx) d.guides.push([bx.x, Math.min(ny, bx.c.y) - 12, bx.x, Math.max(ny + b.h, bx.c.y + bx.c.height) + 12]);
      if (by) d.guides.push([Math.min(nx, by.c.x) - 12, by.y, Math.max(nx + b.w, by.c.x + by.c.width) + 12, by.y]);
    }
    if (this.snap && g > 0 && !e.altKey) { if (!sx) nx = Math.round(nx / g) * g; if (!sy) ny = Math.round(ny / g) * g; }
    const ox = Math.round(nx - b.x), oy = Math.round(ny - b.y);
    if (ox === d.ox && oy === d.oy) { this._overlayDirty = true; this._schedule(); return; }
    d.ox = ox; d.oy = oy;
    for (const m of d.nodes) { m.n.x = m.x + ox; m.n.y = m.y + oy; }
    if (d.many) { for (const m of d.nodes) this._nEls.get(m.n.id)?.g.setAttribute('transform', `translate(${m.n.x} ${m.n.y})`); this._overlayDirty = true; this._schedule(); }
    else this._invalidate(d.nodes.map(m => m.n.id));
    this._emitLive?.('move');
  },
  _dragResize(d, w, e) {
    const n = this._nm.get(d.id); if (!n) return;
    const o = d.orig, hd = d.handle, g = this.snap && this.grid > 0 && !e.altKey ? this.grid : 0, MIN = 24;
    const sn = v => (g ? Math.round(v / g) * g : Math.round(v));
    let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
    if (hd.includes('w')) x1 = Math.min(sn(w.x), x2 - MIN);
    if (hd.includes('e')) x2 = Math.max(sn(w.x), x1 + MIN);
    if (hd.includes('n')) y1 = Math.min(sn(w.y), y2 - MIN);
    if (hd.includes('s')) y2 = Math.max(sn(w.y), y1 + MIN);
    if (e.shiftKey || this._def(n).ratio) {
      const r = o.w / o.h;
      let nw = x2 - x1, nh = y2 - y1;
      if (hd.length === 2) { if (nw / nh > r) nw = nh * r; else nh = nw / r; }
      else if (hd === 'e' || hd === 'w') nh = nw / r; else nw = nh * r;
      if (hd.includes('w')) x1 = x2 - nw; else x2 = x1 + nw;
      if (hd.includes('n')) y1 = y2 - nh; else y2 = y1 + nh;
    }
    Object.assign(n, { x: Math.round(x1), y: Math.round(y1), width: Math.round(x2 - x1), height: Math.round(y2 - y1) });
    this._invalidate([n.id]);
  },
  _dragMarquee(d, w) {
    const r = { x: Math.min(d.wx, w.x), y: Math.min(d.wy, w.y), w: Math.abs(w.x - d.wx), h: Math.abs(w.y - d.wy) };
    d.rect = r;
    const ids = this._nodes.filter(n => dgRectsTouch(r, dgNodeRect(n))).map(n => n.id);
    this._setSel(d.add ? [...d.before, ...ids] : ids, [], { silent: true });
  },
  _connectState(base, nodeId, portId) {
    const n = this._nm.get(nodeId), p = n && dgPort(n, this._def(n), portId);
    if (!p) return null;
    return { ...base, kind: 'connect', from: nodeId, fromPort: portId, p0: p, reverse: p.kind === 'in' };
  },
  _reconnectState(base, edgeId, end) {
    const e = this._em.get(edgeId), rec = this._eEls.get(edgeId);
    if (!e || !rec || !rec.pts) return null;
    const fixed = end === 'to' ? rec.pts[0] : rec.pts[rec.pts.length - 1];
    const fixedNode = this._nm.get(end === 'to' ? e.from : e.to);
    const side = fixedNode ? (dgPorts(fixedNode, this._def(fixedNode)).find(p => Math.abs(p.x - fixed.x) < 1 && Math.abs(p.y - fixed.y) < 1)?.side || 'b') : 'b';
    return { ...base, kind: 'reconnect', edge: edgeId, end, p0: { x: fixed.x, y: fixed.y, side } };
  },
  _dragConnect(d, w, e) {
    const hit = this._hit(doc.elementFromPoint(e.clientX, e.clientY));
    let tid = hit.kind === 'node' ? hit.id : hit.kind === 'port' ? hit.node : null;
    if (d.kind === 'connect' && tid === d.from) tid = null;
    d.target = tid; d.snapPort = null;
    this._setHover(tid);
    let tp = null;
    if (tid) {
      const tn = this._nm.get(tid), needIn = d.kind === 'connect' ? !d.reverse : d.end === 'to';
      let best = 26 / this._vp.k;
      for (const p of dgPorts(tn, this._def(tn))) {
        if (needIn ? p.kind === 'out' : p.kind === 'in') continue;
        const dist = Math.hypot(p.x - w.x, p.y - w.y);
        if (dist < best) { best = dist; tp = p; }
      }
      if (tp) d.snapPort = { node: tid, port: tp.id };
      d.denied = !this._allowed(d, tid, tp);
    } else d.denied = false;
    const a = d.p0, bpt = tp || (tid ? (() => { const tn = this._nm.get(tid); return dgBoundary(tn, this._def(tn), a.x, a.y); })() : w);
    if (tp) { const pts = this._router.route(a, tp); d.ghost = dgRoundPath(pts, 8); }
    else d.ghost = `M${dgF(a.x)} ${dgF(a.y)}L${dgF(bpt.x)} ${dgF(bpt.y)}`;
    this.classList.toggle('is-denied', !!d.denied);
    this._overlayDirty = true; this._schedule();
  },
  _allowed(d, tid, tp) {
    if (d.kind === 'connect') {
      const from = d.reverse ? tid : d.from, to = d.reverse ? d.from : tid;
      return this._canConnect(from, to, d.reverse ? tp?.id : d.fromPort, d.reverse ? d.fromPort : tp?.id);
    }
    const e = this._em.get(d.edge); if (!e) return false;
    return d.end === 'to' ? this._canConnect(e.from, tid, e.fromPort, tp?.id, e) : this._canConnect(tid, e.to, tp?.id, e.toPort, e);
  },
  _autoPan(e) {
    clearInterval(this._apT); this._apT = 0;
    const r = this._stage.getBoundingClientRect(), m = 24;
    const dx = e.clientX < r.left + m ? 1 : e.clientX > r.right - m ? -1 : 0, dy = e.clientY < r.top + m ? 1 : e.clientY > r.bottom - m ? -1 : 0;
    if (!dx && !dy) return;
    this._apT = setInterval(() => {
      if (!this._drag || !this._lastEv) { clearInterval(this._apT); this._apT = 0; return; }
      this._vp.panBy(dx * 8, dy * 8);
      this._dragStep(this._drag, this._lastEv);
    }, 16);
  },
  _up(e, cancel) {
    this._vp.pointerUp(e);
    clearInterval(this._apT); this._apT = 0;
    const d = this._drag;
    if (!d || d.pid !== e.pointerId) return;
    this._drag = null;
    try { this._stage.releasePointerCapture(e.pointerId); } catch {}
    this.classList.remove('is-panning', 'is-dragging', 'is-denied');
    this._lEdges.style.opacity = '';
    if (cancel) return this._abortDrag(d);
    const node = d.id ? this._nm.get(d.id) : null;
    switch (d.kind) {
      case 'move':
        if (d.moved) {
          if (d.many) this._invalidate(d.nodes.map(m => m.n.id));
          this._rerouteAround(d.old, dgBounds(d.nodes.map(m => m.n)));
          this._commit('move');
          announce(this.t('diagram.moved', { count: d.nodes.length }));
        } else {
          if (d.collapse && this._sel.size > 1 && !this._nm.get(d.id)?.group) this.select([d.id]);
          if (node) this.emit('node-click', { node: clone(node), originalEvent: e });
        }
        break;
      case 'resize': if (d.moved) { this._rerouteAround(dgNodeRect(this._nm.get(d.id) || { x: 0, y: 0, width: 0, height: 0 }, 40)); this._commit('resize'); } break;
      case 'marquee':
        if (!d.moved) { if (!d.add) this.clearSelection(); }
        else this._setSel(this._sel, this._selE, { force: true });
        break;
      case 'connect': case 'reconnect': this._setHover(null); if (d.moved) this._finishConnect(d); break;
      case 'label': if (d.moved) this._commit('label'); break;
      case 'pan': if (!d.moved) { if (node) this.emit('node-click', { node: clone(node), originalEvent: e }); else if (d.bg) this.clearSelection(); } break;
      default:
        if (!d.moved && node) this.emit('node-click', { node: clone(node), originalEvent: e });
        if (!d.moved && d.edge) { const ed = this._em.get(d.edge); if (ed) this.emit('edge-click', { edge: clone(ed), originalEvent: e }); }
    }
    this._overlayDirty = true; this._schedule();
  },
  _abortDrag(d) {
    if (d.kind === 'move' && d.nodes) { for (const m of d.nodes) { m.n.x = m.x; m.n.y = m.y; } this._invalidate(d.nodes.map(m => m.n.id)); }
    if (d.kind === 'resize' && d.orig) { const n = this._nm.get(d.id); if (n) { Object.assign(n, { x: d.orig.x, y: d.orig.y, width: d.orig.w, height: d.orig.h }); this._invalidate([n.id]); } }
    this._setHover(null);
    this._overlayDirty = true; this._schedule();
  },
  _cancelDrag() {
    const d = this._drag; if (!d) return;
    this._drag = null; clearInterval(this._apT);
    this.classList.remove('is-panning', 'is-dragging', 'is-denied');
    this._lEdges.style.opacity = '';
    this._abortDrag(d);
  },
  _finishConnect(d) {
    if (!d.target || d.denied) { if (d.denied) announce(this.t('diagram.notAllowed')); return; }
    const tp = d.snapPort && d.snapPort.node === d.target ? d.snapPort.port : undefined;
    if (d.kind === 'connect') {
      if (d.reverse) this.connect(d.target, d.from, { fromPort: tp, toPort: d.fromPort, user: true });
      else this.connect(d.from, d.target, { fromPort: d.fromPort, toPort: tp, user: true });
      return;
    }
    const e = this._em.get(d.edge); if (!e) return;
    const patch = d.end === 'to' ? { to: d.target, toPort: tp } : { from: d.target, fromPort: tp };
    Object.assign(e, patch);
    if (patch.toPort === undefined && d.end === 'to') delete e.toPort;
    if (patch.fromPort === undefined && d.end === 'from') delete e.fromPort;
    this._reindex(); this._invalidate(null, [e.id]);
    this._commit('reconnect');
  },
  /** After a move, re-route edges whose path crosses the old or new area of the moved nodes. */
  _rerouteAround(...rects) {
    const rs = rects.filter(Boolean).map(r => ({ x: r.x - 20, y: r.y - 20, w: r.w + 40, h: r.h + 40 }));
    const ids = [];
    for (const [id, rec] of this._eEls) {
      if (!rec.pts) continue;
      for (let i = 1; i < rec.pts.length; i++) if (rs.some(r => dgRectsTouch(r, { x: Math.min(rec.pts[i - 1].x, rec.pts[i].x), y: Math.min(rec.pts[i - 1].y, rec.pts[i].y), w: Math.abs(rec.pts[i].x - rec.pts[i - 1].x) + 0.1, h: Math.abs(rec.pts[i].y - rec.pts[i - 1].y) + 0.1 }))) { ids.push(id); break; }
    }
    if (ids.length) this._invalidate(null, ids);
  },

  /* ── hover / focus ────────────────────────────────────────────────── */
  _hoverMove(e) {
    if (!this._editable || e.pointerType === 'touch') return;
    const hit = this._hit(e.target);
    let id = hit.kind === 'node' ? hit.id : hit.kind === 'port' ? hit.node : null;
    if (!id && this._hover) {
      const n = this._nm.get(this._hover), w = this._vp.toWorld(e.clientX, e.clientY);
      if (n && dgRectsTouch(dgNodeRect(n, 14 / this._vp.k), { x: w.x, y: w.y, w: 0.01, h: 0.01 })) id = this._hover;
    }
    this._setHover(id);
  },
  _setHover(id) { if (this._hover === id) return; this._hover = id; this._overlayDirty = true; this._schedule(); },
  _focusNode(e) {
    const g = e.target.closest && e.target.closest('.o-dg-node');
    if (!g || this._pointerFocus) return;
    const n = this._nm.get(g.dataset.id); if (!n) return;
    if (!this._sel.has(n.id) || this._sel.size > 1 || this._selE.size) this.select([n.id]);
    this._vp.ensureVisible(dgNodeRect(n, 8), 40, { animate: true });
  },

  /* ── double click / context menu ──────────────────────────────────── */
  _dbl(e) {
    const hit = this._hit(e.target);
    if (hit.kind === 'node') { const n = this._nm.get(hit.id); this.emit('node-dblclick', { node: clone(n) }); if (this._editable && n.type !== 'html') this.editLabel(hit.id); }
    else if ((hit.kind === 'edge' || hit.kind === 'elabel') && this._editable) this.editLabel(hit.edge, 'edge');
    else if (hit.kind === 'bg' && this._editable && this.createOnDblclick) {
      const w = this._vp.toWorld(e.clientX, e.clientY), g = this.snap && this.grid ? this.grid : 1;
      const n = this.addNode({ type: 'rounded', x: Math.round((w.x - 70) / g) * g, y: Math.round((w.y - 32) / g) * g, label: '' });
      this.select([n.id]); this.editLabel(n.id);
    }
  },
  _ctx(e) {
    e.preventDefault();
    const hit = this._hit(e.target);
    if (hit.kind === 'ui') return;
    if (hit.kind === 'node' && !this._sel.has(hit.id)) this.select([hit.id]);
    else if ((hit.kind === 'edge' || hit.kind === 'elabel') && !this._selE.has(hit.edge)) this._setSel([], [hit.edge]);
    else if (hit.kind === 'bg') this.clearSelection();
    this._ctxWorld = this._vp.toWorld(e.clientX, e.clientY);
    this._openMenu({ x: e.clientX, y: e.clientY });
  },

  /* ── keyboard ─────────────────────────────────────────────────────── */
  _key(e) {
    const t = e.target;
    if (!this._stage.contains(t) || t === this._editor || e.defaultPrevented) return;
    if (t.closest('.o-dg-html input, .o-dg-html textarea, .o-dg-html select, .o-dg-float')) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key, lk = k.length === 1 ? k.toLowerCase() : k, ed = this._editable;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (k === ' ' && !mod) { if (!this._space) { this._space = true; this.classList.add('is-space'); } stop(); return; }
    if (mod && lk === 'z') { stop(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if (mod && lk === 'y') { stop(); this.redo(); return; }
    if (mod && lk === 'a') { stop(); this.selectAll(); return; }
    if (mod && lk === 'c') { stop(); this.copy(); return; }
    if (mod && lk === 'x' && ed) { stop(); this.cut(); return; }
    if (mod && lk === 'v' && ed) { stop(); this.paste(); return; }
    if (mod && lk === 'd' && ed) { stop(); this.duplicate(); return; }
    if (mod && lk === 'g' && ed) { stop(); if (e.shiftKey) this.ungroup(); else this.group(); return; }
    if (mod && k === ']' && ed) { stop(); this.bringToFront(); return; }
    if (mod && k === '[' && ed) { stop(); this.sendToBack(); return; }
    if ((k === 'Delete' || k === 'Backspace') && ed && !mod) { if (this._sel.size || this._selE.size) { stop(); this.deleteSelection(); } return; }
    if (k === 'Escape') { if (this._drag) { stop(); this._cancelDrag(); } else if (this._sel.size || this._selE.size) { stop(); this.clearSelection(); this._stage.focus({ preventScroll: true }); } return; }
    if ((k === 'Enter' || k === 'F2') && !mod) {
      const n = this._selNodes()[0], edg = !n && this._selE.size === 1 ? [...this._selE][0] : null;
      if (n) { stop(); if (ed && n.type !== 'html') this.editLabel(n.id); else this.emit('node-click', { node: clone(n), originalEvent: e }); }
      else if (edg && ed) { stop(); this.editLabel(edg, 'edge'); }
      return;
    }
    if ((k === 'F10' && e.shiftKey) || k === 'ContextMenu') {
      stop();
      const n = this._selNodes()[0], r = this._stage.getBoundingClientRect();
      const p = n ? this._vp.toLocal(n.x + n.width / 2, n.y + n.height) : { x: 40, y: 40 };
      this._ctxWorld = n ? { x: n.x + n.width + 40, y: n.y } : this._vp.toWorld(r.left + r.width / 2, r.top + r.height / 2);
      this._openMenu({ x: r.left + p.x, y: r.top + p.y }, true);
      return;
    }
    if (DG_ARROW_KEYS[k] && !mod) {
      stop();
      const [dx, dy] = DG_ARROW_KEYS[k];
      if (ed && this._sel.size) { const step = e.altKey ? 1 : (this.snap && this.grid ? this.grid : 10) * (e.shiftKey ? 5 : 1); this.moveSelection(dx * step, dy * step); }
      else this._vp.panBy(-dx * 60, -dy * 60);
      return;
    }
    if (!mod && !e.altKey) {
      if (k === '+' || k === '=') { stop(); this._vp.zoomBy(1.25, { animate: true }); }
      else if (k === '-' || k === '_') { stop(); this._vp.zoomBy(1 / 1.25, { animate: true }); }
      else if (k === '0') { stop(); this.zoomTo(1, { animate: true }); }
      else if (k === '1' || k === '!') { stop(); this.fit({ animate: true }); }
    }
  },

  /* ── inline label editor ──────────────────────────────────────────── */
  /** Start inline editing of a node (default) or edge label. */
  editLabel(id, kind = 'node') {
    const item = kind === 'edge' ? this._em.get(id) : this._nm.get(id);
    if (!item || !this._editable) return;
    if (this._editing) this._commitEdit(false);
    this._editing = { id, kind, orig: item.label || '' };
    if (kind === 'node') this._nEls.get(id)?.g.classList.add('is-editing'); else this._eEls.get(id)?.lg.classList.add('is-editing');
    const ta = this._editor;
    ta.value = item.label || ''; ta.hidden = false;
    this._placeEditor();
    ta.focus({ preventScroll: true }); ta.select();
  },
  _placeEditor() {
    const ed = this._editing; if (!ed) return;
    const k = this._vp.k, ta = this._editor;
    let box, fs = 13;
    if (ed.kind === 'node') {
      const n = this._nm.get(ed.id); if (!n) return;
      const p = this._vp.toLocal(n.x, n.y); fs = (+n.style?.fontSize || 13) * k;
      box = { x: p.x, y: p.y, w: n.width * k, h: n.height * k };
    } else {
      const rec = this._eEls.get(ed.id), e = this._em.get(ed.id); if (!rec || !rec.pts) return;
      const pt = dgPointAt(rec.pts, e.labelPos ?? 0.5), p = this._vp.toLocal(pt.x, pt.y); fs = 12 * k;
      box = { x: p.x - 80, y: p.y - 18, w: 160, h: 36 };
    }
    const w = Math.max(120, box.w), hh = Math.max(34, box.h);
    css(ta, { left: Math.round(box.x + box.w / 2 - w / 2), top: Math.round(box.y + box.h / 2 - hh / 2), width: Math.round(w), height: Math.round(hh), fontSize: Math.max(11, Math.min(28, fs)) });
  },
  _commitEdit(cancel) {
    const ed = this._editing; if (!ed) return;
    this._editing = null;
    const ta = this._editor, v = ta.value;
    ta.hidden = true;
    const item = ed.kind === 'edge' ? this._em.get(ed.id) : this._nm.get(ed.id);
    this._nEls.get(ed.id)?.g.classList.remove('is-editing'); this._eEls.get(ed.id)?.lg.classList.remove('is-editing');
    if (!cancel && item && v !== ed.orig) {
      if (v) item.label = v; else delete item.label;
      if (ed.kind === 'edge') this._invalidate(null, [item.id]); else { item.label = v; this._invalidate([item.id]); }
      this._commit('label');
    }
    const g = ed.kind === 'node' && this._nEls.get(ed.id)?.g;
    if (this.contains(doc.activeElement) || doc.activeElement === doc.body) (g || this._stage).focus({ preventScroll: true });
  },

  /* ── minimap ──────────────────────────────────────────────────────── */
  _mmDown(e) {
    e.preventDefault(); e.stopPropagation();
    const go = ev => {
      const r = this._mmSvg.getBoundingClientRect(), b = this._mmBox; if (!b) return;
      const s = Math.max(b.w / r.width, b.h / r.height), ox = (r.width - b.w / s) / 2, oy = (r.height - b.h / s) / 2;
      this._vp.center(b.x + (ev.clientX - r.left - ox) * s, b.y + (ev.clientY - r.top - oy) * s);
    };
    go(e);
    const el = this._mm;
    try { el.setPointerCapture(e.pointerId); } catch {}
    const offMove = on(el, 'pointermove', go), offUp = on(el, 'pointerup pointercancel', () => { offMove(); offUp(); });
  },
};
