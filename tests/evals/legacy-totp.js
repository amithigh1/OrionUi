/* legacy-totp.js — salvaged from .tmp/eval-totp.js (docs/components/two-factor.html).
 * Orion.totp.generate() against the official RFC 6238 8-digit SHA1 test vectors, plus verify() accept/reject.
 */
(async () => {
  const secret = Orion.totp.base32Encode(new TextEncoder().encode('12345678901234567890'));
  const vectors = [
    { time: 59 * 1000, expected: '94287082' },
    { time: 1111111109 * 1000, expected: '07081804' },
    { time: 1234567890 * 1000, expected: '89005924' },
  ];
  const results = [];
  for (const v of vectors) {
    const code = await Orion.totp.generate(secret, { time: v.time, digits: 8, algorithm: 'SHA1' });
    results.push({ time: v.time / 1000, expected: v.expected, actual: code, pass: code === v.expected });
  }
  const verifyPass = await Orion.totp.verify(secret, '94287082', { time: 59 * 1000, digits: 8 });
  const verifyFail = await Orion.totp.verify(secret, '00000000', { time: 59 * 1000, digits: 8 });
  const allPass = results.every(r => r.pass);
  const ok = allPass && verifyPass === true && verifyFail === false;
  return { ok, allPass, results, verifyPass, verifyFail };
})()
