/* ============================================================================
 * Barcode rendering (SVG/canvas/dataURL/blob) and the O.barcode namespace.
 * ========================================================================== */

/** Guard-bar & human-readable digit grouping for the EAN/UPC family (module index based). */
function bcGuardMap(format) {
  if (format === 'ean13') return { guards: [[0,3],[45,5],[92,3]], outsideLeft: 0, groups: [{ mod: 3, digitStart: 1, count: 6 }, { mod: 50, digitStart: 7, count: 6 }] };
  if (format === 'ean8') return { guards: [[0,3],[31,5],[64,3]], groups: [{ mod: 3, digitStart: 0, count: 4 }, { mod: 36, digitStart: 4, count: 4 }] };
  if (format === 'upca') return { guards: [[0,3],[45,5],[92,3]], outsideLeft: 0, outsideRight: 11, groups: [{ mod: 3, digitStart: 1, count: 5 }, { mod: 50, digitStart: 6, count: 5 }] };
  return null;
}

function bcLayout(value, opts) {
  const format = String(opts.format || 'code128').toLowerCase();
  const enc = barcodeEncode(value, format);
  const mw = opts.moduleWidth || 2;
  const height = opts.height || 80;
  const margin = opts.margin != null ? opts.margin : 10;
  const showText = opts.showText !== false;
  const fontSize = opts.fontSize || 14;
  const guard = opts.guardBars !== false ? bcGuardMap(enc.format) : null;
  const guardExtra = guard ? Math.round(height * 0.18) : 0;
  const textH = showText ? fontSize + 10 : 0;
  const barsW = enc.modules.length * mw;
  const sideLabelW = guard && showText ? fontSize * 0.7 : 0;
  const totalW = barsW + margin * 2 + sideLabelW * 2;
  const totalH = height + guardExtra + textH;
  return { enc, mw, height, margin, showText, fontSize, guard, guardExtra, textH, barsW, sideLabelW, totalW, totalH };
}

function bcIsGuard(guard, i) {
  if (!guard) return false;
  for (const [s, len] of guard.guards) if (i >= s && i < s + len) return true;
  return false;
}

/** Orion.barcode.svg(value, opts) -> SVG markup string */
function bcToSVG(value, opts = {}) {
  const L = bcLayout(value, opts);
  const { enc, mw, height, margin, showText, fontSize, guard, guardExtra, totalW, totalH, sideLabelW } = L;
  const color = opts.color || '#000000';
  const bg = opts.background === null || opts.background === 'transparent' ? null : (opts.background || '#ffffff');
  let bars = '', x = 0;
  for (let i = 0; i < enc.modules.length; i++) {
    if (enc.modules[i]) bars += `<rect x="${x}" y="0" width="${mw}" height="${bcIsGuard(guard, i) ? height + guardExtra : height}"/>`;
    x += mw;
  }
  let out = `<svg xmlns="${SVG_NS}" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}" role="img" aria-label="${esc(opts.format || 'barcode')} ${esc(enc.text)}">`;
  if (bg) out += `<rect width="${totalW}" height="${totalH}" fill="${esc(bg)}"/>`;
  out += `<g transform="translate(${margin + sideLabelW},0)" fill="${esc(color)}">${bars}</g>`;
  if (showText) out += bcTextSVG(L, color);
  out += '</svg>';
  return out;
}
function bcTextSVG(L, color) {
  const { enc, mw, margin, height, guardExtra, fontSize, guard, sideLabelW } = L;
  const y = height + guardExtra + fontSize;
  const font = `font-family="var(--o-font-mono, monospace)" font-size="${fontSize}" fill="${esc(color)}"`;
  let out = '';
  if (!guard) {
    const cx = margin + sideLabelW + (enc.modules.length * mw) / 2;
    return `<text x="${cx}" y="${y}" text-anchor="middle" ${font}>${esc(enc.text)}</text>`;
  }
  const digits = enc.text.split('');
  if (guard.outsideLeft != null) out += `<text x="${margin + sideLabelW / 2}" y="${y}" text-anchor="middle" ${font}>${esc(digits[guard.outsideLeft])}</text>`;
  if (guard.outsideRight != null) out += `<text x="${margin + sideLabelW + enc.modules.length * mw + sideLabelW / 2}" y="${y}" text-anchor="middle" ${font}>${esc(digits[guard.outsideRight])}</text>`;
  for (const g of guard.groups) {
    for (let k = 0; k < g.count; k++) {
      const cx = margin + sideLabelW + (g.mod + k * 7 + 3.5) * mw;
      out += `<text x="${cx}" y="${y}" text-anchor="middle" ${font}>${esc(digits[g.digitStart + k])}</text>`;
    }
  }
  return out;
}

/** Draw onto a 2D canvas context at (0,0); returns the layout used (for sizing). */
function bcDrawToContext(ctx, value, opts) {
  const L = bcLayout(value, opts);
  const { enc, mw, height, guard, guardExtra, totalW, totalH, margin, sideLabelW, showText, fontSize } = L;
  const color = opts.color || '#000000';
  const bg = opts.background === null || opts.background === 'transparent' ? null : (opts.background || '#ffffff');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, totalW, totalH); }
  ctx.fillStyle = color;
  let x = margin + sideLabelW;
  for (let i = 0; i < enc.modules.length; i++) {
    if (enc.modules[i]) ctx.fillRect(x, 0, mw, bcIsGuard(guard, i) ? height + guardExtra : height);
    x += mw;
  }
  if (showText) {
    ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const y = height + guardExtra + fontSize;
    if (!guard) ctx.fillText(enc.text, margin + sideLabelW + (enc.modules.length * mw) / 2, y);
    else {
      const digits = enc.text.split('');
      if (guard.outsideLeft != null) ctx.fillText(digits[guard.outsideLeft], margin + sideLabelW / 2, y);
      if (guard.outsideRight != null) ctx.fillText(digits[guard.outsideRight], margin + sideLabelW + enc.modules.length * mw + sideLabelW / 2, y);
      for (const g of guard.groups) for (let k = 0; k < g.count; k++) ctx.fillText(digits[g.digitStart + k], margin + sideLabelW + (g.mod + k * 7 + 3.5) * mw, y);
    }
  }
  return L;
}
/** Orion.barcode.canvas(value, opts) -> HTMLCanvasElement */
function bcToCanvas(value, opts = {}) {
  const canvas = doc.createElement('canvas');
  const probe = bcLayout(value, opts);
  canvas.width = probe.totalW; canvas.height = probe.totalH;
  bcDrawToContext(canvas.getContext('2d'), value, opts);
  return canvas;
}
/** Orion.barcode.toDataURL(value, opts) -> string */
function bcToDataURL(value, opts = {}) { return bcToCanvas(value, opts).toDataURL(opts.mime || 'image/png'); }
/** Orion.barcode.toBlob(value, opts) -> Promise<Blob> */
function bcToBlob(value, opts = {}) { return new Promise(resolve => bcToCanvas(value, opts).toBlob(b => resolve(b), opts.mime || 'image/png')); }

O.barcode = { encode: barcodeEncode, svg: bcToSVG, canvas: bcToCanvas, toDataURL: bcToDataURL, toBlob: bcToBlob };
