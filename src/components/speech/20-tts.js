/* Text-to-speech element — <o-tts>: reads its text aloud via Orion.speech.speak(), highlighting each word as it is
 * spoken (from the utterance's onboundary 'word' events) when the engine reports them.
 *   <o-tts text="Hello world" lang="en-US" rate="1" pitch="1" voice="Google UK English Female"></o-tts>
 *   <o-tts>Reads this light-DOM text instead of the `text` attribute.</o-tts>
 * Props: text lang voice rate pitch volume highlight
 * Methods: play() pause() resume() stop()
 * Events: o-start · o-boundary { charIndex } · o-end · o-error { error }
 */
i18n.add('en', {
  tts: {
    play: 'Play', pause: 'Pause', stop: 'Stop', unsupported: 'Text-to-speech is not supported in this browser',
  },
});

class OTts extends OElement {
  static props = {
    text: { type: String, default: '' },
    lang: { type: String, default: '' },
    voice: { type: String, default: '' },
    rate: { type: Number, default: 1 },
    pitch: { type: Number, default: 1 },
    volume: { type: Number, default: 1 },
    highlight: { type: Boolean, default: true },
    texts: { type: Object, attr: false },
  };

  setup() {
    this.classList.add('o-tts');
    this._handle = null;
    this._paused = false;
    this._words = [];
    this._sourceText = '';

    this._textEl = h('div', { class: 'o-tts-text' });
    this._playBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon', 'aria-label': this.t('tts.play'), title: this.t('tts.play') }, icon('play', { size: 16 }));
    on(this._playBtn, 'click', () => this._toggle());
    this._stopBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon', hidden: true, 'aria-label': this.t('tts.stop'), title: this.t('tts.stop') }, icon('square', { size: 14 }));
    on(this._stopBtn, 'click', () => this.stop());
    this._statusEl = h('span', { class: 'o-tts-status', role: 'status' });
    this._toolbar = h('div', { class: 'o-tts-toolbar' }, this._playBtn, this._stopBtn, this._statusEl);
    this.append(this._toolbar, this._textEl);
  }

  connected() {
    if (!this.text) this._sourceText = (this.textContent || '').trim();
    this._renderText();
    this._syncSupport();
    this.listen(doc, 'o-locale', () => this._retranslate());
  }
  update(changed) {
    if (changed.has('text') && !changed.has('init')) { this._sourceText = this.text; this._renderText(); }
    if (changed.has('highlight') && !changed.has('init')) this._renderText();
    if (changed.has('locale')) this._retranslate();
  }
  disconnected() { this.stop(); }

  _retranslate() {
    const label = this.t(this._handle && !this._paused ? 'tts.pause' : 'tts.play');
    this._playBtn.setAttribute('aria-label', label); this._playBtn.title = label;
    this._stopBtn.setAttribute('aria-label', this.t('tts.stop')); this._stopBtn.title = this.t('tts.stop');
  }
  _syncSupport() {
    const supported = O.speech.synthSupported;
    this._playBtn.disabled = !supported;
    this.classList.toggle('is-unsupported', !supported);
    this._statusEl.textContent = supported ? '' : this.t('tts.unsupported');
  }

  _text() { return this._sourceText || this.text || ''; }
  _renderText() {
    const text = this._text();
    this._words = [];
    if (!this.highlight) { this._textEl.textContent = text; return; }
    const frag = doc.createDocumentFragment();
    const re = /\S+|\s+/g;
    let m;
    while ((m = re.exec(text))) {
      if (/\S/.test(m[0])) {
        const span = h('span', { class: 'o-tts-word' }, m[0]);
        span.dataset.start = String(m.index);
        this._words.push(span);
        frag.append(span);
      } else frag.append(doc.createTextNode(m[0]));
    }
    this._textEl.replaceChildren(frag);
  }

  /** Start speaking from the beginning. */
  play() {
    this._syncSupport();
    if (!O.speech.synthSupported) { this.emit('error', { error: 'unsupported' }); return; }
    this.stop();
    const text = this._text();
    if (!text) return;
    this._paused = false;
    this._highlightWord(-1);
    this._handle = O.speech.speak(text, {
      lang: this.lang || undefined, voice: this.voice || undefined, rate: this.rate, pitch: this.pitch, volume: this.volume,
      onStart: () => { this._setPlaying(true); this.emit('start'); },
      onBoundary: e => { if (e && e.name && e.name !== 'word') return; const ci = e ? e.charIndex : 0; this._highlightAt(ci); this.emit('boundary', { charIndex: ci }); },
      onEnd: info => { this._handle = null; this._setPlaying(false); if (info && info.error) this.emit('error', info); else this.emit('end'); },
    });
  }
  /** Pause mid-utterance. */
  pause() { if (this._handle && !this._paused) { this._handle.pause(); this._paused = true; this._setPlaying(true); } }
  /** Resume a paused utterance. */
  resume() { if (this._handle && this._paused) { this._handle.resume(); this._paused = false; this._setPlaying(true); } }
  /** Stop and clear the highlight. */
  stop() { if (this._handle) { this._handle.cancel(); this._handle = null; } this._paused = false; this._setPlaying(false); this._highlightWord(-1); }

  _toggle() { if (!this._handle) this.play(); else if (this._paused) this.resume(); else this.pause(); }
  _setPlaying(on) {
    this._stopBtn.hidden = !on;
    this._playBtn.replaceChildren(iconEl(on && !this._paused ? 'pause' : 'play', { size: 16 }));
    this.classList.toggle('is-speaking', on && !this._paused);
    this.classList.toggle('is-paused', on && this._paused);
    this._retranslate();
  }
  _highlightAt(charIndex) {
    let idx = -1;
    for (let i = 0; i < this._words.length; i++) { if (+this._words[i].dataset.start <= charIndex) idx = i; else break; }
    this._highlightWord(idx);
  }
  _highlightWord(idx) { this._words.forEach((w, i) => w.classList.toggle('is-current', i === idx)); }
}
define('o-tts', OTts);
O.Tts = OTts;
