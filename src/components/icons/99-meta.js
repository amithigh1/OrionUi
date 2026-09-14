/* Metadata: aliases + categories, then one registration pass for the whole set */
const ALIASES = {
  // actions
  close: 'x', cancel: 'x', delete: 'trash', remove: 'trash', gear: 'settings', cog: 'settings', preferences: 'settings',
  pencil: 'edit', pen: 'edit', cut: 'scissors', floppy: 'save', 'clipboard-paste': 'paste', duplicate: 'copy',
  sync: 'refresh', reload: 'refresh', spinner: 'loader', loading: 'loader', 'magic-wand': 'wand', magic: 'wand-sparkles',
  rubber: 'eraser', vector: 'pen-tool', 'link-off': 'unlink', attachment: 'paperclip', attach: 'paperclip',
  'sort-ascending': 'sort-asc', 'sort-descending': 'sort-desc', adjustments: 'sliders', controls: 'sliders',
  'toggle-off': 'toggle-left', 'toggle-on': 'toggle-right', shutdown: 'power', login: 'log-in', 'sign-in': 'log-in',
  logout: 'log-out', 'sign-out': 'log-out', funnel: 'filter', report: 'flag', pushpin: 'pin', thumbtack: 'pin',
  'bookmark-add': 'bookmark-plus', 'upload-cloud': 'cloud-upload', 'download-cloud': 'cloud-download', 'read': 'check-check',
  // navigation & layout
  enter: 'corner-down-left', return: 'corner-down-left', drag: 'move', fullscreen: 'maximize', 'exit-fullscreen': 'minimize',
  sidebar: 'sidebar-left', 'panel-left': 'sidebar-left', 'panel-right': 'sidebar-right', board: 'kanban', 'columns-2': 'columns',
  grid: 'layout-grid', 'list-view': 'layout-list', 'list-bullet': 'list', 'bulleted-list': 'list', 'numbered-list': 'list-ordered',
  checklist: 'list-checks', todo: 'list-checks', window: 'browser', 'app-window': 'browser', apps: 'more-grid',
  grip: 'grip-vertical', handle: 'drag-handle', ellipsis: 'more-horizontal', kebab: 'more-vertical', hamburger: 'menu',
  // editor
  text: 'type', font: 'type', h1: 'heading-1', h2: 'heading-2', h3: 'heading-3', blockquote: 'quote', source: 'code',
  emoji: 'smile', mention: 'at-sign', hashtag: 'hash',
  // files & dev
  document: 'file-text', doc: 'file-text', 'new-file': 'file-plus', pdf: 'file-pdf', spreadsheet: 'file-spreadsheet',
  csv: 'file-spreadsheet', excel: 'file-spreadsheet', zip: 'file-zip', directory: 'folder', 'new-folder': 'folder-plus',
  offline: 'cloud-off', disk: 'hard-drive', drive: 'hard-drive', parcel: 'package', product: 'box', stack: 'layers',
  storage: 'database', db: 'database', hosting: 'server', cli: 'terminal', console: 'terminal', chip: 'cpu', processor: 'cpu',
  ram: 'memory-stick', memory: 'memory-stick', debug: 'bug', monitoring: 'activity', heartbeat: 'pulse', branch: 'git-branch',
  commit: 'git-commit', 'pull-request': 'git-pull-request', automation: 'workflow', hierarchy: 'sitemap', 'org-chart': 'sitemap',
  directions: 'route',
  // communication & people
  email: 'mail', envelope: 'mail', chat: 'message-circle', comment: 'message-square', conversation: 'messages',
  call: 'phone', 'hang-up': 'phone-off', 'video-camera': 'video', feed: 'rss', announcement: 'megaphone',
  notification: 'bell', notifications: 'bell', 'notifications-off': 'bell-off', alarm: 'alarm-clock',
  person: 'user', account: 'user-circle', avatar: 'user-circle', people: 'users', team: 'users', 'user-add': 'user-plus',
  'user-remove': 'user-minus', contacts: 'contact', 'address-book': 'contact', badge: 'id-card', verified: 'badge-check',
  vip: 'crown', premium: 'crown', a11y: 'accessibility', security: 'shield', protected: 'shield-check', password: 'key',
  unlock: 'lock-open', biometric: 'fingerprint', 'face-id': 'scan-face', hidden: 'eye-off', visible: 'eye',
  // commerce & charts
  cart: 'shopping-cart', bag: 'shopping-bag', payment: 'credit-card', card: 'credit-card', money: 'dollar-sign',
  dollar: 'dollar-sign', currency: 'dollar-sign', invoice: 'receipt', bill: 'receipt', price: 'tag', label: 'tag',
  coupon: 'tag', labels: 'tags', discount: 'percent', shop: 'store', delivery: 'truck', shipping: 'truck', qr: 'qr-code',
  savings: 'piggy-bank', finance: 'coins', growth: 'trending-up', decline: 'trending-down', 'bar-chart': 'chart-bar',
  analytics: 'chart-bar', stats: 'chart-bar', 'line-chart': 'chart-line', 'pie-chart': 'chart-pie', 'area-chart': 'chart-area',
  'scatter-chart': 'chart-scatter', speedometer: 'gauge', meter: 'gauge', slides: 'presentation',
  // devices & media
  mobile: 'smartphone', computer: 'desktop', pc: 'desktop', display: 'monitor', cursor: 'mouse-pointer', pointer: 'mouse-pointer',
  headset: 'headphones', wireless: 'wifi', antenna: 'radio', bolt: 'zap', flash: 'zap', lightning: 'zap', energy: 'zap',
  charging: 'battery-charging', microphone: 'mic', 'microphone-off': 'mic-off', photo: 'image', picture: 'image',
  gallery: 'images', movie: 'film', 'volume-2': 'volume', sound: 'volume', mute: 'volume-x', 'music-note': 'music',
  record: 'circle-dot', loop: 'repeat', random: 'shuffle', previous: 'skip-back', next: 'skip-forward',
  // places, time & weather
  house: 'home', location: 'map-pin', place: 'map-pin', explore: 'compass', world: 'globe', internet: 'globe', web: 'globe',
  office: 'building', company: 'building-2', bank: 'landmark', work: 'briefcase', flight: 'plane', airplane: 'plane',
  travel: 'plane', vehicle: 'car', bicycle: 'bike', launch: 'rocket', deploy: 'rocket', event: 'calendar',
  'calendar-add': 'calendar-plus', time: 'clock', stopwatch: 'timer', recent: 'history', restore: 'history',
  'light-mode': 'sun', 'dark-mode': 'moon', 'theme-toggle': 'sun-moon', weather: 'cloud-sun', rain: 'cloud-rain',
  snow: 'snowflake', temperature: 'thermometer', fire: 'flame', water: 'droplet', eco: 'leaf', nature: 'leaf',
  // status, objects & shapes
  warning: 'alert-triangle', error: 'x-circle', success: 'check-circle', danger: 'alert-octagon', question: 'help-circle',
  help: 'help-circle', 'add-circle': 'plus-circle', 'remove-circle': 'minus-circle', block: 'ban', forbidden: 'ban',
  like: 'thumbs-up', dislike: 'thumbs-down', favorite: 'heart', love: 'heart', rating: 'star', ai: 'sparkles',
  idea: 'lightbulb', bulb: 'lightbulb', goal: 'target', medal: 'award', prize: 'trophy', robot: 'bot', extension: 'puzzle',
  plugin: 'puzzle', theme: 'palette', color: 'palette', fill: 'paint-bucket', eyedropper: 'pipette', 'color-picker': 'pipette',
  measure: 'ruler', balance: 'scale', law: 'gavel', legal: 'gavel', medical: 'stethoscope', health: 'stethoscope',
  education: 'graduation-cap', school: 'graduation-cap', docs: 'book-open', documentation: 'book-open', news: 'newspaper',
  note: 'sticky-note', translate: 'languages', language: 'languages', cmd: 'command', alt: 'option',
};

/* Directional icons that mirror in right-to-left layouts (the core already flips arrows, chevrons, log-out, send). */
const RTL_FLIP = ['arrow-left-circle', 'arrow-right-circle', 'corner-down-left', 'corner-down-right', 'corner-up-left', 'corner-up-right',
  'chevron-first', 'chevron-last', 'undo', 'redo', 'reply', 'reply-all', 'forward', 'log-in', 'indent', 'outdent', 'list',
  'panel-left-close', 'panel-left-open']; // keep in sync with icons.css

(function publish() {
  const icons = O.icons;
  const coreAdd = icons.add;
  // one category per icon (first wins) + everything else from core goes to "Other"
  const seen = new Set();
  for (const c of Object.keys(CATS)) { CATS[c] = CATS[c].filter(n => !seen.has(n) && seen.add(n)); if (!CATS[c].length) delete CATS[c]; }
  const rest = icons.list().filter(n => !seen.has(n) && !(n in SET));
  if (rest.length) tag('Other', rest);

  const aliases = Object.create(null);
  const isCanonical = n => icons.has(n) && !(n in aliases);
  /** add({ name: markup }) — re-registering an icon updates its aliases; registering an alias name makes it a real icon */
  icons.add = function (map) {
    const out = { ...(map || {}) };
    for (const k in out) delete aliases[k];
    for (const a in aliases) if (aliases[a] in out) out[a] = out[aliases[a]];
    return coreAdd.call(icons, out);
  };
  /** alias('close', 'x') | alias({ close: 'x' }) — alternative names (never overrides a real icon) */
  icons.alias = function (name, target) {
    const map = isObj(name) ? name : { [name]: target };
    const add = {};
    for (const a in map) {
      const to = aliases[map[a]] || map[a];
      if (!isCanonical(to) || isCanonical(a)) continue;
      aliases[a] = to;
      add[a] = icons.get(to);
    }
    coreAdd.call(icons, add);
    return icons;
  };
  icons.aliases = aliases;
  icons.categories = CATS;
  icons.rtl = RTL_FLIP;
  /** resolve('close') -> 'x' */
  icons.resolve = name => aliases[name] || name;
  /** names() -> canonical icon names (aliases excluded), sorted */
  icons.names = () => icons.list().filter(n => !(n in aliases));
  /** aliasesOf('x') -> ['close', 'cancel'] */
  icons.aliasesOf = name => Object.keys(aliases).filter(a => aliases[a] === icons.resolve(name));
  /** categoryOf('x') -> 'Actions' */
  icons.categoryOf = name => { const n = icons.resolve(name); return Object.keys(CATS).find(c => CATS[c].includes(n)) || null; };
  /** search('arrow', limit?) -> ranked canonical names; matches names, aliases and categories.
   *  Literal (substring) matches win; loose fuzzy matching is only used when nothing matches literally. */
  icons.search = (q, limit) => {
    const extra = {};
    for (const a in aliases) (extra[aliases[a]] = extra[aliases[a]] || []).push(a);
    const items = icons.names().map(n => ({ n, text: [n, ...(extra[n] || []), icons.categoryOf(n) || ''].join(' ').toLowerCase() }));
    const words = String(q ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    const literal = words.length ? items.filter(x => words.every(w => x.text.includes(w))) : items;
    return fuzzySearch(literal.length ? literal : items, q, x => x.text, limit).map(x => x.n);
  };

  coreAdd.call(icons, SET);
  icons.alias(ALIASES);
})();
