/*! Orion Admin v0.1.0 | MIT — TypeScript declarations */
// ── types/orion-core.d.ts
/**
 * Orion Admin — TypeScript declarations (core API).
 * Component-specific declarations are appended to dist/orion.d.ts by the build.
 */

export type ThemeMode = 'light' | 'dark' | 'auto';
export type Placement =
  | 'top' | 'bottom' | 'left' | 'right' | 'start' | 'end'
  | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end' | 'left-start' | 'left-end'
  | 'right-start' | 'right-end' | 'start-start' | 'start-end' | 'end-start' | 'end-end';
export type Color = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info' | 'light' | 'dark';

export interface OrionConfig {
  theme?: ThemeMode;
  locale?: string | null;
  css?: boolean;
  reboot?: boolean;
  nonce?: string | null;
  persist?: boolean;
  currency?: string;
  weekStart?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | null;
  autoDir?: boolean;
  tokens?: ThemeTokens;
  themes?: Record<string, TenantTheme>;
  tenant?: string;
  brand?: BrandInfo;
  [key: string]: unknown;
}

export interface ThemeTokens {
  primary?: string; secondary?: string; success?: string; danger?: string; warning?: string; info?: string;
  light?: string; dark?: string; bg?: string; surface?: string; text?: string; textMuted?: string; border?: string;
  radius?: string; radiusSm?: string; radiusLg?: string; font?: string; fontMono?: string; fontSize?: string;
  sidebarWidth?: string; headerHeight?: string; sidebarBg?: string; sidebarText?: string; headerBg?: string; controlHeight?: string;
  [cssVarOrAlias: string]: string | undefined;
}
export interface BrandInfo { name?: string; logo?: string; logoDark?: string; favicon?: string; title?: string; }
export interface TenantTheme { brand?: BrandInfo; mode?: ThemeMode; [token: string]: string | BrandInfo | undefined; }

export type Unsubscribe = () => void;

export declare class Emitter {
  on(name: string, fn: (...args: any[]) => void): Unsubscribe;
  off(name?: string, fn?: (...args: any[]) => void): this;
  once(name: string, fn: (...args: any[]) => void): Unsubscribe;
  emit(name: string, ...args: any[]): this;
}

export declare class SafeHTML { constructor(s: string); toString(): string; }

/** Base class for Orion custom elements (light DOM). */
export declare class OElement extends HTMLElement {
  static props: Record<string, PropDef | PropType>;
  /** Called once when first connected (children parsed). */
  setup(): void;
  /** Called on every connect. */
  connected(): void;
  /** Called on every disconnect. */
  disconnected(): void;
  /** Batched update after prop changes; first call contains every prop plus 'init'. */
  update(changed: Set<string>): void;
  render(changed?: Set<string>): void;
  requestUpdate(name?: string): void;
  flush(): void;
  listen(target: EventTarget | string | EventTarget[], types: string, selectorOrHandler: string | ((e: Event, el?: Element) => void), handler?: (e: Event, el: Element) => void, opts?: AddEventListenerOptions): Unsubscribe;
  addCleanup(fn: () => void): () => void;
  /** Dispatch `o-${name}`; returns false if a listener called preventDefault(). */
  emit(name: string, detail?: unknown, opts?: CustomEventInit): boolean;
  t(key: string, params?: Record<string, unknown>): string;
  getProps(): Record<string, unknown>;
  texts?: Record<string, string | ((p: Record<string, unknown>) => string)>;
}
export type PropType = StringConstructor | NumberConstructor | BooleanConstructor | ArrayConstructor | ObjectConstructor | FunctionConstructor | 'any';
export interface PropDef { type?: PropType; default?: unknown; attr?: string | false; reflect?: boolean; }

/** Form-associated base class (works in <form>, FormData, validation and reset). */
export declare class FormElement<V = unknown> extends OElement {
  static formAssociated: true;
  name: string;
  value: V;
  disabled: boolean;
  required: boolean;
  readonly: boolean;
  readonly isDisabled: boolean;
  readonly form: HTMLFormElement | null;
  readonly validity: ValidityState | undefined;
  readonly validationMessage: string;
  readonly willValidate: boolean;
  focusTarget?: HTMLElement;
  checkValidity(): boolean;
  reportValidity(): boolean;
  setCustomValidity(message: string): void;
  isEmpty(): boolean;
  getValidity(): { flags: ValidityStateFlags; message?: string } | null;
  formValue(): string | File | FormData | string[] | null;
  /** Set the value because of a user action (fires input, change and o-change). */
  setValue(value: V, opts?: { silent?: boolean; inputOnly?: boolean }): void;
}

export interface OverlayOptions {
  el: HTMLElement;
  owner?: Element | null;
  onClose: (reason: 'escape' | 'outside' | 'parent' | 'api' | string) => void;
  escape?: boolean;
  outside?: boolean;
  modal?: boolean;
  trap?: boolean;
  lockScroll?: boolean;
  returnFocus?: boolean;
  zOffset?: number;
}
export interface OverlayHandle { close(reason?: string): void; readonly open: boolean; entry: unknown; }

export interface PositionOptions {
  placement?: Placement;
  offset?: number;
  flip?: boolean;
  shift?: boolean;
  padding?: number;
  matchWidth?: boolean | 'min' | 'exact';
  size?: boolean;
  arrow?: HTMLElement;
  rtl?: boolean;
  fallback?: Placement[];
  onHidden?: () => void;
}
export type Reference = Element | { x: number; y: number; width?: number; height?: number };

export interface ListNavOptions {
  items?: string;
  orientation?: 'vertical' | 'horizontal' | 'grid';
  columns?: number | (() => number);
  loop?: boolean;
  virtual?: HTMLElement | null;
  activeClass?: string;
  typeahead?: boolean;
  onActivate?: (item: HTMLElement, index: number) => void;
  onSelect?: (item: HTMLElement, index: number, event: KeyboardEvent) => void;
}
export declare class ListNav {
  constructor(root: HTMLElement, opts?: ListNavOptions);
  readonly items: HTMLElement[];
  readonly active: HTMLElement | null;
  index: number;
  set(i: number, opts?: { scroll?: boolean; focus?: boolean }): HTMLElement | null;
  setItem(el: HTMLElement, opts?: { scroll?: boolean; focus?: boolean }): void;
  reset(): void;
  move(delta: number): HTMLElement | null;
  first(): HTMLElement | null;
  last(): HTMLElement | null;
  /** Handle a keydown; returns true when consumed. */
  handle(e: KeyboardEvent): boolean;
}

export interface FuzzyMatch { score: number; ranges: [number, number][]; }
export interface RGBA { r: number; g: number; b: number; a: number; }

/** Chainable element collection (array-like; `find(selector)` searches descendants like jQuery). */
export interface OQuery extends Iterable<HTMLElement> {
  readonly length: number;
  [index: number]: HTMLElement;
  forEach(cb: (el: HTMLElement, i: number) => void): void;
  map<T>(cb: (el: HTMLElement, i: number) => T): T[];
  some(cb: (el: HTMLElement, i: number) => boolean): boolean;
  every(cb: (el: HTMLElement, i: number) => boolean): boolean;
  indexOf(el: HTMLElement): number;
  includes(el: HTMLElement): boolean;
  at(i: number): HTMLElement | undefined;
  el: HTMLElement | null;
  each(fn: (this: HTMLElement, el: HTMLElement, i: number) => void): this;
  find(sel: string): OQuery; closest(sel: string): OQuery; parent(): OQuery; children(sel?: string): OQuery; siblings(sel?: string): OQuery;
  next(): OQuery; prev(): OQuery; is(sel: string): boolean; where(sel: string | ((el: HTMLElement) => boolean)): OQuery;
  eq(i: number): OQuery; first(): OQuery; last(): OQuery;
  addClass(...c: string[]): this; removeClass(...c: string[]): this; toggleClass(c: string, force?: boolean): this; hasClass(c: string): boolean;
  attr(name: string): string | null; attr(name: string | Record<string, unknown>, value?: unknown): this; removeAttr(name: string): this;
  prop(name: string): unknown; prop(name: string, value: unknown): this;
  data(key: string): string | undefined; data(key: string, value: string): this;
  css(k: string): string; css(k: string | Record<string, unknown>, v?: unknown): this;
  text(): string; text(v: string): this; html(): string; html(v: string): this; val(): unknown; val(v: unknown): this;
  append(c: unknown): this; prepend(c: unknown): this; before(c: unknown): this; after(c: unknown): this; remove(): this; empty(): this; clone(deep?: boolean): OQuery;
  on(types: string, selectorOrFn: string | ((e: Event, el?: Element) => void), fn?: (e: Event, el: Element) => void, opts?: AddEventListenerOptions): this;
  off(types?: string, fn?: Function): this; trigger(type: string, detail?: unknown): this;
  show(): this; hide(): this; toggle(force?: boolean): this; fadeIn(ms?: number): this; fadeOut(ms?: number): this;
  slideDown(ms?: number): this; slideUp(ms?: number): this; slideToggle(ms?: number): this;
  rect(): DOMRect | undefined; focus(): this; index(): number;
}

export interface OrionCore {
  readonly version: string;
  config: OrionConfig;
  init(config?: OrionConfig): OrionCore;
  on(name: 'ready' | 'boot' | 'theme' | 'locale' | 'brand' | 'overlay:open' | 'overlay:close' | string, fn: (...args: any[]) => void): Unsubscribe;
  off(name: string, fn?: (...args: any[]) => void): void;
  once(name: string, fn: (...args: any[]) => void): Unsubscribe;
  emit(name: string, ...args: any[]): void;
  ready(fn: () => void): void;

  /** Chainable DOM wrapper (jQuery-style). */
  $(selector: string | Element | ArrayLike<Element> | ((...a: any[]) => void), ctx?: string | Element): OQuery;
  h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Record<string, unknown> | null, ...children: unknown[]): HTMLElementTagNameMap[K];
  h(tag: string, props?: Record<string, unknown> | null, ...children: unknown[]): HTMLElement;
  dom: {
    $(sel: string | Element, ctx?: ParentNode): Element | null;
    $$(sel: string | ArrayLike<Element>, ctx?: ParentNode): Element[];
    h: OrionCore['h'];
    svg(tag: string, props?: Record<string, unknown> | null, ...children: unknown[]): SVGElement;
    cls(...args: unknown[]): string;
    css(el: HTMLElement, styles: Record<string, unknown>): HTMLElement;
    append(el: Element, children: unknown): Element;
    frag(html: string): DocumentFragment;
    fromHTML(html: string): Element | null;
    on(target: EventTarget | string | ArrayLike<EventTarget>, types: string, selectorOrHandler: string | ((e: any, el?: Element) => void), handler?: (e: any, el: Element) => void, opts?: AddEventListenerOptions): Unsubscribe;
    emit<T = unknown>(el: EventTarget, type: string, detail?: T, opts?: CustomEventInit): CustomEvent<T>;
    ready(fn: () => void): void;
    isVisible(el: Element): boolean;
    dirOf(el?: Element): 'ltr' | 'rtl';
    isRTL(el?: Element): boolean;
    focusables(root: ParentNode): HTMLElement[];
    focusFirst(root: HTMLElement, opts?: { preferAutofocus?: boolean }): HTMLElement;
    trapFocus(root: HTMLElement, opts?: { isActive?: () => boolean }): Unsubscribe;
    lockScroll(): Unsubscribe;
    onClickOutside(els: Element | Element[], handler: (e: PointerEvent) => void): Unsubscribe;
    observeResize(el: Element, cb: (rect: DOMRectReadOnly, entry?: ResizeObserverEntry) => void): Unsubscribe;
    observeVisible(el: Element, cb: (visible: boolean, entry?: IntersectionObserverEntry) => void, opts?: IntersectionObserverInit): Unsubscribe;
    scrollParents(el: Element): HTMLElement[];
    patchList<T>(container: Element, items: T[], key: keyof T | ((item: T, i: number) => unknown), create: (item: T, i: number) => Element, update?: (el: Element, item: T, i: number) => void): void;
    html(strings: TemplateStringsArray, ...vals: unknown[]): SafeHTML;
    raw(s: string): SafeHTML;
    esc(s: unknown): string;
  };

  util: {
    uid(prefix?: string): string; noop(): void; isObj(v: unknown): boolean; isPlainObj(v: unknown): boolean; isFn(v: unknown): boolean;
    isStr(v: unknown): v is string; isNum(v: unknown): v is number; toArr<T = unknown>(v: unknown): T[];
    clamp(v: number, min: number, max: number): number; round(v: number, p?: number): number; sleep(ms: number): Promise<void>; nextFrame(): Promise<void>;
    debounce<F extends (...a: any[]) => any>(fn: F, ms?: number): F & { cancel(): void; flush(): void };
    throttle<F extends (...a: any[]) => any>(fn: F, ms?: number): F;
    rafThrottle<F extends (...a: any[]) => any>(fn: F): F & { cancel(): void };
    merge<T extends object>(target: T, ...sources: object[]): T; clone<T>(v: T): T; equal(a: unknown, b: unknown): boolean;
    kebab(s: string): string; camel(s: string): string; cap(s: string): string; esc(s: unknown): string;
    raw(s: string): SafeHTML; html(strings: TemplateStringsArray, ...vals: unknown[]): SafeHTML;
    getPath(obj: unknown, path: string | ((o: any) => unknown)): any; setPath<T>(obj: T, path: string, value: unknown): T;
    parseJSON<T = unknown>(s: string, fallback?: T): T; parseAttr(v: string | null, type: PropType): unknown;
    formatBytes(bytes: number, decimals?: number): string; sanitize(html: string, opts?: { tags?: string[]; attrs?: string[] }): string;
    fuzzy(query: string, text: string): FuzzyMatch | null; highlight(text: string, queryOrRanges: string | [number, number][]): string;
    fuzzySearch<T>(items: T[], query: string, key?: string | ((item: T) => string), limit?: number): T[];
    download(data: Blob | string | ArrayBuffer | ArrayBufferView, filename?: string, mime?: string): void;
    downloadURL(url: string, filename?: string): void; loadScript(src: string, attrs?: Record<string, string>): Promise<HTMLScriptElement>;
    Emitter: typeof Emitter;
  };
  Emitter: typeof Emitter;
  sanitize(html: string, opts?: { tags?: string[]; attrs?: string[] }): string;
  download(data: Blob | string | ArrayBuffer | ArrayBufferView, filename?: string, mime?: string): void;
  downloadURL(url: string, filename?: string): void;

  i18n: {
    readonly locale: string;
    fallback: string;
    add(locale: string, dict: Record<string, unknown>, name?: string): OrionCore['i18n'];
    t(key: string, params?: Record<string, unknown>, locale?: string): string;
    has(key: string, locale?: string): boolean;
    set(locale: string, opts?: { dir?: 'ltr' | 'rtl'; persist?: boolean }): OrionCore['i18n'];
    isRTL(locale?: string): boolean;
    dir(): 'ltr' | 'rtl';
    locales(): { code: string; name: string }[];
    dict(locale?: string): Record<string, unknown>;
  };
  t(key: string, params?: Record<string, unknown>, locale?: string): string;
  format: {
    number(v: number | string, opts?: Intl.NumberFormatOptions | number, locale?: string): string;
    currency(v: number | string, currency?: string, opts?: Intl.NumberFormatOptions, locale?: string): string;
    percent(ratio: number, digits?: number, locale?: string): string;
    compact(v: number, locale?: string): string;
    bytes(v: number, decimals?: number): string;
    date(v: unknown, style?: 'short' | 'medium' | 'long' | 'full' | Intl.DateTimeFormatOptions | string, locale?: string): string;
    time(v: unknown, style?: 'short' | 'medium' | 'long' | 'full' | Intl.DateTimeFormatOptions, locale?: string): string;
    datetime(v: unknown, dateStyle?: string, timeStyle?: string, locale?: string): string;
    relative(v: unknown, base?: number | Date, locale?: string): string;
    duration(ms: number, style?: 'short' | 'clock'): string;
    list(items: unknown[], type?: 'conjunction' | 'disjunction' | 'unit', locale?: string): string;
    parseNumber(str: string | number, locale?: string): number | null;
    separators(locale?: string): { group: string; decimal: string };
  };
  date: {
    parse(v: unknown, format?: string): Date | null;
    parseFormat(s: string, format: string, locale?: string): Date | null;
    format(v: unknown, format?: string, locale?: string): string;
    isValid(v: unknown): boolean;
    today(): Date;
    add(v: unknown, n: number, unit?: string): Date | null;
    sub(v: unknown, n: number, unit?: string): Date | null;
    startOf(v: unknown, unit?: string, weekStart?: number): Date | null;
    endOf(v: unknown, unit?: string, weekStart?: number): Date | null;
    isSame(a: unknown, b: unknown, unit?: string, weekStart?: number): boolean;
    isBefore(a: unknown, b: unknown, unit?: string): boolean;
    isAfter(a: unknown, b: unknown, unit?: string): boolean;
    isBetween(v: unknown, a: unknown, b: unknown, unit?: string, inclusive?: boolean): boolean;
    isToday(v: unknown): boolean;
    isWeekend(v: unknown): boolean;
    diff(a: unknown, b: unknown, unit?: string, float?: boolean): number;
    daysInMonth(year: number, month: number): number;
    weekStart(locale?: string): number;
    weekNumber(v: unknown): number;
    monthNames(style?: 'long' | 'short' | 'narrow', locale?: string): string[];
    weekdayNames(style?: 'long' | 'short' | 'narrow', locale?: string, weekStart?: number): string[];
    matrix(year: number, month: number, weekStart?: number): Date[];
    range(a: unknown, b: unknown, unit?: string, step?: number): Date[];
    min(...dates: unknown[]): Date | null;
    max(...dates: unknown[]): Date | null;
    toISODate(v: unknown): string;
    toISOTime(v: unknown, seconds?: boolean): string;
    toLocalISO(v: unknown): string;
    parseTime(s: string): { h: number; m: number; s: number } | null;
    setTime(v: unknown, time: string | { h: number; m?: number; s?: number }): Date | null;
    localePattern(locale?: string): string;
    uses12h(locale?: string): boolean;
    fromNow(v: unknown): string;
  };

  theme: {
    readonly mode: ThemeMode;
    readonly resolved: 'light' | 'dark';
    readonly highContrast: boolean;
    readonly fontScale: number;
    readonly tenants: Record<string, TenantTheme>;
    readonly tenant: string | null;
    readonly brandInfo: BrandInfo;
    setMode(mode: ThemeMode, opts?: { persist?: boolean }): OrionCore['theme'];
    toggle(): OrionCore['theme'];
    cycle(): OrionCore['theme'];
    setContrast(high: boolean, opts?: { persist?: boolean }): OrionCore['theme'];
    setFontScale(scale: number, opts?: { persist?: boolean }): OrionCore['theme'];
    set(tokens: ThemeTokens, scope?: HTMLElement): OrionCore['theme'];
    get(token: string, scope?: HTMLElement): string;
    reset(): OrionCore['theme'];
    register(name: string, theme: TenantTheme): OrionCore['theme'];
    use(name: string, opts?: { persist?: boolean }): OrionCore['theme'];
    brand(info?: BrandInfo): OrionCore['theme'];
    exportCSS(selector?: string): string;
    onChange(fn: (e: { mode: ThemeMode; resolved: 'light' | 'dark'; [k: string]: unknown }) => void): Unsubscribe;
  };
  color: {
    parse(c: string | RGBA): RGBA | null; toHex(c: string | RGBA): string; toRgb(c: string | RGBA): string;
    toHsl(c: string | RGBA): { h: number; s: number; l: number; a: number } | null; fromHsl(h: number, s: number, l: number): RGBA;
    mix(a: string, b: string, weight?: number): string; lighten(c: string, amount?: number): string; darken(c: string, amount?: number): string;
    alpha(c: string, a: number): string; luminance(c: string): number; contrast(a: string, b: string): number;
    readable(bg: string, light?: string, dark?: string): string; palette(base: string): Record<string, string>; random(): string;
  };

  icon(name: string, opts?: { size?: number | string; class?: string; label?: string; stroke?: number }): SafeHTML;
  iconEl(name: string, opts?: { size?: number | string; class?: string; label?: string; stroke?: number }): SVGElement;
  icons: { add(map: Record<string, string>): void; get(name: string): string | undefined; has(name: string): boolean; list(): string[]; categories?: Record<string, string[]>; aliases?: Record<string, string>; };

  animate(el: Element, name: string | Keyframe[] | ((el: Element) => Keyframe[]), opts?: { duration?: number; easing?: string; delay?: number; fill?: FillMode; iterations?: number }): Promise<Animation | void>;
  collapse(el: HTMLElement, show?: boolean, opts?: { duration?: number }): Promise<boolean>;
  transition(el: HTMLElement, phase: 'enter' | 'leave', opts?: { name?: string; duration?: number }): Promise<void>;
  anim: { presets: Record<string, Keyframe[] | ((el: Element) => Keyframe[])>; reducedMotion(): boolean; animate: OrionCore['animate']; collapse: OrionCore['collapse']; transition: OrionCore['transition']; };

  overlays: {
    stack: unknown[];
    Z: { base: number; toast: number; tooltip: number };
    open(opts: OverlayOptions): OverlayHandle;
    close(entry: unknown, reason?: string): void;
    top(filter?: (entry: any) => boolean): any;
    isOpen(el: HTMLElement): boolean;
    closeAll(reason?: string): void;
  };
  portal(el: HTMLElement, from?: Element): HTMLElement;
  position: {
    compute(ref: Reference, floating: HTMLElement, opts?: PositionOptions): { x: number; y: number; side: string; align: string; maxHeight: number; maxWidth: number };
    place(floating: HTMLElement, ref: Reference, opts?: PositionOptions): { x: number; y: number; side: string; align: string } | null;
    autoPlace(floating: HTMLElement, ref: Reference, opts?: PositionOptions): Unsubscribe;
  };
  a11y: { announce(msg: string, politeness?: 'polite' | 'assertive'): void; ListNav: typeof ListNav; focusables(root: ParentNode): HTMLElement[]; focusFirst(root: HTMLElement): HTMLElement; trapFocus(root: HTMLElement, opts?: { isActive?: () => boolean }): Unsubscribe; reducedMotion(): boolean; };
  announce(msg: string, politeness?: 'polite' | 'assertive'): void;
  ListNav: typeof ListNav;

  define<T extends CustomElementConstructor>(tag: string, cls: T): T;
  elements: Map<string, CustomElementConstructor>;
  OElement: typeof OElement;
  FormElement: typeof FormElement;
  behavior(attr: string, init: (el: HTMLElement, value: string | null) => void | (() => void)): void;
  upgrade(root?: Element): void;
  action(name: string, handler: (trigger: HTMLElement, event: MouseEvent, target: Element | null) => void): void;
  targetOf(trigger: Element): Element | null;
  actions: Map<string, Function>;
  /** Everything a plugin author needs (base classes, helpers). */
  core: Record<string, any>;

  /** Overlay spinner on a container. */
  loading(target: string | HTMLElement, on?: boolean, text?: string): void;
  /** Page top progress bar. */
  progress: { start(): OrionCore['progress']; set(v: number): OrionCore['progress']; done(force?: boolean): OrionCore['progress']; wrap<T>(p: Promise<T>): Promise<T>; };
  pageLoader: { done(selector?: string): void };
  avatar: { initials(name: string): string; colorFor(name: string): Color };

  /** Vue 3 plugin: app.use(Orion.vue) */
  vue: { install(app: any, options?: { prefix?: string; config?: OrionConfig }): void };
  /** React wrapper factory: const { Select, Datatable } = Orion.react(React) */
  react(React: any): { wrap(tag: string): any; [componentName: string]: any };
}

export interface OAvatarElement extends OElement { name: string; src: string; size: string; status: string; shape: string; color: string; icon: string; }
export interface OIconElement extends OElement { name: string; size: string; label: string; stroke: number; }

// ── types/components/zz-elements.d.ts
/* Generated by build/gen-types.mjs — do not edit by hand.
 * 132 custom elements. Prop types come from each component's `static props`;
 * method signatures are loose — refine them in types/components/*.d.ts (those are declared first and win).
 */

/** `<o-2fa-setup>` — see src/components/auth/README.md */
export interface O2faSetupElement extends OElement {
  issuer: string;
  account: string;
  secret: string;
  methods: any[];
  digits: number;
  period: number;
  backupCodesCount: number;
  onVerify: (...args: any[]) => any;
  texts: Record<string, any>;
  stepList(...args: any[]): any;
  goTo(...args: any[]): any;
  next(...args: any[]): any;
  prev(...args: any[]): any;
  chooseMethod(...args: any[]): any;
  handleSetupContinue(...args: any[]): any;
  reset(...args: any[]): any;
  backupCodes(...args: any[]): any;
  buildProgress(...args: any[]): any;
  renderMethod(...args: any[]): any;
  renderSetup(...args: any[]): any;
  qrBlock(...args: any[]): any;
  renderVerify(...args: any[]): any;
  renderBackup(...args: any[]): any;
  renderDone(...args: any[]): any;
  navRow(...args: any[]): any;
  copySecret(...args: any[]): any;
  submitCode(...args: any[]): any;
  showVerifyMsg(...args: any[]): any;
  resend(...args: any[]): any;
  copyCodes(...args: any[]): any;
  downloadCodes(...args: any[]): any;
  printCodes(...args: any[]): any;
  finish(...args: any[]): any;
}

/** `<o-2fa-verify>` — see src/components/auth/README.md */
export interface O2faVerifyElement extends OElement {
  method: string;
  maskedDestination: string;
  length: number;
  trustDevice: boolean;
  resendSeconds: number;
  onVerify: (...args: any[]) => any;
  texts: Record<string, any>;
  currentCode(...args: any[]): any;
  submit(...args: any[]): any;
  useBackupCode(...args: any[]): any;
  usePassword(...args: any[]): any;
  clearMsg(...args: any[]): any;
  verify(...args: any[]): any;
  markValid(...args: any[]): any;
  markInvalid(...args: any[]): any;
  resend(...args: any[]): any;
  reset(...args: any[]): any;
  focus(...args: any[]): any;
}

/** `<o-accordion>` — see src/components/accordion/README.md */
export interface OAccordionElement extends OElement {
  multiple: boolean;
  flushed: boolean;
  variant: string;
  iconPosition: string;
  texts: Record<string, any>;
  toggle(...args: any[]): any;
  expandAll(...args: any[]): any;
  collapseAll(...args: any[]): any;
}

/** `<o-accordion-item>` — see src/components/accordion/README.md */
export interface OAccordionItemElement extends OElement {
  heading: string;
  subtitle: string;
  icon: string;
  category: string;
  open: boolean;
  disabled: boolean;
  headingLevel: number;
  show(...args: any[]): any;
  hide(...args: any[]): any;
  toggle(...args: any[]): any;
}

/** `<o-activity-feed>` — see src/components/activity/README.md */
export interface OActivityFeedElement extends OElement {
  items: any[];
  compact: boolean;
  groupByDay: boolean;
  filter: string;
  filters: any[];
  showFilter: boolean;
  source: (...args: any[]) => any;
  pageSize: number;
  autoLoad: boolean;
  empty: string;
  label: string;
  texts: Record<string, any>;
  setItems(...args: any[]): any;
  clear(...args: any[]): any;
  refresh(...args: any[]): any;
  load(...args: any[]): any;
}

/** `<o-address-input>` — see src/components/geocode/README.md */
export interface OAddressInputElement extends FormElement<any> {
  value: any;
  provider: string;
  countryCodes: string;
  lang: string;
  placeholder: string;
  limit: number;
  fill: Record<string, any>;
  source: (...args: any[]) => any;
  email: string;
  apiKey: string;
  texts: Record<string, any>;
  search(...args: any[]): any;
  clear(...args: any[]): any;
  focus(...args: any[]): any;
}

/** `<o-assistant>` — see src/components/assistant/README.md */
export interface OAssistantElement extends OElement {
  contextSelector: boolean;
  dock: string;
  width: number;
  isOpen: boolean;
  context: (...args: any[]) => any;
  provider: (...args: any[]) => any;
  templates: any[];
  title: string;
  texts: Record<string, any>;
  open(...args: any[]): any;
  close(...args: any[]): any;
  toggle(...args: any[]): any;
  focus(...args: any[]): any;
  stop(...args: any[]): any;
  clearHistory(...args: any[]): any;
  ask(...args: any[]): any;
}

/** `<o-audio>` — see src/components/player/README.md */
export interface OAudioElement extends OElement {
  src: string;
  title: string;
  artist: string;
  cover: string;
  waveform: boolean;
  loop: boolean;
  playlist: any[];
  index: number;
  autoplay: boolean;
  label: string;
  texts: Record<string, any>;
  play(...args: any[]): any;
  pause(...args: any[]): any;
  togglePlay(...args: any[]): any;
  seek(...args: any[]): any;
  skip(...args: any[]): any;
  toggleMute(...args: any[]): any;
  toggleLoop(...args: any[]): any;
  setSpeed(...args: any[]): any;
  download(...args: any[]): any;
  next(...args: any[]): any;
  prev(...args: any[]): any;
}

/** `<o-audio-recorder>` — see src/components/recorder/README.md */
export interface OAudioRecorderElement extends FormElement<any> {
  value: any;
  maxDuration: number;
  format: string;
  levelMeter: boolean;
  waveform: boolean;
  deviceId: string;
  stream: any;
  texts: Record<string, any>;
  start(...args: any[]): any;
  pause(...args: any[]): any;
  resume(...args: any[]): any;
  stop(...args: any[]): any;
  reRecord(...args: any[]): any;
  download(...args: any[]): any;
}

/** `<o-auth-form>` — see src/components/auth/README.md */
export interface OAuthFormElement extends OElement {
  type: string;
  brand: string;
  logo: string;
  social: any[];
  remember: boolean;
  termsUrl: string;
  user: Record<string, any>;
  onSubmit: (...args: any[]) => any;
  texts: Record<string, any>;
  field(...args: any[]): any;
  rulesFor(...args: any[]): any;
  validateField(...args: any[]): any;
  checkConfirm(...args: any[]): any;
  setError(...args: any[]): any;
  clearError(...args: any[]): any;
  hideAlert(...args: any[]): any;
  showAlert(...args: any[]): any;
  collectData(...args: any[]): any;
  submit(...args: any[]): any;
  showError(...args: any[]): any;
  showSuccess(...args: any[]): any;
  resend(...args: any[]): any;
  switchMode(...args: any[]): any;
  reset(...args: any[]): any;
  focus(...args: any[]): any;
}

/** `<o-autocomplete>` — see src/components/autocomplete/README.md */
export interface OAutocompleteElement extends FormElement<any> {
  value: string;
  items: any[];
  source: (...args: any[]) => any;
  url: string;
  fields: Record<string, any>;
  minChars: number;
  debounce: number;
  limit: number;
  strict: boolean;
  inline: boolean;
  recent: boolean;
  recentKey: string;
  recentMax: number;
  openOnFocus: boolean;
  placeholder: string;
  icon: string;
  clearable: boolean;
  size: string;
  renderItem: (...args: any[]) => any;
  texts: Record<string, any>;
  setValue(...args: any[]): any;
  search(...args: any[]): any;
  clearRecent(...args: any[]): any;
  open(...args: any[]): any;
  close(...args: any[]): any;
  clear(...args: any[]): any;
}

/** `<o-avatar>` — see src/components/basics/README.md */
export interface OAvatarElement extends OElement {
  name: string;
  src: string;
  size: string;
  status: string;
  shape: string;
  color: string;
  icon: string;
}

/** `<o-back-to-top>` — see src/components/scroll/README.md */
export interface OBackToTopElement extends OElement {
  threshold: number;
  target: string;
  progress: boolean;
  label: string;
  scrollToTop(...args: any[]): any;
}

/** `<o-barcode>` — see src/components/barcode/README.md */
export interface OBarcodeElement extends OElement {
  value: string;
  format: string;
  height: number;
  moduleWidth: number;
  margin: number;
  showText: boolean;
  fontSize: number;
  color: string;
  background: string;
  guardBars: boolean;
  download: string;
  saveAsPNG(...args: any[]): any;
}

/** `<o-biometric-login>` — see src/components/auth/README.md */
export interface OBiometricLoginElement extends OElement {
  label: string;
  fallbackHref: string;
  fallbackText: string;
  getOptions: (...args: any[]) => any;
  options: Record<string, any>;
  texts: Record<string, any>;
  authenticate(...args: any[]): any;
  trigger(...args: any[]): any;
  reset(...args: any[]): any;
}

/** `<o-booking>` — see src/components/booking/README.md */
export interface OBookingElement extends OElement {
  services: any[];
  serviceId: any;
  workingHours: any;
  slotMinutes: number;
  bufferMinutes: number;
  booked: any[];
  minNotice: number;
  maxDaysAhead: number;
  availability: (...args: any[]) => any;
  timezone: string;
  locale: string;
  weekStart: number;
  fields: any[];
  organizer: string;
  location: string;
  onBook: (...args: any[]) => any;
  texts: Record<string, any>;
  reset(...args: any[]): any;
  gotoStep(...args: any[]): any;
  getBooking(...args: any[]): any;
  downloadICS(...args: any[]): any;
}

/** `<o-breadcrumb>` — see src/components/breadcrumb/README.md */
export interface OBreadcrumbElement extends OElement {
  items: any[];
  separator: string;
  max: number;
  auto: boolean;
  texts: Record<string, any>;
}

/** `<o-calendar>` — see src/components/calendar/README.md */
export interface OCalendarElement extends OElement {
  view: string;
  views: any[];
  date: any;
  weekStart: number;
  firstHour: number;
  lastHour: number;
  scrollTime: string;
  slotMinutes: number;
  snapMinutes: number;
  defaultDuration: number;
  businessHours: any;
  editable: boolean;
  selectable: boolean;
  nowIndicator: boolean;
  weekNumbers: boolean;
  fixedWeeks: boolean;
  height: string;
  events: any[];
  source: any;
  resources: any[];
  toolbar: any;
  navigator: boolean;
  dayMaxEvents: any;
  allDayMaxRows: number;
  listRange: string;
  responsive: boolean;
  locale: string;
  hour12: any;
  eventColor: string;
  zoom: number;
  conflicts: boolean;
  droppable: boolean;
  confirmDelete: boolean;
  shortcuts: boolean;
  popover: boolean;
  builtinDialogs: boolean;
  eventContent: (...args: any[]) => any;
  eventDidMount: (...args: any[]) => any;
  texts: Record<string, any>;
  gotoDate(...args: any[]): any;
  next(...args: any[]): any;
  prev(...args: any[]): any;
  today(...args: any[]): any;
  changeView(...args: any[]): any;
  scrollToTime(...args: any[]): any;
  zoomBy(...args: any[]): any;
  getView(...args: any[]): any;
  addEvent(...args: any[]): any;
  updateEvent(...args: any[]): any;
  removeEvent(...args: any[]): any;
  getEventById(...args: any[]): any;
  getEvents(...args: any[]): any;
  refetch(...args: any[]): any;
  openEditor(...args: any[]): any;
  print(...args: any[]): any;
  toICS(...args: any[]): any;
}

/** `<o-camera>` — see src/components/camera/README.md */
export interface OCameraElement extends OElement {
  facing: string;
  resolution: string;
  mirror: boolean;
  aspect: string;
  format: string;
  quality: number;
  countdown: number;
  grid: boolean;
  torchToggle: boolean;
  zoomControl: boolean;
  mode: string;
  deviceId: string;
  autoStart: boolean;
  review: boolean;
  source: any;
  texts: Record<string, any>;
  start(...args: any[]): any;
  stop(...args: any[]): any;
  switchCamera(...args: any[]): any;
  capture(...args: any[]): any;
  retake(...args: any[]): any;
  confirmCapture(...args: any[]): any;
}

/** `<o-can>` — see src/components/permissions/README.md */
export interface OCanElement extends OElement {
  permission: string;
  role: string;
  any: boolean;
  mode: string;
}

/** `<o-captcha>` — see src/components/captcha/README.md */
export interface OCaptchaElement extends FormElement<any> {
  value: string;
  type: string;
  length: number;
  width: number;
  height: number;
  caseSensitive: boolean;
  audio: boolean;
  tolerance: number;
  challenge: (...args: any[]) => any;
  onVerify: (...args: any[]) => any;
  texts: Record<string, any>;
  refresh(...args: any[]): any;
  speak(...args: any[]): any;
  verify(...args: any[]): any;
  reset(...args: any[]): any;
}

/** `<o-carousel>` — see src/components/carousel/README.md */
export interface OCarouselElement extends OElement {
  autoplay: any;
  loop: boolean;
  rewind: boolean;
  perView: any;
  perViewSm: any;
  perViewMd: any;
  perViewLg: any;
  perViewXl: any;
  breakpoints: Record<string, any>;
  gap: any;
  effect: string;
  arrows: boolean;
  dots: any;
  thumbnails: boolean;
  pauseOnHover: boolean;
  draggable: boolean;
  center: boolean;
  step: any;
  aspect: string;
  speed: number;
  index: number;
  label: string;
  texts: Record<string, any>;
  next(...args: any[]): any;
  prev(...args: any[]): any;
  goTo(...args: any[]): any;
  play(...args: any[]): any;
  pause(...args: any[]): any;
  refresh(...args: any[]): any;
}

/** `<o-chart>` — see src/components/chart/README.md */
export interface OChartElement extends OElement {
  type: string;
  config: Record<string, any>;
  options: Record<string, any>;
  data: any;
  series: any[];
  labels: any[];
  height: string;
  texts: Record<string, any>;
  setData(...args: any[]): any;
  append(...args: any[]): any;
  setOptions(...args: any[]): any;
  highlight(...args: any[]): any;
  toggleSeries(...args: any[]): any;
  toggleTable(...args: any[]): any;
  zoom(...args: any[]): any;
  resetZoom(...args: any[]): any;
  exportSVG(...args: any[]): any;
  exportPNG(...args: any[]): any;
  exportCSV(...args: any[]): any;
  download(...args: any[]): any;
  resize(...args: any[]): any;
  getData(...args: any[]): any;
  destroy(...args: any[]): any;
}

/** `<o-chat>` — see src/components/chat/README.md */
export interface OChatElement extends OElement {
  currentUser: Record<string, any>;
  layout: string;
  conversations: any[];
  messages: any[];
  activeId: string;
  open: boolean;
  onSend: (...args: any[]) => any;
  label: string;
  texts: Record<string, any>;
  addMessage(...args: any[]): any;
  updateMessage(...args: any[]): any;
  removeMessage(...args: any[]): any;
  setMessages(...args: any[]): any;
  setConversations(...args: any[]): any;
  setTyping(...args: any[]): any;
  markRead(...args: any[]): any;
  scrollToBottom(...args: any[]): any;
  openConversation(...args: any[]): any;
}

/** `<o-chatbot>` — see src/components/assistant/README.md */
export interface OChatbotElement extends OElement {
  title: string;
  welcome: string;
  suggestions: any[];
  persist: any;
  launcher: boolean;
  position: string;
  avatar: string;
  isOpen: boolean;
  placeholder: string;
  disabled: boolean;
  provider: (...args: any[]) => any;
  system: string;
  texts: Record<string, any>;
  open(...args: any[]): any;
  close(...args: any[]): any;
  toggle(...args: any[]): any;
  focus(...args: any[]): any;
  stop(...args: any[]): any;
  clear(...args: any[]): any;
  send(...args: any[]): any;
  regenerate(...args: any[]): any;
  exportTranscript(...args: any[]): any;
  newChat(...args: any[]): any;
}

/** `<o-checklist>` — see src/components/tour/README.md */
export interface OChecklistElement extends OElement {
  tasks: any[];
  heading: string;
  id: string;
  dismissible: boolean;
  floating: boolean;
  collapsed: boolean;
  texts: Record<string, any>;
  doneCount(...args: any[]): any;
  isDone(...args: any[]): any;
  progress(...args: any[]): any;
  runTask(...args: any[]): any;
  toggle(...args: any[]): any;
  complete(...args: any[]): any;
  uncomplete(...args: any[]): any;
  dismiss(...args: any[]): any;
  show(...args: any[]): any;
  hide(...args: any[]): any;
  reset(...args: any[]): any;
}

/** `<o-code-editor>` — see src/components/codeeditor/README.md */
export interface OCodeEditorElement extends FormElement<any> {
  value: string;
  language: string;
  lineNumbers: boolean;
  wrap: boolean;
  tabSize: number;
  minLines: number;
  maxLines: number;
  placeholder: string;
  label: string;
  validate: any;
  autoClose: boolean;
  statusbar: boolean;
  texts: Record<string, any>;
  undo(...args: any[]): any;
  redo(...args: any[]): any;
  mapLines(...args: any[]): any;
  indent(...args: any[]): any;
  outdent(...args: any[]): any;
  toggleComment(...args: any[]): any;
  duplicate(...args: any[]): any;
  moveLines(...args: any[]): any;
  format(...args: any[]): any;
  insertText(...args: any[]): any;
  getSelection(...args: any[]): any;
  setSelection(...args: any[]): any;
  gotoLine(...args: any[]): any;
  getErrors(...args: any[]): any;
  refresh(...args: any[]): any;
  validateNow(...args: any[]): any;
}

/** `<o-colorpicker>` — see src/components/colorpicker/README.md */
export interface OColorpickerElement extends FormElement<any> {
  value: string;
  format: string;
  alpha: boolean;
  swatches: any[];
  recent: boolean;
  inline: boolean;
  eyedropper: boolean;
  contrastHint: boolean;
  placement: string;
  size: string;
  texts: Record<string, any>;
  buildPanel(...args: any[]): any;
  miniField(...args: any[]): any;
  rgb(...args: any[]): any;
  serialize(...args: any[]): any;
  setFromString(...args: any[]): any;
  applyColor(...args: any[]): any;
  commit(...args: any[]): any;
  paint(...args: any[]): any;
  paintFields(...args: any[]): any;
  paintContrast(...args: any[]): any;
  paintMode(...args: any[]): any;
  onHexInput(...args: any[]): any;
  onNumInput(...args: any[]): any;
  beginSvDrag(...args: any[]): any;
  setSvFromPoint(...args: any[]): any;
  onSvKey(...args: any[]): any;
  beginTrackDrag(...args: any[]): any;
  setTrackFromPoint(...args: any[]): any;
  onTrackKey(...args: any[]): any;
  pickFromScreen(...args: any[]): any;
  swatchBtn(...args: any[]): any;
  buildSwatches(...args: any[]): any;
  buildRecent(...args: any[]): any;
  pushRecent(...args: any[]): any;
  open(...args: any[]): any;
  close(...args: any[]): any;
  toggle(...args: any[]): any;
  focus(...args: any[]): any;
}

/** `<o-command-menu>` — see src/components/commandpalette/README.md */
export interface OCommandMenuElement extends OElement {
  commands: any[];
  placeholder: string;
  autofocus: boolean;
  providers: boolean;
  hints: boolean;
  texts: Record<string, any>;
  refresh(...args: any[]): any;
  reset(...args: any[]): any;
  focus(...args: any[]): any;
}

/** `<o-compare-table>` — see src/components/compare/README.md */
export interface OCompareTableElement extends OElement {
  items: any[];
  attributes: any[];
  titleKey: string;
  imageKey: string;
  highlightDiff: boolean;
  onlyDiff: boolean;
  removable: boolean;
  bestValue: boolean;
  live: boolean;
  toolbar: boolean;
  label: string;
  texts: Record<string, any>;
  open(...args: any[]): any;
}

/** `<o-compare-tray>` — see src/components/compare/README.md */
export interface OCompareTrayElement extends OElement {
  max: number;
  target: string;
  texts: Record<string, any>;
}

/** `<o-copy>` — see src/components/clipboard/README.md */
export interface OCopyElement extends OElement {
  value: string;
  target: string;
  variant: string;
  label: string;
  size: string;
  texts: Record<string, any>;
  copy(...args: any[]): any;
}

/** `<o-countdown>` — see src/components/timers/README.md */
export interface OCountdownElement extends OElement {
  to: any;
  format: string;
  variant: string;
  labels: boolean;
  autostart: boolean;
  pauseOnHidden: boolean;
  completeText: string;
  locale: string;
  texts: Record<string, any>;
  start(...args: any[]): any;
  pause(...args: any[]): any;
  restart(...args: any[]): any;
  getRemaining(...args: any[]): any;
}

/** `<o-countup>` — see src/components/stat/README.md */
export interface OCountupElement extends OElement {
  to: number;
  from: number;
  duration: number;
  format: string;
  currency: string;
  decimals: number;
  prefix: string;
  suffix: string;
  compact: boolean;
  announce: boolean;
  repeat: boolean;
  start(...args: any[]): any;
  reset(...args: any[]): any;
}

/** `<o-cropper>` — see src/components/imagetools/README.md */
export interface OCropperElement extends OElement {
  src: any;
  aspect: any;
  minWidth: number;
  minHeight: number;
  outputType: string;
  quality: number;
  round: boolean;
  guides: boolean;
  toolbar: boolean;
  preview: any;
  maxZoom: number;
  coverage: number;
  label: string;
  texts: Record<string, any>;
  load(...args: any[]): any;
  reset(...args: any[]): any;
  setAspect(...args: any[]): any;
  zoom(...args: any[]): any;
  zoomTo(...args: any[]): any;
  rotate(...args: any[]): any;
  rotateTo(...args: any[]): any;
  flip(...args: any[]): any;
  getData(...args: any[]): any;
  setData(...args: any[]): any;
  getCanvas(...args: any[]): any;
  toBlob(...args: any[]): any;
  toDataURL(...args: any[]): any;
}

/** `<o-dashboard>` — see src/components/dashboard/README.md */
export interface ODashboardElement extends OElement {
  columns: number;
  rowHeight: number;
  gap: number;
  editable: boolean;
  locked: boolean;
  persist: string;
  breakpoints: Record<string, any>;
  compact: string;
  float: boolean;
  layout: any[];
  layouts: Record<string, any>;
  catalog: any[];
  confirmRemove: any;
  label: string;
  texts: Record<string, any>;
  getWidget(...args: any[]): any;
  toggleEdit(...args: any[]): any;
  getLayout(...args: any[]): any;
  getLayouts(...args: any[]): any;
  setLayout(...args: any[]): any;
  setLayouts(...args: any[]): any;
  getState(...args: any[]): any;
  setState(...args: any[]): any;
  save(...args: any[]): any;
  reset(...args: any[]): any;
  compactLayout(...args: any[]): any;
  refreshAll(...args: any[]): any;
  addWidget(...args: any[]): any;
  duplicateWidget(...args: any[]): any;
  removeWidget(...args: any[]): any;
}

/** `<o-datatable>` — see src/components/datatable/README.md */
export interface ODatatableElement extends OElement {
  rows: any[];
  columns: any[];
  source: (...args: any[]) => any;
  url: string;
  mapResponse: (...args: any[]) => any;
  fetchOptions: Record<string, any>;
  rowKey: string;
  page: number;
  pageSize: number;
  pageSizes: any[];
  pagination: boolean;
  sort: any[];
  sortable: boolean;
  multiSort: boolean;
  search: string;
  searchable: boolean;
  searchDebounce: number;
  filters: Record<string, any>;
  filterable: boolean;
  filterRow: boolean;
  filterFn: (...args: any[]) => any;
  selectable: string;
  selectOnClick: boolean;
  bulkActions: any[];
  rowActions: any[];
  editable: boolean;
  editMode: string;
  onSave: (...args: any[]) => any;
  detail: (...args: any[]) => any;
  tree: Record<string, any>;
  groupBy: string;
  virtual: boolean;
  rowHeight: number;
  height: string;
  infinite: boolean;
  responsive: string;
  density: string;
  striped: boolean;
  hover: boolean;
  bordered: boolean;
  stickyHeader: boolean;
  stickyOffset: number;
  resizable: boolean;
  reorderable: boolean;
  aggregates: boolean;
  stateKey: string;
  views: any[];
  toolbar: any;
  importable: boolean;
  exportFilename: string;
  rowClass: (...args: any[]) => any;
  label: string;
  emptyText: string;
  loading: boolean;
  texts: Record<string, any>;
  keyOf(...args: any[]): any;
  rowOf(...args: any[]): any;
  setRows(...args: any[]): any;
  reload(...args: any[]): any;
  refresh(...args: any[]): any;
  getRows(...args: any[]): any;
  getSelected(...args: any[]): any;
  getQuery(...args: any[]): any;
  setSearch(...args: any[]): any;
  setFilter(...args: any[]): any;
  clearFilters(...args: any[]): any;
  setSort(...args: any[]): any;
  goToPage(...args: any[]): any;
  addRow(...args: any[]): any;
  updateRow(...args: any[]): any;
  removeRow(...args: any[]): any;
  focus(...args: any[]): any;
}

/** `<o-datepicker>` — see src/components/datepicker/README.md */
export interface ODatepickerElement extends FormElement<any> {
  mode: string;
  format: string;
  min: any;
  max: any;
  disabledDates: any;
  highlighted: any;
  weekNumbers: boolean;
  weekStart: number;
  months: number;
  outsideDays: any;
  time: boolean;
  hour12: any;
  step: number;
  inline: boolean;
  placeholder: string;
  todayButton: boolean;
  clearable: boolean;
  closeOnSelect: boolean;
  size: string;
  texts: Record<string, any>;
  setValue(...args: any[]): any;
  open(...args: any[]): any;
  close(...args: any[]): any;
  toggle(...args: any[]): any;
  show(...args: any[]): any;
  clear(...args: any[]): any;
  focus(...args: any[]): any;
}

/** `<o-daterange>` — see src/components/daterange/README.md */
export interface ODaterangeElement extends FormElement<any> {
  nameStart: string;
  nameEnd: string;
  format: string;
  min: any;
  max: any;
  disabledDates: any;
  highlighted: any;
  weekStart: number;
  weekNumbers: boolean;
  months: number;
  presets: any;
  minDays: number;
  maxDays: number;
  instant: boolean;
  time: boolean;
  hour12: any;
  step: number;
  placeholderStart: string;
  placeholderEnd: string;
  clearable: boolean;
  size: string;
  texts: Record<string, any>;
  setValue(...args: any[]): any;
  apply(...args: any[]): any;
  cancel(...args: any[]): any;
  setRange(...args: any[]): any;
  open(...args: any[]): any;
  close(...args: any[]): any;
  toggle(...args: any[]): any;
  clear(...args: any[]): any;
  focus(...args: any[]): any;
}

/** `<o-diagram>` — see src/components/diagram/README.md */
export interface ODiagramElement extends OElement {
  grid: number;
  snap: boolean;
  minimap: boolean;
  readonly: boolean;
  palette: any;
  properties: boolean;
  toolbar: boolean;
  guides: boolean;
  edgeType: string;
  arrow: string;
  wheel: string;
  minZoom: number;
  maxZoom: number;
  autoFit: boolean;
  createOnDblclick: boolean;
  panOnDrag: boolean;
  cornerRadius: number;
  canConnect: (...args: any[]) => any;
  renderNode: (...args: any[]) => any;
  shapes: Record<string, any>;
  label: string;
  texts: Record<string, any>;
  value: Record<string, any>;
  getValue(...args: any[]): any;
  setValue(...args: any[]): any;
  import(...args: any[]): any;
  toJSON(...args: any[]): any;
  getNode(...args: any[]): any;
  getEdge(...args: any[]): any;
  getNodes(...args: any[]): any;
  getEdges(...args: any[]): any;
  addNode(...args: any[]): any;
  updateNode(...args: any[]): any;
  removeNode(...args: any[]): any;
  addEdge(...args: any[]): any;
  updateEdge(...args: any[]): any;
  removeEdge(...args: any[]): any;
  connect(...args: any[]): any;
  deleteSelection(...args: any[]): any;
  moveSelection(...args: any[]): any;
  select(...args: any[]): any;
  selectAll(...args: any[]): any;
  clearSelection(...args: any[]): any;
  getSelection(...args: any[]): any;
  group(...args: any[]): any;
  ungroup(...args: any[]): any;
  bringToFront(...args: any[]): any;
  sendToBack(...args: any[]): any;
  copy(...args: any[]): any;
  cut(...args: any[]): any;
  paste(...args: any[]): any;
  duplicate(...args: any[]): any;
  undo(...args: any[]): any;
  redo(...args: any[]): any;
  fit(...args: any[]): any;
  zoomTo(...args: any[]): any;
  focusNode(...args: any[]): any;
  focus(...args: any[]): any;
  layout(...args: any[]): any;
  exportSVG(...args: any[]): any;
  exportPNG(...args: any[]): any;
  download(...args: any[]): any;
}

/** `<o-doc-scanner>` — see src/components/camera/README.md */
export interface ODocScannerElement extends OElement {
  facing: string;
  resolution: string;
  format: string;
  quality: number;
  deviceId: string;
  source: any;
  texts: Record<string, any>;
  start(...args: any[]): any;
  stop(...args: any[]): any;
  capture(...args: any[]): any;
  loadImage(...args: any[]): any;
  autoDetect(...args: any[]): any;
  applyCorners(...args: any[]): any;
  setFilter(...args: any[]): any;
  rotate(...args: any[]): any;
  removePage(...args: any[]): any;
  reorderPage(...args: any[]): any;
  clear(...args: any[]): any;
  exportPDF(...args: any[]): any;
  exportImages(...args: any[]): any;
}

/** `<o-dock>` — see src/components/dock/README.md */
export interface ODockElement extends OElement {
  layoutKey: string;
  label: string;
  texts: Record<string, any>;
  getPanels(...args: any[]): any;
  getLayout(...args: any[]): any;
  setLayout(...args: any[]): any;
  reset(...args: any[]): any;
  movePanel(...args: any[]): any;
  close(...args: any[]): any;
  open(...args: any[]): any;
  openPanelsMenu(...args: any[]): any;
  minimize(...args: any[]): any;
  expand(...args: any[]): any;
  toggleMinimize(...args: any[]): any;
  maximize(...args: any[]): any;
  restore(...args: any[]): any;
  toggleMaximize(...args: any[]): any;
  float(...args: any[]): any;
  dockBack(...args: any[]): any;
}

/** `<o-dock-panel>` — see src/components/dock/README.md */
export interface ODockPanelElement extends OElement {
  title: string;
  icon: string;
  badge: string;
  region: string;
  size: number;
  closable: boolean;
}

/** `<o-docviewer>` — see src/components/docviewer/README.md */
export interface ODocviewerElement extends OElement {
  src: any;
  type: string;
  filename: string;
  label: string;
  texts: Record<string, any>;
  refresh(...args: any[]): any;
  download(...args: any[]): any;
  openInNewTab(...args: any[]): any;
  print(...args: any[]): any;
  zoomIn(...args: any[]): any;
  zoomOut(...args: any[]): any;
  resetZoom(...args: any[]): any;
  toggleFullscreen(...args: any[]): any;
}

/** `<o-drawer>` — see src/components/drawer/README.md */
export interface ODrawerElement extends OElement {
  isOpen: boolean;
  heading: string;
  label: string;
  placement: string;
  size: string;
  static: boolean;
  closable: boolean;
  backdrop: boolean;
  push: string;
  swipe: boolean;
  loading: boolean;
  texts: Record<string, any>;
}

/** `<o-dropdown>` — see src/components/dropdown/README.md */
export interface ODropdownElement extends OElement {
  placement: string;
  disabled: boolean;
  isOpen: boolean;
  close(...args: any[]): any;
  toggle(...args: any[]): any;
}

/** `<o-editor>` — see src/components/editor/README.md */
export interface OEditorElement extends FormElement<any> {
  value: string;
  placeholder: string;
  label: string;
  toolbar: any;
  maxLength: number;
  mentions: any;
  uploadImage: (...args: any[]) => any;
  spellcheck: boolean;
  autofocus: boolean;
  texts: Record<string, any>;
  range(...args: any[]): any;
  exec(...args: any[]): any;
  isActive(...args: any[]): any;
  undo(...args: any[]): any;
  redo(...args: any[]): any;
  getMentions(...args: any[]): any;
  insertHTML(...args: any[]): any;
  insertText(...args: any[]): any;
  getMarkdown(...args: any[]): any;
  setMarkdown(...args: any[]): any;
  getText(...args: any[]): any;
  getHTML(...args: any[]): any;
  getSelectionText(...args: any[]): any;
  clear(...args: any[]): any;
  focus(...args: any[]): any;
}

/** `<o-email-preview>` — see src/components/emailpreview/README.md */
export interface OEmailPreviewElement extends OElement {
  html: string;
  subject: string;
  from: string;
  to: any;
  preheader: string;
  device: string;
  dark: boolean;
  images: boolean;
  zoom: number;
  view: string;
  toolbar: boolean;
  texts: Record<string, any>;
  refresh(...args: any[]): any;
  getPlainText(...args: any[]): any;
  getSanitizedHTML(...args: any[]): any;
  sendTest(...args: any[]): any;
}

/** `<o-fab>` — see src/components/fab/README.md */
export interface OFabElement extends OElement {
  icon: string;
  label: string;
  direction: string;
  backdrop: boolean;
  radius: number;
  isOpen: boolean;
  close(...args: any[]): any;
  toggle(...args: any[]): any;
}

/** `<o-fab-action>` — see src/components/fab/README.md */
export interface OFabActionElement extends OElement {
  icon: string;
  label: string;
  href: string;
  disabled: boolean;
}

/** `<o-facet-chips>` — see src/components/facets/README.md */
export interface OFacetChipsElement extends OElement {
  for: string;
  texts: Record<string, any>;
}

/** `<o-facets>` — see src/components/facets/README.md */
export interface OFacetsElement extends OElement {
  items: any[];
  groups: any[];
  value: Record<string, any>;
  for: string;
  label: string;
  collapsible: boolean;
  urlKey: string;
  texts: Record<string, any>;
  filter(...args: any[]): any;
  clearGroup(...args: any[]): any;
  remove(...args: any[]): any;
  clear(...args: any[]): any;
  refresh(...args: any[]): any;
}

/** `<o-faq>` — see src/components/accordion/README.md */
export interface OFaqElement extends OElement {
  multiple: boolean;
  variant: string;
  searchable: boolean;
  jsonLd: boolean;
  placeholder: string;
  query: string;
  category: string;
  questions: any[];
  search(...args: any[]): any;
  setCategory(...args: any[]): any;
  expandAll(...args: any[]): any;
}

/** `<o-favorite-button>` — see src/components/userdata/README.md */
export interface OFavoriteButtonElement extends OElement {
  item: Record<string, any>;
  label: boolean;
  size: string;
  texts: Record<string, any>;
  focus(...args: any[]): any;
  toggle(...args: any[]): any;
}

/** `<o-favorites-list>` — see src/components/userdata/README.md */
export interface OFavoritesListElement extends OElement {
  limit: number;
  emptyText: string;
  clearable: boolean;
  texts: Record<string, any>;
  items(...args: any[]): any;
  clearAll(...args: any[]): any;
  linkAttrs(...args: any[]): any;
  removeItem(...args: any[]): any;
}

/** `<o-form>` — see src/components/formbuilder/README.md */
export interface OFormElement extends OElement {
  schema: Record<string, any>;
  onSubmit: (...args: any[]) => any;
  texts: Record<string, any>;
  setSchema(...args: any[]): any;
  getData(...args: any[]): any;
  setData(...args: any[]): any;
  getField(...args: any[]): any;
  validate(...args: any[]): any;
  reset(...args: any[]): any;
}

/** `<o-gallery>` — see src/components/gallery/README.md */
export interface OGalleryElement extends OElement {
  layout: string;
  columns: number;
  minWidth: number;
  gap: any;
  aspect: string;
  rowHeight: number;
  lightbox: boolean;
  lightboxOptions: Record<string, any>;
  captions: string;
  items: any[];
  label: string;
  getItems(...args: any[]): any;
  open(...args: any[]): any;
  relayout(...args: any[]): any;
}

/** `<o-gantt>` — see src/components/gantt/README.md */
export interface OGanttElement extends OElement {
  tasks: any[];
  view: string;
  start: any;
  end: any;
  todayLine: boolean;
  criticalPath: boolean;
  readonly: boolean;
  columns: any[];
  gridWidth: number;
  rowHeight: number;
  workingDays: any[];
  holidays: any[];
  autoSchedule: boolean;
  baselines: boolean;
  toolbar: boolean;
  dateFormat: any;
  height: string;
  label: string;
  tooltip: (...args: any[]) => any;
  texts: Record<string, any>;
  undo(...args: any[]): any;
  redo(...args: any[]): any;
  clearHistory(...args: any[]): any;
  getTasks(...args: any[]): any;
  getTask(...args: any[]): any;
  addTask(...args: any[]): any;
  updateTask(...args: any[]): any;
  removeTask(...args: any[]): any;
  addLink(...args: any[]): any;
  removeLink(...args: any[]): any;
  indent(...args: any[]): any;
  outdent(...args: any[]): any;
  schedule(...args: any[]): any;
  getCriticalPath(...args: any[]): any;
  select(...args: any[]): any;
  getSelected(...args: any[]): any;
  expand(...args: any[]): any;
  collapse(...args: any[]): any;
  toggle(...args: any[]): any;
  expandAll(...args: any[]): any;
  collapseAll(...args: any[]): any;
  scrollToTask(...args: any[]): any;
  setView(...args: any[]): any;
  zoomIn(...args: any[]): any;
  zoomOut(...args: any[]): any;
  scrollToToday(...args: any[]): any;
  scrollToDate(...args: any[]): any;
  refresh(...args: any[]): any;
}

/** `<o-global-search>` — see src/components/globalsearch/README.md */
export interface OGlobalSearchElement extends OElement {
  placeholder: string;
  shortcut: string;
  providers: any[];
  trending: any[];
  minChars: number;
  debounce: number;
  scope: string;
  texts: Record<string, any>;
  open(...args: any[]): any;
  close(...args: any[]): any;
  toggle(...args: any[]): any;
  focus(...args: any[]): any;
  setQuery(...args: any[]): any;
  onKeydown(...args: any[]): any;
  activate(...args: any[]): any;
}

/** `<o-graph>` — see src/components/graph/README.md */
export interface OGraphElement extends OElement {
  nodes: any[];
  edges: any[];
  legend: boolean;
  toolbar: boolean;
  frozen: boolean;
  linkDistance: number;
  charge: number;
  minZoom: number;
  maxZoom: number;
  label: string;
  texts: Record<string, any>;
  reheat(...args: any[]): any;
  select(...args: any[]): any;
  getSelection(...args: any[]): any;
  pin(...args: any[]): any;
  unpin(...args: any[]): any;
  freeze(...args: any[]): any;
  unfreeze(...args: any[]): any;
  getValue(...args: any[]): any;
  getNode(...args: any[]): any;
  getNeighbors(...args: any[]): any;
  fit(...args: any[]): any;
  zoomTo(...args: any[]): any;
  exportSVG(...args: any[]): any;
  exportPNG(...args: any[]): any;
  download(...args: any[]): any;
}

/** `<o-hcaptcha>` — see src/components/captcha/README.md */
export interface OHcaptchaElement extends FormElement<any> {
  value: string;
  sitekey: string;
  version: string;
  theme: string;
  size: string;
  action: string;
  texts: Record<string, any>;
}

/** `<o-help>` — see src/components/help/README.md */
export interface OHelpElement extends OElement {
  text: string;
  placement: string;
  article: string;
  label: string;
  toggle(...args: any[]): any;
  close(...args: any[]): any;
  open(...args: any[]): any;
}

/** `<o-help-panel>` — see src/components/help/README.md */
export interface OHelpPanelElement extends OElement {
  placement: string;
  width: string;
  isOpen: boolean;
  texts: Record<string, any>;
  open(...args: any[]): any;
  close(...args: any[]): any;
  toggle(...args: any[]): any;
  navigate(...args: any[]): any;
  back(...args: any[]): any;
  forward(...args: any[]): any;
  search(...args: any[]): any;
}

/** `<o-install-prompt>` — see src/components/pwa/README.md */
export interface OInstallPromptElement extends OElement {
  appName: string;
  description: string;
  icon: string;
  variant: string;
  position: string;
  dismissDays: number;
  force: boolean;
  mode: string;
  texts: Record<string, any>;
  install(...args: any[]): any;
  dismiss(...args: any[]): any;
  reset(...args: any[]): any;
}

/** `<o-kanban>` — see src/components/kanban/README.md */
export interface OKanbanElement extends OElement {
  columns: any[];
  cards: any[];
  swimlanes: any[];
  variant: string;
  renderCard: (...args: any[]) => any;
  onMove: (...args: any[]) => any;
  persist: string;
  wipBlock: boolean;
  filterable: boolean;
  readonly: boolean;
  lockColumns: boolean;
  addPosition: string;
  cardActions: any[];
  detail: string;
  height: string;
  texts: Record<string, any>;
  label: string;
  getData(...args: any[]): any;
}

/** `<o-lang-switch>` — see src/components/switchers/README.md */
export interface OLangSwitchElement extends OElement {
  variant: string;
  texts: Record<string, any>;
}

/** `<o-live-indicator>` — see src/components/realtime/README.md */
export interface OLiveIndicatorElement extends OElement {
  for: string;
  compact: boolean;
  pill: boolean;
  client: Record<string, any>;
  texts: Record<string, any>;
  paint(...args: any[]): any;
}

/** `<o-location-picker>` — see src/components/locationpicker/README.md */
export interface OLocationPickerElement extends FormElement<any> {
  value: any;
  lat: number;
  lng: number;
  zoom: number;
  mode: string;
  tiles: any;
  provider: string;
  countryCodes: string;
  lang: string;
  radius: number;
  addressName: string;
  reverseGeocode: boolean;
  email: string;
  height: string;
  texts: Record<string, any>;
  setLocation(...args: any[]): any;
  clear(...args: any[]): any;
  focus(...args: any[]): any;
}

/** `<o-map>` — see src/components/map/README.md */
export interface OMapElement extends OElement {
  lat: number;
  lng: number;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  tiles: any;
  attribution: string;
  tileSize: number;
  retina: boolean;
  tileFilter: string;
  controls: string;
  scrollZoom: boolean;
  height: string;
  label: string;
  markers: any[];
  cluster: boolean;
  clusterRadius: number;
  baseLayers: any[];
  provider: string;
  apiKey: string;
  mapId: string;
  texts: Record<string, any>;
  locate(...args: any[]): any;
  setView(...args: any[]): any;
  flyTo(...args: any[]): any;
  fitBounds(...args: any[]): any;
  project(...args: any[]): any;
  unproject(...args: any[]): any;
  getCenter(...args: any[]): any;
  getZoom(...args: any[]): any;
  getBounds(...args: any[]): any;
  invalidateSize(...args: any[]): any;
}

/** `<o-modal>` — see src/components/modal/README.md */
export interface OModalElement extends OElement {
  isOpen: boolean;
  heading: string;
  label: string;
  size: string;
  static: boolean;
  centered: boolean;
  scrollable: boolean;
  fullscreen: string;
  closable: boolean;
  draggable: boolean;
  backdrop: boolean;
  loading: boolean;
  texts: Record<string, any>;
  close(...args: any[]): any;
  toggle(...args: any[]): any;
}

/** `<o-network-status>` — see src/components/network/README.md */
export interface ONetworkStatusElement extends OElement {
  variant: string;
  toast: boolean;
  hideOnline: boolean;
  texts: Record<string, any>;
}

/** `<o-notification-bell>` — see src/components/notifications/README.md */
export interface ONotificationBellElement extends OElement {
  max: number;
  showDot: boolean;
  placement: string;
  label: string;
  texts: Record<string, any>;
  open(...args: any[]): any;
  close(...args: any[]): any;
  toggle(...args: any[]): any;
}

/** `<o-notifications>` — see src/components/notifications/README.md */
export interface ONotificationsElement extends OElement {
  compact: boolean;
  groupByDay: boolean;
  showHeader: boolean;
  emptyText: string;
  source: (...args: any[]) => any;
  pageSize: number;
  autoLoad: boolean;
  label: string;
  texts: Record<string, any>;
  markAllRead(...args: any[]): any;
  clearAll(...args: any[]): any;
  load(...args: any[]): any;
}

/** `<o-number>` — see src/components/numberinput/README.md */
export interface ONumberElement extends FormElement<any> {
  value: number;
  min: number;
  max: number;
  step: number;
  precision: number;
  currency: string;
  percent: boolean;
  unit: string;
  prefix: string;
  suffix: string;
  allowNegative: boolean;
  controls: string;
  wheel: boolean;
  locale: string;
  grouping: boolean;
  placeholder: string;
  size: string;
  align: string;
  texts: Record<string, any>;
  cfg(...args: any[]): any;
  fmtOpts(...args: any[]): any;
  text(...args: any[]): any;
  paint(...args: any[]): any;
  syncAria(...args: any[]): any;
  onType(...args: any[]): any;
  onPaste(...args: any[]): any;
  onKey(...args: any[]): any;
  commit(...args: any[]): any;
  stepBy(...args: any[]): any;
  hold(...args: any[]): any;
  stepUp(...args: any[]): any;
  stepDown(...args: any[]): any;
  clear(...args: any[]): any;
}

/** `<o-ocr>` — see src/components/ocr/README.md */
export interface OOcrElement extends OElement {
  engine: any;
  lang: string;
  languages: any[];
  src: any;
  fixture: string;
  autoRecognize: boolean;
  camera: boolean;
  label: string;
  texts: Record<string, any>;
  load(...args: any[]): any;
  clearRegion(...args: any[]): any;
  recognize(...args: any[]): any;
  abort(...args: any[]): any;
}

/** `<o-offline-banner>` — see src/components/offline/README.md */
export interface OOfflineBannerElement extends OElement {
  position: string;
  onlineDuration: number;
  state: string;
  showQueue: boolean;
  texts: Record<string, any>;
  retry(...args: any[]): any;
}

/** `<o-orgchart>` — see src/components/orgchart/README.md */
export interface OOrgchartElement extends OElement {
  nodes: any[];
  direction: string;
  compact: boolean;
  collapsible: boolean;
  searchable: boolean;
  draggable: boolean;
  toolbar: boolean;
  minZoom: number;
  maxZoom: number;
  autoFit: boolean;
  renderNode: (...args: any[]) => any;
  label: string;
  texts: Record<string, any>;
  search(...args: any[]): any;
  focusPerson(...args: any[]): any;
  reassign(...args: any[]): any;
  expand(...args: any[]): any;
  collapse(...args: any[]): any;
  toggle(...args: any[]): any;
  isExpanded(...args: any[]): any;
  expandAll(...args: any[]): any;
  collapseAll(...args: any[]): any;
  select(...args: any[]): any;
  getSelection(...args: any[]): any;
  getValue(...args: any[]): any;
  getNodes(...args: any[]): any;
  getNode(...args: any[]): any;
  getChildren(...args: any[]): any;
  getAncestors(...args: any[]): any;
  fit(...args: any[]): any;
  zoomTo(...args: any[]): any;
  exportSVG(...args: any[]): any;
  exportPNG(...args: any[]): any;
  download(...args: any[]): any;
}

/** `<o-otp>` — see src/components/otp/README.md */
export interface OOtpElement extends FormElement<any> {
  value: string;
  length: number;
  type: string;
  mask: boolean;
  separator: any;
  autofocus: boolean;
  resendSeconds: number;
  webotp: boolean;
  invalid: boolean;
  size: string;
  texts: Record<string, any>;
  build(...args: any[]): any;
  sepAt(...args: any[]): any;
  fill(...args: any[]): any;
  commitValue(...args: any[]): any;
  fireChange(...args: any[]): any;
  onInput(...args: any[]): any;
  onPaste(...args: any[]): any;
  onKey(...args: any[]): any;
  focus(...args: any[]): any;
  clear(...args: any[]): any;
  shake(...args: any[]): any;
  setError(...args: any[]): any;
  restartTimer(...args: any[]): any;
  tick(...args: any[]): any;
  resend(...args: any[]): any;
  startWebOtp(...args: any[]): any;
}

/** `<o-pagination>` — see src/components/pagination/README.md */
export interface OPaginationElement extends OElement {
  total: number;
  page: number;
  pageSize: number;
  pageSizes: any[];
  siblings: number;
  boundaries: number;
  showTotal: boolean;
  showJump: boolean;
  edges: boolean;
  variant: string;
  size: string;
  align: string;
  disabled: boolean;
  label: string;
  texts: Record<string, any>;
  go(...args: any[]): any;
  next(...args: any[]): any;
  prev(...args: any[]): any;
  setPageSize(...args: any[]): any;
}

/** `<o-phone>` — see src/components/phone/README.md */
export interface OPhoneElement extends FormElement<any> {
  value: string;
  country: string;
  preferred: any[];
  format: string;
  recent: boolean;
  placeholder: string;
  locale: string;
  size: string;
  texts: Record<string, any>;
  defaultCountry(...args: any[]): any;
  useCountry(...args: any[]): any;
  reparse(...args: any[]): any;
  text(...args: any[]): any;
  paint(...args: any[]): any;
  onType(...args: any[]): any;
  commit(...args: any[]): any;
  fire(...args: any[]): any;
  setCountry(...args: any[]): any;
  clear(...args: any[]): any;
  buildList(...args: any[]): any;
  ensurePanel(...args: any[]): any;
  filter(...args: any[]): any;
  markCurrent(...args: any[]): any;
  open(...args: any[]): any;
  close(...args: any[]): any;
  pick(...args: any[]): any;
}

/** `<o-pivot>` — see src/components/pivot/README.md */
export interface OPivotElement extends OElement {
  data: any[];
  config: Record<string, any>;
  fields: any[];
  fieldList: boolean;
  editable: boolean;
  view: string;
  maxRows: number;
  texts: Record<string, any>;
  setData(...args: any[]): any;
  setConfig(...args: any[]): any;
  getConfig(...args: any[]): any;
  refresh(...args: any[]): any;
  toggleFieldList(...args: any[]): any;
  expandAll(...args: any[]): any;
  collapseAll(...args: any[]): any;
  getResult(...args: any[]): any;
  export(...args: any[]): any;
}

/** `<o-poll>` — see src/components/survey/README.md */
export interface OPollElement extends OElement {
  question: string;
  options: any[];
  multiple: boolean;
  maxChoices: number;
  name: string;
  votes: Record<string, any>;
  persist: boolean;
  allowRevote: boolean;
  resultsOnly: boolean;
  texts: Record<string, any>;
  hasVoted(...args: any[]): any;
  getResults(...args: any[]): any;
  vote(...args: any[]): any;
  changeVote(...args: any[]): any;
  reset(...args: any[]): any;
}

/** `<o-popover>` — see src/components/popover/README.md */
export interface OPopoverElement extends OElement {
  for: string;
  placement: string;
  trigger: string;
  heading: string;
  closeButton: boolean;
  width: string;
  label: string;
  isOpen: boolean;
  close(...args: any[]): any;
  toggle(...args: any[]): any;
  reposition(...args: any[]): any;
}

/** `<o-preferences>` — see src/components/preferences/README.md */
export interface OPreferencesElement extends OElement {
  sections: any[];
  notifications: any[];
  texts: Record<string, any>;
  reset(...args: any[]): any;
}

/** `<o-presence>` — see src/components/presence/README.md */
export interface OPresenceElement extends OElement {
  status: string;
  userId: string;
  label: string;
  showLabel: boolean;
  pulse: boolean;
  texts: Record<string, any>;
}

/** `<o-presence-list>` — see src/components/presence/README.md */
export interface OPresenceListElement extends OElement {
  items: any[];
  groupBy: string;
  hideOffline: boolean;
  live: boolean;
  empty: string;
  texts: Record<string, any>;
}

/** `<o-progress-tracker>` — see src/components/stepper/README.md */
export interface OProgressTrackerElement extends OElement {
  steps: any[];
  current: number;
  orientation: string;
  status: string;
  label: string;
  responsive: boolean;
  texts: Record<string, any>;
}

/** `<o-qrcode>` — see src/components/qrcode/README.md */
export interface OQrcodeElement extends OElement {
  value: string;
  size: number;
  ecc: string;
  color: string;
  background: string;
  margin: number;
  moduleStyle: string;
  finderStyle: string;
  logo: Record<string, any>;
  label: string;
  download: string;
  saveAsPNG(...args: any[]): any;
}

/** `<o-query-builder>` — see src/components/querybuilder/README.md */
export interface OQueryBuilderElement extends FormElement<any> {
  value: any;
  fields: any[];
  maxDepth: number;
  mode: string;
  dialect: string;
  texts: Record<string, any>;
  toSQL(...args: any[]): any;
  toMongo(...args: any[]): any;
  toString(...args: any[]): any;
  toPredicate(...args: any[]): any;
  fromJSON(...args: any[]): any;
  renderTree(...args: any[]): any;
}

/** `<o-range>` — see src/components/range/README.md */
export interface ORangeElement extends FormElement<any> {
  value: number;
  valueStart: number;
  valueEnd: number;
  dual: boolean;
  min: number;
  max: number;
  step: number;
  minDistance: number;
  marks: any;
  ticks: boolean;
  format: any;
  orientation: string;
  tooltip: string;
  inputs: any[];
  nameEnd: string;
  size: string;
  texts: Record<string, any>;
  makeThumb(...args: any[]): any;
  decimals(...args: any[]): any;
  snap(...args: any[]): any;
  clampThumb(...args: any[]): any;
  pct(...args: any[]): any;
  fmtValue(...args: any[]): any;
  paint(...args: any[]): any;
  buildMarks(...args: any[]): any;
  setThumb(...args: any[]): any;
  setValue(...args: any[]): any;
  setRange(...args: any[]): any;
  onThumbKey(...args: any[]): any;
  valueFromPoint(...args: any[]): any;
  beginDrag(...args: any[]): any;
  onTrackDown(...args: any[]): any;
  wireInputs(...args: any[]): any;
  syncLinkedInputs(...args: any[]): any;
  focus(...args: any[]): any;
}

/** `<o-rating>` — see src/components/rating/README.md */
export interface ORatingElement extends FormElement<any> {
  value: number;
  max: number;
  precision: number;
  icon: string;
  iconOn: string;
  iconOff: string;
  color: string;
  size: string;
  clearable: boolean;
  itemLabels: any[];
  format: any;
  texts: Record<string, any>;
  precisionStep(...args: any[]): any;
  shapeFor(...args: any[]): any;
  buildItems(...args: any[]): any;
  paintColor(...args: any[]): any;
  paintFill(...args: any[]): any;
  updateAria(...args: any[]): any;
  levelLabel(...args: any[]): any;
  fmtValue(...args: any[]): any;
  localFrac(...args: any[]): any;
  onHover(...args: any[]): any;
  onHoverEnd(...args: any[]): any;
  commit(...args: any[]): any;
  onClick(...args: any[]): any;
  onKey(...args: any[]): any;
  focusItemFor(...args: any[]): any;
  clear(...args: any[]): any;
  focus(...args: any[]): any;
}

/** `<o-recaptcha>` — see src/components/captcha/README.md */
export interface ORecaptchaElement extends FormElement<any> {
  value: string;
  sitekey: string;
  version: string;
  theme: string;
  size: string;
  action: string;
  texts: Record<string, any>;
}

/** `<o-recent-list>` — see src/components/userdata/README.md */
export interface ORecentListElement extends OElement {
  type: string;
  limit: number;
  store: string;
  emptyText: string;
  clearable: boolean;
  texts: Record<string, any>;
  items(...args: any[]): any;
  clearAll(...args: any[]): any;
}

/** `<o-recurrence-editor>` — see src/components/calendar/README.md */
export interface ORecurrenceEditorElement extends FormElement<any> {
  value: string;
  start: any;
  weekStart: number;
  locale: string;
  texts: Record<string, any>;
  preview(...args: any[]): any;
}

/** `<o-repeater>` — see src/components/repeater/README.md */
export interface ORepeaterElement extends OElement {
  name: string;
  min: number;
  max: number;
  initial: number;
  sortable: boolean;
  duplicable: boolean;
  addText: string;
  emptyText: string;
  itemLabel: string;
  value: any[];
  texts: Record<string, any>;
  getValue(...args: any[]): any;
  setValue(...args: any[]): any;
  add(...args: any[]): any;
  remove(...args: any[]): any;
  duplicate(...args: any[]): any;
  move(...args: any[]): any;
  clear(...args: any[]): any;
}

/** `<o-reviews>` — see src/components/survey/README.md */
export interface OReviewsElement extends OElement {
  reviews: any[];
  summary: boolean;
  allowWrite: boolean;
  sort: string;
  filterStars: number;
  name: string;
  texts: Record<string, any>;
  addReview(...args: any[]): any;
  getReviews(...args: any[]): any;
  setReviews(...args: any[]): any;
  voteHelpful(...args: any[]): any;
}

/** `<o-saved-views>` — see src/components/userdata/README.md */
export interface OSavedViewsElement extends OElement {
  scope: string;
  value: string;
  state: any;
  getState: (...args: any[]) => any;
  applyDefault: boolean;
  placement: string;
  texts: Record<string, any>;
  currentState(...args: any[]): any;
  apply(...args: any[]): any;
  save(...args: any[]): any;
  remove(...args: any[]): any;
  open(...args: any[]): any;
  close(...args: any[]): any;
  toggle(...args: any[]): any;
}

/** `<o-scanner>` — see src/components/scanner/README.md */
export interface OScannerElement extends OElement {
  formats: any[];
  continuous: boolean;
  beep: boolean;
  vibrate: boolean;
  torch: boolean;
  cameraSelect: boolean;
  region: boolean;
  source: Record<string, any>;
  start(...args: any[]): any;
  stop(...args: any[]): any;
  switchCamera(...args: any[]): any;
  toggleTorch(...args: any[]): any;
  decodeFile(...args: any[]): any;
}

/** `<o-scroll-progress>` — see src/components/scroll/README.md */
export interface OScrollProgressElement extends OElement {
  target: string;
  position: string;
}

/** `<o-select>` — see src/components/select/README.md */
export interface OSelectElement extends FormElement<any> {
  multiple: boolean;
  tags: boolean;
  options: any[];
  placeholder: string;
  searchable: any;
  display: string;
  clearable: boolean;
  creatable: boolean;
  max: number;
  size: string;
  source: (...args: any[]) => any;
  url: string;
  fields: Record<string, any>;
  debounce: number;
  minChars: number;
  renderOption: (...args: any[]) => any;
  renderValue: (...args: any[]) => any;
  selectAll: boolean;
  hideSelected: boolean;
  closeOnSelect: any;
  virtualThreshold: number;
  texts: Record<string, any>;
  open(...args: any[]): any;
  close(...args: any[]): any;
  toggle(...args: any[]): any;
  setValue(...args: any[]): any;
  clear(...args: any[]): any;
  setOptions(...args: any[]): any;
  addOption(...args: any[]): any;
  removeOption(...args: any[]): any;
  getOption(...args: any[]): any;
  refresh(...args: any[]): any;
}

/** `<o-share>` — see src/components/share/README.md */
export interface OShareElement extends OElement {
  url: string;
  title: string;
  text: string;
  networks: any;
  variant: string;
  native: string;
  label: string;
  size: string;
  data(...args: any[]): any;
  share(...args: any[]): any;
}

/** `<o-sidebar-menu>` — see src/components/sidebar/README.md */
export interface OSidebarMenuElement extends OElement {
  items: any[];
  current: string;
  accordion: boolean;
  texts: Record<string, any>;
  setCurrent(...args: any[]): any;
  expandAll(...args: any[]): any;
  collapseAll(...args: any[]): any;
}

/** `<o-signature>` — see src/components/signature/README.md */
export interface OSignatureElement extends FormElement<any> {
  value: string;
  penColor: string;
  penWidth: number;
  minWidth: number;
  maxWidth: number;
  velocityFilter: boolean;
  background: string;
  typed: boolean;
  texts: Record<string, any>;
  clear(...args: any[]): any;
  undo(...args: any[]): any;
  toDataURL(...args: any[]): any;
  toPNG(...args: any[]): any;
  toJPEG(...args: any[]): any;
  toBlob(...args: any[]): any;
  toFile(...args: any[]): any;
  toPoints(...args: any[]): any;
  toSVG(...args: any[]): any;
  fromDataURL(...args: any[]): any;
  fromPoints(...args: any[]): any;
}

/** `<o-sparkline>` — see src/components/sparkline/README.md */
export interface OSparklineElement extends OElement {
  values: any;
  labels: any[];
  type: string;
  color: string;
  min: number;
  max: number;
  highlight: string;
  format: any;
  currency: string;
  label: string;
  curve: string;
  tooltip: boolean;
}

/** `<o-split>` — see src/components/split/README.md */
export interface OSplitElement extends OElement {
  direction: string;
  sizes: any[];
  min: string;
  max: string;
  collapsible: boolean;
  collapsedSize: number;
  gutterSize: number;
  snap: number;
  step: number;
  persist: string;
  texts: Record<string, any>;
  getSizes(...args: any[]): any;
  setSizes(...args: any[]): any;
  collapse(...args: any[]): any;
  expand(...args: any[]): any;
  toggle(...args: any[]): any;
  isCollapsed(...args: any[]): any;
  reset(...args: any[]): any;
}

/** `<o-split-view>` — see src/components/split/README.md */
export interface OSplitViewElement extends OElement {
  breakpoint: string;
  listWidth: string;
  hash: string;
  label: string;
  selected: string;
  items: string;
  texts: Record<string, any>;
  select(...args: any[]): any;
  showDetail(...args: any[]): any;
  showList(...args: any[]): any;
  clear(...args: any[]): any;
}

/** `<o-stat>` — see src/components/stat/README.md */
export interface OStatElement extends OElement {
  label: string;
  value: any;
  format: string;
  currency: string;
  decimals: number;
  prefix: string;
  suffix: string;
  compact: boolean;
  delta: number;
  deltaFormat: string;
  deltaDecimals: number;
  deltaGood: string;
  period: string;
  icon: string;
  color: string;
  description: string;
  sparkline: any[];
  sparklineType: string;
  sparklineLabels: any[];
  goal: number;
  goalType: string;
  loading: boolean;
  variant: string;
  href: string;
  target: string;
  countup: boolean;
  duration: number;
  texts: Record<string, any>;
}

/** `<o-stat-group>` — see src/components/stat/README.md */
export interface OStatGroupElement extends OElement {
  min: string;
  columns: number;
  plain: boolean;
  label: string;
}

/** `<o-stepper>` — see src/components/stepper/README.md */
export interface OStepperElement extends OElement {
  steps: any[];
  current: number;
  orientation: string;
  variant: string;
  clickable: boolean;
  responsive: boolean;
  label: string;
  texts: Record<string, any>;
  statusOf(...args: any[]): any;
  goTo(...args: any[]): any;
  next(...args: any[]): any;
  prev(...args: any[]): any;
  setStatus(...args: any[]): any;
}

/** `<o-stopwatch>` — see src/components/timers/README.md */
export interface OStopwatchElement extends OElement {
  autostart: boolean;
  format: string;
  centiseconds: boolean;
  persist: any;
  locale: string;
  texts: Record<string, any>;
  start(...args: any[]): any;
  resume(...args: any[]): any;
  pause(...args: any[]): any;
  toggle(...args: any[]): any;
  lap(...args: any[]): any;
  reset(...args: any[]): any;
  getElapsed(...args: any[]): any;
  getLaps(...args: any[]): any;
}

/** `<o-storage-inspector>` — see src/components/storage/README.md */
export interface OStorageInspectorElement extends OElement {
  sections: any[];
  prefix: string;
  readonly: boolean;
  maxRows: number;
  texts: Record<string, any>;
  refresh(...args: any[]): any;
}

/** `<o-survey>` — see src/components/survey/README.md */
export interface OSurveyElement extends OElement {
  schema: Record<string, any>;
  texts: Record<string, any>;
  getAnswers(...args: any[]): any;
  setAnswers(...args: any[]): any;
  next(...args: any[]): any;
  prev(...args: any[]): any;
  goToPage(...args: any[]): any;
  finish(...args: any[]): any;
  reset(...args: any[]): any;
}

/** `<o-tab-panel>` — see src/components/tabs/README.md */
export interface OTabPanelElement extends OElement {
  label: string;
  icon: string;
  badge: string;
  disabled: boolean;
  closable: boolean;
  renderer: (...args: any[]) => any;
}

/** `<o-tabs>` — see src/components/tabs/README.md */
export interface OTabsElement extends OElement {
  variant: string;
  orientation: string;
  selected: any;
  label: string;
  lazy: boolean;
  keepAlive: boolean;
  hash: string;
  query: string;
  persist: string;
  closable: boolean;
  addable: boolean;
  reorderable: boolean;
  fill: boolean;
  overflow: string;
  activation: string;
  texts: Record<string, any>;
  getTabs(...args: any[]): any;
  refresh(...args: any[]): any;
  next(...args: any[]): any;
  prev(...args: any[]): any;
  select(...args: any[]): any;
  add(...args: any[]): any;
  close(...args: any[]): any;
  remove(...args: any[]): any;
}

/** `<o-tags>` — see src/components/tags/README.md */
export interface OTagsElement extends FormElement<any> {
  value: any[];
  placeholder: string;
  max: number;
  allowDuplicates: boolean;
  pattern: string;
  suggestions: any[];
  source: (...args: any[]) => any;
  strict: boolean;
  separator: string;
  delimiters: string;
  minChars: number;
  maxLength: number;
  transform: string;
  colorFor: (...args: any[]) => any;
  colors: Record<string, any>;
  editable: boolean;
  sortable: boolean;
  size: string;
  texts: Record<string, any>;
  indexOf(...args: any[]): any;
  delims(...args: any[]): any;
  norm(...args: any[]): any;
  colorOf(...args: any[]): any;
  paintChip(...args: any[]): any;
  setMsg(...args: any[]): any;
  flash(...args: any[]): any;
  check(...args: any[]): any;
  add(...args: any[]): any;
  removeAt(...args: any[]): any;
  remove(...args: any[]): any;
  clear(...args: any[]): any;
  sync(...args: any[]): any;
  commitText(...args: any[]): any;
  onInputKey(...args: any[]): any;
  onChipKey(...args: any[]): any;
  onPaste(...args: any[]): any;
  onLeave(...args: any[]): any;
  edit(...args: any[]): any;
  drag(...args: any[]): any;
  suggestItems(...args: any[]): any;
  suggest(...args: any[]): any;
  filterOut(...args: any[]): any;
  ensurePanel(...args: any[]): any;
  showList(...args: any[]): any;
  pickOption(...args: any[]): any;
  open(...args: any[]): any;
  close(...args: any[]): any;
}

/** `<o-theme-builder>` — see src/components/themebuilder/README.md */
export interface OThemeBuilderElement extends OElement {
  presets: any[];
  texts: Record<string, any>;
  applyDraft(...args: any[]): any;
  applyPreset(...args: any[]): any;
  exportJSON(...args: any[]): any;
  exportCSS(...args: any[]): any;
  importJSON(...args: any[]): any;
  saveAsTenant(...args: any[]): any;
  reset(...args: any[]): any;
}

/** `<o-theme-switch>` — see src/components/switchers/README.md */
export interface OThemeSwitchElement extends OElement {
  variant: string;
  showContrast: boolean;
  showFontSize: boolean;
  texts: Record<string, any>;
}

/** `<o-timeline-view>` — see src/components/timelineview/README.md */
export interface OTimelineViewElement extends OElement {
  items: any[];
  groups: any[];
  start: any;
  end: any;
  zoomMin: number;
  zoomMax: number;
  stack: boolean;
  editable: boolean;
  selectable: boolean;
  now: boolean;
  toolbar: boolean;
  height: string;
  groupsWidth: number;
  label: string;
  itemTemplate: (...args: any[]) => any;
  groupTemplate: (...args: any[]) => any;
  texts: Record<string, any>;
  setSelection(...args: any[]): any;
  getSelection(...args: any[]): any;
  expandGroup(...args: any[]): any;
  collapseGroup(...args: any[]): any;
  toggleGroup(...args: any[]): any;
  setWindow(...args: any[]): any;
  fit(...args: any[]): any;
  moveTo(...args: any[]): any;
  zoom(...args: any[]): any;
  zoomIn(...args: any[]): any;
  zoomOut(...args: any[]): any;
  setItems(...args: any[]): any;
  getItems(...args: any[]): any;
  getItem(...args: any[]): any;
  setGroups(...args: any[]): any;
  getGroups(...args: any[]): any;
  addItem(...args: any[]): any;
  updateItem(...args: any[]): any;
  removeItem(...args: any[]): any;
  refresh(...args: any[]): any;
}

/** `<o-timepicker>` — see src/components/timepicker/README.md */
export interface OTimepickerElement extends FormElement<any> {
  value: string;
  hour12: any;
  step: number;
  seconds: boolean;
  min: string;
  max: string;
  view: string;
  inline: boolean;
  placeholder: string;
  clearable: boolean;
  size: string;
  texts: Record<string, any>;
  setValue(...args: any[]): any;
  open(...args: any[]): any;
  close(...args: any[]): any;
  toggle(...args: any[]): any;
  clear(...args: any[]): any;
  focus(...args: any[]): any;
}

/** `<o-tree>` — see src/components/tree/README.md */
export interface OTreeElement extends OElement {
  nodes: any[];
  selection: string;
  checkboxes: boolean;
  filetype: boolean;
  filterable: boolean;
  draggable: boolean;
  canDrop: (...args: any[]) => any;
  load: (...args: any[]) => any;
  renderLabel: (...args: any[]) => any;
  rowHeight: number;
  virtual: string;
  readonly: boolean;
  height: string;
  texts: Record<string, any>;
  label: string;
  getNode(...args: any[]): any;
  getChecked(...args: any[]): any;
  getSelected(...args: any[]): any;
  filter(...args: any[]): any;
  clearFilter(...args: any[]): any;
  getData(...args: any[]): any;
}

/** `<o-tts>` — see src/components/speech/README.md */
export interface OTtsElement extends OElement {
  text: string;
  lang: string;
  voice: string;
  rate: number;
  pitch: number;
  volume: number;
  highlight: boolean;
  texts: Record<string, any>;
  play(...args: any[]): any;
  pause(...args: any[]): any;
  resume(...args: any[]): any;
  stop(...args: any[]): any;
}

/** `<o-turnstile>` — see src/components/captcha/README.md */
export interface OTurnstileElement extends FormElement<any> {
  value: string;
  sitekey: string;
  version: string;
  theme: string;
  size: string;
  action: string;
  texts: Record<string, any>;
}

/** `<o-undo-controls>` — see src/components/undo/README.md */
export interface OUndoControlsElement extends OElement {
  for: string;
  manager: any;
  labels: boolean;
  size: string;
  noHistory: boolean;
  texts: Record<string, any>;
  undo(...args: any[]): any;
  redo(...args: any[]): any;
  openHistory(...args: any[]): any;
  closeHistory(...args: any[]): any;
}

/** `<o-upload>` — see src/components/upload/README.md */
export interface OUploadElement extends FormElement<any> {
  multiple: boolean;
  accept: string;
  directory: boolean;
  capture: string;
  maxFiles: number;
  maxSize: any;
  minSize: any;
  totalMaxSize: any;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  allowDuplicates: boolean;
  sniff: boolean;
  validate: (...args: any[]) => any;
  url: any;
  method: string;
  fieldName: string;
  headers: any;
  data: any;
  withCredentials: boolean;
  timeout: number;
  binary: boolean;
  uploader: (...args: any[]) => any;
  request: (...args: any[]) => any;
  parseResponse: (...args: any[]) => any;
  auto: boolean;
  manual: boolean;
  parallel: number;
  retries: number;
  retryDelay: number;
  chunkSize: any;
  chunkParallel: number;
  resumable: boolean;
  protocol: string;
  metadata: any;
  chunkRequest: (...args: any[]) => any;
  finalize: (...args: any[]) => any;
  resumeOffset: (...args: any[]) => any;
  store: Record<string, any>;
  compress: any;
  crop: any;
  previews: boolean;
  thumbSize: number;
  variant: string;
  paste: string;
  dropTarget: string;
  sortable: boolean;
  summary: boolean;
  label: string;
  hint: string;
  submit: string;
  valueKey: string;
  texts: Record<string, any>;
  addFiles(...args: any[]): any;
  removeFile(...args: any[]): any;
  clear(...args: any[]): any;
  upload(...args: any[]): any;
  pause(...args: any[]): any;
  resume(...args: any[]): any;
  cancel(...args: any[]): any;
  retry(...args: any[]): any;
  getFiles(...args: any[]): any;
  stats(...args: any[]): any;
  browse(...args: any[]): any;
  preview(...args: any[]): any;
}

/** `<o-video>` — see src/components/player/README.md */
export interface OVideoElement extends OElement {
  src: string;
  poster: string;
  tracks: any[];
  chapters: string;
  previewThumbs: string;
  playlist: any[];
  index: number;
  autoplay: boolean;
  loop: boolean;
  muted: boolean;
  controls: boolean;
  crossorigin: string;
  label: string;
  texts: Record<string, any>;
  play(...args: any[]): any;
  pause(...args: any[]): any;
  togglePlay(...args: any[]): any;
  seek(...args: any[]): any;
  skip(...args: any[]): any;
  setVolume(...args: any[]): any;
  toggleMute(...args: any[]): any;
  setSpeed(...args: any[]): any;
  setCaptions(...args: any[]): any;
  requestPiP(...args: any[]): any;
  toggleFullscreen(...args: any[]): any;
  next(...args: any[]): any;
  prev(...args: any[]): any;
}

/** `<o-video-recorder>` — see src/components/recorder/README.md */
export interface OVideoRecorderElement extends OElement {
  source: string;
  maxDuration: number;
  format: string;
  facing: string;
  stream: any;
  texts: Record<string, any>;
  start(...args: any[]): any;
  pause(...args: any[]): any;
  resume(...args: any[]): any;
  stop(...args: any[]): any;
  reRecord(...args: any[]): any;
  download(...args: any[]): any;
}

/** `<o-virtual-list>` — see src/components/virtuallist/README.md */
export interface OVirtualListElement extends OElement {
  items: any[];
  itemHeight: any;
  itemWidth: any;
  overscan: number;
  horizontal: boolean;
  grid: boolean;
  columns: number;
  minColumnWidth: number;
  gap: number;
  groupBy: any;
  groupHeaderHeight: number;
  renderGroup: (...args: any[]) => any;
  renderItem: (...args: any[]) => any;
  keyFn: (...args: any[]) => any;
  selectable: string;
  selected: any[];
  loading: boolean;
  emptyText: string;
  label: string;
  texts: Record<string, any>;
  scrollToIndex(...args: any[]): any;
  refresh(...args: any[]): any;
  appendItems(...args: any[]): any;
  prependItems(...args: any[]): any;
  getVisibleRange(...args: any[]): any;
  getSelected(...args: any[]): any;
  select(...args: any[]): any;
  clearSelection(...args: any[]): any;
}

/** `<o-widget>` — see src/components/dashboard/README.md */
export interface OWidgetElement extends OElement {
  heading: string;
  subtitle: string;
  icon: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
  collapsible: boolean;
  removable: boolean;
  refreshable: boolean;
  fullscreen: boolean;
  settings: boolean;
  headerless: boolean;
  flushed: boolean;
  locked: boolean;
  collapsed: boolean;
  loading: boolean;
  lazy: boolean;
  renderer: (...args: any[]) => any;
  data: any;
  texts: Record<string, any>;
  t(...args: any[]): any;
  menuItems(...args: any[]): any;
  openMenu(...args: any[]): any;
  runAction(...args: any[]): any;
  refresh(...args: any[]): any;
  toggleCollapse(...args: any[]): any;
  maximize(...args: any[]): any;
}

/** `<o-wizard>` — see src/components/wizard/README.md */
export interface OWizardElement extends OElement {
  current: number;
  linear: boolean;
  validate: boolean;
  persist: string;
  restore: string;
  orientation: string;
  stepperVariant: string;
  nextText: string;
  backText: string;
  finishText: string;
  skipText: string;
  guard: (...args: any[]) => any;
  texts: Record<string, any>;
  goTo(...args: any[]): any;
  next(...args: any[]): any;
  prev(...args: any[]): any;
  skip(...args: any[]): any;
  finish(...args: any[]): any;
  reset(...args: any[]): any;
  review(...args: any[]): any;
  renderReview(...args: any[]): any;
}

/** `<o-workflow>` — see src/components/diagram/README.md */
export interface OWorkflowElement extends OElement {
  shapes: Record<string, any>;
  palette: any;
  toolbar: boolean;
  properties: boolean;
  addNode(...args: any[]): any;
  autoLayout(...args: any[]): any;
  validate(...args: any[]): any;
  toggleSimulate(...args: any[]): any;
  simulate(...args: any[]): any;
  stopSimulate(...args: any[]): any;
}

/** `<o-workspace>` — see src/components/workspace/README.md */
export interface OWorkspaceElement extends OElement {
  persist: string;
  max: number;
  label: string;
  texts: Record<string, any>;
  resolver: (...args: any[]) => any;
  confirm: (...args: any[]) => any;
  getTabs(...args: any[]): any;
  getTab(...args: any[]): any;
  getPane(...args: any[]): any;
  open(...args: any[]): any;
  activate(...args: any[]): any;
  close(...args: any[]): any;
  closeOthers(...args: any[]): any;
  closeRight(...args: any[]): any;
  closeAll(...args: any[]): any;
  pin(...args: any[]): any;
  setDirty(...args: any[]): any;
  setTitle(...args: any[]): any;
  patch(...args: any[]): any;
  duplicate(...args: any[]): any;
  move(...args: any[]): any;
  restore(...args: any[]): any;
  openMenu(...args: any[]): any;
}

/** `<o-zoom>` — see src/components/gallery/README.md */
export interface OZoomElement extends OElement {
  min: number;
  max: number;
  step: number;
  controls: boolean;
  minimap: boolean;
  wheel: string;
  src: string;
  alt: string;
  label: string;
  fullscreen: boolean;
  texts: Record<string, any>;
  zoomIn(...args: any[]): any;
  zoomOut(...args: any[]): any;
  zoomTo(...args: any[]): any;
  reset(...args: any[]): any;
  panBy(...args: any[]): any;
}

export interface OrionElementTagMap {
  'o-2fa-setup': O2faSetupElement;
  'o-2fa-verify': O2faVerifyElement;
  'o-accordion': OAccordionElement;
  'o-accordion-item': OAccordionItemElement;
  'o-activity-feed': OActivityFeedElement;
  'o-address-input': OAddressInputElement;
  'o-assistant': OAssistantElement;
  'o-audio': OAudioElement;
  'o-audio-recorder': OAudioRecorderElement;
  'o-auth-form': OAuthFormElement;
  'o-autocomplete': OAutocompleteElement;
  'o-avatar': OAvatarElement;
  'o-back-to-top': OBackToTopElement;
  'o-barcode': OBarcodeElement;
  'o-biometric-login': OBiometricLoginElement;
  'o-booking': OBookingElement;
  'o-breadcrumb': OBreadcrumbElement;
  'o-calendar': OCalendarElement;
  'o-camera': OCameraElement;
  'o-can': OCanElement;
  'o-captcha': OCaptchaElement;
  'o-carousel': OCarouselElement;
  'o-chart': OChartElement;
  'o-chat': OChatElement;
  'o-chatbot': OChatbotElement;
  'o-checklist': OChecklistElement;
  'o-code-editor': OCodeEditorElement;
  'o-colorpicker': OColorpickerElement;
  'o-command-menu': OCommandMenuElement;
  'o-compare-table': OCompareTableElement;
  'o-compare-tray': OCompareTrayElement;
  'o-copy': OCopyElement;
  'o-countdown': OCountdownElement;
  'o-countup': OCountupElement;
  'o-cropper': OCropperElement;
  'o-dashboard': ODashboardElement;
  'o-datatable': ODatatableElement;
  'o-datepicker': ODatepickerElement;
  'o-daterange': ODaterangeElement;
  'o-diagram': ODiagramElement;
  'o-doc-scanner': ODocScannerElement;
  'o-dock': ODockElement;
  'o-dock-panel': ODockPanelElement;
  'o-docviewer': ODocviewerElement;
  'o-drawer': ODrawerElement;
  'o-dropdown': ODropdownElement;
  'o-editor': OEditorElement;
  'o-email-preview': OEmailPreviewElement;
  'o-fab': OFabElement;
  'o-fab-action': OFabActionElement;
  'o-facet-chips': OFacetChipsElement;
  'o-facets': OFacetsElement;
  'o-faq': OFaqElement;
  'o-favorite-button': OFavoriteButtonElement;
  'o-favorites-list': OFavoritesListElement;
  'o-form': OFormElement;
  'o-gallery': OGalleryElement;
  'o-gantt': OGanttElement;
  'o-global-search': OGlobalSearchElement;
  'o-graph': OGraphElement;
  'o-hcaptcha': OHcaptchaElement;
  'o-help': OHelpElement;
  'o-help-panel': OHelpPanelElement;
  'o-install-prompt': OInstallPromptElement;
  'o-kanban': OKanbanElement;
  'o-lang-switch': OLangSwitchElement;
  'o-live-indicator': OLiveIndicatorElement;
  'o-location-picker': OLocationPickerElement;
  'o-map': OMapElement;
  'o-modal': OModalElement;
  'o-network-status': ONetworkStatusElement;
  'o-notification-bell': ONotificationBellElement;
  'o-notifications': ONotificationsElement;
  'o-number': ONumberElement;
  'o-ocr': OOcrElement;
  'o-offline-banner': OOfflineBannerElement;
  'o-orgchart': OOrgchartElement;
  'o-otp': OOtpElement;
  'o-pagination': OPaginationElement;
  'o-phone': OPhoneElement;
  'o-pivot': OPivotElement;
  'o-poll': OPollElement;
  'o-popover': OPopoverElement;
  'o-preferences': OPreferencesElement;
  'o-presence': OPresenceElement;
  'o-presence-list': OPresenceListElement;
  'o-progress-tracker': OProgressTrackerElement;
  'o-qrcode': OQrcodeElement;
  'o-query-builder': OQueryBuilderElement;
  'o-range': ORangeElement;
  'o-rating': ORatingElement;
  'o-recaptcha': ORecaptchaElement;
  'o-recent-list': ORecentListElement;
  'o-recurrence-editor': ORecurrenceEditorElement;
  'o-repeater': ORepeaterElement;
  'o-reviews': OReviewsElement;
  'o-saved-views': OSavedViewsElement;
  'o-scanner': OScannerElement;
  'o-scroll-progress': OScrollProgressElement;
  'o-select': OSelectElement;
  'o-share': OShareElement;
  'o-sidebar-menu': OSidebarMenuElement;
  'o-signature': OSignatureElement;
  'o-sparkline': OSparklineElement;
  'o-split': OSplitElement;
  'o-split-view': OSplitViewElement;
  'o-stat': OStatElement;
  'o-stat-group': OStatGroupElement;
  'o-stepper': OStepperElement;
  'o-stopwatch': OStopwatchElement;
  'o-storage-inspector': OStorageInspectorElement;
  'o-survey': OSurveyElement;
  'o-tab-panel': OTabPanelElement;
  'o-tabs': OTabsElement;
  'o-tags': OTagsElement;
  'o-theme-builder': OThemeBuilderElement;
  'o-theme-switch': OThemeSwitchElement;
  'o-timeline-view': OTimelineViewElement;
  'o-timepicker': OTimepickerElement;
  'o-tree': OTreeElement;
  'o-tts': OTtsElement;
  'o-turnstile': OTurnstileElement;
  'o-undo-controls': OUndoControlsElement;
  'o-upload': OUploadElement;
  'o-video': OVideoElement;
  'o-video-recorder': OVideoRecorderElement;
  'o-virtual-list': OVirtualListElement;
  'o-widget': OWidgetElement;
  'o-wizard': OWizardElement;
  'o-workflow': OWorkflowElement;
  'o-workspace': OWorkspaceElement;
  'o-zoom': OZoomElement;
}

declare global {
  interface HTMLElementTagNameMap {
    'o-2fa-setup': O2faSetupElement;
    'o-2fa-verify': O2faVerifyElement;
    'o-accordion': OAccordionElement;
    'o-accordion-item': OAccordionItemElement;
    'o-activity-feed': OActivityFeedElement;
    'o-address-input': OAddressInputElement;
    'o-assistant': OAssistantElement;
    'o-audio': OAudioElement;
    'o-audio-recorder': OAudioRecorderElement;
    'o-auth-form': OAuthFormElement;
    'o-autocomplete': OAutocompleteElement;
    'o-avatar': OAvatarElement;
    'o-back-to-top': OBackToTopElement;
    'o-barcode': OBarcodeElement;
    'o-biometric-login': OBiometricLoginElement;
    'o-booking': OBookingElement;
    'o-breadcrumb': OBreadcrumbElement;
    'o-calendar': OCalendarElement;
    'o-camera': OCameraElement;
    'o-can': OCanElement;
    'o-captcha': OCaptchaElement;
    'o-carousel': OCarouselElement;
    'o-chart': OChartElement;
    'o-chat': OChatElement;
    'o-chatbot': OChatbotElement;
    'o-checklist': OChecklistElement;
    'o-code-editor': OCodeEditorElement;
    'o-colorpicker': OColorpickerElement;
    'o-command-menu': OCommandMenuElement;
    'o-compare-table': OCompareTableElement;
    'o-compare-tray': OCompareTrayElement;
    'o-copy': OCopyElement;
    'o-countdown': OCountdownElement;
    'o-countup': OCountupElement;
    'o-cropper': OCropperElement;
    'o-dashboard': ODashboardElement;
    'o-datatable': ODatatableElement;
    'o-datepicker': ODatepickerElement;
    'o-daterange': ODaterangeElement;
    'o-diagram': ODiagramElement;
    'o-doc-scanner': ODocScannerElement;
    'o-dock': ODockElement;
    'o-dock-panel': ODockPanelElement;
    'o-docviewer': ODocviewerElement;
    'o-drawer': ODrawerElement;
    'o-dropdown': ODropdownElement;
    'o-editor': OEditorElement;
    'o-email-preview': OEmailPreviewElement;
    'o-fab': OFabElement;
    'o-fab-action': OFabActionElement;
    'o-facet-chips': OFacetChipsElement;
    'o-facets': OFacetsElement;
    'o-faq': OFaqElement;
    'o-favorite-button': OFavoriteButtonElement;
    'o-favorites-list': OFavoritesListElement;
    'o-form': OFormElement;
    'o-gallery': OGalleryElement;
    'o-gantt': OGanttElement;
    'o-global-search': OGlobalSearchElement;
    'o-graph': OGraphElement;
    'o-hcaptcha': OHcaptchaElement;
    'o-help': OHelpElement;
    'o-help-panel': OHelpPanelElement;
    'o-install-prompt': OInstallPromptElement;
    'o-kanban': OKanbanElement;
    'o-lang-switch': OLangSwitchElement;
    'o-live-indicator': OLiveIndicatorElement;
    'o-location-picker': OLocationPickerElement;
    'o-map': OMapElement;
    'o-modal': OModalElement;
    'o-network-status': ONetworkStatusElement;
    'o-notification-bell': ONotificationBellElement;
    'o-notifications': ONotificationsElement;
    'o-number': ONumberElement;
    'o-ocr': OOcrElement;
    'o-offline-banner': OOfflineBannerElement;
    'o-orgchart': OOrgchartElement;
    'o-otp': OOtpElement;
    'o-pagination': OPaginationElement;
    'o-phone': OPhoneElement;
    'o-pivot': OPivotElement;
    'o-poll': OPollElement;
    'o-popover': OPopoverElement;
    'o-preferences': OPreferencesElement;
    'o-presence': OPresenceElement;
    'o-presence-list': OPresenceListElement;
    'o-progress-tracker': OProgressTrackerElement;
    'o-qrcode': OQrcodeElement;
    'o-query-builder': OQueryBuilderElement;
    'o-range': ORangeElement;
    'o-rating': ORatingElement;
    'o-recaptcha': ORecaptchaElement;
    'o-recent-list': ORecentListElement;
    'o-recurrence-editor': ORecurrenceEditorElement;
    'o-repeater': ORepeaterElement;
    'o-reviews': OReviewsElement;
    'o-saved-views': OSavedViewsElement;
    'o-scanner': OScannerElement;
    'o-scroll-progress': OScrollProgressElement;
    'o-select': OSelectElement;
    'o-share': OShareElement;
    'o-sidebar-menu': OSidebarMenuElement;
    'o-signature': OSignatureElement;
    'o-sparkline': OSparklineElement;
    'o-split': OSplitElement;
    'o-split-view': OSplitViewElement;
    'o-stat': OStatElement;
    'o-stat-group': OStatGroupElement;
    'o-stepper': OStepperElement;
    'o-stopwatch': OStopwatchElement;
    'o-storage-inspector': OStorageInspectorElement;
    'o-survey': OSurveyElement;
    'o-tab-panel': OTabPanelElement;
    'o-tabs': OTabsElement;
    'o-tags': OTagsElement;
    'o-theme-builder': OThemeBuilderElement;
    'o-theme-switch': OThemeSwitchElement;
    'o-timeline-view': OTimelineViewElement;
    'o-timepicker': OTimepickerElement;
    'o-tree': OTreeElement;
    'o-tts': OTtsElement;
    'o-turnstile': OTurnstileElement;
    'o-undo-controls': OUndoControlsElement;
    'o-upload': OUploadElement;
    'o-video': OVideoElement;
    'o-video-recorder': OVideoRecorderElement;
    'o-virtual-list': OVirtualListElement;
    'o-widget': OWidgetElement;
    'o-wizard': OWizardElement;
    'o-workflow': OWorkflowElement;
    'o-workspace': OWorkspaceElement;
    'o-zoom': OZoomElement;
  }
}

// ── types/zz-globals.d.ts
/* ── public entry & globals ─────────────────────────────────────────────── */

/** The Orion API. Component packages extend it (see the component interfaces above). */
export interface Orion extends OrionCore, OrionComponents {
  [extension: string]: any;
}
/** Component APIs are merged into this interface by the component declaration files. */
export interface OrionComponents {}

declare const Orion: Orion;
export default Orion;
export { Orion };

declare global {
  interface Window {
    Orion: Orion;
    OrionConfig?: OrionConfig;
  }
  /** Component tags are added by types/components/zz-elements.d.ts (generated by build/gen-types.mjs). */
  interface HTMLElementTagNameMap {
    'o-icon': OIconElement;
  }
  interface DocumentEventMap {
    'o-ready': CustomEvent<{ version: string }>;
    'o-theme': CustomEvent<{ mode: ThemeMode; resolved: 'light' | 'dark' }>;
    'o-locale': CustomEvent<{ locale: string }>;
  }
}
