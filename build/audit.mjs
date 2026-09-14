#!/usr/bin/env node
/**
 * Integration audit across component folders.
 *   node build/audit.mjs            report
 *   node build/audit.mjs --strict   exit 1 on collisions
 * Detects: duplicate custom element tags, duplicate Orion.* assignments, duplicate behaviors/actions,
 * CSS classes styled in several folders, hard-coded colors, physical (non-RTL) CSS properties, console.log.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMP = path.join(ROOT, 'src', 'components');
const strict = process.argv.includes('--strict');
const read = f => fs.readFileSync(f, 'utf8');
const folders = fs.readdirSync(COMP, { withFileTypes: true }).filter(d => d.isDirectory() && !/^[._]/.test(d.name)).map(d => d.name).sort();

const maps = { tags: new Map(), api: new Map(), behaviors: new Map(), actions: new Map(), i18n: new Map(), css: new Map() };
const add = (m, k, folder, where) => { if (!m.has(k)) m.set(k, new Map()); const f = m.get(k); if (!f.has(folder)) f.set(folder, where); };
const issues = { colors: [], physical: [], logs: [], accessors: [], safehtml: [] };

// strip comments (JS + CSS) roughly, keep strings
const stripJS = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const stripCSS = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

/* Split a selector list on top-level commas only — a comma inside :is()/:where()/:not()/:has() is part of one selector. */
const splitSelectors = sel => {
  const out = []; let depth = 0, cur = '';
  for (const ch of sel) {
    if (ch === '(') depth++; else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
};

/* An accessor in an Object.assign() source literal is always a bug: Object.assign reads source properties, so a getter
 * runs once at assign time and only its VALUE is copied. On a prototype that throws (wrong `this`) and takes the whole
 * package down; on a handle it silently freezes the value. Scans the raw source, skipping strings and comments. */
const assignAccessors = (src, rel) => {
  const out = [];
  let i = 0;
  while ((i = src.indexOf('Object.assign(', i)) !== -1) {
    let j = i + 14, depth = 0, q = null, litStart = -1;
    for (; j < src.length; j++) {
      const c = src[j], n = src[j + 1];
      if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if (c === '/' && n === '/') { const e = src.indexOf('\n', j); if (e < 0) { j = src.length; break; } j = e; continue; }
      if (c === '/' && n === '*') { const e = src.indexOf('*/', j); if (e < 0) { j = src.length; break; } j = e + 1; continue; }
      if (c === '{') { if (depth === 0) litStart = j; depth++; continue; }
      if (c === '}') { depth--; if (depth === 0 && litStart >= 0) { collectAccessors(src, litStart, j, rel, out); litStart = -1; } continue; }
      if (c === ')' && depth === 0) break;
    }
    i = Math.max(j, i + 1);
  }
  return out;
};
function collectAccessors(src, a, b, rel, out) {
  const base = src.slice(0, a).split('\n').length;
  let level = 0;
  src.slice(a, b + 1).split('\n').forEach((t, k) => {
    const m = /^\s*(get|set)\s+([A-Za-z_$][\w$]*)\s*\(/.exec(t);
    if (m && level === 1) out.push(`${rel}:${base + k}  ${m[1]} ${m[2]}()`);
    for (const ch of t) { if (ch === '{') level++; else if (ch === '}') level--; }
  });
}

for (const folder of folders) {
  const dir = path.join(COMP, folder);
  for (const file of fs.readdirSync(dir)) {
    const p = path.join(dir, file), rel = path.relative(ROOT, p).replace(/\\/g, '/');
    if (file.endsWith('.js')) {
      const src = stripJS(read(p));
      for (const m of src.matchAll(/\bdefine\(\s*['"`](o-[\w-]+)['"`]/g)) add(maps.tags, m[1], folder, rel);
      for (const m of src.matchAll(/(?<![\w.$])O\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) add(maps.api, m[1], folder, rel);
      for (const m of src.matchAll(/\bbehavior\(\s*['"`]([\w-]+)['"`]/g)) add(maps.behaviors, m[1], folder, rel);
      for (const m of src.matchAll(/\baction\(\s*['"`]([\w:-]+)['"`]/g)) add(maps.actions, m[1], folder, rel);
      for (const m of src.matchAll(/i18n\.add\(\s*['"`]en['"`]\s*,\s*\{\s*['"]?([\w-]+)['"]?\s*:/g)) add(maps.i18n, m[1], folder, rel);
      const lines = read(p).split('\n');
      lines.forEach((l, i) => { if (/^\s*console\.log\(/.test(l)) issues.logs.push(`${rel}:${i + 1}`); });
      issues.accessors.push(...assignAccessors(read(p), rel));
      // icon()/html`` return SafeHTML, which the NATIVE DOM insertion methods stringify to "[object Object]" or the
      // literal markup; the core append()/iconEl() helpers are the right tools (ARCHITECTURE.md §5 item 4).
      lines.forEach((l, i) => {
        if (/\.(replaceChildren|append|prepend|before|after|replaceWith)\(([^()]|\([^()]*\))*(\b(icon|raw)\(|\bhtml`)/.test(l) && !/\biconEl\(/.test(l)) issues.safehtml.push(`${rel}:${i + 1}  ${l.trim().slice(0, 110)}`);
      });
    } else if (file.endsWith('.css')) {
      const css = stripCSS(read(p));
      // selectors: text before '{' that isn't an at-rule
      for (const m of css.matchAll(/([^{}@;]+)\{/g)) {
        const sel = m[1].trim();
        if (!sel || /^(from|to|\d+%)/.test(sel)) continue;
        for (const part of splitSelectors(sel)) {
          // Only a selector made of ONE compound (`.o-modal`, `.o-modal.is-open`, `.o-modal:not([open])`) defines a
          // class. Anything with a combinator (`.o-control-sm .o-ac-input`, `.o-kanban .o-btn`) is a package styling
          // its own children under a shared ancestor, which is legitimate and must not count as a second owner.
          const compounds = part.trim().split(/\s*[>+~]\s*|\s+/).filter(Boolean);
          if (compounds.length !== 1) continue;
          const cls = (compounds[0].match(/^\.o-[\w-]+/) || [])[0];
          if (cls) add(maps.css, cls, folder, rel);
        }
      }
      const lines = read(p).split('\n');
      lines.forEach((l, i) => {
        const code = l.replace(/\/\*.*?\*\//g, '');
        // hard-coded colors outside var() fallbacks and data URIs
        const noVar = code.replace(/var\([^()]*(\([^()]*\))?[^()]*\)/g, '').replace(/url\([^)]*\)/g, '');
        if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(noVar) && !/(transparent|currentColor)/.test(noVar) && !/--o-[\w-]+\s*:/.test(code)) issues.colors.push(`${rel}:${i + 1}  ${code.trim().slice(0, 110)}`);
        if (/(^|[\s;{])(margin|padding|border)-(left|right)\s*:|(^|[\s;{])(left|right)\s*:|text-align\s*:\s*(left|right)|float\s*:\s*(left|right)/.test(code) && !/\[dir=/.test(code)) issues.physical.push(`${rel}:${i + 1}  ${code.trim().slice(0, 110)}`);
      });
    }
  }
}

let collisions = 0;
const report = (title, m, filter = () => true) => {
  const dups = [...m].filter(([k, f]) => f.size > 1 && filter(k));
  if (!dups.length) { console.log(`✔ ${title}: no collisions`); return; }
  console.log(`\n✖ ${title}: ${dups.length}`);
  for (const [k, f] of dups) console.log(`  ${k}  ←  ${[...f].map(([fo, w]) => `${fo} (${w})`).join(' | ')}`);
  collisions += dups.length;
};
console.log(`Audited ${folders.length} component folders\n`);
report('Custom element tags', maps.tags);
report('Orion.* API assignments', maps.api);
report('Behaviors (data-o-*)', maps.behaviors);
report('Actions', maps.actions);
report('i18n namespaces', maps.i18n);
const cssDups = [...maps.css].filter(([, f]) => f.size > 1);
console.log(cssDups.length ? `\n⚠ CSS classes styled in several folders: ${cssDups.length}` : '✔ CSS classes: no cross-folder styling');
for (const [k, f] of cssDups.slice(0, 60)) console.log(`  ${k}  ←  ${[...f.keys()].join(', ')}`);
if (issues.colors.length) { console.log(`\n⚠ Hard-coded colors (${issues.colors.length}):`); issues.colors.slice(0, 40).forEach(x => console.log('  ' + x)); }
if (issues.physical.length) { console.log(`\n⚠ Physical (non-logical) CSS properties (${issues.physical.length}):`); issues.physical.slice(0, 40).forEach(x => console.log('  ' + x)); }
if (issues.accessors.length) { console.log(`
✖ Accessors inside Object.assign() literals (${issues.accessors.length}) — the getter runs at assign time and only its value is copied; use Object.defineProperty:`); issues.accessors.forEach(x => console.log('  ' + x)); collisions += issues.accessors.length; }
if (issues.safehtml.length) { console.log(`\n⚠ SafeHTML passed to a native DOM insertion method (${issues.safehtml.length}) — icon()/html\`\`/raw() results are stringified there; use iconEl() or the core append() helper:`); issues.safehtml.slice(0, 40).forEach(x => console.log('  ' + x)); }
if (issues.logs.length) { console.log(`\n⚠ console.log left in code (${issues.logs.length}):`); issues.logs.slice(0, 20).forEach(x => console.log('  ' + x)); }
console.log(`\nTags: ${maps.tags.size} · API: ${maps.api.size} · behaviors: ${maps.behaviors.size} · actions: ${maps.actions.size}`);
if (strict && collisions) process.exit(1);
