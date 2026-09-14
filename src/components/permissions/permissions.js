/* Role- and permission-based UI.
 *   Orion.auth.setUser({ id, name, roles: ['editor'], permissions: ['users.view', 'posts.*', '-posts.delete'] })   ('-x' / '!x' = explicit deny)
 *   Orion.auth.defineRoles({ admin: ['*'], editor: { permissions: ['posts.*'], inherits: ['viewer'] }, viewer: ['*.view'] })
 *   Orion.can('users.edit') · can(['a', 'b']) (all) · can('a, b', { any: true }) · wildcards 'users.*', '*.view', '*'
 *   Orion.hasRole('admin') · hasRole('admin, manager') (any) · hasRole([…], { all: true }) · Orion.auth.user · onChange(fn) -> off()
 *   Orion.auth.guard('users.delete', onDenied?) -> boolean   ·   Orion.auth.protect('users.delete', fn, onDenied?) -> guarded fn
 *   <button data-o-permission="users.edit" data-o-denied="hide|disable|readonly|remove|blur" data-o-denied-message="…">
 *   <div data-o-role="admin,manager"> · data-o-permission-any · re-evaluated whenever the user changes
 *   <o-can permission="billing.view" role="admin" any mode="hide|remove"> … <template slot="denied">No access</template></o-can>
 * UI checks are cosmetic: always enforce permissions on the server.
 */
i18n.add('en', {
  permissions: {
    denied: 'You don’t have permission to do this.', restricted: 'Restricted content — you don’t have permission to view it.',
    needsPermission: 'Requires permission: {list}', needsRole: 'Requires role: {list}',
  },
});

const __auth = { user: null, roles: {} };
const __authEv = new Emitter();
const __list = v => (Array.isArray(v) ? v : String(v ?? '').split(/[\s,]+/)).map(s => String(s).trim()).filter(Boolean);

/** permission pattern match: 'users.*' ⊇ 'users.edit'; '*.view' ⊇ 'posts.view'; '*' ⊇ everything. Wildcards also allowed in the wanted permission. */
function permMatch(granted, wanted) {
  if (granted === '*' || granted === wanted) return true;
  const g = granted.split('.'), w = wanted.split('.');
  for (let i = 0; i < Math.max(g.length, w.length); i++) {
    if (g[i] === '*' && i === g.length - 1) return true;
    if (w[i] === '*' && i === w.length - 1) return i < g.length;
    if (g[i] === undefined || w[i] === undefined) return false;
    if (g[i] !== '*' && w[i] !== '*' && g[i] !== w[i]) return false;
  }
  return true;
}
function __roleClosure(roles) {
  const out = new Set(), walk = r => { if (out.has(r)) return; out.add(r); const def = __auth.roles[r]; if (isObj(def)) toArr(def.inherits).forEach(walk); };
  toArr(roles).forEach(walk);
  return [...out];
}
function __grants(u) {
  if (!u) return { allow: [], deny: [] };
  const all = [...toArr(u.permissions), ...__roleClosure(u.roles).flatMap(r => { const d = __auth.roles[r]; return toArr(isObj(d) ? d.permissions : d); })];
  return { allow: all.filter(p => !/^[-!]/.test(p)), deny: all.filter(p => /^[-!]/.test(p)).map(p => p.slice(1)) };
}
/** can(permission | [permissions] | 'a, b', { any, user }) */
function can(perm, { any = false, user } = {}) {
  const want = __list(perm);
  if (!want.length) return true;
  const { allow, deny } = __grants(user === undefined ? __auth.user : user);
  const one = p => !deny.some(d => permMatch(d, p)) && allow.some(g => permMatch(g, p));
  return any ? want.some(one) : want.every(one);
}
/** hasRole(role | [roles] | 'a, b', { all, user }) — any by default; inherited roles count */
function hasRole(role, { all = false, user } = {}) {
  const want = __list(role);
  if (!want.length) return true;
  const u = user === undefined ? __auth.user : user;
  if (!u) return false;
  const have = __roleClosure(u.roles);
  return all ? want.every(r => have.includes(r)) : want.some(r => have.includes(r));
}
function __denied(perm) {
  const msg = t('permissions.denied');
  announce(msg, 'assertive');
  if (isFn(O.toast)) { try { O.toast(msg, { type: 'danger' }); } catch {} }
  bus.emit('auth:denied', { permission: perm });
}
function __authChanged() {
  const d = { user: __auth.user };
  __authEv.emit('change', d);
  bus.emit('auth:change', d);
  if (isBrowser) { __permEls.forEach((st, el) => __permApply(el)); emit(doc, 'o-auth', d); }
}

const auth = {
  get user() { return __auth.user; },
  get isAuthenticated() { return !!__auth.user; },
  /** effective roles (with inherited ones) */
  get roles() { return __auth.user ? __roleClosure(__auth.user.roles) : []; },
  /** effective granted permission patterns */
  get permissions() { return __grants(__auth.user).allow; },
  setUser(user) { __auth.user = user ? { roles: [], permissions: [], ...user, roles: __list(user.roles), permissions: __list(user.permissions) } : null; __authChanged(); return auth; },
  /** update({ permissions: [...] }) — patch the current user */
  update(patch) { if (__auth.user) auth.setUser({ ...__auth.user, ...patch }); return auth; },
  clear() { return auth.setUser(null); },
  /** defineRoles({ role: ['perm', …] | { permissions, inherits } }) */
  defineRoles(map, { merge = true } = {}) { __auth.roles = merge ? { ...__auth.roles, ...map } : { ...map }; __authChanged(); return auth; },
  get roleMap() { return { ...__auth.roles }; },
  can, hasRole, match: permMatch,
  onChange(fn) { return __authEv.on('change', fn); },
  /** guard(permission, onDenied, { any, role }) -> true when allowed (else calls onDenied / default notice) */
  guard(perm, onDenied, { any = false, role } = {}) {
    const ok = can(perm, { any }) && (role == null || hasRole(role));
    if (!ok) (isFn(onDenied) ? onDenied : __denied)(perm, __auth.user);
    return ok;
  },
  /** protect(permission, fn, onDenied, opts) -> function that only runs fn when allowed */
  protect(perm, fn, onDenied, opts) { return function (...args) { return auth.guard(perm, onDenied, opts) ? fn.apply(this, args) : undefined; }; },
  /** Re-evaluate every [data-o-permission] / [data-o-role] element. */
  refresh() { __authChanged(); return auth; },
};

/* ── DOM: data-o-permission / data-o-role ──────────────────────────── */
const __permEls = new Map();   // el -> { mode, saved, ph }
const PERM_FIELDS = 'input,select,textarea,button,fieldset,[contenteditable]';
const __isControl = el => el instanceof FormElement || /^(INPUT|SELECT|TEXTAREA|FIELDSET|OPTGROUP|OPTION)$/.test(el.tagName);
const __isTextual = el => el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|range|color|file|image|hidden)$/i.test(el.type));
function __permAllowed(el) {
  const p = el.getAttribute('data-o-permission'), r = el.getAttribute('data-o-role');
  return (p == null || can(p, { any: el.hasAttribute('data-o-permission-any') })) && (r == null || hasRole(r));
}
function __permMsg(el) {
  const m = el.getAttribute('data-o-denied-message');
  if (m) return m;
  const p = el.getAttribute('data-o-permission'), r = el.getAttribute('data-o-role');
  return p ? t('permissions.needsPermission', { list: fmt.list(__list(p), el.hasAttribute('data-o-permission-any') ? 'disjunction' : 'conjunction') }) : r ? t('permissions.needsRole', { list: fmt.list(__list(r), 'disjunction') }) : t('permissions.denied');
}
const __block = e => { if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault(); e.stopImmediatePropagation(); };
function __save(st, el, attrs) { attrs.forEach(a => { if (!(a in st.saved)) st.saved[a] = el.getAttribute(a); }); }
function __setTip(st, el, msg) {
  if (isFn(O.tooltip)) { __save(st, el, ['data-o-tooltip']); el.setAttribute('data-o-tooltip', msg); }
  else { __save(st, el, ['title']); el.setAttribute('title', msg); }
  __save(st, el, ['aria-description']); el.setAttribute('aria-description', msg);
}
function __permDeny(el, st, mode) {
  st.mode = mode; st.saved = {}; st.props = [];
  const msg = __permMsg(el);
  const prop = (node, k, v) => { st.props.push([node, k, node[k]]); node[k] = v; };
  if (mode === 'remove') {
    st.ph = doc.createComment(' o-permission ');
    el.__oPermRemoved = true;
    el.replaceWith(st.ph);
  } else if (mode === 'disable') {
    if (__isControl(el)) prop(el, 'disabled', true);
    else {
      __save(st, el, ['aria-disabled', 'tabindex', 'href', 'role']);
      el.setAttribute('aria-disabled', 'true');
      el.classList.add('is-disabled');
      if (el.tagName === 'A' && el.hasAttribute('href')) { el.removeAttribute('href'); el.setAttribute('role', 'link'); }
      if (!el.hasAttribute('tabindex') && !focusables(el.parentElement || doc.body).includes(el)) el.setAttribute('tabindex', '0');
      el.addEventListener('click', __block, true); el.addEventListener('keydown', __block, true);
    }
    __setTip(st, el, msg);
  } else if (mode === 'readonly') {
    if (el.tagName === 'FIELDSET') {
      // A <fieldset> has no native readonly state; disabling it cascades to every descendant control
      // (including nested FormElements via formDisabledCallback), which is the only way to actually lock it.
      prop(el, 'disabled', true);
    } else {
      const list = el.matches(PERM_FIELDS) || el instanceof FormElement ? [el] : [...$$(PERM_FIELDS, el), ...$$('*', el).filter(x => x instanceof FormElement)];
      list.forEach(c => {
        if (c instanceof FormElement) prop(c, 'readonly', true);
        else if (__isTextual(c)) prop(c, 'readOnly', true);
        else if (c.isContentEditable) { st.props.push([c, 'contentEditable', c.contentEditable]); c.contentEditable = 'false'; }
        else if (!/^(BUTTON|FIELDSET)$/.test(c.tagName)) prop(c, 'disabled', true);
      });
    }
    __save(st, el, ['aria-readonly']); el.setAttribute('aria-readonly', 'true');
    el.classList.add('o-perm-readonly');
    __setTip(st, el, msg);
  } else if (mode === 'blur') {
    prop(el, 'inert', true);
    el.classList.add('o-perm-blur');
    st.sr = h('span', { class: 'o-sr-only o-perm-sr' }, el.getAttribute('data-o-denied-message') || t('permissions.restricted'));
    el.after(st.sr);
  } else {
    st.mode = 'hide';
    el.classList.add('o-perm-hidden');
  }
  st.applied = true;
}
function __permRestore(el, st) {
  if (!st.applied) return;
  if (st.mode === 'remove' && st.ph) { st.ph.isConnected ? st.ph.replaceWith(el) : 0; st.ph = null; delete el.__oPermRemoved; }
  el.classList.remove('o-perm-hidden', 'o-perm-blur', 'o-perm-readonly', 'is-disabled');
  el.removeEventListener('click', __block, true); el.removeEventListener('keydown', __block, true);
  (st.props || []).reverse().forEach(([node, k, v]) => { try { node[k] = v; } catch {} });
  for (const [a, v] of Object.entries(st.saved || {})) { if (v == null) el.removeAttribute(a); else el.setAttribute(a, v); }
  st.sr?.remove(); st.sr = null;
  st.applied = false; st.saved = {}; st.props = [];
}
function __permApply(el) {
  const st = __permEls.get(el);
  if (!st) return;
  const ok = __permAllowed(el), mode = (el.getAttribute('data-o-denied') || 'hide').trim().toLowerCase();
  if (ok || (st.applied && st.mode !== mode)) __permRestore(el, st);
  if (!ok && !st.applied) __permDeny(el, st, mode);
  el.setAttribute('data-o-access', ok ? 'granted' : 'denied');
}
function __permInit(el) {
  if (!__permEls.has(el)) __permEls.set(el, { applied: false, saved: {}, props: [] });
  __permApply(el);
  return () => {
    if (el.__oPermRemoved) return;   // detached by us (mode "remove"): keep tracking
    if (el.isConnected && (el.hasAttribute('data-o-permission') || el.hasAttribute('data-o-role'))) { __permApply(el); return; }
    const st = __permEls.get(el);
    if (st) { __permRestore(el, st); __permEls.delete(el); }
    el.removeAttribute('data-o-access');
  };
}
behavior('data-o-permission', __permInit);
behavior('data-o-role', __permInit);
behavior('data-o-denied', el => { if (__permEls.has(el)) __permApply(el); });

/* ── <o-can> ───────────────────────────────────────────────────────── */
class OCan extends OElement {
  static props = { permission: String, role: String, any: Boolean, mode: { type: String, default: 'hide' } };
  setup() { this.classList.add('o-can'); }
  connected() { this.addCleanup(auth.onChange(() => this.requestUpdate('auth'))); }
  get allowed() { return (!this.permission || can(this.permission, { any: this.any })) && (!this.role || hasRole(this.role)); }
  render() {
    const ok = this.allowed, tpl = this.querySelector(':scope > template[slot="denied"]');
    let fb = this.querySelector(':scope > .o-can-denied');
    this.classList.toggle('is-denied', !ok);
    this.setAttribute('data-o-access', ok ? 'granted' : 'denied');
    if (!ok && tpl && !fb) { fb = h('div', { class: 'o-can-denied' }); fb.append(tpl.content.cloneNode(true)); this.append(fb); }
    if (ok && fb) fb.remove();
    if (this.mode === 'remove') {
      if (!ok && !this._frag) { this._frag = doc.createDocumentFragment(); [...this.childNodes].filter(n => n !== tpl && n !== fb).forEach(n => this._frag.append(n)); }
      else if (ok && this._frag) { this.prepend(this._frag); this._frag = null; }
    }
    if (this._last !== undefined && this._last !== ok) this.emit('change', { allowed: ok });
    this._last = ok;
  }
}
define('o-can', OCan);

Object.assign(O, { auth, can, hasRole, Can: OCan });
