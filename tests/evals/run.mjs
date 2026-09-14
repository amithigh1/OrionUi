#!/usr/bin/env node
/**
 * Runs every interaction script listed in tests/evals/manifest.json through build/check.mjs.
 *   node tests/evals/run.mjs                         # against dist/orion.js
 *   node tests/evals/run.mjs --bundle=.tmp/x/orion.js
 *   node tests/evals/run.mjs --only=products,chat    # by script name (without .js)
 * A script is an async IIFE that drives the page and returns an object with an `ok` boolean;
 * check.mjs exits 1 when `ok` is false, the page logs an error, or the script throws.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const argv = process.argv.slice(2);
const bundle = argv.find(a => a.startsWith('--bundle='));
const only = (argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));

let failed = 0, ran = 0;
for (const entry of manifest) {
  const name = entry.eval.replace(/\.js$/, '');
  if (only.length && !only.includes(name)) continue;
  ran++;
  console.log(`\n▶ ${name} — ${entry.about}`);
  // entry.flags: extra check.mjs switches a script needs, e.g. ["--rtl"] or ["--mobile"]
  const args = ['build/check.mjs', entry.page, `--eval=@tests/evals/${entry.eval}`, ...(entry.flags || []), ...(bundle ? [bundle] : [])];
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(`\n${ran - failed}/${ran} interaction scripts passed`);
process.exit(failed ? 1 : 0);
