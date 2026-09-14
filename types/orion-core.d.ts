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
