(async () => {
  const results = {};
  const fail = [];
  const check = (name, cond) => { results[name] = !!cond; if (!cond) fail.push(name); };

  const el = document.createElement('o-email-preview');
  document.body.appendChild(el);
  el.flush?.();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  const REMOTE_IMG = 'https://cdn.example.com/remote-photo.png';
  const payload = [
    '<p>Hello <b>World</b>, click <a href="https://example.com/docs" target="_blank" id="blanklink">here</a>.</p>',
    '<script>window.__ep_xss_script = true;<' + '/script>',
    '<img src="x.png" onerror="window.__ep_xss_onerror = true" alt="broken image" width="120" height="80">',
    '<a href="javascript:window.__ep_xss_jslink=true" id="jslink">Do not click</a>',
    '<iframe src="https://evil.example.com/payload"></iframe>',
    '<img id="remoteimg" src="' + REMOTE_IMG + '" alt="Remote hero" width="200" height="100">',
  ].join('\n');

  el.html = payload;
  el.subject = 'Security test message';
  el.flush?.();
  await new Promise(r => requestAnimationFrame(r));

  const iframeEl = el.querySelector('iframe.o-ep-frame');
  check('iframePresent', iframeEl);

  const sandbox = iframeEl.getAttribute('sandbox');
  check('sandboxIsAllowPopupsOnly', sandbox === 'allow-popups');
  check('sandboxNeverHasAllowScripts', !/allow-scripts/.test(sandbox || ''));

  const sanitized = el.getSanitizedHTML();
  check('sanitize_scriptStripped', !/<script\b/i.test(sanitized));
  check('sanitize_onerrorStripped', !/\son\w+\s*=/i.test(sanitized));
  check('sanitize_jsLinkStripped', !/javascript:/i.test(sanitized));
  check('sanitize_iframeStripped', !/<iframe\b/i.test(sanitized));
  check('sanitize_boldTextKept', /World/.test(sanitized));
  check('sanitize_remoteImgKeptByDefault', sanitized.includes(REMOTE_IMG));
  check('sanitize_blankLinkGetsNoopener', /target="_blank"[^>]*rel="noopener noreferrer"/i.test(sanitized) || /rel="noopener noreferrer"[^>]*target="_blank"/i.test(sanitized));

  const srcdoc1 = iframeEl.srcdoc;
  check('srcdoc_noScript', !/<script\b/i.test(srcdoc1));
  check('srcdoc_noOnerrorHandler', !/\son\w+\s*=/i.test(srcdoc1));
  check('srcdoc_noJsLink', !/javascript:/i.test(srcdoc1));
  check('srcdoc_noIframe', !/<iframe\b/i.test(srcdoc1));
  check('srcdoc_neverAllowScripts', !/allow-scripts/.test(srcdoc1));

  // Global window flags must never have been set — proves the sandboxed iframe truly never executed anything.
  await new Promise(r => setTimeout(r, 150));
  check('no_script_executed', window.__ep_xss_script !== true);
  check('no_onerror_executed', window.__ep_xss_onerror !== true);
  check('no_jslink_executed', window.__ep_xss_jslink !== true);

  // ── images on/off ────────────────────────────────────────────────────
  check('images_defaultTrue', el.images === true);
  el.images = false;
  el.flush?.();
  await new Promise(r => requestAnimationFrame(r));
  const srcdocOff = iframeEl.srcdoc;
  check('imagesOff_usesPlaceholder', /data:image\/svg\+xml/.test(srcdocOff));
  // The live src= is replaced with a placeholder (never requested); the original URL is only kept in the
  // inert data-o-src attribute (per README) so it is never fetched, even though the string is still present.
  check('imagesOff_liveSrcIsPlaceholderNotRemote', !new RegExp('[^-]src="' + REMOTE_IMG + '"').test(srcdocOff));
  check('imagesOff_originalKeptOnDataAttr', srcdocOff.includes('data-o-src="' + REMOTE_IMG + '"'));

  el.images = true;
  el.flush?.();
  await new Promise(r => requestAnimationFrame(r));
  const srcdocOn = iframeEl.srcdoc;
  check('imagesOn_showsRemoteSrc', srcdocOn.includes(REMOTE_IMG));

  // ── device width toggle ─────────────────────────────────────────────
  check('device_defaultDesktop', el.device === 'desktop');
  el.device = 'mobile';
  el.flush?.();
  await new Promise(r => requestAnimationFrame(r));
  check('device_reflectsAttribute', el.getAttribute('device') === 'mobile');
  const frameWrap = el.querySelector('.o-ep-frame-wrap');
  check('device_dataAttrUpdated', frameWrap.dataset.device === 'mobile');
  el.device = 'desktop';
  el.flush?.();

  // ── dark mode toggle changes the rendered frame ─────────────────────
  check('dark_defaultFalse', el.dark === false);
  const srcdocLight = iframeEl.srcdoc;
  check('light_hasLightColorScheme', /color-scheme" content="light"/.test(srcdocLight));
  el.dark = true;
  el.flush?.();
  await new Promise(r => requestAnimationFrame(r));
  const srcdocDark = iframeEl.srcdoc;
  check('dark_appliesForcedDarkCss', /background:#1b1d23 !important/.test(srcdocDark));
  check('dark_hasDarkColorScheme', /color-scheme" content="dark"/.test(srcdocDark));
  check('dark_classToggled', frameWrap.classList.contains('is-dark'));
  el.dark = false;
  el.flush?.();

  // an email that already declares dark support should NOT get the forced override CSS
  el.html = '<meta name="color-scheme" content="light dark"><p>Already dark-aware</p>';
  el.dark = true;
  el.flush?.();
  await new Promise(r => requestAnimationFrame(r));
  check('dark_respectsDeclaredDarkEmail', !/background:#1b1d23 !important/.test(iframeEl.srcdoc));
  el.dark = false;

  // ── view toggles: preview / text / source / inbox ───────────────────
  el.html = payload;
  el.subject = 'Your September Orion digest';
  el.from = 'Ada Lovelace <ada@example.com>';
  el.flush?.();
  await new Promise(r => requestAnimationFrame(r));

  check('view_defaultPreview', el.view === 'preview');
  const previewPanel = el.querySelector('.o-ep-panel-preview');
  const textPanel = el.querySelector('.o-ep-panel-text');
  const sourcePanel = el.querySelector('.o-ep-panel-source');
  const inboxPanel = el.querySelector('.o-ep-panel-inbox');
  check('view_previewVisibleInitially', !previewPanel.hidden && textPanel.hidden && sourcePanel.hidden && inboxPanel.hidden);

  el.view = 'text';
  el.flush?.();
  await new Promise(r => requestAnimationFrame(r));
  check('view_textShown', !textPanel.hidden && previewPanel.hidden);
  const plainText = el.getPlainText();
  check('text_methodMatchesRenderedView', el.querySelector('.o-ep-text').textContent === plainText);
  check('text_containsWorld', /World/.test(plainText));
  check('text_linkBecomesLabelUrl', /here \(https:\/\/example\.com\/docs\)/.test(plainText));
  check('text_scriptContentSkipped', !/__ep_xss_script/.test(plainText));

  el.view = 'source';
  el.flush?.();
  await new Promise(r => requestAnimationFrame(r));
  check('view_sourceShown', !sourcePanel.hidden && textPanel.hidden);
  const sourceText = el.querySelector('.o-ep-source').textContent;
  check('source_showsRawUnsanitizedScriptTag', sourceText.includes('<script>'));
  check('source_isEscapedNotParsed', el.querySelector('.o-ep-source script') === null);

  el.view = 'inbox';
  el.flush?.();
  await new Promise(r => requestAnimationFrame(r));
  check('view_inboxShown', !inboxPanel.hidden && previewPanel.hidden);
  check('inbox_showsSubject', el.querySelector('.o-ep-inbox-subject').textContent.includes('Your September Orion digest'));
  check('inbox_showsInitialFromName', el.querySelector('.o-avatar').textContent.trim() === 'A');

  el.view = 'preview';
  el.flush?.();

  // ── plain-text fallback view works standalone via getPlainText() ────
  el.html = '<div><p>Block one</p><p>Block two with <a href="https://x.test">a link</a></p><img alt="pic here"></div>';
  el.flush?.();
  await new Promise(r => requestAnimationFrame(r));
  const text2 = el.getPlainText();
  check('text_blocksBecomeLines', text2.split('\n').filter(Boolean).length >= 2);
  check('text_imgAltBecomesBracketed', text2.includes('[pic here]'));

  el.remove();

  const ok = fail.length === 0;
  return { ok, failed: fail, results };
})()
