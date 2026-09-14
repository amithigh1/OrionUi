/* legacy-zip-roundtrip.js — salvaged from .tmp/eval-zip-roundtrip.js (docs/components/export-import.html).
 * Orion.zip.create()/read() round trip: plain text, unicode text, nested binary, and an empty file.
 */
(async () => {
  const files = [
    { name: 'plain.txt', data: 'Hello world, this is a plain text file.\nSecond line.\n'.repeat(50) },
    { name: 'unicode.txt', data: 'Unicode content: Zoë Müller 日本語 emoji 🎉🚀 Ñandú café' },
    { name: 'dir/nested/binary.bin', data: new Uint8Array(Array.from({ length: 300 }, (_, i) => i % 256)) },
    { name: 'empty.txt', data: '' },
  ];
  const blob = await Orion.zip.create(files, { compress: true });
  const entries = await Orion.zip.read(blob);
  const results = [];
  for (const f of files) {
    const e = entries.find(x => x.name === f.name);
    if (!e) { results.push({ name: f.name, ok: false, reason: 'missing' }); continue; }
    if (typeof f.data === 'string') {
      const text = await e.text();
      results.push({ name: f.name, ok: text === f.data, size: e.size, compressedSize: e.compressedSize, method: e.method });
    } else {
      const bytes = new Uint8Array(await e.arrayBuffer());
      const same = bytes.length === f.data.length && bytes.every((b, i) => b === f.data[i]);
      results.push({ name: f.name, ok: same, size: e.size, compressedSize: e.compressedSize, method: e.method });
    }
  }
  const ok = entries.length === files.length && results.every(r => r.ok);
  return { ok, blobSize: blob.size, blobType: blob.type, entryCount: entries.length, results };
})()
