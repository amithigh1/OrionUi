/* Orion.sessionTimeout — inactivity logout with an accessible countdown dialog, synced across tabs.
 *   const s = Orion.sessionTimeout({
 *     timeout: 15 * 60e3,           // ms of inactivity before the session ends
 *     warning: 60e3,                // show the countdown this long before the end
 *     keepAlive: () => fetch('/api/ping'),   // called on activity (throttled by keepAliveInterval) and on "Stay signed in"
 *     onTimeout: ({ reason }) => location.href = '/login',   // reason: 'timeout' | 'logout' | 'remote'
 *     title, message ('… {time} …'), stayText, logoutText, logoutUrl, loginUrl, onLogin, titleAlert: true, key: 'session',
 *   });
 *   s.extend() · s.logout() · s.stop() · s.start() · s.remaining · s.state ('active'|'warning'|'expired'|'stopped') · s.on('warning'|'tick'|'extend'|'timeout', fn)
 *   Extending in one tab extends every tab; logging out (or expiring) in one tab signs out every tab.
 */
i18n.add('en', {
  session: {
    title: 'Are you still there?', message: 'Your session will expire in {time}.',
    detail: 'For your security, you will be signed out automatically due to inactivity.',
    stay: 'Stay signed in', logout: 'Log out', remaining: '{time} remaining',
    expiredTitle: 'Session expired', expiredMessage: 'You have been signed out due to inactivity.',
    loggedOutTitle: 'Signed out', loggedOutMessage: 'You have been signed out.', login: 'Sign in again',
  },
});

const __clock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); };

class SessionTimeout extends Emitter {
  constructor(opts = {}) {
    super();
    this.o = { timeout: 15 * 60e3, warning: 60e3, keepAlive: null, keepAliveInterval: null, events: IDLE_EVENTS, crossTab: true, key: 'session', titleAlert: true, escape: 'stay', ...opts };
    this.o.warning = Math.min(this.o.warning, this.o.timeout);
    if (this.o.keepAliveInterval == null) this.o.keepAliveInterval = clamp(this.o.timeout / 3, 1000, 5 * 60e3);
    this._state = 'stopped';
    this._last = Date.now();
    this._pingKey = 'orion:session:' + this.o.key + ':ping';
    if (opts.autoStart !== false) this.start();
  }
  get state() { return this._state; }
  get lastActive() { return this._last; }
  get expiresAt() { return this._last + this.o.timeout; }
  get remaining() { return Math.max(0, this.expiresAt - Date.now()); }

  start() {
    if (!isBrowser || this._state === 'active' || this._state === 'warning') return this;
    this._hide();
    this._state = 'active';
    this._last = Date.now();
    this._offEv = activityWatch(doc, this.o.events, e => this._activity(e));
    if (this.o.crossTab) this._ch = xtab('session:' + this.o.key, m => this._remote(m));
    this._offVis = on(doc, 'visibilitychange', () => this._check());
    this._schedule();
    return this;
  }
  stop() {
    this._state = 'stopped';
    clearTimeout(this._timer); clearInterval(this._tick);
    this._offEv?.(); this._offVis?.(); this._ch?.close();
    this._offEv = this._offVis = this._ch = null;
    this._hide();
    return this;
  }
  destroy() { this.stop(); this._layer?.remove(); this._layer = null; if (O.sessionTimeout.current === this) O.sessionTimeout.current = null; }
  /** "Stay signed in": restart the inactivity window here and in every tab, ping keepAlive. */
  extend({ remote = false, at = Date.now() } = {}) {
    if (this._state === 'stopped' || this._state === 'expired') return this;
    this._last = Math.max(this._last, at);
    const wasWarning = this._state === 'warning';
    this._state = 'active';
    this._hide();
    if (!remote) { this._ch?.post({ type: 'extend', at: this._last }); this._ping(true); }
    this._schedule();
    this.emit('extend', { remote, wasWarning });
    this.o.onExtend?.({ remote });
    bus.emit('session:extend', { remote });
    return this;
  }
  reset() { return this.extend(); }
  /** Jump straight to the warning (previews, tests): as if the user had been idle until the warning point. */
  warn() {
    if (this._state !== 'active') return this;
    this._last = Date.now() - (this.o.timeout - this.o.warning);
    this._check();
    return this;
  }
  /** End the session now (every tab). reason: 'logout' (user), 'timeout', 'remote' (another tab). */
  logout(reason = 'logout', { remote = false } = {}) {
    if (this._state === 'stopped' || this._state === 'expired') return this;
    if (!remote) this._ch?.post({ type: 'logout', reason });
    clearTimeout(this._timer); clearInterval(this._tick);
    this._offEv?.(); this._offVis?.();
    this._offEv = this._offVis = null;
    this._state = 'expired';
    const e = { reason: remote ? 'remote' : reason, remoteReason: remote ? reason : undefined };
    this.emit(reason === 'timeout' ? 'timeout' : 'logout', e);
    this.emit('end', e);
    bus.emit('session:timeout', e);
    if (isFn(this.o.onTimeout)) { this._hide(); try { this.o.onTimeout(e); } catch (err) { console.error('[Orion] session onTimeout', err); } }
    else if (this.o.logoutUrl) { this._hide(); location.href = this.o.logoutUrl; }
    else this._show(reason === 'timeout' || e.remoteReason === 'timeout' ? 'expired' : 'loggedOut');
    const ch = this._ch; this._ch = null;
    setTimeout(() => ch?.close(), 50);   // let the logout message flush first
    return this;
  }

  _activity() {
    if (this._state !== 'active') return;
    const now = Date.now();
    this._last = now;
    if (now - (this._lastPost || 0) > 1000) { this._lastPost = now; this._ch?.post({ type: 'activity', at: now }); }
    this._ping(false);
  }
  _remote(m) {
    if (!m || this._state === 'stopped' || this._state === 'expired') return;
    if (m.type === 'logout') this.logout(m.reason, { remote: true });
    else if (m.type === 'extend') this.extend({ remote: true, at: m.at });
    else if (m.type === 'activity' && m.at > this._last) {
      if (this._state === 'warning') this.extend({ remote: true, at: m.at });
      else this._last = m.at;
    }
  }
  async _ping(force) {
    const fn = this.o.keepAlive;
    if (!isFn(fn) || this._pinging) return;
    const now = Date.now(), shared = +ls.get(this._pingKey, 0) || 0, last = Math.max(this._lastPing || 0, shared);
    if (!force && now - last < this.o.keepAliveInterval) return;
    this._lastPing = now; ls.set(this._pingKey, now);
    this._pinging = true;
    try { await fn(); this.emit('keepalive', { at: now }); }
    catch (err) { this.emit('keepalive-error', err); this.o.onKeepAliveError?.(err); }
    finally { this._pinging = false; }
  }
  _schedule() {
    clearTimeout(this._timer);
    if (this._state !== 'active') return;
    const until = this.expiresAt - this.o.warning - Date.now();
    if (until <= 0) this._check();
    else this._timer = setTimeout(() => this._check(), Math.min(until + 20, 2147483647));
  }
  _check() {
    if (this._state === 'stopped' || this._state === 'expired') return;
    const rem = this.remaining;
    if (rem <= 0) return this.logout('timeout');
    if (this._state === 'active') {
      if (rem <= this.o.warning) this._warn(); else this._schedule();
    } else this._paint();
  }
  _warn() {
    this._state = 'warning';
    this._announced = new Set();
    this._show('warning');
    this.emit('warning', { remaining: this.remaining });
    this.o.onWarning?.({ remaining: this.remaining });
    bus.emit('session:warning', { remaining: this.remaining });
    clearInterval(this._tick);
    this._tick = setInterval(() => this._check(), 250);
  }

  /* ── dialog (built on core overlays: focus trap, Escape, scroll lock, focus return) ── */
  _build() {
    if (this._layer) return;
    const id = uid('session');
    this._btnStay = h('button', { type: 'button', class: 'o-btn o-btn-primary o-session-stay', onClick: () => (this._mode === 'warning' ? this.extend() : this._login()) });
    this._btnOut = h('button', { type: 'button', class: 'o-btn o-session-logout', onClick: () => this.logout('logout') });
    this._layer = h('div', { class: 'o-session-layer', hidden: true },
      h('div', { class: 'o-backdrop o-session-backdrop' }),
      this._dlg = h('div', { class: 'o-session-dialog o-floating', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': id + '-t', 'aria-describedby': id + '-d', tabindex: '-1' },
        this._ring = h('div', { class: 'o-session-ring', 'aria-hidden': 'true' }, iconEl('clock')),
        this._title = h('h2', { class: 'o-session-title', id: id + '-t' }),
        h('div', { id: id + '-d' }, this._msg = h('p', { class: 'o-session-msg' }), this._detail = h('p', { class: 'o-session-detail' })),
        this._bar = h('div', { class: 'o-progress o-progress-sm o-session-progress', 'aria-hidden': 'true' }, h('div', { class: 'o-progress-bar' })),
        h('div', { class: 'o-session-actions' }, this._btnOut, this._btnStay)));
  }
  /** Option override (string with {params} or function) or the i18n string session.<key>. */
  _text(opt, key, params) { const v = this.o[opt]; if (v != null) return isFn(v) ? v(params || {}) : String(v).replace(/\{(\w+)\}/g, (m, p) => params?.[p] ?? m); return t('session.' + key, params); }
  _show(mode) {
    this._build();
    this._mode = mode;
    const L = this._layer, warn = mode === 'warning', exp = mode === 'expired';
    L.classList.toggle('is-expired', !warn);
    this._ring.replaceChildren(iconEl(warn ? 'clock' : 'lock'));
    this._title.textContent = warn ? this._text('title', 'title') : exp ? this._text('expiredTitle', 'expiredTitle') : this._text('loggedOutTitle', 'loggedOutTitle');
    this._detail.textContent = warn ? this._text('detail', 'detail') : '';
    this._detail.hidden = !warn;
    this._btnOut.hidden = !warn;
    this._btnOut.textContent = this._text('logoutText', 'logout');
    this._btnStay.textContent = warn ? this._text('stayText', 'stay') : this._text('loginText', 'login');
    this._bar.hidden = !warn;
    if (warn) {
      const parts = this._text('message', 'message', { time: '\u0001' }).split('\u0001');
      this._time = h('strong', { class: 'o-session-time' });
      this._msg.replaceChildren(parts[0] || '', this._time, parts.slice(1).join(''));
    } else this._msg.textContent = exp ? this._text('expiredMessage', 'expiredMessage') : this._text('loggedOutMessage', 'loggedOutMessage');
    this._paint();
    if (!this._ov) {
      portal(L, doc.body);
      L.hidden = false;
      if (this.o.titleAlert && warn) this._docTitle = doc.title;
      this._ov = overlays.open({
        el: L, modal: true, trap: true, lockScroll: true, outside: false, escape: true, zOffset: 200,
        onClose: reason => {
          this._ov = null; L.hidden = true;
          if (this._docTitle != null) { doc.title = this._docTitle; this._docTitle = null; }
          if (reason === 'escape') { if (this._mode === 'warning' && this.o.escape === 'stay') this.extend(); else if (this._mode !== 'warning') this._login(); }
        },
      });
      animate(this._dlg, 'zoomIn', { duration: 180 });
      animate(L.firstChild, 'fadeIn', { duration: 180 });
    }
    this._btnStay.focus({ preventScroll: true });
  }
  _paint() {
    if (!this._layer || this._mode !== 'warning') return;
    const rem = this.remaining, txt = __clock(rem);
    if (this._time) this._time.textContent = txt;
    this._bar.firstChild.style.setProperty('--o-value', (100 * rem / this.o.warning).toFixed(1) + '%');
    this._layer.classList.toggle('is-urgent', rem <= Math.min(10000, this.o.warning / 3));
    if (this._docTitle != null) doc.title = `(${txt}) ${this._docTitle}`;
    const s = Math.ceil(rem / 1000);
    for (const mark of [30, 10]) if (s <= mark && s > mark - 2 && !this._announced.has(mark) && this.o.warning / 1000 > mark) { this._announced.add(mark); announce(t('session.remaining', { time: txt }), 'assertive'); }
    this.emit('tick', { remaining: rem });
  }
  _hide() { this._ov?.close('api'); }
  _login() {
    this._hide();
    if (isFn(this.o.onLogin)) this.o.onLogin();
    else if (this.o.loginUrl) location.href = this.o.loginUrl;
    else location.reload();
  }
}

/** Orion.sessionTimeout(options) -> SessionTimeout controller (the newest is Orion.sessionTimeout.current). */
function sessionTimeout(opts) { const c = new SessionTimeout(opts); sessionTimeout.current = c; return c; }
sessionTimeout.current = null;
O.sessionTimeout = sessionTimeout;
O.SessionTimeout = SessionTimeout;
