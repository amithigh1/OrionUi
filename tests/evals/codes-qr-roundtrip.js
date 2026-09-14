/* tests/evals/codes-qr-roundtrip.js — run against docs/components/qr-code.html
 * Proves: QR generation for every payload helper and every ECC level round-trips through
 * <o-scanner>'s image-decode path (generate -> render to canvas -> decodeFile() -> equal text);
 * SVG export string validity; colour/logo/module-style options don't break the round trip.
 */
(async () => {
  const results = [];
  const assert = (name, cond, extra) => results.push({ name, ok: !!cond, extra });

  // A throwaway <o-scanner>, driven purely through its image-decode path (decodeFile), not the camera.
  const scanner = document.createElement('o-scanner');
  scanner.style.cssText = 'position:fixed;inset-inline-start:-9999px;top:-9999px';
  document.body.appendChild(scanner);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); // let setup() run

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
  async function roundTrip(name, text, opts = {}) {
    try {
      const canvas = Orion.qr.canvas(text, { size: 320, margin: 3, ...opts });
      const [scanPromise] = [waitScan()];
      await scanner.decodeFile(canvas);
      const detail = await scanPromise;
      assert(name, detail.format === 'qr_code' && detail.text === text, { got: detail.text, want: text });
    } catch (e) { assert(name, false, { error: e.message || String(e) }); }
  }

  // ---- payload helpers ----
  await roundTrip('payload: plain text', 'Orion Admin QR round trip');
  const plainUrl = Orion.qr.url('orion-admin.dev/scan');
  assert('payload: url() adds https://', plainUrl === 'https://orion-admin.dev/scan', { got: plainUrl });
  await roundTrip('payload: url()', plainUrl);
  await roundTrip('payload: url() keeps an existing scheme', Orion.qr.url('mailto:hello@orion-admin.dev'));
  await roundTrip('payload: wifi()', Orion.qr.wifi({ ssid: 'Orion-Guest', password: 'sunflower42', encryption: 'WPA' }));
  await roundTrip('payload: wifi() open network', Orion.qr.wifi({ ssid: 'Orion-Open', encryption: 'none' }));
  await roundTrip('payload: vcard()', Orion.qr.vcard({ firstName: 'Ada', lastName: 'Lovelace', org: 'Orion Admin', title: 'Engineer', phone: '+1-555-0100', email: 'ada@orion-admin.dev', url: 'https://orion-admin.dev', address: '1 Analytical Engine Way', note: 'Round-trip test' }));
  await roundTrip('payload: email()', Orion.qr.email({ to: 'hello@orion-admin.dev', subject: 'Hi', body: 'From a QR code' }));
  await roundTrip('payload: sms()', Orion.qr.sms({ to: '+15550100', body: 'Orion fixture' }));
  await roundTrip('payload: geo() lat/lng', Orion.qr.geo({ lat: 3.139, lng: 101.6869 }));
  await roundTrip('payload: geo() query', Orion.qr.geo({ query: 'Orion HQ' }));

  // ---- every ECC level, round-tripped ----
  for (const ecc of ['L', 'M', 'Q', 'H']) {
    await roundTrip(`ecc=${ecc}`, `ECC level ${ecc} round-trip test payload`, { ecc });
  }

  // ---- explicit version + numeric/alphanumeric modes ----
  await roundTrip('mode=numeric', '0123456789012345', { mode: 'numeric' });
  await roundTrip('mode=alphanumeric', 'HELLO ORION-ADMIN 2026', { mode: 'alphanumeric' });
  await roundTrip('version=7 explicit', 'V7-' + 'x'.repeat(60), { version: 7, ecc: 'M' });

  // ---- module/finder styles + colour + logo still decode ----
  await roundTrip('moduleStyle=dots, finderStyle=dot', 'Dots and dot finders', { moduleStyle: 'dots', finderStyle: 'dot', ecc: 'Q' });
  await roundTrip('moduleStyle=rounded, finderStyle=rounded', 'Rounded modules and finders', { moduleStyle: 'rounded', finderStyle: 'rounded', ecc: 'Q' });
  await roundTrip('logo overlay (ecc=H)', 'https://orion-admin.dev/logo-test', {
    ecc: 'H', logo: { src: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#4f46e5"/></svg>'), size: 0.22, round: true },
  });

  // ---- SVG export string validity ----
  try {
    const svg = Orion.qr.svg('SVG validity check', { size: 200, ecc: 'M', color: '#123456', background: '#fedcba' });
    const looksValid = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg) && svg.trim().endsWith('</svg>') && svg.includes('viewBox=');
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const parserOk = !doc.querySelector('parsererror') && doc.documentElement.tagName.toLowerCase() === 'svg';
    assert('svg export: well-formed, parses as SVG', looksValid && parserOk, { svgHead: svg.slice(0, 60) });
    assert('svg export: colours applied', svg.includes('#123456') && svg.includes('#fedcba'));
  } catch (e) { assert('svg export', false, { error: e.message }); }

  // ---- transparent background option ----
  try {
    const svgT = Orion.qr.svg('transparent bg', { background: 'transparent' });
    assert('svg export: background=transparent omits the backing rect', !/<rect[^>]*fill="transparent"/.test(svgT) && !/<rect width="\d+" height="\d+" fill="#/.test(svgT));
  } catch (e) { assert('svg transparent background', false, { error: e.message }); }

  // ---- error surfaced for text too long for the requested version/ecc ----
  try {
    Orion.qr.encode('x'.repeat(3000), { version: 1, ecc: 'H' });
    assert('encode() throws when text does not fit', false);
  } catch (e) {
    assert('encode() throws when text does not fit', /does not fit/.test(e.message), { message: e.message });
  }

  // ---- <o-qrcode> element: renders, and surfaces the same error via o-error ----
  const qrEl = document.createElement('o-qrcode');
  qrEl.style.cssText = 'position:fixed;inset-inline-start:-9999px;top:-9999px';
  document.body.appendChild(qrEl);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  qrEl.value = 'Element render check';
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  assert('<o-qrcode> renders an <svg>', !!qrEl.querySelector('svg'));
  const elErr = await new Promise(resolve => {
    qrEl.addEventListener('o-error', e => resolve(e.detail.error), { once: true });
    qrEl.ecc = 'H'; qrEl.value = 'y'.repeat(4000); // exceeds even version 40 at ecc=H (no `version` prop on the element — auto-selects)
  });
  assert('<o-qrcode> fires o-error for text that does not fit', elErr instanceof Error && /too long|does not fit/.test(elErr.message), { message: elErr && elErr.message });
  qrEl.remove();
  scanner.remove();

  const bad = results.filter(r => !r.ok);
  return { ok: bad.length === 0, count: results.length, bad, results };
})();
