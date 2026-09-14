/* ============================================================================
 * Pure-JS QR Code decoder (ISO/IEC 18004), used when BarcodeDetector is not
 * available/doesn't support "qr_code". Pipeline: grayscale -> local-mean
 * adaptive binarization -> finder-pattern detection (1:1:3:1:1 runs, row +
 * column cross-check) -> alignment pattern -> perspective homography -> grid
 * sampling -> format/version info (BCH) -> unmask -> de-interleave -> Reed-
 * Solomon (Berlekamp-Massey + Forney) -> segment decode (numeric/alphanumeric/
 * byte UTF-8, minimal ECI passthrough).
 * Small spec tables are duplicated from the qrcode component intentionally
 * (each component folder is self-contained; see ARCHITECTURE.md ยง2).
 * ========================================================================== */

/* ── GF(256) (shared math, self-contained) ───────────────────────────────── */
const SC_GF_EXP = new Uint8Array(512);
const SC_GF_LOG = new Uint8Array(256);
(function initScGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) { SC_GF_EXP[i] = x; SC_GF_LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
  for (let i = 255; i < 512; i++) SC_GF_EXP[i] = SC_GF_EXP[i - 255];
})();
const scGfMul = (a, b) => (a === 0 || b === 0 ? 0 : SC_GF_EXP[SC_GF_LOG[a] + SC_GF_LOG[b]]);
const scGfInv = a => SC_GF_EXP[(255 - SC_GF_LOG[a]) % 255];
function scPolyMul(a, b) {
  const res = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) { if (!a[i]) continue; for (let j = 0; j < b.length; j++) if (b[j]) res[i + j] ^= scGfMul(a[i], b[j]); }
  return res;
}
function scPolyEval(poly, x) { let r = 0, xp = 1; for (let i = 0; i < poly.length; i++) { r ^= scGfMul(poly[i], xp); xp = scGfMul(xp, x); } return r; }

/* ── QR spec tables (duplicated from src/components/qrcode) ──────────────── */
const QR_ECC_TABLE_D = [
  { L: [7,1,19,0,0], M: [10,1,16,0,0], Q: [13,1,13,0,0], H: [17,1,9,0,0] },
  { L: [10,1,34,0,0], M: [16,1,28,0,0], Q: [22,1,22,0,0], H: [28,1,16,0,0] },
  { L: [15,1,55,0,0], M: [26,1,44,0,0], Q: [18,2,17,0,0], H: [22,2,13,0,0] },
  { L: [20,1,80,0,0], M: [18,2,32,0,0], Q: [26,2,24,0,0], H: [16,4,9,0,0] },
  { L: [26,1,108,0,0], M: [24,2,43,0,0], Q: [18,2,15,2,16], H: [22,2,11,2,12] },
  { L: [18,2,68,0,0], M: [16,4,27,0,0], Q: [24,4,19,0,0], H: [28,4,15,0,0] },
  { L: [20,2,78,0,0], M: [18,4,31,0,0], Q: [18,2,14,4,15], H: [26,4,13,1,14] },
  { L: [24,2,97,0,0], M: [22,2,38,2,39], Q: [22,4,18,2,19], H: [26,4,14,2,15] },
  { L: [30,2,116,0,0], M: [22,3,36,2,37], Q: [20,4,16,4,17], H: [24,4,12,4,13] },
  { L: [18,2,68,2,69], M: [26,4,43,1,44], Q: [24,6,19,2,20], H: [28,6,15,2,16] },
  { L: [20,4,81,0,0], M: [30,1,50,4,51], Q: [28,4,22,4,23], H: [24,3,12,8,13] },
  { L: [24,2,92,2,93], M: [22,6,36,2,37], Q: [26,4,20,6,21], H: [28,7,14,4,15] },
  { L: [26,4,107,0,0], M: [22,8,37,1,38], Q: [24,8,20,4,21], H: [22,12,11,4,12] },
  { L: [30,3,115,1,116], M: [24,4,40,5,41], Q: [20,11,16,5,17], H: [24,11,12,5,13] },
  { L: [22,5,87,1,88], M: [24,5,41,5,42], Q: [30,5,24,7,25], H: [24,11,12,7,13] },
  { L: [24,5,98,1,99], M: [28,7,45,3,46], Q: [24,15,19,2,20], H: [30,3,15,13,16] },
  { L: [28,1,107,5,108], M: [28,10,46,1,47], Q: [28,1,22,15,23], H: [28,2,14,17,15] },
  { L: [30,5,120,1,121], M: [26,9,43,4,44], Q: [28,17,22,1,23], H: [28,2,14,19,15] },
  { L: [28,3,113,4,114], M: [26,3,44,11,45], Q: [26,17,21,4,22], H: [26,9,13,16,14] },
  { L: [28,3,107,5,108], M: [26,3,41,13,42], Q: [30,15,24,5,25], H: [28,15,15,10,16] },
  { L: [28,4,116,4,117], M: [26,17,42,0,0], Q: [28,17,22,6,23], H: [30,19,16,6,17] },
  { L: [28,2,111,7,112], M: [28,17,46,0,0], Q: [30,7,24,16,25], H: [24,34,13,0,0] },
  { L: [30,4,121,5,122], M: [28,4,47,14,48], Q: [30,11,24,14,25], H: [30,16,15,14,16] },
  { L: [30,6,117,4,118], M: [28,6,45,14,46], Q: [30,11,24,16,25], H: [30,30,16,2,17] },
  { L: [26,8,106,4,107], M: [28,8,47,13,48], Q: [30,7,24,22,25], H: [30,22,15,13,16] },
  { L: [28,10,114,2,115], M: [28,19,46,4,47], Q: [28,28,22,6,23], H: [30,33,16,4,17] },
  { L: [30,8,122,4,123], M: [28,22,45,3,46], Q: [30,8,23,26,24], H: [30,12,15,28,16] },
  { L: [30,3,117,10,118], M: [28,3,45,23,46], Q: [30,4,24,31,25], H: [30,11,15,31,16] },
  { L: [30,7,116,7,117], M: [28,21,45,7,46], Q: [30,1,23,37,24], H: [30,19,15,26,16] },
  { L: [30,5,115,10,116], M: [28,19,47,10,48], Q: [30,15,24,25,25], H: [30,23,15,25,16] },
  { L: [30,13,115,3,116], M: [28,2,46,29,47], Q: [30,42,24,1,25], H: [30,23,15,28,16] },
  { L: [30,17,115,0,0], M: [28,10,46,23,47], Q: [30,10,24,35,25], H: [30,19,15,35,16] },
  { L: [30,17,115,1,116], M: [28,14,46,21,47], Q: [30,29,24,19,25], H: [30,11,15,46,16] },
  { L: [30,13,115,6,116], M: [28,14,46,23,47], Q: [30,44,24,7,25], H: [30,59,16,1,17] },
  { L: [30,12,121,7,122], M: [28,12,47,26,48], Q: [30,39,24,14,25], H: [30,22,15,41,16] },
  { L: [30,6,121,14,122], M: [28,6,47,34,48], Q: [30,46,24,10,25], H: [30,2,15,64,16] },
  { L: [30,17,122,4,123], M: [28,29,46,14,47], Q: [30,49,24,10,25], H: [30,24,15,46,16] },
  { L: [30,4,122,18,123], M: [28,13,46,32,47], Q: [30,48,24,14,25], H: [30,42,15,32,16] },
  { L: [30,20,117,4,118], M: [28,40,47,7,48], Q: [30,43,24,22,25], H: [30,10,15,67,16] },
  { L: [30,19,118,6,119], M: [28,18,47,31,48], Q: [30,34,24,34,25], H: [30,20,15,61,16] },
];
const QR_ECC_BITS_D_REV = { 0: 'M', 1: 'L', 2: 'H', 3: 'Q' };
const QR_ALIGN_D = [[], [],
  [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38], [6,24,42], [6,26,46], [6,28,50],
  [6,30,54], [6,32,58], [6,34,62], [6,26,46,66], [6,26,48,70], [6,26,50,74], [6,30,54,78],
  [6,30,56,82], [6,30,58,86], [6,34,62,90], [6,28,50,72,94], [6,26,50,74,98], [6,30,54,78,102],
  [6,28,54,80,106], [6,32,58,84,110], [6,30,58,86,114], [6,34,62,90,118], [6,26,50,74,98,122],
  [6,30,54,78,102,126], [6,26,52,78,104,130], [6,30,56,82,108,134], [6,34,60,86,112,138],
  [6,30,58,86,114,142], [6,34,62,90,118,146], [6,30,54,78,102,126,150], [6,24,50,76,102,128,154],
  [6,28,54,80,106,132,158], [6,32,58,84,110,136,162], [6,26,54,82,110,138,166], [6,30,58,86,114,142,170],
];
const QR_ALPHA_D = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const QR_CCBITS_D = { numeric: [10,12,14], alphanumeric: [9,11,13], byte: [8,16,16] };
const qrGroupIdxD = v => (v <= 9 ? 0 : v <= 26 ? 1 : 2);
const qrCharCountBitsD = (mode, version) => QR_CCBITS_D[mode][qrGroupIdxD(version)];
const QR_MASK_FNS_D = [
  (r, c) => (r + c) % 2 === 0, (r, c) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (((r / 2) | 0) + ((c / 3) | 0)) % 2 === 0, (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
  (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0, (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
];
function qrBCH_D(data, dataBits, genBits) {
  const gen = parseInt(genBits, 2), genLen = genBits.length;
  let val = data << (genLen - 1);
  for (let i = dataBits + genLen - 2; i >= genLen - 1; i--) if ((val >> i) & 1) val ^= gen << (i - (genLen - 1));
  return val;
}
function qrFormatCoordsD(size) {
  const c1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
  const out = c1.map((rc, i) => [rc[0], rc[1], i]);
  for (let i = 0; i < 7; i++) out.push([size - 1 - i, 8, i]);
  for (let i = 7; i < 15; i++) out.push([8, size - 15 + i, i]);
  return out;
}
function qrVersionInfoCoordsD(size) {
  const out = [];
  for (let i = 0; i < 18; i++) { const br = (i / 3) | 0, bc = i % 3; out.push([br, size - 11 + bc, i], [size - 11 + bc, br, i]); }
  return out;
}
function qrAlignmentCentersD(version) {
  const pos = QR_ALIGN_D[version], out = [];
  for (const r of pos) for (const c of pos) {
    if ((r === pos[0] && c === pos[0]) || (r === pos[0] && c === pos[pos.length - 1]) || (r === pos[pos.length - 1] && c === pos[0])) continue;
    out.push([r, c]);
  }
  return out;
}
function qrBuildReservedMask(size, version) {
  const reserved = Array.from({ length: size }, () => new Uint8Array(size));
  const markFinder = (r0, c0) => { for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) { const rr = r0 + r, cc = c0 + c; if (rr >= 0 && cc >= 0 && rr < size && cc < size) reserved[rr][cc] = 1; } };
  markFinder(0, 0); markFinder(0, size - 7); markFinder(size - 7, 0);
  for (const [r, c] of qrAlignmentCentersD(version)) for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) reserved[r + dr][c + dc] = 1;
  for (let i = 8; i <= size - 9; i++) { reserved[6][i] = 1; reserved[i][6] = 1; }
  reserved[size - 8][8] = 1;
  for (const [r, c] of qrFormatCoordsD(size)) reserved[r][c] = 1;
  if (version >= 7) for (const [r, c] of qrVersionInfoCoordsD(size)) reserved[r][c] = 1;
  return reserved;
}

/* ── Reed-Solomon decode (syndromes -> Berlekamp-Massey -> Chien -> Forney) ── */
function qrRsSyndromes(bytes, ecLen) {
  const synd = new Array(ecLen).fill(0);
  for (let i = 0; i < ecLen; i++) { let s = 0; for (const b of bytes) s = scGfMul(s, SC_GF_EXP[i]) ^ b; synd[i] = s; }
  return synd;
}
function qrBerlekampMassey(synd) {
  let C = [1], B = [1], L = 0, m = 1, b = 1;
  for (let i = 0; i < synd.length; i++) {
    let delta = synd[i];
    for (let j = 1; j <= L; j++) delta ^= scGfMul(C[j] || 0, synd[i - j]);
    if (delta === 0) { m++; continue; }
    const T = C.slice();
    const coef = scGfMul(delta, scGfInv(b));
    const newLen = Math.max(C.length, B.length + m);
    const newC = new Array(newLen).fill(0);
    for (let j = 0; j < C.length; j++) newC[j] = C[j];
    for (let j = 0; j < B.length; j++) newC[j + m] ^= scGfMul(coef, B[j]);
    C = newC;
    if (2 * L <= i) { L = i + 1 - L; B = T; b = delta; m = 1; } else m++;
  }
  return C;
}
/** Decode one RS block (data+ec bytes in transmission order); returns corrected bytes or null on failure. */
function qrRsDecodeBlock(bytes, ecLen) {
  const n = bytes.length;
  const synd = qrRsSyndromes(bytes, ecLen);
  if (synd.every(s => s === 0)) return bytes.slice();
  const lambda = qrBerlekampMassey(synd);
  let errDeg = lambda.length - 1;
  while (errDeg > 0 && !lambda[errDeg]) errDeg--;
  if (errDeg <= 0 || errDeg > ecLen / 2) return null;
  const errPos = [];
  for (let pos = 0; pos < n; pos++) {
    const exp = (((pos - (n - 1)) % 255) + 255) % 255;
    if (scPolyEval(lambda, SC_GF_EXP[exp]) === 0) errPos.push(pos);
  }
  if (errPos.length !== errDeg) return null;
  const omegaFull = scPolyMul(synd, lambda);
  const omega = omegaFull.slice(0, ecLen);
  const lambdaPrime = [];
  for (let k = 1; k < lambda.length; k += 2) lambdaPrime[k - 1] = lambda[k];
  for (let i = 0; i < lambdaPrime.length; i++) if (lambdaPrime[i] === undefined) lambdaPrime[i] = 0;
  const corrected = bytes.slice();
  for (const pos of errPos) {
    const exp = (((pos - (n - 1)) % 255) + 255) % 255;
    const xInv = SC_GF_EXP[exp];
    const xj = scGfInv(xInv);
    const numer = scPolyEval(omega, xInv);
    const denom = scPolyEval(lambdaPrime, xInv);
    if (denom === 0) return null;
    corrected[pos] ^= scGfMul(xj, scGfMul(numer, scGfInv(denom)));
  }
  const verify = qrRsSyndromes(corrected, ecLen);
  return verify.every(s => s === 0) ? corrected : null;
}

/* ── Image processing: grayscale + adaptive binarization ─────────────────── */
function qrGrayscale(imgData) {
  const { data, width, height } = imgData;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) gray[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  return gray;
}
/**
 * Local-mean adaptive binarization (block-average threshold). Returns Uint8Array, 1 = dark.
 * The threshold is `localAverage - C` (an ADDITIVE margin), not `localAverage * bias`: a multiplicative
 * bias degenerates on any block that is uniformly dark (a very common case — finder-pattern cores, large
 * quiet zones, big modules on a cleanly-rendered/synthetic code) because `avg * bias` collapses to ~0 right
 * along with the pixels themselves, so `gray < avg*bias` is false for genuinely black pixels and the whole
 * block is misread as light. `bias` (0..1) is translated into the margin: lower bias = larger margin = more
 * pixels called dark, which is what the retry loop in qrDecodeImageData() expects when it tries several values.
 */
/** Separable box blur (clamp-to-edge), O(w*h) regardless of radius via a sliding sum. */
function qrBoxBlur(src, w, h, radius) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), win = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0; const row = y * w;
    for (let x = -radius; x <= radius; x++) sum += src[row + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) { tmp[row + x] = sum / win; sum += src[row + clamp(x + radius + 1, 0, w - 1)] - src[row + clamp(x - radius, 0, w - 1)]; }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = sum / win; sum += tmp[clamp(y + radius + 1, 0, h - 1) * w + x] - tmp[clamp(y - radius, 0, h - 1) * w + x]; }
  }
  return out;
}
function qrBinarize(gray, width, height, bias = 0.92) {
  // The averaging window must be comfortably bigger than a module so it always mixes in some light content —
  // a small/disjoint block can sit entirely inside a uniformly dark area (a finder core, a big low-version
  // module, a wide quiet zone), and then NO fixed threshold (additive or multiplicative) can tell "uniformly
  // dark" from "uniformly light" from the block's own average alone. min(w,h)/16 keeps the window a few
  // modules wide for the QR versions/resolutions this decoder targets.
  const radius = Math.max(3, Math.round(Math.min(width, height) / 16));
  const avg = qrBoxBlur(gray, width, height, radius);
  const margin = clamp((1 - bias) * 255, 4, 60);
  const bin = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) bin[i] = gray[i] < avg[i] - margin ? 1 : 0;
  return bin;
}

/* ── Finder / alignment pattern detection ─────────────────────────────────── */
function qrRatioOk(w) {
  const total = w[0] + w[1] + w[2] + w[3] + w[4];
  if (total < 7) return false;
  const unit = total / 7, tol = unit * 0.55;
  return Math.abs(w[0] - unit) < tol && Math.abs(w[1] - unit) < tol && Math.abs(w[2] - 3 * unit) < tol * 1.6 && Math.abs(w[3] - unit) < tol && Math.abs(w[4] - unit) < tol;
}
function qrRunsOf(getPixel, len) {
  const lens = [], colors = [];
  let cur = getPixel(0), curLen = 0;
  for (let i = 0; i < len; i++) { const c = getPixel(i); if (c === cur) curLen++; else { lens.push(curLen); colors.push(cur); cur = c; curLen = 1; } }
  lens.push(curLen); colors.push(cur);
  return { lens, colors };
}
function qrFindWindow(lens, colors, target) {
  // Returns the 5-run dark-started window whose span contains `target` (index along the scan) and passes the ratio check.
  let pos = 0;
  for (let i = 0; i + 5 <= lens.length; i++) {
    if (i === 0) pos = lens[0]; // running total maintained incrementally below
    if (colors[i] !== 1) continue;
    const w = [lens[i], lens[i + 1], lens[i + 2], lens[i + 3], lens[i + 4]];
    let start = 0; for (let k = 0; k < i; k++) start += lens[k];
    const end = start + w[0] + w[1] + w[2] + w[3] + w[4];
    if (target != null && (target < start || target >= end)) continue;
    if (!qrRatioOk(w)) continue;
    const center = start + w[0] + w[1] + w[2] / 2;
    return { center, module: (w[0] + w[1] + w[2] + w[3] + w[4]) / 7, start, end };
  }
  return null;
}
function qrScanRowFinders(bin, width, height) {
  const out = [];
  for (let y = 0; y < height; y++) {
    const { lens, colors } = qrRunsOf(x => bin[y * width + x], width);
    for (let i = 0; i + 5 <= lens.length; i++) {
      if (colors[i] !== 1) continue;
      const w = [lens[i], lens[i + 1], lens[i + 2], lens[i + 3], lens[i + 4]];
      if (!qrRatioOk(w)) continue;
      let start = 0; for (let k = 0; k < i; k++) start += lens[k];
      out.push({ x: start + w[0] + w[1] + w[2] / 2, y, module: (w[0] + w[1] + w[2] + w[3] + w[4]) / 7 });
    }
  }
  return out;
}
function qrRefineCenter(bin, width, height, guess) {
  let x = guess.x, y = guess.y, module = guess.module;
  for (let pass = 0; pass < 3; pass++) {
    const xi = Math.round(x);
    if (xi < 0 || xi >= width) return null;
    const col = qrRunsOf(yy => bin[yy * width + xi], height);
    const vr = qrFindWindow(col.lens, col.colors, y);
    if (!vr) return null;
    y = vr.center; module = (module + vr.module) / 2;
    const yi = Math.round(y);
    if (yi < 0 || yi >= height) return null;
    const row = qrRunsOf(xx => bin[yi * width + xx], width);
    const hr = qrFindWindow(row.lens, row.colors, x);
    if (!hr) return null;
    x = hr.center; module = (module + hr.module) / 2;
  }
  return { x, y, module };
}
function qrClusterCenters(list) {
  const clusters = [];
  for (const p of list) {
    let found = null;
    for (const c of clusters) if (Math.hypot(c.x - p.x, c.y - p.y) < Math.max(c.module, p.module) * 1.5) { found = c; break; }
    if (found) { found.n++; found.sx += p.x; found.sy += p.y; found.sm += p.module; found.x = found.sx / found.n; found.y = found.sy / found.n; found.module = found.sm / found.n; }
    else clusters.push({ x: p.x, y: p.y, module: p.module, n: 1, sx: p.x, sy: p.y, sm: p.module });
  }
  return clusters.filter(c => c.n >= 2);
}
function qrPickTriples(clusters) {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const triples = [];
  for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) for (let k = j + 1; k < clusters.length; k++) {
    const pts = [clusters[i], clusters[j], clusters[k]];
    const dAB = dist(pts[0], pts[1]), dBC = dist(pts[1], pts[2]), dCA = dist(pts[2], pts[0]);
    const hyp = Math.max(dAB, dBC, dCA);
    let tl, p2, p3;
    if (hyp === dAB) { tl = pts[2]; p2 = pts[0]; p3 = pts[1]; }
    else if (hyp === dBC) { tl = pts[0]; p2 = pts[1]; p3 = pts[2]; }
    else { tl = pts[1]; p2 = pts[2]; p3 = pts[0]; }
    const a = dist(tl, p2), b = dist(tl, p3);
    if (!a || !b || !hyp) continue;
    const ratio = Math.max(a, b) / Math.min(a, b);
    const rightness = Math.abs(a * a + b * b - hyp * hyp) / (hyp * hyp);
    const modules = [tl.module, p2.module, p3.module];
    const moduleConsistency = Math.max(...modules) / Math.min(...modules);
    if (ratio > 1.8 || rightness > 0.35 || moduleConsistency > 2) continue;
    const score = rightness * 3 + (ratio - 1) + (moduleConsistency - 1);
    triples.push({ tl, a: p2, b: p3, module: (tl.module + p2.module + p3.module) / 3, score });
  }
  triples.sort((x, y) => x.score - y.score);
  return triples;
}
function qrFindAlignmentNear(bin, width, height, px, py, unit) {
  const win = Math.max(6, Math.round(unit * 3));
  const x0 = Math.max(0, Math.round(px - win)), x1 = Math.min(width, Math.round(px + win));
  const y0 = Math.max(0, Math.round(py - win)), y1 = Math.min(height, Math.round(py + win));
  let best = null, bestD = Infinity;
  for (let y = y0; y < y1; y++) {
    const row = qrRunsOf(x => bin[y * width + x], width);
    for (let i = 0; i + 5 <= row.lens.length; i++) {
      if (row.colors[i] !== 1) continue;
      const w = [row.lens[i], row.lens[i + 1], row.lens[i + 2], row.lens[i + 3], row.lens[i + 4]];
      const total = w[0] + w[1] + w[2] + w[3] + w[4];
      if (total < 5) continue;
      const u = total / 5, tol = u * 0.6;
      if (Math.abs(w[0] - u) > tol || Math.abs(w[1] - u) > tol || Math.abs(w[2] - u) > tol || Math.abs(w[3] - u) > tol || Math.abs(w[4] - u) > tol) continue;
      let start = 0; for (let k = 0; k < i; k++) start += row.lens[k];
      const cx = start + w[0] + w[1] + w[2] / 2;
      const d = Math.hypot(cx - px, y - py);
      if (d < bestD) { bestD = d; best = { x: cx, y }; }
    }
  }
  return best;
}

/* ── Perspective homography ───────────────────────────────────────────────── */
function qrSolveLinear(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const pv = M[col][col];
    if (Math.abs(pv) < 1e-9) return null;
    for (let c = col; c <= n; c++) M[col][c] /= pv;
    for (let r = 0; r < n; r++) { if (r === col) continue; const f = M[r][col]; if (f) for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]; }
  }
  return M.map(row => row[n]);
}
function qrComputeHomography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [X, Y] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
  }
  const h = qrSolveLinear(A, b);
  return h ? [...h, 1] : null;
}
const qrApplyH = (h, x, y) => { const X = h[0] * x + h[1] * y + h[2], Y = h[3] * x + h[4] * y + h[5], W = h[6] * x + h[7] * y + h[8]; return [X / W, Y / W]; };
function qrSampleBit(bin, width, height, px, py) {
  let dark = 0, total = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = Math.round(px + dx * 0.2), y = Math.round(py + dy * 0.2);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    total++; if (bin[y * width + x]) dark++;
  }
  return total && dark * 2 >= total ? 1 : 0;
}
function qrSampleMatrix(bin, width, height, h, size) {
  const modules = Array.from({ length: size }, () => new Uint8Array(size));
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) { const [px, py] = qrApplyH(h, c + 0.5, r + 0.5); modules[r][c] = qrSampleBit(bin, width, height, px, py); }
  return modules;
}

/* ── Format / version info ────────────────────────────────────────────────── */
function qrFormatBitsAt(modules, coordsHalf) { const bits = new Array(15).fill(0); for (const [r, c, i] of coordsHalf) bits[i] = modules[r][c]; return bits; }
function qrTryFormat(bits) {
  const val = bits.reduce((a, b) => (a << 1) | b, 0);
  const unmasked = val ^ parseInt('101010000010010', 2);
  const dataBits = (unmasked >> 10) & 0x1F, rem = unmasked & 0x3FF;
  if (qrBCH_D(dataBits, 5, '10100110111') === rem) return { ecc: QR_ECC_BITS_D_REV[(dataBits >> 3) & 3], mask: dataBits & 7 };
  return null;
}
function qrReadFormatInfo(modules, size) {
  const coords = qrFormatCoordsD(size);
  for (const half of [coords.slice(0, 15), coords.slice(15, 30)]) {
    const bits = qrFormatBitsAt(modules, half);
    let r = qrTryFormat(bits);
    if (r) return r;
    for (let i = 0; i < 15 && !r; i++) { const flipped = bits.slice(); flipped[i] ^= 1; r = qrTryFormat(flipped); }
    if (r) return r;
  }
  return null;
}
function qrReadVersionInfo(modules, size) {
  const coords = qrVersionInfoCoordsD(size);
  for (let off = 0; off < 2; off++) {
    const bits = new Array(18).fill(0);
    for (let k = off; k < coords.length; k += 2) { const [r, c, i] = coords[k]; bits[i] = modules[r][c]; }
    const val = bits.reduce((a, b) => (a << 1) | b, 0);
    const version = val >> 12, rem = val & 0xFFF;
    if (version >= 1 && version <= 40 && qrBCH_D(version, 6, '1111100100101') === rem) return version;
  }
  return null;
}

/* ── Segment decoding ──────────────────────────────────────────────────────── */
function qrReadDataBits(modules, reserved, size) {
  const bits = []; let dir = -1, col = size - 1;
  while (col > 0) {
    if (col === 6) col--;
    for (let i = 0; i < size; i++) {
      const row = dir === -1 ? size - 1 - i : i;
      for (let c = 0; c < 2; c++) { const cc = col - c; if (!reserved[row][cc]) bits.push(modules[row][cc]); }
    }
    col -= 2; dir = -dir;
  }
  return bits;
}
function qrDeinterleave(bytes, ecLen, g1b, g1d, g2b, g2d) {
  const blockLens = [...Array(g1b).fill(g1d), ...Array(g2b).fill(g2d)];
  const nBlocks = blockLens.length, maxData = Math.max(g1d, g2d || 0);
  const dataBlocks = blockLens.map(() => []);
  let idx = 0;
  for (let i = 0; i < maxData; i++) for (let b = 0; b < nBlocks; b++) if (i < blockLens[b]) dataBlocks[b].push(bytes[idx++]);
  const ecBlocks = blockLens.map(() => []);
  for (let i = 0; i < ecLen; i++) for (let b = 0; b < nBlocks; b++) ecBlocks[b].push(bytes[idx++]);
  return { dataBlocks, ecBlocks };
}
function qrDecodeSegments(dataBytes, version) {
  const bits = [];
  for (const b of dataBytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  let pos = 0;
  const readBits = n => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | (bits[pos++] || 0); return v; };
  let out = '';
  while (pos + 4 <= bits.length) {
    const mode = readBits(4);
    if (mode === 0) break;
    if (mode === 7) { // ECI designator: consume it (byte segments decode as UTF-8 regardless)
      const first = readBits(8);
      if ((first & 0x80) !== 0) { if ((first & 0xC0) === 0x80) readBits(8); else readBits(16); }
      continue;
    }
    const modeName = mode === 1 ? 'numeric' : mode === 2 ? 'alphanumeric' : mode === 4 ? 'byte' : null;
    if (!modeName) break;
    const count = readBits(qrCharCountBitsD(modeName, version));
    if (modeName === 'numeric') {
      let remaining = count;
      while (remaining > 0) { const take = Math.min(3, remaining); out += String(readBits(take === 3 ? 10 : take === 2 ? 7 : 4)).padStart(take, '0'); remaining -= take; }
    } else if (modeName === 'alphanumeric') {
      let remaining = count;
      while (remaining > 0) {
        if (remaining >= 2) { const v = readBits(11); out += QR_ALPHA_D[(v / 45) | 0] + QR_ALPHA_D[v % 45]; remaining -= 2; }
        else { out += QR_ALPHA_D[readBits(6)]; remaining -= 1; }
      }
    } else {
      const byteArr = new Uint8Array(count);
      for (let i = 0; i < count; i++) byteArr[i] = readBits(8);
      out += new TextDecoder('utf-8', { fatal: false }).decode(byteArr);
    }
  }
  return out;
}

/** Attempt a full decode given (tl, tr, bl) finder centers and an approximate module size. */
function qrTryDecodeOriented(bin, width, height, tl, tr, bl, moduleGuess) {
  const distTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const distLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const avgDist = (distTop + distLeft) / 2;
  if (!avgDist || !moduleGuess) return null;
  let sizeEst = Math.round(avgDist / moduleGuess) + 7;
  sizeEst = Math.max(21, Math.min(177, sizeEst));
  let version = Math.max(1, Math.min(40, Math.round((sizeEst - 17) / 4)));
  let size = version * 4 + 17;
  const unit = avgDist / (size - 7);

  let brSrc = [size - 3.5, size - 3.5], brDst;
  if (version >= 2) {
    // Predict the alignment pattern's pixel position by mapping its OWN module coordinate through the affine
    // transform implied by the 3 finder centers — not by reusing the tr+bl-tl corner formula, which is only
    // the correct prediction for module (size-3.5, size-3.5) (the version-1 fallback point below). Using the
    // corner's predicted position as the search center for a *different* module coordinate can miss the real
    // alignment pattern by more than a module on off-center versions, and searching finds some other finder-
    // like run instead; fitting the homography through that wrong correspondence then warps the whole grid.
    const alignPos = QR_ALIGN_D[version][QR_ALIGN_D[version].length - 1];
    const frac = (alignPos + 0.5 - 3.5) / (size - 7);
    const predX = tl.x + frac * (tr.x - tl.x) + frac * (bl.x - tl.x);
    const predY = tl.y + frac * (tr.y - tl.y) + frac * (bl.y - tl.y);
    let found = qrFindAlignmentNear(bin, width, height, predX, predY, unit);
    // A match more than ~1.5 modules from the affine prediction is very unlikely to be the real alignment
    // pattern (that much perspective skew is rare, especially next to 3 finder patterns that fit an affine
    // map this well) — it is almost always a finder-like run in the data area. Fitting the homography through
    // it would warp the whole grid, so distrust it and fall back to the (undistorted) affine prediction.
    if (found && Math.hypot(found.x - predX, found.y - predY) > unit * 1.5) found = null;
    brDst = found ? [found.x, found.y] : [predX, predY];
    brSrc = [alignPos + 0.5, alignPos + 0.5];
  } else brDst = [tr.x + bl.x - tl.x, tr.y + bl.y - tl.y];

  const src = [[3.5, 3.5], [size - 3.5, 3.5], [3.5, size - 3.5], brSrc];
  const dst = [[tl.x, tl.y], [tr.x, tr.y], [bl.x, bl.y], brDst];
  const H = qrComputeHomography(src, dst);
  if (!H) return null;
  const modules = qrSampleMatrix(bin, width, height, H, size);

  const fmt = qrReadFormatInfo(modules, size);
  if (!fmt) return null;
  if (version >= 7) {
    const decodedV = qrReadVersionInfo(modules, size);
    if (decodedV && decodedV !== version && decodedV >= 1 && decodedV <= 40) return qrTryDecodeOriented(bin, width, height, tl, tr, bl, avgDist / (decodedV * 4 + 17 - 7));
  }
  const reserved = qrBuildReservedMask(size, version);
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!reserved[r][c] && QR_MASK_FNS_D[fmt.mask](r, c)) modules[r][c] ^= 1;

  const bits = qrReadDataBits(modules, reserved, size);
  const bytes = []; for (let i = 0; i + 8 <= bits.length; i += 8) { let b = 0; for (let k = 0; k < 8; k++) b = (b << 1) | bits[i + k]; bytes.push(b); }
  const [ecLen, g1b, g1d, g2b, g2d] = QR_ECC_TABLE_D[version - 1][fmt.ecc];
  const { dataBlocks, ecBlocks } = qrDeinterleave(bytes, ecLen, g1b, g1d, g2b, g2d);
  const corrected = [];
  for (let i = 0; i < dataBlocks.length; i++) {
    const fixed = qrRsDecodeBlock([...dataBlocks[i], ...ecBlocks[i]], ecLen);
    if (!fixed) return null;
    corrected.push(...fixed.slice(0, dataBlocks[i].length));
  }
  let text;
  try { text = qrDecodeSegments(corrected, version); } catch { return null; }
  return { text, format: 'qr_code', points: [[tl.x, tl.y], [tr.x, tr.y], [dst[3][0], dst[3][1]], [bl.x, bl.y]] };
}

/** Decode every QR code found in a binarized image. Returns an array of { text, format, points }. */
function qrDecodeBinary(bin, width, height) {
  const raw = qrScanRowFinders(bin, width, height);
  const refined = [];
  for (const p of raw) { const r = qrRefineCenter(bin, width, height, p); if (r) refined.push(r); }
  const clusters = qrClusterCenters(refined);
  if (clusters.length < 3) return [];
  const triples = qrPickTriples(clusters).slice(0, 24);
  const results = [], seen = new Set();
  for (const t of triples) {
    for (const [tr, bl] of [[t.a, t.b], [t.b, t.a]]) {
      const res = qrTryDecodeOriented(bin, width, height, t.tl, tr, bl, t.module);
      if (res && !seen.has(res.text)) { seen.add(res.text); results.push(res); break; }
    }
  }
  return results;
}
/** Orion.scanner's QR entry point: decode from an ImageData. */
function qrDecodeImageData(imgData) {
  const gray = qrGrayscale(imgData);
  for (const bias of [0.92, 0.85, 0.97]) {
    const bin = qrBinarize(gray, imgData.width, imgData.height, bias);
    const res = qrDecodeBinary(bin, imgData.width, imgData.height);
    if (res.length) return res;
  }
  return [];
}
