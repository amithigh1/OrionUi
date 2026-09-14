# http

Zero-dependency HTTP client (`fetch`, falling back to `XMLHttpRequest` only when upload progress is requested) with
request/response/error interceptors, timeout + retry with backoff, an in-memory response cache with request dedupe,
an offline mutation queue (via [`Orion.offline`](../offline/README.md)), download/upload helpers, an in-browser mock
server, and two DOM behaviors (`data-o-ajax` form submission, `data-o-load` fragment loading).

## `Orion.http`

`Orion.http` is a default client instance. `Orion.http.create(defaults)` returns an independent instance (own
interceptors, cache and events) that inherits the parent's defaults.

### Instance call & request methods

| Method | Signature | Description |
|---|---|---|
| `Orion.http(url, opts?)` | `(url: string \| RequestConfig, opts?) => Promise<any>` | Shorthand for `.request()`. |
| `.request(url, opts?)` | same | Runs the pipeline: request interceptors → offline queue → cache → dedupe → retries → transport → response interceptors → error interceptors. |
| `.get(url, opts?)` / `.head(url, opts?)` / `.delete(url, opts?)` / `.options(url, opts?)` | `(url, opts?) => Promise<any>` | |
| `.post(url, body?, opts?)` / `.put(url, body?, opts?)` / `.patch(url, body?, opts?)` | `(url, body?, opts?) => Promise<any>` | Plain objects are JSON-encoded; `FormData`/`Blob`/`string`/`URLSearchParams`/`ArrayBuffer`/typed arrays/streams pass through untouched. |
| `.download(url, opts?)` | `(url, { filename?, onProgress?, toast=true, save=true, ...config }) => Promise<Blob>` | Streams with progress, guesses a filename (`Content-Disposition` → URL → `'download'`), saves via `download()` when `save` and shows a progress toast (needs `Orion.toast`). |
| `.upload(url, input, opts?)` | `(url, File \| File[] \| FileList \| FormData, { fieldName='file', data?, method='POST', onProgress?, ...config }) => Promise<any>` | Wraps `input` in `FormData` unless already one; `data` fields are appended (objects/arrays JSON-stringified). |

Resolution: by default resolves with `response.data`; pass `full: true` to get the whole response object
`{ data, status, statusText, headers, config, response, url, cached, queued? }`.

### Request options

| Option | Type | Default | Notes |
|---|---|---|---|
| `method` | `String` | `'GET'` | |
| `baseURL` | `String` | `''` | Prefixed onto relative URLs. |
| `params` | `Object \| URLSearchParams \| String` | — | Query string; arrays repeat the key, `Date` → ISO, objects → JSON. |
| `paramsSerializer` | `(params) => string` | — | Overrides the default serializer. |
| `body` | `any` | — | |
| `headers` | `Object` | `{}` | Case-insensitively merged with instance defaults. |
| `timeout` | `Number` (ms) | `0` | `0` = no timeout. |
| `retry` | `Number \| Boolean \| RetryOptions` | `0` | See below. |
| `signal` | `AbortSignal` | — | |
| `responseType` | `'auto' \| 'json' \| 'text' \| 'blob' \| 'arrayBuffer' \| 'response'` | `'auto'` | `'auto'` sniffs `Content-Type`. |
| `onUploadProgress` / `onDownloadProgress` | `(p: ProgressInfo) => void` | — | Presence of `onUploadProgress` forces the XHR transport. |
| `cache` | `Boolean \| 'memory' \| Number` (ms) | `false` | GET-only memory cache; `true`/`'memory'` = no expiry. |
| `dedupe` | `Boolean` | `true` | Concurrent identical GETs (same method+URL+responseType+headers) share one network request. |
| `invalidate` | `Boolean` | `true` | `false` skips auto cache-invalidation of matching GETs after a mutation. |
| `baseURL`, `credentials` | `'omit' \| 'same-origin' \| 'include'` | `'same-origin'` | |
| `csrf` | `Boolean` | `true` | Auto-attaches a CSRF header on unsafe, same-origin requests. |
| `csrfHeader` | `String` | `'X-CSRF-Token'` | |
| `csrfCookie` | `String \| null` | `null` | Cookie name to read the token from (else `<meta name="csrf-token">`). |
| `loader` | `Boolean` | `false` | Calls `Orion.progress.start()`/`.done()` if that service exists. |
| `offline` | `Boolean \| 'queue'` | `false` | `'queue'`: persist the mutation to `Orion.offline.queue` when offline or on a network error, and resolve `{ queued: true, id }` (status 202) instead of throwing. |
| `validateStatus` | `(status: number) => boolean` | `200 ≤ s < 300` | |
| `full` | `Boolean` | `false` | Resolve with the whole response object instead of `.data`. |
| `meta` | `any` | — | Passed through untouched; visible on `config.meta`, interceptors and offline queue entries. |
| `adapter` | `(req, cfg) => Promise<Response>` | — | Custom transport; bypasses mock/XHR/fetch. |
| `mode`, `redirect`, `referrer`, `referrerPolicy`, `integrity`, `keepalive`, `priority`, `fetchCache` | — | — | Forwarded to `fetch()`'s `init` (`fetchCache` → `init.cache`). |

`RetryOptions`: `{ count=0, delay=300, factor=2, maxDelay=10000, jitter=0.25, on=[408,425,429,500,502,503,504], methods=['GET','HEAD','OPTIONS','PUT','DELETE'], network=true, when?(err, attempt) => boolean }`.
`retry: true` = `count: 3`; a bare number sets `count`. Retries honor a numeric/date `Retry-After` response header.

`ProgressInfo`: `{ loaded, total, progress: number|null (0..1), lengthComputable: boolean }`.

### Instance members

| Member | Signature | Description |
|---|---|---|
| `.defaults` | `Object` | Base config merged into every request. |
| `.interceptors` | `{ request, response, error }` | Each an `HttpInterceptors` instance. |
| `.HttpError` | class | Reference to the error class. |
| `.isHttpError(e)` | `(e) => boolean` | |
| `.create(defaults)` | `(defaults?) => HttpClient` | New instance inheriting these defaults. |
| `.cache` | cache store | `.clear(match?)` (URL prefix string, `RegExp`, or `fn(url)=>boolean`) → count removed; `.invalidate(url)` drops entries whose path matches/contains `url`; `.size` (getter). `.get`/`.set` use internal composite keys (advanced use only). |
| `.on(event, fn)` / `.off(event, fn)` / `.once(event, fn)` | | Events: `request(config)`, `response(res)`, `error(err)`, `retry({attempt, delay, error, config})`, `queued({config, entry})`. |
| `.abortAll(reason?)` | `(reason?) => void` | Aborts every in-flight request across **all** instances. |
| `.params(params)` | `(params) => string` | Query-string serializer (`serializeParams`). |
| `.buildURL(url, params)` | `(url, params?) => string` | Uses this instance's `baseURL`. |
| `.backoff(attempt, opts?)` | `(attempt, opts?) => number` | Exponential backoff with jitter, in ms. |

### `HttpInterceptors`

| Method | Description |
|---|---|
| `use(fn)` | Registers a handler; returns `eject()`. Request handlers receive/return `config`; response handlers receive/return the response object; error handlers receive an `HttpError` and may return a value to resolve the request instead (e.g. retry after refreshing a token), or throw/return a new error. |
| `eject(fnOrHandle)` | Removes a handler. |
| `clear()` | Removes every handler. |
| `size` (getter) | Handler count. |
| `list()` | `() => Function[]` |

### `HttpError`

Fields: `name='HttpError'`, `message`, `status`, `statusText`, `code`, `data`, `headers` (`Headers\|null`), `response` (`Response\|null`), `config`, `attempts`, `cause?`.

Codes: `EHTTP` (status error), `ENETWORK`, `ETIMEDOUT`, `EABORT`, `EOFFLINE`, `EPARSE`, `EINTERCEPTOR`, `EUNKNOWN`.

| Getter | Type | Description |
|---|---|---|
| `isTimeout` | `boolean` | `code === 'ETIMEDOUT'` |
| `isAbort` | `boolean` | `code === 'EABORT'` |
| `isNetwork` | `boolean` | `code === 'ENETWORK' \|\| code === 'EOFFLINE'` |
| `isOffline` | `boolean` | `code === 'EOFFLINE'` |
| `isClientError` | `boolean` | `400 ≤ status < 500` |
| `isServerError` | `boolean` | `status ≥ 500` |
| `userMessage` | `string` | Localized, user-facing message: server `data.message`/`.title`/`.error` (< 300 chars) first, else a translated message for timeout/offline/network/abort/HTTP status (`http.status.<code>`), else `http.error`. |

Method: `toJSON()` → `{ name, message, status, code, data, url, method }`.

## `Orion.http.mock`

In-memory mock server; every route is consulted by every `Orion.http` instance (built-in and `.create()`d).

`Orion.http.mock(routes?, opts?) -> server`. `opts`: `{ delay=0, passthrough=true }` (per-server defaults).

Route object: `{ method?, url (pattern), status=200, response?(req)=>body, reply?(req)=>[status, body, headers?], fail?: number (fail N times first), failStatus?, failBody?, error?: 'network'|'timeout', delay?: ms | [min,max], headers?, times?: max invocations, body? }`.
Object form is also accepted: `Orion.http.mock({ 'GET /api/users': [...], 'POST /api/users': req => ({ ok: true }) })`,
as is the tuple form `Orion.http.mock([['GET /api/users', req => [...]], ['POST /api/users', req => ({ ok: true })]])`.
Anything that is not a route object, a `"METHOD /path"` map or such a tuple throws a `TypeError` — it used to become a
silent catch-all route.

URL pattern syntax: `/abs/path/:param` (matches the full pathname, `:param` captured), `relative/path` (pathname suffix), `https://host/path` (absolute prefix), `*`/`**` wildcards, a `RegExp`, or `fn(url, URL) => boolean`.

`mreq` passed to `response`/`reply`: `{ method, url, path, query, params, headers, body (parsed), raw, config, attempt }`.

| Server member | Description |
|---|---|
| `.add(route \| route[] \| objectForm)` | Adds route(s); chainable. |
| `.remove(route \| url)` | Removes a route. |
| `.reset()` | Clears `.calls` and hit/fail counters. |
| `.restore()` | Unregisters the server entirely. |
| `.calls` | `{ method, url, path, body, headers, time, route }[]` — every matched request, in order. |
| `.routes` | Registered route objects. |
| `.options` | `{ delay, passthrough }`. |

`Orion.http.mock.response(status, body, headers?)` → `Response` (same body/header encoding the mock server uses).

## DOM behaviors

### `data-o-ajax` (on a `<form>`)

Submits the form through `Orion.http` instead of a full navigation (JSON body by default, or `FormData` when the
form has files or `enctype="multipart/form-data"`).

| Attribute | Notes |
|---|---|
| `data-o-ajax` | Enables the behavior. Value `"json"` forces JSON; `"auto"`/empty picks JSON unless the form has files. |
| `data-o-ajax-method` | Overrides `<form method>` / `formmethod`. |
| `data-o-ajax-toast` | Present → show a success message (empty = server `data.message` or `"Saved"`) via `[data-o-ajax-message]` or `Orion.toast`. |
| `data-o-ajax-reset` | Reset the form after success. |
| `data-o-ajax-redirect` | `location.assign()` after success: attribute value, or `data.redirect` from the response when empty. |
| `data-o-ajax-offline` | Sets `offline: 'queue'` (queues the mutation via `Orion.offline` when offline/network fails). |
| `data-o-ajax-retry` | Retry count. |
| `data-o-ajax-timeout` | Timeout in ms. |
| `data-o-ajax-loader` | Sets `loader: true`. |
| `data-o-ajax-target` | Selector; swapped with `innerHTML` when the response `data` is a string (sanitized unless `data-o-trusted`). |
| `data-o-trusted` | Skip HTML sanitization for `data-o-ajax-target`. |
| `[data-o-ajax-message]` (descendant) | Status box: filled with the success/error message and an `o-alert-*` class instead of a toast. |

On a `422`-style error, field errors (Laravel/Rails/ASP.NET ProblemDetails/express-validator shapes) are extracted
and applied to matching `[name]` controls: `.is-invalid` + a `.o-error` message + `aria-describedby`.

Events (on the `<form>`, bubble/composed): `o-ajax-before` (**cancelable**, `{ config, form, submitter }` — mutate `config` or veto), `o-ajax-success` (`{ data, response, form, queued }`), `o-ajax-error` (**cancelable** — prevents default error UI; `{ error, errors, status, form }`).

### `data-o-load` (any element)

| Attribute | Notes |
|---|---|
| `data-o-load` | The URL to fetch. |
| `data-o-trigger` | Comma list: `load` (default on non-interactive elements) \| `click` (default on `a`/`button`/`[role=button]`) \| `visible`/`revealed` (IntersectionObserver, once) \| `every <n>(ms\|s\|m\|h)` (polling; skipped while hidden/offline) \| any DOM event name. |
| `data-o-target` | Selector for the element to update (default: self). |
| `data-o-select` | CSS selector applied to the fetched HTML before swapping (keeps matching elements' `outerHTML`). |
| `data-o-swap` | `inner` (default) \| `append` \| `prepend` \| `outer`. |
| `data-o-trusted` | Skip sanitization. |
| `data-o-skeleton` | Number of skeleton rows shown while loading into an empty target (default 3; `0` disables). |
| `data-o-announce` | Announce completion via `announce()` (value = custom message). |

Sets `aria-busy`, `.is-loading`, and afterwards `data-o-loaded` (ISO timestamp) or `data-o-load-error` (status/code, with a retry button rendered into an empty target).

Events (on the target): `o-load-before` (**cancelable**, `{ url, options }`), `o-load` (`{ url, html }`), `o-load-error` (`{ url, error }`).

### Related JS API

| Member | Signature | Description |
|---|---|---|
| `Orion.http.load(target, url, opts?)` | `(target, url, LoadOptions) => Promise<string \| null>` | Programmatic form of `data-o-load` (`LoadOptions`: `{ swap, skeleton, trusted, select, quiet, announce, http }`). |
| `Orion.http.formToObject(formData)` | `(FormData) => Object` | Repeated keys / `name[]` → arrays; `a.b` / `a[b]` → nested objects. |
| `Orion.http.extractErrors(data)` | `(data) => { [field]: string } \| null` | Normalizes Laravel/Rails/ASP.NET/express-validator error payloads. |
| `Orion.http.submitForm(form, submitter?)` | `(form: Element \| selector, submitter?) => Promise<void>` | Programmatic `data-o-ajax` submit. |

## Storage keys

None directly; `offline: 'queue'` / `data-o-ajax-offline` persist through `Orion.offline.queue` — see
[`../offline/README.md`](../offline/README.md) for its storage keys.
