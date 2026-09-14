# ai — `Orion.ai`

A provider-agnostic AI client: one `chat()`/`stream()` call that works against your own backend proxy, an
OpenAI-compatible endpoint, Anthropic's Messages API, or the built-in offline **mock** provider — with retries,
abort, reusable prompt "tasks", and a safe Markdown renderer for replies. `<o-chatbot>`, `<o-assistant>`
(`assistant` package) and every helper in the `aitools` package (ghost-text, summarize, fill-form, analyze, AI
search) are built entirely on this API — none of them talk to `fetch`/a vendor SDK directly.

Docs: `docs/components/ai.html`. No custom elements — this package is a pure JS service (`Orion.ai`).

## Files

| File | Contents |
|---|---|
| `00-provider.js` | `configure`, `chat`, `stream`, `complete`, `tasks` (summarize/rewrite/translate/extract/classify), retry + abort plumbing |
| `10-adapters.js` | `http`, `openAICompatible`, `anthropic`, `mock` adapters; `sseEvents`/`ndjsonEvents` stream parsers |
| `20-markdown.js` | `markdown(text)` — sanitized Markdown → HTML renderer for AI replies, with a code-block copy button |
| `30-api.js` | Assembles the public `Orion.ai` namespace |
| `ai.css` | Styling for `markdown()`'s output: code blocks, copy button, task-list checkboxes |

## Security model (non-negotiable)

- The bundle ships **no third-party code and no API keys**, ever.
- The documented default is your **own backend proxy**: `Orion.ai.http({ url: '/api/ai' })` (or
  `Orion.ai.openAICompatible({ url: '/api/ai/chat' })` without an `apiKey`) — the proxy attaches the real key
  server-side, so the browser never sees it.
- Calling a vendor's API **directly from the browser** (`Orion.ai.anthropic()` / `Orion.ai.openAICompatible()`
  with an `apiKey`) **throws** unless you also pass `dangerouslyAllowBrowser: true`, and even then logs a
  `console.warn` on every call, because any visitor can read the key from the network tab.
- `Orion.ai.mock()` is a deterministic, fully offline provider used by every doc demo and the eval tests in
  `tests/evals/ai-*.js` — no test ever needs a network mock/proxy of its own.

## API

```ts
Orion.ai.configure(opts: { provider: Provider, ...defaults } | Provider): typeof Orion.ai;
Orion.ai.chat(messages: Message[], opts?: CallOpts): Promise<string>;
Orion.ai.stream(messages: Message[], opts?: CallOpts & { onToken?(token: string, fullSoFar: string): void }): AsyncGenerator<string> & { cancel(reason?): void; controller: AbortController };
Orion.ai.complete(prompt: string, opts?: CallOpts): Promise<string>;               // chat() with one user message
Orion.ai.tasks.summarize(input, { length?: 'short'|'medium'|'long', format?: 'paragraph'|'bullets' }): { system, messages };
Orion.ai.tasks.rewrite(input, { instruction? }): { system, messages };
Orion.ai.tasks.translate(input, { to? }): { system, messages };
Orion.ai.tasks.extract(input, { fields?: (string | { name, type?, description? })[] }): { system, messages };  // reply is strict JSON
Orion.ai.tasks.classify(input, { labels?: string[] }): { system, messages };
Orion.ai.markdown(text: string): SafeHTML;                                        // sanitized, safe to insert with innerHTML

Orion.ai.http(cfg: { url, headers?, body?, parse?, stream?: 'sse'|'ndjson'|'text'|false, streamParse? }): Provider;
Orion.ai.openAICompatible(cfg: { url?, model?, headers?, apiKey?, dangerouslyAllowBrowser? }): Provider;
Orion.ai.anthropic(cfg: { url?, model?, headers?, apiKey?, dangerouslyAllowBrowser?, version? }): Provider;
Orion.ai.mock(cfg?: { latency?: number, speed?: number, responses?: Fn | Record<string, string | Fn> }): Provider;
Orion.ai.sseEvents(chunks: AsyncIterable<string>): Promise<{ event, data }[]>;
Orion.ai.ndjsonEvents(chunks: AsyncIterable<string>): Promise<object[]>;
Orion.ai.provider;   // read-only getter — the currently configured provider, or null

type Provider = (ctx: { messages, system, task, input, stream, signal, options }) => Promise<string | AsyncIterable<string>>;
type CallOpts = { system?, signal?: AbortSignal, provider?: Provider, retries?: number /* default 2 */, retryDelay?: number /* default 500 */, task?: string, options?: object };
```

`tasks.*` are plain functions on a mutable object — override one (`Orion.ai.tasks.summarize = mine`) or add your
own; callers usually do `const { system, messages } = Orion.ai.tasks.summarize(text, opts); await
Orion.ai.chat(messages, { system, task: 'summarize', options: opts })` (passing `task`/`options` back in lets a
custom provider — or the mock — branch on which task produced the prompt).

`chat()`/`stream()` merge `signal` with an internal `AbortController`, so either the caller's signal or
`it.cancel()`/`it.controller.abort()` stops generation. Transient failures (`429`, `5xx`, network `TypeError`)
retry with jittered backoff (`retries`/`retryDelay`); `AbortError` never retries. `stream()`'s `onToken` fires
once per chunk in order as the returned async generator is iterated (or immediately, once, for a non-streaming
provider that resolved a plain string).

## `Orion.ai.mock({ latency, speed, responses })`

Waits `latency` ms (default 450) then streams the reply token by token, paced by `speed` ms/token (default 26).
`responses`:
- a function `(userText, ctx) => string | null` — return `null`/`undefined` to fall through to the built-in default;
- or a map `{ [keyword]: string | fn, task: string | fn, default: string | fn }` — matched by `ctx.task` first,
  then by the keyword appearing in the user's text, then `default`.

The built-in default recognizes `ctx.task` (`summarize`/`rewrite`/`translate`/`classify`/`extract` — `extract`
replies with real JSON built from `ctx.options.fields`, guessing sensible values by field name/type) and
otherwise gives a short, clearly-labeled canned conversational reply.

## Limitations

- No `embed()` / vector-embedding support and no built-in token/cost accounting hooks — not implemented by the
  previous author and out of scope for this pass; see "Proposed changes outside my scope" in the finishing
  agent's report if you want these added.
- `markdown()` is a small hand-rolled renderer (not a full CommonMark implementation): one level of nested lists,
  no footnotes/definition lists. Every character is escaped before markup generation and the final HTML is
  always passed through `sanitize()`, so untrusted model output is never executed as script.
- Adapters assume a JSON request body; a backend that needs a different shape should use `Orion.ai.http()`'s
  `body`/`parse`/`streamParse` functions directly rather than `openAICompatible()`/`anthropic()`.
