/* <o-theme-builder presets='[{"name":"Indigo","primary":"#4f46e5"}]'> — a live editor on top of Orion.theme:
 * brand + semantic colors (<o-colorpicker> when the `inputs` package is present, native color inputs
 * otherwise), generated palettes (Orion.color.palette), neutral-surface tint, a radius scale, font family +
 * base size, density, shadow intensity, sidebar style, side-by-side light/dark previews built from real
 * components, a WCAG contrast checker with suggested fixes, presets, JSON/CSS import-export and
 * "save as tenant" (theme.register + use). Every change is applied live via Orion.theme.set()/setFontScale().
 *   Props: presets (Array, defaults to the 8 built-in presets) texts
 *   Methods: applyPreset(name) exportJSON() exportCSS() importJSON(json) saveAsTenant(name) reset()
 *   Events: o-change {draft}, o-preset {name}, o-save-tenant {name, tokens}, o-reset
 */
i18n.add('en', {
  themebuilder: {
    presets: 'Presets', brandColors: 'Brand & semantic colors', primary: 'Primary', secondary: 'Secondary',
    success: 'Success', danger: 'Danger', warning: 'Warning', info: 'Info', surfaces: 'Surfaces', neutralTint: 'Neutral tint',
    shape: 'Shape & density', radius: 'Corner radius', density: 'Density', compact: 'Compact', comfortable: 'Comfortable', spacious: 'Spacious',
    typography: 'Typography', font: 'Font family', fontSize: 'Base size & scale', shadow: 'Shadow intensity',
    sidebar: 'Sidebar style', light: 'Light', dark: 'Dark', branded: 'Branded',
    preview: 'Live preview', contrastTitle: 'WCAG contrast', color: 'Color', ratio: 'Ratio', fix: 'Use suggested',
    importExport: 'Import & export', exportJson: 'Export JSON', exportCss: 'Export CSS', copy: 'Copy', copied: 'Copied',
    importJson: 'Import JSON', importPlaceholder: 'Paste exported JSON…', apply: 'Apply', saveTenant: 'Save as tenant',
    tenantName: 'Tenant name', save: 'Save & activate', reset: 'Reset to defaults', tenantSaved: '"{name}" theme saved and active',
    menu: 'Menu', reports: 'Reports', settings: 'Settings', revenue: 'Revenue', live: 'Live', save2: 'Save', cancel: 'Cancel', active: 'Active', pending: 'Pending',
  },
});

class OThemeBuilder extends OElement {
  static props = { presets: { type: Array, default: () => [] }, texts: Object };
  setup() {
    this.classList.add('o-theme-builder');
    this.draft = tbDefaultDraft();
    this._applying = false;
    this.controlsEl = h('div', { class: 'o-tb-controls' });
    this.previewLight = this._buildPreviewPane('light');
    this.previewDark = this._buildPreviewPane('dark');
    this.previewsEl = h('div', { class: 'o-tb-previews' }, this.previewLight.root, this.previewDark.root);
    this.contrastEl = h('div', { class: 'o-tb-contrast' });
    this.mainEl = h('div', { class: 'o-tb-main' }, this.previewsEl, this.contrastEl);
    this.append(this.controlsEl, this.mainEl);
    this._renderControls();
    on(this.controlsEl, 'input change', '[data-tb]', (e, el) => this._onFieldInput(el));
    on(this.controlsEl, 'click', '[data-tb-set]', (e, el) => this._onSet(el));
    on(this.controlsEl, 'click', '[data-tb-action]', (e, el) => this._onAction(el));
    on(this.contrastEl, 'click', '[data-tb-action]', (e, el) => this._onAction(el));
  }
  connected() { this._offTheme = O.theme.onChange(() => { if (!this._applying) this.applyDraft(); }); this.applyDraft(); }
  disconnected() { this._offTheme?.(); }
  update(changed) { if (changed.has('presets') || changed.has('init')) this._renderPresets(); }
  get presetList() { return toArr(this.presets).length ? toArr(this.presets) : TB_PRESETS; }

  /* ── preview pane ── */
  _buildPreviewPane(mode) {
    const t2 = k => this.t('themebuilder.' + k);
    const row = (name, badgeCls, badgeText) => h('tr', null, h('td', null, name), h('td', null, h('span', { class: 'o-badge ' + badgeCls }, badgeText)));
    const sidebar = h('div', { class: 'o-tb-preview-sidebar', style: 'background:var(--o-sidebar-bg);color:var(--o-sidebar-text)' },
      h('span', { class: 'o-tb-sidebar-brand' }), h('span', null, t2('menu')), h('span', null, t2('reports')), h('span', null, t2('settings')));
    const cardHeader = h('div', { class: 'o-card-header' }, h('h3', { class: 'o-card-title' }, t2('revenue')), h('span', { class: 'o-badge o-badge-soft-primary' }, t2('live')));
    const actions = h('div', { class: 'o-tb-preview-actions' },
      h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm' }, t2('save2')),
      h('button', { type: 'button', class: 'o-btn o-btn-sm' }, t2('cancel')));
    const table = h('table', { class: 'o-table o-table-sm' }, h('tbody', null,
      row('Ada Lovelace', 'o-badge-soft-success', t2('active')),
      row('Grace Hopper', 'o-badge-soft-warning', t2('pending'))));
    const search = h('input', { class: 'o-input o-input-sm', placeholder: 'Search…', readonly: true });
    const card = h('div', { class: 'o-card' }, cardHeader, h('div', { class: 'o-card-body' }, search, actions, table));
    const content = h('div', { class: 'o-tb-preview-content' }, card);
    const stage = h('div', { class: `o-tb-stage o-theme-${mode}` }, sidebar, content);
    const label = h('div', { class: 'o-tb-preview-label' }, mode === 'light' ? this.t('themebuilder.light') : this.t('themebuilder.dark'));
    const root = h('div', { class: 'o-tb-preview' }, label, stage);
    return { root, stage };
  }

  /* ── controls ── */
  _renderControls() {
    const t2 = k => this.t('themebuilder.' + k);
    this.presetsEl = h('div', { class: 'o-tb-presets' });
    this.tenantInput = h('input', { class: 'o-input o-input-sm', placeholder: t2('tenantName') });
    this.jsonOut = h('textarea', { class: 'o-textarea o-tb-code', readonly: true, rows: 6 });
    this.cssOut = h('textarea', { class: 'o-textarea o-tb-code', readonly: true, rows: 6 });
    this.jsonIn = h('textarea', { class: 'o-textarea o-tb-code', rows: 4, placeholder: t2('importPlaceholder') });
    this.controlsEl.replaceChildren(
      this._section(t2('presets'), this.presetsEl),
      this._section(t2('brandColors'), h('div', { class: 'o-tb-colors' }, TB_SEMANTIC.map(k => this._colorField(k)))),
      this._section(t2('surfaces'), this._field(t2('neutralTint'), h('input', { type: 'range', class: 'o-range', min: 0, max: 100, value: 0, 'data-tb': 'neutralTint' }))),
      this._section(t2('shape'),
        this._field(t2('radius'), h('input', { type: 'range', class: 'o-range', min: 0, max: 24, value: 8, 'data-tb': 'radius' })),
        this._field(t2('density'), this._segmented('density', ['compact', 'comfortable', 'spacious'], t2))),
      this._section(t2('typography'),
        this._field(t2('font'), h('select', { class: 'o-select', 'data-tb': 'font' },
          h('option', { value: 'Inter, ui-sans-serif, system-ui, sans-serif' }, 'Inter (default)'),
          h('option', { value: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif' }, 'Segoe UI'),
          h('option', { value: 'Georgia, "Times New Roman", serif' }, 'Georgia (serif)'),
          h('option', { value: '"Poppins", ui-sans-serif, sans-serif' }, 'Poppins'),
          h('option', { value: 'ui-monospace, "JetBrains Mono", monospace' }, 'Monospace'))),
        this._field(t2('fontSize'), h('input', { type: 'range', class: 'o-range', min: 85, max: 130, value: 100, 'data-tb': 'fontScale', 'data-tb-percent': '' }))),
      this._section(t2('shadow'), h('input', { type: 'range', class: 'o-range', min: 0, max: 100, value: 50, 'data-tb': 'shadowIntensity' })),
      this._section(t2('sidebar'), this._segmented('sidebarStyle', ['light', 'dark', 'branded'], t2)),
      this._section(t2('importExport'),
        h('div', { class: 'o-tb-row' }, h('button', { type: 'button', class: 'o-btn o-btn-sm', 'data-tb-action': 'export-json' }, t2('exportJson')), h('button', { type: 'button', class: 'o-btn o-btn-sm', 'data-tb-action': 'export-css' }, t2('exportCss'))),
        this.jsonOut, this.cssOut,
        h('label', { class: 'o-label o-mt-2' }, t2('importJson')), this.jsonIn,
        h('button', { type: 'button', class: 'o-btn o-btn-sm', 'data-tb-action': 'import-json' }, t2('apply'))),
      this._section(t2('saveTenant'), h('div', { class: 'o-tb-row' }, this.tenantInput, h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm', 'data-tb-action': 'save-tenant' }, t2('save')))),
      h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-block o-tb-reset', 'data-tb-action': 'reset' }, t2('reset')));
    this._renderPresets();
  }
  _section(title, ...content) { return h('section', { class: 'o-tb-section' }, h('h3', { class: 'o-tb-section-title' }, title), ...content); }
  _field(label, control) { return h('div', { class: 'o-tb-field' }, h('div', { class: 'o-tb-field-head' }, h('label', { class: 'o-label' }, label), h('output', { class: 'o-tb-field-value' })), control); }
  _segmented(path, values, t2) {
    return h('div', { class: 'o-segmented o-tb-segmented' }, values.map(v => h('button', { type: 'button', 'data-tb-set': path, 'data-value': v }, t2(v))));
  }
  _colorField(key) {
    const t2 = k => this.t('themebuilder.' + k);
    const useCP = !!customElements.get('o-colorpicker');
    const input = useCP
      ? h('o-colorpicker', { value: this.draft.colors[key], size: 'sm', 'data-tb': `colors.${key}` })
      : h('input', { type: 'color', class: 'o-tb-native-color', value: this.draft.colors[key], 'data-tb': `colors.${key}` });
    return h('div', { class: 'o-tb-colorfield' },
      h('label', { class: 'o-label' }, t2(key)), input,
      h('div', { class: 'o-tb-palette', 'data-palette': key }));
  }
  _renderPresets() {
    this.presetsEl.replaceChildren(...this.presetList.map(p => h('button', { type: 'button', class: 'o-tb-preset', 'data-tb-action': 'preset', 'data-name': p.name },
      h('span', { class: 'o-tb-preset-swatch', style: `background:${p.primary}` }), h('span', null, p.name))));
  }

  /* ── events ── */
  _onFieldInput(el) {
    const path = el.dataset.tb;
    const v = el.type === 'range' || el.type === 'number' ? +el.value : el.value;
    setPath(this.draft, path, v);
    const out = el.closest('.o-tb-field')?.querySelector('.o-tb-field-value');
    if (out) out.textContent = el.dataset.tbPercent !== undefined ? v + '%' : (el.type === 'range' ? v : '');
    this.applyDraft();
  }
  _onSet(el) {
    setPath(this.draft, el.dataset.tbSet, el.dataset.value);
    this._syncControls();
    this.applyDraft();
  }
  _onAction(el) {
    const a = el.dataset.tbAction;
    if (a === 'preset') this.applyPreset(el.dataset.name);
    else if (a === 'export-json') this.jsonOut.value = this.exportJSON();
    else if (a === 'export-css') this.cssOut.value = this.exportCSS();
    else if (a === 'import-json') this.importJSON(this.jsonIn.value);
    else if (a === 'save-tenant') this.saveAsTenant(this.tenantInput.value.trim());
    else if (a === 'reset') this.reset();
    else if (a === 'fix-contrast') { setPath(this.draft, `colors.${el.dataset.key}`, el.dataset.hex); this._syncControls(); this.applyDraft(); }
  }

  /* ── core: apply / palettes / contrast ── */
  applyDraft() {
    if (this._applying) return;
    this._applying = true;
    try {
      const d = this.draft, resolved = O.theme.resolved;
      const colorTokens = {}; TB_SEMANTIC.forEach(k => { if (d.colors[k]) colorTokens[k] = d.colors[k]; });
      O.theme.set({
        ...colorTokens, ...tbRadiusTokens(d.radius), ...tbDensityTokens(d.density),
        ...tbSidebarTokens(d.sidebarStyle, d.colors.primary), font: d.font,
        ...tbTintSurfaces(resolved, d.colors.primary, d.neutralTint), ...tbShadowTokens(resolved, d.shadowIntensity),
      });
      O.theme.setFontScale(d.fontScale / 100);
      O.theme.set({ ...tbTintSurfaces('light', d.colors.primary, d.neutralTint), ...tbShadowTokens('light', d.shadowIntensity) }, this.previewLight.stage);
      O.theme.set({ ...tbTintSurfaces('dark', d.colors.primary, d.neutralTint), ...tbShadowTokens('dark', d.shadowIntensity) }, this.previewDark.stage);
      this._paintPalettes();
      this._paintContrast();
      this.emit('change', { draft: clone(d) });
    } finally { this._applying = false; }
  }
  _paintPalettes() {
    TB_SEMANTIC.forEach(key => {
      const box = this.controlsEl.querySelector(`.o-tb-palette[data-palette="${key}"]`);
      if (!box) return;
      const pal = color.palette(this.draft.colors[key]);
      box.replaceChildren(...Object.entries(pal).map(([stop, hex]) => h('span', { class: 'o-tb-swatch', style: `background:${hex}`, title: `${stop} · ${hex}` })));
    });
  }
  _paintContrast() {
    const t2 = k => this.t('themebuilder.' + k);
    this.contrastEl.replaceChildren(
      h('h3', { class: 'o-tb-section-title' }, t2('contrastTitle')),
      h('div', { class: 'o-table-wrap' }, h('table', { class: 'o-table o-table-sm o-tb-contrast-table' },
        h('thead', null, h('tr', null, h('th', null, t2('color')), h('th', null, 'Aa'), h('th', null, t2('ratio')), h('th', null, 'WCAG'), h('th', null, ''))),
        h('tbody', null, TB_SEMANTIC.map(key => {
          const hex = this.draft.colors[key], info = tbContrastInfo(hex), pass = info.level === 'AA' || info.level === 'AAA';
          return h('tr', null,
            h('td', null, h('span', { class: 'o-swatch', style: `background:${hex}` }), ' ' + t2(key)),
            h('td', null, h('span', { class: 'o-badge', style: `background:${hex};color:${info.onColor};border-color:transparent` }, 'Aa')),
            h('td', null, info.ratio + ':1'),
            h('td', null, h('span', { class: cls('o-badge', pass ? 'o-badge-soft-success' : 'o-badge-soft-danger') }, info.level)),
            h('td', null, info.suggestion ? h('button', { type: 'button', class: 'o-btn o-btn-xs', 'data-tb-action': 'fix-contrast', 'data-key': key, 'data-hex': info.suggestion, title: info.suggestion }, t2('fix')) : null));
        })))));
  }
  _syncControls() {
    this.controlsEl.querySelectorAll('[data-tb]').forEach(el => {
      if (el === doc.activeElement) return;
      const path = el.dataset.tb, v = getPath(this.draft, path);
      if (v == null) return;
      el.value = v;
      const out = el.closest('.o-tb-field')?.querySelector('.o-tb-field-value');
      if (out) out.textContent = el.dataset.tbPercent !== undefined ? v + '%' : '';
    });
    this.controlsEl.querySelectorAll('[data-tb-set]').forEach(el => {
      const active = getPath(this.draft, el.dataset.tbSet) === el.dataset.value;
      el.classList.toggle('is-active', active); el.setAttribute('aria-pressed', String(active));
    });
  }

  /* ── public API ── */
  applyPreset(name) {
    const p = this.presetList.find(x => x.name === name);
    if (!p) return;
    Object.assign(this.draft.colors, { primary: p.primary, ...(p.secondary ? { secondary: p.secondary } : {}), ...(p.info ? { info: p.info } : {}) });
    if (p.radius != null) this.draft.radius = p.radius;
    if (p.density) this.draft.density = p.density;
    this._syncControls();
    this.applyDraft();
    this.emit('preset', { name });
  }
  exportJSON() { return JSON.stringify(this.draft, null, 2); }
  exportCSS() { return O.theme.exportCSS(); }
  importJSON(json) {
    const parsed = isStr(json) ? parseJSON(json, null) : json;
    if (!isObj(parsed)) return false;
    merge(this.draft, parsed);
    this._syncControls();
    this.applyDraft();
    return true;
  }
  saveAsTenant(name) {
    name = name || this.tenantInput.value.trim();
    if (!name) { this.tenantInput.focus(); return; }
    const d = this.draft, tokens = {};
    TB_SEMANTIC.forEach(k => { tokens[k] = d.colors[k]; });
    Object.assign(tokens, tbRadiusTokens(d.radius), tbDensityTokens(d.density), tbSidebarTokens(d.sidebarStyle, d.colors.primary), { font: d.font });
    O.theme.register(name, { ...tokens, brand: { name } });
    O.theme.use(name);
    announce(this.t('themebuilder.tenantSaved', { name }));
    this.emit('save-tenant', { name, tokens });
  }
  reset() {
    this.draft = tbDefaultDraft();
    O.theme.reset();
    this._syncControls();
    this.applyDraft();
    this.emit('reset', {});
  }
}
define('o-theme-builder', OThemeBuilder);
O.ThemeBuilder = OThemeBuilder;
