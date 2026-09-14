/* ============================================================================
 * core: floating element positioning (tooltips, popovers, dropdowns, pickers)
 *   place(floating, reference, opts)          one-shot
 *   autoPlace(floating, reference, opts)      keeps it attached on scroll/resize -> cleanup()
 * reference: Element | { x, y, width?, height? } (virtual point, e.g. a context menu)
 * placement: top | bottom | left | right | start | end, optionally -start | -end
 *            ("start"/"end" are logical and follow the text direction)
 * ========================================================================== */

function __refRect(ref) {
  if (ref && isFn(ref.getBoundingClientRect)) return ref.getBoundingClientRect();
  if (ref && 'x' in ref) {
    const w = ref.width || 0, hh = ref.height || 0;
    return { left: ref.x, top: ref.y, right: ref.x + w, bottom: ref.y + hh, width: w, height: hh, x: ref.x, y: ref.y };
  }
  return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
}
const __OPP = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/**
 * computePosition(reference, floating, opts) -> { x, y, side, align, maxHeight, maxWidth }
 * opts: placement='bottom-start', offset=6, flip=true, shift=true, padding=8, matchWidth=false|'min'|'exact',
 *       rtl (auto), fallback: ['top', ...]
 */
function computePosition(ref, float, opts = {}) {
  const { offset = 6, flip = true, shift = true, padding = 8 } = opts;
  const rtl = opts.rtl ?? (ref instanceof Element ? isRTL(ref) : isRTL(doc.documentElement));
  const r = __refRect(ref);
  const vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
  let [side, align = 'center'] = String(opts.placement || 'bottom-start').split('-');
  if (side === 'start') side = rtl ? 'right' : 'left';
  if (side === 'end') side = rtl ? 'left' : 'right';
  const fw = float.offsetWidth, fh = float.offsetHeight;

  const coords = (s) => {
    let x, y;
    if (s === 'top' || s === 'bottom') {
      y = s === 'bottom' ? r.bottom + offset : r.top - fh - offset;
      const sx = rtl ? r.right - fw : r.left, ex = rtl ? r.left : r.right - fw;
      x = align === 'start' ? sx : align === 'end' ? ex : r.left + r.width / 2 - fw / 2;
    } else {
      x = s === 'right' ? r.right + offset : r.left - fw - offset;
      y = align === 'start' ? r.top : align === 'end' ? r.bottom - fh : r.top + r.height / 2 - fh / 2;
    }
    return { x, y };
  };
  const space = { bottom: vh - r.bottom - offset - padding, top: r.top - offset - padding, right: vw - r.right - offset - padding, left: r.left - offset - padding };
  const fits = s => (s === 'top' || s === 'bottom' ? fh <= space[s] : fw <= space[s]);

  if (flip && !fits(side)) {
    const cands = [__OPP[side], ...(opts.fallback || [])];
    const better = cands.find(fits);
    if (better) side = better;
    else if (space[__OPP[side]] > space[side]) side = __OPP[side];
  }
  let { x, y } = coords(side);
  if (shift) {
    if (side === 'top' || side === 'bottom') x = clamp(x, padding, Math.max(padding, vw - fw - padding));
    else y = clamp(y, padding, Math.max(padding, vh - fh - padding));
  }
  return { x: Math.round(x), y: Math.round(y), side, align, maxHeight: Math.max(80, space[side === 'left' || side === 'right' ? 'bottom' : side] + (side === 'left' || side === 'right' ? r.height : 0)), maxWidth: vw - padding * 2 };
}

/**
 * place(floating, reference, opts) — positions with `position: fixed`.
 * Extra opts: arrow (Element), size (bool: constrain max-height to available space), matchWidth ('min'|'exact'|true)
 * Sets data-placement="top|bottom|left|right" on the floating element.
 */
function place(float, ref, opts = {}) {
  if (!isBrowser || !float) return null;
  float.style.position = 'fixed';
  float.style.left = '0px'; float.style.top = '0px'; float.style.right = 'auto'; float.style.bottom = 'auto'; float.style.margin = '0';
  if (opts.matchWidth && ref instanceof Element) {
    const w = ref.getBoundingClientRect().width + 'px';
    if (opts.matchWidth === 'exact') float.style.width = w; else float.style.minWidth = w;
  }
  if (opts.size) float.style.maxHeight = '';
  const pos = computePosition(ref, float, opts);
  if (opts.size) {
    const avail = pos.side === 'top' ? __refRect(ref).top - (opts.offset ?? 6) - (opts.padding ?? 8) : doc.documentElement.clientHeight - __refRect(ref).bottom - (opts.offset ?? 6) - (opts.padding ?? 8);
    if (float.offsetHeight > avail && (pos.side === 'top' || pos.side === 'bottom')) {
      float.style.maxHeight = Math.max(120, avail) + 'px';
      const p2 = computePosition(ref, float, { ...opts, flip: false, placement: pos.side + (pos.align === 'center' ? '' : '-' + pos.align) });
      pos.x = p2.x; pos.y = p2.y;
    }
  }
  float.style.left = pos.x + 'px';
  float.style.top = pos.y + 'px';
  float.setAttribute('data-placement', pos.side);
  if (opts.arrow) {
    const r = __refRect(ref), a = opts.arrow, as = a.offsetWidth || 10;
    a.style.left = a.style.top = a.style.right = a.style.bottom = '';
    if (pos.side === 'top' || pos.side === 'bottom') a.style.left = clamp(r.left + r.width / 2 - pos.x - as / 2, 6, float.offsetWidth - as - 6) + 'px';
    else a.style.top = clamp(r.top + r.height / 2 - pos.y - as / 2, 6, float.offsetHeight - as - 6) + 'px';
  }
  return pos;
}

/**
 * autoPlace(floating, reference, opts) -> cleanup()
 * Re-positions on scroll (any ancestor), resize and size changes. opts.onHidden: called when the
 * reference scrolls out of view (e.g. close the popup).
 */
function autoPlace(float, ref, opts = {}) {
  if (!isBrowser) return noop;
  const update = rafThrottle(() => {
    if (!float.isConnected || (ref instanceof Element && !ref.isConnected)) return;
    if (opts.onHidden && ref instanceof Element) {
      const r = ref.getBoundingClientRect();
      if (r.bottom < 0 || r.top > doc.documentElement.clientHeight || (r.width === 0 && r.height === 0)) { opts.onHidden(); return; }
    }
    place(float, ref, opts);
  });
  place(float, ref, opts);
  const offs = [
    on(win, 'scroll', update, { capture: true, passive: true }),
    on(win, 'resize', update),
    observeResize(float, update),
  ];
  if (ref instanceof Element) offs.push(observeResize(ref, update));
  return () => { update.cancel(); offs.forEach(f => f()); };
}
O.position = { compute: computePosition, place, autoPlace };
