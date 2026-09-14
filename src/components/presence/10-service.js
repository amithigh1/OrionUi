/* Orion.presence — tiny shared presence store fed by the app (websocket handler, polling job, or
 * the local user's own idle state). Powers <o-presence> and <o-presence-list>, but is independent
 * of them: any part of the app can call set()/subscribe() without a presence element on the page.
 *   Orion.presence.set(userId, status, meta?)     // status: online|away|busy|dnd|offline
 *   Orion.presence.get(userId) -> status           Orion.presence.entry(userId) -> {status, updatedAt, ...meta}|null
 *   Orion.presence.all() -> { userId: status }     Orion.presence.entries() -> [{ id, status, ... }]
 *   Orion.presence.remove(userId)                  Orion.presence.onlineCount()
 *   Orion.presence.subscribe(fn({ userId, status, prev, entry, removed? })) -> off()
 *   Orion.presence.autoAway(userId, { timeout=300000, crossTab=false }) -> stop()
 *     Uses Orion.idle (if loaded) to set the local user 'away' after `timeout` ms of inactivity and
 *     restore their previous status on activity. A no-op (returns a no-op stop fn) without Orion.idle.
 */
i18n.add('en', {
  presence: {
    online: 'Online', away: 'Away', busy: 'Busy', dnd: 'Do not disturb', offline: 'Offline',
    onlineCount: { one: '{count} online', other: '{count} online' }, noOne: 'No one here',
  },
});

/** Priority order for grouping/sorting: most "present" first. */
const PRESENCE_ORDER = ['online', 'busy', 'dnd', 'away', 'offline'];
const PRESENCE_SET = new Set(PRESENCE_ORDER);
const presenceStatus = s => (PRESENCE_SET.has(s) ? s : 'offline');

class OPresenceStore extends Emitter {
  constructor() {
    super();
    this._map = new Map();   // userId -> { status, updatedAt, ...meta }
    this._auto = new Map();  // userId -> stop()
  }
  /** set(userId, status, meta?) — meta (e.g. { name, avatar }) is merged onto the stored entry. */
  set(userId, status, meta) {
    if (userId == null) return this;
    const id = String(userId);
    const st = presenceStatus(status);
    const prev = this._map.get(id);
    const entry = { ...(prev || {}), ...(isObj(meta) ? meta : {}), status: st, updatedAt: Date.now() };
    this._map.set(id, entry);
    this.emit('change', { userId: id, status: st, prev: prev ? prev.status : null, entry });
    return this;
  }
  get(userId) { const e = this._map.get(String(userId)); return e ? e.status : 'offline'; }
  entry(userId) { const e = this._map.get(String(userId)); return e ? { ...e } : null; }
  has(userId) { return this._map.has(String(userId)); }
  remove(userId) {
    const id = String(userId);
    if (!this._map.has(id)) return this;
    this._map.delete(id);
    this._stopAuto(id);
    this.emit('change', { userId: id, status: 'offline', removed: true });
    return this;
  }
  all() { const out = {}; for (const [id, e] of this._map) out[id] = e.status; return out; }
  entries() { return [...this._map.entries()].map(([id, e]) => ({ id, ...e })); }
  onlineCount() { let n = 0; for (const e of this._map.values()) if (e.status !== 'offline') n++; return n; }
  /** subscribe(fn) -> off() — fires on every set()/remove(). */
  subscribe(fn) { return this.on('change', fn); }
  /** autoAway(userId, opts) -> stop(). Requires Orion.idle; a no-op otherwise. Skips 'dnd' and 'offline'
   *  (a user who explicitly set Do Not Disturb, or who is already offline, should not flip to 'away'). */
  autoAway(userId, opts = {}) {
    const id = String(userId);
    this._stopAuto(id);
    if (!isFn(O.idle)) return noop;
    let before = this.get(id);
    const watcher = O.idle({
      timeout: opts.timeout ?? 300000,
      crossTab: opts.crossTab ?? false,
      key: opts.key || 'presence:' + id,
      onIdle: () => { before = this.get(id); if (before !== 'dnd' && before !== 'offline') this.set(id, 'away'); },
      onActive: () => { if (this.get(id) === 'away') this.set(id, before); },
    });
    const stop = () => { watcher.stop(); this._auto.delete(id); };
    this._auto.set(id, stop);
    return stop;
  }
  _stopAuto(id) { const s = this._auto.get(id); if (s) s(); }
}

O.presence = new OPresenceStore();
O.presence.STATUSES = PRESENCE_ORDER.slice();
