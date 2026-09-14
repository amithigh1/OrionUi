/* Audio recorder — <o-audio-recorder>: MediaRecorder with pause/resume, live level meter + scrolling waveform,
 * timer, auto-stop, playback, download, re-record, mic selection. Form-associated: value is the recorded File.
 *   <o-audio-recorder name="memo" max-duration="120" level-meter waveform></o-audio-recorder>
 * Methods: start() pause() resume() stop() reRecord() download()
 * Events: o-start o-pause o-resume o-stop { file } o-change { value } o-error { reason, message }
 * `stream` (property only) injects a MediaStream instead of getUserMedia() — the offline test path, see README.md.
 */
i18n.add('en', { recorder: { audioLabel: 'Audio recorder' } });

const AUDIO_MIME = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

class OAudioRecorder extends FormElement {
  static props = {
    ...FormElement.props,
    value: { type: Any, default: null },
    maxDuration: { type: Number, default: 0, attr: 'max-duration' },
    format: { type: String, default: '' },
    levelMeter: { type: Boolean, default: true, attr: 'level-meter' },
    waveform: { type: Boolean, default: true, attr: 'waveform' },
    deviceId: { type: String, default: '', attr: 'device-id' },
    /** Test/fixture path (property only): a MediaStream-like value (e.g. an oscillator routed through
     * `AudioContext.createMediaStreamDestination()`, or `canvas.captureStream()` for a video track) recorded
     * instead of calling getUserMedia() — lets a real MediaRecorder round-trip run with no microphone. See README.md. */
    stream: { type: Any, default: null, attr: false },
    texts: { type: Object, attr: false },
  };

  setup() {
    this.classList.add('o-recorder', 'o-audio-recorder');
    this._state = 'idle';
    this._chunks = []; this._stream = null; this._recorder = null; this._audioCtx = null; this._analyser = null;
    this._stopMeter = null; this._timer = null; this._elapsedMs = 0; this._url = null;

    this._micSelect = h('select', { class: 'o-select o-select-sm o-recorder-device', 'aria-label': this.t('recorder.micDevice') });
    on(this._micSelect, 'change', () => { this.deviceId = this._micSelect.value; });
    this._recDot = h('span', { class: 'o-recorder-dot', 'aria-hidden': 'true' });
    this._timeLabel = h('span', { class: 'o-recorder-time', 'aria-hidden': 'true' }, '00:00');
    this._levelBar = h('div', { class: 'o-recorder-level', hidden: !this.levelMeter }, h('div', { class: 'o-recorder-level-fill' }));
    this._waveCanvas = h('canvas', { class: 'o-recorder-wave', width: 320, height: 48, hidden: !this.waveform });
    this._progress = h('div', { class: 'o-progress o-recorder-progress', hidden: true }, h('div', { class: 'o-progress-bar' }));
    this._statePanel = h('div', { class: 'o-recorder-state', hidden: true });
    this._stage = h('div', { class: 'o-recorder-stage', role: 'group', 'aria-label': this.t('recorder.audioLabel') }, this._micSelect, this._recDot, this._timeLabel, this._levelBar, this._waveCanvas, this._progress, this._statePanel);

    this._recordBtn = h('button', { type: 'button', class: 'o-btn o-btn-primary', 'aria-label': this.t('recorder.record') }, icon('mic', { size: 16 }), h('span', null, this.t('recorder.record')));
    on(this._recordBtn, 'click', () => this.start());
    this._pauseBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost', hidden: true }, icon('pause', { size: 16 }), h('span', null, this.t('recorder.pause')));
    on(this._pauseBtn, 'click', () => this._state === 'paused' ? this.resume() : this.pause());
    this._stopBtn = h('button', { type: 'button', class: 'o-btn o-btn-danger', hidden: true }, icon('square', { size: 14 }), h('span', null, this.t('recorder.stop')));
    on(this._stopBtn, 'click', () => this.stop());
    this._liveControls = h('div', { class: 'o-recorder-controls' }, this._recordBtn, this._pauseBtn, this._stopBtn);

    const playerTag = isBrowser && customElements.get('o-audio') ? 'o-audio' : 'audio';
    this._player = doc.createElement(playerTag);
    if (playerTag === 'audio') this._player.controls = true;
    this._player.className = 'o-recorder-player';
    this._downloadBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm' }, icon('download', { size: 14 }), h('span', null, this.t('recorder.download')));
    on(this._downloadBtn, 'click', () => this.download());
    this._reRecordBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm' }, icon('rotate-ccw', { size: 14 }), h('span', null, this.t('recorder.reRecord')));
    on(this._reRecordBtn, 'click', () => this.reRecord());
    this._playbackControls = h('div', { class: 'o-recorder-playback', hidden: true }, this._player, h('div', { class: 'o-recorder-playback-actions' }, this._downloadBtn, this._reRecordBtn));

    this.append(this._stage, this._liveControls, this._playbackControls);
    this.focusTarget = this._recordBtn;
    this._refreshDevices();
  }
  connected() { this.listen(doc, 'o-locale', () => this._retranslate()); }
  disconnected() { this._teardown(); }
  update(changed) {
    if (changed.has('levelMeter')) this._levelBar.hidden = !this.levelMeter;
    if (changed.has('waveform')) this._waveCanvas.hidden = !this.waveform;
    if (changed.has('disabled') || changed.has('readonly')) this._syncDisabled();
    if (changed.has('locale')) this._retranslate();
  }
  _retranslate() {
    this._recordBtn.lastChild.textContent = this.t('recorder.record');
    this._pauseBtn.lastChild.textContent = this.t(this._state === 'paused' ? 'recorder.resume' : 'recorder.pause');
    this._stopBtn.lastChild.textContent = this.t('recorder.stop');
    this._downloadBtn.lastChild.textContent = this.t('recorder.download');
    this._reRecordBtn.lastChild.textContent = this.t('recorder.reRecord');
  }
  _syncDisabled() {
    const off = this.isDisabled || this.readonly;
    [this._recordBtn, this._pauseBtn, this._stopBtn, this._micSelect, this._downloadBtn, this._reRecordBtn].forEach(el => { el.disabled = off; });
  }
  async _refreshDevices() {
    const list = await recDevices('audioinput');
    this._micSelect.replaceChildren(...list.map(d => h('option', { value: d.deviceId, selected: d.deviceId === this.deviceId }, d.label)));
    this._micSelect.hidden = list.length < 2 || this._state !== 'idle';
  }

  _setState(state) {
    this._state = state;
    recRenderState(this._statePanel, state, this);
    const idle = state === 'idle', recording = state === 'recording', paused = state === 'paused', stopped = state === 'stopped';
    this._recordBtn.hidden = !idle;
    this._pauseBtn.hidden = !(recording || paused);
    this._pauseBtn.replaceChildren(iconEl(paused ? 'play' : 'pause', { size: 16 }), h('span', null, this.t(paused ? 'recorder.resume' : 'recorder.pause')));
    this._stopBtn.hidden = !(recording || paused);
    this._micSelect.hidden = !idle;
    this._recDot.classList.toggle('is-live', recording);
    this._levelBar.hidden = !this.levelMeter || !(recording || paused);
    this._waveCanvas.hidden = !this.waveform || !(recording || paused);
    this._progress.hidden = !this.maxDuration || !(recording || paused);
    this._playbackControls.hidden = !stopped;
    this._liveControls.hidden = stopped && !REC_META[state];
  }

  /** Request the microphone and start recording. */
  async start() {
    if (this._state === 'recording' || this._state === 'paused') return;
    if (!this.stream) {
      const reason = recSupportReason();
      if (reason) { this._setState(reason); this.emit('error', { reason, message: reason }); return; }
    }
    try {
      const stream = this.stream || await navigator.mediaDevices.getUserMedia({ audio: this.deviceId ? { deviceId: { exact: this.deviceId } } : true });
      this._stream = stream;
      this._chunks = [];
      const mime = this.format || recPickMime(AUDIO_MIME);
      this._recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      this._recorder.ondataavailable = e => { if (e.data && e.data.size) this._chunks.push(e.data); };
      this._recorder.onstop = () => this._finish();
      this._recorder.start(250);
      if (stream.getAudioTracks && stream.getAudioTracks().length) {
        try {
          this._audioCtx = new (win.AudioContext || win.webkitAudioContext)();
          this._analyser = this._audioCtx.createAnalyser(); this._analyser.fftSize = 512;
          this._audioCtx.createMediaStreamSource(stream).connect(this._analyser);
          this._stopMeter = recMeter(this._analyser, this._levelBar.querySelector('.o-recorder-level-fill'), this._waveCanvas);
        } catch {}
      }
      this._elapsedMs = 0;
      this._timer = setInterval(() => this._tick(), 100);
      this._setState('recording');
      announce(this.t('recorder.recording'));
      this.emit('start');
    } catch (err) {
      const reason2 = recNormalizeError(err);
      this._setState(reason2);
      this.emit('error', { reason: reason2, message: err.message });
    }
  }
  _tick() {
    if (this._state !== 'recording') return;
    this._elapsedMs += 100;
    this._timeLabel.textContent = fmt.duration(this._elapsedMs, 'clock');
    if (this.maxDuration) {
      this._progress.firstChild.style.width = Math.min(100, this._elapsedMs / (this.maxDuration * 1000) * 100) + '%';
      if (this._elapsedMs >= this.maxDuration * 1000) { announce(this.t('recorder.maxReached')); this.stop(); }
    }
  }
  /** Pause the current recording. */
  pause() { if (this._state !== 'recording') return; this._recorder.pause(); this._setState('paused'); announce(this.t('recorder.paused')); this.emit('pause'); }
  /** Resume a paused recording. */
  resume() { if (this._state !== 'paused') return; this._recorder.resume(); this._setState('recording'); announce(this.t('recorder.recording')); this.emit('resume'); }
  /** Stop recording and produce the File (also sets the form value). */
  stop() { if (this._state !== 'recording' && this._state !== 'paused') return; try { this._recorder.stop(); } catch {} }
  _finish() {
    const mime = this._recorder.mimeType || 'audio/webm';
    const blob = new Blob(this._chunks, { type: mime });
    const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
    const file = new File([blob], 'recording-' + Date.now() + '.' + ext, { type: mime });
    this._teardownStream();
    this._releaseUrl();
    this._url = URL.createObjectURL(file);
    this._player.src = this._url;
    this._setState('stopped');
    announce(this.t('recorder.recorded'));
    this.setValue(file);
    this.emit('stop', { file });
  }
  _teardownStream() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this._stopMeter) { this._stopMeter(); this._stopMeter = null; }
    recStopStream(this._stream); this._stream = null;
    if (this._audioCtx) { this._audioCtx.close().catch(() => {}); this._audioCtx = null; }
  }
  /** Detach the current object URL from the player BEFORE revoking it, and revoke a beat later: the player may be
   *  <o-audio> (when the player package is bundled), which hands the URL to its inner <audio> asynchronously — revoking
   *  synchronously made that in-flight load fail with ERR_FILE_NOT_FOUND. */
  _releaseUrl() {
    const url = this._url; this._url = null;
    if (!url) return;
    this._player.removeAttribute('src');
    if (this._player.tagName === 'AUDIO') { try { this._player.load(); } catch {} }
    setTimeout(() => URL.revokeObjectURL(url), 300);
  }
  _teardown() { this._teardownStream(); this._releaseUrl(); }
  /** Discard the recording and return to idle. */
  reRecord() {
    this._releaseUrl();
    this.setValue(null);
    announce(this.t('recorder.deleted'));
    this._refreshDevices();
    this._setState('idle');
  }
  /** Download the recorded file. */
  download() { if (this.value instanceof File) O.download(this.value, this.value.name); }

  getValidity() { return null; }
}
define('o-audio-recorder', OAudioRecorder);
O.AudioRecorder = OAudioRecorder;
