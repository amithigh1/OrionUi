/* Shared admin shell for the templates.
 *
 * Each template page defines window.PAGE = { id, title, subtitle, breadcrumbs, actions }
 * and puts its content inside <div id="app-content">…</div>. This script wraps that content in the
 * Orion app shell (sidebar + header + main) so the pages stay short and copy-pasteable.
 *
 * To use it in your own app: copy this file, edit NAV below, and keep the same page structure.
 */
(function () {
  'use strict';
  const O = window.Orion;
  const PAGE = window.PAGE || {};
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const NAV = [
    { heading: 'Main' },
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: 'dashboard.html' },
    { id: 'reports', label: 'Reports', icon: 'chart-line', href: 'reports.html' },
    { heading: 'Commerce' },
    { id: 'orders', label: 'Orders', icon: 'shopping-cart', href: 'orders.html', badge: '24' },
    { id: 'products', label: 'Products', icon: 'package', href: 'products.html' },
    { id: 'invoice', label: 'Invoices', icon: 'receipt', href: 'invoice.html' },
    { heading: 'Team' },
    { id: 'users', label: 'Users', icon: 'users', href: 'users.html' },
    { id: 'chat', label: 'Messages', icon: 'message-circle', href: 'chat.html', badge: '3' },
    { id: 'profile', label: 'Profile', icon: 'user', href: 'profile.html' },
    { heading: 'Work' },
    { id: 'kanban', label: 'Board', icon: 'kanban', href: 'kanban.html' },
    { id: 'calendar', label: 'Calendar', icon: 'calendar', href: 'calendar.html' },
    { id: 'files', label: 'Files', icon: 'folder', href: 'files.html' },
    { heading: 'System' },
    { id: 'settings', label: 'Settings', icon: 'settings', href: 'settings.html' },
    { id: 'templates', label: 'All templates', icon: 'layout-grid', href: 'index.html' },
  ];

  const icon = (name, cls) => `<o-icon name="${name}"${cls ? ` class="${cls}"` : ''}></o-icon>`;
  const menu = NAV.map(item => item.heading
    ? `<li class="o-menu-heading">${esc(item.heading)}</li>`
    : `<li class="o-menu-item"><a class="o-menu-link${item.id === PAGE.id ? ' is-active' : ''}" href="${item.href}"${item.id === PAGE.id ? ' aria-current="page"' : ''}>
         ${icon(item.icon, 'o-menu-icon')}<span class="o-menu-label">${esc(item.label)}</span>
         ${item.badge ? `<span class="o-badge o-badge-sm o-menu-badge o-badge-primary">${esc(item.badge)}</span>` : ''}</a></li>`).join('');

  const crumbs = JSON.stringify(PAGE.breadcrumbs || [{ label: 'Home', href: 'dashboard.html' }, { label: PAGE.title || document.title }]).replace(/'/g, '&#39;');

  const shell = document.createElement('div');
  shell.className = 'o-app';
  shell.innerHTML = `
    <a class="o-skip-link" href="#main">Skip to main content</a>
    <aside class="o-app-sidebar o-sidebar" data-o-sidebar aria-label="Main navigation">
      <a class="o-sidebar-brand" href="dashboard.html">
        <span class="o-sidebar-brand-mark"><o-icon name="sparkles" size="18"></o-icon></span>
        <span class="o-sidebar-brand-text" data-o-brand="name">Orion Admin</span>
      </a>
      <div class="o-sidebar-search"><input class="o-input o-input-sm" type="search" placeholder="Search menu…" aria-label="Search menu"></div>
      <nav class="o-sidebar-body"><ul class="o-menu">${menu}</ul></nav>
      <div class="o-sidebar-footer">
        <button class="o-sidebar-user" type="button" data-o-toggle="dropdown" data-o-target="#tpl-user-menu">
          <o-avatar name="Aisha Rahman" size="sm" status="online"></o-avatar>
          <span class="o-user-info"><span class="o-user-name">Aisha Rahman</span><span class="o-user-sub">Administrator</span></span>
          ${icon('more-vertical')}
        </button>
        <div class="o-dropdown-menu" id="tpl-user-menu">
          <div class="o-dropdown-header">Aisha Rahman</div>
          <a class="o-dropdown-item" href="profile.html">${icon('user')}Profile</a>
          <a class="o-dropdown-item" href="settings.html">${icon('settings')}Settings</a>
          <div class="o-dropdown-divider"></div>
          <a class="o-dropdown-item is-danger" href="login.html">${icon('log-out')}Sign out</a>
        </div>
      </div>
    </aside>

    <header class="o-app-header">
      <button class="o-btn o-btn-ghost o-btn-icon o-app-toggle" data-o-toggle="sidebar" aria-label="Toggle sidebar">${icon('menu')}</button>
      <o-breadcrumb class="o-app-header-start" separator="chevron" items='${crumbs}'></o-breadcrumb>
      <div class="o-app-header-end">
        <button class="o-btn o-btn-ghost o-btn-sm tpl-search" type="button">${icon('search')}<span class="o-d-none o-d-md-inline">Search</span><kbd class="o-kbd o-d-none o-d-md-inline">⌘K</kbd></button>
        <o-theme-switch></o-theme-switch>
        <o-notification-bell id="tpl-bell"></o-notification-bell>
        <button class="o-btn o-btn-ghost o-btn-icon" data-o-toggle="dropdown" data-o-target="#tpl-user-menu-2" aria-label="Account">
          <o-avatar name="Aisha Rahman" size="sm"></o-avatar>
        </button>
        <div class="o-dropdown-menu" id="tpl-user-menu-2">
          <a class="o-dropdown-item" href="profile.html">${icon('user')}Profile</a>
          <a class="o-dropdown-item" href="settings.html">${icon('settings')}Settings</a>
          <div class="o-dropdown-divider"></div>
          <a class="o-dropdown-item is-danger" href="login.html">${icon('log-out')}Sign out</a>
        </div>
      </div>
    </header>

    <main class="o-app-main" id="main">
      <div class="o-app-content">
        <div class="o-page-header">
          <div>
            <h1 class="o-page-title">${esc(PAGE.title || '')}</h1>
            ${PAGE.subtitle ? `<p class="o-text-muted o-mb-0">${esc(PAGE.subtitle)}</p>` : ''}
          </div>
          <div class="o-page-header-actions">${PAGE.actions || ''}</div>
        </div>
        <div id="tpl-slot"></div>
      </div>
    </main>`;

  const start = () => {
    const content = document.getElementById('app-content');
    document.body.prepend(shell);
    if (content) shell.querySelector('#tpl-slot').append(...content.childNodes), content.remove();

    // Command palette (Cmd/Ctrl+K) over the navigation, when the search package is loaded
    if (O.commands && O.commandPalette) {
      O.commands.register(NAV.filter(n => n.id).map(n => ({
        id: 'nav-' + n.id, title: n.label, section: 'Navigate', icon: n.icon, run: () => (location.href = n.href),
      })));
      O.commands.register([
        { id: 'theme', title: 'Toggle dark mode', section: 'Preferences', icon: 'moon', run: () => O.theme.toggle() },
        { id: 'print', title: 'Print this page', section: 'Actions', icon: 'printer', run: () => (O.print ? O.print(document.querySelector('.o-app-content')) : window.print()) },
      ]);
      shell.querySelector('.tpl-search').onclick = () => O.commandPalette.open();
    } else {
      shell.querySelector('.tpl-search').onclick = () => O.toast?.('Load the search package for the command palette');
    }

    // Demo notifications
    if (O.notifications) {
      O.notifications.setItems?.([
        { id: 1, title: 'New order #10231', body: 'Aisha Rahman · RM 1,240.00', type: 'success', createdAt: Date.now() - 6e4 },
        { id: 2, title: 'Payment failed', body: 'Invoice INV-2031 could not be charged', type: 'error', createdAt: Date.now() - 36e5 },
        { id: 3, title: 'Ben mentioned you', body: '“can you review the Q3 report?”', type: 'mention', createdAt: Date.now() - 864e5 },
      ]);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
