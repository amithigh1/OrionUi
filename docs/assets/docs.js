/* Orion Admin documentation shell (docs only — not part of the library).
 *
 * Page authoring:
 *   <main class="docs-main"> ... </main>
 *   <div class="docs-demo" data-preview="center bg"><template> live demo HTML (+ <script>) </template></div>
 *   <pre class="docs-code-block" data-lang="js|html|css"> escaped code </pre>
 *   <table class="docs-api"> ... </table>
 * Helpers for demos: docs.log(target, msg), docs.people(n), docs.fakeServer(rows), docs.series(n), docs.rand(seed)
 */
(function () {
  'use strict';
  const O = window.Orion;
  const script = document.currentScript || document.querySelector('script[src*="docs.js"]');
  const ROOT = new URL('../', script.src).href;           // .../docs/
  const here = location.href.split('#')[0].split('?')[0];
  const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ── syntax highlighting ─────────────────────────────────────────── */
  const JS_KW = /^(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|this|super|null|undefined|true|false|static|get|set|yield|delete|void)$/;
  function hlJS(src) {
    const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*")|(\b\d[\d_.]*(?:e[+-]?\d+)?\b)|([A-Za-z_$][\w$]*)(\s*\()?/g;
    let out = '', last = 0, m;
    while ((m = re.exec(src))) {
      out += escH(src.slice(last, m.index)); last = re.lastIndex;
      if (m[1]) out += `<span class="tk-com">${escH(m[1])}</span>`;
      else if (m[2]) out += `<span class="tk-str">${escH(m[2])}</span>`;
      else if (m[3]) out += `<span class="tk-num">${escH(m[3])}</span>`;
      else if (m[4]) {
        if (JS_KW.test(m[4])) out += `<span class="tk-kw">${m[4]}</span>` + escH(m[5] || '');
        else if (m[5]) out += `<span class="tk-fn">${m[4]}</span>` + escH(m[5]);
        else out += escH(m[4]);
      }
    }
    return out + escH(src.slice(last));
  }
  function hlCSS(src) {
    return src.split(/(\/\*[\s\S]*?\*\/)/).map((part, i) => i % 2 ? `<span class="tk-com">${escH(part)}</span>`
      : escH(part).replace(/([\w-]+)(\s*:\s*)([^;{}\n]+)/g, '<span class="tk-attr">$1</span>$2<span class="tk-str">$3</span>')).join('');
  }
  function hlHTML(src) {
    let out = '', last = 0, m;
    const re = /(<!--[\s\S]*?-->)|<(script|style)(\b[^>]*)>([\s\S]*?)<\/\2>|(<\/?)([\w:-]+)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?>)/gi;
    const attrs = a => escH(a).replace(/([^\s=]+)(?:(=)(&quot;[^&]*?&quot;|"[^"]*"|'[^']*'|[^\s]+))?/g, (x, n, eq, v) => `<span class="tk-attr">${n}</span>${eq ? '=' + `<span class="tk-str">${v}</span>` : ''}`);
    while ((m = re.exec(src))) {
      out += escH(src.slice(last, m.index)); last = re.lastIndex;
      if (m[1]) out += `<span class="tk-com">${escH(m[1])}</span>`;
      else if (m[2]) {
        const tag = m[2];
        out += `&lt;<span class="tk-tag">${tag}</span>${attrs(m[3])}&gt;` + (tag.toLowerCase() === 'script' ? hlJS(m[4]) : hlCSS(m[4])) + `&lt;/<span class="tk-tag">${tag}</span>&gt;`;
      } else out += `${escH(m[5])}<span class="tk-tag">${m[6]}</span>${attrs(m[7])}${escH(m[8])}`;
    }
    return out + escH(src.slice(last));
  }
  const highlight = (code, lang) => (lang === 'js' || lang === 'ts' || lang === 'json' ? hlJS(code) : lang === 'css' ? hlCSS(code) : hlHTML(code));
  function dedent(s) {
    s = s.replace(/^\n+|\s+$/g, '');
    const lines = s.split('\n');
    const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^\s*/)[0].length));
    return lines.map(l => l.slice(ind)).join('\n');
  }
  const copyBtn = getText => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'o-btn o-btn-ghost o-btn-sm docs-copy';
    b.innerHTML = String(O.icon('copy')) + '<span>Copy</span>';
    b.onclick = async () => {
      try { await navigator.clipboard.writeText(getText()); } catch { const ta = document.createElement('textarea'); ta.value = getText(); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
      b.querySelector('span').textContent = 'Copied!'; setTimeout(() => (b.querySelector('span').textContent = 'Copy'), 1400);
    };
    return b;
  };
  function codeBlock(code, lang) {
    const wrap = document.createElement('div'); wrap.className = 'docs-code';
    const pre = document.createElement('pre'); pre.innerHTML = `<code>${highlight(code, lang)}</code>`;
    wrap.append(pre, copyBtn(() => code));
    return wrap;
  }

  /* ── demos ───────────────────────────────────────────────────────── */
  function initDemos(root) {
    root.querySelectorAll('.docs-demo').forEach(demo => {
      const tpl = demo.querySelector(':scope > template');
      if (!tpl || demo.__docs) return;
      demo.__docs = true;
      const code = dedent(tpl.innerHTML);
      const preview = document.createElement('div');
      preview.className = 'docs-preview ' + (demo.dataset.preview || '').split(/\s+/).filter(Boolean).map(c => 'is-' + c).join(' ');
      demo.insertBefore(preview, tpl);
      // Append the fragment child by child, not in one append(): custom-element reactions for an appended fragment
      // only flush when append() returns, while a <script> inside the same fragment executes during the insertion —
      // so a demo script calling a method on the element right above it ran before that element's setup(). One child
      // per append() gives parsed-page order: each element is upgraded and set up before the script that follows it.
      const frag = document.importNode(tpl.content, true);
      while (frag.firstChild) preview.append(frag.firstChild); // scripts still run on insertion, in document order
      if (demo.dataset.code === 'none') return;
      const bar = document.createElement('div'); bar.className = 'docs-demo-bar';
      const toggle = document.createElement('button');
      toggle.type = 'button'; toggle.className = 'o-btn o-btn-ghost o-btn-sm';
      toggle.innerHTML = String(O.icon('chevron-down')) + '<span>Code</span>';
      const cb = codeBlock(code, 'html');
      cb.hidden = !demo.hasAttribute('data-open');
      toggle.setAttribute('aria-expanded', String(!cb.hidden));
      toggle.onclick = () => { cb.hidden = !cb.hidden; toggle.setAttribute('aria-expanded', String(!cb.hidden)); };
      bar.append(toggle);
      demo.append(bar, cb);
    });
    root.querySelectorAll('pre.docs-code-block').forEach(pre => {
      if (pre.__docs) return; pre.__docs = true;
      const code = dedent(pre.textContent);
      const wrap = document.createElement('div'); wrap.className = 'docs-code-standalone';
      if (pre.id) wrap.id = pre.id;
      if (pre.hidden) wrap.hidden = true;
      wrap.append(codeBlock(code, pre.dataset.lang || 'html'));
      pre.replaceWith(wrap);
    });
    root.querySelectorAll('table.docs-api').forEach(t => {
      if (t.parentElement.classList.contains('docs-api-wrap')) return;
      const w = document.createElement('div'); w.className = 'docs-api-wrap'; t.replaceWith(w); w.append(t);
    });
  }

  /* ── shell ───────────────────────────────────────────────────────── */
  function buildShell() {
    const main = document.querySelector('main.docs-main');
    if (!main) return;
    document.body.classList.add('docs');
    const nav = window.DOCS_NAV || [];
    const header = document.createElement('header');
    header.className = 'docs-header';
    header.innerHTML = `
      <button class="o-btn o-btn-ghost o-btn-icon docs-menu-btn" aria-label="Menu">${O.icon('menu')}</button>
      <a class="docs-brand" href="${ROOT}index.html"><span class="docs-logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></svg></span>Orion Admin <span class="docs-version">v${O.version}</span></a>
      <label class="docs-search">
        <span class="o-sr-only">Search docs</span>
        ${O.icon('search')}
        <input class="o-input o-input-sm" type="search" placeholder="Search components…" autocomplete="off" aria-label="Search components">
        <button type="button" class="docs-search-clear" title="Clear search" aria-label="Clear search" hidden>×</button>
      </label>
      <div class="docs-tools">
        <select class="o-select o-input-sm docs-lang" aria-label="Language" style="width:auto"></select>
        <button class="o-btn o-btn-ghost o-btn-icon o-btn-sm docs-rtl" title="Toggle RTL" aria-label="Toggle right-to-left">RTL</button>
        <button class="o-btn o-btn-ghost o-btn-icon o-btn-sm docs-theme" title="Theme" aria-label="Toggle theme"></button>
        <a class="o-btn o-btn-ghost o-btn-sm" href="${ROOT}../templates/index.html">Templates</a>
        <a class="o-btn o-btn-ghost o-btn-sm" href="https://github.com/amithigh1/OrionUi" target="_blank" rel="noopener">GitHub ↗</a>
      </div>`;
    const layout = document.createElement('div'); layout.className = 'docs-layout';
    const sidebar = document.createElement('aside'); sidebar.className = 'docs-sidebar'; sidebar.setAttribute('aria-label', 'Documentation');
    const flat = [];

    // Total component / item count
    const totalCount = nav.reduce((acc, sec) => acc + (sec.pages ? sec.pages.length : 0), 0);

    // Active section detection
    let activeSectionName = null;
    nav.forEach(sec => {
      if (sec.pages.some(p => (ROOT + p.href) === here)) {
        activeSectionName = sec.section;
      }
    });

    // Saved accordion states from localStorage
    let savedState = {};
    try {
      savedState = JSON.parse(localStorage.getItem('orion:docs:nav-open') || '{}');
    } catch {}

    sidebar.innerHTML = `
      <div class="docs-sidebar-header">
        <div class="docs-sidebar-search">
          <span class="docs-sidebar-search-icon">${O.icon('search')}</span>
          <input class="o-input o-input-sm docs-nav-search-input" type="search" placeholder="Search components…" autocomplete="off" aria-label="Search components">
          <kbd class="docs-search-kbd">/</kbd>
          <button type="button" class="docs-nav-search-clear" title="Clear search" aria-label="Clear search" hidden>×</button>
        </div>
        <div class="docs-sidebar-toolbar">
          <span class="docs-sidebar-count">${totalCount} items</span>
          <button type="button" class="docs-accordion-toggle" title="Expand or collapse all sections">Collapse all</button>
        </div>
      </div>
      <nav class="docs-sidebar-nav" aria-label="Sections">
        ${nav.map(sec => {
          const hasActive = sec.section === activeSectionName;
          let isOpen;
          if (hasActive) {
            isOpen = true;
          } else if (savedState[sec.section] != null) {
            isOpen = !!savedState[sec.section];
          } else {
            isOpen = (sec.section === 'Getting Started' || sec.section === 'Foundation');
          }

          return `
            <details class="docs-nav-section${hasActive ? ' has-active' : ''}" data-section="${escH(sec.section)}" ${isOpen ? 'open' : ''}>
              <summary class="docs-nav-title">
                <span class="docs-nav-title-text">${escH(sec.section)}</span>
                <span class="docs-nav-count">${sec.pages.length}</span>
                <span class="docs-nav-chevron">${O.icon('chevron-right')}</span>
              </summary>
              <div class="docs-nav-body">
                ${sec.pages.map(p => {
                  const href = ROOT + p.href;
                  flat.push({ ...p, href });
                  const isActive = href === here;
                  const slug = p.href.replace(/^components\//, '').replace(/\.html$/, '');
                  const tag = 'o-' + slug;
                  return `<a class="docs-nav-link${isActive ? ' is-active' : ''}" href="${href}" data-slug="${escH(slug)}" data-tag="${escH(tag)}" title="${escH(p.desc || p.title)}"><span class="docs-nav-link-title">${escH(p.title)}</span></a>`;
                }).join('')}
              </div>
            </details>
          `;
        }).join('') || '<p class="o-text-muted o-p-3">Run <code>npm run build</code> to generate the navigation.</p>'}
        <div class="docs-nav-empty" hidden>
          <div class="docs-nav-empty-icon">${O.icon('search')}</div>
          <div class="docs-nav-empty-text">No components found for "<strong class="docs-nav-empty-query"></strong>"</div>
          <button type="button" class="o-btn o-btn-xs o-btn-soft docs-nav-empty-clear">Clear filter</button>
        </div>
      </nav>
    `;

    const content = document.createElement('div'); content.className = 'docs-content';
    const toc = document.createElement('nav'); toc.className = 'docs-toc'; toc.setAttribute('aria-label', 'On this page');
    const backdrop = document.createElement('div'); backdrop.className = 'docs-backdrop';
    main.replaceWith(layout);
    layout.append(sidebar, content, backdrop);
    content.append(main, toc);
    document.body.prepend(header);

    // pager
    const idx = flat.findIndex(p => p.href === here);
    if (idx >= 0) {
      const pager = document.createElement('nav'); pager.className = 'docs-pager';
      if (flat[idx - 1]) pager.innerHTML += `<a href="${flat[idx - 1].href}"><small>Previous</small>${escH(flat[idx - 1].title)}</a>`;
      if (flat[idx + 1]) pager.innerHTML += `<a class="is-next" href="${flat[idx + 1].href}"><small>Next</small>${escH(flat[idx + 1].title)}</a>`;
      main.append(pager);
    }
    // footer
    const footer = document.createElement('footer');
    footer.className = 'docs-footer';
    footer.innerHTML = `
      <div class="docs-footer-info">
        <span>Orion Admin · MIT Licensed · Open Source Admin UI Library</span>
      </div>
      <div class="docs-footer-links">
        <a href="https://github.com/amithigh1/OrionUi" target="_blank" rel="noopener">GitHub ↗</a>
        <span class="docs-footer-sep">·</span>
        <a href="${ROOT}getting-started.html">Documentation</a>
      </div>`;
    main.append(footer);
    // toc
    const heads = [...main.querySelectorAll('section[id] > h2, h2[id]')];
    if (heads.length > 1) {
      toc.innerHTML = '<div class="docs-toc-title">On this page</div>' + heads.map(hd => { const id = hd.id || hd.parentElement.id; return `<a href="#${id}">${escH(hd.textContent)}</a>`; }).join('');
      const links = [...toc.querySelectorAll('a')];
      const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { const id = e.target.id || e.target.parentElement.id; links.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + id)); } }), { rootMargin: '-20% 0px -70% 0px' });
      heads.forEach(hd => io.observe(hd.id ? hd : hd.parentElement));
    }
    // active link into view — scroll cleanly so section headers are not cut off
    const active = sidebar.querySelector('.is-active');
    if (active) {
      const sRect = sidebar.getBoundingClientRect();
      const aRect = active.getBoundingClientRect();
      if (aRect.top < sRect.top + 50 || aRect.bottom > sRect.bottom - 50) {
        const sec = active.closest('.docs-nav-section');
        const target = sec || active;
        sidebar.scrollTop = Math.max(0, Math.round(target.getBoundingClientRect().top - sRect.top + sidebar.scrollTop - 64));
      }
    }

    // Accordion persistence & toggle all button
    const sections = sidebar.querySelectorAll('details.docs-nav-section');
    const toggleAllBtn = sidebar.querySelector('.docs-accordion-toggle');
    const countEl = sidebar.querySelector('.docs-sidebar-count');

    function updateToggleAllBtn() {
      if (!toggleAllBtn) return;
      const allOpen = [...sections].every(s => s.open);
      toggleAllBtn.textContent = allOpen ? 'Collapse all' : 'Expand all';
      toggleAllBtn.title = allOpen ? 'Collapse all sections' : 'Expand all sections';
    }
    updateToggleAllBtn();

    sections.forEach(sec => {
      sec.addEventListener('toggle', () => {
        if (!activeSearchQuery) {
          const name = sec.dataset.section;
          if (name) {
            savedState[name] = sec.open;
            try { localStorage.setItem('orion:docs:nav-open', JSON.stringify(savedState)); } catch {}
          }
          updateToggleAllBtn();
        }
      });
    });

    if (toggleAllBtn) {
      toggleAllBtn.onclick = () => {
        const anyClosed = [...sections].some(s => !s.open);
        sections.forEach(s => {
          s.open = anyClosed;
          const name = s.dataset.section;
          if (name) savedState[name] = anyClosed;
        });
        try { localStorage.setItem('orion:docs:nav-open', JSON.stringify(savedState)); } catch {}
        updateToggleAllBtn();
      };
    }

    // Dual search inputs (sidebar nav search + header search)
    const headerSearch = header.querySelector('.docs-search');
    const headerInput = headerSearch ? headerSearch.querySelector('input') : null;
    const headerClear = headerSearch ? headerSearch.querySelector('.docs-search-clear') : null;

    const sidebarSearch = sidebar.querySelector('.docs-sidebar-search');
    const sidebarInput = sidebarSearch ? sidebarSearch.querySelector('input') : null;
    const sidebarClear = sidebarSearch ? sidebarSearch.querySelector('.docs-nav-search-clear') : null;

    const emptyState = sidebar.querySelector('.docs-nav-empty');
    const emptyQuery = sidebar.querySelector('.docs-nav-empty-query');
    const emptyClearBtn = sidebar.querySelector('.docs-nav-empty-clear');

    let activeSearchQuery = '';

    function handleSearch(q, sourceInput) {
      activeSearchQuery = q.trim();
      const query = activeSearchQuery.toLowerCase();
      const hasQuery = query.length > 0;

      if (headerInput && headerInput !== sourceInput) headerInput.value = activeSearchQuery;
      if (sidebarInput && sidebarInput !== sourceInput) sidebarInput.value = activeSearchQuery;

      if (headerClear) headerClear.hidden = !hasQuery;
      if (sidebarClear) sidebarClear.hidden = !hasQuery;

      if (!hasQuery) {
        if (emptyState) emptyState.hidden = true;
        sections.forEach(sec => {
          sec.hidden = false;
          const name = sec.dataset.section;
          const wasOpen = sec.classList.contains('has-active') || (savedState[name] != null ? savedState[name] : (name === 'Getting Started' || name === 'Foundation'));
          sec.open = wasOpen;
          sec.querySelectorAll('.docs-nav-link').forEach(a => { a.hidden = false; });
        });
        if (countEl) countEl.textContent = `${totalCount} items`;
        updateToggleAllBtn();
        return;
      }

      const words = query.split(/\s+/).filter(Boolean);
      let totalMatches = 0;

      sections.forEach(sec => {
        let sectionMatches = 0;
        const secName = (sec.dataset.section || '').toLowerCase();

        sec.querySelectorAll('.docs-nav-link').forEach(a => {
          const title = (a.querySelector('.docs-nav-link-title')?.textContent || a.textContent || '').toLowerCase();
          const desc = (a.title || '').toLowerCase();
          const slug = (a.dataset.slug || '').toLowerCase();
          const tag = (a.dataset.tag || '').toLowerCase();
          const href = (a.getAttribute('href') || '').toLowerCase();

          const corpus = `${title} ${slug} ${tag} ${desc} ${secName} ${href}`;
          const isDirectMatch = words.every(w => corpus.includes(w));
          const isFuzzyMatch = !isDirectMatch && (O.util && O.util.fuzzy ? !!O.util.fuzzy(query, `${title} ${slug} ${tag}`) : false);
          const ok = isDirectMatch || isFuzzyMatch;

          a.hidden = !ok;
          if (ok) {
            sectionMatches++;
            totalMatches++;
          }
        });

        if (sectionMatches > 0) {
          sec.hidden = false;
          sec.open = true;
        } else {
          sec.hidden = true;
        }
      });

      if (emptyState) {
        emptyState.hidden = totalMatches > 0;
        if (emptyQuery) emptyQuery.textContent = activeSearchQuery;
      }

      if (countEl) {
        countEl.textContent = `${totalMatches} result${totalMatches === 1 ? '' : 's'}`;
      }
    }

    const attachSearchEvents = (inp) => {
      if (!inp) return;
      inp.addEventListener('input', e => handleSearch(e.target.value, inp));
      inp.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
          handleSearch('', null);
          inp.blur();
        } else if (e.key === 'Enter') {
          const firstVisible = sidebar.querySelector('.docs-nav-link:not([hidden])');
          if (firstVisible) location.href = firstVisible.href;
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          const firstVisible = sidebar.querySelector('.docs-nav-link:not([hidden])');
          if (firstVisible) firstVisible.focus();
        }
      });
    };

    attachSearchEvents(sidebarInput);
    attachSearchEvents(headerInput);

    const resetSearch = () => {
      handleSearch('', null);
      if (sidebarInput && window.innerWidth > 991) sidebarInput.focus();
      else if (headerInput) headerInput.focus();
    };

    if (sidebarClear) sidebarClear.addEventListener('click', resetSearch);
    if (headerClear) headerClear.addEventListener('click', resetSearch);
    if (emptyClearBtn) emptyClearBtn.addEventListener('click', resetSearch);

    // Initial search from URL parameter (e.g. ?q=theme)
    try {
      const urlQuery = new URLSearchParams(location.search).get('q');
      if (urlQuery) {
        handleSearch(urlQuery, null);
      }
    } catch {}

    document.addEventListener('keydown', e => {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) {
        e.preventDefault();
        const target = (window.innerWidth <= 991 && sidebarInput) ? sidebarInput : (sidebarInput || headerInput);
        if (target) {
          target.focus();
          target.select();
        }
      }
    });
    // menu (mobile)
    header.querySelector('.docs-menu-btn').onclick = () => document.body.classList.toggle('docs-nav-open');
    backdrop.onclick = () => document.body.classList.remove('docs-nav-open');
    // theme
    const tb = header.querySelector('.docs-theme');
    const paint = () => { const m = O.theme.mode; tb.innerHTML = String(O.icon(m === 'dark' ? 'moon' : m === 'light' ? 'sun' : 'monitor')); tb.title = 'Theme: ' + m; };
    tb.onclick = () => { O.theme.cycle(); paint(); };
    paint();
    // rtl
    header.querySelector('.docs-rtl').onclick = () => { const r = document.documentElement.dir === 'rtl'; document.documentElement.dir = r ? 'ltr' : 'rtl'; };
    // language
    const sel = header.querySelector('.docs-lang');
    const fill = () => { sel.innerHTML = O.i18n.locales().map(l => `<option value="${l.code}"${l.code === O.i18n.locale ? ' selected' : ''}>${escH(l.name)}</option>`).join(''); };
    fill();
    if (!sel.value) sel.innerHTML += `<option selected>${O.i18n.locale}</option>`;
    sel.onchange = () => O.i18n.set(sel.value);
  }

  /* ── demo helpers ────────────────────────────────────────────────── */
  function rand(seed = 1) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const FIRST = ['Aisha', 'Ben', 'Chen', 'Diego', 'Elena', 'Farid', 'Grace', 'Hiro', 'Isabel', 'Jamal', 'Kavya', 'Liam', 'Mei', 'Noah', 'Olivia', 'Priya', 'Quinn', 'Rahul', 'Sofia', 'Tomas', 'Uma', 'Victor', 'Wei', 'Xena', 'Yusuf', 'Zara', 'Adam', 'Nurul', 'Siti', 'Arjun', 'Lucas', 'Emma', 'Hana', 'Omar', 'Lina', 'Ravi'];
  const LAST = ['Rahman', 'Tan', 'Garcia', 'Smith', 'Kowalski', 'Nguyen', 'Müller', 'Okafor', 'Silva', 'Ivanova', 'Lim', 'Patel', 'Rossi', 'Kim', 'Haddad', 'Johnson', 'Lee', 'Wong', 'Abdullah', 'Dubois', 'Sato', 'Brown', 'Ismail', 'Novak', 'Chua', 'Mensah', 'Costa', 'Ahmed'];
  const ROLES = ['Admin', 'Editor', 'Viewer', 'Manager', 'Support'];
  const DEPTS = ['Engineering', 'Sales', 'Marketing', 'Finance', 'Operations', 'Design', 'HR', 'Legal'];
  const STATUS = ['Active', 'Active', 'Active', 'Pending', 'Inactive', 'Suspended'];
  const COUNTRIES = [['MY', 'Malaysia', 'Kuala Lumpur'], ['SG', 'Singapore', 'Singapore'], ['US', 'United States', 'New York'], ['GB', 'United Kingdom', 'London'], ['DE', 'Germany', 'Berlin'], ['IN', 'India', 'Bengaluru'], ['JP', 'Japan', 'Tokyo'], ['BR', 'Brazil', 'São Paulo'], ['AE', 'United Arab Emirates', 'Dubai'], ['AU', 'Australia', 'Sydney'], ['FR', 'France', 'Paris'], ['ID', 'Indonesia', 'Jakarta']];
  /** people(n, seed) -> [{ id, name, first, last, email, role, department, status, country, countryCode, city, salary, joined (Date), lastLogin (Date), progress, rating, tags, avatar }] */
  function people(n = 50, seed = 7) {
    const r = rand(seed), pick = a => a[Math.floor(r() * a.length)];
    const now = Date.now();
    return Array.from({ length: n }, (_, i) => {
      const first = pick(FIRST), last = pick(LAST), c = pick(COUNTRIES);
      return {
        id: i + 1, first, last, name: `${first} ${last}`,
        email: `${first}.${last}`.toLowerCase().normalize('NFD').replace(/[^a-z.]/g, '') + (i + 1) + '@example.com',
        role: pick(ROLES), department: pick(DEPTS), status: pick(STATUS), countryCode: c[0], country: c[1], city: c[2],
        salary: Math.round((35000 + r() * 115000) / 100) * 100, joined: new Date(now - Math.floor(r() * 2400) * 864e5),
        lastLogin: new Date(now - Math.floor(r() * 60 * 24 * 30) * 6e4), progress: Math.round(r() * 100), rating: Math.round((1 + r() * 4) * 10) / 10,
        tags: [pick(['vip', 'new', 'remote', 'onsite', 'trial', 'beta'])], avatar: null,
      };
    });
  }
  /** fakeServer(rows, { latency }) -> async ({ page=1, pageSize=10, sort=[{key,dir}], search='', filters={} }) => ({ rows, total }) */
  function fakeServer(all, { latency = 350 } = {}) {
    return async ({ page = 1, pageSize = 10, sort = [], search = '', filters = {} } = {}) => {
      await new Promise(r => setTimeout(r, latency));
      let rows = all;
      if (search) { const q = String(search).toLowerCase(); rows = rows.filter(row => Object.values(row).some(v => String(v).toLowerCase().includes(q))); }
      for (const [k, v] of Object.entries(filters || {})) {
        if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
        rows = rows.filter(row => Array.isArray(v) ? v.map(String).includes(String(row[k])) : String(row[k]).toLowerCase().includes(String(v).toLowerCase()));
      }
      if (sort.length) rows = [...rows].sort((a, b) => { for (const s of sort) { const x = a[s.key], y = b[s.key]; const c = x > y ? 1 : x < y ? -1 : 0; if (c) return s.dir === 'desc' ? -c : c; } return 0; });
      return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length };
    };
  }
  /** series(n, { start, step, base, vol, seed }) -> [{ x: Date, y: number }] random walk */
  function series(n = 30, { start = Date.now() - (n - 1) * 864e5, step = 864e5, base = 100, vol = 0.08, seed = 3 } = {}) {
    const r = rand(seed); let v = base;
    return Array.from({ length: n }, (_, i) => { v = Math.max(0, v * (1 + (r() - 0.48) * vol)); return { x: new Date(start + i * step), y: Math.round(v * 100) / 100 }; });
  }
  function log(target, msg) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return console.log(msg);
    const line = document.createElement('div');
    line.textContent = `${new Date().toLocaleTimeString()}  ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`;
    el.prepend(line);
    while (el.children.length > 40) el.lastChild.remove();
  }
  window.docs = { log, people, fakeServer, series, rand, highlight, countries: COUNTRIES.map(([code, name, city]) => ({ code, name, city })) };

  const start = () => { buildShell(); initDemos(document); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
