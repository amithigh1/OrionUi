/* Basics: small behaviours for the CSS-only components.
 *   data-o-dismiss="alert"          closes the nearest .o-alert (animated), fires o-close on it
 *   Orion.loading(el, true, 'Saving…') / Orion.loading(el, false)   overlay spinner on any container
 *   Orion.progress.start() / .set(0.4) / .done()                      thin page-top progress bar
 *   Orion.pageLoader.done()                                          fades out .o-page-loader
 *   <o-avatar name="Ada Lovelace" src="..." status="online" size="lg">  initials + color from name
 */

action('dismiss:alert', (btn) => {
  const alert = btn.closest('.o-alert');
  if (!alert) return;
  if (emit(alert, 'o-close', {}).defaultPrevented) return;
  animate(alert, 'fadeOut', { duration: 150 }).then(() => collapse(alert, false, { duration: 160 })).then(() => { emit(alert, 'o-closed', {}); alert.remove(); });
});

/** loading(el, on = true, text) — overlay spinner on a container */
O.loading = function (target, isOn = true, text = '') {
  const el = $(target);
  if (!el) return;
  let ov = el.querySelector(':scope > .o-loading-overlay');
  if (isOn) {
    if (!ov) {
      ov = h('div', { class: 'o-loading-overlay', role: 'status', 'aria-live': 'polite' }, h('span', { class: 'o-spinner' }), text ? h('span', { class: 'o-loading-text' }, text) : null);
      el.classList.add('o-is-loading');
      el.setAttribute('aria-busy', 'true');
      el.appendChild(ov);
    } else if (text) {
      const tEl = ov.querySelector('.o-loading-text');
      if (tEl) tEl.textContent = text; else ov.append(h('span', { class: 'o-loading-text' }, text));
    }
  } else if (ov) {
    ov.remove();
    el.classList.remove('o-is-loading');
    el.removeAttribute('aria-busy');
  }
};

/* ── top progress bar ──────────────────────────────────────────────── */
let __tb = null, __tbVal = 0, __tbTimer = null, __tbCount = 0;
function __tbEl() {
  if (!__tb) { __tb = h('div', { class: 'o-topbar', role: 'progressbar', 'aria-label': t('common.loading') }, h('div', { class: 'o-topbar-bar' })); doc.body.appendChild(__tb); }
  return __tb;
}
O.progress = {
  /** start() — show and trickle; nested calls are counted */
  start() {
    __tbCount++;
    const bar = __tbEl().firstChild;
    bar.style.opacity = '1';
    if (__tbVal === 0 || __tbVal === 1) { __tbVal = 0.08; bar.style.width = '8%'; }
    clearInterval(__tbTimer);
    __tbTimer = setInterval(() => O.progress.set(__tbVal + (1 - __tbVal) * 0.06 * Math.random() + 0.005), 300);
    return O.progress;
  },
  /** set(0..1) */
  set(v) { __tbVal = clamp(v, 0, 0.994); __tbEl().firstChild.style.width = (__tbVal * 100).toFixed(1) + '%'; return O.progress; },
  /** done(force) — complete and fade out when every start() has a matching done() */
  done(force = false) {
    __tbCount = force ? 0 : Math.max(0, __tbCount - 1);
    if (__tbCount > 0 || !__tb) return O.progress;
    clearInterval(__tbTimer);
    const bar = __tb.firstChild;
    bar.style.width = '100%'; __tbVal = 1;
    setTimeout(() => { bar.style.opacity = '0'; setTimeout(() => { if (__tbVal === 1) { bar.style.width = '0'; __tbVal = 0; } }, 400); }, 200);
    return O.progress;
  },
  /** wrap(promise) — start, then done when settled */
  wrap(p) { O.progress.start(); return Promise.resolve(p).finally(() => O.progress.done()); },
};

O.pageLoader = {
  done(sel = '.o-page-loader') { $$(sel).forEach(el => { el.classList.add('is-done'); setTimeout(() => el.remove(), 400); }); },
};

/* ── <o-avatar> ─────────────────────────────────────────────────────── */
const AVATAR_COLORS = ['primary', 'success', 'info', 'warning', 'danger', 'secondary'];
/** initials('Ada Lovelace') -> 'AL' */
function initials(name = '') {
  const parts = String(name).trim().split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return '';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] || '')).toUpperCase();
}
/** Stable color name for a string */
function colorFor(str = '') { let n = 0; for (const ch of String(str)) n = (n * 31 + ch.codePointAt(0)) >>> 0; return AVATAR_COLORS[n % AVATAR_COLORS.length]; }

class OAvatar extends OElement {
  static props = { name: String, src: String, size: String, status: String, shape: String, color: String, icon: String };
  setup() { this._userClass = this.className.split(/\s+/).filter(c => c && !/^o-(avatar|c-)/.test(c)).join(' '); }
  render() {
    const size = this.size ? ` o-avatar-${this.size}` : '';
    const c = this.color || colorFor(this.name);
    this.className = `${this._userClass} o-avatar${size} o-c-${c}${this.shape === 'square' ? ' o-avatar-square' : ''}`.trim();
    if (this.status) this.setAttribute('data-status', this.status); else this.removeAttribute('data-status');
    this.setAttribute('role', 'img');
    this.setAttribute('aria-label', this.name || 'avatar');
    if (this.src) {
      const img = h('img', { src: this.src, alt: '', loading: 'lazy', onError: () => { img.remove(); this.textContent = initials(this.name); } });
      this.replaceChildren(img);
    } else if (this.icon || !this.name) this.innerHTML = String(icon(this.icon || 'user'));
    else this.textContent = initials(this.name);
  }
}
define('o-avatar', OAvatar);
O.avatar = { initials, colorFor };
