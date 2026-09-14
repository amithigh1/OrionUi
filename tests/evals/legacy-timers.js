/* legacy-timers.js — salvaged from .tmp/timers-test.js (docs/components/timers.html).
 * <o-stopwatch>: start/lap/lap/pause freezes elapsed, reset; Space/L/R keyboard bindings.
 * <o-countdown>: o-complete fires once the target time is reached, with a Date detail.
 *
 * NOTE ON CLASSIFICATION: the brief's own examples call ".tmp/timers-test.js" a Node-side helper to
 * convert to a plain-node test (like .tmp/rrule-test.js). That does not hold here: <o-stopwatch>/
 * <o-countdown> are real custom elements whose setup() builds live DOM nodes via `h()` and reacts to
 * clicks/keydowns/requestAnimationFrame. Orion's Node-safe fallback makes OElement extend a bare
 * `class {}` when there is no real `document` (see src/core/40-component.js's `HTMLBase`), so under
 * plain Node these methods throw immediately (verified: `new Orion.Stopwatch().start()` needs
 * `this.timeEl`, which only exists after a real connectedCallback/setup() ran in a browser). This is
 * therefore kept as a genuine browser interaction test instead. (Orion.rrule has no such DOM dependency
 * and WAS converted — see tests/legacy-rrule.test.cjs.)
 */
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};

  {
    const sw = document.getElementById('sw1');
    sw.start();
    await sleep(300);
    sw.lap();
    await sleep(300);
    sw.lap();
    sw.pause();
    const laps = sw.getLaps();
    const elapsedAfterPause = sw.getElapsed();
    await sleep(200);
    const elapsedStillSame = sw.getElapsed() === elapsedAfterPause;
    sw.reset();
    out.stopwatch = { lapCount: laps.length, lapsRoughlyOrdered: laps[0].total < laps[1].total, elapsedStillSame, afterReset: sw.getElapsed() };
  }

  {
    const sw = document.getElementById('sw1');
    sw.focus();
    const fire = (key) => sw.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    fire(' ');
    await sleep(150);
    fire('l');
    await sleep(150);
    fire(' ');
    const laps = sw.getLaps();
    fire('r');
    await sleep(20);
    out.stopwatchKeyboard = { running: sw.classList.contains('is-running'), lapCount: laps.length, afterReset: sw.getElapsed() };
  }

  {
    const cd = document.getElementById('cd-short');
    let completed = false, detail = null;
    cd.addEventListener('o-complete', e => { completed = true; detail = { to: e.detail.to instanceof Date }; }, { once: true });
    cd.to = new Date(Date.now() + 400).toISOString();
    await sleep(900);
    out.countdown = { completed, detail, remaining: cd.getRemaining() };
  }

  const ok = out.stopwatch.lapCount === 2 && out.stopwatch.lapsRoughlyOrdered && out.stopwatch.elapsedStillSame && out.stopwatch.afterReset === 0
    && out.stopwatchKeyboard.lapCount === 1 && out.stopwatchKeyboard.running === false && out.stopwatchKeyboard.afterReset === 0
    && out.countdown.completed === true && out.countdown.detail.to === true;
  return { ok, ...out };
})()
