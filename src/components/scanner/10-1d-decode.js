/* ============================================================================
 * Pure-JS 1D barcode decoders: scanline luminance profile -> run-length
 * bars/spaces -> normalised widths -> pattern matching, for EAN-13/EAN-8/
 * UPC-A/Code128/Code39/ITF/Codabar. Tries multiple rows and both directions.
 * Tables are duplicated from src/components/barcode (self-contained folder).
 * ========================================================================== */

/* ── shared tables (duplicated; see 00-qr-decode.js header note) ─────────── */
const D_EAN_L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const D_EAN_G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const D_EAN_R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
const D_EAN13_PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
function d_eanWidths(bitStr) { const w = []; let cur = bitStr[0], len = 0; for (const ch of bitStr) { if (ch === cur) len++; else { w.push(len); cur = ch; len = 1; } } w.push(len); return w; }
const D_EAN_L_W = D_EAN_L.map(d_eanWidths), D_EAN_G_W = D_EAN_G.map(d_eanWidths), D_EAN_R_W = D_EAN_R.map(d_eanWidths);
function d_eanCheckDigit(digits, oddW, evenW) { let s = 0; for (let i = 0; i < digits.length; i++) s += (+digits[i]) * (i % 2 === 0 ? oddW : evenW); return (10 - (s % 10)) % 10; }

const D_CODE128_PATTERNS = [
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
const d_code128CharA = v => (v < 64 ? String.fromCharCode(32 + v) : v < 96 ? String.fromCharCode(v - 64) : null);
const d_code128CharB = v => (v < 96 ? String.fromCharCode(32 + v) : null);

const D_CODE39_PATTERNS = {
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
const D_ITF_DIGIT = ['00110','10001','01001','11000','00101','10100','01100','00011','10010','01010'];
const D_CODABAR_PATTERNS = {
  '0':'1111122','1':'1111221','2':'1112112','3':'2211111','4':'1121121','5':'2111121',
  '6':'1211112','7':'1211211','8':'1221111','9':'2112111','-':'1112211','$':'1122111',
  ':':'2111212','/':'2121112','.':'2121211','+':'1121212',
  'A':'1122121','B':'1212112','C':'1112122','D':'1112221',
};

/* ── generic width-pattern matcher (Code128 / Code39 / Codabar) ──────────── */
function d_matchScore(raw, pattern) {
  const rawSum = raw.reduce((a, b) => a + b, 0), patSum = pattern.reduce((a, b) => a + b, 0);
  if (!rawSum || !patSum) return Infinity;
  const unit = rawSum / patSum;
  let err = 0;
  for (let i = 0; i < pattern.length; i++) err += Math.abs(raw[i] - pattern[i] * unit);
  return err / rawSum;
}
function d_matchBest(raw, table, maxErr = 0.32) {
  let best = null, bestErr = maxErr;
  for (const { key, pattern } of table) {
    if (pattern.length !== raw.length) continue;
    const err = d_matchScore(raw, pattern);
    if (err < bestErr) { bestErr = err; best = key; }
  }
  return best;
}

/* ── row run-length extraction ───────────────────────────────────────────── */
function d_rowRuns(gray, width, y, stride) {
  let min = 255, max = 0;
  const base = y * stride;
  for (let x = 0; x < width; x++) { const v = gray[base + x]; if (v < min) min = v; if (v > max) max = v; }
  if (max - min < 20) return null;
  const threshold = (min + max) / 2;
  const lens = [], colors = [];
  let cur = gray[base] < threshold ? 1 : 0, curLen = 0;
  for (let x = 0; x < width; x++) {
    const c = gray[base + x] < threshold ? 1 : 0;
    if (c === cur) curLen++; else { lens.push(curLen); colors.push(cur); cur = c; curLen = 1; }
  }
  lens.push(curLen); colors.push(cur);
  return { lens, colors };
}
function d_reversed(rr) { return { lens: rr.lens.slice().reverse(), colors: rr.colors.slice().reverse() }; }

/* ── EAN-13 / EAN-8 / UPC-A ───────────────────────────────────────────────── */
function d_readEanDigits(lens, colors, startIdx, count, tables) {
  const digits = [], parity = [];
  let idx = startIdx;
  for (let d = 0; d < count; d++) {
    const w = [lens[idx], lens[idx + 1], lens[idx + 2], lens[idx + 3]];
    if (w.some(x => x == null)) return null;
    const sum = w[0] + w[1] + w[2] + w[3];
    if (!sum) return null;
    const norm = w.map(x => (x * 7) / sum);
    let best = null, bestErr = 1.4;
    for (const { name, patterns } of tables) patterns.forEach((p, digit) => { const err = p.reduce((s, pw, i) => s + Math.abs(pw - norm[i]), 0); if (err < bestErr) { bestErr = err; best = { name, digit }; } });
    if (!best) return null;
    digits.push(best.digit); parity.push(best.name);
    idx += 4;
  }
  return { digits, parity, next: idx };
}
function d_scanEanFamily(lens, colors, out) {
  for (let i = 0; i + 3 <= lens.length; i++) {
    if (colors[i] !== 1) continue;
    const g = [lens[i], lens[i + 1], lens[i + 2]];
    const unit = (g[0] + g[1] + g[2]) / 3;
    if (unit < 1 || Math.max(...g) / Math.min(...g) > 1.7) continue;
    // EAN-13 / UPC-A: guard(3) + 6*4 + mid-guard(5) + 6*4 + end-guard(3) = 59 runs
    if (i + 59 <= lens.length) {
      const left = d_readEanDigits(lens, colors, i + 3, 6, [{ name: 'L', patterns: D_EAN_L_W }, { name: 'G', patterns: D_EAN_G_W }]);
      if (left) {
        const mg = lens.slice(left.next, left.next + 5);
        if (mg.length === 5 && Math.max(...mg) / Math.min(...mg) < 2.2) {
          const right = d_readEanDigits(lens, colors, left.next + 5, 6, [{ name: 'R', patterns: D_EAN_R_W }]);
          if (right) {
            const firstDigit = D_EAN13_PARITY.indexOf(left.parity.join(''));
            if (firstDigit >= 0) {
              const digits = String(firstDigit) + left.digits.join('') + right.digits.join('');
              if (digits.length === 13 && +digits[12] === d_eanCheckDigit(digits.slice(0, 12), 1, 3)) {
                out.push({ text: digits, format: 'ean13' });
                if (digits[0] === '0') out.push({ text: digits.slice(1), format: 'upca' });
              }
            }
          }
        }
      }
    }
    // EAN-8: guard(3) + 4*4 + mid-guard(5) + 4*4 + end-guard(3) = 43 runs
    if (i + 43 <= lens.length) {
      const left = d_readEanDigits(lens, colors, i + 3, 4, [{ name: 'L', patterns: D_EAN_L_W }]);
      if (left) {
        const mg = lens.slice(left.next, left.next + 5);
        if (mg.length === 5 && Math.max(...mg) / Math.min(...mg) < 2.2) {
          const right = d_readEanDigits(lens, colors, left.next + 5, 4, [{ name: 'R', patterns: D_EAN_R_W }]);
          if (right) {
            const digits = left.digits.join('') + right.digits.join('');
            if (digits.length === 8 && +digits[7] === d_eanCheckDigit(digits.slice(0, 7), 3, 1)) out.push({ text: digits, format: 'ean8' });
          }
        }
      }
    }
  }
}

/* ── Code 128 ─────────────────────────────────────────────────────────────── */
const D_C128_TABLE = D_CODE128_PATTERNS.slice(0, 106).map((p, v) => ({ key: v, pattern: p.split('').map(Number) }));
const D_C128_STOP = D_CODE128_PATTERNS[106].split('').map(Number);
function d_scanCode128(lens, colors, out) {
  for (let i = 0; i + 6 <= lens.length; i++) {
    if (colors[i] !== 1) continue;
    const startRaw = lens.slice(i, i + 6);
    const startVal = d_matchBest(startRaw, D_C128_TABLE.filter(e => e.key >= 103 && e.key <= 105), 0.2);
    if (startVal == null) continue;
    const unit = startRaw.reduce((a, b) => a + b, 0) / 11;
    let idx = i + 6, values = [startVal], ok = true, stopped = false;
    while (idx + 6 <= lens.length) {
      // Stop is only genuine at the true end of the symbol run: either the row ends right after it,
      // or it is followed by a clear quiet zone (a run much wider than one module).
      if (idx + 7 <= lens.length && d_matchScore(lens.slice(idx, idx + 7), D_C128_STOP) < 0.2 &&
          (idx + 7 === lens.length || lens[idx + 7] > unit * 3)) { stopped = true; break; }
      const v = d_matchBest(lens.slice(idx, idx + 6), D_C128_TABLE, 0.25);
      if (v == null) { ok = false; break; }
      values.push(v);
      idx += 6;
    }
    if (!ok || !stopped || values.length < 2) continue;
    // The last value read before the stop pattern is the checksum — verify, then build text from the rest.
    const checksum = values.pop();
    let sum = values[0];
    for (let k = 1; k < values.length; k++) sum += values[k] * k;
    if (sum % 103 !== checksum) continue;
    let mode = values[0] === 103 ? 'A' : values[0] === 104 ? 'B' : 'C';
    let text = '', textOk = true;
    for (let k = 1; k < values.length && textOk; k++) {
      const v = values[k];
      if (mode === 'C') {
        if (v === 100) mode = 'B';
        else if (v === 101) mode = 'A';
        else if (v <= 99) text += String(v).padStart(2, '0');
      } else if (v === 99) mode = 'C';
      else if (v === 100) mode = 'B';
      else if (v === 101) mode = 'A';
      else if ((v >= 96 && v <= 98) || v === 102) { /* FNC1/2/3/Shift: not represented in decoded text */ }
      else { const ch = mode === 'A' ? d_code128CharA(v) : d_code128CharB(v); if (ch == null) textOk = false; else text += ch; }
    }
    if (textOk && text) out.push({ text, format: 'code128' });
  }
}

/* ── Code 39 (start = stop = '*', so a mirrored read is decoded by reversing
 * every matched window and reversing the assembled text at the end) ──────── */
const D_C39_TABLE = Object.entries(D_CODE39_PATTERNS).map(([key, p]) => ({ key, pattern: p.split('').map(c => (c === '1' ? 3 : 1)) }));
function d_scanCode39(lens, colors, out) {
  for (const rev of [false, true]) {
    const win = (a, b) => { const w = lens.slice(a, b); return rev ? w.reverse() : w; };
    for (let i = 0; i + 9 <= lens.length; i++) {
      if (colors[i] !== 1) continue;
      if (d_matchBest(win(i, i + 9), D_C39_TABLE, 0.28) !== '*') continue;
      let idx = i + 9, text = '', ok = true;
      for (;;) {
        idx++; // narrow inter-character gap
        if (idx + 9 > lens.length) { ok = false; break; }
        const ch = d_matchBest(win(idx, idx + 9), D_C39_TABLE, 0.28);
        if (ch == null) { ok = false; break; }
        idx += 9;
        if (ch === '*') break;
        text += ch;
      }
      if (ok && text) out.push({ text: rev ? text.split('').reverse().join('') : text, format: 'code39' });
    }
  }
}

/* ── Interleaved 2 of 5 (ITF) ─────────────────────────────────────────────── */
const D_ITF_W = D_ITF_DIGIT.map(p => p.split('').map(c => (c === '1' ? 3 : 1)));
function d_bestItfDigit(raw) {
  let best = -1, bestErr = 0.3;
  for (let d = 0; d < 10; d++) { const err = d_matchScore(raw, D_ITF_W[d]); if (err < bestErr) { bestErr = err; best = d; } }
  return best;
}
function d_scanITF(lens, colors, out) {
  for (let i = 0; i + 4 <= lens.length; i++) {
    if (colors[i] !== 1) continue;
    const start = [lens[i], lens[i + 1], lens[i + 2], lens[i + 3]];
    const unit = (start[0] + start[1] + start[2] + start[3]) / 4;
    if (unit < 1 || Math.max(...start) / Math.min(...start) > 1.8) continue;
    let idx = i + 4, digits = '', ok = true;
    for (;;) {
      if (idx + 10 > lens.length) {
        // no room for another digit pair: this must be the stop pattern (wide bar, narrow space, narrow bar)
        const s = [lens[idx], lens[idx + 1], lens[idx + 2]];
        ok = digits.length > 0 && s[0] != null && colors[idx] === 1 && s[0] / unit > 1.8 && s[1] / unit < 1.8 && s[2] / unit < 1.8;
        break;
      }
      const bars = [lens[idx], lens[idx + 2], lens[idx + 4], lens[idx + 6], lens[idx + 8]];
      const spaces = [lens[idx + 1], lens[idx + 3], lens[idx + 5], lens[idx + 7], lens[idx + 9]];
      const d1 = d_bestItfDigit(bars), d2 = d_bestItfDigit(spaces);
      if (d1 < 0 || d2 < 0) { ok = false; break; }
      digits += String(d1) + String(d2);
      idx += 10;
    }
    if (ok && digits.length >= 2 && digits.length % 2 === 0) {
      out.push({ text: digits, format: 'itf' });
      if (digits.length === 14 && +digits[13] === d_eanCheckDigit(digits.slice(0, 13), 3, 1)) out.push({ text: digits, format: 'itf14' });
    }
  }
}

/* ── Codabar (start/stop are both from A-D; a mirrored read is decoded the
 * same way as Code 39 — reverse every window, then reverse the assembly) ─── */
const D_CODABAR_TABLE = Object.entries(D_CODABAR_PATTERNS).map(([key, p]) => ({ key, pattern: p.split('').map(c => (c === '2' ? 2 : 1)) }));
function d_scanCodabar(lens, colors, out) {
  for (const rev of [false, true]) {
    const win = (a, b) => { const w = lens.slice(a, b); return rev ? w.reverse() : w; };
    for (let i = 0; i + 7 <= lens.length; i++) {
      if (colors[i] !== 1) continue;
      const startCh = d_matchBest(win(i, i + 7), D_CODABAR_TABLE, 0.3);
      if (startCh == null || !/[ABCD]/.test(startCh)) continue;
      let idx = i + 7, text = '', ok = true, stopCh = null;
      for (;;) {
        idx++; // inter-character gap
        if (idx + 7 > lens.length) { ok = false; break; }
        const ch = d_matchBest(win(idx, idx + 7), D_CODABAR_TABLE, 0.3);
        if (ch == null) { ok = false; break; }
        idx += 7;
        if (/[ABCD]/.test(ch)) { stopCh = ch; break; }
        text += ch;
      }
      if (ok && text && stopCh) { const assembled = startCh + text + stopCh; out.push({ text: rev ? assembled.split('').reverse().join('') : assembled, format: 'codabar' }); }
    }
  }
}

/* ── entry point ──────────────────────────────────────────────────────────── */
const D_1D_SCANNERS = {
  ean13: d_scanEanFamily, ean8: d_scanEanFamily, upca: d_scanEanFamily,
  // The forced-subset generator variants (code128a/b/c) are still plain Code 128 symbols on the wire — the
  // decoder reads whichever subset the start code says and reports the generic 'code128' format either way
  // (see the format-tagging note in d_scanCode128), so all four requested-format spellings share one scanner.
  code128: d_scanCode128, code128a: d_scanCode128, code128b: d_scanCode128, code128c: d_scanCode128,
  code39: d_scanCode39, itf: d_scanITF, itf14: d_scanITF, codabar: d_scanCodabar,
};
/** Decode all requested 1D formats from a run-length row. Appends { text, format } to `out` (no de-dup). */
function d_decodeRow(lens, colors, formats, out) {
  const scanners = new Set();
  for (const f of formats) if (D_1D_SCANNERS[f]) scanners.add(D_1D_SCANNERS[f]);
  for (const fn of scanners) fn(lens, colors, out);
}
const D_CODE128_FAMILY = new Set(['code128', 'code128a', 'code128b', 'code128c']);
/** Requesting any code128/a/b/c format accepts a decoded 'code128' hit — the wire format doesn't carry which
 * generator-forced subset was used, only which subset the symbol *starts* in (see d_scanCode128). */
const d_formatRequested = (formats, actual) => formats.includes(actual) || (actual === 'code128' && formats.some(f => D_CODE128_FAMILY.has(f)));
/** Decode 1D barcodes from a grayscale buffer, trying several rows and both directions. */
function decode1DGray(gray, width, height, formats) {
  const results = [], seen = new Set();
  const rowCount = 20;
  const rows = [];
  for (let k = 1; k <= rowCount; k++) rows.push(Math.round((height * k) / (rowCount + 1)));
  for (const y of rows) {
    const rr = d_rowRuns(gray, width, y, width);
    if (!rr) continue;
    for (const variant of [rr, d_reversed(rr)]) {
      const found = [];
      d_decodeRow(variant.lens, variant.colors, formats, found);
      for (const f of found) {
        if (!d_formatRequested(formats, f.format)) continue;
        const key = f.format + ':' + f.text;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({ text: f.text, format: f.format, points: [[0, y], [width, y]] });
      }
    }
  }
  return results;
}
