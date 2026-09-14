(async () => {
  const steps = {};
  const fail = [];
  const assert = (name, cond, extra) => { steps[name] = !!cond; if (!cond) fail.push(name + (extra ? ' ' + JSON.stringify(extra) : '')); };
  const frame = () => new Promise(r => requestAnimationFrame(r));
  const frames = async n => { for (let i = 0; i < n; i++) await frame(); };
  const fire = (el, type, x, y, extra = {}) => el.dispatchEvent(new PointerEvent(type, {
    clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true,
    pointerId: 1, isPrimary: true, button: 0, pointerType: 'mouse', ...extra,
  }));
  const key = (el, k, extra = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
  const rectCenter = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  let dg;
  try {
    dg = document.createElement('o-diagram');
    dg.setAttribute('palette', '');
    dg.setAttribute('properties', '');
    dg.setAttribute('toolbar', '');
    dg.setAttribute('snap', '');
    dg.setAttribute('grid', '20');
    dg.style.cssText = 'position:fixed; inset-block-start:0; inset-inline-start:0; width:1200px; height:520px; z-index:99999;';
    document.body.appendChild(dg);
    window.scrollTo(0, 0);
    await frames(3);
    dg.guides = false; // isolate grid-snap from alignment-guide-snap in the drag test below

    // ── add nodes from the palette (drag, then click) ──────────────────
    const palItems = () => [...dg.querySelectorAll('.o-dg-pal-item')];
    assert('palette-rendered', palItems().length > 0, { count: palItems().length });
    const palBtn0 = palItems()[0]; // 'rounded'
    const pr0 = rectCenter(palBtn0.getBoundingClientRect());
    const stageRect = () => dg._stage.getBoundingClientRect();
    const dropA = { x: stageRect().left + 250, y: stageRect().top + 120 };
    fire(palBtn0, 'pointerdown', pr0.x, pr0.y);
    fire(palBtn0, 'pointermove', pr0.x + 12, pr0.y + 12);
    fire(palBtn0, 'pointermove', dropA.x, dropA.y);
    fire(palBtn0, 'pointerup', dropA.x, dropA.y);
    await frames(2);
    assert('palette-drag-add', dg.getNodes().length === 1, { nodes: dg.getNodes().length });

    const palBtn3 = palItems()[3]; // 'parallelogram'
    palBtn3.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    await frames(2);
    assert('palette-click-add', dg.getNodes().length === 2, { nodes: dg.getNodes().length });

    const [rawA, rawB] = dg.getNodes();
    const nodeAId = rawA.id, nodeBId = rawB.id;
    dg.updateNode(nodeAId, { x: 40, y: 40, label: 'Alpha' }, { commit: false });
    dg.updateNode(nodeBId, { x: 420, y: 40, label: 'Beta' }, { commit: false });
    await frames(2);

    const shapeOf = id => dg.querySelector(`.o-dg-node[data-id="${CSS.escape(id)}"] .o-dg-shape`);

    // ── connect two nodes by dragging a port (pointer events) ──────────
    const centerA = rectCenter(shapeOf(nodeAId).getBoundingClientRect());
    fire(shapeOf(nodeAId), 'pointermove', centerA.x, centerA.y); // hover reveals A's ports
    await frame();
    const portR = dg.querySelector(`.o-dg-port[data-node="${CSS.escape(nodeAId)}"][data-port="r"]`);
    assert('port-visible-on-hover', !!portR);
    const pStart = rectCenter(portR.getBoundingClientRect());
    fire(portR, 'pointerdown', pStart.x, pStart.y);
    fire(dg._stage, 'pointermove', pStart.x + 20, pStart.y);
    const centerB = rectCenter(shapeOf(nodeBId).getBoundingClientRect());
    fire(dg._stage, 'pointermove', centerB.x, centerB.y);
    const dragDebug = dg._drag ? { target: dg._drag.target, denied: dg._drag.denied, hasGhost: !!dg._drag.ghost, moved: dg._drag.moved, kind: dg._drag.kind } : null;
    const hitEl = document.elementFromPoint(centerB.x, centerB.y);
    const hitDebug = hitEl ? { tag: hitEl.tagName, cls: hitEl.getAttribute && hitEl.getAttribute('class'), closestNode: !!hitEl.closest?.('.o-dg-node') } : null;
    fire(dg._stage, 'pointerup', centerB.x, centerB.y);
    await frames(2);
    const edges1 = dg.getEdges();
    assert('connect-by-port-drag', edges1.length === 1 && edges1[0].from === nodeAId && edges1[0].to === nodeBId, { edges: edges1, dragDebug, hitDebug, centerB, nodeB: dg.getNode(nodeBId) });
    const edgeId = edges1[0] && edges1[0].id;

    // ── move a node (real drag) -> edge path updates + snap-to-grid ────
    const edgeLineD = () => dg._eEls.get(edgeId).line.getAttribute('d');
    const dBefore = edgeLineD();
    const nodeABefore = dg.getNode(nodeAId);
    const startA = rectCenter(shapeOf(nodeAId).getBoundingClientRect());
    fire(shapeOf(nodeAId), 'pointerdown', startA.x, startA.y);
    fire(dg._stage, 'pointermove', startA.x + 6, startA.y + 6);
    fire(dg._stage, 'pointermove', startA.x + 47, startA.y + 63); // deliberately not a multiple of the 20px grid
    fire(dg._stage, 'pointerup', startA.x + 47, startA.y + 63);
    await frames(2);
    const nodeAAfter = dg.getNode(nodeAId);
    const expX = Math.round((nodeABefore.x + 47) / 20) * 20, expY = Math.round((nodeABefore.y + 63) / 20) * 20;
    assert('move-node', nodeAAfter.x !== nodeABefore.x || nodeAAfter.y !== nodeABefore.y, { before: nodeABefore, after: nodeAAfter });
    assert('snap-to-grid', nodeAAfter.x === expX && nodeAAfter.y === expY, { expected: { x: expX, y: expY }, got: { x: nodeAAfter.x, y: nodeAAfter.y } });
    assert('edge-path-updates-on-move', edgeLineD() !== dBefore, { before: dBefore, after: edgeLineD() });

    // ── select / multi-select / delete ──────────────────────────────────
    // node A is already selected (the drag above selected it); shift-click B to multi-select
    const bPt = rectCenter(shapeOf(nodeBId).getBoundingClientRect());
    fire(shapeOf(nodeBId), 'pointerdown', bPt.x, bPt.y, { shiftKey: true });
    fire(shapeOf(nodeBId), 'pointerup', bPt.x, bPt.y, { shiftKey: true });
    await frame();
    const sel = dg.getSelection();
    assert('multi-select', sel.nodes.length === 2, { selection: sel.nodes.map(n => n.id) });

    const beforeDelete = dg.getValue();
    key(dg._stage, 'Delete');
    await frame();
    assert('keyboard-delete', dg.getNodes().length === 0 && dg.getEdges().length === 0, { nodes: dg.getNodes().length, edges: dg.getEdges().length });

    // ── undo/redo restore exact state (canUndo/canRedo getters) ────────
    assert('canUndo-after-delete', dg.canUndo === true);
    dg.undo();
    const afterUndo = dg.getValue();
    assert('undo-restores-exact-state', JSON.stringify(afterUndo) === JSON.stringify(beforeDelete), { afterUndo, beforeDelete });
    assert('canRedo-after-undo', dg.canRedo === true);
    dg.redo();
    assert('redo-reapplies-delete', dg.getNodes().length === 0 && dg.getEdges().length === 0);
    assert('canRedo-false-after-redo', dg.canRedo === false);
    dg.undo(); // restore content for the remaining tests
    assert('restored-for-remaining-tests', dg.getNodes().length === 2 && dg.getEdges().length === 1);

    // ── zoom / pan / fit-to-view (assert the viewport transform) ───────
    await dg.zoomTo(2, { animate: false });
    assert('zoomTo-sets-zoom', dg.zoom === 2, { zoom: dg.zoom });
    let vp = dg._vp;
    assert('zoom-transform-matches', dg._vpG.getAttribute('transform') === `matrix(${vp.k} 0 0 ${vp.k} ${vp.x} ${vp.y})`, { transform: dg._vpG.getAttribute('transform'), vp: { x: vp.x, y: vp.y, k: vp.k } });
    const beforePan = { x: vp.x, y: vp.y };
    vp.panBy(37, -21);
    assert('pan-changes-viewport', vp.x === beforePan.x + 37 && vp.y === beforePan.y - 21, { before: beforePan, after: { x: vp.x, y: vp.y } });
    assert('pan-transform-matches', dg._vpG.getAttribute('transform') === `matrix(${vp.k} 0 0 ${vp.k} ${vp.x} ${vp.y})`);
    await dg.zoomTo(1, { animate: false });
    await dg.fit({ animate: false });
    vp = dg._vp;
    assert('fit-transform-matches', dg._vpG.getAttribute('transform') === `matrix(${vp.k} 0 0 ${vp.k} ${vp.x} ${vp.y})`);
    // after fit, the content's world-space bounding box should map inside the stage viewport
    const contentBounds = dg._contentBounds();
    const corners = [[contentBounds.x, contentBounds.y], [contentBounds.x + contentBounds.w, contentBounds.y + contentBounds.h]].map(([wx, wy]) => vp.toLocal(wx, wy));
    const sz = vp.size;
    assert('fit-shows-content', corners.every(p => p.x > -50 && p.y > -50 && p.x < sz.w + 50 && p.y < sz.h + 50), { corners, size: sz });

    // ── export / import JSON round-trip equality ───────────────────────
    const val1 = dg.getValue();
    dg.import(val1);
    const val2 = dg.getValue();
    assert('json-roundtrip-equal', JSON.stringify(val1) === JSON.stringify(val2), { val1, val2 });

    // ── SVG export contains the node labels ─────────────────────────────
    const svgStr = dg.exportSVG();
    assert('svg-export-has-labels', svgStr.includes('Alpha') && svgStr.includes('Beta'), { len: svgStr.length, hasAlpha: svgStr.includes('Alpha'), hasBeta: svgStr.includes('Beta') });

    // ── keyboard: arrow nudges, Ctrl+Z / Ctrl+Y ─────────────────────────
    dg.select([nodeAId]);
    const posBeforeNudge = dg.getNode(nodeAId);
    dg._stage.focus();
    key(dg._stage, 'ArrowRight');
    await frame();
    const posAfterNudge = dg.getNode(nodeAId);
    assert('keyboard-arrow-nudge', posAfterNudge.x === posBeforeNudge.x + 20 && posAfterNudge.y === posBeforeNudge.y, { before: posBeforeNudge, after: posAfterNudge });

    key(dg._stage, 'z', { ctrlKey: true });
    await frame();
    const posAfterCtrlZ = dg.getNode(nodeAId);
    assert('keyboard-ctrl-z-undo', posAfterCtrlZ.x === posBeforeNudge.x, { posAfterCtrlZ, posBeforeNudge });

    key(dg._stage, 'y', { ctrlKey: true });
    await frame();
    const posAfterCtrlY = dg.getNode(nodeAId);
    assert('keyboard-ctrl-y-redo', posAfterCtrlY.x === posBeforeNudge.x + 20, { posAfterCtrlY });

  } catch (err) {
    return { ok: false, error: String(err && err.stack || err), steps, fail };
  } finally {
    dg && dg.remove();
  }

  return { ok: fail.length === 0, steps, fail };
})();
