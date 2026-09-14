/* Orion.lightbox(items, options) -> { next, prev, goTo, close, zoomIn, zoomOut, reset, rotate, play, pause, fullscreen, index, item, el }
 * Full-screen image / video viewer (dialog on the core overlay stack: focus trap, scroll lock, Escape, focus return).
 *   items:   [{ src, thumb, title, caption, alt, type: 'image'|'video', width, height, poster, srcset, tracks, download }]
 *            (urls and elements are accepted too)
 *   options: index, loop (true), zoom (true), maxZoom (4, relative to fit), upscale (false), thumbnails, counter (true),
 *            download (true), slideshow (true), interval (4000), share (false), fullscreen (true), rotate (true),
 *            swipeClose (true), origin (element to zoom from), label, onChange(index, item), onClose(reason)
 * Gestures: swipe to navigate, swipe down to close, pinch / wheel / double-tap to zoom, drag to pan (with bounds).
 * Keyboard: ← → (mirrored in RTL), Home / End, + − 0, R rotate, F fullscreen, S slideshow, Esc; arrows pan while zoomed.
 * Behavior: <img data-o-preview> or <a href="full.jpg" data-o-preview="group"> opens the lightbox (same value = same group);
 *           extra: data-o-preview-src, data-title, data-caption, data-width, data-height, data-type="video", data-poster.
 */
i18n.add('en', {
  gallery: {
    viewer: 'Image viewer', counter: '{index} / {count}', prev: 'Previous', next: 'Next', close: 'Close', zoomIn: 'Zoom in', zoomOut: 'Zoom out',
    resetZoom: 'Reset zoom', rotate: 'Rotate', fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen', download: 'Download', share: 'Share',
    linkCopied: 'Link copied', play: 'Play slideshow', pause: 'Pause slideshow', thumbs: 'Thumbnails', error: 'This file could not be loaded',
    item: 'Item {index} of {count}', open: 'Open {title}', image: 'image', zoomable: 'Zoomable view', zoomHint: 'Use Ctrl + scroll to zoom',
    zoomHintMac: 'Use ⌘ + scroll to zoom', minimap: 'Overview', fit: 'Fit to view', gallery: 'Gallery', video: 'Video',
  },
});

const GAL_VIDEO = /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i;
const galMod = (a, n) => ((a % n) + n) % n;
function galFromEl(el) {
  const img = el.localName === 'img' ? el : el.querySelector('img');
  const d = el.dataset;
  const thumb = img ? img.currentSrc || img.getAttribute('src') || img.dataset.src : undefined;
  const src = d.oPreviewSrc || d.full || (el.localName === 'a' ? el.href : '') || (img && img.dataset.full) || thumb;
  const type = d.type || (GAL_VIDEO.test(src || '') ? 'video' : 'image');
  const title = d.title || el.getAttribute('title') || (img && (img.dataset.title || img.alt)) || '';
  return {
    src, thumb, type, title, alt: (img && img.alt) || title, caption: d.caption || (img && img.dataset.caption) || '',
    width: +d.width || undefined, height: +d.height || undefined, poster: d.poster || (type === 'video' ? thumb : undefined), download: d.download,
  };
}
function galItem(x) {
  if (isStr(x)) return { src: x, type: GAL_VIDEO.test(x) ? 'video' : 'image' };
  if (isBrowser && x instanceof Element) return galFromEl(x);
  const it = { ...x };
  it.type = it.type || (GAL_VIDEO.test(it.src || '') ? 'video' : 'image');
  return it;
}
const galName = url => decodeURIComponent((String(url).split(/[?#]/)[0].split('/').pop() || 'file').replace(/[^\w.%-]+/g, '_')) || 'file';
async function galDownload(url, name) {
  try {
    const u = new URL(url, location.href);
    if (u.origin === location.origin || /^(blob|data):/.test(url)) return downloadURL(u.href, name);
    download(await (await fetch(u.href, { mode: 'cors' })).blob(), name);
  } catch { win.open(url, '_blank', 'noopener'); }
}

function lightbox(list, opts = {}) {
  if (!isBrowser) return null;
  const items = toArr(list).map(galItem).filter(it => it && it.src);
  if (!items.length) return null;
  const n = items.length;
  const o = { index: 0, loop: true, zoom: true, maxZoom: 4, upscale: false, thumbnails: n > 1, counter: true, download: true, slideshow: n > 1, interval: 4000, share: false, fullscreen: true, rotate: true, swipeClose: true, ...opts };
  if (n < 2) o.loop = false;
  let index = clamp(o.index | 0, 0, n - 1), playing = false, playT = 0, raf = 0, closed = false, drag = null;
  const rtl = isRTL(o.origin && o.origin.isConnected ? o.origin : doc.documentElement), dirX = rtl ? -1 : 1, GAP = 24;
  const btn = (name, label, fn, extra) => h('button', { type: 'button', class: ['o-lightbox-btn', extra], 'aria-label': label, title: label, onClick: fn }, icon(name));
  const counter = h('span', { class: 'o-lightbox-counter' });
  const zoomLabel = h('button', { type: 'button', class: 'o-lightbox-btn o-lightbox-zoom', title: t('gallery.resetZoom'), onClick: () => cur()?.pz?.reset() });
  const bOut = btn('zoom-out', t('gallery.zoomOut'), () => zoomBy(1 / 1.5), 'o-lightbox-ztool');
  const bIn = btn('zoom-in', t('gallery.zoomIn'), () => zoomBy(1.5), 'o-lightbox-ztool');
  const bRot = btn('rotate-cw', t('gallery.rotate'), () => rotate(90));
  const bPlay = btn('play', t('gallery.play'), () => show(!playing));
  const bFs = btn('maximize', t('gallery.fullscreen'), () => toggleFs());
  const bDl = btn('download', t('gallery.download'), () => { const it = items[index]; const u = isStr(it.download) ? it.download : it.src; galDownload(u, galName(u)); });
  const bShare = btn('share', t('gallery.share'), () => share());
  const bClose = btn('x', t('gallery.close'), () => close('button'));
  zoomLabel.classList.add('o-lightbox-ztool');
  bOut.hidden = bIn.hidden = zoomLabel.hidden = !o.zoom;
  bRot.hidden = !o.rotate; bPlay.hidden = !o.slideshow || n < 2; bShare.hidden = !o.share;
  bFs.hidden = !o.fullscreen || !doc.fullscreenEnabled;
  counter.hidden = !o.counter || n < 2;
  const progress = h('div', { class: 'o-lightbox-progress' });
  const top = h('div', { class: 'o-lightbox-top' }, counter, h('div', { class: 'o-lightbox-tools' }, bOut, zoomLabel, bIn, bRot, bPlay, bFs, bDl, bShare, bClose), progress);
  const slots = [0, 1, 2].map(() => h('div', { class: 'o-lightbox-slide' }));
  const stage = h('div', { class: 'o-lightbox-stage' }, ...slots);
  const bPrev = btn('chevron-left', t('gallery.prev'), () => go(index - 1), 'o-lightbox-nav o-lightbox-prev');
  const bNext = btn('chevron-right', t('gallery.next'), () => go(index + 1), 'o-lightbox-nav o-lightbox-next');
  bPrev.hidden = bNext.hidden = n < 2;
  const caption = h('div', { class: 'o-lightbox-caption', 'aria-live': 'polite' });
  const thumbs = h('div', { class: 'o-lightbox-thumbs', role: 'group', 'aria-label': t('gallery.thumbs') });
  thumbs.hidden = !o.thumbnails || n < 2;
  const bg = h('div', { class: 'o-lightbox-bg' });
  const root = h('div', { class: 'o-lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.label || t('gallery.viewer'), tabindex: '-1' }, bg, top, stage, bPrev, bNext, caption, thumbs);
  if (!thumbs.hidden) {
    thumbs.append(...items.map((it, i) => h('button', { type: 'button', class: ['o-lightbox-thumb', it.type === 'video' && 'is-video'], 'aria-label': it.title || t('gallery.item', { index: i + 1, count: n }), onClick: () => go(i, { jump: true }) },
      (it.thumb || it.poster || it.type !== 'video') ? h('img', { src: it.thumb || it.poster || it.src, alt: '', loading: 'lazy', draggable: 'false' }) : icon('play'))));
  }
  root.classList.toggle('has-thumbs', !thumbs.hidden);
  portal(root, o.origin && o.origin.isConnected ? o.origin : doc.body);
  root.classList.add('o-theme-dark');
  const cur = () => slots[1];

  /* ── slots ── */
  function clearSlot(s) {
    s.pz?.destroy(); s.pz = null; s.nat = null; s.fit = 1; s.i = null;
    s.querySelectorAll('video, audio, o-video').forEach(v => { try { v.pause(); } catch {} });
    s.replaceChildren();
    s.className = 'o-lightbox-slide';
    s.style.transform = '';
  }
  const want = i => (o.loop ? galMod(i, n) : i >= 0 && i < n ? i : null);
  function fill(s, raw) {
    const i = want(raw);
    if (i === null) { clearSlot(s); return; }
    if (s.i === i && s.firstChild) return;
    clearSlot(s);
    s.i = i;
    const it = items[i];
    s.setAttribute('aria-label', t('gallery.item', { index: i + 1, count: n }));
    if (it.type === 'video') video(s, it); else image(s, it, raw === index ? o.origin : null);
  }
  function image(s, it, origin) {
    const img = h('img', { class: 'o-lightbox-img', alt: it.alt || it.title || '', draggable: 'false', decoding: 'async' });
    s.append(h('span', { class: 'o-spinner o-lightbox-spinner', role: 'status', 'aria-label': t('common.loading') }), img);
    s.classList.add('is-loading');
    const setNat = (w, hh, exact) => { if (!w || !hh) return; s.nat = { w, h: hh, exact }; fit(s); };
    const fail = () => { if (!s.contains(img)) return; s.classList.remove('is-loading'); s.classList.add('is-error'); img.remove(); s.append(h('div', { class: 'o-lightbox-error' }, icon('image-off'), h('span', {}, t('gallery.error')))); };
    const done = () => { s.classList.remove('is-loading'); if (s === cur()) paint(); };
    if (it.width && it.height) setNat(+it.width, +it.height, true);
    else if (origin && origin.naturalWidth) setNat(origin.naturalWidth * 50, origin.naturalHeight * 50, false);
    s.pz = new PanZoom(s, img, {
      min: r => minZ(s, r), max: r => Math.max(minZ(s, r), o.zoom ? Math.max(o.maxZoom, 2 / (s.fit || 1)) : 1), wheel: o.zoom ? 'zoom' : 'none', dbl: o.zoom ? 2.5 : 0,
      size: () => ({ w: img.offsetWidth, h: img.offsetHeight }), onDrag: swipe, onTap: e => tap(e, img), ignore: 'button, a, input',
      onChange: () => { if (s === cur()) paintZoom(); },
    });
    const thumb = it.thumb && it.thumb !== it.src ? it.thumb : null;
    if (thumb) {
      img.src = thumb; img.classList.add('is-thumb');
      img.onload = () => { if (!s.nat) setNat(img.naturalWidth * 50, img.naturalHeight * 50, false); };
      const pre = new Image();
      if (it.srcset) pre.srcset = it.srcset;
      pre.onload = () => { if (!s.contains(img)) return; img.onload = null; if (it.srcset) img.srcset = it.srcset; img.src = it.src; img.classList.remove('is-thumb'); setNat(pre.naturalWidth, pre.naturalHeight, true); done(); };
      pre.onerror = fail;
      pre.src = it.src;
    } else {
      img.onload = () => { setNat(img.naturalWidth, img.naturalHeight, true); done(); };
      img.onerror = fail;
      if (it.srcset) img.srcset = it.srcset;
      img.src = it.src;
    }
  }
  function video(s, it) {
    const V = customElements.get('o-video');
    const el = V ? h('o-video', { class: 'o-lightbox-video', src: it.src, poster: it.poster || it.thumb || null, tracks: it.tracks ? JSON.stringify(it.tracks) : null, title: it.title || null })
      : h('video', { class: 'o-lightbox-video', src: it.src, poster: it.poster || it.thumb || null, controls: true, playsinline: true, preload: 'metadata' });
    s.classList.add('is-video');
    s.append(el);
    s.pz = new PanZoom(s, el, { min: 1, max: 1, wheel: 'none', dbl: 0, onDrag: swipe, ignore: 'video[controls], .o-video-controls, .o-video-menu, button, input, [role=slider]', size: () => ({ w: el.offsetWidth, h: el.offsetHeight }) });
    s.pz.apply();
  }
  const area = () => [Math.max(40, stage.clientWidth - 32), Math.max(40, stage.clientHeight - 32)];
  function minZ(s, r) {
    if (!s.nat) return 1;
    const [W, H] = area(), q = Math.abs(r) % 180 === 90, cap = o.upscale || !s.nat.exact ? Infinity : 1;
    return Math.min(W / (q ? s.nat.h : s.nat.w), H / (q ? s.nat.w : s.nat.h), cap) / s.fit;
  }
  function fit(s) {
    if (!s.nat || !s.pz) return;
    const [W, H] = area(), img = s.querySelector('.o-lightbox-img');
    s.fit = Math.min(W / s.nat.w, H / s.nat.h, o.upscale || !s.nat.exact ? Infinity : 1);
    if (img) { img.style.width = s.nat.w * s.fit + 'px'; img.style.height = s.nat.h * s.fit + 'px'; }
    s.pz.set(Math.abs(s.pz.r) % 180 ? s.pz.min : Math.max(s.pz.min, s.pz.z), s.pz.x, s.pz.y, false);
  }

  /* ── placement & navigation ── */
  function place(dx = 0, dy = 0) {
    const W = stage.clientWidth + GAP;
    slots.forEach((s, k) => { s.style.transform = `translate3d(${dirX * (k - 1) * W + dx}px, ${k === 1 ? dy : 0}px, 0)`; });
  }
  function tween(from, to, done) {
    cancelAnimationFrame(raf);
    const d = reducedMotion() ? 0 : 260, t0 = performance.now();
    const step = now => { const k = d ? Math.min(1, (now - t0) / d) : 1; place(from + (to - from) * pzEase(k)); if (k < 1) raf = requestAnimationFrame(step); else done?.(); };
    raf = requestAnimationFrame(step);
  }
  function go(raw, { from = 0, jump = false } = {}) {
    if (closed) return;
    const target = want(raw);
    if (target === null) { tween(from, 0); return; }
    const dir = jump ? 0 : Math.sign(raw - index);
    if (target === index && !dir) { tween(from, 0); return; }
    const done = () => {
      if (dir > 0) slots.push(slots.shift()); else if (dir < 0) slots.unshift(slots.pop());
      index = target;
      slots.forEach(s => { if (s !== cur() && s.pz && s.nat) s.pz.set(s.pz.lim(0)[0], 0, 0, false, 0); });
      fill(slots[1], index); fill(slots[0], index - 1); fill(slots[2], index + 1);
      if (!dir) { animate(cur(), 'fadeIn', { duration: 180 }); }
      place();
      paint(true);
      if (playing) schedule();
    };
    if (!dir) return done();
    tween(from, -dirX * dir * (stage.clientWidth + GAP), done);
  }
  function swipe(phase, dx, dy, e, v = [0, 0]) {
    if (phase === 'start') { drag = { axis: null }; return; }
    if (!drag) return;
    if (phase === 'cancel') { drag = null; settle(); return; }
    if (!drag.axis) drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : o.swipeClose ? 'y' : 'x';
    if (phase === 'move') {
      if (drag.axis === 'x') { const d = dx * dirX, edge = !o.loop && ((index === 0 && d > 0) || (index === n - 1 && d < 0)) || n < 2; place(edge ? dx * 0.3 : dx, 0); }
      else { place(0, dy); bg.style.opacity = String(clamp(1 - Math.abs(dy) / 480, 0.15, 1)); root.classList.add('is-dragging-y'); }
      return;
    }
    const axis = drag.axis; drag = null;
    if (axis === 'x') {
      const d = dx * dirX, step = d < 0 ? 1 : -1;
      if ((Math.abs(dx) > stage.clientWidth * 0.18 || Math.abs(v[0]) > 0.35) && want(index + step) !== null && n > 1) go(index + step, { from: dx });
      else tween(dx, 0);
    } else {
      root.classList.remove('is-dragging-y');
      if (Math.abs(dy) > 110 || Math.abs(v[1]) > 0.6) close('swipe', dy);
      else settle();
    }
  }
  function settle() {
    root.classList.add('is-settling'); bg.style.opacity = ''; place();
    setTimeout(() => root.classList.remove('is-settling'), 260);
  }
  function tap(e, img) {
    if (e.pointerType === 'mouse') {
      const r = img.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close('backdrop');
    } else root.classList.toggle('is-chrome-hidden');
  }
  function zoomBy(f) { const s = cur(); if (s?.pz && s.nat) s.pz.zoomBy(f); }
  function rotate(deg) { const s = cur(); if (s?.pz && s.nat) s.pz.rotate(deg); }

  /* ── chrome ── */
  function paint(announceIt) {
    const it = items[index], s = cur(), isImg = it.type !== 'video';
    counter.textContent = t('gallery.counter', { index: fmt.number(index + 1), count: n });
    caption.replaceChildren(...[it.title && h('strong', { class: 'o-lightbox-title' }, it.title), it.caption && h('span', { class: 'o-lightbox-text' }, it.caption)].filter(Boolean));
    caption.hidden = !it.title && !it.caption;
    bPrev.disabled = want(index - 1) === null; bNext.disabled = want(index + 1) === null;
    bRot.disabled = !isImg || !s?.nat;
    bDl.hidden = !o.download || it.download === false;
    root.classList.toggle('is-video', !isImg);
    thumbs.querySelectorAll('.o-lightbox-thumb').forEach((b, i) => {
      b.setAttribute('aria-current', String(i === index));
      if (i === index) thumbs.scrollTo({ left: b.offsetLeft + b.offsetWidth / 2 - thumbs.clientWidth / 2, behavior: reducedMotion() ? 'auto' : 'smooth' });
    });
    paintZoom();
    if (announceIt) announce([t('gallery.item', { index: index + 1, count: n }), it.title].filter(Boolean).join(': '));
    o.onChange?.(index, it);
    emit(root, 'o-change', { index, item: it });
  }
  function paintZoom() {
    const s = cur(), ok = !!(s?.pz && s.nat && items[index].type !== 'video');
    zoomLabel.textContent = ok ? Math.round(s.pz.z * s.fit * 100) + '%' : '';
    zoomLabel.disabled = !ok || !s.pz.zoomed;
    bIn.disabled = !ok || s.pz.z >= s.pz.max - 1e-3;
    bOut.disabled = !ok || !s.pz.zoomed;
  }
  function schedule() {
    clearTimeout(playT);
    progress.style.animation = 'none'; void progress.offsetWidth; progress.style.animation = '';
    if (playing) playT = setTimeout(() => { if (!o.loop && index >= n - 1) show(false); else go(index + 1); }, o.interval); }
  function show(on) {
    playing = !!on && n > 1;
    bPlay.innerHTML = String(icon(playing ? 'pause' : 'play'));
    bPlay.setAttribute('aria-label', t(playing ? 'gallery.pause' : 'gallery.play')); bPlay.title = bPlay.getAttribute('aria-label');
    bPlay.setAttribute('aria-pressed', String(playing));
    root.style.setProperty('--o-lightbox-interval', o.interval + 'ms');
    root.classList.toggle('is-playing', playing);
    schedule();
  }
  function toggleFs() {
    if (doc.fullscreenElement) doc.exitFullscreen?.().catch(noop);
    else root.requestFullscreen?.().catch(noop);
  }
  async function share() {
    const it = items[index], url = new URL(it.src, location.href).href;
    if (navigator.share) { try { await navigator.share({ title: it.title || doc.title, url }); } catch {} return; }
    try { await navigator.clipboard.writeText(url); announce(t('gallery.linkCopied')); O.toast?.(t('gallery.linkCopied')); } catch {}
  }

  /* ── events ── */
  const offs = [
    on(root, 'keydown', e => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const s = cur(), k = e.key, isImg = s?.nat && items[index].type !== 'video';
      if (e.target.closest('input, textarea, select, o-video, video')) return;
      if (isImg && s.pz.pannable && /^Arrow/.test(k)) { s.pz.key(e); return; }
      let kk = k;
      if (rtl && (k === 'ArrowLeft' || k === 'ArrowRight')) kk = k === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
      if (kk === 'ArrowRight') go(index + 1);
      else if (kk === 'ArrowLeft') go(index - 1);
      else if (k === 'Home') go(0, { jump: true });
      else if (k === 'End') go(n - 1, { jump: true });
      else if (isImg && o.zoom && s.pz.key(e)) return;
      else if ((k === 'r' || k === 'R') && o.rotate && isImg) rotate(k === 'R' ? -90 : 90);
      else if ((k === 'f' || k === 'F') && !bFs.hidden) toggleFs();
      else if ((k === 's' || k === 'S') && !bPlay.hidden) show(!playing);
      else return;
      e.preventDefault();
    }),
    on(doc, 'fullscreenchange', () => {
      const fs = doc.fullscreenElement === root;
      bFs.innerHTML = String(icon(fs ? 'minimize' : 'maximize'));
      bFs.setAttribute('aria-label', t(fs ? 'gallery.exitFullscreen' : 'gallery.fullscreen')); bFs.title = bFs.getAttribute('aria-label');
    }),
    on(root, 'pointerdown', () => { if (playing) schedule(); }),
    observeResize(stage, rafThrottle(() => { slots.forEach(fit); place(); paintZoom(); })),
  ];
  const ov = overlays.open({ el: root, owner: o.origin || null, modal: true, trap: true, lockScroll: true, outside: false, onClose: reason => teardown(reason) });
  function teardown(reason) {
    closed = true;
    clearTimeout(playT); cancelAnimationFrame(raf);
    offs.forEach(f => f());
    if (doc.fullscreenElement === root) doc.exitFullscreen?.().catch(noop);
    slots.forEach(s => s.querySelectorAll('video, o-video').forEach(v => { try { v.pause(); } catch {} }));
    const s = cur();
    const p = reason === 'swipe' && !reducedMotion()
      ? Promise.all([animate(s, [{ transform: s.style.transform, opacity: 1 }, { transform: `translate3d(0, ${(close.dy || 1) > 0 ? 60 : -60}vh, 0)`, opacity: 0 }], { duration: 220, fill: 'forwards' }), animate(root, 'fadeOut', { duration: 220, fill: 'forwards' })])
      : animate(root, 'fadeOut', { duration: 160, fill: 'forwards' });
    p.then(() => { slots.forEach(clearSlot); root.remove(); });
    o.onClose?.(reason);
    emit(o.origin && o.origin.isConnected ? o.origin : doc.body, 'o-lightbox-close', { index, reason });
  }
  function close(reason = 'api', dy) { if (closed) return; close.dy = dy; ov.close(reason); }

  fill(slots[1], index); fill(slots[0], index - 1); fill(slots[2], index + 1);
  place();
  paint(false);
  root.focus({ preventScroll: true });
  animate(bg, 'fadeIn', { duration: 220 });
  const oi = o.origin && o.origin.getBoundingClientRect ? o.origin.getBoundingClientRect() : null, s0 = cur(), img0 = s0.querySelector('.o-lightbox-img');
  if (oi && oi.width && img0 && s0.nat && !reducedMotion()) {
    const sr = stage.getBoundingClientRect(), k = oi.width / Math.max(1, img0.offsetWidth * s0.pz.z);
    const dx = oi.left + oi.width / 2 - (sr.left + sr.width / 2), dy = oi.top + oi.height / 2 - (sr.top + sr.height / 2);
    animate(s0, [{ transform: `translate(${dx}px, ${dy}px) scale(${k})` }, { transform: 'translate(0, 0) scale(1)' }], { duration: 260 });
    [top, caption, thumbs, bPrev, bNext].forEach(el => animate(el, 'fadeIn', { duration: 260 }));
  } else animate(stage, 'zoomIn', { duration: 200 });

  return {
    el: root,
    get index() { return index; },
    get item() { return items[index]; },
    next: () => go(index + 1), prev: () => go(index - 1), goTo: i => go(i, { jump: true }),
    close: () => close('api'), zoomIn: () => zoomBy(1.5), zoomOut: () => zoomBy(1 / 1.5), reset: () => cur()?.pz?.reset(),
    rotate: (deg = 90) => rotate(deg), play: () => show(true), pause: () => show(false), fullscreen: toggleFs,
    get zoom() { const s = cur(); return s?.pz ? s.pz.z * s.fit : 1; },
  };
}
O.lightbox = lightbox;

/* ── behavior: data-o-preview ─────────────────────────────────────── */
behavior('data-o-preview', (el) => {
  const isImg = el.localName === 'img', added = [];
  if (isImg && !el.hasAttribute('tabindex')) { el.tabIndex = 0; added.push('tabindex'); }
  if (isImg && !el.hasAttribute('role')) { el.setAttribute('role', 'button'); added.push('role'); }
  if (isImg && !el.hasAttribute('aria-label')) { el.setAttribute('aria-label', t('gallery.open', { title: el.alt || t('gallery.image') })); added.push('aria-label'); }
  el.classList.add('o-preview-trigger');
  const open = e => {
    if (e.defaultPrevented) return;
    e.preventDefault();
    const g = el.getAttribute('data-o-preview');
    const group = g ? $$('[data-o-preview]').filter(x => x.getAttribute('data-o-preview') === g) : [el];
    const opt = parseJSON(el.getAttribute('data-o-preview-options') || '{}', {});
    lightbox(group.map(galFromEl), { ...opt, index: Math.max(0, group.indexOf(el)), origin: isImg ? el : el.querySelector('img') || el });
  };
  const offs = [on(el, 'click', open), on(el, 'keydown', e => { if (isImg && (e.key === 'Enter' || e.key === ' ')) open(e); })];
  return () => { offs.forEach(f => f()); el.classList.remove('o-preview-trigger'); added.forEach(a => el.removeAttribute(a)); };
});
