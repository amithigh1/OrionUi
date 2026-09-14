#!/usr/bin/env node
/**
 * Generates types/components/zz-elements.d.ts from the component sources:
 * every `define('o-x', Class)` with its `static props` and public methods becomes an interface,
 * and all tags are added to the element tag map (used by HTMLElementTagNameMap).
 *
 *   node build/gen-types.mjs
 *
 * Prop types come from the code, so they stay correct. Method signatures are loose
 * ((...args) => any) — refine them by hand in types/components/*.d.ts, which is concatenated first
 * and therefore wins for anything you declare explicitly there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMP = path.join(ROOT, 'src', 'components');
const read = f => fs.readFileSync(f, 'utf8');
const TS = { String: 'string', Number: 'number', Boolean: 'boolean', Array: 'any[]', Object: 'Record<string, any>', Function: '(...args: any[]) => any', Any: 'any' };
const pascal = tag => tag.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('');

/** Blank out comments and regex literals (keeping newlines, so offsets and line structure survive) before any
 *  quote/brace scanning. Without this a single apostrophe in a doc comment (`isn't`) opened a "string" that swallowed
 *  the rest of the class body, and the element's interface was generated empty with no warning. */
const blank = s => s.replace(/[^\n]/g, ' ');
/** Index just past the closing quote of the '…' / "…" string starting at i. */
function strEnd(src, i) { const q = src[i]; let j = i + 1; while (j < src.length && src[j] !== q && src[j] !== '\n') { if (src[j] === '\\') j++; j++; } return j + 1; }
/** Index just past the closing backtick of the template literal starting at i — nested `${ … }` expressions may
 *  themselves contain strings, braces and further template literals (`a ${b ? `c` : ''} d` is everyday render code). */
function templateEnd(src, i) {
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') { j += 2; continue; }
    if (c === '`') return j + 1;
    if (c === '$' && src[j + 1] === '{') { j = exprEnd(src, j + 2); continue; }
    j++;
  }
  return src.length;
}
function exprEnd(src, i) { // i is just after '${'; returns the index just past the matching '}'
  let depth = 0, j = i;
  while (j < src.length) {
    const c = src[j], n = src[j + 1];
    if (c === "'" || c === '"') { j = strEnd(src, j); continue; }
    if (c === '`') { j = templateEnd(src, j); continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', j + 2); j = e < 0 ? src.length : e + 2; continue; }
    if (c === '/' && n === '/') { while (j < src.length && src[j] !== '\n') j++; continue; }
    if (c === '{') depth++;
    else if (c === '}') { if (depth === 0) return j + 1; depth--; }
    j++;
  }
  return src.length;
}
export function stripComments(src) {
  let out = '', i = 0;
  const regexStart = () => { // a `/` after these tokens begins a regex literal, not a division
    let k = out.length - 1; while (k >= 0 && /\s/.test(out[k])) k--;
    return k < 0 || /[(,=:\[!&|?{};+\-*%<>~^]/.test(out[k]) || /\b(return|typeof|case|in|of|do|else)$/.test(out.slice(Math.max(0, k - 6), k + 1));
  };
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '"' || c === "'") { const e = strEnd(src, i); out += src.slice(i, e); i = e; continue; }          // kept (prop keys / defaults)
    if (c === '`') { const e = templateEnd(src, i); out += blank(src.slice(i, e)); i = e; continue; }           // blanked, nesting-aware
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); const chunk = src.slice(i, e < 0 ? src.length : e + 2); out += blank(chunk); i += chunk.length; continue; }
    if (c === '/' && regexStart()) { // blank the literal, honouring escapes and [...] classes; never swallow the newline
      let j = i + 1, cls = false;
      for (; j < src.length && src[j] !== '\n'; j++) { const d = src[j]; if (d === '\\') { j++; continue; } if (cls) { if (d === ']') cls = false; } else if (d === '[') cls = true; else if (d === '/') break; }
      const e = src[j] === '/' ? j + 1 : j;
      out += ' '.repeat(e - i); i = e; continue;
    }
    out += c; i++;
  }
  return out;
}
/** Extract the balanced {...} block that starts at index i (i points at '{'). */
export function block(src, i) {
  let depth = 0, inStr = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (inStr) { if (c === '\\') { j++; continue; } if (c === inStr) inStr = null; continue; }   // skip the escaped char, so '\\' closes correctly
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(i, j + 1);
  }
  return '';
}
/** Parse `static props = { a: String, b: { type: Number, default: 1 } }` into [{ name, ts }]. */
export function parseProps(body) {
  const m = body.match(/static\s+props\s*=\s*\{/);
  if (!m) return [];
  const obj = block(body, m.index + m[0].length - 1);
  const out = [];
  // top-level "name: value" pairs
  let depth = 0, key = '', val = '', inKey = true, inStr = null;
  for (let i = 1; i < obj.length - 1; i++) {
    const c = obj[i];
    if (inStr) { val += c; if (c === '\\') { val += obj[++i] ?? ''; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; val += c; continue; }
    if (c === '{' || c === '[' || c === '(') depth++;
    if (c === '}' || c === ']' || c === ')') depth--;
    if (inKey) {
      if (c === ':' && depth === 0) { inKey = false; continue; }
      if (c === ',' && depth === 0) { key = ''; continue; }
      key += c;
    } else if (c === ',' && depth === 0) {
      push(key, val); key = ''; val = ''; inKey = true;
    } else val += c;
  }
  if (key.trim()) push(key, val);
  function push(k, v) {
    const name = k.trim().replace(/['"]/g, '').replace(/^\.\.\..*/, '');
    if (!name || !/^[A-Za-z_$][\w$]*$/.test(name)) return;
    const t = (v.match(/type\s*:\s*(\w+)/) || v.match(/^\s*(\w+)\s*$/) || [])[1];
    const ts = TS[t] || (String(v).includes("'any'") ? 'any' : 'any');
    out.push({ name, ts });
  }
  return out;
}
/** Public method names declared in a class body (excluding lifecycle + private). */
export function parseMethods(body) {
  const skip = new Set(['constructor', 'setup', 'connected', 'disconnected', 'update', 'render', 'connectedCallback', 'disconnectedCallback', 'attributeChangedCallback', 'formResetCallback', 'formDisabledCallback', 'formStateRestoreCallback', 'getValidity', 'formValue', 'isEmpty', 'get', 'set', 'static']);
  const out = new Set();
  for (const m of body.matchAll(/^\s{2}(?:async\s+)?([a-zA-Z][\w$]*)\s*\(/gm)) if (!skip.has(m[1])) out.add(m[1]);
  return [...out];
}

// The scanners above are exported for tests/gen-types.test.mjs; the generator itself only runs when invoked directly.
const isMain = !!process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
const tags = [];
for (const folder of fs.readdirSync(COMP).filter(d => !/^[._]/.test(d) && fs.statSync(path.join(COMP, d)).isDirectory()).sort()) {
  const files = fs.readdirSync(path.join(COMP, folder)).filter(f => f.endsWith('.js')).map(f => read(path.join(COMP, folder, f)));
  const all = stripComments(files.join('\n'));   // a component's class and its define() call are often in different files
  for (const m of all.matchAll(/\bdefine\(\s*['"`](o-[\w-]+)['"`]\s*,\s*([A-Za-z_$][\w$]*)/g)) {
    const [, tag, cls] = m;
    let ci = all.search(new RegExp(`class\\s+${cls}\\s+extends\\s+([\\w.]+)\\s*\\{`));
    if (ci < 0) {
      // factory pattern: define('o-x', makeX('x')) where `function makeX() { … return class extends Base { … } }`
      const fi = all.search(new RegExp(`function\\s+${cls}\\s*\\(`));
      const ri = fi < 0 ? -1 : all.indexOf('return class extends', fi);
      if (ri >= 0) ci = ri + 'return '.length;
    }
    if (ci < 0) { console.warn(`⚠ ${folder}: class ${cls} for <${tag}> not found — interface will be empty`); tags.push({ tag, folder, base: 'OElement', props: [], methods: [] }); continue; }
    const base = (all.slice(ci).match(/extends\s+([\w.]+)/) || [])[1];
    const body = block(all, all.indexOf('{', ci));
    if (!body) console.warn(`⚠ ${folder}: could not read the body of class ${cls} (<${tag}>) — unbalanced braces or an unterminated string?`);
    tags.push({ tag, folder, base: /FormElement/.test(base) ? 'FormElement<any>' : 'OElement', props: parseProps(body), methods: parseMethods(body) });
  }
}
// a tag may be defined in more than one file (e.g. a base + a variant): merge props/methods, keep one entry
const merged = new Map();
for (const t of tags) {
  const prev = merged.get(t.tag);
  if (!prev) { merged.set(t.tag, t); continue; }
  const names = new Set(prev.props.map(p => p.name));
  t.props.forEach(p => { if (!names.has(p.name)) prev.props.push(p); });
  prev.methods = [...new Set([...prev.methods, ...t.methods])];
  if (t.base.startsWith('FormElement')) prev.base = t.base;
}
tags.length = 0;
tags.push(...merged.values());
tags.sort((a, b) => a.tag.localeCompare(b.tag));

let out = `/* Generated by build/gen-types.mjs — do not edit by hand.
 * ${tags.length} custom elements. Prop types come from each component's \`static props\`;
 * method signatures are loose — refine them in types/components/*.d.ts (those are declared first and win).
 */\n\n`;
for (const t of tags) {
  const name = pascal(t.tag) + 'Element';
  out += `/** \`<${t.tag}>\` — see src/components/${t.folder}/README.md */\nexport interface ${name} extends ${t.base} {\n`;
  // Props that collide with a base-class method are a component bug (define() logs it at runtime);
  // skip them here so the shipped declarations stay valid.
  const BASE_METHODS = new Set(['flush', 'requestUpdate', 'listen', 'addCleanup', 'emit', 't', 'getProps', 'setup', 'connected', 'disconnected', 'update', 'render', 'setValue', 'checkValidity', 'reportValidity', 'setCustomValidity', 'isEmpty', 'getValidity', 'formValue']);
  t.props = t.props.filter(p => { if (BASE_METHODS.has(p.name)) { out += `  // NOTE: prop "${p.name}" shadows a base-class method — see ARCHITECTURE.md §5\n`; return false; } return true; });
  const propNames = new Set(t.props.map(p => p.name));
  for (const p of t.props) out += `  ${p.name}: ${p.ts};\n`;
  for (const m of t.methods) if (!propNames.has(m)) out += `  ${m}(...args: any[]): any;\n`;
  out += '}\n\n';
}
out += 'export interface OrionElementTagMap {\n';
for (const t of tags) out += `  '${t.tag}': ${pascal(t.tag)}Element;\n`;
out += '}\n\ndeclare global {\n  interface HTMLElementTagNameMap {\n';
for (const t of tags) out += `    '${t.tag}': ${pascal(t.tag)}Element;\n`;
out += '  }\n}\n';

const dir = path.join(ROOT, 'types', 'components');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'zz-elements.d.ts'), out);
console.log(`Generated types for ${tags.length} elements -> types/components/zz-elements.d.ts`);
console.log(tags.map(t => t.tag).join(', '));
}
