# Recorder — `<o-audio-recorder>`, `<o-video-recorder>`

```html
<o-audio-recorder name="memo" max-duration="120" level-meter waveform></o-audio-recorder>
<o-video-recorder source="camera"></o-video-recorder>
<o-video-recorder source="screen"></o-video-recorder>
<o-video-recorder source="both"></o-video-recorder>   <!-- screen + camera PiP, composited on canvas -->
```

```js
const memo = await Orion.recorder.audio({ maxDuration: 60 }); // modal helper -> File | null
const clip = await Orion.recorder.video({ source: 'screen' });
```

## `<o-audio-recorder>` (form-associated — value is the recorded `File`)

Attributes: `max-duration` (seconds) · `format` (MediaRecorder mimeType override) · `level-meter` / `waveform`
(visualizers, both default on) · `device-id`.
Property: `stream` (property only, see "Testing with no microphone/camera/screen" below).
Methods: `start()` `pause()` `resume()` `stop()` `reRecord()` `download()`.
Events: `o-start` `o-pause` `o-resume` `o-stop { file }` `o-change { value }` `o-error { reason, message }`.

## `<o-video-recorder source="camera | screen | both">`

Attributes: `source` · `max-duration` · `format` · `facing` (camera/both).
Properties: `file` (last recording) · `stream` (property only, see "Testing with no microphone/camera/screen" below).
Methods: `start()` `pause()` `resume()` `stop()` `reRecord()` `download()`.
Events: `o-start` `o-pause` `o-resume` `o-stop { file }` `o-error { reason, message }`.

`source="both"` requests both `getDisplayMedia` and `getUserMedia`, draws the screen full-frame plus a rounded
camera picture-in-picture onto a canvas each animation frame, mixes the two audio tracks (when both exist) through
a `MediaStreamAudioDestinationNode`, and records `canvas.captureStream()` + the mixed audio track. Stopping the
browser's native "stop sharing" control also stops the recording.

## Testing with no microphone/camera/screen

Both elements accept a `stream` property (not an attribute — set it in JS): a `MediaStream`-like value assigned
directly as the `MediaRecorder` input, skipping `getUserMedia()`/`getDisplayMedia()` entirely (and the
support-reason check that would otherwise gate on secure context / API availability). `canvas.captureStream()`
produces a real video-only `MediaStream` with no camera involved — combine it with a synthesized audio track
(`AudioContext.createMediaStreamDestination()` fed by an oscillator, or just its own silent track) for
`<o-audio-recorder>`, whose level meter needs at least one audio track to attach an `AnalyserNode` to (it now
skips the meter gracefully, instead of throwing, when the injected stream has none):

```js
const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
setInterval(() => canvas.getContext('2d').fillRect(0, 0, 320, 240), 100); // keep the video track producing frames
const videoStream = canvas.captureStream(30);

const audioCtx = new AudioContext();
const dest = audioCtx.createMediaStreamDestination();
const osc = audioCtx.createOscillator(); osc.connect(dest); osc.start();

const rec = document.querySelector('o-audio-recorder');
rec.stream = dest.stream;                      // <o-audio-recorder>: needs an audio track
await rec.start(); /* ... */ rec.stop();        // real MediaRecorder round-trip -> o-stop { file }

const vrec = document.querySelector('o-video-recorder');       // source="camera" (the default) still applies
vrec.stream = new MediaStream([...videoStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
await vrec.start(); /* ... */ vrec.stop();
```

`Orion.recorder.audio()`/`.video()` (the modal helpers) do not expose `stream` — test the elements directly, or
pass `props: { stream }` through `opts.props`, which is forwarded via `Object.assign(el, opts.props)`.

## Notes / limitations

* Every mode shows a clear state panel for permission-denied / no-device / insecure-context / unsupported /
  hardware-busy, with a retry button where retrying makes sense.
* All `MediaStream` tracks, the `AudioContext` and object URLs are released on `stop`, `reRecord` and disconnect.
* `MediaRecorder` output format depends on the browser (Chromium: WebM/VP9+Opus by default); pass `format` to force
  a specific `mimeType` your browser support matrix requires.
