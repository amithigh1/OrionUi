/* Upload — DOM helpers: reading drops (folders) and pastes, zone content per variant, list items, summary. */

/** Files from a drop. Directory entries are walked recursively (relative paths kept). Call synchronously in the drop handler. */
function filesFromDrop(dt) {
  const items = dt?.items ? [...dt.items].filter(i => i.kind === 'file') : [];
  const entries = items.map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
  const plain = [...(dt?.files || [])];
  if (!entries.some(e => e.isDirectory)) return Promise.resolve(plain);
  const out = [];
  const readAll = dir => new Promise(res => {
    const r = dir.createReader(), all = [];
    const next = () => r.readEntries(b => { if (!b.length) res(all); else { all.push(...b); next(); } }, () => res(all));
    next();
  });
  const walk = async e => {
    if (e.isFile) { const f = await new Promise(res => e.file(res, () => res(null))); if (f) { __paths.set(f, e.fullPath.replace(/^\//, '')); out.push(f); } }
    else if (e.isDirectory) for (const c of await readAll(e)) await walk(c);
  };
  return entries.reduce((p, e) => p.then(() => walk(e)), Promise.resolve()).then(() => out);
}
/** Files from a paste event; screenshots named "image.png" get a unique, dated name. */
function filesFromClipboard(cd, label = 'pasted') {
  let files = [...(cd?.files || [])];
  if (!files.length && cd?.items) files = [...cd.items].filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean);
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return files.map((f, i) => (/^image\//.test(f.type) && (!f.name || /^image\.\w+$/i.test(f.name))
    ? new File([f], `${label}-${stamp}${i ? '-' + (i + 1) : ''}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/\+.*/, '')}`, { type: f.type, lastModified: Date.now() })
    : f));
}
const hasFiles = e => !!e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
/** 'Drop or {browse}' + { browse: node } -> [text, node, text] */
function withNodes(text, nodes) {
  const out = [], re = /\{(\w+)\}/g;
  let last = 0, m;
  while ((m = re.exec(text))) { out.push(text.slice(last, m.index), nodes[m[1]] ?? m[0]); last = re.lastIndex; }
  out.push(text.slice(last));
  return out.filter(x => x !== '');
}
const iconNode = (name, cls) => iconEl(name, cls ? { class: cls } : undefined);
/** Animated check mark (success). */
const checkMark = () => fromHTML('<svg class="o-upload-check" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><path d="m7.5 12.5 3 3 6-6.5"/></svg>');

/* ── list items ────────────────────────────────────────────────────── */
const CHIP_COLOR = { validating: 'secondary', processing: 'secondary', queued: 'secondary', ready: 'info', uploading: 'primary', paused: 'warning', done: 'success', remote: 'success', error: 'danger', rejected: 'danger', canceled: 'secondary' };
const ACT_ICON = { pause: 'pause', resume: 'play', cancel: 'x', retry: 'refresh', remove: 'trash' };
function viewStatus(it, host) {
  if (it.remote) return 'remote';
  if (it.status === 'queued') return !host._hasTransport() ? '' : it.scheduled ? 'queued' : 'ready';
  return it.status;
}
function itemActions(it, host) {
  if (host.isDisabled) return [];
  const rm = host.readonly ? [] : ['remove'];
  switch (it.status) {
    case 'uploading': return ['pause', 'cancel'];
    case 'paused': return ['resume', 'cancel'];
    case 'error': case 'canceled': return ['retry', ...rm];
    case 'validating': case 'processing': return [];
    default: return rm;
  }
}
function createItem(it, host) {
  const r = {};
  const li = h('li', { class: 'o-upload-item', 'data-id': it.id, tabindex: '-1' },
    r.thumb = h('button', { type: 'button', class: 'o-upload-thumb', 'data-act': 'preview', tabindex: '-1' }),
    h('div', { class: 'o-upload-body' },
      h('div', { class: 'o-upload-line' }, r.name = h('span', { class: 'o-upload-name' }), r.chip = h('span', { class: 'o-badge o-upload-chip' })),
      h('div', { class: 'o-upload-meta' }, r.size = h('span', { class: 'o-upload-size' }), r.detail = h('span', { class: 'o-upload-detail' })),
      r.bar = h('div', { class: 'o-progress o-upload-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, r.fill = h('div', { class: 'o-progress-bar' })),
      r.error = h('div', { class: 'o-upload-error' })),
    r.actions = h('div', { class: 'o-upload-actions' }));
  li._r = r; li._k = {};
  renderItem(li, it, host);
  return li;
}
function renderItem(li, it, host) {
  const r = li._r, k = li._k, tr = (key, p) => host.t(key, p);
  const vs = viewStatus(it, host), p = it.progress;
  const set = (key, val, fn) => { if (k[key] !== val) { k[key] = val; fn(val); } };
  set('cls', it.status + '|' + vs + '|' + !!it.preview, () => {
    li.className = cls('o-upload-item', 'is-' + it.status, vs === 'remote' && 'is-remote', it.preview && 'has-preview', it._offline && 'is-offline');
  });
  set('name', it.relativePath || it.name, v => { r.name.textContent = v; r.name.title = v; });
  set('thumb', (it.preview || '') + '|' + it.type + '|' + it.name, () => {
    r.thumb.replaceChildren();
    if (it.preview) r.thumb.append(h('img', { src: it.preview, alt: '', decoding: 'async', draggable: 'false' }));
    else {
      const kd = fileKind(it);
      r.thumb.append(iconNode(kd.icon, 'o-upload-type-icon'));
      if (kd.ext) r.thumb.append(h('span', { class: ['o-upload-ext', 'o-c-' + kd.color] }, kd.ext));
    }
    r.thumb.append(h('span', { class: 'o-upload-done' }, checkMark()));
  });
  set('thumbLabel', tr('upload.preview') + ' ' + it.name, v => r.thumb.setAttribute('aria-label', v));
  r.thumb.disabled = !(it.file || it.url);
  set('size', it.size, v => { r.size.textContent = v || it.remote ? formatBytes(v) : ''; r.size.hidden = !v; });
  const chipText = !vs ? '' : vs === 'uploading' ? p.percent + '%' : tr('upload.status.' + vs);
  set('chip', vs + '|' + chipText, () => {
    r.chip.className = 'o-badge o-upload-chip o-badge-soft-' + (CHIP_COLOR[vs] || 'secondary');
    r.chip.replaceChildren(...(vs === 'done' || vs === 'remote' ? [iconNode('check')] : vs === 'validating' || vs === 'processing' ? [h('span', { class: 'o-spinner o-spinner-xs o-spinner-inherit' })] : []), chipText);
    r.chip.hidden = !chipText;
  });
  let detail = '';
  if (it.status === 'uploading' || (it.status === 'paused' && p.loaded)) {
    const parts = [tr('upload.of', { loaded: formatBytes(p.loaded), total: formatBytes(p.total) })];
    if (it.status === 'uploading' && p.speed > 0) parts.push(tr('upload.speed', { speed: formatBytes(p.speed) }));
    if (it.status === 'uploading' && p.eta != null && p.speed > 0) parts.push(tr('upload.eta', { time: fmt.duration(Math.max(1000, p.eta * 1000)) }));
    if (it._offline) parts.push(tr('upload.summaryOffline'));
    detail = parts.join(' · ');
  }
  set('detail', detail, v => { r.detail.textContent = v; r.detail.hidden = !v; });
  const showBar = it.status === 'uploading' || it.status === 'paused';
  set('bar', showBar ? p.percent : -1, v => {
    r.bar.hidden = v < 0;
    r.fill.style.setProperty('--o-value', Math.max(0, v) + '%');
    r.bar.setAttribute('aria-valuenow', String(Math.max(0, v)));
    r.bar.setAttribute('aria-label', it.name);
  });
  set('error', it.status === 'error' || it.status === 'rejected' ? it.error || '' : '', v => { r.error.textContent = v; r.error.hidden = !v; });
  const acts = itemActions(it, host);
  set('acts', acts.join() + '|' + host._locale, () => {
    r.actions.replaceChildren(...acts.map(a => h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm o-upload-act', 'data-act': a, title: tr('upload.' + a), 'aria-label': tr('upload.' + a) + ' ' + it.name }, iconNode(ACT_ICON[a]))));
  });
  set('aria', [it.name, formatBytes(it.size), chipText, it.error].filter(Boolean).join(', '), v => li.setAttribute('aria-label', v));
  li.draggable = !!host.sortable && !host.isDisabled;
}

/* ── zone content per variant ──────────────────────────────────────── */
function hintText(host) {
  if (host.hint != null && host.hint !== '') return host.hint;
  const parts = [], tr = (k, p) => host.t(k, p);
  const types = describeAccept(host.accept, tr);
  if (types) parts.push(types);
  const max = parseSize(host.maxSize);
  if (max) parts.push(tr(host.multiple ? 'upload.hintMaxSize' : 'upload.hintMaxSizeOne', { size: formatBytes(max) }));
  const total = parseSize(host.totalMaxSize);
  if (total && host.multiple) parts.push(tr('upload.hintTotal', { size: formatBytes(total) }));
  if (host.maxFiles > 0 && host.multiple) parts.push(tr('upload.hintMaxFiles', { count: host.maxFiles }));
  return parts.join(' · ');
}
function renderZone(host) {
  const z = host._zone, v = host.variant, tr = (k, p) => host.t(k, p), multi = host.multiple;
  const hint = hintText(host);
  host._hint.textContent = hint;
  host._hint.hidden = !hint || v === 'avatar';
  if (host._custom) { if (!z.contains(host._custom)) z.replaceChildren(host._custom); return; }
  const label = host.label || tr(host.directory ? 'upload.chooseFolder' : multi ? 'upload.choose' : 'upload.chooseOne');
  z.className = 'o-upload-zone';
  if (v === 'button') {
    z.classList.add('o-btn', 'o-btn-outline-primary');
    z.replaceChildren(iconNode(host.directory ? 'upload' : 'paperclip'), h('span', null, label));
  } else if (v === 'avatar') {
    z.replaceChildren(host._avatarView = h('span', { class: 'o-upload-avatar-view' }), h('span', { class: 'o-upload-avatar-overlay' }, iconNode('camera'), h('span', null, tr('upload.change'))), host._avatarRing = h('span', { class: 'o-progress-ring o-upload-avatar-ring', hidden: true }));
    host._avatarKey = null;
  } else if (v === 'compact') {
    z.replaceChildren(h('span', { class: 'o-upload-zone-btn' }, iconNode('upload'), h('span', null, label)), host._compactText = h('span', { class: 'o-upload-zone-text' }), host._compactBar = h('span', { class: 'o-upload-zone-bar', hidden: true }));
  } else {
    const title = host.label || tr(multi ? 'upload.title' : 'upload.titleOne');
    z.replaceChildren(
      h('span', { class: 'o-upload-zone-icon' }, iconNode('upload')),
      h('span', { class: 'o-upload-zone-text' },
        h('span', { class: 'o-upload-zone-title' }, withNodes(title, { browse: h('span', { class: 'o-upload-browse' }, tr('upload.browse')) })),
        h('span', { class: 'o-upload-zone-drop' }, tr('upload.dropActive'))));
  }
}
/** Summary bar: ring/bar + counts + bulk actions. */
function renderSummary(host) {
  const q = host._q, st = q.stats(), s = host._sum, tr = (k, p) => host.t(k, p);
  const single = !host.multiple || host.variant === 'avatar';
  const show = !single && st.count > 0 && host.summary !== false;
  s.root.hidden = !show;
  if (!show) return st;
  const transport = host._hasTransport();
  let title, sub = '';
  if (!transport) { title = tr('upload.selected', { count: st.count }); sub = formatBytes(st.total); }
  else if (st.queued && !st.scheduled && !st.uploading) { title = tr('upload.summaryQueued', { count: st.queued }); sub = formatBytes(st.total); }
  else if (st.done === st.count) { title = tr('upload.summaryDone', { count: st.done }); sub = formatBytes(st.total); }
  else {
    title = tr('upload.summary', { done: st.done, total: st.count });
    const parts = [tr('upload.of', { loaded: formatBytes(st.loaded), total: formatBytes(st.total) })];
    if (st.offline) parts.push(tr('upload.summaryOffline'));
    else if (st.uploading && st.speed > 0) { parts.push(tr('upload.speed', { speed: formatBytes(st.speed) })); if (st.eta != null) parts.push(tr('upload.eta', { time: fmt.duration(Math.max(1000, st.eta * 1000)) })); }
    else if (st.paused && !st.uploading) parts.push(tr('upload.summaryPaused'));
    if (st.error) parts.push(tr('upload.summaryErrors', { count: st.error }));
    sub = parts.join(' · ');
  }
  s.title.textContent = title;
  s.sub.textContent = sub;
  s.ring.hidden = !transport;
  s.ring.style.setProperty('--o-value', String(st.percent));
  s.ring.setAttribute('aria-valuenow', String(st.percent));
  s.ringText.textContent = st.done === st.count && st.count ? '' : st.percent + '%';
  s.ring.classList.toggle('is-done', st.count > 0 && st.done === st.count);
  s.root.classList.toggle('is-error', st.error > 0 && !st.uploading);
  const acts = [];
  if (!host.isDisabled) {
    if (transport && st.queued - st.scheduled > 0) acts.push(['upload', tr('upload.uploadAll', { count: st.queued - st.scheduled }), 'o-btn-primary', 'upload']);
    if (st.uploading || st.scheduled) acts.push(['pauseAll', tr('upload.pauseAll'), '', 'pause']);
    else if (st.paused) acts.push(['resumeAll', tr('upload.resumeAll'), '', 'play']);
    if (st.error) acts.push(['retryAll', tr('upload.retryAll'), '', 'refresh']);
    if (!host.readonly) {
      if (st.done && st.done < st.count && !st.uploading) acts.push(['clearDone', tr('upload.clearDone'), 'o-btn-ghost', '']);
      else if (!st.uploading) acts.push(['clear', tr('upload.clear'), 'o-btn-ghost', '']);
    }
  }
  const key = acts.map(a => a[0] + a[1]).join('|');
  if (s._key !== key) {
    s._key = key;
    s.actions.replaceChildren(...acts.map(([a, label, c, ic]) => h('button', { type: 'button', class: ['o-btn o-btn-sm', c], 'data-bulk': a }, ic ? iconNode(ic) : null, h('span', null, label))));
  }
  return st;
}
function buildSummary() {
  const s = {};
  s.root = h('div', { class: 'o-upload-summary', hidden: true },
    s.ring = h('div', { class: 'o-progress-ring o-upload-ring', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, s.ringText = h('span')),
    h('div', { class: 'o-upload-summary-text' }, s.title = h('div', { class: 'o-upload-summary-title' }), s.sub = h('div', { class: 'o-upload-summary-sub' })),
    s.actions = h('div', { class: 'o-upload-summary-actions' }));
  return s;
}
