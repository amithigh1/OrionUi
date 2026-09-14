# Players — `<o-video>`, `<o-audio>`, `data-o-video-preview`

Custom, fully-keyboard-accessible controls built on the native `<video>`/`<audio>` elements (light DOM — no
shadow root, so theming and forms just work). Zero third-party dependencies; captions use native `<track>`
elements so text-track parsing and rendering stay in the browser.

## `<o-video>`

```html
<o-video src="clip.webm" poster="poster.jpg"
         tracks='[{"src":"en.vtt","label":"English","srclang":"en","kind":"subtitles","default":true}]'
         chapters="chapters.vtt" preview-thumbs="thumbs.vtt" label="Product demo"></o-video>
```

| Attribute | Property | Type | Default | Description |
|---|---|---|---|---|
| `src` / `poster` | `src` / `poster` | `string` | — | Media source and poster image. |
| `tracks` | `tracks` | `array` | `[]` | `[{ src, label, srclang, kind, default }]`. When empty, declarative `<track>` children (read once, in `setup()`) are used instead. |
| `chapters` | `chapters` | `url` | — | A WebVTT file; each cue's start time becomes a tick mark on the seek bar (cue text is the tooltip). |
| `preview-thumbs` | `previewThumbs` | `url` | — | A WebVTT file mapping time ranges to a thumbnail image, optionally a sprite region via `#xywh=x,y,w,h` — shown while hovering or dragging the seek bar. |
| `playlist` | `playlist` | `array` | `[]` | `[{ src, poster, title, tracks, chapters, previewThumbs }]`; each item overrides the matching top-level property. Shows previous/next buttons when it has 2+ items. |
| `index` | `index` | `number` | `0` | Current playlist position (get/set). |
| `autoplay` / `loop` / `muted` | — | `boolean` | `false` | Standard media flags (`loop` wraps the playlist instead of a single item once one is set). |
| `controls` | `controls` | `boolean` | `true` | `false` swaps in the browser's native control bar instead of this component's UI. |
| `crossorigin` | `crossorigin` | `string` | — | Forwarded to the underlying `<video>` (needed to read captions/frames cross-origin). |
| `label` / `texts` | — | `string` / `object` | — | Accessible name / per-instance string overrides. |

### Methods & getters

| Member | Description |
|---|---|
| `play()` / `pause()` / `togglePlay()` | |
| `seek(t)` / `skip(delta)` | Seconds; `skip` is relative to the current time. |
| `setVolume(v)` / `toggleMute()` | `v` is 0–1. |
| `setSpeed(rate)` | E.g. `0.5`–`2`. |
| `setCaptions(index)` | `-1` (or omitted) turns captions off; otherwise the index into the subtitle/caption `<track>`s. |
| `requestPiP()` | Toggles Picture-in-Picture (hidden when unsupported). |
| `toggleFullscreen()` | |
| `next()` / `prev()` | Playlist navigation (no-op without a playlist). |
| `currentTime`, `duration`, `paused`, `ended`, `volume`, `playbackRate`, `videoElement` | Getters. `videoElement` is the underlying `<video>` for anything not covered above. |

### Events

`o-play`, `o-pause`, `o-ended`, `o-seek { time }`, `o-timeupdate { currentTime, duration }`,
`o-volumechange { volume, muted }`, `o-ratechange { rate }`, `o-error { error }`, `o-pipchange { active }`,
`o-playlistchange { index, item }`, `o-loadedmetadata { duration }`.

### Keyboard (focus anywhere inside the player)

| Key | Action |
|---|---|
| `Space` / `K` | Play / pause. |
| `J` / `L` | Seek −10s / +10s. |
| `←` / `→` | Seek −5s / +5s (mirrored by the seek bar's own logical layout under RTL). |
| `↑` / `↓` | Volume +10% / −10%. |
| `Home` / `End` | Start / end. |
| `M` | Mute / unmute. |
| `F` | Fullscreen. |
| `C` | Cycle captions (including off). |
| `0`–`9` | Seek to that tenth of the duration. |

Controls auto-hide a couple of seconds after the pointer stops moving during playback (never while paused, a
menu is open, or the seek bar is being dragged) and reappear on any interaction. The seek bar is
`role="slider"` with a live `aria-valuetext`; volume is a native `<input type="range">`.

## `<o-audio>`

```html
<o-audio src="song.mp3" title="Song title" artist="Artist name" cover="cover.jpg" loop
         playlist='[{"src":"b.mp3","title":"Track 2"}]'></o-audio>
```

| Attribute | Property | Type | Default | Description |
|---|---|---|---|---|
| `src` / `title` / `artist` / `cover` | same | `string` | — | Source and metadata shown next to the cover art. |
| `waveform` | `waveform` | `boolean` | `true` | Decode the source with the Web Audio API and draw peaks on a canvas; click/drag to seek. Falls back to a plain progress bar when decoding fails (CORS, unsupported format) or this is `false`. |
| `loop` | `loop` | `boolean` | `false` | |
| `playlist` / `index` | array / number | `[]` / `0` | `[{ src, title, artist, cover }]`. |

**Methods:** `play()`, `pause()`, `togglePlay()`, `seek(t)`, `skip(delta)`, `setSpeed(rate)`, `toggleLoop()`,
`toggleMute()`, `download()` (same-origin/blob/data URLs download directly; cross-origin URLs are fetched
first), `next()`, `prev()`.
**Getters:** `currentTime`, `duration`, `paused`, `ended`, `playbackRate`, `audioElement`.
**Events:** `o-play`, `o-pause`, `o-ended`, `o-timeupdate { currentTime, duration }`, `o-ratechange { rate }`,
`o-error { error }`, `o-playlistchange { index, item }`.
**Keyboard:** `Space` play/pause, `←`/`→` ±5s, `Home`/`End`, `M` mute.

## `data-o-video-preview`

```html
<a class="card" data-o-video-preview data-src="clip.webm" data-poster="poster.jpg">
  <img src="poster.jpg" alt="">
</a>
```

Hover (or focus) a card and, after a short delay, a muted looping `<video>` fades in over the poster and plays;
leaving/blurring fades it back out. Stays on the poster under `prefers-reduced-motion`.

| Attribute | Description |
|---|---|
| `data-src` / `data-poster` | Preview clip and poster image. |
| `data-o-video-preview-delay` | Hover delay before the clip starts, in ms (default `250`). |

## CSS

`.o-video*` (dark player chrome — the control bar always uses dark tokens regardless of page theme, like a
real video overlay), `.o-video-menu*` (speed/captions popups), `.o-video-preview-media` (the injected preview
`<video>`), `.o-audio*` (a normal light/dark-aware card). Everything else follows the surrounding theme and RTL
automatically through design tokens and logical CSS properties.
