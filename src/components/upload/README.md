# upload

`<o-upload>` — a form-associated file uploader (drag & drop, clipboard paste, folder drops, validation,
previews, chunked/resumable transport, six layouts) plus a headless `Orion.upload()` controller and the
`Orion.upload.mock()` transport used by the docs. Docs: `docs/components/upload.html` and
`docs/components/upload-advanced.html`.

## Files

Concatenated in this order into one function scope (see ARCHITECTURE.md §2):

| File | Contents |
|---|---|
| `00-validate.js` | i18n strings, `parseSize`, MIME/extension tables, magic-number sniffing (`sniff`), accept matching (`matchAccept`, `describeAccept`), image header parsing (`imageInfo`, EXIF orientation), `checkBefore`/`checkAfter`/`validateFile` |
| `10-transport.js` | `xhrRequest` (the HTTP primitive), `xhrUploader` (multipart/binary), `mockUploader` (`Orion.upload.mock`), `builtinDownload` |
| `15-process.js` | Image decode/draw with EXIF correction, `compressImage`, `cropImage`, `thumbnail`/`videoPoster`, `fileKind` |
| `20-chunked.js` | `fingerprint` (SHA-256 of metadata + first/last 64 KB), `resumeStore` (IndexedDB → localStorage, or `Orion.idb`), `chunkedUpload`, `tusUpload` |
| `25-queue.js` | `UploadQueue` (the transport-agnostic state machine used by both the element and the headless API) and `createUploadController` (`Orion.upload()`) |
| `30-ui.js` | DOM-only helpers: `filesFromDrop` (walks folder entries), `filesFromClipboard`, list-item rendering, zone content per variant, the summary bar |
| `90-element.js` | `<o-upload>` (`OUpload extends FormElement`) and the `Orion.upload` namespace |
| `upload.css` | All six variants, tokens only, one `@container` breakpoint per list, `forced-colors` fallback |

## Architecture

`UploadQueue` (in `25-queue.js`) is a plain `Emitter` with no DOM dependency — it owns `items` (see the Item
shape below), validation, scheduling (`parallel`), and delegates each running upload to one of three transports
based on options: `_simple` (`10-transport.js`'s `xhrUploader` or a user `uploader`), `chunkedUpload` (when
`chunkSize` is set and the file exceeds it), or `tusUpload` (when `protocol: 'tus'`). `<o-upload>` (`90-element.js`)
is a thin DOM layer: it owns one `UploadQueue` (`this._q`), renders from its `items`/`stats()`, and forwards every
queue event to a DOM `o-*` CustomEvent. `Orion.upload(files, options)` builds the same `UploadQueue` with no
element at all, for headless use.

**Item shape** (`UploadQueue.items[]`, and what `getFiles()` returns):

```
{
  id, file, original,                 // File (after processing) / File (before, if compress/crop ran)
  name, size, type, relativePath,     // relativePath set for folder drops/picks (webkitRelativePath or a walked path)
  source,                             // 'picker' | 'drop' | 'paste' | 'value' | 'api'
  status,                             // validating | processing | queued | uploading | paused | done | error | canceled | rejected
  progress: { loaded, total, percent, speed, eta },
  error, reason,                      // human message / machine reason (see o-reject in the docs)
  response, serverId, url,            // server response, id read via `valueKey`, response.url if present
  preview,                            // objectURL thumbnail (image/video) or null
  remote,                             // true for items added via addRemote()/value= (no local File)
  chunked, fileId, attempts, scheduled, meta,
}
```

## Key design points (read before changing this code)

* **`this._changed` is reserved by `OElement`** (`src/core/40-component.js`) as the pending-prop-change `Set`
  set in its constructor. `OUpload`'s "notify the outside world a value changed" helper is named
  **`_notifyChange()`** specifically to avoid shadowing it — naming it `_changed` makes every call throw
  `TypeError: this._changed is not a function` (this exact bug shipped once; see CHANGELOG-equivalent below).
  Don't reintroduce a method or field named `_changed`, `_cleanups`, `_p`, `_setupDone` etc. on any `OElement`
  subclass.
* **Resumability is chunk-granular, not byte-granular.** `chunkedUpload` persists the set of fully-completed
  chunk indexes after each one succeeds (`resumeStore.set`). A chunk aborted mid-flight is simply resent whole
  on the next attempt — there's no partial-chunk resume.
* **`cancel()` deletes resume data on purpose** (`UploadQueue.cancel`) — it means "the user gave up on this
  file", not "the tab closed". A real reload/network loss never calls `cancel()`: the element's
  `disconnectedCallback` → `UploadQueue.suspend()` aborts the in-flight request (via `AbortController`) and
  sets the item back to `paused` *without* touching the persisted resume record, so the next `chunkedUpload()`
  call (new element, same `File`, same computed `fingerprint`) picks up where it left off. When simulating a
  reload in tests or demos, remove the element from the DOM — never call `cancel()` first.
* **Fingerprint, not identity.** `fingerprint(file)` hashes `name|size|lastModified|type` plus the first/last
  64 KB, so a freshly re-selected/re-dropped `File` with the same content resolves to the same resume record —
  you don't need to keep the original `File` object alive across a real reload (it's kept in the demos only
  because there's no disk to re-read from in a browser).
* **`chunkParallel` chunks race, they don't queue in lockstep.** With the default `chunkParallel: 3`, all
  chunks up to that count start at once; a short last chunk can finish well before earlier, larger ones. Don't
  assume chunk *N* completes before chunk *N+1*.
* **Magic-number sniffing runs whenever the file's claimed kind is one `sniff()` recognizes** (`png jpeg gif
  webp pdf zip mp4`, plus everything zip-based: `docx xlsx pptx odt ods odp epub jar apk`) **or the file has no
  MIME type**, regardless of `accept`. A same-extension file with the wrong content (e.g. a renamed `.txt`
  saved as `.png`) is rejected with `reason: 'mismatch'` even if `accept` alone would have allowed it. Tests
  or demos that build synthetic `File`s of a recognized kind must include real signature bytes (see
  `docs/components/upload-advanced.html`'s inline demo scripts) or they will be rejected as a mismatch.
* **`o.uploader` is reused for chunks.** If you set a custom `uploader`, it is called for whole files *and*,
  when chunking is active, once per chunk (a `chunk: { index, start, end, size, total, count, fileId, blob }`
  is passed alongside `file`). `Orion.upload.mock()`'s returned function already handles both shapes. `tus`
  mode never calls `uploader` — only `request`/`chunkRequest`/`finalize` apply there.
* **Light DOM, no shadow root** (ARCHITECTURE.md §5.1) — all six variants are one class list
  (`.o-upload-{variant}`) on the host toggled in `update()`; CSS scopes with `.o-upload-*` classes only.

## `Orion.upload` namespace (`90-element.js`)

`Orion.upload(files, options) → controller` — headless version of `<o-upload>`; see the props table in
`docs/components/upload.html#api` for every option (same names, camelCase). Controller:
`{ queue, done, files, stats, add, upload, remove, clear, pause, resume, cancel, retry, set, on, off, once, destroy }`.
Callback options: `onAdd/onReject/onRemove/onStart/onProgress/onSuccess/onError/onComplete/onChange/onPause/onResume/onCancel/onRetry`.

| Function | Description |
|---|---|
| `mock(opts) → uploader` | In-memory transport for docs/tests: `{ latency, failRate, speed, tick, seed, failOn(file,chunk), response(file) }`. Also has `.request` (tus/Content-Range/multipart emulator for the `request`/`chunkRequest` hooks), `.server` (`Map<fileId, {size,chunks,ranges,offset,name}>`), `.log` (every attempt), `.received(fileId)`, `.reset()`. |
| `validate(file, rules) → Promise<null\|{reason,message}>` | Standalone version of the element's built-in checks. |
| `sniff(blob) → Promise<'png'\|'jpeg'\|'gif'\|'webp'\|'pdf'\|'zip'\|'mp4'\|null>` | Magic-number detection (reads first 1 KB). |
| `fingerprint(file) → Promise<string>` | Resume identity: `'u' + sha256(meta + head/tail 64KB)`, FNV-1a fallback without `SubtleCrypto`. |
| `parseSize(v) → number` | `"5mb"` / `"1.5 GB"` / `"500k"` / `1024` → bytes. |
| `matchAccept(accept, file, detectedMime?) → boolean`, `describeAccept(accept, t?) → string` | |
| `imageInfo(file) → Promise<{width,height,orientation}\|null>` | Reads dimensions from the file header (no full decode) when possible. |
| `compress(file, opts) → Promise<File>`, `crop(file, opts) → Promise<File\|null>` | Canvas-based pre-processing; delegate to `Orion.image.compress`/`Orion.cropImage` (media package) when present. |
| `thumbnail(file, px=160) → Promise<objectURL\|null>` | Caller must `URL.revokeObjectURL` it. |
| `fileKind(file) → { group, color, icon, ext }` | Drives the built-in list row's icon/color. |
| `xhr(options) → uploader` | The built-in whole-file uploader, usable standalone. |
| `request(reqOptions) → Promise<{status,response,getHeader,xhr}>` | The XHR primitive every transport is built on; override globally via the `request` option. |
| `store(custom?) → { get, set, del }` | The resume-record store `chunkedUpload`/`tusUpload` use. |
| `chunked(file, o, ctx)`, `tus(file, o, ctx)` | The low-level chunked/tus drivers (mostly for advanced/custom composition). |
| `Queue` | The `UploadQueue` class. |
| `download(url, opts) → Promise<Blob>` | Delegates to `Orion.http.download` (services package) when present, else `builtinDownload`. |

## Testing

```bash
node build/build.mjs --only=upload,icons,basics --out=.tmp/upload --no-min
node build/check.mjs docs/components/upload.html docs/components/upload-advanced.html --bundle=.tmp/upload/orion.js --shots=.tmp/upload/shots --full
node build/check.mjs docs/components/upload.html docs/components/upload-advanced.html --bundle=.tmp/upload/orion.js --dark
node build/check.mjs docs/components/upload.html docs/components/upload-advanced.html --bundle=.tmp/upload/orion.js --rtl
node build/check.mjs docs/components/upload.html docs/components/upload-advanced.html --bundle=.tmp/upload/orion.js --mobile
```

Use `--eval` to script real interactions — see the PR/session notes for a full example that: adds files via
`addFiles()`, dispatches a synthetic `drop` `Event` with a hand-built `dataTransfer` (`{ files, items, types }`,
including a fake `webkitGetAsEntry()`-returning directory entry for folder drops) and a synthetic `paste`
`Event` with a hand-built `clipboardData`; asserts rejections for `maxSize`/`type`/`mismatch`/`maxFiles`; runs
uploads through `Orion.upload.mock()` and asserts `o-progress`/`o-success`; pauses/resumes mid-transfer;
forces a failure with `failOn` and retries; and — the fiddly one — proves chunked resume by using a
hand-rolled deterministic `uploader` (resolves chunks on command, no timers) so the test isn't racing the mock
transport's simulated timing, `remove()`s the element mid-upload (never `cancel()` — see above), remounts a
fresh element, re-adds the same `File`, and asserts none of the already-completed chunk indexes are requested
again. When testing with the real `Orion.upload.mock()` timing simulator instead, remember `chunkParallel`
chunks race (see above) — wait on `o-start`, not on `addFiles()` resolving, before timing anything.
