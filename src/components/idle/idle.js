/* Orion.idle — user inactivity detection (optionally shared across tabs).
 *   const w = Orion.idle({ timeout: 60000, crossTab: true, onIdle: ({ lastActive }) => …, onActive: ({ remote, idleFor }) => … })
 *   w.isIdle · w.lastActive · w.remaining · w.reset() · w.stop() · w.start()
 *   Activity in any tab of the same origin (same `key`) counts as activity in every tab (BroadcastChannel, localStorage fallback).
 *   Bus events: Orion.on('idle', e => …) / Orion.on('active', e => …)
 */

/** xtab(name, onMessage) -> { id, post(data), close() } — BroadcastChannel with a localStorage 'storage'-event fallback. */
function xtab(name, onMsg) {
  const id = uid('tab'), key = 'orion:xtab:' + name;
  if (!isBrowser) return { id, post: noop, close: noop };
  let bc = null;
  try { if (win.BroadcastChannel) { bc = new BroadcastChannel('orion:' + name); bc.onmessage = e => onMsg(e.data); } } catch { bc = null; }
  const onStorage = e => { if (e.key !== key || !e.newValue) return; const m = parseJSON(e.newValue, null); if (m && m.from !== id) onMsg(m.data); };
  if (!bc) win.addEventListener('storage', onStorage);
  return {
    id,
    post(data) {
      if (bc) { try { bc.postMessage(data); } catch {} return; }
      try { localStorage.setItem(key, JSON.stringify({ from: id, n: Date.now() + Math.random(), data })); } catch {}
    },
    close() { if (bc) bc.close(); else win.removeEventListener('storage', onStorage); },
  };
}

const IDLE_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll', 'focus', 'visibilitychange'];

/** activityWatch(target, events, fn) -> off() — shared by idle() and sessionTimeout(). */
function activityWatch(target, events, fn) {
  const h = e => { if (e.type === 'visibilitychange' && doc.visibilityState !== 'visible') return; fn(e); };
  const opts = { capture: true, passive: true };
  events.forEach(ev => (ev === 'visibilitychange' ? doc : target).addEventListener(ev, h, opts));
  return () => events.forEach(ev => (ev === 'visibilitychange' ? doc : target).removeEventListener(ev, h, opts));
}

function idle(opts = {}) {
  const o = { timeout: 60000, events: IDLE_EVENTS, crossTab: true, key: 'default', element: null, onIdle: noop, onActive: noop, ...opts };
  let last = Date.now(), idleNow = false, timer = 0, running = false, lastPost = 0, offEvents = noop, ch = null;
  const ctl = {
    get isIdle() { return idleNow; },
    get lastActive() { return last; },
    get remaining() { return Math.max(0, last + o.timeout - Date.now()); },
    get running() { return running; },
    timeout: o.timeout,
    /** Mark the user active now (also in other tabs). */
    reset() { activity(Date.now(), false); return ctl; },
    start() {
      if (running || !isBrowser) return ctl;
      running = true; last = Date.now(); idleNow = false;
      offEvents = activityWatch(o.element ? $(o.element) || doc : doc, o.events, () => activity(Date.now(), false));
      if (o.crossTab) ch = xtab('idle:' + o.key, m => { if (m && m.type === 'active' && m.at > last) activity(m.at, true); });
      schedule();
      return ctl;
    },
    stop() { running = false; clearTimeout(timer); offEvents(); offEvents = noop; ch?.close(); ch = null; return ctl; },
  };
  function schedule() {
    clearTimeout(timer);
    if (!running) return;
    const rem = last + o.timeout - Date.now();
    if (rem <= 0) goIdle(); else timer = setTimeout(schedule, Math.min(rem + 25, 2147483647));
  }
  function goIdle() {
    if (idleNow || !running) return;
    idleNow = true;
    const e = { lastActive: last, idleFor: Date.now() - last, controller: ctl };
    try { o.onIdle(e); } catch (err) { console.error('[Orion] idle onIdle', err); }
    bus.emit('idle', e);
  }
  function activity(at, remote) {
    if (!running) return;
    const was = idleNow, prev = last;
    last = Math.max(last, at);
    if (!remote && ch && at - lastPost > 1000) { lastPost = at; ch.post({ type: 'active', at }); }
    if (was) {
      idleNow = false;
      const e = { remote, idleFor: at - prev, lastActive: last, controller: ctl };
      try { o.onActive(e); } catch (err) { console.error('[Orion] idle onActive', err); }
      bus.emit('active', e);
      schedule();
    }
  }
  return o.autoStart === false ? ctl : ctl.start();
}
O.idle = idle;
