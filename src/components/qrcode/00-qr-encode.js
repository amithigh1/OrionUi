/* ============================================================================
 * QR Code encoder — implements ISO/IEC 18004 from the specification:
 *   GF(256) Reed-Solomon error correction, numeric/alphanumeric/byte(UTF-8) modes
 *   with run-based segment optimisation, BCH(15,5) format info, BCH(18,6) version
 *   info, all 8 data masks with the 4 penalty rules, versions 1-40, ECC L/M/Q/H.
 * This file only builds the abstract module matrix ({ size, modules, version,
 * ecc, mask }); rendering (SVG/canvas) lives in 10-qr-render.js.
 * ========================================================================== */

/* ── GF(256) arithmetic (primitive polynomial x^8+x^4+x^3+x^2+1 = 0x11D) ── */
const QR_GF_EXP = new Uint8Array(512);
const QR_GF_LOG = new Uint8Array(256);
(function initQrGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    QR_GF_EXP[i] = x;
    QR_GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;
  }
  for (let i = 255; i < 512; i++) QR_GF_EXP[i] = QR_GF_EXP[i - 255];
})();
const qrGfMul = (a, b) => (a === 0 || b === 0 ? 0 : QR_GF_EXP[QR_GF_LOG[a] + QR_GF_LOG[b]]);

/** Multiply two polynomials (ascending coefficient order, i.e. index i = coeff of x^i) over GF(256). */
function qrPolyMul(a, b) {
  const res = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    if (!a[i]) continue;
    for (let j = 0; j < b.length; j++) { if (b[j]) res[i + j] ^= qrGfMul(a[i], b[j]); }
  }
  return res;
}
/** Reed-Solomon generator polynomial of given degree (ascending order, monic at x^degree). */
function qrRsGenPoly(degree) {
  let g = [1];
  for (let i = 0; i < degree; i++) g = qrPolyMul(g, [QR_GF_EXP[i], 1]);
  return g;
}
const __qrGenCache = new Map();
/** Systematic Reed-Solomon encode: returns `ecLen` error-correction codewords for `data` (bytes). */
function qrRsComputeEC(data, ecLen) {
  let gen = __qrGenCache.get(ecLen);
  if (!gen) { gen = qrRsGenPoly(ecLen); __qrGenCache.set(ecLen, gen); }
  // genDesc[k] = coefficient of x^(ecLen-k) for k=0..ecLen (genDesc[0] is the monic leading term, unused in the XOR)
  const genDesc = new Array(ecLen + 1);
  for (let k = 0; k <= ecLen; k++) genDesc[k] = gen[ecLen - k];
  const reg = new Array(ecLen).fill(0);
  for (const b of data) {
    const factor = b ^ reg[0];
    for (let i = 0; i < ecLen - 1; i++) reg[i] = reg[i + 1];
    reg[ecLen - 1] = 0;
    if (factor !== 0) for (let i = 0; i < ecLen; i++) reg[i] ^= qrGfMul(genDesc[i + 1], factor);
  }
  return reg;
}

/* ── Spec tables (ISO/IEC 18004) ─────────────────────────────────────────
 * QR_ECC_TABLE[version-1][L|M|Q|H] = [ecCodewordsPerBlock, g1Blocks, g1DataLen, g2Blocks, g2DataLen] */
const QR_ECC_TABLE = [
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
const QR_ECC_BITS = { L: 1, M: 0, Q: 3, H: 2 };
/** Alignment pattern center coordinates per version (index by version, 1 and index0 unused/empty). */
const QR_ALIGN = [[], [],
  [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38], [6,24,42], [6,26,46], [6,28,50],
  [6,30,54], [6,32,58], [6,34,62], [6,26,46,66], [6,26,48,70], [6,26,50,74], [6,30,54,78],
  [6,30,56,82], [6,30,58,86], [6,34,62,90], [6,28,50,72,94], [6,26,50,74,98], [6,30,54,78,102],
  [6,28,54,80,106], [6,32,58,84,110], [6,30,58,86,114], [6,34,62,90,118], [6,26,50,74,98,122],
  [6,30,54,78,102,126], [6,26,52,78,104,130], [6,30,56,82,108,134], [6,34,60,86,112,138],
  [6,30,58,86,114,142], [6,34,62,90,118,146], [6,30,54,78,102,126,150], [6,24,50,76,102,128,154],
  [6,28,54,80,106,132,158], [6,32,58,84,110,136,162], [6,26,54,82,110,138,166], [6,30,58,86,114,142,170],
];
/** Remainder bits appended after all codewords, per version (index by version-1). */
const QR_REMAINDER = [0,7,7,7,7,7,0,0,0,0,0,0,0,3,3,3,3,3,3,3,4,4,4,4,4,4,4,3,3,3,3,3,3,3,0,0,0,0,0,0];

/* ── Modes, character sets & segmentation ────────────────────────────────── */
const QR_ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const QR_ALPHA_IDX = new Map(Array.from(QR_ALPHA, (c, i) => [c, i]));
const QR_MODE_BITS = { numeric: 1, alphanumeric: 2, byte: 4 };
const QR_CCBITS = { numeric: [10,12,14], alphanumeric: [9,11,13], byte: [8,16,16] };
const qrGroupIdx = v => (v <= 9 ? 0 : v <= 26 ? 1 : 2);
const qrCharCountBits = (mode, version) => QR_CCBITS[mode][qrGroupIdx(version)];
const qrUtf8Bytes = s => Array.from(new TextEncoder().encode(s));
const qrClassify = ch => (ch >= '0' && ch <= '9' ? 'N' : QR_ALPHA_IDX.has(ch) ? 'A' : 'B');
function qrDataBits(mode, len) {
  if (mode === 'numeric') { const r = len % 3; return ((len / 3) | 0) * 10 + (r === 0 ? 0 : r === 1 ? 4 : 7); }
  if (mode === 'alphanumeric') return ((len / 2) | 0) * 11 + (len % 2 ? 6 : 0);
  return len * 8;
}
function qrBuildRuns(text) {
  const runs = [];
  for (const ch of text) {
    const c = qrClassify(ch);
    const last = runs[runs.length - 1];
    if (last && last.cls === c) last.text += ch; else runs.push({ cls: c, text: ch });
  }
  return runs;
}
/** Plan encoding segments for `text` at `version`'s char-count-bit group, optionally forcing one mode. */
function qrPlanSegments(text, version, forcedMode) {
  if (forcedMode) {
    if (forcedMode === 'numeric' && !/^[0-9]*$/.test(text)) throw new Error('Orion.qr.encode: mode "numeric" requires digits only');
    if (forcedMode === 'alphanumeric') for (const ch of text) if (!QR_ALPHA_IDX.has(ch)) throw new Error(`Orion.qr.encode: mode "alphanumeric" cannot encode "${ch}"`);
    const len = forcedMode === 'byte' ? qrUtf8Bytes(text).length : text.length;
    return [{ mode: forcedMode, text, len }];
  }
  const runs = qrBuildRuns(text);
  const n = runs.length;
  if (!n) return [];
  const dp = new Array(n + 1).fill(null);
  dp[0] = { bits: 0, prev: -1, mode: null, text: '' };
  for (let i = 0; i < n; i++) {
    if (!dp[i]) continue;
    let hasB = false, hasA = false, acc = '';
    for (let j = i; j < n; j++) {
      hasB = hasB || runs[j].cls === 'B';
      hasA = hasA || runs[j].cls === 'A';
      acc += runs[j].text;
      const modes = hasB ? ['byte'] : hasA ? ['alphanumeric', 'byte'] : ['numeric', 'alphanumeric', 'byte'];
      for (const mode of modes) {
        const len = mode === 'byte' ? qrUtf8Bytes(acc).length : acc.length;
        const total = dp[i].bits + 4 + qrCharCountBits(mode, version) + qrDataBits(mode, len);
        if (!dp[j + 1] || total < dp[j + 1].bits) dp[j + 1] = { bits: total, prev: i, mode, text: acc };
      }
    }
  }
  const segs = [];
  for (let k = n; k > 0; k = dp[k].prev) {
    const node = dp[k];
    segs.unshift({ mode: node.mode, text: node.text, len: node.mode === 'byte' ? qrUtf8Bytes(node.text).length : node.text.length });
  }
  return segs;
}
function qrSegmentTotalBits(segs, version) {
  return segs.reduce((s, seg) => s + 4 + qrCharCountBits(seg.mode, version) + qrDataBits(seg.mode, seg.len), 0);
}
function qrDataCapacityBits(version, ecc) {
  const row = QR_ECC_TABLE[version - 1][ecc];
  return (row[1] * row[2] + row[3] * row[4]) * 8;
}

/* ── Bit writer ───────────────────────────────────────────────────────────── */
class QRBitWriter {
  constructor() { this.bits = []; }
  get length() { return this.bits.length; }
  push(value, len) { for (let i = len - 1; i >= 0; i--) this.bits.push((value >>> i) & 1); }
  toBytes() {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8));
    for (let i = 0; i < this.bits.length; i++) if (this.bits[i]) out[i >> 3] |= 0x80 >> (i & 7);
    return out;
  }
}
function qrWriteSegment(bw, seg, version) {
  bw.push(QR_MODE_BITS[seg.mode], 4);
  bw.push(seg.len, qrCharCountBits(seg.mode, version));
  if (seg.mode === 'numeric') {
    for (let i = 0; i < seg.text.length; i += 3) {
      const chunk = seg.text.slice(i, i + 3);
      bw.push(parseInt(chunk, 10), chunk.length === 3 ? 10 : chunk.length === 2 ? 7 : 4);
    }
  } else if (seg.mode === 'alphanumeric') {
    for (let i = 0; i < seg.text.length; i += 2) {
      if (i + 1 < seg.text.length) bw.push(QR_ALPHA_IDX.get(seg.text[i]) * 45 + QR_ALPHA_IDX.get(seg.text[i + 1]), 11);
      else bw.push(QR_ALPHA_IDX.get(seg.text[i]), 6);
    }
  } else {
    for (const byte of qrUtf8Bytes(seg.text)) bw.push(byte, 8);
  }
}

/* ── BCH error correction for format/version info ────────────────────────── */
function qrBCH(data, dataBits, genBits) {
  const gen = parseInt(genBits, 2), genLen = genBits.length;
  let val = data << (genLen - 1);
  for (let i = dataBits + genLen - 2; i >= genLen - 1; i--) if ((val >> i) & 1) val ^= gen << (i - (genLen - 1));
  return val;
}
const qrBitsMSBFirst = (value, n) => { const out = []; for (let i = n - 1; i >= 0; i--) out.push((value >> i) & 1); return out; };

/* ── Matrix construction ──────────────────────────────────────────────────── */
const qrMatrixSize = version => version * 4 + 17;
function qrPlaceFinder(mat, reserved, r0, c0, size) {
  for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
    const rr = r0 + r, cc = c0 + c;
    if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
    let v = 0;
    if (r >= 0 && r <= 6 && c >= 0 && c <= 6) v = Math.max(Math.abs(r - 3), Math.abs(c - 3)) === 2 ? 0 : 1;
    mat[rr][cc] = v; reserved[rr][cc] = 1;
  }
}
function qrPlaceAlignment(mat, reserved, rc, cc0, size) {
  for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
    const r = rc + dr, c = cc0 + dc;
    mat[r][c] = Math.max(Math.abs(dr), Math.abs(dc)) === 1 ? 0 : 1;
    reserved[r][c] = 1;
  }
}
function qrAlignmentCenters(version) {
  const pos = QR_ALIGN[version], out = [];
  for (const r of pos) for (const c of pos) {
    if ((r === pos[0] && c === pos[0]) || (r === pos[0] && c === pos[pos.length - 1]) || (r === pos[pos.length - 1] && c === pos[0])) continue;
    out.push([r, c]);
  }
  return out;
}
/** The 15 format-info bit coordinates (both copies), MSB-first order matching the 15-bit format string. */
function qrFormatCoords(size) {
  const c1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
  const out = c1.map((rc, i) => [rc[0], rc[1], i]);
  for (let i = 0; i < 7; i++) out.push([size - 1 - i, 8, i]);
  for (let i = 7; i < 15; i++) out.push([8, size - 15 + i, i]);
  return out;
}
function qrVersionInfoCoords(size) {
  const out = [];
  for (let i = 0; i < 18; i++) {
    const br = (i / 3) | 0, bc = i % 3;
    out.push([br, size - 11 + bc, i], [size - 11 + bc, br, i]);
  }
  return out;
}
function qrPlaceData(mat, reserved, size, bits) {
  let idx = 0, dir = -1, col = size - 1;
  while (col > 0) {
    if (col === 6) col--;
    for (let i = 0; i < size; i++) {
      const row = dir === -1 ? size - 1 - i : i;
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (reserved[row][cc]) continue;
        mat[row][cc] = idx < bits.length ? bits[idx] : 0;
        idx++;
      }
    }
    col -= 2; dir = -dir;
  }
}
const QR_MASK_FNS = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (((r / 2) | 0) + ((c / 3) | 0)) % 2 === 0,
  (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
  (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
  (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
];
function qrApplyMask(mat, reserved, size, maskId) {
  const fn = QR_MASK_FNS[maskId];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!reserved[r][c] && fn(r, c)) mat[r][c] ^= 1;
}
const QR_FINDER_LIKE_A = [1,0,1,1,1,0,1,0,0,0,0];
const QR_FINDER_LIKE_B = [0,0,0,0,1,0,1,1,1,0,1];
function qrPenalty(mat, size) {
  let penalty = 0;
  for (let r = 0; r < size; r++) { let run = 1; for (let c = 1; c <= size; c++) { if (c < size && mat[r][c] === mat[r][c - 1]) run++; else { if (run >= 5) penalty += 3 + (run - 5); run = 1; } } }
  for (let c = 0; c < size; c++) { let run = 1; for (let r = 1; r <= size; r++) { if (r < size && mat[r][c] === mat[r - 1][c]) run++; else { if (run >= 5) penalty += 3 + (run - 5); run = 1; } } }
  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) { const v = mat[r][c]; if (v === mat[r][c + 1] && v === mat[r + 1][c] && v === mat[r + 1][c + 1]) penalty += 3; }
  for (let r = 0; r < size; r++) for (let c = 0; c <= size - 11; c++) {
    let m1 = true, m2 = true;
    for (let k = 0; k < 11; k++) { if (mat[r][c + k] !== QR_FINDER_LIKE_A[k]) m1 = false; if (mat[r][c + k] !== QR_FINDER_LIKE_B[k]) m2 = false; }
    if (m1) penalty += 40; if (m2) penalty += 40;
  }
  for (let c = 0; c < size; c++) for (let r = 0; r <= size - 11; r++) {
    let m1 = true, m2 = true;
    for (let k = 0; k < 11; k++) { if (mat[r + k][c] !== QR_FINDER_LIKE_A[k]) m1 = false; if (mat[r + k][c] !== QR_FINDER_LIKE_B[k]) m2 = false; }
    if (m1) penalty += 40; if (m2) penalty += 40;
  }
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (mat[r][c]) dark++;
  const percent = (dark * 100) / (size * size);
  const prev = Math.floor(percent / 5) * 5;
  penalty += (Math.min(Math.abs(prev - 50), Math.abs(prev + 5 - 50)) / 5) * 10;
  return penalty;
}

/**
 * Orion.qr.encode(text, { ecc:'L'|'M'|'Q'|'H', version:'auto'|1-40, mode:'auto'|'numeric'|'alphanumeric'|'byte', mask:'auto'|0-7 })
 * -> { size, modules: boolean[][], version, ecc, mask }
 */
function qrEncode(text, opts = {}) {
  text = text == null ? '' : String(text);
  if (!text) throw new Error('Orion.qr.encode: text must not be empty');
  const ecc = String(opts.ecc || 'M').toUpperCase();
  if (!QR_ECC_BITS.hasOwnProperty(ecc)) throw new Error(`Orion.qr.encode: invalid ecc "${opts.ecc}" (use L, M, Q or H)`);
  const forcedMode = opts.mode && opts.mode !== 'auto' ? String(opts.mode).toLowerCase() : null;
  if (forcedMode && !QR_MODE_BITS[forcedMode]) throw new Error(`Orion.qr.encode: invalid mode "${opts.mode}" (use numeric, alphanumeric or byte)`);

  let version = null, segments = null;
  if (opts.version != null && opts.version !== 'auto') {
    version = +opts.version;
    if (!(version >= 1 && version <= 40)) throw new Error('Orion.qr.encode: version must be between 1 and 40');
    segments = qrPlanSegments(text, version, forcedMode);
  } else {
    for (const g of [1, 10, 27]) {
      const segs = qrPlanSegments(text, g, forcedMode);
      const bits = qrSegmentTotalBits(segs, g);
      const end = g === 1 ? 9 : g === 10 ? 26 : 40;
      for (let v = g; v <= end; v++) if (bits <= qrDataCapacityBits(v, ecc)) { version = v; segments = segs; break; }
      if (version) break;
    }
    if (!version) throw new Error(`Orion.qr.encode: text is too long to fit any QR version at ECC ${ecc}`);
  }
  const capBits = qrDataCapacityBits(version, ecc);
  const neededBits = qrSegmentTotalBits(segments, version);
  if (neededBits > capBits) throw new Error(`Orion.qr.encode: text does not fit in version ${version}-${ecc} (needs ${neededBits} bits, capacity is ${capBits}); use a higher version, lower ECC or shorter text`);

  const bw = new QRBitWriter();
  for (const seg of segments) qrWriteSegment(bw, seg, version);
  bw.push(0, Math.min(4, capBits - bw.length));
  while (bw.length % 8) bw.push(0, 1);
  const dataCwCount = capBits / 8;
  const padBytes = [0xEC, 0x11];
  for (let pi = 0; bw.length / 8 < dataCwCount; pi++) bw.push(padBytes[pi % 2], 8);
  const dataBytes = Array.from(bw.toBytes());

  const [ecLen, g1b, g1d, g2b, g2d] = QR_ECC_TABLE[version - 1][ecc];
  const blocks = [];
  let offset = 0;
  for (let i = 0; i < g1b; i++) { blocks.push(dataBytes.slice(offset, offset + g1d)); offset += g1d; }
  for (let i = 0; i < g2b; i++) { blocks.push(dataBytes.slice(offset, offset + g2d)); offset += g2d; }
  const ecBlocks = blocks.map(b => qrRsComputeEC(b, ecLen));

  const maxData = Math.max(g1d, g2d || 0);
  const finalBytes = [];
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.length) finalBytes.push(b[i]);
  for (let i = 0; i < ecLen; i++) for (const eb of ecBlocks) finalBytes.push(eb[i]);
  const finalBits = [];
  for (const byte of finalBytes) for (let i = 7; i >= 0; i--) finalBits.push((byte >> i) & 1);
  for (let i = 0; i < QR_REMAINDER[version - 1]; i++) finalBits.push(0);

  const size = qrMatrixSize(version);
  const mat = Array.from({ length: size }, () => new Int8Array(size));
  const reserved = Array.from({ length: size }, () => new Uint8Array(size));
  qrPlaceFinder(mat, reserved, 0, 0, size);
  qrPlaceFinder(mat, reserved, 0, size - 7, size);
  qrPlaceFinder(mat, reserved, size - 7, 0, size);
  for (const [r, c] of qrAlignmentCenters(version)) qrPlaceAlignment(mat, reserved, r, c, size);
  for (let i = 8; i <= size - 9; i++) { const v = i % 2 === 0 ? 1 : 0; mat[6][i] = v; reserved[6][i] = 1; mat[i][6] = v; reserved[i][6] = 1; }
  mat[size - 8][8] = 1; reserved[size - 8][8] = 1;
  for (const [r, c] of qrFormatCoords(size)) reserved[r][c] = 1;
  if (version >= 7) for (const [r, c] of qrVersionInfoCoords(size)) reserved[r][c] = 1;

  qrPlaceData(mat, reserved, size, finalBits);

  let maskId = opts.mask == null || opts.mask === 'auto' ? null : +opts.mask;
  if (maskId == null) {
    let best = -1, bestPenalty = Infinity;
    for (let m = 0; m < 8; m++) {
      qrApplyMask(mat, reserved, size, m);
      const p = qrPenalty(mat, size);
      qrApplyMask(mat, reserved, size, m);
      if (p < bestPenalty) { bestPenalty = p; best = m; }
    }
    maskId = best;
  } else if (!(maskId >= 0 && maskId <= 7)) throw new Error('Orion.qr.encode: mask must be 0-7 or "auto"');
  qrApplyMask(mat, reserved, size, maskId);

  const fmtData = (QR_ECC_BITS[ecc] << 3) | maskId;
  const fmtRem = qrBCH(fmtData, 5, '10100110111');
  const fmt15 = (fmtData << 10) | fmtRem;
  const fmtMasked = fmt15 ^ parseInt('101010000010010', 2);
  const fmtBits = qrBitsMSBFirst(fmtMasked, 15);
  for (const [r, c, i] of qrFormatCoords(size)) mat[r][c] = fmtBits[i];
  if (version >= 7) {
    const verRem = qrBCH(version, 6, '1111100100101');
    const ver18 = (version << 12) | verRem;
    for (const [r, c, i] of qrVersionInfoCoords(size)) mat[r][c] = (ver18 >> i) & 1;
  }

  const modules = mat.map(row => Array.from(row, v => !!v));
  return { size, modules, version, ecc, mask: maskId };
}
