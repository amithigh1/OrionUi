/* ============================================================================
 * <o-countdown to="2026-12-31T00:00:00" format="dhms" variant="tiles"> — drift-free
 * countdown (recomputed from Date.now() every tick, never accumulates error),
 * pauses its render loop while the tab is hidden, announces remaining time to
 * screen readers once per minute (not per second). See README.md for the API.
 * ========================================================================== */

class OCountdown extends OElement {
  static props = {
    to: Any,
    format: { type: String, default: 'dhms', reflect: true },
    variant: { type: String, default: 'tiles', reflect: true },
    labels: { type: Boolean, default: true },
    autostart: { type: Boolean, default: true },
    pauseOnHidden: { type: Boolean, default: true },
    completeText: String,
    locale: String,
    texts: Object,
  };

  setup() {
    this.classList.add('o-countdown');
    this.setAttribute('role', 'timer');
    this._running = false; this._done = false; this._lastMinute = null; this._lastUnits = null;
    this.box = h('div', { class: 'o-countdown-units' });
    this.liveEl = h('span', { class: 'o-sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    this.doneEl = h('div', { class: 'o-countdown-done', hidden: true });
    this.append(this.box, this.doneEl, this.liveEl);
    this._onVis = () => { if (this.pauseOnHidden) (doc.hidden ? this._stopLoop() : this._startLoop()); };
  }
  connected() {
    this.listen(doc, 'visibilitychange', this._onVis);
    if (this._target != null && this.autostart) this._startLoop();
  }
  disconnected() { this._stopLoop(); }
  update(changed) {
    if (changed.has('to') || changed.has('init')) {
      const t = date.parse(this.to);
      this._target = t ? +t : null;
      this._done = false; this._lastMinute = null; this._lastUnits = null;
      this.doneEl.hidden = true; this.box.hidden = false;
    }
    if (changed.has('variant') || changed.has('format') || changed.has('labels') || changed.has('locale') || changed.has('texts') || changed.has('to') || changed.has('init')) this._buildUnits();
    this._paint(true);
    if (this._target != null && this.autostart && !this._done) this._startLoop(); else if (this._target == null) this._stopLoop();
  }

  /* ── public API ──────────────────────────────────────────────────── */
  start() { if (this._target != null) this._startLoop(); }
  pause() { this._stopLoop(); }
  /** restart(to) — optionally set a new target and (re)start. */
  restart(to) { if (to !== undefined) this.to = to; else { this._done = false; this._lastMinute = null; this.doneEl.hidden = true; this.box.hidden = false; } this._startLoop(); }
  getRemaining() { return this._target == null ? null : Math.max(0, this._target - Date.now()); }

  /* ── rendering ───────────────────────────────────────────────────── */
  get _fmt() { return TM_UNITS[this.format] ? this.format : 'dhms'; }
  _buildUnits() {
    const units = TM_UNITS[this._fmt];
    this._units = units;
    const variant = this.variant;
    this.classList.toggle('is-tiles', variant === 'tiles');
    this.classList.toggle('is-inline', variant === 'inline');
    this.classList.toggle('is-flip', variant === 'flip');
    this.classList.toggle('is-ring', variant === 'ring');
    if (variant === 'inline') { this.box.replaceChildren(h('span', { class: 'o-countdown-text' })); return; }
    // the first (largest) unit in a format has no natural cycle length (e.g. hours in "hms" can exceed 24) -> plain number, no ring
    this.box.replaceChildren(...units.map((u, i) => {
      const val = h('span', { class: 'o-countdown-val' }, '00');
      const ringed = variant === 'ring' && i > 0;
      const numEl = ringed ? h('div', { class: 'o-progress-ring o-countdown-ring', style: '--value:0' }, val) : val;
      return h('div', { class: ['o-countdown-unit', variant === 'ring' && i === 0 && 'is-plain'], 'data-u': u }, numEl,
        this.labels ? h('span', { class: 'o-countdown-label' }, this.t('timers.' + TM_LABEL_KEY[u])) : null);
    }));
  }
  _startLoop() {
    if (this._running || this._target == null || this._done) return;
    this._running = true;
    this._loop();
  }
  _stopLoop() { this._running = false; clearTimeout(this._timer); }
  _loop() {
    if (!this._running) return;
    const remaining = this._paint();
    if (remaining <= 0) { this._finish(); return; }
    this._timer = setTimeout(() => this._loop(), (remaining % 1000) || 1000);
  }
  _finish() {
    this._running = false; this._done = true;
    this._paint(true);
    this.box.hidden = true;
    this.doneEl.hidden = false;
    this.doneEl.textContent = this.completeText || this.t('timers.complete');
    this.liveEl.textContent = this.completeText || this.t('timers.complete');
    this.emit('complete', { to: this._target != null ? new Date(this._target) : null });
    announce(this.completeText || this.t('timers.complete'));
  }
  /** paint(force) -> ms remaining. Updates the visible numbers every tick; the aria-live
   *  region only when the whole-minute value changes (per spec: announce once a minute). */
  _paint(force) {
    if (this._target == null) return Infinity;
    const remaining = Math.max(0, this._target - Date.now());
    const fmt = this._fmt;
    const p = tmParts(remaining, fmt);
    if (this.variant === 'inline') {
      const txt = this.box.querySelector('.o-countdown-text');
      if (txt) txt.textContent = tmCompact(remaining, fmt);
    } else {
      for (const u of this._units || []) {
        const cell = this.box.querySelector(`.o-countdown-unit[data-u="${u}"]`);
        if (!cell) continue;
        const v = u === 'd' ? p.d : u === 'h' ? p.h : u === 'm' ? p.m : p.s;
        const text = String(v).padStart(u === 'd' ? 1 : 2, '0');
        const val = cell.querySelector('.o-countdown-val');
        if (val && val.textContent !== text) {
          if (this.variant === 'flip' && val.textContent !== '') this._flip(val, text); else val.textContent = text;
        }
        const ring = cell.querySelector('.o-countdown-ring');
        if (ring && TM_MAX[u]) ring.style.setProperty('--value', String(Math.round((v / TM_MAX[u]) * 100)));
      }
    }
    const totalMin = Math.floor(remaining / 60000);
    if (force || totalMin !== this._lastMinute) {
      this._lastMinute = totalMin;
      this.liveEl.textContent = this.t('timers.remaining', { time: tmCompact(remaining, fmt) });
    }
    return remaining;
  }
  _flip(el, text) {
    el.textContent = text;
    animate(el, [{ transform: 'perspective(240px) rotateX(-90deg)', opacity: .4 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'ease-out' });
  }
}
define('o-countdown', OCountdown);
O.Countdown = OCountdown;
