/* <o-preferences sections="appearance,accessibility,language,notifications" notifications='[…]'>
 * A preferences panel/page: theme mode, density, high contrast, font size (A-/A/A+ + slider), a
 * reduced-motion override, language (from Orion.i18n.locales()) with a live date/time preview, and
 * notification toggles. Persisted via Orion.prefs when the `services-b` package is present, otherwise
 * localStorage directly — either way through the same get/set helpers, so nothing else needs to change
 * when that package lands.
 *   Props: sections(Array,"appearance,accessibility,language,notifications") notifications(Array) texts
 *   Methods: reset()
 *   Events: o-change {key, value}, o-notification-change {key, value}
 */
i18n.add('en', {
  preferences: {
    title: 'Preferences', appearance: 'Appearance', accessibility: 'Accessibility', language: 'Language & region', notifications: 'Notifications',
    theme: 'Theme', light: 'Light', dark: 'Dark', auto: 'Auto', density: 'Density', compact: 'Compact', comfortable: 'Comfortable', spacious: 'Spacious',
    highContrast: 'High contrast', highContrastDesc: 'Stronger borders and focus rings',
    fontSize: 'Text size', reducedMotion: 'Motion', motionSystem: 'System', motionOn: 'Reduce', motionOff: 'Full',
    reducedMotionDesc: 'Reduce interface animations, regardless of your system setting',
    languageLabel: 'Language', preview: 'Preview', dateFormat: 'Date', timeFormat: 'Time', relativeFormat: 'Relative',
    resetAll: 'Reset all preferences',
  },
});

const PREFS_STORE_KEY = 'orion:preferences';
function prefGet(key, def) {
  if (O.prefs && isFn(O.prefs.get)) { const v = O.prefs.get(key); return v === undefined ? def : v; }
  const all = ls.get(PREFS_STORE_KEY, {}) || {};
  return key in all ? all[key] : def;
}
function prefSet(key, val) {
  if (O.prefs && isFn(O.prefs.set)) { O.prefs.set(key, val); return; }
  const all = ls.get(PREFS_STORE_KEY, {}) || {};
  all[key] = val;
  ls.set(PREFS_STORE_KEY, all);
}
const PREF_DENSITY = {
  compact: { h: '2rem', hSm: '1.625rem', hLg: '2.5rem' },
  comfortable: { h: '2.25rem', hSm: '1.875rem', hLg: '2.75rem' },
  spacious: { h: '2.625rem', hSm: '2.125rem', hLg: '3.125rem' },
};
function applyDensity(key) {
  const d = PREF_DENSITY[key] || PREF_DENSITY.comfortable;
  O.theme.set({ '--o-control-h': d.h, '--o-control-h-sm': d.hSm, '--o-control-h-lg': d.hLg });
}
function applyMotion(mode) {
  if (!isBrowser) return;
  doc.documentElement.classList.toggle('o-motion-reduce', mode === 'on');
  doc.documentElement.classList.toggle('o-motion-full', mode === 'off');
}

class OPreferences extends OElement {
  static props = {
    sections: { type: Array, default: () => ['appearance', 'accessibility', 'language', 'notifications'] },
    notifications: {
      type: Array, default: () => [
        { key: 'product', label: 'Product updates', description: 'New features and improvements' },
        { key: 'security', label: 'Security alerts', description: 'Sign-ins from a new device' },
        { key: 'digest', label: 'Weekly digest', description: 'A summary of your activity' },
      ],
    },
    texts: Object,
  };
  setup() {
    this.classList.add('o-preferences');
    this.root = h('div', { class: 'o-prefs-root' });
    this.append(this.root);
    on(this.root, 'click', '[data-pref-set]', (e, el) => this._setPref(el.dataset.prefSet, el.dataset.value));
    on(this.root, 'input', '[data-pref-range]', (e, el) => this._onRange(el));
    on(this.root, 'change', '[data-pref-select]', (e, el) => this._onSelect(el));
    on(this.root, 'change', '[data-pref-notif]', (e, el) => this._onNotif(el));
    on(this.root, 'change', '[data-pref-contrast]', (e, el) => this._setPref('contrast', el.checked));
  }
  connected() {
    this._density = prefGet('density', 'comfortable');
    this._motion = prefGet('motion', 'system');
    applyDensity(this._density);
    applyMotion(this._motion);
    this._offTheme = O.theme.onChange(() => this._paintLive());
    this._offLocale = bus.on('locale', () => this._paintLive());
    this.render();
  }
  disconnected() { this._offTheme?.(); this._offLocale?.(); }
  update(changed) { if (changed.has('sections') || changed.has('notifications') || changed.has('init')) this.render(); }

  render() {
    const secs = toArr(this.sections);
    const parts = [];
    if (secs.includes('appearance')) parts.push(this._appearanceSection());
    if (secs.includes('accessibility')) parts.push(this._accessibilitySection());
    if (secs.includes('language')) parts.push(this._languageSection());
    if (secs.includes('notifications')) parts.push(this._notificationsSection());
    parts.push(h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-block', onClick: () => this.reset() }, this.t('preferences.resetAll')));
    this.root.replaceChildren(...parts);
    this._paintLive();
  }
  _section(title, ...content) { return h('section', { class: 'o-prefs-section' }, h('h3', { class: 'o-prefs-title' }, title), ...content); }
  _row(label, desc, control) {
    return h('div', { class: 'o-prefs-row' }, h('div', { class: 'o-prefs-row-text' }, h('span', { class: 'o-prefs-row-label' }, label), desc ? h('span', { class: 'o-prefs-row-desc' }, desc) : null), control);
  }
  _segmented(path, values, labels) {
    return h('div', { class: 'o-segmented o-prefs-segmented', role: 'group' }, values.map(v => h('button', { type: 'button', 'data-pref-set': path, 'data-value': v }, labels[v])));
  }

  _appearanceSection() {
    const t2 = k => this.t('preferences.' + k);
    return this._section(t2('appearance'),
      this._row(t2('theme'), null, this._segmented('theme', ['light', 'dark', 'auto'], { light: t2('light'), dark: t2('dark'), auto: t2('auto') })),
      this._row(t2('density'), null, this._segmented('density', ['compact', 'comfortable', 'spacious'], { compact: t2('compact'), comfortable: t2('comfortable'), spacious: t2('spacious') })));
  }
  _accessibilitySection() {
    const t2 = k => this.t('preferences.' + k);
    return this._section(t2('accessibility'),
      this._row(t2('highContrast'), t2('highContrastDesc'), h('label', { class: 'o-switch' }, h('input', { type: 'checkbox', 'data-pref-contrast': '' }))),
      this._row(t2('fontSize'), null, h('div', { class: 'o-prefs-fontsize' },
        h('button', { type: 'button', class: 'o-btn o-btn-sm', 'aria-label': 'A-', 'data-o-action': 'theme', 'data-o-value': 'font-' }, 'A−'),
        h('input', { type: 'range', class: 'o-range', min: 75, max: 150, step: 1, 'data-pref-range': 'fontScale' }),
        h('button', { type: 'button', class: 'o-btn o-btn-sm', 'aria-label': 'A+', 'data-o-action': 'theme', 'data-o-value': 'font+' }, 'A+'))),
      this._row(t2('reducedMotion'), t2('reducedMotionDesc'), this._segmented('motion', ['system', 'on', 'off'], { system: t2('motionSystem'), on: t2('motionOn'), off: t2('motionOff') })));
  }
  _languageSection() {
    const t2 = k => this.t('preferences.' + k);
    const locales = O.i18n.locales();
    return this._section(t2('language'),
      this._row(t2('languageLabel'), null, h('select', { class: 'o-select', 'data-pref-select': 'language' },
        (locales.length ? locales : [{ code: O.i18n.locale, name: O.i18n.locale }]).map(l => h('option', { value: l.code, selected: l.code === O.i18n.locale ? true : null }, l.name)))),
      h('div', { class: 'o-prefs-preview', 'data-prefs-preview': '' }));
  }
  _notificationsSection() {
    const t2 = k => this.t('preferences.' + k);
    return this._section(t2('notifications'), ...toArr(this.notifications).map(n => this._row(n.label, n.description,
      h('label', { class: 'o-switch' }, h('input', { type: 'checkbox', 'data-pref-notif': n.key, checked: prefGet('notif.' + n.key, n.default !== false) })))));
  }

  /* ── state <-> UI ── */
  _paintLive() {
    // segmented actives
    this.root.querySelectorAll('[data-pref-set="theme"]').forEach(b => this._activate(b, b.dataset.value === O.theme.mode));
    this.root.querySelectorAll('[data-pref-set="density"]').forEach(b => this._activate(b, b.dataset.value === this._density));
    this.root.querySelectorAll('[data-pref-set="motion"]').forEach(b => this._activate(b, b.dataset.value === this._motion));
    const contrastBox = this.root.querySelector('[data-pref-contrast]'); if (contrastBox) contrastBox.checked = O.theme.highContrast;
    const range = this.root.querySelector('[data-pref-range="fontScale"]'); if (range && doc.activeElement !== range) range.value = Math.round(O.theme.fontScale * 100);
    const sel = this.root.querySelector('[data-pref-select="language"]'); if (sel && sel.value !== O.i18n.locale) sel.value = O.i18n.locale;
    const prev = this.root.querySelector('[data-prefs-preview]');
    if (prev) {
      const now = new Date();
      prev.replaceChildren(
        h('div', null, h('b', null, this.t('preferences.dateFormat') + ': '), fmt.date(now, 'long')),
        h('div', null, h('b', null, this.t('preferences.timeFormat') + ': '), fmt.time(now)),
        h('div', null, h('b', null, this.t('preferences.relativeFormat') + ': '), fmt.relative(new Date(now.getTime() - 3600e3))));
    }
  }
  _activate(el, on) { el.classList.toggle('is-active', on); el.setAttribute('aria-pressed', String(on)); }
  _setPref(key, value) {
    if (key === 'theme') O.theme.setMode(value);
    else if (key === 'contrast') O.theme.setContrast(!!value);
    else if (key === 'density') { this._density = value; prefSet('density', value); applyDensity(value); }
    else if (key === 'motion') { this._motion = value; prefSet('motion', value); applyMotion(value); }
    this.emit('change', { key, value });
    this._paintLive();
  }
  _onRange(el) { if (el.dataset.prefRange === 'fontScale') O.theme.setFontScale(+el.value / 100); }
  _onSelect(el) { if (el.dataset.prefSelect === 'language') { O.i18n.set(el.value); this.emit('change', { key: 'language', value: el.value }); } }
  _onNotif(el) { const key = el.dataset.prefNotif; prefSet('notif.' + key, el.checked); this.emit('notification-change', { key, value: el.checked }); }

  reset() {
    O.theme.setMode('auto'); O.theme.setContrast(false); O.theme.setFontScale(1);
    this._setPref('density', 'comfortable'); this._setPref('motion', 'system');
    toArr(this.notifications).forEach(n => prefSet('notif.' + n.key, n.default !== false));
    this.render();
  }
}
define('o-preferences', OPreferences);
O.Preferences = OPreferences;
