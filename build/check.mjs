#!/usr/bin/env node
/**
 * Headless browser checker: loads pages in Chrome/Edge through the DevTools protocol
 * (no Puppeteer/Playwright) and reports console errors, uncaught exceptions and failed requests.
 *
 *   node build/check.mjs docs/components/select.html [more pages...]
 *   node build/check.mjs --all                       every docs/templates page
 *
 * Options
 *   --bundle=path     serve this file for /dist/orion.js (test a custom build, e.g. .tmp/x/orion.js)
 *   --shots=dir       save a PNG screenshot per page (dir is created)
 *   --full            full-page screenshots (height capped at 6000px)
 *   --width=1280 --height=900
 *   --mobile          emulate a 390x844 touch phone
 *   --dark            emulate prefers-color-scheme: dark
 *   --rtl             set <html dir="rtl"> before scripts run
 *   --eval="expr"     evaluate an expression after load (promises awaited); result printed as JSON
 *   --eval=@file      same, reading the expression from a file
 *   --wait=600        extra milliseconds to wait after the load event
 *   --warn            also print console warnings
 *   --quiet           only print failures
 * Exit code 1 when any page has errors, or an --eval result is exactly false or an object with `ok: false`.
 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, ROOT } from './serve.mjs';

const argv = process.argv.slice(2);
const opt = Object.fromEntries(argv.filter(a => a.startsWith('--')).map(a => { const m = a.match(/^--([^=]+)(?:=([\s\S]*))?$/); return [m[1], m[2] ?? true]; }));
let pages = argv.filter(a => !a.startsWith('--'));
const W = +(opt.width || (opt.mobile ? 390 : 1280)), H = +(opt.height || (opt.mobile ? 844 : 900));
const WAIT = +(opt.wait ?? 600);

if (opt.all) {
  const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return e.name === 'assets' ? [] : walk(p);
    return e.name.endsWith('.html') ? [path.relative(ROOT, p).replace(/\\/g, '/')] : [];
  }) : [];
  pages = [...walk(path.join(ROOT, 'docs')), ...walk(path.join(ROOT, 'templates'))];
}
if (!pages.length) { console.log('usage: node build/check.mjs <page.html ...> | --all  (see header for options)'); process.exit(2); }

function findBrowser() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const L = process.env.LOCALAPPDATA || '';
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(L, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    try { const p = execSync(`command -v ${n}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); if (p) return p; } catch {}
  }
  throw new Error('Chrome/Edge not found. Set CHROME_PATH.');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Set(); ws.onmessage = e => this._msg(JSON.parse(e.data)); }
  static connect(url) { return new Promise((res, rej) => { const ws = new WebSocket(url); ws.onopen = () => res(new CDP(ws)); ws.onerror = rej; }); }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej, method }));
  }
  _msg(m) {
    if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.rej(new Error(p.method + ': ' + m.error.message)) : p.res(m.result); }
    else this.handlers.forEach(h => h(m));
  }
  onEvent(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
}

async function launch() {
  const exe = findBrowser();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orion-check-'));
  const proc = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--remote-debugging-port=0', `--user-data-dir=${dir}`, `--window-size=${W},${H}`, '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    const t = setTimeout(() => rej(new Error('browser did not start')), 20000);
    proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); res(m[1]); } });
    proc.on('exit', c => rej(new Error('browser exited ' + c)));
  });
  return { proc, dir, cdp: await CDP.connect(wsUrl) };
}

function loadLineIndex(bundle) {
  const f = bundle ? path.resolve(ROOT, bundle) + '.lines.json' : path.join(ROOT, 'dist', 'orion.js.lines.json');
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}
const LINES = loadLineIndex(opt.bundle);
function mapLoc(text) {
  if (!LINES) return text;
  return String(text).replace(/(?:https?:\/\/[^\s)]*\/)?orion\.js:(\d+)(?::(\d+))?/g, (m, l) => {
    const n = +l; const s = LINES.find(x => n >= x.start && n < x.start + x.lines);
    return s ? `${m} [${s.file}:${n - s.start + 1}]` : m;
  });
}

async function checkPage(cdp, base, page) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  const errors = [], warnings = [];
  let loaded; const loadP = new Promise(r => (loaded = r));
  const off = cdp.onEvent(m => {
    if (m.sessionId !== sessionId) return;
    const p = m.params;
    if (m.method === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails; const desc = d.exception?.description || d.text;
      errors.push('[exception] ' + mapLoc(desc + (d.url ? `  @ ${d.url}:${d.lineNumber + 1}` : '')));
    } else if (m.method === 'Runtime.consoleAPICalled') {
      const text = p.args.map(a => a.value !== undefined ? (typeof a.value === 'object' ? JSON.stringify(a.value) : a.value) : (a.description || a.type)).join(' ');
      const frame = p.stackTrace?.callFrames?.[0];
      const loc = frame ? `  @ ${frame.url.split('/').pop()}:${frame.lineNumber + 1}` : '';
      if (p.type === 'error' || p.type === 'assert') errors.push('[console.error] ' + mapLoc(text + loc));
      else if (p.type === 'warning') warnings.push('[warn] ' + mapLoc(text + loc));
      else if (opt.log) warnings.push('[log] ' + text);
    } else if (m.method === 'Log.entryAdded') {
      const e = p.entry;
      if (e.level === 'error' && !/favicon\.ico/.test(e.url || '')) errors.push(`[${e.source}] ${e.text}${e.url ? ' ' + e.url : ''}`);
    } else if (m.method === 'Network.responseReceived') {
      const r = p.response;
      if (r.status >= 400 && !/favicon\.ico/.test(r.url) && r.url.startsWith(base)) errors.push(`[http ${r.status}] ${r.url.replace(base, '')}`);
    } else if (m.method === 'Page.loadEventFired') loaded();
  });
  await Promise.all([S('Runtime.enable'), S('Log.enable'), S('Page.enable'), S('Network.enable')]);
  // screenWidth/Height + positionX/Y keep window.innerWidth in sync with the layout viewport
  // (without them Chrome scales the emulated page to the real window and innerWidth lies).
  await S('Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: 1, mobile: !!opt.mobile,
    screenWidth: W, screenHeight: H, positionX: 0, positionY: 0, dontSetVisibleSize: false,
  });
  if (opt.mobile) await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (opt.dark) await S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  if (opt.rtl) await S('Page.addScriptToEvaluateOnNewDocument', { source: '(() => { const set = () => { if (document.documentElement) { document.documentElement.setAttribute("dir", "rtl"); return true; } }; if (!set()) new MutationObserver((m, o) => { if (set()) o.disconnect(); }).observe(document, { childList: true }); })()' });
  const url = /^https?:/.test(page) ? page : `${base}/${page.replace(/\\/g, '/').replace(/^\.?\//, '')}`;
  await S('Page.navigate', { url });
  await Promise.race([loadP, new Promise(r => setTimeout(r, 20000))]);
  await new Promise(r => setTimeout(r, WAIT));
  let evalResult;
  if (typeof opt.eval === 'string') {
    try {
      // --eval=@path reads the expression from a file (no shell quoting for longer interaction scripts)
      const expression = opt.eval.startsWith('@') ? fs.readFileSync(path.resolve(ROOT, opt.eval.slice(1)), 'utf8') : opt.eval;
      const r = await S('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 30000 });
      if (r.exceptionDetails) errors.push('[eval] ' + mapLoc(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      else evalResult = r.result.value;
    } catch (e) { errors.push('[eval] ' + e.message); }
    await new Promise(r => setTimeout(r, 150));
  }
  if (opt.shots) {
    fs.mkdirSync(path.resolve(ROOT, opt.shots), { recursive: true });
    let clip;
    if (opt.full) {
      const m = await S('Page.getLayoutMetrics');
      const h = Math.min(6000, Math.ceil(m.cssContentSize.height));
      await S('Emulation.setDeviceMetricsOverride', { width: W, height: h, deviceScaleFactor: 1, mobile: !!opt.mobile });
      await new Promise(r => setTimeout(r, 250));
      clip = { x: 0, y: 0, width: W, height: h, scale: 1 };
    }
    const shot = await S('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) });
    const name = page.replace(/^https?:\/\/[^/]+\//, '').replace(/[\\/]/g, '_').replace(/\.html$/, '') + (opt.dark ? '.dark' : '') + (opt.rtl ? '.rtl' : '') + (opt.mobile ? '.mobile' : '') + '.png';
    const file = path.resolve(ROOT, opt.shots, name);
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    evalResult = evalResult === undefined ? undefined : evalResult;
    warnings.unshift('[screenshot] ' + path.relative(ROOT, file));
  }
  off();
  await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  return { page, errors, warnings, evalResult };
}

const { server, url: base } = await createServer({ bundle: opt.bundle || null });
let browser;
let failed = 0;
try {
  browser = await launch();
  for (const p of pages) {
    const r = await checkPage(browser.cdp, base, p);
    // An --eval script fails the page by returning `false`, or an object whose `ok` is false (the tests/evals convention).
    const evalFailed = r.evalResult === false || (r.evalResult && typeof r.evalResult === 'object' && r.evalResult.ok === false);
    const bad = r.errors.length > 0 || evalFailed;
    if (bad) failed++;
    if (bad || !opt.quiet) {
      console.log(`${bad ? '✖' : '✔'} ${p}${r.errors.length ? `  (${r.errors.length} error${r.errors.length > 1 ? 's' : ''})` : ''}`);
      r.errors.forEach(e => console.log('    ' + e));
      r.warnings.filter(w => opt.warn || w.startsWith('[screenshot]') || opt.log).forEach(w => console.log('    ' + w));
      if (r.evalResult !== undefined) console.log('    [eval] ' + JSON.stringify(r.evalResult, null, 0).slice(0, 4000));
    }
  }
} catch (e) {
  console.error('check failed:', e.message); failed++;
} finally {
  try { await browser?.cdp.send('Browser.close'); } catch {}
  try { browser?.proc.kill(); } catch {}
  server.close();
  setTimeout(() => { try { fs.rmSync(browser?.dir, { recursive: true, force: true }); } catch {} }, 300);
}
console.log(`\n${pages.length - failed}/${pages.length} pages clean`);
setTimeout(() => process.exit(failed ? 1 : 0), 400);
