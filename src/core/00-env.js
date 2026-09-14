/* ============================================================================
 * Orion Admin — core: environment & utilities
 * All top-level declarations in src/core/*.js share ONE scope inside the bundle
 * and are visible to every component file. Keep names unique.
 * ========================================================================== */

const VERSION = '__VERSION__';
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
const isSW = !isBrowser && typeof self !== 'undefined' && typeof ServiceWorkerGlobalScope !== 'undefined' && self instanceof ServiceWorkerGlobalScope;
const win = isBrowser ? window : null;
const doc = isBrowser ? document : null;
const __script = isBrowser ? doc.currentScript : null;

/** Public API object — returned by the bundle as `Orion`. */
const O = { version: VERSION };
const noop = () => {};

let __uid = 0;
/** Unique id, e.g. uid('select') -> "select-1k3f9" */
function uid(prefix = 'o') { return prefix + '-' + (++__uid).toString(36) + Math.random().toString(36).slice(2, 6); }

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isPlainObj = v => isObj(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const isFn = v => typeof v === 'function';
const isStr = v => typeof v === 'string';
const isNum = v => typeof v === 'number' && !Number.isNaN(v);
/** Anything -> array (NodeList, Set, single value, null) */
const toArr = v => v == null ? [] : Array.isArray(v) ? v : (typeof v === 'object' && (typeof v.length === 'number' || typeof v[Symbol.iterator] === 'function')) ? Array.from(v) : [v];
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round = (v, p = 0) => { const f = 10 ** p; return Math.round(v * f) / f; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nextFrame = () => new Promise(r => (isBrowser ? requestAnimationFrame(() => r()) : setTimeout(r, 16)));

function debounce(fn, ms = 200) {
  let t = null, a, th;
  const d = function (...args) { a = args; th = this; clearTimeout(t); t = setTimeout(() => { t = null; fn.apply(th, a); }, ms); };
  d.cancel = () => { clearTimeout(t); t = null; };
  d.flush = () => { if (t) { clearTimeout(t); t = null; fn.apply(th, a); } };
  return d;
}
function throttle(fn, ms = 100) {
  let last = 0, t = null, a, th;
  return function (...args) {
    const now = Date.now(); a = args; th = this;
    const rem = ms - (now - last);
    if (rem <= 0) { clearTimeout(t); t = null; last = now; fn.apply(th, a); }
    else if (!t) t = setTimeout(() => { last = Date.now(); t = null; fn.apply(th, a); }, rem);
  };
}
/** Run at most once per animation frame. */
function rafThrottle(fn) {
  let id = 0, a, th;
  const f = function (...args) { a = args; th = this; if (!id) id = requestAnimationFrame(() => { id = 0; fn.apply(th, a); }); };
  f.cancel = () => { cancelAnimationFrame(id); id = 0; };
  return f;
}

/** Deep-merge plain objects (arrays and other values are replaced). Mutates and returns target. */
function merge(target, ...sources) {
  for (const src of sources) {
    if (!isObj(src)) continue;
    for (const k of Object.keys(src)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      const v = src[k];
      if (isPlainObj(v)) target[k] = merge(isPlainObj(target[k]) ? target[k] : {}, v);
      else target[k] = v;
    }
  }
  return target;
}
const clone = v => { try { return structuredClone(v); } catch { return JSON.parse(JSON.stringify(v)); } };
function equal(a, b) {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return +a === +b;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => equal(a[k], b[k]));
}

const kebab = s => String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const camel = s => String(s).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const cap = s => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : '');
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape text for safe HTML interpolation. */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC_MAP[c]);

/** Trusted-HTML wrapper so `html` templates don't double-escape. */
class SafeHTML { constructor(s) { this.s = String(s); } toString() { return this.s; } }
/** Mark a string as trusted HTML (never pass user input). */
const raw = s => (s instanceof SafeHTML ? s : new SafeHTML(s ?? ''));
const __htmlVal = v => v == null || v === false || v === true ? '' : Array.isArray(v) ? v.map(__htmlVal).join('') : v instanceof SafeHTML ? v.s : esc(v);
/** Tagged template: interpolations are escaped unless wrapped with raw() or produced by html``. */
function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += __htmlVal(vals[i]) + strings[i + 1];
  return new SafeHTML(out);
}

/** Read a nested value: getPath(row, 'user.name') ; path may be a function(row). */
function getPath(obj, p) {
  if (obj == null || p == null) return undefined;
  if (isFn(p)) return p(obj);
  if (!isStr(p) || !p.includes('.')) return obj[p];
  let o = obj;
  for (const k of p.split('.')) { if (o == null) return undefined; o = o[k]; }
  return o;
}
function setPath(obj, p, value) {
  const keys = String(p).split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) { const k = keys[i]; if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }
  o[keys[keys.length - 1]] = value;
  return obj;
}
function parseJSON(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }

/** Marker type for props that accept any value (attribute parsed as JSON when it looks like JSON). */
const Any = 'any';
/** Convert an attribute string to a typed prop value. */
function parseAttr(v, type) {
  if (type === Boolean) return v != null && v !== 'false';
  if (v == null) return undefined;
  if (type === Number) { const n = parseFloat(v); return Number.isNaN(n) ? undefined : n; }
  if (type === Array) { const t = String(v).trim(); if (t.startsWith('[')) return parseJSON(t, []); return t ? t.split(',').map(s => s.trim()) : []; }
  if (type === Object) return parseJSON(v, {});
  if (type === Function) return isBrowser ? getPath(win, v) : undefined;
  if (type === Any) { const t = String(v).trim(); if (/^[[{]/.test(t)) return parseJSON(t, v); return v; }
  return v;
}

function formatBytes(bytes, decimals = 1) {
  if (!isNum(+bytes)) return '';
  const b = +bytes, u = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (b < 1024) return b + ' B';
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return (b / 1024 ** i).toFixed(decimals).replace(/\.0+$/, '') + ' ' + u[i];
}

/* ── Event emitter (for non-DOM classes) ─────────────────────────────── */
class Emitter {
  on(name, fn) { const m = this.__ev || (this.__ev = new Map()); if (!m.has(name)) m.set(name, new Set()); m.get(name).add(fn); return () => this.off(name, fn); }
  off(name, fn) { const m = this.__ev; if (!m) return this; if (fn) m.get(name)?.delete(fn); else if (name) m.delete(name); else m.clear(); return this; }
  once(name, fn) { const off = this.on(name, (...a) => { off(); fn.apply(this, a); }); return off; }
  emit(name, ...args) {
    const m = this.__ev; if (!m) return this;
    for (const fn of [...(m.get(name) || [])]) { try { fn.apply(this, args); } catch (e) { console.error('[Orion]', e); } }
    if (name !== '*') for (const fn of [...(m.get('*') || [])]) { try { fn.call(this, name, ...args); } catch (e) { console.error('[Orion]', e); } }
    return this;
  }
}
/** Global app event bus: Orion.on('theme', fn), Orion.emit('my-event', data) */
const bus = new Emitter();
O.on = (n, f) => bus.on(n, f);
O.off = (n, f) => bus.off(n, f);
O.once = (n, f) => bus.once(n, f);
O.emit = (n, ...a) => bus.emit(n, ...a);

/* ── HTML sanitizer (for user-supplied rich content) ─────────────────── */
const SAFE_TAGS = new Set('a abbr address article aside b bdi bdo blockquote br caption cite code col colgroup dd del details dfn div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 header hr i img ins kbd li main mark nav ol p picture pre q rp rt ruby s samp section small source span strike strong sub summary sup table tbody td tfoot th thead time tr u ul var video audio wbr font center'.split(' '));
const SAFE_ATTRS = new Set('href src srcset alt title class style width height colspan rowspan align valign target rel start reversed type id name dir lang color face size datetime cite controls poster loop muted playsinline scope headers abbr span open value checked disabled'.split(' '));
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select', 'frame', 'frameset', 'applet']);
/**
 * sanitize(html, { tags: [...extra], attrs: [...extra] }) -> safe HTML string.
 * Removes scripts, event handlers, javascript: URLs, and unknown tags (keeping their text).
 */
function sanitize(input, opts = {}) {
  if (!isBrowser) return esc(input);
  const tags = opts.tags ? new Set([...SAFE_TAGS, ...opts.tags]) : SAFE_TAGS;
  const extraAttrs = new Set(opts.attrs || []);
  const tpl = doc.createElement('template');
  tpl.innerHTML = String(input ?? '');
  const safeUrl = v => {
    const s = String(v).replace(/[\x00-\x20\x7f-\x9f]/g, '');
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) return true; // relative
    return /^(https?|mailto|tel|ftp|blob):/i.test(s) || /^data:(image\/(png|jpe?g|gif|webp|avif|bmp)|video\/|audio\/)/i.test(s);
  };
  const walk = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 1) {
        const tag = child.localName;
        if (!tags.has(tag)) {
          if (DROP_WITH_CONTENT.has(tag) && !tags.has(tag)) child.remove();
          else { walk(child); child.replaceWith(...child.childNodes); }
          continue;
        }
        for (const a of [...child.attributes]) {
          const n = a.name.toLowerCase();
          const allowed = (SAFE_ATTRS.has(n) || extraAttrs.has(n) || n.startsWith('data-') || n.startsWith('aria-') || n === 'role') && !n.startsWith('on');
          if (!allowed) { child.removeAttribute(a.name); continue; }
          if ((n === 'href' || n === 'src' || n === 'cite' || n === 'poster') && !safeUrl(a.value)) child.removeAttribute(a.name);
          else if (n === 'srcset' && /javascript:/i.test(a.value)) child.removeAttribute(a.name);
          else if (n === 'style' && /expression\s*\(|javascript:|url\s*\(\s*['"]?\s*(?!data:image|https?:|\/)/i.test(a.value)) child.removeAttribute(a.name);
        }
        if (tag === 'a' && child.getAttribute('target') === '_blank') child.setAttribute('rel', 'noopener noreferrer');
        walk(child);
      } else if (child.nodeType !== 3) child.remove();
    }
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

/* ── Fuzzy search ─────────────────────────────────────────────────────── */
/**
 * fuzzy(query, text) -> { score, ranges: [[start,end], ...] } | null
 * Multi-word queries: every word must match (any order). Substring matches score highest.
 */
function fuzzy(query, text) {
  const q = String(query ?? '').toLowerCase().trim();
  const t = String(text ?? ''), tl = t.toLowerCase();
  if (!q) return { score: 0, ranges: [] };
  const words = q.split(/\s+/);
  let score = 0; const ranges = [];
  for (const w of words) {
    const idx = tl.indexOf(w);
    if (idx >= 0) {
      const boundary = idx === 0 || /[\s\-_./,(]/.test(tl[idx - 1]);
      score += 100 + w.length * 2 + (boundary ? 30 : 0) - Math.min(idx, 50) * 0.2;
      ranges.push([idx, idx + w.length]);
      continue;
    }
    // subsequence
    let qi = 0, last = -2, s = 0; const r = [];
    for (let i = 0; i < tl.length && qi < w.length; i++) {
      if (tl[i] !== w[qi]) continue;
      const consecutive = i === last + 1;
      s += consecutive ? 6 : 1;
      if (i === 0 || /[\s\-_./]/.test(tl[i - 1])) s += 4;
      if (consecutive && r.length) r[r.length - 1][1] = i + 1; else r.push([i, i + 1]);
      last = i; qi++;
    }
    if (qi < w.length) return null;
    score += s; ranges.push(...r);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const rg of ranges) { const l = merged[merged.length - 1]; if (l && rg[0] <= l[1]) l[1] = Math.max(l[1], rg[1]); else merged.push([...rg]); }
  return { score, ranges: merged };
}
/** highlight(text, queryOrRanges) -> escaped HTML string with <mark> around matches */
function highlight(text, q) {
  const t = String(text ?? '');
  const ranges = Array.isArray(q) ? q : (fuzzy(q, t)?.ranges || []);
  if (!ranges.length) return esc(t);
  let out = '', pos = 0;
  for (const [a, b] of ranges) { out += esc(t.slice(pos, a)) + '<mark class="o-mark">' + esc(t.slice(a, b)) + '</mark>'; pos = b; }
  return out + esc(t.slice(pos));
}
/** Filter + rank items: search(items, query, item => item.label) */
function fuzzySearch(items, query, key = x => x, limit = Infinity) {
  if (!String(query ?? '').trim()) return items.slice(0, limit);
  const out = [];
  for (const it of items) { const m = fuzzy(query, isFn(key) ? key(it) : getPath(it, key)); if (m) out.push({ it, s: m.score }); }
  return out.sort((a, b) => b.s - a.s).slice(0, limit).map(x => x.it);
}

/* ── Safe storage helpers ─────────────────────────────────────────────── */
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : parseJSON(v, v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

/* ── Misc browser helpers ─────────────────────────────────────────────── */
/** download(data, filename, mime) — save a Blob / string / ArrayBuffer / typed array as a file. */
function download(data, filename = 'download', mime = 'application/octet-stream') {
  if (!isBrowser) return;
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: mime }));
  downloadURL(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
/** downloadURL(url, filename) — trigger a download of an existing URL (same-origin, blob: or data:). */
function downloadURL(url, filename = '') {
  const a = doc.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
  doc.body.appendChild(a); a.click(); a.remove();
}
const __scripts = new Map();
/** loadScript(src, attrs) -> Promise (cached). Only used by optional third-party adapters. */
function loadScript(src, attrs = {}) {
  if (!isBrowser) return Promise.reject(new Error('no DOM'));
  if (__scripts.has(src)) return __scripts.get(src);
  const p = new Promise((resolve, reject) => {
    const s = doc.createElement('script');
    s.src = src; s.async = true;
    for (const k in attrs) s.setAttribute(k, attrs[k]);
    if (O.config?.nonce) s.nonce = O.config.nonce;
    s.onload = () => resolve(s); s.onerror = () => { __scripts.delete(src); reject(new Error('Failed to load ' + src)); };
    doc.head.appendChild(s);
  });
  __scripts.set(src, p);
  return p;
}

O.util = {
  uid, noop, isObj, isPlainObj, isFn, isStr, isNum, toArr, clamp, round, sleep, nextFrame, debounce, throttle, rafThrottle,
  merge, clone, equal, kebab, camel, cap, esc, raw, html, getPath, setPath, parseJSON, parseAttr, formatBytes, sanitize,
  fuzzy, highlight, fuzzySearch, download, downloadURL, loadScript, Emitter,
};
O.Emitter = Emitter;
O.sanitize = sanitize;
O.download = download;
O.downloadURL = downloadURL;
