/* ============================================================================
 * core: component system
 *   OElement    — base class for <o-*> custom elements (light DOM, props, lifecycle)
 *   FormElement — form-associated base (works in <form>, FormData, validation, reset)
 *   define()    — register a custom element
 *   behavior()  — attribute enhancers: <input data-o-mask="..."> auto-initialised
 *   action()    — delegated click actions: data-o-toggle / data-o-action / data-o-dismiss
 * ========================================================================== */

const HTMLBase = isBrowser ? HTMLElement : class {};
const __elements = new Map();
/** Public methods of OElement/FormElement — a prop with one of these names would replace the method. */
const BASE_METHODS = new Set(['flush', 'requestUpdate', 'listen', 'addCleanup', 'emit', 't', 'getProps', 'setup', 'connected', 'disconnected', 'update', 'render',
  'setValue', 'checkValidity', 'reportValidity', 'setCustomValidity', 'isEmpty', 'getValidity', 'formValue']);

function __normProp(def) {
  if (def === String || def === Number || def === Boolean || def === Array || def === Object || def === Function || def === Any) return { type: def };
  return { type: Any, ...def };
}
function __defaultOf(def) { return isFn(def.default) && def.type !== Function ? def.default() : def.default; }
function __coerce(v, type) {
  if (v == null) return v;
  if (type === Number) { if (v === '') return null; const n = +v; return Number.isNaN(n) ? null : n; }
  if (type === Boolean) return v === 'false' ? false : !!v;
  if (type === String) return String(v);
  if ((type === Array || type === Object) && isStr(v)) return parseAttr(v, type);
  return v;
}
function __setupProps(Cls) {
  if (Object.prototype.hasOwnProperty.call(Cls, '__oProps')) return Cls.__oProps;
  const raw = Cls.props || {};
  const props = {}, attrMap = {};
  for (const name of Object.keys(raw)) {
    const def = __normProp(raw[name]);
    def.attr = def.attr === false ? null : (def.attr || kebab(name));
    props[name] = def;
    if (def.attr) attrMap[def.attr] = name;
    // accessors (an author-defined getter/setter on the class or an ancestor wins; generated ones are re-created)
    let proto = Cls.prototype, own = false;
    while (proto && proto !== OElement.prototype) {
      const desc = Object.getOwnPropertyDescriptor(proto, name);
      if (desc) { own = !(desc.get && desc.get.__oGen); break; }
      proto = Object.getPrototypeOf(proto);
    }
    if (own) continue;
    const getter = function () { if (!(name in this._p)) this._p[name] = __defaultOf(def); return this._p[name]; };
    getter.__oGen = true;
    Object.defineProperty(Cls.prototype, name, {
      configurable: true, enumerable: true,
      get: getter,
      set(v) {
        const old = this._p[name];
        v = __coerce(v, def.type);
        if (old === v && def.type !== Array && def.type !== Object && def.type !== Any) return;
        this._p[name] = v;
        if (def.reflect && def.attr && !this.__fromAttr) {
          this.__reflecting = true;
          if (def.type === Boolean) this.toggleAttribute(def.attr, !!v);
          else if (v == null || v === '') this.removeAttribute(def.attr);
          else this.setAttribute(def.attr, isObj(v) || Array.isArray(v) ? JSON.stringify(v) : v);
          this.__reflecting = false;
        }
        this.requestUpdate(name, old);
      },
    });
  }
  // A prop whose name matches a method replaces that method (base-class or the component's own): the accessor is
  // never created and the first attribute value overwrites the function. Two shipped packages hit this with a
  // `search` prop next to a `search()` method — results were silently discarded. Descriptors are inspected instead
  // of reading `proto[name]`, which would invoke a generated accessor's getter with the prototype as `this`.
  if (isBrowser) {
    const ownMethod = name => {
      for (let p = Cls.prototype; p && p !== OElement.prototype && p !== HTMLElement.prototype; p = Object.getPrototypeOf(p)) {
        const d = Object.getOwnPropertyDescriptor(p, name);
        if (d) return typeof d.value === 'function';
      }
      return false;
    };
    for (const name of Object.keys(props)) {
      if (BASE_METHODS.has(name)) console.error(`[Orion] ${Cls.name}: prop "${name}" shadows the OElement/FormElement method "${name}()". Rename the prop (e.g. "${name}ed" or a variant value) — calls to this.${name}() will fail otherwise.`);
      else if (ownMethod(name)) console.error(`[Orion] ${Cls.name}: prop "${name}" shadows the method "${name}()" declared on the same class — the reactive accessor is not created and the method is replaced by the attribute value. Rename the prop and keep the attribute, e.g. "${name}able: { type: Boolean, attr: '${name}' }".`);
    }
  }
  Object.defineProperty(Cls, '__oProps', { value: { props, attrMap }, enumerable: false });
  return Cls.__oProps;
}

class OElement extends HTMLBase {
  /** static props = { value: String, size: { type: String, default: 'md', reflect: true }, items: { type: Array, default: () => [] } } */
  static props = {};
  static get observedAttributes() { return Object.keys(__setupProps(this).attrMap); }

  constructor() {
    super();
    this._p = {};
    this._changed = new Set();
    this._cleanups = [];
    this._setupDone = false;
    this._queued = false;
  }

  connectedCallback() {
    if (!this.__upgraded) {
      this.__upgraded = true;
      // properties assigned before the element was upgraded (frameworks do this)
      for (const k of Object.keys(__setupProps(this.constructor).props)) {
        if (Object.prototype.hasOwnProperty.call(this, k)) { const v = this[k]; delete this[k]; this[k] = v; }
      }
    }
    if (!this._setupDone && doc.readyState === 'loading' && !this.__parsed()) {
      if (!this.__waiting) { this.__waiting = true; doc.addEventListener('DOMContentLoaded', () => { this.__waiting = false; if (this.isConnected) this.connectedCallback(); }, { once: true }); }
      return;
    }
    if (this.__connected) return;
    this.__connected = true;
    if (!this._setupDone) {
      this._setupDone = true;
      try { this.setup(); } catch (e) { console.error(`[Orion] <${this.localName}> setup failed:`, e); }
      const all = new Set(Object.keys(__setupProps(this.constructor).props));
      this._changed.forEach(k => all.add(k));
      all.add('init');
      this._changed = all;
      this._flush();
    }
    this._cleanups.push(bus.on('locale', () => { this._changed.add('locale'); this.requestUpdate(); }));
    try { this.connected(); } catch (e) { console.error(`[Orion] <${this.localName}> connected failed:`, e); }
  }
  /** While the document is still loading, the element's children are complete once it (or an ancestor) has a following sibling. */
  __parsed() { for (let n = this; n && n !== doc.body; n = n.parentNode) if (n.nextSibling) return true; return false; }
  disconnectedCallback() {
    if (!this.__connected) return;
    this.__connected = false;
    const c = this._cleanups; this._cleanups = [];
    c.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
    try { this.disconnected(); } catch (e) { console.error(e); }
  }
  attributeChangedCallback(attr, old, val) {
    if (old === val || this.__reflecting) return;
    const { props, attrMap } = __setupProps(this.constructor);
    const name = attrMap[attr]; if (!name) return;
    const def = props[name];
    this.__fromAttr = true;
    try { this[name] = val == null && def.type !== Boolean ? __defaultOf(def) : parseAttr(val, def.type); }
    finally { this.__fromAttr = false; }
  }

  /* ── lifecycle hooks for authors ── */
  /** Called ONCE when first connected (children are parsed). Build internal DOM here. */
  setup() {}
  /** Called on every connect (after setup). Add document/window listeners here with this.listen(). */
  connected() {}
  /** Called on every disconnect. Listeners registered with this.listen() are removed automatically. */
  disconnected() {}
  /** Called (batched, microtask) after props change. First call: changed has every prop + 'init'. Default calls render(). */
  update(changed) { if (this.render !== OElement.prototype.render) this.render(changed); }
  /** Optional full re-render. */
  render() {}

  /** Schedule an update (batched in a microtask). */
  requestUpdate(name) {
    if (name) this._changed.add(name);
    if (!this._setupDone || this._queued) return;
    this._queued = true;
    queueMicrotask(() => this._flush());
  }
  _flush() {
    this._queued = false;
    if (!this._setupDone || !this._changed.size) return;
    const changed = this._changed;
    this._changed = new Set();
    try { this.update(changed); } catch (e) { console.error(`[Orion] <${this.localName}> update failed:`, e); }
  }
  /** Force a synchronous update now. */
  flush() { if (this._queued) this._flush(); }

  /* ── helpers ── */
  /** Listener that is removed on disconnect (use in connected()). Returns off(). */
  listen(target, types, selector, handler, opts) { const off = on(target, types, selector, handler, opts); this._cleanups.push(off); return off; }
  /** Register a cleanup to run on disconnect. */
  addCleanup(fn) { this._cleanups.push(fn); return fn; }
  /** Dispatch `o-${name}` (bubbles, composed, cancelable). Returns false if a listener called preventDefault(). */
  emit(name, detail, opts) { return !emit(this, 'o-' + name, detail, opts).defaultPrevented; }
  $(sel) { return this.querySelector(sel); }
  $$(sel) { return Array.from(this.querySelectorAll(sel)); }
  /** Component-scoped translation: this.t('select.noResults') honours a per-instance `texts` override. */
  t(key, params) {
    const own = this.texts || this._p.texts;
    if (own) { const short = key.split('.').pop(); const v = own[key] ?? own[short]; if (v != null) return isFn(v) ? v(params || {}) : String(v).replace(/\{(\w+)\}/g, (m, p) => params?.[p] ?? m); }
    return t(key, params);
  }
  /** Props helper for configs: returns all current prop values as an object. */
  getProps() { const out = {}; for (const k of Object.keys(__setupProps(this.constructor).props)) out[k] = this[k]; return out; }
}

/* Internal instance fields of OElement/FormElement. A component method or field with one of these
 * names silently breaks the base class, so define() reports it instead of failing mysteriously. */
const RESERVED_MEMBERS = ['_p', '_changed', '_cleanups', '_setupDone', '_queued', '_internals', '_customError', '_formDisabled', '_flush', 'requestUpdate', 'listen', 'addCleanup'];
function __checkReserved(tag, Cls) {
  for (let proto = Cls.prototype; proto && proto !== OElement.prototype && proto !== FormElement.prototype; proto = Object.getPrototypeOf(proto)) {
    for (const name of RESERVED_MEMBERS) {
      if (!Object.prototype.hasOwnProperty.call(proto, name)) continue;
      if (['_flush', 'requestUpdate', 'listen', 'addCleanup'].includes(name)) continue; // overridable on purpose
      console.error(`[Orion] <${tag}> defines "${name}", which shadows an internal field of ${proto === Cls.prototype ? 'OElement' : 'its base class'}. Rename it (e.g. "_on${cap(name.replace(/^_/, ''))}") — the component will misbehave otherwise.`);
    }
  }
}

/** define('o-foo', OFoo) — registers the element (no-op on the server / when already defined). */
function define(tag, Cls) {
  __setupProps(Cls);
  if (isBrowser) __checkReserved(tag, Cls);
  __elements.set(tag, Cls);
  if (isBrowser && win.customElements && !customElements.get(tag)) customElements.define(tag, Cls);
  return Cls;
}
O.define = define;
O.elements = __elements;
O.OElement = OElement;

/* ── Form-associated base ─────────────────────────────────────────────── */
class FormElement extends OElement {
  static formAssociated = true;
  // `name` must reflect: form submission / FormData key a form-associated element off its `name` CONTENT ATTRIBUTE,
  // so a name set as a property (frameworks, plain JS) silently dropped the control from the form without this.
  static props = { name: { type: String, reflect: true }, value: Any, disabled: { type: Boolean, reflect: true }, required: { type: Boolean, reflect: true }, readonly: { type: Boolean, reflect: true } };

  constructor() {
    super();
    try { this._internals = this.attachInternals(); } catch { this._internals = null; }
    this._customError = '';
    // Inner native input/change events must not leak out as if they came from the host.
    const stop = e => { if (e.target !== this) e.stopPropagation(); };
    this.addEventListener('input', stop);
    this.addEventListener('change', stop);
  }
  connectedCallback() {
    super.connectedCallback();
    if (this._setupDone && this.__defaultValue === undefined) { this.__defaultValue = clone(this.value ?? null); this._syncForm(); }
  }
  _flush() {
    const c = this._changed;
    const need = c.has('value') || c.has('required') || c.has('name') || c.has('disabled') || c.has('init');
    super._flush();
    if (need && this._setupDone) this._syncForm();
  }
  /** true when disabled directly or through a disabled <fieldset>/<form> */
  get isDisabled() { return this.disabled || !!this._formDisabled; }
  get form() { return this._internals?.form ?? this.closest('form'); }
  get validity() { return this._internals?.validity; }
  get validationMessage() { return this._internals?.validationMessage ?? ''; }
  get willValidate() { return this._internals?.willValidate ?? false; }
  get labels() { return this._internals?.labels ?? []; }
  checkValidity() { this._syncValidity(); return this._internals ? this._internals.checkValidity() : true; }
  reportValidity() { this._syncValidity(); return this._internals ? this._internals.reportValidity() : true; }
  setCustomValidity(msg) { this._customError = msg || ''; this._syncValidity(); }
  /** Element that receives focus / anchors the validation bubble. Override or set this.focusTarget. */
  focus(opts) { (this.focusTarget || focusables(this)[0])?.focus(opts); }
  blur() { (this.focusTarget || doc.activeElement)?.blur?.(); }

  /** Is the current value empty (for `required`)? */
  isEmpty() { const v = this.value; return v == null || v === '' || (Array.isArray(v) && !v.length); }
  /** Override: return { flags: { rangeUnderflow: true }, message } or null when valid (required is handled). */
  getValidity() { return null; }
  /** Override to customise what is submitted. Return string | File | FormData | string[] | null. */
  formValue() {
    const v = this.value;
    if (v == null || v === '') return null;
    if (Array.isArray(v)) return v.map(x => (isObj(x) ? JSON.stringify(x) : String(x)));
    if (v instanceof Date) return O.date.toISODate(v);
    if (isObj(v) && !(v instanceof File) && !(v instanceof FormData)) return JSON.stringify(v);
    return v;
  }
  _syncForm() {
    this.toggleAttribute('data-empty', this.isEmpty());
    if (!this._internals) return;
    let v = this.formValue();
    if (Array.isArray(v)) { const fd = new FormData(); if (this.name) v.forEach(x => fd.append(this.name, x)); v = this.name ? fd : null; }
    try { this._internals.setFormValue(v); } catch { this._internals.setFormValue(v == null ? null : String(v)); }
    this._syncValidity();
  }
  _syncValidity() {
    if (!this._internals) return;
    const anchor = this.focusTarget && this.contains(this.focusTarget) ? this.focusTarget : undefined;
    let res = null;
    if (this._customError) res = { flags: { customError: true }, message: this._customError };
    else if (this.required && !this.isDisabled && this.isEmpty()) res = { flags: { valueMissing: true }, message: t('validation.required') };
    else res = this.getValidity();
    try {
      if (res) this._internals.setValidity(res.flags, res.message || t('validation.invalid'), anchor);
      else this._internals.setValidity({});
    } catch { try { res ? this._internals.setValidity(res.flags, res.message || t('validation.invalid')) : this._internals.setValidity({}); } catch {} }
  }
  /**
   * Set the value because of a USER action: updates the form value and dispatches
   * `input` + `change` (native, from the host) and `o-change` with { value }.
   */
  setValue(v, { silent = false, inputOnly = false } = {}) {
    this.value = v;
    this._syncForm();
    if (silent) return;
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    if (inputOnly) return;
    this.dispatchEvent(new Event('change', { bubbles: true }));
    this.emit('change', { value: this.value });
  }
  formResetCallback() { this.value = clone(this.__defaultValue ?? null); this._syncForm(); this.requestUpdate('value'); }
  formDisabledCallback(disabled) { this._formDisabled = disabled; this.requestUpdate('disabled'); }
  formStateRestoreCallback(state) { if (state != null && !(state instanceof FormData)) this.value = state; }
}
O.FormElement = FormElement;

/* ── Behaviors: attribute-driven enhancers ────────────────────────────── */
const __behaviors = new Map();       // attr -> init(el, value) => cleanup?
const __bhState = new WeakMap();     // el -> Map(attr -> cleanup | true)
let __bhObserver = null;
const __bhSelector = () => [...__behaviors.keys()].map(a => `[${a}]`).join(',');

function __bhInit(el, attr) {
  let m = __bhState.get(el);
  if (!m) __bhState.set(el, (m = new Map()));
  if (m.has(attr)) return;
  const init = __behaviors.get(attr);
  if (!init) return;
  m.set(attr, true);
  try { const c = init(el, el.getAttribute(attr)); if (isFn(c)) m.set(attr, c); }
  catch (e) { console.error(`[Orion] behavior [${attr}] failed:`, e, el); }
}
function __bhDestroy(el, attr) {
  const m = __bhState.get(el); if (!m) return;
  for (const [a, c] of [...m]) if (!attr || a === attr) { m.delete(a); if (isFn(c)) { try { c(); } catch (e) { console.error(e); } } }
}
function __bhScan(root) {
  if (!__behaviors.size || !root || root.nodeType !== 1) return;
  const sel = __bhSelector();
  const list = root.matches(sel) ? [root, ...root.querySelectorAll(sel)] : root.querySelectorAll(sel);
  for (const el of list) for (const a of __behaviors.keys()) if (el.hasAttribute(a)) __bhInit(el, a);
}
function __bhObserve() {
  if (!isBrowser) return;
  if (__bhObserver) __bhObserver.disconnect();
  __bhObserver = new MutationObserver(muts => {
    for (const mu of muts) {
      if (mu.type === 'childList') {
        mu.addedNodes.forEach(n => n.nodeType === 1 && __bhScan(n));
        mu.removedNodes.forEach(n => {
          if (n.nodeType !== 1) return;
          queueMicrotask(() => {
            if (n.isConnected) return;
            const sel = __bhSelector();
            if (!sel) return;
            (n.matches(sel) ? [n, ...n.querySelectorAll(sel)] : [...n.querySelectorAll(sel)]).forEach(el => !el.isConnected && __bhDestroy(el));
          });
        });
      } else if (mu.type === 'attributes' && __behaviors.has(mu.attributeName)) {
        const el = mu.target;
        __bhDestroy(el, mu.attributeName);
        if (el.hasAttribute(mu.attributeName)) __bhInit(el, mu.attributeName);
      }
    }
  });
  __bhObserver.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: [...__behaviors.keys()] });
}
/**
 * behavior('data-o-mask', (el, value) => { ...; return () => cleanup(); })
 * Initialises every current and future element with the attribute (works with any framework).
 */
function behavior(attr, init) {
  __behaviors.set(attr, init);
  if (__bhObserver) { __bhObserve(); __bhScan(doc.body); }
}
/** Manually (re)initialise behaviors inside a subtree (rarely needed). */
function upgrade(root = isBrowser ? doc.body : null) { __bhScan(root); }
O.behavior = behavior;
O.upgrade = upgrade;

/* ── Actions: delegated clicks ────────────────────────────────────────── */
const __actions = new Map();
/**
 * action('modal', (trigger, event, target) => {...})
 *   <button data-o-toggle="modal" data-o-target="#m1">   -> action 'modal'
 *   <button data-o-action="copy" data-o-value="text">    -> action 'copy'
 *   <button data-o-dismiss="modal">                      -> action 'dismiss:modal'
 */
function action(name, handler) { __actions.set(name, handler); }
/** Resolve data-o-target / href="#id" of a trigger to an element. */
function targetOf(trigger) {
  const sel = trigger.getAttribute('data-o-target') || (trigger.getAttribute('href') || '').replace(/^[^#]*(?=#.)/, '');
  if (!sel || sel === '#') return null;
  try { return doc.querySelector(sel); } catch { return null; }
}
function __runAction(e, el) {
  if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
  const pairs = [['data-o-toggle', ''], ['data-o-action', ''], ['data-o-dismiss', 'dismiss:']];
  for (const [attr, prefix] of pairs) {
    const val = el.getAttribute(attr);
    if (val == null) continue;
    const fn = __actions.get(prefix + val);
    if (!fn) continue;
    if (el.tagName === 'A' || el.tagName === 'AREA') e.preventDefault();
    try { fn(el, e, targetOf(el)); } catch (err) { console.error(`[Orion] action "${prefix + val}" failed:`, err); }
    return;
  }
}
O.action = action;
O.targetOf = targetOf;
O.actions = __actions;
