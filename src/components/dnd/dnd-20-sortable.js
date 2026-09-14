/* Orion.sortable(container, options) -> { destroy, option, toArray, sort, items, cancel }
 *   Orion.sortable('#list', { handle: '.grip', group: 'tasks', onEnd: e => console.log(e.oldIndex, e.newIndex) });
 *   Orion.sortable(el, { group: { name: 'x', pull: 'clone', put: false }, sort: false });   // palette
 *   Orion.sortable(el, { controlled: true, onEnd: ({ oldIndex, newIndex }) => state.move(oldIndex, newIndex) });
 * Items are DIRECT children of the container. Lists, grids (wrap), connected lists, clone mode, nested lists,
 * keyboard DnD (Space/Enter, arrows, Escape) with announcements. DOM events: o-sort-start/-move/-change/-add/-remove/-update/-end.
 */
const SORT_DEFAULTS = {
  items: '*', handle: null, group: null, animation: 180, direction: 'auto', disabled: false, filter: null,
  ignore: 'input,textarea,select,option,button,label,summary,[contenteditable]:not([contenteditable="false"]),.o-no-drag',
  placeholderClass: 'o-sortable-placeholder', ghostClass: 'o-sortable-ghost', dragClass: 'o-sortable-drag',
  sort: true, delayOnTouch: 200, touchTolerance: 8, threshold: 4, autoScroll: true, scrollSensitivity: 56, scrollSpeed: 22,
  swapThreshold: 0.5, revertOnSpill: false, controlled: false, keyboard: true, pickKeys: [' ', 'Enter'],
  preview: null, ghostParent: 'body', data: null, label: null,
};
const ST = { cur: null };          // the running sort (pointer or keyboard)
const KB = { st: null, off: null }; // keyboard grab
let __instr = null;
function __instructionsId() {
  if (!__instr) {
    __instr = h('div', { id: 'o-dnd-instructions', class: 'o-sr-only' }, t('dnd.instructions'));
    doc.body.appendChild(__instr);
    bus.on('locale', () => { __instr.textContent = t('dnd.instructions'); });
  }
  if (!__instr.isConnected) doc.body.appendChild(__instr);
  return __instr.id;
}
function __normGroup(g) {
  if (g == null || g === false || g === '') return { name: null, pull: true, put: true };
  if (isStr(g)) return { name: g, pull: true, put: true };
  return { name: g.name ?? null, pull: g.pull ?? true, put: g.put ?? true };
}
function __pullMode(from, to, st) {
  if (to === from) return false;
  const p = from._group.pull;
  const r = isFn(p) ? p(to, from, st.item, st.session?.event) : p;
  return r === 'clone' ? 'clone' : !!r;
}
function __canPut(to, from, st) {
  if (to === from) return true;
  const g = to._group, p = g.put;
  if (isFn(p)) return !!p(to, from, st.item, st.session?.event);
  if (Array.isArray(p)) return p.includes(from._group.name);
  if (p === false) return false;
  return g.name != null && g.name === from._group.name;
}
function __label(st, item = st.item) {
  const l = st.from.o.label?.(item);
  return String(l || item.getAttribute('aria-label') || item.dataset.label || item.textContent.trim().replace(/\s+/g, ' ').slice(0, 80) || t('dnd.item'));
}
function __listLabel(inst) {
  const el = inst.el, by = el.getAttribute('aria-labelledby');
  return inst.o.listLabel || el.getAttribute('aria-label') || (by && doc.getElementById(by)?.textContent.trim()) || el.dataset.oSortableLabel || t('dnd.list');
}
function __nextItemOf(inst, node, skip) {
  for (let n = node; n; n = n.nextSibling) if (n.nodeType === 1 && n !== skip && inst._isItem(n)) return n;
  return null;
}
function __projIndex(inst, st, ref) {
  let n = 0;
  for (const it of inst.items()) {
    if (it === st.item || it === st.clone) continue;
    if (ref && (it === ref || (it.compareDocumentPosition(ref) & Node.DOCUMENT_POSITION_PRECEDING))) break;
    n++;
  }
  return n;
}
function __cols(items) {
  if (items.length < 2) return 1;
  const top = layoutRect(items[0]).top;
  let n = 0;
  for (const it of items) { if (Math.abs(layoutRect(it).top - top) < 4) n++; else break; }
  return Math.max(1, n);
}
function __clearItem(st) {
  const c = [st.from.o.placeholderClass, st.from.o.dragClass, st.to.o.placeholderClass, st.to.o.dragClass].filter(Boolean);
  st.item.classList.remove(...c);
}
/** Put the item back where it started (removes a clone). */
function __restoreDom(st) {
  const { item, origParent } = st;
  if (st.clone) { st.clone.remove(); st.clone = null; }
  const ref = st.origNext;
  if (ref && ref !== item && ref.parentNode === origParent) { origParent.insertBefore(item, ref); return; }
  const items = st.from.items().filter(i => i !== item);
  const at = items[st.oldIndex];
  origParent.insertBefore(item, at || (items.length ? items[items.length - 1].nextSibling : null));
}
function __affected(st, ...insts) {
  const s = new Set();
  for (const i of [st.from, st.to, ...insts]) if (i) i.items().forEach(x => s.add(x));
  if (st.clone) s.add(st.clone);
  return [...s];
}
function __evt(st, extra) {
  return { item: st.item, from: st.from.el, to: st.to.el, oldIndex: st.oldIndex, newIndex: st.to.indexOf(st.item), pullMode: st.pullMode, keyboard: !!st.keyboard, ...extra };
}
function __sortEnd(st, { cancelled = false, dropzone = null } = {}) {
  const { from, to, item } = st;
  if (ST.cur === st) ST.cur = null;
  const newIndex = cancelled || dropzone ? st.oldIndex : to.indexOf(item);
  const moved = !cancelled && !dropzone && (to !== from || newIndex !== st.oldIndex);
  const controlled = !!(from.o.controlled || to.o.controlled);
  const ev = {
    item, from: from.el, to: moved ? to.el : from.el, oldIndex: st.oldIndex, newIndex, pullMode: moved ? st.pullMode : false,
    clone: moved ? st.clone : null, cancelled, dropzone, keyboard: !!st.keyboard, controlled, revert: noop,
  };
  if (moved && controlled) { __restoreDom(st); ev.clone = null; __clearItem(st); }
  else if (moved) {
    const snap = { ...st };
    ev.revert = () => flip(__affected(snap), () => __restoreDom(snap), { duration: from.o.animation ?? 180 });
  }
  for (const s of DND.sortables) s.el.classList.remove('o-sortable-source', 'o-sortable-over', 'o-sortable-droppable');
  if (moved) {
    if (to !== from) { to._fire('add', ev, to.el); from._fire('remove', ev, from.el); }
    else from._fire('update', ev, from.el);
  }
  from._fire('end', ev, from.el);
  return ev;
}

class Sortable {
  constructor(el, options = {}) {
    this.el = el;
    this.options = this.o = { ...SORT_DEFAULTS, ...options };
    this._group = __normGroup(this.o.group);
    this._added = new WeakMap();
    el.__oSortable = this;
    DND.sortables.add(this);
    el.classList.add('o-sortable');
    this._offs = [on(el, 'pointerdown', e => this._down(e)), on(el, 'keydown', e => this._key(e)), touchGuard(el)];
    this._mo = new MutationObserver(() => this._prepare());
    this._mo.observe(el, { childList: true });
    this._prepare();
    this._setArea();
  }
  /* ── items ── */
  _itemSel() { let s = String(this.o.items || '*').trim(); if (s.startsWith('>')) s = s.slice(1).trim(); return s || '*'; }
  _isItem(n) { const sel = this._itemSel(); return n.nodeType === 1 && n.parentElement === this.el && !n.classList.contains('o-dnd-ghost') && (sel === '*' || n.matches(sel)); }
  items() { return [...this.el.children].filter(c => this._isItem(c)); }
  indexOf(item) { return this.items().indexOf(item); }
  _itemFrom(t) { for (let n = t; n && n !== this.el; n = n.parentElement) if (n.parentElement === this.el) return this._isItem(n) ? n : null; return null; }
  _mark(el, attr, val) { if (el.hasAttribute(attr)) return; el.setAttribute(attr, val); const s = this._added.get(el) || []; s.push(attr); this._added.set(el, s); }
  _setArea() {
    if (this._area && this._area.__oSortableArea === this) delete this._area.__oSortableArea;
    const a = this.o.area;
    this._area = !a ? null : a instanceof Element ? a : this.el.closest(a);
    if (this._area && this._area !== this.el) this._area.__oSortableArea = this;
  }
  _prepare() {
    const kb = this.o.keyboard && !this.o.disabled;
    const id = kb ? __instructionsId() : null;
    for (const it of this.items()) {
      const handles = this.o.handle ? $$(this.o.handle, it) : [];
      handles.forEach(hd => { hd.classList.add('o-dnd-handle'); if (kb) { if (hd.tabIndex < 0 && !hd.matches('button,a[href]')) this._mark(hd, 'tabindex', '0'); if (!hd.textContent.trim()) this._mark(hd, 'aria-label', t('dnd.handle')); this._mark(hd, 'aria-describedby', id); } });
      if (kb && !this.o.handle) { if (!it.hasAttribute('tabindex') && it.tabIndex < 0) this._mark(it, 'tabindex', '0'); this._mark(it, 'aria-describedby', id); }
    }
  }
  _dir() {
    const d = this.o.direction;
    if (d && d !== 'auto') return d;
    const cs = getComputedStyle(this.el);
    if (cs.display.includes('grid')) {
      if (cs.gridAutoFlow.startsWith('column')) return 'horizontal';
      return cs.gridTemplateColumns.split(' ').filter(Boolean).length > 1 ? 'grid' : 'vertical';
    }
    if (cs.display.includes('flex')) {
      if (!cs.flexDirection.startsWith('row')) return 'vertical';
      return cs.flexWrap === 'nowrap' ? 'horizontal' : 'grid';
    }
    const it = this.items();
    if (it.length > 1) { const a = layoutRect(it[0]), b = layoutRect(it[1]); if (Math.abs(a.top - b.top) < a.height / 2) return 'grid'; }
    return 'vertical';
  }
  _accepts(st) {
    if (this.o.disabled || st.item.contains(this.el)) return false;
    if (this === st.from) return true;
    return !!__pullMode(st.from, this, st) && __canPut(this, st.from, st);
  }
  _fire(name, ev, target) {
    const cb = this.o['on' + cap(name)];
    if (isFn(cb)) { try { cb.call(this, ev); } catch (e) { console.error('[Orion] sortable on' + cap(name), e); } }
    emit(target, 'o-sort-' + name, ev);
  }
  /* ── pointer ── */
  _down(e) {
    if (e.__oDnd || this.o.disabled || DND.session || DND.pending || KB.st) return;
    const tg = e.target.nodeType === 3 ? e.target.parentElement : e.target;
    const item = this._itemFrom(tg);
    if (!item) return;
    let handle = null;
    if (this.o.handle) { handle = tg.closest(this.o.handle); if (!handle || !item.contains(handle)) return; }
    if (this.o.filter) { const f = tg.closest(this.o.filter); if (item.matches(this.o.filter) || (f && item.contains(f))) return; }
    const ig = this.o.ignore && tg.closest(this.o.ignore);
    if (ig && ig !== item && item.contains(ig) && ig !== handle && !(handle && ig.contains(handle))) return;
    e.__oDnd = true;
    const o = this.o;
    dragStart(e, {
      el: item,
      data: () => (o.data ? o.data(item) : { item, from: this.el, index: this.indexOf(item), sortable: this }),
      threshold: o.threshold, delayOnTouch: handle ? 0 : o.delayOnTouch, touchTolerance: o.touchTolerance,
      preview: o.preview || 'clone', previewClass: o.ghostClass, ghostParent: o.ghostParent,
      autoScroll: o.autoScroll, scrollSensitivity: o.scrollSensitivity, scrollSpeed: o.scrollSpeed,
      stopZoneAt: n => !!(n.__oSortable && ST.cur && n.__oSortable._accepts(ST.cur)),
      onStart: s => { const st = this._begin(item, false, s); if (!st) return false; item.classList.add(o.placeholderClass); },
      onMove: s => this._pMove(s),
      onDrop: s => this._pDrop(s),
      onCancel: s => this._pCancel(s),
    });
  }
  _begin(item, keyboard, session) {
    if (ST.cur) return null;
    const st = { item, from: this, to: this, oldIndex: this.indexOf(item), origParent: this.el, origNext: item.nextSibling, clone: null, pullMode: false, keyboard, session, spill: false };
    ST.cur = st;
    item.classList.add(this.o.dragClass);
    this.el.classList.add('o-sortable-source', 'o-sortable-over');
    for (const s of DND.sortables) if (s !== this && s._accepts(st)) s.el.classList.add('o-sortable-droppable');
    this._fire('start', __evt(st), this.el);
    return st;
  }
  _pMove(s) {
    const st = ST.cur;
    if (!st || st.session !== s) return;
    if (s.dropzone) return;
    let target = null;
    for (let n = s.target; n && n.nodeType === 1; n = n.parentElement) { const i = n.__oSortable || n.__oSortableArea; if (i && i._accepts(st)) { target = i; break; } }
    st.spill = !target;
    if (!target) return;
    const ins = target._insertAt(st, s.x, s.y);
    if (ins) target._moveTo(st, ins, s.event);
  }
  /** Where would the dragged item go for a pointer at (x, y)? -> { ref, related, after } | null (no change) */
  _insertAt(st, x, y) {
    const item = st.item, inside = item.parentElement === this.el;
    if (this === st.from && !this.o.sort) return inside ? null : { ref: st.clone || st.origNext, related: null, after: false };
    const list = this.items();
    if (!list.some(i => i !== item)) {
      if (inside) return null;
      const last = list[list.length - 1];
      return { ref: last ? last.nextSibling : null, related: null, after: true };
    }
    let hit = null, hr = null, best = Infinity;
    for (const it of list) {
      const r = layoutRect(it);
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { hit = it; hr = r; best = 0; break; }
      if (it === item) continue;
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0, dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const d = dx * dx + dy * dy;
      if (d < best) { best = d; hit = it; hr = r; }
    }
    if (!hit || hit === item) return null;
    const dir = this._dir();
    const axis = dir === 'vertical' ? 'y' : dir === 'horizontal' ? 'x' : (y >= hr.top && y <= hr.bottom ? 'x' : 'y');
    let frac = axis === 'y' ? (y - hr.top) / (hr.height || 1) : (x - hr.left) / (hr.width || 1);
    if (axis === 'x' && isRTL(this.el)) frac = 1 - frac;
    let after;
    if (inside && best === 0) {
      const th = clamp(this.o.swapThreshold ?? 0.5, 0.05, 1);
      const itemFirst = !!(item.compareDocumentPosition(hit) & Node.DOCUMENT_POSITION_FOLLOWING);
      after = itemFirst ? frac > th : frac >= 1 - th;
    } else after = frac > 0.5;
    const ref = after ? hit.nextSibling : hit;
    if (inside && __nextItemOf(this, item.nextSibling, item) === __nextItemOf(this, ref, item)) return null;
    return { ref, related: hit, after };
  }
  _moveTo(st, ins, event) {
    const item = st.item, prev = st.to, ref = ins.ref === item ? item.nextSibling : ins.ref;
    const mv = { ...__evt(st), to: this.el, related: ins.related || null, willInsertAfter: !!ins.after, newIndex: __projIndex(this, st, ref) };
    if (st.from.o.onMove?.(mv, st.session) === false) return false;
    if (this !== st.from && this.o.onMove?.(mv, st.session) === false) return false;
    if (emit(this.el, 'o-sort-move', mv).defaultPrevented) return false;
    const leaving = this !== st.from && item.parentElement === st.from.el;
    if (this !== st.from) st.pullMode = __pullMode(st.from, this, st);
    const els = __affected(st, this);
    flip(els, () => {
      if (leaving && st.pullMode === 'clone' && !st.clone) {
        const c = item.cloneNode(true);
        c.classList.remove(st.from.o.placeholderClass, st.from.o.dragClass, 'o-dnd-pressing');
        c.classList.add('o-sortable-clone');
        c.removeAttribute('id');
        item.parentElement.insertBefore(c, item);
        st.clone = c;
      }
      this.el.insertBefore(item, ref);
      if (this === st.from && st.clone) { st.clone.remove(); st.clone = null; st.pullMode = false; }
    }, { duration: this.o.animation ?? 180 });
    if (prev !== this) { prev.el.classList.remove('o-sortable-over'); this.el.classList.add('o-sortable-over'); st.to = this; }
    const ev = __evt(st);
    const cb = st.from.o.onChange;
    if (isFn(cb)) { try { cb(ev); } catch (e) { console.error(e); } }
    emit(this.el, 'o-sort-change', ev);
    return true;
  }
  _pDrop(s) {
    const st = ST.cur;
    if (!st || st.session !== s) return;
    if (s.dropzone) {
      flip(__affected(st), () => __restoreDom(st), { duration: 0 });
      __clearItem(st); s.settle(null);
      __sortEnd(st, { dropzone: s.dropzone });
      return;
    }
    const dur = st.to.o.animation ?? 180;
    if (st.spill && (st.to.o.revertOnSpill || st.from.o.revertOnSpill)) {
      flip(__affected(st), () => __restoreDom(st), { duration: dur });
      s.settle(layoutRect(st.item), dur).then(() => __clearItem(st));
      __sortEnd(st, { cancelled: true });
      return;
    }
    const rect = layoutRect(st.item);
    const ev = __sortEnd(st);
    if (ev.controlled) s.settle(null);
    else s.settle(rect, dur).then(() => __clearItem(st));
  }
  _pCancel(s) {
    const st = ST.cur;
    if (!st || st.session !== s) return;
    const dur = st.from.o.animation ?? 180;
    flip(__affected(st), () => __restoreDom(st), { duration: dur });
    s.settle(layoutRect(st.item), dur).then(() => __clearItem(st));
    __sortEnd(st, { cancelled: true });
  }
  /* ── keyboard ── */
  _key(e) {
    if (e.defaultPrevented || !this.o.keyboard || this.o.disabled || KB.st || DND.session) return;
    if (e.altKey || e.ctrlKey || e.metaKey || !(this.o.pickKeys || []).includes(e.key)) return;
    const tg = e.target, item = this._itemFrom(tg);
    if (!item) return;
    if (tg !== item && !(this.o.handle && tg.closest(this.o.handle) && item.contains(tg))) return;
    if (this.o.filter && item.matches(this.o.filter)) return;
    e.preventDefault(); e.stopPropagation();
    this.pick(item, tg);
  }
  /** Keyboard pick-up (also usable from code): arrows move it, Space/Enter drop, Escape cancels. */
  pick(item, focusEl = item) {
    const st = this._begin(item, true, null);
    if (!st) return;
    KB.st = st; st.focusEl = focusEl;
    const onKey = e => this._kbKey(e);
    const onOut = () => setTimeout(() => { if (KB.st === st && !st.item.contains(doc.activeElement)) this._kbDrop(true); }, 0);
    doc.addEventListener('keydown', onKey, true);
    item.addEventListener('focusout', onOut);
    KB.off = () => { doc.removeEventListener('keydown', onKey, true); item.removeEventListener('focusout', onOut); };
    announce(t('dnd.picked', { item: __label(st), index: st.oldIndex + 1, count: this.items().length }), 'assertive');
  }
  _kbKey(e) {
    const st = KB.st;
    if (!st) return;
    const k = e.key, stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (k === 'Escape') { stop(); this._kbDrop(true); return; }
    if ((st.from.o.pickKeys || []).includes(k)) { stop(); this._kbDrop(false); return; }
    if (k === 'Tab') { stop(); return; }
    const to = st.to, dir = to._dir(), rtl = isRTL(to.el);
    const L = rtl ? 'ArrowRight' : 'ArrowLeft', R = rtl ? 'ArrowLeft' : 'ArrowRight';
    const items = to.items(), i = items.indexOf(st.item);
    let j = null, cross = null;
    if (k === 'Home') j = 0;
    else if (k === 'End') j = items.length - 1;
    else if (dir === 'vertical') { if (k === 'ArrowUp') j = i - 1; else if (k === 'ArrowDown') j = i + 1; else if (k === 'ArrowLeft' || k === 'ArrowRight') cross = k; }
    else if (dir === 'horizontal') { if (k === L) j = i - 1; else if (k === R) j = i + 1; else if (k === 'ArrowUp' || k === 'ArrowDown') cross = k; }
    else { const c = __cols(items); if (k === L) j = i - 1; else if (k === R) j = i + 1; else if (k === 'ArrowUp') j = i - c; else if (k === 'ArrowDown') j = i + c; }
    if (j == null && !cross) return;
    stop();
    if (j != null && j >= 0 && j < items.length) {
      if (j === i) return;
      if (to === st.from && !to.o.sort) { announce(t('dnd.blocked')); return; }
      const ref = j > i ? items[j].nextSibling : items[j];
      if (to._moveTo(st, { ref, related: items[j], after: j > i }, e)) this._kbFocus(st, 'moved');
      else announce(t('dnd.blocked'));
      return;
    }
    if (j != null) cross = k === 'ArrowUp' || k === 'ArrowDown' ? k : (j < 0 ? L : R);
    this._kbCross(st, cross, e);
  }
  _kbCross(st, arrow, e) {
    const ir = st.item.getBoundingClientRect(), cx = ir.left + ir.width / 2, cy = ir.top + ir.height / 2;
    const v = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[arrow];
    let best = null, bd = Infinity, pt = null;
    for (const s of DND.sortables) {
      if (s === st.to || !isVisible(s.el) || !s._accepts(st)) continue;
      const r = s.el.getBoundingClientRect();
      const px = clamp(cx, r.left, r.right), py = clamp(cy, r.top, r.bottom);
      const dx = px - cx, dy = py - cy, along = dx * v[0] + dy * v[1];
      if (along <= 0) continue;
      const d = along + Math.abs(dx * v[1] - dy * v[0]) * 2;
      if (d < bd) { bd = d; best = s; pt = [clamp(cx, r.left + 2, r.right - 2), clamp(cy, r.top + 2, r.bottom - 2)]; }
    }
    if (!best) { announce(t('dnd.blocked')); return; }
    const ins = best._insertAt(st, pt[0], pt[1]) || { ref: null, related: null, after: true };
    if (best._moveTo(st, ins, e)) this._kbFocus(st, 'movedList');
    else announce(t('dnd.blocked'));
  }
  _kbFocus(st, msg) {
    (st.focusEl && st.item.contains(st.focusEl) ? st.focusEl : st.item).focus({ preventScroll: true });
    st.item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const to = st.to;
    announce(t('dnd.' + msg, { index: to.indexOf(st.item) + 1, count: to.items().length, list: __listLabel(to) }), 'assertive');
  }
  _kbDrop(cancel) {
    const st = KB.st;
    if (!st) return;
    KB.st = null; KB.off?.(); KB.off = null;
    const item = st.item, focusEl = st.focusEl;
    if (cancel) flip(__affected(st), () => __restoreDom(st), { duration: st.from.o.animation ?? 180 });
    __clearItem(st);
    const ev = __sortEnd(st, { cancelled: cancel });
    const refocus = () => { const el = focusEl && focusEl.isConnected ? focusEl : item.isConnected ? item : null; if (el && doc.activeElement !== el) el.focus({ preventScroll: true }); };
    refocus();
    if (ev.controlled) requestAnimationFrame(() => requestAnimationFrame(refocus));
    const to = cancel ? st.from : st.to;
    announce(cancel ? t('dnd.cancelled', { item: __label(st), index: st.oldIndex + 1 })
      : t(ev.to !== ev.from ? 'dnd.droppedList' : 'dnd.dropped', { item: __label(st), index: ev.newIndex + 1, count: to.items().length, list: __listLabel(to) }), 'assertive');
  }
  /* ── public API ── */
  option(k, v) {
    if (v === undefined) return this.o[k];
    this.o[k] = v;
    if (k === 'group') this._group = __normGroup(v);
    if (k === 'disabled' || k === 'keyboard' || k === 'handle' || k === 'items') this._prepare();
    if (k === 'area') this._setArea();
    return this;
  }
  toArray(attr = 'data-id') { return this.items().map(i => i.getAttribute(attr)); }
  sort(ids, animate = true, attr = 'data-id') {
    const items = this.items(), map = new Map(items.map(i => [i.getAttribute(attr), i]));
    const ordered = ids.map(id => map.get(String(id))).filter(Boolean);
    const all = [...ordered, ...items.filter(i => !ordered.includes(i))];
    const run = () => {
      const mark = doc.createComment('');
      this.el.insertBefore(mark, items.length ? items[items.length - 1].nextSibling : null);
      all.forEach(el => this.el.insertBefore(el, mark));
      mark.remove();
    };
    animate ? flip(items, run, { duration: this.o.animation ?? 180 }) : run();
  }
  cancel() {
    const st = ST.cur;
    if (!st || (st.from !== this && st.to !== this)) return;
    if (st.keyboard) this._kbDrop(true); else st.session?.cancel();
  }
  destroy() {
    this.cancel();
    this._offs.forEach(f => f()); this._offs = [];
    this._mo.disconnect();
    for (const el of [...this.el.querySelectorAll('*')]) {
      const a = this._added.get(el);
      if (a) a.forEach(n => el.removeAttribute(n));
      el.classList.remove('o-dnd-handle');
    }
    this.el.classList.remove('o-sortable');
    if (this._area && this._area.__oSortableArea === this) delete this._area.__oSortableArea;
    delete this.el.__oSortable;
    DND.sortables.delete(this);
  }
}

/** Orion.sortable(container, options) */
O.sortable = function (container, options = {}) {
  const el = $(container);
  if (!el) throw new Error('Orion.sortable: container not found');
  if (el.__oSortable) { Object.entries(options).forEach(([k, v]) => el.__oSortable.option(k, v)); return el.__oSortable; }
  return new Sortable(el, options);
};
O.Sortable = Sortable;
