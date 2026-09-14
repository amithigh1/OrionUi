/* ai-stream-abort.js — Orion.ai.stream(): onToken fires in order (matches the mock's known reply, and matches
 * the generator's own yield order), an AbortSignal passed in aborts mid-stream, and it.cancel() does too.
 * Mock provider only — no network.
 *   node build/check.mjs docs/components/ai.html --bundle=.tmp/ai/orion.js "--eval=@tests/evals/ai-stream-abort.js"
 */
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  Orion.ai.configure({ provider: Orion.ai.mock({ latency: 15, speed: 4 }) });

  // (1) onToken fires once per chunk, in order — reconstructs the mock's exact known greeting text, and
  // matches consuming the async generator directly (same call, both views must agree).
  const tokens = [];
  const it0 = Orion.ai.stream([{ role: 'user', content: 'hello there friend' }], { onToken: tok => tokens.push(tok) });
  let full0 = '';
  for await (const tok of it0) full0 += tok;
  const expectedGreeting = "Hello! This response is generated locally by `Orion.ai.mock()` so the demo works without a network call. What would you like to do?";
  const inOrder = tokens.length > 1 && tokens.join('') === full0 && full0 === expectedGreeting;

  // (2) an AbortSignal passed in aborts mid-stream: the generator throws AbortError and stops early.
  const controller = new AbortController();
  const chunks = [];
  let abortErrName = null;
  const it1 = Orion.ai.stream([{ role: 'user', content: 'this is a longer message to stream over several tokens please describe it' }], {
    signal: controller.signal,
    onToken: tok => { chunks.push(tok); if (chunks.length === 3) controller.abort(); },
  });
  try { for await (const _tok of it1) { /* driven by onToken above */ } }
  catch (err) { abortErrName = err && err.name; }
  const abortedMidStream = abortErrName === 'AbortError' && chunks.length >= 3 && chunks.length <= 6;

  // (3) it.cancel(reason) aborts the same way, callable without ever having awaited a chunk.
  const it2 = Orion.ai.stream([{ role: 'user', content: 'another longer message across many different tokens for the cancel method test' }]);
  let cancelErrName = null;
  const consuming = (async () => { try { for await (const _tok of it2) { /* noop */ } } catch (err) { cancelErrName = err && err.name; } })();
  it2.cancel('test-cancel');
  await consuming;
  const cancelMethodAborts = cancelErrName === 'AbortError';

  const ok = inOrder && abortedMidStream && cancelMethodAborts;
  return {
    ok, inOrder, tokensLength: tokens.length, full0,
    abortedMidStream, abortErrName, chunksBeforeAbort: chunks.length,
    cancelMethodAborts, cancelErrName,
  };
})()
