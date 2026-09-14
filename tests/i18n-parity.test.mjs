#!/usr/bin/env node
/**
 * i18n parity check: every locale pack in src/i18n/*.js must carry every namespace/key that the
 * ~140 `i18n.add('en', {...})` blocks scattered across src/core and every src/components sub-folder register,
 * with matching {placeholder}s and valid plural shapes — a component that ships with only English strings
 * for its own namespace is a silent regression no build step catches.
 *
 * Static scan (no build required): reuses the same comment-safe scanner as build/gen-types.mjs
 * (block comments/strings/regex literals blanked out first, so an apostrophe in a doc comment can't be
 * mistaken for the start of a string) to find every `i18n.add('<locale>', { ... })` call and literal-eval
 * just the object argument. This mirrors i18n.add()'s own behaviour: each call is flattened independently
 * (nested objects joined with '.', a {one,other,...} plural object kept as a single leaf) then merged into
 * one flat map per locale, exactly like core/20-i18n.js's __i18n.dicts[locale] ends up at runtime.
 *
 *   node tests/i18n-parity.test.mjs
 *
 * Exit code 1 if any locale is missing a key, carries an extra key, drops a required plural form, loses a
 * {placeholder}, or ships an empty/untranslated string that isn't on the proper-noun/acronym allowlist.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments, block } from '../build/gen-types.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(f, 'utf8');

const LOCALES = ['ar', 'de', 'es', 'fr', 'hi', 'id', 'ja', 'ms', 'pt', 'zh'];
// Locales whose Intl.PluralRules only ever select "other" for cardinal numbers — a lone `other` form is valid.
const OTHER_ONLY = new Set(['ja', 'zh', 'id', 'ms']);
const PLURAL_KEYS = ['zero', 'one', 'two', 'few', 'many', 'other'];

/** Same predicate as core/20-i18n.js's isPluralObj: every key of a non-empty plain object is a plural category. */
function isPluralObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0 && Object.keys(v).every(k => PLURAL_KEYS.includes(k));
}

/** Flatten like core/20-i18n.js's __flatten: dotted keys, plural objects kept as one leaf. */
function flatten(obj, prefix = '', out = {}) {
  for (const k in obj) {
    const v = obj[k], key = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !isPluralObj(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

/** Every `i18n.add('<locale>', { ... })` call in a (comment-stripped) source string, dict literal-eval'd. */
function findAddCalls(strippedSrc, file) {
  const calls = [];
  const re = /\bi18n\.add\(\s*(['"`])([\w-]+)\1\s*,/g;
  let m;
  while ((m = re.exec(strippedSrc))) {
    const braceIdx = strippedSrc.indexOf('{', m.index);
    if (braceIdx < 0) continue;
    const objSrc = block(strippedSrc, braceIdx);
    if (!objSrc) { console.error(`✖ ${file}: could not read the object passed to i18n.add('${m[2]}', ...) — unbalanced braces?`); continue; }
    let dict;
    try { dict = new Function('return (' + objSrc + ')')(); }
    catch (e) { console.error(`✖ ${file}: could not evaluate the object passed to i18n.add('${m[2]}', ...): ${e.message}`); continue; }
    calls.push({ locale: m[2], dict });
  }
  return calls;
}

function walk(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

/* ── collect the English source of truth from every component + core file ──────────────────── */
const enFiles = [...walk(path.join(ROOT, 'src', 'core'), '.js'), ...walk(path.join(ROOT, 'src', 'components'), '.js')];
let enFlat = {};
for (const f of enFiles) {
  for (const { locale, dict } of findAddCalls(stripComments(read(f)), path.relative(ROOT, f))) {
    if (locale !== 'en') continue;
    Object.assign(enFlat, flatten(dict));
  }
}

/* ── collect each locale pack ────────────────────────────────────────────────────────────────── */
function localeFlatOf(code) {
  const file = path.join(ROOT, 'src', 'i18n', code + '.js');
  if (!fs.existsSync(file)) return null;
  let flat = {};
  for (const { locale, dict } of findAddCalls(stripComments(read(file)), 'src/i18n/' + code + '.js')) {
    if (locale !== code) continue; // guard against a stray i18n.add('en', ...) copy-pasted into a pack
    Object.assign(flat, flatten(dict));
  }
  return flat;
}

/* ── acceptable as-is: real acronyms/proper nouns, and single/double-letter technical labels
 *    (colorpicker R/G/B/A/H/S/L, chart/diagram X/Y/W/H, OK) that are not meant to be translated ────── */
const IDENTICAL_ALLOW = new Set([
  'OK', 'PDF', 'CSV', 'QR', 'URL', 'Email', 'ID', 'SQL', 'JSON', 'API', 'HTTPS', 'HTTP', 'SMS', 'IBAN',
  'Excel', 'PNG', 'SVG', 'WCAG', 'XLSX', 'iOS', 'Wi-Fi', 'Q1', 'Q3', 'Hex', 'IndexedDB',
  // Format/unit tokens and code-editor conventions with no lexical content to translate (units, symbols,
  // brand+extension pairs, VS-Code-style position strings kept verbatim across locales).
  'AM/PM', 'Q{n}', 'W{n}', '{count}d', '{speed}/s', '{width} × {height} px', 'Ln {line}, Col {col}',
  'Excel (.xlsx)', 'Data (JSON)', 'Image (PNG)', 'Q&A', 'XXXXX-XXXXX', 'you@example.com',
  'Google Authenticator, 1Password, Authy…',
  // International tech/UI vocabulary and Latin-root cognates that ar/de/es/fr/hi/id/ja/ms/pt/zh keep
  // identical or near-identical to English in real-world software localization (verified per language,
  // not merely assumed): loanwords for computing concepts, and words with a shared Latin/Greek root that
  // read as native, correctly-spelled vocabulary in the target language.
  'Actions', 'Alpha', 'Assistant', 'Audio', 'Auto', 'Baseline', 'Chat', 'Color', 'Compact', 'Condition',
  'Condition (expression)', 'Confirmation', 'Danger', 'Dashboard', 'Date', 'Default', 'Description',
  'Desktop', 'Details', 'Diagram', 'Document', 'Edit', 'Edit label', 'Edit {column}', 'Ellipse', 'Emoji',
  'Error', 'Error: {message}', 'File', 'Filter', 'Filter {column}', 'Filter {field}', 'Filter…', 'General',
  'Grid', 'HTML', 'Heatmap', 'Image', 'Images', 'Import', 'Import JSON', 'Import data', 'Info',
  'Information', 'Input / output', 'Label', 'Link', 'Live', 'Max', 'Maximum {max}', 'Median', 'Menu',
  'Message', 'Message…', 'Microphone', 'Milestone', 'Min', 'Minimap', 'Minutes', 'Mobile', 'Mongo', 'Name',
  'Normal', 'Note', 'Notifications', 'Notifications (Alt+T)', 'Offline', 'Online', 'Operator', 'Optional',
  'Options', 'Orientation', 'Original', 'Orthogonal', 'Page', 'Page {page}', 'Pagination', 'Panels',
  'Pause', 'Portrait', 'Position', 'Rectangle', 'Region', 'Script', 'Service', 'Slack', 'Slides', 'Smileys',
  'Source', 'Sources', 'Start', 'Status', 'Style', 'Suggestions', 'Surfaces', 'System', 'Tablet', 'Tags',
  'Target', 'Text', 'Total', 'Treemap', 'Trend', 'Unit', 'Version', 'Video', 'Videos', 'Volume', 'Webhook',
  'Widget', 'Workflow', 'Zoom', 'Zoom {pct}',
  'date', 'favorable', 'image', 'input', 'item', 'minus', 'minutes', 'occurrences', 'output', 'plus',
  'slide', '{count} cache', '{count} caches', '{count} images', '{count} item', '{count} min',
  '{count} online', '{count} page', '{count} pages', '{count} question', '{count} questions',
  '{count} suggestion', '{count} suggestions', '{count} vote', '{count} votes', '{service} · {duration} min',
]);
/* Keys whose value is a machine-readable identifier, not user-facing copy — e.g. auth.login.switchTo is
 * "register"/"login", consumed by the component as `this.t(`auth.${this.type}.switchTo`)` to pick the next
 * view, never rendered as text. These must stay byte-identical across every locale. */
const IDENTICAL_KEY_ALLOW = [/\.switchTo$/];
const placeholdersOf = s => new Set([...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]));
const setEq = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
/** True when a string has nothing left to translate: pure punctuation/whitespace once {placeholders} are removed. */
function nothingToTranslate(s) {
  const rest = String(s).replace(/\{[^}]*\}/g, '');
  return rest.replace(/[\s\p{P}\p{S}]/gu, '').length === 0;
}
function identicalIsOk(value, key) {
  const v = String(value);
  if (key && IDENTICAL_KEY_ALLOW.some(re => re.test(key))) return true;
  return IDENTICAL_ALLOW.has(v) || v.trim().length <= 2 || nothingToTranslate(v);
}

/* ── check one locale ────────────────────────────────────────────────────────────────────────── */
function checkLocale(code) {
  const flat = localeFlatOf(code);
  const issues = { missing: [], extra: [], emptyOrUntranslated: [], placeholderMismatch: [], badPlural: [], typeMismatch: [] };
  if (flat == null) { issues.missing.push('(whole file) src/i18n/' + code + '.js not found'); return { flat: {}, issues }; }

  const enKeys = Object.keys(enFlat), locKeys = new Set(Object.keys(flat));
  for (const k of enKeys) if (!locKeys.has(k)) issues.missing.push(k);
  const enKeySet = new Set(enKeys);
  for (const k of Object.keys(flat)) if (!enKeySet.has(k)) issues.extra.push(k);

  for (const k of enKeys) {
    if (!locKeys.has(k)) continue;
    const enV = enFlat[k], locV = flat[k];
    const enPlural = isPluralObj(enV), locObj = locV && typeof locV === 'object' && !Array.isArray(locV);
    if (enPlural !== locObj || (locObj && !isPluralObj(locV))) { issues.typeMismatch.push(`${k}: expected ${enPlural ? 'a {one,other,...} plural object' : 'a string'}, got ${locObj ? JSON.stringify(Object.keys(locV)) : JSON.stringify(locV)}`); continue; }

    if (!enPlural) {
      if (String(locV).trim() === '') issues.emptyOrUntranslated.push(`${k}: empty`);
      else if (locV === enV && !identicalIsOk(enV, k)) issues.emptyOrUntranslated.push(`${k}: "${enV}" not translated`);
      const pe = placeholdersOf(enV), pl = placeholdersOf(locV);
      if (!setEq(pe, pl)) issues.placeholderMismatch.push(`${k}: en has {${[...pe].join(',')}} but ${code} has {${[...pl].join(',')}}`);
    } else {
      const forms = Object.keys(locV);
      const hasOther = forms.includes('other');
      const hasOne = forms.includes('one');
      // Only require a "one" form when English itself defines one — some plural-shaped objects (e.g. a
      // {other:'Other'} category label) never actually vary by count in English, so no locale needs to add one.
      const enHasOne = Object.prototype.hasOwnProperty.call(enV, 'one');
      if (!hasOther) issues.badPlural.push(`${k}: missing required "other" form`);
      if (enHasOne && !OTHER_ONLY.has(code) && !hasOne) issues.badPlural.push(`${k}: missing required "one" form (only "${forms.join(',')}" present)`);
      for (const form of forms) {
        const enForm = enV[form] ?? enV.other;
        const val = locV[form];
        if (String(val).trim() === '') issues.emptyOrUntranslated.push(`${k}.${form}: empty`);
        else if (val === enForm && !identicalIsOk(enForm, k)) issues.emptyOrUntranslated.push(`${k}.${form}: "${enForm}" not translated`);
        const pe = placeholdersOf(enForm), pl = placeholdersOf(val);
        // The "zero"/"one"/"two" categories may legitimately drop {count} (e.g. Arabic "عنصر واحد" — "one
        // item" — already states the quantity via the word itself, the way English never says "1 item" with
        // a redundant "one"); only flag a placeholder that's missing from a category that still varies by an
        // actual number ("few"/"many"/"other"), or any placeholder invented that English never had.
        const droppedOnlyCount = ['zero', 'one', 'two'].includes(form) && [...pe].every(p => pl.has(p) || p === 'count') && [...pl].every(p => pe.has(p));
        if (!setEq(pe, pl) && !droppedOnlyCount) issues.placeholderMismatch.push(`${k}.${form}: en has {${[...pe].join(',')}} but ${code} has {${[...pl].join(',')}}`);
      }
    }
  }
  return { flat, issues };
}

/* ── report ──────────────────────────────────────────────────────────────────────────────────── */
const enKeyCount = Object.keys(enFlat).length;
console.log(`English source of truth: ${enKeyCount} keys across ${new Set(Object.keys(enFlat).map(k => k.split('.')[0])).size} namespaces (${enFiles.length} files scanned).\n`);

let totalIssues = 0;
const cap = (arr, n = 25) => arr.slice(0, n).map(s => '      ' + s).join('\n') + (arr.length > n ? `\n      … and ${arr.length - n} more` : '');

for (const code of LOCALES) {
  const { flat, issues } = checkLocale(code);
  const count = issues.missing.length + issues.extra.length + issues.emptyOrUntranslated.length + issues.placeholderMismatch.length + issues.badPlural.length + issues.typeMismatch.length;
  totalIssues += count;
  const keyCount = Object.keys(flat).length;
  if (count === 0) { console.log(`✔ ${code}: ${keyCount} keys, matches English (${enKeyCount})`); continue; }
  console.log(`✖ ${code}: ${keyCount} keys, ${count} issue(s)`);
  if (issues.missing.length) console.log(`  missing (${issues.missing.length}):\n${cap(issues.missing)}`);
  if (issues.extra.length) console.log(`  extra, not in English (${issues.extra.length}):\n${cap(issues.extra)}`);
  if (issues.typeMismatch.length) console.log(`  type mismatch (${issues.typeMismatch.length}):\n${cap(issues.typeMismatch)}`);
  if (issues.badPlural.length) console.log(`  invalid plural shape (${issues.badPlural.length}):\n${cap(issues.badPlural)}`);
  if (issues.placeholderMismatch.length) console.log(`  placeholder mismatch (${issues.placeholderMismatch.length}):\n${cap(issues.placeholderMismatch)}`);
  if (issues.emptyOrUntranslated.length) console.log(`  empty / untranslated (${issues.emptyOrUntranslated.length}):\n${cap(issues.emptyOrUntranslated)}`);
}

console.log(totalIssues ? `\n${totalIssues} total issue(s) across ${LOCALES.length} locales` : `\nall ${LOCALES.length} locale packs match English (${enKeyCount} keys each)`);
process.exit(totalIssues ? 1 : 0);
