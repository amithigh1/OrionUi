/* Pure data/helpers for <o-theme-builder> — no DOM here so they're easy to reason about and reuse. */
const TB_PRESETS = [
  { name: 'Indigo', primary: '#4f46e5', info: '#0e7490' },
  { name: 'Emerald', primary: '#059669', info: '#0e7490' },
  { name: 'Rose', primary: '#e11d48', info: '#be185d' },
  { name: 'Amber', primary: '#d97706', info: '#0e7490' },
  { name: 'Ocean', primary: '#0891b2', info: '#0369a1' },
  { name: 'Slate', primary: '#475569', info: '#334155' },
  { name: 'Violet', primary: '#7c3aed', info: '#6d28d9' },
  { name: 'Corporate', primary: '#1d4ed8', info: '#0369a1', radius: 4, density: 'compact' },
];
const TB_BASE_SURFACES = {
  light: { bg: '#f4f6fa', surface: '#ffffff', surface2: '#f8fafc', surface3: '#eef2f7', elevated: '#ffffff', border: '#e3e8ef', borderStrong: '#cbd5e1' },
  dark: { bg: '#0b1020', surface: '#121a2b', surface2: '#162034', surface3: '#1d2840', elevated: '#18223a', border: '#253149', borderStrong: '#34435f' },
};
const TB_SHADOW_BASE = {
  light: { xs: .05, smA: .08, smB: .04, mdA: .08, mdB: .05, lgA: .12, lgB: .06, xlA: .18, xlB: .08, rgb: '15,23,42' },
  dark: { xs: .3, smA: .4, smB: .3, mdA: .45, mdB: .3, lgA: .55, lgB: .35, xlA: .6, xlB: .4, rgb: '0,0,0' },
};
const TB_DENSITY = {
  compact: { h: '2rem', hSm: '1.625rem', hLg: '2.5rem', px: '.625rem' },
  comfortable: { h: '2.25rem', hSm: '1.875rem', hLg: '2.75rem', px: '.75rem' },
  spacious: { h: '2.625rem', hSm: '2.125rem', hLg: '3.125rem', px: '1rem' },
};
const TB_SEMANTIC = ['primary', 'secondary', 'success', 'danger', 'warning', 'info'];

function tbDefaultDraft() {
  return {
    colors: { primary: '#4f46e5', secondary: '#64748b', success: '#15803d', danger: '#dc2626', warning: '#f59e0b', info: '#0e7490' },
    neutralTint: 0, radius: 8, font: 'Inter, ui-sans-serif, system-ui, sans-serif', fontScale: 1,
    density: 'comfortable', shadowIntensity: 50, sidebarStyle: 'light',
  };
}
/** Mix a hint of `primary` into the base neutral surfaces for one mode ('light'|'dark'). amount: 0-100. */
function tbTintSurfaces(mode, primary, amount) {
  const b = TB_BASE_SURFACES[mode], w = clamp(amount, 0, 100) / 100 * 0.12;
  const mix = hex => (w <= 0 ? hex : color.mix(hex, primary, w));
  return {
    '--o-bg': mix(b.bg), '--o-surface': mix(b.surface), '--o-surface-2': mix(b.surface2), '--o-surface-3': mix(b.surface3),
    '--o-elevated': mix(b.elevated), '--o-border': mix(b.border), '--o-border-strong': mix(b.borderStrong),
  };
}
/** Shadow tokens for one mode scaled by intensity (0-100, 50 = the shipped default). */
function tbShadowTokens(mode, intensity) {
  const s = TB_SHADOW_BASE[mode], mul = 0.3 + (clamp(intensity, 0, 100) / 100) * 1.4, c = s.rgb;
  const rgba = a => `rgba(${c},${round(clamp(a * mul, 0, 1), 3)})`;
  return {
    '--o-shadow-xs': `0 1px 2px ${rgba(s.xs)}`,
    '--o-shadow-sm': `0 1px 3px ${rgba(s.smA)}, 0 1px 2px ${rgba(s.smB)}`,
    '--o-shadow': `0 4px 12px ${rgba(s.mdA)}, 0 1px 3px ${rgba(s.mdB)}`,
    '--o-shadow-lg': `0 12px 32px ${rgba(s.lgA)}, 0 2px 6px ${rgba(s.lgB)}`,
    '--o-shadow-xl': `0 24px 56px ${rgba(s.xlA)}, 0 4px 12px ${rgba(s.xlB)}`,
  };
}
function tbRadiusTokens(base) {
  const r = clamp(+base || 8, 0, 32);
  return { radius: r + 'px', radiusSm: Math.max(0, r - 2) + 'px', '--o-radius-xs': Math.max(0, r - 4) + 'px', radiusLg: (r + 4) + 'px', '--o-radius-xl': (r + 8) + 'px' };
}
function tbDensityTokens(key) {
  const d = TB_DENSITY[key] || TB_DENSITY.comfortable;
  return { '--o-control-h': d.h, '--o-control-h-sm': d.hSm, '--o-control-h-lg': d.hLg, '--o-control-px': d.px };
}
function tbSidebarTokens(style, primary) {
  if (style === 'dark') return { '--o-sidebar-bg': 'var(--o-dark)', '--o-sidebar-text': 'color-mix(in srgb, var(--o-on-dark) 72%, transparent)' };
  if (style === 'branded') return { '--o-sidebar-bg': primary, '--o-sidebar-text': 'color-mix(in srgb, var(--o-on-primary) 78%, transparent)' };
  return { '--o-sidebar-bg': 'var(--o-surface)', '--o-sidebar-text': 'var(--o-text-muted)' };
}
/** WCAG contrast of a color against its readable on-color; suggests a nudged hex when it fails AA (4.5:1). */
function tbContrastInfo(hex) {
  const onColor = color.readable(hex);
  const ratio = color.contrast(hex, onColor);
  const level = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA-large' : 'fail';
  let suggestion = null;
  if (ratio < 4.5) {
    let c = hex;
    for (let i = 0; i < 24 && color.contrast(c, onColor) < 4.5; i++) c = onColor === '#ffffff' ? color.darken(c, 0.04) : color.lighten(c, 0.04);
    suggestion = c;
  }
  return { onColor, ratio: round(ratio, 2), level, suggestion };
}
