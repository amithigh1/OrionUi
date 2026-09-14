/* <o-editor> toolbar UI, popovers (link / image / table / color), bubble toolbar, source view, fullscreen.
 * Extends OEditor.prototype (declared in 40-element.js) and registers the custom element. */

const ED_TOOLBAR_DEFAULT = [
  ['undo', 'redo'],
  ['blockType'],
  ['bold', 'italic', 'underline', 'strike', 'code'],
  ['color', 'highlight'],
  ['bulletList', 'orderedList', 'checkList'],
  ['blockquote', 'codeBlock'],
  ['align'],
  ['link', 'image', 'table', 'hr', 'emoji'],
  ['clear'],
  ['source', 'fullscreen'],
];
const ED_TB = {
  undo: { icon: 'undo', label: 'undo', shortcut: 'Mod+Z' },
  redo: { icon: 'redo', label: 'redo', shortcut: 'Mod+Shift+Z' },
  blockType: { icon: 'type', label: 'blockType' },
  bold: { icon: 'bold', label: 'bold', shortcut: 'Mod+B' },
  italic: { icon: 'italic', label: 'italic', shortcut: 'Mod+I' },
  underline: { icon: 'underline', label: 'underline', shortcut: 'Mod+U' },
  strike: { icon: 'strikethrough', label: 'strike', shortcut: 'Mod+Shift+X' },
  code: { icon: 'code', label: 'code' },
  superscript: { icon: 'superscript', label: 'superscript' },
  subscript: { icon: 'subscript', label: 'subscript' },
  color: { icon: 'text-color', label: 'color' },
  highlight: { icon: 'highlighter', label: 'highlight' },
  bulletList: { icon: 'list', label: 'bulletList', shortcut: 'Mod+Shift+8' },
  orderedList: { icon: 'list-ordered', label: 'orderedList', shortcut: 'Mod+Shift+7' },
  checkList: { icon: 'list-checks', label: 'checkList' },
  blockquote: { icon: 'quote', label: 'blockquote' },
  codeBlock: { icon: 'code-block', label: 'codeBlock' },
  align: { icon: 'align-left', label: 'align' },
  link: { icon: 'link', label: 'link', shortcut: 'Mod+K' },
  image: { icon: 'image', label: 'image' },
  table: { icon: 'table', label: 'insertTable' },
  hr: { icon: 'separator', label: 'hr' },
  emoji: { icon: 'smile', label: 'emoji' },
  clear: { icon: 'eraser', label: 'clear' },
  source: { icon: 'code-xml', label: 'source' },
  fullscreen: { icon: 'maximize', label: 'fullscreen' },
};
const ED_MARK_IDS = ['bold', 'italic', 'underline', 'strike', 'code', 'superscript', 'subscript'];
const ED_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#64748b'];

Object.assign(OEditor.prototype, {
  /* ── toolbar construction ──────────────────────────────────────────── */
  _buildToolbar() {
    this.toolbarEl.replaceChildren();
    if (this.toolbar === false) { this.toolbarEl.hidden = true; return; }
    this.toolbarEl.hidden = false;
    const groups = Array.isArray(this.toolbar) ? this.toolbar : ED_TOOLBAR_DEFAULT;
    groups.forEach(group => {
      const g = h('div', { class: 'o-editor-tb-group' });
      group.forEach(id => g.append(this._makeTbButton(id)));
      this.toolbarEl.append(g);
    });
    this._overflowBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm o-editor-tb-more', 'aria-label': t('editor.moreTools'), title: t('editor.moreTools'), hidden: true }, raw(String(icon('more-horizontal'))));
    on(this._overflowBtn, 'click', () => this._openOverflowMenu());
    this.toolbarEl.append(this._overflowBtn);
    this._tbNav = new ListNav(this.toolbarEl, { items: '.o-editor-btn:not([disabled]):not([hidden]), .o-editor-tb-more:not([hidden])', orientation: 'horizontal', loop: true });
    on(this.toolbarEl, 'keydown', e => this._tbNav.handle(e));
    this._setToolbarDisabled(this.isDisabled || this.readonly);
    this._roToolbar?.();
    this._roToolbar = observeResize(this.toolbarEl, () => this._layoutToolbar());
    requestAnimationFrame(() => this._layoutToolbar());
  },
  _makeTbButton(id) {
    if (id === 'blockType') return this._makeBlockTypeButton();
    if (id === 'align') return this._makeAlignButton();
    const spec = ED_TB[id];
    if (!spec) return h('span');
    const label = this.t('editor.' + spec.label) + (spec.shortcut ? ' (' + keyLabel(spec.shortcut) + ')' : '');
    const btn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm o-editor-btn', 'data-cmd': id, tabindex: '-1', 'aria-label': label, title: label }, edIcon(spec.icon));
    if (ED_MARK_IDS.includes(id) || id === 'link') btn.setAttribute('aria-pressed', 'false');
    on(btn, 'mousedown', e => e.preventDefault());
    on(btn, 'click', () => this._runTbCommand(id, btn));
    return btn;
  },
  _makeBlockTypeButton() {
    const btn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm o-editor-btn o-editor-blocktype', 'data-cmd': 'blockType', tabindex: '-1', 'aria-haspopup': 'true', title: this.t('editor.blockType') },
      h('span', { class: 'o-editor-blocktype-label' }, this.t('editor.paragraph')), raw(String(icon('chevron-down'))));
    on(btn, 'mousedown', e => e.preventDefault());
    on(btn, 'click', () => this._openBlockTypeMenu(btn));
    this._blockTypeBtn = btn;
    return btn;
  },
  _makeAlignButton() {
    const btn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm o-editor-btn o-editor-align', 'data-cmd': 'align', tabindex: '-1', 'aria-label': t('editor.align'), title: t('editor.align') }, edIcon('align-left'));
    on(btn, 'mousedown', e => e.preventDefault());
    on(btn, 'click', () => this._openAlignMenu(btn));
    this._alignBtn = btn;
    return btn;
  },
  _runTbCommand(id, btn) {
    if (id === 'link') return void this._openLinkPopover(btn);
    if (id === 'image') return void this._openImagePopover(btn);
    if (id === 'table') return void this._openTablePopover(btn);
    if (id === 'color') return void this._openColorPopover(btn, 'color');
    if (id === 'highlight') return void this._openColorPopover(btn, 'highlight');
    if (id === 'emoji') return void this._openEmojiPicker(btn);
    if (id === 'source') return void this.toggleSourceView();
    if (id === 'fullscreen') return void this.toggleFullscreen();
    if (id === 'blockType') return void this._openBlockTypeMenu(btn);
    if (id === 'align') return void this._openAlignMenu(btn);
    if (id === 'undo') { this.root.focus({ preventScroll: true }); return void this.undo(); }
    if (id === 'redo') { this.root.focus({ preventScroll: true }); return void this.redo(); }
    this.exec(id);
  },
  _setToolbarDisabled(disabled, keep = []) {
    this.toolbarEl.querySelectorAll('.o-editor-btn').forEach(btn => { btn.disabled = disabled && !keep.includes(btn.dataset.cmd); });
  },
  _layoutToolbar() {
    const bar = this.toolbarEl, more = this._overflowBtn;
    if (!bar || !bar.isConnected || bar.hidden) return;
    const groups = [...bar.querySelectorAll('.o-editor-tb-group')];
    groups.forEach(g => { g.hidden = false; });
    more.hidden = true;
    more.__hidden = [];
    if (bar.scrollWidth <= bar.clientWidth + 1) return;
    for (let i = groups.length - 1; i >= 0 && bar.scrollWidth > bar.clientWidth; i--) {
      groups[i].hidden = true;
      more.__hidden.unshift(groups[i]);
      more.hidden = false;
    }
  },
  _openOverflowMenu() {
    const hidden = this._overflowBtn.__hidden || [];
    const items = [];
    hidden.forEach((g, gi) => {
      [...g.children].forEach(btn => { const id = btn.dataset.cmd; if (id && ED_TB[id]) items.push({ id, label: btn.getAttribute('aria-label') || btn.title, icon: edIconEl(ED_TB[id].icon), _btn: btn }); });
      if (gi < hidden.length - 1) items.push('-');
    });
    if (!items.length) return;
    O.editorKit.menu(this._overflowBtn, items, { label: t('editor.moreTools'), owner: this, onSelect: it => this._runTbCommand(it.id, it._btn) });
  },
  _retextToolbar() { this._buildToolbar(); },

  /* ── toolbar / bubble state ──────────────────────────────────────── */
  _paintToolbarState() {
    if (!this.toolbarEl) return;
    ED_MARK_IDS.forEach(id => { const btn = this.toolbarEl.querySelector(`[data-cmd="${id}"]`); if (btn) btn.setAttribute('aria-pressed', String(this.isActive(id))); });
    const linkBtn = this.toolbarEl.querySelector('[data-cmd="link"]');
    if (linkBtn) linkBtn.setAttribute('aria-pressed', String(this.isActive('link')));
    const undoBtn = this.toolbarEl.querySelector('[data-cmd="undo"]'), redoBtn = this.toolbarEl.querySelector('[data-cmd="redo"]');
    if (undoBtn) undoBtn.disabled = !this.canUndo || this.isDisabled || this.readonly;
    if (redoBtn) redoBtn.disabled = !this.canRedo || this.isDisabled || this.readonly;
    if (this._blockTypeBtn) {
      const r = this.range();
      const block = r && textBlockOf(r.startContainer, this.root);
      const label = block && /^H[1-4]$/.test(block.nodeName) ? this.t('editor.heading', { level: +block.nodeName[1] }) : this.t('editor.paragraph');
      this._blockTypeBtn.querySelector('.o-editor-blocktype-label').textContent = label;
    }
    this._paintBubbleState();
  },
  _onSelectionChange() {
    if (!this.isConnected) return;
    this._paintToolbarState();
    if (!this._focused) return this._hideBubble();
    const r = this.range();
    if (!r || r.collapsed) return this._hideBubble();
    this._showBubble(r);
  },
  _buildBubble() {
    this._bubbleBuilt = true;
    const mk = id => {
      const spec = ED_TB[id];
      const label = this.t('editor.' + spec.label);
      const b = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-xs', 'data-cmd': id, 'aria-label': label, title: label }, edIcon(spec.icon));
      if (ED_MARK_IDS.includes(id) || id === 'link') b.setAttribute('aria-pressed', 'false');
      on(b, 'mousedown', e => e.preventDefault());
      on(b, 'click', () => this._runTbCommand(id, b));
      return b;
    };
    ['bold', 'italic', 'underline', 'strike', 'code'].forEach(id => this.bubbleEl.append(mk(id)));
    this.bubbleEl.append(h('span', { class: 'o-editor-bubble-sep' }));
    this.bubbleEl.append(mk('link'), mk('clear'));
  },
  _showBubble(r) {
    if (!this._bubbleBuilt) this._buildBubble();
    const rect = r.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return this._hideBubble();
    if (this.bubbleEl.hidden) { portal(this.bubbleEl, this); this.bubbleEl.hidden = false; }
    place(this.bubbleEl, { getBoundingClientRect: () => rect }, { placement: 'top', offset: 8, flip: true, fallback: ['bottom'] });
    this._paintBubbleState();
  },
  _hideBubble() { if (this.bubbleEl && !this.bubbleEl.hidden) this.bubbleEl.hidden = true; },
  _paintBubbleState() {
    if (!this._bubbleBuilt) return;
    [...ED_MARK_IDS, 'link'].forEach(id => { const b = this.bubbleEl.querySelector(`[data-cmd="${id}"]`); if (b) b.setAttribute('aria-pressed', String(this.isActive(id))); });
  },

  /* ── block type & align menus ────────────────────────────────────── */
  _openBlockTypeMenu(anchor) {
    const items = [
      { id: 'paragraph', label: this.t('editor.paragraph'), icon: edIconEl('pilcrow') },
      ...[1, 2, 3, 4].map(n => ({ id: 'h' + n, label: this.t('editor.heading', { level: n }), icon: edIconEl('heading') })),
    ];
    O.editorKit.menu(anchor, items, { label: t('editor.blockType'), owner: this, onSelect: it => { this.root.focus({ preventScroll: true }); it.id === 'paragraph' ? this.exec('paragraph') : this.exec('heading', +it.id[1]); } });
  },
  _openAlignMenu(anchor) {
    const items = ['left', 'center', 'right', 'justify'].map(v => ({ id: v, label: this.t('editor.align' + cap(v)), icon: edIconEl('align-' + v) }));
    O.editorKit.menu(anchor, items, { label: t('editor.align'), owner: this, onSelect: it => { this.root.focus({ preventScroll: true }); this.exec('align', it.id); } });
  },

  /* ── selection save/restore across popovers ─────────────────────── */
  _savePopSel() { const r = this.range(); this._savedRange = r ? r.cloneRange() : null; },
  _restorePopSel() { if (this._savedRange) { try { setRange(this._savedRange); } catch {} } },

  /* ── link popover ─────────────────────────────────────────────────── */
  _openLinkPopover(anchor) {
    this._savePopSel();
    const T = k => this.t('editor.' + k);
    const r = this.range();
    const existing = r && linkAt(this.root, r);
    const showText = !existing && !!r && r.collapsed;
    const urlInput = h('input', { class: 'o-input o-input-sm', type: 'text', placeholder: 'https://example.com', autocomplete: 'off', value: existing ? existing.getAttribute('href') : '' });
    const textInput = h('input', { class: 'o-input o-input-sm', type: 'text', placeholder: T('linkText'), value: '' });
    const newTab = h('input', { type: 'checkbox' });
    if (existing && existing.target === '_blank') newTab.checked = true;
    const err = h('div', { class: 'o-editor-pop-error', hidden: true }, T('invalidUrl'));
    const body = h('div', { class: 'o-editor-pop' },
      h('div', { class: 'o-field' }, h('label', { class: 'o-label' }, T('url')), urlInput),
      showText ? h('div', { class: 'o-field' }, h('label', { class: 'o-label' }, T('linkText')), textInput) : null,
      h('label', { class: 'o-check' }, newTab, h('span', {}, T('newTab'))),
      err,
      h('div', { class: 'o-editor-pop-actions' },
        existing ? h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', 'data-act': 'unlink' }, T('unlink')) : null,
        h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm', 'data-act': 'apply' }, t('common.apply'))));
    const pop = O.editorKit.popover(anchor || this.root, body, { label: T('insertLink'), owner: this, placement: 'bottom-start', focus: urlInput });
    const apply = () => {
      this._restorePopSel();
      const ok = this.exec('link', { href: urlInput.value.trim(), text: showText ? textInput.value : undefined, newTab: newTab.checked });
      if (!ok) { err.hidden = false; urlInput.classList.add('is-invalid'); urlInput.focus(); return; }
      pop.close('done');
    };
    on(urlInput, 'input', () => { err.hidden = true; urlInput.classList.remove('is-invalid'); });
    on(body, 'click', '[data-act]', (e, b) => { if (b.dataset.act === 'unlink') { this._restorePopSel(); this.exec('unlink'); pop.close('done'); } else apply(); });
    on(body, 'keydown', e => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); apply(); } });
  },

  /* ── image popover + upload pipeline ─────────────────────────────── */
  _openImagePopover(anchor) {
    this._savePopSel();
    const T = k => this.t('editor.' + k);
    const tabs = h('div', { class: 'o-editor-pop-tabs', role: 'tablist' },
      h('button', { type: 'button', class: 'o-editor-pop-tab is-active', role: 'tab', 'data-tab': 'upload' }, T('upload')),
      h('button', { type: 'button', class: 'o-editor-pop-tab', role: 'tab', 'data-tab': 'url' }, T('fromUrl')));
    const chooseBtn = h('button', { type: 'button', class: 'o-btn o-btn-sm' }, raw(String(icon('upload'))), T('chooseFile'));
    const uploadPane = h('div', { class: 'o-editor-pop-pane', 'data-pane': 'upload' }, chooseBtn, h('p', { class: 'o-editor-pop-hint' }, T('dropHint')));
    const urlInput = h('input', { class: 'o-input o-input-sm', type: 'text', placeholder: T('imageUrl') });
    const urlBtn = h('button', { type: 'button', class: 'o-btn o-btn-sm o-btn-primary' }, t('editor.insert'));
    const urlPane = h('div', { class: 'o-editor-pop-pane', 'data-pane': 'url', hidden: true }, urlInput, urlBtn);
    const altInput = h('input', { class: 'o-input o-input-sm', type: 'text', placeholder: T('alt'), 'aria-label': T('alt') });
    const body = h('div', { class: 'o-editor-pop o-editor-pop-image' }, tabs, uploadPane, urlPane, h('div', { class: 'o-field' }, h('label', { class: 'o-label' }, T('alt')), altInput));
    const pop = O.editorKit.popover(anchor || this.root, body, { label: T('insertImage'), owner: this, placement: 'bottom-start', focus: chooseBtn });
    this._imagePopClose = () => pop.close('done');
    on(tabs, 'click', '.o-editor-pop-tab', (e, b) => {
      tabs.querySelectorAll('.o-editor-pop-tab').forEach(x => x.classList.toggle('is-active', x === b));
      uploadPane.hidden = b.dataset.tab !== 'upload'; urlPane.hidden = b.dataset.tab !== 'url';
    });
    on(chooseBtn, 'click', () => this.fileInput.click());
    on(altInput, 'input', () => { this._pendingAlt = altInput.value; });
    on(urlBtn, 'click', () => {
      const src = urlInput.value.trim();
      if (!src) { urlInput.classList.add('is-invalid'); urlInput.focus(); return; }
      this._restorePopSel();
      this.root.focus({ preventScroll: true });
      this.exec('image', { src, alt: altInput.value });
      pop.close('done');
    });
  },
  async _uploadAndInsert(file, alt) {
    if (!file || !/^image\//.test(file.type)) return;
    const useAlt = alt != null ? alt : (this._pendingAlt || '');
    this._pendingAlt = '';
    this._imagePopClose?.(); this._imagePopClose = null;
    let src = null;
    try {
      if (isFn(this.uploadImage)) src = await this.uploadImage(file);
      else src = await new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = reject; fr.readAsDataURL(file); });
    } catch { announce(this.t('editor.uploadFailed')); this.emit('image-upload', { file, error: true }); return; }
    if (!src) return;
    this.emit('image-upload', { file, src, alt: useAlt });
    this._restorePopSel();
    this.root.focus({ preventScroll: true });
    this.exec('image', { src, alt: useAlt });
  },
  _onPaste(e) {
    if (this.isDisabled || this.readonly) return;
    const dt = e.clipboardData;
    if (!dt) return;
    const files = [...(dt.files || [])].filter(f => /^image\//.test(f.type));
    const htmlData = dt.getData('text/html');
    if (files.length && !htmlData) { e.preventDefault(); files.forEach(f => this._uploadAndInsert(f, '')); return; }
    e.preventDefault();
    if (htmlData) { this.insertHTML(cleanPaste(htmlData, { keepColors: true, dirAuto: false })); return; }
    const text = dt.getData('text/plain');
    if (text) this.insertText(text);
  },
  _onDrop(e) {
    if (this.isDisabled || this.readonly) return;
    const files = e.dataTransfer ? [...e.dataTransfer.files].filter(f => /^image\//.test(f.type)) : [];
    if (!files.length) return;
    e.preventDefault();
    const r = doc.caretRangeFromPoint ? doc.caretRangeFromPoint(e.clientX, e.clientY) : (doc.caretPositionFromPoint ? (() => { const p = doc.caretPositionFromPoint(e.clientX, e.clientY); if (!p) return null; const rr = doc.createRange(); rr.setStart(p.offsetNode, p.offset); rr.collapse(true); return rr; })() : null);
    if (r && this.root.contains(r.startContainer)) setRange(r);
    files.forEach(f => this._uploadAndInsert(f, ''));
  },

  /* ── image selection & resize handles ────────────────────────────── */
  _selectImage(img) {
    if (this._selectedImage === img) return;
    this._deselectImage();
    this._selectedImage = img;
    img.classList.add('is-selected');
    const wrap = h('div', { class: 'o-editor-imgtools', contenteditable: 'false' });
    ['nw', 'ne', 'sw', 'se'].forEach(pos => wrap.append(h('span', { class: 'o-editor-imghandle o-editor-imghandle-' + pos, 'data-pos': pos })));
    this.root.appendChild(wrap);
    this._imgTools = wrap;
    this._positionImgTools();
    on(wrap, 'pointerdown', '.o-editor-imghandle', (e, handle) => this._resizeStart(e, handle, img));
  },
  _deselectImage() { if (this._selectedImage) this._selectedImage.classList.remove('is-selected'); this._selectedImage = null; if (this._imgTools) { this._imgTools.remove(); this._imgTools = null; } },
  _positionImgTools() {
    if (!this._selectedImage || !this._imgTools) return;
    const rect = this._selectedImage.getBoundingClientRect(), host = this.root.getBoundingClientRect();
    css(this._imgTools, { left: (rect.left - host.left + this.root.scrollLeft) + 'px', top: (rect.top - host.top + this.root.scrollTop) + 'px', width: rect.width + 'px', height: rect.height + 'px' });
  },
  _resizeStart(e, handle, img) {
    e.preventDefault();
    const startX = e.clientX, startW = img.getBoundingClientRect().width, dir = handle.dataset.pos.endsWith('w') ? -1 : 1;
    const onMove = ev => { img.setAttribute('width', String(Math.max(40, Math.round(startW + (ev.clientX - startX) * dir)))); this._positionImgTools(); };
    const onUp = () => { win.removeEventListener('pointermove', onMove); win.removeEventListener('pointerup', onUp); this._afterEdit('cmd'); };
    win.addEventListener('pointermove', onMove);
    win.addEventListener('pointerup', onUp, { once: true });
  },

  /* ── table popover (insert grid + contextual operations) ─────────── */
  _openTablePopover(anchor) {
    const r = this.range();
    if (r && cellInfo(this.root, r.startContainer)) return this._openTableOpsMenu(anchor);
    this._savePopSel();
    const T = k => this.t('editor.' + k);
    const SIZE = 8;
    const grid = h('div', { class: 'o-editor-tgrid', role: 'grid', tabindex: '0', 'aria-label': T('insertTable') });
    const cells = [];
    for (let ri = 0; ri < SIZE; ri++) for (let ci = 0; ci < SIZE; ci++) { const c = h('div', { class: 'o-editor-tgrid-cell', 'data-r': ri, 'data-c': ci }); cells.push(c); grid.append(c); }
    const label = h('div', { class: 'o-editor-tgrid-label', 'aria-live': 'polite' }, t('editor.tableSize', { rows: 3, cols: 3 }));
    let cur = { r: 2, c: 2 };
    const paint = (r1, c1) => { cur = { r: r1, c: c1 }; cells.forEach(c => c.classList.toggle('is-on', +c.dataset.r <= r1 && +c.dataset.c <= c1)); label.textContent = t('editor.tableSize', { rows: r1 + 1, cols: c1 + 1 }); };
    paint(2, 2);
    const body = h('div', { class: 'o-editor-pop' }, grid, label);
    const pop = O.editorKit.popover(anchor || this.root, body, { label: T('insertTable'), owner: this, placement: 'bottom-start', focus: grid });
    const choose = (r1, c1) => {
      this._restorePopSel(); this.root.focus({ preventScroll: true });
      this.exec('table', { rows: r1 + 1, cols: c1 + 1 });
      pop.close('done');
    };
    on(grid, 'mousemove', '.o-editor-tgrid-cell', (e, c) => paint(+c.dataset.r, +c.dataset.c));
    on(grid, 'click', '.o-editor-tgrid-cell', (e, c) => choose(+c.dataset.r, +c.dataset.c));
    on(grid, 'keydown', e => {
      const map = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
      if (map[e.key]) { e.preventDefault(); const [dr, dc] = map[e.key]; paint(clamp(cur.r + dr, 0, SIZE - 1), clamp(cur.c + dc, 0, SIZE - 1)); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(cur.r, cur.c); }
    });
  },
  _openTableOpsMenu(anchor) {
    const T = k => this.t('editor.' + k);
    const items = [
      { id: 'rowAbove', label: T('rowAbove'), icon: edIconEl('plus') },
      { id: 'rowBelow', label: T('rowBelow'), icon: edIconEl('plus') },
      { id: 'colBefore', label: T('colBefore'), icon: edIconEl('plus') },
      { id: 'colAfter', label: T('colAfter'), icon: edIconEl('plus') },
      '-',
      { id: 'toggleHeader', label: T('headerRow'), icon: edIconEl('table') },
      '-',
      { id: 'deleteRow', label: T('deleteRow'), icon: edIconEl('trash'), danger: true },
      { id: 'deleteCol', label: T('deleteCol'), icon: edIconEl('trash'), danger: true },
      { id: 'deleteTable', label: T('deleteTable'), icon: edIconEl('trash'), danger: true },
    ];
    O.editorKit.menu(anchor, items, { label: T('tableMenu'), owner: this, onSelect: it => this.exec(it.id) });
  },

  /* ── color / highlight popover ────────────────────────────────────── */
  _openColorPopover(anchor, kind) {
    this._savePopSel();
    const T = k => this.t('editor.' + k);
    const swatches = h('div', { class: 'o-editor-swatches' });
    ED_COLORS.forEach(c => swatches.append(h('button', { type: 'button', class: 'o-editor-swatch', style: { '--sw': c }, 'data-color': c, 'aria-label': c })));
    const custom = h('input', { type: 'color', class: 'o-editor-swatch-custom', 'aria-label': T('customColor'), value: '#000000' });
    const reset = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', 'data-act': 'reset' }, kind === 'color' ? T('defaultColor') : T('noHighlight'));
    const body = h('div', { class: 'o-editor-pop o-editor-pop-color' }, swatches, h('div', { class: 'o-editor-swatch-row' }, custom, reset));
    const pop = O.editorKit.popover(anchor, body, { label: kind === 'color' ? T('color') : T('highlight'), owner: this, placement: 'bottom-start' });
    const apply = v => { this._restorePopSel(); this.root.focus({ preventScroll: true }); this.exec(kind, v); pop.close('done'); };
    on(swatches, 'click', '.o-editor-swatch', (e, b) => apply(b.dataset.color));
    on(custom, 'input', () => apply(custom.value));
    on(reset, 'click', () => apply(''));
  },

  /* ── emoji picker ─────────────────────────────────────────────────── */
  _openEmojiPicker(anchor) {
    if (!O.mentions || !O.mentions.emoji) return;
    this._savePopSel();
    O.mentions.emoji.picker(anchor || this.root, {
      owner: this,
      onSelect: ch => { this._restorePopSel(); this.root.focus({ preventScroll: true }); this.insertText(ch); },
    });
  },

  /* ── fullscreen ───────────────────────────────────────────────────── */
  /** toggleFullscreen(force?) — expands the editor to fill the viewport. */
  toggleFullscreen(force) {
    const on2 = force ?? !this._fullscreen;
    if (on2 === this._fullscreen) return;
    this._fullscreen = on2;
    this.classList.toggle('is-fullscreen', on2);
    if (on2) this._unlockScroll = lockScroll(); else { this._unlockScroll?.(); this._unlockScroll = null; }
    const btn = this.toolbarEl.querySelector('[data-cmd="fullscreen"]');
    if (btn) {
      btn.innerHTML = String(edIcon(on2 ? 'minimize' : 'maximize'));
      const label = this.t('editor.' + (on2 ? 'exitFullscreen' : 'fullscreen'));
      btn.setAttribute('aria-label', label); btn.title = label; btn.setAttribute('aria-pressed', String(on2));
    }
    this.emit(on2 ? 'fullscreen' : 'fullscreen-exit');
    requestAnimationFrame(() => this._layoutToolbar());
  },

  /* ── source (HTML) view ───────────────────────────────────────────── */
  /** toggleSourceView(force?) — shows/hides the raw HTML editor. */
  toggleSourceView(force) {
    const show = force ?? !this._sourceOpen;
    if (show === this._sourceOpen) return;
    show ? this._openSourceView() : this._closeSourceView();
  },
  _openSourceView() {
    this._sourceOpen = true;
    const htmlSrc = prettyHTML(this.value || '');
    let field;
    if (customElements.get('o-code-editor')) { field = doc.createElement('o-code-editor'); field.setAttribute('language', 'html'); field.minLines = 8; field.value = htmlSrc; }
    else { field = h('textarea', { class: 'o-textarea o-editor-source-fallback', spellcheck: 'false' }); field.value = htmlSrc; }
    this._sourceField = field;
    this.wrapEl.hidden = true;
    this._sourceWrap = h('div', { class: 'o-editor-source' }, field,
      h('div', { class: 'o-editor-source-actions' },
        h('button', { type: 'button', class: 'o-btn o-btn-sm', 'data-act': 'cancel' }, t('common.cancel')),
        h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm', 'data-act': 'apply' }, t('common.apply'))));
    this.wrapEl.after(this._sourceWrap);
    on(this._sourceWrap, 'click', '[data-act]', (e, b) => (b.dataset.act === 'apply' ? this._applySourceView() : this._closeSourceView()));
    const srcBtn = this.toolbarEl.querySelector('[data-cmd="source"]');
    if (srcBtn) srcBtn.setAttribute('aria-pressed', 'true');
    this._setToolbarDisabled(true, ['source']);
    queueMicrotask(() => field.focus?.());
  },
  _applySourceView() {
    const val = this._sourceField ? this._sourceField.value : '';
    this._loadHTML(val);
    this._afterEdit('cmd');
    this._closeSourceView();
  },
  _closeSourceView() {
    this._sourceOpen = false;
    this._sourceWrap?.remove();
    this._sourceWrap = null; this._sourceField = null;
    this.wrapEl.hidden = false;
    const srcBtn = this.toolbarEl.querySelector('[data-cmd="source"]');
    if (srcBtn) srcBtn.setAttribute('aria-pressed', 'false');
    this._setToolbarDisabled(this.isDisabled || this.readonly);
  },
});

define('o-editor', OEditor);
