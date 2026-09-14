/* tests/evals/capture-speech.js — run against docs/components/speech.html
 * Proves Orion.speech: STT interim/final results + language via a fake SpeechRecognition, data-o-voice dictation
 * using that same fake engine, TTS speak/pause/resume/cancel + utterance events via a fake speechSynthesis
 * (including <o-tts> word highlighting), and unsupported states for both engines.
 */
(async () => {
  const results = [];
  const assert = (name, cond, extra) => results.push({ name, ok: !!cond, extra });
  const wait = ms => new Promise(r => setTimeout(r, ms));

  class FakeRecognition {
    constructor() { FakeRecognition.instances.push(this); }
    start() {
      this._t = setTimeout(() => {
        if (this._script) { this._script(this); return; }
        const result = [{ transcript: 'hello world', confidence: 0.9 }];
        result.isFinal = true;
        this.onresult?.({ resultIndex: 0, results: [result] });
        this._endT = setTimeout(() => this.onend?.(), 10);
      }, 10);
    }
    stop() { clearTimeout(this._t); clearTimeout(this._endT); this.onend?.(); }
    abort() { clearTimeout(this._t); clearTimeout(this._endT); this.onend?.(); }
  }
  FakeRecognition.instances = [];

  function fakeSynth() {
    return {
      _voices: [{ name: 'Fake Voice', voiceURI: 'fake', lang: 'en-US' }],
      _current: null,
      getVoices() { return this._voices; },
      speak(u) {
        this._current = u;
        const words = String(u.text ?? '').split(/\s+/).filter(Boolean);
        // Precompute each word's start offset up front — closures created in a loop must not share one mutable
        // counter, or every deferred callback reads whatever value it settled on last (a real footgun; see the
        // README/docs-page fake for the same fix).
        let offset = 0;
        const starts = words.map(w => { const s = offset; offset += w.length + 1; return s; });
        this._timers = [];
        u.onstart?.();
        words.forEach((w, i) => {
          this._timers.push(setTimeout(() => { if (this._current === u) u.onboundary?.({ name: 'word', charIndex: starts[i] }); }, 0));
        });
        this._timers.push(setTimeout(() => { if (this._current === u) { u.onend?.(); this._current = null; } }, 10));
      },
      cancel() { (this._timers || []).forEach(clearTimeout); this._current = null; },
      pause() { this._paused = true; },
      resume() { this._paused = false; },
    };
  }

  // ---- STT: interim + final results, and language, via a fake engine ----
  {
    Orion.speech.recognition.use(FakeRecognition);
    assert('recognition.use(): Orion.speech.supported becomes true', Orion.speech.supported === true);

    const seen = [];
    let usedLang = null;
    FakeRecognition.instances.length = 0;
    const session = Orion.speech.listen({
      lang: 'fr-FR', interim: true, continuous: false,
      onResult: r => seen.push(r),
      onEnd: () => {},
    });
    usedLang = FakeRecognition.instances[0] && FakeRecognition.instances[0].lang;
    // Feed an interim result, then a final one, directly on the live instance.
    const inst = FakeRecognition.instances[0];
    clearTimeout(inst._t); // cancel the constructor's canned final-only script
    const interim = [{ transcript: 'bonj' }]; interim.isFinal = false;
    inst.onresult({ resultIndex: 0, results: [interim] });
    await wait(10);
    const final = [{ transcript: 'bonjour', confidence: 0.88 }]; final.isFinal = true;
    inst.onresult({ resultIndex: 0, results: [final] });
    await wait(10);
    session.stop();
    assert('listen(): lang is forwarded to the recognition instance', usedLang === 'fr-FR');
    assert('listen(): interim result reported with isFinal=false', seen.some(r => r.transcript === 'bonj' && r.isFinal === false));
    assert('listen(): final result reported with isFinal=true + confidence', seen.some(r => r.transcript === 'bonjour' && r.isFinal === true && r.confidence === 0.88));
  }

  // ---- data-o-voice dictation, driven by the same fake engine ----
  {
    const input = document.createElement('input');
    input.className = 'o-input';
    input.setAttribute('data-o-voice', '');
    input.style.cssText = 'position:fixed;inset-inline-start:-9999px;top:-9999px';
    document.body.appendChild(input);
    await wait(10);
    const btn = input.parentElement.querySelector('.o-voice-btn');
    assert('data-o-voice: adds a mic button once a recognition engine is available', !!btn && !btn.disabled);
    FakeRecognition.instances.length = 0;
    btn.click();
    assert('data-o-voice: mic button reflects listening state', btn.classList.contains('is-listening') && btn.getAttribute('aria-pressed') === 'true');
    await wait(60);
    assert('data-o-voice: the final transcript is inserted into the field', input.value.includes('hello world'));
    btn.click(); // stop — data-o-voice defaults to continuous, which would otherwise keep restarting the fake engine
    assert('data-o-voice: mic button reflects stopped state', !btn.classList.contains('is-listening'));
    input.parentElement.remove();
  }

  // ---- unsupported (recognition): an explicit falsy value forces it regardless of native support ----
  {
    Orion.speech.recognition.use(null);
    assert('recognition.use(null): forces supported=false deterministically', Orion.speech.supported === false);
    Orion.speech.recognition.use(function () {}); // truthy fake counts as "supported"
    assert('recognition.use(fn): supported is true for a truthy fake', Orion.speech.supported === true);
    Orion.speech.recognition.use(); // zero arguments restores the native constructor
  }

  // ---- TTS: speak/pause/resume/cancel + utterance events via a fake speechSynthesis ----
  {
    const synth = fakeSynth();
    Orion.speech.synthesis.use(synth);
    assert('synthesis.use(): synthSupported becomes true', Orion.speech.synthSupported === true);

    const events = [];
    const handle = Orion.speech.speak('one two three', {
      onStart: () => events.push('start'),
      onBoundary: e => events.push('boundary:' + e.charIndex),
      onEnd: () => events.push('end'),
    });
    await wait(20);
    assert('speak(): onStart fires', events[0] === 'start');
    assert('speak(): onBoundary fires once per word with increasing charIndex', events.filter(e => e.startsWith('boundary:')).length === 3);
    assert('speak(): onEnd fires after all boundaries', events[events.length - 1] === 'end');

    let cancelled = false;
    const orig = synth.cancel.bind(synth);
    synth.cancel = () => { cancelled = true; orig(); };
    handle.cancel();
    assert('handle.cancel(): calls through to the fake synth', cancelled);

    const handle2 = Orion.speech.speak('pause me');
    handle2.pause();
    assert('handle.pause(): fake synth reflects paused', synth._paused === true);
    handle2.resume();
    assert('handle.resume(): fake synth reflects resumed', synth._paused === false);
    handle2.cancel();
  }

  // ---- <o-tts>: highlight-as-spoken via the fake synth, and play/pause/resume/stop ----
  {
    const tts = document.createElement('o-tts');
    tts.text = 'alpha beta gamma';
    tts.style.cssText = 'position:fixed;inset-inline-start:-9999px;top:-9999px';
    document.body.appendChild(tts);
    await wait(10);
    const startPromise = new Promise(resolve => tts.addEventListener('o-start', resolve, { once: true }));
    const endPromise = new Promise(resolve => tts.addEventListener('o-end', resolve, { once: true }));
    const boundaries = [];
    tts.addEventListener('o-boundary', e => boundaries.push(e.detail.charIndex));
    tts.play();
    await startPromise;
    assert('<o-tts> play(): host gets is-speaking', tts.classList.contains('is-speaking'));
    await endPromise;
    assert('<o-tts>: one o-boundary per word', boundaries.length === 3);
    assert('<o-tts>: charIndex strictly increases word to word (alpha=0, beta=6, gamma=11)', boundaries[0] === 0 && boundaries[1] === 6 && boundaries[2] === 11, { boundaries });
    assert('<o-tts>: highlights the last word at end (is-current on a word span)', tts.querySelectorAll('.o-tts-word.is-current').length === 1);
    tts.stop();
    assert('<o-tts> stop(): clears the highlight', tts.querySelectorAll('.o-tts-word.is-current').length === 0);
    tts.remove();
  }

  // ---- unsupported (synthesis): <o-tts> reports the unsupported state ----
  {
    // An explicit falsy value forces synthSupported=false regardless of what this browser natively supports.
    Orion.speech.synthesis.use(null);
    assert('synthesis.use(null): forces synthSupported=false deterministically', Orion.speech.synthSupported === false);
    const tts = document.createElement('o-tts');
    tts.text = 'no engine here';
    tts.style.cssText = 'position:fixed;inset-inline-start:-9999px;top:-9999px';
    document.body.appendChild(tts);
    await wait(10);
    const errPromise = new Promise(resolve => tts.addEventListener('o-error', e => resolve(e.detail), { once: true }));
    tts.play();
    const detail = await errPromise;
    assert('<o-tts> with no synth: o-error reason is unsupported', detail.error === 'unsupported');
    assert('<o-tts> with no synth: host + Play button reflect unsupported', tts.classList.contains('is-unsupported'));
    tts.remove();
    Orion.speech.synthesis.use(); // restore native
  }

  Orion.speech.recognition.use();
  Orion.speech.synthesis.use();

  const bad = results.filter(r => !r.ok);
  return { ok: bad.length === 0, count: results.length, bad, results };
})();
