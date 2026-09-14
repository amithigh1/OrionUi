/* ============================================================================
 * Orion.ai adapters — turn a URL (your backend) or canned data into a provider function.
 *   Orion.ai.http({ url, headers, body, parse, stream: 'sse'|'ndjson'|'text'|false, streamParse })
 *   Orion.ai.openAICompatible({ url, model, headers })   chat/completions style SSE deltas
 *   Orion.ai.anthropic({ url, model, headers, dangerouslyAllowBrowser })   Messages API SSE
 *   Orion.ai.mock({ latency, speed, responses })          deterministic, offline, used by every demo
 *   Orion.ai.sseEvents(chunks) / Orion.ai.ndjsonEvents(chunks)   low-level stream parsers
 * ========================================================================== */

/** Split an SSE "event:/data:" block into { event, data }. Multiple `data:` lines are joined with \n. */
function __sseBlock(block) {
  let event = 'message'; const data = [];
  for (const line of block.split(/\r\n|\n/)) {
    if (!line || line[0] === ':') continue;
    const i = line.indexOf(':');
    const field = i < 0 ? line : line.slice(0, i);
    let value = i < 0 ? '' : line.slice(i + 1);
    if (value[0] === ' ') value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  return data.length ? { event, data: data.join('\n') } : null;
}
/** sseEvents(chunkIterable) -> AsyncGenerator<{event,data}> — buffers across chunk boundaries. */
async function sseEvents(chunks) {
  let buf = '';
  const out = [];
  for await (const chunk of chunks) {
    buf += chunk;
    for (;;) {
      const i = buf.indexOf('\n\n'); const j = buf.indexOf('\r\n\r\n');
      const useCRLF = j >= 0 && (i < 0 || j < i);
      const idx = useCRLF ? j : i;
      if (idx < 0) break;
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + (useCRLF ? 4 : 2));
      const ev = __sseBlock(raw);
      if (ev) out.push(ev);
    }
  }
  if (buf.trim()) { const ev = __sseBlock(buf); if (ev) out.push(ev); }
  return out;
}
/** ndjsonEvents(chunkIterable) -> Promise<object[]> — one JSON value per line, buffers across chunks. */
async function ndjsonEvents(chunks) {
  let buf = ''; const out = [];
  for await (const chunk of chunks) {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
      if (line) { try { out.push(JSON.parse(line)); } catch { /* skip malformed line */ } }
    }
  }
  const last = buf.trim();
  if (last) { try { out.push(JSON.parse(last)); } catch { /* ignore */ } }
  return out;
}
/** Streaming variants used internally: yield events as they complete instead of buffering everything. */
async function* sseEventStream(chunks) {
  let buf = '';
  for await (const chunk of chunks) {
    buf += chunk;
    for (;;) {
      const i = buf.indexOf('\n\n'); const j = buf.indexOf('\r\n\r\n');
      const useCRLF = j >= 0 && (i < 0 || j < i);
      const idx = useCRLF ? j : i;
      if (idx < 0) break;
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + (useCRLF ? 4 : 2));
      const ev = __sseBlock(raw);
      if (ev) yield ev;
    }
  }
  if (buf.trim()) { const ev = __sseBlock(buf); if (ev) yield ev; }
}
async function* ndjsonEventStream(chunks) {
  let buf = '';
  for await (const chunk of chunks) {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
      if (line) { try { yield JSON.parse(line); } catch { /* skip malformed line */ } }
    }
  }
  const last = buf.trim();
  if (last) { try { yield JSON.parse(last); } catch { /* ignore */ } }
}

/** Read a fetch Response body as an async iterable of decoded text chunks. */
async function* __readChunks(res) {
  if (!res.body || !res.body.getReader) { yield await res.text(); return; }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
  } finally { try { reader.releaseLock(); } catch { /* ignore */ } }
}

/**
 * Orion.ai.http({ url, headers, body, parse, stream, streamParse }) -> provider
 * A generic adapter for YOUR OWN backend proxy. `url`/`headers`/`body` may be values or
 * functions of the call context ({ messages, system, task, input, stream, signal, options }).
 */
function httpAdapter(cfg = {}) {
  const { url, headers, body, parse, stream = false, streamParse } = cfg;
  return async function httpProvider(ctx) {
    if (!url) throw new Error('[Orion] Orion.ai.http: "url" is required — point it at your own backend proxy.');
    const finalUrl = isFn(url) ? url(ctx) : url;
    const finalHeaders = { 'content-type': 'application/json', ...(isFn(headers) ? headers(ctx) : headers) };
    const finalBody = isFn(body) ? body(ctx) : { messages: ctx.messages, system: ctx.system, task: ctx.task, stream: ctx.stream, ...(body || {}) };
    let res;
    try {
      res = await fetch(finalUrl, { method: 'POST', headers: finalHeaders, body: JSON.stringify(finalBody), signal: ctx.signal });
    } catch (err) { if (err.name === 'AbortError') throw err; const e = new Error('[Orion] Orion.ai: network error — ' + err.message); e.cause = err; throw e; }
    if (!res.ok) {
      let bodyText = ''; try { bodyText = await res.text(); } catch { /* ignore */ }
      const err = new Error(`[Orion] Orion.ai: request failed (${res.status})`);
      err.status = res.status; err.body = bodyText;
      throw err;
    }
    if (!ctx.stream || stream === false) {
      let json;
      try { json = await res.json(); } catch { json = { text: await res.text().catch(() => '') }; }
      return isFn(parse) ? parse(json, ctx) : String(json.text ?? json.output ?? json.content ?? json.message ?? '');
    }
    const chunks = __readChunks(res);
    if (stream === 'text') return chunks;
    const events = stream === 'ndjson' ? ndjsonEventStream(chunks) : sseEventStream(chunks);
    return (async function* () {
      for await (const ev of events) {
        const token = isFn(streamParse) ? streamParse(ev, ctx) : (stream === 'ndjson' ? String(ev?.text ?? ev?.delta ?? '') : String(ev?.data ?? ''));
        if (token) yield token;
      }
    })();
  };
}

/**
 * Orion.ai.openAICompatible({ url, model, headers, dangerouslyAllowBrowser, apiKey }) — /chat/completions
 * shaped backend (SSE deltas). Point `url` at your own backend proxy (recommended — the default). Calling
 * a vendor's /chat/completions endpoint straight from the browser requires apiKey AND
 * dangerouslyAllowBrowser: true, same as Orion.ai.anthropic() — every visitor could otherwise read the key
 * from the network tab.
 */
function openAICompatibleAdapter(cfg = {}) {
  const { model = 'gpt-4o-mini', apiKey, dangerouslyAllowBrowser = false } = cfg;
  let { url, headers } = cfg;
  if (apiKey) {
    if (!dangerouslyAllowBrowser) {
      throw new Error('[Orion] Orion.ai.openAICompatible(): an apiKey was given but dangerouslyAllowBrowser is not true. '
        + 'Calling a vendor API directly from a browser exposes the key to every visitor. Route requests through your '
        + 'own backend (recommended) or opt in explicitly with dangerouslyAllowBrowser: true.');
    }
    console.warn('[Orion] Orion.ai.openAICompatible(): calling a vendor endpoint directly from the browser (dangerouslyAllowBrowser: true) '
      + 'exposes your API key to every visitor via the network tab. This is not recommended for production — route requests '
      + 'through your own backend proxy instead.');
    const extra = headers;
    headers = ctx => ({ Authorization: `Bearer ${apiKey}`, ...(isFn(extra) ? extra(ctx) : extra) });
  }
  if (!url) throw new Error('[Orion] Orion.ai.openAICompatible(): "url" is required — point it at your backend proxy, or pass apiKey + dangerouslyAllowBrowser: true.');
  return httpAdapter({
    url, headers,
    body: ctx => ({
      model: isFn(model) ? model(ctx) : model,
      messages: [...(ctx.system ? [{ role: 'system', content: ctx.system }] : []), ...ctx.messages],
      stream: !!ctx.stream,
      ...(ctx.options?.temperature != null ? { temperature: ctx.options.temperature } : {}),
    }),
    parse: json => json.choices?.[0]?.message?.content ?? '',
    stream: 'sse',
    streamParse: ev => {
      if (ev.data === '[DONE]') return null;
      try { return JSON.parse(ev.data).choices?.[0]?.delta?.content || ''; } catch { return ''; }
    },
  });
}

/**
 * Orion.ai.anthropic({ url, model, headers, dangerouslyAllowBrowser, apiKey }) — Claude Messages API SSE.
 * SECURITY: without `url` you must pass your OWN backend proxy that forwards to Anthropic and attaches
 * the key server-side. Calling api.anthropic.com straight from the browser requires apiKey AND
 * dangerouslyAllowBrowser: true — every visitor could otherwise read your key from the network tab.
 */
function anthropicAdapter(cfg = {}) {
  const { model = 'claude-sonnet-5', apiKey, dangerouslyAllowBrowser = false, version = '2023-06-01' } = cfg;
  let { url, headers } = cfg;
  if (apiKey) {
    if (!dangerouslyAllowBrowser) {
      throw new Error('[Orion] Orion.ai.anthropic(): an apiKey was given but dangerouslyAllowBrowser is not true. '
        + 'Calling the Anthropic API directly from a browser exposes the key to every visitor. Route requests '
        + 'through your own backend (recommended) or opt in explicitly with dangerouslyAllowBrowser: true.');
    }
    console.warn('[Orion] Orion.ai.anthropic(): calling api.anthropic.com directly from the browser (dangerouslyAllowBrowser: true) '
      + 'exposes your API key to every visitor via the network tab. This is not recommended for production — route requests '
      + 'through your own backend proxy instead.');
    url = url || 'https://api.anthropic.com/v1/messages';
    const extra = headers;
    headers = ctx => ({ 'x-api-key': apiKey, 'anthropic-version': version, 'anthropic-dangerous-direct-browser-access': 'true', ...(isFn(extra) ? extra(ctx) : extra) });
  }
  if (!url) throw new Error('[Orion] Orion.ai.anthropic(): "url" is required — point it at your backend proxy, or pass apiKey + dangerouslyAllowBrowser: true.');
  return httpAdapter({
    url, headers,
    body: ctx => ({
      model: isFn(model) ? model(ctx) : model,
      max_tokens: ctx.options?.maxTokens || 4096,
      ...(ctx.system ? { system: ctx.system } : {}),
      messages: ctx.messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      stream: !!ctx.stream,
      ...(ctx.options?.temperature != null ? { temperature: ctx.options.temperature } : {}),
    }),
    parse: json => {
      if (json.stop_reason === 'refusal') {
        const e = new Error('[Orion] Orion.ai.anthropic: the model declined the request' + (json.stop_details?.explanation ? ' — ' + json.stop_details.explanation : '.'));
        e.refusal = json.stop_details; throw e;
      }
      return (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    },
    stream: 'sse',
    streamParse: ev => {
      if (ev.event === 'content_block_delta') {
        try { const j = JSON.parse(ev.data); return j.delta?.type === 'text_delta' ? j.delta.text : ''; } catch { return ''; }
      }
      if (ev.event === 'error') { try { const j = JSON.parse(ev.data); throw new Error('[Orion] Orion.ai.anthropic stream error: ' + (j.error?.message || ev.data)); } catch (e) { if (/anthropic stream error/i.test(e.message || '')) throw e; return ''; } }
      return '';
    },
  });
}

/* ── mock provider: deterministic, offline, "realistic" streaming ────── */
function __mockSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(__abortError()); return; }
    const tm = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(tm); reject(__abortError()); }, { once: true });
  });
}
function __abortError() { try { return new DOMException('The operation was aborted.', 'AbortError'); } catch { const e = new Error('Aborted'); e.name = 'AbortError'; return e; } }
function __lastUserText(messages) { for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') return String(messages[i].content ?? ''); return ''; }
function __tokenizeForStream(text) { return String(text).match(/\s*\S+|\s+/g) || [String(text)]; }

const __FAKE_WORDS = ['insight', 'summary', 'detail', 'context', 'trend', 'result', 'update', 'option', 'value', 'signal'];
function __mockExtractValue(field) {
  const name = String(field.name || field).toLowerCase();
  const type = (field.type || '').toLowerCase();
  if (type === 'boolean' || /^(is|has)[A-Z_]/i.test(name)) return true;
  if (type === 'number' || /(count|qty|quantity|amount|age|price|total|score)/.test(name)) return 42;
  if (/email/.test(name)) return 'name@example.com';
  if (/phone/.test(name)) return '+1 555 0100';
  if (/date/.test(name)) return new Date().toISOString().slice(0, 10);
  if (/(url|website|link)/.test(name)) return 'https://example.com';
  if (/name/.test(name)) return 'Jordan Lee';
  if (/(city|location)/.test(name)) return 'Kuala Lumpur';
  if (/country/.test(name)) return 'Malaysia';
  return __FAKE_WORDS[name.length % __FAKE_WORDS.length] + ' example';
}
function __mockExtractJSON(fields) {
  const out = {};
  for (const f of fields) out[isStr(f) ? f : (f.name || 'field')] = __mockExtractValue(f);
  return out;
}
function __defaultMockText(ctx) {
  const { task, options, userText } = ctx;
  if (task === 'summarize') return (options?.format === 'bullets' || options?.format === 'key-points')
    ? '- Key point one from the mock provider\n- Key point two, condensed for clarity\n- Key point three, the takeaway'
    : 'This is a concise mock summary highlighting the key points a real model would extract from the text.';
  if (task === 'translate') return `[mock translation → ${options?.to || options?.target || 'target language'}] ${aiTruncate(userText, 140)}`;
  if (task === 'rewrite') return aiTruncate(userText, 400).replace(/\s+/g, ' ').trim() + ' (rewritten for clarity by the mock provider.)';
  if (task === 'classify') return (options?.labels && options.labels[0]) || 'general';
  if (task === 'extract') return JSON.stringify(__mockExtractJSON(options?.fields || []));
  if (!userText) return "Hi! I'm a demo assistant running on Orion's mock provider — everything here works offline. Ask me anything.";
  const q = userText.toLowerCase();
  if (/^(hi|hello|hey)\b/.test(q)) return 'Hello! This response is generated locally by `Orion.ai.mock()` so the demo works without a network call. What would you like to do?';
  if (q.includes('?')) return `Good question. Since this is a **mock** provider, I can't look that up — wire up \`Orion.ai.configure({ provider })\` with your own backend to get real answers. In the meantime, here's a placeholder response about "${aiTruncate(userText, 60)}".`;
  return `I heard: "${aiTruncate(userText, 80)}". This is a canned response from the mock provider — swap in \`Orion.ai.configure()\` for real answers.`;
}
function __resolveMockResponse(v, ctx) { return isFn(v) ? String(v(ctx.userText, ctx) ?? '') : String(v); }
function __pickMockResponse(ctx) {
  const { responses, task, userText } = ctx;
  if (isFn(responses)) { const r = responses(userText, ctx); if (r != null) return String(r); }
  else if (isObj(responses)) {
    if (task && responses[task] != null) return __resolveMockResponse(responses[task], ctx);
    const q = (userText || '').toLowerCase();
    for (const key of Object.keys(responses)) {
      if (key === 'default' || !q) continue;
      if (q.includes(key.toLowerCase())) return __resolveMockResponse(responses[key], ctx);
    }
    if (responses.default != null) return __resolveMockResponse(responses.default, ctx);
  }
  return __defaultMockText(ctx);
}
/**
 * Orion.ai.mock({ latency, speed, responses }) — deterministic canned-response provider used by
 * every doc demo so they run fully offline. `responses` may be a function(userText, ctx) -> string,
 * or a map of { keyword: string | fn, task: string | fn, default: string | fn }.
 */
function mockAdapter(cfg = {}) {
  const { latency = 450, speed = 26, responses } = cfg;
  return async function mockProvider(ctx) {
    const userText = __lastUserText(ctx.messages) || (ctx.input != null ? aiTextOf(ctx.input) : '');
    const text = __pickMockResponse({ responses, task: ctx.task, userText, messages: ctx.messages, system: ctx.system, options: ctx.options });
    await __mockSleep(latency, ctx.signal);
    if (!ctx.stream) return text;
    return (async function* () {
      for (const tok of __tokenizeForStream(text)) {
        await __mockSleep(speed * 0.6 + Math.random() * speed, ctx.signal);
        yield tok;
      }
    })();
  };
}
