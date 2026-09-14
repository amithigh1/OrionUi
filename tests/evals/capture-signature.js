/* tests/evals/capture-signature.js — run against docs/components/signature.html
 * Proves <o-signature>: drawing via real PointerEvents produces a non-empty PNG/SVG/JSON export, undo/clear,
 * `required` blocking native form submission until signed, and the form value round-trip.
 */
(async () => {
  const results = [];
  const assert = (name, cond, extra) => results.push({ name, ok: !!cond, extra });
  const raf = () => new Promise(r => requestAnimationFrame(r));

  // Synthetic (non-trusted) PointerEvents report no coalesced events in Chrome, so the pad's pointermove handler
  // (which reads e.getCoalescedEvents()) would otherwise see zero points per move. Make every event report itself.
  if (window.PointerEvent && PointerEvent.prototype.getCoalescedEvents) {
    PointerEvent.prototype.getCoalescedEvents = function () { return [this]; };
  }

  function freshSignature() {
    const el = document.createElement('o-signature');
    el.style.cssText = 'position:fixed;inset-inline-start:-9999px;top:-9999px;width:300px';
    document.body.appendChild(el);
    return el;
  }
  function pointerEvent(type, x, y, id) {
    return new PointerEvent(type, { clientX: x, clientY: y, pointerId: id ?? 1, bubbles: true, cancelable: true, pointerType: 'mouse', button: 0 });
  }
  async function drawStroke(el, points) {
    const canvas = el._canvas;
    const rect = canvas.getBoundingClientRect();
    const toClient = p => ({ x: rect.left + p[0] * rect.width, y: rect.top + p[1] * rect.height });
    const p0 = toClient(points[0]);
    canvas.dispatchEvent(pointerEvent('pointerdown', p0.x, p0.y));
    for (const p of points.slice(1)) {
      const c = toClient(p);
      canvas.dispatchEvent(pointerEvent('pointermove', c.x, c.y));
      await raf();
    }
    const last = toClient(points[points.length - 1]);
    canvas.dispatchEvent(pointerEvent('pointerup', last.x, last.y));
  }

  // ---- draw via real PointerEvents -> non-empty PNG/SVG/JSON ----
  {
    const el = freshSignature();
    await raf();
    assert('starts empty', el.isEmpty() && el.value === null);
    const beginPromise = new Promise(resolve => el.addEventListener('o-begin', resolve, { once: true }));
    const endPromise = new Promise(resolve => el.addEventListener('o-end', resolve, { once: true }));
    const changePromise = new Promise(resolve => el.addEventListener('o-change', e => resolve(e.detail), { once: true }));
    await drawStroke(el, [[0.1, 0.5], [0.3, 0.3], [0.5, 0.6], [0.7, 0.35], [0.9, 0.5]]);
    await Promise.all([beginPromise, endPromise]);
    const changeDetail = await changePromise;
    assert('drawing produces a non-empty value (o-change fires)', !el.isEmpty() && typeof el.value === 'string' && el.value.startsWith('data:image/png'));
    assert('o-change detail matches the current value', changeDetail.value === el.value);

    const png = el.toPNG();
    assert('toPNG(): a non-trivial data URL', png.startsWith('data:image/png') && png.length > 100, { len: png.length });
    const blob = await el.toBlob();
    assert('toBlob(): a non-empty Blob', blob instanceof Blob && blob.size > 0, { size: blob.size });
    const svg = el.toSVG();
    assert('toSVG(): contains at least one drawn path', svg.includes('<path') && svg.includes('</svg>'));
    const points = el.toPoints();
    assert('toPoints(): one non-empty stroke as JSON-safe data', Array.isArray(points) && points.length === 1 && points[0].length > 1 && JSON.stringify(points).length > 20);

    // ---- undo / clear ----
    await drawStroke(el, [[0.2, 0.2], [0.4, 0.25]]);
    assert('a second stroke is recorded', el.toPoints().length === 2);
    el.undo();
    assert('undo(): removes only the last stroke', el.toPoints().length === 1 && !el.isEmpty());
    el.clear();
    assert('clear(): empties the pad and value', el.isEmpty() && el.value === null);

    // ---- round-trip via fromPoints ----
    el.fromPoints(points);
    assert('fromPoints(): restores a non-empty signature from toPoints() output', !el.isEmpty() && el.toPoints().length === 1);

    el.remove();
  }

  // ---- required: blocks submit until signed; form value round-trips ----
  {
    const form = document.createElement('form');
    form.style.cssText = 'position:fixed;inset-inline-start:-9999px;top:-9999px;width:300px';
    form.noValidate = true; // we call reportValidity() ourselves, same as the docs demo
    const sig = document.createElement('o-signature');
    // NOTE: FormElement's `name` prop has no `reflect: true` (unlike required/disabled/readonly), so setting the
    // *property* alone does not set the `name` *content attribute* — and a form-associated custom element's
    // FormData entry is keyed off the attribute (there is no native "name" IDL reflection for custom elements the
    // way there is for <input>). Setting the attribute directly is the reliable way; see the final report's
    // "Proposed changes outside my scope" for the core fix (src/core/40-component.js FormElement.props.name).
    sig.setAttribute('name', 'agreement'); sig.required = true;
    form.appendChild(sig);
    document.body.appendChild(form);
    await raf();

    assert('required + empty: reportValidity() is false', form.reportValidity() === false);
    assert('required + empty: checkValidity() on the element itself is false', sig.checkValidity() === false);

    await drawStroke(sig, [[0.15, 0.5], [0.5, 0.3], [0.85, 0.5]]);
    assert('required + signed: reportValidity() is now true', form.reportValidity() === true);

    const fd = new FormData(form);
    assert('form value round-trip: FormData carries the signature under its name', typeof fd.get('agreement') === 'string' && fd.get('agreement').startsWith('data:image/png'));
    assert('form value round-trip: matches the element value', fd.get('agreement') === sig.value);

    form.remove();
  }

  // ---- typed mode: a fully keyboard-operable alternative (no pointer at all) ----
  {
    const el = freshSignature();
    el.typed = true;
    await raf();
    el._setMode('type');
    const typedInput = el.querySelector('.o-signature-typed-input');
    typedInput.value = 'A. Signer';
    typedInput.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200)); // the typed handler is debounced
    assert('typed mode: produces a non-empty value with no pointer events', !el.isEmpty() && typeof el.value === 'string');
    el.remove();
  }

  const bad = results.filter(r => !r.ok);
  return { ok: bad.length === 0, count: results.length, bad, results };
})();
