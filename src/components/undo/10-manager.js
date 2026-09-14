/* Orion.UndoManager — command-based undo/redo with merging, batching, limits and keyboard binding.
 *   const um = new Orion.UndoManager({ id: 'editor', limit: 100, mergeWindow: 800, onChange: ({ canUndo, canRedo }) => … });
 *   um.execute({ label: 'Add row', do: () => rows.push(r), undo: () => rows.pop() });     // runs do() and records it
 *   um.push(cmd)                        record a command that already happened
 *   cmd.merge: true (compose with the previous command of the same mergeKey/label inside mergeWindow)
 *            | (prev) => bool          (absorb into prev — mutate prev and return true)
 *   um.batch('Move', () => { … })       many commands -> one history entry (async fn supported; throws -> rolled back)
 *   const end = um.batch('Drag'); … end();
 *   um.undo() · um.redo() · um.goto(i) · um.canUndo · um.canRedo · um.history · um.pointer · um.clear() · um.seal()
 *   const unbind = um.bind(document)    mod+Z undo, mod+Shift+Z / mod+Y redo (native undo kept inside text fields unless allowInInputs)
 *   Orion.UndoManager.get('editor')     registry for <o-undo-controls for="editor">
 */
i18n.add('en', {
  undo: {
    undo: 'Undo', redo: 'Redo', undoLabel: 'Undo {label}', redoLabel: 'Redo {label}', history: 'History', initial: 'Initial state',
    untitled: 'Change', typing: 'Typing in “{field}”', change: 'Change “{field}”', typingAny: 'Typing', changeAny: 'Change field', reset: 'Reset form', clear: 'Clear history',
    undone: 'Undone: {label}', redone: 'Redone: {label}', nothing: 'Nothing to undo', group: 'Undo and redo',
  },
});
if (!O.icons.has('undo')) O.icons.add({ undo: '<path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>' });
if (!O.icons.has('redo')) O.icons.add({ redo: '<path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>' });
if (!O.icons.has('history')) O.icons.add({ history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>' });

const UNDO_MAC = isBrowser && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);
const __undoReg = new Map();
const __typingEl = el => !!el && el.nodeType === 1 && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|range|color|file|image|hidden)$/i.test(el.type)));

class UndoManager extends Emitter {
  constructor({ id = null, limit = 100, mergeWindow = 800, onChange = null } = {}) {
    super();
    Object.assign(this, { id, limit, mergeWindow, onChange });
    this._stack = []; this._ptr = -1; this._batch = null; this._applying = false; this._busy = false; this._mergeable = null;
    if (id) { __undoReg.set(id, this); bus.emit('undo:register', this); }
  }
  static get(id) { return __undoReg.get(id) || null; }
  get canUndo() { return this._ptr >= 0 && !this._busy; }
  get canRedo() { return this._ptr < this._stack.length - 1 && !this._busy; }
  get pointer() { return this._ptr; }
  get size() { return this._stack.length; }
  get applying() { return this._applying; }
  get undoLabel() { return this._stack[this._ptr]?.label || ''; }
  get redoLabel() { return this._stack[this._ptr + 1]?.label || ''; }
  /** [{ index, label, time, count, done, current }] oldest first */
  get history() { return this._stack.map((e, i) => ({ index: i, label: e.label, time: e.time, count: e.cmds.length, done: i <= this._ptr, current: i === this._ptr })); }

  /** Run cmd.do() and record it. Returns whatever do() returned. */
  execute(cmd) {
    const r = isFn(cmd?.do) ? cmd.do.call(cmd) : undefined;
    this.push(cmd);
    return r;
  }
  /** Record a command that has already been applied. */
  push(cmd) {
    if (this._applying) return this;   // side effects of undo/redo are not new history
    if (!cmd || !isFn(cmd.undo)) throw new TypeError('UndoManager: a command needs an undo() function');
    if (this._batch) { this._batch.cmds.push(cmd); return this; }
    const now = Date.now(), top = this._stack[this._ptr];
    this._truncate();
    if (top && top === this._mergeable && now - top.time <= this.mergeWindow && this._merge(top, cmd)) {
      top.time = now; if (cmd.label) top.label = cmd.label;
      this._changed('merge', top);
      return this;
    }
    this._add({ label: cmd.label || '', time: now, cmds: [cmd] });
    this._changed('push', this._stack[this._ptr]);
    return this;
  }
  _merge(entry, cmd) {
    if (!cmd.merge) return false;
    const prev = entry.cmds[entry.cmds.length - 1];
    if (isFn(cmd.merge)) return cmd.merge(prev, entry) === true;
    if ((cmd.mergeKey ?? cmd.label) !== (prev.mergeKey ?? prev.label)) return false;
    entry.cmds.push(cmd);
    return true;
  }
  _add(entry) {
    this._stack.push(entry);
    if (this._stack.length > this.limit) this._stack.splice(0, this._stack.length - this.limit);
    this._ptr = this._stack.length - 1;
    this._mergeable = entry;
  }
  _truncate() { if (this._ptr < this._stack.length - 1) this._stack.length = this._ptr + 1; }
  /** Stop merging into the current entry (e.g. on blur). */
  seal() { this._mergeable = null; return this; }

  undo() {
    if (!this.canUndo) return false;
    const entry = this._stack[this._ptr--];
    this._mergeable = null;
    const r = this._run([...entry.cmds].reverse(), 'undo');
    this._changed('undo', entry);
    return r;
  }
  redo() {
    if (!this.canRedo) return false;
    const entry = this._stack[++this._ptr];
    this._mergeable = null;
    const r = this._run(entry.cmds, 'redo');
    this._changed('redo', entry);
    return r;
  }
  /** goto(index): undo/redo until history[index] is the current entry (-1 = before the first). */
  goto(index) {
    index = clamp(index, -1, this._stack.length - 1);
    const step = () => {
      if (this._ptr === index) return true;
      const r = this._ptr > index ? this.undo() : this.redo();
      return r && isFn(r.then) ? r.then(step) : r === false ? false : step();
    };
    return step();
  }
  _run(cmds, kind) {
    const call = c => (kind === 'undo' ? c.undo.call(c) : (c.redo || c.do).call(c));
    this._applying = true;
    for (let i = 0; i < cmds.length; i++) {
      let r;
      try { r = call(cmds[i]); } catch (err) { this._applying = false; throw err; }
      if (r && isFn(r.then)) {
        this._busy = true;
        const rest = cmds.slice(i + 1);
        return (async () => { try { await r; for (const c of rest) await call(c); return true; } finally { this._applying = false; this._busy = false; this._changed('settled'); } })();
      }
    }
    this._applying = false;
    return true;
  }
  /** batch(fn) · batch(label, fn) · batch(label) -> end() */
  batch(a, b) {
    const label = isStr(a) ? a : '', fn = isFn(a) ? a : b, outer = !this._batch;
    if (outer) this._batch = { label, time: Date.now(), cmds: [] };
    else if (label && !this._batch.label) this._batch.label = label;
    const end = () => {
      if (!outer || !this._batch) return;
      const e = this._batch; this._batch = null;
      if (!e.cmds.length) return;
      this._truncate();
      e.label = e.label || e.cmds[e.cmds.length - 1].label || '';
      e.time = Date.now();
      this._add(e); this._mergeable = null;
      this._changed('batch', e);
    };
    if (!fn) return end;
    const fail = err => { if (outer) this._rollback(); throw err; };
    let r;
    try { r = fn(); } catch (err) { fail(err); }
    if (r && isFn(r.then)) return r.then(v => { end(); return v; }, fail);
    end();
    return r;
  }
  _rollback() {
    const e = this._batch; this._batch = null;
    if (!e) return;
    this._applying = true;
    try { [...e.cmds].reverse().forEach(c => c.undo.call(c)); } finally { this._applying = false; }
  }
  clear() { this._stack = []; this._ptr = -1; this._mergeable = null; this._changed('clear'); return this; }
  /** bind(target = document, { allowInInputs }) -> unbind() — mod+Z / mod+Shift+Z / mod+Y */
  bind(target, { allowInInputs } = {}) {
    if (!isBrowser) return noop;
    const el = target ? $(target) : doc;
    const inputsToo = allowInInputs ?? el !== doc;
    const onKey = e => {
      if (e.defaultPrevented || e.isComposing || e.altKey || !(UNDO_MAC ? e.metaKey : e.ctrlKey)) return;
      const k = (e.key || '').toLowerCase(), z = k === 'z' || e.code === 'KeyZ', y = k === 'y' || e.code === 'KeyY';
      if (!z && !y) return;
      const tgt = e.composedPath ? e.composedPath()[0] : e.target;
      if (!inputsToo && __typingEl(tgt)) return;
      e.preventDefault();
      const redo = y || e.shiftKey, label = redo ? this.redoLabel : this.undoLabel;
      if (redo ? this.redo() : this.undo()) announce(t(redo ? 'undo.redone' : 'undo.undone', { label: label || t('undo.untitled') }));
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }
  destroy() { this.clear(); this.off(); if (this.id && __undoReg.get(this.id) === this) __undoReg.delete(this.id); }
  _changed(action, entry) {
    const detail = { action, label: entry?.label || '', canUndo: this.canUndo, canRedo: this.canRedo, pointer: this._ptr, size: this._stack.length, manager: this };
    try { this.onChange?.(detail); } catch (err) { console.error('[Orion] UndoManager onChange', err); }
    this.emit('change', detail);
  }
}
O.UndoManager = UndoManager;
