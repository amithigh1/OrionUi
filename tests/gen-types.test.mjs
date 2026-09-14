#!/usr/bin/env node
/**
 * Unit test for the source scanners in build/gen-types.mjs. Every case here is a pattern that once produced an
 * EMPTY element interface in dist/orion.d.ts without any warning (see STATUS.md, "Fixed in the latest session").
 *   node tests/gen-types.test.mjs
 */
import { stripComments, block, parseProps, parseMethods } from '../build/gen-types.mjs';

const SRC = `
// This comment isn't a string, and neither is /* it's */ this one
class OGenTest extends OElement {
  static props = { label: String, count: { type: Number, default: 1 }, items: Array, sep: { type: String, default: '\\\\' }, re: { type: String, default: 'a/b' } };
  /** the parser shouldn't stop here */
  render() { return \`<b>\${this.items.map(i => \`<i>\${i.label ? \`\${i.label}\` : "it's"}</i>\`).join('')}</b>\`; }
  refresh() { const r = /['"]/g; const half = this.count / 2; return String(half).replace(r, ''); }
  open() { return "it's open"; }
  _private() { return 'skipped by convention? no — parseMethods only skips lifecycle names'; }
  close() { const url = 'http://example.com/x'; return url.split('/').length; }
}
define('o-gen-test', OGenTest);
`;

let failed = 0;
const check = (name, ok, info) => { console.log(`${ok ? '✔' : '✖'} ${name}${ok ? '' : '  ' + (info ?? '')}`); if (!ok) failed++; };

const all = stripComments(SRC);
check('stripping keeps the line count', all.split('\n').length === SRC.split('\n').length, `${all.split('\n').length} vs ${SRC.split('\n').length}`);
check('line comment removed', !all.includes("isn't a string"));
check('block comment blanked', !all.includes("shouldn't stop"));
check('template literals blanked (nested)', !all.includes('<b>') && !all.includes("it's\"}"));
check('regex literal blanked', !all.includes("/['\"]/g"));
check('division kept', all.includes('this.count / 2'));
check('URL string kept intact', all.includes("'http://example.com/x'"));

const ci = all.search(/class\s+OGenTest\s+extends\s+OElement\s*\{/);
check('class header found', ci >= 0);
const body = block(all, all.indexOf('{', ci));
check('class body extracted', body.length > 0 && body.trim().endsWith('}'), `length ${body.length}`);

const props = parseProps(body);
const propNames = props.map(p => p.name).join(',');
check('props parsed', propNames === 'label,count,items,sep,re', propNames);
check('prop types mapped', props.find(p => p.name === 'count')?.ts === 'number' && props.find(p => p.name === 'items')?.ts === 'any[]');

const methods = parseMethods(body);
check('public methods parsed (render excluded)', methods.join(',') === 'refresh,open,_private,close' || methods.join(',') === 'refresh,open,close', methods.join(','));

console.log(failed ? `\n${failed} check(s) failed` : '\nall gen-types scanner checks passed');
process.exit(failed ? 1 : 0);
