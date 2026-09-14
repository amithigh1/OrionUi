/* Orion.tour({ id, steps, onFinish, onSkip, persist, keyboard, overlayClose, targetTimeout }) -> controller
 *   steps: [{ target, title, content, placement, spotlightPadding, radius, beforeShow, advanceOn:{selector,event}, media }]
 *   target: CSS selector | Element | () => Element | null (null/omitted = a centered "no spotlight" step, e.g. a welcome step)
 *   controller: { start({force}?), next(), prev(), end(reason?), goTo(i), isActive }
 * An animated spotlight (SVG mask, pointer-events:none so the highlighted element and the rest of the page
 * stay fully interactive) follows the target — scrolling it into view, repositioning on resize/scroll, and
 * waiting for late-appearing targets via MutationObserver + timeout. The step popover uses core overlays
 * for Escape + a focus trap scoped to the dialog (Tab cycles inside it; the `advanceOn` target, being
 * outside the dialog, stays reachable by mouse/touch even though Tab can't reach it). RTL and
 * prefers-reduced-motion aware.
 */
i18n.add('en', {
  tour: {
    of: '{n} of {total}', next: 'Next', back: 'Back', done: 'Done', skip: 'Skip', close: 'Close tour',
  },
});

function tourResolveTarget(target) {
  if (target == null) return null;
  if (isFn(target)) { try { target = target(); } catch { return null; } }
  if (isStr(target)) { try { return doc.querySelector(target); } catch { return null; } }
  return target instanceof Element ? target : null;
}
/** Waits for a selector-based target to appear (MutationObserver + timeout); Elements/functions resolve once. */
function tourWaitFor(target, timeout) {
  const first = tourResolveTarget(target);
  if (first || !isStr(target)) return Promise.resolve(first);
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (done) return; done = true; mo.disconnect(); clearTimeout(timer); resolve(v); };
    const mo = new MutationObserver(() => { const el = tourResolveTarget(target); if (el) finish(el); });
    mo.observe(doc.documentElement, { childList: true, subtree: true, attributes: true });
    const timer = setTimeout(() => finish(null), timeout);
  });
}
const tourNodes = c => {
  if (c == null || c === false) return [];
  if (isFn(c)) return tourNodes(c());
  if (c instanceof SafeHTML) return [...frag(c.s).childNodes];
  if (isStr(c)) return [doc.createTextNode(c)];
  if (c instanceof Node) return [c];
  return toArr(c).flatMap(tourNodes);
};
function tourHoleClip(rect) {
  const vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
  const x = Math.max(0, rect.x), y = Math.max(0, rect.y), r = x + rect.width, b = y + rect.height;
  return `path(evenodd, "M0 0H${vw}V${vh}H0Z M${x} ${y}H${r}V${b}H${x}Z")`;
}

let __seq = 0;
const __registry = new Map();
class Tour {
  constructor(cfg = {}) {
    this.cfg = { keyboard: true, overlayClose: false, targetTimeout: 8000, spotlightPadding: 8, radius: 10, placement: 'bottom', ...cfg };
    this.steps = toArr(cfg.steps);
    this.index = -1;
    this.active = false;
    this._uid = 'tour-' + (++__seq);
    const self = this;
    this.api = {
      start: opts => self.start(opts), next: () => self.next(), prev: () => self.prev(),
      end: reason => self.end(reason), goTo: i => self.goTo(i),
      get isActive() { return self.active; },
    };
    if (cfg.id) __registry.set(cfg.id, this.api);
  }
  _key() { return 'orion:tour:' + (this.cfg.id || this._uid); }
  _persisted() { return this.cfg.persist ? ls.get(this._key(), null) : null; }
  _persist(v) { if (this.cfg.persist) ls.set(this._key(), v); }

  start({ force = false } = {}) {
    if (!isBrowser || !this.steps.length || this.active) return;
    const saved = this._persisted();
    if (saved && saved.completed && !force) return;
    this.active = true;
    this._buildChrome();
    this.goTo(force || !saved || !isNum(saved.step) ? 0 : clamp(saved.step, 0, this.steps.length - 1));
  }
  end(reason = 'end') {
    if (!this.active) return;
    this._endReason = reason;
    if (this._ov) this._ov.close(reason); else this._finish(reason);
  }
  next() { if (this.index >= this.steps.length - 1) this.end('finish'); else this.goTo(this.index + 1); }
  prev() { if (this.index > 0) this.goTo(this.index - 1); }

  async goTo(i) {
    if (!this.active || i < 0 || i >= this.steps.length) return;
    const seq = (this._seq = (this._seq || 0) + 1);
    this._teardownStep();
    this.index = i;
    this._persist({ step: i });
    const step = this.steps[i] || {};
    if (isFn(step.beforeShow)) { try { await step.beforeShow(); } catch (e) { console.error('[Orion] tour beforeShow:', e); } }
    let target = null;
    if (step.target != null) {
      target = await tourWaitFor(step.target, this.cfg.targetTimeout);
      if (!target) console.warn('[Orion] tour: target not found for step', i, step.target);
    }
    if (seq !== this._seq || !this.active) return; // superseded by a newer goTo() / ended while waiting
    this._currentTarget = target;
    if (target) { target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }); await nextFrame(); if (seq !== this._seq) return; }
    this._paint(target, step);
    this._bindAdvance(step, target);
    this._bindReposition();
    this.popover.focus({ preventScroll: true });
    try { this.cfg.onStep?.({ index: i, step }); } catch (e) { console.error(e); }
    this.dialog && emit(doc, 'o-tour-step', { id: this.cfg.id, index: i, step });
  }

  /* ── chrome (built once per run) ── */
  _buildChrome() {
    const uidM = uid('tourmask');
    this.svg = svg('svg', { class: 'o-tour-svg', 'aria-hidden': 'true' },
      svg('defs', null, svg('mask', { id: uidM }, svg('rect', { class: 'o-tour-mask-bg', x: '0', y: '0', width: '100%', height: '100%', fill: '#fff' }), svg('rect', { class: 'o-tour-hole', fill: '#000', rx: this.cfg.radius }))),
      svg('rect', { class: 'o-tour-scrim', x: '0', y: '0', width: '100%', height: '100%', mask: `url(#${uidM})` }));
    this.holeEl = this.svg.querySelector('.o-tour-hole');
    this.clickCatcher = this.cfg.overlayClose ? h('div', { class: 'o-tour-catcher' }) : null;
    this.arrow = h('span', { class: 'o-tour-arrow', 'aria-hidden': 'true' });
    this.titleId = uid('tourtitle');
    this.headEl = h('div', { class: 'o-tour-head' });
    this.bodyEl = h('div', { class: 'o-tour-body' });
    this.footEl = h('div', { class: 'o-tour-foot' });
    this.popover = h('div', { class: 'o-tour-popover o-floating', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': this.titleId, tabindex: '-1' }, this.arrow, this.headEl, this.bodyEl, this.footEl);
    const root = portalRoot();
    root.append(this.svg);
    if (this.clickCatcher) root.append(this.clickCatcher);
    root.append(this.popover);
    on(this.popover, 'click', '[data-tour-next]', () => this.next());
    on(this.popover, 'click', '[data-tour-prev]', () => this.prev());
    on(this.popover, 'click', '[data-tour-close]', () => this.end('skip'));
    on(this.popover, 'keydown', e => this._onKey(e));
    if (this.clickCatcher) on(this.clickCatcher, 'click', () => this.end('skip'));
    this._ov = overlays.open({
      el: this.popover, owner: null, escape: !!this.cfg.keyboard, outside: false, modal: false, trap: true, returnFocus: true,
      onClose: reason => this._finish(this._endReason || reason),
    });
  }
  _destroyChrome() {
    this._ov = null;
    this.svg?.remove(); this.clickCatcher?.remove(); this.popover?.remove();
    this.svg = this.clickCatcher = this.popover = null;
  }
  _finish(reason) {
    if (!this.active) return;
    this.active = false;
    this._teardownStep();
    this._destroyChrome();
    this._persist({ completed: true });
    if (reason === 'skip' || reason === 'escape') { try { this.cfg.onSkip?.(reason); } catch (e) { console.error(e); } }
    else { try { this.cfg.onFinish?.(reason); } catch (e) { console.error(e); } }
  }
  _onKey(e) {
    if (!this.cfg.keyboard) return;
    const rtl = isRTL(this.popover);
    if (e.key === 'ArrowRight') { e.preventDefault(); rtl ? this.prev() : this.next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); rtl ? this.next() : this.prev(); }
    else if (e.key === 'Enter' && e.target === this.popover) { e.preventDefault(); this.next(); }
  }

  /* ── per-step paint ── */
  _paint(target, step) {
    const n = this.steps.length, i = this.index, isFirst = i === 0, isLast = i === n - 1;
    this.popover.classList.toggle('is-centered', !target);
    this.headEl.replaceChildren(...[
      step.title ? h('h2', { class: 'o-tour-title', id: this.titleId }, step.title) : h('span', { id: this.titleId, class: 'o-sr-only' }, t('tour.of', { n: i + 1, total: n })),
      this.cfg.closable !== false ? h('button', { type: 'button', class: 'o-btn-close o-btn-close-sm', 'data-tour-close': '', 'aria-label': t('tour.close') }) : null,
    ].filter(Boolean));
    const media = step.media ? h('div', { class: 'o-tour-media' }, step.media.type === 'video'
      ? h('video', { src: step.media.src, controls: true, playsinline: true })
      : h('img', { src: step.media.src, alt: step.media.alt || '' })) : null;
    this.bodyEl.replaceChildren(...[media, h('div', { class: 'o-tour-content' }, ...tourNodes(step.content))].filter(Boolean));
    this.footEl.replaceChildren(
      h('div', { class: 'o-tour-progress' },
        h('div', { class: 'o-tour-dots' }, this.steps.map((_, di) => h('span', { class: cls('o-tour-dot', di === i && 'is-active', di < i && 'is-done') }))),
        h('span', { class: 'o-tour-count' }, t('tour.of', { n: i + 1, total: n }))),
      h('div', { class: 'o-tour-actions' },
        this.cfg.closable !== false && !isLast ? h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', 'data-tour-close': '' }, t('tour.skip')) : h('span'),
        h('div', { class: 'o-tour-nav' },
          !isFirst ? h('button', { type: 'button', class: 'o-btn o-btn-sm', 'data-tour-prev': '' }, t('tour.back')) : null,
          h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm', 'data-tour-next': '' }, isLast ? t('tour.done') : t('tour.next')))));
    this._reposition(target, step);
    animate(this.popover, 'zoomIn', { duration: 160 });
  }
  _reposition(target = this._currentTarget, step = this.steps[this.index] || {}) {
    if (!this.svg) return;
    const pad = step.spotlightPadding ?? this.cfg.spotlightPadding;
    const radius = step.radius ?? this.cfg.radius;
    this.holeEl.setAttribute('rx', radius);
    if (target && target.isConnected) {
      const r = target.getBoundingClientRect();
      const rect = { x: r.left - pad, y: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
      this.holeEl.setAttribute('x', rect.x); this.holeEl.setAttribute('y', rect.y);
      this.holeEl.setAttribute('width', Math.max(0, rect.width)); this.holeEl.setAttribute('height', Math.max(0, rect.height));
      if (this.clickCatcher) this.clickCatcher.style.clipPath = tourHoleClip(rect);
      place(this.popover, { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, { placement: step.placement || this.cfg.placement, offset: 12, flip: true, size: true, arrow: this.arrow });
      this.popover.classList.remove('is-centered');
    } else {
      this.holeEl.setAttribute('width', 0); this.holeEl.setAttribute('height', 0);
      if (this.clickCatcher) this.clickCatcher.style.clipPath = '';
      this.popover.classList.add('is-centered');
      this.popover.style.left = ''; this.popover.style.top = '';
    }
  }
  _bindReposition() {
    const update = rafThrottle(() => this._reposition());
    this._offReposition = [on(win, 'scroll', update, { capture: true, passive: true }), on(win, 'resize', update), observeResize(doc.body, update)];
    this._cancelReposition = update.cancel;
  }
  _bindAdvance(step, target) {
    if (!step.advanceOn || !target) return;
    const { selector, event = 'click' } = step.advanceOn;
    const el = selector ? target.querySelector(selector) || target : target;
    this._offAdvance = on(el, event, () => this.next());
  }
  _teardownStep() {
    this._offReposition?.forEach(f => f()); this._offReposition = null; this._cancelReposition?.(); this._cancelReposition = null;
    this._offAdvance?.(); this._offAdvance = null;
  }
}

O.tour = cfg => new Tour(cfg).api;
O.tour.get = id => __registry.get(id) || null;
