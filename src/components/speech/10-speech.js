/* Speech services + voice input behavior.
 *   Orion.speech.listen({ lang, interim, continuous, onResult, onEnd }) -> { stop(), abort() }
 *   Orion.speech.speak(text, { lang, voice, rate, pitch, volume, onBoundary, onEnd }) -> { cancel(), pause(), resume() }
 *   Orion.speech.voices() -> SpeechSynthesisVoice[]   Orion.speech.supported (recognition) / .synthSupported
 *   Orion.speech.recognition.use(fakeCtor) / Orion.speech.synthesis.use(fakeSynth) — inject a fake engine for
 *     tests/demos with no mic/audio-output involved (call with no argument to restore the native one).
 *   <input data-o-voice> / <textarea data-o-voice> / <div contenteditable data-o-voice>
 *     data-o-voice-lang="fr-FR" data-o-voice-continuous="false" data-o-voice-silence="3000"
 * Mic button lives in .o-input-wrap/.o-input-action (created automatically). Interim results are shown greyed —
 * inline (contenteditable) or in a small floating bubble (input/textarea) — and committed at the caret when final.
 */
i18n.add('en', {
  speech: {
    start: 'Start voice input', stop: 'Stop voice input', listening: 'Listening…',
    unsupported: 'Voice input is not supported in this browser', error: 'Voice input error',
  },
});

const NativeSpeechRecognitionCtor = isBrowser ? (win.SpeechRecognition || win.webkitSpeechRecognition) : null;
const nativeSpeechSynth = isBrowser ? win.speechSynthesis : null;
// Mutable so tests/demos can swap in a fake engine with no camera/mic/network involved (see README.md #testing).
let _recognitionCtor = NativeSpeechRecognitionCtor;
let _synth = nativeSpeechSynth;
/** Minimal plain-object stand-in for `SpeechSynthesisUtterance`, used only when a fake `speechSynthesis` is
 * injected in a browser that has no native Web Speech API at all (nothing but property storage is needed —
 * a fake `.speak()` implementation calls `.onstart`/`.onboundary`/`.onend` on it directly). */
class SpeechUtteranceShim {
  constructor(text) { this.text = text; this.lang = ''; this.voice = null; this.rate = 1; this.pitch = 1; this.volume = 1; this.onstart = this.onboundary = this.onend = this.onerror = null; }
}

O.speech = {
  /** Speech-to-text (Web Speech API, or an injected fake) support. Not available in Firefox as of this writing. */
  get supported() { return !!_recognitionCtor; },
  /** Text-to-speech (`speechSynthesis`, or an injected fake) support. */
  get synthSupported() { return !!_synth; },
  recognition: {
    /** Inject a fake `SpeechRecognition` constructor for tests/demos (no mic/network required); the fake must
     * implement `.start()/.stop()/.abort()` and set `.onresult/.onerror/.onend` like the real API. Call with **no
     * argument** to restore the browser's native constructor; call with an explicit falsy value (`null`/`false`)
     * to force `supported` to `false` regardless of what this browser natively supports (an "unsupported" test). */
    use(ctor) { _recognitionCtor = arguments.length ? ctor : NativeSpeechRecognitionCtor; },
  },
  synthesis: {
    /** Inject a fake `speechSynthesis`-like object for tests/demos: needs `.getVoices()`, `.speak(utterance)`,
     * `.cancel()`, `.pause()`, `.resume()` — call the utterance's `onstart`/`onboundary`/`onend`/`onerror`
     * directly from the fake's `.speak()`. Call with **no argument** to restore the native `speechSynthesis`; call
     * with an explicit falsy value (`null`/`false`) to force `synthSupported` to `false` regardless of what this
     * browser natively supports (an "unsupported" test). */
    use(synth) { _synth = arguments.length ? synth : nativeSpeechSynth; },
  },
  /** Currently available synthesis voices (populate lazily; listen once for a non-empty list after 'onvoiceschanged'). */
  voices() { return _synth ? _synth.getVoices() : []; },
  /** Resolve once the voice list is non-empty (or immediately if already known / unsupported). */
  voicesReady() {
    if (!_synth) return Promise.resolve([]);
    const list = _synth.getVoices();
    if (list.length) return Promise.resolve(list);
    return new Promise(resolve => {
      const done = () => { resolve(_synth.getVoices()); _synth.removeEventListener?.('voiceschanged', done); };
      if (_synth.addEventListener) _synth.addEventListener('voiceschanged', done);
      setTimeout(done, 1000);
    });
  },
  /** Continuous or single-shot speech recognition. onResult({ transcript, isFinal, confidence }) fires per chunk. */
  listen(opts = {}) {
    if (!_recognitionCtor) { queueMicrotask(() => opts.onEnd?.({ error: 'unsupported' })); return { stop: noop, abort: noop }; }
    const rec = new _recognitionCtor();
    rec.lang = opts.lang || i18n.locale || 'en-US';
    rec.interimResults = opts.interim !== false;
    rec.continuous = opts.continuous !== false;
    rec.maxAlternatives = 1;
    let stopped = false;
    rec.onresult = e => {
      let interimStr = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) opts.onResult?.({ transcript: r[0].transcript, isFinal: true, confidence: r[0].confidence });
        else interimStr += r[0].transcript;
      }
      if (interimStr) opts.onResult?.({ transcript: interimStr, isFinal: false });
    };
    rec.onerror = e => { if (e.error !== 'no-speech' && e.error !== 'aborted') { stopped = true; opts.onEnd?.({ error: e.error }); } };
    rec.onend = () => { if (!stopped && rec.continuous) { try { rec.start(); return; } catch {} } opts.onEnd?.({}); };
    try { rec.start(); opts.onStart?.(); } catch { queueMicrotask(() => opts.onEnd?.({ error: 'start-failed' })); }
    return {
      stop: () => { stopped = true; try { rec.stop(); } catch {} },
      abort: () => { stopped = true; try { rec.abort(); } catch {} },
    };
  },
  /** Speak text; returns a handle to cancel/pause/resume. */
  speak(text, opts = {}) {
    if (!_synth) { queueMicrotask(() => opts.onEnd?.({ error: 'unsupported' })); return { cancel: noop, pause: noop, resume: noop }; }
    const UtteranceCtor = (isBrowser && win.SpeechSynthesisUtterance) || SpeechUtteranceShim;
    const u = new UtteranceCtor(String(text ?? ''));
    u.lang = opts.lang || i18n.locale || 'en-US';
    if (opts.voice) { const list = _synth.getVoices(); u.voice = isStr(opts.voice) ? list.find(v => v.name === opts.voice || v.voiceURI === opts.voice) : opts.voice; }
    u.rate = opts.rate ?? 1; u.pitch = opts.pitch ?? 1; u.volume = opts.volume ?? 1;
    if (opts.onBoundary) u.onboundary = opts.onBoundary;
    u.onstart = () => opts.onStart?.();
    u.onend = () => opts.onEnd?.({});
    u.onerror = e => { opts.onError?.(e); opts.onEnd?.({ error: e.error }); };
    _synth.speak(u);
    return { cancel: () => _synth.cancel(), pause: () => _synth.pause(), resume: () => _synth.resume(), utterance: u };
  },
};

/* ── data-o-voice behavior ─────────────────────────────────────────────── */
function voiceWrapOf(el) {
  if (el.parentElement?.classList.contains('o-input-wrap')) return el.parentElement;
  const w = h('div', { class: 'o-input-wrap o-voice-wrap' });
  el.before(w); w.append(el); w.__oCreated = true;
  return w;
}
behavior('data-o-voice', el => {
  const isCE = el.isContentEditable;
  const wrap = voiceWrapOf(el);
  const supported = O.speech.supported;
  const btn = h('button', { type: 'button', class: 'o-input-action o-voice-btn', 'aria-pressed': 'false', 'aria-label': t('speech.start'), title: supported ? t('speech.start') : t('speech.unsupported'), disabled: !supported }, icon('mic', { size: 16 }));
  wrap.append(btn);
  if (!isCE) el.style.paddingInlineEnd = '2.5rem';

  let session = null, interimEl = null, bubble = null, savedRange = null, silenceTimer = null;

  const stopUI = () => {
    btn.classList.remove('is-listening'); btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', t('speech.start')); btn.title = t('speech.start');
    clearTimeout(silenceTimer);
    if (interimEl) { interimEl.remove(); interimEl = null; }
    if (bubble) { bubble.remove(); bubble = null; }
  };
  const resetSilence = () => { clearTimeout(silenceTimer); const ms = +el.dataset.oVoiceSilence || 4000; silenceTimer = setTimeout(() => stop(), ms); };
  const caretRange = () => {
    const sel = win.getSelection();
    if (sel && sel.rangeCount && el.contains(sel.anchorNode)) return sel.getRangeAt(0);
    const r = doc.createRange(); r.selectNodeContents(el); r.collapse(false); return r;
  };
  const insertText = text => {
    if (!text) return;
    if (isCE) {
      el.focus();
      const range = savedRange && el.contains(savedRange.startContainer) ? savedRange : caretRange();
      range.deleteContents();
      const node = doc.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node); range.collapse(true);
      const sel = win.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      savedRange = range.cloneRange();
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    } else {
      const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? start;
      const before = el.value.slice(0, start), after = el.value.slice(end);
      const proto = el.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      const sep = before && !/\s$/.test(before) ? ' ' : '';
      setter.call(el, before + sep + text + after);
      const pos = (before + sep + text).length;
      try { el.setSelectionRange(pos, pos); } catch {}
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
  };
  const showInterim = text => {
    if (isCE) {
      if (!text) { if (interimEl) { interimEl.remove(); interimEl = null; } return; }
      if (!interimEl) {
        el.focus();
        const range = caretRange();
        range.deleteContents();
        interimEl = doc.createElement('span'); interimEl.className = 'o-voice-interim'; interimEl.setAttribute('contenteditable', 'false');
        range.insertNode(interimEl);
        const after = doc.createRange(); after.setStartAfter(interimEl); after.collapse(true);
        const sel = win.getSelection(); sel.removeAllRanges(); sel.addRange(after);
        savedRange = after.cloneRange();
      }
      interimEl.textContent = text;
    } else {
      if (!text) { if (bubble) { bubble.remove(); bubble = null; } return; }
      if (!bubble) { bubble = h('div', { class: 'o-voice-bubble', role: 'status' }); wrap.append(bubble); }
      bubble.textContent = text;
    }
  };
  const start = () => {
    if (!supported || session) return;
    session = O.speech.listen({
      lang: el.dataset.oVoiceLang || i18n.locale,
      interim: true,
      continuous: el.dataset.oVoiceContinuous !== 'false',
      onResult: r => { resetSilence(); if (r.isFinal) { showInterim(''); insertText(r.transcript.trim()); } else showInterim(r.transcript); },
      onEnd: info => { session = null; stopUI(); if (info && info.error && info.error !== 'aborted') announce(t('speech.error')); },
    });
    btn.classList.add('is-listening'); btn.setAttribute('aria-pressed', 'true');
    btn.setAttribute('aria-label', t('speech.stop')); btn.title = t('speech.stop');
    announce(t('speech.listening'));
    resetSilence();
  };
  const stop = () => { session?.stop(); session = null; stopUI(); };
  on(btn, 'click', () => (session ? stop() : start()));
  const offLoc = bus.on('locale', () => { btn.title = supported ? t(session ? 'speech.stop' : 'speech.start') : t('speech.unsupported'); });
  return () => { offLoc(); stop(); btn.remove(); el.style.paddingInlineEnd = ''; if (wrap.__oCreated && wrap.children.length === 1 && el.isConnected) wrap.replaceWith(el); };
});
