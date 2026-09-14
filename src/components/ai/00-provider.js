/* ============================================================================
 * Orion.ai — provider layer (bring-your-own-backend AI for Orion Admin)
 *
 *   Orion.ai.configure({ provider })            provider: async (ctx) => string | AsyncIterable<string>
 *   Orion.ai.chat(messages, opts) -> Promise<string>
 *   Orion.ai.stream(messages, opts) -> AsyncIterable<string>  (+ opts.onToken, .cancel(), .controller)
 *   Orion.ai.complete(prompt, opts) -> Promise<string>
 *   Orion.ai.tasks.{summarize,rewrite,translate,extract,classify}(input, options) -> { system, messages }
 *
 * SECURITY: this library never ships or requires an API key. Point adapters at your own backend
 * proxy. A direct-to-vendor call only happens when the developer explicitly passes a key AND
 * dangerouslyAllowBrowser: true (see 10-adapters.js).
 * ========================================================================== */
i18n.add('en', {
  ai: {
    error: 'Something went wrong talking to the assistant.', retry: 'Retry', aborted: 'Stopped.',
    noProvider: 'No AI provider configured. Call Orion.ai.configure({ provider }) — Orion.ai.mock() works offline.',
  },
});

let __provider = null;
let __defaults = {};

/** Orion.ai.configure({ provider, ...defaults }) or Orion.ai.configure(providerFn) */
function aiConfigure(opts = {}) {
  if (isFn(opts)) { __provider = opts; return O.ai; }
  if (opts.provider) __provider = opts.provider;
  const { provider, ...rest } = opts;
  __defaults = { ...__defaults, ...rest };
  return O.ai;
}
function aiProvider(override) {
  const p = override || __provider;
  if (!p) { const e = new Error(t('ai.noProvider')); e.code = 'no-provider'; throw e; }
  return p;
}

/** Best-effort plain text from a string, form control, element or { text } object. */
function aiTextOf(input) {
  if (input == null) return '';
  if (isStr(input)) return input;
  if (isNum(input)) return String(input);
  if (input.nodeType === 1) return 'value' in input ? String(input.value ?? '') : (input.textContent || '');
  if (isObj(input) && isStr(input.text)) return input.text;
  return String(input);
}
function aiTruncate(s, max = 12000) {
  s = String(s ?? '');
  return s.length > max ? s.slice(0, max) + `\n…[truncated ${s.length - max} characters]` : s;
}

/** ── overridable prompt templates ─────────────────────────────────────── */
const aiTasks = {
  summarize(input, options = {}) {
    const len = options.length || 'medium';
    const format = options.format || 'paragraph';
    const lenHint = { short: 'Summarize in 1-2 sentences.', medium: 'Summarize in a short paragraph (3-5 sentences).', long: 'Write a detailed, multi-paragraph summary covering every important point.' }[len]
      || 'Summarize in a short paragraph.';
    const fmtHint = format === 'bullets' || format === 'key-points' ? ' Present it as concise bullet points (use "- " list items).' : '';
    return {
      system: 'You are a precise summarization assistant. Be faithful to the source; never invent facts. Reply with the summary only, no preamble.',
      messages: [{ role: 'user', content: `${lenHint}${fmtHint}\n\n---\n${aiTruncate(aiTextOf(input))}` }],
    };
  },
  rewrite(input, options = {}) {
    const instruction = options.instruction || 'Improve clarity, grammar and flow while preserving the original meaning and tone.';
    return {
      system: 'You are a careful writing assistant. Reply with only the rewritten text — no preamble, no explanation, no quotes around it.',
      messages: [{ role: 'user', content: `${instruction}\n\n---\n${aiTruncate(aiTextOf(input))}` }],
    };
  },
  translate(input, options = {}) {
    const target = options.to || options.target || 'English';
    return {
      system: `You are a professional translator. Translate the text to ${target}, preserving tone and formatting. Reply with only the translation.`,
      messages: [{ role: 'user', content: aiTruncate(aiTextOf(input)) }],
    };
  },
  extract(input, options = {}) {
    const fields = options.fields || [];
    const schema = fields.length
      ? fields.map(f => `- ${f.name || f}${f.type ? ` (${f.type})` : ''}${f.description ? `: ${f.description}` : ''}`).join('\n')
      : '(no field list given — infer sensible fields from the text)';
    return {
      system: 'You extract structured data. Reply with ONLY a strict JSON object (no markdown fences, no prose) whose keys are exactly the requested field names. Use null for a field you cannot find.',
      messages: [{ role: 'user', content: `Fields to extract:\n${schema}\n\nText:\n${aiTruncate(aiTextOf(input))}` }],
    };
  },
  classify(input, options = {}) {
    const labels = options.labels || [];
    return {
      system: 'You are a precise text classifier. Reply with exactly one label from the allowed list and nothing else.',
      messages: [{ role: 'user', content: `Allowed labels: ${labels.join(', ') || '(none given)'}\n\nText:\n${aiTruncate(aiTextOf(input))}` }],
    };
  },
};

function aiBuildTask(task, input, options) {
  const fn = aiTasks[task];
  if (!isFn(fn)) throw new Error(`[Orion] Orion.ai: unknown task "${task}"`);
  return fn(input, options || {});
}

function aiIsRetryable(err) {
  if (!err || err.name === 'AbortError') return false;
  const s = err.status;
  if (s === 429 || (typeof s === 'number' && s >= 500)) return true;
  return err.name === 'TypeError'; // fetch network failure
}
async function aiWithRetry(fn, { retries = 2, retryDelay = 500 } = {}) {
  let attempt = 0;
  for (;;) {
    try { return await fn(); }
    catch (err) {
      if (attempt >= retries || !aiIsRetryable(err)) throw err;
      await sleep(retryDelay * 2 ** attempt + Math.random() * 200);
      attempt++;
    }
  }
}
function aiMergeSignal(userSignal, controller) {
  if (userSignal) {
    if (userSignal.aborted) controller.abort();
    else userSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

/** Core call shared by chat/stream/complete and every aitools feature. */
function aiRun(opts = {}) {
  opts = { ...__defaults, ...opts };
  const { task, input, options = {} } = opts;
  let { messages, system } = opts;
  if (!messages && task) {
    const built = aiBuildTask(task, input, options);
    messages = built.messages;
    if (system == null) system = built.system;
  }
  messages = messages || [];
  const provider = aiProvider(opts.provider);
  const controller = new AbortController();
  const signal = aiMergeSignal(opts.signal, controller);
  const ctx = { messages, system, task, input, stream: !!opts.stream, signal, options };
  const promise = aiWithRetry(() => provider(ctx), opts);
  return { promise, controller, ctx };
}

/** Orion.ai.chat(messages, opts) -> Promise<string> */
async function aiChat(messages, opts = {}) {
  const { promise } = aiRun({ ...opts, messages, stream: false });
  const result = await promise;
  if (isStr(result)) return result;
  let out = '';
  for await (const tok of result) out += tok;
  return out;
}
/** Orion.ai.complete(prompt, opts) -> Promise<string> */
function aiComplete(prompt, opts = {}) { return aiChat([{ role: 'user', content: String(prompt ?? '') }], opts); }

/**
 * Orion.ai.stream(messages, opts) -> AsyncGenerator<string>
 * opts.onToken(token, fullTextSoFar) fires as the returned generator is iterated.
 * The generator also exposes .cancel(reason) and .controller (AbortController).
 */
function aiStream(messages, opts = {}) {
  const { promise, controller } = aiRun({ ...opts, messages, stream: true });
  const onToken = opts.onToken;
  async function* gen() {
    const result = await promise;
    if (isStr(result)) { if (result) { onToken?.(result, result); yield result; } return; }
    let full = '';
    for await (const tok of result) {
      if (!tok) continue;
      full += tok;
      onToken?.(tok, full);
      yield tok;
    }
  }
  const it = gen();
  it.cancel = reason => controller.abort(reason);
  it.controller = controller;
  return it;
}
