/* ============================================================================
 * Barcode encoders — implemented from the specifications (no third-party code):
 *   Code 128 (ISO/IEC 15417, subsets A/B/C with automatic Code-C optimisation),
 *   EAN-13 / EAN-8 / UPC-A, Code 39, Interleaved 2 of 5 (+ ITF-14), Codabar.
 * Each encodeXxx() returns { modules: (0|1)[], format, text } — a bar(1)/space(0)
 * sequence at 1 module unit, WITHOUT quiet zones (added by the renderer).
 * ========================================================================== */

/** Expand a width-digit string (each digit = element width in units) into module bits, starting with a bar. */
function bcPatternBits(pattern) {
  const bits = [];
  for (let i = 0; i < pattern.length; i++) {
    const w = +pattern[i], v = i % 2 === 0 ? 1 : 0;
    for (let k = 0; k < w; k++) bits.push(v);
  }
  return bits;
}

/* ── Code 128 (ISO/IEC 15417) ─────────────────────────────────────────────── */
const CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','2331112',
];
const code128CharA = v => (v < 64 ? String.fromCharCode(32 + v) : v < 96 ? String.fromCharCode(v - 64) : null);
const code128CharB = v => (v < 96 ? String.fromCharCode(32 + v) : null);
const code128ValueA = ch => { const c = ch.charCodeAt(0); if (c >= 32 && c <= 95) return c - 32; if (c <= 31) return c + 64; return -1; };
const code128ValueB = ch => { const c = ch.charCodeAt(0); return c >= 32 && c <= 127 ? c - 32 : -1; };

/** Greedy subset planner: switches to Code C for runs of 4+ digits, otherwise extends A/B as far as possible. */
function code128Plan(text) {
  const n = text.length;
  const isDigit = i => text[i] >= '0' && text[i] <= '9';
  const digitRun = i => { let j = i; while (j < n && isDigit(j)) j++; return j - i; };
  const segs = [];
  let i = 0;
  while (i < n) {
    const run = digitRun(i);
    if (run >= 4) {
      const usable = run - (run % 2);
      segs.push({ mode: 'C', text: text.slice(i, i + usable) });
      i += usable;
      continue;
    }
    let mode = null, chunk = '', j = i;
    while (j < n) {
      if (digitRun(j) >= 4) break;
      const ch = text[j], code = ch.charCodeAt(0);
      if (code > 127) throw new Error(`Orion.barcode.svg: Code 128 cannot encode "${ch}" (only ASCII 0-127 is supported)`);
      const canA = code < 32 || (code >= 32 && code <= 95), canB = code >= 32 && code <= 127;
      if (mode == null) mode = canB ? 'B' : 'A';
      else if (mode === 'A' && !canA) break;
      else if (mode === 'B' && !canB) break;
      chunk += ch; j++;
    }
    segs.push({ mode, text: chunk });
    i = j;
  }
  return segs;
}
function code128Values(text) {
  if (!text) throw new Error('Orion.barcode.svg: value is required for format "code128"');
  const segs = code128Plan(text);
  const values = [];
  let current = segs[0].mode;
  values.push(current === 'A' ? 103 : current === 'B' ? 104 : 105);
  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s];
    if (s > 0 && seg.mode !== current) { values.push(seg.mode === 'A' ? 101 : seg.mode === 'B' ? 100 : 99); current = seg.mode; }
    if (seg.mode === 'C') for (let k = 0; k < seg.text.length; k += 2) values.push(parseInt(seg.text.slice(k, k + 2), 10));
    else { const val = seg.mode === 'A' ? code128ValueA : code128ValueB; for (const ch of seg.text) values.push(val(ch)); }
  }
  let sum = values[0];
  for (let k = 1; k < values.length; k++) sum += values[k] * k;
  values.push(sum % 103, 106);
  return values;
}
function code128ValuesForced(text, subset) {
  if (!text) throw new Error(`Orion.barcode.svg: value is required for format "code128${subset.toLowerCase()}"`);
  const values = [subset === 'A' ? 103 : subset === 'B' ? 104 : 105];
  if (subset === 'C') {
    if (!/^[0-9]+$/.test(text) || text.length % 2) throw new Error('Orion.barcode.svg: format "code128c" requires an even number of digits');
    for (let k = 0; k < text.length; k += 2) values.push(parseInt(text.slice(k, k + 2), 10));
  } else {
    const val = subset === 'A' ? code128ValueA : code128ValueB;
    for (const ch of text) { const v = val(ch); if (v < 0) throw new Error(`Orion.barcode.svg: format "code128${subset.toLowerCase()}" cannot encode "${ch}"`); values.push(v); }
  }
  let sum = values[0];
  for (let k = 1; k < values.length; k++) sum += values[k] * k;
  values.push(sum % 103, 106);
  return values;
}
function encodeCode128(text, subset) {
  const values = subset ? code128ValuesForced(text, subset) : code128Values(text);
  const modules = [];
  for (const v of values) modules.push(...bcPatternBits(CODE128_PATTERNS[v]));
  return { modules, format: subset ? 'code128' + subset.toLowerCase() : 'code128', text };
}

/* ── EAN-13 / EAN-8 / UPC-A ───────────────────────────────────────────────── */
const EAN_L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const EAN_G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const EAN_R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
const EAN13_PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
/** EAN L/G/R tables are per-module bit strings (one char = one module), unlike the width-digit strings used elsewhere. */
const eanBits = bitStr => bitStr.split('').map(Number);
function eanCheckDigit(digits, oddW, evenW) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += (+digits[i]) * (i % 2 === 0 ? oddW : evenW);
  return (10 - (sum % 10)) % 10;
}
function encodeEAN13(value) {
  let digits = String(value ?? '').replace(/\s/g, '');
  if (!/^[0-9]{12,13}$/.test(digits)) throw new Error('Orion.barcode.svg: format "ean13" requires 12 or 13 digits');
  const check = eanCheckDigit(digits.slice(0, 12), 1, 3);
  if (digits.length === 13) { if (+digits[12] !== check) throw new Error(`Orion.barcode.svg: invalid EAN-13 check digit (expected ${check}, got ${digits[12]})`); }
  else digits += check;
  const parity = EAN13_PARITY[+digits[0]];
  const modules = [1, 0, 1];
  for (let i = 1; i <= 6; i++) modules.push(...eanBits(parity[i - 1] === 'L' ? EAN_L[+digits[i]] : EAN_G[+digits[i]]));
  modules.push(0, 1, 0, 1, 0);
  for (let i = 7; i <= 12; i++) modules.push(...eanBits(EAN_R[+digits[i]]));
  modules.push(1, 0, 1);
  return { modules, format: 'ean13', text: digits };
}
function encodeEAN8(value) {
  let digits = String(value ?? '').replace(/\s/g, '');
  if (!/^[0-9]{7,8}$/.test(digits)) throw new Error('Orion.barcode.svg: format "ean8" requires 7 or 8 digits');
  const check = eanCheckDigit(digits.slice(0, 7), 3, 1);
  if (digits.length === 8) { if (+digits[7] !== check) throw new Error(`Orion.barcode.svg: invalid EAN-8 check digit (expected ${check}, got ${digits[7]})`); }
  else digits += check;
  const modules = [1, 0, 1];
  for (let i = 0; i < 4; i++) modules.push(...eanBits(EAN_L[+digits[i]]));
  modules.push(0, 1, 0, 1, 0);
  for (let i = 4; i < 8; i++) modules.push(...eanBits(EAN_R[+digits[i]]));
  modules.push(1, 0, 1);
  return { modules, format: 'ean8', text: digits };
}
function encodeUPCA(value) {
  let digits = String(value ?? '').replace(/\s/g, '');
  if (!/^[0-9]{11,12}$/.test(digits)) throw new Error('Orion.barcode.svg: format "upca" requires 11 or 12 digits');
  const check = eanCheckDigit(digits.slice(0, 11), 3, 1);
  if (digits.length === 12) { if (+digits[11] !== check) throw new Error(`Orion.barcode.svg: invalid UPC-A check digit (expected ${check}, got ${digits[11]})`); }
  else digits += check;
  const modules = [1, 0, 1];
  for (let i = 0; i < 6; i++) modules.push(...eanBits(EAN_L[+digits[i]]));
  modules.push(0, 1, 0, 1, 0);
  for (let i = 6; i < 12; i++) modules.push(...eanBits(EAN_R[+digits[i]]));
  modules.push(1, 0, 1);
  return { modules, format: 'upca', text: digits };
}

/* ── Code 39 ──────────────────────────────────────────────────────────────── */
const CODE39_PATTERNS = {
  '0':'000110100','1':'100100001','2':'001100001','3':'101100000','4':'000110001',
  '5':'100110000','6':'001110000','7':'000100101','8':'100100100','9':'001100100',
  'A':'100001001','B':'001001001','C':'101001000','D':'000011001','E':'100011000',
  'F':'001011000','G':'000001101','H':'100001100','I':'001001100','J':'000011100',
  'K':'100000011','L':'001000011','M':'101000010','N':'000010011','O':'100010010',
  'P':'001010010','Q':'000000111','R':'100000110','S':'001000110','T':'000010110',
  'U':'110000001','V':'011000001','W':'111000000','X':'010010001','Y':'110010000',
  'Z':'011010000','-':'010000101','.':'110000100',' ':'011000100','$':'010101000',
  '/':'010100010','+':'010001010','%':'000101010','*':'010010100',
};
/** pattern digits: 0=narrow(1 unit) 1=wide(3 units), alternating bar/space starting with a bar. */
function code39Bits(pattern) {
  const bits = [];
  for (let i = 0; i < pattern.length; i++) { const w = pattern[i] === '1' ? 3 : 1, v = i % 2 === 0 ? 1 : 0; for (let k = 0; k < w; k++) bits.push(v); }
  return bits;
}
function encodeCode39(value) {
  const text = String(value ?? '').toUpperCase();
  if (!text) throw new Error('Orion.barcode.svg: value is required for format "code39"');
  for (const ch of text) if (!CODE39_PATTERNS[ch]) throw new Error(`Orion.barcode.svg: Code 39 cannot encode "${ch}" (allowed: 0-9 A-Z space - . $ / + %)`);
  const seq = ['*', ...text.split(''), '*'];
  const modules = [];
  seq.forEach((ch, i) => { if (i) modules.push(0); modules.push(...code39Bits(CODE39_PATTERNS[ch])); });
  return { modules, format: 'code39', text };
}

/* ── Interleaved 2 of 5 (ITF) + ITF-14 ────────────────────────────────────── */
const ITF_DIGIT = ['00110','10001','01001','11000','00101','10100','01100','00011','10010','01010'];
function encodeITFCore(digits) {
  const modules = [1, 0, 1, 0]; // start: narrow bar, narrow space, narrow bar, narrow space
  for (let i = 0; i < digits.length; i += 2) {
    const barPat = ITF_DIGIT[+digits[i]], spacePat = ITF_DIGIT[+digits[i + 1]];
    for (let k = 0; k < 5; k++) {
      const bw = barPat[k] === '1' ? 3 : 1; for (let r = 0; r < bw; r++) modules.push(1);
      const sw = spacePat[k] === '1' ? 3 : 1; for (let r = 0; r < sw; r++) modules.push(0);
    }
  }
  modules.push(1, 1, 1, 0, 1); // stop: wide bar, narrow space, narrow bar
  return modules;
}
function encodeITF(value) {
  const digits = String(value ?? '').replace(/\s/g, '');
  if (!/^[0-9]+$/.test(digits) || digits.length % 2) throw new Error('Orion.barcode.svg: format "itf" requires an even number of digits');
  return { modules: encodeITFCore(digits), format: 'itf', text: digits };
}
function encodeITF14(value) {
  let digits = String(value ?? '').replace(/\s/g, '');
  if (!/^[0-9]{13,14}$/.test(digits)) throw new Error('Orion.barcode.svg: format "itf14" requires 13 or 14 digits');
  const check = eanCheckDigit(digits.slice(0, 13), 3, 1);
  if (digits.length === 14) { if (+digits[13] !== check) throw new Error(`Orion.barcode.svg: invalid ITF-14 check digit (expected ${check}, got ${digits[13]})`); }
  else digits += check;
  return { modules: encodeITFCore(digits), format: 'itf14', text: digits };
}

/* ── Codabar ──────────────────────────────────────────────────────────────── */
const CODABAR_PATTERNS = {
  '0':'1111122','1':'1111221','2':'1112112','3':'2211111','4':'1121121','5':'2111121',
  '6':'1211112','7':'1211211','8':'1221111','9':'2112111','-':'1112211','$':'1122111',
  ':':'2111212','/':'2121112','.':'2121211','+':'1121212',
  'A':'1122121','B':'1212112','C':'1112122','D':'1112221',
};
function codabarBits(pattern) {
  const bits = [];
  for (let i = 0; i < pattern.length; i++) { const w = pattern[i] === '2' ? 2 : 1, v = i % 2 === 0 ? 1 : 0; for (let k = 0; k < w; k++) bits.push(v); }
  return bits;
}
function encodeCodabar(value) {
  const raw = String(value ?? '').toUpperCase();
  if (!raw) throw new Error('Orion.barcode.svg: value is required for format "codabar"');
  let start = 'A', stop = 'A', body = raw;
  if (raw.length > 1 && /^[A-D]/.test(raw) && /[A-D]$/.test(raw)) { start = raw[0]; stop = raw[raw.length - 1]; body = raw.slice(1, -1); }
  for (const ch of body) if (!CODABAR_PATTERNS[ch]) throw new Error(`Orion.barcode.svg: Codabar cannot encode "${ch}"`);
  const seq = [start, ...body.split(''), stop];
  const modules = [];
  seq.forEach((ch, i) => { if (i) modules.push(0); modules.push(...codabarBits(CODABAR_PATTERNS[ch])); });
  return { modules, format: 'codabar', text: start + body + stop };
}

/** Orion.barcode.encode(value, format) -> { modules, format, text } (low-level; most use .svg()/.canvas()) */
function barcodeEncode(value, format) {
  const fmt = String(format || 'code128').toLowerCase();
  switch (fmt) {
    case 'code128': return encodeCode128(String(value ?? ''));
    case 'code128a': return encodeCode128(String(value ?? ''), 'A');
    case 'code128b': return encodeCode128(String(value ?? ''), 'B');
    case 'code128c': return encodeCode128(String(value ?? ''), 'C');
    case 'ean13': return encodeEAN13(value);
    case 'ean8': return encodeEAN8(value);
    case 'upca': return encodeUPCA(value);
    case 'code39': return encodeCode39(value);
    case 'itf': return encodeITF(value);
    case 'itf14': return encodeITF14(value);
    case 'codabar': return encodeCodabar(value);
    default: throw new Error(`Orion.barcode.svg: unknown format "${format}"`);
  }
}
