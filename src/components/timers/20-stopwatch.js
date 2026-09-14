/* ============================================================================
 * <o-stopwatch> — start / pause / resume / lap / reset, with a lap table of
 * splits. Keyboard: Space start/pause, L lap, R reset. Optional localStorage
 * persistence so a running stopwatch survives a reload. See README.md.
 * ========================================================================== */

class OStopwatch extends OElement {
  static props = {
    autostart: Boolean,
    format: { type: String, default: 'hms', reflect: true },
    centiseconds: { type: Boolean, default: true },
    persist: Any,
    locale: String,
    texts: Object,
  };

  setup() {
    this.classList.add('o-stopwatch');
    this.setAttribute('role', 'group');
    this.setAttribute('aria-label', this.t('timers.elapsed'));
    this.tabIndex = this.tabIndex || 0;
    this._running = false; this._elapsed = 0; this._startedAt = null; this._laps = [];
    this.timeEl = h('div', { class: 'o-stopwatch-time', 'aria-hidden': 'true' },
      h('span', { class: 'o-stopwatch-main' }), h('span', { class: 'o-stopwatch-cs' }));
    this.liveEl = h('span', { class: 'o-sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    this.controls = h('div', { class: 'o-stopwatch-controls' },
      h('button', { type: 'button', class: 'o-btn o-btn-primary o-stopwatch-toggle', 'data-act': 'toggle' }),
      h('button', { type: 'button', class: 'o-btn o-btn-soft-primary', 'data-act': 'lap' }, icon('flag', { size: 16 }), h('span', null, this.t('timers.lap'))),
      h('button', { type: 'button', class: 'o-btn o-btn-ghost', 'data-act': 'reset' }, icon('refresh', { size: 16 }), h('span', null, this.t('timers.reset'))));
    this.lapsWrap = h('div', { class: 'o-stopwatch-laps-wrap' });
    this.append(this.timeEl, this.liveEl, this.controls, this.lapsWrap);
    on(this, 'click', '[data-act]', (e, b) => this._act(b.dataset.act));
    on(this, 'keydown', e => this._key(e));
    this._restore();
    this._paintControls();
    this._paintLaps();
  }
  connected() {
    if (this._running) this._loop();
    else if (this.autostart && !this._startedAt && !this._laps.length) this.start();
  }
  disconnected() { cancelAnimationFrame(this._raf); this._save(); }

  /* ── public API ──────────────────────────────────────────────────── */
  start() {
    if (this._running) return;
    this._running = true; this._startedAt = Date.now();
    this._paintControls(); this._loop(); this._save();
    announce(this.t('timers.started'));
  }
  resume() { this.start(); }
  pause() {
    if (!this._running) return;
    this._elapsed += Date.now() - this._startedAt; this._running = false; this._startedAt = null;
    cancelAnimationFrame(this._raf); this._paint(); this._paintControls(); this._save();
    announce(this.t('timers.paused') + ' ' + tmClock(this._elapsed, this.format, this.centiseconds));
  }
  toggle() { this._running ? this.pause() : this.start(); }
  lap() {
    if (!this._running) return;
    const total = this._total();
    const prevTotal = this._laps.length ? this._laps[this._laps.length - 1].total : 0;
    this._laps.push({ n: this._laps.length + 1, lap: total - prevTotal, total });
    this._paintLaps(); this._save();
    announce(this.t('timers.lapRecorded', { n: this._laps.length, time: tmClock(total - prevTotal, this.format, this.centiseconds) }));
  }
  reset() {
    cancelAnimationFrame(this._raf);
    this._running = false; this._elapsed = 0; this._startedAt = null; this._laps = [];
    this._paint(); this._paintControls(); this._paintLaps(); this._save();
  }
  getElapsed() { return this._total(); }
  getLaps() { return this._laps.map(l => ({ ...l })); }

  _act(act) { if (act === 'toggle') this.toggle(); else if (act === 'lap') this.lap(); else if (act === 'reset') this.reset(); }
  _key(e) {
    if (e.target !== this && e.target.closest('button,input,textarea,select')) return;
    if (e.key === ' ') { e.preventDefault(); this.toggle(); }
    else if ((e.key === 'l' || e.key === 'L') && this._running) { e.preventDefault(); this.lap(); }
    else if ((e.key === 'r' || e.key === 'R') && !this._running) { e.preventDefault(); this.reset(); }
  }
  _total() { return this._elapsed + (this._running ? Date.now() - this._startedAt : 0); }

  _loop() {
    if (!this._running) return;
    this._paint();
    this._raf = requestAnimationFrame(() => this._loop());
  }
  _paint() {
    const total = this._total();
    this.timeEl.querySelector('.o-stopwatch-main').textContent = tmClock(total, this.format, false);
    this.timeEl.querySelector('.o-stopwatch-cs').textContent = this.centiseconds ? '.' + String(tmParts(total, this.format).cs).padStart(2, '0') : '';
  }
  _paintControls() {
    this.classList.toggle('is-running', this._running);
    const t = this.controls.querySelector('[data-act=toggle]');
    t.replaceChildren(iconEl(this._running ? 'pause' : 'play', { size: 16 }), h('span', null, this._running ? this.t('timers.pause') : (this._elapsed ? this.t('timers.resume') : this.t('timers.start'))));
    this.controls.querySelector('[data-act=lap]').disabled = !this._running;
    this.controls.querySelector('[data-act=reset]').disabled = this._running || (!this._elapsed && !this._laps.length);
    this._paint();
  }
  _paintLaps() {
    if (!this._laps.length) { this.lapsWrap.replaceChildren(); return; }
    const best = Math.min(...this._laps.map(l => l.lap)), worst = Math.max(...this._laps.map(l => l.lap));
    const rows = [...this._laps].reverse().map(l => h('tr', { class: [this._laps.length > 2 && l.lap === best && 'is-best', this._laps.length > 2 && l.lap === worst && 'is-worst'] },
      h('td', null, String(l.n)), h('td', null, tmClock(l.lap, this.format, this.centiseconds)), h('td', null, tmClock(l.total, this.format, this.centiseconds))));
    this.lapsWrap.replaceChildren(h('table', { class: 'o-stopwatch-laps' },
      h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, this.t('timers.lapCol')), h('th', null, this.t('timers.totalCol')))),
      h('tbody', null, rows)));
  }
  _save() {
    if (!this.persist) return;
    ls.set(String(this.persist), { elapsed: this._elapsed, startedAt: this._startedAt, running: this._running, laps: this._laps });
  }
  _restore() {
    if (!this.persist) return;
    const v = ls.get(String(this.persist), null);
    if (!v || !isObj(v)) return;
    this._elapsed = +v.elapsed || 0; this._laps = toArr(v.laps);
    if (v.running && v.startedAt) { this._elapsed += Date.now() - v.startedAt; this._running = false; } // resume paused visually; call start() to continue
  }
}
define('o-stopwatch', OStopwatch);
O.Stopwatch = OStopwatch;
