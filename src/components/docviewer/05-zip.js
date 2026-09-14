/* Minimal ZIP reader for DOCX packages (central-directory only, no ZIP64/encryption).
 * Prefers Orion.zip (the dedicated zip package) when it is loaded in the same bundle; otherwise inflates
 * with DecompressionStream('deflate-raw'). unzip(buf) -> Promise<{ names(), has(name), text(name), bytes(name) }>
 */
async function dvInflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream is not supported in this browser');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function dvUnzipOwn(input) {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input instanceof ArrayBuffer ? input : await input.arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  const lo = Math.max(0, buf.length - 22 - 65557);
  for (let i = buf.length - 22; i >= lo; i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('Not a zip archive');
  const count = dv.getUint16(eocd + 10, true);
  const dec = new TextDecoder('utf-8');
  const entries = new Map();
  let off = dv.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const compSize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = dec.decode(buf.subarray(off + 46, off + 46 + nameLen));
    entries.set(name, { method, compSize, lho });
    off += 46 + nameLen + extraLen + commentLen;
  }
  const cache = new Map();
  async function raw(name) {
    if (cache.has(name)) return cache.get(name);
    const e = entries.get(name);
    if (!e) return null;
    const lNameLen = dv.getUint16(e.lho + 26, true), lExtraLen = dv.getUint16(e.lho + 28, true);
    const start = e.lho + 30 + lNameLen + lExtraLen;
    const slice = buf.subarray(start, start + e.compSize);
    const data = e.method === 0 ? slice : await dvInflateRaw(slice);
    cache.set(name, data);
    return data;
  }
  return {
    names: () => [...entries.keys()],
    has: name => entries.has(name),
    bytes: raw,
    async text(name) { const b = await raw(name); return b ? dec.decode(b) : null; },
  };
}
/** unzip(File | Blob | ArrayBuffer | Uint8Array) -> { names(), has(name), text(name) -> Promise<string|null>, bytes(name) } */
async function unzip(input) {
  if (isFn(O.zip?.read)) {
    try {
      const list = await O.zip.read(input);
      const map = new Map(list.filter(e => !e.dir).map(e => [e.name, e]));
      return {
        names: () => [...map.keys()], has: n => map.has(n),
        async text(n) { const e = map.get(n); return e ? e.text() : null; },
        async bytes(n) { const e = map.get(n); return e ? e.bytes() : null; },
      };
    } catch { /* fall through to the built-in reader */ }
  }
  return dvUnzipOwn(input);
}
