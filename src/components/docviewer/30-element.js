/* <o-docviewer src type filename label> — universal file preview with a toolbar (filename, zoom where
 * possible, download, print, open in new tab, fullscreen).
 *   <o-docviewer src="report.pdf"></o-docviewer>
 *   <o-docviewer src="brief.docx" filename="Project brief.docx"></o-docviewer>
 * `src` accepts a URL string, a File or a Blob (set as a property). `type` overrides auto-detection
 * ('pdf'|'docx'|'csv'|'json'|'markdown'|'text'|'code'|'image'|'video'|'audio').
 * PDF uses the browser's own viewer in an <iframe> (a graceful fallback card is shown when
 * navigator.pdfViewerEnabled is false); pdf.js-style custom rendering is out of scope.
 * DOCX is converted to HTML by this package (see 10-docx.js) — common formatting only, not the full OOXML spec.
 * Video / audio previews reuse <o-video> / <o-audio> when the player package is loaded, else the native element.
 * Methods: refresh(), download(), print(), openInNewTab(), zoomIn(), zoomOut(), resetZoom(), toggleFullscreen()
 * Events: o-load { type, filename }, o-error { error }
 */
class ODocviewer extends OElement {
  static props = { src: Any, type: String, filename: String, label: String, texts: Object };
  get kind() { return this._kind || ''; }

  setup() {
    this.classList.add('o-docviewer');
    this._zoomLevel = 1;
    this._fileIcon = iconEl('file');
    this._filenameText = h('span', { class: 'o-docviewer-filename-text' });
    this._filenameEl = h('div', { class: 'o-docviewer-filename' }, this._fileIcon, this._filenameText);
    const tbtn = (a, name) => h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'data-a': a }, iconEl(name));
    this._zoomOutBtn = tbtn('zoomout', 'zoom-out');
    this._zoomLabelBtn = h('button', { type: 'button', class: 'o-docviewer-zoom-label' }, '100%');
    this._zoomInBtn = tbtn('zoomin', 'zoom-in');
    this._zoomGroup = h('div', { class: 'o-docviewer-zoom-group' }, this._zoomOutBtn, this._zoomLabelBtn, this._zoomInBtn);
    this._dlBtn = tbtn('download', 'download');
    this._printBtn = tbtn('print', 'printer');
    this._newTabBtn = tbtn('newtab', 'external-link');
    this._fsBtn = tbtn('fullscreen', 'maximize');
    this._toolbar = h('div', { class: 'o-docviewer-toolbar', role: 'toolbar' }, this._filenameEl,
      h('span', { class: 'o-docviewer-spacer' }), this._zoomGroup, this._dlBtn, this._printBtn, this._newTabBtn, this._fsBtn);
    this._contentEl = h('div', { class: 'o-docviewer-content' });
    this._loadingEl = h('div', { class: 'o-docviewer-loading' }, h('span', { class: 'o-spinner' }), h('span', { class: 'o-docviewer-loading-text' }));
    this._errorEl = h('div', { class: 'o-docviewer-error' }, icon('alert-triangle'), h('p', {}));
    this._body = h('div', { class: 'o-docviewer-body' }, this._loadingEl, this._errorEl, this._contentEl);
    this.append(this._toolbar, this._body);

    on(this._zoomOutBtn, 'click', () => this.zoomOut());
    on(this._zoomInBtn, 'click', () => this.zoomIn());
    on(this._zoomLabelBtn, 'click', () => this.resetZoom());
    on(this._dlBtn, 'click', () => this.download());
    on(this._printBtn, 'click', () => this.print());
    on(this._newTabBtn, 'click', () => this.openInNewTab());
    on(this._fsBtn, 'click', () => this.toggleFullscreen());
  }
  connected() { this.listen(doc, 'fullscreenchange', () => this._paintFullscreen()); }
  disconnected() { if (this._resolved?.revoke) URL.revokeObjectURL(this._resolved.url); }

  update(changed) {
    if (changed.has('label') || changed.has('init')) { if (this.label) this.setAttribute('aria-label', this.label); else this.removeAttribute('aria-label'); }
    this._toolbar.setAttribute('aria-label', (this.label ? this.label + ' — ' : '') + this.t('docviewer.toolbar'));
    this._loadingEl.querySelector('.o-docviewer-loading-text').textContent = this.t('docviewer.loading');
    this._errorEl.querySelector('p').textContent = this.t('docviewer.error');
    const lbl = (el, k) => { el.setAttribute('aria-label', this.t(k)); el.title = this.t(k); };
    lbl(this._zoomOutBtn, 'docviewer.zoomOut'); lbl(this._zoomInBtn, 'docviewer.zoomIn'); this._zoomLabelBtn.title = this.t('docviewer.zoomReset');
    lbl(this._dlBtn, 'docviewer.download'); lbl(this._printBtn, 'docviewer.print'); lbl(this._newTabBtn, 'docviewer.openNewTab');
    if (changed.has('src') || changed.has('type') || changed.has('filename') || changed.has('init')) this._render();
  }

  /* ── public API ── */
  refresh() { this._render(); }
  download() { fileDownload(this._resolved?.url || (isStr(this.src) ? this.src : ''), this.filename || nameOf(this.src) || 'download'); }
  openInNewTab() { const u = this._resolved?.url || (isStr(this.src) ? this.src : ''); if (u) win.open(u, '_blank', 'noopener'); }
  print() {
    if (this._kind === 'pdf' && this._pdfFrame) { try { this._pdfFrame.contentWindow.focus(); this._pdfFrame.contentWindow.print(); return; } catch {} }
    if (!this._contentEl.firstChild) return;
    const w = h('iframe', { class: 'o-docviewer-print-frame', 'aria-hidden': 'true' });
    doc.body.append(w);
    const pdoc = w.contentDocument;
    pdoc.open(); pdoc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(this.filename || '')}</title></head><body></body></html>`); pdoc.close();
    $$('style, link[rel="stylesheet"]', doc).forEach(n => pdoc.head.appendChild(pdoc.importNode(n, true)));
    pdoc.body.className = 'o-docviewer-print-body';
    pdoc.body.appendChild(pdoc.importNode(this._contentEl, true));
    setTimeout(() => { try { w.contentWindow.focus(); w.contentWindow.print(); } catch {} setTimeout(() => w.remove(), 1200); }, 200);
  }
  zoomIn() { this._setZoom(this._zoomLevel + 0.1); }
  zoomOut() { this._setZoom(this._zoomLevel - 0.1); }
  resetZoom() { this._setZoom(1); }
  toggleFullscreen() { doc.fullscreenElement === this ? doc.exitFullscreen?.().catch(noop) : this.requestFullscreen?.().catch(noop); }

  /* ── rendering ── */
  _setZoom(v) {
    if (this._zoomGroup.hidden) return;
    this._zoomLevel = clamp(round(v, 2), 0.5, 2);
    this._contentEl.style.zoom = this._zoomLevel;
    this._zoomLabelBtn.textContent = Math.round(this._zoomLevel * 100) + '%';
    this._zoomOutBtn.disabled = this._zoomLevel <= 0.5; this._zoomInBtn.disabled = this._zoomLevel >= 2;
    announce(this._zoomLabelBtn.textContent);
  }
  _paintFullscreen() {
    const fs = doc.fullscreenElement === this;
    this.classList.toggle('is-fullscreen', fs);
    this._fsBtn.innerHTML = String(icon(fs ? 'minimize' : 'maximize'));
    this._fsBtn.setAttribute('aria-label', this.t(fs ? 'docviewer.exitFullscreen' : 'docviewer.fullscreen'));
  }
  _fallbackCard(iconName, message) {
    return h('div', { class: 'o-empty' }, h('div', { class: 'o-empty-icon' }, icon(iconName)), h('p', { class: 'o-empty-text' }, message),
      h('div', { class: 'o-empty-actions' },
        h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm', onClick: () => this.download() }, icon('download'), this.t('docviewer.download')),
        h('button', { type: 'button', class: 'o-btn o-btn-sm', onClick: () => this.openInNewTab() }, icon('external-link'), this.t('docviewer.openNewTab'))));
  }
  async _render() {
    const tok = (this._tok = (this._tok || 0) + 1);
    if (this._resolved?.revoke) URL.revokeObjectURL(this._resolved.url);
    this._resolved = null; this._pdfFrame = null;
    this._contentEl.replaceChildren();
    this.classList.remove('is-error', 'is-empty');
    const src = this.src;
    if (src == null || src === '') {
      this.classList.remove('is-loading'); this.classList.add('is-empty');
      this._filenameText.textContent = ''; this._zoomGroup.hidden = true;
      return;
    }
    this.classList.add('is-loading');
    const filename = this.filename || nameOf(src);
    this._filenameText.textContent = filename || this.t('docviewer.toolbar');
    const mime = (typeof Blob !== 'undefined' && src instanceof Blob) ? src.type : '';
    const kind = this._kind = this.type || detectType(filename, mime);
    this._fileIcon.outerHTML = String(icon(DV_ICON[kind] || 'file'));
    this._fileIcon = this._filenameEl.firstElementChild;
    this._zoomGroup.hidden = !['docx', 'markdown', 'csv', 'json', 'code', 'text'].includes(kind);
    this._setZoom(1);
    try {
      const resolved = await resolveSrc(src);
      if (tok !== this._tok) return;
      this._resolved = resolved;
      await this._renderKind(kind, src, resolved);
      if (tok !== this._tok) return;
      this.classList.remove('is-loading');
      this.emit('load', { type: kind, filename });
    } catch (err) {
      if (tok !== this._tok) return;
      console.error('[Orion] <o-docviewer>', err);
      this.classList.remove('is-loading');
      this.classList.add('is-error');
      this.emit('error', { error: err });
    }
  }
  async _renderKind(kind, src, resolved) {
    const el = this._contentEl, name = this.filename || nameOf(src);
    if (kind === 'pdf') {
      const canInline = !isBrowser || !('pdfViewerEnabled' in navigator) || navigator.pdfViewerEnabled !== false;
      if (canInline) { const frame = h('iframe', { class: 'o-docviewer-frame', title: name || 'PDF' }); frame.src = resolved.url; this._pdfFrame = frame; el.append(frame); }
      else el.append(this._fallbackCard('file-pdf', this.t('docviewer.pdfFallback')));
    } else if (kind === 'docx') {
      const prose = h('div', { class: 'o-prose o-docviewer-docx' });
      el.append(h('div', { class: 'o-docviewer-page' }, prose));
      prose.innerHTML = String(await docxToHTML(src));
    } else if (kind === 'markdown') {
      const mdBase = isStr(src) ? new URL(src, location.href).href : '';
      el.append(h('div', { class: 'o-docviewer-page' }, renderMarkdown(await readText(src), mdBase)));
    } else if (kind === 'csv') {
      el.append(renderCSV(await readText(src)));
    } else if (kind === 'json') {
      el.append(renderJSON(await readText(src)));
    } else if (kind === 'code') {
      el.append(renderCode(await readText(src), extOf(name)));
    } else if (kind === 'text') {
      el.append(renderText(await readText(src)));
    } else if (kind === 'image') {
      const img = h('img', { src: resolved.url, alt: name || '' });
      el.append(customElements.get('o-zoom') ? h('o-zoom', { class: 'o-docviewer-zoom', label: name || '' }, img) : h('div', { class: 'o-docviewer-image-wrap' }, img));
    } else if (kind === 'video') {
      el.append(customElements.get('o-video') ? h('o-video', { src: resolved.url, controls: true, label: name || '' })
        : h('video', { src: resolved.url, controls: true, playsinline: true, class: 'o-docviewer-native-media' }));
    } else if (kind === 'audio') {
      el.append(customElements.get('o-audio') ? h('o-audio', { src: resolved.url, title: name || '' })
        : h('audio', { src: resolved.url, controls: true, class: 'o-docviewer-native-media' }));
    } else {
      el.append(this._fallbackCard('file', this.t('docviewer.error')));
    }
  }
}
define('o-docviewer', ODocviewer);
O.Docviewer = ODocviewer;

/** fileDownload(url, filename) — same-origin/blob/data downloads directly; cross-origin fetches first. */
async function fileDownload(url, name) {
  if (!url) return;
  try {
    const u = new URL(url, location.href);
    if (u.origin === location.origin || /^(blob|data):/.test(url)) return downloadURL(u.href, name);
    download(await (await fetch(u.href, { mode: 'cors' })).blob(), name);
  } catch { win.open(url, '_blank', 'noopener'); }
}
