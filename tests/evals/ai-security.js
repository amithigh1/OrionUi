/* ai-security.js — the non-negotiable security rules from the brief:
 *   - a vendor adapter (anthropic / openAICompatible) with an apiKey but no dangerouslyAllowBrowser THROWS
 *   - the same call WITH dangerouslyAllowBrowser: true logs a console.warn (every time)
 *   - the documented default (Orion.ai.http pointed at your own backend) sends a request to that exact URL,
 *     captured here by replacing window.fetch — no real network call is made.
 *   node build/check.mjs docs/components/ai.html --bundle=.tmp/ai/orion.js "--eval=@tests/evals/ai-security.js"
 */
(async () => {
  const out = {};

  // (1) refused without the opt-in, for both vendor adapters
  let anthropicMsg = null, openAiMsg = null;
  try { Orion.ai.anthropic({ apiKey: 'sk-test-not-real' }); } catch (e) { anthropicMsg = e.message; }
  try { Orion.ai.openAICompatible({ apiKey: 'sk-test-not-real' }); } catch (e) { openAiMsg = e.message; }
  out.anthropicRefused = /dangerouslyAllowBrowser/.test(anthropicMsg || '');
  out.openAiRefused = /dangerouslyAllowBrowser/.test(openAiMsg || '');

  // (2) the opt-in works, but warns every time
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...a) => warnings.push(a.join(' '));
  let anthropicOk = false, openAiOk = false;
  try { Orion.ai.anthropic({ apiKey: 'sk-test-not-real', dangerouslyAllowBrowser: true }); anthropicOk = true; } catch { /* left false */ }
  try { Orion.ai.openAICompatible({ apiKey: 'sk-test-not-real', dangerouslyAllowBrowser: true, url: 'https://api.example.com/v1/chat/completions' }); openAiOk = true; } catch { /* left false */ }
  console.warn = origWarn;
  out.optInSucceeds = anthropicOk && openAiOk;
  out.warnedEachTime = warnings.length === 2 && warnings.every(w => /dangerouslyAllowBrowser/i.test(w) && /expose/i.test(w));

  // (3) the documented default: point Orion.ai.http() at your own proxy — a mocked fetch captures the request
  const calls = [];
  const origFetch = window.fetch;
  window.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: (opts && opts.method) || 'GET', body: opts && opts.body });
    return new Response(JSON.stringify({ text: 'proxied ok' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  Orion.ai.configure({ provider: Orion.ai.http({ url: '/api/ai/chat' }) });
  let reply = null, fetchErr = null;
  try { reply = await Orion.ai.chat([{ role: 'user', content: 'hi' }]); } catch (e) { fetchErr = e.message; }
  window.fetch = origFetch;
  out.proxyUrlUsed = calls.length === 1 && calls[0].url === '/api/ai/chat' && calls[0].method === 'POST';
  out.proxyReplyOk = reply === 'proxied ok' && fetchErr === null;

  out.ok = out.anthropicRefused && out.openAiRefused && out.optInSucceeds && out.warnedEachTime && out.proxyUrlUsed && out.proxyReplyOk;
  return out;
})()
