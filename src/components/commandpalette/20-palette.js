/* Orion.commandPalette — the modal command palette (⌘K / Ctrl+K by default).
 *   Orion.commandPalette.open({ query, page }) · .close() · .toggle() · .isOpen · .hotkey('mod+k' | false)
 * Renders on top of Orion.overlays (focus trap, scroll lock, Escape, click-outside) using the
 * shared CommandEngine from 10-engine.js. Commands come from Orion.commands (00-registry.js).
 */
class Palette {
  constructor() {
    this.isOpen = false;
    const baseId = uid('cmdk');
    this.input = h('input', {
      class: 'o-cmdk-input', type: 'text', role: 'combobox', 'aria-expanded': 'true', 'aria-autocomplete': 'list',
      autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: t('commandpalette.placeholder'),
    });
    this.list = h('div', { class: 'o-cmdk-list o-scroll', id: baseId + '-list' });
    this.input.setAttribute('aria-controls', this.list.id);
    this.breadcrumb = h('div', { class: 'o-cmdk-breadcrumb' });
    this.breadcrumb.hidden = true;
    this.footer = h('div', { class: 'o-cmdk-footer' });
    const clearBtn = h('button', { type: 'button', class: 'o-cmdk-clear', 'aria-label': t('common.clear') }, icon('x'));
    clearBtn.hidden = true;
    this.dialog = h('div', { class: 'o-cmdk o-floating', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('commandpalette.placeholder') },
      this.breadcrumb,
      h('div', { class: 'o-cmdk-input-row' }, iconEl('search'), this.input, clearBtn),
      this.list,
      this.footer);
    this.backdrop = h('div', { class: 'o-backdrop' });
    this.layer = h('div', { class: 'o-cmdk-layer', hidden: true }, this.backdrop, this.dialog);
    on(this.backdrop, 'click', () => this.close());
    on(clearBtn, 'click', () => { this.input.value = ''; this.input.dispatchEvent(new Event('input')); this.input.focus(); });
    on(this.input, 'input', () => { clearBtn.hidden = !this.input.value; });
    on(this.breadcrumb, 'click', '.o-cmdk-crumb', (e, el) => {
      const target = +el.dataset.i + 2;
      while (this.engine.pages.length > target) this.engine.popPage();
    });
    this.engine = new CommandEngine({ root: this.dialog, input: this.input, list: this.list, breadcrumb: this.breadcrumb, footer: this.footer, closeOnRun: true });
    this.engine.on('run-close', () => this.close());
  }
  open({ query = '', page } = {}) {
    if (emit(this.dialog, 'o-before-open', {}, { cancelable: true }).defaultPrevented) return;
    if (!this.isOpen) {
      portal(this.layer, doc.body);
      this.layer.hidden = false;
      this._ov = overlays.open({
        el: this.layer, modal: true, trap: true, lockScroll: true, returnFocus: true,
        onClose: (reason) => { this.isOpen = false; this._ov = null; this.layer.hidden = true; emit(this.dialog, 'o-close', { reason }); },
      });
      this.isOpen = true;
      animate(this.dialog, 'zoomIn', { duration: 140 });
      emit(this.dialog, 'o-open', {});
    }
    const cmd = page ? (isStr(page) ? commands.get(page) : page) : null;
    this.engine.reset(query, cmd);
    nextFrame().then(() => this.input.focus());
  }
  close() { this._ov?.close('api'); }
  toggle(opts) { if (this.isOpen) this.close(); else this.open(opts); }
}

let __palette = null;
function palette() { return __palette || (__palette = new Palette()); }

let __hotkeyOff = null;
function bindHotkey(combo) {
  __hotkeyOff?.(); __hotkeyOff = null;
  if (!combo) return;
  if (O.shortcuts) {
    __hotkeyOff = O.shortcuts.add(combo, e => { e.preventDefault(); commandPalette.toggle(); }, { description: () => t('commandpalette.hotkeyLabel'), group: 'General', scope: '*' });
    return;
  }
  if (!isBrowser) return;
  const mac = /Mac|iPhone|iPad/i.test(win.navigator.platform || '');
  const parts = String(combo).toLowerCase().split('+');
  const key = parts.pop();
  const need = { ctrl: parts.includes('mod') ? !mac : parts.includes('ctrl'), meta: parts.includes('mod') ? mac : parts.includes('meta'), alt: parts.includes('alt'), shift: parts.includes('shift') };
  const handler = e => {
    if (e.key.toLowerCase() !== key || e.ctrlKey !== need.ctrl || e.metaKey !== need.meta || e.altKey !== need.alt || e.shiftKey !== need.shift) return;
    e.preventDefault(); commandPalette.toggle();
  };
  win.addEventListener('keydown', handler);
  __hotkeyOff = () => win.removeEventListener('keydown', handler);
}

const commandPalette = {
  /** open({ query, page: id | Command }) */
  open(opts) { palette().open(opts); },
  close() { __palette?.close(); },
  toggle(opts) { palette().toggle(opts); },
  get isOpen() { return !!__palette?.isOpen; },
  /** Change (or disable with a falsy value) the default hotkey. */
  hotkey(combo) { bindHotkey(combo); },
};
O.commandPalette = commandPalette;
bindHotkey('mod+k');
