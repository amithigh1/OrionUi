# Speech — `Orion.speech`, `data-o-voice`, `<o-tts>`

Speech-to-text (the Web Speech `SpeechRecognition` API) and text-to-speech (`speechSynthesis`) as a plain service,
a voice-dictation behavior for text inputs, and a small "read this aloud" element with word-by-word highlighting.
Both engines are optional browser APIs — every entry point degrades to a documented "unsupported" state, and both
can be swapped for a fake implementation so the whole package is testable with no microphone or audio output.

```html
<input data-o-voice data-o-voice-lang="fr-FR">
<textarea data-o-voice data-o-voice-continuous="false"></textarea>
<div contenteditable data-o-voice></div>

<o-tts text="Hello from Orion Admin." rate="1"></o-tts>
```

```js
const session = Orion.speech.listen({
  lang: 'en-US', interim: true, continuous: true,
  onResult: ({ transcript, isFinal }) => console.log(isFinal ? 'final:' : 'interim:', transcript),
  onEnd: (info) => console.log('ended', info),
});
session.stop();   // or .abort()

const handle = Orion.speech.speak('Hello world', {
  rate: 1, pitch: 1, onBoundary: e => console.log('word at', e.charIndex), onEnd: () => console.log('done'),
});
handle.pause(); handle.resume(); handle.cancel();
```

## `Orion.speech` API

| Member | Description |
|---|---|
| `supported` | `true` when a `SpeechRecognition` constructor (native or injected) is available. |
| `synthSupported` | `true` when `speechSynthesis` (native or injected) is available. |
| `voices()` | Current `SpeechSynthesisVoice[]` (may be empty until the engine has loaded its list). |
| `voicesReady()` | `Promise<SpeechSynthesisVoice[]>` — resolves once the voice list is non-empty (or immediately if unsupported). |
| `listen(opts)` | Starts recognition. `opts`: `lang`, `interim` (default `true`), `continuous` (default `true`), `onResult({ transcript, isFinal, confidence })`, `onStart()`, `onEnd({ error? })`. Returns `{ stop(), abort() }`. |
| `speak(text, opts)` | Speaks `text`. `opts`: `lang`, `voice` (name/`voiceURI` string or a `SpeechSynthesisVoice`), `rate`, `pitch`, `volume`, `onBoundary(e)`, `onStart()`, `onEnd({ error? })`, `onError(e)`. Returns `{ cancel(), pause(), resume(), utterance }`. |
| `recognition.use(fakeCtor)` | Inject a fake `SpeechRecognition` constructor (see Testing). Call with no argument to restore the native one. |
| `synthesis.use(fakeSynth)` | Inject a fake `speechSynthesis`-like object (see Testing). Call with no argument to restore the native one. |

`listen()` restarts recognition automatically on a native `onend` while `continuous` is still true and `stop()`
wasn't called (some browsers end a session after a pause even in continuous mode); `abort()` skips that restart.

## `data-o-voice` (dictation)

Adds a mic button to `<input>`, `<textarea>` or a `contenteditable` element (`.o-input-action` inside the shared
`.o-input-wrap`, created automatically if the element isn't already wrapped). While listening, interim text is
shown greyed — inline (`contenteditable`) or in a small floating bubble below the field — and committed at the
caret when a chunk is final. Silence for `data-o-voice-silence` ms (default 4000) auto-stops.

| Attribute | Description |
|---|---|
| `data-o-voice-lang` | BCP-47 language tag; defaults to the current `Orion` locale. |
| `data-o-voice-continuous` | `"false"` stops after the first final result instead of listening continuously. |
| `data-o-voice-silence` | Auto-stop timeout in ms after the last result (default `4000`). |

The button is `disabled` with an "unsupported" title when `Orion.speech.supported` is false at the moment the
behavior initializes the element (inject a fake recognition engine before inserting the element into the DOM to
test the enabled path — see Testing).

## `<o-tts>` (read text aloud, with highlight-as-spoken)

Reads its `text` prop (falling back to its light-DOM text content, read once on connect) aloud via
`Orion.speech.speak()`. Each word is wrapped in its own `<span class="o-tts-word">`; the word currently being
spoken gets `.is-current` from the utterance's `onboundary` events (`name: 'word'` boundaries — most engines,
including every fake built for these tests, report those; a few real engines only report sentence boundaries, in
which case no word is highlighted but playback still works).

| Prop (attribute) | Type | Default | Notes |
|---|---|---|---|
| `text` | string | `''` | Falls back to the element's light-DOM text content if empty. |
| `lang` | string | `''` | BCP-47 tag; defaults to the current `Orion` locale like `speak()`. |
| `voice` | string | `''` | A voice `name`/`voiceURI` (looked up via `Orion.speech.voices()`). |
| `rate` / `pitch` / `volume` | number | `1` / `1` / `1` | Forwarded to `speak()`. |
| `highlight` | boolean | `true` | Wrap words in spans for the "current word" style; `false` renders plain text. |

Methods: `play()` (from the start) · `pause()` · `resume()` · `stop()` (also clears the highlight).
Events: `o-start` · `o-boundary { charIndex }` · `o-end` · `o-error { error }` (`error: 'unsupported'` when
`synthSupported` is false).

## Testing with no microphone or audio output

Both engines can be swapped for a fake with no browser speech support (or hardware) needed at all:

```js
class FakeRecognition {
  start() {
    this._t = setTimeout(() => {
      const result = [{ transcript: 'hello world', confidence: 0.9 }]; // result[0] is the top alternative
      result.isFinal = true;
      this.onresult?.({ resultIndex: 0, results: [result] });
    }, 0);
  }
  stop() { clearTimeout(this._t); this.onend?.(); }
  abort() { clearTimeout(this._t); this.onend?.(); }
}
Orion.speech.recognition.use(FakeRecognition);
// ... exercise data-o-voice / Orion.speech.listen() ...
Orion.speech.recognition.use();   // restore the native constructor

const fakeSynth = {
  _voices: [{ name: 'Fake Voice', voiceURI: 'fake', lang: 'en-US' }],
  getVoices() { return this._voices; },
  speak(u) { setTimeout(() => { u.onstart?.(); u.onboundary?.({ name: 'word', charIndex: 0 }); u.onend?.(); }, 0); },
  cancel() {}, pause() {}, resume() {},
};
Orion.speech.synthesis.use(fakeSynth);
// ... exercise Orion.speech.speak() / <o-tts> ...
Orion.speech.synthesis.use();     // restore the native speechSynthesis
```

`Orion.speech.supported`/`.synthSupported` re-evaluate live against whichever engine is currently installed, so
toggling `unsupported` states (pass `undefined`/`null` to `.use()`, or a falsy fake) is also directly testable.

## Accessibility

* The mic button always has an `aria-label`/`title` (Start/Stop voice input) and `aria-pressed` reflects listening
  state; `announce()` reports "Listening…" and voice-input errors to assistive tech.
* `<o-tts>`'s status text is a `role="status"` region; its toolbar buttons are real, labelled `<button>`s.
* Voice input inserts real text into the field and dispatches a native `input` event, so it plays well with any
  other validation/formatting already attached to it.

## Limitations

* `SpeechRecognition` has no Firefox support as of this writing; `speechSynthesis` voice lists and `onboundary`
  granularity (word vs. sentence, or not fired at all for very short utterances) vary by browser/OS/voice.
* Recognition and synthesis both require user-initiated audio permission in some browsers/contexts; `listen()`
  surfaces the failure through `onEnd({ error })` rather than a separate permission-state UI (unlike camera/mic
  recording, `SpeechRecognition` does not expose a stable set of `DOMException` names to distinguish "denied" from
  "no microphone" — callers needing that distinction should pair it with `navigator.mediaDevices.getUserMedia`).
