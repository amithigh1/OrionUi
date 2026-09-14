#!/usr/bin/env node
/**
 * Orion Admin build: a zero-dependency bundler that produces SINGLE-FILE builds.
 *
 *   node build/build.mjs                          full build -> dist/
 *   node build/build.mjs --only=select,datatable  custom build (core is always included)
 *   node build/build.mjs --exclude=map,editor     everything except these components
 *   node build/build.mjs --locales=ms,ar          embed only these locale packs (default: all; `none` = English only)
 *                                                 a full dist build also emits every pack standalone as dist/locales/<xx>.js
 *   node build/build.mjs --out=.tmp/mybuild       output directory (default: dist)
 *   node build/build.mjs --no-min                 skip minification (faster)
 *   node build/build.mjs --watch                  rebuild on change
 *
 * Output:
 *   orion.js          UMD (window.Orion / CommonJS / AMD), CSS embedded and auto-injected
 *   orion.min.js      minified UMD (needs the optional esbuild devDependency)
 *   orion.esm.js      ES module (export default Orion)
 *   orion.esm.min.js  minified ES module
 *   orion.css         the same CSS as a standalone stylesheet (optional; the JS already injects it)
 *   orion.min.css
 *   orion.d.ts        TypeScript declarations (copied from types/)
 *
 * Source layout (see ARCHITECTURE.md):
 *   src/core/*.js           shared scope, concatenated in file-name order
 *   src/sw/*.js             runs only when the bundle is loaded as a Service Worker
 *   src/components/<name>/  every *.js (isolated scope) and *.css file in the folder
 *   src/i18n/*.js           locale packs
 *   src/css/NN-*.css        foundation CSS; NN < 90 before components, NN >= 90 after utilities
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { variantsCSS, utilitiesCSS } from './utilities.mjs';
import { buildDocsNav } from './docs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const list = v => (typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : null);
const OUT = path.resolve(ROOT, typeof args.out === 'string' ? args.out : 'dist');
const PRESETS = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'presets.json'), 'utf8'));
if (typeof args.preset === 'string' && args.preset !== 'full' && !PRESETS[args.preset]) {
  console.error(`Unknown preset "${args.preset}". Available: full, ${Object.keys(PRESETS).filter(k => k[0] !== '_').join(', ')}`);
  process.exit(2);
}
const PRESET = typeof args.preset === 'string' && args.preset !== 'full' ? PRESETS[args.preset] : null;
const ONLY = list(args.only) || PRESET;
const EXCLUDE = list(args.exclude) || [];
// --locales=all (default) | none | ms,ar,… — which src/i18n packs to embed. The lite bundle is always English-only;
// every pack is also emitted standalone as dist/locales/<xx>.js on a full dist build.
const LOCALE_FILES = fs.existsSync(path.join(SRC, 'i18n')) ? fs.readdirSync(path.join(SRC, 'i18n')).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)).sort() : [];
const localeArg = typeof args.locales === 'string' ? args.locales : 'all';
const LOCALES = localeArg === 'all' ? null : localeArg === 'none' ? [] : list(localeArg);
if (LOCALES) {
  const unknown = LOCALES.filter(l => !LOCALE_FILES.includes(l));
  if (unknown.length) { console.error(`✖ Unknown locale${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}\n  Packs in src/i18n/: ${LOCALE_FILES.join(', ')}`); process.exit(1); }
}
const QUIET = !!args.quiet;

const read = f => fs.readFileSync(f, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
const filesIn = (dir, ext) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith(ext)).sort().map(f => path.join(dir, f)) : []);
const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');
const log = (...a) => { if (!QUIET) console.log(...a); };
const kb = n => (n / 1024).toFixed(1) + ' KB';

/* ───────────────────────── components ───────────────────────── */
function discoverComponents() {
  const dir = path.join(SRC, 'components');
  if (!fs.existsSync(dir)) return [];
  const all = fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !/^[_.]/.test(d.name))
    .map(d => {
      const p = path.join(dir, d.name);
      const js = filesIn(p, '.js');
      const css = filesIn(p, '.css');
      // Optional dependency declaration in the first JS file: "// @deps select, datepicker"
      const head = js.length ? read(js[0]).slice(0, 600) : '';
      const m = head.match(/@deps\s+([^\n*]+)/);
      const deps = m ? m[1].split(/[\s,]+/).filter(Boolean) : [];
      return { name: d.name, dir: p, js, css, deps };
    });
  const byName = new Map(all.map(c => [c.name, c]));
  // A typo in --only/--exclude (or a stale preset entry) must not silently build the wrong file.
  const unknown = [...(ONLY || []), ...EXCLUDE].filter(n => !byName.has(n));
  if (unknown.length) {
    console.error(`✖ Unknown component${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}\n  Folder names in src/components/: ${all.map(c => c.name).join(', ')}`);
    process.exit(1);
  }
  let chosen = all.filter(c => (!ONLY || ONLY.includes(c.name)) && !EXCLUDE.includes(c.name));
  // pull in declared dependencies of chosen components
  const need = new Set(chosen.map(c => c.name));
  const addDeps = c => c.deps.forEach(d => { if (byName.has(d) && !need.has(d)) { need.add(d); addDeps(byName.get(d)); } });
  chosen.forEach(addDeps);
  chosen = all.filter(c => need.has(c.name));
  // topological order (alphabetical otherwise)
  const out = [], seen = new Set();
  const visit = (c, stack = []) => {
    if (seen.has(c.name)) return;
    if (stack.includes(c.name)) throw new Error('Circular @deps: ' + [...stack, c.name].join(' -> '));
    c.deps.forEach(d => byName.has(d) && need.has(d) && visit(byName.get(d), [...stack, c.name]));
    seen.add(c.name); out.push(c);
  };
  chosen.sort((a, b) => a.name.localeCompare(b.name)).forEach(c => visit(c));
  return out;
}

/* ───────────────────────── CSS ───────────────────────── */
export function minifyCSS(css) {
  let out = '', i = 0;
  const n = css.length, keep = '{};,>';
  while (i < n) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { const j = css.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && css[j] !== c) { if (css[j] === '\\') j++; j++; }
      out += css.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === ' ' || c === '\n' || c === '\t' || c === '\r') {
      while (i < n && /\s/.test(css[i])) i++;
      const prev = out[out.length - 1], next = css[i];
      if (prev && next && !keep.includes(prev) && !keep.includes(next)) out += ' ';
      continue;
    }
    out += c; i++;
  }
  return out.replace(/;}/g, '}').trim();
}

function buildCSS(comps) {
  const base = filesIn(path.join(SRC, 'css'), '.css');
  const num = f => parseInt(path.basename(f), 10) || 0;
  let reboot = '';
  const before = [], after = [];
  for (const f of base) {
    const css = `/* ${rel(f)} */\n${read(f)}`;
    if (/reboot/.test(path.basename(f))) reboot += css + '\n';
    else (num(f) >= 90 ? after : before).push(css);
  }
  const compCSS = comps.flatMap(c => c.css.map(f => `/* ${rel(f)} */\n${read(f)}`));
  const main = [...before, '/* generated: variants */\n' + variantsCSS(), ...compCSS, '/* generated: utilities */\n' + utilitiesCSS(), ...after].join('\n\n');
  return { reboot, main };
}

/* ───────────────────────── JS ───────────────────────── */
function buildJS(comps, cssMin, rebootMin, version, locales = LOCALES) {
  const banner = `/*! Orion Admin v${version} | MIT License | https://github.com/ | Single-file, zero-dependency admin UI library */`;
  const segments = []; // [{file, start, lines}] bundle line index (for error mapping)
  let body = '', lineNo = 1;
  const push = (text, file) => {
    const lines = text.split('\n').length;
    if (file) segments.push({ file, start: lineNo, lines });
    body += text + '\n';
    lineNo += lines;
  };
  push(`'use strict';`);
  push(`const __CSS__ = ${JSON.stringify(cssMin)};`);
  push(`const __CSS_REBOOT__ = ${JSON.stringify(rebootMin)};`);
  for (const f of filesIn(path.join(SRC, 'core'), '.js')) {
    push(`// ── ${rel(f)}`);
    push(read(f).replace(/__VERSION__/g, version), rel(f));
  }
  push('if (isSW) {');
  for (const f of filesIn(path.join(SRC, 'sw'), '.js')) { push(`// ── ${rel(f)}`); push(read(f), rel(f)); }
  push('return O;\n}');
  for (const c of comps) {
    push(`\n/* ═══════════ component: ${c.name} ═══════════ */\n;(function () {\ntry {`);
    for (const f of c.js) { push(`// ── ${rel(f)}`); push(read(f), rel(f)); }
    push(`} catch (err) { console.error('[Orion] component "${c.name}" failed to load:', err); }\n})();`);
  }
  for (const f of filesIn(path.join(SRC, 'i18n'), '.js')) {
    if (locales && !locales.includes(path.basename(f, '.js'))) continue;   // English lives in the components themselves
    push(`// ── ${rel(f)}`); push(read(f), rel(f));
  }
  push('O._boot();\nreturn O;');

  const umdHead = `${banner}\n(function (root, factory) {\n  if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = factory();\n  else if (typeof define === 'function' && define.amd) define([], factory);\n  else root.Orion = factory();\n})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {\n`;
  const umd = umdHead + body + '});\n';
  const esmHead = `${banner}\nconst Orion = (function () {\n`;
  const esm = esmHead + body + '})();\nexport default Orion;\nexport { Orion };\n';
  const offset = umdHead.split('\n').length - 1;
  const lineIndex = segments.map(s => ({ file: s.file, start: s.start + offset, lines: s.lines }));
  return { umd, esm, lineIndex };
}

function syntaxCheck(comps) {
  const errors = [];
  const check = (code, file, lineOffset = 0) => {
    try { new vm.Script(code, { filename: file, lineOffset }); }
    catch (e) {
      const m = String(e.stack).match(new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':(\\d+)'));
      errors.push(`${file}${m ? ':' + m[1] : ''}  ${e.message}`);
    }
  };
  for (const f of filesIn(path.join(SRC, 'core'), '.js')) check(read(f), rel(f));
  for (const c of comps) for (const f of c.js) check('(function(){' + read(f) + '\n})', rel(f));
  for (const f of filesIn(path.join(SRC, 'i18n'), '.js')) check(read(f), rel(f));
  return errors;
}

let esbuild = null;
try { esbuild = await import('esbuild'); } catch { /* optional */ }

async function build() {
  const t0 = Date.now();
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  const comps = discoverComponents();
  const synErr = syntaxCheck(comps);
  if (synErr.length) {
    console.error('\n✖ Syntax errors:\n  ' + synErr.join('\n  '));
    return false;
  }
  const { reboot, main } = buildCSS(comps);
  const cssMin = minifyCSS(main), rebootMin = minifyCSS(reboot);
  const { umd, esm, lineIndex } = buildJS(comps, cssMin, rebootMin, pkg.version, LOCALES);
  try { new vm.Script(umd, { filename: 'orion.js' }); }
  catch (e) { console.error('✖ Bundle failed to parse:', e.message); return false; }

  fs.mkdirSync(OUT, { recursive: true });
  const write = (name, data) => fs.writeFileSync(path.join(OUT, name), data);
  write('orion.js', umd);
  write('orion.esm.js', esm);
  write('orion.js.lines.json', JSON.stringify(lineIndex));
  const fullCSS = `/*! Orion Admin v${pkg.version} | MIT License */\n` + reboot + '\n' + main;
  write('orion.css', fullCSS);
  write('orion.min.css', `/*! Orion Admin v${pkg.version} | MIT */` + rebootMin + cssMin);
  // TypeScript: types/orion-core.d.ts + types/components/*.d.ts + types/zz-globals.d.ts -> one declaration file
  const tdir = path.join(ROOT, 'types');
  if (fs.existsSync(tdir)) {
    const parts = [...filesIn(tdir, '.d.ts').filter(f => !/zz-/.test(f)), ...filesIn(path.join(tdir, 'components'), '.d.ts'), ...filesIn(tdir, '.d.ts').filter(f => /zz-/.test(f))];
    write('orion.d.ts', `/*! Orion Admin v${pkg.version} | MIT — TypeScript declarations */\n` + parts.map(f => `// ── ${rel(f)}\n` + read(f)).join('\n'));
  }

  if (esbuild && !args['no-min']) {
    try {
      const opts = { minify: true, target: 'es2020', legalComments: 'inline', charset: 'utf8' };
      write('orion.min.js', (await esbuild.transform(umd, opts)).code);
      write('orion.esm.min.js', (await esbuild.transform(esm, { ...opts, format: 'esm' })).code);
    } catch (e) { console.error('✖ Minify failed:', e.message); return false; }
  }

  const size = f => { const p = path.join(OUT, f); if (!fs.existsSync(p)) return '-'; const b = fs.readFileSync(p); return `${kb(b.length)} (gzip ${kb(zlib.gzipSync(b).length)})`; };
  const isFullDist = !ONLY && OUT === path.join(ROOT, 'dist');

  // A full dist build also emits the smaller "lite" bundle (the most used components).
  if (isFullDist && !args['no-lite']) {
    const liteNames = new Set(PRESETS.lite);
    const liteComps = comps.filter(c => liteNames.has(c.name));
    const lcss = buildCSS(liteComps);
    const lite = buildJS(liteComps, minifyCSS(lcss.main), minifyCSS(lcss.reboot), pkg.version, []);   // English only: packs are ~1 MB
    write('orion.lite.js', lite.umd);
    write('orion.lite.esm.js', lite.esm);
    write('orion.lite.js.lines.json', JSON.stringify(lite.lineIndex));
    if (esbuild && !args['no-min']) write('orion.lite.min.js', (await esbuild.transform(lite.umd, { minify: true, target: 'es2020', legalComments: 'inline', charset: 'utf8' })).code);
    log(`  orion.lite.js  ${size('orion.lite.js')} · min ${size('orion.lite.min.js')} (${liteComps.length}/${comps.length} components)`);
  }

  // Standalone locale packs (for the lite bundle and --locales=none builds): <script src="dist/locales/ms.js"> after orion.js.
  if (isFullDist) {
    fs.mkdirSync(path.join(OUT, 'locales'), { recursive: true });
    for (const code of LOCALE_FILES) {
      const src = read(path.join(SRC, 'i18n', code + '.js'));
      const pack = `/*! Orion Admin v${pkg.version} — locale pack "${code}" | MIT License */\n(function (O) {\n  if (!O || !O.i18n) { console.error('[Orion] locales/${code}.js must be loaded after orion.js'); return; }\n${src}\n})(typeof Orion !== 'undefined' ? Orion : globalThis.Orion);\n`;
      write(`locales/${code}.js`, pack);
      if (esbuild && !args['no-min']) write(`locales/${code}.min.js`, (await esbuild.transform(pack, { minify: true, target: 'es2020', charset: 'utf8' })).code);
    }
    log(`  locales/       ${LOCALE_FILES.length} standalone packs (${LOCALE_FILES.join(', ')})`);
    try { buildDocsNav(ROOT); } catch (e) { console.warn('docs nav:', e.message); }
  }

  log(`\n✔ Orion Admin v${pkg.version}  ${comps.length} components  ${Date.now() - t0} ms  -> ${rel(OUT) || '.'}`);
  log(`  orion.js       ${size('orion.js')}`);
  if (fs.existsSync(path.join(OUT, 'orion.min.js'))) log(`  orion.min.js   ${size('orion.min.js')}`);
  log(`  orion.css      ${size('orion.css')}`);
  if (args.sizes) {
    const rows = comps.map(c => {
      const js = c.js.reduce((s, f) => s + fs.statSync(f).size, 0), css = c.css.reduce((s, f) => s + fs.statSync(f).size, 0);
      return [c.name, js, css];
    }).sort((a, b) => (b[1] + b[2]) - (a[1] + a[2]));
    log('\n  component            js        css');
    rows.forEach(([n, j, c]) => log(`  ${n.padEnd(20)} ${kb(j).padStart(9)} ${kb(c).padStart(9)}`));
  }
  return true;
}

const ok = await build();
if (args.watch) {
  log('\n👀 watching src/ ...');
  let timer = null;
  fs.watch(SRC, { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(() => build().catch(e => console.error(e)), 150); });
} else if (!ok) process.exit(1);
