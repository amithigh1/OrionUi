/* ZIP — create & read .zip archives (PKWARE APPNOTE 6.3.x). No dependencies; browsers, workers and Node 18+.
 *
 *   O.zip.create([{ name, data: string | Uint8Array | ArrayBuffer | Blob, date, comment, compress }],
 *                { compress: true, comment, date }) -> Promise<Blob>
 *       deflate through CompressionStream('deflate-raw') (or 'deflate' minus the zlib wrapper); STORE when unavailable
 *       or when compression does not help. CRC-32, UTF-8 file names (flag bit 11), DOS timestamps in local time.
 *   O.zip.read(Blob | File | ArrayBuffer | Uint8Array) -> Promise<[{ name, size, compressedSize, date, dir, crc, comment,
 *                                                                  bytes(), text(encoding), blob(type), arrayBuffer() }]>
 *       handles data descriptors, ZIP64 sizes/offsets, Info-ZIP Unicode paths, CP437 names; inflate through
 *       DecompressionStream('deflate-raw') with a pure-JS fallback. CRC is verified when an entry is extracted.
 *   O.zip.crc32(bytes, [crc]) · O.zip.deflate(bytes, 'deflate-raw' | 'deflate') · O.zip.inflate(bytes, format)
 * Limits: no encryption, no ZIP64 *writing* (max 65535 entries / 4 GB).
 */

const enc = new TextEncoder();
let CRC_T = null;
function crc32(buf, crc = 0) {
  if (!CRC_T) {
    CRC_T = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c; }
  }
  let c = ~crc;
  for (let i = 0, n = buf.length; i < n; i++) c = CRC_T[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return ~c >>> 0;
}

async function toBytes(data) {
  if (data == null) return new Uint8Array(0);
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (typeof Blob !== 'undefined' && data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  return enc.encode(String(data));
}
async function through(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

/** deflate(bytes, 'deflate-raw' | 'deflate') -> Promise<Uint8Array | null> (null when the platform cannot compress) */
async function deflate(bytes, format = 'deflate-raw') {
  if (typeof CompressionStream !== 'function') return null;
  let cs;
  try { cs = new CompressionStream(format); }
  catch {
    if (format !== 'deflate-raw') return null;
    const z = await deflate(bytes, 'deflate');
    return z && z.subarray(2, z.length - 4); // strip the zlib header and Adler-32 trailer
  }
  return through(bytes, cs);
}

/* ── pure-JS inflate (RFC 1951), used only when DecompressionStream is missing ── */
const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLORD = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
function huff(lengths) {
  const counts = new Uint16Array(16), offs = new Uint16Array(16), syms = new Uint16Array(lengths.length);
  for (let i = 0; i < lengths.length; i++) counts[lengths[i]]++;
  counts[0] = 0;
  for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
  for (let i = 0; i < lengths.length; i++) if (lengths[i]) syms[offs[lengths[i]]++] = i;
  return { counts, syms };
}
function inflateJS(src) {
  let out = new Uint8Array(Math.max(1024, src.length * 4)), op = 0, pos = 0, bb = 0, bc = 0;
  const bits = n => {
    while (bc < n) { if (pos >= src.length) throw new Error('inflate: unexpected end of data'); bb |= src[pos++] << bc; bc += 8; }
    const v = bb & ((1 << n) - 1); bb >>>= n; bc -= n; return v;
  };
  const room = n => { if (op + n > out.length) { const o2 = new Uint8Array(Math.max(out.length * 2, op + n)); o2.set(out); out = o2; } };
  const decode = t => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bits(1);
      const count = t.counts[len];
      if (code - count < first) return t.syms[index + (code - first)];
      index += count; first = (first + count) << 1; code <<= 1;
    }
    throw new Error('inflate: invalid code');
  };
  let fixed = null, last;
  do {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      bb = 0; bc = 0;
      const len = src[pos] | (src[pos + 1] << 8);
      pos += 4; room(len); out.set(src.subarray(pos, pos + len), op); op += len; pos += len;
      continue;
    }
    let lt, dt;
    if (type === 1) {
      if (!fixed) {
        const l = new Uint8Array(288).fill(8, 0, 144).fill(9, 144, 256).fill(7, 256, 280).fill(8, 280, 288);
        fixed = [huff(l), huff(new Uint8Array(30).fill(5))];
      }
      [lt, dt] = fixed;
    } else if (type === 2) {
      const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4, cl = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) cl[CLORD[i]] = bits(3);
      const ct = huff(cl), lens = new Uint8Array(hlit + hdist);
      for (let i = 0; i < hlit + hdist;) {
        const sym = decode(ct);
        if (sym < 16) { lens[i++] = sym; continue; }
        let rep, val = 0;
        if (sym === 16) { if (!i) throw new Error('inflate: bad repeat'); val = lens[i - 1]; rep = 3 + bits(2); }
        else if (sym === 17) rep = 3 + bits(3); else rep = 11 + bits(7);
        while (rep--) lens[i++] = val;
      }
      lt = huff(lens.subarray(0, hlit)); dt = huff(lens.subarray(hlit));
    } else throw new Error('inflate: invalid block type');
    for (;;) {
      let sym = decode(lt);
      if (sym < 256) { room(1); out[op++] = sym; continue; }
      if (sym === 256) break;
      sym -= 257;
      const len = LBASE[sym] + bits(LEXT[sym]), ds = decode(dt), dist = DBASE[ds] + bits(DEXT[ds]);
      if (dist > op) throw new Error('inflate: distance too far back');
      room(len);
      for (let k = 0; k < len; k++, op++) out[op] = out[op - dist];
    }
  } while (!last);
  return out.subarray(0, op);
}

/** inflate(bytes, 'deflate-raw' | 'deflate') -> Promise<Uint8Array> */
async function inflate(bytes, format = 'deflate-raw') {
  if (typeof DecompressionStream === 'function') {
    let ds = null;
    try { ds = new DecompressionStream(format); } catch {}
    if (ds) return through(bytes, ds);
  }
  return inflateJS(format === 'deflate' ? bytes.subarray(2) : bytes);
}

/* ── DOS time & names ─────────────────────────────────────────────────── */
function dosTime(d) {
  d = d instanceof Date && !Number.isNaN(+d) ? d : new Date();
  const y = d.getFullYear();
  if (y < 1980) return { time: 0, date: (1 << 5) | 1 };
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((Math.min(y, 2107) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}
const fromDos = (t, d) => new Date(1980 + (d >> 9), ((d >> 5) & 15) - 1, d & 31, t >> 11, (t >> 5) & 63, (t & 31) * 2);
const CP437 = '00C7 00FC 00E9 00E2 00E4 00E0 00E5 00E7 00EA 00EB 00E8 00EF 00EE 00EC 00C4 00C5 00C9 00E6 00C6 00F4 00F6 00F2 00FB 00F9 00FF 00D6 00DC 00A2 00A3 00A5 20A7 0192 ' +
  '00E1 00ED 00F3 00FA 00F1 00D1 00AA 00BA 00BF 2310 00AC 00BD 00BC 00A1 00AB 00BB 2591 2592 2593 2502 2524 2561 2562 2556 2555 2563 2551 2557 255D 255C 255B 2510 ' +
  '2514 2534 252C 251C 2500 253C 255E 255F 255A 2554 2569 2566 2560 2550 256C 2567 2568 2564 2565 2559 2558 2552 2553 256B 256A 2518 250C 2588 2584 258C 2590 2580 ' +
  '03B1 00DF 0393 03C0 03A3 03C3 00B5 03C4 03A6 0398 03A9 03B4 221E 03C6 03B5 2229 2261 00B1 2265 2264 2320 2321 00F7 2248 00B0 2219 00B7 221A 207F 00B2 25A0 00A0';
let CP437_T = null;
function decodeName(bytes, utf8Flag) {
  if (utf8Flag) return new TextDecoder().decode(bytes);
  if (bytes.every(b => b < 128)) return String.fromCharCode(...bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch {}
  CP437_T = CP437_T || CP437.split(' ').map(h => String.fromCharCode(parseInt(h, 16)));
  let s = '';
  for (const b of bytes) s += b < 128 ? String.fromCharCode(b) : CP437_T[b - 128];
  return s;
}

/* ── writer ───────────────────────────────────────────────────────────── */
/** Create a ZIP archive. Entries are processed in order; directories end with '/' (or pass dir: true). */
async function create(entries, opts = {}) {
  const compress = opts.compress !== false, local = [], central = [];
  let offset = 0, count = 0;
  for (const e of toArr(entries)) {
    if (!e) continue;
    let name = String(e.name || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!name) throw new Error('zip: entry name required');
    const dir = !!e.dir || name.endsWith('/');
    if (dir && !name.endsWith('/')) name += '/';
    const nameB = enc.encode(name), comB = enc.encode(e.comment || '');
    const raw = dir ? new Uint8Array(0) : await toBytes(e.data);
    const crc = crc32(raw);
    let data = raw, method = 0;
    if (!dir && compress && e.compress !== false && raw.length > 32) {
      const z = await deflate(raw);
      if (z && z.length < raw.length) { data = z; method = 8; }
    }
    const { time, date } = dosTime(e.date || opts.date);
    const flags = /[^\x00-\x7f]/.test(name + (e.comment || '')) ? 0x0800 : 0;
    if (offset + 30 + nameB.length + data.length > 0xffffffff) throw new Error('zip: archive larger than 4 GB (ZIP64 writing not supported)');
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, flags, true); lh.setUint16(8, method, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, raw.length, true); lh.setUint16(26, nameB.length, true);
    local.push(lh, nameB, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, flags, true);
    ch.setUint16(10, method, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, raw.length, true); ch.setUint16(28, nameB.length, true);
    ch.setUint16(32, comB.length, true); ch.setUint32(38, dir ? 0x10 : 0, true); ch.setUint32(42, offset, true);
    central.push(ch, nameB, comB);
    offset += 30 + nameB.length + data.length;
    count++;
  }
  if (count > 0xffff) throw new Error('zip: more than 65535 entries (ZIP64 writing not supported)');
  const cdSize = central.reduce((s, p) => s + p.byteLength, 0), comB = enc.encode(opts.comment || '');
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, count, true); end.setUint16(10, count, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true); end.setUint16(20, comB.length, true);
  return new Blob([...local, ...central, end, comB], { type: opts.type || 'application/zip' });
}

/* ── reader ───────────────────────────────────────────────────────────── */
/** Read a ZIP archive: returns entries with lazy extract methods. */
async function read(input) {
  const buf = await toBytes(input);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), len = buf.length;
  let eocd = -1;
  for (let i = len - 22; i >= Math.max(0, len - 22 - 0xffff); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip: not a ZIP archive');
  let count = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
  if ((cdOff === 0xffffffff || count === 0xffff) && eocd >= 20 && dv.getUint32(eocd - 20, true) === 0x07064b50) {
    const z = Number(dv.getBigUint64(eocd - 12, true));
    if (dv.getUint32(z, true) === 0x06064b50) { count = Number(dv.getBigUint64(z + 32, true)); cdOff = Number(dv.getBigUint64(z + 48, true)); }
  }
  const out = [];
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (p + 46 > len || dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip: corrupt central directory');
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
    const time = dv.getUint16(p + 12, true), date = dv.getUint16(p + 14, true), crc = dv.getUint32(p + 16, true);
    let csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true), lho = dv.getUint32(p + 42, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const extAttr = dv.getUint32(p + 38, true);
    let name = decodeName(buf.subarray(p + 46, p + 46 + nlen), flags & 0x800);
    for (let x = p + 46 + nlen, xe = x + xlen; x + 4 <= xe;) {
      const id = dv.getUint16(x, true), sz = dv.getUint16(x + 2, true);
      if (id === 0x0001) {
        let q = x + 4;
        if (usize === 0xffffffff) { usize = Number(dv.getBigUint64(q, true)); q += 8; }
        if (csize === 0xffffffff) { csize = Number(dv.getBigUint64(q, true)); q += 8; }
        if (lho === 0xffffffff) lho = Number(dv.getBigUint64(q, true));
      } else if (id === 0x7075 && sz > 5) name = new TextDecoder().decode(buf.subarray(x + 9, x + 4 + sz));
      x += 4 + sz;
    }
    const comment = clen ? new TextDecoder().decode(buf.subarray(p + 46 + nlen + xlen, p + 46 + nlen + xlen + clen)) : '';
    p += 46 + nlen + xlen + clen;
    const dir = name.endsWith('/') || !!(extAttr & 0x10);
    let cache = null;
    const bytes = async () => {
      if (cache) return cache;
      if (flags & 1) throw new Error(`zip: "${name}" is encrypted`);
      if (dv.getUint32(lho, true) !== 0x04034b50) throw new Error(`zip: corrupt local header for "${name}"`);
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      const data = buf.subarray(start, start + csize);
      let res;
      if (method === 0) res = data;
      else if (method === 8) res = await inflate(data, 'deflate-raw');
      else throw new Error(`zip: unsupported compression method ${method} for "${name}"`);
      if (crc32(res) !== crc) throw new Error(`zip: CRC mismatch for "${name}"`);
      return (cache = res);
    };
    out.push({
      name, size: usize, compressedSize: csize, date: fromDos(time, date), dir, crc, comment, method,
      bytes, arrayBuffer: async () => { const b = await bytes(); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
      text: async (encoding = 'utf-8') => new TextDecoder(encoding).decode(await bytes()),
      blob: async (type = '') => new Blob([await bytes()], { type }),
    });
  }
  return out;
}

O.zip = { create, read, crc32, deflate, inflate, inflateSync: inflateJS };
