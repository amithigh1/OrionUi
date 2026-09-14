# Orion Admin — Architecture & Component Contract

Orion Admin ships as **one file** (`dist/orion.js`): all JavaScript plus the CSS (embedded as a
string and injected at load). It has zero runtime dependencies and uses no third-party CSS/JS.
It works in plain HTML, React, Vue, Angular, Svelte and so on because the widgets are
**native Custom Elements**, the behaviors are **attribute driven**, and the services are a plain JS API.

This document is the rulebook for everyone writing components. Read all of it before writing code.

---

## 1. The four layers

| Layer | How users consume it | Examples |
|---|---|---|
| **CSS classes** | `class="o-btn o-btn-primary"` | buttons, cards, badges, alerts, grid, utilities |
| **Behaviors** (attribute enhancers) | `<input data-o-mask="(999) 999-9999">` | masks, tooltips, lazy images, autosave, conditional fields |
| **Actions** (delegated clicks) | `<button data-o-toggle="modal" data-o-target="#m">` | open modal/drawer, collapse, copy, theme, fullscreen, print |
| **Custom elements** | `<o-select>`, `<o-datatable>`, `<o-chart>` | any widget that has its own DOM and state |
| **Services** (JS API) | `Orion.toast('Saved')`, `Orion.http.get(url)` | dialogs, toasts, http, storage, shortcuts |

Prefer the lightest layer that does the job. Every widget that has a custom element **also**
gets a programmatic factory when that is useful (for example `Orion.chart(el, config)` or `Orion.modal({...})`).

## 2. Source layout & build

```
src/core/NN-*.js          shared scope, concatenated in order. Only the maintainer edits core.
src/css/NN-*.css          foundation CSS (tokens, reboot, typography, layout, buttons, forms, content, feedback)
src/components/<name>/    *.js (each folder's code runs in its own function scope) + *.css
src/sw/*.js               service-worker mode (the same bundle file registered as a SW)
src/i18n/*.js             locale packs
build/build.mjs           bundler -> dist/orion.js, orion.min.js, orion.esm.js, orion.css
build/check.mjs           headless Chrome test runner (console errors / exceptions / screenshots)
docs/components/*.html    one or more documentation pages per component (auto-listed in the nav)
```

* A component folder may contain several `.js` files; they are concatenated **in file-name order** into
  one function scope wrapped in `try/catch`, so one broken component never breaks the others.
* **Cross-component use happens at runtime, never at definition time.** Use `O.Something` or
  `customElements.get('o-x')` inside functions, not at the top level. If you really need
  another folder's code at definition time, declare `// @deps other-folder` on the first line.
* Everything runs in **strict mode**, targeting evergreen browsers (ES2020+, class fields are fine).
* The bundle also loads in Node (SSR) without crashing: top-level code must not touch `window` or `document`
  unless `isBrowser` is true. `define()`, `behavior()` and `action()` are already safe.

## 3. Naming

* CSS classes: `o-` prefix, kebab-case: `.o-select`, `.o-select-option`, state classes `.is-open`, `.is-active`, `.is-disabled`, `.is-invalid`, `.is-loading`.
* Custom elements: `<o-name>` (e.g. `o-datepicker`, `o-kanban`).
* Custom events: always `o-` prefixed, dispatched with `this.emit('change', detail)` → `o-change`
  (bubbles, composed, cancelable). Form controls additionally fire native `input` and `change` from the host (see `FormElement.setValue`).
* Behaviors: `data-o-<name>` attributes. Actions: `data-o-toggle` / `data-o-action` / `data-o-dismiss`.
* JS API on the `O` object (the public `Orion`): `O.toast`, `O.DataTable` (class), `O.chart()` (factory).
* i18n keys: `<component>.<key>` (e.g. `select.noResults`).
* Storage keys: `orion:<component>:<id>`.

## 4. What core gives you (all in scope, no imports)

**Environment and utilities:** `O` (the public API), `isBrowser`, `win`, `doc`, `uid()`, `noop`, `isObj`, `isFn`, `isStr`, `isNum`, `toArr`,
`clamp`, `round`, `sleep`, `nextFrame`, `debounce`, `throttle`, `rafThrottle`, `merge`, `clone`, `equal`, `kebab`, `camel`,
`cap`, `esc` (HTML escape), `html` (tagged template, auto-escapes), `raw` (mark trusted HTML), `SafeHTML`,
`getPath(obj, 'a.b')`, `setPath`, `parseJSON`, `formatBytes`, `sanitize(html)`, `fuzzy(q, text)`, `highlight(text, q)`,
`fuzzySearch(items, q, key)`, `ls.get/set/del` (safe localStorage), `download(blob, name)`, `downloadURL(url, name)`,
`loadScript(src)`, `Emitter` (class with on/off/once/emit), `bus` (global emitter behind `Orion.on/emit`).

**DOM:** `$(sel, ctx)`, `$$(sel, ctx)` (returns an array), `h(tag, props, ...children)`, `svg(tag, props, ...children)`, `append`, `frag(html)`,
`fromHTML(html)`, `cls(...)`, `css(el, styles)`, `on(target, 'evt evt2', [selector], handler, opts) → off()`,
`emit(el, type, detail)`, `ready(fn)`, `isVisible`, `dirOf(el)`, `isRTL(el)`, `focusables(root)`, `focusFirst(root)`,
`trapFocus(root) → release()`, `lockScroll() → unlock()`, `onClickOutside(els, fn) → off()`,
`observeResize(el, cb) → off()`, `observeVisible(el, cb, opts) → off()`, `scrollParents(el)`,
`patchList(container, items, key, create, update)` (keyed list rendering).

**i18n and formatting:** `t(key, params)` and `i18n.add(locale, dict)`, plus `fmt` (also `O.format`):
`fmt.number(v, opts)`, `currency(v, code)`, `percent(ratio)`, `compact`, `bytes`, `date(v, style|tokens)`, `time`,
`datetime`, `relative`, `duration(ms,'clock')`, `list`, `parseNumber(str)`, `separators()`.

**Dates:** `date` (also `O.date`) works in local time and returns new Date objects:
`parse(v, fmt?)`, `parseFormat`, `format(d, 'YYYY-MM-DD HH:mm')`, `today`, `add(d, n, unit)`, `sub`, `startOf`, `endOf`,
`isSame`, `isBefore`, `isAfter`, `isBetween`, `isToday`, `isWeekend`, `diff`, `daysInMonth`, `weekStart(locale)`,
`weekNumber`, `monthNames`, `weekdayNames(style, loc, weekStart)`, `matrix(y, m, weekStart)` (42 days),
`range`, `min`, `max`, `toISODate`, `toISOTime`, `toLocalISO`, `parseTime`, `setTime`, `localePattern`, `uses12h`.

**Components:** `OElement`, `FormElement`, `define(tag, Class)`, `behavior(attr, init)`, `action(name, fn)`,
`targetOf(trigger)`, `Any` (prop type), `parseAttr`.

**Floating UI and overlays:** `place(float, ref, opts)`, `autoPlace(float, ref, opts) → cleanup`, `computePosition`,
`overlays.open({...}) → handle`, `overlays.top()`, `portal(el, from)`, `portalRoot()`, `inheritContext(el, from)`,
`Z` (`Z.base` 1050, `Z.toast` 1200, `Z.tooltip` 1300).

**Motion and accessibility:** `animate(el, 'fadeIn'|'zoomIn'|'slideInUp'|'slideInStart'|'shake'|keyframes, opts) → Promise`,
`collapse(el, show?) → Promise`, `reducedMotion()`, `ListNav` (keyboard lists), `announce(msg)`.

**Theme and icons:** `theme` (`O.theme`), `color` (`O.color`), `icon(name, {size, class, label})` (returns SafeHTML),
`iconEl(name) → SVGElement`, `O.icons.add({...})`.

## 5. Writing a custom element

```js
/* src/components/rating/rating.js */
i18n.add('en', { rating: { label: 'Rating', star: '{count} star', stars: '{count} stars' } });

class ORating extends FormElement {
  static props = {
    ...FormElement.props,                          // name, value, disabled, required, readonly
    value: { type: Number, default: 0 },           // override type/default
    max: { type: Number, default: 5 },
    size: { type: String, default: 'md', reflect: true },
    items: { type: Array, default: () => [] },     // arrays/objects: default must be a function
    format: { type: Function, attr: false },       // attr:false => property only
  };

  setup() {                 // ONCE, first connect (children are parsed). Build the skeleton here.
    this.classList.add('o-rating');
    this.setAttribute('role', 'radiogroup');
    // Listeners on your OWN children: plain on(); they survive DOM moves.
    on(this, 'click', '.o-rating-star', (e, star) => !this.isDisabled && this.setValue(+star.dataset.v));
    on(this, 'keydown', e => { /* ... */ });
    this.focusTarget = this;  // element that receives focus / anchors validation
  }
  connected() {             // EVERY connect. Global listeners go here via this.listen() (auto-removed on disconnect)
    this.listen(document, 'o-theme', () => this.requestUpdate());
  }
  update(changed) {         // batched after prop changes; first call has every prop + 'init'
    if (changed.has('max') || changed.has('init') || changed.has('locale')) this.renderStars();
    if (changed.has('value')) this.paint();
  }
  disconnected() {}         // optional; this.listen() / addCleanup() handlers are already removed
}
define('o-rating', ORating);
O.Rating = ORating;
```

Rules:

1. **Light DOM only** (no Shadow DOM) so theming, global CSS and forms just work. Scope CSS with your `o-` class.
2. **Reserved names.** These are members of the base classes, so a prop or method of your own with the same name
   silently breaks the component (`define()` logs an error if you do it):
   `flush requestUpdate listen addCleanup emit t getProps setup connected disconnected update render setValue`
   `checkValidity reportValidity setCustomValidity isEmpty getValidity formValue`, plus the internals
   `_p _changed _cleanups _setupDone _queued _internals`. If the public attribute must be one of these
   (e.g. a "flush" style variant), rename the property and keep the attribute: `flushed: { type: Boolean, attr: 'flush' }`.
   The same applies to **your own methods**: a prop and a method cannot share a name (`search` + `search()`,
   `duplicate` + `duplicate()` both shipped broken). `define()` logs a `console.error` for either case, which fails
   `build/check.mjs`.
3. **Props**: declare every public option in `static props`. Attributes are kebab-case (`pageSize` → `page-size`),
   Arrays and Objects accept JSON in attributes, Booleans are "present" (`<o-x disabled>`), and Functions set as attributes
   resolve to a global function name. Frameworks set properties, which always win.
3. **Never re-create the whole DOM on every update if the user might be typing inside.** Patch the parts that changed.
   Use `patchList` for keyed lists.
4. **`replaceChildren()` / `append()` stringify non-nodes.** `el.replaceChildren(a, cond && b)` inserts the literal
   text `"false"`/`"null"` when the condition fails, and a `SafeHTML` value becomes `"[object Object]"`. Use the core
   `append(el, [a, cond && b])` helper (it skips `null`/`false`/`true` and inserts `SafeHTML` as HTML), or filter first:
   `el.replaceChildren(...[a, cond && b].filter(Boolean))`.
4b. **No accessors in an `Object.assign()` source literal.** `Object.assign(Proto, { get x() { … } })` does not
   copy the accessor: it *reads* `x` once, with the literal as `this`, and copies the resulting value. On a prototype
   that throws at load time (and takes the whole package down); on a handle it silently freezes the value. Use
   `Object.defineProperty(Proto, "x", { configurable: true, get() { … } })`. `build/audit.mjs` fails on this pattern.
5. **User-provided markup** (option labels, cell values, tooltips) goes through `esc()` or `html`\`\` templates.
   Only use `raw()` for strings you built or that come from explicit `html`/`render` callbacks the developer supplies.
5. **Events**: `this.emit('change', { value })`. Emit **cancelable** "before" events for user actions that
   can be vetoed, e.g. `if (!this.emit('before-close')) return;`.
6. **Form controls** extend `FormElement`, call `this.setValue(v)` for user-initiated changes (it syncs FormData, validity,
   and fires `input`, `change` and `o-change`), and set `this.value = v` for programmatic changes (no events). Override
   `getValidity()` for custom constraints and `formValue()` for custom serialization.
   Inner native `input`/`change` events are automatically stopped at the host.
7. **Imperative API**: public methods for everything a developer would script (`open()`, `close()`, `toggle()`,
   `refresh()`, `reload()`, `clear()`, `focus()`, `getData()`...). Document them.
8. **Declarative children** are fine for simple config (`<o-select><option value="1">One</option></o-select>`).
   Read them in `setup()`. If they can change later, watch with a `MutationObserver` created in `connected()`
   and disconnected in `disconnected()`.
9. **Cleanup**: anything global (document/window listeners, timers, observers, portaled panels) must be
   released on disconnect. Portaled panels must close when their owner disconnects.
10. **Locale changes** trigger `update(changed)` with `'locale'` in the set, so re-render your strings then.
11. **Per-instance text overrides**: support a `texts` prop (object) and use `this.t('rating.label')`, which reads
   `texts.label` or `texts['rating.label']` first and then falls back to the dictionary.

## 6. Floating panels (dropdowns, pickers, popovers, menus)

```js
open() {
  if (this._ov) return;
  if (!this.emit('before-open')) return;
  const panel = this.panel;                               // built once in setup()
  portal(panel, this);                                    // to <body> (or the open native <dialog>), copies dir/theme
  panel.hidden = false;
  this._unplace = autoPlace(panel, this.control, { placement: 'bottom-start', offset: 4, matchWidth: 'min', size: true, flip: true });
  this._ov = overlays.open({
    el: panel, owner: this,                               // clicks on the owner are not "outside"
    onClose: (reason) => {                                // the ONLY place that hides the panel
      this._ov = null; this._unplace?.(); panel.hidden = true; this.classList.remove('is-open');
      this.emit('close', { reason });
    },
  });
  this.classList.add('is-open');
  animate(panel, 'zoomIn', { duration: 120 });
  this.emit('open');
}
close() { this._ov?.close('api'); }
disconnected() { this.close(); }
```

* `overlays` gives you Escape (top-most only), click-outside, nesting (a picker inside a modal closes with it),
  z-index stacking, optional focus trap, scroll lock and focus return.
* Floating surfaces use the `.o-floating` class (elevated background, border, radius, shadow).
* If you handle Escape yourself (for example to clear a search box first), call `e.preventDefault()` so the overlay manager skips it.

## 7. Behaviors & actions

```js
// <textarea data-o-counter maxlength="200">
behavior('data-o-counter', (el, value) => {
  const out = h('div', { class: 'o-counter' });
  el.after(out);
  const upd = () => { out.textContent = `${el.value.length} / ${el.maxLength}`; };
  const off = on(el, 'input', upd); upd();
  return () => { off(); out.remove(); };       // cleanup when the element leaves the DOM / attribute removed
});

// <button data-o-action="copy" data-o-value="text to copy">   or   data-o-target="#el"
action('copy', (trigger, event, target) => { /* ... */ });
// <button data-o-dismiss="toast">  -> action('dismiss:toast', ...)
```

Behaviors are initialised for every current and future element (a MutationObserver), so they work with
React, Vue and Angular rendering too. Extra options use additional data attributes (`data-o-counter-warn="20"`).

## 8. CSS rules

* Use **tokens only**: never hard-code colors. Surfaces are `--o-bg`, `--o-surface`, `--o-surface-2`, `--o-surface-3` and `--o-elevated`.
  Text is `--o-text`, `--o-text-muted` and `--o-text-subtle`. Borders are `--o-border` and `--o-border-strong`. Semantic colors are
  `--o-{primary|secondary|success|danger|warning|info}` with `-hover`, `-subtle`, `-border` and `-text`, and `--o-on-{color}` for text on a solid background.
  Use `--o-warning-text` for warning text. `--o-c`, `--o-on-c`, `--o-c-subtle`, `--o-c-text` and `--o-c-border` form the current color
  context (set by `.o-c-{color}`), and your component can use it to accept any color.
  Other tokens: radius (`--o-radius-xs|sm|(none)|lg|xl|pill`), shadows (`--o-shadow-xs|sm|(none)|lg|xl`), font sizes (`--o-fs-xs|sm|base|md|lg|xl|2xl|3xl|4xl`),
  control heights (`--o-control-h`, `-sm`, `-lg`), focus ring (`0 0 0 var(--o-ring-width) color-mix(in srgb, var(--o-focus) var(--o-ring-alpha), transparent)`),
  motion (`--o-dur-fast`, `--o-dur`, `--o-ease`), charts (`--o-chart-1..8`, `--o-seq-100..700`, `--o-div-neg|mid|pos`, `--o-status-*`,
  `--o-chart-grid`, `--o-chart-axis`), and layout (`--o-sidebar-w`, `--o-header-h`).
* Dark mode comes free if you only use tokens. **Verify your component in dark mode** (`--dark` in check.mjs).
* **RTL**: only logical properties (`margin-inline-start`, `padding-inline`, `inset-inline-end`, `border-start-start-radius`,
  `text-align: start`). Flip directional icons (`.o-icon-flip` or the chevron/arrow icons, which flip automatically).
  Horizontal keyboard arrows follow `isRTL()`. **Verify with `--rtl`.**
* Keep specificity low (one class plus a state). No `!important` except in utilities.
* **Responsive**: every component must be usable at 360px width. Use container-friendly layouts, and use `observeResize`
  for components that must adapt to their own width rather than the viewport.
* **Motion**: animations must be short (120–250ms) and are disabled under `prefers-reduced-motion` automatically for
  `animate()`. For CSS animations, the global reduced-motion rule handles it.
* Reuse existing classes (`o-btn`, `o-input`, `o-control`, `o-badge`, `o-chip`, `o-floating`, `o-empty`, `o-spinner`,
  `o-skeleton`, `o-scroll`, `o-kbd`, `o-avatar`...) instead of restyling the same thing.
* Hide undefined custom elements to avoid a flash: `o-foo:not(:defined) { visibility: hidden; }` if needed.

## 9. Accessibility (mandatory)

* Correct roles and ARIA: `role="listbox"`/`option` with `aria-selected`, `combobox` with `aria-expanded`/`aria-controls`/
  `aria-activedescendant`, `dialog` with `aria-modal`/`aria-labelledby`, `tablist`/`tab`/`tabpanel`, `tree`/`treeitem`, `grid`...
* Full keyboard support following the WAI-ARIA Authoring Practices. `ListNav` handles arrows, Home/End, typeahead and RTL.
* Visible focus (`:focus-visible` ring). Icon-only buttons need `aria-label`.
* Announce async results with `announce()` (for example "5 results", "Row deleted", "Upload complete").
* Never rely on color alone (add icons, text, or patterns).

## 10. Frameworks

Components must work when created by frameworks:

* **React 19** sets properties on custom elements. Custom `o-*` events are attached through a ref
  (`ref.current.addEventListener('o-change', fn)`) or through the React helper that the maintainer adds later.
  React 18 sets attributes, so every Array or Object prop must accept JSON strings.
* **Vue 3**: `compilerOptions.isCustomElement = t => t.startsWith('o-')`, then `:options="opts" @o-change="..."`.
* **Angular**: `schemas: [CUSTOM_ELEMENTS_SCHEMA]`, then `[options]="opts" (o-change)="..."`.
* Properties may be set **before** upgrade (handled by core), and children may arrive **after** `setup()`
  (frameworks append children after creating the host). If your component reads children, re-read them on mutation.
* Elements may be moved (disconnect followed by reconnect). Do not destroy state in `disconnected()`.

## 11. Documentation pages

Create `docs/components/<page>.html` from `docs/components/buttons.html` (copy the `<head>` exactly):

```html
<title>Select — Orion Admin</title>
<meta name="docs:section" content="Pickers & Selects">   <!-- one of the sections in build/docs.mjs -->
<meta name="docs:order" content="10">
<meta name="docs:desc" content="Searchable, multi-select and remote dropdowns">
...
<main class="docs-main">
  <header class="docs-hero"><h1>Select</h1><p class="docs-lead">…</p></header>
  <section id="basic"><h2>Basic</h2>
    <div class="docs-demo" data-preview="center">      <!-- modifiers: center | bg | dotted | flush -->
      <template> …live HTML and optional <script>, shown as the "Code" … </template>
    </div>
  </section>
  <section id="api"><h2>API</h2><table class="docs-api">…props / attributes / events / methods / CSS vars…</table></section>
</main>
```

* Put demo scripts **inside** the `<template>` (they run when the demo is inserted, after `window.docs` exists).
* Demo data helpers: `docs.people(n)` (realistic users), `docs.fakeServer(rows)` (async paging/sort/filter),
  `docs.series(n)` (time series), `docs.log('#log', msg)` (with `<div class="docs-log" id="log"></div>`), and `docs.rand(seed)`.
* Every page must include: an overview, a demo for every feature, a JS API section, an events table, a keyboard
  section for interactive widgets, and a framework note if something is special.

## 12. Testing your work (required before you report done)

```bash
node build/build.mjs --only=<your,folders> --out=.tmp/<pkg> --no-min      # syntax check + custom bundle
node build/check.mjs docs/components/<page>.html --bundle=.tmp/<pkg>/orion.js --shots=.tmp/<pkg>/shots --full
node build/check.mjs docs/components/<page>.html --bundle=.tmp/<pkg>/orion.js --shots=.tmp/<pkg>/shots --dark --rtl --mobile
node build/check.mjs docs/components/<page>.html --bundle=.tmp/<pkg>/orion.js --eval="(async()=>{ /* interact & return a result */ })()"
node build/check.mjs docs/components/<page>.html --bundle=.tmp/<pkg>/orion.js --eval=@.tmp/evals/<pkg>-flow.js   # same, script from a file
```

Interaction scripts are best kept as files under `.tmp/evals/` (no shell quoting): an async IIFE that drives the page and
returns an object with the measured values plus an `ok` boolean. Query floating panels (menus, pickers, popovers) from
`document` — they are portaled to `<body>` while open, so `#host .o-dropdown-menu` finds nothing.

* Zero console errors or exceptions on every page you own, in light, dark, RTL and mobile.
* **Look at your screenshots** (open the PNGs) and fix visual problems: overflow, clipping, misalignment, contrast in dark mode, RTL mirroring.
* Use `--eval` to script real interactions (open, type, click options, press keys) and assert results.
* `--only` builds include `basics` only if listed, so add `basics` when you use `<o-avatar>` or `Orion.loading`.
* Never run the full `node build/build.mjs` without `--out` (that writes `dist/`, which the maintainer owns).
