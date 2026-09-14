/* <o-install-prompt app-name="Acme Admin" variant="banner|card|button" position="inline|top|bottom" dismiss-days="30"></o-install-prompt>
 *   Shows when the browser offers installation (beforeinstallprompt) or on iOS Safari (Add to Home Screen instructions).
 *   Hidden when installed/standalone or dismissed (remembered for dismiss-days in localStorage "orion:pwa:install-dismissed").
 *   force: always show (docs / testing) · icon: image URL · description: text · Methods: install(), dismiss(), reset()
 *   Events: o-install { outcome }, o-dismiss, o-show
 */
const INSTALL_KEY = 'orion:pwa:install-dismissed';
class OInstallPrompt extends OElement {
  static props = {
    appName: String,
    description: String,
    icon: String,
    variant: { type: String, default: 'banner', reflect: true },
    position: { type: String, default: 'inline', reflect: true },
    dismissDays: { type: Number, default: 30 },
    force: { type: Boolean },
    mode: { type: String, default: 'auto' },
    texts: Object,
  };
  setup() { this.classList.add('o-install-prompt'); this.hidden = true; on(this, 'keydown', e => { if (e.key === 'Escape' && this.position !== 'inline') { e.preventDefault(); this.dismiss(); } }); }
  connected() {
    this.addCleanup(pwaEm.on('installable', () => this.requestUpdate('mode')));
    this.addCleanup(pwaEm.on('installed', () => this.requestUpdate('mode')));
  }
  get name() { return this.appName || doc.querySelector('meta[name="application-name"]')?.content || doc.title || 'App'; }
  /** 'prompt' | 'ios' | 'installed' | 'unavailable' (mode attribute overrides for demos) */
  get installMode() { return this.mode && this.mode !== 'auto' ? this.mode : O.pwa.installMode; }
  get dismissed() { const ts = +ls.get(INSTALL_KEY, 0); return !!ts && Date.now() - ts < this.dismissDays * 864e5; }
  update() { this.render(); }
  render() {
    const mode = this.installMode;
    const show = this.force || ((mode === 'prompt' || mode === 'ios') && !this.dismissed);
    const shownBefore = !this.hidden;
    if (!show) { this.hidden = true; return; }
    const T = (k, p) => this.t('pwa.' + k, p);
    const name = this.name;
    const ios = mode === 'ios';
    const installBtn = h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm', onClick: () => this.install() }, raw(String(icon('download'))), h('span', T('install')));
    if (this.variant === 'button') {
      this.replaceChildren(ios ? h('span', { class: 'o-install-ios-text' }, raw(esc(T('iosSteps', { icon: '{icon}' })).replace('{icon}', String(icon('upload', { label: 'Share', class: 'o-install-share' }))))) : installBtn);
    } else {
      const art = this.icon ? h('img', { class: 'o-install-icon', src: this.icon, alt: '', width: 48, height: 48 }) : h('span', { class: 'o-install-icon o-install-icon-letter', 'aria-hidden': 'true' }, (name.trim()[0] || 'A').toUpperCase());
      const titleId = this.id ? this.id + '-title' : uid('install-title');
      const text = ios
        ? h('p', { class: 'o-install-desc' }, raw(esc(T('iosSteps', { icon: '{icon}' })).replace('{icon}', String(icon('upload', { label: 'Share', class: 'o-install-share' })))))
        : h('p', { class: 'o-install-desc' }, this.description || T('installDesc'));
      this.setAttribute('role', 'region');
      this.setAttribute('aria-labelledby', titleId);
      this.replaceChildren(h('div', { class: 'o-install-inner' }, art,
        h('div', { class: 'o-install-body' }, h('strong', { class: 'o-install-title', id: titleId }, ios ? T('iosTitle', { name }) : T('installApp', { name })), text),
        h('div', { class: 'o-install-actions' },
          h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', onClick: () => this.dismiss() }, ios ? T('gotIt') : T('notNow')),
          ios ? null : installBtn)));
    }
    this.hidden = false;
    if (!shownBefore) { if (this.position !== 'inline') animate(this, this.position === 'top' ? 'slideInDown' : 'slideInUp', { duration: 220 }); this.emit('show', { mode }); }
  }
  /** Trigger the native prompt (or show iOS instructions). */
  async install() {
    const res = await O.pwa.install();
    this.emit('install', res);
    if (res.outcome === 'accepted') this.hidden = true;
    else if (res.outcome === 'dismissed') this.dismiss();
    this.requestUpdate('mode');
    return res;
  }
  /** Hide and remember the choice for dismiss-days. */
  dismiss() { ls.set(INSTALL_KEY, Date.now()); this.hidden = true; this.emit('dismiss'); }
  /** Forget a previous dismissal. */
  reset() { ls.del(INSTALL_KEY); this.requestUpdate('mode'); }
}
define('o-install-prompt', OInstallPrompt);
O.InstallPrompt = OInstallPrompt;
