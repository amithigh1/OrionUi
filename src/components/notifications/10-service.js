/* Orion.notifications — shared notification store used by <o-notification-bell> and <o-notifications>.
 *   Orion.notifications.push({ title, body, icon, type, url, actions })
 *   Orion.notifications.setItems(list) / .append(list) (pagination) / .markRead(id|'all') / .remove(id|'all')
 *   Orion.notifications.unreadCount   Orion.notifications.on('change', ({type, item?, id?}) => {})
 *   Orion.notifications.configure({ toast, browserNotify, sound, persist, crossTab })
 *   Orion.notifications.connect(client, { event }) -> disconnect()
 * Cross-tab sync (BroadcastChannel) is on by default; toast / browser notification / sound are off by default.
 */
i18n.add('en', { notif: {} });

const NOTIF_DEFAULTS = { toast: false, browserNotify: false, sound: false, persist: false, crossTab: true, storageKey: 'orion:notifications:items', channel: 'orion:notifications', maxItems: 500 };

class ONotificationStore extends Emitter {
  constructor() {
    super();
    this.items = [];
    this._config = { ...NOTIF_DEFAULTS };
    this._bc = null;
    this._audioCtx = null;
    if (isBrowser && this._config.crossTab) this._initChannel();
  }
  /** configure({ toast, browserNotify, sound, persist, crossTab, storageKey, channel, maxItems }) */
  configure(opts = {}) {
    Object.assign(this._config, opts);
    if (this._config.persist) this._load();
    if (this._config.crossTab) this._initChannel();
    else if (this._bc) { try { this._bc.close(); } catch {} this._bc = null; }
    return this;
  }
  get(id) { return this.items.find(i => String(i.id) === String(id)) || null; }
  get unreadCount() { return this.items.reduce((n, i) => n + (i.read ? 0 : 1), 0); }
  setItems(list) { this.items = toArr(list).slice(); this._persist(); this.emit('change', { type: 'set' }); this._broadcast({ type: 'set', items: this.items }); }
  /** Prepend a brand-new (real-time) notification. */
  push(item, overrides) {
    const it = { id: uid('notif'), read: false, createdAt: new Date().toISOString(), ...item };
    this.items.unshift(it);
    if (this.items.length > this._config.maxItems) this.items.length = this._config.maxItems;
    this._persist();
    this.emit('change', { type: 'push', item: it });
    this._broadcast({ type: 'push', item: it });
    this._afterPush(it, overrides);
    return it;
  }
  /** Append older (paginated) items at the end — used by <o-notifications>'s infinite `load(page)`. */
  append(list) {
    const items = toArr(list);
    if (!items.length) return items;
    this.items = this.items.concat(items);
    this._persist();
    this.emit('change', { type: 'append', items });
    this._broadcast({ type: 'append', items });
    return items;
  }
  markRead(id) {
    if (id === 'all') {
      let any = false;
      this.items.forEach(i => { if (!i.read) { i.read = true; any = true; } });
      if (!any) return;
      this._persist(); this.emit('change', { type: 'read-all' }); this._broadcast({ type: 'read-all' });
      return;
    }
    const it = this.get(id);
    if (!it || it.read) return;
    it.read = true;
    this._persist(); this.emit('change', { type: 'read', id }); this._broadcast({ type: 'read', id });
  }
  remove(id) {
    if (id === 'all') {
      if (!this.items.length) return;
      this.items = [];
      this._persist(); this.emit('change', { type: 'clear' }); this._broadcast({ type: 'clear' });
      return;
    }
    const idx = this.items.findIndex(i => String(i.id) === String(id));
    if (idx < 0) return;
    this.items.splice(idx, 1);
    this._persist(); this.emit('change', { type: 'remove', id }); this._broadcast({ type: 'remove', id });
  }
  /** Wire an event-emitting client (Orion.ws / Orion.sse / Orion.signalr / any Emitter) as a push source. */
  connect(client, opts = {}) {
    if (!client || !isFn(client.on)) return noop;
    const off = client.on(opts.event || 'notification', data => { if (data) this.push(data); });
    return () => { try { off(); } catch {} };
  }

  _afterPush(it, overrides = {}) {
    const cfg = { ...this._config, ...overrides };
    if (cfg.toast && O.toast) O.toast({ title: it.title, text: it.body, type: ['success', 'error', 'warning', 'info'].includes(it.type) ? it.type : 'default' });
    if (cfg.sound) this._beep();
    if (cfg.browserNotify) this._browserNotify(it);
    bus.emit('notifications:push', it);
  }
  _browserNotify(it) {
    if (!isBrowser || !doc.hidden) return;
    if (O.notify) { O.notify(it.title || '', { body: it.body, request: false }); return; }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification(it.title || '', { body: it.body }); } catch {}
    }
  }
  _beep() {
    if (!isBrowser) return;
    try {
      const Ctx = win.AudioContext || win.webkitAudioContext;
      if (!Ctx) return;
      if (!this._audioCtx) this._audioCtx = new Ctx();
      const ctx = this._audioCtx, osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    } catch {}
  }
  _load() { const saved = ls.get(this._config.storageKey, null); if (Array.isArray(saved)) this.items = saved; }
  _persist() { if (this._config.persist) ls.set(this._config.storageKey, this.items); }
  _initChannel() {
    if (!isBrowser || this._bc || typeof BroadcastChannel === 'undefined') return;
    try { this._bc = new BroadcastChannel(this._config.channel); this._bc.onmessage = e => this._applyRemote(e.data); } catch {}
  }
  _broadcast(msg) { if (this._bc) { try { this._bc.postMessage(msg); } catch {} } }
  _applyRemote(msg) {
    if (!msg) return;
    if (msg.type === 'push') { if (!this.get(msg.item.id)) { this.items.unshift(msg.item); this._persist(); this.emit('change', { type: 'push', item: msg.item, remote: true }); } }
    else if (msg.type === 'append') { this.items = this.items.concat(msg.items || []); this._persist(); this.emit('change', { type: 'append', items: msg.items, remote: true }); }
    else if (msg.type === 'read') { const it = this.get(msg.id); if (it && !it.read) { it.read = true; this._persist(); this.emit('change', { type: 'read', id: msg.id, remote: true }); } }
    else if (msg.type === 'read-all') { this.items.forEach(i => { i.read = true; }); this._persist(); this.emit('change', { type: 'read-all', remote: true }); }
    else if (msg.type === 'remove') { const idx = this.items.findIndex(i => String(i.id) === String(msg.id)); if (idx >= 0) { this.items.splice(idx, 1); this._persist(); this.emit('change', { type: 'remove', id: msg.id, remote: true }); } }
    else if (msg.type === 'clear') { this.items = []; this._persist(); this.emit('change', { type: 'clear', remote: true }); }
    else if (msg.type === 'set') { this.items = msg.items || []; this._persist(); this.emit('change', { type: 'set', remote: true }); }
  }
}

O.notifications = new ONotificationStore();
