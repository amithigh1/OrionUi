/* <o-command-menu> — inline, non-modal command list (same fuzzy ranking, sections, nested pages
 * and keyboard model as the command palette, embedded directly in the page instead of a dialog).
 *   <o-command-menu commands='[{"id":"new","title":"New file","icon":"plus"}]'></o-command-menu>
 *   el.commands = [...]                          // falls back to the global Orion.commands registry when empty
 *   <o-command-menu providers autofocus></o-command-menu>
 * Events: o-command { command, query } (also o-search, o-navigate). Methods: focus(), reset(), refresh().
 */
i18n.add('en', { commandmenu: { placeholder: 'Search commands…' } });

class OCommandMenu extends OElement {
  static props = {
    commands: { type: Array, default: () => [] },
    placeholder: String,
    autofocus: { type: Boolean },
    providers: { type: Boolean, default: false },
    hints: { type: Boolean, default: true },
    texts: Object,
  };
  setup() {
    this.classList.add('o-cmdmenu');
    const baseId = uid('cmdmenu');
    this.input = h('input', {
      class: 'o-cmdk-input', type: 'text', role: 'combobox', 'aria-expanded': 'true', 'aria-autocomplete': 'list',
      autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    });
    this.listEl = h('div', { class: 'o-cmdk-list o-scroll', id: baseId + '-list' });
    this.input.setAttribute('aria-controls', this.listEl.id);
    this.breadcrumb = h('div', { class: 'o-cmdk-breadcrumb' });
    this.breadcrumb.hidden = true;
    this.footer = h('div', { class: 'o-cmdk-footer' });
    this.append(
      this.breadcrumb,
      h('div', { class: 'o-cmdk-input-row' }, iconEl('search'), this.input),
      this.listEl,
      this.footer,
    );
    on(this.breadcrumb, 'click', '.o-cmdk-crumb', (e, el) => {
      const target = +el.dataset.i + 2;
      while (this.engine.pages.length > target) this.engine.popPage();
    });
    this.engine = new CommandEngine({ root: this, input: this.input, list: this.listEl, breadcrumb: this.breadcrumb, footer: this.footer, providers: this.providers, closeOnRun: false });
    this.engine.on('search', d => this.emit('search', d));
    this.engine.on('navigate', d => this.emit('navigate', { pages: this.engine.pages.map(p => p.title) }));
    this.engine.on('run', d => this.emit('command', d));
    this.focusTarget = this.input;
  }
  update(changed) {
    if (changed.has('placeholder') || changed.has('init') || changed.has('locale')) this.input.placeholder = this.placeholder || this.t('commandmenu.placeholder');
    if (changed.has('providers')) this.engine.providersEnabled = this.providers;
    if (changed.has('hints') || changed.has('init')) this.footer.hidden = !this.hints;
    if (changed.has('commands') || changed.has('init')) { this.engine.setRootCommands(this.commands); this.engine.render(); }
    if (changed.has('init') && this.autofocus) nextFrame().then(() => this.focus());
  }
  disconnected() { this.engine.destroy(); }
  /** Re-run ranking/rendering (e.g. after a when() result changed elsewhere). */
  refresh() { this.engine.render(); }
  /** Reset to the root page with an optional query. */
  reset(query = '') { this.engine.reset(query); }
  focus(opts) { this.input.focus(opts); }
}
define('o-command-menu', OCommandMenu);
O.CommandMenu = OCommandMenu;
