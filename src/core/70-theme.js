/* ============================================================================
 * core: theming — light/dark/auto, high contrast, font scale, runtime tokens,
 * multi-tenant themes and white-label branding. Color utilities in Orion.color.
 * ========================================================================== */

/* ── color utilities ──────────────────────────────────────────────────── */
const color = {
  /** parse('#4f46e5' | '#abc' | 'rgb(1,2,3)' | 'rgba(...)' | 'hsl(...)') -> { r, g, b, a } | null */
  parse(input) {
    if (!input) return null;
    if (isObj(input) && 'r' in input) return { a: 1, ...input };
    let s = String(input).trim().toLowerCase();
    let m = s.match(/^#([0-9a-f]{3,8})$/);
    if (m) {
      let hx = m[1];
      if (hx.length === 3 || hx.length === 4) hx = hx.split('').map(c => c + c).join('');
      const n = parseInt(hx.slice(0, 6), 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: hx.length === 8 ? parseInt(hx.slice(6), 16) / 255 : 1 };
    }
    m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4] };
    m = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)$/);
    if (m) return { ...color.fromHsl(+m[1], +m[2], +m[3]), a: m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4] };
    if (isBrowser && /^[a-z]+$/.test(s)) { // named colors via canvas
      const c = doc.createElement('canvas').getContext('2d'); c.fillStyle = '#000'; c.fillStyle = s;
      return c.fillStyle.startsWith('#') ? color.parse(c.fillStyle) : null;
    }
    return null;
  },
  toHex(c) { c = color.parse(c); if (!c) return ''; const x = v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0'); return '#' + x(c.r) + x(c.g) + x(c.b) + (c.a < 1 ? x(c.a * 255) : ''); },
  toRgb(c) { c = color.parse(c); return c ? (c.a < 1 ? `rgba(${c.r}, ${c.g}, ${c.b}, ${round(c.a, 3)})` : `rgb(${c.r}, ${c.g}, ${c.b})`) : ''; },
  toHsl(c) {
    c = color.parse(c); if (!c) return null;
    const r = c.r / 255, g = c.g / 255, b = c.b / 255, max = Math.max(r, g, b), min = Math.min(r, g, b);
    let hh = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      hh = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      hh *= 60;
    }
    return { h: round(hh, 1), s: round(s * 100, 1), l: round(l * 100, 1), a: c.a };
  },
  fromHsl(hh, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + hh / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255), a: 1 };
  },
  /** mix(a, b, weight 0..1 of b) */
  mix(a, b, w = 0.5) { a = color.parse(a); b = color.parse(b); if (!a || !b) return ''; return color.toHex({ r: a.r + (b.r - a.r) * w, g: a.g + (b.g - a.g) * w, b: a.b + (b.b - a.b) * w, a: a.a + (b.a - a.a) * w }); },
  lighten: (c, amt = 0.1) => color.mix(c, '#ffffff', amt),
  darken: (c, amt = 0.1) => color.mix(c, '#000000', amt),
  alpha(c, a) { c = color.parse(c); return c ? color.toRgb({ ...c, a }) : ''; },
  luminance(c) {
    c = color.parse(c); if (!c) return 0;
    const ch = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  },
  /** WCAG contrast ratio (1..21) */
  contrast(a, b) { const x = color.luminance(a), y = color.luminance(b); return round((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05), 2); },
  /** Best readable text color on a background */
  readable(bg, light = '#ffffff', dark = '#0f172a') { return color.contrast(bg, light) >= color.contrast(bg, dark) ? light : dark; },
  /** palette('#4f46e5') -> { 50: '#...', 100: ..., 900, 950 } */
  palette(base) {
    const hsl = color.toHsl(base); if (!hsl) return {};
    const stops = { 50: 97, 100: 94, 200: 86, 300: 76, 400: 64, 500: 54, 600: 46, 700: 38, 800: 30, 900: 23, 950: 15 };
    const out = {};
    for (const [k, l] of Object.entries(stops)) {
      const sat = hsl.s * (k < 200 ? 0.9 : k > 800 ? 0.85 : 1);
      out[k] = color.toHex(color.fromHsl(hsl.h, clamp(sat, 0, 100), l));
    }
    return out;
  },
  random: () => color.toHex(color.fromHsl(Math.floor(Math.random() * 360), 65, 52)),
};
O.color = color;

/* ── theme state ──────────────────────────────────────────────────────── */
const TOKEN_ALIASES = {
  primary: '--o-primary', secondary: '--o-secondary', success: '--o-success', danger: '--o-danger', warning: '--o-warning', info: '--o-info',
  light: '--o-light', dark: '--o-dark', bg: '--o-bg', surface: '--o-surface', text: '--o-text', textMuted: '--o-text-muted', border: '--o-border',
  radius: '--o-radius', radiusSm: '--o-radius-sm', radiusLg: '--o-radius-lg', font: '--o-font-sans', fontMono: '--o-font-mono',
  fontSize: '--o-fs-base', sidebarWidth: '--o-sidebar-w', headerHeight: '--o-header-h', sidebarBg: '--o-sidebar-bg', sidebarText: '--o-sidebar-text',
  headerBg: '--o-header-bg', controlHeight: '--o-control-h',
};
const SEMANTIC = ['primary', 'secondary', 'success', 'danger', 'warning', 'info'];
const __theme = { mode: 'auto', tenants: {}, tenant: null, applied: new Set(), brand: {} };
let __mql = null;

const theme = {
  get mode() { return __theme.mode; },
  /** 'light' | 'dark' — the mode actually displayed */
  get resolved() { return __theme.mode === 'auto' ? (__mql && __mql.matches ? 'dark' : 'light') : __theme.mode; },
  /** setMode('light' | 'dark' | 'auto') */
  setMode(mode, { persist = true } = {}) {
    if (!['light', 'dark', 'auto'].includes(mode)) mode = 'auto';
    __theme.mode = mode;
    if (isBrowser) {
      doc.documentElement.setAttribute('data-theme', mode);
      if (persist && O.config?.persist !== false) ls.set('orion:theme', mode);
      emit(doc, 'o-theme', { mode, resolved: theme.resolved });
    }
    bus.emit('theme', { mode, resolved: theme.resolved });
    return theme;
  },
  toggle() { return theme.setMode(theme.resolved === 'dark' ? 'light' : 'dark'); },
  /** light -> dark -> auto -> light */
  cycle() { return theme.setMode({ light: 'dark', dark: 'auto', auto: 'light' }[__theme.mode] || 'light'); },
  get highContrast() { return isBrowser && doc.documentElement.getAttribute('data-contrast') === 'high'; },
  setContrast(high, { persist = true } = {}) {
    if (!isBrowser) return theme;
    doc.documentElement.toggleAttribute('data-contrast', !!high);
    if (high) doc.documentElement.setAttribute('data-contrast', 'high');
    if (persist && O.config?.persist !== false) ls.set('orion:contrast', !!high);
    bus.emit('theme', { contrast: !!high, mode: __theme.mode, resolved: theme.resolved });
    return theme;
  },
  get fontScale() { return isBrowser ? parseFloat(doc.documentElement.style.getPropertyValue('--o-font-scale')) || 1 : 1; },
  /** setFontScale(1.125) — scales every rem-based size (0.75 – 1.5) */
  setFontScale(scale, { persist = true } = {}) {
    if (!isBrowser) return theme;
    const s = clamp(+scale || 1, 0.75, 1.5);
    doc.documentElement.style.setProperty('--o-font-scale', String(s));
    if (persist && O.config?.persist !== false) ls.set('orion:fontScale', s);
    bus.emit('theme', { fontScale: s, mode: __theme.mode, resolved: theme.resolved });
    return theme;
  },
  /**
   * set({ primary: '#e11d48', radius: '4px', font: 'Inter, sans-serif', '--o-custom': 'x' }, scopeEl?)
   * Also derives readable on-colors (--o-on-primary ...).
   */
  set(tokens = {}, scope) {
    if (!isBrowser) return theme;
    const el = scope || doc.documentElement;
    for (const [k, v] of Object.entries(tokens)) {
      const prop = k.startsWith('--') ? k : TOKEN_ALIASES[k] || '--o-' + kebab(k);
      if (v == null || v === '') { el.style.removeProperty(prop); __theme.applied.delete(prop); continue; }
      el.style.setProperty(prop, String(v));
      if (el === doc.documentElement) __theme.applied.add(prop);
      if (SEMANTIC.includes(k) && color.parse(v)) {
        const on = color.readable(v);
        el.style.setProperty(`--o-on-${k}`, on);
        el.style.setProperty(`--o-${k}-hover`, color.luminance(v) < 0.03 ? color.lighten(v, 0.15) : color.darken(v, 0.12));
        if (el === doc.documentElement) __theme.applied.add(`--o-on-${k}`).add(`--o-${k}-hover`);
      }
    }
    bus.emit('theme', { tokens, mode: __theme.mode, resolved: theme.resolved });
    return theme;
  },
  /** get('primary') -> computed token value */
  get(token, scope) {
    if (!isBrowser) return '';
    const prop = token.startsWith('--') ? token : TOKEN_ALIASES[token] || '--o-' + kebab(token);
    return getComputedStyle(scope || doc.documentElement).getPropertyValue(prop).trim();
  },
  /** Remove every token applied with set() / use() */
  reset() {
    if (!isBrowser) return theme;
    __theme.applied.forEach(p => doc.documentElement.style.removeProperty(p));
    __theme.applied.clear();
    __theme.tenant = null;
    doc.documentElement.removeAttribute('data-tenant');
    bus.emit('theme', { reset: true, mode: __theme.mode, resolved: theme.resolved });
    return theme;
  },
  /** register('acme', { primary: '#0ea5e9', radius: '2px', brand: { name: 'ACME', logo: '/acme.svg' } }) */
  register(name, tokens) { __theme.tenants[name] = tokens; return theme; },
  get tenants() { return { ...__theme.tenants }; },
  get tenant() { return __theme.tenant; },
  /** use('acme') — switch tenant theme (tokens + branding), persisted */
  use(name, { persist = true } = {}) {
    const def = __theme.tenants[name];
    if (!def) { console.warn('[Orion] unknown theme', name); return theme; }
    theme.reset();
    const { brand, mode, ...tokens } = def;
    theme.set(tokens);
    if (brand) theme.brand(brand);
    if (mode) theme.setMode(mode, { persist: false });
    __theme.tenant = name;
    if (isBrowser) doc.documentElement.setAttribute('data-tenant', name);
    if (persist && O.config?.persist !== false) ls.set('orion:tenant', name);
    return theme;
  },
  /**
   * brand({ name, logo, logoDark, favicon, title }) — white-label: updates
   * [data-o-brand="name"] text, [data-o-brand="logo"] <img src>, favicon and document title suffix.
   */
  brand(b = {}) {
    Object.assign(__theme.brand, b);
    if (!isBrowser) return theme;
    const B = __theme.brand, dark = theme.resolved === 'dark';
    $$('[data-o-brand="name"]').forEach(el => { if (B.name) el.textContent = B.name; });
    $$('[data-o-brand="logo"]').forEach(el => { const src = (dark && B.logoDark) || B.logo; if (src) { if (el.tagName === 'IMG') el.src = src; else el.style.backgroundImage = `url("${src}")`; } });
    if (B.favicon) { let l = doc.querySelector('link[rel~="icon"]'); if (!l) { l = h('link', { rel: 'icon' }); doc.head.appendChild(l); } l.href = B.favicon; }
    if (B.title) doc.title = B.title;
    bus.emit('brand', { ...B });
    return theme;
  },
  get brandInfo() { return { ...__theme.brand }; },
  /** Export current overrides as a CSS snippet (theme builder) */
  exportCSS(selector = ':root') {
    if (!isBrowser) return '';
    const st = doc.documentElement.style, lines = [];
    for (let i = 0; i < st.length; i++) { const p = st[i]; if (p.startsWith('--o-')) lines.push(`  ${p}: ${st.getPropertyValue(p).trim()};`); }
    return `${selector} {\n${lines.join('\n')}\n}`;
  },
  onChange: fn => bus.on('theme', fn),
};
O.theme = theme;

function __themeBoot() {
  if (!isBrowser) return;
  const cfg = O.config || {};
  const saved = cfg.persist !== false ? ls.get('orion:theme') : null;
  theme.setMode(saved || cfg.theme || doc.documentElement.getAttribute('data-theme') || 'auto', { persist: false });
  if (cfg.persist !== false && ls.get('orion:contrast')) theme.setContrast(true, { persist: false });
  const fs = cfg.persist !== false ? ls.get('orion:fontScale') : null;
  if (fs === 0.75) {
    ls.remove('orion:fontScale');
  } else if (fs && fs !== 1) {
    theme.setFontScale(fs, { persist: false });
  }
  const tenant = cfg.persist !== false ? ls.get('orion:tenant') : null;
  if (tenant && __theme.tenants[tenant]) theme.use(tenant, { persist: false });
  if (win.matchMedia) {
    __mql = win.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (__theme.mode === 'auto') { bus.emit('theme', { mode: 'auto', resolved: theme.resolved }); emit(doc, 'o-theme', { mode: 'auto', resolved: theme.resolved }); if (__theme.brand.logoDark) theme.brand(); } };
    __mql.addEventListener ? __mql.addEventListener('change', onChange) : __mql.addListener(onChange);
  }
  // actions: data-o-toggle="theme" | data-o-action="theme" data-o-value="dark|light|auto|cycle|contrast|font+|font-"
  action('theme', (el) => {
    const v = el.getAttribute('data-o-value');
    if (!v || v === 'toggle') theme.toggle();
    else if (v === 'cycle') theme.cycle();
    else if (v === 'contrast') theme.setContrast(!theme.highContrast);
    else if (v === 'font+') theme.setFontScale(theme.fontScale + 0.0625);
    else if (v === 'font-') theme.setFontScale(theme.fontScale - 0.0625);
    else if (v === 'font0') theme.setFontScale(1);
    else if (__theme.tenants[v]) theme.use(v);
    else theme.setMode(v);
  });
  action('locale', el => { const v = el.getAttribute('data-o-value'); if (v) i18n.set(v); });
}
