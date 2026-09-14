/* Framework integration (no framework code is imported — you pass it in).
 *
 * VUE 3
 *   import Orion from 'orion-admin';
 *   app.use(Orion.vue);                     // $orion global, inject('orion'), isCustomElement for runtime compiler
 *   // Vite SFCs: vue({ template: { compilerOptions: { isCustomElement: t => t.startsWith('o-') } } })
 *   <o-select v-model="country" :options="countries" @o-change="onChange" />   (v-model works: value + input event)
 *
 * REACT 18 / 19
 *   import React from 'react'; import Orion from 'orion-admin';
 *   const { Select, Datatable, Chart } = Orion.react(React);
 *   <Select options={countries} value={v} onChange={e => setV(e.detail.value)} ref={selectRef} />
 *   Props become element PROPERTIES (objects/arrays/functions work in React 18 too),
 *   onXxx handlers subscribe to `o-xxx` events (onRowClick -> o-row-click), native events (onClick...) pass through.
 *   Orion.react(React).wrap('o-select') for any tag, including your own custom elements.
 *
 * ANGULAR
 *   @Component({ schemas: [CUSTOM_ELEMENTS_SCHEMA] })   <o-select [options]="countries" (o-change)="onChange($event)">
 *   Forms: <o-select ngDefaultControl [(ngModel)]="country"> / formControlName="country" ngDefaultControl
 */

/* ── Vue ─────────────────────────────────────────────────────────────── */
O.vue = {
  install(app, options = {}) {
    const prefix = options.prefix || 'o-';
    try {
      const co = app.config.compilerOptions || (app.config.compilerOptions = {});
      const prev = co.isCustomElement;
      co.isCustomElement = tag => tag.startsWith(prefix) || (prev ? prev(tag) : false);
    } catch { /* runtime-only build: set isCustomElement in your bundler config */ }
    app.config.globalProperties.$orion = O;
    app.provide('orion', O);
    if (options.config) O.init(options.config);
  },
};

/* ── React ───────────────────────────────────────────────────────────── */
const REACT_PASS = new Set(['children', 'className', 'style', 'id', 'slot', 'key', 'ref', 'hidden', 'title', 'role', 'tabIndex', 'dir', 'lang', 'part', 'is', 'suppressHydrationWarning', 'dangerouslySetInnerHTML']);
const REACT_NATIVE_EVENTS = new Set(('click dblclick contextmenu focus blur focusin focusout keydown keyup keypress input submit reset mousedown mouseup mousemove ' +
  'mouseenter mouseleave mouseover mouseout pointerdown pointerup pointermove pointerenter pointerleave pointercancel touchstart touchmove touchend ' +
  'wheel scroll drag dragstart dragend dragenter dragleave dragover drop copy cut paste load error animationend transitionend').split(' '));

const __reactApis = new WeakMap();
O.react = function (React) {
  if (!React || !React.createElement) throw new Error('Orion.react(React): pass the React module');
  if (__reactApis.has(React)) return __reactApis.get(React);
  const { createElement, forwardRef, useRef, useLayoutEffect, useEffect, useImperativeHandle } = React;
  const useIso = isBrowser ? useLayoutEffect : useEffect;
  const cache = new Map();

  function wrap(tag) {
    if (cache.has(tag)) return cache.get(tag);
    const Comp = forwardRef(function OrionElement(props, ref) {
      const el = useRef(null);
      useImperativeHandle(ref, () => el.current, []);
      const pass = {}, properties = {}, events = {};
      for (const k in props) {
        const v = props[k];
        if (REACT_PASS.has(k) || k.startsWith('aria-') || k.startsWith('data-')) pass[k] = v;
        else if (/^on[A-Z]/.test(k) && isFn(v)) {
          const name = k.slice(2);
          if (REACT_NATIVE_EVENTS.has(name.toLowerCase())) pass[k] = v;
          else events['o-' + kebab(name)] = v;
        } else properties[k] = v;
      }
      // properties: assigned on every render (cheap; components batch updates)
      useIso(() => { const node = el.current; if (!node) return; for (const k in properties) if (node[k] !== properties[k]) node[k] = properties[k]; });
      // events: stable listeners that call the latest handler
      const handlers = useRef(events);
      handlers.current = events;
      const names = Object.keys(events).sort().join(',');
      useIso(() => {
        const node = el.current; if (!node || !names) return;
        const list = names.split(',').map(n => { const fn = e => handlers.current[n]?.(e); node.addEventListener(n, fn); return [n, fn]; });
        return () => list.forEach(([n, fn]) => node.removeEventListener(n, fn));
      }, [names]);
      const { className, ...rest } = pass;
      return createElement(tag, { ...rest, ref: el, class: className }, props.children);
    });
    Comp.displayName = 'Orion(' + tag + ')';
    cache.set(tag, Comp);
    return Comp;
  }

  const byName = name => {
    const n = String(name).toLowerCase();
    for (const tag of __elements.keys()) if (tag.slice(2).replace(/-/g, '') === n) return tag;
    return 'o-' + kebab(name);
  };
  const api = new Proxy({ wrap }, { get: (target, name) => (name in target || typeof name !== 'string' ? target[name] : wrap(byName(name))) });
  __reactApis.set(React, api);
  return api;
};
