/* <o-audio> — audio player with a Web-Audio waveform (falls back to a plain progress bar without it).
 *   <o-audio src="song.mp3" title="Song title" artist="Artist name" cover="cover.jpg" waveform loop
 *            playlist='[{"src":"b.mp3","title":"Track 2","cover":"b.jpg"}]'></o-audio>
 * Methods: play(), pause(), togglePlay(), seek(t), skip(delta), setSpeed(rate), toggleLoop(), toggleMute(),
 *          download(), next(), prev()
 * Getters: currentTime, duration, paused, ended, playbackRate, audioElement
 * Events: o-play, o-pause, o-ended, o-timeupdate {currentTime,duration}, o-ratechange {rate}, o-error {error},
 *         o-playlistchange {index,item}
 * Keyboard (focus inside): Space play/pause, ←/→ ±5s, Home/End.
 */
class OAudio extends OElement {
  static props = {
    src: String, title: String, artist: String, cover: String, waveform: { type: Boolean, default: true }, loop: Boolean,
    playlist: { type: Array, default: () => [] }, index: { type: Number, default: 0 }, autoplay: Boolean, label: String, texts: Object,
  };
  get currentTime() { return this._media ? this._media.currentTime : 0; }
  set currentTime(v) { this.seek(+v); }
  get duration() { return this._media ? this._media.duration || 0 : 0; }
  get paused() { return !this._media || this._media.paused; }
  get ended() { return !!this._media && this._media.ended; }
  get playbackRate() { return this._media ? this._media.playbackRate : 1; }
  get audioElement() { return this._media; }

  setup() {
    this.classList.add('o-audio');
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this._curSrc = ''; this._peaks = null;
    const a = this._media = h('audio', { class: 'o-audio-media', preload: 'metadata' });
    this._coverImg = h('img', { class: 'o-audio-cover-img', alt: '', hidden: true });
    this._coverIcon = iconEl('music-note');
    this._cover = h('div', { class: 'o-audio-cover' }, this._coverImg, this._coverIcon);
    this._titleEl = h('strong', { class: 'o-audio-title' });
    this._artistEl = h('span', { class: 'o-audio-artist' });
    this._meta = h('div', { class: 'o-audio-meta' }, this._titleEl, this._artistEl);

    this._canvas = h('canvas', { class: 'o-audio-wave' });
    this._flatPlayed = h('div', { class: 'o-audio-flat-played' });
    this._flat = h('div', { class: 'o-audio-flat' }, this._flatPlayed);
    this._waveWrap = h('div', { class: 'o-audio-wave-wrap', role: 'slider', tabindex: '0', 'aria-orientation': 'horizontal' }, this._canvas, this._flat);

    const btn = (a2, name, extra) => h('button', { type: 'button', class: cls('o-audio-btn', extra), 'data-a': a2 }, iconEl(name));
    this._prevBtn = btn('prev', 'skip-back');
    this._playBtn = btn('play', 'play', 'o-audio-play');
    this._nextBtn = btn('next', 'skip-forward');
    this._curEl = h('span', { class: 'o-audio-time' }, '0:00 / 0:00');
    this._muteBtn = btn('mute', 'volume-2');
    this._loopBtn = btn('loop', 'repeat');
    this._speedBtn = h('button', { type: 'button', class: 'o-audio-btn o-audio-speed' }, '1×');
    this._dlBtn = btn('download', 'download');
    this._row = h('div', { class: 'o-audio-row' }, this._prevBtn, this._playBtn, this._nextBtn, this._curEl,
      h('span', { class: 'o-audio-spacer' }), this._muteBtn, this._loopBtn, this._speedBtn, this._dlBtn);
    this._body = h('div', { class: 'o-audio-body' }, this._meta, this._waveWrap, this._row);
    this.append(this._cover, this._body);

    on(a, 'play', () => { this.classList.add('is-playing'); this._paintPlay(); this.emit('play'); });
    on(a, 'pause', () => { this.classList.remove('is-playing'); this._paintPlay(); this.emit('pause'); });
    on(a, 'ended', () => { this._paintPlay(); this.emit('ended'); if (this.playlist.length) this.next(); });
    on(a, 'timeupdate', () => { if (!this._scrubbing) this._paintTime(); this.emit('timeupdate', { currentTime: a.currentTime, duration: a.duration || 0 }); });
    on(a, 'loadedmetadata durationchange', () => this._paintTime());
    on(a, 'volumechange', () => this._paintVolume());
    on(a, 'ratechange', () => { this._speedBtn.textContent = a.playbackRate === 1 ? '1×' : round(a.playbackRate, 2) + '×'; this.emit('ratechange', { rate: a.playbackRate }); });
    on(a, 'error', () => { if (a.error && this._curSrc) { this.classList.add('is-error'); this.emit('error', { error: a.error }); } });
    on(a, 'waiting', () => this.classList.add('is-waiting'));
    on(a, 'playing canplay', () => this.classList.remove('is-waiting'));

    on(this._playBtn, 'click', () => this.togglePlay());
    on(this._prevBtn, 'click', () => this.prev());
    on(this._nextBtn, 'click', () => this.next());
    on(this._muteBtn, 'click', () => this.toggleMute());
    on(this._loopBtn, 'click', () => this.toggleLoop());
    on(this._dlBtn, 'click', () => this.download());
    on(this._speedBtn, 'click', () => this._openSpeed());
    on(this._coverImg, 'error', () => { this._coverImg.hidden = true; this._coverIcon.hidden = false; });

    on(this._waveWrap, 'pointerdown', e => this._down(e));
    on(this._waveWrap, 'pointermove', e => this._move(e));
    on(this._waveWrap, 'pointerup pointercancel lostpointercapture', () => this._up());
    on(this, 'keydown', e => this._key(e));
    this.addCleanup(observeResize(this._waveWrap, rafThrottle(() => this._drawWave())));
  }
  disconnected() { this._media?.pause(); }
  update(changed) {
    const a = this._media;
    if (changed.has('loop') || changed.has('playlist') || changed.has('init')) a.loop = !!this.loop && this.playlist.length < 2;
    if (changed.has('autoplay') || changed.has('init')) a.autoplay = !!this.autoplay;
    if (changed.has('label') || changed.has('init')) { if (this.label) this.setAttribute('aria-label', this.label); else this.removeAttribute('aria-label'); }
    if (changed.has('src') || changed.has('title') || changed.has('artist') || changed.has('cover') || changed.has('waveform') || changed.has('playlist') || changed.has('index') || changed.has('init')) this._applyItem();
    this._loopBtn.classList.toggle('is-active', !!this.loop);
    this._loopBtn.setAttribute('aria-pressed', String(!!this.loop));
    this._loopBtn.setAttribute('aria-label', this.t('player.loop')); this._loopBtn.title = this.t('player.loop');
    this._speedBtn.setAttribute('aria-label', this.t('player.speed')); this._speedBtn.title = this.t('player.speed');
    this._dlBtn.setAttribute('aria-label', this.t('player.download')); this._dlBtn.title = this.t('player.download');
    this._prevBtn.setAttribute('aria-label', this.t('player.previous'));
    this._nextBtn.setAttribute('aria-label', this.t('player.next'));
    this._waveWrap.setAttribute('aria-label', this.t('player.seek'));
    this._paintVolume(); this._paintPlay();
  }

  play() { return this._media.play().catch(() => {}); }
  pause() { this._media.pause(); }
  togglePlay() { (this._media.paused || this._media.ended) ? this.play() : this.pause(); }
  seek(t) { const d = this._media.duration; this._media.currentTime = clamp(+t || 0, 0, isFinite(d) ? d : 1e9); this._paintTime(); }
  skip(d) { this.seek((this._media.currentTime || 0) + d); }
  toggleMute() { this._media.muted = !this._media.muted; }
  toggleLoop() { this.loop = !this.loop; }
  setSpeed(r) { this._media.playbackRate = +r || 1; }
  download() { const it = this._current(); fileDownload(it.src, (it.title || 'audio').replace(/[\\/:*?"<>|]+/g, '_')); }
  next() { const n = this.playlist.length; if (n < 2) return; let i = this.index + 1; if (i >= n) { if (!this.loop) return; i = 0; } this._wantPlay = !this._media.paused; this.index = i; }
  prev() { const n = this.playlist.length; if (n < 2) return; let i = this.index - 1; if (i < 0) { if (!this.loop) return; i = n - 1; } this._wantPlay = !this._media.paused; this.index = i; }

  _current() {
    const pl = this.playlist && this.playlist[this.index];
    return pl ? { src: pl.src, title: pl.title, artist: pl.artist, cover: pl.cover } : { src: this.src, title: this.title, artist: this.artist, cover: this.cover };
  }
  _applyItem() {
    const it = this._current(), a = this._media, changedSrc = (it.src || '') !== this._curSrc;
    const emitPl = changedSrc && this.playlist.length && this._curSrc !== '';
    this._curSrc = it.src || '';
    this._titleEl.textContent = it.title || '';
    this._artistEl.textContent = it.artist || '';
    this._artistEl.hidden = !it.artist;
    if (it.cover) { this._coverImg.src = it.cover; this._coverImg.hidden = false; this._coverIcon.hidden = true; }
    else { this._coverImg.hidden = true; this._coverIcon.hidden = false; }
    const n = this.playlist.length;
    this._prevBtn.hidden = this._nextBtn.hidden = n < 2;
    this._prevBtn.disabled = !this.loop && this.index <= 0;
    this._nextBtn.disabled = !this.loop && this.index >= n - 1;
    if (changedSrc) {
      this.classList.remove('is-error', 'is-waiting');
      a.src = it.src || '';
      if (it.src) a.load();
      this._peaks = null;
      this._paintTime();
      this._loadWave(it.src);
    }
    this._paintPlay();
    if (emitPl) this.emit('playlistchange', { index: this.index, item: it });
    if (this._wantPlay) { this._wantPlay = false; this.play(); }
  }
  async _loadWave(src) {
    this.classList.remove('has-wave');
    if (!this.waveform || !src || !(win.AudioContext || win.webkitAudioContext)) { this._drawWave(); return; }
    const tok = (this._waveTok = (this._waveTok || 0) + 1);
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error('fetch failed');
      const buf = await res.arrayBuffer();
      if (tok !== this._waveTok) return;
      const Ctx = win.AudioContext || win.webkitAudioContext;
      const actx = new Ctx();
      const audioBuf = await actx.decodeAudioData(buf);
      actx.close?.().catch?.(() => {});
      if (tok !== this._waveTok || !this.isConnected) return;
      const data = audioBuf.getChannelData(0), bars = 160, block = Math.max(1, Math.floor(data.length / bars));
      const peaks = new Float32Array(bars);
      for (let i = 0; i < bars; i++) { let max = 0; const start = i * block; for (let j = 0; j < block; j++) { const v = Math.abs(data[start + j] || 0); if (v > max) max = v; } peaks[i] = max; }
      this._peaks = peaks;
      this.classList.add('has-wave');
    } catch { this._peaks = null; }
    this._drawWave();
  }
  _drawWave() {
    const c = this._canvas, peaks = this._peaks;
    if (!peaks || !this._waveWrap.clientWidth) { c.width = 0; return; }
    const dpr = win.devicePixelRatio || 1, w = this._waveWrap.clientWidth, hh = this._waveWrap.clientHeight || 48;
    c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const dur = this._media.duration || 0, cur = this._media.currentTime || 0;
    const playedFrac = dur ? cur / dur : 0;
    const n = peaks.length, gap = c.width / n, barW = Math.max(1, gap * 0.6);
    const styles = getComputedStyle(this);
    const played = styles.getPropertyValue('--o-c').trim() || styles.getPropertyValue('--o-primary').trim() || '#4f46e5';
    const rest = styles.getPropertyValue('--o-border-strong').trim() || '#cbd5e1';
    const rtl = isRTL(this);
    for (let i = 0; i < n; i++) {
      const frac = i / n;
      const played2 = rtl ? frac >= 1 - playedFrac : frac <= playedFrac;
      ctx.fillStyle = played2 ? played : rest;
      const bh = Math.max(c.height * 0.08, peaks[i] * c.height);
      const x = i * gap + (gap - barW) / 2;
      ctx.fillRect(x, (c.height - bh) / 2, barW, bh);
    }
  }
  _paintPlay() {
    const playing = !this._media.paused && !this._media.ended;
    this._playBtn.innerHTML = ''; this._playBtn.append(iconEl(playing ? 'pause' : 'play'));
    this._playBtn.setAttribute('aria-label', this.t(playing ? 'player.pause' : 'player.play'));
    this.classList.toggle('is-playing', playing);
  }
  _paintTime() {
    const a = this._media, dur = a.duration || 0, cur = a.currentTime || 0;
    this._curEl.textContent = `${fmtTime(cur)} / ${fmtTime(dur)}`;
    const pct = dur ? clamp(cur / dur, 0, 1) * 100 : 0;
    this._flatPlayed.style.width = pct + '%';
    this._waveWrap.setAttribute('aria-valuemin', '0');
    this._waveWrap.setAttribute('aria-valuemax', String(Math.round(dur)));
    this._waveWrap.setAttribute('aria-valuenow', String(Math.round(cur)));
    this._waveWrap.setAttribute('aria-valuetext', `${fmtTime(cur)} / ${fmtTime(dur)}`);
    if (this._peaks) this._drawWave();
  }
  _paintVolume() {
    this._muteBtn.innerHTML = ''; this._muteBtn.append(iconEl(volumeIcon(this._media)));
    this._muteBtn.setAttribute('aria-label', this.t(this._media.muted ? 'player.unmute' : 'player.mute'));
    this._muteBtn.title = this._muteBtn.getAttribute('aria-label');
  }
  _openSpeed() {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
    playerMenu(this, this._speedBtn, rates.map(r => ({ value: r, label: r === 1 ? this.t('player.normal') : r + '×', checked: Math.abs(this._media.playbackRate - r) < 0.001 })), {
      label: this.t('player.speed'), onSelect: v => { this.setSpeed(+v); announce(this.t('player.speed') + ': ' + (+v === 1 ? this.t('player.normal') : v + '×')); },
    });
  }
  _ratio(e) { const r = this._waveWrap.getBoundingClientRect(); const v = clamp((e.clientX - r.left) / r.width, 0, 1); return isRTL(this) ? 1 - v : v; }
  _down(e) {
    if (e.button > 0 || !isFinite(this._media.duration) || !this._media.duration) return;
    this._scrubbing = true; this._wasPlaying = !this._media.paused;
    try { this._waveWrap.setPointerCapture(e.pointerId); } catch {}
    this._move(e);
  }
  _move(e) { if (!this._scrubbing) return; this.seek(this._ratio(e) * (this._media.duration || 0)); }
  _up() { if (!this._scrubbing) return; this._scrubbing = false; if (this._wasPlaying) this.play(); }
  _key(e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, textarea, select, [contenteditable], button')) return;
    const k = e.key;
    if (k === ' ') this.togglePlay();
    else if (k === 'ArrowRight') this.skip(5);
    else if (k === 'ArrowLeft') this.skip(-5);
    else if (k === 'Home') this.seek(0);
    else if (k === 'End') this.seek(this.duration);
    else if (k === 'm' || k === 'M') this.toggleMute();
    else return;
    e.preventDefault();
  }
}
define('o-audio', OAudio);
O.Audio = OAudio;
