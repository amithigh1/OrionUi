/* <o-carousel> — carousel / slider. Slides are the element's own children and are never moved or cloned
 * (frameworks stay in control); each slide is positioned with a transform, which also gives a clone-free infinite loop.
 *   <o-carousel autoplay="5000" loop arrows dots per-view="1" per-view-md="2" gap="16" effect="slide|fade"
 *               thumbnails center aspect="16/9" label="Featured">
 *     <img src="a.jpg" alt="…"> <div>…</div> …
 *   </o-carousel>
 * Props: autoplay (ms; bare attribute = 5000), loop, rewind, perView (number | 'auto'), perViewSm|Md|Lg|Xl,
 *        breakpoints { 768: { perView, gap } }, gap, effect, arrows, dots (true | 'outside'), thumbnails, pauseOnHover (true),
 *        draggable (true), center, step (number | 'page'), aspect, speed (ms), index, label, texts
 * Methods: next(), prev(), goTo(i, { animate }), play(), pause(), refresh()   Getters: index, count, slides, playing
 * Events: o-change { index, previous }, o-play, o-pause
 * Keyboard (focus inside): ←/→ (mirrored in RTL), Home/End. Autoplay pauses on hover, focus, hidden tab and when scrolled
 * out of view, never starts under prefers-reduced-motion, and has a visible stop/play button (WCAG 2.2.2).
 */
i18n.add('en', {
  carousel: {
    carousel: 'carousel', slide: 'slide', slideOf: '{index} of {count}', prev: 'Previous slide', next: 'Next slide',
    goTo: 'Go to slide {index}', play: 'Start automatic slide show', pause: 'Stop automatic slide show', thumbs: 'Choose a slide', dots: 'Slides',
  },
});

const CAR_BP = { sm: 576, md: 768, lg: 992, xl: 1200 };
const carMod = (a, n) => ((a % n) + n) % n;
const carEase = t => 1 - (1 - t) ** 3;
const carLen = v => (v == null || v === '' ? '0px' : isNum(v) || /^-?\d*\.?\d+$/.test(String(v)) ? parseFloat(v) + 'px' : String(v));

class OCarousel extends OElement {
  static props = {
    autoplay: { type: Any, default: 0 }, loop: Boolean, rewind: Boolean,
    perView: { type: Any, default: 1 }, perViewSm: Any, perViewMd: Any, perViewLg: Any, perViewXl: Any,
    breakpoints: { type: Object, default: () => ({}) }, gap: { type: Any, default: 0 },
    effect: { type: String, default: 'slide' }, arrows: Boolean, dots: Any, thumbnails: Boolean,
    pauseOnHover: { type: Boolean, default: true }, draggable: { type: Boolean, default: true },
    center: Boolean, step: { type: Any, default: 1 }, aspect: String, speed: { type: Number, default: 420 },
    index: Number, label: String, texts: Object,
  };

  get index() { return this._i ?? (this._p.index || 0); }
  set index(v) { v = +v || 0; this._p.index = v; if (this._ready) this.goTo(v, { animate: false }); }
  get slides() { return [...this.children].filter(c => !c.hasAttribute('data-o-ui') && !/^(template|script|style)$/.test(c.localName)); }
  get count() { return this._targets ? this._targets.length : this.slides.length; }
  get playing() { return !!this._timer || this.classList.contains('is-playing'); }

  setup() {
    this.classList.add('o-carousel');
    if (!this.hasAttribute('role')) this.setAttribute('role', 'region');
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this._i = this._p.index || 0; this._pos = 0; this._userPaused = reducedMotion();
    const ui = el => { el.setAttribute('data-o-ui', ''); return el; };
    this._prevBtn = ui(h('button', { type: 'button', class: 'o-carousel-arrow o-carousel-prev', onClick: () => this.prev(true) }, iconEl('chevron-left')));
    this._nextBtn = ui(h('button', { type: 'button', class: 'o-carousel-arrow o-carousel-next', onClick: () => this.next(true) }, iconEl('chevron-right')));
    this._playBtn = h('button', { type: 'button', class: 'o-carousel-play', onClick: () => (this._userPaused ? this.play() : this.pause()) });
    this._dotsEl = h('div', { class: 'o-carousel-dots', role: 'group' });
    this._bar = ui(h('div', { class: 'o-carousel-bar' }, this._playBtn, this._dotsEl));
    this._thumbsEl = ui(h('div', { class: 'o-carousel-thumbs', role: 'group' }));
    this.append(this._prevBtn, this._nextBtn, this._bar, this._thumbsEl);
    on(this._dotsEl, 'click', '.o-carousel-dot', (e, b) => this.goTo(+b.dataset.i, { user: true }));
    on(this._thumbsEl, 'click', '.o-carousel-thumb', (e, b) => this._goSlide(+b.dataset.i));
    on(this, 'pointerdown', e => this._down(e));
    on(this, 'keydown', e => this._key(e));
    on(this, 'dragstart', e => e.preventDefault());
    on(this, 'click', e => { if (this._suppress) { e.preventDefault(); e.stopPropagation(); } }, true);
    on(this, 'pointerenter', e => { if (e.pointerType === 'mouse') { this._hover = true; this._auto(); } });
    on(this, 'pointerleave', () => { this._hover = false; this._auto(); });
    on(this, 'focusin', e => { this._focus = e.target.matches(':focus-visible'); this._auto(); });
    on(this, 'focusout', e => { if (!this.contains(e.relatedTarget)) { this._focus = false; this._auto(); } });
    on(this, 'scroll', () => { if (this.scrollLeft) this.scrollLeft = 0; });
    this._ready = true;
  }

  connected() {
    const mo = new MutationObserver(ms => { if (ms.some(m => [...m.addedNodes, ...m.removedNodes].some(n => n.nodeType === 1 && !n.hasAttribute('data-o-ui')))) this.refresh(); });
    mo.observe(this, { childList: true });
    this.addCleanup(() => mo.disconnect());
    this.addCleanup(observeResize(this, rafThrottle(() => this._layout())));
    this.addCleanup(observeVisible(this, v => { this._inView = v; this._auto(); }, { threshold: 0.25 }));
    this.listen(win, 'resize', debounce(() => this._layout(), 120));
    this.listen(doc, 'visibilitychange', () => this._auto());
    this.refresh();
  }
  disconnected() { clearTimeout(this._timer); this._timer = 0; cancelAnimationFrame(this._raf); }
  update() { if (this.isConnected) this.refresh(); }

  /* ── public API ── */
  next(user = false) { this._step(1, user); }
  prev(user = false) { this._step(-1, user); }
  goTo(i, { animate = true, user = false } = {}) { this._go(i, animate, user); }
  play() { this._userPaused = false; this._auto(); this.emit('play'); }
  pause() { this._userPaused = true; this._auto(); this.emit('pause'); }
  /** Re-read slides and options (called automatically when children change). */
  refresh() {
    const slides = this.slides, n = slides.length;
    this.setAttribute('aria-roledescription', this.t('carousel.carousel'));
    if (this.label) this.setAttribute('aria-label', this.label);
    slides.forEach((s, i) => {
      s.setAttribute('role', 'group');
      s.setAttribute('aria-roledescription', this.t('carousel.slide'));
      if (!s.hasAttribute('aria-labelledby')) s.setAttribute('aria-label', this.t('carousel.slideOf', { index: i + 1, count: n }));
    });
    const dots = this.dots === true || (isStr(this.dots) && this.dots !== 'false');
    this._fade = this.effect === 'fade';
    this.classList.toggle('is-fade', this._fade);
    this.classList.toggle('has-dots', dots);
    this.classList.toggle('has-dots-outside', dots && this.dots === 'outside');
    this.classList.toggle('has-thumbs', !!this.thumbnails);
    this.classList.toggle('has-aspect', !!this.aspect);
    this.classList.toggle('is-center', !!this.center);
    if (this.aspect) this.style.setProperty('--o-carousel-aspect', this.aspect.replace(':', '/'));
    this.style.setProperty('--o-carousel-speed', (reducedMotion() ? 0 : this.speed) + 'ms');
    this._prevBtn.hidden = this._nextBtn.hidden = !this.arrows || n < 2;
    this._prevBtn.setAttribute('aria-label', this.t('carousel.prev'));
    this._nextBtn.setAttribute('aria-label', this.t('carousel.next'));
    this._dotsEl.hidden = !dots;
    this._dotsEl.setAttribute('aria-label', this.t('carousel.dots'));
    this._thumbsEl.hidden = !this.thumbnails;
    this._thumbsEl.setAttribute('aria-label', this.t('carousel.thumbs'));
    if (this.thumbnails) this._buildThumbs(slides);
    this._layout();
    this._auto();
  }

  /* ── layout & rendering ── */
  _resolve() {
    const w = win.innerWidth;
    let pv = this.perView, gap = this.gap;
    for (const [k, min] of Object.entries(CAR_BP)) { const v = this['perView' + cap(k)]; if (v != null && v !== '' && w >= min) pv = v; }
    Object.entries(this.breakpoints || {}).sort((a, b) => a[0] - b[0]).forEach(([min, o]) => { if (w >= +min && o) { if (o.perView != null) pv = o.perView; if (o.gap != null) gap = o.gap; } });
    return { pv: pv === 'auto' || this._fade ? (this._fade ? 1 : 'auto') : Math.max(1, parseFloat(pv) || 1), gap };
  }
  _layout() {
    if (!this.isConnected || !this._ready) return;
    const slides = this.slides, n = slides.length, { pv, gap } = this._resolve();
    this._rtl = isRTL(this);
    this._free = pv === 'auto';
    this.classList.toggle('is-auto', this._free);
    this.style.setProperty('--o-carousel-gap', this._fade ? '0px' : carLen(gap));
    this.style.setProperty('--o-carousel-per-view', this._free ? 1 : pv);
    this._pv = this._free ? 1 : pv;
    this._n = n;
    this._W = this.clientWidth;
    this._gap = parseFloat(getComputedStyle(this).columnGap) || 0;
    this._loop = !!this.loop && !this._free && (this._fade || n >= Math.ceil(this._pv) + 1);
    if (this._free) {
      this._starts = slides.map(s => ({ s: this._rtl ? this._W - s.offsetLeft - s.offsetWidth : s.offsetLeft, w: s.offsetWidth }));
      const last = this._starts[n - 1];
      this._max = last ? Math.max(0, last.s + last.w - this._W) : 0;
      const t = [...new Set(this._starts.map(x => Math.round(Math.min(x.s, this._max))))];
      this._targets = t.length ? t : [0];
    } else {
      this._unit = (slides[0] ? slides[0].offsetWidth : this._W) + this._gap || 1;
      if (this._loop) this._targets = null;
      else {
        const max = this.center ? n - 1 : Math.max(0, n - this._pv), t = [];
        for (let i = 0; i <= Math.floor(max + 1e-6); i++) t.push(i);
        if (max - Math.floor(max) > 0.01) t.push(max);
        this._targets = t.length ? t : [0];
      }
    }
    this._buildDots();
    this._go(this._i, false, false, true);
  }
  _render() {
    const slides = this.slides, n = slides.length, s = this._rtl ? -1 : 1, p = this._pos;
    if (!n) return;
    const vis = [];
    if (this._fade) {
      slides.forEach((el, i) => { el.style.transform = `translate3d(${-s * i * 100}%,0,0)`; const on = i === this._i; el.style.opacity = on ? '' : '0'; el.style.zIndex = on ? '1' : '0'; vis.push(on); });
    } else if (this._free) {
      slides.forEach((el, i) => { el.style.transform = `translate3d(${-s * p}px,0,0)`; const st = this._starts[i]; vis.push(st && st.s + st.w - p > 1 && st.s - p < this._W - 1); });
    } else {
      const u = this._unit, pv = this._pv, a = this.center ? -(pv - 1) / 2 : 0, base = Math.floor(p + a + 1e-6);
      slides.forEach((el, i) => {
        const d = (this._loop ? base + carMod(i - base, n) : i) - p;
        el.style.transform = `translate3d(${s * (d - a - i) * u}px,0,0)`;
        vis.push(d - a > -0.99 && d - a < pv - 0.01);
      });
    }
    slides.forEach((el, i) => {
      if (el.inert === vis[i]) el.inert = !vis[i];
      if (vis[i] || vis[i - 1] || vis[i + 1] || (this._loop && (vis[(i + 1) % n] || vis[(i - 1 + n) % n]))) this._loadImgs(el);
    });
  }
  _loadImgs(el) {
    const imgs = el.matches('img[data-src]') ? [el] : el.querySelectorAll('img[data-src], source[data-srcset]');
    imgs.forEach(img => {
      if (img.hasAttribute('data-o-lazy')) return O.lazy?.load(img);
      if (img.dataset.srcset) { img.srcset = img.dataset.srcset; img.removeAttribute('data-srcset'); }
      if (img.dataset.src) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
    });
  }

  /* ── navigation ── */
  _stepSize() { return this.step === 'page' ? Math.max(1, Math.floor(this._pv)) : Math.max(1, parseInt(this.step, 10) || 1); }
  _step(dir, user) {
    const n = this.count;
    if (!n) return;
    let i = this._i + dir * this._stepSize();
    if (!this._loop && (i > n - 1 || i < 0)) {
      if (this.rewind || (!user && this._delay())) i = dir > 0 && this._i >= n - 1 ? 0 : dir < 0 && this._i <= 0 ? n - 1 : clamp(i, 0, n - 1);
      else i = clamp(i, 0, n - 1);
    }
    this._go(i, true, user);
  }
  _goSlide(si) {
    if (this._loop || this._fade) return this._go(si, true, true);
    if (this._free) { const x = Math.min(this._starts[si]?.s || 0, this._max); return this._go(this._nearest(x), true, true); }
    this._go(Math.min(si, this._targets.length - 1), true, true);
  }
  _nearest(pos) {
    if (this._loop) return carMod(Math.round(pos), this._n);
    let best = 0;
    this._targets.forEach((t, i) => { if (Math.abs(t - pos) < Math.abs(this._targets[best] - pos)) best = i; });
    return best;
  }
  _go(i, animate, user, silent) {
    const n = this.count;
    if (!n) { this._render(); return; }
    let target;
    if (this._loop) { i = carMod(Math.round(i), n); target = this._fade ? i : i + Math.round((this._pos - i) / n) * n; }
    else { i = clamp(Math.round(i) || 0, 0, n - 1); target = this._fade ? i : this._targets[i]; }
    const prev = this._i;
    this._i = i;
    this._paintUI();
    if (prev !== i && !silent) {
      this.emit('change', { index: i, previous: prev });
      if (user && !this.classList.contains('is-playing')) announce(this.t('carousel.slideOf', { index: i + 1, count: n }));
    }
    this._animate(target, animate && !this._fade);
    if (!silent) { clearTimeout(this._timer); this._timer = 0; this._auto(); }
  }
  _animate(to, anim) {
    cancelAnimationFrame(this._raf);
    const from = this._pos, dur = reducedMotion() ? 0 : this.speed;
    if (!anim || !dur || Math.abs(to - from) < 1e-3) { this._pos = to; this._render(); return; }
    const t0 = performance.now();
    const tick = now => {
      const k = Math.min(1, (now - t0) / dur);
      this._pos = from + (to - from) * carEase(k);
      this._render();
      if (k < 1) this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }
  _paintUI() {
    const n = this.count, i = this._i, end = !this._loop && !this.rewind;
    this._prevBtn.disabled = end && i <= 0;
    this._nextBtn.disabled = end && i >= n - 1;
    this._dotsEl.querySelectorAll('.o-carousel-dot').forEach((d, k) => d.setAttribute('aria-current', String(k === i)));
    const si = this._activeSlide();
    this._thumbsEl.querySelectorAll('.o-carousel-thumb').forEach((b, k) => {
      b.setAttribute('aria-current', String(k === si));
      if (k === si && !this._thumbsEl.hidden) {
        const st = this._thumbsEl;
        st.scrollTo({ left: b.offsetLeft + b.offsetWidth / 2 - st.clientWidth / 2, behavior: reducedMotion() ? 'auto' : 'smooth' });
      }
    });
  }
  _activeSlide() {
    if (this._loop || this._fade) return this._i;
    const x = this._targets[this._i] ?? 0;
    if (this._free) return Math.max(0, this._starts.findIndex(s => Math.round(Math.min(s.s, this._max)) === x));
    return Math.ceil(x - 1e-6);
  }
  _buildDots() {
    const n = this.count;
    if (this._dotsEl.childElementCount === n && this._dotsN === n) return this._paintUI();
    this._dotsN = n;
    this._dotsEl.replaceChildren(...Array.from({ length: n }, (_, k) => h('button', { type: 'button', class: 'o-carousel-dot', 'data-i': k, 'aria-label': this.t('carousel.goTo', { index: k + 1 }) })));
  }
  _buildThumbs(slides) {
    this._thumbsEl.replaceChildren(...slides.map((s, k) => {
      const img = s.matches('img') ? s : s.querySelector('img');
      const src = s.dataset.thumb || (img && (img.dataset.thumb || img.dataset.src || img.currentSrc || img.src));
      return h('button', { type: 'button', class: 'o-carousel-thumb', 'data-i': k, 'aria-label': this.t('carousel.goTo', { index: k + 1 }) },
        src ? h('img', { src, alt: '', loading: 'lazy', draggable: 'false' }) : h('span', {}, String(k + 1)));
    }));
  }

  /* ── autoplay ── */
  _delay() { const a = this.autoplay; if (a === true || a === '') return 5000; const v = parseFloat(a); return v > 0 ? v : 0; }
  _auto() {
    const d = this._delay();
    this._playBtn.hidden = !d;
    if (d) {
      this._playBtn.innerHTML = String(icon(this._userPaused ? 'play' : 'pause'));
      this._playBtn.setAttribute('aria-label', this.t(this._userPaused ? 'carousel.play' : 'carousel.pause'));
      this.style.setProperty('--o-carousel-delay', d + 'ms');
    }
    this._bar.hidden = !d && this._dotsEl.hidden;
    const run = d > 0 && this.isConnected && !this._userPaused && !(this.pauseOnHover && this._hover) && !this._focus && !doc.hidden && this._inView !== false && !this._dragging && this.count > 1;
    this.classList.toggle('is-playing', run);
    if (run && !this._timer) this._timer = setTimeout(() => { this._timer = 0; this._step(1, false); }, d);
    else if (!run && this._timer) { clearTimeout(this._timer); this._timer = 0; }
  }

  /* ── keyboard & pointer ── */
  _key(e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, textarea, select, [contenteditable]')) return;
    let k = e.key;
    if (this._rtl && (k === 'ArrowLeft' || k === 'ArrowRight')) k = k === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    if (k === 'ArrowRight') this.next(true);
    else if (k === 'ArrowLeft') this.prev(true);
    else if (k === 'Home') this.goTo(0, { user: true });
    else if (k === 'End') this.goTo(this.count - 1, { user: true });
    else return;
    e.preventDefault();
  }
  _down(e) {
    if (!this.draggable || e.button > 0 || this.slides.length < 2 || e.target.closest('[data-o-ui], input, textarea, select, [contenteditable], .o-carousel-nodrag')) return;
    const sx = e.clientX, sy = e.clientY, id = e.pointerId, start = this._pos, u = this._free || this._fade ? 1 : this._unit;
    let drag = false, dx = 0;
    const samples = [];
    const lo = this._loop ? -Infinity : this._targets[0], hi = this._loop ? Infinity : this._targets[this._targets.length - 1];
    const move = ev => {
      if (ev.pointerId !== id) return;
      dx = (ev.clientX - sx) * (this._rtl ? -1 : 1);
      const dy = ev.clientY - sy;
      if (!drag) {
        if (Math.abs(dx) < 6) { if (Math.abs(dy) > 10) end(); return; }
        if (Math.abs(dx) < Math.abs(dy)) { end(); return; }
        drag = true; this._dragging = true;
        try { this.setPointerCapture(id); } catch {}
        cancelAnimationFrame(this._raf);
        this.classList.add('is-dragging');
        this._auto();
      }
      samples.push([dx, ev.timeStamp]); if (samples.length > 6) samples.shift();
      if (this._fade) return;
      let pos = start - dx / u;
      if (pos < lo) pos = lo - (lo - pos) * 0.3; else if (pos > hi) pos = hi + (pos - hi) * 0.3;
      this._pos = pos;
      this._render();
    };
    const up = ev => {
      if (ev.pointerId !== id) return;
      end();
      if (!drag) return;
      this._suppress = true; setTimeout(() => { this._suppress = false; }, 0);
      const a = samples[0], b = samples[samples.length - 1], v = a && b && b[1] > a[1] ? (b[0] - a[0]) / (b[1] - a[1]) : 0;
      this._dragging = false;
      this.classList.remove('is-dragging');
      if (this._fade) { if (Math.abs(dx) > 40 || Math.abs(v) > 0.3) this._step(dx < 0 ? 1 : -1, true); else this._auto(); return; }
      const cur = this._i, jump = Math.max(1, Math.floor(this._pv));
      let proj = this._pos - (v * 180) / u;
      if (!this._free) proj = clamp(proj, Math.round(start) - jump, Math.round(start) + jump);
      let i = this._nearest(proj);
      if (i === cur && (Math.abs(v) > 0.3 || Math.abs(dx) > u * 0.18)) i = cur + (dx < 0 ? 1 : -1);
      if (!this._loop) i = clamp(i, 0, this.count - 1);
      this._go(i, true, true);
    };
    const end = () => { offs.forEach(f => f()); };
    const offs = [on(this, 'pointermove', move), on(this, 'pointerup pointercancel', up), on(this, 'lostpointercapture', ev => { if (drag && ev.pointerId === id && this._dragging) up(ev); })];
  }
}
define('o-carousel', OCarousel);
O.Carousel = OCarousel;
