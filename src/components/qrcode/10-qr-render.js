/* ============================================================================
 * QR rendering (SVG/canvas/dataURL/blob), payload presets and the O.qr namespace.
 * ========================================================================== */

/** Resolve a string or a pre-encoded { modules } result into an encode() result. */
function qrResolve(input, opts) {
  if (input && typeof input === 'object' && Array.isArray(input.modules)) return input;
  const encOpts = { ecc: opts.ecc, version: opts.version, mode: opts.mode, mask: opts.mask };
  if (opts.logo) encOpts.ecc = 'H';
  return qrEncode(input, encOpts);
}
function qrFinderBoxes(size) {
  return [[0, 0], [0, size - 7], [size - 7, 0]];
}
function qrInFinder(r, c, size) {
  for (const [r0, c0] of qrFinderBoxes(size)) if (r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7) return true;
  return false;
}

/** Build SVG path/shape markup for the module grid. Returns { modulesMarkup, eyesMarkup }. */
function qrBuildShapes(modules, size, opts) {
  const style = opts.moduleStyle || 'square';
  const finderStyle = opts.finderStyle && opts.finderStyle !== 'square' ? opts.finderStyle : null;
  let squarePath = '';
  const extra = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!modules[r][c]) continue;
      if (finderStyle && qrInFinder(r, c, size)) continue;
      if (style === 'dots') {
        const cx = c + 0.5, cy = r + 0.5, rad = 0.42;
        extra.push(`M${cx - rad} ${cy}a${rad} ${rad} 0 1 0 ${rad * 2} 0a${rad} ${rad} 0 1 0 ${-rad * 2} 0`);
      } else if (style === 'rounded') {
        const rad = 0.28;
        extra.push(qrRoundedRectPath(c, r, 1, 1, rad));
      } else {
        squarePath += `M${c} ${r}h1v1h-1z`;
      }
    }
  }
  let eyes = '';
  if (finderStyle) {
    for (const [r0, c0] of qrFinderBoxes(size)) eyes += qrFinderEye(r0, c0, finderStyle);
  }
  const dotsPath = style !== 'square' ? extra.join('') : '';
  return { squarePath, dotsPath, eyes };
}
function qrRoundedRectPath(x, y, w, h, r) {
  return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
}
function qrFinderEye(r0, c0, kind) {
  // Outer 7x7 ring, inner 3x3 core; "dot" -> circles, "rounded" -> rounded squares.
  if (kind === 'dot') {
    const ocx = c0 + 3.5, ocy = r0 + 3.5;
    return (
      `<circle cx="${ocx}" cy="${ocy}" r="3.5" fill="currentColor"/>` +
      `<circle cx="${ocx}" cy="${ocy}" r="2.5" fill="var(--o-qr-bg,#fff)"/>` +
      `<circle cx="${ocx}" cy="${ocy}" r="1.5" fill="currentColor"/>`
    );
  }
  return (
    `<path d="${qrRoundedRectPath(c0, r0, 7, 7, 1.6)}" fill="currentColor"/>` +
    `<path d="${qrRoundedRectPath(c0 + 1, r0 + 1, 5, 5, 1.1)}" fill="var(--o-qr-bg,#fff)"/>` +
    `<path d="${qrRoundedRectPath(c0 + 2, r0 + 2, 3, 3, 0.7)}" fill="currentColor"/>`
  );
}

/** Orion.qr.svg(textOrMatrix, opts) -> SVG markup string. */
function qrToSVG(input, opts = {}) {
  const q = qrResolve(input, opts);
  const { modules, size } = q;
  const margin = opts.margin != null ? +opts.margin : 4;
  const px = opts.size || 256;
  const dim = size + margin * 2;
  const color = opts.color || '#000000';
  const bg = opts.background === null || opts.background === 'transparent' ? null : (opts.background || '#ffffff');
  const shapes = qrBuildShapes(modules, size, opts);
  let out = `<svg xmlns="${SVG_NS}" viewBox="0 0 ${dim} ${dim}" width="${px}" height="${px}" style="--o-qr-bg:${esc(bg || '#fff')}">`;
  if (bg) out += `<rect width="${dim}" height="${dim}" fill="${esc(bg)}"/>`;
  out += `<g transform="translate(${margin},${margin})" fill="${esc(color)}" color="${esc(color)}">`;
  if (shapes.squarePath) out += `<path d="${shapes.squarePath}"/>`;
  if (shapes.dotsPath) out += `<path d="${shapes.dotsPath}"/>`;
  if (shapes.eyes) out += shapes.eyes;
  out += '</g>';
  if (opts.logo && opts.logo.src) out += qrLogoMarkup(opts.logo, dim);
  out += '</svg>';
  return out;
}
function qrLogoMarkup(logo, dim) {
  const frac = clamp(logo.size || 0.22, 0.1, 0.35);
  const w = dim * frac;
  const pad = logo.padding != null ? logo.padding : w * 0.16;
  const x = (dim - w) / 2, y = (dim - w) / 2;
  const round = logo.round ? (w + pad * 2) / 2 : (w + pad * 2) * 0.12;
  let out = `<rect x="${x - pad}" y="${y - pad}" width="${w + pad * 2}" height="${w + pad * 2}" rx="${round}" fill="#fff"/>`;
  out += `<image href="${esc(logo.src)}" x="${x}" y="${y}" width="${w}" height="${w}" preserveAspectRatio="xMidYMid slice" ${logo.round ? `clip-path="circle(${w / 2}px at ${x + w / 2}px ${y + w / 2}px)"` : ''}/>`;
  return out;
}

/** Draw the code onto a 2D canvas context at (0,0) sized to `px`. */
function qrDrawToContext(ctx, input, opts, px) {
  const q = qrResolve(input, opts);
  const { modules, size } = q;
  const margin = opts.margin != null ? +opts.margin : 4;
  const dim = size + margin * 2;
  const unit = px / dim;
  const color = opts.color || '#000000';
  const bg = opts.background === null || opts.background === 'transparent' ? null : (opts.background || '#ffffff');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, px, px); }
  ctx.fillStyle = color;
  const style = opts.moduleStyle || 'square';
  const finderStyle = opts.finderStyle && opts.finderStyle !== 'square' ? opts.finderStyle : null;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!modules[r][c]) continue;
      if (finderStyle && qrInFinder(r, c, size)) continue;
      const x = (margin + c) * unit, y = (margin + r) * unit;
      if (style === 'dots') {
        ctx.beginPath(); ctx.arc(x + unit / 2, y + unit / 2, unit * 0.42, 0, Math.PI * 2); ctx.fill();
      } else if (style === 'rounded') {
        qrRoundRectCtx(ctx, x, y, unit, unit, unit * 0.28); ctx.fill();
      } else ctx.fillRect(x, y, unit, unit);
    }
  }
  if (finderStyle) {
    for (const [r0, c0] of qrFinderBoxes(size)) qrDrawEyeCtx(ctx, (margin + c0) * unit, (margin + r0) * unit, unit, finderStyle, color, bg || '#fff');
  }
  return q;
}
function qrRoundRectCtx(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function qrDrawEyeCtx(ctx, x, y, unit, kind, color, bg) {
  const cx = x + unit * 3.5, cy = y + unit * 3.5;
  if (kind === 'dot') {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, unit * 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, unit * 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, unit * 1.5, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = color; qrRoundRectCtx(ctx, x, y, unit * 7, unit * 7, unit * 1.6); ctx.fill();
    ctx.fillStyle = bg; qrRoundRectCtx(ctx, x + unit, y + unit, unit * 5, unit * 5, unit * 1.1); ctx.fill();
    ctx.fillStyle = color; qrRoundRectCtx(ctx, x + unit * 2, y + unit * 2, unit * 3, unit * 3, unit * 0.7); ctx.fill();
  }
  ctx.fillStyle = color;
}
function qrLoadImage(src) {
  return new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => reject(new Error('Orion.qr: failed to load logo image')); img.src = src; });
}
function qrDrawLogoOnCanvas(ctx, img, px, opts) {
  const logo = opts.logo, frac = clamp(logo.size || 0.22, 0.1, 0.35);
  const w = px * frac, pad = logo.padding != null ? logo.padding * (px / (opts.size || 256)) : w * 0.16;
  const x = (px - w) / 2, y = (px - w) / 2;
  ctx.save();
  ctx.fillStyle = '#fff';
  if (logo.round) { ctx.beginPath(); ctx.arc(px / 2, px / 2, w / 2 + pad, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(px / 2, px / 2, w / 2, 0, Math.PI * 2); ctx.clip(); }
  else { qrRoundRectCtx(ctx, x - pad, y - pad, w + pad * 2, w + pad * 2, (w + pad * 2) * 0.12); ctx.fill(); }
  ctx.drawImage(img, x, y, w, w);
  ctx.restore();
}

/** Orion.qr.canvas(textOrMatrix, opts) -> HTMLCanvasElement (sync; logo image is drawn in once loaded). */
function qrToCanvas(input, opts = {}) {
  const px = opts.size || 256;
  const canvas = doc.createElement('canvas');
  canvas.width = px; canvas.height = px;
  const ctx = canvas.getContext('2d');
  qrDrawToContext(ctx, input, opts, px);
  if (opts.logo && opts.logo.src) qrLoadImage(opts.logo.src).then(img => qrDrawLogoOnCanvas(ctx, img, px, opts)).catch(noop);
  return canvas;
}
/** Orion.qr.toDataURL(textOrMatrix, opts) -> Promise<string> */
async function qrToDataURL(input, opts = {}) {
  const px = opts.size || 256;
  const canvas = doc.createElement('canvas');
  canvas.width = px; canvas.height = px;
  const ctx = canvas.getContext('2d');
  qrDrawToContext(ctx, input, opts, px);
  if (opts.logo && opts.logo.src) qrDrawLogoOnCanvas(ctx, await qrLoadImage(opts.logo.src), px, opts);
  return canvas.toDataURL(opts.mime || 'image/png');
}
/** Orion.qr.toBlob(textOrMatrix, opts) -> Promise<Blob> */
async function qrToBlob(input, opts = {}) {
  const px = opts.size || 256;
  const canvas = doc.createElement('canvas');
  canvas.width = px; canvas.height = px;
  const ctx = canvas.getContext('2d');
  qrDrawToContext(ctx, input, opts, px);
  if (opts.logo && opts.logo.src) qrDrawLogoOnCanvas(ctx, await qrLoadImage(opts.logo.src), px, opts);
  return new Promise(resolve => canvas.toBlob(b => resolve(b), opts.mime || 'image/png'));
}

/* ── Payload presets ──────────────────────────────────────────────────────── */
const qrWifiEscape = s => String(s ?? '').replace(/([\\;,:"])/g, '\\$1');
function qrWifi({ ssid, password = '', encryption = 'WPA', hidden = false } = {}) {
  if (!ssid) throw new Error('Orion.qr.wifi: ssid is required');
  const enc = String(encryption).toUpperCase() === 'NONE' ? 'nopass' : String(encryption).toUpperCase();
  return `WIFI:T:${enc};S:${qrWifiEscape(ssid)};${enc === 'nopass' ? '' : `P:${qrWifiEscape(password)};`}${hidden ? 'H:true;' : ''};`;
}
function qrVCard({ name, firstName = '', lastName = '', org, title, phone, email, url, address, note } = {}) {
  const fullName = name || [firstName, lastName].filter(Boolean).join(' ');
  let out = 'BEGIN:VCARD\nVERSION:3.0\n';
  out += `N:${lastName};${firstName};;;\n`;
  if (fullName) out += `FN:${fullName}\n`;
  if (org) out += `ORG:${org}\n`;
  if (title) out += `TITLE:${title}\n`;
  if (phone) out += `TEL:${phone}\n`;
  if (email) out += `EMAIL:${email}\n`;
  if (url) out += `URL:${url}\n`;
  if (address) out += `ADR:;;${address};;;;\n`;
  if (note) out += `NOTE:${note}\n`;
  out += 'END:VCARD';
  return out;
}
const qrEmail = ({ to = '', subject = '', body = '' } = {}) => `mailto:${to}${subject || body ? '?' : ''}${[subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean).join('&')}`;
const qrSms = ({ to = '', body = '' } = {}) => `SMSTO:${to}:${body}`;
const qrGeo = ({ lat, lng, query } = {}) => (query ? `geo:0,0?q=${encodeURIComponent(query)}` : `geo:${lat},${lng}`);
const qrUrl = u => (/^[a-z][a-z0-9+.-]*:/i.test(String(u)) ? String(u) : `https://${u}`);

O.qr = {
  encode: qrEncode, svg: qrToSVG, canvas: qrToCanvas, toDataURL: qrToDataURL, toBlob: qrToBlob,
  wifi: qrWifi, vcard: qrVCard, email: qrEmail, sms: qrSms, geo: qrGeo, url: qrUrl,
};
