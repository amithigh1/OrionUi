(async () => {
  const steps = {};
  const fail = [];
  const assert = (name, cond, extra) => { steps[name] = !!cond; if (!cond) fail.push(name + (extra ? ' ' + JSON.stringify(extra) : '')); };
  const frame = () => new Promise(r => requestAnimationFrame(r));
  const frames = async n => { for (let i = 0; i < n; i++) await frame(); };
  const rectCenter = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const fire = (el, type, x, y, extra = {}) => el.dispatchEvent(new PointerEvent(type, {
    clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true,
    pointerId: 1, isPrimary: true, button: 0, pointerType: 'mouse', ...extra,
  }));

  let gr;
  try {
    gr = document.createElement('o-graph');
    gr.style.cssText = 'position:fixed; inset-block-start:0; inset-inline-start:0; width:1200px; height:600px; z-index:99999;';
    document.body.appendChild(gr);
    window.scrollTo(0, 0);
    await frames(3);

    // small, deterministic-ish graph (2 groups) with a labelled edge
    const nodes = Array.from({ length: 16 }, (_, i) => ({ id: 'n' + i, label: 'N' + i, group: i % 2 ? 'B' : 'A' }));
    const edges = [];
    for (let i = 1; i < 16; i++) edges.push({ source: 'n' + i, target: 'n' + Math.floor(i / 2) });
    edges.push({ source: 'n0', target: 'n1', label: 'primary link', weight: 3 });
    gr.nodes = nodes; gr.edges = edges;
    await frames(2);
    assert('graph-loaded', gr.getValue().nodes.length === 16 && gr.getValue().edges.length === 16, { v: gr.getValue().nodes.length });

    // ── force layout settles within the documented iteration budget ────
    // GrSimulation.step() decays alpha by (1-0.0228) each call and settles below alphaMin=0.001;
    // solving (1-0.0228)^n < 0.001 gives n ~= 300, so the documented "runs to completion" cap is 700 steps.
    let settled = false;
    const onSettle = () => { settled = true; };
    gr.addEventListener('o-settle', onSettle);
    const t0 = performance.now();
    await new Promise(resolve => {
      const check = () => { if (settled || performance.now() - t0 > 15000) resolve(); else setTimeout(check, 50); };
      check();
    });
    assert('force-layout-settles', settled === true, { elapsedMs: Math.round(performance.now() - t0) });
    assert('alpha-below-min-at-settle', gr._sim.alpha < gr._sim.o.alphaMin, { alpha: gr._sim.alpha, min: gr._sim.o.alphaMin });

    const posBefore1 = gr.getNode('n5'); void posBefore1;
    const simPos = id => { const n = gr._simById.get(id); return { x: n.x, y: n.y }; };
    const p1 = simPos('n5');
    await frames(10);
    const p2 = simPos('n5');
    assert('positions-stop-changing-after-settle', Math.abs(p1.x - p2.x) < 0.01 && Math.abs(p1.y - p2.y) < 0.01, { p1, p2 });

    // ── drag a node pins it ──────────────────────────────────────────────
    const nodeEl = id => gr.querySelector(`.o-gr-node[data-id="${CSS.escape(id)}"]`);
    let pinEvents = [];
    gr.addEventListener('o-pin', e => pinEvents.push(e.detail));
    const n3 = nodeEl('n3');
    const start = rectCenter(n3.getBoundingClientRect());
    fire(n3, 'pointerdown', start.x, start.y);
    fire(gr._stage, 'pointermove', start.x + 4, start.y + 4);
    fire(gr._stage, 'pointermove', start.x + 60, start.y - 40);
    fire(gr._stage, 'pointerup', start.x + 60, start.y - 40);
    await frames(3);
    assert('drag-pins-node', gr._simById.get('n3').pinned === true, { pinned: gr._simById.get('n3').pinned });
    assert('drag-pin-event-fired', pinEvents.some(d => d.id === 'n3' && d.pinned === true), { pinEvents });
    const pinnedPos = simPos('n3');
    await frames(15);
    const stillPos = simPos('n3');
    assert('pinned-node-does-not-drift', Math.abs(pinnedPos.x - stillPos.x) < 0.01 && Math.abs(pinnedPos.y - stillPos.y) < 0.01, { pinnedPos, stillPos });
    // double-click releases the pin
    n3.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    await frames(2);
    assert('dblclick-unpins', gr._simById.get('n3').pinned === false);

    // ── select highlights neighbours ─────────────────────────────────────
    const neighborIds = new Set(gr.getNeighbors('n0').map(n => n.id));
    // hover (no button down) drives the highlight classes
    const p0 = rectCenter(nodeEl('n0').getBoundingClientRect());
    fire(nodeEl('n0'), 'pointermove', p0.x, p0.y);
    await frame();
    const hlIds = [...gr.querySelectorAll('.o-gr-node.is-hl')].map(g => g.dataset.id);
    assert('hover-highlights-neighbours', hlIds.includes('n0') && [...neighborIds].every(id => hlIds.includes(id)), { hlIds, neighborIds: [...neighborIds] });
    const dimmed = [...gr.querySelectorAll('.o-gr-node.is-dim2')];
    assert('hover-dims-non-neighbours', dimmed.length === 16 - hlIds.length, { dimmed: dimmed.length, hl: hlIds.length });
    fire(gr._stage, 'pointerleave', 0, 0);
    await frame();
    assert('leave-clears-highlight', gr.querySelectorAll('.o-gr-node.is-hl').length === 0);

    const p7 = rectCenter(nodeEl('n7').getBoundingClientRect());
    fire(nodeEl('n7'), 'pointerdown', p7.x, p7.y);
    fire(nodeEl('n7'), 'pointerup', p7.x, p7.y);
    await frame();
    assert('click-selects', gr.getSelection() && gr.getSelection().id === 'n7', { sel: gr.getSelection() });

    // ── edge labels ──────────────────────────────────────────────────────
    const labelEl = [...gr.querySelectorAll('.o-gr-edge-label')].find(t => t.textContent === 'primary link');
    assert('edge-label-rendered', !!labelEl, { labels: [...gr.querySelectorAll('.o-gr-edge-label')].map(t => t.textContent) });
    if (labelEl) {
      const x = +labelEl.getAttribute('x'), y = +labelEl.getAttribute('y');
      const a = simPos('n0'), b = simPos('n1');
      assert('edge-label-at-midpoint', Math.abs(x - (a.x + b.x) / 2) < 1 && Math.abs(y - (a.y + b.y) / 2) < 1, { x, y, a, b });
    }
    const svgOut = gr.exportSVG();
    assert('edge-label-in-svg-export', svgOut.includes('primary link'));

    // ── zoom / pan ────────────────────────────────────────────────────────
    await gr.zoomTo(2, { animate: false });
    assert('graph-zoom-to', gr.zoom === 2);
    const vp = gr._vp;
    assert('graph-zoom-transform', gr._vpG.getAttribute('transform') === `matrix(${vp.k} 0 0 ${vp.k} ${vp.x} ${vp.y})`);
    const before = { x: vp.x, y: vp.y };
    vp.panBy(15, -9);
    assert('graph-pan-changes-viewport', vp.x === before.x + 15 && vp.y === before.y - 9);
    await gr.fit({ animate: false });
    assert('graph-fit-transform-consistent', gr._vpG.getAttribute('transform') === `matrix(${gr._vp.k} 0 0 ${gr._vp.k} ${gr._vp.x} ${gr._vp.y})`);

  } catch (err) {
    return { ok: false, error: String(err && err.stack || err), steps, fail };
  } finally {
    gr && gr.remove();
  }

  return { ok: fail.length === 0, steps, fail };
})();
