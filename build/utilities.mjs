/**
 * Generated CSS: responsive grid, color variants and utility classes.
 * Everything here is data-driven so the class vocabulary stays consistent.
 */
export const BREAKPOINTS = { sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1400 };
export const COLORS = ['primary', 'secondary', 'success', 'danger', 'warning', 'info', 'light', 'dark'];
const SPACE = { 0: '0', 1: '.25rem', 2: '.5rem', 3: '.75rem', 4: '1rem', 5: '1.25rem', 6: '1.5rem', 8: '2rem', 10: '2.5rem', 12: '3rem', 16: '4rem' };
const GUTTER = { 0: '0', 1: '.25rem', 2: '.5rem', 3: '1rem', 4: '1.5rem', 5: '3rem' };

const media = (bp, css) => (bp ? `@media (min-width:${BREAKPOINTS[bp]}px){${css}}` : css);
const esc = s => String(s).replace(/\./g, '\\.').replace(/\//g, '\\/').replace(/:/g, '\\:');

/**
 * rules(prefix, values, decl, opts) -> CSS
 *   prefix: class prefix after "o-" (e.g. "d" => .o-d-flex)
 *   values: { suffix: value }
 *   decl:   (value) => "prop:value" string
 *   opts.responsive: also emit .o-{prefix}-{bp}-{suffix}
 *   opts.important:  append !important (default true for utilities)
 */
function rules(prefix, values, decl, { responsive = false, important = true, bps = Object.keys(BREAKPOINTS) } = {}) {
  const imp = important ? ' !important' : '';
  const body = (bp) => Object.entries(values).map(([suf, val]) => {
    const name = 'o-' + [prefix, bp, suf].filter(x => x !== '' && x != null).join('-');
    const d = decl(val, suf).split(';').filter(Boolean).map(x => x + imp).join(';');
    return `.${esc(name)}{${d}}`;
  }).join('');
  let out = body(null);
  if (responsive) for (const bp of bps) out += media(bp, body(bp));
  return out;
}

/* ─────────────────────────── grid + variants (component layer) ─────────────────────────── */
export function variantsCSS() {
  let css = '';
  // Flex grid (12 columns)
  const cols = (bp) => {
    const i = bp ? '-' + bp : '';
    let s = `.o-col${i}{flex:1 0 0%}.o-col${i}-auto{flex:0 0 auto;width:auto}`;
    for (let n = 1; n <= 12; n++) s += `.o-col${i}-${n}{flex:0 0 auto;width:${+(n / 12 * 100).toFixed(6)}%}`;
    for (let n = 0; n < 12; n++) s += `.o-offset${i}-${n}{margin-inline-start:${n ? +(n / 12 * 100).toFixed(6) + '%' : '0'}}`;
    for (let n = 1; n <= 6; n++) s += `.o-row-cols${i}-${n}>*{flex:0 0 auto;width:${+(100 / n).toFixed(6)}%}`;
    s += `.o-row-cols${i}-auto>*{flex:0 0 auto;width:auto}`;
    for (const [k, v] of Object.entries(GUTTER)) s += `.o-g${i}-${k},.o-gx${i}-${k}{--o-gx:${v}}.o-g${i}-${k},.o-gy${i}-${k}{--o-gy:${v}}`;
    return s;
  };
  css += cols(null);
  for (const bp of Object.keys(BREAKPOINTS)) css += media(bp, cols(bp));

  // CSS grid helpers
  const grid = (bp) => {
    const i = bp ? '-' + bp : '';
    let s = '';
    for (let n = 1; n <= 12; n++) s += `.o-grid-cols${i}-${n}{--o-cols:${n}}`;
    for (let n = 1; n <= 12; n++) s += `.o-span${i}-${n}{grid-column:span ${n}/span ${n}}`;
    s += `.o-span${i}-full{grid-column:1/-1}`;
    for (let n = 1; n <= 6; n++) s += `.o-row-span${i}-${n}{grid-row:span ${n}/span ${n}}`;
    return s;
  };
  css += grid(null);
  for (const bp of Object.keys(BREAKPOINTS)) css += media(bp, grid(bp));

  for (const c of COLORS) {
    const v = `var(--o-${c})`, on = `var(--o-on-${c})`, sub = `var(--o-${c}-subtle)`, txt = `var(--o-${c}-text)`, bd = `var(--o-${c}-border)`, hov = `var(--o-${c}-hover)`;
    // universal color context used by many components: var(--o-c)
    css += `.o-c-${c}{--o-c:${v};--o-on-c:${on};--o-c-subtle:${sub};--o-c-text:${txt};--o-c-border:${bd};--o-c-hover:${hov}}`;
    // buttons
    css += `.o-btn-${c}{--o-btn-bg:${v};--o-btn-fg:${on};--o-btn-border:${v};--o-btn-hover-bg:${hov};--o-btn-hover-border:${hov};--o-btn-hover-fg:${on};--o-focus:${v}}`;
    css += `.o-btn-outline-${c}{--o-btn-bg:transparent;--o-btn-fg:${txt};--o-btn-border:${bd};--o-btn-hover-bg:${v};--o-btn-hover-border:${v};--o-btn-hover-fg:${on};--o-focus:${v};box-shadow:none}`;
    css += `.o-btn-soft-${c}{--o-btn-bg:${sub};--o-btn-fg:${txt};--o-btn-border:transparent;--o-btn-hover-bg:color-mix(in srgb,${v} 20%,var(--o-surface));--o-btn-hover-border:transparent;--o-btn-hover-fg:${txt};--o-focus:${v};box-shadow:none}`;
    // badges
    css += `.o-badge-${c}{background:${v};color:${on}}`;
    css += `.o-badge-soft-${c}{background:${sub};color:${txt}}`;
    css += `.o-badge-outline-${c}{background:transparent;color:${txt};border-color:${bd}}`;
    // alerts
    css += `.o-alert-${c}{--o-alert-color:${v};--o-alert-text:${txt};--o-alert-bg:${sub};--o-alert-border:${bd}}`;
    // list-group contextual items
    css += `.o-list-item-${c}{background:${sub};color:${txt}}`;
  }
  return css;
}

/* ─────────────────────────── utilities ─────────────────────────── */
export function utilitiesCSS() {
  let css = '';
  const R = { responsive: true };

  // display
  const display = { none: 'none', inline: 'inline', 'inline-block': 'inline-block', block: 'block', flex: 'flex', 'inline-flex': 'inline-flex', grid: 'grid', 'inline-grid': 'inline-grid', contents: 'contents', table: 'table', 'table-cell': 'table-cell', 'table-row': 'table-row' };
  css += rules('d', display, v => `display:${v}`, R);

  // flex
  css += rules('flex', {
    row: 'flex-direction:row', 'row-reverse': 'flex-direction:row-reverse', column: 'flex-direction:column', 'column-reverse': 'flex-direction:column-reverse',
    wrap: 'flex-wrap:wrap', nowrap: 'flex-wrap:nowrap', 'wrap-reverse': 'flex-wrap:wrap-reverse',
    1: 'flex:1 1 0%', auto: 'flex:1 1 auto', initial: 'flex:0 1 auto', none: 'flex:none',
    'grow-0': 'flex-grow:0', 'grow-1': 'flex-grow:1', 'shrink-0': 'flex-shrink:0', 'shrink-1': 'flex-shrink:1',
  }, v => v, R);
  css += rules('justify', { start: 'flex-start', end: 'flex-end', center: 'center', between: 'space-between', around: 'space-around', evenly: 'space-evenly', stretch: 'stretch' }, v => `justify-content:${v}`, R);
  css += rules('items', { start: 'flex-start', end: 'flex-end', center: 'center', baseline: 'baseline', stretch: 'stretch' }, v => `align-items:${v}`, R);
  css += rules('self', { auto: 'auto', start: 'flex-start', end: 'flex-end', center: 'center', baseline: 'baseline', stretch: 'stretch' }, v => `align-self:${v}`, R);
  css += rules('content', { start: 'flex-start', end: 'flex-end', center: 'center', between: 'space-between', around: 'space-around', stretch: 'stretch' }, v => `align-content:${v}`, R);
  css += rules('place', { center: 'center', start: 'start', end: 'end', stretch: 'stretch' }, v => `place-items:${v};place-content:${v}`);
  css += rules('order', { first: '-1', last: '99', 0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5' }, v => `order:${v}`, R);
  css += rules('gap', SPACE, v => `gap:${v}`, R);
  css += rules('gap-x', SPACE, v => `column-gap:${v}`, R);
  css += rules('gap-y', SPACE, v => `row-gap:${v}`, R);

  // spacing (logical: s = inline-start, e = inline-end, x = inline, y = block)
  const sides = {
    m: ['margin'], mt: ['margin-top'], mb: ['margin-bottom'], ms: ['margin-inline-start'], me: ['margin-inline-end'], mx: ['margin-inline-start', 'margin-inline-end'], my: ['margin-top', 'margin-bottom'],
    p: ['padding'], pt: ['padding-top'], pb: ['padding-bottom'], ps: ['padding-inline-start'], pe: ['padding-inline-end'], px: ['padding-inline-start', 'padding-inline-end'], py: ['padding-top', 'padding-bottom'],
  };
  for (const [k, props] of Object.entries(sides)) {
    const vals = k.startsWith('m') ? { ...SPACE, auto: 'auto' } : SPACE;
    css += rules(k, vals, v => props.map(p => `${p}:${v}`).join(';'), R);
  }
  // negative margins (small set)
  css += rules('mt-n', { 1: '-.25rem', 2: '-.5rem', 3: '-.75rem', 4: '-1rem' }, v => `margin-top:${v}`);
  css += rules('ms-n', { 1: '-.25rem', 2: '-.5rem', 3: '-.75rem', 4: '-1rem' }, v => `margin-inline-start:${v}`);

  // sizing
  const pct = { 25: '25%', 50: '50%', 75: '75%', 100: '100%', auto: 'auto' };
  css += rules('w', { ...pct, fit: 'fit-content', min: 'min-content', max: 'max-content', screen: '100vw' }, v => `width:${v}`, R);
  css += rules('h', { ...pct, fit: 'fit-content', screen: '100vh' }, v => `height:${v}`);
  css += rules('mw', { 100: '100%', none: 'none', xs: '20rem', sm: '24rem', md: '28rem', lg: '32rem', xl: '36rem', '2xl': '42rem', '3xl': '48rem', '4xl': '56rem', '5xl': '64rem', prose: '65ch' }, v => `max-width:${v}`);
  css += rules('mh', { 100: '100%', none: 'none', '50vh': '50vh', '75vh': '75vh' }, v => `max-height:${v}`);
  css += rules('min-w', { 0: '0', 100: '100%' }, v => `min-width:${v}`);
  css += rules('min-h', { 0: '0', 100: '100%' }, v => `min-height:${v}`);
  css += rules('vw', { 100: '100vw' }, v => `width:${v}`);
  css += rules('vh', { 100: '100vh' }, v => `height:${v}`);
  css += rules('min-vh', { 100: '100vh' }, v => `min-height:${v}`);
  css += rules('size', { 4: '1rem', 5: '1.25rem', 6: '1.5rem', 8: '2rem', 10: '2.5rem', 12: '3rem', 16: '4rem' }, v => `width:${v};height:${v}`);

  // typography
  css += rules('text', { start: 'start', center: 'center', end: 'end', justify: 'justify' }, v => `text-align:${v}`, R);
  css += rules('text', { xs: 'var(--o-fs-xs)', sm: 'var(--o-fs-sm)', base: 'var(--o-fs-base)', md: 'var(--o-fs-md)', lg: 'var(--o-fs-lg)', xl: 'var(--o-fs-xl)', '2xl': 'var(--o-fs-2xl)', '3xl': 'var(--o-fs-3xl)', '4xl': 'var(--o-fs-4xl)' }, v => `font-size:${v}`);
  css += rules('fw', { light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 }, v => `font-weight:${v}`);
  css += rules('fst', { italic: 'italic', normal: 'normal' }, v => `font-style:${v}`);
  css += rules('text', { lowercase: 'lowercase', uppercase: 'uppercase', capitalize: 'capitalize' }, v => `text-transform:${v}`);
  css += rules('text', { wrap: 'normal', nowrap: 'nowrap' }, v => `white-space:${v}`);
  css += rules('text', { break: 'anywhere' }, v => `overflow-wrap:${v};word-break:break-word`);
  css += rules('text', { truncate: '' }, () => 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap');
  css += rules('text-decoration', { none: 'none', underline: 'underline', 'line-through': 'line-through' }, v => `text-decoration:${v}`);
  css += rules('lh', { 1: '1', sm: '1.25', base: '1.5', lg: '1.75' }, v => `line-height:${v}`);
  css += rules('font', { mono: 'var(--o-font-mono)', sans: 'var(--o-font-sans)' }, v => `font-family:${v}`);
  css += rules('tabular', { nums: '' }, () => 'font-variant-numeric:tabular-nums');
  css += rules('line-clamp', { 1: 1, 2: 2, 3: 3, 4: 4 }, v => `display:-webkit-box;-webkit-line-clamp:${v};-webkit-box-orient:vertical;overflow:hidden`);
  css += rules('ls', { tight: '-.02em', normal: '0', wide: '.05em' }, v => `letter-spacing:${v}`);

  // colors
  const txt = { body: 'var(--o-text)', muted: 'var(--o-text-muted)', subtle: 'var(--o-text-subtle)', white: '#fff', black: '#000', inherit: 'inherit', reset: 'inherit' };
  COLORS.forEach(c => { txt[c] = `var(--o-${c}-text)`; });
  css += rules('text', txt, v => `color:${v}`);
  const bg = { body: 'var(--o-bg)', surface: 'var(--o-surface)', 'surface-2': 'var(--o-surface-2)', 'surface-3': 'var(--o-surface-3)', elevated: 'var(--o-elevated)', transparent: 'transparent', white: '#fff', black: '#000' };
  COLORS.forEach(c => { bg[c] = `var(--o-${c})`; bg[c + '-subtle'] = `var(--o-${c}-subtle)`; });
  css += rules('bg', bg, v => `background-color:${v}`);
  css += rules('text-bg', Object.fromEntries(COLORS.map(c => [c, c])), c => `background-color:var(--o-${c});color:var(--o-on-${c})`);
  css += rules('bg-gradient', { '': '' }, () => 'background-image:linear-gradient(135deg,var(--o-primary),color-mix(in srgb,var(--o-primary) 55%,var(--o-info)))');
  css += rules('link', Object.fromEntries(COLORS.map(c => [c, c])), c => `color:var(--o-${c}-text)`);

  // borders
  css += rules('border', { '': '1px solid var(--o-border)', 0: '0' }, v => `border:${v}`);
  css += rules('border-top', { '': '1px solid var(--o-border)', 0: '0' }, v => `border-top:${v}`);
  css += rules('border-bottom', { '': '1px solid var(--o-border)', 0: '0' }, v => `border-bottom:${v}`);
  css += rules('border-start', { '': '1px solid var(--o-border)', 0: '0' }, v => `border-inline-start:${v}`);
  css += rules('border-end', { '': '1px solid var(--o-border)', 0: '0' }, v => `border-inline-end:${v}`);
  css += rules('border', { 1: '1px', 2: '2px', 3: '3px', 4: '4px' }, v => `border-width:${v}`);
  css += rules('border', { dashed: 'dashed', dotted: 'dotted', solid: 'solid' }, v => `border-style:${v}`);
  const bc = { strong: 'var(--o-border-strong)', transparent: 'transparent', white: '#fff' };
  COLORS.forEach(c => { bc[c] = `var(--o-${c})`; });
  css += rules('border', bc, v => `border-color:${v}`);
  css += rules('rounded', { '': 'var(--o-radius)', 0: '0', xs: 'var(--o-radius-xs)', sm: 'var(--o-radius-sm)', lg: 'var(--o-radius-lg)', xl: 'var(--o-radius-xl)', pill: 'var(--o-radius-pill)', circle: '50%' }, v => `border-radius:${v}`);
  css += rules('rounded-top', { '': 'var(--o-radius)' }, v => `border-start-start-radius:${v};border-start-end-radius:${v}`);
  css += rules('rounded-bottom', { '': 'var(--o-radius)' }, v => `border-end-start-radius:${v};border-end-end-radius:${v}`);

  // effects
  css += rules('shadow', { '': 'var(--o-shadow)', none: 'none', xs: 'var(--o-shadow-xs)', sm: 'var(--o-shadow-sm)', lg: 'var(--o-shadow-lg)', xl: 'var(--o-shadow-xl)' }, v => `box-shadow:${v}`);
  css += rules('opacity', { 0: 0, 25: '.25', 50: '.5', 75: '.75', 100: 1 }, v => `opacity:${v}`);
  css += rules('blur', { '': '' }, () => 'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)');

  // position
  css += rules('', { static: 'static', relative: 'relative', absolute: 'absolute', fixed: 'fixed', sticky: 'sticky' }, v => `position:${v}`);
  css += rules('position', { static: 'static', relative: 'relative', absolute: 'absolute', fixed: 'fixed', sticky: 'sticky' }, v => `position:${v}`, R);
  css += rules('inset', { 0: '0' }, v => `inset:${v}`);
  css += rules('top', { 0: '0', 50: '50%', 100: '100%' }, v => `top:${v}`);
  css += rules('bottom', { 0: '0', 50: '50%', 100: '100%' }, v => `bottom:${v}`);
  css += rules('start', { 0: '0', 50: '50%', 100: '100%' }, v => `inset-inline-start:${v}`);
  css += rules('end', { 0: '0', 50: '50%', 100: '100%' }, v => `inset-inline-end:${v}`);
  css += rules('translate', { middle: 'translate(-50%,-50%)', 'middle-x': 'translateX(-50%)', 'middle-y': 'translateY(-50%)' }, v => `transform:${v}`);
  css += rules('sticky', { top: '' }, () => 'position:sticky;top:0;z-index:1020');
  css += rules('fixed', { top: 'top', bottom: 'bottom' }, v => `position:fixed;${v}:0;inset-inline:0;z-index:1030`);
  css += rules('z', { 0: 0, 1: 1, 2: 2, 3: 3, 10: 10, 100: 100, auto: 'auto' }, v => `z-index:${v}`);
  css += rules('overflow', { auto: 'auto', hidden: 'hidden', visible: 'visible', scroll: 'scroll', clip: 'clip' }, v => `overflow:${v}`);
  css += rules('overflow-x', { auto: 'auto', hidden: 'hidden', scroll: 'scroll' }, v => `overflow-x:${v}`);
  css += rules('overflow-y', { auto: 'auto', hidden: 'hidden', scroll: 'scroll' }, v => `overflow-y:${v}`);
  css += rules('float', { start: 'inline-start', end: 'inline-end', none: 'none' }, v => `float:${v}`);
  css += rules('align', { baseline: 'baseline', top: 'top', middle: 'middle', bottom: 'bottom', 'text-top': 'text-top', 'text-bottom': 'text-bottom' }, v => `vertical-align:${v}`);

  // interaction
  css += rules('cursor', { pointer: 'pointer', default: 'default', move: 'move', grab: 'grab', text: 'text', 'not-allowed': 'not-allowed', help: 'help' }, v => `cursor:${v}`);
  css += rules('select', { none: 'none', all: 'all', auto: 'auto', text: 'text' }, v => `user-select:${v};-webkit-user-select:${v}`);
  css += rules('pe', { none: 'none', auto: 'auto' }, v => `pointer-events:${v}`);
  css += rules('', { visible: 'visible', invisible: 'hidden' }, v => `visibility:${v}`);
  css += rules('object', { contain: 'contain', cover: 'cover', fill: 'fill', none: 'none' }, v => `object-fit:${v}`);
  css += rules('aspect', { '1x1': '1/1', '4x3': '4/3', '3x2': '3/2', '16x9': '16/9', '21x9': '21/9' }, v => `aspect-ratio:${v}`);
  css += rules('transition', { '': 'all var(--o-dur) var(--o-ease)', none: 'none' }, v => `transition:${v}`);

  // print
  css += `@media print{${rules('d-print', display, v => `display:${v}`)}.o-print-hide,.o-no-print{display:none !important}}`;
  css += `.o-print-only{display:none !important}@media print{.o-print-only{display:revert !important}}`;
  // screen-reader
  css += `.o-sr-only,.o-sr-only-focusable:not(:focus):not(:focus-within){position:absolute !important;width:1px !important;height:1px !important;padding:0 !important;margin:-1px !important;overflow:hidden !important;clip:rect(0,0,0,0) !important;white-space:nowrap !important;border:0 !important}`;
  return css;
}
