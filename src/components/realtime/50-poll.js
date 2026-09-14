/* Live data refresh
 *   const p = Orion.poll(async ({ signal }) => (await Orion.http.get('/api/stats', { signal })), { interval: 10000, onData: render });
 *   p.start() · p.stop() · await p.refresh() · p.running · p.interval = 5000 · p.on('data' | 'error' | 'start' | 'stop', fn)
 *     no overlapping runs; pauses while the tab is hidden / offline (catches up on return); exponential backoff on errors
 *   const live = Orion.live('#kpis', { url: '/fragments/kpis.html', interval: 30000 })                 // sanitized HTML
 *   Orion.live(el, { url: '/api/stats', render: (data, el) => html`<b>${data.total}</b>` })           // render output is trusted
 *   Orion.live(el, { source: wsClient, event: 'stats', render })                                     // push source (ws / sse / signalr / Emitter)
 *   live.refresh() · live.stop() · live.destroy()  — events on el: o-live-update, o-live-error
 */
function poll(fn, o = {}) {
  if (!isFn(fn)) throw new TypeError('Orion.poll(fn, opts): fn must be a function');
  const opts = { interval: 5000, pauseWhenHidden: true, pauseWhenOffline: true, backoffOnError: true, maxInterval: 60000, immediate: true, autoStart: true, ...o };
  const em = new Emitter();
  let timer = null, running = false, busy = null, ctl = null, due = 0, offs = [];
  const st = { errors: 0, count: 0 };
  const paused = () => (opts.pauseWhenHidden && isBrowser && doc.hidden) || (opts.pauseWhenOffline && rtOffline());
  const nextDelay = () => (st.errors && opts.backoffOnError ? Math.min(opts.maxInterval, opts.interval * 2 ** Math.min(st.errors, 10)) : opts.interval);
  const schedule = (ms = nextDelay()) => {
    clearTimeout(timer); timer = null;
    if (!running) return;
    due = Date.now() + ms;
    if (!paused()) timer = setTimeout(() => run(false), ms);
  };
  function run(force) {
    if (!force && (!running || paused())) return Promise.resolve(api.lastData);
    if (busy) return busy;
    clearTimeout(timer); timer = null;
    const my = (ctl = new AbortController());
    busy = (async () => {
      try {
        const data = await fn({ signal: my.signal, count: ++st.count, errors: st.errors });
        if (my.signal.aborted) return api.lastData;
        st.errors = 0;
        api.lastRun = Date.now(); api.lastData = data; api.lastError = null;
        try { opts.onData?.(data); } catch (e) { console.error('[Orion] poll onData failed', e); }
        em.emit('data', data);
        return data;
      } catch (e) {
        if (my.signal.aborted) return api.lastData;
        st.errors++;
        api.lastError = e;
        try { opts.onError?.(e, st.errors); } catch (e2) { console.error(e2); }
        em.emit('error', e, st.errors);
        return api.lastData;
      } finally {
        busy = null;
        if (ctl === my) ctl = null;
        schedule();
      }
    })();
    return busy;
  }
  const onEnv = () => {
    if (!running) return;
    if (paused()) { clearTimeout(timer); timer = null; return; }
    if (!busy && !timer) { if (Date.now() >= due) run(false); else schedule(due - Date.now()); }
  };
  const api = {
    lastData: undefined, lastRun: 0, lastError: null,
    start() {
      if (running) return api;
      running = true;
      if (isBrowser) {
        offs.push(on(doc, 'visibilitychange', onEnv), on(win, 'online offline', onEnv));
        if (O.offline) offs.push(O.offline.onChange(onEnv));
      }
      em.emit('start');
      if (opts.immediate) run(false); else schedule();
      return api;
    },
    stop() {
      if (!running) return api;
      running = false;
      clearTimeout(timer); timer = null;
      ctl?.abort();
      offs.forEach(f => f()); offs = [];
      em.emit('stop');
      return api;
    },
    /** run now (even when paused or stopped); resolves with the data */
    refresh: () => run(true),
    get running() { return running; },
    get busy() { return !!busy; },
    get errors() { return st.errors; },
    get count() { return st.count; },
    get interval() { return opts.interval; },
    set interval(ms) { opts.interval = Math.max(50, +ms || opts.interval); if (running && !busy) schedule(); },
    on: (n, f) => em.on(n, f),
    off: (n, f) => em.off(n, f),
  };
  if (opts.autoStart) api.start();
  return api;
}

function live(target, o = {}) {
  const el = $(target);
  if (!el) throw new Error('Orion.live: target not found');
  const opts = { interval: 30000, trusted: false, announce: false, event: 'message', ...o };
  const paint = data => {
    if (!el.isConnected) return;
    let out;
    try { out = isFn(opts.render) ? opts.render(data, el) : data; }
    catch (e) { console.error('[Orion] live render failed', e); return; }
    if (out === undefined) { /* render updated the DOM itself */ }
    else if (isInst(out, Node)) el.replaceChildren(out);
    else if (out instanceof SafeHTML) el.innerHTML = out.s;
    else if (isStr(out)) el.innerHTML = isFn(opts.render) || opts.trusted ? out : sanitize(out);
    else el.textContent = out == null ? '' : typeof out === 'object' ? JSON.stringify(out) : String(out);
    el.setAttribute('data-o-live-updated', new Date().toISOString());
    el.removeAttribute('data-o-live-error');
    emit(el, 'o-live-update', { data });
    if (opts.announce) announce(isStr(opts.announce) ? opts.announce : t('realtime.lastUpdate', { time: fmt.time(new Date()) }));
  };
  const src = opts.source;
  let offSrc = null, p = null, detachedTicks = 0;
  const handle = { el };
  if (src && !isFn(src) && isFn(src.on)) {
    const r = src.on(opts.event, paint);
    offSrc = isFn(r) ? r : () => src.off?.(opts.event, paint);
  } else {
    const fetcher = isFn(src) ? src : opts.url
      ? ({ signal }) => (O.http ? O.http.get(opts.url, { signal, dedupe: false, ...(opts.http || {}) }) : fetch(opts.url, { signal }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return /json/.test(r.headers.get('content-type') || '') ? r.json() : r.text(); }))
      : null;
    if (!fetcher) throw new Error('Orion.live: pass { url } or { source }');
    p = poll(async ctx => {
      if (!el.isConnected) { if (++detachedTicks >= 2) queueMicrotask(() => handle.destroy()); return undefined; }
      detachedTicks = 0;
      el.setAttribute('aria-busy', 'true');
      try { const d = await fetcher(ctx); if (!ctx.signal.aborted) paint(d); return d; }
      finally { el.removeAttribute('aria-busy'); }
    }, {
      ...opts,
      onError: (e, n) => { el.setAttribute('data-o-live-error', String(e?.status || e?.code || 'error')); emit(el, 'o-live-error', { error: e, errors: n }); opts.onError?.(e, n); },
    });
  }
  Object.assign(handle, {
    refresh: () => (p ? p.refresh() : Promise.resolve()),
    start: () => { p?.start(); return handle; },
    stop: () => { p?.stop(); return handle; },
    destroy() { p?.stop(); offSrc?.(); offSrc = null; if (el.__oLive === handle) el.__oLive = null; },
  });
  // Live accessors must be defined, not passed to Object.assign above: Object.assign
  // invokes a source getter once and copies its value, which would freeze `running`
  // (and `poller`) to whatever it was when live() was called.
  Object.defineProperty(handle, "running", { configurable: true, get: () => (p ? p.running : !!offSrc) });
  Object.defineProperty(handle, "poller", { configurable: true, get: () => p });
  el.__oLive?.destroy?.();
  el.__oLive = handle;
  return handle;
}
O.poll = poll;
O.live = live;
