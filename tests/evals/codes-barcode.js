/* tests/evals/codes-barcode.js — run against docs/components/barcode.html
 * Proves: barcode generation for every symbology round-trips through <o-scanner>'s image-decode
 * path; check digits are computed when omitted and VERIFIED (rejected when wrong) for EAN-13/
 * EAN-8/UPC-A/ITF-14; invalid input is surfaced as a thrown error (service API) and as `o-error`
 * plus an inline message (the <o-barcode> element).
 */
(async () => {
  const results = [];
  const assert = (name, cond, extra) => results.push({ name, ok: !!cond, extra });

  const scanner = document.createElement('o-scanner');
  scanner.style.cssText = 'position:fixed;inset-inline-start:-9999px;top:-9999px';
  document.body.appendChild(scanner);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  function waitScan(timeout = 4000) {
    return new Promise((resolve, reject) => {
      const onScan = e => { cleanup(); resolve(e.detail); };
      const onErr = e => { cleanup(); reject(e.detail.error); };
      const t = setTimeout(() => { cleanup(); reject(new Error('timeout waiting for o-scan')); }, timeout);
      function cleanup() { clearTimeout(t); scanner.removeEventListener('o-scan', onScan); scanner.removeEventListener('o-error', onErr); }
      scanner.addEventListener('o-scan', onScan, { once: true });
      scanner.addEventListener('o-error', onErr, { once: true });
    });
  }
  async function roundTrip(name, value, format, expectFormat = format, opts = {}) {
    try {
      // UPC-A numbers are also valid EAN-13 (leading 0), and a 14-digit ITF payload is also a valid
      // ITF-14 — the decoder correctly offers both readings when asked for both. Restricting `formats`
      // to just what THIS symbology was encoded as disambiguates which reading comes back.
      scanner.formats = [format];
      const canvas = Orion.barcode.canvas(value, { format, ...opts });
      const p = waitScan();
      await scanner.decodeFile(canvas);
      const detail = await p;
      assert(name, detail.format === expectFormat && detail.text === String(value), { got: detail, want: { text: value, format: expectFormat } });
    } catch (e) { assert(name, false, { error: e.message || String(e) }); }
  }

  // ---- every symbology, round-tripped (value supplied WITHOUT a check digit where applicable —
  // encode() computes it, and the scanned text below is the FULL text including that computed digit) ----
  await roundTrip('code128 (auto subset)', 'ORION-ADMIN-128', 'code128');
  await roundTrip('code128 (auto subset C for long digit runs)', '20260912384001', 'code128');
  await roundTrip('code128a (forced subset A)', 'CTRL CODES OK', 'code128a', 'code128');
  await roundTrip('code128b (forced subset B)', 'MixedCase128', 'code128b', 'code128');
  await roundTrip('code128c (forced subset C, even digits)', '20260912384001', 'code128c', 'code128');
  await roundTrip('code39', 'CODE 39-OK', 'code39');
  await roundTrip('itf (even digit count, no check digit)', '12345674', 'itf');
  await roundTrip('codabar', 'A123456A', 'codabar');

  // EAN/UPC/ITF-14: encode() COMPUTES the check digit when the shorter (payload-only) length is given.
  async function checkDigitComputed(name, payload, format) {
    try {
      const enc = Orion.barcode.encode(payload, format);
      assert(`${name}: computes a check digit`, enc.text.length === payload.length + 1 && enc.text.startsWith(payload));
      await roundTrip(`${name}: round-trips with the computed check digit`, enc.text, format);
    } catch (e) { assert(name, false, { error: e.message }); }
  }
  await checkDigitComputed('ean13', '400638133393', 'ean13');
  await checkDigitComputed('ean8', '9638507', 'ean8');
  await checkDigitComputed('upca', '03600029145', 'upca');
  await checkDigitComputed('itf14', '0001234567890', 'itf14');

  // ---- checksum VERIFICATION: correct full value accepted, wrong check digit rejected ----
  function expectThrows(name, fn, messagePattern) {
    try { fn(); assert(name, false, { error: 'did not throw' }); }
    catch (e) { assert(name, messagePattern.test(e.message), { message: e.message }); }
  }
  assert('ean13: accepts a correct supplied check digit', Orion.barcode.encode('4006381333931', 'ean13').text === '4006381333931');
  expectThrows('ean13: rejects a wrong check digit', () => Orion.barcode.encode('4006381333930', 'ean13'), /invalid EAN-13 check digit \(expected 1, got 0\)/);
  expectThrows('ean8: rejects a wrong check digit', () => Orion.barcode.encode('96385075', 'ean8'), /invalid EAN-8 check digit \(expected 4, got 5\)/);
  expectThrows('upca: rejects a wrong check digit', () => Orion.barcode.encode('036000291453', 'upca'), /invalid UPC-A check digit \(expected 2, got 3\)/);
  expectThrows('itf14: rejects a wrong check digit', () => Orion.barcode.encode('00012345678901', 'itf14'), /invalid ITF-14 check digit \(expected 5, got 1\)/);

  // ---- invalid-input errors, documented and thrown ----
  expectThrows('code39: disallowed character', () => Orion.barcode.encode('lower!case', 'code39'), /Code 39 cannot encode/);
  expectThrows('itf: odd digit count', () => Orion.barcode.encode('123', 'itf'), /even number of digits/);
  expectThrows('code128c: odd digit count', () => Orion.barcode.encode('123', 'code128c'), /even number of digits/);
  expectThrows('code128c: non-digit', () => Orion.barcode.encode('12AB', 'code128c'), /even number of digits|cannot encode/);
  expectThrows('ean13: wrong digit count', () => Orion.barcode.encode('123', 'ean13'), /requires 12 or 13 digits/);
  expectThrows('code128: empty value', () => Orion.barcode.encode('', 'code128'), /value is required/);
  expectThrows('unknown format', () => Orion.barcode.encode('x', 'not-a-format'), /unknown format/);

  // ---- <o-barcode> element surfaces the same errors via o-error + an inline message ----
  const barEl = document.createElement('o-barcode');
  barEl.style.cssText = 'position:fixed;inset-inline-start:-9999px;top:-9999px';
  document.body.appendChild(barEl);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  barEl.format = 'ean13';
  const elErr = await new Promise(resolve => {
    barEl.addEventListener('o-error', e => resolve(e.detail.error), { once: true });
    barEl.value = '4006381333930'; // wrong check digit
  });
  assert('<o-barcode> fires o-error for a bad checksum', elErr instanceof Error && /invalid EAN-13 check digit/.test(elErr.message));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  assert('<o-barcode> shows an inline error message, not a barcode', !!barEl.querySelector('.o-barcode-error') && !barEl.querySelector('svg'));
  barEl.value = '4006381333931'; // now valid
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  assert('<o-barcode> recovers and renders once the value is valid', !!barEl.querySelector('svg') && !barEl.querySelector('.o-barcode-error'));
  barEl.remove();
  scanner.remove();

  const bad = results.filter(r => !r.ok);
  return { ok: bad.length === 0, count: results.length, bad, results };
})();
