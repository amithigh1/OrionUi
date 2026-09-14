/* legacy-realtime.js — salvaged from .tmp/realtime-mock-eval.js (docs/components/realtime.html).
 * Orion.ws reconnect/heartbeat/message-queue via the built-in mock server, give-up after maxRetries,
 * Orion.sse reconnect, Orion.signalr protocol framing + a mock hub round trip, and Orion.poll
 * pause-when-hidden. Kept over .tmp/realtime-real-eval.js + .tmp/ws-server.mjs (dropped — that pairing
 * needs a manually-started external Node process on a fixed port, which tests/evals/run.mjs cannot
 * orchestrate automatically; this mock-based script gives the same reconnect/heartbeat coverage headlessly).
 */
(async () => {
  const out = {};

  const srv = Orion.realtime.mockServer('wss://demo.local/ws', (socket) => {
    socket.on('message', data => { const m = JSON.parse(data); if (m.type === 'ping') socket.send({ type: 'pong' }); else socket.send({ type: 'echo-ack', v: m }); });
  }, { latency: 5 });
  const ws = Orion.ws('wss://demo.local/ws', { id: 'mock-ws', heartbeat: { interval: 60, timeout: 40 }, reconnect: { min: 30, max: 200, factor: 2 } });
  await new Promise(r => setTimeout(r, 40));
  out.mockOpened = ws.isOpen;
  let pongSeen = false;
  ws.on('pong', () => pongSeen = true);
  await new Promise(r => setTimeout(r, 150));
  out.heartbeatPonged = pongSeen;

  let reconnectedFired = false;
  ws.on('reconnected', () => reconnectedFired = true);
  srv.drop();
  await new Promise(r => setTimeout(r, 5));
  out.statusAfterDrop = ws.status;
  const queuedOk = ws.send({ type: 'queued-msg' });
  out.queuedWhileDown = queuedOk && ws.queued > 0;
  await new Promise(r => setTimeout(r, 400));
  out.reconnectedAfterDrop = reconnectedFired;
  out.queueFlushedAfterReconnect = ws.queued === 0;
  ws.destroy(); srv.close();

  const srv2 = Orion.realtime.mockServer('wss://down.local/ws', () => {}, { latency: 2 });
  srv2.refuse(true);
  let gaveUp = false;
  const ws2 = Orion.ws('wss://down.local/ws', { reconnect: { min: 10, max: 20, maxRetries: 2 } });
  ws2.on('giveup', () => gaveUp = true);
  await new Promise(r => setTimeout(r, 300));
  out.gaveUpAfterMaxRetries = gaveUp;
  ws2.destroy(); srv2.close();

  const sseSrv = Orion.sse.mock('/stream-test', conn => { conn.send({ n: 1 }, { event: 'tick' }); });
  const sse = Orion.sse('/stream-test', { events: ['tick'], reconnect: { min: 20, max: 60 } });
  const firstTick = await new Promise(resolve => { sse.on('tick', d => resolve(d)); setTimeout(() => resolve(null), 1000); });
  out.sseFirstTick = firstTick;
  let sseReconnected = false;
  sse.on('reconnected', () => sseReconnected = true);
  sseSrv.drop();
  await new Promise(r => setTimeout(r, 150));
  out.sseReconnected = sseReconnected;
  sse.destroy(); sseSrv.close();

  const RS = '\x1e';
  const parsed1 = Orion.signalr.protocol.parse(JSON.stringify({ type: 3, invocationId: '1', result: 'ok' }) + RS);
  out.protocolParseOne = parsed1;
  const full = JSON.stringify({ type: 1, target: 'Msg', arguments: ['a'] }) + RS + JSON.stringify({ type: 6 }) + RS;
  const half = full.slice(0, Math.floor(full.length / 2));
  const rest = full.slice(Math.floor(full.length / 2));
  const step1 = Orion.signalr.protocol.split(half);
  const step2 = Orion.signalr.protocol.split(step1.rest + rest);
  out.splitAcrossChunks = { firstStepMessages: step1.messages.length, secondStepMessages: step2.messages, secondStepRest: step2.rest };

  const hub = Orion.signalr.mockHub('/hubs/test', { methods: { Echo(x) { return 'echo:' + x; }, Notify() { this.clients.all.send('Pushed', 'hello'); } } });
  const conn = Orion.signalr('/hubs/test', { reconnect: false });
  let pushedMsg = null;
  conn.on('Pushed', v => pushedMsg = v);
  await conn.start();
  out.hubConnected = conn.state === 'Connected';
  out.invokeResult = await conn.invoke('Echo', 'hi');
  await conn.send('Notify');
  await new Promise(r => setTimeout(r, 60));
  out.pushedFromServer = pushedMsg;
  await conn.stop();
  hub.close();

  let runs = 0;
  const p = Orion.poll(async () => { runs++; return runs; }, { interval: 30, immediate: true, pauseWhenHidden: true });
  await new Promise(r => setTimeout(r, 100));
  const runsBeforeHidden = runs;
  Object.defineProperty(document, 'hidden', { value: true, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise(r => setTimeout(r, 150));
  const runsWhileHidden = runs;
  out.pausedWhileHidden = runsWhileHidden === runsBeforeHidden;
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise(r => setTimeout(r, 100));
  out.resumedWhenVisible = runs > runsWhileHidden;
  p.stop();

  const ok = out.mockOpened && out.heartbeatPonged && out.queuedWhileDown && out.reconnectedAfterDrop && out.queueFlushedAfterReconnect
    && out.gaveUpAfterMaxRetries
    && !!out.sseFirstTick && out.sseReconnected
    && out.protocolParseOne.length === 1
    && (out.splitAcrossChunks.firstStepMessages + out.splitAcrossChunks.secondStepMessages.length) === 2
    && out.hubConnected && out.invokeResult === 'echo:hi' && out.pushedFromServer === 'hello'
    && out.pausedWhileHidden && out.resumedWhenVisible;
  return { ok, ...out };
})()
