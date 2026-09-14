/* ============================================================================
 * core: configuration & boot
 *
 * Configure with (any of):
 *   <script src="orion.js" data-theme="dark" data-locale="ms" data-currency="MYR"
 *           data-css="false" data-reboot="false" data-persist="false" data-week-start="1"></script>
 *   <script>window.OrionConfig = { theme: 'auto', locale: 'en', tokens: { primary: '#0ea5e9' } }</script>
 *   Orion.init({ ... })   // at any time
 * ========================================================================== */

const __config = {
  theme: 'auto',      // 'light' | 'dark' | 'auto'
  locale: null,       // default: saved choice, <html lang>, 'en'
  css: true,          // inject the embedded stylesheet
  reboot: true,       // include the base element styles (body font, headings, links...)
  nonce: null,        // CSP nonce for the injected <style>
  persist: true,      // remember theme / locale / font scale / tenant in localStorage
  currency: 'USD',
  weekStart: null,    // 0 = Sunday, 1 = Monday (default: from locale)
  autoDir: true,      // switching to an RTL language sets <html dir="rtl">
};
O.config = __config;

function __readConfig() {
  if (!isBrowser) return;
  if (win.OrionConfig && isObj(win.OrionConfig)) merge(__config, win.OrionConfig);
  const ds = (__script && __script.dataset) || {};
  for (const k of ['theme', 'locale', 'css', 'reboot', 'nonce', 'currency', 'persist', 'weekStart', 'autoDir', 'tenant']) {
    if (ds[k] == null) continue;
    const v = ds[k];
    __config[k] = v === 'false' ? false : v === 'true' || v === '' ? true : v;
  }
  if (!__config.nonce && __script && __script.nonce) __config.nonce = __script.nonce;
  if (__config.weekStart != null && __config.weekStart !== '') __config.weekStart = +__config.weekStart;
}

function __injectCSS() {
  if (!isBrowser || __config.css === false || doc.getElementById('orion-css')) return;
  const cssText = (__config.reboot === false ? '' : __CSS_REBOOT__) + __CSS__;
  const style = doc.createElement('style');
  style.id = 'orion-css';
  if (__config.nonce) style.nonce = __config.nonce;
  style.textContent = cssText;
  const head = doc.head || doc.documentElement;
  head.insertBefore(style, head.firstChild); // first, so your own stylesheets override Orion
  try {
    if (!style.sheet || !style.sheet.cssRules.length) { // inline styles blocked by CSP -> constructable sheet
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(cssText);
      doc.adoptedStyleSheets = [sheet, ...doc.adoptedStyleSheets];
    }
  } catch {}
}

let __booted = false;
O._boot = function () {
  if (__booted || !isBrowser) return;
  __booted = true;
  __readConfig();
  __injectCSS();
  if (!win.Orion) win.Orion = O;

  // locale: explicit config / saved choice switch fully (incl. dir); <html lang> is only adopted
  const saved = __config.persist !== false ? ls.get('orion:locale') : null;
  if (__config.locale || saved) i18n.set(__config.locale || saved, { persist: false });
  else __i18n.locale = doc.documentElement.lang || 'en';

  if (__config.themes) for (const [n, tk] of Object.entries(__config.themes)) theme.register(n, tk);
  __themeBoot();
  if (__config.tokens) theme.set(__config.tokens);
  if (__config.brand) theme.brand(__config.brand);
  if (__config.tenant && theme.tenants[__config.tenant] && !theme.tenant) theme.use(__config.tenant, { persist: false });

  bus.emit('boot');
  ready(() => {
    __bhObserve();
    __bhScan(doc.body);
    on(doc, 'click', '[data-o-toggle],[data-o-action],[data-o-dismiss]', __runAction);
    doc.documentElement.classList.add('o-ready');
    bus.emit('ready');
    emit(doc, 'o-ready', { version: VERSION });
  });
};

/** Orion.init(config) — reconfigure at runtime (theme, locale, tokens, themes, tenant, brand, currency...). */
O.init = function (cfg = {}) {
  merge(__config, cfg);
  if (!isBrowser) return O;
  if (!__booted) return O; // _boot() reads the merged config
  if (cfg.themes) for (const [n, tk] of Object.entries(cfg.themes)) theme.register(n, tk);
  if (cfg.theme) theme.setMode(cfg.theme, { persist: false });
  if (cfg.locale) i18n.set(cfg.locale, { persist: false });
  if (cfg.tokens) theme.set(cfg.tokens);
  if (cfg.brand) theme.brand(cfg.brand);
  if (cfg.tenant) theme.use(cfg.tenant, { persist: false });
  if (cfg.css === false) doc.getElementById('orion-css')?.remove();
  else if (cfg.css === true) __injectCSS();
  return O;
};

/** Everything a component author needs, for code outside the bundle (plugins). */
O.core = {
  OElement, FormElement, define, behavior, action, targetOf, overlays, portal, portalRoot, inheritContext, place, autoPlace,
  computePosition, animate, collapse, ListNav, announce, icon, iconEl, h, svg, html, raw, esc, on, emit, $, $$, cls, css, t, i18n,
  fmt, date, theme, color, bus, uid, debounce, throttle, rafThrottle, clamp, merge, clone, equal, getPath, setPath, fuzzy,
  highlight, fuzzySearch, sanitize, observeResize, observeVisible, lockScroll, trapFocus, focusables, focusFirst, onClickOutside,
  ls, Z, Any, patchList, ready, download, downloadURL, loadScript, dirOf, isRTL, formatBytes, parseAttr, Emitter,
};
