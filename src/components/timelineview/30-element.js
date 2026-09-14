/* ── <o-timeline-view> element: props, layout, rendering, public API ─────── */
const TV_TIER_H = 24;
const TV_ROW_H = 24;
const TV_LANE_PAD = 8;
const TV_LANE_MIN = 34;
const TV_POINT_R = 5;
const TV_CLUSTER_PX = 26;
let __tvCtx = null;
const TV_ICONS = {
  'zoom-in': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M11 8v6M8 11h6"/>',
  'zoom-out': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M8 11h6"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
};
/** Icon from the registry, falling back to a small local set. */
function tvIcon(name, cls = '') {
  if (O.icons?.has?.(name) && !TV_ICONS[name]) return icon(name, { class: cls });
  const body = TV_ICONS[name] || '';
  return raw(`<svg class="o-icon o-icon-${esc(name)} ${esc(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`);
}
function tvColor(c) {
  if (!c) return '';
  const s = String(c).trim();
  if (/^(primary|secondary|success|danger|warning|info|light|dark)$/.test(s)) return `var(--o-${s})`;
  if (/^chart-[1-8]$/.test(s)) return `var(--o-${s})`;
  if (/^--[\w-]+$/.test(s)) return `var(${s})`;
  return /^[#\w\s(),.%/+-]+$/.test(s) ? s : '';
}

class OTimelineView extends OElement {
  static props = {
    items: { type: Array, default: () => [] },
    groups: { type: Array, default: () => null },
    start: Any,
    end: Any,
    zoomMin: { type: Number, default: 60000 },
    zoomMax: { type: Number, default: 20 * 365.25 * 864e5 },
    stack: { type: Boolean, default: true },
    editable: Boolean,
    selectable: { type: Boolean, default: true },
    now: Boolean,
    toolbar: { type: Boolean, default: true },
    height: String,
    groupsWidth: Number,
    label: String,
    itemTemplate: Function,
    groupTemplate: Function,
    texts: Object,
  };

  /* ── lifecycle ── */
  setup() {
    this._uid = uid('tv');
    this._recs = []; this._groupsList = []; this._level = new Map(); this._parentOf = new Map(); this._hasGroups = false;
    this._byKeyMap = new Map();
    this._collapsed = new Set();
    this._sel = new Set();
    this._laneY = new Map(); this._laneUnits = new Map(); this._laneBg = new Map(); this._order = [];
    this._start = null; this._end = null;
    this._chartW = 640; this._chartH = 240; this._pxPerMs = 1;
    this._layoutV = 0;
    this.classList.add('o-tv');
    if (!this.hasAttribute('role')) this.setAttribute('role', 'group');
    this._build();
    this._bindChart();
    this._bindKeys();
    this._bindToolbar();
    this._itemEls = new Map(); this._itemFree = [];
  }
  connected() {
    this.listen(this._chartEl, 'scroll', () => this._onVScroll('chart'), { passive: true });
    this.listen(this._groupsBody, 'scroll', () => this._onVScroll('groups'), { passive: true });
    this.addCleanup(observeResize(this, () => this._onResize()));
    const tick = setInterval(() => { if (this.now) this._renderNow(); }, 30000);
    this.addCleanup(() => clearInterval(tick));
    this.addCleanup(() => { this._drag?.cancel?.(); this._hideTip?.(); });
    if (this._setupDone) requestAnimationFrame(() => this.isConnected && this._onResize());
  }
  disconnected() { this._hideTip?.(); }

  /* ── DOM skeleton ── */
  _build() {
    const id = this._uid;
    this._tb = h('div', { class: 'o-tv-toolbar', role: 'toolbar' });
    this._corner = h('div', { class: 'o-tv-corner' });
    this._tierTop = h('div', { class: 'o-tv-tier is-top' });
    this._tierBot = h('div', { class: 'o-tv-tier is-bottom' });
    this._axis = h('div', { class: 'o-tv-axis' }, this._tierTop, this._tierBot);
    this._head = h('div', { class: 'o-tv-head' }, this._corner, this._axis);
    this._groupsBody = h('div', { class: 'o-tv-groups o-scroll' });
    this._bg = h('div', { class: 'o-tv-bg' });
    this._itemsLayer = h('div', { class: 'o-tv-items' });
    this._now = h('div', { class: 'o-tv-now', hidden: true });
    this._brush = h('div', { class: 'o-tv-brush', hidden: true });
    this._dragTip = h('div', { class: 'o-tv-dragtip', hidden: true, 'aria-hidden': 'true' });
    this._canvas = h('div', { class: 'o-tv-canvas' }, this._bg, this._itemsLayer, this._now, this._brush, this._dragTip);
    this._chartEl = h('div', { class: 'o-tv-chart o-scroll', tabindex: '0', role: 'region', 'aria-describedby': id + '-kbd' }, this._canvas);
    this._body = h('div', { class: 'o-tv-body' }, this._groupsBody, this._chartEl);
    this._empty = h('div', { class: 'o-tv-empty o-empty o-empty-sm', hidden: true });
    this._kbdHint = h('div', { class: 'o-sr-only', id: id + '-kbd' });
    this.replaceChildren(this._tb, this._head, this._body, this._empty, this._kbdHint);
  }
  _renderToolbar() {
    const tb = this._tb;
    tb.hidden = !this.toolbar;
    if (!this.toolbar) return;
    tb.setAttribute('aria-label', this.t('timelineView.toolbar'));
    const btn = (act, label, ic) => h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm o-btn-icon', 'data-act': act, 'aria-label': label, title: label }, tvIcon(ic));
    tb.replaceChildren(
      btn('zoom-out', this.t('timelineView.zoomOut'), 'zoom-out'),
      btn('zoom-in', this.t('timelineView.zoomIn'), 'zoom-in'),
      btn('fit', this.t('timelineView.fit'), 'maximize'),
      h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', 'data-act': 'now' }, tvIcon('target'), h('span', { class: 'o-tv-tb-text' }, this.t('timelineView.now'))),
      h('span', { class: 'o-tv-spacer' }),
    );
  }
  _bindToolbar() {
    on(this._tb, 'click', 'button', (e, b) => {
      switch (b.dataset.act) {
        case 'zoom-in': this.zoom(0.35); break;
        case 'zoom-out': this.zoom(-0.35); break;
        case 'fit': this.fit(); break;
        case 'now': this.moveTo(Date.now(), {}); break;
      }
    });
  }

  update(changed) {
    const all = changed.has('init');
    if (all || changed.has('label') || changed.has('locale')) this.setAttribute('aria-label', this.label || this.t('timelineView.label'));
    if (all || changed.has('height')) this.style.setProperty('--o-tv-h', this.height || '');
    if (changed.has('items') || changed.has('groups')) this._load();
    if ((changed.has('start') || changed.has('end')) && !this.__winGuard) {
      const s = tvMs(this.start), e = tvMs(this.end);
      if (s != null && e != null && e > s) { this._start = s; this._end = e; }
    }
    if (all && this._start == null) this._initialWindow();
    if (all || changed.has('toolbar') || changed.has('locale')) this._renderToolbar();
    this.classList.toggle('is-editable', !!this.editable);
    this._kbdHint.textContent = this.t('timelineView.keyboard');
    this._layout();
    this._render(true);
  }

  /* ── model ── */
  _load() {
    const norm = tvNormalize(this.items, this.groups);
    this._recs = norm.items; this._groupsList = norm.groups; this._level = norm.level; this._parentOf = norm.parentOf; this._hasGroups = norm.hasGroups;
    this._collapsed = new Set(this._groupsList.filter(g => g.collapsed).map(g => g.key));
    for (const k of [...this._sel]) if (!this._recs.some(r => r.key === k)) this._sel.delete(k);
  }
  _initialWindow() {
    const ext = tvExtent(this._recs), now = Date.now();
    let s, e;
    if (this.start != null || this.end != null) {
      s = tvMs(this.start) ?? (ext ? ext.min : now - TV_MS.d);
      e = tvMs(this.end) ?? (ext ? ext.max : now + TV_MS.d);
    } else if (ext) {
      const pad = Math.max((ext.max - ext.min) * 0.08, TV_MS.h);
      s = ext.min - pad; e = ext.max + pad;
    } else { s = now - 3 * TV_MS.d; e = now + 4 * TV_MS.d; }
    if (e <= s) e = s + TV_MS.h;
    this._setWindowProps(s, e, { emit: false });
  }
  _setWindowProps(s, e, { emit: doEmit = true } = {}) {
    this._start = s; this._end = e;
    this.__winGuard = true;
    this.start = new Date(s); this.end = new Date(e);
    this.__winGuard = false;
    if (doEmit) this.emit('range-change', { start: new Date(s), end: new Date(e) }, { cancelable: false });
  }
  _rec(k) { return this._byKeyMap.get(k); }
  /** Internal group record -> public group object, with `collapsed` reflecting live toggle state (not just the initial data). */
  _publicGroup(g) {
    const o = tvPublicGroup(g);
    if (this._collapsed.has(g.key)) o.collapsed = true; else delete o.collapsed;
    return o;
  }
  _keyOf(id) {
    if (id == null) return null;
    const s = String(id);
    const r = this._recs.find(x => String(x.id) === s);
    return r ? r.key : (this._byKeyMap.has(s) ? s : null);
  }
  _idOf(k) { return this._rec(k)?.id ?? k; }
  _canEdit(r) { return r.type !== 'background' && (r.editable !== undefined ? r.editable : !!this.editable); }
  _canSelect(r) { return r.selectable !== undefined ? r.selectable : !!this.selectable; }

  /* ── layout (stacking + clustering; recomputed on data/zoom changes) ── */
  _visibleLaneGroups() {
    if (!this._hasGroups) return [{ key: null, group: null, level: 0 }];
    const out = [];
    const hiddenAncestor = k => { for (let p = this._parentOf.get(k); p != null; p = this._parentOf.get(p)) if (this._collapsed.has(p)) return true; return false; };
    for (const g of this._groupsList) { if (g.visible === false || hiddenAncestor(g.key)) continue; out.push({ key: g.key, group: g, level: this._level.get(g.key) || 0 }); }
    if (this._recs.some(r => r.group == null)) out.push({ key: null, group: null, level: 0 });
    return out;
  }
  _measure(text) {
    if (!text) return 0;
    if (!this._mcache || this._mcache.v !== this._layoutV) {
      const cs = getComputedStyle(this._itemsLayer);
      this._mcache = { v: this._layoutV, font: `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, map: new Map() };
    }
    const m = this._mcache;
    let w = m.map.get(text);
    if (w == null) {
      if (!__tvCtx) __tvCtx = doc.createElement('canvas').getContext('2d');
      __tvCtx.font = m.font;
      w = __tvCtx.measureText(text).width;
      if (m.map.size > 4000) m.map.clear();
      m.map.set(text, w);
    }
    return w;
  }
  _pointHalfWidth(rec) {
    const label = isStr(rec.content) ? rec.content : '';
    const w = label ? this._measure(label) : 0;
    return Math.max(TV_POINT_R + 2, (w + 20) / 2);
  }
  /** Greedy pixel-based row assignment for one lane's non-background items (clusters dense points). */
  _stackLane(items, pxPerMs) {
    const points = items.filter(r => r.type === 'point').sort((a, b) => a.start - b.start);
    const ranges = items.filter(r => r.type === 'range');
    const units = [];
    let i = 0;
    while (i < points.length) {
      const members = [points[i]];
      let j = i + 1;
      while (j < points.length && (points[j].start - points[j - 1].start) * pxPerMs <= TV_CLUSTER_PX) { members.push(points[j]); j++; }
      if (members.length > 1) units.push({ kind: 'cluster', members, start: members[0].start, end: members[members.length - 1].start, halfW: 15 });
      else units.push({ kind: 'item', rec: members[0], start: members[0].start, end: members[0].start, halfW: this._pointHalfWidth(members[0]) });
      i = j;
    }
    for (const r of ranges) units.push({ kind: 'item', rec: r, start: r.start, end: r.end, halfW: 0 });
    units.sort((a, b) => a.start - b.start || a.end - b.end);
    const rowEnd = [];
    for (const u of units) {
      const x0 = u.start * pxPerMs - (u.halfW || 0), x1 = u.end * pxPerMs + (u.halfW || 0);
      let row = 0;
      if (this.stack) { while (row < rowEnd.length && rowEnd[row] > x0 - 4) row++; }
      u.row = row;
      rowEnd[row] = Math.max(rowEnd[row] ?? -Infinity, x1);
    }
    return { units, maxRow: rowEnd.length ? rowEnd.length - 1 : 0 };
  }
  _layout() {
    this._byKeyMap = new Map(this._recs.map(r => [r.key, r]));
    if (this._start == null) return;
    this._layoutV++;
    const lanes = this._visibleLaneGroups();
    const pxPerMs = this._chartW / Math.max(1, (this._end - this._start) || 1);
    this._pxPerMs = pxPerMs;
    const laneY = new Map(); const laneUnits = new Map(); const laneBg = new Map();
    let y = 0;
    for (const lane of lanes) {
      const items = this._recs.filter(r => r.group === lane.key);
      const bg = items.filter(r => r.type === 'background');
      const solid = items.filter(r => r.type !== 'background');
      const { units, maxRow } = this._stackLane(solid, pxPerMs);
      const h2 = lane.group?.height != null ? lane.group.height : Math.max(TV_LANE_MIN, (maxRow + 1) * TV_ROW_H + TV_LANE_PAD * 2);
      laneY.set(lane.key, { top: y, height: h2, level: lane.level, group: lane.group });
      laneUnits.set(lane.key, units);
      laneBg.set(lane.key, bg);
      y += h2;
    }
    this._laneY = laneY; this._laneUnits = laneUnits; this._laneBg = laneBg;
    this._order = lanes.map(l => l.key);
    this._totalH = y;
    this._sizeLayout();
    this._layoutDone = true;
  }
  _sizeLayout() {
    this.style.setProperty('--o-tv-groups-w', (this._hasGroups ? this._groupsW() : 0) + 'px');
    this.classList.toggle('has-groups', this._hasGroups);
    this._canvas.style.height = this._totalH + 'px';
    this._bg.style.height = this._totalH + 'px';
    this._groupsBody.style.height = this._totalH + 'px';
    const ce = this._chartEl;
    this._chartW = ce.clientWidth || this._chartW;
    this._chartH = ce.clientHeight || this._chartH;
    this._empty.hidden = this._recs.length > 0;
    if (!this._recs.length) this._empty.innerHTML = `<div class="o-empty-icon">${icon('calendar')}</div><p class="o-empty-title">${esc(this.t('timelineView.noItems'))}</p>`;
  }
  _groupsW() {
    if (this.groupsWidth) return clamp(+this.groupsWidth, 80, Math.max(120, (this.offsetWidth || 600) - 160));
    return 160;
  }
  _onResize() {
    const cw = this._chartEl.clientWidth;
    this.classList.toggle('is-narrow', this.offsetWidth < 640);
    if (!cw) return;
    this._chartW = cw;
    if (this._start == null) this._initialWindow();
    this._layout(); this._render(true);
  }
  _onVScroll(from) {
    const st = (from === 'chart' ? this._chartEl : this._groupsBody).scrollTop;
    const other = from === 'chart' ? this._groupsBody : this._chartEl;
    if (Math.abs(other.scrollTop - st) >= 1) other.scrollTop = st;
  }

  /* ── x <-> time ── */
  _x(t) { return (t - this._start) * this._pxPerMs; }
  _timeAt(x) { return this._start + x / this._pxPerMs; }

  /* ── render (cheap: axis, lanes, items, now-line; called on pan/zoom/data) ── */
  _render(force) {
    if (!this._layoutDone || !this.isConnected) return;
    this._renderAxis();
    this._renderGroups();
    this._renderBg();
    this._renderItems();
    this._renderNow();
  }
  _renderAxis() {
    const mpp = 1 / this._pxPerMs;
    const minor = tvStep(mpp), major = tvMajor(minor);
    const pad = this._chartW * 0.3 * mpp;
    const t0 = this._start - pad, t1 = this._end + pad;
    const majTicks = tvTicks(t0, t1, major), minTicks = tvTicks(t0, t1, minor);
    let top = '', bot = '';
    for (let i = 0; i < majTicks.length - 1; i++) {
      const a = majTicks[i], b = majTicks[i + 1], x = this._x(a), w = this._x(b) - x;
      top += `<div class="o-tv-tcell" style="inset-inline-start:${x}px;width:${w}px"><span>${esc(tvLabel(a, major, w, true, this))}</span></div>`;
    }
    for (let i = 0; i < minTicks.length - 1; i++) {
      const a = minTicks[i], b = minTicks[i + 1], x = this._x(a), w = this._x(b) - x;
      let c = 'o-tv-tcell';
      if (minor[0] === 'd') { const wd = new Date(a).getDay(); if (wd === 0 || wd === 6) c += ' is-weekend'; }
      bot += `<div class="${c}" style="inset-inline-start:${x}px;width:${w}px"><span>${esc(tvLabel(a, minor, w, false, this))}</span></div>`;
    }
    this._tierTop.innerHTML = top;
    this._tierBot.innerHTML = bot;
  }
  _renderGroups() {
    if (!this._hasGroups) { if (this._groupsBody.firstChild) this._groupsBody.replaceChildren(); return; }
    const frag = [];
    for (const key of this._order) {
      const ly = this._laneY.get(key);
      const g = ly.group;
      const row = h('div', { class: cls('o-tv-glabel', !g && 'is-ungrouped', g && g.nested.length && 'has-toggle'), style: `transform:translateY(${ly.top}px);height:${ly.height}px;--o-tv-level:${ly.level}`, 'data-k': key == null ? '' : key, role: 'row' });
      if (g && g.nested.length) row.append(h('span', { class: cls('o-tv-gtoggle', !this._collapsed.has(g.key) && 'is-open'), 'data-toggle': '' }, icon('chevron-right')));
      const content = g && isFn(this.groupTemplate) ? this.groupTemplate(this._publicGroup(g)) : null;
      const label = h('span', { class: 'o-tv-glabel-text' });
      if (content instanceof Node || content instanceof SafeHTML) append(label, content);
      else label.textContent = g ? String(g.content) : this.t('timelineView.other');
      row.append(label);
      frag.push(row);
    }
    this._groupsBody.replaceChildren(...frag);
  }
  _renderBg() {
    let s = '';
    for (const key of this._order) {
      const ly = this._laneY.get(key);
      s += `<div class="o-tv-lane" data-k="${key == null ? '' : esc(String(key))}" style="top:${ly.top}px;height:${ly.height}px"></div>`;
      for (const it of this._laneBg.get(key) || []) {
        const x0 = this._x(it.start), x1 = this._x(it.end ?? it.start);
        if (x1 < -80 || x0 > this._chartW + 80) continue;
        const color = tvColor(it.color);
        s += `<div class="o-tv-bgitem ${esc(it.className || '')}" style="inset-inline-start:${x0}px;width:${Math.max(1, x1 - x0)}px;top:${ly.top}px;height:${ly.height}px;${color ? `--o-tv-color:${color};` : ''}" title="${esc(it.title || '')}"></div>`;
      }
    }
    this._bg.innerHTML = s;
  }
  _renderItems() {
    const margin = Math.max(200, this._chartW * 0.5);
    const x0 = -margin, x1 = this._chartW + margin;
    const need = new Map();
    for (const key of this._order) {
      const ly = this._laneY.get(key);
      for (const u of this._laneUnits.get(key) || []) {
        const ux0 = this._x(u.start) - (u.halfW || 0), ux1 = this._x(u.kind === 'item' && u.rec.type === 'range' ? u.end : u.start) + (u.halfW || 0);
        if (ux1 < x0 || ux0 > x1) continue;
        const domKey = u.kind === 'cluster' ? 'c:' + u.members.map(m => m.key).join(',') : u.rec.key;
        need.set(domKey, { u, ly });
      }
    }
    for (const [k, el] of this._itemEls) if (!need.has(k)) { this._itemEls.delete(k); el.remove(); this._itemFree.push(el); }
    for (const [k, { u, ly }] of need) {
      let el = this._itemEls.get(k);
      if (!el) { el = this._itemFree.pop() || this._createItemEl(); this._itemEls.set(k, el); }
      this._updateItemEl(el, k, u, ly);
      if (el.parentNode !== this._itemsLayer) this._itemsLayer.append(el);
    }
    if (this._itemFree.length > 80) this._itemFree.length = 80;
  }
  _createItemEl() {
    return h('div', { class: 'o-tv-item' },
      h('span', { class: 'o-tv-item-label' }),
      h('span', { class: 'o-tv-handle is-start', 'data-h': 'start' }),
      h('span', { class: 'o-tv-handle is-end', 'data-h': 'end' }));
  }
  _updateItemEl(el, key, u, ly) {
    const y = ly.top + TV_LANE_PAD + u.row * TV_ROW_H, hgt = TV_ROW_H - 6;
    el.style.transform = `translateY(${y}px)`;
    const [label, hs, he] = el.children;
    if (u.kind === 'cluster') {
      const cx = this._x(u.start + (u.end - u.start) / 2);
      el.className = 'o-tv-item is-cluster';
      el.style.insetInlineStart = (cx - 14) + 'px'; el.style.width = '28px'; el.style.height = hgt + 'px';
      delete el.dataset.k; el.dataset.cluster = u.members.map(m => m.key).join(',');
      label.textContent = String(u.members.length);
      el.title = this.t('timelineView.cluster', { count: u.members.length });
      el.setAttribute('aria-label', this.t('timelineView.clusterLabel', { count: u.members.length, start: fmt.date(u.start), end: fmt.date(u.end) }));
      hs.hidden = he.hidden = true;
      return;
    }
    const r = u.rec, sel = this._sel.has(r.key), color = tvColor(r.color), canEdit = this._canEdit(r), canSel = this._canSelect(r);
    delete el.dataset.cluster; el.dataset.k = r.key;
    el.className = cls('o-tv-item', 'is-' + r.type, r.className, sel && 'is-selected', canEdit && 'is-editable', !canSel && 'is-unselectable');
    if (color) el.style.setProperty('--o-tv-color', color); else el.style.removeProperty('--o-tv-color');
    el.style.height = hgt + 'px';
    if (r.type === 'point') {
      const x = this._x(r.start), hw = u.halfW || 8;
      el.style.insetInlineStart = (x - hw) + 'px'; el.style.width = (hw * 2) + 'px';
    } else {
      const xa = this._x(r.start), xb = this._x(r.end);
      el.style.insetInlineStart = xa + 'px'; el.style.width = Math.max(3, xb - xa) + 'px';
    }
    const content = isFn(this.itemTemplate) ? this.itemTemplate(tvPublicItem(r)) : null;
    if (content instanceof Node || content instanceof SafeHTML) { label.replaceChildren(); append(label, content); }
    else label.textContent = content != null ? String(content) : (isStr(r.content) ? r.content : '');
    el.title = r.title || '';
    el.setAttribute('aria-selected', String(sel));
    const showHandles = r.type === 'range' && canEdit;
    hs.hidden = he.hidden = !showHandles;
  }
  _renderNow() {
    const show = !!this.now && Date.now() >= this._start && Date.now() <= this._end;
    this._now.hidden = !show;
    if (!show) return;
    this._now.style.insetInlineStart = this._x(Date.now()) + 'px';
  }

  /* ── selection ── */
  _setSelection(keys, { emitEvt = true } = {}) {
    const next = new Set(keys);
    let same = next.size === this._sel.size;
    if (same) for (const k of next) if (!this._sel.has(k)) { same = false; break; }
    this._sel = next;
    this._render(true);
    if (!same && emitEvt) this.emit('select', { ids: [...next].map(k => this._idOf(k)), items: [...next].map(k => tvPublicItem(this._rec(k))) }, { cancelable: false });
  }
  setSelection(ids) { this._sel = new Set(toArr(ids).map(id => this._keyOf(id)).filter(k => k != null)); this._render(true); }
  getSelection() { return [...this._sel].map(k => this._idOf(k)); }

  /* ── groups: collapse / expand ── */
  _toggleGroup(key, force) {
    const g = this._byGroupKey(key); if (!g || !g.nested.length) return;
    const collapse = force == null ? !this._collapsed.has(key) : !force;
    if (collapse === this._collapsed.has(key)) return;
    if (collapse) this._collapsed.add(key); else this._collapsed.delete(key);
    this._layout(); this._render(true);
    this.emit(collapse ? 'group-collapse' : 'group-expand', { id: g.id, group: this._publicGroup(g) }, { cancelable: false });
    announce(this.t(collapse ? 'timelineView.collapse' : 'timelineView.expand', { name: g.content }));
  }
  _byGroupKey(k) { return this._groupsList.find(g => g.key === k); }
  _groupKeyOf(id) {
    if (id == null) return null;
    const s = String(id);
    const g = this._groupsList.find(x => String(x.id) === s);
    return g ? g.key : (this._byGroupKey(s) ? s : null);
  }
  /** expandGroup(id) / collapseGroup(id) / toggleGroup(id) — programmatic group collapse (no-op on leaf groups). */
  expandGroup(id) { const k = this._groupKeyOf(id); if (k != null) this._toggleGroup(k, true); }
  collapseGroup(id) { const k = this._groupKeyOf(id); if (k != null) this._toggleGroup(k, false); }
  toggleGroup(id) { const k = this._groupKeyOf(id); if (k != null) this._toggleGroup(k); }

  /* ── window: fit / moveTo / zoom / setWindow ── */
  setWindow(start, end, opts = {}) {
    let s = tvMs(start), e = tvMs(end);
    if (s == null || e == null) return;
    if (e <= s) e = s + 60000;
    const span = clamp(e - s, this.zoomMin, this.zoomMax);
    const mid = (s + e) / 2;
    s = mid - span / 2; e = mid + span / 2;
    this._setWindowProps(s, e, { emit: opts.silent !== true });
    this._layout(); this._render(true);
  }
  /** fit({ items?: id[] }) — zoom/pan so every item (or a subset) is visible. */
  fit(opts = {}) {
    const ids = opts.items ? toArr(opts.items).map(String) : null;
    const recs = ids ? this._recs.filter(r => ids.includes(String(r.id))) : this._recs;
    const ext = tvExtent(recs);
    if (!ext) return;
    const pad = Math.max((ext.max - ext.min) * 0.08, TV_MS.h);
    this.setWindow(ext.min - pad, ext.max + pad, opts);
  }
  /** moveTo(time) — recenters the current window on `time` without changing its span. */
  moveTo(time, opts = {}) {
    const t = tvMs(time); if (t == null) return;
    const span = this._end - this._start;
    this.setWindow(t - span / 2, t + span / 2, opts);
  }
  /** zoom(percentage = 0.4, { anchor = 0.5 }) — positive zooms in, negative zooms out. */
  zoom(percentage = 0.4, opts = {}) {
    if (this._start == null) return;
    const span = this._end - this._start;
    const factor = percentage >= 0 ? (1 - Math.min(0.9, percentage)) : (1 + Math.min(4, -percentage));
    const anchor = clamp(opts.anchor ?? 0.5, 0, 1);
    const t = this._start + span * anchor;
    const ns = clamp(span * factor, this.zoomMin, this.zoomMax);
    this.setWindow(t - ns * anchor, t + ns * (1 - anchor), opts);
  }
  zoomIn(percentage = 0.4, opts) { this.zoom(percentage, opts); }
  zoomOut(percentage = 0.4, opts) { this.zoom(-percentage, opts); }

  /* ── items / groups public API (silent — like updateTask/select on o-gantt) ── */
  setItems(items) { this.items = toArr(items); }
  getItems() { return this._recs.map(tvPublicItem); }
  getItem(id) { const k = this._keyOf(id); return k == null ? null : tvPublicItem(this._rec(k)); }
  setGroups(groups) { this.groups = groups == null ? null : toArr(groups); }
  getGroups() { return this._groupsList.map(g => this._publicGroup(g)); }
  addItem(item = {}) {
    const exists = item.id != null && this._recs.some(r => String(r.id) === String(item.id));
    const key = item.id == null || exists ? tvNewId() : String(item.id);
    const rec = tvNormItem(item, key);
    this._recs = [...this._recs, rec];
    this._layout(); this._render(true);
    return rec.id;
  }
  updateItem(id, changes = {}) {
    const k = this._keyOf(id);
    if (k == null) return false;
    const r = this._rec(k);
    const raw = { id: r.id, content: r.content, start: r.start, end: r.type === 'point' ? undefined : r.end, group: r.group, type: r.type, className: r.className, color: r.color, editable: r.editable, selectable: r.selectable, title: r.title, data: r.data, ...r.extra, ...changes };
    const nr = tvNormItem(raw, k);
    this._recs = this._recs.map(x => (x.key === k ? nr : x));
    this._layout(); this._render(true);
    return true;
  }
  removeItem(id) {
    const k = this._keyOf(id);
    if (k == null) return false;
    this._recs = this._recs.filter(r => r.key !== k);
    this._sel.delete(k);
    this._layout(); this._render(true);
    return true;
  }
  refresh() { this._layout(); this._render(true); }
}
