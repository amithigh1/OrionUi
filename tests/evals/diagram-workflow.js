(async () => {
  const steps = {};
  const fail = [];
  const assert = (name, cond, extra) => { steps[name] = !!cond; if (!cond) fail.push(name + (extra ? ' ' + JSON.stringify(extra) : '')); };
  const frame = () => new Promise(r => requestAnimationFrame(r));
  const frames = async n => { for (let i = 0; i < n; i++) await frame(); };

  let wf;
  try {
    wf = document.createElement('o-workflow');
    wf.style.cssText = 'position:fixed; inset-block-start:0; inset-inline-start:0; width:1200px; height:600px; z-index:99999;';
    document.body.appendChild(wf);
    window.scrollTo(0, 0);
    await frames(3);

    // defaults for <o-workflow>
    assert('defaults-toolbar-properties-on', wf.toolbar === true && wf.properties === true);
    assert('default-palette-is-workflow-types', Array.isArray(wf.palette) && wf.palette.some(p => p.type === 'wf-start'));

    // ── validation: reports unconnected nodes ──────────────────────────
    let lastValidate = null;
    wf.addEventListener('o-validate', e => { lastValidate = e.detail; });
    wf.value = { nodes: [{ id: 't', type: 'wf-task', x: 0, y: 0, label: 'Do it' }], edges: [] };
    await frames(2);
    assert('validate-unconnected', lastValidate && lastValidate.valid === false && lastValidate.errors.t && lastValidate.errors.t.length === 2, { lastValidate });

    // ── missing start ────────────────────────────────────────────────
    wf.import({
      nodes: [{ id: 't', type: 'wf-task', x: 0, y: 0, label: 'Do it' }, { id: 'e', type: 'wf-end', x: 0, y: 120 }],
      edges: [{ from: 't', to: 'e' }],
    });
    await frames(2);
    assert('missing-start-still-invalid', wf.validate() === false, { errors: wf._errors && [...wf._errors.entries()] });

    // ── missing end (End unreachable from Start) ────────────────────────
    wf.import({
      nodes: [{ id: 's', type: 'wf-start', x: 0, y: -120 }, { id: 't', type: 'wf-task', x: 0, y: 0, label: 'Do it' }, { id: 'e', type: 'wf-end', x: 300, y: 0 }],
      edges: [{ from: 's', to: 't' }], // 'e' is disconnected -> unreachable from Start
    });
    await frames(2);
    const errs1 = wf.validate();
    assert('missing-end-unreachable', errs1 === false && wf._errors.get('e') && wf._errors.get('e').includes(wf.t('workflow.errUnreachable')), { errors: wf._errors && [...wf._errors.entries()] });

    // ── multiple starts ─────────────────────────────────────────────────
    wf.import({
      nodes: [{ id: 's1', type: 'wf-start', x: 0, y: -120 }, { id: 's2', type: 'wf-start', x: 300, y: -120 }, { id: 't', type: 'wf-task', x: 0, y: 0, label: 'Do it' }, { id: 'e', type: 'wf-end', x: 0, y: 120 }],
      edges: [{ from: 's1', to: 't' }, { from: 't', to: 'e' }],
    });
    await frames(2);
    const errs2 = wf.validate();
    assert('multi-start-invalid', errs2 === false && wf._errors.get('s2') && wf._errors.get('s2').includes(wf.t('workflow.errMultiStart')), { errors: wf._errors && [...wf._errors.entries()] });

    // ── cycle: structurally valid (not itself a validation error) ───────
    wf.import({
      nodes: [{ id: 's', type: 'wf-start', x: 0, y: -120 }, { id: 'a', type: 'wf-task', x: 0, y: 0, label: 'A' }, { id: 'b', type: 'wf-task', x: 0, y: 120, label: 'B' }, { id: 'e', type: 'wf-end', x: 0, y: 240 }],
      edges: [{ from: 's', to: 'a' }, { from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'b', to: 'e' }],
    });
    await frames(2);
    assert('cycle-does-not-crash-validate', wf.validate() === true, { errors: wf._errors && [...wf._errors.entries()] });

    // ── a fully valid workflow reports valid: true ──────────────────────
    wf.import({
      nodes: [{ id: 's', type: 'wf-start', x: 0, y: -120 }, { id: 't', type: 'wf-task', x: 0, y: 0, label: 'Do it' }, { id: 'e', type: 'wf-end', x: 0, y: 120 }],
      edges: [{ from: 's', to: 't' }, { from: 't', to: 'e' }],
    });
    await frames(2);
    assert('valid-workflow-reports-true', wf.validate() === true && lastValidate.valid === true, { lastValidate });

    // ── condition node: two named ports, both must be wired ─────────────
    wf.import({
      nodes: [
        { id: 's', type: 'wf-start', x: 0, y: -160 }, { id: 'c', type: 'wf-condition', x: -20, y: -40, label: 'Check' },
        { id: 'e1', type: 'wf-end', x: -150, y: 100 }, { id: 'e2', type: 'wf-end', x: 150, y: 100 },
      ],
      edges: [{ from: 's', to: 'c' }, { from: 'c', to: 'e1', fromPort: 'yes' }], // 'no' port left dangling
    });
    await frames(2);
    const errsC = wf.validate();
    assert('condition-dangling-port', errsC === false && wf._errors.get('c'), { errors: wf._errors && [...wf._errors.entries()] });
    wf.connect('c', 'e2', { fromPort: 'no' });
    await frames(2);
    assert('condition-fixed-after-wiring-no', wf.validate() === true);

    // ── node types with properties panel: schema-driven edit round-trip ─
    wf.import({
      nodes: [{ id: 's', type: 'wf-start', x: 0, y: -120 }, { id: 'ap', type: 'wf-approval', x: 0, y: 0, label: 'Approve' }, { id: 'e', type: 'wf-end', x: 0, y: 120 }],
      edges: [{ from: 's', to: 'ap' }, { from: 'ap', to: 'e' }],
    });
    await frames(2);
    wf.select(['ap']);
    await frame();
    const approverInput = wf._propsEl.querySelector('[data-prop="label"]') ? wf._propsEl.querySelectorAll('input.o-input, textarea.o-textarea')[1] : wf._propsEl.querySelectorAll('input.o-input, textarea.o-textarea')[0];
    assert('properties-panel-has-approver-field', !!approverInput, { html: wf._propsEl.innerHTML.slice(0, 400) });
    if (approverInput) {
      approverInput.value = 'VP Engineering';
      approverInput.dispatchEvent(new Event('input', { bubbles: true }));
      await frame();
    }
    const nodeAfter = wf.getNode('ap');
    assert('properties-panel-edit-roundtrip', nodeAfter.data && nodeAfter.data.approver === 'VP Engineering', { data: nodeAfter.data });

    // edit again with a fresh read to prove it is a real round trip (get -> mutate via UI -> get again differs)
    const before = wf.getNode('ap').data.approver;
    if (approverInput) { approverInput.value = 'CTO'; approverInput.dispatchEvent(new Event('input', { bubbles: true })); await frame(); }
    const after = wf.getNode('ap').data.approver;
    assert('properties-panel-edit-roundtrip-2', before === 'VP Engineering' && after === 'CTO', { before, after });

  } catch (err) {
    return { ok: false, error: String(err && err.stack || err), steps, fail };
  } finally {
    wf && wf.remove();
  }

  return { ok: fail.length === 0, steps, fail };
})();
