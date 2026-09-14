/* <o-video> — custom video player built on the native <video> element (light DOM, no shadow root).
 *   <o-video src="clip.webm" poster="poster.jpg" tracks='[{"src":"en.vtt","label":"English","srclang":"en","kind":"subtitles"}]'
 *            chapters="chapters.vtt" preview-thumbs="thumbs.vtt" playlist='[{"src":"b.webm","title":"Part 2"}]'
 *            autoplay loop muted controls label="Product demo"></o-video>
 * A <video> may also be built from declarative <track> children (read once in setup()) when the `tracks` prop is empty.
 * Methods: play(), pause(), togglePlay(), seek(t), skip(delta), setVolume(v), toggleMute(), setSpeed(rate),
 *          setCaptions(index|-1), requestPiP(), toggleFullscreen(), next(), prev()
 * Getters: currentTime, duration, paused, ended, volume, muted, playbackRate, videoElement
 * Events: o-play, o-pause, o-ended, o-timeupdate {currentTime,duration}, o-volumechange {volume,muted},
 *         o-ratechange {rate}, o-error {error}, o-pipchange {active}, o-playlistchange {index,item}
 * Keyboard (focus inside): Space/K play-pause, J/L ±10s, ←/→ ±5s, ↑/↓ volume, Home/End, M mute, F fullscreen,
 *          C cycle captions, 0-9 seek to a tenth of the duration. Controls auto-hide during playback.
 */
class OVideo extends OElement {
  static props = {
    src: String, poster: String, tracks: { type: Array, default: () => [] }, chapters: String, previewThumbs: String,
    playlist: { type: Array, default: () => [] }, index: { type: Number, default: 0 },
    autoplay: Boolean, loop: Boolean, muted: Boolean, controls: { type: Boolean, default: true },
    crossorigin: String, label: String, texts: Object,
  };

  get currentTime() { return this._media ? this._media.currentTime : 0; }
  set currentTime(v) { this.seek(+v); }
  get duration() { return this._media ? this._media.duration || 0 : 0; }
  get paused() { return !this._media || this._media.paused; }
  get ended() { return !!this._media && this._media.ended; }
  get volume() { return this._media ? this._media.volume : 1; }
  get playbackRate() { return this._media ? this._media.playbackRate : 1; }
  get videoElement() { return this._media; }

  setup() {
    this.classList.add('o-video');
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this._declaredTracks = $$(':scope > track', this);
    this._declaredTracks.forEach(t => t.remove());
    this._chapterCues = []; this._thumbCues = []; this._curSrc = '';

    const v = this._media = h('video', { class: 'o-video-media', playsinline: true, 'webkit-playsinline': '', preload: 'metadata' });
    this._big = h('button', { type: 'button', class: 'o-video-bigplay' }, iconEl('play'));
    this._spinner = h('div', { class: 'o-video-spinner', role: 'status', 'aria-hidden': 'true' }, h('span', { class: 'o-spinner o-spinner-lg o-spinner-inherit' }));
    this._retryBtn = h('button', { type: 'button', class: 'o-btn o-btn-sm o-btn-soft-primary' });
    this._errorBox = h('div', { class: 'o-video-error' }, icon('alert-triangle'), h('p', {}), this._retryBtn);
    this._titleEl = h('div', { class: 'o-video-title-overlay' });

    this._seekBuffered = h('div', { class: 'o-video-seek-buffered' });
    this._seekChapters = h('div', { class: 'o-video-seek-chapters' });
    this._seekPlayed = h('div', { class: 'o-video-seek-played' });
    this._seekThumbEl = h('div', { class: 'o-video-seek-thumb' });
    this._seekTrack = h('div', { class: 'o-video-seek-track' }, this._seekBuffered, this._seekChapters, this._seekPlayed, this._seekThumbEl);
    this._previewImg = h('div', { class: 'o-video-preview-img' });
    this._previewTime = h('div', { class: 'o-video-preview-time' });
    this._preview = h('div', { class: 'o-video-preview', hidden: true }, this._previewImg, this._previewTime);
    this._seek = h('div', { class: 'o-video-seek', role: 'slider', tabindex: '0', 'aria-orientation': 'horizontal' }, this._seekTrack, this._preview);
    this._curEl = h('span', { class: 'o-video-time o-video-time-current' }, '0:00');
    this._durEl = h('span', { class: 'o-video-time o-video-time-duration' }, '0:00');
    this._seekRow = h('div', { class: 'o-video-seek-row' }, this._curEl, this._seek, this._durEl);

    const btn = (a, name) => h('button', { type: 'button', class: 'o-video-btn', 'data-a': a }, iconEl(name));
    this._playBtn = btn('play', 'play');
    this._prevBtn = btn('prev', 'skip-back');
    this._nextBtn = btn('next', 'skip-forward');
    this._muteBtn = btn('mute', 'volume-2');
    this._volRange = h('input', { type: 'range', class: 'o-range o-video-volume-range', min: 0, max: 1, step: 0.05, value: 1 });
    this._volGroup = h('div', { class: 'o-video-volume' }, this._muteBtn, this._volRange);
    this._speedBtn = h('button', { type: 'button', class: 'o-video-btn o-video-speed', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, '1×');
    this._ccBtn = btn('captions', 'captions');
    this._pipBtn = btn('pip', 'picture-in-picture');
    this._fsBtn = btn('fullscreen', 'maximize');
    this._row = h('div', { class: 'o-video-row' }, this._playBtn, this._prevBtn, this._nextBtn, this._volGroup,
      h('span', { class: 'o-video-spacer' }), this._speedBtn, this._ccBtn, this._pipBtn, this._fsBtn);
    this._controls = h('div', { class: 'o-video-controls' }, this._seekRow, this._row);
    this._frame = h('div', { class: 'o-video-frame' }, v, this._titleEl, this._big, this._spinner, this._errorBox, this._controls);
    this.append(this._frame);

    /* native media events */
    on(v, 'play', () => { this.classList.add('is-playing'); this.classList.remove('is-ended'); this._paintPlayBtn(); this.emit('play'); this._wake(); });
    on(v, 'pause', () => { this.classList.remove('is-playing'); clearTimeout(this._idleT); this.classList.remove('is-idle'); this._paintPlayBtn(); this.emit('pause'); });
    on(v, 'ended', () => { this.classList.add('is-ended'); this._paintPlayBtn(); this.emit('ended'); if (this.playlist.length) this.next(); });
    on(v, 'timeupdate', () => { if (!this._scrubbing) this._paintTime(v.currentTime, v.duration); this.emit('timeupdate', { currentTime: v.currentTime, duration: v.duration || 0 }); });
    on(v, 'progress', () => this._paintBuffered());
    on(v, 'loadedmetadata durationchange', () => { this._paintTime(v.currentTime, v.duration); this._paintChapters(); this._paintBuffered(); this.emit('loadedmetadata', { duration: v.duration || 0 }); });
    on(v, 'volumechange', () => { this._paintVolume(); this.emit('volumechange', { volume: v.volume, muted: v.muted }); });
    on(v, 'ratechange', () => { this._speedBtn.textContent = v.playbackRate === 1 ? '1×' : round(v.playbackRate, 2) + '×'; this.emit('ratechange', { rate: v.playbackRate }); });
    on(v, 'waiting seeking', () => this.classList.add('is-waiting'));
    on(v, 'playing canplay loadeddata seeked', () => this.classList.remove('is-waiting'));
    on(v, 'error', () => { if (v.error && this._curSrc) { this.classList.add('is-error'); this.classList.remove('is-waiting'); this._errorBox.querySelector('p').textContent = this.t('player.error'); this.emit('error', { error: v.error }); } });
    on(v, 'enterpictureinpicture', () => { this._pipBtn.classList.add('is-active'); this.emit('pipchange', { active: true }); });
    on(v, 'leavepictureinpicture', () => { this._pipBtn.classList.remove('is-active'); this.emit('pipchange', { active: false }); });

    /* controls */
    on(this._big, 'click', () => { this.togglePlay(); this.focus(); });
    on(this._frame, 'click', e => { if (e.target === v) { this.togglePlay(); this.focus(); } });
    on(this._playBtn, 'click', () => this.togglePlay());
    on(this._prevBtn, 'click', () => this.prev());
    on(this._nextBtn, 'click', () => this.next());
    on(this._muteBtn, 'click', () => this.toggleMute());
    on(this._volRange, 'input', () => this.setVolume(+this._volRange.value));
    on(this._speedBtn, 'click', () => this._openSpeed());
    on(this._ccBtn, 'click', () => this._openCaptions());
    on(this._pipBtn, 'click', () => this.requestPiP());
    on(this._fsBtn, 'click', () => this.toggleFullscreen());
    on(this._retryBtn, 'click', () => this._retry());

    /* seek bar */
    on(this._seek, 'pointerdown', e => this._seekDown(e));
    on(this._seek, 'pointermove', e => this._seekMove(e));
    on(this._seek, 'pointerup pointercancel lostpointercapture', e => this._seekUp(e));
    on(this._seek, 'pointerenter', () => { this._hovering = true; });
    on(this._seek, 'pointerleave', () => { this._hovering = false; if (!this._scrubbing) this._preview.hidden = true; });

    /* keyboard + auto-hide */
    on(this, 'keydown', e => this._key(e));
    on(this._frame, 'pointermove', rafThrottle(() => this._wake()));
    on(this._frame, 'pointerdown', () => this._wake());
    on(this, 'focusin', () => this._wake());
  }
  connected() { this.listen(doc, 'fullscreenchange', () => this._paintFullscreen()); }
  disconnected() { this._media?.pause(); clearTimeout(this._idleT); }

  update(changed) {
    const v = this._media;
    if (changed.has('muted') || changed.has('init')) v.muted = !!this.muted;
    if (changed.has('autoplay') || changed.has('init')) v.autoplay = !!this.autoplay;
    if (changed.has('crossorigin') || changed.has('init')) { if (this.crossorigin) v.crossOrigin = this.crossorigin; else v.removeAttribute('crossorigin'); }
    if (changed.has('loop') || changed.has('playlist') || changed.has('init')) v.loop = !!this.loop && this.playlist.length < 2;
    if (changed.has('controls') || changed.has('init')) { this.classList.toggle('is-bare', !this.controls); v.controls = !this.controls; }
    if (changed.has('label') || changed.has('init')) { if (this.label) this.setAttribute('aria-label', this.label); else this.removeAttribute('aria-label'); }
    if (changed.has('src') || changed.has('poster') || changed.has('tracks') || changed.has('playlist') || changed.has('index') || changed.has('chapters') || changed.has('previewThumbs') || changed.has('init')) this._applyItem();
    this._retryBtn.textContent = this.t('player.retry');
    this._seek.setAttribute('aria-label', (this.label ? this.label + ' — ' : '') + this.t('player.seek'));
    this._speedBtn.setAttribute('aria-label', this.t('player.speed')); this._speedBtn.title = this.t('player.speed');
    this._ccBtn.setAttribute('aria-label', this.t('player.captions')); this._ccBtn.title = this.t('player.captions');
    this._pipBtn.setAttribute('aria-label', this.t('player.pip')); this._pipBtn.title = this.t('player.pip');
    this._prevBtn.setAttribute('aria-label', this.t('player.previous'));
    this._nextBtn.setAttribute('aria-label', this.t('player.next'));
    this._paintVolume(); this._paintPip(); this._paintFullscreen(); this._paintPlayBtn();
  }

  /* ── public API ── */
  play() { return this._media.play().catch(() => {}); }
  pause() { this._media.pause(); }
  togglePlay() { (this._media.paused || this._media.ended) ? this.play() : this.pause(); }
  seek(t) { const d = this._media.duration; this._media.currentTime = clamp(+t || 0, 0, isFinite(d) ? d : 1e9); }
  skip(d) { this.seek((this._media.currentTime || 0) + d); }
  setVolume(v) { const vol = clamp(+v || 0, 0, 1); this._media.volume = vol; if (vol > 0 && this._media.muted) this._media.muted = false; }
  toggleMute() { this._media.muted = !this._media.muted; }
  setSpeed(r) { this._media.playbackRate = +r || 1; }
  setCaptions(i) {
    const tracks = this._ccTracks();
    tracks.forEach((t, idx) => { t.mode = idx === i ? 'showing' : 'disabled'; });
    this._paintCaptionsBtn();
    announce(i < 0 || i == null ? this.t('player.captionsOff') : (tracks[i]?.label || this.t('player.captions')));
  }
  async requestPiP() {
    try { if (doc.pictureInPictureElement) await doc.exitPictureInPicture(); else if (this._media.requestPictureInPicture) await this._media.requestPictureInPicture(); } catch {}
  }
  toggleFullscreen() { doc.fullscreenElement === this._frame ? doc.exitFullscreen?.().catch(noop) : this._frame.requestFullscreen?.().catch(noop); }
  next() { const n = this.playlist.length; if (n < 2) return; let i = this.index + 1; if (i >= n) { if (!this.loop) return; i = 0; } this._wantPlay = !this._media.paused; this.index = i; }
  prev() { const n = this.playlist.length; if (n < 2) return; let i = this.index - 1; if (i < 0) { if (!this.loop) return; i = n - 1; } this._wantPlay = !this._media.paused; this.index = i; }

  /* ── playlist / source ── */
  _current() {
    const pl = this.playlist && this.playlist[this.index];
    return pl
      ? { src: pl.src, poster: pl.poster, tracks: pl.tracks || [], chapters: pl.chapters, previewThumbs: pl.previewThumbs, title: pl.title }
      : { src: this.src, poster: this.poster, tracks: this.tracks || [], chapters: this.chapters, previewThumbs: this.previewThumbs, title: this.label };
  }
  _applyItem() {
    const it = this._current(), v = this._media;
    const changedSrc = (it.src || '') !== this._curSrc;
    const emitPl = changedSrc && this.playlist.length && this._curSrc !== '';
    this._curSrc = it.src || '';
    if (changedSrc) {
      this.classList.remove('is-error', 'is-ended', 'is-waiting');
      if (it.tracks && it.tracks.length) {
        $$('track', v).forEach(t => t.remove());
        it.tracks.forEach(tr => v.append(h('track', { kind: tr.kind || 'subtitles', src: tr.src, srclang: tr.srclang || '', label: tr.label || tr.srclang || '', default: !!tr.default })));
      } else if (this._declaredTracks.length && !v.querySelector('track')) v.append(...this._declaredTracks);
      v.poster = it.poster || '';
      v.src = it.src || '';
      if (it.src) v.load();
      this._paintTime(0, 0);
    }
    this._chapterCues = []; this._thumbCues = [];
    this._loadExtras(it);
    this._titleEl.textContent = it.title || '';
    this._titleEl.hidden = !it.title;
    const n = this.playlist.length;
    this._prevBtn.hidden = this._nextBtn.hidden = n < 2;
    this._prevBtn.disabled = !this.loop && this.index <= 0;
    this._nextBtn.disabled = !this.loop && this.index >= n - 1;
    this._paintCaptionsBtn();
    this._paintPlayBtn();
    if (emitPl) this.emit('playlistchange', { index: this.index, item: it });
    if (this._wantPlay) { this._wantPlay = false; this.play(); }
  }
  _retry() { this.classList.remove('is-error'); this._media.load(); }
  async _loadExtras(it) {
    const tok = (this._extraTok = (this._extraTok || 0) + 1);
    const [chapterCues, thumbCues] = await Promise.all([fetchVTT(it.chapters), fetchVTT(it.previewThumbs)]);
    if (tok !== this._extraTok || !this.isConnected) return;
    this._chapterCues = chapterCues;
    this._thumbCues = thumbCues.map(c => ({ ...c, thumb: parseThumbCue(c.text, it.previewThumbs) }));
    this._paintChapters();
  }

  /* ── painting ── */
  _paintPlayBtn() {
    const playing = !this._media.paused && !this._media.ended;
    [this._playBtn, this._big].forEach(b => { b.innerHTML = ''; b.append(iconEl(playing ? 'pause' : 'play')); b.setAttribute('aria-label', this.t(playing ? 'player.pause' : 'player.play')); });
    this._big.hidden = playing || !this._curSrc;
  }
  _paintTime(cur, dur) {
    dur = isFinite(dur) ? dur : 0;
    this._curEl.textContent = fmtTime(cur);
    this._durEl.textContent = fmtTime(dur);
    const pct = dur ? clamp(cur / dur, 0, 1) * 100 : 0;
    this._seekPlayed.style.width = pct + '%';
    this._seekThumbEl.style.insetInlineStart = pct + '%';
    this._seek.setAttribute('aria-valuemin', '0');
    this._seek.setAttribute('aria-valuemax', String(Math.round(dur)));
    this._seek.setAttribute('aria-valuenow', String(Math.round(cur)));
    this._seek.setAttribute('aria-valuetext', `${fmtTime(cur)} / ${fmtTime(dur)}`);
  }
  _paintBuffered() {
    const dur = this._media.duration, b = this._media.buffered;
    if (!isFinite(dur) || !dur) { this._seekBuffered.replaceChildren(); return; }
    const frags = [];
    for (let i = 0; i < b.length; i++) frags.push(h('span', { class: 'o-video-seek-range', style: `inset-inline-start:${clamp(b.start(i) / dur * 100, 0, 100)}%;width:${clamp((b.end(i) - b.start(i)) / dur * 100, 0, 100)}%` }));
    this._seekBuffered.replaceChildren(...frags);
  }
  _paintChapters() {
    const dur = this._media.duration;
    if (!isFinite(dur) || !dur || !this._chapterCues.length) { this._seekChapters.replaceChildren(); return; }
    this._seekChapters.replaceChildren(...this._chapterCues.filter(c => c.start > 0.05).map(c => h('span', { class: 'o-video-seek-chapter', style: `inset-inline-start:${clamp(c.start / dur * 100, 0, 100)}%`, title: c.text })));
  }
  _paintVolume() {
    const v = this._media, muted = v.muted || v.volume === 0;
    this._muteBtn.innerHTML = '';
    this._muteBtn.append(iconEl(muted ? 'volume-x' : v.volume < 0.5 ? 'volume-1' : 'volume-2'));
    this._muteBtn.setAttribute('aria-label', this.t(muted ? 'player.unmute' : 'player.mute'));
    this._muteBtn.title = this._muteBtn.getAttribute('aria-label');
    this._volRange.setAttribute('aria-label', this.t('player.volume'));
    if (doc.activeElement !== this._volRange) this._volRange.value = String(muted ? 0 : v.volume);
  }
  _paintPip() { this._pipBtn.hidden = !(isBrowser && doc.pictureInPictureEnabled && !this._media.disablePictureInPicture); }
  _paintFullscreen() {
    const fs = doc.fullscreenElement === this._frame;
    this.classList.toggle('is-fullscreen', fs);
    this._fsBtn.innerHTML = String(icon(fs ? 'minimize' : 'maximize'));
    this._fsBtn.setAttribute('aria-label', this.t(fs ? 'player.exitFullscreen' : 'player.fullscreen'));
  }
  _ccTracks() { return this._media ? [...this._media.textTracks].filter(t => t.kind === 'subtitles' || t.kind === 'captions') : []; }
  _paintCaptionsBtn() {
    const tracks = this._ccTracks();
    this._ccBtn.hidden = !tracks.length;
    this._ccBtn.classList.toggle('is-active', tracks.some(t => t.mode === 'showing'));
  }
  _cycleCaptions() { const tracks = this._ccTracks(); if (!tracks.length) return; const cur = tracks.findIndex(t => t.mode === 'showing'); this.setCaptions(cur + 1 >= tracks.length ? -1 : cur + 1); }
  _openSpeed() {
    const rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    this._menuOpen = true; this._wake();
    playerMenu(this, this._speedBtn, rates.map(r => ({ value: r, label: r === 1 ? this.t('player.normal') : r + '×', checked: Math.abs(this._media.playbackRate - r) < 0.001 })), {
      label: this.t('player.speed'),
      onSelect: v => { this.setSpeed(+v); announce(this.t('player.speed') + ': ' + (+v === 1 ? this.t('player.normal') : v + '×')); },
      onClosed: () => { this._menuOpen = false; this._wake(); },
    });
  }
  _openCaptions() {
    const tracks = this._ccTracks(), cur = tracks.findIndex(t => t.mode === 'showing');
    const items = [{ value: -1, label: this.t('player.captionsOff'), checked: cur < 0 }, ...tracks.map((t, i) => ({ value: i, label: t.label || t.language || '#' + (i + 1), checked: i === cur }))];
    this._menuOpen = true; this._wake();
    playerMenu(this, this._ccBtn, items, { label: this.t('player.captions'), onSelect: v => this.setCaptions(+v), onClosed: () => { this._menuOpen = false; this._wake(); } });
  }

  /* ── seek bar gestures ── */
  _seekMove(e) {
    const dur = this._media.duration;
    if (!isFinite(dur) || !dur) return;
    const rect = this._seekTrack.getBoundingClientRect();
    const visual = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const t = (isRTL(this) ? 1 - visual : visual) * dur;
    if (this._scrubbing) { this._media.currentTime = t; this._paintTime(t, dur); this.emit('seek', { time: t }); }
    this._showPreview(visual, t, rect);
  }
  _seekDown(e) {
    if (e.button > 0 || !isFinite(this._media.duration) || !this._media.duration) return;
    this._scrubbing = true;
    this._wasPlaying = !this._media.paused;
    if (this._wasPlaying) this._media.pause();
    try { this._seek.setPointerCapture(e.pointerId); } catch {}
    this.classList.add('is-scrubbing');
    this._seekMove(e);
  }
  _seekUp() {
    if (!this._scrubbing) return;
    this._scrubbing = false;
    this.classList.remove('is-scrubbing');
    if (this._wasPlaying) this.play();
    if (!this._hovering) this._preview.hidden = true;
    this._wake();
  }
  _showPreview(visual, t, rect) {
    this._previewTime.textContent = fmtTime(t);
    const cue = this._thumbCues.find(c => t >= c.start && t < c.end);
    if (cue && cue.thumb) {
      const th = cue.thumb;
      this._previewImg.hidden = false;
      if (th.w) css(this._previewImg, { width: th.w, height: th.h, backgroundImage: `url("${th.url}")`, backgroundPosition: `-${th.x}px -${th.y}px`, backgroundSize: '' });
      else css(this._previewImg, { width: 160, height: 90, backgroundImage: `url("${th.url}")`, backgroundPosition: '0 0', backgroundSize: 'cover' });
    } else this._previewImg.hidden = true;
    const x = clamp(rect.width * visual, 44, Math.max(44, rect.width - 44));
    this._preview.style.left = x + 'px';
    this._preview.hidden = false;
  }

  /* ── keyboard & auto-hide ── */
  _key(e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, textarea, select, [contenteditable], button')) return;
    const k = e.key;
    if (k === ' ' || k === 'k' || k === 'K') this.togglePlay();
    else if (k === 'j' || k === 'J') this.skip(-10);
    else if (k === 'l' || k === 'L') this.skip(10);
    else if (k === 'ArrowRight') this.skip(5);
    else if (k === 'ArrowLeft') this.skip(-5);
    else if (k === 'ArrowUp') this.setVolume((this._media.muted ? 0 : this._media.volume) + 0.1);
    else if (k === 'ArrowDown') this.setVolume((this._media.muted ? 0 : this._media.volume) - 0.1);
    else if (k === 'Home') this.seek(0);
    else if (k === 'End') this.seek(this.duration);
    else if (k === 'm' || k === 'M') this.toggleMute();
    else if ((k === 'f' || k === 'F') && doc.fullscreenEnabled) this.toggleFullscreen();
    else if ((k === 'c' || k === 'C') && this._ccTracks().length) this._cycleCaptions();
    else if (/^[0-9]$/.test(k)) this.seek((+k / 10) * (this.duration || 0));
    else return;
    e.preventDefault();
    this._wake();
  }
  _wake() { this.classList.remove('is-idle'); this._scheduleIdle(); }
  _scheduleIdle(ms = 2600) {
    clearTimeout(this._idleT);
    if (!this._media || this._media.paused || this._menuOpen || this._scrubbing) return;
    this._idleT = setTimeout(() => this.classList.add('is-idle'), ms);
  }
}
define('o-video', OVideo);
O.Video = OVideo;
