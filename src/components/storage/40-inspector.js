/* <o-storage-inspector sections="local,session,idb,cache" prefix="orion:" readonly></o-storage-inspector>
 *   Dev widget: storage quota/usage, localStorage & sessionStorage keys (size, expiry, delete), IndexedDB databases,
 *   Cache Storage caches (entries, bytes) with two-step "Delete → Confirm?" buttons (no blocking dialogs).
 *   Methods: refresh() · Events: o-refresh, o-delete (cancelable, detail { kind, name }), o-clear (cancelable)
 */
i18n.add('en', {
  storage: {
    title: 'Storage', usage: '{used} of {quota} used', usageUnknown: 'Usage estimate unavailable', local: 'Local storage', session: 'Session storage',
    idb: 'IndexedDB', cache: 'Cache storage', empty: 'Nothing stored', unsupported: 'Not available in this browser or context',
    keys: { one: '{count} key', other: '{count} keys' }, databases: { one: '{count} database', other: '{count} databases' },
    caches: { one: '{count} cache', other: '{count} caches' }, entries: { one: '{count} entry', other: '{count} entries' },
    key: 'Key', value: 'Value', size: 'Size', expires: 'Expires', never: 'Never', name: 'Name', version: 'Version', actions: 'Actions', entriesCol: 'Entries',
    delete: 'Delete', clear: 'Clear all', confirm: 'Confirm?', deleted: 'Deleted {name}', cleared: 'Cleared {count} items',
    persistent: 'Persistent storage', bestEffort: 'Best-effort storage', makePersistent: 'Make persistent', more: '+{count} more',
  },
});

class OStorageInspector extends OElement {
  static props = {
    sections: { type: Array, default: () => ['local', 'session', 'idb', 'cache'] },
    prefix: { type: String, default: '' },
    readonly: { type: Boolean, reflect: true },
    maxRows: { type: Number, default: 100 },
    texts: Object,
  };
  setup() {
    this.classList.add('o-storage-inspector');
    this._head = h('div', { class: 'o-si-head' });
    this._body = h('div', { class: 'o-si-body' });
    this.replaceChildren(this._head, this._body);
    this._open = new Set(['local']);
    on(this, 'click', '[data-si-act]', (e, btn) => this._act(btn));
    on(this, 'toggle', 'details', e => { const d = e.target; if (d.dataset.kind) { if (d.open) this._open.add(d.dataset.kind); else this._open.delete(d.dataset.kind); } }, true);
  }
  connected() {
    this.listen(win, 'storage', debounce(() => this.refresh(), 150));
    this._offStore = [O.store?.onChange?.('*', debounce(() => this.refresh(), 150))].filter(Boolean);
    this.addCleanup(() => this._offStore.forEach(f => f()));
  }
  update(changed) { if (changed.has('init') || changed.has('sections') || changed.has('prefix') || changed.has('readonly') || changed.has('locale')) this.refresh(); }

  _webKeys(kind) {
    const out = [];
    let s = null;
    try { s = win[kind]; void s.length; } catch { return null; }
    try {
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k == null || (this.prefix && !k.startsWith(this.prefix))) continue;
        const v = s.getItem(k) || '';
        const j = parseJSON(v, null);
        out.push({ key: k, value: v, bytes: (k.length + v.length) * 2, expires: isObj(j) && j.__o === 1 && j.e ? j.e : 0 });
      }
    } catch { return null; }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }
  /** Re-read every storage area and re-render. */
  async refresh() {
    if (!this._setupDone || !isBrowser) return;
    const seq = (this._seq = (this._seq || 0) + 1);
    const want = new Set(this.sections);
    const [est, persisted, dbs, cstats] = await Promise.all([
      O.storage?.estimate?.() ?? null, O.storage?.persisted?.() ?? false,
      want.has('idb') ? (O.idb?.supported ? O.idb.databases() : Promise.resolve(null)) : [],
      want.has('cache') ? (O.cache?.supported ? O.cache.stats().catch(() => null) : Promise.resolve(null)) : [],
    ]);
    if (seq !== this._seq) return;
    const data = { est, persisted, dbs, cstats, local: want.has('local') ? this._webKeys('localStorage') : [], session: want.has('session') ? this._webKeys('sessionStorage') : [] };
    this._render(data, want);
    this.emit('refresh', data);
  }
  _render(d, want) {
    const T = (k, p) => this.t('storage.' + k, p);
    const fb = v => formatBytes(v || 0);
    const refreshBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm o-btn-icon', 'data-si-act': 'refresh', 'aria-label': this.t('common.refresh'), title: this.t('common.refresh') }, raw(String(icon('refresh'))));
    const pct = d.est ? clamp(d.est.percent * 100, 0, 100) : 0;
    this._head.replaceChildren(
      h('div', { class: 'o-si-title' }, h('strong', T('title')), h('span', { class: cls('o-badge', d.persisted ? 'o-badge-soft-success' : 'o-badge-soft-secondary') }, d.persisted ? T('persistent') : T('bestEffort')),
        !d.persisted && !this.readonly && O.storage?.persist ? h('button', { type: 'button', class: 'o-btn o-btn-link o-btn-sm', 'data-si-act': 'persist' }, T('makePersistent')) : null,
        h('span', { class: 'o-spacer' }), refreshBtn),
      h('div', { class: 'o-si-usage' },
        h('div', { class: 'o-progress o-progress-sm', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)), 'aria-label': T('title') },
          h('div', { class: 'o-progress-bar', style: { '--o-value': Math.max(pct, d.est && d.est.usage ? 0.5 : 0) + '%' } })),
        h('span', { class: 'o-si-usage-text' }, d.est ? T('usage', { used: fb(d.est.usage), quota: fb(d.est.quota) }) + ` · ${fmt.percent(d.est.percent, 2)}` : T('usageUnknown'))),
    );
    const secs = [];
    for (const kind of ['local', 'session']) {
      if (!want.has(kind)) continue;
      const rows = d[kind];
      const bytes = rows ? rows.reduce((s, r) => s + r.bytes, 0) : 0;
      secs.push(this._section(kind, T(kind), rows ? `${T('keys', { count: rows.length })} · ${fb(bytes)}` : T('unsupported'), rows && rows.length ? this._table([T('key'), T('value'), T('size'), T('expires')], rows.slice(0, this.maxRows).map(r => ({
        cells: [h('code', { class: 'o-si-key', title: r.key }, r.key), h('span', { class: 'o-si-val', title: r.value.slice(0, 500) }, r.value.length > 80 ? r.value.slice(0, 80) + '…' : r.value), fb(r.bytes), r.expires ? fmt.relative(r.expires) : T('never')],
        act: { kind, name: r.key },
      })), rows.length > this.maxRows ? T('more', { count: rows.length - this.maxRows }) : '') : this._empty(rows ? T('empty') : T('unsupported')), rows && rows.length ? { kind, name: '*' } : null));
    }
    if (want.has('idb')) {
      const list = d.dbs;
      secs.push(this._section('idb', T('idb'), list ? T('databases', { count: list.length }) : T('unsupported'), list && list.length ? this._table([T('name'), T('version')], list.map(db => ({ cells: [h('code', { class: 'o-si-key' }, db.name), String(db.version ?? '')], act: { kind: 'idb', name: db.name } }))) : this._empty(list ? T('empty') : T('unsupported'))));
    }
    if (want.has('cache')) {
      const list = d.cstats;
      const bytes = list ? list.reduce((s, c) => s + c.bytes, 0) : 0;
      secs.push(this._section('cache', T('cache'), list ? `${T('caches', { count: list.length })} · ${fb(bytes)}` : T('unsupported'), list && list.length ? this._table([T('name'), T('entriesCol'), T('size')], list.map(c => ({ cells: [h('code', { class: 'o-si-key' }, c.name), fmt.number(c.entries), fb(c.bytes)], act: { kind: 'cache', name: c.name } }))) : this._empty(list ? T('empty') : T('unsupported')), list && list.length ? { kind: 'cache', name: '*' } : null));
    }
    this._body.replaceChildren(...secs);
  }
  _section(kind, title, meta, content, clearAct) {
    const summary = h('summary', { class: 'o-si-summary' }, raw(String(icon('chevron-right', { class: 'o-si-chev' }))), h('span', { class: 'o-si-name' }, title), h('span', { class: 'o-si-meta' }, meta));
    const actions = clearAct && !this.readonly ? h('div', { class: 'o-si-actions' }, this._btn(this.t('storage.clear'), { ...clearAct, clear: true })) : null;
    return h('details', { class: 'o-si-section', 'data-kind': kind, open: this._open.has(kind) }, summary, h('div', { class: 'o-si-content' }, actions, content));
  }
  _empty(msg) { return h('p', { class: 'o-si-empty' }, msg); }
  _btn(label, act) {
    return h('button', { type: 'button', class: 'o-btn o-btn-sm o-btn-soft-danger', 'data-si-act': act.clear ? 'clear' : 'delete', 'data-kind': act.kind, 'data-name': act.name, 'aria-label': `${label} ${act.name === '*' ? '' : act.name}`.trim() }, label);
  }
  _table(head, rows, foot) {
    const ro = this.readonly;
    return h('div', { class: 'o-table-wrap o-si-table' }, h('table', { class: 'o-table o-table-sm' },
      h('thead', h('tr', head.map(x => h('th', { scope: 'col' }, x)), ro ? null : h('th', { scope: 'col', class: 'o-shrink' }, h('span', { class: 'o-sr-only' }, this.t('storage.actions'))))),
      h('tbody', rows.map(r => h('tr', r.cells.map(c => h('td', c)), ro ? null : h('td', { class: 'o-shrink' }, this._btn(this.t('storage.delete'), r.act)))))),
    foot ? h('div', { class: 'o-si-foot' }, foot) : null);
  }
  async _act(btn) {
    const act = btn.getAttribute('data-si-act');
    if (act === 'refresh') return this.refresh();
    if (act === 'persist') { await O.storage.persist(); return this.refresh(); }
    if (this.readonly) return;
    if (!btn.classList.contains('is-confirm')) {
      btn.classList.add('is-confirm', 'o-btn-danger');
      btn.classList.remove('o-btn-soft-danger');
      btn.__label = btn.textContent;
      btn.textContent = this.t('storage.confirm');
      btn.__t = setTimeout(() => { btn.classList.remove('is-confirm', 'o-btn-danger'); btn.classList.add('o-btn-soft-danger'); btn.textContent = btn.__label; }, 3000);
      return;
    }
    clearTimeout(btn.__t);
    const kind = btn.dataset.kind, name = btn.dataset.name;
    const clear = act === 'clear';
    if (!this.emit(clear ? 'clear' : 'delete', { kind, name })) return;
    let msg = '';
    try {
      if (kind === 'local' || kind === 'session') {
        const s = win[kind === 'local' ? 'localStorage' : 'sessionStorage'];
        if (clear) { const ks = (this._webKeys(kind === 'local' ? 'localStorage' : 'sessionStorage') || []).map(r => r.key); ks.forEach(k => s.removeItem(k)); msg = this.t('storage.cleared', { count: ks.length }); }
        else { s.removeItem(name); msg = this.t('storage.deleted', { name }); }
      } else if (kind === 'idb') { await O.idb.deleteDatabase(name); msg = this.t('storage.deleted', { name }); }
      else if (kind === 'cache') {
        if (clear) { const n = await O.cache.clear(''); msg = this.t('storage.cleared', { count: n }); }
        else { await caches.delete(name); msg = this.t('storage.deleted', { name }); }
      }
    } catch (e) { console.warn('[Orion] storage inspector', e); }
    announce(msg);
    await this.refresh();
    this.querySelector(`details[data-kind="${kind}"] > summary`)?.focus();
  }
}
define('o-storage-inspector', OStorageInspector);
O.StorageInspector = OStorageInspector;
