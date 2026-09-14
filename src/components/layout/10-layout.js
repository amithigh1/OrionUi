/* Layout: responsive app shell.
 *   <div class="o-app" data-o-app="main">               (data-o-app value = persistence id; auto-added to every .o-app)
 *     <a class="o-skip-link" href="#main">Skip to content</a>
 *     <aside class="o-app-sidebar o-sidebar" data-o-sidebar>…</aside>
 *     <header class="o-app-header"><button class="o-app-toggle" data-o-toggle="sidebar" aria-label="Toggle sidebar">…</button>…</header>
 *     <main class="o-app-main" id="main"><div class="o-app-content">…</div></main>
 *     <footer class="o-app-footer">…</footer>
 *   </div>
 * Modes (from CSS --o-app-mode): desktop (full / collapsed mini), tablet (mini rail, toggle = overlay), mobile (off-canvas drawer).
 * Actions: data-o-toggle="sidebar" [data-o-target="#app"], data-o-dismiss="sidebar".
 * API: Orion.layout.toggleSidebar(app?) / collapse(app?) / expand(app?) / openMobile(app?) / closeMobile(app?)
 *      .mode(app?) / .isCollapsed(app?) / .isOpen(app?) / .setPageTitle(title, breadcrumbs) / .titleTemplate / .sync()
 * Events (on .o-app): o-sidebar-toggle { state: 'collapsed'|'expanded'|'open'|'closed', mode }. Document: o-page-title.
 */
i18n.add('en', { layout: { skip: 'Skip to main content', toggleSidebar: 'Toggle sidebar', home: 'Home' } });

const __st = new WeakMap();
const stateOf = app => { let s = __st.get(app); if (!s) __st.set(app, (s = {})); return s; };
/** Resolve an app from an element / selector / nothing (first .o-app). */
function appOf(x) {
  const el = isStr(x) ? $(x) : x;
  if (el && el.nodeType === 1) return el.closest('.o-app') || el.querySelector?.('.o-app') || null;
  return isBrowser ? $('.o-app') : null;
}
const sidebarIn = app => app && (app.querySelector(':scope > .o-app-sidebar') || app.querySelector('.o-app-sidebar'));
const backdropIn = app => app && app.querySelector(':scope > .o-app-backdrop');
const storeKey = app => `orion:layout:${app.getAttribute('data-o-app') || app.id || 'app'}:collapsed`;
/** 'desktop' | 'tablet' | 'mobile' (horizontal layouts always use the drawer => 'mobile') */
function modeOf(app) {
  if (!app) return 'desktop';
  if (app.classList.contains('o-app-horizontal')) return 'mobile';
  const m = getComputedStyle(app).getPropertyValue('--o-app-mode').trim();
  return m === 'mobile' || m === 'tablet' ? m : 'desktop';
}

function paint(app) {
  const m = modeOf(app), open = app.classList.contains('is-mobile-open');
  app.classList.toggle('is-rail', m === 'tablet');
  app.classList.toggle('is-mini', (m === 'desktop' && app.classList.contains('is-collapsed')) || (m === 'tablet' && !open));
  const expanded = m === 'desktop' ? !app.classList.contains('is-collapsed') : open;
  $$('[data-o-toggle="sidebar"]').forEach(b => { if (appOf(targetOf(b) || b) === app) b.setAttribute('aria-expanded', String(expanded)); });
}
function fire(app, state) {
  emit(app, 'o-sidebar-toggle', { state, mode: modeOf(app), collapsed: app.classList.contains('is-collapsed'), open: app.classList.contains('is-mobile-open') });
}

const layout = {
  /** First .o-app on the page (or the one containing el). */
  app: el => appOf(el),
  mode: app => modeOf(appOf(app)),
  isCollapsed: app => !!appOf(app)?.classList.contains('is-collapsed'),
  isOpen: app => !!appOf(app)?.classList.contains('is-mobile-open'),
  /** Desktop: collapse/expand. Tablet & mobile: open/close the drawer. */
  toggleSidebar(app, trigger) {
    app = appOf(app); if (!app) return;
    if (modeOf(app) === 'desktop') return app.classList.contains('is-collapsed') ? layout.expand(app) : layout.collapse(app);
    return app.classList.contains('is-mobile-open') ? layout.closeMobile(app) : layout.openMobile(app, trigger);
  },
  collapse(app, { persist = true } = {}) {
    app = appOf(app); if (!app || app.classList.contains('is-collapsed')) return;
    app.classList.add('is-collapsed'); paint(app);
    if (persist) ls.set(storeKey(app), true);
    fire(app, 'collapsed');
  },
  expand(app, { persist = true } = {}) {
    app = appOf(app); if (!app || !app.classList.contains('is-collapsed')) return;
    app.classList.remove('is-collapsed'); paint(app);
    if (persist) ls.set(storeKey(app), false);
    fire(app, 'expanded');
  },
  /** Open the off-canvas drawer (mobile) or the overlay sidebar (tablet rail). */
  openMobile(app, trigger) {
    app = appOf(app); const sb = sidebarIn(app);
    if (!app || !sb || app.classList.contains('is-mobile-open')) return;
    const st = stateOf(app), m = modeOf(app), bd = backdropIn(app);
    app.classList.add('is-mobile-open'); paint(app);
    st.ov = overlays.open({
      el: sb, owner: trigger && trigger.nodeType === 1 ? trigger : null, trap: m === 'mobile', lockScroll: m === 'mobile',
      onClose: () => {
        st.ov = null; app.classList.remove('is-mobile-open');
        sb.style.zIndex = ''; if (bd) bd.style.zIndex = '';
        paint(app); fire(app, 'closed');
      },
    });
    if (bd) bd.style.zIndex = String(st.ov.entry.z - 1);
    if (m === 'mobile') {
      const target = sb.querySelector('.o-menu-link[aria-current="page"]') || focusables(sb)[0];
      setTimeout(() => (target || sb).focus({ preventScroll: true }), 30);
    }
    fire(app, 'open');
  },
  closeMobile(app) { app = appOf(app); if (app) stateOf(app).ov?.close('api'); },
  /** Re-run active-link detection (after a SPA route change that did not fire popstate). */
  sync() { O.sidebar?.sync?.(); emit(doc, 'o-location', { href: location.href }); },
  /** Title template: '%s · Acme'. Default: derived from the initial document title ("Page — Brand"). */
  titleTemplate: null,
  /**
   * setPageTitle('Users', [{ label: 'Home', href: '/' }, { label: 'Users' }])
   * Updates document.title, [data-o-page-title] elements, [data-o-page-breadcrumb] (o-breadcrumb or any container)
   * and announces the new page to screen readers.
   */
  setPageTitle(title, crumbs) {
    title = String(title ?? '');
    doc.title = (layout.titleTemplate || __initialTemplate()).replace('%s', title).replace(/^\s*[—|·-]\s*|\s*[—|·-]\s*$/g, '') || title;
    $$('[data-o-page-title]').forEach(el => { el.textContent = title; });
    if (Array.isArray(crumbs)) $$('[data-o-page-breadcrumb]').forEach(el => {
      if (el.localName === 'o-breadcrumb') el.items = crumbs;
      else el.replaceChildren(__crumbs(crumbs));
    });
    announce(title);
    emit(doc, 'o-page-title', { title, breadcrumbs: crumbs || null });
    bus.emit('page-title', { title, breadcrumbs: crumbs || null });
  },
};
let __tpl = null;
function __initialTemplate() {
  if (__tpl) return __tpl;
  const m = String(doc.title).match(/\s([—|·–-])\s(.+)$/);
  return (__tpl = m ? `%s ${m[1]} ${m[2]}` : '%s');
}
function __crumbs(items) {
  const ol = h('ol', { class: 'o-breadcrumb' });
  items.forEach((it, i) => {
    const last = i === items.length - 1;
    const li = h('li', { class: 'o-breadcrumb-item', 'aria-current': last ? 'page' : null });
    li.append(it.href && !last ? h('a', { href: it.href }, it.label) : h('span', null, it.label));
    ol.append(li);
  });
  return ol;
}

/* ── swipe to open/close the mobile drawer ─────────────────────────── */
function swipe(app) {
  let s = null;
  const onStart = e => {
    if (e.touches.length !== 1 || modeOf(app) !== 'mobile') return;
    const sb = sidebarIn(app); if (!sb) return;
    const tt = e.touches[0], open = app.classList.contains('is-mobile-open');
    const dir = (isRTL(app) !== app.classList.contains('o-app-sidebar-end')) ? -1 : 1;
    const vw = doc.documentElement.clientWidth, edge = 24;
    const fromEdge = dir === 1 ? tt.clientX < edge : tt.clientX > vw - edge;
    if (!open && !fromEdge) return;
    if (open && !sb.contains(e.target) && !e.target.closest?.('.o-app-backdrop')) return;
    s = { x: tt.clientX, y: tt.clientY, open, sb, dir, w: sb.offsetWidth || 280, moved: false, dx: 0, t: Date.now() };
  };
  const onMove = e => {
    if (!s) return;
    const tt = e.touches[0], dx = (tt.clientX - s.x) * s.dir, dy = tt.clientY - s.y;
    if (!s.moved) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 6) { s = null; return; }
      if (Math.abs(dx) < 8) return;
      s.moved = true; app.classList.add('is-swiping');
    }
    s.dx = dx;
    const off = s.open ? clamp(dx, -s.w, 0) : clamp(dx - s.w, -s.w, 0);
    s.sb.style.transform = `translateX(${off * s.dir}px)`;
    const bd = backdropIn(app); if (bd) bd.style.opacity = String(1 + off / s.w);
  };
  const onEnd = () => {
    if (!s) return;
    const { moved, dx, open, w, t: t0 } = s, fast = Date.now() - t0 < 250 && Math.abs(dx) > 30;
    if (moved) {
      s.sb.style.transform = ''; const bd = backdropIn(app); if (bd) bd.style.opacity = '';
      app.classList.remove('is-swiping');
      if (!open && (dx > w * 0.35 || (fast && dx > 0))) layout.openMobile(app);
      else if (open && (-dx > w * 0.35 || (fast && dx < 0))) layout.closeMobile(app);
    }
    s = null;
  };
  const offs = [on(doc, 'touchstart', onStart, { passive: true }), on(doc, 'touchmove', onMove, { passive: true }), on(doc, 'touchend touchcancel', onEnd)];
  return () => offs.forEach(f => f());
}

/* ── behavior: wires one app shell (restore state, backdrop, header shadow, resize, swipe) ── */
behavior('data-o-app', app => {
  const st = stateOf(app);
  app.classList.add('is-init');
  const saved = ls.get(storeKey(app));
  if (saved === true) app.classList.add('is-collapsed'); else if (saved === false) app.classList.remove('is-collapsed');
  let bd = backdropIn(app); const created = !bd;
  if (!bd) { bd = h('div', { class: 'o-app-backdrop', 'data-o-dismiss': 'sidebar', 'aria-hidden': 'true' }); app.append(bd); }
  const main = app.querySelector('.o-app-main');
  if (main && !main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  const header = app.querySelector('.o-app-header');
  const onScroll = rafThrottle(() => {
    const y = Math.max(win.scrollY || 0, main && main.scrollHeight > main.clientHeight ? main.scrollTop : 0);
    header?.classList.toggle('is-scrolled', y > 2);
  });
  const onResize = () => {
    const m = modeOf(app);
    if (m === st.mode) return;
    st.mode = m;
    if (app.classList.contains('is-mobile-open')) layout.closeMobile(app);
    paint(app);
  };
  st.mode = modeOf(app); paint(app); onScroll();
  const offs = [on(win, 'scroll', onScroll, { passive: true, capture: true }), on(win, 'resize', onResize), observeResize(app, onResize), swipe(app)];
  requestAnimationFrame(() => requestAnimationFrame(() => app.classList.remove('is-init')));
  return () => { offs.forEach(f => f()); onScroll.cancel(); st.ov?.close('api'); if (created) bd.remove(); };
});

action('sidebar', btn => layout.toggleSidebar(appOf(targetOf(btn) || btn), btn));
action('dismiss:sidebar', btn => layout.closeMobile(appOf(btn)));

if (isBrowser) ready(() => {
  // every .o-app gets the behavior (frameworks rendering later can add data-o-app themselves)
  $$('.o-app:not([data-o-app])').forEach(a => a.setAttribute('data-o-app', ''));
  // navigating from the drawer closes it
  on(doc, 'click', '.o-app-sidebar a[href]', (e, a) => {
    const app = appOf(a);
    if (!app || !app.classList.contains('is-mobile-open') || a.classList.contains('o-menu-toggle') || a.getAttribute('href') === '#') return;
    setTimeout(() => layout.closeMobile(app), 0); // after routers handled the click
  });
});

O.layout = layout;
