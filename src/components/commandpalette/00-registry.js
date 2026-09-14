/* Orion.commands — the shared registry behind the command palette / <o-command-menu>.
 *   Orion.commands.register([{ id, title, subtitle, icon, section, keywords, shortcut,
 *     run(ctx), href, children, load: async (query) => Command[], when: () => bool, danger, badge }])
 *   Orion.commands.register({ id, section, icon, minChars, debounce, search: async (q, {signal}) => Command[] })  // async provider
 *   Orion.commands.register(() => Command[] | Promise<Command[]>)   // lazily resolved static list
 *   Orion.commands.unregister(id) removes a single command; every register() call also returns an unregister fn.
 */
i18n.add('en', {
  commandpalette: {
    placeholder: 'Type a command or search…', empty: 'No results for “{q}”', recent: 'Recent', commands: 'Commands',
    back: 'Back', navigate: 'Navigate', select: 'Select', close: 'Close', confirmAgain: 'Press again to confirm',
    loadingMore: 'Loading…', hotkeyLabel: 'Open command palette',
  },
});

const __cmds = new Map();     // id -> Command
const __providers = new Map(); // id -> provider
const __lazies = new Set();

function __norm(cmd) {
  const id = cmd.id || uid('cmd');
  return { section: '', keywords: [], danger: false, ...cmd, id };
}
async function __runLazy(fn, ids) {
  try {
    const list = await fn();
    for (const c of toArr(list)) { const norm = __norm(c); __cmds.set(norm.id, norm); ids.push(norm.id); }
    bus.emit('commands:change');
  } catch (e) { console.error('[Orion] commands: lazy provider failed', e); }
}

const commands = {
  /** register(commands[] | command | provider | () => commands) -> unregister() */
  register(x) {
    if (isFn(x)) {
      const ids = [];
      __lazies.add(x);
      __runLazy(x, ids);
      return () => { __lazies.delete(x); ids.forEach(id => __cmds.delete(id)); bus.emit('commands:change'); };
    }
    if (Array.isArray(x)) { const ids = x.map(c => commands.add(c)); return () => ids.forEach(id => commands.remove(id)); }
    if (isObj(x) && isFn(x.search)) {
      const id = x.id || uid('provider');
      __providers.set(id, { minChars: 1, debounce: 200, limit: 8, ...x, id });
      bus.emit('commands:change');
      return () => { __providers.delete(id); bus.emit('commands:change'); };
    }
    if (isObj(x)) { const id = commands.add(x); return () => commands.remove(id); }
    return noop;
  },
  /** add(command) -> id */
  add(cmd) { const norm = __norm(cmd); __cmds.set(norm.id, norm); bus.emit('commands:change'); return norm.id; },
  remove(id) { __cmds.delete(id); bus.emit('commands:change'); },
  unregister(id) { commands.remove(id); },
  update(id, patch) { const c = __cmds.get(id); if (c) { Object.assign(c, patch); bus.emit('commands:change'); } },
  get(id) { return __cmds.get(id); },
  clear() { __cmds.clear(); __providers.clear(); __lazies.clear(); bus.emit('commands:change'); },
  /** list({ includeHidden }) -> every registered command still passing when() */
  list({ includeHidden = false } = {}) { return [...__cmds.values()].filter(c => includeHidden || !c.when || c.when() !== false); },
  providers() { return [...__providers.values()]; },
};
O.commands = commands;
