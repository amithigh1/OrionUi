/* Player package — shared helpers used by <o-video>, <o-audio> and data-o-video-preview.
 * fmtTime(seconds) -> "1:05" | "1:02:03"   ·   parseVTT(text) -> [{ start, end, text }]
 * parseThumbCue(cueText) -> { url, x, y, w, h } | { url }   (sprite cues: "sheet.jpg#xywh=0,0,160,90")
 * playerMenu(owner, anchor, items, opts) -> opens a small floating menu (speed / captions) on the overlay stack
 */
i18n.add('en', {
  player: {
    play: 'Play', pause: 'Pause', mute: 'Mute', unmute: 'Unmute', volume: 'Volume', seek: 'Seek', speed: 'Playback speed',
    captions: 'Captions', captionsOff: 'Off', pip: 'Picture in picture', fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen',
    next: 'Next', previous: 'Previous', loop: 'Loop', download: 'Download', retry: 'Retry', error: 'This media could not be played',
    loading: 'Loading…', current: 'Current time', duration: 'Duration', normal: 'Normal', chapters: 'Chapters',
    playlist: 'Playlist', of: '{index} of {count}',
  },
});
const PLAYER_ICONS = {
  captions: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M7 13a2 2 0 1 1 0-4h1M15 13a2 2 0 1 1 0-4h1"/>',
  'picture-in-picture': '<path d="M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6"/><rect x="12" y="12" width="10" height="7" rx="1.5"/>',
};
O.icons.add(Object.fromEntries(Object.entries(PLAYER_ICONS).filter(([k]) => !O.icons.has(k))));

/** fmtTime(12.4) -> "0:12"  fmtTime(3725) -> "1:02:05" */
function fmtTime(s) {
  if (s == null || !isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = n => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
}
function vttTime(s) {
  const m = String(s).trim().match(/(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{1,3})/);
  if (!m) return 0;
  return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4].padEnd(3, '0')) / 1000;
}
/** parseVTT(text) -> [{ start, end, text }] — a minimal WebVTT/SRT cue parser (ignores cue settings & styling). */
function parseVTT(text) {
  const blocks = String(text || '').replace(/\r\n?/g, '\n').replace(/^﻿/, '').split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim() !== '');
    const li = lines.findIndex(l => l.includes('-->'));
    if (li < 0) continue;
    const m = lines[li].match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/);
    if (!m) continue;
    cues.push({ start: vttTime(m[1]), end: vttTime(m[2]), text: lines.slice(li + 1).join('\n').trim() });
  }
  return cues.sort((a, b) => a.start - b.start);
}
/** parseThumbCue("sheet.jpg#xywh=0,0,160,90") -> { url, x, y, w, h } */
function parseThumbCue(cueText, baseUrl) {
  const line = String(cueText || '').split('\n')[0].trim();
  const m = line.match(/^(.*?)(?:#xywh=(\d+),(\d+),(\d+),(\d+))?$/);
  if (!m || !m[1]) return null;
  const base = new URL(baseUrl || '', isBrowser ? location.href : undefined).href;
  const url = /^([a-z]+:)?\/\//i.test(m[1]) || m[1].startsWith('data:') ? m[1] : new URL(m[1], base).href;
  return m[2] ? { url, x: +m[2], y: +m[3], w: +m[4], h: +m[5] } : { url };
}
/** volumeIcon(mediaEl) -> 'volume-x' | 'volume-1' | 'volume-2' */
function volumeIcon(media) { return (media.muted || media.volume === 0) ? 'volume-x' : media.volume < 0.5 ? 'volume-1' : 'volume-2'; }
/** fileDownload(url, filename) — same-origin/blob/data downloads directly; cross-origin fetches first (falls back to opening the tab). */
async function fileDownload(url, name) {
  if (!url) return;
  try {
    const u = new URL(url, location.href);
    if (u.origin === location.origin || /^(blob|data):/.test(url)) return downloadURL(u.href, name);
    download(await (await fetch(u.href, { mode: 'cors' })).blob(), name);
  } catch { win.open(url, '_blank', 'noopener'); }
}
const __vttCache = new Map();
/** fetchVTT(url) -> Promise<[{start,end,text}]> (cached) */
function fetchVTT(url) {
  if (!url) return Promise.resolve([]);
  if (__vttCache.has(url)) return __vttCache.get(url);
  const p = fetch(url).then(r => r.ok ? r.text() : '').then(parseVTT).catch(() => []);
  __vttCache.set(url, p);
  return p;
}

/** Small floating menu used for the speed / captions buttons. items: [{ value, label, checked }] */
function playerMenu(owner, anchor, items, { onSelect, onClosed, label } = {}) {
  const menu = h('div', { class: 'o-video-menu o-theme-dark', role: 'menu', 'aria-label': label || '', tabindex: '-1' },
    items.map(it => h('button', { type: 'button', class: 'o-video-menu-item', role: 'menuitemradio', 'aria-checked': String(!!it.checked), 'data-v': it.value },
      h('span', { class: 'o-video-menu-check' }, it.checked ? icon('check') : null), h('span', {}, it.label))));
  portal(menu, anchor);
  menu.hidden = false;
  const unplace = autoPlace(menu, anchor, { placement: 'top-end', offset: 8, flip: true, size: true });
  const nav = new ListNav(menu, { items: '[role=menuitemradio]', orientation: 'vertical', onSelect: el => pick(el.dataset.v) });
  const ov = overlays.open({
    el: menu, owner, trap: false, outside: true, escape: true,
    onClose: reason => { unplace(); menu.remove(); offs.forEach(f => f()); anchor.setAttribute('aria-expanded', 'false'); if (reason !== 'outside') anchor.focus({ preventScroll: true }); onClosed?.(); },
  });
  function pick(v) { onSelect?.(v); ov.close('select'); }
  const offs = [on(menu, 'click', '.o-video-menu-item', (e, b) => pick(b.dataset.v)), on(menu, 'keydown', e => { if (e.key === 'Tab') { e.preventDefault(); return; } nav.handle(e); })];
  anchor.setAttribute('aria-expanded', 'true');
  nav.set(Math.max(0, items.findIndex(it => it.checked)));
  animate(menu, 'zoomIn', { duration: 120 });
  return ov;
}
