/* Minimal in-browser test harness (no dependencies).
 * test(name, fn) registers; run() executes sequentially, renders results and
 * reports failures through console.error so build/check.mjs exits non-zero. */
(function () {
  const tests = [];
  window.assert = function (cond, msg) { if (!cond) throw new Error('Assertion failed' + (msg ? ': ' + msg : '')); };
  window.test = function (name, fn) { tests.push({ name, fn }); };
  window.run = async function () {
    if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
    const out = document.getElementById('out') || document.body;
    let pass = 0, fail = 0;
    for (const t of tests) {
      try { await t.fn(); pass++; out.insertAdjacentHTML('beforeend', `<div class="o-alert o-alert-success" style="margin:0">✔ ${t.name}</div>`); }
      catch (e) { fail++; console.error(`✖ ${t.name}: ${e.message}`); out.insertAdjacentHTML('beforeend', `<div class="o-alert o-alert-danger" style="margin:0">✖ ${t.name}: ${String(e.message).replace(/</g, '&lt;')}</div>`); }
    }
    window.__results = { pass, fail, total: tests.length };
    document.title = (fail ? '✖ ' : '✔ ') + document.title;
    return window.__results;
  };
})();
