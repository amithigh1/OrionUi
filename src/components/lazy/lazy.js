/* Lazy loading behaviors (one shared IntersectionObserver per rootMargin).
 *   <img data-o-lazy data-src="a.jpg" data-srcset="a-800.jpg 800w, a-1600.jpg 1600w" data-sizes="auto" width="800" height="533" alt="">
 *   <picture><source type="image/webp" data-srcset="a.webp"><img data-o-lazy data-src="a.jpg" alt=""></picture>
 *   <img data-o-lazy src="a.jpg">                       real src: native loading="lazy" + fade-in + error fallback
 *   <iframe data-o-lazy data-src="map.html"></iframe>   native loading="lazy" when supported
 *   <video data-o-lazy data-src="v.mp4" data-poster="p.jpg">   <div data-o-lazy-bg="hero.jpg">…</div>
 *   Options: data-o-lazy-placeholder="tiny.jpg | data:… | #8fa3c7 | none" (blur-up / color), data-o-lazy-error="fallback.svg",
 *            data-o-lazy-margin="400px 0px" (rootMargin)
 *   <section data-o-lazy-render><template>…heavy markup…</template></section>
 *     stamps the template once it scrolls into view and fires o-visible; data-o-lazy-render="repeat" fires o-visible / o-hidden each time.
 * API: Orion.lazy.load(el) · Orion.lazy.observe(root) -> cleanup (e.g. inside shadow roots)
 *      Orion.lazy.config({ rootMargin: '200px 0px', errorImage, fade: true, loader: (url, el) => Promise<url> })
 * Events (on the element): o-lazy-load, o-lazy-error, o-visible { entry }, o-hidden { entry }
 */
const LZ = { rootMargin: '200px 0px', errorImage: '', fade: true, loader: null };
const LZ_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const lzObs = new Map();
const lzState = new WeakMap();

function lzWatch(el, margin, fn) {
  if (!isBrowser || !win.IntersectionObserver) { fn(true, null); return noop; }
  let rec = lzObs.get(margin);
  if (!rec) {
    const cbs = new Map();
    rec = { cbs, io: new IntersectionObserver(es => es.forEach(e => cbs.get(e.target)?.(e.isIntersecting, e)), { rootMargin: margin }) };
    lzObs.set(margin, rec);
  }
  rec.cbs.set(el, fn);
  rec.io.observe(el);
  return () => { rec.io.unobserve(el); rec.cbs.delete(el); };
}
const lzMargin = el => el.getAttribute('data-o-lazy-margin') || LZ.rootMargin;
const lzURL = (url, el) => (LZ.loader ? Promise.resolve(LZ.loader(url, el)) : Promise.resolve(url));

function lzPlaceholder(el) {
  const ph = el.getAttribute('data-o-lazy-placeholder');
  if (!ph || ph === 'none') return false;
  if (/^(#|rgb|hsl|var\()/i.test(ph)) { el.style.backgroundColor = ph; return 'color'; }
  if (el.localName === 'img') { el.src = ph; el.classList.add('is-placeholder'); return 'image'; }
  el.style.backgroundImage = `url("${ph.replace(/"/g, '%22')}")`;
  return 'image';
}
function lzFail(el) {
  const f = el.getAttribute('data-o-lazy-error') || LZ.errorImage;
  el.classList.remove('is-lazy', 'is-placeholder');
  if (el.localName === 'img' && f && !el.__lzFallback) { el.__lzFallback = true; el.src = f; el.classList.add('is-fallback'); }
  else { el.classList.add('is-error'); if (el.localName === 'img') { el.removeAttribute('srcset'); el.src = LZ_GIF; } }
  emit(el, 'o-lazy-error', {});
}
function lzImg(img) {
  if (img.__lzDone) return;
  img.__lzDone = true;
  const d = img.dataset, pic = img.parentElement && img.parentElement.localName === 'picture' ? img.parentElement : null;
  const placeholder = img.classList.contains('is-placeholder');
  const ok = () => {
    img.classList.remove('is-lazy', 'is-placeholder');
    if (img.__lzFallback) return;
    if (!placeholder && LZ.fade) img.classList.add('is-fade');
    img.classList.add('is-loaded');
    emit(img, 'o-lazy-load', {});
  };
  const ph = img.currentSrc || img.getAttribute('src') || '';
  const offs = [on(img, 'load', () => { if (!img.__lzSet || (img.currentSrc || img.src) === ph) return; offs.forEach(f => f()); ok(); }), on(img, 'error', () => { if (!img.__lzSet) return; offs.forEach(f => f()); lzFail(img); })];
  if (d.sizes) img.sizes = d.sizes === 'auto' ? Math.max(1, Math.round(img.getBoundingClientRect().width || img.offsetWidth || 1)) + 'px' : d.sizes;
  pic?.querySelectorAll('source[data-srcset]').forEach(s => { if (s.dataset.sizes) s.sizes = s.dataset.sizes === 'auto' ? img.sizes : s.dataset.sizes; s.srcset = s.dataset.srcset; s.removeAttribute('data-srcset'); });
  const src = d.src, srcset = d.srcset;
  img.removeAttribute('data-src'); img.removeAttribute('data-srcset');
  Promise.all([src ? lzURL(src, img) : null, srcset ? lzURL(srcset, img) : null]).then(([u, us]) => {
    if (!img.isConnected && !img.__lzForce) return;
    img.__lzSet = true;
    if (us) img.srcset = us;
    if (u) img.src = u;
    else if (!us && pic) img.src = img.currentSrc || img.src;
  }, () => lzFail(img));
}
/** Load an element now (img, picture, iframe, video/audio, data-o-lazy-bg). */
function lzLoad(el) {
  el = $(el);
  if (!el) return;
  const tag = el.localName;
  if (tag === 'picture') { const i = el.querySelector('img'); if (i) lzLoad(i); return; }
  if (tag === 'img') { el.__lzForce = true; lzImg(el); }
  else if (tag === 'iframe') { if (el.dataset.src) { el.src = el.dataset.src; el.removeAttribute('data-src'); } }
  else if (tag === 'video' || tag === 'audio') {
    let changed = false;
    if (el.dataset.poster) { el.poster = el.dataset.poster; el.removeAttribute('data-poster'); }
    el.querySelectorAll('source[data-src]').forEach(s => { s.src = s.dataset.src; s.removeAttribute('data-src'); changed = true; });
    if (el.dataset.src) { el.src = el.dataset.src; el.removeAttribute('data-src'); } else if (changed) el.load();
  }
  if (el.hasAttribute('data-o-lazy-bg')) lzBg(el);
  lzState.get(el)?.off?.();
}
function lzBg(el) {
  const url = el.getAttribute('data-o-lazy-bg');
  if (!url || el.__lzBg === url) return;
  el.__lzBg = url;
  lzURL(url, el).then(u => {
    const im = new Image();
    im.onload = () => { el.style.backgroundImage = `url("${String(u).replace(/"/g, '%22')}")`; el.classList.add('is-loaded'); emit(el, 'o-lazy-load', {}); };
    im.onerror = () => { el.classList.add('is-error'); emit(el, 'o-lazy-error', {}); };
    im.src = u;
  });
}

function lzInit(el) {
  if (lzState.has(el)) return lzState.get(el).cleanup;
  const st = {}, tag = el.localName;
  el.classList.add('o-lazy');
  const done = () => { st.off?.(); st.off = null; };
  if (tag === 'img') {
    const pic = el.parentElement && el.parentElement.localName === 'picture' ? el.parentElement : null;
    const pending = el.dataset.src || el.dataset.srcset || (pic && pic.querySelector('source[data-srcset]'));
    if (!pending) {
      if (!el.hasAttribute('loading')) el.loading = 'lazy';
      if (!(el.complete && el.naturalWidth)) {
        el.classList.add('is-lazy');
        const offs = [on(el, 'load', () => { offs.forEach(f => f()); el.classList.remove('is-lazy'); if (LZ.fade) el.classList.add('is-fade'); el.classList.add('is-loaded'); emit(el, 'o-lazy-load', {}); }),
          on(el, 'error', () => { offs.forEach(f => f()); lzFail(el); })];
        st.off = () => offs.forEach(f => f());
      } else el.classList.add('is-loaded');
    } else {
      const ph = lzPlaceholder(el);
      if (!el.getAttribute('src')) el.src = LZ_GIF;
      if (!ph) el.classList.add('is-lazy');
      st.off = lzWatch(el, lzMargin(el), v => { if (v) { done(); lzImg(el); } });
    }
  } else if (tag === 'iframe' && el.dataset.src && 'loading' in HTMLIFrameElement.prototype && !el.hasAttribute('data-o-lazy-margin')) {
    el.loading = 'lazy'; el.src = el.dataset.src; el.removeAttribute('data-src');
  } else {
    lzPlaceholder(el);
    st.off = lzWatch(el, lzMargin(el), v => { if (v) { done(); lzLoad(el); } });
  }
  st.cleanup = () => { done(); lzState.delete(el); };
  lzState.set(el, st);
  return st.cleanup;
}
function lzInitBg(el) {
  el.classList.add('o-lazy-bg');
  lzPlaceholder(el);
  const off = lzWatch(el, lzMargin(el), v => { if (v) { off(); lzBg(el); } });
  return off;
}
function lzInitRender(el) {
  const repeat = el.getAttribute('data-o-lazy-render') === 'repeat';
  el.classList.add('o-lazy-render');
  const off = lzWatch(el, lzMargin(el), (vis, entry) => {
    if (vis) {
      if (!el.__lzStamped) {
        el.__lzStamped = true;
        el.querySelectorAll(':scope > template').forEach(tpl => el.append(tpl.content.cloneNode(true)));
      }
      const first = !el.hasAttribute('data-o-visible');
      el.setAttribute('data-o-visible', '');
      if (first || repeat) emit(el, 'o-visible', { entry });
      if (!repeat) off();
    } else if (repeat && el.hasAttribute('data-o-visible')) { el.removeAttribute('data-o-visible'); emit(el, 'o-hidden', { entry }); }
  });
  return off;
}

behavior('data-o-lazy', el => lzInit(el));
behavior('data-o-lazy-bg', el => lzInitBg(el));
behavior('data-o-lazy-render', el => lzInitRender(el));

O.lazy = {
  load: lzLoad,
  /** Initialise lazy elements inside a root the behavior scanner cannot see (shadow roots, detached trees). Returns cleanup. */
  observe(root = isBrowser ? doc.body : null) {
    if (!root) return noop;
    const offs = [];
    root.querySelectorAll('[data-o-lazy]').forEach(el => offs.push(lzInit(el)));
    root.querySelectorAll('[data-o-lazy-bg]').forEach(el => offs.push(lzInitBg(el)));
    root.querySelectorAll('[data-o-lazy-render]').forEach(el => offs.push(lzInitRender(el)));
    return () => offs.forEach(f => f && f());
  },
  config(opts = {}) { Object.assign(LZ, opts); return { ...LZ }; },
  get rootMargin() { return LZ.rootMargin; },
  set rootMargin(v) { LZ.rootMargin = v; },
};
