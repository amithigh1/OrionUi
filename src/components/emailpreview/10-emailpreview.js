/* <o-email-preview html subject from to preheader> — preview an HTML email the way a mail client would show it,
 * without ever running any of its markup: the body renders in a sandboxed <iframe srcdoc> (no allow-scripts,
 * ever) with device-width, dark-mode-simulation, images on/off and zoom controls, plus text-only, highlighted
 * source and one-line inbox-row views. See README.md for the full API.
 */
i18n.add('en', {
  emailpreview: {
    toolbar: 'Email preview toolbar', view: 'View', preview: 'Preview', text: 'Text', source: 'Source', inbox: 'Inbox row',
    device: 'Device width', desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile',
    dark: 'Dark mode', images: 'Images', zoom: 'Zoom',
    sendTest: 'Send test email', sendTestLabel: 'Send to', send: 'Send', cancel: 'Cancel', close: 'Close',
    noSubject: '(no subject)', unnamedSender: 'Unknown sender', from: 'From', to: 'To',
    frameTitle: 'Email preview: {subject}', textEmpty: '(empty message)', modalTitle: 'Email preview',
  },
});

const EP_VIEWS = ['preview', 'text', 'source', 'inbox'];
const EP_DEVICES = ['desktop', 'tablet', 'mobile'];
const EP_DEVICE_ICONS = { desktop: 'monitor', tablet: 'tablet', mobile: 'smartphone' };
const EP_VIEW_ICONS = { preview: 'eye', text: 'type', source: 'code', inbox: 'inbox' };
const EP_ZOOMS = [75, 100, 125];

class OEmailPreview extends OElement {
  static props = {
    html: { type: String, default: '' },
    subject: { type: String, default: '' },
    from: { type: String, default: '' },
    to: { type: Any, default: '' },
    preheader: { type: String, default: '' },
    device: { type: String, default: 'desktop', reflect: true },
    dark: { type: Boolean, default: false, reflect: true },
    images: { type: Boolean, default: true, reflect: true },
    zoom: { type: Number, default: 100, reflect: true },
    view: { type: String, default: 'preview', reflect: true },
    toolbar: { type: Boolean, default: true, reflect: true },
    texts: Object,
  };

  setup() {
    this.classList.add('o-email-preview');

    /* view switch */
    const viewBtn = v => h('button', { type: 'button', 'data-view': v, 'aria-pressed': 'false' }, raw(String(icon(EP_VIEW_ICONS[v]))), h('span', null, ''));
    this.viewBtns = { preview: viewBtn('preview'), text: viewBtn('text'), source: viewBtn('source'), inbox: viewBtn('inbox') };
    this.viewGroup = h('div', { class: 'o-segmented', role: 'group' }, EP_VIEWS.map(v => this.viewBtns[v]));

    /* device width switch (icon-only, each needs its own aria-label) */
    const deviceBtn = v => h('button', { type: 'button', 'data-device': v, 'aria-pressed': 'false' }, raw(String(icon(EP_DEVICE_ICONS[v]))));
    this.deviceBtns = { desktop: deviceBtn('desktop'), tablet: deviceBtn('tablet'), mobile: deviceBtn('mobile') };
    this.deviceGroup = h('div', { class: 'o-segmented', role: 'group' }, EP_DEVICES.map(v => this.deviceBtns[v]));

    /* dark-mode + images toggles */
    this.darkBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm o-ep-toggle', 'aria-pressed': 'false' }, raw(String(icon('moon'))), h('span', null, ''));
    this.imagesBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm o-ep-toggle', 'aria-pressed': 'true' }, raw(String(icon('image'))), h('span', null, ''));

    /* zoom switch */
    const zoomBtn = z => h('button', { type: 'button', 'data-zoom': String(z), 'aria-pressed': 'false' }, z + '%');
    this.zoomBtns = Object.fromEntries(EP_ZOOMS.map(z => [z, zoomBtn(z)]));
    this.zoomGroup = h('div', { class: 'o-segmented', role: 'group' }, EP_ZOOMS.map(z => this.zoomBtns[z]));

    this.tools = h('div', { class: 'o-ep-tools' }, this.deviceGroup, this.darkBtn, this.imagesBtn, this.zoomGroup);

    this.sendBtn = h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm o-ep-send' }, raw(String(icon('send'))), h('span', null, ''));

    this.toolbarEl = h('div', { class: 'o-ep-toolbar', role: 'toolbar' }, this.viewGroup, this.tools, h('span', { class: 'o-spacer' }), this.sendBtn);

    /* meta line: subject / from-to / preheader */
    this.subjectEl = h('div', { class: 'o-ep-subject' });
    this.fromToEl = h('div', { class: 'o-ep-fromto o-muted o-small' });
    this.preheaderEl = h('div', { class: 'o-ep-preheader o-small' });
    this.meta = h('div', { class: 'o-ep-meta' }, this.subjectEl, this.fromToEl, this.preheaderEl);

    /* preview panel: sandboxed iframe, never allow-scripts.
     * The very first srcdoc is set here, on a still-detached element, before it is ever connected to a
     * document — an iframe inserted empty and given srcdoc afterwards briefly holds a real "about:blank"
     * document first, which readers of Page.addScriptToEvaluateOnNewDocument (e.g. the --rtl checker in
     * this repo) will then attempt to run a script into; blocked harmlessly by the sandbox, but it
     * shows up as a console security message. Setting srcdoc before insertion navigates straight to the
     * real document instead, with no such interim state. Later updates (_renderFrame) just reassign
     * srcdoc on the already-connected iframe, which does not have this issue.
     */
    this.iframe = h('iframe', { class: 'o-ep-frame', sandbox: 'allow-popups' });
    this.iframe.srcdoc = epBuildSrcdoc(this.html, { dark: this.dark, images: this.images, subject: this.subject });
    this.frameWrap = h('div', { class: 'o-ep-frame-wrap o-theme-light' }, this.iframe);
    this.previewPanel = h('div', { class: 'o-ep-panel o-ep-panel-preview', 'data-panel': 'preview' }, this.frameWrap);

    /* text-only panel */
    this.textEl = h('pre', { class: 'o-pre o-ep-text' });
    this.textPanel = h('div', { class: 'o-ep-panel o-ep-panel-text', 'data-panel': 'text', hidden: true }, this.textEl);

    /* highlighted source panel */
    this.sourceCode = h('code');
    this.sourcePre = h('pre', { class: 'o-pre o-ep-source' }, this.sourceCode);
    this.sourcePanel = h('div', { class: 'o-ep-panel o-ep-panel-source', 'data-panel': 'source', hidden: true }, this.sourcePre);

    /* one-line inbox-row panel */
    this.inboxAvatar = h('div', { class: 'o-avatar o-avatar-sm', 'aria-hidden': 'true' });
    this.inboxFrom = h('span', { class: 'o-ep-inbox-from o-truncate' });
    this.inboxSubject = h('span', { class: 'o-ep-inbox-subject o-truncate' });
    this.inboxPreheader = h('span', { class: 'o-ep-inbox-preheader o-truncate o-muted' });
    this.inboxRow = h('div', { class: 'o-ep-inbox-row' }, this.inboxAvatar,
      h('div', { class: 'o-ep-inbox-main' },
        this.inboxFrom,
        h('div', { class: 'o-ep-inbox-line' }, this.inboxSubject, h('span', { class: 'o-ep-inbox-sep', 'aria-hidden': 'true' }, '—'), this.inboxPreheader)));
    this.inboxPanel = h('div', { class: 'o-ep-panel o-ep-panel-inbox', 'data-panel': 'inbox', hidden: true }, this.inboxRow);

    this.body = h('div', { class: 'o-ep-body' }, this.previewPanel, this.textPanel, this.sourcePanel, this.inboxPanel);

    this.append(this.toolbarEl, this.meta, this.body);

    /* wiring */
    on(this.viewGroup, 'click', 'button[data-view]', (e, btn) => { this.view = btn.dataset.view; });
    on(this.deviceGroup, 'click', 'button[data-device]', (e, btn) => { this.device = btn.dataset.device; });
    on(this.zoomGroup, 'click', 'button[data-zoom]', (e, btn) => { this.zoom = +btn.dataset.zoom; });
    on(this.darkBtn, 'click', () => { this.dark = !this.dark; });
    on(this.imagesBtn, 'click', () => { this.images = !this.images; });
    on(this.sendBtn, 'click', () => { this.sendTest(); });
  }

  connected() {
    this.listen(document, 'o-theme', () => this.requestUpdate());
  }

  update(changed) {
    const init = changed.has('init');
    if (init || changed.has('locale') || changed.has('texts')) this._paintLabels();
    if (init || changed.has('view')) this._paintView();
    if (init || changed.has('device')) this._paintDevice();
    if (init || changed.has('dark')) this._paintDark();
    if (init || changed.has('images')) this._paintImages();
    if (init || changed.has('zoom')) this._paintZoom();
    if (init || changed.has('toolbar')) this.toolbarEl.hidden = !this.toolbar;
    // setup() already set the correct initial srcdoc (before the iframe was connected — see the comment
    // there); only re-render on later, real changes so a freshly-connected iframe never has its srcdoc
    // reassigned a second time before the first navigation is even under way.
    if (!init && (changed.has('html') || changed.has('dark') || changed.has('images'))) this._renderFrame();
    if (init || changed.has('html')) { this._renderText(); this._renderSource(); }
    if (init || changed.has('subject') || changed.has('locale')) this._paintFrameTitle();
    if (init || changed.has('subject') || changed.has('from') || changed.has('to') || changed.has('preheader') || changed.has('locale')) this._renderMeta();
  }

  /* ── painters ── */
  _paintLabels() {
    for (const v of EP_VIEWS) this.viewBtns[v].lastChild.textContent = this.t('emailpreview.' + v);
    this.viewGroup.setAttribute('aria-label', this.t('emailpreview.view'));
    for (const d of EP_DEVICES) { const label = this.t('emailpreview.' + d); this.deviceBtns[d].setAttribute('aria-label', label); this.deviceBtns[d].title = label; }
    this.deviceGroup.setAttribute('aria-label', this.t('emailpreview.device'));
    this.darkBtn.lastChild.textContent = this.t('emailpreview.dark');
    this.imagesBtn.lastChild.textContent = this.t('emailpreview.images');
    this.zoomGroup.setAttribute('aria-label', this.t('emailpreview.zoom'));
    this.sendBtn.lastChild.textContent = this.t('emailpreview.sendTest');
    this.toolbarEl.setAttribute('aria-label', this.t('emailpreview.toolbar'));
  }
  _paintView() {
    const current = this.view;
    const panels = { preview: this.previewPanel, text: this.textPanel, source: this.sourcePanel, inbox: this.inboxPanel };
    for (const v of EP_VIEWS) { this.viewBtns[v].setAttribute('aria-pressed', String(v === current)); panels[v].hidden = v !== current; }
    this.tools.hidden = current !== 'preview';
    this.meta.hidden = current === 'inbox';
    if (this._lastView !== undefined && this._lastView !== current) this.emit('view-change', { view: current, previous: this._lastView });
    this._lastView = current;
  }
  _paintDevice() {
    for (const d of EP_DEVICES) this.deviceBtns[d].setAttribute('aria-pressed', String(d === this.device));
    this.frameWrap.dataset.device = this.device;
  }
  _paintDark() {
    this.darkBtn.setAttribute('aria-pressed', String(!!this.dark));
    this.frameWrap.classList.toggle('is-dark', !!this.dark);
  }
  _paintImages() { this.imagesBtn.setAttribute('aria-pressed', String(!!this.images)); }
  _paintZoom() {
    for (const z of EP_ZOOMS) this.zoomBtns[z].setAttribute('aria-pressed', String(z === this.zoom));
    this.frameWrap.style.zoom = this.zoom === 100 ? '' : String(this.zoom / 100);
  }
  _paintFrameTitle() {
    const subject = this.subject && this.subject.trim() ? this.subject : this.t('emailpreview.noSubject');
    this.iframe.title = this.t('emailpreview.frameTitle', { subject });
  }
  _renderFrame() {
    this.iframe.srcdoc = epBuildSrcdoc(this.html, { dark: this.dark, images: this.images, subject: this.subject });
  }
  _renderText() { this.textEl.textContent = epHtmlToText(this.html) || this.t('emailpreview.textEmpty'); }
  _renderSource() {
    const src = this.html || '';
    if (isFn(O.highlight)) {
      this.sourcePre.classList.add('o-code-hl', 'o-hl-numbered');
      this.sourceCode.innerHTML = O.highlight(src, 'html', { lines: true });
    } else {
      this.sourcePre.classList.remove('o-code-hl', 'o-hl-numbered');
      this.sourceCode.textContent = src;
    }
  }
  _renderMeta() {
    const subject = this.subject && this.subject.trim() ? this.subject : this.t('emailpreview.noSubject');
    const fromDisp = this.from && this.from.trim() ? this.from : this.t('emailpreview.unnamedSender');
    const toDisp = epToText(this.to);
    const ph = (this.preheader || '').trim();

    this.subjectEl.textContent = subject;
    this.fromToEl.textContent = toDisp
      ? this.t('emailpreview.from') + ': ' + fromDisp + '   ' + this.t('emailpreview.to') + ': ' + toDisp
      : this.t('emailpreview.from') + ': ' + fromDisp;
    this.preheaderEl.textContent = ph;
    this.preheaderEl.hidden = !ph;

    const initial = epInitial(this.from);
    if (initial) { this.inboxAvatar.textContent = initial; } else { this.inboxAvatar.textContent = ''; this.inboxAvatar.innerHTML = String(icon('user')); }
    this.inboxFrom.textContent = fromDisp;
    this.inboxSubject.textContent = subject;
    this.inboxPreheader.textContent = ph;
    this.inboxPreheader.hidden = !ph;
  }

  /* ── public API ── */
  /** Re-render every panel from the current props (rarely needed — props already do this reactively). */
  refresh() { this._renderFrame(); this._renderText(); this._renderSource(); this._renderMeta(); }
  /** The plain-text conversion currently shown in the "Text" view. */
  getPlainText() { return epHtmlToText(this.html); }
  /** The sanitized HTML actually rendered inside the preview iframe. */
  getSanitizedHTML() { return epSanitize(this.html); }
  /**
   * Ask for a test address (Orion.prompt(), or a small built-in popover) and emit `o-send-test`.
   * Pass `to` to skip the prompt and send immediately. Resolves with the address used, or null if cancelled.
   */
  async sendTest(to) {
    let target = to != null ? String(to).trim() : await epAskTestEmail(this.sendBtn, epToText(this.to));
    if (!target) return null;
    this.emit('send-test', { to: target });
    return target;
  }
}
define('o-email-preview', OEmailPreview);
O.EmailPreview = OEmailPreview;
