/* ============================================================================
 * Orion.ai.summarize(input, opts) / .rewrite(input, opts) / .translate(input, opts)
 * Thin, promise-returning wrappers around Orion.ai.tasks.{summarize,rewrite,translate} + Orion.ai.chat,
 * accepting a string, a form field / element (its .value or .textContent), or a selection's text.
 *   Orion.ai.summarize(text | element, { length: 'short'|'medium'|'long', format: 'paragraph'|'bullets', ...chatOpts })
 *   Orion.ai.rewrite(text | element, { instruction, ...chatOpts })
 *   Orion.ai.translate(text | element, { to: 'French', ...chatOpts })
 * `chatOpts` (signal, provider, onToken, retries, …) pass straight through to Orion.ai.chat/stream.
 * All three need the "ai" component (Orion.ai) and throw the same "no provider configured" error
 * as Orion.ai.chat() when none is set — call Orion.ai.configure({ provider: Orion.ai.mock() }) first.
 * ========================================================================== */
function __aitRequireAI(name) {
  if (!O.ai) throw new Error(`[Orion] Orion.ai.${name}() requires the "ai" component (Orion.ai) — include it in your build.`);
  return O.ai;
}
async function __aitRunTask(name, input, opts = {}) {
  const AI = __aitRequireAI(name);
  const { system, messages } = AI.tasks[name](aitTextOf(input), opts);
  // `task`/`options` are re-attached (Orion.ai.tasks.*() only returns { system, messages }) so the
  // mock provider's per-task canned replies (and any real provider that logs/branches on task) see them.
  const callOpts = { ...opts, system, task: name, options: opts };
  if (isFn(opts.onToken)) {
    let full = '';
    for await (const tok of AI.stream(messages, callOpts)) full += tok;
    return full;
  }
  return AI.chat(messages, callOpts);
}
/** Orion.ai.summarize(text|element, { length, format, ... }) -> Promise<string> */
function aitSummarize(input, opts = {}) { return __aitRunTask('summarize', input, opts); }
/** Orion.ai.rewrite(text|element, { instruction, ... }) -> Promise<string> */
function aitRewrite(input, opts = {}) { return __aitRunTask('rewrite', input, opts); }
/** Orion.ai.translate(text|element, { to, ... }) -> Promise<string> */
function aitTranslate(input, opts = {}) { return __aitRunTask('translate', input, opts); }
