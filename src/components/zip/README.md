# zip — `O.zip`

ZIP archive reader/writer (PKWARE APPNOTE 6.3.x subset). Pure JS, no DOM required (works in
Node 18+, browsers, workers). Single file: `zip.js`. No `// @deps`.

No custom elements, no CSS, no i18n keys (errors are thrown `Error` objects with English messages
meant for developers/logs, not end users).

## `O.zip.create(entries, opts?) → Promise<Blob>`
```ts
function create(entries: ZipEntryInput[], opts?: {
  compress?: boolean;                 // default true — archive-level switch
  comment?: string;                   // archive comment, default ''
  date?: Date;                        // fallback mtime for entries that don't set their own
  type?: string;                      // Blob MIME type, default 'application/zip'
}): Promise<Blob>;

interface ZipEntryInput {
  name: string;                                              // required; '\' normalised to '/', leading '/' stripped
  data?: string | Uint8Array | ArrayBuffer | ArrayBufferView | Blob;  // ignored for directories
  date?: Date;                                                // per-entry mtime, else opts.date, else now
  comment?: string;
  compress?: boolean;                                         // default true; per-entry opt-out
  dir?: boolean;                                               // forces a directory entry even without a trailing '/'
}
```
- Entries are written **in order**. A falsy entry in the array is skipped.
- Directory entries (`dir: true` or a name ending in `/`) store 0 bytes.
- A non-directory entry is deflated (`CompressionStream('deflate-raw')`, or `'deflate'` with the
  zlib header/trailer stripped as a fallback) only when: the **archive** `compress` isn't `false`,
  the **entry** `compress` isn't `false`, the raw size is `> 32` bytes, `CompressionStream` exists,
  and the compressed result is actually smaller — otherwise the entry is **stored** (method 0).
- CRC-32 is always computed and stored. File names/comments containing non-ASCII characters set
  the UTF-8 flag (bit 11, `0x0800`); DOS date/time is derived from the local time of `date`
  (years `< 1980` clamp to the DOS epoch, years `> 2107` clamp to the DOS max).
- Throws if the running total would exceed `0xffffffff` bytes or if there are more than `65535`
  entries — **ZIP64 is not implemented for writing** (max ~4 GB / 65,535 entries per archive).
- Throws `Error('zip: entry name required')` for a missing/empty `name`.

## `O.zip.read(input) → Promise<ZipEntry[]>`
```ts
function read(input: Blob | File | ArrayBuffer | ArrayBufferView): Promise<ZipEntry[]>;

interface ZipEntry {
  name: string;
  size: number;             // uncompressed size
  compressedSize: number;
  date: Date;                // from the DOS timestamp (local time)
  dir: boolean;
  crc: number;                // uint32
  comment: string;
  method: number;             // 0 = store, 8 = deflate
  bytes(): Promise<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(encoding?: string): Promise<string>;      // default 'utf-8'
  blob(type?: string): Promise<Blob>;             // default '' (no type)
}
```
- Reads the central directory (locates the End-Of-Central-Directory record by scanning backward
  for its signature, then follows a ZIP64 EOCD locator/record when sizes/offsets/count are
  `0xffffffff`/`0xffff`) — **ZIP64 reading is supported**, ZIP64 *writing* is not.
- File names decode as UTF-8 when the UTF-8 flag is set, otherwise as plain ASCII when possible,
  else UTF-8 (best-effort), else **CP437** (the DOS code page); an Info-ZIP Unicode Path extra
  field (`0x7075`) overrides the name when present.
- Extraction is **lazy**: `bytes()`/`arrayBuffer()`/`text()`/`blob()` decompress and validate the
  CRC-32 on first call (result is cached on the entry). Reading an encrypted entry throws
  `Error('zip: "<name>" is encrypted')`; a corrupt local header or CRC mismatch throws with the
  entry name in the message; an unsupported compression method (anything but 0/8) throws too.
- Directory entries are recognised by a trailing `/` in the name or the MS-DOS directory attribute
  bit; they have `size: 0` and empty content.

## `O.zip.crc32(bytes, crc?) → number`
```ts
function crc32(buf: Uint8Array, crc?: number /* default 0 */): number;   // returns a uint32
```
Standard CRC-32 (IEEE 802.3 polynomial), incremental (pass the previous return value as `crc` to
continue over more bytes).

## `O.zip.deflate(bytes, format?) → Promise<Uint8Array | null>`
```ts
function deflate(bytes: Uint8Array, format?: 'deflate-raw' | 'deflate' /* default 'deflate-raw' */): Promise<Uint8Array | null>;
```
Thin wrapper over `CompressionStream`. Returns `null` when `CompressionStream` doesn't exist, or
(for `'deflate-raw'` specifically) when the raw variant isn't supported and the zlib-wrapped
fallback also fails to construct — no pure-JS deflate is included (only inflate).

## `O.zip.inflate(bytes, format?) → Promise<Uint8Array>`
```ts
function inflate(bytes: Uint8Array, format?: 'deflate-raw' | 'deflate' /* default 'deflate-raw' */): Promise<Uint8Array>;
```
Uses `DecompressionStream` when available; otherwise falls back to the bundled pure-JS RFC 1951
inflater (`format: 'deflate'` has its 2-byte zlib header stripped first — the 4-byte Adler-32
trailer is not, and is simply not read).

## `O.zip.inflateSync(bytes) → Uint8Array`
```ts
function inflateSync(bytes: Uint8Array): Uint8Array;
```
The synchronous pure-JS RFC 1951 (raw deflate) decoder used internally as the `inflate()`
fallback (`inflateJS`). Always expects a **raw** deflate stream (no zlib/gzip header) and throws
plain `Error`s (`'inflate: unexpected end of data'`, `'inflate: invalid code'`,
`'inflate: bad repeat'`, `'inflate: invalid block type'`, `'inflate: distance too far back'`) on
malformed input.

## Notes & limits
- No encryption support (reading or writing).
- No ZIP64 writing (4 GB / 65,535-entry ceiling); ZIP64 reading is supported.
- No Zip64 data-descriptor-only streaming writer — sizes/CRC are always known up front because
  entries are fully materialised in memory before being written.
- `O.xlsx` (see `../xlsx/README.md`) is built entirely on top of `O.zip.create`/`O.zip.read`.
