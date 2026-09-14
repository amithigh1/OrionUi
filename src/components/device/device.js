/* Orion.device — browser & device detection (UA Client Hints + UA fallback) with live media state.
 *   Orion.device.mobile | tablet | desktop | touch | pointer | os | osVersion | browser | browserVersion | engine
 *   Orion.device.breakpoint ('xs'…'xxl') | orientation | online | prefersDark | reducedMotion | connection | supports.webp …
 *   Orion.device.onChange(({ type, from, to }) => …)  -> off()   type: breakpoint | orientation | online | theme | motion | pointer | connection | standalone | supports | ua
 *   Orion.device.is('md-up') · is('ios android') (space/comma = OR, "+" = AND, "!x" = NOT)
 *   await Orion.device.ready   (async refinements: UA-CH high entropy values, AVIF/WebP decode tests)
 *   <div data-o-show="mobile">…</div>   <div data-o-hide="lg-down">…</div>
 *   <html class="o-touch o-mobile o-os-ios o-browser-safari o-engine-webkit o-bp-sm o-portrait …">
 */

const BP = { sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1400 };
const BP_ORDER = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'];
const mq = q => (isBrowser && win.matchMedia ? win.matchMedia(q) : null);
const mqm = q => !!mq(q)?.matches;
const nav = () => (isBrowser ? win.navigator : {});

/** parseUA(userAgent, { touchPoints, uaData }) -> { os, osVersion, browser, browserVersion, engine, mobile, tablet } */
function parseUA(ua = '', { touchPoints = 0, uaData = null } = {}) {
  const m = (re, i = 1) => { const x = ua.match(re); return x ? (x[i] || '').replace(/_/g, '.') : ''; };
  let os = 'unknown', osVersion = '', ipad = false;
  if (/iPhone|iPad|iPod/.test(ua)) { os = 'ios'; osVersion = m(/OS (\d+[_.]\d+(?:[_.]\d+)?)/); ipad = /iPad/.test(ua); }
  else if (/Macintosh/.test(ua) && touchPoints > 1) { os = 'ios'; osVersion = m(/Version\/([\d.]+)/); ipad = true; }
  else if (/Android/.test(ua)) { os = 'android'; osVersion = m(/Android ([\d.]+)/); }
  else if (/CrOS/.test(ua)) { os = 'chromeos'; osVersion = m(/CrOS \S+ ([\d.]+)/); }
  else if (/Windows/.test(ua)) { os = 'windows'; const nt = m(/Windows NT ([\d.]+)/); osVersion = { '10.0': '10', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP' }[nt] || nt; }
  else if (/Mac OS X|Macintosh/.test(ua)) { os = 'macos'; osVersion = m(/Mac OS X (\d+[_.]\d+(?:[_.]\d+)?)/); }
  else if (/Linux|X11/.test(ua)) os = 'linux';

  let browser = 'unknown', browserVersion = '';
  const B = [['edge', /Edg(?:e|A|iOS)?\/([\d.]+)/], ['opera', /(?:OPR|OPiOS)\/([\d.]+)/], ['samsung', /SamsungBrowser\/([\d.]+)/],
    ['yandex', /YaBrowser\/([\d.]+)/], ['vivaldi', /Vivaldi\/([\d.]+)/], ['firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['chrome', /(?:Chrome|CriOS)\/([\d.]+)/], ['safari', /Version\/([\d.]+)(?: Mobile\/\S+)? Safari/], ['ie', /(?:MSIE |Trident\/.*rv:)([\d.]+)/]];
  for (const [name, re] of B) { const v = m(re); if (v) { browser = name; browserVersion = v; break; } }
  if (browser === 'unknown' && /Safari/.test(ua) && /AppleWebKit/.test(ua)) browser = 'safari';

  const engine = os === 'ios' ? 'webkit' : /Trident|MSIE/.test(ua) ? 'trident' : /Gecko\/\d/.test(ua) && /Firefox/.test(ua) ? 'gecko'
    : /Chrome|Chromium|CriOS|Edg\//.test(ua) ? 'blink' : /AppleWebKit/.test(ua) ? 'webkit' : 'unknown';
  const tablet = ipad || /Tablet|PlayBook|Silk|Kindle/.test(ua) || (os === 'android' && !/Mobile/.test(ua));
  const mobile = !tablet && (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|IEMobile|Opera Mini|BlackBerry/.test(ua) || !!uaData?.mobile);

  // UA Client Hints (low entropy) win over the frozen UA string
  if (uaData?.brands?.length) {
    const brands = uaData.brands.filter(b => !/not.?a.?brand|^\W/i.test(b.brand));
    const map = [['edge', /Edge/i], ['opera', /Opera/i], ['samsung', /Samsung/i], ['yandex', /Yandex|YaBrowser/i], ['vivaldi', /Vivaldi/i], ['brave', /Brave/i], ['chrome', /Chrom/i]];
    for (const [name, re] of map) { const b = brands.find(x => re.test(x.brand)); if (b) { browser = name; browserVersion = browserVersion && browserVersion.split('.')[0] === String(b.version) ? browserVersion : String(b.version); break; } }
    const P = { windows: 'windows', macos: 'macos', android: 'android', 'chrome os': 'chromeos', chromeos: 'chromeos', linux: 'linux', ios: 'ios' }[String(uaData.platform || '').toLowerCase()];
    if (P && P !== os) { os = P; osVersion = ''; }
  }
  return { os, osVersion, browser, browserVersion, engine, mobile, tablet };
}

const __dev = new Emitter();
const __state = {};
let __webgl;

const device = {
  mobile: false, tablet: false, desktop: true, touch: false, os: 'unknown', osVersion: '', browser: 'unknown', browserVersion: '',
  engine: 'unknown', model: '', ua: '', memory: null, cores: null,
  get pointer() { return mqm('(pointer: coarse)') ? 'coarse' : 'fine'; },
  get hover() { return isBrowser ? mqm('(hover: hover)') : true; },
  get standalone() { return !!nav().standalone || ['standalone', 'minimal-ui', 'window-controls-overlay'].some(d => mqm(`(display-mode: ${d})`)); },
  get pixelRatio() { return isBrowser ? win.devicePixelRatio || 1 : 1; },
  get prefersDark() { return mqm('(prefers-color-scheme: dark)'); },
  get reducedMotion() { return mqm('(prefers-reduced-motion: reduce)'); },
  get online() { return isBrowser ? nav().onLine !== false : true; },
  get connection() { const c = nav().connection || {}; return { effectiveType: c.effectiveType || null, downlink: c.downlink ?? null, rtt: c.rtt ?? null, saveData: !!c.saveData, type: c.type || null }; },
  get orientation() {
    if (!isBrowser) return 'landscape';
    const t = win.screen?.orientation?.type;
    return t ? (t.startsWith('portrait') ? 'portrait' : 'landscape') : mqm('(orientation: portrait)') ? 'portrait' : 'landscape';
  },
  get breakpoint() { if (!isBrowser) return 'lg'; for (let i = BP_ORDER.length - 1; i > 0; i--) if (mqm(`(min-width: ${BP[BP_ORDER[i]]}px)`)) return BP_ORDER[i]; return 'xs'; },
  get width() { return isBrowser ? win.innerWidth : 0; },
  get height() { return isBrowser ? win.innerHeight : 0; },
  supports: {},
  ready: Promise.resolve(),
  breakpoints: { ...BP },
  parseUA,
  /** is('md-up') / is('ios android') / is('mobile+ios') / is('!touch') */
  is(query) {
    return String(query ?? '').split(/[\s,|]+/).filter(Boolean).some(tok => tok.split('+').every(part => {
      const neg = part[0] === '!' || part.startsWith('not-');
      const r = __test(part.replace(/^!|^not-/, '').toLowerCase());
      return neg ? !r : r;
    }));
  },
  /** onChange(fn({ type, from, to, device })) -> off() */
  onChange(fn) { return __dev.on('change', fn); },
  /** Re-read everything (after e.g. a user-agent override in tests). */
  refresh() { __detect(); __classes(); return device; },
};

function __test(k) {
  const d = device, bp = BP_ORDER.indexOf(d.breakpoint);
  const m = k.match(/^(xs|sm|md|lg|xl|xxl)(?:-(up|down|only))?$/);
  if (m) { const i = BP_ORDER.indexOf(m[1]); return m[2] === 'up' ? bp >= i : m[2] === 'down' ? bp <= i : bp === i; }
  switch (k) {
    case 'mobile': case 'tablet': case 'desktop': case 'touch': case 'standalone': case 'online': return !!d[k];
    case 'offline': return !d.online;
    case 'coarse': case 'fine': return d.pointer === k;
    case 'hover': return d.hover;
    case 'portrait': case 'landscape': return d.orientation === k;
    case 'dark': return d.prefersDark;
    case 'light': return !d.prefersDark;
    case 'reduced-motion': return d.reducedMotion;
    case 'retina': return d.pixelRatio >= 2;
    case 'save-data': return d.connection.saveData;
    case 'mac': return d.os === 'macos';
    case 'apple': return d.os === 'macos' || d.os === 'ios';
    default: return d.os === k || d.browser === k || d.engine === k;
  }
}

function __detect() {
  if (!isBrowser) return;
  const n = nav();
  const p = parseUA(n.userAgent || '', { touchPoints: n.maxTouchPoints || 0, uaData: n.userAgentData });
  Object.assign(device, p, { desktop: !p.mobile && !p.tablet, ua: n.userAgent || '', memory: n.deviceMemory ?? null, cores: n.hardwareConcurrency ?? null,
    touch: (n.maxTouchPoints || 0) > 0 || 'ontouchstart' in win });
  const w = win, s = device.supports;
  const cv = doc.createElement('canvas');
  Object.assign(s, {
    webp: s.webp ?? (() => { try { return cv.toDataURL('image/webp').startsWith('data:image/webp'); } catch { return false; } })(),
    avif: s.avif ?? false,
    touch: device.touch, share: !!n.share, clipboard: !!n.clipboard?.writeText, notifications: 'Notification' in w,
    serviceWorker: 'serviceWorker' in n, webauthn: !!w.PublicKeyCredential, barcodeDetector: 'BarcodeDetector' in w,
    eyeDropper: 'EyeDropper' in w, speechSynthesis: 'speechSynthesis' in w, speechRecognition: 'SpeechRecognition' in w || 'webkitSpeechRecognition' in w,
    mediaRecorder: 'MediaRecorder' in w, fullscreen: !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled), vibrate: 'vibrate' in n,
    geolocation: 'geolocation' in n, webrtc: 'RTCPeerConnection' in w, wakeLock: 'wakeLock' in n, bluetooth: 'bluetooth' in n, usb: 'usb' in n,
    indexedDB: 'indexedDB' in w, broadcastChannel: 'BroadcastChannel' in w, pointerEvents: 'PointerEvent' in w,
  });
  s.speech = s.speechSynthesis || s.speechRecognition;
  if (!Object.getOwnPropertyDescriptor(s, 'webgl')) {
    Object.defineProperty(s, 'webgl', { enumerable: true, get() {
      if (__webgl === undefined) { try { const c = doc.createElement('canvas'); __webgl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { __webgl = false; } }
      return __webgl;
    } });
  }
}

const __imgTest = src => new Promise(res => { const i = new Image(); i.onload = () => res(i.width > 0); i.onerror = () => res(false); i.src = src; });
async function __refine() {
  const n = nav(), s = device.supports, before = s.webp + '|' + s.avif;
  const [webp, avif] = await Promise.all([
    __imgTest('data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'),
    __imgTest('data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A='),
  ]);
  s.webp = webp || s.webp; s.avif = avif;
  if (before !== s.webp + '|' + s.avif) __fire('supports', before, s.webp + '|' + s.avif);
  const uad = n.userAgentData;
  if (uad?.getHighEntropyValues) {
    try {
      const hi = await uad.getHighEntropyValues(['platformVersion', 'fullVersionList', 'model']);
      const old = device.os + ' ' + device.osVersion + ' ' + device.browserVersion;
      const pv = hi.platformVersion || '';
      if (device.os === 'windows' && pv) device.osVersion = parseInt(pv, 10) >= 13 ? '11' : parseInt(pv, 10) > 0 ? '10' : device.osVersion;
      else if (pv && ['macos', 'android', 'chromeos', 'ios'].includes(device.os)) device.osVersion = pv;
      const fv = (hi.fullVersionList || []).find(b => String(b.version).split('.')[0] === String(device.browserVersion).split('.')[0] && !/not.?a.?brand/i.test(b.brand));
      if (fv) device.browserVersion = fv.version;
      if (hi.model) device.model = hi.model;
      const now = device.os + ' ' + device.osVersion + ' ' + device.browserVersion;
      if (old !== now) __fire('ua', old, now);
    } catch {}
  }
  return device;
}

function __fire(type, from, to) {
  const detail = { type, from, to, device };
  __classes();
  __dev.emit('change', detail);
  bus.emit('device:change', detail);
}

const __clsPrev = new Set();
function __classes() {
  if (!isBrowser) return;
  const d = device, want = new Set([
    d.touch ? 'o-touch' : 'o-no-touch', d.mobile ? 'o-mobile' : d.tablet ? 'o-tablet' : 'o-desktop', 'o-os-' + d.os, 'o-browser-' + d.browser,
    'o-engine-' + d.engine, 'o-pointer-' + d.pointer, 'o-bp-' + d.breakpoint, 'o-' + d.orientation,
    d.standalone && 'o-standalone', !d.online && 'o-offline', d.reducedMotion && 'o-reduced-motion',
  ].filter(Boolean));
  const cl = doc.documentElement.classList;
  __clsPrev.forEach(c => { if (!want.has(c)) cl.remove(c); });
  want.forEach(c => cl.add(c));
  __clsPrev.clear(); want.forEach(c => __clsPrev.add(c));
  __vis.forEach(__applyVis);
}

function __watch() {
  const track = (type, read, targets) => {
    __state[type] = read();
    const check = () => { const v = read(); if (v !== __state[type]) { const from = __state[type]; __state[type] = v; __fire(type, from, v); } };
    targets.forEach(t => { if (!t) return; if (t.addEventListener) t.addEventListener('change', check); else if (t.addListener) t.addListener(check); });
    return check;
  };
  track('breakpoint', () => device.breakpoint, Object.values(BP).map(px => mq(`(min-width: ${px}px)`)));
  const orient = track('orientation', () => device.orientation, [mq('(orientation: portrait)'), win.screen?.orientation]);
  track('theme', () => (device.prefersDark ? 'dark' : 'light'), [mq('(prefers-color-scheme: dark)')]);
  track('motion', () => (device.reducedMotion ? 'reduce' : 'no-preference'), [mq('(prefers-reduced-motion: reduce)')]);
  track('pointer', () => device.pointer, [mq('(pointer: coarse)')]);
  track('standalone', () => device.standalone, [mq('(display-mode: standalone)')]);
  const online = track('online', () => device.online, []);
  on(win, 'online offline', online);
  on(win, 'orientationchange', orient);
  const c = nav().connection;
  if (c?.addEventListener) track('connection', () => { const x = device.connection; return `${x.effectiveType}|${x.downlink}|${x.rtt}|${x.saveData}`; }, [c]);
}

/* ── data-o-show / data-o-hide ─────────────────────────────────────── */
const __vis = new Set();
function __applyVis(el) {
  const s = el.getAttribute('data-o-show'), hd = el.getAttribute('data-o-hide');
  if (s == null && hd == null) { el.classList.remove('o-device-hidden'); __vis.delete(el); return; }
  el.classList.toggle('o-device-hidden', (s != null && !device.is(s)) || (hd != null && device.is(hd)));
}
const __visInit = el => { __vis.add(el); __applyVis(el); return () => { if (el.isConnected) __applyVis(el); else { __vis.delete(el); el.classList.remove('o-device-hidden'); } }; };
behavior('data-o-show', __visInit);
behavior('data-o-hide', __visInit);

if (isBrowser) {
  __detect();
  __classes();
  __watch();
  device.ready = __refine().catch(() => device);
}
O.device = device;
