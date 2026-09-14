(async () => {
  const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  // <o-countup>'s host textContent concatenates the animated bdi AND the always-current-target
  // .o-sr-only span, so it is not useful for reading "what's on screen right now" — read the
  // visible node directly, same as a sighted user would.
  const visText = el => el.querySelector('bdi').textContent.trim();

  /* ================= <o-countup> reaches its target (real animation, motion allowed) ================= */
  const cu = document.getElementById('cu-demo'); // to="9482" duration="1600", starts un-animated until visible
  cu.scrollIntoView({ block: 'center' });
  await sleep(250); // let the IntersectionObserver (threshold .2) fire and the tween begin
  out.startedAnimating = visText(cu) !== Orion.countUp.format(9482, {});
  await sleep(1900); // > duration(1600) + a margin
  out.reachedTargetText = visText(cu) === Orion.countUp.format(9482, {});
  out.reachedTargetValue = /9,?482/.test(visText(cu));

  let endDetail = null;
  cu.addEventListener('o-countup-end', e => (endDetail = e.detail), { once: true });
  const p = cu.start(0); // re-animate from 0 -> 9482 again, on demand
  out.startPromiseIsPromise = typeof p.then === 'function';
  await sleep(200);
  out.midAnimationIsBetween = (() => { const n = Orion.format.parseNumber(visText(cu)); return n != null && n >= 0 && n < 9482; })();
  await p;
  out.endEventFired = !!endDetail && endDetail.value === 9482;
  out.textAfterPromiseSettles = visText(cu) === Orion.countUp.format(9482, {});

  /* ================= reduced motion: <o-countup>, Orion.countUp() and <o-stat countup> all jump ================= */
  document.documentElement.classList.add('o-motion-reduce');
  out.reducedMotionClassApplied = document.documentElement.classList.contains('o-motion-reduce');

  cu.to = 555;
  const rmPromise = cu.start(0);
  // no waiting at all: reducedMotion() must skip the rAF loop entirely and land on the target synchronously
  out.jumpedImmediatelyNoWait = visText(cu) === Orion.countUp.format(555, {});
  await rmPromise;
  out.settledAtTargetUnderReducedMotion = visText(cu) === Orion.countUp.format(555, {});

  const target = document.createElement('span');
  target.id = 'cu-imperative-rm';
  document.body.appendChild(target);
  const { promise } = Orion.countUp(target, 4321, { from: 0, duration: 1500 });
  out.imperativeCountUpJumpsUnderReducedMotion = target.textContent === Orion.countUp.format(4321, {});
  await promise;
  document.body.removeChild(target);

  // <o-stat countup> gates its first animation on IntersectionObserver visibility, so pin it
  // on-screen (position:fixed) regardless of where the docs page happens to be scrolled.
  const rmStat = document.createElement('o-stat');
  rmStat.style.cssText = 'position:fixed;top:0;inset-inline-start:0;z-index:99999;background:#fff';
  rmStat.label = 'RM stat'; rmStat.countup = true; rmStat.value = 777; rmStat.duration = 1500;
  document.body.appendChild(rmStat);
  await raf(); await sleep(80);
  out.statCountupJumpsUnderReducedMotion = visText(rmStat.querySelector('.o-stat-value')) === Orion.countUp.format(777, {});
  document.body.removeChild(rmStat);

  document.documentElement.classList.remove('o-motion-reduce');

  out.ok = out.startedAnimating && out.reachedTargetText && out.reachedTargetValue && out.startPromiseIsPromise
    && out.midAnimationIsBetween && out.endEventFired && out.textAfterPromiseSettles && out.reducedMotionClassApplied
    && out.jumpedImmediatelyNoWait && out.settledAtTargetUnderReducedMotion
    && out.imperativeCountUpJumpsUnderReducedMotion && out.statCountupJumpsUnderReducedMotion;
  return out;
})()
