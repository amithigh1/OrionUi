/* Bundles the framework test apps and writes their HTML pages to ./out (uses ../../dist/orion.js). */
import * as esbuild from 'esbuild';
import fs from 'node:fs';

const define = { 'process.env.NODE_ENV': '"development"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false', ngDevMode: 'true' };
const common = { bundle: true, logLevel: 'warning', define };
fs.mkdirSync('out', { recursive: true });
await esbuild.build({ ...common, format: 'iife', entryPoints: ['react-app.js'], outfile: 'out/react19.js' });
await esbuild.build({ ...common, format: 'iife', entryPoints: ['react-app.js'], outfile: 'out/react18.js', alias: { react: 'react18', 'react-dom': 'react-dom18' } });
await esbuild.build({ ...common, format: 'iife', entryPoints: ['vue-app.js'], outfile: 'out/vue.js' });
await esbuild.build({ ...common, format: 'esm', entryPoints: ['angular-app.ts'], outfile: 'out/angular.js', tsconfig: 'tsconfig.json' });

// Each page reports failures via console.error (so check.mjs fails) and returns the result map.
const page = (js, title, mod) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<script>const _w = console.warn; console.warn = (...a) => { if (String(a[0]).includes('Failed to resolve component')) window.__vueWarn = a[0]; _w(...a); };</script>
<script src="/dist/orion.js"></script></head><body><div id="root"></div><app-root></app-root>
<script ${mod ? 'type="module" ' : ''}src="${js}"></script>
<script>addEventListener('load', () => { const run = window.runTest; if (!run) return; window.runTest = async () => { const r = await run(); const bad = Object.entries(r).filter(([, v]) => v !== true).map(([k]) => k); if (bad.length) console.error('${title} failed: ' + bad.join(', ')); return r; }; });</script>
</body></html>`;
fs.writeFileSync('out/react19.html', page('react19.js', 'React 19'));
fs.writeFileSync('out/react18.html', page('react18.js', 'React 18'));
fs.writeFileSync('out/vue.html', page('vue.js', 'Vue 3'));
fs.writeFileSync('out/angular.html', page('angular.js', 'Angular', true));
console.log('framework test pages built in tests/frameworks/out');
