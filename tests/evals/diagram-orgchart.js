(async () => {
  const steps = {};
  const fail = [];
  const assert = (name, cond, extra) => { steps[name] = !!cond; if (!cond) fail.push(name + (extra ? ' ' + JSON.stringify(extra) : '')); };
  const frame = () => new Promise(r => requestAnimationFrame(r));
  const frames = async n => { for (let i = 0; i < n; i++) await frame(); };
  const rectCenter = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  let oc;
  try {
    oc = document.createElement('o-orgchart');
    oc.setAttribute('search', '');
    oc.setAttribute('collapsible', '');
    oc.style.cssText = 'position:fixed; inset-block-start:0; inset-inline-start:0; width:1200px; height:600px; z-index:99999;';
    document.body.appendChild(oc);
    window.scrollTo(0, 0);

    // ── renders a 4-level tree from data ────────────────────────────────
    // level 0: ceo -> level 1: 2 VPs -> level 2: 2 managers each (4) -> level 3: 2 ICs per manager (8) = 15 people, 4 levels deep
    const nodes = [{ id: 'ceo', parentId: null, name: 'Casey CEO', title: 'CEO' }];
    const vps = ['vp1', 'vp2'];
    vps.forEach(vp => nodes.push({ id: vp, parentId: 'ceo', name: vp.toUpperCase(), title: 'VP' }));
    const mgrs = [];
    vps.forEach(vp => { for (let i = 0; i < 2; i++) { const id = vp + '-m' + i; mgrs.push(id); nodes.push({ id, parentId: vp, name: id, title: 'Manager' }); } });
    mgrs.forEach(m => { for (let i = 0; i < 2; i++) nodes.push({ id: m + '-ic' + i, parentId: m, name: m + '-ic' + i, title: 'IC' }); });
    assert('fixture-has-4-levels', nodes.length === 1 + 2 + 4 + 8, { count: nodes.length });

    oc.nodes = nodes;
    await frames(3);
    assert('renders-all-nodes', oc.getNodes().length === 15, { got: oc.getNodes().length });
    assert('renders-all-dom-cards', oc.querySelectorAll('.o-org-node').length === 15, { got: oc.querySelectorAll('.o-org-node').length });
    // depth check: walk ceo -> vp1 -> vp1-m0 -> vp1-m0-ic0 must all resolve (4 distinct levels)
    const anc = oc.getAncestors('vp1-m0-ic0').map(n => n.id);
    assert('four-level-depth', JSON.stringify(anc) === JSON.stringify(['vp1-m0', 'vp1', 'ceo']), { anc });

    // ── collapse / expand a branch (assert descendant count) ───────────
    const countDom = () => oc.querySelectorAll('.o-org-node').length;
    const before = countDom();
    oc.collapse('vp1'); // hides vp1's 2 managers + 4 ICs = 6 descendants
    await frames(2);
    const afterCollapse = countDom();
    assert('collapse-hides-descendants', before - afterCollapse === 6, { before, afterCollapse });
    assert('is-expanded-false', oc.isExpanded('vp1') === false);
    oc.expand('vp1');
    await frames(2);
    assert('expand-restores-descendants', countDom() === before, { got: countDom(), before });
    assert('is-expanded-true', oc.isExpanded('vp1') === true);

    // collapse via a real pointer click on the toggle glyph, then via keyboard Space
    const toggleOf = id => oc.querySelector(`.o-org-node[data-id="${CSS.escape(id)}"] .o-org-toggle`);
    const t1 = toggleOf('vp2');
    const t1pt = rectCenter(t1.getBoundingClientRect());
    t1.dispatchEvent(new PointerEvent('pointerdown', { clientX: t1pt.x, clientY: t1pt.y, bubbles: true, cancelable: true, composed: true, pointerId: 2, button: 0 }));
    t1.dispatchEvent(new PointerEvent('pointerup', { clientX: t1pt.x, clientY: t1pt.y, bubbles: true, cancelable: true, composed: true, pointerId: 2, button: 0 }));
    await frames(2);
    assert('pointer-toggle-collapses', oc.isExpanded('vp2') === false, { count: countDom() });
    // click again (pointer) to re-expand for the rest of the test
    t1.dispatchEvent(new PointerEvent('pointerdown', { clientX: t1pt.x, clientY: t1pt.y, bubbles: true, cancelable: true, composed: true, pointerId: 3, button: 0 }));
    t1.dispatchEvent(new PointerEvent('pointerup', { clientX: t1pt.x, clientY: t1pt.y, bubbles: true, cancelable: true, composed: true, pointerId: 3, button: 0 }));
    await frames(2);
    assert('pointer-toggle-re-expands', oc.isExpanded('vp2') === true);

    // ── horizontal / vertical layout switch ─────────────────────────────
    // vp1 & vp2 are siblings (same tree depth): in TB they must share the same Y (the depth axis)
    // and differ in X (the breadth axis); in LR that is flipped, per the tree-layout contract
    // (dgTreeLayout: horizontal -> {x: depth, y: breadth}, vertical -> {x: breadth, y: depth}).
    assert('default-direction-tb', oc.direction === 'TB');
    let vp1 = oc.getNode('vp1'), vp2 = oc.getNode('vp2');
    assert('tb-siblings-share-depth-row', vp1.y === vp2.y && vp1.x !== vp2.x, { vp1, vp2 });
    assert('tb-parent-above-children', oc.getNode('ceo').y < vp1.y, { ceo: oc.getNode('ceo'), vp1 });
    const settle = () => new Promise(r => setTimeout(r, 420)); // the direction-change relayout animates over 320ms
    oc.direction = 'LR';
    await settle(); await frames(2);
    vp1 = oc.getNode('vp1'); vp2 = oc.getNode('vp2');
    assert('lr-siblings-share-depth-column', vp1.x === vp2.x && vp1.y !== vp2.y, { vp1, vp2 });
    assert('lr-parent-left-of-children', oc.getNode('ceo').x < vp1.x, { ceo: oc.getNode('ceo'), vp1 });
    oc.direction = 'TB';
    await settle(); await frames(2);

    // ── search / highlight ──────────────────────────────────────────────
    const matches = oc.search('vp1-m0-ic');
    assert('search-returns-matches', matches.length === 2, { matches: matches.map(m => m.id) });
    await frame();
    const matchCards = [...oc.querySelectorAll('.o-org-card.is-match')];
    assert('search-highlights-dom', matchCards.length === 2, { got: matchCards.length });
    const dimmed = [...oc.querySelectorAll('.o-org-card.is-dim')];
    assert('search-dims-non-matches', dimmed.length === 15 - 2, { got: dimmed.length });
    oc.search('');
    await frame();
    assert('search-clear-removes-highlight', oc.querySelectorAll('.o-org-card.is-match').length === 0);

    // ── keyboard traversal ───────────────────────────────────────────────
    oc.select('ceo');
    oc._focusId = 'ceo';
    oc._nEls.get('ceo').div.focus({ preventScroll: true });
    await frame();
    const key = (k, extra = {}) => oc.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
    key('ArrowDown'); // TB: down = to first child
    await frame();
    assert('keyboard-down-to-child', oc._focusId === 'vp1' || oc._focusId === 'vp2', { focusId: oc._focusId });
    const firstChild = oc._focusId;
    key('ArrowRight'); // TB: right = next sibling
    await frame();
    assert('keyboard-right-to-sibling', oc._focusId !== firstChild && (oc._focusId === 'vp1' || oc._focusId === 'vp2'), { focusId: oc._focusId, firstChild });
    key('ArrowUp'); // TB: up = to parent
    await frame();
    assert('keyboard-up-to-parent', oc._focusId === 'ceo', { focusId: oc._focusId });
    key(' '); // space toggles collapse on the focused (root) card
    await frames(2);
    assert('keyboard-space-toggles', oc.isExpanded('ceo') === false, { expanded: oc.isExpanded('ceo') });
    key(' '); // toggle back
    await frames(2);
    assert('keyboard-space-toggles-back', oc.isExpanded('ceo') === true);

    // ── export ───────────────────────────────────────────────────────────
    const svg = oc.exportSVG();
    assert('export-svg-well-formed', svg.startsWith('<?xml') && svg.includes('<svg'), { head: svg.slice(0, 60) });
    assert('export-svg-has-a-name', svg.includes('CEO') || svg.includes('Casey'), { hasNode: svg.includes('Casey') });
    const png = await oc.exportPNG({ scale: 1 });
    assert('export-png-is-blob', png instanceof Blob && png.size > 0 && png.type === 'image/png', { size: png && png.size, type: png && png.type });

  } catch (err) {
    return { ok: false, error: String(err && err.stack || err), steps, fail };
  } finally {
    oc && oc.remove();
  }

  return { ok: fail.length === 0, steps, fail };
})();
