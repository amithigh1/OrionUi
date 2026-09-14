/* Video recorder — <o-video-recorder source="camera|screen|both">: camera+mic preview, record/pause/stop, timer,
 * screen recording via getDisplayMedia, optional camera PiP composited on canvas for source="both", playback, download.
 *   <o-video-recorder source="both" max-duration="300"></o-video-recorder>
 * Methods: start() pause() resume() stop() reRecord() download()
 * Properties: file (last recorded File, or null) · stream (property only — injects a MediaStream instead of
 *   getUserMedia()/getDisplayMedia() for any `source` mode; the offline test path, see README.md)
 * Events: o-start o-pause o-resume o-stop { file } o-error { reason, message }
 */
i18n.add('en', { recorder: { videoLabel: 'Video recorder', sharingEnded: 'Screen sharing ended' } });

const VIDEO_MIME = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
const SOURCE_ICON = { camera: 'video', screen: 'monitor', both: 'layers' };
function recWaitReady(video) { return new Promise(resolve => { if (video.videoWidth) resolve(); else on(video, 'loadedmetadata', () => resolve(), { once: true }); }); }

class OVideoRecorder extends OElement {
  static props = {
    source: { type: String, default: 'camera', reflect: true },
    maxDuration: { type: Number, default: 0, attr: 'max-duration' },
    format: { type: String, default: '' },
    facing: { type: String, default: 'user' },
    /** Test/fixture path (property only): a MediaStream-like value (e.g. `canvas.captureStream()`) recorded
     * directly instead of calling getUserMedia()/getDisplayMedia() for any `source` mode — lets a real
     * MediaRecorder round-trip run with no camera/microphone/screen. See README.md. */
    stream: { type: Any, default: null, attr: false },
    texts: { type: Object, attr: false },
  };

  setup() {
    this.classList.add('o-recorder', 'o-video-recorder');
    this._state = 'idle'; this.file = null;
    this._chunks = []; this._primaryStream = null; this._screenStream = null; this._camStream = null;
    this._recorder = null; this._audioCtx = null; this._timer = null; this._elapsedMs = 0; this._url = null; this._compositeRaf = null;

    this._video = h('video', { class: 'o-recorder-video', muted: true, playsinline: true }); this._video.autoplay = true;
    this._canvas = h('canvas', { class: 'o-recorder-canvas', hidden: true });
    this._camHidden = h('video', { class: 'o-recorder-hidden-source', muted: true, playsinline: true }); this._camHidden.autoplay = true;
    this._screenHidden = h('video', { class: 'o-recorder-hidden-source', muted: true, playsinline: true }); this._screenHidden.autoplay = true;
    this._recDot = h('span', { class: 'o-recorder-dot', 'aria-hidden': 'true' });
    this._timeLabel = h('span', { class: 'o-recorder-time', 'aria-hidden': 'true' }, '00:00');
    this._progress = h('div', { class: 'o-progress o-recorder-progress', hidden: true }, h('div', { class: 'o-progress-bar' }));
    this._statePanel = h('div', { class: 'o-recorder-state', hidden: true });
    this._overlay = h('div', { class: 'o-recorder-overlay' }, this._recDot, this._timeLabel);
    this._stage = h('div', { class: 'o-recorder-stage o-recorder-stage-video', role: 'group', 'aria-label': this.t('recorder.videoLabel') },
      this._video, this._canvas, this._camHidden, this._screenHidden, this._overlay, this._progress, this._statePanel);

    this._recordBtn = h('button', { type: 'button', class: 'o-btn o-btn-primary' }, icon(SOURCE_ICON[this.source] || 'video', { size: 16 }), h('span', null, this.t('recorder.record')));
    on(this._recordBtn, 'click', () => this.start());
    this._pauseBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost', hidden: true }, icon('pause', { size: 16 }), h('span', null, this.t('recorder.pause')));
    on(this._pauseBtn, 'click', () => this._state === 'paused' ? this.resume() : this.pause());
    this._stopBtn = h('button', { type: 'button', class: 'o-btn o-btn-danger', hidden: true }, icon('square', { size: 14 }), h('span', null, this.t('recorder.stop')));
    on(this._stopBtn, 'click', () => this.stop());
    this._liveControls = h('div', { class: 'o-recorder-controls' }, this._recordBtn, this._pauseBtn, this._stopBtn);

    const playerTag = isBrowser && customElements.get('o-video') ? 'o-video' : 'video';
    this._player = doc.createElement(playerTag);
    if (playerTag === 'video') this._player.controls = true;
    this._player.className = 'o-recorder-player o-recorder-video-player';
    this._downloadBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm' }, icon('download', { size: 14 }), h('span', null, this.t('recorder.download')));
    on(this._downloadBtn, 'click', () => this.download());
    this._reRecordBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm' }, icon('rotate-ccw', { size: 14 }), h('span', null, this.t('recorder.reRecord')));
    on(this._reRecordBtn, 'click', () => this.reRecord());
    this._playbackControls = h('div', { class: 'o-recorder-playback', hidden: true }, this._player, h('div', { class: 'o-recorder-playback-actions' }, this._downloadBtn, this._reRecordBtn));

    this.append(this._stage, this._liveControls, this._playbackControls);
  }
  connected() { this.listen(doc, 'o-locale', () => this._retranslate()); }
  disconnected() { this._teardownStream(); this._releaseUrl(); }
  update(changed) {
    if (changed.has('source') && !changed.has('init')) this._recordBtn.replaceChildren(iconEl(SOURCE_ICON[this.source] || 'video', { size: 16 }), h('span', null, this.t('recorder.record')));
    if (changed.has('locale')) this._retranslate();
  }
  _retranslate() {
    this._recordBtn.lastChild.textContent = this.t('recorder.record');
    this._pauseBtn.lastChild.textContent = this.t(this._state === 'paused' ? 'recorder.resume' : 'recorder.pause');
    this._stopBtn.lastChild.textContent = this.t('recorder.stop');
    this._downloadBtn.lastChild.textContent = this.t('recorder.download');
    this._reRecordBtn.lastChild.textContent = this.t('recorder.reRecord');
  }

  _setState(state) {
    this._state = state;
    recRenderState(this._statePanel, state, this);
    const idle = state === 'idle', recording = state === 'recording', paused = state === 'paused', stopped = state === 'stopped';
    this._recordBtn.hidden = !idle;
    this._pauseBtn.hidden = !(recording || paused);
    this._pauseBtn.replaceChildren(iconEl(paused ? 'play' : 'pause', { size: 16 }), h('span', null, this.t(paused ? 'recorder.resume' : 'recorder.pause')));
    this._stopBtn.hidden = !(recording || paused);
    this._overlay.hidden = !(recording || paused);
    this._recDot.classList.toggle('is-live', recording);
    this._progress.hidden = !this.maxDuration || !(recording || paused);
    this._video.hidden = stopped || this.source === 'both' || !(recording || paused || state === 'starting');
    this._canvas.hidden = stopped || this.source !== 'both' || !(recording || paused);
    this._playbackControls.hidden = !stopped;
    this._stage.hidden = stopped;
  }

  /** Request the source stream(s) and start recording. */
  async start() {
    if (this._state === 'recording' || this._state === 'paused') return;
    if (!this.stream) {
      const needsDisplay = this.source !== 'camera';
      const reason = recSupportReason(needsDisplay);
      if (reason) { this._setState(reason); this.emit('error', { reason, message: reason }); return; }
    }
    this._setState('starting');
    try {
      let outStream;
      if (this.stream) {
        outStream = this.stream;
        this._primaryStream = outStream;
        this._video.srcObject = outStream; await this._video.play().catch(() => {});
      } else if (this.source === 'camera') {
        outStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.facing }, audio: true });
        this._primaryStream = outStream;
        this._video.srcObject = outStream; await this._video.play().catch(() => {});
      } else if (this.source === 'screen') {
        outStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        this._primaryStream = outStream;
        this._video.srcObject = outStream; await this._video.play().catch(() => {});
        on(outStream.getVideoTracks()[0], 'ended', () => { if (this._state === 'recording' || this._state === 'paused') { announce(this.t('recorder.sharingEnded')); this.stop(); } });
      } else {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        let camStream;
        try { camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.facing }, audio: true }); }
        catch (camErr) { recStopStream(screenStream); throw camErr; }
        this._screenStream = screenStream; this._camStream = camStream;
        this._screenHidden.srcObject = screenStream; this._camHidden.srcObject = camStream;
        await Promise.all([this._screenHidden.play().catch(() => {}), this._camHidden.play().catch(() => {}), recWaitReady(this._screenHidden)]);
        on(screenStream.getVideoTracks()[0], 'ended', () => { if (this._state === 'recording' || this._state === 'paused') { announce(this.t('recorder.sharingEnded')); this.stop(); } });
        this._canvas.width = this._screenHidden.videoWidth || 1280; this._canvas.height = this._screenHidden.videoHeight || 720;
        this._startComposite();
        const canvasStream = this._canvas.captureStream(30);
        const audioTracks = this._mixAudio(screenStream, camStream);
        outStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
        this._primaryStream = outStream;
      }
      this._chunks = [];
      const mime = this.format || recPickMime(VIDEO_MIME);
      this._recorder = new MediaRecorder(outStream, mime ? { mimeType: mime } : undefined);
      this._recorder.ondataavailable = e => { if (e.data && e.data.size) this._chunks.push(e.data); };
      this._recorder.onstop = () => this._finish();
      this._recorder.start(250);
      this._elapsedMs = 0;
      this._timer = setInterval(() => this._tick(), 100);
      this._setState('recording');
      announce(this.t('recorder.recording'));
      this.emit('start');
    } catch (err) {
      const reason2 = recNormalizeError(err);
      this._teardownStream();
      this._setState(reason2);
      this.emit('error', { reason: reason2, message: err && err.message });
    }
  }
  _startComposite() {
    const ctx = this._canvas.getContext('2d');
    const draw = () => {
      if (this._state !== 'recording' && this._state !== 'paused') return;
      const cw = this._canvas.width, ch = this._canvas.height;
      ctx.drawImage(this._screenHidden, 0, 0, cw, ch);
      const pw = Math.round(cw * 0.22), ph = Math.round(pw * ((this._camHidden.videoHeight / (this._camHidden.videoWidth || 1)) || 0.75));
      const px = cw - pw - 16, py = ch - ph - 16, r = 10;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(px + r, py); ctx.arcTo(px + pw, py, px + pw, py + ph, r); ctx.arcTo(px + pw, py + ph, px, py + ph, r);
      ctx.arcTo(px, py + ph, px, py, r); ctx.arcTo(px, py, px + pw, py, r); ctx.closePath();
      ctx.clip(); ctx.drawImage(this._camHidden, px, py, pw, ph); ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.stroke();
      this._compositeRaf = requestAnimationFrame(draw);
    };
    this._compositeRaf = requestAnimationFrame(draw);
  }
  _mixAudio(screenStream, camStream) {
    const aTracks = [...screenStream.getAudioTracks(), ...camStream.getAudioTracks()];
    if (aTracks.length <= 1) return aTracks;
    try {
      this._audioCtx = new (win.AudioContext || win.webkitAudioContext)();
      const dest = this._audioCtx.createMediaStreamDestination();
      if (screenStream.getAudioTracks().length) this._audioCtx.createMediaStreamSource(new MediaStream(screenStream.getAudioTracks())).connect(dest);
      if (camStream.getAudioTracks().length) this._audioCtx.createMediaStreamSource(new MediaStream(camStream.getAudioTracks())).connect(dest);
      return dest.stream.getAudioTracks();
    } catch { return [aTracks[0]]; }
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
  /** Stop recording and produce the File. */
  stop() { if (this._state !== 'recording' && this._state !== 'paused') return; try { this._recorder.stop(); } catch {} }
  _finish() {
    const mime = (this._recorder && this._recorder.mimeType) || 'video/webm';
    const blob = new Blob(this._chunks, { type: mime });
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([blob], 'recording-' + Date.now() + '.' + ext, { type: mime });
    this._teardownStream();
    this._releaseUrl();
    this._url = URL.createObjectURL(file);
    this._player.src = this._url;
    this.file = file;
    this._setState('stopped');
    announce(this.t('recorder.recorded'));
    this.emit('stop', { file });
  }
  _teardownStream() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this._compositeRaf) { cancelAnimationFrame(this._compositeRaf); this._compositeRaf = null; }
    recStopStream(this._screenStream); this._screenStream = null;
    recStopStream(this._camStream); this._camStream = null;
    recStopStream(this._primaryStream); this._primaryStream = null;
    if (this._audioCtx) { this._audioCtx.close().catch(() => {}); this._audioCtx = null; }
    if (this._video) this._video.srcObject = null;
    if (this._screenHidden) this._screenHidden.srcObject = null;
    if (this._camHidden) this._camHidden.srcObject = null;
  }
  /** Detach the object URL from the player before revoking it (a beat later): with the player package bundled the
   *  player is <o-video>, which hands the URL to its inner <video> asynchronously — a synchronous revoke made that
   *  in-flight load fail with ERR_FILE_NOT_FOUND. */
  _releaseUrl() {
    const url = this._url; this._url = null;
    if (!url) return;
    this._player.removeAttribute('src');
    if (this._player.tagName === 'VIDEO') { try { this._player.load(); } catch {} }
    setTimeout(() => URL.revokeObjectURL(url), 300);
  }
  /** Discard the recording and return to idle. */
  reRecord() {
    this._releaseUrl();
    this.file = null;
    announce(this.t('recorder.deleted'));
    this._setState('idle');
  }
  /** Download the recorded file. */
  download() { if (this.file) O.download(this.file, this.file.name); }
}
define('o-video-recorder', OVideoRecorder);
O.VideoRecorder = OVideoRecorder;
