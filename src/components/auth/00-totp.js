/* TOTP / HOTP (RFC 4226 / RFC 6238) using WebCrypto HMAC — secrets, otpauth:// URIs and code generation
 * for two-factor setup and verification UIs.
 *   Orion.totp.generateSecret(bytes=20) -> base32 secret string
 *   Orion.totp.uri({ issuer, account, secret, digits=6, period=30, algorithm='SHA1' }) -> "otpauth://totp/…"
 *   await Orion.totp.generate(secret, { time=Date.now(), digits=6, period=30, algorithm='SHA-1' }) -> "123456"
 *   await Orion.totp.verify(secret, code, { window=1, time, digits, period, algorithm }) -> boolean
 *   Orion.totp.base32Encode(bytes) / base32Decode(str)
 *
 * IMPORTANT: this runs entirely in the browser for demos, live "verify what you scanned" UI and offline
 * apps that hold their own secret. A real login MUST verify the code server-side against the secret the
 * server stored at enrollment time — a client can always be modified to report "valid".
 */
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes) {
  let bits = '', out = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i < bits.length; i += 5) out += B32_ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}
function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const c of clean) { const idx = B32_ALPHABET.indexOf(c); if (idx >= 0) bits += idx.toString(2).padStart(5, '0'); }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(bytes);
}
function randomBytes(n) {
  const buf = new Uint8Array(n);
  const c = globalThis.crypto;
  if (c && c.getRandomValues) c.getRandomValues(buf);
  else for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256); // non-crypto fallback (very old runtimes only)
  return buf;
}
function generateSecret(bytes = 20) { return base32Encode(randomBytes(clamp(bytes | 0 || 20, 10, 64))); }

function counterBytes(counter) {
  const buf = new ArrayBuffer(8), view = new DataView(buf);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  return new Uint8Array(buf);
}
const ALGO_MAP = { SHA1: 'SHA-1', 'SHA-1': 'SHA-1', SHA256: 'SHA-256', 'SHA-256': 'SHA-256', SHA512: 'SHA-512', 'SHA-512': 'SHA-512' };
async function hmacDigest(keyBytes, msgBytes, algorithm) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error('Orion.totp requires WebCrypto (crypto.subtle), which is unavailable in this context');
  const name = ALGO_MAP[String(algorithm || 'SHA1').toUpperCase()] || 'SHA-1';
  const key = await subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: name }, false, ['sign']);
  return new Uint8Array(await subtle.sign('HMAC', key, msgBytes));
}
/** hotp(secretBase32, counter, opts) -> zero-padded numeric code string */
async function hotp(secret, counter, { digits = 6, algorithm = 'SHA1' } = {}) {
  const hash = await hmacDigest(base32Decode(secret), counterBytes(counter), algorithm);
  const offset = hash[hash.length - 1] & 0xf;
  const bin = ((hash[offset] & 0x7f) << 24) | ((hash[offset + 1] & 0xff) << 16) | ((hash[offset + 2] & 0xff) << 8) | (hash[offset + 3] & 0xff);
  return String(bin % 10 ** digits).padStart(digits, '0');
}
async function generate(secret, opts = {}) {
  const { time = Date.now(), digits = 6, period = 30, algorithm = 'SHA1' } = opts;
  return hotp(secret, Math.floor(time / 1000 / period), { digits, algorithm });
}
/** verify(secret, code, { window: 1 = also accept the previous/next step (clock drift) }) */
async function verify(secret, code, opts = {}) {
  const { window: tolerance = 1, time = Date.now(), digits = 6, period = 30, algorithm = 'SHA1' } = opts;
  const clean = String(code ?? '').replace(/\s+/g, '');
  if (!clean) return false;
  const counter = Math.floor(time / 1000 / period);
  for (let i = -Math.abs(tolerance | 0); i <= Math.abs(tolerance | 0); i++) {
    if ((await hotp(secret, counter + i, { digits, algorithm })) === clean) return true;
  }
  return false;
}
/** uri({ issuer, account, secret, digits, period, algorithm }) -> otpauth://totp/Issuer:account?secret=...&issuer=... */
function uri({ issuer = '', account = '', secret = '', digits = 6, period = 30, algorithm = 'SHA1' } = {}) {
  const label = encodeURIComponent(issuer ? `${issuer}:${account}` : account || 'account');
  const qs = new URLSearchParams({ secret, algorithm: String(algorithm).toUpperCase().replace('-', ''), digits: String(digits), period: String(period) });
  if (issuer) qs.set('issuer', issuer);
  return `otpauth://totp/${label}?${qs.toString()}`;
}

O.totp = { generateSecret, generate, verify, uri, hotp, base32Encode, base32Decode };
