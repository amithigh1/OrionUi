/* Shared helpers for the editors package (rich editor, comments, mentions):
 *   Orion.editorKit.popover(anchor, contentEl, opts) -> { el, close(), update() }     floating panel (portal + autoPlace + overlays)
 *   Orion.editorKit.menu(anchor, items, opts)       -> handle                         role=menu with ListNav keyboard
 *   Orion.editorKit.caretRect(target, offset?)      -> DOMRect-like                   textarea/input (mirror div) or selection
 * anchor: Element | { getBoundingClientRect() } | { x, y, width?, height? }
 */

/** popover(anchor, content, { placement, offset, className, role, label, focus, trap, onClose, owner, returnFocus, zOffset }) */
function popover(anchor, content, o = {}) {
  const el = h('div', { class: cls('o-floating o-ek-pop', o.className), role: o.role || 'dialog', 'aria-label': o.label || null, tabindex: '-1' });
  if (o.role === 'dialog' || !o.role) el.setAttribute('aria-modal', 'false');
  append(el, content);
  const from = anchor instanceof Element ? anchor : o.owner instanceof Element ? o.owner : null;
  portal(el, from);
  let unplace = noop;
  const handle = { el, open: true, close: (reason = 'api') => ov.close(reason), update: () => place(el, anchor, opts) };
  const opts = { placement: o.placement || 'bottom-start', offset: o.offset ?? 6, flip: true, size: true };
  unplace = autoPlace(el, anchor, opts);
  const ov = overlays.open({
    el, owner: o.owner || (anchor instanceof Element ? anchor : null), trap: !!o.trap, returnFocus: o.returnFocus !== false, zOffset: o.zOffset || 0,
    onClose: reason => { handle.open = false; unplace(); el.remove(); o.onClose && o.onClose(reason); },
  });
  animate(el, 'zoomIn', { duration: 120 });
  if (o.focus) queueMicrotask(() => { if (!handle.open) return; if (o.focus instanceof Element) o.focus.focus({ preventScroll: true }); else focusFirst(el); });
  return handle;
}

/**
 * menu(anchor, items, { onSelect(item), label, placement, owner })
 * items: [{ id, label, icon, hint, shortcut, disabled, checked, danger, html } | '-' ]
 */
function menu(anchor, items, o = {}) {
  const list = h('div', { class: 'o-ek-menu', role: 'none' });
  items.forEach(it => {
    if (it === '-' || it.separator) { list.append(h('div', { class: 'o-ek-sep', role: 'separator' })); return; }
    const b = h('button', {
      type: 'button', class: cls('o-ek-item', it.danger && 'is-danger', it.checked && 'is-checked', it.className),
      role: it.checked != null ? 'menuitemcheckbox' : 'menuitem', tabindex: '-1', disabled: !!it.disabled, 'aria-checked': it.checked != null ? String(!!it.checked) : null,
      'data-id': it.id,
    });
    if (it.icon) b.append(it.icon instanceof Node ? it.icon : fromHTML(String(isStr(it.icon) && it.icon.trim().startsWith('<') ? it.icon : icon(it.icon))));
    const label = h('span', { class: 'o-ek-label' });
    if (it.html) label.innerHTML = String(it.html); else label.textContent = it.label ?? '';
    b.append(label);
    if (it.hint || it.shortcut) b.append(h('span', { class: 'o-ek-hint' }, it.shortcut || it.hint));
    b.__item = it;
    list.append(b);
  });
  let pop = null;
  const nav = new ListNav(list, { items: '.o-ek-item:not(:disabled)', onSelect: b => choose(b) });
  const choose = b => { const it = b.__item; pop.close('select'); o.onSelect && o.onSelect(it); };
  on(list, 'click', '.o-ek-item', (e, b) => choose(b));
  on(list, 'keydown', e => { if (e.key === 'Tab') { e.preventDefault(); pop.close('tab'); return; } nav.handle(e); });
  on(list, 'mousemove', '.o-ek-item', (e, b) => { if (doc.activeElement !== b) nav.setItem(b, { scroll: false }); });
  pop = popover(anchor, list, { role: 'menu', label: o.label, placement: o.placement || 'bottom-start', owner: o.owner, className: cls('o-ek-menu-pop', o.className), onClose: o.onClose });
  pop.el.setAttribute('role', 'menu');
  list.removeAttribute('role');
  const initial = items.findIndex(it => it && it.checked && it !== '-');
  queueMicrotask(() => { if (pop.open) nav.set(Math.max(0, nav.items.findIndex(b => b.__item === items[initial])), { scroll: false }); });
  pop.nav = nav;
  return pop;
}

const MIRROR_PROPS = ['boxSizing', 'width', 'height', 'overflowX', 'overflowY', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust', 'lineHeight',
  'fontFamily', 'textAlign', 'textTransform', 'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize', 'whiteSpace', 'wordBreak', 'overflowWrap', 'direction'];
/** caretRect(textareaOrInputOrNull, offset?) — viewport rect of a caret position. */
function caretRect(target, offset) {
  if (target && (target.localName === 'textarea' || target.localName === 'input')) {
    const pos = offset ?? target.selectionStart ?? 0;
    const cs = getComputedStyle(target);
    const div = h('div');
    MIRROR_PROPS.forEach(p => { div.style[p] = cs[p]; });
    Object.assign(div.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', overflow: 'hidden' });
    if (target.localName === 'textarea') { div.style.whiteSpace = 'pre-wrap'; div.style.overflowWrap = 'break-word'; }
    else { div.style.whiteSpace = 'pre'; div.style.height = 'auto'; }
    div.textContent = target.value.slice(0, pos);
    const span = h('span', { text: target.value.slice(pos) || '.' });
    div.append(span);
    doc.body.append(div);
    const r = target.getBoundingClientRect();
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
    const left = r.left + span.offsetLeft + parseFloat(cs.borderLeftWidth) - target.scrollLeft;
    const top = r.top + span.offsetTop + parseFloat(cs.borderTopWidth) - target.scrollTop;
    div.remove();
    return { x: left, y: top, left, top, width: 0, height: lh, right: left, bottom: top + lh };
  }
  const sel = doc.getSelection();
  if (!sel || !sel.rangeCount) return null;
  return rangeRect(sel.getRangeAt(0));
}
/** rangeRect(range) — rect of a (collapsed) range, with a fallback for empty lines. */
function rangeRect(range) {
  const r = range.cloneRange();
  r.collapse(true);
  let rect = r.getClientRects()[0];
  if (!rect || (rect.width === 0 && rect.height === 0 && rect.left === 0 && rect.top === 0)) {
    const node = r.startContainer;
    const el = node.nodeType === 1 ? (node.childNodes[r.startOffset] || node) : node.parentElement;
    if (el && el.nodeType === 1) {
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
      const x = isRTL(el) ? b.right - parseFloat(cs.paddingRight || 0) : b.left + parseFloat(cs.paddingLeft || 0);
      return { x, y: b.top + parseFloat(cs.paddingTop || 0), left: x, top: b.top + parseFloat(cs.paddingTop || 0), width: 0, height: lh, right: x, bottom: b.top + lh };
    }
    return null;
  }
  return { x: rect.left, y: rect.top, left: rect.left, top: rect.top, width: 0, height: rect.height, right: rect.left, bottom: rect.bottom };
}

O.editorKit = { popover, menu, caretRect, rangeRect };
